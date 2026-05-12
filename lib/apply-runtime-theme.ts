import { hexToHSL } from '@/lib/hex-to-hsl';

/** API ve preset’ten gelen hex → `:root` CSS değişkenleri */
export type RuntimeThemeHex = {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  foreground?: string;
  mode?: 'light' | 'dark';
};

function setVar(root: HTMLElement, name: string, value?: string) {
  if (value) root.style.setProperty(name, value);
  else root.style.removeProperty(name);
}

function getThemeTargets(root: HTMLElement): HTMLElement[] {
  const targets = [root];
  if (typeof document !== 'undefined' && root === document.documentElement && document.body) {
    targets.push(document.body);
  }
  return targets;
}

function contrastTextHsl(mode: 'light' | 'dark'): string {
  return mode === 'dark' ? '0 0% 100%' : '240 10% 10%';
}

/**
 * Hex tema renklerini belge köküne uygular (`providers`, tema hook, admin sayfası).
 */
export function applyRuntimeThemeToRoot(
  colors: RuntimeThemeHex,
  root: HTMLElement = document.documentElement
): void {
  const targets = getThemeTargets(root);
  const mode = colors.mode ?? (root.classList.contains('dark') ? 'dark' : 'light');
  const isDark = mode === 'dark';

  if (colors.primary) {
    const primaryHSL = hexToHSL(colors.primary);
    for (const target of targets) {
      setVar(target, '--primary', primaryHSL);
      setVar(target, '--ring', primaryHSL);
      setVar(target, '--gradient-from', primaryHSL);
      setVar(target, '--primary-foreground', isDark ? '0 0% 100%' : '0 0% 100%');
    }
  } else {
    for (const target of targets) {
      setVar(target, '--primary');
      setVar(target, '--ring');
      setVar(target, '--gradient-from');
      setVar(target, '--primary-foreground');
    }
  }

  if (colors.secondary) {
    const secondaryHSL = hexToHSL(colors.secondary);
    for (const target of targets) {
      setVar(target, '--secondary', secondaryHSL);
      setVar(target, '--gradient-to', secondaryHSL);
      setVar(target, '--sidebar-accent', secondaryHSL);
      setVar(target, '--secondary-foreground', contrastTextHsl(mode));
    }
  } else {
    for (const target of targets) {
      setVar(target, '--secondary');
      setVar(target, '--gradient-to');
      setVar(target, '--sidebar-accent');
      setVar(target, '--secondary-foreground');
    }
  }

  if (colors.accent) {
    for (const target of targets) {
      setVar(target, '--accent', hexToHSL(colors.accent));
      setVar(target, '--accent-foreground', contrastTextHsl(mode));
    }
  } else {
    for (const target of targets) {
      setVar(target, '--accent');
      setVar(target, '--accent-foreground');
    }
  }

  if (colors.background) {
    const bgHsl = hexToHSL(colors.background);
    for (const target of targets) {
      setVar(target, '--background', bgHsl);
      // Cards/popovers follow background for cohesive full-theme application.
      setVar(target, '--card', bgHsl);
      setVar(target, '--popover', bgHsl);
      setVar(target, '--muted', isDark ? '217 19% 14%' : '240 5% 94%');
      setVar(target, '--border', isDark ? '217 19% 16%' : '240 6% 88%');
      setVar(target, '--input', isDark ? '217 19% 16%' : '240 6% 88%');
      setVar(target, '--glass-bg', isDark ? '222 35% 10%' : '0 0% 100%');
      setVar(target, '--glass-border', isDark ? '217 19% 22%' : '0 0% 90%');
    }
  } else {
    for (const target of targets) {
      setVar(target, '--background');
      setVar(target, '--card');
      setVar(target, '--popover');
      setVar(target, '--muted');
      setVar(target, '--border');
      setVar(target, '--input');
      setVar(target, '--glass-bg');
      setVar(target, '--glass-border');
    }
  }

  if (colors.foreground) {
    const fgHsl = hexToHSL(colors.foreground);
    for (const target of targets) {
      setVar(target, '--foreground', fgHsl);
      setVar(target, '--card-foreground', fgHsl);
      setVar(target, '--popover-foreground', fgHsl);
      setVar(target, '--muted-foreground', isDark ? '215 16% 68%' : '240 5% 45%');
    }
  } else {
    for (const target of targets) {
      setVar(target, '--foreground');
      setVar(target, '--card-foreground');
      setVar(target, '--popover-foreground');
      setVar(target, '--muted-foreground');
    }
  }
}
