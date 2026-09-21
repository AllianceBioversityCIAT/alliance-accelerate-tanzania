// @sdd-spec auth/account-access-emails (T-3)
/**
 * `resolveCognitoSub` unit tests (design.md §5.2, NFR-1, J-4).
 *
 * These specs cover the helper's own return-value contract: both attribute
 * shapes, absence, and — the disqualifying clause on this task — that
 * `Username`/`id` is never substituted. Per tasks.md T-3's disqualifier, a
 * return-value assertion alone does not prove NFR-1 (a presence assertion
 * is not a behavioural proof, KZ-002); the behavioural proof over what
 * `MailService.dispatch()` actually logs lives in `mail.service.spec.ts`.
 * This file exists to pin the helper's own contract so that suite's
 * fallback falsifier has something correct to mutate.
 */
import { resolveCognitoSub } from './cognito-sub.util';

describe('resolveCognitoSub', () => {
  it('resolves sub from the AdminCreateUser shape (User.Attributes)', () => {
    const sub = resolveCognitoSub({
      Attributes: [
        { Name: 'email', Value: 'new-user@example.org' },
        { Name: 'sub', Value: 'abc-123-sub' },
      ],
    });

    expect(sub).toBe('abc-123-sub');
  });

  it('resolves sub from the AdminGetUser shape (UserAttributes, not Attributes)', () => {
    const sub = resolveCognitoSub({
      Username: 'existing-user@example.org',
      UserAttributes: [
        { Name: 'email', Value: 'existing-user@example.org' },
        { Name: 'sub', Value: 'def-456-sub' },
      ],
    });

    expect(sub).toBe('def-456-sub');
  });

  it('prefers Attributes over UserAttributes when both are somehow present', () => {
    const sub = resolveCognitoSub({
      Attributes: [{ Name: 'sub', Value: 'from-attributes' }],
      UserAttributes: [{ Name: 'sub', Value: 'from-user-attributes' }],
    });

    expect(sub).toBe('from-attributes');
  });

  it('returns undefined — never Username — when no sub attribute is present', () => {
    const sub = resolveCognitoSub({
      Username: 'admin-created@example.org',
      Attributes: [{ Name: 'email', Value: 'admin-created@example.org' }],
    });

    expect(sub).toBeUndefined();
    expect(sub).not.toBe('admin-created@example.org');
  });

  it('returns undefined when the attribute list itself is absent (AdminCreateUserResponse.User trap)', () => {
    const sub = resolveCognitoSub({ Username: 'no-attributes@example.org' });
    expect(sub).toBeUndefined();
  });

  it('returns undefined when the whole source is undefined (User missing entirely)', () => {
    const sub = resolveCognitoSub(undefined);
    expect(sub).toBeUndefined();
  });

  it('returns undefined when Attributes is an empty array', () => {
    const sub = resolveCognitoSub({ Attributes: [] });
    expect(sub).toBeUndefined();
  });
});
