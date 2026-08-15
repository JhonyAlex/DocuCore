/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', './shared/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dce7ff',
          200: '#b9cdff',
          300: '#8aabff',
          400: '#5a85ff',
          500: '#3a64ff',
          600: '#2147f5',
          700: '#1a37d1',
          800: '#1b30a4',
          900: '#1a2f80',
          950: '#101c4e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [],
}
