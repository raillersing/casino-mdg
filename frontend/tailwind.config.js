/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Casino MDG Design System (dark theme)
        'surface': {
          900: '#020617',
          800: '#0f172a',
          700: '#1e293b',
          600: '#334155',
        },
        'brand': {
          primary: '#22d3ee',
          secondary: '#34d399',
          accent: '#a78bfa',
          danger: '#fb7185',
          warning: '#fbbf24',
        },
        // Game-specific colors
        'poker': {
          felt: '#1a5f2a',
          table: '#0d4f1c',
        },
        'belote': {
          felt: '#1a3a5f',
          table: '#0d2a4f',
        },
        'rami': {
          felt: '#5f1a3a',
          table: '#4f0d2a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'bounce-gentle': 'bounceGentle 0.5s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        bounceGentle: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
      },
    },
  },
  plugins: [],
}
