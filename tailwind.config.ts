import type { Config } from 'tailwindcss';

// Design tokens mirror reference/compass-demo.html :root (canonical per spec §11).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        ink: 'var(--ink)',
        rule: 'var(--rule)',
        faint: 'var(--faint)',
        card: 'var(--card)',
        brass: 'var(--brass)',
        aligned: 'var(--aligned)',
        opposed: 'var(--opposed)',
        mixed: 'var(--mixed)',
        unknown: 'var(--unknown)',
      },
      fontFamily: {
        serif: ['"Source Serif 4 Variable"', '"Iowan Old Style"', 'Palatino', 'Georgia', 'serif'],
        sans: [
          '"Inter Variable"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: { DEFAULT: '3px' },
      maxWidth: { wrap: '880px', wiz: '760px' },
      letterSpacing: { wide2: '0.14em', wide3: '0.16em', brand: '0.34em' },
      transitionDuration: { fade: '300ms' },
    },
  },
  plugins: [],
} satisfies Config;
