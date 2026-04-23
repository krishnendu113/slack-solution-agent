# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Summary prompt instructs fake interactive text
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the `summaryPrompt` in the downloadable branch of `skillValidateNode` contains bracket-enclosed action text like `[Download]`
  - **Scoped PBT Approach**: The bug is deterministic — scope the property to the concrete case: any filename string passed to the downloadable branch produces a `summaryPrompt` containing `[Download]`
  - Create test file `src/__tests__/documentDelivery.prop.test.js` using vitest and fast-check
  - Extract or spy on the `summaryPrompt` string built in the downloadable branch of `skillValidateNode` in `src/graph.js` (around line 661)
  - Property: for any generated filename string, the `summaryPrompt` passed to `runSubAgent` SHALL NOT match `/\[Download[^\]]*\]/` and SHALL NOT match `/\[[A-Z][a-zA-Z\s]*\]/` (bracket-enclosed capitalized phrases)
  - The test assertions should match the Expected Behavior from design: prompt must not contain bracket-enclosed fake interactive elements
  - Run test on UNFIXED code with `npx vitest --run src/__tests__/documentDelivery.prop.test.js`
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the `summaryPrompt` contains `[Download]`)
  - Document counterexamples found (e.g., `summaryPrompt` for filename `"cr-evaluator-2025-01-15.md"` contains `[Download]`)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-downloadable path and delivery pipeline unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Create preservation tests in the same file `src/__tests__/documentDelivery.prop.test.js`
  - **Non-downloadable path preservation**: Mock the `skillValidateNode` closure dependencies (`storeDocument`, `runSubAgent`, `onToken`, `onDocumentReady`). For any skill execution where `mergedManifest.downloadable !== true`, observe on UNFIXED code that `onToken` is called with `finalDoc`, `storeDocument` is NOT called, `runSubAgent` is NOT called, and `onDocumentReady` is NOT called. Write property-based test generating random document content and manifest configs with `downloadable: false/undefined` asserting this behavior.
  - **Delivery pipeline preservation**: For any skill execution where `mergedManifest.downloadable === true`, observe on UNFIXED code that `storeDocument` is called with `{ content, filename }`, `runSubAgent` is called with `model: 'claude-haiku-4-5-20251001'`, `maxTokens: 512`, `operation: 'doc-summary'`, `onToken` is called with the summary, and `onDocumentReady` is called with `{ filename, sizeBytes, downloadToken }`. Write property-based test generating random filenames and document content asserting this pipeline.
  - **Summary content preservation**: For downloadable skills, observe on UNFIXED code that the `summaryPrompt` still instructs the LLM to cover what was produced, key findings, and delivery options, and still mentions Confluence and Jira. Write property-based test asserting these remain present for any filename.
  - Run tests on UNFIXED code with `npx vitest --run src/__tests__/documentDelivery.prop.test.js`
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for misleading [Download] text in summary prompt

  - [x] 3.1 Update `summaryPrompt` in `src/graph.js` downloadable branch
    - Locate the `summaryPrompt` template string in the downloadable branch of `skillValidateNode` (around line 661)
    - Replace the instruction `End with exactly this line: "📄 ${filename} ready — [Download] or say 'write to Confluence' / 'comment on JIRA-123'."` with an instruction that tells the LLM to note that the file is ready and a download card is provided below, and mention the user can also say "write to Confluence" or "comment on JIRA-123"
    - Add explicit instruction: `Do NOT include bracket-enclosed text like [Download] — the download card handles that.`
    - Keep the existing instructions: summarise in under 150 words, cover what was produced / key findings / delivery options, return plain text only
    - Do NOT change any other code in the downloadable branch (storeDocument call, runSubAgent call parameters other than systemPrompt, onToken call, onDocumentReady call)
    - Do NOT change the non-downloadable branch
    - _Bug_Condition: isBugCondition(input) where input.downloadable == true AND input.summaryPrompt CONTAINS /\[Download[^\]]*\]/_
    - _Expected_Behavior: summaryPrompt SHALL NOT contain bracket-enclosed action text; SHALL reference download card; SHALL mention Confluence and Jira options_
    - _Preservation: storeDocument, runSubAgent call mechanics, onToken, onDocumentReady, non-downloadable path all unchanged_
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Summary prompt does not instruct fake interactive text
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior: `summaryPrompt` must not contain `[Download]` or bracket-enclosed action text
    - When this test passes, it confirms the expected behavior is satisfied
    - Run `npx vitest --run src/__tests__/documentDelivery.prop.test.js`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-downloadable path and delivery pipeline unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run `npx vitest --run src/__tests__/documentDelivery.prop.test.js`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix (no regressions in non-downloadable path, delivery pipeline, or summary content)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite with `npx vitest --run` to ensure no regressions across the project
  - Ensure all property-based tests in `src/__tests__/documentDelivery.prop.test.js` pass
  - Ensure all existing tests in `src/__tests__/graph.test.js` still pass
  - Ask the user if questions arise
