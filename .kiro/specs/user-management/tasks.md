# Implementation Plan: User Management

## Overview

Implement the User Management module for the Capillary Solution Agent. The plan builds foundational pure-function modules first (password policy, lockout), then the audit store and extended user store, then wires everything into the auth router with new endpoints and middleware. Property-based tests and unit tests are interleaved with implementation tasks for early validation.

## Tasks

- [x] 1. Implement Password Policy Validator
  - [x] 1.1 Create `src/passwordPolicy.js` with `validatePassword` function
    - Export a pure function that checks: min 8 chars, at least one uppercase, one lowercase, one digit, one special character
    - Return `{ valid: boolean, violations: string[] }` with specific violation messages for each failed rule
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 1.2 Write property test for password policy validation correctness
    - Create `src/__tests__/passwordPolicy.prop.test.js`
    - **Property 3: Password policy validation correctness**
    - For any string, `validatePassword` returns `valid: true` iff the string meets all five rules; `violations` lists exactly the unmet rules
    - Use 100+ iterations (pure function, fast)
    - **Validates: Requirements 5.1, 5.2**

  - [x] 1.3 Write property test for password policy idempotence
    - Add to `src/__tests__/passwordPolicy.prop.test.js`
    - **Property 4: Password policy validation idempotence**
    - For any string, calling `validatePassword` multiple times produces identical results
    - Use 100+ iterations
    - **Validates: Requirements 13.3**

- [x] 2. Implement Lockout Manager
  - [x] 2.1 Create `src/lockout.js` with `isLocked`, `applyFailedAttempt`, and `resetLockout` functions
    - `isLocked(user, now)` returns `{ locked: boolean, remainingMs: number }` based on `lockedUntil` vs `now`
    - `applyFailedAttempt(user, config, now)` increments counter and sets `lockedUntil` when threshold reached
    - `resetLockout()` returns `{ failedLoginAttempts: 0, lockedUntil: null }`
    - Export constants `LOCKOUT_THRESHOLD = 5` and `LOCKOUT_DURATION_MS = 15 * 60 * 1000`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 2.2 Write property test for lockout state
    - Create `src/__tests__/lockout.prop.test.js`
    - **Property 8: Lockout state determined by timestamp comparison**
    - For any `lockedUntil` timestamp and reference time `now`, `isLocked` returns `locked: true` when `lockedUntil` is in the future, `false` when in the past or null
    - Use 100+ iterations (pure function, fast)
    - **Validates: Requirements 6.3, 6.5**

  - [x] 2.3 Write property test for failed login counter
    - Add to `src/__tests__/lockout.prop.test.js`
    - **Property 9: Failed login counter increments monotonically**
    - For any sequence of N consecutive failed attempts (N < threshold), `failedLoginAttempts` equals N
    - Use 100+ iterations
    - **Validates: Requirements 6.1**

- [x] 3. Checkpoint — Verify foundational modules
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Audit Store and Audit Logger
  - [x] 4.1 Create `src/stores/json/auditStore.js`
    - Implement `init()`, `appendEntry(entry)`, `listEntries(filter?)` following the JSON-file write-queue pattern from `userStore.js`
    - Store entries in `data/audit.json` as an append-only array
    - Each entry: `{ id, event, actor, target, details, timestamp }`
    - Include `_reset()` and `_flush()` helpers for testing
    - _Requirements: 7.7, 10.1, 10.2, 10.3_

  - [x] 4.2 Register audit store in `src/stores/index.js`
    - Add `auditStore` variable and `getAuditStore()` export
    - Import and init `auditStore` in the JSON backend branch of `init()`
    - _Requirements: 10.1, 10.5_

  - [x] 4.3 Create `src/auditLogger.js` with `logAuditEvent` function
    - Thin wrapper that calls `getAuditStore().appendEntry(...)` with a generated UUID and timestamp
    - Fire-and-forget pattern: catch and log errors to console without blocking the caller
    - Support event types: `USER_CREATED`, `PASSWORD_CHANGED`, `PASSWORD_RESET`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `LOGIN_SUCCESS`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 5. Extend User Store with new methods
  - [x] 5.1 Add `findUserById`, `listUsers`, `updateUser`, `deleteUser` to `src/stores/json/userStore.js`
    - `findUserById(id)` → returns user or null
    - `listUsers()` → returns all user records
    - `updateUser(id, fields)` → merges fields into existing record, saves, returns updated user or null
    - `deleteUser(id)` → removes user from array, saves, returns boolean
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 12.1_

  - [x] 5.2 Update `createUser` in `src/stores/json/userStore.js` to accept extended fields
    - Accept `firstName`, `lastName`, `passwordType`, `mustChangePassword`, `createdBy` in the options object
    - Store all new fields with defaults: `failedLoginAttempts: 0`, `lockedUntil: null`, `lastPasswordChange: null`
    - Preserve backward compatibility — existing callers without new fields still work
    - _Requirements: 1.1, 12.1, 12.2, 12.3_

  - [x] 5.3 Write property test for user creation stores all required fields
    - Create `src/__tests__/userManagement.prop.test.js`
    - **Property 7: User creation stores all required fields**
    - For any valid creation input, the stored record contains all specified fields with correct types
    - Use 20 iterations (bcrypt-bound)
    - **Validates: Requirements 1.1, 12.1**

  - [x] 5.4 Write property test for user profile update round-trip
    - Add to `src/__tests__/userManagement.prop.test.js`
    - **Property 11: User profile update round-trip**
    - For any valid update to firstName, lastName, or role, reading back the record returns updated values
    - Use 20 iterations (store-level)
    - **Validates: Requirements 9.3**

  - [x] 5.5 Write property test for user listing never exposes passwordHash
    - Add to `src/__tests__/userManagement.prop.test.js`
    - **Property 10: User listing and profile retrieval never expose passwordHash**
    - Note: This property will be fully testable at the API layer (task 7); at the store layer, verify the stripping logic
    - Use 20 iterations
    - **Validates: Requirements 9.1, 9.2**

- [x] 6. Checkpoint — Verify store layer
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement User Management API endpoints
  - [x] 7.1 Add `POST /api/users` endpoint to `src/auth.js`
    - Admin-only: validate role, validate firstName/lastName non-empty, validate email uniqueness (case-insensitive), validate password policy, hash password, create user via store, log `USER_CREATED` audit event
    - Set `mustChangePassword` based on `passwordType` ("one-time" → true, "permanent" → false)
    - Return 201 with user id, email, role (exclude passwordHash)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 5.1, 5.2, 7.1_

  - [x] 7.2 Add `GET /api/users` and `GET /api/users/:id` endpoints to `src/auth.js`
    - Admin-only: return user records excluding `passwordHash`
    - List endpoint returns all users; detail endpoint returns single user or 404
    - _Requirements: 8.1, 9.1, 9.2_

  - [x] 7.3 Add `PUT /api/users/:id` endpoint to `src/auth.js`
    - Admin-only: update firstName, lastName, role fields
    - Return updated user (exclude passwordHash) or 404
    - _Requirements: 8.1, 9.3, 9.5_

  - [x] 7.4 Add `DELETE /api/users/:id` endpoint to `src/auth.js`
    - Admin-only: delete user from store, return 200 or 404
    - _Requirements: 8.1, 9.4, 9.5_

  - [x] 7.5 Add `POST /api/users/:id/reset-password` endpoint to `src/auth.js`
    - Admin-only: validate password policy, hash new password, update user with new hash, set `mustChangePassword` based on `passwordType`, reset lockout state, log `PASSWORD_RESET` audit event
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 7.3_

  - [x] 7.6 Add `POST /api/auth/change-password` endpoint to `src/auth.js`
    - Authenticated user: verify current password, validate new password policy, hash new password, update user, set `mustChangePassword` to false, reset `failedLoginAttempts`, record `lastPasswordChange`, log `PASSWORD_CHANGED` audit event
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.1, 5.2, 7.2_

  - [x] 7.7 Write property tests for password hash round-trip and rejection
    - Add to `src/__tests__/userManagement.prop.test.js`
    - **Property 1: Password hash round-trip** — hashing then comparing the same password returns true
    - **Property 2: Password hash rejects different passwords** — hashing p1 then comparing p2 returns false
    - Use 20 iterations (bcrypt-bound)
    - **Validates: Requirements 1.4, 3.1, 3.3, 4.1, 13.1, 13.2**

  - [x] 7.8 Write property test for passwordType determines mustChangePassword
    - Add to `src/__tests__/userManagement.prop.test.js`
    - **Property 5: passwordType determines mustChangePassword flag**
    - For any user creation with passwordType "one-time" or "permanent", the resulting `mustChangePassword` matches expected value
    - Use 20 iterations (bcrypt-bound)
    - **Validates: Requirements 1.2, 1.3, 4.2, 4.3**

  - [x] 7.9 Write property test for duplicate email rejection
    - Add to `src/__tests__/userManagement.prop.test.js`
    - **Property 6: Duplicate email rejection is case-insensitive**
    - For any email and case transformation, creating a second user with the transformed email is rejected
    - Use 20 iterations (bcrypt-bound)
    - **Validates: Requirements 1.5**

  - [x] 7.10 Write property test for invalid role rejection
    - Add to `src/__tests__/userManagement.prop.test.js`
    - **Property 13: Invalid role values are rejected**
    - For any string that is not "admin" or "user", user creation rejects with validation error
    - Use 100 iterations (no bcrypt needed, validation only)
    - **Validates: Requirements 1.7**

  - [x] 7.11 Write property test for empty name rejection
    - Add to `src/__tests__/userManagement.prop.test.js`
    - **Property 14: Empty or whitespace-only names are rejected**
    - For any empty or whitespace-only string as firstName or lastName, user creation is rejected
    - Use 100 iterations (no bcrypt needed, validation only)
    - **Validates: Requirements 1.8**

- [x] 8. Checkpoint — Verify API endpoints
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement must-change-password middleware and login flow updates
  - [x] 9.1 Add must-change-password middleware to `src/auth.js`
    - Create `requirePasswordChange` middleware that checks `req.session.mustChangePassword`
    - If true, block all endpoints except `/api/auth/change-password`, `/api/auth/logout`, and `/api/auth/me`
    - Return 403 with `"Password change required before accessing this resource"`
    - _Requirements: 2.3_

  - [x] 9.2 Update login flow in `POST /api/auth/login` in `src/auth.js`
    - Check lockout state before password verification; return 423 if locked with remaining time
    - On failed password: increment failed attempts via lockout manager, log `LOGIN_FAILED` audit event, log `ACCOUNT_LOCKED` if threshold reached
    - On success with `mustChangePassword: true`: set session with `mustChangePassword` flag, return `{ mustChangePassword: true }` instead of full session
    - On success with `mustChangePassword: false`: reset lockout, establish full session, log `LOGIN_SUCCESS`
    - _Requirements: 2.1, 2.2, 2.4, 6.1, 6.2, 6.3, 6.4, 7.4, 7.5, 7.6_

  - [x] 9.3 Wire must-change-password middleware into `src/server.js`
    - Insert the middleware after the auth guard so it applies to all protected routes
    - _Requirements: 2.3_

  - [x] 9.4 Write property test for SSO users
    - Add to `src/__tests__/userManagement.prop.test.js`
    - **Property 12: SSO users have null passwordHash and no forced password change**
    - For any email, `upsertSsoUser` results in `passwordHash: null` and `mustChangePassword: false`
    - Use 100 iterations
    - **Validates: Requirements 11.2**

  - [x] 9.5 Write unit tests for login flow and middleware
    - Create `src/__tests__/userManagement.test.js`
    - Test: login with one-time password returns `mustChangePassword` flag (Req 2.1)
    - Test: login with permanent password establishes session (Req 2.2)
    - Test: password change clears `mustChangePassword` and establishes session (Req 2.4)
    - Test: password change resets `failedLoginAttempts` (Req 3.4)
    - Test: admin reset clears lockout state (Req 4.4)
    - Test: non-admin cannot access admin endpoints (Req 1.6, 4.5, 8.3)
    - Test: lockout triggers after 5 failed attempts (Req 6.2)
    - Test: successful login resets counter (Req 6.4)
    - Test: delete user returns 404 for non-existent ID (Req 9.5)
    - Test: backward compatibility with missing fields (Req 12.2, 12.3)
    - _Requirements: 2.1, 2.2, 2.4, 3.4, 4.4, 1.6, 4.5, 8.3, 6.2, 6.4, 9.5, 12.2, 12.3_

- [x] 10. Update bootstrap admin and finalize integration
  - [x] 10.1 Update `bootstrapAdminIfNeeded` in `src/auth.js`
    - Add `firstName: 'Admin'`, `lastName: 'User'`, `passwordType: 'permanent'`, `mustChangePassword: false`, `createdBy: 'system'` to the bootstrap user creation call
    - _Requirements: 12.1_

  - [x] 10.2 Update existing `POST /api/auth/register` to delegate to new user creation logic
    - Preserve backward compatibility: map old register fields to new `POST /api/users` logic
    - _Requirements: 1.1, 12.3_

  - [x] 10.3 Write integration tests for audit logging
    - Add to `src/__tests__/userManagement.test.js`
    - Verify each event type (`USER_CREATED`, `PASSWORD_CHANGED`, `PASSWORD_RESET`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `LOGIN_SUCCESS`) is recorded with correct fields
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All code uses JavaScript (ES modules) matching the existing codebase
- bcrypt-bound property tests use 20 iterations; pure-function tests use 100+ iterations
