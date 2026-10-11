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
        // `text-primary` (650+ kullanım) da metin rolüne: koyu temada marka dolgusu metin
        // olarak 3,49:1 idi; `--brand-text` her temada (preset dahil) ≥ 4.5:1 türetilir.
        // `text-primary-foreground` dolgu üstü metin olarak aynen kalır (derin birleştirme).
        primary: { DEFAULT: role('brand-text') },
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
        floating: 'var(--z-floating)',
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
      // Yalnız KULLANILAN proje animasyonları. Kural: Tailwind çekirdeği (`pulse`, `bounce`,
      // `spin`, `ping`) ve tailwindcss-animate (`enter`, `exit`, `fade-in-*`, `slide-in-*`)
      // adlarını yeniden tanımlama (tasarım raporu K1 / O2). Kullanılmayan 14 animasyon
      // (slide-in-from-*, fade-in, scale-in, float, gradient-x, shine, glow-strong…) kaldırıldı.
      // `shimmer` keyframe'i globals.css'te tek tanım.
      keyframes: {
        // Marka parıltısı preset'i izler (eski: sabit rgba(139,92,246)). Yalnız play (GlowCard).
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px hsl(var(--primary) / 0.3)' },
          '50%': { boxShadow: '0 0 40px hsl(var(--primary) / 0.6)' },
        },
        // Küçük dekoratif sekme (çekirdek `bounce` eleman yüksekliğinin %25'i; bu sabit 10px).
        bob: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        spotlight: {
          '0%': { opacity: '0', transform: 'translate(-72%, -62%) scale(0.5)' },
          '100%': { opacity: '1', transform: 'translate(-50%, -40%) scale(1)' },
        },
      },
      animation: {
        shimmer: 'shimmer 2s infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        bob: 'bob 1s ease-in-out infinite',
        spotlight: 'spotlight 2s ease 0.75s 1 forwards',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      boxShadow: {
        // Marka parıltısı preset'i izler (eski: sabit rgba(139,92,246)). Yalnız play kaydı.
        glow: '0 0 20px hsl(var(--primary) / 0.35)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
