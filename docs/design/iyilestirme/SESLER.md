# Arayüz sesleri

## Ne yapıldı
- **Motor:** `lib/sound/` → `playSound(name)` tek API. Web Audio ile prosedürel sentez kullanıyor; dosya yok, lisans riski sıfır, 0 KB.
  - `recipes.ts` bütün aileyi tanımlıyor: C majör pentatonik, yumuşak sinüs/üçgen dalga, hızlı atak ve üstel sönüm, her ses ≤600 ms.
  - Ana zincir: lowpass 9 kHz ve kompresör. Hiçbir ses sert duyulmuyor.
  - `prefs.ts` kapsamı URL'den çıkarıyor: müşteri tarafında varsayılan **AÇIK** (seviye 0.35), bayi ve admin tarafında **KAPALI**. Tercih kapsam başına localStorage'da (`qratex-sound:<kapsam>`) tutuluyor.
  - `gate.ts`: her ses için bir minimum aralık var (spam koruması) ve aynı anda en fazla 4 ses çalabiliyor.
  - AudioContext tembel açılıyor. Kullanıcının ilk pointerdown/keydown/touchend olayında sessiz bir buffer çalınıp bağlam resume ediliyor (iOS ve Capacitor WKWebView için). Uygulama arka plandan dönünce yeniden resume ediliyor. Ses kapalıysa bağlam hiç açılmıyor.
  - Haptik: uygulamada Capacitor Haptics eklentisi varsa (`window.Capacitor.Plugins.Haptics`) o kullanılıyor, yoksa `navigator.vibrate`. Haptik de aynı anahtara bağlı. Not: `@capacitor/haptics` paketi kurulu değil; kurulursa kod değişikliği gerekmeden devreye girer.
- **Sesler:** tap, toggle, success (yumuşak çift ton), coin (parlak kısa), reward (arpej ve parıltı), error (kibar, alçak), notify, flip, tick.
- **Takma adlar:** points→coin, task-complete/thanks→success, badge/level-up/box-open→reward, open/close→toggle.
- **Ayar:** "Arayüz sesleri" anahtarı ve seviye kaydırıcısı `components/settings/sound-toggle.tsx` içinde. Görüldüğü yerler:
  - Müşteri: Ben → Ayarlar → Görünüm/Erişilebilirlik
  - Bayi: hesap sekmesi
  - Admin: kapı ayarları → güvenlik (`AccessibilityToggles` üzerinden)
  - Ayar değişince bir önizleme sesi çalıyor.

## Nereye bağlı
| An | Ses |
|---|---|
| Toast başarı / hata (tüm uygulama) | success / error, tek noktadan: `components/sound/toast-sound-bridge.tsx` (useSonner) |
| An Motoru: puan kapsülü, seviye, lig, rozet sahneleri | coin / reward (`lib/moments/effects.ts` `sound()` artık lib/sound'a yönleniyor; azaltılmış hareket kuralı korunuyor) |
| Çark | tık → tick, kazanç → coin, büyük ödül → reward |
| Sürpriz kutu açılışı | reward |
| Karakter rozeti açılışı ve kartı | reward |
| Geri bildirim gönderildi | success |
| Görev ödülü | puan kapsülü (coin) veya yedek toast (success) |

Bilinçli olarak ses konmayan yerler: sıradan buton tıklamaları, sekmeler ve sık tekrar eden etkileşimler. Oyunlar kendi `lib/game-sounds` seslerini kullanmaya devam ediyor.

## İleride
- Tercihi profil ayarına (DB) yazmak. Şu an yalnız cihazda tutuluyor.
- ElevenLabs Sound Effects API ile özel bir aile üretmek (anahtar gerekiyor).
- `lib/game-sounds` için de kullanıcı tercihine bağlanmak.

## Araştırma notları
- **Kenney:** CC0, atıf isteğe bağlı. Yedek seçenek.
- **ZapSplat:** atıf zorunlu ve yeniden dağıtım kısıtlı, PWA için uygun değil.
- **Material:** seslerin lisansı doğrulanamadı.
- **Tarz:** Raycast, Linear ve Apple tarzında az, kısa, tonal ve düşük seviyeli sesler; yalnız anlamlı anlarda çalıyor. Duolingo tarzı zengin "ödül" sesi yalnız `reward` için kullanılıyor.
