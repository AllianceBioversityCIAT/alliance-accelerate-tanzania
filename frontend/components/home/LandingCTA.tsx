// LandingCTA — FR-1 scenario "Landing CTA": a surface-alt panel below the hero
// actions, telling an anonymous visitor that organisations may add themselves
// and that every submission is reviewed by the ACCELERATE team before
// publication — the fact a visitor must know before handing over their own
// organisation's contact details (design.md §5.7).
//
// Placement: directly below Hero, ahead of MetricsBand — "below the hero
// actions" per §5.7. `/register` does not exist yet (T-17 builds it); linked
// anyway per the task brief.
//
// Surface: bg-surface-alt, py-16, standard container. No video/poster — this
// is a stated-fact panel, not a media strip (contrast with ClosingCTA/AboutStrip).
// Heading: <h2> — Hero alone owns the page's <h1>; every other home section
// (AboutStrip, HowItWorks, ClosingCTA) uses <h2>, so this keeps the hierarchy valid.
// Tokens only — no hardcoded colors (NFR-6). Text colour is `text-fg` / `text-muted`
// against `bg-surface-alt`: both resolve to hex values with ample AA contrast
// (see execution report), and neither is `accent`/`highlight`, which fail AA for
// small body text per docs/ux-ui/design.md §7.
//
// Usage:
//   import LandingCTA from '@/components/home/LandingCTA';
//   <LandingCTA />

import Button from '@/components/ui/Button';

export default function LandingCTA() {
  return (
    <section
      className="bg-surface-alt py-16"
      aria-labelledby="landing-cta-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">

        {/* Section heading — exactly one h2, no h1 */}
        <h2
          id="landing-cta-heading"
          className="text-2xl lg:text-3xl font-extrabold text-fg leading-tight mb-4"
        >
          Is your organisation part of the seed system?
        </h2>

        {/*
          Body copy carries the FR-1 review-before-publication fact explicitly —
          not implied by the link alone. A visitor who believes submission equals
          publication has been misled about what happens to their own data.
        */}
        <p className="text-muted max-w-prose mx-auto mb-8">
          Seed companies, cooperatives, offtakers, and other seed-system actors
          can add themselves to the registry. Every submission is reviewed by
          the ACCELERATE team before it is published, so nothing you send goes
          live automatically.
        </p>

        <Button variant="primary" href="/register">
          Register your organisation
        </Button>

      </div>
    </section>
  );
}
