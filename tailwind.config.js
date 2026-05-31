/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        root: '#020617',
        surface: '#0F172A',
        card: '#1E293B',
        border: '#334155',
        'text-primary': '#F8FAFC',
        'text-secondary': '#94A3B8',
        'text-muted': '#64748B',
        green: '#22C55E',
        red: '#EF4444',
        gold: '#F59E0B',
        blue: '#3B82F6',
        'blue-light': '#60A5FA',
      },
      fontFamily: {
        ui: ['IBM Plex Sans', '-apple-system', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        mono: ['Fira Code', 'SF Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
