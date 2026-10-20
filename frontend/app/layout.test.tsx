jest.mock('next/font/google', () => ({
  Inter: () => ({ variable: 'inter' }),
  Montserrat: () => ({ variable: 'montserrat' }),
}));
jest.mock('@/lib/auth/SessionProvider', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { metadata } from './layout';

describe('root layout metadata', () => {
  it('names the product the PABRA Seed Actors Registry', () => {
    expect(metadata.title).toBe('PABRA Seed Actors Registry');
    expect(metadata.description).toMatch(/across Africa/i);
    expect(metadata.description).not.toMatch(/tanzania|accelerate/i);
  });
});
