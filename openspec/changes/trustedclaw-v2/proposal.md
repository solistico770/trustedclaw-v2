## Why

TrustedClaw v1 ניסה לעשות הכל — event processing pipeline סינכרוני, enrichment + classification בכל הודעה, entity linking אוטומטי. התוצאה: מערכת מסובכת שבה ה-AI רץ בכל ingest, צורכת tokens מיותרים, ואין הפרדה ברורה בין קליטה למחשבה.

v2 מבוסס על תובנה אחת: **קליטה היא מכנית, חשיבה היא מתוזמנת.** הודעה נכנסת → נשמרת → Case נפתח. זהו. שום AI לא רץ. ה-AI מגיע בnext scan — scheduler שסורק Cases לפי לוח זמנים שהוא עצמו קובע. כל אינטראקציה עם ה-LLM מתועדת כ-CaseEvent עם in/out/commands מלאים.

## What Changes

- **חדש**: מודל 5 ישויות נקי — Gate, Message, Case, Entity, CaseEvent
- **חדש**: קליטה מכנית לחלוטין — zero AI at ingest
- **חדש**: Agent Scanner מתוזמן — LLM רץ רק ב-scan, לא בכל הודעה
- **חדש**: Case שולט על ה-scan שלו — `next_scan_at` נקבע ע"י ה-agent
- **חדש**: CaseEvent — תיעוד מלא של כל LLM interaction (in_context, out_raw, api_commands)
- **חדש**: Entities דורשים אישור אנושי — AI מציע, אדם מאשר
- **חדש**: Merge logic — agent מחליט אם Case חדש עומד בפני עצמו או מתמזג לקיים
- **חדש**: Context prompt ב-UI — הנחיות ל-agent מנוהלות דרך ממשק, לא hardcoded
- **הוסר**: enrichment/classification pipeline סינכרוני
- **הוסר**: policy engine דטרמיניסטי (ה-agent הוא ה-policy)

## Capabilities

### New Capabilities

- `message-ingestion`: קליטת הודעות מ-Gates, שמירה raw, פתיחת Case בסטטוס pending. אפס AI. Gate → Message → Case.
- `agent-scanner`: Scheduler שמוצא Cases ב-pending או שהגיע ה-next_scan_at שלהם. מריץ LLM עם context prompt + messages + היסטוריה. שומר CaseEvent. מעדכן Case (urgency, importance, status, next_scan_at). מחליט merge/standalone.
- `case-management`: מחזור חיי Case (pending → open → action_needed → in_progress → addressed → scheduled → merged → closed). Merge logic. Message grouping. Status transitions עם היסטוריה.
- `entity-management`: Entity CRUD עם flow של proposed → approved. AI מציע entities מתוך messages. אדם מאשר/דוחה ב-UI. רק entities מאושרים פעילים.
- `case-event-tracking`: שמירת כל LLM interaction כ-CaseEvent עם in_context, out_raw, api_commands. Tokens ומשך זמן מתועדים.
- `admin-ui`: Cases board (sorted by importance), Case detail (messages + CaseEvents timeline), Entity browser עם approval flow, Gate management, Context prompt editor, Agent scan monitor.
- `audit-trail`: Append-only log של כל פעולות המערכת.

### Modified Capabilities

<!-- v2 הוא greenfield מלא — אין capabilities קיימים -->

## Impact

- **Schema חדש לחלוטין** — 7 טבלאות core (gates, messages, cases, entities, case_entities, case_events, audit_logs)
- **Supabase**: PostgreSQL + pg_cron (scheduler trigger) + Realtime + Auth
- **Vercel**: Next.js API routes + Shadcn UI
- **Gemini 2.5 Flash**: LLM — רק ב-agent scan, לא ב-ingest
- **API חדש**: POST /api/messages/ingest, POST /api/agent/scan, GET/POST /api/cases, GET/POST /api/entities, Context prompt CRUD
- **אין תלות ב-EC2** — הכל serverless
