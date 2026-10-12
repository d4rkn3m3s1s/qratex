# Public + giriş animasyonları

Tek dosya: `app/public-anim.css` (kök layout'ta import edilir). **Sıfır yeni JS**: kaydırma girişleri ve okuma çubuğu CSS scroll-driven animasyonla çalışır (`animation-timeline: view()/scroll()`). Desteklemeyen tarayıcıda (Firefox, eski Safari) içerik hareketsiz ve tam görünür. Azaltılmış hareket hepsini kapatır, hem OS ayarı hem `html.reduce-animations`.

## LCP güvenliği (docs/quality/GATES.md)
- Hero'ya (`LandingHero`) dokunulmadı. `qx-reveal` yalnız `PublicSection` iç kabuğunda; landing, neden-qratex ve güven sayfalarında bu bölümler hep hero'nun altında, yani ekran dışında kalıyor.
- Başlık girişi (`qx-title-in`, `.qx-reading main h1`) **yalnız transform** kullanıyor. Opaklık animasyonu yok, LCP zamanı değişmiyor.
- IntersectionObserver bile gerekmedi: `view()` zaman çizelgesi ana iş parçacığını kullanmıyor.

## Neler eklendi
| Yer | Hareket | Dosya |
|---|---|---|
| Landing / neden-qratex / güven bölümleri | kaydırınca 28px yükselme, ölçek 0.985→1 ve opaklık (giriş aralığının %0–55'i) | `components/public/p-landing/section.tsx` |
| Blog, yasal sayfalar, neden-qratex, güven | 3px marka renginde okuma ilerleme çubuğu (`scroll(root)`), yazdırırken gizli | `app/(okuma)/layout.tsx`, iki public sayfa |
| Okuma ve public h1 | yaylı yükselme (transform) | CSS seçici ve `qx-title-in` |
| SSS (`<details>`) | `::details-content` yükseklik yayı (`linear()` spring) ve cevabın içeri kayması; `interpolate-size: allow-keywords` | `faq-list.tsx` → `qx-faq` |
| Kimlik kartı | adım geçişi: kart başlığı değişince içerik soldan yeniden giriyor (`stepKey`, varsayılanı başlık) | `components/auth/p-auth/auth-card.tsx` |
| Başarı ikonu | pop ve yeşil halka dalgası (`tone=success`) | aynı |
| **Zarf anı** | MailCheck ikonu yay çizerek uçuyor, ardından 3 kıvılcım; `send` sesi çalıyor | `moment="envelope"`: forgot-password gönderildi, verify-pending; magic/forgot sihirli bağlantı → `playSound('send')` |
| Hata | `AuthNotice tone=danger` tek seferlik titreşim; uyarı/hata ikon çipi titreşimi. Alan hatası zaten `qx-field` ile titriyordu | `auth-notice.tsx` |
| Şifre gücü | segment açıldıkça soldan dolma (yay) | `password-field.tsx` → `qx-strength-seg[data-on]` |
| QR hunisi `/feedback/[code]` | yıldız seçince seçilene kadar 45 ms arayla kaskad pop ve `tick` sesi. Gönderince `success`, seviye atlandıysa `celebration`. **success-panel değişmedi** | `feedback-funnel.tsx` (`qx-star-cascade`, data-pop a/b ile yeniden tetik) |
| 404 / 500 / bakım | sakin QR karakteri: 5.5 s süzülme, gölge nefesi, göz kırpma; 404'te "?", 500'de kıvılcım, bakımda dönen dişli | `components/public/calm-illustration.tsx` |
| Offline | zaten kendi gömülü CSS'inde dalga animasyonu var (SW önbelleği için bağımsız). Değiştirilmedi | — |

## Bilinçli sınırlar
- `global-error.tsx` kök layout CSS'ini garanti etmediği için dokunulmadı.
- SSS yayı yalnız Chromium 131+ sürümünde çalışıyor. Diğer tarayıcılarda anında açılıp kapanıyor, içerik görünür kalıyor (`@supports not selector(::details-content)`).
- `stepKey` başlık değişince kart gövdesini yeniden bağlıyor. Aynı başlık altında form durumu korunuyor.
