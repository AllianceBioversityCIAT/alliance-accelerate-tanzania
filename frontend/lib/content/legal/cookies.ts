/**
 * cookies.ts — the Cookie Notice content module for `/cookies` (T-3, FR-3,
 * design.md §5.1). Authored by engineering, not Legal: this is the
 * factual inventory of what this site's cookies actually do today,
 * verified against the tree (requirements.md NFR-4, 2026-09-15) — not the
 * prospective legal commitment that lives on `/privacy` (D-4).
 *
 * NFR-4's audit found the ONLY cookies this site sets are GA4's ("_ga",
 * "_ga_*"), set only after consent. The visitor's consent choice and, for
 * administrators, the Cognito session tokens both live in `localStorage`,
 * and the backend emits no `Set-Cookie` on any route. FR-3's negative
 * scenario requires this document NOT claim cookies are used for
 * session/administrator authentication, fraud or unauthorized-access
 * detection, performance/reliability, or troubleshooting/maintenance —
 * this module satisfies that by never mentioning those purposes at all
 * (verified by cookies-a11y.test.tsx's keyword-absence assertions), since
 * a disclaiming sentence would itself contain the forbidden words.
 *
 * ⚠️ ADR-011 records that UNDERSTATING the geographic granularity of
 * GA4's IP-derived signal was a real defect caught in review. The
 * "What information is collected" section states country, region AND
 * city level explicitly — do not soften it to just "region" or "country".
 */

import type { LegalDocument } from './types';

/**
 * Exported so `app/(public)/cookies/page.tsx` can target the slot at the
 * exact section `ConsentChoiceControl` must render inside (design.md
 * §5.3) without re-typing the literal in two places.
 */
export const CHANGING_YOUR_CHOICE_HEADING = 'Changing your choice';

export const COOKIE_NOTICE: LegalDocument = {
  title: 'Cookie Notice',
  version: 'v1.0',
  effectiveDate: '15 September 2026',
  lede:
    'This notice describes the cookies this site actually sets today, not a general or ' +
    'prospective statement of what a site like this might use cookies for.',
  sections: [
    {
      heading: 'What cookies this site sets',
      paragraphs: [
        'If you consent, this site uses Google Analytics to understand how the registry is ' +
          'used. Google Analytics sets cookies in your browser ("_ga" and "_ga_*"). Once you ' +
          'consent, the information those cookies collect is sent to Google, which provides the ' +
          'analytics service on our behalf. Google is the only third party that receives it.',
      ],
    },
    {
      heading: 'What information is collected',
      paragraphs: ['Once you consent, four kinds of information are collected:'],
      bullets: [
        'Page views: which pages of the registry you visit.',
        'Sessions: how many separate visits occur.',
        'Your approximate geographic origin at country, region, and city level, derived from ' +
          'your IP address (Google Analytics’ default reporting).',
        'Your device and browser category: for example, desktop or mobile, and browser type.',
      ],
    },
    {
      heading: 'Before you consent',
      paragraphs: [
        'No analytics cookie is set before you consent, never before. The Google Analytics ' +
          'script itself does not load until you accept.',
      ],
    },
    {
      heading: CHANGING_YOUR_CHOICE_HEADING,
      paragraphs: [
        'You can change this choice at any time, for this browser, using the control below.',
        'Accepting takes effect immediately. Rejecting takes effect from your next page load, ' +
          'not immediately on the page you are currently viewing. Analytics already loaded ' +
          'keeps running for the rest of this visit, including as you move between pages, and ' +
          'stops the next time you load the site.',
      ],
    },
    {
      heading: 'Cookies already set',
      paragraphs: [
        'Changing your choice does not remove any analytics cookies already set in this browser. ' +
          'This site does not delete cookies itself. To remove cookies already set, clear them ' +
          'in your browser’s own settings.',
      ],
    },
    {
      heading: 'What this notice covers',
      paragraphs: [
        'The Google Analytics cookies described above are the only cookies this site sets. Your ' +
          'consent choice, and for administrators your Cognito sign-in tokens, are stored in ' +
          'this browser’s local storage rather than in a cookie, and no response from this ' +
          'site’s backend sets a cookie of any kind.',
      ],
    },
  ],
};
