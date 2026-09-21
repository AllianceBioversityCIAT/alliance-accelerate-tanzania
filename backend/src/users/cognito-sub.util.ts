// @sdd-spec auth/account-access-emails (T-3)
/**
 * T-3 — resolve a Cognito `sub` from whichever attribute shape
 * `AdminCreateUser` or `AdminGetUser` returns, for the non-PII correlation
 * id `MailService.dispatch()` logs (design.md §5.2, DD-3 as corrected by
 * judgment round 1's J-4; `judgment.md`).
 *
 * Relocated here from `mail/` by Leader decision (tasks.md T-3): its only
 * consumers are `UsersService.create()` and `UsersService.resetPassword()`
 * (T-4/T-5 — design.md §5.3; **not yet built as of this task**, and
 * `users.service.ts` today calls no `MailService` method), and this module
 * already sets the util-file pattern for a Cognito-credential helper —
 * `temp-password.util.ts` sits beside this file for the same reason.
 *
 * Two typed traps, both verified against
 * `@aws-sdk/client-cognito-identity-provider`'s `models_0.d.ts` before this
 * was written:
 *
 *  1. `AdminCreateUserResponse.User` and `UserType.Attributes` are BOTH
 *     `optional` (`User?: UserType | undefined`, `Attributes?: AttributeType[]
 *     | undefined`) — a created user can come back with no attributes
 *     echoed at all, or with no `User` at all.
 *  2. `AdminGetUserResponse` exposes the list as `UserAttributes`, not
 *     `Attributes` — the same difference `UsersService.get()` already
 *     documents in `users.service.ts` (its docblock: *"`AdminGetUserCommandOutput`
 *     exposes `UserAttributes` (not `Attributes`) and does not echo
 *     `Username`"*).
 *
 * **`Username` is accepted on the input type below and never read.** In
 * this system `Username` IS the email address: `UsersService.create()`
 * calls `AdminCreateUser` with `Username: dto.email` (`users.service.ts`),
 * and `users.serializer.ts`'s `toAdminUser` derives the public `id` field
 * as `user.Username ?? ''`. Falling back to it when `sub` cannot be
 * resolved would write a plaintext address to every `MailService.dispatch`
 * attempt/outcome line — the exact NFR-1 violation the original version of
 * design.md DD-3 would have shipped, caught by judgment round 1 (J-4).
 * `resolveCognitoSub` therefore returns `undefined`, never a substitute,
 * when no `sub` attribute is present.
 */
import type { AttributeType } from '@aws-sdk/client-cognito-identity-provider';

/**
 * The common shape of what `AdminCreateUserCommandOutput.User` and an
 * `AdminGetUserCommandOutput` both are: an attribute list under one of two
 * field names, plus `Username` — deliberately never read by
 * {@link resolveCognitoSub}.
 *
 * `Username` is declared here **not** because a raw SDK response needs it to
 * pass through unmodified — TypeScript's excess-property check applies only
 * to fresh object literals, so `AdminCreateUserCommandOutput.User` and
 * `AdminGetUserCommandOutput` assign to this type whether or not the field is
 * declared. It is declared so the specs can construct the realistic
 * absent-`sub` literals that pin the never-substitute rule:
 * `cognito-sub.util.spec.ts`'s "never Username" tests and
 * `mail.service.spec.ts`'s NFR-1 falsifier both build object *literals*
 * carrying `Username` to express that scenario, and a literal without this
 * field on the type would not compile. Removing it would disarm those tests,
 * not the pass-through — a future reader should not re-derive the wrong
 * reason and delete it as dead weight.
 */
export interface CognitoAttributeSource {
  Attributes?: AttributeType[];
  UserAttributes?: AttributeType[];
  Username?: string;
}

/**
 * Extract the `sub` attribute's value from a Cognito user/response object.
 *
 * Returns `undefined` — never a substitute value such as `Username`/`id` —
 * when `source` is absent, carries neither `Attributes` nor
 * `UserAttributes`, or the list has no `sub` entry.
 */
export function resolveCognitoSub(
  source: CognitoAttributeSource | undefined,
): string | undefined {
  const attributes = source?.Attributes ?? source?.UserAttributes;
  return attributes?.find((attribute) => attribute.Name === 'sub')?.Value;
}
