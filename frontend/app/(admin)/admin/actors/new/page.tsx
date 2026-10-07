// @sdd-spec admin/actor-crud-audit (T-8)
'use client';

/**
 * /admin/actors/new — create actor page (FR-8).
 *
 * Static-export safe: 'use client'; no SSR / route handlers.
 * Auth guard: the (admin) layout already wraps this in <RequireRole allow={['Admin']}>;
 * we additionally resolve the access token via getSession() and redirect to /login
 * when unauthenticated.
 *
 * On successful creation the user is returned to /admin/actors — unless the
 * create produced weak duplicate warnings (T-6) or the actor can be asked for
 * consent (T-10, FR-3): then `SendConsentPrompt` shows both in one dialog first.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { getSession } from '@/lib/auth/auth-client';
import type { AdminActor, AdminActorCreateResult } from '@/lib/api/actors-admin';
import { AuthFailureError } from '@/lib/api/client';
import { uploadConsentDocument } from '@/lib/api/consent-requests-admin';
import { DOCUMENT_FIELD_COPY } from '@/lib/content/consent-requests';

import ActorForm, { type ActorFormSuccessExtras } from '@/components/admin/ActorForm';
import { SendConsentPrompt } from '@/components/admin/SendConsentPrompt';
import { useConsentDispatch } from '@/lib/admin/useConsentDispatch';
import Skeleton from '@/components/ui/Skeleton';

// ---------------------------------------------------------------------------
// Loading fallback
// ---------------------------------------------------------------------------

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl">
      <Skeleton className="mb-2 h-8 w-48 rounded-md" />
      <Skeleton className="mb-6 h-4 w-72 rounded-sm" />
      <Skeleton className="h-96 w-full rounded-md" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewActorPage() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [created, setCreated] = useState<AdminActorCreateResult | null>(null);
  // FR-15 — set when the actor exists but its optional document could not be attached.
  const [documentNotice, setDocumentNotice] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const session = await getSession();
      if (cancelled) return;

      if (!session) {
        router.push('/login');
        return;
      }

      setToken(session.accessToken);
      setLoading(false);
    }

    void init();
    return () => { cancelled = true; };
  }, [router]);

  const handleAuthFailure = useCallback(() => {
    router.push('/login');
  }, [router]);

  // The ONE consent dispatch owner on this page (design.md §5.2, P-10).
  const consentDispatch = useConsentDispatch({ token: token ?? '', onAuthFailure: handleAuthFailure });

  const handleSuccess = useCallback(
    async (actor?: AdminActorCreateResult | AdminActor, extras?: ActorFormSuccessExtras) => {
      const result = actor && 'duplicateWarnings' in actor ? actor : null;

      // FR-15 — the document is uploaded only now that the actor EXISTS, and
      // before the send prompt so the prompt can disclose a failure. If it
      // fails the actor stays created: say so and point at the actor page.
      let notice: string | undefined;
      if (result && extras?.documentFile && token) {
        setUploading(true);
        try {
          await uploadConsentDocument(result.id, extras.documentFile, token);
        } catch (caught: unknown) {
          if (caught instanceof AuthFailureError) {
            router.push('/login');
            return;
          }
          notice = DOCUMENT_FIELD_COPY.createFailedAfterActor;
        } finally {
          setUploading(false);
        }
      }

      // Prompt when there are warnings to disclose, a failed document to
      // disclose, or (B-13) a consent request to offer.
      const hasWarnings = (result?.duplicateWarnings?.length ?? 0) > 0;
      const canAsk = !!result && result.consentStatus !== 'GRANTED' && !!result.email;
      if (result && (hasWarnings || canAsk || notice)) {
        setDocumentNotice(notice);
        setCreated(result);
        return;
      }
      router.push('/admin/actors');
    },
    [router, token],
  );

  const handlePromptDone = useCallback(() => {
    setCreated(null);
    router.push('/admin/actors');
  }, [router]);

  if (loading) {
    return <PageSkeleton />;
  }

  if (!token) {
    return null;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold text-fg">New actor</h1>
        <p className="mt-1 text-sm text-muted">Create a new registry actor.</p>
      </div>

      <ActorForm
        mode="create"
        token={token}
        onSuccess={(actor, extras) => void handleSuccess(actor, extras)}
        onAuthFailure={handleAuthFailure}
      />

      {uploading && (
        <output className="mt-4 block text-sm text-muted">
          {DOCUMENT_FIELD_COPY.uploading}
        </output>
      )}

      {created && (
        <SendConsentPrompt
          actor={created}
          token={token}
          dispatch={consentDispatch}
          onDone={handlePromptDone}
          onAuthFailure={handleAuthFailure}
          notice={documentNotice}
        />
      )}
    </div>
  );
}
