# /customer/consumptions

**Amaç:** Müşterinin işletmelerde kart/QR ile kaydedilen tüketimlerini (ziyaret + ürün + tutar) listelemek ve yorum bekleyen tüketimleri öne çıkarıp detay sayfasına (`/customer/consumptions/[id]`) yönlendirerek puan/XP kazandıran yorum döngüsünü başlatmak. Sistemdeki birincil "yorum yap → puan kazan" giriş kapısıdır (my-card, feedbacks, surprise-boxes, quests, rewards, hatırlatma bildirimleri buraya bağlanıyor).

**Genel puan: 5/10** · **Karar: yeniden tasarla** (veri katmanındaki iki hata + eksik sayfalama düzeltilmeli; sayfa düz bir CRUD listesinden "ziyaret zaman tüneli + puan kazanma kuyruğu"na dönüştürülmeli)

Denetlenen dosyalar: `app/customer/consumptions/page.tsx` (342 satır), `app/customer/consumptions/layout.tsx`, `app/customer/layout.tsx`, `app/api/customer/consumptions/route.ts`, `app/api/customer/consumptions/[id]/review/route.ts` (ödül bağlamı için), `prisma/schema.prisma` (`Consumption` 1574, `ConsumptionReview` 1602, `ProductCategory`), `lib/utils.ts`, `lib/app-locale.tsx`, `lib/api-http.ts`, `lib/points-rules.ts`, `components/providers.tsx`, `messages/tr.json` + `messages/en.json` (`customerConsumptions.*`), `proxy.ts`, sayfaya bağlanan diğer sayfalar.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Temel listeleme ve detaya geçiş çalışıyor; ama istatistik kartları sekmeye göre yanlış sayı gösteriyor, yalnızca ilk 20 kayıt görülebiliyor ve diğer sayfalardan gelen `?hasReview=false` derin bağlantısı yok sayılıyor. |
| UX | 5/10 | Arama boş sonuçta "Henüz tüketim kaydınız yok" diyerek yanıltıyor, hata durumu boş durumla karışıyor, kazanılacak puan hiç gösterilmiyor; sayfa oyunlaştırma döngüsünün kapısı olduğu hâlde motive etmiyor. |
| Görsel | 6/10 | Panel diliyle tutarlı (DashboardPageHero + cam kartlar) ama jenerik; mobilde 10px metinler, açık temada düşük kontrastlı amber/emerald rozetler. |
| Mimari | 5/10 | API `stats` hesabı filtreye bağlı yanlış kurgulanmış, sayfalama API'de var ama istemcide kullanılmıyor, 9 kullanılmayan import, `any` kaçakları, URL durumuyla senkron yok. |
| Performans | 7/10 | Sorgular indeksli (`[customerId, createdAt]`), 3 sorgu paralel, AbortController doğru; ama her sekme değişiminde tam yeniden yükleme + iskelet, istemci önbelleği yok, kullanılmayan alanlar taşınıyor. |
| Erişilebilirlik + mobil | 5/10 | Global `MotionConfig reducedMotion="user"` var; ama arama alanında etiket yok, 10px yazılar, düşük kontrast, kartlarda belirgin focus stili yok, logo `<img>` hata yedeği yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa başlığı (DashboardPageHero: eyebrow/başlık/açıklama/ikon) | ÇALIŞIYOR | `page.tsx:143-149`, `components/layout/dashboard-page-hero.tsx:8-12` | Admin hero'sunun yeniden ihracı; müşteri tarafında kişiselleştirme yok. |
| 2 | Segment metadata (sekme başlığı/açıklama) | ÇALIŞIYOR | `layout.tsx:4-6`, `messages/tr.json` → `layoutMetadata.customerConsumptions` | TR: "Tüketimlerim", EN: "My consumptions". |
| 3 | İstatistik kartı: Toplam | BOZUK | `page.tsx:154`, `route.ts:89,110` | `total` filtreli `where` ile sayılıyor → "Bekleyen" sekmesinde toplam = bekleyen sayısı. |
| 4 | İstatistik kartı: Yorum Bekliyor | ÇALIŞIYOR | `page.tsx:155`, `route.ts:91-96,111` | Filtreden bağımsız global sayım, doğru. |
| 5 | İstatistik kartı: Yorumlandı | BOZUK | `page.tsx:156`, `route.ts:112` | `total - reviewPending`; filtreliyken 0 veya NEGATİF çıkabilir (aşağıda B1). |
| 6 | İstatistik kartlarının tıklanabilir filtre olması | EKSİK | `page.tsx:157-178` | Kartlar statik; "Yorum Bekliyor" kartı doğal bir CTA olmalı. |
| 7 | Arama (işletme/ürün adı) | KISMİ | `page.tsx:131-139,187-192` | Yalnız yüklenmiş 20 kayıtta arar; `toLowerCase()` Türkçe İ/ı'yı bozar; etiket yok. |
| 8 | Sekme: Tümü | KISMİ | `page.tsx:196`, `route.ts:15,35` | Sadece ilk 20 kayıt (sayfalama yok). |
| 9 | Sekme: Bekleyen (`hasReview=false`) | KISMİ | `page.tsx:79,197`, `route.ts:44-45` | Filtre doğru; ilk 20 ile sınırlı, istatistikleri bozuyor. |
| 10 | Sekme: Yorumlanan (`hasReview=true`) | KISMİ | `page.tsx:198`, `route.ts:42-43` | Aynı sınırlar. |
| 11 | Derin bağlantı `?hasReview=false` | BOZUK | `app/customer/feedbacks/page.tsx:395`, `app/customer/my-card/page.tsx:789`; `page.tsx:67` (`useState('all')`, `useSearchParams` yok) | "Yorum yap" CTA'larından gelen kullanıcı "Tümü" görür. |
| 12 | Yükleniyor iskeleti (3 kart) | ÇALIŞIYOR | `page.tsx:206-223` | Her sekme değişiminde tüm listeyi siler (titreme). |
| 13 | Boş durum (filtreye göre metin) | ÇALIŞIYOR | `page.tsx:224-237` | |
| 14 | Boş durum CTA: QR Tara | ÇALIŞIYOR | `page.tsx:240-245` → `app/customer/scan` mevcut | |
| 15 | Boş durum CTA: Kartım | ÇALIŞIYOR | `page.tsx:246-251` → `app/customer/my-card` mevcut | |
| 16 | Arama sonucu boş durumu | KISMİ (yanıltıcı) | `page.tsx:224,238` | Arama eşleşmezse "Henüz tüketim kaydınız yok" + QR CTA'sı gösterilir. Ayrı "eşleşme yok / aramayı temizle" durumu yok. |
| 17 | Hata durumu | KISMİ | `page.tsx:90-117` | Toast + listeyi boşaltıp boş durumu gösterir; "yeniden dene" yok, hata ile "hiç kaydın yok" ayırt edilemez. |
| 18 | Liste kartı → detay bağlantısı | ÇALIŞIYOR | `page.tsx:267` | Tüm kart tek `Link`. |
| 19 | İşletme logosu / Store yedeği | KISMİ | `page.tsx:272-281` | Ham `<img>`, `loading="lazy"`/boyut/`onError` yok; kırık URL'de kırık görsel. `dealer.image` çekiliyor ama kullanılmıyor (`route.ts:61`). |
| 20 | İşletme adı (businessName → name yedeği) | ÇALIŞIYOR | `page.tsx:288` | Yedek `name` bayi kullanıcısının kişisel adı olabilir (ürün kararı). |
| 21 | Yorum durumu rozeti (yıldız puanı / "Yorum Yap") | ÇALIŞIYOR | `page.tsx:291-301` | Rozet buton değil, kart linkinin parçası. Kazanılacak puanı göstermiyor. |
| 22 | Ürün adı + kategori emojisi | ÇALIŞIYOR | `page.tsx:306-312`; `schema.prisma` `ProductCategory.icon @default("🍽️")` | Emoji ekran okuyucuda "çatal bıçak tabak" diye okunur, `aria-hidden` yok. |
| 23 | Göreli zaman ("2 gün önce") | KISMİ | `page.tsx:314`, `lib/utils.ts:33-36` | `locale` parametresi geçilmiyor → EN kullanıcı Türkçe görür. |
| 24 | Tutar | KISMİ | `page.tsx:319-323`, `lib/utils.ts:77-82` | Daima `tr-TR` biçimi; `amount && …` 0 değerinde "0" basar (bugün yazma yolları 0'ı null'a çevirdiği için gizli/latent). |
| 25 | Yorum metni önizlemesi | ÇALIŞIYOR | `page.tsx:324-328` | |
| 26 | Liste giriş/çıkış animasyonu | ÇALIŞIYOR | `page.tsx:258-266` | Çıkış animasyonu yalnız arama daraltmasında oynar; sekme değişiminde liste koşullu render ile topluca söküldüğü için `exit` ölü. |
| 27 | Sayfalama / daha fazla yükle / sonsuz kaydırma | EKSİK | `route.ts:15,34-37,103-108` (API destekliyor), `page.tsx:80` (`page` hiç gönderilmiyor) | 20+ tüketimi olan kullanıcı eski kayıtlarını hiç göremez. |
| 28 | Yetki: yalnız CUSTOMER + yalnız kendi verisi | ÇALIŞIYOR | `proxy.ts:53`, `route.ts:24-31,40` | IDOR yok; `customerId: session.user.id`. |
| 29 | İstek iptali (unmount / sekme değişimi) | ÇALIŞIYOR | `page.tsx:125-129,112-113` | Yarış koşulu yok. |
| 30 | Azaltılmış hareket desteği | ÇALIŞIYOR | `components/providers.tsx:232` (`MotionConfig reducedMotion="user"`) | Global; sayfa özel bir şey yapmıyor. |
| 31 | İşletme yanıtı göstergesi ("işletme yanıtladı") | EKSİK | `schema.prisma` `ConsumptionReview.dealerReply/dealerRepliedAt`; `route.ts:78-86` seçmiyor | Veri var, listede yok. |
| 32 | Kazanılacak puan çipi ("+X puan") | EKSİK | `lib/points-rules.ts:273-279`, `review/route.ts:163-166` | Ödül matrisi sunucuda hazır; listede hiç gösterilmiyor. |
| 33 | Sıralama / tarih aralığı / işletme filtresi | EKSİK | `route.ts:53` (sabit `createdAt desc`) | |
| 34 | Tarihe göre gruplama (Bugün / Bu hafta / Ay) | EKSİK | `page.tsx:259` düz liste | |
| 35 | Yenile / pull-to-refresh | EKSİK | — | Mobil PWA'da beklenen davranış. |
| 36 | API hata mesajlarının dili | KISMİ | `route.ts:28,122`; `page.tsx:91,107` | Sunucu Türkçe sabit metin döndürüyor, istemci bunu olduğu gibi toast'luyor → EN kullanıcıya Türkçe hata. |

**Durum özeti:** ÇALIŞIYOR 16 · KISMİ 10 · BOZUK 3 · SAHTE 0 · EKSİK 7 (toplam 36)

---

## Bulgular

### B1 — İstatistik kartları sekmeye göre yanlış (negatif olabilen) sayı gösteriyor
- **Önem:** yüksek · **Kategori:** hata / veri doğruluğu · **Efor:** S
- **Kanıt:** `app/api/customer/consumptions/route.ts:89` (`prisma.consumption.count({ where })` — `where` filtreyi içeriyor), `:91-96` (`reviewPending` filtresiz), `:109-113` (`total`, `reviewed: total - reviewPending`); istemci her sekme değişiminde bu `stats`'ı kartlara basıyor `page.tsx:97-105,153-156`.
- **Sorun:** Kullanıcının 8 tüketimi var, 5'i bekliyor, 3'ü yorumlanmış varsayalım:
  - "Tümü": Toplam 8 · Bekliyor 5 · Yorumlandı 3 (doğru)
  - "Bekleyen": Toplam **5** · Bekliyor 5 · Yorumlandı **0**
  - "Yorumlanan": Toplam **3** · Bekliyor 5 · Yorumlandı **−2**
  Sekme tıklamak global özet kartlarını değiştiriyor; negatif sayı güveni doğrudan zedeler.
- **Öneri:** Özet istatistikler filtreden bağımsız olmalı. API'de `stats` için ayrı, filtresiz iki sayım (`count({ customerId })`, `count({ customerId, review: null })`) yapılmalı; liste sayfalaması için gereken `pagination.total` ise filtreli `where` ile kalmalı. Daha iyisi: tek bir `groupBy`/ham SQL `COUNT(*) FILTER (WHERE r.id IS NULL)` ile tek sorguda iki sayı. İstemcide de istatistikleri ayrı bir anahtar (örn. SWR `consumption-stats`) altında tutup sekme değişiminde yeniden çekmemek gerekir. Bir regresyon testi: "filtre=reviewed iken `stats.reviewed >= 0` ve `stats.total` filtresiz toplamla eşit".

### B2 — Yalnızca ilk 20 tüketim görülebiliyor; arama da yalnız bu 20 kayıtta çalışıyor
- **Önem:** yüksek · **Kategori:** işlevsellik / veri erişimi · **Efor:** M
- **Kanıt:** `route.ts:15` (`PAGE_SIZE_DEFAULT = 20`), `:34-37,103-108` (sayfalama döndürülüyor); `page.tsx:80` (`page`/`pageSize` hiç gönderilmiyor, `pagination` alanı okunmuyor `:83-88`), `:131-139` (arama istemci tarafında `consumptions` dizisinde).
- **Sorun:** Düzenli müşteri (en değerli segment) birkaç haftada 20 kaydı aşar; eski ziyaretlerini, eski yorumlarını ve 20'nin ötesindeki yorum bekleyen kayıtlarını (puan fırsatı) hiç göremez. Üstelik "Toplam 57" yazarken listede 20 kart olması tutarsızlık. Arama "geçen ay gittiğim kafe"yi bulamaz.
- **Öneri:** İmleç tabanlı sayfalama (`cursor: { id }`, `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`) + `useSWRInfinite`/`useInfiniteQuery` ile `IntersectionObserver` tetiklemeli sonsuz kaydırma; altta "Daha fazla yükle" yedeği. Arama sunucuya taşınmalı (`q` parametresi → `OR: [{ dealer: { businessName: { contains: q, mode: 'insensitive' } } }, { product: { name: { contains, mode } } }]`), 250 ms debounce ile. Offset yerine imleç, yeni tüketim eklendiğinde kaymayı engeller.

### B3 — Diğer sayfalardan gelen `?hasReview=false` derin bağlantısı yok sayılıyor
- **Önem:** orta · **Kategori:** hata / akış kopukluğu · **Efor:** S
- **Kanıt:** Bağlantı veren yerler `app/customer/feedbacks/page.tsx:395`, `app/customer/my-card/page.tsx:789` ("Yorum bekleyen tüketimler — X kayıt için yorum yazarak puan kazan"); sayfa durumu `page.tsx:67` `useState('all')`, dosyada `useSearchParams` yok.
- **Sorun:** "Yorum yap" CTA'sına basan kullanıcı, beklediği "bekleyenler" yerine karışık listeyi görür; puan kazanma niyetiyle gelen kullanıcıda sürtünme. Ayrıca sekme seçimi URL'ye yazılmadığı için geri tuşu/yenileme seçimi kaybeder.
- **Öneri:** Filtre durumunu URL'nin tek kaynağı yap: `useSearchParams` ile `hasReview` (ve ileride `q`, `sort`) oku, sekme değişiminde `router.replace(?hasReview=…, { scroll: false })`. Parametre adı API ile aynı kaldığı için mevcut bağlantıların hepsi kendiliğinden çalışır. `useSearchParams` için sayfayı `<Suspense>` ile sarmayı unutma.

### B4 — Arama boş sonucu "Henüz tüketim kaydınız yok" diye yanlış raporlanıyor; hata durumu da boş durumla karışıyor
- **Önem:** orta · **Kategori:** UX / durum yönetimi · **Efor:** S
- **Kanıt:** `page.tsx:224` (`filteredConsumptions.length === 0` — arama da bu diziyi daraltır), `:232-236` (filter=all → `emptyAll`: "Henüz tüketim kaydınız yok…"), `:238-253` (QR/Kart CTA'ları); hata yolları `:90-95,106-110,111-117` listeyi boşaltıp aynı boş duruma düşürüyor.
- **Sorun:** 15 kaydı olan kullanıcı "zzz" yazınca "henüz tüketiminiz yok, QR tara" mesajı alır. Ağ hatasında da aynı mesaj + bir toast; kullanıcı verisinin silindiğini sanabilir, tekrar deneme yolu yok.
- **Öneri:** Dört ayrı durum modelle: `loading | error | empty (hiç kayıt yok) | noMatch (filtre/arama sonucu yok) | data`. `noMatch` için "'zzz' için sonuç yok — aramayı temizle" + temizle butonu; `error` için satır içi hata kartı + "Tekrar dene" (aynı `fetchConsumptions`'ı çağırır). Toast'ı yalnız arka plan yenilemelerindeki hatalar için kullan.

### B5 — Türkçe karakterli aramada eşleşme kaçıyor (İ/ı)
- **Önem:** orta · **Kategori:** hata / yerelleştirme · **Efor:** S
- **Kanıt:** `page.tsx:133-137` (`searchQuery.toLowerCase()`, `businessName?.toLowerCase()`).
- **Sorun:** JS'de `"İstanbul".toLowerCase()` → `"i̇stanbul"` (i + U+0307 birleşik nokta) olur; kullanıcının yazdığı `"ist"` bununla eşleşmez. Tersi: "IRMAK" → "irmak", kullanıcı "ırmak" yazarsa eşleşmez. Türkçe işletme adlarında (İzmir, Işık, İnci…) gerçek ve sık bir kaçış.
- **Öneri:** Arama sunucuya taşınınca (B2) Postgres `ILIKE`/`unaccent` ile çözülür; istemci tarafı kalırsa `toLocaleLowerCase('tr')` + `normalize('NFD').replace(/\p{M}/gu,'')` ile katlanmış bir arama anahtarı üret ve hem sorguya hem alanlara uygula.

### B6 — Yerelleştirme yarım: göreli zaman, para birimi ve API hataları EN kullanıcıya Türkçe
- **Önem:** orta · **Kategori:** dil karışıklığı (TR/EN) · **Efor:** S
- **Kanıt:** `page.tsx:314` `formatRelativeTime(consumption.createdAt)` — `lib/utils.ts:33-36` varsayılan `locale='tr'`; `page.tsx:321` `formatCurrency` → `lib/utils.ts:78` sabit `'tr-TR'`; API `route.ts:28` "Yetkisiz erişim", `:122` "Tüketimler getirilemedi" ve istemci `page.tsx:91,107` önce sunucu metnini gösteriyor. Diğer müşteri sayfaları `useAppLocale()` kullanıyor (`app/customer/badges/badges-client.tsx:134`, `app/customer/lounge/page.tsx:37`).
- **Sorun:** EN arayüzde "3 gün önce" ve Türkçe hata toast'ları; tutarsız his.
- **Öneri:** `const { locale } = useAppLocale()` ile `formatRelativeTime(date, locale)`; `formatCurrency`'ye `locale` parametresi ekle. API hata gövdelerini makine okunur `code` (`UNAUTHORIZED`, `LOAD_FAILED`) ile döndür, istemci metni i18n'den üretsin. Göreli zaman için `Intl.RelativeTimeFormat` kullanmak elle yazılmış eşikleri de kaldırır.

### B7 — Yorum bekleyen kayıtlar oyunlaştırma döngüsüne bağlı değil (puan, aciliyet, işletme yanıtı görünmüyor)
- **Önem:** orta · **Kategori:** ürün / oyunlaştırma · **Efor:** M
- **Kanıt:** Ödül sunucuda hesaplanıyor `lib/points-rules.ts:273-279` (`base` / `detailed` — uzun yoruma daha çok puan), `review/route.ts:163-194`; listede yalnız "Yorum Yap" rozeti `page.tsx:296-300`. `ConsumptionReview.dealerReply` şemada var ama API seçmiyor `route.ts:78-86`. Sürpriz kutusu sayfası "yorum yaparak hızlan" diye buraya gönderiyor `app/customer/surprise-boxes/page.tsx:357`, ama burada kutu ilerlemesi yok.
- **Sorun:** Sayfa sistemin en önemli puan kazanma kapısı, ama kullanıcıya "bu yorum sana kaç puan kazandırır, detaylı yazarsan kaç" demiyor; yorumunun işletmece yanıtlandığını göremiyor (karşılıklılık hissi yok). Duolingo/Starbucks referansında her bekleyen görev "ödül çipi" ile sunulur.
- **Öneri:** API `GET` yanıtına `rewardPreview: { base, detailed, longTextThreshold }` (tek sefer, `getPointsMatrix()`'ten) ve her kalem için `review.dealerReply != null` → `hasDealerReply` ekle. Bekleyen kartlarda "+10 puan · detaylı yazarsan +25" çipi, yanıtlanmış yorumlarda "İşletme yanıtladı" rozeti + okunmamış noktası. Günlük/haftalık cap (`lib/points-caps.ts`) dolduysa çip "bugünkü limit doldu" demeli — aksi hâlde vaat edilen puan verilmez ve güven kırılır (puan ekonomisi kuralları ile uyumlu olmalı).

### B8 — Ölü kod, kullanılmayan import ve `any` kaçakları
- **Önem:** düşük · **Kategori:** mimari / bakım · **Efor:** S
- **Kanıt:** Kullanılmayan importlar: `useSession` + `session` (`page.tsx:4,64` — gereksiz session aboneliği), `formatDate` (`:28`), `CardDescription, CardHeader, CardTitle` (`:25`), `TabsContent` (`:27`), `Filter, Loader2, AlertCircle` (`:12,16,17`). `any`: `page.tsx:194` `v as any`, `route.ts:40` `const where: any`. Kullanılmayan yük: `route.ts:61` `dealer.image`, `:83-84` `dimensions`, `review.createdAt`; `include` tüm `Consumption` skalerlerini (cardId, customerId, dealerId, updatedAt) de taşıyor.
- **Sorun:** Okunabilirlik ve tip güvenliği düşük; `where: any` ile yanlış alan adı derleme zamanında yakalanmaz.
- **Öneri:** `Prisma.ConsumptionWhereInput` tipi, `filter` için `type Filter = 'all'|'pending'|'reviewed'` + tip korumalı `onValueChange`. Yanıt şekli için `zod` şeması veya paylaşılan DTO tipi (`app/customer/types.ts` zaten var) — istemci ve sunucu aynı tipi kullansın; `include` yerine açık `select`.

### B9 — Erişilebilirlik ve mobil okunabilirlik
- **Önem:** düşük · **Kategori:** erişilebilirlik / mobil · **Efor:** S
- **Kanıt:** Arama `Input`'unda `aria-label`/`<label>` yok, yalnız placeholder `page.tsx:187-192`; mobilde `text-[10px]` istatistik etiketleri, rozetler ve meta satırı `:172,292,297,305,325`; açık temada `text-amber-500` / `text-emerald-500` %20 opak zeminde (`:292,297`) — WCAG AA 4.5:1 altında (renk değerlerinden çıkarım, ölçümle doğrulanmadı); kart `Link`'inde özel `focus-visible` halkası yok `:267-268`; dekoratif ikon/emoji'lerde `aria-hidden` yok `:168,308,313`; logo `alt` boş string'e düşebilir `:276`.
- **Sorun:** Ekran okuyucu kullanıcısı arama alanının amacını duymaz, emoji'leri sesli okur; düşük görüşlü kullanıcı 10px metinleri okuyamaz; klavye kullanıcısı hangi kartta olduğunu zor görür.
- **Öneri:** Minimum 12px (tercihen 13px) mobil meta metni; rozet renklerini `amber-700/dark:amber-300` gibi kontrast doğrulanmış token'lara bağla; `Link`'e `rounded-xl focus-visible:ring-2 ring-ring` ver; ikon/emoji `aria-hidden`; kart için `aria-label="{işletme}, {ürün}, {tarih}, {yorum durumu}"`. Logo için `next/image` ya da `loading="lazy" decoding="async" width/height` + `onError` → Store yedeği.

### B10 — Sekme değişiminde tam yeniden yükleme ve titreme; istemci önbelleği yok
- **Önem:** düşük · **Kategori:** performans / UX · **Efor:** S-M
- **Kanıt:** `page.tsx:75-123` (`filter` bağımlılığı → her sekmede yeni istek, `setLoading(true)` → `:206` iskelet tüm listeyi siler); `t` kimliği locale değişince değiştiğinden (`lib/app-locale.tsx:57-60`) ilk açılışta EN kullanıcıda ikinci bir istek tetiklenir (ilki iptal edilir, zararsız ama gereksiz).
- **Sorun:** Sekmeler arası gidip gelmek her seferinde iskelet + ağ isteği; detaydan geri dönüşte de liste sıfırdan çekiliyor ve kaydırma konumu kayboluyor.
- **Öneri:** SWR/React Query ile `['consumptions', filter, q]` anahtarlı önbellek + `keepPreviousData` (eski liste görünürken arka planda yenile); detayda yorum gönderilince `mutate` ile ilgili kaydı iyimser güncelle. `t`'yi `fetchConsumptions` bağımlılığından çıkar (hata metnini render tarafında üret).

### B11 — `amount && …` deseni 0 tutarında ekrana "0" basar (gizli hata)
- **Önem:** düşük · **Kategori:** hata (latent) · **Efor:** S
- **Kanıt:** `page.tsx:319`; şema 0'a izin veriyor `lib/validations.ts:274` (`nonnegative`), ancak bugünkü yazma yolları 0'ı null'a çeviriyor (`app/api/dealer/consumptions/route.ts:246`, `app/api/dealer/offline-sync/route.ts:220`).
- **Sorun:** Bugün tetiklenmiyor; ileride bir yazma yolu (ücretsiz ikram, kampanya) 0 kaydederse kartta yalnız başına "0" görünür.
- **Öneri:** `consumption.amount != null && consumption.amount > 0` veya ücretsiz için "İkram" etiketi.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Ziyaret zaman tüneli + tarih gruplaması** (Starbucks Rewards "History", Monzo/Revolut işlem akışı): "Bugün / Bu hafta / Ekim 2026" başlıkları, ay başına toplam harcama ve ziyaret sayısı; sonsuz kaydırma.
2. **"Puan kuyruğu" — bekleyen yorumların ödülüyle sunulması** (Duolingo görevleri): sayfanın üstünde "3 yorumun seni bekliyor · toplam +45 puan" kartı, tek dokunuşla ilk bekleyene git, yorum sonrası bir sonrakine otomatik geçiş ("seri yorum" akışı).
3. **İşletme yanıtı ve telafi (remedy) görünürlüğü**: yorumuna işletme yanıt verdiğinde/telafi teklifi geldiğinde listede rozet ve okunmamış işareti (veri: `dealerReply`, `RemedyOffer`).
4. **Gelişmiş filtre ve sıralama**: işletmeye göre, tarih aralığına göre, tutara göre; "en çok gittiğim yerler" hızlı filtre çipleri (Revolut kategori çipleri).
5. **İşletme kartı / tekrar ziyaret bağlamı**: aynı işletmeye kaçıncı ziyaret, o işletmedeki sadakat ilerlemesi, favorilere ekle (`/customer/favorites` mevcut) ve keşfet sayfasına köprü.
6. **Dışa aktarma ve fiş görünümü**: tek bir tüketim için fiş benzeri paylaşılabilir kart; dönemlik özet (Spotify Wrapped tarzı `my-year` sayfasıyla bağlantılı "Bu ayın özeti" kartı).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Sayfa "tüketim kayıtları tablosu" olmaktan çıkıp **"Ziyaretlerim"** adında, iki işi net yapan bir yüzeye dönüşür: (1) *şimdi yapabileceğim puan kazandıran işler* (bekleyen yorumlar) üstte, ödülüyle; (2) *geçmişim* altta, zaman tüneli olarak. Kullanıcı sayfayı açtığında 1 saniyede "kaç puanım beni bekliyor" sorusunun yanıtını görmeli.

**Yerleşim (mobil öncelikli):**
1. **Üst özet şeridi** (hero'nun yerini alır, daha kompakt): bu ay ziyaret sayısı · bu ay harcama · yorum oranı halkası. Filtreden bağımsız, doğru sayılar (B1).
2. **"Seni bekleyenler" yatay kaydırmalı kart rafı** (yalnız bekleyen varsa): her kartta işletme logosu, ürün, "2 gün önce", **+X puan** çipi, "detaylı yazarsan +Y" ipucu; dokununca detay sayfasındaki yorum formu açılır. Raf sonunda "Tümünü gör" → `?hasReview=false`.
3. **Yapışkan filtre çubuğu**: arama (sunucu tarafı, debounce), segment kontrol (Tümü/Bekleyen/Yorumlanan, URL ile senkron), "Filtre" bottom-sheet'i (işletme, tarih aralığı, sıralama).
4. **Zaman tüneli listesi**: ay/hafta başlıklı gruplar, grup başlığında ay toplamı; kompakt satırlar (logo · işletme · ürün · tutar · durum ikonu). Yanıtlanmış yorumlarda "İşletme yanıtladı" rozeti. Sonsuz kaydırma + "Daha fazla" yedeği.
5. **Durumlar**: ayrı `error` (tekrar dene), `noMatch` (aramayı temizle), `empty` (QR tara / Kartım — mevcut CTA'lar korunur).

**Motion / 3D (ölçülü):**
- 3D bu sayfada gereksiz; liste performansı ve okunabilirlik öncelikli.
- Bekleyen rafına giriş: kartlar 40 ms aralıkla hafif `y: 8 → 0` (mevcut stagger'ın kısaltılmışı); liste satırlarında stagger yalnız ilk sayfada, sonsuz kaydırmada yeni gelenlere animasyon yok.
- Yorum gönderildikten sonra listeye dönüşte ilgili satırın durum ikonunun "saat → yıldız" morph'u ve puan çipinin özet şeridindeki puan sayacına uçması (`layoutId` ile paylaşılan eleman) — tek, anlamlı bir ödül anı. `reducedMotion="user"` zaten global; bu anda yalnız opaklık geçişi kalır.
- Sekme değişiminde iskelet yerine `keepPreviousData` + liste üstünde ince ilerleme çubuğu (titremeyi kaldırır).

**Veri / API değişiklikleri:**
- `GET /api/customer/consumptions`: `stats` filtresiz hesaplanır (tek sorguda `COUNT FILTER`); imleç sayfalama (`cursor`, `nextCursor`); `q`, `dealerId`, `from`, `to`, `sort` parametreleri; açık `select` (kullanılmayan alanlar çıkar); kalem başına `hasDealerReply`; yanıt kökünde `rewardPreview` ve cap durumu (`capRemainingToday`).
- Ayrı hafif uç (veya aynı uçta `?summary=1`): ay bazlı ziyaret/harcama özeti — `spending-overview`'ın Redis önbellekli agregasyonu (`app/api/customer/spending-overview/route.ts`) yeniden kullanılabilir.
- Hata gövdeleri `code` alanıyla; metin istemcide i18n.
- İstemci: SWR/React Query (`useSWRInfinite`), filtre durumu URL'de (`useSearchParams`), paylaşılan DTO tipi.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/feedbacks` (Tüketim sekmesi)** — `app/customer/feedbacks/page.tsx:114,385-425` aynı `ConsumptionReview` verisini (`/api/customer/reviews`) ayrı bir listede gösteriyor; bu sayfanın "Yorumlanan" sekmesiyle büyük ölçüde örtüşüyor. Öneri: Geri bildirimler sayfası "yazdıklarım" (QR geri bildirimleri + tüketim yorumları + işletme yanıtları) odağında kalsın; tüketim yorumlarının kalem listesi tek kaynakta (bu sayfa) dursun, feedbacks oradaki sekmeyi bu sayfaya `?hasReview=true` bağlantısı + özetle değiştirsin.
- **`/customer/spending-overview`** — aynı `Consumption` verisinin aylık/işletme bazlı agregasyonu (`app/api/customer/spending-overview/route.ts:35-40`); bağımsız bir sayfa olarak zayıf. Öneri: Bu sayfanın üst özet şeridine ve ay grup başlıklarına **birleştir**; ayrıntılı grafikler `/customer/analytics` altında kalsın.
- **`/customer/my-card`** — yorum bekleyen sayısını ve "Yorum yap" kartını tekrar ediyor (`app/customer/my-card/page.tsx:780-792`); bu kabul edilebilir bir giriş noktası, yeter ki derin bağlantı çalışsın (B3).
- **`/customer/my-year`** — dönemlik "Wrapped" özeti; birleştirme yerine bu sayfadan "Bu ayın özeti" köprüsü önerilir.
- Kaldırma önerilmez: sayfa 15+ yerden bağlanan çekirdek bir yüzey (`components/dashboard/sidebar.tsx:284`, `lib/customer-reminders.ts:48,76`, quests, rewards, surprise-boxes, `app/c/[token]/page.tsx:251`).

---

## Doğrulama (şüpheci inceleme)

### 1. Tüketim istatistikleri filtreye bağlı hesaplanıyor; "Yorumlandı" negatif çıkabiliyor — **DOĞRULANDI**

- **Kanıt:** `app/api/customer/consumptions/route.ts:40-46` `where` nesnesine `hasReview` filtresi (`review: { isNot: null }` / `review: null`) ekleniyor; `:89` `total = prisma.consumption.count({ where })` bu filtreli `where`'i kullanıyor; `:91-96` `reviewPending` yalnız `customerId` + `review: null` ile, filtreden bağımsız sayılıyor; `:110-112` `reviewed: total - reviewPending`. İstemci `app/customer/consumptions/page.tsx:79-80` sekmeye göre `hasReview` gönderiyor, `:97-105` dönen `stats`'ı koşulsuz state'e yazıyor, `:153-156` üç karta basıyor.
- **Yeniden üretim:** 8 tüketimi olan müşteri (5 yorumsuz, 3 yorumlu). "Yorumlanan" sekmesi → `?hasReview=true` → `total=3`, `reviewPending=5`, `reviewed=3-5=-2`; kartlarda Toplam 3 / Bekliyor 5 / Yorumlandı **-2** görünür. "Bekleyen" sekmesi → `total=5`, `reviewPending=5`, `reviewed=0`; Toplam 5, Yorumlandı 0 (gerçekte 3). Yalnız "Tümü" sekmesinde sayılar doğru.
- **Not:** Güvenlik açığı değil; kullanıcıya görünen veri doğruluğu hatası (YÜKSEK önem uygun: puan kazandıran ana metrik sekme değişince tutarsızlaşıyor). Düzeltme sunucuda: `stats` filtreden bağımsız iki sayımla (`count({customerId})` + `count({customerId, review: null})`, ya da tek `groupBy`/`COUNT FILTER`) hesaplanmalı; `pagination.total` filtreli sayım olarak ayrı kalmalı.

### 2. Sayfalama istemcide yok: yalnızca en yeni 20 tüketim erişilebilir — **DOĞRULANDI**

- **Kanıt:** `app/api/customer/consumptions/route.ts:15` `PAGE_SIZE_DEFAULT = 20`, `:34-37` `page`/`pageSize` parametre yoksa 1/20'ye düşüyor (`lib/api-http.ts:62-73`), `:49-53` `skip/take` + `createdAt desc`. İstemci `app/customer/consumptions/page.tsx:80` URL'ye `page`/`pageSize` eklemiyor; `:83-88` yanıt tipi `pagination` alanını hiç okumuyor; sayfada "daha fazla yükle"/sayfa düğmesi yok; `:131-139` arama yalnız bellekteki ≤20 kayıt üzerinde süzüyor.
- **Yeniden üretim:** 30 tüketimi (hepsi yorumsuz) olan müşteri sayfayı açar → listede 20 kart, "Toplam" kartında 30, "Bekliyor" kartında 30. En eski 10 bekleyen tüketim (her biri yorumla puan kazandırabilir) listede hiçbir sekmede görünmez; "Bekleyen" sekmesi de yalnız en yeni 20'yi döndürür. Eski bir işletme adını aramak boş sonuç verir. Yorum penceresi için süre sınırı yok (`app/api/customer/consumptions/[id]/review/route.ts` içinde `createdAt`/süre kontrolü bulunmadı), dolayısıyla bu kayıtlar hâlâ puan kazandırabilir durumda.
- **Not:** "Hiçbir şekilde" ifadesi küçük bir abartı: tekil detay sayfası (`/customer/consumptions/[id]`) bildirim ya da doğrudan bağlantıyla hâlâ açılabilir ve yorumlanmış olanlar `/customer/feedbacks` üzerinden ayrıca listelenir. Ancak bu sayfadan (ve dolayısıyla `my-card`/`feedbacks`/genel aramanın yönlendirdiği tek liste yüzeyinden) 20'nin ötesine erişim yolu yok; bulgu geçerli. Düzeltme: API zaten `pagination` döndürüyor; istemcide imleç tabanlı sonsuz kaydırma (`useSWRInfinite` veya "Daha fazla" düğmesi) ve aramanın sunucuya `q` parametresiyle taşınması.
