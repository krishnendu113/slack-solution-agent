# Requirements: Search and Planning UI

## Functional Requirements

### FR-1: Conversation History Search

1.1. THE system SHALL render a search bar in the sidebar, positioned between the sidebar header (with "New Chat" button) and the conversation list.

1.2. THE search input SHALL debounce API calls by 300ms — no request is sent until 300ms after the last keystroke.

1.3. THE system SHALL provide a `GET /api/conversations/search` endpoint that accepts `q` (query string) and `limit` (integer, default 5) query parameters.

1.4. THE search endpoint SHALL scope results to the authenticated user by passing `req.session.userId` to the store's `searchConversations()` method.

1.5. THE search endpoint SHALL clamp the `limit` parameter to the range [1, 20] and default to 5 if not provided or invalid.

1.6. THE search endpoint SHALL return an empty results array for empty or whitespace-only queries without calling the store method.

1.7. THE system SHALL display search results in a dropdown below the search input, showing each result's conversation title, relative timestamp, and a message snippet.

1.8. WHEN the user clicks a search result, THE system SHALL call `loadConversation()` with the result's `conversationId` and clear the search state (input text, dropdown).

1.9. THE system SHALL display a "No results found" message when the search returns zero results for a non-empty query.

1.10. THE search input SHALL include a clear button (✕) that appears when text is present and clears the search state when clicked.

### FR-2: Agent Planning Tools UI

2.1. WHEN a `plan_update` SSE event arrives during message streaming, THE system SHALL render a plan card in the chat message area showing the plan title and all steps.

2.2. THE plan card SHALL display each step with a status icon: pending (○), in_progress (●), completed (✓), skipped (⊘).

2.3. THE plan card header SHALL show a progress counter in the format "completed/total" (e.g., "3/5").

2.4. WHEN subsequent `plan_update` SSE events arrive for the same `planId`, THE system SHALL update the existing plan card in-place rather than creating a new one.

2.5. THE plan card SHALL be collapsible — clicking the header toggles the steps visibility.

2.6. WHEN all steps in a plan are completed or skipped, THE plan card SHALL auto-collapse.

2.7. WHEN a plan has at least one step with status `pending` or `in_progress`, THE plan card SHALL remain expanded.

### FR-3: Plan Persistence and Continuation

3.1. WHEN loading a conversation that has a `plans` array in its document, THE system SHALL render plan cards for each saved plan.

3.2. THE rendered saved plans SHALL be visually identical to plans received via SSE events with the same data.

3.3. WHEN a loaded conversation has an active plan (at least one step not completed/skipped), THE system SHALL display a "Continue Plan" button on the plan card.

3.4. WHEN the user clicks "Continue Plan", THE system SHALL send a message with the text "Continue with the plan from where you left off" to the current conversation.

3.5. THE plan state cache (`planCache`) SHALL be cleared when switching conversations or starting a new chat.

## Non-Functional Requirements

### NFR-1: Design System Consistency

THE search bar, search results dropdown, and plan cards SHALL use the existing CSS variables (`--bg`, `--border`, `--accent`, `--text-primary`, `--text-muted`, `--success`, `--warning`, etc.) and support both light and dark themes.

### NFR-2: XSS Prevention

ALL user-generated content displayed in search results (titles, snippets) and plan cards (titles, step descriptions) SHALL be passed through the existing `escapeHtml()` function before DOM insertion.

### NFR-3: Responsive Layout

THE search bar SHALL be visible on desktop (sidebar visible) and hidden on mobile (sidebar hidden, per existing `@media (max-width: 768px)` rule).

### NFR-4: Performance

THE search debounce timer SHALL be 300ms. THE search result limit SHALL default to 5 to keep payloads small. Plan card DOM updates SHALL target only changed elements rather than full re-renders.

### NFR-5: Error Resilience

THE system SHALL handle search API failures gracefully by showing an error message in the dropdown without breaking the sidebar. THE system SHALL skip rendering for malformed `plan_update` SSE events and log a console warning.

### NFR-6: No New Dependencies

THE feature SHALL be implemented using only existing libraries and utilities already loaded in the frontend (`marked.js`, `escapeHtml()`, `api()` helper, CSS variables).

## Acceptance Criteria

### AC-1: Search Bar Renders Correctly
GIVEN the user is on the main chat page
WHEN the page loads
THEN a search input with a search icon appears in the sidebar above the conversation list

### AC-2: Debounced Search Works
GIVEN the user types "authentication" in the search bar
WHEN 300ms passes after the last keystroke
THEN a single API call is made to `GET /api/conversations/search?q=authentication&limit=5`
AND matching conversations appear in a dropdown below the search input

### AC-3: Search Result Navigation
GIVEN search results are displayed in the dropdown
WHEN the user clicks a result
THEN the corresponding conversation loads in the chat area
AND the search input is cleared and the dropdown is hidden

### AC-4: Plan Card Renders on SSE Event
GIVEN the agent creates a plan during message streaming
WHEN a `plan_update` SSE event arrives
THEN a plan card appears in the chat showing the plan title and all steps with status icons

### AC-5: Plan Steps Update in Real-Time
GIVEN a plan card is displayed in the chat
WHEN the agent updates a step status (e.g., pending → in_progress → completed)
THEN the step's icon and styling update immediately without page refresh

### AC-6: Plan Persists Across Page Refresh
GIVEN a conversation has an active plan
WHEN the user refreshes the page and reloads the conversation
THEN the plan card renders with the correct step statuses from the saved data

### AC-7: Continue Plan Works
GIVEN a loaded conversation has a plan with incomplete steps
WHEN the user clicks the "Continue Plan" button
THEN a message "Continue with the plan from where you left off" is sent to the conversation
AND the agent resumes the plan

### AC-8: Empty Search Handling
GIVEN the search input is empty or contains only whitespace
WHEN the user has cleared the input
THEN no API call is made and the search dropdown is hidden

### AC-9: Dark Mode Support
GIVEN the user has dark mode enabled
WHEN viewing the search bar or plan cards
THEN all elements use the dark theme CSS variables and are visually consistent

## Correctness Properties

### CP-1: Search Debounce Guarantee
∀ keystroke sequences S where all keystrokes occur within 300ms of each other:
  exactly one API call is made, 300ms after the last keystroke in S.

### CP-2: Search User Scoping
∀ search requests R made through the search endpoint:
  R.results contains only conversations where conversation.userId === req.session.userId.

### CP-3: Limit Clamping
∀ limit values L passed to the search endpoint:
  the effective limit is max(1, min(20, L || 5)).

### CP-4: Step Icon Mapping Consistency
∀ plan steps with status S ∈ {pending, in_progress, completed, skipped}:
  the rendered icon matches STEP_ICONS[S] exactly.

### CP-5: Progress Counter Accuracy
∀ plans P with N total steps and C steps with status ∈ {completed, skipped}:
  the progress counter displays "C/N".

### CP-6: Continue Button Visibility Invariant
∀ plan cards with plan P:
  "Continue Plan" button is visible ⟺ ∃ step in P.steps where step.status ∈ {pending, in_progress}.

### CP-7: Plan Card Idempotency
∀ plans P:
  renderPlanCard(P) called N times (N ≥ 1) produces the same DOM state as calling it once.

### CP-8: Empty Query Safety
∀ queries Q where Q.trim() === '':
  no API call is made AND search results dropdown shows no results.
