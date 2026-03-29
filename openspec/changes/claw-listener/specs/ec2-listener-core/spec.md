## ADDED Requirements

### Requirement: Docker Compose stack runs on EC2
The system SHALL deploy as a Docker Compose stack on an AWS EC2 t3.medium instance running Ubuntu 24.04 LTS in eu-west-1. The stack SHALL contain a `claw-listener` service (Node.js 22 + Puppeteer) and a `postgres` service (PostgreSQL 16).

#### Scenario: Fresh EC2 provisioning
- **WHEN** the user runs the provisioning script on a fresh Ubuntu 24.04 EC2 instance
- **THEN** Docker and Docker Compose are installed, the stack is pulled/built, and all services start successfully

#### Scenario: Stack health check
- **WHEN** all services are running
- **THEN** `docker compose ps` shows both `claw-listener` and `postgres` as healthy with uptime > 0

### Requirement: Auto-restart on failure
The system SHALL configure Docker restart policy `unless-stopped` on all services. If the Node.js process crashes or the EC2 reboots, the stack SHALL restart automatically.

#### Scenario: Process crash recovery
- **WHEN** the claw-listener Node.js process crashes (exit code != 0)
- **THEN** Docker restarts the container within 10 seconds
- **THEN** the WhatsApp and Telegram bridges reconnect using persisted session data

#### Scenario: EC2 reboot recovery
- **WHEN** the EC2 instance reboots
- **THEN** the Docker daemon starts via systemd
- **THEN** the Docker Compose stack starts automatically
- **THEN** all services reach healthy state within 120 seconds

### Requirement: Environment configuration via .env file
The system SHALL read all configuration from a `.env` file mounted into the container. Required variables SHALL include: `TRUSTEDCLAW_URL`, `TRUSTEDCLAW_API_KEY`, `TRUSTEDCLAW_USER_ID`, `TELEGRAM_BOT_TOKEN`, `POSTGRES_PASSWORD`, `LLM_QUERY_PORT`.

#### Scenario: Missing required env var
- **WHEN** the claw-listener starts without `TRUSTEDCLAW_API_KEY` set
- **THEN** the process SHALL exit with a clear error message listing the missing variable

### Requirement: Structured logging
The system SHALL log all events as structured JSON to stdout. Log levels SHALL include: `info`, `warn`, `error`, `debug`. Each log entry SHALL include `timestamp`, `level`, `component` (whatsapp|telegram|ingest|query|system), and `message`.

#### Scenario: Log output format
- **WHEN** a WhatsApp message is received
- **THEN** a log entry is written: `{"timestamp":"...","level":"info","component":"whatsapp","message":"Message received","sender":"...","chatId":"..."}`
