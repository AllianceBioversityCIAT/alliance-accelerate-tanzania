// T-2 (docs/specs/auth/forgot-password-delivery, design.md DD-1a, §3 step 4).
//
// A minimal, STANDALONE mirror of backend/src/mail/templates/email-layout.ts's
// convention — same block-based shape, same "text is the source of truth,
// html is additive" discipline, same escaping discipline — but a separate
// copy, not a shared import: this package is a standalone Lambda in
// `10-data-auth` (a different deployable than the NestJS app), so it cannot
// import `renderEmailHtml` from `backend/` (DD-1a).
//
// Only the block kinds the two messages in messages.mjs actually use are
// implemented (paragraph, callout, link, note) — DD-1a's accepted cost is
// two email bodies that may drift stylistically from backend/'s, not a
// second full copy of every block kind backend/ has. If a third message is
// ever added here needing a kind this doesn't have, add it; if this file
// starts growing toward parity with backend/'s renderer, that is DD-1a's
// signal to revisit sharing a package instead of duplicating again.

/** Escapes the five characters that can break out of HTML text or an attribute. */
export function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = '#2A2724';
const MUTED = '#6B6459';
const BORDER = '#E6DFD5';
const SURFACE = '#FFFFFF';
const SURFACE_ALT = '#F4F0EA';
const PRIMARY = '#1F4E8C';

function paragraph(text) {
  return `<p style="margin:0 0 16px;font:400 16px/1.6 ${FONT};color:${INK};">${escapeHtml(text)}</p>`;
}

/** One value the reader must copy or keep — here, always the code. */
function callout(label, value, caption) {
  const cap = caption
    ? `<div style="margin-top:10px;font:400 13px/1.5 ${FONT};color:${MUTED};">${escapeHtml(caption)}</div>`
    : '';
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">` +
    `<tr><td align="center" style="padding:20px 16px;background:${SURFACE_ALT};border:1px solid ${BORDER};border-radius:6px;">` +
    `<div style="font:600 11px/1 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</div>` +
    `<div style="margin-top:10px;font:700 30px/1.1 ${FONT};letter-spacing:.12em;color:${INK};">${escapeHtml(value)}</div>` +
    cap +
    `</td></tr></table>`
  );
}

function link(label, href) {
  // Printed as visible text as well as the href: many clients strip or
  // rewrite links, and a reader who cannot click still needs the address.
  const safe = escapeHtml(href);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">` +
    `<tr><td style="background:${PRIMARY};border-radius:6px;">` +
    `<a href="${safe}" style="display:inline-block;padding:12px 22px;font:600 15px/1 ${FONT};color:#FFFFFF;text-decoration:none;">${escapeHtml(label)}</a>` +
    `</td></tr></table>` +
    `<p style="margin:0 0 16px;font:400 13px/1.5 ${FONT};color:${MUTED};word-break:break-all;">${safe}</p>`
  );
}

function note(text) {
  return `<p style="margin:0 0 12px;font:400 14px/1.6 ${FONT};color:${MUTED};">${escapeHtml(text)}</p>`;
}

function renderBlock(block) {
  switch (block.kind) {
    case 'paragraph':
      return paragraph(block.text);
    case 'callout':
      return callout(block.label, block.value, block.caption);
    case 'link':
      return link(block.label, block.href);
    case 'note':
      return note(block.text);
    default:
      throw new Error(`email-layout: unknown block kind "${block.kind}"`);
  }
}

/**
 * @param {{preheader: string, heading: string, blocks: Array}} input
 * @returns {string} A complete HTML document.
 */
export function renderEmailHtml({ preheader, heading, blocks }) {
  const body = blocks.map(renderBlock).join('');
  return (
    `<!DOCTYPE html>` +
    `<html lang="en"><head>` +
    `<meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width,initial-scale=1" />` +
    `<meta name="color-scheme" content="light" />` +
    `<meta name="supported-color-schemes" content="light" />` +
    `<title>${escapeHtml(heading)}</title>` +
    `</head>` +
    `<body style="margin:0;padding:0;background:${SURFACE_ALT};-webkit-text-size-adjust:100%;">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${SURFACE_ALT};">` +
    `<tr><td align="center" style="padding:28px 12px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:${SURFACE};border:1px solid ${BORDER};border-radius:8px;">` +
    `<tr><td style="padding:22px 28px;border-bottom:1px solid ${BORDER};">` +
    `<span style="font:700 19px/1 ${FONT};letter-spacing:.02em;color:${PRIMARY};">ACCELERATE</span>` +
    `<span style="font:400 12px/1 ${FONT};color:${MUTED};"> &nbsp;|&nbsp; Tanzania Seed Registry</span>` +
    `</td></tr>` +
    `<tr><td style="padding:28px;">` +
    `<h1 style="margin:0 0 18px;font:700 22px/1.3 ${FONT};color:${INK};">${escapeHtml(heading)}</h1>` +
    body +
    `</td></tr>` +
    `<tr><td style="padding:18px 28px;border-top:1px solid ${BORDER};background:${SURFACE_ALT};border-radius:0 0 8px 8px;">` +
    `<p style="margin:0;font:400 12px/1.6 ${FONT};color:${MUTED};">` +
    `ACCELERATE Tanzania Seed Registry — a seed-system registry for institutional partners and agribusinesses. Data governed under participant consent.` +
    `</p></td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}
