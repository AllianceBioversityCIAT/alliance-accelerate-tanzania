// /login page — Staff/Admin sign-in (FR-1, NFR-2, NFR-4).
//
// 'use client' required: LoginForm uses browser APIs + React state.
//
// Static export compliance (NFR-2): no getServerSideProps / route handlers —
// all auth flows are client-side via Amplify (design.md §5).
// Token discipline (NFR-4): no raw hex; delegate all styling to LoginForm + tokens.

'use client';

import { Suspense } from 'react';
import LoginForm from '@/components/auth/LoginForm';

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    // Full-bleed within <main> (PublicLayout applies no container — pages own it).
    // Vertically centres the card on screens taller than the card itself.
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
      {/* LoginForm calls useSearchParams(); Suspense is required for static export (NFR-2). */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
