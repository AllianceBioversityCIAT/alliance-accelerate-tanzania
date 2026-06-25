/**
 * Shared typed fetch wrapper — design.md §9, detailed-design.md §9.
 *
 * Reusable by all lib/api modules. Handles:
 *   - Base URL resolution from NEXT_PUBLIC_API_BASE_URL
 *   - JSON response parsing
 *   - Non-OK responses: parses error envelope { statusCode, message, error, details? }
 *     and throws an Error with a meaningful message (tolerates non-JSON bodies)
 *
 * Usage (public, no token):
 *   import { apiGet } from '@/lib/api/client';
 *   const data = await apiGet<Metrics>('/api/v1/metrics');
 *
 * Usage (authenticated — attaches Authorization: Bearer):
 *   import { apiGetAuthed } from '@/lib/api/client';
 *   const data = await apiGetAuthed<MyType>('/api/v1/auth/me');
 *   // Throws AuthFailureError on 401 — caller should route to /login (FR-9/NFR-7).
 */

import { fetchAuthSession } from 'aws-amplify/auth';

/** Error envelope shape returned by the NestJS API (detailed-design.md §9). */
export interface ApiErrorEnvelope {
  statusCode: number;
  message: string;
  error: string;
  details?: unknown;
}

/**
 * Thrown by apiGetAuthed when the server responds with HTTP 401.
 * Callers can catch this specific type and route the user to /login (FR-9/NFR-7).
 */
export class AuthFailureError extends Error {
  /** Always 401. */
  readonly status = 401;

  constructor(message = 'Session expired or invalid — please sign in again.') {
    super(message);
    this.name = 'AuthFailureError';
  }
}

/**
 * Generic GET helper. Throws on missing base URL, network failure, or non-OK HTTP status.
 * Callers are responsible for wrapping in try/catch; see getMetrics() for the DD-3 pattern.
 *
 * Public calls — NO Authorization header attached. Do not modify (FR-8/FR-9).
 */
export async function apiGet<T>(path: string): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!baseUrl) {
    throw new Error(
      'NEXT_PUBLIC_API_BASE_URL is not set. Configure it in .env.local or the deployment environment.'
    );
  }

  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    // Attempt to parse the NestJS error envelope; tolerate a non-JSON body.
    let message = `HTTP ${response.status} ${response.statusText}`;
    try {
      const envelope = (await response.json()) as Partial<ApiErrorEnvelope>;
      if (envelope.message) {
        message = envelope.message;
      }
    } catch {
      // Body is not JSON — use the status line message set above.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

/**
 * Authenticated GET helper — mirrors apiGet but attaches the Amplify access token
 * as `Authorization: Bearer <token>` (FR-9, design.md §5 API transport).
 *
 * Throws AuthFailureError on HTTP 401 so callers can route to /login (NFR-7).
 * Throws plain Error on other non-OK statuses (mirrors apiGet behaviour).
 * Throws if the access token cannot be retrieved (no active session).
 *
 * Public `apiGet` is UNCHANGED — public calls remain tokenless (FR-8).
 */
export async function apiGetAuthed<T>(path: string): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!baseUrl) {
    throw new Error(
      'NEXT_PUBLIC_API_BASE_URL is not set. Configure it in .env.local or the deployment environment.'
    );
  }

  // Resolve the current Amplify session to get the bearer token (auth-client.ts pattern).
  const session     = await fetchAuthSession();
  const accessToken = session.tokens?.accessToken;

  if (!accessToken) {
    throw new AuthFailureError('No active session — please sign in.');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept:        'application/json',
      Authorization: `Bearer ${accessToken.toString()}`,
    },
  });

  if (response.status === 401) {
    // Surface a typed auth-failure signal the caller can use to route to /login.
    throw new AuthFailureError();
  }

  if (!response.ok) {
    // Other non-OK statuses — mirror the apiGet error handling pattern.
    let message = `HTTP ${response.status} ${response.statusText}`;
    try {
      const envelope = (await response.json()) as Partial<ApiErrorEnvelope>;
      if (envelope.message) {
        message = envelope.message;
      }
    } catch {
      // Body is not JSON — use the status line message set above.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}
