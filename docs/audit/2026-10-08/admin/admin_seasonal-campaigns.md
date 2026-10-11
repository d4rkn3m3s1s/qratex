# /admin/seasonal-campaigns

**Amaç:** Platform genelinde zaman kutulu puan kampanyaları (çarpan + sabit bonus) tanımlamak. Bu kampanyalar feedback ödülüne (`app/api/feedbacks/route.ts:302-315`) ve bayi tüketim kaydından doğan pasif puana (`app/api/dealer/consumptions/route.ts:323-325`) uygulanır; aktif kampanya müşteri tarafında `/customer/event` sayfasında "etkinlik" olarak gösterilir (`app/api/customer/seasonal-event/route.ts:44`).

**Genel puan: 4/10** · **Karar: birleştir** (`/admin/seasonal-concepts` ile tek bir "Sezon & Etkinlik Stüdyosu"na; bu sırada ekonomi korkulukları ve challenge editörüyle yeniden tasarlanmalı)

Sayfa ekonomiyi doğrudan etkileyen bir kontrol yüzeyi olmasına rağmen; düzenleme, önizleme, canlı durum, çakışma görünürlüğü ve etki ölçümü sunmuyor. Daha önemlisi, arayüzün söz verdiği iki davranış (BIRTHDAY/ANNIVERSARY türleri ve "günlük tavan yine geçerli") sunucu tarafında gerçekleşmiyor; şemada ve müşteri sayfasında hazır olan challenge özelliğinin ise hiçbir yazma yolu yok.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Oluştur + aç/kapat çalışıyor; düzenleme, silme, challenge, görsel, filtre yok ve tür semantiği sahte. |
| UX | 3/10 | Hiçbir canlı/planlı/bitmiş ayrımı, çakışma uyarısı veya etki önizlemesi yok; API hatası "Henüz kampanya yok" gibi görünüyor. |
| Görsel | 4/10 | Ortak hero ile tutarlı başlangıç, ama liste düz metin satırı; durum yalnızca ikon rengiyle ve "· PASİF" ekiyle anlatılıyor; native `<select>` kardeş sayfadaki shadcn `Select` ile tutarsız. |
| Mimari | 4/10 | Sunucu tarafı zod + audit doğru desende, ancak tür/koşul mantığı boş (`isEligible` hep `true`), challenge alanları API şemasında yok, istemci `r.ok` kontrol etmiyor, i18n atlanmış. |
| Performans | 7/10 | Tek liste çağrısı (`take: 200`); sorun değil. Kazanç yolunda her olayda ekstra DB sorgusu var (cache yok) ama hafif. |
| Erişilebilirlik + mobil | 4/10 | `Label`'lar input'a bağlı değil, ikon butonu yalnızca `title` ile etiketli, durum renkle kodlanmış; mobilde düzen yığılıyor ama layout + `p-6` çift kenar boşluğu var. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Yetki: sayfa (proxy ADMIN + gizli kapı çerezi) ve API (`requireAuth(['ADMIN'])`) | ÇALIŞIYOR | `proxy.ts:51,79-83`; `app/api/admin/seasonal-campaigns/route.ts:32,51,103` | GET/POST/PUT'un üçü de korumalı; IDOR riski yok (tekil admin kaynağı). |
| 2 | Hero başlık/açıklama | ÇALIŞIYOR | `page.tsx:103-107`; `components/admin/admin-premium-hero.tsx:35` | Hero `useReducedMotion` ile animasyonu kapatıyor. |
| 3 | Ad alanı | ÇALIŞIYOR | `page.tsx:120-123`; route `:16` (2-120 karakter) | İstemcide uzunluk sınırı yok; sunucu 2 karakter altını reddeder (İngilizce mesaj, bkz. #12). |
| 4 | Tür seçimi (SEASONAL/SPECIAL/BIRTHDAY/ANNIVERSARY) | KISMİ | `page.tsx:25,124-136`; `lib/seasonal-campaign-live.ts:29-33` | Ham İngilizce enum gösteriliyor; BIRTHDAY/ANNIVERSARY için hiçbir uygunluk mantığı yok, herkese uygulanıyor (Bulgu B1). |
| 5 | Açıklama alanı | ÇALIŞIYOR | `page.tsx:138-145`; müşteri tarafında `app/api/customer/seasonal-event/route.ts:86` | Müşteriye gösterildiği formda belirtilmiyor. |
| 6 | Çarpan alanı | KISMİ | `page.tsx:146-149,64` | `min`/`max` niteliği yok; `0` veya boş girilirse `Number(...) \|\| 1.5` ile sessizce 1.5'e döner; `0.5` sunucuda İngilizce hatayla reddedilir. |
| 7 | Bonus puan alanı | KISMİ | `page.tsx:150-153,65`; route `:20` (max 100000) | Olay başına eklenir; tüketim yolunda tavansız (Bulgu B2). Uyarı/onay yok. |
| 8 | Başlangıç tarihi (`datetime-local`) | ÇALIŞIYOR | `page.tsx:154-157,66` | Tarayıcı saat diliminde yorumlanıp ISO'ya çevriliyor; saat dilimi arayüzde belirtilmiyor. |
| 9 | Bitiş tarihi | KISMİ | `page.tsx:158-161`; route `:64-69` | İstemcide bitiş > başlangıç kontrolü yok; yalnızca sunucu reddediyor. |
| 10 | "Oluştur" butonu + kaydediliyor durumu | ÇALIŞIYOR | `page.tsx:163-166,56,83` | Geçersiz tarih (`datetime-local` desteklemeyen tarayıcıda serbest metin) `toISOString()` RangeError fırlatır, `saving` true'da takılı kalır (`page.tsx:56,66`) — düşük olasılık. |
| 11 | İstemci zorunlu alan kontrolü | ÇALIŞIYOR | `page.tsx:52-55` | Tek toplu mesaj; alan bazlı hata vurgusu yok. |
| 12 | Sunucu doğrulama hata mesajı | KISMİ | route `:57,109` | `parsed.error.errors[0]?.message` zod'un varsayılan **İngilizce** mesajı; projede `setErrorMap` yok (grep ile doğrulandı). Admin "Number must be greater than or equal to 1" görür. |
| 13 | Başarı sonrası form sıfırlama | KISMİ | `page.tsx:74-79` | `type` sıfırlanmıyor (muhtemelen bilinçli); sorun değil ama tutarsız. |
| 14 | Liste yükleme (GET) | ÇALIŞIYOR | `page.tsx:39-49`; route `:31-48` | `orderBy: startDate desc`, `take: 200`, sayfalama yok. |
| 15 | Yükleniyor durumu | KISMİ | `page.tsx:175-176` | Düz "Yükleniyor..." metni; skeleton yok. Liste yeniden çekilirken (`fetchList`) `loading` true'ya dönmüyor. |
| 16 | Boş durum | ÇALIŞIYOR | `page.tsx:177-178` | Yönlendirici değil (örnek şablon/CTA yok). |
| 17 | Hata durumu | BOZUK | `page.tsx:40-43` | `r.ok` kontrol edilmiyor; 401/403/500 yanıtı `{error}` nesnesi döner → `Array.isArray` false → boş liste → "Henüz kampanya yok." Hata, boş durum kılığında gizleniyor. |
| 18 | Liste satırı (ad, tür, çarpan, bonus, tarih) | KISMİ | `page.tsx:181-198` | Yalnızca tarih (`toLocaleDateString`), saat yok — aynı gün içindeki flaş kampanya "08.10.2026 – 08.10.2026" görünür. Canlı/planlı/bitmiş ayrımı yok; süresi geçmiş ama `isActive=true` kampanya "aktif" görünür. |
| 19 | Aktif/pasif aç-kapat (PUT) | ÇALIŞIYOR | `page.tsx:86-99,199-201`; route `:102-137` | İstek iki kez gönderilse de hedef değer aynı olduğundan idempotent. |
| 20 | Aç-kapat için onay / bekleme durumu | EKSİK | `page.tsx:199` | Ekonomiyi anında etkileyen aksiyon tek tıkla, onaysız, buton disable edilmeden çalışıyor. |
| 21 | Kampanya düzenleme | EKSİK | route `:29,113-122` partial update destekliyor; UI'da yok | Ad/çarpan/tarih hatasını düzeltmenin tek yolu yeni kampanya oluşturmak. |
| 22 | Silme / arşivleme | EKSİK | route'ta DELETE yok | Yanlış kayıtlar listede sonsuza dek kalır. |
| 23 | Challenge tanımlama (challengeType/Goal/RewardPoints/RewardBadgeId) | EKSİK | `prisma/schema.prisma:1845-1848`; route `createSchema` `:15-27` bu alanları içermiyor (zod bilinmeyen anahtarları atar); başka yazıcı yok (grep: yalnız `seasonal-event` okuyor) | Müşteri sayfasındaki challenge kartı (`app/customer/event/page.tsx:140-180`) ve claim POST'u (`seasonal-event/route.ts:112-187`) hiçbir zaman tetiklenemiyor (Bulgu B3). |
| 24 | Kampanya görseli (`imageUrl`) | EKSİK | route `:22,78` kabul ediyor; UI'da alan yok | Müşteri tarafı `imageUrl` döndürüyor (`seasonal-event/route.ts:90`). |
| 25 | İndirim (`discount`) | SAHTE | route `:21,77`; şema `:1840` | Hiçbir okuyucu yok (müşteri route'u seçmiyor); ölü alan. |
| 26 | Uygunluk koşulları (`conditions`) | SAHTE | `lib/seasonal-campaign-live.ts:29-33` | Fonksiyon her durumda `true` döndürüyor; API'nin kabul ettiği `conditions` etkisiz. |
| 27 | Durum filtresi (aktif/pasif) | EKSİK | route `:35-37` `?isActive=` destekliyor; UI kullanmıyor | |
| 28 | "Şu an canlı olan kampanya" göstergesi | EKSİK | Seçim kuralı `lib/seasonal-campaign-live.ts:44-63` (en yüksek çarpan) | Admin hangi kampanyanın şu an puana uygulandığını göremiyor. |
| 29 | Çakışma / gölgelenme uyarısı | EKSİK | `seasonal-campaign-live.ts:51` `orderBy: multiplier desc` | Çarpanı 1.0 + bonus 500 olan kampanya, çarpanı 1.1 olan başka kampanyayla çakışırsa bonus sessizce kaybolur. |
| 30 | Etki analitiği (kaç puan, kaç kullanıcı) | EKSİK | Veri mevcut: `feedbacks/route.ts:340-342` `seasonalCampaignId` olay verisine yazılıyor | Tüketim yolu ise olay yazmıyor (Bulgu B2). |
| 31 | Audit log | KISMİ | route `:85-94,123-132` | `oldData` alanı şemada var (`schema.prisma:1111`) ama hiç yazılmıyor; PUT yalnızca `name`+`isActive` kaydediyor, çarpan/tarih değişimi izlenemez. |
| 32 | Kural açıklama metni ("günlük tavan yine geçerli") | KISMİ | `page.tsx:115` | Feedback yolu için doğru (`feedbacks/route.ts:317`), tüketim yolu için yanlış — orada tavan yok. |
| 33 | i18n | EKSİK | Sidebar etiketi `messages/tr.json:2474` / `en.json:2474` ile çevrilmiş; sayfa metinleri sabit TR | `gamification-settings` gibi kardeş sayfalar `t()` kullanıyor. |
| 34 | Mobil yerleşim | KISMİ | `page.tsx:102,119` | `sm:grid-cols-2` yığılıyor (iyi); ancak layout zaten yatay boşluk verirken (`app/admin/layout.tsx:33`) sayfa `p-6` ekliyor → 400px'te ~36px kenar boşluğu. Aynı desen 11 admin sayfasında var. |
| 35 | Form erişilebilirliği (label-input bağı) | BOZUK | `page.tsx:121-160` | `Label`'larda `htmlFor`, input'larda `id` yok; ekran okuyucu alan adını okumaz, label'a tıklamak input'a odaklanmaz. |
| 36 | İkon butonu erişilebilirliği | KISMİ | `page.tsx:199-200` | Yalnızca `title`; `aria-label`/`aria-pressed` yok; durum kırmızı/yeşil renkle ayrılıyor. |
| 37 | Toast bildirimleri | ÇALIŞIYOR | `page.tsx:43,53,73,82,95,98`; `lib/admin-toast.ts:17,19` | Önekler "Basarili:" / "Dikkat:" — Türkçe karakter eksik (global sorun). |

**Toplam: 37 özellik** — ÇALIŞIYOR 11 · KISMİ 12 · BOZUK 2 · SAHTE 2 · EKSİK 10

---

## Bulgular

### B1 — Yüksek · Veri/ekonomi bütünlüğü · BIRTHDAY / ANNIVERSARY kampanyaları herkese uygulanıyor
- **Kanıt:** `app/admin/seasonal-campaigns/page.tsx:25,126-136` türü seçtiriyor; `lib/seasonal-campaign-live.ts:29-33` `isEligible` her koşulda `true`; `:44-53` sorgusu tür ayrımı yapmıyor; feedback (`app/api/feedbacks/route.ts:315`) ve tüketim (`app/api/dealer/consumptions/route.ts:325`) çağrıları kullanıcı kimliği bile geçmiyor.
- **Sorun:** Admin "Doğum günü 2x" adlı BIRTHDAY kampanyası açtığında, beklenen davranış yalnızca doğum günü olan kullanıcıya çarpan uygulanmasıdır. Gerçekte pencere boyunca platformdaki **tüm** kazanımlar 2x olur. Tür alanı tamamen kozmetik ama arayüz bunu söylemiyor; hatta API yorumu (`seasonal-campaign-live.ts:24-27`) bunu "ileride" olarak kabul ediyor.
- **Öneri:** Kısa vadede BIRTHDAY/ANNIVERSARY seçeneklerini formdan kaldırın veya "henüz hedeflenmiyor, herkese uygulanır" uyarısıyla devre dışı bırakın. Doğru çözüm: `applySeasonalCampaignMultiplier(userId, base, now, db)` imzasına geçip `conditions`'ı tipli bir şemaya (`{ audience: 'all' | 'birthday' | 'anniversary' | 'segment', segmentId?, minLevel? }`) bağlamak; BIRTHDAY için mevcut doğum günü verisini, ANNIVERSARY için `User.createdAt` ayını, segment için `/admin/segments` tanımlarını kullanmak. Arayüzde "Hedef kitle" adımı ve "tahmini etkilenen kullanıcı sayısı" göstergesi.
- **Efor:** M

### B2 — Yüksek · Ekonomi/fraud görünürlüğü · Tüketim yolunda bonus tavansız ve `points_credited` olayı yazılmıyor; arayüz tersini söylüyor
- **Kanıt:** `app/api/dealer/consumptions/route.ts:323-349` — sezonsal sonuç doğrudan `user.points` ve `squad.totalPoints` artırımına gidiyor; günlük tavan çağrısı yok, `analyticsEvent` (`points_credited`) yazılmıyor. `route.ts:20` bonus üst sınırı 100000. Arayüz metni `page.tsx:115`: "günlük tavan yine geçerli".
- **Sorun:** Bonus her kazanım olayına eklenir. Admin yanlışlıkla (ör. 5000 yerine 50000) bonus girerse, bir bayinin her tüketim kaydı müşteriye ve klana 50000 puan basar; bu krediler `lib/points-velocity.ts` / `lib/points-caps.ts` dedektörlerine görünmez çünkü proje değişmezi #3 (her kredi yolunda `points_credited`) bu yolda ihlal ediliyor. Pasif puan mantığı bu sayfadan önce de vardı, ancak sezonsal bonus onu sınırsız bir çarpana dönüştürüyor. Ayrıca güncelleme tüketim kaydıyla aynı transaction'da değil.
- **Öneri:** (1) Tüketim pasif puanını `creditPointsAndXp` + `points_credited` (`category: 'consumption_passive'`, `seasonalCampaignId` dahil) ile tek transaction'a taşıyın ve feedback'teki gibi günlük tavana bağlayın. (2) Kampanya formunda bonus için makul bir yumuşak sınır (ör. 1000) ve üstü için "ekonomi etkisi" onay diyaloğu; eşik `/admin/points-matrix` ayarından okunabilir. (3) Formda "Bu kampanya şu yollara uygulanır: Feedback (tavanlı), Tüketim pasif puanı (tavansız)" şeklinde dürüst bir kapsam tablosu gösterin.
- **Efor:** M

### B3 — Yüksek · İşlevsellik · Challenge özelliği uçtan uca hazır ama hiçbir yerden tanımlanamıyor
- **Kanıt:** Şema `prisma/schema.prisma:1843-1848`; müşteri GET/POST `app/api/customer/seasonal-event/route.ts:62-78,132-175`; müşteri UI `app/customer/event/page.tsx:140-180`; admin `createSchema` (`app/api/admin/seasonal-campaigns/route.ts:15-27`) bu alanları içermiyor ve zod bilinmeyen anahtarları sessizce atıyor. Repo genelinde `challengeType` yazan başka kod/script yok (grep ile doğrulandı).
- **Sorun:** Atomik tek-claim, rozet ödülü ve bildirimiyle doğru yazılmış bir ödül akışı kullanıcıya hiç ulaşamıyor; müşteri sayfasının challenge kartı ölü kod.
- **Öneri:** API şemasına `challengeType: z.enum(['games_played','reviews_written']).nullable()`, `challengeGoal: z.number().int().min(1).max(1000)`, `challengeRewardPoints: z.number().int().min(0).max(<tavan>)`, `challengeRewardBadgeId` (var olan `Badge.id` doğrulamasıyla) ekleyin. Formda isteğe bağlı "Challenge" bölümü: tür seçimi, hedef, ödül puanı, `/admin/badges`'ten rozet seçici ve müşteri kartının canlı önizlemesi. Detay panelinde "talep eden kullanıcı sayısı" (`SeasonalChallengeClaim` count) gösterin.
- **Efor:** M

### B4 — Orta · Hata yönetimi · API hatası boş durum olarak gösteriliyor
- **Kanıt:** `page.tsx:40-43` (`r.ok` kontrolü yok), `page.tsx:70,92` (aynı desen POST/PUT'ta; JSON olmayan 502 gövdesinde "Unexpected token" mesajı).
- **Sorun:** Oturum düşmesi, replay-guard 403'ü (`lib/api-auth.ts:70-76`) veya DB kesintisinde admin "Henüz kampanya yok" görür ve yeni kampanya oluşturmaya yönlendirilir; aslında canlı kampanyalar olabilir.
- **Öneri:** Ortak bir `adminFetch<T>()` yardımcı (status kontrolü, JSON-olmayan gövde koruması, TR hata eşlemesi) ve sayfada ayrı bir hata durumu ("Kampanyalar yüklenemedi — Tekrar dene"). Tercihen SWR/React Query ile `mutate` tabanlı yeniden doğrulama.
- **Efor:** S

### B5 — Orta · UX/ürün · Canlı durum, çakışma ve öncelik görünmüyor
- **Kanıt:** Seçim kuralı `lib/seasonal-campaign-live.ts:44-63` (aktif + pencere içi + en yüksek çarpan, bonus dikkate alınmaz); liste satırı `page.tsx:186-197` yalnızca `isActive` ve tarih gösteriyor.
- **Sorun:** Admin hangi kampanyanın şu an puana uygulandığını, hangisinin planlı/bitmiş olduğunu ve hangisinin gölgelendiğini bilemez. Süresi geçmiş ama `isActive` olan kampanya "Pasifleştir" düğmesiyle aktifmiş gibi duruyor. Bonus-ağırlıklı kampanya, daha yüksek çarpanlı başka bir kampanyayla örtüşürse bonusu sessizce düşer.
- **Öneri:** Türetilmiş durum rozeti (CANLI · PLANLI · BİTTİ · KAPALI) ve "Şu an uygulanıyor" vurgusu; listenin üstünde zaman çizelgesi (Gantt benzeri, gelecek 90 gün) ve çakışma bandında uyarı. Seçim kuralını "en yüksek etkin kazanç" olarak netleştirin veya kampanyaya açık `priority` alanı ekleyin (ki `SeasonalConcept`'te zaten var).
- **Efor:** M

### B6 — Orta · İşlevsellik · Düzenleme ve silme yok; aç/kapat onaysız
- **Kanıt:** `page.tsx:86-99,199` yalnızca `isActive` gönderiyor; route `:29,113-122` tam partial update destekliyor; DELETE handler yok.
- **Sorun:** Çarpan/tarih hatası düzeltilemiyor (yeni kayıt + eskisini kapatma gerekiyor), liste çöp kayıtla doluyor. Ekonomiyi anında etkileyen aç/kapat tek tıkla, bekleme göstergesi olmadan çalışıyor. PUT'ta bitiş > başlangıç kontrolü de yok (`route.ts:119-120`), düzenleme UI'ı eklendiğinde bu açık hemen kullanılabilir hâle gelir.
- **Öneri:** Satıra tıklayınca açılan düzenleme Sheet'i (aynı form bileşeni, `mode='edit'`); PUT'ta mevcut kayıtla birleştirilmiş tarih doğrulaması; canlı bir kampanyanın çarpanını değiştirirken "değişiklik anında uygulanır" onayı. Silme yerine `archivedAt` ile yumuşak arşiv (audit izi korunur). Aç/kapat için pending durumu + iyimser güncelleme.
- **Efor:** M

### B7 — Orta · Gözlemlenebilirlik · Audit kaydı değişikliğin ne olduğunu saklamıyor
- **Kanıt:** route `:91,129` — `oldData` yazılmıyor; PUT `newData` yalnızca `{name, isActive}`. Şema `oldData Json?` destekliyor (`prisma/schema.prisma:1111`).
- **Sorun:** "Kim çarpanı 1.5'ten 5'e çıkardı?" sorusu yanıtlanamaz; ekonomi olayı sonrası adli inceleme yapılamaz.
- **Öneri:** PUT'ta `existing` zaten okunuyor (`route.ts:114`); `oldData` ve `newData`'ya değişen alanların tam karşılaştırmasını yazın. Detay panelinde "Geçmiş" sekmesi (bu kampanyanın audit kayıtları).
- **Efor:** S

### B8 — Orta · Erişilebilirlik · Form alanları etiketlerine bağlı değil
- **Kanıt:** `page.tsx:121,125,139,147,151,155,159` (`Label` `htmlFor` yok, input `id` yok); `page.tsx:199-200` ikon butonu yalnız `title` ile; durum renk kodlu.
- **Sorun:** Ekran okuyucu "edit text" der, alan adını okumaz; durum yalnızca renkle iletiliyor (WCAG 1.4.1, 4.1.2).
- **Öneri:** `useId` ile `htmlFor`/`id` eşleşmesi; `aria-describedby` ile alan yardımları (ör. "Çarpan 1 ile 10 arası"); butonda `aria-label="Yaz Festivali kampanyasını pasifleştir"` ve `aria-pressed`; metinli durum rozeti. Native `<select>` yerine kardeş sayfadaki shadcn `Select` (`app/admin/seasonal-concepts/page.tsx:10-16`).
- **Efor:** S

### B9 — Düşük · Dil tutarlılığı · İngilizce enum ve zod mesajları, ASCII toast önekleri, i18n yok
- **Kanıt:** `page.tsx:133,190` ham `SEASONAL`/`BIRTHDAY`; route `:57,109` varsayılan zod mesajı; `lib/admin-toast.ts:17,19` "Basarili"/"Dikkat"; sidebar `messages/tr.json:2474` çevrilmiş ama sayfa sabit metin.
- **Öneri:** Tür etiket haritası (Sezonluk, Özel, Doğum günü, Yıldönümü); route'larda alan bazlı TR mesajları (`z.number({ invalid_type_error: ... }).min(1, 'Çarpan en az 1 olmalı')`) veya global TR zod error map; sayfa metinlerini `adminSeasonalCampaigns.*` anahtarlarına taşıyın.
- **Efor:** S

### B10 — Düşük · Doğruluk · Sessiz varsayılanlar ve eksik istemci doğrulaması
- **Kanıt:** `page.tsx:64` (`Number(multiplier) || 1.5` — 0 girişi 1.5'e döner), `page.tsx:148` (`min` yok), `page.tsx:52-55` (bitiş>başlangıç yok), `page.tsx:56,66` (geçersiz tarih RangeError'unda `saving` takılı kalır), `page.tsx:195-196` (saat gösterilmiyor).
- **Öneri:** Form şemasını istemci ve sunucuda paylaşılan tek bir zod şemasına (`lib/seasonal-campaign-schema.ts`) taşıyıp `react-hook-form` + `zodResolver` ile alan bazlı hata; tarih aralığı seçici (başlangıç-bitiş tek bileşen, saat dilimi etiketi "Europe/Istanbul"); listede `Intl.DateTimeFormat` ile tarih+saat ve "3 gün 4 saat kaldı" göreli metni (`lib/seasonal-event-core.ts:53-61` `formatRemaining` hazır).
- **Efor:** S

### B11 — Düşük · Performans · Aktif kampanya her kazanımda DB'den okunuyor
- **Kanıt:** `lib/seasonal-campaign-live.ts:44-53`; feedback'te Serializable transaction içinde (`feedbacks/route.ts:315`).
- **Sorun:** Hafif bir sorgu ama her feedback/tüketimde tekrar ediyor ve Serializable tx'in okuma kümesini büyütüyor. Projede Upstash cache katmanı zaten var.
- **Öneri:** Aktif kampanya listesini kısa TTL'li (30-60 sn) Redis anahtarında tutun; POST/PUT'ta anahtarı geçersiz kılın. Tx dışında okunup sonuç tx'e değer olarak geçirilebilir.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

- **Zamanlama görünümü (Linear Cycles / Stripe Billing schedule benzeri):** Gelecek kampanyaların zaman çizelgesi, örtüşmeler ve "şu an" çizgisi. Şu an yalnız düz liste var.
- **Etki önizlemesi ve simülasyon (Stripe "preview invoice" / PostHog experiment etkisi):** "Bu kampanya son 7 günün verisiyle günlük ~X ek puan basardı" — `/admin/economy-sim` motoruna bağlanabilir; çarpan zincirini (VIP → sezon → global, `feedbacks/route.ts:310-318`) görselleştirir.
- **Kampanya sonrası rapor (PostHog insight):** Basılan toplam puan, etkilenen kullanıcı, katılım artışı (kampanya öncesi/sonrası feedback hacmi), challenge tamamlama oranı. `points_credited.data.seasonalCampaignId` zaten yazılıyor.
- **Hedefleme / segment:** Doğum günü, yıldönümü, seviye, segment, bölge, bayi bazlı kampanya (Retool/Braze tipi kitle seçici).
- **Durum yaşam döngüsü + onay:** Taslak → Planlı → Canlı → Bitti → Arşiv; yüksek etkili değişikliklerde ikinci admin onayı veya en azından yazılı onay.
- **Şablonlar ve kopyalama:** "Ramazan 2x", "Yılbaşı +100" gibi hazır şablonlar ve "geçen yılkini kopyala" (kardeş sayfa `/admin/seasonal-concepts` `SEASONAL_TEMPLATES` ile bunu zaten yapıyor).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Admin bir sezonu tek yerden kurar: görsel konsept (tema, arka plan, banner) + ekonomi kuralı (çarpan/bonus, hedef kitle) + isteğe bağlı challenge. Kaydetmeden önce müşterinin göreceği etkinlik kartını ve tahmini ekonomik etkiyi görür; yayına aldıktan sonra aynı ekrandan canlı sonuçları izler.

**Yerleşim (masaüstü):**
1. **Üst şerit:** Kompakt hero yerine durum özeti — "Şu an canlı: Yaz Festivali (2x, +0) · 2 gün 5 saat kaldı", bugün basılan kampanya kaynaklı puan, sıradaki planlı kampanya.
2. **Zaman çizelgesi:** 90 günlük yatay şerit; her kampanya bir bar (renk = durum), örtüşmeler kırmızı tarama ile; bara tıklamak detay panelini açar.
3. **Tablo:** Ad · Tür/Kitle · Etki (2x +50) · Pencere (tarih+saat) · Durum rozeti · Basılan puan · Aksiyonlar (Düzenle, Kopyala, Durdur, Arşivle). Filtreler: durum, tür; arama.
4. **Oluştur/Düzenle Sheet'i (sağdan, çok adımlı):** (a) Temel bilgiler + görsel, (b) Ekonomi kuralı + hedef kitle + canlı etki tahmini, (c) Challenge (isteğe bağlı) + rozet seçici, (d) Önizleme: müşteri `/customer/event` kartının birebir render'ı + onay.

**Mobil:** Zaman çizelgesi yatay kaydırılabilir kapta; tablo kart listesine dönüşür; Sheet tam ekran alt sayfa. Sayfa kendi `p-6`'sını bırakıp layout kenar boşluğuna güvenmeli.

**Motion/3D:** Bu bir operasyon ekranı; 3D gereksiz. Ölçülü framer-motion (`m as Motion`): durum rozeti değişiminde kısa renk/opaklık geçişi, zaman çizelgesinde "şimdi" çizgisinin yumuşak konumlanması, Sheet giriş/çıkışı. Canlı kampanya rozetinde tek, yavaş nabız — `useReducedMotion` ile kapatılır. Önizleme kartında müşteri tarafındaki etkinlik animasyonu birebir kullanılabilir (yeni animasyon icat etmeden).

**Veri/API değişiklikleri:**
- `createSchema`'ya challenge alanları, tipli `conditions` (hedef kitle), isteğe bağlı `priority`; `discount` ya kaldırılmalı ya da gerçekten bir okuyucuya bağlanmalı.
- `PUT`: mevcut kayıtla birleştirilmiş tarih doğrulaması, `oldData`/`newData` tam diff audit.
- `DELETE` yerine `archivedAt` alanı + `PATCH /:id/archive`.
- `GET /api/admin/seasonal-campaigns/:id/impact`: `analyticsEvent` üzerinden `points_credited` toplamı (seasonalCampaignId'ye göre), benzersiz kullanıcı, `SeasonalChallengeClaim` sayısı.
- `GET /api/admin/seasonal-campaigns/preview`: verilen kural için geçmiş 7 günün verisiyle tahmini ek puan.
- Kazanım tarafı: `applySeasonalCampaignMultiplier(userId, ...)` imzası, tüketim yolunda `points_credited` + günlük tavan, aktif kampanya Redis cache'i ve POST/PUT'ta invalidation.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/seasonal-concepts` ile doğrudan çakışma.** İki sayfa da "sezon" kavramını, aynı form desenini (`AdminPremiumHero` + kart form + Power toggle) ve benzer tarih penceresini kullanıyor. Concept tarafındaki `bonusMultiplier` alanı (`app/api/admin/seasonal-concepts/route.ts:22,75`) hiçbir puan yoluna bağlı değil — admin iki farklı yerde "çarpan" görüyor ama yalnızca biri çalışıyor. Öneri: tek bir **"Sezon & Etkinlik Stüdyosu"** (`/admin/seasons`), içinde Görsel konsept ve Ekonomi kuralı sekmeleri; bir sezon kaydı isteğe bağlı olarak bir konsept ve bir kampanyaya bağlanır (veya tek modelde birleştirilir). Concept'in ölü `bonusMultiplier` alanı kaldırılmalı.
- **Çarpan kaynaklarının dağınıklığı:** Global çarpan `/admin/gamification-settings`, VIP çarpanı (`lib/vip-multiplier`), bayi Happy Hour ve sezonsal kampanya ayrı ayrı yönetiliyor; zincir yalnızca kodda belgelenmiş (`feedbacks/route.ts:310-313`). Stüdyoda salt-okunur bir "Etkin çarpan zinciri" kartı (şu anki VIP aralığı × sezon × global) bu karmaşayı görünür kılar; `/admin/economy-sim` ile simülasyon entegrasyonu önerilir.
- **`/customer/event`** bu sayfanın tüketicisi; challenge ve görsel alanlarının admin tarafında açılması bu müşteri sayfasını gerçekten çalışır hâle getirir.

---

## Doğrulama (şüpheci inceleme)

### 1. BIRTHDAY/ANNIVERSARY türündeki kampanya herkese çarpan uyguluyor — **doğrulandı**

- `lib/seasonal-campaign-live.ts:29-33`: `isEligible` her dalda `true` döner; kullanıcı parametresi bile almaz. Dosya başlığındaki yorum (`:9-10`, `:26-27`) BIRTHDAY eşleşmesinin "ileride" yapılacağını açıkça kabul ediyor.
- `lib/seasonal-campaign-live.ts:44-53`: sorgu yalnızca `isActive` + `startDate/endDate` penceresine bakar, `type` filtresi yok; `orderBy: { multiplier: 'desc' }` nedeniyle yüksek çarpanlı bir BIRTHDAY kampanyası aynı anda açık bir SEASONAL kampanyayı da gölgeler.
- Çağıranlar kullanıcı kimliği geçirmiyor: `app/api/feedbacks/route.ts:315` (`applySeasonalCampaignMultiplier(vip.points, new Date(), tx)`), `app/api/dealer/consumptions/route.ts:325` (`applySeasonalCampaignMultiplier(basePassivePoints, nowDate)`).
- Arayüz türü seçtiriyor (`app/admin/seasonal-campaigns/page.tsx:25,126-136`) ve API kabul ediyor (`app/api/admin/seasonal-campaigns/route.ts:18`), ama hiçbir yerde "tür etkisizdir" uyarısı yok. Ayrıca `app/api/customer/seasonal-event/route.ts:44,92` bu kampanyayı TÜM müşterilere `type: 'BIRTHDAY'` etiketiyle etkinlik olarak gösteriyor; yani doğum günü olmayan kullanıcı da "doğum günü kampanyası" kartı görür.
- **Yeniden üretim:** Admin `/admin/seasonal-campaigns`'ta tür=BIRTHDAY, çarpan=2, bonus=20, pencere=bugün olan kampanya oluşturur → herhangi bir müşteri (doğum günü kaydı olsun olmasın) feedback gönderir → `points_credited` olayında `seasonalCampaignId` dolu, `seasonalMultiplier: 2` görülür; bir bayi tüketimi kaydeder → müşterinin pasif puanı ×2 +20 artar.
- **Not (önem):** Dış saldırgan tarafından tetiklenemez; admin'in yanlış beklentisiyle oluşan ekonomi hatasıdır. Feedback yolunda günlük tavan (`capFeedbackPoints`, `feedbacks/route.ts:317`) etkiyi sınırlar; tüketim yolunda sınırlamaz (bkz. 2). Gerçek bir doğruluk/ürün hatası olduğu için "doğrulandı", ancak güvenlik açısından KRİTİK değil, YÜKSEK/ORTA ekonomi hatası olarak sınıflanmalı.
- **Doğru düzeltme:** `applySeasonalCampaignMultiplier(userId, base, now, db)` imzası; BIRTHDAY için `UserBirthday`/doğum tarihi ile gün (veya ±N gün) eşleşmesi, ANNIVERSARY için `user.createdAt` yıl dönümü; uygun olmayan kullanıcı için bir sonraki aday kampanyaya düşülmesi. Bu yapılana kadar API `type ∈ {BIRTHDAY, ANNIVERSARY}` isteğini reddetmeli ya da arayüz bu türleri devre dışı bırakıp açıklama göstermeli; müşteri `seasonal-event` uç noktası da aynı uygunluk fonksiyonunu kullanmalı.

### 2. Tüketim pasif puanında sezon bonusu tavansız ve fraud dedektörüne görünmez — **doğrulandı**

- `app/api/dealer/consumptions/route.ts:325-326`: `passivePoints = floor(floor(baseXP*0.05*HH) * multiplier) + bonusPoints`. `BASE_XP_CAP` (`:304`) yalnızca ham `baseXP`'yi sınırlar; sezon bonusu bu tavandan SONRA eklenir ve hiçbir üst sınıra tabi değildir.
- `:328-350`: `squad.totalPoints` ve `user.points` doğrudan `increment` edilir; `creditPointsAndXp` kullanılmaz, günlük tavan çağrısı (`capFeedbackPoints` benzeri) yoktur, aynı transaction'da `analyticsEvent.create({ event: 'points_credited' })` yazılmaz. `lib/points-caps.ts:19-22,39-42` ve `lib/points-velocity.ts:14-17,48-51` yalnızca `points_credited` olaylarını okuduğundan bu krediler tavan ve hız (velocity) dedektörlerine görünmez. Bu, proje değişmezi #3'ün ("puan kredileyen her yol points_credited yazmalı") açık ihlali.
- `app/api/admin/seasonal-campaigns/route.ts:20`: `bonusPoints` en fazla 100000; arayüzde (`page.tsx:151-152`) üst sınır/uyarı yok. Arayüz metni `page.tsx:115` "günlük tavan yine geçerli" diyor — bu yalnızca feedback yolu için doğru (`feedbacks/route.ts:317`), tüketim yolu için yanlış.
- Tek sınır hız sınırı: aynı kart+bayi için dakikada 5 tüketim (`consumptions/route.ts:22-23,191`), farklı bayilerde veya farklı kartlarda bağımsız.
- **Yeniden üretim:** Admin bonus alanına yanlışlıkla `5000` (amaçlanan `50`) girer. Kampanya penceresinde bir bayi müşteri kartına tüketim kaydeder → müşteri her kayıtta ≥5000 puan, klanı aynı miktarda `totalPoints` kazanır. Kötü niyetli/işbirlikçi bir bayi aynı karta dakikada 5, saatte 300 kayıt girerek ~1.5M puan basabilir; `points-velocity` (≥500/24s eşiği) hiçbir uyarı üretmez, çünkü olay yazılmamıştır. Bonus 0 olsa bile çarpan yolu yine tavansız ve görünmez (bu kısım sezon özelliğinden bağımsız, önceden var olan bir açık; sezon bonusu yalnızca büyütüyor).
- **Not:** Admin'in kendisi güvenilir aktör; ancak somut etki (yanlış giriş + bayi tarafı tekrarı ile kontrolsüz mint ve dedektör körlüğü) gerçek. Önem: YÜKSEK.
- **Doğru düzeltme:** Tüketim kredisini tek bir Serializable transaction'a taşı: `creditPointsAndXp` + `addToSquadTreasury` + `points_credited` (`category: 'consumption'`, `seasonalCampaignId/seasonalBonus` alanlarıyla) + tüketim kaynaklı günlük tavan (`lib/points-caps` içinde kaynak-bazlı tavan). Bonusu "kullanıcı başına kampanya penceresinde bir kez" veya "günde bir kez" olacak şekilde idempotent anahtarla (ör. `SeasonalBonusClaim @@unique([userId, campaignId, dayKey])`) sınırla; API'de `bonusPoints` üst sınırını ekonomiyle uyumlu bir değere (ör. ≤ 500) indir ve arayüzde etki önizlemesi + yüksek değer onayı göster; `page.tsx:115` metnini gerçeğe göre düzelt.

---

## Uygulama (Dalga 2)

**Hedef rota:** `/admin/campaigns-calendar` (Kampanya Takvimi). `/admin/seasonal-campaigns` artık sorgu parametrelerini koruyarak `?layer=campaign` ile kalıcı yönlenir (`permanentRedirect`). Eski `app/api/admin/seasonal-campaigns` ucu silindi; yerine `defineRoute` ile yazılmış BFF geldi (`app/api/admin/campaigns-calendar/**`: takvim, sayfalı liste, detay, oluştur/düzenle, yayına al/duraklat, arşivle/geri al, önizleme, rozet seçenekleri). Tüm uçlar ADMIN, zod, rate limit; düzenleme ve durum değişikliği `baseVersion` taşır, çakışmada 409.

Dosyalar: `lib/campaigns-calendar/{contract,server}.ts`, `components/admin/a-kampanya-takvimi/*`, `app/admin/campaigns-calendar/page.tsx` (sunucu ön yüklemesi), `lib/seasonal-campaign-constants.ts`, `__tests__/lib/campaigns-calendar.test.ts` (30 test).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Yetki | ÇALIŞIYOR | Sayfa `requireAuth(['ADMIN'])` ile ön yükler; her uç `defineRoute({ roles: ['ADMIN'] })`. |
| 2 | Başlık | ÇALIŞIYOR | QDL `PageHeader` (compact, ops kaydı). Hero yerine canlı durum şeridi. |
| 3 | Ad | ÇALIŞIYOR | `maxLength=120`, paylaşılan zod şeması istemcide anında Türkçe alan hatası verir. |
| 4 | Tür | ÇALIŞIYOR | "Hedef kitle" olarak Türkçe etiketli (Sezonluk, Özel, Doğum günü, Üyelik yıl dönümü) ve her biri için ne yaptığı yazıyor. Seçici P0-21'den beri BIRTHDAY/ANNIVERSARY'yi yalnız ilgili kullanıcıya uyguluyor; takvim hedefli kampanyayı "Canlı · hedefli" diye ayrı gösterir, herkese açık kazananı belirlemez. |
| 5 | Açıklama | ÇALIŞIYOR | "Müşteriye görünen açıklama" diye etiketli; canlı kart önizlemesinde görünür. |
| 6 | Çarpan | ÇALIŞIYOR | `1,5` ve `1.5` kabul. Boş/0 artık sessizce 1,5'e dönmüyor, Türkçe hatayla reddediliyor. Aralık (1–3) alan yardımında. |
| 7 | Bonus | ÇALIŞIYOR | Üst sınır 250 (P0-21) ve alan yardımında yazıyor. Tüketim yolu artık `mintPoints` + `dealer_passive` tavanı + `points_credited` ile çalışıyor (B1 şeridi). 100 ve üstü bonusta tavan uyarısı var. |
| 8 | Başlangıç | ÇALIŞIYOR | `datetime-local` İstanbul duvar saati olarak yorumlanır (UTC+3). Etikette yazar, süre de gösterilir. |
| 9 | Bitiş | ÇALIŞIYOR | `min` niteliği var; istemci ve sunucu aynı şemayla bitiş > başlangıç kontrolü yapar. |
| 10 | Oluştur + kaydediliyor | ÇALIŞIYOR | Geçersiz tarih artık RangeError atmıyor (`istanbulLocalToIso` null döner, şema reddeder). `Idempotency-Key` gönderildiği için çift tıklama mükerrer kayıt üretmez. |
| 11 | Zorunlu alan kontrolü | ÇALIŞIYOR | Alan bazlı hata, `aria-invalid` + `aria-describedby`. |
| 12 | Sunucu hata mesajı | ÇALIŞIYOR | Türkçe zod mesajları; zarf v2 `details` alanlara eşlenir. |
| 13 | Form sıfırlama | ÇALIŞIYOR | Her açılışta çekmece temiz taslakla başlar. Kaydedilmemiş değişiklikte kapanış onay ister. |
| 14 | Liste | ÇALIŞIYOR | Sunucuda sayfalı (10'ar), arama, durum filtresi. |
| 15 | Yükleniyor | ÇALIŞIYOR | `QueryState` statik iskelet; yeniden çekimde `aria-busy`. |
| 16 | Boş durum | ÇALIŞIYOR | Filtreye göre yönlendiren metin + başlıkta "Kampanya" düğmesi. |
| 17 | Hata durumu | ÇALIŞIYOR | `r.ok` + zarf kontrolü, "Tekrar dene"li hata kartı. Hata artık "kampanya yok" gibi görünmüyor (B4). |
| 18 | Satır | ÇALIŞIYOR | Tarih + saat (İstanbul), etki özeti, hedef kitle, bütçe kullanımı ve türetilmiş durum rozeti (ikon + metin). |
| 19 | Aç/kapat | ÇALIŞIYOR | "Yayına al / Duraklat" onaylı (`ConfirmAction`, etki satırı), bekleme durumu var, sürümlü (409). |
| 20 | Aç/kapat onayı | ÇALIŞIYOR | Bkz. #19. |
| 21 | Düzenleme | ÇALIŞIYOR | Sağdan açılan çekmece, aynı form. Canlı ekonomiyi etkileyen kayıtta gerçek defter verisiyle etki onayı istenir. |
| 22 | Silme/arşiv | ÇALIŞIYOR | Gerekçeli arşiv: kampanya pasifleşir ve listeden çıkar, kayıt silinmez, geri alınabilir (duraklatılmış döner). Şemada `archivedAt` olmadığından arşiv kaydı `Settings['campaignsCalendarArchive']` içinde (ŞEMA İSTEĞİ aşağıda). |
| 23 | Görev (challenge) tanımlama | ÇALIŞIYOR | Tür, hedef, ödül puanı (en fazla 1000, çünkü `seasonal_challenge` kredisi tavansız) ve etkin rozet seçici. Rozet sunucuda doğrulanır. Detayda görev ödülü alan kişi sayısı ve basılan puan gösterilir (B3). |
| 24 | Görsel | ÇALIŞIYOR | `https://` zorunlu görsel adresi alanı. |
| 25 | İndirim (`discount`) | KALDIRILDI | Okuyucusu yok. Yeni şemada alan yok; DB kolonu dokunulmadan duruyor (ŞEMA İSTEĞİ: kolonu düşür). |
| 26 | Koşullar | ÇALIŞIYOR | Tipli: `minLevel` ve yeni `budgetPoints`. Tanınmayan koşulu olan eski kayıt detayda "seçici uygulamıyor" uyarısıyla görünür. |
| 27 | Durum filtresi | ÇALIŞIYOR | Tümü · Yayında · Planlı · Duraklatıldı · Bitti · Arşiv (URL'de). |
| 28 | "Şu an canlı" göstergesi | ÇALIŞIYOR | Üst şerit: canlı kazanan, kalan süre, açık hedefli kampanya sayısı, sıradaki kampanya. |
| 29 | Çakışma uyarısı | ÇALIŞIYOR | Örtüşen herkese açık kampanyalarda kazanan ve kaybolan bonus yazılır; zaman çizelgesinde çakışma aralığı renkli zeminle, gölgede kalan bar taralı. Önizleme, kaydetmeden önce aynı analizi yapar. |
| 30 | Etki analitiği | ÇALIŞIYOR | Detayda puan defterinden (`meta.seasonalCampaignId`) basılan puan, kazanım sayısı, etkilenen müşteri, kaynak kırılımı. Üst şeritte bugün kampanyalı basılan puan. |
| 31 | Denetim kaydı | ÇALIŞIYOR | Tam önce/sonra + `changedFields`; detayda "Değişiklik geçmişi" (kim, ne zaman, ne değişti, arşiv gerekçesi). |
| 32 | Kural metni | ÇALIŞIYOR | "Uygulandığı yollar: geri bildirim ve tüketim pasif puanı, ikisi de günlük tavana tabi" ve tek kampanya kuralı. Tüketim yolu artık gerçekten tavanlı olduğu için doğru. |
| 33 | i18n | KISMİ | Metinler Türkçe ve tam Türkçe karakterli. Sayfa `t()` anahtarlarına taşınmadı, çünkü admin panelinin geri kalanı da sabit TR. |
| 34 | Mobil | ÇALIŞIYOR | `PanelPage` (fazladan `p-6` yok). Zaman çizelgesi yatay kayar, liste satırları yığılır, çekmece alttan açılır, dokunma hedefleri ≥ 44px. |
| 35 | Etiket-alan bağı | ÇALIŞIYOR | Her alanda `htmlFor`/`id`, hata ve yardım `aria-describedby` ile bağlı. |
| 36 | İkon düğme erişilebilirliği | ÇALIŞIYOR | Metinli düğmeler; durum rozeti ikon + metin; zaman çizelgesi barları tam `aria-label` taşıyan düğmeler. |
| 37 | Toast | ÇALIŞIYOR | `sonner` + `announce()` (ekran okuyucu). |

### Kapanan bulgular (10/11)
- **B1:** Hedefli tür artık herkese uygulanmıyor (P0-21 seçicisi); takvim hedefli kampanyayı ayrı gösteriyor.
- **B2:** Tüketim tavanı ve `points_credited` B1 şeridinde kapandı; arayüz metni artık doğru. Ayrıca kampanya **puan bütçesi** eklendi.
- **B3:** Görev editörü.
- **B4:** Hata görünür.
- **B5:** Canlı/gölgede/planlı durumu, zaman çizelgesi, çakışma.
- **B6:** Düzenleme, arşiv, onaylı aç/kapat.
- **B7:** Tam denetim kaydı + geçmiş.
- **B8:** Erişilebilirlik.
- **B9:** Türkçe tür ve mesajlar.
- **B10:** Paylaşılan şema, sessiz varsayılan yok, saat dilimi, tarih + saat.

B11 kapanmadı (bkz. Kalanlar).

**Yeni: bütçe / yumuşak tavan.** `conditions.budgetPoints` (100 – 10.000.000). Seçici (`lib/seasonal-campaign-live`) bütçesi dolan kampanyayı atlar ve sıradaki uygun kampanyaya düşer. Harcanan miktar, defterde o kampanyanın uygulandığı `posted` satırların toplamıdır. Takvimde "Bütçe doldu" durumu, detayda ilerleme çubuğu ve önizlemede tahmini dolma süresi gösterilir.

### Kalanlar
- **B11 (aktif kampanya önbelleği):** Kapanmadı. Kazanım yolunda her olayda hafif bir sorgu yapılıyor; bütçeli kampanyada buna bir toplama sorgusu ekleniyor. Redis katmanı B şeridinin işi.
- **Bütçe yumuşak tavandır:** Kilitsiz okunduğu için eşzamanlı birkaç kazanım kadar aşılabilir.
- **Segment / bölge / bayi hedeflemesi:** Yapılmadı. Hedefleme sözlüğü için seçicide gerçek veri kaynağı gerekiyor.
- **i18n anahtarları:** Sayfa metinleri `t()` anahtarlarına taşınmadı.
- **ŞEMA İSTEKLERİ:** `SeasonalCampaign.archivedAt DateTime?` (Settings'teki arşiv haritasının yerine), `SeasonalCampaign.updatedAt` (içerik özeti sürümünün yerine), `discount` kolonunun düşürülmesi, `PointsLedger` üzerinde `(meta->>'seasonalCampaignId')` ifade indeksi (etki ve bütçe sorguları için).
