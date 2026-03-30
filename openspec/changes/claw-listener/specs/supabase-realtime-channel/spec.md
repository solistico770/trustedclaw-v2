## ADDED Requirements

### Requirement: Supabase tables for command/response channel
The system SHALL have two new Supabase tables: `listener_commands` (Vercel writes, EC2 listens) and `listener_responses` (EC2 writes, Vercel reads). Both tables SHALL have RLS policies scoped to user_id. `listener_commands` SHALL be published on Supabase Realtime.

#### Scenario: Command table schema
- **WHEN** the migration runs
- **THEN** `listener_commands` exists with columns: `id` (uuid PK), `user_id` (FK), `command` (text), `params` (jsonb), `status` (text, default 'pending'), `created_at` (timestamptz)
- **THEN** `listener_responses` exists with columns: `id` (uuid PK), `command_id` (FK→listener_commands), `user_id` (FK), `data` (jsonb), `created_at` (timestamptz)
- **THEN** Supabase Realtime publication includes `listener_commands`

### Requirement: EC2 subscribes to commands via Supabase Realtime
The ClawListener SHALL subscribe to `listener_commands` table changes filtered by `user_id`. When a new command is inserted, the listener SHALL process it and write the result to `listener_responses`.

#### Scenario: EC2 receives pull_conversations command
- **WHEN** Vercel inserts `{ command: "pull_conversations", params: { since: "24h" } }` into `listener_commands`
- **THEN** EC2 receives the Realtime notification within 2 seconds
- **THEN** EC2 queries local PostgreSQL for conversations from the last 24 hours
- **THEN** EC2 inserts the result into `listener_responses` with `command_id` reference
- **THEN** EC2 updates the command status to `"completed"`

#### Scenario: EC2 receives request_qr command
- **WHEN** dashboard inserts `{ command: "request_qr", params: { gate_id: "..." } }` into `listener_commands`
- **THEN** EC2 generates a WhatsApp QR code string via whatsapp-web.js
- **THEN** EC2 writes `{ qr_string: "..." }` to `listener_responses`
- **THEN** dashboard renders the QR code in the Channels tab UI

#### Scenario: EC2 receives connect_telegram command
- **WHEN** dashboard inserts `{ command: "connect_telegram", params: { token: "...", gate_id: "..." } }` into `listener_commands`
- **THEN** EC2 validates the token via `getMe()`, starts the bot, and responds with `{ status: "connected", bot_username: "@..." }`

#### Scenario: EC2 receives disconnect command
- **WHEN** dashboard inserts `{ command: "disconnect_whatsapp" }` or `{ command: "disconnect_telegram" }`
- **THEN** EC2 stops the respective bridge gracefully and responds with `{ status: "disconnected" }`

### Requirement: Vercel can optionally pull full conversation context
The primary data flow is signals pushed by EC2 into Supabase — the LLM gets its data from those signals. The pull mechanism is optional enrichment: the agent-scanner MAY pull full threaded conversations (24h grouped by chat/contact) from EC2 to give the AI richer context beyond individual signals.

#### Scenario: Successful conversation pull during scan
- **WHEN** `scanCase()` runs for a case with signals from a WhatsApp gate that has `listener_active: true`
- **THEN** a `pull_conversations` command is inserted into `listener_commands`
- **THEN** the scanner polls `listener_responses` every 500ms for up to 10 seconds
- **THEN** on response, the conversation messages are appended to the signal list passed to the AI

#### Scenario: EC2 offline — graceful degradation
- **WHEN** `scanCase()` sends a `pull_conversations` command but EC2 doesn't respond within 10 seconds
- **THEN** the scan continues normally without the extra conversation context
- **THEN** a warning is logged but the scan is NOT blocked

### Requirement: Command cleanup
A daily cleanup process SHALL delete `listener_commands` and `listener_responses` records older than 24 hours to prevent table bloat.

#### Scenario: Old commands pruned
- **WHEN** the daily cleanup runs
- **THEN** all `listener_commands` and `listener_responses` older than 24 hours are deleted
