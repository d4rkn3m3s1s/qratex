/**
 * "Liderlik tablosunda görün" tercihi (Ayarlar → Gizlilik) — HER sıralama yüzeyi için tek kaynak.
 *
 * Kök neden (müşteri API denetimi O5 kalıntısı): tercih yalnız lig tablosunda ve
 * /api/leaderboard'da uygulanıyordu; oyun liderliği, haftalık turnuva ve haftalık karakter
 * sıralaması kapatan kullanıcının adını (ve avatarını) diğer müşterilere göstermeye devam
 * ediyordu.
 *
 * Kural: tercih kapalıysa kullanıcı sıralamada SAYILIR (sıra numaraları ve ödül hakkı
 * değişmez — ödül/sıra hesabı tercihten bağımsızdır) ama başkalarına anonim görünür
 * ("Gizli oyuncu", avatar yok). Kullanıcı kendini her zaman kendi adıyla görür.
 *
 * Yalnız verilen kimlikler sorgulanır (`key IN (…)`, tablo taraması yok). Tercihler
 * okunamazsa HATA FIRLATIR: hangi adın gizli olduğu bilinmeden isim gösterilmez.
 */
import { prisma } from '@/lib/prisma';
import { userSettingsKey } from '@/lib/customer-settings/preferences';

export const HIDDEN_PLAYER_LABEL = 'Gizli oyuncu';

/** Verilen kullanıcılardan liderlikte görünmek İSTEMEYENLER. */
export async function leaderboardHiddenUserIds(userIds: readonly string[]): Promise<Set<string>> {
  const unique = [...new Set(userIds.filter((id) => typeof id === 'string' && id.length > 0))];
  if (unique.length === 0) return new Set();
  const keyToUser = new Map(unique.map((id) => [userSettingsKey(id), id]));
  const rows = await prisma.settings.findMany({
    where: {
      key: { in: [...keyToUser.keys()] },
      value: { path: ['preferences', 'showLeaderboard'], equals: false },
    },
    select: { key: true },
  });
  const hidden = new Set<string>();
  for (const row of rows) {
    const id = keyToUser.get(row.key);
    if (id) hidden.add(id);
  }
  return hidden;
}

/** Başkasına gösterilecek kimlik: gizliyse anonim etiket + avatar yok. */
export function leaderboardIdentity<T extends { name: string; image?: string | null }>(
  identity: T,
  opts: { hidden: boolean; isViewer: boolean }
): T {
  if (!opts.hidden || opts.isViewer) return identity;
  return { ...identity, name: HIDDEN_PLAYER_LABEL, ...('image' in identity ? { image: null } : {}) };
}
