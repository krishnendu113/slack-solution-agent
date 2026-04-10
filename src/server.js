/**
 * server.js — Express entry point (replaces Slack Bolt)
 *
 * Serves the chat UI from public/ and exposes REST + SSE API
 * for conversation management and agent interaction.
 */

import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import { runAgent, buildEscalationSummary, AgentError } from './orchestrator.js';
import { upload, extractFileContent, buildAnthropicContent } from './fileHandler.js';
import * as store from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ─── Session Auth ────────────────────────────────────────────────────────────
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS || '';
const SESSION_SECRET = AUTH_PASS ? crypto.createHash('sha256').update(AUTH_PASS).digest('hex') : '';

function createSessionToken(user) {
  const payload = `${user}:${Date.now()}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64')}.${sig}`;
}

function validateSessionToken(token) {
  if (!token || !SESSION_SECRET) return false;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return false;
  const payload = Buffer.from(payloadB64, 'base64').toString();
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || '';
  const match = cookies.split(';').map(c => c.trim()).find(c => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

app.use(express.json());

// Login/logout endpoints (before auth middleware)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === AUTH_USER && password === AUTH_PASS && AUTH_PASS) {
    const token = createSessionToken(username);
    res.set('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Invalid username or password.' });
});

app.get('/api/logout', (_req, res) => {
  res.set('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
  res.redirect('/login.html');
});

// Auth middleware — protect everything except login page and its assets
if (AUTH_PASS) {
  app.use((req, res, next) => {
    // Allow login page and its resources
    if (req.path === '/login.html' || req.path === '/api/login') return next();

    const token = getCookie(req, 'session');
    if (validateSessionToken(token)) return next();

    // Not authenticated
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    return res.redirect('/login.html');
  });
}

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
// Accepts both JSON and multipart/form-data (for file uploads)

app.post('/api/conversations/:id/messages', upload.array('files', 5), async (req, res) => {
  const conv = store.getConversation(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  const content = req.body?.content || '';
  const files = req.files || [];
  if (!content.trim() && !files.length) return res.status(400).json({ error: 'content or files required' });

  // Set up SSE
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

    // Extract uploaded file content
    let extractedFiles = [];
    if (files.length) {
      sendEvent('status', { text: `📎 Processing ${files.length} file(s)...` });
      extractedFiles = await Promise.all(files.map(extractFileContent));
    }

    // Append user message to store (original text + file names for UI display)
    const fileNames = files.map(f => f.originalname);
    await store.appendMessage(conv.id, {
      role: 'user',
      content: problemText || `(attached ${fileNames.join(', ')})`,
      ...(fileNames.length ? { files: fileNames } : {}),
    });

    // Build history for Anthropic API
    const history = conv.messages.map((m, i, arr) => {
      if (i === arr.length - 1 && m.role === 'user' && extractedFiles.length) {
        return { role: 'user', content: buildAnthropicContent(problemText, extractedFiles) };
      }
      return { role: m.role, content: m.content };
    });

    // Run agent with SSE streaming callbacks
    const { text: responseText, skillsUsed, shouldEscalate } = await runAgent({
      problemText,
      history,
      onStatus: async (statusText) => sendEvent('status', { text: statusText }),
      onToken: async (text) => sendEvent('token', { text }),
      onToolStatus: async (info) => sendEvent('tool_status', info),
      onSkillActive: async (info) => sendEvent('skill_active', info),
    });

    // Handle escalation
    let escalated = false;
    if (shouldEscalate) {
      escalated = true;
      const summary = await buildEscalationSummary({
        problemText,
        history,
        agentResponse: responseText,
      });
      console.log('[escalate] Escalation flagged:', summary);
    }

    // Save assistant message
    const assistantMsg = { role: 'assistant', content: responseText, skillsUsed, escalated };
    await store.appendMessage(conv.id, assistantMsg);

    // Send final message event
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
  await store.init();
  app.listen(PORT, () => {
    console.log(`\n✅ Solution Agent running at http://localhost:${PORT}`);
    const jiraOk = !!(process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN);
    const confOk = !!(process.env.CONFLUENCE_BASE_URL && process.env.JIRA_EMAIL && process.env.CONFLUENCE_API_TOKEN);
    console.log(`  ${jiraOk ? '✓' : '✗'} Jira     ${confOk ? '✓' : '✗'} Confluence`);
    console.log('');
  });
})();
