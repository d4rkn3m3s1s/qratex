# /customer/event

**Amaç:** Müşteriye o an aktif olan zaman-sınırlı sezonluk etkinliği (`SeasonalCampaign`) göstermek. Sayfa etkinliğin adını, açıklamasını, geri sayımını ve çarpan/bonus rozetlerini, varsa da etkinlik görevini (challenge: X oyun oyna / X yorum yaz) ilerleme çubuğu ve tek seferlik "Ödülü al" talebiyle sunuyor.

**Genel puan: 4/10** · **Karar: birleştir** (Bu sayfa `/customer/quests` + `/customer/campaigns` ile tek bir "Etkinlikler" merkezine katılmalı. Ondan önce görev (challenge) hattı uçtan uca onarılmalı.)

Kısaca: Sunucu tarafı ekonomi açısından doğru kurulmuş. İlerleme sunucuda yeniden sayılıyor, ödül atomik ve tek seferlik veriliyor, `points_credited` kaydı da yazılıyor. Ancak sayfanın ana özelliği olan **Etkinlik Görevi üretimde hiçbir yoldan yapılandırılamıyor**. Admin API'si challenge alanlarını kabul etmiyor. Bu yüzden canlıdaki gerçek deneyim, bir başlık kartıyla iki rozetten ibaret. Hata durumu "etkinlik yok" boş durumuna düşüyor. Etkinlik biterken tamamlanmış ama henüz alınmamış ödül de kayboluyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Challenge alanlarını hiçbir yazma yolu doldurmuyor. Canlıda sadece "etkinlik adı + çarpan rozeti" çalışıyor. Hata durumu boş durum gibi görünüyor, etkinlik bitince alınmamış ödül de yanıyor. |
| UX | 4/10 | Çarpanın neye uygulandığı (geri bildirim + pasif tüketim puanı; oyun ve görev ödülü değil) ve günlük tavan anlatılmıyor. CTA yok. Türkçe metinlerde dil bilgisi hatası var. |
| Görsel | 5/10 | Gradyanlı kart ve rozetler temiz. Ama `imageUrl` kullanılmıyor, ödül kazanıldığında kutlama anı yok. Dili diğer oyunlaştırma sayfalarına göre düz kalıyor. |
| Mimari | 5/10 | Saf çekirdek (`lib/seasonal-event-core.ts`) ve testleri iyi. Buna karşın admin şeması ile challenge alanları kopuk, `challengeRewardBadgeId` FK'siz, `isEligible` her zaman `true`. i18n de yok. |
| Performans | 7/10 | Sayfa hafif. GET akışında 4 ardışık sorgu var. Bunlardan biri gereksiz (ikinci `findUnique`) ve global aktif kampanya önbelleğe alınmıyor. |
| Erişilebilirlik + Mobil | 5/10 | Mobilde `flex-wrap` sayesinde yerleşim bozulmuyor. İlerleme çubuğunda `role="progressbar"`/aria yok, iskelette `aria-busy` yok, azaltılmış hareket desteği yok. Arka planda geri sayım kayıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Menü girişi "Etkinlik Merkezi" (oyunlar grubu) | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:311`, `messages/tr.json:2598` | TR ve EN etiketleri mevcut. |
| 2 | Admin menü görünürlük kataloğu kaydı | KISMİ | `lib/visibility-controls.ts:83` | Yalnızca kenar çubuğunu gizliyor. API `assertMenuItemVisible` çağırmıyor (`app/api/customer/seasonal-event/route.ts:35-47`), bu yüzden sayfa doğrudan URL ile açılabiliyor ve çalışıyor. |
| 3 | Sayfa `<title>` / metadata | EKSİK | `app/customer/event/` altında yalnız `page.tsx` var. Karşılaştırma için `app/customer/campaigns/layout.tsx` | Diğer müşteri sayfalarındaki `segmentLayoutMetadata` deseni burada yok. Sekmede genel "Müşteri Paneli" başlığı görünüyor. |
| 4 | Hero başlık (`DashboardPageHero`) | ÇALIŞIYOR | `page.tsx:84-88`, `components/layout/dashboard-page-hero.tsx:9-13` | Metinler sabit Türkçe, i18n'den geçmiyor. |
| 5 | Yükleniyor iskeleti | KISMİ | `page.tsx:90-91` | Tek bir `h-48` blok. `aria-busy` yok. Talep sonrası `load()` içerik varken iskelet gösteriyor (flaş). |
| 6 | Hata durumu | BOZUK | `page.tsx:47-54` | `r.ok` kontrol edilmiyor. 500/503 gövdesi `{error}` `setData` ile yazılıyor ve `!data?.active` dalına düşüyor. Ağ hatası `.catch(() => {})` ile yutuluyor. Kullanıcı sunucu hatasında "Şu an aktif etkinlik yok" görüyor, yeniden deneme de yok. |
| 7 | Boş durum ("Şu an aktif etkinlik yok") | KISMİ | `page.tsx:92-101` | "Yakında özel bir etkinlik başlayacak" sözü veriden bağımsız ve sabit kodlu. Gelecek etkinlik varsa tarihi gösterilmiyor, yoksa bile söz veriliyor. |
| 8 | Etkinlik kartı: ad + açıklama + "Aktif Etkinlik" etiketi | ÇALIŞIYOR | `page.tsx:105-115`, API `route.ts:80-93` | |
| 9 | Geri sayım rozeti | KISMİ | `page.tsx:61-65`, `page.tsx:116-119`, `lib/seasonal-event-core.ts:53-61` | Değer, `endDate`'ten değil, 60 saniyede bir sabit 60 000 ms düşülerek hesaplanıyor. Arka plan/PWA'da `setInterval` kısılınca kayıyor. Son dakikada "0 dakika kaldı" yazıyor. 0'a inince "Bitiyor" gösteriyor ama sayfayı yenilemiyor. `endDate` dönülüyor ama kullanılmıyor (`page.tsx:23`). |
| 10 | Çarpan rozeti "N× puan" | KISMİ | `page.tsx:124-128` | Çarpan yalnızca geri bildirim puanına (`app/api/feedbacks/route.ts:315`) ve pasif tüketim puanına (`app/api/dealer/consumptions/route.ts:325`) uygulanıyor. Oyun, görev ödülü ve sürpriz kutuya uygulanmıyor. Günlük tavan da sonradan uygulanıyor (`feedbacks/route.ts:317`). Rozet bunların hiçbirini söylemiyor. |
| 11 | Bonus rozeti "+N bonus" | KISMİ | `page.tsx:129-133`, `lib/seasonal-campaign-live.ts:86-88` | Bonus işlem başına ekleniyor. Rozetten bu anlaşılmıyor ("neye +N?"). |
| 12 | Etkinlik görseli (`imageUrl`) | EKSİK | API `route.ts:90` dönüyor, sayfa kullanmıyor. Admin formunda alan yok (`app/admin/seasonal-campaigns/page.tsx`). | Ölü alan. |
| 13 | Etkinlik türü (`type`: BIRTHDAY/ANNIVERSARY/SEASONAL/SPECIAL) | EKSİK | `page.tsx:18` tipte var, render edilmiyor. `lib/seasonal-campaign-live.ts:29-33` | `isEligible` her zaman `true` döndüğü için BIRTHDAY türündeki bir kampanya herkese uygulanıyor ve herkese gösteriliyor. |
| 14 | Kampanya `discount` alanı | EKSİK | `prisma/schema.prisma:1840`; API select'inde yok | Hiçbir yerde gösterilmiyor ve uygulanmıyor. |
| 15 | Etkinlik Görevi kartı (challenge) | BOZUK (üretimde erişilemez) | `page.tsx:140-184`. Admin şeması `app/api/admin/seasonal-campaigns/route.ts:15-29` challenge alanlarını içermiyor; repo genelinde `challengeType` yazan başka kod yok (grep). | Zod bilinmeyen anahtarları sessizce attığı için admin bu alanları gönderse bile kaydedilmiyor. Kart yalnızca DB'ye elle yazılırsa görünüyor. |
| 16 | Görev açıklama cümlesi | BOZUK | `page.tsx:148-151` | `rewardPoints === 0` olduğunda (yalnız rozet ödüllü görev) cümle "Etkinlik boyunca 5 oyun oyna kazan." olarak çıkıyor. Rozet ödülü hiç anılmıyor. |
| 17 | İlerleme çubuğu + "current/goal" | KISMİ | `page.tsx:154-165`, API `route.ts:68-69` | Sunucuda sayılıyor, doğru. `role="progressbar"`/`aria-valuenow` yok. Oyun oynayıp dönen kullanıcı için odak/görünürlük değişince yeniden çekme yok. |
| 18 | "Tamamlamana N … kaldı" metni | BOZUK | `page.tsx:177-179`, `page.tsx:36-37` | Çıktı "Tamamlamana 3 oyun oyna kaldı" oluyor; bozuk Türkçe. `challengeLabel` emir kipi döndürüyor ve iki bağlamda da kullanılıyor. |
| 19 | "Ödülü al" butonu | ÇALIŞIYOR (koşullu) | `page.tsx:67-80`, `page.tsx:172-175` | `claiming` sırasında devre dışı, çift tık korumalı. #15 nedeniyle canlıda görünmüyor. |
| 20 | Ödül talebi sunucusu (POST) | ÇALIŞIYOR | `route.ts:112-187` | İlerleme yeniden sayılıyor (`:137`). Atomik tek-claim `createMany skipDuplicates` + `@@unique([userId,campaignId])` (`schema.prisma:1869`). `points_credited` yazılıyor (`:154-159`). Ekonomi değişmezlerine uygun. |
| 21 | Özel rozet ödülü | KISMİ | `route.ts:162-167`, `schema.prisma:1848` | `challengeRewardBadgeId` için ilişki/FK yok. Geçersiz ya da silinmiş bir rozet id'si `userBadge` FK ihlali üretir, tüm tx geri alınır ve kullanıcı ödülü kalıcı olarak alamaz (500). Rozet UI'da hiç gösterilmiyor. |
| 22 | Talep sonrası bildirim kaydı | ÇALIŞIYOR | `route.ts:168-173` | |
| 23 | Başarı/hata toast'ları | ÇALIŞIYOR | `page.tsx:73`, `page.tsx:76` | 409 ("zaten aldın") durumunda sayfa yenilenmiyor, buton kalıyor. |
| 24 | "Ödülünü aldın" durumu | ÇALIŞIYOR | `page.tsx:168-171` | |
| 25 | Görev ödülü XP'si | EKSİK | `route.ts:153` `creditPointsAndXp(tx, { userId, points })`, `xp` verilmiyor | Diğer kazanımlar puan ve XP veriyor. Görev yalnız puan veriyor, seviye ilerlemesine katkısı yok. |
| 26 | Etkinlik sonrası talep penceresi | EKSİK | `route.ts:121-124` | Etkinlik `endDate`'i geçince `getActiveSeasonalCampaign` null döndürüyor ve "Aktif etkinlik yok." 400 yanıtı geliyor. Son saatte görevi tamamlayıp butona basmayan kullanıcı ödülü kaybediyor. |
| 27 | Eşzamanlı birden fazla etkinlik | EKSİK | `lib/seasonal-campaign-live.ts:44-63` (`orderBy multiplier desc`, ilk uygun) | Daha düşük çarpanlı ama görevli ikinci bir etkinlik hiç görünmüyor ve talep edilemiyor. |
| 28 | Giriş animasyonları (`Motion.div`) | KISMİ | `page.tsx:105`, `page.tsx:141` | Ölçülü (y:12). Ama `useReducedMotion`/`MotionConfig reducedMotion` yok (repo genelinde global `MotionConfig` bulunamadı). |
| 29 | Kimlik doğrulama | ÇALIŞIYOR | `route.ts:37-40`, `route.ts:114-117` | Kullanıcı id'si oturumdan alınıyor, parametre yok, IDOR riski yok. |
| 30 | Çok dillilik (i18n) | EKSİK | `page.tsx:86-87`, `:96-98`, `:111`, `:146` vb. | Diğer müşteri sayfaları `t()` kullanıyor (ör. `app/customer/quests/page.tsx:311`). EN kullanıcısı bu sayfayı Türkçe görüyor. |
| 31 | Göreve yönlendiren CTA (Oyunlara git / Yorum yaz) | EKSİK | `page.tsx:176-180` | Kullanıcıya yalnız metin veriliyor, aksiyon yok. |
| 32 | Ödül anı kutlaması (konfeti/animasyon) | EKSİK | `page.tsx:73` yalnız toast | Rozet/kutu sayfalarındaki kutlama diliyle tutarsız. |
| 33 | Yaklaşan / geçmiş etkinlikler | EKSİK | API yalnız aktif etkinliği dönüyor (`route.ts:44-47`) | |
| 34 | Ödülü alındıktan sonra puan bakiyesinin güncellenmesi (header) | doğrulanmadı | `page.tsx:74` yalnız sayfa verisini yeniliyor | Header bakiye bileşeninin global bir olay dinleyip dinlemediği bu denetimde doğrulanmadı. |

**Durum sayımı (34 madde):** ÇALIŞIYOR 9 · KISMİ 10 · BOZUK 4 · SAHTE 0 · EKSİK 10 · doğrulanmadı 1

---

## Bulgular

### 1. [KRİTİK] İşlevsellik / Veri akışı: Etkinlik Görevi üretimde yapılandırılamıyor (ölü özellik)
- **Kanıt:** `app/api/admin/seasonal-campaigns/route.ts:15-29` (`createSchema`/`updateSchema` içinde `challengeType`, `challengeGoal`, `challengeRewardPoints`, `challengeRewardBadgeId` yok). Repo genelinde bu alanları **yazan** tek bir satır yok; yalnızca `route.ts:55`, `:129` ve `lib/seasonal-event-core.ts` okuyor. Admin formu da bu alanları içermiyor (`app/admin/seasonal-campaigns/page.tsx`).
- **Sorun:** Sayfanın ödül döngüsü (ilerleme → ödül al → bildirim → rozet) kodda tamam, ama veri üretilemediği için canlıda hiç görünmüyor. Sayfa pratikte bir "etkinlik adı + çarpan" vitrinine iniyor. Zod varsayılan olarak bilinmeyen anahtarları sessizce attığından admin bu alanları elle gönderse bile hata almadan kayboluyor.
- **Öneri:** Admin kampanya şemasına `challenge` alt nesnesi eklenmeli: `{ type: enum['games_played','reviews_written'], goal: int 1..1000, rewardPoints: int 0..N, rewardBadgeId: string | null }`. Rozet id'si kayıt sırasında `prisma.badge.findUnique` ile doğrulanmalı (bkz. #4). Admin formuna da bir "Görev" bölümü eklenmeli: tür seçici, hedef, ödül puanı, rozet seçici ve "kullanıcı bunu nasıl görecek" önizlemesi. `updateSchema` için `.strict()` düşünülmeli ki şema kayması sessiz kalmasın. Kampanya başladıktan sonra hedef ve ödülün değiştirilmesi kilitlenmeli; yoksa talep edenler ile etmeyenler arasında adaletsizlik doğar.
- **Efor:** M

### 2. [YÜKSEK] Ekonomi / UX: Etkinlik bitince tamamlanmış ama alınmamış ödül kayboluyor
- **Kanıt:** `app/api/customer/seasonal-event/route.ts:121-124` (aktif kampanya yoksa 400). `page.tsx:61-65` (sayaç 0'a inince sayfa yenilenmiyor, buton görünür kalıyor).
- **Sorun:** Kullanıcı son gün hedefe ulaşıp ertesi gün geldiğinde ödülü talep edemiyor ve sayfa "Şu an aktif etkinlik yok" diyor. Hak edilmiş bir ödülün sessizce kaybolması, sadakat ürünlerinde güveni en çok zedeleyen hatadır. Starbucks ve Duolingo bu durumda ya otomatik verir ya da "talep süresi" tanır.
- **Öneri:** İki katmanlı çözüm: (a) Sunucuda talep, `endDate + claimGraceHours` (ör. 72 saat) boyunca geçerli olmalı. POST, "aktif kampanya"yı değil, kullanıcının ilerlemesi olan ve talep penceresi açık kampanyayı `campaignId` ile hedeflemeli. Sayım penceresi yine `startDate..endDate` kalmalı. (b) Tercihen talep **otomatik** yapılmalı: oyun tamamlama ve `ConsumptionReview` oluşturma yollarında aynı atomik tek-claim çağrılmalı; kaçan talepleri kapatmak için kampanya bitiminde bir cron süpürmesi eklenmeli. İkisinde de `SeasonalChallengeClaim` üzerindeki `@@unique` korunduğu için ekonomi değişmezi bozulmaz. UI tarafında sayaç 0'a indiğinde `load()` tetiklenmeli ve "Etkinlik bitti — ödülünü 3 gün içinde al" durumu gösterilmeli.
- **Efor:** M

### 3. [YÜKSEK] Hata yönetimi: Sunucu/ağ hatası "aktif etkinlik yok" olarak gösteriliyor
- **Kanıt:** `page.tsx:47-54` (`r.ok` kontrolü yok, `.catch(() => {})`). `page.tsx:92`.
- **Sorun:** 503 (`responseIfDatabaseUnavailable`) ya da 500 durumunda kullanıcı yanlış bir bilgi görüyor: aktif bir etkinlik ve çarpan varken "yok" deniyor. Ağ hatası tamamen yutuluyor ve yeniden deneme yolu yok.
- **Öneri:** Veri katmanı `{ status: 'loading' | 'error' | 'empty' | 'active' }` durum makinesine geçirilmeli. SWR ya da projede kullanılan ortak fetch yardımcısıyla `r.ok` kontrolü yapılmalı, hata kartı ve "Tekrar dene" butonu eklenmeli, `revalidateOnFocus` açılmalı (#8 ile birlikte). Talep sonrası yenileme sırasında içerik yerinde kalmalı (iskelet flaşı yerine `isValidating` göstergesi).
- **Efor:** S

### 4. [YÜKSEK] Veri bütünlüğü: `challengeRewardBadgeId` FK'siz, geçersiz id ödül talebini kalıcı olarak kırıyor
- **Kanıt:** `prisma/schema.prisma:1848` (ilişki yok). `route.ts:162-167` (`tx.userBadge.createMany` aynı tx içinde). `prisma/schema.prisma:637-638` (`UserBadge.badge` FK).
- **Sorun:** Rozet silinirse ya da yanlış id girilirse FK ihlali transaction'ı (claim + puan + bildirim) geri alıyor. Kullanıcı her denemede "Ödül talep edilemedi" (500) alıyor ve puanını da alamıyor. #1 düzeltildiği anda bu risk canlıya çıkar.
- **Öneri:** Şemaya `rewardBadge Badge? @relation(fields:[challengeRewardBadgeId], references:[id], onDelete: SetNull)` eklenmeli. Bu bir migration gerektirir; canlı Neon'da elle ve DIRECT_URL ile yapılmalı. Ek olarak admin kaydında rozetin varlığı doğrulanmalı, POST'ta da rozet bulunamazsa rozet adımı atlanıp loglanmalı. Rozet ödülü UI'da (görev kartında rozet önizlemesi) ve bildirim metninde gösterilmeli.
- **Efor:** S

### 5. [ORTA] UX / Doğruluk: Çarpan ve bonus rozetleri neye uygulandığını söylemiyor
- **Kanıt:** `page.tsx:124-133`. Uygulama yerleri yalnızca `app/api/feedbacks/route.ts:315` ve `app/api/dealer/consumptions/route.ts:325`. Tavan: `feedbacks/route.ts:317` `capFeedbackPoints`.
- **Sorun:** "2× puan" etiketi kullanıcıya her şeyin iki kat olduğunu düşündürüyor. Oysa oyun ödülleri, görev ödülü, sürpriz kutu ve referral çarpandan etkilenmiyor; geri bildirimde günlük tavan da çarpandan sonra uygulanıyor. Beklenti ile gerçekleşen arasındaki bu fark "puanım eksik geldi" şikâyeti üretir.
- **Öneri:** Rozetin altına "Nerede geçerli?" bilgi satırı eklenmeli: "QR geri bildirimlerinde ve tüketim puanlarında 2×, her geri bildirimde +50 bonus · Günlük tavan geçerlidir". Bu bilgi API'den gelmeli; `event.appliesTo: ['feedback','consumption']` alanı sunucuda `applySeasonalCampaignMultiplier` çağrı yerleriyle aynı kaynaktan (ör. `lib/seasonal-campaign-live.ts` içinde bir sabit) üretilmeli ki metin ile davranış ayrışmasın. Duolingo "Double XP" ekranındaki "sonraki 15 dakikadaki dersler" netliği hedeflenmeli.
- **Efor:** S

### 6. [ORTA] Dil / İçerik: Görev metinleri bozuk Türkçe üretiyor
- **Kanıt:** `page.tsx:36-37` (`challengeLabel` emir kipi döndürüyor). `page.tsx:148-151` ve `page.tsx:177-179`.
- **Sorun:** "Tamamlamana 3 oyun oyna kaldı" bozuk bir cümle. Ödül puanı 0 olduğunda "Etkinlik boyunca 5 oyun oyna kazan." çıkıyor. `games_played` yalnızca `status: 'completed'` oturumları sayıyor (`route.ts:20-22`), ama metin "oyun oyna" diyerek başarısız oyunların da sayılacağını ima ediyor.
- **Öneri:** Etiketler isim/fiil biçimlerine ayrılmalı (`{ goalText: '5 oyunu tamamla', remainingText: (n) => \`\${n} oyun daha\` }`) ve `messages/tr.json` + `en.json` içine ICU plural ile taşınmalı. Ödül cümlesi puan ve rozet için koşullu kurulmalı: "5 oyunu tamamla → +300 puan ve 'Kış Kahramanı' rozeti".
- **Efor:** S

### 7. [ORTA] Ürün doğruluğu: `isEligible` her zaman `true`; BIRTHDAY türü herkese uygulanıyor, tek etkinlik görünüyor
- **Kanıt:** `lib/seasonal-campaign-live.ts:29-33`, `:44-63` (`orderBy multiplier desc`, ilk uygun kampanya). `page.tsx:18` (`type` render edilmiyor).
- **Sorun:** Admin "Doğum günü" türünde bir kampanya açarsa çarpan bütün kullanıcılara uygulanır ve bu sayfada herkese gösterilir. Aynı anda iki kampanya varsa yalnız en yüksek çarpanlı olan görünür; diğerinin görevi talep edilemez.
- **Öneri:** `conditions` için gerçek bir değerlendirici yazılmalı (`minLevel`, `segment`, BIRTHDAY için doğum günü penceresi). Değerlendirici `userId` almalı ve `getActiveSeasonalCampaigns(userId)` çoğul liste dönmeli. Puan çarpanında en yüksek çarpan kuralı korunabilir, ama sayfa tüm uygun etkinlikleri ve her birinin görevini ayrı kartlarda göstermeli.
- **Efor:** M

### 8. [ORTA] Gerçek zamanlılık: Geri sayım kayıyor, ilerleme güncellenmiyor
- **Kanıt:** `page.tsx:61-65` (sabit 60 000 ms düşüş, `endDate` kullanılmıyor). `page.tsx:57-59` (yalnız ilk yükleme).
- **Sorun:** Mobil/PWA'da sekme arka plandayken `setInterval` kısılıyor ve sayaç saatlerce yanlış kalabiliyor. Son dakikada "0 dakika kaldı" görünüyor. Kullanıcı oyun oynayıp geri döndüğünde ilerleme çubuğu eski değerde kalıyor; "ilerledim" hissi kayboluyor.
- **Öneri:** Kalan süre her tikte `endDate - Date.now()` ile hesaplanmalı. Son saatte saniye çözünürlüğüne geçilmeli ve "Son 59 dk" aciliyet stili kullanılmalı. `visibilitychange`/`focus` olayında yeniden çekme yapılmalı (SWR `revalidateOnFocus`). Sayaç 0'a inince `load()` tetiklenmeli. "<1 dakika" için ayrı bir metin olmalı.
- **Efor:** S

### 9. [ORTA] Yönetim kontrolü: Menü gizlemesi API'yi ve doğrudan URL'yi engellemiyor
- **Kanıt:** `lib/visibility-controls.ts:83` (katalog kaydı). `lib/module-gate.ts:132-160` (`assertMenuItemVisible` mevcut). `app/api/customer/seasonal-event/route.ts` bu fonksiyonu çağırmıyor.
- **Sorun:** Admin "Etkinlik Merkezi"ni gizlese bile `/customer/event` ve POST talebi çalışmaya devam ediyor. Gizlemenin amacı (ör. hatalı bir kampanyayı hızla saklamak) yerine gelmiyor.
- **Öneri:** GET ve POST'un başında `assertMenuItemVisible('event_center','customer',{ userId, routeKey })` çağrılmalı. Sayfa 403 aldığında "Bu bölüm geçici olarak kapalı" durumunu göstermeli.
- **Efor:** S

### 10. [DÜŞÜK] Ekonomi tutarlılığı: Görev ödülü XP vermiyor
- **Kanıt:** `route.ts:153`.
- **Sorun:** Diğer kazanım yolları puan ve XP veriyor. Görev bir "başarı" olduğu hâlde seviye ilerlemesine katkı yapmıyor.
- **Öneri:** Kampanyaya `challengeRewardXp` alanı eklenmeli ya da `gamiSettings.xpMultiplier` ile türetilmiş bir XP verilmeli. `points_credited` verisine `xp` alanı da yazılmalı.
- **Efor:** S

### 11. [DÜŞÜK] Mimari / Performans: GET akışında gereksiz sorgu, önbellek yok
- **Kanıt:** `route.ts:44` (`findMany`) ardından `route.ts:50-57` (aynı kayıt için `findUnique`), `:68` (`count`), `:70-73` (`findUnique`). Hepsi ardışık.
- **Sorun:** Her ziyarette 4 ardışık DB turu yapılıyor. Aktif kampanya global bir veri ve Upstash ile kolayca önbelleğe alınabilir.
- **Öneri:** `getActiveSeasonalCampaign` bir `select` parametresi alıp challenge alanlarını tek seferde dönmeli. Global aktif kampanya listesi Redis'te kısa TTL (60 s) ve admin PUT/POST'ta tag-invalidate ile tutulmalı. Kullanıcıya özel `count` ve `claim` sorguları `Promise.all` ile paralelleştirilmeli.
- **Efor:** S

### 12. [DÜŞÜK] Erişilebilirlik / Uyum: aria, azaltılmış hareket, metadata, i18n
- **Kanıt:** `page.tsx:159-164` (ilerleme `div`, rol yok). `page.tsx:91` (`aria-busy` yok). `page.tsx:105`, `:141` (`useReducedMotion` yok). `app/customer/event/` altında `layout.tsx` yok. Sabit TR metinler (`page.tsx:86-98`, `:146`, `:170`).
- **Öneri:** İlerleme için `role="progressbar" aria-valuemin=0 aria-valuemax={goal} aria-valuenow={current} aria-label="Etkinlik görevi ilerlemesi"` eklenmeli. İskelete `aria-busy` ve `sr-only` "Yükleniyor" eklenmeli. Talep sonucu `aria-live="polite"` ile duyurulmalı. `useReducedMotion` ile giriş animasyonu ve ileride eklenecek kutlama kapatılmalı. `segmentLayoutMetadata('layoutMetadata.customerEvent', …)` deseniyle bir `layout.tsx` eklenmeli. Tüm metinler `customerEvent.*` anahtarlarına taşınmalı.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Etkinlik takvimi (yaklaşan + geçmiş):** Starbucks "Bonus Star Challenges" ve Duolingo etkinlik kartları gelecek etkinliği tarihiyle duyurur ("3 gün sonra başlıyor, hatırlat"). Burada boş durum veriden bağımsız bir söz veriyor. API'ye `upcoming[]` ve kullanıcının katıldığı `past[]` (kazanılan ödüllerle) eklenmeli. Push merkezine "etkinlik başladı/son 24 saat" tetikleyicisi bağlanmalı.
2. **Çok adımlı / kademeli görevler:** Tek hedef yerine 3 kademe (ör. 3, 7, 15 oyun), her kademede artan ödül. Starbucks'taki "3 ziyaret / 5 ziyaret" merdiveni ve Duolingo Monthly Challenge'daki aşamalı ilerleme bu modelin örnekleri. `SeasonalChallengeClaim` içine `tier` alanı eklenmeli, unique anahtar `userId+campaignId+tier` olmalı.
3. **Bağlamsal CTA ve derin bağlantı:** "Oyunlara git" (`/customer/games`), "Bugün yorum yaz" (`/customer/consumptions`). Görev türüne göre doğrudan aksiyona bağlanmalı.
4. **Topluluk / sosyal katman:** Etkinliğe özel mini liderlik tablosu, "bu etkinliği tamamlayan %X" ve ekip (squad) toplu hedefi. Duolingo Friends Quest benzeri bir yapı. Mevcut `/customer/leaderboard` ve squad altyapısı yeniden kullanılabilir.
5. **Ödül anı ve paylaşım:** Talepte tam ekran kutlama (rozet varsa mevcut rozet reveal bileşeni) ve Spotify Wrapped tarzı bir "etkinlik özeti" paylaşım kartı ("Kış etkinliğinde 12 oyun, 4 yorum, +900 puan").
6. **Kişisel etki göstergesi:** "Bu etkinlikte çarpan sayesinde +340 ekstra puan kazandın". Veri zaten `points_credited.data.seasonalCampaignId/seasonalMultiplier` içinde (`app/api/feedbacks/route.ts:339-341`). Monzo/Revolut'taki "bu ay kazandığın cashback" hissini verir.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Kullanıcı sayfaya girdiğinde ilk 2 saniyede üç şeyi anlamalı: (1) şu an ne oluyor ve ne kadar süre kaldı, (2) benim için ne kazandırıyor (çarpan + hangi aksiyonlarda geçerli), (3) bir sonraki adımım ne (CTA). Etkinlik bittiğinde kazanılmış ödül asla kaybolmamalı.

**Yerleşim (mobil öncelikli, tek kolon; masaüstünde 2/3 + 1/3):**
1. **Etkinlik sahnesi (hero):** `imageUrl` ya da tür tabanlı tema görseli üzerine etkinlik adı ve büyük bir geri sayım (gün:saat:dk; son saatte saniye ve aciliyet rengi). Altında "2× puan · QR geri bildirim + tüketim" bilgi çipleri ve "Nasıl çalışır?" açılır paneli (tavan dahil).
2. **Kişisel kazanç şeridi:** "Bu etkinlikte +340 ekstra puan" (analytics'ten türetilir).
3. **Görev merdiveni:** Kademeli ilerleme (halka veya segmentli çubuk), her kademede ödül önizlemesi (puan + rozet küçük resmi). Tamamlanmamışsa birincil CTA, tamamlanmışsa otomatik verilmiş ödül rozeti.
4. **Topluluk kartı:** Tamamlayanların yüzdesi ve squad toplu ilerlemesi.
5. **Takvim:** Yaklaşan etkinlik(ler) ("Hatırlat" düğmesi push aboneliğine bağlı) ve geçmiş etkinlikler ile kazanımlar.

**Motion / 3D (ölçülü):**
- Giriş animasyonları mevcut haliyle (y:12 fade) kalabilir, ancak `useReducedMotion` ile kapatılabilmeli.
- İlerleme artışında çubuk `spring` ile dolmalı. Bu animasyon yalnızca değer değiştiğinde (önceki ziyaretle fark) oynamalı, her yüklemede değil.
- Ödül anında: puan ödülü için mevcut kutlama/konfeti deseni; rozet ödülü varsa projedeki rozet reveal (küre/maskot) bileşeni yeniden kullanılmalı. Yeni bir three.js sahnesi **eklenmemeli**; bu sayfa bilgi odaklı, 3D maliyetine değmez.
- Son 1 saatte geri sayım çipinde hafif bir nabız animasyonu (reduced-motion'da statik renk).

**Veri / API değişiklikleri:**
- `GET /api/customer/seasonal-event` → `{ active: Event[], upcoming: EventSummary[], past: PastEvent[] }`. Her `Event` şu alanları içermeli: `appliesTo[]`, `endDate` (istemci hesaplasın), `challenge.tiers[]`, `challenge.rewardBadge { id, name, imageUrl }`, `claimDeadline`, `personalBonusEarned`.
- `POST` → body `{ campaignId, tier }`. Talep penceresi `endDate + grace`. Ödül otomatik verilecekse bu endpoint yalnız "eksik talep onarımı" olarak kalmalı.
- Otomatik ödül: oyun tamamlama ve `ConsumptionReview` oluşturma yollarına `tryAwardSeasonalChallenge(tx, userId)` eklenmeli (atomik, unique korumalı), kampanya bitiminde de cron süpürmesi yapılmalı (fail-closed, `points_credited` yazar).
- Admin: challenge alt nesnesi + rozet FK + başladıktan sonra kilit + kullanıcı önizlemesi.
- `conditions` değerlendiricisi (`userId` alır) ve çoğul aktif kampanya.
- Redis önbelleği: global aktif/yaklaşan liste 60 s TTL, admin yazımında invalidate.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/campaigns`** (`app/customer/campaigns/page.tsx:48`, `/api/happy-hour`): Bu sayfa da zaman pencereli puan çarpanlarını (Happy Hour) gösteriyor. Kullanıcı gözünden "şu an hangi çarpanlar aktif?" sorusu iki sayfaya bölünmüş durumda. Ayrıca puan zincirinde VIP → sezonsal → global çarpan birlikte uygulanıyor (`app/api/feedbacks/route.ts:314-316`), ama hiçbir sayfa bu zinciri bütün olarak göstermiyor.
- **`/customer/quests`** (`app/customer/quests/page.tsx:200`, `/api/gamification/quests`): Etkinlik görevi kavramsal olarak "zaman-sınırlı bir görev". Ayrı bir sayfada tek bir görev göstermek, görev sisteminin parçalanmasına yol açıyor.
- **SeasonalConcept** (`prisma/schema.prisma:1877+`, `components/seasonal/seasonal-concept-applier.tsx`): Dönemsel tema/banner sistemi de bir "etkinlik" kavramı taşıyor ve `bonusMultiplier` alanı var. Bu alanın puan hesaplarında kullanılmadığı grep ile görüldü (yalnız admin/core/settings dosyalarında geçiyor). Admin tarafında iki paralel "sezonluk" sistemi var; müşteri bu sayfada konsept banner'ını görmüyor.

**Öneri:** `/customer/event`, `/customer/campaigns` (Happy Hour) ve quests içindeki zaman-sınırlı görevler tek bir **"Etkinlikler" merkezinde** birleşmeli. Üstte "Şu an aktif çarpanlar" (Happy Hour + sezonluk + VIP, uygulanma yerleriyle) dursun; altında etkinlik görev merdiveni ve takvim yer alsın. `/customer/event` rotası yeni merkeze yönlendirilmeli (`redirect`). Kenar çubuğundaki `event_center` anahtarı korunmalı ki görünürlük ayarları bozulmasın. Admin tarafında da `SeasonalCampaign` ile `SeasonalConcept` tek bir "Sezon" varlığı altında (tema + çarpan + görev) birleştirilmeli; ayrı tutulacaksa en azından konseptin `bonusMultiplier` alanı kaldırılmalı ya da gerçekten uygulanmalı.

---

## Doğrulama (şüpheci inceleme)

Okunan kaynaklar: `app/customer/event/page.tsx`, `app/api/customer/seasonal-event/route.ts`, `app/api/admin/seasonal-campaigns/route.ts`, `app/admin/seasonal-campaigns/page.tsx` (grep), `lib/seasonal-event-core.ts`, `lib/seasonal-campaign-live.ts`, `lib/api-http.ts`, `lib/prisma.ts`, `prisma/schema.prisma` (SeasonalCampaign, SeasonalChallengeClaim, UserBadge, datasource), `app/api/gamification/badges/[id]/route.ts`. Veritabanına bağlanılmadı; canlı Neon'da elle yazılmış challenge verisi olup olmadığı **doğrulanmadı**.

| # | İddia | Karar | Not |
|---|---|---|---|
| 1 | Etkinlik görevi uçtan uca ölü (admin API alanları atıyor) | **DOĞRULANDI** | `createSchema` (`app/api/admin/seasonal-campaigns/route.ts:15-27`) challenge alanlarını içermiyor; zod 3 (`package.json:104`) varsayılan `strip` modunda bilinmeyen anahtarları sessizce atar. `POST` `create` verisi alanları tek tek yazıyor (`:70-84`), `PUT` ise `...rest` ile yalnız parse edilmiş alanları geçiriyor (`:113-122`). Repo genelinde `seasonalCampaign.create/update` yalnız bu iki satırda (grep); `challengeType` yazan kod, seed, script ya da migration yok (`prisma/migrations` içinde challenge sütunu yok — alanlar büyük olasılıkla `db push` ile eklendi). Admin sayfasında da challenge alanı yok. Yeniden üretim: admin panelinden ya da `PUT {id, challengeType:'games_played', challengeGoal:5}` isteğiyle kampanya güncellenir → 200 döner ama sütunlar `null` kalır → `parseChallengeSpec` `null` (`lib/seasonal-event-core.ts:26`) → GET `challenge: null` → kart (`page.tsx:140`) hiç render edilmez. Etki veri kaybı değil, işlev kaybı; KRİTİK yerine YÜKSEK daha isabetli bir derece olur, ancak kök neden ve diğer üç bulgunun "latent" olmasının sebebi bu. |
| 2 | Etkinlik bitince hak edilmiş ödül talep edilemiyor | **DOĞRULANDI (latent)** | `POST` her zaman `getActiveSeasonalCampaign(now)` üzerinden çalışıyor (`route.ts:121-124`); bu fonksiyon `endDate >= now` ve `isActive` ister (`lib/seasonal-campaign-live.ts:45-50`). `endDate` sonrasında 400 "Aktif etkinlik yok." döner, GET de `{active:false}` verip kartı gizler; otomatik verme yolu da yok (`seasonalChallengeClaim` yalnız `route.ts:146`'da yazılıyor). Ek senaryo (denetçinin atladığı): kampanya süresi içinde **daha yüksek çarpanlı** ikinci bir kampanya aktifleşirse POST yanlış kampanyayı hedefler (`orderBy multiplier desc`, `:51`), ilk kampanyanın görevi yine talep edilemez; admin `isActive:false` yaparsa da aynı sonuç. Yeniden üretim: kampanya `endDate = T`, kullanıcı T-1 saatte hedefe ulaşır, T+1 saatte "Ödülü al" der (sayfa açık kaldıysa buton görünür, `page.tsx:61-65` sayaç 0'da yenilemiyor) → 400. Şu an canlıda etkisi #1 yüzünden sıfır; #1 düzeltildiği anda gerçek kullanıcı kaybına dönüşür, bu yüzden #1 ile aynı PR'da çözülmeli. |
| 3 | `challengeRewardBadgeId` FK'siz; geçersiz id kalıcı 500 | **DOĞRULANDI (latent)** | `schema.prisma:1848` düz `String?`, ilişki yok; `datasource`'ta `relationMode` yok (`schema.prisma:9-16`) → Postgres'te `UserBadge.badgeId` gerçek FK (`:637-638`). `createMany({skipDuplicates:true})` `ON CONFLICT DO NOTHING` üretir; bu yalnız unique çakışmasını yutar, FK ihlalini (P2003) yutmaz. P2003 `isPrismaConnectivityError` listesinde değil (`lib/prisma.ts:30`) → 500 "Ödül talep edilemedi" (`route.ts:181-186`), tx geri alındığı için claim yazılmaz ve her denemede tekrar eder. Rozet silme yolu mevcut: `app/api/gamification/badges/[id]/route.ts:127` `badge.delete` kampanyadaki id'yi temizlemiyor. Yeniden üretim: challenge'lı kampanyaya rozet id'si yazılır → admin o rozeti siler → hedefi tamamlayan herkes kalıcı 500 alır, puan da verilmez. Bugün yalnız DB'ye elle yazılırsa tetiklenir (#1); derece YÜKSEK yerine ORTA, ama #1 düzeltmesinde FK + admin doğrulaması birlikte gelmezse YÜKSEK'e çıkar. |
| 4 | Hata yanıtı boş durum olarak gösteriliyor | **DOĞRULANDI (derece abartılı)** | `page.tsx:47-54` `r.ok` kontrol etmiyor; 503 gövdesi `{error, code, retryable}` (`lib/api-http.ts:20-27`) `setData`'ya yazılıyor, `data.active` `undefined` → `page.tsx:92` boş durum "Şu an aktif etkinlik yok". 401/500'de de aynı; JSON olmayan gövdede `.catch(() => {})` → `data=null` → yine boş durum. **Ek nüans:** yalnız istemci düzeltmesi yetmez — `getActiveSeasonalCampaign` tüm hataları yutup `null` döndürüyor (`lib/seasonal-campaign-live.ts:65-67`), dolayısıyla DB ilk sorguda erişilemezse GET **200 `{active:false}`** döner; 503 yalnız sonraki `findUnique`/`count` adımında oluşursa görülür. Doğru çözüm: route içinde ayrı, hata fırlatan bir okuma (veya helper'a `throwOnError` seçeneği) + istemcide `loading/error/empty/active` durum makinesi ve "Tekrar dene". Etki yanlış bilgi gösterimi; para/veri kaybı yok → YÜKSEK değil ORTA. |

**Özet:** Dört iddianın dördü de kod düzeyinde doğru. Ancak #2 ve #3 bugün canlıda tetiklenemiyor, çünkü #1 nedeniyle challenge verisi uygulama üzerinden oluşturulamıyor. Bu iki bulgu #1'in düzeltmesinin **ön koşulu** olarak ele alınmalı: admin challenge alanları, rozet FK + varlık doğrulaması ve `campaignId` hedefli, bitiş sonrası grace süreli (tercihen otomatik) talep tek bir değişiklik setinde gelmeli. #4, sunucu tarafındaki hata yutmayla birlikte düzeltilmeli.
