// @sdd-spec contact/contact-channels (T-4)
/**
 * T-4 — Contact form category enum and shared length constants
 * (design.md §4.1.1's field table, §4.2's constants).
 *
 * `CONTACT_CATEGORIES` is transcribed verbatim from `requirements.md` FR-2's
 * "Category is chosen from a fixed set" scenario, which that requirement
 * names as authoritative — not mirrored from `design.md`, not derived, not
 * read from any table or remote config. FR-2 is explicit that the set MUST
 * NOT vary by category and MUST NOT come from a database table or remote
 * configuration; keeping it as a literal in-repo constant is what satisfies
 * that clause, and `ContactCreateDto.category`'s `@IsIn` is what makes the
 * "reject an off-list category server-side" clause real.
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
 * Length caps (design.md §4.2's "Length caps" row). `email`'s 254 follows
 * RFC 5321 §4.5.3.1.3 (a 256-octet forward path including the angle
 * brackets, so 254 usable) — design.md §4.1.1 notes revision 5's "320"
 * figure was an unstated folk sum, not the RFC's value.
 */
export const CONTACT_NAME_MAX_LENGTH = 200;
export const CONTACT_ORGANIZATION_MAX_LENGTH = 200;
export const CONTACT_SUBJECT_MAX_LENGTH = 200;
export const CONTACT_MESSAGE_MAX_LENGTH = 4000;
export const CONTACT_EMAIL_MAX_LENGTH = 254;

/**
 * The 32 KB request-body cap (design.md §4.2's "Request body cap" row) is
 * NOT declared here. It is owned exclusively by
 * `common/payload-cap.config.ts` (`REGISTRATIONS_PAYLOAD_CAP_BYTES`, now
 * applied to both `/api/v1/registrations` and `/api/v1/contact`) so there is
 * exactly one number to drift — declaring a second, unlinked 32 KB constant
 * here would recreate the two-sources-of-truth failure that file's own
 * header warns against.
 */
