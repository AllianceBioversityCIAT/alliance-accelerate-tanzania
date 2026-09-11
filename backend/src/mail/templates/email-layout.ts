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
  return `<p style="margin:0 0 16px;font:400 16px/1.6 ${FONT};color:${PALETTE.ink};">${escapeHtml(text)}</p>`;
}

function callout(label: string, value: string, caption?: string): string {
  const cap = caption
    ? `<div style="margin-top:10px;font:400 13px/1.5 ${FONT};color:${PALETTE.muted};">${escapeHtml(caption)}</div>`
    : '';
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">` +
    `<tr><td align="center" style="padding:20px 16px;background:${PALETTE.surfaceAlt};border:1px solid ${PALETTE.border};border-radius:6px;">` +
    `<div style="font:600 11px/1 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${PALETTE.muted};">${escapeHtml(label)}</div>` +
    `<div style="margin-top:10px;font:700 30px/1.1 ${FONT};letter-spacing:.12em;color:${PALETTE.ink};">${escapeHtml(value)}</div>` +
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
    `<tr><td style="background:${PALETTE.primary};border-radius:6px;">` +
    `<a href="${safe}" style="display:inline-block;padding:12px 22px;font:600 15px/1 ${FONT};color:#FFFFFF;text-decoration:none;">${escapeHtml(label)}</a>` +
    `</td></tr></table>` +
    `<p style="margin:0 0 16px;font:400 13px/1.5 ${FONT};color:${PALETTE.muted};word-break:break-all;">${safe}</p>`
  );
}

function fields(rows: Array<{ label: string; value: string }>): string {
  const cells = rows
    .map(
      (r) =>
        `<tr>` +
        `<td style="padding:8px 12px 8px 0;font:600 13px/1.5 ${FONT};color:${PALETTE.muted};white-space:nowrap;vertical-align:top;">${escapeHtml(r.label)}</td>` +
        `<td style="padding:8px 0;font:400 15px/1.5 ${FONT};color:${PALETTE.ink};">${escapeHtml(r.value)}</td>` +
        `</tr>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;border-top:1px solid ${PALETTE.border};">${cells}</table>`;
}

function quote(text: string): string {
  const body = escapeHtml(text).replace(/\r?\n/g, '<br />');
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">` +
    `<tr><td style="padding:16px;background:${PALETTE.surfaceAlt};border-left:3px solid ${PALETTE.primary};">` +
    `<div style="font:400 15px/1.65 ${FONT};color:${PALETTE.ink};">${body}</div>` +
    `</td></tr></table>`
  );
}

function warning(text: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">` +
    `<tr><td style="padding:14px 16px;background:${PALETTE.warningWash};border:1px solid ${PALETTE.warning};border-radius:6px;">` +
    `<div style="font:600 11px/1 ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${PALETTE.warning};">Unverified sender</div>` +
    `<div style="margin-top:8px;font:400 14px/1.6 ${FONT};color:${PALETTE.ink};">${escapeHtml(text)}</div>` +
    `</td></tr></table>`
  );
}

function note(text: string): string {
  return `<p style="margin:0 0 12px;font:400 14px/1.6 ${FONT};color:${PALETTE.muted};">${escapeHtml(text)}</p>`;
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
    `<meta name="color-scheme" content="light" />` +
    `<meta name="supported-color-schemes" content="light" />` +
    `<title>${escapeHtml(heading)}</title>` +
    `</head>` +
    `<body style="margin:0;padding:0;background:${PALETTE.surfaceAlt};-webkit-text-size-adjust:100%;">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PALETTE.surfaceAlt};">` +
    `<tr><td align="center" style="padding:28px 12px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:${PALETTE.surface};border:1px solid ${PALETTE.border};border-radius:8px;">` +
    // Wordmark as type, not an image — see the file header.
    `<tr><td style="padding:22px 28px;border-bottom:1px solid ${PALETTE.border};">` +
    `<span style="font:700 19px/1 ${FONT};letter-spacing:.02em;color:${PALETTE.primary};">ACCELERATE</span>` +
    `<span style="font:400 12px/1 ${FONT};color:${PALETTE.muted};"> &nbsp;|&nbsp; Tanzania Seed Registry</span>` +
    `</td></tr>` +
    `<tr><td style="padding:28px;">` +
    `<h1 style="margin:0 0 18px;font:700 22px/1.3 ${FONT};color:${PALETTE.ink};">${escapeHtml(heading)}</h1>` +
    body +
    `</td></tr>` +
    `<tr><td style="padding:18px 28px;border-top:1px solid ${PALETTE.border};background:${PALETTE.surfaceAlt};border-radius:0 0 8px 8px;">` +
    `<p style="margin:0;font:400 12px/1.6 ${FONT};color:${PALETTE.muted};">` +
    `ACCELERATE Tanzania Seed Registry — a seed-system registry for institutional partners and agribusinesses. Data governed under participant consent.` +
    `</p></td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}
