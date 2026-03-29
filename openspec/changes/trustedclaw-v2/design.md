## Context

TrustedClaw v2 הוא greenfield. v1 נמחק. המימוש מבוסס על Supabase + Vercel + Gemini. ההבדל המרכזי מ-v1: **הפרדה מלאה בין קליטה לחשיבה**. קליטה היא כתיבה ל-DB. חשיבה היא agent scan מתוזמן.

## Goals / Non-Goals

**Goals:**
- קליטה מכנית: הודעה → DB → Case. אפס AI. מהירה, אמינה, זולה.
- Agent scan מתוזמן: LLM רץ רק כש-scheduler מפעיל. כל run = CaseEvent מלא.
- כל Case שולט על ה-scan שלו: next_scan_at. חוסך tokens.
- Entities דורשים אישור אנושי: AI מציע, אדם מאשר.
- Context prompt ב-UI: הבעלים שולט על ההנחיות ל-agent.
- CaseEvent = audit מובנה: כל LLM call מתועד עם in/out/commands.

**Non-Goals:**
- Real-time processing של כל הודעה (v1 design — נזרק)
- EC2 / persistent connections (Phase 2)
- Financial actions (Phase 2)
- Multi-user (Phase 2)

## Decisions

### 1. Zero AI at Ingest

**נבחר:** הודעה מגיעה → INSERT ל-messages + INSERT ל-cases (status=pending). אין Gemini call. אין normalization.

**למה:** v1 צרכה 2 Gemini calls **לכל** הודעה (enrichment + classification). עם 100 הודעות ביום = 200 API calls. רוב ההודעות הן שולי — "ok", "תודה", "👍". v2 ב-scan אחד סורקת Case שלם (כולל 10 הודעות) ב-call אחד. חיסכון של 90%+ ב-tokens.

**אלטרנטיבה שנדחתה:** enrichment בסיסי ב-ingest (שפה, sentiment). נדחה כי מוסיף complexity ל-ingest path ללא ערך ברור.

---

### 2. Agent Scanner כ-Scheduler

**נבחר:** pg_cron (כל דקה) + Vercel Cron (כל 5 דקות) קוראים ל-`POST /api/agent/scan`. ה-endpoint מוצא Cases שצריך לסרוק ומריץ LLM על כל אחד.

**מנגנון:**
```sql
SELECT * FROM cases
WHERE status = 'pending'
   OR (next_scan_at IS NOT NULL AND next_scan_at <= NOW())
ORDER BY
  CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
  importance DESC,
  next_scan_at ASC
LIMIT 5
```

כל scan run מטפל בעד 5 cases (Vercel timeout 60s, כל case ~5-10s).

**למה not queue?** פשטות. pg_cron + single endpoint = אין infrastructure נוסף. אם נצטרך scale — נעבור ל-queue.

---

### 3. CaseEvent — Full LLM Audit

**נבחר:** כל Gemini call מתועד כ-CaseEvent עם 3 שדות מרכזיים:
- `in_context` — הכל שנשלח ל-LLM (prompt, messages, prior context)
- `out_raw` — התגובה המלאה מ-LLM
- `api_commands` — הפעולות שה-LLM ביקש לבצע

**למה:** debuggability מלאה. אם ה-agent עשה טעות — ניתן לשחזר בדיוק מה הוא ראה ומה הוא החליט. גם שימושי ל-learning עתידי.

---

### 4. Entity Approval Flow

**נבחר:** AI מציע entities (status=proposed). אדם מאשר (status=active) או דוחה (status=rejected) ב-UI.

**למה:** v1 יצרה entities אוטומטית ונגמר עם "חודשיים" ו-"היום" כ-entities. Entity צריך להיות דבר אמיתי שמשתמש רוצה לעקוב אחריו.

---

### 5. Case Merge Logic

**נבחר:** כש-agent סורק Case חדש (pending), הוא מקבל גם רשימה של Cases פתוחים אחרונים. אם הוא מזהה שזה אותו נושא — הוא מחזיר merge command. Case המקורי מקבל status=merged, merged_into_case_id נקבע, וה-messages שלו עוברים ל-Case היעד.

**למה:** אדם שולח 3 הודעות ב-3 דקות על אותו נושא. בלי merge, נוצרים 3 cases.

---

### 6. Context Prompt in UI

**נבחר:** הבעלים מנהל "context prompt" — טקסט חופשי שמוזרק לתחילת כל LLM call. לא טבלה ב-DB, אלא שדה בודד בטבלת `user_settings`.

**תוכן לדוגמה:**
```
אתה סוכן תפעולי שעובד עבור שי, מנהל בחברת קדבריקס.
עדיפות גבוהה: לקוחות, תשלומים, deadlines.
עדיפות נמוכה: ספאם, בוטים, ברכות.
אם מישהו מזכיר סכום כסף מעל 10,000 — סמן urgency=immediate.
```

**למה לא policy engine?** ב-v1 היה policy engine דטרמיניסטי. בפועל, שפה טבעית גמישה יותר ומאפשרת לבעלים לשנות התנהגות בשנייה.

## Risks / Trade-offs

**[Scan Latency]** Cases ב-pending ממתינים עד ל-scan הבא (~1 דקה max). לא real-time → Mitigation: pg_cron כל דקה. urgent cases מקבלים next_scan_at=now.

**[Token Cost]** scan של case עם 50 messages = prompt גדול → Mitigation: שולחים רק 20 messages אחרונים + סיכום מ-CaseEvent אחרון.

**[Merge Errors]** agent עלול למזג cases שלא צריך → Mitigation: merge הוא reversible (unmerge endpoint). History נשמר.

**[Entity Spam]** agent מציע יותר מדי entities → Mitigation: UI מראה pending entities ליד ה-case. batch approve/reject.

## Migration Plan

Greenfield. No migration needed. Deploy order:
1. Supabase project + schema
2. Vercel deployment
3. Seed: create owner user, default simulator gate, context prompt
4. Smoke test via simulator
