/**
 * Shared `PublicActorDetail` fixtures for the profile suites.
 *
 * `ProfileView.test.tsx` and `profile-a11y.test.tsx` both render the whole
 * `ProfileView` and both need the same two actor shapes. Before this module
 * each kept its own copy: `ACTOR_SPARSE` was byte-identical in the two files
 * and `ACTOR_FULL` differed only in `sex`/`otherCrops`, which was drift
 * rather than intent — the a11y suite asserts nothing about either field and
 * its own docblock already called its fixture *"full actor with all optional
 * fields"* while leaving those two null.
 *
 * Typed `PublicActorDetail`, mirroring `useActor`'s real return type
 * (`actors/public-profile-disclosure` design.md §9 DD-6) — **not**
 * `PublicActor`, which is the narrower list-path alias and carries no contact
 * block.
 *
 * Directory name matters: `frontend/jest.config`'s `testMatch` collects
 * every file under a `__tests__` directory wholesale, so a fixture module
 * placed there would be run as a test suite and fail for containing no
 * tests. `__fixtures__` matches neither `testMatch` pattern.
 */

import type { PublicActorDetail } from '@/lib/api/actors';

/**
 * Every optional field populated: district, capacity, two crops, GPS, the
 * five-field contact block (FR-1 — disclosed on the detail read for a
 * `GRANTED` actor), and both profile fields (`sex`, `otherCrops`).
 *
 * The contact-block values are the ones the backend PII fixtures use, so a
 * value leaking across the list/detail boundary is recognisable in either
 * layer's failure output.
 */
export const ACTOR_FULL: PublicActorDetail = {
  id: 'actor-full',
  traderName: 'Dodoma Seeds Ltd',
  region: 'Dodoma',
  district: 'Dodoma Urban',
  traderType: 'seed_company',
  capacityTons: 500,
  crops: ['sorghum', 'common_bean'],
  gps: { lat: -6.17, long: 35.74 },
  sex: 'Female',
  otherCrops: 'Sesame, Sunflower',
  contactPerson: 'Amina Juma',
  position: 'Director',
  phone: '+255700000000',
  email: 'director@example.com',
  marketLocation: 'Arusha Central Market',
};

/**
 * The mirror image: null district, null capacity, one crop, no GPS, and
 * **every** disclosable field absent — the five contact-block members plus
 * `sex` and `otherCrops`.
 *
 * This is FR-6's em-dash scenario, and it is the state most public profiles
 * are in on day one: an actor imported from the pre-v3 Excel template has no
 * `contactPerson` at all, and any self-registered actor may have omitted
 * every optional field. All seven rows must still render, each showing `—`.
 */
export const ACTOR_SPARSE: PublicActorDetail = {
  id: 'actor-sparse',
  traderName: 'Mbeya Cooperative',
  region: 'Mbeya',
  district: null,
  traderType: 'cooperative',
  capacityTons: null,
  crops: ['groundnut'],
  gps: null,
  sex: null,
  otherCrops: null,
  contactPerson: null,
  position: null,
  phone: null,
  email: null,
  marketLocation: null,
};
