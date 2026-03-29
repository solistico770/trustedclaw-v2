## ADDED Requirements

### Requirement: Scheduled Case Scanning
המערכת SHALL להריץ agent scan בתדירות קבועה (pg_cron כל דקה + Vercel Cron כל 5 דקות). כל scan מוצא Cases שצריך לסרוק ומריץ LLM על כל אחד.

#### Scenario: scan רגיל
- **WHEN** POST /api/agent/scan מופעל ע"י scheduler
- **THEN** המערכת מוצאת עד 5 Cases (pending OR next_scan_at <= now), ממוינים לפי importance. לכל Case — מריצה LLM, שומרת CaseEvent, מעדכנת Case.

#### Scenario: אין Cases לסריקה
- **WHEN** אין cases ב-pending ואין cases עם next_scan_at שעבר
- **THEN** scan מסתיים מיד. scan_log נכתב עם cases_scanned=0.

### Requirement: LLM Context Assembly
לכל Case שנסרק, המערכת SHALL לבנות context שכולל: context prompt של הבעלים, 20 messages אחרונים ב-Case, CaseEvent אחרון (אם קיים), רשימת Cases פתוחים אחרונים (ל-merge detection).

#### Scenario: Case עם הרבה messages
- **WHEN** Case מכיל 50 messages
- **THEN** רק 20 אחרונים נשלחים ל-LLM + סיכום מ-CaseEvent קודם (אם קיים)

#### Scenario: Case ראשון (אין היסטוריה)
- **WHEN** Case ב-pending ללא CaseEvents קודמים
- **THEN** LLM מקבל: context prompt + messages + רשימת Cases פתוחים ל-merge check

### Requirement: Agent Decision — Standalone vs Merge
ה-agent SHALL להחליט אם Case חדש עומד בפני עצמו או שצריך להתמזג ל-Case קיים.

#### Scenario: agent מחליט standalone
- **WHEN** LLM מחזיר decision=standalone
- **THEN** Case מעודכן: status=open, urgency + importance נקבעים, title + summary נוצרים, next_scan_at נקבע. entity suggestions נשמרות.

#### Scenario: agent מחליט merge
- **WHEN** LLM מחזיר decision=merge עם target_case_id
- **THEN** Messages של Case המקורי מועברים (case_id update) ל-target. Case המקורי → status=merged, merged_into_case_id=target. target Case מתעדכן (message_count, last_message_at). CaseEvent נשמר על שניהם.

### Requirement: Agent Sets Next Scan
אחרי כל scan, ה-agent SHALL לקבוע מתי לסרוק שוב את ה-Case.

#### Scenario: Case דחוף
- **WHEN** agent קובע urgency=immediate
- **THEN** next_scan_at = now + 15 דקות

#### Scenario: Case לא דחוף
- **WHEN** agent קובע urgency=low, importance=2
- **THEN** next_scan_at = now + 7 ימים (חוסך tokens)

#### Scenario: Case עם deadline
- **WHEN** agent מזהה תאריך רלוונטי
- **THEN** next_scan_at נקבע ליום לפני ה-deadline

### Requirement: CaseEvent Recording
כל LLM interaction SHALL לייצר CaseEvent שלם.

#### Scenario: CaseEvent נשמר
- **WHEN** LLM מסיים עיבוד Case
- **THEN** CaseEvent נוצר עם: event_type, in_context (מלא), out_raw (מלא), api_commands (structured), tokens_used, model_used, duration_ms

### Requirement: Manual Scan Trigger
בעלים SHALL יכול להפעיל scan ידני על Case ספציפי מה-UI.

#### Scenario: scan ידני
- **WHEN** POST /api/agent/scan/[caseId] עם trigger=manual
- **THEN** LLM רץ על Case זה מיד, ללא המתנה ל-scheduler. CaseEvent נשמר עם event_type=manual_scan.
