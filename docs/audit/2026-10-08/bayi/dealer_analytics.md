# /dealer/analytics

**Amaç:** İşletme sahibinin seçilen dönemde (7/30/90 gün) geri bildirim hacmini, ortalama puanı, duygu dağılımını, zaman yoğunluğunu, en aktif QR kodlarını ve popüler konuları tek ekranda görmesi; bayi panelinin "detaylı analitik" ana sayfası (dashboard'daki 4 ayrı "Detaylı analitik" linkinin hedefi).

**Genel puan:** 4.6 / 10 · **Karar:** yeniden tasarla

Sayfa çalışıyor ve sahte veri yok: Math.random önceden temizlenmiş (`3d3a3bb`), manşet sayılar DB agregasyonundan geliyor. Ama metriklerin birkaçı **yanlış hesaplanıyor ya da yanlış birimle gösteriliyor**. Dönüşüm oranında dönem içi pay ömür boyu paydaya bölünüyor. Puan değişimi "%" ile yazılıyor. Isı haritası ve "en yoğun saat" UTC'ye göre hesaplanıyor. Veri yokken "En yoğun gün: Pazar" diye uydurma bir içgörü çıkıyor. Grafikler elle yazılmış SVG; tooltip, eksen ve klavye erişimi yok. Dışa aktarma kodu içe aktarılmış ama hiç bağlanmamış. Bilgi mimarisi Medallia veya Square Dashboard düzeyindeki bir "performans özeti"nin gerisinde kalıyor. Ayrıca `/dealer/heatmap`, dashboard'daki analitik özeti ve `/dealer/benchmark` ile kısmen çakışıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Veri gerçek ve manşet sayılar kesin. Ancak dönüşüm oranı, puan değişimi, saat dilimi ve boş durum içgörüleri yanlış; export ve drill-down yok. |
| UX | 4/10 | Hiçbir öğe tıklanıp ilgili geri bildirimlere götürmüyor; her dönem değişiminde tüm sayfa spinner'a dönüyor; "AI Analiz Trendi" başlığının altında AI yok. |
| Görsel | 5/10 | Kart dili panelle tutarlı. Ama mobilde KPI ızgarasında boş hücre oluşuyor, çizgi grafik gerilmiş SVG'den dolayı bozuk görünüyor ve renk anlamları tutarsız (nötr gri/mavi, 5 yıldız sarı). |
| Mimari | 4/10 | 1008 satırlık tek client dosyasında 7 adet elle yazılmış grafik var. API 13 sorguyu 4 sıralı dalgada çalıştırıyor, yanıtın yarısı kullanılmıyor, `any` kaçakları var. Kurulu `recharts` kullanılmıyor. |
| Performans | 6/10 | `ssr:false` ile code-split ve 45 sn Redis cache iyi. Ama cache-miss'te 4 sıralı DB dalgası, gereksiz bir tekrar sayım sorgusu ve O(gün×kayıt) döngü var. |
| Erişilebilirlik + mobil | 3/10 | Grafiklerin metin alternatifi/aria'sı yok, ısı haritası yalnızca `title` ile çalışıyor (dokunmatik/klavye yok), sekmelerde `aria-pressed` yok, `AnimatedNumber` azaltılmış hareketi yok sayıyor, mobilde ızgara boşluğu var. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota metadata'sı (başlık/açıklama) | ÇALIŞIYOR | `app/dealer/analytics/layout.tsx:4-6` | `segmentLayoutMetadata` ile TR/EN. |
| 2 | Code-split (`dynamic`, `ssr:false`) + iskelet | ÇALIŞIYOR | `app/dealer/analytics/page.tsx:10-23` | Ancak iskeletin ardından ikinci, farklı bir yükleme ekranı geliyor (#7). |
| 3 | Rol koruması (proxy `/dealer`→DEALER, API `requireAuth`) | ÇALIŞIYOR | `proxy.ts:50-73`, `app/api/dealer/analytics/route.ts:32-36` | `dealerId = session.user.id` olduğu için IDOR yok. |
| 4 | API'de ADMIN rolü | KISMİ | `route.ts:32,36` | ADMIN'e izin var ama `dealerId` adminin kendi id'si olduğundan her zaman boş veri döner; `?dealerId` parametresi yok. Ölü yetki dalı. |
| 5 | Hero (eyebrow/başlık/açıklama/ikon) | ÇALIŞIYOR | `analytics-client.tsx:563-568` | |
| 6 | Dönem seçici (7/30/90 gün) | KISMİ | `analytics-client.tsx:477,481-483,571-581` | AbortController yok, yarış koşulu var; istek başarısız olursa eski dönemin verisi yeni etiketle kalıyor (B-6). |
| 7 | Yükleniyor durumu (tam ekran döner ikon) | KISMİ | `analytics-client.tsx:511-527` | Her dönem değişimi veya yenilemede tüm sayfa 600px spinner'a dönüyor. İlk yükte iskelet → spinner çift geçişi var. |
| 8 | Yenile butonu | KISMİ | `analytics-client.tsx:582-591`, `route.ts:66-70` | 45 sn Redis cache'i atlatmıyor; kullanıcı "yenile"ye basınca aynı veriyi görüyor. "Son güncelleme" zamanı da gösterilmiyor. |
| 9 | Hata kartı + "Tekrar dene" | KISMİ | `analytics-client.tsx:529-545` | Yalnızca ilk yükleme hatasında görünüyor. Başlığı "Veri Bulunamadı", açıklaması "yüklenemedi"; hata ile boş veri karışıyor (`messages/tr.json` `dealerAnalytics.noDataTitle`). |
| 10 | Gerçek boş durum (hiç geri bildirim yok) | EKSİK | `route.ts:366-367,412-417` | Sıfır veriyle sayfa tam render oluyor ve "En yoğun saat 0:00-1:00 / gün Pazar" gösteriyor (B-4). |
| 11 | KPI: Toplam geri bildirim + büyüme rozeti | KISMİ | `route.ts:176,180-182`, `analytics-client.tsx:599` | Sayı kesin. Önceki dönem 0 ise büyüme "+%100" diye yazılıyor; yanıltıcı. |
| 12 | KPI: Ortalama puan + değişim rozeti | BOZUK | `route.ts:187-189`, `analytics-client.tsx:600,620` | Değişim yıldız farkı (ör. 0.3) olduğu halde "%0.3" diye yazılıyor (B-2). |
| 13 | KPI: Dönüşüm oranı | BOZUK | `route.ts:177,108,337-339` | Pay dönem içi QR+tüketim yorumları, payda ömür boyu `scanCount` toplamı (B-1). |
| 14 | KPI: Yanıt oranı | KISMİ | `route.ts:371-381` | Yalnızca QR feedback'leri sayıyor; yanındaki "Toplam"da tüketim yorumları da var, paydalar farklı. `periodTotalForRate` ise `qrCur._count` ile aynı sorgunun tekrarı. |
| 15 | Animasyonlu sayaç (`AnimatedNumber`) | KISMİ | `analytics-client.tsx:110-133` | `setInterval` ile 60 adım; `prefers-reduced-motion`'u yok sayıyor. Ondalıklı metrikler (puan, dönüşüm) string olduğu için animasyonsuz kalıyor; tutarsız. |
| 16 | KPI ızgarası mobil yerleşimi | BOZUK | `analytics-client.tsx:597,609` | `grid-cols-2` içinde 2. öğe `col-span-2` olduğundan 1. satırın sağ hücresi boş kalıyor (B-8). Yerleşim, çevrilmiş başlık metninin string karşılaştırmasına bağlı. |
| 17 | Trend grafiği, "Geri bildirim" sekmesi | KISMİ | `analytics-client.tsx:136-226,667-673` | Tooltip, Y ekseni ve değer etiketi yok. X etiketleri `justify-between` ile eşit aralıklı ama veri indeksleri eşit aralıklı değil, yani hizasız. Etiketler grafiğin üstüne biniyor (absolute bottom-0). |
| 18 | Trend grafiği, "Puan" sekmesi | KISMİ | `route.ts:240-242`, `analytics-client.tsx:670` | Geri bildirim olmayan günler 0 puan çiziliyor; çizgi 0'a çakılıp "puan çöktü" izlenimi veriyor. Boşluk (gap) olmalı. |
| 19 | Trend grafiği, "Duygu" sekmesi | KISMİ | `analytics-client.tsx:670` | Yalnızca günlük *olumlu adedini* çiziyor; "Duygu" etiketi yanıltıcı (oran ya da net duygu değil). |
| 20 | "AI Analiz Trendi" başlığı | SAHTE | `analytics-client.tsx:643`, `messages/tr.json dealerAnalytics.aiTrend` | Grafik basit günlük sayım; AI katkısı yok. Pazarlama etiketi. |
| 21 | Duygu trend çubukları | KISMİ | `analytics-client.tsx:396-431,404` | Dönem 90 gün de olsa hep son 7 gün (`slice(-7)`). Lejant yok. Nötr rengi `bg-blue-400`, donut'ta ise gri (`CHART_HEX.neutral`). Başlıkta dil karışık: "Duygu Analizi Chart". |
| 22 | Dönem karşılaştırma: Geri bildirim | KISMİ | `route.ts:349-351` | "Önceki" sayısı örneklem diziden (`prevFeedbacks.length`), değişim % ise kesin `prevCount`'tan; cap aşılınca ikisi çelişir. |
| 23 | Dönem karşılaştırma: Ortalama puan | BOZUK | `analytics-client.tsx:458-461,716-724` | Yıldız farkı "%" birimiyle gösteriliyor (B-2). |
| 24 | Dönem karşılaştırma: Olumlu oran | KISMİ | `route.ts:342-362` | Değişim yüzde *puan* ama "%" diye yazılıyor; "+5 puan" olmalı. |
| 25 | Aktivite ısı haritası (7×24) | BOZUK | `route.ts:250-256` | `getDay()/getHours()` sunucu saatinde (Vercel, UTC) çalışıyor; Türkiye için 3 saat kayık (B-3). |
| 26 | Isı haritası lejantı | ÇALIŞIYOR | `analytics-client.tsx:750-760` | |
| 27 | Isı haritası hücre ipucu | KISMİ | `analytics-client.tsx:259-266` | Yalnızca `title`; dokunmatik ve klavyede erişilemiyor. `cursor-pointer` var ama tıklama yok (yanlış affordance). Saat etiketleri 4 hücrelik bloklara ortalandığı için hizasız. |
| 28 | Duygu dağılımı donut | KISMİ | `analytics-client.tsx:276-361`, `route.ts:193` | Analiz edilmemiş (`sentiment=null`) kayıtlar "Nötr"e ekleniyor. Merkezde toplam yok, `role="img"`/aria yok. |
| 29 | Donut lejantı (% değerleri) | ÇALIŞIYOR | `analytics-client.tsx:782-798` | `normalizePercentages` ile toplam 100 (`route.ts:9-28`). |
| 30 | Donut boş durumu ("Veri yok") | ÇALIŞIYOR | `analytics-client.tsx:320-340` | |
| 31 | Puan dağılımı (5→1 yıldız çubukları) | ÇALIŞIYOR | `route.ts:198-218`, `analytics-client.tsx:364-394` | Yalnızca % gösteriliyor, adet yok. Renk anlamı ters: 5★ sarı, 4★ yeşil. `ratingTotal` ölü değişken (`route.ts:204`). |
| 32 | Hızlı içgörü: En yoğun saat | BOZUK | `route.ts:366,413` | UTC kayması; veri yokken "0:00 - 1:00". |
| 33 | Hızlı içgörü: En yoğun gün | BOZUK | `route.ts:266-274,367,414` | Gün adları API'de sabit Türkçe (EN arayüzde de "Pazar"); veri yokken "Pazar". |
| 34 | Hızlı içgörü: En iyi QR | KISMİ | `route.ts:304,415` | "En iyi" denen şey *ömür boyu en çok taranan* QR; puan veya dönem dikkate alınmıyor. |
| 35 | Hızlı içgörü: Dikkat edilmeli (konu) | KISMİ | `route.ts:416` | Ham LLM konu adı (ör. "service"); taksonomi/çeviri yok, tıklanamıyor. |
| 36 | En Aktif QR Kodlar listesi (ilk 5) | KISMİ | `route.ts:292-305`, `analytics-client.tsx:883-914` | Tarama ömür boyu, geri bildirim/puan dönemlik; karışık pencere. `key={qr.name}` aynı adlı QR'larda çakışıyor. Satırlar QR detayına gitmiyor. |
| 37 | Popüler Konular (ilk 5) | KISMİ | `route.ts:308-334`, `analytics-client.tsx:938-970` | Serbest metin LLM konuları (`lib/ai-engine.ts:256,347-353`). "Servis/servis/service" ayrı sayılıyor; drill-down yok. |
| 38 | Gelişmiş AI CTA → `/dealer/ai-insights` | ÇALIŞIYOR | `analytics-client.tsx:983-1005` | |
| 39 | Dışa aktarma (CSV/PDF) | EKSİK | `analytics-client.tsx:25,47` | `exportToCSV/exportToPDF/buildAnalyticsPDFContent` ve `Download` ikonu içe aktarılmış ama hiç kullanılmıyor. Aynı yardımcılar `app/dealer/feedbacks/page.tsx:468`'de çalışıyor. |
| 40 | Hata bildirimi (toast) | KISMİ | `analytics-client.tsx:45,494,497`, `lib/admin-toast.ts` | Bayi sayfası `admin-toast` kullanıyor; her mesaja sabit Türkçe "Dikkat: " öneki ekleniyor (EN arayüzde karışık dil). |
| 41 | API Redis cache (45 sn) | ÇALIŞIYOR | `route.ts:65-70,422` | `period` doğrulanmıyor: `?period=xyz` 30 gün hesaplıyor ama ayrı anahtar altında cache'liyor. |
| 42 | API ölü yükü: `hourlyData`, `dayOfWeekData`, `consumptionStats`, `totalScans` | KISMİ (ölü kod) | `route.ts:259-278,111-142,394,409-410,419` | Arayüzde hiçbiri render edilmiyor. `consumptionStats` için ömür boyu `COUNT(DISTINCT)` ham sorgusu boşa çalışıyor. |
| 43 | Tüketim yorumlarının dahil edilmesi | KISMİ | `route.ts:117-122,162-167` | `ConsumptionReview.sentiment` alanı varken duygu puandan türetiliyor (≥4 olumlu); AI analiziyle tutarsız olabilir. |
| 44 | TR/EN yerelleştirme | KISMİ | `route.ts:238,267-273,429`, `messages/tr.json` | Gün etiketleri `tr-TR` sabit, gün adları Türkçe sabit, API hata metni Türkçe, "Chart" karışık. |
| 45 | Azaltılmış hareket desteği | KISMİ | `components/providers.tsx:232` | Global `MotionConfig reducedMotion="user"` transformları kapatıyor. Ama `AnimatedNumber` (setInterval) ve SVG `pathLength` çizimi devam ediyor. |
| 46 | Özel tarih aralığı / karşılaştırma dönemi seçimi | EKSİK | `analytics-client.tsx:576-580` | Yalnızca 3 sabit seçenek var. |
| 47 | Şube/lokasyon ve QR filtresi | EKSİK | `prisma/schema.prisma` QRCode `locationId` | Çok şubeli işletme için kırılım yok. |
| 48 | Drill-down (grafik/konu/QR'dan ilgili geri bildirimlere) | EKSİK | Tüm kartlar | Hiçbir öğe tıklanabilir değil (CTA dışında). |
| 49 | Grafik erişilebilirliği (tablo alternatifi, aria, klavye) | EKSİK | `analytics-client.tsx:165,319` | SVG'lerde `role/aria-label/<title>` yok. |

**Durum sayımı:** ÇALIŞIYOR 10 · KISMİ 25 · BOZUK 7 · SAHTE 1 · EKSİK 6 (toplam 49)

---

## Bulgular

### B-1 · YÜKSEK · Veri doğruluğu · Dönüşüm oranı dönem içi payı ömür boyu paydaya bölüyor
- **Kanıt:** `app/api/dealer/analytics/route.ts:76-79` (`_sum.scanCount`, tarih filtresi yok), `:108`, `:177`, `:337-339`. Pay `totalFeedbacks = curCount` (`:155,176`), QR feedback'lerine ek olarak **tüketim yorumlarını** da içeriyor.
- **Sorun:** 7 günlük görünümde pay 7 günlük, payda ise QR'ın açıldığı günden beri biriken toplam tarama sayısı. Oran dönem kısaldıkça yapay biçimde düşüyor ve dönemler arasında karşılaştırılamıyor. QR taramasıyla ilgisi olmayan tüketim yorumları da paya ekleniyor; teorik olarak oran %100'ü bile aşabilir. Sayfanın en görünür 4 KPI'ından biri anlamsız.
- **Öneri:** Tarama olaylarını zaman damgalı tutan bir kaynak gerekli (`QRScan` olay tablosu ya da var olan `HeatmapData`/scan log; şemada doğrulanmalı). Dönüşüm = dönem içi QR kaynaklı feedback / dönem içi tarama. Olay tablosu yoksa KPI kaldırılmalı veya "Ömür boyu dönüşüm" diye açıkça etiketlenip pay da ömür boyu QR feedback'i olmalı. Tüketim yorumları ayrı bir "Tüketim → değerlendirme oranı" metriğine taşınmalı; `consumptionStats.reviewed/total` zaten hesaplanıyor (`:135-139`) ama gösterilmiyor.
- **Efor:** M

### B-2 · YÜKSEK · Veri sunumu · Puan değişimi ve olumlu oran değişimi yanlış birimle "%" gösteriliyor
- **Kanıt:** `route.ts:187-189` (`ratingChange = avgRating - prevAvgRating`, mutlak yıldız farkı); `analytics-client.tsx:600,617-621` ve `:458-461` (`{Math.abs(change)}%`); olumlu oranın değişimi yüzde puan (`route.ts:361`).
- **Sorun:** 4.2'den 4.5'e çıkış "▲ %0.3" görünüyor (gerçekte %7.1 artış ya da +0.3★). Olumlu oranın %40'tan %50'ye çıkışı "%10" yazıyor; doğrusu +10 puan (bağıl %25). Ayrıca `Math.abs` + ikon rengi "0" değişimi yeşil ▲ olarak gösteriyor.
- **Öneri:** Delta'yı tiplendirilmiş bir nesne olarak döndürün: `{ value, unit: 'abs'|'pct'|'pp', direction: 'up'|'down'|'flat', goodWhen: 'up'|'down' }`. Ortak bir `<DeltaBadge>` bileşeni birimi (`+0,3★`, `+10 puan`, `+%12`), yön ikonunu, "değişim yok" durumunu ve `Intl.NumberFormat` yerelleştirmesini yönetsin. Önceki dönem 0 iken "+%100" yerine "Yeni" / "—" gösterin (`route.ts:180-182`).
- **Efor:** S

### B-3 · YÜKSEK · Veri doğruluğu · Isı haritası, en yoğun saat/gün ve günlük kovalar UTC'ye göre hesaplanıyor
- **Kanıt:** `route.ts:225-226` (`setHours(0,0,0,0)`), `:253-254`, `:261`, `:276` (`getDay()/getHours()`); `vercel.json` bölgesi `fra1`, repo'da `TZ` ayarı yok (`.env*`/`next.config` grep'i boş). Vercel fonksiyonlarının varsayılan saat dilimi UTC (platform davranışı; çalışma zamanında ölçülmedi, **kod düzeyinde doğrulandı**).
- **Sorun:** İstanbul'daki bir kafede 19:00'daki yoğunluk 16:00'da görünüyor. Gece 00:00-03:00 arası geri bildirimler önceki güne yazılıyor. "En yoğun saat" içgörüsü personel planlamasında kullanılırsa 3 saatlik hata doğrudan operasyonel karara dönüşüyor. `/dealer/heatmap` kendi API'sinde günü Pazartesi'den başlatıyor (`app/api/dealer/heatmap/route.ts:28-29`), bu sayfa Pazar'dan; iki sayfa aynı veriyi farklı gösteriyor.
- **Öneri:** Bayi profiline `timezone` ekleyin (varsayılan `Europe/Istanbul`). Kovaları DB'de `date_trunc('day', "createdAt" AT TIME ZONE $tz)` ve `EXTRACT(dow/hour FROM "createdAt" AT TIME ZONE $tz)` ile `GROUP BY` ederek üretin. Bu hem saat dilimini düzeltir hem de 20k cap'li in-memory diziyi gereksiz kılar (B-5). Gün sırasını tek bir `lib/analytics/week.ts` yardımcısında (Pzt-başlangıçlı, TR iş haftası) birleştirin.
- **Efor:** M

### B-4 · YÜKSEK · UX / Sahte içgörü · Veri yokken uydurma "En yoğun saat 0:00 / En yoğun gün Pazar"
- **Kanıt:** `route.ts:366` (`hourlyData.indexOf(Math.max(...))` tümü 0 iken 0 döner), `:367` (`reduce` ilk öğeyi, yani "Pazar"ı döner), `:413-414`; `analytics-client.tsx:831-844` koşulsuz render ediyor.
- **Sorun:** Yeni açılmış bir işletme ilk gün "En yoğun gününüz Pazar, en yoğun saatiniz gece yarısı" görüyor. Bu güven kıran, sahte bir içgörü. Sayfanın genelinde de gerçek bir boş durum yok: 0'larla dolu kartlar, düz çizgi grafik, boş ısı haritası çıkıyor.
- **Öneri:** API veri yokken `peakHour/peakDay: null` döndürsün; anlamlılık eşiği de koyun (ör. dönemde < 10 kayıt varsa "yetersiz veri"). İstemcide `totalFeedbacks === 0` için ayrı bir onboarding boş durumu gösterin: "İlk geri bildirimlerinizi toplamak için QR kodunuzu masalara yerleştirin" + `/dealer/qr-codes` CTA + örnek veriyle bulanık önizleme. Hata durumu ile boş durumu ayırın (#9).
- **Efor:** S

### B-5 · ORTA · Veri doğruluğu / Ölçek · 20k cap eski→yeni sıralandığı için büyük bayide önce *güncel* dönem düşüyor
- **Kanıt:** `route.ts:73,91-106` (`orderBy: { createdAt: 'asc' }, take: 20_000`, aralık `prevStartDate`'ten itibaren yani 2× dönem), `:117-121` aynı desen; kırılımlar `currentFeedbacks` üzerinden (`:170,192-278,309`).
- **Sorun:** 90 günlük görünümde 180 günlük veri çekiliyor. 20k'yı aşan bayide dizi önceki dönemle doluyor; güncel dönemin trendi, duygu dağılımı, puan dağılımı, ısı haritası ve konuları eksik ya da sıfır çıkıyor. Manşet "Toplam" ise kesin (`:149-158`); böylece aynı sayfada "12.400 geri bildirim" ve boş grafikler yan yana duruyor. Kod yorumu (`:145-148`) kırılımların "örneklem" olduğunu kabul ediyor ama sıralama yönü örneklemi sistematik olarak yanlı yapıyor.
- **Öneri:** Kırılımları in-memory yerine DB'de üretin: günlük seri, saat×gün, puan dağılımı ve duygu için `GROUP BY` (`$queryRaw`, B-3'teki TZ ifadeleriyle). Konular için `jsonb_array_elements_text(topics)` ile `GROUP BY`. Böylece cap tamamen kalkar ve yanıt süresi veri hacminden bağımsızlaşır. Kısa vadeli yama: `orderBy: 'desc'` ve önceki/güncel dönem için ayrı sorgu.
- **Efor:** M

### B-6 · ORTA · Durum yönetimi · Dönem değişiminde yarış koşulu; hata halinde eski veri yeni dönem etiketiyle kalıyor
- **Kanıt:** `analytics-client.tsx:481-501` (AbortController yok, `fetchAnalytics` effect bağımlılığında yok), `:491-495` (hata halinde `setData` çağrılmıyor), `:503-509` (`periodLabel` yeni dönemi gösteriyor; `useMemo` bağımlılığında `t` eksik).
- **Sorun:** 7g → 90g → 30g hızlı geçişte en son *biten* istek kazanıyor; seçici "30 gün" derken ekranda 90 günlük veri kalabiliyor. 30g → 90g isteği başarısız olursa toast çıkıyor ama ekranda 30 günlük veri "Son 90 gün içindeki değişimler" etiketiyle duruyor. Her değişimde tüm sayfa spinner'a dönüyor (`:511`), kaydırma konumu ve bağlam kayboluyor.
- **Öneri:** Veri çekmeyi SWR/React Query ile `key=['dealer-analytics', period, range, location]` olarak yönetin; iptal ve yarış koruması kendiliğinden gelir. `keepPreviousData` ile eski veriyi soluk (opacity 0.6 + ince üst progress bar) gösterip yeni veri gelince değiştirin. Hata durumunda veri kartlarının üstünde "Bu dönem yüklenemedi, gösterilen: Son 30 gün" bandı çıksın. `period` URL query parametresine taşınsın (`?period=90d`); paylaşılabilir ve geri tuşuyla uyumlu olur.
- **Efor:** S

### B-7 · ORTA · UX / Veri · Karışık zaman pencereleri: "En Aktif QR" ve "En iyi QR" ömür boyu taramaya göre sıralanıyor
- **Kanıt:** `route.ts:80-90` (`orderBy scanCount desc`, ömür boyu), `:292-305` (`scans` ömür boyu, `feedbacks/rating/positiveRate` dönemlik), `:415` (`bestQR = topQRCodes[0]`).
- **Sorun:** "Son 7 gün" görünümünde bile liste 2 yıl önce en çok taranan QR'ı başta gösteriyor. "En iyi QR" puanla ilgisiz, yalnızca en çok taranan. Satırdaki "1.240 tarama · 3 geri bildirim" ifadesi iki farklı dönemi karıştırıyor. `key={qr.name}` (`analytics-client.tsx:885`) aynı adlı QR'larda React anahtar çakışmasına yol açar.
- **Öneri:** Tabloyu dönemlik metriklerle yeniden kurun: dönem taraması (B-1'deki olay kaynağı), dönem feedback'i, dönüşüm, ortalama puan, olumlu %, önceki döneme göre Δ. Varsayılan sıralama "geri bildirim", sütun başlığıyla değiştirilebilsin. "En iyi QR" = asgari örneklem (n ≥ 5) üzerinde en yüksek Bayes-düzeltilmiş puan. `key=id`. Satır tıklaması `/dealer/feedbacks?qr={id}&period=…` adresine gitsin.
- **Efor:** M

### B-8 · ORTA · Görsel / Mobil · Mobilde KPI ızgarasının ilk satırında boş hücre
- **Kanıt:** `analytics-client.tsx:597` (`grid grid-cols-2 … lg:grid-cols-4`), `:609` (2. öğe `col-span-2 lg:col-span-1`; `grid-flow-dense` yok).
- **Sorun:** Varsayılan (sparse) yerleşimde 1. kart 1. satırın sol hücresine oturuyor. 2. kart iki sütun istediği için 2. satıra iniyor ve 1. satırın sağı boş kalıyor; telefonda ilk görünen alan kırık. Yerleşim ayrıca çevrilmiş başlık metninin karşılaştırılmasına bağlı (`stat.title === t(...)`); kırılgan.
- **Öneri:** Kart tanımına açık bir `featured: true` alanı ekleyip featured kartı ızgaranın başına koyun (mobilde 2 sütun hero KPI, altında 2×… küçük KPI), ya da `grid-flow-dense` kullanın. Kartlara `h-full` verip yükseklikleri eşitleyin.
- **Efor:** S

### B-9 · ORTA · Görsel / Erişilebilirlik · Elle yazılmış SVG grafikler: tooltip, eksen, a11y yok; görüntü bozuk
- **Kanıt:** `analytics-client.tsx:165` (`preserveAspectRatio="none"`, `vector-effect` yok, bu yüzden çizgi kalınlığı yatay/dikey farklı ölçekleniyor ve noktalar elips oluyor), `:206` (`hover:r-2` geçerli bir Tailwind sınıfı değil), `:219-223` (etiketler eşit aralıklı, veri noktalarıyla hizasız, grafiğin üzerine biniyor), `:259-266` (168 hücre için yalnızca `title`), `:319` (donut'ta `role`/`aria-label` yok). `package.json`'da `recharts ^2.10.3` kurulu ama kullanılmıyor.
- **Sorun:** Kullanıcı bir noktanın değerini öğrenemiyor (Y ekseni ve tooltip yok). Ekran okuyucu kullanıcısı için grafikler tamamen görünmez. Dokunmatik cihazda ısı haritası hücre değerleri hiç okunamıyor. 1008 satırlık dosyanın yaklaşık 370 satırı (`:109-473`) bakım yükü olan özel grafik kodu.
- **Öneri:** Projede zaten bulunan `recharts`'ı shadcn `ChartContainer/ChartTooltip` deseniyle sarıp `components/analytics/` altında paylaşılan `TrendChart`, `SentimentDonut`, `RatingBars`, `WeekHourHeatmap` bileşenlerine bölün. Her grafiğe `aria-label` özeti ("Son 30 günde 412 geri bildirim, en yüksek 14 Eylül: 31") ve "Tablo olarak göster" geçişi (`<table>` alternatifi) ekleyin. Isı haritası hücreleri `button` + roving tabindex + odakta görünen popover olsun; tıklayınca o gün/saatin geri bildirimlerine gitsin.
- **Efor:** L

### B-10 · ORTA · Özellik · Dışa aktarma kodu içe aktarılmış ama bağlanmamış
- **Kanıt:** `analytics-client.tsx:25` (`Download`), `:47` (`exportToCSV, exportToPDF, buildAnalyticsPDFContent`); dosyada çağrı yok. Çalışan örnek: `app/dealer/feedbacks/page.tsx:468`.
- **Sorun:** Analitik sayfasının en temel beklentilerinden biri (rapor alıp ortağa/yönetime iletmek) yok; işin yarısı yapılıp bırakılmış.
- **Öneri:** Hero aksiyonlarına "Dışa aktar" açılır menüsü: CSV (günlük seri + QR tablosu + konular) ve PDF özet (`buildAnalyticsPDFContent`; KPI'lar, dönem, karşılaştırma). Orta vadede "Haftalık raporu e-postayla gönder" planlaması; `/dealer/weekly-brief` altyapısına bağlanabilir. PDF'teki sabit Türkçe etiketler (`lib/export-utils.ts:162-163`) yerelleştirilmeli.
- **Efor:** S

### B-11 · ORTA · Performans / Mimari · 13 sorgu 4 sıralı dalgada; tekrarlı ve kullanılmayan sorgular var
- **Kanıt:** Dalga 1 `route.ts:75-107` (3 sorgu), dalga 2 `:115-132` (4 sorgu; `COUNT(DISTINCT customerId)` ömür boyu, sonucu UI'da kullanılmıyor), dalga 3 `:149-154` (4 aggregate), dalga 4 `:371-378` (2 count; `periodTotalForRate`, `qrCur._count._all` ile aynı). `qRCode.aggregate` ve `qRCode.findMany` aynı tabloyu iki kez okuyor. Günlük seri döngüsü O(gün × kayıt) (`:222-247`: 90 × 20k = 1,8M `new Date`).
- **Sorun:** Cache-miss'te Neon pooler üzerinden 4 ardışık round-trip; soğuk açılışta sayfa algılanan süresi uzuyor. Yanıt gövdesinin yaklaşık %30'u (`hourlyData`, `dayOfWeekData`, `consumptionStats`, `totalScans`) istemcide kullanılmıyor.
- **Öneri:** Bağımsız sorguları tek bir `Promise.all`'da toplayın. Tekrarlı count'u kaldırıp `qrCur` + `dealerRepliedAt` filtreli tek count yeterli. Kullanılmayan alanları ve distinct sorgusunu silin. B-5'teki SQL agregasyonuna geçişle in-memory döngüler de ortadan kalkar. Yanıtı `zod` şemasıyla tiplendirip istemciyle paylaşın (`lib/analytics/types.ts`); `any`'ler (`:111,162`) gider.
- **Efor:** M

### B-12 · ORTA · UX / Doğruluk · "Nötr" analiz edilmemiş kayıtları da içeriyor; tüketim yorumu duygusu puandan türetiliyor
- **Kanıt:** `route.ts:193` (`f.sentiment === 'neutral' || !f.sentiment`), `:164` (tüketim yorumu duygusu `rating >= 4 ? positive`); oysa şemada `ConsumptionReview.sentiment` alanı var.
- **Sorun:** AI kuyruğu gecikince ya da başarısız olunca nötr oranı şişiyor ve duygu trendi gerçek dışı "durgunlaşıyor". Aynı işletmenin iki kanalı farklı yöntemle sınıflanıyor.
- **Öneri:** Donut'a dördüncü bir "Analiz bekliyor" dilimi (gri tarama deseni) ve "x kayıt analiz kuyruğunda" notu ekleyin. Tüketim yorumlarında önce `sentiment` alanını kullanın, yoksa puandan türetin ve bunu işaretleyin.
- **Efor:** S

### B-13 · DÜŞÜK · i18n · Dil karışıklıkları
- **Kanıt:** `route.ts:238` (`toLocaleDateString('tr-TR')`), `:267-273` (gün adları sabit Türkçe), `:429` (Türkçe hata metni); `messages/tr.json` `dealerAnalytics.sentimentChartTitle = "Duygu Analizi Chart"`; `lib/admin-toast.ts` sabit "Dikkat: "/"Basarili: " önekleri (bayi sayfasında admin toast'ı kullanılıyor, `analytics-client.tsx:45`); konu adları ham LLM çıktısı (`lib/ai-engine.ts:256` örneği İngilizce `"service"`).
- **Öneri:** API etiket değil ham veri döndürsün (ISO tarih, `dow` indeksi); etiketleri istemci `Intl.DateTimeFormat(locale)` ile üretsin. Bayi paneli için yerelleştirilmiş, öneksiz `sonner` toast'ı kullanılsın. Konu adları için kanonik taksonomi (`lib/topic-taxonomy.ts`: anahtar → TR/EN etiket + eşanlamlılar) ve AI çıktısını bu taksonomiye eşleyen normalizasyon eklensin.
- **Efor:** M

### B-14 · DÜŞÜK · UX · "AI Analiz Trendi" başlığı yanıltıcı; "Duygu" sekmesi yalnızca olumlu adedini çiziyor
- **Kanıt:** `analytics-client.tsx:643`, `:670` (`dataKey='positive'`), `:648-662` (sekmeler `aria-pressed`/`role="tab"` içermiyor).
- **Öneri:** Başlık "Geri bildirim trendi" olsun. "Duygu" sekmesi net duygu skorunu (olumlu% − olumsuz%) ya da yığılmış alan grafiğini çizsin. Sekmeler shadcn `Tabs`/`ToggleGroup` ile erişilebilir olsun. 7 günlük duygu çubuk kartı (#21) bu yığılmış görünümle birleştirilip kaldırılsın.
- **Efor:** S

### B-15 · DÜŞÜK · Erişilebilirlik / Motion · `AnimatedNumber` azaltılmış hareketi yok sayıyor ve her yenilemede 0'dan sayıyor
- **Kanıt:** `analytics-client.tsx:110-133`; global `MotionConfig reducedMotion="user"` (`components/providers.tsx:232`) yalnızca framer animasyonlarını etkiliyor.
- **Öneri:** `useReducedMotion()` true ise doğrudan değeri gösterin. Aksi halde framer `animate(from, to)` ile *önceki değerden* yeni değere 400-600 ms yumuşak geçiş yapın, `aria-live="polite"` kapsayıcıda yalnızca son değeri duyurun. Yazı tipi `tabular-nums` olsun.
- **Efor:** S

### B-16 · DÜŞÜK · Mimari · Yenile butonu cache'i aşamıyor; `period` doğrulanmıyor; ADMIN dalı ölü
- **Kanıt:** `route.ts:38,66` (`period` serbest string cache anahtarına giriyor), `:67-70` (bypass yok), `:32,36` (ADMIN kendi id'siyle sorguluyor).
- **Öneri:** `period`'u `z.enum(['7d','30d','90d'])` ile doğrulayın (geçersizse 400). "Yenile"de `?fresh=1` ile cache'i atlayın (rate-limit'li) ve yanıta `generatedAt` ekleyip "x sn önce güncellendi" gösterin. ADMIN için ya `dealerId` parametresi + `requireDealerResource` (`lib/api-auth.ts:85`) ekleyin ya da rolü listeden çıkarın.
- **Efor:** S

---

## Eksik özellikler (kıyas: Medallia, Qualtrics CX, Google Business Profile, Yelp for Business, Toast, Square Dashboard)

1. **Özel tarih aralığı + karşılaştırma dönemi seçimi** (Square/Toast: "geçen yılın aynı dönemi", "önceki dönem", özel aralık). Şu an yalnızca 3 sabit seçenek var.
2. **Şube/lokasyon, QR, kanal (QR / tüketim / anket) ve personel filtreleri**: Medallia'nın "hierarchy filter"ı. Şemada `QRCode.locationId` ve `Feedback.dealerStaffId` var ama kullanılmıyor.
3. **Drill-down**: her grafik noktası, konu, QR ve ısı haritası hücresi filtreli `/dealer/feedbacks` listesine gitmeli (Qualtrics "click to filter", Yelp'te yorum listesine geçiş).
4. **NPS/CSAT ve hedef çizgisi**: KPI'larda hedef (ör. 4,5★), hedefe uzaklık ve sektör ortalaması (`/dealer/benchmark` verisi buraya bağlanabilir).
5. **Rapor dışa aktarma ve zamanlanmış e-posta raporu**: haftalık/aylık PDF, CSV (Medallia, GBP "Performance report").
6. **Anomali ve uyarı katmanı**: "Salı akşamı olumsuz duygu 2,3 kat arttı, konu: bekleme süresi" gibi, grafiğin üzerinde işaretlenen otomatik olaylar (Qualtrics "Stats iQ / anomaly", Toast trend uyarıları). Ayrıca yanıt süresi (median time-to-reply) KPI'ı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** İşletme sahibi 5 saniyede şu üç soruya cevap almalı: *"Bu dönem iyi mi gidiyoruz?"*, *"Neden?"*, *"Ne yapmalıyım?"*. Sayfa bir grafik kataloğu olmaktan çıkıp **anlatı + keşif** düzenine geçmeli: üstte durum özeti, ortada nedenler, altta aksiyon. Her öğe tıklanınca filtreli geri bildirim listesine gitmeli.

**Yerleşim (masaüstü → mobil tek sütun):**
1. **Yapışkan filtre çubuğu** (hero'nun altında): tarih aralığı (hazır seçenekler + özel), karşılaştırma dönemi, şube, kanal; seçimler URL'de tutulur. Sağda "Dışa aktar" ve "x sn önce güncellendi · yenile".
2. **KPI şeridi (5 kart):** Ortalama puan (hero, hedef çizgili mini sparkline), Geri bildirim hacmi, Olumlu %, Yanıt oranı + medyan yanıt süresi, Tarama → geri bildirim dönüşümü. Her kartta tiplendirilmiş `DeltaBadge` (B-2) ve 30 noktalık sparkline. Mobilde yatay kaydırmalı snap şerit.
3. **Ana trend paneli:** recharts `ComposedChart`. Çubuk = hacim, çizgi = ortalama puan (ikinci eksen); boş günlerde boşluk. Önceki dönem soluk kesikli çizgi. Anomali noktaları işaretçi, üzerine gelince "neden" kartı açılır. Sekmeler: Hacim / Puan / Net duygu (yığılmış alan).
4. **"Neden" satırı (2 sütun):** solda *Konu etkisi matrisi* (x: bahsedilme sıklığı, y: ortalama duygu; sağ-alt "acil düzelt", sağ-üst "güçlü yan"; kanonik taksonomi ile), sağda duygu donut'u ("Analiz bekliyor" dilimi dahil) + puan dağılımı (adet + %).
5. **Zaman yoğunluğu:** bayinin saat diliminde Pzt-başlangıçlı 7×24 ısı haritası. Hücre tıklaması drill-down yapar. Altında "Personel önerisi: Cuma 19-21 arası yoğunluk ortalamanın 2,1 katı". `/dealer/heatmap` buraya katlanır.
6. **QR / şube performans tablosu:** sıralanabilir, dönemlik metrikler, Δ sütunu, satır → QR detayı.
7. **Aksiyon şeridi:** "Dikkat edilmeli" konuları için `/dealer/action-items` ve `/dealer/remedy-queue` derin linkleri. AI içgörü CTA'sı somut bir AI özet cümlesine dönüşür (`/dealer/ai-insights` ile aynı kaynak).

**Motion / 3D:** 3D bu sayfa için **yersiz**; veri yoğun bir analitik ekranda dikkat dağıtır ve performans maliyeti getirir. Motion ölçülü olmalı: grafik ilk girişte 400 ms'lik tek bir çizim/opacity geçişi; filtre değişiminde içerik solup yeniden dolar (layout zıplaması yok, `keepPreviousData`); KPI sayıları önceki değerden yeniye akar; anomali işaretçisi tek seferlik hafif bir nabız. 168 hücrelik stagger scale animasyonu (`analytics-client.tsx:259-263`) kaldırılmalı. Tümü `useReducedMotion` ile kapatılabilir olmalı.

**Veri/API değişiklikleri:**
- `GET /api/dealer/analytics?from&to&compare=prev|yoy&locationId&channel` → zod ile doğrulanır.
- Tüm kırılımlar SQL `GROUP BY` ile, `AT TIME ZONE dealer.timezone` kullanılarak üretilir; in-memory cap kalkar.
- Yanıt şeması bölümlere ayrılır (`kpis`, `series`, `distribution`, `heatmap`, `topics`, `qrTable`, `anomalies`, `generatedAt`) ve istemciyle tip paylaşır. Ağır bölümler (konu matrisi, anomali) ayrı uca bölünüp paralel yüklenebilir, böylece KPI'lar önce görünür.
- Tarama olayı kaynağı netleştirilir (dönemlik dönüşüm için zorunlu).
- Redis anahtarı tüm filtreleri içerir; `fresh=1` bypass rate-limit'li olur.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/heatmap`**: aynı 7×24 yoğunluğu farklı kaynaktan (`HeatmapData` + fallback) ve farklı gün sırasıyla (Pzt-başlangıç) gösteriyor (`app/api/dealer/heatmap/route.ts:28-50`). İki sayfa aynı soruya iki farklı cevap veriyor. **Öneri:** zaman yoğunluğu tek kaynağa (analitik) taşınsın; `/dealer/heatmap`'teki QR/lokasyon bazlı tablo analitiğin "QR/şube performansı" bölümüne birleştirilsin; rota analitiğe `#yogunluk` çapası ile yönlendirilsin.
- **Dashboard "analytics-summary" widget'ı** (`app/dealer/dealer-dashboard-client.tsx:836-894`, `/api/dealer/stats`): haftalık ortalama puan gibi KPI'ları **farklı bir uçtan ve farklı formülle** hesaplıyor; iki ekranda farklı sayı görünme riski var. **Öneri:** KPI hesapları tek bir `lib/analytics/kpis.ts` servisine toplansın; iki uç da onu kullansın.
- **`/dealer/benchmark`, `/dealer/business-outcomes`, `/dealer/roi`, `/dealer/weekly-brief`, `/dealer/ask-analytics`**: aynı "analytics" menü grubunda (`components/dashboard/sidebar.tsx:246-252`) 7 ayrı sayfa var. Analitik sayfası bunların "çekirdek" görünümü olmalı. Benchmark verisi KPI kartlarına "sektör ortalaması" olarak eklenmeli; `ask-analytics` (doğal dil sorgusu) bu sayfanın üstünde "Verine sor" kutusu olarak gömülebilir. Ayrı sayfalar derin analiz için kalabilir ama bu sayfadan bağlam koruyan linklerle (aynı filtreler URL'de) açılmalı.
- **`/dealer/feedbacks`**: dışa aktarma ve PDF özetini zaten yapıyor (`app/dealer/feedbacks/page.tsx:468`); analitik ile drill-down hedefi olarak bağlanmalı, export mantığı ortak yardımcıya taşınmalı.
- Sayfa **kaldırılmamalı**; panelin analitik omurgası. Ama yukarıdaki birleştirmelerle yeniden tasarlanmalı.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı: `app/api/dealer/analytics/route.ts`, `app/dealer/analytics/analytics-client.tsx`, `app/api/feedbacks/route.ts`, `vercel.json`, `prisma/schema.prisma`. DB'ye dokunulmadı, kod çalıştırılmadı.

| # | İddia | Karar |
|---|---|---|
| 1 | Dönüşüm oranı dönemlik pay / ömür boyu payda | **Doğrulandı (iddiadan da kötü)** |
| 2 | Puan değişimi ve olumlu oran değişimi "%" ile gösteriliyor | **Doğrulandı** (puan kısmı kesin; olumlu oran kısmı yüzde puan/yüzde karışıklığı) |
| 3 | Isı haritası / yoğun saat-gün UTC'ye göre | **Doğrulandı** (kod kesin; UTC çalışma zamanı platform varsayılanı, canlıda ölçülmedi) |
| 4 | Veri yokken sahte içgörü "0:00-1:00 / Pazar" | **Doğrulandı** |
| 5 | 20k cap + asc sıralama güncel dönemi boşaltıyor | **Doğrulandı (gizli/eşik bağlı)** |

**1. Dönüşüm oranı.** `route.ts:76-79` `scanCount` toplamını tarih filtresiz alıyor; `route.ts:155,176` pay = dönem içi QR feedback + dönem içi `ConsumptionReview`; `route.ts:337-339` oran. Ek bulgu: kod tabanında `scanCount`'u artıran TEK yer `app/api/feedbacks/route.ts:261-264` (her feedback oluşturulduğunda `increment: 1`). Yani `scanCount` aslında "tarama" değil, "ömür boyu oluşturulmuş QR feedback sayısı" (soft-delete edilenler dahil). Sonuç: metrik dönüşüm değil, "bu dönemin feedback'i / tüm zamanların feedback'i" oranı. Yeniden üretim: 1 yıldır aktif, 1.200 feedback'i olan bayi 7 günde 20 feedback alırsa oran %1,7 görünür; 30 günde 100 alırsa %8,3. Gerçek dönüşüm değişmeden sayı dönemle oynuyor. Yeni bir bayide ise (tüm feedback'ler bu dönemde + tüketim yorumları) oran %100'ü aşabilir. Öneri: gerçek bir tarama olayı (QR açılışı) kaydedilmeden bu KPI gösterilmemeli; kısa vadede kart kaldırılmalı veya "Tarama verisi yok" olarak işaretlenmeli, uzun vadede `QrScanEvent` (qrCodeId, createdAt) tablosu + dönemlik `COUNT` ile pay/payda aynı pencereye ve aynı kanala (yalnız QR) bağlanmalı.

**2. Birim hatası.** `route.ts:187-189` `ratingChange` mutlak yıldız farkı (ör. 0.3); `analytics-client.tsx:600,617-620` KPI kartında ve `analytics-client.tsx:458-460` (`ComparisonCard`, `:720`) `Math.abs(change)%` olarak basılıyor: 4,2→4,5 "↑ 0.3%" görünür (gerçek göreli değişim ≈ %7, mutlak +0,3★). Olumlu oran (`route.ts:361`) yüzde puan farkı; %40→%50 "↑ 10%" görünür, doğrusu "+10 puan" (göreli %25). Ek tutarsızlık: `comparison.feedbacks.previous` (`route.ts:350`) cap'li örneklemden `prevFeedbacks.length`, `change` ise kesin `prevCount`'tan (`route.ts:180-182`) geliyor; büyük bayide kartta önceki değer ile yüzde birbirini tutmayabilir. Öneri: API her delta için `{ value, unit: 'percent' | 'points' | 'stars' }` döndürmeli, istemcide tek bir tiplendirilmiş `DeltaBadge` birimi biçimlendirmeli.

**3. Saat dilimi.** `route.ts:225-226` (`setHours`), `253-254`, `261`, `276` (`getDay`/`getHours`) sunucunun yerel saatini kullanıyor; `vercel.json` yalnızca `regions: ["fra1"]` içeriyor, TZ ayarı yok; projede `lib/timezone.ts:44` gibi yerlerde `Europe/Istanbul` açıkça kullanılıyor ama bu uçta kullanılmıyor. Vercel Node fonksiyonları varsayılan olarak UTC çalışır (bölgeden bağımsız; canlıda ölçülmedi). Yeniden üretim: Salı 01:30 (TR) gelen feedback Pazartesi 22:00 hücresine düşer; 19-21 akşam yoğunluğu 16-18'de görünür; günlük trendde 00:00-03:00 TR arası feedback'ler bir önceki güne yazılır. Öneri: kovalar SQL'de `date_trunc('hour', "createdAt" AT TIME ZONE 'Europe/Istanbul')` (ileride bayi başına `timezone` alanı) ile üretilmeli; `dailyData` gün sınırları da aynı dilimde hesaplanmalı.

**4. Sahte içgörü.** Dönemde hiç feedback yoksa `hourlyData` tümü 0 → `Math.max(...)=0`, `indexOf(0)=0` (`route.ts:366`); `reduce` başlangıç değeri `dayOfWeekData[0]` = "Pazar" (`route.ts:367`). İstemci yalnızca `!data` durumunda boş durum gösteriyor (`analytics-client.tsx:529`); içgörü kartları `analytics-client.tsx:831-844` koşulsuz basılıyor. Yeniden üretim: yeni bayi veya 7 gün sessiz bayi "En yoğun saat 0:00 - 1:00, En yoğun gün Pazar" görür. Eşitlik durumunda da (ör. tek feedback) ilk eşleşen döner, yani anlamsız "zirve" üretilir. Öneri: API `peakHour/peakDay` için yeterli örneklem yoksa (ör. < 10 olay) `null` dönmeli; istemci `bestQR` gibi "Henüz veri yok" göstermeli.

**5. 20k cap.** `route.ts:91-106` ve `117-121`: pencere `prevStartDate`'ten (2× dönem) başlıyor, `orderBy: { createdAt: 'asc' }`, `take: 20_000`. `route.ts:170` güncel dönem bu diziden filtreleniyor. Kodun kendi yorumu da riski kabul ediyor (`route.ts:145-148`). Yeniden üretim: 90g görünümünde son 180 günde 25.000 QR feedback'i olan bayide dizi en eski 20.000 kayıtla dolar; son ~5.000 (güncel dönemin önemli kısmı) dışarıda kalır. Manşet `totalFeedbacks` ve `avgRating` (DB agregasyonu, `route.ts:149-158`) doğru, ama duygu dağılımı, puan dağılımı, günlük trend, ısı haritası, konular ve top QR feedback sayıları eksik; ayrıca `ratingDistribution` yüzdeleri eksik örneklemden normalize ediliyor. Eşik yüksek (90g için ~111 feedback/gün, 30g için ~333/gün); şu anki canlı veride bu eşiği aşan bayi olup olmadığı doğrulanmadı (DB'ye bakılmadı). Hata gerçek ama şu an için gizli olabilir. Öneri: kırılımlar SQL `GROUP BY` ile üretilmeli (cap tamamen kalkar); geçici düzeltme olarak sıralama `desc` yapılıp güncel dönem ve önceki dönem ayrı sorgularla çekilmeli.
