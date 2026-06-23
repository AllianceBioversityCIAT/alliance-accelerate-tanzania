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
          fg: 'var(--color-primary-fg)',
        },
        accent:      'var(--color-accent)',
        bean:        'var(--color-bean)',
        bg:          'var(--color-bg)',
        surface:     'var(--color-surface)',
        fg:          'var(--color-fg)',
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
      fontSize: {
        xs:   'var(--text-xs)',
        sm:   'var(--text-sm)',
        base: 'var(--text-base)',
        lg:   'var(--text-lg)',
        xl:   'var(--text-xl)',
        '2xl': 'var(--text-2xl)',
        '3xl': 'var(--text-3xl)',
        '4xl': 'var(--text-4xl)',
      },
    },
  },
  plugins: [],
};

export default config;
