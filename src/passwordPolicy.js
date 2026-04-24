/**
 * Password Policy Validator
 *
 * Pure-function module that validates passwords against the password policy.
 * Policy rules:
 *   - Minimum 8 characters
 *   - At least one uppercase letter
 *   - At least one lowercase letter
 *   - At least one digit
 *   - At least one special character (non-alphanumeric)
 */

/**
 * Validates a password against the password policy.
 * @param {string} password - The password to validate
 * @returns {{ valid: boolean, violations: string[] }}
 */
export function validatePassword(password) {
  const violations = [];

  if (typeof password !== 'string' || password.length < 8) {
    violations.push('Password must be at least 8 characters');
  }

  if (typeof password !== 'string' || !/[A-Z]/.test(password)) {
    violations.push('Password must contain at least one uppercase letter');
  }

  if (typeof password !== 'string' || !/[a-z]/.test(password)) {
    violations.push('Password must contain at least one lowercase letter');
  }

  if (typeof password !== 'string' || !/[0-9]/.test(password)) {
    violations.push('Password must contain at least one digit');
  }

  if (typeof password !== 'string' || !/[^A-Za-z0-9]/.test(password)) {
    violations.push('Password must contain at least one special character');
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
