import { ConsentStatus, ConsentMethod } from '@prisma/client';
import {
  isConsentProvenanceSatisfied,
  type ConsentProvenanceState,
} from './consent-provenance.policy';

/**
 * T-2 — Unit tests for the shared consent-provenance invariant (DD-1, DD-3).
 * Pure, no DB/Nest. Expected values are transcribed BY HAND from
 * `design.md` §4.1's five-row truth table and cross-checked against FR-3's
 * Given/When/Then scenarios — never from running the implementation.
 *
 * The whole point of this predicate (per R-9/J-1) is that it must trigger on
 * VALUE CHANGE, never on mere key presence in the payload. Every row below
 * that matters (rows 3 and 5) sends `consentStatus` as a body key, because
 * that is what `ActorForm.tsx` always does — a key-presence implementation
 * would reject them and this suite would fail.
 */
describe('isConsentProvenanceSatisfied — design.md §4.1 truth table', () => {
  // Row 1 — design.md §4.1 row 1 / FR-3 "Create with GRANTED but no provenance".
  // (a) fires: no stored actor = a transition into GRANTED. (b) n/a.
  // Expected: Reject (false) — create supplies no method/date.
  it('row 1: create GRANTED with no provenance is REJECTED', () => {
    const stored: ConsentProvenanceState | null = null;
    const payload = {
      consentStatus: ConsentStatus.GRANTED,
    };

    expect(isConsentProvenanceSatisfied(stored, payload)).toBe(false);
  });

  // Row 2 — design.md §4.1 row 2 / FR-3 "Update that transitions an actor to GRANTED".
  // (a) fires: stored UNKNOWN -> GRANTED. Payload supplies method + date.
  // Expected: Allow (true).
  it('row 2: UNKNOWN -> GRANTED with method + date is ALLOWED', () => {
    const stored: ConsentProvenanceState = {
      consentStatus: ConsentStatus.UNKNOWN,
      consentMethod: ConsentMethod.NOT_RECORDED,
      consentObtainedAt: null,
    };
    const payload = {
      consentStatus: ConsentStatus.GRANTED,
      consentMethod: ConsentMethod.SIGNED_FORM,
      consentObtainedAt: new Date('2026-01-15'),
    };

    expect(isConsentProvenanceSatisfied(stored, payload)).toBe(true);
  });

  // Row 3 — design.md §4.1 row 3 / FR-3 "Editing a field unrelated to consent".
  // The legacy-actor-unchanged-values row (R-9 / J-1's central case): the
  // admin form sends a FULL object, so consentStatus and consentMethod are
  // both present as body keys, unchanged. Neither (a) nor (b) fires.
  // Expected: Allow (true) — specifically BECAUSE no value changed.
  it('row 3: legacy GRANTED+NOT_RECORDED actor, full-object resubmit with only district changing, is ALLOWED', () => {
    const stored: ConsentProvenanceState = {
      consentStatus: ConsentStatus.GRANTED,
      consentMethod: ConsentMethod.NOT_RECORDED,
      consentObtainedAt: null,
    };
    // Full object as ActorForm.tsx always sends it — consentStatus and
    // consentMethod are present as keys, but their VALUES equal stored.
    const payload = {
      consentStatus: ConsentStatus.GRANTED,
      consentMethod: ConsentMethod.NOT_RECORDED,
      consentObtainedAt: null,
    };

    expect(isConsentProvenanceSatisfied(stored, payload)).toBe(true);
  });

  // Row 4 — design.md §4.1 row 4 / FR-3 "Evidence cannot be stripped from a
  // published actor". (a) does not fire (already GRANTED). (b) fires:
  // consentMethod changes SIGNED_FORM -> NOT_RECORDED while staying GRANTED.
  // Expected: Reject (false).
  it('row 4: GRANTED+SIGNED_FORM stripped to consentMethod=NOT_RECORDED while staying GRANTED is REJECTED', () => {
    const stored: ConsentProvenanceState = {
      consentStatus: ConsentStatus.GRANTED,
      consentMethod: ConsentMethod.SIGNED_FORM,
      consentObtainedAt: new Date('2026-01-15'),
    };
    const payload = {
      consentStatus: ConsentStatus.GRANTED,
      consentMethod: ConsentMethod.NOT_RECORDED,
    };

    expect(isConsentProvenanceSatisfied(stored, payload)).toBe(false);
  });

  // Row 5 — design.md §4.1 row 5 / FR-3 "Evidence cannot be stripped..." BUT
  // clause: un-publish-then-strip. The effective post-write consentStatus is
  // DENIED, not GRANTED, so the guard never fires regardless of (a)/(b).
  // Expected: Allow (true) — "un-publishing first is legitimate".
  it('row 5: GRANTED+SIGNED_FORM -> DENIED with provenance cleared is ALLOWED (un-publish-then-strip)', () => {
    const stored: ConsentProvenanceState = {
      consentStatus: ConsentStatus.GRANTED,
      consentMethod: ConsentMethod.SIGNED_FORM,
      consentObtainedAt: new Date('2026-01-15'),
    };
    const payload = {
      consentStatus: ConsentStatus.DENIED,
      consentMethod: ConsentMethod.NOT_RECORDED,
      consentObtainedAt: null,
    };

    expect(isConsentProvenanceSatisfied(stored, payload)).toBe(true);
  });
});

describe('isConsentProvenanceSatisfied — never a key-presence check', () => {
  // Direct proof against the R-9/J-1 misreading: a payload that OMITS
  // consentStatus entirely (so `'consentStatus' in payload` is false) must
  // still be gated correctly when it changes a provenance field on an
  // already-GRANTED actor — the trigger is about the VALUE, not the key.
  it('fires on provenance-field value change even when consentStatus is absent from the payload', () => {
    const stored: ConsentProvenanceState = {
      consentStatus: ConsentStatus.GRANTED,
      consentMethod: ConsentMethod.SIGNED_FORM,
      consentObtainedAt: new Date('2026-01-15'),
    };
    // consentStatus key not present at all — effective status still resolves
    // to the stored GRANTED, and consentMethod's value still changes.
    const payload = {
      consentMethod: ConsentMethod.NOT_RECORDED,
    };

    expect(isConsentProvenanceSatisfied(stored, payload)).toBe(false);
  });

  it('does not reject a full-object resubmit on a non-GRANTED actor even though every key is present', () => {
    const stored: ConsentProvenanceState = {
      consentStatus: ConsentStatus.UNKNOWN,
      consentMethod: ConsentMethod.NOT_RECORDED,
      consentObtainedAt: null,
    };
    const payload = {
      consentStatus: ConsentStatus.UNKNOWN,
      consentMethod: ConsentMethod.NOT_RECORDED,
      consentObtainedAt: null,
    };

    expect(isConsentProvenanceSatisfied(stored, payload)).toBe(true);
  });
});

describe('isConsentProvenanceSatisfied — create path (stored = null)', () => {
  // Not a §4.1 row on its own, but the create call site always passes
  // `stored = null`; confirm the predicate treats "no stored actor" as
  // "not GRANTED" without throwing on missing fields.
  it('allows create when consentStatus is not GRANTED, regardless of provenance', () => {
    const payload = { consentStatus: ConsentStatus.UNKNOWN };

    expect(isConsentProvenanceSatisfied(null, payload)).toBe(true);
  });

  it('allows create GRANTED when the payload supplies valid provenance', () => {
    const payload = {
      consentStatus: ConsentStatus.GRANTED,
      consentMethod: ConsentMethod.PORTAL_CHECKBOX,
      consentObtainedAt: new Date('2026-02-01'),
    };

    expect(isConsentProvenanceSatisfied(null, payload)).toBe(true);
  });
});
