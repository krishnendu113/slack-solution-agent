import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import { fileURLToPath } from 'url';
import path from 'path';
import { runAgent, buildEscalationSummary, AgentError } from './orchestrator.js';
import { upload, extractFileContent, buildAnthropicContent } from './fileHandler.js';
import * as store from './store.js';
import authRouter, { requireAuth, bootstrapAdminIfNeeded } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ─── Session ─────────────────────────────────────────────────────────────────

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.error('[server] FATAL: SESSION_SECRET env var is required');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  console.warn('[server] Warning: using MemoryStore for sessions — not suitable for multi-process deployments');
}

app.use(express.json());

app.use(session({
  secret: SESSION_SECRET,
  name: 'sid',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: process.env.NODE_ENV === 'production',
  },
}));

// ─── Auth router (login/logout/me/register — no auth required here) ──────────
app.use(authRouter);

// ─── Auth guard — protect everything except login page + auth endpoints ───────
app.use((req, res, next) => {
  const open = ['/login.html', '/api/auth/login', '/api/auth/logout', '/api/auth/me'];
  if (open.some(p => req.path === p || req.path.startsWith('/api/auth/'))) return next();
  return requireAuth(req, res, next);
});

app.use(express.static(path.join(__dirname, '../public')));

// ─── API: Conversations ──────────────────────────────────────────────────────

app.get('/api/conversations', (_req, res) => {
  res.json(store.listConversations());
});

app.post('/api/conversations', async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  const conv = await store.createConversation(message.trim());
  res.status(201).json(conv);
});

app.get('/api/conversations/:id', (req, res) => {
  const conv = store.getConversation(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  res.json(conv);
});

app.delete('/api/conversations/:id', async (req, res) => {
  const deleted = await store.deleteConversation(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ─── API: Send message (SSE stream) ─────────────────────────────────────────

app.post('/api/conversations/:id/messages', upload.array('files', 5), async (req, res) => {
  const conv = store.getConversation(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  const content = req.body?.content || '';
  const files = req.files || [];
  if (!content.trim() && !files.length) return res.status(400).json({ error: 'content or files required' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const problemText = content.trim();

    let extractedFiles = [];
    if (files.length) {
      sendEvent('status', { text: `📎 Processing ${files.length} file(s)...` });
      extractedFiles = await Promise.all(files.map(extractFileContent));
    }

    const fileNames = files.map(f => f.originalname);
    await store.appendMessage(conv.id, {
      role: 'user',
      content: problemText || `(attached ${fileNames.join(', ')})`,
      ...(fileNames.length ? { files: fileNames } : {}),
    });

    const history = conv.messages.map((m, i, arr) => {
      if (i === arr.length - 1 && m.role === 'user' && extractedFiles.length) {
        return { role: 'user', content: buildAnthropicContent(problemText, extractedFiles) };
      }
      return { role: m.role, content: m.content };
    });

    const { text: responseText, skillsUsed, shouldEscalate } = await runAgent({
      problemText,
      history,
      onStatus: async (statusText) => sendEvent('status', { text: statusText }),
      onToken: async (text) => sendEvent('token', { text }),
      onToolStatus: async (info) => sendEvent('tool_status', info),
      onSkillActive: async (info) => sendEvent('skill_active', info),
      onPhase: async (name) => sendEvent('phase', { name }),
    });

    let escalated = false;
    if (shouldEscalate) {
      escalated = true;
      const summary = await buildEscalationSummary({ problemText, history, agentResponse: responseText });
      console.log('[escalate] Escalation flagged:', summary);
    }

    const assistantMsg = { role: 'assistant', content: responseText, skillsUsed, escalated };
    await store.appendMessage(conv.id, assistantMsg);

    sendEvent('message', assistantMsg);
    res.end();

  } catch (err) {
    console.error('[server] Error processing message:', err.technical || err.message);
    const friendly = (err instanceof AgentError)
      ? err.message
      : `Oops, something broke on our end. The gremlins have been notified. (${err.message})`;
    sendEvent('error', { text: friendly });
    res.end();
  }
});

// ─── About / presentation page ───────────────────────────────────────────────

app.get('/about', (_req, res) => {
  res.sendFile(path.join(__dirname, '../presentation.html'));
});

// ─── SPA fallback ────────────────────────────────────────────────────────────

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─── Startup ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

(async () => {
  await store.init();
  await bootstrapAdminIfNeeded();
  app.listen(PORT, () => {
    console.log(`\n✅ Solution Agent running at http://localhost:${PORT}`);
    const jiraOk = !!(process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN);
    const confOk = !!(process.env.CONFLUENCE_BASE_URL && process.env.JIRA_EMAIL && process.env.CONFLUENCE_API_TOKEN);
    console.log(`  ${jiraOk ? '✓' : '✗'} Jira     ${confOk ? '✓' : '✗'} Confluence`);
    console.log('');
  });
})();
