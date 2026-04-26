import { Router } from 'express';
import bcrypt from 'bcrypt';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import { getUserStore } from './stores/index.js';
import { validatePassword } from './passwordPolicy.js';
import { logAuditEvent } from './auditLogger.js';
import { isLocked, applyFailedAttempt, resetLockout, LOCKOUT_THRESHOLD, LOCKOUT_DURATION_MS } from './lockout.js';

const BCRYPT_ROUNDS = 12;

/**
 * Returns a shallow copy of a user object with the passwordHash field removed.
 * @param {object} user
 * @returns {object}
 */
function stripPasswordHash(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || 'capillarytech.com';

// ─── Bootstrap first admin ───────────────────────────────────────────────────

export async function bootstrapAdminIfNeeded() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const pass = process.env.BOOTSTRAP_ADMIN_PASS;
  if (!email || !pass) return;

  const store = getUserStore();
  const existing = await store.findUserByEmail(email);
  if (existing) return;

  console.log(`[auth] Bootstrapping admin user: ${email}`);
  await store.createUser({ email, password: pass, role: 'admin', firstName: 'Admin', lastName: 'User', passwordType: 'permanent', mustChangePassword: false, createdBy: 'system' });
}

// ─── Auth middleware ─────────────────────────────────────────────────────────

export function requireAuth(req, res, next) {
  if (req.session?.userId) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
  return res.redirect('/login.html');
}

/**
 * Middleware that blocks access to all endpoints except password change,
 * logout, and me when the session indicates mustChangePassword.
 */
export function requirePasswordChange(req, res, next) {
  if (!req.session?.mustChangePassword) return next();

  const allowed = ['/api/auth/change-password', '/api/auth/logout', '/api/auth/me'];
  if (allowed.includes(req.path)) return next();

  return res.status(403).json({ error: 'Password change required before accessing this resource' });
}

// ─── Passport setup ──────────────────────────────────────────────────────────

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    // Deserialize by looking up the user store — find by iterating isn't ideal
    // but the store interface only exposes findByEmail. For now, we store the
    // email in the session and use that for deserialization if needed.
    // Passport deserialization is only used for SSO flows; session-based auth
    // uses req.session.userId directly.
    done(null, { id });
  } catch (err) {
    done(err, false);
  }
});

function domainAllowed(email) {
  return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

function makeSsoCallback(provider) {
  return async (_accessToken, _refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(new Error(`No email returned from ${provider}`));
    if (!domainAllowed(email)) {
      const err = new Error(`Access restricted to @${ALLOWED_DOMAIN} accounts`);
      err.status = 403;
      return done(err);
    }
    try {
      const store = getUserStore();
      const user = await store.upsertSsoUser(email);

      // Update first/last name from profile if not already set
      const firstName = profile.name?.givenName || profile.displayName?.split(' ')[0] || '';
      const lastName = profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';
      if ((!user.firstName || !user.lastName) && (firstName || lastName)) {
        await store.updateUser(user.id, {
          firstName: user.firstName || firstName,
          lastName: user.lastName || lastName,
        });
        user.firstName = user.firstName || firstName;
        user.lastName = user.lastName || lastName;
      }

      done(null, user);
    } catch (err) {
      done(err);
    }
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

  const store = getUserStore();
  const user = await store.findUserByEmail(email);
  if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid email or password.' });

  // Check lockout state before password verification
  const lockoutState = isLocked(user);
  if (lockoutState.locked) {
    const remainingMinutes = Math.ceil(lockoutState.remainingMs / 60000);
    return res.status(423).json({ error: `Account locked. Try again in ${remainingMinutes} minutes` });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    // Increment failed attempts
    const newLockoutState = applyFailedAttempt(user, {
      threshold: LOCKOUT_THRESHOLD,
      durationMs: LOCKOUT_DURATION_MS,
    });
    await store.updateUser(user.id, newLockoutState);

    // Log LOGIN_FAILED audit event
    logAuditEvent({
      event: 'LOGIN_FAILED',
      actor: email,
      target: email,
    });

    // Log ACCOUNT_LOCKED if threshold reached
    if (newLockoutState.failedLoginAttempts >= LOCKOUT_THRESHOLD) {
      logAuditEvent({
        event: 'ACCOUNT_LOCKED',
        actor: email,
        target: email,
      });
    }

    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Successful login
  if (user.mustChangePassword) {
    // Set session with mustChangePassword flag
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.role = user.role;
    req.session.mustChangePassword = true;
    return res.json({ ok: true, mustChangePassword: true, email: user.email });
  }

  // Normal login — reset lockout, establish full session, log success
  const lockoutReset = resetLockout();
  await store.updateUser(user.id, lockoutReset);

  req.session.userId = user.id;
  req.session.email = user.email;
  req.session.role = user.role;

  logAuditEvent({
    event: 'LOGIN_SUCCESS',
    actor: user.email,
  });

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
  res.json({ email: req.session.email, role: req.session.role, isSso: !!req.session.isSso });
});

router.get('/api/auth/providers', (_req, res) => {
  res.json({
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    microsoft: !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
  });
});

router.post('/api/auth/register', async (req, res) => {
  if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const { email, password, role = 'user' } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'role must be user or admin' });

  try {
    const store = getUserStore();
    const user = await store.createUser({
      email,
      password,
      role,
      firstName: '',
      lastName: '',
      passwordType: 'permanent',
      mustChangePassword: false,
      createdBy: req.session.email || 'system',
    });
    res.status(201).json({ ok: true, id: user.id, email: user.email, role: user.role });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

// ─── User Management Endpoints ───────────────────────────────────────────────

// POST /api/users — Admin-only: create a new user
router.post('/api/users', async (req, res) => {
  if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const { firstName, lastName, email, password, role, passwordType } = req.body || {};

  // Validate required fields
  if (!firstName || !lastName || !email || !password || !role) {
    return res.status(400).json({ error: 'firstName, lastName, email, password, and role are required' });
  }

  // Validate firstName and lastName are non-empty strings
  if (typeof firstName !== 'string' || firstName.trim() === '' ||
      typeof lastName !== 'string' || lastName.trim() === '') {
    return res.status(400).json({ error: 'firstName and lastName must be non-empty strings' });
  }

  // Validate role
  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: "role must be 'user' or 'admin'" });
  }

  // Validate passwordType
  if (!passwordType || !['one-time', 'permanent'].includes(passwordType)) {
    return res.status(400).json({ error: "passwordType must be 'one-time' or 'permanent'" });
  }

  // Validate password policy
  const policyResult = validatePassword(password);
  if (!policyResult.valid) {
    return res.status(400).json({ error: `Password policy violation: ${policyResult.violations.join(', ')}` });
  }

  try {
    const store = getUserStore();

    // Check email uniqueness (case-insensitive) — createUser will throw if duplicate
    const mustChangePassword = passwordType === 'one-time';
    const user = await store.createUser({
      email,
      password,
      role,
      firstName,
      lastName,
      passwordType,
      mustChangePassword,
      createdBy: req.session.email,
    });

    // Log audit event (fire-and-forget)
    logAuditEvent({
      event: 'USER_CREATED',
      actor: req.session.email,
      target: email,
      details: { role, passwordType },
    });

    res.status(201).json(stripPasswordHash(user));
  } catch (err) {
    if (err.message === 'User already exists') {
      return res.status(409).json({ error: 'User already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users — Admin-only: list all users
router.get('/api/users', async (req, res) => {
  if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const store = getUserStore();
    const users = await store.listUsers();
    res.json(users.map(stripPasswordHash));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id — Admin-only: get single user
router.get('/api/users/:id', async (req, res) => {
  if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const store = getUserStore();
    const user = await store.findUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(stripPasswordHash(user));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/:id — Admin-only: update user profile
router.put('/api/users/:id', async (req, res) => {
  if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const { firstName, lastName, role } = req.body || {};
  const updates = {};

  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  if (role !== undefined) {
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: "role must be 'user' or 'admin'" });
    }
    updates.role = role;
  }

  try {
    const store = getUserStore();
    const user = await store.updateUser(req.params.id, updates);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(stripPasswordHash(user));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:id — Admin-only: delete user
router.delete('/api/users/:id', async (req, res) => {
  if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const store = getUserStore();
    const deleted = await store.deleteUser(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/:id/reset-password — Admin-only: reset user password
router.post('/api/users/:id/reset-password', async (req, res) => {
  if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const { password, passwordType } = req.body || {};

  if (!password) {
    return res.status(400).json({ error: 'password is required' });
  }

  // Validate passwordType
  if (!passwordType || !['one-time', 'permanent'].includes(passwordType)) {
    return res.status(400).json({ error: "passwordType must be 'one-time' or 'permanent'" });
  }

  // Validate password policy
  const policyResult = validatePassword(password);
  if (!policyResult.valid) {
    return res.status(400).json({ error: `Password policy violation: ${policyResult.violations.join(', ')}` });
  }

  try {
    const store = getUserStore();
    const user = await store.findUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Block password reset for SSO-only users (passwordHash is null)
    if (user.passwordHash === null) {
      return res.status(400).json({ error: 'Cannot reset password for SSO-only users. This user authenticates via Google/Microsoft.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const mustChangePassword = passwordType === 'one-time';
    const lockoutReset = resetLockout();

    const updated = await store.updateUser(req.params.id, {
      passwordHash,
      mustChangePassword,
      passwordType,
      ...lockoutReset,
    });

    // Log audit event (fire-and-forget)
    logAuditEvent({
      event: 'PASSWORD_RESET',
      actor: req.session.email,
      target: user.email,
      details: { passwordType },
    });

    res.json(stripPasswordHash(updated));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/change-password — Authenticated user: change own password
router.post('/api/auth/change-password', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });

  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }

  // Validate new password policy
  const policyResult = validatePassword(newPassword);
  if (!policyResult.valid) {
    return res.status(400).json({ error: `Password policy violation: ${policyResult.violations.join(', ')}` });
  }

  try {
    const store = getUserStore();
    const user = await store.findUserById(req.session.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Block password change for SSO-only users
    if (user.passwordHash === null) {
      return res.status(400).json({ error: 'SSO users cannot change passwords. Your account is managed by Google/Microsoft.' });
    }

    // Verify current password
    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    // Hash new password and update
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await store.updateUser(user.id, {
      passwordHash,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lastPasswordChange: new Date().toISOString(),
    });

    // Update session to reflect password change complete
    req.session.mustChangePassword = false;

    // Log audit event (fire-and-forget)
    logAuditEvent({
      event: 'PASSWORD_CHANGED',
      actor: user.email,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
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
    req.session.isSso = true;
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
    req.session.isSso = true;
    res.redirect('/');
  },
  (err, req, res, _next) => {
    const status = err.status || 500;
    res.status(status).send(`<h2>${err.message}</h2><a href="/login.html">Back to login</a>`);
  }
);

export default router;
