# Tasks: Search and Planning UI

## Task 1: Search API Endpoint
- [x] 1.1 Add `GET /api/conversations/search` route to `src/server.js` that accepts `q` and `limit` query parameters, clamps limit to [1, 20] (default 5), returns empty results for empty/whitespace queries, and calls `convStore.searchConversations(req.session.userId, query, limit)`
  - _Requirements: FR-1.3, FR-1.4, FR-1.5, FR-1.6_
- [ ] 1.2 Write unit tests for the search endpoint: validate query param handling, limit clamping, empty query behavior, user scoping
  - _Requirements: FR-1.3, FR-1.4, FR-1.5, FR-1.6, CP-2, CP-3_

## Task 2: Search Bar UI — HTML and CSS
- [x] 2.1 Add search bar HTML to the sidebar in `public/index.html`: search container with icon, input, clear button, and results dropdown — positioned between sidebar header and conversation list
  - _Requirements: FR-1.1, FR-1.10, NFR-3_
- [x] 2.2 Add CSS styles for search bar components (`.search-container`, `.search-input-wrapper`, `.search-input`, `.search-icon`, `.search-clear`, `.search-results`, `.search-result-item`, `.search-empty`, `.search-error`) using existing CSS variables, with dark mode support
  - _Requirements: NFR-1, NFR-3, AC-1, AC-9_

## Task 3: Search Bar UI — JavaScript Logic
- [x] 3.1 Implement `handleSearchInput()` with 300ms debounce timer that cancels pending requests on new keystrokes and calls `fetchSearchResults()` after the delay
  - _Requirements: FR-1.2, CP-1, AC-2_
- [x] 3.2 Implement `fetchSearchResults()` that calls `GET /api/conversations/search` via the existing `api()` helper and returns parsed results
  - _Requirements: FR-1.3_
- [x] 3.3 Implement `renderSearchResults()` that populates the dropdown with conversation title, relative timestamp (using existing `timeAgo()`), and snippet with highlighted matching text — all content passed through `escapeHtml()`
  - _Requirements: FR-1.7, FR-1.9, NFR-2, AC-2_
- [x] 3.4 Implement click handler on search results that calls `loadConversation(conversationId)` and `clearSearch()` to reset input and hide dropdown
  - _Requirements: FR-1.8, AC-3, CP-8_
- [x] 3.5 Implement `clearSearch()` and wire the clear button (✕) to reset input text, hide dropdown, and cancel any pending debounce timer
  - _Requirements: FR-1.10, AC-8_

## Task 4: Plan Tracker UI — HTML and CSS
- [x] 4.1 Add CSS styles for plan card components (`.plan-card`, `.plan-header`, `.plan-title`, `.plan-progress`, `.plan-collapse-icon`, `.plan-steps`, `.plan-step`, `.step-status`, `.step-description`, `.plan-continue-btn`) with status-specific colors: pending (muted), in_progress (accent/blue), completed (green), skipped (amber) — using existing CSS variables, with dark mode support
  - _Requirements: FR-2.2, NFR-1, AC-9_

## Task 5: Plan Tracker UI — JavaScript Logic
- [x] 5.1 Add `planCache` Map and implement `renderPlanCard(plan)` that creates or updates a plan card DOM element with title, progress counter, steps with status icons (○ ● ✓ ⊘), and collapse state — all content passed through `escapeHtml()`
  - _Requirements: FR-2.1, FR-2.2, FR-2.3, FR-2.5, NFR-2, CP-4, CP-5, CP-7_
- [x] 5.2 Implement auto-collapse logic: collapse card when all steps are completed/skipped, expand when any step is pending/in_progress
  - _Requirements: FR-2.6, FR-2.7_
- [x] 5.3 Implement `togglePlanCollapse(planId)` click handler on plan header to manually expand/collapse the steps section
  - _Requirements: FR-2.5_
- [x] 5.4 Add `plan_update` event handling in the SSE `for (const line of lines)` loop: call `ensureMsgContainer()`, update `planCache`, and call `renderPlanCard()` — inserting new cards before `activityBar` if present
  - _Requirements: FR-2.1, FR-2.4, AC-4, AC-5_
- [x] 5.5 Implement `renderSavedPlans(plans)` that renders plan cards from a loaded conversation's `plans` array, and call it from `loadConversation()` after `renderMessages()`
  - _Requirements: FR-3.1, FR-3.2, AC-6_
- [x] 5.6 Implement "Continue Plan" button: show on active plans, hide on completed plans; clicking sends "Continue with the plan from where you left off" via `sendMessage()` or equivalent
  - _Requirements: FR-3.3, FR-3.4, CP-6, AC-7_
- [x] 5.7 Clear `planCache` when switching conversations (`loadConversation()`) or starting a new chat (`newChat()`)
  - _Requirements: FR-3.5_

## Task 6: Error Handling
- [x] 6.1 Add error handling in `fetchSearchResults()`: catch network/server errors, show "Search unavailable — try again" in the dropdown, and recover on next search attempt
  - _Requirements: NFR-5_
- [x] 6.2 Add defensive checks in the `plan_update` SSE handler: validate `data.planId` and `data.steps` exist before rendering, log console warning for malformed events
  - _Requirements: NFR-5_

## Task 7: Integration Verification
- [ ] 7.1 Manually verify end-to-end search flow: type query → results appear → click result → conversation loads → search clears
  - _Requirements: AC-2, AC-3_
- [ ] 7.2 Manually verify end-to-end plan flow: send message that triggers plan → plan card appears → steps update in real-time → plan auto-collapses when complete
  - _Requirements: AC-4, AC-5_
- [ ] 7.3 Manually verify plan persistence: create plan → refresh page → reload conversation → plan card renders with correct state → click Continue Plan
  - _Requirements: AC-6, AC-7_
- [ ] 7.4 Manually verify dark mode: toggle theme → search bar and plan cards use correct dark theme colors
  - _Requirements: AC-9_
