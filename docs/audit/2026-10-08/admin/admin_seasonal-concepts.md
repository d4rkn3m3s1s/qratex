# /admin/seasonal-concepts

**Amaç:** Platform operatörünün yaz, kış, Cadılar Bayramı gibi "dönemsel konseptleri" bir tarih aralığına planlaması. Konsept aktif olunca tüm kullanıcılara arka plan efekti, renk paleti ve üst banner otomatik uygulanmalı.

**Genel puan:** 4.3 / 10

**Karar:** **yeniden tasarla.** Ayrıca `/admin/seasonal-campaigns` ile tek bir "Sezon Takvimi" merkezinde birleştirilmeli (aşağıda anlatılıyor).

Kısaca: Sayfa temel CRUD işini yapıyor (oluşturma, açıp kapatma, silme). Ancak vaat ettiği üç görsel unsurdan biri hiç çalışmıyor: **arka plan efekti hiçbir yere bağlı değil**. Renk paleti de yan etki üreterek uygulanıyor. Çalışan bir konsept pasifleştirilince **listeden tamamen kayboluyor** ve geri açılamıyor. Konsept düzenlenemiyor. `bonusMultiplier` alanı ise veritabanında duruyor ama hiçbir yerde kullanılmıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3.5/10 | Üç görsel unsurdan biri sahte (arka plan), palet yan etkili, pasifleştirilen konsept kayboluyor, düzenleme yok. |
| UX | 4/10 | "Şu an canlı olan hangisi?" sorusu cevapsız. Önizleme, çakışma uyarısı, silme onayı ve düzenleme yok. Zod hata mesajları İngilizce. |
| Görsel | 5.5/10 | Ortak `AdminPremiumHero` ile tutarlı ve temiz. Ancak zaman çizelgesi düz metin listesi; efekt ve tema ham ID olarak gösteriliyor. |
| Mimari | 5/10 | Settings cache + saatlik senkron fikri doğru. Uygulamada öncelik cache'i bayatlıyor, cron yolu tek uyanışlı `daily` orkestratörünün dışında kalıyor, istemci tarafında palet yarışı var. |
| Performans | 5/10 | Admin sayfası hafif. Ama sayfanın beslediği public uç, her ziyaretçinin her tam sayfa yüklemesinde Redis'siz olarak veritabanına gidiyor (aktif konsept yoksa iki sorgu). |
| Erişilebilirlik + Mobil | 4/10 | `Label`'lar input'lara bağlı değil, silme ikon butonunun `aria-label`'ı yok, yükleniyor durumu düz metin. Mobilde flex-wrap ve grid düzgün yığılıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa başlığı (`AdminPremiumHero`) | ÇALIŞIYOR | `app/admin/seasonal-concepts/page.tsx:197-202` | Açıklama "arka plan … otomatik aktive olur" diyor, ama arka plan çalışmıyor (#7). |
| 2 | Hazır şablon butonları (7 adet) | KISMİ | `page.tsx:205-219`, `lib/seasonal-concept-options.ts:53-110` | Form doldurmayı yapıyor. Ancak doldurulmuş formu onay sormadan eziyor. "Cadılar Bayramı" şablonu `meteors` efektini, "Yaz" şablonu mor `amethyst` paletini kullanıyor (`options.ts:59-60,99-100`). Banner metinleri "Bol puan" vaat ediyor ama arkasında bir puan çarpanı yok. |
| 3 | Şablonda varsayılan tarih (bugün + 14 gün) | ÇALIŞIYOR | `page.tsx:83-87` | Yerel saatle `datetime-local` formatında dolduruyor. |
| 4 | Konsept adı alanı | KISMİ | `page.tsx:231-232`, `route.ts:12` | `min(2)` ihlalinde Zod'un İngilizce varsayılan mesajı toast olarak gösteriliyor (`route.ts:58`). |
| 5 | Öncelik alanı | KISMİ | `page.tsx:235-236`, `route.ts:17` | Negatif ya da ondalık değerde (`1.5`) İngilizce Zod hatası çıkıyor. Üst sınır (1000) arayüzde belirtilmemiş. Önceliğin etkisini anlatan bir şey yok. |
| 6 | Başlangıç ve bitiş (`datetime-local`) | KISMİ | `page.tsx:239-244,108-109`, `route.ts:25-28` | Sunucu "bitiş > başlangıç" kontrolünü yapıyor. İstemcide anlık doğrulama yok, saat dilimi gösterilmiyor. |
| 7 | Arka plan efekti seçimi | **SAHTE** | `seasonal-concept-applier.tsx:56-59`, `components/ui/backgrounds/dynamic-background.tsx:89-110` | Değer kaydediliyor ve istemcide `data-seasonal-bg` attribute'u ile `seasonal-active` sınıfı basılıyor. Ancak bunları okuyan hiçbir bileşen ya da CSS yok (repo genelinde grep: tek eşleşme applier'ın kendisi). `DynamicBackground` yalnızca `/api/settings/background`'ı okuyor. Seçim kullanıcıya hiç yansımıyor. |
| 8 | Renk paleti seçimi | KISMİ | `seasonal-concept-applier.tsx:47-54`, `lib/apply-runtime-theme.ts:87-127`, `components/providers.tsx:143-180` | Palet uygulanıyor. Ancak `background` ve `foreground` verilmediği için aktif temanın `--background`, `--card`, `--foreground` vb. değişkenleri **siliniyor**. Açık mod varyantları (`arcticLight` vb.) yok sayılıyor. Kullanıcı açık/koyu mod değiştirince `ThemeColorsProvider` paleti geri yazıyor ve konsept paleti kayboluyor. |
| 9 | Banner emoji | ÇALIŞIYOR | `page.tsx:283-284`, `route.ts:21` | `maxLength=8` istemci ve sunucuda tutarlı (UTF-16). |
| 10 | Banner metni | ÇALIŞIYOR | `page.tsx:286-294`, `seasonal-concept-applier.tsx:81-101` | Tüm sitede üstte banner olarak gösteriliyor. |
| 11 | Oluştur butonu | KISMİ | `page.tsx:91-129,297-299`, `route.ts:63-92` | Kayıt oluşturuluyor. Ama kayıttan sonra `syncActiveSeasonalConcept` patlarsa 500 dönüyor (kayıt yine de DB'de kalıyor). Form temizlenmiyor ve tekrar basılırsa **mükerrer kayıt** oluşuyor. |
| 12 | Açıklama (`description`) | EKSİK | Şema `prisma/schema.prisma:1880`, API `route.ts:13`; arayüzde alan yok | Modelde ve API'de var, formda yok. |
| 13 | Bonus çarpanı (`bonusMultiplier`) | **SAHTE / ÖLÜ** | `schema.prisma:1893`, `route.ts:22,75`, `seasonal-concept-core.ts:42` | Arayüzde alan yok. Repo genelinde puan hesabında okuyan kod yok. Her kayıt `1.0` ile yazılıyor. Kavram olarak `/admin/seasonal-campaigns`'in `multiplier` alanını kopyalıyor. |
| 14 | Listeyi yükleme | KISMİ | `page.tsx:62-69` | `r.ok` kontrol edilmiyor. 401/500/503 durumunda `data.concepts` tanımsız kalıyor, liste boş görünüyor ve hata toast'ı çıkmıyor. Yanıltıcı "Aktif konsept yok" mesajı gösteriliyor. |
| 15 | Yükleniyor durumu | KISMİ | `page.tsx:304-305` | Düz "Yükleniyor…" metni. İskelet yok, `aria-busy` yok. |
| 16 | "Şu an aktif" bölümü | KISMİ | `page.tsx:157-159,308-317` | Birden fazla aktif konsept varsa hangisinin **gerçekten canlıda** olduğu (öncelik ve geç başlangıç kuralı, `seasonal-concept-core.ts:34`) gösterilmiyor. |
| 17 | "Yaklaşan" bölümü | KISMİ | `page.tsx:160,319-326`, `route.ts:36` | API `startDate desc` sıralıyor. En uzak gelecekteki konsept en üstte çıkıyor; doğrusu en yakının üstte olması. |
| 18 | "Geçmiş" bölümü | ÇALIŞIYOR | `page.tsx:161,328-333` | Sayfalama yok, `take: 200` (`route.ts:37`). |
| 19 | Pencere içindeki pasif konsept | **BOZUK** | `page.tsx:157-161` | `active` filtresi `isActive` koşulu istiyor, `upcoming` ve `past` ise yalnızca tarihe bakıyor. Penceresi açık ama `isActive=false` olan bir konsept **hiçbir bölümde görünmüyor**. Çalışan konsepti "Pasifleştir" ile kapatınca kayıt ekrandan siliniyor ve tekrar aktifleştirilemiyor. |
| 20 | Aktifleştir / Pasifleştir | KISMİ | `page.tsx:131-143,185-187` | İşlemde bekleme durumu ya da `disabled` yok, çift tıklamada iki ters PUT yarışıyor. Başarı geri bildirimi yok. #19 hatasını tetikleyen buton bu. |
| 21 | Sil | KISMİ | `page.tsx:145-154,188-190` | Onay ve geri alma yok, tek tıkla kalıcı siliniyor. İkon butonunda `aria-label` yok. Audit kaydında `oldData` tutulmuyor (`route.ts:170-178`), yani silinen konsept geri kurulamıyor. |
| 22 | Düzenleme | EKSİK | PUT ucu tüm alanları destekliyor (`route.ts:115-127`); arayüz sadece `isActive` gönderiyor | Tarih uzatmak ya da banner metni düzeltmek için silip yeniden oluşturmak gerekiyor. |
| 23 | Satır meta bilgisi | KISMİ | `page.tsx:176-182` | Saat gösterilmiyor (sadece tarih). Efekt ve tema ham ID olarak görünüyor (`efekt: ice-kingdom`, `tema: forestNight`); seçenek etiketleri ya da renk örnekleri kullanılmıyor. |
| 24 | Hata bildirimleri (toast) | KISMİ | `page.tsx:125,141,152`, `route.ts:58,111` | Zod alan mesajları özelleştirilmemiş ve İngilizce. Dil karışıklığı var. |
| 25 | Yetki kontrolü | ÇALIŞIYOR | `route.ts:32,52,105,157` (`requireAuth(['ADMIN'])`), `proxy.ts:51,79` (rol + gate cookie) | IDOR riski yok; kaynak zaten global ve yalnızca ADMIN'e açık. |
| 26 | Audit log | KISMİ | `route.ts:80-89,132-141,170-178` | Kayıt yazılıyor ama `oldData` yok. Sayfada geçmiş ya da "kim değiştirdi" görünümü yok. Yazımlar transaction içinde değil. |
| 27 | Anında yansıtma (`syncActiveSeasonalConcept`) | KISMİ | `route.ts:91,143,180`, `seasonal-concept-core.ts:66-80` | Kayıttan sonra Settings cache'i güncelleniyor. Ancak `getActiveSeasonalConcept` hatayı yutup `null` döndüğü için (`core.ts:57-59`) geçici bir DB hatası canlı konsepti cache'ten **silebiliyor**. |
| 28 | Saatlik aktivasyon cron'u | KISMİ / doğrulanmadı | `lib/inngest/functions.ts:205-213` (`5 * * * *`), `app/api/internal/inngest/seasonal-concept-activation/route.ts`, `app/api/cron/daily/route.ts:51-59` | Yalnızca Inngest'e bağlı. Tek uyanış kuralıyla toplanan `daily` orkestratörünün listesinde yok. Inngest'in prod'da aktif olup olmadığı doğrulanmadı. |
| 29 | Public uç ve istemcide uygulama | KISMİ | `app/api/settings/seasonal-concept/route.ts:17-33`, `components/providers.tsx:235` | Cache'teki konseptin bitişi gelecekteyse cache dönüyor. Bu süre içinde başlayan **daha yüksek öncelikli** bir konsept, cron çalışana ya da admin bir kayıt yapana kadar görünmüyor. Ayrıca her tam sayfa yüklemesinde (root `Providers`) Redis'siz DB sorgusu yapılıyor. |
| 30 | Banner kapatma (`sessionStorage`, konsept ID'sine bağlı) | ÇALIŞIYOR | `seasonal-concept-applier.tsx:61-79` | Yeni konseptte banner yeniden çıkıyor. Doğru davranış. |
| 31 | Mobil düzen | KISMİ | `page.tsx:166,229` | Satır ve form yığılıyor. 7 şablon butonu mobilde 3-4 satıra taşıyor. Liste satırındaki butonlar dar ekranda alta düşüyor (kabul edilebilir). |
| 32 | Form erişilebilirliği (`Label` ↔ `Input`) | EKSİK | `page.tsx:231-293` | `htmlFor`/`id` eşleşmesi yok. Ekran okuyucu alan adını okumuyor, etikete tıklayınca odak taşınmıyor. |
| 33 | Çakışma tespiti | EKSİK | — | Aynı pencerede birden fazla konsept olduğunda uyarı ya da "kazanan şu olacak" göstergesi yok. |
| 34 | Canlı önizleme (palet, banner, efekt) | EKSİK | — | Admin, kaydetmeden önce kullanıcının ne göreceğini göremiyor. `qratex:theme-palette-preview` olayı mevcut (`providers.tsx:117-131`) ama kullanılmıyor. |

**Durum özeti:** 8 ÇALIŞIYOR · 18 KISMİ · 1 BOZUK · 2 SAHTE · 5 EKSİK (toplam 34)

---

## Bulgular

### 1. Arka plan efekti hiçbir yere bağlı değil (SAHTE özellik)
- **Önem:** yüksek · **Kategori:** işlevsellik / sahte özellik · **Efor:** M
- **Kanıt:** `components/seasonal/seasonal-concept-applier.tsx:56-59` yalnızca `root.dataset.seasonalBg` ve `body.classList.add('seasonal-active')` yazıyor. `seasonalBg|seasonal-bg|seasonal-active|data-seasonal` için repo genelinde arama yapıldı; tek eşleşme bu dosya. `components/ui/backgrounds/dynamic-background.tsx:89-110` ve `components/landing/LandingBackground.tsx:38` arka planı yalnızca `/api/settings/background`'dan alıyor. `app/api/settings/background/route.ts` dosyasında "seasonal" kelimesi geçmiyor.
- **Sorun:** Sayfa başlığı "arka plan … otomatik aktive olur" diyor ve formun en görünür alanı bu. Admin 17 efekt arasından seçim yapıyor ama kullanıcı hiçbir değişiklik görmüyor. Operatör ürüne yanlış bilgiyle güveniyor.
- **Öneri:** Arka plan çözümlemesini tek bir kaynağa bağlayın. `/api/settings/background` (ya da sunucu tarafı `lib/get-background-effect.ts`) şu sırayla karar vermeli: "aktif konseptin `backgroundEffect` değeri varsa o, yoksa global ayar". Böylece `DynamicBackground` ve `LandingBackground` değişmeden doğru efekti alır. Alternatif yol: `SeasonalConceptApplier` bir `qratex:seasonal-background` olayı yayınlar, `DynamicBackground` bunu dinleyip `setVariant` çağırır. İlk yol tercih edilmeli: sunucuda karar verilir, flash olmaz. Ayrıca `VALID_VARIANTS` ile `SEASONAL_BACKGROUND_OPTIONS` arasında Zod `enum` doğrulaması eklenmeli (`route.ts:18` şu an serbest `string`).

### 2. Pencere içindeki pasif konsept listeden kayboluyor; geri açılamıyor
- **Önem:** yüksek · **Kategori:** veri görünürlüğü / bozuk akış · **Efor:** S
- **Kanıt:** `page.tsx:157-161`: `active` için `isActive && start<=now && end>=now`, `upcoming` için `start>now`, `past` için `end<now`. `start<=now<=end && !isActive` durumu hiçbir kümeye düşmüyor.
- **Sorun:** Operatör canlıdaki kampanyayı acil durdurmak için "Pasifleştir"e basıyor, satır ekrandan siliniyor. Tekrar açmak için arayüzde yol yok. Kayıt DB'de duruyor ama yönetilemiyor; yalnızca silinip yeniden oluşturulabilir, o da görünmediği için silinemez.
- **Öneri:** Durumu tek bir türetilmiş alandan hesaplayın: `status = 'live' | 'shadowed' | 'paused' | 'scheduled' | 'ended'`. "Duraklatılmış" ayrı bir rozet ve bölüm olarak gösterilmeli. Daha iyisi, durumu sunucu hesaplasın ve GET yanıtında dönsün (aşağıdaki bulgu 5 ile birlikte).

### 3. Konsept paleti aktif temanın arka plan ve metin değişkenlerini siliyor; mod değişince kayboluyor
- **Önem:** yüksek · **Kategori:** hata / istemci yarışı · **Efor:** M
- **Kanıt:** `seasonal-concept-applier.tsx:49-53` yalnızca `primary/secondary/accent` gönderiyor. `lib/apply-runtime-theme.ts:100-110,121-127` ise `background` ve `foreground` verilmediğinde `--background`, `--card`, `--popover`, `--muted`, `--border`, `--foreground`… değişkenlerini **kaldırıyor**. `components/providers.tsx:143-180`'deki `ThemeColorsProvider` `resolvedTheme` her değiştiğinde kendi paletini yeniden yazıyor; applier ise yalnızca `[concept]` değiştiğinde çalışıyor (`applier.tsx:68`). Açık mod varyantı (`arcticLight` vb., `lib/theme-presets.ts:53-58`) seçilmiyor.
- **Sorun:** (a) Admin'in tam tema (arka plan dahil) seçtiği bir sitede konsept açılınca yüzeyler varsayılan CSS'e dönüyor. (b) Kullanıcı açık/koyu mod değiştirince konsept paleti kayboluyor. (c) Açık modda koyu mod paleti uygulanıyor ve kontrast düşüyor. Ayrıca `ThemeColorsProvider`'ın mount sonrası `loadThemeSettings` yanıtı applier'dan sonra gelirse ve özel tema seçiliyse konsept paleti yine eziliyor.
- **Öneri:** Konsept paletini ayrı bir uygulayıcı yerine `ThemeColorsProvider`'ın girdisi yapın. `seasonalThemeId` state'i provider'a alınmalı ve etkin tema `seasonalThemeId ?? activeThemeId` olarak çözülmeli. Böylece `resolveThemeIdForMode` (açık/koyu varyant) ve `presetRow.colors.background/foreground` aynı yoldan uygulanır. `applyRuntimeThemeToRoot`'un "verilmeyen anahtarı sil" davranışı kısmi güncellemeler için tehlikeli; bir `partial: true` seçeneği eklenmeli.

### 4. `bonusMultiplier` ölü alan ve şablon metinleri karşılıksız puan vaat ediyor
- **Önem:** orta · **Kategori:** veri modeli / ürün dürüstlüğü · **Efor:** S (kaldırma) / M (bağlama)
- **Kanıt:** `prisma/schema.prisma:1892-1893`, `route.ts:22,75,127`, `seasonal-concept-core.ts:19,42,54,94`. Puan hesaplayan kodda okuyan yok (`grep bonusMultiplier`, yalnızca bu dört dosya). Şablon metinleri: "Bol puan, sıcak sürprizler" (`options.ts:58`), "Bol puan seni bekliyor" (`page.tsx:291` placeholder).
- **Sorun:** Puan çarpanı zaten `/admin/seasonal-campaigns` (`SeasonalCampaign.multiplier`, `lib/seasonal-campaign-live.ts:44`) tarafından yönetiliyor. Konseptteki alan ikinci ve sessiz bir doğruluk kaynağı. Banner'lar kullanıcıya puan vaat ediyor ama ekonomi tarafında karşılığı yok. Bu, puan ekonomisi değişmezleri açısından güven sorunu yaratıyor.
- **Öneri:** `bonusMultiplier` bu modelden kaldırılmalı. Konsepte isteğe bağlı bir `campaignId` (FK → `SeasonalCampaign`) eklenmeli; konsept "görsel katman", kampanya "ekonomi katmanı" olur. Banner metni puan vaat ediyorsa kaydetmede bağlı kampanya istenmeli ya da en azından uyarı gösterilmeli.

### 5. Public uçta öncelik cache'i bayatlıyor ve aktivasyon cron'u tek uyanış orkestratörünün dışında
- **Önem:** orta · **Kategori:** mimari / doğruluk · **Efor:** M
- **Kanıt:** `app/api/settings/seasonal-concept/route.ts:27-29`: cache'teki konseptin `endDate > now` ise doğrudan dönüyor. Aktivasyon yalnızca Inngest'e bağlı (`lib/inngest/functions.ts:205-213`). `app/api/cron/daily/route.ts:51-59` listesinde seasonal işi yok. 953c8fe commit'i tüm periyodik işlerin buraya toplanmasını kural olarak koydu.
- **Sorun:** A konsepti (bitiş 31 Aralık) cache'teyken 20 Aralık'ta başlayan **daha yüksek öncelikli** B konsepti, cron çalışana kadar görünmüyor. Inngest prod'da çalışmıyorsa B, A bitene kadar hiç görünmeyebilir (doğrulanmadı). Admin ekranı B'yi "Şu an aktif" gösterirken kullanıcı A'yı görüyor.
- **Öneri:** Cache'i "aktif konsept" değil **zaman çizelgesi** olarak saklayın: önümüzdeki N günün aktif ve yaklaşan konseptleri (`isActive`, pencere, öncelik). Public uç kazananı bellekte `now` ile çözsün. Böylece cron'a gerek kalmaz ve sınır anları doğru olur. Settings yerine Upstash Redis'e (TTL ve admin yazımında invalidate ile) taşınmalı. Cron korunacaksa `daily` orkestratörüne eklenmeli.

### 6. Her sayfa yüklemesinde cache'siz DB sorgusu (Neon uyanma maliyeti)
- **Önem:** orta · **Kategori:** performans / maliyet · **Efor:** S-M
- **Kanıt:** `components/providers.tsx:235` (`SeasonalConceptApplier` root `Providers` içinde), `seasonal-concept-applier.tsx:30` (`cache: 'no-store'`), `route.ts:20-23,32` (Settings okuma ve gerekirse `findFirst`), `PRIVATE_NO_STORE_HEADERS` (`lib/api-http.ts:8-10`), CDN ya da Redis katmanı yok.
- **Sorun:** Yılın çoğunda aktif konsept olmadığından her ziyaretçinin her tam sayfa yüklemesi **iki** Postgres sorgusu yapıyor. Proje Neon compute süresi limitine takılıp duraklatılmıştı (953c8fe). Bu uç, compute'u uyanık tutan public trafik kaynaklarından biri.
- **Öneri:** Kazanan konsepti sunucuda, root layout'ta Redis üzerinden çözün (`unstable_cache`/`'use cache'` + `revalidateTag('seasonal')`, admin yazımlarında tag invalidation). Değeri `Providers`'a prop olarak geçirin; böylece istemci fetch'i ve palet flash'ı ortadan kalkar. En azından uç `public, s-maxage=60, stale-while-revalidate=300` ile CDN'de önbelleğe alınmalı (içerik kullanıcıya özel değil).

### 7. Konsept düzenlenemiyor
- **Önem:** orta · **Kategori:** eksik özellik / UX · **Efor:** M
- **Kanıt:** PUT tüm alanları kabul ediyor (`route.ts:115-127`), arayüz yalnızca `{ id, isActive }` gönderiyor (`page.tsx:136`).
- **Sorun:** Tarih uzatmak, yazım hatasını düzeltmek ya da paleti değiştirmek için silip yeniden oluşturmak gerekiyor. Audit izi kopuyor ve ID değiştiği için bağlı banner dismiss anahtarı (`seasonal-banner-dismissed-${id}`) sıfırlanıyor.
- **Öneri:** Satıra tıklayınca sağdan açılan bir **Sheet** içinde aynı form "düzenle" modunda gelmeli; "Kopyala" (gelecek yıla klonla) aksiyonu da eklenmeli. PUT için `updateSchema`'ya da bitiş > başlangıç doğrulaması eklenmeli (şu an `baseSchema.partial()` refine'ı atlıyor, `route.ts:29`). DB'deki mevcut değerle birleştirilerek kontrol edilmeli.

### 8. Kayıttan sonraki senkron hatası 500 döndürüyor; mükerrer kayıt riski
- **Önem:** orta · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** `route.ts:63-92`: `create` → `auditLog.create` → `syncActiveSeasonalConcept()`. Son ikisinden biri patlarsa catch bloğu 500 dönüyor (`route.ts:93-100`). İstemci formu temizlemiyor (`page.tsx:113,124-125`).
- **Sorun:** Konsept oluşmuş ama kullanıcı "oluşturulamadı" görüyor, tekrar basınca ikinci kayıt oluşuyor. Ayrıca `getActiveSeasonalConcept` hatayı yutup `null` döndüğünden (`core.ts:57-59`) geçici bir DB hatası Settings'teki canlı konsepti `null` ile eziyor.
- **Öneri:** `create` ve `auditLog`'u `prisma.$transaction` ile sarın. Senkronu best-effort yapın (try/catch + log, ya da `after()` ile yanıt sonrası). İstemcide idempotency key kullanılabilir. `getActiveSeasonalConcept` hata ile "konsept yok" durumunu ayırt etmeli; senkron yalnızca başarılı okumada yazmalı.

### 9. Liste hatası boş durum olarak gösteriliyor
- **Önem:** orta · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** `page.tsx:64-68`: `r.json()` öncesinde `r.ok` kontrolü yok. 401/500/503 yanıtlarında `data.concepts` tanımsız → `[]`.
- **Sorun:** Oturum düştüğünde ya da DB erişilemezken operatör "Aktif konsept yok" görüyor ve yanlış karar verebiliyor (örneğin mükerrer konsept oluşturmak).
- **Öneri:** Ortak `useAdminQuery` (React Query, `providers.tsx`'de zaten var) kullanılmalı: `isError` durumunda yeniden dene butonlu hata kartı, `isLoading` durumunda iskelet gösterilmeli. Mutasyonlarda `invalidateQueries` ile optimistic update yapılmalı.

### 10. Silme onaysız; ikon butonu etiketsiz; toggle'da bekleme durumu yok
- **Önem:** orta · **Kategori:** UX / erişilebilirlik · **Efor:** S
- **Kanıt:** `page.tsx:145-154,188-190` (onay yok, `aria-label` yok), `page.tsx:131-143,185-187` (`disabled` ya da spinner yok). Audit'te `oldData` yok (`route.ts:170-178`).
- **Sorun:** Canlıdaki konsept tek yanlış tıklamayla kalıcı siliniyor ve geri kurulamıyor. Çift tıklamada iki ters `isActive` PUT'u yarışıyor.
- **Öneri:** Silme için `AlertDialog` ya da 5 sn'lik "Geri al" toast'ı kullanın. Daha iyisi yumuşak silme (`archivedAt`). Toggle için `useMutation` + `isPending` ile buton kilitlenmeli. Audit'e silinen kaydın tam görüntüsü (`oldData`) yazılmalı.

### 11. İngilizce Zod mesajları ve bağlanmamış Label'lar
- **Önem:** düşük · **Kategori:** dil / erişilebilirlik · **Efor:** S
- **Kanıt:** `route.ts:11-23` (özel mesaj yok), `route.ts:58,111` (`errors[0].message` toast'a gidiyor), `page.tsx:231-293` (`<Label>` için `htmlFor` yok).
- **Öneri:** Şemaya Türkçe mesajlar eklenmeli (ya da i18n `messages/tr.json` üzerinden). Hata alan bazında `fieldErrors` olarak dönmeli ve ilgili input'un altında `aria-describedby` ile gösterilmeli. Her alana `id` + `htmlFor` verilmeli.

### 12. Liste satırında ham ID'ler ve sıralama
- **Önem:** düşük · **Kategori:** görsel / bilgi mimarisi · **Efor:** S
- **Kanıt:** `page.tsx:176-182` (`efekt: ice-kingdom · tema: forestNight`, saat yok), `route.ts:36` (`startDate desc`, "Yaklaşan" ters sırada).
- **Öneri:** `SEASONAL_*_OPTIONS` etiketleri ve palet renk noktaları gösterilmeli. Tarih aralığı saatle birlikte ve göreli olarak yazılmalı ("3 gün sonra başlıyor", "12 saat kaldı"). Yaklaşan konseptler artan sırayla listelenmeli.

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog)

1. **Takvim / Gantt zaman çizelgesi:** Linear Cycles ya da Stripe'ın zamanlanmış fiyat değişiklikleri gibi yatay bir şerit. Çakışmalar görsel olarak görünür, kazanan vurgulanır, "bugün" çizgisi olur.
2. **Canlı önizleme:** Seçilen palet, banner ve efektin sağ panelde mini bir uygulama kabuğunda (açık ve koyu mod) gösterilmesi. Kaydetmeden önce "kullanıcı bunu görecek" hissi.
3. **Çakışma ve kazanan analizi:** "Bu pencerede X ile çakışıyor; öncelik 5 > 3 olduğundan **bu** konsept görünecek" uyarısı. Admin listesinde "CANLI" ve "GÖLGEDE" rozetleri.
4. **Düzenle, kopyala, gelecek yıla tekrarla:** Yıllık dönemler için "her yıl tekrarla" (RRULE benzeri) ya da tek tıkla klonlama.
5. **Değişiklik geçmişi ve etki ölçümü:** Satırda audit zaman çizelgesi (kim, ne zaman, ne değişti). PostHog tarzında, konsept penceresinde banner tıklama/kapatma oranı ve DAU karşılaştırması. Şu an banner kapatma ölçülmüyor.
6. **Hedefleme ve kapsam:** Konseptin hangi panellerde (müşteri, bayi, admin, landing) ve hangi segmentlerde görüneceği. Şu an global ve admin panelinde de banner çıkıyor.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında üç saniyede şunları görmeli: "Şu an kullanıcılar ne görüyor, sırada ne var, bir çakışma var mı?" Oluşturma ve düzenleme, önizlemesi olan tek bir panelde yapılmalı.

**Yerleşim:**
- **Üst şerit (Canlı durum kartı):** Şu an canlı olan konsept adı ve emojisi, kalan süre geri sayımı, palet renk noktaları, efekt adı, banner metni. Sağda "Önizle" ve "Duraklat" butonları. Canlı konsept yoksa "Varsayılan tema aktif · sıradaki: Cadılar Bayramı (12 gün sonra)".
- **Orta (Zaman çizelgesi):** 90 günlük yatay takvim, her konsept bir şerit. Öncelik dikey sırayı belirler, gölgede kalan şeritler tarama deseniyle gösterilir. Şeritte tıklama ile düzenleme Sheet'i açılır. Mobilde dikey "ajanda" listesine dönüşür.
- **Sağ Sheet (Oluştur / Düzenle):** Solda form (şablon seçici en üstte kart galerisi olarak), sağda canlı önizleme (mini uygulama kabuğu, açık/koyu anahtarı). Alt bilgi: çakışma uyarısı ve bağlı ekonomi kampanyası seçimi.
- **Alt (Arşiv):** Geçmiş konseptler kompakt tabloda; "Gelecek yıla kopyala" aksiyonu.

**Motion / 3D:** Ölçülü olmalı. Önizleme paneline palet geçişi için 200 ms'lik CSS değişken crossfade. Şerit hover'ında hafif yükselme. Canlı kartta yavaş nabız yalnızca `prefers-reduced-motion: no-preference` iken; `MotionConfig reducedMotion="user"` zaten global. 3D gereksiz; efekt önizlemesi için gerçek `DynamicBackground` bileşeni küçük bir kutuda, `IntersectionObserver` ile yalnızca görünürken render edilmeli.

**Veri / API değişiklikleri:**
- `GET /api/admin/seasonal-concepts` her kayıt için sunucu tarafında `status` (`live|shadowed|paused|scheduled|ended`) ve `conflictsWith[]` dönmeli.
- `PATCH /api/admin/seasonal-concepts/[id]` (REST'e uygun yol): tam düzenleme, birleşik tarih doğrulaması, `oldData` audit'i.
- `DELETE` → yumuşak silme (`archivedAt`).
- Şema: `bonusMultiplier` kaldırılmalı, `campaignId String?` (FK `SeasonalCampaign`), `scope String[]` (panel hedefleme), `archivedAt DateTime?` eklenmeli. `backgroundEffect` ve `themePresetId` için Zod `enum` doğrulaması.
- Public çözümleme: Redis'te zaman çizelgesi; kazanan root layout'ta sunucuda hesaplanıp `Providers`'a prop olarak geçmeli; `revalidateTag('seasonal')`. `/api/settings/background` aktif konsept efektini öncelikli dönmeli.
- Palet: `ThemeColorsProvider` girdisine `seasonalThemeId` eklenmeli; ayrı applier'ın palet kısmı kaldırılmalı.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/seasonal-campaigns`** (`app/admin/seasonal-campaigns/page.tsx`, model `SeasonalCampaign`): Aynı "tarih penceresinde dönemsel etkinlik" kavramı, aynı form deseni ve sidebar'da yan yana duruyorlar (`components/dashboard/sidebar.tsx:170-171`). Konseptteki `bonusMultiplier` bu sayfanın `multiplier` alanını kopyalıyor. **Öneri:** "Sezon Takvimi" adlı tek bir merkezde birleştirilmeli; bir sezonun iki katmanı olur: **Görünüm** (konsept: palet, efekt, banner) ve **Ekonomi** (kampanya: çarpan, bonus puan). Ortak zaman çizelgesi her iki katmanı gösterir. Modeller ayrı kalabilir, `campaignId` ile bağlanır.
- **`/admin/themes`** (global palet) ve global arka plan ayarı (`/api/settings/background`): Konsept bunların üzerine geçici bir katman. Çakışma kodda zaten yaşanıyor (bulgu 1 ve 3). Birleştirme gerekmez ama temalar sayfasında "Şu an X konsepti paleti geçersiz kılıyor" bilgisi ve takvime bağlantı gösterilmeli.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı: kod değiştirilmedi, veritabanına ya da çalışan bir uygulamaya dokunulmadı. Her iddia çağıran ve çağrılan taraflardan okunarak çürütülmeye çalışıldı.

### 1. Pasifleştirilen canlı konsept yönetim ekranından kayboluyor: **DOĞRULANDI**
- `app/admin/seasonal-concepts/page.tsx:157-161`: `active` için `isActive && start<=now<=end` gerekiyor. `upcoming` yalnızca `start>now`, `past` yalnızca `end<now` koşuluna bakıyor. `isActive=false` olup penceresi açık olan bir kayıt bu üç kümenin hiçbirine girmiyor. `renderRow` (ve onunla birlikte Aktifleştir/Sil butonları) yalnızca bu üç küme için çağrılıyor (`:315, :324, :331`).
- API kaydı döndürüyor (`app/api/admin/seasonal-concepts/route.ts` GET, filtre yok). Yani kayıp yalnızca istemci tarafındaki sınıflandırmadan kaynaklanıyor.
- **Yeniden üretim:** 1-14 Ekim penceresinde canlı olan "Yaz Festivali" satırında "Pasifleştir" düğmesine basılır. `PUT` başarılı olur, `fetchList()` çalışır ve satır hiçbir bölümde görünmez. 14 Ekim'e kadar arayüzden yeniden aktifleştirmek ya da silmek mümkün olmaz; kayıt ancak bitiş tarihinden sonra "Geçmiş" bölümünde tekrar görünür. Etki: kullanıcı verisi bozulmuyor, ama operatör yanlışlıkla kapattığı kampanyayı geri açamıyor.
- **Not:** Kalıcı çözüm, durumu sunucuda tek bir `status` alanı (`live|paused|shadowed|scheduled|ended`) olarak hesaplamak ve listeyi bu alana göre gruplamaktır. "Duraklatıldı" ayrı bir bölüm olarak gösterilmelidir.

### 2. Arka plan efekti seçimi kullanıcıya hiç yansımıyor: **DOĞRULANDI**
- `components/seasonal/seasonal-concept-applier.tsx:56-59` yalnızca `document.documentElement.dataset.seasonalBg` ve `body.seasonal-active` değerlerini yazıyor.
- Repo genelinde `seasonalBg`, `seasonal-bg`, `data-seasonal-bg` ve `seasonal-active` için `.ts/.tsx/.css/.js/.scss` taraması yapıldı (node_modules ve .next hariç). Tek eşleşme applier'ın kendisi; bu işaretleri okuyan ne CSS seçici ne de bileşen var.
- Arka plan bileşenleri (`components/ui/backgrounds/dynamic-background.tsx:89-110` ve `components/landing/LandingBackground.tsx:38`) yalnızca `/api/settings/background` adresini okuyor. Bu uç yalnızca `Settings['backgroundEffect']` anahtarını dönüyor ve konsepti hiç hesaba katmıyor (`app/api/settings/background/route.ts:14-22`).
- **Yeniden üretim:** "Yılbaşı" şablonu (`backgroundEffect: 'christmas'`) bugünü kapsayan bir pencereyle kaydedilir. Kullanıcı sayfası açıldığında `<html data-seasonal-bg="christmas">` yazılır, ama görüntülenen arka plan global ayarda kalır. Formdaki "Arka plan efekti" alanı fiilen işlevsiz.

### 3. Konsept paleti aktif temanın background/foreground değişkenlerini siliyor: **DOĞRULANDI**
- `components/seasonal/seasonal-concept-applier.tsx:49-53`: `applyRuntimeThemeToRoot({primary, secondary, accent})` çağrısında `background` ve `foreground` yok.
- `lib/apply-runtime-theme.ts:100-111` ve `:121-128`: bu iki alan yoksa `--background`, `--card`, `--popover`, `--muted`, `--border`, `--input`, `--glass-bg`, `--glass-border`, `--foreground`, `--card-foreground`, `--popover-foreground` ve `--muted-foreground` hem `<html>` hem `<body>` üzerinden `removeProperty` ile siliniyor.
- `components/providers.tsx:160-175`: her preset satırında `background` ve `foreground` tanımlı (`lib/theme-presets.ts` içindeki `getAdminThemePresetsBase`, `ADMIN_THEME_META`). Bu yüzden ThemeColorsProvider bu değişkenleri her zaman inline olarak yazıyor. Applier'ın efekti asenkron fetch'ten sonra çalıştığı için provider'ın layout effect'inden sonra gelir ve bu değerleri siler. Sonuçta yüzeyler `app/globals.css` varsayılanlarına (`:12`, `:52`) düşer.
- `resolvedTheme`, `activeThemeId` ya da `customColors` değişince provider'ın effect'i (`providers.tsx:141-176`) tekrar çalışır. Bu, örneğin açık/koyu geçişinde ya da mount anındaki `loadThemeSettings` sonrasında yeni bir `customColors` nesnesi gelince olur ve konsept paleti tamamen ezilir. Applier'ın effect'i yalnızca `[concept]` bağımlılığında çalıştığı için palet geri gelmez.
- Applier, preset anahtarını moda göre çözmüyor (`resolveThemeIdForMode` kullanılmıyor). Açık modda da koyu varyantın renkleri uygulanıyor.
- **Yeniden üretim:** Admin temayı "Amethyst Gün" yapar ve paleti `arctic` olan aktif bir konsept oluşturur. Kullanıcı sayfası ilk açıldığında kart ve arka plan renkleri temanınkinden `globals.css` varsayılanına döner. Kullanıcı koyu/açık geçişi yapınca konsept paleti kaybolur ve tema geri gelir. Etki görsel; veri kaybı yok.
- **Not:** Palet uygulamasını tek bir sahibe toplamak gerekiyor. ThemeColorsProvider'a `seasonalThemeId` girdisi eklenip konsept, tema hesaplamasında bir katman olarak birleştirilmeli; applier'daki ayrı `applyRuntimeThemeToRoot` çağrısı kaldırılmalı.

### 4. Daha yüksek öncelikli konsept cache bayatlığı yüzünden gösterilmiyor: **DOĞRULANDI (etki süresi koşullu)**
- `app/api/settings/seasonal-concept/route.ts:27-29`: cache'teki konseptin `endDate` değeri gelecekteyse uç doğrudan onu dönüyor ve canlı hesaplama yapılmıyor.
- `Settings['activeSeasonalConcept']` yalnızca iki yerde yazılıyor:
  - `syncActiveSeasonalConcept`, admin POST/PUT/DELETE sonrasında (`app/api/admin/seasonal-concepts/route.ts:91,143,180`);
  - Inngest saatlik işi (`lib/inngest/functions.ts:205-213` → `app/api/internal/inngest/seasonal-concept-activation/route.ts:16`).
- Vercel'deki tek cron `/api/cron/daily` (`vercel.json`). Bu orkestratörün görev listesinde konsept senkronu yok (`app/api/cron/daily/route.ts:51-59`). Yerel `.env` dosyasında `INNGEST*` anahtarı bulunmadı; prod'da Inngest Cloud'un bu fonksiyonu tetikleyip tetiklemediği doğrulanmadı.
- **Yeniden üretim:** "Kış" konsepti (öncelik 0, 1 Aralık - 28 Şubat) cache'te duruyor. "Yılbaşı" konsepti (öncelik 10, 24 Aralık - 2 Ocak) önceden planlanmış. 24 Aralık'ta Kış'ın bitiş tarihi gelecekte olduğu için uç Kış'ı dönmeye devam ediyor. Admin sayfası ise kendi istemci filtresiyle iki konsepti de "Şu an aktif" altında gösteriyor (`page.tsx:157-159`) ve hangisinin gerçekten kazandığını belirtmiyor.
  - Inngest çalışıyorsa sapma en fazla yaklaşık 1 saat.
  - Inngest çalışmıyorsa sapma, Kış'ın bitişine (28 Şubat) ya da herhangi bir admin kaydına kadar sürer.
- Mekanizma kod okumasıyla kesin. Şiddet, prod'daki Inngest durumuna bağlı.
- **Not:** Cache, "tek kazanan + bitiş" yerine "bir sonraki değişim anı" (`min(kazananın endDate'i, bugünden sonra başlayan ilk konseptin startDate'i)`) ile geçersiz kılınmalı. Ayrıca senkron, daily orkestratörüne ya da istek anındaki hesaplamaya bağlanmalı.
