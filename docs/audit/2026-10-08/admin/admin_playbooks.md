# /admin/playbooks

**Amaç:** Platform operatörüne hazır "büyüme playbook" şablonlarını (segment ipucu, tetikleyiciler, bayi aksiyonları, müşteri fikirleri, izlenecek metrikler) göstermek ve seçilen bir playbook'u tek tıkla belirli bir bayinin hesabına **kampanya taslağı** (isteğe bağlı olarak **global haftalık görev**) olarak uygulamak.

**Genel puan:** 4.2 / 10

**Karar:** **yeniden tasarla.** Fikir değerli ve platformun "içgörüden aksiyona" zincirinde (dealers-health → playbook → bayi kampanyası) doğru yerde duruyor. Ancak bugünkü hâli statik üç kartlık bir okuma sayfası. Tek aksiyonu da (uygula) müşteriye yanlış içerik gönderebilen, "taslak" diye canlı görev açan ve playbook'un segment tanımını yok sayan bir veri akışına bağlı. Sayfa kaldırılmamalı; yeniden tasarlanıp `/admin/dealers-health` ile bağlamlı biçimde birleştirilmeli.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Tek mutasyon olan "uygula" çalışıyor ama "taslak" görevi canlı açıyor, kampanya mesajı müşteriye dahili talimat sızdırıyor ve hedef segment playbook tanımıyla çelişiyor. |
| UX | 4/10 | Okunabilir kartlar var ama dialog hangi playbook'un uygulandığını, neyin oluşturulacağını (önizleme) ve sonucu (bağlantı/geçmiş) göstermiyor; bayi seçimi aramasız ve 60 kayıtla sınırlı. |
| Görsel | 6/10 | Ortak `AdminPremiumHero` ve kart dili tutarlı. Ancak tüm kartlar aynı ağırlıkta, hiyerarşi ve durum (kaç bayiye uygulandı, etki) yok. |
| Mimari | 3/10 | İçerik `lib/growth-playbooks.ts` içinde sabit kodlu. Playbook kimlikleri ve başlıkları `morning-briefing` içinde ayrıca kopyalanmış. Uygulama yolu görev modül kapısını, doğrulamayı ve audit log'u atlıyor. |
| Performans | 7/10 | Hafif sayfa: iki fetch, statik veri. Tek israf, açılır liste için ağır `/api/admin/users` yanıtının (adres, `_count` vb.) çekilmesi. |
| Erişilebilirlik + mobil | 5/10 | Grid mobilde tek sütuna iniyor ve dialog dar ekrana uyuyor. Ancak `Label` Select'e bağlı değil, yükleme/hata durumları ekran okuyucuya duyurulmuyor, sayfa i18n dışı. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişim kontrolü (ADMIN rolü + admin gate cookie) | ÇALIŞIYOR | `proxy.ts:51`, `proxy.ts:79-84` | Layout'ta ayrıca kontrol yok (`app/admin/layout.tsx:23-47`), proxy yeterli. |
| 2 | API yetkisi: GET listesi | ÇALIŞIYOR | `app/api/admin/playbooks/route.ts:10-11` | `requireAuth(['ADMIN'])` |
| 3 | API yetkisi: POST apply | ÇALIŞIYOR | `app/api/admin/playbooks/apply/route.ts:22-23` | IDOR yok: bayi `role: 'DEALER'` ile doğrulanıyor (`:36-39`). |
| 4 | Hero (eyebrow, başlık, açıklama, ikon) | ÇALIŞIYOR | `page.tsx:90-94` | Azaltılmış hareket hero içinde ele alınıyor (`components/admin/admin-premium-hero.tsx:9,35`). |
| 5 | "Segmentler" kısayol linki | ÇALIŞIYOR | `page.tsx:97-102` | Bağlam taşımıyor (hangi playbook/segment). |
| 6 | "A/B testleri" kısayol linki | ÇALIŞIYOR | `page.tsx:103-108` | Bağlam taşımıyor. |
| 7 | "Görevler" kısayol linki | ÇALIŞIYOR | `page.tsx:109-114` | Bağlam taşımıyor. |
| 8 | Playbook listesini yükleme | KISMİ | `page.tsx:48-62` | `catch` yok. Ağ hatası veya JSON parse hatası işlenmemiş reddedilmeye (unhandled rejection) dönüşür, liste sessizce boş kalır. |
| 9 | Yükleniyor durumu | KISMİ | `page.tsx:119-120` | Düz "Yükleniyor…" metni. Skeleton ve `aria-live` yok. |
| 10 | Boş liste durumu | EKSİK | `page.tsx:121-182` | `list.length === 0` için mesaj yok, boş grid görünür. |
| 11 | Hata durumu + tekrar dene | EKSİK | `page.tsx:51-57` | `data.success` false ise kullanıcıya hiçbir şey söylenmez. |
| 12 | Kart başlığı | ÇALIŞIYOR | `page.tsx:127` | |
| 13 | Playbook id rozeti | ÇALIŞIYOR | `page.tsx:128-130` | Operatöre `low_nps_churn` gibi teknik anahtar gösteriliyor, düşük değerli. |
| 14 | Özet | ÇALIŞIYOR | `page.tsx:132` | |
| 15 | "Segment ipucu" | KISMİ | `page.tsx:136-137`, `lib/growth-playbooks.ts:22` | Sözde kod metni (`rating <= 2 veya sentiment negative; churnRisk > 0.5`). Hiçbir segment motoruna bağlı değil ve kampanyanın gerçek hedeflemesinde kullanılmıyor (bkz. Bulgu 3). |
| 16 | Tetikleyiciler listesi | KISMİ | `page.tsx:140-145` | Statik metin. Tetikleyicinin şu an kaç bayide aktif olduğu gösterilmiyor. |
| 17 | Bayi aksiyonları listesi | ÇALIŞIYOR | `page.tsx:148-153` | Statik içerik. |
| 18 | Müşteri deneyimi fikirleri | ÇALIŞIYOR | `page.tsx:156-161` | Statik içerik. |
| 19 | İzlenecek metrikler | SAHTE | `page.tsx:164-165`, `lib/growth-playbooks.ts:33` | Yalnızca metrik adları (`dealerRepliedAt SLA`, `remedy acceptance`), değer yok. Ham alan adları ve İngilizce terimler Türkçe arayüze karışıyor. |
| 20 | "Bayiye taslak oluştur" butonu | ÇALIŞIYOR | `page.tsx:167-178` | Dialog'u açar. |
| 21 | Dialog başlığı / bağlam | KISMİ | `page.tsx:187-189` | Hangi playbook'un uygulandığını göstermiyor (sadece "Playbook → kampanya taslağı"). |
| 22 | Bayi seçici (Select) | KISMİ | `page.tsx:64-86`, `page.tsx:193-204` | En yeni 60 bayi (`pageSize=60`, üst sınır 100: `lib/validations-admin.ts:10`). Arama yok, hata sessizce yutuluyor (`:79-81`), boş liste için mesaj yok. |
| 23 | "Global haftalık görev taslağı da oluştur" checkbox | BOZUK | `page.tsx:206-214`, `lib/growth-playbooks.ts:110` | "Taslak" denmesine rağmen görev `isActive: true` olarak, yani tüm müşterilere anında canlı açılıyor (Bulgu 1). |
| 24 | Vazgeç | ÇALIŞIYOR | `page.tsx:217-219` | |
| 25 | Oluştur (submit) | KISMİ | `page.tsx:220-250` | Çift tıklamaya karşı `applying` ile korunuyor. Ancak idempotent değil: art arda uygulamada kopya kampanya ve görev oluşuyor. |
| 26 | Kampanya taslağı üretimi (API) | KISMİ | `apply/route.ts:49-62`, `lib/growth-playbooks.ts:94-101` | Kayıt doğru oluşuyor. İçerik müşteriye gönderilmeye uygun değil ve segment eşlemesi yanlış (Bulgu 2, 3). |
| 27 | Global görev üretimi (API) | BOZUK | `apply/route.ts:64-77` | Canlı açılıyor, ilerleyemiyor, modül kapısını ve audit log'u atlıyor (Bulgu 1, 4, 5). |
| 28 | Başarı toast'ı | ÇALIŞIYOR | `page.tsx:238-240` | Ham kampanya ID'si gösteriliyor, tıklanabilir bağlantı yok. Önek "Basarili:" Türkçe karakter içermiyor (`lib/admin-toast.ts:17`). |
| 29 | Hata toast'ı | KISMİ | `page.tsx:237`, `apply/route.ts:28` | 400 yanıtında `error` bir nesne (`flatten()`), istemci `new Error(obj)` ile "[object Object]" gösterir. |
| 30 | Dialog state sıfırlama | EKSİK | `page.tsx:42-46`, `page.tsx:171-174` | Önceki bayi ve checkbox seçimi sonraki playbook'a taşınıyor. Görev oluşturma tiki unutulursa yeniden canlı görev açılır. |
| 31 | Uygulama önizlemesi (oluşacak kampanya ve görev metni) | EKSİK | `apply/route.ts:86` | API `drafts` döndürüyor ama UI kullanmıyor. Ön gösterim (dry-run) ucu da yok. |
| 32 | Audit log | EKSİK | `apply/route.ts:20-98` | Başka bayinin hesabına kayıt açan ve global görev oluşturan admin mutasyonu iz bırakmıyor. |
| 33 | Bayiye bildirim | EKSİK | `apply/route.ts:49-62` | Bayi, panelinde yeni bir taslak oluştuğundan haberdar edilmiyor. |
| 34 | Uygulama geçmişi / benimseme ölçümü | EKSİK | `prisma/schema.prisma:2651` | `Campaign.playbookSourceId` var ama hiçbir yerde toplanıp raporlanmıyor (yalnızca bayi rozetinde: `app/dealer/campaigns/page.tsx:187`). |
| 35 | Playbook CRUD / sürümleme | EKSİK | `lib/growth-playbooks.ts:1-4` | Statik dizi, değişiklik için deploy gerekiyor. Dosyadaki yorum da bunu itiraf ediyor. |
| 36 | Arama / filtre / kategori | EKSİK | `page.tsx:122-182` | Bugün 3 kayıt için gerekmiyor, kütüphane büyüyünce gerekecek. |
| 37 | GET `?id=` ucu | ÖLÜ KOD | `app/api/admin/playbooks/route.ts:13-19` | Sayfa bu ucu kullanmıyor. |
| 38 | dealers-health → playbooks bağlamlı geçiş | KISMİ | `app/admin/dealers-health/page.tsx:91-96` | Link `dealerId` taşımıyor, admin bayiyi yeniden ve 60 kişilik listede aramak zorunda. |
| 39 | Haftalık özet ve sabah brifingiyle ortak kaynak | KISMİ | `lib/weekly-digest-core.ts:11,58-69`, `app/api/dealer/morning-briefing/route.ts:107-121` | Haftalık özet `GROWTH_PLAYBOOKS` kullanıyor, sabah brifingi ise id ve başlıkları sabit kodla kopyalıyor ("Düşük NPS + telafi playbook" ≠ "Düşük NPS + churn sinyali"). |
| 40 | i18n | EKSİK | `page.tsx:91-249`, `messages/en.json:2490` | Sidebar etiketi çevrilmiş ama sayfa metinleri sabit Türkçe. Diğer admin sayfalarıyla aynı borç. |
| 41 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:122` (`md:grid-cols-2`), `page.tsx:186` | Hero chip'leri `flex-wrap`. Dialog `max-w-md`. |
| 42 | Klavye / form erişilebilirliği | KISMİ | `page.tsx:192-194`, `page.tsx:206-212` | `Label` `htmlFor` ile Select'e bağlı değil. Yerel checkbox sarmalayan label ile erişilebilir. |

**Durum sayımı (42 özellik):** ÇALIŞIYOR 16 · KISMİ 13 · BOZUK 2 · SAHTE 1 · EKSİK 10 (ölü kod #37, KISMİ'ye sayıldı)

---

## Bulgular

### 1. Kritik / Veri bütünlüğü ve ekonomi: "Görev taslağı" aslında tüm müşterilere canlı açılan, tamamlanamayan global görev

- **Kanıt:** `page.tsx:213` ("Global haftalık görev **taslağı** da oluştur") ↔ `lib/growth-playbooks.ts:110` (`isActive: true`), `apply/route.ts:65-75` (`expiresAt` yok). Müşteri tarafında `app/api/customer/weekly-card/route.ts:19-22,50` aktif görevleri `createdAt desc` ile alıp tamamlanmamış ilk 3'ü gösteriyor. `app/api/gamification/quests/route.ts:28-30` de tüm aktif görevleri listeliyor ve `userId` olmadan da yanıt veriyor.
- **Sorun:**
  1. Admin "taslak" sandığı bir görevi, aslında tüm müşterilerin haftalık görev kartının **en üstüne** canlı olarak yerleştiriyor. Görev adı müşteriye "Playbook: Düşük NPS + churn sinyali" olarak görünüyor ve dahili segment dilini kullanıcıya sızdırıyor.
  2. `requirement: { type: 'give_feedback', count: 3 }`. Kod tabanında `give_feedback` türüne göre `UserQuest.progress` artıran bir yol bulunamadı. Mevcut ilerleme yolları sabit görev id'leriyle `advanceAchievementProgress` (`app/api/customer/shop/route.ts:134` vb.) ve yalnızca `visit_category` türü (`lib/visit-missions.ts:22-29`). Bu nedenle görev **tamamlanamaz** (statik analizle; çalışma zamanında doğrulanmadı). Kartta kalıcı olarak bir slotu işgal eder, çünkü `expiresAt` yok ve "haftalık" sözü (`type: 'weekly'`) hiçbir sıfırlama mekanizmasına bağlı değil.
  3. Görev her bayi uygulamasında yeniden oluşuyor. 5 bayiye uygulanırsa 5 özdeş global görev açılır ve kartın üç slotunun tamamı dolar.
  4. Ödül (120 puan / 60 XP) `points-matrix` yerine sabit kodlu (`lib/growth-playbooks.ts:109`). İleride ilerleme bağlanırsa puan basan bir yol, ekonomi ayarlarının dışında kalır.
- **Profesyonel öneri:** Görevi "taslak" kavramıyla gerçekten uyumlu hâle getirin:
  - (a) `Quest` modeline `status: 'draft' | 'active' | 'archived'` alanı (veya `isActive: false` + `sourcePlaybookId`) ekleyin. Playbook'tan doğan görevler her zaman pasif doğsun ve `/admin/quests` içinde "Playbook'tan gelen taslaklar" filtresiyle onaylanıp yayınlansın.
  - (b) Görev global olmamalı. Playbook bir **bayi** için uygulanıyor, bu yüzden görev bayiye kapsamlanmalı (`dealerId` alanı veya mevcut bayi görev altyapısı). Global görev açmak ayrı ve bilinçli bir admin aksiyonu olmalı.
  - (c) `requirement.type` yalnızca ilerletici bir handler'ı olan türlerden seçilebilsin. Bunun için merkezi bir `QUEST_REQUIREMENT_TYPES` kayıt defteri (tür → ilerleme kaynağı) oluşturun. `give_feedback` için feedback POST akışına (`app/api/feedbacks/route.ts`) idempotent ilerleme bağlantısı yazılmadıkça bu tür önerilmesin.
  - (d) Ödülü `getPointsMatrix().quest.default` üzerinden alın.
  - (e) `expiresAt = hafta sonu` atayın.
- **Efor:** M

### 2. Yüksek / Veri / içerik: Kampanya taslağı, bayiye yönelik iç talimatları ve playbook kimliğini müşteri bildirimine taşıyor; bayi bunu düzenleyemiyor

- **Kanıt:** `lib/growth-playbooks.ts:95-96`: başlık `${pb.title} — ${label}` → "Düşük NPS + churn sinyali — X Kafe". Mesaj `summary` + `dealerActions` ("24 saat içinde düşük puanlı geri bildirimlere kişisel yanıt", "Telafi onay kuyruğundan standart şablonları yayınla") + `Playbook: low_nps_churn`. Gönderimde başlık ve mesaj olduğu gibi müşteriye Notification ve push olarak gidiyor: `app/api/dealer/campaigns/[id]/send/route.ts:106-124`. Bayi kampanya sayfasında düzenleme arayüzü yok: `Edit` ikonu import edilmiş ama kullanılmıyor (`app/dealer/campaigns/page.tsx:9`), tek aksiyon "Gönder" (`:99`, `:218`). PATCH ucu var ama UI'dan çağrılmıyor (`app/api/dealer/campaigns/[id]/route.ts:10`).
- **Sorun:** Bayi taslağı tek tıkla gönderirse, risk segmentindeki müşterilere başlığı "Düşük NPS + churn sinyali" olan ve işletmeye yazılmış iç operasyon maddelerini içeren bir push gider. Bu marka itibarı açısından ciddi bir hata: müşteriye "kaybetme riskindesiniz" demek anlamına geliyor. Ek olarak `join('\n• ')` ilk maddeye madde işareti koymuyor (biçim hatası).
- **Profesyonel öneri:** Playbook şemasını **iki kitleli** yapın: `dealerBrief` (bayiye iç rehber) ve `customerMessageTemplate` (müşteriye giden, `{{isim}}`/`{{isletme}}` değişkenli, tonu onaylı metin). Taslak başlığı da müşteri dilinden üretilsin ("Sizi özledik — X Kafe'den küçük bir sürpriz"). Bayi kampanya sayfasına taslak düzenleme dialog'u ekleyin (PATCH ucu hazır). Playbook kaynaklı taslaklarda "gönder" öncesi zorunlu önizleme ve onay adımı olsun. `Playbook: <id>` izini metinde değil yalnızca `playbookSourceId` alanında tutun.
- **Efor:** M

### 3. Yüksek / Doğruluk: Playbook'un segment tanımı yok sayılıyor; "sessiz memnunlar" ve "ilk 7 gün drop-off" tam tersi kitleye gidiyor

- **Kanıt:** `lib/growth-playbooks.ts:97-98`: id → `targetSegment` sabit eşleme (`silent_happy` → `loyal`, `first_week_dropoff` → `active`). Gönderimde `loyal` ve `active` aynı `else` dalına düşüyor ve **≥3 geri bildirimi olan** müşterileri seçiyor (`app/api/dealer/campaigns/[id]/send/route.ts:71-82`). Oysa `silent_happy`'nin tanımı "yüksek consumption, düşük feedback count" (`lib/growth-playbooks.ts:54`), `first_week_dropoff`'unki "kayıt sonrası 7 gün" (`:39`).
- **Sorun:** Geri bildirim yazmayanları hedefleyen playbook, en çok geri bildirim yazanlara gidiyor. Yeni müşterileri hedefleyen playbook da eski ve aktif müşterilere gidiyor. Sayfadaki "Segment ipucu" (`page.tsx:136-137`) operatöre bir hedefleme vaat ediyor ama bu bilgi hiçbir yerde uygulanmıyor. Ayrıca id'ye göre `if` zinciri, yeni bir playbook eklendiğinde sessizce `all` segmentine düşer.
- **Profesyonel öneri:** Segment tanımını sözde koddan **çalıştırılabilir bir tanıma** çevirin. `GrowthPlaybook.segment: SegmentRule` alanı ekleyin (ör. `{ kind: 'silent_happy', minConsumptions30d: 3, maxFeedbacks30d: 0 }`). `Campaign.targetSegment` bu kuralın kimliğini taşısın. Gönderim tarafında segment çözümlemeyi `lib/campaign-segments.ts` gibi tek bir çözücüye taşıyın: her segment için açık bir dal olsun, bilinmeyen değerde hata versin. Uygulama dialog'unda "Bu bayide bu segmentte şu an N müşteri var" ön sayımı gösterin, sıfırsa uyarın.
- **Efor:** M–L

### 4. Yüksek / Güvenlik ve uyum: Uygulama yolu audit log'u ve görev modül kapısını atlıyor

- **Kanıt:** `apply/route.ts:20-98` içinde `auditLog` yazımı yok. Normal görev oluşturma yolu `assertModuleEnabled('quests')` (`app/api/gamification/quests/route.ts:109-110`), `createQuestSchema` doğrulaması (`:120`) ve `CREATE_QUEST` audit kaydı (`:136-145`) yapıyor. Playbook yolu bu üçünü de atlıyor (`apply/route.ts:64-77`).
- **Sorun:** Bir admin, bayinin hesabına kayıt açıyor ve tüm müşterilere görünen global görev yaratıyor, ama "kim, ne zaman, hangi bayi" izi yok. Görev modülü kapalıyken bile görev oluşabiliyor. Projenin ekonomi kuralı (puan basan her yol görünür ve denetlenebilir olmalı) burada ihlal ediliyor.
- **Profesyonel öneri:** Görev ve kampanya oluşturmayı paylaşılan servis fonksiyonlarına çıkarın (`createQuest(input, actor)`, `createCampaignDraft(input, actor)`). Bu fonksiyonlar doğrulama, modül kapısı ve audit log'u tek noktada uygulasın. Playbook uygulaması bunları `prisma.$transaction` içinde çağırsın ve tek bir `APPLY_PLAYBOOK` audit kaydına (`playbookId`, `dealerId`, `campaignId`, `questId`) bağlasın.
- **Efor:** S–M

### 5. Orta / Doğruluk: İdempotensi yok, dialog state'i sızıyor, kampanya ile görev atomik değil

- **Kanıt:** `page.tsx:171-174` dialog açılırken yalnızca `applyPbId` set ediliyor. `dealerId` ve `createQuest` önceki uygulamadan kalıyor (`:44-45`). `apply/route.ts:49-77` iki ayrı `create` çağrısı yapıyor, transaction yok.
- **Sorun:** Admin bir önceki uygulamada görev tikini açık bıraktıysa, sonraki playbook'ta fark etmeden yeni bir canlı global görev açar (Bulgu 1 ile birleşince ağırlaşır). Aynı playbook aynı bayiye tekrar uygulanabiliyor ve uyarı yok. Görev oluşturma kampanyadan sonra hata verirse yarım durum kalır ve istemci "Hata" gösterir, oysa kampanya oluşmuştur.
- **Profesyonel öneri:** Dialog her açılışta state'i sıfırlasın (`onOpenChange` içinde reset; görev tiki varsayılan kapalı). Sunucuda `(dealerId, playbookSourceId, status='draft')` için açık bir taslak varsa 409 ve "mevcut taslağa git" bağlantısı dönün, ya da `Idempotency-Key` başlığını mevcut `checkIdempotency` yardımcısıyla kullanın (bu yardımcı `quests/[id]/claim/route.ts:23` içinde zaten var). İki `create` işlemini `$transaction` içine alın.
- **Efor:** S

### 6. Orta / Hata yönetimi: Sessiz hatalar ve "[object Object]" toast'ı

- **Kanıt:** Liste fetch'inde `catch` yok (`page.tsx:51-57`). Bayi listesi hatası yutuluyor (`:79-81`). 400 yanıtında `error: parsed.error.flatten()` nesne dönüyor (`apply/route.ts:28`) ve istemci `new Error(j.error || …)` yapıyor (`page.tsx:237`).
- **Sorun:** Ağ veya yetki hatasında admin boş bir sayfa ya da boş bir bayi listesi görür ve nedenini bilmez. Doğrulama hatasında "Dikkat: [object Object]" görünür.
- **Profesyonel öneri:** Sayfayı projede zaten kullanılan `@tanstack/react-query`'ye taşıyın (örnek: `app/admin/segments/page.tsx:4`). `isError` için hata kartı ve "Tekrar dene" butonu ekleyin, boş durum için kılavuz metin gösterin. API hata sözleşmesini tekilleştirin: `{ error: string, details?: object }`.
- **Efor:** S

### 7. Orta / UX: Bayi seçimi ölçeklenmiyor, bağlam aktarılmıyor

- **Kanıt:** `page.tsx:68` (`role=DEALER&pageSize=60`, sıralama `createdAt desc`: `app/api/admin/users/route.ts:168`). Arama yok (`page.tsx:193-204`). `app/admin/dealers-health/page.tsx:92` linki `dealerId` taşımıyor.
- **Sorun:** 60'tan fazla bayi olduğunda eski bayiler seçilemez. Sağlık skoru düşük bir bayiden "Playbook"a tıklayan admin o bayiyi listede yeniden arar ve bulamayabilir. Ayrıca açılır liste için adres, konum, `_count` gibi alanlar içeren ağır bir uç çekiliyor (`app/api/admin/users/route.ts:163-197`).
- **Profesyonel öneri:** `search` parametresini kullanan debounce'lu bir Combobox (shadcn `Command` + `Popover`) ile hafif bir `/api/admin/dealers/options?q=` ucu (id, businessName, sağlık skoru) kullanın. `?dealerId=` parametresini okuyup dialog'u o bayi seçili açın ve dealers-health linkini bu parametreyle güncelleyin. Combobox'ta bayinin sağlık skorunu ve önerilen playbook'u rozet olarak gösterin.
- **Efor:** S–M

### 8. Orta / Mimari: Playbook içeriği sabit kodlu ve iki yerde kopyalanmış

- **Kanıt:** `lib/growth-playbooks.ts:17-65` (statik dizi; yorum: "İleride DB'ye taşınabilir", `:3`). `app/api/dealer/morning-briefing/route.ts:107-121` id ve başlıkları sabit kodla yeniden yazıyor ve başlıklar farklı. `lib/growth-playbooks.ts:97-98,108` davranış id'ye göre `if` zinciriyle belirleniyor.
- **Sorun:** Operatör yeni bir playbook ekleyemiyor, metni düzeltemiyor, versiyonlayamıyor, kapatamıyor. Her değişiklik deploy gerektiriyor. Bayi brifingindeki başlık admin kütüphanesindekiyle tutarsız.
- **Profesyonel öneri:** `GrowthPlaybook` Prisma modeli oluşturun (`slug`, `title`, `summary`, `segmentRule Json`, `triggers Json`, `dealerBrief Json`, `customerMessageTemplate`, `questTemplate Json?`, `status`, `version`, `updatedById`). Statik dizi seed ve build-time fallback olarak kalsın (projenin build-time DB fail-safe kuralı gereği try/catch + varsayılan). `morning-briefing` ve `weekly-digest-core` aynı servis üzerinden `getPlaybook(slug)` çağırsın. Davranış (segment, görev şablonu) id'ye göre değil kayıt alanlarından okunsun.
- **Efor:** L

### 9. Düşük / UX ve dil: Ham alan adları, teknik id'ler ve TR/EN karışımı

- **Kanıt:** `lib/growth-playbooks.ts:33,48,63` ("dealerRepliedAt SLA", "remedy acceptance", "D1/D7 retention"). `page.tsx:128-130` (id rozeti). `page.tsx:136-137` (sözde kod). `lib/admin-toast.ts:17` ("Basarili:", Türkçe karakter yok). Sayfa i18n dışı (`page.tsx:91-249`).
- **Sorun:** Operatöre veritabanı alan adları ve İngilizce ürün terimleri gösteriliyor. Bu, metrikleri canlı veri sanmaya ya da anlamamaya yol açıyor.
- **Profesyonel öneri:** Metrik tanımlarını bir kayıt defterinden okuyun (`metricKey` → Türkçe etiket + gerçek değer kaynağı) ve kartta "bu playbook'u uygulayan bayilerde son 30 gün" değerlerini gösterin. Teknik id'yi yalnızca kopyalanabilir ikincil meta olarak tutun. Toast önekini düzeltin. Sayfa metinlerini `messages/*.json`'a taşıyın.
- **Efor:** S (metin) / M (canlı metrikler)

### 10. Düşük / Erişilebilirlik

- **Kanıt:** `page.tsx:192-194` (`<Label>` ile `SelectTrigger` arasında `htmlFor`/`id` bağı yok). `page.tsx:119-120` (yükleme durumunda `aria-busy`/`aria-live` yok). Kartlar tamamen metin. Uygulama aksiyonu her kartta kartın en altında.
- **Sorun:** Ekran okuyucu Select'i "Bayi" olarak duyurmayabilir. Yükleme ve sonuç durumları duyurulmuyor.
- **Profesyonel öneri:** `id`/`htmlFor` bağlayın. Liste kapsayıcısına `aria-busy={loading}`, hata ve boş durumlar için `role="status"` ekleyin. Toast'a ek olarak dialog içinde başarı özeti ve odak yönetimi sağlayın.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

Kıyas: Stripe Radar/Workflows, Linear Templates, PostHog Cohorts + Actions, Retool workflow'ları.

1. **Önizleme ve dry-run:** Uygulamadan önce "oluşacak kampanya metni, hedef segmentteki müşteri sayısı, görev tanımı" kartı (PostHog cohort önizlemesi, Stripe "test mode" muadili). API zaten `drafts` döndürüyor (`apply/route.ts:86`); bir `?dryRun=1` modu yeterli.
2. **Uygulama geçmişi ve etki ölçümü:** Playbook başına "kaç bayiye uygulandı, kaçı gönderildi, gönderim sonrası 7 günlük tekrar ziyaret ve NPS değişimi". `Campaign.playbookSourceId` + `sentAt` + mevcut kampanya performans ucu (`app/api/dealer/campaigns/[id]/performance`) ile hesaplanabilir.
3. **Toplu ve önerilen uygulama:** dealers-health'te sağlık skoru eşiğin altındaki bayiler için "önerilen playbook" + çoklu seçim + toplu taslak (Linear bulk actions). Altyapı hazır: `churn-playbook` cron'u zaten riskli bayi listesi üretiyor (`app/api/internal/inngest/churn-playbook/route.ts:17-18`).
4. **Playbook yönetimi (CRUD, sürüm, durum):** Taslak, yayında ve arşiv durumları; sürüm geçmişi; "kim değiştirdi" bilgisi (Retool/Linear template yönetimi).
5. **Otomasyon kuralı:** "Tetikleyici gerçekleşince bayiye otomatik taslak oluştur + bildir". Tetikleyiciler bugün yalnızca metin. Mevcut Inngest altyapısına (`lib/inngest/functions.ts:70`) bağlanabilir.
6. **Bayiye bildirim ve onay döngüsü:** Taslak oluşunca bayiye in-app ve push bildirimi, bayinin taslağı düzenleme, kabul veya reddetme akışı ve admin tarafında durum görünürlüğü.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Playbook kütüphanesi" bir okuma sayfası olmaktan çıkıp **bir oyun kitabı operasyon merkezine** dönüşmeli. Operatör üç soruya tek ekranda cevap alabilmeli: *Hangi bayide hangi sorun var? Hangi playbook ona uyar? Uyguladığımız playbook'lar işe yarıyor mu?*

**Yerleşim:**

1. **Üst şerit (KPI):** Aktif playbook sayısı · son 30 günde uygulanan taslak · gönderilen kampanya oranı (taslak → gönderim) · uygulayan bayilerde ortalama 7 günlük tekrar ziyaret farkı. Stripe Dashboard tarzı sade sayaçlar.
2. **Sol sütun: Kütüphane listesi.** Kompakt satırlar: başlık, kategori (retention/onboarding/NPS), "şu an eşleşen bayi sayısı" rozeti, son güncelleme. Arama ve kategori filtresi.
3. **Sağ panel: Playbook detayı (sekmeli).**
   - *Genel:* özet, tetikleyiciler (her birinin yanında canlı eşleşme sayısı), bayi rehberi.
   - *Müşteri mesajı:* değişkenli şablon + canlı önizleme (bildirim kartı ve push görünümü).
   - *Görev şablonu (opsiyonel):* yalnızca ilerletilebilir requirement türlerinden seçim; ödül points-matrix'ten.
   - *Etki:* uygulanan bayiler tablosu (durum: taslak / gönderildi / reddedildi) ve önce-sonra metrik grafiği.
4. **Uygula akışı (sağdan açılan Sheet, üç adım):**
   1. Bayi seç: arama, çoklu seçim, sağlık skoru ve önerilen etiketi; `?dealerId=` ile önceden dolu gelir.
   2. Önizle: segment müşteri sayısı, mesaj, görev (pasif taslak olarak).
   3. Onayla: sonuçta oluşan kayıtlara bağlantılar ve audit kimliği.

**Motion / 3D:** Bu bir operasyon aracı; 3D yersiz. Ölçülü motion yeterli:
- Liste ve detay geçişinde `m as Motion` ile 150–200 ms opaklık ve kayma; uygula Sheet'inde adım geçişi.
- KPI sayaçlarında tek seferlik sayı animasyonu.
- Tümü `useReducedMotion` ile kapatılabilir olmalı. Hero zaten azaltılmış hareketi destekliyor (`admin-premium-hero.tsx:35`).
- Kart hover'larında gölge dışında efekt eklenmemeli.

**Veri / API değişiklikleri:**

- `GrowthPlaybook` modeli + seed (statik dizi build-time fallback olarak kalır).
- `GET /api/admin/playbooks` → `{ playbooks, stats: { appliedCount, sentCount, matchingDealers } }`. `stats`, `Campaign` üzerinde `groupBy(playbookSourceId, status)` ile tek sorguda hesaplanır. Kısa TTL'li Redis cache kullanılabilir.
- `POST /api/admin/playbooks/apply`: `dealerIds[]`, `dryRun`, `Idempotency-Key`. `$transaction`. Görev `status: 'draft'` ve bayi kapsamlı. Tek `APPLY_PLAYBOOK` audit kaydı. Bayiye `Notification`.
- `GET /api/admin/dealers/options?q=` hafif uç.
- Segment çözümleme tek modüle (`lib/campaign-segments.ts`) taşınır. Hem gönderim hem önizleme sayımı aynı fonksiyonu kullanır.
- `morning-briefing` ve `weekly-digest-core` playbook'lara aynı servisten erişir.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/dealers-health`:** En güçlü bağ. Orada her bayi kartında "Playbook" linki var (`app/admin/dealers-health/page.tsx:91-96`) ama bağlam kayboluyor. Öneri: playbook uygulama Sheet'i paylaşılan bir bileşen olsun (`components/admin/playbook-apply-sheet.tsx`) ve dealers-health'ten `dealerId` ile doğrudan açılsın. Kütüphane sayfası yönetim ve etki ölçümü için ayrı kalabilir.
- **`/admin/segments`:** Segment ipuçları burada metin olarak duruyor, segments sayfası ise sabit segmentleri gösteriyor. Segment kuralları tek kaynakta tanımlanırsa playbook yalnızca bir segment kuralına referans verir. Ayrı bir birleştirme gerekmez, ama veri modeli ortaklaşmalı.
- **`/admin/quests`:** Playbook'tan doğan görevler, oradaki onay kuyruğuna "taslak" olarak düşmeli. Global görev oluşturma yetkisi yalnızca `/admin/quests` üzerinden ve aynı doğrulama ve audit yolundan kullanılmalı.
- **`/admin/innovation/segment-proposals`** ve **`/admin/ab-testing`:** İçerik çakışması yok (doğrulanmadı: bu sayfalar ayrıntılı okunmadı). Playbook'un "deney" ayağı ileride A/B testine bağlanabilir (aynı playbook'un iki mesaj varyantı).
- **Sonuç:** Kaldırılmamalı. Yeniden tasarlanıp dealers-health ile **bağlamlı entegrasyon** (paylaşılan uygula bileşeni) kurulmalı.

---

## Doğrulama (şüpheci inceleme)

Her iddia çağıran/çağrılan kod okunarak çürütülmeye çalışıldı. Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Playbook uygulaması "taslak" diye tüm müşterilere canlı global görev açıyor — **DOĞRULANDI**

- Arayüz metni "Global haftalık görev taslağı da oluştur" (`app/admin/playbooks/page.tsx:213`), ama üretilen görev `isActive: true` (`lib/growth-playbooks.ts:110`), `expiresAt` verilmeden ve bayiye bağlanmadan (Quest modelinde bayi alanı yok, `prisma/schema.prisma:645-661`) `prisma.quest.create` ile yazılıyor (`app/api/admin/playbooks/apply/route.ts:64-77`). "Taslak" durumu yok.
- `GET /api/customer/weekly-card` `isActive: true` görevleri `createdAt desc` sırasıyla alıp tamamlanmamış ilk 3'ünü döndürüyor (`app/api/customer/weekly-card/route.ts:19-22,51`). Müşteri panosu bunu render ediyor (`components/customer/dashboard/customer-dashboard.tsx:197-200,649-651`). En yeni görev olduğu için "Playbook: Düşük NPS + churn sinyali" adı her müşterinin haftalık kartında en üstte çıkıyor.
- Tamamlanamazlık doğrulandı: `UserQuest` ilerlemesini yazan yollar yalnızca `lib/achievements.ts:75` (sabit ID'li 4 başarım) ve `lib/visit-missions.ts:47` (`requirement.type === 'visit_category'`). `give_feedback` için ilerleme artıran kod yok. Claim ucu, `UserQuest` kaydı olmadığı için `QUEST_PROGRESS_NOT_FOUND` döndürüyor (`app/api/gamification/quests/[id]/claim/route.ts:61-69`). Sonuç: görev hiç bitmiyor ve haftalık karttaki 3 slottan birini kalıcı olarak işgal ediyor. Seed ve bootstrap'taki `give_feedback` görevleri de aynı ölü tipi kullanıyor (`app/api/admin/bootstrap/route.ts:78-94`). Bu, playbook'a özgü olmayan, sistem genelinde bir sorun.
- Tekrarlanan uygulama: idempotency veya tekillik kontrolü yok, her uygulamada yeni bir Quest satırı oluşuyor.
- "points-matrix dışında 120 puan" kısmı zayıf: `getQuestReward` (`lib/points-rules.ts:301-314`) görevde açıkça yazılan puanı kullanıyor. Bu davranış admin'in elle oluşturduğu görevlerle aynı. Görev zaten tamamlanamadığı için puan basılmıyor, dolayısıyla ekonomi riski şu an yok.
- **Yeniden üretim:** Admin `/admin/playbooks` → "Bayiye taslak oluştur" → kutuyu işaretle → Oluştur. Herhangi bir müşteri hesabıyla panoyu açınca haftalık kartın en üstünde "Playbook: …" görevi 0/3 olarak görünür. Geri bildirim verildikçe ilerleme artmaz.

### 2. Kampanya taslağı müşteri bildirimine dahili bayi talimatlarını ve "churn" başlığını taşıyor — **DOĞRULANDI**

- Başlık `${pb.title} — ${label}`, mesaj ise `summary + dealerActions[0..1] + "Playbook: <id>"` (`lib/growth-playbooks.ts:95-96`). `low_nps_churn` için müşteriye giden metin şöyle: "Düşük NPS + churn sinyali — <İşletme>" / "…telafi + iletişim önceliği. 24 saat içinde düşük puanlı geri bildirimlere kişisel yanıt • Telafi onay kuyruğundan standart şablonları yayınla … Playbook: low_nps_churn".
- Gönderimde `campaign.title` ve `campaign.message` hiç dönüştürülmeden `Notification` (`app/api/dealer/campaigns/[id]/send/route.ts:107-114`) ve push (`:116-127`) olarak gidiyor.
- Bayi arayüzünde düzenleme yok. Satırda yalnızca Performans, Gönder (onay diyaloğu olmadan doğrudan `sendMutation.mutate`) ve Sil var (`app/dealer/campaigns/page.tsx:202-221`). Mesaj `line-clamp-2` ile kesik gösteriliyor (`:195`). `PATCH /api/dealer/campaigns/[id]` ucu var (`app/api/dealer/campaigns/[id]/route.ts:10`), ama hiçbir UI onu çağırmıyor.
- Hafifletici etken: Gönderim bayinin tıklamasını gerektiriyor ve bayi başlığı görüyor. Yine de düzeltme imkânı olmadığı için tek seçenek "olduğu gibi gönder" ya da "sil".
- **Yeniden üretim:** Admin `low_nps_churn` playbook'unu bir bayiye uygular. Bayi `/dealer/campaigns` sayfasında "Gönder"e basar. Son 30 günde ortalama puanı 2 veya altında olan müşteriler "Düşük NPS + churn sinyali — …" başlıklı push ve bildirim alır. Yani kendilerini "churn riski" olarak etiketleyen, iç talimat içeren bir mesaj.

### 3. Playbook hedef segmenti ters kitleye gidiyor — **DOĞRULANDI** (ifade biraz abartılı)

- Eşleme: `silent_happy → 'loyal'`, `first_week_dropoff → 'active'` (`lib/growth-playbooks.ts:97-98`). Gönderim ucu yalnızca `all`, `vip` ve `risk` için ayrı dal içeriyor. `loyal` ve `active` aynı `else` dalına düşüyor ve bu dal tüm zamanlarda **en az 3 geri bildirimi** olan müşterileri seçiyor (`app/api/dealer/campaigns/[id]/send/route.ts:72-83`).
- `silent_happy` için hedef "düşük feedback count" (`lib/growth-playbooks.ts:54-55`). Seçilen kitle ise tanım gereği en çok geri bildirim verenler, yani gerçekten hedefin tersi.
- `first_week_dropoff` için hedef "kayıt sonrası 7 gün" (`:39`). En az 3 geri bildirim ölçütünde zaman penceresi yok. Seçilen kitle ağırlıklı olarak eski ve aktif müşteriler. Bu tam bir "ters" sayılmaz, ama yanlış kitle olduğu açık. Yeni müşteriler ancak tesadüfen kapsama girer.
- **Yeniden üretim:** `silent_happy` bir bayiye uygulanıp gönderilir. Bayinin QR'larına en az 3 geri bildirim bırakmış her müşteri "geri bildirim yazmayan memnunlar" mesajını alır. Hiç geri bildirim vermemiş müşteriler, `Feedback` tablosunda kaydı olmadığı için hiçbir dalda seçilemez.

### 4. Apply mutasyonu audit log ve quests modül kapısı olmadan kayıt ve global görev oluşturuyor — **DOĞRULANDI** (önem: orta)

- `app/api/admin/playbooks/apply/route.ts:20-98` içinde `auditLog.create` yok. `proxy.ts` ve `lib/api-auth.ts` içinde genel bir audit katmanı da yok (grep ile kontrol edildi, eşleşme çıkmadı). Karşılaştırma için `POST /api/gamification/quests` `CREATE_QUEST` audit kaydı yazıyor (`app/api/gamification/quests/route.ts:136-145`). Playbook yolunda kim, hangi bayiye, ne zaman uyguladı ve hangi görev doğdu izlenemiyor.
- Modül kapısı yok: `assertModuleEnabled('quests')` çağrılmıyor. Ayrıca `weekly-card` ucu da modül kapısı uygulamıyor (`app/api/customer/weekly-card/route.ts:13-22`). Bu yüzden quests modülü kapalıyken bile playbook görevi müşteri panosunda görünür. Bu, iddiayı somut bir kullanıcı etkisine dönüştürüyor.
- Şema atlaması: Değerler sabit üretildiği için girdi enjeksiyonu riski yok. Ancak `createQuestSchema.name` sınırı 50 karakter (`lib/validations.ts:164`). "Playbook: Sessiz memnunlar (yüksek tüketim, düşük ses)" yaklaşık 56 karakter olduğundan, normal yolun reddedeceği bir ad yazılıyor (apply yalnızca 120'ye kırpıyor, `route.ts:67`). Etki kozmetik ve düşük.
- Not: Uç `requireAuth(['ADMIN'])` ile korunuyor (`route.ts:22`). Yetkisiz erişim riski yok. Bulgu izlenebilirlik ve tutarlılık eksiği. "Güvenlik açığı" değil, orta önemde bir yönetişim sorunu.

---

## Uygulama (Dalga 2)

**Karar uygulandı (birleştir):** `/admin/playbooks` artık `permanentRedirect` ile `/admin/dealers-health?tab=playbooks` adresine gidiyor; sorgu parametreleri korunuyor. Eski `?dealerId=X` bağlantısı `?dealer=X` olarak o bayinin çekmecesini açıyor. Kütüphane, Bayi Sağlığı sayfasının ikinci sekmesi oldu. Uygulama akışı paylaşılan bir diyalog (`components/admin/a-bayi-sagligi/ui/apply-dialog.tsx`); hem kütüphaneden hem bayi çekmecesindeki kanıtlı öneriden açılıyor.

**Veri:** `lib/growth-playbooks.ts` şemasına geriye uyumlu, eklemeli alanlar geldi:
- `category`
- `segment`: çalıştırılabilir hedef kitle; kampanya merkezinin segment anahtarı
- `customerTitle` / `customerMessage`: müşteri dilinde, `{{isletme}}` değişkenli metin

`buildPlaybookDrafts` artık yalnız müşteri metninden taslak üretiyor; görev taslağı kaldırıldı. Metrik adları Türkçeleştirildi.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Sayfa erişimi | ÇALIŞIYOR | Hedef rota sunucu bileşeninde `requireAuth` |
| 2 | GET liste yetkisi | ÇALIŞIYOR | `defineRoute` (ADMIN, hız sınırı) |
| 3 | POST apply yetkisi | ÇALIŞIYOR | `defineRoute` (ADMIN, zod, `mutation` hız sınırı, `Idempotency-Key`) |
| 4 | Hero | ÇALIŞIYOR | Bayi Sağlığı başlığı ve sekmeler |
| 5–7 | Segmentler / A/B / Görevler kısayolları | KALDIRILDI | Bağlam taşımıyorlardı; gezinme navigasyon katmanının işi |
| 8 | Liste yükleme | ÇALIŞIYOR | react-query + `QueryState` |
| 9 | Yükleniyor | ÇALIŞIYOR | Kart iskeleti |
| 10 | Boş liste | ÇALIŞIYOR | `QueryState` boş durumu |
| 11 | Hata + tekrar dene | ÇALIŞIYOR | Türkçe zarf mesajı |
| 12 | Kart başlığı | ÇALIŞIYOR | |
| 13 | Teknik id rozeti | KALDIRILDI | Yerine kategori rozeti (Elde tutma / İlk deneyim / Müşterinin sesi) |
| 14 | Özet | ÇALIŞIYOR | |
| 15 | Segment ipucu (sözde kod) | KALDIRILDI | Yerine çalıştırılabilir `segment`. Uygulama önizlemesi kampanya merkezinin çözücüsüyle canlı kitle ve izinli kişi sayısını gösteriyor |
| 16 | Tetikleyiciler | ÇALIŞIYOR | Rehber metni. Ayrıca "şu an önerilen bayi" sayısı ve en riskli 5 bayi gerçek sinyallerden geliyor |
| 17 | Bayi aksiyonları | ÇALIŞIYOR | Yalnız bayiye rehber; müşteri metnine girmez |
| 18 | Müşteri fikirleri | ÇALIŞIYOR | |
| 19 | İzlenecek metrikler | ÇALIŞIYOR | Türkçe gösterge adları "İzlenecek göstergeler" başlığıyla rehber olarak duruyor. Gerçek benimseme sayıları (uygulandı / açık taslak / gönderildi / ulaşılan kişi) ayrıca gösteriliyor |
| 20 | Taslak oluştur butonu | ÇALIŞIYOR | Eşleşen bayi satırında ve çekmecedeki her öneride "Playbook uygula" |
| 21 | Dialog başlığı | ÇALIŞIYOR | "Playbook uygula: <ad>" ve bayi adı |
| 22 | Bayi seçici (60 sınırı) | KALDIRILDI | Yerine bağlamlı uygulama (çekmece ya da eşleşme listesi). Her bayiye Bayiler sekmesindeki sunucu tarafı aramayla ulaşılıyor |
| 23 | Global görev checkbox'ı | KALDIRILDI | Görevi canlı açıyordu ve görev tamamlanamıyordu (Bulgu 1) |
| 24 | Vazgeç | ÇALIŞIYOR | |
| 25 | Oluştur | ÇALIŞIYOR | Tek `Idempotency-Key`. Aynı bayide aynı playbook için açık taslak varsa 409 |
| 26 | Kampanya taslağı | ÇALIŞIYOR | Müşteri dilinde metin, doğru segment |
| 27 | Global görev üretimi | KALDIRILDI | |
| 28 | Başarı bildirimi | ÇALIŞIYOR | Taslak adını içeren toast ve ekran okuyucu duyurusu. Liste ve çekmece yenileniyor |
| 29 | Hata bildirimi | ÇALIŞIYOR | Diyalog içinde Türkçe metin; "[object Object]" yok |
| 30 | Dialog state sıfırlama | ÇALIŞIYOR | Her açılışta yeni önizleme ve yeni idempotency anahtarı. Görev tiki yok |
| 31 | Önizleme | ÇALIŞIYOR | `dryRun`: metin, kitle sayısı, mevcut taslak, modül durumu |
| 32 | Audit log | ÇALIŞIYOR | `playbook.apply` (playbookId, dealerId, segment, aktör, IP/UA) |
| 33 | Bayiye bildirim | ÇALIŞIYOR | Uygulama içi `Notification` ("Yeni kampanya taslağı hazır"), aynı transaction'da |
| 34 | Uygulama geçmişi / benimseme | ÇALIŞIYOR | Kütüphanede playbook başına uygulandı / açık taslak / gönderildi / ulaşılan kişi / uygulanan bayi sayısı. Çekmecede bayi başına playbook geçmişi |
| 35 | Playbook CRUD / sürümleme | KALAN | **ŞEMA İSTEĞİ** (`GrowthPlaybook` modeli). Şimdilik tek kaynak statik dizi |
| 36 | Arama / filtre | KALDIRILDI | 3 kayıt için gereksiz; kategori rozeti var |
| 37 | GET `?id=` ölü uç | KALDIRILDI | |
| 38 | dealers-health → playbook bağlamı | ÇALIŞIYOR | Aynı sayfa: kanıtlı öneriden bayi önceden seçili diyalog açılıyor |
| 39 | Ortak kaynak | ÇALIŞIYOR | Haftalık özet ve bu yüzey aynı `GROWTH_PLAYBOOKS`'u kullanıyor. Raporda anılan `app/api/dealer/morning-briefing` artık depoda yok |
| 40 | i18n | ÇALIŞIYOR | Arayüz TR/EN, playbook içerikleri Türkçe |
| 41 | Mobil | ÇALIŞIYOR | Tek sütun kartlar. Diyalog `max-h-[90dvh]` ile kaydırılabilir. Dokunma hedefi ≥44px |
| 42 | Klavye / form erişilebilirliği | ÇALIŞIYOR | CSM formunda `Label htmlFor` ve `ChoiceChips` (radiogroup). Odak Radix diyaloğunda |

### Kapanan bulgular (10 bulgudan 9'u tam, 1'i kısmi)
1. Global "taslak" görev canlı açılıyordu → **kapandı**. Görev üretimi tamamen kaldırıldı; testte `quest.create` çağrılmadığı doğrulanıyor.
2. Müşteri bildirimine iç talimat ve "churn" sızıyordu → **kapandı**. Şema iki kitleli oldu. Testle doğrulanıyor: müşteri metninde id, "churn" ve bayi aksiyonları geçmiyor. Bayi taslağı kampanya merkezinde düzenleyebiliyor.
3. Ters segment → **kapandı**. Eşleme `silent_happy`→`loyal` (bayiye özel tüketim kuralı), `first_week_dropoff`→`new`, `low_nps_churn`→`risk`. Segment artık id'den değil tanımdan geliyor. Önizleme gerçek kitle sayısını gösteriyor.
4. Audit log ve modül kapısı → **kapandı**. `playbook.apply` denetim kaydı yazılıyor. Bayide kampanyalar kapalıysa 403 `MODULE_DISABLED` dönüyor.
5. İdempotensi / state sızıntısı / atomiklik → **kapandı**. 409, `Idempotency-Key` ve `$transaction` kullanılıyor.
6. Sessiz hatalar ve `[object Object]` → **kapandı**.
7. Bayi seçimi ölçeklenmiyordu → **kapandı**. Yerine bağlamlı uygulama ve sunucu tarafı arama.
8. İçerik sabit kodlu ve kopyalanmış → **kısmi**. Kaynak tek; id'ye göre `if` zinciri kaldırıldı. DB modeli şema isteği olarak bekliyor.
9. Ham alan adları ve TR/EN karışımı → **kapandı**.
10. Erişilebilirlik → **kapandı**.

### Kalanlar
- **ŞEMA İSTEĞİ:** `GrowthPlaybook` modeli (CRUD, sürüm, durum). Şu an içerik değişikliği deploy gerektiriyor.
- Etki ölçümü ("gönderim sonrası 7 günlük tekrar ziyaret farkı") yok. Kampanya alıcı listesi, kampanya merkezinin `AuditLog` anlık görüntüsünde tutuluyor. Önce/sonra kıyası kampanya merkezinin performans modülüyle ortak yazılmalı.
- Otomasyon ("tetikleyici gerçekleşince otomatik taslak") yok. Bilinçli bir tercih: her taslak insan onayından geçiyor.
- `give_feedback` görev türünün ilerletici olmaması sistem genelinde bir sorun (seed/bootstrap). Bu yüzeyden görev üretimi kaldırıldığı için buradan tetiklenmiyor.
