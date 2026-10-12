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

## 2026-10 — Aile zenginleştirmesi (premium katman)

### Motor eklentileri (`lib/sound/index.ts`)
- **Yumuşak atak** (`attack`, adım başına; varsayılan 8 ms): tıklama "çıtırtısı" yerine kısa şişme.
- **Stereo genişlik** (`pan`, ±0.1–0.4, `StereoPannerNode`): harmonik katmanlar hafif sağ/sola açılır; mono'da hiçbir şey kaybolmaz.
- **FM sentez** (`fm: { ratio, index }`): modülatör sapması sönümle birlikte %5'e iner → başta cam/çan "ting", sonra saf sinüs. Oranlar: 2 (oktav, sıcak), 3.5 (çan), 1.5 (yumuşak tahta).
- **Koro** (`detune`, ±5–7 cent iki katman): reward, rank-up, celebration'da geniş, "pahalı" tını.
- **Oda yankısı**: ana zincirde tek `ConvolverNode`; IR dosya değil, kodla üretilen 0.45 s stereo üstel gürültü (`makeRoomIR`, kanallar bağımsız → doğal genişlik), 5.2 kHz lowpass. Tarif başına gönderim (`reverb`, varsayılan 0.08; `tick` 0, `celebration` 0.22).
- **Gürültü filtre süpürmesi**: `noise` adımında `freqEnd` artık bandpass merkezini kaydırır (swipe, send, delete-soft, sheet).

### Tonal aile
Tüm tonal adımlar **C majör pentatonik** (C D E G A) üzerinde — yeni 16 ses için jest testi bunu frekans→MIDI ile doğrular. Pozitif = yukarı, negatif/kapanış = aşağı (ayna çiftleri testli: toggle-on/off, open/close-sheet).

### Yeni adlar
| Ad | Karakter | Takma ad |
|---|---|---|
| like | FM "bloop" G5→C6 + oktav parıltı | heart, favorite |
| copy | tahta tık + E6 cam | — |
| send | yükselen hava + C5→G5 | message-sent |
| receive-message | FM çan A5→E5 | message |
| swipe | filtre süpürmeli hışırtı | — |
| unlock | mekanik tık + G5→D6 | — |
| streak | E–G–A basamak + alt oktav | — |
| rank-up | G4–D5–G5 koro | — |
| purchase | alçak dokunuş + G6 çan | redeem |
| delete-soft | inen hışırtı + G4→E4 | remove |
| open-sheet / close-sheet | hava + E5↔A5 | sheet-open / sheet-close |
| toggle-on / toggle-off | tık + G5↔C6 | — |
| scan-success | C6 + G6 cam çan | qr-scan |
| celebration | C-E-G-A arpej → C6 koro + C4 taban + parıltı (≤1.2 s, tek uzun ses, 2.5 s spam aralığı) | confetti, big-win |

Mevcut sesler de cilalandı: tap (minik gürültü tık katmanı), toggle (oktav gölgesi), success (stereo + FM), coin (çan FM), reward (koro), error (yumuşak atak + soluk üst katman), notify (FM çan).

### Bütçe (testli)
Kısa sesler ≤ 600 ms, `celebration` ≤ 1.2 s; adım kazancı ≤ 0.4; |pan| ≤ 0.5; FM index ≤ 1; detune ≤ 12 cent; yankı ≤ 0.3.

### Kaynaklar
- UI ses ilkeleri (kısa, ortak "ses", yukarı=olumlu): https://violetrecording.com/how-to-design-ui-sounds/
- Web Audio UI ses tarifleri (pop 30–80 ms, FM çan bildirimleri, jest kilidi): https://cdn.jsdelivr.net/gh/dannyjpwilliams/ui-sound-design-skill@main/README.md
- Tek parametre setinden tutarlı kit üretimi: https://vi-control.net/community/threads/exploring-procedural-generation-of-coherent-ui-sound-kits-web-audio-api-pure-synthesis-feedback-welcome.170143/
- ConvolverNode (1/2/4 kanal IR): https://developer.mozilla.org/docs/Web/API/ConvolverNode
- Stil referansı (dinleme): Raycast/Linear (az ve kuru), Apple (cam çanlar), Nintendo Switch menü (kısa tahta tık), Duolingo (yalnız büyük anlarda zengin arpej → `celebration`).

Harici dosya kullanılmadı; `public/sounds/LICENSES.md` değişmedi.
