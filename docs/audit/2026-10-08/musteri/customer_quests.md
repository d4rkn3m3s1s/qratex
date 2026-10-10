# /customer/quests

**Amaç:** Müşterinin günlük, haftalık ve özel görevleri görüp ilerlemesini takip ettiği, tamamlanan görevlerin puan/XP ödülünü "Ödül Al" ile cüzdanına geçirdiği oyunlaştırma ekranı (Duolingo "Daily Quests" ve Starbucks "Challenges" karşılığı).

**Genel puan: 3.5 / 10** · **Karar: yeniden inşa** (sayfanın kabuğu kullanılabilir, ancak arkasındaki görev motoru yok: çoğu görev hiç ilerlemiyor, periyot sıfırlanmıyor ve otomatik ödüllenen görevler ikinci kez ödenebiliyor)

> Kapsam: `app/customer/quests/page.tsx`, `app/customer/quests/layout.tsx`, `GET /api/gamification/quests`, `POST /api/gamification/quests/[id]/claim`, `GET /api/customer/trends` (seri için), ilerleme yazan `lib/achievements.ts` ve `lib/visit-missions.ts`, `prisma/schema.prisma` içindeki `Quest`/`UserQuest`, admin tarafında `lib/validations.ts#createQuestSchema`, `app/admin/quests/page.tsx` ve `app/api/admin/bootstrap/route.ts`. Kod salt okundu; hiçbir şey çalıştırılmadı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 2/10 | Varsayılan ve admin "custom" görevlerinin ilerlemesini artıran kod yok. Günlük/haftalık sıfırlama yok. Zorluk rastgele atanıyor. Seri hesabı hatalı. Otomatik ödüllenen görevlerde "Ödül Al" ikinci ödeme yapıyor. |
| UX | 4/10 | Bilgi hiyerarşisi okunur, fakat ilerlemeyen görevler, "nasıl ilerlerim" bilgisinin olmaması, sessiz hata durumu ve tekrarlanan istatistikler güveni zedeliyor. |
| Görsel | 6/10 | Tutarlı shadcn kart dili, tür renk kodlaması ve ilerleme çubukları düzgün. Ancak jenerik bir "dashboard kartı" görünümünde, ödül anı ve kimlik zayıf. |
| Mimari | 3/10 | Görevin tanımı, ilerlemesi, ödülü ve "alındı" durumu üç farklı mekanizmaya dağılmış (`completedAt`, `auditLog CLAIM_QUEST_REWARD`, otomatik kredi). Tek bir kaynak doğruluk yok ve tip sözlüğü admin ile müşteri arasında uyumsuz. |
| Performans | 6/10 | Görev sorgusu tek sorgu ve 200 ile sınırlı. Ancak tek bir "seri" sayısı için ağır `/api/customer/trends` çağrılıyor ve sayfa tamamen istemci tarafında, ilk boyamada boş geliyor. |
| Erişilebilirlik + mobil | 4/10 | Mobilde "Ödül Al" ve filtre sekmeleri yalnız ikon ve `aria-label` yok. Yenile butonu mobilde hiç yok. Konfeti azaltılmış hareket tercihini yok sayıyor. 9–10px metinler var. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (başlık/açıklama) | ÇALIŞIYOR | `app/customer/quests/layout.tsx:4-6` | `segmentLayoutMetadata` ile i18n anahtarı. |
| 2 | Masaüstü sayfa başlığı + açıklama | ÇALIŞIYOR | `page.tsx:310-325`, `components/dashboard/page-heading.tsx:20-21` | `hidden sm:flex`, yalnız masaüstü. |
| 3 | Mobil başlık kartı | ÇALIŞIYOR | `page.tsx:327-332` | `sm:hidden` kopya başlık. |
| 4 | Yenile butonu | KISMİ | `page.tsx:240-244`, `page.tsx:313-324` | Mobilde hiç yok (`DashboardPageHeading` mobilde gizli). Başarı toast'ı fetch bitmeden ve hata olsa bile gösteriliyor. |
| 5 | Görev listesini çekme | KISMİ | `page.tsx:198-220`, `route.ts:28-47` | Süresi dolmuş görevler filtrelenmiyor. `success:false` olursa sessizce boş liste kalıyor. |
| 6 | Görev ilerlemesi (progress) | BOZUK | `lib/achievements.ts`, `lib/visit-missions.ts` dışında `userQuest` yazan yer yok | `give_feedback`, `feedback_with_photo`, `detailed_feedback`, `visit_businesses`, `referral`, `custom` tipleri için motor yok, ilerleme hep 0 kalıyor. |
| 7 | Günlük/haftalık periyot sıfırlama | EKSİK | `schema.prisma:675` `@@unique([userId, questId])`; reset/cron yok | "Günlük" görev bir kez tamamlanınca sonsuza kadar tamamlanmış kalıyor. |
| 8 | Zorluk yıldızları | SAHTE | `page.tsx:207-211` `difficulties[index % 3]` | Zorluk, listedeki sıraya göre döngüyle atanıyor. Veride karşılığı yok. |
| 9 | Hero: günlük görev ilerlemesi | KISMİ | `page.tsx:304-306`, `338-368` | Günlük görevler hiç ilerlemediği için pratikte hep %0. Günlük görev yoksa "0/0 tamamlandı" yazıyor. |
| 10 | %100 kıvılcımı + "tümü tamamlandı" bandı | KISMİ | `page.tsx:358-381` | Kod doğru, ancak 6 ve 7 nedeniyle ulaşılamaz ya da kalıcı olarak takılı kalır. |
| 11 | Seri (streak) kartı | BOZUK | `page.tsx:223-233`, `app/api/customer/trends/route.ts:272-288` | Algoritma hatalı: bugün geri bildirim yoksa 0 gösteriyor ve eski bir seriyle üzerine yazıyor. Gün sınırı UTC. |
| 12 | Hero mini istatistikler (tamamlanan, puan) | KISMİ | `page.tsx:401-410` | Hemen altındaki 4 kartta aynı iki değer tekrar gösteriliyor. |
| 13 | 4 istatistik kartı | KISMİ | `page.tsx:294-301`, `417-445` | "Kazanılan Puan/XP" alınmamış (claim edilmemiş) görevleri de topluyor. Etiket yanlış bilgi veriyor. |
| 14 | "Tümü" filtre sekmesi | KISMİ | `page.tsx:451-454` `hidden xs:inline` | `tailwind.config.ts` içinde `xs` ekranı yok, bu yüzden "Tümü" yazısı hiçbir genişlikte görünmüyor. |
| 15 | Günlük/Haftalık/Özel sekmeleri | ÇALIŞIYOR | `page.tsx:455-470`, `287-289` | Büyük/küçük harfe duyarsız filtre. Mobilde yalnız ikon (bkz. #38). |
| 16 | "Aylık" sekmesi | SAHTE | `lib/validations.ts:167` `z.enum(['daily','weekly','special'])` | Admin aylık görev oluşturamıyor, sekme her zaman boş. |
| 17 | "mystery" görev tipi | EKSİK | `schema.prisma:650` yorum; `page.tsx:76-149` | Tip sözlüğünde yok. Varsa İngilizce "Quest" etiketi ve gri stil gösterilir (`page.tsx:152-160`). |
| 18 | Filtre sonuç sayısı rozeti | ÇALIŞIYOR | `page.tsx:474-476` | Yalnız masaüstü. |
| 19 | Yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:479-497` | 4 kart iskelet. Hero ve istatistikler iskeletsiz "0" gösteriyor. |
| 20 | Aktif görev kartı (ad, açıklama, tür rozeti) | ÇALIŞIYOR | `page.tsx:511-611` | |
| 21 | Kart üst ilerleme şeridi + sayısal ilerleme | ÇALIŞIYOR | `page.tsx:528-535`, `559-569` | Şerit gecikmesi `index*0.1` sınırsız; 30 görevde 3 saniye bekleme olur. |
| 22 | Ödül puan/XP gösterimi | ÇALIŞIYOR | `page.tsx:575-583` | Sunucu `getQuestReward` ile normalize ediyor (`route.ts:86`). |
| 23 | Kalan süre rozeti | KISMİ | `page.tsx:169-186`, `597-602` | Canlı güncellenmiyor. Süresi dolmuş görev "Aktif" bölümünde "Süresi doldu" ile kalıyor. TR kısaltması "1s 20d" belirsiz. |
| 24 | Görev ikonu (`Quest.icon`) | EKSİK | `schema.prisma:649`; sayfa yalnız `config.icon` kullanıyor (`page.tsx:515`) | Admin'in seçtiği emoji/SVG hiç gösterilmiyor. |
| 25 | Kart hover/active etkileşimi | SAHTE | `page.tsx:526`, `643` `active:scale-[0.98] hover:shadow-lg` | Kartlar tıklanabilir gibi görünüyor ama hiçbir aksiyonları yok. |
| 26 | Tamamlanan görev kartı | ÇALIŞIYOR | `page.tsx:618-717` | |
| 27 | "Ödül Al" butonu | BOZUK | `page.tsx:246-285`, `claim/route.ts:82-94` | Otomatik ödül verilen görevlerde ikinci ödeme yapıyor (Bulgu 1). Süresi dolmuş tamamlanmış görevde buton görünüyor ama 400 dönüyor. |
| 28 | Claim sonrası konfeti | KISMİ | `page.tsx:263-268` | `disableForReducedMotion` yok. |
| 29 | Claim toast'ları | KISMİ | `page.tsx:259`, `claim/route.ts:181-204` | Sunucu hata metinleri sabit Türkçe; EN arayüzde dil karışıyor. |
| 30 | Claim sonrası durum güncelleme | KISMİ | `page.tsx:277-279` | Yalnız yerel `claimed` güncelleniyor. Bakiye ve diğer panellerin sorguları yenilenmiyor. |
| 31 | "Alındı" rozeti + soluk kart | ÇALIŞIYOR | `page.tsx:643`, `689-694` | |
| 32 | Boş durum (filtreli) + "Tümünü göster" | ÇALIŞIYOR | `page.tsx:728-735` | |
| 33 | Boş durum (tümü) + Tüketimlerim/Geri Bildirimlerim linkleri | KISMİ | `page.tsx:736-745`, `messages/tr.json customerQuests.noActiveHint` | Metin "geri bildirim vererek yeni görevler açılır" diyor, ama böyle bir açılma mekanizması yok. |
| 34 | Hata durumu UI | EKSİK | `page.tsx:206` (`else` dalı yok) | 401, 403 (modül kapalı) ve 500'de "Görev bulunamadı" boş durumu çıkıyor. Tekrar dene yok. |
| 35 | Modül kapısı | ÇALIŞIYOR | `route.ts:16-17`, `claim/route.ts:21-22` | İstemci "modül kapalı" durumunu ayırt etmiyor. |
| 36 | GET yetkilendirmesi (`userId` parametresi) | BOZUK | `route.ts:20-21`, `proxy.ts:105-118` | Oturumsuz biri bile `?userId=<id>` ile başka kullanıcının ilerleme ve claim durumunu okuyabiliyor (IDOR). |
| 37 | Claim sunucu güvenliği (tx + `FOR UPDATE` + idempotency + audit + `points_credited`) | ÇALIŞIYOR | `claim/route.ts:23-26`, `40-170` | Eşzamanlı çift tıklamaya dayanıklı. |
| 38 | İkon-only kontroller için erişilebilir ad | EKSİK | `page.tsx:685` (`hidden sm:inline`), `455-470` | Mobilde ekran okuyucu "Ödül Al" butonunu ve sekmeleri adsız okuyor. |
| 39 | Azaltılmış hareket | KISMİ | `components/providers.tsx:232` `MotionConfig reducedMotion="user"` | Framer transformları kapanıyor. Konfeti ve `animate-pulse`/`animate-spin` etkilenmiyor. |
| 40 | Görev detayı / "nasıl ilerlerim" yönlendirmesi | EKSİK | Kartta CTA yok | Kullanıcı ilerlemek için ne yapacağını bilmiyor (ör. "QR okut" kısayolu). |
| 41 | Claim bildirimi (Notification) | ÇALIŞIYOR | `claim/route.ts:118-131` | Başlıkta emoji, metin sabit TR. |

**Sayım:** ÇALIŞIYOR 15 · KISMİ 13 · BOZUK 4 · SAHTE 3 · EKSİK 6 (toplam 41)

---

## Bulgular

### 1. Otomatik ödüllenen görevler "Ödül Al" ile ikinci kez ödeniyor (puan basma açığı)
- **Önem:** kritik · **Kategori:** güvenlik / veri bütünlüğü (puan ekonomisi)
- **Kanıt:**
  - `lib/visit-missions.ts:105-128`: tamamlanınca `completedAt` set ediliyor ve `creditPointsAndXp` ile ödül hemen veriliyor. `CLAIM_QUEST_REWARD` audit kaydı yazılmıyor.
  - `lib/achievements.ts:113-172`: aynı desen. `COMPLETED_ACHIEVEMENT` audit kaydı yazılıyor ve ödül hemen veriliyor.
  - `app/api/gamification/quests/route.ts:61-89`: `claimed` yalnız `CLAIM_QUEST_REWARD` audit kaydına bakıyor. Sonuç: `completed=true`, `claimed=false`.
  - `page.tsx:674-688`: bu görevler için "Ödül Al" butonu çıkıyor.
  - `claim/route.ts:82-101`: yalnız `CLAIM_QUEST_REWARD` kontrol ediliyor, ödül ikinci kez veriliyor.
- **Sorun:** Bir `visit_category` görevi ya da bir SPECIAL başarım (Renk Sihirbazı, Hediye Ustası, Koleksiyoncu, Vitrin Ustası) tamamlandığında kullanıcı ödülü otomatik alıyor. Ardından görevler sayfasında aynı ödülü bir kez daha "alabiliyor". İki ödeme farklı tutarda bile olabilir: otomatik ödeme ham `reward` değerini kullanıyor (`visit-missions.ts:31-40`), claim ise matris varsayılanını kullanıyor (`points-rules.ts:301-314`). Bu, proje hafızasındaki "atomik tek seferlik kredi" değişmezini ihlal ediyor.
- **Öneri:** Kaynak doğruluğu tek yere taşıyın. `UserQuest` modeline `rewardedAt DateTime?` (ya da `claimedAt`) ve `rewardMode` (`AUTO`/`CLAIM`) ekleyin. Otomatik veren yollar da claim de aynı koşullu güncellemeyi kullansın: `updateMany({ where:{ id, rewardedAt:null }, data:{ rewardedAt: now } })`. Etkilenen satır sayısı 0 ise ödeme yapılmasın. GET, `claimed = rewardedAt != null` döndürsün. Geçiş (migration) için `COMPLETED_ACHIEVEMENT` ve visit-mission `points_credited` kayıtlarından `rewardedAt` geri doldurulsun. Canlıda kötüye kullanım olup olmadığını görmek için `points_credited` olaylarında aynı `questId` iki kez geçen kullanıcılar sorgulansın (`category IN ('quest','achievement')`).
- **Efor:** M

### 2. Görev ilerleme motoru yok: varsayılan, seed ve admin "custom" görevleri hiç ilerlemiyor
- **Önem:** kritik · **Kategori:** işlevsellik
- **Kanıt:**
  - `app/api/admin/bootstrap/route.ts:72-97`: varsayılan görevler `give_feedback` tipinde.
  - `prisma/seed.ts:218-310`: `give_feedback`, `feedback_with_photo`, `detailed_feedback`, `visit_businesses` ve `referral` tipleri.
  - `app/admin/quests/page.tsx:92,254`: admin yalnız `custom` ya da `visit_category` seçebiliyor.
  - Depo genelinde `userQuest` yazan tek yerler `lib/achievements.ts` ve `lib/visit-missions.ts` (grep ile doğrulandı). `app/api/feedbacks/route.ts` görev ilerlemesine dokunmuyor.
- **Sorun:** Sayfanın vaat ettiği ana döngü ("Günlük görevleri tamamlayarak puan kazanın", `messages/tr.json customerQuests.description`) çalışmıyor. Kullanıcı geri bildirim verse de ilerleme 0/1'de kalıyor. Görevler fiilen dekor.
- **Öneri:** Tek bir olay güdümlü motor kurun: `lib/quests/engine.ts` içinde `recordQuestEvent(userId, event: 'feedback_submitted' | 'consumption_review' | 'photo_feedback' | 'visit' | 'referral_completed', meta)`. Bunu feedback, consumption, referral ve shop rotalarından `after()` ile çağırın. Requirement tipleri için tipli bir sözlük (`QUEST_REQUIREMENTS`) tanımlayın: zod şeması, insan-okur etiket, "nasıl ilerlerim" CTA'sı ve sayaç fonksiyonu. Admin formu da bu sözlükten beslensin, böylece motorun tanımadığı tip oluşturulamasın. İlerleme artışı atomik olmalı (`UPDATE ... SET progress = LEAST(progress+1, target)`). Tamamlanma ve ödül Bulgu 1'deki tek koşullu güncellemeden geçmeli. `lib/achievements.ts` ve `visit-missions.ts` bu motora taşınmalı.
- **Efor:** L

### 3. Günlük/haftalık periyot kavramı veri modelinde yok, görevler sıfırlanmıyor
- **Önem:** yüksek · **Kategori:** mimari / işlevsellik
- **Kanıt:** `prisma/schema.prisma:664-678` (`@@unique([userId, questId])`, periyot alanı yok). Reset, cron ya da `deleteMany` bulunamadı (grep ile doğrulandı). `lib/achievements.ts:103-106` tamamlanmış görevde erken çıkıyor.
- **Sorun:** "Günlük" bir görev bir kez tamamlanıp alındığında ertesi gün yeniden başlamıyor. "Daily Quests" döngüsünün (Duolingo) temel mekaniği eksik. Hero'daki günlük ilerleme ya %0'da ya da sonsuza kadar %100'de kalıyor.
- **Öneri:** `UserQuest` modeline `periodKey String` ekleyin (ör. `2026-10-08`, `2026-W41`, `once`). Benzersizliği `@@unique([userId, questId, periodKey])` yapın. `periodKey` sunucuda `Europe/Istanbul` saat dilimine göre `getPeriodKey(type, now)` ile hesaplansın. GET o anki periyodun satırını getirsin. Böylece sıfırlama için cron gerekmez, geçmiş periyotlar kendiliğinden arşiv olur ve "bu hafta 5/7 gün tamamladın" gibi geçmiş görünümleri mümkün olur. Yanıtta `periodEndsAt` dönsün; kalan süre bundan hesaplansın.
- **Efor:** M

### 4. GET `?userId=` parametresi yetkisiz okumaya açık (IDOR)
- **Önem:** yüksek · **Kategori:** güvenlik
- **Kanıt:** `app/api/gamification/quests/route.ts:20-21` (`userIdParam === 'me' ? session... : userIdParam`). Oturum ve sahiplik kontrolü yok. `proxy.ts:105-118` `/api/*` için kimlik doğrulaması yapmıyor.
- **Sorun:** Oturumsuz biri bile herhangi bir kullanıcı ID'si ile o kişinin görev ilerlemesini, tamamlama ve claim durumunu ve `userQuestId` değerlerini okuyabiliyor. ID'ler cuid olduğu için tahmini zor, ancak ID'ler lider tabloları gibi başka yanıtlarda sızıyor olabilir (doğrulanmadı). Ayrıca yanıt `...quest` yayılımıyla `users` ve `_count` iç alanlarını da döndürüyor (`route.ts:84`).
- **Öneri:** Müşteri ucu yalnız `session.user.id` kullanmalı. `userId` parametresi kaldırılsın ya da yalnız ADMIN rolüne açılsın. Yanıt açık bir DTO ile şekillendirilsin (`id, name, description, icon, type, target, progress, completed, claimed, reward, periodEndsAt, cta`). `GET /api/gamification/quests/[id]` (`[id]/route.ts:12-34`) de modül kapısına ve `isActive` filtresine alınsın.
- **Efor:** S

### 5. Seri (streak) kartı hatalı ve tutarsız bir kaynaktan besleniyor
- **Önem:** yüksek · **Kategori:** veri doğruluğu / performans
- **Kanıt:** `page.tsx:223-233`; `app/api/customer/trends/route.ts:272-288` ve `147` (`toISOString` ile UTC gün).
- **Sorun:**
  - Bugün henüz geri bildirim yoksa (`i===0` boş) `currentStreak` 0'da kilitleniyor. Dün dahil 10 günlük seri "0 gün" görünüyor; Duolingo'da seri gün bitene kadar korunur.
  - `currentStreak > 0` koşulu boşluktan sonraki eski serileri de mevcut serinin üzerine yazıyor. Örnek: bugün ✓, dün ✗, 2–3 gün önce ✓✓ ise sonuç 2 olur, doğrusu 1.
  - Gün sınırı UTC; İstanbul'da 00:00–03:00 arası verilen geri bildirim önceki güne yazılıyor.
  - Tek bir sayı için 30 günlük ağır trend sorgusu (onlarca count/findMany) çalıştırılıyor.
  - Sistemde ayrıca `lib/login-streak.ts` var; "seri" kavramı sayfalar arasında farklı anlamlara geliyor.
- **Öneri:** Tek bir `lib/streak.ts` (`getActivityStreak(userId)`) yazın. Yerel saat dilimiyle gün anahtarı kullansın, "bugün ya da dün aktif" ise seriyi canlı saysın, ilk boşlukta dursun ve `{ current, best, atRisk, freezeAvailable }` döndürsün. Bu değer görev GET yanıtına eklenebilir (`meta.streak`); ikinci istek kalkar. Trends sayfası da aynı fonksiyonu kullansın.
- **Efor:** M

### 6. Zorluk göstergesi sahte (sıra indeksine göre döngü)
- **Önem:** orta · **Kategori:** sahte veri / güven
- **Kanıt:** `page.tsx:207-211` (`difficulty: difficulties[index % 3]`), `162-166`, `587-596`.
- **Sorun:** Kullanıcıya üç yıldızlı "zor" etiketi gösteriliyor ama bu yalnız listedeki sırayı yansıtıyor. Liste sırası değişince (yeni görev eklenince) zorluklar kayıyor. Etiketler İngilizce sabit (`'Easy'/'Medium'/'Hard'`), ancak kullanılmıyor.
- **Öneri:** Ya kaldırın ya da gerçek bir alana bağlayın: `Quest.difficulty` (admin seçer) veya ödül/hedef oranından türetilen sunucu tarafı bir kademe. Duolingo deneyimi zorluğu ödül kademesiyle (bronz/gümüş/altın sandık) gösterir; bu, mevcut karakter rozeti kademe diliyle de uyumlu olur.
- **Efor:** S

### 7. Hata durumları sessiz; kullanıcı modül kapalıyken ya da sunucu hatasında "görev yok" görüyor
- **Önem:** orta · **Kategori:** UX / hata yönetimi
- **Kanıt:** `page.tsx:204-213` (`data.success` false ise `else` dalı yok), `240-244` (başarı toast'ı fetch'ten bağımsız), `720-748`.
- **Sorun:** 401, 403 (modül kapalı) ve 500 yanıtlarının hepsi "Görev bulunamadı / henüz aktif görev yok" boş durumuna düşüyor. Yenile butonu, istek başarısız olsa bile "Görevler güncellendi" diyor; hata toast'ıyla birlikte iki çelişkili mesaj çıkabiliyor.
- **Öneri:** Diğer müşteri sayfalarında olduğu gibi TanStack Query'ye geçin (`useQuery(['customer','quests'])`). Üç ayrı durum gösterin: `error` (tekrar dene butonlu kart), `moduleDisabled` (açıklayıcı bilgi kartı) ve `empty`. Yenile işlemi `refetch()` sonucuna göre toast versin, ya da toast hiç olmasın (pull-to-refresh hissi yeterli).
- **Efor:** S

### 8. "Kazanılan Puan/XP" alınmamış ödülleri de sayıyor; istatistikler tekrar ediyor
- **Önem:** orta · **Kategori:** veri doğruluğu / bilgi mimarisi
- **Kanıt:** `page.tsx:299-300` (`filter(q => q.completed)`; `claimed` değil), `401-410` ile `417-445` (aynı değerler iki kez), `298` (`stats.claimed` hesaplanıyor ama kullanılmıyor).
- **Sorun:** Kullanıcı alınmamış ödülleri "kazanılmış" sanıyor. Hero ile 4 kart aynı bilgiyi tekrar ederek ekranın üst yarısını tüketiyor; asıl içerik (görevler) mobilde ikinci ekrana itiliyor.
- **Öneri:** İstatistikleri "Bu periyotta alınan puan", "Bekleyen ödül" (vurgulu, toplu al CTA'sıyla) ve "Seri" olarak üçe indirin ve tek bir hero şeridinde toplayın. 4 kartlık ızgarayı kaldırın.
- **Efor:** S

### 9. Tip sözlüğü admin ile müşteri arasında uyumsuz ("Aylık" sekmesi ölü, "mystery" desteksiz)
- **Önem:** orta · **Kategori:** mimari / tutarlılık
- **Kanıt:** `lib/validations.ts:167` (`daily|weekly|special`), `page.tsx:113-130` ve `463-466` (MONTHLY), `schema.prisma:650` (`mystery` yorumu), `page.tsx:152-160` (İngilizce "Quest" yedeği), `lib/achievements.ts:13` (`'SPECIAL'` büyük harf) ile `prisma/seed.ts:279` (`'special'` küçük harf).
- **Sorun:** Kullanıcıya hiç içerik gelemeyecek bir sekme sunuluyor. Tip değerleri büyük/küçük harf karışık saklanıyor; sayfa bunu 8 kopyalı bir config nesnesiyle telafi ediyor (`page.tsx:76-149`).
- **Öneri:** `QuestType` için Prisma `enum` tanımlayın (`DAILY, WEEKLY, MONTHLY, SPECIAL, EVENT`) ve mevcut veriyi normalize eden bir migration yazın. Admin şeması ve müşteri sözlüğü aynı sabitten türesin. Sekmeler, yanıtta gerçekten bulunan tiplerden dinamik üretilsin (boş tip sekmesi gösterilmesin).
- **Efor:** M

### 10. Mobil erişilebilirlik: adsız ikon butonlar ve sekmeler, mobilde yenileme yok, "Tümü" etiketi hiç görünmüyor
- **Önem:** orta · **Kategori:** erişilebilirlik / mobil
- **Kanıt:**
  - `page.tsx:685`: "Ödül Al" metni `hidden sm:inline`; mobilde buton yalnız ikon.
  - `page.tsx:453-469`: sekme metinleri mobilde gizli ve `aria-label` yok.
  - `page.tsx:453`: `hidden xs:inline`, ama `tailwind.config.ts:16-18` içinde `xs` ekranı tanımlı değil (`xs` yalnız `borderRadius` içinde, `:183`), bu yüzden "Tümü" hiçbir genişlikte görünmüyor.
  - `components/dashboard/page-heading.tsx:21`: yenile butonu mobilde gizli.
  - `page.tsx:404,408,598` gibi yerlerde 9–10px metin.
  - Progress bileşenlerinde erişilebilir ad yok.
- **Sorun:** Ana dönüşüm aksiyonu ("Ödül Al") mobilde, yani müşterinin asıl cihazında, en zayıf haliyle görünüyor. Yeşil bir hediye ikonunun ne yaptığı belirsiz.
- **Öneri:** Mobilde "Ödül Al" tam genişlikte, metinli ve en az 44px yüksek bir buton olsun. Sekmeler yatay kaydırılabilir "chip" listesine dönüşsün, metinler her zaman görünsün ve sayaç rozeti taşısın. Progress'e `aria-label={`${name}: ${progress}/${target}`}` verin. Mobilde yenilemeyi pull-to-refresh ya da başlıktaki ikon butonuyla sağlayın. Asgari metin boyutu 11–12px olsun.
- **Efor:** S

### 11. Ödül anı zayıf ve azaltılmış hareket tercihine kısmen saygısız; claim sonrası global durum güncellenmiyor
- **Önem:** düşük · **Kategori:** motion / UX
- **Kanıt:** `page.tsx:263-268` (`disableForReducedMotion` yok), `277-279` (yalnız yerel state), `389-390` (sonsuz alev animasyonu; `MotionConfig reducedMotion="user"` transformu kapatıyor, `components/providers.tsx:232`).
- **Sorun:** Konfeti genel ve her claim'de aynı. Kullanıcının bakiyesi, XP/seviye ilerlemesi ya da "seviye atladın" anı gösterilmiyor; sunucu `userPoints`/`userXp` döndürüyor (`claim/route.ts:163-169`) ama bu değerler kullanılmıyor. Panelin diğer sorguları (dashboard, progress-hub) eski kalıyor.
- **Öneri:** Claim yanıtını bir "ödül sayacı" anına çevirin: kart, ödül chip'ine dönüşüp puanı başlıktaki bakiye rozetine uçursun (framer `layoutId` ile) ve bakiye sayarak artsın. Seviye eşiği aşıldıysa mevcut seviye-atlama bileşeni tetiklensin. Konfeti `disableForReducedMotion: true` ile ve yalnız "günün tüm görevleri bitti" anında kullanılsın. Ardından `queryClient.invalidateQueries({ queryKey: ['customer'] })` çağrılsın.
- **Efor:** M

### 12. Süresi dolmuş görevler ve yanıltıcı affordance
- **Önem:** düşük · **Kategori:** UX / veri
- **Kanıt:** `route.ts:29` (`expiresAt` filtresi yok), `claim/route.ts:57-59` (süresi dolmuşta 400), `page.tsx:169-186` (yalnız render anında hesaplanıyor), `page.tsx:526,643` (tıklanamayan kartta `active:scale` ve `hover:shadow`).
- **Sorun:** Süresi dolmuş görev "Aktif" listede kalıyor. Tamamlanmış ama süresi dolmuş görevde "Ödül Al" butonu var, basınca hata alınıyor. Geri sayım dakika içinde donuk kalıyor. Kartlar tıklanabilir görünüyor ama tıklanınca hiçbir şey olmuyor.
- **Öneri:** Sunucu süresi dolmuşları ayrı bir `expired` durumuyla dönsün ya da hiç dönmesin. Tamamlanmış ama alınmamış görevlere süre bitiminden sonra bir "ödül penceresi" tanınsın (ör. 24 saat). Geri sayım tek bir `useNow(60_000)` hook'u ile canlı tutulsun. Kart tıklanınca detay sheet'i açılsın (Bulgu 13) ya da hover/active efektleri kaldırılsın.
- **Efor:** S

### 13. Görev "nasıl ilerler" bilgisi ve CTA'sı yok; `Quest.icon` kullanılmıyor
- **Önem:** düşük · **Kategori:** UX / eksik özellik
- **Kanıt:** `page.tsx:515` (ikon olarak yalnız tür ikonu), `schema.prisma:649` (`icon` zorunlu alan), kartlarda aksiyon linki yok. Boş durum metni yanıltıcı: `messages/tr.json customerQuests.noActiveHint` ("…yeni görevler açılır").
- **Sorun:** Kullanıcı "3 farklı işletmeye geri bildirim ver" görevini görüyor ama oraya giden bir yol yok. Admin'in özenle seçtiği emoji/SVG ikonlar görünmüyor.
- **Öneri:** Requirement sözlüğünden (Bulgu 2) her görev için `cta: { label, href }` üretin: "QR okut" → `/customer/scan`, "Yakındaki işletmeler" → `/customer/nearby`, "Davet et" → `/customer/referral`. Görev kartı `Quest.icon` değerini göstersin (emoji ya da `/images/badges/*.svg`); tür yalnız küçük bir rozetle belirtilsin. Boş durum metnini gerçeğe uygun hale getirin.
- **Efor:** S

### 14. Kod hijyeni: kullanılmayan importlar, stale closure, dil karışıklığı
- **Önem:** düşük · **Kategori:** kod kalitesi / i18n
- **Kanıt:**
  - `page.tsx:8,18,20,21,22,25,31`: `Clock`, `ChevronRight`, `Award`, `Crown`, `TrendingUp`, `Lock`, `CardHeader`, `CardTitle` kullanılmıyor.
  - `page.tsx:66-74`: `typeConfigData` yalnız tip için var.
  - `page.tsx:220`: `useCallback` bağımlılıkları `[]`, ama `t` kullanılıyor.
  - `page.tsx:163-165,153`: İngilizce sabit etiketler.
  - `claim/route.ts:121-122` ve tüm hata metinleri sabit TR; EN arayüzde toast olarak gösteriliyor (`page.tsx:259`).
  - `page.tsx:34`: müşteri sayfası `@/lib/admin-toast` kullanıyor.
- **Öneri:** API hata kodları makine-okur dönsün (`code: 'QUEST_EXPIRED'`) ve istemci bunları `t()` ile çevirsin. Ölü importlar ve tip yardımcıları temizlensin. Kart, hero ve istatistik parçaları ayrı bileşenlere bölünsün (`components/customer/quests/*`).
- **Efor:** S

### 15. (Bağlantılı) `advanceAchievementProgress` yarışa açık, eşzamanlı çağrıda çift kredi riski
- **Önem:** orta · **Kategori:** veri bütünlüğü (sayfaya veri sağlayan yol)
- **Kanıt:** `lib/achievements.ts:92-106` (`upsert`, sonra transaction dışında `completedAt` kontrolü), `115-121` (koşulsuz `update`), ardından `creditPointsAndXp`. `visit-missions.ts:107-114` bu hatayı `updateMany ... completedAt:null` ile düzeltmiş, achievements ise düzeltmemiş.
- **Sorun:** Örneğin kozmetik satın alma ya da vitrin pin işlemi aynı anda iki istekle gelirse iki çağrı da `completedAt=null` görür ve ödülü iki kez verir.
- **Öneri:** Bulgu 1 ve 2'deki tek motor kapsamında koşullu güncelleme (`updateMany where completedAt:null`) desenine geçin.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Periyodik görev döngüsü ve sandık ödülü (Duolingo Daily Quests):** Her gün 3 görev ve "günün tamamı" için bonus sandık. Bitiş saatine canlı geri sayım ve "yarın yeni görevler" önizlemesi.
2. **Seri koruma ve dondurma (Duolingo Streak Freeze):** "Serin bu gece bitiyor" uyarısı (push merkezine bağlanabilir), puanla alınan seri dondurma, en iyi seri rekoru.
3. **Kişiselleştirilmiş meydan okumalar (Starbucks Rewards Challenges):** Kullanıcının alışkanlığına göre seçilmiş görevler (ör. sık gittiği kategori). Dealer segment merkezi ve churn sinyaliyle beslenebilir; `lib/growth-playbooks.ts` zaten görev taslağı üretiyor.
4. **Toplu "Hepsini Al" ve bekleyen ödül göstergesi (Revolut/Monzo ödül hissi):** Bekleyen ödüller için sabit alt CTA ve sidebar/alt navigasyonda bekleyen ödül nokta rozeti.
5. **Görev geçmişi ve haftalık özet (Spotify Wrapped mini):** "Bu hafta 12 görev, 1.240 puan" kartı ve paylaşılabilir görsel. `/customer/my-year` ile bağlantılı.
6. **Görev zinciri / sezon pasosu:** Ardışık görevlerin bir sezon ilerleme çubuğunu doldurması. Mevcut "sezonluk etkinlik" altyapısıyla birleştirilebilir.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Kullanıcı sayfayı açtığında üç saniyede şunları anlamalı: "Bugün 3 görevim var, 1'i bitti, serim 6 gün ve 4 saat 12 dakika içinde biterse kaybederim, bekleyen 150 puanım var." Ardından tek dokunuşla ilgili aksiyona gidebilmeli (QR okut, işletme bul). Görev tamamlandığı an, uygulamanın neresinde olursa olsun bir "görev tamamlandı" tostu ile haberdar olmalı. Bu sayfa, ödülü toplamanın tatmin edici bir anı olmalı.

**Yerleşim (mobil öncelikli):**
1. **Hero şeridi (tek satır, sticky değil):** Sol tarafta seri alevi ve gün sayısı (riskteyse turuncu nabız). Sağ tarafta "Bekleyen ödül: +150" chip'i ve "Hepsini Al" butonu. Altında, periyot bitişine canlı geri sayımla günlük halka ilerlemesi (3 segmentli halka; her görev bir segment).
2. **Segment kontrolü:** Bugün · Bu hafta · Özel / Etkinlik. Yalnız içeriği olan segmentler görünür ve her biri sayaç taşır.
3. **Görev listesi:** Kompakt satır kartlar. Solda `Quest.icon`, ortada ad, "2/3" sayısı ve ince ilerleme çubuğu, sağda ödül chip'i. Tamamlanınca satır yeşile döner ve sağda "Al" butonu belirir. Satıra dokunulunca bottom sheet açılır: açıklama, nasıl ilerlenir, CTA (`/customer/scan` vb.) ve kalan süre.
4. **Günlük bonus sandığı:** Listenin sonunda, tüm günlük görevler bitince açılan bir sandık. Mevcut sürpriz kutu / 3B ödül kutusu bileşeni burada küçük ölçekte ve tek seferlik kullanılabilir.
5. **Geçmiş:** Altta katlanır "Geçen haftalar" bölümü (periyot arşivi).

**Motion / 3B (ölçülü):**
- İlerleme halkası segmentleri ve çubuklar yalnız değer değiştiğinde animasyon yapsın; sayfa açılışında kademeli gecikmeler 300ms ile sınırlansın.
- "Al" anı: ödül chip'i `layoutId` ile başlıktaki bakiye rozetine uçsun, bakiye sayarak artsın, hafif titreşim (`navigator.vibrate(10)`, destekleniyorsa) eşlik etsin.
- Konfeti yalnız günlük sandık açılışında ve `disableForReducedMotion` ile kullanılsın.
- 3B sandık yalnız sandık anında, `dynamic(..., { ssr:false })` ile tembel yüklensin. Görev listesine 3B eklenmesin.
- Sürekli dönen animasyonlar (alev nabzı) yalnız "seri risk altında" durumunda çalışsın.

**Veri / API değişiklikleri:**
- `UserQuest`: `periodKey`, `rewardedAt`, `rewardMode` alanları ve `@@unique([userId, questId, periodKey])`. `Quest.type` için Prisma enum. İsteğe bağlı `Quest.difficulty` ve `Quest.cta`.
- `lib/quests/engine.ts`: `recordQuestEvent()` (olay güdümlü, atomik artış, koşullu tek ödeme). achievements ve visit-missions bu motora taşınsın.
- `GET /api/customer/quests` (yeni, oturum zorunlu, `userId` parametresi yok). Dönen DTO: `{ quests: QuestDTO[], meta: { streak, pendingReward, periodEndsAt: { daily, weekly } } }`. Ayrıca kısa süreli (15–30 sn) kullanıcı başı Redis cache ve claim sonrası invalidation.
- `POST /api/customer/quests/claim` (tekil ya da `ids[]` ile toplu). Hata kodları makine-okur olsun. Yanıt `{ balance, xp, levelUp? }` içersin.
- İstemcide TanStack Query; claim için `useMutation` ve `['customer']` invalidation. İlk boyama için hero ve listenin server component ile önceden render edilmesi.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/progress-hub`** (`app/customer/progress-hub/page.tsx:30,72,157-170`): Aynı aktif görevleri `/api/customer/stats` üzerinden ikinci bir hesapla gösterip `/customer/quests` sayfasına link veriyor. **Öneri:** Progress-hub'daki görev kartı, yeni `GET /api/customer/quests` ucunu kullanan, paylaşılan bir `QuestSummaryCard` bileşenine dönüşsün; görev mantığı tek yerde kalsın.
- **Müşteri dashboard "haftalık kart"** (`app/api/customer/weekly-card/route.ts:19-60`, `components/customer/dashboard/customer-dashboard.tsx:198-200`): Görev normalizasyonunun üçüncü kopyası (`target`/`completed` hesabı aynı şekilde tekrar edilmiş). Bu kart da aynı motor ve DTO'dan beslenmeli.
- **`/customer/trends` ve `/customer/analytics` seri değeri:** Aynı hatalı `currentStreak` değerini gösteriyorlar. Seri tek bir `lib/streak.ts` fonksiyonuna taşınmalı (Bulgu 5).
- **Sayfanın kendisi kaldırılmamalı:** Görevler oyunlaştırmanın günlük geri dönüş kancası. Ancak "Görevler", "Rozetler", "Lig" ve "Sürpriz kutular" arasında ortak bir "İlerleme" bilgi mimarisi düşünülmeli: progress-hub bir özet merkezi olsun, `/customer/quests` derin sayfa olarak kalsın.

---

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışıldı; kod salt okunur incelendi (DB, script, test çalıştırılmadı).

### 1. Otomatik ödüllenen görevlerde çift puan/XP ödemesi — **DOĞRULANDI (kritik)**
- Otomatik kredi yolları: `lib/visit-missions.ts:110-117` (`updateMany(completedAt:null)` sonrası `creditPointsAndXp`, `CLAIM_QUEST_REWARD` audit'i YAZILMIYOR) ve `lib/achievements.ts:116-135` (`completedAt` set + `creditPointsAndXp`; audit `COMPLETED_ACHIEVEMENT`, satır 163).
- Liste ucu `claimed` bilgisini yalnızca `CLAIM_QUEST_REWARD` ile hesaplıyor (`app/api/gamification/quests/route.ts:61-74,89`) ve `completed = !!completedAt || progress >= target` (satır 81). Sonuç: otomatik ödenmiş görev `completed:true, claimed:false` döner.
- Sayfa bu kartlarda "Ödül Al" butonunu gösteriyor (`app/customer/quests/page.tsx:292,674-685`, `quest.claimed` false iken) ve `POST /api/gamification/quests/{id}/claim` çağırıyor (satır 252).
- Claim ucu yalnızca `CLAIM_QUEST_REWARD` audit'ine bakıyor (`app/api/gamification/quests/[id]/claim/route.ts:82-94`), `completedAt` dolu olması onu durdurmuyor; tersine "tamamlandı" sayıyor (satır 73) ve `creditPointsAndXp` ile ikinci kez ödüyor (satır 96-101).
- Tutarlar farklılaşabilir: otomatik yol ham `reward.points/xp` kullanıyor (`visit-missions.ts:31-40`, `achievements.ts:126-128`); claim ucu `getQuestReward` ile `xp` yoksa `floor(points/2)`, `points` yoksa matris varsayılanı veriyor (`lib/points-rules.ts:301-314`). Örn. `reward:{xp:50}` olan bir görev otomatikte 0 puan, claim'de `matrix.quest.default.points` basar.
- **Yeniden üretim:** Müşteri olarak `POST /api/customer/custom-color` (`{customFrameColor:"#ff0000"}`) → `quest-color-wizard` otomatik +50 puan/+100 XP (`app/api/customer/custom-color/route.ts:29-31`). `/customer/quests` "Tamamlanan" bölümünde kart "Ödül Al" gösterir; tıklanınca ikinci kez +50/+100 yazılır. Aynısı vitrin (`showcase/route.ts:119-120`), hediye, mağaza ve bayi tüketimiyle tetiklenen `visit_category` görevleri (`app/api/dealer/consumptions/route.ts:366`) için de geçerli. Bu, "tek seferlik atomik kredi" değişmezinin doğrudan ihlalidir.
- **Düzeltme yaklaşımı:** Ödeme durumu audit log'dan değil `UserQuest` üzerindeki tek bir alandan (`rewardedAt`) okunmalı; hem otomatik yol hem claim ucu `updateMany({ where:{ id, rewardedAt:null }, data:{ rewardedAt:now } })` ile koşullu "ilk çeviren öder" desenini kullanmalı. Otomatik ödenen görevler DTO'da `claimed:true` (veya `rewardMode:'auto'`) dönmeli; sayfa bu kartlarda buton yerine "Otomatik verildi" rozeti göstermeli. Ödül hesabı tek fonksiyona (`getQuestReward`) bağlanmalı. Canlıdaki mevcut çift ödemeler `COMPLETED_ACHIEVEMENT`/`points_credited(category:'quest')` + `CLAIM_QUEST_REWARD` kesişimiyle tespit edilip mutabakat yapılmalı.

### 2. `GET /api/gamification/quests?userId=` ile yetkisiz okuma (IDOR) — **DOĞRULANDI (orta önem)**
- `route.ts:18-21`: `userId` `'me'` değilse parametre aynen kullanılıyor; oturum ya da sahiplik kontrolü yok. `proxy.ts:103-118`: `/api/*` yalnızca güvenlik/CORS başlığı ekleyip `NextResponse.next()` dönüyor, kimlik doğrulama yapmıyor. `assertModuleEnabled` (`lib/module-gate.ts:92-103`) yetki değil, modül açık/kapalı kontrolü.
- Kullanıcı ID'leri gizli değil: `app/api/leaderboard/route.ts:24` `id` alanını döndürüyor; yani hedef seçmek kolay.
- **Yeniden üretim:** Oturumsuz `curl 'https://<site>/api/gamification/quests?userId=<liderlik tablosundan alınan id>'` → her aktif görev için o kullanıcının `progress`, `completed`, `claimed`, `userQuestId` ve `users[0].completedAt` değerleri döner (satır 34-43, 83-91). `visit_category` görevlerinde bu, kişinin kaç farklı işletmeye / hangi kategoride gittiğini ve tamamlanma zamanını sızdırır.
- **Önem notu:** Sızan veri doğrudan PII değil (isim/e-posta yok); `_count.users` zaten toplam katılımcı sayısı. Bu yüzden "kritik" değil, orta seviye bir davranışsal veri sızıntısı. Ayrıca bulgu 1 ile birleşince saldırgan, hangi kullanıcıların çift ödeme yapılabilir durumda olduğunu da görebiliyor.
- **Düzeltme yaklaşımı:** `userId` parametresi tamamen kaldırılmalı; uç her zaman `session.user.id` kullanmalı (oturum yoksa 401). Başka kullanıcının ilerlemesi gerekiyorsa ayrı, ADMIN korumalı bir uç olmalı. Yanıt `...quest` yayılımı yerine açık bir DTO ile şekillendirilmeli (`users`, `_count` ham alanları dönmemeli).

### 3. achievements ilerlemesinde yarış koşulu — **DOĞRULANDI (yüksek)**
- `lib/achievements.ts:92-107`: `upsert` ile okunan `completedAt` transaction DIŞINDA kontrol ediliyor; `116-122` koşulsuz `update` (WHERE yalnız `id`), ardından `131-135` kredi. Satır kilidi veya `completedAt:null` koşulu yok. Read Committed altında iki eşzamanlı istek ikisi de `completedAt=null` görür ve ikisi de öder. `increment` modunda ayrıca kayıp güncelleme (lost update) var: ilerleme bayat değerden hesaplanıyor (satır 109).
- `lib/visit-missions.ts:110-114` aynı sorunu `updateMany({ completedAt:null })` ile çözmüş; achievements çözmemiş, iddia doğru.
- **Yeniden üretim:** Kullanıcı 3 rozet/kozmetiğe sahip olsun. Önce `POST /api/customer/showcase` ile 2 öğe iğnele (UserQuest progress=2, tamamlanmamış kayıt oluşur). Sonra 3 öğeli aynı isteği paralel 10 kez gönder (`showcase/route.ts:119-120`, `set` modu, ücretsiz). Her istek `completedAt=null` okur → `quest-showcase-master` ödülü (+25/+50) birden çok kez yazılır. `quest-color-wizard` için de paralel `custom-color` çağrıları kayıt zaten mevcutken aynı sonucu verir. Etki tutarı görev başına küçük ama sınırsız eşzamanlılıkla katlanır ve bulgu 1'deki ikinci ödemeyle birleşir.
- **Düzeltme yaklaşımı:** Tamamlama + kredi tek transaction içinde `tx.userQuest.updateMany({ where:{ id, completedAt:null }, data:{ completedAt:now, progress } })` ile koşullu yapılmalı; `count===0` ise ödeme yapılmamalı. `increment` modu atomik `progress: { increment }` ile yazılıp dönen değerle hedef karşılaştırılmalı. Uzun vadede bu mantık raporda önerilen ortak `recordQuestEvent()` motorunda tekilleştirilmeli.

---

## Uygulama (Dalga 2)

**Yapılan:** Sayfa baştan yazıldı (Oyna → Görevler, play kaydı). `app/customer/quests/page.tsx` artık sunucu bileşeni: oturum, modül kapısı ve ilk pano sunucuda hazırlanıyor. Etkileşim küçük bir istemci adasında (`components/customer/m-gorevler/**`). Görev mantığı tek sunucu servisinde toplandı:

| Dosya | Görev |
|---|---|
| `lib/quests/period.ts` | Europe/Istanbul dönemleri (gün / Pazartesi haftası / ay / tek seferlik), dönem anahtarı, "bu dönemde ödendi mi", 24 saatlik ödül penceresi |
| `lib/quests/mechanics.ts` | Mekanik sözlüğü: `give_feedback`, `feedback_with_photo`, `detailed_feedback`, `visit_businesses`, `referral` (canlı sayım), `visit_category` ve başarımlar (saklı ilerleme, otomatik ödeme), `custom` (motorsuz). Her mekanik için "nasıl ilerlerim" metni ve CTA |
| `lib/quests/activity-streak.ts` | Yorum serisi: İstanbul günü, bugün ya da dün aktifse canlı, ilk boşlukta durur, `atRisk` |
| `lib/quests/board.ts` + `board-types.ts` | Pano DTO'su: görevler, gruplar, durumlar, bekleyen ödül, seri, bakiye, sezon challenge'ı, dönem sonları |
| `lib/quests/claim.ts` | Tekil ve toplu ödül alma: ilerleme sunucuda yeniden sayılır, satır kilidi + koşullu `updateMany` + `mintPoints` (dönemli görevde `quest:<uq>:<dönem>` anahtarı) + bildirim + audit |
| `GET /api/customer/quests`, `POST /api/customer/quests/claim` | `defineRoute` ile: yalnız `CUSTOMER`, modül kapısı, rate limit, zod, idempotency. Makine-okur hata kodları |
| `__tests__/lib/quests-board.test.ts` | 31 test: dönem sınırları, seri, mekanik sayımı, pano durumları, DTO sızıntısı, claim guard'ı, toplu alım |

**Şema değişmeden dönem döngüsü:** `UserQuest` tek satır (`@@unique([userId, questId])`) olarak kaldı. İlerleme, dönem penceresindeki kaynak kayıtlardan (geri bildirim, tüketim yorumu, ziyaret, davet) türetiliyor. Gece yarısı pencere değiştiği için cron olmadan sıfırlanıyor. "Ödendi mi?" sorusunun cevabı `rewardedAt >= dönem başı`. Ödeme `OR: [rewardedAt null, rewardedAt < dönem başı]` koşullu güncellemesiyle bir kez yapılıyor. Defterdeki dönem anahtarı ikinci savunma hattı.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Sayfa metadata | ÇALIŞIYOR | `layout.tsx` değişmedi |
| 2 | Sayfa başlığı + açıklama | ÇALIŞIYOR | QDL `PageHeader`; mobilde de görünüyor |
| 3 | Mobil başlık kartı | KALDIRILDI | Kopya başlıktı; artık tek başlık her genişlikte görünüyor |
| 4 | Yenile butonu | ÇALIŞIYOR | Her genişlikte `IconButton` (aria-label, 44px). Sahte "güncellendi" toast'ı yok; durum `isFetching` ile gösteriliyor |
| 5 | Görev listesini çekme | ÇALIŞIYOR | Sunucuda ilk render + BFF. Süresi dolanlar sunucuda süzülüyor. Hata görünür |
| 6 | Görev ilerlemesi | ÇALIŞIYOR | 5 mekanik canlı sayılıyor; ziyaret ve başarım kendi motorlarından. `custom` için motor yok, bkz. Kalanlar |
| 7 | Günlük/haftalık/aylık sıfırlama | ÇALIŞIYOR | Zaman tabanlı, Europe/Istanbul |
| 8 | Zorluk yıldızları | KALDIRILDI | Sahte veriydi (sıra indeksi). Ödül çipleri gerçek değeri gösteriyor |
| 9 | Hero: günlük ilerleme | ÇALIŞIYOR | Görev başına bir segment. Günlük görev yoksa "Bugün için günlük görev yok" yazıyor |
| 10 | %100 kıvılcımı + "tümü tamamlandı" bandı | KALDIRILDI | Segment dolumu ve An Motoru puan kapsülü bu işi görüyor. Ayrı konfeti yok |
| 11 | Seri kartı | ÇALIŞIYOR | Yorum serisi: İstanbul günü, bugün ya da dün aktifse canlı, risk uyarısı. Ağır trend çağrısı kaldırıldı |
| 12 | Hero mini istatistikler | KALDIRILDI | Tekrar ediyordu. Hero şeridinde bakiye, bekleyen ödül ve seri tek yerde |
| 13 | 4 istatistik kartı | KALDIRILDI | "Kazanılan" etiketi yanlıştı ve kartlar tekrar ediyordu. Yerine "Bekleyen ödül" ve "Hepsini al" geldi |
| 14 | "Tümü" sekmesi | KALDIRILDI | Her görev kendi grubunda; ödülü olan grup varsayılan açılıyor |
| 15 | Günlük/Haftalık/Özel sekmeleri | ÇALIŞIYOR | Bugün · Bu hafta · Bu ay · Sezon. Metin her zaman görünür, sayaç rozeti var, ≥ 44px, `?tab=` derin bağlantı |
| 16 | "Aylık" sekmesi | ÇALIŞIYOR | Yalnız aylık görev varsa çıkıyor (şema `monthly` kabul ediyor) |
| 17 | "mystery" görev tipi | ÇALIŞIYOR | Bilinmeyen tür tek seferlik sayılıp Sezon grubuna giriyor. İngilizce "Quest" yedeği kalktı |
| 18 | Sonuç sayısı rozeti | ÇALIŞIYOR | Sekme sayacı oldu, mobilde de görünüyor |
| 19 | Yükleniyor iskeleti | ÇALIŞIYOR | Sunucu render olduğu için hero ilk boyamada "0" göstermiyor. İstemci yedeği `QueryState` iskeleti |
| 20 | Aktif görev kartı | ÇALIŞIYOR | Kompakt satır: ikon, ad, ilerleme, durum, ödül |
| 21 | İlerleme şeridi + sayı | ÇALIŞIYOR | Stagger bütçeli (≤ 0,6 sn). Değer değişince akıyor |
| 22 | Ödül puan/XP | ÇALIŞIYOR | Claim görevinde `getQuestReward`; otomatik görevde gerçekte ödenen ham tutar |
| 23 | Kalan süre | ÇALIŞIYOR | Canlı `CountdownChip` (İstanbul). Süre dolunca pano yenileniyor; süresi dolan görev listede kalmıyor |
| 24 | Görev ikonu (`Quest.icon`) | ÇALIŞIYOR | Emoji ya da `/images/...`; yoksa mekanik ikonu |
| 25 | Kart hover/active | ÇALIŞIYOR | Satır artık ayrıntı sayfasını açıyor (nasıl ilerlerim, CTA, dönem bilgisi) |
| 26 | Tamamlanan görev kartı | ÇALIŞIYOR | Katlanır "Tamamlananlar" bölümünde |
| 27 | "Ödül Al" butonu | ÇALIŞIYOR | Otomatik görevlerde buton yok (B2). Süre bitiminden sonra 24 saat ödül penceresi. İlerleme sunucuda yeniden sayılıyor |
| 28 | Claim sonrası konfeti | KALDIRILDI | Yerine An Motoru puan kapsülü (`moments.points`): bakiye çipine uçuyor, sayarak artıyor, azaltılmış harekete uyuyor |
| 29 | Claim toast'ları | ÇALIŞIYOR | Sunucu kod döndürüyor, istemci TR/EN metne çeviriyor |
| 30 | Claim sonrası durum güncelleme | ÇALIŞIYOR | Bakiye önbelleği güncelleniyor, `['customer']` sorguları geçersizleniyor, `moments.refresh()` seviye anını çekiyor |
| 31 | "Alındı" rozeti | ÇALIŞIYOR | Otomatik ödenenlerde "Otomatik verildi" yazıyor |
| 32 | Filtreli boş durum + "Tümünü göster" | KALDIRILDI | Boş grup sekmesi hiç oluşmuyor; grup içinde dürüst boş metin var |
| 33 | Genel boş durum | ÇALIŞIYOR | Gerçeğe uygun metin + "QR okut" CTA. "Görev açılır" vaadi kaldırıldı |
| 34 | Hata durumu | ÇALIŞIYOR | `QueryState`: hata, yetkisiz, modül kapalı ve çevrimdışı ayrı; tekrar dene var |
| 35 | Modül kapısı | ÇALIŞIYOR | Sunucuda ve BFF'de. Modül kapalıysa açıklayıcı kart çıkıyor |
| 36 | GET yetkilendirmesi | ÇALIŞIYOR | Yeni BFF oturum zorunlu, `userId` parametresi yok, açık DTO. `GET /api/gamification/quests/[id]` pasif/arşiv görevleri yalnız yöneticiye gösteriyor |
| 37 | Claim sunucu güvenliği | ÇALIŞIYOR | Kilit + koşullu güncelleme + dönem anahtarlı defter + audit; eşzamanlı istek testlerle kapsandı |
| 38 | İkon-only kontrollerin erişilebilir adı | ÇALIŞIYOR | "Ödülü al" metinli ve ≥ 44px; sekmelerde metin; ilerlemede aria |
| 39 | Azaltılmış hareket | ÇALIŞIYOR | `useReducedMotionPref`, `motion-reduce`, `Ambient` (alev); konfeti yok |
| 40 | "Nasıl ilerlerim" yönlendirmesi | ÇALIŞIYOR | Ayrıntı sayfası + CTA (`/customer/scan`, `/customer/nearby`, `/customer/referral`, `/customer/shop`, `/customer/settings`) |
| 41 | Claim bildirimi | ÇALIŞIYOR | Başlıkta emoji yok; gerçekte kredilenen tutar yazıyor |

**Yeni eklenenler:** "Hepsini al" (toplu claim), bekleyen ödül göstergesi, sezon etkinliği challenge kartı (aktif `SeasonalCampaign` varsa; ödül mevcut `/api/customer/seasonal-event` ucundan alınıyor), dönem geri sayımları, bakiye çipi (puan kapsülünün hedefi).

**Sayım (yeni):** ÇALIŞIYOR 32 · KALDIRILDI 9 · KISMİ/BOZUK/SAHTE/EKSİK 0 (toplam 41)

### Kapanan bulgular

- **Bulgu 1** (otomatik görevlerde ikinci ödeme): P0-15'te kapanmıştı. Yeni servis aynı kuralı koruyor: otomatik görev `409 QUEST_AUTO_REWARDED` dönüyor ve UI'da buton yok.
- **Bulgu 2** (ilerleme motoru): beş mekanik için kapandı (canlı sayım). Kalan kısmı aşağıda.
- **Bulgu 3** (periyot sıfırlama): kapandı, şema değişikliği gerekmedi.
- **Bulgu 4** (IDOR + DTO): kapandı.
- **Bulgu 5** (seri): kapandı.
- **Bulgu 6** (sahte zorluk): kapandı.
- **Bulgu 7** (sessiz hata): kapandı.
- **Bulgu 8** (yanlış istatistik + tekrar): kapandı.
- **Bulgu 9** (tip sözlüğü): UI tarafında kapandı (dinamik gruplar, büyük/küçük harf duyarsız, bilinmeyen tür Sezon'a gidiyor). Prisma enum kalanlarda.
- **Bulgu 10** (mobil erişilebilirlik): kapandı.
- **Bulgu 11** (ödül anı + global durum): kapandı.
- **Bulgu 12** (süresi dolan görev, yanıltıcı affordance): kapandı.
- **Bulgu 13** (CTA, `Quest.icon`): kapandı.
- **Bulgu 14** (kod hijyeni, dil karışıklığı): kapandı. Sayfa yeniden yazıldı; hata kodları makine-okur.
- **Bulgu 15** (başarım yarışı): P0-15'te kapanmıştı.

### Kalanlar

- **`custom` ("Manuel — elle ilerletilir") mekaniği:** İlerletecek bir motor da admin aracı da yok. Müşteriye yalnız ilerleme satırı varsa gösteriliyor. Çözüm admin yüzeyinde: formdaki mekanik listesi `lib/quests/mechanics.ts → LIVE_MECHANICS` ile beslenmeli ve "Manuel" seçeneği kaldırılmalı (sahibi admin/quests).
- **`Quest.type` için Prisma enum:** Bulgu 9'un şema kısmı. Bu dalgada şema değiştirilmedi; UI her türü güvenle işliyor.
- **Geçmiş dönem arşivi ("Geçen haftalar") ve günlük bonus sandığı:** Uygulanmadı. Tek satırlı `UserQuest` dönem geçmişi tutmuyor; sandık için arka uç yok, eklemek sahte veri olurdu. Defterdeki `meta.period` ileride geçmiş için kaynak olabilir.
- **Seri dondurma:** Yok (F4.4 kapsamı).
- **Kullanıcı başı Redis önbelleği:** Eklenmedi. Pano yaklaşık 10 küçük sorgu ve sorgular paralel çalışıyor.
- **Tekrar eden hesaplar:** `progress-hub`, `weekly-card` ve `trends` hâlâ kendi görev/seri hesaplarını yapıyor (başka yüzeyler). Paylaşılan servisler hazır: `getQuestBoard`, `getActivityStreak`.
- **Eski `POST /api/gamification/quests/[id]/claim`:** UI artık kullanmıyor. Tek seferlik semantikle güvenli (dönemli görevde `rewardedAt` doluysa reddediyor). Kaldırılması `admin/modules/overview` kataloğu ve mevcut testlerle birlikte yapılmalı.
- **Sezon challenge ödül ucu** (`/api/customer/seasonal-event` POST) hâlâ `creditPointsAndXp` kullanıyor; bu, etkinlik yüzeyinin işi.
- **Ziyaret görevleri:** `visit_category` görevi `daily` türünde olsa bile sıfırlanmıyor, çünkü otomatik motor (`lib/visit-missions.ts`) ömür boyu sayıyor. Bu yüzden Sezon grubunda gösteriliyor.
- **Kullanılmayan çeviri anahtarları:** `messages/*.json` içindeki `customerQuests.*` anahtarları artık kullanılmıyor. Dosya paylaşılan olduğu için dokunulmadı.
- **Görsel doğrulama:** dev server/build bu dalgada yasak olduğundan ekran görüntüsüyle doğrulanmadı. Yalnız tsc, eslint ve jest çalıştırıldı.
