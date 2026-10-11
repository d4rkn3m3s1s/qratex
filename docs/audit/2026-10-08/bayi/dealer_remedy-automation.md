# /dealer/remedy-automation

**Amaç:** Bayinin, düşük puanlı (veya AI'ın yüksek kayıp riski bulduğu) QR geri bildirimleri için otomatik "telafi teklifi taslağı" üretme kurallarını ayarladığı ekran. Taslaklar müşteriye doğrudan gitmez, `/dealer/remedy-queue` onay kuyruğuna düşer. Ekranda ayrıca son 14 günü geriye dönük tarayan "Şimdi tara" tetikleyicisi var.

**Genel puan:** 4.5 / 10 · **Karar:** yeniden tasarla (Telafi Merkezi altında kuyruk ve şablonlarla birleştirilerek)

Kısa özet: Arka uç döngüsü gerçek ve çalışıyor. Ayar kaydediliyor, analiz hattı ve satır içi yol her yeni geri bildirimde taslak üretiyor, onay kuyruğu da bağlı. Ancak ekran beş sayı alanı ve bir anahtardan oluşan çıplak bir form. Otomasyonun gerçekte nasıl çalıştığını (gerçek zamanlı tetik, churn tetiği, metin ya da AI zorunluluğu, anonim geri bildirimin dışarıda kalması) anlatmıyor, hiçbir sonuç metriği göstermiyor. Birkaç doğrulama hatası "Şimdi tara"yı kalıcı olarak bozabiliyor ya da reddedilmiş taslakları yeniden canlandırıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Kaydetme ve tarama çalışıyor. Ancak tarama reddedilen taslakları yeniden üretiyor, ondalık değer taramayı 500'e düşürüyor ve gerçek zamanlı tetik metinsiz ya da AI'sız geri bildirimde hiç çalışmıyor. |
| UX | 4/10 | Kural davranışı açıklanmıyor. Kaydedilmemiş değişiklik göstergesi, önizleme, istatistik ve "son tarama" bilgisi yok. Hata mesajı `[object Object]` olarak görünebiliyor. |
| Görsel | 4/10 | `max-w-xl` içinde düz bir shadcn formu. Hiyerarşi, ikonografi ve kart düzeni kardeş sayfalardan (kuyruk, şablonlar) farklı. Durum ya da etki görselleştirmesi yok. |
| Mimari | 4/10 | Aynı config ayrıştırıcısı ve varsayılanlar 3 dosyada kopya. Tarama ile çekirdek iki ayrı iş mantığı (ay başı yerel ya da UTC, bildirim var ya da yok). DB'de tekillik garantisi, transaction ve try/catch yok. |
| Performans | 6/10 | Sayfa hafif (tek GET). Tarama ise aday başına sırayla yaklaşık 6 sorgu atıyor (N+1). En fazla 25 aday için kabul edilebilir ama ölçeklenmiyor. |
| Erişilebilirlik + mobil | 4/10 | `Label`'lar input'lara `htmlFor` ile bağlı değil, Switch'in erişilebilir adı yok. Mobilde form tek kolon olduğu için kırılmıyor, ama 800 karakterlik mesaj tek satırlık input'ta. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (başlık ve açıklama) | KISMİ | `app/dealer/remedy-automation/layout.tsx:4-6`, `messages/tr.json:115-116` | Açıklama "kurallar, **yükseltme ve otomatik yanıtlar**" diyor. Sayfada yükseltme (escalation) ya da otomatik yanıt yok, metadata var olmayan özellik vaat ediyor. |
| 2 | "Ayarlar'a dön" bağlantısı | KISMİ | `page.tsx:91-96` | `/dealer/settings`'e gidiyor ama ayarlar sayfasında bu sayfaya bağlantı yok (`app/dealer/settings/page.tsx` içinde "remedy" ya da "telafi" geçmiyor). Sayfa kenar çubuğunda "feedback" grubunda (`components/dashboard/sidebar.tsx:257`). Breadcrumb mantığı yanlış. |
| 3 | Başlık ve açıklama kartı | ÇALIŞIYOR | `page.tsx:97-102` | i18n'li. |
| 4 | "Şablonlar & Mekanlar" bağlantısı | KISMİ | `page.tsx:103-108` | Çalışıyor ama etiket sabit Türkçe (`Şablonlar & Mekanlar`). EN kullanıcı Türkçe görüyor. |
| 5 | Ayarları yükleme (GET) | KISMİ | `page.tsx:39-50`, `app/api/dealer/remedy-automation/route.ts:40-54` | `r.ok` kontrol edilmiyor. 401/403 gibi `success:false` JSON yanıtlarında sessizce varsayılanlar gösteriliyor ve kullanıcı otomasyonu "kapalı" sanıyor. |
| 6 | Yükleniyor durumu | KISMİ | `page.tsx:117-118` | Düz metin. İskelet yok, başlık kartı hemen görünüyor. Diğer sayfalardaki `InlineLoadingStatus` ile tutarsız (`app/dealer/remedy-queue/page.tsx:6`). |
| 7 | Hata durumu (yükleme) | KISMİ | `page.tsx:45-46` | Yalnızca toast gösteriliyor, sayfada kalıcı hata ya da yeniden dene durumu yok. Form varsayılan değerlerle düzenlenebilir kalıyor. |
| 8 | "Otomasyon açık" anahtarı | ÇALIŞIYOR | `page.tsx:121-127` | Değer kaydediliyor. İpucu metni ("Kapalıyken tarama çalışmaz", `messages/tr.json:693`) eksik: açıkken **her yeni geri bildirimde gerçek zamanlı** taslak üretildiği söylenmiyor (`lib/inngest/feedback-analyze-pipeline.ts:121-131`, `app/api/feedbacks/route.ts:503-512`). |
| 9 | Puan eşiği (`minRating`) | KISMİ | `page.tsx:128-138`, `route.ts:21` | Adı "min" ama `rating <= minRating` (üst eşik) olarak çalışıyor. `max=5` serbest, yani 5 seçilirse **5 yıldızlı memnun müşteriye de** telafi taslağı üretiliyor. Ondalık değer (2.5) kabul ediliyor. Alan boşaltılınca `|| 2` ile 2'ye zıplıyor ve kullanıcı alanı temizleyip yazamıyor. |
| 10 | Tek seferde en fazla kuyruk (`maxPerRun`) | BOZUK (kenar durum) | `page.tsx:139-149`, `route.ts:22`, `apply-scan/route.ts:85` | Zod'da `.int()` yok. 2.5 kaydedilirse taramadaki `take: cfg.maxPerRun + 15` = 17.5 olur, Prisma `Int` beklediği için hata fırlatır. Route'ta try/catch olmadığından 500 döner ve tarama, ayar düzeltilene kadar kalıcı olarak bozulur. |
| 11 | Aylık üst limit (`maxMonthlyAuto`) | KISMİ | `page.tsx:150-160`, `apply-scan/route.ts:52-58`, `lib/remedy-automation-core.ts:78-85` | "Otomatik" limit diye adlandırılıyor ama **manuel** teklifler ve tüketim yorumu teklifleri de sayılıyor (filtre yalnızca `dealerId` ve status). Etiket "(otomatik + bekleyen)" diyerek kısmen uyarıyor. Mevcut kullanım (ör. 12/40) ekranda gösterilmiyor. |
| 12 | Müşteri mesajı şablonu | KISMİ | `page.tsx:161-168`, `route.ts:24` | 800 karakterlik metin için tek satırlık `Input`. `maxLength` ve sayaç yok. Boş string kabul ediliyor (`z.string().max(800)`, `min` yok), müşteriye boş mesaj gidebilir. `{isim}` gibi değişken, önizleme ve çoklu dil desteği yok. |
| 13 | Yerelleştirilmiş varsayılan mesaj | SAHTE (etkisiz) | `page.tsx:24-33` ve `route.ts:10-17, 52` | İstemcideki i18n varsayılanı (`defaultMessageTemplate`) GET yanıtındaki **sabit Türkçe** sunucu varsayılanıyla her zaman eziliyor (`{...mkDefault(), ...j.automation}`). EN bayi de Türkçe mesaj görüyor ve kaydediyor. |
| 14 | Kaydet (PATCH) | KISMİ | `page.tsx:56-73`, `route.ts:56-80` | Mutlu yol çalışıyor. Doğrulama hatasında sunucu `error: parsed.error.flatten()` **nesnesi** döndürüyor (`route.ts:64`), istemci `new Error(j.error)` yapınca toast "Dikkat: [object Object]" gösteriyor (`page.tsx:65`). Alan bazlı hata gösterimi yok. |
| 15 | Kaydedilmemiş değişiklik algısı | EKSİK | `page.tsx` genelinde | Dirty state, "kaydedilmemiş değişiklikler" uyarısı ve sayfadan çıkış koruması yok. Dil değişince `load` yeniden çalışıp düzenlemeleri siliyor (`page.tsx:50, 52-54`, `t` değişince `load` yeniden üretiliyor). |
| 16 | Yenile | ÇALIŞIYOR | `page.tsx:173-176` | Kaydedilmemiş düzenlemeleri uyarı vermeden atıyor. |
| 17 | "Şimdi tara" (geriye dönük 14 gün) | KISMİ | `page.tsx:75-87, 177-180`, `apply-scan/route.ts:34-149` | Çalışıyor ama: (a) **reddedilmiş ya da süresi dolmuş taslakları yeniden üretiyor** (bkz. Bulgu 1); (b) buton kayıtlı değil yerel `cfg.enabled`'a bakıyor, yani anahtar açılıp kaydedilmeden tıklanırsa sunucu 400 "Otomasyon kapalı" döner; (c) sonuçta yalnızca `queued` gösteriliyor, `skipped` ve kuyruk bağlantısı yok; (d) kaydedilmemiş eşiklerle değil kayıtlı eşiklerle taradığı söylenmiyor. |
| 18 | Tarama aday penceresi | KISMİ | `apply-scan/route.ts:74-87` | Yalnızca son 14 gün ve `take: maxPerRun + 15`. Son 20 düşük puanlının hepsinde zaten teklif varsa daha eski uygun adaylara hiç ulaşılmıyor. |
| 19 | Onay kuyruğu bağlantısı | ÇALIŞIYOR | `page.tsx:181-183` | Bekleyen sayı rozeti yok. |
| 20 | Gerçek zamanlı tetik (analiz hattı ve satır içi) | KISMİ | `lib/remedy-automation-core.ts:53-137`, `app/api/feedbacks/route.ts:432, 446, 503-512`, `lib/inngest/feedback-analyze-pipeline.ts:24-26` | Yalnızca **metni ≥5 karakter olan** ve **AI otomatik analizi açık** geri bildirimlerde çalışıyor. Metinsiz 1 yıldız ya da AI'ı kapalı bayi için gerçek zamanlı taslak hiç oluşmuyor. Ekranda bu bağımlılık yazmıyor. |
| 21 | Churn tetiği (`churnRisk ≥ 0.7`) | KISMİ | `lib/remedy-automation-core.ts:72-75` | Eşik sabit kodlu ve ekranda görünmüyor ya da ayarlanamıyor. `dealerChurnIntervention.churnThreshold` (`prisma/schema.prisma:95-96`) ile hizalı değil. |
| 22 | Anonim geri bildirim | KISMİ (belgelenmemiş) | `apply-scan/route.ts:80` (`userId: { not: null }`), `remedy-automation-core.ts:63` | Doğru davranış (anonim kullanıcıya teklif gidemez) ama kullanıcıya söylenmiyor. "Neden taslak oluşmadı?" sorusunun yanıtı yok. |
| 23 | Tüketim yorumu (ConsumptionReview) kapsamı | EKSİK | `maybeCreateAutoRemedyForFeedback` yalnızca 2 yerden çağrılıyor (feedback akışları); `app/api/dealer/consumption-reviews/[id]/remedy/route.ts` yalnızca manuel | Platformun ana yorum tipi olan tüketim yorumları otomasyonun dışında. |
| 24 | Bayiye bildirim | KISMİ | `remedy-automation-core.ts:124-134` var, `apply-scan/route.ts` yok | Gerçek zamanlı yol bildirim gönderiyor, tarama göndermiyor. Tutarsız ama taramayı kullanıcı kendisi başlattığı için kabul edilebilir. |
| 25 | Zaman çizelgesi ve analitik olayları | ÇALIŞIYOR | `apply-scan/route.ts:128-140`, `core:108-121` | `remedy_automation_queued` olayı yazılıyor ama bu sayfada hiç okunmuyor (istatistik yok). |
| 26 | Yetki ve IDOR | ÇALIŞIYOR | `route.ts:41-43, 57-59`, `apply-scan/route.ts:35-37, 82` | Her şey `session.user.id`'ye bağlı. Aday sorgusu `qrCode: { dealerId }` ile kapsanmış, IDOR bulunamadı. |
| 27 | Modül ve özellik kapısı | KISMİ | `components/dashboard/sidebar.tsx:257` (yalnızca menüde `moduleKey: 'remedy_offers'`) | Sayfa ve API modül kapalıyken de erişilebilir. `app/api/dealer` altında modül zorlaması yapan bir yardımcı bulunamadı (sistem geneli bir eksik). |
| 28 | Denetim kaydı (kim, ne zaman, neyi değiştirdi) | EKSİK | `route.ts:74-77` | PATCH JSON alanını sessizce üzerine yazıyor. Geçmiş ya da geri alma yok. |
| 29 | Hız sınırı (rate limit) | EKSİK | `apply-scan/route.ts` | Tarama sınırsız çağrılabiliyor. Aylık limit dolaylı bir tavan koyuyor. |
| 30 | Azaltılmış hareket ve motion | Uygulanamaz | `page.tsx` | Animasyon yok. Bu sayfa için doğru seçim, sorun değil. |

---

## Bulgular

### 1. Yüksek · Doğruluk/Veri: "Şimdi tara", reddedilmiş ve süresi dolmuş taslakları yeniden canlandırıyor
- **Kanıt:** `app/api/dealer/remedy-automation/apply-scan/route.ts:101-111` mevcut teklif kontrolünde yalnızca `['pending','awaiting_dealer_approval','accepted']` durumlarına bakıyor. Reddetme işlemi teklifi `status: 'rejected'` yapıyor (`app/api/dealer/remedy-offers/[id]/route.ts:66-70`). Aynı kontrol `lib/remedy-automation-core.ts:88-91` içinde de var.
- **Sorun:** Bayi kuyruktan bir taslağı bilinçli olarak reddediyor (örneğin müşteri trol ya da sorun çözülmüş). Son 14 gün içindeki bu geri bildirim için bir sonraki "Şimdi tara" aynı taslağı yeniden üretiyor. Kuyruk "bitmeyen iş"e dönüşüyor, reddetme kararı anlamsızlaşıyor ve aylık kotayı tüketiyor.
- **Öneri:** "Bu geri bildirim için otomasyon daha önce **herhangi bir** teklif üretti mi?" sorusunu kalıcı hale getirin. Ya `RemedyOffer`'a `source: 'auto' | 'manual'` ekleyip `feedbackId + source='auto'` için tüm durumlara bakın, ya da `Feedback.remedyAutomationProcessedAt` damgası tutun. Reddetmeye opsiyonel bir "bu müşteriye bir daha otomatik teklif önerme" seçeneği ekleyin.
- **Efor:** S

### 2. Yüksek · Doğruluk/Dayanıklılık: Ondalık değer taramayı kalıcı olarak 500'e düşürüyor; route'larda try/catch yok
- **Kanıt:** `route.ts:21-23` `z.number().min().max()` kullanıyor, `.int()` yok. `page.tsx:147` `Number(e.target.value)` ondalığı koruyor. `apply-scan/route.ts:85` `take: cfg.maxPerRun + 15`. Her iki route'ta da `try/catch` yok (grep sonucu boş).
- **Sorun:** `maxPerRun = 2.5` kaydedilirse Prisma `take` değerini reddediyor ve tarama her seferinde yakalanmamış istisnayla 500 dönüyor. İstemci boş gövdeyi `r.json()` ile okumaya çalışınca "Unexpected end of JSON input" toast'ı çıkıyor. `minRating=2.5` ise sessizce "2 ve altı" gibi davranıyor. DB kesintisinde GET ve PATCH da ham 500 dönüyor; diğer route'lar `responseIfDatabaseUnavailable` kullanıyor (`app/api/dealer/remedy-offers/[id]/route.ts:141`).
- **Öneri:** Şemayı `z.number().int()` yapın ve `parseRemedyAutomation` içinde `Math.trunc` ile clamp uygulayın (eski bozuk kayıtları da onarır). İstemcide alanları Select (1–5 yıldız) ya da tamsayı stepper yapın. Route'ları standart `try/catch + responseIfDatabaseUnavailable` ile sarın.
- **Efor:** S

### 3. Yüksek · Mimari/Veri bütünlüğü: Aynı geri bildirim için yarış koşulunda çift taslak; limit TOCTOU
- **Kanıt:** `findFirst` ile kontrol edip ardından `create` yapılıyor (`apply-scan/route.ts:101-125`, `core:88-106`). `RemedyOffer` modelinde `feedbackId` için tekillik yok (`prisma/schema.prisma:1327-1355`, yalnızca index var). Aylık sayım ve oluşturma ayrı adımlar.
- **Sorun:** Inngest analiz hattının yeniden denemesi, `ai-retry` cron'u ya da iki sekmeden aynı anda yapılan tarama aynı `feedbackId` için iki taslak üretebilir. Müşteriye iki teklif yayınlanabilir. Aylık limit de eşzamanlı akışlarda aşılabilir. (Yeniden deneme senaryosu kod okumasıyla çıkarıldı, canlıda doğrulanmadı.)
- **Öneri:** Kısmi tekil index ekleyin: `CREATE UNIQUE INDEX ... ON "RemedyOffer"("feedbackId") WHERE source='auto'` (ya da aktif durumlar). Oluşturmayı `P2002` yakalayan idempotent bir yazmaya çevirin. Aylık limiti `pg_advisory_xact_lock(dealerId)` ile transaction içinde sayıp yazın. Proje hafızasındaki "atomik tek seferlik kredi" desenini izleyin.
- **Efor:** M

### 4. Orta · Doğruluk/UX: Doğrulama hatası "[object Object]" olarak görünüyor
- **Kanıt:** `route.ts:64` `{ error: parsed.error.flatten() }` (nesne). `page.tsx:65` `throw new Error(j.error || …)`.
- **Sorun:** Örneğin `minRating=9` girildiğinde (HTML `max` engellemiyor, input yazılabilir) kullanıcı "Dikkat: [object Object]" görüyor.
- **Öneri:** API'de `{ error: 'Geçersiz değerler', fieldErrors }` sözleşmesine geçin. İstemcide alan altı hata mesajı gösterin; `react-hook-form` + paylaşılan zod şeması kullanılabilir.
- **Efor:** S

### 5. Orta · Ürün/İşlevsellik: Gerçek zamanlı otomasyon metne ve AI'a bağımlı; kapsam ekranda anlatılmıyor
- **Kanıt:** Tetik, yalnızca `text.trim().length >= 5` ve `aiSettings.isEnabled && autoAnalyze` koşullarında çalışan analiz bloğunun içinde (`app/api/feedbacks/route.ts:432-446, 503-512`). Analiz hattı metinsiz geri bildirimi atlıyor (`lib/inngest/feedback-analyze-pipeline.ts:24-26`). Tüketim yorumları için otomatik yol yok.
- **Sorun:** En mutsuz müşteri profili olan "sadece 1 yıldız verip gidenler" gerçek zamanlı otomasyonda hiç yakalanmıyor; bayi yalnızca manuel tarama ile yakalayabiliyor. AI'ı kapalı bayi için otomasyon fiilen yalnızca "Şimdi tara". Bayi bunu bilmiyor.
- **Öneri:** Puan tetiğini AI analizinden ayırın: geri bildirim oluşturulduğu anda (`after()` içinde, AI bloğundan bağımsız) `maybeCreateAutoRemedyForFeedback` çağrılsın, churn tetiği ise analiz sonrası ikinci bir şans olarak kalsın. Tüketim yorumu için `maybeCreateAutoRemedyForReview` ekleyin. Ekranda "Kapsam" kutusu gösterin: hangi kaynaklar, anonimler hariç, AI gereksinimi.
- **Efor:** M

### 6. Orta · Ürün/Güvenlik ağı: Eşik ve mesaj için anlamsız ya da zararlı değerler kabul ediliyor
- **Kanıt:** `minRating` için `max(5)` (`route.ts:21`), `messageTemplate` için `min` yok (`route.ts:24`). Kontrol `rating <= cfg.minRating` (`core:73`, `apply-scan/route.ts:79`).
- **Sorun:** Eşik 5 yapılırsa her memnun müşteri için de telafi taslağı üretilir. Boş mesajla müşteriye açıklamasız teklif gider. Alan adı "En düşük puan" ama davranış "bu puan ve altı"; kafa karıştırıcı.
- **Öneri:** Eşiği 1–3 aralığında yıldız seçici yapın ve "≤ ★★" diye gösterin. Mesaja `min(10)` ve trim uygulayın. Alan adını `ratingThreshold` olarak değiştirip eski alanı geriye uyumlu okuyun.
- **Efor:** S

### 7. Orta · Mimari: Config ayrıştırıcısı, varsayılanları ve iş mantığı üç kopya
- **Kanıt:** `route.ts:10-38`, `apply-scan/route.ts:11-29`, `lib/remedy-automation-core.ts:21-41`. Tarama, çekirdeği kullanmadan kendi döngüsünü yazmış (`apply-scan/route.ts:92-141`). Ay başı farkı: tarama yerel saat (`apply-scan/route.ts:48-50`), çekirdek UTC (`core:43-46`). Bildirim yalnızca çekirdekte.
- **Sorun:** Bulgu 1'deki gibi bir düzeltme üç yere yapılmak zorunda; davranışlar zaten ayrışmış. Türkiye (UTC+3) için ay sınırı 3 saat kaymış.
- **Öneri:** Route'lar yalnızca `parseRemedyAutomation` ve `remedyAutomationSchema` (zod, tek kaynak) kullansın. Tarama, adayları bulup her biri için `maybeCreateAutoRemedyForFeedback` çağırsın ve `reason` sayaçlarını döndürsün. Ay başını bayi saat dilimine (`Europe/Istanbul` varsayılan) göre hesaplayan tek yardımcı yazın.
- **Efor:** M

### 8. Orta · UX: Yerel ve kayıtlı durum ayrışması (kaydedilmemiş değişiklik, tarama butonu)
- **Kanıt:** `page.tsx:177` `disabled={scanning || !cfg.enabled}` yerel duruma bakıyor. Tarama sunucuda kayıtlı config'i okuyor (`apply-scan/route.ts:39-46`). Dirty takibi yok.
- **Sorun:** Kullanıcı anahtarı açıp kaydetmeden "Şimdi tara"ya basarsa "Otomasyon kapalı" hatası alıyor. Eşiği 3 yapıp kaydetmeden tarayınca eski eşikle taranıyor ve bunu fark etmiyor.
- **Öneri:** Form durumunu `saved` ile `draft` olarak ikiye ayırın. Dirty iken sticky bir "Kaydedilmemiş değişiklikler · Kaydet / Vazgeç" çubuğu gösterin. "Şimdi tara"yı ya kaydedilmiş config'e bağlayın ya da "Kaydet ve tara" yapın. `beforeunload` koruması ekleyin.
- **Efor:** S

### 9. Orta · UX/Ürün: Sonuç görünürlüğü yok (kaç taslak, kota, kabul oranı, son çalışma)
- **Kanıt:** Sayfa yalnızca config okuyor (`page.tsx:42`). `remedy_automation_queued` olayları (`core:114-121`) ve teklif durumları DB'de var ama gösterilmiyor. Tarama toast'ı yalnızca `queued` gösteriyor (`page.tsx:81`), `skipped` ve `offerIds` atılıyor.
- **Sorun:** Bayi otomasyonun işe yarayıp yaramadığını göremiyor: bu ay kaç taslak üretildi, kaçı yayınlandı ya da reddedildi, kaçını müşteri kabul etti, kota ne kadar dolu.
- **Öneri:** GET yanıtını `stats` ile genişletin (tek `groupBy` sorgusu ve Redis cache): `monthUsed / cap`, `awaitingCount`, durum dağılımı, kabul oranı, `lastRunAt`. Üstte 4 KPI kutucuğu ve bir kota çubuğu gösterin. Tarama sonucunu "3 taslak eklendi · 5 atlandı (2 anonim, 3 mevcut teklif)" şeklinde bir sonuç paneliyle ve "Kuyruğa git" CTA'sıyla verin.
- **Efor:** M

### 10. Orta · i18n: Türkçe ve İngilizce karışıklığı; yerelleştirilmiş varsayılan etkisiz
- **Kanıt:** `page.tsx:106` sabit "Şablonlar & Mekanlar". Sunucu hataları sabit Türkçe (`apply-scan/route.ts:45, 63`). Sunucu varsayılan mesajı Türkçe ve istemci i18n varsayılanını eziyor (`route.ts:15-16, 52` → `page.tsx:44`). Bağlı şablonlar sayfası tamamen sabit Türkçe (`app/dealer/remedy-automation/templates/page.tsx:37-41, 179-185`).
- **Sorun:** EN arayüzlü bayi Türkçe bağlantı, hata ve müşteri mesajı görüyor; müşteriye giden metin de dil seçimine duyarsız.
- **Öneri:** Sunucu yalnızca makine kodu döndürsün (`AUTOMATION_DISABLED`, `MONTHLY_CAP_REACHED`), istemci çevirsin. Mesaj şablonunu `{ tr, en }` olarak saklayın ve müşterinin diline göre seçin. Kaydedilmemiş bir config için istemci varsayılanı geçerli olsun (sunucu `automation: null` döndürebilir).
- **Efor:** M

### 11. Orta · Performans: Taramada N+1 ve sıralı yazımlar
- **Kanıt:** `apply-scan/route.ts:92-141`: her aday için `findFirst` + `getRemedyOptions` (1–2 sorgu, `lib/remedy-options.ts:48-60`) + `create` + 2× timeline + `analyticsEvent`. En fazla 25+15 aday.
- **Sorun:** En kötü durumda yaklaşık 150 sıralı sorgu (Neon pooler gecikmesiyle saniyeler) ve kısmi başarısızlıkta yarım kalan durum.
- **Öneri:** Mevcut teklifleri tek `findMany({ feedbackId: { in } })` ile önceden çekin. Seçenekleri `locationId` bazında hafızada cache'leyin. Teklif, timeline ve analitik yazımlarını aday başına bir `$transaction` içinde yapın. Kuyruk varsa (Inngest) taramayı arka plan işine çevirip ilerleme gösterin.
- **Efor:** M

### 12. Düşük · Erişilebilirlik: Etiket–alan bağı ve Switch adı yok
- **Kanıt:** `page.tsx:123, 129, 140, 151, 162` `<Label>` için `htmlFor` yok; Input'larda `id` yok. `page.tsx:126` Switch'te `id` ya da `aria-label` yok. Karşılaştırma: `components/dealer/churn-intervention-settings.tsx:115` `id="churn-offer"` kullanıyor.
- **Sorun:** Ekran okuyucu alanları adsız okuyor; etikete tıklamak alanı odaklamıyor. İpucu metinleri `aria-describedby` ile bağlı değil.
- **Öneri:** `useId()` ile `id`, `htmlFor` ve `aria-describedby` üçlüsünü kurun; shadcn `Form` bileşenlerini kullanın.
- **Efor:** S

### 13. Düşük · Bilgi mimarisi: Yanlış geri dönüş hedefi ve yanıltıcı metadata
- **Kanıt:** `page.tsx:91-96` "Ayarlar'a dön". Ayarlar sayfasında bu sayfaya bağlantı yok. Kenar çubuğu grubu `feedback` (`sidebar.tsx:257`). Metadata "yükseltme ve otomatik yanıtlar" vaat ediyor (`messages/tr.json:116`).
- **Öneri:** Geri dönüş yerine "Geri bildirim › Telafi › Otomasyon" breadcrumb'ı kullanın ve metadata açıklamasını gerçek kapsama göre düzeltin.
- **Efor:** S

### 14. Düşük · Güvenlik/Yönetişim: Modül kapısı, denetim kaydı ve hız sınırı yok
- **Kanıt:** Modül kontrolü yalnızca menüde (`sidebar.tsx:257`). PATCH değişikliği loglamıyor (`route.ts:74-77`). Taramada rate limit yok.
- **Öneri:** Merkezi bir `requireDealerModule('remedy_offers')` yardımcısı ekleyin (sistem geneli). Config değişikliğinde `analyticsEvent` ya da `auditLog` kaydı (önce/sonra) tutun. Taramayı bayi başına dakikada 1 ile sınırlayın (Upstash).
- **Efor:** S–M

---

## Eksik özellikler (kıyas: Medallia closed-loop, Qualtrics XM Actions, Yelp/Google yanıt otomasyonları, Toast/Square sadakat telafileri)

1. **Kural oluşturucu (koşul → aksiyon):** Puan dışında koşullar: duygu (sentiment), tema veya konu (ör. "servis yavaşlığı"), mekan, kanal, saat aralığı, churn eşiği. Birden çok kural ve öncelik sırası (Medallia "Alert rules", Qualtrics "Actions").
2. **Önizleme ve deneme modu (dry-run):** "Bu kurallarla son 30 günde 23 taslak oluşurdu, tahmini maliyet ₺X" simülasyonu ve müşterinin göreceği kartın canlı önizlemesi.
3. **Müşteri başına sıklık sınırı (cooldown):** Aynı müşteriye N gün içinde en fazla 1 otomatik telafi. Düşük puanla telafi toplama (gaming) riskine karşı koruma.
4. **Etki analitiği:** Taslak, yayın, kabul ve geri dönen müşteri hunisi; telafi sonrası puan değişimi; aylık bütçe kullanımı (yüzde değil para birimi cinsinden).
5. **Kademeli otomasyon:** "Yalnızca taslak" / "X tutarın altındakileri otomatik yayınla" / "SLA dolunca yöneticiye yükselt" seçenekleri, onay kuyruğunda bekleme süresi hatırlatması.
6. **Mesaj kişiselleştirme:** `{isim}`, `{mekan}`, `{tarih}` değişkenleri, çok dilli şablon, A/B varyantı ve marka tonu için AI yeniden yazım önerisi.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi bu ekranı açtığında 3 soruya 5 saniyede yanıt alabilmeli: *Otomasyon çalışıyor mu? Bu ay ne üretti ve ne kazandırdı? Hangi kural neyi tetikliyor?* Ardından tek bir yerden kuralı değiştirip etkisini önizleyebilmeli.

**Yerleşim (masaüstü, 2 kolon; mobilde tek kolon akış):**
1. **Durum şeridi (üst, tam genişlik):** Büyük durum anahtarı ("Aktif · gerçek zamanlı"), yanında kota çubuğu (`12 / 40 bu ay`), "Kuyrukta 4 taslak →" rozeti ve son çalışma zamanı.
2. **KPI satırı:** Üretilen, yayınlanan, reddedilen ve müşteri kabul oranı (4 kutucuk). Tıklanınca kuyruk filtrelenmiş açılıyor.
3. **Sol kolon · Kurallar:** Kart tabanlı kural listesi ("★≤2 VE metin var → taslak", "churn ≥ %70 → taslak"). Her kuralda koşul çipleri, mekan kapsamı ve kullanılan şablon seti. "Kural ekle" sheet'i.
4. **Sağ kolon · Müşteri önizlemesi:** Müşteri tarafındaki telafi kartının birebir önizlemesi (mesaj, değişkenler çözülmüş, seçilebilir seçenekler, mekana göre şablon). Mesaj editörü (textarea, sayaç, değişken ekleme, dil sekmeleri) bu panele bağlı.
5. **Alt bölüm · Geriye dönük tarama:** "Son 14 günü tara" butonu yerine önce dry-run ("9 aday bulundu: 5 yeni, 3 mevcut, 1 anonim") ve ardından "Kuyruğa ekle". Sonuç paneli kalıcı olsun.
6. **Sticky kaydet çubuğu:** Yalnızca dirty iken; "Vazgeç / Kaydet".

**Motion ve 3D:** 3D gerekmiyor. Ayar ve operasyon ekranında üç boyut gürültü olur. Ölçülü framer-motion (`m as Motion`) kullanımı yeterli: kota çubuğunun değer değişiminde dolum animasyonu, KPI sayılarında kısa count-up, kaydet çubuğunun alttan kayarak girişi, tarama sonucunda ilgili satırların vurgulu girişi. Hepsi `useReducedMotion()` ile anlık geçişe düşmeli. Durum anahtarı açıkken küçük bir "canlı" nabız noktası (reduced-motion'da statik) otomasyonun gerçek zamanlı olduğunu anlatır.

**Veri/API değişiklikleri:**
- `GET /api/dealer/remedy-automation` → `{ automation, stats: { monthUsed, cap, awaiting, byStatus, acceptRate, lastRunAt } }` (tek `groupBy`, 60 sn Redis cache, mutasyonda invalidate).
- `POST /api/dealer/remedy-automation/apply-scan?dryRun=1` → aday listesi ve neden kodları; `dryRun=0` çekirdek fonksiyonu çağırır ve `reason` sayaçlarını döndürür.
- Config şeması v2: `{ enabled, rules: [{ id, when: { maxRating, minChurn, requireText, locationIds, topics }, cooldownDays }], message: { tr, en }, monthlyCap, autoPublishUnder? }`. `parseRemedyAutomation` v1'i v2'ye taşır.
- `RemedyOffer.source` (`auto|manual`) alanı ve aktif auto teklifler için kısmi tekil index; aylık sayım yalnızca `source='auto'` üzerinden.
- Tetik, AI analizinden bağımsız ve geri bildirim oluşturulunca çalışacak; tüketim yorumları için eşdeğer çekirdek fonksiyon eklenecek.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/remedy-queue`** (onay kuyruğu) ve **`/dealer/remedy-automation/templates`** (şablonlar ve mekanlar) bu sayfayla aynı alanı üç ayrı ekrana bölüyor. Kenar çubuğunda kuyruk ve otomasyon iki ayrı öğe (`sidebar.tsx:256-257`), şablonlar ise yalnızca bu sayfadaki bir butonla erişilebiliyor. **Öneri:** Tek bir **"Telafi Merkezi"** (`/dealer/remedy`) altında sekmeler: *Kuyruk* (varsayılan, bekleyen sayı rozetli) · *Otomasyon* · *Şablonlar & Mekanlar* · *Sonuçlar*. Eski rotalar yönlendirme olarak kalsın.
- **`/dealer/churn-risk`** içindeki `ChurnInterventionSettings` (`components/dealer/churn-intervention-settings.tsx:16, 115`, `autoFlashOffer`) da kayıp riskine otomatik teklif üretiyor. Bu sayfanın sabit `churnRisk ≥ 0.7` tetiği (`lib/remedy-automation-core.ts:74`) ile kavramsal olarak çakışıyor ve eşikleri ayrı. **Öneri:** Churn tetiği tek yerde tanımlansın (kural oluşturucuda bir kural olarak); churn sayfası bu kurala bağlantı versin.
- **`/dealer/settings/auto-replies`** "otomatik yanıt" kurallarıyla aynı "koşul → aksiyon" kalıbını taşıyor. Uzun vadede tek bir "Otomasyonlar" kural motoru (yanıt, telafi, eskalasyon) bileşen ve şema olarak paylaşılabilir. Kısa vadede en azından ortak kural kartı UI bileşeni kullanılabilir.
- Sayfa **kaldırılmamalı**: arka uç değeri gerçek ve aktif bir döngünün (analiz → taslak → onay → müşteri) yapılandırma noktası.

---

## Doğrulama (şüpheci inceleme)

Salt okunur inceleme; kod, veritabanı ve sunucu çalıştırılmadı. Her iddia çağıran ve çağrılan taraflar okunarak çürütülmeye çalışıldı.

### 1. "Şimdi tara" reddedilen taslakları yeniden kuyruğa ekliyor — **DOĞRULANDI** (önem: Orta; "kritik" abartılı)

- **Kanıt:** Reddetme `status: 'rejected'` yazıyor (`app/api/dealer/remedy-offers/[id]/route.ts:66-70`). Taramadaki tekrar kontrolü yalnızca `['pending','awaiting_dealer_approval','accepted']` durumlarına bakıyor (`app/api/dealer/remedy-automation/apply-scan/route.ts:101-111`). Aday sorgusu son 14 günü kapsıyor (`apply-scan/route.ts:74-87`) ve `RemedyOffer` tarafında herhangi bir "bu geri bildirim reddedildi" kaydı tutulmuyor.
- **Yeniden üretim:** 1) Otomasyon açık, 1 yıldızlı bir geri bildirim var. 2) "Şimdi tara" ile taslak oluşur. 3) Bayi `/dealer/remedy-queue` ekranında taslağı reddeder. 4) Aynı gün tekrar "Şimdi tara" denir ve aynı `feedbackId` için yeni bir `awaiting_dealer_approval` teklifi oluşur. 14 gün boyunca her tarama aynı sonucu verir.
- **Kota etkisi:** Aylık sayaç `rejected` durumunu saymıyor (`apply-scan/route.ts:52-58`), bu yüzden reddedilen kopya kotadan düşer. Yeniden üretilen her taslak ise kotayı tekrar tüketir. Bayi reddetmeye devam ederse kota şişmez ama kuyruk gürültüsü sürer. Bayi yanlışlıkla yayınlarsa, açıkça reddettiği bir teklif müşteriye gider.
- **Düzeltme notu:** İddiadaki "süresi dolan" kısmı geçersiz. Repo genelinde `status: 'expired'` yazan kod yok; durum yalnızca şema yorumunda geçiyor (`prisma/schema.prisma:1334`). Analiz hattı (`lib/remedy-automation-core.ts:88-92`) geri bildirim başına bir kez çalıştığı için yeniden üretim yalnızca manuel tarama yolunda oluyor.
- **Öneri:** Tekrar kontrolü "bu geri bildirim için **herhangi bir** otomatik teklif var mı?" sorusuna çevrilmeli (`status` filtresi kaldırılmalı ya da `rejected` eklenmeli). Daha sağlam yaklaşım: `RemedyOffer.source` (`auto|manual`) alanı eklemek ve tekrar kontrolünü `source='auto'` üzerinden, bayinin tanımlayacağı bir `cooldownDays` ile yapmak. Tarama ve çekirdek fonksiyon aynı mantığı kullanmalı. Bunun için `apply-scan` döngüsü `maybeCreateAutoRemedyForFeedback` fonksiyonunu çağıracak şekilde birleştirilmeli; şu an iki ayrı kopya var.

### 2. Ondalık `maxPerRun` kaydedilince tarama her çağrıda 500 dönüyor — **DOĞRULANDI** (önem: Orta, bayinin kendi ayarıyla tetiklenir)

- **Kanıt:** Arayüzde `Number(e.target.value)` kullanılıyor (`app/dealer/remedy-automation/page.tsx:147`). `<form>` olmadığı için `step` doğrulaması devreye girmiyor ve `2.5` olduğu gibi gönderiliyor. Şemada `z.number().min(1).max(25)` var, `.int()` yok (`app/api/dealer/remedy-automation/route.ts:22`), bu yüzden değer kabul edilip saklanıyor (`route.ts:72-77`). Taramada `take: cfg.maxPerRun + 15` ifadesi `17.5` oluyor (`apply-scan/route.ts:85`). Prisma `take` için `Int` beklediğinden `PrismaClientValidationError` fırlatır. Route'ta `try/catch` olmadığı için (`apply-scan/route.ts:34-149`) yanıt yakalanmamış bir 500 olur. Sayfa `r.json()` çağrısında da hata alır ve kullanıcı yalnızca genel bir hata toast'ı görür (`page.tsx:78-83`).
- **Aynı sınıftan ikinci tetik:** `minRating` için de `.int()` yok (`route.ts:21`). `Feedback.rating` alanı `Int` (`prisma/schema.prisma:771`), bu yüzden `minRating=2.5` değeri `rating: { lte: 2.5 }` sorgusunu (`apply-scan/route.ts:80`) da büyük olasılıkla validation hatasına düşürür. Bu ikinci tetik çalıştırılarak doğrulanmadı. Çekirdekteki `rating <= cfg.minRating` (`lib/remedy-automation-core.ts:73`) ise JS karşılaştırması olduğundan etkilenmez.
- **Yeniden üretim:** "Tek seferde en fazla kuyruk" alanına `2.5` yazılır ve Kaydet'e basılır (200 döner). Ardından "Şimdi tara"ya basılır: 500 döner ve genel toast görünür. Değer tam sayıyla yeniden kaydedilene kadar tarama bozuk kalır.
- **Öneri:** Zod şemasında `minRating`, `maxPerRun` ve `maxMonthlyAuto` için `.int()` eklenmeli. `parseAutomation` okurken `Math.floor` ve clamp uygulamalı; `lib/churn-intervention-core.ts:36` bunu zaten doğru yapıyor. Üç kopya parser tek bir `parseRemedyAutomation` içinde toplanmalı. `apply-scan`, `responseIfDatabaseUnavailable` ile birlikte `try/catch` içine alınmalı. Arayüzde `step={1}`, `inputMode="numeric"` ve alan düzeyinde hata mesajı gösterilmeli; zod `flatten()` çıktısı da obje olarak toast'a verilmemeli (`page.tsx:65`).

### 3. Aynı geri bildirim için çift telafi teklifi (yarış koşulu) — **BELİRSİZ** (kod düzeyinde yarış var ama iddia edilen etki abartılı; önem: Düşük)

- **Doğru olan:** Hem `lib/remedy-automation-core.ts:88-106` hem `apply-scan/route.ts:101-125` "önce `findFirst`, sonra `create`" desenini kullanıyor. Kilit, transaction ya da tekil kısıt yok; `RemedyOffer` modelinde yalnızca `@@index([feedbackId])` var (`prisma/schema.prisma:1348`). Bu yüzden eşzamanlı iki akış teorik olarak aynı `feedbackId` için iki taslak üretebilir. Aylık limit de aynı TOCTOU desenini taşıyor ve eşzamanlı taramalarda en fazla `maxPerRun` kadar aşılabilir.
- **Çürütülen kısımlar:**
  - *Inngest yeniden denemesi:* Yeniden deneme önceki denemeden **sonra** ve sırayla çalışır. İlk denemede oluşturulan teklif `findFirst` ile bulunur ve `already_exists` döner (`remedy-automation-core.ts:88-92`). Burada eşzamanlılık yok.
  - *Satır içi yol ve Inngest birlikte:* Satır içi yol yalnızca Inngest kapalıyken çalışıyor (`app/api/feedbacks/route.ts:502`), yani iki yol aynı geri bildirim için birlikte çalışmıyor.
  - *Tek sekmede çift tıklama:* Buton `scanning` sürerken devre dışı (`page.tsx:177`).
- **Gerçekçi tek senaryo:** İki sekmeden aynı anda (milisaniye düzeyinde) "Şimdi tara" denmesi ya da bir taramanın, yeni gelen geri bildirimin analiz hattıyla `findFirst` ve `create` arasındaki `getRemedyOptions` sorgusu kadar dar bir pencerede çakışması. Bu senaryo canlıda doğrulanmadı.
- **Etki sınırlı:** Her iki kopya da `awaiting_dealer_approval` durumunda oluşuyor. Müşteriye ulaşmaları için bayinin **ikisini de** kuyruktan elle yayınlaması gerekir (`remedy-offers/[id]/route.ts:56-59, 89-92`). Ayrıca müşterinin kabulü otomatik puan ya da para basmıyor, yalnızca seçimi kaydediyor (`app/api/customer/remedy/[offerId]/route.ts:160-168`). Sistem zaten geri bildirim başına çoklu teklife izin veriyor: manuel telafi yolu hiç tekrar kontrolü yapmadan `create` çağırıyor (`app/api/dealer/feedbacks/[id]/remedy/route.ts:79-89`). Yani "geri bildirim başına tek teklif" bir veri değişmezi değil.
- **Öneri:** Kalıcı çözüm olarak `source='auto'` olan aktif teklifler için kısmi tekil index (`CREATE UNIQUE INDEX ... ON "RemedyOffer"("feedbackId") WHERE source='auto' AND status IN (...)`) eklenebilir ve `create` çağrısındaki `P2002` hatası "already_exists" olarak yutulabilir. Aylık kota için sayım ve oluşturma işlemi bayi başına `pg_advisory_xact_lock(hashtext(dealerId))` içeren tek bir `$transaction` ile yapılabilir. Bu düzeltme 1. bulgudaki `source` alanıyla birlikte yapılmalı.

---

## Uygulama (Dalga 2)

**Yeni rota:** `/dealer/automation/remedy` (Otomasyon › Telafi). Eski `/dealer/remedy-automation` ve `/templates` sorgu korunarak kalıcı yönlendirir (şablonlar `#katalog`'a).
**Dosyalar:** `app/dealer/automation/remedy/page.tsx` · `components/dealer/b-otomasyon/{remedy-screen,remedy-catalog}.tsx` · `lib/dealer-automation/{remedy-config,remedy-catalog,remedy.server}.ts` · BFF `app/api/dealer/automation/remedy/**` (modül `remedy_offers`, kiracı, zod, hız sınırı) · çekirdek `lib/remedy-automation-core.ts` (tek mantık, geriye uyumlu adlar) · `lib/feedback-ai-dispatch.ts` (AI'sız yolda puan tetiği). Eski `app/api/dealer/remedy-automation/**` kaldırıldı.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Metadata | ÇALIŞIYOR — gerçek kapsamı anlatıyor |
| 2 | Geri bağlantısı | ÇALIŞIYOR — Otomasyon gezinmesi |
| 3 | Başlık kartı | ÇALIŞIYOR |
| 4 | Şablonlar bağlantısı | ÇALIŞIYOR — katalog aynı sayfada (`#katalog`), Türkçe |
| 5 | Ayar yükleme | ÇALIŞIYOR — SSR + zarf v2; hata varsayılan gibi görünmez |
| 6 | Yükleniyor | ÇALIŞIYOR — iskelet |
| 7 | Hata | ÇALIŞIYOR — QueryState (yeniden dene, modül kapalı durumu); form gösterilmez |
| 8 | Açık anahtarı | ÇALIŞIYOR — "gerçek zamanlı" açıklaması, canlı nokta (azaltılmış harekette statik) |
| 9 | Puan eşiği | ÇALIŞIYOR — 1–3 çip ("2 ★ ve altı"), tam sayı; eski 4–5 kayıtları 3'e kırpılır |
| 10 | Tarama başına sınır | ÇALIŞIYOR — `.int()` + okumada `Math.trunc`/kırpma; 500 riski yok |
| 11 | Aylık sınır | ÇALIŞIYOR — yalnız OTOMATİK taslaklar (İstanbul ayı), kullanım çubuğu |
| 12 | Mesaj | ÇALIŞIYOR — çok satır, sayaç, en az 10, `{{musteri}}`/`{{isletme}}`, müşteri önizlemesi |
| 13 | Yerelleştirilmiş varsayılan | ÇALIŞIYOR — tek kaynak sunucu varsayılanı |
| 14 | Kaydet | ÇALIŞIYOR — Türkçe alan hataları, denetim kaydı |
| 15 | Kaydedilmemiş değişiklik | ÇALIŞIYOR — DirtyBar (Kaydet/Vazgeç, ⌘S, çıkış uyarısı) |
| 16 | Yenile | KALDIRILDI — React Query tazeleme + "Vazgeç" yeterli |
| 17 | Şimdi tara | ÇALIŞIYOR — önce "dene" (yazmaz), sonra "N taslağı ekle"; kayıtlı ayarla; kirliyken kilitli; sonuç paneli + kuyruk bağlantısı |
| 18 | Aday penceresi | ÇALIŞIYOR — teklifi olan yorumlar sorguda dışlanır, aynı müşterinin tek yorumu |
| 19 | Kuyruk bağlantısı | ÇALIŞIYOR — bekleyen sayılı (Gelen Kutusu › Telafi onayı) |
| 20 | Gerçek zamanlı tetik | ÇALIŞIYOR — puan tetiği AI/metinden bağımsız |
| 21 | Churn tetiği | ÇALIŞIYOR — aç/kapa + %50–90 eşik |
| 22 | Anonim | ÇALIŞIYOR — kapsam notu + tarama sayacı |
| 23 | Tüketim yorumu | EKSİK (kalan) — ekranda dürüstçe belirtildi |
| 24 | Bayiye bildirim | ÇALIŞIYOR — gerçek zamanlı tekil, tarama toplu |
| 25 | Analitik olayları | ÇALIŞIYOR — istatistik buradan okunur |
| 26 | Yetki | ÇALIŞIYOR |
| 27 | Modül kapısı | ÇALIŞIYOR — BFF `module: 'remedy_offers'` + SSR |
| 28 | Denetim kaydı | ÇALIŞIYOR — AuditLog önce/sonra |
| 29 | Hız sınırı | ÇALIŞIYOR — tarama 4/dk |
| 30 | Motion | ÇALIŞIYOR — kota dolumu, ölçülü |

### Bulgular
- **Kapandı (12):** 1, 2, 4, 5 (QR geri bildirimi için), 6, 7, 8, 9, 11 (aday sorgusu daraltıldı; aday başına çekirdek, ≤ 25), 12, 13, 14.
- **Kısmi (2):** 3 — kaynak başına çift taslak servis kilidiyle engelli; aylık sınırın eşzamanlı aşımı (en çok birkaç) kaldı. 10 — müşteri mesajı tek dil (TR).
- **Eksik özelliklerden uygulanan:** müşteri başına bekleme süresi, kuru çalıştırma, sonuç analitiği (hazırlanan/bekleyen/yayın/red/kabul oranı), mesaj kişiselleştirme.

### Kalanlar / ŞEMA İSTEĞİ
- `RemedyOffer.source ('auto'|'manual')` + kısmi tekil index — sayımı olaydan değil kayıttan yapmak ve TOCTOU'yu kapatmak için.
- Tüketim yorumları için otomatik telafi; kural oluşturucu (çoklu kural/şube/konu); churn sayfasındaki `autoFlashOffer` ile tek tetikte birleşme.
