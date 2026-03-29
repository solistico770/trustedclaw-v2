## MODIFIED Requirements

### Requirement: Scanner uses authenticated user ID
The agent scanner SHALL use the authenticated user's ID from the session or the case's `user_id` field — never a hardcoded constant.

#### Scenario: Cron-triggered scan
- **WHEN** the cron endpoint triggers a scan
- **THEN** the scanner reads `user_id` from the case record itself (cases already store user_id)

#### Scenario: Manual scan trigger
- **WHEN** an admin triggers a manual scan via API
- **THEN** the scanner uses the authenticated admin's user ID from the session
