'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Adres çubuğundaki tek kullanımlık gizli değeri (şifre sıfırlama / magic link / doğrulama
 * `token`'ı) BİR KEZ okur ve `history.replaceState` ile URL'den siler (P0-31).
 *
 * Neden: token URL'de kaldıkça tarayıcı geçmişine, ekran görüntülerine, oturum kaydına,
 * `Referer` başlığına ve analitik olaylarına sızar. Değer bileşen durumunda tutulduğu için
 * sayfa akışı (form gönderimi, otomatik doğrulama) URL temizlendikten sonra da çalışır.
 * İlk render sunucuyla aynı değeri kullanır (hidrasyon uyumsuzluğu yok).
 */
export function useUrlSecret(name = 'token'): string {
  const searchParams = useSearchParams();
  const fromUrl = searchParams?.get(name) ?? '';
  const [captured, setCaptured] = useState(fromUrl);

  useEffect(() => {
    if (!fromUrl) return;
    setCaptured(fromUrl);
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has(name)) return;
      url.searchParams.delete(name);
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, '', next);
    } catch {
      /* eski tarayıcı — redaksiyon yine before_send katmanında */
    }
  }, [fromUrl, name]);

  return fromUrl || captured;
}
