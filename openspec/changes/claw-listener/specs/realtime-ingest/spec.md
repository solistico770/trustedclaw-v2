## ADDED Requirements

### Requirement: Normalize messages to TrustedClaw ingest format
The system SHALL transform WhatsApp and Telegram messages into the format expected by `POST /api/messages/ingest`:
```json
{
  "gate_id": "<registered gate ID>",
  "gate_type": "whatsapp" | "telegram",
  "sender_name": "<sender display name>",
  "channel_name": "<chat/group name>",
  "content": "<message text or media description>",
  "user_id": "<configured user ID>"
}
```

#### Scenario: WhatsApp text message normalization
- **WHEN** a WhatsApp text message is received from "John" in chat "Project Alpha"
- **THEN** the system produces: `{ gate_type: "whatsapp", sender_name: "John", channel_name: "Project Alpha", content: "the message text", gate_id: "<wa_gate_id>", user_id: "<configured>" }`

#### Scenario: Telegram group message normalization
- **WHEN** a Telegram message is received from user "Alice" in group "Team Chat"
- **THEN** the system produces: `{ gate_type: "telegram", sender_name: "Alice", channel_name: "Team Chat", content: "the message text", gate_id: "<tg_gate_id>", user_id: "<configured>" }`

#### Scenario: Media message normalization
- **WHEN** a WhatsApp image message with caption "Check this out" is received
- **THEN** the content field SHALL be: `"[Image: image/jpeg, 245KB] Check this out"`

### Requirement: Immediate forwarding to TrustedClaw
The system SHALL forward each normalized message to `POST /api/messages/ingest` within 5 seconds of receiving it from the messaging platform. The ingest response includes `case_id` — the system SHALL log which case the message was assigned to.

#### Scenario: Successful real-time ingest
- **WHEN** a message is received and normalized
- **THEN** a POST request is sent to `{TRUSTEDCLAW_URL}/api/messages/ingest` with the API key as `Authorization: Bearer <key>`
- **THEN** the response `{ message_id, case_id }` is logged and stored locally

#### Scenario: TrustedClaw API is unreachable
- **WHEN** the ingest POST fails (network error or 5xx response)
- **THEN** the message is added to the `pending_ingest` queue in local PostgreSQL
- **THEN** the retry worker picks it up within 30 seconds

### Requirement: Retry queue for failed ingests
The system SHALL maintain a `pending_ingest` table for messages that failed to forward to TrustedClaw. A background worker SHALL retry pending messages every 30 seconds with exponential backoff (max 5 attempts).

#### Scenario: Retry succeeds on second attempt
- **WHEN** a message fails to ingest (attempt 1) and TrustedClaw recovers
- **THEN** the retry worker sends the message on the next cycle (attempt 2)
- **THEN** on success, the pending record is deleted and the message is marked as ingested

#### Scenario: Retry exhausted after 5 attempts
- **WHEN** a message fails to ingest 5 times
- **THEN** the pending record is marked as `status: "failed"`
- **THEN** a warning is logged with the message details for manual review

### Requirement: Deduplication
The system SHALL NOT forward the same message twice to TrustedClaw. Each message is assigned a deterministic ID based on `{gate_type}:{chat_id}:{message_id}:{timestamp}`. If this ID already exists in the local `messages` table with `ingested_at IS NOT NULL`, the message SHALL NOT be re-forwarded.

#### Scenario: Duplicate message rejected
- **WHEN** a message with an ID that already exists (and was ingested) arrives again (e.g., during backfill overlap)
- **THEN** the system skips the TrustedClaw ingest call
- **THEN** a debug log notes the deduplication
