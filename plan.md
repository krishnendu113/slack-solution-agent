# Capillary Solution Agent — Implementation & Deployment Plan

> This document is the single source of truth for building, completing,
> and deploying the Capillary Solution Agent. Written for Claude Code
> (or a developer) to read top-to-bottom and implement in order.

---

## §0 — Project overview

**What it is:** A Slack bot for the Capillary CS team. CS posts Jira tickets or
problem statements. The bot searches Capillary docs + Confluence, applies specialist
skills (SDD writer, gap analyzer, Excalidraw), and returns structured solutions.
When confidence is low, it escalates to a human SA with a pre-filled summary.

**Stack:**
- Runtime: Node.js 20+ (ESM)
- Bot framework: Slack Bolt (Socket Mode)
- LLM: Anthropic claude-sonnet-4 via REST API
- MCP: Atlassian, Capillary Docs, Gmail, Google Calendar
- Hosting: Railway
- Source control + CI/CD: GitHub

**What is already done:**
- `skillLoader.js` — complete
- `mcpConfig.js` — complete
- `skills/` folder — all three skill folders with files
- `skills/registry.json` — complete
- `mcp.json` — complete
- `.env.example` — complete
- `railway.toml` — complete

**What needs implementation (in order):**
1. §1 — Environment setup
2. §2 — `src/index.js` (Slack handlers)
3. §3 — `src/orchestrator.js` (Anthropic API call)
4. §4 — `src/tools/jira.js` + `src/tools/escalate.js`
5. §5 — Slack app configuration
6. §6 — Local testing
7. §7 — Railway deployment

---

## §1 — Environment setup

### 1.1 — Copy and fill `.env`

```bash
cp .env.example .env
```

Fill each variable:

| Variable | Where to get it |
|---|---|
| `SLACK_BOT_TOKEN` | api.slack.com → Your App → OAuth & Permissions → Bot User OAuth Token |
| `SLACK_APP_TOKEN` | api.slack.com → Your App → Basic Information → App-Level Tokens → Create token with `connections:write` scope |
| `SLACK_SA_CHANNEL_ID` | Right-click the SA channel in Slack → Copy Link → the ID is the last segment (C0XXXXX) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `ATLASSIAN_MCP_URL` | Your Atlassian MCP connector URL — `https://mcp.atlassian.com/v1/mcp` |
| `ATLASSIAN_MCP_TOKEN` | OAuth token from your Atlassian MCP connector |
| `CAPILLARY_MCP_URL` | `https://docs.capillarytech.com/mcp` |
| `CAPILLARY_MCP_TOKEN` | Token from Capillary docs MCP |
| `GMAIL_MCP_URL` | `https://gmail.mcp.claude.com/mcp` |
| `GMAIL_MCP_TOKEN` | OAuth token from Gmail connector |
| `GCAL_MCP_URL` | `https://gcal.mcp.claude.com/mcp` |
| `GCAL_MCP_TOKEN` | OAuth token from GCal connector |
| `JIRA_BASE_URL` | `https://capillarytech.atlassian.net` |
| `JIRA_API_TOKEN` | base64 of `your-email@capillarytech.com:your-atlassian-api-token` |
| `SA_ESCALATION_EMAIL` | SA team email address |
| `ESCALATION_THRESHOLD` | Default: `40` (percent confidence) |
| `MAX_AGENT_TOKENS` | Default: `8000` — increase to `16000` for SDD generation |

### 1.2 — Install dependencies

```bash
npm install
```

---

## §2 — Implementing `src/index.js`

### 2.1 — `postStreamingMessage` helper

Implement the streaming message helper first — both handlers depend on it.

```javascript
async function postStreamingMessage(client, channel, threadTs) {
  const result = await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: '⏳ On it...',
  });

  return {
    ts: result.ts,
    update: async (text) => {
      await client.chat.update({
        channel,
        ts: result.ts,
        text,
      });
    },
  };
}
```

### 2.2 — `/solution` slash command handler

Replace the `respond` placeholder with this full implementation:

```javascript
app.command('/solution', async ({ command, ack, client }) => {
  await ack();

  const { text: rawText, channel_id: channel, user_id: userId } = command;

  if (!rawText?.trim()) {
    await client.chat.postMessage({
      channel,
      text: '❓ Please provide a Jira ticket ID or problem description. Example:\n`/solution PROJ-1234` or `/solution We need a loyalty enrollment flow for...`',
    });
    return;
  }

  // Post placeholder immediately
  const { ts, update } = await postStreamingMessage(client, channel, undefined);

  try {
    let problemText = rawText.trim();

    // Try to fetch Jira ticket if an ID is detected
    const ticketId = extractTicketId(rawText);
    if (ticketId) {
      await update(`🎫 Fetching Jira ticket ${ticketId}...`);
      try {
        const ticket = await fetchJiraTicket(ticketId);
        problemText = formatTicketForPrompt(ticket) + '\n\n' + rawText;
      } catch (err) {
        // Don't block — just note it and continue with raw text
        problemText = `[Note: Could not fetch ${ticketId}: ${err.message}]\n\n${rawText}`;
      }
    }

    // Initialise history
    const history = [{ role: 'user', content: problemText }];
    const threadTs = ts;

    // Run agent
    const { text: responseText, skillsUsed, shouldEscalate } = await runAgent({
      problemText,
      history,
      onStatus: update,
    });

    // Handle escalation
    if (shouldEscalate) {
      const summary = await buildEscalationSummary({ problemText, history, agentResponse: responseText });
      await escalateToSA({
        client,
        summary,
        originalChannel: channel,
        originalTs: ts,
        csUserName: `<@${userId}>`,
      });
    }

    // Save history for thread follow-ups
    history.push({ role: 'assistant', content: responseText });
    threadHistories.set(threadTs, history);

    // Final update
    const skillBadge = skillsUsed.length ? `\n\n_Skills used: ${skillsUsed.join(', ')}_` : '';
    await update(responseText + skillBadge);

  } catch (err) {
    console.error('[/solution] Error:', err);
    await update(`❌ Something went wrong: ${err.message}\n\nPlease try again or contact the SA team directly.`);
  }
});
```

### 2.3 — `app_mention` handler

```javascript
app.event('app_mention', async ({ event, client }) => {
  const { channel, ts, thread_ts, user, text: rawText } = event;

  // Strip the bot mention text
  const problemText = rawText.replace(/<@[^>]+>\s*/g, '').trim();

  if (!problemText) {
    await client.chat.postMessage({
      channel,
      thread_ts: ts,
      text: '👋 Hi! Send me a Jira ticket ID or describe what you need. E.g.:\n`@SolutionBot gap analysis for this BRD: ...`',
    });
    return;
  }

  // Thread context: is this a reply in an existing thread?
  const parentTs = thread_ts || ts;
  const isReply = !!thread_ts;

  const { ts: replyTs, update } = await postStreamingMessage(client, channel, parentTs);

  try {
    // Get or init conversation history
    const history = getOrInitHistory(parentTs, problemText);

    // Add this user message to history
    history.push({ role: 'user', content: problemText });

    const { text: responseText, skillsUsed, shouldEscalate } = await runAgent({
      problemText,
      history,
      onStatus: update,
    });

    if (shouldEscalate) {
      const summary = await buildEscalationSummary({ problemText, history, agentResponse: responseText });
      await escalateToSA({
        client,
        summary,
        originalChannel: channel,
        originalTs: parentTs,
        csUserName: `<@${user}>`,
      });
    }

    // Add response to history
    history.push({ role: 'assistant', content: responseText });
    threadHistories.set(parentTs, history);

    const skillBadge = skillsUsed.length ? `\n\n_Skills used: ${skillsUsed.join(', ')}_` : '';
    await update(responseText + skillBadge);

  } catch (err) {
    console.error('[app_mention] Error:', err);
    await update(`❌ Error: ${err.message}`);
  }
});
```

---

## §3 — Implementing `src/orchestrator.js`

Replace the placeholder in `runAgent()` with this:

```javascript
export async function runAgent({ problemText, history, onStatus }) {
  // Step 1: Load skills
  await onStatus('🔍 Analysing request...');
  const { skillIds, prompt: skillPrompt } = await loadSkillsForProblem(problemText);

  if (skillIds.length) {
    await onStatus(`🧩 Loading skills: ${skillIds.join(', ')}...`);
  }

  // Step 2: Assemble system prompt
  const systemPrompt = BASE_SYSTEM_PROMPT + skillPrompt;

  // Step 3: MCP search status
  await onStatus('📚 Searching Capillary docs and Confluence...');

  // Step 4: Anthropic API call
  const maxTokens = parseInt(process.env.MAX_AGENT_TOKENS || '8000', 10);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: history,
      mcp_servers: getMcpServers(),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  // Step 5: Extract text
  await onStatus('✍️ Drafting response...');
  const data = await response.json();

  const responseText = data.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n\n');

  // Step 6: Detect escalation
  const threshold = parseInt(process.env.ESCALATION_THRESHOLD || '40', 10);
  const escalationPhrases = ['escalate', 'human sa', 'cannot determine', 'insufficient information', 'need more context from sa'];
  const shouldEscalate = escalationPhrases.some(p => responseText.toLowerCase().includes(p));

  return { text: responseText, skillsUsed: skillIds, shouldEscalate };
}
```

**Also implement `buildEscalationSummary()`:**

```javascript
export async function buildEscalationSummary({ problemText, history, agentResponse }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Summarise this CS escalation for the SA team in under 400 words.
Include: problem statement, what was researched, why SA is needed, suggested next steps.
Be concise and factual.

Problem: ${problemText}
Agent response: ${agentResponse}
Conversation turns: ${history.length}`,
      }],
    }),
  });

  const data = await response.json();
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
}
```

---

## §4 — Implementing tools

### 4.1 — `src/tools/jira.js`

Implement `fetchJiraTicket()`:

```javascript
export async function fetchJiraTicket(ticketId) {
  const baseUrl = process.env.JIRA_BASE_URL;
  const token = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !token) {
    throw new Error('JIRA_BASE_URL and JIRA_API_TOKEN must be set in .env');
  }

  const res = await fetch(
    `${baseUrl}/rest/api/3/issue/${ticketId}?fields=summary,description,status,priority,issuetype,assignee,labels`,
    {
      headers: {
        'Authorization': `Basic ${token}`,
        'Accept': 'application/json',
      },
    }
  );

  if (res.status === 404) throw new Error(`Ticket ${ticketId} not found`);
  if (res.status === 401) throw new Error('Jira auth failed — check JIRA_API_TOKEN');
  if (!res.ok) throw new Error(`Jira API error: ${res.status}`);

  const data = await res.json();
  const f = data.fields;

  return {
    id: ticketId,
    summary: f.summary || '',
    description: adfToPlainText(f.description),
    status: f.status?.name || 'Unknown',
    priority: f.priority?.name || 'Unknown',
    type: f.issuetype?.name || 'Unknown',
    labels: f.labels || [],
    url: `${baseUrl}/browse/${ticketId}`,
  };
}
```

Implement `adfToPlainText()`:

```javascript
export function adfToPlainText(adf) {
  if (!adf) return '';
  if (typeof adf === 'string') return adf;

  function walk(node) {
    if (!node) return '';
    if (node.type === 'text') return node.text || '';
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'mention') return `@${node.attrs?.text || 'user'}`;

    const children = (node.content || []).map(walk).join('');

    switch (node.type) {
      case 'paragraph': return children + '\n';
      case 'heading': return `\n${'#'.repeat(node.attrs?.level || 1)} ${children}\n`;
      case 'bulletList': return children;
      case 'orderedList': return children;
      case 'listItem': return `- ${children}`;
      case 'codeBlock': return `\`\`\`\n${children}\n\`\`\`\n`;
      case 'inlineCode': return `\`${children}\``;
      case 'blockquote': return `> ${children}`;
      default: return children;
    }
  }

  return walk(adf).trim();
}
```

### 4.2 — `src/tools/escalate.js`

Implement `escalateToSA()` with Block Kit:

```javascript
export async function escalateToSA({ client, summary, originalChannel, originalTs, csUserName }) {
  const channelId = process.env.SLACK_SA_CHANNEL_ID;
  if (!channelId) {
    console.warn('[escalate] SLACK_SA_CHANNEL_ID not set — skipping SA notification');
    return;
  }

  // Build Slack thread URL (works for most Slack workspaces)
  const threadUrl = `https://slack.com/archives/${originalChannel}/p${originalTs.replace('.', '')}`;

  await client.chat.postMessage({
    channel: channelId,
    text: `🚨 SA Escalation from ${csUserName}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🚨 SA Escalation Required', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*From:* ${csUserName}\n*Original thread:* <${threadUrl}|View conversation>`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: summary },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '📎 View Thread' },
            url: threadUrl,
            style: 'primary',
          },
        ],
      },
    ],
  });

  console.log(`[escalate] SA notification posted to ${channelId}`);
}
```

---

## §5 — Slack app configuration

Go to https://api.slack.com/apps → Select or create your app.

### 5.1 — Enable Socket Mode
Basic Information → Enable Socket Mode → On
App-Level Tokens → Generate Token → Name: `socket-token`, Scope: `connections:write`
Copy the `xapp-` token to `SLACK_APP_TOKEN` in `.env`

### 5.2 — OAuth scopes
OAuth & Permissions → Bot Token Scopes → Add:
- `chat:write`
- `chat:write.public` (to post in channels without being invited)
- `commands`
- `app_mentions:read`
- `channels:history`
- `im:write` (for DM escalation future use)

Install App → copy `xoxb-` token to `SLACK_BOT_TOKEN` in `.env`

### 5.3 — Event subscriptions
Event Subscriptions → Enable Events → Subscribe to bot events:
- `app_mention`

### 5.4 — Slash commands
Slash Commands → Create New Command:
- Command: `/solution`
- Short description: `Ask the Capillary Solution Agent`
- Usage hint: `[JIRA-ID or problem description]`
- Request URL: leave blank (Socket Mode handles it)

### 5.5 — Invite bot to channels
In Slack: `/invite @YourBotName` in the CS team channel and SA escalation channel.

---

## §6 — Local testing

```bash
npm run dev
```

Expected startup output:
```
✅ Capillary Solution Agent running

── MCP Server Status ──────────────────────
  ✓ atlassian          Jira + Confluence
  ✓ capillary-docs     Capillary product API specs and documentation
  ✗ gmail              SA escalation emails
  ✗ gcal               SA calendar scheduling for escalations
────────────────────────────────────────────

Skills dir: /path/to/project/skills
```

Test sequence:
1. `/solution PROJ-1234` — should fetch ticket and respond
2. `@SolutionBot gap analysis for this BRD: [paste text]` — should load gap-analyzer skill
3. `@SolutionBot create an SDD for the loyalty enrollment module` — should load sdd-writer skill
4. Reply in the thread — should maintain conversation history
5. Test escalation: ask something deliberately vague and ambiguous

---

## §7 — Railway deployment

### 7.1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit — Capillary Solution Agent"
git remote add origin https://github.com/YOUR_ORG/capillary-solution-agent.git
git push -u origin main
```

### 7.2 — Create Railway project

1. Go to https://railway.app → New Project
2. Deploy from GitHub repo → select `capillary-solution-agent`
3. Railway auto-detects Node.js and uses `railway.toml` settings
4. First deploy will fail — env vars not set yet

### 7.3 — Add environment variables in Railway

Railway Dashboard → Your Project → Variables tab → Add all variables from `.env.example`:

```
SLACK_BOT_TOKEN        = xoxb-...
SLACK_APP_TOKEN        = xapp-...
SLACK_SA_CHANNEL_ID    = C0XXXXXXX
ANTHROPIC_API_KEY      = sk-ant-...
ATLASSIAN_MCP_URL      = https://mcp.atlassian.com/v1/mcp
ATLASSIAN_MCP_TOKEN    = ...
CAPILLARY_MCP_URL      = https://docs.capillarytech.com/mcp
CAPILLARY_MCP_TOKEN    = ...
GMAIL_MCP_URL          = https://gmail.mcp.claude.com/mcp
GMAIL_MCP_TOKEN        = ...
GCAL_MCP_URL           = https://gcal.mcp.claude.com/mcp
GCAL_MCP_TOKEN         = ...
JIRA_BASE_URL          = https://capillarytech.atlassian.net
JIRA_API_TOKEN         = base64(email:token)
SA_ESCALATION_EMAIL    = sa-team@capillarytech.com
ESCALATION_THRESHOLD   = 40
MAX_AGENT_TOKENS       = 8000
NODE_ENV               = production
```

### 7.4 — Trigger redeploy

After adding variables: Railway Dashboard → Your Service → Redeploy

### 7.5 — Rotating tokens in production (no redeploy needed)

To rotate any API key or token:
```
Railway Dashboard → Variables → click the variable → edit value → save
```
Railway hot-reloads env vars. The Node.js process restarts automatically.
For zero-downtime rotation, Railway keeps the old instance alive until the
new one is healthy.

Or via Railway CLI:
```bash
railway variables set ANTHROPIC_API_KEY=sk-ant-newkey123
```

### 7.6 — Monitoring

Railway Dashboard → Your Service → Logs tab
Filter for `[escalate]`, `[/solution]`, `[app_mention]` prefixes.

For production alerting, add a Railway uptime monitor:
Settings → Add Monitor → HTTP check on `/health` endpoint.

Add a health endpoint to `src/index.js`:
```javascript
// Add before app.start()
app.receiver.router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});
```

---

## §8 — Adding new skills (ongoing)

1. Create `skills/my-new-skill/SKILL.md` with skill instructions
2. Add supporting reference `.md` files in the same folder if needed
3. Add entry to `skills/registry.json`:
   ```json
   {
     "id": "my-new-skill",
     "folder": "my-new-skill",
     "description": "...",
     "triggers": ["keyword1", "keyword2"]
   }
   ```
4. Commit and push — Railway redeploys automatically
5. Test with a Slack message containing one of the trigger keywords

---

## §9 — Phase 2 enhancements (future work)

These are deliberately out of scope for Phase 1 but should be planned:

| Feature | Effort | Notes |
|---|---|---|
| Persistent conversation history | Medium | Add Railway Postgres, replace threadHistories Map |
| Feedback loop | Medium | Add 👍👎 reaction listener, log to DB for skill tuning |
| Admin slash command | Small | `/solution-admin list-skills`, `/solution-admin reload` |
| Output as Confluence page | Medium | Use Atlassian MCP to create page from SDD output |
| Excalidraw file upload to Slack | Medium | Render JSON to file, use `files.upload` API |
| Rate limiting per user | Small | Add token bucket per user_id to prevent abuse |
| Skill hot-reload | Small | Watch `skills/` folder with fs.watch, invalidate cache |

---

## §10 — Cost estimates

| Component | Monthly estimate |
|---|---|
| Railway (512 MB instance) | ~$5 |
| Anthropic API (~200 queries, mixed depth) | ~$15–40 |
| GitHub (free tier) | $0 |
| Slack (free tier sufficient) | $0 |
| **Total** | **~$20–45/mo** |

SDD generation uses more tokens (~16k output). If SDD requests are frequent,
set `MAX_AGENT_TOKENS=16000` and budget ~$0.50–1.00 per SDD run.
