# /admin/analytics

**Amaç:** Platform operatörüne kullanıcı, geri bildirim, QR tarama, bayi performansı, kök neden ve fiziksel kart sistemi hakkında dönemsel bir analitik görünüm sunmak.
**Genel puan:** 4.5 / 10
**Karar:** **Yeniden tasarla.** Sayfa iskeleti (hero, sekmeler, kart düzeni) kullanılabilir durumda. Ama sayfanın asıl işi olan sayıların önemli bir kısmı yanlış, tutarsız ya da yanıltıcı: "En İyi Bayiler" rastgele seçilen bayilerden oluşuyor, karşılaştırma kartları birbirinden farklı veri kümelerini kıyaslıyor, sparkline'lar başka bir metriği gösteriyor, saat ve gün kovaları UTC'ye göre ayrılıyor. Veri katmanı yeniden kurulmalı ve UI bu katmanın üstüne yeniden düzenlenmeli.

İncelenen dosyalar: `app/admin/analytics/page.tsx` (999 satır, tamamı client), `app/admin/layout.tsx`, `app/api/admin/analytics/route.ts` (567 satır), `app/api/admin/analytics/cleanup-events/route.ts`, `lib/chart-palette.ts`, `lib/redis.ts`, `lib/api-auth.ts`, `lib/sentiment-percentages.ts`, `proxy.ts`, `components/providers.tsx`, `components/admin/admin-premium-hero.tsx`, `components/ui/progress.tsx`, `prisma/schema.prisma` (Feedback, ConsumptionReview, PhysicalCard, User, Role, CardStatus), `tailwind.config.ts`. Çakışma analizi için `app/admin/admin-dashboard-client.tsx`, `app/admin/components/AnalyticsSection.tsx`, `app/admin/insights/page.tsx`, `app/admin/platform-pulse/page.tsx` ve `app/admin/dealers-health/page.tsx` dosyalarına da bakıldı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Tüm bölümler veri gösteriyor. Ama "En İyi Bayiler" rastgele, karşılaştırmalar asimetrik, sparkline'lar yanlış metrik, soft-delete edilmiş kayıtlar sayıma giriyor ve saatler UTC'ye göre. |
| UX | 5/10 | Sekmeli yapı anlaşılır. Ama hangi kartın seçilen dönemi izlediği, hangisinin tüm zamanı gösterdiği belli değil. Drill-down, dışa aktarma ve hata mesajı yok. Dönem değişince ekranda eski veri sessizce kalıyor. |
| Görsel | 6/10 | Admin hero ve kart dili tutarlı, renkler `chart-palette` üzerinden geliyor. Isı haritasının eksen etiketleri hizasız, trend grafiğinde eksen yok, donut "Toplam" etiketi yanıltıcı. |
| Mimari | 4/10 | Tek bir 26 sorguluk "god endpoint" var. `sections` optimizasyonu sunucuda gerçek bir kazanç sağlamıyor. Sınırsız `findMany` ile JS içinde O(gün × satır) gruplama yapılıyor. `any` kaçakları var, i18n yok. |
| Performans | 4/10 | Redis 120 sn'lik önbellek iyi niyetli. Ama önbellek kaçtığında 1y için 730 günlük tüm Feedback satırları belleğe çekiliyor ve 365 × N filtreden geçiyor. Her sekme tıklaması yeni bir ağ isteği açıyor. |
| Erişilebilirlik + Mobil | 4/10 | Mobilde 3 sekmenin erişilebilir adı yok. Grafik bilgileri yalnızca hover ile görülüyor (dokunmatik ve klavyede erişilemiyor). Yenile ikon butonunda `aria-label` yok. Global `MotionConfig reducedMotion="user"` var, ama sayaç `setInterval` ile çalıştığı için buna uymuyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişimi (ADMIN rolü + gizli kapı cookie'si) | ÇALIŞIYOR | `proxy.ts:60-88` | `/admin/*` için rol ve gate cookie kontrol ediliyor. |
| 2 | API yetkisi | KISMİ | `route.ts:29`, `proxy.ts:105-119` | Yalnızca `requireAuth(['ADMIN'])` var. Gate cookie `/api/*` yolunda kontrol edilmiyor (sistem genelinde, bkz. B-5). |
| 3 | Hero başlık + dönem açıklaması | ÇALIŞIYOR | `page.tsx:407-416` | Analitik sayfasında `Shield` ikonu kullanılmış, anlamsal olarak uyumsuz. |
| 4 | Dönem seçici (7g/30g/90g/1y) | KISMİ | `page.tsx:419-430`, `route.ts:58-78` | Seçim çalışıyor. Ama Toplam Kullanıcı, QR Tarama, En İyi Bayiler, Kart Sistemi, Kullanıcı Dağılımı ve Son Aktiviteler dönemden etkilenmiyor ve UI bunu belirtmiyor. |
| 5 | Yenile butonu | KISMİ | `page.tsx:431-438`, `route.ts:43-50` | `refetch` sunucuda 120 sn'lik Redis önbelleğine düşüyor, yani veri yenilenmiyor. Dönen ikon yok (`isFetching` kullanılmıyor), `aria-label` yok. |
| 6 | Tam sayfa yükleniyor durumu | ÇALIŞIYOR | `page.tsx:363-376` | Yalnızca spinner var. Yerleşimi koruyan skeleton yok, bu da CLS'e yol açıyor. |
| 7 | Hata durumu | BOZUK | `page.tsx:331` (`fetchError` hiç kullanılmıyor), `378-390` | İlk yüklemede hata olursa "Veri Bulunamadı" gösteriliyor, neden yazmıyor. Önceki veri varken hata olursa tamamen sessiz kalıyor. 401/403 durumunda HTML ya da farklı bir şekil dönerse `res.json()` patlıyor (`page.tsx:338`). |
| 8 | Dönem değişirken geçiş göstergesi | EKSİK | `page.tsx:330`, `343` | `placeholderData` ile eski dönemin verisi gösteriliyor, ama hero yeni dönem etiketini yazıyor. Uyuşmazlık var ve bir gösterge yok. |
| 9 | KPI: Toplam Kullanıcı (değer) | ÇALIŞIYOR | `route.ts:97`, `page.tsx:446` | Tüm zamanlar. |
| 10 | KPI: Toplam Kullanıcı büyüme rozeti | KISMİ | `route.ts:168-170`, `page.tsx:446` | Bu oran yeni kayıtların dönemsel büyümesi, ama toplamın yanında "toplam büyüdü" gibi okunuyor. Önceki dönem 0 ise sabit olarak %100 yazıyor. |
| 11 | KPI: Toplam Kullanıcı sparkline | SAHTE | `page.tsx:446` | `trend: data.dailyData.map(d => d.feedbacks)`: kullanıcı kartı geri bildirim eğrisini çiziyor. |
| 12 | KPI: Geri Bildirim (değer) | KISMİ | `route.ts:100`, `508` | `feedback.count()` soft-delete filtresi uygulamıyor. Üstüne tüm zamanların ConsumptionReview sayısı ekleniyor. |
| 13 | KPI: Geri Bildirim büyüme rozeti | KISMİ | `route.ts:101-102`, `172-174` | Yalnızca Feedback tablosuna bakıyor. Değer (12) ise yorumları da içeriyor. |
| 14 | KPI: Geri Bildirim sparkline | ÇALIŞIYOR | `page.tsx:447` | Dönemsel günlük geri bildirim. UTC kovası sorunu var (bkz. 28). |
| 15 | KPI: QR Tarama | KISMİ | `route.ts:105`, `page.tsx:448` | Tüm zamanların `scanCount` toplamı, dönemden bağımsız. Sparkline yine geri bildirim verisini gösteriyor (sahte eğri). |
| 16 | KPI: Ortalama Puan + değişim rozeti | KISMİ | `route.ts:187-189`, `340` | Mevcut dönem ConsumptionReview içeriyor, önceki dönem içermiyor (bkz. B-2). |
| 17 | AnimatedNumber sayacı | ÇALIŞIYOR | `page.tsx:135-158` | `setInterval` tabanlı olduğu için azaltılmış hareket tercihine uymuyor. `decimals` parametresi hiç kullanılmıyor. |
| 18 | Sekmeler + bölüm bazlı tembel yükleme | KISMİ | `page.tsx:313-353`, `route.ts:39-50`, `506-547` | Sunucu önbellek kaçtığında yine tüm bölümleri hesaplıyor. Her yeni sekme yeni bir `queryKey` ve ağ isteği demek, araya bir "Yükleniyor..." karesi giriyor. Kazanç yalnızca payload boyutunda. |
| 19 | Mobil sekme etiketleri | BOZUK | `page.tsx:522-524` | Trendler, Bayiler ve Kök Neden etiketleri `hidden sm:inline` olduğu için mobilde sekmenin erişilebilir adı kalmıyor. 5 sekme 2 sütuna yerleştiği için 2+2+1 düzeninde dengesiz duruyor. |
| 20 | Duygu dağılımı donut | BOZUK | `page.tsx:305`, `392-396`, `route.ts:515-519` | Donut'a yüzdeler veriliyor ve merkezde "Toplam" olarak yüzdelerin toplamı (~99-101) yazıyor. Bu bir kayıt sayısı değil. |
| 21 | Duygu lejantı (yüzdeler) | KISMİ | `route.ts:192-195`, `515-519` | Yuvarlamadan sonra toplam 100 etmeyebilir. Projede `normalizeSentimentTriplet` (`lib/sentiment-percentages.ts:3`) var ama kullanılmıyor. `sentiment` null ise nötr sayılıyor. Silinmiş kayıtlar dahil. ConsumptionReview'ın AI `sentiment` alanı yok sayılıp duygu puandan türetiliyor (`route.ts:179-183`, `schema.prisma` ConsumptionReview.sentiment). |
| 22 | Puan dağılımı barları | KISMİ | `page.tsx:570-585`, `route.ts:198-204` | Hesap doğru, ama soft-delete edilmiş Feedback'ler dahil (`route.ts:116-119`). |
| 23 | Kullanıcı dağılımı donut + lejant | KISMİ | `page.tsx:398-402`, `603-607`, `schema.prisma:22-27` | `Role` enum'unda STAFF var ama grafikte gösterilmiyor. Donut toplamı Toplam Kullanıcı'ya eşit çıkmıyor. |
| 24 | Karşılaştırma: Geri Bildirim | BOZUK | `route.ts:144-147`, `315-322`, `331-336` | `current` değeri yorumları içeriyor, `previous` içermiyor (yorumlar yalnızca `gte startDate` ile çekiliyor). `change` ise yalnızca Feedback'ten hesaplanmış başka bir oran. Aynı kartta tutarsız üç sayı var. |
| 25 | Karşılaştırma: Ortalama Puan | KISMİ | `route.ts:324-341` | Aynı asimetri. Değişim mutlak puan farkı değil, yüzde olarak veriliyor. |
| 26 | Karşılaştırma: Yeni Kullanıcı | ÇALIŞIYOR | `route.ts:342-346` | |
| 27 | Karşılaştırma ikon renkleri | KISMİ | `page.tsx:635-636` | `bg-${item.color}-500/10` dinamik sınıf. Aynı sınıflar dosyada başka yerlerde literal olarak geçtiği için tesadüfen üretiliyor. `safelist` yok (`tailwind.config.ts:11`), kırılgan. |
| 28 | Günlük trend bar grafiği | KISMİ | `page.tsx:657-696`, `route.ts:217-242` | Gün sınırları sunucu saat dilimine göre (Vercel'de UTC, TZ ayarı yok). Tooltip yalnızca CSS hover ile açılıyor. Y ekseni ve ölçek yok. 1y seçilince 365 animasyonlu `m.div` render ediliyor. |
| 29 | Aktivite ısı haritası | KISMİ | `page.tsx:201-252`, `route.ts:245-251` | `getHours()` UTC döndüğü için tüm satır 3 saat kayıyor. Veri 2 dönemlik (`prevStartDate`'ten itibaren). Saat etiketleri (5 adet `flex-1`) 24 sütunla hizalı değil. 168 hücre ayrı ayrı animasyonlu. Bilgi yalnızca `title` ile veriliyor (dokunmatikte yok). `cursor-pointer` var ama bir aksiyonu yok. |
| 30 | Isı haritası lejantı (Az/Çok) | ÇALIŞIYOR | `page.tsx:241-249` | |
| 31 | En İyi Bayiler | BOZUK | `route.ts:111-115`, `256-284` | `take: 10` sorgusunda `orderBy` yok, yani rastgele 10 DEALER alınıyor ve bunların içinden ilk 5 seçiliyor. Dönem filtresi yok. Gerçek "en iyi" bayiler listede olmayabilir. |
| 32 | Tenant Benchmark ve Anomali | KISMİ | `route.ts:421-504`, `page.tsx:770-832` | `take: 250` sırasız. Sıfır geri bildirimli bayiler `avgRating: 0` alıyor, büyük negatif `deviation` ile "Normal" rozetli ama kırmızı sapma göstererek listenin üstüne çıkıyor. Segment ham ve büyük/küçük harf duyarlı (`insights` sayfası `LOWER()` kullanıyor). `'general'` İngilizce gösteriliyor. |
| 33 | Anomali rozeti (z-skoru) | ÇALIŞIYOR | `route.ts:477-484` | Eşikler asimetrik (-1.2 / +1.8) ve açıklanmamış. Bayinin kendisi segment ortalamasına dahil. |
| 34 | Kök Neden zinciri | KISMİ | `route.ts:356-418`, `page.tsx:836-881` | "Konu → Şube → Zaman" bir zincir gibi sunuluyor ama bayi ve zaman dilimi konu bazında birbirinden bağımsız argmax ile seçiliyor. Etki puanı = dönem sayısı ÷ tüm zamanların toplamı × 1000 (keyfi). 00-06 saatleri "Sabah" sayılıyor, UTC kayması var. Topics ham (şemadaki örnek İngilizce anahtar). Sorgu 1200 satırla sessizce sınırlanıyor. |
| 35 | Kart Sistemi KPI'ları (6 kutu) | ÇALIŞIYOR | `page.tsx:891-912`, `route.ts:137-160` | Tüm zamanlar, dönem uygulanmıyor. |
| 36 | Kart durum barları | ÇALIŞIYOR | `page.tsx:915-939` | |
| 37 | Kart sistemi boş durumu | ÇALIŞIYOR | `page.tsx:941-948` | |
| 38 | Kart sistemi hata davranışı | KISMİ | `route.ts:163-165` | Sorgu hatası yutuluyor ve sıfırlarla devam ediliyor. UI bunu "Kart Sistemi Aktif Değil" olarak gösteriyor. Hata ile boş durum birbirine karışıyor. Hata ayrıca 120 sn önbelleğe alınıyor. |
| 39 | Son Aktiviteler | KISMİ | `route.ts:287-312`, `page.tsx:953-995` | Yalnızca 3 kayıt + 3 tüketim içeriyor. UI'daki `feedback` dalı ölü (API bu tipi hiç üretmiyor). Bilinmeyen tipte ikon kutusu boş kalıyor. Öğeler tıklanamıyor. Göreli zaman önbellek anında dondurulup metin olarak kaydediliyor. |
| 40 | Bölüm içi "Yükleniyor..." / boş metinleri | ÇALIŞIYOR | `page.tsx:724-733`, `779-782`, `848-851`, `962-965` | |
| 41 | Redis önbelleği | KISMİ | `route.ts:42-50`, `542` | `period` doğrulanmıyor. Rastgele değerler ayrı anahtar açıp 30g hesabını yeniden yapıyor. Yenile ile önbellek atlatılamıyor. "Son güncelleme" bilgisi dönmüyor. |
| 42 | Dışa aktarma (CSV/PDF) | EKSİK | `page.tsx:26` | `Download` import edilmiş ama hiç kullanılmıyor. |
| 43 | Grafik öğelerine tıklama / drill-down | SAHTE | `page.tsx:234`, `297`, `678` | Isı haritası, donut ve bar'da `cursor-pointer` var ama tıklama bir şey yapmıyor. |
| 44 | Özel tarih aralığı | EKSİK | `page.tsx:424-429` | Yalnızca 4 sabit ön ayar var. |
| 45 | Segment / kategori / bayi filtresi | EKSİK | | |
| 46 | URL durumu (period/tab paylaşılabilir link) | EKSİK | `page.tsx:323-324` | Durum yalnızca `useState` içinde tutuluyor. |
| 47 | i18n | EKSİK | Tüm metinler sabit kodlu | Kardeş sayfa `platform-pulse` `t()` kullanıyor. Başlıklarda TR/EN karışık: "Root Cause Graph", "Tenant Benchmark". |
| 48 | Sayfa `<title>` metadata'sı | EKSİK | `page.tsx:1` (`'use client'`) | Layout şablonunun varsayılan değeri ("Admin") görünüyor. |
| 49 | Ürün analitiği (DAU/WAU, retention, funnel, AnalyticsEvent) | EKSİK | | `cleanup-events` ucu var, ama bu sayfada olay verisi ya da saklama süresi görünümü yok. |
| 50 | Veri tazeliği / önbellek yaşı göstergesi | EKSİK | | |

**Durum sayıları:** ÇALIŞIYOR 13 · KISMİ 21 · BOZUK 5 · SAHTE 2 · EKSİK 9 (toplam 50)

---

## Bulgular

### B-1 · KRİTİK · Veri doğruluğu · "En İyi Bayiler" rastgele seçilen bayilerden oluşuyor
- **Kanıt:** `route.ts:111-115` (`prisma.user.findMany({ where: { role: 'DEALER' }, take: 10, select: ... })`, `orderBy` yok), `route.ts:256-284` (bu 10 kişi kendi içinde sıralanıp ilk 5'i alınıyor). Dönem filtresi yok (`route.ts:257-269`).
- **Sorun:** Postgres `ORDER BY` olmadan herhangi 10 satırı döndürebilir. Bayi sayısı 10'u geçtiğinde liste platformun gerçek en iyi bayilerini göstermez. Operatör bu listeye bakarak ödül, öne çıkarma veya sağlık kararı verirse yanlış veriye dayanmış olur. Liste ayrıca seçilen dönemi yok sayıyor.
- **Öneri:** Sıralamayı veritabanına taşıyın. `SELECT q."dealerId", COUNT(*), AVG(rating), COUNT(*) FILTER (WHERE sentiment='positive') ... WHERE f."createdAt" >= $start AND f."deletedAt" IS NULL GROUP BY 1 ORDER BY <metrik> DESC LIMIT 10`. Sonra yalnızca bu id'ler için isimleri çekin. UI'da sıralama metriği (hacim / ortalama puan / olumlu oranı / Bayesian ortalama) seçilebilsin. Az örneklemli bayiler için minimum eşik ya da Bayesian düzeltme uygulayın. Her satır `/admin/dealers-health` veya bayi detayına bağlansın.
- **Efor:** S

### B-2 · YÜKSEK · Veri doğruluğu · Karşılaştırma ve trend metrikleri asimetrik veri kümelerini kıyaslıyor
- **Kanıt:** ConsumptionReview yalnızca mevcut dönem için çekiliyor (`route.ts:144-147`, `gte: startDate`) ama önceki dönemi de kapsayan `allTrendFeedbacks`'e ekleniyor (`route.ts:208-215`). `prevPeriodFeedbacks` bu yüzden yorumları hiç içermiyor (`route.ts:315-318`). Geri Bildirim kartında `current/previous` bu karma kümeden geliyor, `change` ise yalnızca Feedback'ten hesaplanan `feedbackGrowth` (`route.ts:332-336`). KPI değeri tüm zamanların Feedback (silinmiş dahil) ve yorum toplamı (`route.ts:100`, `508`).
- **Sorun:** Tüketim yorumu olan bir platformda "Geri Bildirim 120 vs 80, +%10" gibi kendi içinde çelişen bir kart oluşabilir. Ortalama puan karşılaştırması da sistematik olarak yanlı. Operatör büyümeyi gerçekte olduğundan farklı görür.
- **Öneri:** Tek bir "değerlendirme" kavramı tanımlayın: Feedback ∪ ConsumptionReview, her ikisi için de aynı filtrelerle (soft-delete hariç, isteğe bağlı olarak trustFlagged hariç). Bunu iki tarihli pencere için aynı SQL ile hesaplayın (`UNION ALL` + `FILTER (WHERE createdAt >= start)` / `FILTER (WHERE createdAt BETWEEN prevStart AND start)`). Her metrik için `{ current, previous, deltaAbs, deltaPct }` dönen tek bir `MetricComparison` sözleşmesi kurun. KPI kartları ile karşılaştırma kartları aynı nesneyi kullansın. Kaynak ayrımı (QR geri bildirimi / tüketim yorumu) bir toggle ile gösterilebilir.
- **Efor:** M

### B-3 · YÜKSEK · Veri doğruluğu · Soft-delete edilmiş geri bildirimler ana metriklere giriyor
- **Kanıt:** `Feedback.deletedAt` alanı var (`schema.prisma` Feedback modeli). `route.ts:100-102`, `116-119` ve `120-124` sorgularında `deletedAt: null` yok. `route.ts:267`, `359` ve `443` ise filtreliyor.
- **Sorun:** Toplam, büyüme, ortalama puan, duygu, puan dağılımı, trend ve ısı haritası silinmiş (moderasyonla kaldırılmış, toksik) kayıtları sayıyor. Bayi ve kök neden bölümleri saymıyor. Aynı sayfada iki farklı gerçeklik oluşuyor.
- **Öneri:** Analitik sorguları için ortak bir `activeFeedbackWhere` (en az `deletedAt: null`) sabiti tanımlayıp tüm uçlarda kullanın. Fraud politikası için `trustFlagged` ve `User.fraudStatus = 'shadow_ban'` kayıtlarını hariç tutan bir "temiz veri" anahtarı ekleyin. Varsayılanı belgelendirin.
- **Efor:** S

### B-4 · YÜKSEK · Veri doğruluğu · Saat ve gün kovaları UTC'ye göre ayrılıyor
- **Kanıt:** `route.ts:218-221` (`setHours(0,0,0,0)`), `247-249` (`getDay()`, `getHours()`), `387-388` (zaman dilimi). Projede TZ ayarı yok (`vercel.json`, `.env*` içinde `TZ=` bulunamadı). Bölge `fra1`. Kodun başka yerlerinde açıkça `Europe/Istanbul` kullanılıyor (`lib/surprise-badges.ts:120`, `lib/timezone.ts:44`).
- **Sorun:** Isı haritası 3 saat kaymış görünüyor (TR 20:00 yoğunluğu 17:00'de çıkıyor). Günlük trendde TR saatiyle 00:00-03:00 arası kayıtlar önceki güne yazılıyor. Kök nedendeki "Sabah/Öğlen/Akşam" etiketleri yanlış. Bu bölümlerin varlık nedeni olan "ne zaman" sorusuna yanlış cevap veriliyor.
- **Öneri:** Kovalamayı SQL'de `date_trunc('day', "createdAt" AT TIME ZONE 'Europe/Istanbul')` ve `EXTRACT(DOW/HOUR FROM ... AT TIME ZONE ...)` ile yapın. Saat dilimini platform ayarından okuyun ve API yanıtına `timezone` alanı olarak ekleyin. UI'da "Saatler: Europe/Istanbul" notunu gösterin. Zaman dilimlerine "Gece" kovasını da ekleyin.
- **Efor:** S

### B-5 · YÜKSEK · Güvenlik (sistem geneli) · Admin gizli kapısı API katmanında uygulanmıyor
- **Kanıt:** `proxy.ts:105-119`: `/api/*` istekleri `authMiddleware`'e girmeden geçiyor. Gate cookie kontrolü yalnızca `pathname.startsWith('/admin')` için yapılıyor (`proxy.ts:79`). `requireAuth` gate'i kontrol etmiyor (`lib/api-auth.ts:52-80`, `lib/` ve `app/api/` içinde `gateCookieBelongsTo` kullanımı yok).
- **Sorun:** Gizli kapının belgelenmiş amacı "rolü kazara ADMIN yapılan stajyer bile panele giremesin" (`proxy.ts:76-77`). Böyle bir hesap `/api/admin/analytics` ucunu doğrudan çağırıp platformun tüm metriklerini ve son kayıt olan kullanıcıların ve müşterilerin isimlerini (`route.ts:289-305`) alabilir. Sorun yalnızca bu sayfaya özgü değil, bütün `/api/admin/*` uçlarını etkiliyor.
- **Öneri:** `requireAuth(['ADMIN'])` içine (ya da ayrı bir `requireAdmin()` yardımcısına) gate cookie doğrulamasını ekleyin (`gateCookieBelongsTo(cookies().get('admin_gate'), session.user.id)`). Alternatif olarak proxy'de `/api/admin/*` için aynı kontrolü uygulayın. Bunu tüm admin uçlarını kapsayan tek bir değişiklik olarak yapın ve regresyon testi ekleyin.
- **Efor:** S (tek merkezi değişiklik) / M (test ile)

### B-6 · YÜKSEK · Performans/Mimari · Sınırsız satır çekimi ve bellekte O(gün × satır) gruplama
- **Kanıt:** `route.ts:116-124`: iki adet sınırsız `feedback.findMany`, ikincisi birincinin üst kümesi (gereksiz tekrar). 1y için 730 günlük tüm satırlar çekiliyor. `route.ts:217-242`: her gün için tüm diziyi `filter` ile tarıyor (365 × N). `route.ts:198-204` ve `192-194`: aynı dizi üzerinde 8 ayrı `filter`. Uç toplamda 26 Prisma çağrısı yapıyor (`route.ts:39` yorumu).
- **Sorun:** Önbellek kaçtığında (120 sn TTL, her dönem anahtarı ayrı) uç, veri arttıkça doğrusal olarak büyüyen bir transfer ve CPU yükü getiriyor. Vercel fonksiyon süresi ve Neon bağlantı havuzu (bağlantı limiti 5) üzerinde baskı oluşuyor. `admin-dashboard-client.tsx:81` aynı ucu ana panelde de çağırıyor.
- **Öneri:** Tüm zaman serisi, dağılım ve ısı haritası hesaplarını `GROUP BY` yapan 3-4 SQL'e indirin (`date_trunc` + `FILTER` toplamları + `width_bucket`). Ucu bölümlere ayırın: `/api/admin/analytics/overview|trends|dealers|root-cause|cards|activity`. Her bölüm kendi Redis anahtarıyla (`admin:analytics:v2:{section}:{period}:{tz}`) ve `getOrSet` ile tek uçuşlu çalışsın. Böylece `sections` filtresi gerçekten sunucu işini de azaltır. Yüksek hacim için gece çalışan bir cron ile günlük özet tablo (`DailyPlatformStat`) yazmak uzun vadede doğru çözüm.
- **Efor:** M (SQL'e indirme) / L (özet tablo)

### B-7 · ORTA · Veri doğruluğu/UX · KPI sparkline'ları yanlış metriği çiziyor
- **Kanıt:** `page.tsx:446` ve `448`: Toplam Kullanıcı ve QR Tarama kartları `trend: data.dailyData.map(d => d.feedbacks)` kullanıyor.
- **Sorun:** Üç kart aynı geri bildirim eğrisini gösteriyor. Operatör kullanıcı ya da tarama trendi gördüğünü sanıyor. Bu bir veri yanılsaması.
- **Öneri:** API `dailyData` içinde `newUsers` ve `scans` alanlarını da dönsün (tarama için günlük olay tablosu varsa oradan; yoksa sparkline kaldırılıp "tüm zamanlar" etiketi konulsun). Kart bileşenini `MetricCard({ label, value, scope: 'period'|'allTime', series, delta })` olarak soyutlayın. Seri yoksa sparkline render edilmesin.
- **Efor:** S-M

### B-8 · ORTA · Veri doğruluğu · Duygu donut'unun merkezindeki "Toplam" yüzde toplamı
- **Kanıt:** `page.tsx:255-256`, `305` (`total = data.reduce(...)`), `392-396` (donut'a yüzdeler veriliyor), `route.ts:515-519`.
- **Sorun:** Merkezde örneğin "101 Toplam" yazıyor. Bu ne kayıt sayısı ne de anlamlı bir değer. Yuvarlama yüzünden lejant toplamı da 100'ü tutmayabiliyor.
- **Öneri:** API ham sayıları (`positive/neutral/negative` + `analyzed`/`unanalyzed`) dönsün. Yüzdeler `normalizeSentimentTriplet` ile istemcide hesaplansın. Merkezde "N değerlendirme" yazsın. AI tarafından analiz edilmemiş (sentiment null) kayıtlar "nötr"e katılmasın, ayrı bir "Analiz bekliyor" dilimi olarak gösterilsin.
- **Efor:** S

### B-9 · ORTA · Veri doğruluğu · Tenant benchmark sıfır verili bayileri öne çıkarıyor
- **Kanıt:** `route.ts:421-430` (`take: 250`, `orderBy` yok), `448-458` (verisi olmayan bayi için `avgRating: 0`), `478` (bu bayilerin sapması örneğin -4.3 çıkıyor), `496-497` (normal grup içinde mutlak sapmaya göre sıralanıyor), `page.tsx:785`, `821` (ilk 10 satır, sapma kırmızı).
- **Sorun:** "Normal" rozetli ama kırmızı "-4.3" sapmalı, geri bildirimi hiç olmayan bayiler listenin anlamlı kısmını kaplıyor. 250'den fazla bayi olduğunda hangi bayilerin dahil edildiği rastgele. Segment adı büyük/küçük harfe duyarlı, oysa `insights` sayfası `LOWER()` kullanıyor.
- **Öneri:** Benchmark'ı SQL'de segment pencere fonksiyonlarıyla hesaplayın (`AVG() OVER (PARTITION BY lower(category))`, `STDDEV_POP`). Yalnızca `feedbackCount >= minN` olan bayileri dahil edin, verisi olmayanları "Yetersiz veri" olarak ayrı sayın. Kategori adlarını `lib/` içindeki kategori sözlüğüyle yerelleştirin. Eşikleri (z ≤ -1.2 / ≥ 1.8) sabit olmaktan çıkarıp ayarlanabilir yapın ve UI'da açıklayın (tooltip). Satır tıklanınca bayi sağlık sayfasına gidilsin.
- **Efor:** M

### B-10 · ORTA · Hata yönetimi · Hata durumu görünmüyor, ayrıca boş durumla karışıyor
- **Kanıt:** `page.tsx:331` (`fetchError` kullanılmıyor), `338` (yanıt kontrol edilmeden `res.json()`), `378-390`, `route.ts:163-165` (kart sorgusu hatası yutulup sıfırlarla önbelleğe yazılıyor), `route.ts:548-550` (hatada `success` alanı yok).
- **Sorun:** Operatör "veri yok" ile "sistem hata verdi" arasındaki farkı göremiyor. Kart tablosundaki bir hata 2 dakika boyunca "Kart Sistemi Aktif Değil" olarak sunuluyor.
- **Öneri:** Bölüm bazlı `ErrorState` bileşeni kullanın (hata mesajı + tekrar dene + istek kimliği). Önceki veri gösteriliyorsa üstte "Veriler güncellenemedi, X dk önceki veriler gösteriliyor" bandı çıksın. Sunucu tarafında kısmi hataları `errors: { cards: 'unavailable' }` biçiminde dönün ve hatalı sonucu önbelleğe yazmayın. `res.ok` kontrolü ekleyin.
- **Efor:** S

### B-11 · ORTA · Mimari/UX · Bölüm bazlı tembel yükleme yalnızca kâğıt üzerinde
- **Kanıt:** `page.tsx:320-353` (her sekmede `requestedSections` büyüyor ve yeni `queryKey` oluşuyor), `route.ts:39-50` (önbellek anahtarı yalnızca `period`, önbellek kaçtığında tüm bölümler hesaplanıyor).
- **Sorun:** Sunucu işi azalmıyor ama her sekme tıklaması bir ağ isteği ve "Yükleniyor..." karesi ekliyor. Dönem değiştiğinde birikmiş bölüm listesiyle istek atılıyor ve `placeholderData` eski dönemin verisini yeni dönem etiketiyle gösteriyor.
- **Öneri:** B-6'daki bölüm uçlarına geçin ve her sekme kendi `useQuery(['admin','analytics',section,period])` hook'unu kullansın. Sekme butonunda `onMouseEnter`/`onFocus` ile `queryClient.prefetchQuery` yapın. Dönem değişirken `isFetching` sırasında kartlara hafif bir opaklık ve hero'da "güncelleniyor" göstergesi ekleyin.
- **Efor:** M

### B-12 · ORTA · Erişilebilirlik/Mobil · Mobilde 3 sekmenin adı yok, grafikler yalnızca hover ile okunuyor
- **Kanıt:** `page.tsx:522-524` (`hidden sm:inline`, `sr-only` yedeği yok), `681-685` (bar tooltip'i yalnızca `group-hover`), `235` (`title` özniteliği), `431-438` (ikon butonda `aria-label` yok), `135-158` (sayaç reduced-motion'a uymuyor).
- **Sorun:** Ekran okuyucu kullanıcısı mobilde "sekme, sekme, sekme" duyuyor. Dokunmatik cihazda günlük değerler ve ısı haritası değerleri okunamıyor. Klavye kullanıcısı grafik verisine hiç ulaşamıyor.
- **Öneri:** Sekmelere `aria-label` verin ya da mobilde yatay kaydırılabilir, etiketli bir `TabsList` kullanın (`overflow-x-auto`, 5 etiket tek satırda). Grafiklere `role="img"` + özet `aria-label` ekleyin ve her grafiğin altına "Tabloyu göster" açılımı koyun (erişilebilir veri tablosu). Bar ve hücreleri `button` yapıp odakta ve dokunuşta tooltip gösterin (Radix Tooltip/Popover). `AnimatedNumber` `useReducedMotion()` true ise doğrudan değeri yazsın.
- **Efor:** M

### B-13 · DÜŞÜK · Görsel · Isı haritası eksen etiketleri hizasız, trend grafiğinde eksen yok
- **Kanıt:** `page.tsx:218-222` (24 sütunun üstüne eşit genişlikte 5 etiket konmuş, örneğin "23:00" yaklaşık %90'da ama 23. sütun %98'de), `667-693` (Y ekseni, ızgara ve ortalama çizgisi yok).
- **Öneri:** Isı haritasını CSS grid ile `grid-template-columns: auto repeat(24, 1fr)` olarak kurun, etiketleri ilgili sütunlara (0/6/12/18) yerleştirin. Trend için mevcut grafik altyapısını (dataviz rehberine uygun, `chart-palette` renkleriyle) Y ekseni, ortalama referans çizgisi ve önceki dönem gölge serisiyle kullanın.
- **Efor:** S-M

### B-14 · DÜŞÜK · Görsel/Doğruluk (doğrulanmadı) · MiniLineChart gradient id ve `hsl(var(--primary))` sunum özniteliği
- **Kanıt:** `page.tsx:173` (`id={\`gradient-${color}\`}`, color `#3b82f6` ya da `hsl(var(--primary))`), `190` (`fill={\`url(#gradient-${color})\`}`), `lib/chart-palette.ts:5`.
- **Sorun:** QR Tarama kartında id `gradient-hsl(var(--primary))` oluyor. Tırnaksız `url()` içinde parantez CSS ayrıştırmasını bozabilir, bu durumda dolgu geçersiz (varsayılan siyah) görünebilir. Tarayıcıda gözle doğrulanmadı.
- **Öneri:** Gradient id'sini `useId()` ile üretin. Rengi `stopColor`/`stroke` olarak `style` prop'u üzerinden verin (CSS değişkenleri style içinde güvenle çözülür).
- **Efor:** S

### B-15 · DÜŞÜK · Kod kalitesi · Ölü importlar, `any` kaçakları, dil karışıklığı
- **Kanıt:** Kullanılmayan importlar: `QrCode`, `ArrowUpRight`, `ArrowDownRight`, `Download`, `ThumbsUp`, `ThumbsDown`, `Minus`, `toast` (`page.tsx:13-33`, `50`). `totals: any` (`page.tsx:131`, ayrıca hiç kullanılmıyor). `route.ts:133-134`, `207`, `287`, `350` içinde `any`. İngilizce başlıklar: "Root Cause Graph" (`page.tsx:841`), "Tenant Benchmark ve Anomali" (`774`), `'general'` (`route.ts:454`). Sayfa `framer-motion`'dan doğrudan `m` import ediyor (proje konvansiyonu `m as Motion`) ve global LazyMotion varken ek bir `LazyMotion strict` sarmalı kullanıyor (`page.tsx:5`, `405`, `components/providers.tsx:241`).
- **Öneri:** API yanıtını `zod` şemasıyla tipleyip istemci ve sunucuda paylaşın (`lib/analytics/contracts.ts`). Metinleri `adminAnalytics.*` i18n anahtarlarına taşıyın. Ölü importları ve gereksiz LazyMotion sarmalını kaldırın.
- **Efor:** S

### B-16 · DÜŞÜK · Mimari · `period` parametresi doğrulanmıyor
- **Kanıt:** `route.ts:33`, `43`: bilinmeyen değerler varsayılan 30g hesabına düşüyor ama ayrı bir önbellek anahtarı açıyor.
- **Öneri:** `z.enum(['7d','30d','90d','1y'])` ile doğrulayıp geçersiz değerde 400 dönün. Özel aralık eklenince `from/to` ISO doğrulaması yapın ve maksimum aralık koyun.
- **Efor:** S

### B-17 · DÜŞÜK · UX · Kök neden "zinciri" nedensellik ima ediyor ama bağımsız argmax'lerden oluşuyor
- **Kanıt:** `route.ts:404-418`: konu için en sık bayi ve en sık zaman dilimi ayrı ayrı seçiliyor. `impactScore` hesabında payda tüm zamanların toplamı (`route.ts:408`). `page.tsx:843-845` açıklaması "Konu → Şube → Zaman dilimi → Etki zinciri".
- **Öneri:** Gerçek bir çok boyutlu döküm sunun: konu × bayi × zaman matrisi, ya da Sankey/akış diyagramı (yalnızca veri yeterliyse). Etki puanını "dönemdeki negatif değerlendirmelerin %'si" ve "önceki döneme göre değişim" olarak tanımlayın. Her düğüm ilgili filtrelenmiş `/admin/feedbacks?topic=…&dealer=…` listesine bağlansın. Topic anahtarlarını Türkçe etiketlere eşleyin.
- **Efor:** M

---

## Eksik özellikler (kıyas: Stripe Dashboard, PostHog, Linear Insights, Retool)

1. **Özel tarih aralığı ve önceki dönem / geçen yılın aynı dönemi karşılaştırması.** Stripe'taki tarih aralığı seçici ve "compare to previous period" toggle'ının eşdeğeri. Şu an yalnızca 4 sabit ön ayar var.
2. **Drill-down ve bağlantılı gezinti.** Her KPI, bayi, kök neden düğümü ve ısı haritası hücresi ilgili filtrelenmiş listeye (`/admin/feedbacks`, `/admin/users`, `/admin/dealers-health`) gidebilmeli. PostHog'daki "View persons / events" mantığı.
3. **Dışa aktarma ve zamanlanmış rapor.** Her bölüm için CSV indirme ve haftalık e-posta özeti (projede mail altyapısı zaten var).
4. **Ürün analitiği.** DAU/WAU/MAU, kohort retention, aktivasyon hunisi (kayıt → ilk tarama → ilk geri bildirim). Projede PostHog funnel ve `AnalyticsEvent` var ama burada görünmüyor.
5. **Segment ve filtre çubuğu.** İşletme kategorisi, şehir, abonelik planı, kaynak (QR / tüketim yorumu), "fraud hariç" anahtarı. Filtreler URL'de saklansın ve link paylaşılabilsin.
6. **Veri tazeliği ve açıklanabilirlik.** "Son güncelleme 1 dk önce", metrik tanımı tooltip'leri (her sayının neyi saydığı, hangi filtreyle ve hangi dönemde) ve anomali eşiklerinin açıklaması. Stripe'taki metrik "i" ikonlarının eşdeğeri.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında 5 saniye içinde üç soruyu cevaplayabilmeli: "Platform bu dönemde büyüyor mu?", "Deneyim kalitesi iyileşiyor mu?" ve "Neye bakmam gerekiyor?". Her sayı neyi saydığını ve hangi dönemi kapsadığını söylemeli, her sayıdan ilgili kayda tıklanarak inilebilmeli.

**Yerleşim:**
1. **Sabit filtre çubuğu** (sticky, `top: safe-area`): tarih aralığı (ön ayar + özel), karşılaştırma toggle'ı, kategori ve kaynak filtresi, "fraud hariç" anahtarı, son güncelleme zamanı, yenile (önbelleği atlayan `?fresh=1`, rate-limit'li) ve dışa aktar. Tüm durum URL'de.
2. **KPI şeridi (4-6 kart):** Yeni kullanıcı, aktif kullanıcı, değerlendirme sayısı, ortalama puan, QR tarama (dönemsel), olumsuz oran. Her kartta önceki döneme göre mutlak ve yüzde değişim, kendi serisinin sparkline'ı ve "dönem" / "tüm zamanlar" etiketi. Tıklayınca ilgili trend grafiği odaklansın.
3. **"Dikkat gerektirenler" paneli:** Anomali bayileri, yükselen negatif konular ve kart blok artışı. Bu, Linear'daki triage hissini verir. Mevcut benchmark ve kök neden verisinden beslenir.
4. **Sekmeler:** Büyüme (kullanıcı ve tarama serileri, huni) · Deneyim (duygu, puan, trend, ısı haritası) · Bayiler (sıralanabilir ve aranabilir tablo, sapma sütunu) · Kök Neden (konu × bayi matrisi) · Kart Sistemi. Mobilde sekmeler yatay kaydırılan etiketli çipler olsun, tablolar kart listesine dönüşsün.
5. **Son Aktiviteler**, sağ kolonda (masaüstü) ya da alt bölümde, tıklanabilir ve tip filtreli bir akış olsun. Geri bildirim, kayıt, tüketim ve kart olayları bu akışta yer alsın.

**Motion / 3B:** Bu bir operatör aracı, yani 3B yerinde olmaz. Motion yalnızca durum değişikliğini anlatmak için kullanılmalı. Dönem değişince sayıların eski değerden yeni değere 300-400 ms boyunca geçmesi (sıfırdan saymak yerine), grafik serilerinin tek bir crossfade ile değişmesi ve `isFetching` sırasında %60 opaklık yeterli. 168 hücrelik stagger, 365 bar'lık height animasyonu ve donut'un sol üstten scale animasyonu (`transformOrigin` yok) kaldırılmalı. Hepsi `useReducedMotion()` ile kapatılabilir olmalı.

**Veri / API değişiklikleri:**
- `GET /api/admin/analytics/{overview|growth|experience|dealers|root-cause|cards|activity}?from&to&compare&tz&category&source&excludeFraud`. Her biri `zod` ile doğrulansın ve paylaşılan bir sözleşme tipi dönsün.
- Tüm toplamalar SQL'de yapılsın (`AT TIME ZONE`, `FILTER`, pencere fonksiyonları). Feedback ve ConsumptionReview `UNION ALL` ile ortak bir "review" görünümünde birleşsin (gerekirse bir Postgres VIEW).
- Bölüm başına Redis anahtarı ve tek uçuşlu `getOrSet` kullanılsın. Hatalı ya da kısmi sonuç önbelleğe alınmasın. Yanıtta `generatedAt` alanı dönsün.
- Orta vadede günlük özet tablosu (`PlatformDailyStat`: tarih, kategori, kaynak, sayaçlar) mevcut harici cron üzerinden doldurulsun. 90g ve 1y sorguları bu tablodan okunsun.
- Admin API'leri için gate cookie kontrolü (B-5) merkezi olarak eklensin.

---

## Çakışmalar / birleştirme önerisi

- **`/admin` (ana panel), `AnalyticsSection`:** `app/admin/admin-dashboard-client.tsx:81` aynı `/api/admin/analytics?period=30d` ucunu çağırıyor ve `app/admin/components/AnalyticsSection.tsx` puan dağılımı ile günlük trendi yeniden çiziyor (`:76`, `:97`). Bu sayfadaki Genel Bakış sekmesiyle büyük ölçüde örtüşüyor. **Öneri:** Ana panelde yalnızca KPI şeridi ve "dikkat gerektirenler" kalsın, grafikleri `/admin/analytics`'e devretsin. İkisi de aynı `overview` bölüm ucunu ve aynı `MetricCard` bileşenini kullansın.
- **`/admin/dealers-health` ve `/admin/insights`:** Bayiler sekmesindeki "En İyi Bayiler" ve "Tenant Benchmark", bayi sağlık skoru ve kategori içgörüleriyle aynı soruyu farklı formüllerle cevaplıyor (`insights` `LOWER(businessCategory)` ile segmentliyor, bu sayfa ham değerle). **Öneri:** Bayi kıyaslaması tek bir kaynaktan (`dealers-health` hesap motoru) beslensin. Bu sayfadaki sekme o veriyi özetleyip derin bağlantı versin.
- **`/admin/platform-pulse`:** Platform geneli nabız (varlık karışımı, grafik, son denetim kaydı), i18n'li ve başka bir uçtan besleniyor. "Son Aktiviteler" ile amaç örtüşüyor. **Öneri:** Aktivite akışı platform-pulse'ta kalsın, burada yalnızca bağlantısı olsun. Ya da iki sayfa "Analitik" altında alt sekmeler olarak birleşsin (Analitik → Genel / Nabız / Bayiler).
- **`/api/admin/analytics/cleanup-events`:** Bu sayfada bir UI karşılığı yok. AnalyticsEvent saklama yönetimi `/admin/observability` veya `/admin/settings` altına taşınmalı ya da orada görünür kılınmalı.
- **Kaldırma önerilmiyor.** Sayfa, platformun tek dönemsel analitik yüzeyi olarak gerekli. Ancak veri katmanı düzeltilmeden ana paneldeki ve bu sayfadaki sayılara güvenilmemeli.

---

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışıldı. `app/api/admin/analytics/route.ts`, `app/admin/analytics/page.tsx`, `proxy.ts`, `lib/api-auth.ts`, `lib/admin-gate-edge.ts`, `prisma/schema.prisma`, `app/api/admin/feedbacks/route.ts` ve `vercel.json` baştan okundu. Hiçbir komut, DB sorgusu veya build çalıştırılmadı.

| # | İddia | Karar |
|---|---|---|
| 1 | En İyi Bayiler rastgele 10 bayiden seçiliyor | **Doğrulandı** |
| 2 | Karşılaştırma kartlarında asimetrik veri kümesi | **Doğrulandı** (bir alt iddia düzeltilerek) |
| 3 | Soft-delete edilmiş geri bildirimler metriklere dahil | **Doğrulandı** |
| 4 | Zaman kovaları UTC'ye göre | **Doğrulandı** |
| 5 | Gate cookie API katmanında kontrol edilmiyor | **Doğrulandı** |

**1. En İyi Bayiler: Doğrulandı.** `route.ts:111-115` `prisma.user.findMany({ where: { role: 'DEALER' }, take: 10 })` sorgusunda `orderBy` yok. Postgres bu durumda belirli bir sıra garanti etmez; pratikte genellikle fiziksel/indeks sırasına göre ilk 10 bayi gelir. Sıralama ve `slice(0, 5)` ancak bu 10 kişinin içinde yapılıyor (`route.ts:284`). Ayrıca `route.ts:257-269` SQL'inde `f."createdAt"` filtresi yok, yani liste dönem seçiciden bağımsız ve tüm zamanları sayıyor. Aynı dosyadaki benchmark sorgusu ise dönemi filtreliyor (`route.ts:444`). Sayfa kartı "Geri bildirim sayısına göre sıralanmış" diyor (`page.tsx:721`), bu da kullanıcıyı yanıltıyor. **Üretim:** 11'den fazla bayi olsun; 11. sıradan dönen bir bayinin 500 geri bildirimi, ilk 10'dakilerin ise 0-10 geri bildirimi olsun. "En İyi Bayiler" kartında 500'lük bayi görünmez. 7g/30g/1y arasında geçiş yapıldığında liste değişmez.

**2. Karşılaştırma kartları: Doğrulandı (düzeltmeyle).** `allTrendFeedbacks` = `allFeedbacksForTrend` (Feedback, `gte prevStartDate`, `route.ts:120-124`) + `consumptionReviews` (yalnızca `gte startDate`, `route.ts:144-147`). Bu yüzden `currentPeriodFeedbacks` (`route.ts:319-322`) yorumları içeriyor, `prevPeriodFeedbacks` (`route.ts:315-318`) yapısal olarak içeremiyor. Geri Bildirim kartında gösterilen `current`/`previous` bu asimetrik kümelerden, `change` ise yalnızca Feedback sayımlarından türeyen `feedbackGrowth`'ten (`route.ts:172-174`, `335`) geliyor; kart `page.tsx:638-646`'da bu üç sayıyı yan yana gösteriyor. **Düzeltme:** "% büyüme sistematik olarak şişiyor" kısmı tam doğru değil. Geri Bildirim kartındaki rozet yalnızca Feedback'ten hesaplandığı için şişmiyor; şişen, "current" sayısı ile "vs previous" arasındaki ham fark. Puan kartında ise `change` (`route.ts:340`) asimetrik kümelerden türüyor; yönü yorumların ortalamasına göre her iki tarafa da kayabilir. **Üretim:** önceki dönemde 100, bu dönemde 100 Feedback ve bu dönemde 60 ConsumptionReview olsun. Kart "160 vs 100" ve "%0" gösterir, birbiriyle çelişir.

**3. Soft-delete: Doğrulandı.** `Feedback.deletedAt` şemada var (`prisma/schema.prisma` Feedback modeli, "soft delete; null = active"). Admin silme ucu gerçekten soft-delete yapıyor (`app/api/admin/feedbacks/route.ts:366-369`, `data: { deletedAt: new Date() }`). Analitik ucunda `route.ts:100-102` (toplam ve dönem sayımları) ile `route.ts:116-124` (puan, duygu, dağılım, trend, ısı haritası, karşılaştırma) `deletedAt: null` içermiyor. Buna karşılık `route.ts:267`, `359` ve `443` filtreliyor. **Üretim:** admin bir küfürlü 1 yıldızlı yorumu siler; analitik sayfasında toplam, ortalama puan, negatif yüzdesi ve günlük trend bu yorumu saymaya devam eder, Bayiler/Kök Neden sekmeleri saymaz. (ConsumptionReview hard-delete edildiği için, `route.ts` dışında `feedbacks/route.ts:362-364`, onun tarafında sorun yok.)

**4. UTC kovaları: Doğrulandı.** `vercel.json` içinde TZ tanımı yok, bölge `fra1`. Vercel Functions varsayılan olarak UTC çalışır. `route.ts:218-221` (`setHours`), `247-249` (`getDay`/`getHours`), `387-388` (Sabah/Öğlen/Akşam) ve `233` (`toLocaleDateString` `timeZone` olmadan) sunucu saat dilimine göre hesaplanıyor. Projede doğru yaklaşım zaten var (`lib/timezone.ts:44`, `app/api/cron/intern-deadline/route.ts:40` `Europe/Istanbul` kullanıyor) ama bu uçta kullanılmıyor. **Üretim:** TR saatiyle Salı 01:30'da bırakılan bir yorum UTC'de Pazartesi 22:30'dur; ısı haritasında Pazartesi 22 hücresine, günlük trendde Pazartesi'ye, kök nedende "Akşam" kovasına düşer.

**5. Gate cookie API'de yok: Doğrulandı.** `proxy.ts:105-119` `/api/*` isteklerini `authMiddleware`'e hiç sokmadan yalnızca header ekleyip geçiriyor; gate kontrolü (`proxy.ts:79-88`) yalnızca `/admin` sayfa yollarında çalışıyor. `requireAuth` (`lib/api-auth.ts:52-80`) yalnızca session, rol ve token-replay kontrol ediyor. Kod tabanında `admin_gate` cookie'sini okuyan tek yer `proxy.ts:81` (grep: `gateCookieBelongsTo` başka hiçbir API'de çağrılmıyor). **Üretim:** rolü ADMIN yapılmış ama gate rakamını bilmeyen bir hesap giriş yapar; `/admin` sayfaları onu `/admin-gate`'e yönlendirir, ancak aynı oturumla tarayıcıdan `fetch('/api/admin/analytics?period=1y')` çağrısı 200 döner ve son kayıt olan kullanıcı adlarını, rollerini, müşteri ve bayi adlarını (`route.ts:289-305`) ve tüm platform metriklerini verir. Bu sistem geneli bir açık; tüm `/api/admin/*` uçlarını (yazma uçları dahil) etkiliyor. Öneri: `requireAuth`'a `ADMIN` istendiğinde tam HMAC doğrulamalı gate kontrolü (`lib/admin-gate.ts`) eklenmesi veya `proxy.ts`'te `/api/admin/*` için aynı cookie kontrolünün 403 dönecek şekilde yapılması. Not: gate'in tehdit modeli zaten "rolü ADMIN olan ama yetkisiz kişi" olduğundan, bu senaryo gate'in belgelenmiş amacının (`proxy.ts:76-77`) doğrudan atlatılması anlamına geliyor.

---

## Uygulama (Dalga 2)

**Hedef rota:** `/admin/analytics` (Platform analitiği). `/admin/insights` buraya "Sektörler" sekmesi olarak birleşti; eski URL sorguyu koruyarak `?tab=sectors`'a kalıcı yönlenir.

**Yeni yapı:**
- `app/admin/analytics/page.tsx`: sunucu bileşeni, `metadata`, yetki `requireAuth(['ADMIN'])` (DB + admin kapısı). Açık sekmenin verisi BFF ile aynı yükleyiciden SSR'da React Query önbelleğine gömülür; yumuşak gezinmede çift yükleme yok.
- `lib/admin-analytics/{types,params,core,load,csv}.ts`: dönem sözleşmesi (`{range, compare}`, İstanbul günleri, en çok 366 gün), saf hesap çekirdeği (karşılaştırma, kıyas, sektör, kök neden), SQL yükleyicileri, CSV.
- `app/api/admin/analytics/[section]/route.ts`: `overview | dealers | sectors | root-cause | cards` bölüm uçları (`defineRoute`, yalnız ADMIN, zod, `read` hız sınırı, `fresh=1` için ayrı sıkı limit, sektör bölümünde `insights_global` modül kapısı).
- `components/admin/a-analitik/**`: QDL v2 ops kaydı istemci adası (PanelPage, yapışkan FilterBar, SectionTabs, MetricTile, ChartFrame + lazy recharts, DataTable, QueryState).
- Testler: `__tests__/lib/admin-analytics-core.test.ts`, `__tests__/api/admin-analytics.test.ts` (31 test, geçti).

### Özellik envanteri: yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Sayfa erişimi | ÇALIŞIYOR | Sunucu sayfası ayrıca `requireAuth(['ADMIN'])` yapar. |
| 2 | API yetkisi | ÇALIŞIYOR | `defineRoute` + `requireAuth`; admin kapısı artık merkezi olarak `requireAuth` içinde. |
| 3 | Başlık + dönem açıklaması | ÇALIŞIYOR | `PageHeader`; araç çubuğu özeti seçili aralığı yazar; anlamsız `Shield` ikonu kalktı. |
| 4 | Dönem seçici | ÇALIŞIYOR | Ön ayarlar + özel aralık + karşılaştırma (önceki dönem / geçen yıl / yok). Tüm-zaman kartları "Tüm zamanlar", platform geneli kartlar "sektör ve kaynak süzgecinden etkilenmez" etiketli. |
| 5 | Yenile | ÇALIŞIYOR | `fresh=1` önbelleği gerçekten atlar (dakikada 6); dönen ikon, görünür metin, hata bandı. |
| 6 | Yükleniyor | ÇALIŞIYOR | SSR ilk veri; sekme başına yerleşimi koruyan iskelet. |
| 7 | Hata durumu | ÇALIŞIYOR | `QueryState` (tekrar dene, 403 / modül kapalı ayrımı); `res.ok` ve zarf denetimi; JSON olmayan yanıt da anlamlı hata verir. |
| 8 | Dönem geçiş göstergesi | ÇALIŞIYOR | `keepPreviousData` + %60 opaklık + `aria-busy` + "Güncelleniyor…". |
| 9 | Toplam kullanıcı | ÇALIŞIYOR | "Kullanıcı tabanı (tüm zamanlar)" kartı: rol kırılımı + toplam (toplam = rollerin toplamı). |
| 10 | Kullanıcı büyüme rozeti | ÇALIŞIYOR | "Yeni kullanıcı" KPI'ı kendi deltasıyla; önceki dönem 0 ise yüzde gösterilmez (sabit %100 yok). |
| 11 | Kullanıcı sparkline | ÇALIŞIYOR | Kendi günlük yeni kullanıcı serisi. |
| 12 | Geri bildirim değeri | ÇALIŞIYOR | "Değerlendirme" = QR ∪ tüketim yorumu, silinenler hariç, dönemsel. |
| 13 | Geri bildirim rozeti | ÇALIŞIYOR | Değerle aynı tanımdan (`Comparison`). |
| 14 | Geri bildirim sparkline | ÇALIŞIYOR | İstanbul günü kovaları. |
| 15 | QR tarama | ÇALIŞIYOR | Dönemsel `qr_scanned` olayı + kendi serisi; 90 günlük olay saklaması aşılırsa "kısmi" uyarısı. |
| 16 | Ortalama puan + değişim | ÇALIŞIYOR | Simetrik iki dönem; değişim mutlak puan farkı; n ve düşük örneklem uyarısı. |
| 17 | Sayaç | ÇALIŞIYOR | `MetricTile` → `useNumberTicker` (azaltılmış hareket politikasına uyar, eski değerden yeniye geçer). |
| 18 | Bölüm bazlı yükleme | ÇALIŞIYOR | Her sekme ayrı uç + ayrı Redis anahtarı; üzerine gelince ya da odakta ön-yükleme. |
| 19 | Mobil sekmeler | ÇALIŞIYOR | `SectionTabs` pill; her sekme etiketli, yatay kayar, ≥ 44 px. |
| 20 | Duygu donut'u | KALDIRILDI | Yerine ham sayılı yığılmış çubuk + lejant. "Toplam" yüzde toplamı yanılgısı yok, "Analiz bekliyor" ayrı. |
| 21 | Duygu yüzdeleri | ÇALIŞIYOR | En büyük kalan yöntemi (toplam 100); AI duygusu her iki kaynakta kullanılır; null nötre katılmaz. |
| 22 | Puan dağılımı | ÇALIŞIYOR | Silinenler hariç; sayı + yüzde. |
| 23 | Kullanıcı dağılımı | ÇALIŞIYOR | STAFF dahil (bkz. 9). |
| 24 | Kıyas: geri bildirim | ÇALIŞIYOR | Ayrı kıyas kartları KPI deltalarına birleşti; tek `Comparison` nesnesi (B-2). |
| 25 | Kıyas: ortalama puan | ÇALIŞIYOR | Mutlak puan farkı. |
| 26 | Kıyas: yeni kullanıcı | ÇALIŞIYOR | |
| 27 | Kıyas ikon renkleri | KALDIRILDI | Dinamik `bg-${color}` sınıfı yok; ton token'ları kullanılıyor. |
| 28 | Günlük trend | ÇALIŞIYOR | recharts (lazy): Y eksenleri, ızgara, ortalama puan çizgisi, kesikli karşılaştırma serisi, animasyonsuz, erişilebilir tablo alternatifi. |
| 29 | Isı haritası | ÇALIŞIYOR | SQL `AT TIME ZONE` + `ISODOW`; yalnız seçili dönem; CSS grid ile hizalı etiketler; stagger yok; dokunuşla değer (canlı bölge); "Tabloyu göster". |
| 30 | Isı lejantı | ÇALIŞIYOR | |
| 31 | En İyi Bayiler | ÇALIŞIYOR | Bayi kıyası tablosu: TÜM bayilerin dönem toplamı, Bayes düzeltmeli sıralama; aranabilir, sıralanabilir, sayfalı; satır → bayinin geri bildirimleri. |
| 32 | Tenant benchmark | ÇALIŞIYOR | Aynı tabloda. n < 5 "yetersiz veri"; hiç değerlendirmesi olmayan bayi ayrı sayılır; sektör türetilir (demo etiketi yok sayılır). |
| 33 | Anomali rozeti | ÇALIŞIYOR | Bayinin kendisi hariç grup; simetrik ±1,5 z, açıklamada yazılı; akran < 3 ise "akran yetersiz"; sektörde akran yoksa platform grubu. |
| 34 | Kök neden | ÇALIŞIYOR | Zincir yerine döküm: konu × gün dilimi (Gece ayrı) × en çok geçtiği bayiler. Pay = konulu olumsuzların %'si; önceki döneme göre değişim; satır sınırı yok (GROUP BY). |
| 35 | Kart KPI'ları | ÇALIŞIYOR | Dönem içi aktivasyon, blok, tüketim, yorum ve yorumlanma oranı; "tüm zamanlar" envanteri ayrı. |
| 36 | Kart durum barları | ÇALIŞIYOR | |
| 37 | Kart boş durumu | ÇALIŞIYOR | Yalnız gerçekten kart yoksa. |
| 38 | Kart hata davranışı | ÇALIŞIYOR | Hata yutulmaz, önbelleğe yazılmaz. |
| 39 | Son Aktiviteler | KALDIRILDI | Platform Nabzı'nın işi (çakışma bölümündeki öneri); sayfada bağlantı var. Ölü `feedback` dalı ve donmuş göreli zaman gitti. |
| 40 | Bölüm boş metinleri | ÇALIŞIYOR | |
| 41 | Redis önbelleği | ÇALIŞIYOR | Dönem zod ile doğrulanır; bölüm anahtarı sorguyu içerir; isabet yalnız sorgu eşleşirse; `generatedAt` döner. |
| 42 | Dışa aktarma | ÇALIŞIYOR | Her sekmede CSV (BOM, `;`, formül enjeksiyonu korumalı) + yazdır/PDF. |
| 43 | Drill-down | ÇALIŞIYOR | Bayi → `/admin/feedbacks?search=`; sektör → süzülmüş bayi sekmesi; dikkat paneli → ilgili sekme. Sahte `cursor-pointer` yok. |
| 44 | Özel tarih aralığı | ÇALIŞIYOR | |
| 45 | Segment / kaynak filtresi | ÇALIŞIYOR | Kaynak (QR / ziyaret yorumu), sektör, "temiz veri" (varsayılan açık: güven işaretli yorum, gölge yasaklı ve demo hesaplar hariç). |
| 46 | URL durumu | ÇALIŞIYOR | Dönem, karşılaştırma, süzgeçler ve sekme URL'de. |
| 47 | i18n | ÇALIŞIYOR | TR/EN metin sözlüğü (`copy.ts`, DS yerel kancası); karışık dilli başlıklar kalktı. |
| 48 | `<title>` | ÇALIŞIYOR | "Platform analitiği". |
| 49 | Ürün analitiği | KISMİ | Eklendi: aktif müşteri (dönemde değerlendirme bırakan tekil kişi) ve aktivasyon oranı (dönemde kaydolup ilk etkileşimini yapan müşteri %'si). Kalan: DAU/WAU/MAU ve kohort tutunma. `AnalyticsEvent` 90 günde siliniyor ve oturum olayı kalıcı tutulmuyor; gerçek veriyle yapılamadığı için eklenmedi. |
| 50 | Veri tazeliği | ÇALIŞIYOR | Başlıkta "x önce güncellendi". |

### Kapanan bulgular
B-1, B-2, B-3, B-4, B-6 (SQL GROUP BY + bölüm uçları; özet tablo hariç), B-7, B-8, B-9, B-10, B-11, B-12, B-13, B-14 (MiniLineChart yok; DS `Sparkline`), B-15, B-16, B-17. B-5 merkezi olarak `requireAuth` içindeki admin kapısıyla kapanmış durumda; bu yüzeyin uçları onu kullanır.

### Kalanlar
- **Eski `GET /api/admin/analytics`** (`app/api/admin/analytics/route.ts`) dokunulmadı. Hâlâ `/admin` ana paneli (`app/admin/admin-dashboard-client.tsx`) tarafından çağrılıyor ve o yüzeyin sahibine ait. B-1…B-4 hataları O UÇTA sürüyor. Ana panelin `/api/admin/analytics/overview`'a geçirilmesi ve eski ucun kaldırılması Komuta Merkezi sahibine bırakıldı.
- **B-6 uzun vade:** günlük özet tablosu (`PlatformDailyStat`) şema dalgası dışında; şimdilik 120 sn Redis + GROUP BY.
- **Satır 49:** DAU/WAU/retention (gerekçe yukarıda).
- `cleanup-events` ucunun arayüzü bu sayfada yok (gözlemlenebilirlik / ayarlar yüzeyi).
- Geri bildirim listesi yalnız `?search=` derin bağlantısını destekliyor; konu ya da bayi kimliğiyle süzme o yüzeyin işi.
