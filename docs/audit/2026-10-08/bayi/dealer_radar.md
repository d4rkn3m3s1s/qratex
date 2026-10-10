# /dealer/radar

**Amaç:** Son 30 gündür işletmeye uğramayan ("uyuyan") müşterileri tespit edip toplu veya kişiye özel geri kazanım (win-back) teklifiyle geri çağırmak. Sayfa adı: "Kayıp Müşteri Radarı".

**Genel puan:** 4/10 · **Karar:** BİRLEŞTİR (churn-risk + segment-actions ile tek bir "Geri Kazanım / Elde Tutma" modülüne; radar görseli gerçek veriyle yeniden kurgulanarak korunabilir)

Denetlenen dosyalar:
- `app/dealer/radar/page.tsx` (server component, 200 satır)
- `app/dealer/radar/layout.tsx` (yalnızca metadata)
- `components/dealer/radar-interactive.tsx` (toplu + tekli teklif butonları, dialog)
- `components/dealer/dealer-radar-scope.tsx` + `dealer-radar-scope.module.css` (taktik radar görseli)
- `lib/dealer/win-back-offers.ts` (teklif kimlikleri + TR metinleri)
- `app/api/dealer/win-back/route.ts` (GET + POST)
- Bağlam: `app/dealer/layout.tsx`, `lib/app-locale.tsx`, `lib/module-controls.ts`, `lib/module-gate.ts`, `lib/notification-prefs.ts`, `lib/segment-action-center.ts`, `app/dealer/segment-actions/page.tsx`, `app/api/dealer/campaigns/[id]/send/route.ts`, `components/dashboard/sidebar.tsx`, `prisma/schema.prisma` (Consumption, Notification, User), `messages/tr.json` + `messages/en.json` (`dealerRadar.*`)

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Tespit sorgusu çalışıyor ama en eski 500 kişiyi seçiyor, toplu kampanya sessizce 100 kişiyle sınırlanıp her tıkta aynı 100 kişiye gidiyor ve vaat edilen teklifler (5X puan, ücretsiz içecek, %10 indirim) sistemde hiçbir mekanizmaya bağlı değil. |
| UX | 4/10 | Asıl aksiyon (toplu gönderim) onaysız tek tık; liste sıralamasız/filtresiz; mobilde tekli teklif butonu tamamen gizli; "iletişime geçildi" durumu yok. |
| Görsel | 6/10 | Radar HUD'u el işçiliği yüksek ve etkileyici, ama askeri/denizcilik dili ("MARİN TARAMA", "KİLİT", "hedef") bir kafe sahibinin müşterisi için ton olarak yanlış ve konumlar veri taşımıyor. |
| Mimari | 4/10 | Aynı SQL hem sayfada hem kullanılmayan GET ucunda kopya; modül anahtarı tanımlı ama uygulanmıyor; kampanya kaydı yok; işletme adı yerine kişi adı kullanılıyor. |
| Performans | 4/10 | 500 kayda kadar her biri sonsuz CSS animasyonlu buton + yay animasyonu + vektör çizgisi; son blip ~30 sn sonra beliriyor; her istek bayinin tüm Consumption kayıtlarını GROUP BY ile tarıyor. |
| Erişilebilirlik + Mobil | 4/10 | Radar 500 adede kadar sekme durağı ekliyor, bilgi yalnızca hover/focus ile; iOS'ta dokunuş butona odak vermediğinden intel paneli çalışmayabilir; tekli teklif mobilde yok; birkaç animasyon reduced-motion'u yok sayıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rol kontrolü (yalnız DEALER) | ÇALIŞIYOR | `page.tsx:17-19`, `proxy.ts:50-62` | Proxy + sayfa çift kontrol. |
| 2 | Sayfa metadata (başlık/açıklama) | ÇALIŞIYOR | `radar/layout.tsx:4-6` | |
| 3 | Dil seçimi | KISMİ | `page.tsx:21-22` vs `lib/app-locale.tsx:24-28` | Sunucu kısmı `session.preferredLanguage`, istemci bileşenleri localStorage/cookie kullanıyor; dil değiştirilince sayfa yarı TR yarı EN kalabiliyor. Diğer bayi sayfaları `getServerLocale()` kullanıyor. |
| 4 | Uyuyan müşteri tespiti (son ziyaret > 30 gün) | KISMİ | `page.tsx:33-45` | `ORDER BY MAX(createdAt) ASC LIMIT 500` en ESKİ kaybedilenleri seçer; geri kazanılması en olası 31-60 gün aralığı büyük bayilerde listeye hiç girmez. |
| 5 | Müşteri profil zenginleştirme | KISMİ | `page.tsx:50-62` | `findMany({id:{in}})` sıra garantisi vermez; SQL'deki sıralama kaybolur. `lastVisit ?? new Date()` (s.59) sessiz yanlış veri üretir. |
| 6 | Sayfa başlığı + açıklama kartı | ÇALIŞIYOR | `page.tsx:80-86` | |
| 7 | "Radar aktif" rozeti | SAHTE | `page.tsx:87-91` | Her zaman "aktif"; hiçbir duruma bağlı değil. `animate-pulse` reduced-motion'a uymuyor. |
| 8 | Uyuyan müşteri sayısı kartı | KISMİ | `page.tsx:95-110` | 500 tavanında "500" yazar, "500+" demez; gerçek toplam bilinmez. |
| 9 | Potansiyel ciro kartı | KISMİ | `page.tsx:74-76`, `:122` | `~1234 ₺` yerel sayı biçimi yok; tutar verisi yoksa "~0 ₺" (API'deki `potentialRevenueBasis` notu sayfada uygulanmamış); %100 dönüşüm varsayımı açıklanmıyor. |
| 10 | Hızlı kampanya kartı / toplu buton | BOZUK | `radar-interactive.tsx:37-58`, `route.ts:15,116` | İstemci 500'e kadar id yollar, API ilk 100'ü alır; sonraki tıklarda yine aynı 100 kişiye gider, kalan 400 kişiye ulaşmak imkânsız. Onay adımı yok. |
| 11 | Toplu kampanya teklifi (5X puan) | SAHTE | `radar-interactive.tsx:44`, `win-back-offers.ts:21` | `5x_points` kodda başka hiçbir yerde işlenmiyor (repo genelinde grep). Müşteriye "Bugün tüm harcamalarda 5X Puan!" vaadi gidiyor, puan motoru bunu uygulamıyor. |
| 12 | Taktik radar görseli (HUD) | KISMİ | `dealer-radar-scope.tsx:135-325` | Görsel kalite yüksek; ancak blip konumu id'nin alfabetik sırasından türetiliyor (`:140-148`), hiçbir müşteri metriğini kodlamıyor. |
| 13 | Blip hover/focus → intel paneli | KISMİ | `dealer-radar-scope.tsx:239-242`, `:286-315` | Fare ve klavyede çalışır; dokunmatikte (özellikle iOS Safari, buton dokunuşta odak almaz) güvenilir değil — cihazda doğrulanmadı. |
| 14 | Yön (BRG) / Menzil (RNG) değerleri | SAHTE | `dealer-radar-scope.tsx:34-40`, `:280-284` | Rastgele konumdan türetilmiş anlamsız sayılar; "30 NM" (`tr.json hudRange`) ve "CIC-7A" (`:192`) dekor. |
| 15 | HUD hedef sayacı (TRG) | ÇALIŞIYOR | `dealer-radar-scope.tsx:188-190` | "TRG" sabit İngilizce, çeviri anahtarı yok. |
| 16 | Blip'e tıklama | EKSİK | `dealer-radar-scope.tsx:226-244` | `<button>` ama `onClick` yok; tıklayınca teklif/profil açılmıyor. |
| 17 | Radar boş durumu | ÇALIŞIYOR | `dealer-radar-scope.tsx:210-218` | |
| 18 | Azaltılmış hareket desteği | KISMİ | `dealer-radar-scope.module.css:369-389`, `dealer-radar-scope.tsx:137` | CSS süpürme/sonar ve framer girişleri saygılı; ama `animate-ping` (`scope.tsx:174`) ve rozet `animate-pulse` (`page.tsx:89`) değil. |
| 19 | Radar listesi | KISMİ | `page.tsx:145-197` | Sıralama yok (bkz. #5), sayfalama/sanal liste yok, 500 satıra kadar tek seferde render. |
| 20 | Liste boş durumu | BOZUK (yanıltıcı) | `page.tsx:151-158`, `tr.json emptyTitle` | Hiç tüketim kaydı olmayan yeni bayi de "Müşterileriniz çok sadık! Harika iş çıkarıyorsunuz." görür; "veri yok" ile "herkes aktif" ayrılmıyor. |
| 21 | Avatar / baş harf yedeği | ÇALIŞIYOR | `page.tsx:164-176` | |
| 22 | Müşteri e-postasının açık gösterimi | KISMİ | `page.tsx:179`, `scope.tsx:304` | KVKK açısından maskelenmemiş; projede `lib/pii-redact.ts` var ama kullanılmıyor. Bayinin e-postayla ne yapacağı da tanımsız (e-posta kanalı yok). |
| 23 | "X gün önce" son ziyaret | ÇALIŞIYOR | `page.tsx:185` | |
| 24 | Tekli "Özel teklif" butonu | KISMİ | `radar-interactive.tsx:130` | `hidden sm:flex` → telefonda hiç görünmüyor; mobil bayi tekli teklif gönderemiyor. |
| 25 | Tekli teklif dialog: teklif türü seçimi | ÇALIŞIYOR (UI) / SAHTE (karşılık) | `radar-interactive.tsx:148-163`, `win-back-offers.ts:6-25` | 5 seçenek seçilebiliyor; hiçbiri kupon/ödül/puan çarpanı üretmiyor, yalnızca metin. |
| 26 | Kişisel not (500 karakter) | ÇALIŞIYOR | `radar-interactive.tsx:165-176`, `route.ts:104-106` | Sunucu da kırpıyor. |
| 27 | Gönderim toast'ları | KISMİ | `radar-interactive.tsx:47-55`, `route.ts:120,132,161` | API mesajları TR sabit, bir kısmı EN ("No users selected", "Invalid offer type"); EN arayüzde karışık dil. |
| 28 | Gönderim sonrası durum ("iletişime geçildi") | EKSİK | `radar-interactive.tsx:49,112` | `router.refresh()` listeyi değiştirmez; kimin ne zaman hangi teklifi aldığı görünmez. |
| 29 | POST yetki + sahiplik (IDOR) kontrolü | ÇALIŞIYOR | `route.ts:96-135` | Yalnız bu bayide tüketimi olan müşteriler hedeflenebilir. |
| 30 | Müşteri bildirim tercihi (campaign opt-out) | EKSİK | `route.ts:149-159`, `lib/notification-prefs.ts:50` | Müşteri "Kampanya & Sürprizler" grubunu kapatsa da bildirim yine gider. |
| 31 | Push bildirimi | EKSİK | `route.ts:145-146` | Yorum: "IN A REAL APP: Trigger Push…". Yalnızca uygulama içi zil kaydı; kampanya modülü (`campaigns/[id]/send/route.ts:116-126`) push yapıyor. |
| 32 | Frekans sınırı / hız sınırı | EKSİK | `route.ts:94-161` | Aynı müşteriye sınırsız tekrar gönderilebilir; rate limit yok. |
| 33 | Kampanya kaydı / atıf / ROI | EKSİK | `route.ts:157-159` | `Campaign` veya benzeri kayıt yok; geri dönüş ölçülemez. |
| 34 | Müşteri dilinde mesaj | EKSİK | `route.ts:141-152`, `win-back-offers.ts:18-25` | Mesaj ve başlık daima TR + emoji. |
| 35 | Gönderen işletme adı | BOZUK | `route.ts:142` | `session.user.name` (kişi adı) kullanılıyor; `User.businessName` (`schema.prisma:83`) varken müşteri "Ahmet Yılmaz size özel bir fırsat sundu" görür. Diğer uçlar `businessName || name` deseni kullanıyor (`feedbacks/[id]/reply/route.ts:17-19`). |
| 36 | Bildirim bağlamı (data/CTA/işletme linki) | EKSİK | `route.ts:149-155` | `data` boş; müşteri bildirimden işletmeye/teklife gidemez. |
| 37 | `GET /api/dealer/win-back` | ÖLÜ KOD (kopya) | `route.ts:17-92` | Sayfa aynı sorguyu kendi içinde çalıştırıyor; hiçbir istemci GET çağırmıyor. |
| 38 | Modül kontrolü `customer_radar` | BOZUK | `lib/module-controls.ts:38`, `sidebar.tsx:266` | Anahtar tanımlı ama ne sayfa, ne API, ne sidebar (`moduleKey` yok) kontrol ediyor; admin kapatsa da çalışır. |
| 39 | Hata durumu | KISMİ | `app/dealer/error.tsx` (genel) | Sayfada try/catch yok; DB hatasında genel bayi hata sınırına düşer, sayfaya özel kurtarma yok. |
| 40 | Yükleniyor durumu | KISMİ | `app/dealer/loading.tsx` (genel) | Sayfaya özel iskelet yok. |
| 41 | Eşik (30 gün) ayarı, filtre, arama, sıralama | EKSİK | `page.tsx:26-27` | Sabit 30 gün; günlük gelen kahve müşterisi ile yılda bir gelen aynı kefede. |
| 42 | Dışa aktarma (CSV) / seçerek gönderme | EKSİK | — | Çoklu seçim yok; ya hepsi (aslında 100) ya tek tek. |
| 43 | Sidebar konumu | KISMİ | `sidebar.tsx:266` | "Sistem" grubunda; işlevsel olarak "Analitik/Büyüme" veya "Müşteriler" altında olmalı. |

Durum sayımı: ÇALIŞIYOR 13 · KISMİ 16 · BOZUK 4 · SAHTE 3 · EKSİK 10 (toplam 43; #25 ÇALIŞIYOR sayıldı, #37 ölü kod KISMİ'ye dahil edildi).

---

## Bulgular

### 1. [KRİTİK · Veri bütünlüğü/Güven] Teklifler müşteriye vaat ediliyor ama hiçbir mekanizma uygulamıyor
- **Kanıt:** `components/dealer/radar-interactive.tsx:44` (`offerType: "5x_points"`), `lib/dealer/win-back-offers.ts:19-25`, `app/api/dealer/win-back/route.ts:141-159`. `5x_points` repo genelinde yalnızca bu iki dosyada geçiyor; puan motorunda, kupon/ödül tablosunda karşılığı yok.
- **Sorun:** Müşteri "Bugün tüm harcamalarda 5X Puan!" / "Bir içecek bizden hediye!" / "%10 indirim" bildirimi alıyor; kasada ne puan çarpanı, ne kupon kodu, ne de personelin doğrulayabileceği bir kayıt var. Bu, müşteri güvenini doğrudan zedeler ve bayiyi zor durumda bırakır (personel teklifi bilmez). Ayrıca "Bugün" ifadesi, bildirimin ne zaman okunacağından bağımsız sabit.
- **Profesyonel öneri:** Win-back teklifini gerçek bir **teklif nesnesine** dönüştürün: `WinBackOffer { id, dealerId, customerId, offerType, payload (çarpan/indirim oranı/ürün), code, expiresAt, redeemedAt, campaignRunId }`. Puan çarpanı için `lib/points` kredilendirme yoluna (escrow/atomic one-time kurallarına uyarak) `activeMultiplier(customerId, dealerId)` kontrolü ekleyin; ücretsiz ürün/indirim için müşteri kartında ("Kartım") görünen ve bayinin `/dealer/scan` ekranında okutulduğunda otomatik eşleşen kupon üretin. Bildirimde göreli değil mutlak geçerlilik ("15 Ekim'e kadar") yazın. Gerçekleştirilemeyen teklif türlerini (ör. happy hour) ya kaldırın ya "davet" olarak ödülsüz metne çevirin.
- **Efor:** L

### 2. [YÜKSEK · Hata] Toplu kampanya sessizce 100 kişiyle sınırlanıyor ve her tıkta aynı 100 kişiye gidiyor
- **Kanıt:** `app/dealer/radar/page.tsx:43,138` (500'e kadar id), `app/api/dealer/win-back/route.ts:15,116` (`slice(0, 100)`), `radar-interactive.tsx:37-58`.
- **Sorun:** Kart "312 uyuyan müşteri" der, buton hepsine gönderiyormuş gibi davranır; API ilk 100'ü alır. Liste değişmediği için ikinci tık aynı 100 kişiye ikinci bildirimi gönderir, kalan 212 kişiye ulaşmanın yolu yoktur. Spam + eksik erişim aynı anda.
- **Profesyonel öneri:** Toplu gönderimi istemciden id listesi yollayarak değil, **sunucu tarafında segment tanımıyla** yapın: `POST /api/dealer/win-back/runs { segment: { minDays, maxDays }, offer, note }`. Sunucu alıcıları kendisi seçer, frekans sınırına takılanları ve opt-out'ları çıkarır, büyük listeleri kuyruğa (ör. mevcut cron/after() altyapısı) parçalar ve bir `WinBackRun` kaydı döner. UI'da "312 kişi → 287 uygun (18 son 14 günde zaten teklif aldı, 7 bildirim kapalı)" önizlemesi gösterin.
- **Efor:** M

### 3. [YÜKSEK · Mantık] Sorgu en eski 500 kaybı seçiyor; en kurtarılabilir müşteriler dışarıda kalıyor
- **Kanıt:** `page.tsx:41-43` (`ORDER BY MAX(c."createdAt") ASC LIMIT 500`), aynısı `route.ts:41-43`.
- **Sorun:** Geri kazanım olasılığı genellikle son ziyaretten geçen süreyle hızla düşer. Büyük bayide liste 2-3 yıl önce gelmiş müşterilerle dolar; 35 gün önce gelen sadık müşteri görünmez. Ayrıca bulgu #2 ile birleşince toplu kampanya özellikle en kurtarılamaz 100 kişiye gider.
- **Profesyonel öneri:** Sabit eşik yerine **müşteri bazlı beklenen ziyaret aralığı** kullanın: her müşterinin medyan ziyaret aralığına göre "gecikme oranı" (`gün_since_last / median_interval`) hesaplayın; RFM (recency, frequency, monetary) ile "Uyanmak üzere (1.5-3×)", "Uyuyor (3-6×)", "Kayıp (>6× veya >180 gün)" bantlarına ayırın. Bu metrikler zaten `CustomerLifetimeValue`/`clv-core` cron'unda kısmen var (`lib/clv-core.ts:16,65`); radar onları okumalı, her istekte ham Consumption taraması yapmamalı. Varsayılan sıralama "geri kazanım değeri = olasılık × ortalama harcama" olmalı.
- **Efor:** M

### 4. [YÜKSEK · Uyum/KVKK] Müşterinin kampanya bildirim tercihi ve frekans sınırı yok sayılıyor
- **Kanıt:** `route.ts:149-159` doğrudan `notification.createMany`; `lib/notification-prefs.ts:50` "campaign" grubu tanımlı ve `lib/notify-prefs-server.ts` sunucu yardımcısı mevcut ama burada çağrılmıyor. Hız/frekans sınırı yok.
- **Sorun:** Kampanya bildirimlerini kapatmış müşteri yine pazarlama mesajı alır; bayi aynı kişiye sınırsız mesaj atabilir. Hem KVKK/ticari ileti uyumu hem platform itibarı açısından risk.
- **Profesyonel öneri:** Tüm pazarlama gönderimlerini tek bir `sendMarketingMessage()` servisine toplayın: tercih kontrolü (`campaign` grubu, kanal bazlı), müşteri başına bayi bazlı frekans sınırı (ör. 14 günde 1 win-back), bayi başına günlük hacim sınırı ve Upstash tabanlı rate limit. Engellenen alıcıları sonuçta sayısal olarak raporlayın.
- **Efor:** M

### 5. [YÜKSEK · Hata] Gönderen olarak işletme adı yerine kişi adı kullanılıyor
- **Kanıt:** `route.ts:142` (`session.user.name || 'Favori mekanınız'`); `prisma/schema.prisma:83` `businessName`; doğru desen `app/api/dealer/feedbacks/[id]/reply/route.ts:17-19`.
- **Sorun:** Müşteri, tanımadığı bir kişi adından "size özel fırsat" bildirimi alır; marka tanınmaz, dönüşüm düşer, hatta oltalama gibi algılanabilir.
- **Profesyonel öneri:** `businessName || name || 'İşletme'` kullanın; bildirime `data: { dealerId, offerId, cta: '/customer/...' }` ekleyip müşteri tarafında işletme logosu ve teklif kartıyla gösterin.
- **Efor:** S

### 6. [YÜKSEK · Mimari] Kampanya kaydı, push ve atıf yok — sonuç ölçülemiyor
- **Kanıt:** `route.ts:145-159` (yalnız Notification; "IN A REAL APP" yorumu); karşılaştırma: `app/api/dealer/campaigns/[id]/send/route.ts:94-126` (Campaign durumu + push).
- **Sorun:** Bayi kime, ne zaman, hangi teklifi gönderdiğini göremez; teklif sonrası ziyaret oldu mu bilinmez. Kıyas ürünlerin (Square Marketing, Toast Marketing) temel değeri "kampanya → geri dönen müşteri → ciro" atfıdır.
- **Profesyonel öneri:** `WinBackRun` (+ alıcı satırları) modeli; mevcut `sendPushNotification` ile push; atıf penceresi (ör. 14 gün) içinde Consumption gelirse `recoveredAt` + `recoveredAmount` işaretleyen hafif bir cron/after() işi. Sayfada "Son 30 günde 42 teklif → 9 geri dönüş → 1.840 ₺" kartı.
- **Efor:** L

### 7. [ORTA · Hata] Liste sıralaması kayboluyor ve yanlış veri yedeği var
- **Kanıt:** `page.tsx:50-53` (`findMany({ id: { in } })` sıra garantisi yok), `page.tsx:59` (`lastVisit ?? new Date()`).
- **Sorun:** "Riski yüksek müşteriler" başlıklı liste rastgele sırada; yedek değer "0 gün önce" gibi yanlış bir satır üretebilir.
- **Profesyonel öneri:** Ham SQL'de `JOIN "User"` ile profil alanlarını tek sorguda çekin (aynı zamanda 2 round-trip → 1) ve sıralamayı SQL'de koruyun; eksik meta durumunda satırı atlayın.
- **Efor:** S

### 8. [ORTA · Mobil/UX] Tekli teklif mobilde tamamen gizli; toplu gönderimde onay yok
- **Kanıt:** `radar-interactive.tsx:130` (`hidden ... sm:flex`), `radar-interactive.tsx:61-68` (doğrudan `onClick={handleSendBulk}`).
- **Sorun:** Bayilerin önemli kısmı panele telefondan girer; tekli teklif yalnız masaüstünde mümkün. Toplu gönderim yüzlerce kişiye geri alınamaz mesajı tek dokunuşla yollar.
- **Profesyonel öneri:** Mobilde satırın tamamını dokunulabilir yapıp alt sayfa (Sheet) içinde profil + teklif formu açın. Toplu gönderimi iki adımlı yapın: teklif seçimi + mesaj önizlemesi (müşterinin göreceği haliyle) + alıcı özeti + "Gönder" onayı.
- **Efor:** M

### 9. [ORTA · Performans/Erişilebilirlik] Radar 500 animasyonlu butona kadar ölçekleniyor
- **Kanıt:** `dealer-radar-scope.tsx:220-264` (kayıt başına `Motion.button`, `delay: i * 0.06` → 500. blip ≈ 30 sn), `:111-133` (kayıt başına SVG çizgi), `dealer-radar-scope.module.css:273` (her blipte sonsuz `target-pulse` + box-shadow).
- **Sorun:** Düşük güçlü telefonda yüzlerce eşzamanlı sonsuz animasyon + blur/drop-shadow (`.module.css:127,161`) kare düşürür; 46 px avatarlar 350 px'lik dairede üst üste biner; klavye kullanıcısı listeye ulaşmak için 500 sekme durağından geçer.
- **Profesyonel öneri:** Radarda en fazla ~24 "öncelikli hedef" gösterin, gerisini "+288" kümesiyle özetleyin; girişte toplam stagger süresini ~0.8 sn ile sınırlayın; nabız animasyonunu yalnız seçili/odaktaki blipte çalıştırın; radar butonlarını tek bir `role="listbox"` + ok tuşu gezintisiyle (roving tabindex) tek sekme durağına indirin.
- **Efor:** M

### 10. [ORTA · UX/Veri görselleştirme] Radar konumları ve HUD sayıları anlam taşımıyor
- **Kanıt:** `dealer-radar-scope.tsx:140-148` (id'ye göre alfabetik sıra → altın açı yerleşimi), `:34-40` (yön/menzil türetmesi), `:192` "CIC-7A", `tr.json hudRange "30 NM"`.
- **Sorun:** Merkezden uzaklık ve açı hiçbir müşteri özelliğini temsil etmiyor; "YÖN 214° · MENZİL 17.3" bayiyi yanıltan sahte hassasiyet. Görsel "veri gibi görünen dekor".
- **Profesyonel öneri:** Radarı gerçek bir **geri kazanım haritasına** çevirin: yarıçap = gecikme oranı veya gün (iç halka "uyanmak üzere", dış halka "kayıp"), açısal sektör = segment ya da en çok tüketilen ürün kategorisi, blip boyutu = ortalama harcama, renk = durum (teklif gönderildi / geri döndü). Halkaları gün etiketleriyle (30/60/90+) adlandırın; anlamsız YÖN/MENZİL/NM/CIC metinlerini kaldırın.
- **Efor:** M

### 11. [ORTA · UX/Ton] Askeri/denizcilik metaforu işletme bağlamına uymuyor
- **Kanıt:** `messages/tr.json dealerRadar.hudTitle "MARİN TARAMA"`, `lockVisual "KİLİT"`, `hudSubtitle "Geri kazanım hedef tespiti"`, `hudFooter "DÖNEN DİZİ · TAKTİK KATMAN · SADECE BAYİ"`; `scope.tsx:189` "TRG" çevrilmemiş.
- **Sorun:** Müşteriyi "hedef", "kilit" olarak sunmak restoran/kafe sahibinin ilişki odaklı yaklaşımıyla çelişir; Medallia/Square gibi ürünler sıcak, insan merkezli dil kullanır. Ayrıca sayfanın geri kalanı (shadcn kartları, açık tema) ile koyu CRT paneli görsel olarak kopuk.
- **Profesyonel öneri:** Radar estetiğini koruyup dili "Özlenen müşteriler", "Uyanmak üzere", "Teklif gönderildi" gibi ilişki diline çevirin; koyu paneli temaya uyumlu (açık temada açık zemin varyantı) yapın.
- **Efor:** S

### 12. [ORTA · i18n] Sunucu ve istemci farklı dil kaynaklarına bakıyor; API mesajları karışık dilde
- **Kanıt:** `page.tsx:21-22` (session), `lib/app-locale.tsx:24-28` (localStorage → cookie), `lib/server-locale.ts:6-14` (cookie); `route.ts:109,120,132,138,161`.
- **Sorun:** Kullanıcı uygulama içinde dili değiştirince başlık/kartlar eski dilde, radar/butonlar yeni dilde kalır; EN arayüzde "Seçilen kullanıcılar bu işletmede…" gibi TR hatalar ve TR başarı mesajı görünür.
- **Profesyonel öneri:** Sayfada `getServerLocale()` kullanın (diğer bayi sayfalarıyla tutarlı); API'den hata *kodu* dönüp metni istemcide `t()` ile çözün.
- **Efor:** S

### 13. [ORTA · Mimari] Modül anahtarı uygulanmıyor; GET ucu ölü kopya; segment merkezi bu uca bozuk istek atıyor
- **Kanıt:** `lib/module-controls.ts:38` (`customer_radar`), sayfa/API/`sidebar.tsx:266` hiçbiri `assertModuleEnabled`/`moduleKey` kullanmıyor; `route.ts:17-92` GET kullanılmıyor; `app/dealer/segment-actions/page.tsx:74-77` `{ segment, source }` gönderiyor, `route.ts:108-110` `userIds` olmadığı için 400 döner (`lib/segment-action-center.ts:67`).
- **Sorun:** Admin modülü kapatamaz; aynı sorgu iki yerde bakımı ikiye katlar; Segment Aksiyon Merkezi'ndeki "Win-back kampanyası" butonu her zaman "No users selected" hatası verir.
- **Profesyonel öneri:** Sorguyu `lib/dealer/win-back.ts` içinde tek servis fonksiyonuna taşıyın; sayfa ve GET bunu kullansın; POST segment tabanlı gövdeyi de kabul etsin (bkz. bulgu #2); sidebar öğesine `moduleKey: 'customer_radar'`, sayfaya ve API'ye `assertModuleEnabled('customer_radar')` ekleyin.
- **Efor:** S

### 14. [DÜŞÜK · UX] Boş durum yeni bayiyi yanlış övüyor
- **Kanıt:** `page.tsx:151-158`, `tr.json emptyTitle "Müşterileriniz çok sadık!"`.
- **Sorun:** Hiç tüketim kaydı olmayan bayi de "harika iş çıkarıyorsunuz" görür.
- **Profesyonel öneri:** Üç durumu ayırın: (a) hiç müşteri yok → kart okutma/QR kurulumu CTA'sı (`/dealer/scan`, `/dealer/onboarding`), (b) müşteri var ama herkes aktif → kutlama, (c) veri yetersiz (ör. < 30 günlük geçmiş) → "radar X gün sonra anlamlı olacak".
- **Efor:** S

### 15. [DÜŞÜK · Gizlilik] Müşteri e-postaları maskelenmeden listeleniyor
- **Kanıt:** `page.tsx:179`, `dealer-radar-scope.tsx:304`; maskeleme yardımcısı `lib/pii-redact.ts:7-12` mevcut.
- **Sorun:** Platform e-posta kanalını bayiye açmıyor; tam e-posta gösterimi gereksiz kişisel veri ifşası ve platform dışı iletişime kapı.
- **Profesyonel öneri:** `redactEmail` ile maskeleyin; kimlik için ziyaret sayısı/son ürün gibi işletme açısından anlamlı bilgileri gösterin.
- **Efor:** S

### 16. [DÜŞÜK · Erişilebilirlik] Bazı animasyonlar reduced-motion'a uymuyor; kullanılmayan importlar
- **Kanıt:** `page.tsx:89` (`animate-pulse`), `dealer-radar-scope.tsx:174` (`animate-ping`); `page.tsx:6-7` (`Button`, `Gift` kullanılmıyor); `radar-interactive.tsx:53,118` kullanılmayan `error` değişkeni.
- **Profesyonel öneri:** `motion-safe:animate-*` kullanın; ölü importları temizleyin.
- **Efor:** S

### 17. [DÜŞÜK · Performans] Her istek bayinin tüm tüketimlerini grupluyor
- **Kanıt:** `page.tsx:33-45`; indeks `schema.prisma` Consumption `@@index([dealerId, createdAt])`.
- **Sorun:** `GROUP BY customerId` + `MAX(createdAt)` için `[dealerId, createdAt]` indeksi WHERE'i karşılar ama grup için tüm satırları okur; büyük bayide büyüdükçe pahalılaşır. Önbellek yok.
- **Profesyonel öneri:** CLV cron'unun ürettiği müşteri bazlı özet tablosunu (son ziyaret, frekans, ortalama harcama) kaynak alın; mümkün değilse `[dealerId, customerId, createdAt]` bileşik indeksi + Upstash'te 5-10 dk'lık bayi bazlı önbellek (gönderim sonrası invalidate).
- **Efor:** M

---

## Eksik özellikler (kıyas ürünlerle)

1. **Otomatik geri kazanım akışı (Square Marketing "Win-back", Toast "Automated Marketing"):** Müşteri X gün gelmeyince belirlenmiş teklifin otomatik gitmesi, tek seferlik değil sürekli kural. Projede `ChurnInterventionSettings` (`app/dealer/churn-risk/page.tsx:27`) ile birleşebilir.
2. **Gerçek, kullanılabilir teklif/kupon ve kasada doğrulama:** Kod/QR'lı, son kullanma tarihli, `/dealer/scan` ile otomatik eşleşen kupon; puan çarpanı motoru.
3. **Kampanya performansı ve atıf:** Gönderim → açılma → geri dönüş → ciro hunisi; kontrol grubu (holdout) ile gerçek artış ölçümü (Qualtrics/Medallia "closed-loop" + Square kampanya raporları).
4. **Müşteri bazlı akıllı eşik ve RFM segmentasyonu:** Sabit 30 gün yerine kişinin kendi ziyaret ritmine göre "gecikti" tespiti; "uyanmak üzere / uyuyor / kayıp" bantları; değer bazlı önceliklendirme.
5. **Geri bildirim bağlamı:** Müşterinin son değerlendirmesi/şikâyeti (ConsumptionReview, Feedback) satırda görünmeli; kötü deneyim sonrası kaybolan müşteriye özür + telafi (remedy) önerilmeli (Medallia "close the loop").
6. **Filtre/arama/çoklu seçim/CSV dışa aktarma ve kanal seçimi** (uygulama içi, push, e-posta) + mesaj önizlemesi ve AI destekli kişiselleştirilmiş metin önerisi.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi sayfaya girdiğinde üç soruya 5 saniyede yanıt alır: "Kimi kaybediyorum?", "En çok kimi geri kazanmaya değer?", "Gönderdiğim teklifler işe yarıyor mu?" — ve tek akışta, güvenle, gerçek bir teklifi gönderir.

**Yerleşim:**
1. **Üst şerit (KPI):** "Uyanmak üzere / Uyuyor / Kayıp" bant sayıları (tıklanınca filtre), "geri kazanılabilir aylık ciro" (olasılık × ortalama harcama, açıklama tooltip'iyle), "Son 30 gün: N teklif → M geri dönüş → ₺".
2. **Sol: Geri kazanım haritası (radar):** Yarıçap = gecikme oranı (halkalar 1.5× / 3× / 6× veya 30/60/90+ gün etiketli), blip boyutu = değer, renk = durum. En fazla ~24 öncelikli blip + küme rozeti. Blip'e tıklama sağdaki detay panelini açar. Mobilde radar kompakt bir "özet halka" olarak üste daralır.
3. **Sağ/alt: Öncelik listesi:** Varsayılan sıralama "geri kazanım değeri"; kolonlar: müşteri (maskeli), son ziyaret, normal ritmi, ort. harcama, son değerlendirme, durum (teklif gönderildi / bekliyor / geri döndü). Çoklu seçim, arama, bant filtresi, CSV.
4. **Teklif çekmecesi (Sheet):** Teklif şablonu (gerçek kupon/çarpan) + geçerlilik + kanal + AI önerili kişisel not + müşteri görünümünde önizleme + uygunluk özeti ("287 uygun, 25 hariç: neden?") + onay.
5. **Otomasyon sekmesi:** "Ritminin 3 katı gecikince otomatik X teklifi gönder" kuralları (churn-risk'teki müdahale ayarlarıyla ortak).

**Motion/3D:** three.js gereksiz. Mevcut CSS süpürme efekti ölçülü haliyle (tek süpürme, sonar halkası yok veya tek) korunabilir — sayfanın kimliği olarak değerli. Blip girişleri toplam ≤ 0.8 sn stagger; yeni "geri döndü" olayında blip'in yeşile dönüp merkeze doğru kısa bir `layout` geçişi yapması anlamlı bir mikro-etkileşim olur. Tüm sonsuz animasyonlar `prefers-reduced-motion` ve `motion-safe:` ile kapatılmalı; arka plan sekmede (Page Visibility) duraklatılmalı.

**Veri/API değişiklikleri:**
- `lib/dealer/win-back.ts`: tek servis — `getWinBackCandidates(dealerId, { band, limit, cursor })` (CLV özet tablosundan, `businessName` dahil, sıralı ve sayfalı) + `previewRun()` + `executeRun()`.
- Prisma: `WinBackRun { id, dealerId, offerType, payload, note, channel, createdAt, recipientCount, excludedCount }`, `WinBackRecipient { runId, customerId, offerId?, sentAt, recoveredAt?, recoveredAmount? }`, `CustomerOffer` (kupon/çarpan; puan ekonomisi değişmezlerine uygun, tek seferlik atomik kullanım).
- `POST /api/dealer/win-back/runs` (segment tabanlı, sunucu alıcı seçer), `GET /api/dealer/win-back/runs` (performans), `POST /api/dealer/win-back/preview`.
- Gönderim: tercih kontrolü (`campaign` grubu) + frekans sınırı + Upstash rate limit + `sendPushNotification` + müşteri dilinde şablon + `data: { dealerId, offerId, cta }`.
- Atıf: tüketim yazma yolunda veya günlük cron'da 14 günlük pencere içindeki Consumption'ı `WinBackRecipient.recoveredAt` ile eşleştir.
- `assertModuleEnabled('customer_radar')` + sidebar `moduleKey`.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/segment-actions`:** "Uyuyan" segmenti (`lib/segment-action-center.ts:62-68`) aynı kavramı CLV cron'undan farklı bir hesapla gösteriyor ve aksiyonu bu sayfanın API'sine bozuk gövdeyle bağlıyor (400). İki sayfa aynı müşteri için farklı sayı gösterebilir.
- **`/dealer/churn-risk`:** Kayıp riskini geri bildirim duygusundan hesaplıyor ve otomatik müdahale ayarları (`ChurnInterventionSettings`) içeriyor — radarın "ziyaret gecikmesi" sinyaliyle birlikte tek bir risk modelinde olmalı.
- **`/dealer/campaigns`:** `targetSegment: 'risk'` (`campaigns/[id]/send/route.ts:59-70`) ayrı bir "riskli müşteri" tanımı ile kampanya gönderiyor; win-back de bir kampanya türü olarak burada kayıt altına alınmalı.
- **`/dealer/customers`:** Müşteri listesi; radar listesi onun filtrelenmiş görünümü olabilir.

**Öneri:** Bu dört yüzeyi tek bir **"Müşteri Elde Tutma"** modülünde birleştirin: sekmeler "Radar (geri kazanım)", "Risk (geri bildirim kaynaklı)", "Segmentler", "Otomasyonlar"; tüm gönderimler `campaigns` altyapısı üzerinden kayıt + atıf ile çalışsın. Radar görseli bu modülün imza bileşeni olarak, gerçek veriyle yeniden kurgulanıp korunmaya değer. Sidebar'da "Sistem" grubundan "Analitik/Büyüme" grubuna taşınmalı.

---

## Doğrulama (şüpheci inceleme)

Her iddia kod baştan okunarak çürütülmeye çalışıldı (salt okunur; DB/sunucu çalıştırılmadı). `proxy.ts` içinde `/api/dealer` için rate limit veya özel kural yok (grep: eşleşme yok).

### 1. Müşteriye uygulanmayan teklif vaadi — **DOĞRULANDI (daraltılmış)**
- Toplu buton teklifi sabit gönderiyor: `components/dealer/radar-interactive.tsx:44` (`offerType: "5x_points"`); buton etiketi "5X Puan Kampanyası Başlat" (`messages/tr.json:636`), yani bayi ne vaat ettiğini biliyor ama seçemiyor.
- API yalnızca metin bildirimi yazıyor (`app/api/dealer/win-back/route.ts:141-159`); teklif kimliği hiçbir yerde kalıcılaşmıyor (Notification'a `data` bile yazılmıyor). Repo grep'inde `5x_points`/`free_coffee`/`percent_10_next_visit` yalnızca `lib/dealer/win-back-offers.ts`, `radar-interactive.tsx` ve `route.ts`'te geçiyor.
- Puan yazma yolları yalnızca HappyHour (`app/api/dealer/consumptions/route.ts:312-325`), sezonluk kampanya, VIP ve global çarpanı uyguluyor; müşteri bazlı/teklif bazlı bir çarpan yok. Yani "Bugün tüm harcamalarda 5X Puan!" (`lib/dealer/win-back-offers.ts:21`) sistem tarafından **hiçbir şekilde** karşılanamaz.
- Daraltma: "Bir içecek hediye", "tatlı ikramı" gibi fiziksel teklifleri bayi kasada elle karşılayabilir; bunlar hata değil, doğrulanabilirlik eksikliği (kupon/kod yok). %10 indirim de kasada elle verilebilir ama müşterinin elinde kanıt, kasiyerin elinde doğrulama yok. Asıl kesin kusur 5X puan vaadi; üstelik "Bugün" ifadesi bildirim günler sonra okunsa da aynı kalıyor.
- **Yeniden üretim:** Bayi > Radar > "5X Puan Kampanyası Başlat" → müşteri bildirimi "…Bugün tüm harcamalarda 5X Puan!" → müşteri aynı gün gelip tarama yaptırır → `consumptions/route.ts` normal (yalnız happy hour/sezonluk çarpanlı) puan verir; 5X uygulanmaz.

### 2. Toplu gönderimde 100 kırpma + mükerrer bildirim — **DOĞRULANDI**
- Sayfa en eski ziyarete göre sıralı (`ORDER BY MAX(c."createdAt") ASC`, `app/dealer/radar/page.tsx:42-43`) 500'e kadar id'yi `RadarBulkCampaignButton`'a veriyor (`page.tsx:48,138`). API `slice(0, WIN_BACK_POST_MAX=100)` yapıyor (`route.ts:15,112-118`).
- Kırpma tamamen sessiz değil: başarı mesajı gerçek sayıyı söylüyor (`route.ts:161`, "100 kullanıcıya…"), ama KPI kartı N (ör. 340) gösterdiğinden bayi farkı fark etmeyebilir; kalan 240 kişiye bu arayüzden ulaşmanın yolu yok.
- Gönderim kaydı/frekans kontrolü yok: `createMany` öncesi önceki gönderim sorgusu yok (`route.ts:149-159`), `router.refresh()` sonrası liste aynı kalır (tüketim değişmediği için). Mükerrerlik 100'den küçük listelerde de geçerli.
- **Yeniden üretim:** 150 uyuyan müşterisi olan bayi butona 3 kez basar → en eski 100 müşteri 3'er özdeş "Sizi Özledik!" bildirimi alır, en yeni 50 uyuyan müşteri hiç almaz.

### 3. Kampanya bildirim tercihi (opt-out) yok sayılıyor — **DOĞRULANDI**
- Müşteri ayarlarında "Kampanya & Sürprizler" grubu kapatılabiliyor (`lib/notification-prefs.ts:50-53`, `app/api/customer/settings/route.ts:216-236`).
- Win-back doğrudan `prisma.notification.createMany` çağırıyor (`route.ts:157`); `isChannelEnabled`/`notifyRespectingPrefs` kullanılmıyor. Ayrıca bildirime `data.kind` yazılmadığı için `kindToGroup(null)` → grup yok → helper kullanılsa bile tercih uygulanmazdı (`lib/notification-prefs.ts:85-86`).
- Bağlam: `lib/notify-prefs-server.ts:49` `notifyRespectingPrefs` hiçbir yerde çağrılmıyor; tercih kontrolü yalnız `lib/team-notify.ts` ve `lib/character-badges.ts`'te var. Yani sorun sistem genelinde "campaign" grubunun uygulanmaması; win-back bunun bayi kaynaklı (üçüncü taraf ticari ileti) en riskli örneği.
- **Yeniden üretim:** Müşteri Ayarlar > Bildirimler > "Kampanya & Sürprizler / Uygulama" kapalı → bayi tekli veya toplu win-back gönderir → müşterinin bildirim listesinde "Sizi Özledik! 🎁" görünür.

### 4. Gönderen olarak işletme adı yerine kişi adı — **DOĞRULANDI (orta önem)**
- Mesaj `session.user.name` ile kuruluyor (`route.ts:142`); `User.name` ile `User.businessName` ayrı alanlar (`prisma/schema.prisma:83`) ve bayi profilinde ayrı düzenleniyor (`app/api/user/profile/route.ts:15,49`). Diğer yüzeyler `businessName || name` deseni kullanıyor (ör. `app/(public)/feedback/[code]/page.tsx:308`).
- Etki: müşteri bayi sahibinin kişisel adını görür ve hangi işletme olduğunu anlayamaz (bildirimde dealerId/link de yok); ayrıca session adı oturum açıldığından beri değişmişse bayat değer kullanılır. Kritik değil ama gerçek bir ürün/mahremiyet kusuru.
- **Yeniden üretim:** name="Ahmet Yılmaz", businessName="Kahve Durağı" olan bayi teklif gönderir → müşteri "Ahmet Yılmaz size özel bir fırsat sundu…" görür.

### 5. Segment Aksiyon Merkezi'nin win-back aksiyonu her zaman 400 — **DOĞRULANDI**
- `lib/segment-action-center.ts:62-68` "Uyuyan" için endpoint olarak `/api/dealer/win-back` veriyor; `app/dealer/segment-actions/page.tsx:74-77` gövdeye yalnız `{ segment, source }` koyuyor. `route.ts:108-110` `userIds` dizisi yoksa koşulsuz `400 "No users selected"` dönüyor; `offerType` de eksik olduğu için id verilse bile `route.ts:137-139`'da 400 olurdu.
- Bu bulgu `/dealer/radar` sayfasının değil, aynı API'yi paylaşan `/dealer/segment-actions`'ın hatası; ama sözleşme uyuşmazlığı API tarafında çözülmeli (segment tabanlı, sunucunun alıcı seçtiği bir uç).
- **Yeniden üretim:** Uyuyan segmentinde ≥1 müşterisi olan bayi Segment Aksiyon Merkezi'nde "Win-back kampanyası"na tıklar → toast: "No users selected"; hiçbir bildirim gitmez.

**Özet:** 5 iddianın 5'i de doğrulandı; 1. iddia "5X puan" vaadine daraltıldı (fiziksel teklifler doğrulanabilirlik eksikliği), 4. iddia kritik değil orta önemde. Öncelik sırası: 3 (tercih/uyum) ve 1 (karşılıksız puan vaadi) → 2 (mükerrer/kırpma) → 5 → 4.

## Uygulama (Dalga 2)

Rota emekli: `app/dealer/radar/page.tsx` → `/dealer/customers?tab=winback`. Geri kazanım sekmesi `winback-tab.tsx` + `winback-radar.tsx` (anlamlı geometri: açı = etiket, uzaklık = müşterinin kendi ziyaret ritminin kaçıncı katı; `radar-geometry.ts`), veri `GET /api/dealer/customers/winback`. Eski `/api/dealer/win-back`, `lib/dealer/win-back-offers.ts`, `dealer-radar-scope*` ve `radar-interactive.tsx` silindi.

| # | Yeni durum | Not |
|---|---|---|
| 1 | ÇALIŞIYOR | |
| 2 | ÇALIŞIYOR | Hedef sayfanın metadata'sı |
| 3 | ÇALIŞIYOR | Tek copy kaynağı |
| 4 | ÇALIŞIYOR | Sabit 30 gün yerine müşterinin kendi ritmine göre bant (uyanıyor / uyuyor / kayıp), öncelik sıralı |
| 5 | ÇALIŞIYOR | Sıralama korunur |
| 6 | ÇALIŞIYOR | |
| 7 | KALDIRILDI | Hiçbir duruma bağlı olmayan "Radar aktif" rozeti |
| 8 | ÇALIŞIYOR | Gerçek toplam; tavan varsa "ilk N / toplam" notu |
| 9 | ÇALIŞIYOR | Risk altındaki aylık ciro, ₺ biçimli, veri yoksa gizli |
| 10 | ÇALIŞIYOR | Banda toplu gönderimde alıcılar sunucuda çözülür, tavan önizlemede açık |
| 11 | ÇALIŞIYOR | Sahte "5X puan" kaldırıldı; gerçek mesaj veya telafi şablonlarından kişisel teklif (kabulü lib/economy üzerinden) |
| 12 | ÇALIŞIYOR | Konumlar anlamlı |
| 13 | ÇALIŞIYOR | Dokunmatikte de çalışır |
| 14 | KALDIRILDI | Sahte BRG/RNG sayıları |
| 15 | ÇALIŞIYOR | Türkçe sayaç |
| 16 | ÇALIŞIYOR | Tıklama → 360 çekmece |
| 17 | ÇALIŞIYOR | |
| 18 | ÇALIŞIYOR | useMotionPolicy; azaltılmış harekette süpürme yok |
| 19 | ÇALIŞIYOR | Öncelikli liste; tamamı Liste sekmesinde sayfalı |
| 20 | ÇALIŞIYOR | Hiç verisi olmayan bayi için ayrı boş durum |
| 21 | ÇALIŞIYOR | |
| 22 | ÇALIŞIYOR | E-posta yalnız 360'ta; anonim hesaplar maskeli |
| 23 | ÇALIŞIYOR | |
| 24 | ÇALIŞIYOR | Mobilde görünür |
| 25 | ÇALIŞIYOR | Teklif seçenekleri gerçek telafi şablonlarından |
| 26 | ÇALIŞIYOR | Not 280 karakter (sunucu da kırpar) |
| 27 | ÇALIŞIYOR | Gönderilen/elenen sayıları sonuçtan, TR/EN |
| 28 | ÇALIŞIYOR | "Ulaşıldı" durumu + aksiyon geçmişi |
| 29 | ÇALIŞIYOR | Alıcılar sunucuda bayiye kapsanır |
| 30 | ÇALIŞIYOR | "Kampanya & Sürprizler" tercihi saygılı (İYS ilkesi) |
| 31 | ÇALIŞIYOR | Push, `lib/marketing-delivery` üzerinden |
| 32 | ÇALIŞIYOR | Müşteri başı 7 gün sıklık sınırı, günlük 500 alıcı tavanı, rate limit, idempotency anahtarı |
| 33 | ÇALIŞIYOR | Aksiyon kaydı + 14 günlük geri dönüş atfı |
| 34 | ÇALIŞIYOR | Müşterinin dilinde şablon |
| 35 | ÇALIŞIYOR | `businessName` kullanılır |
| 36 | ÇALIŞIYOR | Bildirimde işletme sayfasına CTA |
| 37 | KALDIRILDI | Ölü GET ucu silindi |
| 38 | ÇALIŞIYOR | Modül kapısı |
| 39 | ÇALIŞIYOR | Sekmeye özel hata kartı |
| 40 | ÇALIŞIYOR | Sekmeye özel iskelet |
| 41 | ÇALIŞIYOR | Ritim tabanlı eşik; filtre/arama/sıralama Liste sekmesinde |
| 42 | ÇALIŞIYOR | CSV + çoklu seçimle gönderim |
| 43 | ÇALIŞIYOR | Müşteriler altında (menü kaydı navigasyon ajanında) |

Kapanan bulgular: sahte teklif ve HUD sayıları, 100/500 uyuşmazlığı, müşteri tercihinin yok sayılması, sınırsız tekrar gönderim, kişi adıyla gönderim, mobilde gizli düğme, ölü kod, yanıltıcı boş durum. Kalanlar: yok.
