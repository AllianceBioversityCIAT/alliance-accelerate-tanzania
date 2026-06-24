import 'reflect-metadata';
import { APP_GUARD } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AppModule } from '../app.module';
import { ActorsController } from '../actors/actors.controller';

/**
 * Guards are opt-in, never global (FR-8 / ADR "Opt-in guards"). These assertions
 * are a regression fence: if someone later registers an APP_GUARD or bolts an
 * auth guard onto the public ActorsController, the public API would silently
 * lock down — so we fail the build instead.
 */
describe('Public API stays open (no global auth guard)', () => {
  it('AppModule registers NO APP_GUARD provider', () => {
    const providers: unknown[] =
      Reflect.getMetadata('providers', AppModule) ?? [];
    const hasAppGuard = providers.some(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        (p as { provide?: unknown }).provide === APP_GUARD,
    );
    expect(hasAppGuard).toBe(false);
  });

  it('ActorsController has no class-level guard', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ActorsController),
    ).toBeUndefined();
  });

  it('ActorsController handlers have no method-level guards', () => {
    const proto = ActorsController.prototype as unknown as Record<
      string,
      unknown
    >;
    for (const method of ['findPublic', 'findOnePublic']) {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, proto[method] as object),
      ).toBeUndefined();
    }
  });
});
