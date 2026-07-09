// @sdd-spec admin/actor-crud-audit (T-3)
/**
 * T-3 — Resolve a Cognito `sub` to the user's email address.
 *
 * The access token used by the frontend carries only the `sub` claim, while the
 * audit log needs a human-readable acting-admin email (FR-5). This resolver
 * queries Cognito with `ListUsersCommand` filtered by `sub`, caches the result
 * per Lambda container, and returns `null` on any failure so the audit write is
 * never blocked (design §4, §8 ADR).
 */

import { Injectable } from '@nestjs/common';
import { ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';

import {
  getCognitoAdminClient,
  getUserPoolId,
} from '../users/cognito-admin.client';

@Injectable()
export class ActingAdminResolver {
  /** Per-container cache: one SDK call per sub per Lambda container. */
  private readonly cache = new Map<string, Promise<string | null>>();

  /**
   * Resolve a Cognito `sub` to the user's email.
   *
   * Returns the cached promise on subsequent calls for the same `sub`. Never
   * throws to callers: missing user, missing email attribute, or any SDK
   * failure all return `null`.
   */
  resolve(sub: string): Promise<string | null> {
    const cached = this.cache.get(sub);
    if (cached) {
      return cached;
    }

    const promise = this.fetchEmail(sub).catch(() => null);
    this.cache.set(sub, promise);
    return promise;
  }

  private async fetchEmail(sub: string): Promise<string | null> {
    try {
      const client = getCognitoAdminClient();
      const UserPoolId = getUserPoolId();

      const result = await client.send(
        new ListUsersCommand({
          UserPoolId,
          Limit: 1,
          Filter: `sub = "${sub}"`,
        }),
      );

      const user = result.Users?.[0];
      if (!user) {
        return null;
      }

      const email = user.Attributes?.find((attr) => attr.Name === 'email')?.Value;
      return email ?? null;
    } catch {
      return null;
    }
  }

  /** Test seam — reset the in-memory cache between specs. */
  resetCache(): void {
    this.cache.clear();
  }
}
