## ADDED Requirements

### Requirement: Route protection via proxy.ts
The system SHALL use Next.js `proxy.ts` to intercept all requests, validate the Supabase session, and redirect unauthenticated users to `/login`.

#### Scenario: Unauthenticated request to dashboard
- **WHEN** a request without a valid session hits any dashboard route
- **THEN** the user is redirected to `/login`

#### Scenario: Authenticated admin request
- **WHEN** a request with a valid admin session hits a dashboard route
- **THEN** the request passes through to the page

#### Scenario: Login page is public
- **WHEN** a request hits `/login` or `/auth/callback`
- **THEN** it passes through without auth check

### Requirement: API route protection
All API routes (except `/api/messages/ingest` and `/api/agent/scan` which use their own auth) SHALL verify the caller is an authenticated admin.

#### Scenario: Unauthenticated API call
- **WHEN** an API request has no valid session
- **THEN** the API returns 401 Unauthorized

#### Scenario: Non-admin API call
- **WHEN** an API request comes from a user with `role: pending` or `role: blocked`
- **THEN** the API returns 403 Forbidden

#### Scenario: Admin API call
- **WHEN** an API request comes from a user with `role: admin`
- **THEN** the request proceeds with `user.id` as the user identifier

### Requirement: Remove DEMO_USER_ID
The system SHALL NOT use any hardcoded user ID. All user identification MUST come from the authenticated session.

#### Scenario: No hardcoded user ID in codebase
- **WHEN** the codebase is searched for `DEMO_USER_ID` or `d1f03088-b350-49f0-92de-24dc3bf1f64d`
- **THEN** zero matches are found
