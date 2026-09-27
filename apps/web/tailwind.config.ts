import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: 'var(--z-fg)',
        panel: 'var(--z-panel)',
        line: 'var(--z-line)',
        accent: '#4d6bfe',
      },
      boxShadow: {
        glow: '0 0 30px rgba(77,107,254,.12)',
      },
    },
  },
  plugins: [],
};

export default config;
