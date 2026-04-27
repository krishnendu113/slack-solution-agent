import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import { fileURLToPath } from 'url';
import path from 'path';
import { runAgent, buildEscalationSummary, AgentError } from './orchestrator.js';
import { upload, extractFileContent, buildAnthropicContent } from './fileHandler.js';
import { init as initStores, getConversationStore } from './stores/index.js';
import authRouter, { requireAuth, requirePasswordChange, bootstrapAdminIfNeeded } from './auth.js';
import { getDocument } from './documentStore.js';

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
  // Trust Railway's reverse proxy so secure cookies work behind HTTPS
  app.set('trust proxy', 1);
}

app.use(express.json());

app.use(session({
  secret: SESSION_SECRET,
  name: 'sid',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',  // 'lax' allows cookie to be set on OAuth redirects back from Google/Microsoft
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: process.env.NODE_ENV === 'production',
  },
}));

// ─── Auth router (login/logout/me/register — no auth required here) ──────────
app.use(authRouter);

// ─── Auth guard — protect everything except login page + auth endpoints ───────
app.use((req, res, next) => {
  const open = ['/login.html', '/about.html', '/admin.html', '/api/auth/login', '/api/auth/logout', '/api/auth/me', '/api/auth/providers'];
  if (open.some(p => req.path === p || req.path.startsWith('/api/auth/'))) return next();
  return requireAuth(req, res, next);
});

// ─── Must-change-password guard — restrict access until password is changed ──
app.use(requirePasswordChange);

app.use(express.static(path.join(__dirname, '../public')));

// ─── API: Document download ──────────────────────────────────────────────────

app.get('/api/documents/:downloadToken', (req, res) => {
  const doc = getDocument(req.params.downloadToken);
  if (!doc) {
    return res.status(410).json({ error: 'Download link expired or not found. Regenerate the document.' });
  }
  res.setHeader('Content-Disposition', `attachment; filename="${doc.filename}"`);
  res.setHeader('Content-Type', doc.contentType);
  res.send(doc.content);
});

// ─── API: Conversations ──────────────────────────────────────────────────────

app.get('/api/conversations', async (req, res) => {
  const convStore = getConversationStore();
  res.json(await convStore.listConversations(req.session.userId));
});

app.post('/api/conversations', async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  const convStore = getConversationStore();
  const conv = await convStore.createConversation(req.session.userId, message.trim());
  res.status(201).json(conv);
});

app.get('/api/conversations/:id', async (req, res) => {
  const convStore = getConversationStore();
  const conv = await convStore.getConversation(req.params.id, req.session.userId);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  res.json(conv);
});

app.delete('/api/conversations/:id', async (req, res) => {
  const convStore = getConversationStore();
  const deleted = await convStore.deleteConversation(req.params.id, req.session.userId);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ─── API: Send message (SSE stream) ─────────────────────────────────────────

app.post('/api/conversations/:id/messages', upload.array('files', 5), async (req, res) => {
  const convStore = getConversationStore();
  const conv = await convStore.getConversation(req.params.id, req.session.userId);
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
    const userMsg = {
      role: 'user',
      content: problemText || `(attached ${fileNames.join(', ')})`,
      ...(fileNames.length ? { files: fileNames } : {}),
    };
    await convStore.appendMessage(conv.id, userMsg);

    // Build history from existing messages + the just-appended user message
    // (MongoDB $push doesn't mutate the local conv object)
    const allMessages = [...conv.messages, userMsg];
    const history = allMessages.map((m, i, arr) => {
      if (i === arr.length - 1 && m.role === 'user' && extractedFiles.length) {
        return { role: 'user', content: buildAnthropicContent(problemText, extractedFiles) };
      }
      return { role: m.role, content: m.content };
    });

    const { text: responseText, skillsUsed, shouldEscalate } = await runAgent({
      problemText,
      history,
      userId: req.session.userId,
      conversationId: conv.id,
      onStatus: async (statusText) => sendEvent('status', { text: statusText }),
      onToken: async (text) => sendEvent('token', { text }),
      onToolStatus: async (info) => sendEvent('tool_status', info),
      onSkillActive: async (info) => sendEvent('skill_active', info),
      onPhase: async (name) => sendEvent('phase', { name }),
      onDocumentReady: async (info) => sendEvent('document_ready', info),
      onPlanUpdate: async (plan) => sendEvent('plan_update', plan),
    });

    let escalated = false;
    if (shouldEscalate) {
      escalated = true;
      const summary = await buildEscalationSummary({ problemText, history, agentResponse: responseText });
      console.log('[escalate] Escalation flagged:', summary);
    }

    const assistantMsg = { role: 'assistant', content: responseText, skillsUsed, escalated };
    await convStore.appendMessage(conv.id, assistantMsg);

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

// ─── SPA fallback ────────────────────────────────────────────────────────────

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─── Startup ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

(async () => {
  await initStores();
  await bootstrapAdminIfNeeded();
  app.listen(PORT, () => {
    console.log(`\n✅ Solution Agent running at http://localhost:${PORT}`);
    const jiraOk = !!(process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN);
    const confOk = !!(process.env.CONFLUENCE_BASE_URL && process.env.JIRA_EMAIL && process.env.CONFLUENCE_API_TOKEN);
    console.log(`  ${jiraOk ? '✓' : '✗'} Jira     ${confOk ? '✓' : '✗'} Confluence`);
    console.log('');
  });
})();
