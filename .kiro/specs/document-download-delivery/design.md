# Document Download Delivery Bugfix Design

## Overview

When a downloadable skill completes, the `skillValidateNode` in `src/graph.js` generates a chat summary via a Haiku sub-agent call. The `summaryPrompt` instructs the LLM to end the summary with `"📄 {filename} ready — [Download] or say 'write to Confluence' / 'comment on JIRA-123'."` This "[Download]" text is streamed as plain text into the chat bubble — it is not clickable. The actual download mechanism is a separate `document_ready` SSE event that renders a proper download card with a real `<a>` tag. Users see the plain-text "[Download]", assume it should be a link, and believe the download is broken.

The fix updates the `summaryPrompt` to instruct the LLM to reference the download card below rather than producing fake bracket-enclosed action text. The upstream requirement (skill-execution-architecture requirement 9, criterion 10) that specified this text format should also be updated to match.

## Glossary

- **Bug_Condition (C)**: The `summaryPrompt` string in `skillValidateNode` instructs the LLM to produce text containing `"[Download]"` — a bracket-enclosed action phrase that renders as non-clickable plain text in the chat bubble
- **Property (P)**: The `summaryPrompt` SHALL instruct the LLM to produce a summary that references the download card below without including bracket-enclosed fake interactive elements
- **Preservation**: The document storage, `document_ready` SSE event, download card rendering, summary generation, and non-downloadable skill paths must remain unchanged
- **summaryPrompt**: The template string (around line 661 of `src/graph.js`) passed as `systemPrompt` to `runSubAgent` for the `doc-summary` operation
- **skillValidateNode**: The LangGraph node in `src/graph.js` that validates assembled skill output and handles document delivery
- **document_ready**: An SSE event type emitted after the summary, carrying `{ filename, sizeBytes, downloadToken }` which the client renders as a download card
- **download card**: The UI element in `public/index.html` rendered from a `document_ready` event — contains filename, size, and a real download `<a>` button

## Bug Details

### Bug Condition

The bug manifests when a skill with `downloadable: true` completes and the `skillValidateNode` generates a summary. The `summaryPrompt` template string explicitly instructs the LLM to end with a line containing `"[Download]"`, which is streamed as plain text into the chat bubble with no corresponding interactive element.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { summaryPrompt: string, downloadable: boolean }
  OUTPUT: boolean

  RETURN input.downloadable == true
         AND input.summaryPrompt CONTAINS pattern matching /\[Download[^\]]*\]/
         AND summaryPrompt instructs LLM to produce bracket-enclosed action text
END FUNCTION
```

### Examples

- **Example 1**: User runs `capillary-sdd-writer` skill → summary ends with `"📄 capillary-sdd-writer-2025-01-15.md ready — [Download] or say 'write to Confluence' / 'comment on JIRA-123'."` → "[Download]" is plain text, not clickable → user thinks download is broken
- **Example 2**: User runs `solution-gap-analyzer` skill → same pattern, summary contains `"[Download]"` as plain text → download card below works fine but user is confused by the fake link above
- **Example 3**: User runs `cr-evaluator` skill (not downloadable) → no summary prompt is used, no bug manifests → this path is unaffected

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `storeDocument()` must continue to be called with `{ content, filename }` and return a download token
- `onDocumentReady()` must continue to be called with `{ filename, sizeBytes, downloadToken }`
- `runSubAgent()` must continue to be called with `model: 'claude-haiku-4-5-20251001'`, `maxTokens: 512`, `operation: 'doc-summary'`
- `onToken()` must continue to be called with the generated summary text
- The summary must still cover what was produced, key findings, and delivery options
- The summary must still mention Confluence and Jira as delivery options
- Non-downloadable skills must continue to stream the full document via `onToken(finalDoc)` unchanged
- The `document_ready` SSE event and download card rendering in `public/index.html` must remain unchanged
- The `/api/documents/:downloadToken` endpoint and 30-minute TTL must remain unchanged

**Scope:**
All inputs that do NOT involve the `summaryPrompt` template string in the downloadable branch should be completely unaffected by this fix. This includes:
- Non-downloadable skill execution paths
- Document storage and retrieval
- Client-side download card rendering
- Confluence and Jira delivery flows
- The `runSubAgent` call mechanics (only the prompt content changes)

## Hypothesized Root Cause

Based on the bug description, the root cause is straightforward:

1. **Prompt Template Contains Fake Interactive Text**: The `summaryPrompt` on line ~661 of `src/graph.js` contains the instruction `End with exactly this line: "📄 ${filename} ready — [Download] or say 'write to Confluence' / 'comment on JIRA-123'."` The `[Download]` text is bracket-enclosed, mimicking a hyperlink, but it renders as plain text in the chat bubble since the chat renderer does not convert `[Download]` into a clickable element.

2. **Upstream Requirement Specified This Format**: Requirement 9, criterion 10 in `.kiro/specs/skill-execution-architecture/requirements.md` specifies the example text as `"📄 SDD ready — [Download as Markdown] or say 'write to Confluence' / 'comment on JIRA-123'."` — this upstream spec led to the implementation including bracket-enclosed action text.

3. **No Root Cause in Rendering or SSE**: The `document_ready` SSE event and download card in `public/index.html` work correctly. The bug is purely in the prompt template telling the LLM to produce misleading text.

## Correctness Properties

Property 1: Bug Condition - Summary prompt does not instruct fake interactive text

_For any_ downloadable skill execution where `mergedManifest.downloadable === true`, the `summaryPrompt` passed to `runSubAgent` SHALL NOT contain bracket-enclosed action text matching the pattern `[Download]`, `[Download as Markdown]`, or similar `[Action]` patterns that mimic clickable elements.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Non-downloadable path unchanged

_For any_ skill execution where `mergedManifest.downloadable !== true`, the fixed code SHALL produce exactly the same behavior as the original code — streaming the full document via `onToken(finalDoc)` without generating a summary or emitting a `document_ready` event.

**Validates: Requirements 3.3, 3.5**

Property 3: Preservation - Document delivery pipeline intact

_For any_ downloadable skill execution, the fixed code SHALL continue to call `storeDocument()`, `runSubAgent()` for summary generation, `onToken()` with the summary, and `onDocumentReady()` with `{ filename, sizeBytes, downloadToken }` — preserving the complete delivery pipeline.

**Validates: Requirements 3.1, 3.2, 3.3**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/graph.js`

**Function**: `skillValidateNode` (the downloadable branch, around line 661)

**Specific Changes**:
1. **Update `summaryPrompt` template**: Replace the instruction `End with exactly this line: "📄 ${filename} ready — [Download] or say 'write to Confluence' / 'comment on JIRA-123'."` with an instruction that tells the LLM to mention the download card is provided below and that the user can also say "write to Confluence" or "comment on JIRA-123" — without any bracket-enclosed fake action text.

   Before:
   ```javascript
   const summaryPrompt = `Summarise this document in under 150 words for a chat message.
   Cover: what was produced, key findings or verdict, and available delivery options.
   End with exactly this line: "📄 ${filename} ready — [Download] or say 'write to Confluence' / 'comment on JIRA-123'."
   Return plain text only.`;
   ```

   After:
   ```javascript
   const summaryPrompt = `Summarise this document in under 150 words for a chat message.
   Cover: what was produced, key findings or verdict, and available delivery options.
   End by noting that 📄 ${filename} is ready and a download card is provided below. Mention the user can also say "write to Confluence" or "comment on JIRA-123" for other delivery options.
   Do NOT include bracket-enclosed text like [Download] — the download card handles that.
   Return plain text only.`;
   ```

2. **Update upstream requirement text** (optional, documentation-only): Update requirement 9, criterion 10 in `.kiro/specs/skill-execution-architecture/requirements.md` to remove the `[Download as Markdown]` example text and instead specify that the summary should reference the download card without fake interactive elements.

**No changes required to**:
- `public/index.html` (download card rendering is correct)
- `src/documentStore.js` (storage and TTL are correct)
- `src/server.js` (download endpoint is correct)
- `src/subAgent.js` (sub-agent call mechanics are correct)

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write a test that extracts the `summaryPrompt` string from the downloadable branch of `skillValidateNode` and checks whether it instructs the LLM to produce bracket-enclosed action text. Run on the UNFIXED code to observe the failure.

**Test Cases**:
1. **Prompt Contains [Download]**: Assert that the `summaryPrompt` does NOT match `/\[Download[^\]]*\]/` — will fail on unfixed code because the prompt contains `[Download]`
2. **Prompt Contains Bracket-Enclosed Action**: Assert that the `summaryPrompt` does NOT match `/\[[A-Z][a-zA-Z\s]*\]/` (bracket-enclosed capitalized phrases) — will fail on unfixed code
3. **Summary Output Contains [Download]**: Mock `runSubAgent` to return the LLM's likely output given the unfixed prompt, assert it does NOT contain `[Download]` — will fail on unfixed code

**Expected Counterexamples**:
- The `summaryPrompt` string contains `[Download]` as literal text in the instruction
- The LLM output will contain `[Download]` because the prompt says "End with exactly this line"

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  summaryPrompt := buildSummaryPrompt_fixed(input.filename)
  ASSERT NOT summaryPrompt MATCHES /\[Download[^\]]*\]/
  ASSERT summaryPrompt CONTAINS "download card"
  ASSERT summaryPrompt CONTAINS "write to Confluence"
  ASSERT summaryPrompt CONTAINS "comment on JIRA"
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT skillValidateNode_original(input) = skillValidateNode_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (various skill IDs, document contents, manifest configurations)
- It catches edge cases that manual unit tests might miss (e.g., skills with unusual names, empty documents)
- It provides strong guarantees that behavior is unchanged for all non-downloadable inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-downloadable skills, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Non-Downloadable Path Preservation**: Verify that when `downloadable` is false/absent, the full document is streamed via `onToken` and no `document_ready` event is emitted — same as unfixed code
2. **Document Storage Preservation**: Verify that `storeDocument` is still called with `{ content, filename }` for downloadable skills
3. **SSE Event Preservation**: Verify that `onDocumentReady` is still called with `{ filename, sizeBytes, downloadToken }` for downloadable skills
4. **Summary Generation Preservation**: Verify that `runSubAgent` is still called with Haiku model, 512 max tokens, and `doc-summary` operation

### Unit Tests

- Test that the fixed `summaryPrompt` does not contain `[Download]` or similar bracket-enclosed action text
- Test that the fixed `summaryPrompt` still instructs the LLM to cover what was produced, key findings, and delivery options
- Test that the fixed `summaryPrompt` still mentions Confluence and Jira delivery options
- Test that the fixed `summaryPrompt` references the download card
- Test that non-downloadable skills stream the full document unchanged

### Property-Based Tests

- Generate random filenames and verify the fixed `summaryPrompt` never contains bracket-enclosed action text for any filename
- Generate random manifest configurations and verify non-downloadable paths produce identical results to the original code
- Generate random document contents and verify the delivery pipeline (storeDocument, onDocumentReady, onToken) is called correctly for downloadable skills

### Integration Tests

- Test full downloadable skill flow: validate → store → summary → token → document_ready event
- Test that the download card is the sole download affordance (no competing text in summary)
- Test that Confluence/Jira delivery options are still mentioned in the summary text
