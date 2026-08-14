import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#18181b',
        panel: '#ffffff',
        line: '#e5e7eb',
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
