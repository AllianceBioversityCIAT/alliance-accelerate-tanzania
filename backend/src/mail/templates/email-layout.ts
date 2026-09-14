// @sdd-spec enhancement/html-email-templates
/**
 * Shared HTML shell for every outbound message.
 *
 * Email HTML is not web HTML: tables for layout, inline styles only, no flex
 * or grid, and Outlook renders through Word. The block types below are the
 * only shapes any template needs, so no template hand-writes markup.
 *
 * Two deliberate constraints:
 *
 * 1. **No remote images, including the logo.** Most clients block them by
 *    default, so an image-led header renders as a broken box on first open —
 *    and a remote fetch from a mail client is indistinguishable from a
 *    tracking pixel. The wordmark is set as type.
 * 2. **`text` stays the source of truth.** Every builder keeps its plain-text
 *    body: it is the multipart/alternative fallback, it is what screen
 *    readers and text-only clients get, and a text part materially helps
 *    deliverability. The HTML is additive.
 *
 * Values interpolated into HTML MUST go through `escapeHtml`. The contact
 * template carries visitor-supplied name, organisation, subject and message
 * (`ContactSubmissionData`), which are harmless in text and an injection
 * vector in HTML. The block builders escape their own inputs so a caller
 * cannot forget.
 */

const PALETTE = {
  ink: '#2A2724',
  muted: '#6B6459',
  border: '#E6DFD5',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F0EA',
  primary: '#1F4E8C',
  warning: '#8F5E10',
  warningWash: '#FAF3E8',
} as const;

/**
 * Dark mode. Declaring `color-scheme: light dark` plus a
 * `prefers-color-scheme: dark` block is what makes Apple Mail and Outlook use
 * OUR dark palette instead of running their own blanket inversion — which is
 * what happened before this: the client inverted the design and the callout
 * lost the fill that gave it its emphasis, leaving only a border.
 *
 * `!important` is required: inline styles are the light default and would
 * otherwise win. Clients that strip `<style>` simply stay light, which is a
 * correct outcome rather than a broken one. Clients that invert regardless —
 * the Gmail app among them — are not controllable from here.
 */
const DARK = {
  ground: '#1C1A18',
  card: '#262320',
  band: '#2E2A26',
  ink: '#EFEAE2',
  muted: '#A79E91',
  border: '#3B3733',
  /** Kept visibly lighter than `card`, so the callout still reads as filled. */
  fill: '#332F2A',
  primary: '#8FB4E4',
  warning: '#D9A24A',
  warningWash: '#332A1C',
} as const;

const DARK_STYLES =
  `<style>@media (prefers-color-scheme: dark){` +
  `.em-body{background:${DARK.ground}!important}` +
  `.em-ground{background:${DARK.ground}!important}` +
  `.em-card{background:${DARK.card}!important;border-color:${DARK.border}!important}` +
  `.em-band{background:${DARK.band}!important;border-color:${DARK.border}!important}` +
  `.em-ink{color:${DARK.ink}!important}` +
  `.em-muted{color:${DARK.muted}!important}` +
  `.em-brand{color:${DARK.primary}!important}` +
  `.em-fill{background:${DARK.fill}!important;border-color:${DARK.border}!important}` +
  `.em-rule{border-color:${DARK.border}!important}` +
  `.em-warn{background:${DARK.warningWash}!important;border-color:${DARK.warning}!important}` +
  `.em-warn-label{color:${DARK.warning}!important}` +
  `.em-btn{background:${DARK.primary}!important}` +
  `.em-btn a{color:${DARK.ground}!important}` +
  `}</style>`;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Escapes the five characters that can break out of HTML text or an attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type EmailBlock =
  | { kind: 'paragraph'; text: string }
  /** One value the reader must copy or keep — a code or a reference. */
  | { kind: 'callout'; label: string; value: string; caption?: string }
  | { kind: 'link'; label: string; href: string }
  | { kind: 'fields'; rows: Array<{ label: string; value: string }> }
  /** Verbatim multi-line text, e.g. a contact-form message. */
  | { kind: 'quote'; text: string }
  /** Quieter closing line. */
  | { kind: 'note'; text: string }
  /** A caution the reader must not skim past. */
  | { kind: 'warning'; text: string };

function paragraph(text: string): string {
  return `<p class="em-ink" style="margin:0 0 16px;font:400 16px/1.6 ${FONT};color:${PALETTE.ink};">${escapeHtml(text)}</p>`;
}

function callout(label: string, value: string, caption?: string): string {
  const cap = caption
    ? `<div class="em-muted" style="margin-top:10px;font:400 13px/1.5 ${FONT};color:${PALETTE.muted};">${escapeHtml(caption)}</div>`
    : '';
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">` +
    `<tr><td align="center" class="em-fill" style="padding:20px 16px;background:${PALETTE.surfaceAlt};border:1px solid ${PALETTE.border};border-radius:6px;">` +
    `<div class="em-muted" style="font:600 11px/1 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${PALETTE.muted};">${escapeHtml(label)}</div>` +
    `<div class="em-ink" style="margin-top:10px;font:700 30px/1.1 ${FONT};letter-spacing:.12em;color:${PALETTE.ink};">${escapeHtml(value)}</div>` +
    cap +
    `</td></tr></table>`
  );
}

function link(label: string, href: string): string {
  // The href is printed as text as well: many clients strip or rewrite links,
  // and a reader who cannot click still needs the address.
  const safe = escapeHtml(href);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">` +
    `<tr><td class="em-btn" style="background:${PALETTE.primary};border-radius:6px;">` +
    `<a href="${safe}" style="display:inline-block;padding:12px 22px;font:600 15px/1 ${FONT};color:#FFFFFF;text-decoration:none;">${escapeHtml(label)}</a>` +
    `</td></tr></table>` +
    `<p class="em-muted" style="margin:0 0 16px;font:400 13px/1.5 ${FONT};color:${PALETTE.muted};word-break:break-all;">${safe}</p>`
  );
}

function fields(rows: Array<{ label: string; value: string }>): string {
  const cells = rows
    .map(
      (r) =>
        `<tr>` +
        `<td class="em-muted" style="padding:8px 12px 8px 0;font:600 13px/1.5 ${FONT};color:${PALETTE.muted};white-space:nowrap;vertical-align:top;">${escapeHtml(r.label)}</td>` +
        `<td class="em-ink" style="padding:8px 0;font:400 15px/1.5 ${FONT};color:${PALETTE.ink};">${escapeHtml(r.value)}</td>` +
        `</tr>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="em-rule" style="margin:0 0 20px;border-top:1px solid ${PALETTE.border};">${cells}</table>`;
}

function quote(text: string): string {
  const body = escapeHtml(text).replace(/\r?\n/g, '<br />');
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">` +
    `<tr><td class="em-fill" style="padding:16px;background:${PALETTE.surfaceAlt};border-left:3px solid ${PALETTE.primary};">` +
    `<div class="em-ink" style="font:400 15px/1.65 ${FONT};color:${PALETTE.ink};">${body}</div>` +
    `</td></tr></table>`
  );
}

function warning(text: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">` +
    `<tr><td class="em-warn" style="padding:14px 16px;background:${PALETTE.warningWash};border:1px solid ${PALETTE.warning};border-radius:6px;">` +
    `<div class="em-warn-label" style="font:600 11px/1 ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${PALETTE.warning};">Unverified sender</div>` +
    `<div class="em-ink" style="margin-top:8px;font:400 14px/1.6 ${FONT};color:${PALETTE.ink};">${escapeHtml(text)}</div>` +
    `</td></tr></table>`
  );
}

function note(text: string): string {
  return `<p class="em-muted" style="margin:0 0 12px;font:400 14px/1.6 ${FONT};color:${PALETTE.muted};">${escapeHtml(text)}</p>`;
}

function renderBlock(block: EmailBlock): string {
  switch (block.kind) {
    case 'paragraph': return paragraph(block.text);
    case 'callout':   return callout(block.label, block.value, block.caption);
    case 'link':      return link(block.label, block.href);
    case 'fields':    return fields(block.rows);
    case 'quote':     return quote(block.text);
    case 'note':      return note(block.text);
    case 'warning':   return warning(block.text);
  }
}

export interface EmailLayoutInput {
  /** Inbox preview line. Shown by most clients next to the subject. */
  preheader: string;
  heading: string;
  blocks: EmailBlock[];
}

export function renderEmailHtml({ preheader, heading, blocks }: EmailLayoutInput): string {
  const body = blocks.map(renderBlock).join('');
  return (
    `<!DOCTYPE html>` +
    `<html lang="en"><head>` +
    `<meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width,initial-scale=1" />` +
    // Tells clients the design is light-only, which stops several of them
    // auto-inverting it into unreadable combinations.
    `<meta name="color-scheme" content="light dark" />` +
    `<meta name="supported-color-schemes" content="light dark" />` +
    DARK_STYLES +
    `<title>${escapeHtml(heading)}</title>` +
    `</head>` +
    `<body class="em-body" style="margin:0;padding:0;background:${PALETTE.surfaceAlt};-webkit-text-size-adjust:100%;">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="em-ground" style="background:${PALETTE.surfaceAlt};">` +
    `<tr><td align="center" style="padding:28px 12px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="em-card" style="width:100%;max-width:600px;background:${PALETTE.surface};border:1px solid ${PALETTE.border};border-radius:8px;">` +
    // Wordmark as type, not an image — see the file header.
    `<tr><td class="em-rule" style="padding:22px 28px;border-bottom:1px solid ${PALETTE.border};">` +
    `<span class="em-brand" style="font:700 19px/1 ${FONT};letter-spacing:.02em;color:${PALETTE.primary};">ACCELERATE</span>` +
    `<span class="em-muted" style="font:400 12px/1 ${FONT};color:${PALETTE.muted};"> &nbsp;|&nbsp; Tanzania Seed Registry</span>` +
    `</td></tr>` +
    `<tr><td style="padding:28px;">` +
    `<h1 class="em-ink" style="margin:0 0 18px;font:700 22px/1.3 ${FONT};color:${PALETTE.ink};">${escapeHtml(heading)}</h1>` +
    body +
    `</td></tr>` +
    `<tr><td class="em-band" style="padding:18px 28px;border-top:1px solid ${PALETTE.border};background:${PALETTE.surfaceAlt};border-radius:0 0 8px 8px;">` +
    `<p class="em-muted" style="margin:0;font:400 12px/1.6 ${FONT};color:${PALETTE.muted};">` +
    `ACCELERATE Tanzania Seed Registry — a seed-system registry for institutional partners and agribusinesses. Data governed under participant consent.` +
    `</p></td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}
