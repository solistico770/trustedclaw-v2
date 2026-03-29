## ADDED Requirements

### Requirement: Entity Proposal by Agent
כש-agent סורק Case, הוא SHALL להציע entities שמזוהים מתוך ה-messages. Entities נוצרים בסטטוס proposed.

#### Scenario: agent מציע entity
- **WHEN** agent מזהה שם אדם/חברה/פרויקט ב-messages
- **THEN** Entity נוצר עם status=proposed, type מזוהה, proposed_by_case_event_id מצביע ל-CaseEvent. case_entities record מקשר entity ל-case.

#### Scenario: entity כבר קיים (active)
- **WHEN** agent מזהה entity שכבר קיים ומאושר
- **THEN** רק case_entities link נוצר. Entity לא נוצר מחדש.

### Requirement: Human Approval
Entity בסטטוס proposed SHALL לדרוש אישור אנושי לפני שהוא הופך ל-active.

#### Scenario: user מאשר entity
- **WHEN** POST /api/entities/[id]/approve
- **THEN** status → active, approved_at=now

#### Scenario: user דוחה entity
- **WHEN** POST /api/entities/[id]/reject
- **THEN** status → rejected. Entity נשאר ב-DB אבל לא מוצג כ-active.

#### Scenario: batch approval
- **WHEN** POST /api/entities/batch עם {ids[], action: 'approve'|'reject'}
- **THEN** כל ה-entities מעודכנים בפעם אחת

### Requirement: Entity Types
Entity SHALL לתמוך בסוגים: person, company, project, invoice, bank_account, contract, product, bot, other.

#### Scenario: יצירת entity עם type
- **WHEN** agent מציע entity
- **THEN** type נקבע ע"י ה-agent לפי הקשר. user יכול לשנות type בעת אישור.

### Requirement: Entity Search
המערכת SHALL לתמוך בחיפוש entities לפי שם, type, status.

#### Scenario: חיפוש entity
- **WHEN** GET /api/entities?q=דוד&status=active
- **THEN** מוחזרים entities מאושרים שהשם מכיל "דוד"

### Requirement: Entity-Case Link
כל קישור entity-case SHALL לכלול role: primary (הדמות המרכזית), related (קשור), mentioned (מוזכר).

#### Scenario: entity מקושר ל-case
- **WHEN** agent מציע entity ומקשר ל-case
- **THEN** case_entities record נוצר עם role שנקבע ע"י agent
