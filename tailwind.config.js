/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sentra: {
          bg: '#0a0e1a',
          surface: '#0f1422',
          border: 'rgba(255,255,255,0.08)',
          blue: '#1a73e8',
          orange: '#f97316',
          green: '#10b981',
          red: '#ef4444',
        },
      },
      keyframes: {
        scan: {
          '0%':   { transform: 'translateY(0%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'slide-up': {
          '0%':   { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        scan:       'scan 3s linear infinite',
        'slide-up': 'slide-up 0.3s cubic-bezier(0.32,0.72,0,1)',
      },
    },
  },
  plugins: [],
};
