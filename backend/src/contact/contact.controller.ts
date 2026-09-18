// @sdd-spec contact/contact-channels (T-6)
import { Body, Controller, HttpCode, HttpStatus, Post, UseFilters, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ContactCreateDto } from './dto/contact-create.dto';
import { ContactService } from './contact.service';
import { ThrottlerExceptionFilter } from '../registrations/throttler-exception.filter';

/**
 * T-6 — Public contact controller (FR-1, FR-2, FR-5, design.md §3, §4.1).
 *
 * `POST /contact` — `Public` role, deliberately, mirroring
 * `RegistrationsController`'s own documented convention: `app.module.ts`
 * registers no global guard, so the ABSENCE of `@UseGuards(JwtAuthGuard)`
 * here is the intended behaviour, not an omission. FR-1 requires the contact
 * page (and therefore this endpoint) to be reachable by an anonymous
 * visitor with no sign-in, no redirect to `/login`, and no role gate.
 *
 * **Rate limiting — the LIBRARY `ThrottlerGuard` and `@Throttle`, not a
 * project subclass (design.md §4.1, §4.2).** `RegistrationsThrottleGuard`
 * (a thin subclass carrying `registrations`' own 20/60 s constants) is
 * deliberately NOT reused here: this endpoint applies `@Throttle({ default:
 * { limit: 5, ttl: 60_000 } })` at the class level to override the SAME
 * `'default'`-named throttler `RegistrationsModule`'s
 * `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }])` already registers
 * (`ThrottlerModule` is `@Global()` — see `contact.module.ts`, which
 * deliberately does not call `forRoot` a second time). Confirmed against the
 * installed `@nestjs/throttler@6.5.0` (see `contact.module.ts`'s docblock for
 * the two verification duties this satisfies): an unnamed `forRoot` entry is
 * auto-named `'default'` in the guard's own `onModuleInit`
 * (`node_modules/@nestjs/throttler/dist/throttler.guard.js`), and `@Throttle`
 * is a `MethodDecorator & ClassDecorator` usable exactly as it is used below.
 * `ThrottlerExceptionFilter` is imported IN PLACE from `registrations/` —
 * promoting it to `common/` would touch the live registration path and
 * belongs to a later spec, per design.md §4.1's module-layout table.
 */
@Controller('contact')
@UseGuards(ThrottlerGuard)
@UseFilters(ThrottlerExceptionFilter)
@Throttle({ default: { limit: 5, ttl: 60_000 } })
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  /**
   * FR-2, FR-5, FR-8. `202`, empty body, for both a genuinely accepted
   * submission and a filled honeypot — see `ContactService.submitContact`'s
   * doc for why no branch of this handler's own could distinguish them even
   * if it tried. `502` (a `BadGatewayException`, thrown from the service) on
   * a mail-transport rejection; `429` via the class-level guard/filter above;
   * `400` via the global validation pipe, before this handler ever runs.
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async submitContact(@Body() dto: ContactCreateDto): Promise<void> {
    await this.contactService.submitContact(dto);
  }
}
