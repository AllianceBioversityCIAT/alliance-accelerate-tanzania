// /forgot-password page — Staff/Admin password-reset request (FR-1, NFR-1).
//
// 'use client' required: ForgotPasswordForm uses browser APIs + React state.
//
// Static export compliance (NFR-1): no getServerSideProps / route handlers —
// all auth flows are client-side via Amplify (design.md §5).
// Token discipline: no raw hex; delegate all styling to ForgotPasswordForm + tokens.

'use client';

import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm';

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ForgotPasswordPage() {
  return (
    // Full-bleed within <main> (PublicLayout applies no container — pages own it).
    // Vertically centres the card on screens taller than the card itself.
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
      {/* ForgotPasswordForm does not call useSearchParams(); no Suspense needed. */}
      <ForgotPasswordForm />
    </div>
  );
}
