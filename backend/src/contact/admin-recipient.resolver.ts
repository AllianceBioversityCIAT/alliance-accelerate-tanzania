// @sdd-spec contact/contact-channels (T-5)
/**
 * T-5 — Resolve the current Cognito `admin` group membership to a
 * recipient list for the public contact form (design.md §4.3, requirements.md
 * FR-3, NFR-8).
 *
 * Mirrors `ActingAdminResolver`'s per-container cache shape (one shared
 * instance, a plain in-memory cache, `resetCache()` test seam) with one
 * deliberate divergence: that precedent caches a `sub -> email` mapping that
 * never changes, so it carries no TTL at all. Group *membership* changes
 * over time (an admin can be added or removed through the admin panel), so
 * this cache expires after a bounded 60 s window — long enough that a burst
 * of submissions issues one directory call instead of one each (NFR-8),
 * short enough that a membership change takes effect without a redeploy,
 * config edit or container restart (FR-3).
 *
 * Resolution order: cache hit within the 60 s TTL -> live `admin` group,
 * paginated over `NextToken` until exhausted -> configured fallback. The
 * resolver never throws on a directory failure or an empty group; the one
 * remaining throw ({@link getFallback}) fires only when the fallback path is
 * actually reached — an empty group or a directory failure — AND
 * `CONTACT_FALLBACK_RECIPIENT` is unset. That throw propagates out of
 * `resolve()`, which `ContactService.submitContact` calls OUTSIDE its own
 * `try`/`catch` — so it escapes as a plain `Error`, not a swallowed
 * background continuation (DD-3 retired fire-and-forget for this feature),
 * and Nest renders it as a `500` (a missing fallback CONFIGURATION — ours),
 * never the `502` reserved for a transport REJECTION upstream (design.md §3,
 * §4.3 amendment 3, corrected 2026-08-28 after two independent Reviewers
 * caught this file asserting the wrong status for the same throw).
 * It also NEVER returns an empty array — an empty `admin` group is precisely
 * the case `CONTACT_FALLBACK_RECIPIENT` exists for, and the mail transport
 * downstream adds no guard against an empty `to` list (design.md §4.6 / the
 * T-1 review forward pointer), so this resolver is the only thing standing
 * between an empty group and a malformed SES call.
 *
 * The degradation (empty group or directory failure) is logged with no
 * requester field value and no recipient address — the log line names only
 * that a fallback occurred, never which address it fell back to.
 *
 * `staff` is excluded by construction, not by a filter: this resolver issues
 * exactly one `ListUsersInGroupCommand`, naming the `admin` group, and has
 * no code path that could reach any other group.
 *
 * `CONTACT_FALLBACK_RECIPIENT` is resolved lazily, at first use — inside
 * {@link getFallback}, only when `resolve()`'s fallback path is actually
 * reached — never at module initialization. This follows `getSesMailConfig()`
 * (`mail/mail.config.ts`): "Resolved lazily … not at module init, so a
 * checkout without `MAIL_TRANSPORT` set can still boot and serve every other
 * route." The same pattern holds in `auth/auth.config.ts` and
 * `users/cognito-admin.client.ts`. `ContactModule` is registered directly in
 * `AppModule`, so an init-time throw here would fire in every graph that
 * includes `AppModule` — a prior revision required exactly that, on the
 * theory that a lazy throw would land inside a swallowed fire-and-forget
 * continuation; DD-3 removed fire-and-forget in the same revision, which
 * voided that justification (design.md §4.3, amended 2026-08-28). Lazy
 * resolution keeps `AppModule` bootable — asserted by a test that
 * constructs this resolver through Nest's DI container and runs its module
 * lifecycle with the variable unset — with the tradeoff stated plainly: a
 * missing variable is no longer caught at deploy time, only the first time
 * the fallback path is exercised.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ListUsersInGroupCommand } from '@aws-sdk/client-cognito-identity-provider';

import { getCognitoAdminClient, getUserPoolId } from '../users/cognito-admin.client';

/** The one Cognito group this resolver ever queries. `staff` is never named. */
const ADMIN_GROUP_NAME = 'admin';

/** Bounded cache window (NFR-8) — see the class docblock for the tradeoff. */
const CACHE_TTL_MS = 60_000;

interface CachedRecipients {
  emails: string[];
  expiresAt: number;
}

@Injectable()
export class AdminRecipientResolver {
  private readonly logger = new Logger(AdminRecipientResolver.name);

  /** Per-container cache: one directory resolution per 60 s window. */
  private cached: CachedRecipients | undefined;

  /**
   * Resolve the current recipient list. A cache hit within 60 s returns
   * immediately with no SDK call. Otherwise re-queries the live `admin`
   * group (paginating over `NextToken` until exhausted) and, on an empty
   * group or any directory failure, degrades to the configured fallback and
   * logs the degradation — never returning an empty array.
   */
  async resolve(): Promise<string[]> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) {
      return this.cached.emails;
    }

    let emails: string[];
    try {
      emails = await this.fetchAdminEmails();
    } catch {
      emails = [];
    }

    const result = emails.length > 0 ? emails : [this.getFallback()];
    if (emails.length === 0) {
      this.logDegradation();
    }

    this.cached = { emails: result, expiresAt: now + CACHE_TTL_MS };
    return result;
  }

  /** Live directory read — every current `admin` member, every page. */
  private async fetchAdminEmails(): Promise<string[]> {
    const client = getCognitoAdminClient();
    const UserPoolId = getUserPoolId();

    const emails: string[] = [];
    let nextToken: string | undefined;

    do {
      const page = await client.send(
        new ListUsersInGroupCommand({
          UserPoolId,
          GroupName: ADMIN_GROUP_NAME,
          NextToken: nextToken,
        }),
      );

      for (const user of page.Users ?? []) {
        const email = user.Attributes?.find((attr) => attr.Name === 'email')?.Value;
        if (email) {
          emails.push(email);
        }
      }

      nextToken = page.NextToken;
    } while (nextToken);

    return emails;
  }

  /**
   * The configured fallback address — resolved lazily, at first use, only
   * when `resolve()`'s fallback path is actually reached (an empty `admin`
   * group or a directory failure). Mirrors `getSesMailConfig()`'s
   * `required()` helper (`mail/mail.config.ts`): never validated at module
   * init, so a checkout without `CONTACT_FALLBACK_RECIPIENT` set can still
   * boot `AppModule` and serve every other route. Throws a clear error here,
   * inside the awaited `resolve()` call, if unset (design.md §4.3, amended
   * 2026-08-28).
   */
  private getFallback(): string {
    const value = process.env.CONTACT_FALLBACK_RECIPIENT;
    if (!value) {
      throw new Error(
        'Missing required env var CONTACT_FALLBACK_RECIPIENT. Set it so the ' +
          'contact form has somewhere to deliver when the admin group ' +
          'resolves empty or the Cognito directory call fails (design.md §4.3).',
      );
    }
    return value;
  }

  /**
   * Log the degradation with no requester field value and no recipient
   * address (FR-3) — the line names only that a fallback occurred.
   */
  private logDegradation(): void {
    this.logger.warn(
      'admin group resolved no members or the directory call failed; ' +
        'falling back to CONTACT_FALLBACK_RECIPIENT',
    );
  }

  /** Test seam — reset the in-memory cache between specs. */
  resetCache(): void {
    this.cached = undefined;
  }
}
