/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sage: {
          50: '#f0f4f1',
          100: '#dce8de',
          200: '#bad1be',
          300: '#8fb196',
          400: '#6B8F71',
          500: '#527358',
          600: '#3f5a44',
          700: '#344937',
          800: '#2b3b2e',
          900: '#243127',
        },
        warm: {
          50: '#FAFAF8',
          100: '#F7F6F3',
          200: '#EFEDE8',
          300: '#E4E0D8',
          400: '#C8C2B5',
          500: '#9E9589',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['DM Serif Display', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
