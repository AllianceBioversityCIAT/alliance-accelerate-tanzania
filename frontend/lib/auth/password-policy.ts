/**
 * The Cognito password policy, in the words the user sees.
 *
 * Mirrors `infra/10-data-auth/template.yaml` → UserPool.Policies.PasswordPolicy
 * (MinimumLength 12 + upper + lower + number + symbol). Single source for both
 * the field hint and the rejection message, so the two can never disagree.
 */
export const PASSWORD_REQUIREMENTS_TEXT =
  'Use at least 12 characters, including an uppercase letter, a lowercase letter, a number, and a symbol.';

/** Shown when Cognito rejects a password with InvalidPasswordException. */
export const INVALID_PASSWORD_MESSAGE = `That password doesn't meet the requirements. ${PASSWORD_REQUIREMENTS_TEXT}`;
