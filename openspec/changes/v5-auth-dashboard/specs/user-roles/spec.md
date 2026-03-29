## ADDED Requirements

### Requirement: Profiles table
The system SHALL maintain a `profiles` table with columns: `id` (FK to auth.users), `role` (admin/pending/blocked), `display_name`, `created_at`.

#### Scenario: Profile created on signup
- **WHEN** a new user signs up via Supabase Auth
- **THEN** a database trigger creates a row in `profiles` with the user's ID

### Requirement: First user is admin
The system SHALL automatically assign `role: admin` to the first user who signs up. All subsequent users SHALL get `role: pending`.

#### Scenario: First signup
- **WHEN** the first user ever signs up and `profiles` table is empty
- **THEN** their profile is created with `role: admin`

#### Scenario: Subsequent signup
- **WHEN** a user signs up and `profiles` table already has rows
- **THEN** their profile is created with `role: pending`

### Requirement: Admin can manage users
An admin SHALL be able to view all users and change their role (promote to admin or block).

#### Scenario: Admin promotes user
- **WHEN** admin changes a pending user's role to admin
- **THEN** that user can now access the dashboard and all API routes

#### Scenario: Admin blocks user
- **WHEN** admin changes a user's role to blocked
- **THEN** that user is denied access to dashboard and API routes

### Requirement: Pending user experience
Users with `role: pending` SHALL see a waiting screen after login, not the dashboard.

#### Scenario: Pending user logs in
- **WHEN** a pending user authenticates successfully
- **THEN** they see a "Waiting for admin approval" screen with no dashboard access
