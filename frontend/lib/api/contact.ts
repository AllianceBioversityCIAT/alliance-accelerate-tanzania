/**
 * Contact API client — T-9 (FR-2, FR-5, NFR-7, design.md §3, §5.1).
 *
 * One typed caller, `submitContact()`, for `POST /api/v1/contact`
 * (`backend/src/contact/contact.controller.ts`). The endpoint returns a bare
 * `202 Accepted` with an EMPTY body on both a genuinely accepted submission
 * and a filled honeypot (design.md §4.4) — `apiFetch` always calls
 * `response.json()` on its success path unless told otherwise, so this call
 * passes `expectEmpty: true`. Omitting that flag would make a *successful*
 * `202` throw a body-parse error, which would then render through the exact
 * generic-failure path this form uses for a REAL failure — the success case
 * would look indistinguishable from an error to the visitor.
 *
 * This is a public, unauthenticated call — `token` is omitted, mirroring
 * `lib/api/registrations.ts`'s public write calls.
 *
 * Error handling is entirely `ContactForm`'s: this function does not catch,
 * classify, or narrow anything — it lets `apiFetch`'s `ApiError` (or a raw
 * network-rejection `Error`) propagate so the component can apply FR-5's
 * `details[]`-partitioned rule. See `ContactForm.tsx`'s file header for why
 * `ApiError.message` (`HTTP <status> <statusText>` on a non-JSON body) must
 * never reach the DOM.
 */

import { apiFetch } from './client';

/**
 * Transcribed verbatim from `backend/src/contact/contact-categories.ts`
 * (`CONTACT_CATEGORIES`), which is itself transcribed verbatim from
 * `requirements.md` FR-2's "Category is chosen from a fixed set" scenario —
 * that scenario names itself authoritative. FR-2 requires the set to NOT
 * vary by category and to NOT be read from a database table or remote
 * configuration, so this stays an in-repo literal, never fetched.
 */
export const CONTACT_CATEGORIES = [
  'General inquiry',
  'Join the registry',
  'Update or correct actor information',
  'Privacy or consent request',
  'Technical support',
  'Partnership or collaboration',
  'Feedback or suggestion',
  'Other',
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

/**
 * Mirrors `backend/src/contact/dto/contact-create.dto.ts` EXACTLY —
 * `frontend/CLAUDE.md`'s "types mirror backend contracts exactly" rule.
 * `website` is the honeypot (FR-8): optional, no length cap, present only so
 * a filled value has somewhere to travel.
 */
export interface ContactSubmission {
  name: string;
  email: string;
  organization?: string;
  category: ContactCategory;
  subject: string;
  message: string;
  privacyAcknowledged: boolean;
  website?: string;
}

/**
 * `POST /api/v1/contact`. Resolves with no value on `202` (success OR a
 * silently-absorbed honeypot fill — the response is defined to be
 * indistinguishable, design.md §4.4). Throws `ApiError` on `400`/`429`/`502`
 * (and any other non-2xx `ContactController` can produce), or the raw
 * `fetch` rejection on a network failure. Callers must not inspect
 * `ApiError.message` for display — see this module's file header.
 */
export async function submitContact(payload: ContactSubmission): Promise<void> {
  await apiFetch<void>('/api/v1/contact', {
    method: 'POST',
    body: payload,
    expectEmpty: true,
  });
}
