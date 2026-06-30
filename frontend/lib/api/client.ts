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
 *
 * Usage (explicit token — callers supply token; no Amplify call here):
 *   import { apiFetch } from '@/lib/api/client';
 *   const data = await apiFetch<MyType>('/api/v1/users', { token, method: 'GET' });
 *   await apiFetch<void>('/api/v1/users/123', { token, method: 'DELETE', expectEmpty: true });
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
 * Thrown by apiGetAuthed (and apiFetch) when the server responds with HTTP 401.
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

// ---------------------------------------------------------------------------
// apiFetch — low-level helper for caller-supplied Bearer tokens
// ---------------------------------------------------------------------------

/**
 * Options for apiFetch. The caller is responsible for supplying the access
 * token (retrieved from getSession() or any non-React async getter).
 * Public (no-token) calls are NOT the intended usage — use apiGet for those.
 */
export interface ApiFetchOptions {
  /** HTTP method. Defaults to 'GET'. */
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** If provided, attached as `Authorization: Bearer <token>`. */
  token?: string;
  /** JSON-serialisable body (POST/PATCH/PUT). Omit for GET/DELETE. */
  body?: unknown;
  /**
   * When true, the response body is NOT parsed — apiFetch returns undefined
   * cast as T. Use this for 204 No Content responses (DELETE, password reset).
   */
  expectEmpty?: boolean;
}

/**
 * Generic fetch helper that accepts an explicit caller-supplied Bearer token.
 *
 * Throws AuthFailureError on HTTP 401.
 * Throws plain Error on other non-OK statuses (same envelope parsing as apiGet).
 * Returns undefined (cast to T) when expectEmpty=true (for 204 responses).
 *
 * This function does NOT import React hooks and does NOT call Amplify directly —
 * it is safe to use in pure async modules (e.g. lib/api/users.ts).
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!baseUrl) {
    throw new Error(
      'NEXT_PUBLIC_API_BASE_URL is not set. Configure it in .env.local or the deployment environment.'
    );
  }

  const { method = 'GET', token, body, expectEmpty = false } = options;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 401) {
    throw new AuthFailureError();
  }

  if (!response.ok) {
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

  if (expectEmpty) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}
