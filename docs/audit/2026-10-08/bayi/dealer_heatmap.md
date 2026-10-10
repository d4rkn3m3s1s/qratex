# /dealer/heatmap

**Amaç:** Bayinin geri bildirim/ziyaret yoğunluğunu iki eksende göstermek: (1) haftanın günü × saat (7×24 ızgara), (2) QR kod/"lokasyon" bazında hacim, ortalama puan ve memnuniyet. Ek olarak aynı iş kategorisindeki akranların ortalamasını ("komşu segment") gösterip benchmark sayfasına yönlendirir.

**Genel puan: 4.2/10** · **Karar: yeniden tasarla** (sayfanın fikri değerli ve ürünün tek "zaman × mekân" görünümü; ancak ızgaradaki gün etiketleri bir gün kaymış, saatler UTC, sayılan olay türü yanlış adlandırılmış, "lokasyon" aslında QR kodu. Yani sayfa şu an bayiye **yanlış operasyonel karar** aldırabilecek veri gösteriyor. `/dealer/analytics` içindeki ikinci ısı haritasıyla tek kaynakta birleştirilmeli.)

Kapsam: `app/dealer/heatmap/page.tsx` (463 satır, tek istemci bileşeni), `app/dealer/heatmap/layout.tsx`, `app/dealer/layout.tsx`, `app/api/dealer/heatmap/route.ts`, `app/api/dealer/benchmark/route.ts`, `lib/heatmap-track.ts`, çağıranlar (`app/api/feedbacks/route.ts:414-418`, `app/api/dealer/consumptions/route.ts:354-359`), `prisma/schema.prisma` (`QRCode` 718-743, `DealerLocation` 747-763, `Feedback` 765+, `HeatmapData` 2101-2116), `messages/tr.json` + `messages/en.json` (`dealerHeatmap` 1433-1472), `lib/app-locale.tsx`, `lib/admin-toast.ts`, `lib/module-gate.ts`, `lib/module-controls.ts:37`, `components/dashboard/sidebar.tsx:267`, `components/providers.tsx:232`, kıyas için `app/dealer/analytics/analytics-client.tsx:228-270` ve `app/api/dealer/analytics/route.ts:249-256`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Veri geliyor ve çiziliyor; ama ızgaradaki gün etiketleri bir gün kaymış, saatler UTC (TR'de 3 saat geri), "geri bildirim" diye etiketlenen sayı aslında geri bildirim + tüketim toplamı; dönem filtresi, kırılım, tıklayarak inme yok. |
| UX | 4/10 | Üç bölüm (bar grafik, lokasyon kartları, özet) aynı veriyi tekrar ediyor; "veri yok" durumu "en kötü skor" (kırmızı bar, %0, 0.0 yıldız) gibi görünüyor; hata, boş durumla aynı görünüyor. |
| Görsel | 6/10 | Hero, özet kartları ve amber→kırmızı palet tutarlı ve temiz; ancak her kartta aynı metriği iki ayrı çubuk gösteriyor, nötr oylar kırmızıya boyanıyor. |
| Mimari | 4/10 | API sözleşmesi sayfaya göre düzeltilmiş (route.ts:9-19), oturumdan `dealerId` alınıyor (IDOR yok); ama gün indeksi sözleşmesi iki uçta farklı, modül kapısı yok, tek bir kart için ağır `/api/dealer/benchmark` çağrılıyor, `HeatmapData` ile fallback arasında tarih kopukluğu var. |
| Performans | 5/10 | Tüm geri bildirim puanları (zaman sınırsız) Node'a çekilip JS'te toplanıyor; benchmark ucu 25k satır tarama + ~40 sorgu çalıştırıyor; çok QR'lı bayide kart animasyonu saniyelerce sürüyor. Redis önbelleği yok. |
| Erişilebilirlik + Mobil | 4/10 | Hücre değerleri yalnız `title` ile (dokunmatik/klavye ile okunamaz), ızgara için tablo/grid semantiği yok, yalnız renk kodlaması; boş durumda `<a>` içinde `<button>`; global `MotionConfig reducedMotion="user"` sayesinde hareket azaltma kısmen karşılanıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa meta başlığı/açıklaması | ÇALIŞIYOR | heatmap/layout.tsx:4-6; tr.json:99-100 | Meta açıklaması "Ziyaret ve geri bildirim yoğunluğu" diyor; sayfa içi metinler ise yalnız "geri bildirim" diyor (tutarsız). |
| 2 | Veri yükleme (heatmap + benchmark paralel) | KISMİ | page.tsx:178-189 | `r.ok` kontrolü yok; benchmark yanıtı JSON değilse `Promise.all` reddolur ve sağlam gelen ısı haritası verisi de atılır (Bulgu 6). |
| 3 | Yükleniyor iskeleti | ÇALIŞIYOR | page.tsx:191-207 | Yerleşimi iyi taklit ediyor; `aria-busy`/canlı bölge yok. |
| 4 | Yükleme hatası toast'ı | KISMİ | page.tsx:187; lib/admin-toast.ts | Yalnız ağ hatası/JSON parse hatasında; 401/500'de sessiz kalıyor. `admin-toast` metnin başına sabit "Dikkat: " ekliyor → EN arayüzde "Dikkat: Could not load heatmap". Yeniden dene butonu yok. |
| 5 | Hero (eyebrow, başlık, açıklama, ikon) | ÇALIŞIYOR | page.tsx:216-221 | — |
| 6 | Dönem rozeti (chip) | BOZUK | page.tsx:222-228; route.ts:131 | API sabit `period: 'all'` dönüyor; arayüz bunu çevirisiz ham "all" olarak basıyor (TR arayüzde İngilizce kelime). |
| 7 | "QR Kodları" eylem butonu | ÇALIŞIYOR | page.tsx:229-241 | `asChild` ile doğru. |
| 8 | Komşu segment kartı | KISMİ | page.tsx:244-266; benchmark/route.ts:207-249 | Veri doğru (30 gün, ≥3 akran); ancak `note` API'de sabit Türkçe (benchmark/route.ts:246) → EN arayüzde Türkçe metin. Kart, ısı haritası konusuyla ilgisiz ve sayfaya ağır bir uç maliyeti getiriyor (Bulgu 8). Dönem (30 gün) belirtilmiyor; sayfanın geri kalanı tüm zamanlar. |
| 9 | "Benchmark detayı" linki | ÇALIŞIYOR | page.tsx:262-264 | — |
| 10 | Özet: Lokasyon sayısı | KISMİ | page.tsx:276-286; route.ts:119 | Aslında **QR kodu sayısı**; aynı şubede 3 QR varsa "3 lokasyon" der (Bulgu 4). Pasif/iptal edilmiş QR'lar da dahil (route.ts:76-77). |
| 11 | Özet: Toplam geri bildirim | ÇALIŞIYOR | page.tsx:287-297; route.ts:111 | Tüm zamanlar, silinenler hariç (route.ts:83). |
| 12 | Özet: En yüksek puanlı lokasyon | KISMİ | page.tsx:298-317; route.ts:113-115 | Asgari örnek eşiği yok: 1 adet 5 yıldız alan QR, 400 adet 4.8 alan şubeyi geçer (Bulgu 7). |
| 13 | Özet: En yoğun an (gün + saat) | BOZUK | page.tsx:318-333; route.ts:66-72 | Gün etiketi bir gün kaymış (Pazartesi zirvesi "Paz" görünür), saat UTC (15:00 TR zirvesi "12:00" görünür), alt metin "{count} geri bildirim" ama sayı tüketimleri de içeriyor (Bulgu 1, 2, 3). |
| 14 | `mostActiveLocation` özeti | SAHTE (ölü veri) | route.ts:116, 124-126; page.tsx:47 | API hesaplıyor, tip tanımlı, arayüz hiç göstermiyor. |
| 15 | Gün × saat ısı ızgarası (7×24) | BOZUK | page.tsx:52-126, 353; route.ts:29-64 | Satır etiketleri bir gün kaymış; saatler UTC; hücre sayısı geri bildirim + tüketim; tarih penceresi yok (tüm geçmiş toplanıyor). |
| 16 | Izgara hücre ipucu (tooltip) | KISMİ | page.tsx:102-105; tr.json:1461 | Yalnız `title` (fare ile); dokunmatik ve klavyede erişilemez; metin "geri bildirim" diyor (yanlış). `t()` değişken desteği varken (app-locale.tsx:59) elle `.replace` zinciri. |
| 17 | Izgara renk lejantı (Az → Çok) | KISMİ | page.tsx:112-123 | Sayısal eşik yok; doğrusal kovalar tek bir aykırı hücrede tüm ızgarayı soluklaştırır. |
| 18 | Hücre giriş animasyonu (168 spring) | ÇALIŞIYOR | page.tsx:91-101; providers.tsx:232 | Toplam ~0.5 sn kademe; `reducedMotion="user"` dönüşümleri kapatıyor. Kabul edilebilir ama bilgi değeri yok. |
| 19 | Hücre hover halkası | KISMİ | page.tsx:101 | `cursor-default` + hover halkası tıklanabilir izlenimi veriyor ama tıklama aksiyonu yok. |
| 20 | Soğuk başlangıç fallback'i (son 500+500 olay) | KISMİ | route.ts:44-64 | Yalnız `HeatmapData` tamamen boşsa çalışıyor; fallback geri bildirim sorgusunda `deletedAt: null` filtresi yok (route.ts:53-58) → silinen geri bildirimler sayılıyor. |
| 21 | `HeatmapData` kalıcı kovası (yazma tarafı) | KISMİ | lib/heatmap-track.ts:18-38; feedbacks/route.ts:414-418; consumptions/route.ts:354-359 | UTC ile kovalanıyor; ateşle-unut `import().then` `after()` içinde değil (aynı dosyada diğer yan etkiler `after()` kullanıyor, feedbacks/route.ts:450-453, 536-551) → serverless'ta artış kaybolabilir. Geri bildirim silinince kova azaltılmıyor. |
| 22 | Lokasyon bar grafiği (ilk 8) | ÇALIŞIYOR | page.tsx:128-165, 371 | Lokasyon kartlarının sıralamasıyla aynı veriyi tekrar ediyor. |
| 23 | Bar grafik boş durumu | ÇALIŞIYOR | page.tsx:160-162 | — |
| 24 | Lokasyon detay kartları ızgarası | KISMİ | page.tsx:377-460; route.ts:76-108 | Tüm QR'lar sayfalama olmadan; kademeli gecikme sınırsız (`0.3 + i*0.04`, page.tsx:414) → 100 QR'da son kart ~4.3 sn sonra görünür (Bulgu 9). |
| 25 | Kart üst memnuniyet şeridi (yeşil/kırmızı) | KISMİ | page.tsx:417-422 | Nötr (3 puan) oylar kırmızıya boyanıyor; geri bildirimsiz QR tamamen kırmızı (Bulgu 5). Aynı metrik aşağıda `Progress` ile tekrar. |
| 26 | Kart: ad + geri bildirim rozeti | ÇALIŞIYOR | page.tsx:424-434 | Aynı `DealerLocation`'a bağlı QR'lar aynı adla ayrı kart olarak çıkar. |
| 27 | Kart: ortalama puan | KISMİ | page.tsx:436-439; route.ts:95 | Veri yoksa "0.0 ★" gösteriyor (veri yok ≠ 0 puan). |
| 28 | Kart: olumlu/olumsuz sayıları | ÇALIŞIYOR | page.tsx:440-445; route.ts:93-94 | Nötr sayısı gösterilmiyor; ikonlar `aria-hidden`/etiket yok, ekran okuyucu yalnız iki çıplak sayı okur. |
| 29 | Kart: memnuniyet yüzdesi + Progress | KISMİ | page.tsx:447-453; route.ts:97 | "%{n}" TR biçimi EN arayüzde de aynı; veri yokken "%0". |
| 30 | Lokasyon kartı tıklama / detaya inme | EKSİK | page.tsx:416 | Kart etkileşimsiz; ilgili geri bildirimlere filtreli geçiş yok. |
| 31 | Lokasyon boş durumu | KISMİ | page.tsx:393-406 | Yalnız hiç QR yokken; metin "geri bildirim gelince" diyor ama tetikleyici QR yokluğu. `<Link><Button>` → `<a>` içinde `<button>` (geçersiz iç içe etkileşim). Hata durumunda da bu boş ekran görünür. |
| 32 | Yetki: yalnız DEALER, kendi verisi | ÇALIŞIYOR | route.ts:22-27; benchmark/route.ts:17-27; proxy.ts:52 | IDOR yüzeyi yok. |
| 33 | Modül/menü kapısı (admin "heatmap" modülünü kapatınca) | EKSİK | lib/module-controls.ts:37; sidebar.tsx:267, 450-454; route.ts (assert* çağrısı yok) | Kenar çubuğundan gizleniyor ama URL ve API açık kalıyor (Bulgu 10). |
| 34 | Dönem/tarih aralığı seçici | EKSİK | route.ts:131 (`'all'` sabit) | — |
| 35 | Metrik seçici (geri bildirim / ziyaret / ciro / ortalama puan) | EKSİK | schema.prisma:2108 (`revenue` var, kullanılmıyor) | — |
| 36 | Şube (DealerLocation) filtresi / gruplaması | EKSİK | route.ts:81, 100 | — |
| 37 | QR tarama → geri bildirim dönüşümü | EKSİK | page.tsx:31 (`scanCount?` tipte var); route.ts:78-86 (seçilmiyor); schema.prisma:725 | Arayüz tipi bekliyor, API dönmüyor. |
| 38 | Dışa aktarma (CSV/PNG) | EKSİK | — | — |
| 39 | i18n | KISMİ | tr/en.json:1433-1472 | Sayfa metinleri çevrili; ama "all" (route.ts:131), "Konumsuz" (route.ts:100), komşu notu (benchmark/route.ts:246), "Dikkat: " öneki (admin-toast) çevrilmiyor. |

Toplam: 39 özellik — 12 ÇALIŞIYOR, 16 KISMİ, 3 BOZUK, 1 SAHTE, 7 EKSİK.

---

## Bulgular

### 1. Izgaradaki ve "En yoğun an" kartındaki gün etiketleri bir gün kaymış
- **Önem:** kritik · **Kategori:** veri doğruluğu · **Efor:** S
- **Kanıt:** API ızgarayı Pazartesi=0 olarak üretiyor: `route.ts:29-31` (`toTrDay = rawDay === 0 ? 6 : rawDay - 1`, yorum "0 = Pazartesi .. 6 = Pazar"). Sayfa satır etiketini `t(\`dealerHeatmap.weekdayShort.${di}\`)` ile basıyor (`page.tsx:85`), zirve kartı da aynı anahtarı kullanıyor (`page.tsx:326`). Çeviride ise `"0": "Paz"` (Pazar) … `"6": "Cmt"` (`tr.json:1463-1471`, `en.json:1463`: `"0": "Sun"`).
- **Sorun:** Pazartesi verisi "Paz" satırında, Salı verisi "Pzt" satırında … Pazar verisi "Cmt" satırında görünür. Zirve Pazartesi ise kart "Paz" der. Bayi personel planlamasını (vardiya, kampanya saatini) bu ekrana göre yaparsa her gün yanlış güne karar verir. Bu sayfanın varlık sebebi tam olarak bu karar.
- **Öneri:** Gün indeksi sözleşmesini tek yerde tanımla: `lib/heatmap-grid.ts` içinde `WEEKDAY_ORDER = ['mon',…,'sun']` ve API yanıtına `dayLabels` anahtarlarını (ör. `rows: [{ day: 'mon', hours: number[] }]`) koy; ızgarayı indekse göre değil anlamlı anahtara göre çiz. Çeviri anahtarlarını `weekdayShort.mon` gibi isimli yap (sayısal anahtar her iki konvansiyonla da karıştırılmaya açık). Birim testi: Pazartesi 10:00 TR olayı → "Pzt 10:00" hücresi.

### 2. Saatler UTC ile kovalanıyor ve dönüşümsüz gösteriliyor (TR'de 3 saat kayma)
- **Önem:** yüksek · **Kategori:** veri doğruluğu · **Efor:** M
- **Kanıt:** Yazma: `lib/heatmap-track.ts:24-26` (`getUTCHours()`, `getUTCDay()`, `dateOnlyUTC`). Fallback okuma: `route.ts:62` (`getUTCDay()`, `getUTCHours()`). Gösterim: `page.tsx:77, 326` ("{hour}:00"). Sistem denetimi aynı sorunu kaydetmiş (`docs/audit/2026-10-08/sistem/veri-modeli.md:284`).
- **Sorun:** 19:00'daki akşam yoğunluğu "16:00" olarak görünür; 00:00-03:00 arası olaylar bir önceki güne yazılır. Bulgu 1 ile birleşince hücre hem gün hem saat olarak yanlış.
- **Öneri:** Kovalama işletmenin saat diliminde yapılmalı (`User.timezone`, yoksa `Europe/Istanbul`). `recordHeatmapHit` içinde `Intl.DateTimeFormat(…, { timeZone, hour: 'numeric', weekday: 'short' })` ile yerel saat/gün hesapla; `HeatmapData`'ya `tz` alanı ekle veya `date/hour` alanlarının "yerel" olduğunu şemada belgele. Mevcut satırlar için tek seferlik +3 saat kaydırma göçü (TR'de DST yok, güvenli). Fallback ve `/api/dealer/analytics` (`route.ts:253-254`, sunucu yerel saati = UTC) aynı yardımcıyı kullanmalı.

### 3. Izgara "geri bildirim" diye etiketleniyor ama tüketim (ziyaret/satış) olaylarını da sayıyor
- **Önem:** yüksek · **Kategori:** veri doğruluğu / UX · **Efor:** S-M
- **Kanıt:** `HeatmapData` hem geri bildirimde (`feedbacks/route.ts:416-417`) hem tüketimde (`consumptions/route.ts:355-357`, `revenue` ile) artırılıyor; fallback de iki kaynağı birleştiriyor (`route.ts:46-63`). Arayüz metinleri: `chartTimeDescription` "Hangi gün ve saatte en çok geri bildirim alındığı" (`tr.json:1449`), `cellTooltip` "… {count} geri bildirim" (`tr.json:1461`), `statPeakSub` "{count} geri bildirim" (`tr.json:1447`).
- **Sorun:** Bayi "en yoğun anda 42 geri bildirim" okur; gerçekte 35'i kart okutma/satış olabilir. Ayrıca aynı sayfada "Toplam geri bildirim" kartı (yalnız geri bildirim) ile ızgara toplamı tutmaz, güven zedelenir.
- **Öneri:** `HeatmapData`'ya `kind` boyutu ekle (`'feedback' | 'visit'`, unique: `dealerId,date,hour,kind`) veya iki ayrı sayaç sütunu (`feedbackCount`, `visitCount`, mevcut `revenue`). Arayüzde metrik seçici (Ziyaret / Geri bildirim / Ciro / Ortalama puan) ve etiketleri seçili metrikten türet.

### 4. "Lokasyon" aslında QR kodu; şube kavramı (DealerLocation) yok sayılıyor
- **Önem:** yüksek · **Kategori:** bilgi mimarisi / veri modeli · **Efor:** M
- **Kanıt:** Agregasyon `qRCode.findMany` üzerinden (`route.ts:76-108`), satır anahtarı `qrCodeId`, ad `qr.location?.name || qr.name` (`route.ts:100`); `totalLocations: heatmap.length` (`route.ts:119`). Şemada gerçek şube modeli var: `DealerLocation` (`schema.prisma:747-763`), `QRCode.locationId` (`schema.prisma:729`).
- **Sorun:** Bir şubede 5 masa QR'ı olan bayi 5 adet "Merkez" kartı ve "5 lokasyon" görür; şubeler arası kıyas (sayfanın vaadi: "Hangi şubeler … en hareketli") yapılamaz. Pasif/iptal edilmiş QR'lar da lokasyon sayısını şişirir.
- **Öneri:** İki seviyeli kırılım: önce `DealerLocation` (ve "Şubesiz" kovası), içinde QR'lar (masa/nokta). API: `prisma.feedback.groupBy({ by: ['qrCodeId'], _avg, _count })` sonucunu QR→locationId haritasıyla şubeye topla. Arayüz: şube kartı açılır, içindeki QR'lar sıralı liste. Pasif QR'ları ayrı rozetle işaretle ya da varsayılan gizle.

### 5. "Veri yok" durumu "en kötü skor" gibi çiziliyor; nötr oylar kırmızı sayılıyor
- **Önem:** orta · **Kategori:** UX / veri görselleştirme · **Efor:** S
- **Kanıt:** `satisfactionScore = positive/feedbackCount*100`, veri yoksa 0 (`route.ts:97`); şerit `0..score` yeşil, kalan kırmızı (`page.tsx:417-422`); `avgRating.toFixed(1)` → "0.0" (`page.tsx:438`); "%{score}" (`page.tsx:450`).
- **Sorun:** Yeni açılmış, henüz hiç geri bildirim almamış bir QR tamamen kırmızı şerit, 0.0 yıldız ve %0 memnuniyetle görünür. Ayrıca 3 puan (nötr) "memnuniyetsiz" kırmızısına dahil; 10 oyun 5'i 3 puan, 5'i 5 puansa şeridin yarısı kırmızıdır. Aynı metrik şerit + `Progress` ile iki kez çiziliyor.
- **Öneri:** Üç parçalı yığılmış çubuk (olumlu / nötr / olumsuz) tek gösterim olarak kalsın; `feedbackCount === 0` için gri "Henüz veri yok" durumu ve `avgRating: null`. Kıyas ürünlerdeki gibi NPS/CSAT tanımını bir bilgi ipucuyla açıkla ("Memnuniyet = 4-5 yıldız oranı").

### 6. Hata durumları boş durum gibi görünüyor; benchmark hatası ısı haritasını da düşürüyor
- **Önem:** orta · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** `page.tsx:179-188`: iki `fetch(...).then(r => r.json())`, `r.ok` yok. 401/500'de `hm.heatmap` tanımsız → `data` null → sıfır dolu ızgara (`page.tsx:211`) + "Henüz lokasyon verisi yok" (`page.tsx:393-406`), toast yok. `benchmark/route.ts` genelde try/catch'siz (yalnız 95-130 korumalı); işlenmeyen istisnada gövde JSON olmayabilir → `r.json()` reddi → `Promise.all` reddi → ısı haritası verisi de atılır. 429 (benchmark hız sınırı 12/dk, `benchmark/route.ts:31`) sessizce kartı gizler.
- **Sorun:** Bayi, gerçek bir hata ya da oturum düşmesini "verim yok" diye yorumlar; ilgisiz bir kartın hatası ana içeriği götürür.
- **Öneri:** `Promise.allSettled` + her yanıtta `r.ok` kontrolü; ısı haritası için ayrı `error` durumu (açıklama + "Yeniden dene"), komşu kartı için bağımsız, sessiz düşüş. Tercihen SWR/React Query ile `useSWR('/api/dealer/heatmap?range=…')` ve odak dönüşünde yenileme.

### 7. "En yüksek puan" asgari örnek eşiği olmadan seçiliyor
- **Önem:** orta · **Kategori:** veri doğruluğu · **Efor:** S
- **Kanıt:** `route.ts:113-115`: `withFeedback.sort((a,b) => b.avgRating - a.avgRating)[0]`.
- **Sorun:** 1 geri bildirimli 5.0 QR, yüzlerce geri bildirimli 4.8 şubenin önüne geçer; "en iyi" ödülü istatistiksel gürültüye gider.
- **Öneri:** Asgari n eşiği (ör. ≥10) ve/veya Bayes ortalaması (`(C*m + Σr)/(C + n)`, m = bayinin genel ortalaması). Eşiği karşılayan yoksa "Yeterli veri yok" göster. Aynı mantıkla bir "Dikkat gerektiren lokasyon" (en düşük Bayes ortalaması) kartı ekle; operasyonel değer orada.

### 8. Tek bir bilgi kartı için ağır benchmark ucu çağrılıyor
- **Önem:** orta · **Kategori:** performans / mimari · **Efor:** S
- **Kanıt:** `page.tsx:181, 185` yalnız `bm.benchmark.neighborSegment` kullanıyor. `benchmark/route.ts` ise 8 paralel agregasyon (54-72), 25 000 satırlık tarama (96-100), 4 haftalık × 4 sorgu (141-177), 7 günlük × 2 sorgu (183-205) ve akran sorguları (215-249) çalıştırıyor; 60 sn Redis önbelleği var (39-46, 281) ve 12/dk sınırı `/dealer/benchmark` sayfasıyla paylaşılıyor.
- **Sorun:** Isı haritasını her açışta (önbellek soğuksa) platform ölçekli ~40 sorgu tetikleniyor; ayrıca admin `benchmark` modülünü kapatsa bile bu sayfa o veriyi gösteriyor.
- **Öneri:** Komşu segmenti ya bu sayfadan kaldır (konu dışı; `/dealer/benchmark`'ta zaten var) ya da `GET /api/dealer/benchmark/neighbor` gibi hafif bir uç (tek `aggregate` + önbellek) aç. Kalacaksa, ısı haritasının metriğiyle aynı eksende kıyas yap (ör. "Kategorinizde zirve saat: Cum 20:00").

### 9. Lokasyon kartlarının kademeli animasyonu sınırsız; çok QR'lı bayide içerik saniyelerce gecikiyor
- **Önem:** orta · **Kategori:** performans / motion · **Efor:** S
- **Kanıt:** `page.tsx:409-415`: `transition={{ delay: 0.3 + i * 0.04 }}`, sayfalama yok. Bar grafikte aynı sorun `Math.min(i, 10)` ile sınırlanmış (`page.tsx:143`) — tutarsız.
- **Sorun:** 100 QR'da son kart ~4.3 sn, 300 QR'da ~12 sn sonra görünür; kullanıcı aşağı kaydırdığında boş alan görür.
- **Öneri:** Gecikmeyi `Math.min(i, 8) * 0.04` ile sınırla, ilk 12 kartı göster + "Tümünü göster"/sanal liste; daha iyisi kartları sıralanabilir bir tabloya çevir (Bulgu 13).

### 10. Modül kapısı yalnız menüde; sayfa ve API doğrudan URL ile açık
- **Önem:** orta · **Kategori:** yetki / ürün yönetişimi · **Efor:** S
- **Kanıt:** Modül kataloğunda `heatmap` var (`lib/module-controls.ts:37`); kenar çubuğu `item.key` ile gizliyor (`sidebar.tsx:267, 450-454`). `route.ts` içinde `assertModuleEnabled`/`assertMenuItemVisible` çağrısı yok; diğer bazı bayi uçları kullanıyor (ör. `app/api/dealer/campaigns/route.ts`, `app/api/dealer/experience-pulse/route.ts`).
- **Sorun:** Admin modülü kapattığında bayi `/dealer/heatmap` URL'si ile sayfaya ve veriye erişmeye devam eder; plan/paket kısıtlaması olarak kullanılırsa atlatılabilir.
- **Öneri:** `GET /api/dealer/heatmap` başına `assertModuleEnabled('heatmap', { role: 'dealer', request, userId })`; sayfa için `layout.tsx`'te sunucu tarafı kontrol + "Bu modül kapalı" ekranı.

### 11. Isı kovası artışı `after()` dışında; serverless'ta kaybolabilir
- **Önem:** orta · **Kategori:** veri bütünlüğü · **Efor:** S
- **Kanıt:** `feedbacks/route.ts:414-418` ve `consumptions/route.ts:354-359`: `import('@/lib/heatmap-track').then(...)` beklenmiyor ve `after()` içinde değil; aynı dosyada diğer ateşle-unut işler bilinçli olarak `after()` ile korunmuş (`feedbacks/route.ts:450-453, 536-551`, yorum: "serverless fonksiyonu canlı tutar").
- **Sorun:** Yanıt döndükten sonra fonksiyon dondurulursa upsert tamamlanmaz; ızgara sistematik olarak eksik sayar. Doğrulanmadı (çalışma zamanında ölçülmedi), ama kod yolu açık.
- **Öneri:** Her iki çağrıyı `after(() => recordHeatmapHit(...))` içine al. Uzun vadede kovayı olay tablosundan türetilen gece batch'i/materialized view ile doğrula (kendi kendini onaran sayaç).

### 12. Zaman penceresi yok; kalıcı kova ile fallback arasında tarih kopukluğu
- **Önem:** orta · **Kategori:** veri doğruluğu / işlev · **Efor:** M
- **Kanıt:** `route.ts:34-37` tüm `HeatmapData` satırlarını tarih filtresiz okuyor; fallback yalnız `rows.length === 0` iken (`route.ts:39-44`); `period: 'all'` sabit (`route.ts:131`).
- **Sorun:** (a) İki yıllık geçmişi olan bayide eski mevsimsel desen bugünkü yoğunluğu bastırır. (b) Takip başladıktan sonra tek bir satır yazıldığı anda, takipten önceki tüm geçmiş ızgaradan kaybolur (fallback devre dışı kalır). (c) Silinen geri bildirimler kovadan düşülmez; fallback'te de `deletedAt` filtresi yok (`route.ts:53-58`).
- **Öneri:** `?range=7d|30d|90d|custom` parametresi, `where: { date: { gte } }`; DB tarafında `groupBy(['dayOfWeek','hour'])` ile topla. Takip başlangıcından önceki dönem için bir kerelik backfill (feedback + consumption'dan `HeatmapData` üret). Silme akışında kovayı azalt ya da ızgarayı doğrudan `Feedback`'ten (indeksli: `@@index([qrCodeId, deletedAt, createdAt])`) SQL `date_trunc` + `AT TIME ZONE` ile hesapla.

### 13. Lokasyon agregasyonu tüm geri bildirim puanlarını belleğe çekiyor
- **Önem:** düşük-orta · **Kategori:** performans · **Efor:** S
- **Kanıt:** `route.ts:76-87`: her QR için `feedbacks: { where: { deletedAt: null }, select: { rating: true } }`, zaman sınırı yok; toplama JS'te (`route.ts:89-108`). Önbellek yok.
- **Sorun:** 100k geri bildirimli bayide her sayfa açılışında 100k satır Neon'dan Node'a taşınır.
- **Öneri:** `prisma.feedback.groupBy({ by: ['qrCodeId'], where: { qrCode: { dealerId }, deletedAt: null, createdAt: { gte } }, _avg: { rating: true }, _count: true })` + olumlu/olumsuz için `rating` ile ikinci `groupBy` (veya tek ham SQL `COUNT(*) FILTER (WHERE rating >= 4)`). Sonucu `dealer-heatmap:{dealerId}:{range}` anahtarıyla 60-120 sn Upstash'te önbellekle; yeni geri bildirimde etiketle bayatlat.

### 14. Erişilebilirlik: ızgara yalnız renk + `title`; dokunmatikte değer okunamıyor
- **Önem:** düşük-orta · **Kategori:** erişilebilirlik / mobil · **Efor:** M
- **Kanıt:** Hücreler `Motion.div` + `title` (`page.tsx:91-106`), `role`/`aria-label`/`tabIndex` yok; lejant sayısal değil (`page.tsx:112-123`); boş durumda `<Link><Button>` (`page.tsx:399-404`); kart ikonlarında `aria-hidden` yok (`page.tsx:279, 290, 301, 437, 441, 443`). Saat etiketi `text-[10px]` ve her 2 saatte bir "10:00" gibi 5 karakter (`page.tsx:75-77`); 400 px genişlikte sütun ~11 px olduğundan etiketlerin üst üste binmesi olası (doğrulanmadı, ekranda ölçülmedi).
- **Sorun:** Mobilde hover olmadığı için kullanıcı hiçbir hücrenin değerini göremez; ekran okuyucu 168 isimsiz div ile karşılaşır; renk körü kullanıcı amber/turuncu kademeleri ayıramaz.
- **Öneri:** Izgarayı `role="grid"`/semantik `<table>` (görsel olarak gizli başlıklarla) yap; hücreler `button` + `aria-label="Pazartesi 19:00, 42 ziyaret"`, ok tuşlarıyla gezinme; dokunmada alt panelde (sheet) hücre detayı. Saat etiketlerini 0/6/12/18'e indir; mobilde ızgarayı 90° çevir (satır=saat, sütun=gün) — 7 sütun dar ekranda rahat sığar. Lejanta sayısal eşikler ekle; `Link asChild` kullan.

### 15. Dil karışıklığı (TR/EN) ve sabit metinler
- **Önem:** düşük · **Kategori:** i18n · **Efor:** S
- **Kanıt:** "all" (`route.ts:131` → `page.tsx:225`), "Konumsuz" (`route.ts:100`), komşu notu (`benchmark/route.ts:246`), "Dikkat: " öneki (`lib/admin-toast.ts`), "%{n}" (`page.tsx:450`, EN'de "n%" olmalı).
- **Öneri:** API'ler metin değil kod dönsün (`period: 'all'` → istemci `t('dealerHeatmap.period.all')`; `locationName: null` → istemci "Şubesiz"); bayi sayfalarında `admin-toast` yerine önek eklemeyen `sonner`/ortak `app-toast`; yüzde için `Intl.NumberFormat(locale, { style: 'percent' })`.

### 16. Bilgi mimarisi: sayfa "Sistem" grubunda, analitik ısı haritası başka sayfada tekrar ediyor
- **Önem:** düşük · **Kategori:** IA / tutarlılık · **Efor:** M
- **Kanıt:** `sidebar.tsx:267` (`groupKey: 'system'`) — oysa `analytics` ve `benchmark` `groupKey: 'analytics'` (`sidebar.tsx:246, 251`). `/dealer/analytics` kendi 7×24 ısı haritasını çiziyor (`analytics-client.tsx:228-270`, `app/api/dealer/analytics/route.ts:249-256`) ve orada konvansiyon Pazar=0 + sunucu yerel saati; bu sayfada Pazartesi=0 + UTC.
- **Sorun:** İki ekran aynı soruya ("hangi gün/saatte yoğunuz?") farklı cevap verir; bayi hangisine güveneceğini bilemez. Ayrıca kart, bar grafik ve lokasyon kartları aynı QR sıralamasını üç kez gösteriyor.
- **Öneri:** Tek kaynak: `lib/heatmap-grid.ts` + tek API; `/dealer/analytics` bu sayfanın kompakt bileşenini (`<ActivityHeatmap compact />`) "detaya git" linkiyle kullansın. Menüde "Analiz" grubuna taşı.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Tarih aralığı + dönem karşılaştırma** (Square Dashboard, Toast): "Son 30 gün vs önceki 30 gün" ile hücre bazında artış/azalış; şu an yalnız tüm zamanlar.
2. **Metrik seçici ve çapraz katman** (Toast "Sales by hour", Square "Busiest times"): ziyaret, ciro (`HeatmapData.revenue` zaten tutuluyor), geri bildirim hacmi ve **saat başı ortalama puan** — en değerli içgörü "akşam 20-22 arası puan düşüyor" gibi kalite × yoğunluk çaprazı (Medallia/Qualtrics "driver by time").
3. **Şube haritası ve şube kıyas tablosu** (Google Business Profile, Yelp for Business): `DealerLocation.latitude/longitude` var (`schema.prisma:752-753`) ama hiç kullanılmıyor; çok şubeli bayi için harita + sıralanabilir tablo (hacim, ortalama, CSAT, eğilim sparkline'ı).
4. **Hücre/kart → geri bildirimlere inme** (Medallia, Qualtrics): hücreye tıklayınca `/dealer/feedbacks?from=…&dow=1&hour=19&location=…` filtreli liste; olumsuz yoğunluklarda AI temalarının özeti.
5. **Otomatik içgörü ve uyarı** (Qualtrics "Stats iQ", Medallia "Athena"): "Cuma 19-21 arası yoğunluk %40 arttı, ortalama puan 0.6 düştü → personel ekleyin"; mevcut AI/aksiyon (`ActionItem`) altyapısına "aksiyon oluştur" bağlantısı.
6. **QR tarama → geri bildirim dönüşüm hunisi** ve dışa aktarma (CSV/PNG/PDF rapor), Google Business Profile'daki "Popüler saatler" benzeri müşteri tarafına yayınlanabilir yoğunluk özeti.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi sayfayı açtığında 5 saniyede şu üç soruyu yanıtlayabilmeli: *"Ne zaman yoğunuz?" — "O saatlerde kalite tutuyor mu?" — "Hangi şube/nokta sorun çıkarıyor?"* Ve her cevaptan tek tıkla ilgili geri bildirimlere veya bir aksiyon (vardiya notu, kampanya saati) oluşturmaya geçebilmeli.

**Yerleşim:**
1. **Üst çubuk (sticky):** Dönem (7g/30g/90g/özel) · Şube seçici (Tümü / DealerLocation listesi) · Metrik segment kontrolü (Ziyaret · Geri bildirim · Ciro · Ort. puan) · Dışa aktar. Seçimler URL query'sinde (paylaşılabilir).
2. **İçgörü şeridi (3 kart):** "En yoğun an" (yerel saatle, bir önceki döneme göre Δ) · "Kalite düşen pencere" (en düşük ortalama puanlı gün/saat bloğu, asgari n ile) · "Dikkat gerektiren şube" (Bayes ortalaması en düşük). Her kartta "Geri bildirimleri gör" linki.
3. **Ana ızgara (tam genişlik):** 7×24; masaüstünde satır=gün, mobilde satır=saat. Hücre rengi seçili metrik; "Ort. puan" modunda diverging (kırmızı–nötr–yeşil) palet ve düşük n'li hücreler taranmış/soluk. Hücreye tıklama → yan panel: o pencerenin hacmi, puan dağılımı, en sık 3 AI teması, örnek yorumlar, "Aksiyon oluştur".
4. **Şube/nokta tablosu:** Sıralanabilir tablo (Şube → içinde QR'lar açılır satır): hacim, ort. puan, olumlu/nötr/olumsuz yığılmış çubuk, dönem eğilimi sparkline'ı, tarama→geri bildirim dönüşümü. Çok şubeli bayide tablonun yanında küçük bir harita (lat/lng varsa).
5. Komşu segment kartı kaldırılır; yerine üst çubukta "Kategori ortalamasıyla kıyasla" anahtarı (ızgaraya akran yoğunluk katmanı) — veri hafif bir uçtan.

**Motion / 3D:** 3D gereksiz; bu bir karar aracı. Hareket ölçülü olmalı: ızgara ilk yüklemede tek seferlik, satır bazında (7 adım) opaklık geçişi — 168 ayrı spring yerine. Metrik/dönem değişiminde hücre renkleri 150-200 ms renk geçişiyle morph etsin (bağlam kaybolmadan değişimi gösterir). Yan panel `m as Motion` ile kayarak açılsın; `MotionConfig reducedMotion="user"` zaten var, renk geçişleri de `prefers-reduced-motion`'da anında olsun. Kart listesi kademesi en fazla 8 öğe.

**Veri / API değişiklikleri:**
- `GET /api/dealer/heatmap?range=30d&locationId=…&metric=visits|feedback|revenue|rating` → `{ grid: { day: 'mon'…'sun', hours: { value, n }[] }[], tz, range, insights: {...}, locations: [{ locationId, name, qrCodes: [...], count, avgRating, pos, neu, neg, scanCount, trend: number[] }] }`. Metinler değil kodlar döner.
- `HeatmapData`: `kind` boyutu (veya `feedbackCount/visitCount` sütunları), yerel saat semantiği + `tz`; bir kerelik UTC→yerel göç ve takip öncesi backfill. Yazma `after()` içinde.
- Toplamlar DB'de `groupBy`/ham SQL (`AT TIME ZONE`), Upstash'te `dealer-heatmap:{id}:{range}:{loc}:{metric}` 120 sn önbellek, yeni geri bildirim/tüketimde etiketle bayatlatma.
- `assertModuleEnabled('heatmap')` hem API'de hem sayfa layout'unda.
- İstemci: SWR (veya mevcut veri katmanı) + `allSettled` mantığı, ayrı `error` / `empty` / `no-data-in-range` durumları.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/analytics` (activity heatmap):** Aynı 7×24 soruyu farklı veri kaynağı (yalnız geri bildirim, son dönem), farklı gün konvansiyonu (Pazar=0) ve farklı saat tabanıyla yanıtlıyor (`analytics-client.tsx:228-270`, `api/dealer/analytics/route.ts:249-256`). **Birleştir:** ızgara mantığı tek yardımcıda/uçta; analytics sayfası bu sayfanın kompakt bileşenini gömüp buraya link versin.
- **`/dealer/benchmark`:** Komşu segment kartı oradaki verinin alt kümesi. Bu sayfadan kaldırılmalı veya ızgara ekseninde (akran zirve saatleri) yeniden düşünülmeli.
- **`/dealer/qr-codes`:** QR başına hacim/puan bilgisi orada da faydalı; şube/nokta tablosu ortak bir `LocationPerformanceTable` bileşeni olarak iki sayfada kullanılabilir.
- **`/dealer/radar`, `/dealer/operations-brief`:** "Ne zaman yoğunuz" içgörüsü operasyon özetine tek satır olarak beslenebilir; tam ekran deneyimi bu sayfada kalmalı.
- **Kaldırma önerilmez:** Ürünün tek zaman × mekân görünümü; kıyas ürünlerin (Toast, Square, Google Business Profile "Popüler saatler") hepsinde karşılığı olan, bayi için doğrudan operasyonel değeri yüksek bir ekran. Önce veri doğruluğu (Bulgu 1-3) düzeltilmeli, sonra yeniden tasarım.

---

## Doğrulama (şüpheci inceleme)

Üç iddia kod baştan okunarak çürütülmeye çalışıldı (`app/dealer/heatmap/page.tsx`, `app/api/dealer/heatmap/route.ts`, `lib/heatmap-track.ts`, `app/api/feedbacks/route.ts`, `app/api/dealer/consumptions/route.ts`, `prisma/schema.prisma`, `messages/tr.json` + `messages/en.json`, `lib/timezone.ts`). Üçü de çürütülemedi.

### 1. Gün etiketleri bir gün kaymış — **DOĞRULANDI** (Yüksek)
- `prisma/schema.prisma:2106` `dayOfWeek` sözleşmesi Pazar=0; `lib/heatmap-track.ts:26` ham `getUTCDay()` yazıyor (tutarlı).
- `app/api/dealer/heatmap/route.ts:29-31` `toTrDay` ile satırı Pazartesi=0'a çeviriyor (satır 41 ve fallback satır 62); `peak.dayOfWeek` de bu indeksle üretiliyor (satır 70).
- Arayüz aynı indeksi doğrudan çeviri anahtarına veriyor: `page.tsx:85`, `page.tsx:103` (tooltip) ve `page.tsx:326` ("En yoğun an"). `messages/tr.json:1463-1471` ve `en.json` `weekdayShort` Pazar=0 ("0":"Paz"/"Sun").
- Sonuç: Pazartesi verisi "Paz" satırında, Pazar verisi "Cmt" satırında görünür; tüm satırlar ve zirve kartı bir gün geride.
- **Yeniden üretim:** Bayi Cuma 17:00 UTC'de 10 tüketim girer → `getUTCDay()=5` → `toTrDay(5)=4` → `t('dealerHeatmap.weekdayShort.4')` = "Per". Kart "Per 17:00" der; doğrusu Cuma.
- Not: Sözleşme yorumu (`route.ts:29`) ile etiket tablosu birbirinden habersiz; tek bir `WEEKDAY_ORDER` kaynağı (API gün kodu `'mon'..'sun'` döndürsün, istemci kodu çevirsin) bu sınıf hatayı kalıcı olarak kapatır.

### 2. Saatler UTC'de kovalanıp yerel saat gibi gösteriliyor — **DOĞRULANDI** (Yüksek)
- `lib/heatmap-track.ts:24-26` tarih/saat/gün tamamen UTC; fallback yolu da `route.ts:61-62` `getUTCDay/getUTCHours`. Hiçbir yerde `Europe/Istanbul` dönüşümü yok.
- `lib/timezone.ts:1-3` "backend UTC, frontend locale dönüşümü" standardını koyuyor; ancak bu sayfada frontend dönüşümü YOK — `page.tsx:77` ve `page.tsx:326` ham `{hour}:00`'ı saat dilimi etiketi olmadan basıyor. Yani standarda göre de eksik olan istemci tarafı.
- Projede yerel saatin önemsendiğine kanıt: `lib/surprise-badges.ts:120` `AT TIME ZONE 'Europe/Istanbul'` kullanıyor.
- **Yeniden üretim:** TR'de 20:00 (UTC 17:00) gelen geri bildirim "17:00" hücresine yazılır. Pazartesi 01:30 TR (Pazar 22:30 UTC) olayı Pazar satırına ve 22 saatine, `date` kovası da bir önceki güne düşer. Bulgu 1 ile birleşince: Cuma 20:00 TR olayı "Per 17:00" olarak görünür — hem gün hem saat yanlış.
- Not: Kova `(dealerId, date, hour)` UTC olarak saklandığı için salt istemci tarafında kaydırma yapılamaz (gün sınırı ve `date` kovası da değişir); düzeltme yazma tarafında yerel saat semantiği (veya okuma tarafında ham olaylardan `AT TIME ZONE` ile yeniden toplama) + mevcut UTC kovaların bir kerelik göçü gerektirir. Bayi başına `tz` alanı yoksa varsayılan `Europe/Istanbul`.

### 3. Izgara sayısı geri bildirim+tüketim toplamı ama "geri bildirim" diye etiketleniyor — **DOĞRULANDI** (Orta; yüksek değil)
- Aynı `HeatmapData.count` kovasını iki olay artırıyor: `app/api/feedbacks/route.ts:416-417` (geri bildirim) ve `app/api/dealer/consumptions/route.ts:355-357` (tüketim). Şemada olay türü ayrımı yok (`schema.prisma:2101-2115`). Fallback da iki kaynağı birleştiriyor (`route.ts:46-63`).
- Etiketler yalnız geri bildirim diyor: `tr.json:1447` (`statPeakSub`), `1449` (`chartTimeDescription`), `1461` (`cellTooltip`); `page.tsx:105`, `329`.
- Aynı sayfadaki "Toplam geri bildirim" kartı (`route.ts:111`, `page.tsx:294`) ise yalnız `deletedAt: null` ve puanlı geri bildirimleri sayıyor → ızgara toplamı ile kart tutarsız. Ek ayrıntı: fallback feedback sorgusu (`route.ts:53-58`) `deletedAt` filtresi uygulamıyor, silinmiş geri bildirimler de sayılıyor.
- **Yeniden üretim:** Bayi bir günde 40 tüketim girer, 2 geri bildirim alır → "En yoğun an" kartı "42 geri bildirim" der, "Toplam geri bildirim" kartı 2 gösterir.
- Önem notu: Veri bozulması değil, etiket/anlam hatası; ama bayi kalite yorumunu (geri bildirim yoğunluğu) aslında ziyaret yoğunluğuna dayandırır. Doğru yaklaşım: kovada `kind` boyutu (veya `visitCount`/`feedbackCount` ayrı sütunlar), arayüzde metrik seçici ("Ziyaret" / "Geri bildirim") ve etiketin seçili metrikten türetilmesi.

---

## Uygulama (Dalga 2)

`/dealer/heatmap` emekliye ayrıldı: sayfa `permanentRedirect` ile `/dealer/analytics/heatmap` rotasına gider, sorgu parametreleri korunur. Yeni yüzey Analitik → Yoğunluk alt sekmesi (`components/dealer/b-analitik/heatmap-screen.tsx`, `week-hour-grid.tsx`). Veri `loadActivityHeatmap` ile olay tablolarından dönemli olarak hesaplanır (`AT TIME ZONE 'Europe/Istanbul'`, `ISODOW`). BFF ucu `GET /api/dealer/heatmap`, `defineRoute` ve `heatmap` modül kapısıyla korunur. Modül kapalıysa sayfa `ErrorState moduleDisabled` gösterir.

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Meta | ÇALIŞIYOR. Metin sayfayla tutarlı, metrik seçilebilir. |
| 2 | Veri yükleme | ÇALIŞIYOR. SSR ön-yükleme ve react-query kullanılır, benchmark çağrısı kalktı. |
| 3 | İskelet | ÇALIŞIYOR (`aria-busy`) |
| 4 | Hata toast'ı | KALDIRILDI. Yerine sayfa içi `ErrorState` ve tekrar dene geldi. |
| 5 | Hero | ÇALIŞIYOR |
| 6 | Dönem rozeti | ÇALIŞIYOR. Gerçek dönem seçici var, ham "all" metni kalktı. |
| 7 | QR Kodları butonu | ÇALIŞIYOR (boş durumdaki bağlantı) |
| 8-9 | Komşu segment kartı ve bağlantısı | KALDIRILDI. Kart sayfanın konusu dışındaydı ve ağır bir uç çağırıyordu. Bu veri benchmark yüzeyinde. |
| 10 | Lokasyon sayısı | ÇALIŞIYOR. Gerçek şube (DealerLocation) kırılımı gösterilir, QR'lar alt satırlarda. |
| 11 | Toplam geri bildirim | ÇALIŞIYOR (seçili döneme göre) |
| 12 | En yüksek puanlı | ÇALIŞIYOR. Asgari örnek eşiği uygulanır. |
| 13 | En yoğun an | ÇALIŞIYOR. Gün doğru, saat İstanbul saati, metrik doğru etiketlenir. n<10 iken gizlenir, karşılaştırma değeri gösterilir. |
| 14 | mostActiveLocation | KALDIRILDI (arayüzde kullanılmayan veri) |
| 15 | 7×24 ızgara | ÇALIŞIYOR |
| 16 | Hücre ipucu | ÇALIŞIYOR. Ok tuşlarıyla roving-tabindex gezinme ve dokunmayla açılan ayrıntı paneli var. Metrik veya dönem değişince odak ızgara içinde kalır. |
| 17 | Lejant | ÇALIŞIYOR. Sayısal eşikler ve kantil ölçek var (`heat-scale.ts`), düşük-n hücreler taralı. |
| 18 | 168 spring animasyonu | KALDIRILDI. Bilgi değeri yoktu. |
| 19 | Hover halkası | ÇALIŞIYOR. Hücre seçilince ayrıntı paneli açılır, yanıltıcı tıklanabilirlik kalmadı. |
| 20-21 | HeatmapData fallback ve yazma tarafı | KALDIRILDI (okuma tarafı). Izgara artık doğrudan olay tablolarından gelir. Yazma tarafı (`lib/heatmap-track.ts`) sahiplik dışında. |
| 22-23 | Lokasyon bar grafiği | KALDIRILDI. Kırılım tablosuyla aynı veriyi tekrar ediyordu. |
| 24 | Lokasyon kartları | ÇALIŞIYOR. Şube→QR tablosu olarak gösterilir, sınırsız kademe animasyonu yok. |
| 25 | Memnuniyet şeridi | ÇALIŞIYOR. Nötr oylar ayrı gösterilir, veri yoksa "—" görünür. |
| 26-29 | Kart alanları | ÇALIŞIYOR. Veri yokluğu 0 olarak gösterilmez. Nötr sayısı, `Intl` ile biçimlenen yüzde ve erişilebilir etiketler var. |
| 30 | Detaya inme | ÇALIŞIYOR. QR ve şube satırları gelen kutusunu filtreli açar. |
| 31 | Boş durum | ÇALIŞIYOR. Hata ve boş durum ayrı, bağlantı yapısı geçerli (`<a>` içinde `<button>` yok). |
| 32 | Yetki | ÇALIŞIYOR |
| 33 | Modül kapısı | ÇALIŞIYOR (sayfa ve API) |
| 34 | Dönem seçici | ÇALIŞIYOR (`{range, compare}`) |
| 35 | Metrik seçici | ÇALIŞIYOR. Geri bildirim, ziyaret, ciro ve puan seçilebilir. |
| 36 | Şube filtresi | ÇALIŞIYOR |
| 37 | Tarama→dönüşüm | ÇALIŞIYOR. Genel bakış QR tablosunda `qr_scanned` olaylarından hesaplanır. |
| 38 | Dışa aktarma | ÇALIŞIYOR (CSV) |
| 39 | i18n | ÇALIŞIYOR |

**Kapanan bulgular:**
- 1: gün etiketi kayması
- 2: saatlerin UTC olması
- 3: geri bildirim ve tüketimin karışması; metrikler artık ayrı
- 4: lokasyon yerine QR sayılması
- 5: nötr oyların kırmızıya boyanması
- 6: `Promise.all` hatasında sağlam verinin de atılması
- 7: asgari örnek eşiği olmaması
- 8: benchmark ucunun maliyeti
- 9: kademe animasyonu gecikmesi
- 10: modül kapısı olmaması

Son düzeltmeler: yumuşak gezinmede sunucudaki çift yükleme kaldırıldı. Ziyaret olup geri bildirim olmayan bir dönem artık yanlışlıkla "boş" görünmüyor. Izgara küçülünce klavye odağı ızgara dışında kalmıyor.

**Kalanlar:**
- `HeatmapData` yazma tarafı (`lib/heatmap-track.ts`) hâlâ UTC kullanıyor ve `after()` dışında çalışıyor. Bu yüzey artık onu okumuyor; temizliği paylaşılan modülün sahibinin işi.
- PNG dışa aktarma eklenmedi, CSV yeterli görüldü.
