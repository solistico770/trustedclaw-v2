## ADDED Requirements

### Requirement: Local REST API for querying stored messages
The system SHALL expose a Fastify REST API on port 3100 (configurable via `LLM_QUERY_PORT`) inside the Docker network. All endpoints SHALL require `Authorization: Bearer <local_query_key>` (configured via `LLM_QUERY_KEY` env var).

#### Scenario: API starts and is reachable
- **WHEN** the claw-listener container starts
- **THEN** the Fastify server listens on the configured port
- **THEN** `GET /health` returns `{ status: "ok", messages_count: N, uptime_seconds: N }`

### Requirement: Search messages endpoint
`GET /query/messages` SHALL accept query parameters: `sender` (partial match), `chat` (partial match), `gate_type` (whatsapp|telegram), `q` (full-text search), `from` (ISO date), `to` (ISO date), `limit` (default 50, max 500), `offset` (default 0). Results SHALL be sorted by `occurred_at DESC`.

#### Scenario: Full-text search
- **WHEN** `GET /query/messages?q=invoice+overdue&gate_type=whatsapp`
- **THEN** returns messages matching the full-text query from WhatsApp only, with relevance ranking

#### Scenario: Date range filter
- **WHEN** `GET /query/messages?from=2026-03-29&to=2026-03-30&sender=John`
- **THEN** returns messages from John within the date range

#### Scenario: Empty results
- **WHEN** a search returns no matches
- **THEN** returns `{ messages: [], total: 0 }`

### Requirement: Conversations endpoint
`GET /query/conversations` SHALL return all tracked conversations with: chat name, gate type, participant count, message count, last message timestamp. Accepts `gate_type` filter and `sort_by` (last_message_at|message_count).

#### Scenario: List all conversations
- **WHEN** `GET /query/conversations?sort_by=last_message_at`
- **THEN** returns all conversations sorted by most recent activity

### Requirement: Conversation messages endpoint
`GET /query/conversations/:chatId/messages` SHALL return all messages in a specific conversation, sorted chronologically. Accepts `limit` and `offset` for pagination.

#### Scenario: Fetch conversation thread
- **WHEN** `GET /query/conversations/whatsapp:123456/messages?limit=100`
- **THEN** returns up to 100 messages from that chat in chronological order

### Requirement: Stats endpoint
`GET /query/stats` SHALL return: total message count, messages today, messages this week, active conversations count, messages by gate type, top 10 senders by message count.

#### Scenario: Dashboard stats
- **WHEN** `GET /query/stats`
- **THEN** returns aggregated statistics across all stored messages

### Requirement: Natural language query endpoint (optional)
`POST /query/natural` SHALL accept `{ question: "..." }` and translate the natural language question into a SQL query against the local database. This endpoint is optional and requires `GEMINI_API_KEY` in the environment.

#### Scenario: Natural language to SQL
- **WHEN** `POST /query/natural` with `{ question: "What did John say about invoices last week?" }`
- **THEN** the system generates a SQL query, executes it, and returns the results
- **THEN** the response includes both the generated SQL and the results

#### Scenario: Gemini API key not configured
- **WHEN** `POST /query/natural` is called without `GEMINI_API_KEY` in the environment
- **THEN** returns `{ error: "Natural language queries require GEMINI_API_KEY" }` with status 501
