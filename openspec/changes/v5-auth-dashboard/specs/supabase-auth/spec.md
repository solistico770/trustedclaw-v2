## ADDED Requirements

### Requirement: Email magic link login
The system SHALL allow users to sign in with email via Supabase Auth magic link. No phone OTP, no passwords.

#### Scenario: User requests magic link
- **WHEN** user enters email on /login and submits
- **THEN** Supabase sends a magic link email and UI shows "check your email"

#### Scenario: Magic link callback
- **WHEN** user clicks the magic link
- **THEN** /auth/callback exchanges the code for a session cookie and redirects to dashboard

### Requirement: Logout
The system SHALL allow users to sign out.

#### Scenario: User logs out
- **WHEN** user clicks logout in sidebar user menu
- **THEN** session is destroyed and user is redirected to /login

### Requirement: Cookie-based session
The system SHALL use `@supabase/ssr` for cookie-based sessions on both browser and server.

#### Scenario: Browser client uses cookies
- **WHEN** browser Supabase client is created
- **THEN** it uses `createBrowserClient` from `@supabase/ssr` with anon key (not service role)

#### Scenario: Server client reads cookies
- **WHEN** API route creates Supabase client
- **THEN** it uses `createServerClient` from `@supabase/ssr` reading cookies from the request
