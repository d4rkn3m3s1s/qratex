# /customer/remedy

**Amaç:** Müşterinin, olumsuz geri bildirimine (QR Feedback ya da ConsumptionReview) karşılık işletmelerden gelen telafi tekliflerini (indirim / puan / ücretsiz ürün) listelediği, bekleyen teklifleri açıp tür+miktar seçerek kabul ettiği liste sayfası. Detay ve kabul akışı `/customer/remedy/[offerId]` alt sayfasında.

**Genel puan:** 4.5 / 10
**Karar:** yeniden tasarla (liste sayfası küçük ve okunur; asıl sorun, kabul edilen telafinin hiçbir yerde *teslim edilmemesi*: sayfa bir "kupon cüzdanı" vaat ediyor ama arkasında kullanım/kullandırma akışı yok)

İncelenen dosyalar: `app/customer/remedy/page.tsx`, `app/customer/remedy/layout.tsx`, `app/customer/remedy/[offerId]/page.tsx` (bağlam için), `app/api/customer/remedy/route.ts`, `app/api/customer/remedy/[offerId]/route.ts`, `app/api/customer/remedy/[offerId]/timeline/route.ts`, `app/api/dealer/remedy-offers/[id]/route.ts`, `app/api/dealer/feedbacks/[id]/remedy/route.ts`, `lib/remedy-options.ts`, `lib/admin-toast.ts`, `lib/utils.ts` (formatRelativeTime), `components/providers.tsx`, `components/admin/admin-premium-hero.tsx`, `components/ui/inline-loading-status.tsx`, `app/customer/feedbacks/page.tsx` (çakışma), `components/dashboard/notification-center.tsx`, `messages/tr.json` + `messages/en.json` (`customerRemedy`), `prisma/schema.prisma` (`RemedyOffer`, satır 1327-1355).

---

## Puan kartı

| Alan | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Listeleme ve sekme filtresi çalışıyor; fakat hata durumu boş durum gibi görünüyor, kabul sonrası liste 60 sn bayat kalıyor ve kabul edilen telafinin kullanım/teslim akışı sistemin hiçbir yerinde yok. |
| UX | 4/10 | Kabul edilen teklif ham anahtar (`discount / 20`) olarak gösteriliyor, neden telafi geldiği (orijinal geri bildirim) gösterilmiyor, kabul edilen kart tıklanamıyor; kullanıcı "şimdi ne yapacağım?" sorusuna cevap bulamıyor. |
| Görsel | 6/10 | Ortak `DashboardPageHero` + amber/zümrüt ayrımı tutarlı ve temiz; ancak oyunlaştırma paneli içinde "ödül" hissi vermeyen, sıradan bir yönetim listesi görünümünde. |
| Mimari | 5/10 | react-query kullanımı doğru yönde ama `queryFn` hata yutuyor, detay sayfası react-query dışında olduğu için önbellek invalidasyonu yok, API listede try/catch yok, `options`/`feedback`/`consumptionReview` boşuna taşınıyor. |
| Performans | 7/10 | Tek istek, `take: 50`, indeksli `userId` sorgusu; framer-motion hafif. Gereksiz include'lar (iki ilişki) ve 50 sınırında sayfalama eksikliği dışında sorun yok. |
| Erişilebilirlik + mobil | 5/10 | Sekmeler `role="tablist"`/`aria-selected` taşımıyor, dekoratif ikonlarda `aria-hidden` yok, tarih yerel diline uymuyor; mobilde sekme dokunma hedefi ~36px, layout genel olarak tek kolon ve taşmıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (başlık/açıklama) | ÇALIŞIYOR | `app/customer/remedy/layout.tsx:4-6` | `layoutMetadata.customerRemedy` TR/EN mevcut. Açıklama "Açık telafi görüşmeleri" diyor; sayfada görüşme (müzakere) yok — metin vaadi abartılı. |
| 2 | Rota koruması (yalnız CUSTOMER) | ÇALIŞIYOR | `proxy.ts:53,124` | `/customer/:path*` proxy'de rol ile korunuyor. |
| 3 | Suspense sarmalayıcı (useSearchParams için) | ÇALIŞIYOR | `page.tsx:270-281` | Fallback `InlineLoadingStatus`. |
| 4 | Veri çekme (`GET /api/customer/remedy`) | KISMİ | `page.tsx:48-57`, `route.ts:11-67` | Çalışıyor; fakat `!r.ok` iken `{offers: []}` döndürülüyor → 401/403/500 hepsi "boş" görünüyor. |
| 5 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:71-79` | Tam sayfa spinner; iskelet (skeleton) yok, hero da yükleme boyunca görünmüyor (layout sıçraması). |
| 6 | Hata bildirimi (toast) | BOZUK | `page.tsx:51,60-62` | Yalnızca ağ istisnasında tetiklenir; HTTP hataları sessizce boş listeye dönüşür. Tetiklendiğinde de aynı anda "Henüz telafi teklifi yok" boş durumu görünür (çelişkili). Toast metni `lib/admin-toast.ts:18-19` ile "Dikkat: " ön ekini alıyor (EN arayüzde de Türkçe). |
| 7 | Hata durumu UI'ı (yeniden dene) | EKSİK | `page.tsx` tamamı | `isError` için ayrı ekran/yeniden dene butonu yok. |
| 8 | Hero (eyebrow/başlık/açıklama/ikon) | ÇALIŞIYOR | `page.tsx:83-98` | Ortak bileşen; tema duyarlı (`admin-premium-hero.tsx:160-170`). |
| 9 | Hero "N bekliyor" çipi | ÇALIŞIYOR | `page.tsx:90-96` | Sadece bekleyen varsa. |
| 10 | Sekme filtresi Tümü / Bekleyen / Kabul edilen | ÇALIŞIYOR | `page.tsx:101-130` | İstemci tarafında filtre. Sekmeler yalnızca en az bir teklif varken görünür. |
| 11 | Sekme sayaçları | ÇALIŞIYOR | `page.tsx:107-109,126` | |
| 12 | Sekme ARIA semantiği | EKSİK | `page.tsx:110-127` | `role="tablist"/"tab"`, `aria-selected`, ok tuşu gezintisi yok; yalnız düz `button`. |
| 13 | Sekme seçiminin URL'de tutulması | EKSİK | `page.tsx:46` | `useState`; yenile/geri tuşunda sekme kaybolur, paylaşılabilir link yok. |
| 14 | Bekleyen teklifler kartı | ÇALIŞIYOR | `page.tsx:133-185` | İşletme adı, mesaj (2 satır), göreli tarih, detaya link. |
| 15 | Bekleyen teklif → detay linki | ÇALIŞIYOR | `page.tsx:152` | `/customer/remedy/{id}`. |
| 16 | `?offerId=`/`?id=` vurgulama (ring) | KISMİ / ÖLÜ KOD | `page.tsx:45,157` | Kod tabanında bu sayfaya query ile link veren hiçbir yer yok (bildirim doğrudan detay sayfasına gidiyor: `notification-center.tsx:514`). Vurgu yalnız bekleyenlerde, kabul edilenlerde yok; `scrollIntoView` yok. |
| 17 | Kabul edilen teklifler kartı | KISMİ | `page.tsx:188-233` | Seçim ham değer olarak gösteriliyor: `{o.selectedType} / {o.selectedValue}` (`page.tsx:219`) → "points / 100", "discount / 20". `options` içindeki `label`/`unit` kullanılmıyor. |
| 18 | Kabul edilen teklif → detay/zaman çizelgesi linki | EKSİK | `page.tsx:205-230` | Kart `Link` değil; kullanıcı kabul ettiği telafinin zaman çizelgesine liste üzerinden erişemiyor. |
| 19 | Kabul zamanı | KISMİ | `page.tsx:222-226` | `formatRelativeTime` locale parametresi verilmeden çağrılıyor → her zaman Türkçe (`lib/utils.ts:33-36`). EN'de "2 gün önce accepted" karışık cümle oluşur. |
| 20 | Göreli oluşturma tarihi | KISMİ | `page.tsx:170-172` | Aynı locale sorunu. |
| 21 | Boş durum (hiç teklif yok) | ÇALIŞIYOR | `page.tsx:236-265` | İkon + başlık + açıklama; CTA yok (ör. "Geri bildirimlerime git"). |
| 22 | Boş durum (filtrelenmiş) + "Tümüne dön" | ÇALIŞIYOR | `page.tsx:245-263` | Not: sekmeler yalnızca teklif varken görünür, filtrelenmiş boş durum ancak bir sekme 0 iken o sekmeye tıklanırsa oluşur — doğru çalışıyor. |
| 23 | Bilinmeyen statü güvenliği | KISMİ | `page.tsx:64-68`, `route.ts:25-36` | "Tümü" sekmesi `pending`+`accepted` dışındaki statüleri (şemada `expired`, `schema.prisma:1334`) sayar ama hiçbir kartta render etmez; böyle bir kayıt olursa sayaç >0, ekran boş ve boş durum da gösterilmez. Bugün `expired` yazan kod yok (doğrulandı: grep), bu yüzden gizli bir tuzak. |
| 24 | Kabul edilen telafinin kullanımı (kupon kodu/QR, bayiye gösterme, "kullanıldı" işareti) | EKSİK | grep: `selectedType`/`selectedValue` yalnız `app/api/customer/remedy/*` ve `app/customer/remedy/*` içinde geçiyor | Bayi panelinde kabul edilen seçimi gören, kullandıran veya kapatan hiçbir uç/sayfa yok. |
| 25 | "Puan" türü telafinin puan bakiyesine işlenmesi | SAHTE (vaat edilip yerine getirilmiyor) | `lib/remedy-options.ts:20`, `app/api/customer/remedy/[offerId]/route.ts:159-190` | Kullanıcı "100 puan" seçip kabul ediyor; kabul işleminde hiçbir puan kaydı/ledger yazılmıyor, başka bir yerde de bu seçimi işleyen kod yok. |
| 26 | Sonsuz/geç yükleme (50 üstü) | EKSİK | `route.ts:41` | `take: 50`, sayfalama/“daha fazla” yok; eski kabul edilenler sessizce düşer. |
| 27 | ADMIN rolü ile görüntüleme | BOZUK (kenar durum) | `route.ts:17-23` | ADMIN için `userId` query zorunlu; sayfa göndermiyor → 400 → `queryFn` boş liste döndürür. Admin önizlemesi anlamsız boş ekran. |
| 28 | Orijinal geri bildirim bağlamı (puan/metin) | EKSİK | API `route.ts:44-45,61-62` döndürüyor; `page.tsx` kullanmıyor | "Bu telafi neden geldi?" bilgisi sayfada yok; API boşuna iki ilişki çekiyor. |
| 29 | Son kullanma tarihi / aciliyet | EKSİK | `schema.prisma:1327-1355` | `expiresAt` alanı yok; statü yorumunda `expired` var ama yazan yok. |
| 30 | Gerçek zamanlı güncelleme / bildirimden sonra tazeleme | EKSİK | `components/providers.tsx:207-215` | `staleTime` 60 sn, `refetchOnWindowFocus: false`; yeni teklif bildirimi gelse de liste tazelenmez. |
| 31 | Motion (giriş/stagger) | ÇALIŞIYOR | `page.tsx:81,99-103,135-147,190-204` | Ölçülü; global `MotionConfig reducedMotion="user"` (`providers.tsx:232`) azaltılmış hareketi karşılar. Sayfa kendi `LazyMotion strict` sarmalayıcısını da açıyor (gereksiz ama zararsız) ve proje kuralı `m as Motion` yerine çıplak `m` kullanıyor. |
| 32 | Kabul sonrası listenin güncel olması | BOZUK | `page.tsx:48-56`; detay `[offerId]/page.tsx:104-147` | Detay sayfası react-query kullanmıyor ve `['customer','remedy']` anahtarını invalidate etmiyor; "Geri" ile dönen kullanıcı az önce kabul ettiği teklifi 60 sn boyunca "Bekleyen" altında görür. |

**Sayım:** 32 özellik — ÇALIŞIYOR 13 · KISMİ 6 · BOZUK 3 · SAHTE 1 · EKSİK 9

---

## Bulgular

### 1. [KRİTİK] Veri bütünlüğü — Kabul edilen seçim, teklif seçeneklerine karşı doğrulanmıyor
- **Kanıt:** `app/api/customer/remedy/[offerId]/route.ts:15-18` (`z.string().min(1)`), `:126-129` (yalnız `id, userId, status` seçiliyor, `options` okunmuyor), `:160-168` (gelen değer doğrudan yazılıyor).
- **Sorun:** Müşteri, detay sayfası yerine doğrudan `PATCH` atarak `{"selectedType":"discount","selectedValue":"100"}` ya da `{"selectedType":"points","selectedValue":"999999"}` kaydedebilir. Bu liste sayfası (`page.tsx:219`) o değeri "kabul edildi" rozetinde gösterir. Bugün değeri tüketen bir bayi akışı olmadığı için doğrudan para/puan kaybı yok; ancak Bulgu 2 çözüldüğü (telafi gerçekten kullandırılmaya başlandığı) anda bu açık birebir sahtecilik kanalına dönüşür. Ayrıca müşteri ekranı, işletmenin hiç teklif etmediği bir telafiyi "kabul edilmiş" olarak sergileyebilir (müşteri–işletme anlaşmazlığında yanıltıcı kanıt).
- **Öneri:** PATCH'te `options`'ı da seç; `selectedType` için `options.find(o => o.type === t)`, `selectedValue` için `opt.values.map(String).includes(v)` kontrolü yap, uymuyorsa 400. Seçilen `label`/`unit`'i de offer'a snapshot olarak yaz (`selectedLabel`, `selectedUnit`) ki şablon sonradan değişse de geçmiş doğru kalsın. Güncellemeyi `updateMany` koşuluna dahil et (yarış koşulu zaten doğru korunuyor).
- **Efor:** S

### 2. [KRİTİK] Ürün/işlevsellik — Kabul edilen telafi hiçbir yerde teslim edilmiyor; "Puan" seçeneği sahte vaat
- **Kanıt:** `selectedType`/`selectedValue` grep'i yalnız `app/api/customer/remedy/route.ts`, `app/api/customer/remedy/[offerId]/route.ts`, `app/customer/remedy/page.tsx`, `app/customer/remedy/[offerId]/page.tsx` dosyalarında çıkıyor; `app/dealer/*`, `app/api/dealer/*`, `lib/*` içinde yok. `lib/remedy-options.ts:20` "Puan" seçeneğini sunuyor; `[offerId]/route.ts:159-190` kabul anında puan ledger'ı, bildirim veya webhook üretmiyor (`lib/webhook-dispatch.ts:18` yalnız `remedy.created` olayını tanıyor).
- **Sorun:** Telafi döngüsü müşteri tarafında "Seçiminiz kaydedildi — teklif kullanıma hazır" (`[offerId]/route.ts:187`) diyerek bitiyor ama: (a) bayi hangi seçeneğin seçildiğini göremiyor, (b) kasada gösterilecek kod/QR yok, (c) "kullanıldı" statüsü yok, (d) puan seçildiyse bakiyeye eklenmiyor. Bu sayfanın "Kabul ettiğiniz teklifler" kartı fiilen bir *ölü kupon arşivi*. Şikâyet etmiş, zaten mutsuz bir müşteriye ikinci bir hayal kırıklığı yaşatmak, telafi özelliğinin varlık nedenini tersine çeviriyor.
- **Öneri:** Telafiyi uçtan uca bir "kupon yaşam döngüsü" olarak modelle: `pending → accepted (claimable) → redeemed | expired`.
  - **Puan türü:** kabul anında otomatik ve tek seferlik kredi — `points-economy-invariants` kurallarına uygun atomik bir işlemle (aynı transaction içinde `updateMany status:'pending'→'redeemed'` + puan ledger kaydı + `points_credited` izi); idempotans anahtarı `remedyOfferId`.
  - **İndirim/ücretsiz ürün:** kabul anında kısa, tahmin edilemez bir `redeemCode` (+ QR) üret; bayi tarafında `/dealer/remedy-queue` içine "Kullandır" sekmesi (kod/QR okut → `redeemedAt`, `redeemedBy`, `redeemedLocationId`).
  - Şemaya `expiresAt`, `redeemedAt`, `redeemCode` (unique), `selectedLabel`, `selectedUnit` ekle; günlük cron ile süresi geçenleri `expired` yap ve müşteriye "son 3 gün" hatırlatması gönder.
  - Kabulde bayiye bildirim + `remedy.accepted` webhook'u.
- **Efor:** L

### 3. [YÜKSEK] Hata yönetimi — HTTP hataları "henüz teklif yok" olarak gösteriliyor
- **Kanıt:** `page.tsx:51` `const j = r.ok ? await r.json() : { offers: [] };`, `page.tsx:60-62`, `page.tsx:236-265`; API'de try/catch yok `app/api/customer/remedy/route.ts:11-67` (DB kesintisinde ham 500, `responseIfDatabaseUnavailable` kullanılmıyor — kardeş uç `[offerId]/route.ts:99` kullanıyor).
- **Sorun:** Oturum süresi dolmuş (401), token-replay reddi, DB kesintisi gibi durumlarda kullanıcı "Henüz telafi teklifi yok" görür ve bekleyen bir telafisini kaçırdığını sanmaz. Ağ istisnasında ise toast ile boş durum aynı anda görünür (çelişkili mesaj). Toast `admin-toast` üzerinden "Dikkat: " öneki alıyor; müşteri panelinde admin yardımcı fonksiyonu kullanılıyor ve EN arayüzde Türkçe önek çıkıyor (`lib/admin-toast.ts:18-19`).
- **Öneri:** `queryFn` içinde `if (!r.ok) throw new Error(...)`; sayfada `isError` için ayrı durum kartı (açıklama + "Tekrar dene" → `refetch()`), boş durumu yalnızca `isSuccess && offers.length===0` iken göster. API'yi diğer uçlar gibi `try/catch` + `responseIfDatabaseUnavailable` ile sar. Müşteri paneli için locale'e uyan ortak bir `customer-toast` (ya da doğrudan `sonner`) kullan.
- **Efor:** S

### 4. [YÜKSEK] Veri tazeliği — Kabulden sonra liste 60 saniye bayat
- **Kanıt:** `page.tsx:48-56` (`staleTime: 60_000`), `components/providers.tsx:210-213` (`refetchOnWindowFocus: false`), `[offerId]/page.tsx:104-147` (düz `fetch`, `queryClient` yok).
- **Sorun:** Kullanıcı listeden bekleyen teklife girip kabul eder, "Geri" der; react-query önbelleği taze sayıldığı için teklif hâlâ "Bekleyen" altında, hero çipi hâlâ "1 bekliyor". Tekrar tıklarsa detay sayfası "zaten işlendi" görünümüne düşer. Güven kırıcı bir tutarsızlık.
- **Öneri:** Detay sayfasını react-query'ye taşı (`useQuery(['customer','remedy',id])` + `useMutation`); `onSuccess`'te `queryClient.setQueryData(['customer','remedy'], …)` ile iyimser güncelleme ve `invalidateQueries(['customer','remedy'])`. Ayrıca `['customer','feedbacks']` gibi aynı uçtan beslenen sorguları da invalidate et. Liste için `refetchOnMount: 'always'` veya `staleTime` 10 sn düşünülebilir.
- **Efor:** S

### 5. [YÜKSEK] UX — Kabul edilen seçim ham iç anahtarlarla gösteriliyor
- **Kanıt:** `page.tsx:218-220` `{o.selectedType} / {o.selectedValue}`; aynı desen detayda `[offerId]/page.tsx:203`. `options` API'den geliyor (`route.ts:55`) ve tipte tanımlı (`page.tsx:29`) ama kullanılmıyor.
- **Sorun:** Kullanıcı "discount / 20", "points / 100", "free_item / 1" görür — İngilizce teknik anahtar, birim yok (%20 mi, 20 TL mi?). Türkçe arayüzde dil karışıklığı; profesyonel ödül ürünlerinde (Starbucks, Monzo) telafi her zaman "%20 indirim · 14 Eki'ye kadar" gibi insan diliyle ve tek bakışta okunur.
- **Öneri:** `formatRemedySelection(offer, t)` yardımcı fonksiyonu: önce snapshot (`selectedLabel/Unit`), yoksa `options.find(type)` üzerinden "%20 İndirim", "100 Puan", "1 Ücretsiz ürün". Tür başına ikon + renk (indirim=etiket, puan=yıldız, ürün=kahve). Kod tarafında `t()` anahtarları ile EN desteği.
- **Efor:** S

### 6. [ORTA] Bilgi mimarisi — Telafinin bağlamı (hangi geri bildirim, ne zaman, kaç yıldız) gösterilmiyor
- **Kanıt:** API `route.ts:44-45,61-62` `feedback` ve `consumptionReview` döndürüyor; `page.tsx` tipinde `consumptionReview` hiç yok (`page.tsx:25-37`) ve `feedback` kullanılmıyor.
- **Sorun:** Kullanıcı birden fazla işletmeye yorum yazdıysa "bu telafi hangi deneyimim için?" sorusunun cevabı yok; aynı zamanda API her istekte gereksiz iki ilişki çekiyor.
- **Öneri:** Kartın altına küçük bir "Senin yorumun" alıntı satırı (yıldız + ilk 80 karakter + tarih) ve orijinal geri bildirime link (`/customer/feedbacks#...`). Kullanılmayacaksa include'ları API'den çıkar.
- **Efor:** S

### 7. [ORTA] UX — Kabul edilen kartlar tıklanamıyor; zaman çizelgesine liste üzerinden erişim yok
- **Kanıt:** `page.tsx:198-230` (`m.div`, `Link` yok); karşılaştırma `page.tsx:152` (bekleyenlerde `Link`). Zaman çizelgesi yalnız detay sayfasında (`[offerId]/page.tsx:249-272`).
- **Öneri:** Tüm kartları aynı `RemedyOfferCard` bileşeninde birleştir, hepsi detaya gitsin; kabul edilenlerde detay sayfası "kupon görünümü" (kod/QR, son tarih, kullanım talimatı) göstersin.
- **Efor:** S

### 8. [ORTA] i18n — Tarihler her zaman Türkçe, EN'de karışık cümle
- **Kanıt:** `page.tsx:171,224` `formatRelativeTime(o.createdAt)` — `locale` verilmiyor; `lib/utils.ts:33-36` varsayılan `'tr'`. `page.tsx:224` "{zaman} {t('customerRemedy.accepted')}" → EN'de "2 gün önce accepted".
- **Öneri:** `useAppLocale()` ile locale'i geçir; cümleyi interpolasyonlu tek anahtar yap: `customerRemedy.acceptedAgo: "{time} kabul edildi" / "Accepted {time}"`.
- **Efor:** S

### 9. [ORTA] Sağlamlık — Bilinmeyen statülerde "hayalet" sayaç ve boş ekran
- **Kanıt:** `route.ts:25-36` (gizlenenler dışında her statü döner), `page.tsx:64-68` (yalnız `pending`/`accepted` render), `page.tsx:236` (boş durum koşulu `offers.length===0 || filteredOffers.length===0`), `schema.prisma:1334` (`expired` belgelenmiş).
- **Sorun:** Bulgu 2 kapsamında `expired`/`redeemed` eklendiği anda "Tümü (3)" yazıp hiçbir şey göstermeyen bir ekran oluşur.
- **Öneri:** Statüyü tip-güvenli bir union (`RemedyStatus`) ve tek bir `STATUS_META` haritası ile yönet; render'ı statü gruplarına (Aktif / Kullanıldı / Süresi doldu) göre yap ve bilinmeyen statü için genel bir kart göster. API'de `where.status` için allowlist kullan.
- **Efor:** S

### 10. [ORTA] Erişilebilirlik — Sekmeler ve ikonlar
- **Kanıt:** `page.tsx:99-129` (düz buton grubu), `page.tsx:140,163,166,174,197,207` (ikonlarda `aria-hidden` yok), `page.tsx:115` (`py-2` + `text-sm` ≈ 36px dokunma hedefi; proje genelinde `min-h-10` deseni var: `app/customer/feedbacks/page.tsx:302`).
- **Öneri:** shadcn `Tabs` (Radix; `role="tablist"`, ok tuşu, `aria-selected`) veya `ToggleGroup`; ikonlara `aria-hidden`; sekmelere `min-h-11 touch-manipulation`. Sayaçları `aria-label` ile "Bekleyen, 2 teklif" şeklinde oku.
- **Efor:** S

### 11. [DÜŞÜK] Ölü/yarım kod — `?offerId=` vurgulaması kimse tarafından kullanılmıyor
- **Kanıt:** `page.tsx:45,157`; tüm `/customer/remedy` linkleri query parametresiz (`app/customer/feedbacks/page.tsx:303,357`, `components/dashboard/notification-center.tsx:514` doğrudan detay).
- **Öneri:** Ya kaldır ya da anlamlı hâle getir: bildirimden listeye `?offerId=` ile gelindiğinde kartı `scrollIntoView` + kısa bir vurgu animasyonu (reduced-motion'da yalnız ring), hem bekleyen hem kabul edilen için.
- **Efor:** S

### 12. [DÜŞÜK] ADMIN rolü sessizce boş ekran görür
- **Kanıt:** `route.ts:17-23` (ADMIN için `userId` zorunlu → 400), `page.tsx:50-51`.
- **Öneri:** ADMIN için `userId` yoksa `session.user.id` kullan ya da sayfa admin önizlemesinde açık bir "müşteri seçin" mesajı göstersin. Bulgu 3 düzeltilince en azından hata görünür olur.
- **Efor:** S

### 13. [DÜŞÜK] Mimari tutarlılık — Yerel `LazyMotion strict` ve çıplak `m`
- **Kanıt:** `page.tsx:7,81,267`; global sarmalayıcı `components/providers.tsx:241`.
- **Sorun:** Proje kuralı global `LazyMotion` + `m as Motion`; bu sayfa ayrıca bir `LazyMotion strict` açıyor. Zararsız ama tutarsız; `strict` altında ileride `motion.` kullanılırsa çalışma zamanı hatası verir.
- **Öneri:** Yerel sarmalayıcıyı kaldır, `import { m as Motion }` deseni.
- **Efor:** S

### 14. [DÜŞÜK] Sayfalama yok (50 sınırı)
- **Kanıt:** `route.ts:41`.
- **Öneri:** Cursor tabanlı sayfalama (`createdAt,id`) + "Daha eskileri göster"; ya da varsayılan olarak yalnız aktif + son 90 gün, arşiv ayrı sekme.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Kupon cüzdanı / "kullan" anı** (Starbucks Rewards "Offers", Monzo/Revolut cashback kartları): kabul edilen telafi için kasada gösterilecek QR/kod, "kullanıldı" geri bildirimi ve bayi tarafında okutma. Şu an tamamen yok.
2. **Son kullanma tarihi + geri sayım + hatırlatma bildirimi** (Starbucks "expires in 3 days", Duolingo aciliyet dili): `expiresAt` ve cron ile hatırlatma.
3. **Puan türünde anlık kredi animasyonu** (Duolingo XP sayacı): kabul anında puanın bakiyeye "akması" ve bakiyeyle bağ kurulması — ekonomi kurallarına (escrow/atomik tek seferlik kredi) uygun.
4. **Bağlam ve kapanış hissi**: "Yorumunu dikkate aldık" — orijinal yorum + işletme yanıtı + telafi, tek bir "çözüm hikâyesi" kartında (Monzo'nun anlaşmazlık çözümü akışı gibi).
5. **Telafi sonrası memnuniyet sorusu** ("Bu telafi seni memnun etti mi?" 1 dokunuşluk): bayi için çözüm-oranı metriği, müşteri için kapanış.
6. **Durum grupları ve arşiv** (Aktif / Kullanıldı / Süresi doldu) — bugünkü iki statü modeli kullanım sonrasını ifade edemiyor.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Şikâyet ettim → işletme beni duydu → telafimi seçtim → kasada kullandım → kapandı." Sayfa bir yönetim listesi değil, müşterinin **telafi cüzdanı** olmalı. İlk bakışta: kullanılmayı bekleyen kaç telafim var, hangisinin süresi yakında doluyor, şimdi ne yapmalıyım.

**Yerleşim (mobil öncelikli):**
1. **Kompakt üst bölüm:** Hero küçülür; altında tek satır özet: "2 aktif telafi · 1'i 3 gün içinde bitiyor".
2. **"Seçim bekliyor" şeridi (pending):** Her teklif bir eylem kartı — işletme logosu/adı, mesaj, "Senin yorumun: ★★ 'Kahve soğuktu…'" alıntısı ve tek birincil CTA "Telafini seç". Seçim, ayrı sayfaya gitmeden alttan açılan bir **sheet** içinde (tür = büyük seçilebilir kartlar, miktar = segment kontrol). Detay sayfası derin link ve zaman çizelgesi için kalır.
3. **"Kullanıma hazır" cüzdanı (accepted/claimable):** Kupon görünümlü kartlar (kenar çentikli bilet formu), insan diliyle "%20 İndirim", son tarih rozeti, "Kasada göster" → tam ekran QR + kısa kod, ekran parlaklığı ipucu.
4. **Arşiv (redeemed/expired):** Katlanabilir, soluk; "14 Eki'de Kahve Durağı'nda kullanıldı".
5. Sekme yerine bu üç bölüm doğal sırayla akar; filtreye gerek kalmaz (az sayıda kayıt). Gerekirse arşiv için `?view=archive`.

**Motion/3D (yerinde ve ölçülü):** 3D gerekmez — bu bir güven/çözüm anı, gösteri anı değil. Önerilen tek "an": kabul edildiğinde kartın "bekleyen" şeridinden "cüzdan"a `layoutId` ile süzülmesi ve puan türünde bakiyeye küçük bir sayaç tiki (Duolingo hissi). QR açılışında hafif ölçek+opaklık. Hepsi `MotionConfig reducedMotion="user"` ile otomatik söner; reduced-motion'da yalnız renk/opaklık geçişi.

**Veri/API değişiklikleri:**
- `RemedyOffer`: `expiresAt DateTime?`, `redeemedAt DateTime?`, `redeemedById String?`, `redeemCode String? @unique`, `selectedLabel String?`, `selectedUnit String?`; statü union'ı `pending | accepted | redeemed | expired | awaiting_dealer_approval | rejected`.
- `PATCH /api/customer/remedy/[offerId]`: seçenek doğrulaması (Bulgu 1), snapshot alanları, puan türünde atomik kredi + `redeemed`, diğerlerinde `redeemCode` üretimi, bayiye bildirim + `remedy.accepted` webhook.
- `POST /api/dealer/remedy-offers/redeem` (yeni): kod/QR ile kullandırma, `updateMany where status:'accepted' AND redeemCode` ile yarış güvenli.
- `GET /api/customer/remedy`: try/catch, statü allowlist, cursor sayfalama, kartta gerekecek bağlamı (rating + kısaltılmış metin) tek tip `source` alanında (`feedback | consumptionReview`) döndür.
- Cron: süresi dolanları `expired` yap, 72 saat kala hatırlatma (cron fail-closed kuralına uygun).
- İstemci: tek `useRemedyOffers()` hook'u (react-query) — hem bu sayfa, hem detay, hem `/customer/feedbacks` özet kartı aynı önbelleği paylaşsın; mutation'larda invalidate.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/feedbacks`** aynı `GET /api/customer/remedy` ucunu çağırıp kendi telafi özet kartını render ediyor (`app/customer/feedbacks/page.tsx:112-116, 295-363`), üstelik sabit Türkçe etiketlerle (`'Kabul edildi'`, `'Bekliyor'`, `'İşletme'` — `feedbacks/page.tsx:319-326`) ve ham statüyü fallback olarak basarak. İki ayrı render mantığı, iki ayrı veri çekme yolu (biri react-query, biri düz `fetch`) var. Öneri: telafi kartını paylaşılan bir `components/customer/remedy/RemedyOfferCard` + `useRemedyOffers()` hook'una çıkar; feedbacks sayfası yalnız "N aktif telafin var → Cüzdana git" özet şeridi göstersin.
- **`/customer/rewards`, `/customer/surprise-boxes`, `/customer/my-card`** ile kavramsal komşuluk: kullanıcı açısından "telafi" de bir ödül/kupon. Uzun vadede tek bir **"Cüzdan"** (ödüller + telafiler + sürpriz kutu kazanımları, ortak "kasada göster" QR'ı) altında birleştirilmesi değerlendirilmeli; kısa vadede `/customer/remedy` ayrı kalabilir ama kupon görünümü ve "kasada göster" bileşeni ödüllerle ortak olmalı. (Bu sayfaların kendi iç yapısı bu denetimde okunmadı — doğrulanmadı.)
- **`/customer/remedy/[offerId]`**: liste ile detay arasında seçim akışı bölünmüş; seçim sheet'i listeye taşındığında detay sayfası yalnız derin link + zaman çizelgesi + kupon/QR görünümü olarak sadeleşmeli. Detay sayfasındaki sabit Türkçe metinler (`[offerId]/page.tsx:254,257`) ayrıca i18n'e alınmalı.
- Kaldırma önerilmez: telafi, şikâyet döngüsünü kapatan tek müşteri yüzeyi; ama arkası (teslim akışı) inşa edilmeden sayfa değer üretmiyor.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunurdur; kod, veritabanı, build veya test çalıştırılmadı. Okunan dosyalar: `app/customer/remedy/page.tsx`, `app/customer/remedy/[offerId]/page.tsx`, `app/api/customer/remedy/route.ts`, `app/api/customer/remedy/[offerId]/route.ts`, `app/api/dealer/remedy-offers/[id]/route.ts`, `app/api/dealer/remedy-queue/route.ts`, `lib/remedy-options.ts`, `lib/remedy-timeline.ts`, `prisma/schema.prisma` (`model RemedyOffer`, satır 1327-1355), `messages/tr.json`.

### 1. Telafi kabulünde seçim sunucu tarafında doğrulanmıyor — **DOĞRULANDI (önem: ORTA'ya düşürülmeli)**

- Kanıt: `app/api/customer/remedy/[offerId]/route.ts:15-18` şema yalnız `z.string().min(1)` (üst sınır da yok); `:126-129` teklif okunurken `options` seçilmiyor; `:160-168` `parsed.data.selectedType/selectedValue` olduğu gibi yazılıyor; `:187-190` aynı keyfi değer `RemedyTimelineEvent.meta`'ya da kopyalanıyor. İstemci tarafındaki tek kısıt `app/customer/remedy/[offerId]/page.tsx:95-102` (yalnız UI seçimini sıfırlıyor), sunucuya yansımıyor.
- Yeniden üretim: Kendi `pending` teklifi olan bir CUSTOMER oturumuyla `PATCH /api/customer/remedy/<offerId>` gövdesi `{"selectedType":"discount","selectedValue":"100"}` (veya `points` / `999999`) gönderir → 200 `success:true`; kayıt `accepted` olur ve liste sayfası `page.tsx:220-222` rozetinde "discount / 100" gösterir. Sahiplik (`:137`, `:161`) ve tek-seferlik geçiş (`updateMany where status:'pending'`) doğru, yani başkasının teklifine dokunulamaz.
- Neden kritik değil: `selectedType/selectedValue` alanlarını okuyan tek kod müşteri ekranları (`grep` sonucu: yalnız `app/api/customer/remedy/*` ve `app/customer/remedy/*`); bayi API'leri (`remedy-queue/route.ts:19-21` yalnız `awaiting_dealer_approval` döner) ve hiçbir puan/ledger yolu bu değeri tüketmiyor. Bugünkü somut etki: veritabanında teklifin `options`'ıyla çelişen kayıt + müşterinin kasada "%100 indirim kabul edildi" ekranını gösterebilmesi (sosyal mühendislik). Bulgu 2'deki teslim akışı (puan kredisi / kod ile kullandırma) eklendiği anda doğrudan para/puan basma kanalına dönüşeceği için, düzeltme o işten ÖNCE ya da aynı PR'da yapılmalı.
- Ek not: `selectedValue` için `max()` olmadığından keyfi uzunlukta metin DB'ye ve timeline `meta`'sına yazılabilir; allowlist kontrolü bunu da kapatır.

### 2. Kabul edilen telafi teslim edilmiyor; "Puan" türü bakiyeye işlenmiyor — **DOĞRULANDI**

- Kanıt: `lib/remedy-options.ts:18-22` varsayılan seçeneklerde `points` (50-200 puan) var; `[offerId]/route.ts:159-198` kabulde yalnız statü + seçim yazılıyor, puan hareketi/ledger, bayi bildirimi, kupon kodu veya webhook yok; timeline etiketi ise "Seçiminiz kaydedildi — teklif kullanıma hazır" (`:187`). `selectedType|selectedValue` grep'i `app/dealer`, `app/api/dealer`, `lib` altında sıfır sonuç veriyor; bayinin seçimi görebileceği hiçbir uç yok (`remedy-queue` yalnız onay kuyruğunu, `business-outcomes/route.ts:59` yalnız `accepted` sayısını döner). Şemada `redeemed`/`redeemCode`/`expiresAt` alanı yok (`schema.prisma:1327-1355`).
- Yeniden üretim: Bayi teklifi yayınlar (`remedy-offers/[id]/route.ts:89-120`, bildirim "Size özel bir telafi hazır") → müşteri "Puan / 100" seçip kaydeder → müşterinin puan bakiyesi değişmez; bayi panelinde bu seçimi gösteren ekran/API yoktur; kasada doğrulanacak kod/QR üretilmez. Vaat edilen telafi, işletme personelinin müşteri ekranına güvenmesine kalmış durumda.
- Değerlendirme: Ürün düzeyinde gerçek ve yüksek önemde bir boşluk (güvenlik açığı değil, işlevsel eksik). Puan kredisi eklenirken proje kuralı gereği atomik, tek-seferlik ve `points_credited` görünürlüklü yazılmalı (bkz. puan ekonomisi değişmezleri) ve Bulgu 1'in allowlist'i ön koşuldur.

### 3. API hataları boş liste olarak yutuluyor — **DOĞRULANDI (önem: ORTA)**

- Kanıt: `app/customer/remedy/page.tsx:50-52` `r.ok ? await r.json() : { offers: [] }` — HTTP hata kodu istisna fırlatmadığı için react-query `isError` false kalır, `:59-61`'deki toast tetiklenmez ve `:238-254` "Henüz telafi teklifi yok" boş durumu çizilir. `app/api/customer/remedy/route.ts:11-67` try/catch ve `responseIfDatabaseUnavailable` içermiyor (detay ucu `[offerId]/route.ts:98-106` içeriyor), dolayısıyla Prisma/Neon hatası çıplak 500 olarak döner.
- Yeniden üretim: Neon geçici kesintisi veya oturum süresi dolmuşken (401) sayfa açılır → istek 500/401 döner → kullanıcı hata mesajı yerine "teklifin yok" görür, yenileme/tekrar deneme yönlendirmesi yoktur; `staleTime: 60_000` nedeniyle bu boş sonuç bir dakika önbellekte de kalır.
- Not: "Kritik/yüksek" değil; veri kaybı yok, yalnız yanıltıcı boş durum. Düzeltme: `!r.ok` durumunda `throw` (401'de giriş sayfasına yönlendirme), sayfada `isError` için ayrı hata kartı + "Tekrar dene" (`refetch`), API'de try/catch + `responseIfDatabaseUnavailable`.

---

## Uygulama (Dalga 2)

**Yeni yüzey:** `/customer/me/voices` (Ben › Seslerim). Sunucu bileşeni `app/customer/me/voices/page.tsx` özet + ilk liste sayfası + telafileri paralel ön yükler; istemci adası `components/customer/m-seslerim/**` (çekmece gövdeleri `next/dynamic` ile yalnız açılınca yüklenir). Veri katmanı `lib/customer-voices/{types,core,server}.ts`; BFF uçları `GET /api/customer/voices` (imleç sayfalı birleşik liste), `GET /api/customer/voices/summary` ("Sesin"), `GET /api/customer/voices/[key]` (detay; `fb-<id>` / `cs-<consumptionId>`), `GET /api/customer/remedy` (telafi listesi, yeniden yazıldı). Hepsi `defineRoute` (yalnız CUSTOMER, zod, hız sınırı, zarf v2). Eski rotalar sorgu parametrelerini koruyarak `permanentRedirect` ile Seslerim'e gider. Testler: `__tests__/lib/customer-voices.test.ts`, `__tests__/api/customer-voices-routes.test.ts`, `__tests__/api/customer-review-write.test.ts` (35 test, yeşil).
### Özellik envanteri — yeni durum

| # | Yeni durum | Not |
|---|---|---|
| 1 | KALDIRILDI | Rota Seslerim'e yönlenir. |
| 2 | ÇALIŞIYOR | |
| 3 | ÇALIŞIYOR | |
| 4 | ÇALIŞIYOR | `defineRoute`; HTTP hatası boş liste olmaz. |
| 5 | ÇALIŞIYOR | Sunucu ön yüklemesi + iskelet. |
| 6 | ÇALIŞIYOR | BOZUK düzeldi: `ErrorState` + "Tekrar dene"; admin toast yok. |
| 7 | ÇALIŞIYOR | |
| 8 | KALDIRILDI | Ayrı hero yok; Seslerim başlığı. |
| 9 | ÇALIŞIYOR | Aksiyon bandı sayacı ("N telafi teklifi seçimini bekliyor"). |
| 10 | KALDIRILDI | Sekme yerine doğal akış: bekleyen → bant, sonuçlanan → "Telafilerim" (+ liste "Telafili" filtresi). |
| 11 | KALDIRILDI | #10. |
| 12 | KALDIRILDI | Sekme yok; seçimler `ChoiceChips` (radiogroup). |
| 13 | KALDIRILDI | Açık teklif URL'de (`?offer=`). |
| 14 | ÇALIŞIYOR | |
| 15 | ÇALIŞIYOR | `?offer=` çekmecesi (ayrı sayfa yok). |
| 16 | ÇALIŞIYOR | Eski `?offerId=`/`?id=` → `?offer=` çekmecesini açar. |
| 17 | ÇALIŞIYOR | İnsan diliyle seçim ("%20 İndirim", "100 puan"). |
| 18 | ÇALIŞIYOR | Sonuçlanan kartlar da çekmeceyi açar. |
| 19 | ÇALIŞIYOR | Tarih dile göre, interpolasyonlu cümle. |
| 20 | ÇALIŞIYOR | Teklif zamanı müşteriye bildirim anı. |
| 21 | KALDIRILDI | Teklif yoksa bölüm çizilmez. |
| 22 | KALDIRILDI | Filtre sekmesi yok. |
| 23 | ÇALIŞIYOR | Durum allowlist'i (`pending`, `accepted`, `expired`); süresi dolmuş ayrı kart. |
| 24 | ÇALIŞIYOR (puan) / KALAN (indirim, ürün) | Puan türü kabulde kredilenir. İndirim/ürün: işletme seçimi bildirimle alır, müşteri kasada telafi kartını + kısa referansı gösterir; doğrulanabilir kod ve "kullanıldı" durumu ŞEMA + bayi okutma ister (F2.5). |
| 25 | ÇALIŞIYOR | SAHTE kapandı: `acceptRemedyOffer` aynı transaction'da `mintPoints` (tek seferlik `remedy:<offerId>`, yeni `remedy` tavanı gün 1.000 / hafta 2.000, bayi atıflı) + `completed` olayı (gerçek miktar). |
| 26 | ÇALIŞIYOR (kısmi) | 50 sınırı `hasMore` ile bildirilir (sessiz kesilme yok); tam imleç sayfalama KALAN (kayıt sayısı çok düşük). |
| 27 | KALDIRILDI | Liste ucu yalnız müşterinin kendi verisi (ADMIN önizlemesi bu yüzeyin işi değil); rol reddi görünür hata. |
| 28 | ÇALIŞIYOR | Kaynak yorum alıntısı + "Yoruma git". |
| 29 | KALAN | ŞEMA (`expiresAt`). |
| 30 | ÇALIŞIYOR | Kabul sonrası tüm Seslerim sorguları geçersizleşir; 30 sn tazelik. |
| 31 | ÇALIŞIYOR | Global `LazyMotion` + `m`; yerel `LazyMotion strict` kalktı. |
| 32 | ÇALIŞIYOR | BOZUK düzeldi: kabul aynı önbelleği günceller (bayat "Bekleyen" yok). |

### Kapanan bulgular
1 (B5/P0-22 ile sunucuda kapalıydı; UI yalnız sunucunun döndürdüğü seçenekleri sunar), 2 (puan türü teslim edildi; indirim/ürün kodu ŞEMA'ya bağlı), 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 (`hasMore`) — **14/14** (2'nin kod/kullanım kısmı hariç).

### ŞEMA İSTEKLERİ
- `RemedyOffer.expiresAt`, `redeemedAt`, `redeemedById`, `redeemCode @unique` (+ `redeemed` durumu): kasada doğrulanabilir telafi ve son kullanma (F2.5).
