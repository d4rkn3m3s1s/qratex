# /admin/character-test

**Amaç:** Karakter rozeti sisteminin iç QA aracı. Üç işi var: (1) serbest bir yorumu AI'a sınıflandırtıp hangi üslup kategorisine ve karaktere düştüğünü görmek, (2) müşterinin gördüğü reveal (rozet açılışı) animasyonunu DB'ye yazmadan önizlemek, (3) bir kullanıcının karakter barını sentetik veriyle doldurup rozetlerini veya kategorilerini sıfırlayarak reveal akışını uçtan uca tekrar test etmek.

**Genel puan: 3.9/10** · **Karar: yeniden tasarla.** Sayfa korunmalı ama yeniden tasarlanmalı ve "Karakter Rozeti Stüdyosu" altında `/admin/character-thresholds` ile birleştirilmeli (bkz. son bölüm). Önizleme ve sınıflandırma parçaları değerli. Yıkıcı araç seti ise üretim veritabanında yetki sınırı, onay ve denetim izi olmadan çalışıyor. Puan ekonomisini tekrar tekrar şişirmeye açık. "Barı Doldur" düğmesi de Gizemli kategorisinde ve ikinci rozetten sonra yanlış çalışıyor.

Dosyalar: `app/admin/character-test/page.tsx` (312 satır, client), `app/api/admin/character-test/route.ts` (219 satır), `components/customer/character-reveal.tsx` (1324 satır), `lib/character-badges.ts`, `lib/character-categories.ts`, `lib/character-thresholds.ts`, `lib/badge-reward-points.ts`, `lib/admin-toast.ts`, `app/admin/layout.tsx`, `components/dashboard/sidebar.tsx:211`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Sınıflandırma ve önizleme çalışıyor. Ama "Barı Doldur" eşik ve sahip olunan rozet hesabını yanlış yapıyor. Durum kartı hedef kullanıcıyı göstermiyor. Önizlemede kategori başına yalnızca ilk karakter açılabiliyor. |
| UX | 3/10 | Yıkıcı aksiyonlarda onay ve geri alma yok. Durum ile hedef birbirinden kopuk. Toast'lar "Basarili: fill tamam" gibi ham anahtarlar gösteriyor. Varsayılan hedef olan admin hesabı reveal'i hiçbir zaman açamıyor. |
| Görsel | 5/10 | Standart shadcn kartları ve DashboardPageHero kullanılıyor, tutarlı. Ama hiyerarşi düz: dört kart eşit ağırlıkta, tehlikeli araçlar görsel olarak ayrışmıyor. Native `<select>`'ler tasarım sistemiyle uyumsuz. |
| Mimari | 3/10 | Tek bir POST ucu, aksiyon dizesiyle yıkıcı ve yıkıcı olmayan işleri çoğulluyor. Zod yok, `any` gövde, audit log yok, üretim koruması yok. Test sınıflandırması üretimdeki seçim mantığının kopyası ve onunla farklılaşmış. |
| Performans | 6/10 | Sorgular küçük. Ancak fill döngüsü 50'ye kadar ardışık ve transaction dışı yazma yapıyor. 1324 satırlık reveal bileşeni (framer-motion ve canvas) modal hiç açılmasa da eager yükleniyor. |
| Erişilebilirlik + mobil | 4/10 | Label'lar input ve select'lere bağlı değil, Textarea'nın etiketi yok, sonuç alanı `aria-live` değil, reveal modalında focus trap yok. flex-wrap sayesinde mobilde kabaca kullanılabilir. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota erişimi: proxy ADMIN rolü + gizli kapı | ÇALIŞIYOR | `proxy.ts:51,79-84` | `/admin/*` sayfaları rol ve gate cookie'siyle korunuyor. |
| 2 | API yetkisi `requireAuth(['ADMIN'])` (GET ve POST) | ÇALIŞIYOR | `route.ts:40,68` | Token-replay kontrolü de dahil (`lib/api-auth.ts:64-78`). |
| 3 | Sidebar girişi "Karakter Test" | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:211`, `messages/tr.json:2514` | |
| 4 | Sayfa başlığı ve hero (DashboardPageHero) | ÇALIŞIYOR | `page.tsx:131-135` | `<title>` yok. Client sayfa olduğu için metadata da yok, sekmede yalnızca "Admin" yazıyor. |
| 5 | İlk yükleme: durum GET `?userId=me` | KISMİ | `page.tsx:49-61` | Kimlik sabit olarak `me` gönderiliyor. Hedef e-posta alanı bu çağrıyı hiç etkilemiyor. |
| 6 | Yükleniyor durumu (durum kartı) | EKSİK | `page.tsx:237,249` | Yükleme sırasında "—" ve 0 görünüyor, skeleton yok. |
| 7 | Hata durumu (GET başarısız) | KISMİ | `page.tsx:56-58` | Yalnızca toast çıkıyor. Kategori select'leri boş kalıyor, yeniden dene düğmesi yok. |
| 8 | Canlı sınıflandırma metin alanı | ÇALIŞIYOR | `page.tsx:143-148` | Etiketi yok, uzunluk sınırı ve sayaç yok. |
| 9 | Örnek yorum çipleri (4 adet) | ÇALIŞIYOR | `page.tsx:122-127,149-160` | Gizemli kategorisi için örnek yok (5 kategoriye karşılık 4 örnek). |
| 10 | "Sınıflandır" düğmesi ve AI çağrısı | KISMİ | `page.tsx:63-81`, `route.ts:107-143` | Karakter seçimi üretimdeki `pickCharacterInCategory`'den farklı bir prompt kullanıyor (bulgu B5). |
| 11 | İstemci kısa metin kontrolü (3 karakterden az) | KISMİ | `page.tsx:64` ile `lib/character-badges.ts:141` | 3 ile 7 karakter arasındaki metin "başarılı" dönüyor ama kategori null, ekranda açıklamasız "—" çıkıyor. |
| 12 | Sınıflandırma sonuç kartı (emoji + kategori + karakter + why) | KISMİ | `page.tsx:166-178` | Kategori anahtarı, aday karakterler, ham AI çıktısı, gecikme ve model görünmüyor. Bölge `aria-live` değil. |
| 13 | AI yoksa yalnızca kategori dönmesi (sessiz degrade) | ÇALIŞIYOR | `route.ts:137` | Kullanıcıya "karakter seçilemedi, AI hatası" bilgisi verilmiyor. |
| 14 | Reveal önizleme: kategori select | ÇALIŞIYOR | `page.tsx:195-203` | Listeyi kullanıcı durumu ucundan alıyor (bağlantı hatası). |
| 15 | Reveal önizleme: varyant select (orb/mascot) | ÇALIŞIYOR | `page.tsx:207-214`, `character-reveal.tsx:151` | |
| 16 | Reveal önizleme: karakter seçimi | EKSİK / KISMİ | `route.ts:87-89,102` | API `badgeId` kabul ediyor ve `characters` listesini döndürüyor. UI ikisini de kullanmıyor, bu yüzden her kategoride hep ilk karakter oynuyor (43 karakterin yalnızca 5'i önizlenebiliyor). |
| 17 | "Açılışı Oynat" düğmesi ve CharacterReveal modalı | ÇALIŞIYOR | `page.tsx:84-101,225-231`, `character-reveal.tsx:278-280` | DB'ye yazmıyor. Yalnızca `badge.findUnique` ile okuyor (`route.ts:91`). |
| 18 | Önizleme verisinin gerçek akışa sadakati | KISMİ | `route.ts:95-98` ile `app/api/customer/character/route.ts:173-177` | `why` sabit metin ve "(admin önizleme)" ekli. `description` dahili AI ipucu `trait`'ten geliyor, gerçek akış katalog açıklamasını kullanıyor. `holders` ve `ratePct` yok, nadirlik çipi önizlenemiyor. 13 karakterin reveal metni yok, bunlarda dahili prompt metni görünür (`character-reveal.tsx:635-636`). |
| 19 | Reveal: Esc ile kapatma, backdrop, kapat düğmesi | ÇALIŞIYOR | `character-reveal.tsx:313-319,356,380-388` | |
| 20 | Reveal: azaltılmış hareket desteği | ÇALIŞIYOR | `character-reveal.tsx:166-167,175,209,231` | Konfeti, sarsılma ve renk döngüsü kapanıyor, süreler kısalıyor. |
| 21 | Reveal: focus yönetimi / focus trap | EKSİK | `character-reveal.tsx:339-342` | `role="dialog"` var ama odak modala taşınmıyor ve kapanınca geri dönmüyor. |
| 22 | Reveal: paylaş düğmesi (önizlemede) | KISMİ | `character-reveal.tsx:772` | Admin önizlemesinde de aktif, sahte "(admin önizleme)" gerekçeli bir kartı paylaşabiliyor. |
| 23 | Durum kartı: bar eşiği | BOZUK | `page.tsx:237`, `route.ts:58` | Sabit `CATEGORY_BADGE_THRESHOLD=6` gösteriliyor. Gizemli'nin eşiği 20 (`character-categories.ts:190`), admin override'ları (`character-thresholds.ts`) da yok sayılıyor. |
| 24 | Durum kartı: kategori sayıları | KISMİ | `page.tsx:242-246`, `route.ts:44-48` | Ham anahtarlar gösteriliyor (`dram-suc: 3`). İsim, eşiğe oran, hazır bayrağı ve min. uzunluk filtresi yok. Üretimdeki `getCategoryProgress` ile aynı hesap değil. |
| 25 | Durum kartı: kazanılan karakter rozeti sayısı | KISMİ | `page.tsx:248-250` | API `badgeId` ve `earnedAt` döndürüyor ama UI yalnızca sayıyı basıyor. |
| 26 | Durum kartı: hedef kullanıcıyı göstermesi | BOZUK | `page.tsx:51,114,236` | Hedef e-postaya aksiyon uygulandıktan sonra `load()` adminin kendi durumunu yeniliyor, değişiklik görünmüyor. |
| 27 | Hedef kullanıcı (e-posta) alanı | KISMİ | `page.tsx:260-266`, `route.ts:26-34` | E-posta bulunamazsa ham dize userId olarak kullanılıyor: sessiz no-op ve "başarılı" toast'ı. Arama, otomatik tamamlama ve rol göstergesi yok. |
| 28 | Varsayılan hedef "kendim (admin)" | SAHTE (işlevsiz) | `page.tsx:264,306` ile `app/api/customer/character/route.ts:117`, `proxy.ts:53` | Admin hesabı CUSTOMER olmadığı için `/customer/badges` ve reveal POST'una hiç erişemiyor. Admin hesabına üretilen sentetik veri test edilemiyor, yalnızca kirlilik yaratıyor. |
| 29 | "Barı Doldur (sentetik)" | BOZUK | `page.tsx:280-287`, `route.ts:155-209` | `n` hep 6. Gizemli (20) ve override'lı kategorilerde bar dolmuyor. Sahip olunan rozet sayısı hesaba katılmıyor, bu yüzden ikinci dolum "hazır" olmuyor. Gerçek yorumların kategorisi de üzerine yazılıyor (bulgu B3-B4). |
| 30 | Fill: `created` sayacı | BOZUK | `route.ts:198-201` | Yorum oluşturma hatası yutuluyor ama `created++` yine artıyor. Yorumsuz yetim Consumption kalabiliyor. |
| 31 | "Rozetleri Sıfırla" | ÇALIŞIYOR (tehlikeli) | `route.ts:145-148` | Herhangi bir kullanıcının tüm karakter rozetlerini onay ve audit olmadan siliyor. Kazanılmış puanlar geri alınmıyor. |
| 32 | "Kategorileri Temizle" | ÇALIŞIYOR (tehlikeli) | `route.ts:150-153` | Hedefin TÜM gerçek yorumlarının `characterCategory` alanı null'lanıyor. Yeniden sınıflandırma aracı olmadığı için geri dönüşü yok. |
| 33 | "Test Verisini Sil" (cleanupTest) | KISMİ | `route.ts:211-216`, `page.tsx:305` | Sentetik Consumption ve kartı siliyor. Fill'in gerçek yorumlara yazdığı kategorileri, sentetik veriyle kazanılan rozetleri ve puanları geri almıyor. "Gerçek veriye dokunmaz" iddiası yanıltıcı. |
| 34 | Aksiyonlar sırasında meşgul durumu | ÇALIŞIYOR | `page.tsx:39,103-120,282-298` | Tek `busy` dizesi tüm düğmeleri kilitliyor, çift tıklama engelleniyor. |
| 35 | Başarı/hata toast'ları | KISMİ | `page.tsx:113`, `lib/admin-toast.ts:17` | Toast "Basarili: fill tamam" diyor: ASCII Türkçe ile İngilizce anahtar karışık. Kaç kayıt etkilendi (`deleted`, `tagged`, `created`) gösterilmiyor. |
| 36 | Yıkıcı aksiyon onayı / geri alma | EKSİK | `page.tsx:288-299` | Yalnızca `variant="destructive"` rengi var. |
| 37 | Denetim izi (AuditLog) | EKSİK | `route.ts` (hiç yok) ile `app/api/admin/cards/[id]/route.ts:217` | Diğer admin uçları `prisma.auditLog.create` yazıyor. |
| 38 | Üretim / ortam koruması | EKSİK | `route.ts:11-15` | Yorumda "Sadece geliştirme/demo içindir" yazıyor ama ne flag ne NODE_ENV ne de test hesabı allowlist'i var. |
| 39 | AI çağrıları için rate limit / maliyet koruması | EKSİK | `route.ts:107-143` | Her tıklama 2 LLM çağrısı. `lib/rate-limit.ts` mevcut ama kullanılmıyor. |
| 40 | Yardım metni | KISMİ | `page.tsx:301-307` | Admin hesabıyla uçtan uca test yapılabileceğini söylüyor, bu mümkün değil (madde 28). |
| 41 | i18n | EKSİK | `page.tsx` tamamen sabit Türkçe | Sidebar etiketi i18n'den geliyor (`messages/en.json:2514`), sayfa içeriği gelmiyor. |
| 42 | Mobil yerleşim | KISMİ | `page.tsx:192,258` | flex-wrap çalışıyor. Araç kartında 4 düğme ve 2 alan alt alta yığılıyor, yıkıcı düğme ana eylemin hemen yanında duruyor. |

**Sayım:** ÇALIŞIYOR 15 · KISMİ 16 · BOZUK 4 · SAHTE 1 · EKSİK 6 (toplam 42).

---

## Bulgular

### B1 — Sıfırla, doldur, reveal döngüsüyle sınırsız puan basımı
- **Önem:** kritik · **Kategori:** güvenlik / ekonomi bütünlüğü · **Efor:** M
- **Kanıt:** `route.ts:145-148` (reset yalnızca `userBadge.deleteMany` yapıyor, puan iadesi yok), `route.ts:155-203` (sentetik yorumlarla bar dolduruluyor), `lib/character-badges.ts:467-481` (reveal'de `createMany` count>0 olunca `creditBadgeRewardInTx`), `lib/badge-reward-points.ts:48-56` ("rozet gerçekten yeni mi" kontrolü yok, yalnızca `justCreated`'e güveniyor).
- **Sorun:** Unique guard, rozet silinip yeniden eklendiğinde devreye girmiyor. Admin herhangi bir müşteri e-postasıyla şu döngüyü kurabiliyor: Sıfırla, Barı Doldur, müşteri `/customer/badges`'te reveal açar. Her turda 2.500, 5.000 veya 10.000 P yeniden basılıyor. `points_credited` olayı yazılıyor ama nedeni ayırt edilemiyor, kaynağı "badge" görünüyor. Bu, [[points-economy-invariants]] ilkesindeki "tek seferlik kredi" kuralını test aracı üzerinden deliyor. Kötü niyet gerekmez: QA sırasında demo yerine gerçek bir müşteri e-postası yazılması yeter.
- **Öneri:** (a) Puan kredisini rozet satırına değil kalıcı bir deftere bağlayın. `BadgeRewardLedger(userId, badgeId) @@unique` gibi bir tablo veya `points_credited` olayından `badgeId` ile idempotency kontrolü olmalı. Rozet silinse bile aynı (kullanıcı, rozet) için ikinci kredi basılmasın. (b) Test aracının reset'i puanı ters kayıtla geri alsın (`points_debited`, `reason: character-test-reset`) ya da hiç puan basılmayan ayrı bir "sandbox" bayrağıyla çalışsın (`UserBadge.isTest`). (c) Hedef kullanıcıyı bir test hesabı allowlist'ine sınırlayın (B2).

### B2 — Yıkıcı aksiyonlar herhangi bir gerçek kullanıcıya onaysız, denetimsiz ve üretim koruması olmadan uygulanabiliyor
- **Önem:** kritik · **Kategori:** güvenlik / veri bütünlüğü · **Efor:** M
- **Kanıt:** `route.ts:26-34` (e-posta veya ham id ile, rol kontrolü olmadan herkes hedeflenebiliyor), `route.ts:145-153,211-216` (deleteMany/updateMany), `page.tsx:288-299` (onay diyaloğu yok), `route.ts` içinde `auditLog` yok (karşılaştırma: `app/api/admin/cards/[id]/route.ts:217`), `route.ts:11-15` ("Sadece geliştirme/demo içindir" denmesine rağmen ortam kapısı yok). Yerel `DATABASE_URL` canlı Neon'u gösteriyor (proje notu).
- **Sorun:** Bir yazım hatası gerçek bir müşterinin bütün karakter koleksiyonunu ve tüm yorum kategorilerini kalıcı olarak siliyor. Kimin, ne zaman, hangi kullanıcıya yaptığı hiçbir yerde kayıtlı değil. Stripe veya Retool gibi iç araçlarda bu tür işlemler "test mode" ayrımı, hedef önizlemesi ve tip-onay ("RESET yazın") arkasında durur.
- **Öneri:** Sunucuda `CHARACTER_TEST_ENABLED` ayarı ve hedef için `User.isTestAccount` (ya da Settings'te allowlist) şartı koyun. Allowlist dışındaki hedefe 403 dönsün. Her mutasyon için `auditLog.create({ action: 'character_test.<op>', targetUserId, meta: {counts} })` yazılsın. İstemcide hedef seçildiğinde "Hedef: Ad Soyad · rol · N yorum · M rozet" önizleme kartı çıksın. Yıkıcı işlemlerde shadcn `AlertDialog` içinde etkilenecek kayıt sayısını (dry-run endpoint'i ile) ve tip-onayı gösterin. Diğer işlemlerin yanında `dryRun: true` desteği ekleyin.

### B3 — "Barı Doldur" Gizemli'de, override'lı kategorilerde ve ikinci rozetten sonra barı doldurmuyor
- **Önem:** yüksek · **Kategori:** işlevsellik / doğruluk · **Efor:** S
- **Kanıt:** `page.tsx:283` (`n` gönderilmiyor), `route.ts:162` (`n` varsayılanı `CATEGORY_BADGE_THRESHOLD = 6`, `lib/character-badges.ts:20`), `lib/character-categories.ts:190` (Gizemli eşiği 20), `lib/character-thresholds.ts:60-71` (admin override'ları), `lib/character-badges.ts:388-391` (`consumed = takenInCat * threshold`).
- **Sorun:** Üretimde hazır olma koşulu `total - takenInCat*threshold >= threshold`. Test aracı ise sabit 6 yorum üretiyor. Bu yüzden (1) Gizemli'de bar %30'da kalıyor, (2) eşik override'ı varsa yanlış hedefe dolduruluyor, (3) kullanıcı o kategoriden bir rozet almışsa ikinci dolum hiç "hazır" olmuyor. Ayrıca `minReviewLength` override'ı yaklaşık 150 karakteri aşarsa sentetik metin (`route.ts:191`) sayılmıyor. Admin "doldurdum ama reveal çıkmıyor" sonucunu kendi testinin değil sistemin hatası sanabilir.
- **Öneri:** Fill hedefini sunucuda üretimin kullandığı fonksiyonlarla hesaplayın: `getCategoryThresholdOverrides()`, `categoryThreshold()`, `categoryMinReviewLength()` ve sahip olunan rozet sayısı. Hedef `takenInCat*threshold + threshold` sayılan yorum olmalı. Sentetik metni `minLen`'i garanti edecek uzunlukta üretin. Yanıtta `getCategoryProgress(userId)` sonucunu döndürün ve UI "Bar hazır ✓" veya "eksik: X" göstersin. Bu mantık için bir birim test yazılmalı.

### B4 — Fill gerçek yorumların kategorisini üzerine yazıyor, cleanup bunu geri almıyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü · **Efor:** M
- **Kanıt:** `route.ts:165-172` (hedefin en eski `n` metinli yorumu, mevcut kategorisinden bağımsız olarak seçilen kategoriye taşınıyor), `route.ts:211-216` (cleanup yalnızca `note=[KARAKTER-TEST]` olan Consumption'ları ve kartı siliyor), `page.tsx:305` ("gerçek veriye dokunmaz").
- **Sorun:** Gerçek bir kullanıcıda fill çalıştırmak AI'ın verdiği kategorileri kalıcı olarak bozuyor. Kullanıcının barı, gerçek ilerlemesi ve sonraki karakter seçimleri (`pickCharacterInCategory` örneklemi, `character-badges.ts:193-198`) değişiyor. Yardım metni tersini söylüyor.
- **Öneri:** Fill yalnızca sentetik kayıt üretsin, gerçek yorumlara hiç dokunmasın. Eski "mevcutları etiketle" davranışı gerekiyorsa önce eski değeri bir `CharacterTestSnapshot` tablosuna (`reviewId`, `prevCategory`) yazın. Cleanup bu snapshot'ı geri yükleyip sentetik veriyle kazanılmış rozetleri de silsin (B1 ile birlikte).

### B5 — "Canlı sınıflandırma" üretimdeki karakter seçimini değil, farklılaşmış bir kopyasını test ediyor
- **Önem:** yüksek · **Kategori:** mimari / QA güvenilirliği · **Efor:** M
- **Kanıt:** `route.ts:117-136` (tek yorum, temperature 0.3, kısa prompt, sahip olunanlar dışlanmıyor, `tidyWhy` yok, metin kırpılmıyor) ile `lib/character-badges.ts:175-236` (12 yorum örneği, temperature 0.5, uzun persona promptu, sahip olunanlar dışlanıyor, `tidyWhy`, 30 kelime kuralı).
- **Sorun:** Admin burada "Sherlock çıktı" gördüğünde, üretimde aynı kullanıcı için başka bir karakter seçilebilir. Panelin varlık nedeni olan "formülün çıktısını göster" vaadi (`route.ts:108-109`) tutulmuyor. Prompt üretimde değişince test paneli fark ettirmeden eskiyor. Ayrıca karakter promptunda metin uzunluğu sınırsız (sınıflandırıcıda `slice(0,500)` var, burada yok).
- **Öneri:** Saf bir `selectCharacterForSamples({ categoryKey, samples, excludeBadgeIds })` fonksiyonu çıkarın. Hem `pickCharacterInCategory` hem test ucu bunu çağırsın (tek kaynak). Test UI'ına "örnek yorumlar" listesi (1 ile 12 arası) ve "şu rozetlere sahipmiş gibi davran" çoklu seçimi eklensin. Böylece üretimdeki girdi birebir simüle edilir. Yanıta kategori adayları ve ham JSON da eklensin (B9).

### B6 — Durum kartı hedef kullanıcıyı değil adminin kendisini gösteriyor ve yanlış eşik basıyor
- **Önem:** yüksek · **Kategori:** UX / doğruluk · **Efor:** S
- **Kanıt:** `page.tsx:51` (`?userId=me` sabit), `page.tsx:114` (aksiyon sonrası yine `me` yükleniyor), `page.tsx:236-237`, `route.ts:58` (sabit 6), `route.ts:44-48` (`getCategoryProgress`'in uzunluk filtresi ve tüketilmiş eşik hesabı yok).
- **Sorun:** Hedef e-postayla "Barı Doldur" denendiğinde ekranda hiçbir şey değişmiyor. Admin sonucu doğrulayamıyor. Gösterilen sayılar üretimdeki bar hesabından farklı olduğu için durum kartı tanı aracı olarak güvenilmez.
- **Öneri:** Hedef seçimi sayfanın üst bağlamı olsun (kullanıcı seçici ve URL'de `?user=`). GET bu hedefe göre çalışsın ve doğrudan `getCategoryProgress()` ile kategori başına `{count, countedForThreshold, threshold, takenInCat, available, ready}` döndürsün. UI her kategori için ilerleme çubuğu, eşik, hazır rozeti ve sahip olunan karakter çiplerini (isim ve `earnedAt`) göstersin.

### B7 — Varsayılan hedef (admin hesabı) uçtan uca testte kullanılamıyor
- **Önem:** orta · **Kategori:** UX / ürün mantığı · **Efor:** S
- **Kanıt:** `page.tsx:41,264,306`, `app/api/customer/character/route.ts:117` (`requireAuth(['CUSTOMER'])`), `proxy.ts:53` (`/customer` sadece CUSTOMER).
- **Sorun:** Boş e-posta, adminin kendi hesabına sentetik Consumption, Review ve ACTIVATED kart üretiyor. Admin bu hesapla reveal açamadığı için veri işe yaramıyor. Üstelik `dealerId = admin` (`route.ts:180`) olduğundan admin hesabı aynı anda hem müşteri hem bayi gibi görünen kirli kayıtlar topluyor.
- **Öneri:** Varsayılanı kaldırın, hedef zorunlu olsun ve yalnızca CUSTOMER rolündeki test hesaplarından seçilebilsin. Daha iyisi, "Demo müşteri oluştur / impersonate et" akışıyla (test hesabı ve tek tıkla `/customer/badges`'i yeni sekmede açma) uçtan uca testi tek ekranda tamamlayın.

### B8 — Sentetik veri platform metriklerini ve diğer oyunlaştırma sayaçlarını kirletiyor
- **Önem:** orta · **Kategori:** veri bütünlüğü · **Efor:** M
- **Kanıt:** `route.ts:193-199` (rating 5, `dealerId=admin`, gerçek Consumption ve Review), `lib/activity-badges.ts:28-33` (toplam yorum sayısı davranışsal rozetlere ve dolayısıyla puana giriyor), `app/api/customer/seasonal-event/route.ts:24-26` (sezonluk "reviews_written" ilerlemesi), `app/api/admin/dashboard/route.ts`, `app/api/admin/analytics/route.ts` (ConsumptionReview agregasyonları, `[KARAKTER-TEST]` filtresi yok; repo genelinde grep yalnızca `route.ts:37,185`'te eşleşiyor).
- **Sorun:** Test yorumları admin dashboard ortalamalarına, CLV ve churn girdilerine, sezonluk challenge ilerlemesine ve aktivite rozeti eşiklerine sayılıyor. Hedef kullanıcı kendi yorum geçmişinde "[KARAKTER-TEST] …" metnini görüyor. Kart `status: 'ACTIVATED'` iken `blockReason` dolu (`route.ts:185`), bu çelişkili bir durum. Token tahmin edilebilir: `chartest-<userId ilk 8>-<n>-<m>`.
- **Öneri:** Sentetik veriyi gerçek tablolara karıştırmayın. Ya `Consumption.isSynthetic Boolean @default(false)` (ve Review'da aynısı) ekleyip tüm agregasyonlarda merkezi bir `realOnly` where-yardımcısıyla dışlayın, ya da bar sayımını bir "test override" katmanından okuyun (`CharacterTestOverride(userId, category, extraCount)`, yalnızca allowlist hesaplarda `getCategoryProgress`'e eklenir). İkinci yol hiç sahte satış veya yorum üretmediği için tercih edilir. Kart gerekiyorsa `status: 'BLOCKED'` ve rastgele token kullanın.

### B9 — Sessiz başarısızlıklar: bulunamayan e-posta, yutulan hatalar, yanıltıcı toast
- **Önem:** orta · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** `route.ts:29-33` (e-posta bulunamazsa `return param`, yani e-posta dizesi userId olarak kullanılıyor), `route.ts:187,196,200` (`.catch(() => null/{})`), `route.ts:201` (hata olsa da `created++`), `page.tsx:113` (`${action} tamam`), `lib/admin-toast.ts:17` ("Basarili: " öneki), `route.ts:137` (AI hatası `catch {}`).
- **Sorun:** "yanlis@mail.com" ile Sıfırla denendiğinde 0 kayıt siliniyor ve ekranda "Basarili: reset tamam" çıkıyor. Fill kısmen başarısız olsa bile tam başarı raporlanıyor. AI yanıt vermediğinde sonuç kartı karakter göstermiyor ama nedenini söylemiyor.
- **Öneri:** Hedef bulunamazsa 404 `{error:'Kullanıcı bulunamadı'}` dönün. Fill'i tek bir `prisma.$transaction` içinde `createMany` ile yapın (Consumption ve Review için iki adım veya nested create). Yanıtı `{tagged, created, failed}` olarak verin. UI'da Türkçe ve sonuca özgü mesajlar gösterin ("6 sentetik yorum eklendi, bar hazır"). AI hatasını `aiError: 'timeout' | 'parse' | 'disabled'` olarak döndürün. `admin-toast` öneklerini "Başarılı/Dikkat" olarak düzeltin (sistem genelinde).

### B10 — Reveal önizlemesi kategori başına yalnızca ilk karakteri gösteriyor ve gerçek yükü taklit etmiyor
- **Önem:** orta · **Kategori:** işlevsellik / QA kapsamı · **Efor:** S
- **Kanıt:** `route.ts:87-89,102` (`badgeId` parametresi ve `characters` listesi hazır), `page.tsx:84-101` (bu ikisi kullanılmıyor), `route.ts:95-98` (sabit `why`, `description: picked.trait`, `holders`/`ratePct` yok) ile `app/api/customer/character/route.ts:173-177`. `lib/character-reveal-texts.ts`'de 30 karakter var, kategorilerde 43 karakter var (kalan 13'ünde `character-reveal.tsx:635-636` dahili prompt metnini açıklama olarak basar).
- **Sorun:** Efsanevi, nadir ve yaygın kademelerin ve karaktere özel metinlerin görsel QA'i yapılamıyor. Önizleme, gerçek kullanıcıda görünmeyecek dahili "AYRIM: …" prompt metnini gösterebiliyor.
- **Öneri:** Karakter seçici ekleyin: kategori sonra karakter, her satırda kademe rozeti, puan ve "reveal metni var/yok" göstergesi. Önizleme yükü `app/api/customer/character` ile aynı yardımcıdan üretilsin (`buildRevealPayload(badgeId, { why, ratePct })`). Admin `why` ve `ratePct` değerlerini elle girebilsin (uzun metin ve çok nadir durumlarını test etmek için). "Önizlemede paylaşımı devre dışı bırak" prop'u eklensin.

### B11 — Erişilebilirlik eksikleri
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `page.tsx:194,206,260,269` (`<Label>` için `htmlFor` yok, input ve select'lerde `id` yok), `page.tsx:143-148` (Textarea etiketsiz, yalnızca placeholder), `page.tsx:166` (sonuç bölgesinde `aria-live` yok), `character-reveal.tsx:339-342` (dialog'da focus trap ve odak iadesi yok), `page.tsx:195,208,270` (native select, tasarım sisteminin `Select` bileşeni kullanılmıyor).
- **Öneri:** Label ve kontrolleri `useId` ile bağlayın, shadcn `Select` kullanın. Sonuç kartını `role="status" aria-live="polite"` yapın. CharacterReveal'ı Radix `Dialog` primitive'i üzerine taşıyın ya da `focus-trap-react` ekleyin. Bu düzeltme müşteri tarafındaki reveal'i de iyileştirir.

### B12 — Mimari: tek POST ucunda RPC tarzı aksiyon çoğullama, şema doğrulaması yok, `any` gövde
- **Önem:** orta · **Kategori:** mimari · **Efor:** M
- **Kanıt:** `route.ts:70-72` (`req.json()` any, `String(body.action)`), `route.ts:74-218` (if-zinciri ile 6 aksiyon), `route.ts:130` (`res as string | null` cast).
- **Sorun:** Yan etkisiz (classify, revealPreview) ve yıkıcı (reset, clearCategories, cleanupTest, fill) aksiyonlar aynı yetki ve aynı yolda duruyor. Bu yüzden ayrı rate limit, audit ve ortam kapısı uygulamak zor. `lib/data/admin-api-catalog.json:210` katalogda tek uç olarak görünüyor.
- **Öneri:** Uçları ayırın: `POST /api/admin/character-test/classify`, `/preview`, `/sandbox/{fill|reset|clear|cleanup}`. Her birinde zod şeması olsun. Yıkıcı alt yolda ortak bir `withCharacterSandboxGuard` (allowlist, audit, dry-run) sarmalayıcısı kullanılsın. Classify'a `checkRateLimitDb` (`lib/rate-limit.ts:23`) eklensin.

### B13 — Dil ve metin tutarsızlıkları
- **Önem:** düşük · **Kategori:** içerik · **Efor:** S
- **Kanıt:** `page.tsx:113` (fill, reset, clearCategories, cleanupTest gibi İngilizce anahtarlar toast'a basılıyor), `lib/admin-toast.ts:17,19` ("Basarili", ASCII), `page.tsx:186,212-213` ("Reveal", "orb"), sayfada i18n yok, `<title>` yok.
- **Öneri:** Aksiyonlar için bir Türkçe etiket haritası kullanın. "Açılış önizlemesi / Küre / Maskot" gibi tek terminoloji seçin. Sayfayı `next-intl` anahtarlarına taşıyın. Server wrapper ile `metadata.title = 'Karakter Test Stüdyosu'` verin.

### B14 — Performans: reveal bileşeni eager yükleniyor, fill ardışık yazıyor
- **Önem:** düşük · **Kategori:** performans · **Efor:** S
- **Kanıt:** `page.tsx:20` (1324 satırlık CharacterReveal statik import, canvas, framer-motion, konfeti zinciri), `route.ts:192-202` (50'ye kadar `create` için 2×N ardışık round-trip, transaction yok).
- **Öneri:** `next/dynamic(() => import(...), { ssr: false })` ile modal ilk "Oynat"ta yüklensin. Fill `createMany` ve tek transaction ile yapılsın (B9 ile aynı iş).

---

## Eksik özellikler (kıyas: Stripe test mode, Retool iç araçları, PostHog, Linear)

1. **Sandbox / test modu ayrımı (Stripe test mode).** Gerçek ve sentetik veri için ayrı bayrak, test hesabı allowlist'i ve "TEST" şeridi. Yıkıcı araçlar yalnızca sandbox hesaplarda aktif olur.
2. **Hedef kullanıcı seçici ve bağlam kartı (Retool).** Arama ile otomatik tamamlama, rol ve hesap tipi, mevcut ilerleme, "müşteri olarak aç" (impersonate) ve `/customer/badges`'e derin bağlantı.
3. **Dry-run, onay ve geri alma.** Her yıkıcı aksiyonda "N kayıt etkilenecek" önizlemesi, tip-onay ve snapshot'tan geri yükleme. Hepsi AuditLog ile `/admin/audit`'e düşmeli.
4. **Sınıflandırıcı değerlendirme seti (PostHog/LLM eval).** Etiketli örnek yorum seti (golden set), toplu çalıştırma, kategori bazında doğruluk ve karışıklık matrisi, prompt veya model değişince regresyon karşılaştırması. Şu an yalnızca tek tek elle deneme yapılabiliyor.
5. **Karakter kataloğu sağlık kontrolü.** Kategorisiz karakterler (`unassignedCharacterIds()` var ama kullanılmıyor, `lib/character-categories.ts:248`; 46 profile karşılık 43 atanmış), reveal metni eksik 13 karakter, Badge tablosunda kaydı olmayanlar ve kademe dağılımı tek tabloda.
6. **AI izlenebilirliği.** Ham yanıt, seçilen model, gecikme, token maliyeti ve kategori olasılık sıralaması. Sınıflandırma çağrıları `qra_chat_logs` veya AI kalite panosuna bağlanabilir.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Karakter Rozeti Stüdyosu". Rozet sisteminin sahibi tek bir ekranda dört şey yapabilmeli: kurallara bakmak, sınıflandırıcıyı ölçmek, açılışı karakter karakter görmek ve bir test müşterisinde akışı güvenle uçtan uca oynatmak. Gerçek kullanıcı verisine dokunma ihtimali tasarım gereği sıfır olmalı.

**Yerleşim (sekmeli, Linear tarzı yoğun ama sakin):**
1. **Kurallar.** Bugünkü `/admin/character-thresholds` buraya taşınır. Kategori başına eşik, min. uzunluk, karakter sayısı ve reveal metni kapsamı.
2. **Sınıflandırıcı.** Solda tek yorum veya toplu golden set girişi. Sağda kategori olasılık çubukları, seçilen karakter, `why`, ham JSON ve gecikme. Alt şeritte "üretim prompt sürümü: v-hash". Seçim üretimle aynı fonksiyonu kullanır (B5).
3. **Galeri.** 43 karakter kategoriye göre gruplu grid'de, her kartta kademe (yaygın, nadir, efsanevi), puan, reveal metni var/yok ve sahip kullanıcı sayısı. Karta tıklanınca CharacterReveal tam gerçek yükle oynar (orb/mascot anahtarı, `why` ve `ratePct` düzenlenebilir). QA'in en çok zaman geçireceği yer burası.
4. **Sandbox.** Üstte zorunlu test-hesabı seçici ve "TEST MODU" şeridi. Kategori ilerleme çubukları üretimdeki `getCategoryProgress` ile hesaplanır. "Barı hazır yap" tek düğmedir ve doğru eşiği kendisi hesaplar. Sıfırla ve Temizle düğmeleri dry-run ile onay diyaloğunun arkasındadır. Son 20 test işlemi AuditLog'dan zaman çizelgesi olarak listelenir. "Müşteri olarak reveal'i aç" bağlantısı vardır.

**Motion / 3D:** Sayfanın kendisinde ek motion gerekmez. Bu bir operatör aracı, sakin kalmalı. Motion'un yeri zaten CharacterReveal içinde ve azaltılmış hareket desteği orada var (`character-reveal.tsx:166-167`). Önerilen tek mikro-etkileşim: sandbox ilerleme çubuklarında değer değişince 200 ms'lik bir genişlik tween'i (`Motion.div layout`) ve "hazır" olduğunda kategori renginde tek bir nabız. Galeri kartlarında hover'da hafif yükselme yeterli. Three.js gerekmez, reveal sahnesi canvas/CSS ile prosedürel kalmalı.

**Veri / API değişiklikleri:**
- `lib/character-badges.ts`: saf bir `selectCharacterForSamples()` çıkarılır, `pickCharacterInCategory` ve test ucu bunu paylaşır. Kategori başına kırılım döndüren bir `getCategoryProgressDetailed(userId)` eklenir.
- `lib/character-reveal-payload.ts`: `buildRevealPayload(badgeId, opts)`. Hem `/api/customer/character` hem önizleme bunu kullanır.
- Şema: `User.isTestAccount Boolean @default(false)` ya da Settings allowlist. `CharacterTestOverride(userId, category, extraCount)` (sahte Consumption üretmeden bar doldurmak için). Puan idempotency'si için `BadgeRewardLedger(userId, badgeId) @@unique`.
- API: `/api/admin/character-studio/{rules|classify|classify-batch|preview|sandbox/*}`. Zod, rate limit ve `withCharacterSandboxGuard` (allowlist, audit, dry-run).
- Mevcut `/api/admin/character-test` uçları, sandbox geçişi bitince kaldırılır. Canlıda kalan `[KARAKTER-TEST]` kayıtları tek seferlik bir temizlik betiğiyle bulunur ve raporlanır (önce yalnızca okuma, sonra onay).

---

## Çakışmalar / birleştirme önerisi

- **`/admin/character-thresholds`** (`app/admin/character-thresholds/page.tsx`): Aynı alanın kural tarafı. Eşik değişikliğinin etkisi bu test sayfasında görülemiyor, iki sayfa birbirinden habersiz (B3: test aracı override'ları okumuyor). Bu iki sayfa **"Karakter Rozeti Stüdyosu"** altında tek sayfada sekme olarak birleştirilmeli. Sidebar'da iki giriş (`sidebar.tsx:210-211`) teke iner.
- **`/admin/badges`**: Genel rozet yönetimi. Karakter rozetlerinin katalog ve kademe görünümü (Galeri sekmesi) oradan bağlantıyla açılmalı. Badge CRUD'u tekrar etmemeli, salt-okunur ve QA odaklı kalmalı.
- **`/admin/gamification-settings`**: Ödül puanı ve kademe ayarları buradaysa, Stüdyo'nun Kurallar sekmesi buraya derin bağlantı vermeli, değerleri kopyalamamalı.
- **Kaldırma alternatifi:** Stüdyo yapılmayacaksa en azından Sandbox araçları (fill, reset, clearCategories, cleanupTest) üretimde kapatılmalı (ortam bayrağı). Sınıflandırma ve önizleme ise `/admin/character-thresholds` altına taşınmalı. Bugünkü haliyle yıkıcı araçların canlıda açık kalması savunulamaz.

---

## Doğrulama (şüpheci inceleme)

Okunan kod: `app/admin/character-test/page.tsx`, `app/api/admin/character-test/route.ts`, `lib/character-badges.ts` (getCategoryProgress, revealReadyCategoryBadge), `lib/character-categories.ts`, `lib/badge-reward-points.ts`, `lib/character-reveal-texts.ts`, `app/api/customer/character/route.ts`, `lib/api-auth.ts` (requireAuth), `proxy.ts`, `app/api/admin/users/route.ts` (add_points karşılaştırması). Kod çalıştırılmadı, DB'ye dokunulmadı.

Ortak ön koşul: dört iddianın hepsi **ADMIN rolü** gerektiriyor (`route.ts:40`, `route.ts:68` → `requireAuth(['ADMIN'])`). Dışarıdan veya müşteri tarafından tetiklenebilen bir açık yok. Bulgular "yetkili ama hatalı ya da habersiz kullanım"ın canlı veriye etkisi üzerine kurulu. Not: `proxy.ts:79` gizli kapı (gate cookie) kontrolü yalnızca `/admin` sayfa yollarına uygulanıyor, `/api/admin/*` uçları yalnızca rol ile korunuyor. Bu, bu dört iddiayı değiştirmiyor.

### 1. Test aracıyla rozet ödül puanı sınırsız yeniden basılabiliyor: **DOĞRULANDI** (önem: YÜKSEK değil, ORTA)

- `route.ts:145-148` `reset` yalnızca `userBadge.deleteMany` yapıyor. Puan, XP veya `points_credited` olayına dokunmuyor.
- Reveal tarafında `lib/character-badges.ts:467-481`: `createMany({skipDuplicates})` silinmiş satırı yeniden yaratınca `count=1` dönüyor ve `creditBadgeRewardInTx(..., justCreated: true)` çağrılıyor. `lib/badge-reward-points.ts:52` yalnızca `justCreated`'a bakıyor. "Bu rozet için daha önce ödül verildi mi" diye bir ledger kontrolü yok.
- Döngü `fill` bile gerektirmiyor. Reset'ten sonra kategorize yorumlar yerinde kalıyor, `takenInCat` 0'a düşüyor (`character-badges.ts:388-391`) ve bar anında `ready` oluyor.
- **Yeniden üretim:** Kategorisinde ≥6 yorumu olan müşteri hesabı X → admin panelde e-posta=X, "Rozetleri Sıfırla" → X `/customer/badges`'te reveal yapar (`POST /api/customer/character`, `requireAuth(['CUSTOMER'])`, `route.ts:117`) → +2.500, +5.000 veya +10.000 P (`character-reveal-texts.ts:9`). Tekrarlanabilir. `cleanupTest` de puanı geri almıyor.
- **Neden ORTA:** Admin zaten `app/api/admin/users/route.ts:399-423` `add_points` ile doğrudan puan ekleyebiliyor, yani bu bir yetki yükseltmesi değil. Hafifletici: her kredi `points_credited` analytics olayı yazıyor (`badge-reward-points.ts:59-66`), dolayısıyla tamamen görünmez değil. Gerçek sorun şu: aracın **belgelenmiş amacı** ("reveal akışı tekrar tekrar test edilebilir", `route.ts:15`) normal QA kullanımında bile canlı bakiyeye denetimsiz puan basıyor ve `add_points` yolunun AuditLog kaydını atlıyor. Tek seferlik kredi invaryantı fiilen delinmiş durumda.
- **Öneri:** `BadgeRewardLedger(userId, badgeId) @@unique` ile kredi idempotent hale getirilmeli: ödül UserBadge'in varlığına değil ledger'a bağlanmalı, reset ledger'ı silmemeli. Alternatif olarak reset, aynı tx'te ödülü ters kayıtla geri almalı ve AuditLog yazmalı.

### 2. Gerçek kullanıcı verisini kalıcı silen/değiştiren aksiyonlar onay, audit ve ortam koruması olmadan açık: **DOĞRULANDI** (ifadede bir düzeltmeyle)

- `route.ts:26-34`: e-postası eşleşen herhangi bir kullanıcı (rol filtresi yok) veya ham userId hedeflenebiliyor.
- `route.ts:150-153`: `clearCategories`, hedefin **tüm** yorumlarının `characterCategory` alanını null yapıyor. AI sınıflandırma sonucu geri dönüşsüz kayboluyor; geri getirmek için yeniden AI sınıflandırması gerekir.
- `route.ts:145-148`: `reset` tüm karakter rozetlerini siliyor (`earnedAt` geçmişi kayboluyor, `User.featuredCharacterBadgeId` artık sahip olunmayan bir rozeti gösterebiliyor).
- `page.tsx:288-299`: onay diyaloğu yok. `route.ts` içinde `auditLog.create` yok (karşılaştırma için diğer admin uçları yazıyor: `api-keys`, `coupons`, `cards`, `users`). `NODE_ENV` veya ortam bayrağı koruması da yok.
- **Düzeltme:** "Bir yazım hatası gerçek müşteriyi siler" senaryosu zayıf. Eşleşmeyen bir e-posta `route.ts:33`'te ham string olarak userId'ye dönüşüyor ve `deleteMany`/`updateMany` 0 satır etkiliyor. Gerçek risk, yanlış ama **var olan** bir e-postanın (örneğin benzer adlı başka bir müşterinin) girilmesi ya da alanın boş bırakılması: boş alan sessizce admin'in kendi hesabını hedefliyor (`page.tsx:288`).
- **Yeniden üretim:** Admin, test hesabı yerine gerçek bir müşterinin e-postasını yazıp "Kategorileri Temizle"ye basar. Müşterinin tüm kategori etiketleri sıfırlanır, bar 0'a düşer, iz kalmaz.

### 3. Fill gerçek yorumların AI kategorisini üzerine yazıyor; cleanup geri almıyor: **DOĞRULANDI**

- `route.ts:165-172`: `fill`, hedefin metinli en eski `n` (varsayılan 6) yorumunu, mevcut kategorisine bakmadan seçilen kategoriye yeniden etiketliyor. Bu adım `synthetic` bayrağından bağımsız olarak **her zaman** çalışıyor; sentetik üretim yalnızca açığı kapatıyor (`route.ts:178`).
- `route.ts:211-216`: `cleanupTest` yalnızca `note='[KARAKTER-TEST]'` olan Consumption kayıtlarını (cascade ile review'ları) ve test kartını siliyor. Yeniden etiketlenmiş gerçek yorumların eski kategorisi kaydedilmediği için geri yüklenemiyor.
- UI yanıltıcı: düğme "Barı Doldur **(sentetik)**" diyor ve açıklama "işaretli test yorumları üretir" diyor (`page.tsx:286`, `302-303`). Yorumu en az 6 olan bir müşteride ise **hiç sentetik kayıt üretilmiyor**, yalnızca gerçek yorumlar yeniden etiketleniyor. "Gerçek veriye dokunmaz" ifadesi (`page.tsx:305`) cleanup için teknik olarak doğru, ama fill+cleanup çiftinin net etkisi hakkında yanlış bir güven veriyor.
- Yan etki: `pickCharacterInCategory` o kategorideki son 12 yorumu örnekliyor (`character-badges.ts:193-197`). Yeniden etiketlenmiş gerçek yorumlar gelecekteki karakter seçimini de etkiliyor.
- **Yeniden üretim:** 10 yorumu "komedi" etiketli bir müşteride Kategori=Dram ile fill → en eski 6 yorum "dram-suc" olur, komedi sayısı 10'dan 4'e düşer. "Test Verisini Sil" → 0 consumption silinir, etiketler dram'da kalır.
- **Öneri:** Fill gerçek yorumlara hiç dokunmamalı. Bar, yalnızca sentetik kayıtla veya `CharacterTestOverride(userId, category, extraCount)` gibi bir test override'ı ile doldurulmalı. Retag gerekiyorsa önceki değer bir ledger'a yazılmalı ve cleanup onu geri yüklemeli.

### 4. Barı Doldur, Gizemli kategorisinde ve önceden rozet alınmış kategorilerde reveal'i hazır hale getirmiyor: **DOĞRULANDI** (fonksiyonel hata; güvenlik veya veri kaybı değil)

- `page.tsx:283` `n` göndermiyor. `route.ts:162` bu yüzden `n = CATEGORY_BADGE_THRESHOLD = 6` kullanıyor (`character-badges.ts:20`).
- Gizemli'nin eşiği 20 (`character-categories.ts:190`). Üretimde eşik `categoryThreshold(cat, overrides)` ile, admin override'ları da hesaba katılarak hesaplanıyor (`character-badges.ts:382`). Test ucu override'ları hiç okumuyor.
- Önceden rozet alınmış kategoride `consumed = takenInCat * threshold` (`character-badges.ts:388-391`). Fill toplamı yalnızca 6'ya tamamlıyor (`need = n - fbs.length`, `route.ts:178`), dolayısıyla 1 rozet alınmışsa 12 gerekirken bar dolmuyor.
- Durum kartı sabit `CATEGORY_BADGE_THRESHOLD` gösteriyor (`route.ts:58`, `page.tsx:237`). Ayrıca kart her zaman `userId=me` yüklüyor (`page.tsx:51`), hedef müşterinin durumunu hiç göstermiyor. Admin fill'in sonucunu ekranda doğrulayamıyor.
- **Yeniden üretim:** Kategori=Gizemli, boş bir test müşterisinde fill → 6 sentetik yorum oluşur, `getCategoryProgress` 6/20 `ready=false` döner, reveal 400 "Henüz keşfe hazır değilsin" verir. Toast ise "fill tamam" der.
- **Önem:** Bu bir operatör aracı hatası; kullanıcıya veya veriye doğrudan zarar vermiyor. KRİTİK/YÜKSEK değil, ORTA/DÜŞÜK. **Öneri:** Fill hedefi sunucuda `categoryThreshold(cat, overrides) * (takenInCat + 1)` olarak hesaplanmalı ve `getCategoryProgress` sonucu yanıtta döndürülmeli. Durum kartı hedef kullanıcıyı ve kategori başına gerçek eşiği göstermeli.

**Özet:** 4/4 iddia kodda doğrulandı. Hiçbiri yetkisiz bir saldırgan tarafından istismar edilemez. #1 ve #2 canlı veri ve ekonomi açısından gerçek risk taşıyor (ORTA-YÜKSEK), #3 gerçek kullanıcı verisini sessizce bozuyor (YÜKSEK), #4 işlevsel bir hata (ORTA/DÜŞÜK).

---

## Uygulama (Dalga 2)

Araç `/admin/badges?tab=test` (Test lab) sekmesine taşındı; `/admin/character-test` kalıcı yönlenir. Uçlar ayrıldı (B12): `GET /api/admin/badges/lab?user=`, `…/lab/targets`, `…/lab/catalog`, `POST …/lab/classify` (AI hız sınırı), `POST …/lab/preview`, `POST …/lab/sandbox` — hepsi `defineRoute` + zod. Eski `/api/admin/character-test` silindi; P0-23 testleri `__tests__/admin/a-rozetler/lab-sandbox.test.ts`'e taşındı ve genişletildi. Mantık: `lib/admin-badges/lab.server.ts`; UI: `components/admin/a-rozetler/lab-tab.tsx` (yalnız sekme açılınca yüklenir).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1–3 | Rota erişimi / API yetkisi / sidebar | ÇALIŞIYOR | Rozetler girdisi (navigasyon kaydında `redirectFrom`). |
| 4 | Başlık + `<title>` | ÇALIŞIYOR | `metadata.title = 'Rozetler'`. |
| 5 | Durum GET (hedefe bağlı değil) | ÇALIŞIYOR | `?user=` URL bağlamı; durum seçilen hedefin. |
| 6 | Yükleniyor | ÇALIŞIYOR | QueryState iskeleti. |
| 7 | Hata | ÇALIŞIYOR | Görünür hata + Tekrar dene. |
| 8 | Metin alanı | ÇALIŞIYOR | Etiketli, 1000 sınırı + sayaç. |
| 9 | Örnek çipleri | ÇALIŞIYOR | 5 kategori (Gizemli dahil). |
| 10 | Sınıflandır | ÇALIŞIYOR | Üretimle aynı `classifyFeedbackCategory` + `selectCharacterForSamples` (B5). |
| 11 | Kısa metin | ÇALIŞIYOR | < 8 karakter "üretim saymaz" açıklaması. |
| 12 | Sonuç kartı | ÇALIŞIYOR | Kategori anahtarı, AI/yedek seçim, hata nedeni, süre; `aria-live`. |
| 13 | AI yoksa | ÇALIŞIYOR | `aiError` görünür (unavailable/parse/invalid_choice). |
| 14–15 | Kategori/varyant seçimi | ÇALIŞIYOR | DS `Select` (Kader küresi / Maskot). |
| 16 | Karakter seçimi | ÇALIŞIYOR | 43 karakterlik galeri; her biri önizlenebilir. |
| 17 | Açılışı oynat | ÇALIŞIYOR | `CharacterReveal` lazy; DB'ye yazmaz. |
| 18 | Önizleme sadakati | ÇALIŞIYOR | Müşteri ucuyla aynı yük (katalog açıklaması, gerçek sahip/oran); `why` ve oran elle girilebilir. |
| 19–20 | Esc/kapat, azaltılmış hareket | ÇALIŞIYOR | Değişmedi. |
| 21 | Reveal focus trap | KISMİ | Müşteri bileşeni (başka yüzey); dokunulmadı. 3B rozet sahnesi (`SceneShell`) odak tuzaklı. |
| 22 | Paylaş (önizlemede) | ÇALIŞIYOR | `allowShare={false}` (müşteri bileşenine eklemeli prop). |
| 23 | Bar eşiği (BOZUK) | ÇALIŞIYOR | Kategori başına etkin eşik + min. uzunluk. |
| 24 | Kategori sayıları | ÇALIŞIYOR | Ad, sayılan/eşik, alınan/kalan, hazır, ilerleme çubuğu (`getCategoryProgressDetailed`). |
| 25 | Kazanılan rozetler | ÇALIŞIYOR | Ad + ne zaman. |
| 26 | Hedef durumu (BOZUK) | ÇALIŞIYOR | İşlem sonrası hedefin güncel durumu yanıtta döner. |
| 27 | Hedef alanı | ÇALIŞIYOR | Yalnız test hesabı seçici (demo + allowlist, aranabilir); bulunamayan 404. |
| 28 | Varsayılan "kendim" (SAHTE) | KALDIRILDI | Hedef zorunlu; admin hesabı seçilemez. |
| 29 | Barı doldur (BOZUK) | ÇALIŞIYOR | Hedef = etkin eşik × (alınan + 1); min. uzunluğu karşılayan metin; tükenmiş kategori 409; gerçek yorumlara dokunmaz. |
| 30 | `created` sayacı (BOZUK) | ÇALIŞIYOR | Tek transaction: ya hepsi ya hiç. |
| 31 | Rozetleri sıfırla | ÇALIŞIYOR | Tipli onay ("SIFIRLA"), ödül kilidi (tekrar basılmaz), denetim. |
| 32 | Kategorileri temizle | ÇALIŞIYOR | Yalnız test hesabı, tipli onay ("TEMİZLE"), denetim. |
| 33 | Test verisini sil | ÇALIŞIYOR | Etki önizlemeli onay, tek tx; fill artık gerçek yorumları etiketlemediği için geri alınacak etiket yok. |
| 34 | Meşgul durumu | ÇALIŞIYOR | |
| 35 | Toast'lar | ÇALIŞIYOR | Sunucunun Türkçe, sayılı mesajı ("15 sentetik yorum eklendi; … barı hazır."). |
| 36 | Yıkıcı onay (EKSİK) | ÇALIŞIYOR | `ConfirmAction` + tipli onay + etki. |
| 37 | Denetim izi (EKSİK) | ÇALIŞIYOR | Her sandbox işlemi `CHARACTER_TEST_*`. |
| 38 | Üretim koruması (EKSİK) | ÇALIŞIYOR | Üretimde kapalı + allowlist (P0-23); UI kilit nedenini söyler. |
| 39 | AI hız sınırı (EKSİK) | ÇALIŞIYOR | `rateLimit: 'ai'`. |
| 40 | Yardım metni | ÇALIŞIYOR | Yanıltıcı iddialar kaldırıldı; müşteri rozet sayfasına bağlantı. |
| 41 | i18n | KALDIRILDI | Admin Dalga 2 yüzeyleriyle tutarlı sabit Türkçe. |
| 42 | Mobil | ÇALIŞIYOR | Yıkıcı düğmeler ana eylemden ayrık, ≥ 44px. |

### Kapanan bulgular
B1 (ödül kilidi, Dalga 1 + korunan test) · B2 (allowlist, onay, denetim, üretim kapısı) · B3 (doğru hedef) · B4 (gerçek yoruma dokunulmaz) · B5 (tek seçici `selectCharacterForSamples`) · B6 (hedef bağlamı, üretim hesabı) · B7 (hedef zorunlu, test hesabı) · B9 (404, tek tx, sayılı mesaj, AI hata nedeni) · B10 (karakter seçici, gerçek yük, paylaşım kapalı) · B11 (etiketler, `aria-live`, DS Select; reveal odak tuzağı hariç) · B12 (ayrı uçlar, zod, hız sınırı) · B13 (Türkçe terimler) · B14 (lazy reveal, tek tx fill). Ek: 3B rozet anı (An Motoru madalyonu) önizlemesi — §4.2 politikasındaki "rozet test laboratuvarı".

### Kalanlar
- B8 (sentetik veri metrikleri kirletir): yalnız test hesaplarında ve işaretli; kalıcı çözüm `Consumption.isSynthetic` ya da `CharacterTestOverride` → ŞEMA İSTEĞİ.
- Reveal odak tuzağı (müşteri bileşeni, başka yüzey).
- Golden set / toplu sınıflandırıcı değerlendirmesi: etiketli veri seti gerekir; yapılmadı.

### ŞEMA İSTEKLERİ
- `CharacterTestOverride(userId, categoryKey, extraCount)` ya da `Consumption.isSynthetic Boolean @default(false)` — sentetik veriyi metriklerden yapısal olarak ayırmak için.
