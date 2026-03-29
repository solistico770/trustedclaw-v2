## ADDED Requirements

### Requirement: shadcn Sidebar component
The dashboard SHALL use the shadcn `sidebar` component with SidebarProvider, collapsible nav, and mobile sheet.

#### Scenario: Desktop sidebar
- **WHEN** admin visits dashboard on desktop
- **THEN** sidebar shows nav items (Cases, Entities, Simulate, Scanner, Settings) with collapse toggle

#### Scenario: Mobile sidebar
- **WHEN** viewport is below 768px
- **THEN** sidebar is a sheet/drawer triggered by hamburger button

### Requirement: User menu in sidebar
The sidebar footer SHALL show the logged-in user's email, role, and a logout button.

#### Scenario: User menu displays
- **WHEN** admin is logged in
- **THEN** sidebar footer shows their email and a logout button

### Requirement: RTL support preserved
The dashboard SHALL maintain dir="rtl" with sidebar on the right side.

#### Scenario: RTL rendering
- **WHEN** dashboard renders
- **THEN** sidebar appears on right, content on left, text flows RTL
