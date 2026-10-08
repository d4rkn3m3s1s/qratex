# /admin/modules

**Amaç** · Platformdaki 44 modülün (müşteri / bayi / admin / platform) global aç-kapa durumunu, kayıt metriğini, bağlı API uçlarını ve son 24 saatte modül kapısının (module gate) engellediği istek sayısını tek ekranda salt-okunur göstermek. Asıl aç-kapa işlemi `/admin/settings?tab=modules` sekmesinde yapılır; bu sayfa onun "detay/gözlem" yüzüdür.

**Genel puan: 3.5/10** · **Karar: birleştir** (Ayar Merkezi'ndeki "Modüller" sekmesiyle tek bir "Modül Kontrol Düzlemi" sayfasında birleşmeli; birleşirken veri modeli yeniden inşa edilmeli)

> Özet: Sayfa küçük (168 satır) ve ilk bakışta temiz görünüyor, ama gösterdiği bilgi büyük ölçüde **yanıltıcı**. 44 modülün yalnızca 9'u gerçek bir API kapısıyla korunuyor; 18'i sadece menüden gizleniyor; **15'inin aç-kapa anahtarı hiçbir yerde okunmuyor**. Sayfa hepsine aynı "Açık/Kapalı" rozetini basıyor. Bunun yanında 28 modülün "Detay sayfasını aç" bağlantısı admin kullanıcıyı proxy tarafından `/admin`'e geri yönlendiriyor; "Endpoint → Modül" tablosu da elle yazılmış ve kodla uyumsuz.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Veri geliyor ve arama çalışıyor; ancak "Açık/Kapalı" durumu modüllerin üçte birinde etkisiz, 28 detay linki kırık, endpoint tablosu elle tutulmuş ve gerçek kodla uyuşmuyor. |
| UX | 3/10 | Yükleme ve hata durumları yok: hata olunca "0 admin, 0 bayi" gösteriyor. Filtre, sıralama ve boş durum yok; ham İngilizce enum'lar (`customer`, `important`) ve "24s 403" gibi jargon kullanılıyor. |
| Görsel | 4/10 | shadcn kartları düzenli ama hiyerarşi yok. 44 kart aynı ağırlıkta; kritik modüller veya engelleme yaşayanlar öne çıkmıyor. Diğer admin sayfalarında kullanılan `AdminPremiumHero` dili burada yok. |
| Mimari | 3/10 | Endpoint bağları route içinde sabit kodlu. Katalog, gate anahtarları (`vip_lounge`, `dealer_shift_pulse`) ve UI üç ayrı yerde tutuluyor ve birbirinden kopmuş durumda. Sayfa ile Ayar Merkezi aynı katalogu iki ayrı ekranda gösteriyor. |
| Performans | 6/10 | 11 sorgu paralel çalışıyor, sorun yok; ama 403 sayımı için 2000 JSON satırı belleğe çekilip JS'te sayılıyor ve sonuç sessizce 2000'de kesiliyor. |
| Erişilebilirlik + Mobil | 4/10 | Rozet satırında `flex-wrap` yok, 6 rozet dar ekranda taşıyor. Aramanın `aria-label`'ı yok, durum yalnızca renkle iletiliyor, i18n kullanılmıyor (sabit TR). |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa başlığı + açıklama (PageHeader) | ÇALIŞIYOR | app/admin/modules/page.tsx:72-74 | Sabit TR metin. Sidebar etiketi i18n'den geliyor (messages/tr.json:2526); sayfa gövdesi i18n kullanmıyor. |
| 2 | "Yenile" butonu | KISMİ | page.tsx:77-80, 41-55 | Yeniden çekiyor ve spinner dönüyor; ancak `try/finally` içinde `catch` yok, hata kullanıcıya gösterilmiyor ve unhandled rejection oluşuyor. |
| 3 | "Ayar Merkezi" linki | KISMİ | page.tsx:81-86 | `/admin/settings` profil sekmesinde açılıyor. Ayar Merkezi `?tab=modules` deep-link'ini destekliyor (app/admin/settings/settings-client.tsx:280-287) ama burada kullanılmıyor. |
| 4 | İlk yükleme (useEffect fetch) | KISMİ | page.tsx:57-59 | Yükleme iskeleti yok. İlk render'da tüm sayaçlar `0` ve listeler boş görünüyor (page.tsx:97-100 `?? 0`). |
| 5 | Hata durumu | EKSİK | page.tsx:46, 52 | `throw` yakalanmıyor. Hata olursa sayfa "0 admin / 0 bayi / 0 müşteri" gösteriyor, yani yanlış veri. 500 HTML dönerse `res.json()` da patlıyor. |
| 6 | Rol Dağılımı kartı (Admin/Bayi/Müşteri/Staff) | ÇALIŞIYOR | page.tsx:91-102; route.ts:28-31, 119-125 | `user.groupBy(role)` doğru. Role enum'u 4 değerli (prisma/schema.prisma:22-27). Toplam, trend, aktif/pasif ayrımı yok. Bu sayfanın amacıyla ilgisi zayıf. |
| 7 | Modül arama | ÇALIŞIYOR | page.tsx:61-68, 110-113 | label/key/description/scope içinde arıyor. Sonuç yoksa boş durum gösterilmiyor. |
| 8 | Modül kartı – ad + "Açık/Kapalı" rozeti | KISMİ / yanıltıcı | page.tsx:117-121; route.ts:81-85 | Yalnızca global `moduleControls` değerini yansıtıyor. Rol bazlı `featureVisibility` kapatmasını göstermiyor (lib/module-gate.ts:101). 15 modülde anahtarın hiçbir etkisi yok (Bulgu B1). |
| 9 | Modül kartı – açıklama | ÇALIŞIYOR | page.tsx:123; lib/module-controls.ts:17-69 | |
| 10 | Scope rozeti | KISMİ | page.tsx:125 | Ham İngilizce enum (`customer`/`dealer`/`admin`/`platform`) gösteriliyor, TR karşılığı yok. `ai_features` bayi scope'unda ama admin sayfasına bağlanıyor (module-controls.ts:47). |
| 11 | Önem (severity) rozeti | KISMİ | page.tsx:126 | Ham `critical/important/optional`. Kritik modüllere görsel bir vurgu yok. |
| 12 | Anahtar (key) rozeti | ÇALIŞIYOR | page.tsx:127 | Teknik anahtar düz rozet olarak gösteriliyor, monospace değil. Ayar Merkezi'nde `font-mono` kullanılıyor (settings-client.tsx:1885). |
| 13 | "kayıt: N" metriği | KISMİ | page.tsx:128; route.ts:32-57 | 44 modülün yalnızca 8'inde var. Anlamı tutarsız: `quests` = yalnızca aktif görev, `surprise_boxes` = kullanıcıya düşen kutu örneği, `campaigns` = toplam kampanya. Etikette ne sayıldığı yazmıyor. |
| 14 | "etkilenen endpoint: N" rozeti (kapalıysa) | KISMİ | page.tsx:129-131; route.ts:87-90, 114 | Sabit `endpointBindings` listesinden hesaplanıyor. Listede olmayan gate'li uçlar sayılmıyor (Bulgu B4). 35 modülde liste boş olduğundan "0" gösteriliyor ve bu "kapatmanın hiçbir uca etkisi yok" anlamına gelmiyor. |
| 15 | "24s 403: N" rozeti | KISMİ | page.tsx:132; route.ts:92-110 | Global kapatma ve rol bazlı kapatma tek sayıda karışıyor (module-gate.ts:104). Kimliksiz istekler de sayılıyor (Bulgu B5). Sayım `take: 2000` ile sessizce kesiliyor. |
| 16 | "Detay sayfasını aç" linki | BOZUK (28/39) | page.tsx:134-138; module-controls.ts:18-45; proxy.ts:50-71 | `/customer/*` ve `/dealer/*` hedefleri ADMIN rolünü proxy'de `/admin`'e yönlendiriyor (Bulgu B2). `landing_*` → `/` çalışıyor ama hedefi belirsiz. 5 modülde link yok. |
| 17 | Endpoint → Modül tablosu | KISMİ / sabit kodlu | page.tsx:145-165; route.ts:59-79 | 19 satır elle yazılmış. Gerçekte gate'li 3 uç eksik, 1 satır katalogda olmayan modüle bağlı (Bulgu B4). Filtre veya modüle göre gruplama yok. |
| 18 | HTTP method rozetleri | ÇALIŞIYOR | page.tsx:157-161 | Metot bilgisi de elle yazılmış, doğrulanmıyor. |
| 19 | Modülü buradan aç/kapa | EKSİK | — | Sayfa salt-okunur. Toggle Ayar Merkezi'nde (settings-client.tsx:1819-1910). İki ekran aynı katalogu gösteriyor. |
| 20 | Scope / durum / önem filtresi | EKSİK | — | Ayar Merkezi'nde scope filtresi var (settings-client.tsx:1839-1850), burada yok. |
| 21 | Sıralama (ör. 403'e göre, kritikliğe göre) | EKSİK | page.tsx:115 | Katalog sırasıyla gösteriliyor. |
| 22 | Boş durum (arama sonucu / endpoint yok) | EKSİK | page.tsx:114-141, 150-164 | |
| 23 | Değişiklik geçmişi (kim, ne zaman kapattı) | EKSİK | app/api/admin/settings/modules/route.ts:53-62 | AuditLog yazılıyor ama bu sayfada gösterilmiyor. |
| 24 | Yetki kontrolü (sayfa) | ÇALIŞIYOR | proxy.ts:50-87 | ADMIN rolü + gizli kapı çerezi gerekiyor. |
| 25 | Yetki kontrolü (API) | KISMİ | route.ts:11-12; lib/api-auth.ts:52-80 | `requireAuth(['ADMIN'])` var. API katmanı admin gizli kapı çerezini kontrol etmiyor (proxy.ts:104-118 `/api` için authMiddleware'i atlıyor). Sistem geneli bir konu; bu uç da etkileniyor. |
| 26 | Önbellek başlıkları | ÇALIŞIYOR | route.ts:8, 128 | `force-dynamic` + `PRIVATE_NO_STORE_HEADERS`. |
| 27 | Mobil yerleşim | KISMİ | page.tsx:96, 114, 124 | Grid'ler kırılıyor; rozet satırı `flex` olup `flex-wrap` içermediğinden taşıyor. |
| 28 | Sayfa metadata (title) | EKSİK | page.tsx:1 (`'use client'`) | Sekme başlığı layout varsayılanında kalıyor; "Modül Detay Merkezi" görünmüyor. |
| 29 | Alt rota `/admin/modules/ai-tones` | KAPSAM DIŞI / öksüz | app/admin/modules/ai-tones/page.tsx; app/admin/ai-settings/page.tsx:365 | Modüllerle ilgisi yok, sadece AI ayarlarından linkleniyor. Bilgi mimarisi açısından yanlış yerde. |

**Durum sayımı:** ÇALIŞIYOR 9 · KISMİ 13 · BOZUK 1 · SAHTE 0 · EKSİK 6 (toplam 29; 29 numaralı satır kapsam dışı, KISMİ'ye sayıldı)

---

## Bulgular

### B1. Modüllerin üçte birinde anahtarın etkisi yok, sayfa bunu "Açık/Kapalı" diye gösteriyor
- **Önem:** yüksek · **Kategori:** işlevsellik / veri doğruluğu
- **Kanıt:** Katalogdaki 44 anahtarın kod genelinde kullanımı tek tek tarandı (`grep` + sidebar `key/featureKey/moduleKey` eşleşmesi):
  - **Gerçek API kapısı (9):** donations, referrals, squads, quests, rewards, surprise_boxes, discovery, campaigns, remedy_offers. `assertModuleEnabled` çağrıları: app/api/customer/donations/route.ts:38, app/api/referral/route.ts:26, app/api/customer/squads/route.ts:16, app/api/gamification/quests/route.ts:16, app/api/gamification/rewards/route.ts:72, app/api/admin/surprise-box/route.ts:13, app/api/customer/discovery/route.ts:105, app/api/dealer/campaigns/route.ts:28, app/api/dealer/feedbacks/[id]/remedy/route.ts:36.
  - **Landing bölümü (2):** landing_pricing, landing_marquee (app/(public)/page.tsx:30-32).
  - **Yalnızca menü gizleme (18):** customer_campaigns, customer_ai_insights, progress_hub, spending_overview, journey_score, business_outcomes, growth_hub, dealer_innovation, voc_wall, heatmap, benchmark, copilot, churn_risk, roi, incidents, dealer_surveys, staff_management, ai_features (components/dashboard/sidebar.tsx:446-455). URL ve API'ler erişilebilir kalıyor.
  - **Hiçbir etkisi yok (15):** experiences, operations_brief, customer_radar, action_items, feature_flags, webhooks, api_keys, seo_engine, experience_pulse_studio, fraud_prevention, insights_global, ab_testing, admin_bootstrap, audit_logs, observability. Admin menü öğelerinde `key/moduleKey` alanı yok (sidebar.tsx:177, 183, 220-226). Bu yüzden `mk` `undefined` oluyor ve filtre her zaman `true` dönüyor (sidebar.tsx:450-454). Hiçbir API de bu anahtarları okumuyor.
- **Sorun:** "Fraud Prevention · critical · Kapalı" gören bir operatör sahtekarlık korumasının kapandığını ya da acil durumda "API Anahtarları"nı kapatıp anahtarlı erişimi durdurduğunu düşünür. Gerçekte hiçbir şey değişmez. Kontrol düzleminde yanlış güven hissi, en tehlikeli UX hatasıdır.
- **Öneri:** Kataloğa her modül için bir **zorlama seviyesi** alanı eklenmeli: `enforcement: 'api' | 'ui' | 'landing' | 'none'`. Bu alan elle yazılmamalı, B4'teki derleme-zamanı tarayıcı ile **türetilmeli**. Sayfa her kartta "API kapısı (N uç) / Yalnız menü / Etkisiz" etiketini göstermeli. `none` olanlar ya katalogdan çıkarılmalı ya da gerçekten bağlanmalı. Ör. `webhooks` için webhook dağıtıcısında, `api_keys` için API-key doğrulayıcısında `assertModuleEnabled` çağrılmalı. Kill-switch anlamı taşıyanlar (api_keys, webhooks, ai_features) mutlaka API seviyesinde zorlanmalı.
- **Efor:** L

### B2. 28 "Detay sayfasını aç" linki admin'i `/admin`'e geri atıyor
- **Önem:** yüksek · **Kategori:** işlevsellik / kırık link
- **Kanıt:** page.tsx:134-138 → `item.detailHref`. Müşteri modüllerinin 13'ü `/customer/*`, bayi modüllerinin 15'i `/dealer/*` hedefliyor (lib/module-controls.ts:18-45). proxy.ts:50-71: `/customer` CUSTOMER, `/dealer` DEALER rolü istiyor; ADMIN token'ı `roleRedirects.ADMIN = '/admin'` ile geri yönlendiriliyor. Hedef sayfaların hepsi var (dosya kontrolüyle doğrulandı), sorun yalnızca rol.
- **Sorun:** Butonların %70'i işe yaramıyor ve kullanıcı açıklama görmeden dashboard'a atılıyor. `referrals` ile `customer_campaigns` aynı hedefe gidiyor (module-controls.ts:19-20). `ai_features` bayi scope'unda olmasına rağmen admin sayfasına bağlı (module-controls.ts:47).
- **Öneri:** `detailHref` iki alana ayrılmalı: `adminHref` (modülün admin yönetim sayfası, ör. donations → `/admin/donations`, quests → `/admin/quests`, rewards → `/admin/rewards`, squads → `/admin/squads`, referrals → `/admin/referrals`, discovery → `/admin/discovery`; bu admin sayfaları mevcut) ve `previewHref` (son kullanıcı ekranı). Önizleme için "rol olarak görüntüle" (impersonation / read-only preview) altyapısı yoksa link gösterilmemeli; yerine "Bu ekran müşteri panelinde: /customer/donations" bilgisi ve kopyala butonu konmalı.
- **Efor:** M

### B3. Hata durumunda sayfa "0 kullanıcı" gösteriyor, hata yutuluyor
- **Önem:** orta · **Kategori:** hata yönetimi / veri doğruluğu
- **Kanıt:** page.tsx:41-55 (`try { … throw … } finally`, `catch` yok); page.tsx:57-59 ve 77'de `load()` promise'i beklenmiyor, bu da unhandled rejection'a yol açıyor; page.tsx:97-100 `?? 0`.
- **Sorun:** API 401/403/500 döndürürse (ör. token-replay ihlali, lib/api-auth.ts:70-77) ekranda "Admin 0, Bayi 0, Müşteri 0" görünür ve modül listesi boş kalır. Hata ile "platform boş" durumu ayırt edilemez. İlk yüklemede de iskelet yerine aynı sıfırlar görünüyor.
- **Öneri:** Veri çekme `useSWR` (veya projedeki ortak fetch hook'u) ile yapılmalı, `{data, error, isLoading}` üçlüsü açıkça render edilmeli: yüklenirken kart iskeleti, hata olursa `Alert` + "Tekrar dene", veri yokken sayaçlarda `—`. `toast` için diğer admin sayfaları gibi `@/lib/admin-toast` kullanılmalı (ör. app/admin/api-catalog/page.tsx:10).
- **Efor:** S

### B4. Endpoint → Modül tablosu elle yazılmış ve gerçek kodla uyuşmuyor
- **Önem:** orta · **Kategori:** mimari / veri doğruluğu
- **Kanıt:** route.ts:59-79 sabit dizi. Gerçek `assertModuleEnabled` kullanımıyla karşılaştırma:
  - **Tabloda yok ama gate'li:** `/api/customer/squads/challenge` (route.ts:29), `/api/customer/squads/battles/[id]/respond` (route.ts:26), `/api/dealer/experience-pulse` (`dealer_shift_pulse`, route.ts:20).
  - **Katalogda olmayan anahtarlar:** `vip_lounge` (app/api/customer/lounge/route.ts:16) ve `dealer_shift_pulse`. `normalizeModuleControls` yalnızca katalog anahtarlarını okuduğu için (lib/module-controls.ts:78-87) bu iki gate **hiçbir zaman kapatılamaz**; yalnızca rol görünürlüğüyle kapanabilir. Tabloda `vip_lounge` satırı (route.ts:71) bulunuyor ama modül listesinde karşılığı yok.
  - **Anahtar uyuşmazlığı:** katalogdaki `experience_pulse_studio` (module-controls.ts:55-62) hiçbir yerde okunmuyor; bayi tarafı ise `dealer_shift_pulse` kullanıyor. Admin "Ritim stüdyosu"nu kapattığında bayi ritmi açık kalıyor.
- **Sorun:** "Etkilenen endpoint" sayısı ve tablo, kapatma kararını verecek kişiyi yanlış bilgilendiriyor. Liste kodla senkron tutulmadığı için zamanla daha da kayacak.
- **Öneri:** Projede zaten benzer bir desen var: `lib/data/admin-api-catalog.json`, `npm run catalog:admin-api` ile üretiliyor (app/api/admin/api-catalog/route.ts:10-21). Aynı script `app/api/**/route.ts` dosyalarında `assertModuleEnabled('<key>')` çağrılarını ve export edilen HTTP metotlarını AST ile taramalı, sonucu `lib/data/module-gate-bindings.json`'a yazmalı. Overview route bu dosyayı okumalı. CI'da bir kontrol olmalı: katalogda olmayan bir anahtar gate'lenirse veya katalogdaki bir anahtar hiç tüketilmiyorsa build kırılmalı. `vip_lounge` ve `dealer_shift_pulse` kataloğa eklenmeli ya da `experience_pulse_studio` ile birleştirilmeli.
- **Efor:** M

### B5. 403 sayacı karışık ve gürültülü: kimliksiz istekler ve rol kapatmaları da sayılıyor
- **Önem:** orta · **Kategori:** veri doğruluğu / güvenlik (yazma büyütme)
- **Kanıt:** lib/module-gate.ts:103-118 her engellemede `analyticsEvent.create` çağırıyor, `reason` global veya rol olabiliyor. Birçok route gate'i **kimlik doğrulamadan önce** çağırıyor: app/api/customer/squads/route.ts:16-18, app/api/customer/lounge/route.ts:16-18, app/api/referral/route.ts:26-28, app/api/gamification/quests/route.ts:16-18. Overview `reason` alanına bakmadan tek sayı üretiyor (route.ts:102-110) ve `take: 2000` ile sessizce kesiyor (route.ts:98).
- **Sorun:** (a) Bir modül kapalıyken kimliksiz bir istemci aynı ucu döngüyle çağırarak `AnalyticsEvent` tablosuna sınırsız satır yazdırabilir. Rate limit yok, canlı Neon'da yazma büyütme vektörü oluşuyor. (b) "24s 403" sayısı bot trafiğini, global kapatmayı ve rol kapatmasını aynı rakamda topluyor, bu yüzden karar destek değeri düşük. (c) 2000 üstünde rakam yanlış çıkıyor.
- **Öneri:** Gate çağrısı `requireAuth`'tan sonraya taşınmalı (ya da `assertModuleEnabled` içinde userId yoksa event yazılmamalı). Engelleme olayları Redis sayaçlarıyla (`INCR module_gate:{key}:{reason}:{hour}`, TTL 48s) örneklenmeli; DB'ye günlük toplu yazılmalı. Overview'da sayım SQL ile yapılmalı (`GROUP BY data->>'moduleKey', data->>'reason'`), JS'te değil. UI'da "global / rol / kimliksiz" kırılımı ve 24 saatlik sparkline gösterilmeli.
- **Efor:** M

### B6. Durum rozeti rol bazlı kapatmayı göstermiyor
- **Önem:** orta · **Kategori:** veri doğruluğu / UX
- **Kanıt:** route.ts:83 yalnızca `controls[item.key]` değerine bakıyor. Gerçek gate `featureVisibility[role][key] === false` durumunda da 403 döndürüyor (lib/module-gate.ts:101). Rol görünürlüğü Ayar Merkezi'nin "page-settings" sekmesinde yönetiliyor (settings-client.tsx:1914+).
- **Sorun:** Bir modül "Açık" görünürken bayiler için kapalı olabilir. Admin, 403 sayısının neden arttığını bu ekrandan anlayamaz.
- **Öneri:** Overview `visibility-settings` değerini de okumalı. Her modül için bir **etkin durum matrisi** döndürmeli: `{ global: bool, customer: bool, dealer: bool, system: bool }`. UI bunu kart başına üç küçük nokta ya da hücre olarak göstermeli (Müşteri / Bayi / Sistem).
- **Efor:** S

### B7. Bilgi mimarisi: aynı katalog iki ekranda, yönetim ve gözlem ayrılmış
- **Önem:** orta · **Kategori:** mimari / UX
- **Kanıt:** Bu sayfa (salt-okunur, page.tsx:104-143) ile Ayar Merkezi "Tüm Modül Kontrol Merkezi" (settings-client.tsx:1819-1910) aynı `MODULE_CATALOG` kartlarını neredeyse aynı yerleşimle gösteriyor. Toggle'lar orada, metrikler ve 403 sayıları burada. Ayar Merkezi'ndeki "Müşteri tümünü kapat" gibi toplu ve tehlikeli aksiyonların (settings-client.tsx:1858-1865) onay adımı yok ve etki bilgisi orada görünmüyor.
- **Sorun:** Operatör kapatma kararını veriyi görmeden veriyor, veriyi görürken de kapatamıyor. İki ekranın bakım maliyeti var ve tutarsızlaşıyorlar (ör. buradaki scope filtresi eksikliği).
- **Öneri:** Tek bir "Modül Kontrol Düzlemi" sayfası (bkz. Yeniden tasarım vizyonu). Ayar Merkezi'ndeki sekme buraya yönlendiren bir kısa özet kartına indirilmeli.
- **Efor:** L

### B8. Metrik anlamı tutarsız ve etiketsiz
- **Önem:** düşük · **Kategori:** veri doğruluğu / UX
- **Kanıt:** route.ts:36 `quest.count({ where: { isActive: true } })`, route.ts:39 `userSurpriseBox.count()`, route.ts:32-38 diğerleri tüm zamanların toplamı. page.tsx:128 hepsini "kayıt: N" olarak gösteriyor.
- **Sorun:** Bir sayı aktif tanım, diğeri kullanıcıya düşen örnek, bir başkası tüm zamanlar toplamı. Karşılaştırılamazlar ve modülün "kullanılıyor mu" sorusuna cevap vermiyorlar.
- **Öneri:** Her modül için tek bir **anlamlı kullanım metriği** tanımlanmalı (katalogda `metric: { label, query }`): "Son 7 günde aktif kullanıcı", "Son 7 gün işlem" gibi. Etiket metnin içinde yazmalı ("7g bağış: 42").
- **Efor:** M

### B9. Mobil taşma, erişilebilirlik ve dil karışıklığı
- **Önem:** düşük · **Kategori:** erişilebilirlik / mobil / i18n
- **Kanıt:** page.tsx:124 `flex items-center gap-2` (wrap yok, 6 rozet var); page.tsx:112 arama `Input` için `aria-label` ya da `<label>` yok; page.tsx:119-121 durum yalnızca renk ve kısa kelimeyle veriliyor; page.tsx:125-127 ham İngilizce enum'lar; "24s 403", "endpoint", "Staff" gibi TR/EN karışımı; tüm metinler sabit TR. Diğer admin sayfaları `useAppT` kullanıyor (app/admin/api-catalog/page.tsx:11), bu sayfa kullanmıyor.
- **Öneri:** Rozet satırına `flex-wrap` eklenmeli. Enum'lar için `t('modules.scope.customer')` gibi bir sözlük kullanılmalı. Durum rozetine ikon (CheckCircle / Ban) ve `aria-label` eklenmeli. Arama alanına görünmez etiket konmalı. Sayfa `useAppT` ile i18n'e taşınmalı. Server bileşen sarmalayıcı ile `metadata.title` verilmeli.
- **Efor:** S

### B10. `/admin/modules/ai-tones` yanlış yerde
- **Önem:** düşük · **Kategori:** bilgi mimarisi
- **Kanıt:** app/admin/modules/ai-tones/page.tsx (180 satır); tek giriş noktası app/admin/ai-settings/page.tsx:365.
- **Sorun:** AI üslup yönetimi modül kontrol düzleminin alt rotası olarak duruyor; URL hiyerarşisi yanıltıcı.
- **Öneri:** `/admin/ai-settings/tones` altına taşınmalı, eski yola redirect konmalı.
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog Feature Flags)

1. **Yerinde aç/kapa + etki önizlemesi + onay:** PostHog ve LaunchDarkly'de bir bayrağı kapatmadan önce "bu, X kullanıcıyı / N uç noktayı etkiler" özeti gösterilir. Kritik modüllerde anahtar adını yazarak onay istenir (Stripe'ın tehlikeli aksiyon deseni).
2. **Değişiklik geçmişi ve geri alma:** AuditLog zaten yazılıyor (app/api/admin/settings/modules/route.ts:53-62); modül başına "kim, ne zaman, eski→yeni" zaman çizelgesi ve tek tıkla geri alma eksik.
3. **Rol / segment bazlı hedefleme ve kademeli açılış:** Şu an yalnızca global aç/kapa ve rol görünürlüğü var. Yüzde bazlı rollout ve bayi bazlı istisna (allowlist) yok. Bu, `/admin/features` (FeatureFlag modeli) ile örtüşüyor ve birleşmeli.
4. **Zamanlı kapatma / bakım penceresi:** "Bu modülü 02:00-04:00 arası kapat", "2 saat sonra otomatik aç".
5. **Kullanım ve sağlık sinyali:** Modül başına 7 günlük kullanım sparkline'ı, hata oranı ve 403 trendi (PostHog insight kartı benzeri).
6. **Filtre, sıralama, gruplama ve dışa aktarma:** Scope / durum / önem / zorlama seviyesine göre filtre; "en çok engelleyen" sıralaması; CSV/JSON dışa aktarma; URL'de kalıcı filtre durumu.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Modül Kontrol Düzlemi". Operatör tek ekranda üç soruya 5 saniyede cevap bulur: (1) Neler kapalı ve kim için? (2) Kapatmanın gerçek etkisi ne (hangi uçlar, kaç kullanıcı, son 24 saatte kaç engelleme)? (3) Bunu kim, ne zaman değiştirdi? Ve aynı ekrandan güvenle değiştirir.

**Yerleşim:**
- **Üst şerit (KPI):** Toplam modül · Kapalı · Rol bazlı kısıtlı · Son 24 saat engelleme · **Etkisiz anahtar sayısı** (B1 düzelene kadar kırmızı uyarı). Rol dağılımı kartı bu sayfadan çıkarılmalı; `/admin/users` veya `/admin/ecosystem` zaten bu bilgiyi veriyor.
- **Sol:** Scope sekmeleri (Müşteri / Bayi / Admin / Platform) + filtre çipleri (Durum, Önem, Zorlama) + arama (`/` kısayolu).
- **Orta:** Yoğun tablo görünümü (Linear liste yoğunluğu). Sütunlar: Modül · Zorlama rozeti (API / Menü / Landing / Etkisiz) · Global anahtar · Rol matrisi (3 nokta) · 7g kullanım sparkline · 24s engelleme · Son değişiklik (kişi + göreli zaman). Mobilde her satır kart görünümüne geçer.
- **Sağ çekmece (satır tıklanınca):** Modül detayı. Bağlı uçların listesi (otomatik üretilmiş, metotlarıyla), rol bazlı anahtarlar, kullanım grafiği, 403 kırılımı (global / rol / kimliksiz), değişiklik zaman çizelgesi + geri al, "Admin yönetim sayfası" ve "Kullanıcı ekranı yolu (kopyala)".
- **Kaydetme akışı:** Değişiklikler "bekleyen değişiklikler" çubuğunda birikir. "Uygula" denince etki özeti modalı açılır ("3 modül kapanacak · 7 API ucu 403 dönecek · son 7 günde bu modülleri 1.240 kullanıcı kullandı"). `critical` modüllerde anahtar adını yazarak onay istenir.

**Motion / 3D:** 3D gerekmez ve yersiz olur; bu bir operasyon aracı. Ölçülü framer-motion (`m as Motion`) yeterli:
- Anahtar değişince satırda 150 ms renk geçişi; bekleyen değişiklik çubuğu alttan `y` ile kayarak gelir.
- Çekmece için `AnimatePresence` ile x-slide (200 ms).
- KPI sayıları değişince kısa sayaç tween'i.
- Hepsi `useReducedMotion` ile kapatılabilir olmalı; sparkline'lar statik SVG.

**Veri / API değişiklikleri:**
1. `lib/module-controls.ts` kataloğu genişletilmeli: `adminHref`, `previewPath`, `metric` tanımı. `vip_lounge` ve `dealer_shift_pulse` eklenmeli; `experience_pulse_studio` uyuşmazlığı çözülmeli.
2. Yeni üretim scripti `npm run catalog:module-gates`: route dosyalarındaki `assertModuleEnabled` çağrılarını ve metotları tarayıp `lib/data/module-gate-bindings.json` üretmeli. Sidebar `moduleKey` kullanımları da taranıp `enforcement` alanı türetilmeli. CI'da tutarlılık kontrolü olmalı.
3. `GET /api/admin/modules/overview`: global + rol matrisi, SQL `GROUP BY` ile reason kırılımlı 403 sayımı, modül başı son AuditLog kaydı, 7 günlük kullanım serisi. Redis'te 30-60 sn cache, `MODULE_GATE_CACHE_TAG` ile invalidasyon.
4. `PATCH /api/admin/modules/[key]` (tek modül, optimistic UI) + `POST /api/admin/modules/preview-impact` (etki özeti). Mevcut `PUT /api/admin/settings/modules` geriye dönük uyumluluk için korunabilir.
5. `lib/module-gate.ts`: gate'in auth'tan sonra çalışması ya da userId yoksa event yazmaması; Redis sayaç + günlük flush.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/settings?tab=modules`** (app/admin/settings/settings-client.tsx:1819-1910): Aynı katalogun düzenlenebilir hali. **Birleştirilmeli.** Yönetim bu sayfaya taşınmalı, Ayar Merkezi'nde yalnızca bir yönlendirme kartı kalmalı.
- **`/admin/settings?tab=page-settings`** (rol bazlı feature/menu görünürlüğü): Modül etkin durumunun ikinci yarısı. Rol matrisi olarak bu sayfaya dahil edilmeli.
- **`/admin/features`** (FeatureFlag modeli, katalogda `feature_flags`): Kavramsal olarak aynı iş (özellik aç/kapa). Uzun vadede tek "Flags & Modules" düzlemi olmalı: modüller kaba taneli kill-switch, flag'ler ince taneli rollout.
- **`/admin/api-catalog`**: Endpoint listesi örtüşüyor. Endpoint → modül bağı API kataloğuna bir sütun olarak da eklenebilir; ikisi aynı üretim scriptini paylaşmalı.
- **`/admin/compliance`** (app/api/admin/compliance/logs/route.ts:118 `module_gate_blocked` olaylarını listeliyor): Engelleme olaylarının ham günlüğü orada, özeti burada. Çekmecedeki 403 kırılımı compliance log'una filtreli link vermeli.
- **`/admin/ecosystem`** (app/admin/ecosystem/page.tsx:20 hızlı link): Rol dağılımı kartı ecosystem/users tarafına ait; buradan kaldırılmalı.
- **`/admin/modules/ai-tones`**: Kapsam dışı. `/admin/ai-settings` altına taşınmalı.

---

## Doğrulama (şüpheci inceleme)

Yöntem: her iddia çürütülmeye çalışıldı. `lib/module-controls.ts`, `lib/module-gate.ts`, `lib/visibility-controls.ts`, `proxy.ts`, `components/dashboard/sidebar.tsx`, `app/api/admin/modules/overview/route.ts`, `app/api/admin/settings/modules/route.ts`, `app/api/settings/visibility/route.ts` ve `module-gate`/`module-controls` modüllerini içe aktaran 30 dosyanın tamamı okundu. Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Modül kill-switch'lerinin üçte biri etkisiz — **DOĞRULANDI**

- Modül kontrol haritasını okuyan yerlerin tamamı şunlar: `assertModuleEnabled` (lib/module-gate.ts:92-130), `app/(public)/page.tsx:30-32` (yalnızca `landing_pricing`/`landing_marquee`), sidebar filtresi (components/dashboard/sidebar.tsx:450-454) ve görüntüleme amaçlı admin ekranları. `assertModuleEnabled` çağrılarının hiçbiri `feature_flags`, `webhooks`, `api_keys`, `seo_engine`, `experience_pulse_studio`, `fraud_prevention`, `insights_global`, `ab_testing`, `admin_bootstrap`, `audit_logs` veya `observability` anahtarını kullanmıyor (tırnaklı anahtar araması: tüketici yok).
- Admin sidebar'ı modül kontrollerini hiç yüklemiyor: `role === 'ADMIN'` ise fetch erken dönüyor (sidebar.tsx:389), filtre yalnızca `teamOnly` alanına bakıyor (sidebar.tsx:438-439).
- `experiences`, `operations_brief` ve `action_items` bayi/müşteri menüsünden çıkarılmış (sidebar.tsx:230-232, 274-276). `customer_radar` anahtarının menü karşılığı ise `radar` (sidebar.tsx:266). `mk = item.moduleKey ?? item.featureKey ?? item.key` olduğundan bu satır `customer_radar` değerine hiç bakmıyor.
- Sonuç: 42 modülden 15'i (yaklaşık %36) "Kapalı" gösterilebiliyor ama hiçbir API, sayfa veya menü bunu uygulamıyor.
- **Yeniden üretim:** Ayar Merkezi'nde `api_keys` ve `webhooks` kapatılıp kaydedilir. Kayıt başarıyla yazılıyor ve AuditLog'a düşüyor (app/api/admin/settings/modules/route.ts:41-60). `/admin/modules` iki modülü "Kapalı" gösteriyor, ancak `/admin/api-keys`, `/admin/webhooks` ve `lib/webhook-dispatch.ts` hiçbir değişiklik olmadan çalışmaya devam ediyor.
- Not: Pratik zarar "yanlış güven" kaynaklı. Bunlar zaten ADMIN'e özel uçlar, yani yetki açığı yok. Risk, operatörün acil durumda kapattığını sanması.

### 2. `vip_lounge` / `dealer_shift_pulse` hiç kapatılamıyor; `experience_pulse_studio` uyuşmazlığı — **DOĞRULANDI**

- `normalizeModuleControls` yalnızca katalogdaki anahtarları okuyor (lib/module-controls.ts:78-87). PUT da aynı normalize işleminden geçtiği için katalog dışı bir anahtar kaydedilemiyor (app/api/admin/settings/modules/route.ts:35). Bu yüzden `controls['vip_lounge']` ve `controls['dealer_shift_pulse']` her zaman `undefined` dönüyor ve `=== false` kontrolü hiçbir zaman tutmuyor (lib/module-gate.ts:100).
- Rol görünürlüğü de devreye girmiyor: `featureKeysForRole('dealer')` yalnızca `scope: 'dealer'` olan katalog anahtarlarını içeriyor (lib/visibility-controls.ts:111-114, 129-137). Bu yüzden `featureVisibility.dealer['dealer_shift_pulse']` de `undefined` (lib/module-gate.ts:101).
- `vip_lounge` çağrısı rol parametresi olmadan yapılıyor (app/api/customer/lounge/route.ts:16). Katalogda karşılığı olmadığı için scope'tan rol de türemiyor (module-gate.ts:96-98). Sonuç olarak gate kalıcı olarak etkisiz.
- `experience_pulse_studio` anahtarını hiçbir dosya okumuyor. Müşteri tarafındaki gate kaldırılmış (`// Feature removed: customer_pulse_lounge`, app/api/customer/experience-pulse/route.ts:19-21).
- **Yeniden üretim:** Admin "Ritim stüdyosu"nu kapatıp kaydeder. Bir bayi `GET /api/dealer/experience-pulse` çağırır ve 200 alır; içerik servis edilmeye ve `experience_pulse_view` olayı yazılmaya devam eder. `/admin/modules` sayfasının Endpoint tablosunda `vip_lounge` satırı görünüyor (overview/route.ts:71), ama modül listesinde onu kapatacak bir anahtar yok.

### 3. Kimliksiz istekler AnalyticsEvent tablosuna sınırsız yazdırabiliyor — **DOĞRULANDI (ön koşullu; lounge kanıtı geçersiz)**

- `assertModuleEnabled` her engellemede koşulsuz olarak `prisma.analyticsEvent.create` çalıştırıyor (lib/module-gate.ts:103-118).
- Gate, oturum kontrolünden önce çalışıyor: app/api/customer/squads/route.ts:16-18, app/api/referral/route.ts:26-28, app/api/gamification/quests/route.ts:16-18. Ek olarak app/api/gamification/rewards/route.ts:72-74 ve app/api/leaderboard/route.ts:76-78 de aynı sırayı izliyor.
- `proxy.ts:105-119` `/api/*` için yalnızca güvenlik ve CORS başlıkları ekliyor. Burada kimlik veya rate limit kontrolü yok. Platform seviyesinde (Vercel WAF) bir kural olup olmadığı kodla **doğrulanamadı**.
- Ön koşul: ilgili modül global olarak kapalı olmalı. Bu, admin'in normal bir eylemi ve kill-switch'in amacı da tam olarak bu.
- Düzeltme: `app/api/customer/lounge/route.ts` kanıt olarak geçersiz. 2. maddede gösterildiği gibi `vip_lounge` gate'i hiç tetiklenemiyor, dolayısıyla bu uç satır yazdırmaz. Diğer uçlar için iddia geçerli.
- **Yeniden üretim:** Admin `squads` modülünü kapatır. Oturumsuz bir istemci döngüyle `POST /api/customer/squads` gönderir. Her istek 403 döner ve canlı Neon'da `module_gate_blocked` türünde bir satır oluşturur. `/admin/modules` sayfasındaki "24s 403" sayacı anonim trafikle şişer. Ayrıca `take: 2000` kesmesi (overview/route.ts:98) nedeniyle yoğun saldırıda sayaçlar sessizce yanlışlanır. Modüller arası dağılım da bozulur, çünkü son 2000 kaydı saldırılan modül doldurur.

### 4. 28 detay linki admin'i `/admin`'e geri atıyor — **DOĞRULANDI**

- `detailHref` değerlerinden 13'ü `/customer/*` (lib/module-controls.ts:18-30), 15'i `/dealer/*` (lib/module-controls.ts:31-45). `detailHref` taşıyan 39 kaydın 28'i bu iki gruba giriyor (yaklaşık %72).
- `proxy.ts:124` matcher'ı `/customer/:path*` ve `/dealer/:path*` yollarını kapsıyor. `proxy.ts:60-71` bölümünde ADMIN rolü `'CUSTOMER'`/`'DEALER'` ile eşleşmediği için `roleRedirects.ADMIN = '/admin'` adresine yönlendiriliyor.
- **Yeniden üretim:** Admin `/admin/modules` sayfasında "Bağışlar → Detay sayfasını aç" seçeneğine tıklar. `/customer/donations` isteği proxy tarafından `/admin` dashboard'una 307 ile yönlendirilir. Aynı kusur Ayar Merkezi'ndeki "Detay sayfasına git" linklerinde de var (app/admin/settings/settings-client.tsx:1886-1893).
