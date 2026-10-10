# /dealer/benchmark

**Amaç:** Bayinin son 30 günlük ortalama puan, yanıt oranı ve aksiyon tamamlama metriklerini platform ortalamasıyla, aynı kategorideki anonim akranlarla ve yüzdelik sırayla kıyaslamak. Ek olarak 7 günlük ve 4 haftalık trend gösteriyor.
**Genel puan:** 4.5 / 10
**Karar:** yeniden tasarla. Veri katmanı (yetki, cache, rate-limit) sağlam bir temel, ama asıl ürettiği sinyal yanlış. Yüzdelik sıra ters renkleniyor, boş günler 0 puan olarak çiziliyor, ölçekler karışık ve akran ortalaması rakip verisini sızdırabiliyor. Sayfanın kendisi de "kıyas"tan öteye geçip "ne yapmalıyım"a ulaşmıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Temel metrikler doğru hesaplanıyor. Ama yüzdelik gösterge, boş/hata durumları, trendlerdeki sıfır noktaları ve modül kapısı bozuk. |
| UX | 4/10 | Hiyerarşi düz: aynı üç sayı dört farklı biçimde tekrarlanıyor (fark kartı, bar grafik, iki metrik kartı). Kişiye özel "sonraki adım" yok. |
| Görsel | 6/10 | Tasarım dilini (DashboardPageHero, kart, renk tonları) izliyor. Yine de karışık ölçekli bar grafik ve ters renkli gauge görsel olarak yanıltıcı. |
| Mimari | 4/10 | Tek route'ta 43 sorgu var. Platform geneli hesaplar her bayi için ayrı ayrı cache'leniyor. 25k satır belleğe çekiliyor. API Türkçe metin döndürüyor ve `AnimatedNumber` kopyalanmış. |
| Performans | 4/10 | Cache miss'te ~15 ardışık DB turu ve 25k satır taranıyor. Dashboard ve heatmap aynı ağır ucu yalnız bir alan için çağırıyor. |
| Erişilebilirlik + Mobil | 4/10 | Gauge'un `aria` etiketi yok, grafiklerin metin alternatifi yok, `<a><button>` iç içe ve başlık seviyesi atlanıyor. Mobilde yatay bar grafiğin sol tarafına ~195px gidiyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (başlık/açıklama) | KISMİ | `app/dealer/benchmark/layout.tsx:4-6`, `messages/tr.json` → `layoutMetadata.dealerBenchmarkDescription` | Açıklama "Akran yüzdelik dilimleri ve lider açığı görünümü" diyor. Sayfada "lider açığı" (gap-to-leader) yok, yani vaat edilen bir özellik eksik. |
| 2 | Veri çekme (`GET /api/dealer/benchmark`) | KISMİ | `page.tsx:164-174` | `res.ok` kontrol edilmiyor. 4xx/5xx gövdesi JSON olduğunda sessizce "veri yok" sayılıyor. İptal (AbortController) yok. |
| 3 | Yükleniyor durumu (dönen ikon + metin) | ÇALIŞIYOR | `page.tsx:176-203` | Tam ekran spinner. Sayfa iskeletini taklit eden bir skeleton değil, bu yüzden düzen kayması oluyor. |
| 4 | Hata durumu | BOZUK | `page.tsx:165-172`, `route.ts:23,26,33-36` | 429/403/400 yanıtları `json.benchmark` içermediği için toast çıkmıyor ve "Henüz veri yok" boş durumu gösteriliyor. Kullanıcı rate-limit'e takıldığını anlayamıyor. |
| 5 | Boş durum ("Henüz veri yok") | BOZUK | `page.tsx:205-245`, `route.ts:251-280` | API her koşulda `benchmark` nesnesi döndürüyor, bu yüzden geri bildirimi olmayan bayi bu ekrana hiç düşmüyor. Onun yerine 0.00/5, büyük kırmızı fark ve "üst %100" görüyor. |
| 6 | Boş durumdaki "Geri bildirimlere git" | ÇALIŞIYOR | `page.tsx:234-239` | `<Link><Button>` iç içe etkileşimli öğe üretiyor (a > button). Hero'da doğru `asChild` kullanılmış, burada kullanılmamış. |
| 7 | Hero (eyebrow/başlık/açıklama) | ÇALIŞIYOR | `page.tsx:256-261` | |
| 8 | Hero CTA "Geri bildirimler" | ÇALIŞIYOR | `page.tsx:264-269` | |
| 9 | Hero CTA "Aksiyonlar" | ÇALIŞIYOR | `page.tsx:270-275` | Alttaki CTA (`page.tsx:537`) ile aynı hedefe gidiyor. |
| 10 | Komşu segment (anonim akran) kartı | KISMİ | `page.tsx:280-304`, `route.ts:215-249` | Ham kategori slug'ı gösteriliyor (ör. `demo-cafe`, `bootstrap/route.ts:249`). Not metni API'de Türkçe sabit kodlu (`route.ts:246`). Bayinin akrana göre farkı hesaplanmıyor. k-anonimlik zayıf (bkz. B2). |
| 11 | Yüzdelik sıra radial gauge | BOZUK | `page.tsx:124-155,252,319`, `route.ts:126-127` | Gösterilen değer "üst %X" ve küçük olması daha iyi. Ama renk `>=75 → yeşil`: en iyi bayi amber, en kötü bayi yeşil ve dolu halka görüyor. Ayrıntı B1'de. |
| 12 | Animasyonlu yüzde sayısı | ÇALIŞIYOR | `page.tsx:84-101,322` | `setInterval` tabanlı, `prefers-reduced-motion`'a uymuyor. |
| 13 | "{count} işletme kıyaslandı" | KISMİ | `route.ts:94,124`, `page.tsx:330-334` | Bayinin kendisi de sayılıyor. Hata olursa sabit `1` kalıyor. 25k satır sınırı aşılınca örneklem keyfi oluyor. |
| 14 | Puan farkı kartı | KISMİ | `page.tsx:340`, `route.ts:271` | Geri bildirimi olmayan bayide `0 - platformAvg` hesaplanıyor ve ör. "-4.21" kırmızı çıkıyor. Yanıltıcı. |
| 15 | Yanıt oranı farkı kartı | KISMİ | `page.tsx:107,113,341` | Fark "yüzde puan" olduğu halde `%` ile gösteriliyor (+12.3% ≠ +12.3 puan). |
| 16 | Aksiyon farkı kartı | KISMİ | `page.tsx:342-346`, `route.ts:68-71` | `cancelled` aksiyonlar paydada kalıyor (`schema.prisma` ActionItem.status). Platform tarafı kategoriden bağımsız ham ortalama. |
| 17 | Son 7 gün alan grafiği | KISMİ | `route.ts:183-205`, `benchmark-charts.tsx:31-60` | Geri bildirim olmayan gün `0` olarak çiziliyor ve grafik sıfıra çakılıyor (bkz. B3). Gün sınırı UTC, Türkiye için 00:00-03:00 önceki güne yazılıyor. |
| 18 | "Siz vs Platform" yatay bar grafiği | BOZUK | `page.tsx:247-251`, `benchmark-charts.tsx:62-81` | 0-5 ölçekli puan ile 0-100 ölçekli oranlar aynı eksende, bu yüzden puan barı ~%4 genişlikte görünmez oluyor. Sol margin 100 + YAxis width 95 olunca mobilde bar alanı çok daralıyor. |
| 19 | "Sizin metrikleriniz": ortalama puan | KISMİ | `page.tsx:422-429` | Veri yokken "0.00 / 5" gösteriyor, "—" göstermesi gerekir. |
| 20 | "Sizin metrikleriniz": yanıt oranı | ÇALIŞIYOR | `page.tsx:430-437`, `route.ts:77` | |
| 21 | "Sizin metrikleriniz": aksiyon tamamlama | KISMİ | `page.tsx:438-445`, `route.ts:68-69,81` | Dönem filtresi `createdAt`. 30 gün önce açılıp bu ay kapatılan aksiyon sayılmıyor. İptaller paydada kalıyor. |
| 22 | Sizin kart altbilgisi (toplam / done/total) | ÇALIŞIYOR | `page.tsx:463-468` | `t()` değişken desteği varken (`lib/app-locale.tsx:59`) manuel `.replace` zinciri kullanılmış. |
| 23 | Platform ortalaması kartı (3 satır) | ÇALIŞIYOR | `page.tsx:472-504`, `route.ts:83-90` | Platform ortalamasına bayinin kendisi de dahil, bu kıyas yanlılığı yaratıyor (küçük platformda belirgin olur). |
| 24 | Platform altbilgisi | ÇALIŞIYOR | `page.tsx:499-501` | Platformun toplam geri bildirim hacmini her bayiye açıyor. Ticari olarak hassas olabilir (ürün kararı). |
| 25 | Son 4 hafta composed grafik | KISMİ | `route.ts:141-177`, `benchmark-charts.tsx:83-125` | Etiketler "Hafta 1..4" Türkçe sabit kodlu (`route.ts:171`) ve tarih yok. Mevcut hafta yarım ama belirtilmiyor. Boş hafta 0 olarak çiziliyor. |
| 26 | "Benchmark nasıl geliştirilir?" CTA kartı | KISMİ | `page.tsx:526-546` | Herkese aynı statik metin gidiyor. Bayinin hangi metrikte geride olduğuna göre kişiselleşmiyor. |
| 27 | Grafiklerin lazy yüklenmesi | ÇALIŞIYOR | `page.tsx:36-47` | `ssr:false` + boyuta uygun Skeleton. İyi uygulama. |
| 28 | Grafik tooltip/legend dili | BOZUK | `benchmark-charts.tsx:51,53,72,74,104,107-115` | "Siz", "Sizin puan", "Platform ortalaması" sabit Türkçe. EN dilinde karışık arayüz çıkıyor. API de Türkçe gün/hafta etiketi döndürüyor (`route.ts:171,182`). |
| 29 | Giriş animasyonları (stagger) + reduced motion | KISMİ | `page.tsx:281,308-311,350-354,412,472`, `components/providers.tsx:232` | Global `MotionConfig reducedMotion="user"` transform'ları kapatıyor. Ama `strokeDashoffset`, `AnimatedNumber` interval'i ve Recharts animasyonları devam ediyor. |
| 30 | Redis cache (60 sn) | ÇALIŞIYOR | `route.ts:41-46,281` | Anahtar bayi başına. Bayiden bağımsız platform hesapları paylaşılmıyor (bkz. B6). |
| 31 | Rate limit (12/dk) | ÇALIŞIYOR | `route.ts:31-37`, `lib/rate-limit.ts:23-37` | Dashboard (`dealer-dashboard-client.tsx:133`) ve heatmap (`heatmap/page.tsx:181`) de aynı kovayı tüketiyor. Cache hit de sayaçtan düşüyor. |
| 32 | Yetki: DEALER yalnız kendi verisi, ADMIN `?dealerId` | ÇALIŞIYOR | `route.ts:17-27` | IDOR yok. DEALER için `dealerId` sabit olarak `session.user.id`. |
| 33 | Yüzdelik hesap hata yedeği | SAHTE | `route.ts:93-94,128-130` | Hata olursa sessizce `percentile=50`, `totalDealers=1` dönüyor ve kullanıcıya gerçekmiş gibi "üst %50" gösteriliyor. |
| 34 | Modül kapısı (`benchmark` modülü) | BOZUK | `lib/module-controls.ts:39`, `route.ts` (import yok) | Admin panelinde "Benchmark" modülü kapatılabiliyor, ama route `assertModuleEnabled`/`assertMenuItemVisible` çağırmıyor. API ve URL açık kalıyor. Sayfa tarafında da gating bulunamadı. |
| 35 | Admin'in bir bayiyi bu sayfada görmesi | EKSİK | `page.tsx:165`, `route.ts:21-23` | API admin için `dealerId` bekliyor ama sayfa parametre geçmiyor, sonuç 400 ve "veri yok". |
| 36 | Dönem seçici (7/30/90 gün) | EKSİK | `route.ts:49,254` | `period: 'last_30_days'` sabit. Alan istemcide hiç kullanılmıyor. |
| 37 | Şube (DealerLocation) kırılımı | EKSİK | `schema.prisma` QRCode.locationId | Çok şubeli işletme şubelerini birbirine veya platforma göre kıyaslayamıyor. |
| 38 | Lider açığı / hedef çizgisi | EKSİK | metadata açıklaması | Üst %10'a ulaşmak için gereken puan veya yanıt oranı farkı yok. |
| 39 | Bayinin kendi kategorisini seçmesi | EKSİK | `businessCategory` için bayi tarafında yazma ucu yok (yalnız `api/admin/bootstrap/route.ts:251`, `lib/demo-cafes-seed.ts`) | Komşu segment kartı çoğu bayide hiç görünmüyor ya da demo slug'ı gösteriyor. |
| 40 | Dışa aktarma / paylaşma / rapor | EKSİK | — | PDF/CSV veya haftalık e-posta özeti yok. |
| 41 | Grafik ve gauge için erişilebilir metin alternatifi | EKSİK | `page.tsx:131`, `benchmark-charts.tsx` | `role="img"`/`aria-label` ve gizli veri tablosu yok. |
| 42 | Veri tazeliği ("son güncelleme") göstergesi | EKSİK | `route.ts:281` | 60 sn cache var ama kullanıcı verinin ne zaman hesaplandığını bilmiyor. |
| 43 | Metrik bazlı öneri / AI içgörü bağlantısı | EKSİK | `page.tsx:526-546` | Geride kalan metriğe göre ilgili sayfaya (yanıt kuyruğu, remedy, AI insights) derin link verilmiyor. |

**Toplam: 43 özellik.** ÇALIŞIYOR 14 · KISMİ 13 · BOZUK 6 · SAHTE 1 · EKSİK 9

---

## Bulgular

### B1 — Yüzdelik sıra gauge'u ters renkleniyor ve dashboard ile çelişiyor
- **Önem:** kritik · **Kategori:** veri bütünlüğü / UX · **Efor:** S
- **Kanıt:**
  - API `percentile = lowerCount / totalDealers * 100` hesaplıyor, yani "altınızdaki bayilerin yüzdesi" (`app/api/dealer/benchmark/route.ts:126-127`).
  - Sayfa bunu `100 - percentile` ile "üst %X"e çeviriyor (`page.tsx:252`) ve metin "üst %{pct}'inde" diyor (`messages/tr.json` `dealerBenchmark.rankBody`).
  - `RadialGauge` rengi `value >= 75 ? emerald : value >= 50 ? blue : amber` (`page.tsx:129`) ve halka `value` kadar doluyor (`page.tsx:128`).
  - Dashboard aynı alanı ters çevirmeden "Top %{pct}" olarak gösteriyor (`app/dealer/dealer-dashboard-client.tsx:1000`, `tr.json` `dealerDashboard.topPercentileLine = "Top %{pct}"`).
- **Sorun:**
  - Bayilerin %90'ını geçen bayi benchmark sayfasında "üst %10" görüyor. Bu metin doğru, ama halka yalnız %10 dolu ve **amber**. En kötü bayi "üst %100" görüyor, halka tam dolu ve **yeşil**.
  - Geri bildirimi olmayan bayi de `ourAvg = 0` olduğu için "üst %100" ve yeşil tam halka görüyor.
  - Aynı bayi dashboard'da "Top %90", benchmark'ta "üst %10" okuyor. İki sayfa birbiriyle çelişiyor.
  - Eşitlikler de kötü ele alınıyor (`avg < ourAvg`, strict). Çok sayıda 5.0 ortalamalı küçük örneklemli bayi varsa, 5.0 alan bayi bile "üst %40" gibi bir değer görebiliyor.
- **Öneri:**
  - API tek ve açık bir sözleşme döndürsün: `rank: { position, outOf, topPercent, betterThanPercent, tiedCount }`. İstemciler dönüştürme yapmasın.
  - Gauge "betterThanPercent" ile dolsun (dolu = iyi), metin "üst %X" olsun, renk eşikleri de bu değere bağlansın.
  - Eşitliklerde ortalama sıra (mid-rank) kullanılsın.
  - Minimum örneklem (ör. ≥10 geri bildirim) altındaki bayiler hem dağılıma girmesin hem kendi sırasını görmesin. Onun yerine "Sıralamaya girmek için X geri bildirim daha" ilerleme durumu gösterilsin.
  - Dashboard widget'ı aynı alanı kullansın.

### B2 — Akran ("komşu segment") ortalaması tek bir rakibin verisini sızdırabiliyor
- **Önem:** yüksek · **Kategori:** güvenlik / gizlilik · **Efor:** S
- **Kanıt:** `route.ts:221-248`. Eşik `peerIds.length >= 3` ve bu kategoriye kayıtlı **hesap** sayısı. `peerAgg` ise yalnız son 30 günde geri bildirimi olan bayilerden besleniyor. Karta `category`, `peerAvgRating`, `peerFeedbackCount` açık yazılıyor (`page.tsx:292-299`). Heatmap de aynı veriyi gösteriyor (`heatmap/page.tsx:255-260`).
- **Sorun:** Kategoride 3 hesap olup yalnız biri aktifse, "anonim ortalama" o tek rakibin 30 günlük ortalama puanını ve geri bildirim hacmini birebir veriyor. Kategori adı da görünür olduğu için küçük bir pazarda kimlik tahmin edilebilir. Ayrıca `take: 120` sırasız (`route.ts:228`), bu yüzden 120'den fazla akranda örneklem rastgele değişiyor. `peerDealerSample` da aktif olmayanları sayıyor.
- **Öneri:**
  - k-anonimlik eşiği **katkı yapan** bayi sayısı üzerinden uygulansın: tek SQL'de `GROUP BY dealerId` ile `HAVING count >= minFeedback`, ardından `contributors >= 5`.
  - Eşik sağlanmazsa kart "Kategorinizde yeterli akran yok" durumuna düşsün.
  - Hacim tam sayı yerine aralık olarak gösterilsin ("500-1000").
  - `take` kaldırılsın, toplama SQL'de yapılsın.

### B3 — Veri olmayan gün ve haftalar 0 puan olarak çiziliyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü · **Efor:** S
- **Kanıt:** `route.ts:172-173` ve `202-203` (`_avg.rating != null ? … : 0`). Grafik `YAxis domain={[0,5]}` (`benchmark-charts.tsx:48,100`).
- **Sorun:** Günde birkaç geri bildirim alan tipik bayide 7 günün çoğu boş. Alan grafiği 4.6 → 0 → 4.8 diye çakılıyor ve "puanınız çöktü" gibi okunuyor. Haftalık yanıt oranında da aynı şey oluyor. Ürünün temel sinyali bozuluyor.
- **Öneri:** Boş dönemde `null` döndürülsün. Recharts'ta `connectNulls={false}` ile boşluk bırakılsın ve tooltip'te "Bu gün geri bildirim yok" yazsın. Her noktaya `n` (örnek sayısı) eklensin. n<3 olan noktalar soluk ya da kesik çizgiyle gösterilsin. Gün sınırı bayinin saat dilimine göre hesaplansın (TR için `Europe/Istanbul`).

### B4 — Boş ve hata durumları gerçeği yansıtmıyor
- **Önem:** yüksek · **Kategori:** işlevsellik / UX · **Efor:** S
- **Kanıt:**
  - `page.tsx:165-170`: `res.ok` kontrolü yok, hata gövdesinde `benchmark` olmadığı için `data=null` kalıyor ve boş durum çıkıyor.
  - `route.ts:251-280`: 0 geri bildirimde bile tam payload dönüyor.
- **Sorun:**
  - Rate-limit'e takılan (429) veya oturumu düşen kullanıcı "Henüz veri yok" görüyor. Yanlış teşhis ediyor ve tekrar denemesi için bir yol yok.
  - Yeni bayi ise boş durum yerine "0.00 / 5", "-4.2 puan farkı" ve "üst %100" görüyor. İlk izlenim cezalandırıcı.
- **Öneri:**
  - Durumlar üç ayrı dala ayrılsın:
    - `error`: yeniden dene butonu. 429 ise `Retry-After` geri sayımı.
    - `insufficient`: API `status: 'insufficient_data'` ve `required`/`current` örneklem sayısını döndürür. UI'da ilerleme çubuğu, "QR kodlarınızı yerleştirin" linki gösterilir.
    - `ready`.
  - Fetch'i `useQuery`'e taşımak dashboard ile cache'i paylaşmayı ve retry'ı ücretsiz sağlar (dashboard zaten `['dealer','benchmark']` anahtarını kullanıyor, `dealer-dashboard-client.tsx:130-131`).

### B5 — Yüzdelik hesabı 25k satır sınırıyla keyfi örnekleniyor ve hatada sahte değer dönüyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / performans · **Efor:** M
- **Kanıt:** `route.ts:96-100` (`findMany … take: 25000`, `orderBy` yok), `route.ts:93-94,128-130` (`catch {}`, `percentile=50`).
- **Sorun:**
  - Platform 30 günde 25k geri bildirimi aştığında hangi satırların geleceği belirsiz, sıralama sessizce bozuluyor.
  - Her cache miss'te 25k satır Node belleğine çekilip JS'te topluyor.
  - Hata olursa kullanıcıya uydurma "üst %50" gösteriliyor. Bu, kullanıcıya gerçekmiş gibi sunulan sahte veri.
- **Öneri:**
  - Tek bir `$queryRaw`: `SELECT q."dealerId", AVG(f.rating), COUNT(*) FROM "Feedback" f JOIN "QRCode" q … GROUP BY q."dealerId" HAVING COUNT(*) >= $min`. Sonuç **platform başına** (bayi başına değil) Redis'te 5-15 dk cache'lensin.
  - Daha iyisi: gece çalışan bir cron ile `DealerBenchmarkSnapshot` (dealerId, date, avg, n, replyRate, rank, categoryRank) tablosu doldurulsun. Sayfa yalnız snapshot okusun, bu trend geçmişini de bedavaya verir.
  - Hata olursa `rank: null` dönsün ve UI "Sıralama şu an hesaplanamadı" desin.

### B6 — Route 43 sorgu ve ~15 ardışık DB turu yapıyor; platform hesapları paylaşılmıyor
- **Önem:** orta · **Kategori:** performans / mimari · **Efor:** M
- **Kanıt:**
  - `route.ts:63-72`: 8 sorgu.
  - `route.ts:96-105`: 2 sorgu.
  - `route.ts:141-177`: 4 hafta × 4 sorgu, `for` içinde `await`, 4 ardışık tur.
  - `route.ts:183-205`: 7 gün × 2 sorgu, 7 ardışık tur.
  - `route.ts:215-240`: 3 sorgu.
  - Cache anahtarı `dealer-benchmark:${dealerId}` (`route.ts:42`).
  - Heatmap yalnız `neighborSegment` için tüm ucu çağırıyor (`heatmap/page.tsx:181-185`).
- **Sorun:** Platform tarafındaki ~20 sorgu her bayi için aynı sonucu üretiyor ama N bayi için N kez çalışıyor. Neon pooler'da (`connection_limit=5`) bir cache miss havuzu ~15 tur boyunca meşgul ediyor. Heatmap ve dashboard açılışı bu yükü üçe katlıyor.
- **Öneri:** Hesap iki katmana bölünsün:
  - `getPlatformBenchmark(period)`: platform geneli, tek anahtar, 10 dk TTL.
  - `getDealerBenchmark(dealerId, period)`: bayiye özel, 60 sn TTL.
  - Günlük/haftalık seriler `date_trunc('day'|'week', "createdAt" AT TIME ZONE 'Europe/Istanbul')` ile **tek** GROUP BY sorgusunda üretilsin (7+4 tur yerine 1).
  - Heatmap için hafif bir `/api/dealer/benchmark/peer` alt ucu açılsın veya veri snapshot'tan okunsun.

### B7 — "Siz vs Platform" bar grafiği farklı ölçekleri aynı eksende gösteriyor
- **Önem:** orta · **Kategori:** görsel / UX · **Efor:** S
- **Kanıt:** `page.tsx:247-251` (puan 0-5 ile oranlar 0-100 aynı dizide), `benchmark-charts.tsx:66-69` (tek `XAxis domain=[0,'auto']`, `margin.left=100` + `YAxis width=95`).
- **Sorun:** Puan barları yaklaşık 4.3/100 genişlikte kalıyor ve görsel olarak kayboluyor. Kullanıcı en önemli metriği grafikte göremiyor. Mobilde ~375px ekranda sol tarafa ~195px gittiği için bar alanı yaklaşık 80-100px kalıyor (hesap; ekran üzerinde doğrulanmadı).
- **Öneri:** Bu grafik kaldırılsın. Yerine her metrik için bir "bullet chart" satırı konsun: tek yatay ray üzerinde platform ortalaması, kategori ortalaması ve üst %10 eşiği işaretlenir, bayinin değeri bir nokta olarak durur. Her satır kendi ölçeğini taşır (0-5 / 0-100). Mobilde etiket barın üstüne alınsın, sol eksen kullanılmasın. Bu tek bileşen bugünkü fark kartlarını, bar grafiği ve iki metrik kartını (dört tekrar) birleştirir.

### B8 — Modül kapısı uygulanmıyor
- **Önem:** orta · **Kategori:** güvenlik / yönetişim · **Efor:** S
- **Kanıt:** `lib/module-controls.ts:39` `benchmark` modülünü tanımlıyor ve `lib/visibility-controls.ts:64` menü anahtarı var. `app/api/dealer/benchmark/route.ts` ise `lib/module-gate` import etmiyor (`app/api/dealer/campaigns/route.ts:6,23` doğru örnek).
- **Sorun:** Admin modülü kapatsa bile bayi URL'yi yazarak sayfayı ve API'yi kullanmaya devam ediyor. Dashboard widget'ı da veri çekmeye devam ediyor.
- **Öneri:** Route başında `assertModuleEnabled('benchmark', { role: 'dealer', … })` ve `assertMenuItemVisible('benchmark','dealer')` çağrılsın. İstemcide 403 `reason` için "Bu modül yönetici tarafından kapatıldı" durumu gösterilsin.

### B9 — Dil karışıklığı: API ve grafik bileşeni Türkçe sabit metin üretiyor
- **Önem:** orta · **Kategori:** i18n · **Efor:** S
- **Kanıt:** `route.ts:171` (`Hafta ${…}`), `route.ts:182` (gün kısaltmaları), `route.ts:246` (not), `route.ts:23,34` (hata metinleri), `benchmark-charts.tsx:51,53,72,74,104,107-115`.
- **Sorun:** EN dilindeki bayi başlıklarda İngilizce, grafiklerde "Sizin puan / Platform puan / Pzt / Hafta 2" görüyor.
- **Öneri:** API yalnız makine verisi döndürsün (`weekStart: '2026-09-28'`, `date: '2026-10-07'`, `noteKey`). Etiketler istemcide `Intl.DateTimeFormat(locale, { weekday:'short' })` ve `t()` ile üretilsin. Grafik bileşenine `labels` prop'u verilsin.

### B10 — Metrik semantiği: birim ve payda hataları
- **Önem:** orta · **Kategori:** veri doğruluğu · **Efor:** S
- **Kanıt:**
  - `page.tsx:107,113`: yanıt/aksiyon farkı `%` ile gösteriliyor ama bu yüzde puan.
  - `route.ts:68-71,81,89`: aksiyon oranı `createdAt` penceresinde, `cancelled` paydada.
  - `route.ts:66-67,86`: platform ortalaması bayinin kendisini içeriyor.
- **Öneri:**
  - Fark "+12.3 puan" (EN: "pp") olarak gösterilsin.
  - Aksiyon tamamlama "dönemde kapanan / dönemde açık olan (iptal hariç)" olarak yeniden tanımlansın.
  - Platform ve kategori ortalamaları "siz hariç" hesaplansın ve tooltip'te tanım yazsın.
  - Ayrıca ürün açısından "medyan yanıt süresi" eklensin. Yanıt oranından daha güçlü bir operasyonel kıyas.

### B11 — Erişilebilirlik ve azaltılmış hareket
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:**
  - `page.tsx:131-153`: SVG gauge'da `role`/`aria-label` yok.
  - `page.tsx:84-101`: `AnimatedNumber` ekran okuyucuya ara değerler veriyor ve reduced-motion'ı yok sayıyor.
  - `page.tsx:234,537`: `<Link><Button>` (a > button).
  - Başlık sırası h1 (`components/admin/admin-premium-hero.tsx:227`) → h3 (`CardTitle`, `components/ui/card.tsx:44`), h2 atlanıyor.
  - `page.tsx:313`: aynı kartta hem `overflow-hidden` hem `overflow-visible`. Dekor dairesi taşabilir (görsel olarak doğrulanmadı).
  - Recharts grafiklerinin metin alternatifi yok.
- **Öneri:**
  - Gauge'a `role="img" aria-label="Platform sıralaması: üst %10, 128 işletme arasında"` verilsin.
  - Sayılar `useReducedMotion()` true iken doğrudan basılsın. Animasyon framer `animate()` + `useMotionValue` ile yapılsın, `MotionConfig` ile uyumlu olur.
  - `Button asChild` kullanılsın.
  - Her grafiğin altına `sr-only` bir veri tablosu veya "Tabloyu göster" anahtarı eklensin.
  - Bölüm başlıkları h2 yapılsın.

### B12 — Kod hijyeni: ölü kod, kopyalanmış yardımcılar
- **Önem:** düşük · **Kategori:** mimari · **Efor:** S
- **Kanıt:**
  - `page.tsx:16`: `Award` import edilmiş ama kullanılmıyor.
  - `route.ts:253-254`: `dealerId` ve `period` döndürülüyor, istemci kullanmıyor.
  - `AnimatedNumber` 4 ayrı dosyada kopya: `page.tsx:84`, `app/dealer/analytics/analytics-client.tsx:110`, `app/dealer/copilot/page.tsx:77`, `app/admin/analytics/page.tsx:135`.
  - `.replace('{x}')` zinciri kullanılmış, oysa `t(key, vars)` mevcut (`lib/app-locale.tsx:59`).
  - `BenchmarkData` tipi istemcide elle kopyalanmış, API ile paylaşılan bir tip yok.
- **Öneri:** `components/ui/animated-number.tsx` tek kaynak olsun. API yanıtı için `lib/dealer/benchmark-types.ts` (veya zod şeması) yazılsın, route ve sayfa bu tipi import etsin.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Dönem ve karşılaştırma seçici** (Square Dashboard, Medallia): 7/30/90 gün ve "önceki döneme göre" değişim. Şu an yalnız sabit 30 gün var.
2. **Akran grubu seçimi ve kendi kategorisini yönetme** (Yelp for Business, Google Business Profile "benzer işletmeler"): bayi kategorisini ve bölgesini (il/ilçe) seçebilmeli. Kıyas "kategori + bölge + büyüklük" segmentinde yapılmalı. Şu an `businessCategory`'yi bayi yazamıyor.
3. **Şube bazlı kıyas ve sıralama** (Medallia, Qualtrics CX multi-location): `DealerLocation` bazında iç lig tablosu. Hangi şube geride, hangi şube örnek alınmalı.
4. **Lider açığı ve hedef** (Qualtrics "gap to best-in-class"): "Üst %10'a girmek için puanı 4.6'ya, yanıt oranını %85'e çıkarın" ifadesi ve hedef belirleme. Hedef ilerlemesi dashboard'da da görünmeli.
5. **Tema/konu düzeyinde kıyas** (Medallia text analytics, Yelp "what customers mention"): AI ile çıkarılan konular (servis, fiyat, temizlik) üzerinden "Kategorinizde 'bekleme süresi' şikâyeti %12, sizde %27" kıyası. Veri zaten `Feedback.entities`/`intent` alanlarında var.
6. **Operasyonel kıyas ve rapor** (Toast, Square): medyan yanıt süresi, kampanya geri dönüşü, PDF/e-posta haftalık benchmark özeti ve dışa aktarma.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi sayfayı açtığında 5 saniyede üç soruya cevap alır: "Neredeyim?", "Neden?" ve "Bu hafta ne yapmalıyım?". Sayfa bir rapor gibi değil, bir koç gibi davranır.

**Yerleşim (masaüstü → mobil tek kolon):**
1. **Üst şerit:** dönem seçici (7/30/90), akran grubu seçici (Platform / Kategorim / Bölgem / Şubelerim), "son hesaplama: 12 dk önce".
2. **Konum kartı:** Sol tarafta sıralama göstergesi var. Doğru yönlü yarım halka, "128 işletme arasında 14." ve "üst %11" yazar. Sağ tarafta "geçen döneme göre ▲3 sıra" ve tek cümlelik AI özeti durur ("Puanınız kategorinizin üstünde, ama yanıt oranınız ortalamanın 18 puan altında"). Örneklem yetersizse bu kart "Sıralamaya girmek için 6 geri bildirim daha" ilerleme durumuna dönüşür.
3. **Metrik rayları (bullet chart listesi):** Ortalama puan, yanıt oranı, medyan yanıt süresi, aksiyon tamamlama ve kampanya geri dönüşü. Her satırda bayinin noktası, platform ve kategori ortalaması çentikleri, üst %10 eşiği ve "lider açığı" etiketi bulunur. Satıra dokununca o metriğin trendi açılır (accordion). Bu yapı bugünkü dört tekrar eden bölümün yerini alır.
4. **Trend:** Tek bir grafik ve metrik sekmeleri. Boş dönemler boşluk olarak, düşük örneklemli noktalar soluk gösterilir. Akran bandı (25.-75. persentil) gölge alan olarak çizilir. "Ortalama çizgisi" yerine "normal aralık" göstermek kıyası daha dürüst yapar.
5. **Konu kıyası:** Kategoriye göre en çok sapan 3 konu ve her birine derin link (ilgili geri bildirim filtresi, remedy kuyruğu).
6. **Önerilen aksiyonlar:** En büyük açığa göre sıralanmış 2-3 kişisel öneri kartı. "Aksiyon oluştur" butonu `ActionItem` yaratır. Bugünkü statik CTA kaldırılır.

**Motion/3D:** 3D gerekmiyor, bu bir okuma sayfası. Ölçülü motion yeterli:
- Gauge ve ray noktaları bir kez yerine kayar (≤600 ms).
- Dönem değişince sayılar `useMotionValue` ile geçiş yapar.
- Accordion açılışı yükseklik animasyonuyla olur.
- Tümü `useReducedMotion()` ile kapatılabilir. Sürekli dönen ikon gibi dekoratif döngüler kaldırılır.
- Loading durumu sayfa iskeletini taklit eden skeleton olur.

**Veri / API değişiklikleri:**
- `DealerBenchmarkSnapshot` tablosu (dealerId, locationId?, date, n, avgRating, replyRate, medianReplyMinutes, actionRate, rankPlatform, rankCategory, topicShares Json). Gece cron (`cron-job.org` deseni) ile tek SQL GROUP BY'dan doldurulur. Ayrıca platform/kategori dağılımı için `BenchmarkPeerStats` (segmentKey, date, p25, p50, p75, p90, contributors) tutulur.
- `GET /api/dealer/benchmark?period=30d&peer=category&locationId=` yalnız snapshot okur, sorgu sayısı 43'ten ~3'e iner. Yanıt sözleşmesi tiplidir: `status: 'ready'|'insufficient_data'`, `rank{}`, `metrics[{key, you, peerP50, peerP90, n, gapToTop}]`, `series[{date, you, peerP25, peerP75, n}]`. Metin döndürülmez.
- k-anonimlik: segment `contributors >= 5` değilse segment verisi döndürülmez. Hacim aralığa yuvarlanır.
- `PATCH /api/dealer/profile/category`: bayi kategorisini ve bölgesini sabit bir listeden seçer. Admin slug'ları i18n anahtarına eşlenir.
- Modül kapısı ve `useQuery` anahtarı dashboard ile paylaşılır.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer` dashboard benchmark widget'ı** (`app/dealer/dealer-dashboard-client.tsx:130-140, 961-1005`): aynı ucu çağırıyor ve yüzdeliği ters yorumluyor (B1). Widget kalsın ama yeni sözleşmeyi (`rank.topPercent`) kullanan, benchmark sayfasına derin link veren küçük bir özet olsun. Mantığı tekrarlamasın.
- **`/dealer/heatmap`** (`app/dealer/heatmap/page.tsx:179-186, 250-264`): yalnız `neighborSegment` için tüm benchmark hesabını tetikliyor ve aynı akran kartını tekrar çiziyor. Bu kart kaldırılsın, yerine "Kategorinizle kıyaslayın →" linki konsun. Gerekirse hafif bir `peer` alt ucu açılsın.
- **`/admin/insights`** (`app/admin/insights/page.tsx:19-35`): kategori bazlı global benchmark'ın admin karşılığı ve `LOWER(businessCategory)` ile gruplanıyor. Bayi tarafı ise büyük/küçük harf duyarlı tam eşleşme kullanıyor (`route.ts:224`). İki taraf aynı segment tanımını ve aynı snapshot tablosunu kullanmalı.
- **`/dealer/growth-hub` ve `/dealer/discover`** yalnız link veriyor, çakışma yok.
- **Sonuç:** Sayfa ayrı bir rota olarak **korunmalı**, çünkü kıyas tek başına değerli bir ürün yüzeyi. Ama benchmark hesabı tek bir servis/snapshot katmanında toplanmalı. Dashboard ve heatmap bu katmandan özet okumalı, şu anki kopya kartlar birleştirilmeli.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı. Okunan dosyalar: `app/api/dealer/benchmark/route.ts`, `app/dealer/benchmark/page.tsx`, `app/dealer/dealer-dashboard-client.tsx`, `components/dealer/benchmark-charts.tsx`, `app/dealer/heatmap/page.tsx`, `app/api/customer/category-leaderboard/route.ts`, `messages/tr.json` ve `messages/en.json`, `prisma/schema.prisma` (`businessCategory`). Kod çalıştırılmadı, veritabanına dokunulmadı.

### 1. Yüzdelik sıra ters yorumlanıyor: halka ters, dashboard ile sayfa çelişiyor. Karar: **DOĞRULANDI**

- `route.ts:126-127`: `percentile = round(lowerCount / totalDealers * 100)`. Yani değer, sizden düşük ortalamaya sahip bayilerin yüzdesi; yüksek değer iyi demek.
- `page.tsx:252`: `percentileDisplay = 100 - percentile`, yani "üst %X". `tr.json:1517` metni ("üst %{pct}'inde") bu değerle doğru okunuyor.
- Halka ise aynı `percentileDisplay` değerini doluluk ve renk için kullanıyor (`page.tsx:128-129`, `>=75` yeşil, `<50` amber). Bu yüzden görsel anlam ters dönüyor.
- `dealer-dashboard-client.tsx:1000` ham `percentile` değerini "Top %{pct}" kalıbına koyuyor (`tr.json:397`).
- **Yeniden üretim:** 10 bayilik bir platformda 9 bayiden yüksek ortalamaya sahip bir bayi için `percentile = 90` olur. Benchmark sayfası "üst %10" yazar ama halka %10 dolu ve amber olur. Dashboard aynı bayiye "Top %90" gösterir.
- Son 30 günde hiç geri bildirimi olmayan bayide `ourAvg = 0` (`route.ts:78`), `lowerCount = 0` ve `percentile = 0` olur. Sayfa "üst %100" yazar ve halkayı tam dolu, yeşil çizer. Dashboard "Top %0" gösterir.
- Kesin `<` karşılaştırması nedeniyle eşitlikler alt sıraya sayılmıyor. Ortalaması 5.0 olan bayilerin oranı %40 ise, 5.0 ortalamalı her bayi `percentile = 60` alır ve "üst %40" görür. İddia bu noktada da doğru.
- **Önem:** Yüksek. Bayiye gösterilen ana sıralama metriği iki yüzeyde birbiriyle çelişiyor ve geri bildirimi olmayan bayiyi en iyi bayi gibi gösteriyor.
- **Öneri:**
  - API tek ve açık bir sözleşme döndürsün: `rank: { topPercent, betterThanPercent, n, status }`.
  - Eşitlikler için orta sıra (mid-rank) kullanılsın: `(lower + 0.5 * equal) / n`.
  - `n = 0` olduğunda veya örneklem minimum eşiğin altındaysa `status: 'insufficient_data'` dönsün ve yüzdelik hiç çizilmesin.
  - Halka "betterThan" değerini, metin "topPercent" değerini kullansın. Dashboard widget'ı aynı alanı okusun.

### 2. Anonim akran ortalaması tek bir rakibin puanını ve hacmini sızdırıyor. Karar: **ÇÜRÜTÜLDÜ** (KRİTİK/YÜKSEK önem düzeyi olarak)

- Mekanik doğru. `route.ts:231` eşik olarak kayıtlı hesap sayısına bakıyor (`peerIds.length >= 3`). `peerAgg` ise yalnız son 30 günde geri bildirim alan bayilerden oluşuyor (`route.ts:232-240`). Kategoride yalnız bir rakip aktifse `peerAvgRating` ve `peerFeedbackCount` o rakibin değerleri olur.
- Ancak bu sızıntının ek bilgi değeri çok düşük. `app/api/customer/category-leaderboard/route.ts:44-75`, oturum açmış her kullanıcıya (bayi dahil, rol kontrolü yok) kategori içindeki her bayinin **adını**, 90 günlük ortalama puanını ve yorum sayısını açık olarak döndürüyor (`HAVING COUNT >= 3`, `LIMIT 50`). Rakip verisi platformda zaten tasarım gereği isimle yayımlanıyor.
- Benchmark kartının fazladan ifşa ettiği tek şey şu: 30 gün içinde 1-2 geri bildirim alan, leaderboard eşiğinin altında kalan tek aktif rakibin ortalaması ve hacmi. Bu da isim olmadan gösteriliyor.
- Bayi kendi kategorisini seçemiyor. `businessCategory` yalnız admin bootstrap ve seed tarafından yazılıyor (`app/api/admin/bootstrap/route.ts:251`, `lib/demo-cafes-seed.ts:139-149`). Bu yüzden bayi kategoriyi değiştirerek başka segmentleri yoklayamıyor.
- **Sonuç:** Gerçek bir kullanıcıya veya veriye kritik ya da yüksek etki eden somut bir senaryo kurulamadı. Bulgu düşük önemli bir sertleştirme maddesine indirilmeli.
- **Öneri:** Eşik kayıtlı hesap yerine **katkı veren** (aktif) bayi sayısına bakmalı, örneğin `contributors >= 5`. Hacim aralığa yuvarlanmalı. Asıl gizlilik kararı leaderboard ucu için ayrıca ele alınmalı, çünkü daha geniş ifşa orada.

### 3. Boş gün ve haftalar 0 puan olarak çiziliyor. Karar: **DOĞRULANDI**

- `route.ts:202-203`: Günlük `_avg.rating` `null` ise `0` yazılıyor. `route.ts:172-175` haftalık puan ve yanıt oranında aynısını yapıyor.
- `benchmark-charts.tsx:48` ve `:100`: Y ekseni `[0, 5]` ve `type="monotone"` alan grafiği kullanılıyor. Grafikte veri yok ile 0 puan ayrılmıyor; 1-5 ölçeğinde 0 değeri zaten geçersiz.
- **Yeniden üretim:** Son 7 günde yalnız Pazartesi (4.6) ve Çarşamba (4.8) geri bildirim alan bir bayi düşünelim. Seri `[…, 4.6, 0, 4.8, 0, 0]` olur. Grafik puan çöküşü gibi dibe iner ve platform serisinin altına düşer. Haftalık grafikte boş hafta için "yanıt oranı %0" çizilir.
- **Önem:** Orta-yüksek. Düşük hacimli bayilerin çoğunda tetikleniyor ve yanlış iş kararına (alarm) yol açabilecek bir görsel üretiyor.
- **Öneri:**
  - API boş dönemleri `null` ve her nokta için `n` ile döndürsün.
  - Grafik `connectNulls={false}` ile boşluk bıraksın. Y ekseni `[1, 5]` olsun.
  - Tooltip "veri yok (0 geri bildirim)" desin.
  - `n` küçükse nokta soluk ya da kesikli çizilsin. Mümkünse 7 günlük kayan ortalama gösterilsin.

### 4. Yüzdelik 25k satır sınırıyla keyfi örnekleniyor, hatada uydurma %50 dönüyor. Karar: **DOĞRULANDI** (önem: orta)

- `route.ts:96-100`: `findMany({ take: 25000 })`, `orderBy` yok. Postgres'te bu, sırası tanımsız bir alt küme demek (pratikte çoğunlukla heap sırası, yani eski kayıtlar ağırlıklı).
- Aynı yerde bayinin kendi ortalaması (`ourAvg`) tam aggregate'ten (`route.ts:64,78`), diğer bayilerin ortalamaları ise kesilmiş örnekten geliyor. Sınır aşıldığında karşılaştırma tutarsız hale geliyor.
- Son 30 gündeki gerçek hacim doğrulanmadı (DB'ye dokunulmadı). Sınırın bugün aşılıp aşılmadığı bilinmiyor; bu kısım ölçeğe bağlı bir koşul.
- `route.ts:93-94, 128-130`: `catch {}` hatayı sessizce yutuyor ve `percentile = 50`, `totalDealers = 1` ile devam ediyor.
- **Yeniden üretim:** `findMany` veya ardından gelen ve binlerce id içeren `qRCode.findMany({ id: { in } })` sorgusu Neon pooler zaman aşımı ya da geçici bir hata alıyor. Kullanıcı gerçek veri gibi "üst %50" ve "(1 işletme kıyaslandı)" görüyor. Sayfa `100 - 50 = 50` gösterir, dashboard "Top %50" gösterir. Bu yanlış sonuç `redisSetJson(..., 60)` (`route.ts:281`) ile 60 saniye önbelleğe de yazılıyor.
- **Öneri:**
  - Yüzdelik Node belleğinde değil, tek bir SQL `GROUP BY` + `percent_rank()` / mid-rank ile tüm veri üzerinde hesaplansın. Tercihen gece snapshot'ı olarak tutulsun.
  - Hata durumunda `rank: null, status: 'unavailable'` dönsün. UI kartı "şu an hesaplanamadı" durumuna geçsin. Hata loglansın ve hatalı yanıt önbelleğe yazılmasın.

---

## Uygulama (Dalga 2)

**Yeni rota:** `/dealer/analytics/benchmark` (Analitik kabuğu › Kıyas sekmesi). `/dealer/benchmark` sorgu parametrelerini koruyarak kalıcı yönlendirme (`permanentRedirect`); eski `layout.tsx` silindi. BFF: `GET /api/dealer/analytics/benchmark` (`defineRoute`: DEALER + ADMIN `?dealerId` salt-okunur, modül kapısı `benchmark`, zod sorgu, hız sınırı; `fresh=1` için ayrı 6/dk sınır), `PATCH /api/dealer/analytics/benchmark/segment` (bayinin sektör seçimi, kontrollü sözlük, 15 dakikada 5). Hesap: `lib/dealer-benchmark/{core,load,params,city,types}.ts`; saf çekirdeğin testi `__tests__/lib/b-kiyas-etki/benchmark-core.test.ts`. UI: `components/dealer/b-kiyas-etki/*` (sunucu ön-yükleme, küçük istemci adası, recharts lazy). Eski `/api/dealer/benchmark` yalnız eski ısı haritası kartı için boş segment döndüren uyumluluk koçanı; akran verisi sızdırmaz.

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Metadata | ÇALIŞIYOR | Analitik kabuğu metadata'sı. "Lider açığı" artık gerçekten var (#38). |
| 2 | Veri çekme | ÇALIŞIYOR | Zarf v2 okunuyor, hata fırlatılıyor; React Query iptal + `keepPreviousData`. |
| 3 | Yükleniyor | ÇALIŞIYOR | SSR ön-yükleme. İstemci geçişlerinde iskelet ve soluk eski veri; spinner yok. |
| 4 | Hata durumu | ÇALIŞIYOR | `QueryState` (429/403/modül kapalı ayrımı + tekrar dene). "Yenile" hatası banner olarak çıkıyor. |
| 5 | Boş durum | ÇALIŞIYOR | `self.status=insufficient_data` → "N değerlendirme daha" ilerleme kartı. Sahte 0.00 yok. |
| 6 | Boş durum CTA | ÇALIŞIYOR | `Button asChild` (iç içe etkileşimli öğe yok). |
| 7 | Hero | ÇALIŞIYOR | `PageHeader` (QDL v2). |
| 8–9 | Hero CTA'ları | KALDIRILDI | Statik iki linkin yerini kişisel öneri kartlarının derin linkleri aldı (#26/#43). |
| 10 | Komşu segment kartı | ÇALIŞIYOR | "Akran grubunuz" kartı: okunur kategori/şehir adı, katkı veren sayısı, k ≥ 5. |
| 11 | Yüzdelik gauge | ÇALIŞIYOR | Doluluk = "akranlardan iyi %", etiket = "Üst %X"; renk aynı yönde (B1). |
| 12 | Animasyonlu sayı | KALDIRILDI | setInterval sayacı yok. Halka ve ray noktası bir kez kayıyor; azaltılmış harekette anında yerinde. |
| 13 | İşletme sayısı | ÇALIŞIYOR | Bayi hariç katkı veren işletme sayısı; hata yedeği yok. |
| 14–16 | Fark kartları | ÇALIŞIYOR | Metrik raylarına taşındı: yönü dikkate alıyor, yüzde puanı doğru birimde, iptaller paydada değil. |
| 17 | 7 gün alan grafiği | ÇALIŞIYOR | Tek eğilim grafiği: 7/30/90 gün dönem, İstanbul günü, boş kova boşluk, akran bandı. |
| 18 | Siz vs Platform bar | KALDIRILDI | Farklı ölçekleri aynı eksende göstermek anlamsızdı. Artık her metrik kendi ölçeğindeki bir rayda (B7). |
| 19 | Ortalama puan | ÇALIŞIYOR | Veri yoksa "—". |
| 20 | Yanıt oranı | ÇALIŞIYOR | |
| 21 | Aksiyon tamamlama | ÇALIŞIYOR | Dönemde açık olanlardan kapatılanlar; iptaller hariç. |
| 22 | Kart altbilgisi | ÇALIŞIYOR | Her rayda `n = …` ve düşük örneklem uyarısı var. |
| 23 | Platform ortalaması | ÇALIŞIYOR | Akran istatistiği bayi HARİÇ: medyan + orta yarı. |
| 24 | Platform hacmi altbilgisi | KALDIRILDI | Ticari açıdan hassas hacim artık gösterilmiyor. |
| 25 | 4 hafta grafiği | ÇALIŞIYOR | 90 günde haftalık kova, mutlak tarih etiketi (`Intl`). |
| 26 | Statik CTA kartı | ÇALIŞIYOR | "Bu dönem ne yapmalı?": açığa göre sıralı en fazla 3 kişisel öneri. |
| 27 | Lazy grafik | ÇALIŞIYOR | `lazyChart` + `ChartFrame` (tablo alternatifi). |
| 28 | Grafik dili | ÇALIŞIYOR | API metin döndürmüyor; TR/EN kopyalar `copy.ts`'te. |
| 29 | Reduced motion | ÇALIŞIYOR | `useReducedMotionPref` ve `motion-reduce:` sınıfları; recharts animasyonu kapalı. |
| 30 | Redis cache | ÇALIŞIYOR | Platform anlık görüntüsünü tüm bayiler paylaşıyor (10 dk); şube verisi 2 dk (B6). |
| 31 | Rate limit | ÇALIŞIYOR | `defineRoute` okuma kovası; `fresh` için ayrı kova. |
| 32 | Yetki | ÇALIŞIYOR | `tenant: 'dealer'` kapsamı. |
| 33 | Hata yedeği (sahte %50) | KALDIRILDI | Hata görünür; uydurma sıra yok (B5). |
| 34 | Modül kapısı | ÇALIŞIYOR | API'de `module: 'benchmark'`, sayfada `moduleDisabled` ekranı. |
| 35 | Admin görünümü | ÇALIŞIYOR | BFF'te ADMIN `?dealerId` ile salt-okunur erişim (sayfa bayi panelinde). |
| 36 | Dönem seçici | ÇALIŞIYOR | 7/30/90 gün, URL'de tutuluyor. |
| 37 | Şube kırılımı | ÇALIŞIYOR | En az 2 şubede iç lig tablosu. |
| 38 | Lider açığı | ÇALIŞIYOR | Üst %10 eşiği (en az 10 akranla) ve "kalan fark". |
| 39 | Kategori seçimi | ÇALIŞIYOR | Bayi kendi sektörünü seçiyor (Keşfet kategorisiyle tek kaynak). |
| 40 | Dışa aktarma | ÇALIŞIYOR | CSV (metrik + akran dağılımı). E-posta özeti kapsam dışı. |
| 41 | Erişilebilir metin | ÇALIŞIYOR | Gauge ve raylarda `role="img"` + `aria-label`; grafikte tablo görünümü. |
| 42 | Tazelik | ÇALIŞIYOR | "Hesaplandı: …" ve önbelleği atlayan "Yenile". |
| 43 | Metrik bazlı öneri | ÇALIŞIYOR | Gelen kutusu / otomatik yanıt / atananlar / QR derin linkleri. |

**Kapanan bulgular (12/12):** B1, B2 (k-anonimlik katkı veren ≥ 5, üst eşik ≥ 10, demo havuzu ayrı), B3, B4, B5, B6, B7, B8, B9, B10, B11, B12 (eski sayfa ve `benchmark-charts.tsx` silindi).

**Eksik özelliklerden uygulananlar:**
- dönem seçici ve önceki dönem sırası
- akran grubu (platform/sektör/şehir) ve sektör seçimi
- şube iç ligi
- lider açığı
- konu kıyası (AI konu etiketleri)
- operasyonel kıyas (medyan yanıt süresi)
- CSV dışa aktarma

**Kalanlar:**
- **İlçe/büyüklük segmenti:** şemada ilçe alanı yok; il adresten türetiliyor.
- **Haftalık e-posta özeti ve "Aksiyon oluştur":** bu özellikler başka yüzeylerin sahipliğinde.
- **Gece snapshot tablosu:** şema dondurulduğu için eklenemedi. Redis'te paylaşılan anlık görüntü aynı sorunu çözüyor.
- **Dashboard widget'ının yeni sözleşmeye taşınması:** dashboard yüzeyinin sahipliğinde.
