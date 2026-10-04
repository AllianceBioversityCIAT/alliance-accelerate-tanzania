// @sdd-spec actors/consent-intake/intake-required-fields (T-3)
/**
 * Admin-intake duplicate gate (FR-3, FR-4; design.md §4.3, DD-3, DD-4).
 *
 * Reuses `duplicate-detection.service.ts`'s pure matching functions —
 * normalizers + `computeMatchedOn`, exported there for exactly this reuse —
 * never the registration queue's `DuplicateDetectionService` itself: it is
 * NOT injected into `ActorsModule` (design.md P-11), and its
 * `detectForBatch` 5-candidate-total cap (sort by match count, slice) is
 * never applied here. Classification runs its OWN strength-first ordering
 * (design.md §4.3):
 *
 * - **Strong** = `matchedOn` includes `phone` or `email` — kept UNCAPPED,
 *   because a strong match is the create GATE (FR-3) and the registration
 *   matcher's cap would otherwise drop an email-only match behind five
 *   weaker name+GPS ones (DD-3's falsifier).
 * - **Weak** = everything else, capped at {@link MAX_WEAK_CANDIDATES} —
 *   advisory only (FR-3's weak scenario never asks for confirmation).
 *
 * **One scan serves a whole batch (design.md §4.3).** `loadActorSnapshot()`
 * is the ONE `actor.findMany`; `check()` (single candidate) and
 * `checkBatch()` (N candidates, for T-5's import path) both load exactly
 * one snapshot and classify every candidate against it in memory — never
 * one scan per candidate.
 *
 * `IntakeDuplicateIndex` is the in-file matching mechanism design.md §4.5
 * calls for on import (T-5 wires it); this task builds the mechanism only —
 * which rows get added, in what order, and which are excluded (e.g. a
 * `failed` row) is the caller's decision, not this class's. Its `match()`
 * shares the exact same strength partition as `check`/`checkBatch`
 * (`partitionByStrength` + `isStrongMatch`), so T-5 never re-derives the
 * strong/weak rule.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeMatchedOn,
  DuplicateCandidate,
  DuplicateMatchAttribute,
  normalizeEmailForMatch,
  normalizePhoneForMatch,
  normalizeTraderNameForMatch,
  isWithinBoundingBox,
  toNullableNumber,
  NormalizedActorRow,
} from '../registrations/duplicate-detection.service';

/** The new actor's (or one import row's) comparison inputs, pre-validation-gate. */
export interface IntakeDuplicateCandidateInput {
  phone: string | null;
  email: string | null;
  traderName: string;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
}

/** `check()`/`checkBatch()`'s result: strength-partitioned, strong uncapped, weak capped (design.md §4.3). */
export interface IntakeDuplicateCheckResult {
  /** Every phone/email match — NEVER capped (DD-3). */
  strong: DuplicateCandidate[];
  /** Name/GPS-only matches, capped at {@link MAX_WEAK_CANDIDATES}. */
  weak: DuplicateCandidate[];
}

/** design.md §4.3 — weak candidates are capped at 5, AFTER the uncapped strong ones. */
export const MAX_WEAK_CANDIDATES = 5;

/** The normalized shape the incoming candidate is reduced to before comparison. */
interface NormalizedCandidate {
  normalizedPhone: string | null;
  normalizedEmail: string | null;
  normalizedTraderName: string;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
}

function normalizeCandidate(input: IntakeDuplicateCandidateInput): NormalizedCandidate {
  return {
    normalizedPhone: normalizePhoneForMatch(input.phone),
    normalizedEmail: normalizeEmailForMatch(input.email),
    normalizedTraderName: normalizeTraderNameForMatch(input.traderName),
    gpsLatitude: input.gpsLatitude,
    gpsLongitude: input.gpsLongitude,
  };
}

/**
 * Strong = phone or email in `matchedOn` (design.md §4.3). Never
 * `traderName` alone. Module-private: every caller goes through
 * {@link partitionByStrength}, which is the actual shared seam.
 */
function isStrongMatch(matchedOn: DuplicateMatchAttribute[]): boolean {
  return matchedOn.includes('phone') || matchedOn.includes('email');
}

/**
 * The ONE partition rule (design.md §4.3): sort by match strength (then by
 * `sortKey` for a deterministic tie-break), then split strong (uncapped)
 * from weak (capped at {@link MAX_WEAK_CANDIDATES}). `check`, `checkBatch`
 * and `IntakeDuplicateIndex.match` all call this — never re-derive the
 * strong/weak rule independently.
 */
function partitionByStrength<T extends { matchedOn: DuplicateMatchAttribute[] }>(
  all: T[],
  sortKey: (item: T) => string,
): { strong: T[]; weak: T[] } {
  const sorted = [...all].sort(
    (a, b) => b.matchedOn.length - a.matchedOn.length || sortKey(a).localeCompare(sortKey(b)),
  );
  return {
    strong: sorted.filter((c) => isStrongMatch(c.matchedOn)),
    weak: sorted.filter((c) => !isStrongMatch(c.matchedOn)).slice(0, MAX_WEAK_CANDIDATES),
  };
}

/**
 * Classify one candidate against an already-loaded actor snapshot
 * (design.md §4.3). Pure — no I/O — so `checkBatch` can call it once per
 * candidate over a SINGLE shared snapshot instead of re-scanning.
 */
function classifyAgainstSnapshot(
  candidate: IntakeDuplicateCandidateInput,
  snapshot: ReadonlyArray<NormalizedActorRow>,
): IntakeDuplicateCheckResult {
  const normalized = normalizeCandidate(candidate);

  const all: DuplicateCandidate[] = [];
  for (const actor of snapshot) {
    const matchedOn = computeMatchedOn(
      normalized.normalizedPhone,
      normalized.normalizedEmail,
      normalized.normalizedTraderName,
      { gpsLatitude: normalized.gpsLatitude, gpsLongitude: normalized.gpsLongitude },
      actor,
    );
    if (matchedOn.length > 0) {
      all.push({
        actorId: actor.id,
        traderId: actor.traderId,
        traderName: actor.traderName,
        matchedOn,
      });
    }
  }

  return partitionByStrength(all, (c) => c.actorId);
}

@Injectable()
export class IntakeDuplicateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ONE `actor.findMany` (mirrors `DuplicateDetectionService`'s own
   * one-scan discipline, P-2), normalized once. `PrismaService` is the
   * only dependency (design.md §4.3's module-wiring note, P-11). Shared by
   * `check` and `checkBatch` so a whole import batch still costs one scan.
   */
  async loadActorSnapshot(): Promise<NormalizedActorRow[]> {
    const actors = await this.prisma.actor.findMany({
      select: {
        id: true,
        traderId: true,
        traderName: true,
        phone: true,
        email: true,
        gpsLatitude: true,
        gpsLongitude: true,
      },
    });

    return actors.map((actor) => ({
      id: actor.id,
      traderId: actor.traderId,
      traderName: actor.traderName,
      normalizedPhone: normalizePhoneForMatch(actor.phone),
      normalizedEmail: normalizeEmailForMatch(actor.email),
      normalizedTraderName: normalizeTraderNameForMatch(actor.traderName),
      gpsLatitude: toNullableNumber(actor.gpsLatitude),
      gpsLongitude: toNullableNumber(actor.gpsLongitude),
    }));
  }

  /** Single-candidate check (the admin create path): one scan, then classify. */
  async check(candidate: IntakeDuplicateCandidateInput): Promise<IntakeDuplicateCheckResult> {
    const snapshot = await this.loadActorSnapshot();
    return classifyAgainstSnapshot(candidate, snapshot);
  }

  /**
   * Batch form (design.md §4.3's "reused for a whole import batch", T-5):
   * loads the snapshot ONCE and classifies every candidate against it, in
   * input order — never one `actor.findMany` per candidate.
   */
  async checkBatch(
    candidates: IntakeDuplicateCandidateInput[],
  ): Promise<IntakeDuplicateCheckResult[]> {
    const snapshot = await this.loadActorSnapshot();
    return candidates.map((candidate) => classifyAgainstSnapshot(candidate, snapshot));
  }
}

/** One in-batch match, keyed by whatever key the caller indexed the row under. */
export interface IntakeDuplicateIndexMatch {
  key: string;
  traderName: string;
  matchedOn: DuplicateMatchAttribute[];
}

/** `IntakeDuplicateIndex.match()`'s result — same shape as `IntakeDuplicateCheckResult`, keyed instead of actor-id'd. */
export interface IntakeDuplicateIndexMatchResult {
  strong: IntakeDuplicateIndexMatch[];
  weak: IntakeDuplicateIndexMatch[];
}

/**
 * In-file duplicate index (design.md §4.3, §4.5): maps-backed lookup for
 * phone/email/name, linear scan for GPS box overlap. This class only ever
 * matches a candidate against entries ALREADY `add`-ed — directionality
 * ("only later rows match earlier rows", "a failed row is never a match
 * source") is enforced by the CALLER's add order, not by this index: T-5
 * adds each row only after deciding it qualifies, strictly in row order,
 * then calls `match` for the NEXT row before adding that one too.
 */
export class IntakeDuplicateIndex {
  private readonly byPhone = new Map<string, Set<string>>();
  private readonly byEmail = new Map<string, Set<string>>();
  private readonly byTraderName = new Map<string, Set<string>>();
  private readonly entries = new Map<string, { traderName: string } & NormalizedCandidate>();

  /** Index one row's candidate shape under `key` (e.g. `row:<n>`). */
  add(key: string, input: IntakeDuplicateCandidateInput): void {
    const normalized = normalizeCandidate(input);
    this.entries.set(key, { traderName: input.traderName, ...normalized });
    addToBucket(this.byPhone, normalized.normalizedPhone, key);
    addToBucket(this.byEmail, normalized.normalizedEmail, key);
    addToBucket(this.byTraderName, normalized.normalizedTraderName || null, key);
  }

  /**
   * Match `input` against every entry added so far, partitioned strong/weak
   * through the SAME {@link partitionByStrength} rule `check`/`checkBatch`
   * use — one strong/weak definition, never a second one for the in-file
   * path.
   */
  match(input: IntakeDuplicateCandidateInput): IntakeDuplicateIndexMatchResult {
    const normalized = normalizeCandidate(input);

    const candidateKeys = new Set<string>();
    collectBucket(this.byPhone, normalized.normalizedPhone, candidateKeys);
    collectBucket(this.byEmail, normalized.normalizedEmail, candidateKeys);
    collectBucket(this.byTraderName, normalized.normalizedTraderName || null, candidateKeys);
    // GPS has no map key to bucket on — a linear scan (design.md §4.3).
    for (const [key, entry] of this.entries) {
      if (
        isWithinBoundingBox(
          normalized.gpsLatitude,
          normalized.gpsLongitude,
          entry.gpsLatitude,
          entry.gpsLongitude,
        )
      ) {
        candidateKeys.add(key);
      }
    }

    const all: IntakeDuplicateIndexMatch[] = [];
    for (const key of candidateKeys) {
      const entry = this.entries.get(key);
      if (!entry) continue;
      const matchedOn = computeMatchedOn(
        normalized.normalizedPhone,
        normalized.normalizedEmail,
        normalized.normalizedTraderName,
        { gpsLatitude: normalized.gpsLatitude, gpsLongitude: normalized.gpsLongitude },
        entry,
      );
      if (matchedOn.length > 0) {
        all.push({ key, traderName: entry.traderName, matchedOn });
      }
    }

    return partitionByStrength(all, (m) => m.key);
  }
}

function addToBucket(map: Map<string, Set<string>>, value: string | null, key: string): void {
  if (value === null || value === '') return;
  const bucket = map.get(value);
  if (bucket) {
    bucket.add(key);
  } else {
    map.set(value, new Set([key]));
  }
}

function collectBucket(
  map: Map<string, Set<string>>,
  value: string | null,
  into: Set<string>,
): void {
  if (value === null || value === '') return;
  const bucket = map.get(value);
  if (!bucket) return;
  for (const key of bucket) into.add(key);
}
