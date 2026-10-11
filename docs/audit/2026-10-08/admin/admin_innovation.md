# /admin/innovation

**Amaç** · Platform operatörüne "inovasyon" modüllerini (sessiz masa sinyali, flash teklif, haftalık özet, segment kampanya onayı, telafi SLA'sı, sağlık skoru 2.0, A/B kampanya deneyleri, partner digest webhook'u, uyumluluk özeti) tek ekrandan izleme ve yapılandırma imkânı vermek. Pratikte bir **özellik anahtarı paneli + birkaç salt-okunur rapor + iki demo/seed aracı + bir webhook formu**ndan oluşan karma bir sayfa.

**Genel puan: 3.5/10** · **Karar: yeniden tasarla** (arka uç yetenekleri gerçek ve büyük ölçüde çalışıyor; ancak sayfa bir "çekmece" gibi: altı ayrı alanın kırıntıları aynı ekranda, üç tablo yanlış/eksik veri gösteriyor, iki demo aracı üretim verisine dokunuyor. Modüller kendi asıl evlerine dağıtılmalı, geriye ince bir "İnovasyon kontrol merkezi" kalmalı.)

İncelenen dosyalar: `app/admin/innovation/page.tsx` (566 satır), `app/admin/innovation/segment-proposals/page.tsx`, `app/admin/layout.tsx`, `components/admin/admin-premium-hero.tsx`, `lib/innovation-config.ts`, `lib/dealer-health-v2.ts`, `lib/innovation-demo-scenario.ts`, `lib/innovation-ab.ts`, `lib/partner-digest-core.ts`, `lib/inngest/functions.ts`, `app/api/admin/innovation/*` (9 route), `app/api/customer/innovation/ab/{variant,event}/route.ts`, `app/api/customer/innovation/nearby/route.ts`, `app/api/dealer/innovation/segment-proposals/[id]/send/route.ts`, `app/api/internal/inngest/partner-digest-webhook/route.ts`, `prisma/schema.prisma` (SegmentCampaignProposal, DealerFlashOffer, AnalyticsEvent, RemedyOffer, Settings).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Özellik anahtarları, risk sayaçları ve segment onayı çalışıyor; ama sağlık tablosu en sağlıklı 25 bayiyi gösteriyor, A/B raporunun dönüşüm oranı yapısal olarak hep boş, "Sadece plan" sonucu hiç gösterilmiyor. |
| UX | 3/10 | Bilgi mimarisi yok denecek kadar düz: 11 kart alt alta, ayarlar/raporlar/tehlikeli eylemler karışık; ham cuid girişi, ham camelCase anahtar adları, kullanıcıya endpoint/cron ifadesi gösteren metinler. |
| Görsel | 4/10 | Ortak `AdminPremiumHero` ile tutarlı başlangıç; sonrası düz shadcn kartları, yoğun `text-xs` tablolar, hiyerarşi/vurgu (durum rozeti, eşik rengi) yok. |
| Mimari | 3/10 | `unknown` + cast ile tipsiz state, iki demo route'u ~60 satır kopya, config PUT'ta şema doğrulaması yok, inovasyon bayrakları `/admin/features`'taki FeatureFlag sisteminden ayrı ve denetimsiz ikinci bir bayrak sistemi. |
| Performans | 3/10 | Her yüklemede ve her onay/demo işleminden sonra 6 uç birden yeniden çağrılıyor; bunlardan biri 200 bayi × 5 sorgu ≈ 1000 sorgu, biri 100.000'e kadar AnalyticsEvent satırını belleğe çekiyor; hiçbirinde cache yok. |
| Erişilebilirlik + mobil | 4/10 | Tablolar `overflow-x-auto`, grid'ler kırılıyor (mobil kabul edilebilir); ancak `Label`'lar hiçbir `Switch`/`Input`'a bağlı değil (erişilebilir ad yok), tablolarda caption/scope yok, yükleme/hata durumları ekran okuyucuya duyurulmuyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | API yetki kontrolü (ADMIN) | ÇALIŞIYOR | `app/api/admin/innovation/*/route.ts` hepsinde `requireAuth(['ADMIN'])` (ör. config/route.ts:14, :36) | Sayfa client component; sayfa erişimi layout'ta değil proxy/gate'te — burada ayrıca doğrulanmadı. |
| 2 | Hero başlık + açıklama | ÇALIŞIYOR | page.tsx:160-165 | Açıklama 7 modülü sayıyor; "tek yerden" vaadi sayfanın dağınıklığını özetliyor. |
| 3 | "Yenile" butonu | KISMİ | page.tsx:167-172 | Çalışıyor ama 6 ucun hepsini (ağır sağlık hesabı dahil) yeniden tetikliyor. |
| 4 | İlk veri yükleme (6 paralel fetch) | KISMİ | page.tsx:51-76 | `res.ok` hiç kontrol edilmiyor; 401/500 JSON'u veri gibi state'e yazılıyor; en yavaş uç tüm sayfayı bekletiyor. |
| 5 | Yükleniyor durumu | KISMİ | page.tsx:189, :286 | Yalnızca 2 kartta metin; diğer kartlar (özellik anahtarları, A/B, segment) yükleme sırasında "boş" görünüyor ("Bekleyen taslak yok", "Son 30 günde kayıt yok" yanlışlıkla gösteriliyor). |
| 6 | Hata durumu | BOZUK | page.tsx:71-73 | Tek genel toast; HTTP hata gövdeleri sessizce "Veri yok"a dönüşüyor; bölüm bazlı hata/yeniden dene yok. |
| 7 | Risk: telafi onay kuyruğu sayısı | ÇALIŞIYOR | page.tsx:183; risk-dashboard/route.ts:25 | |
| 8 | Risk: >48 saat açık telafi sayısı | ÇALIŞIYOR | page.tsx:184; risk-dashboard/route.ts:26-31 | |
| 9 | Risk: 24 saatte bitecek flash sayısı | ÇALIŞIYOR | page.tsx:185; risk-dashboard/route.ts:32-37 | |
| 10 | Risk: düşük puan kümesi sayısı | KISMİ | page.tsx:186; risk-dashboard/route.ts:52-59, :91 | `.slice(0, 30)` sonrası sayılıyor → en fazla 30 gösterir; "küme" aslında QR kodu; 14 günlük TÜM feedback satırları belleğe çekiliyor (:38-41). |
| 11 | Düşük puanlı QR/bayi detay listesi (`orphanRiskItems`) | EKSİK | risk-dashboard/route.ts:72-82, :93 | API üretiyor, UI hiç göstermiyor; bayi adına tıklayıp gitme yok. |
| 12 | Öncelik ipuçları (`priorityHints`) | EKSİK | risk-dashboard/route.ts:94-100 | API Türkçe cümleler üretiyor, UI kullanmıyor (ölü veri). |
| 13 | Uyumluluk: saklama süresi (gün) | KISMİ | page.tsx:206 | Yalnızca gösterim; UI'da düzenleme yok; değer hiçbir silme işinde kullanılmıyor (yalnızca bu sayfa ve config GET'te geçiyor). |
| 14 | Uyumluluk: KVKK iletişim e-postası | KISMİ | page.tsx:207; lib/innovation-config.ts:76; app/api/customer/privacy-request/route.ts:80 | Düzenlenemiyor; varsayılan `kvkk@example.com` müşteriye KVKK yanıtında dönüyor (canlı değer doğrulanmadı). |
| 15 | "KVKK talep kuyruğu" linki | ÇALIŞIYOR | page.tsx:210; app/admin/compliance/page.tsx:260 (`id="kvkk-queue"`) | |
| 16 | "Uyumluluk merkezi" linki | ÇALIŞIYOR | page.tsx:213 | |
| 17 | "Denetim günlüğü" linki | ÇALIŞIYOR | page.tsx:216 | Hedef config'ten (`auditLogUrl`) okunuyor, doğrulanmadan `Link`'e veriliyor. |
| 18 | Son denetim kayıtları (`recentAuditEntries`) | EKSİK (ölü sorgu) | config/route.ts:18-22, :30 | Her yüklemede AuditLog sorgusu yapılıyor, UI kullanmıyor. |
| 19 | Özellik anahtarları (8 Switch) | KISMİ | page.tsx:224-249; enforce: `app/api/customer/innovation/nearby/route.ts:14`, `app/api/partner/v1/digest/route.ts:15` vb. | Bayraklar gerçekten uygulanıyor; ama etiket ham anahtar (`tablePulse`), açıklama/etki yok, onay yok, kim/ne zaman değiştirdi kaydı yok. |
| 20 | Sağlık skoru 2.0 tablosu | BOZUK | page.tsx:273; health-score-v2/route.ts:36; lib/dealer-health-v2.ts:61-73 | Azalan sıralanıp ilk 25 alınıyor → **en sağlıklı** 25 bayi; hiç verisi olmayan bayi 100 puan alıp listenin tepesine çıkıyor. |
| 21 | Erken uyarı listesi (`earlyWarnings`) | EKSİK | page.tsx:258-260 metni vaat ediyor; route.ts:38, :43 üretiyor | UI'da render edilmiyor. |
| 22 | Sağlık tablosu sıralama/filtre/arama/sayfalama | EKSİK | page.tsx:261-291 | Statik tablo; 200 bayinin 175'i görünmüyor. |
| 23 | Sağlık tablosu oran biçimi | KISMİ | page.tsx:279-280 | `0.12` gibi ondalık; yüzde değil; `tableResolvedRatio` sütunu yok. |
| 24 | Segment onay kuyruğu listesi | KISMİ | page.tsx:295-335 | Başlık + segment + bayi var; **gönderilecek mesaj metni yok** (alt sayfa gösteriyor: segment-proposals/page.tsx:87). |
| 25 | Segment "Onayla" | KISMİ | page.tsx:101-113, :323 | Çalışıyor; meşgul durumu yok (çift tık = çift PATCH), onay diyaloğu yok, sonrasında tüm sayfa yeniden yükleniyor. |
| 26 | Segment "Reddet" | KISMİ | page.tsx:326 | Gerekçe alanı yok; bayiye red sebebi iletilmiyor. |
| 27 | Tenant demo paketi ("Paket aç") | KISMİ (riskli) | page.tsx:115-132, :337-349; demo-package/route.ts:44-94 | Gerçek bayiye canlı flash teklif, masa sinyali, segment taslağı yazıyor; yanıt (`created`, `trainingNotes`) atılıyor; buton kilitlenmiyor. |
| 28 | Bayi ID girişi | KISMİ | page.tsx:343-346 | Ham cuid yazılması bekleniyor; bayi arama/seçici yok. |
| 29 | 120 sn senaryo — "Sadece plan" | SAHTE | page.tsx:134-152, :370; demo-scenario/route.ts:43-49 | API 7 adımlık planı döndürüyor; UI yanıtı hiç okumuyor, yalnızca "Senaryo adımları hazır" toast'ı. Kullanıcı hiçbir plan görmüyor. |
| 30 | 120 sn senaryo — "Plan + veri yaz" | KISMİ | page.tsx:373; demo-scenario/route.ts:51-117 | #27 ile aynı seed (kopya kod), plan yine gösterilmiyor. |
| 31 | A/B: aktif deney sayısı | ÇALIŞIYOR | page.tsx:390 | |
| 32 | A/B rapor tablosu | BOZUK | page.tsx:391-432; ab-report/route.ts:36-39; ab/variant/route.ts:49-51; ab/event/route.ts:28-33 | Gösterim `dimension:'copy'` ile, dönüşüm dimension'sız kaydediliyor → farklı hücreler → oran hep "—". Ayrıca bu uçları çağıran hiçbir istemci kodu yok. |
| 33 | A/B deney tanımlama/düzenleme | EKSİK | page.tsx:385 | "PUT /api/admin/innovation/config ile" deniyor; UI yok. |
| 34 | Partner webhook aktif/pasif | ÇALIŞIYOR | page.tsx:447-461; partner-digest-webhook/route.ts:17 | |
| 35 | Webhook URL alanı | KISMİ | page.tsx:462-485 | Her blur'da (değişmese de) kaydediyor + "Kaydedildi" toast'ı; URL doğrulaması yok; kayıt sürerken input kilitli değil. |
| 36 | Webhook secret (HMAC) alanı | KISMİ | page.tsx:486-510; config/route.ts:17, :24 | Secret GET ile düz metin olarak tarayıcıya geliyor; her blur'da yeniden yazılıyor; döndürme/maskeleme yok. |
| 37 | Webhook "test gönder" + teslim günlüğü | EKSİK | partner-digest-webhook/route.ts:24-34 | Sonuç yalnızca iç job yanıtında; admin son teslimin başarılı olup olmadığını göremiyor. |
| 38 | Partner entegrasyon paketi kartı | KISMİ (statik) | page.tsx:513-531 | Yalnızca metin; `/admin/partners`, `/admin/api-keys`, `/admin/webhooks`'a link yok. |
| 39 | Son flash teklifleri tablosu | KISMİ | page.tsx:533-563; flash-offers/route.ts:12-18 | 200 kayıt + e-posta çekiliyor, 15 gösteriliyor; aktif/süresi dolmuş/pasif ayrımı yok; `toLocaleString()` locale'siz. |
| 40 | Referral limitleri (config.referral) | EKSİK | lib/innovation-config.ts:38-41; app/api/referral/route.ts:168, :182 | Gerçekten uygulanıyor ama ne gösteriliyor ne düzenlenebiliyor. |
| 41 | A/B varsayılan B yüzdesi (`defaultSplitPercentForB`) | EKSİK | lib/innovation-ab.ts:18 | Uygulanıyor, UI yok. |
| 42 | Toast bildirimleri | ÇALIŞIYOR | page.tsx:72, :93, :108, :130, :150 | `blur` tetiklemeli toast spam'i hariç. |
| 43 | Çok dillilik (TR/EN) | KISMİ | page.tsx:28, :111 | `useAppT` yalnızca bir yerde (`common.updated`); geri kalan tüm metin TR sabit; "Orphan", "Tenant", "CONCERN", "SLA" karışık. |
| 44 | Mobil yerleşim | KISMİ | page.tsx:174, :257, :391 | Grid kırılıyor, tablolar yatay kayıyor; `min-w-[200px]` inputlar ve `text-xs` tablolar dar ekranda yoğun. |
| 45 | Erişilebilir form etiketleri | BOZUK | page.tsx:236-243, :344-345, :449, :463, :487 | `Label`'ların `htmlFor`'u, kontrollerin `id`'si yok → Switch/Input'ların erişilebilir adı yok. |
| 46 | Azaltılmış hareket | ÇALIŞIYOR | components/admin/admin-premium-hero.tsx:35, :73 | Hero `useReducedMotion` ile; sayfada başka motion yok. |
| 47 | Segment karar denetim izi | EKSİK | segment-proposals/[id]/route.ts:36-43 | `decidedById` yazılıyor ama AuditLog yok; config değişikliklerinde de yok (config/route.ts:35-42). |

Sayım: ÇALIŞIYOR 12 · KISMİ 20 · BOZUK 4 · SAHTE 1 · EKSİK 10 (toplam 47; #27 ve #38 KISMİ, #18 EKSİK sayıldı).

---

## Bulgular

### 1. [YÜKSEK · Veri bütünlüğü] Demo/senaryo araçları canlı üretim bayisine müşteriye görünen veri yazıyor
- **Kanıt:** `app/api/admin/innovation/demo-package/route.ts:53-66` (`isActive: true`, `validFrom: now`, `geohash5`), `:85-94` (PENDING segment taslağı, "Bu metin örnektir…"); aynı kod `demo-scenario/route.ts:58-107`; müşteri tarafı `app/api/customer/innovation/nearby/route.ts:35-40` aktif + geçerli tüm flash'ları listeliyor; `app/api/dealer/innovation/segment-proposals/[id]/send/route.ts:42-95` APPROVED taslağı gerçek müşterilere bildirim + push olarak gönderiyor.
- **Sorun:** Admin bir gerçek bayi ID'si girip "Paket aç"a bastığında, o bayinin çevresindeki gerçek müşteriler 30 dakika boyunca "Demo: Mutlu saat %15" teklifini görüyor (maxRedemptions 50). Oluşan "Demo: İlk ziyaret kampanyası" taslağı aynı sayfanın onay kuyruğuna düşüyor; yanlışlıkla onaylanırsa bayi tek tıkla "Bu metin örnektir…" mesajını tüm segmentine push'layabilir. Demo `tablePulse` (mood `OK`, `tableCode: 'DEMO'`) sağlık skoru 2.0'daki CONCERN oranını bozuyor (`lib/dealer-health-v2.ts:49-52`). Buton kilitlenmediği için çift tık iki kat kayıt üretiyor (page.tsx:347). Hiçbir onay/uyarı yok.
- **Profesyonel öneri:** Demo seed'i üretimde varsayılan olarak devre dışı bırakın; yalnızca `isDemo`/`isSandbox` işaretli test bayilerine izin verin (User'a `isSandboxTenant` alanı veya ayrı bir "Demo tenant oluştur" akışı). Seed edilen her kayda `source: 'demo'` / `demoBatchId` alanı ekleyin; müşteri uçları (`nearby`, segment `send`) bu kayıtları filtrelesin; sağlık/risk hesapları hariç tutsun. UI'da iki aşamalı onay ("Bu işlem X bayisine canlı teklif yazar — bayi adını yazarak onaylayın"), bayi seçici (ad/e-posta arama), çalışırken buton kilidi ve sonuçta oluşturulan kayıtların linkli listesi + "Demo verisini geri al" (batch silme) eylemi. İki route tek bir `seedInnovationDemo(dealerId, variant)` servisine indirilmeli.
- **Efor:** M

### 2. [YÜKSEK · Hata/veri] Sağlık skoru 2.0 tablosu en sağlıklı bayileri gösteriyor; verisiz bayi 100 puan alıyor
- **Kanıt:** `app/api/admin/innovation/health-score-v2/route.ts:36` (`b.score - a.score`, azalan), `page.tsx:273` (`.slice(0, 25)`); `lib/dealer-health-v2.ts:61-73` (veri yoksa queue=stale=concern=0, repeat=0 → `score = 100`); `route.ts:13-17` `take: 200` sıralamasız; `route.ts:38` erken uyarılar üretiliyor ama `page.tsx`'te hiç kullanılmıyor.
- **Sorun:** Kartın açıklaması "düşük skorlar erken uyarı listesinde özetlenir" diyor (page.tsx:258-260) ama ekranda düşük skorlu tek bir bayi bile görünmüyor; tepede büyük olasılıkla hiç aktivitesi olmayan bayiler 100 puanla duruyor. 200'den fazla bayi varsa hangi 200'ün hesaplandığı belirsiz. Operatör tam ters bir resim görüyor. Aynı kavram `/admin/dealers-health`'te artan (kötüden iyiye) sıralanıyor (`app/api/admin/dealers-health/route.ts:110`) — iki sayfa çelişiyor.
- **Profesyonel öneri:** Skoru "veri yeterliliği" ile birlikte döndürün (`confidence: 'insufficient' | 'low' | 'ok'`; ör. 14 günde < N sinyal ise skor `null`). Tabloyu varsayılan olarak artan sıralayın, erken uyarıları ayrı bir "Dikkat gerektiren bayiler" şeridinde kırmızı/amber rozetlerle gösterin, sütun bazlı sıralama + bayi arama + sayfalama ekleyin, oranları yüzde olarak biçimlendirin, satırı bayi detayına linkleyin. Uzun vadede v1 (`/admin/dealers-health`) ve v2 tek bir "Bayi sağlığı" sayfasında, tek skor tanımıyla birleşmeli.
- **Efor:** M

### 3. [YÜKSEK · Hata] A/B raporunda dönüşüm oranı yapısal olarak hep boş
- **Kanıt:** Gösterim: `app/api/customer/innovation/ab/variant/route.ts:49-51` `dimension: exp.dimension || 'copy'` ile kaydediyor; dönüşüm: `app/api/customer/innovation/ab/event/route.ts:28-33` dimension göndermiyor; rapor anahtarı `app/api/admin/innovation/ab-report/route.ts:36-39` → `exp:A:copy` ve `exp:A:_` iki ayrı hücre. Sonuç: gösterim satırlarında dönüşüm 0, dönüşüm satırlarında gösterim 0 → `conversionRatePercent` null.
- **Sorun:** Tablo deney karar aracı olarak işe yaramaz. Ek olarak: (a) `ab/variant` ve `ab/event` uçlarını çağıran hiçbir istemci kodu yok (yalnızca page.tsx:386'daki açıklama metninde geçiyor) — rapor pratikte hep "Son 30 günde kayıt yok"; (b) `ab/event` kimlik doğrulamasız, rate-limit'siz ve deneyin var olup olmadığını kontrol etmiyor → herkes rastgele `experimentId` ile AnalyticsEvent tablosuna satır yazabilir/dönüşüm şişirebilir; (c) her `variant` GET'i yeni gösterim yazıyor (tekilleştirme yok); (d) rapor 2 × 50.000 satırı belleğe alıp JS'te gruplayan bir uç (ab-report/route.ts:14-31); (e) `experimentId` içinde `:` varsa anahtar ayrıştırma kırılıyor (:56-59).
- **Profesyonel öneri:** Olay şemasını düzeltin: dönüşüm, kullanıcının atandığı varyantı ve dimension'ı sunucuda yeniden türetsin (sticky seed ile `pickAbVariant`), istemciden variant kabul etmesin; `experimentId` aktif deney listesinde yoksa 404; rate-limit + oturum/anon kimlik başına tekil gösterim. Raporu SQL'de `GROUP BY data->>'experimentId', data->>'variant'` ile toplayın (veya günlük özet tablosu), anlamlılık (iki oran z-testi / Bayes olasılık), güven aralığı ve "kazanan" rozetini gösterin. Bu sistemin `/admin/ab-testing` (oyunlaştırma A/B) ile birleştirilip tek bir "Deneyler" ürününe dönüşmesi gerekiyor; şu an iki ayrı, yarım A/B altyapısı var.
- **Efor:** L

### 4. [YÜKSEK · Güvenlik/Veri bütünlüğü] Config PUT şemasız; tek hatalı istek müşteri uçlarını 500'e düşürebilir
- **Kanıt:** `app/api/admin/innovation/config/route.ts:39-40` gövde doğrudan `saveInnovationPlatformConfig`'e; `lib/innovation-config.ts:90-101` `mergeDeep` tip kontrolü yapmıyor, bilinmeyen anahtarları da saklıyor; tüketiciler `cfg.campaignAb.experiments.find(...)` (`ab/variant/route.ts:33`, `lib/innovation-ab.ts:15`), `cfg.features.flashOffers` (birçok route).
- **Sorun:** `{"campaignAb":{"experiments":null}}` veya `{"features":"x"}` gibi bir gövde kaydedilirse müşteri uçları TypeError ile 500 verir ya da tüm özellikler sessizce kapanır. `retentionDaysPersonalData` negatif/metin olabilir, `webhookUrl` `http://169.254.169.254/...` gibi iç adres olabilir (sunucu `partner-digest-webhook/route.ts:24` bunu zaman aşımı olmadan `fetch` ediyor). Okuma-değiştirme-yazma transaction'sız (`lib/innovation-config.ts:120-130`) → iki admin aynı anda kaydederse son yazan kazanır. Hiçbir değişiklik AuditLog'a yazılmıyor; oysa `/admin/features` her bayrak değişikliğini audit'liyor (`app/api/admin/features/route.ts:96, :164, :214, :266`).
- **Profesyonel öneri:** `InnovationPlatformConfig` için Zod şeması (`.strict()`, sayılar için min/max, URL için `https` + özel/iç IP engeli), PUT'ta `schema.partial().deepPartial()` doğrulaması; kayıt `prisma.$transaction` içinde `updatedAt`/`version` ile iyimser kilitli; her PUT'ta önce/sonra farkıyla AuditLog kaydı. Okuma tarafında `getInnovationPlatformConfig` sonucunu yine şemayla `safeParse` edip bozuk alanları varsayılana düşürün (savunmacı okuma). Webhook `fetch`'ine `AbortSignal.timeout(10_000)` ekleyin.
- **Efor:** M

### 5. [ORTA · Güvenlik] Webhook HMAC secret tarayıcıya düz metin dönüyor ve her blur'da yeniden yazılıyor
- **Kanıt:** `config/route.ts:17, :24` tüm config'i (secret dahil) döndürüyor; `page.tsx:491-509` `type="password"` yalnızca görsel maske, değer state'te; `onBlur` her seferinde `saveConfig({ partnerDigest })`.
- **Sorun:** Secret, DevTools/ağ sekmesi, tarayıcı eklentileri ve olası log/APM kayıtları üzerinden sızabilir. Admin "secret'ı gördüm mü, döndürdüm mü" bilemiyor. Blur her seferinde aynı değeri yazıyor + "Kaydedildi" toast'ı (URL alanında da `!= null` koşulu `''` için true → page.tsx:480-484).
- **Profesyonel öneri:** Secret'ı write-only yapın: GET yalnızca `hasSecret: true` + son 4 karakter + `rotatedAt` döndürsün; UI'da "Secret oluştur/döndür" butonu sunucuda kriptografik rastgele üretip **bir kez** göstersin (kopyala butonu). URL/secret için açık bir "Kaydet" butonu ve kirli-durum takibi; değişmemiş alan kaydedilmesin. İdealde bu kart tamamen `/admin/webhooks`'a taşınmalı (orada zaten teslim günlüğü var: `fetch('/api/admin/webhooks/deliveries')`).
- **Efor:** S

### 6. [ORTA · UX/Güvenlik] Segment onay kuyruğu mesaj metnini göstermeden onaylatıyor
- **Kanıt:** `page.tsx:304-331` yalnızca `title`, `segmentKey`, `businessName`; mesaj (`message`) yok. Alt sayfa gösteriyor: `app/admin/innovation/segment-proposals/page.tsx:87`. Onay sonrası bayi gönderebilir: `send/route.ts:42-95`.
- **Sorun:** Onay, bayinin segmentindeki (en fazla `MAX_SEND`) gerçek müşterilere bildirim + push gönderilmesinin kapısı. Admin içeriği okumadan onaylıyor; hedef kitle büyüklüğü (`resolveInnovationSegmentUserIds`) gösterilmiyor. Butonlarda meşgul durumu yok (page.tsx:323-327) → çift PATCH. Red gerekçesi alınmıyor. API tarafında durum geçiş kuralı yok (`segment-proposals/[id]/route.ts:28-43`): SENT bir taslak yeniden APPROVED yapılabilir → bayi tekrar gönderip müşterilere çift push atabilir.
- **Profesyonel öneri:** Kuyruğu bir "inceleme" deneyimine çevirin: satır genişleyince tam mesaj, push önizlemesi (başlık/gövde/ikon), tahmini alıcı sayısı (yeni `GET .../segment-proposals/:id/preview` ucu), bayi geçmişi (son 30 günde kaç kampanya gönderdi). "Onayla" ve "Reddet (gerekçe zorunlu)" ayrı diyaloglar; gerekçe bayiye bildirim olarak gitsin. API'de durum makinesi: yalnızca `PENDING → APPROVED|REJECTED`, `APPROVED → SENT`; `updateMany({ where: { id, status: 'PENDING' } })` ile atomik geçiş; AuditLog. Ana sayfadaki kopyayı kaldırıp yalnızca alt sayfayı tek kaynak yapın.
- **Efor:** M

### 7. [ORTA · Performans] Her yükleme ve her eylem sonrası ~1000+ sorgu, cache yok
- **Kanıt:** `page.tsx:54-61` 6 uç paralel; `page.tsx:112, :131, :151` her onay/demo sonrası `load()`; `health-score-v2/route.ts:22-34` 200 bayi × `computeDealerHealthV2` (5 sorgu, `lib/dealer-health-v2.ts:24-47`) ≈ 1000 sorgu; `risk-dashboard/route.ts:38-41` 14 günlük tüm feedback satırları; `ab-report/route.ts:14-31` 100.000'e kadar satır; `flash-offers/route.ts:12-18` 200 satır + dealer e-postası (15'i gösteriliyor); `config/route.ts:18-22` kullanılmayan AuditLog sorgusu.
- **Sorun:** Tek bir "Onayla" tıklaması tüm bu yükü yeniden tetikliyor. Sayfanın "yükleniyor" durumu en yavaş uca (sağlık) bağlı. Neon pooler bağlantı sınırı düşükken (bkz. proje notu `connection_limit`) bu uç diğer admin isteklerini de yavaşlatır.
- **Profesyonel öneri:** (1) Bölümleri bağımsız veri kaynaklarına ayırın (her kart kendi SWR/React Query anahtarıyla; eylem sonrası yalnızca ilgili anahtar `mutate` edilsin). (2) Sağlık skoru 2.0'ı istekte değil, günlük/saatlik cron'da hesaplayıp `DealerHealthSnapshot` tablosuna yazın veya mevcut Upstash cache katmanına 10-15 dk TTL ile koyun; sorguları bayi başına değil `groupBy` ile toplu yapın. (3) Risk ve A/B toplamlarını SQL `GROUP BY`/`HAVING` ile veritabanında yapın. (4) Flash listesini sunucuda `take: 15` + gerekli alanlarla sınırlayın; kullanılmayan AuditLog sorgusunu kaldırın.
- **Efor:** M

### 8. [ORTA · İşlevsellik] "Sadece plan" sahte — planı döndüren API'nin yanıtı hiç gösterilmiyor
- **Kanıt:** `page.tsx:140-151` yanıt `data` yalnızca hata için okunuyor; `demo-scenario/route.ts:43-49` `steps` (7 adım, `lib/innovation-demo-scenario.ts:18-61`) döndürüyor. Benzer şekilde demo-package'ın `created` ID'leri ve `trainingNotes` (demo-package/route.ts:96-110) atılıyor.
- **Sorun:** Kart "Adım adım simülasyon planı… canlı tur için kullanın" diyor (page.tsx:357-359) ama kullanıcıya tek adım gösterilmiyor. Ayrıca plan tamamen statik — bayiye özgü hiçbir şey yok; bu bir API çağrısı bile gerektirmiyor.
- **Profesyonel öneri:** Ya kaldırın ya da gerçek bir "Demo turu" bileşenine dönüştürün: 120 sn'lik zaman çizelgesi (adım kartları, `atSec` ilerleme çubuğu, her adımda ilgili bayi/müşteri ekranına derin link, oluşturulan kayıtlara linkler). Statik plan içeriği istemcide sabit olarak durabilir; API yalnızca seed işini yapsın.
- **Efor:** S (kaldırma) / M (tur bileşeni)

### 9. [ORTA · Uyumluluk] KVKK iletişim e-postası ve saklama süresi düzenlenemiyor; saklama süresi uygulanmıyor
- **Kanıt:** `lib/innovation-config.ts:74-77` varsayılan `kvkk@example.com`, `730`; `page.tsx:204-207` yalnızca gösterim; `app/api/customer/privacy-request/route.ts:80` müşteriye `complianceContact` olarak dönüyor; `retentionDaysPersonalData` için grep yalnızca page.tsx:206 ve config/route.ts:27'de eşleşiyor (hiçbir temizlik işinde kullanılmıyor).
- **Sorun:** Canlı DB'de değer set edilmemişse (doğrulanmadı) KVKK talebinde bulunan müşteriye `kvkk@example.com` gösteriliyor — hukuki risk. "Saklama süresi" bir uyumluluk taahhüdü gibi sunuluyor ama hiçbir veri bu sürede silinmiyor; yanıltıcı.
- **Profesyonel öneri:** Bu iki alanı `/admin/compliance`'a taşıyıp düzenlenebilir yapın (e-posta doğrulaması, boş/`example.com` ise kırmızı uyarı ve müşteri ucunda platform iletişim adresine geri düşme). Saklama süresini gerçek bir politika motoruna bağlayın: mevcut `db-cleanup` cron'una "kişisel veri anonimleştirme" adımı (model bazlı alan listesi, kuru-çalıştırma raporu, AuditLog). Uygulanana kadar UI'da "bilgi amaçlı — otomatik silme yok" diye açıkça etiketleyin.
- **Efor:** M

### 10. [ORTA · Mimari] İkinci, denetimsiz bir özellik bayrağı sistemi
- **Kanıt:** `page.tsx:224-249` + `lib/innovation-config.ts:28-37` Settings JSON'unda 8 bayrak; ayrıca `/admin/features` `prisma.featureFlag` + AuditLog kullanıyor (`app/api/admin/features/route.ts:43-96`).
- **Sorun:** Operatör "özellik kapatma" için iki yer olduğunu bilmek zorunda; inovasyon bayraklarında açıklama, kapsam (bayi/yüzde rollout), değişiklik geçmişi, "kim kapattı" bilgisi yok. Etiketler ham anahtar (`capitalize` → "TablePulse"). `flashOffers` kapatılınca müşteri ve bayi uçları anında 403 dönüyor — onay yok.
- **Profesyonel öneri:** İnovasyon bayraklarını FeatureFlag modeline taşıyın (`innovation.tablePulse` vb. anahtarlar, açıklama, etki alanı, sahibi), `getInnovationPlatformConfig().features` okumasını `isFeatureEnabled()` ile değiştirin (Redis cache'li). Bu sayfada yalnızca durumu gösteren, `/admin/features?group=innovation`'a giden bir özet bırakın. Geçiş döneminde kritik bayrak kapatmada etki açıklamalı onay diyaloğu.
- **Efor:** M

### 11. [DÜŞÜK · Hata yönetimi] Yükleme `res.ok` kontrol etmiyor; boş durumlar yükleme sırasında yanlış mesaj veriyor
- **Kanıt:** `page.tsx:62-70` hiçbir yanıtın durum kodu kontrol edilmiyor; `:301-302` "Bekleyen taslak yok", `:404-409` "Son 30 günde kayıt yok", `:536-537` "Kayıt yok" `loading`'den bağımsız.
- **Sorun:** Oturum düşerse/uç 500 verirse sayfa "veri yok" der; operatör sorunun olmadığını sanar. İlk açılışta da boş durum mesajları bir an görünüp kayboluyor.
- **Profesyonel öneri:** Her bölüm için `{ data, error, isLoading }` üçlüsü; iskelet (skeleton) satırları, bölüm içi hata kutusu + "Yeniden dene". Tek bir `fetchJson` yardımcı fonksiyonu (`!res.ok` → throw).
- **Efor:** S

### 12. [DÜŞÜK · UX] Operatöre yönelik metinlerde iç uygulama ayrıntısı ve dil karışıklığı
- **Kanıt:** `page.tsx:385-388` (endpoint yolları, `dimension` alanı), `:443-446` (`15 * * * *`, `buildPartnerDigestPayload`), `:516-523`; "Orphan / risk özeti" (:178), "Tenant demo paketi" (:340), "CONCERN oranı" (:268); i18n yalnızca `t('common.updated')` (:111).
- **Sorun:** Admin kullanıcı geliştirici değil; kod adları ve cron ifadeleri bilgi değil gürültü. EN locale'deki admin tamamen TR metin görüyor. Ayrıca "24 saatlik özet" webhook'u saatlik çalışıyor (`lib/inngest/functions.ts:194-201`) → partner aynı 24 saatlik pencereyi günde 24 kez alıyor; bu davranış açıklanmıyor.
- **Profesyonel öneri:** Teknik ayrıntıları "Geliştirici notları" açılır bölümüne veya `/admin/api-catalog`'a taşıyın; operatör diliyle yeniden yazın ("Partnerlere her saat son 24 saatin özeti gönderilir"). Tüm metinleri `messages/{tr,en}.json` altına `admin.innovation.*` anahtarlarıyla alın.
- **Efor:** S

### 13. [DÜŞÜK · Erişilebilirlik] Form etiketleri kontrollere bağlı değil, tablolar anlamsal değil
- **Kanıt:** `page.tsx:236-243`, `:344-345`, `:363-368`, `:449`, `:463`, `:487` (`Label` `htmlFor` yok, kontrollerde `id` yok); tablolarda `<caption>`/`scope` yok (:261, :392, :540); `RefreshCw` `animate-spin` (:169) reduced-motion'da da dönüyor.
- **Sorun:** Ekran okuyucu 8 anahtarı "switch, kapalı" diye adsız okuyor; hangi bayrağı değiştirdiği anlaşılmıyor.
- **Profesyonel öneri:** `useId()` ile `Label htmlFor` ↔ `Switch id`; tablolara görünmez caption ve `th scope="col"`; yükleme durumlarına `aria-busy` / `role="status"`; spin için `motion-safe:animate-spin`.
- **Efor:** S

### 14. [DÜŞÜK · Mimari] Tipsiz state, kopya kod, ölü kod
- **Kanıt:** `page.tsx:29-32, :154-156, :304-310, :411-419, :547` (`unknown` + yerinde cast); `demo-package/route.ts:37-94` ≈ `demo-scenario/route.ts:51-107`; `lib/dealer-health-v2.ts:51` `totalPulse` kullanılmıyor; `repeatVisitorRatio` tipte `number | null` ama hiç null değil (:8, :62); `risk-dashboard/route.ts:88` `remedyBreachingSlaHours`, `:93-100` kullanılmıyor.
- **Sorun:** API sözleşmesi ile UI arasında tip bağı yok; uçtaki bir alan adı değişikliği derleme hatası değil, sessiz boş tablo üretir.
- **Profesyonel öneri:** Her uç için `lib/innovation/contracts.ts` içinde Zod yanıt şemaları + `z.infer` tipleri; sayfa bunları kullansın. Demo seed tek servise; ölü alanlar silinsin veya UI'da kullanılsın.
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog)

1. **Değişiklik geçmişi / denetim izi** — Stripe ve PostHog her ayar/bayrak değişikliğini kim-ne-zaman-önce/sonra ile gösterir; burada config ve segment kararları için hiç yok.
2. **Deney yönetimi** — PostHog Experiments gibi: deney oluşturma sihirbazı, hedef metrik, örneklem büyüklüğü hesabı, anlamlılık/olasılık, "kazananı yayınla". Şu an tanımlama bile UI'dan yapılamıyor.
3. **Webhook teslim günlüğü + test gönder + yeniden dene** — Stripe Webhooks standardı: son N teslim, HTTP kodu, yanıt gövdesi, imza doğrulama örneği, secret döndürme.
4. **Bayi seçici ve bayiye derin link** — Retool/Linear'daki komut paleti tarzı arama; ham cuid yerine ad/e-posta ile seçim, satırdan bayi detayına gitme.
5. **Uyarı/eşik kuralları ve bildirim** — "SLA aşımı > 10 olursa Slack/e-posta" gibi alarm kuralları; şu an sayaçlar yalnızca ekrana bakınca görülüyor.
6. **Zaman serisi ve trend** — Risk sayaçlarının dünkü/geçen haftaki değerle karşılaştırması (sparkline, delta rozeti); tek anlık sayı karar için yetersiz.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "İnovasyon kontrol merkezi" — operatör sayfayı açtığında 5 saniyede *neyin dikkat istediğini* görür, tek tıkla ilgili iş akışına gider. Yapılandırma ve demo araçları ana akıştan ayrılır.

**Yerleşim (sekmeli, URL senkronlu `?tab=`):**
1. **Genel bakış** (varsayılan) — Üstte 4 KPI kutucuğu (telafi onay kuyruğu, SLA aşımı, 24 saatte biten flash, düşük puanlı bayi) her biri trend deltası + sparkline ile ve tıklanınca filtreli listeye giden. Altında "Dikkat gerektirenler" akışı: `priorityHints` + `earlyWarnings` + `orphanRiskItems` tek bir önceliklendirilmiş liste (bayi adı, sebep, ne zamandan beri, eylem butonu).
2. **Onay kuyruğu** — Segment taslakları için Linear tarzı ikili panel: solda liste (bayi, segment, alıcı sayısı, bekleme süresi), sağda tam mesaj + push önizlemesi + bayi geçmişi; `J/K` ile gezinme, `A` onay, `R` red (gerekçe zorunlu). `/admin/innovation/segment-proposals` bu sekmeye yönlenir.
3. **Bayi sağlığı** — Artan skorlu, sıralanabilir/filtrelenebilir tablo; "veri yetersiz" ayrı rozet; satırda skor bileşenleri (telafi, masa, tekrar) küçük yığılmış çubuk olarak. (Orta vadede `/admin/dealers-health` ile birleşir.)
4. **Deneyler** — A/B listesi, oluşturma sihirbazı, sonuç kartları (oran, güven aralığı, kazanan olasılığı).
5. **Ayarlar** — Özellik bayrakları (açıklama + etki + son değiştiren), referral limitleri, A/B varsayılan bölünme; açık "Kaydet" + kirli durum + fark önizlemesi. Webhook ve uyumluluk alanları ilgili sayfalara linkli özet olarak.
6. **Sandbox/Demo** — Yalnızca sandbox bayilerle çalışan, iki aşamalı onaylı seed + "geri al"; 120 sn tur zaman çizelgesi.

**Motion/3D:** 3D gerekmez — bu bir operasyon ekranı. Ölçülü framer-motion (`m as Motion`, global LazyMotion): KPI sayılarında kısa sayaç geçişi (yalnızca değer değişince), onay kuyruğunda karar verilen satırın `layout` ile kayarak çıkması, sekme geçişinde 120-150 ms opacity/translate. `useReducedMotion` ile hepsi anında geçişe düşmeli. Hero'daki nefes animasyonu yeterli; sayfaya ek dekoratif hareket eklenmemeli.

**Veri/API değişiklikleri:**
- `GET /api/admin/innovation/overview` — KPI'lar + trend (dün/7 gün) + önceliklendirilmiş dikkat listesi; Upstash cache 60 sn.
- Sağlık skoru: cron ile `DealerHealthSnapshot` (dealerId, score, components JSON, confidence, computedAt); tablo snapshot'tan sayfalı okunur.
- Segment: `GET .../segment-proposals/:id/preview` (alıcı sayısı, push önizleme), PATCH'te durum makinesi + `reason` + AuditLog.
- Config: Zod şemalı, bölüm bazlı uçlar (`/config/features` yerine FeatureFlag; `/config/referral`, `/config/ab`), sürüm alanıyla iyimser kilit, AuditLog.
- A/B: sunucu tarafı varyant türetme, dimension tutarlılığı, SQL toplama, rate-limit.
- Demo: `seedInnovationDemo` servisi, `demoBatchId` + müşteri uçlarında filtre, `DELETE /api/admin/innovation/demo/:batchId`.

---

## Çakışmalar / birleştirme önerisi

| Bu sayfadaki bölüm | Çakıştığı sayfa | Öneri |
|---|---|---|
| Segment kampanya onay kuyruğu | `/admin/innovation/segment-proposals` (aynı API, daha iyi: mesaj + SENT) | Ana sayfadaki kopyayı kaldır; tek kaynak "Onay kuyruğu" sekmesi. |
| Sağlık skoru 2.0 | `/admin/dealers-health` (v1 skor, ters sıralama) | Tek "Bayi sağlığı" sayfası, tek skor tanımı. |
| Özellik anahtarları | `/admin/features` (FeatureFlag + audit) | Bayrakları FeatureFlag'e taşı; burada yalnızca özet. |
| A/B kampanya deneyleri | `/admin/ab-testing` (oyunlaştırma A/B) | Tek "Deneyler" ürünü. |
| Partner webhook + entegrasyon paketi | `/admin/webhooks`, `/admin/partners`, `/admin/api-keys`, `/admin/api-catalog` | Webhook ayarını `/admin/webhooks`'a (teslim günlüğü orada var), dokümantasyon metnini `/admin/api-catalog`'a taşı. |
| Uyumluluk özeti | `/admin/compliance` | Saklama süresi + KVKK e-postası düzenlemesini oraya taşı; burada yalnızca link. |
| Son flash teklifleri | (bayi tarafı `/dealer/innovation`) | Genel bakıştaki "24 saatte biten" KPI'ına filtreli liste olarak bağla. |

Sonuç: Sayfa kaldırılmamalı — inovasyon modüllerinin gözlem/onay merkezi olarak değeri var — ama yukarıdaki dağıtımdan sonra **Genel bakış + Onay kuyruğu + Sandbox** odaklı, ince bir kontrol merkezine indirgenmeli.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunurdur; kod değiştirilmedi, DB/sunucu/test çalıştırılmadı. Her karar ilgili çağıran/çağrılan kod, `proxy.ts` ve `lib/api-auth.ts` okunarak verildi.

### 1. Demo paketi üretimdeki gerçek bayiye müşterilere görünen aktif flash teklif ve segment taslağı yazıyor — **DOĞRULANDI** (önem: Yüksek)

- `app/api/admin/innovation/demo-package/route.ts:29-32` yalnızca `role: 'DEALER'` kontrol eder; sandbox/demo bayi ayrımı yok. `:53-66` `isActive: true`, `validFrom: now`, `validTo: now+30dk`, `maxRedemptions: 50` ile gerçek `DealerFlashOffer` yazar. `demo-scenario/route.ts:67-80` (`runSeed: true`) aynısını yapar.
- Tüketici: `app/api/customer/innovation/nearby/route.ts:35-40` yalnızca `isActive/validFrom/validTo` ile filtreler (demo işareti yok); oturum bile istemez (`proxy.ts:105-119` `/api/*` için kimlik doğrulaması yapmaz). `app/customer/nearby/page.tsx:233-245` bu ucu çağırıp "Şimdi yakınımda (flash)" kartında gösterir. `flashOffers` varsayılan açık (`lib/innovation-config.ts:62`).
- Segment: `:85-94` PENDING taslak yazar; `app/api/admin/innovation/segment-proposals/route.ts:12-15` bunu gerçek taslaklarla aynı kuyrukta listeler. Onaylanırsa `app/dealer/innovation/page.tsx:129` → `segment-proposals/[id]/send/route.ts:47-95` segmentteki en fazla 500 müşteriye bildirim + push gönderir ("Bu metin örnektir…" metniyle). Not: bu adım bir admin onayı gerektirir; zarar otomatik değil ama kuyrukta demo/gerçek ayrımı yok.
- `page.tsx:115-132` ve `:347` buton kilidi / onay diyaloğu yok; çift tık iki ayrı flash + iki ayrı taslak yazar (`create`, idempotency anahtarı yok).
- Sağlık skoru etkisi: demo `tablePulse` `mood: 'OK'` ile yazılır (`:45-52`); `lib/dealer-health-v2.ts:94-97` CONCERN oranını küçültür → skor yapay yükselir (küçük ama gerçek çarpıtma).
- **Yeniden üretim:** Admin `/admin/innovation` → "Tenant demo paketi" alanına konumu tanımlı gerçek bir bayi ID'si girer → "Paket aç". 15 km içindeki herhangi bir müşteri `/customer/nearby` sayfasını açınca 30 dk boyunca "Demo: Mutlu saat %15 — Bu örnek teklif…" kartını o işletmenin adıyla görür.

### 2. Sağlık skoru 2.0 tablosu en sağlıklı 25 bayiyi gösteriyor, verisiz bayiler 100 puanla tepede — **DOĞRULANDI** (önem: Yüksek, işlevsel)

- `app/api/admin/innovation/health-score-v2/route.ts:36` azalan sıralama; `page.tsx:273` `.slice(0, 25)` → yalnızca en yüksek skorlar görünür.
- `:38` `earlyWarnings` (skor < 55) üretilir ama `page.tsx` yalnızca tipte tanımlar (`:48`), hiç render etmez; kart metni (`:258-260`) "düşük skorlar erken uyarı listesinde özetlenir" der — böyle bir liste ekranda yok.
- `lib/dealer-health-v2.ts:109-118`: kuyruk/stale/pulse/feedback yoksa tüm cezalar 0, `score = 100`. Verisiz (yeni/pasif) bayiler tablonun tepesini doldurur.
- `health-score-v2/route.ts:13-17` `findMany` `orderBy` olmadan `take: 200` → 200+ bayide hangi alt kümenin hesaplandığı belirsiz.
- **Yeniden üretim:** Hiç geri bildirim/masa sinyali olmayan en az 25 bayi varken sayfa açılır → tablo 25 satır "100" gösterir; telafi kuyruğu 5+ olan sorunlu bayi (skor ≤ 75) listede yer almaz ve hiçbir erken uyarı gösterilmez.

### 3. A/B raporunda dönüşüm oranı yapısal olarak hesaplanamıyor; dönüşüm ucu kimliksiz/doğrulamasız — **DOĞRULANDI** (önem: Orta; küçük düzeltme ile)

- Gösterim `dimension: exp.dimension || 'copy'` ile yazılır (`ab/variant/route.ts:49-51`); dönüşüm `extra` olmadan yazılır (`ab/event/route.ts:28-33` → `lib/innovation-ab.ts:38` `data: { experimentId, variant }`). Rapor anahtarı `exp:variant:dimension` (`ab-report/route.ts:36-39`) → gösterim `exp:A:copy`, dönüşüm `exp:A:_` hücresine düşer. Düzeltme: iddiadaki "hep null" tam doğru değil — gösterim satırında oran **0 %**, dönüşüm satırında **null** çıkar (`ab-report/route.ts:60-61`). Her iki durumda da gerçek oran hiçbir zaman hesaplanmaz.
- `ab/event`: oturum zorunlu değil (`:27` yalnızca isteğe bağlı), `proxy.ts:105-119` `/api/*`'ı korumaz, rate-limit yok, `experimentId`'nin config'te var/aktif olup olmadığı kontrol edilmez → her POST bir `AnalyticsEvent` satırı yazar. `ab/variant` GET de anonim olarak her çağrıda bir gösterim satırı yazar.
- Çağıran istemci yok: depoda `innovation/ab/` geçen tek yer `page.tsx:386` açıklama metni. Bu yüzden pratikte tablo boştur; ama uçlar canlıdır.
- **Yeniden üretim:** Oturumsuz `POST /api/customer/innovation/ab/event` gövde `{"experimentId":"xyz","variant":"A"}` döngüsü → sınırsız `AnalyticsEvent` satırı (canlı Neon depolama/maliyet) ve admin raporunda sahte "xyz" deneyi satırları.

### 4. Innovation config PUT şema doğrulamasız; hatalı gövde müşteri uçlarını kırar — **DOĞRULANDI** (önem: Orta — yalnızca ADMIN girdisi; KRİTİK/YÜKSEK abartılı)

- `config/route.ts:39-40` gövdeyi tip dönüşümüyle doğrudan `saveInnovationPlatformConfig`'e verir. `lib/innovation-config.ts:93-97` `mergeDeep`: `null`/string değerler `v !== undefined` dalından olduğu gibi yazılır.
  - `{campaignAb:{experiments:null}}` → `ab/variant/route.ts:33` ve `lib/innovation-ab.ts:15` `.find` üzerinde `TypeError` → try/catch olmadığından 500.
  - `{features:"x"}` → `cfg.features.flashOffers` vb. `undefined` → `nearby`, `radar`, dealer flash/segment/weekly-brief, `table-pulse` vb. uçlar 403 "Özellik devre dışı" döner.
- `lib/innovation-config.ts:117-130` oku-birleştir-yaz transaction/sürüm kontrolsüz: iki eşzamanlı PUT birbirinin değişikliğini ezebilir.
- AuditLog yazımı yok (`saveInnovationPlatformConfig` ve route'ta `auditLog.create` yok).
- Webhook: `partner-digest-webhook/route.ts:24-32` URL doğrulamasız, `AbortSignal` olmadan `fetch` eder (fonksiyon `maxDuration=120` ile sınırlı); yanıtın ilk 200 karakterini döndürür (`:33-34`). İç adres (SSRF) riski yalnızca admin girdisiyle tetiklenebilir; `lib/webhook-dispatch.ts:22,39-52`'deki 8 sn timeout deseni burada uygulanmamış.
- Mevcut UI bu kötü gövdeleri üretmez (`page.tsx:241`, `:454-459`, `:481`, `:506` hep tam nesne yollar); senaryo doğrudan API çağrısı veya ileride hatalı bir istemci gerektirir. Bu yüzden önem Orta.
- **Yeniden üretim:** Admin oturumuyla `PUT /api/admin/innovation/config` gövde `{"campaignAb":{"experiments":null}}` → sonrasında herhangi bir ziyaretçi `GET /api/customer/innovation/ab/variant?experimentId=a` → 500.

### 5. Partner webhook HMAC secret GET yanıtında düz metin dönüyor — **DOĞRULANDI** (önem: Orta)

- `config/route.ts:17,24-25` tüm config'i (`partnerDigest.webhookSecret` dahil) döndürür; `page.tsx:487-509` yalnızca `type="password"` görsel maske uygular, `:504-508` her blur'da secret'ı yeniden PUT eder. Secret write-only değil, döndürme/maskeleme yok.
- Sıkılaştırıcı bağlam: `lib/api-auth.ts:52-80` `requireAuth` admin gizli kapı cookie'sini **kontrol etmez**; gate yalnızca sayfa yollarında `proxy.ts:79-88` ile uygulanır (`/api/*` `proxy.ts:105-119`'da auth'suz geçer). Yani gate'i geçmemiş ama rolü ADMIN olan bir hesap (gate'in tam olarak koruması amaçlanan senaryo) API'yi doğrudan çağırıp secret'ı okuyabilir. Bu, tüm `/api/admin/*` için sistemik bir boşluktur; bu sayfaya özgü değil.
- Sınır: secret'ı okuyabilen herkes zaten PUT ile onu değiştirebilir; ancak **okuma sessizdir** — değiştirme partner entegrasyonunu kırıp fark edilirken, okunan secret ile partner POS'a fark edilmeden sahte imzalı `partner.digest.24h` gövdesi gönderilebilir.
- **Yeniden üretim:** ADMIN rollü oturum (gate cookie'siz) → `GET /api/admin/innovation/config` → `config.partnerDigest.webhookSecret` düz metin → `X-Qratex-Signature: sha256=HMAC(secret, body)` ile partner webhook URL'ine sahte özet POST'u.
- Öneri: GET'te yalnızca `hasSecret: true` + son 4 karakter döndür; ayrı `POST /api/admin/innovation/config/rotate-secret` ucu (sunucuda üretir, bir kez gösterir, AuditLog'a yazar); PUT gövdesinde secret alanını yalnızca açık "değiştir" akışında kabul et; `requireAuth(['ADMIN'])` içine gate cookie doğrulaması ekle (sistemik düzeltme).

| # | İddia | Karar | Önem (yeniden değerlendirilmiş) |
|---|---|---|---|
| 1 | Demo paketi canlı müşterilere flash/segment yazıyor | Doğrulandı | Yüksek |
| 2 | Sağlık skoru tablosu ters, verisiz bayi 100 | Doğrulandı | Yüksek (işlevsel) |
| 3 | A/B oranı hesaplanamıyor, ab/event korumasız | Doğrulandı (oran: gösterimde 0 %, dönüşümde null) | Orta |
| 4 | Config PUT şemasız | Doğrulandı | Orta (yalnızca admin girdisi) |
| 5 | Webhook secret GET'te düz metin | Doğrulandı | Orta |


---

## Uygulama (Dalga 2)

**Karar uygulandı: sayfa parçalandı.** `/admin/innovation`, sorgu parametrelerini koruyarak `/admin/segments?tab=moduller`'e kalıcı yönlendiriyor. Kalan gerçek ayarlar Segmentler → Modüller sekmesinde (`GET|PATCH /api/admin/segments/modules`, `POST .../modules/rotate-secret`). Segment onayı Segmentler → Öneriler'e taşındı. Okuma uçları `ab-report`, `health-score-v2`, `risk-dashboard`, `flash-offers` ve `segment-proposals/**` silindi (tek istemcileri bu sayfaydı). `config` ucu geriye uyumlu olarak yeniden yazıldı. Demo uçları (`demo-package`, `demo-scenario`) arayüzden kaldırıldı (C1); `ALLOW_DEMO_SEED` + `isDemo` kapısıyla yalnız demo ortamında çalışıyorlar.

| # | Yeni durum | Not |
|---|---|---|
| 1 | ÇALIŞIYOR | Yeni uçlar `defineRoute` ADMIN |
| 2 | KALDIRILDI | Hub başlığı; Segmentler sayfası başlığı |
| 3–6 | ÇALIŞIYOR | Her sekme kendi sorgusu; QueryState hata/iskelet; yalnız ilgili anahtar tazelenir |
| 7–9 | KALDIRILDI → Komuta Merkezi | Telafi kuyruğu/SLA sayaçları Komuta kuyruklarında |
| 10–12 | KALDIRILDI | Düşük puanlı QR/öncelik ipuçları: Bayi Sağlığı erken uyarıları ve Komuta bunu gerçek veriyle karşılıyor |
| 13 | KALDIRILDI | Saklama süresi hiçbir silme işinde kullanılmıyordu (yanıltıcı) |
| 14 | KALDIRILDI | KVKK iletişim e-postası artık hiçbir uçta okunmuyor (privacy-request ucu kullanmıyor; grep ile doğrulandı) |
| 15–17 | KALDIRILDI | Bağlantılar; Modüller → "Taşınan bölümler" kartı KVKK ve diğer hedeflere gidiyor |
| 18 | KALDIRILDI | Kullanılmayan denetim sorgusu |
| 19 | ÇALIŞIYOR | 8 anahtar: Türkçe etiket + açıklama, `Label htmlFor` ↔ `Switch id`, kapatmada etki onayı, iyimser kilit (409), önce/sonra farkıyla AuditLog |
| 20–23 | KALDIRILDI → Bayi Sağlığı | Tek skor, artan sıralama, yetersiz veri, erken uyarı (`/admin/dealers-health`) |
| 24–26 | ÇALIŞIYOR → Segmentler/Öneriler | Tam mesaj, kilit, gerekçe, durum makinesi |
| 27–30 | KALDIRILDI (C1) | "Paket aç" / "Sadece plan" üretim arayüzünden çıkarıldı |
| 31–33 | KALDIRILDI → Özellik ve Deney | Bozuk A/B raporu silindi; `campaignAb` verisi korunuyor, eski `config` PUT'u katı şemayla kabul ediyor |
| 34–36 | ÇALIŞIYOR | Webhook: açık "Kaydet" + kirli durum, yalnız herkese açık https (iç IP/localhost reddi), gizli değer GET'te dönmüyor; sunucuda üretilip bir kez gösteriliyor, denetime düz metin yazılmıyor |
| 37 | AÇIK | Test gönderimi ve teslim günlüğü Entegrasyonlar (`/admin/webhooks`) sahipliğinde |
| 38 | KALDIRILDI | Statik metin kartı; bağlantılar "Taşınan bölümler"de |
| 39 | KALDIRILDI | Flash listesi bayi Teklifler alanında |
| 40 | ÇALIŞIYOR | Davet limitleri düzenlenebilir (0–10.000 tam sayı, kirli durum, denetim) |
| 41 | KALDIRILDI → Özellik ve Deney | A/B varsayılan bölünme |
| 42 | ÇALIŞIYOR | Blur'da toast spam'i yok; yalnız gerçek kayıtta |
| 43 | KISMİ | TR/EN sözlüğü; Modüller EN metni henüz TR |
| 44 | ÇALIŞIYOR | Mobil-uyumlu kartlar, ≥44px hedefler |
| 45 | ÇALIŞIYOR | Tüm form etiketleri bağlı |
| 46 | ÇALIŞIYOR | `motion-safe:animate-spin`, `useMotionPolicy` |
| 47 | ÇALIŞIYOR | Segment kararı ve config değişiklikleri AuditLog'da |

**Kapanan bulgular:** 1 (demo arayüzü kaldırıldı; uçlar zaten kapılı), 2 (Bayi Sağlığı'na devredildi, v2 tablosu kaldırıldı), 4 (katı zod `.strict()`, sayı sınırları, https/iç IP engeli, iyimser kilit, AuditLog), 5 (gizli değer yalnız sunucuda üretiliyor, write-only), 6, 7 (1000+ sorgu yapan uçlar silindi; her sekme ayrı sorgu), 8 (sahte plan kaldırıldı), 9 (yanıltıcı alanlar kaldırıldı), 11, 12 (operatör dili; uç ve cron ifadeleri kaldırıldı), 13, 14 (tipli sözleşme `domain.ts`). **12/14 kapandı.**

**Kalanlar:** Bulgu 3, yani A/B olay şeması ve `ab/event` korumasızlığı. Müşteri uçları (`app/api/customer/innovation/ab/*`) Özellik ve Deney (F5.2) sahipliğinde; bozuk rapor arayüzü kaldırıldı. Bulgu 10, yani bayrakların `FeatureFlag` modeline taşınması, aynı alanın işi. Bu arada denetimsiz ikinci sistem sorunu, audit + onay + iyimser kilitle kapatıldı. Partner webhook `fetch`'ine zaman aşımı eklenmesi ayrı bir iş: `app/api/internal/inngest/partner-digest-webhook` bu yüzeyin değil. Orada zaten, adres kayıt anında artık herkese açık https ile sınırlı.
