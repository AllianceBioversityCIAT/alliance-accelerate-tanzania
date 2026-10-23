import { buildRejectionMessage } from './rejection.template';

// ATP-99 (QA PBR-15): the rejection email carries the reviewer's note when
// one was left; without one it still points to the status lookup.
describe('buildRejectionMessage', () => {
  it('includes the reviewer note in the text and the HTML, escaped', () => {
    const msg = buildRejectionMessage('a@x.org', 'REG-2026-0299', 'Use your <company> email.');

    expect(msg.text).toContain('Note from the reviewer:\nUse your <company> email.');
    expect(msg.html).toContain('Use your &lt;company&gt; email.');
    expect(msg.html).not.toContain('<company>');
  });

  it('without a note, says nothing about one and keeps pointing to the lookup', () => {
    const msg = buildRejectionMessage('a@x.org', 'REG-2026-0299');

    expect(msg.text).not.toContain('Note from the reviewer');
    expect(msg.html).not.toContain('Note from the reviewer');
    expect(msg.text).toContain("to see the reviewer's note if one was left");
  });
});
