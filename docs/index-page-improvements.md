# Ana Sayfa (Index) Geliştirme Önerileri

Bu belge, `app/(public)/page.tsx` ve `home-client.tsx` tabanlı ana sayfa için performans, SEO, UX ve bakım kolaylığı odaklı önerileri içerir.

---

## 1. Performans

### 1.1 Loading state
- **Öneri:** `app/(public)/loading.tsx` ekleyin. Sayfa server’da hazırlanırken skeleton veya marka logosu gösterin; böylece boş beyaz ekran yerine anlamlı bir yükleme deneyimi olur.
- **Örnek:** Hero benzeri basit bir skeleton (başlık + iki buton placeholder + stats grid).

### 1.2 Arka plan ayarını server’dan geçirin
- **Durum:** `HomeClient` mount’ta `/api/settings/background` çağırıyor; bu hem ekstra istek hem de ilk render’da “original” sonra efekt değişimi (flash) yapabiliyor.
- **Öneri:** Ana sayfa server component’ında `backgroundEffect` değerini (örn. `getSeoSettings` veya ayrı bir helper ile) okuyup props ile `HomeClient`’a geçirin. İsteği sadece layout veya başka sayfalarda gerekirse client’ta kullanın.
- **Alternatif:** Aynı API’yi `layout.tsx` içinde server’da çağırıp context veya cookie ile client’a iletmek.

### 1.3 Ağır animasyonları sınırlayın
- **Durum:** Orbs, kar taneleri ve sparkle animasyonları `reduced-motion` ile kapatılıyor (iyi). Ancak düşük performanslı cihazlarda hâlâ ağır olabilir.
- **Öneri:** `navigator.hardwareConcurrency` veya `matchMedia('(prefers-reduced-data)')` ile basit bir “lite” modu (örn. orb/snow sayısını yarıya indirme) ekleyebilirsiniz. Öncelik düşük; reduced-motion yeterli olabilir.

### 1.4 Content-visibility ve lazy section ✅ Yapıldı
- **Durum:** Bölümlerde `[content-visibility:auto]` kullanılmış (iyi).
- **Yapılan:** “Demo”, “Nasıl Çalışır”, “Testimonials”, “Pricing”, “FAQ” bölümleri `components/landing/` altında ayrı bileşenlere taşındı ve `next/dynamic` ile lazy yükleniyor (`ssr: true` ile SEO korunuyor). İçerik verileri `lib/landing-content.ts` ve `lib/faq-content.ts` üzerinden paylaşılıyor.

---

## 2. SEO

### 2.1 Sayfa bazlı metadata
- **Durum:** Metadata şu an sadece root `layout.tsx` içinde `generateMetadata` ile geliyor.
- **Öneri:** `app/(public)/page.tsx` içinde `generateMetadata` export edin; ana sayfa için `title`, `description` ve gerekirse `openGraph`/`alternates.canonical` override’ları tanımlayın. Böylece admin’den gelen sayfa özel SEO ayarları (varsa) ana sayfaya da uygulanabilir.

### 2.2 BreadcrumbList JSON-LD
- **Öneri:** Ana sayfa için `BreadcrumbList` schema ekleyin: `Ana Sayfa` tek eleman. Özellikle iç sayfalarda breadcrumb kullanıyorsanız yapı tutarlı olur.

### 2.3 FAQ genişletme
- **Durum:** `FAQ_ITEMS` ile FAQ schema zaten veriliyor.
- **Öneri:** Admin panelinde “SSS” yönetimi varsa, ana sayfa FAQ’sını buradan besleyin; yoksa en azından `FAQ_ITEMS`’ı tek bir `lib/faq-content.ts` dosyasında tutmaya devam edin (şu anki gibi).

---

## 3. Kullanıcı Deneyimi (UX)

### 3.1 Demo bölümü
- **Durum:** Demo alanında “Demo video veya canlı önizleme burada yer alabilir” placeholder’ı var; `NEXT_PUBLIC_DEMO_VIDEO_URL` sadece JSON-LD’de kullanılıyor.
- **Öneri:** `NEXT_PUBLIC_DEMO_VIDEO_URL` tanımlıysa aynı bölümde gerçek video embed’i (iframe veya `<video>`) gösterin; yoksa mevcut placeholder ve “Özellikleri İncele” butonu kalsın.

### 3.2 İstatistikler (10K+, 500+, 1M+, 4.9)
- **Durum:** Değerler sabit.
- **Öneri:** Admin veya public bir API’den (örn. `/api/stats` veya mevcut bir dashboard API’sinden türetilmiş) gerçek/approximate sayıları alıp cache’li (ISR) gösterin. Düşük öncelik; “trust” için statik de kabul edilebilir.

### 3.3 Müşteri yorumları
- **Durum:** Testimonials sabit dizide.
- **Öneri:** İleride CMS veya admin’den yönetilebilir hale getirirseniz, ana sayfada bu kaynaktan çekin. Şimdilik sabit veri yapısı da uygun.

### 3.4 CTA ve e-posta
- **Durum:** “Satış ile Görüşün” → `mailto:info@qratex.com`.
- **Öneri:** İletişim sayfası veya “Demo talep et” formu eklerseniz, bu butonu o sayfaya yönlendirebilirsiniz; mailto yedek olarak kalabilir.

---

## 4. Erişilebilirlik

### 4.1 Scroll göstergesi
- **Öneri:** Aşağı kaydırma ikonuna `aria-hidden="true"` ekleyin (dekoratif). Gerekirse “İçeriğe kaydır” gibi bir buton ekleyip `#features` veya bir sonraki bölüme focus ile gitmeyi sağlayın.

### 4.2 Video (Demo)
- **Öneri:** Video eklendiğinde `title`, `aria-label` ve altyazı (captions) desteği ekleyin.

---

## 5. Kod Yapısı ve Bakım

### 5.1 Bölümleri ayırma
- **Durum:** `home-client.tsx` tek dosyada hero, features, demo, how-it-works, testimonials, pricing, FAQ, CTA içeriyor.
- **Öneri:** Her bölümü `app/(public)/_sections/` veya `components/landing/` altında ayrı dosyaya taşıyın (örn. `HeroSection`, `FeaturesSection`, `PricingSection`). Ana sayfa bunları import edip sıralasın. Test yazmak ve tek tek lazy load etmek kolaylaşır.

### 5.2 Sabit içeriği config’e taşıma
- **Öneri:** `features`, `pricingPlans`, `testimonials` listelerini `lib/landing-content.ts` veya `lib/site-config.ts` içine alın. İleride CMS/API ile değiştirmek daha kolay olur.

### 5.3 Hata sınırı
- **Öneri:** Ana sayfa için `error.tsx` (route segment) kullanıyorsanız, kullanıcıya “Bir şeyler yanlış gitti” mesajı ve “Yenile” / “Ana sayfaya dön” aksiyonları sunun. Root `error.tsx` varsa ona da bu mesajları ekleyebilirsiniz.

---

## 6. Kısa Özet (Öncelik Sırası)

| Öncelik | Öneri |
|--------|--------|
| Yüksek | Demo bölümünde `NEXT_PUBLIC_DEMO_VIDEO_URL` varsa gerçek video göstermek |
| Yüksek | `(public)/loading.tsx` eklemek |
| Orta | Arka plan ayarını server’dan alıp client’a props ile vermek |
| Orta | Ana sayfa için `generateMetadata` (ve gerekirse FAQ/breadcrumb schema) |
| Orta | Bölümleri ayrı component’lara bölmek |
| Düşük | İstatistikleri API’den beslemek |
| Düşük | Testimonials’ı CMS/admin’den yönetmek |
| Düşük | Ağır cihazlar için “lite” animasyon modu |

Bu önerileri adım adım uygulayarak ana sayfanın performansını, SEO’sunu ve sürdürülebilirliğini artırabilirsiniz.
