/**
 * ConsentRichText — renders a consent-edition section body faithfully
 * (actors/consent-intake/consent-request-email T-8, FR-9).
 *
 * The edition `body` strings are plain text with two markdown-ish idioms:
 * `- ` bullet lines and `**bold**` spans (e.g. "By selecting **I accept**").
 * Both render as real elements — a `<ul>` and `<strong>` — built from React
 * nodes, never `dangerouslySetInnerHTML`. Every other line is kept verbatim
 * (`whitespace-pre-line` preserves the single line breaks in the contact
 * block); a blank line separates paragraphs.
 */

import type { ReactNode } from 'react';

const BOLD = /\*\*([^*]+)\*\*/g;

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD)) {
    const at = match.index ?? 0;
    if (at > last) nodes.push(text.slice(last, at));
    nodes.push(
      <strong key={at} className="font-semibold text-fg">
        {match[1]}
      </strong>,
    );
    last = at + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Block = { kind: 'text'; lines: string[] } | { kind: 'list'; items: string[] };

function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const line of body.split('\n')) {
    if (line.trim() === '') {
      current = null;
      continue;
    }
    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (bullet) {
      if (current?.kind === 'list') current.items.push(bullet[1]);
      else {
        current = { kind: 'list', items: [bullet[1]] };
        blocks.push(current);
      }
    } else if (current?.kind === 'text') {
      current.lines.push(line);
    } else {
      current = { kind: 'text', lines: [line] };
      blocks.push(current);
    }
  }
  return blocks;
}

export default function ConsentRichText({ body }: { body: string }) {
  return (
    <>
      {parseBlocks(body).map((block, i) =>
        block.kind === 'list' ? (
          <ul key={i} className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {block.items.map((item, j) => (
              <li key={j}>{renderInline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="mt-2 whitespace-pre-line text-sm text-muted first:mt-1">
            {renderInline(block.lines.join('\n'))}
          </p>
        ),
      )}
    </>
  );
}
