import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover:   'var(--color-primary-hover)',
          fg:      'var(--color-primary-fg)',
          soft:    'var(--color-primary-soft)',
        },
        accent:           'var(--color-accent)',
        highlight: {
          DEFAULT: 'var(--color-highlight)',
          soft:    'var(--color-highlight-soft)',
          tint:    'var(--color-highlight-tint)',
        },
        bean:             'var(--color-bean)',
        bg:               'var(--color-bg)',
        surface:          'var(--color-surface)',
        'surface-alt':    'var(--color-surface-alt)',
        fg:               'var(--color-fg)',
        backdrop:         'var(--color-backdrop)',
        muted:       'var(--color-muted)',
        border:      'var(--color-border)',
        success:     'var(--color-success)',
        warning:     'var(--color-warning)',
        danger: {
          DEFAULT: 'var(--color-danger)',
          soft:    'var(--color-danger-soft)',
        },
        restricted:  'var(--color-restricted-bg)',
        crop: {
          sorghum:   'var(--crop-sorghum)',
          bean:      'var(--crop-bean)',
          groundnut: 'var(--crop-groundnut)',
          // Soft tints for CropImage panel backgrounds (see globals.css).
          'sorghum-soft':   'var(--crop-sorghum-soft)',
          'bean-soft':      'var(--crop-bean-soft)',
          'groundnut-soft': 'var(--crop-groundnut-soft)',
        },
      },
      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        // Sticky-column boundary marker (admin ActorsTable, FR-6). An inset
        // shadow is painted by the cell it's applied to, so — unlike a
        // border, which under `border-collapse` belongs to the table's
        // border grid — it travels with the cell's sticky offset instead of
        // staying pinned to the border grid's original position.
        'sticky-edge': 'inset -1px 0 0 var(--color-border)',
      },
      backgroundImage: {
        'gradient-hero': 'var(--gradient-hero)',
        'gradient-band': 'var(--gradient-band)',
      },
      fontFamily: {
        sans:    ['var(--font-sans)'],
        display: ['var(--font-display)'],
      },
      transitionDuration: {
        fast: '300ms',
        base: '600ms',
        slow: '900ms',
      },
      transitionTimingFunction: {
        out:  'cubic-bezier(.2,.7,.2,1)',
        soft: 'cubic-bezier(.25,.46,.45,.94)',
      },
      fontSize: {
        xs:   'var(--text-xs)',
        sm:   'var(--text-sm)',
        base: 'var(--text-base)',
        lg:   'var(--text-lg)',
        xl:   'var(--text-xl)',
        '2xl': 'var(--text-2xl)',
        '3xl': 'var(--text-3xl)',
        '4xl': 'var(--text-4xl)',
        '5xl': 'var(--text-5xl)',
        '6xl': 'var(--text-6xl)',
      },
    },
  },
  plugins: [],
};

export default config;
