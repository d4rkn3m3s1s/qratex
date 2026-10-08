# /kvkk-aydinlatma-metni

**Amaç:** 6698 sayılı KVKK md. 10 kapsamındaki aydınlatma yükümlülüğünü yerine getirmek. QR okutup geri bildirim veren, puan/XP/rozet kazanan, oyun oynayan tüketiciye hangi verisinin, hangi amaçla ve hangi hukuki sebeple işlendiğini, kime aktarıldığını ve haklarını nasıl kullanacağını anlatan yasal sayfa.

**Genel puan:** 3.5 / 10

**Karar:** yeniden inşa. SEO, breadcrumb ve layout kabuğu çalışıyor. Asıl değer olan hukuki içerik ise hem eksik (zorunlu başlıkların yarısı yok) hem de yanıltıcı ("Son güncelleme" tarihi her render'da bugünü gösteriyor). İçerik ve veri modeli baştan kurulmalı.

> Not: Bu rapor bir mühendislik ve ürün denetimidir, hukuki görüş değildir. Hukuki kapsamla ilgili tespitler kod ve şemadan doğrulanmış veri işleme faaliyetlerine dayanır. Nihai metin bir KVKK hukuk danışmanı tarafından onaylanmalıdır.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Sayfa render ediliyor ama işlevi yasal bilgilendirme. Veri sorumlusu kimliği, hukuki sebep, toplama yöntemi, alıcı grupları, yurt dışı aktarım ve md. 11'in 8 hakkının 4'ü yok. Tarih de yanlış. |
| UX | 3/10 | Tek kartta 6 kısa paragraf var. İçindekiler, başlık hiyerarşisi ve "hakkımı şimdi kullan" aksiyonu yok. Ayarlar'daki veri indirme/hesap silme özelliklerine bağlantı da yok. |
| Görsel | 3/10 | Varsayılan shadcn `Card` içinde `text-sm text-muted-foreground` düz metin var. 1400px konteynerde satırlar ~200 karaktere uzuyor. Marka dili ve diğer müşteri yüzeyleriyle bağ yok. |
| Mimari | 4/10 | Hukuki metin TSX içine gömülü. Sürümleme, yürürlük tarihi ve kabul kaydı yok. 4 yasal sayfa birbirinin kopyası. Admin yalnız SEO başlığını değiştirebiliyor, görünen başlığı değiştiremiyor. |
| Performans | 8/10 | Server Component, istemci JS'i yalnızca layout'tan geliyor. SEO ayarı `unstable_cache` + React `cache` ile istek başına tek sorgu (lib/seo-settings.ts:117-130). |
| Erişilebilirlik + mobil | 5/10 | Skip-link, breadcrumb `aria-current` ve azaltılmış hareket desteği var. Sayfada `h1` yok (CardTitle `h3`), e-posta tıklanamıyor ve satır uzunluğu okunabilirlik sınırını çok aşıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | `<title>` / meta description (admin override destekli) | ÇALIŞIYOR | app/(public)/kvkk-aydinlatma-metni/page.tsx:8-17 | `getPageSeo` override'ı varsa onu, yoksa sabit metni kullanıyor. |
| 2 | Canonical URL | ÇALIŞIYOR | page.tsx:15; lib/seo-settings.ts:145-147 | `canonicalBase` boşsa `siteUrl`'e düşüyor. |
| 3 | WebPage JSON-LD | ÇALIŞIYOR | page.tsx:27; components/seo/webpage-json-ld.tsx:9-23 | `sanitizeSeoString` ile HTML etiketleri temizleniyor. |
| 4 | BreadcrumbList JSON-LD | ÇALIŞIYOR | page.tsx:28; components/seo/breadcrumb-json-ld.tsx:8-26 | |
| 5 | Görsel breadcrumb navigasyonu | ÇALIŞIYOR | page.tsx:30; components/seo/breadcrumb-nav.tsx:13-33 | `aria-label`, `aria-current="page"` ve focus ring var. |
| 6 | Sayfa başlığı | KISMİ | page.tsx:33; components/ui/card.tsx:40-52 | `CardTitle` bir `h3`. Sayfada `h1` yok. Başlık sabit kodlu, admin override (page.tsx:23) yalnız JSON-LD'ye gidiyor. |
| 7 | Veri sorumlusunun kimliği | KISMİ | page.tsx:36-39 | Yalnızca "QRateX" yazıyor. Ticari unvan, adres, MERSİS ve VERBİS kaydı yok. |
| 8 | İşlenen veri kategorileri | KISMİ | page.tsx:40-43 | 4 genel kategori var. Şemada işlenen doğum tarihi (prisma/schema.prisma:1903-1906), telefon (:35), konum (customer/nearby, `navigator.geolocation` app/customer/nearby/page.tsx:119), geri bildirim fotoğrafı, IP/UA (:1114-1115, :1928-1929), push aboneliği (:1969) ve şüpheli aktivite/fraud kayıtları (:1919-1929) ayrıca sayılmamış. |
| 9 | İşleme amaçları | KISMİ | page.tsx:44-47 | Oyunlaştırma, puan/ödül, kişiselleştirme, AI analizi (rozet kategorisi, AI içgörü) ve fraud tespiti amaçları açıkça yazılmamış. |
| 10 | Hukuki sebepler (KVKK md. 5/6) | EKSİK | page.tsx tamamı | Hangi verinin hangi hukuki sebebe (sözleşme, meşru menfaat, açık rıza) dayandığı yazılmamış. |
| 11 | Toplama yöntemi | EKSİK | page.tsx tamamı | QR okutma formu, kayıt formu, çerez/analitik ve otomatik loglar belirtilmemiş. |
| 12 | Aktarım (alıcı grupları + yurt dışı) | KISMİ | page.tsx:48-51 | Tek cümle: "sınırlı şekilde aktarılır". Gerçekte kullanılan işleyenler: Groq/OpenAI uyumlu AI (lib/ai-engine.ts:14,44-45), Sentry, PostHog (components/analytics/posthog-provider.tsx), Vercel Analytics/Speed Insights, Upstash Redis, S3 uyumlu R2, Resend/nodemailer, Stripe (package.json). Yurt dışı aktarım beyanı yok. |
| 13 | İlgili kişi hakları (md. 11) | KISMİ | page.tsx:52-55 | 8 haktan 4'ü sayılmış (erişim, düzeltme, silme, itiraz). Eksik olanlar: işlenip işlenmediğini öğrenme, amaca uygunluk, aktarılan üçüncü kişileri bilme, otomatik analizle aleyhe sonuca itiraz, zararın giderilmesi. |
| 14 | Başvuru kanalı | KISMİ | page.tsx:56-58 | `info@qratex.com` düz metin, `mailto` yok. Uygulama içi başvuru API'si (app/api/customer/privacy-request/route.ts) varken sayfadan bağlantı yok. Config'teki KVKK adresi ise `kvkk@example.com` (lib/innovation-config.ts:76) ve tutarsız. |
| 15 | "Son güncelleme" tarihi | BOZUK | page.tsx:59 | `new Date()` render/ISR anını basıyor. Metnin gerçek yürürlük tarihini değil, "bugünü" gösteriyor. |
| 16 | Saklama süreleri | EKSİK | page.tsx tamamı | Hiçbir veri kategorisi için saklama/imha süresi yok. |
| 17 | Uygulama içi hak kullanımı (veri indir / hesap sil / başvuru) | EKSİK | page.tsx tamamı; app/customer/settings/page.tsx:451-495,1055-1105 | Ayarlar'da veri indirme ve hesap silme çalışıyor ama bu sayfadan bağlantı yok. Başvuru API'sinin hiçbir istemci çağıranı yok (grep: yalnız app/admin/compliance/page.tsx:271 metin içinde anıyor). |
| 18 | Sürüm geçmişi / değişiklik bildirimi | EKSİK | page.tsx tamamı; şemada LegalDocument benzeri model yok | |
| 19 | İçindekiler / bölüm çapaları | EKSİK | page.tsx:35-60 | Tek blok metin. |
| 20 | İngilizce sürüm | EKSİK | page.tsx tamamı (sabit TR); app/(public)/feedback/[code]/page.tsx:14-15 TR/EN destekliyor | EN arayüzle geri bildirim veren kullanıcı TR yasal metne düşüyor. |
| 21 | Yazdır / PDF olarak indir | EKSİK | page.tsx tamamı | Kurumsal başvurularda sıkça istenir. |
| 22 | Açık rıza metinlerinin ayrı sunumu | EKSİK | page.tsx tamamı; app/(auth)/auth/register/page.tsx:428-442 | Aydınlatma ile rızanın ayrıştırılması gerekir. Kayıtta rıza kutusu/kaydı yok, yalnız şartlar ve gizlilik bağlantısı var. |
| 23 | Toplama anında erişim: kayıt formu | EKSİK | app/(auth)/auth/register/page.tsx:428-442 | Kayıt ekranı Kullanım Şartları ve Gizlilik'e bağlantı veriyor, KVKK Aydınlatma'ya vermiyor. |
| 24 | Toplama anında erişim: QR geri bildirim formu | EKSİK | app/(public)/feedback/[code]/page.tsx (grep `kvkk\|gizlilik\|privacy`: sonuç yok) | Verinin asıl toplandığı anda aydınlatmaya bağlantı yok. |
| 25 | Footer'dan erişim | ÇALIŞIYOR | components/layout/footer.tsx:31 | Ayrıca /guven (app/(public)/guven/page.tsx:84), /gizlilik-politikasi:51 ve /kullanim-sartlari:55 sayfalarından bağlantı var. |
| 26 | Sitemap kaydı | KISMİ | app/sitemap.ts:48-53 | Kayıt var ama `lastModified: new Date()` her üretimde değişiyor. Arama motoruna sahte "güncellendi" sinyali gidiyor. |
| 27 | Ortak layout (header, footer, skip-link, çerez bandı) | ÇALIŞIYOR | app/(public)/layout.tsx:15-32 | |
| 28 | Hareketli arka plan + azaltılmış hareket | ÇALIŞIYOR | components/landing/LandingBackground.tsx:34,51,79 | `prefers-reduced-motion` dinleniyor. Kart opak `bg-card` (components/ui/card.tsx:15), okunabilirlik korunuyor. |
| 29 | Okunabilir tipografi / satır uzunluğu | KISMİ | page.tsx:29,35; tailwind.config.ts:13-18 (2xl: 1400px) | `max-w-prose` yok. Geniş ekranda `text-sm` ile ~180-200 karakterlik satırlar oluşuyor. |

---

## Bulgular

### 1. "Son güncelleme" tarihi her render'da bugünü gösteriyor
- **Önem:** kritik · **Kategori:** veri doğruluğu / hukuki · **Efor:** S
- **Kanıt:** app/(public)/kvkk-aydinlatma-metni/page.tsx:59 `Son güncelleme: {new Date().toLocaleDateString('tr-TR')}`. Aynı kalıp gizlilik-politikasi/page.tsx:56, cerez-politikasi/page.tsx:56 ve kullanim-sartlari/page.tsx:60'ta da var. Sitemap'te de `lastModified: new Date()` (app/sitemap.ts:50).
- **Sorun:** Yasal metnin yürürlük tarihi, metin değişmese de build veya yeniden doğrulama anına kayıyor. Bir başvuru veya uyuşmazlıkta "hangi tarihli metni gördüm" sorusu cevapsız kalır. Kullanıcıya her gün güncelleniyormuş gibi yanlış bilgi verilir. Sayfanın tam statik mi, 60 sn ISR mı olduğu (`unstable_cache` revalidate: 60, lib/seo-settings.ts:118) çalıştırılarak doğrulanmadı. Her iki durumda da gösterilen tarih metnin gerçek tarihi değil.
- **Öneri:** Tarih içerikle birlikte sürümlenmeli. Kısa vadede metin sabitine `effectiveDate: '2026-..-..'` ve `version: '1.0'` eklenip sayfada ve sitemap'te bu değer kullanılmalı. Uzun vadede bulgu 4'teki `LegalDocument` modelinin `effectiveAt` alanından gelmeli. 4 yasal sayfanın hepsine aynı düzeltme uygulanmalı.

### 2. Aydınlatma içeriği yasal asgari başlıkları karşılamıyor
- **Önem:** kritik · **Kategori:** uyum / içerik · **Efor:** M (metin) + hukuk onayı
- **Kanıt:** page.tsx:36-58'de toplam 6 paragraf var. Eksikler:
  - veri sorumlusu kimliği (unvan, adres, MERSİS, VERBİS)
  - hukuki sebepler
  - toplama yöntemi
  - alıcı grupları
  - yurt dışı aktarım
  - saklama süreleri
  - md. 11'in 4 hakkı
- **Sorun:** Kod tabanı sayfanın anlattığından çok daha fazla veri işliyor:
  - Doğum tarihi (schema.prisma:1903-1906) ve telefon (:35)
  - Anlık konum (app/customer/nearby/page.tsx:119)
  - IP ve user-agent (AuditLog :1114-1115, SuspiciousActivity :1928-1929)
  - Push abonelikleri (:1969)
  - Fraud/şüpheli aktivite profilleme (:1919-1929)
  - AI ile geri bildirim analizi ve rozet kategorisi (Groq, lib/ai-engine.ts:44-45)
  - Üçüncü taraf işleyenler: Sentry, PostHog, Vercel, Upstash, R2, Resend, Stripe (package.json)

  Bu işleyenlerin önemli kısmı yurt dışında. Metin bunların hiçbirini adlandırmıyor ("sınırlı şekilde aktarılır", page.tsx:49-50). Bu genel ifade aydınlatmanın amacını boşa çıkarıyor. Ayrıca otomatik analiz (AI kategori, fraud skoru, puan reddi) md. 11/1-g ile doğrudan ilgili. Bu hak metinde hiç geçmiyor.
- **Öneri:** Metin, KVKK hukuk danışmanıyla şu iskelette baştan yazılmalı:
  1. Veri sorumlusu (unvan, adres, iletişim, VERBİS)
  2. İşlenen veri kategorileri. Kişi grubu bazında (tüketici, işletme sahibi, ziyaretçi) ve tablo halinde: kategori, örnek alan, kaynak.
  3. Amaçlar ve hukuki sebep eşlemesi. Her satırda kategori, amaç ve hukuki sebep.
  4. Toplama yöntemleri (QR formu, kayıt, çerez/SDK, otomatik log, konum izni)
  5. Alıcı grupları (iş ortağı işletme, altyapı/barındırma, AI işleyen, analitik, e-posta, ödeme) ve yurt dışı aktarım dayanağı
  6. Saklama süreleri
  7. Otomatik karar verme / profilleme (rozet, fraud, AI)
  8. md. 11 hakların tamamı
  9. Başvuru usulü (kanallar, 30 günlük yanıt süresi, kimlik doğrulama)

  Veri envanteri `prisma/schema.prisma`'dan çıkarılıp bir `lib/legal/data-inventory.ts` sabitinde tutulabilir. Hem bu sayfa hem gizlilik politikası aynı kaynaktan beslenir.

### 3. Uygulama içi KVKK başvuru API'si: istemcisi yok, keyfi adrese sınırsız makbuz e-postası gönderiyor
- **Önem:** yüksek · **Kategori:** güvenlik / ölü özellik · **Efor:** S
- **Kanıt:**
  - app/api/customer/privacy-request/route.ts:11-15: gövdede opsiyonel `email` var.
  - :34: `parsed.data.email?.trim() || user?.email`
  - :52-56: makbuz bu adrese gönderiliyor.
  - Dosyada rate limit yok. `proxy.ts`'te de global API rate limit bulunamadı.
  - İstemci tarafında bu uca istek atan kod yok. Tek referans app/admin/compliance/page.tsx:271'deki açıklama metni.
  - Yanıttaki `complianceContact` = `kvkk@example.com` (lib/innovation-config.ts:76).
- **Sorun:**
  - Ücretsiz kayıt olan herhangi bir CUSTOMER, döngüyle istediği adrese QRATEX markalı "Başvurunuz alındı" e-postası yağdırabilir. Bu e-posta bombası riski yaratır ve gönderici alan adının itibarını zedeler. Her istek ayrıca bir `DataSubjectRequest` ve `AuditLog` satırı yazar.
  - Talep, oturumdaki kullanıcının e-postası yerine başka bir adrese bağlanabiliyor. Makbuz da yanıt da yanlış kişiye gidebilir.
  - Kullanıcının bu hakkı kullanacak bir arayüzü de yok. Bu sayfa da ona yönlendirmiyor.
- **Öneri:**
  - `email` alanı kaldırılmalı. Talep her zaman oturumdaki doğrulanmış e-postaya bağlanmalı. Farklı iletişim adresi gerekiyorsa yalnızca `message` içinde not olarak alınmalı.
  - Kullanıcı başına Upstash tabanlı bir rate limit eklenmeli (ör. 24 saatte 3 talep). Aynı türde açık talep varsa 409 dönülmeli.
  - `kvkk@example.com` yer tutucusu gerçek adresle değiştirilmeli veya tek bir `LEGAL_CONTACT` sabitine bağlanmalı.
  - Bu sayfaya "Başvuru oluştur" CTA'sı eklenmeli: giriş yapmışsa `/customer/settings?tab=privacy` içindeki forma, yapmamışsa e-posta kanalına yönlendirsin.

### 4. Yasal metin TSX'e gömülü: sürüm, yürürlük ve kabul kaydı yok
- **Önem:** yüksek · **Kategori:** mimari · **Efor:** L
- **Kanıt:** page.tsx:36-59 sabit JSX. Şemada `LegalDocument` veya `ConsentRecord` benzeri model yok (grep `consent|kvkk|terms` schema: yalnız `DataSubjectRequest` :2804-2816). Kayıt formu rıza kaydetmiyor (register/page.tsx:428-442 yalnız bağlantı veriyor).
- **Sorun:** Metin her değiştiğinde deploy gerekiyor ve eski sürüm kayboluyor. Hangi kullanıcının hangi sürümü gördüğü veya kabul ettiği ispatlanamıyor. Metin değişince kullanıcıya bildirim gitmiyor.
- **Öneri:**
  - `LegalDocument { slug, version, locale, title, bodyMdx, effectiveAt, changelog, publishedBy }` ve `LegalAcceptance { userId, documentSlug, version, acceptedAt, ip(hash), channel }` modelleri kurulmalı.
  - Public sayfa `slug` ile en güncel yayınlanmış sürümü okusun ve `unstable_cache` tag'i `legal:<slug>` olsun. Build-time DB fail-safe kuralına göre try/catch içinde kalsın ve gömülü yedek metne düşsün.
  - Admin'e mevcut `/admin/seo` benzeri bir "Yasal Metinler" editörü eklenmeli: sürüm farkı (diff) ve yayınla butonu olsun.
  - Yeni sürüm yayınlandığında müşteri panelinde tek seferlik bir "Aydınlatma metnimiz güncellendi" bandı gösterilsin. Bu bildirimdir, rıza değildir. Rıza gerektiren metinlerde yeniden onay istensin.

### 5. Verinin toplandığı anlarda aydınlatmaya erişim yok
- **Önem:** yüksek · **Kategori:** UX / uyum · **Efor:** S
- **Kanıt:** QR geri bildirim formunda (app/(public)/feedback/[code]/page.tsx) KVKK, gizlilik veya privacy bağlantısı yok. Kayıt ekranı yalnız şartlar ve gizliliğe bağlanıyor (register/page.tsx:430,437). Konum izni isteyen /customer/nearby (page.tsx:112-119) aydınlatma göstermiyor.
- **Sorun:** Aydınlatma, veri elde edilirken yapılmalı. Tüketicinin bu sayfaya tek yolu footer (footer.tsx:31). QR okutan bir son kullanıcı oraya neredeyse hiç inmez.
- **Öneri:** Yeniden kullanılabilir bir `<PrivacyNotice context="feedback|register|location|birthday" />` bileşeni yapılmalı. Bağlama özel tek cümle özet ve "Aydınlatma Metni" bağlantısı göstersin. Bağlantı ilgili bölüm çapasına gitsin (`/kvkk-aydinlatma-metni#konum`). QR formu gönder butonunun altına, kayıt formuna, konum izni ve doğum günü giriş noktalarına yerleştirilmeli.

### 6. Sayfa başlık hiyerarşisi bozuk ve admin override görünen başlığa yansımıyor
- **Önem:** orta · **Kategori:** erişilebilirlik / SEO · **Efor:** S
- **Kanıt:** page.tsx:33 `CardTitle` → components/ui/card.tsx:44 `<h3>`. Sayfada `h1` yok. page.tsx:23'te `title` override'ı hesaplanıyor ama :33'te sabit "KVKK Aydınlatma Metni" basılıyor.
- **Sorun:** Ekran okuyucu kullanıcısı başlık listesinde sayfa başlığını bulamaz. Admin `/admin/seo`'dan başlığı değiştirirse `<title>` ve JSON-LD değişir, görünen başlık değişmez.
- **Öneri:** Sayfa başlığı `<h1>` olmalı ve aynı `title` değişkeninden gelmeli. Bölümler `h2`, alt başlıklar `h3` olmalı. Yasal sayfalar için ortak bir `LegalPageShell` (bulgu 9) bu yapıyı tek yerde garanti eder.

### 7. Okunabilirlik: kontrolsüz satır uzunluğu, sönük metin rengi, tıklanamaz e-posta
- **Önem:** orta · **Kategori:** görsel / erişilebilirlik · **Efor:** S
- **Kanıt:** page.tsx:29 `container` (2xl: 1400px, tailwind.config.ts:13-18). page.tsx:35 tüm gövde `text-sm leading-6 text-muted-foreground`. page.tsx:57 e-posta `<strong>`, bağlantı değil.
- **Sorun:** Geniş ekranda 180-200 karakterlik satırlar okumayı zorlaştırıyor. İdeal aralık 60-80 karakter. Uzun yasal metnin tamamını `muted-foreground` ile basmak, özellikle koyu temada kontrastı düşürüyor. Kontrast oranı ölçülmedi, doğrulanmadı. Mobilde kullanıcı e-postaya dokunarak mail açamıyor.
- **Öneri:** Gövde `max-w-prose` (veya `max-w-[72ch]`), `text-base` ve `text-foreground/90` olmalı. Muted renk yalnızca meta bilgiler için kullanılsın. E-posta `mailto:` bağlantısı olsun ve yanında "kopyala" butonu bulunsun. `@tailwindcss/typography` ile `prose dark:prose-invert` stili yasal sayfalarda standart olabilir.

### 8. Kullanıcının haklarını kullanabileceği yerle bağ kurulmamış
- **Önem:** orta · **Kategori:** UX / ürün · **Efor:** S
- **Kanıt:** app/customer/settings/page.tsx:451-476 (`/api/user/data-export`), :479-495 (`/api/user/delete-account`), :1055-1105 (privacy sekmesi) çalışıyor. KVKK sayfası (page.tsx:52-58) bunlardan hiç söz etmiyor.
- **Sorun:** Kullanıcı "erişim" ve "silme" haklarını tek tıkla kullanabilecekken e-posta yazmaya yönlendiriliyor. Bu destek yükü yaratıyor, süreç de ölçülemez kalıyor.
- **Öneri:** "Haklarınız" bölümü her hakkı bir aksiyon kartına dönüştürmeli: "Verilerimi indir", "Hesabımı sil", "Düzeltme talep et", "İtiraz et". Kartlar oturum varsa doğrudan ilgili ayar sekmesine, yoksa `/auth/login?callbackUrl=/customer/settings?tab=privacy` adresine gitsin. Düzeltme ve itiraz talepleri bulgu 3'te güvenli hale getirilmiş `privacy-request` ucunu kullansın.

### 9. 4 yasal sayfa kopyala-yapıştır: ortak kabuk yok
- **Önem:** düşük · **Kategori:** mimari / bakım · **Efor:** S
- **Kanıt:** kvkk-aydinlatma-metni/page.tsx, gizlilik-politikasi/page.tsx, cerez-politikasi/page.tsx ve kullanim-sartlari/page.tsx satır satır aynı iskeleti taşıyor: `generateMetadata`, JSON-LD, Breadcrumb, Card ve `new Date()`. Sabit açıklama metni her dosyada iki kez yazılmış (ör. kvkk page.tsx:14 ve :24). Konteyner aralığı dosyalar arasında tutarsız: `space-y-6` gizlilik ve kullanım şartlarında var, KVKK ve çerezde yok (page.tsx:29).
- **Sorun:** Her düzeltme dört yerde yapılmak zorunda (bulgu 1 bunun canlı örneği) ve dosyalar arasında kayma başlamış.
- **Öneri:** `components/legal/legal-page-shell.tsx` (h1, sürüm/tarih rozeti, sticky içindekiler, yazdır, ilgili belgeler) ve `lib/legal/page-metadata.ts` (tek `buildLegalMetadata(slug)`) yazılmalı. Her sayfa 5-10 satıra iner.

### 10. Yalnız Türkçe; uygulama TR/EN destekliyor
- **Önem:** düşük · **Kategori:** i18n · **Efor:** M
- **Kanıt:** page.tsx sabit TR. QR formu `t(locale, …)` ile TR/EN (app/(public)/feedback/[code]/page.tsx:14-15). messages/en.json mevcut.
- **Sorun:** Turist veya yabancı tüketici geri bildirimi EN verip aydınlatmayı TR okuyor.
- **Öneri:** `LegalDocument.locale` ile EN sürüm yayınlanmalı. Bağlayıcı olanın TR metin olduğu EN sayfada belirtilmeli. `alternates.languages` ile hreflang verilmeli.

---

## Eksik özellikler (kıyas ürünlerle)

Starbucks Rewards, Duolingo, Revolut/Monzo ve Spotify'ın gizlilik merkezleri ölçü alındı:

1. **Katmanlı aydınlatma (özet + tam metin).** Revolut ve Monzo üstte 5 maddelik "kısaca" kartı, altta tam metin gösterir. Tüketici 10 saniyede "puanım için ne veriyorum?" sorusunun cevabını görmeli.
2. **Eyleme dönük "Gizlilik Merkezi".** Spotify ve Duolingo'da veri indirme, hesap silme ve pazarlama izinleri yasal metnin hemen yanındadır. Qratex'te bu araçlar Ayarlar'da var ama yasal metinden kopuk.
3. **Sürüm geçmişi ve değişiklik özeti.** Starbucks ve Spotify'da "Ne değişti?" listesi ve önceki sürümlere erişim bulunur.
4. **Bölüm içindekiler + derin bağlantı.** Sticky TOC ve `#konum`, `#ai-analizi` gibi çapalar olmalı. Bağlamsal bildirimler doğrudan ilgili bölüme götürür.
5. **İşleyen/alt işleyen listesi.** Revolut tarzı tablo: işleyen, amaç, ülke, güvence.
6. **Otomatik karar verme açıklaması.** Duolingo'nun kişiselleştirme ve Revolut'un fraud açıklaması gibi: "Rozet kategorin AI ile belirlenir. Puan iptali şu durumda otomatik olur; itiraz etmek için şuraya…"

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** QR okutup puan kazanan tüketici, "verimle ne yapıyorsunuz?" sorusunun cevabını 10 saniyede özetten okur. Hakkını tek tıkla kullanır. Hukuk ekibi aynı sayfayı eksiksiz, sürümlü ve ispatlanabilir bir belge olarak görür.

**Yerleşim (mobil öncelikli):**
1. **Başlık bandı:** `h1` "KVKK Aydınlatma Metni". Altında sürüm rozeti (`v1.2 · Yürürlük 01.10.2026`) ve "Ne değişti?" bağlantısı. Sağda Yazdır/PDF.
2. **"Kısaca" kartları (3-5 adet, yatay kaydırma, mobil):** "Topladığımız veriler", "Neden", "Kimlerle paylaşıyoruz", "Ne kadar saklıyoruz", "Haklarınız". Her kart ilgili bölüme çapa verir.
3. **Gövde (`max-w-prose`, solda sticky TOC, mobilde açılır "İçindekiler" menüsü):** bulgu 2'deki 9 başlık. Veri kategorileri ve işleyenler responsive tablo olarak (`overflow-x-auto`) verilir. Kişi grubu sekmesi: Tüketici / İşletme / Ziyaretçi.
4. **"Haklarınızı kullanın" aksiyon şeridi:** Verilerimi indir · Hesabımı sil · Düzeltme/itiraz talebi. Oturuma göre davranır (bulgu 8).
5. **Altbilgi:** başvuru kanalları (mailto + kopyala), 30 günlük yanıt süresi, ilgili belgeler (Gizlilik, Çerez, Şartlar).

**Motion/3D:** Yasal sayfada 3D veya dikkat çekici animasyon **yersiz**. Ölçülü olanlar şunlar:
- TOC'ta aktif bölüm göstergesinin `layoutId` ile kayması
- Özet kartlarında 150 ms'lik hover yükselmesi
- "Ne değişti?" çekmecesinin açılışı

Hepsi `useReducedMotion` ile kapanmalı. Layout'taki hareketli arka plan (app/(public)/layout.tsx:18) yasal sayfalarda sakin bir varyanta indirilmeli veya kapatılmalı. Uzun okuma boyunca hareket dikkati dağıtır. Bu bir route bazlı prop ya da `(public)/(legal)` alt grup layout'u ile yapılabilir.

**Veri/API değişiklikleri:**
- `LegalDocument` + `LegalAcceptance` Prisma modelleri (bulgu 4). Public okuma `unstable_cache` ile tag `legal:<slug>` ve fail-safe gömülü yedekle yapılır.
- `lib/legal/data-inventory.ts`: veri kategorisi, amaç, hukuki sebep, saklama ve işleyen tek kaynakta tutulur. Hem metin tabloları hem admin uyum ekranı buradan beslenir.
- `/api/customer/privacy-request`: `email` alanı kaldırılır, rate limit eklenir, açık talep tekilliği sağlanır, gerçek iletişim adresi kullanılır (bulgu 3).
- Admin: `/admin/legal` editörü (sürüm diff + yayınla), yayınlandığında müşteri bildirim bandı.
- `sitemap.ts`: `lastModified` olarak `LegalDocument.effectiveAt` kullanılır.

---

## Çakışmalar / birleştirme önerisi

- **/gizlilik-politikasi ile büyük örtüşme.** İşlenen veriler ve amaçlar iki sayfada da neredeyse aynı cümlelerle tekrarlanıyor (gizlilik-politikasi/page.tsx:41-48 ve kvkk page.tsx:40-47). KVKK aydınlatma metninin ayrı ve doğrudan erişilebilir bir belge olarak kalması gerekir, bu yüzden **URL kaldırılmamalı**. Önerilen yapı: ortak `LegalPageShell` ve ortak `data-inventory` kaynağı ile bir **"Gizlilik Merkezi"** ailesi:
  - `/kvkk-aydinlatma-metni`: yasal aydınlatma, tam metin
  - `/gizlilik-politikasi`: kullanıcı dostu özet ve uygulamalar
  - `/cerez-politikasi`: çerez tablosu ve tercih yönetimi
  - `/kullanim-sartlari`

  Dördü üst bantta sekmeli bir "Yasal" gezinmesiyle birbirine bağlanır.
- **/guven** (app/(public)/guven/page.tsx:74-105) "Veri Politikaları" kartında bu dört belgeye liste halinde bağlanıyor. Orada tutulması doğru, ancak bilgi tekrarı yapılmamalı.
- **/customer/settings privacy sekmesi** ile işlevsel tamamlayıcılık var, çakışma yok. Doğru model: metin burada, eylem orada, aralarında karşılıklı derin bağlantı.
- **/admin/compliance** ve **/admin/privacy-requests** başvuruları yönetiyor ama bu başvuruları üretecek müşteri arayüzü yok (bulgu 3). Gizlilik Merkezi bu boşluğu kapatmalı.

---

## Doğrulama (şüpheci inceleme)

Salt okunur inceleme yapıldı. Kod çalıştırılmadı, veritabanına dokunulmadı.

### İddia 1: "Son güncelleme" tarihi render anını gösteriyor (4 yasal sayfa + sitemap)
- **Karar:** DOĞRULANDI. Önem "kritik" yerine **yüksek/orta** olarak okunmalı. Bu bir güvenlik açığı değil, yasal belge doğruluğu hatası.
- **Kanıt:**
  - app/(public)/kvkk-aydinlatma-metni/page.tsx:59
  - gizlilik-politikasi/page.tsx:56, cerez-politikasi/page.tsx:56, kullanim-sartlari/page.tsx:60: aynı `new Date().toLocaleDateString('tr-TR')`
  - app/sitemap.ts:50: KVKK girdisinde `lastModified: new Date()`. Diğer tüm girdilerde de aynı kalıp var (sitemap.ts:14-68).
  - Sayfanın tek veri bağımlılığı `getSeoSettings`/`getPageSeo`. Bunlar `unstable_cache(..., { revalidate: 60 })` kullanıyor (lib/seo-settings.ts:117-119).
- **Not:** Sayfa ister tam statik, ister ISR, ister dinamik olsun, basılan tarih metnin içeriğinden bağımsız. Değer build anı, son yeniden doğrulama anı ya da istek anı oluyor. Hangisi olduğu çalıştırılmadan kesinleşmez, ama üçü de metnin yürürlük tarihi değil. Bu yüzden iddianın özü her durumda doğru.
- **Somut senaryo:** Metin aylardır aynı. Kullanıcı 08.10.2026'da sayfaya bakıyor ve "Son güncelleme: 08.10.2026" (ya da son deploy tarihi) görüyor. Uyuşmazlık anında bu ekran görüntüsü, metnin o gün değiştiği izlenimini verir.
- **Ek not:** `toLocaleDateString` sunucu saat dilimiyle çalışıyor. Region fra1 (vercel.json), dolayısıyla gece yarısına yakın saatlerde TR tarihinden bir gün sapma da olabilir. Bu ikincil bir etki.
- **Öneri:** Rapordaki öneri yerinde. Sabit `effectiveDate`/`version` tek kaynaktan gelsin. Sayfa ve sitemap bu değeri okusun.

### İddia 2: KVKK başvuru API'si keyfi alıcıya sınırsız markalı e-posta gönderiyor
- **Karar:** DOĞRULANDI (kısmen). E-posta bombası ve itibar riski gerçek. "Yanıt yanlış kişiye gidebilir" kısmı ise abartılı.
- **Kanıt:**
  - app/api/customer/privacy-request/route.ts:14: `email: z.string().email().optional()`
  - route.ts:34: `parsed.data.email?.trim() || user?.email`
  - route.ts:52-56: makbuz bu adrese gönderiliyor.
  - route.ts:42-50 ve :65-73: her istek bir `DataSubjectRequest` ve bir `AuditLog` satırı yazıyor.
  - Dosyada rate limit yok. Projede `checkRateLimitDb` var (lib/rate-limit.ts), örneğin app/api/auth/register/route.ts:14'te kullanılıyor, ama bu uçta çağrılmıyor.
  - proxy.ts:103-119: `/api/*` için yalnızca güvenlik ve CORS başlıkları ekleniyor, rate limit yok.
  - vercel.json'da firewall/WAF kuralı yok. Vercel panelinde WAF kuralı olup olmadığı doğrulanmadı.
- **Somut senaryo:** Saldırgan bir hesap açar. Girişte e-posta doğrulaması aranıyor (lib/auth.ts:165), ama kendi adresiyle bu engel kolayca aşılır. Sonra oturum çereziyle döngü kurar ve her istekte `POST /api/customer/privacy-request` gövdesine `{"type":"access","email":"kurban@ornek.com"}` gönderir. Kurbanın kutusuna sınırsız sayıda "QRATEX — Başvurunuz alındı" e-postası düşer (lib/email.ts:58). Sonuçlar: gönderici alan adı spam şikâyeti alır, SMTP/Resend kotası tükenir, `DataSubjectRequest` tablosu çöp kayıtla dolar ve admin uyum ekranı kirlenir.
- **Abartılan kısım:**
  - E-posta içeriği saldırgan tarafından şekillendirilemiyor. `type` bir enum, `requestId` ve tarih sunucuda üretiliyor ve escape ediliyor (lib/email.ts:59-61). Bu yüzden bu uç üzerinden oltalama (phishing) metni enjekte edilemez. Etki taciz/spam ve itibar düzeyinde kalıyor.
  - Talep her zaman oturumdaki `userId`'ye bağlanıyor (route.ts:44). Admin "export" işlemi veriyi e-postayla göndermiyor, JSON olarak admin paneline döndürüyor ("app/api/admin/privacy-requests/[id]/route.ts":84-90). Dolayısıyla saldırgan başkasının verisini dışarı çekemez, başkası adına silme talebi de açamaz.
  - "Yanlış kişiye yanıt" riski yalnızca adminin `row.email` adresine elle yanıt yazması durumunda doğar. Bu durumda da giden veri talebi açan kullanıcının kendi verisidir.
- **Ek:** `complianceContact` gerçekten `kvkk@example.com` yer tutucusu (lib/innovation-config.ts:76). Bu değer DB'deki config override'ı ile değiştirilmiş olabilir. Canlı değer doğrulanmadı.
- **Öneri:** Rapordaki öneriler yerinde: `email` alanını kaldırmak, `checkRateLimitDb` ya da Upstash ile kullanıcı başına sınır koymak ve açık talep tekilliği sağlamak. Önem **yüksek** değil **orta** olarak sınıflanabilir, ama düzeltme eforu S olduğu için öncelik yine yüksek tutulmalı.

### İddia 3: Aydınlatma metni gerçek veri işlemeyi ve yurt dışı aktarımı yansıtmıyor
- **Karar:** DOĞRULANDI. Bu bir kod hatası değil, uyum ve içerik açığı. Kod tabanındaki veri işleme faaliyetleri okunarak teyit edildi. Hukuki ağırlık hukuk danışmanınca değerlendirilmeli.
- **Kanıt:**
  - page.tsx:40-55: 4 genel kategori, "sınırlı şekilde aktarılır" ifadesi ve md. 11'den yalnız 4 hak var. Hukuki sebep, saklama süresi ve otomatik analize itiraz hakkı yok.
  - prisma/schema.prisma:35 `phone`; :1114-1115 AuditLog `ipAddress`/`userAgent`; :1903-1906 `UserBirthday.birthDate`; :1919-1929 `SuspiciousActivity` (tür, önem, IP, UA); :1969 `PushSubscription`.
  - Konum: app/customer/nearby/page.tsx:119 `navigator.geolocation.getCurrentPosition`.
  - AI: lib/ai-engine.ts:44-47 Groq (`api.groq.com`). Bu motor müşteri verisiyle çalışan uçlardan çağrılıyor: app/api/customer/consumptions/[id]/review/route.ts, app/api/ai/analyze/route.ts, app/api/customer/ai-chat/route.ts. Yerel `.env` dosyasında `GROQ_API_KEY` tanımlı. Canlı ortamdaki değeri doğrulanmadı.
  - package.json:35 `@aws-sdk/client-s3`, :56 `@sentry/nextjs`, :60 `@upstash/redis`, :83 `nodemailer`, :85 `posthog-js`, :93 `resend`, :96 `stripe`.
  - vercel.json: `regions: ["fra1"]`. Uygulama sunucusu da Türkiye dışında.
  - Gizlilik politikası (gizlilik-politikasi/page.tsx:41-48) da bu boşluğu kapatmıyor. Yalnız /guven sayfası Sentry/Vercel/Inngest'i anıyor (guven/page.tsx:55), o da aydınlatma metninin yerini tutmaz.
- **Somut senaryo:** Tüketici QR geri bildirimi bırakıyor. Yorumu AI analizi için ABD merkezli Groq'a gidiyor. IP/UA bilgisi fraud kayıtlarına yazılıyor, doğum tarihi ve konum işleniyor. Aydınlatma metni ise bunların hiçbirini, alıcı gruplarını ve yurt dışı aktarımı adlandırmıyor. Kullanıcı md. 11/1-g kapsamındaki otomatik analize itiraz hakkından haberdar edilmiyor.
- **Not:** Hangi işleyenin hangi bölgede barındığı (ör. Upstash ve R2 bölgesi, PostHog EU/US) yalnız koddan kesinleşmez. Bu bilgi doğrulanmadı. Ancak en az Groq (ABD) ve Vercel fra1 için yurt dışı aktarım kod ve konfigürasyondan açıkça görülüyor.
