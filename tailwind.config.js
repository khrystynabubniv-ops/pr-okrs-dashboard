/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Public Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        brand: '#0bab7c',
        ink: '#191b1a',
        ink2: '#565b57',
        ink3: '#8b908b',
        line: '#e7e6e1',
        line2: '#efeeea',
        canvas: '#eef4f1',
        accent: '#0bab7c',
        accent2: '#088a66',
        soft: '#d6f4e7',
        pos: '#0f9d6b',
        neg: '#e0533d',
        warn: '#d08911',
        warmsoft: '#fdefd6',
      },
    },
  },
  plugins: [],
}
