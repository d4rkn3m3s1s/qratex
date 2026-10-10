import type { Config } from 'tailwindcss';

/**
 * Qratex Design Language v2 (QDL) — Tailwind eşlemesi.
 * Değerlerin TEK kaynağı `app/globals.css` içindeki CSS değişkenleridir;
 * burada yalnız rol token'ları sınıf adına bağlanır.
 *
 * Önemli kurallar:
 * - `text-{destructive|danger|success|warning|info|brand}` → `*-text` rolü
 *   (zemin üstünde ≥ 4.5:1). `bg-*` / `border-*` / `ring-*` → dolgu rolü.
 * - Tipografi ve elevation `qx-` sınıflarıyla gelir (globals.css), fontSize
 *   anahtarı DEĞİL: tailwind-merge bilinmeyen `text-*` değerini renk sanıp
 *   `cn('text-h1', 'text-foreground')` içinde boyutu silerdi.
 */
const role = (name: string) => `hsl(var(--${name}))`;

const statusColor = (name: 'success' | 'warning' | 'danger' | 'info') => ({
  DEFAULT: role(name),
  fg: role(`${name}-fg`),
  foreground: role(`${name}-fg`),
  text: role(`${name}-text`),
  subtle: role(`${name}-subtle`),
  border: role(`${name}-border`),
});

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: ['z-[40]', 'z-[45]', 'z-[70]', 'z-[100]'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          text: role('danger-text'),
          subtle: role('danger-subtle'),
          border: role('danger-border'),
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        // ── QDL rol token'ları ──
        surface: {
          DEFAULT: role('surface-1'),
          0: role('surface-0'),
          1: role('surface-1'),
          2: role('surface-2'),
          3: role('surface-3'),
          elevated: role('surface-2'),
          muted: role('surface-3'),
        },
        fg: {
          DEFAULT: role('text-1'),
          muted: role('text-2'),
          subtle: role('text-3'),
        },
        brand: {
          DEFAULT: role('brand'),
          fg: role('brand-fg'),
          text: role('brand-text'),
          subtle: role('brand-subtle'),
          border: role('brand-border'),
        },
        success: statusColor('success'),
        warning: statusColor('warning'),
        danger: statusColor('danger'),
        info: statusColor('info'),
        focus: role('focus-ring'),
        overlay: role('overlay'),
        category: {
          1: role('category-1'),
          2: role('category-2'),
          3: role('category-3'),
          4: role('category-4'),
          5: role('category-5'),
          6: role('category-6'),
          7: role('category-7'),
          8: role('category-8'),
        },
      },
      // Metin rengi: durum adları metin rolüne gider (dolgu rengi metin olarak
      // okunmuyordu — P0-38 / koyu temada text-destructive 1,93:1).
      textColor: {
        destructive: { DEFAULT: role('danger-text') },
        danger: { DEFAULT: role('danger-text') },
        success: { DEFAULT: role('success-text') },
        warning: { DEFAULT: role('warning-text') },
        info: { DEFAULT: role('info-text') },
        brand: { DEFAULT: role('brand-text') },
      },
      borderColor: {
        subtle: role('border-subtle'),
        strong: role('border-strong'),
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        // QDL anlamsal radius: chip 8 · control 12 · card 16 · sheet 24
        chip: 'var(--radius-sm)',
        control: 'var(--radius-md)',
        card: 'var(--radius-lg)',
        sheet: 'var(--radius-xl)',
      },
      spacing: {
        card: 'var(--space-card)',
        section: 'var(--space-section)',
      },
      zIndex: {
        base: 'var(--z-base)',
        raised: 'var(--z-raised)',
        sticky: 'var(--z-sticky)',
        header: 'var(--z-header)',
        overlay: 'var(--z-overlay)',
        modal: 'var(--z-modal)',
        popover: 'var(--z-popover)',
        toast: 'var(--z-toast)',
        skip: 'var(--z-skip)',
      },
      // tailwindcss-animate animationDuration/TimingFunction'ı bunlardan türetir:
      // `duration-fast` hem transition hem animation süresini ayarlar.
      transitionDuration: {
        fast: 'var(--motion-fast)',
        base: 'var(--motion-base)',
        slow: 'var(--motion-slow)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        emphasized: 'var(--ease-emphasized)',
        exit: 'var(--ease-exit)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
        // Skor/sayaç başlıkları (play kaydı). --font-display tanımlı değilse Space Grotesk (--font-mono).
        display: ['var(--font-display, var(--font-mono))', 'var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        // `shimmer` keyframe'i globals.css'te tek tanım (stil bloklarından da adla kullanılıyor).
        'slide-in-from-top': {
          from: { transform: 'translateY(-100%)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-in-from-bottom': {
          from: { transform: 'translateY(100%)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-in-from-left': {
          from: { transform: 'translateX(-100%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-in-from-right': {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { transform: 'scale(0.95)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        bounce: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        // Marka parıltısı preset'i izler (eski: sabit rgba(139,92,246)).
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px hsl(var(--primary) / 0.3)' },
          '50%': { boxShadow: '0 0 40px hsl(var(--primary) / 0.6)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'gradient-x': {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
        },
        'gradient-rotate': {
          '0%': { '--gradient-angle': '0deg' },
          '100%': { '--gradient-angle': '360deg' },
        },
        'shine': {
          '0%': { transform: 'translateX(-100%) skewX(-15deg)' },
          '100%': { transform: 'translateX(200%) skewX(-15deg)' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0) translateX(0)' },
          '33%': { transform: 'translateY(-8px) translateX(4px)' },
          '66%': { transform: 'translateY(4px) translateX(-4px)' },
        },
        'glow-strong': {
          '0%, 100%': { opacity: '0.6', filter: 'blur(40px)' },
          '50%': { opacity: '0.9', filter: 'blur(50px)' },
        },
        spotlight: {
          '0%': { opacity: '0', transform: 'translate(-72%, -62%) scale(0.5)' },
          '100%': { opacity: '1', transform: 'translate(-50%, -40%) scale(1)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 2s infinite',
        'slide-in-from-top': 'slide-in-from-top 0.3s ease-out',
        'slide-in-from-bottom': 'slide-in-from-bottom 0.3s ease-out',
        'slide-in-from-left': 'slide-in-from-left 0.3s ease-out',
        'slide-in-from-right': 'slide-in-from-right 0.3s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'bounce-slow': 'bounce 2s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        'gradient-x': 'gradient-x 3s ease infinite',
        'gradient-rotate': 'gradient-rotate 4s linear infinite',
        'shine': 'shine 2s ease-in-out',
        'float-slow': 'float-slow 8s ease-in-out infinite',
        'glow-strong': 'glow-strong 4s ease-in-out infinite',
        spotlight: 'spotlight 2s ease 0.75s 1 forwards',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
        'mesh-gradient': 'radial-gradient(at 40% 20%, hsla(262, 83%, 58%, 0.3) 0px, transparent 50%), radial-gradient(at 80% 0%, hsla(189, 100%, 56%, 0.2) 0px, transparent 50%), radial-gradient(at 0% 50%, hsla(355, 100%, 93%, 0.2) 0px, transparent 50%), radial-gradient(at 80% 50%, hsla(340, 100%, 76%, 0.2) 0px, transparent 50%), radial-gradient(at 0% 100%, hsla(22, 100%, 77%, 0.2) 0px, transparent 50%), radial-gradient(at 80% 100%, hsla(242, 100%, 70%, 0.2) 0px, transparent 50%), radial-gradient(at 0% 0%, hsla(343, 100%, 76%, 0.2) 0px, transparent 50%)',
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        // Marka parıltısı preset'i izler (eski: sabit rgba(139,92,246)).
        glow: '0 0 20px hsl(var(--primary) / 0.35)',
        'glow-lg': '0 0 40px hsl(var(--primary) / 0.45)',
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
        'glass-lg': '0 8px 32px 0 rgba(31, 38, 135, 0.5)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
