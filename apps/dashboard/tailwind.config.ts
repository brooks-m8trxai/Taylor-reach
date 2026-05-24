import type { Config } from 'tailwindcss'

/**
 * Tailwind config — semantic token layer.
 *
 * Colors are defined as CSS custom properties in globals.css and
 * referenced here via var(). Never hard-code hex values in component
 * class names — always use a semantic token class (e.g. bg-surface,
 * text-ink-muted, border-wire).
 *
 * Existing zinc-* classes still work so no existing pages break;
 * new work should use the semantic tokens below.
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      /* ── Fonts ─────────────────────────────────────────────────────────── */
      fontFamily: {
        sans:    ['var(--font-inter)',     'system-ui', 'sans-serif'],
        display: ['var(--font-playfair)',  'Georgia',   'serif'],
      },

      /* ── Semantic color tokens ─────────────────────────────────────────── */
      colors: {
        // Backgrounds
        surface: {
          base:    'var(--bg-base)',
          DEFAULT: 'var(--bg-surface)',
          raised:  'var(--bg-surface-raised)',
          sidebar: 'var(--bg-sidebar)',
          hover:   'var(--bg-hover)',
          active:  'var(--bg-active)',
        },
        // Text
        ink: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted:     'var(--text-muted)',
        },
        // Borders
        wire: {
          subtle:  'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong:  'var(--border-strong)',
        },
        // Brand accents
        accent: {
          DEFAULT: 'var(--accent)',        // Tangerine Dream — hero metrics
          soft:    'var(--accent-soft)',   // Soft Apricot — secondary
          sage:    'var(--accent-sage)',   // Ash Grey — positive/healthy
        },
        // Status
        status: {
          positive: 'var(--color-positive)',
          warning:  'var(--color-warning)',
          danger:   'var(--color-danger)',
          info:     'var(--color-info)',
        },
      },

      /* ── Custom font sizes matching the type scale ──────────────────────── */
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],        // 11px
        'display': ['2.75rem',  { lineHeight: '1.15' }],     // 44px hero KPI
      },

      /* ── Box shadows using warm-tinted values ──────────────────────────── */
      boxShadow: {
        card:   'var(--shadow-card)',
        raised: 'var(--shadow-raised)',
        hover:  'var(--shadow-hover)',
      },

      /* ── Border radius ─────────────────────────────────────────────────── */
      borderRadius: {
        sm:  'var(--radius-sm)',
        md:  'var(--radius-md)',
        lg:  'var(--radius-lg)',
        xl:  'var(--radius-xl)',
      },

      /* ── Transition durations ──────────────────────────────────────────── */
      transitionDuration: {
        fast:   '150ms',
        normal: '220ms',
        slow:   '350ms',
      },

      /* ── Animation ─────────────────────────────────────────────────────── */
      animation: {
        'fade-slide-up': 'fade-slide-up 350ms cubic-bezier(0.16,1,0.3,1) both',
        'fade-in':       'fade-in 220ms cubic-bezier(0.16,1,0.3,1) both',
      },
      keyframes: {
        'fade-slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config
