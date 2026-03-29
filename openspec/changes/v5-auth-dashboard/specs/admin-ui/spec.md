## ADDED Requirements

### Requirement: User management page
The settings area SHALL include a user management page where admins can view all users and change their roles.

#### Scenario: Admin views users
- **WHEN** admin navigates to Settings → Users
- **THEN** they see a list of all users with their email/phone, role, and signup date

#### Scenario: Admin promotes a pending user
- **WHEN** admin clicks "Make Admin" on a pending user
- **THEN** that user's role changes to admin and they gain dashboard access

#### Scenario: Admin blocks a user
- **WHEN** admin clicks "Block" on a user
- **THEN** that user's role changes to blocked and they lose all access
