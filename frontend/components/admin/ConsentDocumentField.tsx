// @sdd-spec actors/consent-intake/consent-request-email (T-11)
'use client';

/**
 * ConsentDocumentField — one optional consent document (FR-15, design §5.6, §7.3).
 *
 * One component, two modes:
 *
 *   - `deferred` (the create form): only HOLDS the chosen `File` and reports it
 *     upward. Nothing is uploaded here — the page uploads after the actor
 *     exists, so a rejected create makes no upload attempt and a resubmit
 *     records at most one document.
 *   - `immediate` (the evidence panel): uploads as soon as a valid file is
 *     chosen (upload-url → presigned POST → confirm) and reports the stored
 *     document.
 *
 * Type (PDF/JPG/PNG) and size (≤ 10 MB) are checked client-side with NO
 * network call on a reject; storage enforces both again. When
 * `GET admin/consent-documents/status` says `enabled: false` (the local
 * stack) the input is disabled and says why, rather than failing on submit.
 *
 * Tokens only; no hardcoded colours or geometry.
 */

import { useEffect, useId, useRef, useState } from 'react';

import { AuthFailureError } from '@/lib/api/client';
import {
  checkConsentDocumentFile,
  getConsentDocumentStatus,
  uploadConsentDocument,
  type ConsentDocumentEvidence,
  type ConsentDocumentRejection,
} from '@/lib/api/consent-requests-admin';
import { DOCUMENT_FIELD_COPY } from '@/lib/content/consent-requests';

const REJECTION_COPY: Record<ConsentDocumentRejection, string> = {
  type: DOCUMENT_FIELD_COPY.typeRejected,
  size: DOCUMENT_FIELD_COPY.sizeRejected,
  empty: DOCUMENT_FIELD_COPY.emptyRejected,
};

const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

type Availability = 'checking' | 'enabled' | 'disabled' | 'error';

interface CommonProps {
  token: string;
  onAuthFailure: () => void;
}

export interface DeferredDocumentFieldProps extends CommonProps {
  mode: 'deferred';
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** Lock the field while the surrounding form is submitting. */
  disabled?: boolean;
}

export interface ImmediateDocumentFieldProps extends CommonProps {
  mode: 'immediate';
  actorId: string;
  onUploaded: (document: ConsentDocumentEvidence) => void;
}

export type ConsentDocumentFieldProps = DeferredDocumentFieldProps | ImmediateDocumentFieldProps;

export function ConsentDocumentField(props: Readonly<ConsentDocumentFieldProps>) {
  const { token, onAuthFailure } = props;
  const uid = useId();
  const inputId = `${uid}-file`;
  const hintId = `${uid}-hint`;
  const messageId = `${uid}-message`;
  const errorId = `${uid}-error`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [availability, setAvailability] = useState<Availability>('checking');
  const [rejection, setRejection] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getConsentDocumentStatus(token)
      .then((status) => {
        if (!cancelled) setAvailability(status.enabled ? 'enabled' : 'disabled');
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        if (caught instanceof AuthFailureError) {
          onAuthFailure();
          return;
        }
        setAvailability('error');
      });
    return () => {
      cancelled = true;
    };
  }, [token, onAuthFailure]);

  const clearInput = () => {
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setUploadError(null);
    setUploadedName(null);
    if (!file) {
      setRejection(null);
      if (props.mode === 'deferred') props.onFileChange(null);
      return;
    }

    // FR-15: refuse before ANY network call.
    const reason = checkConsentDocumentFile(file);
    if (reason) {
      setRejection(REJECTION_COPY[reason]);
      clearInput();
      if (props.mode === 'deferred') props.onFileChange(null);
      return;
    }
    setRejection(null);

    if (props.mode === 'deferred') {
      props.onFileChange(file);
      return;
    }

    setUploading(true);
    try {
      const stored = await uploadConsentDocument(props.actorId, file, token);
      setUploadedName(stored.fileName);
      clearInput();
      props.onUploaded(stored);
    } catch (caught: unknown) {
      if (caught instanceof AuthFailureError) {
        onAuthFailure();
        return;
      }
      setUploadError(DOCUMENT_FIELD_COPY.uploadFailed);
      clearInput();
    } finally {
      setUploading(false);
    }
  };

  const heldFile = props.mode === 'deferred' ? props.file : null;
  const formDisabled = props.mode === 'deferred' && !!props.disabled;
  const inputDisabled = availability !== 'enabled' || uploading || formDisabled;

  const availabilityMessage =
    availability === 'checking'
      ? DOCUMENT_FIELD_COPY.checking
      : availability === 'disabled'
        ? DOCUMENT_FIELD_COPY.unavailable
        : availability === 'error'
          ? DOCUMENT_FIELD_COPY.statusFailed
          : null;
  const errorMessage = rejection ?? uploadError;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-fg">
        {DOCUMENT_FIELD_COPY.label}
        <span className="ml-2 text-xs font-normal text-muted">{DOCUMENT_FIELD_COPY.optional}</span>
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT}
        disabled={inputDisabled}
        onChange={(e) => void handleChange(e)}
        aria-invalid={errorMessage ? 'true' : undefined}
        aria-describedby={[hintId, availabilityMessage ? messageId : '', errorMessage ? errorId : '']
          .filter(Boolean)
          .join(' ')}
        className={[
          'block w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg shadow-xs',
          'file:mr-3 file:rounded-md file:border-0 file:bg-surface-alt file:px-3 file:py-1.5',
          'file:text-sm file:font-medium file:text-fg',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          errorMessage ? 'border-danger' : 'border-border',
        ].join(' ')}
      />
      <p id={hintId} className="text-xs text-muted">
        {DOCUMENT_FIELD_COPY.hint}
        {props.mode === 'deferred' ? ` ${DOCUMENT_FIELD_COPY.deferredHint}` : ''}
      </p>

      <div id={messageId} className="text-xs" role="status" aria-live="polite">
        {availabilityMessage && <p className="text-muted">{availabilityMessage}</p>}
        {uploading && <p className="text-muted">{DOCUMENT_FIELD_COPY.uploading}</p>}
        {uploadedName && <p className="text-success">{DOCUMENT_FIELD_COPY.uploaded(uploadedName)}</p>}
      </div>
      {errorMessage && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {errorMessage}
        </p>
      )}

      {heldFile && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-fg">
          <span className="break-all">{DOCUMENT_FIELD_COPY.chosen(heldFile.name)}</span>
          <button
            type="button"
            disabled={formDisabled}
            onClick={() => {
              clearInput();
              if (props.mode === 'deferred') props.onFileChange(null);
            }}
            className={[
              'rounded-sm text-sm font-medium text-primary hover:text-primary-hover',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          >
            {DOCUMENT_FIELD_COPY.remove}
          </button>
        </div>
      )}
    </div>
  );
}
