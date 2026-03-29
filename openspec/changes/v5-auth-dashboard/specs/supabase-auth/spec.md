## ADDED Requirements

### Requirement: Phone OTP login
The system SHALL allow users to sign in with a phone number via Supabase Auth OTP. User enters phone → receives SMS code → enters code → session created.

#### Scenario: Successful phone login
- **WHEN** user enters a valid phone number and submits
- **THEN** Supabase sends an OTP via SMS and the UI shows a code input field

#### Scenario: Successful OTP verification
- **WHEN** user enters the correct OTP code
- **THEN** a session cookie is set and user is redirected to the dashboard

#### Scenario: Invalid OTP
- **WHEN** user enters an incorrect OTP code
- **THEN** an error message is shown and user can retry

### Requirement: Email magic link login
The system SHALL allow users to sign in with email via Supabase Auth magic link. User enters email → receives link → clicks link → session created.

#### Scenario: Successful email login
- **WHEN** user enters a valid email and submits
- **THEN** Supabase sends a magic link email and the UI shows a "check your email" message

#### Scenario: Magic link callback
- **WHEN** user clicks the magic link in their email
- **THEN** a session cookie is set and user is redirected to the dashboard

### Requirement: Login page UI
The system SHALL provide a login page at `/login` with phone and email options using shadcn card, input, and button components.

#### Scenario: Login page renders
- **WHEN** unauthenticated user visits any page
- **THEN** they are redirected to `/login` which shows phone and email login options

### Requirement: Logout
The system SHALL allow authenticated users to sign out, clearing their session.

#### Scenario: User logs out
- **WHEN** user clicks logout in the user menu
- **THEN** session is destroyed and user is redirected to `/login`
