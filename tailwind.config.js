/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nonworking: '#f3f4f6',
        overalloc: '#fecaca',
      },
    },
  },
  plugins: [],
}
