# /customer/my-year

**Amaç:** Müşterinin bu takvim yılındaki kişisel özetini ("QRateX'te Yılım") göstermek; özellikle "yorumların işletmelerde karşılık buldu" mesajını öne çıkarmak. Ürün olarak Spotify Wrapped / Duolingo Year in Review'un Qratex karşılığı olmayı hedefliyor.
**Genel puan: 4.5/10** · **Karar: yeniden tasarla**: API iskeleti kurtarılabilir ama kahraman metriği yanlış hesaplanıyor, "yıl" etiketli kartların bir kısmı yılı değil tüm zamanı gösteriyor, sayfa da bir "Wrapped" deneyimi değil, 8 kutulu düz bir istatistik ızgarası.

Denetlenen dosyalar: `app/customer/my-year/page.tsx` (113 satır), `app/api/customer/my-year/route.ts`, `app/customer/layout.tsx`, `proxy.ts`, `components/dashboard/sidebar.tsx:291`, `components/layout/dashboard-page-hero.tsx` → `components/admin/admin-premium-hero.tsx`, `components/ui/inline-loading-status.tsx`, `lib/admin-toast.ts`, `lib/analytics-event-retention.ts`, `lib/inngest/functions.ts`, `app/api/dealer/feedbacks/[id]/reply/route.ts`, `prisma/schema.prisma` (Feedback, QRCode, Consumption, ConsumptionReview, UserBadge, AnalyticsEvent, UserStreak, SquadBattle, SquadBattleParticipant). Kod ya da veritabanı çalıştırılmadı, bütün bulgular kod okunarak çıkarıldı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Veri gerçek ve yetki doğru. Ancak manşetteki "etki oranı" yanlış birimle hesaplanıyor, "en çok ziyaret ettiğin yer" aslında yorum sayısı, tüketim yorumlarına gelen yanıtlar hiç sayılmıyor, seviye ve seri yıla göre değil. |
| UX | 4/10 | Hikâye, sıra, sürpriz, paylaşım yok. Yeni ya da ocak ayındaki kullanıcıya "0 işletme yanıt verdi" gösteriliyor. Hata ile boşluk aynı metne düşüyor. |
| Görsel | 4/10 | 8 eş ağırlıklı kart. Kupa ikonu iki farklı metrikte kullanılıyor, ortalama puan yıldız yerine Sparkles ikonuyla gösteriliyor. "Wrapped" hissi yok. |
| Mimari | 5/10 | Tek uçta paralel sorgular var, bu iyi. Ama 5 alan ölü, `pointsSpent` hiçbir zaman yazılmayan bir event'ten okunuyor, puan kaynağı 90 günde silinebilen AnalyticsEvent, istemci tarafı ham `useEffect`/`fetch` kullanıyor. |
| Performans | 7/10 | 10 sorgu `Promise.all` içinde, indeksler büyük ölçüde mevcut. `topDealer` için ardışık ek bir sorgu ve `SquadBattleParticipant.userId` indeksinin olmaması küçük maliyetler. |
| Erişilebilirlik + Mobil | 6/10 | 2 kolonlu ızgara mobilde düzgün, hero `useReducedMotion` kullanıyor. Bölüm başlığı (h2) yok, dev sayı bağlamsız bir `<p>`, ikonlarda `aria-hidden` yok (lucide 0.303), metin i18n dışında. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota yetkisi (yalnız CUSTOMER) | ÇALIŞIYOR | `proxy.ts:50-73` | `/customer` öneki CUSTOMER rolü istiyor, diğer roller kendi paneline yönlendiriliyor. |
| 2 | API oturum kontrolü / IDOR | ÇALIŞIYOR | `route.ts:20-24` | `userId` oturumdan alınıyor, parametreden değil, bu yüzden IDOR yok. Rol kontrolü yok: bayi çağırırsa kendi (boş) özetini alır. Risk düşük. |
| 3 | Sidebar menü girdisi | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:291`, `messages/tr.json:2577` | "analytics" grubunda. Analiz sayfalarının yanında kalabalık yapıyor (bkz. Çakışmalar). |
| 4 | Hero başlık/açıklama | ÇALIŞIYOR | `page.tsx:49-53` | Admin'deki `AdminPremiumHero` yeniden kullanılıyor. |
| 5 | Veri yükleme | KISMİ | `page.tsx:36-45` | Ham `useEffect`+`fetch`: AbortController, yeniden deneme ve yenileme yok. `r.json()` HTTP durumuna bakmıyor. |
| 6 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:55-60` | Tek spinner. Sonuç sayfasının iskeletini (skeleton) göstermiyor. |
| 7 | Hata durumu | KISMİ | `page.tsx:43`, `page.tsx:61-64` | Toast "Dikkat: Özet yüklenemedi" (prefix `lib/admin-toast.ts:20`). Kalıcı metin "Henüz özet oluşturulamadı." hem hata hem boş durumda gösteriliyor. "Tekrar dene" yok. |
| 8 | Boş durum (yıl içinde hiç etkinlik yok) | EKSİK | `page.tsx:66-95` | Yeni kullanıcı sekiz tane "0" ve "0 işletme yanıt verdi" görüyor. Bir sonraki adım (QR okut, yorum yaz) önerilmiyor. |
| 9 | Etki kartı: yanıt veren işletme sayısı | KISMİ | `route.ts:47-54`, `page.tsx:71-73` | Yalnız `Feedback` (QR) yanıtlarını sayıyor. `ConsumptionReview.dealerReply` hiç sayılmıyor, oysa bayi bu yoruma da yanıt veriyor (`app/api/dealer/feedbacks/[id]/reply/route.ts:119-124,143-149`). |
| 10 | Etki oranı (%) | BOZUK | `route.ts:92`, `page.tsx:75` | `benzersiz işletme / toplam yorum`. Pay ile payda farklı birim olduğu için "yorumlarının %X'i karşılık buldu" cümlesi yanlış. |
| 11 | Seviye | KISMİ | `route.ts:43`, `page.tsx:83` | Bugünkü seviyeyi gösteriyor, "bu yıl kazanılan seviye" değil. Yıllık özette yanıltıcı. |
| 12 | Geri bildirim sayısı | KISMİ | `route.ts:45`, `page.tsx:84` | Yalnız `Feedback`: tüketim yorumları yok, soft-delete edilmiş (`deletedAt`) yorumlar dahil. |
| 13 | Ortalama puan | KISMİ | `route.ts:45`, `page.tsx:85-89` | 12'deki kapsam sorunu burada da var. İkon Sparkles, yıldız değil. |
| 14 | Ziyaret | ÇALIŞIYOR | `route.ts:63`, `page.tsx:90` | `Consumption` sayısı (fiziksel kart). Yalnız QR ile yorum yapan kullanıcıda her zaman 0. |
| 15 | Rozet | ÇALIŞIYOR | `route.ts:64`, `page.tsx:91` | `earnedAt` yıl filtresi doğru. |
| 16 | Kazanılan puan | KISMİ | `route.ts:66-70`, `page.tsx:92` | `squad_battle_refund` iadeleri "kazanç" olarak sayılıyor. Kaynak tablo 90 günde silinebilir (bkz. Bulgu 4). |
| 17 | En uzun seri (gün) | KISMİ | `route.ts:77`, `page.tsx:93` | `UserStreak.longestStreak` tüm zamanların değeri, yıla göre değil. |
| 18 | Klan savaşı | KISMİ | `route.ts:78`, `page.tsx:94` | Katılım sayısı. API'deki değişken adı `battlesWon` ama kazanç sayılmıyor. Kupa ikonu rozetle aynı. |
| 19 | En çok ziyaret ettiğin yer | BOZUK | `route.ts:56-62,88`, `page.tsx:102-104` | Sorgu en çok **yorum yapılan** işletmeyi buluyor, UI bunu "N **ziyaret**" diye yazıyor. 14 numaralı "Ziyaret" (Consumption) ile de tutarsız. |
| 20 | Harcanan puan (API alanı) | SAHTE | `route.ts:72-76` | `points_spent` event'i kod tabanında hiçbir yerde yazılmıyor, değer hep 0 (UI'da gösterilmiyor). |
| 21 | `totalSpent`, `currentStreak`, `currentPoints`, `xp`, `memberSince` | EKSİK (ölü alan) | `route.ts` yanıt gövdesi, `page.tsx:10-18` | API bu alanları dönüyor ama sayfa kullanmıyor. `memberSince` ve `xp` arayüz tipinde bile yok. |
| 22 | Dönem seçimi (`?period=all`) | EKSİK | `route.ts:26`, `page.tsx:37` | API destekliyor, UI hiç göndermiyor. |
| 23 | Geçmiş yıl / yıl seçici | EKSİK | `route.ts:28` | Yalnız içinde bulunulan yıl. 2 Ocak'ta sayfa boş, geçen yılın özeti erişilemiyor. |
| 24 | Paylaşılabilir özet kartı | EKSİK | Sayfada share yok. Hazır desen `components/customer/character-share-card.tsx` | Wrapped'in temel büyüme döngüsü bu ve eksik. |
| 25 | Hikâye/slayt anlatımı, count-up, motion | EKSİK | `page.tsx` içinde framer/`Motion` yok | `components/customer/animated-number.tsx` hazır ama kullanılmıyor. |
| 26 | Kartlardan derin bağlantı | EKSİK | `page.tsx:20-31` | `Stat` tıklanamıyor. Yorumlarım, rozetler, seri gibi sayfalara yönlendirme yok. |
| 27 | Çok dil (i18n) | KISMİ | `page.tsx:50-51,63,73-75,83-104`, `messages/en.json:2577` | Menü başlığı EN'de "My Year" ama sayfa metinleri sabit Türkçe. |
| 28 | Önbellek başlıkları + DB kesinti yanıtı | ÇALIŞIYOR | `route.ts` `PRIVATE_NO_STORE_HEADERS`, `responseIfDatabaseUnavailable` | Kişisel veri CDN'e düşmüyor. |
| 29 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:82` | `grid-cols-2 sm:3 lg:4`. Layout zaten yatay boşluk verirken sayfa `p-6` ekliyor (`page.tsx:48`), bu yüzden mobilde yatay boşluk çift. |
| 30 | Erişilebilirlik (başlıklar, ikonlar, sayı bağlamı) | KISMİ | `page.tsx:71`, `page.tsx:20-31` | h1 sonrası h2 yok. Dev sayı ile cümlesi ayrı `<p>`'lerde. lucide 0.303 ikonlara `aria-hidden` eklemiyor (node_modules'ta doğrulandı). |
| 31 | Kıyas (geçen yıl, topluluk yüzdeliği, "ilk %5") | EKSİK | — | Wrapped/Duolingo'nun en çok paylaşılan anları. |

**Toplam 31 özellik:** ÇALIŞIYOR 9 · KISMİ 11 · BOZUK 2 · SAHTE 1 · EKSİK 8

---

## Bulgular

### 1. [YÜKSEK] Doğruluk: "Yorumlarının %X'i karşılık buldu" yanlış hesaplanıyor
- **Kanıt:** `app/api/customer/my-year/route.ts:47-54` (`COUNT(DISTINCT q."dealerId")`), `route.ts:92` (`repliedDealers / totalFeedbacks`), `app/customer/my-year/page.tsx:75`.
- **Sorun:** Pay benzersiz **işletme** sayısı, payda **yorum** sayısı. Örnek: kullanıcı aynı kafeye 10 yorum yazmış ve 10'una da yanıt gelmiş. Ekranda "%10'u karşılık buldu" yazar, doğrusu %100. Sayfanın ana mesajı ("sesin duyuldu") tam tersini söylemiş olur ve sadık müşteriyi cezalandırır.
- **Öneri:** İki ayrı metrik üret: `repliedFeedbackCount` (yanıt gelen yorum sayısı) ve `respondingDealerCount` (yanıt veren benzersiz işletme). Oran `repliedFeedbackCount / totalFeedbacks` olmalı. Bunu tek bir SQL `FILTER` ifadesiyle aynı geçişte hesapla (`COUNT(*) FILTER (WHERE "dealerRepliedAt" IS NOT NULL)`). Metni de iki cümleye böl: "**N işletme** sana yanıt verdi · yorumlarının **%X**'i karşılık buldu".
- **Efor:** S

### 2. [YÜKSEK] Kapsam: tüketim yorumları (ConsumptionReview) özetten tamamen dışarıda
- **Kanıt:** `route.ts:45,47-62` yalnız `"Feedback"` tablosunu okuyor. Bayi tüketim yorumuna da yanıt yazıyor: `app/api/dealer/feedbacks/[id]/reply/route.ts:119-124,143-149` (`consumptionReview.update... dealerRepliedAt`). Karakter rozeti de yalnız ConsumptionReview'ı sayıyor (proje belleği).
- **Sorun:** Fiziksel kartla tüketip yorum yazan kullanıcının "geri bildirim", "ortalama puan", "yanıt veren işletme" ve "etki oranı" değerlerinin hepsi eksik ya da 0 çıkıyor. Sistemin asıl yorum kanalı görünmez kalıyor.
- **Öneri:** API'de "yorum" kavramını birleşik bir sorguyla yeniden tanımla: `Feedback` (userId, deletedAt IS NULL) **UNION ALL** `ConsumptionReview` (customerId), ikisinde de `rating`, `dealerRepliedAt` ve dealerId (`QRCode.dealerId` / `Consumption.dealerId`) olsun. Toplam, ortalama, yanıt oranı ve en sık işletme bu CTE üzerinden tek geçişte hesaplanmalı. Bu birleşik "kullanıcı yorumları" görünümü `journey-score`, `analytics` ve `feedbacks` sayfaları için de `lib/customer-reviews.ts` gibi tek bir yardımcıda toplanmalı.
- **Efor:** M

### 3. [YÜKSEK] Doğruluk: "En çok ziyaret ettiğin yer (N ziyaret)" aslında yorum sayısı
- **Kanıt:** `route.ts:55-62` ("En çok yorum yapılan işletme"), `route.ts:88` (`visits: Number(n)`), `page.tsx:102-104`.
- **Sorun:** Etiket "ziyaret" diyor, sayı yorum sayısı. Aynı sayfadaki "Ziyaret" kartı (`page.tsx:90`) ise `Consumption` sayıyor, yani iki "ziyaret" farklı kaynaklardan geliyor ve birbiriyle çelişebiliyor. Örnek: "Ziyaret 0" kartı ile "En çok ziyaret ettiğin yer: X (4 ziyaret)" aynı ekranda.
- **Öneri:** "Favori mekân" metriğini birleşik etkileşimle (tüketim + QR yorumu, işletme bazında) hesapla ve alanı `interactions` olarak yeniden adlandır. Metin şöyle olsun: "En çok uğradığın yer: X — 4 tüketim, 3 yorum". Wrapped tarzında ilk 3 mekânı logo ve kategoriyle listele.
- **Efor:** S

### 4. [YÜKSEK] Veri kaynağı: "Kazanılan puan" silinebilen ve iadeleri de içeren bir event tablosundan okunuyor
- **Kanıt:** `route.ts:66-70` (`AnalyticsEvent` `points_credited` toplamı). `lib/analytics-event-retention.ts:9,18-26` 90 günden eski **tüm** event'leri siliyor, `lib/inngest/functions.ts:134-142` bunu her gün 03:00'te çağırıyor. Admin ucu da var: `app/api/admin/analytics/cleanup-events/route.ts`. Buna karşın `app/api/cron/db-cleanup/route.ts:10-11` "AnalyticsEvent SİLİNMEZ" diyor. İade event'leri: `lib/gamification-engine.ts:110-112`, `app/api/cron/squad-battles/route.ts:83-85` (`category: 'squad_battle_refund'`).
- **Sorun:** (a) Inngest zamanlayıcısı canlıda çalışıyorsa "bu yıl kazanılan puan" sessizce son 90 güne iner. Aralıkta bakan kullanıcı yılın dörtte birini görür. Zamanlayıcının canlıda çalışıp çalışmadığı **doğrulanmadı**. (b) Klan savaşı escrow iadesi kazanç sayılıyor. Escrow net-sıfır ilkesine göre (proje belleği) iade bir kazanç değil, kendi parasının geri dönüşü, bu yüzden değer şişiyor. (c) `(data->>'points')::int` dönüşümü: matris kaynaklı bir bonus ondalıklı ya da metin dönerse bütün uç 500 verir. Değerler şu an tamsayı görünüyor ama şemayla garanti edilmiyor (doğrulanmadı).
- **Öneri:** Kalıcı bir puan defteri (`PointsLedger`: userId, delta, kind, sourceType, sourceId, createdAt; indeks `(userId, createdAt)`) bütün kredi ve borç yollarının tek yazım noktası olmalı. my-year, analytics, cap ve velocity buradan okumalı. Kısa vadeli düzeltme: `category <> 'squad_battle_refund'` filtresi ekle, cast'i `NULLIF(regexp_replace(...))::numeric` ile güvenli hale getir, retention işinde `event='points_credited'` satırlarını hariç tut.
- **Efor:** M (geçici düzeltme S, defter L)

### 5. [ORTA] Ürün mantığı: "Yılım" etiketli metriklerin bir kısmı yılı değil şu anı gösteriyor
- **Kanıt:** `route.ts:43` (`level` bugünkü değer), `route.ts:77` (`longestStreak` tüm zamanların değeri), `page.tsx:83,93`.
- **Sorun:** Yıllık özette "Seviye 12" ya da "En uzun seri 45 gün" geçen yıla ait olabilir. Kullanıcı bunu bu yılın başarısı sanar. Seneye aynı sayı tekrar çıkınca da güven kaybolur.
- **Öneri:** Yıl içi değişimi hesapla. Seviye için "Seviye 7 → 12 (+5)": yıl başı seviyesi defterden/XP olaylarından ya da Ocak'ta alınan bir `UserYearSnapshot` kaydından gelsin. Seri için yıl içinde ulaşılan en yüksek seri: `UserStreak` geçmişi tutmuyor, bu yüzden günlük aktivite tablosundan türet ya da yılın en yüksek değerini ayrı sakla. Veri yoksa kartı "tüm zamanlar" diye açıkça etiketle.
- **Efor:** M

### 6. [ORTA] UX: "Wrapped" vaadi var, deneyim yok (anlatı, ritim, paylaşım)
- **Kanıt:** `page.tsx:66-108`: bir hero kartı, 8 eşit `Stat` kartı ve bir satır. Motion, sıralama, paylaşım ya da CTA yok. Hazır ama kullanılmayan parçalar: `components/customer/animated-number.tsx`, `components/customer/character-share-card.tsx` (canvas, PNG ve `navigator.share`).
- **Sorun:** Spotify Wrapped ve Duolingo YIR'ın değeri tek tek sayılarda değil, **açıklanma anında** ve **paylaşılabilirlikte**. Bu sayfa analytics sayfasının küçük bir kopyası gibi duruyor ve kullanıcıyı geri getirecek ya da organik büyüme sağlayacak bir şey sunmuyor.
- **Öneri:** Bkz. Yeniden tasarım vizyonu: 6-8 "slayt"lık dikey hikâye, her slaytta tek bir büyük gerçek, son slaytta paylaşılabilir 9:16 PNG kartı. Paylaşım için `character-share-card` deseni (`generateXShareImage` → `navigator.share` → indirme yedeği) genelleştirilip `lib/share-card/` altında ortak hale getirilmeli.
- **Efor:** L

### 7. [ORTA] UX: hata ve boş durumu aynı, yeni kullanıcı motivasyon kırıcı bir ekran görüyor
- **Kanıt:** `page.tsx:43` (yalnız toast), `page.tsx:61-64` (hata ve boş için aynı metin), `page.tsx:71-73` ("0 işletme yanıt verdi" koşulsuz gösteriliyor).
- **Sorun:** Ağ hatası "Henüz özet oluşturulamadı" diye sunuluyor ve yeniden deneme yok. Sıfır etkinlikli kullanıcıya kahraman kartı olarak "0" gösteriliyor. Ocak ayında herkes bu durumda.
- **Öneri:** Üç ayrı durum tasarla. **Hata:** ikon, "Bağlantı sorunu", "Tekrar dene" butonu. **Boş/erken dönem:** "Yılın hikâyesi yazılıyor. İlk QR'ını okut", CTA'lar `/customer/scan` ve `/customer/discover`, Ocak'ta da otomatik olarak geçen yılın özetini öner. **Kısmi veri:** sıfır olan metriği gizle, sayılar küçükse anlatıyı kısalt.
- **Efor:** S

### 8. [ORTA] Mimari: ölü ve sahte alanlar, tip sözleşmesi zayıf
- **Kanıt:** `route.ts:72-76` (`points_spent` hiç yazılmıyor, grep yalnız bu satırı buluyor). `route.ts` yanıtındaki `memberSince`, `xp`, `currentPoints`, `totalSpent`, `currentStreak`, `pointsSpent` UI'da kullanılmıyor. `page.tsx:10-18` arayüzü elle tanımlanmış ve sunucuyla paylaşılmıyor. `route.ts:78` değişken adı `battlesWon` ama sayılan katılım.
- **Sorun:** Bakımcıyı yanıltıyor ("harcanan puan var" sanılıyor), gereksiz sorgu çalışıyor, istemci ve sunucu tipi sessizce birbirinden kayabiliyor.
- **Öneri:** Yanıt şemasını `lib/contracts/my-year.ts` içinde zod ile tanımla, hem route hem sayfa import etsin. `points_spent` sorgusunu defter gelene kadar kaldır. `memberSince` ("2024'ten beri bizimlesin") ve `totalSpent` hikâye slaytlarında kullanılabilecek değerli veriler, ya kullan ya da kaldır. `battlesWon` → `battlesJoined`, kazanılanlar için ayrı bir sayım (`SquadBattle.winnerId = participant.squadId`) ekle.
- **Efor:** S

### 9. [ORTA] Zaman: yıl sınırı UTC'ye göre ve geçmiş yıl erişilemiyor
- **Kanıt:** `route.ts:28` (`Date.UTC(now.getUTCFullYear(), 0, 1)`), `route.ts:26` (yalnız `year|all`).
- **Sorun:** Türkiye UTC+3 olduğu için 1 Ocak 00:00-03:00 arasındaki etkinlik hiçbir yıla düşmüyor: önceki yılın sorgusu da yok. Asıl sorun şu: özet en çok Aralık sonu ve Ocak başında açılır, ama 1 Ocak'ta sayfa sıfırlanıyor ve geçen yıl kayboluyor.
- **Öneri:** `?year=2026` parametresi ekle, sınırları `Europe/Istanbul`'a göre hesapla (`[yıl-01-01T00:00+03, yıl+1-01-01T00:00+03)`, üst sınır da olsun). UI'da yıl seçici (chip) olsun ve 1 Ocak-15 Şubat arasında varsayılan olarak geçen yıl açılsın. Kapanmış yılların özeti değişmeyeceği için Upstash'te uzun TTL ile önbelleğe alınabilir (anahtar `my-year:{userId}:{year}`), ya da yıl sonunda bir cron ile `UserYearSnapshot` tablosuna dondurulabilir. Snapshot ayrıca 4. bulgudaki 90 gün silme riskini de ortadan kaldırır.
- **Efor:** M

### 10. [DÜŞÜK] Veri hijyeni: soft-delete edilmiş yorumlar sayılıyor
- **Kanıt:** `route.ts:45,47-62` sorgularında `deletedAt IS NULL` yok. Diğer müşteri uçları filtreliyor: `app/api/customer/journey-score/route.ts:21`, `app/api/customer/journey-timeline/route.ts:26`. Soft-delete yazan uç: `app/api/admin/feedbacks/route.ts`.
- **Sorun:** Admin'in toksik ya da sahte diye kaldırdığı yorumlar kullanıcının sayısını ve ortalamasını şişiriyor, diğer sayfalarla da çelişiyor.
- **Öneri:** Bütün Feedback sorgularına `deletedAt IS NULL` ekle. 2. bulgudaki birleşik yardımcı bu filtreyi tek yerden uygulamalı.
- **Efor:** S

### 11. [DÜŞÜK] İstemci veri katmanı ve küçük performans konuları
- **Kanıt:** `page.tsx:36-45` (AbortController yok, `r.ok` kontrolü yok), `route.ts:83-89` (topDealer adı için `Promise.all` sonrası ardışık ikinci tur), `schema.prisma` `SquadBattleParticipant` modelinde yalnız `@@unique([battleId, userId])` var, `userId` ile başlayan indeks yok (`route.ts:78` sayımı userId+createdAt ile yapılıyor).
- **Sorun:** Bileşen unmount olursa `setState` uyarısı çıkabilir. Ağdan geri dönüşte yeniden doğrulama yok. Ek bir DB turu ve büyüyen tabloda sıralı tarama maliyeti var (bugün küçük).
- **Öneri:** Projedeki standart veri kancasını (SWR/React Query ya da mevcut fetch yardımcısını) kullan. TopDealer'ı aynı SQL'de `JOIN "User"` ile getir. `@@index([userId, createdAt])` ekle (migration canlı Neon'a, onaylı akışla).
- **Efor:** S

### 12. [DÜŞÜK] Tutarlılık, dil ve erişilebilirlik
- **Kanıt:** `page.tsx:73` "geri bildirimi**niz**e" (siz) ile `page.tsx:88,102` "puan**ın**", "ettiğ**in**" (sen) aynı ekranda. `page.tsx:50` "QRateX" yazımı, `route.ts:11` ise "QRATEX". `page.tsx:91,94` iki farklı metrikte aynı `Trophy`. `page.tsx:86` ortalama puan için `Sparkles`. `page.tsx:71-73` dev sayı ile cümlesi ayrı `<p>`. `lib/admin-toast.ts:20` müşteri sayfasında admin toast'ı ve "Basarili" ASCII öneki. `messages/en.json:2577` EN menü var, sayfa i18n dışında. `page.tsx:48` `p-6` layout dolgusunun üstüne ekleniyor.
- **Sorun:** Ses tonu tutarsız, marka yazımı tutarsız, ikon anlamı karışık. Ekran okuyucu "12" sayısını cümlesiz okuyor. EN kullanıcı Türkçe sayfa görüyor.
- **Öneri:** Müşteri paneli için "sen" dilini sabitle, metinleri `useAppT` anahtarlarına taşı (`customerMyYear.*`). Kahraman bloğunu `<section aria-labelledby>` + `<h2>` yap, sayı ile metni tek bir cümle öğesinde birleştir (`<p><strong>12</strong> işletme…</p>`). İkonlara `aria-hidden` ekle. Metrik başına tek ikon seç (Kalkan/Kılıç → klan savaşı, Star → puan). Müşteri tarafı için prefikssiz bir toast sarmalayıcısı kullan.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Hikâye formatında açıklanma (Spotify Wrapped, Duolingo YIR):** Tam ekran dikey slaytlar, dokun/kaydır ile ilerleme, ilerleme çubukları, her slaytta tek bir büyük gerçek ve kişisel yorum ("Kahve tutkunusun: yılın 38 günü kafedeydin").
2. **Paylaşılabilir kart (Wrapped, Strava Year in Sport):** 9:16 PNG (Instagram Story) ve 1:1. Kişisel en iyiler, favori mekân, karakter rozeti, QR/referral kodu gömülü. Mevcut `character-share-card` altyapısı genelleştirilebilir. Referral ile bağlanırsa büyüme döngüsü kurulur.
3. **Kıyas ve yüzdelik (Duolingo "ilk %X", Strava):** "Yanıt alan yorumcuların ilk %10'undasın", "Geçen yıla göre +%40 yorum". Topluluk yüzdelikleri gece cron'uyla hesaplanmış histogramlardan gelmeli, canlı sorgudan değil.
4. **Kişilik/arketip (Spotify "Listening Personality"):** Kategori dağılımı, saat/gün deseni ve karakter rozeti kategorisi tek bir "Qratex kişiliği"ne bağlanmalı ("Gece Kuşu Gurme"). Veri zaten var: `characterCategory`, Consumption saatleri, kategori kırılımı (`app/api/customer/analytics/route.ts`).
5. **Etkinin somut kanıtı (Starbucks/Monzo tonu):** Sadece sayı değil, **gerçek bir yanıt alıntısı**: "Kafe X sana şöyle yazdı: '…'". Varsa gerçekleşen telafi (RemedyOffer) ya da açılan ActionItem: "Yorumun sonrası menüye vegan seçenek eklendi". Bu, sayfanın vaat ettiği "gerçek etki"nin tam karşılığı olur.
6. **Zaman dokusu ve ödül:** Aylara göre etkinlik ısı haritası (GitHub contribution tarzı, yalnız SVG). Yıl sonu "özet açıldı" rozeti ve küçük bir puan (escrow/tek-seferlik kredi kurallarına uygun, atomik `points_credited` ile). Geçmiş yılların arşivi.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Aralık ortasından Şubat ortasına kadar müşteri ana sayfasında beliren "2026 hikâyen hazır" kartı ile açılan, 60-90 saniyelik kişisel bir hikâye. Sonunda kullanıcı paylaşılabilir bir kart ve bir sonraki yıl için 1-2 eylem önerisi alıyor. Yıl içinde ise aynı sayfa sessiz bir "yıl içi durum" görünümü olarak kalıyor.

**Yerleşim (mobil öncelikli):**
1. **Kapak:** "2026 · Senin Qratex yılın", yıl seçici chip'leri, "Başla" CTA'sı. Hikâye görüldüyse altta ızgara özeti açık gelir.
2. **Slaytlar (her biri tek gerçek):**
   - (a) "Sesin duyuldu": N işletme, %X yanıt, 1 gerçek yanıt alıntısı
   - (b) Yorum sayısı ve ortalama puan, "en cömert olduğun ay"
   - (c) Favori 3 mekân (logo ve kategori)
   - (d) Seviye yolculuğu 7 → 12 ve XP eğrisi
   - (e) Seri ve aylık ısı haritası
   - (f) Rozetler (karakter rozeti vitrini)
   - (g) Oyun/klan özeti
   - (h) Kişilik arketipi ve topluluk yüzdeliği
   - (i) Paylaşım kartı ve "2027 hedefin" önerisi
3. **Izgara görünüm:** Hikâyeyi atlayan ya da tekrar bakan için mevcut kart ızgarası. Yıl içi değişimler (+/−) ve her kartta ilgili sayfaya derin bağlantı (`/customer/feedbacks`, `/customer/badges`, `/customer/squads`).

**Motion/3D (yerinde ve ölçülü):**
- Slayt geçişleri `m as Motion` + `AnimatePresence` ile yatay kaydırma ve opaklık (~250 ms).
- Sayı açılışlarında mevcut `AnimatedNumber` (spring).
- Arketip slaytında tek ve kısa bir konfeti ya da parıltı.
- 3B **gerekmiyor**: rozet slaytında mevcut rozet görselleri yeterli. Three.js yalnız arketip "küre"sinde, rozet reveal bileşeni zaten yüklüyse yeniden kullanılmalı, sırf bu sayfa için yeni bir sahne kurulmamalı.
- `useReducedMotion` açıksa slaytlar anında, count-up olmadan ve otomatik ilerlemesiz gösterilir.
- Klavye: ←/→ ile gezinme, Esc ile ızgaraya dönüş. Slayt değişimi `aria-live="polite"` ile duyurulur.

**Veri/API değişiklikleri:**
- `GET /api/customer/my-year?year=YYYY`: İstanbul saat dilimiyle `[başlangıç, bitiş)` aralığı. Birleşik yorum CTE'si (Feedback `deletedAt IS NULL` + ConsumptionReview). Doğru oran (`repliedReviewCount/totalReviews`). `respondingDealerCount`. `topPlaces[3]` (consumption + review, ad ve logo tek JOIN'de). `levelStart/levelEnd`. `monthlyActivity[12]`. `replyQuote` (en yeni ve en uzun yanıttan kısa bir alıntı). `percentiles` (önceden hesaplanmış).
- Yanıt sözleşmesi zod ile `lib/contracts/my-year.ts` içinde.
- **Kalıcılık:** Puanlar için `PointsLedger` (4. bulgu). Kapanan yıllar için `UserYearSnapshot(userId, year, payload Json, createdAt)`: 1 Ocak cron'u (İstanbul) dondurur, kapanmış yıl isteği snapshot'tan döner (değişmeyeceği için Redis TTL uzun). Bu tablo hem 90 gün retention riskini hem yıl başı seviyesi/serisi eksikliğini çözer.
- **Yüzdelikler:** Gece cron'u yalnız histogramları (ör. yorum sayısı kovaları) Redis'e yazar, uç bunları okur. Kullanıcı başına sıralama sorgusu atılmaz.
- **Paylaşım:** `lib/share-card/` altında ortak canvas çizici (character-share-card'dan çıkar). Harici asset yok, R2 görselleri `crossOrigin` ile. `navigator.share` → indirme → metin yedeği.
- **Ödül (opsiyonel):** Özeti ilk açışta tek seferlik rozet/puan. `@@unique(userId, year)` ile atomik kredi ve `points_credited` izi (puan ekonomisi kurallarına uygun).

---

## Çakışmalar / birleştirme önerisi

- **/customer/analytics:** 365 günlük dönem seçeneği var (`app/customer/analytics/page.tsx:186-195`) ve aynı `points_credited` toplamını kendisi hesaplıyor (`app/api/customer/analytics/route.ts:139-158`). my-year'ın bugünkü ızgarası bunun kayan 365 günlük görünümüyle büyük ölçüde örtüşüyor. **Öneri:** Kalıcı ve dönem seçmeli istatistikler analytics'te kalsın. my-year **yalnız takvim yılı hikâyesi ve paylaşım** olarak konumlansın. Puan toplamı ve birleşik yorum hesabı iki uç tarafından ortak yardımcıdan (`lib/customer-stats/`) çağrılsın.
- **/customer/progress-hub, /customer/journey-score:** Seviye/XP ve yorum yolculuğu metrikleri örtüşüyor (`journey-score` zaten `deletedAt: null` filtreliyor). Hikâyenin seviye ve etki slaytları bu sayfaların hesaplarını yeniden kullanmalı, yeniden yazmamalı.
- **/customer/spending-overview:** `totalSpent` yalnız burada anlamlı. my-year'da harcama göstermek isteniyorsa buradan alınmalı (şu an my-year'da ölü alan).
- **Menü:** "analytics" grubunda 5 benzer girdi var (`sidebar.tsx:287-291`). my-year'ın kalıcı menü girdisi yerine **mevsimsel giriş noktası** (Aralık-Şubat arasında ana sayfa kartı ve bildirim) önerilir. Yıl içinde analytics sayfasından "Yılın özeti" bağlantısıyla erişilebilir. Sayfa kaldırılmamalı. Doğru konumlandırılırsa sistemin en paylaşılabilir ekranı olabilir.

---

## Doğrulama (şüpheci inceleme)

Dört iddia kod baştan okunarak çürütülmeye çalışıldı. Kod çalıştırılmadı, veritabanına dokunulmadı. Ciddiyet notu: dördü de **veri doğruluğu** hatası, güvenlik açığı değil. Uç `getServerSession` ile korunuyor ve yalnız `session.user.id` verisini okuyor (`app/api/customer/my-year/route.ts:20-24`). Başka kullanıcının verisine erişim senaryosu yok. "KRİTİK" etiketi abartılı, doğru seviye **YÜKSEK/ORTA (yanlış bilgi gösterimi)**.

### 1. Etki oranı yanlış hesaplanıyor: **DOĞRULANDI**
- Pay: `COUNT(DISTINCT q."dealerId")`, yani yanıt veren benzersiz işletme sayısı (`route.ts:47-54`). Payda: `feedbackAgg._count`, yani toplam yorum sayısı (`route.ts:45`, `:91`). Formül: `route.ts:92`. Birimler uyuşmuyor (işletme / yorum).
- Ekrandaki metin bunu "yorumunun %X'i karşılık buldu" diye okuyor (`page.tsx:75`), dolayısıyla yorum oranı vaat ediyor.
- **Yeniden üretim:** Kullanıcı bu yıl tek bir işletmenin QR'ına 10 yorum yazıyor, işletme 10'unu da yanıtlıyor. `repliedDealers=1`, `total=10`, ekran: "1 işletme yanıt verdi. Toplam 10 yorumunun %10'u karşılık buldu." Doğrusu %100. Ters yön de mümkün değil ama sapma her zaman aşağı yönlü: kullanıcı aynı işletmeye ne kadar sadıksa oran o kadar düşük görünüyor. Sayfanın ana mesajını bozuyor.
- Ek gözlem (iddiada yok): Sorgular `Feedback.deletedAt` (`prisma/schema.prisma`, Feedback modeli, `deletedAt DateTime?`) filtresi uygulamıyor. Silinmiş yorumlar da sayıma giriyor.
- **Düzeltme yaklaşımı:** Oran için ayrı bir sayaç: `COUNT(*) FILTER (WHERE "dealerRepliedAt" IS NOT NULL)` / `COUNT(*)`, `deletedAt IS NULL` ile. "Yanıt veren işletme sayısı" ayrı bir alan olarak kalsın.

### 2. "En çok ziyaret ettiğin yer (N ziyaret)" yorum sayısını gösteriyor: **DOĞRULANDI**
- `topDealerRows`, `Feedback` + `QRCode` üzerinden en çok **yorum** yapılan işletmeyi buluyor (`route.ts:55-62`). Sayı `visits: Number(n)` olarak döndürülüyor (`route.ts:88`) ve "X ziyaret" diye basılıyor (`page.tsx:102-104`).
- Aynı ekrandaki "Ziyaret" kartı ise `Consumption` sayısı (`route.ts:63`, `:108`, `page.tsx:90`).
- **Yeniden üretim:** Fiziksel kartı olmayan, yalnız QR ile 4 yorum yazmış bir kullanıcı: "Ziyaret 0" kartı ile "En çok ziyaret ettiğin yer: X (4 ziyaret)" satırını aynı anda görür. Tersine, kartla 20 kez harcama yapıp hiç QR yorumu yazmayan kullanıcıda "en çok ziyaret" satırı hiç çıkmaz.
- **Düzeltme yaklaşımı:** "En çok ziyaret" `Consumption` üzerinden `GROUP BY "dealerId"` ile hesaplanmalı. Ya da etiket "En çok yorum yaptığın yer (N yorum)" olarak dürüstleştirilmeli. Tercihen ikisi ayrı satır.

### 3. Tüketim yorumları ve bayi yanıtları özete girmiyor: **DOĞRULANDI**
- Tüm yorum metrikleri yalnız `Feedback` tablosundan (`route.ts:45`, `:47-62`). `ConsumptionReview` modeli ayrı bir tablo ve kendi `rating`, `dealerReply`, `dealerRepliedAt` alanlarına sahip (`prisma/schema.prisma`, `model ConsumptionReview`).
- Tüketim yorumu yazma ucu yalnız `tx.consumptionReview.create` çağırıyor, paralel bir `Feedback` satırı oluşturmuyor (`app/api/customer/consumptions/[id]/review/route.ts:175`).
- Bayi bu yorumlara yanıt yazıyor ve `dealerRepliedAt` dolduruyor (`app/api/dealer/feedbacks/[id]/reply/route.ts:119-124` ADMIN yolu, `:143-149` DEALER yolu). Müşteriye "Tüketim yorumunuza işletme yanıt verdi" bildirimi de gidiyor, ama my-year bunu hiç saymıyor.
- **Yeniden üretim:** Yalnız fiziksel kartla alışveriş yapıp 5 tüketim yorumu yazan, 3'üne bayi yanıtı alan kullanıcı: "0 işletme geri bildiriminize yanıt verdi", "Geri bildirim 0", "Ortalama puanın —". Aynı kullanıcıya üç yanıt bildirimi gitmiş durumda. Üstelik karakter rozeti sistemi yalnız `ConsumptionReview` sayıyor; yani rozet kazanan kullanıcı bu sayfada "0 geri bildirim" görür.
- **Düzeltme yaklaşımı:** `Feedback (deletedAt IS NULL)` ile `ConsumptionReview` için `UNION ALL` yapan bir CTE (alanlar: dealerId, rating, dealerRepliedAt, createdAt). Toplam, ortalama, yanıt oranı ve yanıt veren işletme bu birleşik kümeden hesaplansın. Bu yardımcı `/customer/analytics` ile de paylaşılmalı.

### 4. Kazanılan puan silinebilir tablodan okunuyor ve iadeleri kazanç sayıyor: **DOĞRULANDI** (iade kısmı kesin, saklama kısmı koşullu)
- **İade kısmı (kesin):** Klan savaşı escrow'u meydan okuyandan `debitPoints` ile düşülüyor ve bu işlem **hiçbir analytics olayı yazmıyor** (`app/api/customer/squads/challenge/route.ts:116-118`). Kod tabanında `points_spent` olayını yazan tek bir yer yok. Yalnız my-year okuyor (`route.ts:72-76`). İade ise `event: 'points_credited', category: 'squad_battle_refund'` olarak yazılıyor (`lib/gamification-engine.ts:105-114`, `app/api/cron/squad-battles/route.ts:80-86`, `app/api/customer/squads/battles/[id]/respond/route.ts:93-100`). my-year sorgusu kategori filtresi uygulamıyor (`route.ts:66-70`).
  - **Yeniden üretim:** Kullanıcı 500 puanlık havuzla meydan okuyor (bakiye −500, olay yok), karşı klan reddediyor (bakiye +500, `points_credited` 500). Net kazanç 0, ama "Kazanılan puan" kartı +500 gösterir. Her red/sona erme döngüsü göstergeyi şişirir.
- **Saklama kısmı (koşullu):** `analyticsEventCleanupFn` her gün 03:00'te çalışıp **kategori ayrımı yapmadan** 90 günden eski tüm `AnalyticsEvent` satırlarını siliyor (`lib/inngest/functions.ts:134-142` → `app/api/internal/inngest/analytics-event-cleanup/route.ts:16` → `lib/analytics-event-retention.ts:9`, `:17-26`). Fonksiyon `app/api/inngest/route.ts:11` içinde kayıtlı. Admin ucu da elle silebiliyor (`app/api/admin/analytics/cleanup-events/route.ts:46`). Vercel cron'u (`vercel.json`, `/api/cron/daily`) bu temizliği çağırmıyor ve `db-cleanup` yorumu AnalyticsEvent'in silinmediğini söylüyor (`app/api/cron/db-cleanup/route.ts:11`). Dolayısıyla risk **Inngest Cloud'un canlıda bağlı olup olmamasına** bağlı. Bu repo içinden **doğrulanmadı**. Bağlıysa Ekim ayında "bu yıl kazanılan puan" yalnız Temmuz sonrasını kapsar.
- **`::int` dönüşümü:** Okunan tüm yazım noktalarında `data.points` tamsayı kaynaklardan geliyor (sabitler, `rewardPool`, `reward.points`, `action.amount`). Ondalık ya da metin değeri yazan bir yol bulunamadı. 500 riski şu an **gerçek değil, teorik**. Yine de `(data->>'points')::numeric` ve `jsonb_typeof` koruması ucuz bir sigorta.
- **Düzeltme yaklaşımı:** Kısa vadede `category <> 'squad_battle_refund'` filtresi ile gösterge düzelir. Doğru çözüm, analytics olayından bağımsız ve silinmeyen bir `PointsLedger` (credit/debit, kaynak, referans id, `@@unique` ile idempotent). Kazanç = pozitif kayıtlar − iade eşleşmeleri; harcama = debit kayıtları. Ayrıca `pointsSpent` alanı kalıcı olarak 0 döner (yazan yok). Ya kaldırılmalı ya da ledger'a bağlanmalı.


---

## Uygulama (Dalga 2)

**Hedef rota:** `/customer/me/year` (Ben → Yılım). Eski `/customer/my-year` artık sorgu parametrelerini koruyarak `permanentRedirect` yapıyor.

**Yeni yapı**
- `app/customer/me/year/page.tsx`: sunucu bileşeni. Yetki `requireAuth(['CUSTOMER'])` ile DB'den doğrulanıyor, dönem `?year=&month=` parametresinden alınıyor, özet sunucuda hesaplanıp küçük bir istemci adasına prop olarak geçiyor. Hata durumunda ayrı bir görünüm gösteriliyor. `loading.tsx` statik bir iskelet.
- `lib/customer-year/`: `period.ts` Europe/Istanbul dönem kurallarını, `derive.ts` saf türetmeleri, `contract.ts` zod yanıt sözleşmesini, `summary.server.ts` tek hesap kaynağını içeriyor.
- `app/api/customer/my-year/route.ts`: `defineRoute` ile yeniden yazıldı (yalnız CUSTOMER, zod sorgu, `read` hız sınırı, zarf v2). Aynı hesap kaynağını kullanıyor.
- `components/customer/m-yilim/`: kapak, dönem seçici, özet ızgarası, etkinlik çubukları, tam ekran hikâye (`year-story.tsx`, `next/dynamic` ile yalnız açılınca yükleniyor), slaytlar, ölçülü 2D canvas aurası, paylaşım kartı (canvas → PNG → Web Share API), TR/EN metinler.
- Testler: `__tests__/lib/customer-year.test.ts` (18) ve `__tests__/api/customer-my-year.test.ts` (10), prisma mock'lu. 28/28 geçiyor.
- Görsel doğrulama: bundler kullanmayan bir statik render tezgâhıyla yapıldı (sucrase + Tailwind CLI + headless Chrome). 390 px genişlikte sayfa, 9 slayt ve 1080×1920 paylaşım kartı (TR/EN) ekran görüntüsüyle kontrol edildi. Taşan çip, kırpılan kart etiketi ve büyük giriş başlığı bu sırada bulunup düzeltildi. Etkileşimli hikâye (geçiş, dokunma, otomatik ilerleme) canlı tarayıcıda çalıştırılmadı.

### Özellik envanteri: yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Rota yetkisi | ÇALIŞIYOR | Proxy'ye ek olarak sayfa `requireAuth(['CUSTOMER'])` çağırıyor. 401 durumunda `callbackUrl` ile girişe yönlendiriyor. |
| 2 | API oturum / IDOR | ÇALIŞIYOR | `defineRoute roles:['CUSTOMER']`. Bayi ve personel artık 403 alıyor, `userId` oturumdan geliyor. |
| 3 | Menü girdisi | ÇALIŞIYOR | Navigasyon kaydında `/customer/me/year` olarak duruyor ve `redirectFrom` tanımlı. Bu kayıt navigasyon ajanına ait, dokunulmadı. |
| 4 | Hero | ÇALIŞIYOR | Admin hero'su yerine play kaydında sinematik kapak: dönem, "Hikâyeyi başlat", "Kartı paylaş". |
| 5 | Veri yükleme | ÇALIŞIYOR | Veri sunucuda ilk render'da yükleniyor. Ham `useEffect`/`fetch` kaldırıldı. Dönem değişimi `useTransition` ile ve `aria-busy` gösteriliyor. |
| 6 | Yükleniyor | ÇALIŞIYOR | Kapak, çip ve ızgara iskeleti. Shimmer yok. |
| 7 | Hata durumu | ÇALIŞIYOR | `ErrorState` ve "Tekrar dene" (`router.refresh`) boş durumdan ayrı. API 500/503 dönüyor, "200 + sıfırlar" yok. |
| 8 | Boş durum | ÇALIŞIYOR | `EmptyState`: QR okut, mekân keşfet ve (varsa) geçmiş yıl CTA'ları. Sıfır kartlar gösterilmiyor. |
| 9 | Yanıt veren işletme | ÇALIŞIYOR | Feedback ile ConsumptionReview birleşik sayılıyor. |
| 10 | Etki oranı | ÇALIŞIYOR | Yanıt gelen yorum / toplam yorum. "10 yorumun 10'u = %100" testle kanıtlandı. |
| 11 | Seviye | ÇALIŞIYOR | Dönem içi `level_up` anlarından "Seviye 6 → 9". Bugünkü seviye artık "bu yıl" diye gösterilmiyor. |
| 12 | Yorum sayısı | ÇALIŞIYOR | Birleşik sayım, ikisinde de `deletedAt IS NULL`. Önceki dönemle kıyas var. |
| 13 | Ortalama puan | ÇALIŞIYOR | Birleşik ortalama. Yıldız ikonu, dağılım ve en çok verilen puan eklendi. |
| 14 | Ziyaret | ÇALIŞIYOR | Consumption sayısı, aktif gün sayısı, önceki dönem kıyası (DeltaBadge). |
| 15 | Rozet | ÇALIŞIYOR | Sayı ve rozet glifleri (BadgeGlyph). |
| 16 | Kazanılan puan | ÇALIŞIYOR | Kaynak PointsLedger (posted, `delta > 0`; escrow iadesi, ters kayıt ve açılış bakiyesi hariç) artı deftere geçmemiş eski `points_credited` olayları (ledgerId'siz, iade kategorileri hariç, `jsonb_typeof` ile güvenli). Kalan risk aşağıda. |
| 17 | En uzun seri | ÇALIŞIYOR | Dönem içindeki ardışık aktif gün serisi (ziyaret + yorum, İstanbul günü). Tüm zamanlar değeri kullanılmıyor. |
| 18 | Klan savaşı | ÇALIŞIYOR | Katılım ve zafer ayrı sayılıyor (`winnerId = squadId`). İkon Swords. |
| 19 | Favori mekân | ÇALIŞIYOR | İlk 3 mekân. Ziyaret ve yorum ayrı gösteriliyor, logo ve kategori aynı SQL'de geliyor, derin bağlantı `/customer/places/[id]`. |
| 20 | Harcanan puan | KALDIRILDI | Yazan bir yol yoktu, hep 0 dönüyordu. Harcama cüzdanın konusu, Yılım anlatısına girmiyor. |
| 21 | Ölü alanlar | KALDIRILDI | `memberSince` artık yıl seçiciyi besliyor. `xp`, `currentPoints`, `currentStreak`, `totalSpent` kaldırıldı (harcama spending-overview'a ait). Sözleşme zod ile tanımlı. |
| 22 | `?period=all` | KALDIRILDI | Tüm zamanlar görünümü analytics'e ait. Yerine yıl ve ay seçimi geldi. |
| 23 | Yıl seçici | ÇALIŞIYOR | Yıl ve ay çipleri, üyelik ve bugünle sınırlı. 1 Ocak – 15 Şubat arası varsayılan dönem geçen yıl. Geçersiz istek varsayılana düşüp duyuruluyor. |
| 24 | Paylaşım kartı | ÇALIŞIYOR | 1080×1920 PNG, yalnız sıfır olmayan gerçek değerler. Ad ve yorum metni yok. Paylaşım Web Share API ile. Dosya paylaşımı yoksa etiket dürüstçe "Kartı kaydet" oluyor. |
| 25 | Hikâye / motion | ÇALIŞIYOR | En fazla 9 slayt, verisi olmayan slayt atlanıyor. Dokun/kaydır/basılı tut, ←/→/Home/End, Esc, görünür önceki/duraklat/sonraki düğmeleri, `aria-live`. Azaltılmış harekette otomatik ilerleme, kayma ve sayaç yok, canvas tek statik kare. |
| 26 | Derin bağlantı | ÇALIŞIYOR | Hedefler: Seslerim, Rozetler, Cüzdan/Hareketler, Lig, Klan, mekân sayfası. |
| 27 | i18n | ÇALIŞIYOR | Metinler TR/EN yerel tabloda (`copy.ts`), sayfa dili `getServerLocale` ile seçiliyor. Paylaşılan katalog değişmedi. Ton "sen". |
| 28 | Önbellek / DB kesintisi | ÇALIŞIYOR | `no-store` ve 503 retryable. Kapanmış dönem Redis'te 6 saat önbellekleniyor (`my-year:v1:{user}:{dönem}`). |
| 29 | Mobil | ÇALIŞIYOR | Çift `p-6` kaldırıldı. 390 px'te yatay taşma yok (tezgâhta ölçüldü). Hikâye mobilde tam ekran, masaüstünde 9:16 pano. |
| 30 | Erişilebilirlik | ÇALIŞIYOR | h1/h2 hiyerarşisi, `aria-hidden` ikonlar, sayı ve cümle aynı öğede, ekran okuyucu yalnız son değeri okuyor. Dialog odak tuzağı, dokunma hedefleri 44 px veya üstü. |
| 31 | Kıyas / yüzdelik | KISMİ | Önceki dönem kıyası (ziyaret, yorum) yapılıyor. Topluluk yüzdeliği yok: gece histogram cron'u gerekiyor, sahte veri yasak. |

**Sonuç:** ÇALIŞIYOR 27 · KALDIRILDI 3 · KISMİ 1 (31 özellik)

### Kapanan bulgular
1 (etki oranı), 2 (tüketim yorumları), 3 (favori = ziyaret), 6 (Wrapped deneyimi), 7 (hata/boş ayrımı), 8 (ölü/sahte alanlar, zod sözleşmesi), 10 (soft-delete), 12 (ton, ikon, a11y, i18n, admin toast) tam kapandı.

Kısmen kapananlar:
- **4:** İade ve sayısal olmayan değer düzeltildi, defter kalıcı kaynak oldu. Eski olaylar hâlâ 90 gün retention'a açık.
- **5:** Seviye, lig ve seri artık döneme ait. Ancak An Motoru ve defter öncesi dönemler için başlangıç seviye/lig bilgisi yok; bu durumda dürüstçe gösterilmiyor.
- **9:** İstanbul sınırları, yıl/ay seçimi, varsayılan geçen yıl ve kapanmış dönem önbelleği tamam. Snapshot tablosu yapılmadı.
- **11:** Veri katmanı ve topDealer tek SQL'de toplandı. İndeks için şema isteği gerekiyor.

### Kalanlar
- **Eski `points_credited` olayları 90 gün retention ile silinebilir.** Defter öncesi dönemlerin puan toplamı eksik kalabilir. `lib/analytics-event-retention.ts` paylaşılan bir dosya olduğu için dokunulmadı. Öneri: retention işinde `event='points_credited'` satırlarını hariç tutmak.
- **Topluluk yüzdeliği ("ilk %X")** için gece histogram cron'u gerekiyor.
- **Yıl sonu "özet açıldı" rozeti/puanı yapılmadı.** Ekonomi akışı ve tek-seferlik unique anahtar ister.
- **Paylaşım kartına referral bağlantısı** gizlilik kararı bekliyor.
- **RemedyOffer/ActionItem kanıtı:** "Yorumun sonrası menü değişti" anlatısı için eklenmedi.
- **Lig/seviye başlangıcı** yalnız defter ve An Motoru kayıtlarının kapsadığı dönemlerde gösteriliyor.

### Şema istekleri
- `SquadBattleParticipant @@index([userId, createdAt])` (bulgu 11).
- Opsiyonel `UserYearSnapshot(userId, year, payload Json, createdAt, @@unique([userId, year]))`: kapanmış yılları dondurmak ve yıl başı seviye/lig değerini kalıcı tutmak için.
