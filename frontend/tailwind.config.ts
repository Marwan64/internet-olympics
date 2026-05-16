import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          purple: '#7C3AED',
          'purple-light': '#A78BFA',
          'purple-dark': '#5B21B6',
          cyan: '#06B6D4',
          'cyan-light': '#67E8F9',
          pink: '#EC4899',
          'pink-light': '#F9A8D4',
          amber: '#F59E0B',
          'amber-light': '#FCD34D',
        },
        game: {
          bg: '#080812',
          card: '#0f0f23',
          border: '#1e1e3f',
          surface: '#13132a',
        },
      },
      fontFamily: {
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'hero-gradient': 'linear-gradient(135deg, #080812 0%, #0d0d2b 50%, #080812 100%)',
        'card-gradient': 'linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(6,182,212,0.1) 100%)',
        'purple-glow': 'radial-gradient(circle, rgba(124,58,237,0.3) 0%, transparent 70%)',
        'cyan-glow': 'radial-gradient(circle, rgba(6,182,212,0.3) 0%, transparent 70%)',
      },
      boxShadow: {
        'glow-purple': '0 0 20px rgba(124,58,237,0.5), 0 0 40px rgba(124,58,237,0.3)',
        'glow-cyan': '0 0 20px rgba(6,182,212,0.5), 0 0 40px rgba(6,182,212,0.3)',
        'glow-pink': '0 0 20px rgba(236,72,153,0.5), 0 0 40px rgba(236,72,153,0.3)',
        'glow-amber': '0 0 20px rgba(245,158,11,0.5), 0 0 40px rgba(245,158,11,0.3)',
        'card': '0 0 0 1px rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.4)',
        'card-hover': '0 0 0 1px rgba(124,58,237,0.4), 0 8px 32px rgba(0,0,0,0.6)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'float-delayed': 'float 6s ease-in-out 2s infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'gradient-shift': 'gradientShift 8s ease infinite',
        'slide-up': 'slideUp 0.5s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out',
        'bounce-in': 'bounceIn 0.6s cubic-bezier(0.36, 0.07, 0.19, 0.97)',
        'shake': 'shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both',
        'spin-slow': 'spin 8s linear infinite',
        'wiggle': 'wiggle 1s ease-in-out infinite',
        'disco': 'disco 0.3s ease-in-out infinite',
        'countdown': 'countdown 1s ease-out forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(124,58,237,0.5)' },
          '50%': { boxShadow: '0 0 40px rgba(124,58,237,0.8), 0 0 60px rgba(124,58,237,0.4)' },
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        bounceIn: {
          '0%': { opacity: '0', transform: 'scale(0.3)' },
          '50%': { transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shake: {
          '10%, 90%': { transform: 'translate3d(-2px, 0, 0)' },
          '20%, 80%': { transform: 'translate3d(4px, 0, 0)' },
          '30%, 50%, 70%': { transform: 'translate3d(-8px, 0, 0)' },
          '40%, 60%': { transform: 'translate3d(8px, 0, 0)' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
        disco: {
          '0%': { filter: 'hue-rotate(0deg)' },
          '100%': { filter: 'hue-rotate(360deg)' },
        },
        countdown: {
          '0%': { transform: 'scale(2)', opacity: '0' },
          '50%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.5)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
