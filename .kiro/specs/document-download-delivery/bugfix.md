# Bugfix Requirements Document

## Introduction

When a downloadable skill (e.g. `cr-evaluator`, `capillary-sdd-writer`) completes, the `skillValidateNode` in `src/graph.js` generates a chat summary that includes the literal text `"📄 {filename} ready — [Download] or say 'write to Confluence' / 'comment on JIRA-123'."` This "[Download]" text is streamed as plain text into the chat bubble and is not clickable. The actual download mechanism is a separate `document_ready` SSE event that renders a proper download card with a real `<a>` tag below the summary. Users see the plain-text "[Download]", assume it should be a link, and believe the download is broken. The fix must remove the misleading "[Download]" text from the LLM-generated summary while preserving the download card as the primary delivery mechanism.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a skill with `downloadable: true` completes and the `skillValidateNode` generates a summary THEN the system instructs the LLM to end the summary with `"📄 {filename} ready — [Download] or say 'write to Confluence' / 'comment on JIRA-123'."`, which is streamed as plain text into the chat bubble

1.2 WHEN the user sees the plain-text "[Download]" in the chat bubble THEN the system provides no clickable link or interactive element for that text, making it appear broken

1.3 WHEN the summary text containing "[Download]" is followed by the `document_ready` SSE download card THEN the system displays redundant and conflicting download affordances — a fake plain-text "[Download]" and a real download card button

### Expected Behavior (Correct)

2.1 WHEN a skill with `downloadable: true` completes and the `skillValidateNode` generates a summary THEN the system SHALL instruct the LLM to produce a summary that references delivery options without including fake interactive elements like "[Download]" — instead mentioning that a download card is provided below or that the user can say "write to Confluence" / "comment on JIRA-123"

2.2 WHEN the summary is streamed to the chat bubble THEN the system SHALL NOT include any text that mimics a clickable link or button (such as "[Download]", "[Download as Markdown]", or similar bracket-enclosed action text)

2.3 WHEN the `document_ready` SSE event fires after the summary THEN the system SHALL rely on the download card as the sole visual download affordance, with the summary text complementing rather than duplicating it

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a skill with `downloadable: true` completes THEN the system SHALL CONTINUE TO store the document via `storeDocument` and emit a `document_ready` SSE event with `{ filename, sizeBytes, downloadToken }`

3.2 WHEN the client receives a `document_ready` SSE event THEN the system SHALL CONTINUE TO render a download card with the filename, size, and a working download button linking to `/api/documents/:downloadToken`

3.3 WHEN a skill with `downloadable: true` completes THEN the system SHALL CONTINUE TO generate and stream a short summary (max 150 words) covering what was produced and key findings

3.4 WHEN the user says "write to Confluence" or "comment on JIRA-123" after a document is ready THEN the system SHALL CONTINUE TO handle those delivery options as before

3.5 WHEN a skill without `downloadable: true` completes THEN the system SHALL CONTINUE TO stream the full document as `token` SSE events unchanged

3.6 WHEN the download token expires after 30 minutes THEN the system SHALL CONTINUE TO return a 410 response from `/api/documents/:downloadToken`
