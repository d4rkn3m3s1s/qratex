# /customer/analytics

**Amaç:** Müşterinin seçilen dönemdeki (7/30/90/365 gün) tüketim, harcama, puan, alışkanlık (gün/saat), favori kategori/ürün/işletme ve başarı özetini tek ekranda görmesi ("Kişisel Analitik").

**Genel puan: 4/10** · **Karar: BİRLEŞTİR** (Analizler grubundaki `/customer/spending-overview`, `/customer/my-year`, `/customer/progress-hub` ile tek bir "Ben / İçgörüler" merkezine; ardından yeniden tasarla)

> Kapsam: `app/customer/analytics/page.tsx` (642 satır, tek istemci bileşeni), `app/customer/analytics/layout.tsx`, `app/api/customer/analytics/route.ts` (390 satır), `lib/api-http.ts`, `components/ui/progress.tsx`, `components/providers.tsx`, `messages/{tr,en}.json`, `prisma/schema.prisma` (Consumption, ConsumptionReview, AnalyticsEvent, UserStreak, VIPTier, UserVIPStatus, ProductCategory, Reward), `components/dashboard/sidebar.tsx`, `proxy.ts`. Kod çalıştırılmadı; tüm bulgular okuyarak doğrulandı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Özet sayıları gerçek DB aggregate'inden geliyor, ama "Sonraki Ödül", "Tahmini bekleme", aylık "Puan" sütunu ve "Sonraki Hedef" sabit/uydurma; saatlik ve aylık grafikler hatalı veri gösteriyor. |
| UX | 4/10 | Hata durumu "Henüz veri yok" diye gizleniyor, sıfır veride boş durum hiç görünmüyor, her filtre değişiminde tüm sayfa spinner'a dönüyor; anlatı/aksiyon yok, sadece tablo yığını. |
| Görsel | 5/10 | Kart dili temiz ama 9 eşit ağırlıklı kart dikey yığılıyor, başlık diğer müşteri sayfalarındaki `DashboardPageHeading/Hero` deseninden farklı, ısı haritası tema dışı sabit mor renk. |
| Mimari | 4/10 | 8.000 satır + 2×20.000 JSON olay satırı belleğe çekilip JS'te sayılıyor; yarış koşulu (AbortController yok), sunucu saat dilimi UTC, i18n yalnızca başlıkta. |
| Performans | 4/10 | Önbelleksiz, rate-limit'siz ağır uç; 5 ardışık DB turu; kardeş uçlar (`spending-overview`) zaten `groupBy`/`$queryRaw` ile aynı işi verimli yapıyor. |
| Erişilebilirlik + Mobil | 4/10 | Grafikler yalnız renk/yükseklikle anlatıyor (aria/metin yok), saatlik ızgara 14 hücreyi 11 sütuna sıkıştırıp ikinci satıra taşıyor, `title` tooltip dokunmatikte çalışmıyor; global `MotionConfig reducedMotion="user"` artı tarafta. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (segment layout) | ÇALIŞIYOR | `app/customer/analytics/layout.tsx:4-6` | i18n anahtarlı başlık/açıklama. |
| 2 | Yetki: rol kapısı + oturum kontrolü | ÇALIŞIYOR | `proxy.ts:53`, `app/api/customer/analytics/route.ts:16-22` | Sorgular `session.user.id` ile; IDOR yok. |
| 3 | Veri çekme (`/api/customer/analytics?period=`) | KISMİ | `page.tsx:121-146` | AbortController/istek kimliği yok → hızlı dönem değişiminde eski yanıt yenisini ezebilir. |
| 4 | Dönem seçici (7/30/90/365) | KISMİ | `page.tsx:186-196`, `route.ts:25-32` | Çalışıyor; ancak 365'te aylık tablo bozuk (#28), seçim URL'de tutulmuyor, paylaşılamıyor/geri tuşu yok. |
| 5 | Yenile butonu | KISMİ | `page.tsx:197-199` | Meşgul durumu/disabled yok, tüm sayfayı spinner'a çeviriyor, uç rate-limit'siz. |
| 6 | Yükleniyor durumu | KISMİ | `page.tsx:148-154` | Tek spinner; iskelet yok; filtre değişiminde mevcut içerik siliniyor (layout shift). |
| 7 | Hata durumu | BOZUK | `page.tsx:131-142,156-165` | API hatası "Henüz analiz verisi yok" boş-durum metniyle gösteriliyor; yeniden dene yok. |
| 8 | Boş durum (hiç tüketim yok) | BOZUK | `route.ts:345-380`, `page.tsx:156,167-168,430,452` | API sıfır veride de `success:true` döndüğü için boş durum hiç görünmüyor; grafikler `0/0=NaN` yükseklik/opaklıkla çiziliyor. |
| 9 | Sayfa başlığı + açıklama | ÇALIŞIYOR | `page.tsx:173-184` | Diğer sayfalardaki ortak `DashboardPageHeading`/`DashboardPageHero` kullanılmıyor (tutarsızlık). |
| 10 | Hızlı erişim: Tüketimlerim / Geri bildirimlerim | ÇALIŞIYOR | `page.tsx:204-239` | Linkler doğru; ama sayfanın konusu dışı gezinme kartları en üstte değerli alanı yiyor. |
| 11 | KPI: Toplam Tüketim + büyüme rozeti | ÇALIŞIYOR | `page.tsx:244-250`, `route.ts:116,121-123` | Önceki dönem 0 ise büyüme 0% gösteriliyor ("yeni" yerine). |
| 12 | KPI: Toplam Harcama | KISMİ | `page.tsx:252-257`, `route.ts:117`, `schema.prisma:1580` | `amount` opsiyonel (bayi girer); "kayıtlı harcama" uyarısı yok; `toLocaleString()` locale'siz. |
| 13 | KPI: Toplam Puan + puan büyümesi | KISMİ | `page.tsx:258-264`, `route.ts:154-158,349` | Değer = anlık bakiye (`user.points`), rozet = dönem kazancı büyümesi; iki farklı şey aynı kartta. Önceki dönem 0 ise sabit `+100%`. |
| 14 | KPI: Günlük Seri | ÇALIŞIYOR | `page.tsx:265-271`, `route.ts:315-323` | `catch` sessizce yutuyor; "gün" sabit TR. |
| 15 | VIP seviye kartı | KISMİ | `page.tsx:302-324`, `route.ts:326-335` | Kayıt yoksa İngilizce `'Bronze'` sabiti; `UserVIPStatus` yalnız `/api/vip` çağrılınca oluşuyor (`app/api/vip/route.ts:45`). |
| 16 | Ziyaret başı ortalama harcama | KISMİ | `page.tsx:314`, `route.ts:118` | Tutarsız tüketimler paydaya giriyor → ortalama aşağı çekiliyor; `toFixed(2)` TR ondalık virgülü kullanmıyor. |
| 17 | Favori kategori | ÇALIŞIYOR | `page.tsx:317-320`, `route.ts:343` | 8.000 satırlık örneklem üzerinden; "Henüz yok" API'de TR sabit. |
| 18 | Sonraki Ödül kartı + ilerleme | SAHTE | `route.ts:376`, `page.tsx:326-350` | Her kullanıcıya "Ücretsiz Kahve / 1000 puan" sabiti; gerçek `Reward` kataloğu (`schema.prisma:680`) kullanılmıyor. |
| 19 | Kategori dağılımı | KISMİ | `page.tsx:355-378`, `route.ts:161-177` | Doğru hesap; boş durum yok (boş kart). Kategoriler bayi bazlı olduğundan ad birleşimi büyük/küçük harfe duyarlı. |
| 20 | En çok tüketilen ürünler (top 5) | KISMİ | `page.tsx:380-410`, `route.ts:216-229` | Float toplam ham basılıyor (`₺{product.totalSpent}` → `12.300000000000001` riski); bayi notu ürün adı yerine etiket olabiliyor; boş durum yok. |
| 21 | Haftalık dağılım grafiği | KISMİ | `page.tsx:415-438`, `route.ts:182,190` | Sunucu UTC'de `getDay()` → TR 00:00–02:59 önceki güne yazılıyor; değer etiketi/aria yok. |
| 22 | Saatlik ısı haritası | BOZUK | `page.tsx:450-466`, `route.ts:203,207-212` | UTC saatleri (TR −3) + sadece 8–21 → TR 08:00–10:59 sabah ziyaretleri hiç görünmüyor; 14 hücre `grid-cols-11`'e sığmıyor, 3 hücre alt satıra kayıyor. |
| 23 | "En yoğun saat" metni | KISMİ | `page.tsx:467-469` | Ziyaret yokken bile "8:00" diyor; saat UTC. |
| 24 | Favori işletmelerim (top 3) | KISMİ | `page.tsx:476-506`, `route.ts:262-272` | Değerlendirme yoksa yıldızla "0" gösteriyor; React `key` = işletme adı (çakışabilir); "Bilinmeyen" TR sabit; işletmeye link yok. |
| 25 | Şube karşılaştırması: ortalama memnuniyet | ÇALIŞIYOR | `page.tsx:532-535`, `route.ts:283-286` | Kullanıcının kendi `ConsumptionReview` puanları. |
| 26 | Şube karşılaştırması: "Tahmini bekleme" | SAHTE | `route.ts:280-282`, `page.tsx:536-539` | `6 + loadFactor*8 + peakHourVisits*1.5` — kullanıcının KENDİ ziyaret sayısından türetilmiş anlamsız formül, gerçek bekleme verisi gibi sunuluyor. |
| 27 | Şube karşılaştırması boş metni | KISMİ | `page.tsx:521,543-546` | "En az iki şube gerekiyor" diyor ama 1 şubede de liste gösteriliyor (koşul `length > 0`). |
| 28 | Aylık trend tablosu | BOZUK | `route.ts:300-312`, `page.tsx:553-586` | Tüketimler `desc` sıralı → `slice(-4)` EN ESKİ 4 ayı alıyor; ay anahtarı yılsız (`month:'short'`) → 365 günde geçen yılın aynı ayı bu yılla birleşiyor; tablo yeniden eskiye sıralı. |
| 29 | Aylık trend: Puan sütunu | SAHTE | `route.ts:306` | `amount * 2` "Estimate"; gerçek kural `amount*10*0.05` + çarpanlar (`app/api/dealer/consumptions/route.ts:305-324`) ve `points_credited` olayları kullanılmıyor. |
| 30 | Başarılarım: toplam rozet | ÇALIŞIYOR | `route.ts:338-340`, `page.tsx:599-608` | Gerçek `userBadge.count`. |
| 31 | Başarılarım: son rozetler listesi | SAHTE | `route.ts:370`, `page.tsx:609-616` | API hep `recentBadges: []` döndürüyor → bölüm daima boş. |
| 32 | Sonraki Hedef ("100 Ziyaret") | SAHTE | `route.ts:371`, `page.tsx:619-635` | Sabit hedef; `progress` dönemlik sayım (filtre değişince "ilerleme" değişiyor); 100'ü geçince "-20 kaldı". |
| 33 | `rewards.totalRedeemed / pointsSaved` | SAHTE | `route.ts:374-375` | Daima 0, UI'da da kullanılmıyor (ölü alan). |
| 34 | Üyelik tarihi (`memberSince`) | EKSİK | `route.ts:354` | API döndürüyor, UI göstermiyor. |
| 35 | Çok dillilik (TR/EN) | KISMİ | `messages/en.json:1778-1791`, `page.tsx:245-632`, `route.ts:163,190,238,301,343,371,376` | Yalnız başlık/filtre/linkler çevrili; tüm kart başlıkları, birimler ve API etiketleri TR sabit. EN kullanıcı karışık dil görür. |
| 36 | Giriş animasyonları + azaltılmış hareket | ÇALIŞIYOR | `page.tsx:173,273-277`, `components/providers.tsx:232` | Global `MotionConfig reducedMotion="user"` dönüşümleri kapatıyor. |
| 37 | Dışa aktarma / paylaşma | EKSİK | `page.tsx:22` (`Download` import edilmiş, kullanılmıyor) | Kardeş `spending-overview` sayfasında var. |
| 38 | Mobil yerleşim | KISMİ | `page.tsx:185-199,242,450` | Başlık/filtre iyi uyarlanmış (min-h-11); saatlik ızgara ve VIP kartındaki yatay 3'lü flex dar ekranda sıkışıyor. |
| 39 | Grafik erişilebilirliği | EKSİK | `page.tsx:428-431,455-461` | Çubuk/hücrelerde `role`, `aria-label`, görünür değer yok; bilgi yalnız renk/yükseklikte. |
| 40 | Önbellek / sorgu verimliliği | KISMİ | `route.ts:57-153,317-340` | `PRIVATE_NO_STORE`, Redis yok; JS'te gruplama; 5 ardışık tur. |

**Durum dağılımı:** ÇALIŞIYOR 10 · KISMİ 17 · BOZUK 4 · SAHTE 6 · EKSİK 3 (toplam 40)

---

## Bulgular

### 1. [YÜKSEK] Veri doğruluğu — Saatlik/haftalık/aylık desenler sunucu UTC saatine göre hesaplanıyor; sabah ziyaretleri tamamen kayboluyor
- **Kanıt:** `app/api/customer/analytics/route.ts:182` (`getDay()`), `:203` (`getHours()`), `:207-212` (yalnız 8–21), `:301` (`toLocaleDateString` saat dilimsiz). Projede `TZ` ayarı yok (`.env` içinde `TZ=` 0 eşleşme; `next.config`/`vercel.json`'da da yok). Proje başka yerde doğru deseni biliyor: `lib/surprise-badges.ts:120` (`AT TIME ZONE 'Europe/Istanbul'`), `lib/timezone.ts:44`.
- **Sorun:** Vercel fonksiyonları UTC çalışır. TR 08:00–10:59 arası (kahve saati — ürünün çekirdek kullanımı) UTC 05–07'ye düşer ve 8–21 filtresi yüzünden hiç sayılmaz; TR 22:00–23:59 ise "19–20" olarak görünür. Gece yarısı–03:00 arası tüketimler önceki güne yazılır. "En yoğun saatin" sistematik olarak 3 saat kaymış ve sabahçı kullanıcıda boş görünür.
- **Öneri:** Gruplamayı veritabanına taşı ve kullanıcının saat dilimiyle yap: `EXTRACT(HOUR FROM "createdAt" AT TIME ZONE $tz)`, `EXTRACT(ISODOW ...)`, `date_trunc('month', "createdAt" AT TIME ZONE $tz)`. `tz` kullanıcı profilinden/istemciden (`Intl.DateTimeFormat().resolvedOptions().timeZone`) gelsin, beyaz listeyle doğrulansın, varsayılan `Europe/Istanbul`. Saat eksenini 0–23 tam gün yap (veya 06–02 "hizmet günü" penceresi) — veri sessizce düşürülmesin. Aynı hata `app/api/customer/trends/route.ts:243,256`'da da var; ortak bir `lib/time-buckets.ts` yardımcıyla ikisini birden düzelt.
- **Efor:** M

### 2. [YÜKSEK] Veri doğruluğu — Aylık trend tablosu en yeni değil en ESKİ 4 ayı gösteriyor ve farklı yılların aynı ayını birleştiriyor
- **Kanıt:** `route.ts:78` (`orderBy: { createdAt: 'desc' }`), `:299-308` (Map ekleme sırası = yeniden eskiye), `:310-312` (`.slice(-4)` = son eklenen = en eski), `:301` (`{ month: 'short' }` — yıl yok).
- **Sorun:** 365 gün seçildiğinde kullanıcı "Aylık Trend" altında 9–12 ay öncesini görür; Ekim 2025 ile Ekim 2026 tek "Eki" satırında toplanır. 90 günde bile 4 aylık pencerede sınırdaki ay kısmi olduğu hâlde tam ay gibi sunulur. Spotify Wrapped benzeri "yıl özeti" beklentisinde bu en görünür hatadır.
- **Öneri:** Sunucuda takvimden `YYYY-MM` anahtarlı, boş ayları sıfırla dolduran sabit seri üret (desen zaten `app/api/customer/spending-overview/route.ts:80-90`'da var: `to_char(date_trunc('month', ...), 'YYYY-MM')` + `monthRange`). Etiketi istemcide `Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' })` ile oluştur. Tabloyu yerine 12 aylık mini sütun grafik + seçili ay detay çekmecesine çevir.
- **Efor:** S

### 3. [YÜKSEK] Sahte veri — "Sonraki Ödül", "Tahmini bekleme", aylık "Puan", "Sonraki Hedef", "son rozetler" gerçek veri gibi sunulan sabit/uydurma değerler
- **Kanıt:** `route.ts:376` (`'Ücretsiz Kahve'`, `1000 - user.points`), `:280-282` (bekleme formülü), `:306` (`amount * 2 // Estimate`), `:371` (`'100 Ziyaret'`, `progress: totalConsumptions` — dönemlik), `:370` (`recentBadges: []`), `:374-375` (sıfırlar).
- **Sorun:** Kullanıcıya her işletmede geçerliymiş gibi "Ücretsiz Kahve" vaat ediliyor (böyle bir ödül kataloğda olmayabilir) — ödül/sadakat ürününde güven kırıcı ve potansiyel olarak yanıltıcı ticari beyan. "Tahmini bekleme" kullanıcının kendi ziyaret sayısından türüyor; sık gittiğin şubede bekleme "daha uzun" çıkıyor — hem yanlış hem işletme aleyhine. Aylık puan, gerçek puan kuralıyla (`app/api/dealer/consumptions/route.ts:305-324`: `amount*10` tavanlı × 0,05 × çarpanlar) ~4× uyumsuz. "100 Ziyaret" ilerlemesi dönem filtresiyle değişiyor ve 100'ü aşınca "-N kaldı" yazıyor (`page.tsx:632`). Proje hafızasındaki "sahte veri göstermiyoruz" ilkesiyle (`page.tsx:134-135` yorumu) çelişiyor.
- **Öneri:**
  - Sonraki ödül: `prisma.reward.findFirst({ where: { isActive: true, cost: { gt: user.points }, OR:[{stock:-1},{stock:{gt:0}}] }, orderBy: { cost: 'asc' } })` + "şu an alabileceğin ödüller" sayısı (`cost <= points`), karttan `/customer/rewards`'a derin link. `totalRedeemed` = `userReward.count`.
  - Aylık puan: `points_credited` olaylarını `date_trunc('month')` ile SQL'de topla (`SUM((data->>'points')::int)`), böylece kaynak tek (puan ekonomisi değişmezleriyle uyumlu).
  - Bekleme: gerçek bir bekleme sinyali (sipariş→servis zaman damgası) yoksa ALANI KALDIR. Yerine "bu şubede verdiğin ortalama puan vs. tüm müşterilerin ortalaması" gibi doğrulanabilir bir karşılaştırma koy.
  - Sonraki hedef: rozet motorundaki (`lib/achievements.ts` / `lib/activity-badges.ts`) en yakın kilitli rozetin ömür boyu ilerlemesi; son rozetler: `userBadge.findMany({ orderBy:{ earnedAt:'desc' }, take:3, include:{ badge } })`.
- **Efor:** M

### 4. [YÜKSEK] UX/Durum yönetimi — Hata "veri yok" diye gizleniyor; gerçek boş durum hiç görünmüyor ve grafikler NaN ile çiziliyor
- **Kanıt:** `page.tsx:131-142` (başarısızlıkta `setAnalytics(null)`), `:156-165` (null → "Henüz analiz verisi yok"); `route.ts:345-380` (sıfır tüketimde de `success:true`); `page.tsx:167-168` + `:430` (`0/0` → `height: NaN%`), `:458` (`rgba(...,NaN)`), `:468` (0 ziyarette "En yoğun saat: 8:00").
- **Sorun:** Ağ/500 hatasında kullanıcı "henüz verin yok" sanıyor (toast kaybolunca bağlam kalmıyor), yeniden deneme yok. Yeni kullanıcıda ise tam tersi: boş kartlar, sıfır çubuklar, anlamsız "en yoğun saat", başlıksız boş tablo. Duolingo/Monzo'da ilk oturum boş durumu yönlendirici ve eyleme çağıran bir an olarak tasarlanır.
- **Öneri:** Üç ayrı durum: `error` (açıklama + "Tekrar dene" + destek linki), `empty` (`summary.totalConsumptions === 0` → "İlk QR'ını okut" CTA'sı `/customer/scan`'e, örnek önizleme bulanık), `partial` (kart bazında: kategori/ürün/şube boşsa kart içi mikro boş durum). Grafik bileşenleri `max = Math.max(1, ...)` ile korunmalı. Hata durumunda önceki veriyi koru (stale-while-error).
- **Efor:** S

### 5. [ORTA] Yarış koşulu + kaba yükleme — dönem değişimi/yenile istekleri iptal edilmiyor, tüm sayfa spinner'a dönüyor
- **Kanıt:** `page.tsx:121-123` (her `period` değişiminde fetch, iptal yok), `:125-146`, `:148-154` (`loading` true → tüm içerik söküluyor), `:197` (yenile butonunda meşgul durumu yok).
- **Sorun:** 7→365→30 hızlı geçişte yavaş 365 yanıtı en son gelip 30 seçiliyken ekrana yazılabilir (seçici "30" der, veri 365'tir). Her değişimde layout tamamen çöküp yeniden kuruluyor, giriş animasyonları baştan oynuyor (titrek his).
- **Öneri:** SWR/React Query'ye geç (`useSWR(['/api/customer/analytics', period], { keepPreviousData: true })`) veya `AbortController` + istek sırası kimliği. İlk yükte kart iskeletleri, sonraki yüklemelerde içerik yerinde kalsın, üstte ince ilerleme çubuğu + kartlarda `opacity-60`. Dönemi `?period=` URL parametresinde tut (`useSearchParams`) — paylaşılabilir, geri tuşuyla uyumlu.
- **Efor:** S

### 6. [ORTA] Performans/Mimari — Uç, binlerce satırı belleğe çekip JS'te gruplıyor; önbellek ve rate-limit yok
- **Kanıt:** `route.ts:12,57-80` (8.000 tüketim + ürün/kategori/bayi join'i), `:90-101` (8.000 id'lik `IN` listesiyle review sorgusu), `:139-153` (iki adet 20.000 satıra kadar `AnalyticsEvent.data` JSON çekimi sadece toplamak için), `:108,317,328,338` (ardışık ek turlar). `proxy.ts`'de rate-limit yok (grep 0 eşleşme). Daha iyi desen kardeş uçta: `app/api/customer/spending-overview/route.ts:46-50,82-88` (`groupBy` + `$queryRaw`).
- **Sorun:** Aktif bir kullanıcıda tek istek onlarca MB satır taşıyıp Neon'a 5 tur yapıyor; yenile butonu sınırsız tıklanabilir. Proje hafızasında belirtilen Neon bağlantı havuzu sınırı düşünüldüğünde bu uç havuzu tıkayabilir. Dağılımların "en güncel 8.000 örneklem" üzerinden hesaplanması büyük hesaplarda toplamla örtüşmeyen yüzdeler üretir.
- **Öneri:** Tek bir CTE/`$queryRaw` ile: dönem toplamları, kategori `GROUP BY`, `ISODOW`/saat `GROUP BY` (saat dilimiyle, bkz. #1), top-5 ürün, top-5 şube + `AVG(r.rating)` (`LEFT JOIN "ConsumptionReview"`), aylık seri; puanlar için `SUM((data->>'points')::int)` (mevcut `@@index([userId, event, createdAt])` — `schema.prisma:1043` — bunu destekliyor). Kalan bağımsız sorgular (streak, VIP, rozet, sonraki ödül) tek `Promise.all`'da. Sonucu Upstash'te `analytics:{userId}:{period}:{tz}` anahtarıyla 5–10 dk önbellekle; tüketim/puan yazımında etiketle geçersiz kıl. Uç bazlı hafif rate-limit (ör. 20/dk).
- **Efor:** M

### 7. [ORTA] Veri anlamı — "Toplam Puan" kartı bakiye ile dönem büyümesini karıştırıyor; büyüme yüzdeleri sıfır tabanda yanıltıcı
- **Kanıt:** `route.ts:349` (`totalPoints: user.points` — anlık bakiye), `:156-158` (rozet: dönemde kazanılan puan büyümesi, önceki 0 ise `100`), `:121-123` (tüketim büyümesi önceki 0 ise `0`); `page.tsx:258-264,285-289`.
- **Sorun:** Puan harcayan kullanıcıda "Toplam Puan 120 · +340%" gibi çelişkili bir kart oluşur. Sıfır tabandan büyüme bir kartta "+100%", diğerinde "0%" — aynı durum iki farklı biçimde.
- **Öneri:** KPI'ları netleştir: "Bu dönem kazanılan puan" (dönem toplamı + önceki döneme göre Δ) ve ayrı küçük "Mevcut bakiye" satırı. Önceki dönem 0 ise yüzde yerine "Yeni" etiketi. Δ rozetine erişilebilir metin ("önceki 30 güne göre %12 artış").
- **Efor:** S

### 8. [ORTA] i18n — Sayfanın ~%85'i ve API etiketlerinin tamamı sabit Türkçe
- **Kanıt:** `messages/en.json:1778-1791` yalnız 13 anahtar; `page.tsx:245,252,259,266-267,311,314,318,334,338-339,360,385,402,420-422,445-447,460,468,481,496,514-517,529,533-534,537-538,545,558,566-569,594,605-606,620,632` sabit TR; `route.ts:163,190,238,301,343,371,376` TR veri etiketi; `page.tsx:253,260` `toLocaleString()` locale'siz, `:314` `toFixed(2)`.
- **Sorun:** EN arayüzlü kullanıcı İngilizce başlık altında Türkçe kartlar görür; para/sayı biçimi tarayıcı varsayılanına göre değişir (₺1,234.5 vs ₺1.234,5).
- **Öneri:** API yalnız anahtar/sayı döndürsün (`dayIndex`, `monthKey: '2026-09'`, `category: null`), etiketleri istemci `useAppLocale` ile üretsin. Tüm metinleri `customerAnalytics.*` altına taşı; para için `Intl.NumberFormat(locale, { style:'currency', currency:'TRY' })` ortak yardımcı.
- **Efor:** S

### 9. [ORTA] Erişilebilirlik/Mobil — Grafikler ekran okuyucuya ve dokunmatiğe kapalı; saatlik ızgara taşıyor
- **Kanıt:** `page.tsx:428-431` (çubuklarda değer/aria yok), `:455-461` (yalnız `title` tooltip — dokunmatik ve klavyede yok), `:450` (`grid-cols-11` ama `route.ts:207-212` 14 hücre üretiyor → 11+3 iki satır), `:458` (tema dışı sabit `rgba(139,92,246)`; koyu/açık temada kontrast kontrolsüz), `:306-321` (VIP kartında avatar + metin + sağ blok dar ekranda sıkışıyor). `components/ui/progress.tsx:15-31` `value`'yu Radix Root'a geçirmiyor → `aria-valuenow` yok (paylaşılan bileşen).
- **Sorun:** Grafik bilgisinin tamamı görsel; ekran okuyucu kullanıcı için haftalık/saatlik bölüm boş. Mobilde ısı haritası kırık ızgara olarak görünür.
- **Öneri:** Grafikleri `role="img"` + özet `aria-label` ("En yoğun gün Cumartesi, 12 ziyaret") veya gizli veri tablosu ile sun; dokunmatikte seçili çubuk için alt bilgi satırı. Isı haritası: 24 hücreli `grid-cols-12` iki satır (gece/gündüz) veya yatay kaydırmalı; renk `hsl(var(--primary) / α)` tokenından. `Progress` bileşeni `value`'yu Root'a iletsin (sistem geneli düzeltme).
- **Efor:** S

### 10. [DÜŞÜK] Tutarsızlık — Şube karşılaştırması ve favori işletmeler aynı veriyi iki kez, farklı kurallarla gösteriyor
- **Kanıt:** `route.ts:262-272` (favori top 3) ve `:278-296` (şube top 5) aynı `dealerMap`'ten; `page.tsx:497-500` (puan yoksa yıldızlı "0") vs `:534` ("Yeterli veri yok"); `:521,545` ("en az iki şube" metni ama koşul `> 0`); `page.tsx:487` `key={dealer.name}`; `route.ts:237-238` "unknown/Bilinmeyen" grubu listeye girebiliyor.
- **Sorun:** Kullanıcı aynı işletmeyi iki kartta iki farklı puanla (0 vs "veri yok") görür; bilgi tekrarı sayfayı uzatır.
- **Öneri:** Tek "İşletmelerin" bileşeni: ziyaret sırasıyla liste, her satırda logo, ziyaret sayısı, verdiğin ortalama puan (yoksa "Henüz puanlamadın → Puanla" aksiyonu), son ziyaret tarihi, işletme sayfasına link. Bekleme alanı kaldırılır (#3).
- **Efor:** S

### 11. [DÜŞÜK] Ölü kod / tip hijyeni
- **Kanıt:** `page.tsx:9,14,15,17,20,22,27` (`TrendingDown`, `Target`, `Zap`, `Activity`, `ArrowDownRight`, `Download`, `Utensils` kullanılmıyor); `:364,389` kullanılmayan `index`; `:55,64,104-112` (`memberSince`, `spendingTrend`, `totalRedeemed`, `pointsSaved` tipte var, UI'da yok); `:121-123` `useEffect` bağımlılığında `fetchAnalytics` eksik; `route.ts:321,333` boş `catch` (gerçek DB hatasını da yutuyor).
- **Öneri:** Kullanılmayanları kaldır; yanıt tipini `lib/types/customer-analytics.ts`'de paylaşılan (API+UI) bir zod şeması olarak tanımla; boş `catch` yerine loglu fallback.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Anlatı ve içgörü katmanı (Spotify Wrapped / Monzo Trends):** Ham tablo yerine 2–3 cümlelik kişisel içgörü — "Bu ay Cumartesi sabahları kahveci oldun; geçen aya göre %20 daha az harcadın". Mevcut `/api/customer/ai-insights` ile bağlanabilir.
2. **Hedef ve sonraki adım (Starbucks Rewards):** Gerçek ödül kataloğundan "bir sonraki ödüle X puan / ~N ziyaret" tahmini ve tek dokunuşla ödüle git; şu an kullanılabilir ödül sayısı rozeti.
3. **Kıyas/benchmark (Revolut):** "Şehrindeki müşterilerin %X'inden daha sadıksın", "en çok gittiğin 3 işletmede ilk %10'dasın" — anonim, toplu, k-anonimlik eşikli.
4. **Dönem karşılaştırma ve detaya inme:** Grafiğe dokununca o gün/saat/ay için tüketim listesine filtreli geçiş (`/customer/consumptions?from=&to=&dealer=`); "önceki dönemle karşılaştır" katmanı.
5. **Paylaşılabilir özet kartı:** Haftalık/aylık mini "Wrapped" kartını görsel olarak paylaşma (Web Share API, OG görseli) — referral döngüsüne bağlanır.
6. **Seri/alışkanlık koçluğu (Duolingo):** Seri kartında seri dondurma hakkı (`UserStreak.streakFreezes`, `schema.prisma:1767`), en uzun seri (`longestStreak`) ve "seriyi korumak için bugün bir QR okut" hatırlatması.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Benim Qratex hikâyem" — açıldığında 3 saniyede şu üç soruyu cevaplayan bir ekran: *Bu dönem ne kadar aktiftim? (ve öncekine göre)*, *Alışkanlığım ne?*, *Bir sonraki ödüle ne kadar kaldı ve şimdi ne yapmalıyım?* Analiz bir son değil, bir sonraki eyleme köprü.

**Yerleşim (mobil-öncelikli, tek sütun → md'de 12'lik ızgara):**
1. **Hero şerit:** dönem seçici (segment kontrol, URL'de) + tek cümlelik anlatı başlığı ("Son 30 günde 14 ziyaret, %18 artış") + büyük sayı animasyonu.
2. **Ödül ilerleme halkası:** gerçek sonraki ödül, kalan puan, "~3 ziyaret daha" tahmini, CTA → `/customer/rewards`. VIP seviyesi halkanın etrafında ince ikinci halka.
3. **KPI şeridi (yatay kaydırmalı kartlar):** ziyaret, kayıtlı harcama (açıklamalı), kazanılan puan, seri (dondurma hakkıyla).
4. **Alışkanlık kartı:** 7×24 tek ısı haritası (gün × saat, kullanıcı saat dilimi) — haftalık ve saatlik iki ayrı kartın yerine; altta otomatik içgörü cümlesi.
5. **Zevk profili:** kategori halka grafiği + top ürünler (ürün görseliyle), ürüne dokununca o ürünün tüketim geçmişi.
6. **İşletmelerin:** birleşik liste (#10), puanlamadığın ziyaretler için "Puanla, +N puan" aksiyonu (ConsumptionReview → karakter rozeti ilerlemesine bağlanır).
7. **12 aylık trend:** mini sütun grafik, ay seçince detay çekmecesi (Sheet).
8. **Başarılar:** son 3 rozet + en yakın kilitli rozetin ilerlemesi → `/customer/badges`.

**Motion / 3D (ölçülü):** 3D gereksiz; bu bir okuma ekranı. framer-motion ile yalnızca: hero sayısında `useSpring` sayaç (bir kez), ödül halkasının stroke çizimi (600 ms), kartların ilk yüklemede 40 ms kademeli girişi — filtre değişiminde yeniden oynamasın (`initial={false}` sonrası). Global `reducedMotion="user"` zaten var; sayaç da azaltılmış harekette anında son değeri göstermeli. Konfeti vb. yalnız ödüle ulaşıldığı anda, bu sayfada değil ödül akışında.

**Veri/API değişiklikleri:**
- `GET /api/customer/analytics?period=30&tz=Europe/Istanbul` → tek `$queryRaw` CTE (toplamlar, 7×24 matris, kategori, top ürün, şube+ortalama puan, 12 ay serisi, dönem puan toplamı) + paralel küçük sorgular (streak, VIP, rozetler, sonraki ödül, kullanılabilir ödül sayısı).
- Yanıt yalnız anahtar+sayı (i18n istemcide), paylaşılan zod şeması.
- Upstash önbellek (5–10 dk, kullanıcı+dönem+tz anahtarı), tüketim/puan yazımında geçersiz kılma; uç başına rate-limit.
- İstemci: SWR `keepPreviousData`, iskeletler, kart bazlı hata sınırları.

---

## Çakışmalar / birleştirme önerisi

Sidebar'daki "Analizler" grubunda (`components/dashboard/sidebar.tsx:285-290`) ve "Kartım" grubunda aynı veriyi farklı açılardan gösteren **beş** sayfa var:

| Sayfa | Örtüşen içerik |
|---|---|
| `/customer/spending-overview` | Toplam ziyaret/kayıtlı harcama, top işletmeler, aylık seri — bu sayfanın KPI + favori işletme + aylık trend bölümlerinin daha doğru (groupBy, YYYY-MM) sürümü. |
| `/customer/my-year` | Yıllık özet (top işletme, rozet, puan kazanılan/harcanan, seri) — 365 gün filtresinin "Wrapped" karşılığı. |
| `/customer/progress-hub` | Seviye/puan/XP ilerlemesi — bu sayfadaki VIP/sonraki hedef kartlarıyla örtüşüyor. |
| `/customer/journey-score` | Zaman çizelgesi + skor — alışkanlık/anlatı katmanıyla örtüşüyor. |
| `/customer/trends` | Gün/saat dağılımı (feedback bazlı, aynı UTC hatası `route.ts:243,256`). |

**Öneri:** `/customer/analytics`, `/customer/spending-overview` ve `/customer/my-year` tek bir **"İçgörülerim"** sayfasında sekmeli/dönemli görünüm olarak birleşsin (Dönem: 7g/30g/90g/Yıl → "Yıl" seçildiğinde Wrapped hikâye modu açılır). `progress-hub` ilerleme halkası bu sayfanın hero'suna gömülür, ayrı sayfa olarak sadece oyunlaştırma merkezine (rozet/lig) bağlanır. Eski rotalar yeni sayfaya `?period=` ile yönlendirilsin (`next.config` redirects); `lib/visibility-controls.ts:91` ve `lib/qra-knowledge-base.ts:36` kayıtları güncellensin. Böylece tek, doğru, önbellekli bir analitik ucu kalır ve aynı sayının farklı sayfalarda farklı çıkması (bu sayfada ilk 8.000 örneklem, spending-overview'da tam groupBy) sona erer.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı; kod çalıştırılmadı, veritabanına dokunulmadı. Her iddia çürütülmeye çalışıldı.

### 1. Saatlik/haftalık/aylık gruplama UTC ile yapılıyor — **DOĞRULANDI**
- `app/api/customer/analytics/route.ts:182` `getDay()`, `:203` ve `:246` `getHours()`, `:301` `toLocaleDateString(... { month: 'short' })` — hiçbirine `timeZone` verilmiyor; süreç TZ'si kullanılıyor.
- Projenin kendi standardı backend'in UTC çalıştığını yazıyor: `lib/timezone.ts:1-4` ("backend UTC"). Repo'da `TZ` ayarı yok (`vercel.json`, `next.config.*`, `.env*` tarandı); Vercel fonksiyonlarında `TZ` zaten ayrılmış değişken, UTC sabit.
- `lib/timezone.ts` içinde Europe/Istanbul dönüşümü mevcut ama bu uç onu kullanmıyor.
- **Yeniden üretim:** TR saatiyle 09:30'da okutulan tüketim → UTC 06:30 → `hourlyMap` anahtarı 6 → `:207-212` yalnız 8..21 üretiyor → saatlik ısı haritasında hiç görünmüyor. TR 22:30 tüketimi "19" sütununa yazılıyor. TR Pazartesi 01:00 tüketimi UTC Pazar 22:00 → haftalık grafikte "Paz". Ayın 1'i TR 01:00 tüketimi önceki aya yazılıyor.
- Ek not: `page.tsx:450` `grid-cols-11` ama 14 saat hücresi var (8..21) → son 3 hücre ikinci satıra taşıyor.

### 2. Aylık trend en eski 4 ayı gösteriyor ve yılları birleştiriyor — **DOĞRULANDI**
- `route.ts:78` `orderBy: { createdAt: 'desc' }` → `:300-308` Map ekleme sırası yeniden eskiye → `:312` `.slice(-4)` Map'in SON 4 girişini, yani EN ESKİ 4 ayı alıyor. Tablo satırları da ters sırada: dönemin en eski 4 ayı, yeniden eskiye doğru listeleniyor.
- Anahtar yılsız (`{ month: 'short' }`).
- **Yeniden üretim (bugün 2026-10-08, dönem=365):** başlangıç 2025-10-08. Ekleme sırası Eki(2026+2025 birleşik), Eyl, Ağu, … Ara, Kas → 12 anahtar; `.slice(-4)` = Şub, Oca, Ara, Kas → kullanıcı 8–11 ay öncesini "Aylık Trend" diye görüyor; Ekim satırı iki yılın toplamı. 90 günde 4 ay olduğundan kesme olmuyor, sadece sıra ters.

### 3. Sahte ödül vaadi ve uydurma metrikler — **DOĞRULANDI**
- `route.ts:376` `nextReward: { name: 'Ücretsiz Kahve', pointsNeeded: Math.max(0, 1000 - user.points) }` — sabit kod; ödül kataloğuna (Reward/işletme) hiçbir sorgu yok. 1000+ puanlı kullanıcıya "0 puan gerekli" + %100 dolu çubukla var olmayan bir kahve sunuluyor (`page.tsx:334-344`).
- `route.ts:280-282` `estimatedWaitMinutes = 6 + loadFactor*8 + peakHourVisits*1.5` — yalnız kullanıcının KENDİ ziyaret sayısından türetiliyor; kullanıcı bir şubeye ne kadar çok giderse "bekleme" o kadar uzun görünüyor. `page.tsx:516-538` bunu "Tahmini bekleme" diye, gerçek bir ölçümmüş gibi sunuyor.
- `route.ts:306` `points = amount * 2 // Estimate`; gerçek kural `app/api/dealer/consumptions/route.ts:303-325`: `floor(min(amount*10, 1000) * 0.05 * çarpanlar)` ≈ `amount * 0.5` (tavan 50). Yani 100 ₺'lik tüketim tabloda "+200" puan, gerçekte ~50 → ~4×. 100 ₺ üstü tutarlarda tavan nedeniyle sapma daha da büyür. Aynı yanıtta `pointsThisPeriod` gerçek `points_credited` toplamı hesaplanıyor (`:140-155`) ama aylık tabloda kullanılmıyor.
- `route.ts:371` hedef dönemlik `totalConsumptions`; 100'ü geçince `page.tsx:632` "-N kaldı" yazıyor ve `Progress` değeri %100'ü aşıyor. Dönem değişince "100 Ziyaret" ilerlemesi de değişiyor (ömür boyu hedef değil).
- Ek: `:374-375` `totalRedeemed: 0, pointsSaved: 0` da sabit (UI'da şu an gösterilmiyor).

### 4. API hatası boş durumla gizleniyor; sıfır veride NaN — **DOĞRULANDI (kısmen; ayrıntılar düzeltildi, şiddet orta)**
- Hata yolu: `page.tsx:131-142` hata/ağ hatasında `analytics=null` → `:156-165` "Henüz analiz verisi yok" metni. Ancak iddiadaki "gizleniyor" tam doğru değil: `toast.error(tc('customerAnalytics.loadError'))` gösteriliyor (anahtar `messages/tr.json` ve `en.json`'da mevcut). Gerçek sorun: kalıcı ekran yanlış bir anlatı veriyor (hata yerine "veri yok") ve erken dönüş nedeniyle başlıktaki yenile düğmesi (`:197`) ve dönem seçici render edilmiyor → sayfayı yenilemeden yeniden deneme yolu yok.
- Yeni kullanıcı: API `success:true` + sıfır dizilerle dönüyor (`route.ts:345-380`), dolayısıyla boş durum hiç tetiklenmiyor — doğru.
- `page.tsx:167-168` max=0 → `:430` `height: "NaN%"` ve `:458` `rgba(..., NaN)`; tarayıcı geçersiz değeri atar, `minHeight: 4px` kalır, ısı hücreleri renksiz görünür. Çökme yok, görsel olarak "boş" görünüyor; şiddet düşük.
- **Düzeltme:** 0 ziyarette "En yoğun saat: 8:00" DEĞİL, **"21:00"** görünür — `:468` `reduce((a,b) => a.visits > b.visits ? a : b)` eşitlikte her zaman `b`'yi seçer, son eleman 21'dir. Sonuç yine yanıltıcı (hiç ziyaret yokken bir "en yoğun saat" iddiası).
- Ayrıca sıfır veride `Progress` (`:342`) `0/(0+1000)` = 0, sorun yok; ama `favoriteDealers`, `topProducts`, `categoryBreakdown` boş listeler başlıklı ama içeriksiz kartlar olarak kalıyor.

**Özet:** 4 iddianın 4'ü de özünde gerçek. 1–3 kullanıcıya doğrudan yanlış veri/vaat gösteriyor (yüksek); 4 doğru ama iddiadaki "8:00" ayrıntısı yanlış (gerçekte 21:00) ve hata durumunda toast olduğundan "tamamen gizleniyor" ifadesi abartılı (orta).
