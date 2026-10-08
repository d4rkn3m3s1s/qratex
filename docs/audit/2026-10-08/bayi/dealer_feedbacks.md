# /dealer/feedbacks

**Amaç:** İşletmenin iki kaynaktan gelen müşteri sesini tek ekranda toplamak: QR geri bildirimleri (`Feedback`) ve kart/tüketim yorumları (`ConsumptionReview`). Ekranda listeleme, puan filtresi, "manuel inceleme" filtresi, arama, yanıt yazma (AI önerili), telafi teklifi gönderme ve CSV/PDF dışa aktarma bulunuyor. Panelin ana "gelen kutusu" bu sayfa: sidebar rozeti, global arama, sabah brifingi, copilot, churn-risk, ROI ve next-best-action buraya yönlendiriyor.

**Genel puan:** 4 / 10

**Karar:** yeniden tasarla. `/dealer/reviews` bu sayfaya birleştirilmeli (ayrıntı en sonda). Yanıt ve telafi akışlarının iskeleti sağlam: sahiplik kontrolü, bildirim, e-posta ve onay kuyruğu var. Sorun, sayfanın bir "gelen kutusu" olarak doğru veri göstermemesi. Mevcut durumda:
- Üstteki KPI'lar yanlış hesaplanıyor.
- Puan filtresi QR sekmesinde hiç çalışmıyor.
- Tüketim yorumları 50 kayıtta kesiliyor.
- Arama yalnız ekrandaki sayfada yapılıyor.
- Yanıt penceresi, yanıtlanan yorumu göstermiyor.

Sayfanın kullandığı API'de ayrıca **platform genelinde veri sızıntısı** var (STAFF rolü), telafi akışında da **onay kuyruğunu atlatan** bir hata var.

> Kapsam: `app/dealer/feedbacks/page.tsx` (1000 satır), `app/dealer/feedbacks/layout.tsx`, `app/dealer/layout.tsx`, `proxy.ts`, `app/api/feedbacks/route.ts` (GET), `app/api/dealer/reviews/route.ts`, `app/api/dealer/feedbacks/[id]/{reply,remedy,viewed}/route.ts`, `app/api/dealer/consumption-reviews/[id]/remedy/route.ts`, `app/api/dealer/feedbacks/search/route.ts`, `app/api/dealer/notification-badges/route.ts`, `lib/api-auth.ts`, `lib/idempotency.ts`, `lib/export-utils.ts`, `lib/groq.ts#suggestResponseWithGroq`, `lib/app-locale.tsx`, `i18n/request.ts#t`, `lib/utils.ts#formatRelativeTime`, `lib/validations.ts`, `lib/next-best-action.ts`, `components/dashboard/{sidebar,header}.tsx`, `components/providers.tsx`, `prisma/schema.prisma` (Feedback, ConsumptionReview, Role), `messages/{tr,en}.json`, `app/dealer/reviews/page.tsx`. Kod çalıştırılmadı, DB'ye dokunulmadı. Bütün bulgular kod okunarak doğrulandı; doğrulanamayanlar ayrıca belirtildi.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Yanıt, AI önerisi ve telafi uçtan uca bağlı. Ama QR puan filtresi API'de yok sayılıyor, tüketim yorumları 50'de kesiliyor, arama sayfa-içi kalıyor ve KPI'lar yanlış. |
| UX | 4/10 | Yanıt penceresi yorumu göstermediği için bayi yanıtı körlemesine yazıyor. "Yanıtlanmamış" görünümü yok, sıralama yok. Telafi butonu 5 yıldızlı yorumlarda da duruyor. Anonim yoruma "telafi tetiklendi" deniyor. |
| Görsel | 6/10 | `DashboardPageHero`, kartlar ve iskelet panelle tutarlı. Ancak her kartta 4–6 rozet ve buton eşit ağırlıkta; olumsuz ve acil olan görsel olarak öne çıkmıyor. |
| Mimari | 3/10 | 1000 satırlık tek client bileşen; ham `fetch` + `useEffect` kullanılıyor, yarış koruması ve `res.ok` kontrolü yok. İki kaynak iki farklı sözleşmeyle çekiliyor (`page/pageSize` vs `limit`). Ölü state ve importlar var. Kullanılan API'de rol kapsamı açığı var. |
| Performans | 5/10 | Sorgular indeksli ve paralel. Ama her QR sayfa değişiminde 50 tüketim yorumu ve 3 istatistik sorgusu boşuna yeniden çekiliyor. Liste sanallaştırılmamış. Her stat kartı ayrı bir `setInterval` sayacı çalıştırıyor. |
| Erişilebilirlik + Mobil | 4/10 | Yıldızların, duygu ikonlarının ve AI butonunun erişilebilir adı yok. "Kopyala" ipucu yalnız hover'da görünüyor. Sayaç animasyonu azaltılmış hareketi dikkate almıyor. Mobilde yanıt penceresinin AI paneli "Gönder"in altına düşüyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Segment meta başlığı/açıklaması | ÇALIŞIYOR | `app/dealer/feedbacks/layout.tsx:4-6`, `messages/tr.json:33-34` | "İnceleme, filtreleme ve yanıtlama" vaadi var; filtreleme kısmen karşılanıyor. |
| 2 | Rol koruması (yalnız DEALER) | ÇALIŞIYOR | `proxy.ts:50-71` | STAFF (personel) bu sayfaya giremiyor. Panel tanımı "sahibi ve personeli" dese de personel için bir gelen kutusu yok. |
| 3 | `Suspense` sarmalayıcı + yükleme metni | KISMİ | `page.tsx:994-999` | Fallback metni sabit kodlu İngilizce "Loading..."; TR kullanıcıya İngilizce görünüyor. |
| 4 | Hero (eyebrow/başlık/açıklama/ikon) | ÇALIŞIYOR | `page.tsx:406-411` | |
| 5 | Hero "toplam" sayacı | BOZUK | `page.tsx:363`, `page.tsx:415` | `qrFeedbacks.length + consumptionReviews.length` en fazla 20+50. Gerçek toplam değil, ekrandaki sayfanın uzunluğu. |
| 6 | CSV dışa aktarma | KISMİ | `page.tsx:419-445`, `lib/export-utils.ts:42-84` | Yalnız yüklü sayfayı aktarıyor ve aramayı yok sayıyor. Liste boşsa dosya inmiyor ama "CSV indirildi" toast'ı çıkıyor. Formül enjeksiyonu koruması yok (Bulgu 9). "Excel (CSV)" etiketi sabit kodlu. |
| 7 | PDF dışa aktarma (yazdır penceresi) | KISMİ | `page.tsx:446-478`, `lib/export-utils.ts:98-146` | Pop-up engellenirse sessizce `return` ediyor ama "PDF indirildi" toast'ı yine çıkıyor. Başlık, "PDF indir" etiketi ve şablon sabit TR. Yalnız ekrandaki sayfayı kapsıyor. |
| 8 | Stat kartı: Toplam | BOZUK | `page.tsx:487` | Değeri yanlış (5. satır). Etiket `'Toplam'` sabit kodlu; `t('dealerFeedbacks.total')` anahtarı var ama kullanılmıyor, EN kullanıcı da "Toplam" görüyor. |
| 9 | Stat kartı: Ortalama puan | BOZUK | `page.tsx:364-370`, `page.tsx:488` | 20 QR + 50 yorumluk örneklemin ortalaması. API'nin döndürdüğü gerçek `stats.avgRating` (`app/api/dealer/reviews/route.ts:91-95,129`) state'e yazılıp hiç okunmuyor (`page.tsx:169,336`). |
| 10 | Stat kartı: Olumlu | KISMİ | `page.tsx:372-373` | QR için AI `sentiment`, yorum için `rating>=4` kullanılıyor: iki farklı tanım tek sayıda toplanıyor. Ayrıca yalnız sayfa örneklemini sayıyor. |
| 11 | Stat kartı: Olumsuz | KISMİ | `page.tsx:374-375` | Aynı sorun. `ConsumptionReview.sentiment` alanı şemada var (`prisma/schema.prisma` ConsumptionReview) ama kullanılmıyor. |
| 12 | Animasyonlu sayaç (`AnimatedNumber`) | KISMİ | `page.tsx:128-151` | `setInterval` tabanlı; global `MotionConfig reducedMotion="user"` (`components/providers.tsx:232`) bunu kapsamıyor. Her filtre değişiminde 0'dan değil önceki değerden atlıyor. |
| 13 | Stat kartı giriş animasyonu | ÇALIŞIYOR | `page.tsx:492-497` | framer, global reduced-motion'a uyuyor. |
| 14 | Arama kutusu | KISMİ | `page.tsx:345-361`, `page.tsx:522-529` | Yalnız istemcide, yüklü sayfa üzerinde arıyor. Placeholder anahtarı iki dilde de yok, ekranda ham `dealerFeedbacks.searchPlaceholder` yazıyor (`i18n/request.ts:36`). |
| 15 | `?search=` URL parametresi (global aramadan iniş) | KISMİ | `page.tsx:306-309`, `components/dashboard/header.tsx:265-270`, `app/api/search/route.ts:96` | Global arama buraya yönlendiriyor. Ancak arama yalnız 1. sayfada yapıldığı için eski kayıtlar "bulunamadı" gibi görünüyor. Yazınca URL güncellenmiyor (tek yönlü). |
| 16 | Puan filtresi: tüketim yorumları | ÇALIŞIYOR | `page.tsx:319`, `app/api/dealer/reviews/route.ts:34-39` | |
| 17 | Puan filtresi: QR geri bildirimleri | BOZUK | `page.tsx:319,324`, `app/api/feedbacks/route.ts:32-60` | GET `rating` parametresini hiç okumuyor; liste filtrelenmiyor. |
| 18 | "Manuel inceleme" (intentScore<0.7) filtresi | KISMİ | `page.tsx:546-554`, `app/api/feedbacks/route.ts:40,44` | Yalnız QR'ı etkiliyor, tüketim sekmesi değişmiyor ve bu belirtilmiyor. AI'ın işlemediği kayıtlar (`intentScore=null`) dışarıda kalıyor. "Niyet güveni düşük" ile "insan incelemeli" aynı şey değil. |
| 19 | Sekmeler (Tüketim / QR) | ÇALIŞIYOR | `page.tsx:561-571` | |
| 20 | Sekme sayaçları | KISMİ | `page.tsx:565,569` | Toplamı değil sayfa uzunluğunu gösteriyor. |
| 21 | `?tab=qr` derin bağlantısı | BOZUK | `lib/next-best-action.ts:35,42`, `page.tsx:168` | "Negatif geri bildirimlere telafi gönder" aksiyonu `?tab=qr`'a gidiyor ama sayfa `tab`'ı okumuyor; her zaman tüketim sekmesi açılıyor. |
| 22 | Yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:575-588`, `716-729` | |
| 23 | Hata durumu | EKSİK | `page.tsx:323-342` | `res.ok` kontrol edilmiyor. Hata hâlinde liste boş kalıyor ve "henüz yorum yok" boş durumu çıkıyor; yeniden dene butonu yok. |
| 24 | Boş durum: tüketim + "Kart tara" CTA | ÇALIŞIYOR | `page.tsx:589-602` | Arama sonucu boşken de "henüz yorum yok" deniyor; "sonuç yok, filtreyi temizle" ayrımı yapılmıyor. |
| 25 | Boş durum: QR + "QR kodları" CTA | KISMİ | `page.tsx:730-743` | Aynı ayrım eksik. Manuel inceleme filtresi açıkken "henüz QR geri bildirimi yok" demesi yanıltıcı. |
| 26 | Tüketim kartı: avatar, ad, ürün/kategori rozeti | ÇALIŞIYOR | `page.tsx:616-633` | `AvatarImage src=''` boş src veriyor. |
| 27 | Yıldız gösterimi | ÇALIŞIYOR | `page.tsx:377-390` | Erişilebilir ad yok (bkz. a11y). |
| 28 | Yorum metni | ÇALIŞIYOR | `page.tsx:639-641` | Uzun metinde kısaltma veya "devamı" yok. |
| 29 | Boyut puanları (lezzet/servis/ambiyans/fiyat) | KISMİ | `page.tsx:644-655`, `lib/validations.ts:287-295` | Şema `cleanliness` boyutunu da kabul ediyor ama sayfa çevirmiyor; ekranda ham İngilizce "cleanliness: 4/5" çıkıyor. |
| 30 | İşletme yanıtı kutusu | ÇALIŞIYOR | `page.tsx:658-665`, `785-792` | Yanıt tarihi (`dealerRepliedAt`) gösterilmiyor. |
| 31 | Kart son 4 hane rozeti | ÇALIŞIYOR | `page.tsx:669-672`, `app/api/dealer/reviews/route.ts:108-121` | Maskeleme sunucuda yapılıyor. |
| 32 | Tutar rozeti | KISMİ | `page.tsx:673-677` | `amount && …` deseni yüzünden tutar 0 olduğunda ekrana çıplak "0" basılıyor. |
| 33 | Göreli zaman | KISMİ | `page.tsx:682,811`, `lib/utils.ts:33-36` | `locale` geçirilmiyor; EN arayüzde de "3 gün önce" yazıyor. |
| 34 | "Yanıtlandı" rozeti / "Yanıtla" butonu | ÇALIŞIYOR | `page.tsx:684-692`, `813-821` | Yanıtı düzenleme/geri alma yok; API üzerine yazmaya izin veriyor ama UI sunmuyor. |
| 35 | Telafi butonu (tüketim) | KISMİ | `page.tsx:693-701` | Puan ve duygudan bağımsız her kartta duruyor. Daha önce teklif gönderilip gönderilmediği görünmüyor. Modül kapalıysa da görünüyor. |
| 36 | Tüketim yorumu sayfalama | EKSİK | `app/api/dealer/reviews/route.ts:8-9,23,49` | API `page` parametresini yok sayıyor ve `limit` varsayılanı 50. 51. ve sonraki yorumlara ulaşmanın yolu yok. |
| 37 | QR kartı: avatar, ad/anonim, QR adı | ÇALIŞIYOR | `page.tsx:757-773` | |
| 38 | Duygu ikonu | KISMİ | `page.tsx:392-401`, `776` | AI'ın işlemediği (`sentiment=null`) kayıt "nötr" yüzle gösteriliyor; "analiz bekliyor" ayrımı yok. CSV/PDF'te de "Nötr" yazılıyor (`page.tsx:426`). |
| 39 | Konu (topic) rozetleri, +N | ÇALIŞIYOR | `page.tsx:796-806` | Gizlenen konulara erişim yok. |
| 40 | QR yanıtla/yanıtlandı | ÇALIŞIYOR | `page.tsx:813-821` | |
| 41 | Telafi butonu (QR) | KISMİ | `page.tsx:822-830`, `app/api/dealer/feedbacks/[id]/remedy/route.ts:79-116,132-137` | Anonim geri bildirimde teklif oluşmuyor ama `success:true` dönüyor ve "Telafi tetiklendi" toast'ı çıkıyor (SAHTE başarı). |
| 42 | QR sayfalama | ÇALIŞIYOR | `page.tsx:841-865`, `app/api/feedbacks/route.ts:90-99,152` | Her sayfa değişiminde tüketim yorumları da boşuna yeniden çekiliyor (`page.tsx:311-313,323-326`). Sayfa URL'de tutulmuyor. |
| 43 | Yanıt penceresi | KISMİ | `page.tsx:869-946` | Yanıtlanan yorumun metni, puanı ve müşterisi gösterilmiyor; kodda itiraf da var (`page.tsx:886`). |
| 44 | Yanıt metin alanı + karakter sayacı | KISMİ | `page.tsx:889-895`, `app/api/dealer/feedbacks/[id]/reply/route.ts:29-32` | Sayaç "/2000" diyor ama `maxLength` yok; aşımı sunucu reddediyor. |
| 45 | Yanıt gönderme → kayıt + müşteri bildirimi + e-posta | ÇALIŞIYOR | `page.tsx:262-284`, `reply/route.ts:143-174,219-251` | Sahiplik `updateMany where dealerId` ile atomik; iyi. Başarıdan sonra tüm liste baştan çekiliyor ve iskelet yanıp sönüyor. |
| 46 | AI yanıt önerisi (3 ton) | KISMİ | `page.tsx:286-304`, `reply/route.ts:49-91`, `lib/groq.ts:187-227` | Metinsiz (yalnız puanlı) yorumda API 404 dönüyor ama istemci yalnız `data.success`'e baktığı için sessizce hiçbir şey olmuyor. Groq yoksa `[]` dönüyor, kullanıcıya açıklama yapılmıyor. Prompt her zaman Türkçe yanıt üretiyor (EN arayüzde de). İkon butonun `aria-label`'ı yok. |
| 47 | Öneriyi metin kutusuna aktarma | ÇALIŞIYOR | `page.tsx:931-939` | "Metin kutusuna kopyala" ipucu yalnız hover'da (`opacity-0 group-hover`); klavye ve dokunmatikte görünmüyor. |
| 48 | "Görüldü" işaretleme (dealerFirstViewedAt) | KISMİ | `page.tsx:196,257-259`, `viewed/route.ts` | Yalnız QR'da ve yalnız yanıt/telafi penceresi açılınca tetikleniyor; listede okumak sayılmıyor. Tüketim yorumunda hiç yok. Fire-and-forget; hata yutuluyor. |
| 49 | Telafi modalı: müşteriye mesaj | KISMİ | `page.tsx:960-969`, `remedy/route.ts:24-30,60-65` | `maxLength` yok. 500 karakter aşılınca zod başarısız oluyor ve sunucu varsayılan mesajla devam ediyor (Bulgu 2). |
| 50 | "Önce onay kuyruğuna al" | BOZUK (koşullu) | `page.tsx:970-979`, `remedy/route.ts:66-71`, `consumption-reviews/[id]/remedy/route.ts:70-75` | Mesaj 500 karakteri aşınca seçim yok sayılıyor ve teklif doğrudan müşteriye bildiriliyor. |
| 51 | Telafi gönderimi | KISMİ | `page.tsx:207-249` | `Idempotency-Key` gönderilmiyor; aynı yoruma sınırsız teklif atılabiliyor. Modül kapalıysa buton yine görünüyor. Route'larda try/catch yok; DB hatası "Bağlantı hatası" diye gösteriliyor. |
| 52 | Liste kartı giriş animasyonu (stagger) | ÇALIŞIYOR | `page.tsx:606-611`, `747-752` | `AnimatePresence` içinde `exit` tanımlı değil, yani işlevsiz sarmalayıcı. Sayfa içi `LazyMotion` global olanı tekrarlıyor. |
| 53 | Sayfalı API veri kapsamı (çok kiracılı izolasyon) | BOZUK | `app/api/feedbacks/route.ts:28-51` | STAFF rolü için `where` filtresi yok, platformun TÜM geri bildirimleri dönüyor (Bulgu 1). |
| 54 | Müşteri kişisel verisi en aza indirme | KISMİ | `app/api/feedbacks/route.ts:77-79`, `app/api/dealer/reviews/route.ts:51-58` | Sayfa e-posta göstermediği hâlde iki uç da müşteri e-postasını bayiye gönderiyor. |
| 55 | Medya (fotoğraf) gösterimi | EKSİK | `app/api/feedbacks/route.ts:68,125` | API `media` alanını döndürüyor, sayfa göstermiyor. |
| 56 | Güven/toksisite/aciliyet/churn sinyalleri | EKSİK | `prisma/schema.prisma` Feedback: `trustFlagged`, `isToxic`, `urgency`, `churnRisk`, `intent`, `npsScore`, `actionSuggestions` | Şema yorumu "bayi/admin görür" diyor ama `trustFlagged` bayi panelinin hiçbir yerinde görünmüyor (grep: `app/dealer` içinde yok). |
| 57 | "Yanıtlanmamış" görünümü / filtresi | EKSİK | `app/api/dealer/notification-badges/route.ts:17-23` | Sidebar rozeti yanıtlanmamış sayısını gösteriyor ama sayfada bu kayıtları süzecek bir filtre yok. |
| 58 | Sıralama (en yeni / en düşük puan / acil) | EKSİK | `app/api/feedbacks/route.ts:95` | Yalnız `createdAt desc`. |
| 59 | Tarih aralığı filtresi | EKSİK | — | |
| 60 | QR/şube filtresi | EKSİK | `app/api/feedbacks/route.ts:38,53-55` | API `qrCodeId` filtresini destekliyor, UI sunmuyor. |
| 61 | Semantik arama | EKSİK | `app/api/dealer/feedbacks/search/route.ts` | Embedding tabanlı arama ucu var ama hiçbir UI çağırmıyor. |
| 62 | Toplu işlem (çoklu seç → yanıtla/okundu/ata) | EKSİK | — | |
| 63 | Canlı güncelleme | EKSİK | `app/dealer/layout.tsx` (`RealtimeNotifications`) | Yeni yorum gelince liste kendini yenilemiyor. |
| 64 | Görev/olay oluşturma, ekibe atama | EKSİK | — | `/dealer/incidents` ve ekip modülü var ama karttan bağlantı yok. |

**Durum özeti (64 satır):** ÇALIŞIYOR 21 · KISMİ 24 · BOZUK 7 (biri koşullu) · SAHTE 0 (41. satırdaki sahte başarı toast'ı KISMİ içinde sayıldı) · EKSİK 12.

---

## Bulgular

### 1. [KRİTİK · Güvenlik] `GET /api/feedbacks` STAFF rolüne platformun tüm geri bildirimlerini döndürüyor
- **Kanıt:** `app/api/feedbacks/route.ts:28` `requireAuth()` rol listesi almadan çağrılıyor. `:43-51` aralığında yalnız `CUSTOMER` ve `DEALER` için `where` daraltılıyor; yorumda "ADMIN sees all" yazıyor ama STAFF da aynı dala düşüyor. STAFF hesaplarını bayiler kendisi açıyor (`app/api/dealer/staff/route.ts:101,126`). `/api/*` istekleri proxy'de rol denetiminden geçmiyor (`proxy.ts:118-131`).
- **Sorun:** Herhangi bir bayi bir personel hesabı açıp `GET /api/feedbacks?pageSize=100&page=N` ile tüm işletmelerin geri bildirimlerini sayfa sayfa indirebilir: metin, puan, müşteri adı, **müşteri e-postası**, QR adı ve rakip işletme adı. Bu çok kiracılı izolasyon ihlali ve KVKK kapsamında kişisel veri sızıntısı.
- **Öneri:** Rol kapsamını tek bir yardımcıda toplayın: `resolveFeedbackScope(session)`. ADMIN → `{}`, DEALER → `{ qrCode: { dealerId } }`, STAFF → `getStaffDealerId` ile `{ qrCode: { dealerId: staffDealer } }`, CUSTOMER → `{ userId }`. Tanımsız rol için **kapalı başarısızlık** (403) olmalı. `requireAuth(['ADMIN','DEALER','STAFF','CUSTOMER'])` açıkça yazılmalı. Bayinin listesi için ayrı bir `GET /api/dealer/feedbacks` ucu açıp sayfayı ona taşımak daha doğru; çok rollü genel uç, bu tür açıkların kaynağı. Her rol için bir yetki testi ekleyin (staff → başka bayinin kaydı = 0 sonuç).
- **Efor:** S

### 2. [YÜKSEK · Veri bütünlüğü] Telafi mesajı 500 karakteri aşınca "onay kuyruğu" atlanıyor ve teklif doğrudan müşteriye gidiyor
- **Kanıt:** `page.tsx:962-968`: Textarea'da `maxLength` yok. `app/api/dealer/feedbacks/[id]/remedy/route.ts:25,61-71`: `message.max(500)` başarısız olunca `parsed.success=false` oluyor. Bu durumda `queueForApproval=false` ve `sendNotification=true`'ya düşülüyor, mesaj da varsayılana dönüyor. Aynı desen `consumption-reviews/[id]/remedy/route.ts:65-75` içinde de var.
- **Sorun:** Bayi "önce onaya al" der ve uzun bir mesaj yazarsa, istediğinin tersi olur: müşteriye anında bildirim gider, üstelik bayinin yazdığı metin değil varsayılan metinle. Geçersiz girdi sessizce "en riskli" varsayılana dönüşüyor.
- **Öneri:** Doğrulama başarısız olursa 400 dönülmeli; sessiz varsayılan kullanılmamalı. İstemcide `maxLength={500}` ve canlı sayaç olmalı. Varsayılanlar güvenli yöne çevrilmeli: belirsizlikte kuyruğa al, bildirim gönderme. İki route'taki ortak gövde tek bir `createRemedyOffer()` servisine taşınmalı (şu an kopya kod).
- **Efor:** S

### 3. [YÜKSEK · Doğruluk] QR sekmesinde puan filtresi hiç çalışmıyor
- **Kanıt:** `page.tsx:319` `rating` parametresi gönderiliyor. `app/api/feedbacks/route.ts:32-60` bu parametreyi okumuyor; yalnız `page`, `pageSize`, `qrCodeId`, `sentiment` ve `needsReview` okunuyor.
- **Sorun:** Bayi "1 yıldız"ı seçtiğinde tüketim sekmesi süzülüyor, QR sekmesi değişmiyor. En önemli iş akışı olan "kötü yorumları bul" yarı yarıya bozuk ve kullanıcı bunu fark etmeyebilir.
- **Öneri:** API'ye `rating` (tekil ve aralık: `ratingMin/ratingMax`) eklenmeli; `@@index([rating])` zaten var. Filtre değişince `feedbackPage` 1'e sıfırlanmalı (şu an yalnız checkbox sıfırlıyor, `page.tsx:549` ve `:531`). Filtreler URL'ye yazılmalı ki derin bağlantı ve geri tuşu çalışsın.
- **Efor:** S

### 4. [YÜKSEK · Doğruluk] Üstteki KPI'lar (Toplam, Ortalama, Olumlu, Olumsuz) yanlış veri gösteriyor
- **Kanıt:** `page.tsx:363-375`: Bütün hesaplar yüklü dizilerin uzunluğuyla yapılıyor (QR ≤20, yorum ≤50). `feedbackTotal` (`:332`) ve `reviewStats` (`:169,336`) API'den geliyor ama KPI'da kullanılmıyor. `reviewStats` hiç okunmayan ölü state.
- **Sorun:** 2.000 geri bildirimi olan bir işletme "Toplam 70" görür. Ortalama puan, rastgele bir son-70 örneklemine göre çıkar ve sayfa değiştikçe oynar. Olumlu/olumsuz, iki farklı tanımın toplamı (AI duygusu + puan eşiği). Yöneticiler bu sayılarla karar verir; yanlış sayı göstermek, hiç göstermemekten daha kötü.
- **Öneri:** Sunucu tarafında birleşik bir özet ucu yazılmalı: `GET /api/dealer/feedback-inbox/summary?from&to&source`. Bu uç `groupBy`/`aggregate` ile şunları döndürmeli: gerçek toplam, ortalama, puan dağılımı, olumlu/olumsuz (tek tanım; tercihen AI `sentiment`, yoksa puan eşiği) ve yanıtlanmamış sayısı. Upstash ile 60 sn önbelleklenip yeni geri bildirimde etiketle bayatlatılmalı. KPI'lar seçili tarih aralığına bağlanmalı ve önceki döneme göre değişim (delta) göstermeli.
- **Efor:** M

### 5. [YÜKSEK · İşlevsellik] Tüketim yorumları 50'de kesiliyor; sayfalama yok
- **Kanıt:** `app/api/dealer/reviews/route.ts:8-9,23,49` `limit` 50 (en fazla 100); `page` parametresi okunmuyor. Sayfalama UI'ı yalnız QR sekmesinde var (`page.tsx:841`).
- **Sorun:** Varsayılan sekme tüketim yorumları (`page.tsx:168`) ve bu sekmede 51. ve sonraki yorumlara ulaşmanın yolu yok. Arama ve dışa aktarma da bu 50 kayıtla sınırlı.
- **Öneri:** `/api/dealer/reviews` için `page/pageSize` ya da tercihen imleç (`cursor=createdAt,id`) tabanlı sayfalama eklenmeli. Daha iyisi: iki kaynağı tek bir **birleşik gelen kutusu** ucunda (`GET /api/dealer/feedback-inbox`) `UNION` mantığıyla, ortak bir satır şemasıyla (`source: 'qr'|'consumption'`) ve tek imleçle döndürmek (bkz. vizyon).
- **Efor:** M

### 6. [YÜKSEK · UX] Yanıt penceresi yanıtlanan yorumu göstermiyor
- **Kanıt:** `page.tsx:886` (`// Get exact feedback info if needed, but for now we just show text area`). Pencerede yalnız başlık, metin alanı ve AI paneli var (`:869-946`).
- **Sorun:** Bayi yorumu okumak için pencereyi kapatıp listeye dönmek zorunda. Yorum ile yanıt yan yana olmadığından yanıt kalitesi düşüyor. Medallia/Yelp/GBP'de yanıt alanı her zaman orijinal yorumun hemen altında.
- **Öneri:** Pencere yerine sağdan açılan bir **detay paneli** (mobilde tam ekran sheet) kullanılmalı. Üstte yorum, puan, boyutlar, medya, AI sinyalleri (niyet, aciliyet, churn, güven bayrağı) ve müşterinin geçmişi (ziyaret sayısı, önceki yorumlar); altta yanıt editörü ve AI tonları; yan sekmede telafi ve görev oluşturma. Paneli açmak `viewed` işaretini tetiklemeli.
- **Efor:** M

### 7. [ORTA · İşlevsellik/Veri bütünlüğü] Telafi: anonim kayda sahte başarı, sınırsız tekrar, modül kapısı UI'a yansımıyor
- **Kanıt:** `remedy/route.ts:79` `feedback.userId` yoksa teklif oluşmuyor; ama `:118-137` analitik olayı yine yazılıyor ve `success:true` dönüyor. İstemci bu durumda "Telafi tetiklendi" diyor (`page.tsx:230-233`). `Idempotency-Key` başlığı gönderilmiyor (`page.tsx:216-224`, `lib/idempotency.ts:12-17,33`). Mevcut teklif kontrolü yok. Buton modül durumundan bağımsız gösteriliyor (`page.tsx:693,822`); sidebar ise `moduleKey: 'remedy_offers'` ile gizleniyor (`components/dashboard/sidebar.tsx:256`). Route'larda try/catch yok.
- **Sorun:** Bayi anonim bir yoruma "telafi gönderdim" sanıyor ama müşteriye hiçbir şey gitmiyor; `remedy_campaign_triggered` metriği de şişiyor. Aynı müşteriye arka arkaya birden fazla teklif gidebiliyor (puan/indirim ekonomisi açısından risk). Modül kapalıyken buton 403 hatası üretiyor.
- **Öneri:** Telafi butonu yalnız "telafi edilebilir" kayıtlarda gösterilmeli: tanımlı müşteri, puan ≤3 veya olumsuz duygu, açık teklif yok. Liste satırına `remedyStatus` (yok/kuyrukta/gönderildi/kabul edildi) eklenip rozet olarak gösterilmeli. Sunucuda aynı kaynak için açık (`pending`/`awaiting_dealer_approval`) teklif varsa 409 dönülmeli. İstemci her gönderimde `crypto.randomUUID()` ile idempotency anahtarı yollamalı. Anonim kayıtta 422 + açıklayıcı mesaj dönülmeli ve analitik olayı yazılmamalı. Modül görünürlüğü sayfaya `useModuleVisibility('remedy_offers')` ile taşınmalı.
- **Efor:** M

### 8. [ORTA · Gizlilik] Liste uçları, kullanılmayan müşteri e-postasını bayiye gönderiyor
- **Kanıt:** `app/api/feedbacks/route.ts:77-79` (`user.email`), `app/api/dealer/reviews/route.ts:51-58` (`customer.email`; yorum "Ham müşteri ID'si bayiye sızdırılmaz (gizlilik)" diyor ama e-posta gidiyor). Sayfa e-postayı hiçbir yerde göstermiyor.
- **Sorun:** Veri minimizasyonu ilkesi (KVKK m.4) ihlal ediliyor. Müşteri e-postası tarayıcı ağ sekmesinden toplanabiliyor; bu, Bulgu 1'in etkisini de büyütüyor.
- **Öneri:** Bayi liste şemasından `email` çıkarılmalı. İletişim gerekiyorsa platform içi yanıt/bildirim yolu kullanılmalı (zaten var). Admin ve bayi için ayrı `select` tanımları yazılmalı.
- **Efor:** S

### 9. [ORTA · Güvenlik] CSV dışa aktarmada formül enjeksiyonu
- **Kanıt:** `lib/export-utils.ts:56-64`: Değerler yalnız tırnaklanıyor; `=`, `+`, `-`, `@`, `\t`, `\r` ile başlayan hücreler etkisizleştirilmiyor. Müşteri metni (`text`) ve ad bayinin CSV'sine olduğu gibi giriyor (`page.tsx:425`).
- **Sorun:** Kötü niyetli bir müşteri `=HYPERLINK(...)` veya DDE yükü içeren bir yorum bırakırsa, bayi CSV'yi Excel'de açtığında formül çalışabilir.
- **Öneri:** Bu tür hücrelerin başına `'` eklenmeli (OWASP CSV Injection önerisi). Düzeltme ortak yardımcıda yapılmalı; aynı yardımcıyı kullanan bütün dışa aktarmalar korunmuş olur.
- **Efor:** S

### 10. [ORTA · Mimari] Veri çekme katmanı: yarış koşulu, `res.ok` yok, gereksiz yeniden çekim
- **Kanıt:** `page.tsx:311-343`: `AbortController` yok; hızlı filtre/sayfa değişiminde geç gelen yanıt yeni sonucun üstüne yazabiliyor. `res.ok` kontrol edilmiyor; 500'de liste boş kalıyor ve "henüz yorum yok" görünüyor. QR sayfası değişince tüketim yorumları ve 3 istatistik sorgusu da tekrar çalışıyor. Yanıt veya telafiden sonra tam liste yeniden çekiliyor ve iskelet yanıp sönüyor.
- **Öneri:** Projede zaten kurulu olan `@tanstack/react-query` kullanılmalı (`package.json:57`). Her kaynak için ayrı `useQuery`; `queryKey`'de filtre, sayfa ve imleç; `placeholderData: keepPreviousData`. Yanıt gönderimi `useMutation` + iyimser güncelleme (`setQueryData` ile karta `dealerReply` yazmak) ile yapılmalı. Hata durumu için "tekrar dene" kartı eklenmeli.
- **Efor:** M

### 11. [ORTA · UX] Arama yalnız ekrandaki sayfada çalışıyor; semantik arama ucu kullanılmıyor
- **Kanıt:** `page.tsx:345-361` istemci tarafında filtreliyor. Global arama `?search=` ile buraya yönlendiriyor (`components/dashboard/header.tsx:265-270`). `POST /api/dealer/feedbacks/search` (embedding tabanlı, rate-limit'li) var ama hiçbir UI çağırmıyor.
- **Sorun:** Global aramadan gelen kullanıcı eski bir kaydı "bulunamadı" olarak görüyor. Ayrıca "soğuk yemek" gibi tema araması yapan güçlü bir altyapı atıl duruyor.
- **Öneri:** Önce sunucu tarafı anahtar kelime araması yapılmalı (Postgres `ILIKE` ya da `pg_trgm`/`tsvector` + GIN indeksi; metin, müşteri adı, QR/ürün adı). Arama kutusunda "Anlamca ara (AI)" anahtarı semantik ucu çağırmalı ve sonuçlar benzerlik skoruyla gösterilmeli. Arama 300 ms debounce ile URL'ye yazılmalı.
- **Efor:** M

### 12. [ORTA · UX/Bilgi mimarisi] "Yanıtlanmamış" görünümü, sıralama ve öncelik sinyali yok
- **Kanıt:** Sidebar rozeti yanıtlanmamış QR sayısını gösteriyor (`app/api/dealer/notification-badges/route.ts:17-23,37`) ama sayfada buna karşılık gelen bir filtre yok. Sıralama sabit `createdAt desc` (`app/api/feedbacks/route.ts:95`). `urgency`, `churnRisk`, `trustFlagged`, `isToxic` ve `intent` alanları şemada var ama listeye gelmiyor (`:62-88`).
- **Sorun:** Bir gelen kutusunun temel işi "şu an neye bakmalıyım?" sorusunu yanıtlamak. Rozetteki "12"yi gören bayi o 12 kaydı bulamıyor. Acil bir şikâyet, 5 yıldızlı bir övgüyle aynı görsel ağırlıkta duruyor. Şema yorumu "bayi/admin görür" dese de güven bayrağı hiçbir yerde görünmüyor.
- **Öneri:** Varsayılan görünüm olarak **"Bekleyenler"** sunulmalı: yanıtlanmamış, puan ≤3 veya olumsuz, aciliyete göre sıralı. Durum sekmeleri: Bekleyen / Yanıtlandı / Tümü. Sıralama: en yeni, en düşük puan, en acil. Kart sol kenarında önem şeridi (kırmızı/amber/nötr), "Acil", "Churn riski yüksek", "Güven: şüpheli" ve "Toksik" rozetleri. SLA sayacı da eklenmeli ("4 saattir bekliyor"); `dealerFirstViewedAt` ve `createdAt` ile hesaplanabilir.
- **Efor:** M

### 13. [ORTA · i18n] Ham anahtar ve sabit kodlu metinler
- **Kanıt:** `dealerFeedbacks.searchPlaceholder` anahtarı `messages/tr.json` ve `en.json` içinde yok; `t` anahtarın kendisini döndürüyor (`i18n/request.ts:36`), yani placeholder'da ham anahtar görünüyor. Sabit kodlu metinler: `'Toplam'` (`page.tsx:487`), `Excel (CSV)` (`:444`), `PDF indir` (`:477`), `'Geri Bildirimler Raporu'` ve dosya adları (`:440,473`), `Loading...` (`:996`), `formatRelativeTime` locale'siz çağrılıyor (`:682,811`), `cleanliness` boyutu çevrilmiyor (`:648-651`), AI önerileri her zaman Türkçe (`lib/groq.ts:211`). Ayrıca `dealerFeedbacks.total` anahtarı var ama kullanılmıyor.
- **Öneri:** Eksik anahtar eklenmeli ve sabit metinler `t()`'ye taşınmalı. `formatRelativeTime(date, locale)` çağrılmalı. Boyut etiketleri bir sözlük nesnesinden (`DIMENSION_LABEL_KEYS`) okunmalı; bilinmeyen anahtar gizlenmeli. Groq prompt'una `locale` parametresi geçirilmeli. CI'da "kullanılan anahtar ↔ sözlük" eşleşme testi kurulmalı.
- **Efor:** S

### 14. [DÜŞÜK · Doğruluk] Küçük render hataları
- **Kanıt:** `page.tsx:673` `review.consumption.amount && …`: tutar 0 olunca "0" basıyor. `:617,758` `AvatarImage src=''`. `:392-401` `sentiment=null` iken nötr yüz gösteriliyor ("analiz bekliyor" ile "nötr" karışıyor). `:604,745` `AnimatePresence`'ta `exit` yok.
- **Öneri:** `amount != null && amount > 0` kullanılmalı. Avatar src `undefined` olmalı. Duygu için üç değil dört durum olmalı: `pending` (saat ikonu, "AI analiz ediyor") eklenmeli. `AnimatePresence` ya kaldırılmalı ya da `exit`/`layout` eklenmeli.
- **Efor:** S

### 15. [DÜŞÜK · Mimari] Ölü kod ve `any`
- **Kanıt:** Kullanılmayan importlar: `Calendar`, `X`, `User`, `Image`, `CardHeader`, `CardTitle` (her biri dosyada yalnız import satırında geçiyor). Okunmayan state: `reviewStats` (`page.tsx:169`). `dimensions: any` (`:98`). `as any` (`app/api/feedbacks/route.ts:44`). CSV ve PDF dışa aktarma için iki kez kopyalanmış satır eşleme bloğu var (`page.tsx:420-439` ≈ `:447-466`). Global LazyMotion varken sayfada ikinci bir `LazyMotion strict` (`:404`).
- **Öneri:** Satır eşleme `toExportRows()` fonksiyonuna çıkarılmalı. `dimensions` için `Record<DimensionKey, number>` tipi ve normalize fonksiyonu yazılmalı. Bileşen bölünmeli: `FeedbackInboxToolbar`, `FeedbackKpiStrip`, `FeedbackCard`, `ReplyPanel`, `RemedyDialog`, `useFeedbackInbox()`.
- **Efor:** S

### 16. [DÜŞÜK · Erişilebilirlik] Ekran okuyucu ve klavye eksikleri
- **Kanıt:** Yıldızlar (`page.tsx:380-388`) ve duygu ikonları (`:392-401`) için `aria-label`/`role="img"` yok. AI ikon butonunun (`:914`) erişilebilir adı yok. "Kopyala" ipucu yalnız `group-hover` (`:936`). `AnimatedNumber` her karede değeri değiştiriyor ama `aria-live` yok, ayrıca `prefers-reduced-motion`'ı dikkate almıyor (`:128-151`). Mobilde yanıt penceresinde AI paneli "Gönder" butonunun altına düşüyor (`:871-905`). Sekme etiketleri dar ekranda taşabilir (doğrulanmadı).
- **Öneri:** Yıldız grubu `role="img" aria-label="5 üzerinden 4"` almalı. İkon butonlarına `aria-label` eklenmeli. İpucu `group-focus-visible:opacity-100` ile klavyede de görünmeli. Sayaç `useReducedMotion()` true ise doğrudan değeri göstermeli. Mobilde AI önerileri metin alanının üstünde yatay kaydırmalı "ton çipleri" olarak sunulmalı.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Birleşik, durum tabanlı gelen kutusu** (Medallia "Case Management", Yelp for Business "Needs reply"): Bekleyen/Yanıtlandı/Kapandı durumları, kişiye atama, SLA zamanlayıcısı, kapanış nedeni. Şu an "yanıtlandı" dışında bir durum kavramı yok.
2. **Yanıt şablonları + marka sesi**: Google Business Profile ve Birdeye'daki gibi kayıtlı şablonlar, değişkenler (`{{müşteri_adı}}`, `{{ürün}}`), AI'ın işletmenin ses profiline göre yazması. Projede `AISettings.customPrompt` ve adaptive profile zaten var; yanıt önerisine bağlanmalı.
3. **Gelişmiş filtre ve kayıtlı görünümler** (Qualtrics, Medallia): tarih aralığı, şube/QR, ürün/kategori, konu/tema, duygu, niyet, aciliyet, güven bayrağı, medyalı yorumlar; filtre kombinasyonunu "görünüm" olarak kaydetme.
4. **Toplu işlemler**: çoklu seç → okundu işaretle, AI ile toplu taslak üret (onaylı gönderim), etiketle, ekibe ata, dışa aktar.
5. **Müşteri bağlamı** (Toast/Square Customer Directory): yorumun yanında müşterinin ziyaret sayısı, harcama, önceki yorumları, açık telafi teklifleri ve CLV/churn skoru.
6. **Sunucu tarafı tam dışa aktarma ve zamanlanmış rapor**: filtrelenmiş tüm veri seti, gerçek PDF (sunucuda), e-postayla haftalık rapor. Şu an yalnız ekrandaki sayfa yazdırılıyor.

Ayrıca: medya önizleme ve lightbox, yorumdan görev/olay oluşturma, canlı akış (yeni yorum geldiğinde "3 yeni yorum, göster" çubuğu), yanıtı düzenleme ve geçmişi.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi sayfayı açtığında ilk 5 saniyede şunu görmeli: *"Bugün 4 yorum yanıt bekliyor, 1'i acil; ortalama puanın bu hafta 4,3 → 4,1'e düştü, en çok 'bekleme süresi' konuşuluyor."* Tek tıkla en acil yoruma gidip yorumu, müşteri geçmişini ve AI tonlarını aynı panelde görmeli; yanıt, telafi ve görev oluşturmayı panelden çıkmadan bitirebilmeli.

**Yerleşim (masaüstü, üç bölge):**
1. **Üst şerit (KPI):** Bekleyen (SLA aşanlar kırmızı), Ortalama puan + delta, Yanıt oranı, Medyan yanıt süresi, Olumsuz oranı. Bu kartlar tıklanabilir filtre gibi davranmalı: "Bekleyen"e tıklamak listeyi süzer. Veri sunucudaki birleşik özet ucundan gelmeli.
2. **Sol: liste.** Yapışkan araç çubuğunda arama (anahtar kelime + "AI ile anlamca ara" anahtarı), durum sekmeleri (Bekleyen / Yanıtlandı / Tümü), kaynak çipleri (QR · Tüketim), puan, tarih, şube, konu ve sıralama. Kartlar kompakt olmalı: sol kenarda önem şeridi, puan, iki satırlık metin, en fazla iki sinyal rozeti, kaynak ikonu, zaman. Uzun listeler için `@tanstack/react-virtual` ve imleçli sonsuz kaydırma.
3. **Sağ: detay paneli.** Yorum, boyutlar, medya, AI sinyalleri (niyet, aciliyet, churn, güven bayrağı ve gerekçesi), müşteri zaman çizelgesi; altında yanıt editörü (orijinal yorum görünür hâlde), AI ton çipleri (Profesyonel / Sıcak / Çözüm odaklı), şablonlar; sekme olarak "Telafi" (durum rozetiyle, açık teklif varken devre dışı) ve "Görev oluştur". Klavye kısayolları: `j/k` gezinme, `r` yanıt, `e` okundu.

**Mobil:** Liste tam ekran; karta dokununca detay alttan sheet olarak açılır. Yanıt editörü sabit bir alt çubukta durur, AI tonları yatay kaydırmalı çipler olarak gösterilir. KPI şeridi yatay kaydırmalı olur.

**Motion (ölçülü):** 3B'ye gerek yok; bu bir iş sayfası. framer-motion yalnız üç yerde kullanılmalı:
- Detay panelinin kayarak açılması.
- Yanıt gönderilince kartın "Bekleyen" listesinden `layout` animasyonuyla çıkması ve sayaçların yumuşak güncellenmesi.
- Yeni yorum geldiğinde üstte beliren "N yeni" çubuğu.

`AnimatedNumber` yerine framer'ın `useSpring` + `useReducedMotion` ikilisi kullanılmalı. Kart başına stagger kaldırılmalı (yüzlerce kartta gecikme yaratıyor).

**Veri/API değişiklikleri:**
- `GET /api/dealer/feedback-inbox?status&source&rating&from&to&qrCodeId&topic&sort&q&cursor`: İki kaynağı ortak satır şemasıyla döndürmeli (`{ id, source, rating, text, sentiment|pending, urgency, churnRisk, trustFlagged, isToxic, topics, media, customer: {name, image, visitCount}, dealerReply, dealerRepliedAt, dealerFirstViewedAt, remedyStatus, createdAt }`); e-posta yok; rol kapsamı tek yardımcıdan (Bulgu 1).
- `GET /api/dealer/feedback-inbox/summary`: KPI'lar, Redis'te 60 sn önbellek, yeni geri bildirimde etiketle bayatlatma.
- `ConsumptionReview` modeline `dealerFirstViewedAt` eklenmeli; QR ile eşitlik sağlanır ve SLA hesabı iki kaynakta da yapılabilir.
- Yanıt ucuna `PATCH` (düzenleme) ve yanıt geçmişi tablosu eklenmeli.
- Telafi: tek bir `createRemedyOffer()` servisi; açık teklif için 409; idempotency anahtarı zorunlu; geçersiz gövdede 400.
- Arama: `pg_trgm` GIN indeksi + mevcut semantik uç.
- Canlı güncelleme: mevcut `RealtimeNotifications` kanalından `feedback.created` olayını dinleyip `queryClient.invalidateQueries(['feedback-inbox'])`.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/reviews` ile doğrudan çakışma (birleştirilmeli):** Aynı `ConsumptionReview` verisini aynı `/api/dealer/reviews` ucundan çekiyor (`app/dealer/reviews/page.tsx:137`) ve aynı yanıt ucuna yazıyor (`:68`). Ancak AI önerisi için **farklı bir motor** kullanıyor (`/api/ai/generate-reply`, `:111`); bu sayfa ise `suggestResponseWithGroq` kullanıyor. Sidebar'da ikisi aynı grupta yan yana (`components/dashboard/sidebar.tsx:254-255`). Bayi aynı yorumu iki yerde, iki farklı AI kalitesiyle görüyor. **Öneri:** `/dealer/reviews` birleşik gelen kutusunda "Kaynak: Tüketim" filtresine yönlendirilsin (`redirect('/dealer/feedbacks?source=consumption')`); tek bir AI yanıt motoru seçilsin (adaptive profile ve `customPrompt` destekleyeni).
- **`/dealer/remedy-queue`:** Ayrı kalabilir; burası onay iş akışı. Ancak bu sayfadaki telafi durumu rozeti oraya bağlantı vermeli. Modül kapalıyken iki sayfa da tutarlı biçimde gizlenmeli.
- **`/dealer/voc-wall`:** Müşteri sesinin sunum/duvar görünümü; amacı farklı, korunmalı. Ancak "tümünü gör" bağlantıları (`app/dealer/voc-wall/page.tsx:413,545`) filtreli derin bağlantı (`?topic=…`) taşımalı.
- **`/dealer/incidents` ve ekip modülü:** Birleştirilmemeli; detay panelinden "olay/görev oluştur" ile bağlanmalı.
- **Derin bağlantı tutarlılığı:** `lib/next-best-action.ts:35,42` (`?tab=qr`), churn-risk, copilot, ROI ve benchmark bu sayfaya filtresiz yönlendiriyor. Yeni tasarımda bütün filtreler URL'de olacağı için bu bağlantılar anlamlı hale getirilmeli; örneğin "Negatif yorumlara telafi gönder" → `?status=pending&sentiment=negative`.

---

## Doğrulama (şüpheci inceleme)

> Yöntem: Her iddia, ilgili kod baştan okunarak çürütülmeye çalışıldı (sayfa, API uçları, `lib/api-auth.ts`, `lib/auth.ts`, `proxy.ts`, `lib/idempotency.ts`, `prisma/schema.prisma`, müşteri tarafı telafi uçları). Hiçbir kod, betik, test veya veritabanı sorgusu çalıştırılmadı; kararlar yalnız kod okumasına dayanır.

### 1. STAFF rolü `GET /api/feedbacks` üzerinden tüm işletmelerin geri bildirimlerini okuyabiliyor: **DOĞRULANDI (kritik)**

- `app/api/feedbacks/route.ts:28` `requireAuth()` rol listesi olmadan çağrılıyor. `lib/api-auth.ts:60` yalnız `allowedRoles?.length` doluysa rol kontrolü yapıyor, yani oturumu olan her rol geçiyor.
- `route.ts:43-51`: `where` yalnız `CUSTOMER` (`userId`) ve `DEALER` (`qrCode.dealerId`) için daraltılıyor. `STAFF` için başka bir dal yok ve yorum (`:51`) "ADMIN sees all" diyor, ama bu durum STAFF için de geçerli. `qrCodeId` parametresi (`:53-55`) sahiplik kontrolü olmadan uygulanıyor, bu yüzden hedefli sorgu da yapılabiliyor.
- `proxy.ts:107-120`: `/api/*` istekleri yalnız güvenlik ve CORS başlıklarıyla geçiriliyor, rol kontrolü yok.
- STAFF girişi gerçekten mümkün: `app/api/dealer/staff/route.ts:126-134` personeli `role: 'STAFF'`, `emailVerified: new Date()` ve bayinin belirlediği şifreyle oluşturuyor. `lib/auth.ts:136-206` credentials akışında STAFF'ı engelleyen bir kontrol yok; `:240` `token.role = dbUser.role`.
- Sızan alanlar: `user.email` (`route.ts:77-79`), metin, puan, NPS, medya, QR adı ve kodu, rakip `businessName` (`:80-86`). `pageSize` en fazla 100 (`lib/validations.ts:85-86`).
- **Yeniden üretim:** Bayi A, `/dealer/team` üzerinden `x@a.com` / `Sifre1234` ile bir personel ekler. Bu personel `/auth/login` ile giriş yapar ve `GET /api/feedbacks?pageSize=100&page=1..N` çağırır. Yanıtta B, C, D… bayilerinin tüm geri bildirimleri müşteri e-postalarıyla birlikte gelir. `total` ve `totalPages` alanları tam dökümün boyutunu da verir.
- **Düzeltme yaklaşımı:** Uç `requireAuth(['CUSTOMER','DEALER','ADMIN'])` ile kısıtlanmalı. STAFF erişimi gerekiyorsa `lib/api-auth.ts:155` civarındaki staff yardımcısıyla `dealerId` alınıp `qrCode.dealerId` filtresi uygulanmalı. Kapsam, varsayılanı reddeden tek bir `scopeFeedbackWhere(session)` yardımcısında toplanmalı: tanınmayan rol boş sonuç ya da 403 alır. Bayi ve personel yanıtlarından `user.email` çıkarılmalı (`/api/dealer/reviews` için de geçerli, `route.ts:55`).
- **Ek kritik gözlem (iddia dışı, kod okumasıyla doğrulandı, çalıştırılmadı):** `app/api/dealer/staff/route.ts:77-104` girilen e-posta **mevcut bir kullanıcıya** aitse ve o kullanıcının bir `dealerStaff` bağlantısı yoksa, kullanıcının **şifresini bayinin verdiği şifreyle değiştiriyor ve rolünü `STAFF` yapıyor**. Hedefin müşteri, başka bir bayi ya da ADMIN olması fark etmiyor. 2FA'sı kapalı her doğrulanmış hesap için bu, hesap ele geçirme ve rol düşürme anlamına geliyor. Bu bulgu ayrı ve acil bir kayıt olarak ele alınmalı: mevcut kullanıcı için davet/onay akışı kurulmalı ve şifre ile rol asla üzerine yazılmamalı.

### 2. Telafi onay kuyruğu bypass (mesaj > 500 karakter): **DOĞRULANDI (yüksek)**

- `app/dealer/feedbacks/page.tsx:962-968`: Textarea'da `maxLength` yok. `:219-223` gövdeyi `message`, `sendNotification: !remedyQueueFirst`, `queueForApproval: remedyQueueFirst` ile gönderiyor.
- `app/api/dealer/feedbacks/[id]/remedy/route.ts:25` `message.max(500)`. `:61` `safeParse` başarısız olunca `:62-65` mesaj varsayılana dönüyor, `:66` `queueForApproval = false`, `:67-71` `sendNotification = true`. Sonuçta `:79-115` teklif `status: 'pending'` ile oluşturuluyor ve müşteriye `Notification` gidiyor. Aynı desen `app/api/dealer/consumption-reviews/[id]/remedy/route.ts:62-75` dosyasında da var.
- Müşteri tarafı: `app/api/customer/remedy/[offerId]/route.ts:56-61` yalnız `awaiting_dealer_approval` ve `rejected` durumlarını gizliyor. `pending` teklif hemen görünür ve kabul edilebilir (`:155-163`).
- **Yeniden üretim:** Bayi telafi modalında "önce onay kuyruğuna al" kutusunu işaretler, 501 karakterlik bir mesaj yazar ve gönderir. Sunucu 200 ve `queuedForApproval:false`, `notificationSent:true` döner, istemci "Telafi teklifi müşteriye gönderildi" toast'ını gösterir (`page.tsx:230-233`). Müşteriye onaylanmamış bir teklif ulaşır ve teklif metni bayinin yazdığı değil, varsayılan metindir. Bayi toast'ı okursa durumu fark edebilir, ama kuyruk tercihi sessizce yok sayılmış olur.
- **Düzeltme yaklaşımı:** Geçersiz gövdede **400** dönülmeli; varsayılana düşmek bir kontrol akışı olarak kullanılmamalı. İstemcide `maxLength={500}` ve karakter sayacı olmalı. İki rota tek bir `createRemedyOffer()` servisinde birleştirilmeli.

### 3. QR geri bildirimlerinde puan filtresi sunucuda yok sayılıyor: **DOĞRULANDI (orta)**

- `page.tsx:319` `rating` parametresini ekliyor. `app/api/feedbacks/route.ts:32-60` yalnız `page`, `pageSize`, `qrCodeId`, `sentiment` ve `needsReview` okuyor; `rating` hiçbir yerde kullanılmıyor. İstemci tarafında da QR listesi puana göre süzülmüyor (`page.tsx:345-352` yalnız arama).
- Ters yönde de bir tutarsızlık var: `needsReview` parametresi `/api/dealer/reviews` tarafından okunmuyor (`app/api/dealer/reviews/route.ts:22-23`). Bu yüzden "Manuel inceleme" kutusu tüketim sekmesini etkilemiyor. Ayrıca `ratingFilter` değişince `feedbackPage` 1'e çekilmiyor (`page.tsx:531`; `needsReview` için `:549`'da çekiliyor).
- **Yeniden üretim:** Filtrede "1 yıldız" seçilir. Tüketim sekmesi süzülür, QR sekmesi ise tüm puanları göstermeye devam eder ve sekme başlığındaki sayı değişmez.
- **Önem notu:** Bu bir güvenlik açığı değil, işlev hatası. "Kritik/yüksek" etiketi abartılı; önem orta.

### 4. KPI kartları sayfa örneklemini gerçek toplam gibi gösteriyor: **DOĞRULANDI (orta)**

- `page.tsx:363-375` KPI'ları yüklü dizilerden hesaplıyor: QR'da en fazla 20 kayıt (sayfa boyutu, `:153`, `:322`), tüketimde en fazla 50 kayıt (`/api/dealer/reviews` `limit` varsayılanı, `route.ts:9,23`; istemcinin gönderdiği `pageSize` orada okunmuyor). Sonuçlar `:415` ve `:487` kartlarında gösteriliyor.
- `reviewStats` `:336`'da yazılıyor, ama dosyada başka hiçbir yerde okunmuyor (yalnız `:169` tanımı var). Sunucunun doğru `totalReviews` ve `avgRating` değerleri (`route.ts:91-95,127-131`) boşa gidiyor. Aynı örneklem PDF özetine de (`page.tsx:470-471`) ve sekme başlıklarına da (`:565,569`) taşınıyor.
- Olumlu/olumsuz sayıları iki farklı tanımın toplamı: QR için AI `sentiment` değeri (analiz edilmemişse `null`, hiçbir kümeye girmiyor), tüketim için puan eşiği (`:372-375`).
- **Yeniden üretim:** Bayinin 300 QR geri bildirimi ve 120 tüketim yorumu var. "Toplam" kartı 70 gösterir. QR sayfası 2'ye geçilince ortalama ve olumlu/olumsuz sayıları değişir.
- **Düzeltme yaklaşımı:** KPI'lar `count`, `aggregate` ve `groupBy` ile sunucuda, filtreden bağımsız bir özet ucundan (`/api/dealer/feedback-inbox/summary`) gelmeli ve tek bir duygu tanımı kullanılmalı (`sentiment ?? puan eşiği`).
- **Önem notu:** Veri bütünlüğü değil, gösterim hatası. Bayiyi yanlış karara itebileceği için orta.

### 5. Tüketim yorumları 50 kayıtta kesiliyor: **DOĞRULANDI (orta)**

- `app/api/dealer/reviews/route.ts:8-9,23,49`: `take: limit` (varsayılan 50, en fazla 100). `page`, `skip` ya da `cursor` yok. Sayfa `pageSize=20` gönderiyor, ama uç `limit` okuduğu için bu değer etkisiz. Sayfalama bileşeni yalnız QR sekmesinde render ediliyor (`page.tsx:841`).
- Alternatif bir yol da yok: `app/dealer/reviews/page.tsx:137` aynı ucu `limit` vermeden çağırıyor, o sayfa da 50'de kesiliyor. Arama (`page.tsx:354-361`), CSV/PDF dışa aktarma (`:430-438`) ve yanıt/telafi aksiyonları bu 50 kayıtla sınırlı.
- **Yeniden üretim:** 51 ve üzeri tüketim yorumu olan bir bayide en eski yorum hiçbir arayüzden görüntülenemez, yanıtlanamaz ve dışa aktarılamaz. Puan filtresi yalnız o puandaki ilk 50 kaydı gösterir.
- **Düzeltme yaklaşımı:** İmleç tabanlı sayfalama (`cursor` = `createdAt,id`), sunucu tarafı arama ve dışa aktarma için ayrı, akışlı bir uç (`/export`) gerekli.

### 6. Anonim geri bildirime telafide sahte başarı ve sınırsız tekrar teklif: **ÇÜRÜTÜLDÜ (kritik/yüksek önem iddiası)**, düşük önemli UX kalıntısı var

- **Doğru olan kısım:** `remedy/route.ts:79` `userId` yoksa teklif oluşturmuyor, ama `:118-130` yine de bir olay yazıp `success:true` dönüyor. İstemci bu durumda (`notificationSent:false`) "Telafi tetiklendi." toast'ını gösteriyor (`page.tsx:230-234`, `messages/tr.json:457`). Anonim QR kartında telafi butonu gizlenmiyor (`page.tsx:820-828`). Ayrıca Idempotency-Key gönderilmiyor (`lib/idempotency.ts:12-18,33`: başlık yoksa koruma devre dışı) ve `RemedyOffer` üzerinde `feedbackId` ya da `consumptionReviewId` için benzersizlik veya açık teklif kontrolü yok (`prisma/schema.prisma:1327-1349`).
- **Çürüten kanıtlar:**
  - "Metrik şişiyor": `remedy_campaign_triggered` olayını okuyan hiçbir kod yok (repo genelinde yalnız iki yazma noktası var). Etkilenen bir gösterge yok.
  - "Puan/indirim ekonomisi riski": Teklifi kabul etmek (`app/api/customer/remedy/[offerId]/route.ts:155-163`) yalnız `selectedType` ve `selectedValue` alanlarını kaydediyor. Hiçbir puan basma (`creditPointsAndXp` vb.) ya da kupon üretme yolu yok (`selectedType` yalnız iki müşteri ucunda geçiyor). Tekrar eden teklifler yalnız bayinin kendi isteğiyle, kendi müşterisine oluşur; müşteri ya da saldırgan teklif çoğaltamaz. Platform puan ekonomisinde net-zero ihlali yok.
  - Tüketim yorumunda `customerId` zorunlu (`schema.prisma:1605`), yani anonim durum yalnız QR geri bildirimlerinde ortaya çıkabilir.
- **Kalan gerçek sorun (düşük):** Anonim QR geri bildiriminde telafi butonu devre dışı bırakılmalı ya da açıklayıcı bir ipucu göstermeli ("Anonim müşteriye telafi gönderilemez"). Sunucu bu durumda 422 dönmeli. Aynı kayıt için açık (`pending` ya da `awaiting_dealer_approval`) teklif varsa sunucu 409 dönmeli, istemci de `crypto.randomUUID()` ile Idempotency-Key göndermeli. Bu bir veri ya da ekonomi açığı değil, UX ve tutarlılık iyileştirmesi.

### Özet

| # | İddia | Karar | Gerçek önem |
|---|---|---|---|
| 1 | STAFF ile çok kiracılı sızıntı | Doğrulandı | Kritik (+ ayrı kritik: staff POST ile hesap ele geçirme) |
| 2 | Onay kuyruğu bypass (>500 karakter) | Doğrulandı | Yüksek |
| 3 | QR puan filtresi yok sayılıyor | Doğrulandı | Orta |
| 4 | KPI'lar sayfa örneklemi | Doğrulandı | Orta |
| 5 | Tüketim yorumları 50'de kesiliyor | Doğrulandı | Orta |
| 6 | Anonim telafide sahte başarı ve ekonomi riski | Çürütüldü (yüksek önem iddiası) | Düşük (UX) |
