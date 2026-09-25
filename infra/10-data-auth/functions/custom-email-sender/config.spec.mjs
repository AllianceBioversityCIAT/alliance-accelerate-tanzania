// T-2 — direct coverage of config.mjs's refusal behaviour, ahead of
// messages.spec.mjs exercising the same refusals through the message
// builders (both are named falsifiers per tasks.md T-2).

import { getPublicAppBaseUrl } from './config.mjs';

const ORIGINAL = process.env.PUBLIC_APP_BASE_URL;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.PUBLIC_APP_BASE_URL;
  } else {
    process.env.PUBLIC_APP_BASE_URL = ORIGINAL;
  }
});

describe('getPublicAppBaseUrl()', () => {
  it('FALSIFIER 2 — throws when PUBLIC_APP_BASE_URL is unset', () => {
    delete process.env.PUBLIC_APP_BASE_URL;
    expect(() => getPublicAppBaseUrl()).toThrow(/PUBLIC_APP_BASE_URL/);
  });

  it('throws when PUBLIC_APP_BASE_URL is empty', () => {
    process.env.PUBLIC_APP_BASE_URL = '';
    expect(() => getPublicAppBaseUrl()).toThrow(/PUBLIC_APP_BASE_URL/);
  });

  it('FALSIFIER 1 — throws when PUBLIC_APP_BASE_URL is "*"', () => {
    process.env.PUBLIC_APP_BASE_URL = '*';
    expect(() => getPublicAppBaseUrl()).toThrow(/PUBLIC_APP_BASE_URL/);
  });

  it('throws on a non-http(s) value', () => {
    process.env.PUBLIC_APP_BASE_URL = 'ftp://example.org';
    expect(() => getPublicAppBaseUrl()).toThrow(/PUBLIC_APP_BASE_URL/);
  });

  it('returns a valid https URL unchanged', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://example.cloudfront.net';
    expect(getPublicAppBaseUrl()).toBe('https://example.cloudfront.net');
  });

  it('strips one or more trailing slashes', () => {
    process.env.PUBLIC_APP_BASE_URL = 'https://example.cloudfront.net///';
    expect(getPublicAppBaseUrl()).toBe('https://example.cloudfront.net');
  });

  it('never echoes the offending value in its error message (no accidental config leak)', () => {
    // A distinctive, clearly-injected value — not "*", which the message
    // legitimately names in its static explanatory text ("`*` is rejected
    // explicitly") regardless of what was actually configured.
    //
    // T-2 attempt 2 (Reviewer ADVISORY 1): the previous version of this test
    // put `throw new Error('expected getPublicAppBaseUrl to throw')` INSIDE
    // the try, so its own catch swallowed that thrown error and the
    // assertion passed no matter what — it stayed green under mutation even
    // when the throw under test was removed entirely. Fixed by asserting
    // the throw with `expect(...).toThrow()` first (which fails the test
    // outright if nothing throws), and capturing the message from inside
    // the thrower so a second invocation isn't needed.
    process.env.PUBLIC_APP_BASE_URL = 'not-a-url-xyzzy123';
    let caughtMessage;
    const thrower = () => {
      try {
        getPublicAppBaseUrl();
      } catch (err) {
        caughtMessage = err.message;
        throw err;
      }
    };

    // Tied to the reason, not merely to 'something threw' — a TypeError whose
    // message lacks the sentinel would otherwise keep this green (T-2 review
    // ADVISORY 2). The six sibling tests already use this form.
    expect(thrower).toThrow(/PUBLIC_APP_BASE_URL/);
    expect(caughtMessage).not.toContain('xyzzy123');
  });
});
