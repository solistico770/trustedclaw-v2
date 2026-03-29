## ADDED Requirements

### Requirement: WhatsApp Web connection via whatsapp-web.js
The system SHALL connect to WhatsApp using `whatsapp-web.js` with a headless Chromium browser (Puppeteer). The connection SHALL use the multi-device protocol.

#### Scenario: First-time QR authentication
- **WHEN** the service starts with no saved session
- **THEN** a QR code SHALL be printed to the terminal logs
- **THEN** the user scans the QR code with their WhatsApp mobile app
- **THEN** the session is authenticated and persisted to `/data/wwebjs-auth/`

#### Scenario: Session restoration on restart
- **WHEN** the service restarts with a previously saved session in `/data/wwebjs-auth/`
- **THEN** the WhatsApp connection resumes without requiring a new QR scan

### Requirement: Capture all incoming and outgoing messages
The system SHALL capture every message in every chat (individual and group), including messages sent by the authenticated user. Each captured message SHALL include: message body, sender phone/name, chat ID, timestamp, message type (text/image/video/document/audio/location/contact), and media metadata (mime type, size) when applicable.

#### Scenario: Incoming text message
- **WHEN** a contact sends a text message to the user
- **THEN** the system captures the message with sender identifier, chat ID, timestamp, and body text
- **THEN** the message is stored in local PostgreSQL within 2 seconds

#### Scenario: Outgoing message from user
- **WHEN** the authenticated user sends a message from their phone
- **THEN** the system captures it with `direction: "outgoing"` and the same metadata as incoming messages

#### Scenario: Group message
- **WHEN** a message is sent in a WhatsApp group
- **THEN** the system captures it with the group chat ID, individual sender, and group name

#### Scenario: Media message (image/video/document)
- **WHEN** a media message is received
- **THEN** the system stores the media metadata (type, mime, size, caption) but NOT the binary file content

### Requirement: 24-hour backfill on first connection
The system SHALL, on first successful authentication, fetch messages from the last 24 hours across all chats and ingest them into the local store and TrustedClaw.

#### Scenario: First-boot backfill
- **WHEN** the WhatsApp session is authenticated for the first time (no prior message data in local PG)
- **THEN** the system fetches up to 50 messages per chat from the last 24 hours
- **THEN** each message is stored locally and forwarded to TrustedClaw's ingest API
- **THEN** a log entry records the total backfilled message count

### Requirement: Disconnection handling and reconnection
The system SHALL automatically reconnect when the WhatsApp session disconnects. If reconnection fails after 5 attempts (exponential backoff from 5s to 5min), the system SHALL log an error and send a notification via the Telegram bridge.

#### Scenario: Temporary disconnection
- **WHEN** the WhatsApp Web socket disconnects
- **THEN** the system attempts reconnection with exponential backoff
- **THEN** on successful reconnection, message capture resumes without data loss for the reconnection period

#### Scenario: Persistent disconnection (session revoked)
- **WHEN** the user logs out from WhatsApp Web on their phone
- **THEN** after 5 failed reconnection attempts, the system logs a critical error
- **THEN** a notification is sent via Telegram: "WhatsApp session revoked. Re-scan QR needed."
