# Requirements Document

## Introduction

The User Management module extends the existing Capillary Solution Agent authentication system with full user lifecycle management. Administrators can create users with either one-time or permanent passwords, reset passwords, and manage user profiles. Users can change their own passwords and are forced to change one-time passwords on first login. The module adds role-based access control, password policies, account lockout after failed login attempts, audit logging, and email uniqueness enforcement. All data is persisted through the existing store abstraction layer, supporting both JSON-file and MongoDB backends via the STORE_BACKEND configuration. The existing SSO flow (Google/Microsoft OAuth) and session management remain fully backward-compatible.

## Glossary

- **User_Management_Module**: The set of API endpoints, store operations, and UI flows that handle user creation, profile updates, password management, and access control within the Solution Agent application.
- **Admin**: A user with the "admin" role who can create users, reset passwords, list users, and update user profiles.
- **Standard_User**: A user with the "user" role who can log in, change their own password, and view their own profile.
- **User_Store**: The persistence adapter (JSON-file or MongoDB) that stores user records, accessed through the store factory in src/stores/index.js.
- **Password_Hasher**: The bcrypt-based component (12 rounds) that hashes and verifies passwords.
- **Session_Manager**: The express-session middleware that maintains per-user sessions with cookie-based storage (cookie name "sid", 7-day maxAge).
- **Audit_Logger**: The component that records security-relevant events (user creation, password changes, password resets, login attempts, account lockouts) with timestamps and actor identification.
- **One_Time_Password**: A password assigned during user creation that the user must change upon first successful login before accessing the application.
- **Permanent_Password**: A password assigned during user creation that does not require an immediate change upon login.
- **Password_Policy**: The set of rules governing password strength: minimum 8 characters, at least one uppercase letter, one lowercase letter, one digit, and one special character.
- **Account_Lockout**: A security mechanism that temporarily disables login for a user account after a configured number of consecutive failed login attempts.
- **Lockout_Threshold**: The number of consecutive failed login attempts (5) that triggers an Account_Lockout.
- **Lockout_Duration**: The time period (15 minutes) during which a locked account cannot authenticate.

## Requirements

### Requirement 1: User Creation by Admin

**User Story:** As an Admin, I want to create new user accounts with profile details and a password type, so that I can onboard team members to the Solution Agent.

#### Acceptance Criteria

1. WHEN an Admin submits a user creation request with firstName, lastName, email, password, role, and passwordType, THE User_Management_Module SHALL create a new user record in the User_Store with all provided fields, a generated UUID, and a createdAt timestamp.
2. WHEN an Admin creates a user with passwordType set to "one-time", THE User_Management_Module SHALL store the user record with the mustChangePassword flag set to true.
3. WHEN an Admin creates a user with passwordType set to "permanent", THE User_Management_Module SHALL store the user record with the mustChangePassword flag set to false.
4. THE Password_Hasher SHALL hash the provided password using bcrypt with 12 rounds before the User_Store persists the user record.
5. IF a user creation request contains an email that already exists in the User_Store (case-insensitive comparison), THEN THE User_Management_Module SHALL reject the request with a 409 Conflict status and a descriptive error message.
6. IF a user creation request is submitted by a Standard_User, THEN THE User_Management_Module SHALL reject the request with a 403 Forbidden status.
7. WHEN an Admin creates a user, THE User_Management_Module SHALL validate that the role field is either "admin" or "user".
8. WHEN an Admin creates a user, THE User_Management_Module SHALL validate that firstName and lastName are non-empty strings.

### Requirement 2: User Login with One-Time Password Detection

**User Story:** As a Standard_User created with a one-time password, I want to be prompted to change my password on first login, so that I can set a personal password that only I know.

#### Acceptance Criteria

1. WHEN a user submits valid credentials and the user record has mustChangePassword set to true, THE User_Management_Module SHALL respond with a mustChangePassword flag in the login response instead of establishing a full session.
2. WHEN a user submits valid credentials and the user record has mustChangePassword set to false, THE User_Management_Module SHALL establish a session and respond with the user email and role as done currently.
3. WHILE a user has mustChangePassword set to true, THE User_Management_Module SHALL restrict access to all application endpoints except the password change endpoint and the logout endpoint.
4. WHEN a user with mustChangePassword set to true successfully changes their password, THE User_Management_Module SHALL set mustChangePassword to false and establish a full session.

### Requirement 3: Password Change by User

**User Story:** As a Standard_User, I want to change my own password, so that I can maintain the security of my account.

#### Acceptance Criteria

1. WHEN an authenticated user submits a password change request with a valid current password and a new password, THE User_Management_Module SHALL update the password hash in the User_Store and record the lastPasswordChange timestamp.
2. IF a password change request contains a current password that does not match the stored hash, THEN THE User_Management_Module SHALL reject the request with a 401 Unauthorized status and a descriptive error message.
3. WHEN a user changes their password, THE Password_Hasher SHALL hash the new password using bcrypt with 12 rounds before the User_Store persists the update.
4. WHEN a user successfully changes their password, THE User_Management_Module SHALL reset the failedLoginAttempts counter to zero for that user.

### Requirement 4: Password Reset by Admin

**User Story:** As an Admin, I want to reset a user's password, so that I can help users who are locked out or have forgotten their credentials.

#### Acceptance Criteria

1. WHEN an Admin submits a password reset request for a user with a new password and a passwordType, THE User_Management_Module SHALL update the user's password hash in the User_Store.
2. WHEN an Admin resets a password with passwordType set to "one-time", THE User_Management_Module SHALL set the mustChangePassword flag to true on the target user record.
3. WHEN an Admin resets a password with passwordType set to "permanent", THE User_Management_Module SHALL set the mustChangePassword flag to false on the target user record.
4. WHEN an Admin resets a user's password, THE User_Management_Module SHALL reset the failedLoginAttempts counter to zero and clear the lockedUntil timestamp for that user.
5. IF a password reset request is submitted by a Standard_User, THEN THE User_Management_Module SHALL reject the request with a 403 Forbidden status.

### Requirement 5: Password Policy Enforcement

**User Story:** As an Admin, I want passwords to meet minimum complexity requirements, so that user accounts are protected against weak credentials.

#### Acceptance Criteria

1. WHEN a password is provided during user creation, password change, or password reset, THE User_Management_Module SHALL validate that the password is at least 8 characters long.
2. WHEN a password is provided during user creation, password change, or password reset, THE User_Management_Module SHALL validate that the password contains at least one uppercase letter, one lowercase letter, one digit, and one special character.
3. IF a password does not meet the Password_Policy requirements, THEN THE User_Management_Module SHALL reject the request with a 400 Bad Request status and a message listing the specific policy violations.

### Requirement 6: Account Lockout After Failed Login Attempts

**User Story:** As an Admin, I want user accounts to lock temporarily after repeated failed login attempts, so that brute-force attacks are mitigated.

#### Acceptance Criteria

1. WHEN a login attempt fails due to an incorrect password, THE User_Management_Module SHALL increment the failedLoginAttempts counter on the user record.
2. WHEN the failedLoginAttempts counter reaches the Lockout_Threshold of 5, THE User_Management_Module SHALL set the lockedUntil timestamp to the current time plus the Lockout_Duration of 15 minutes.
3. WHILE a user account has a lockedUntil timestamp in the future, THE User_Management_Module SHALL reject login attempts for that account with a 423 Locked status and a message indicating the remaining lockout time.
4. WHEN a user successfully logs in, THE User_Management_Module SHALL reset the failedLoginAttempts counter to zero and clear the lockedUntil timestamp.
5. WHEN the Lockout_Duration expires, THE User_Management_Module SHALL allow the user to attempt login again without requiring Admin intervention.

### Requirement 7: Audit Trail for Security Events

**User Story:** As an Admin, I want all security-relevant actions to be logged, so that I can review account activity and investigate incidents.

#### Acceptance Criteria

1. WHEN a user is created, THE Audit_Logger SHALL record an entry with the event type "USER_CREATED", the actor (Admin email), the target user email, and a timestamp.
2. WHEN a user changes their own password, THE Audit_Logger SHALL record an entry with the event type "PASSWORD_CHANGED", the actor (user email), and a timestamp.
3. WHEN an Admin resets a user's password, THE Audit_Logger SHALL record an entry with the event type "PASSWORD_RESET", the actor (Admin email), the target user email, and a timestamp.
4. WHEN a login attempt fails, THE Audit_Logger SHALL record an entry with the event type "LOGIN_FAILED", the target user email, and a timestamp.
5. WHEN an account is locked due to exceeding the Lockout_Threshold, THE Audit_Logger SHALL record an entry with the event type "ACCOUNT_LOCKED", the target user email, and a timestamp.
6. WHEN a user successfully logs in, THE Audit_Logger SHALL record an entry with the event type "LOGIN_SUCCESS", the user email, and a timestamp.
7. THE Audit_Logger SHALL persist audit entries through the User_Store abstraction layer, supporting both JSON-file and MongoDB backends.

### Requirement 8: Role-Based Access Control

**User Story:** As an Admin, I want endpoints to enforce role-based access, so that only authorized users can perform administrative actions.

#### Acceptance Criteria

1. THE User_Management_Module SHALL enforce that user creation, password reset, user listing, and user deletion endpoints are accessible only to users with the "admin" role.
2. THE User_Management_Module SHALL enforce that password change and profile view endpoints are accessible to any authenticated user for their own account.
3. IF an authenticated user without the "admin" role attempts to access an admin-only endpoint, THEN THE User_Management_Module SHALL reject the request with a 403 Forbidden status and a descriptive error message.
4. THE Session_Manager SHALL store the user role in the session upon successful authentication, consistent with the existing session structure (userId, email, role).

### Requirement 9: User Profile Management

**User Story:** As an Admin, I want to view and manage user profiles, so that I can maintain the user directory.

#### Acceptance Criteria

1. WHEN an Admin requests the user list, THE User_Management_Module SHALL return all user records with id, firstName, lastName, email, role, passwordType, createdAt, and lastPasswordChange fields, excluding passwordHash.
2. WHEN an Admin requests a specific user profile by user ID, THE User_Management_Module SHALL return the user record excluding passwordHash.
3. WHEN an Admin submits an update to a user's firstName, lastName, or role, THE User_Management_Module SHALL persist the changes in the User_Store.
4. WHEN an Admin deletes a user account, THE User_Management_Module SHALL remove the user record from the User_Store and invalidate any active sessions for that user.
5. IF a delete or update request targets a non-existent user ID, THEN THE User_Management_Module SHALL respond with a 404 Not Found status.

### Requirement 10: Dual-Backend Storage Compatibility

**User Story:** As a developer, I want user management data to work with both JSON-file and MongoDB backends, so that the deployment remains flexible.

#### Acceptance Criteria

1. THE User_Store SHALL support all user management operations (create, read, update, delete, find by email, find by ID) through both the JSON-file and MongoDB backend adapters.
2. THE User_Store SHALL persist audit log entries through both the JSON-file and MongoDB backend adapters.
3. WHEN the STORE_BACKEND environment variable is set to "json", THE User_Store SHALL use the JSON-file adapter with the write-queue pattern for concurrent write safety.
4. WHEN the STORE_BACKEND environment variable is set to "mongodb", THE User_Store SHALL use the MongoDB adapter.
5. THE User_Store SHALL maintain the same API interface across both backends so that calling code does not depend on the backend choice.

### Requirement 11: SSO Backward Compatibility

**User Story:** As a user who logs in via Google or Microsoft SSO, I want my login flow to continue working unchanged, so that the new user management features do not disrupt my access.

#### Acceptance Criteria

1. WHEN a user authenticates via Google or Microsoft OAuth, THE User_Management_Module SHALL continue to use the existing upsertSsoUser flow to create or retrieve the user record.
2. WHEN an SSO user is created via upsertSsoUser, THE User_Management_Module SHALL set passwordHash to null and mustChangePassword to false on the user record.
3. WHILE a user has a null passwordHash (SSO-only user), THE User_Management_Module SHALL not require a password change on login.
4. THE User_Management_Module SHALL preserve the existing domain restriction via the ALLOWED_EMAIL_DOMAIN environment variable for SSO logins.

### Requirement 12: User Model Extension

**User Story:** As a developer, I want the user data model to include all fields needed for user management, so that the system can support profile data, password lifecycle, and lockout state.

#### Acceptance Criteria

1. THE User_Store SHALL store user records with the following fields: id (UUID), firstName (string), lastName (string), email (string), passwordHash (string or null), role ("admin" or "user"), passwordType ("one-time", "permanent", or null for SSO users), mustChangePassword (boolean), failedLoginAttempts (integer), lockedUntil (ISO timestamp or null), createdAt (ISO timestamp), lastPasswordChange (ISO timestamp or null), and createdBy (email of the Admin who created the account, or "system" for bootstrap, or "sso" for SSO-created users).
2. THE User_Store SHALL default failedLoginAttempts to zero and mustChangePassword to false for new user records when not explicitly set.
3. THE User_Store SHALL maintain backward compatibility with existing user records by treating missing fields as their default values (failedLoginAttempts: 0, mustChangePassword: false, firstName: "", lastName: "", passwordType: null).

### Requirement 13: Password Validation Round-Trip

**User Story:** As a developer, I want to verify that password hashing and verification are consistent, so that stored passwords always validate correctly.

#### Acceptance Criteria

1. FOR ALL valid passwords, THE Password_Hasher SHALL produce a hash that, when verified with bcrypt.compare against the original password, returns true (round-trip property).
2. FOR ALL valid passwords, THE Password_Hasher SHALL produce a hash that, when verified with bcrypt.compare against a different password, returns false.
3. FOR ALL password policy inputs, THE User_Management_Module SHALL produce the same validation result when the Password_Policy check is applied multiple times to the same input (idempotence property).
