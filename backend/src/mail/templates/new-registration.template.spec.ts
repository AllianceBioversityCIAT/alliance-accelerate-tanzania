import { buildNewRegistrationMessage } from './new-registration.template';

const TO = ['admin1@example.org', 'admin2@example.org'];
const DATA = {
  reference: 'REG-2026-0042',
  traderName: 'Mbeya Seed Traders Ltd',
  traderType: 'seed_company',
  region: 'Mbeya',
};

describe('buildNewRegistrationMessage (ATP-78)', () => {
  const original = process.env.PUBLIC_APP_BASE_URL;

  beforeEach(() => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org';
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.PUBLIC_APP_BASE_URL;
    } else {
      process.env.PUBLIC_APP_BASE_URL = original;
    }
  });

  it('addresses every admin and carries the reference for the log correlator', () => {
    const msg = buildNewRegistrationMessage(TO, DATA);

    expect(msg.to).toEqual(TO);
    expect(msg.reference).toBe('REG-2026-0042');
    expect(msg.subject).toBe('New registration awaiting review — REG-2026-0042');
  });

  it('shows the organisation, a readable actor type and the region in both parts', () => {
    const msg = buildNewRegistrationMessage(TO, DATA);

    for (const part of [msg.text, msg.html as string]) {
      expect(part).toContain('Mbeya Seed Traders Ltd');
      expect(part).toContain('Seed company');
      expect(part).toContain('Mbeya');
      expect(part).toContain('REG-2026-0042');
    }
  });

  it('links the review queue from PUBLIC_APP_BASE_URL in both parts', () => {
    const msg = buildNewRegistrationMessage(TO, DATA);

    expect(msg.text).toContain('https://registry.example.org/admin/registrations/');
    expect(msg.html).toContain('https://registry.example.org/admin/registrations/');
  });

  it('refuses to build a link from an unusable base URL', () => {
    process.env.PUBLIC_APP_BASE_URL = '*';

    expect(() => buildNewRegistrationMessage(TO, DATA)).toThrow(/PUBLIC_APP_BASE_URL/);
  });

  it('escapes submitter-supplied markup in the HTML part', () => {
    const msg = buildNewRegistrationMessage(TO, {
      ...DATA,
      traderName: '<script>alert(1)</script> Traders',
    });

    expect(msg.html).not.toContain('<script>');
    expect(msg.html).toContain('&lt;script&gt;');
  });

  it('keeps a submitter-supplied line break out of the message lines', () => {
    const msg = buildNewRegistrationMessage(TO, {
      ...DATA,
      traderName: 'Mbeya Seed\r\nBcc: attacker@example.org',
    });

    expect(msg.text).toContain('Organisation: Mbeya Seed Bcc: attacker@example.org\n');
    expect(msg.subject).not.toMatch(/[\r\n]/);
  });
});
