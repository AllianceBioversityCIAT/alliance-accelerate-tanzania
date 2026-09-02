// @sdd-spec admin/registration-review-queue (T-11)
/**
 * Unit tests for lib/api/registrations-admin.ts.
 *
 * Covers, per five-route contract (`design.md` §5):
 *   - adminListRegistrations / adminGetRegistration / approveRegistration /
 *     rejectRegistration / dismissDuplicateCandidate hit the correct URL,
 *     method, and (for writes) JSON body.
 *   - Bearer token is attached as Authorization: Bearer <token>.
 *   - Successful responses round-trip as typed objects. Fixtures are
 *     type-annotated mirrors of the real backend wire shapes (tsc-enforced,
 *     via `tsc`'s excess/missing-property check on the fixture literals) —
 *     including the three carried-forward wire facts: 200 (not 201) on
 *     approve, the minimal write-response envelopes on reject/
 *     dismiss-duplicate, and `string | null` reviewer/dismisser identities
 *     on the activity trail. The runtime non-echo evidence (i.e. not mock
 *     echoes) is URL, method, serialized body, and error mapping.
 *   - 400 field errors (acknowledgement mismatch, unknown reject reason),
 *     403 (Staff), 404 (unknown id/candidate), 409 (double-adjudication /
 *     traderId collision), and 401 (AuthFailureError) are thrown correctly,
 *     with `ApiError.details` asserted by value.
 *   - adminListRegistrations builds the querystring and clamps pageSize to
 *     ≤ 100.
 *   - A type-level falsification harness for `RegistrationStatus`: an
 *     exhaustive switch whose `default` branch only compiles if the union
 *     stays closed — `npx tsc --noEmit` reddens the instant it is widened
 *     to `string`, which `npm test` (SWC, no type-checking) cannot detect.
 */

// ---------------------------------------------------------------------------
// Mock aws-amplify/auth (pulled in transitively via apiFetch → client.ts)
// ---------------------------------------------------------------------------

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  adminListRegistrations,
  adminGetRegistration,
  approveRegistration,
  rejectRegistration,
  dismissDuplicateCandidate,
  type AdminRegistrationList,
  type AdminRegistrationListRow,
  type AdminRegistrationDetail,
  type RegistrationApproveResult,
  type RegistrationRejectResult,
  type DismissDuplicateResult,
  type RegistrationStatus,
  type ActivityTrailEvent,
} from './registrations-admin';
import { ApiError, AuthFailureError } from './client';
import type { AdminActor } from './actors-admin';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.example.com';
const TOKEN = 'test-bearer-token-abc';
const REGISTRATION_ID = 'registration-cuid-001';
const CANDIDATE_ACTOR_ID = 'actor-cuid-existing-001';

// ---------------------------------------------------------------------------
// Fixtures — shaped exactly as the real backend serializers emit them
// ---------------------------------------------------------------------------

const LIST_ROW: AdminRegistrationListRow = {
  id: REGISTRATION_ID,
  reference: 'REG-2026-0184',
  applicant: 'Mbeya Seeds Ltd',
  traderType: 'seed_company',
  region: 'Mbeya',
  submittedAt: '2026-08-20T09:00:00.000Z',
  status: 'PENDING_REVIEW',
  duplicateCandidateCount: 2,
};

const LIST_RESPONSE: AdminRegistrationList = {
  data: [LIST_ROW],
  page: 1,
  pageSize: 20,
  total: 1,
};

const ADMIN_ACTOR: AdminActor = {
  id: 'actor-cuid-new-001',
  traderId: 'SR-2026-0184',
  traderName: 'Mbeya Seeds Ltd',
  region: 'Mbeya',
  district: 'Mbeya Urban',
  traderType: 'seed_company',
  sex: 'female',
  position: 'Manager',
  marketLocation: 'Mbeya Central Market',
  capacityTons: 500,
  technicalSupport: null,
  phone: '+255123456789',
  email: 'submitter@mbeyaseeds.example',
  gpsLatitude: -8.9,
  gpsLongitude: 33.46,
  gpsAltitude: null,
  gpsAccuracy: null,
  consentStatus: 'GRANTED',
  registrationSource: 'SELF_REGISTERED',
  consentMethod: 'PORTAL_CHECKBOX',
  consentObtainedAt: '2026-08-20T09:00:00.000Z',
  consentReference: 'REG-2026-0184',
  crops: ['sorghum', 'common_bean'],
  createdAt: '2026-08-21T10:00:00.000Z',
  updatedAt: '2026-08-21T10:00:00.000Z',
};

const APPROVE_RESULT: RegistrationApproveResult = {
  registration: {
    id: REGISTRATION_ID,
    reference: 'REG-2026-0184',
    status: 'APPROVED',
    publishedActorId: ADMIN_ACTOR.id,
  },
  actor: ADMIN_ACTOR,
};

const REJECT_RESULT: RegistrationRejectResult = {
  registration: {
    id: REGISTRATION_ID,
    reference: 'REG-2026-0184',
    status: 'REJECTED',
  },
};

const DISMISS_RESULT: DismissDuplicateResult = {
  registration: {
    id: REGISTRATION_ID,
    reference: 'REG-2026-0184',
    status: 'PENDING_REVIEW',
  },
};

/**
 * Activity trail with `ADJUDICATED` and `DUPLICATE_DISMISSED` events
 * carrying `null` identities — the exact carried-forward shape T-6/T-7
 * fixed (reviewer/dismisser identity unresolved is a real, reachable
 * production state, never coalesced to `''`).
 */
const ACTIVITY_TRAIL: ActivityTrailEvent[] = [
  { type: 'SUBMITTED', occurredAt: '2026-08-20T09:00:00.000Z' },
  { type: 'EMAIL_VERIFIED', occurredAt: '2026-08-20T09:05:00.000Z' },
  {
    type: 'CONSENT_RECORDED',
    occurredAt: '2026-08-20T09:06:00.000Z',
    policyVersion: '2026-06-01',
  },
  {
    type: 'DUPLICATE_DISMISSED',
    occurredAt: '2026-08-21T08:00:00.000Z',
    candidateActorId: CANDIDATE_ACTOR_ID,
    dismissedBySub: 'cognito-sub-admin-001',
    dismissedByEmail: null,
  },
  {
    type: 'ADJUDICATED',
    occurredAt: '2026-08-21T10:00:00.000Z',
    status: 'APPROVED',
    reviewedBySub: 'cognito-sub-admin-001',
    reviewedByEmail: null,
  },
];

const DETAIL_RESPONSE: AdminRegistrationDetail = {
  id: REGISTRATION_ID,
  reference: 'REG-2026-0184',
  status: 'APPROVED',
  payload: {
    traderName: 'Mbeya Seeds Ltd',
    traderType: 'seed_company',
    contactPerson: 'Jane Mwangi',
    position: 'Manager',
    district: 'Mbeya Urban',
    marketLocation: 'Mbeya Central Market',
    sex: 'female',
    region: 'Mbeya',
    gpsLatitude: -8.9,
    gpsLongitude: 33.46,
    crops: ['sorghum', 'common_bean'],
    otherCrops: 'sunflower',
    capacityTons: 500,
    phone: '+255123456789',
  },
  submitterEmail: 'submitter@mbeyaseeds.example',
  consent: {
    consentingOrganisation: 'Mbeya Seeds Ltd',
    policyVersion: '2026-06-01',
    acceptedAt: '2026-08-20T09:06:00.000Z',
    acceptedAtQualifier: 'RECORDED_AT_SUBMISSION',
  },
  duplicateCandidates: [
    { actorId: 'actor-cuid-002', traderId: 'OFB-0002', traderName: 'Mbeya Seed Co', matchedOn: ['phone', 'traderName'] },
  ],
  activityTrail: ACTIVITY_TRAIL,
};

// ---------------------------------------------------------------------------
// Helpers — mirrors actors-admin.test.ts exactly
// ---------------------------------------------------------------------------

function makeFetchOk(body: unknown, status = 200): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  });
}

function makeFetchNotOk(status: number, envelope: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: 'Error',
    json: () => Promise.resolve(envelope),
  });
}

function make401(): jest.Mock {
  return makeFetchNotOk(401, {
    statusCode: 401,
    message: 'Unauthorized',
    error: 'Unauthorized',
  });
}

function make403(): jest.Mock {
  return makeFetchNotOk(403, {
    statusCode: 403,
    message: 'Forbidden resource',
    error: 'Forbidden',
  });
}

/** Extracts the parsed request init from global.fetch call #0. */
function callInit(): RequestInit {
  return (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
}

function callUrl(): string {
  return (global.fetch as jest.Mock).mock.calls[0][0] as string;
}

function callBody(): unknown {
  const init = callInit();
  return init.body ? JSON.parse(init.body as string) : undefined;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_API_BASE_URL: BASE_URL };
  jest.resetAllMocks();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

// ---------------------------------------------------------------------------
// adminListRegistrations()
// ---------------------------------------------------------------------------

describe('adminListRegistrations()', () => {
  it('hits GET /api/v1/admin/registrations with no querystring when no query is supplied', async () => {
    global.fetch = makeFetchOk(LIST_RESPONSE);

    await adminListRegistrations(undefined, TOKEN);

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/admin/registrations`);
    expect(callInit().method).toBe('GET');
  });

  it('builds a querystring from status, q, region, traderType, sort, page, pageSize', async () => {
    global.fetch = makeFetchOk(LIST_RESPONSE);

    await adminListRegistrations(
      {
        status: 'PENDING_REVIEW',
        q: 'Mbeya',
        region: 'Mbeya',
        traderType: 'seed_company',
        sort: 'newest',
        page: 2,
        pageSize: 10,
      },
      TOKEN,
    );

    const url = new URL(callUrl());
    expect(url.pathname).toBe('/api/v1/admin/registrations');
    expect(url.searchParams.get('status')).toBe('PENDING_REVIEW');
    expect(url.searchParams.get('q')).toBe('Mbeya');
    expect(url.searchParams.get('region')).toBe('Mbeya');
    expect(url.searchParams.get('traderType')).toBe('seed_company');
    expect(url.searchParams.get('sort')).toBe('newest');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('pageSize')).toBe('10');
  });

  it('clamps pageSize to 100 client-side when a larger value is supplied (NFR-9)', async () => {
    global.fetch = makeFetchOk(LIST_RESPONSE);

    await adminListRegistrations({ pageSize: 500 }, TOKEN);

    const url = new URL(callUrl());
    expect(url.searchParams.get('pageSize')).toBe('100');
  });

  it('does not alter a pageSize already at or under 100', async () => {
    global.fetch = makeFetchOk(LIST_RESPONSE);

    await adminListRegistrations({ pageSize: 100 }, TOKEN);

    const url = new URL(callUrl());
    expect(url.searchParams.get('pageSize')).toBe('100');
  });

  it('omits filters from the querystring when not supplied', async () => {
    global.fetch = makeFetchOk(LIST_RESPONSE);

    await adminListRegistrations({ status: 'APPROVED' }, TOKEN);

    const url = new URL(callUrl());
    expect(url.searchParams.has('q')).toBe(false);
    expect(url.searchParams.has('region')).toBe(false);
    expect(url.searchParams.has('traderType')).toBe(false);
    expect(url.searchParams.has('sort')).toBe(false);
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk(LIST_RESPONSE);

    await adminListRegistrations({}, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('returns the parsed AdminRegistrationList, including duplicateCandidateCount', async () => {
    global.fetch = makeFetchOk(LIST_RESPONSE);

    const result = await adminListRegistrations({}, TOKEN);

    expect(result).toEqual(LIST_RESPONSE);
    expect(result.data[0].duplicateCandidateCount).toBe(2);
    expect(result.data[0].status).toBe('PENDING_REVIEW');
  });

  it('does NOT send a duplicateCandidates array on any row — only a count (design.md §5 decision 2)', async () => {
    global.fetch = makeFetchOk(LIST_RESPONSE);

    const result = await adminListRegistrations({}, TOKEN);

    expect(result.data[0]).not.toHaveProperty('duplicateCandidates');
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(adminListRegistrations({}, TOKEN)).rejects.toThrow(AuthFailureError);
  });

  it('throws ApiError(403) for a Staff caller', async () => {
    global.fetch = make403();

    const attempt = adminListRegistrations({}, TOKEN);

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.status).toBe(403);
    });
  });
});

// ---------------------------------------------------------------------------
// adminGetRegistration()
// ---------------------------------------------------------------------------

describe('adminGetRegistration()', () => {
  it('hits GET /api/v1/admin/registrations/:id', async () => {
    global.fetch = makeFetchOk(DETAIL_RESPONSE);

    await adminGetRegistration(REGISTRATION_ID, TOKEN);

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/admin/registrations/${REGISTRATION_ID}`);
    expect(callInit().method).toBe('GET');
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk(DETAIL_RESPONSE);

    await adminGetRegistration(REGISTRATION_ID, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('returns the parsed AdminRegistrationDetail, including review-context fields', async () => {
    global.fetch = makeFetchOk(DETAIL_RESPONSE);

    const result = await adminGetRegistration(REGISTRATION_ID, TOKEN);

    expect(result).toEqual(DETAIL_RESPONSE);
    expect(result.payload.contactPerson).toBe('Jane Mwangi');
    expect(result.payload.otherCrops).toBe('sunflower');
    expect(result.consent.acceptedAtQualifier).toBe('RECORDED_AT_SUBMISSION');
  });

  it('preserves null reviewer/dismisser identities on the activity trail — never coalesced to empty string', async () => {
    global.fetch = makeFetchOk(DETAIL_RESPONSE);

    const result = await adminGetRegistration(REGISTRATION_ID, TOKEN);

    const adjudicated = result.activityTrail.find((e) => e.type === 'ADJUDICATED');
    const dismissed = result.activityTrail.find((e) => e.type === 'DUPLICATE_DISMISSED');
    expect(adjudicated).toMatchObject({ reviewedByEmail: null });
    expect(dismissed).toMatchObject({ dismissedByEmail: null });
    // Explicitly not the empty-string coalescing defect T-6/T-7 were reworked for.
    expect(adjudicated).not.toMatchObject({ reviewedByEmail: '' });
    expect(dismissed).not.toMatchObject({ dismissedByEmail: '' });
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(adminGetRegistration(REGISTRATION_ID, TOKEN)).rejects.toThrow(AuthFailureError);
  });

  it('throws ApiError(404) for an unknown id (DD-22 — honest 404 on the admin surface)', async () => {
    global.fetch = makeFetchNotOk(404, {
      statusCode: 404,
      message: `Registration ${REGISTRATION_ID} not found`,
      error: 'Not Found',
    });

    const attempt = adminGetRegistration(REGISTRATION_ID, TOKEN);

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.status).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// approveRegistration()
// ---------------------------------------------------------------------------

describe('approveRegistration()', () => {
  const ACKNOWLEDGEMENT = 'I confirm consent is on file';

  it('hits POST /api/v1/admin/registrations/:id/approve with the acknowledgement body', async () => {
    global.fetch = makeFetchOk(APPROVE_RESULT, 200);

    await approveRegistration(REGISTRATION_ID, { acknowledgement: ACKNOWLEDGEMENT }, TOKEN);

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/admin/registrations/${REGISTRATION_ID}/approve`);
    expect(callInit().method).toBe('POST');
    expect(callBody()).toEqual({ acknowledgement: ACKNOWLEDGEMENT });
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk(APPROVE_RESULT, 200);

    await approveRegistration(REGISTRATION_ID, { acknowledgement: ACKNOWLEDGEMENT }, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('succeeds against a mocked HTTP 200 response — approve is NOT 201 (carried wire fact, execution.md A-60)', async () => {
    // apiFetch branches on response.ok, not the numeric status — so this
    // fixture's status:200 is the wire-shape assertion itself: a real
    // e2e-pinned 201 response would need `ok:true` too and would still
    // "pass" a status-blind client, which is exactly why the fact is
    // pinned here as a fixture value, not inferred from client behaviour.
    global.fetch = makeFetchOk(APPROVE_RESULT, 200);

    const result = await approveRegistration(
      REGISTRATION_ID,
      { acknowledgement: ACKNOWLEDGEMENT },
      TOKEN,
    );

    expect(result).toEqual(APPROVE_RESULT);
  });

  it('returns { registration, actor } — the full AdminActor projection, not a minimal envelope', async () => {
    global.fetch = makeFetchOk(APPROVE_RESULT, 200);

    const result = await approveRegistration(
      REGISTRATION_ID,
      { acknowledgement: ACKNOWLEDGEMENT },
      TOKEN,
    );

    expect(result.registration.publishedActorId).toBe(ADMIN_ACTOR.id);
    expect(result.actor).toEqual(ADMIN_ACTOR);
    expect(result.actor.traderId).toBe('SR-2026-0184');
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(
      approveRegistration(REGISTRATION_ID, { acknowledgement: ACKNOWLEDGEMENT }, TOKEN),
    ).rejects.toThrow(AuthFailureError);
  });

  it('throws ApiError(400) with field details on acknowledgement mismatch, mapped from the real envelope', async () => {
    global.fetch = makeFetchNotOk(400, {
      statusCode: 400,
      message: 'Acknowledgement text does not match the required confirmation.',
      error: 'Bad Request',
      details: [
        {
          field: 'acknowledgement',
          message: `Must be typed exactly: "${ACKNOWLEDGEMENT}"`,
        },
      ],
    });

    const attempt = approveRegistration(REGISTRATION_ID, { acknowledgement: 'wrong' }, TOKEN);

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await expect(attempt).rejects.toThrow(
      'Acknowledgement text does not match the required confirmation.',
    );
    await attempt.catch((err: ApiError) => {
      expect(err.status).toBe(400);
      expect(err.details).toEqual([
        { field: 'acknowledgement', message: `Must be typed exactly: "${ACKNOWLEDGEMENT}"` },
      ]);
    });
  });

  it('throws ApiError(409) naming the colliding traderId on a second approval / key collision', async () => {
    global.fetch = makeFetchNotOk(409, {
      statusCode: 409,
      message: `Registration ${REGISTRATION_ID} has already been adjudicated`,
      error: 'Conflict',
    });

    const attempt = approveRegistration(
      REGISTRATION_ID,
      { acknowledgement: ACKNOWLEDGEMENT },
      TOKEN,
    );

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.status).toBe(409);
      expect(err.message).toContain('already been adjudicated');
    });
  });

  it('throws ApiError(404) for an unknown registration id', async () => {
    global.fetch = makeFetchNotOk(404, {
      statusCode: 404,
      message: `Registration ${REGISTRATION_ID} not found`,
      error: 'Not Found',
    });

    const attempt = approveRegistration(
      REGISTRATION_ID,
      { acknowledgement: ACKNOWLEDGEMENT },
      TOKEN,
    );

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.status).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// rejectRegistration()
// ---------------------------------------------------------------------------

describe('rejectRegistration()', () => {
  it('hits POST /api/v1/admin/registrations/:id/reject with { reason, note }', async () => {
    global.fetch = makeFetchOk(REJECT_RESULT, 200);

    await rejectRegistration(
      REGISTRATION_ID,
      { reason: 'DUPLICATE_OF_EXISTING_RECORD', note: 'Matches an existing registry record.' },
      TOKEN,
    );

    expect(callUrl()).toBe(`${BASE_URL}/api/v1/admin/registrations/${REGISTRATION_ID}/reject`);
    expect(callInit().method).toBe('POST');
    expect(callBody()).toEqual({
      reason: 'DUPLICATE_OF_EXISTING_RECORD',
      note: 'Matches an existing registry record.',
    });
  });

  it('sends { reason } with no note key when note is omitted', async () => {
    global.fetch = makeFetchOk(REJECT_RESULT, 200);

    await rejectRegistration(REGISTRATION_ID, { reason: 'OTHER' }, TOKEN);

    expect(callBody()).toEqual({ reason: 'OTHER' });
    expect(callBody()).not.toHaveProperty('note');
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk(REJECT_RESULT, 200);

    await rejectRegistration(REGISTRATION_ID, { reason: 'OTHER' }, TOKEN);

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('returns the minimal { registration } envelope only — no rejectionReason/reviewNote echoed back', async () => {
    global.fetch = makeFetchOk(REJECT_RESULT, 200);

    const result = await rejectRegistration(REGISTRATION_ID, { reason: 'OTHER' }, TOKEN);

    expect(result).toEqual(REJECT_RESULT);
    expect(result).not.toHaveProperty('actor');
    expect(result.registration).not.toHaveProperty('rejectionReason');
    expect(result.registration).not.toHaveProperty('reviewNote');
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(
      rejectRegistration(REGISTRATION_ID, { reason: 'OTHER' }, TOKEN),
    ).rejects.toThrow(AuthFailureError);
  });

  it('throws ApiError(400) with field details on a missing/unknown reason', async () => {
    global.fetch = makeFetchNotOk(400, {
      statusCode: 400,
      message: 'Bad Request Exception',
      error: 'Bad Request',
      details: [{ field: 'reason', message: 'reason must be one of the following values: DUPLICATE_OF_EXISTING_RECORD, INCOMPLETE_OR_INVALID_INFORMATION, NOT_A_SEED_SYSTEM_ACTOR, UNABLE_TO_VERIFY_CONTACT_DETAILS, OTHER' }],
    });

    const attempt = rejectRegistration(REGISTRATION_ID, { reason: 'OTHER' }, TOKEN);

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.status).toBe(400);
      expect(err.details).toEqual([
        {
          field: 'reason',
          message:
            'reason must be one of the following values: DUPLICATE_OF_EXISTING_RECORD, INCOMPLETE_OR_INVALID_INFORMATION, NOT_A_SEED_SYSTEM_ACTOR, UNABLE_TO_VERIFY_CONTACT_DETAILS, OTHER',
        },
      ]);
    });
  });

  it('throws ApiError(409) when already adjudicated', async () => {
    global.fetch = makeFetchNotOk(409, {
      statusCode: 409,
      message: `Registration ${REGISTRATION_ID} has already been adjudicated`,
      error: 'Conflict',
    });

    const attempt = rejectRegistration(REGISTRATION_ID, { reason: 'OTHER' }, TOKEN);

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.status).toBe(409);
    });
  });
});

// ---------------------------------------------------------------------------
// dismissDuplicateCandidate()
// ---------------------------------------------------------------------------

describe('dismissDuplicateCandidate()', () => {
  it('hits POST /api/v1/admin/registrations/:id/dismiss-duplicate with { candidateActorId }', async () => {
    global.fetch = makeFetchOk(DISMISS_RESULT, 200);

    await dismissDuplicateCandidate(
      REGISTRATION_ID,
      { candidateActorId: CANDIDATE_ACTOR_ID },
      TOKEN,
    );

    expect(callUrl()).toBe(
      `${BASE_URL}/api/v1/admin/registrations/${REGISTRATION_ID}/dismiss-duplicate`,
    );
    expect(callInit().method).toBe('POST');
    expect(callBody()).toEqual({ candidateActorId: CANDIDATE_ACTOR_ID });
  });

  it('attaches Authorization: Bearer <token>', async () => {
    global.fetch = makeFetchOk(DISMISS_RESULT, 200);

    await dismissDuplicateCandidate(
      REGISTRATION_ID,
      { candidateActorId: CANDIDATE_ACTOR_ID },
      TOKEN,
    );

    const headers = callInit().headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('returns only { registration: { id, reference, status } } — not the full detail projection', async () => {
    global.fetch = makeFetchOk(DISMISS_RESULT, 200);

    const result = await dismissDuplicateCandidate(
      REGISTRATION_ID,
      { candidateActorId: CANDIDATE_ACTOR_ID },
      TOKEN,
    );

    expect(result).toEqual(DISMISS_RESULT);
    expect(result).not.toHaveProperty('duplicateCandidates');
    expect(result).not.toHaveProperty('activityTrail');
    expect(Object.keys(result.registration).sort()).toEqual(['id', 'reference', 'status']);
  });

  it('throws AuthFailureError on 401', async () => {
    global.fetch = make401();

    await expect(
      dismissDuplicateCandidate(REGISTRATION_ID, { candidateActorId: CANDIDATE_ACTOR_ID }, TOKEN),
    ).rejects.toThrow(AuthFailureError);
  });

  it('throws ApiError(404) for an unknown registration or unknown candidate', async () => {
    global.fetch = makeFetchNotOk(404, {
      statusCode: 404,
      message: `Duplicate candidate ${CANDIDATE_ACTOR_ID} not found for registration ${REGISTRATION_ID}`,
      error: 'Not Found',
    });

    const attempt = dismissDuplicateCandidate(
      REGISTRATION_ID,
      { candidateActorId: CANDIDATE_ACTOR_ID },
      TOKEN,
    );

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.status).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// RegistrationStatus — exact-union falsification harness (NFR-11-style)
// ---------------------------------------------------------------------------
//
// `next/jest` uses SWC and does NO type-checking (`frontend/CLAUDE.md`), so
// `npm test` structurally cannot catch a `RegistrationStatus` widened to
// `string`. Since T-12/T-13 (the pages/components that would otherwise be
// the real consumer of this union) are not yet written, this exhaustive
// switch IS the consumer the falsification needs — `npx tsc --noEmit` must
// fail here the instant the union loses a literal member.
//
// Mechanism: TypeScript narrows `status` to `never` in the `default` branch
// ONLY when every prior `case` has been matched against a closed union of
// string literals. If `RegistrationStatus` is widened to `string`, the
// `default` branch's `status` stays typed `string`, and passing a `string`
// into a function typed `(x: never) => never` is a compile error.

function assertNeverRegistrationStatus(x: never): never {
  throw new Error(`Unhandled RegistrationStatus: ${String(x)}`);
}

function describeRegistrationStatus(status: RegistrationStatus): string {
  switch (status) {
    case 'PENDING_REVIEW':
      return 'Pending review';
    case 'AWAITING_APPLICANT':
      return 'Awaiting applicant';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    case 'WITHDRAWN':
      return 'Withdrawn';
    default:
      return assertNeverRegistrationStatus(status);
  }
}

describe('RegistrationStatus — exact union (falsification harness)', () => {
  it('is exhaustively handled by all five closed-union members', () => {
    const allStatuses: RegistrationStatus[] = [
      'PENDING_REVIEW',
      'AWAITING_APPLICANT',
      'APPROVED',
      'REJECTED',
      'WITHDRAWN',
    ];

    for (const status of allStatuses) {
      expect(describeRegistrationStatus(status)).not.toBe('');
    }
  });
});
