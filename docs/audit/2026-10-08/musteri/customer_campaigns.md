# /customer/campaigns

**Amaç** · Müşteriye işletmelerin "mutlu saat" (HappyHour) puan çarpanı kampanyalarını (şu an aktif + yaklaşan) göstermek ve arkadaş davet (referral) akışına yönlendirmek. Layout metadata'sı sayfayı "Aktif kampanyalar, davet bağlantıları ve katılım durumu" olarak tanımlıyor (`messages/tr.json:56`).

**Genel puan: 3/10** · **Karar: yeniden inşa** (tek bir "Fırsatlar" merkezine birleştirilerek; bkz. son bölüm)

> Özet: Sayfanın ana işlevi olan kampanya listesi **üretimde her zaman boş** görünüyor. Sayfa, API'nin hiç döndürmediği bir alanı (`data.happyHours`) okuyor. Buna ek olarak, sayfanın beslendiği `/api/happy-hour` ucunda **sınırsız puan basmaya izin veren** bir doğrulama açığı ve müşteriye "2x puan" diye gösterilen ama hiç uygulanmayan global kampanya vaadi var. Sayfada fiilen çalışan tek parça "Davet Et" kartı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 1/10 | Veri sözleşmesi uyumsuz olduğu için kampanya listesi hiçbir koşulda dolmuyor; yalnızca davet linki çalışıyor. |
| UX | 3/10 | Kullanıcı her zaman "Şu an aktif kampanya bulunmuyor" görüyor; geri sayım, işletmeye git, katıl, bildirim gibi hiçbir eylem yok. |
| Görsel | 5/10 | Ortak `DashboardPageHero` ve kart dili tutarlı, ancak sabit kodlu sarı/turuncu gradyanlar ve sonsuz `animate-pulse` sayfayı ucuzlatıyor. |
| Mimari | 3/10 | İstemci tek bir uca bağlı ama yanlış şekli bekliyor; API'de `any`, sunucu yerel saati ile UTC karışık, tip paylaşımı yok, doğrulama yok. |
| Performans | 6/10 | Tek istek, hafif bileşen; fakat SSR yok, tam sayfa spinner, sunucu tarafında 400 satırı belleğe alıp JS'de filtreleme var. |
| Erişilebilirlik + Mobil | 5/10 | Mobilde düzgün yığılıyor ve CTA 40px; ancak yükleme `aria-live` değil, dekoratif ikonların çoğu `aria-hidden` değil, `animate-pulse` azaltılmış hareketi yok sayıyor, gün adları EN dilde Türkçe kalıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (başlık/açıklama) | ÇALIŞIYOR | `app/customer/campaigns/layout.tsx:4-6` | Açıklama "katılım durumu" vaat ediyor; sayfada böyle bir şey yok (bkz. #22). |
| 2 | Kampanya verisi çekme (`GET /api/happy-hour`) | **BOZUK** | `page.tsx:48-51` ↔ `app/api/happy-hour/route.ts:94-101` | Sayfa `data.happyHours` okuyor; müşteri yolu `activeNow`, `upcoming`, `bestMultiplier` döndürüyor. `happyHours` yalnızca `list=1` + DEALER/ADMIN yolunda var (`route.ts:17-24`). Sonuç: `campaigns` her zaman `[]`. |
| 3 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:63-70` | Tam ekran spinner; iskelet (skeleton) yok, `aria-live`/`role="status"` yok. |
| 4 | Hata durumu | KISMİ | `page.tsx:53-55` | Yalnızca ağ/JSON hatasında toast. HTTP 500'de `{error}` döner, `data.success` false olur ve **sessizce boş durum** gösterilir. Sayfa içi hata/yeniden dene kartı yok. |
| 5 | Hata toast metni | KISMİ | `lib/admin-toast.ts` (`formatWithPrefix('Dikkat: ', …)`) | Müşteri sayfası admin toast'ını kullanıyor; EN dilde "Dikkat: Failed to load campaigns" gibi dil karışıklığı oluşuyor. |
| 6 | Hero (eyebrow/başlık/açıklama/ikon) | ÇALIŞIYOR | `page.tsx:74-80` | Eyebrow "Müşteri alanı" bilgi taşımıyor. |
| 7 | Bilgi şeridi (`role="note"`) | ÇALIŞIYOR | `page.tsx:82-88` | Metin "liste yaklaşık bilgi sunar" diyerek kendi verisinin güvenilirliğini sorguluyor; bu, saat dilimi hatasının (#24) belirtisi olarak okunabilir. |
| 8 | "Şu An Aktif" bölümü | **BOZUK** | `page.tsx:60, 91` | `isActiveNow` alanı API'de hiçbir nesneye eklenmiyor (`route.ts:60-72` yalnızca filtreliyor). Bölüm teorik olarak bile render edilemez. |
| 9 | Aktif kart: ad, çarpan rozeti, işletme adı, açıklama, saat aralığı | **BOZUK** (erişilemez) | `page.tsx:104-131` | #8 nedeniyle hiç görünmüyor. |
| 10 | "Yaklaşan / Tüm Kampanyalar" listesi | **BOZUK** | `page.tsx:139-188` | `campaigns` boş olduğundan her zaman boş durum. Veri düzelse bile API "upcoming" yalnızca bugün/yarın + ilk 5 kayıt (`route.ts:75-87`), yani "Tüm Kampanyalar" etiketi yanlış. |
| 11 | Liste kartı: gün kısaltmaları | **BOZUK** | `page.tsx:36, 179` | `dayShort` Türkçe sabit kodlu (EN'de "Pzt, Sal"). `daysOfWeek` şemada `Json` (`schema.prisma:1819`); dizi olmayan bir değer gelirse `.map` çöker. Gün dizisi sıralı değil (ör. `[0,6]` → "Pzr, Cmt"). |
| 12 | Boş durum kartı | ÇALIŞIYOR ama yanıltıcı | `page.tsx:144-151` | Her kullanıcıya her zaman gösteriliyor ve "Şu an aktif kampanya bulunmuyor" diyor; aktif kampanya varken de. Eylem (keşfet, bildirim aç) yok. |
| 13 | "Arkadaşını Davet Et & Kazan" kartı + `/customer/referral` linki | ÇALIŞIYOR | `page.tsx:190-216`, `app/customer/referral/page.tsx` mevcut | Sadece statik metin + link; davet kodu, kazanılan puan, davet sayısı gösterilmiyor. Kenar çubuğunda zaten ayrı "Davet" girişi var (`components/dashboard/sidebar.tsx:306`). |
| 14 | Giriş animasyonları (stagger) | ÇALIŞIYOR | `page.tsx:98-103, 154-159` | `MotionConfig reducedMotion="user"` global olarak var (`components/providers.tsx:232`), bu kısım uyumlu. |
| 15 | Çarpan rozetinde `animate-pulse` | KISMİ | `page.tsx:113` | Sonsuz CSS animasyonu; `motion-safe:` öneki yok, azaltılmış hareket tercihini yok sayıyor. |
| 16 | Kalan süre / geri sayım | EKSİK | — | Aktif kampanyada "bitmesine 42 dk" ya da yaklaşanda "18:00'de başlıyor" yok; yalnızca ham `HH:mm` metni var. |
| 17 | Kampanyadan işletmeye geçiş (detay/QR/yol tarifi) | EKSİK | `page.tsx:117-121` | API `dealer.id` ve `dealer.image` döndürüyor (`route.ts:52-56`) ama kartta link yok, görsel kullanılmıyor. |
| 18 | Sezonluk kampanya (`SeasonalCampaign`) gösterimi | EKSİK | `schema.prisma:1833`; ayrı sayfa `app/customer/event/page.tsx:47` | "Kampanyalar" adlı sayfada sistemdeki en görünür kampanya türü yok. |
| 19 | Flaş teklifler (`DealerFlashOffer`) | EKSİK | `app/api/customer/innovation/nearby/route.ts:35` | İndirim/ikram teklifleri başka uçta; bu sayfada yok. |
| 20 | Segment kampanya bildirimi derin bağlantısı | **BOZUK** (ölü hedef) | `app/api/dealer/innovation/segment-proposals/[id]/send/route.ts:91` | Push bildirimi kullanıcıyı `/customer/campaigns`'e gönderiyor; sayfa `SegmentCampaignProposal` içeriğini hiç göstermiyor. Kullanıcı bildirime tıklayınca boş sayfa görüyor. |
| 21 | Filtre / sıralama / arama (yakınımda, favori işletmeler, çarpana göre) | EKSİK | — | |
| 22 | "Katılım durumu" (metadata vaadi) | SAHTE (vaat edilip yok) | `messages/tr.json:56` | Metadata açıklaması sayfada olmayan bir özelliği ilan ediyor. |
| 23 | Otomatik yenileme (pencere açılıp kapanınca) | EKSİK | `page.tsx:42-44` | Tek seferlik fetch; sayfa açık kalırsa "şu an aktif" bilgisi bayatlar. Odak/görünürlük değişiminde yeniden çekme yok. |
| 24 | Saat dilimi doğruluğu | **BOZUK** | `lib/happy-hour-live.ts:22-34`, `app/api/happy-hour/route.ts:27-31` | `HH:mm` puanlamada UTC olarak yorumlanıyor; müşteriye ham `HH:mm` gösteriliyor. TR (UTC+3) kullanıcısı "12:00–14:00" görüyor, çarpan fiilen 15:00–17:00'de uygulanıyor. |
| 25 | Global kampanyanın puana uygulanması | SAHTE | `app/api/dealer/consumptions/route.ts:312-319` | Yalnızca `dealerId: session.user.id` sorgulanıyor; `dealerId: null` (global) kampanyalar hiçbir zaman puana yansımıyor. Seed'deki "Hafta Sonu Çılgınlığı 2x" (`prisma/seed.ts:1407-1420`) bunun canlı örneği. |
| 26 | Modül kapatma (`customer_campaigns`) | KISMİ | `components/dashboard/sidebar.tsx:298`, `lib/module-controls.ts:20` | Modül kapatıldığında yalnızca menü gizleniyor; `proxy.ts` ve sayfada rota seviyesinde kontrol bulunamadı (grep ile; doğrudan URL erişimi açık). |
| 27 | Yetki | ÇALIŞIYOR | `route.ts:11-57` | Müşteri GET'i kimlik doğrulama istemiyor; içerik halka açık bilgi olduğu için kabul edilebilir. Müşteri `list=1` gönderse bile rol kontrolü onu engelliyor (`route.ts:17`). |
| 28 | i18n | KISMİ | `page.tsx:36`, `lib/admin-toast.ts` | Metinlerin çoğu `useAppT` ile çevriliyor; gün adları ve toast öneki sabit Türkçe. |
| 29 | Kişiselleştirme (favori işletmelerimdeki kampanyalar, bana özel çarpan, VIP) | EKSİK | — | |
| 30 | Kampanya hatırlatıcısı ("başlayınca haber ver") | EKSİK | — | Push altyapısı mevcut (`sendPushNotification`), sayfada kullanılmıyor. |

**Sayım:** ÇALIŞIYOR 7 · KISMİ 6 · BOZUK 7 · SAHTE 2 · EKSİK 8 (toplam 30)

---

## Bulgular

### 1. KRİTİK · Veri bütünlüğü/İşlevsellik · Sayfa API'nin döndürmediği bir alanı okuyor, liste hep boş
- **Kanıt:** `app/customer/campaigns/page.tsx:50-51` → `setCampaigns(data.happyHours || [])`; `app/api/happy-hour/route.ts:94-101` müşteri yanıtı `{ success, activeNow, upcoming, bestMultiplier, currentTime, currentDay }`. `happyHours` anahtarı yalnızca `route.ts:24` (DEALER/ADMIN + `list=1`) yolunda var. Ayrıca `isActiveNow` alanı (`page.tsx:32, 60`) API'de hiç üretilmiyor.
- **Sorun:** Sayfanın var olma sebebi olan kampanya listesi canlıda hiçbir kullanıcı için dolmuyor. "Şu an aktif" bölümü kod yolu olarak bile erişilemez. Kullanıcı her zaman "kampanya yok" görüyor; işletmelerin tanımladığı mutlu saatler müşteriye hiç ulaşmıyor.
- **Öneri:** İstemci ve sunucu arasında **paylaşılan bir yanıt tipi** tanımlayın (ör. `lib/contracts/customer-offers.ts`, zod şeması). Uç, kart başına `status: 'live' | 'later_today' | 'upcoming'`, `startsAt`/`endsAt` (ISO, mutlak zaman) ve `dealer` bilgisini hazır döndürsün; istemci filtreleme yapmasın. Kısa vadeli düzeltme: `activeNow` ve `upcoming` dizilerini doğrudan tüketin. Bu sözleşme için bir birim testi (yanıt şeması ↔ sayfa tipi) yazın ki aynı kayma tekrar olmasın.
- **Efor:** S (hızlı düzeltme) / M (sözleşme + test)

### 2. KRİTİK · Güvenlik/Puan ekonomisi · `POST /api/happy-hour` çarpanı doğrulamıyor, sınırsız puan basılabiliyor
- **Kanıt:** `app/api/happy-hour/route.ts:121-138`: `multiplier: multiplier || 2.0` dışında hiçbir sınır, tip veya işaret kontrolü yok; `startTime`/`endTime` biçimi ve `daysOfWeek` içeriği de doğrulanmıyor. Çarpan `app/api/dealer/consumptions/route.ts:312-324` içinde `Math.floor(baseXP * 0.05 * happyHourMultiplier)` olarak kullanılıyor ve `route.ts:340-349` ile doğrudan `user.points` artırılıyor.
- **Sorun:** Herhangi bir DEALER hesabı arayüz olmadan API'ye `multiplier: 1000000` gönderebilir; ardından kendi müşteri kartına tüketim girerek tek işlemde ~50 milyon puan basabilir (`BASE_XP_CAP=1000` tavanı çarpandan önce uygulanıyor). Negatif çarpan müşterinin puanını düşürebilir; metin çarpan Prisma hatası (500) üretir. Bu, puan ekonomisinin "her puan basma yolu sınırlı ve izlenebilir olmalı" kuralını ihlal ediyor; artış bir işlem defterine (ledger) de yazılmıyor.
- **Öneri:** zod ile katı şema: `multiplier ∈ [1, 3]` (platform ayarından okunan tavan), `HH:mm` regex, `daysOfWeek ⊆ {0..6}` ve tekil, `validUntil > validFrom`, isim/açıklama uzunluk sınırları. Ayrıca puan tarafında **savunma derinliği**: `consumptions` içinde `happyHourMultiplier = clamp(…, 1, MAX)` ve pasif puana mutlak üst sınır. Global kampanya oluşturma (`dealerId: null`) yalnızca ADMIN'e kalsın (zaten öyle) ama ADMIN için de onay/denetim kaydı tutulsun. Puan artışını mevcut ekonomi deseniyle (atomik, kayıt bırakan işlem) yapın.
- **Efor:** S (doğrulama + clamp) / M (ledger + denetim kaydı)

### 3. YÜKSEK · Veri bütünlüğü/Güven · Global "2x puan" kampanyaları müşteriye gösteriliyor ama puana hiç uygulanmıyor
- **Kanıt:** `app/api/dealer/consumptions/route.ts:312-315` yalnızca `where: { dealerId: session.user.id, isActive: true }` sorguluyor; `dealerId: null` kayıtlar dışarıda kalıyor. Aynı global kayıtlar `app/api/happy-hour/route.ts:34-57` ve `app/api/customer/discovery/route.ts:416-468` ile müşteriye "canlı" olarak sunuluyor. Seed örneği: `prisma/seed.ts:1407-1420` ("Hafta sonu tüm gün 2x puan!").
- **Sorun:** Müşteriye verilen vaat yerine getirilmiyor. Ek olarak çarpan yalnızca tüketimden gelen pasif puanın %5'ine uygulanıyor (`route.ts:324`); geri bildirim/QR puanı etkilenmiyor. "2x Puan" rozeti (`page.tsx:113-115`) kullanıcıda "her şey iki katı" beklentisi yaratıyor.
- **Öneri:** Ya global kampanyaları `consumptions` sorgusuna dahil edin (`OR: [{dealerId}, {dealerId: null}]`, en yüksek çarpan), ya da gösterimden çıkarın. Kartta çarpanın **neye uygulandığını** açıkça yazın ("İşletmede yapılan harcamalardan kazanılan puan 2x"). Mümkünse kazanç anında kullanıcıya "Mutlu saat sayesinde +X puan" geri bildirimi verin; böylece kampanya görünür bir ödüle dönüşür.
- **Efor:** S–M

### 4. YÜKSEK · Doğruluk · Saat dilimi: gösterilen saat ile uygulanan saat farklı
- **Kanıt:** `lib/happy-hour-live.ts:22-34` `getUTCDay()/getUTCHours()` kullanıyor (puan hesaplaması bu fonksiyonla yapılıyor). `app/api/happy-hour/route.ts:27-31` ise `now.getHours()/getDay()` (sunucunun yerel saati) kullanıyor. Şemada `startTime String // HH:mm format` (`prisma/schema.prisma:1817`), saat dilimi bilgisi yok. Sayfa ham metni basıyor (`page.tsx:126, 176`).
- **Sorun:** İşletme "12:00–14:00" girdiğinde TR saatini kastediyor; sistem bunu UTC sayıp çarpanı TR 15:00–17:00'de uyguluyor, müşteri de "12:00–14:00" görüyor. Gece yarısını geçen günlerde gün sınırı da kayıyor. İki farklı canlılık hesabı (route vs lib) aynı veriden farklı sonuç üretebilir. Bilgi şeridindeki "liste yaklaşık bilgi sunar" uyarısı (`messages/tr.json`, `customerCampaigns.infoStrip`) sorunu kullanıcıya devrediyor.
- **Öneri:** `HappyHour` modeline `timezone String @default("Europe/Istanbul")` ekleyin (ya da işletme profilindeki saat dilimini kullanın). Canlılık hesabını tek fonksiyonda (`isHappyHourLive`) toplayıp `date-fns-tz` ile işletme saat dilimine göre yapın; route'taki kopya mantığı silin. API, kart için mutlak `nextStartAt`/`endsAt` ISO zamanları üretsin; istemci bunları kullanıcının yerel diline göre biçimlendirsin. Bilgi şeridindeki "yaklaşık" ifadesini hata düzeltildikten sonra kaldırın.
- **Efor:** M

### 5. YÜKSEK · UX/Sistem bütünlüğü · Push bildirimleri boş bir sayfaya yönlendiriyor
- **Kanıt:** `app/api/dealer/innovation/segment-proposals/[id]/send/route.ts:66-91` bildirim `type: 'campaign'` ile oluşturuluyor ve push linki `/customer/campaigns`. Sayfa `SegmentCampaignProposal` ya da `Notification` verisini hiç okumuyor.
- **Sorun:** Bir işletmenin onaylı segment kampanyasını alan müşteri bildirime tıkladığında içeriği değil, boş bir "kampanya yok" ekranını görüyor. Bu, bildirimin dönüşümünü sıfıra indiriyor ve güveni zedeliyor.
- **Öneri:** Derin bağlantıyı `/customer/campaigns?proposal=<id>` (veya bildirim id'si) yapın; sayfada "Sana özel" bölümünde kullanıcının aldığı kampanya mesajlarını (`Notification where type='campaign' and userId=me`) listeleyin, gelen id'yi vurgulayıp kaydırın. Sahiplik kontrolü sunucuda `userId` ile yapılmalı (IDOR'a karşı).
- **Efor:** M

### 6. ORTA · Hata yönetimi · HTTP hataları sessizce "boş" olarak gösteriliyor; dil karışık toast
- **Kanıt:** `page.tsx:48-55`: `res.ok` kontrolü yok; 500 yanıtında `data.success` false olduğundan ne toast ne hata kartı çıkıyor. `lib/admin-toast.ts` her hatanın başına sabit "Dikkat: " ekliyor; müşteri panelinde admin yardımcı aracı kullanılıyor.
- **Sorun:** Kullanıcı, sistem hatasıyla gerçek "kampanya yok" durumunu ayırt edemiyor; EN dilde Türkçe önek görünüyor.
- **Öneri:** Veri katmanını SWR/React Query ile kurun (`useSWR('/api/customer/offers')`): yükleniyor, hata, boş ve veri durumlarını ayrı render edin. Hata durumunda sayfa içi "Tekrar dene" kartı, `revalidateOnFocus` ile otomatik tazeleme. Müşteri tarafında yerelleştirilmiş, öneksiz bir toast sarmalayıcısı kullanın.
- **Efor:** S

### 7. ORTA · Doğruluk · "Yaklaşan" mantığı hatalı ve "Tüm Kampanyalar" etiketi yanıltıcı
- **Kanıt:** `app/api/happy-hour/route.ts:75-87`: yarın günü içeren her kayıt (şu an aktif olsa bile) "upcoming"e giriyor; sıralama olmadan `slice(0, 5)`. Liste `orderBy: createdAt desc` ile geliyor (`route.ts:51`), başlangıç saatine göre değil. Sayfa aktif kampanya yokken bu listeye "Tüm Kampanyalar" diyor (`page.tsx:142`).
- **Sorun:** Aynı kampanya iki bölümde görünebilir; en yakın başlayan kampanya ilk 5'e girmeyebilir; kullanıcı "tümü" sanıp aslında rastgele 5 kayıt görüyor.
- **Öneri:** Sunucuda her kampanya için bir sonraki başlangıç anını hesaplayın, aktif olanları hariç tutun, `nextStartAt`'e göre sıralayın; sayfalama/"daha fazla" ekleyin. Etiketleri veri gerçeğine göre adlandırın ("Bugün daha sonra", "Bu hafta").
- **Efor:** S–M

### 8. ORTA · Mimari/Ürün · Modül kapatma yalnızca menüyü gizliyor
- **Kanıt:** `components/dashboard/sidebar.tsx:298` (`featureKey/moduleKey: 'customer_campaigns'`); `proxy.ts` ve `app/customer/` içinde bu anahtara rota seviyesinde başvuru bulunamadı (grep). `lib/module-controls.ts:19` "referrals" modülünün detay linki de bu sayfaya işaret ediyor.
- **Sorun:** Admin modülü kapattığında kullanıcı doğrudan URL'den (veya push bildiriminden, bkz. #5) sayfaya girebiliyor. Ayrıca "referrals" modülünün detayı yanlış sayfayı gösteriyor.
- **Öneri:** Müşteri modül kapılarını sunucu bileşeninde (layout) ortak bir `assertModuleEnabled('customer_campaigns')` ile uygulayın; kapalıysa bilgilendirici bir boş durum ya da yönlendirme gösterin. "referrals" detay linkini `/customer/referral` yapın. Doğrulanmadı: menü dışında başka bir genel kapı olup olmadığı tam olarak taranmadı; yalnızca grep yapıldı.
- **Efor:** S

### 9. ORTA · Erişilebilirlik/Motion · Sonsuz pulse, eksik aria
- **Kanıt:** `page.tsx:113` (`animate-pulse`), `page.tsx:66` (spinner'da `role="status"`/`aria-live` yok), `page.tsx:94, 108, 119, 124, 141, 147, 164, 174, 193, 209` (dekoratif ikonlarda `aria-hidden` yok; yalnızca hero ve bilgi şeridinde var).
- **Sorun:** Azaltılmış hareket tercih eden kullanıcıda rozet sürekli yanıp sönüyor (framer'ın `MotionConfig`'i CSS animasyonlarını etkilemez). Ekran okuyucu yüklemeyi duyurmuyor ve ikonları gereksiz yere okuyabiliyor.
- **Öneri:** `motion-safe:animate-pulse` kullanın ya da canlılığı tek seferlik bir "nabız" + statik "CANLI" etiketiyle gösterin. Yükleme için iskelet kartlar + `aria-busy`. Tüm dekoratif lucide ikonlarına `aria-hidden`.
- **Efor:** S

### 10. DÜŞÜK · Kod kalitesi · `any` kaçakları, kullanılmayan alanlar, sabit gün dizisi
- **Kanıt:** `app/api/happy-hour/route.ts:60, 75, 91` (`(hh: any)`), `page.tsx:33` (`dealer.image` hiç kullanılmıyor), `page.tsx:36` (`dayShort` TR sabit), `page.tsx:72-218` (girinti bozuk `return`), admin `list=1` yolunda `take: 500` ve tüm alanlar.
- **Sorun:** Tip güvenliğinin olmaması #1'deki sözleşme kaymasının fark edilmemesine neden olan şeyin ta kendisi.
- **Öneri:** Prisma tiplerinden türetilen bir DTO kullanın; gün adlarını `Intl.DateTimeFormat(locale, { weekday: 'short' })` ile üretin; ardışık günleri "Pzt–Cum" gibi aralık olarak gösterin.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Canlı geri sayım ve "şimdi git" eylemi** (Starbucks "Double Star Day", Uber Eats teklifleri): aktif kampanyada kalan süre çubuğu, yaklaşanda "18:00'de başlıyor · Hatırlat" düğmesi, karttan işletme sayfasına / yol tarifine / QR okutmaya tek dokunuşla geçiş.
2. **Kişiselleştirilmiş teklifler** (Starbucks "Offers for you", Revolut RevPoints): favori ve sık gidilen işletmelerin kampanyaları üstte; segment kampanya mesajları "Sana özel" bölümünde; VIP kademesine özel çarpan.
3. **Katılım ve kazanç takibi** (Duolingo "Double XP" sayaçları): "Bu kampanyadan şu ana kadar +120 puan kazandın", "Bu haftaki 3 kampanyanın 1'ine katıldın". Metadata zaten bunu vaat ediyor.
4. **Hatırlatıcı/bildirim aboneliği**: "Bu işletmenin kampanyaları başlayınca haber ver" (push altyapısı hazır).
5. **Konum ve filtre**: yakınımda / kategori / çarpan büyüklüğü / bugün; harita görünümü (bugün `/customer/nearby` içinde dağınık durumda).
6. **Tüm fırsat türlerinin tek akışta toplanması**: mutlu saat + sezonluk etkinlik + flaş indirim + davet bonusu, tek tipte "Fırsat kartı" ile (Monzo/Revolut "Offers" sekmesi).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Kullanıcı sayfayı açtığında 2 saniye içinde "Şu an nerede daha çok kazanırım?" sorusunun cevabını alır ve tek dokunuşla oraya gider. Sayfa bir duyuru panosu değil, **eyleme dönük bir fırsat akışı** olur.

**Yerleşim (mobil öncelikli):**
1. **Üst "Şimdi" şeridi:** En yüksek aktif çarpan büyük tipografiyle ("2x · 47 dk kaldı"), işletme adı ve "Git / QR okut" CTA'sı. Aktif yoksa "Sıradaki fırsat 18:00'de" + Hatırlat.
2. **Sekmeler / segmentli kontrol:** Şimdi · Bugün · Bu hafta · Sana özel. Üstte yakınımda / favorilerim filtresi.
3. **Fırsat kartları (tek bileşen, tür rozeti ile):** Mutlu saat, Sezonluk etkinlik (challenge ilerlemesi ile), Flaş teklif (kalan adet), Segment mesajı. Her kartta: işletme görseli, neye uygulandığı açıklaması, mutlak saat (yerel saat diliminde), birincil eylem.
4. **Kazanç özeti:** "Bu ay kampanyalardan +X puan" küçük kartı.
5. **Davet kartı:** Statik metin yerine kullanıcının davet kodu + kopyala/paylaş + "2 arkadaşın katıldı" bilgisi (veri `/api/customer/referral`'dan); ayrıntı `/customer/referral`'da kalır.

**Motion / 3D (ölçülü):** 3D gerekmiyor; bu sayfa hızlı taranmalı. Canlı kampanyada halka şeklinde ilerleyen bir geri sayım (SVG `stroke-dashoffset`, `motion-safe`), kartlarda mevcut kısa stagger yeterli. Sonsuz pulse yerine canlı noktası (tek renk, düşük genlik). Kampanya sayesinde puan kazanıldığında kazanç ekranında tek seferlik "2x" damgası animasyonu, kampanya ile ödül arasındaki bağı görünür kılar.

**Veri / API değişiklikleri:**
- Yeni uç `GET /api/customer/offers?scope=now|today|week|mine&near=lat,lng`: `HappyHour`, `SeasonalCampaign`, `DealerFlashOffer` ve kullanıcının `Notification(type='campaign')` kayıtlarını tek DTO'ya (`Offer { id, kind, title, dealer, multiplier?, appliesTo, startsAt, endsAt, status, cta }`) dönüştürür. Upstash Redis'te kısa TTL (60 sn) önbellek (kişisel kısım hariç).
- Canlılık/sonraki-başlangıç hesabı tek modülde (`lib/happy-hour-live.ts`), işletme saat dilimine duyarlı.
- `HappyHour` şemasına `timezone`; POST/PATCH için zod doğrulaması ve çarpan tavanı; işletme panelinde oluşturma/düzenleme/kapatma arayüzü (şu an hiçbir UI bu POST'u çağırmıyor, kayıtlar yalnızca seed/API ile oluşuyor; grep ile doğrulandı).
- Sayfa SSR'de ilk veriyi alıp istemcide SWR ile tazelemeli (`revalidateOnFocus`, pencere sınırında `refreshInterval`).

---

## Çakışmalar / birleştirme önerisi

- **`/customer/event`** (`app/customer/event/page.tsx`): Sezonluk kampanya ve challenge. "Kampanya" kavramının diğer yarısı burada; kullanıcı açısından iki ayrı sayfa olması anlamsız.
- **`/customer/nearby`** (`app/customer/nearby/page.tsx:522-540`, `liveBoosts`): Aynı `HappyHour` verisini konuma göre "canlı çarpan" olarak zaten gösteriyor ve **bu sayfanın aksine çalışıyor**. Çarpan bilgisi şu an iki yerde, iki farklı canlılık hesabıyla üretiliyor.
- **`/customer/referral`**: Davet bölümü yalnızca bu sayfaya bir link; kenar çubuğunda ayrı "Davet" girişi de var (`sidebar.tsx:306`). Kampanya sayfasındaki davet kartı içerik eklemiyor.
- **Flaş teklifler** (`/api/customer/innovation/nearby`, `/api/customer/innovation/radar`): Ayrı uçlarda, müşteri için yine "fırsat".

**Öneri:** `/customer/campaigns` rotasını koruyup **"Fırsatlar" merkezi** olarak yeniden inşa edin; mutlu saat + sezonluk etkinlik + flaş teklif + kişisel kampanya mesajlarını tek akışta toplayın. `/customer/event` kendi detay sayfası olarak kalabilir ama giriş noktası bu merkez olmalı. `/customer/nearby` çarpan verisini aynı `offers` servisinden almalı ki iki ayrı hesap ortadan kalksın. Davet kartı küçük bir özet bileşene dönüşsün. Kısa vadede (1 gün) mutlaka yapılması gerekenler: Bulgu #1 (veri sözleşmesi), #2 (çarpan doğrulaması ve clamp), #3 (global kampanya uygulanması ya da gizlenmesi).

---

## Doğrulama (şüpheci inceleme)

Yöntem: Kod salt okunur olarak baştan okundu (`page.tsx`, `app/api/happy-hour/route.ts`, `app/api/dealer/consumptions/route.ts`, `lib/happy-hour-live.ts`, `lib/seasonal-campaign-live.ts`, `lib/api-auth.ts`, `lib/validations.ts`, `lib/timezone.ts`, `proxy.ts`, `prisma/schema.prisma`, `prisma/seed.ts`, `app/api/customer/discovery/route.ts`). Veritabanına, build'e ya da çalışan sunucuya dokunulmadı; canlı verideki kayıtlar doğrulanmadı.

### İddia 1: Kampanya listesi canlıda her zaman boş → **DOĞRULANDI**
- `page.tsx:48-51` yalnızca `data.happyHours` okuyor. `fetch('/api/happy-hour')` parametresiz çağrılıyor, yani `list=1` dalı (`route.ts:17-25`) hiçbir zaman çalışmıyor; müşteri dalı `route.ts:94-101` `{ success, activeNow, upcoming, bestMultiplier, currentTime, currentDay }` döndürüyor. `happyHours` anahtarı yok, `campaigns` hep `[]`.
- `isActiveNow` repo genelinde yalnızca `page.tsx:32, 60, 61`'de geçiyor (grep); API hiçbir nesneye bu alanı eklemiyor. `proxy.ts:105-118` `/api/` isteklerini yalnızca başlık ekleyerek geçiriyor, yanıtı dönüştüren bir katman yok.
- Yeniden üretim: Herhangi bir rolle (oturumsuz bile) `/customer/campaigns` açılır → `GET /api/happy-hour` 200 + `success: true` döner → `setCampaigns(undefined || [])` → "Şu an aktif" bölümü render edilmez, "kampanya bulunamadı" boş kartı görünür. Veritabanında aktif kayıt olsa da sonuç aynı.

### İddia 2: Çarpan doğrulanmadan puana giriyor, sınırsız/negatif puan → **DOĞRULANDI (negatif kısmı çürütüldü)**
- Doğrulanan kısım: `route.ts:121-138` `multiplier`'ı gövdeden ham alıyor (`multiplier || 2.0`), tip/üst sınır yok. Rol kontrolü yalnızca DEALER/ADMIN (`route.ts:116`); bayinin onay durumu vb. ek bir kapı yok. `consumptions/route.ts:304-306` tavanı (`BASE_XP_CAP=1000`) çarpandan ÖNCE uyguluyor; `:312-319` bayinin canlı happy-hour'larındaki en büyük çarpanı alıyor; `:324` `Math.floor(baseXP * 0.05 * happyHourMultiplier)`; `:335-350` doğrudan `user.points` artırıyor. `createConsumptionSchema` (`lib/validations.ts:269-276`) kart sahipliğini sınırlamıyor: bayi sistemdeki aktif olan **herhangi bir** kartın token'ı ile tüketim girebiliyor (`consumptions/route.ts:144-178`). Bu yolda `points_credited` olayı yazılmıyor (diğer puan yolları yazıyor: `lib/badge-reward-points.ts:58`, `lib/achievements.ts:137-142`), yani fraud görünürlüğü de yok.
- Yeniden üretim: DEALER oturumuyla `POST /api/happy-hour` `{ "name":"x", "multiplier":1000000, "startTime":"00:00", "endTime":"23:59", "daysOfWeek":[0,1,2,3,4,5,6] }` → ardından `POST /api/dealer/consumptions` `{ "cardToken":"<aktif kart>", "amount":100 }` → `baseXP=1000`, pasif puan `= floor(1000*0.05*1e6) = 50.000.000` müşteriye (ve varsa squad'ına) yazılır. Hız sınırı kart+bayi başına dakikada 5 (`:21-23, :191`) olduğu için dakikada ~250M puan. Not: `User.points` `Int` (`schema.prisma:47`); çarpan ~4,3e7'yi aşarsa tek artış int32 sınırını taşıyıp büyük ihtimalle DB hatasıyla 500 döner. Yani saldırgan çarpanı makul (ör. 1e6) seçer; bu sınır bir koruma değildir.
- Çürütülen kısım: "Negatif çarpan müşterinin puanını düşürür" iddiası **yanlış**. Negatif çarpanla `basePassivePoints` ≤ 0 olur; `applySeasonalCampaignMultiplier` bunu değiştirmeden döndürür (`lib/seasonal-campaign-live.ts:79-81`) ve `consumptions/route.ts:328` `if (passivePoints > 0)` koşulu güncellemeyi tamamen atlar. Puan düşmez. (Ama negatif/0 çarpan, aynı penceredeki pozitif bir kampanyayı `Math.max` ile ezemez; bu da etkisiz kalır.)
- Önem: KRİTİK seviyesi yerinde. Saldırı için bir DEALER hesabı ve aktif bir kart token'ı yeterli; bayi-müşteri iş birliği ya da aynı kişinin iki hesabı senaryoyu tamamlıyor.

### İddia 3: Global happy hour gösteriliyor ama puana uygulanmıyor → **DOĞRULANDI**
- `consumptions/route.ts:312-315` `where: { dealerId: session.user.id, isActive: true }`; `dealerId: null` kayıtlar hiçbir zaman çarpana girmiyor. Global kayıt üretimi gerçek bir yol: ADMIN'in `POST /api/happy-hour`'u `dealerId: null` yazıyor (`route.ts:129`); seed de bir global oluşturuyor (`prisma/seed.ts:1407-1420`, "Hafta sonu tüm gün 2x puan!"). Müşteri tarafında `app/api/customer/discovery/route.ts:416-468` bu globalleri `scope: 'global'` canlı boost olarak listeliyor (bu sayfa İddia 1 yüzünden boş, ama keşif/yakınımda yüzeyi çalışıyor).
- Yeniden üretim: ADMIN global 2x kampanya oluşturur (veya seed'deki kayıt canlıda varsa hafta sonu 10:00-22:00 UTC) → müşteri keşif ekranında "2x" canlı boost görür → herhangi bir işletmede tüketim girilir → `happyHourMultiplier = 1`, müşteri normal puan alır. Canlı veritabanında seed kaydının bulunup bulunmadığı doğrulanmadı; açık ADMIN yolu nedeniyle karar değişmiyor.
- Ek not: "Çarpan yalnızca tüketim pasif puanının %5'ine uygulanıyor" kısmı bir hata değil, bilinçli tasarım (`consumptions/route.ts:300-303` yorumu). Sorun, bunun müşteriye açıklanmaması; önem bu alt madde için ORTA.

### İddia 4: Saat dilimi tutarsızlığı, 3 saat kayma → **DOĞRULANDI (alt iddia kısmen çürütüldü, önem ORTA-YÜKSEK)**
- Doğrulanan kısım: Puan hesabı `lib/happy-hour-live.ts:24, 34` ile `getUTCDay()/getUTCHours()` üzerinden yapılıyor; şemada `HH:mm` metni ve saat dilimi alanı yok (`schema.prisma:1818-1819`); `lib/timezone.ts:1-4` "backend UTC" kuralını koyuyor, ama `HH:mm` girişini UTC'ye çeviren hiçbir arayüz yok (oluşturma arayüzü yok, yalnızca API/seed). Seed'deki "Öğle Yemeği Bonusu 12:00-14:00" (`prisma/seed.ts:1391-1405`) açıkça TR duvar saatini kastediyor; çarpan fiilen TR 15:00-17:00'de uygulanıyor. Gün sınırı da kayıyor: TR'de Cuma 01:00 = UTC Perşembe 22:00, bu durumda `daysOfWeek` yanlış güne bakıyor.
- Çürütülen kısım: "İki farklı canlılık hesabı aynı veriden farklı sonuç verir" **üretimde geçerli değil**. `route.ts:27-31` sunucu yerel saatini kullanıyor; Vercel fonksiyonları varsayılan olarak UTC'de çalışıyor ve repo'da `TZ` ayarı bulunamadı (`.env*`, kod; grep). Dolayısıyla canlıda iki hesap aynı sonucu veriyor; fark yalnızca UTC dışı bir makinede (ör. TR saatindeki yerel geliştirme ortamı) ortaya çıkıyor. Yine de kopya mantık bir bakım riski.
- Ek not: "Kullanıcı 12:00-14:00 görür" senaryosu bu sayfada **şu an** gerçekleşmiyor, çünkü İddia 1 yüzünden hiçbir kart render edilmiyor. Yalnızca İddia 1 düzeltildiğinde görünür hale geliyor. Keşif ekranındaki canlı boost ise UTC penceresine göre doğru zamanda "canlı" gösteriliyor ve puanla tutarlı; yani bugünkü somut etki, işletmenin kastettiği saatle sistemin uyguladığı saat arasındaki 3 saatlik kayma.
- Yeniden üretim: `startTime:"12:00", endTime:"14:00", daysOfWeek:[1..5]` kaydı → TR 12:30'da (UTC 09:30) tüketim → çarpan 1. TR 15:30'da (UTC 12:30) tüketim → çarpan uygulanır.

### Özet
| # | İddia | Karar |
|---|---|---|
| 1 | Liste canlıda hep boş | Doğrulandı |
| 2 | Doğrulanmamış çarpanla sınırsız puan | Doğrulandı (negatif çarpanla puan düşürme kısmı çürütüldü) |
| 3 | Global kampanya puana uygulanmıyor | Doğrulandı |
| 4 | Saat dilimi kayması | Doğrulandı (iki hesabın canlıda farklı sonuç vermesi kısmı çürütüldü) |

---

## Uygulama (Dalga 2)

**Sonuç:** `/customer/campaigns` emekli → **Keşfet → Fırsatlar** (`/customer/places?tab=deals`); `?proposal=` korunur ve "Sana özel" listesinde vurgulanır. Fırsatlar tek akış: mutlu saatler (canlı / bugün / bu hafta) + sezonluk etkinlikler (görev + ödül) + kısa süreli teklifler + kullanıcıya gelen kampanya mesajları. Veri: `GET /api/customer/places/deals` (defineRoute, CUSTOMER, Keşfet + `customer_campaigns` kapısı) → `lib/places/deals.server.ts`. Zamanlama adaptörü `lib/places/happy-hour-schedule.ts`'e taşındı (puanlamayla aynı `isHappyHourLive`, İstanbul duvar saati; mevcut Jest testi yeni yolda geçiyor). P0 dalgasının `POST /api/happy-hour` doğrulaması ve global çarpanın tüketime uygulanması (lib/consumption/service) yerinde doğrulandı.

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Metadata | ÇALIŞIYOR | "Keşfet"; olmayan "katılım durumu" vaadi yok. |
| 2 | Kampanya verisi | ÇALIŞIYOR | Paylaşılan tip (`lib/places/types.ts` `DealsResponse`); istemci yanıtın gerçekten döndürdüğü alanı okur. |
| 3 | Yükleniyor | ÇALIŞIYOR | `QueryState` kart iskeleti, `aria-busy`. |
| 4 | Hata durumu | ÇALIŞIYOR | HTTP hatası boş durum değil; tekrar dene. |
| 5 | Hata metni | ÇALIŞIYOR | Admin önekli toast yok; sunucu mesajı. |
| 6 | Hero | ÇALIŞIYOR | "Şimdi" kartı: en yüksek canlı çarpan büyük tipografiyle, kalan süre, mekân ya da "Tüm Qratex mekânlarında"; canlı yoksa sıradaki fırsat. |
| 7 | Bilgi şeridi | ÇALIŞIYOR | "Yaklaşık" uyarısı kaldırıldı (saat hatası düzeldi); yerine çarpanın NEYE uygulandığı. |
| 8 | "Şu an aktif" | ÇALIŞIYOR | Durum sunucu verisinden istemci saatinde hesaplanır (dakikalık tik, görünmezken durur). |
| 9 | Aktif kart | ÇALIŞIYOR | Ad, çarpan, mekân (görsel + mekân detayına bağlantı), saat aralığı, tekrar günleri, kalan süre. |
| 10 | Yaklaşan liste | ÇALIŞIYOR | "Bugün daha sonra" / "Bu hafta", başlangıç anına göre sıralı; canlı olan iki bölümde görünmez. |
| 11 | Gün kısaltmaları | ÇALIŞIYOR | `Intl` ile kullanıcı dili ve saat dilimi; dizi olmayan değer çökertmez. |
| 12 | Boş durum | ÇALIŞIYOR | Gerçekten hiçbir fırsat yoksa; kapsam filtresinde ayrı "bu kapsamda fırsat yok". |
| 13 | Davet kartı | KALDIRILDI | Statik bağlantıydı; Davet ayrı yüzey (Ben → Davet, kayıtta mevcut). |
| 14 | Giriş animasyonları | ÇALIŞIYOR | `QueryState` geçişi; ops yüzeyinde kart başına stagger yok (§4.2 kural 3). |
| 15 | Sonsuz `animate-pulse` | KALDIRILDI | Sonsuz döngü yok; canlılık metin + renkle. |
| 16 | Geri sayım | ÇALIŞIYOR | "Bitmesine 42 dk" / "Başlamasına …"; teklif ve etkinlikte `CountdownChip`. |
| 17 | İşletmeye geçiş | ÇALIŞIYOR | Mekân detayına bağlantı + "Kartını göster". |
| 18 | Sezonluk kampanya | ÇALIŞIYOR | Aynı akışta "Etkinlikler" (bkz. customer_event eki). |
| 19 | Flaş teklifler | ÇALIŞIYOR | Yakın (15 km) + kaydedilen mekânlar; churn taslağı/demo/askıda/dolmuş hariç. |
| 20 | Segment kampanya derin bağlantısı | KISMİ | "Sana özel" bölümü kullanıcının `Notification(type='campaign')` kayıtlarını listeler, `?proposal=` vurgular. Gönderim ucu hâlâ `/customer/campaigns` (proposal'sız) yolluyor ve nav yönlendirmesi sekmeyi düşürüyor → sahiplerine bildirildi. |
| 21 | Filtre | ÇALIŞIYOR | Tümü · Yakınımda (≤ 10 km) · Kaydettiklerim (URL `?deal=`); platform geneli fırsat her kapsamda görünür. |
| 22 | "Katılım durumu" | KALDIRILDI | Vaat metadata'dan çıktı; kampanya kazanç özeti kalanlarda. |
| 23 | Otomatik yenileme | ÇALIŞIYOR | Dakikalık tik + odakta yeniden çekme. |
| 24 | Saat dilimi | ÇALIŞIYOR | Puanlama ve gösterim aynı fonksiyon/saat dilimi. |
| 25 | Global kampanyanın puana uygulanması | ÇALIŞIYOR | Tüketim servisi `OR [{dealerId}, {dealerId: null}]` (P0); kartta neye uygulandığı yazar. |
| 26 | Modül kapatma | ÇALIŞIYOR | API (`customer_campaigns` rol bazlı) + sekmede açıklayıcı durum. |
| 27 | Yetki | ÇALIŞIYOR | Yeni uç yalnız CUSTOMER. |
| 28 | i18n | ÇALIŞIYOR | TR/EN, gün adları `Intl`. |
| 29 | Kişiselleştirme | ÇALIŞIYOR | Kaydettiklerim filtresi + "Sana özel" mesajlar. |
| 30 | Hatırlatıcı | KALDIRILDI (bu dalgada) | Abonelik tablosu yok → kalanlarda ŞEMA İSTEĞİ. |

**Kapanan bulgular (10/10):** 1 veri sözleşmesi · 2 çarpan doğrulaması (P0, yerinde doğrulandı) · 3 global kampanya (P0, yerinde doğrulandı) · 4 saat dilimi · 5 push → boş sayfa (Sana özel listesi; bağlantının sekme/proposal taşıması sahiplerine bildirildi) · 6 hata yutma · 7 yaklaşan mantığı · 8 modül kapısı · 9 sonsuz pulse/aria · 10 `any`/sabit gün dizisi.

**Kalanlar:** (a) `app/api/dealer/innovation/segment-proposals/[id]/send/route.ts` push `url`'i `/customer/places?tab=deals&proposal=<id>` olmalı (bayi yüzeyi). (b) `lib/navigation/registry.ts` `redirectFrom` sekme sorgusu taşımıyor: `/customer/campaigns` → `/customer/places` (Yakınımda) — nav sahibine bildirildi. (c) "Başlayınca haber ver" → **ŞEMA İSTEĞİ** `OfferReminder(userId, kind: 'happy_hour'|'seasonal', refId, remindAt, sentAt?; @@unique([userId, kind, refId]))`. (d) Kampanya kazanç özeti ("bu ay mutlu saatlerden +X puan") yapılmadı (defter `meta.happyHourId` ile mümkün; ayrı iş).
