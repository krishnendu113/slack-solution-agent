import { Router } from 'express';
import bcrypt from 'bcrypt';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.join(__dirname, '../data/users.json');
const BCRYPT_ROUNDS = 12;
const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || 'capillarytech.com';

// ─── User store helpers ──────────────────────────────────────────────────────

function loadUsers() {
  if (!existsSync(USERS_FILE)) return [];
  try { return JSON.parse(readFileSync(USERS_FILE, 'utf8')); }
  catch { return []; }
}

function saveUsers(users) {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function findUserByEmail(email) {
  return loadUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
}

async function createUser({ email, password = null, role = 'user' }) {
  const users = loadUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('User already exists');
  }
  const passwordHash = password ? await bcrypt.hash(password, BCRYPT_ROUNDS) : null;
  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  return user;
}

// Upsert for SSO — create on first login, return existing on subsequent logins
function upsertSsoUser(email) {
  const existing = findUserByEmail(email);
  if (existing) return existing;
  const users = loadUsers();
  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash: null,
    role: 'user',
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  return user;
}

// ─── Bootstrap first admin ───────────────────────────────────────────────────

export async function bootstrapAdminIfNeeded() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const pass = process.env.BOOTSTRAP_ADMIN_PASS;
  if (!email || !pass) return;
  const users = loadUsers();
  if (users.length > 0) return;
  console.log(`[auth] Bootstrapping admin user: ${email}`);
  await createUser({ email, password: pass, role: 'admin' });
}

// ─── Auth middleware ─────────────────────────────────────────────────────────

export function requireAuth(req, res, next) {
  if (req.session?.userId) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
  return res.redirect('/login.html');
}

// ─── Passport setup ──────────────────────────────────────────────────────────

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = loadUsers().find(u => u.id === id);
  done(null, user || false);
});

function domainAllowed(email) {
  return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

function makeSsoCallback(provider) {
  return (_accessToken, _refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(new Error(`No email returned from ${provider}`));
    if (!domainAllowed(email)) {
      const err = new Error(`Access restricted to @${ALLOWED_DOMAIN} accounts`);
      err.status = 403;
      return done(err);
    }
    const user = upsertSsoUser(email);
    done(null, user);
  };
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
  }, makeSsoCallback('Google')));
}

if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
  passport.use(new MicrosoftStrategy({
    clientID: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    callbackURL: process.env.MICROSOFT_CALLBACK_URL || '/auth/microsoft/callback',
    scope: ['user.read'],
  }, makeSsoCallback('Microsoft')));
}

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

router.use(passport.initialize());
router.use(passport.session());

// Password login
router.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const user = findUserByEmail(email);
  if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid email or password.' });

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

  req.session.userId = user.id;
  req.session.email = user.email;
  req.session.role = user.role;
  res.json({ ok: true, email: user.email, role: user.role });
});

router.get('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.redirect('/login.html');
  });
});

router.get('/api/auth/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ email: req.session.email, role: req.session.role });
});

router.post('/api/auth/register', async (req, res) => {
  if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const { email, password, role = 'user' } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'role must be user or admin' });

  try {
    const user = await createUser({ email, password, role });
    res.status(201).json({ ok: true, id: user.id, email: user.email, role: user.role });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

// Google SSO
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback',
  passport.authenticate('google', { session: false, failWithError: true }),
  (req, res) => {
    req.session.userId = req.user.id;
    req.session.email = req.user.email;
    req.session.role = req.user.role;
    res.redirect('/');
  },
  (err, req, res, _next) => {
    const status = err.status || 500;
    res.status(status).send(`<h2>${err.message}</h2><a href="/login.html">Back to login</a>`);
  }
);

// Microsoft SSO
router.get('/auth/microsoft', passport.authenticate('microsoft'));

router.get('/auth/microsoft/callback',
  passport.authenticate('microsoft', { session: false, failWithError: true }),
  (req, res) => {
    req.session.userId = req.user.id;
    req.session.email = req.user.email;
    req.session.role = req.user.role;
    res.redirect('/');
  },
  (err, req, res, _next) => {
    const status = err.status || 500;
    res.status(status).send(`<h2>${err.message}</h2><a href="/login.html">Back to login</a>`);
  }
);

export default router;
