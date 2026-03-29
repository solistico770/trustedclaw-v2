# TrustedClaw — Test Report
**Date:** 2026-03-30
**Version:** v3 · f367c73
**Test duration:** ~10 minutes

---

## Test Setup

6 messages sent across 5 different gates:

| # | Gate | Sender | Content | Expected |
|---|---|---|---|---|
| 1 | WhatsApp | Sarah Levi | ABC Corp 50k NIS overdue | Urgent financial, U=1 I=1 |
| 2 | Telegram | Mom | Call home, Friday dinner | Personal, low urgency |
| 3 | Slack | Mike from Support | TechStart dashboard down | Customer service, urgent |
| 4 | Email | Newsletter Bot | Weekly digest | Routine spam, U=5 I=5 |
| 5 | WhatsApp | Sarah Levi | Follow-up: ABC Corp CFO says will pay | SHOULD MERGE into #1 |
| 6 | Phone | עו״ד רונן | הפרת חוזה גלובל טק, סיכון משפטי | Legal, U=1 I=1 |

Plus 2 pre-existing cases and 1 user message (invoice paid confirmation).

---

## Results

### What WORKS ✓

| Feature | Status | Evidence |
|---|---|---|
| **Message ingestion** | ✓ | All 6 messages saved, cases created as "open" (not pending) |
| **Agent scanning** | ✓ | All cases scanned successfully, no failures |
| **Urgency/Importance classification** | ✓ | Financial → U=1 I=1, Personal → U=4 I=4, Newsletter → U=5 I=5, Legal → U=1 I=1 |
| **Title generation** | ✓ | Good titles: "Overdue Invoice 50,000 NIS from ABC Corp", "TechStart Ltd — Dashboard Down" |
| **Status assignment** | ✓ | Urgent → action_needed, Routine → open |
| **Skill pulling** | ✓ | Agent pulled "Handle Financial Matter", "Handle Customer Service", "Handle Personal Request" when appropriate |
| **Multi-gate support** | ✓ | WhatsApp, Telegram, Slack, Email, Phone all work |
| **Hebrew support** | ✓ | Legal case in Hebrew classified correctly U=1 I=1 |
| **Closed cases** | ✓ | Cases #1, #3 properly closed with closed_at, next_scan_at=null |
| **Scan scheduling** | ✓ | Closed cases have null next_scan, won't be rescanned |
| **Entity creation** | ✓ | Entities created: Sarah Levi, ABC Corp, Mom, Dad, TechStart, עו״ד רונן, גלובל טק |

---

### What FAILS ✗

| Bug | Severity | Description |
|---|---|---|
| **Merge not working** | HIGH | MSG5 (Sarah follow-up about ABC Corp) was NOT merged into case #4 (same topic, same sender). Created as separate case #8 with NO title, NO urgency change. The agent scanned it twice and still didn't merge. |
| **Entity duplication** | MEDIUM | "גלובל טק" appears 2 times, "עו״ד רונן" appears 2 times in entities table. The ilike check doesn't catch Hebrew exact matches or the agent proposes with slightly different names. |
| **Untitled cases after scan** | HIGH | Cases #2 and #8 were scanned (2 scans each!) but still have NO title, NO summary, urgency/importance stuck at defaults (3/3). The agent scan returned "success" but the set_title/set_summary commands apparently weren't executed or weren't saved. |
| **Invoice-paid case not de-escalated** | HIGH | Case #2 contains "ברוך השם החשבונית שולמה הכל טוב ותודה" (invoice paid, all good, thanks!) but after 2 scans it's still open U=3 I=3 with no title. Should have been addressed/closed or at least U=5 I=5. |
| **No merge detection on follow-up** | HIGH | Agent has "Case Merge Detection" as auto-attach skill but didn't use it. MSG5 is clearly a follow-up to MSG1 (same sender "Sarah Levi", same topic "ABC Corp payment") but no merge happened. |
| **"Dashboard" and "Enterprise plan" as entities** | LOW | Agent created "dashboard" and "Enterprise plan" as entities. These are not real-world entities — the Entity Attachment skill says to avoid generic words, but agent ignored it. |

---

### Root Cause Analysis

**1. Merge failure:** The agent receives a list of "other open cases" in context but the case titles are shown as `Case XXXXXXXX: "None"` (because untitled cases show no useful info). With no title/summary on existing cases, the agent can't determine if two cases are about the same topic.

**2. Untitled cases after scan:** Likely the agent DID return set_title commands, but there may be a command execution issue — the commands_executed log shows "ok" but the DB update might fail silently due to the case_number column (new serial column might interfere with the update query). Need to check if the `updates` object in `executeCommands` actually gets written.

**3. Entity duplication:** The agent proposes both "עו״ד רונן" AND "Attorney Ronen" (translated). The ilike check doesn't catch translations. Also proposes "גלובל טק" twice because the Hebrew+English names are different strings but refer to the same entity.

**4. No de-escalation:** The "Escalation & De-escalation" skill is PULL-only, not auto-attached. The agent doesn't pull it for positive messages because the prompt doesn't trigger it. The auto-attached "Urgency & Importance" skill should handle this but apparently doesn't react to "all good, thanks" as a signal to lower urgency.

---

## Summary

| Category | Score |
|---|---|
| Ingestion | 10/10 |
| Scanning | 8/10 (works but doesn't always update case) |
| Classification | 7/10 (new cases good, re-scan/de-escalation bad) |
| Merge | 2/10 (not working at all) |
| Entity dedup | 5/10 (works for English, fails for Hebrew/translations) |
| Skills | 6/10 (pull works, but auto-attach skills not always followed) |
| Close/Reopen | 9/10 (manual close works, agent doesn't auto-close) |

---

## Recommended Fixes (Priority Order)

1. **FIX: Case update after scan** — investigate why set_title/set_summary commands execute but DB doesn't update. Likely a Supabase update race condition or the updates object not being applied.

2. **FIX: Merge context** — include case title + first message content in the "other open cases" list so agent can actually compare topics.

3. **FIX: Entity dedup** — normalize names before comparison (trim, lowercase). Consider fuzzy matching or sending existing entity list to agent so it doesn't re-propose.

4. **FIX: De-escalation** — make "Escalation & De-escalation" auto-attached, or add de-escalation logic to the "Urgency & Importance" skill.

5. **FIX: Generic entity filtering** — add explicit blocklist in Entity Attachment skill: no "dashboard", "enterprise plan", "payment", etc.
