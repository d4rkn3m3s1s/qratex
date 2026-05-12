import 'server-only';

import { revalidateTag } from 'next/cache';
import { PUBLIC_THEME_SETTINGS_CACHE_TAG } from '@/lib/theme-settings-keys';

/** Admin tema / `settings` güncellemesinden sonra public tema önbelleğini boşalt. */
export function revalidatePublicThemeSettings(): void {
  revalidateTag(PUBLIC_THEME_SETTINGS_CACHE_TAG, 'max');
}
