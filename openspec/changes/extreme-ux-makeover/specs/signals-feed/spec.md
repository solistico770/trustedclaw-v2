## ADDED Requirements

### Requirement: Conversation-grouped signal feed
The signals workspace SHALL group signals by conversation (same sender/channel) and display them as conversation threads.

#### Scenario: Viewing the signal feed
- **WHEN** the user navigates to the Signals workspace tab
- **THEN** signals SHALL be grouped by conversation key (sender + gate + channel)
- **AND** each conversation SHALL show: avatar, sender name, gate icon, last message preview, timestamp, pending count badge, and linked case number

#### Scenario: Expanding a conversation
- **WHEN** the user clicks a conversation row
- **THEN** the conversation SHALL expand inline to show all messages in a chat-like thread
- **AND** messages SHALL show sender name, full content, timestamp, status dot, and AI decision

### Requirement: Signal detail in drawer
For detailed signal inspection, the user SHALL be able to open a signal in a drawer.

#### Scenario: Opening signal detail
- **WHEN** the user double-clicks a signal or clicks a "detail" action
- **THEN** a drawer SHALL open showing: full content, AI decision reasoning, metadata (phone, direction, gate, timestamps, media type), and linked case link

### Requirement: Real-time signal indicator
When new signals arrive while the user is scrolled down, a non-intrusive indicator SHALL appear.

#### Scenario: New signal arrives while scrolled
- **WHEN** new signals arrive via real-time subscription while the user is not at the top of the feed
- **THEN** a floating badge SHALL appear at the top of the feed showing "N new signals"
- **AND** clicking the badge SHALL scroll to top smoothly
- **AND** the badge SHALL NOT shift existing content or cause a scroll jump

### Requirement: Signal status bulk actions
The system SHALL support bulk status changes for signals.

#### Scenario: Marking multiple signals as ignored
- **WHEN** the user selects multiple signals via checkboxes and clicks "Ignore"
- **THEN** all selected signals SHALL have their status updated to "ignored"
- **AND** the list SHALL update immediately
