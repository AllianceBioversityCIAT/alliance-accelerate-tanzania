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
        highlight:        'var(--color-highlight)',
        'highlight-soft': 'var(--color-highlight-soft)',
        bean:             'var(--color-bean)',
        bg:               'var(--color-bg)',
        surface:          'var(--color-surface)',
        'surface-alt':    'var(--color-surface-alt)',
        fg:               'var(--color-fg)',
        muted:       'var(--color-muted)',
        border:      'var(--color-border)',
        success:     'var(--color-success)',
        warning:     'var(--color-warning)',
        danger:      'var(--color-danger)',
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
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
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
