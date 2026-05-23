/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cosmic: {
          950: '#03050b',
          900: '#070a13',
          800: '#0f1426',
          700: '#1a233d',
          600: '#2b395e',
          DEFAULT: '#070a13',
        },
        spiritual: {
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
        future: {
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 4px 30px rgba(0, 0, 0, 0.1)',
        'glass-sm': '0 8px 32px 0 rgba(0, 0, 0, 0.2)',
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
      },
      backdropBlur: {
        'xs': '2px',
      }
    },
  },
  plugins: [],
}
