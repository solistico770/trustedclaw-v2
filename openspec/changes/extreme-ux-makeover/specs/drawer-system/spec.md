## ADDED Requirements

### Requirement: Layered drawer component
The system SHALL provide a `Drawer` component that renders as a slide-over panel anchored to the inline-end side of the viewport (left in RTL, right in LTR). The drawer SHALL overlay the current content with a semi-transparent backdrop.

#### Scenario: Opening a drawer
- **WHEN** a component calls `openDrawer({ id, content, title, width })` from the DrawerStack context
- **THEN** a panel slides in from the inline-end edge with the specified width (default: 600px, max: 80vw)
- **AND** a backdrop overlay appears behind the drawer with opacity 0.4

#### Scenario: Opening a drawer on mobile
- **WHEN** a drawer is opened on a viewport narrower than 768px
- **THEN** the drawer SHALL render as a full-width sheet covering the entire viewport

### Requirement: Nested drawer stacking
The system SHALL support up to 3 levels of nested drawers. Each new drawer SHALL stack on top of the previous one with increasing z-index and a slight visual offset.

#### Scenario: Opening a second drawer from within a first drawer
- **WHEN** a user clicks an entity link inside a case drawer
- **THEN** a second drawer opens on top of the first
- **AND** the first drawer shifts slightly (24px) toward the inline-start direction to show a visual stack
- **AND** the backdrop dims an additional step

#### Scenario: Maximum nesting depth
- **WHEN** 3 drawers are already open and code attempts to open a 4th
- **THEN** the oldest drawer (bottom of stack) SHALL be closed before the new one opens

### Requirement: Drawer dismissal
The system SHALL provide multiple ways to dismiss drawers: clicking the backdrop, pressing Escape, clicking a close button, or swiping on touch devices.

#### Scenario: Closing via Escape key
- **WHEN** the user presses Escape while a drawer is open
- **THEN** the topmost drawer SHALL close with a slide-out animation
- **AND** focus SHALL return to the element that triggered the drawer

#### Scenario: Closing via backdrop click
- **WHEN** the user clicks the backdrop area
- **THEN** the topmost drawer SHALL close

#### Scenario: Closing all drawers
- **WHEN** a component calls `closeAllDrawers()` from the DrawerStack context
- **THEN** all open drawers SHALL close simultaneously

### Requirement: RTL-aware slide direction
The drawer slide animation SHALL respect the document's `dir` attribute.

#### Scenario: Drawer in RTL mode
- **WHEN** the HTML document has `dir="rtl"`
- **THEN** drawers SHALL slide in from the left edge of the viewport

#### Scenario: Drawer in LTR mode
- **WHEN** the HTML document has `dir="ltr"` or no dir attribute
- **THEN** drawers SHALL slide in from the right edge of the viewport

### Requirement: DrawerStack context provider
The system SHALL provide a `DrawerStackProvider` React context that manages drawer state and exposes `openDrawer`, `closeDrawer`, `closeAllDrawers`, and `drawerStack` (array of open drawer IDs).

#### Scenario: Accessing drawer context
- **WHEN** a component calls `useDrawerStack()`
- **THEN** it SHALL receive the current stack state and control functions
- **AND** it SHALL be able to open a drawer by passing a React component as content

### Requirement: Drawer content unmounting
When a drawer is closed, its content SHALL be unmounted from the DOM to free memory and stop any active subscriptions.

#### Scenario: Closing a drawer with active data subscriptions
- **WHEN** a drawer containing a Supabase real-time subscription is closed
- **THEN** the drawer content component unmounts
- **AND** the subscription cleanup runs via React effect cleanup
