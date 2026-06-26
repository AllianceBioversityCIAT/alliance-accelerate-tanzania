// About page — static server component (T-7, FR-3).
// Route: /about — rendered inside PublicShell via (public)/layout.tsx.
//
// All copy is sourced verbatim from docs/reference/accelerate-web-copy-brief.md §3.
// Sections in order: hero (§3.1), challenge (§3.2), approach (§3.3), crops (§3.4),
// partners (§3.5), model in action (§3.6), registry (§3.7), credits (§3.8).
//
// A11y contract:
//   - Exactly ONE <h1> (the hero heading).
//   - All section headings are <h2>; sub-items within sections use <h3>.
//   - Every <section> carries aria-labelledby pointing to its heading id.
//   - Tokens only — no raw hex; body text uses text-fg / text-muted for AA contrast.
//   - Field photo placed beside/below the text (no overlay) — no scrim contrast risk.
//
// Static export compliance: no 'use client', no SSR, no route handlers (NFR-5).

import type { Metadata } from 'next';
import Image from 'next/image';
import Button from '@/components/ui/Button';
import PillarCards from '@/components/home/PillarCards';
import PartnerWall from '@/components/home/PartnerWall';
import CropImage from '@/components/home/CropImage';
import { CROPS, type CropTokenClass } from '@/lib/content/crops';

// Static crop-accent text classes — full strings so Tailwind's content scan keeps
// them (avoids relying on CropCard to keep the dynamic text-crop-* classes alive).
const CROP_TEXT: Record<CropTokenClass, string> = {
  'crop-sorghum':   'text-crop-sorghum',
  'crop-bean':      'text-crop-bean',
  'crop-groundnut': 'text-crop-groundnut',
};

// ---------------------------------------------------------------------------
// Metadata (FR-3, brief §5)
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: 'About ACCELERATE — Tanzania Seed Registry',
  description:
    'ACCELERATE is a 2023–2026 initiative building a demand-led model to speed adoption of improved sorghum, common bean, and groundnut varieties across Tanzania.',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AboutPage() {
  return (
    // Page wrapper — no extra padding; sections own their vertical rhythm.
    <div className="bg-bg">

      {/* ====================================================================
          §3.1  ABOUT HERO
          One <h1> for the page; eyebrow pill + lede + field photograph.
          Photo is placed below the text column on mobile and beside it on lg+
          to avoid any text-over-image contrast issue.
      ==================================================================== */}
      <section aria-labelledby="about-hero-heading" className="bg-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* Left column — copy */}
            <div className="flex flex-col gap-6">

              {/* Eyebrow pill */}
              <div>
                <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold tracking-wide">
                  About the project
                </span>
              </div>

              {/* H1 — sole page heading (a11y: one h1 per page) */}
              <h1
                id="about-hero-heading"
                className="text-4xl font-bold text-fg leading-tight tracking-tight"
              >
                ACCELERATE: accelerating variety turnover in Tanzania
              </h1>

              {/* Lede paragraph — §3.1 verbatim */}
              <p className="text-lg text-muted leading-relaxed max-w-prose">
                <em>Accelerated Variety Turnover for Open-Pollinated Crops in Tanzania</em>{' '}
                (ACCELERATE) is a four-year project (2023&ndash;2026) building a scalable,
                demand-led model that speeds the adoption of new, higher-yielding crop varieties
                across Tanzania&rsquo;s sorghum, common bean, and groundnut value chains.
              </p>

            </div>

            {/* Right column — field photograph */}
            {/*
              Placed beside (not overlaid on) the text, so there is no
              contrast risk. Rounded corners via token radius-lg (NFR-4).
            */}
            <div className="relative w-full h-72 lg:h-96 rounded-lg overflow-hidden bg-surface-alt">
              <Image
                src="/accelerate-field.jpg"
                alt="ACCELERATE field staff interviewing a market trader about seed and grain at a rural Tanzanian market."
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            </div>

          </div>
        </div>
      </section>

      {/* ====================================================================
          §3.2  THE CHALLENGE
          Alternating surface (bg-surface-alt). Bold the 3% clause per brief.
      ==================================================================== */}
      <section
        aria-labelledby="challenge-heading"
        className="bg-surface-alt"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">

          {/* Eyebrow */}
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold tracking-wide mb-4">
            Context
          </span>

          <h2
            id="challenge-heading"
            className="text-2xl font-bold text-fg leading-tight mb-6"
          >
            The challenge
          </h2>

          <div className="max-w-prose flex flex-col gap-4">
            <p className="text-base text-muted leading-relaxed">
              Across Tanzania, most smallholder farmers still grow old, low-yielding varieties
              that are increasingly vulnerable to drought and climate stress. Adoption of improved
              open-pollinated varieties (OPVs) remains low &mdash; held back by a lack of product
              information, limited promotion, poor access to early-generation seed, thin data to
              guide decisions, and a weak seed supply system.
            </p>
            <p className="text-base text-muted leading-relaxed">
              The formal seed sector meets only about{' '}
              <strong className="text-fg font-semibold">
                3% of farmers&rsquo; planting requirements
              </strong>
              . The rest comes from informal channels, which keeps better genetics from reaching
              the field.
            </p>
          </div>

        </div>
      </section>

      {/* ====================================================================
          §3.3  A DEMAND-LED APPROACH
          Body + PillarCards (reused server component, no wrapper motion here).
      ==================================================================== */}
      <section
        aria-labelledby="approach-heading"
        className="bg-bg"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">

          {/* Eyebrow */}
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold tracking-wide mb-4">
            The model
          </span>

          <h2
            id="approach-heading"
            className="text-2xl font-bold text-fg leading-tight mb-6"
          >
            A demand-led approach
          </h2>

          <p className="text-base text-muted leading-relaxed max-w-prose mb-10">
            ACCELERATE flips the usual model. Rather than pushing seed toward farmers, it starts
            with the sources of demand &mdash; the grain traders, aggregators, processors, and
            institutional buyers who already move crops through the market &mdash; and links them
            to formal, semi-formal, and informal seed producers. When demand pulls quality seed
            through the value chain, varietal turnover accelerates on its own.
          </p>

          {/*
            PillarCards is a pure server component (no 'use client').
            On the About page it renders without a motion wrapper (§3.3 spec note).
          */}
          <PillarCards />

        </div>
      </section>

      {/* ====================================================================
          §3.4  CROPS & VALUE CHAINS
          Per-crop blocks driven by CROPS content array + inline §3.4 copy.
          Varieties surfaced as a muted sub-label where available (§4.2).
          🟡 secondary figures — attributed in §3.8 credits (no emoji in UI).
      ==================================================================== */}
      <section
        aria-labelledby="crops-heading"
        className="bg-surface-alt"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">

          {/* Eyebrow */}
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold tracking-wide mb-4">
            Value chains
          </span>

          <h2
            id="crops-heading"
            className="text-2xl font-bold text-fg leading-tight mb-3"
          >
            Crops and value chains
          </h2>

          {/* §3.4 intro */}
          <p className="text-base text-muted leading-relaxed max-w-prose mb-10">
            ACCELERATE focuses on three priority value chains, each with newly released,
            higher-yielding varieties:
          </p>

          {/*
            Per-crop cards — one per CROPS entry. Image-led design: CropImage
            panel on top, then crop name (h3), description, and varieties.
            Matches CropCard chrome on the home page (no border-t-4 accent).
            Varieties list sourced from crops.ts CROPS[].varieties (§4.2).
          */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {CROPS.map((crop) => (
              <div
                key={crop.slug}
                className="bg-surface border border-border rounded-lg overflow-hidden shadow-sm flex flex-col"
              >
                {/* Tinted image panel — shared CropImage server component */}
                <CropImage crop={crop} />

                {/* Card content */}
                <div className="px-5 py-5 flex flex-col gap-3 flex-1">
                  {/* Crop name — h3 because it sits under the section <h2> */}
                  <h3 className={['text-base font-bold leading-snug', CROP_TEXT[crop.tokenClass]].join(' ')}>
                    {crop.name}
                  </h3>

                  {/* §3.4 description (from crops.ts — matches brief copy) */}
                  <p className="text-sm text-muted leading-relaxed flex-1">
                    {crop.description}
                  </p>

                  {/* Representative varieties sub-label (§4.2 — muted, attributed in §3.8) */}
                  {crop.varieties && crop.varieties.length > 0 && (
                    <p className="text-xs text-muted leading-relaxed">
                      <span className="font-semibold text-fg">Key varieties:</span>{' '}
                      {crop.varieties.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ====================================================================
          §3.5  PARTNERS
          Tiered logo wall shared with the home PartnersStrip via PartnerWall.
          Home and /about never co-render, so both may use id="partners-heading"
          for their respective single <h2>.
      ==================================================================== */}
      <section
        aria-labelledby="partners-heading"
        className="bg-bg"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">

          {/* Eyebrow */}
          <div className="flex flex-col items-center text-center mb-10">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold tracking-wide mb-4">
              Partners
            </span>

            <h2
              id="partners-heading"
              className="text-2xl font-bold text-fg leading-tight mb-6"
            >
              Partners
            </h2>

            <p className="text-base text-muted leading-relaxed max-w-prose mb-10">
              ACCELERATE is delivered by a coalition of research and seed-system
              institutions, funded by the Bill &amp; Melinda Gates Foundation.
            </p>
          </div>

          <PartnerWall />

        </div>
      </section>

      {/* ====================================================================
          §3.6  THE MODEL IN ACTION
          Four enterprise case studies as a card grid.
          All figures are from published partner case studies (attributed in §3.8).
      ==================================================================== */}
      <section
        aria-labelledby="model-in-action-heading"
        className="bg-surface-alt"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">

          {/* Eyebrow */}
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold tracking-wide mb-4">
            Case studies
          </span>

          <h2
            id="model-in-action-heading"
            className="text-2xl font-bold text-fg leading-tight mb-3"
          >
            The model in action
          </h2>

          <p className="text-base text-muted leading-relaxed max-w-prose mb-10">
            Across Tanzania, ACCELERATE works through real seed-system enterprises:
          </p>

          {/* Four enterprise case-study cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

            {/* Ikuwo General Enterprises */}
            <article
              aria-labelledby="case-ikuwo"
              className="bg-surface border border-border shadow-md rounded-md px-5 py-6 flex flex-col gap-3"
            >
              <h3
                id="case-ikuwo"
                className="text-base font-bold text-fg leading-snug"
              >
                Ikuwo General Enterprises
              </h3>
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                Rukwa
              </p>
              <p className="text-sm text-muted leading-relaxed">
                Grew its bean trade from 1,000 tonnes (2017) to 5,000 tonnes (2022), now reaching
                about{' '}
                <strong className="text-fg font-semibold">12,000 farmers</strong> and exporting
                to five neighbouring countries.
              </p>
            </article>

            {/* Kibaigwa Flour Supplies */}
            <article
              aria-labelledby="case-kibaigwa"
              className="bg-surface border border-border shadow-md rounded-md px-5 py-6 flex flex-col gap-3"
            >
              <h3
                id="case-kibaigwa"
                className="text-base font-bold text-fg leading-snug"
              >
                Kibaigwa Flour Supplies
              </h3>
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                Dodoma
              </p>
              <p className="text-sm text-muted leading-relaxed">
                Supports{' '}
                <strong className="text-fg font-semibold">7,850 farmers</strong> with contract
                farming for sorghum and groundnut, providing seed on credit and guaranteed
                purchase.
              </p>
            </article>

            {/* Ntemisambo Company */}
            <article
              aria-labelledby="case-ntemisambo"
              className="bg-surface border border-border shadow-md rounded-md px-5 py-6 flex flex-col gap-3"
            >
              <h3
                id="case-ntemisambo"
                className="text-base font-bold text-fg leading-snug"
              >
                Ntemisambo Company
              </h3>
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                Katavi
              </p>
              <p className="text-sm text-muted leading-relaxed">
                Scaled groundnut sourcing from 15 to 113.5 tonnes in a single season while
                building dedicated seed-multiplication capacity.
              </p>
            </article>

            {/* Bora Food Company */}
            <article
              aria-labelledby="case-bora"
              className="bg-surface border border-border shadow-md rounded-md px-5 py-6 flex flex-col gap-3"
            >
              <h3
                id="case-bora"
                className="text-base font-bold text-fg leading-snug"
              >
                Bora Food Company
              </h3>
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                Geita
              </p>
              <p className="text-sm text-muted leading-relaxed">
                Trains farmers in Quality Declared Seed production and supplies bio-fortified
                varieties into school nutrition programs.
              </p>
            </article>

          </div>
        </div>
      </section>

      {/* ====================================================================
          §3.7  ABOUT THIS REGISTRY
          Body + two CTAs: Explore the Map → /map, Browse the Directory → /directory.
      ==================================================================== */}
      <section
        aria-labelledby="registry-heading"
        className="bg-bg"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">

          {/* Eyebrow */}
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold tracking-wide mb-4">
            This platform
          </span>

          <h2
            id="registry-heading"
            className="text-2xl font-bold text-fg leading-tight mb-6"
          >
            About this registry
          </h2>

          <p className="text-base text-muted leading-relaxed max-w-prose mb-8">
            This platform is the public registry behind ACCELERATE &mdash; a single, trusted map
            of the seed companies, cooperatives, offtakers, research institutes, and traders that
            make up Tanzania&rsquo;s seed system. It helps institutions find the right actors
            quickly, understand who operates where, and strengthen the value chains that move
            improved varieties from lab to field.
          </p>

          <div className="flex flex-wrap gap-3">
            <Button variant="primary" href="/map">
              Explore the Map
            </Button>
            <Button variant="secondary" href="/directory">
              Browse the Directory
            </Button>
          </div>

        </div>
      </section>

      {/* ====================================================================
          §3.8  CREDITS / SOURCES
          Small-print block with Alliance project page link (new tab, noopener).
          Attributes that field figures come from published partner case studies.
      ==================================================================== */}
      <section
        aria-labelledby="credits-heading"
        className="bg-surface-alt border-t border-border"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">

          <h2
            id="credits-heading"
            className="text-xs font-semibold uppercase tracking-widest text-muted mb-3"
          >
            Credits &amp; sources
          </h2>

          <p className="text-xs text-muted leading-relaxed max-w-prose">
            Project information adapted from the Alliance of Bioversity International &amp; CIAT
            and PABRA. Field figures are drawn from published partner case studies. Learn more at
            the{' '}
            <a
              href="https://alliancebioversityciat.org/projects/accelerate"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary hover:text-primary-hover transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm"
            >
              Alliance project page
            </a>
            .
          </p>

        </div>
      </section>

    </div>
  );
}
