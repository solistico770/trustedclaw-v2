## ADDED Requirements

### Requirement: API keys table in Supabase
The TrustedClaw dashboard SHALL have a new `api_keys` table in Supabase: `id` (UUID, PK), `user_id` (FK to auth.users), `name` (display name), `key_hash` (text, HMAC-SHA256 of the key), `key_prefix` (first 8 chars, for identification), `permissions` (text[], default `["ingest"]`), `last_used_at` (timestamptz), `created_at` (timestamptz), `revoked_at` (timestamptz, null if active).

#### Scenario: Table created via migration
- **WHEN** the Supabase migration runs
- **THEN** the `api_keys` table exists with RLS policies: users can only see/manage their own keys

### Requirement: Dashboard settings page for API key management
The TrustedClaw dashboard SHALL have a Settings > API Keys page where the user can generate, list, and revoke API keys.

#### Scenario: Generate new API key
- **WHEN** the user clicks "Generate New Key" and provides a name (e.g., "EC2 Listener")
- **THEN** a 32-byte random key is generated (base64url encoded, ~43 chars)
- **THEN** the key is displayed ONCE in a copyable dialog: "Save this key — it won't be shown again"
- **THEN** the HMAC-SHA256 hash and first 8 chars are stored in `api_keys`

#### Scenario: List API keys
- **WHEN** the user visits the API Keys settings page
- **THEN** all keys are listed showing: name, prefix (e.g., `claw_k3x...`), created date, last used date, status (active/revoked)

#### Scenario: Revoke API key
- **WHEN** the user clicks "Revoke" on an active key and confirms
- **THEN** `revoked_at` is set to now()
- **THEN** the key immediately stops working for API authentication

### Requirement: API key authentication middleware
TrustedClaw API routes that accept external service calls (`/api/messages/ingest`, `/api/gates`, `/api/gates/[id]`) SHALL accept `Authorization: Bearer <api_key>` as an alternative to Supabase session auth. The middleware SHALL hash the provided key and compare against active (non-revoked) keys in the `api_keys` table.

#### Scenario: Valid API key authentication
- **WHEN** a request arrives with `Authorization: Bearer <valid_key>` and no Supabase session
- **THEN** the middleware hashes the key, finds a matching active record in `api_keys`
- **THEN** the request proceeds with `user_id` from the matching key record
- **THEN** `last_used_at` is updated on the key record

#### Scenario: Revoked API key rejected
- **WHEN** a request arrives with a key that has `revoked_at IS NOT NULL`
- **THEN** the middleware returns 401 Unauthorized

#### Scenario: Invalid API key rejected
- **WHEN** a request arrives with an unrecognized bearer token
- **THEN** the middleware returns 401 Unauthorized with `{ error: "Invalid API key" }`

#### Scenario: Existing Supabase auth still works
- **WHEN** a request arrives with a valid Supabase session cookie (dashboard user)
- **THEN** authentication proceeds as before — API key middleware is skipped
