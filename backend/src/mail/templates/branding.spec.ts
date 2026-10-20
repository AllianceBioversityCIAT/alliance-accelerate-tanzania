import { buildAdminResetMessage } from './admin-reset.template';
import { buildApprovalMessage } from './approval.template';
import { buildConsentRequestMessage } from './consent-request.template';
import { buildContactMessage } from './contact.template';
import { buildInvitationMessage } from './invitation.template';
import { buildNewRegistrationMessage } from './new-registration.template';
import { buildReceiptMessage } from './receipt.template';
import { buildRejectionMessage } from './rejection.template';
import { buildVerificationCodeMessage } from './verification-code.template';

describe('email branding (PABRA Seed Actors Registry)', () => {
  const original = process.env.PUBLIC_APP_BASE_URL;
  beforeEach(() => {
    process.env.PUBLIC_APP_BASE_URL = 'https://registry.example.org';
  });
  afterAll(() => {
    if (original === undefined) delete process.env.PUBLIC_APP_BASE_URL;
    else process.env.PUBLIC_APP_BASE_URL = original;
  });

  const messages = () => ({
    adminReset: buildAdminResetMessage('a@x.org', 'Temp-Pass-1', 'ref'),
    approval: buildApprovalMessage('a@x.org', 'REG-2026-0001'),
    consentRequest: buildConsentRequestMessage('a@x.org', 'Acme Seeds', 'token'),
    contact: buildContactMessage('a@x.org', {
      name: 'N',
      email: 'n@x.org',
      category: 'general',
      subject: 'S',
      message: 'M',
    }),
    invitation: buildInvitationMessage('a@x.org', 'Temp-Pass-1', 'ref'),
    newRegistration: buildNewRegistrationMessage(['a@x.org'], {
      reference: 'REG-2026-0001',
      traderName: 'Acme Seeds',
      traderType: 'seed_company',
      country: 'KE',
      region: 'Nakuru',
    }),
    receipt: buildReceiptMessage('a@x.org', 'REG-2026-0001'),
    rejection: buildRejectionMessage('a@x.org', 'REG-2026-0001'),
    verificationCode: buildVerificationCodeMessage('a@x.org', '123456'),
  });

  it.each(Object.entries(messages()))('%s names the PABRA Seed Actors Registry and never ACCELERATE', (_name, msg) => {
    const all = `${msg.subject}\n${msg.text}\n${msg.html}`;
    expect(all).not.toMatch(/ACCELERATE|(?<!Actors )Seed Registry/i);
    expect(msg.html).toContain('>PABRA</span>');
  });
});
