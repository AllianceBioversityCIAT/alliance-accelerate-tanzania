// @sdd-spec contact/contact-channels (T-6)
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { AdminRecipientResolver } from './admin-recipient.resolver';
import { LoggingModule } from '../logging/logging.module';
import { RequestContextMiddleware } from '../logging/request-context.middleware';
import { MailModule } from '../mail/mail.module';

/**
 * T-6 — `ContactModule` (design.md §4.1, §4.2).
 *
 * **Imports `LoggingModule` and `MailModule` explicitly.** `MailModule` is a
 * plain `@Module`, not `@Global()`, so the import is simply required —
 * exactly the reasoning `RegistrationsModule`'s own docblock gives for why
 * it imports `MailModule` itself rather than relying on any global
 * broadcast. `LoggingModule` supplies `RequestContextMiddleware`, applied
 * below via `forRoutes(ContactController)` — never `forRoutes('*')`, so this
 * registration cannot affect any other module's routes.
 *
 * **Lists the LIBRARY `ThrottlerGuard` in `providers` — no project subclass,
 * and no second `ThrottlerModule.forRoot()` call.** `ThrottlerModule` is
 * `@Global()`; `RegistrationsModule` already calls
 * `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }])` once, and that
 * single registration's providers (the options token, the storage token) are
 * visible to every module in the SAME compiled application — including this
 * one — with no re-import needed, once both modules are imported together
 * into `app.module.ts`. Registering `forRoot` a SECOND time here would
 * create competing global tokens resolved by module import order: a silent
 * failure on a live, release-gated rate limit (design.md §4.2's "Two
 * verification duties" note; `RegistrationsModule`'s own docblock records
 * the identical `@Global()` reasoning for `PrismaModule`). `@Throttle(...)`
 * on `ContactController` overrides the inherited `'default'`-named
 * throttler's limit/ttl per route instead — see that controller's docblock
 * for the two facts confirmed against the installed `@nestjs/throttler`
 * package that make this override actually take effect.
 *
 * **Two verification duties, both CONFIRMED against
 * `backend/node_modules/@nestjs/throttler` (6.5.0), not merely assumed
 * (tasks.md T-6, design.md §4.2):**
 *
 * 1. `@Throttle` exists and is exported as `(options) => MethodDecorator &
 *    ClassDecorator` (`dist/throttler.decorator.d.ts`) — usable at the
 *    controller class level exactly as `ContactController` uses it.
 * 2. An unnamed `ThrottlerModule.forRoot([{ ttl, limit }])` entry (no
 *    `name` key — precisely what `RegistrationsModule` passes) IS
 *    auto-named `'default'`: `ThrottlerGuard.onModuleInit()`
 *    (`dist/throttler.guard.js`) maps every configured throttler through
 *    `{ ...opt, name: opt.name ?? 'default' }` before use, and
 *    `@Throttle({ default: {...} })`'s own metadata keys
 *    (`throttler.decorator.js`'s `setThrottlerMetadata`) are looked up by
 *    that SAME name via `Reflector.getAllAndOverride`, which resolves
 *    controller-level metadata before falling back to the registered
 *    throttler's own value. Both facts hold, so `@Throttle({ default: {
 *    limit: 5, ttl: 60_000 } })` genuinely overrides the inherited 20/60 s to
 *    5/60 s for every route on `ContactController` — no fallback-to-20/60s
 *    acceptance was needed.
 *
 * **`AdminRecipientResolver` is registered here as a PLAIN, default-scoped
 * provider — no `scope:` option, ever.** T-5's review (carried forward as a
 * forward pointer into this task) is explicit that registering it with
 * `Scope.REQUEST` or `Scope.TRANSIENT` would silently defeat NFR-8's
 * per-container cache and DC-2's cache-semantics gate, while every existing
 * unit test in `admin-recipient.resolver.spec.ts` — which instantiates the
 * class directly, bypassing Nest's DI scope entirely — would keep passing.
 * Nest's default is already singleton scope, so simply omitting `scope`
 * (as below) is both the correct and the ONLY change this module makes to
 * how the resolver is provided.
 */
@Module({
  imports: [LoggingModule, MailModule],
  controllers: [ContactController],
  providers: [ThrottlerGuard, AdminRecipientResolver, ContactService],
})
export class ContactModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes(ContactController);
  }
}
