# /guven

**Amaç:** Herkese açık "Güven ve Güvenilirlik" sayfası; uptime hedefi, güvenlik kontrolleri ve hukuki metinlere bağlantıları tek yerde toplar. Footer'daki "Yasal" grubundan erişilir (`components/layout/footer.tsx:27`), sitemap'te yer alır (`app/sitemap.ts:31`).
**Genel puan:** 4/10
**Karar:** yeniden tasarla. Sayfa kalmalı ama "geliştirici notu" olmaktan çıkıp hem tüketicinin hem işletmenin sorduğu "verime ne oluyor?" sorusuna yanıt veren bir güven merkezine dönüşmeli. Yanlış ve doğrulanamayan iddialar hemen düzeltilmeli.

Dosyalar: `app/(public)/guven/page.tsx` (110 satır, server component, client JS yok), `app/(public)/layout.tsx`, `components/seo/{webpage-json-ld,breadcrumb-json-ld,breadcrumb-nav}.tsx`, `components/ui/card.tsx`, `lib/seo-settings.ts`. Sayfa hiçbir API ucunu çağırmıyor, Prisma'ya doğrudan erişmiyor. Tek veri kaynağı `getSeoSettings()` ve `getPageSeo()`: SEO satırı `unstable_cache` ile 60 sn önbelleğe alınıyor, istek içinde `react.cache` ile tekilleştiriliyor (`lib/seo-settings.ts:118-130`).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Linkler ve SEO çalışıyor. Ama içeriğin bir kısmı yanlış (signed URL yok, Inngest bir izleme aracı değil) ya da doğrulanamıyor (%99.9 SLO, p95 < 300ms). |
| UX | 3/10 | Metin tüketiciye değil geliştiriciye yazılmış ("lib/pii-redact", "Idempotency", "JWT"). Tüketicinin asıl soruları ("işletme adımı görüyor mu?", "verimi nasıl silerim?") yanıtsız kalıyor. |
| Görsel | 4/10 | Üç düz shadcn kartı ve madde listesi var. Hiyerarşi, vurgu ve marka dili yok; landing'in cilasıyla tutarsız. |
| Mimari | 7/10 | Temiz bir RSC, istemci JS'i yok. SEO helper'ı fail-safe (`lib/seo-settings.ts:112`) ve önbellekli. Breadcrumb JSON-LD ile sayfa JSON-LD'si farklı base URL kaynağı kullanıyor. |
| Performans | 8/10 | Statik metin, sıfır client bundle. Tek maliyet layout'taki tüm sayfayı kaplayan `LandingBackground` ile tam ekran `loading.tsx`. |
| Erişilebilirlik + Mobil | 6/10 | Grid mobilde tek kolona düşüyor, breadcrumb'da `aria-current` var. Başlık seviyesi h1'den h3'e atlıyor, dekoratif ikonlarda `aria-hidden` yok, TR/EN karışık. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | `generateMetadata`: title, description, canonical + admin SEO override | ÇALIŞIYOR | `page.tsx:10-19`, `lib/seo-settings.ts:139-143` | Override admin SEO ekranından yapılıyor (`app/admin/seo/page.tsx:706`). |
| 2 | Schema.org `AboutPage` JSON-LD | ÇALIŞIYOR | `page.tsx:29`, `components/seo/webpage-json-ld.tsx:11-24` | `sanitizeSeoString` HTML etiketlerini siliyor (`lib/seo-settings.ts:66-69`). |
| 3 | `BreadcrumbList` JSON-LD | KISMİ | `page.tsx:30`, `components/seo/breadcrumb-json-ld.tsx:10`, `lib/site-config.ts:26-28` | URL'ler env `siteUrl` ile üretiliyor; canonical ise SEO ayarındaki `canonicalBase` ile. Admin canonicalBase'i değiştirirse ikisi ayrışır. |
| 4 | Görsel breadcrumb | ÇALIŞIYOR | `page.tsx:32`, `components/seo/breadcrumb-nav.tsx` | `aria-label`, `aria-current`, focus ring mevcut. |
| 5 | Başlık (h1 + Shield ikonu) + alt başlık | ÇALIŞIYOR | `page.tsx:33-41` | İkonda `aria-hidden` yok. |
| 6 | "Uptime ve SLO" kartı: %99.9, aylık < 43 dk | SAHTE (sabit kodlu, doğrulanmadı) | `page.tsx:52` | Repoda bu hedefi ölçen ya da yayınlayan bir şey yok. Status sayfası yok, uptime verisi gösterilmiyor. `/api/health` var (`app/api/health/route.ts`) ama sayfaya bağlı değil. |
| 7 | "p95 Latency < 300ms", "Error Rate < %0.1" | SAHTE (sabit kodlu, doğrulanmadı) | `page.tsx:53-54` | Ölçülmüş bir değer değil. Etiketler İngilizce. |
| 8 | "İzleme: Sentry, Vercel Analytics, Inngest" | KISMİ | `page.tsx:55`; `sentry.*.config.ts`, `app/layout.tsx:168-169`, `app/api/inngest/route.ts` | Sentry ve Vercel Analytics gerçekten kurulu. Inngest ise bir iş kuyruğu/arka plan iş aracı, izleme aracı değil; yanlış sınıflandırılmış. |
| 9 | "PII: Email, telefon, IP maskeleme (lib/pii-redact)" | KISMİ | `lib/pii-redact.ts`; kullanım: `lib/auth-events.ts:7,41,50`, `app/api/admin/compliance/logs/route.ts` | Yardımcı fonksiyonlar var ama yalnızca auth olay kayıtlarında ve uyum loglarında kullanılıyor. Sayfa bunu sistem geneli bir garantiymiş gibi sunuyor. |
| 10 | "Export: Satır limiti" | ÇALIŞIYOR | `lib/export-utils.ts:32` (`EXPORT_ROW_LIMIT = 10_000`), `app/api/export/feedbacks/route.ts:26` | |
| 11 | "Export: watermark" | ÇALIŞIYOR | `app/api/export/feedbacks/route.ts:55-56` | |
| 12 | "Export: signed URL" | SAHTE (iddia gerçeğe uymuyor) | `app/api/export/feedbacks/route.ts:3` yorum, `:58-64` gerçek yanıt | Route CSV'yi doğrudan `attachment` olarak döndürüyor. Repoda `getSignedUrl`/presign kullanımı yok (grep sonucu boş). |
| 13 | "Session: JWT + token replay tespiti, session fixation koruması" | ÇALIŞIYOR | `lib/auth.ts:213-215` (her login'de yeni `jti`), `lib/token-replay.ts:51`, `lib/api-auth.ts` | |
| 14 | "Idempotency: kritik route'larda" | ÇALIŞIYOR | `lib/idempotency.ts`; ör. `app/api/gamification/spin/route.ts`, `app/api/feedbacks/route.ts`, `app/api/gamification/rewards/route.ts` | 9 route'ta kullanılıyor. |
| 15 | Veri politikaları: 4 iç link (KVKK, Gizlilik, Çerez, Kullanım Şartları) | ÇALIŞIYOR | `page.tsx:82-103` | Hedef sayfaların hepsi `app/(public)/` altında var. |
| 16 | Duyarlı grid (1 → 2 → 3 kolon) | ÇALIŞIYOR | `page.tsx:43` | md'de 3. kart tek başına alt satıra düşüyor, görsel dengesiz. |
| 17 | Yükleniyor durumu | ÇALIŞIYOR (orantısız) | `app/(public)/loading.tsx` | `fixed inset-0 z-[100]` tam ekran animasyonlu loader, statik bir metin sayfası için ağır. |
| 18 | Hata / DB erişilemez durumu | ÇALIŞIYOR | `lib/seo-settings.ts:112-114` | try/catch varsayılana düşüyor; build-time fail-safe kuralına uygun. |
| 19 | Footer ve sitemap'te listelenme | KISMİ | `components/layout/footer.tsx:27`, `app/sitemap.ts:31-35` | Sitemap'te `lastModified: new Date()` her istekte "şimdi" diyor; arama motoruna yanlış tazelik sinyali veriyor. |
| 20 | Header / müşteri paneli / ayarlar içinden erişim | EKSİK | grep: yalnızca footer'da | Tüketici, puan ve veri sorusu en çok aklındayken (`/customer/settings`) bu sayfaya bir yol bulamıyor. |
| 21 | "Son güncelleme" tarihi / değişiklik günlüğü | EKSİK | `page.tsx` | Kardeş KVKK sayfasında var, ama orada da `new Date()` ile sahte üretiliyor (`kvkk-aydinlatma-metni/page.tsx`, "Son güncelleme" satırı). |
| 22 | KVKK self-servis aksiyonları (verimi indir, hesabımı sil, başvuru) | EKSİK | API'ler mevcut: `app/api/user/data-export`, `app/api/user/delete-account`, `app/api/user/privacy-request`; UI: `components/settings/privacy-security.tsx:111,131` | Altyapı hazır ama güven sayfası bunlara bağlantı vermiyor. |
| 23 | Tüketiciye özel şeffaflık (işletme ne görür, puan/oyun verisi nasıl işlenir) | EKSİK | `app/api/export/feedbacks/route.ts:36` (`userName` işletmenin CSV'sine gidiyor) | İsim işletmeye aktarılıyor ama sayfada bundan hiç söz edilmiyor. |
| 24 | Canlı durum / olay geçmişi (status) | EKSİK | n/a | |
| 25 | Güvenlik açığı bildirimi (`/.well-known/security.txt`, sorumlu ifşa) | EKSİK | `public/.well-known` yok | |
| 26 | Alt işlemciler / veri konumu listesi (Vercel, Neon, Upstash, Cloudflare R2, Sentry, PostHog) | EKSİK | `package.json` bağımlılıkları | KVKK yurt dışı aktarım şeffaflığı açısından önemli. |
| 27 | SSS / akordeon, arama, iletişim CTA | EKSİK | n/a | |

Sayım: ÇALIŞIYOR 11 · KISMİ 5 · BOZUK 0 · SAHTE 3 · EKSİK 8 (toplam 27).

---

## Bulgular

### 1. Yüksek · İçerik doğruluğu / güven · "Signed URL" iddiası yanlış
- **Kanıt:** `app/(public)/guven/page.tsx:68`; `app/api/export/feedbacks/route.ts:58-64` (CSV doğrudan dönüyor), repoda presign kullanımı yok.
- **Sorun:** Güven sayfası, yazılım tarafından karşılanmayan bir güvenlik kontrolünü kamuya garanti ediyor. Bu bir güven sayfasında en kötü hata türü; bir denetimde ya da işletme müşterisinin güvenlik anketinde "yanlış beyan" olarak döner.
- **Öneri:** Kısa vadede ifadeyi gerçeğe çek: "Dışa aktarımlar yalnızca yetkili hesaplara, oturum doğrulamasıyla ve önbelleğe alınmadan sunulur" (`PRIVATE_NO_STORE_HEADERS` gerçekten var). Orta vadede büyük exportları R2'ye yazıp süreli presigned URL ile vermek istiyorsanız `lib/r2-storage.ts` üzerine bir `createSignedDownload(key, ttl)` ekleyin; iddiayı ancak o zaman geri koyun. Ayrıca sayfadaki her iddiayı koddaki bir kaynakla eşleyen bir "iddia ↔ kanıt" listesi tutun (bkz. vizyon).
- **Efor:** S (metin) / M (gerçek signed URL)

### 2. Yüksek · İçerik doğruluğu · SLO rakamları ölçülmüyor ve yayınlanmıyor
- **Kanıt:** `page.tsx:52-54`, sabit metin. Repoda uptime ölçümü ya da status sayfası yok. `app/api/health/route.ts` yalnızca anlık DB ping'i yapıyor.
- **Sorun:** "%99.9", "p95 < 300ms", "Error Rate < %0.1" gerçek veri gibi duruyor ama ölçülmüyor. Bunlar sözleşmesel taahhüt gibi okunur. Performans notlarına göre (Neon soğuk başlangıç, bağlantı havuzu ayarları) p95 hedefi doğrulanmadı.
- **Öneri:** Metni "hedef" olarak açıkça etiketleyin ve bir doğrulama kaynağı ekleyin: harici bir uptime izleyicisi (`/api/health?light=1` zaten probe için tasarlanmış) ve herkese açık bir status bağlantısı. Daha iyisi, Speed Insights / Sentry'den günlük olarak çekilen son 30 günlük uptime ve p95'i Redis'te önbelleğe alıp küçük bir "Son 30 gün" şeridinde göstermek (ISR, `revalidate: 3600`). Veri yoksa şeridi hiç göstermeyin; uydurma rakam koymayın.
- **Efor:** S (etiket) / L (gerçek metrik şeridi)

### 3. Yüksek · UX / bilgi mimarisi · Sayfa yanlış kitleye yazılmış
- **Kanıt:** `page.tsx:55,67-70`: "lib/pii-redact", "JWT", "Idempotency", "session fixation", "Inngest".
- **Sorun:** Bu sayfa footer'dan her ziyaretçiye açık; çoğu da QR okutup geri bildirim veren tüketici. Tüketici dosya yolu ve protokol adı değil, şu soruların yanıtını arıyor: "Yorumum anonim mi?", "İşletme adımı/e-postamı görüyor mu?", "Puanlarım kaybolur mu?", "Verimi nasıl silerim?". Bir işletme sahibi ise "verilerim nerede barınıyor, kim erişiyor, KVKK'ya uygun mu?" diye sorar. Mevcut metin ikisine de yanıt vermiyor.
- **Öneri:** İçeriği kitleye göre iki sekmede yeniden yazın: **"Senin verin"** (tüketici) ve **"İşletmeler için"**. Her madde "ne yapıyoruz → senin için anlamı" kalıbında olsun. Ör. "Geri bildirimin işletmeye adınla birlikte iletilir; e-postan ve telefonun paylaşılmaz". Bu cümle `app/api/export/feedbacks/route.ts:36` ile doğrulanabilir. Teknik detaylar en altta katlanabilir bir "Teknik ayrıntılar" bölümünde kalsın.
- **Efor:** M

### 4. Orta · Güvenlik (recon yüzeyi) · İç uygulama detayları kamuya açılıyor
- **Kanıt:** `page.tsx:55,67`. Öte yandan `app/api/health/route.ts:31-33` yorumu bilinçli olarak "recon yüzeyini daralt" diyor.
- **Sorun:** Sayfa iç modül yollarını (`lib/pii-redact`) ve iş altyapısını (Inngest) listeliyor. Tek başına kritik değil, ama health route'taki bilinçli gizleme politikasıyla çelişiyor ve saldırgana gereksiz parmak izi veriyor.
- **Öneri:** Kod yollarını kaldırın. Alt işlemcileri ise KVKK şeffaflığı için kategoriyle listeleyin ("Barındırma: Vercel (AB, fra1)", "Veritabanı: Neon Postgres", "Hata izleme: Sentry"); bu hukuki bir gereklilik, recon değil.
- **Efor:** S

### 5. Orta · İçerik doğruluğu · PII maskeleme kapsamı abartılı, Inngest yanlış kategoride
- **Kanıt:** `lib/pii-redact.ts` yalnızca `lib/auth-events.ts:7` ve `app/api/admin/compliance/logs/route.ts` içinde kullanılıyor. Inngest `app/api/inngest/route.ts`'de bir iş çalıştırıcısı.
- **Sorun:** "Email, telefon, IP maskeleme" sistem geneli bir garanti gibi okunuyor, oysa yalnızca auth/uyum loglarında uygulanıyor.
- **Öneri:** "Güvenlik ve denetim kayıtlarında kişisel veriler maskelenir" diye daraltın. Uzun vadede `redactForLog`'u merkezi bir logger sarmalayıcısına (ör. `lib/logger.ts`) taşıyıp tüm `console.error` çağrılarının oradan geçmesini sağlayın; iddia ancak o zaman geneller. Inngest'i "izleme" satırından çıkarın.
- **Efor:** S (metin) / L (merkezi redaksiyon)

### 6. Orta · Eksik özellik / ürün · KVKK self-servis aksiyonları bağlanmamış
- **Kanıt:** `app/api/user/data-export`, `app/api/user/delete-account`, `app/api/user/privacy-request` mevcut; UI `components/settings/privacy-security.tsx:111,131`. Güven sayfasında bu yollara link yok.
- **Sorun:** Verimi indir / hesabımı sil yetenekleri zaten var ama güven sayfası bunları göstermiyor. Revolut ve Monzo'da gizlilik sayfası doğrudan "Verilerini indir" aksiyonuna götürür.
- **Öneri:** "Kontrol sende" kartı ekleyin: oturum açıksa `/customer/settings#privacy` derin linki (bölüm id'si eklenmeli), açık değilse `/auth/login?callbackUrl=/customer/settings%23privacy`. Sayfa RSC olduğu için oturum durumunu `auth()` ile sunucuda okuyabilirsiniz, ama bu sayfayı dinamik yapar. Statikliği korumak için CTA'yı her durumda login callback'li link olarak verin.
- **Efor:** S

### 7. Orta · UX / görsel · Görsel hiyerarşi ve marka dili yok
- **Kanıt:** `page.tsx:43-106`: üç özdeş `Card`, `text-sm text-muted-foreground` paragraflar, `<strong>` etiket kalıbı.
- **Sorun:** Landing ve rozet ekranlarındaki cilayla (LazyMotion, 3B, kategori renkleri) yan yana bu sayfa yarım kalmış bir taslak gibi görünüyor. md kırılımında 3. kart tek başına alt satıra düşüyor. Göze çarpan bir "özet güven cümlesi" yok.
- **Öneri:** Bkz. vizyon. Hero'ya tek cümlelik bir taahhüt ve 3-4 rozetlik bir "trust bar" (KVKK, AB veri merkezi, şifreli bağlantı, 7/24 izleme) koyun. Kartları eşit yükseklikte 2×2 ızgaraya getirin, her birine "Daha fazla" ile ilgili hukuki metne giden derin link ekleyin.
- **Efor:** M

### 8. Düşük · Erişilebilirlik · Başlık seviyesi atlıyor, dekoratif ikonlar gizlenmemiş
- **Kanıt:** `page.tsx:34` (h1), `components/ui/card.tsx:44` (`CardTitle` = h3), arada h2 yok. `page.tsx:35,47,62,77`'deki lucide ikonlarında `aria-hidden` yok (lucide-react `^0.303.0`; bu sürümde varsayılan `aria-hidden` olmadığı tahmin ediliyor, doğrulanmadı).
- **Öneri:** Kart başlıklarını `CardTitle asChild` ile ya da doğrudan `<h2>` olarak verin, ikonlara `aria-hidden` ekleyin.
- **Efor:** S

### 9. Düşük · Dil tutarlılığı · TR/EN karışık, marka yazımı tutarsız
- **Kanıt:** `page.tsx:53-54` ("p95 Latency", "Error Rate"), `:70` ("Idempotency"), `:16` ("QRateX"). Proje ve kayıtlarda "Qratex" de kullanılıyor.
- **Öneri:** "Yanıt süresi (p95)", "Hata oranı", "Tekrarlanan isteğe karşı koruma". Marka yazımını tek bir sabite (`lib/site-config.ts`) bağlayın.
- **Efor:** S

### 10. Düşük · SEO / mimari · Breadcrumb JSON-LD ile canonical farklı base URL kullanıyor; sitemap tazeliği sahte
- **Kanıt:** `components/seo/breadcrumb-json-ld.tsx:10` → `lib/site-config.ts:26-28` (env `siteUrl`); `page.tsx:23` → `getCanonicalBase(seo)` (admin `canonicalBase`). `app/sitemap.ts:32`: `lastModified: new Date()`.
- **Öneri:** `BreadcrumbJsonLd`'ye `base` prop'u geçin ya da onu da `getCanonicalBase`'e bağlayın. Sitemap'te sabit bir `CONTENT_UPDATED_AT` sabiti ya da SEO override kaydının `updatedAt`'ini kullanın; aynı sabit sayfadaki "Son güncelleme" satırını da beslesin.
- **Efor:** S

### 11. Düşük · Performans · Statik metin sayfası için ağır loader
- **Kanıt:** `app/(public)/loading.tsx` (tam ekran, `fixed z-[100]`, framer animasyonu).
- **Öneri:** Bu sayfa neredeyse anında render olur. Segment bazlı hafif bir `guven/loading.tsx` (iskelet) ya da hiç loader kullanmamak flash'ı önler. Bu, tüm hukuki sayfalar için ortak bir karar olmalı.
- **Efor:** S

Kritik (veri kaybı, IDOR, yetki) bir hata bulunmadı. Sayfa salt okunur, kullanıcı girdisi almıyor, API çağırmıyor.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Tüketiciye yönelik "Verilerin nasıl kullanılıyor" açıklaması:** Spotify'ın "Privacy Center"ı ve Duolingo'nun gizlilik sayfası gibi. Geri bildirim, puan/XP, oyun ve rozet verisinin ne için tutulduğunu ve işletmenin neyi gördüğünü açıklayan sade bölüm.
2. **Self-servis gizlilik aksiyonları:** Revolut/Monzo tarzı "Verilerini indir", "Hesabını sil", "KVKK başvurusu" butonları. API'ler mevcut, sadece bağlanacak.
3. **Canlı durum ve geçmiş uptime:** Starbucks ve Revolut'un status sayfaları gibi; en azından harici status sayfasına bir link ve son 30 günlük özet.
4. **Alt işlemci ve veri konumu tablosu:** KVKK md. 9 (yurt dışı aktarım) şeffaflığı; işletme müşterilerinin güvenlik anketleri için de gerekli.
5. **Sorumlu ifşa / güvenlik iletişimi:** `/.well-known/security.txt` ve sayfada "Bir açık mı buldun?" kanalı.
6. **Sürümlü politika ve "son güncelleme":** Değişiklik günlüğüyle birlikte; önemli değişikliklerde oturum açmış kullanıcıya uygulama içi bildirim (push merkezi zaten mevcut).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Kullanıcı 10 saniyede "verilerim güvende, kontrol bende" hissine varmalı, 30 saniyede de istediği aksiyona (indir, sil, başvur) ulaşabilmeli. Ton Monzo'nun sade ve insani dili gibi olmalı: teknik jargon yok, her iddia doğrulanabilir.

**Yerleşim (mobil öncelikli):**
1. **Hero:** Tek cümlelik taahhüt ("Geri bildirimin sana ve işletmeye ait; biz yalnızca güvenle taşırız.") ve altında 4 rozetlik trust bar: KVKK uyumlu · AB veri merkezi (fra1) · Uçtan uca TLS · 7/24 hata izleme. Her rozet ilgili bölüme çapa linkle iner.
2. **Kitle sekmesi (segmented control):** "Senin verin" / "İşletmeler için". Aynı sayfada tutulur, `?for=isletme` ile derin linklenebilir. Sekme state'i URL'de taşınır, böylece RSC ve statik kalır (iki içerik de render edilir, CSS/küçük client bileşeniyle değiştirilir).
3. **"Senin verin" bölümü:** "İşletme ne görür / ne görmez" iki sütunlu karşılaştırma (ad: evet; e-posta, telefon: hayır); puan, XP ve rozet verisinin saklanma süresi; anonimlik seçeneği varsa açıklaması.
4. **"Kontrol sende" kartı:** Verimi indir · Hesabımı sil · KVKK başvurusu. Hepsi `/customer/settings#privacy`'ye login-callback'li derin link.
5. **"İşletmeler için" bölümü:** Erişim modeli (bayi kapsamı, `dealerScopeWhere`), dışa aktarma kontrolleri (satır limiti, watermark), oturum güvenliği, alt işlemci tablosu, SLO hedefi ve status linki.
6. **SSS akordeonu:** Native `<details>` ile, JS gerektirmez, klavye ve ekran okuyucu dostu.
7. **Alt bilgi:** Son güncelleme (sabit kaynaktan), güvenlik iletişimi, hukuki metin linkleri.

**Motion/3B:** Ölçülü olmalı. Bu bir güven sayfası; 3B veya parıltı abartı olur. Önerilen tek hareket, trust bar rozetlerinin görünür olunca 40 ms aralıkla `opacity/translateY` ile kademeli girmesi (`m as Motion`, `whileInView`, `viewport={{ once: true }}`). `useReducedMotion` ile tamamen kapatılabilmeli. Layout'taki `LandingBackground` zaten hareketli; okunabilirlik için içerik kartlarına `bg-card/90 backdrop-blur` gibi opak bir yüzey verilmeli (mevcut `Card` zemin rengi arka planla kontrastı korusa da uzun metinde daha sakin bir zemin gerekir).

**Veri/API değişiklikleri:**
- İçeriği kod içindeki JSX'ten `lib/trust-content.ts` içinde tipli bir yapıya taşıyın (`{ id, audience, claim, evidenceRef, updatedAt }`). Böylece her iddianın koddaki karşılığı belgelenir ve sayfa, sitemap ve JSON-LD aynı `updatedAt`'i kullanır.
- İsteğe bağlı metrik şeridi: `lib/trust-metrics.ts` yalnızca gerçek bir kaynaktan (harici uptime izleyici API'si ya da cron ile Redis'e yazılan özet) okur, try/catch ile `null` döner, `null` ise şerit render edilmez (build-time fail-safe kuralı).
- `public/.well-known/security.txt` eklenmeli.
- `components/settings/privacy-security.tsx` içine `id="privacy"` çapası eklenmeli.

---

## Çakışmalar / birleştirme önerisi

- **`/neden-qratex`:** Karşılaştırma tablosunda "KVKK uyumlu, güvenli altyapı" satırı var (`app/(public)/neden-qratex/page.tsx:41`). Çakışma küçük; o satır `/guven`'e link vermeli, içerik tekrarlanmamalı.
- **`/kvkk-aydinlatma-metni`, `/gizlilik-politikasi`, `/cerez-politikasi`, `/kullanim-sartlari`:** `/guven` bunlara hub olmalı, kopyası değil. Hukuki metinler ayrı URL'lerde kalmalı (hukuki referans ve SEO için). `/guven` bunların insan diliyle yazılmış özeti ve giriş kapısı olarak konumlanmalı. Birleştirme önerilmiyor.
- **`/customer/settings` (gizlilik ve güvenlik):** Aksiyonlar orada kalmalı; `/guven` yalnızca derin link vermeli. Ters yönde, ayarlar ekranından da "Verilerini nasıl koruyoruz?" linkiyle `/guven`'e dönüş eklenmeli.
- Karar: **kaldırılmamalı, birleştirilmemeli; yeniden tasarlanmalı** ve hukuki sayfaların hub'ı yapılmalı.

---

## Doğrulama (şüpheci inceleme)

### İddia 1: "Güven sayfası, var olmayan bir güvenlik kontrolünü (export signed URL) kamuya garanti ediyor" (Karar: **DOĞRULANDI**)

**Çürütme denemesi:** Repoda süreli/imzalı indirme bağlantısı üreten herhangi bir mekanizma arandı: `getSignedUrl`, `presign`, `signedUrl`, `signed_url`, `s3-request-presigner`, `X-Amz-Signature`, `createSignedUrl`, `signUrl` (node_modules, .next ve docs hariç). Sonuç: hiçbir eşleşme yok. R2 dahil hiçbir depolama katmanında presigned URL üretilmiyor.

**Kanıt:**
- `app/(public)/guven/page.tsx:68`: `Export: Satır limiti, watermark, signed URL.` herkese açık, statik metin.
- `app/api/export/feedbacks/route.ts:3`: yorum "response CSV veya signed download URL" diyor, ama `:59-65` yalnızca `new NextResponse(BOM + csv, { 'Content-Disposition': attachment })` döndürüyor. Signed URL dalı hiç yazılmamış.

**İddiayı güçlendiren ek bulgu (orijinal denetçi kaçırmış):** Durum iddia edilenden de kötü. `app/api/export/feedbacks/route.ts` uygulamada **hiçbir yerden çağrılmıyor**. `export/feedbacks` ve `/api/export` aramaları yalnızca bu denetim belgelerini döndürüyor, yani route ölü kod. Gerçek dışa aktarımlar tarayıcıda `Blob` ile üretiliyor:
- `app/dealer/feedbacks/page.tsx:440`: `exportToCSV(allData, 'geri_bildirimler', feedbackCSVColumns)`. `options` verilmediği için **watermark yok**. Satır limiti yalnızca ekrana zaten yüklenmiş veriyi kırpıyor (`lib/export-utils.ts:49-50`), sunucu tarafında bir sınır değil.
- `app/admin/feedbacks/page.tsx:331-333`: watermark var ama `userId: 'admin'` sabit kodlu, yani dışarı sızan bir dosyayı gerçek kişiye bağlamaya yaramıyor.
- `lib/export-utils.ts:72-82`: `URL.createObjectURL` ile yerel `blob:` URL'si. Sunucu tarafında erişim kontrolü, süre sınırı ya da denetim kaydı yok.

Bu yüzden envanterdeki #10 ("Satır limiti", ÇALIŞIYOR) ve #11 ("watermark", ÇALIŞIYOR) satırları da iyimser. Kanıt olarak gösterilen route kullanılmıyor. Gerçek akışta işletme panelinde watermark yok, admin panelinde de anlamsız. Doğru durum her ikisi için **KISMİ**.

**Yeniden üretim senaryosu:**
1. Bir işletme sahibi `/guven` sayfasını okuyor ve "export'lar signed URL ile korunuyor, watermark'lı" bilgisini güvenlik anketine aktarıyor.
2. `/dealer/feedbacks` sayfasında "Excel (CSV)" düğmesine basıyor. Dosya tarayıcıda `blob:` URL'siyle iniyor. İçinde watermark satırı yok, sunucuya hiçbir export isteği gitmiyor (ağ sekmesinde `/api/export/*` çağrısı görünmez).
3. Denetçi ya da müşteri bunu fark ettiğinde beyan yanlış çıkıyor. KVKK açısından yanıltıcı teknik tedbir beyanı oluyor, ticari açıdan da güven kaybı.

**Not / öneri:** Kod hatası değil, kamuya yapılmış yanlış bir güvenlik beyanı. Ciddiyeti Yüksek olarak kalmalı. Önerilen sıra:
1. **Hemen (S):** `page.tsx:68` metnini gerçeğe çekin. "signed URL" kaldırılmalı. Watermark, tüm export yolları gerçekten kapsanana kadar iddia edilmemeli.
2. **Kısa vade (M):** Tüm geri bildirim dışa aktarımlarını tek bir sunucu yoluna toplayın. `/api/export/feedbacks` route'unu canlandırıp admin/dealer filtrelerini kabul eder hale getirin. İstemcideki `exportToCSV` çağrılarını bu uca yönlendirin. Watermark `session.user.id` ile sunucuda basılsın. Her export, kim/ne zaman/kaç satır bilgisiyle bir denetim kaydına yazılsın. CSV formül enjeksiyonu kaçışı da (`admin_feedbacks.md` bulgusu) aynı yerde tek seferde çözülür.
3. **Orta vade (M):** Büyük export'lar için dosyayı R2'ye yazıp `lib/r2-storage.ts` üzerinde kısa TTL'li (ör. 5-15 dk) presigned GET URL üreten bir yardımcı ekleyin. "signed URL" iddiası sayfaya ancak bu yayına alındıktan sonra geri dönmeli.

---

## Uygulama (Dalga 2)

Sahip: `p-landing`. Commit'ler: `67763e8`, `c0df701`. Sayfa "Güven Merkezi" olarak yeniden yazıldı; ops kaydı (sakin, hareketsiz). **Kural:** her madde uygulamanın bugünkü davranışını anlatır ve koddaki bir kaynağa dayanır; iddia ↔ kanıt eşlemesi `components/public/p-landing/trust-copy.ts` başlığında tutulur. İç dosya yolları ve iş altyapısı adları yayından çıktı.

Yerleşim: hero (taahhüt cümlesi + 4 çapalı güven çipi) + **canlı sistem durumu** (`/api/health?light=1`, sayfa açılınca ve "Tekrar kontrol et" ile) → "Senin verin" (ne toplanır/neden; **işletme ne görür / ne görmez**; AI'a yalnız metin; rızaya bağlı analitik + "Çerez tercihlerimi yönet"; lig görünürlüğü) → "Kontrol sende" (verilerimi indir, KVKK başvurusu, hesabımı sil → gizlilik ayarları; işletmeler için e-posta) → "İşletmeler için" (kiracı ayrımı, ekip rolleri/maskeli e-posta, Stripe'ta ödeme, dışa aktarma sınırı) → güvenlik uygulamaları (10 madde, sade dil) → alt işlemci tablosu (12 sağlayıcı, amaç, veri; yurt dışı aktarım notu + KVKK metni) → sorumlu bildirim (`/.well-known/security.txt` eklendi) + yasal belge hub'ı → gizlilik SSS'si → "Son güncelleme" (sabit tarih).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Metadata + admin override | ÇALIŞIYOR | `buildPublicMetadata` (canonical, tam OG/Twitter) |
| 2 | AboutPage JSON-LD | ÇALIŞIYOR | `dateModified` sabit içerik tarihi, kaçışlı |
| 3 | BreadcrumbList JSON-LD | ÇALIŞIYOR | Artık canonical tabanıyla (env `siteUrl` ayrışması kapandı) |
| 4 | Görsel breadcrumb | ÇALIŞIYOR | — |
| 5 | Başlık + ikon | ÇALIŞIYOR | Dekoratif ikonlarda `aria-hidden`; h1 → h2 → h3 sırası düzgün |
| 6 | "%99.9 uptime / aylık < 43 dk" | KALDIRILDI | Ölçülmüyordu; yerine canlı sağlık kontrolü (gerçek yanıt süresi + saat) |
| 7 | "p95 < 300ms", "Error Rate < %0.1" | KALDIRILDI | Ölçülmüyordu |
| 8 | "İzleme: Sentry, Vercel Analytics, Inngest" | ÇALIŞIYOR (düzeltildi) | Sentry (hata izleme) ve Vercel Analytics (çerezsiz) doğru sınıfta; Inngest listeden çıktı |
| 9 | PII maskeleme iddiası | ÇALIŞIYOR (daraltıldı) | "Güvenlik kayıtlarında e-posta, telefon ve IP maskelenir" — gerçek kapsam |
| 10 | Export satır limiti | KALDIRILDI (iddia) | Gerçek akış istemci tarafında; yerine doğru iddia: "yalnız yetkili oturum + işletmenin kendi verisi" |
| 11 | Export watermark | KALDIRILDI (iddia) | Bayi dışa aktarımında yok; iddia edilmiyor |
| 12 | Export "signed URL" | KALDIRILDI | Yanlış beyandı |
| 13 | Oturum güvenliği | ÇALIŞIYOR | Sade dil: şifre değişince/askıda eski oturum geçersiz (`sessionVersion`), belirteç tekrarının tespiti |
| 14 | Idempotency | ÇALIŞIYOR | "Çift işlem koruması" maddesi |
| 15 | Yasal belge linkleri | ÇALIŞIYOR | Açıklamalı hub kartları |
| 16 | Duyarlı grid | ÇALIŞIYOR | Tek başına kalan kart sorunu yok (1/2/3/4 kolon bölümlere göre) |
| 17 | Yükleniyor | ÇALIŞIYOR | Statik iskelet |
| 18 | Hata durumu | ÇALIŞIYOR | SEO fail-safe; canlı durum "çalışıyor / sorun var / alınamadı" ayrımı (ağ hatası kesinti diye raporlanmaz) |
| 19 | Footer + sitemap | ÇALIŞIYOR | Footer'da "Güven Merkezi"; sitemap `lastModified` sabit tarih |
| 20 | Header/panel içinden erişim | KISMİ (açık) | Landing ve `/neden-qratex` SSS'lerinden ve karşılaştırma tablosundan link var; müşteri ayarlarından geri link m-ayarlar'ın işi |
| 21 | Son güncelleme | ÇALIŞIYOR | `TRUST_CONTENT_UPDATED_AT` (sayfa + sitemap aynı sabit) |
| 22 | KVKK self-servis | ÇALIŞIYOR | İndir / başvuru (4 tür, 30 gün, makbuz e-postası) / sil → `/customer/settings?tab=privacy` (yeni `/customer/me/settings`'e derin linkle yönlenir); oturumsuzsa giriş istenir |
| 23 | Tüketiciye şeffaflık | ÇALIŞIYOR | "İşletme görür / görmez" (ad + foto evet; sahibi kart kaydı varsa e-posta, personel maskeli; telefon/şifre/başka işletme/üyesiz kimlik hayır) — `app/api/feedbacks`, `app/api/dealer/customers` ile doğrulandı |
| 24 | Canlı durum | ÇALIŞIYOR | Sayfa içi sağlık kontrolü; harici status sayfası/geçmiş uptime yok (aşağıda) |
| 25 | security.txt / sorumlu bildirim | ÇALIŞIYOR | `public/.well-known/security.txt` (RFC 9116: Contact, Expires, Preferred-Languages) + sayfada kanal |
| 26 | Alt işlemciler / veri konumu | ÇALIŞIYOR | 12 sağlayıcı; doğrulanabilen tek bölge iddiası Vercel `fra1` (Frankfurt); diğerleri için bölge iddia edilmedi, yurt dışı aktarım notu + KVKK metni linki |
| 27 | SSS / iletişim | ÇALIŞIYOR | `<details>` SSS + FAQPage JSON-LD; güvenlik bildirimi e-postası |

**Kapanan bulgular:** 1, 2 (ölçülmeyen rakamlar kalktı, canlı kontrol geldi), 3, 4, 5, 6, 7, 8, 9, 10, 11 → **11/11**.

**Eksik özelliklerden uygulananlar:** 1, 2, 4, 5, 6 (sabit "son güncelleme"). Kısmen: 3 (canlı anlık kontrol var; geçmiş uptime/harici status sayfası yok — gerçek bir ölçüm kaynağı gerektirir, uydurma rakam konmadı).

**Kalanlar:** geçmiş 30 günlük uptime şeridi için harici izleyici/cron özetinin Redis'e yazılması (altyapı işi); dışa aktarımların sunucuya alınıp watermark + denetim kaydı + presigned URL ile verilmesi (bayi/admin dışa aktarma sahiplerinin işi — o zaman iddia sayfaya geri eklenebilir); müşteri ayarlarından `/guven`'e geri link (m-ayarlar).
