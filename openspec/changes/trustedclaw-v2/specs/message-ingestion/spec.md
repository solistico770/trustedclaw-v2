## ADDED Requirements

### Requirement: Zero-AI Ingestion
כש-Message מגיע מ-Gate, המערכת SHALL לשמור אותו ולפתוח Case. אפס AI. אפס enrichment. אפס classification. הפעולה מכנית לחלוטין.

#### Scenario: הודעה חדשה מגיעה
- **WHEN** POST /api/messages/ingest מגיע עם gate_id, sender, channel, content
- **THEN** Message נשמר עם raw_payload בלתי-משתנה. Case חדש נפתח עם status=pending. response מוחזר תוך 200ms.

#### Scenario: Gate לא קיים
- **WHEN** gate_id לא נמצא ב-DB
- **THEN** 404 מוחזר. שום דבר לא נשמר.

#### Scenario: DB לא זמין
- **WHEN** Supabase לא מגיב
- **THEN** 503 מוחזר. caller אחראי לretry.

### Requirement: Raw Message Immutability
raw_payload של Message SHALL להישמר כפי שהתקבל. אין שינוי, אין מחיקה, לעולם.

#### Scenario: ניסיון עדכון raw_payload
- **WHEN** כל קוד מנסה לעדכן raw_payload של message קיים
- **THEN** הפעולה נכשלת (trigger ברמת DB).

### Requirement: Automatic Case Opening
כל Message חדש SHALL לפתוח Case חדש בסטטוס pending. ה-agent יחליט מאוחר יותר אם למזג.

#### Scenario: Case נפתח אוטומטית
- **WHEN** Message נשמר
- **THEN** Case נוצר עם status=pending, importance=5, urgency=normal, message_count=1, first_message_at=now

### Requirement: Simulator Gate
המערכת SHALL לתמוך ב-Gate מסוג simulator שמאפשר שליחת messages מ-UI לצורך בדיקה.

#### Scenario: שליחת הודעה מ-Simulator
- **WHEN** POST /api/simulate עם message_content, sender_name, channel_name
- **THEN** Message נוצר עם gate_type=simulator. Case נפתח. זרימה זהה להודעה אמיתית.
