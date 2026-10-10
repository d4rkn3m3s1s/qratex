# /dealer/innovation

**Amaç:** Bayiye dört "deney" aracını tek sayfada sunmak: (1) masadan sessiz memnuniyet/şikâyet sinyali (Masa sinyali), (2) 30 dakikalık flash teklif, (3) anahtar kelime frekansına dayalı haftalık yorum özeti, (4) admin onaylı segment kampanya taslakları. Ayrıca personel/masa içgörüsü için bir gizlilik tercihi taşıyor.

**Genel puan: 3.5/10** · **Karar: birleştir** (her parça başka bir modüle taşınmalı; sayfa bir "deney çekmecesi" olarak kalmamalı)

Dosyalar: `app/dealer/innovation/page.tsx` (375 satır, tek `'use client'` bileşeni), `app/dealer/innovation/layout.tsx` (yalnız metadata), API: `app/api/dealer/innovation/*` (9 route), public uç `app/api/innovation/table-pulse/route.ts`, public sayfa `app/table-signal/*`, kütüphaneler `lib/innovation-*.ts`, modeller `TablePulse`, `DealerFlashOffer`, `DealerWeeklyBrief`, `SegmentCampaignProposal` (`prisma/schema.prisma:2672-2747`).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Uçların çoğu gerçek veri yazıyor ama "Özeti yeniden üret" haftalık e-posta/bildirimi sessizce engelliyor, flash teklif konum yoksa hiç görünmüyor, sinyal kapatma ve masa performansı API'leri UI'sız. |
| UX | 3/10 | Dört alakasız araç alt alta, ham enum'lar (`CONCERN`, `APPROVED`, `sleeping`) ekranda, geliştirici metni (`/api/...` yolu) son kullanıcıya gösteriliyor, onay/önizleme yok. |
| Görsel | 4/10 | Düz shadcn kart yığını; hiyerarşi, durum rozeti, ikonografi ve boş durum tasarımı yok; diğer yeniden tasarlanmış bayi sayfalarıyla tutarsız. |
| Mimari | 3/10 | `DealerWeeklyBrief` iki farklı algoritma tarafından aynı anahtarla yazılıyor; tercih tüm bayiler için tek `Settings` satırında read-modify-write; `unknown` + cast ile tipler kaybedilmiş; modül kapısı yok. |
| Performans | 5/10 | Sayfa 5 paralel istek atıyor (her biri ayrı `settings` okuması + token-replay kontrolü); segment gönderiminde 500 kullanıcıya kadar kullanıcı başına ayrı `pushSubscription.findMany` (N+1). |
| Erişilebilirlik + mobil | 4/10 | Mobilde kırılmıyor ama `Label`'lar input'a bağlı değil, `Switch` etiketsiz, durum yalnız renk+İngilizce enum ile veriliyor, i18n hiç yok (EN kullanıcı Türkçe görür). |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa başlığı + açıklama | ÇALIŞIYOR | `page.tsx:171-180` | Sabit Türkçe; `useAppT` yalnız tek bir hata metninde kullanılıyor (`:134`). |
| 2 | "Yenile" butonu | KISMİ | `page.tsx:181-184`, `load` `:42-68` | `res.ok` kontrol edilmiyor; 403/500 gövdesi "boş veri" gibi işleniyor. |
| 3 | İlk yükleme (5 paralel fetch) | KISMİ | `page.tsx:45-51` | Biri ağ hatası verirse `Promise.all` hepsini düşürür, tek "Veri alınamadı" toast'ı. |
| 4 | Yükleniyor durumu | KISMİ | `page.tsx:237`, `:288`, `:335`, `:360` | Yalnız özet kartı "Yükleniyor…" diyor; diğer kartlar yüklenirken "Kayıt yok / Henüz taslak yok" gösteriyor (yanlış boş durum). |
| 5 | Hata durumu | KISMİ | `page.tsx:63-65` | Yalnız toast; kart bazında hata/yeniden dene yok. |
| 6 | Özellik bayrağı kapalı durumu | EKSİK | API'ler 403 döndürüyor (ör. `weekly-brief/route.ts:13-15`) | UI bunu "veri yok" gibi gösteriyor; "Bu özellik platformda kapalı" açıklaması yok. |
| 7 | Modül kapısı (`dealer_innovation`) | EKSİK | Menü `components/dashboard/sidebar.tsx:242`; API'lerde `module-gate` importu yok | Admin modülü kapatsa da doğrudan URL ve API'ler çalışır. |
| 8 | Masa sinyali URL gösterimi | ÇALIŞIYOR | `page.tsx:187-207` | `session.user.id` ile kurulur. |
| 9 | "Kopyala" | KISMİ | `page.tsx:157-162` | `clipboard.writeText` sonucu beklenmiyor; reddedilse de "kopyalandı" toast'ı çıkar. |
| 10 | URL parametre yönergesi (`?table=M7`) | BOZUK | `page.tsx:194-195` | URL zaten `?dealerId=` içeriyor; bayi `?table=M7` eklerse `dealerId` değeri `X?table=M7` olur ve public uç 404 döner (`api/innovation/table-pulse/route.ts:38-44`). Doğrusu `&table=M7`. |
| 11 | Masa sinyali için QR üretimi/indirme | EKSİK | `table-signal` referansı yalnız bu sayfada (`page.tsx:159,199`) | "QR'a şu adresi yazdırın" deniyor ama QR üretilmiyor; QR Kodları modülüyle bağ yok. |
| 12 | Haftalık özet görüntüleme | KISMİ | `page.tsx:164-167,218-239`; GET `weekly-brief/route.ts:29-34` | Bu haftanın (devam eden) anahtarını okur; cron ise geçen haftanın anahtarına yazar (`lib/weekly-digest-core.ts:171-172`) → kart neredeyse her zaman boş. |
| 13 | "Özeti yeniden üret" | BOZUK | `page.tsx:74-87`; POST `weekly-brief/route.ts:62-79` | Aynı `(dealerId, weekStart)` satırını upsert ediyor; bir sonraki pazartesi cron `createMany(skipDuplicates)` count=0 görüp bildirim ve e-postayı GÖNDERMİYOR (`weekly-digest-core.ts:124-143`). Bkz. Bulgu 1. |
| 14 | Önerilen aksiyon metni | KISMİ | `lib/innovation-weekly-brief.ts:80-90` | NPS dalı hiçbir zaman doğru çalışmaz: `npsScore` select'te yok (`:35`), `nps` hep 0 (`:78`). |
| 15 | "En çok geçen temalar" | KISMİ | `page.tsx:222-233`; `innovation-weekly-brief.ts:46-74` | Ham kelime frekansı, sınırlı stop-word listesi; "yemek", "güzel" gibi kelimeler "tema" diye çıkar. Bilinmeyen biçimde `JSON.stringify` ekrana basılır (`page.tsx:229`). |
| 16 | Flash form: Başlık | KISMİ | `page.tsx:248-251` | `maxLength` yok (API 120 sınırı, `flash-offers/route.ts:13`); `Label` bağlı değil. Varsayılan değer "Mutlu saat" önceden dolu. |
| 17 | Flash form: Metin | KISMİ | `page.tsx:252-255` | API'de üst sınır yok (`flash-offers/route.ts:14`). |
| 18 | Flash form: İndirim % | BOZUK | `page.tsx:256-259,99` | Serbest metin; `0` → `0 \|\| 10` = %10; `-20`, `500` kabul edilir; API'de `value` için min/max yok (`flash-offers/route.ts:16`). |
| 19 | "Flash oluştur (30 dk)" | KISMİ | `page.tsx:89-111`; `flash-offers/route.ts:50-107` | Çalışıyor ama: yalnız `PERCENT`, süre sabit 30 dk, başlangıç ileri tarihlenemez, loading/disable yok (çift tık = iki teklif), rate limit yok. |
| 20 | Konumsuz bayide flash görünürlüğü | BOZUK | `flash-offers/route.ts:86-89`; `api/customer/innovation/nearby/route.ts:68-69` | Bayinin `latitude/longitude` yoksa teklif oluşur, başarı toast'ı çıkar, ama müşteri tarafında hiç listelenmez. Uyarı yok. |
| 21 | Flash açıklaması ("Yakınımdakiler"de görünür) | KISMİ | `page.tsx:261-263`; `app/customer/nearby/page.tsx:399` | Doğru sayfa var, ama koşulları (konum, 300 global teklif sınırı `nearby/route.ts:52`) söylemiyor. |
| 22 | "Aktif flash listesi" | KISMİ | `page.tsx:354-372`; GET `flash-offers/route.ts:41-45` | Adı "aktif" ama süresi dolmuş ve pasif teklifleri de listeliyor; `isActive`/kalan süre/gösterim yok; ilk 10 (`:363`). |
| 23 | Flash durdurma / düzenleme / silme | EKSİK | API mevcut: `flash-offers/[id]/route.ts` PATCH `:22`, DELETE `:106` | UI'da hiçbir buton yok; yanlış teklif 30 dk boyunca durdurulamaz. |
| 24 | Flash kullanım (redemption) sayacı | SAHTE | `redemptionCount` hiçbir yerde artırılmıyor (yalnız okunuyor: `nearby/route.ts:73`, inngest expiry) | `maxRedemptions: 200` (`flash-offers/route.ts:101`) anlamsız; kod/kullanım akışı yok. |
| 25 | Segment şablon butonları (Uykuda/Sadık/İlk ziyaret) | ÇALIŞIYOR | `page.tsx:275-285`; POST `segment-proposals/route.ts:45-89` | Taslak oluşur; ama loading/disable yok (çift tık = mükerrer taslak), metin önizlemesi ve düzenleme yok (API `title/message` destekliyor, `:13-14`). |
| 26 | Taslak listesi | KISMİ | `page.tsx:286-310` | `segmentKey` ve `status` ham İngilizce enum; mesaj gövdesi hiç gösterilmiyor; red gerekçesi/karar tarihi yok. |
| 27 | Hedef kitle büyüklüğü önizlemesi | EKSİK | `lib/innovation-segment-users.ts` yalnız gönderimde çağrılıyor (`send/route.ts:47`) | Bayi kaç kişiye gideceğini göndermeden önce bilmiyor; segment boşsa ancak gönderimde 400 alıyor. |
| 28 | "Müşterilere gönder" | KISMİ | `page.tsx:128-139,302-306`; `send/route.ts` | Onay diyaloğu yok; status önce `SENT` yapılıp sonra bildirim yazılıyor (`:59-83`), arada hata = gönderilmiş görünen ama kimseye ulaşmamış kampanya; 500 üst sınırı sessizce kırpılıyor (`:48`). |
| 29 | Pazarlama izni/frekans kontrolü | EKSİK | `send/route.ts:70-95`; `lib/push.ts:12-29` | Rıza/opt-out/frekans sınırı kontrolü yok (ticari ileti). |
| 30 | Admin onay akışı (bağımlılık) | KISMİ | `app/api/admin/innovation/segment-proposals/[id]/route.ts:36-43` | Durum makinesi yok: admin `SENT` bir taslağı yeniden `APPROVED` yaparsa bayi ikinci kez gönderebilir. |
| 31 | Personel/masa içgörüsü anahtarı | SAHTE | `page.tsx:314-327`; tercih `prefs/route.ts`; tüketici `table-performance/route.ts` | Tercih gerçekten kaydediliyor ama kontrol ettiği `table-performance` ucunu kullanan HİÇBİR UI yok (grep: tek referans `page.tsx:321` metni). Görünür etkisi sıfır. |
| 32 | Masa performansı görünümü | EKSİK | `app/api/dealer/innovation/table-performance/route.ts` (80 satır, tüketicisiz) | Masa bazında OK/CONCERN dağılımı hazır, gösterilmiyor. |
| 33 | "Son masa sinyalleri" listesi | KISMİ | `page.tsx:329-352`; `table-pulses/route.ts` | Ham `OK/CONCERN` metni; müşteri notu (`note`, API'de dönüyor `:42`) gösterilmiyor; QR bağlantısı yok; tarih `toLocaleString()` locale'siz. |
| 34 | Sinyali "çözüldü" işaretleme | EKSİK | API `table-pulses/[id]/resolve/route.ts`, UI'da çağrı yok | Admin sağlık skoru 2.0 çözülme oranını ödüllendiriyor (`lib/dealer-health-v2.ts:68-70`); bayi bunu yapamadığı için skoru sistematik olarak düşük. |
| 35 | Canlı sinyal bildirimi | EKSİK | `api/innovation/table-pulse/route.ts:60-71` yalnız kayıt yazıyor | `CONCERN` geldiğinde bayi/personele bildirim/push yok; "şikâyet öncesi haber ver" vaadi gerçekleşmiyor. |
| 36 | Public sinyal ucunda kötüye kullanım koruması | EKSİK | `api/innovation/table-pulse/route.ts` (rate limit/captcha yok; `proxy.ts:103-118` API'ye limit uygulamıyor) | Herkes, URL'deki `dealerId` ile sınırsız `CONCERN` yazabilir → sağlık skoru manipülasyonu. |
| 37 | Yetki (sahiplik) kontrolü | ÇALIŞIYOR | `lib/api-auth.ts:85-102`; tüm dealer uçları `requireDealerResource` | IDOR bulunmadı; `[id]` uçlarında `updateMany where {id, dealerId}` ile çift kontrol var. |
| 38 | Sayfa rol erişimi | ÇALIŞIYOR | `proxy.ts:50-73` | `/dealer` yalnız DEALER; STAFF erişemez (personelin bu araçlara erişimi de yok — bkz. eksikler). |
| 39 | Çok dilli metin (i18n) | BOZUK | Tüm sabit metinler `page.tsx:35-37,64,82,85,...`; API mesajları Türkçe | Proje EN destekliyor (`i18n/request.ts`, `useAppT`), `table-signal-client.tsx` tamamen i18n'li; bu sayfa değil. |
| 40 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:170,197-205,291-293` | `flex-wrap`, `break-all` var; sinyal satırı 3 sütun dar ekranda sıkışık ama taşmıyor. |
| 41 | Erişilebilirlik (form etiketleri, switch) | KISMİ | `page.tsx:249,253,257` (`Label` `htmlFor` yok), `:324` (`Switch` aria-label/id yok) | Ekran okuyucu alan adını okumaz. |

**Sayım:** ÇALIŞIYOR 7 · KISMİ 20 · BOZUK 5 · SAHTE 2 · EKSİK 7 (toplam 41)

---

## Bulgular

### 1. "Özeti yeniden üret" haftalık digest e-postasını ve bildirimini sessizce iptal ediyor
- **Önem:** kritik · **Kategori:** veri bütünlüğü
- **Kanıt:** `app/api/dealer/innovation/weekly-brief/route.ts:62-79` (upsert, anahtar `utcMondayWeekStart()` = bu haftanın pazartesisi) · `lib/weekly-digest-core.ts:171-172` (cron geçen haftanın pazartesisini anahtar alır) · `lib/weekly-digest-core.ts:124-143` (`createMany skipDuplicates`; count=0 ise "skipped", bildirim+e-posta yok) · `lib/innovation-week.ts:2-9` ve `lib/timezone.ts:24-30` aynı pazartesi UTC hesabı.
- **Sorun:** Bayi W haftasında butona basınca `(dealerId, W)` satırı oluşur. W+1 pazartesisi cron W haftası için `createMany` yapar, satır zaten var → `isFirstTime=false` → bayiye "Haftalık özetiniz hazır" bildirimi ve e-postası gönderilmez; içerik de cron'un playbook tabanlı metniyle sessizce üzerine yazılır. Ters yönde, cron'un AI/playbook özetini bu sayfadaki buton naif kelime frekansıyla ezer. Aynı tabloya iki farklı algoritma, farklı zaman pencereleriyle (yuvarlanan 7 gün vs takvim haftası) yazıyor. Ayrıca bu sayfanın GET'i devam eden haftayı okuduğu için cron sonrası kart yine boş kalır.
- **Öneri:** `DealerWeeklyBrief` yalnızca cron'un (`weekly-digest-core`) kaynak-doğru kaydı olsun. Bu sayfadaki "anlık özet" ya (a) tamamen kaldırılıp `/dealer/weekly-brief` sayfasına yönlendirilsin, ya da (b) kalıcı yazmayan, `computeWeeklyBriefForDealer` sonucunu yalnız döndüren (veya ayrı `kind: 'adhoc'` alanlı) bir önizleme ucu olsun. Model düzeyinde `source` (`CRON` | `ADHOC`) kolonu ve benzersiz anahtarı `(dealerId, weekStart, source)` yapmak da kalıcı çözüm. Mevcut veride bu butonla oluşmuş satırlar nedeniyle atlanmış haftaları tespit için `createdAt` haftanın ortasına düşen satırlar sorgulanmalı (yalnız okuma).
- **Efor:** M

### 2. Public masa sinyali ucu kimlik doğrulamasız ve hız sınırsız → sağlık skoru manipülasyonu
- **Önem:** yüksek · **Kategori:** güvenlik
- **Kanıt:** `app/api/innovation/table-pulse/route.ts:23-71` (oturum isteğe bağlı, rate limit yok) · `proxy.ts:103-118` (API'ye limit uygulamıyor) · `lib/rate-limit.ts:96` (`checkPublicActionRateLimit` mevcut ama kullanılmıyor) · `lib/dealer-health-v2.ts:49-52,67` (CONCERN oranı skoru 25 puana kadar düşürür) · `dealerId` URL'de açık (`page.tsx:159`).
- **Sorun:** `dealerId`'yi bilen biri (QR'dan okunur) script ile binlerce `CONCERN` yazabilir; admin sağlık panosu ve olası churn sinyalleri bozulur, tablo şişer. `note` alanı 400 karakter serbest metin olarak saklanıyor (spam/hakaret).
- **Öneri:** `checkPublicActionRateLimit` (IP + dealerId + tableCode anahtarlı, ör. 5 dk'da 3) ve Upstash tabanlı kalıcı sayaç ekle; `dealerId` yerine imzalı/rotasyonlu kısa token (QR modülündeki `rotate` deseniyle uyumlu) kullan; anonim sinyalleri sağlık skorunda ağırlıklandır (oturumlu müşteri > anonim) ve aynı cihazdan tekrarları birleştir.
- **Efor:** M

### 3. Segment gönderiminde durum önce `SENT` yapılıyor, teslimat atomik değil; rıza ve önizleme yok
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / uyumluluk
- **Kanıt:** `app/api/dealer/innovation/segment-proposals/[id]/send/route.ts:59-68` (claim → SENT) ardından `:70-95` (createMany + 500 paralel push) · `:48` (500'e sessiz kırpma) · `lib/push.ts:12-29` (kullanıcı başına ayrı `pushSubscription.findMany`) · `page.tsx:302-306` (onaysız gönder butonu) · admin ucu `app/api/admin/innovation/segment-proposals/[id]/route.ts:36-43` (durum makinesi yok).
- **Sorun:** `notification.createMany` veya fonksiyon zaman aşımı (500 paralel push) olursa kayıt `SENT` kalır ama müşterilere ulaşmamıştır; yeniden deneme yolu yok. 500'den büyük segmentte kalanlar sessizce atlanır ve bayi bunu bilmez. Pazarlama izni/opt-out/frekans sınırı kontrol edilmiyor (ticari elektronik ileti). Admin `SENT` → `APPROVED` geçişine izin verdiği için çift gönderim mümkün. 500 eşzamanlı Prisma sorgusu Neon pooler bağlantı sınırını zorlar.
- **Öneri:** `SENDING` ara durumu + `sentCount/targetCount/failedCount` kolonları; teslimatı mevcut push merkezi/kuyruk altyapısına (Inngest/cron) devret, parti parti işle, sonunda `SENT`. Hedef kitle `userId IN (...)` ile tek sorguda abonelik çekilsin. Gönderim öncesi "N müşteriye, şu metin, şu kanal" onay diyaloğu ve rıza filtresi. Admin PATCH'te izinli geçiş tablosu (`PENDING→APPROVED|REJECTED`, `APPROVED→SENT` yalnız sistem).
- **Efor:** L

### 4. Flash teklif konumsuz bayide görünmez, değer doğrulaması yok, yönetim UI'ı yok
- **Önem:** yüksek · **Kategori:** işlevsellik
- **Kanıt:** `page.tsx:89-111,256-259` (`parseFloat(...) || 10`) · `flash-offers/route.ts:16` (`value` sınırsız), `:86-89` (konum yoksa `geohash5=null` ama oluşturur) · `api/customer/innovation/nearby/route.ts:68-69` (konumsuz bayi atlanır), `:35-52` (platform genelinde sırasız `take: 300`) · PATCH/DELETE `flash-offers/[id]/route.ts` UI'sız · `redemptionCount` hiç artırılmıyor.
- **Sorun:** Bayi başarı toast'ı görür, müşteri teklifi hiç görmez. `%0` girildiğinde %10, `-20` veya `%500` olduğu gibi kaydedilir. Yanlış girilen teklif durdurulamaz/silinemez. "Aktif" liste süresi dolanları da gösterir. Kullanım sayacı ve `maxRedemptions` gerçek bir akışa bağlı değil; teklif yalnız bir duyuru.
- **Öneri:** Oluşturma öncesi bayinin konumu yoksa formu kilitleyen ve ayarlara yönlendiren uyarı; zod'da `PERCENT` için `1-90`, `FIXED_TRY` için pozitif, `validTo > validFrom` ve `≤ 24 saat` kuralı; UI'da tip seçici, süre seçici (15/30/60/120 dk, ileri tarih), canlı geri sayım, "Durdur" (PATCH `isActive:false`) ve "Sil". Kullanım için tek kullanımlık kod/QR üretimi ve kasada doğrulama ucu; o zamana kadar `maxRedemptions` alanını UI'dan ve sorgudan kaldır. `nearby` sorgusunu `geohash5` indeksine dayandır (zaten `@@index([geohash5, isActive])` var).
- **Efor:** L

### 5. Personel/masa içgörüsü anahtarı görünür hiçbir şeyi kontrol etmiyor; masa performansı ve sinyal kapatma API'leri ölü
- **Önem:** orta · **Kategori:** sahte özellik / ölü kod
- **Kanıt:** `page.tsx:314-327` (metinde `/api/dealer/innovation/table-performance` yolu kullanıcıya gösteriliyor) · `table-performance/route.ts` tüketicisiz · `table-pulses/[id]/resolve/route.ts` tüketicisiz · `lib/dealer-health-v2.ts:68-70` (çözülme oranı skora +15'e kadar ekler).
- **Sorun:** Bayi bir gizlilik tercihi değiştiriyor ama sonucu göremiyor; "isim yerine masa kodu kullanılır" metni zaten her durumda geçerli. Sinyalleri kapatamadığı için sağlık skorunun "kapanış" bileşeni bayi aleyhine hep boş.
- **Öneri:** Masa sinyalleri bölümünü küçük bir "gelen kutusu"na çevir: açık `CONCERN`'ler üstte, not ve masa koduyla; "Çözüldü" aksiyonu (resolve ucu), ortalama çözülme süresi. Anahtar açıkken altında 30 günlük masa ısı haritası (table-performance verisiyle). Geliştirici metni kaldırılıp "Masa bazlı performans kartını göster" gibi sonuç odaklı bir etiket kullanılsın.
- **Efor:** M

### 6. Masa sinyali yönergesi hatalı URL ürettiriyor; QR üretimi yok
- **Önem:** orta · **Kategori:** işlevsellik / UX
- **Kanıt:** `page.tsx:194-195` (`?table=M7` öneriyor), `:199` (URL zaten `?dealerId=` ile başlıyor) · `api/innovation/table-pulse/route.ts:38-44` (geçersiz dealerId → 404).
- **Sorun:** Yönergeyi izleyen bayi `.../table-signal?dealerId=X?table=M7` yazdırır; `dealerId` `X?table=M7` olarak çözülür ve tüm sinyaller "İşletme bulunamadı" hatasıyla düşer. QR'ı bayinin kendisinin üretmesi gerekiyor.
- **Öneri:** Masa listesi girilen (M1–M20 gibi) bir "Masa QR seti" oluşturucu: her masa için doğru parametreli URL, önizleme, toplu PDF/PNG indirme (QR Kodları modülündeki üretim altyapısını yeniden kullan). Mevcut `QRCode` kayıtlarıyla eşleştirip `qrCodeId` parametresini otomatik ekle.
- **Efor:** M

### 7. Bayi tercihleri tüm bayiler için tek `Settings` satırında read-modify-write
- **Önem:** orta · **Kategori:** mimari / yarış koşulu
- **Kanıt:** `lib/innovation-dealer-prefs.ts:33-56` (oku → map'i değiştir → upsert, transaction/kilit yok), `:23-31` (her GET tüm bayilerin map'ini çeker).
- **Sorun:** İki bayi aynı anda tercih değiştirirse biri diğerinin yazdığını ezer (kayıp güncelleme). Bayi sayısı arttıkça her okuma tüm map'i taşır.
- **Öneri:** Tercihi bayiye ait bir tabloya (`DealerInnovationPrefs` veya mevcut bayi ayarları modeline JSON kolon) taşı; geçişte mevcut map'i tek seferlik migrate et. Kısa vadede `jsonb_set` ile atomik SQL güncellemesi.
- **Efor:** S

### 8. Haftalık özet algoritması yüzeysel ve NPS dalı ölü
- **Önem:** orta · **Kategori:** doğruluk
- **Kanıt:** `lib/innovation-weekly-brief.ts:29-36` (`npsScore` select edilmiyor), `:78` (`nps` her zaman 0), `:8-11,46-74` (kelime frekansı, kısa stop listesi).
- **Sorun:** "NPS ölçümü az görünüyor" önerisi 5'ten fazla geri bildirimi olan ve diğer koşullara uymayan her bayiye NPS kullansa bile gösterilir. Temalar AI'ın çıkardığı `topics` ile ham kelimeleri aynı sayaçta karıştırıyor.
- **Öneri:** Bu hesaplayıcı Bulgu 1 kapsamında emekliye ayrılmalı; kalacaksa yalnız `Feedback.topics` (AI temaları) kullanılsın, `npsScore` select'e eklensin, öneri metinleri `weekly-digest-core` playbook'larıyla birleştirilsin.
- **Efor:** S

### 9. Hata/boş/yükleniyor durumları birbirine karışıyor; özellik bayrağı görünmez
- **Önem:** orta · **Kategori:** UX / hata yönetimi
- **Kanıt:** `page.tsx:45-62` (`res.ok` yok), `:63-65`, `:287-288,334-335,359-360` (yüklenirken "Kayıt yok").
- **Sorun:** Admin bir alt özelliği kapattığında (`innovation-config.ts:59-69`) API 403 döner, sayfa bunu "henüz kayıt yok" diye gösterir; "Özeti yeniden üret" tıklanınca ancak "Özellik devre dışı" toast'ı çıkar. Yüklenirken boş durumlar yanıp söner.
- **Öneri:** Uç başına `useSWR` (veya tek bir `/api/dealer/innovation/overview` toplu uç) ile kart bazında `loading | error | disabled | empty | data` durum makinesi; skeleton; devre dışı kartları tamamen gizle veya açıklayıcı kilit durumu göster.
- **Efor:** M

### 10. i18n yok, ham enum'lar ekranda
- **Önem:** orta · **Kategori:** tutarlılık / erişilebilirlik
- **Kanıt:** `page.tsx` tüm metinler sabit Türkçe; `:298-299` (`segmentKey`, `status` ham), `:341-342` (`mood` ham), `:345,367` locale'siz `toLocaleString()`; karşılaştırma: `app/table-signal/table-signal-client.tsx` tamamen `t()` kullanıyor.
- **Öneri:** `dealerInnovation.*` anahtar ailesi; enum → etiket + renk + ikon eşlemesi (`PENDING` "Onay bekliyor", `CONCERN` "Dikkat istiyor"); tarihler `Intl.RelativeTimeFormat` ile ("12 dk önce").
- **Efor:** S

### 11. Çift tık ve onaysız aksiyonlar
- **Önem:** düşük · **Kategori:** UX
- **Kanıt:** `page.tsx:213,260,276-284,303` (hiçbir aksiyon butonunda `disabled`/pending yok); `:157-162` (clipboard sonucu beklenmiyor).
- **Öneri:** Her mutasyon için pending durumu (`useTransition` veya yerel state) ve buton kilidi; segment taslağında aynı segment için açık `PENDING` varsa sunucu 409 dönsün; "Kopyala" `await` edilip hata durumunda URL seçili bir input'ta gösterilsin.
- **Efor:** S

### 12. Tip güvenliği kayıp
- **Önem:** düşük · **Kategori:** mimari
- **Kanıt:** `page.tsx:28-30` (`unknown` state), `:166,227-228,337,362` (inline cast).
- **Öneri:** API yanıt tiplerini paylaşılan bir `types.ts`'te (Prisma `Pick` tabanlı) tanımlayıp zod ile istemci tarafında doğrula.
- **Efor:** S

### 13. Performans: 5 ayrı istek, her biri ayrı ayar okuması
- **Önem:** düşük · **Kategori:** performans
- **Kanıt:** `page.tsx:45-51`; her uç `getInnovationPlatformConfig()` (`lib/innovation-config.ts:103-115`, cache'siz `settings.findUnique`) + `requireAuth` token-replay kontrolü.
- **Öneri:** `getInnovationPlatformConfig`'i `module-gate.ts`'teki gibi `unstable_cache` + tag ile sarmala; sayfa için tek toplu uç veya server component'te paralel prefetch.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Gerçek zamanlı masa uyarısı** (Toast / Medallia "Alert"): `CONCERN` geldiğinde personele push + panelde canlı sayaç, SLA zamanlayıcısı ve "çözüldü" kapanışı; vardiya sorumlusuna atama.
2. **Masa QR seti üretimi** (Toast, Square QR): masa listesinden toplu, markalı, yazdırılabilir QR; masa bazlı ısı haritası.
3. **Teklif yaşam döngüsü** (Square Marketing, Google Business "Offers"): taslak → zamanlanmış → canlı → bitti; görüntülenme / tıklanma / kullanım metrikleri; tek kullanımlık kod ve kasada doğrulama.
4. **Segment kampanyası önizlemesi ve sonuç ölçümü** (Qualtrics XM Actions, Toast Marketing): hedef kitle sayısı, kanal bazlı erişim, açılma ve dönüş (ziyaret) atfı; A/B (altyapı `campaignAb` admin tarafında zaten var).
5. **Rıza ve frekans yönetimi** (Medallia, Square): pazarlama izni olmayanları otomatik dışlama, kişi başı haftalık mesaj sınırı, sessiz saatler.
6. **Personel erişimi**: STAFF rolünün yalnız "masa sinyalleri gelen kutusu"nu görebilmesi (şu an `/dealer` STAFF'a kapalı, `proxy.ts:50-73`); masa sinyali aslında sahada personelin aracı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "İnovasyon" adında belirsiz bir deney çekmecesi yerine, her parça doğal yuvasına yerleşir ve bayi her aracı ilgili iş akışının içinde bulur:

| Mevcut parça | Hedef yuva | Değişiklik |
|---|---|---|
| Masa sinyali URL + son sinyaller + resolve + table-performance | **Yeni "Canlı Masa" görünümü** (Operasyon grubunda; STAFF'a da açık) veya `/dealer/incidents` içinde bir sekme | Gelen kutusu + masa ısı haritası + QR seti üretici |
| 30 dk flash teklif + aktif liste | **`/dealer/campaigns`** içinde "Anlık teklif" kampanya tipi | Yaşam döngüsü, süre seçici, durdur, metrik |
| Haftalık yorum özeti | **`/dealer/weekly-brief`** (zaten aynı `DealerWeeklyBrief` modelini okuyor) | Ad-hoc üretim kaldırılır veya yazmayan önizleme olur |
| Segment taslakları | **`/dealer/segment-actions`** (zaten `segment-proposals` ucunu endpoint olarak gösteriyor: `lib/segment-action-center.ts:75-91`) | Önizleme, kitle sayısı, onay durumu zaman çizelgesi |
| Personel içgörüsü tercihi | **`/dealer/settings` → Gizlilik** | Sonucu Canlı Masa'da görünür |

**Canlı Masa yerleşimi (öneri):**
- Üstte 3 KPI şeridi: açık uyarı sayısı, ortalama çözülme süresi, son 24 saat OK/CONCERN oranı.
- Solda gelen kutusu (CONCERN önce, not + masa + "x dk önce", "Çözüldü" butonu, klavye ile `J/K` gezinme); sağda masa grid'i (her masa bir hücre, renk = son 30 gün CONCERN oranı, tıklayınca geçmiş).
- Altta "Masa QR seti" sihirbazı (masa kodları → önizleme → toplu indir).

**Motion / 3D:** Bu sayfa için 3D gereksiz ve yersiz. Ölçülü framer-motion (`m as Motion`, global LazyMotion): yeni gelen sinyal kartı için 150-200 ms `layout` + yumuşak giriş, çözülünce `AnimatePresence` ile çıkış; flash teklif kartında kalan süre için ince ilerleme halkası. Tümü `useReducedMotion` ile kapatılabilir; animate-spin dışında sürekli animasyon yok.

**Veri/API değişiklikleri:**
- `DealerWeeklyBrief`'e `source` kolonu veya ad-hoc ucun yazmaz hale gelmesi (Bulgu 1).
- `SegmentCampaignProposal`'a `SENDING` durumu, `targetCount/sentCount/failedCount`, `decisionNote`; admin PATCH'e geçiş tablosu; gönderimin kuyruğa alınması.
- `DealerFlashOffer` için zod sınırları, konum ön koşulu, redemption ucu (veya alanların kaldırılması).
- `TablePulse` public ucuna rate limit + imzalı masa token'ı; `CONCERN` için Realtime/push bildirimi (`components/dashboard/realtime-notifications` mevcut altyapısı).
- Bayi tercihleri ayrı tabloya.
- `getInnovationPlatformConfig` cache'li; tüm uçlar ayrıca `dealer_innovation` (veya yeni modül anahtarları) modül kapısından geçmeli.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/weekly-brief`**: Aynı `DealerWeeklyBrief` tablosunu okuyor (`app/api/dealer/weekly-brief/route.ts:34-39`); bu sayfa aynı satırları farklı algoritmayla yazıyor → doğrudan çakışma ve veri bozulması (Bulgu 1). Haftalık özet bu sayfadan **kaldırılmalı**.
- **`/dealer/campaigns`**: Kendi segment (`all/vip/loyal/active/risk`) ve gönderim akışına sahip (`app/dealer/campaigns/page.tsx:39-43,82`). Burada ikinci bir kampanya + segment sistemi (`sleeping/loyal/first_visit`, admin onaylı) var; segment tanımları da farklı: `segment-action-center` "Uyuyan" = 30+ gün (`lib/segment-action-center.ts:65`), bu modül "sleeping" = 45 gün (`lib/innovation-segment-users.ts:3`). Flash teklif de bir kampanya tipi olarak buraya **birleştirilmeli**.
- **`/dealer/segment-actions`**: Segment öneri merkezi zaten bu sayfanın `segment-proposals` ucunu çağırıyor; taslak listesi oraya **birleştirilmeli** ve tek bir segment tanım kaynağı (`lib/segment-*`) kullanılmalı.
- **`/dealer/qr-codes`**: Masa sinyali QR'ı burada üretilmeli; ayrı bir "URL kopyala" kartı gereksiz.
- **`/dealer/incidents` / `/dealer/remedy-queue`**: Masa `CONCERN` sinyalleri olay/telafi kuyruğuyla aynı operasyonel işe hizmet ediyor; Canlı Masa ya bu sayfalardan birinin sekmesi olmalı ya da onlara "telafiye dönüştür" aksiyonuyla bağlanmalı.

**Sonuç:** Sayfa bağımsız bir ürün yüzeyi olarak savunulamaz; parçalar ilgili modüllere taşındıktan sonra `/dealer/innovation` rotası kaldırılıp yeni yuvalara yönlendirilmeli. Taşımadan önce acil olarak Bulgu 1 (digest iptali) ve Bulgu 2 (public uç kötüye kullanımı) kapatılmalı.

---

## Doğrulama (şüpheci inceleme)

Yöntem: Her iddia, çağıran ve çağrılan taraflar, `proxy.ts`, auth yardımcıları ve Prisma şeması baştan okunarak çürütülmeye çalışıldı. Kod çalıştırılmadı, veritabanına dokunulmadı.

### 1. İnovasyon haftalık özet üretimi cron digest bildirimini ve e-postasını engelliyor: **DOĞRULANDI**

- Bayi ucu, anahtarı **bu haftanın** pazartesisi olan satırı `upsert` ediyor (`app/api/dealer/innovation/weekly-brief/route.ts:62-79`, `lib/innovation-week.ts:2-9`).
- Haftalık digest işi her pazartesi 08:00 UTC'de tetikleniyor (`lib/inngest/functions.ts:154-162`, cron `0 8 * * 1`) → `app/api/internal/inngest/weekly-digest/route.ts:16` → `runWeeklyDigestForAllDealers`. Bu iş **geçen haftanın** pazartesisini hedefliyor: `startOfWeekUTC(now) - 7 gün` (`lib/weekly-digest-core.ts:171-172`; `startOfWeekUTC` da pazartesi 00:00 UTC, `lib/timezone.ts:24-30`). Yani W haftasında bayinin yazdığı satırla W+1 pazartesi cron'unun yazmak istediği satır **aynı** `(dealerId, weekStart=W)` anahtarına düşüyor.
- `createMany({ skipDuplicates: true })` → `count = 0` → `isFirstTime = false` → içerik `update` ile ezilip `'skipped'` dönülüyor; `notification.create` ve `sendTransactionalEmail` hiç çalışmıyor (`lib/weekly-digest-core.ts:124-143`).
- Tetikleme çok kolay: Sayfa açılışta bu haftanın özetini okuyor, yoksa "Henüz özet yok — yeniden üretin" diyor ve "Özeti yeniden üret" butonu POST atıyor (`app/dealer/innovation/page.tsx:74-87, 214, 237`).
- **Yeniden üretim:** Bayi çarşamba `/dealer/innovation` sayfasını açar, "Özeti yeniden üret"e basar → `(bayi, bu pazartesi)` satırı oluşur. Ertesi pazartesi 08:00 UTC'de digest işi aynı satıra çarpar, "Haftalık özetiniz hazır" bildirimi ve e-postası gönderilmez; bayinin gördüğü tema/aksiyon da sessizce digest algoritmasının çıktısıyla değişir.
- **Çekince:** Etkinin canlıda oluşması Inngest Cloud'un üretimde bağlı olmasına bağlı. Yerel `.env` içinde `INNGEST_*` anahtarı yok, `vercel.json` yalnızca `/api/cron/daily`'yi tetikliyor ve o toplayıcı haftalık digest'i çağırmıyor. Üretim ortamı değişkenleri okunamadığı için "digest canlıda çalışıyor mu" sorusu doğrulanmadı. Ancak çalıştığı anda hata kesin; çalışmıyorsa bu sefer de digest hiç çalışmıyor demektir, bu da ayrı bir sorun.
- **Düzeltme yaklaşımı:** Ad-hoc ucu yazmayan bir önizleme haline getirin (hesapla ve döndür, kaydetme). Ya da `DealerWeeklyBrief`'e `source` (`'digest' | 'adhoc'`) ekleyip benzersizliği `(dealerId, weekStart, source)` yapın. Gönderim idempotensini de satırın varlığına değil ayrı bir `digestSentAt` alanına bağlayın: `updateMany where digestSentAt: null` ile claim edin.

### 2. Public masa sinyali ucunda rate limit yok; anonim CONCERN spam'i sağlık skorunu bozabiliyor: **DOĞRULANDI**

- `POST /api/innovation/table-pulse` kimlik istemiyor. Oturum yalnızca isteğe bağlı olarak `customerId` eklemek için okunuyor (`app/api/innovation/table-pulse/route.ts:56-58`). Tek kontroller şunlar: özellik bayrağı (varsayılan `true`, `lib/innovation-config.ts:61`), zod şeması (`note` ≤ 400) ve `dealerId`'nin bir DEALER olması (`:38-44`). Rate limit, captcha, imzalı masa token'ı ya da IP/cihaz başına sınır yok. `app/api/innovation` altında hiçbir `rateLimit` çağrısı bulunmuyor.
- `proxy.ts:103-118`, `/api/*` için yalnızca güvenlik ve CORS başlıklarını ekleyip `NextResponse.next()` dönüyor; burada da hız sınırı yok.
- `dealerId`, masa QR URL'sinde düz query parametresi olarak duruyor (`app/table-signal/table-signal-client.tsx:16`). QR'ı bir kez okutan herkes bu değeri öğrenir.
- Skor etkisi: `computeDealerHealthV2` son 14 günün `CONCERN` oranını `min(25, oran*80)` olarak düşüyor (`lib/dealer-health-v2.ts:49-52, 67`). Bu skor admin sıralamasında kullanılıyor (`app/api/admin/innovation/health-score-v2/route.ts:30`). Bayinin "çözüldü" işaretlemesi en fazla +15 telafi edebiliyor (`:68-70`). Yani binlerce sahte kayıt bayiye ağır bir yük bindiriyor.
- Diğer etkiler: Bayinin masa sinyali listesi `take=30` ile çekiliyor (`app/dealer/innovation/page.tsx:47`); spam gerçek uyarıları listeden itiyor. Her istek Neon'a bir `INSERT` demek; bu da compute-süresi faturası riskini yeniden açıyor. 400 karakterlik serbest metin de bayi paneline taciz veya içerik enjeksiyonu için açık bir kanal oluyor (React kaçışlıyor, XSS yok; risk içerik kaynaklı).
- **Yeniden üretim:** `POST /api/innovation/table-pulse {"dealerId":"<QR'dan>","mood":"CONCERN","note":"..."}` isteğini 5000 kez döngüyle atın. Oturum gerekmez, hepsi 200 döner. Admin sağlık skoru tablosunda bayi yaklaşık 25 puan düşer ve bayinin masa sinyali listesi tamamen spam ile dolar.
- **Düzeltme yaklaşımı:** Mevcut Upstash Redis üzerinde kayan pencere limiti kurun (IP + dealerId ve masa başına; örn. masa başına 5 dk'da 1 CONCERN). QR'a sunucunun ürettiği HMAC'li kısa ömürlü bir masa token'ı koyun ve `dealerId`'yi bu token'dan türetin. Skor hesabında aynı IP/cihaz kümesini ve anonim kayıtları ağırlıksızlaştırın (örn. `customerId` olmayan sinyallerin etkisini sınırlayın).

### 3. Segment kampanya gönderiminde SENT durumu teslimattan önce yazılıyor; kısmi hata, sessiz kırpma ve admin üzerinden yeniden gönderim: **DOĞRULANDI** (alt maddelerin ağırlığı farklı)

- **SENT, teslimattan önce yazılıyor (gerçek):** `updateMany(... status: 'SENT')` (`app/api/dealer/innovation/segment-proposals/[id]/send/route.ts:59-62`) `notification.createMany`'den (`:70-83`) **önce** çalışıyor ve iki adım bir transaction içinde değil. `createMany` başarısız olursa (Neon duraklaması, bağlantı hatası, zaman aşımı) `catch` 500 döndürüyor (`:117-122`). Bu durumda kayıt `SENT` kalıyor, kimseye bildirim gitmiyor ve bayinin yeniden denemesi `status !== 'APPROVED'` ile 400 alıyor (`:42-45`). Push tarafı `Promise.allSettled` ile korunuyor (`:85-95`); push hatası in-app bildirimi etkilemiyor. Dolayısıyla "kimseye ulaşmadı" senaryosu yalnızca `createMany` hatasında oluşuyor. Bu düşük olasılıklı ama kalıcı bir durum.
- **Sessiz kırpma (gerçek):** `[...new Set(customerIds)].slice(0, MAX_SEND)` (`:48`, `MAX_SEND=500`). Kitle bunu aşarsa geri kalanı hiçbir kayıt bırakılmadan dışarıda kalıyor. Yanıttaki `sentCount` 500 dönüyor ama gerçek kitle büyüklüğü veya "kırpıldı" bayrağı dönmüyor. Kırpma sırası `Map` ekleme sırasına bağlı olduğu için hangi müşterilerin elendiği de keyfi.
- **Rıza/opt-out yok sayılıyor (gerçek, en somut kullanıcı etkisi):** Müşteri ayarlarında "Kampanya & Sürprizler" grubu için app ve push kanalları kapatılabiliyor (`lib/notification-prefs.ts:49-53, 121-136`; `app/api/customer/settings/route.ts:216-218`). Ancak gönderim ucu `notificationPrefs`'i hiç okumuyor; `sendPushNotification` da tercih kontrolü yapmıyor (`lib/push.ts:12-29`). Tercihler yalnızca `lib/character-badges.ts` ve `lib/team-notify.ts` içinde uygulanıyor. **Yeniden üretim:** Müşteri kampanya push'unu kapatır → bayi `loyal` segment taslağı oluşturur, admin onaylar, bayi "Gönder"e basar → müşteriye yine de push ve in-app kampanya bildirimi gider. Bu, ticari ileti onayı (İYS/KVKK) açısından da risk taşıyor.
- **Admin üzerinden yeniden gönderim (kısmen):** Admin PATCH'te geçiş tablosu yok; mevcut durumdan bağımsız olarak `APPROVED | REJECTED | SENT` yazılabiliyor (`app/api/admin/innovation/segment-proposals/[id]/route.ts:9-11, 36-43`). Bu yüzden `SENT → APPROVED` geri alınabiliyor ve bayi yeniden gönderebiliyor. Ancak admin arayüzü yalnızca `PENDING` kayıtları listeliyor (`app/api/admin/innovation/segment-proposals/route.ts:13`; `app/admin/innovation/page.tsx:323`). Gerçekçi tetikleme yalnızca **bayat sekme** ile oluşuyor: İki admin sekmesi (`/admin/innovation` ve `/admin/innovation/segment-proposals`) açıkken biri onaylar, bayi gönderir, diğer bayat sekmede "Onayla"ya basılır → kayıt `APPROVED`'a döner ve aynı kitleye ikinci gönderim mümkün olur. Kötü niyetli dış aktör senaryosu yok (yalnızca ADMIN); bu madde orta önem.
- **Düzeltme yaklaşımı:** Bir `SENDING` ara durumu ekleyin; gönderimi `prisma.$transaction` içinde `claim + notification.createMany` olarak yapın ya da outbox/kuyruğa (mevcut `outbox-process`) taşıyın. `targetCount/sentCount/skippedOptOut/truncated` alanlarını kaydedin. Kitleyi `isChannelEnabled(prefs, 'campaign', 'app'|'push')` ile filtreleyin. Admin PATCH'e açık bir geçiş tablosu ekleyin (`PENDING→APPROVED|REJECTED`, `APPROVED→REJECTED`; `SENT` terminal) ve `updateMany where status: <beklenen>` ile koşullu yazın. 500'ü aşan kitle için gönderimi ya sayfalayın ya da arayüzde "ilk 500'e gidecek" uyarısıyla açık onay isteyin.

---

## Uygulama (Dalga 2)

**Karar uygulandı: PARÇALA (§6.2).** `/dealer/innovation` artık tek satırlık `permanentRedirect` → `/dealer/offers?from=innovation` (sorgu parametreleri korunur; `layout.tsx` kaldırıldı). Yeni yüzey **Pazarlama › Teklifler** (`/dealer/offers`): sunucu önce sayfa (`requireAuth(['DEALER'])` + `HydrationBoundary`, açılışta istemci isteği yok), tek BFF `GET /api/dealer/offers` (bölüm bazlı `ready | disabled | error`), QDL v2 `ops` kaydı (`PanelPage`, `SectionCard`, `MetricTile`, `StatusBadge`, `EntityEditorSheet`, `ConfirmAction`, `QueryState`), TR/EN metin, hareket yalnız durum değişikliğinde (liste girişi `listItem` + `layout`, `useMotionPolicy` ile azaltılmış harekette statik; canlı teklifte kalan süre halkası CSS geçişi; sonsuz döngü yok). Form çekmeceleri `next/dynamic` ile yalnız açılınca yüklenir. `from=innovation` ile gelen bayiye parçaların yeni yerlerini gösteren bilgi kartı çıkar.

**Dosyalar:** `app/dealer/offers/page.tsx` · `components/dealer/b-teklifler/*` (ekran, 4 bölüm, 3 çekmece, api/copy/format/context) · `lib/dealer/offers/{rules,types,load.server,mutations.server}.ts` · BFF: `app/api/dealer/offers/route.ts`, `flash/route.ts`, `flash/[id]/route.ts`, `happy-hours/route.ts`, `happy-hours/[id]/route.ts`, `personal/route.ts`, `personal/candidates/route.ts` (hepsi `defineRoute`: rol + kiracı + zod + hız sınırı; yazmalar yalnız DEALER, ADMIN yalnız `?dealerId=` ile salt-okunur) · test `__tests__/lib/dealer-offers.test.ts` (33 test, geçiyor). **Emekli uçlar (tüketicisi yalnız bu sayfaydı):** `app/api/dealer/innovation/flash-offers/route.ts`, `flash-offers/[id]/route.ts`, `weekly-brief/route.ts` silindi.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Sayfa başlığı + açıklama | ÇALIŞIYOR | Teklifler `PageHeader` (tek h1), TR/EN, "Güncellendi: SS:dd" (İstanbul). |
| 2 | "Yenile" | ÇALIŞIYOR | `query.refetch`; zarf v2 `success:false` / HTTP hatası `OffersApiError` olarak fırlar, "boş veri" gibi işlenmez. |
| 3 | İlk yükleme | ÇALIŞIYOR | 5 istek → SSR'da tek yükleyici + aynı BFF; bölümler `allSettled` ile bağımsız. |
| 4 | Yükleniyor durumu | ÇALIŞIYOR | `QueryState skeleton="cards"` (statik iskelet); bölümler veri gelmeden "kayıt yok" demez. |
| 5 | Hata durumu | ÇALIŞIYOR | Bölüm bazlı `ErrorState` + "Tekrar dene"; bir bölüm düşerse diğerleri çalışır (testli). |
| 6 | Özellik bayrağı kapalı durumu | ÇALIŞIYOR | Flash platform ayarı kapalıysa kart kilit açıklaması (`disabled: platform`); `POST` 403 `MODULE_DISABLED` (testli). |
| 7 | Modül kapısı | ÇALIŞIYOR | Kişiye özel teklif + telafi şablonları `remedy_offers` modülüne bağlı (yükleyici + `defineRoute module`). `dealer_innovation` anahtarı artık tüketicisiz (bkz. Kalanlar). |
| 8 | Masa sinyali URL gösterimi | KALDIRILDI (bu yüzeyden) | §6.2: masa sinyali → Gelen Kutusu › Vakalar (o yüzeyin sahibine devredildi). Bilgi kartı oraya bağlanır. |
| 9 | "Kopyala" | KALDIRILDI (bu yüzeyden) | #8 ile aynı gerekçe. |
| 10 | `?table=M7` yönergesi (BOZUK) | KALDIRILDI | Hatalı yönerge metni sayfayla birlikte kalktı; doğru parametreli masa QR seti Vakalar'da yapılmalı. |
| 11 | Masa QR üretimi | KALDIRILDI (bu yüzeyden) | Vakalar / QR stüdyosuna devredildi. |
| 12 | Haftalık özet görüntüleme | KALDIRILDI (bu yüzeyden) | §6.2: haftalık özet → Bugün; doğru kaynak `/dealer/weekly-brief` (`/api/dealer/weekly-brief`, cron kaydı). |
| 13 | "Özeti yeniden üret" (BOZUK, Bulgu 1) | KALDIRILDI | Yazan uç `POST /api/dealer/innovation/weekly-brief` silindi → `DealerWeeklyBrief` artık yalnız cron'un kaydı; digest bildirimi/e-postası bir daha sessizce iptal edilemez. |
| 14 | Önerilen aksiyon metni (NPS dalı ölü) | KALDIRILDI | Hesaplayıcının bayi yüzeyinde tüketicisi kalmadı (yalnız admin demo seed kullanıyor). |
| 15 | "En çok geçen temalar" | KALDIRILDI | #14 ile aynı. |
| 16 | Flash form: Başlık | ÇALIŞIYOR | `TextField` 3–80 karakter, `<label for>`, sayaç; önceden doldurulmuş "Mutlu saat" yok. |
| 17 | Flash form: Metin | ÇALIŞIYOR | 5–280 karakter (sunucuda da). |
| 18 | Flash form: İndirim % (BOZUK) | ÇALIŞIYOR | Tür seçici (yüzde / tutar / ikram); `%1–90`, `1–5.000 ₺` tam sayı, ikramda değer yok — paylaşılan zod şeması (istemci + sunucu); `0 → %10`, `-20`, `%500` artık 400 (testli). |
| 19 | "Flash oluştur (30 dk)" | ÇALIŞIYOR | Süre 15/30/60/120/240 dk; hemen ya da İstanbul saatiyle ≤7 gün ileri planlama (sunucu otoriter pencere); çift tık: gönder kilidi + `Idempotency-Key` + advisory kilit altında "en fazla 3 açık teklif"; hız sınırı 10/dk; denetim izi `CREATE_FLASH_OFFER`. |
| 20 | Konumsuz bayide görünürlük (BOZUK) | ÇALIŞIYOR | "Kimler görür?" kartı gerçek veriden: konum var/yok (+ Ayarlar bağlantısı), mekânı kaydeden müşteri sayısı, mekân sayfası. Formda konumsuz uyarısı. İşletme adı yoksa oluşturma 409 (müşteri listeleri adsız mekânı göstermez → sahte başarı olurdu). |
| 21 | Flash açıklaması | ÇALIŞIYOR | Koşullar açıkça yazılı (Keşfet › Fırsatlar 15 km, kaydedenler, mekân sayfası). |
| 22 | "Aktif flash listesi" | ÇALIŞIYOR | `flashStatus` tek kaynak: Canlı / Planlı / Durduruldu / Bitti; açıklar üstte, geçmiş katlanır bölümde; kalan süre (dakikalık, sekme gizliyken durur); son 30 kayıt + "daha eski var" notu; durum istemcide de yeniden türetilir. |
| 23 | Flash durdurma / düzenleme / silme | ÇALIŞIYOR (durdurma) · KALDIRILDI (silme, düzenleme) | `PATCH …/flash/[id] {action:'stop'}` + `ConfirmAction`; koşullu `updateMany` (bitmişse 409); canlıysa bitiş şimdiye çekilir, denetim izi. Silme yok (arşiv ilkesi); yayındaki teklif düzenlenmez (müşterinin gördüğü metin değişmesin) — durdur + yeni teklif. |
| 24 | Kullanım sayacı (SAHTE) | KALDIRILDI | `maxRedemptions` / `redemptionCount` arayüzden ve yeni uçlardan çıkarıldı; kasada kod doğrulama akışı yok, sayı gösterilmiyor. |
| 25 | Segment şablon butonları | KALDIRILDI (bu yüzeyden) | §6.2: segment önerileri → Pazarlama › Kampanyalar (bilgi kartında bağlantı). `segment-proposals/*` uçları Müşteriler/Kampanyalar ile paylaşıldığı için dokunulmadı. |
| 26 | Taslak listesi | KALDIRILDI (bu yüzeyden) | #25 ile aynı. |
| 27 | Hedef kitle önizlemesi | KALDIRILDI (bu yüzeyden) | #25 ile aynı. |
| 28 | "Müşterilere gönder" | KALDIRILDI (bu yüzeyden) | #25 ile aynı. |
| 29 | Pazarlama izni / frekans | ÇALIŞIYOR (bu yüzeydeki gönderim için) | Kişiye özel teklif `resolveMarketingAudience` ile kampanya uygulama içi tercihini kontrol eder (kapalıysa 409 `CUSTOMER_OPTED_OUT`, seçicide "Kampanya bildirimleri kapalı"); günde en fazla 20. Segment gönderimi Kampanyalar sahibinde. |
| 30 | Admin onay akışı | KALDIRILDI (bu yüzeyden) | Segment taslağı akışı Kampanyalar / Admin Segmentler'e ait. |
| 31 | Personel/masa içgörüsü anahtarı (SAHTE) | KALDIRILDI | Görünür etkisi olmayan anahtar ve kullanıcıya gösterilen `/api/...` metni kalktı; tercih masa ısı haritasıyla birlikte Vakalar'da anlam kazanmalı. |
| 32 | Masa performansı görünümü | KALDIRILDI (bu yüzeyden) | Vakalar'a devredildi (`table-performance` ucu korunuyor). |
| 33 | "Son masa sinyalleri" | KALDIRILDI (bu yüzeyden) | Vakalar'a devredildi (`table-pulses` ucu korunuyor). |
| 34 | Sinyali "çözüldü" işaretleme | KALDIRILDI (bu yüzeyden) | Vakalar'a devredildi (`table-pulses/[id]/resolve` ucu korunuyor). |
| 35 | Canlı sinyal bildirimi | KALDIRILDI (bu yüzeyden) | Vakalar / uyarı kuralları kapsamı. |
| 36 | Public sinyal ucu koruması | KALDIRILDI (bu yüzeyden) | Public uç başka sahipte; çalışma ağacında ona IP + mekân başına hız sınırı eklenmiş görünüyor (gözlem, bu işin değişikliği değil). |
| 37 | Yetki (sahiplik) | ÇALIŞIYOR | Yeni uçlar `defineRoute tenant` (DEALER = kendi id'si); kayıtlar `where {id, dealerId}`; kişisel teklif müşterisi bayiye özgü HMAC `ref` ile seçilir (ham kullanıcı kimliği istemciye gitmez, başka bayinin ref'i çözülmez — testli). |
| 38 | Sayfa rol erişimi | ÇALIŞIYOR | `/dealer` DEALER; BFF yazmaları yalnız DEALER. |
| 39 | i18n (BOZUK) | ÇALIŞIYOR | Tüm metinler TR/EN (`components/dealer/b-teklifler/copy.ts`), dil sunucudan; tarihler `Europe/Istanbul` + `Intl.RelativeTimeFormat`. |
| 40 | Mobil yerleşim | ÇALIŞIYOR | Tek sütun → `lg` iki sütun; dokunma hedefleri ≥ 44px; çekmeceler mobilde tam genişlik. |
| 41 | Erişilebilirlik | ÇALIŞIYOR | `Field` ile etiket/açıklama/hata bağları, çip grupları `aria-labelledby`, switch `aria-label`, müşteri seçici `radiogroup`, durumlar ikon + metin (yalnız renk değil), token'lı odak halkaları. |

**Yeni özellikler (eksikler listesinden ve §6.2 hedefinden):**
- **Kişiye özel teklif (B5 / P0-22 `targetUserId`):** Flash tablosuna şema eklemeden, hedef müşteriye bağlı kaynaksız `RemedyOffer` (`source: personal`). Müşteri seçici (yalnız bu işletmeyi ziyaret etmiş müşteriler, Türkçe duyarsız arama, ulaşılabilirlik + açık teklif rozeti), mesaj, telafi şablonu allowlist'inden tür seçimi. Puan türü kabulde `acceptRemedyOffer → mintPoints` (bayi günlük bütçesi) ile `lib/economy` üzerinden basılır. Liste churn otomasyonunun açtıklarını da gösterir: durum rozetleri, "onay bekleyen" → Gelen Kutusu › Telafi onayı bağlantısı, son 30 gün kabul sayısı.
- **Telafi şablonları görünümü (§6.2 "Teklifler'de de görünür"):** işletme geneli + şube bazlı etkin seçenekler, kapalı şablon sayısı, sistem varsayılanı kullanılıyorsa açık uyarı; düzenleme Otomasyon › Telafi'ye bağlantı. Salt okunur; hata yutulmaz (`getRemedyOptions`'un sessiz varsayılanı kullanılmadı).
- **Mutlu saatler (kayıt anahtar kelimesi "happy hour"; önceden bayi arayüzü hiç yoktu):** liste (çarpan, saat, günler, İstanbul saatiyle "şu an uygulanıyor"), oluşturma (çarpan 1,5–3, platformun tek şeması `happyHourCreateSchema` ile yeniden doğrulama, en fazla 10 açık, denetim izi), duraklat/aç (koşullu, kiracı kapsamlı, denetim izi). Silme yok.

**Kapanan bulgular (bu yüzeyde):** 1 (yazan uç silindi), 4 (değer/süre/konum/yönetim/sahte sayaç), 5 (sahte anahtar ve geliştirici metni kalktı; masa uçları Vakalar'a devredildi), 6 (hatalı yönerge kalktı), 8 (hesaplayıcının bayi tüketicisi kalmadı), 9, 10, 11, 12, 13 (tek BFF + SSR). **Toplam 10.**

### Kalanlar (gerekçeli)
- **Bulgu 2 (public masa sinyali kötüye kullanımı)** ve **Bulgu 7 (tercihlerin tek `Settings` satırında RMW'si):** `app/api/innovation/table-pulse` ve `lib/innovation-dealer-prefs` masa sinyali hattına ait; masa sinyali Gelen Kutusu › Vakalar sahibine devredildi. Çalışma ağacında public uca hız sınırı eklenmiş görünüyor (başka ajan).
- **Bulgu 3 (segment gönderimi):** `segment-proposals/*` uçları Müşteriler › Segmentler ve Kampanyalar ile paylaşılıyor; çalışma ağacında rıza kapısı + transaction eklenmiş görünüyor. Admin geçiş tablosu Admin Segmentler sahibinde.
- **Masa sinyali / segment taslakları için geçici boşluk:** `/dealer/inbox/incidents` ve Kampanyalar'daki taslak listesi tamamlanana kadar bilgi kartındaki bağlantılar ilgili içeriği göstermez; sahiplerine bildirildi. `app/dealer/segment-actions/page.tsx:177` "Taslaklara git" hâlâ `/dealer/innovation`'a gidiyor (yönlendirmeyle Teklifler'e düşer); Müşteriler sahibi bunu `/dealer/campaigns`'e çevirmeli.
- **Flash teklif metrikleri (görüntülenme/tıklama/kullanım):** veri kaynağı yok; uydurma sayı gösterilmedi. Kasada tek kullanımlık kod akışı ödül teslim zinciri (F2.5) kapsamında.
- **Müşteri tarafı `take: 300` sırasız flash sorgusu** (`lib/places/data.server.ts`) Keşfet sahibinde.
- **`dealer_innovation` modül anahtarı** artık sayfa/uç tüketicisiz; modül kataloğu admin/navigasyon sahibinde. `app/api/admin/innovation/demo-package/route.ts:63` silinen `POST /api/dealer/innovation/weekly-brief` ucundan söz eden bir metin içeriyor (admin sahibinde).
- **Görsel doğrulama:** dev server ve build yasak olduğu için ekran görüntüsüyle doğrulanmadı; tip denetimi (bu yüzeyin dosyalarında 0 hata) ve 33 jest testiyle doğrulandı.
