import { buildApprovalMessage } from './approval.template';

// ATP-95 (QA PBR-06): the approval email links to the organisation's public
// profile, which approval has just published.
describe('buildApprovalMessage', () => {
  const original = process.env.PUBLIC_APP_BASE_URL;
  beforeEach(() => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org';
  });
  afterAll(() => {
    if (original === undefined) delete process.env.PUBLIC_APP_BASE_URL;
    else process.env.PUBLIC_APP_BASE_URL = original;
  });

  it('links "View your listing" to the public profile of the approved actor', () => {
    const msg = buildApprovalMessage('a@x.org', 'REG-2026-0001', 'actor/1');
    const url = 'https://registry.example.org/profile?id=actor%2F1';

    expect(msg.html).toContain('>View your listing</a>');
    expect(msg.html).toContain(`href="${url}"`);
    expect(msg.text).toContain(url);
  });
});
