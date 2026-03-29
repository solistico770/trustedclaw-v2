## 1. DB + Skill Setup

- [ ] 1.1 Add `empowerment_line` text column to case_events table
- [ ] 1.2 Create "Empowerment Line" skill (AUTO) — generates empowering message after every scan
- [ ] 1.3 Add `set_empowerment_line` to AgentCommand type in gemini-agent.ts
- [ ] 1.4 Add `set_empowerment_line` handler in agent-scanner.ts executeCommands — saves to case_events.empowerment_line

## 2. Dashboard Stats API

- [ ] 2.1 Expand GET /api/cases/stats: add attention, critical, open, handled (30d), entities count, cases_scanned_today, latest_empowerment
- [ ] 2.2 Latest empowerment: query most recent case_events.empowerment_line that is not null

## 3. Interactive Dashboard UI

- [ ] 3.1 Rewrite dashboard header: 5 clickable stat cards (Attention, Critical, Open, Handled, Entities)
- [ ] 3.2 Click stat → sets filter on case list. Click again → clears filter. "Entities" navigates to /entities.
- [ ] 3.3 Empowerment line banner above stats — shows latest_empowerment from API
- [ ] 3.4 Sub-header: last scan time, cases scanned today, next scan countdown
- [ ] 3.5 Search + filter row below stats

## 4. Entity APIs

- [ ] 4.1 Rewrite GET /api/entities/[id] — return entity + connected cases (with title/status/urgency) + cross-case messages (with case_number/title)
- [ ] 4.2 Add PATCH /api/entities/[id] — edit name, type, phone, email, whatsapp_number, telegram_handle, website
- [ ] 4.3 Add POST /api/entities/merge — source→target: move case_entities, archive source, audit log

## 5. Entity Standalone Pages

- [ ] 5.1 Create /entities page (standalone, NOT in settings): entity list with search, type filter, case count per entity, sort options
- [ ] 5.2 Create /entities/[id] page: profile section (name, type, contacts — editable inline), connected cases cards, message log (all messages mentioning this entity across cases)
- [ ] 5.3 Merge button on entity detail: select target entity → confirm → POST merge

## 6. Navigation + Settings Cleanup

- [ ] 6.1 Sidebar: add Entities as standalone nav item between Cases and Simulate
- [ ] 6.2 Remove Entities tab from Settings page (keep: Prompt, Skills, Gates)

## 7. Case Detail — Empowerment

- [ ] 7.1 Show empowerment_line in CaseEvent cards on case detail agent tab

## 8. Version + Naming

- [ ] 8.1 Update sidebar version to v5 "Claw" — each version gets a codename
- [ ] 8.2 Version history: v1 "Scratch", v2 "Pounce", v3 "Grip", v4 "Strike", v5 "Claw"
- [ ] 8.3 Show codename in sidebar: `v5 · Claw · {sha}`

## 9. Deploy + Test

- [ ] 9.1 Build + deploy
- [ ] 9.2 Test: scan case → empowerment line appears on dashboard
- [ ] 9.3 Test: click dashboard stats → case list filters
- [ ] 9.4 Test: entity page shows entities with case counts
- [ ] 9.5 Test: entity detail shows cross-case messages
- [ ] 9.6 Test: edit entity contact details
