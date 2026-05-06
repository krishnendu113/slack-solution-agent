# Migration Spec: AWS Bedrock + LangFuse

## Executive Summary

Migrate the Capillary Solution Agent from the current stack (Anthropic SDK + LangGraph + LangSmith + Railway) to AWS Bedrock + custom orchestration + LangFuse + AWS deployment. The goal is to leverage AWS infrastructure for better cost control, enterprise compliance, and integration with existing Capillary AWS accounts.

---

## Current Architecture (Source)

### Stack
| Layer | Current | Target |
|-------|---------|--------|
| LLM Provider | Anthropic API (direct) | AWS Bedrock (Claude on Bedrock) |
| Orchestration | LangGraph (@langchain/langgraph) | Custom state machine (no LangGraph dependency) |
| Tracing/Observability | LangSmith (langsmith SDK) | LangFuse (self-hosted or cloud) |
| Deployment | Railway (auto-deploy from GitHub) | AWS (ECS Fargate / App Runner) |
| Database | MongoDB Atlas | MongoDB Atlas (unchanged) |
| Session Store | In-memory (express-session) | Redis/ElastiCache or DynamoDB |
| CDN/Static | Railway serves static | CloudFront + S3 (optional) |

### Source Code Structure
```
src/
├── server.js              — Express server, routes, SSE streaming
├── orchestrator.js        — Base system prompt, agent entry point, error handling
├── graph.js               — LangGraph state machine (nodes, edges, streaming)
├── subAgent.js            — Haiku sub-agent calls (single-shot + multi-turn)
├── researchAgents.js      — Parallel research dispatcher + domain prompts
├── preflight.js           — Gate + intent classifier (single Haiku call)
├── compaction.js          — Context window compaction (token estimation + summarisation)
├── planManager.js         — Plan CRUD (create/update/get plans)
├── skillLoader.js         — Skill registry, catalogue, conditional loading
├── clientPersona.js       — Client detection + persona context injection
├── documentStore.js       — In-memory document store for downloads
├── fileHandler.js         — File upload handling (multer + PDF/image extraction)
├── auth.js                — Authentication (password + SSO), user management APIs
├── passwordPolicy.js      — Password validation rules
├── lockout.js             — Account lockout logic
├── auditLogger.js         — Security event logging
├── db.js                  — MongoDB connection manager
├── migration.js           — JSON → MongoDB data migration
├── stores/
│   ├── index.js           — Store factory (json/mongodb backend switch)
│   ├── json/              — JSON file adapters (conversation, user, persona, audit)
│   └── mongo/             — MongoDB adapters (conversation, user, persona, audit)
├── tools/
│   ├── index.js           — Tool registry, definitions, handlers, filtering
│   ├── jira.js            — Jira API integration
│   ├── confluence.js      — Confluence API integration
│   ├── kapa.js            — Kapa docs MCP integration
│   └── webSearch.js       — docs.capillarytech.com sitemap search
├── __tests__/             — 34 test files (unit + property-based)
public/
├── index.html             — Main chat UI (search, plan tracker, SSE handling)
├── login.html             — Login page (password + SSO + forced password change)
├── admin.html             — Admin user management panel
├── about.html             — About/documentation page
skills/
├── registry.json          — Skill definitions (cr-evaluator, sdd-writer, gap-analyzer, excalidraw)
├── cr-evaluator/          — CR feasibility evaluation skill
├── capillary-sdd-writer/  — SDD document generation skill
├── solution-gap-analyzer/ — BRD gap analysis skill
└── excalidraw-diagram/    — Diagram generation skill
```

### Key Architectural Patterns

1. **Store Adapter Pattern** — All persistence goes through `src/stores/index.js` factory. Backend (json/mongodb) is swapped via `STORE_BACKEND` env var. All calling code is backend-agnostic.

2. **Parallel Research Agents** — `src/researchAgents.js` dispatches domain-specific Haiku sub-agents (Jira, Confluence, Docs, Web) in parallel. Each agent makes multi-turn tool calls and returns structured JSON summaries.

3. **Query Reformulation** — Before research, a Haiku call reformulates conversational queries into specific search terms using conversation context.

4. **Preflight Gate** — Single Haiku call classifies intent, detects off-topic queries, determines tool tags and skill IDs. Runs in parallel with client persona detection.

5. **Conditional Skill Loading** — Skills loaded based on intent classification (cr-evaluator for CR/BRD/issue, omitted for general queries). Skill catalogue always present for LLM discovery.

6. **Context Compaction** — When token count exceeds threshold, older messages are summarised by Haiku. Full history preserved in DB.

7. **Plan Tools** — Agent can create/update structured plans. Plans persist in conversation documents. UI shows real-time progress.

8. **SSE Streaming** — All agent responses stream via Server-Sent Events with typed events: token, status, phase, tool_status, skill_active, plan_update, document_ready, error.

---

## What Changes in Migration

### 1. LLM Calls: Anthropic SDK → AWS Bedrock SDK

**Current:**
```javascript
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Streaming
const stream = client.messages.stream({ model, max_tokens, system, messages, tools });
for await (const event of stream) { ... }

// Non-streaming
const response = await client.messages.create({ model, max_tokens, system, messages, tools });
```

**Target:**
```javascript
import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

// Model IDs on Bedrock:
// Claude Sonnet: 'anthropic.claude-sonnet-4-20250514-v1:0' (or latest)
// Claude Haiku: 'anthropic.claude-haiku-4-5-20251001-v1:0' (or latest)
```

**Key differences:**
- Bedrock uses AWS IAM for auth (no API key) — needs AWS credentials
- Model IDs are different (prefixed with `anthropic.`)
- Streaming uses `InvokeModelWithResponseStreamCommand` with different event format
- Tool use format is the same (Anthropic Messages API format) but wrapped in Bedrock's request/response envelope
- Token usage is in the response metadata

### 2. Orchestration: LangGraph → Custom State Machine

**Current:** LangGraph `StateGraph` with nodes and conditional edges.

**Target:** Replace with a simple async state machine. The current graph has ~10 nodes — this is manageable without a framework.

```javascript
// Simplified orchestration (no LangGraph dependency)
async function runAgentLoop(state, callbacks) {
  state = await preflightNode(state);
  if (!state.onTopic) return handleRefusal(state, callbacks);
  
  state = await loadSkillsNode(state, callbacks);
  state = await skillRouterNode(state);
  
  if (state.executionMode === 'multi-node') {
    return await multiNodePath(state, callbacks);
  }
  
  state = await parallelResearchNode(state, callbacks);
  if (state.fallbackToSequential) {
    return await sequentialResearchLoop(state, callbacks);
  }
  
  return await synthesiseLoop(state, callbacks);
}
```

**Benefits:** No `@langchain/langgraph` or `@langchain/core` dependencies (~2MB removed). Simpler debugging. Same logic, just explicit control flow.

### 3. Tracing: LangSmith → LangFuse

**Current:**
```javascript
import { traceable } from 'langsmith/traceable';
import { wrapAnthropic } from 'langsmith/wrappers/anthropic';
```

**Target:**
```javascript
import Langfuse from 'langfuse';
const langfuse = new Langfuse({ publicKey, secretKey, baseUrl });

// Create a trace for each request
const trace = langfuse.trace({ name: 'agent-request', userId, metadata });

// Create spans for each node
const span = trace.span({ name: 'preflight', input: { problemText } });
// ... do work ...
span.end({ output: result, usage: { input: tokens, output: tokens } });

// Create generations for LLM calls
const generation = trace.generation({
  name: 'research:jira',
  model: 'claude-haiku-4-5',
  input: messages,
  modelParameters: { max_tokens, temperature },
});
generation.end({ output: response, usage: { inputTokens, outputTokens } });
```

**Key differences:**
- LangFuse uses explicit trace/span/generation creation (not decorators)
- Token usage must be manually reported from Bedrock response metadata
- LangFuse can be self-hosted (on AWS) or cloud-hosted
- Supports cost tracking natively when you configure model pricing

### 4. Deployment: Railway → AWS

**Options:**
- **ECS Fargate** — Container-based, auto-scaling, production-grade
- **App Runner** — Simpler (like Railway), auto-deploys from ECR
- **Lambda + API Gateway** — Serverless, but SSE streaming is tricky

**Recommended: ECS Fargate** with:
- ALB (Application Load Balancer) for HTTPS + SSE support
- ECR for container registry
- CloudWatch for logs
- Secrets Manager for env vars
- ElastiCache (Redis) for session store (replaces in-memory sessions)

---

## What Stays the Same (Reusable Code)

These modules transfer directly with zero or minimal changes:

| Module | Changes Needed |
|--------|---------------|
| `src/stores/` (all) | None — MongoDB Atlas connection unchanged |
| `src/db.js` | None — same MongoDB driver |
| `src/migration.js` | None |
| `src/auth.js` | None (maybe add Cognito SSO option later) |
| `src/passwordPolicy.js` | None |
| `src/lockout.js` | None |
| `src/auditLogger.js` | None |
| `src/planManager.js` | None |
| `src/documentStore.js` | None |
| `src/fileHandler.js` | None |
| `src/tools/jira.js` | None |
| `src/tools/confluence.js` | None |
| `src/tools/kapa.js` | None |
| `src/tools/webSearch.js` | None |
| `src/tools/index.js` | Minor — remove LangSmith-specific code |
| `src/compaction.js` | Change LLM call from Anthropic SDK to Bedrock |
| `src/preflight.js` | Change LLM call from Anthropic SDK to Bedrock |
| `src/researchAgents.js` | Change LLM call from Anthropic SDK to Bedrock |
| `src/skillLoader.js` | None |
| `src/clientPersona.js` | Change LLM call from Anthropic SDK to Bedrock |
| `src/server.js` | Minor — session store change, remove LangSmith env checks |
| `public/` (all HTML) | None — frontend is backend-agnostic |
| `skills/` (all) | None — skill prompts are model-agnostic |

---

## Migration Plan (Phases)

### Phase 1: LLM Abstraction Layer
Create a `src/llm.js` module that abstracts LLM calls behind a common interface:
```javascript
export async function createMessage({ model, system, messages, tools, maxTokens }) → response
export async function streamMessage({ model, system, messages, tools, maxTokens }) → asyncIterable
```
- Implement Bedrock backend
- All existing code calls this instead of Anthropic SDK directly
- Makes future model switches trivial

### Phase 2: Remove LangGraph
Replace `src/graph.js` with `src/agentLoop.js` — explicit async state machine with same node logic but no framework dependency.

### Phase 3: Add LangFuse Tracing
Replace LangSmith imports with LangFuse SDK. Create traces per request, spans per node, generations per LLM call.

### Phase 4: AWS Deployment
- Dockerfile (already exists as `nixpacks.toml` — convert to standard Dockerfile)
- ECS task definition
- ALB configuration (SSE support)
- Secrets Manager for env vars
- ElastiCache for sessions
- CI/CD via GitHub Actions → ECR → ECS

### Phase 5: Session Store
Replace in-memory express-session with Redis (ElastiCache) or DynamoDB session store for multi-instance support.

---

## Environment Variables (Target)

```env
# AWS
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=        # or use IAM role (preferred on ECS)
AWS_SECRET_ACCESS_KEY=

# Bedrock Model IDs
BEDROCK_SONNET_MODEL_ID=anthropic.claude-sonnet-4-20250514-v1:0
BEDROCK_HAIKU_MODEL_ID=anthropic.claude-haiku-4-5-20251001-v1:0

# LangFuse
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_BASE_URL=https://cloud.langfuse.com  # or self-hosted URL

# MongoDB (unchanged)
STORE_BACKEND=mongodb
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=capillary_agent

# Session (new)
SESSION_STORE=redis  # or 'memory' for dev
REDIS_URL=redis://...

# Everything else unchanged
SESSION_SECRET=...
GOOGLE_CLIENT_ID=...
JIRA_BASE_URL=...
# etc.
```

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Orchestration | Custom state machine | LangGraph adds 2MB+ dependencies for ~200 lines of graph wiring. Custom code is simpler to debug and deploy. |
| LLM abstraction | `src/llm.js` interface | Decouples all code from any specific SDK. Makes testing easier (mock the interface). |
| Streaming | Bedrock `InvokeModelWithResponseStreamCommand` | Same SSE pattern, different event format. Adapter translates Bedrock events to our internal format. |
| Session store | Redis (ElastiCache) | Required for multi-instance ECS. DynamoDB is an alternative but Redis is simpler for sessions. |
| Tracing | LangFuse cloud (initially) | Can self-host later on AWS. Cloud version is zero-ops to start. |
| Deployment | ECS Fargate | Production-grade, auto-scaling, supports long-running SSE connections. App Runner is simpler but less control. |
| IAM auth for Bedrock | IAM role on ECS task | No API keys to manage. Task role gets Bedrock invoke permissions. |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bedrock model availability | Claude models may not be available in all regions | Use `us-east-1` or `us-west-2` (best availability). Check model access in AWS console. |
| Bedrock streaming format differences | SSE event parsing needs adaptation | Build adapter layer that normalizes Bedrock events to match current internal format |
| LangFuse token tracking | Must manually extract from Bedrock response | Bedrock returns usage in response metadata — extract and pass to LangFuse generation.end() |
| SSE on ALB | ALB has idle timeout (default 60s) | Set ALB idle timeout to 300s. Send keepalive events. |
| Cold start (if using Lambda) | First request slow | Use ECS Fargate instead — always warm. Or use provisioned concurrency on Lambda. |
| MongoDB Atlas connectivity from AWS | Network path | Use VPC peering or PrivateLink between AWS VPC and Atlas |

---

## Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1: LLM abstraction | 2-3 days | AWS account with Bedrock access |
| Phase 2: Remove LangGraph | 1-2 days | Phase 1 |
| Phase 3: LangFuse tracing | 1 day | LangFuse account |
| Phase 4: AWS deployment | 2-3 days | AWS account, ECR, ECS setup |
| Phase 5: Session store | 0.5 day | ElastiCache or DynamoDB |
| Testing & validation | 2 days | All phases |
| **Total** | **~10 days** | |

---

## Files to Create in New Repo

```
src/
├── llm.js                 — LLM abstraction (Bedrock implementation)
├── llm.anthropic.js       — (optional) Anthropic direct implementation for fallback
├── agentLoop.js           — Custom state machine (replaces graph.js)
├── tracing.js             — LangFuse integration
├── sessionStore.js        — Redis/DynamoDB session adapter
├── ... (all other files copied from current repo)
Dockerfile                 — Multi-stage Node.js container
docker-compose.yml         — Local dev with Redis
.github/workflows/deploy.yml — CI/CD to ECR → ECS
infra/                     — Terraform/CDK for AWS resources (optional)
```
