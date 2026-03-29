## ADDED Requirements

### Requirement: Auto-register gates on boot
On startup, the system SHALL call `POST /api/gates` on TrustedClaw to register a WhatsApp gate and a Telegram gate for the configured `TRUSTEDCLAW_USER_ID`. If gates of those types already exist, the system SHALL use the existing gate IDs.

#### Scenario: First boot — gates created
- **WHEN** the service starts and no WhatsApp/Telegram gates exist for the user
- **THEN** the system creates two gates via `POST /api/gates`:
  - `{ type: "whatsapp", display_name: "WhatsApp (ClawListener)", user_id: "..." }`
  - `{ type: "telegram", display_name: "Telegram (ClawListener)", user_id: "..." }`
- **THEN** the returned gate IDs are stored in memory and in local config

#### Scenario: Subsequent boot — existing gates reused
- **WHEN** the service starts and WhatsApp/Telegram gates already exist (fetched via `GET /api/gates`)
- **THEN** the system reuses the existing gate IDs without creating duplicates

### Requirement: Gate status heartbeat
The system SHALL update gate metadata on TrustedClaw every 5 minutes with the current connection status of each bridge (`connected`, `disconnected`, `reconnecting`).

#### Scenario: Heartbeat update
- **WHEN** 5 minutes have passed since the last heartbeat
- **THEN** the system calls `PATCH /api/gates/<id>` with `{ metadata: { status: "connected", last_heartbeat: "...", message_count_since_boot: N } }`

#### Scenario: Bridge disconnection reflected in heartbeat
- **WHEN** the WhatsApp bridge disconnects
- **THEN** the next heartbeat reports `{ metadata: { status: "disconnected", disconnected_at: "..." } }` for the WhatsApp gate
