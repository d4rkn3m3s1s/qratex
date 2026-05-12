# Panel tasarım dili (tek kaynak)

Tüm **dashboard** yüzeyleri (admin, bayi, müşteri) aynı görsel grameri paylaşır: tema token’ları (`globals.css` / `hsl(var(--*))`) ve ortak kabuk bileşenleri.

## Üst bölüm (sayfa kahramanı)

- **Standart kabuk:** `DashboardPageHero` veya özel içerik için `DashboardPageHeroChrome` (`@/components/layout/dashboard-page-hero`).
- **Eyebrow:** Panel bağlamı (`Yönetim paneli`, `Bayi paneli`, `Müşteri alanı` vb.) — kısa, tek satır.
- **Ton:** `tone="auto"` varsayılan; tek sayfada zorunlu koyu panel gerekiyorsa `tone="dark"`.

Sayfa başlığı + açıklama + aksiyonlar için ayrı “gradient şerit” veya çift gölge katmanı üretmeyin; kabuk zaten atmosfer ve kenarlık sağlar.

## Yüzeyler

- Kartlar: `Card` + `border-border` / `bg-card`; sayfa yerel tek-off renk gradyanları yerine mümkün olduğunca token ve `primary` vurgusu.

## Ne eklemiyoruz

- Rol başına farklı hero CSS’i (ör. yalnızca bayide Spotlight şeridi).
- Token dışı kalıcı hex paletleri bu dokümanda tanımlanmaz; tema `globals.css` üzerinden gelir.

## Uygulama durumu (örnekler)

- Admin ana dashboard kahramanı: müşteri ana sayfadakiyle aynı kab (`DashboardPageHeroChrome` + Spotlight + `FloatingOrbs`). Sağ sütun: renkli gradient çerçeve yerine sade **`Card`** içinde **Anlık özet** satırları (ikon + değer + trend).
- `DashboardPageHero`: bayi — QR, Copilot, ROI, Benchmark, Isı haritası, VoC duvarı, churn riski, ayarlar, tarama, geri bildirimler, AI ayarları, analitik, ürünler; müşteri — kampanyalar, telafi, davet, tüketim geçmişi, yolculuk skoru, AI analizler (boş + dolu başlık).
- Bayi **AI İçgörüler** (veri var): üst şerit `DashboardPageHeroChrome` + tema uyumlu dönem seçimi / skor kartı / aksiyonlar; parçacık efekti kaldırıldı.
- Müşteri **Bağış**, **Görevler** günlük özet bandı, **Rozet** istatistik bandı: `DashboardPageHero` / `DashboardPageHeroChrome` ile hizalandı.
- Bayi **Analitik** sayfası alt CTA (AI İçgörüler): mor gradient + parçacık yerine `DashboardPageHeroChrome`.
- Müşteri **Ödül Mağazası** puan özeti bandı ve **QR Tara** kamera kartı: `DashboardPageHeroChrome`.
- Bayi **QR kodları** önizleme diyaloğu başlığı: tema token’ları (`bg-muted/40`, `border-border`).
- **Müşteri** ve **bayi** ana sayfa üst bölümlerinde `GradientCTACard` kaldırıldı: puan / performans mini kartları `Card` + `border-border` (landing `CTASection` hariç, orada bileşen duruyor).
- Ek uyumlama: bayi **analitik** (Hızlı İçgörüler), **yorumlar** üst başlık, **QR kodları** diyalog/boş durum/indir düğmesi; müşteri **ana** haftalık görev bandı, **analizler** başarı kutuları; bayi **geri bildirimler** yanıt gönder — mor gradient yerine `border-border`, `bg-card`, `primary` vurgusu.
- Son tur: bayi **ayarlar** (profil şeridi, kaydet, avatar diyalog); bayi **AI ayarları** (istatistik kartları, öğrenme linki, kaydet); müşteri **liderlik** üst bandı; kart aktivasyon **`/c/[token]`** — arka plan `bg-background`, mor CTA’lar kaldırıldı.
- Bu tur: **admin AI öğrenme** (sistem kartı, eğit düğmesi); **bayi AI içgörüler** (özet / tahmin / öneri kartları, `text-primary`, öneri→primary); **bayi analitik** ısı haritası + QR ikonları; müşteri **bağış** (yükleniyor, etki başlığı, özet şeridi, Tümü filtresi, boş durumlar, eğitim kategorisi token’ları).
- Müşteri **AI içgörüler**, **referral**; bayi **Copilot**, **geri bildirimler** (istatistik kutuları `iconBox`/`iconColor`, AI yan panel, scrollbar): mor → `primary` / `border-border`.
- Marka ve tema tek kaynakları: `@/lib/brand-colors` (solid hex, e-posta / PWA `theme_color` ile uyumlu), `@/lib/theme-presets` (`THEME_COLOR_PRESETS`, admin tema kartları), `@/lib/hex-to-hsl` (CSS değişkenleri). Admin site ayarları varsayılan `primaryColor` marka primary ile hizalı; çok serili grafik renkleri `@/lib/chart-palette` (`CHART_BRAND` = `hsl(var(--primary))`).
