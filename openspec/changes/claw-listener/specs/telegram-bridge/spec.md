## ADDED Requirements

### Requirement: Telegram Bot API connection via grammy
The system SHALL connect to Telegram using the `grammy` framework with long-polling mode. The bot token SHALL be provided via the `TELEGRAM_BOT_TOKEN` environment variable.

#### Scenario: Successful bot connection
- **WHEN** the service starts with a valid `TELEGRAM_BOT_TOKEN`
- **THEN** the bot connects to Telegram and begins receiving updates via long polling
- **THEN** a log entry confirms: "Telegram bridge connected as @<bot_username>"

#### Scenario: Invalid bot token
- **WHEN** the service starts with an invalid or revoked `TELEGRAM_BOT_TOKEN`
- **THEN** the system logs an error with the Telegram API error message
- **THEN** the Telegram bridge enters a retry loop (5 attempts, exponential backoff)

### Requirement: Capture all messages in chats where bot is a member
The system SHALL capture every message in every group/channel/DM where the bot has been added. The bot MUST have "Privacy mode" disabled (via BotFather) to see all group messages, not just commands.

#### Scenario: Group message capture
- **WHEN** any user sends a message in a group where the bot is a member
- **THEN** the system captures: message text, sender user ID, sender name, chat ID, chat title, timestamp, message type

#### Scenario: Direct message capture
- **WHEN** a user sends a DM to the bot
- **THEN** the system captures the message with the user's ID, name, and the DM chat ID

#### Scenario: Media message
- **WHEN** a media message (photo, video, document, voice, sticker) is sent
- **THEN** the system stores metadata (type, file_id, file_size, mime_type, caption) but NOT the binary content

### Requirement: Message history backfill is not available via Bot API
The Telegram Bot API does NOT support fetching historical messages. The system SHALL NOT attempt backfill for Telegram. Instead, on first connection, the system SHALL log: "Telegram bridge connected. Note: historical messages before this point are not available via Bot API."

#### Scenario: First connection — no backfill
- **WHEN** the Telegram bridge connects for the first time
- **THEN** only new messages received after connection are captured
- **THEN** a log entry notes that Telegram does not support historical backfill

### Requirement: Bot health monitoring
The system SHALL call `getMe()` every 60 seconds to verify the bot connection is alive. If the call fails, the bridge SHALL attempt reconnection.

#### Scenario: Health check failure
- **WHEN** the `getMe()` health check fails
- **THEN** the system attempts to restart the long-polling connection
- **THEN** if 3 consecutive health checks fail, a critical error is logged
