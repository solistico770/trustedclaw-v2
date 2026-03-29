## ADDED Requirements

### Requirement: PostgreSQL schema for local message storage
The system SHALL create and maintain a local PostgreSQL database with the following tables:
- `messages` — all captured messages with full metadata
- `conversations` — chat/group thread tracking
- `pending_ingest` — retry queue for failed TrustedClaw forwards
- `config` — local runtime configuration (gate IDs, session state)

#### Scenario: Schema initialization on first boot
- **WHEN** the claw-listener connects to PostgreSQL for the first time
- **THEN** all tables are created via migration scripts
- **THEN** full-text search indexes are created on `messages.body` using `tsvector`

### Requirement: Messages table structure
The `messages` table SHALL contain: `id` (UUID, PK), `external_id` (unique, the deterministic dedup key), `gate_type` (whatsapp|telegram), `chat_id`, `chat_name`, `sender_id`, `sender_name`, `direction` (incoming|outgoing), `body` (text), `media_type`, `media_metadata` (JSONB), `raw_payload` (JSONB), `occurred_at` (timestamptz), `stored_at` (timestamptz, default now()), `ingested_at` (timestamptz, null until forwarded), `trustedclaw_case_id` (UUID, null until ingest response), `body_tsv` (tsvector, auto-generated).

#### Scenario: Message inserted with full-text index
- **WHEN** a message with body "Invoice #1234 from Acme Corp is overdue" is stored
- **THEN** `body_tsv` is automatically populated for full-text search
- **THEN** a query `SELECT * FROM messages WHERE body_tsv @@ to_tsquery('invoice & acme')` returns this message

### Requirement: Conversations table for thread tracking
The `conversations` table SHALL contain: `id` (UUID, PK), `gate_type`, `chat_id` (unique per gate_type), `chat_name`, `participant_count`, `last_message_at`, `message_count`, `created_at`.

#### Scenario: Conversation auto-created on first message
- **WHEN** a message arrives from a chat not yet in the `conversations` table
- **THEN** a new conversation record is created with the chat metadata
- **THEN** subsequent messages from the same chat update `last_message_at` and increment `message_count`

### Requirement: Data retention policy
The system SHALL support a configurable retention period (default: 90 days). A daily cleanup job SHALL delete messages older than the retention period from the local `messages` table. Conversations are never deleted.

#### Scenario: Old messages pruned
- **WHEN** the daily cleanup runs and messages older than 90 days exist
- **THEN** those messages are deleted from the `messages` table
- **THEN** a log entry records: "Retention cleanup: deleted N messages older than 90 days"

### Requirement: Docker volume persistence
The PostgreSQL data directory SHALL be mounted as a Docker named volume (`claw-pg-data`). The WhatsApp auth directory SHALL be mounted as a separate volume (`claw-wwebjs-auth`).

#### Scenario: Data survives container recreation
- **WHEN** `docker compose down && docker compose up -d` is run
- **THEN** all messages and session data remain intact
- **THEN** the WhatsApp session resumes without QR re-scan
