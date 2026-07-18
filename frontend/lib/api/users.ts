// @sdd-spec admin/user-management (T-7)
/**
 * Users API client — design.md §2 (AdminUser shape) + §3 (endpoints).
 *
 * All functions require a Cognito access token supplied by the CALLER
 * (obtained via getSession().accessToken from lib/auth/auth-client.ts).
 * This module is a pure async module — no React hooks, no Amplify calls.
 *
 * Bearer token is attached via apiFetch (lib/api/client.ts).
 * AuthFailureError is re-thrown on 401 — callers should route to /login (FR-9).
 *
 * Usage (from a page/hook in T-9):
 *   import { getSession } from '@/lib/auth/auth-client';
 *   import { listUsers, createUser } from '@/lib/api/users';
 *
 *   const session = await getSession();   // returns null when unauthenticated
 *   if (!session) { router.push('/login'); return; }
 *   const result = await listUsers({ limit: 20 }, session.accessToken);
 */

import { apiFetch } from './client';

// ── Types — design.md §2 ───────────────────────────────────────────────────

/**
 * Serialised user shape returned by the API (design.md §2, FR-10 allowlist).
 * Maps exactly to the NestJS UsersSerializer output.
 * No password / temporary-password / secret field is ever included.
 */
export interface AdminUser {
  /** Cognito Username (uuid; equals JWT sub). */
  id: string;
  /** Cognito user attribute — email alias. */
  email: string;
  /** Cognito UserStatus (e.g. FORCE_CHANGE_PASSWORD, CONFIRMED). */
  status: string;
  enabled: boolean;
  /** Cognito group memberships mapped to app roles; [] means Public/no group. */
  roles: ('admin' | 'staff')[];
  createdAt: string;
  updatedAt: string;
}

/** Response envelope for GET /api/v1/users (design.md §3, FR-1). */
export interface ListUsersResult {
  users: AdminUser[];
  /** Opaque Cognito pagination token for the next page. Absent on last page. */
  paginationToken?: string;
}

/** Query parameters for listUsers (design.md §3 ListUsersQueryDto). */
export interface ListUsersQuery {
  /** Max users per page. Cognito cap is 60 (design.md §3). */
  limit?: number;
  /** Opaque token from a previous ListUsersResult. */
  paginationToken?: string;
}

/** Body for POST /api/v1/users — create a new Cognito user (FR-3). */
export interface CreateUserInput {
  /** Email address — used as both the Cognito alias and the invitation target. */
  email: string;
  /** Role group to assign on creation. Omit to leave the user in the Public tier. */
  role?: 'admin' | 'staff';
}

/** Body for PATCH /api/v1/users/:id — update attributes (FR-4). */
export interface UpdateUserInput {
  /** New email address. */
  email?: string;
  /** Enable or disable the account. */
  enabled?: boolean;
}

/** Body for PATCH /api/v1/users/:id/role — set/clear group membership (FR-5, FR-8). */
export interface SetRoleInput {
  /** 'none' removes from all recognised groups (Public tier). */
  role: 'admin' | 'staff' | 'none';
}

/**
 * Response for POST /api/v1/users (design.md §5.1, FR-3).
 * The backend no longer emails the invitation — it RETURNS the temporary
 * password once so the admin can share it out-of-band. Mirrors the backend
 * union exactly: { user, temporaryPassword }.
 */
export interface CreateUserResult {
  user: AdminUser;
  /** One-time temporary password — display once, never persist/log. */
  temporaryPassword: string;
}

/**
 * Response for POST /api/v1/users/:id/password (design.md §5.1, FR-6).
 * The backend no longer emails the reset — it RETURNS a new temporary
 * password once so the admin can share it out-of-band.
 */
export interface ResetPasswordResult {
  /** One-time temporary password — display once, never persist/log. */
  temporaryPassword: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const BASE = '/api/v1/users';

// ── API functions — design.md §3 ──────────────────────────────────────────

/**
 * GET /api/v1/users?limit=&paginationToken=
 * Lists Cognito users with optional limit + cursor-based pagination (FR-1).
 * Throws AuthFailureError on 401; throws Error on other non-OK responses.
 *
 * @param query  Optional limit + paginationToken.
 * @param token  Cognito access token from the caller's session.
 */
export async function listUsers(
  query: ListUsersQuery | undefined,
  token: string,
): Promise<ListUsersResult> {
  const params = new URLSearchParams();
  if (query?.limit != null) params.set('limit', String(query.limit));
  if (query?.paginationToken != null) params.set('paginationToken', query.paginationToken);
  const qs = params.toString();
  const path = qs ? `${BASE}?${qs}` : BASE;

  return apiFetch<ListUsersResult>(path, { method: 'GET', token });
}

/**
 * GET /api/v1/users/:id
 * Fetches a single admin user by Cognito Username/sub (FR-2).
 * Throws 404-wrapped Error when not found; AuthFailureError on 401.
 *
 * @param id     Cognito Username (uuid == JWT sub).
 * @param token  Cognito access token from the caller's session.
 */
export async function getUser(id: string, token: string): Promise<AdminUser> {
  return apiFetch<AdminUser>(`${BASE}/${encodeURIComponent(id)}`, { method: 'GET', token });
}

/**
 * POST /api/v1/users
 * Creates a new Cognito user and optionally assigns a role group (FR-3).
 * Returns 201 { user, temporaryPassword } — the temporary password is shown
 * once to the admin to share out-of-band (no invitation email is sent).
 * Returns 409 if email already exists. Throws wrapped Error on 400/409;
 * AuthFailureError on 401.
 *
 * @param input  { email, role? }
 * @param token  Cognito access token from the caller's session.
 */
export async function createUser(input: CreateUserInput, token: string): Promise<CreateUserResult> {
  return apiFetch<CreateUserResult>(BASE, { method: 'POST', token, body: input });
}

/**
 * PATCH /api/v1/users/:id
 * Updates email and/or enabled state of an existing user (FR-4).
 * Throws 404-wrapped Error when not found; AuthFailureError on 401.
 *
 * @param id     Cognito Username (uuid == JWT sub).
 * @param input  { email?, enabled? }
 * @param token  Cognito access token from the caller's session.
 */
export async function updateUser(
  id: string,
  input: UpdateUserInput,
  token: string,
): Promise<AdminUser> {
  return apiFetch<AdminUser>(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    token,
    body: input,
  });
}

/**
 * PATCH /api/v1/users/:id/role
 * Assigns or removes the user's Cognito group (FR-5, FR-8).
 * Use role='none' to move the user back to the Public tier.
 * The server blocks self-demote (FR-8) — expect a 409 in that case.
 * Throws AuthFailureError on 401.
 *
 * @param id     Cognito Username (uuid == JWT sub).
 * @param input  { role: 'admin'|'staff'|'none' }
 * @param token  Cognito access token from the caller's session.
 */
export async function setUserRole(
  id: string,
  input: SetRoleInput,
  token: string,
): Promise<AdminUser> {
  return apiFetch<AdminUser>(`${BASE}/${encodeURIComponent(id)}/role`, {
    method: 'PATCH',
    token,
    body: input,
  });
}

/**
 * DELETE /api/v1/users/:id
 * Permanently deletes the Cognito user (FR-6, FR-8).
 * The server blocks self-delete (FR-8) — expect a 409 in that case.
 * Returns void on success (HTTP 204). Throws on 404 / 409 / 401.
 *
 * @param id     Cognito Username (uuid == JWT sub).
 * @param token  Cognito access token from the caller's session.
 */
export async function deleteUser(id: string, token: string): Promise<void> {
  return apiFetch<void>(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
    expectEmpty: true,
  });
}

/**
 * POST /api/v1/users/:id/password
 * Resets the user's password (FR-7). Returns 200 { temporaryPassword } — a new
 * one-time temporary password the admin shares out-of-band. The user must set a
 * new password at first sign-in. No email is sent. Throws on 404 / 401.
 *
 * @param id     Cognito Username (uuid == JWT sub).
 * @param token  Cognito access token from the caller's session.
 */
export async function resetUserPassword(id: string, token: string): Promise<ResetPasswordResult> {
  return apiFetch<ResetPasswordResult>(`${BASE}/${encodeURIComponent(id)}/password`, {
    method: 'POST',
    token,
  });
}
