# /admin/features

**Amaç:** Platform operatörünün "özellik bayrağı" (feature flag) kayıtlarını listeleyip oluşturduğu, açıp kapattığı ve sildiği ekran. Sayfanın kendi açıklaması: "Yeni özellik ekleyip aç/kapat yaparak modülleri canlıda kontrollü yayınlayabilirsiniz" (`app/admin/features/page.tsx:192`).

**Genel puan:** 3.5/10

**Karar:** **birleştir.** Bu sayfa `/admin/modules` (gerçek modül anahtarı) ile birleşmeli ya da gerçek bir değerlendirme katmanıyla yeniden inşa edilmeli. Bugünkü hâliyle yazdığı bayrakları platformda hiçbir kod okumuyor. Ekran bir kontrol paneli gibi görünüyor ama hiçbir şeyi kontrol etmiyor.

> Ana bulgu: `prisma.featureFlag` modeli yalnız şu yerlerde kullanılıyor: bu sayfanın CRUD API'si (`app/api/admin/features/route.ts`), iki sayaç ucu (`app/api/admin/modules/overview/route.ts:37`, `app/api/admin/tech-summary/route.ts:19-20`), süre dolunca kapatan temizlik işi (`app/api/internal/inngest/feature-flag-cleanup/route.ts:13`) ve seed (`prisma/seed.ts:676-735`). Kod tabanında `isFeatureEnabled`, `getFeatureFlag`, `useFeature` ya da benzeri bir okuyucu yok. Bu sonuç `featureFlag|FeatureFlag|isFeatureEnabled|getFeatureFlag|useFeature|feature-flag` için tüm `.ts/.tsx/.js` dosyalarında yapılan büyük/küçük harf duyarsız aramayla doğrulandı (node_modules, .next ve generated-prisma-client hariç). Gerçek aç/kapa mekanizması ayrı bir sistem: `Settings.moduleControls` + `assertModuleEnabled()` (`lib/module-gate.ts:92`). Bu sistem 55 API çağrı noktasında uygulanıyor ve `/admin/modules` ekranından yönetiliyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 2/10 | CRUD teknik olarak çalışıyor, ama bayrakları hiçbir çalışma zamanı kodu okumadığı için aç/kapa'nın ürüne etkisi sıfır. Düzenleme, süre sonu ve sahip alanları UI'da yok. |
| UX | 4/10 | Tek ekranda sade bir liste var. Ancak silmede onay yok, sil düğmesi hover'a bağlı, gönderimde bekleme durumu yok, boş durum ile arama sonucu yok durumu ayrılmıyor ve yanıltıcı bir açıklama metni var. |
| Görsel | 5/10 | Panelin genel `Card glass` diliyle tutarlı ve temiz. Ama bilgi yoğunluğu düşük: tarih, sahip, ortam, son değiştiren gibi bilgiler gösterilmiyor. 3 istatistik kartı anlam taşımayan sayılar gösteriyor. |
| Mimari | 2/10 | İkinci bir "aç/kapa" sistemi gibi duruyor ama tüketicisi yok (ölü veri modeli). API'de toggle `id` ile, silme `key` ile yapılıyor. Mutasyon ile audit log aynı işlemde (transaction) değil. Kontrol-sonra-oluştur yarışı var. |
| Performans | 7/10 | Küçük bir veri kümesi, tek GET, istemci tarafında filtreleme. Kabul edilebilir. SWR, önbellek ve yeniden doğrulama yok, ama bu ölçekte sorun yaratmaz. |
| Erişilebilirlik + mobil | 4/10 | Switch'lerin erişilebilir adı yok. `Label`'lar input'a bağlı değil. Sil düğmesi dokunmatik ekranda ve klavye odağında görünmez ama tıklanabilir. 400px'te 3 sütunlu istatistik ızgarası sıkışıyor. Azaltılmış hareket desteği global `MotionConfig` ile karşılanıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa başlığı ("Özellik Yönetimi") | ÇALIŞIYOR | `app/admin/features/page.tsx:182-185` | `PageHeader` ortak bileşen. Metin sabit Türkçe, i18n yok. |
| 2 | "Özellik mantığı" bilgi kartı | SAHTE | `page.tsx:190-193` | Bayrakların "modülleri canlıda kontrollü yayınladığını" iddia ediyor. Hiçbir modül FeatureFlag okumuyor (bkz. Bulgu 1). |
| 3 | "Teknoloji Ekle ekranını aç" linki | KISMİ | `page.tsx:195-197` → `app/admin/tech/add/page.tsx:46-80` | Link çalışıyor ama aynı POST'u yapan kopya bir form ekranına götürüyor. `/admin/tech` kök sayfası yok, yalnız `add` var. |
| 4 | İstatistik: Toplam | ÇALIŞIYOR | `page.tsx:174-175, 210` | Sayı doğru. |
| 5 | İstatistik: Aktif | KISMİ | `page.tsx:176, 223` | Sayı doğru ama "aktif" kelimesi ürün etkisi varmış izlenimi veriyor. |
| 6 | İstatistik: Pasif | KISMİ | `page.tsx:177, 236` | Aynı sorun. |
| 7 | Arama (ad + key) | KISMİ | `page.tsx:169-172, 248-253` | Açıklamada aramıyor. `toLowerCase()` Türkçe yerelini dikkate almıyor ("İ"/"I"). Sonuç sayısı ve temizleme düğmesi yok. |
| 8 | "Yeni Özellik" dialog'u | ÇALIŞIYOR | `page.tsx:255-312` | shadcn Dialog, odak tuzağı ve Esc çalışıyor. |
| 9 | Key alanı + otomatik normalleştirme | KISMİ | `page.tsx:274`, `route.ts:12` | Yalnız boşlukları `_` yapıp küçük harfe çeviriyor. Format kuralı (`^[a-z0-9_]+$`) yok, `maxLength` yok. Sunucuda da regex yok, "ö", "-", "." gibi karakterler kabul ediliyor. |
| 10 | Özellik adı alanı | ÇALIŞIYOR | `page.tsx:280-284` | İstemci tarafında doğrulama yok, sunucu `min(1)` ile kontrol ediyor. |
| 11 | Açıklama alanı | ÇALIŞIYOR | `page.tsx:288-292` | 500 karakter sınırı yalnız sunucuda var (`route.ts:14`), sayaç yok. |
| 12 | Varsayılan durum switch'i | KISMİ | `page.tsx:67, 296-299` vs `route.ts:15` | UI varsayılanı `true`, API varsayılanı `false`. Yeni bayrak üretimde açık doğuyor. Sektör standardı kapalı başlatmaktır. |
| 13 | İptal | ÇALIŞIYOR | `page.tsx:302-307` | Formu sıfırlıyor. Overlay veya Esc ile kapatınca taslak korunuyor (tutarsız ama zararsız). |
| 14 | Oluştur (POST) | KISMİ | `page.tsx:113-132, 308` | Bekleme durumu ve disable yok (çift tıklama iki istek atar). Zod'un İngilizce hata mesajları ("String must contain at least 1 character(s)") toast'ta görünüyor (`route.ts:70`). |
| 15 | Yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:316-329` | 6 kartlık `animate-pulse`. |
| 16 | Boş durum | KISMİ | `page.tsx:330-336` | "Hiç bayrak yok" ile "aramayla eşleşen yok" aynı mesajı gösteriyor. Oluştur çağrısı (CTA) yok. |
| 17 | Hata durumu | KISMİ | `page.tsx:81-89` | Yalnız toast gösteriliyor. Liste boşaltılıp "Özellik bulunamadı" çiziliyor, yani hata boş veriymiş gibi görünüyor. Yeniden dene düğmesi yok. |
| 18 | Kart ikonu (key'den tahmin) | KISMİ | `page.tsx:159-167` | `includes('ai')` alt dize eşleşmesi. `email_digest`, `maintenance`, `detail_view` gibi anahtarlara AI ikonu (Sparkles) atanıyor. |
| 19 | Kart içeriği (ad, açıklama, key rozeti) | ÇALIŞIYOR | `page.tsx:356-360` | Uzun key için `break-all` yok, taşma riski var. Açıklama kırpılmıyor (clamp yok). |
| 20 | Aç/kapa Switch (PATCH) | SAHTE | `page.tsx:93-111, 363-366`, `route.ts:187-232` | DB'ye yazıyor ve audit tutuyor, ama hiçbir okuyucu olmadığı için ürün davranışını değiştirmiyor. Ayrıca bayat closure (stale closure) hatası var (Bulgu 5). |
| 21 | Sil (DELETE) | BOZUK | `page.tsx:134-148, 370-379`, `route.ts:237-285` | Onay sormuyor, geri alınamıyor. `opacity-0 group-hover:opacity-100` yüzünden dokunmatik ekranda ve klavye odağında görünmüyor ama tıklanabilir durumda. |
| 22 | Kart giriş animasyonu (stagger) | ÇALIŞIYOR | `page.tsx:342-347`, `components/providers.tsx:232` | `m as Motion` doğru kullanılmış. `MotionConfig reducedMotion="user"` sayesinde azaltılmış hareket tercihine uyuluyor. |
| 23 | Denetim kaydı (audit log) | KISMİ | `route.ts:96-106, 164-175, 216-226, 266-275` | Yazılıyor ama mutasyonla aynı işlemde değil (Bulgu 6). Kayıtlar bu sayfada görüntülenmiyor. |
| 24 | Yetki: proxy admin kapısı + `requireAuth(['ADMIN'])` | ÇALIŞIYOR | `proxy.ts:51, 79-84`, `lib/api-auth.ts:52-80`, `route.ts:40, 62, 125, 191, 241` | Tüm metotlar ADMIN'e kısıtlı, token-replay kontrolü var. IDOR yüzeyi yok (tek kiracılı admin verisi). |
| 25 | Süre sonu (`expiresAt`) + otomatik kapanma | KISMİ | `prisma/schema.prisma:980`, `route.ts:17, 89`, `app/api/internal/inngest/feature-flag-cleanup/route.ts:13-20`, `lib/inngest/functions.ts:124-132` | Backend hazır, UI'da alan yok. Temizlik işi saatlik bir Inngest cron'una bağlı. Inngest'in prodda canlı olup olmadığı *doğrulanmadı* (bkz. `docs/audit/2026-10-08/sistem/arka-plan-sistemleri.md` K2). |
| 26 | Düzenleme (ad, açıklama, süre, metadata) | EKSİK | `route.ts:116-183` (PUT) | API var, UI'da çağıran yok. Bayrak oluşturulduktan sonra adı veya açıklaması değiştirilemiyor. |
| 27 | Sahip (`ownerId`) ve `metadata` | EKSİK | `schema.prisma:981-982`, `route.ts:90-91` | Sahip olarak sessizce oluşturan admin atanıyor ama hiçbir yerde gösterilmiyor. |
| 28 | Çalışma zamanı değerlendirme (sunucu/istemci SDK) | EKSİK | `lib/` altında `*flag*` / `*feature*` dosyası yok | Bayrak sisteminin asıl amacı olan okuma katmanı hiç yazılmamış. |
| 29 | `feature_flags` modül kill-switch'i | SAHTE | `lib/module-controls.ts:49` | `/admin/modules`'da "critical" olarak listeleniyor ama `assertModuleEnabled('feature_flags')` hiçbir yerde çağrılmıyor. Kapatmak bu sayfayı veya API'yi etkilemiyor. |
| 30 | Son güncellenme / oluşturulma zamanı | EKSİK | `page.tsx:45` vs `schema.prisma:974-988` | İstemci arayüzünde `createdAt` alanı var, şemada yok (hayalet alan). `updatedAt` mevcut ama gösterilmiyor. |
| 31 | Değişiklik geçmişi ("kim, ne zaman açtı") | EKSİK | — | Audit yazılıyor ama sayfada zaman çizelgesi yok. |
| 32 | i18n (EN/TR) | EKSİK | `page.tsx` tamamı sabit TR | Sidebar `labelKey: 'features'` ile çevriliyor (`components/dashboard/sidebar.tsx:206`), sayfa ise çevrilmiyor. |
| 33 | Hedefleme / yüzdesel yayın / ortam / rol | EKSİK | — | Bayrak yalnızca global bir boolean. |
| 34 | Admin ana sayfa özet kartı ("X açık · Y kapalı") | KISMİ | `app/admin/admin-dashboard-client.tsx:569`, `app/api/admin/tech-summary/route.ts:19-20` | Sayılar doğru, anlamı yanıltıcı: "açık" bayrakların etkisi yok. |

**Durum dağılımı:** ÇALIŞIYOR 10 · KISMİ 13 · BOZUK 1 · SAHTE 3 · EKSİK 7 (toplam 34).

---

## Bulgular

### 1. Bayrakların hiçbir tüketicisi yok, sayfa etkisiz bir kontrol paneli
- **Önem:** kritik · **Kategori:** işlevsellik / mimari / veri bütünlüğü
- **Kanıt:** `prisma.featureFlag` okumaları yalnız `app/api/admin/features/route.ts:43`, `app/api/admin/modules/overview/route.ts:37` ve `app/api/admin/tech-summary/route.ts:19-20`'de var, hepsi admin sayımı. Değer okuyan bir yardımcı (`isFeatureEnabled` vb.) yok. Bilgi kartı ise tersini söylüyor (`page.tsx:192`). Seed'deki `dark_mode`, `vip_club`, `ai_analysis`, `push_notifications`, `leaderboard` (`prisma/seed.ts:676-735`) hiçbir davranışa bağlı değil. Canlı DB'de bu kayıtların bulunup bulunmadığı *doğrulanmadı* (DB'ye dokunulmadı).
- **Sorun:** Operatör `ai_analysis`'i kapattığında AI analizinin durduğunu düşünür, ama durmaz. Bir olay anında kill-switch diye bu ekrana gelen admin yanlış güven duygusuyla vakit kaybeder. Ana sayfa "N açık" diye raporlayarak yanılgıyı pekiştiriyor (`admin-dashboard-client.tsx:569`).
- **Öneri:** İki yoldan birini seçin, ikisini birden değil:
  - **(A) Birleştir (önerilen).** Platformun gerçek anahtarı `moduleControls` + `assertModuleEnabled` (55 noktada uygulanıyor). FeatureFlag tablosunu emekliye ayırın. `/admin/modules`'a "Deneysel bayraklar" sekmesi ekleyin ve bayrakları `MODULE_CATALOG` gibi kodda tanımlı bir kataloğa bağlayın. Böylece "kodda okunmayan bayrak" oluşturmak yapısal olarak imkânsız hale gelir. Ana sayfa kartını ve `tech-summary` sayaçlarını modül sayımına çevirin.
  - **(B) Gerçek flag sistemi inşa et.** `lib/flags.ts` içinde `getFlag(key, ctx)` yazın: `unstable_cache` + `revalidateTag('feature-flags')` ile `module-gate`'teki desen, DB hatasında fail-safe varsayılan, Upstash'te sıcak katman. İstemci için `useFlag()` hook'u ve `/api/flags` (yalnızca istemciye açık bayraklar) ekleyin. Kodda kayıtlı bir `FLAG_REGISTRY` (key, varsayılan, sahip, açıklama) tutun. UI yalnız kayıtlı anahtarlar için satır göstersin, kayıtsız DB satırları "yetim" diye işaretlensin.
  - İki yolda da bilgi kartındaki iddia tüketici var olana kadar kaldırılmalı.
- **Efor:** A: M · B: L

### 2. Silme onaysız, geri alınamaz; düğme dokunmatik ve klavyede görünmez
- **Önem:** yüksek · **Kategori:** UX / erişilebilirlik / veri bütünlüğü
- **Kanıt:** `page.tsx:370-379` (`opacity-0 group-hover:opacity-100`, `focus-visible` durumu yok), `page.tsx:134-148` (onay yok), `route.ts:261` (hard delete).
- **Sorun:** Mobilde kartın alt kısmına yapılan bir dokunuş, görünmeyen "Sil" düğmesine basar ve kaydı anında kalıcı olarak siler. Klavye kullanıcısı Tab ile görünmeyen bir düğmeye odaklanır. Bayraklar gerçek bir sisteme bağlandığında (Bulgu 1-B) bu, üretimde kod yolunun sessizce varsayılana düşmesi demek.
- **Öneri:** Silmeyi bir `⋯` satır menüsüne taşıyın. `AlertDialog` ile key'i yazdırarak onay alın (Linear/Vercel deseni). Sunucuda soft-delete (`archivedAt`) ve 30 günlük geri yükleme ekleyin. Kayıtlı (registry'de bulunan) bir bayrağın silinmesini engelleyip yalnız arşivlemeye izin verin. Düğmeye `focus-visible:opacity-100` ekleyin ve `@media (hover:none)` durumunda her zaman görünür yapın.
- **Efor:** S (onay + görünürlük) / M (soft-delete)

### 3. Yeni bayrak üretimde açık doğuyor (UI ile API varsayılanları çelişiyor)
- **Önem:** yüksek · **Kategori:** güvenli varsayılan
- **Kanıt:** `page.tsx:67` ve `page.tsx:155` (`isEnabled: true`), `route.ts:15` (`default(false)`), `app/admin/tech/add/page.tsx:32` (o da `true`).
- **Sorun:** Bayrak sisteminin temel sözleşmesi "kapalı yayınla, kontrollü aç"tır. İki UI'ın varsayılanı bunun tersi, API'ninki doğru. Böylece aynı işlem için iki farklı gerçeklik oluşuyor.
- **Öneri:** Varsayılanı `false` yapın ve switch'in yanına "Oluşturulduktan sonra listeden açabilirsiniz" ipucunu ekleyin. Açık oluşturmak için ayrı bir onay isteyin.
- **Efor:** S

### 4. `feature_flags` modül kill-switch'i sahte
- **Önem:** orta · **Kategori:** yetki / tutarlılık
- **Kanıt:** `lib/module-controls.ts:49` (`severity: 'critical'`, `detailHref: '/admin/features'`). `assertModuleEnabled('feature_flags')` hiçbir route'ta yok (arama: `feature_flags` yalnız `module-controls.ts` ve `modules/overview/route.ts:54`'te geçiyor).
- **Sorun:** `/admin/modules`'da "kritik" etiketli bir anahtar hiçbir şeyi kapatmıyor. Operatöre ikinci bir yanlış sinyal veriyor.
- **Öneri:** Bulgu 1-A seçilirse katalog girdisini kaldırın. 1-B seçilirse `/api/admin/features` handler'larına `assertModuleEnabled('feature_flags', { role: 'system' })` ekleyin ve sayfada kapalılık durumunu banner ile gösterin.
- **Efor:** S

### 5. Bayat closure (stale closure): eşzamanlı işlemler birbirini ezer
- **Önem:** orta · **Kategori:** hata / yarış koşulu
- **Kanıt:** `page.tsx:104` `setFeatures(features.map(...))`, `page.tsx:143` `setFeatures(features.filter(...))`. Her ikisi de render anındaki `features` dizisini kullanıyor.
- **Sorun:** A kartını açıp yanıt gelmeden B kartını açarsanız, B'nin `then`'i A öncesi dizi üzerinden `setFeatures` yapar. A'nın UI değişikliği geri alınır, DB'de ise açık kalır. Aynı durum toggle ile silmenin üst üste binmesinde de oluşur (silinen kart geri gelir). Switch'te bekleme durumu da yok (`page.tsx:363-366`). Kullanıcı ağ gecikmesinde hiçbir geri bildirim görmüyor.
- **Öneri:** Fonksiyonel güncelleyici kullanın (`setFeatures(prev => prev.map(...))`). Daha iyisi, veri katmanını SWR/React Query'ye taşıyıp `mutate` ile iyimser güncelleme + hata durumunda geri alma yapın. Satır başına `pendingIds` set'i tutup switch'i `disabled` + spinner ile gösterin. Sunucunun döndürdüğü `feature` nesnesiyle state'i senkronlayın, istemci tahmini yerine.
- **Efor:** S

### 6. Mutasyon ve audit log aynı işlemde değil; sunucu başarılıyken UI hata gösterebilir
- **Önem:** orta · **Kategori:** veri bütünlüğü / hata yönetimi
- **Kanıt:** `route.ts:209-226` (PATCH: `update` sonra ayrı `auditLog.create`), benzer şekilde `route.ts:83-106`, `158-175`, `261-275`. Hepsi tek bir `try/catch` → 500.
- **Sorun:** Audit yazımı başarısız olursa bayrak değişmiş olur ama istemci 500 alır. `toggleFeature` state'i güncellemez (`page.tsx:101-103`), yani UI DB ile uyumsuz kalır. Silmede ise kayıt silinmiş ama denetim izi yazılmamış olabilir; bu, denetlenebilirlik açığı demek.
- **Öneri:** `prisma.$transaction([update, auditLog.create])` kullanın, ya da projedeki outbox desenine (`OutboxEvent`) taşıyın. Yanıtta güncel `feature`'ı döndürüp istemciyi ona senkronlayın.
- **Efor:** S

### 7. Oluşturma akışı: kontrol-sonra-yaz yarışı, bekleme durumu yok, İngilizce doğrulama mesajları, format kuralı yok
- **Önem:** orta · **Kategori:** hata yönetimi / dil karışıklığı
- **Kanıt:** `route.ts:74-92` (findUnique → create; eşzamanlı istekte `P2002` → genel 500 "oluşturulamadı"). `page.tsx:308` (Oluştur düğmesi hiç disable olmuyor). `route.ts:12-13, 70` (zod varsayılan mesajları İngilizce, örneğin "String must contain at least 1 character(s)", ve `lib/admin-toast.ts:20` bunu "Dikkat: " önekiyle gösteriyor). `page.tsx:274` ve `route.ts:12` (key için regex yok). Ek olarak `lib/admin-toast.ts:18` öneki "Basarili:" Türkçe karaktersiz.
- **Sorun:** Çift tıklamada önce "oluşturuldu", ardından "Bu key zaten kullanılıyor" toast'ı görünüyor. Boş form gönderildiğinde İngilizce teknik bir mesaj çıkıyor. Kodda kullanılacak bir anahtara `ö`, `-`, `.` girilebiliyor.
- **Öneri:** Formu `react-hook-form` + paylaşılan `zod` şemasına geçirin (istemci ve sunucu aynı şema, Türkçe mesajlar). Key için `^[a-z][a-z0-9_]{2,49}$` kuralı ve canlı benzersizlik kontrolü (debounce'lu GET) ekleyin. Sunucuda `P2002`'yi yakalayıp 409 döndürün. Gönderim sırasında düğmeyi disable edip spinner gösterin. `admin-toast` öneklerini "Başarılı" olarak düzeltin.
- **Efor:** S-M

### 8. Hata durumu boş veri gibi görünüyor; boş durum ile arama sonucu yok ayrışmıyor
- **Önem:** orta · **Kategori:** UX
- **Kanıt:** `page.tsx:81-89` (hatada `setFeatures([])`), `page.tsx:330-336` (tek bir "Özellik bulunamadı" mesajı). Ayrıca `res.json()` çağrısı `res.ok` kontrolünden önce yapılıyor (`page.tsx:78, 100, 121, 139`). JSON olmayan bir yanıtta (ağ geçidi HTML'i) toast'ta "Unexpected token <" çıkar.
- **Öneri:** Üç durumu ayırın: (a) yükleme hatası → satır içi hata kartı + "Yeniden dene", (b) hiç bayrak yok → açıklayıcı boş durum + "İlk bayrağı oluştur" CTA'sı, (c) aramayla eşleşen yok → "'x' için sonuç yok · Aramayı temizle". JSON parse'ını güvenli bir yardımcıya taşıyın.
- **Efor:** S

### 9. Düzenleme, süre sonu ve sahiplik backend'de var, UI'da yok
- **Önem:** orta · **Kategori:** işlevsellik eksikliği
- **Kanıt:** PUT ucu `route.ts:116-183` hiçbir istemciden çağrılmıyor (`tech/add` yalnız POST yapıyor). `expiresAt`, `ownerId`, `metadata` alanları şemada var (`schema.prisma:980-982`), UI'da yok. Saatlik temizlik işi var (`feature-flag-cleanup/route.ts`) ama hiçbir bayrağın `expiresAt`'i UI'dan ayarlanamıyor, yani iş fiilen hep 0 kayıt kapatıyor (Inngest'in canlı olup olmadığı *doğrulanmadı*).
- **Öneri:** Kart veya satır tıklanınca bir sağ panel (Sheet) açılsın: ad/açıklama düzenleme, sahip seçici (admin kullanıcı arama), "son kullanma tarihi" (geçici bayrak) ve "eski bayrak" uyarısı (30 gündür %100 açık veya kapalı → "koddan temizle" önerisi). Kaydetme PUT ile yapılsın.
- **Efor:** M

### 10. Erişilebilirlik: adsız switch'ler, bağlanmamış etiketler
- **Önem:** düşük-orta · **Kategori:** erişilebilirlik
- **Kanıt:** `page.tsx:363-366`: Switch'te `aria-label` yok, ekran okuyucu yalnız "anahtar, açık" der, hangi bayrak olduğunu söylemez. `page.tsx:271, 279, 287, 295`: `<Label>` için `htmlFor` yok, input'ta `id` yok.
- **Öneri:** `aria-label={`${feature.name} bayrağını ${feature.isEnabled ? 'kapat' : 'aç'}`}` ekleyin. Label ve input'u `id`/`htmlFor` ile bağlayın. Toggle sonrası durumu `aria-live="polite"` bölgesinde duyurun.
- **Efor:** S

### 11. İkon tahmini alt dize eşleşmesiyle yanlış sınıflandırıyor
- **Önem:** düşük · **Kategori:** görsel doğruluk
- **Kanıt:** `page.tsx:161`: `lowerKey.includes('ai')`. `email_*`, `maintenance_*`, `detail_*`, `available_*` gibi anahtarlar Sparkles (AI) ikonu alır.
- **Öneri:** İkonu tahmin etmek yerine bayrağa açık bir `category` alanı ekleyin (`metadata.category` veya registry). Kategoriye göre gruplama ve filtre de bu alandan gelsin.
- **Efor:** S

### 12. Mobil yerleşim: 3 sütunlu istatistik ızgarası ve taşma
- **Önem:** düşük · **Kategori:** mobil
- **Kanıt:** `page.tsx:202` (`grid-cols-3`, kırılım yok, kart içi `p-4` + ikon + `text-2xl`). `page.tsx:358-360` (key rozetinde `break-all` / `truncate` yok).
- **Öneri:** İstatistikleri mobilde tek satırlık yoğun bir "chip" şeridine dönüştürün (`Toplam 12 · Açık 7 · Kapalı 5`). Bu sayılar aslında filtre görevi görmeli: tıklanınca listeyi o duruma göre süzsün. Key'i `font-mono truncate` + tam değeri tooltip'te gösterin.
- **Efor:** S

### 13. Kopya oluşturma akışı ve i18n eksikliği
- **Önem:** düşük · **Kategori:** bilgi mimarisi / tutarlılık
- **Kanıt:** `app/admin/tech/add/page.tsx:46-80` aynı POST'u ayrı bir formla yapıyor ve bu sayfa ona link veriyor (`page.tsx:195-197`). Sayfa metinlerinin tamamı sabit Türkçe. Komşu sayfalar (`app/admin/roadmap/page.tsx:142-146`) `t()` kullanıyor.
- **Öneri:** `/admin/tech/add`'deki "özellik bayrağı" bölümünü kaldırıp bu sayfanın dialog'una yönlendirin, ya da `tech/add`'i tamamen emekliye ayırın (webhook ve API anahtarı için zaten ayrı sayfalar var: `/admin/webhooks`, `/admin/api-keys`). Metinleri `messages/{tr,en}.json` altında `adminFeatures.*` anahtarlarına taşıyın.
- **Efor:** S

---

## Eksik özellikler (kıyas: LaunchDarkly / PostHog Feature Flags / Vercel Flags / Linear iç ayarları / Retool)

1. **Çalışma zamanı değerlendirme katmanı:** sunucu `getFlag()`, istemci `useFlag()`, önbellek ve etiketle geçersiz kılma, DB hatasında güvenli varsayılan. Bu olmadan diğer her şey anlamsız.
2. **Hedefleme ve kademeli yayın:** rol (CUSTOMER/DEALER/ADMIN), belirli kullanıcı veya bayi listesi, segment (`CustomerSegment` zaten var), yüzdesel rollout (kullanıcı id'sine göre deterministik hash), ortam (preview/production).
3. **Değişiklik geçmişi ve geri alma:** her bayrak için "kim, ne zaman, neyi neye çevirdi" zaman çizelgesi (AuditLog zaten yazılıyor, `entity='FeatureFlag'` filtresiyle gösterilebilir) ve tek tıkla önceki duruma dönüş.
4. **Yaşam döngüsü yönetimi:** sahip, son kullanma tarihi, "eski bayrak" tespiti (uzun süredir sabit), "kalıcı / geçici / kill-switch / deney" türleri, arşiv.
5. **Kullanım görünürlüğü:** bayrağın koddaki referans sayısı (build-time registry), son 24 saatteki değerlendirme sayısı ve açık/kapalı oranı (PostHog'a `$feature_flag_called` benzeri olay).
6. **Güvenli değişiklik akışı:** kritik bayrakta değişiklik nedeni (yorum) zorunluluğu, isteğe bağlı ikinci admin onayı, zamanlanmış açma/kapama.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör bir olay anında "AI analizini 30 saniyede kapatabiliyorum ve kapattığım an gerçekten kapanıyor" güvenini yaşamalı. Ekran, durumdan çok **etkiyi** göstermeli: "Bu anahtar şu 6 API ucunu ve şu 3 menüyü etkiler".

**Yerleşim (önerilen birleştirme sonrası `/admin/modules` → "Anahtarlar" tek merkezi):**
- **Üst şerit:** arama (ad/key/açıklama) + filtre chip'leri (Kapsam: müşteri/bayi/admin/platform · Tür: modül/deneysel/kill-switch · Durum: açık/kapalı/eski). Sayılar chip'lerin içinde olsun, ayrı istatistik kartlarına gerek yok.
- **Ana liste:** kart ızgarası yerine yoğun bir tablo (Linear/Stripe deseni). Sütunlar: ad + key (mono), kapsam rozeti, sahip avatarı, son değişiklik ("2 sa önce · Furkan"), etki sayısı, switch. Satır tıklanınca sağdan bir Sheet açılsın.
- **Sağ panel (Sheet):** üst kısımda açıklama ve düzenleme; ortada "Etkilediği yerler" (`endpointBindings` + menü öğeleri; `modules/overview/route.ts:60-80` bu veriyi zaten üretiyor); altta hedefleme kuralları (aşama 2) ve değişiklik geçmişi zaman çizelgesi.
- **Kritik anahtar kapatma:** onay dialog'unda etki listesi + "neden" alanı. Kapatıldıktan sonra üstte kalıcı bir sarı banner ("ai_features 14 dk'dır kapalı · Aç").

**Motion:** Ölçülü olmalı. Satır switch'inde 150 ms renk ve thumb geçişi, durum değişiminde satırın sol kenarında kısa bir renk vurgusu (300 ms), Sheet için standart slide-in. Kart stagger'ı bu tür yoğun bir tabloda gereksiz, kaldırılmalı. 3B veya dekoratif efekt uygun değil: bu bir operasyon aracı. `MotionConfig reducedMotion="user"` zaten mevcut.

**Veri ve API değişiklikleri:**
- (Birleştirme yolu) `GET /api/admin/modules/overview` uç noktası `updatedAt`, `updatedBy` (son audit kaydından) ve etki listesini satır bazında döndürsün. Modül değişikliği tekil `PATCH /api/admin/settings/modules/:key` ile, transaction içinde audit + `revalidateTag(MODULE_GATE_CACHE_TAG)` yapsın.
- FeatureFlag tablosu: veriler `moduleControls`'a taşınsın (yalnızca karşılığı olanlar), tablo bir sürüm boyunca salt okunur tutulup ardından migration ile kaldırılsın. `feature-flag-cleanup` işi ve `tech-summary` sayaçları buna göre güncellensin.
- (Gerçek flag yolu seçilirse) `FeatureFlag`'e `createdAt`, `archivedAt`, `kind`, `rules Json` (hedefleme), `rolloutPercent Int?` eklensin. `lib/flags.ts` ve `/api/flags` yazılsın. Kodda bir `FLAG_REGISTRY` bulunsun ve UI kayıtlı olmayan anahtarları "yetim" olarak göstersin.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/modules`** (`app/admin/modules/page.tsx`, `lib/module-controls.ts`, `lib/module-gate.ts`): asıl çalışan aç/kapa sistemi bu. 55 noktada uygulanıyor, cache etiketli ve rol görünürlüğüyle entegre. `/admin/features` kavramsal olarak bunun kopyası ama tüketicisi yok. **Öneri: `/admin/features` buraya bir sekme olarak birleştirilsin, eski rota 308 ile yönlendirilsin.**
- **`/admin/settings` (görünürlük ayarları)** (`app/api/admin/settings/visibility/route.ts`, `FEATURE_VISIBILITY_SETTINGS_KEY`): rol bazlı "feature visibility" üçüncü bir aç/kapa ekseni. Birleşik "Anahtarlar" merkezinde rol hedeflemesi olarak sunulmalı.
- **`/admin/tech/add`**: aynı bayrak oluşturma formunun kopyası (`app/admin/tech/add/page.tsx:46-80`). Webhook ve API anahtarı bölümleri de kendi sayfalarının kopyası. Kaldırılmalı veya yalnız yönlendirme olmalı.
- **`/admin/ab-testing`**: deney yönetimi ayrı bir sayfa (`/api/admin/ab-testing/overview`). Uzun vadede yüzdesel rollout ile aynı değerlendirme katmanını kullanmalı. Şimdilik ayrı kalabilir.
- **Admin ana sayfa "Özellik bayrakları" kartı** (`admin-dashboard-client.tsx:569`) ve **`/admin/roadmap` linki** (`roadmap/page.tsx:142`): birleştirme sonrası yeni merkeze yönlendirilmeli. Kart "kapalı kritik modül sayısı" gibi anlamlı bir sinyal göstermeli.

---

## Doğrulama (şüpheci inceleme)

Üç kritik/yüksek iddia kod baştan okunarak çürütülmeye çalışıldı. Okunan dosyalar: `app/admin/features/page.tsx`, `app/api/admin/features/route.ts`, `lib/api-auth.ts:20-80`, `lib/auth.ts:212-301`, `lib/request-metadata.ts:28-33`, `components/ui/card.tsx`, `prisma/schema.prisma:974-988` (FeatureFlag) ve `1106-1126` (AuditLog), `app/admin/admin-dashboard-client.tsx:569`. Kod değiştirilmedi, DB'ye dokunulmadı.

### İddia 1: Feature flag'leri hiçbir çalışma zamanı kodu okumuyor, kill-switch beklentisi boşa çıkıyor
- **Karar: DOĞRULANDI** (önem: kritik değil **yüksek**; ürüne doğrudan zarar yok ama olay anında operatörü yanıltıyor)
- **Çürütme denemesi:** (1) `featureFlag|FeatureFlag|feature_?flag|/api/admin/features` için `.ts/.tsx` taraması (node_modules, .next, docs, generated-prisma-client hariç). Prisma erişimi yalnızca CRUD (`app/api/admin/features/route.ts`), sayaçlar (`modules/overview/route.ts:37`, `tech-summary/route.ts:19-20`), süre-sonu temizliği (`internal/inngest/feature-flag-cleanup/route.ts:13`) ve seed'de var. (2) Ham SQL ile okunuyor mu diye `"FeatureFlag"` tablo adı arandı: sonuç yok. (3) Seed anahtarlarının (`ai_analysis`, `push_notifications`, `vip_club`, `dark_mode`, `leaderboard`) başka bir yerde koşul olarak kullanılıp kullanılmadığına bakıldı. `ai_analysis` yalnız `app/api/ai/analyze/route.ts:179`'da bir analitik olay adı (`event: 'ai_analysis'`) olarak geçiyor. `leaderboard` ise menü ve cache etiketi. Hiçbiri bayrak değerini okumuyor. (4) Şemada `@@map` yok, model adı ile tablo adı aynı (`schema.prisma:974`).
- **Yeniden üretim:** `/admin/features`'ta `ai_analysis` kapatılır. PATCH 200 döner, `isEnabled=false` yazılır, toast "pasif edildi" der. `POST /api/ai/analyze` aynı şekilde çalışmaya devam eder. Ana sayfa kartı (`admin-dashboard-client.tsx:569`) bir eksik "açık" sayısı gösterir. Davranışı gerçekten durduran mekanizma `assertModuleEnabled` (`lib/module-gate.ts`) ile `/admin/modules`.
- **Not:** Bayrakların bugün hiçbir şeye bağlı olmaması, iddia 2 ve 3'ün gerçek ürün etkisini de sıfıra indiriyor. Öneri (bulgu 1-A: `/admin/modules` ile birleştirmek ve sayfadaki "canlıda kontrollü yayın" metnini hemen kaldırmak) geçerli.

### İddia 2: Silme onaysız, kalıcı ve dokunmatik ekranda görünmüyor
- **Karar: DOĞRULANDI** (önem: bugün **orta**; "üretim kod yolu varsayılana düşer" kısmı varsayımsal, çünkü tüketici yok)
- **Çürütme denemesi:** `Card`'ın `hover` prop'u yalnız gölge ve kenarlık ekliyor (`components/ui/card.tsx:19-20`). Sil düğmesini görünür yapan başka bir kural (`focus-within`, `focus-visible`, `@media (hover:none)`) yok. Düğme yalnızca `opacity-0` ile gizleniyor (`page.tsx:370`), `pointer-events-none`, `invisible` veya `tabIndex=-1` yok. Bu yüzden düğme tıklamayı ve klavye odağını alıyor. `onClick` doğrudan `handleDelete`'i çağırıyor (`page.tsx:375`). `handleDelete` içinde onay adımı yok (`page.tsx:134-148`). Sunucu tarafı kalıcı silme yapıyor (`route.ts:261`, `prisma.featureFlag.delete`). Şemada `archivedAt` veya `deletedAt` yok (`schema.prisma:974-988`).
- **Yeniden üretim:** (a) Mobilde (hover yok) kartın alt şeridine (`mt-4 pt-4 border-t`, tam genişlik `w-full` düğme) dokunulur. Görünmeyen "Sil" tetiklenir, kayıt anında silinir ve "Özellik silindi" toast'ı çıkar. (b) Masaüstünde Tab ile Switch'ten sonra görünmez düğmeye odaklanılır, Enter'a basılır, kayıt silinir.
- **Hafifletici:** Silmede `auditLog.oldData` tam kaydı tutuyor (`route.ts:272`), bu yüzden veri elle geri getirilebilir. Bayraklar bugün hiçbir davranışı etkilemediği için ürün kesintisi yok. Kaybolan şey yalnızca admin yapılandırma kaydı.

### İddia 3: Mutasyon ve audit log ayrı yazılıyor, denetim izi eksik kalabilir, UI ile DB uyumsuzlaşabilir
- **Karar: DOĞRULANDI** (yalnızca mekanizma doğrulandı; önem **düşük-orta**, kritik veya yüksek değil)
- **Çürütme denemesi:** POST (`route.ts:83-105`), PUT (`158-174`), PATCH (`209-224`) ve DELETE (`261-275`) uçlarının hepsinde mutasyon ile `auditLog.create` iki ayrı `await` olarak yazılıyor. `$transaction` kullanılmıyor ve ortak `catch` bloğu 500 döndürüyor. İstemcide `toggleFeature` 500 aldığında state'i değiştirmiyor (`page.tsx:101-106`). `handleDelete` de kartı listeden kaldırmıyor (`page.tsx:140-143`). Audit yazımının deterministik olarak başarısız olabileceği bir yol arandı. `getAuditRequestMeta` yalnızca nullable string döndürüyor (`lib/request-metadata.ts:28-33`), `newData`/`oldData` düz Prisma nesneleri, şema uyumlu. Bulunabilen tek deterministik yol şu: `requireAuth` → `getServerSession` kullanıcının DB'de var olup olmadığına bakmıyor (`lib/api-auth.ts:20-29, 52-80`, `lib/auth.ts:285-299` token'dan dolduruyor) ve `AuditLog.userId` bir FK (`schema.prisma:1118`). Admin kullanıcısının satırı silinmiş ama JWT'si hâlâ geçerliyse mutasyon başarılı olur, audit FK hatası (P2003) verir ve istemci 500 alır. Bunun dışında yalnızca iki sorgu arasında oluşan geçici DB/bağlantı hatası (Neon pooler kopması, zaman aşımı) aynı sonucu doğurur.
- **Yeniden üretim:** PATCH sırasında `featureFlag.update` commit edildikten sonra `auditLog.create` başarısız olur (FK veya geçici bağlantı hatası). DB'de bayrak değişmiştir ama denetim kaydı yoktur. İstemci "Özellik bayrağı güncellenemedi" toast'ı görür ve switch eski konumda kalır. Kullanıcı yeniden tıklarsa gönderilen `!currentState` değeri DB'dekiyle zaten aynıdır, bu yüzden tutarlılık kendiliğinden düzelir ama hiçbir audit kaydı oluşmaz. DELETE'te kayıt silinir, audit yazılmaz, UI kartı göstermeye devam eder. Kart yeniden silinmek istendiğinde 404 alınır.
- **Not:** Bu senaryo nadir bir altyapı hatası ya da kenar durum gerektiriyor. Bayraklar tüketilmediği için de ürün etkisi yok. Önemi ana rapordaki "orta" seviyesinden de düşük, iddia edildiği gibi kritik veya yüksek değil. Önerilen `prisma.$transaction([mutasyon, auditLog.create])` düzeltmesi küçük ve doğru; istemcinin sunucunun döndürdüğü `feature` nesnesiyle senkronlanması da (bulgu 5 ile birlikte) uygulanmalı.

---

## Uygulama (Dalga 2)

**Sonuç:** `/admin/features` artık **Özellik ve Deney Kontrolü** yüzeyi (eski `/admin/modules` ve `/admin/ab-testing` buraya `permanentRedirect` ile, sorgu parametreleri korunarak yönlenir). Bulgu 1 için **(B) gerçek değerlendirme katmanı, (A)'nın güvencesiyle** seçildi: `FeatureFlag` satırı artık serbest anahtarlı ölü bir kayıt değil, **bir katalog modülünün kademeli açılış kuralı** (yüzde + allowlist + bitiş). Kural, 55+ noktada zaten uygulanan `assertModuleEnabled` içinde değerlendirilir (`lib/admin-flags/rollout.server.ts` → `lib/module-gate.ts`). Anahtar yalnız katalogdaki ve kullanıcı başına kapısı olan (API/sayfa) bir modül olabilir; böylece "kodda okunmayan bayrak" oluşturmak yapısal olarak imkânsız.

Sunucu: `lib/admin-flags/{contract,rollout,rollout.server,flags.server,modules.server}.ts`; BFF: `GET /api/admin/feature-control/rollouts`, `PUT /api/admin/feature-control/rollouts/:key`, `POST /api/admin/feature-control/flags/:id/archive` (hepsi `defineRoute`, ADMIN, zod, rate limit). Eski `/api/admin/features` bütün metotlarda **410**. Arayüz: `components/admin/a-ozellik-deney/rollouts-tab.tsx` (sekme `?tab=acilis`). Testler: `__tests__/admin/a-ozellik-deney/{server,stats-rollout}.test.ts`.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Sayfa başlığı | ÇALIŞIYOR | QDL `PageHeader` "Özellik ve Deney Kontrolü" + sunucu `metadata`. |
| 2 | "Özellik mantığı" bilgi kartı | KALDIRILDI | Yanlış iddiaydı. Yerine her satırda gerçek etki (zorlama seviyesi, bağlı uç sayısı) ve sekme açıklaması. |
| 3 | "Teknoloji Ekle" linki | KALDIRILDI | Kopya akış; ucu 410. `/admin/tech/add` Entegrasyonlar yüzeyinin işi. |
| 4 | İstatistik: Toplam | ÇALIŞIYOR | KPI şeridinde modül/kural/deney sayıları. |
| 5 | İstatistik: Aktif | ÇALIŞIYOR | "Aktif kademeli açılış" artık gerçekten kapıda uygulanan kural sayısı. |
| 6 | İstatistik: Pasif | ÇALIŞIYOR | "Kapalı modül" sayısı (gerçek kapı durumu). |
| 7 | Arama | ÇALIŞIYOR | Ad + anahtar + açıklama, `tr-TR` duyarlı normalizasyon, URL'de kalıcı, FilterBar temizleme. |
| 8 | "Yeni" diyaloğu | ÇALIŞIYOR | Kural editörü; modül katalogdan seçilir (yalnız kapılı modüller). |
| 9 | Key alanı + normalleştirme | ÇALIŞIYOR | Serbest anahtar yok; katalog anahtarı (`^[a-z0-9_]{2,64}$` route param doğrulaması). |
| 10 | Ad alanı | ÇALIŞIYOR | Katalog etiketinden gelir. |
| 11 | Açıklama alanı | ÇALIŞIYOR | "Not" alanı (300 karakter, sunucu zod). |
| 12 | Varsayılan durum | ÇALIŞIYOR | Yeni kural **kapalı** doğar; "Etkin" açıkça seçilmeli. |
| 13 | İptal | ÇALIŞIYOR | |
| 14 | Oluştur | ÇALIŞIYOR | Bekleme durumu, Türkçe zod mesajları, `P2002`/iyimser kilit → 409, hata diyalogda kalır. |
| 15 | Yükleniyor iskeleti | ÇALIŞIYOR | `QueryState` statik iskelet. |
| 16 | Boş durum | ÇALIŞIYOR | "Kural yok" ile "filtreye uyan yok" ayrı. |
| 17 | Hata durumu | ÇALIŞIYOR | `QueryState` hata + "Tekrar dene"; JSON olmayan yanıt güvenli ayrıştırılır. |
| 18 | Kart ikonu tahmini | KALDIRILDI | Alt dize tahmini yanlış sınıflıyordu; kapsam etiketi gösterilir. |
| 19 | Kart içeriği | ÇALIŞIYOR | Anahtar `font-mono truncate`. |
| 20 | Aç/kapa switch | ÇALIŞIYOR | Kural modül kapısında uygulanır (kova `sha256(key:userId)%100`, yapışkan). Bayat closure yok (TanStack Query + sunucudan tazeleme). |
| 21 | Sil | KALDIRILDI | Kalıcı silme yok. Yetim kayıtlar için **arşiv** (gerekçe + anahtarı yazarak onay + denetim; `metadata.archivedAt`). Kural "durdurulur". |
| 22 | Kart stagger animasyonu | KALDIRILDI | Yoğun ops listesi; motion dili §4.2 kural 3. |
| 23 | Denetim kaydı | ÇALIŞIYOR | Mutasyonla aynı `$transaction`; "Değişiklik geçmişi" sekmesinde görünür. |
| 24 | Yetki | ÇALIŞIYOR | `defineRoute` ADMIN + rate limit; sayfa proxy + `requireAuth`. |
| 25 | Süre sonu | ÇALIŞIYOR | Arayüzde (İstanbul saati); süre çalışma zamanında karşılaştırılır, Inngest'e bağlı değil. |
| 26 | Düzenleme | ÇALIŞIYOR | Aynı editör, `updatedAt` iyimser kilidi. |
| 27 | Sahip ve metadata | ÇALIŞIYOR | Sahip (son düzenleyen) ve not listede. |
| 28 | Çalışma zamanı değerlendirme | ÇALIŞIYOR | `checkModuleRollout` (60 sn önbellek, modül kapısıyla aynı etiket; yazınca anında tazelenir; DB hatasında kural yok sayılır). |
| 29 | `feature_flags` kill-switch | ÇALIŞIYOR | Kapatılınca **bütün açılış kuralları yok sayılır** (acil durdurma); ekranda uyarı bandı. |
| 30 | Zaman bilgisi | ÇALIŞIYOR | `updatedAt` göreli zamanla; hayalet `createdAt` alanı kaldırıldı. |
| 31 | Değişiklik geçmişi | ÇALIŞIYOR | `?tab=gecmis` + modül çekmecesindeki zaman çizelgesi. |
| 32 | i18n | KALAN | Metinler tam Türkçe ve tutarlı; `messages/*` anahtarlarına taşınmadı (yüzey tek dilli admin aracı). |
| 33 | Hedefleme / yüzdesel yayın | ÇALIŞIYOR | Yüzde + allowlist + bitiş. Rol hedeflemesi mevcut rol görünürlüğü matrisiyle gösterilir (Ayar Merkezi'nde yönetilir). Ortam (preview/prod) hedeflemesi yok. |
| 34 | Admin ana sayfa özet kartı | KALAN (sahiplik dışı) | `admin-dashboard-client.tsx` / `tech-summary` Komuta Merkezi yüzeyinin; yetim bayrak sayımı yerine kapalı modül/kural sayısına çevrilmeli. |

### Kapanan bulgular (12/13)
1 (tüketicisi olmayan bayrak), 2 (onaysız kalıcı silme → arşiv), 3 (açık doğan bayrak), 4 (`feature_flags` sahte kill-switch → gerçek acil durdurma), 5 (bayat closure), 6 (mutasyon + denetim aynı işlemde), 7 (yarış, bekleme, İngilizce zod, format kuralı), 8 (hata/boş ayrımı, güvenli JSON), 9 (düzenleme, süre sonu, sahip), 10 (switch `aria-label`, etiket–alan bağları), 11 (ikon tahmini), 12 (mobil: DataTable kart görünümü, truncate). 13 kısmen: kopya oluşturma akışı 410 ile kapandı; i18n kaldı.

### Kalanlar
- i18n anahtarları (yukarıda).
- Admin ana sayfa ve `tech-summary` sayaçları (sahiplik dışı).
- Bayrak başına değerlendirme sayısı (PostHog `$feature_flag_called` benzeri) eklenmedi; engellenen istek sayısı (`module_rollout_excluded`) modül çekmecesinde görünür.
