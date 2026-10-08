# /customer/trends

**Amaç:** Müşteriye kendi son 30 günlük aktivitesini (geri bildirim sayısı, puan/XP/seviye, seri, duygu dağılımı, rozetler) ve buna ek olarak bir “keşif” vitrini (trend mekanlar, haftanın enleri, sponsor duyuruları, Ayın İşletmesi, “Sen Seversin” önerileri) tek sayfada göstermek.

**Genel puan: 3,9 / 10** · **Karar: birleştir** (kişisel istatistik kısmı `/customer/analytics` + `/customer/progress-hub` ile tek “İlerlemem / Wrapped” yüzeyine; keşif kısmı `/customer/nearby` / `/customer/discover`’a taşınmalı). Sayfa görsel olarak cilalı görünse de gösterdiği sayıların önemli bir kısmı yanlış, tahmini ya da başka sayfalarla çelişkili.

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | “Son rozetler” listesi Prisma filtresi yüzünden her zaman boş, seviye ilerlemesi yanlış formülle hesaplanıyor, haftalık değişim “++100%” üretiyor, puan grafiği gerçek veri değil tahmin. |
| UX | 4/10 | İki ayrı ürün (kişisel istatistik + mekan keşfi) tek sayfaya yığılmış; dürüst negatif yorum veren kullanıcıya “Gelişim alanı var” denmesi ürün etiğine ters. |
| Görsel | 6/10 | Kart/ikon/gradyan dili tutarlı ve çekici, ancak çok sayıda aynı ağırlıkta kart hiyerarşiyi düzleştiriyor; aynı metrik (puan, XP, rozet) sayfada 3 kez tekrar ediyor. |
| Mimari | 3/10 | Seviye, seri ve puan geçmişi için sistemdeki tek doğru kaynaklar (`calculateLevel`, `UserStreak`/login streak, `points_credited`) yerine sayfaya özel yeniden hesaplama; saat dilimi UTC; dil karışık. |
| Performans | 4/10 | Her sayfa açılışında önbelleksiz ağır global `/api/customer/discovery` (25 bin feedback + 20 bin review taraması) ve önbelleksiz LLM çağrısı (`explain=1`) tetikleniyor. |
| Erişilebilirlik + mobil | 5/10 | Mobil grid ve dokunma hedefleri düşünülmüş; ama grafiklerin metin alternatifi yok, mobilde tooltip tamamen kapalı, tıklanabilir görünüp tıklanmayan öğeler var. |

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (layout) | ÇALIŞIYOR | `app/customer/trends/layout.tsx:4-6` | `segmentLayoutMetadata` ile. |
| 2 | Masaüstü başlık + açıklama | ÇALIŞIYOR | `page.tsx:226-241`, `components/dashboard/page-heading.tsx:20` | `hidden sm:flex`; mobilde gizli. |
| 3 | Mobil başlık kartı (ayrı h1) | ÇALIŞIYOR | `page.tsx:243-248` | Masaüstü başlıkla çakışma yok (`sm:hidden`), ama mobilde Yenile butonu hiç yok. |
| 4 | Yenile butonu | KISMİ | `page.tsx:165-169`, `route.ts:19-23` | Başarı toast’ı fetch bitmeden atılıyor; sunucu 30 sn Redis cache döndürdüğü için “güncellendi” dendiğinde veri aynı kalabiliyor. Mobilde buton görünmüyor (DashboardPageHeading `hidden sm:flex`). |
| 5 | Yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:171-190` | 8 kutulu genel iskelet; gerçek yerleşimi taklit etmiyor. |
| 6 | Hata / veri yok durumu + Tekrar dene | KISMİ | `page.tsx:192-209` | Hata nedeni ayrılmıyor (403/500/ağ); Tekrar dene “Veriler güncellendi” toast’ı da atıyor. |
| 7 | Hero: Toplam Puan kartı | ÇALIŞIYOR | `page.tsx:253-263` | Alt satır “X ödül alındı” `user._count.rewards`. |
| 8 | Hero: Seviye kartı + XP ilerleme çubuğu | BOZUK | `page.tsx:218-219`, `route.ts:265-266`, `lib/utils.ts:94-103` | Sistem seviyeyi geometrik (×1,5) hesaplıyor, sayfa doğrusal 1000 XP varsayıyor → çubuk sıklıkla %100’e kilitli, “X XP kaldı” yanlış. |
| 9 | Hero: Geri bildirim kartı | BOZUK | `route.ts:293` | `user._count.feedbacks` (tüm zamanlar QR) + `consumptionReviewCount30d` (yalnız son 30 gün) toplanıyor — farklı dönemler karışık. |
| 10 | Hero: Seri (streak) kartı + alev animasyonu | KISMİ | `route.ts:272-289`, `page.tsx:315-322` | Bugün henüz yorum yoksa seri 0 görünüyor (dün dahil seri kırılmış sayılıyor); 30 gün penceresine sınırlı; sistemdeki `UserStreak` / login streak ile çelişiyor. |
| 11 | İkincil: Haftalık değişim | BOZUK | `route.ts:226`, `route.ts:312`, `page.tsx:213` | Geçen hafta 0 ise `'+100'` önüne tekrar `+` eklenip “++100%” gösteriliyor; `parseFloat('++100%')` = NaN → ikon gri “eşit” çıkıyor. |
| 12 | İkincil: Duygu skoru | KISMİ | `route.ts:236-238`, `page.tsx:356` | Skor (pozitif−negatif)/toplam → −100…+100 aralığı “%” olarak sunuluyor; “-40%” gibi anlamsız değerler. |
| 13 | İkincil: Rozet sayısı + ilk rozet adı | KISMİ | `page.tsx:363-369` | Sayı doğru (`_count.badges`), ama `data.badges` hep boş olduğundan (bkz. #39) detay alanı hep boş. |
| 14 | İkincil: Üyelik süresi (gün) | ÇALIŞIYOR | `page.tsx:222`, `page.tsx:371-377` | |
| 15 | Ayın İşletmesi rozeti | ÇALIŞIYOR | `components/customer/business-of-month-badge.tsx:26-80` | Kazanan yoksa gizleniyor; metinler Türkçe sabit (“Ayın İşletmesi”, “değerlendirme”, ay adları) — i18n dışı. |
| 16 | “Sen Seversin” öneri bölümü + LLM başlık | KISMİ | `components/customer/recommendations-section.tsx:32`, `lib/recommendations.ts:186-215` | Çalışıyor; ancak `explain=1` her sayfa açılışında önbelleksiz LLM çağrısı yapıyor; başlık “Sen Seversin” sabit TR. |
| 17 | Trend Mekanlar listesi (ilk 5) | KISMİ | `page.tsx:412-437`, `discovery/route.ts:205-219` | Satırlar tıklanamıyor (mekana link yok); “4.5 puan” etiketi puan para birimiyle karışıyor; minimum örnek eşiği yok. |
| 18 | Trend Mekanlar altındaki iOS konum notu | SAHTE | `page.tsx:418-420`, `messages/tr.json` `trendingIosNote` | Trend listesi konum kullanmıyor; not alakasız ve tüm mobil (Android dahil) kullanıcılara gösteriliyor. |
| 19 | Yakın Mekanlar CTA kartı | ÇALIŞIYOR | `page.tsx:439-455` | Statik yönlendirme kartı; `/customer/nearby` modülü kapalıysa ölü linke gider. |
| 20 | Haftanın Enleri (ambiyans/yemek/servis) | KISMİ | `page.tsx:458-476`, `discovery/route.ts:245-262` | Tek bir 5 yıldızlık yorumla bir mekan “haftanın en iyisi” olabiliyor (minimum örnek yok); skor “/5” bağlamı olmadan; tıklanamaz. |
| 21 | Sponsor duyuruları | KISMİ | `page.tsx:478-498`, `discovery/route.ts:265-273` | Gösterim var, eylem (CTA/link/kampanyaya git) yok; reklam olduğuna dair “Sponsorlu” etiketi kart düzeyinde yok. |
| 22 | Keşif bölümlerinin modül kapısı | BOZUK | `discovery/route.ts:99-111`, `page.tsx:142` | `nearby` menüsü/`discovery` modülü kapalıysa API 403 döner; sayfa sessizce “veri oluşmadı” boş durumlarını gösterir — gizlenmesi gerekirken yanlış mesaj. |
| 23 | Sekmeler (Aktivite/Duygu/İçgörüler/Başarılar) | KISMİ | `page.tsx:502-524` | Mobilde yalnız ikon (etiket `sr-only`); seçili sekme URL’e yazılmıyor, paylaşılamıyor. |
| 24 | 30 günlük günlük çubuk grafik | KISMİ | `page.tsx:546-567`, `route.ts:147,177` | Gün kovaları UTC (`toISOString`) → TR’de 00:00-03:00 yorumları önceki güne yazılıyor; mobilde tooltip yok; çubuklar `cursor-pointer` ama tıklanmıyor; ekran okuyucu karşılığı yok. |
| 25 | 30 gün toplam rozeti (badge) | ÇALIŞIYOR | `page.tsx:540-542` | Etiketsiz çıplak sayı. |
| 26 | Haftanın günlerine göre dağılım | BOZUK | `route.ts:243,247`, `page.tsx:597` | `day.slice(0,3)` → “Pazar/Pazartesi” ikisi de “Paz”, “Cuma/Cumartesi” ikisi de “Cum”; gün adları API’de sabit Türkçe (EN arayüzde de TR); `getDay()` UTC; hafta Pazar’dan başlıyor. |
| 27 | Geçen hafta / bu hafta karşılaştırması | KISMİ | `page.tsx:629-655` | Sayılar doğru, ama #11 nedeniyle ok yönü “++100%” durumunda yanlış (gri). “Bu hafta” takvim haftası değil, kayan 7 gün. |
| 28 | Duygu donut grafiği | KISMİ | `page.tsx:671-712` | `strokeLinecap="round"` segment uçlarını üst üste bindiriyor (küçük dilimler görünür şekilde büyür); `aria`/metin alternatifi yok. |
| 29 | Duygu lejantı | ÇALIŞIYOR | `page.tsx:715-732` | |
| 30 | Duygu skoru halkası + rozet (“Harika! Çok pozitifsiniz” / “Gelişim alanı var”) | SAHTE (ürün açısından yanlış) | `page.tsx:747-775`, `messages/tr.json` `badgeNeedsWork` | Müşterinin işletme deneyimini dürüstçe kötü puanlaması “gelişim alanı” olarak sunuluyor — geri bildirim platformunu pozitif yanlılığa iten bir mesaj. |
| 31 | Pozitif/Nötr/Negatif oran çubukları | ÇALIŞIYOR | `page.tsx:778-799` | Lejantla birebir tekrar. |
| 32 | İçgörü: En aktif saat | BOZUK | `route.ts:256-261` | `getHours()` sunucuda UTC → TR kullanıcısına 3 saat kaymış saat; veri yoksa sabit TR “Veri yok”; “23:00 - 24:00” biçimi. |
| 33 | İçgörü: Seri rekoru | KISMİ | `page.tsx:818-827` | Yalnız son 30 gündeki rekor; “rekor” etiketi yanıltıcı. |
| 34 | İçgörü: Günlük ortalama | ÇALIŞIYOR | `route.ts:325` | 30 güne bölünmüş birleşik sayı. |
| 35 | İçgörü: Kazanılan rozetler | KISMİ | `page.tsx:837-845` | “Son: …” hiçbir zaman çıkmıyor (#39). |
| 36 | İçgörü: Toplam XP | ÇALIŞIYOR | `page.tsx:846-854` | Hero ve özetle üçüncü tekrar. |
| 37 | İçgörü: Sonraki seviyeye ~gün | BOZUK | `route.ts:268-269` | `avgDailyXP = currentXP / 30` — tüm zamanların XP’si 30’a bölünüyor; eski kullanıcıda absürt kısa süre; ayrıca kalan XP doğrusal formülden (#8). |
| 38 | Puan ilerlemesi alan grafiği | SAHTE | `route.ts:151-152,187-202`, `page.tsx:908-940` | Gerçek kredi defteri (`points_credited`) yerine “her yorum = matristeki taban puan” tahmini; oyun/görev/ödül harcaması yok. Grafik 0’dan başlıyor ve sonu `currentPoints` ile tutmuyor. |
| 39 | Son kazanılan rozetler listesi | BOZUK | `route.ts:205-218` | `users: { some: { id: userId } }` — `Badge.users` bir `UserBadge[]`; `UserBadge.id` kayıt cuid’i, kullanıcı değil → filtre hiçbir zaman eşleşmez, liste daima boş. Sıralama da `Badge.createdAt` (tanım tarihi), `UserBadge.earnedAt` değil. |
| 40 | Rozet boş durumu + “Görevlere Git” | KISMİ | `page.tsx:1003-1017` | Rozeti olan kullanıcıya da (#39) “Henüz rozet kazanmadınız” gösteriliyor; `<a href>` ile tam sayfa yeniden yükleme (Link değil). |
| 41 | Rozet satırındaki ChevronRight | SAHTE | `page.tsx:986,998` | Hover + chevron tıklanabilirlik vaat ediyor, satır hiçbir yere gitmiyor. Rarity ham İngilizce (`legendary`) basılıyor. |
| 42 | Başarı özeti (4 kutu) | ÇALIŞIYOR | `page.tsx:1023-1040` | Puan/XP/rozet/ödül — sayfanın üstündeki kartların tekrarı. |
| 43 | Sunucu Redis önbelleği (30 sn, kullanıcı başına) | ÇALIŞIYOR | `route.ts:18-23,329` | Ancak istemcideki `no-cache` başlığı ve Yenile butonu bununla çelişiyor. |
| 44 | Yetki kontrolü | ÇALIŞIYOR | `route.ts:11-14`, `discovery/route.ts:92-98` | `userId` oturumdan; IDOR yok. Discovery rol kontrolü yapmıyor (bayi/admin de çağırabilir, veri zaten global). |
| 45 | Azaltılmış hareket desteği | KISMİ | `components/providers.tsx:232` | Global `MotionConfig reducedMotion="user"` transform’ları kapatır; ama `height`/`width`/`strokeDasharray`/`pathLength` animasyonları yine oynar. |
| 46 | Çoklu dil (TR/EN) | KISMİ | `route.ts:247,261`, `business-of-month-badge.tsx:16,61`, `recommendations-section.tsx:57` | Sayfa i18n anahtarlı ama API ve iki alt bileşen sabit Türkçe. |
| 47 | Discovery isteğinin hata yönetimi | KISMİ | `page.tsx:128-151` | `Promise.all` ile bağlı: discovery ağ hatasıyla reddedilirse kişisel trend verisi de kaybolur ve tüm sayfa “Veriler yüklenemedi” olur. |
| 48 | Paylaş / dönem seçimi / hedef koyma | EKSİK | — | Kıyas ürünlerin hepsinde var (bkz. Eksik özellikler). |

Sayım: ÇALIŞIYOR 13 · KISMİ 21 · BOZUK 9 · SAHTE 4 · EKSİK 1.

## Bulgular

### 1. Kritik · Veri/doğruluk · “Son kazanılan rozetler” her kullanıcıda daima boş
- **Kanıt:** `app/api/customer/trends/route.ts:205-218`; şema `prisma/schema.prisma:624` (`users UserBadge[]`), `:630-635` (`UserBadge.id`, `userId`, `earnedAt`).
- **Sorun:** `prisma.badge.findMany({ where: { users: { some: { id: userId } } } })` ilişki tablosunun kendi `id`’siyle kullanıcı id’sini karşılaştırıyor. TypeScript bunu yakalamıyor çünkü `UserBadge.id` alanı var. Sonuç: rozetleri olan kullanıcı “Rozet Sayısı: 7” görürken aynı sayfada “Henüz rozet kazanmadınız” mesajı alıyor; İçgörüler’deki “Son: …” ve ikincil kartın detayı hiç dolmuyor. Sıralama da `Badge.createdAt` (rozetin tanımlandığı tarih) — “son kazanılan” anlamını taşımıyor.
- **Öneri:** Sorguyu `prisma.userBadge.findMany({ where: { userId }, orderBy: { earnedAt: 'desc' }, take: 5, select: { earnedAt, badge: { select: { id, name, icon, rarity, color, bgColor } } } })` olarak yeniden yaz; `hiddenUntilEarned` ve karakter rozetlerini (ConsumptionReview tabanlı sistem) de dahil edecek ortak bir `getRecentBadges(userId)` yardımcısı çıkar. Rarity’yi i18n anahtarına çevir, satırları `/customer/badges#<id>` linkine bağla. Bu sorgu için bir regresyon testi ekle.
- **Efor:** S

### 2. Yüksek · Mimari/doğruluk · Seviye ilerlemesi ve “kalan XP” yanlış formülle hesaplanıyor
- **Kanıt:** `app/customer/trends/page.tsx:218-219`, `app/api/customer/trends/route.ts:265-266`, gerçek formül `lib/utils.ts:94-103` (`calculateLevel`, çarpan 1,5), kullanım `lib/points-wallet.ts:46`.
- **Sorun:** Sistem seviye eşiklerini 1000, 1500, 2250… diye geometrik büyütüyor; sayfa ve API “her seviye 1000 XP” varsayıyor. Örnek: XP=5000 → gerçek seviye 4, sayfa ilerlemesi (5000−4000+1000)/1000 = %200 → `Progress` %100’e kırpıyor (`components/ui/progress.tsx:30`). Kullanıcı “dolu” çubuk görüp seviye atlamamasına şaşırıyor; “X XP kaldı” yanlış. `/api/customer/stats/route.ts:86-90` de aynı doğrusal hatayı tekrar ediyor → sistem genelinde tutarsızlık.
- **Öneri:** `lib/utils.ts` içindeki `calculateLevelProgress`’i genişletip `{ level, xpIntoLevel, xpForLevel, xpToNext, pct }` döndüren tek bir `getLevelProgress(xp)` fonksiyonu yap; tüm API’ler (trends, stats, profile) bunu kullansın ve istemci hiç formül bilmesin. “~N gün” tahmini için son 30 günün gerçek XP kazanımını (`points_credited`/XP olayları) kullan, yoksa tahmini gizle.
- **Efor:** S

### 3. Yüksek · Doğruluk · Haftalık değişim “++100%” ve yanlış yön ikonu
- **Kanıt:** `route.ts:224-226` (`'+100'`), `route.ts:312` (önüne tekrar `+`), `page.tsx:213-215`.
- **Sorun:** Geçen hafta 0, bu hafta >0 olan (yani en motive edilmesi gereken yeni) kullanıcı “++100%” görür; `parseFloat` NaN döndüğü için ikon “değişim yok” (gri eksi) olur. Ayrıca 0→N artışını “%100” saymak matematiksel olarak anlamsız.
- **Öneri:** API sayısal alan döndürsün (`feedbackChangePct: number | null`, `direction: 'up'|'down'|'flat'|'new'`); biçimlendirme istemcide `Intl.NumberFormat(locale, { style: 'percent', signDisplay: 'exceptZero' })` ile yapılsın. Önceki dönem 0 ise yüzde yerine “Yeni başladın: bu hafta 3 yorum” gibi mutlak bir mesaj göster.
- **Efor:** S

### 4. Yüksek · Doğruluk · Saat dilimi: gün kovaları, haftanın günü ve en aktif saat UTC
- **Kanıt:** `route.ts:147,177,194,279` (`toISOString().split('T')[0]`), `route.ts:243` (`getDay()`), `route.ts:256` (`getHours()`).
- **Sorun:** Vercel fonksiyonları UTC çalışır. TR kullanıcısının 01:30’da verdiği yorum önceki güne düşer, “En aktif saat 19:00-20:00” aslında 22:00-23:00’dür, seri hesabı gece yarısına yakın aktivitede kırılır. Hedef kitle akşam/gece mekan kullanan tüketici olduğundan etki gerçek.
- **Öneri:** Kullanıcı saat dilimini (profil alanı ya da istek başlığı/`Intl` ile istemciden `tz` parametresi) alıp gruplamayı `date-fns-tz` ile ya da doğrudan Postgres’te `date_trunc('day', "createdAt" AT TIME ZONE $tz)` + `GROUP BY` ile yap. Bu aynı zamanda 5000 satırı belleğe çekmeyi de ortadan kaldırır.
- **Efor:** M

### 5. Yüksek · Veri/sahte · Puan ilerleme grafiği gerçek değil, tahmin
- **Kanıt:** `route.ts:151-152,187-202`; gerçek kaynak örneği `app/api/customer/analytics/route.ts:125-158` (`points_credited` olayları).
- **Sorun:** Grafik her yorum için puan matrisindeki taban değeri toplayıp 0’dan başlayan kümülatif bir eğri çiziyor; oyunlar, görevler, rozet ödülleri, harcanan puanlar, happy hour çarpanları yok. Altındaki “Başlangıç: 0 puan → Şu an: 12.340 puan” etiketi (`page.tsx:954-963`) grafiğin kendisiyle tutarsız. Kullanıcı kendi bakiyesinin tarihçesi sanıyor.
- **Öneri:** `AnalyticsEvent(event='points_credited')` ve harcama olaylarından günlük net değişimi SQL’de toplayan bir `getPointsTimeline(userId, days, tz)` yaz; grafiği “bakiye” (gerçek bitiş = `currentPoints`, başlangıç = bitiş − net değişim) olarak çiz, kazanç/harcama ayrı renkte. Veri yoksa grafiği gösterme.
- **Efor:** M

### 6. Yüksek · Doğruluk · Toplam geri bildirim farklı dönemleri topluyor; seri sistem genelinde 4. kez yeniden icat edilmiş
- **Kanıt:** `route.ts:293` (`_count.feedbacks` tüm zamanlar + `consumptionReviewCount30d` 30 gün); `route.ts:272-289` sayfa-özel seri; şema `UserStreak` (`prisma/schema.prisma:1760`), `User.loginStreakCount` (User modeli, `lib/login-streak.ts`), `GameStreakClaim`; `analytics/route.ts:314-320` `UserStreak` kullanıyor.
- **Sorun:** “Geri Bildirim: 42” sayısı ne tüm zamanlar ne de 30 gün. Seri: bugün henüz yorum yazmamış kullanıcı (dün dahil 10 günlük seri) “0” görür — Duolingo mantığının tersi, motivasyon kırıcı; ayrıca `/customer/quests` bu bozuk seriyi `fetchStreak` ile (`app/customer/quests/page.tsx:223-232`) kendi ekranına taşıyor, `/customer/analytics` ise `UserStreak`’ten farklı bir sayı gösteriyor.
- **Öneri:** Toplamı `_count.feedbacks + _count.consumptionReviews` (ikisi de tüm zamanlar) olarak düzelt ve etiketle. Seri için ürün kararı ver: hangi seri “resmi” (login mi, yorum mu)? Tek bir `getStreak(userId)` servisi + “bugün hâlâ kurtarabilirsin” (grace) durumu döndürsün; quests/analytics/trends hepsi bunu kullansın. Dondurma bileti (`UserStreak.streakFreezes`) zaten modelde var — UI’da göster.
- **Efor:** M

### 7. Yüksek · Performans · Her açılışta önbelleksiz ağır global keşif sorgusu ve LLM çağrısı
- **Kanıt:** `page.tsx:133`, `app/api/customer/discovery/route.ts:124-170` (25.000 feedback + 20.000 review join’li + parçalı QR sorguları + 5.000 dealer), hiç cache yok; `recommendations-section.tsx:32` → `lib/recommendations.ts:194-208` her istekte `runChatCompletion`.
- **Sorun:** Trend mekanlar / haftanın enleri tüm kullanıcılar için aynı veri, ama her müşteri her açılışta bunu yeniden hesaplatıyor. Ölçek büyüdükçe Neon bağlantı havuzunu (memory’deki `connection_limit` tuzağıyla birlikte) zorlar. LLM başlığı da her görüntülemede token harcıyor.
- **Öneri:** Keşif agregasyonunu kullanıcıdan bağımsız bir `getDiscoverySnapshot()` fonksiyonuna ayır, Redis’te 10-15 dk sakla (cache-warm cron zaten mevcut); kişiye özel tek parça olan `favoriteDealerIds`’i ayrı ve hafif sorgula. Agregasyonu `GROUP BY dealerId` ile SQL’e taşı. LLM başlığını kullanıcı + öneri kümesi hash’iyle 24 saat cache’le ya da sabit şablona düş.
- **Efor:** M

### 8. Yüksek · Ürün/UX · “Duygu skoru” ve “Gelişim alanı var” kullanıcıyı pozitif yoruma itiyor
- **Kanıt:** `page.tsx:747-775`, `messages/tr.json` `customerTrends.sentiment.badgeNeedsWork/badgeGreat/performanceDescription` (“Pozitiflik performansınız”); skor `route.ts:236-238`.
- **Sorun:** Qratex’in değer önerisi işletmeye dürüst geri bildirim toplamak. Müşteriye negatif yorumlarını “performans eksikliği” gibi sunmak geri bildirimin kalitesini bozar (teşvik yanlılığı) ve işletme tarafındaki analizleri çarpıtır. Ayrıca skor −100…+100 aralığında ama “%” olarak gösteriliyor.
- **Öneri:** Bu sekmeyi “Deneyimlerin” olarak yeniden çerçevele: değer yargısı olmadan “Gittiğin mekanlarda deneyimlerinin %70’i iyi geçti” + “Yorumların işletmelere şu iyileştirmeleri yaptırdı” (remedy/my-year verisi). Rozet ve renkli yargı etiketlerini kaldır. ConsumptionReview için modelde zaten olan `sentiment` alanını (`schema.prisma:1616`) kullan, rating’den türetme (`route.ts:130-134`).
- **Efor:** M

### 9. Orta · Hata/i18n · Haftanın günleri kısaltması çakışıyor, dil sabit Türkçe
- **Kanıt:** `route.ts:247` (`['Pazar','Pazartesi',…,'Cuma','Cumartesi']`), `page.tsx:597` (`day.day.slice(0, 3)`).
- **Sorun:** Grafikte iki ayrı satır “Paz”, iki ayrı satır “Cum” etiketi taşıyor — kullanıcı hangisinin hangisi olduğunu ayıramaz. EN arayüzde Türkçe gün adları; `'Veri yok'` (`route.ts:261`) de aynı.
- **Öneri:** API gün indeksini (`0-6`) döndürsün; istemci `Intl.DateTimeFormat(locale, { weekday: 'short' })` ile etiketlesin ve hafta başlangıcını yerel ayara göre (TR: Pazartesi) sıralasın. `peakHour` için de `{ hour: number | null }` döndürülsün.
- **Efor:** S

### 10. Orta · Hata yönetimi · Discovery modül kapısı ve Promise.all bağımlılığı
- **Kanıt:** `discovery/route.ts:99-111`, `page.tsx:128-151`.
- **Sorun:** Admin `nearby` menüsünü veya `discovery` modülünü kapatırsa trends sayfası “Trend mekan verisi henüz oluşmadı” gibi yanlış boş durumlar gösterir ve kapalı sayfaya CTA verir. Discovery ağ hatasında `Promise.all` reddolur ve kişisel veri de çöpe gider.
- **Öneri:** `Promise.allSettled` kullan; 403/kapalı modülde keşif bölümlerini tamamen gizle. Daha iyisi: keşif bölümlerini bu sayfadan çıkar (bkz. Çakışmalar).
- **Efor:** S

### 11. Orta · UX · Yenile davranışı yanıltıcı, mobilde yok
- **Kanıt:** `page.tsx:165-169` (toast fetch’ten önce), `route.ts:20-23` (30 sn cache), `components/dashboard/page-heading.tsx:20` (`hidden sm:flex` → mobilde aksiyon da gizli).
- **Sorun:** “Veriler güncellendi” gösterilir ama veri aynı cache’ten gelir; hata olursa kullanıcı hem başarı hem hata toast’ı görür. Mobil (birincil kullanım) kullanıcısı yenileyemez.
- **Öneri:** SWR/React Query’ye geç (`revalidateOnFocus`, pull-to-refresh), başarı toast’ını kaldır (veri değişince sessiz güncelleme yeterli), Yenile’de `?fresh=1` ile sunucu cache’ini atla ya da yorum yazma akışında `customer-trends:${userId}` anahtarını invalidate et.
- **Efor:** S

### 12. Orta · Ürün/UX · Keşif verilerinde istatistiksel eşik yok, öğeler tıklanamıyor
- **Kanıt:** `discovery/route.ts:205-219,245-256`, `page.tsx:426-433,467-473,489-495`.
- **Sorun:** 1 yorumla 5,0 alan mekan “Haftanın en iyi servisi” olabilir. Trend mekan satırları, haftanın enleri ve sponsorlar tıklanamaz — keşif ekranının asıl işi olan “oraya git” eylemi yok. Ortalama puan “puan” (loyalty para birimi) kelimesiyle etiketleniyor (`messages/tr.json` `customerTrends.points`).
- **Öneri:** Bayesyen ortalama (ör. prior 3,8, m=5) ve minimum örnek eşiği; her öğe `/customer/nearby?focus=<dealerId>` (Ayın İşletmesi bileşenindeki desen) ya da mekan profil sayfasına link; puan yerine yıldız ikonu + “4,5 ★ · 23 yorum”. Sponsor kartlarına net “Sponsorlu” etiketi ve kampanya CTA’sı.
- **Efor:** M

### 13. Orta · Bilgi mimarisi · Aynı metrikler 3 kez, iki farklı ürün tek sayfada
- **Kanıt:** Puan: `page.tsx:255,961,1027`; XP: `273,848,1028`; Rozet: `364,839,1029`; Seri: `289,820`.
- **Sorun:** Üst kısım “benim istatistiklerim”, orta kısım “şehirde ne trend”, alt sekmeler yine “benim istatistiklerim”. Kullanıcı sayfanın ne için olduğunu anlayamıyor; görsel hiyerarşi her şeyi eşit ağırlıkta kart yaptığı için düzleşiyor.
- **Öneri:** Bkz. Yeniden tasarım vizyonu — tek bir anlatı (“Bu ay senin hikayen”) ve keşif içeriğinin başka sayfaya taşınması.
- **Efor:** L

### 14. Düşük · Erişilebilirlik · Grafiklerin metin alternatifi yok, sahte tıklanabilirlik
- **Kanıt:** `page.tsx:546-567` (tooltip yalnız `sm:` ve hover; `cursor-pointer` ama handler yok), `page.tsx:673` (SVG’de `role`/`aria-label` yok), `page.tsx:986-998` (hover + ChevronRight, tıklama yok), `page.tsx:1011` (`<a>` yerine `Link` yok).
- **Sorun:** Ekran okuyucu kullanıcısı grafik verisine erişemez; dokunmatik kullanıcı günlük değeri göremez; tıklanabilir görünen satırlar hiçbir şey yapmaz.
- **Öneri:** Grafiklere `role="img"` + özet `aria-label` ve gizli `<table>`; çubuklara dokununca seçili günü gösteren bir “seçili gün” bilgi şeridi (mobil uyumlu); chevron’u kaldır ya da gerçek link yap; `next/link` kullan. `height/width/strokeDasharray` animasyonlarını `useReducedMotion()` ile koşullandır.
- **Efor:** S

### 15. Düşük · Kod kalitesi · Ölü importlar, effect bağımlılığı, iptal yok
- **Kanıt:** `page.tsx:28,30,31,33` (`Crown`, `Percent`, `Users`, `Timer` kullanılmıyor), `page.tsx:161-163` (`fetchTrends` deps dışı, unmount’ta abort yok), `route.ts:57-114` (5000 satır belleğe çekilip JS’te gruplanıyor).
- **Öneri:** SWR/React Query ile veri katmanı; gruplamayı SQL’e taşı; kullanılmayan importları kaldır.
- **Efor:** S

## Eksik özellikler (kıyas ürünlerle)

1. **Paylaşılabilir özet kartı (Spotify Wrapped / Duolingo Year in Review):** “Bu ay 12 mekan, 34 yorum, 3 rozet” gibi tek dokunuşla Instagram story boyutunda görsel üreten paylaş akışı. `/customer/my-year` zaten yıllık versiyonu; aylık mikro-Wrapped bu sayfanın en doğal değeri.
2. **Dönem seçici ve geçmişle kıyas:** 7 gün / 30 gün / 90 gün / tüm zamanlar; “geçen aya göre” delta. Revolut/Monzo harcama analizinin temel kalıbı. Şu an 30 gün sabit.
3. **Hedef ve sonraki adım (Starbucks “Stars to next reward”):** “Bir sonraki ödüle 140 puan: 2 yorum daha” — istatistiği eyleme bağlayan, ödül kataloğuyla bağlantılı ilerleme. Sayfada hiçbir CTA (yorum yaz, QR okut, ödüle git) yok.
4. **Seri koruma (Duolingo streak freeze):** Bugün kırılmak üzere olan seriyi gösteren uyarı + `UserStreak.streakFreezes` kullanımı; seri takvimi (ısı haritası).
5. **Topluluk karşılaştırması / lig bağlamı:** “Kullanıcıların %80’inden daha aktifsin”, lig/leaderboard konumu ile bağlantı.
6. **Etki görünürlüğü:** “Yorumların sonucunda 2 işletme iyileştirme yaptı” (remedy verisi) — geri bildirim platformu için en güçlü motivasyon ve dürüst yorumu ödüllendiren çerçeve.

## Yeniden tasarım vizyonu

**Hedef deneyim:** “Bu Ay Senin Hikayen” — kullanıcı sayfayı açtığında 5 saniyede (1) bu ay ne yaptığını, (2) bir sonraki ödüle/seviyeye ne kadar kaldığını, (3) bugün ne yapması gerektiğini anlar. Spotify Wrapped’ın anlatı ritmi + Starbucks’ın “sonraki ödül” netliği + Duolingo’nun seri gerilimi.

**Yerleşim (mobil öncelikli):**
1. **Hero — İlerleme halkası:** Tek büyük halka: seviye ilerlemesi (doğru `getLevelProgress`), ortada seviye, altında “1.240 XP kaldı · bu tempoyla ~9 gün”. Yanında küçük puan bakiyesi ve “Sonraki ödül: Ücretsiz kahve — 140 puan” çipi (`/customer/rewards` linki).
2. **Seri şeridi:** Son 14 günün nokta takvimi + “Bugün yorum yaz, 11. gün olsun” CTA’sı (grace durumu), dondurma bileti sayısı.
3. **Dönem seçici (7/30/90 gün)** + 3 KPI: yorum, ziyaret edilen mekan, kazanılan puan — her biri önceki döneme göre delta (`Intl` yüzdesi).
4. **Aktivite:** Tek bir gerçek veri grafiği — günlük kazanılan/harcanan puan çubukları (`points_credited` tabanlı), dokununca alt bilgi şeridi.
5. **Deneyimlerin & Etkin:** Yargısız deneyim dağılımı + “yorumların yarattığı değişiklikler” (remedy).
6. **Son rozetler:** `UserBadge.earnedAt` sıralı yatay kaydırmalı koleksiyon şeridi, `/customer/badges`’e bağlı (karakter rozetleri dahil).
7. **Paylaş:** “Ayımı paylaş” → sunucuda `next/og` ile üretilmiş story görseli.

**Motion / 3B:** Ölçülü. Halka dolumu ve sayı count-up’ı (yalnızca ilk görünümde, `useReducedMotion` ile kapatılabilir), seri noktalarının sırayla yanması, seviye eşiğine çok yakınsa halkada hafif nabız. Sonsuz alev animasyonu ve her kartta stagger kaldırılsın. 3B gereksiz — rozet koleksiyonundaki mevcut küre/maskot reveal’ı burada tekrarlanmamalı; en fazla paylaş kartında statik render.

**Veri / API:**
- `GET /api/customer/progress?period=30d&tz=Europe/Istanbul` — tek sözleşme: `{ level: getLevelProgress(xp), points: { balance, timeline[] }, streak: getStreak(), activity: { byDay[], byWeekday[], peakHour }, deltas, recentBadges[], nextReward }`. Gruplama SQL’de (`AT TIME ZONE`), Redis 60 sn + yorum/kredi olaylarında anahtar invalidation.
- Keşif verisi bu uçtan tamamen çıkar; `getDiscoverySnapshot()` global cache’li olarak `/customer/nearby` ve `/customer/discover`’da kullanılır.
- İstemci: SWR/React Query, `Promise.allSettled` gereksiz hale gelir (tek uç).

## Çakışmalar / birleştirme önerisi

- **`/customer/analytics`** (`app/api/customer/analytics/route.ts`): Aynı soruya (“benim aktivitem nasıl?”) daha doğru veriyle (gerçek `points_credited`, `UserStreak`) cevap veriyor. İki sayfa aynı kullanıcıya farklı seri ve puan büyümesi gösteriyor. **Birleştir:** analytics’in doğru veri katmanı + trends’in görsel dili tek bir “İlerlemem” sayfasında.
- **`/customer/progress-hub`** (`/api/customer/stats`): Seviye/XP ilerlemesi — aynı doğrusal formül hatasıyla — burada da var. Hub, birleşik sayfaya yönlendirme ya da onun özeti olmalı.
- **`/customer/my-year`**: Yıllık Wrapped. Birleşik sayfanın “dönem = yıl” görünümü olarak konumlandırılabilir; en azından ortak `getProgress` servisini kullanmalı.
- **`/customer/nearby`** ve **`/customer/discover`**: Trend mekanlar, haftanın enleri, sponsorlar, Ayın İşletmesi ve “Sen Seversin” bu sayfalarda zaten var ya da oraya ait. Trends’ten **kaldırılıp** keşif yüzeyinde toplanmalı.
- **`/customer/quests`**: Trends API’sini yalnızca seri için çağırıyor (`app/customer/quests/page.tsx:223-232`) — ortak seri servisine taşınınca bu bağımlılık kalkar.
- **Keşif sayfasındaki “İçgörü” bölümü** (`app/customer/discover/page.tsx:57-63`) ai-insights, trends, journey-score, analytics, spending-overview’u yan yana listeliyor — kullanıcı açısından 5 ayrı “istatistiğim” sayfası. Bunların en az üçü (trends, analytics, progress-hub) tek sayfada toplanmalı.

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışıldı; kod okunarak (salt okunur) karar verildi. DB/test/build çalıştırılmadı.

### 1. Rozet sorgusu ilişki tablosunun id'sini kullanıcı id'siyle karşılaştırıyor — **DOĞRULANDI**
- `app/api/customer/trends/route.ts:205-208`: `prisma.badge.findMany({ where: { users: { some: { id: userId } } } })`.
- `prisma/schema.prisma:624` `users UserBadge[]`; `schema.prisma:631` `UserBadge.id String @id @default(cuid())`, kullanıcı alanı `userId` (`:632`). Filtre `UserBadge.id = <User.id>` karşılaştırıyor; bağımsız iki cuid eşleşmez → sonuç pratikte her zaman boş.
- Projede bu desenin tek kullanımı burası (`grep "users: { some"` → yalnızca `route.ts:207`).
- **Yeniden üretim:** En az bir rozeti olan müşteri `/customer/trends` açar → özet "Rozet" sayısı N (`user._count.badges`, `route.ts:294`, `page.tsx:1029`) ama Başarılar sekmesindeki liste `data.badges.length === 0` dalına düşer (`page.tsx:977`, `:1003-1009` "rozet yok" boş durumu); İçgörüler kartı "Son: …" yerine görev önerisi gösterir (`page.tsx:844`), ikincil kart detayı boş (`page.tsx:368`).
- Ek: sıralama `Badge.createdAt` (rozet tanım tarihi) — düzeltilse bile "son kazanılan" değil. Doğrusu `prisma.userBadge.findMany({ where: { userId }, orderBy: { earnedAt: 'desc' }, take: 5, select: { earnedAt, badge: { select: {...} } } })`.

### 2. Seviye ilerleme çubuğu / kalan XP geometrik formülle çelişiyor — **DOĞRULANDI**
- Gerçek seviye `lib/utils.ts:94-106` `calculateLevel` (eşikler 1000, +1500, +2250, +3375…; kümülatif 1000/2500/4750/8125) ve `lib/points-wallet.ts:46` seviyeyi bununla yazıyor.
- Sayfa `page.tsx:218-219` doğrusal varsayıyor: XP=5000 → level 4 → `(5000-4000+1000)/1000*100 = 200` → Radix `Progress` dolu görünür. XP=2600 (level 3) → `(2600-3000+1000)/10 = 60%`, gerçek ilerleme ise (2600-2500)/2250 ≈ %4.
- `route.ts:265-266` `xpToNextLevel = 1000 - xp%1000` → XP=5000 için 1000 gösterir, gerçek kalan 3125. `route.ts:268` `avgDailyXP = currentXP / 30` tüm-zamanlar XP'sini 30'a bölüyor (yalnızca son 30 günde aktivite varsa çalışıyor) → "~N gün" tahmini sistematik olarak iyimser.
- `app/api/customer/stats/route.ts:86-90` aynı doğrusal formülü kullanıyor (orada `Math.min(...,100)` ile kırpılıyor ama yine yanlış).
- **Yeniden üretim:** XP=5000, level=4 olan kullanıcı → seviye çubuğu %100, "1000 XP kaldı", oysa sonraki seviye 8125 XP'de.
- Öneri: `lib/utils.ts`'te tek bir `getLevelProgress(xp)` → `{ level, xpIntoLevel, xpForLevel, xpToNext, pct }`; trends, stats ve progress-hub bunu kullanmalı; günlük XP hızı gerçek son-30-gün XP kredisinden (points ledger) hesaplanmalı.

### 3. Haftalık değişim çift artı işareti ve NaN yönü — **DOĞRULANDI**
- `route.ts:224-226`: geçen hafta 0, bu hafta >0 → `feedbackChange = '+100'`.
- `route.ts:312`: `Number('+100') >= 0` → `'+' + '+100' + '%'` = `"++100%"`.
- `page.tsx:213`: `parseFloat("++100%")` = `NaN` → `isPositive`/`isNegative` ikisi de false (`:214-215`) → gri `Minus` ikonu (`:349-351`, `:638-644`).
- Normal yolda (`toFixed(1)` sonucu, ör. "50.0") sorun yok; hata yalnızca "geçen hafta 0" durumunda — ancak bu, yeni/geri dönen kullanıcı için en sık ve en motive edici an.
- **Yeniden üretim:** Önceki 7-14 gün aralığında yorumu olmayan, son 7 günde 1 yorum yazan kullanıcı → kartta "++100%" ve "değişim yok" ikonu.
- Öneri: API sayısal alan döndürsün (`changePct: number | null`, `direction: 'up'|'down'|'flat'|'new'`), biçimlendirme istemcide `Intl.NumberFormat('tr-TR', { style: 'percent', signDisplay: 'exceptZero' })` ile; "geçen hafta 0" için "+100%" yerine "Yeni" etiketi.

### 4. Zaman hesapları UTC — TR kullanıcısında gün/saat/seri kayması — **DOĞRULANDI** (önem: orta; kritik değil)
- `route.ts:147,177,194,279` `toISOString().split('T')[0]` UTC gün anahtarı; `route.ts:243` `getDay()` ve `:256` `getHours()` sunucu yerel saatine göre.
- `vercel.json` yalnızca `regions: ["fra1"]` içeriyor, TZ ayarı yok; `next.config.*` içinde `TZ`/`timeZone` yok, kodda `process.env.TZ` kullanımı yok. Vercel fonksiyonları varsayılan UTC çalışır (TZ Vercel'de ayrılmış değişken; ayrıca ayarlanmış olduğu bulunamadı).
- **Yeniden üretim:** TR saatiyle 21:30'da yorum yazan kullanıcı (UTC 18:30) → "En aktif saat 18:00 - 19:00". TR 01:00'de (UTC 22:00, önceki gün) yazılan yorum önceki günün çubuğuna ve haftanın önceki gününe yazılır; her gün 00:00-03:00 TR arası yazan kullanıcının serisi/günlük grafiği bir gün kaymış görünür. Ayrıca TR 00:00-03:00 arası sayfa açıldığında "bugün" (`i === 0`) UTC'de dün olduğu için seri hesabı TR gününe göre bir gün geride başlar.
- Not: Veri kaybı/güvenlik etkisi yok; gösterim doğruluğu sorunu. Bu yüzden önem "orta" olmalı.
- Öneri: Gruplamayı SQL'de `date_trunc('day', "createdAt" AT TIME ZONE 'Europe/Istanbul')` ile ya da JS'te `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' })` ile yapan ortak bir `toLocalDayKey(date, tz)` yardımcısı; saat için `Intl.DateTimeFormat(..., { hour: 'numeric', hourCycle: 'h23', timeZone })`. Kullanıcı TZ'si istemciden (`Intl.DateTimeFormat().resolvedOptions().timeZone`) parametre olarak alınabilir; cache anahtarına TZ eklenmeli.

### Özet
| # | İddia | Karar |
|---|---|---|
| 1 | Rozet sorgusu yanlış alan | Doğrulandı |
| 2 | Doğrusal seviye/XP formülü | Doğrulandı |
| 3 | "++100%" ve NaN yön | Doğrulandı |
| 4 | UTC gün/saat kayması | Doğrulandı (önem orta) |
