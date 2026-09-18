// @sdd-spec actors/public-self-registration (T-3)
import { NoOpMailTransport } from './no-op-mail.transport';

describe('NoOpMailTransport (NFR-10, design.md §4.9)', () => {
  it('resolves successfully and records the attempt without exposing to/subject/text', async () => {
    const transport = new NoOpMailTransport();

    await expect(
      transport.send({
        to: 'applicant@example.org',
        subject: 'Your ACCELERATE Tanzania verification code',
        text: 'Your verification code is 482913.',
        reference: 'REG-2026-0007',
      }),
    ).resolves.toBeUndefined();

    const recorded = transport.getRecordedSends();
    expect(recorded).toHaveLength(1);
    expect(recorded[0].reference).toBe('REG-2026-0007');
    // Only `reference` and `at` are retained — assert the recorded shape is exactly that,
    // so a future edit that starts stashing `to`/`subject`/`text` here is caught.
    expect(Object.keys(recorded[0]).sort()).toEqual(['at', 'reference']);
  });

  it('records an attempt with no reference for the pre-submission verification-code message', async () => {
    const transport = new NoOpMailTransport();

    await transport.send({ to: 'applicant@example.org', subject: 's', text: 't' });

    expect(transport.getRecordedSends()[0].reference).toBeUndefined();
  });
});
