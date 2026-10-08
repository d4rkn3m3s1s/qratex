# /dealer/weekly-brief

**Amaç:** Bayiye her hafta otomatik üretilen "haftalık özet" kayıtlarının (DealerWeeklyBrief) geçmişini göstermek: öne çıkan temalar + önerilen aksiyon. Haftalık cron'un yazıp yalnızca e-posta/bildirimle ilettiği veriyi panelde okunur hâle getirmek için eklenmiş (`app/api/dealer/weekly-brief/route.ts:8-12`).

**Genel puan: 3.5 / 10** · **Karar: birleştir** (bu sayfa, `/dealer/innovation` içindeki "Haftalık özet" kartı ve `/dealer/operations-brief` ile tek bir "Haftalık Rapor" deneyimine birleştirilmeli; tek başına yaşatmak için fazla ince ve verisi tutarsız).

İncelenen dosyalar: `app/dealer/weekly-brief/page.tsx` (82 satır, tümü), `app/dealer/layout.tsx`, `components/layout/dashboard-page-hero.tsx` → `components/admin/admin-premium-hero.tsx`, `lib/admin-toast.ts`, `components/ui/card.tsx`, `app/api/dealer/weekly-brief/route.ts`, `lib/api-auth.ts` (getStaffDealerId), `lib/api-http.ts`, `proxy.ts`, `prisma/schema.prisma` (DealerWeeklyBrief, Feedback, Notification), üretici taraf: `lib/weekly-digest-core.ts`, `app/api/internal/inngest/weekly-digest/route.ts`, `lib/inngest/functions.ts`, `app/api/inngest/route.ts`, `app/api/cron/daily/route.ts`, `vercel.json`, `lib/growth-playbooks.ts`, `lib/timezone.ts`; aynı tabloya yazan ikinci yol: `app/api/dealer/innovation/weekly-brief/route.ts`, `lib/innovation-weekly-brief.ts`, `lib/innovation-week.ts`, `app/dealer/innovation/page.tsx`; menü: `components/dashboard/sidebar.tsx`, `lib/visibility-controls.ts`, `lib/module-controls.ts`.

---

## Puan kartı

| Alan | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Liste okuma çalışıyor ama gösterilen "AI özeti" aslında sabit playbook cümlesi, metrikler hiç saklanmıyor, HTTP hataları "henüz özet yok" diye maskeleniyor ve kayıtlar iki farklı üreticiden tutarsız geliyor. |
| UX | 3/10 | Menüde girişi yok (yetim rota), bildirimden derin bağlantı yok, kart başına tek cümle + çipten ibaret; karşılaştırma, trend, aksiyona dönüştürme yok. |
| Görsel | 4/10 | Ortak hero kullanılıyor ama eyebrow varsayılanı "Yönetim paneli" bayiye görünüyor; kartlar düz, hiyerarşi zayıf, yükleniyor durumu iskelet değil düz metin. |
| Mimari | 3/10 | Aynı tabloya iki ayrı mantıkla (farklı hafta anahtarı, farklı tema algoritması) yazılıyor; AI özeti üretilip atılıyor; feature flag ve modül kaydı yok. |
| Performans | 7/10 | Sayfa hafif: tek indeksli sorgu (`@@index([dealerId])`, `take: 12`), ağır bağımlılık yok; üretici cron tarafında sıralı döngü/tekrar AI harcaması riski var. |
| Erişilebilirlik + mobil | 5/10 | Hero azaltılmış hareketi destekliyor; ancak yükleniyor durumu `aria-live` değil, h1→h3 başlık atlaması var, mobilde çift yatay iç boşluk. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota erişim kapısı (yalnız DEALER) | ÇALIŞIYOR | `proxy.ts:50-73` | `/dealer` öneki DEALER dışındaki rolleri kendi paneline yönlendirir. STAFF/ADMIN API'de desteklense de sayfaya giremez. |
| 2 | Kenar çubuğu / menü girişi | EKSİK | `components/dashboard/sidebar.tsx:242` (yalnız `/dealer/innovation`), `lib/visibility-controls.ts:57` | Projede `/dealer/weekly-brief` href'i yalnızca sayfanın kendisinde geçiyor; kullanıcı URL'yi bilmeden ulaşamaz. |
| 3 | Sayfa metadata / sekme başlığı | KISMİ | `app/dealer/layout.tsx:13-23`; `app/dealer/weekly-brief/` altında layout yok | Sekmede yalnız panel varsayılan başlığı görünür; `innovation/layout.tsx` gibi segment metadata'sı yok. |
| 4 | Hero başlık + açıklama | KISMİ | `page.tsx:31-35`; `components/admin/admin-premium-hero.tsx:151` | `eyebrow` verilmediği için bayiye "Yönetim paneli" rozeti çıkıyor (25 bayi hero'sundan 19'u eyebrow geçiyor). |
| 5 | Hero iddiası "Her hafta otomatik üretilen AI özeti" | SAHTE | `page.tsx:33`; `lib/weekly-digest-core.ts:114-123` | Kaydedilen `recommendedAction` AI metni değil, 3 sabit playbook'tan birinin `title + dealerActions[0]` birleşimi. AI özeti yalnız e-postaya/bildirime gider, DB'ye yazılmaz. |
| 6 | Veri yükleme (`fetch('/api/dealer/weekly-brief')`) | KISMİ | `page.tsx:21-27` | `r.ok` kontrolü yok; abort/unmount koruması yok; yeniden deneme yok. |
| 7 | Yükleniyor durumu | KISMİ | `page.tsx:36-39` | Düz "Yükleniyor..." metni; iskelet yok, `role="status"`/`aria-live` yok. |
| 8 | Boş durum | KISMİ | `page.tsx:40-45` | "Pazartesi sabahı otomatik oluşturulur" vaadi, üreticinin yalnız Inngest cron'una bağlı olmasına dayanıyor (bkz. #26); hata durumları da buraya düşüyor. |
| 9 | Hata durumu | BOZUK | `page.tsx:22-25`; `route.ts:27,43-46` | 400/401/403/500/503 yanıtları JSON gövdeli olduğu için `.json()` başarılı olur, `d.briefs` undefined → boş durum gösterilir. Toast yalnız ağ hatası/parse hatasında tetiklenir. |
| 10 | Son 12 haftanın kart listesi | ÇALIŞIYOR | `route.ts:34-39`; `page.tsx:47-78` | `weekStart desc`, `take: 12`, yalnız gerekli alanlar seçiliyor. |
| 11 | Hafta tarih aralığı başlığı | KISMİ | `page.tsx:50-56`; `lib/timezone.ts:24-30` | Anahtar Pazartesi 00:00 UTC; `toLocaleDateString('tr-TR')` tarayıcı saat dilimini kullanır. TR (UTC+3) için doğru, UTC'nin batısındaki kullanıcıda bir gün kayar. `timeZone: 'UTC'` verilmemiş. |
| 12 | Kart alt başlığı "Haftalık otomatik AI özeti" | SAHTE | `page.tsx:58`; `app/api/dealer/innovation/weekly-brief/route.ts:62-79` | İnovasyon sayfasındaki elle "yenile" butonuyla üretilen kayıtlar da aynı listede çıkıyor; bunlar ne otomatik ne de AI (kelime frekansı + if/else). |
| 13 | Önerilen aksiyon kutusu | KISMİ | `page.tsx:61-64`; `lib/weekly-digest-core.ts:58-70,123` | Çalışıyor ama içerik 3 olası sabit cümleden biri; kural eşleşmezse varsayılan "Sessiz memnunlar (yüksek tüketim, düşük ses)" etiketi, tüketim verisine bakılmadan atanıyor. |
| 14 | Tema çipleri (tema + sayı) | KISMİ | `page.tsx:65-72`; `lib/weekly-digest-core.ts:39-44`; `lib/innovation-weekly-brief.ts:48-74`; `lib/ai-engine.ts:256` | Cron kayıtlarında `Feedback.topics` ham anahtarları (AI prompt örneği İngilizce: `"service"`, `"quality"`) çevrilmeden gösteriliyor; inovasyon kayıtlarında ise yorum metninden ham kelimeler ("yemek", "güzel"). Duygu/yön/trend bilgisi yok. |
| 15 | Hafta metrikleri (toplam, ort. puan, negatif, yüksek churn) | EKSİK | `lib/weekly-digest-core.ts:17-25,46-54`; `prisma/schema.prisma:2717-2729` | Hesaplanıyor ve e-postaya konuyor ama modelde alan yok; panelde gösterilemiyor. |
| 16 | Önceki haftayla karşılaştırma / trend grafiği | EKSİK | — | `prevTotal`, `prevAvgRating` hesaplanıp atılıyor (`weekly-digest-core.ts:33,47-50`). |
| 17 | 12 haftadan eski kayıtlar (sayfalama/arşiv) | EKSİK | `route.ts:37` | `take: 12` sabit, imleç yok. |
| 18 | "Şimdi üret / yenile" aksiyonu | EKSİK | Bu sayfada yok; yalnız `app/dealer/innovation/page.tsx:74-87` | Aynı veri için ikinci bir sayfada buton var; bu sayfada yok. |
| 19 | Önerilen aksiyonu göreve/aksiyon maddesine dönüştürme | EKSİK | — | `/dealer/action-items` mevcut ama bağ yok. |
| 20 | Paylaş / PDF / e-postayı yeniden gönder | EKSİK | — | Ekip (müdür/personel) ile paylaşma yolu yok. |
| 21 | Bildirimden derin bağlantı | EKSİK | `lib/weekly-digest-core.ts:146-153`; `prisma/schema.prisma:990-1001` | Bildirim `data` alanı boş; "Haftalık özetiniz hazır" tıklanınca bu sayfaya gitmez. |
| 22 | API yetkilendirme (DEALER/STAFF/ADMIN) | ÇALIŞIYOR | `route.ts:15-32`; `lib/api-auth.ts:158-168` | dealerId oturumdan türetiliyor; DEALER/STAFF için IDOR yok. ADMIN keyfi `dealerId` alabilir (beklenen davranış). |
| 23 | Admin için `dealerId` zorunluluğu | ÇALIŞIYOR | `route.ts:24-29` | Sayfa ADMIN'e kapalı olduğu için yalnız API düzeyinde anlamlı. |
| 24 | Önbelleksiz özel yanıt başlıkları | ÇALIŞIYOR | `route.ts:41`; `lib/api-http.ts:18-28` | `PRIVATE_NO_STORE_HEADERS`, DB erişilemezse 503. |
| 25 | Otomatik üretici (Pazartesi cron) | KISMİ (doğrulanmadı) | `lib/inngest/functions.ts:154-161`; `app/api/cron/daily/route.ts:5-11`; `vercel.json` (yalnız `/api/cron/daily`) | Üretim yalnız Inngest Cloud cron'una bağlı; Vercel'deki tek günlük toplayıcıya eklenmemiş. Inngest'in prod'da senkron olup olmadığı kod üzerinden doğrulanamadı; `953c8fe` commit'inin "günde ~292 tetikleme → 1" ölçümü, `*/2` dakikalık `outboxProcessFn` aktif olsaydı tutarsız olurdu — Inngest'in pratikte çalışmıyor olabileceğine güçlü işaret. |
| 26 | Kayıt bütünlüğü (aynı tabloya iki üretici) | BOZUK | `lib/weekly-digest-core.ts:124-143,171-172`; `app/api/dealer/innovation/weekly-brief/route.ts:63-79`; `lib/innovation-week.ts:2-9` | Bkz. Bulgu 1: elle üretilen kayıt, bir sonraki Pazartesi cron'unun bildirim + e-postasını sessizce iptal ediyor; kayıtların hafta etiketi ve içerik semantiği karışık. |
| 27 | Feature flag / modül görünürlük kaydı | EKSİK | `app/api/dealer/innovation/weekly-brief/route.ts:12-15` vs `route.ts` (yok); `lib/module-controls.ts:35` | İnovasyon ucu `cfg.features.weeklyBrief` ile kapatılabiliyor, bu uç ve sayfa kapatılamıyor; modül kataloğunda yok. |
| 28 | Çok dilli (i18n) metinler | EKSİK | `page.tsx:32-33,38,43,58`; kıyas `app/dealer/operations-brief/page.tsx:11,31-32` | Tüm metinler sabit Türkçe; kardeş sayfalar `useAppT` kullanıyor. Toast `lib/admin-toast.ts:19-20` "Dikkat: " öneki ekliyor (diğer yerde "Basarili" ASCII). |
| 29 | Azaltılmış hareket desteği | ÇALIŞIYOR | `admin-premium-hero.tsx:162,208-215` | Tek hareket (eyebrow ping) `useReducedMotion` ile kapanıyor; sayfa gövdesinde motion yok. |
| 30 | Mobil yerleşim | KISMİ | `page.tsx:30`; `app/dealer/layout.tsx:35` | Layout zaten yatay iç boşluk veriyor, sayfa ayrıca `p-6` ekliyor → 400px'te her yanda ~36px boşluk. Kartlar tek sütun, taşma yok. |
| 31 | Başlık hiyerarşisi (a11y) | KISMİ | hero `h1` (`admin-premium-hero.tsx` ~220), `CardTitle` → `h3` (`components/ui/card.tsx:40-44`) | h1'den doğrudan h3'e atlıyor; listede `<ul>/<li>` semantiği yok. |

**Sayım:** ÇALIŞIYOR 6 · KISMİ 11 · BOZUK 2 · SAHTE 2 · EKSİK 10 → toplam 31. (Not: #25 "KISMİ (doğrulanmadı)" KISMİ'ye sayıldı.)

---

## Bulgular

### 1. Elle üretilen inovasyon özeti, haftalık cron'un bildirim ve e-postasını sessizce iptal ediyor; kayıtlar karışık semantikte
- **Önem:** kritik · **Kategori:** veri bütünlüğü / hata
- **Kanıt:**
  - İnovasyon POST'u anahtar olarak **içinde bulunulan** haftayı kullanır: `app/api/dealer/innovation/weekly-brief/route.ts:63-79` (`utcMondayWeekStart()`, `lib/innovation-week.ts:2-9`), içerik ise "son 7 gün" kayan pencereden: `lib/innovation-weekly-brief.ts:26-27`.
  - Cron, **geçen tamamlanmış** haftayı anahtar yapar: `lib/weekly-digest-core.ts:171-172`.
  - Cron'un "ilk kez mi" kararı `createMany({skipDuplicates})` sayısına bağlı; kayıt zaten varsa `update` edip `status: 'skipped'` döner, **bildirim ve e-posta gönderilmez**: `lib/weekly-digest-core.ts:124-143`.
- **Sorun:** Bayi W haftasında `/dealer/innovation`'da "yenile"ye basarsa `(dealerId, W)` satırı oluşur. W+1 Pazartesi cron'u W için çalıştığında satırı mevcut bulur → bayiye o hafta ne in-app bildirim ne e-posta gider. Ayrıca bu sayfada aynı listede iki farklı tür kayıt görünür: (a) cron: `Feedback.topics`'ten ilk 6 tema + playbook cümlesi, tam takvim haftası; (b) inovasyon: ham kelime frekansından ilk 3 "tema" + if/else cümlesi, etiketlenen haftayla örtüşmeyen kayan 7 gün, `deletedAt` filtresi olmadan (`lib/innovation-weekly-brief.ts:30-36` — silinmiş geri bildirimler de sayılıyor). Kart başlığındaki tarih aralığı (b) için yanlış. Ters yönde, inovasyon sayfası GET'i içinde bulunulan haftayı aradığı için cron'un yazdığı (geçen hafta) kaydı hiç göstermez (`route.ts:29-34`).
- **Profesyonel öneri:** Tek bir "haftalık özet üretim servisi" tanımlayın (`lib/weekly-brief/service.ts`): hafta anahtarı her zaman **tamamlanmış** ISO hafta (`weekStart` = geçen Pazartesi 00:00, işletmenin saat diliminde), içerik tek algoritma (AI `themes` alanı üzerinden). Modele `source` (`cron|manual`), `status` (`draft|published`), `notifiedAt DateTime?` ekleyin; bildirim/e-posta kararını `createMany.count` yerine `UPDATE ... SET notifiedAt = now() WHERE notifiedAt IS NULL` atomik koşuluyla verin (memory'deki "atomik tek seferlik" desenine uygun). Elle "yenile", içinde bulunulan hafta için ayrı bir "ara görünüm" (kaydedilmeyen, anlık hesap) olsun ya da `source='manual'` ile işaretlenip cron'un bildirimini engellemesin. İnovasyon ucu bu servisi çağıran ince bir sarmalayıcıya dönüşsün.
- **Efor:** M

### 2. HTTP hataları "Henüz haftalık özet yok" boş durumuna dönüşüyor
- **Önem:** yüksek · **Kategori:** hata yönetimi
- **Kanıt:** `page.tsx:22-25` — `r.ok` kontrol edilmiyor; API hata gövdeleri JSON: `route.ts:27,43-46`, `lib/api-http.ts:20-27`.
- **Sorun:** Oturum düşmesi (401), DB uykuda/erişilemez (503, Neon duraklatma senaryosu memory'de yaşanmış), 500 durumlarında bayi "henüz özet yok, Pazartesi oluşur" mesajını görür; hata hiç bildirilmez, tekrar deneme yolu yoktur. Bu, verinin kaybolduğu izlenimi verir ve destek yükü yaratır.
- **Profesyonel öneri:** Projedeki ortak fetch/SWR kalıbına geçin (`useSWR` + `fetcher` `!res.ok` iken `retryable` alanını taşıyan hata fırlatsın). Üç ayrı durum: iskelet yükleme, hata kartı (mesaj + "Tekrar dene" butonu, 503'te "Veritabanı uyanıyor, birkaç saniye sonra yeniden denenecek" ve otomatik backoff), gerçek boş durum. Boş durum, üreticinin son çalışma zamanını da göstersin (bkz. Bulgu 4).
- **Efor:** S

### 3. "AI özeti" vaadi gerçek değil: AI metni üretilip atılıyor, panelde sabit playbook cümlesi gösteriliyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / ürün dürüstlüğü
- **Kanıt:** AI çağrısı `lib/weekly-digest-core.ts:106-117`; DB'ye yazılan yalnız `recommendedAction = \`${playbook.title}: ${playbook.dealerActions[0]}\`` (`:123-131`); playbook metinleri sabit (`lib/growth-playbooks.ts:19-62`); sayfa bunu "AI özeti" diye sunuyor (`page.tsx:33,58`). Metrikler (`total`, `avgRating`, `negativeCount`, `churnHighCount`) de saklanmıyor (`schema.prisma:2717-2729`).
- **Sorun:** Bayi tüm işletmelerde aynı 3 cümleden birini görür ("Düşük NPS + churn sinyali: 24 saat içinde düşük puanlı geri bildirimlere kişisel yanıt" vb.). Asıl değerli içerik (AI'nın 3-4 cümlelik yorumu, haftanın sayıları, önceki haftaya göre değişim) yalnız e-postada kalıyor; e-postayı kaçıran bayi panelde bulamıyor. Ayrıca `matchPlaybook` hiçbir koşul tutmazsa tüketim verisine hiç bakmadan "Sessiz memnunlar (yüksek tüketim, düşük ses)" etiketini basıyor (`weekly-digest-core.ts:69`) — yüksek hacimli, sağlıklı bir işletmeye "düşük ses" demek yanlış teşhis.
- **Profesyonel öneri:** `DealerWeeklyBrief`'e `summary Text`, `metrics Json` (`{total, prevTotal, avgRating, prevAvgRating, negativeCount, churnHighCount, responseRate}`), `playbookId String`, `aiGenerated Boolean` ekleyin; üretici bunları yazsın. Sayfa AI özetini birincil anlatı olarak, metrikleri delta'lı KPI şeridi olarak göstersin; AI yapılandırılmamışsa (fallback metni) etiketi "Otomatik özet" olsun, "AI" değil. `matchPlaybook`'a açık bir "nötr/sağlıklı hafta" dalı ekleyin ve `silent_happy`'yi yalnız tüketim/geri bildirim oranı gerçekten düşükken seçin.
- **Efor:** M

### 4. Sayfa yetim: menüde yok, bildirimden bağlantı yok, üreticinin prod'da çalıştığı doğrulanamıyor
- **Önem:** yüksek · **Kategori:** bilgi mimarisi / güvenilirlik
- **Kanıt:** Menü: `components/dashboard/sidebar.tsx:242`, `lib/visibility-controls.ts:57`, `lib/module-controls.ts:35` (yalnız inovasyon); bildirim `data` boş: `lib/weekly-digest-core.ts:146-153`; üretici yalnız Inngest: `lib/inngest/functions.ts:154-161`, Vercel'de tek cron `vercel.json` → `/api/cron/daily`, toplayıcı listesinde yok: `app/api/cron/daily/route.ts:5-11`.
- **Sorun:** Bayinin bu sayfayı bulması pratikte imkânsız. Inngest prod'da senkron değilse (doğrulanmadı; `953c8fe` commit mesajındaki tetikleme sayımı, `*/2` dakikalık outbox fonksiyonunun çalışmadığına işaret ediyor) tablo yalnız inovasyon butonu ile dolar ve boş durumdaki "Pazartesi sabahı otomatik oluşturulur" vaadi yanlış olur.
- **Profesyonel öneri:** (1) Haftalık özet üretimini `app/api/cron/daily/route.ts` toplayıcısına "yalnız Pazartesi ise çalış" koşuluyla ekleyin (commit'teki "yeni periyodik iş ayrı tetikleyici kurmasın" kuralına uygun); (2) bir `CronRun` / heartbeat kaydıyla son çalışma zamanını tutun ve boş durumda "Son üretim: 6 Ekim 08:00" gösterin; (3) bildirime `data: { href: '/dealer/weekly-brief#<weekStart>' }` ekleyin; (4) sayfayı birleştirilmiş "Haftalık Rapor" olarak menüye `moduleKey` ile kaydedin (bkz. Çakışmalar).
- **Efor:** M

### 5. Cron üreticisi ölçeklenmiyor: sıralı döngü, 300 sn sınırı, her yeniden denemede tüm bayiler için AI tekrar çağrılıyor
- **Önem:** orta · **Kategori:** performans / maliyet
- **Kanıt:** `lib/weekly-digest-core.ts:174-189` (tüm `role: 'DEALER'` kullanıcıları, aktiflik filtresi yok, `for...of` sıralı); AI çağrısı varlık kontrolünden **önce**: `:102-117` vs `:124`; `maxDuration = 300` ve `retries: 2`: `app/api/internal/inngest/weekly-digest/route.ts:8`, `lib/inngest/functions.ts:155`.
- **Sorun:** Bayi başına 5 sorgu + AI + e-posta sıralı çalışıyor; birkaç yüz bayide 300 sn aşılır. Yeniden denemede kayıt idempotent olsa da önceden işlenmiş her bayi için AI yeniden çağrılır (boşa token) ve Neon compute daha uzun uyanık kalır. Pasif/askıya alınmış bayiler de işlenir.
- **Profesyonel öneri:** Önce `(dealerId, weekStart)` varlığını kontrol edip varsa AI'yı atlayın; bayileri sınırlı eşzamanlılıkla (ör. 5'li `p-limit`) veya Inngest fan-out (bayi başına bir event, `step.run`) ile işleyin; yalnız aktif ve son 4 haftada en az bir geri bildirimi olan bayileri seçin.
- **Efor:** M

### 6. Tema çipleri ham anahtar/kelime gösteriyor; dil karışıyor ve anlam taşımıyor
- **Önem:** orta · **Kategori:** UX / i18n
- **Kanıt:** `page.tsx:65-72`; cron kaynağı `Feedback.topics` (`lib/weekly-digest-core.ts:36-44`), AI prompt örneği `"topics": ["service", "quality"]` (`lib/ai-engine.ts:256`); inovasyon kaynağı kelime tokenizasyonu (`lib/innovation-weekly-brief.ts:13-20,58-67`).
- **Sorun:** Türkçe arayüzde "service (4)" gibi İngilizce anahtarlar ya da "yemek (12)", "güzel (9)" gibi bağlamsız kelimeler çıkıyor. Temanın olumlu mu olumsuz mu konuşulduğu, geçen haftaya göre artıp azaldığı görünmüyor — yani karar destek değeri sıfıra yakın. Not: İngilizce anahtar iddiası prompt örneğine dayanıyor, canlı veride doğrulanmadı.
- **Profesyonel öneri:** Temaları `Feedback.themes` (Türkçe `theme/subTheme` + `sentiment`, `schema.prisma` ~792) alanından toplayın; her tema için `{label, count, positive, negative, deltaVsPrevWeek}` saklayın. UI'da çipler yerine yatay "tema çubuğu" (olumlu/olumsuz yığılmış, ▲▼ delta) gösterin; tıklanınca `/dealer/feedbacks?theme=...&from=...&to=...` filtrelenmiş listeye gitsin.
- **Efor:** M

### 7. Haftalık özet e-postasında kaçışsız HTML enterpolasyonu
- **Önem:** orta · **Kategori:** güvenlik (sayfa dışı, aynı veri akışı)
- **Kanıt:** `lib/weekly-digest-core.ts:81-82,88,90-92` — `businessName`, AI `summary`, tema adları ve playbook metinleri HTML'e doğrudan gömülüyor.
- **Sorun:** AI çıktısı (dolaylı olarak müşteri girdisinden etkilenen veriyle beslenir) veya bayi adı içinde `<a>`/`<img>` gibi HTML varsa bayinin e-postasına enjekte olur. Alıcı yalnız bayinin kendisi olduğu için etki sınırlı, ama kimlik avı bağlantısı için kapı.
- **Profesyonel öneri:** Projedeki mail şablon altyapısına (intern mail sistemindeki HTML kaçış yardımcıları) geçirin; tüm dinamik değerleri `escapeHtml` ile kaçırın, AI özetini düz metin olarak `white-space:pre-wrap` içinde verin.
- **Efor:** S

### 8. Tutarlılık ve erişilebilirlik kusurları
- **Önem:** düşük · **Kategori:** görsel / a11y / i18n
- **Kanıt:** eyebrow varsayılanı "Yönetim paneli" (`admin-premium-hero.tsx:151`, `page.tsx:31-35`); sabit Türkçe metinler (`page.tsx:32-58`) vs `useAppT` kullanan kardeş sayfa (`operations-brief/page.tsx:11,31`); yükleniyor durumu `aria-live`'sız (`page.tsx:36-39`); h1→h3 (`components/ui/card.tsx:44`); çift yatay boşluk (`page.tsx:30` + `layout.tsx:35`); UTC anahtarı yerel saat dilimiyle biçimleniyor (`page.tsx:56`); segment metadata yok.
- **Sorun:** Bayi panelinde admin dili görünmesi, İngilizce arayüz seçen kullanıcıda Türkçe kalan sayfa, ekran okuyucuda durum değişikliğinin duyurulmaması ve mobilde gereksiz dar içerik.
- **Profesyonel öneri:** `eyebrow={t('dealerWeeklyBrief.eyebrow')}` ("İşletme paneli · Haftalık"), tüm metinleri i18n anahtarlarına taşıyın; yükleme için `Skeleton` + `role="status"`; kart başlığını `h2` yapın ve listeyi `<ol aria-label="Haftalık özetler">` ile sarın; `p-6` yerine kardeş sayfalardaki gibi yalnız dikey boşluk; tarih biçimlemede `Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short' })` ("29 Eyl – 5 Eki 2026"); `weekly-brief/layout.tsx` ile `segmentLayoutMetadata`.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

Kıyas: Medallia ve Qualtrics CX'in haftalık "executive digest"leri, Google Business Profile performans raporları, Yelp for Business haftalık özeti, Square/Toast haftalık satış özeti.

1. **KPI şeridi + önceki haftaya göre delta** (geri bildirim sayısı, ortalama puan, NPS, negatif oranı, yanıt oranı/süresi, churn riski). Square ve Toast haftalık özetinin omurgası budur; burada hesaplanıp atılıyor.
2. **Haftalar arası trend görünümü** (son 12 haftanın puan/hacim çizgisi, tema ısı haritası). Qualtrics/Medallia'da standart.
3. **Kanıta inme (drill-down):** her tema/metrikten ilgili geri bildirim listesine tarih aralığıyla filtreli geçiş; Medallia'daki "örnek yorumlar" (en olumlu/en olumsuz 3 alıntı) bloğu.
4. **Aksiyonu kapatma döngüsü:** önerilen aksiyondan tek tıkla görev oluşturma (`/dealer/action-items` veya ekip modülü), atanan kişi, son tarih; sonraki haftanın özetinde "geçen haftanın aksiyonu: tamamlandı/bekliyor".
5. **Dağıtım ve abonelik ayarları:** özeti kimin alacağı (müdür, şube sorumlusu), gün/saat, kanal (e-posta/push), PDF dışa aktarma ve paylaşım bağlantısı; Google Business Profile ve Yelp'te alıcı tercihleri var.
6. **Kıyas bağlamı:** sektör/şehir ortalamasına göre konum (`/dealer/benchmark` verisiyle), şube bazında kırılım (çok şubeli bayi için).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi Pazartesi sabahı bildirim veya e-postadaki bağlantıyla tek bir "Haftalık Rapor" sayfasına iner ve 30 saniyede şunları anlar: "Bu hafta nasıl geçti, ne değişti, neden değişti, bu hafta ne yapmalıyım?" Sonra tek tıkla aksiyonu ekibine atar.

**Yerleşim:**
1. **Üst şerit:** hafta seçici (◀ 29 Eyl – 5 Eki ▶ + açılır liste/arama), durum rozeti ("Otomatik · AI" / "Otomatik özet"), "PDF indir", "Ekiple paylaş".
2. **KPI satırı (4-6 kutu):** değer + önceki haftaya göre ▲▼ delta + mini sparkline (son 8 hafta). Mobilde 2 sütun.
3. **AI anlatısı kartı:** saklanan 3-4 cümlelik özet; altında "Bu özet şu verilere dayanıyor" açılır bölümü (şeffaflık: kaç geri bildirim, hangi tarih aralığı).
4. **Temalar:** olumlu/olumsuz yığılmış yatay çubuklar, delta oku; satıra tıklayınca sağda (mobilde alt sayfa) 3 örnek alıntı + "Tümünü gör" bağlantısı.
5. **Önerilen aksiyonlar (playbook):** 2-3 madde; her birinde "Görev oluştur" (atanan + son tarih), "Kampanya taslağı" (segment-actions/campaigns'e derin bağlantı), "Uygulandı" işareti. Geçen haftanın aksiyon durumu küçük bir "takip" satırı olarak.
6. **Arşiv:** alt bölümde 12+ hafta zaman çizelgesi (imleçli sayfalama), her satırda puan/hacim mini değerleri.

**Motion / 3D:** 3D gereksiz; bu bir okuma/karar sayfası. Ölçülü motion: KPI sayılarında hafif sayaç animasyonu (yalnız ilk görünümde, 400 ms), hafta değişiminde içerik için kısa çapraz geçiş (`m as Motion` + `AnimatePresence`, 150-200 ms), tema satırı açılırken yükseklik geçişi. Hepsi `useReducedMotion` ile kapatılabilir; eyebrow ping'i mevcut haliyle yeterli.

**Veri / API değişiklikleri:**
- `DealerWeeklyBrief` genişletme: `summary Text`, `metrics Json`, `themes Json` (`{label, count, positive, negative, delta}`), `playbookId String`, `aiGenerated Boolean`, `source String @default("cron")`, `notifiedAt DateTime?`, `timezone String?`. Mevcut satırlar için geriye dönük uyumlu (alanlar opsiyonel).
- Tek üretim servisi (`lib/weekly-brief/service.ts`), cron toplayıcısına Pazartesi koşuluyla bağlı, sınırlı eşzamanlılık, AI'dan önce varlık kontrolü, bildirim/e-posta için `notifiedAt` atomik bayrağı, kaçışlı e-posta şablonu.
- `GET /api/dealer/weekly-brief?cursor=&limit=` (liste, hafif alanlar) + `GET /api/dealer/weekly-brief/[weekStart]` (detay: metrikler, temalar, örnek alıntılar); 12 haftalık trend için tek sorguda `metrics` seçimi. Yanıt Redis'te `dealer:{id}:brief:{weekStart}` anahtarıyla haftalık (değişmez veri) önbelleklenebilir.
- `POST /api/dealer/weekly-brief/[weekStart]/actions` → ActionItem/ekip görevi oluşturma.
- Feature flag ve modül kaydı (`lib/module-controls.ts`, sidebar `moduleKey`), i18n anahtarları.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/innovation` → "Haftalık özet" kartı** (`app/dealer/innovation/page.tsx:46,74-87,164-230`; `app/api/dealer/innovation/weekly-brief/route.ts`): Aynı tabloyu farklı hafta anahtarı ve farklı algoritmayla okuyup yazıyor. Doğrudan çakışma ve Bulgu 1'in kaynağı. İnovasyon sayfasındaki kart kaldırılmalı veya birleşik sayfaya bağlantı veren küçük bir özet önizlemesine dönüştürülmeli; inovasyon API'si tek üretim servisine yönlendirilmeli.
- **`/dealer/operations-brief`** (`app/dealer/operations-brief/page.tsx`): Son 7 günün operasyon sayıları + günlük grafik. Haftalık rapordaki KPI şeridiyle büyük ölçüde örtüşüyor; "Operasyon Özeti (bugün/canlı)" ile "Haftalık Rapor (tamamlanmış hafta, arşiv)" olarak net ayrıştırılmalı ya da tek sayfada iki sekme olmalı.
- **`/dealer/ai-insights`** haftalık/aylık rapor modu (`app/dealer/ai-insights/ai-insights-client.tsx:292-339,487-505`): İsteğe bağlı AI haftalık raporu üretiyor; bu sayfanın "AI özeti" ile kavramsal olarak aynı. Haftalık rapor tek kaynak olmalı, ai-insights haftalık modu buraya derin bağlantı vermeli.
- **Bayi gösterge paneli "weekly-comparison" widget'ı** (`app/dealer/dealer-dashboard-client.tsx:190,263-280`): Haftalık karşılaştırma zaten burada; panel widget'ı birleşik haftalık rapora "Raporun tamamı" bağlantısı vermeli.
- **`/api/customer/innovation/radar`** (`route.ts:89-94`): `DealerWeeklyBrief.topThemes`'i müşteri tarafında kullanıyor; tema şeması değişirse bu tüketici de güncellenmeli (kırılma riski).

**Öneri:** `/dealer/weekly-brief` rotası korunup "Haftalık Rapor" olarak yeniden inşa edilsin; inovasyon kartı ve ai-insights haftalık modu buraya katılsın; operations-brief "canlı/bugün" odağında kalsın. Karar: **birleştir**.

---

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışıldı; çağıran/çağrılan taraflar baştan okundu (kod değiştirilmedi, DB'ye dokunulmadı).

### 1. Elle üretilen inovasyon özeti, haftalık cron bildirim ve e-postasını sessizce engelliyor — **DOĞRULANDI**

- Anahtar uyuşmazlığı kesin: `app/api/dealer/innovation/weekly-brief/route.ts:63-79` `utcMondayWeekStart()` (içinde bulunulan haftanın Pazartesi 00:00 UTC'si, `lib/innovation-week.ts:2-9`) ile `upsert` yapıyor. Cron `lib/weekly-digest-core.ts:171-172` `startOfWeekUTC(now) - 7 gün` kullanıyor; `startOfWeekUTC` (`lib/timezone.ts:24-30`) aynı Pazartesi-UTC hesabı → iki anahtar aynı uzayda, W haftasının anahtarı birebir çakışıyor.
- Cron gerçekten bağlı: `lib/inngest/functions.ts:154-162` (`0 8 * * 1`, Pazartesi 08:00 UTC) → `app/api/internal/inngest/weekly-digest/route.ts:16` → `runWeeklyDigestForAllDealers`.
- Tetikleyici kullanıcıya açık: `/dealer/innovation` sidebar'da (`components/dashboard/sidebar.tsx:242`), "Özeti yeniden üret" butonu (`app/dealer/innovation/page.tsx:213`, `refreshBrief` :74-87), özellik bayrağı varsayılan açık (`lib/innovation-config.ts:63`).
- Yeniden üretim: Bayi W haftasının herhangi bir gününde "Özeti yeniden üret"e basar → `(dealerId, W)` satırı oluşur. W+1 Pazartesi 08:00 UTC'de cron `lastWeekStart = W` için `createMany({skipDuplicates})` çağırır → `count = 0` (`weekly-digest-core.ts:124-135`) → `update` + `return 'skipped'` (:136-143). `notification.create` (:146) ve `sendTransactionalEmail` (:158) hiç çalışmaz; üretilen AI özeti de atılır. Bayi o hafta için ne uygulama içi bildirim ne e-posta alır; hata/log da yok (sayım yalnızca `sent` artmıyor).
- Ek doğrulanan yan etkiler: (a) cron `update` dalı inovasyon içeriğini playbook metniyle ezer, yani yenilediği özet sessizce değişir; (b) W+1 içinde yenilenen satır `/dealer/weekly-brief`'te henüz bitmemiş haftanın kartı olarak "Haftalık otomatik AI özeti" etiketiyle görünür; (c) `lib/innovation-weekly-brief.ts:29-44` `deletedAt` filtresi uygulamıyor (cron tarafı `weekly-digest-core.ts:29` uyguluyor) ve kayan 7 gün (`since = now - 7g`, yerel saat `setDate`) kullanıyor — aynı tabloda iki farklı semantik. Admin demo uçları (`app/api/admin/innovation/demo-package/route.ts:71`, `demo-scenario/route.ts:85`) da aynı tabloya `upsert` yapıyor; aynı engelleme orada da oluşabilir (anahtar hesabı bu incelemede satır satır doğrulanmadı).
- Not: Kritik bir güvenlik açığı değil; ürün/iletişim kaybı. Önem "yüksek" makul, çünkü yeniden üretim tek tıklık ve yaygın bir bayi davranışı.

### 2. API hataları sayfada boş durum olarak maskeleniyor — **DOĞRULANDI**

- `app/dealer/weekly-brief/page.tsx:22-25`: `r.ok` kontrolü yok; `.then(r => r.json())` → `Array.isArray(d.briefs) ? d.briefs : []`.
- Sunucu tüm hata yollarında JSON döner: 401/403 `requireAuth` (`lib/api-auth.ts:52-77`, token-replay için 403 JSON), Admin `dealerId` yoksa 400 (`app/api/dealer/weekly-brief/route.ts:26-28`), DB bağlantı hatasında 503 `{ error, code: 'SERVICE_UNAVAILABLE', retryable: true }` (`lib/api-http.ts:18-28`, route.ts:43-44), diğerlerinde 500 JSON (route.ts:45-46). JSON parse başarılı olduğu için `.catch` tetiklenmez, toast çıkmaz.
- Yeniden üretim: Neon geçici olarak ulaşılamazken (P1001) bayi sayfayı açar → 503 JSON → `setBriefs([])` → "Henüz haftalık özet yok. İlk özet ... Pazartesi sabahı otomatik oluşturulur." mesajı. 12 haftalık geçmişi olan bayi verisinin silindiğini düşünür; `retryable: true` ve `Retry-After: 8` bilgisi yok sayılır, yeniden dene düğmesi yok.
- Not: Veri bozulması yok; etki yanıltıcı UX. Önem "yüksek" yerine "orta" daha doğru, ancak bulgu gerçek.

### 3. Panelde "AI özeti" olarak sunulan içerik sabit playbook metni; AI özeti ve metrikler saklanmıyor — **DOĞRULANDI**

- AI özeti üretiliyor (`lib/weekly-digest-core.ts:106-117`) ama yalnız bildirim (:150) ve e-postada (:161-162) kullanılıyor; tabloya yazılan tek metin `${playbook.title}: ${playbook.dealerActions[0]}` (:123-131). Şema da özet/metrik alanı içermiyor (`prisma/schema.prisma:2717-2729`: yalnız `topThemes`, `recommendedAction`).
- `matchPlaybook` 3 sabit sonuçtan birini döner (:58-70); dolayısıyla cron kaynaklı her kart şu 3 cümleden biridir: "Düşük NPS + churn sinyali: 24 saat içinde...", "İlk 7 gün drop-off: İlk tüketime özel...", "Sessiz memnunlar (yüksek tüketim, düşük ses): QR sonrası tek soruluk anket..." (`lib/growth-playbooks.ts:24-58`). Sayfa bunu "Haftalık otomatik AI özeti" (`page.tsx:58`) ve hero'da "Her hafta otomatik üretilen AI özeti" (`page.tsx:33`) olarak sunuyor.
- Yanlış teşhis somut: varsayılan dal (:69) tüketim verisine hiç bakmıyor (`computeWeekStats` consumption sorgulamıyor, :31-37). Yeniden üretim: geçen hafta 20, bu hafta 25 geri bildirim alan, churn riski olmayan bir bayi "Sessiz memnunlar (... düşük ses)" etiketiyle "tek soruluk anket açın" önerisi görür — yani yüksek geri bildirim hacmine "sesi düşük" teşhisi konur.
- Kısmi düzeltme: inovasyon yolundan gelen satırlar (Bulgu 1) farklı, yine şablon tabanlı (AI olmayan) metinler içerir (`lib/innovation-weekly-brief.ts:80-90`); "her zaman 3 cümle" ifadesi cron satırları için tam doğru, tüm satırlar için değil. Sonuç değişmiyor: panelde hiçbir AI çıktısı yok, etiket yanıltıcı.
- Not: Güvenlik açığı değil; ürün doğruluğu/güven sorunu.
