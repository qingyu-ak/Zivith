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
        ink: '#111318',
        panel: '#181b22',
        line: '#2b303b',
        accent: '#b7ff4a',
      },
      boxShadow: {
        glow: '0 0 30px rgba(183,255,74,.12)',
      },
    },
  },
  plugins: [],
};

export default config;
