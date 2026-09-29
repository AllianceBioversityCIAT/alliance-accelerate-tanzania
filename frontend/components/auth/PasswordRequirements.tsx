'use client';

/**
 * PasswordRequirements — states the password policy under a "new password"
 * field, wired with aria-describedby so it is announced with the field rather
 * than only after a rejection. Copy lives in lib/auth/password-policy.
 */

import { PASSWORD_REQUIREMENTS_TEXT } from '@/lib/auth/password-policy';

export default function PasswordRequirements({ id }: { id: string }) {
  return (
    <p id={id} className="mt-2 text-xs italic text-muted">
      {PASSWORD_REQUIREMENTS_TEXT}
    </p>
  );
}
