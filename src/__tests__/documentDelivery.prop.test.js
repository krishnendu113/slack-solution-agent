/**
 * documentDelivery.prop.test.js — Bug condition exploration test for document download delivery
 *
 * Task 1: Write bug condition exploration property test
 * Property 1: Bug Condition — Summary prompt instructs fake interactive text
 *
 * This test verifies that the `summaryPrompt` in the downloadable branch of
 * `skillValidateNode` does NOT contain bracket-enclosed action text like [Download].
 *
 * EXPECTED: This test FAILS on unfixed code — failure confirms the bug exists.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// ─── Mock all external dependencies used by graph.js ─────────────────────────

// Capture the systemPrompt passed to runSubAgent
let capturedSystemPrompt = null;

vi.mock('../subAgent.js', () => ({
  runSubAgent: vi.fn(async ({ systemPrompt }) => {
    capturedSystemPrompt = systemPrompt;
    return 'Mocked summary text.';
  }),
}));

vi.mock('../documentStore.js', () => ({
  storeDocument: vi.fn(() => 'mock-download-token-123'),
  getDocument: vi.fn(),
  clearStore: vi.fn(),
}));

vi.mock('../skillLoader.js', () => ({
  loadSkillsForProblem: vi.fn(async () => ({
    skillIds: [],
    prompt: '',
    matched: [],
    manifests: new Map(),
  })),
  loadSkillFiles: vi.fn(async () => ({})),
  listSkills: vi.fn(() => []),
  getSkillCatalogue: vi.fn(() => ''),
}));

vi.mock('../clientPersona.js', () => ({
  getClientContext: vi.fn(async () => ({ context: '', slug: null })),
  updateClientPersona: vi.fn(async () => {}),
}));

vi.mock('../preflight.js', () => ({
  runPreflight: vi.fn(async () => ({
    classification: { type: 'question', confidence: 0.9 },
    toolTags: [],
    onTopic: true,
    refusalMessage: '',
    skillIds: [],
    skillReasons: {},
  })),
}));

vi.mock('../compaction.js', () => ({
  compactIfNeeded: vi.fn(async (msgs) => msgs),
  estimateTokens: vi.fn(() => 100),
}));

vi.mock('../planManager.js', () => ({
  getAllPlans: vi.fn(() => []),
}));

vi.mock('../stores/index.js', () => ({
  getConversationStore: vi.fn(() => ({
    savePlanState: vi.fn(async () => {}),
  })),
}));

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(async () => ({
          content: [{ type: 'text', text: 'mock response' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 10 },
        })),
      },
    })),
  };
});

vi.mock('@langchain/langgraph', async () => {
  // Minimal StateGraph mock that captures nodes and lets us invoke them directly
  class MockStateGraph {
    constructor() {
      this.nodes = {};
    }
    addNode(name, fn) {
      this.nodes[name] = fn;
    }
    addEdge() {}
    addConditionalEdges() {}
    compile() {
      return { nodes: this.nodes };
    }
  }
  return {
    StateGraph: MockStateGraph,
    END: '__end__',
  };
});

vi.mock('langsmith/traceable', () => ({
  traceable: vi.fn((fn) => fn),
}));

import { buildGraph } from '../graph.js';

// ─── Task 1: Bug Condition Exploration Test ──────────────────────────────────

describe('Document Delivery Bug Condition (Property 1)', () => {
  /**
   * Property 1: Bug Condition — Summary prompt does not instruct fake interactive text
   *
   * For any generated filename string, the summaryPrompt passed to runSubAgent
   * SHALL NOT match /\[Download[^\]]*\]/ and SHALL NOT match /\[[A-Z][a-zA-Z\s]*\]/
   * (bracket-enclosed capitalized phrases that mimic clickable elements).
   *
   * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
   */
  it('Property 1: summaryPrompt must not contain bracket-enclosed action text like [Download]', async () => {
    // Arbitrary for skill IDs (used to build filename)
    const skillIdArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/).filter(s => s.length > 0);

    await fc.assert(
      fc.asyncProperty(skillIdArb, async (skillId) => {
        capturedSystemPrompt = null;

        const callbacks = {
          onStatus: vi.fn(async () => {}),
          onToken: vi.fn(async () => {}),
          onToolStatus: vi.fn(async () => {}),
          onSkillActive: vi.fn(async () => {}),
          onPhase: vi.fn(async () => {}),
          onDocumentReady: vi.fn(async () => {}),
          onPlanUpdate: vi.fn(async () => {}),
        };

        const compiled = buildGraph(callbacks, 'test system prompt');

        // Access the skillValidate node directly from the compiled graph
        const skillValidateNode = compiled.nodes['skillValidate'];
        expect(skillValidateNode).toBeDefined();

        // Build a state that triggers the downloadable branch
        const state = {
          assembledDoc: '# Test Document\n\nSome content here.',
          mergedManifest: {
            downloadable: true,
            validation: {},
          },
          skillIds: [skillId],
        };

        await skillValidateNode(state);

        // The summaryPrompt should have been captured by our mock
        expect(capturedSystemPrompt).not.toBeNull();

        // Assert: summaryPrompt must NOT contain [Download] or similar bracket-enclosed action text
        expect(capturedSystemPrompt).not.toMatch(/\[Download[^\]]*\]/);
        expect(capturedSystemPrompt).not.toMatch(/\[[A-Z][a-zA-Z\s]*\]/);
      }),
      { numRuns: 50 }
    );
  });
});


// ─── Import mocked modules for call inspection ──────────────────────────────

import { storeDocument } from '../documentStore.js';
import { runSubAgent } from '../subAgent.js';

// ─── Task 2: Preservation Property Tests ─────────────────────────────────────

// ─── Property 2a: Non-downloadable path preservation ─────────────────────────

describe('Non-downloadable path preservation (Property 2a)', () => {
  beforeEach(() => {
    capturedSystemPrompt = null;
    vi.clearAllMocks();
  });

  /**
   * Property 2a: Non-downloadable path unchanged
   *
   * For any skill execution where mergedManifest.downloadable !== true
   * (false or undefined), onToken is called with finalDoc, and storeDocument,
   * runSubAgent, and onDocumentReady are NOT called.
   *
   * **Validates: Requirements 3.3, 3.5**
   */
  it('Property 2a: non-downloadable skills stream full doc via onToken, no store/summary/documentReady', async () => {
    const skillIdArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/).filter(s => s.length > 0);
    const docContentArb = fc.string({ minLength: 1, maxLength: 500 });
    const downloadableArb = fc.oneof(fc.constant(false), fc.constant(undefined));

    await fc.assert(
      fc.asyncProperty(skillIdArb, docContentArb, downloadableArb, async (skillId, docContent, downloadableVal) => {
        vi.clearAllMocks();
        capturedSystemPrompt = null;

        const callbacks = {
          onStatus: vi.fn(async () => {}),
          onToken: vi.fn(async () => {}),
          onToolStatus: vi.fn(async () => {}),
          onSkillActive: vi.fn(async () => {}),
          onPhase: vi.fn(async () => {}),
          onDocumentReady: vi.fn(async () => {}),
          onPlanUpdate: vi.fn(async () => {}),
        };

        const compiled = buildGraph(callbacks, 'test system prompt');
        const skillValidateNode = compiled.nodes['skillValidate'];

        const manifest = { validation: {} };
        if (downloadableVal !== undefined) {
          manifest.downloadable = downloadableVal;
        }

        const state = {
          assembledDoc: docContent,
          mergedManifest: manifest,
          skillIds: [skillId],
        };

        await skillValidateNode(state);

        // onToken must be called with the finalDoc (which equals assembledDoc when no validation notes)
        expect(callbacks.onToken).toHaveBeenCalledTimes(1);
        expect(callbacks.onToken).toHaveBeenCalledWith(docContent);

        // storeDocument must NOT be called
        expect(storeDocument).not.toHaveBeenCalled();

        // runSubAgent must NOT be called
        expect(runSubAgent).not.toHaveBeenCalled();

        // onDocumentReady must NOT be called
        expect(callbacks.onDocumentReady).not.toHaveBeenCalled();
      }),
      { numRuns: 50 }
    );
  });
});

// ─── Property 2b: Delivery pipeline preservation ────────────────────────────

describe('Delivery pipeline preservation (Property 2b)', () => {
  beforeEach(() => {
    capturedSystemPrompt = null;
    vi.clearAllMocks();
  });

  /**
   * Property 2b: Delivery pipeline intact for downloadable skills
   *
   * For any skill execution where mergedManifest.downloadable === true,
   * storeDocument is called with { content, filename } where filename matches
   * ${skillId}-YYYY-MM-DD.md, runSubAgent is called with the correct model/maxTokens/operation,
   * onToken is called with the summary, and onDocumentReady is called with
   * { filename, sizeBytes, downloadToken }.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  it('Property 2b: downloadable skills call storeDocument, runSubAgent, onToken, onDocumentReady correctly', async () => {
    const skillIdArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/).filter(s => s.length > 0);
    const docContentArb = fc.string({ minLength: 1, maxLength: 500 });

    await fc.assert(
      fc.asyncProperty(skillIdArb, docContentArb, async (skillId, docContent) => {
        vi.clearAllMocks();
        capturedSystemPrompt = null;

        const callbacks = {
          onStatus: vi.fn(async () => {}),
          onToken: vi.fn(async () => {}),
          onToolStatus: vi.fn(async () => {}),
          onSkillActive: vi.fn(async () => {}),
          onPhase: vi.fn(async () => {}),
          onDocumentReady: vi.fn(async () => {}),
          onPlanUpdate: vi.fn(async () => {}),
        };

        const compiled = buildGraph(callbacks, 'test system prompt');
        const skillValidateNode = compiled.nodes['skillValidate'];

        const state = {
          assembledDoc: docContent,
          mergedManifest: {
            downloadable: true,
            validation: {},
          },
          skillIds: [skillId],
        };

        await skillValidateNode(state);

        // storeDocument called with { content, filename } where filename matches pattern
        expect(storeDocument).toHaveBeenCalledTimes(1);
        const storeArgs = storeDocument.mock.calls[0][0];
        expect(storeArgs).toHaveProperty('content', docContent);
        expect(storeArgs).toHaveProperty('filename');
        expect(storeArgs.filename).toMatch(new RegExp(`^${skillId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d{4}-\\d{2}-\\d{2}\\.md$`));

        // runSubAgent called with correct model, maxTokens, operation
        expect(runSubAgent).toHaveBeenCalledTimes(1);
        const subAgentArgs = runSubAgent.mock.calls[0][0];
        expect(subAgentArgs.model).toBe('claude-haiku-4-5-20251001');
        expect(subAgentArgs.maxTokens).toBe(512);
        expect(subAgentArgs.operation).toBe('doc-summary');

        // onToken called with the summary text (from our mock: 'Mocked summary text.')
        expect(callbacks.onToken).toHaveBeenCalledTimes(1);
        expect(callbacks.onToken).toHaveBeenCalledWith('Mocked summary text.');

        // onDocumentReady called with { filename, sizeBytes, downloadToken }
        expect(callbacks.onDocumentReady).toHaveBeenCalledTimes(1);
        const readyArgs = callbacks.onDocumentReady.mock.calls[0][0];
        expect(readyArgs).toHaveProperty('filename', storeArgs.filename);
        expect(readyArgs).toHaveProperty('sizeBytes', Buffer.byteLength(docContent));
        expect(readyArgs).toHaveProperty('downloadToken', 'mock-download-token-123');
      }),
      { numRuns: 50 }
    );
  });
});

// ─── Property 2c: Summary content preservation ──────────────────────────────

describe('Summary content preservation (Property 2c)', () => {
  beforeEach(() => {
    capturedSystemPrompt = null;
    vi.clearAllMocks();
  });

  /**
   * Property 2c: Summary prompt content preserved for downloadable skills
   *
   * For any downloadable skill execution, the summaryPrompt still instructs
   * the LLM to cover what was produced, key findings, and delivery options,
   * mentions Confluence and Jira, instructs to summarise in under 150 words,
   * and instructs to return plain text only.
   *
   * **Validates: Requirements 3.3, 3.4**
   */
  it('Property 2c: summaryPrompt covers required content areas and delivery options', async () => {
    const skillIdArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/).filter(s => s.length > 0);

    await fc.assert(
      fc.asyncProperty(skillIdArb, async (skillId) => {
        vi.clearAllMocks();
        capturedSystemPrompt = null;

        const callbacks = {
          onStatus: vi.fn(async () => {}),
          onToken: vi.fn(async () => {}),
          onToolStatus: vi.fn(async () => {}),
          onSkillActive: vi.fn(async () => {}),
          onPhase: vi.fn(async () => {}),
          onDocumentReady: vi.fn(async () => {}),
          onPlanUpdate: vi.fn(async () => {}),
        };

        const compiled = buildGraph(callbacks, 'test system prompt');
        const skillValidateNode = compiled.nodes['skillValidate'];

        const state = {
          assembledDoc: '# Test Document\n\nSome content here.',
          mergedManifest: {
            downloadable: true,
            validation: {},
          },
          skillIds: [skillId],
        };

        await skillValidateNode(state);

        expect(capturedSystemPrompt).not.toBeNull();

        // Must instruct to cover what was produced, key findings, and delivery options
        expect(capturedSystemPrompt).toMatch(/what was produced/i);
        expect(capturedSystemPrompt).toMatch(/key findings/i);
        expect(capturedSystemPrompt).toMatch(/delivery options/i);

        // Must mention Confluence and Jira
        expect(capturedSystemPrompt).toMatch(/Confluence/i);
        expect(capturedSystemPrompt).toMatch(/JIRA/i);

        // Must instruct to summarise in under 150 words
        expect(capturedSystemPrompt).toMatch(/150 words/i);

        // Must instruct to return plain text only
        expect(capturedSystemPrompt).toMatch(/plain text only/i);
      }),
      { numRuns: 50 }
    );
  });
});
