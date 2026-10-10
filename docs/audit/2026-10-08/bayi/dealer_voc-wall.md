# /dealer/voc-wall

**Amaç:** Bayinin müşteri sesini (son geri bildirimler, ortalama puan, duygu/puan dağılımı, 7 günlük trend) tek ekranda görmesi ve "TV modu" ile şube içinde bir ekrana yansıtabilmesi (API başlığındaki adıyla "madde 50: şube içi canlı müşteri sesi panosu", `app/api/dealer/voc-wall/route.ts:1-4`).

**Genel puan: 5/10** · **Karar: yeniden tasarla.** Asıl farklı değer "mağaza içi müşteri sesi ekranı" fikrinde. Ama bugünkü sayfa bu değeri güvenli ve gerçekten canlı biçimde sunmuyor. Analitik kısmı da Dashboard, Analytics ve Feedbacks sayfalarındaki göstergeleri tekrarlıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Veri doğru çekiliyor, ancak TV modu her 20 saniyede tüm sayfayı iskelete çeviriyor, 7 günlük trend grafiği çubuk çizmiyor, moderasyon ve filtre de yok. |
| UX | 4/10 | Aynı 50 yorum üç kez gösteriliyor (ticker, şerit, duvar). "TV modu" gerçek bir sunum modu değil. Sayfa ne tam analiz ekranı ne de tam ekran sunumu. |
| Görsel | 6/10 | Kartlar, renk kodlu kenar çizgileri ve gradyanlar düzgün. Ancak üst üste iki sonsuz marquee, kayan parlama ve 50 nabız noktası ekranı kalabalıklaştırıyor. |
| Mimari | 5/10 | Tek route ve 7 paralel sorgu var, Redis önbelleği de makul. Buna karşılık yetki STAFF'ı dışlıyor, modül kapısı uygulanmıyor, API Türkçe metin üretiyor ve AI alanları gönderilip kullanılmıyor. |
| Performans | 6/10 | Yanıt 45 saniye önbellekleniyor. 7 günlük trend için 5000 satır JS'te gruplanıyor. Her yenilemede 50 kartın giriş animasyonu baştan oynuyor. Sonsuz animasyon sayısı yüksek. |
| Erişilebilirlik + mobil | 4/10 | Kayan içerik için duraklatma kontrolü yok (WCAG 2.2.2). Grafiklerin metin karşılığı yok. `Link > Button` iç içe etkileşimli öğe oluşturuyor. Mobilde şerit kartları `90vw` genişliğinde. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (başlık/açıklama) | KISMİ | `app/dealer/voc-wall/layout.tsx:4-6`, `messages/tr.json` → `layoutMetadata.dealerVocWallDescription` | Açıklama "temalar, alıntılar ve öncelik sinyalleri" diyor, ancak sayfada tema ya da öncelik sinyali yok. |
| 2 | Yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:321-337` | İlk açılışta doğru. Ancak her yenilemede de devreye giriyor (bkz. #7). |
| 3 | Hata durumu + "Yenile" | KISMİ | `page.tsx:298-307`, `339-359` | `r.ok` kontrol edilmiyor. 401/403/400 yanıtında `j.voc` olmadığı için veri sessizce eski kalıyor ve toast çıkmıyor. Toast yalnızca ağ hatasında görünüyor. |
| 4 | Hero (eyebrow, başlık, açıklama, ikon) | ÇALIŞIYOR | `page.tsx:372-377` | `DashboardPageHero` paylaşılan bileşen. |
| 5 | "X herkese açık geri bildirim" çipi | KISMİ | `page.tsx:378-382`; `route.ts:89`; `lib/validations.ts:109` (`isPublic default(true)`); `app/api/feedbacks/route.ts:250` | `isPublic` hiçbir arayüzde `false` yapılamıyor, dolayısıyla "herkese açık" sayısı fiilen toplam sayıya eşit ve yanıltıcı. |
| 6 | TV modu düğmesi | KISMİ | `page.tsx:385-397`, `371`, `419` | Yalnızca boşluğu (`space-y-10`), ticker öğe sayısını (18 → 24) ve otomatik yenilemeyi değiştiriyor. Tam ekran, sidebar/header gizleme, büyük tipografi ya da imleç gizleme yok. |
| 7 | TV modu 20 saniyelik otomatik yenileme | BOZUK | `page.tsx:298-300`, `313-319`, `321` | `fetchData` her çağrıda `setLoading(true)` yapıyor ve sayfa tamamen iskelete dönüyor. TV ekranı 20 saniyede bir yanıp sönüyor ve tüm giriş animasyonları yeniden oynuyor. |
| 8 | "Yenile" düğmesi | KISMİ | `page.tsx:398-406`; `route.ts:35-38` | Aynı iskelet yanıp sönmesi var. Redis 45 saniyelik önbellek (`route.ts:147`) nedeniyle çoğu zaman aynı veri dönüyor ve kullanıcıya "önbellekten" bilgisi verilmiyor. |
| 9 | "Tüm geri bildirimler" bağlantısı | ÇALIŞIYOR | `page.tsx:407-414` | `asChild` ile doğru kullanılmış. |
| 10 | LiveTicker (üst kayan bant) | KISMİ | `page.tsx:196-234` | Duraklatma kontrolü yok. API `locationName` için her zaman `'—'` döndürdüğünden (`route.ts:134`) `locationFallback` ("Genel") hiçbir zaman devreye girmiyor ve ekranda "—" görünüyor. |
| 11 | LiveFeedStrip ("Canlı feed" kartı) | KISMİ | `page.tsx:236-289`, `420` | Ticker'la aynı veriyi ikinci kez kaydırıyor. Mobilde kart genişliği `w-[90vw]` (`:268`), arka planda sonsuz parlama var (`:243-247`). |
| 12 | İstatistik: Ortalama puan | KISMİ | `page.tsx:429-439`; `route.ts:64-68` | Tüm geri bildirimler üzerinden hesaplanıyor, puan dağılımı ise yalnızca public kayıtlardan (`route.ts:77-81`). Dönem ve önceki dönemle kıyas yok. |
| 13 | İstatistik: Toplam geri bildirim | ÇALIŞIYOR | `page.tsx:440-450`; `route.ts:67` | |
| 14 | İstatistik: Son 24 saat | ÇALIŞIYOR | `page.tsx:451-461`; `route.ts:43-44`, `69-71` | |
| 15 | İstatistik: Pozitif oran | KISMİ | `page.tsx:470-472` ile `57-72` | Kart `Math.round` kullanıyor, donut ise `normalizeTriplet`. Aynı ekranda 1 puanlık fark görülebilir. Temel kitle public kayıtlar, ortalama puan ise tüm kayıtlar. |
| 16 | Duygu (sentiment) donut grafiği | ÇALIŞIYOR | `page.tsx:74-141`, `481-496` | Bilinmeyen sentiment anahtarları API'de sayılıyor (`route.ts:96-97`) ama UI'a ulaşmıyor. SVG'de `role`/`aria-label` yok. |
| 17 | Puan dağılımı çubukları | ÇALIŞIYOR | `page.tsx:143-168`, `497-510` | Yüzdeler normalize edilmediğinden toplam %99 ya da %101 olabilir (küçük sorun). |
| 18 | Son 7 gün trend grafiği | BOZUK | `page.tsx:170-194`; `route.ts:106-120` | Renkli çubuk `div`'inin yüksekliği yok (`min-h-[4px]`, `:185-188`), bu yüzden her gün 4 px'lik bir çizgi olarak çiziliyor. Animasyonlu yükseklik görünmez kolona uygulanıyor, gün etiketleri ortak bir taban çizgisinde durmuyor. Gün sınırları UTC'ye göre (`toISOString`, `:109`, `:117`). Etiketler her dilde `tr-TR` (`:118`). |
| 19 | Trend çubuğu ipucu (title) | KISMİ | `page.tsx:187` | Yalnızca 4 px'lik öğede, fareyle neredeyse yakalanamıyor. Dokunmatik ekranda hiç çalışmıyor. |
| 20 | Duvar başlığı ve alt başlık | ÇALIŞIYOR | `page.tsx:529-537` | |
| 21 | Duvar kartları (yıldız, duygu rozeti, zaman, metin, müşteri adı, şube) | KISMİ | `page.tsx:553-622`; `route.ts:47-63`, `133` | Müşterinin tam adı gösteriliyor. `isToxic`, `trustFlagged` ve `fraudScore` filtrelenmiyor. AI etiketleri gösterilmiyor. Bayi yanıtı yok. |
| 22 | "Canlı" iddiası (nabız noktaları, "Canlı feed") | SAHTE | `page.tsx:592-596`, `253`; `route.ts:147` | Veri anlık görüntüden ibaret. Normal modda hiç yenilenmiyor, TV modunda 20 sn yoklama ile 45 sn önbellek var. Nabız animasyonu yalnızca süs. Projede SSE altyapısı var (`components/dashboard/realtime-notifications.tsx:7`) ama burada kullanılmıyor. |
| 23 | Boş durum + "Geri bildirimlere git" | KISMİ | `page.tsx:539-551` | `<Link><Button/></Link>` yapısı `<a><button>` iç içe etkileşimli öğe üretiyor (geçersiz HTML, çift odak). Diğer yerlerde `asChild` kullanılmış. |
| 24 | Kart hover yükselmesi | ÇALIŞIYOR | `page.tsx:481`, `497`, `511`, `575` | Yalnızca süs. Kart tıklanamadığı için yanlış bir "tıklanabilir" ipucu veriyor. |
| 25 | AI alanları (`intent`, `topics`, `themes`) | EKSİK | `route.ts:56-58`, `129-131`; `page.tsx:34-36` | Her istekte gönderiliyor ama UI hiçbirini kullanmıyor (ölü yük). Tema/konu bulutu ve "şikâyet/öneri/övgü" ayrımı en değerli VoC sinyali olurdu. |
| 26 | Moderasyon (yorumu duvardan gizleme/sabitleme, en düşük puan eşiği) | EKSİK | — | Sayfada ve API'de yok. |
| 27 | Şube/QR filtresi | EKSİK | `route.ts:40` | Tüm QR'lar birlikte gösteriliyor. Çok şubeli bayi belirli bir şubenin TV'si için filtre seçemiyor. |
| 28 | Dönem seçimi (7/30/90 gün) | EKSİK | `route.ts:84` | Trend 7 güne sabit, diğer metrikler tüm zamanlar. |
| 29 | Yetki: DEALER / ADMIN | KISMİ | `route.ts:14-30` | IDOR yok, DEALER yalnızca kendi verisini görüyor. ADMIN için `dealerId` parametresi gerekiyor ama sayfa bunu hiç göndermiyor (`page.tsx:300`), dolayısıyla admin hata ekranı görür. |
| 30 | Modül kapısı (`voc_wall`) | KISMİ | `lib/module-controls.ts:36`; `components/dashboard/sidebar.tsx:264`; route'ta `assertModuleEnabled` yok (`lib/module-gate.ts:92`) | Modül kapatılınca yalnızca menüden gizleniyor. URL ve API çalışmaya devam ediyor. |
| 31 | Personel (STAFF) erişimi / kiosk cihaz oturumu | EKSİK | `route.ts:14`; `lib/api-auth.ts:15` | TV'yi yalnızca bayi sahibi hesabı açabiliyor. Şubedeki ekran için salt-okunur ekran bağlantısı ya da personel erişimi yok. Bunun bilinçli bir karar olup olmadığı doğrulanmadı. |
| 32 | Çok dilli metinler | KISMİ | `route.ts:118` (`tr-TR`), `:133` (`'Anonim'`), `:134` (`'—'`), `:21`, `:27` (TR hata metinleri); `messages/tr.json` → "Sentiment dağılımı", "public geri bildirim", "Canlı feed" | EN arayüzde Türkçe gün adları ve "Anonim" görünüyor. TR arayüzde İngilizce kelimeler karışıyor. Rozette "Olumlu", donutta "Pozitif" yazıyor. |
| 33 | Azaltılmış hareket desteği | KISMİ | `components/providers.tsx:232` (`MotionConfig reducedMotion="user"`); `page.tsx:594` | Transform animasyonları (marquee, kayma) kapanıyor. Nabız noktasının opacity döngüsü sürüyor. Hareket tercihi açık olmayan kullanıcıya duraklatma imkânı yok. |
| 34 | Sunucu önbelleği (Redis, 45 sn) | ÇALIŞIYOR | `route.ts:34-38`, `147` | Yeni geri bildirim geldiğinde ya da kayıt silindiğinde önbellek temizlenmiyor (anahtar başka yerde yok). |
| 35 | Mobil yerleşim | KISMİ | `page.tsx:268`, `427`, `480`, `553` | Istatistik ızgarası `sm:grid-cols-3` olduğundan 4. kart tek başına alt satıra düşüyor. Şerit kartı neredeyse ekran genişliğinde. Duvar tek sütuna doğru şekilde iniyor. |

**Sayım:** ÇALIŞIYOR 10 · KISMİ 17 · BOZUK 2 · SAHTE 1 · EKSİK 5 (toplam 35)

---

## Bulgular

### 1. [YÜKSEK · Güvenlik/Veri gizliliği] Mağaza TV'sinde müşterinin tam adı ve filtresiz (toksik/sahte) yorumlar gösteriliyor
- **Kanıt:** `route.ts:40-41` (filtre yalnızca `deletedAt: null, isPublic: true`), `route.ts:60`, `133` (`user.name`); `page.tsx:606-609`; `prisma/schema.prisma` Feedback modelinde `isToxic`, `trustFlagged`, `fraudScore` alanları var ama route kullanmıyor. `isPublic` için müşteriye gösterilen bir onay seçeneği yok (`lib/validations.ts:109` varsayılan `true`, `app/api/feedbacks/route.ts:250`).
- **Sorun:** Sayfa açıkça "Bayi TV çıkışı için" (`liveFeedDescription`). Müşteri yorum yazarken bunun mağazadaki bir ekranda adıyla yayımlanacağına onay vermiyor (KVKK açısından açık rıza ve amaç sınırlaması riski). AI'ın toksik bulduğu, güven sinyali düşük ya da sahte olma ihtimali yüksek yorumlar da duvara ve kayan banda düşüyor. Küfürlü bir yorumun ya da bir personeli adıyla hedef alan bir şikâyetin mağaza ekranında dönmesi doğrudan itibar zararı demek.
- **Öneri:**
  1. **Yayın filtresi (sunucuda):** `isToxic: false`, `trustFlagged: false`, `fraudScore < eşik` koşullarını ekle ve bayinin ayarlayabileceği en düşük puan eşiği (ör. "TV'de yalnızca 4★ ve üstü") tanımla.
  2. **Ad maskeleme:** Ekranda "Ayşe K." biçiminde baş harf veya yalnızca ad göster. Tam ad hiçbir zaman istemciye gitmesin; maskeleme sunucuda yapılsın.
  3. **Onay:** Geri bildirim formuna "Yorumum işletmede anonim olarak gösterilebilir" seçeneği ekle ve `isPublic` alanına gerçek bir anlam kazandır.
  4. **Moderasyon kuyruğu:** `Feedback`'e `wallStatus` (`auto | pinned | hidden`) alanı ekle. Bayi yorumu duvardan gizleyebilsin ya da sabitleyebilsin.
- **Efor:** M

### 2. [YÜKSEK · Hata] TV modu ve "Yenile" her seferinde tüm sayfayı iskelete çeviriyor
- **Kanıt:** `page.tsx:298-300` (`setLoading(true)`), `313-319` (20 sn `setInterval`), `321-337` (`if (loading) return <skeleton>`).
- **Sorun:** TV modunun temel işi kesintisiz yayın. Oysa her 20 saniyede ekran yaklaşık bir saniye griye dönüyor, marquee başa sarıyor ve 50 kartın kademeli giriş animasyonu (`:574`, son kartta yaklaşık 1,8 sn gecikme) yeniden oynuyor. Sonuç olarak ekran sürekli titriyor.
- **Öneri:** "İlk yükleme" (`isInitialLoading`) ile "arka planda yenileme" (`isRefreshing`) durumlarını ayır. Yenilemede eski veri ekranda kalsın, yalnızca küçük bir yenileme göstergesi dönsün. Bunun için projedeki desen olan SWR/React Query (`keepPreviousData`) kullanılabilir. Yeni gelen yorumlar `AnimatePresence` ile listenin başına tek tek eklensin, var olan kartlar yeniden animasyon oynatmasın (kartlarda `id` tabanlı `key` zaten var). `r.ok` kontrolü ve 4xx/5xx durumları için ayrı mesaj da ekle.
- **Efor:** S

### 3. [YÜKSEK · Hata/Görsel] 7 günlük trend grafiği çubuk çizmiyor, gün sınırı ve dil yanlış
- **Kanıt:** `page.tsx:175-190`: animasyonlu `height` çubuğa değil, flex kolonuna uygulanıyor. Gerçek renkli `div`'in yüksekliği yok, `flex-grow` yok, yalnızca `min-h-[4px]` var. Sunucu tarafında `route.ts:109` ve `117` `toISOString().slice(0,10)` (UTC gün), `route.ts:118` sabit `'tr-TR'` ve sunucu saat dilimi kullanıyor.
- **Sorun:** (a) CSS akışına göre her gün yalnızca 4 px'lik bir çizgi olarak çiziliyor. Sayı ve gün etiketi kolon yüksekliğine göre yukarı aşağı kayıyor, ortak bir taban çizgisi yok. 0 olan günlerde kolon yüksekliği 0 olduğundan içerik kabın altına taşıyor. Bu sonuç ekran görüntüsüyle doğrulanmadı; CSS kurallarından çıkarıldı. (b) Türkiye UTC+3 olduğundan 00:00–03:00 arası gelen geri bildirimler bir önceki güne yazılıyor. (c) EN arayüzde gün adları Türkçe çıkıyor.
- **Öneri:** Çubuğu kolonun içinde `flex-1 flex flex-col justify-end` yapısına koy ve `height`'ı çubuğun kendisine uygula. Etiketleri sabit bir alt satırda tut. Daha iyisi, projenin diğer sayfalarında kullanılan grafik altyapısına taşı (dashboard/analytics) ve `role="img"` ile bir özet `aria-label` ekle. Sunucuda günlere bölmeyi bayinin saat dilimiyle yap (`date_trunc('day', "createdAt" AT TIME ZONE 'Europe/Istanbul')` ile `$queryRaw` + `GROUP BY`). Bu, 5000 satırlık JS taramasını da ortadan kaldırır (`route.ts:83-88`). Gün etiketini istemcide `Intl.DateTimeFormat(locale)` ile üret ve API'den yalnızca `date` döndür.
- **Efor:** S–M

### 4. [ORTA · UX/Bilgi mimarisi] Aynı içerik üç kez gösteriliyor, sayfanın kimliği belirsiz
- **Kanıt:** `page.tsx:419` (LiveTicker, 18/24 öğe), `420` (LiveFeedStrip, 12 öğe × 2), `553-622` (duvar, 50 öğe). Üçü de `voc.recent`'i kullanıyor.
- **Sorun:** Kullanıcı aynı yorumları önce üst bantta, sonra "Canlı feed" kartında, sonra duvarda görüyor. Bunun arasına analitik kartları (istatistik, donut, puan, trend) giriyor. Ortaya ne TV'de uzaktan okunabilen bir ekran ne de derinlemesine bir analiz ekranı çıkıyor. Analitik kısmı zaten Dashboard, Analytics ve AI Insights sayfalarında daha zengin biçimde var (`app/dealer/dealer-dashboard-client.tsx`, `app/dealer/analytics/analytics-client.tsx` de dağılım ve trend hesaplıyor).
- **Öneri:** Sayfayı iki bilinçli moda ayır: **(a) Yönetim görünümü:** duvar küratörlüğü (gizle/sabitle), yayın kuralları, şube seçimi, önizleme. **(b) Ekran (signage) görünümü:** ayrı bir route (`/dealer/voc-wall/display` ya da imzalı token'lı `/wall/[token]`), sidebar ve header olmadan tam ekran; tek bir büyük alıntı rotasyonu ile köşede ortalama puan ve QR çağrısı. Mevcut iki marquee'den birini kaldır.
- **Efor:** L

### 5. [ORTA · Mimari/Veri] Metriklerin paydası tutarsız, "public" kavramı anlamsız
- **Kanıt:** `route.ts:64-71` (ortalama, toplam ve 24 saat → `baseWhere`), `route.ts:72-81`, `89` (sentiment, puan dağılımı, public sayısı → `publicWhere`); `page.tsx:470-472` ile `57-72` arasındaki yuvarlama farkı.
- **Sorun:** `isPublic=false` hiç oluşmadığı için bugün sayılar tesadüfen tutarlı. Bulgu 1'deki onay mekanizması gelince "ortalama 4,6" (tümü) ile "5★ %70" (public) farklı kitleleri anlatmaya başlayacak. Pozitif oran kartı ile donut aynı oranı 1 puan farklı gösterebilir.
- **Öneri:** API sözleşmesini netleştir: `stats` (tüm geri bildirimler, analiz amaçlı) ile `wall` (yayınlanabilir alt küme) ayrı nesneler olsun. Yüzdeleri tek bir yardımcı fonksiyonla (`normalizeTriplet`) sunucuda hesapla ve istemciye hazır gönder.
- **Efor:** S

### 6. [ORTA · Güvenlik/Yönetişim] Modül kapısı yalnızca menüyü gizliyor
- **Kanıt:** `lib/module-controls.ts:36` (`voc_wall`), `components/dashboard/sidebar.tsx:264`, `329`, `412`; `route.ts` içinde `assertModuleEnabled` çağrısı yok (`lib/module-gate.ts:92` mevcut ve başka route'larda kullanılıyor).
- **Sorun:** Admin modülü kapattığında bayi URL'yi yazarak sayfayı ve API'yi kullanmaya devam edebiliyor.
- **Öneri:** Route başına `await assertModuleEnabled('voc_wall', { scope: 'dealer' })` ekle. Sayfa tarafında da kapalı modül için açıklayıcı bir boş durum göster.
- **Efor:** S

### 7. [ORTA · i18n] API kullanıcıya görünen Türkçe metin üretiyor, arayüzde TR/EN karışık
- **Kanıt:** `route.ts:118` (`'tr-TR'`), `133` (`'Anonim'`), `134` (`'—'`), `21`, `27`; `messages/tr.json` `dealerVocWall`: "Sentiment dağılımı", "En son public geri bildirimler", "Henüz public geri bildirim yok", "Canlı feed"; `page.tsx:558` rozet `feedback.positive` = "Olumlu", donut `dealerVocWall.sentimentPositive` = "Pozitif".
- **Sorun:** EN kullanıcı "Anonim" ve "Pzt/Sal" görüyor. `locationName` her zaman `'—'` geldiği için istemcideki "Genel"/"Merkez" yedekleri ölü kod (`page.tsx:223`, `274`). Aynı kavram aynı ekranda iki farklı kelimeyle geçiyor.
- **Öneri:** API kullanıcıya görünen metin üretmesin: `userName: null`, `locationName: null`, `isAnonymous: true` gibi ham veri dönsün, etiketleri istemci `t()` ile basın. TR metinlerini "Duygu dağılımı", "herkese açık", "Canlı akış" olarak düzelt ve tek bir duygu sözlüğü kullan.
- **Efor:** S

### 8. [ORTA · Erişilebilirlik] Duraklatılamayan kayan içerik, metin karşılığı olmayan grafikler, iç içe etkileşimli öğe
- **Kanıt:** `page.tsx:203-206`, `243-247`, `256-259` (sonsuz `x` animasyonu), `594-595` (her kartta sonsuz opacity döngüsü); `112` (SVG'de `role`/`title` yok); `545-549` (`<Link><Button>`).
- **Sorun:** WCAG 2.2.2 (Duraklat, Durdur, Gizle) beş saniyeden uzun otomatik hareket için kontrol istiyor. `MotionConfig reducedMotion="user"` (`components/providers.tsx:232`) yalnızca sistem tercihi açık olanlara yardımcı oluyor ve opacity döngüsünü durdurmuyor. Ekran okuyucu grafiklerden hiçbir şey alamıyor. `a > button` klavyede çift odak ve geçersiz HTML'ye yol açıyor.
- **Öneri:** Marquee için görünür bir "Duraklat" düğmesi ekle; hover ve focus'ta da otomatik dursun. Nabız noktalarını kaldır ya da tek bir "canlı" göstergesine indir. Grafiklere `role="img"` + `aria-label` (ör. "Olumlu %62, olumsuz %21, nötr %17") ekle ve `sr-only` bir veri tablosu koy. Boş durumda `Button asChild` kullan. Yeni yorum geldiğinde duyurmak için duvara `aria-live="polite"` bir bölge ekle.
- **Efor:** S

### 9. [DÜŞÜK · Performans/Ölü kod] Kullanılmayan AI alanları ve ağır 7 günlük tarama
- **Kanıt:** `route.ts:56-58`, `129-131` (`intent`, `topics`, `themes` → istemcide kullanılmıyor, `page.tsx:34-36`); `route.ts:83-88` (5000 satır `findMany`, JS'te gruplama); kullanılmayan `normalizeTriplet` dışı hesaplar; `User` ikonunda tutarsız boyut `h-3.5 w-3` (`page.tsx:607`, `612`).
- **Sorun:** 50 kayıtta `themes` JSON'u gereksiz yere taşınıyor. Önbellek kaçtığında trend sorgusu satır sayısıyla büyüyor.
- **Öneri:** Ya AI alanlarını UI'da kullan (Eksik özellikler bölümüne bkz.) ya da `select`'ten çıkar. Trend için tek bir `GROUP BY` SQL sorgusu kullan. Yeni geri bildirim geldiğinde `voc-wall:${dealerId}:*` anahtarını temizle (feedback POST içinde `redisDel`), böylece TTL kısaltılmadan da tazelik sağlanır.
- **Efor:** S

### 10. [DÜŞÜK · Mimari] Admin akışı ve TV için kimlik doğrulama modeli eksik
- **Kanıt:** `route.ts:18-24` (ADMIN için `dealerId` zorunlu); `page.tsx:300` (parametre gönderilmiyor); `route.ts:14` (STAFF hariç).
- **Sorun:** Bayi panelini açan bir admin her zaman hata ekranı görür. Şubedeki TV'yi açmak için bayi sahibinin tam yetkili oturumunu ortak bir cihazda açık bırakmak gerekiyor. Bu, kiosk senaryosu için büyük bir güvenlik açığı: ortak cihazda tüm bayi paneli erişilebilir oluyor.
- **Öneri:** Kısa ömürlü, iptal edilebilir, yalnızca okuma yetkili ekran token'ı üret (`DisplayToken { dealerId, qrCodeIds[], expiresAt, revokedAt }`) ve ekran görünümünü `/wall/[token]` üzerinden oturumsuz, salt-okunur ve rate-limit'li sun. Admin için sayfaya `?dealerId=` desteği ekle ya da admin rolünü açıkça yönlendir.
- **Efor:** M

---

## Eksik özellikler (kıyas ürünlerle)

1. **Yayın küratörlüğü ve moderasyon kuyruğu** (Yelp for Business ve Google Business Profile'daki "öne çıkan yorum" mantığı; Medallia ekranlarındaki onaylı alıntı akışı): yorumu sabitleme ya da gizleme, otomatik kural (en az ★, toksik değil, en az N karakter), yayın öncesi önizleme.
2. **Tema/konu ve niyet katmanı** (Qualtrics CX Text iQ, Medallia Text Analytics): `themes`/`topics` verisinden "en çok konuşulan 5 konu" ve olumlu/olumsuz ayrımlı tema kutucukları; `intent` ile şikâyet/öneri/övgü sekmesi. Veri zaten API'de var ama kullanılmıyor.
3. **Gerçek zamanlı akış**: mevcut SSE altyapısıyla (`realtime-notifications`) yeni yorumu anında duvara ekleme ve "yeni" vurgusu; yoklama + önbellek yerine itme modeli.
4. **Şube/QR ve dönem filtresi**: çok şubeli bayi için şube başına ekran, 7/30/90 gün seçimi, önceki dönemle kıyas (Δ ortalama puan, Δ olumlu oranı). Square ve Toast panellerinde lokasyon seçici standart.
5. **Gerçek signage modu**: tam ekran (Fullscreen API), imleç ve chrome gizleme, uzaktan okunabilir tipografi, ekran yönü (yatay/dikey) seçimi, rotasyon hızı ayarı, "puan ver" QR kodunu ekranda gösterme (dönüşüm döngüsünü kapatır), cihaz bazlı paylaşılabilir ekran bağlantısı.
6. **Kapanış döngüsü sinyali**: yorumda bayi yanıtı (`dealerReply`) varsa "İşletme yanıtladı" rozeti. Hem müşteriye hem personele "sesimiz duyuluyor" mesajı verir (Medallia closed-loop).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Müşteri Sesi" iki yüzlü bir ürün olmalı. Bayi, yönetim yüzünde duvarda neyin yayımlanacağını 30 saniyede belirler. Şubedeki ekran ise, bayi oturumu açık kalmadan, gerçek zamanlı ve güvenli bir "müşterilerimiz ne diyor" vitrini olur. Analitik derinlik bu sayfada tekrarlanmaz, Analytics/AI Insights'a bağlantı verilir.

**Yerleşim (yönetim görünümü, `/dealer/voc-wall`):**
- Üstte: şube seçici, dönem seçici, "Ekranı aç" (yeni sekme) ve "Ekran bağlantısı oluştur" (token, QR ile TV'ye aktarım) düğmeleri.
- Sol sütun (2/3): **Küratörlük listesi.** Her satırda yorum, maskeli ad, ★, AI tema çipleri ve otomatik kural sonucu ("Yayında", "Toksik: gizlendi", "Düşük puan: gizlendi") var; satır başına Sabitle / Gizle / Yanıtla eylemleri. Toplu işlem ve klavye kısayolları desteklenir.
- Sağ sütun (1/3): **Yayın kuralları** (en az ★, yalnızca yorum içerenler, ad gösterimi: yok / baş harf / ad), **canlı önizleme** (ekran görünümünün küçültülmüş hâli), **mini KPI** (ortalama puan ve olumlu oran, Δ ile; tek satır, grafik yok).

**Yerleşim (ekran görünümü, `/wall/[token]`):**
- Tam ekran ve koyu tema. Ortada tek büyük alıntı: 32–48 px tipografi, ★, maskeli ad, şube, göreli zaman. Alıntı her 8–10 saniyede bir değişir.
- Altta tek ince bant: son 24 saatteki yorum sayısı, ortalama puan ve "Siz de puan verin" QR kodu.
- Yeni yorum geldiğinde sıranın önüne alınır ve kısa bir "Yeni" vurgusu alır.

**Motion/3D:** 3B gerekli değil; burada metnin okunabilirliği önceliklidir. Alıntı geçişlerinde 400 ms'lik `opacity` + 8 px `y` çapraz geçişi (`AnimatePresence mode="wait"`) yeterli. Sonsuz marquee'ler, kayan parlama ve kart başına nabız noktaları kaldırılmalı. Tek bir "canlı" göstergesi kalsın: yalnızca SSE bağlıyken yanan küçük bir nokta. `prefers-reduced-motion` açıkken geçişler anlık olsun, rotasyon süresi uzasın. Yönetim görünümünde motion yalnızca durum geri bildirimi için kullanılsın (gizlenen satırın çökmesi, sabitlenen satırın yukarı kayması: `layout` animasyonu).

**Veri/API değişiklikleri:**
- `Feedback`'e `wallStatus` (`AUTO | PINNED | HIDDEN`) ve `wallConsent` alanlarını ekle; `DealerSettings`'e `wallRules` JSON alanını ekle.
- `GET /api/dealer/voc-wall?qrCodeId=&range=` yanıtı `{ stats, wallItems, themes, rulesPreview }` olsun. Sunucu tarafında `isToxic=false`, `trustFlagged=false`, `fraudScore<0.7` ve kurallar uygulansın, ad maskelensin, gün gruplaması bayinin saat dilimine göre SQL'de yapılsın.
- `PATCH /api/dealer/voc-wall/items/[id]` ile `wallStatus` güncellenebilsin; sahiplik `qrCode.dealerId === session.user.id` ile doğrulansın.
- `POST /api/dealer/voc-wall/display-tokens` ve `DELETE …/[id]` ile ekran token yaşam döngüsü yönetilsin. `GET /api/wall/[token]` oturumsuz, rate-limit'li olsun ve yalnızca yayınlanabilir alanları döndürsün.
- Yeni geri bildirim geldiğinde SSE kanalına `voc:new` olayı gönder ve `voc-wall:*` önbelleğini temizle.
- Route'a `assertModuleEnabled('voc_wall')` ekle.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer` (Dashboard), `/dealer/analytics`, `/dealer/ai-insights`:** Ortalama puan, duygu dağılımı, puan dağılımı ve günlük trend bu sayfalarda zaten var (aynı kavramlar `dealer-dashboard-client.tsx` ve `analytics-client.tsx` içinde de hesaplanıyor). VoC Wall'daki analitik kartlar bunların zayıf bir kopyası. Öneri: analitik bloğu kaldırıp tek satırlık mini KPI'ye indir ve Analytics'e bağlantı ver.
- **`/dealer/feedbacks` ve `/dealer/reviews`:** Yorum listeleme ve yanıtlama burada yapılıyor. VoC Wall'un yorum duvarı ayrı bir liste olarak değil, bu listelerin "yayın" boyutu olarak tasarlanmalı: Feedbacks satırına "Duvarda göster / gizle" eylemi eklenmeli ve küratörlük durumu tek bir kaynakta (`wallStatus`) tutulmalı.
- **Sonuç:** Sayfa **kaldırılmamalı**. Mağaza içi ekran, Qratex'i rakiplerden ayıran somut bir özellik. Ancak "analitik + üç kez tekrarlanan akış" karışımından çıkarılıp yukarıda tarif edilen **küratörlük + güvenli signage** ürününe dönüştürülmeli.

---

## Doğrulama (şüpheci inceleme)

Üç YÜKSEK bulgu da kod baştan okunarak çürütülmeye çalışıldı. Okunan dosyalar: `app/dealer/voc-wall/page.tsx`, `app/api/dealer/voc-wall/route.ts`, `prisma/schema.prisma` (Feedback modeli), `lib/validations.ts`, `app/api/feedbacks/route.ts`, `lib/inngest/feedback-analyze-pipeline.ts` ve `messages/tr.json`/`en.json`. Hiçbir komut, build ya da DB sorgusu çalıştırılmadı.

### Bulgu 1: Mağaza TV'sinde tam ad ve filtresiz toksik/sahte yorumlar
**Karar: DOĞRULANDI (YÜKSEK seviyesi yerinde).**
- `route.ts:40-41` yayın filtresinde yalnızca `qrCode.dealerId`, `deletedAt: null` ve `isPublic: true` var. Feedback modelinde `isToxic` (`schema.prisma:780`), `fraudScore` (`:822`) ve `trustFlagged` (`:826`) alanları bulunuyor ama route bunların hiçbirini kullanmıyor.
- `isPublic` müşteri ya da bayi tarafından kapatılamıyor. Repoda Feedback için `isPublic` atayan hiçbir arayüz yok; geçen tüm `isPublic` kullanımları bağış (donation) modülüne ait. Değer `lib/validations.ts:109` (`default(true)`) ve `app/api/feedbacks/route.ts:250` (`isPublic ?? true`) üzerinden her zaman `true` oluyor.
- `route.ts:60` ve `:133` `user.name` alanını olduğu gibi gönderiyor. `page.tsx:606-609` bu adı duvar kartında gösteriyor ve TV modu duvarı gizlemiyor. `User.name` serbest metin (`registerSchema` 2-50 karakter), bu yüzden çoğu kullanıcıda ad soyad yazıyor.
- Şemadaki yorum (`schema.prisma:824-825`) `trustFlagged` için "Sadece işaretle: bayi/admin görür" diyor. Oysa bu sayfa işaretli yorumu şubedeki herkese gösteriyor. Bu, şemada yazan politikayla da çelişiyor.
- **Yeniden üretim:** Oturum açmış "Ayşe Yılmaz" kullanıcısı bir QR üzerinden küfür içeren 1★ yorum gönderiyor. Pipeline yorumu `isToxic=true` olarak işaretliyor ve bayiye "Toksik İçerik Tespit Edildi" bildirimi gidiyor (`feedback-analyze-pipeline.ts:87-95`). Yorum yine de `isPublic=true` ve `deletedAt=null` olduğu için en fazla 45 sn içinde (`route.ts:147` önbellek TTL'i) TV modundaki duvarda "Ayşe Yılmaz" adıyla, ticker'da ve şeritte dönüyor.
- **Ek tespit (orijinal raporda yok):** Toksiklik analizi yorum oluşturulduktan **sonra** ve asenkron çalışıyor (`app/api/feedbacks/route.ts:460-494`). Bu sürede `isToxic` varsayılan `false` değerinde kalıyor. Yalnızca `isToxic: false` filtresi eklemek bu yüzden yeterli değil. Yayın filtresi "fail-closed" olmalı: ya `aiProcessedAt != null` (ya da en azından `aiModelUsed` dolu) koşulu aranmalı ya da yayından önce senkron `checkToxicityLocal` (`lib/ai-engine.ts:1011`) çalıştırılmalı.

### Bulgu 2: TV modu her 20 saniyede sayfayı iskelete çeviriyor
**Karar: DOĞRULANDI.**
- `page.tsx:298-299`: `fetchData` her çağrıda koşulsuz `setLoading(true)` yapıyor. `:313-319`: TV modunda 20 sn'lik `setInterval` aynı fonksiyonu çağırıyor. `:321-337`: `if (loading)` içeriğin yerine iskeleti döndürüyor.
- Sonuç olarak tüm ağaç unmount olup yeniden mount oluyor. Bu yüzden (a) ekran istek süresi boyunca iskelete dönüyor; Redis'ten gelen yanıtta bu bir "flaş", soğuk istekte yaklaşık 1 sn sürüyor. (b) `LiveTicker` ve `LiveFeedStrip` marquee'leri `x: 0%` noktasından yeniden başlıyor. (c) 50 kartın kademeli giriş animasyonu (`:574`, `0.3 + i*0.03` sn gecikme) baştan oynuyor. `kioskMode` üst bileşende tutulduğu için kaybolmuyor, yani döngü kendiliğinden durmuyor.
- "Yenile" düğmesi (`:403`) ve hata ekranındaki düğme (`:352`) de aynı `fetchData`'yı çağırıyor ve aynı davranışı gösteriyor.
- **Yeniden üretim:** Bayi `/dealer/voc-wall` sayfasını açıp "TV modu"na basıyor. 20 sn sonra ve ardından her 20 sn'de bir ekran gri iskelete dönüyor, sonra tüm kartlar yeniden aşağıdan kayarak geliyor.
- Raporda önerilen çözüm (ilk yükleme ve arka plan yenilemesini ayırmak, eski veriyi ekranda tutmak) doğru.

### Bulgu 3: 7 günlük trend grafiği çubuk çizmiyor, gün sınırı UTC'ye göre, etiketler Türkçe
**Karar: DOĞRULANDI. Seviye bence ORTA, çünkü veri kaybı ya da güvenlik etkisi yok; ancak görsel bozukluk ve yanlış gün ataması gerçek.**
- **(a) Çubuk:** `page.tsx:177-183`'teki animasyonlu `height`, `flex flex-col items-center` olan kolon `Motion.div`'ine uygulanıyor. İçerideki renkli `div`'de (`:185-188`) yalnızca `w-full ... min-h-[4px]` var; `height`, `flex-1` ya da `grow` yok. Bu yüzden çubuk her gün için 4 px kalıyor. Kolonda `justify-end` olmadığı için içerik (`order` sırası: çubuk → sayı `order-1` → etiket `order-2`) kolonun **üst** kenarından başlıyor. Üst kap ise `items-end h-24` (`:175`); kolon yüksekliği değiştikçe çizgi, sayı ve etiket dikeyde kayıyor, ortak bir taban çizgisi oluşmuyor. Sayısı 0 olan gün `height: 0%` alıyor ve içeriği yaklaşık 40 px boyunca kabın altına taşıyor (taşma `overflow` ile kesilmiyor, CardContent `h-[210px]` içinde görünür kalıyor). Grafik fiilen "yüksekliği sayıya göre kayan 4 px'lik çizgiler" olarak çiziliyor. Bu sonuç CSS kurallarından kesin olarak çıkıyor; ekran görüntüsüyle ayrıca doğrulanmadı.
- **(b) UTC:** `route.ts:109` ve `:117` `toISOString().slice(0,10)` ile günü UTC'ye göre ayırıyor. Repoda `TZ` ayarı bulunmadı (`next.config.*`, `vercel.json` tarandı); Vercel fonksiyonları varsayılan olarak UTC'de çalışıyor. TR saatiyle 00:00-02:59 arası (UTC+3) gelen geri bildirimler bir önceki güne sayılıyor. Örnek: Salı 01:30 TR'de gelen yorum Pazartesi çubuğuna gidiyor. Gece açık olan işletmelerde (bar, kafe) bu kayma belirgin olur.
- **(c) Dil:** `route.ts:118` sabit `'tr-TR'` ile `label` üretiyor ve istemci bunu doğrudan basıyor (`page.tsx:184`). EN arayüzde "Pzt/Sal" görünüyor. Önbellek anahtarı (`route.ts:36`) dilden bağımsız olduğu için sunucuda dile göre etiket üretmek de çözüm olmaz; etiket istemcide `Intl.DateTimeFormat(locale)` ile üretilmeli.
- **Yeniden üretim:** Son 7 günde farklı sayılarda geri bildirim alan bir bayi kartı açıyor. Cyan çubuk yerine her günde ince bir çizgi görüyor, gün etiketleri farklı yüksekliklerde duruyor. Dil EN'e çevrildiğinde gün adları Türkçe kalıyor.

**Özet:** 3/3 bulgu doğrulandı. Bulgu 1'e "toksiklik asenkron işleniyor, filtre fail-closed olmalı" notu eklendi. Bulgu 3'ün seviyesi YÜKSEK yerine ORTA olarak önerildi.

---

## Uygulama (Dalga 2)

Sayfa iki yüzlü ürüne dönüştürüldü: **yönetim** (`/dealer/voc-wall`: küratörlük + kurallar + önizleme + ekran bağlantıları + mini KPI/temalar) ve **mağaza ekranı** (`/wall/[token]`: oturumsuz, salt-okunur, iptal edilebilir). Şema değişmedi: moderasyon/kurallar/bağlantılar `Settings` anahtar-değer tablosunda bayi başına tek JSON (`voc-wall:config:<dealerId>`), token araması `voc-wall:display:<sha256>` (ham token saklanmaz).

**Dosyalar:** `app/dealer/voc-wall/page.tsx` (sunucu önce, React Query ön-yükleme), `components/dealer/b-voc-duvari/*` (ekran, liste, kurallar, bağlantılar, TV istemcisi, ortak `WallDisplay`), `lib/dealer/voc-wall/{config,server,http}.ts`, BFF: `GET /api/dealer/voc-wall`, `GET …/items`, `PATCH …/items/[id]`, `PUT …/rules`, `GET …/preview`, `GET|POST …/displays`, `DELETE …/displays/[id]`, `GET /api/wall/[token]` (hepsi `defineRoute`; rol + zod + rate limit + `voc_wall` modül kapısı + kiracı kapsamı). Test: `__tests__/api/voc-wall-safety.test.ts` (21 test).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Metadata | ÇALIŞIYOR | Sayfa artık temaları ve alıntıları gerçekten gösteriyor; i18n metni paylaşılan dosyada, değiştirilmedi. |
| 2 | Yükleniyor iskeleti | ÇALIŞIYOR | `QueryState`; yalnız ilk yüklemede, yenilemede eski veri kalır. |
| 3 | Hata durumu | ÇALIŞIYOR | Zarf v2 + `r.ok` kontrolü; 401/403/4xx/5xx görünür hata + "Tekrar dene". |
| 4 | Hero | ÇALIŞIYOR | QDL `PageHeader` (compact, ops). |
| 5 | "Herkese açık" çipi | KALDIRILDI | Anlamsız sayı; yerine "Ekranda yayında" (gerçek yayın koşulu sayımı) + sabit/gizli sayıları. |
| 6 | TV modu düğmesi | ÇALIŞIYOR | Gerçek signage: `/wall/[token]` tam ekran (Fullscreen API), chrome yok, imleç/kontroller boşta gizli, büyük tipografi. |
| 7 | TV otomatik yenileme | ÇALIŞIYOR | 30 sn arka plan yenileme, eski veri ekranda kalır, iskelet yok; yeni yorum öne alınır + "Yeni" vurgusu. |
| 8 | "Yenile" düğmesi | KALDIRILDI | React Query arka plan yenilemesi + mutasyon sonrası geçersiz kılma; ekran önbelleği yapılandırma sürümüyle anahtarlı (moderasyon anında yansır). |
| 9 | Tüm geri bildirimler bağlantısı | ÇALIŞIYOR | "Ayrıntılı analiz" (Analitik) bağlantısı, `asChild`. |
| 10 | LiveTicker | KALDIRILDI | Tekrarlanan içerik (Bulgu 4); WCAG 2.2.2 ihlali. |
| 11 | LiveFeedStrip | KALDIRILDI | Aynı gerekçe. |
| 12 | Ortalama puan | ÇALIŞIYOR | Dönem (7/30/90) + önceki dönem Δ, İstanbul gün sınırı. |
| 13 | Toplam geri bildirim | ÇALIŞIYOR | Dönemlik + Δ%. |
| 14 | Son 24 saat | ÇALIŞIYOR | TV alt bandında. |
| 15 | Pozitif oran | ÇALIŞIYOR | Tek sunucu hesabı (duygu analizi yapılmış yorumlar paydası) + Δ puan. |
| 16 | Duygu donut'u | KALDIRILDI | Analitik sayfasının kopyasıydı; olumlu oran KPI'si + tema olumlu/olumsuz ayrımı yeterli. |
| 17 | Puan dağılımı | KALDIRILDI | Aynı gerekçe (Analitik'te var). |
| 18 | 7 gün trend | KALDIRILDI | Bozuk + Analitik kopyası; bağlantı verildi. |
| 19 | Trend ipucu | KALDIRILDI | #18 ile birlikte. |
| 20 | Duvar başlığı | ÇALIŞIYOR | "Yayın listesi" bölümü. |
| 21 | Duvar kartları | ÇALIŞIYOR | Maskeli ad (sunucuda), güvenlik süzgeci, AI tema/niyet çipleri, "Yanıtlandı" rozeti, ekran durumu + nedeni. |
| 22 | "Canlı" iddiası | ÇALIŞIYOR | Nabızlar kaldırıldı; TV'de tek gösterge = gerçek son güncelleme zamanı / bağlantı yok uyarısı. |
| 23 | Boş durum | ÇALIŞIYOR | `QueryState` boş durumları (süzgeçli/süzgeçsiz); `a > button` yok. |
| 24 | Kart hover | KALDIRILDI | Yanlış tıklanabilirlik ipucu. |
| 25 | AI alanları | ÇALIŞIYOR | "En çok konuşulan temalar" (olumlu/olumsuz) + satırda tema/niyet çipleri; TV'ye gönderilmez. |
| 26 | Moderasyon | ÇALIŞIYOR | Sabitle (≤20) / gizle / otomatik; kurallar (en az ★, yalnız yazılı, ad gösterimi, döngü süresi, varsayılan QR). Sabit güvenliği delmez. |
| 27 | Şube/QR filtresi | ÇALIŞIYOR | Sayfa süzgeci + kural varsayılanı + ekran başına QR. |
| 28 | Dönem seçimi | ÇALIŞIYOR | 7/30/90 gün + önceki dönem. |
| 29 | Yetki DEALER/ADMIN | ÇALIŞIYOR | ADMIN `?dealerId=` ile salt-okunur (`X-Act-As-Dealer`). |
| 30 | Modül kapısı | ÇALIŞIYOR | Tüm BFF uçlarında `module: 'voc_wall'`, sayfada açıklayıcı boş durum, TV'de "kapalı" ekranı. |
| 31 | STAFF / kiosk | ÇALIŞIYOR | STAFF görüntüler + moderasyon yapar (kurallar/bağlantılar yalnız sahip); TV için oturumsuz token bağlantısı (365 gün, iptal edilebilir, ≤10 etkin, IP başına 30/dk). |
| 32 | Çok dilli metinler | ÇALIŞIYOR | API kullanıcı metni üretmez (ad yoksa `null`); TR metinler tutarlı ("Olumlu"); yeni yüzey yalnız TR. |
| 33 | Azaltılmış hareket | ÇALIŞIYOR | `useMotionPolicy`: geçiş anlık, döngü süresi ×2, ambient statik kare; görünür Duraklat/Sürdür (WCAG 2.2.2); sekme gizliyken döngü durur. |
| 34 | Sunucu önbelleği | ÇALIŞIYOR | Ekran akışı 20 sn, anahtar = bayi + QR + yapılandırma sürümü (moderasyon anında geçersiz). Yeni yorumda temizleme feedback POST'unda (başka yüzey) — TTL 20 sn ile sınırlı. |
| 35 | Mobil yerleşim | ÇALIŞIYOR | `PanelPage` + aside mobilde altta, `MetricGrid`, ≥44px dokunma hedefleri. |

### Kapanan bulgular
1 (maske + süzgeç + moderasyon; onay kutusu hariç), 2, 3 (grafik kaldırıldı; dönem sunucuda İstanbul), 4, 5, 6, 7, 8, 9, 10 — **10/10**.

### Kalanlar
- **Müşteri onayı (`wallConsent`)**: geri bildirim formu başka yüzeyin; şema değişikliği gerekmeden `isPublic` kullanılabilir ama formda seçenek yok → ŞEMA/form isteği olarak bırakıldı. Bugün ekran yalnız maskeli/ad-gizli gösterim yapar.
- **SSE itme modeli**: yoklama (30 sn) + 20 sn önbellek; feedback POST'una önbellek temizleme eklemek başka yüzeyin dosyası.
- TV'de çerez bildirimi ilk açılışta bir kez kapatılmalı (yasal bileşen, dokunulmadı).
