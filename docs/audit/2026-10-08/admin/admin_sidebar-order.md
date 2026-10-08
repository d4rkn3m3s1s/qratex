# /admin/sidebar-order

**Amaç:** Platform operatörünün admin (68 öğe), bayi (32 öğe) ve müşteri (28 öğe) kenar çubuğu menülerinin sırasını sürükle-bırak ile belirleyip `Settings.sidebarNavOrder` anahtarına yazması; sıra, her kullanıcının `Sidebar` bileşeninde `/api/settings/sidebar-order` üzerinden uygulanır.

**Genel puan: 4.5/10** · **Karar: birleştir** (`/admin/menu-groups` ve `/admin/settings` içindeki "Menü/sayfa görünürlüğü" bloğuyla tek bir "Navigasyon Yöneticisi" sayfasında)

Sayfa küçük ve temel işi yapıyor: veri modeli sade, yazma ucu ADMIN'e kısıtlı, denetim günlüğü düşülüyor. Ancak düzenleyici gerçek sidebar'ı yansıtmıyor (gruplar ve görünürlük yok), yalnızca fareyle kullanılabiliyor, kaydedilmemiş değişikliği izlemiyor, tüm rolleri her seferinde ezerek kaydediyor. Okuma tarafında da bütün kullanıcıların sidebar'ı önbelleksiz bir DB çağrısından sonra yeniden sıralanıyor ve görünür bir sıçrama yaşanıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Yükleme, sürükle-bırak ve kaydetme çalışıyor. Sıfırlama, kaydedilmemiş değişiklik takibi, önizleme ve eşzamanlı düzenleme koruması yok; yardım metni davranışı yanlış anlatıyor. |
| UX | 4/10 | 68 öğelik düz liste arama/gruplama olmadan uzun mesafeli sürükleme gerektiriyor. Gruplu müşteri/bayi menüsünün gerçek görünümünü yansıtmadığı için yapılan değişikliğin sonucu öngörülemiyor. |
| Görsel | 6/10 | Panel dilinde tutarlı (AdminPremiumHero, premium kart, sekmeler). Ama sürükleme sırasında bırakma göstergesi, sürüklenen satır vurgusu ve değişen satır işareti yok. |
| Mimari | 5/10 | Paylaşılan `applySidebarOrder` ve `getNavOrderId` iyi. Rol başına üçlü ternary tekrarları, hiç kullanılmayan `updatedAt`, birbirinden kopuk üç ayar anahtarı (sıra / grup / görünürlük) ve sunucu tarafında kimlik doğrulaması yapılmayan bir payload var. |
| Performans | 5/10 | Sayfa hafif. Ama okuma ucu her dashboard yüklemesinde önbelleksiz Prisma sorgusu çalıştırıyor ve sidebar istemcide sonradan yeniden sıralanıyor (layout shift). |
| Erişilebilirlik + mobil | 2/10 | Yalnızca HTML5 drag-and-drop var: klavye alternatifi yok, `li` odaklanamıyor, ARIA duyurusu yok. Dokunmatik cihazlarda güvenilir çalışmıyor (WCAG 2.1.1 ve 2.5.7 ihlali). |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişimi: proxy + admin gate (sayfa) | ÇALIŞIYOR | `proxy.ts:51,79` | `/admin` için ADMIN rolü ve gate cookie gerekiyor |
| 2 | API yetkisi (GET/PUT yalnızca ADMIN) | ÇALIŞIYOR | `app/api/admin/settings/sidebar-order/route.ts:25,43` | `requireAuth(['ADMIN'])` ile token-replay kontrolü yapılıyor |
| 3 | Hero (eyebrow / başlık / açıklama / ikon) | ÇALIŞIYOR | `page.tsx:104-109`, `messages/tr.json:3336-3339` | TR ve EN anahtarları mevcut |
| 4 | "Yenile" butonu (sunucudan yeniden yükle) | KISMİ | `page.tsx:112-115` | Çalışıyor, ama kaydedilmemiş değişiklikleri **onay istemeden** siliyor |
| 5 | "Tümünü kaydet" butonu | KISMİ | `page.tsx:116-119, 72-92` | Çalışıyor. Değişiklik yokken de aktif ve her seferinde 3 rolü birden gönderiyor (bkz. B3) |
| 6 | Kaydetme sırasında buton durumu ("Kaydediliyor…") | ÇALIŞIYOR | `page.tsx:118` | Spinner yok, yalnızca metin |
| 7 | Bilgi kartı "Nasıl çalışır?" | BOZUK (içerik) | `messages/tr.json:3347` ve `page.tsx:30-35` | Metin "bıraktığınız satırla **yer değiştirir**" diyor; kod ise taşıyıp araya ekliyor (splice), takas yapmıyor |
| 8 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:132-136` | Spinner ve metin var; skeleton yok |
| 9 | Yükleme hata durumu | KISMİ | `page.tsx:61-63` | Yalnızca toast gösteriliyor. Liste koddaki varsayılan sırayla açılıyor ve kullanıcı bunu kayıtlı sıra sanıp kaydedebiliyor; kalıcı hata/yeniden dene paneli yok |
| 10 | Kayıtlı sırayı koddaki öğelerle birleştirme (yeni öğe sona) | ÇALIŞIYOR | `page.tsx:24-28`, `lib/sidebar-order-settings.ts:32-53` | Koddan silinen ID'ler sessizce düşüyor |
| 11 | Rol sekmeleri (Admin / Bayi / Müşteri) | ÇALIŞIYOR | `page.tsx:138-143` | Sekme değişince dragIndex sıfırlanıyor (`page.tsx:41-43`) |
| 12 | Sürükle-bırak ile yeniden sıralama (fare) | ÇALIŞIYOR | `page.tsx:150-160` | Bırakma göstergesi ve sürüklenen satır stili yok |
| 13 | Sürükle-bırak (dokunmatik/mobil) | KISMİ (doğrulanmadı) | `page.tsx:150` | Native `draggable`; dokunmatik tarayıcılarda tutarsız, touch fallback yok |
| 14 | Klavye ile sıralama | EKSİK | `page.tsx:148-172` | `li` odaklanamıyor, yukarı/aşağı butonu ve kısayol yok |
| 15 | Sıra numarası | ÇALIŞIYOR | `page.tsx:167` | |
| 16 | Çevrilmiş etiket | ÇALIŞIYOR | `page.tsx:94-100, 168` | `sidebarNav.{role}.{labelKey}` |
| 17 | Teknik ID gösterimi (sm+) | ÇALIŞIYOR | `page.tsx:169-171` | Mobilde gizli |
| 18 | Menü ikonu gösterimi | EKSİK | `page.tsx:166` | Her satırda yalnızca grip ikonu var; gerçek menü ikonu (`item.icon`) kullanılmıyor |
| 19 | Grup bağlamı (bayi/müşteri grupları) | EKSİK | `components/dashboard/sidebar.tsx:146-150, 180-221` | Liste düz; gerçek sidebar grup başlıklarıyla render ediliyor (bkz. B1) |
| 20 | Görünürlük / feature / teamOnly bağlamı | EKSİK | `sidebar.tsx:150-172` | Gizli veya kapalı modüldeki öğeler aktifmiş gibi listeleniyor |
| 21 | Kaydedilmemiş değişiklik takibi (dirty / beforeunload) | EKSİK | `page.tsx` tamamı | |
| 22 | Varsayılana sıfırla | EKSİK | `page.tsx` | API boş dizi kabul ediyor (`route.ts:19-21`, normalize boşu düşürüyor), ama UI bunu sunmuyor |
| 23 | Son güncelleme bilgisi (zaman / kişi) | EKSİK | `route.ts:36` döndürüyor, `page.tsx:57` kullanmıyor | |
| 24 | Eşzamanlı düzenleme koruması | EKSİK | `route.ts:66-84` | Last-write-wins; `updatedAt` precondition yok |
| 25 | Sunucu doğrulaması (zod) | KISMİ | `route.ts:18-22` | Tip ve uzunluk var; dizi üst sınırı, tekilleştirme ve bilinen ID kontrolü yok |
| 26 | Rate limit | KISMİ | `route.ts:45`, `lib/rate-limit.ts:303-318` | Bellek içi `store`; serverless'ta örnek başına çalışıyor |
| 27 | Denetim günlüğü (old/new) | ÇALIŞIYOR | `route.ts:86-96` | Upsert ile aynı transaction'da değil |
| 28 | Kayıt sonrası kendi sidebar'ının güncellenmesi | EKSİK | `sidebar.tsx:62-77` (deps `[role]`) | Admin, sonucu görmek için sayfayı tamamen yenilemek zorunda |
| 29 | Kayıt hata mesajı | KISMİ | `page.tsx:84-88` | Ham `'save'` ya da İngilizce `SyntaxError` metni toast'a düşebiliyor (bkz. B6) |
| 30 | Tüketici okuma ucu `/api/settings/sidebar-order` | KISMİ | `app/api/settings/sidebar-order/route.ts:16-30` | Doğru rolü döndürüyor, ama önbellek ve try/catch yok |
| 31 | Sidebar'da sıranın uygulanması | KISMİ | `sidebar.tsx:173` | İstemcide sonradan uygulanıyor; varsayılan sıradan kayıtlı sıraya sıçrama oluyor (bkz. B4) |
| 32 | Arama / filtre (68 öğe) | EKSİK | | |
| 33 | Azaltılmış hareket desteği | ÇALIŞIYOR (kısmen ilgisiz) | `components/admin/admin-premium-hero.tsx:9,37` | Sayfada liste animasyonu zaten yok |

Toplam 33 özellik: ÇALIŞIYOR 14 · KISMİ 10 · BOZUK 1 · SAHTE 0 · EKSİK 8 (#13 "kısmi/doğrulanmadı", #33 "çalışıyor" sayıldı).

---

## Bulgular

### B1. Yüksek · UX/Veri modeli: Düzenleyici, bayi/müşteri menüsünün gerçek render'ını yansıtmıyor
- **Kanıt:** `components/dashboard/sidebar.tsx:146-150` (dealer/customer grupları), `sidebar.tsx:178-221` ("Grubun konumu, o gruba ait ilk öğenin sıradaki yeridir"), `page.tsx:146-173` (düz liste), `lib/sidebar-groups-settings.ts:9`.
- **Sorun:** Gerçek sidebar'da bayi ve müşteri öğeleri grup başlıkları altında toplanıyor ve bir grubun yeri, o gruptaki *ilk* öğenin sırasına göre belirleniyor. Admin örneğin "Analitik" grubundan bir öğeyi listenin başına sürüklerse bütün Analitik grubu en üste çıkıyor. Grubun içinde kalan diğer öğeler ise düz listede gösterilen yerlerinden kopup grup bloğuna toplanıyor. Ayrıca `/admin/menu-groups` sayfasındaki `itemGroups` override'ı öğeleri başka gruba taşıyabiliyor, ama bu sayfa bunu bilmiyor. Sonuç olarak admin'in gördüğü sıra ile kullanıcının gördüğü sıra farklı.
- **Öneri:** Düzenleyici gerçek render modelini kullanmalı. `sidebar.tsx` içindeki blok üretimi (`navBlocks`) saf bir fonksiyon olarak `lib/sidebar-model.ts` dosyasına taşınmalı (`buildNavBlocks(items, order, groupOverride, visibility)`). Hem sidebar hem düzenleyici bunu çağırmalı. Düzenleyicide iki seviyeli bir ağaç olmalı: grupların kendi arasındaki sırası ve grup içindeki öğe sırası. Grubu bütün olarak taşımak ve öğeyi gruplar arasında sürüklemek (itemGroups'u güncelleyerek) aynı yerden yapılabilmeli. Yanında canlı bir "sidebar önizlemesi" paneli bulunmalı.
- **Efor:** L

### B2. Yüksek · Erişilebilirlik/Mobil: Sıralama yalnızca fareyle yapılabiliyor
- **Kanıt:** `page.tsx:148-165`. Yalnızca `draggable`, `onDragStart`, `onDragOver` ve `onDrop` var; `tabIndex`, `role`, `aria-*` ve klavye işleyicisi yok.
- **Sorun:** Klavye kullanıcıları ve ekran okuyucular sırayı değiştiremiyor (WCAG 2.1.1). Sürüklemeye tek-işaretçi alternatifi de yok (WCAG 2.2 / 2.5.7). Native HTML5 DnD dokunmatik tarayıcılarda tutarlı çalışmıyor ve layout `main` alanında mobil alt boşluk ayırıyor (`app/admin/layout.tsx:38`), yani mobil kullanım öngörülmüş. 68 öğelik listede uzun mesafeli sürükleme sırasında otomatik kaydırma tarayıcıya bırakılmış.
- **Öneri:** `@dnd-kit/sortable` kullanılmalı (Pointer + Keyboard sensörleri, `sortableKeyboardCoordinates`, otomatik kaydırma, `announcements` ile canlı bölge duyuruları). Her satıra "Yukarı / Aşağı / En üste / En alta" ikon butonları ve "Pozisyona taşı" sayısal girişi eklenmeli. Odaklanan satırda Alt+↑/↓ kısayolu çalışmalı. Sürüklenen satır için `DragOverlay`, bırakma noktası için 2px vurgu çizgisi gösterilmeli; `prefers-reduced-motion` açıkken yerleşme animasyonu kapanmalı.
- **Efor:** M

### B3. Orta · Veri bütünlüğü: Her kayıt üç rolü birden yazıyor; eşzamanlı düzenleme sessizce kayboluyor
- **Kanıt:** İstemci her seferinde `admin`, `dealer` ve `customer` dizilerinin üçünü de gönderiyor (`page.tsx:78-82`). Sunucu yalnızca gelen alanları birleştiriyor (`route.ts:70-74`) ama gelen hep üçü oluyor. `updatedAt` dönüyor (`route.ts:36`), istemci ise bunu okumuyor (`page.tsx:57`).
- **Sorun:** Admin A sayfayı açıp yalnızca admin menüsünü değiştirir, bu arada Admin B müşteri menüsünü kaydederse, A'nın kaydı B'nin müşteri sırasını A'nın eski kopyasıyla ezer. Uyarı çıkmaz, sonuç yalnızca audit log'da görünür.
- **Öneri:** İstemci rol başına "dirty" durumunu izlemeli ve PUT'a yalnızca değişen rolleri koymalı (API bunu zaten destekliyor). Optimistic concurrency eklenmeli: istemci `If-Match: <updatedAt>` (veya `baseUpdatedAt` alanı) göndermeli, sunucu uyuşmazlıkta 409 ve güncel payload döndürmeli, UI da "Başka bir admin bu sırayı değiştirdi: farkı gör / üzerine yaz" seçeneğini göstermeli. Upsert ile auditLog yazımı `prisma.$transaction` içine alınmalı.
- **Efor:** M

### B4. Orta · Performans/UX (tüm kullanıcılar): Sidebar önbelleksiz DB okuması bekliyor, sonra yeniden sıralanıyor
- **Kanıt:** `components/dashboard/sidebar.tsx:46, 62-77` (`sidebarOrder` başta `null`, fetch sonrası set ediliyor). `sidebar.tsx:173` (`applySidebarOrder(..., sidebarOrder)`). `app/api/settings/sidebar-order/route.ts:17-27`: her çağrıda `requireAuth` (token-replay) ve `prisma.settings.findUnique` çalışıyor, Redis/`unstable_cache` yok.
- **Sorun:** Admin, bayi ve müşteri dashboard'unun her ilk yüklemesinde sidebar önce koddaki varsayılan sırayla çiziliyor, sonra kayıtlı sıraya atlıyor. Bu görünür bir sıçrama ve CLS demek. Değeri haftada belki bir kez değişen bir ayar için her oturum açılışında canlı Neon'a ayrı bir round-trip gidiyor. Aynı desen `sidebar-groups` ve `visibility` için de tekrarlanıyor (`sidebar.tsx:80-97, 113`), yani sidebar başına 3 ayrı ayar isteği yapılıyor.
- **Öneri:** Sıra, grup ve görünürlük tek bir `getNavigationConfig(role)` sunucu helper'ında birleştirilmeli. Helper `unstable_cache` / Upstash ile tag tabanlı (`nav-config`) önbelleklenmeli, PUT'larda `revalidateTag` çağrılmalı. Build-time DB fail-safe kuralına uygun olarak try/catch ve varsayılan değer içermeli. `app/admin/layout.tsx` (ve dealer/customer layout'ları) bu config'i sunucuda okuyup `Sidebar`'a prop olarak geçmeli; böylece ilk render doğru sırayla gelir ve üç istemci fetch'i kalkar.
- **Efor:** M

### B5. Orta · UX: Kaydedilmemiş değişiklik takibi, onay ve sıfırlama yok
- **Kanıt:** `page.tsx:112` ("Yenile" doğrudan `load()` çağırıyor), `page.tsx:116` (buton yalnızca `saving || loading` iken kapalı), dirty state ve `beforeunload` yok.
- **Sorun:** Admin 20 sürükleme yaptıktan sonra yanlışlıkla "Yenile"ye basarsa ya da sayfadan çıkarsa her şey sessizce kayboluyor. Değişiklik olmadan "Tümünü kaydet" yine aktif ve gereksiz bir audit kaydı üretiyor. Koddaki varsayılan sıraya dönmenin yolu yok.
- **Öneri:** Yüklenen snapshot ile mevcut durum karşılaştırılarak rol başına dirty hesaplanmalı ve sekme etiketinde nokta rozeti gösterilmeli. Sayfanın altında yapışkan bir "N değişiklik · Geri al · Kaydet" çubuğu (Linear/Stripe ayar deseni) olmalı. Satır bazında "taşındı" işareti (eski pozisyon → yeni pozisyon) eklenmeli. Yenile ve sayfadan çıkış için inline onay gösterilmeli. "Bu rolü varsayılana sıfırla" eylemi API'ye boş dizi gönderecek şekilde bağlanmalı (onay adımıyla).
- **Efor:** S-M

### B6. Düşük · Hata yönetimi/Dil: Kayıt hatasında ham anahtar veya İngilizce JS hatası gösteriliyor
- **Kanıt:** `page.tsx:84-88`. `data.error` yoksa `new Error('save')` fırlatılıyor ve toast'a "save" yazısı düşüyor. Yanıt JSON değilse (ör. Next 500 HTML sayfası; `route.ts` GET/PUT'ta try/catch yok) `res.json()` İngilizce bir `SyntaxError` mesajı üretiyor. Sunucu mesajları sabit Türkçe (`route.ts:48, 62`), EN arayüzde de Türkçe görünüyor.
- **Öneri:** API hata kodu döndürmeli (`{ code: 'RATE_LIMITED' | 'INVALID_PAYLOAD' | 'CONFLICT' }`). İstemci bu kodu `t('adminSidebarOrder.errors.*')` ile çevirmeli, bilinmeyen durumda `saveError` göstermeli. `res.json()` çağrısı `.catch(() => null)` ile korunmalı. Route handler'lar try/catch ile sarılmalı ve tutarlı bir JSON 500 döndürmeli.
- **Efor:** S

### B7. Düşük · Veri bütünlüğü: Sunucu payload'ı kimlik ve tekillik açısından doğrulamıyor
- **Kanıt:** `route.ts:18-22` (dizi üst sınırı, dedupe ve bilinen ID kontrolü yok). `lib/sidebar-order-settings.ts:41-46`: `applySidebarOrder` tekrar eden ID'yi `seen` kontrolü yapmadan tekrar push ediyor.
- **Sorun:** API'ye doğrudan (ör. script ile) `["/admin/users","/admin/users"]` gönderilirse öğe her kullanıcının sidebar'ında iki kez görünür ve React duplicate key uyarısı oluşur. Bu sayfa da aynı çift ID'yi `key={r-id}` ile render eder (`page.tsx:149`). Bilinmeyen ID'ler kalıcı olarak Settings'te birikir. Yazma yalnızca ADMIN'e açık olduğundan risk düşük.
- **Öneri:** zod'da `.max(200)` ve `.refine(arr => new Set(arr).size === arr.length)` olmalı. `applySidebarOrder` içinde `if (it && !seen.has(oid))` kontrolü eklenmeli. Kayıttan önce ID'ler koddaki kataloğa (`adminNavItems` vb., sunucu tarafında paylaşılabilir saf bir modülden) karşı filtrelenmeli. Bu, ikon importları yüzünden `sidebar.tsx`'in sunucuya çekilmemesi için katalog verisinin ayrı bir `lib/nav-catalog.ts` dosyasına taşınmasını gerektirir.
- **Efor:** S

### B8. Düşük · İçerik: Yardım metni gerçek davranışla çelişiyor
- **Kanıt:** `messages/tr.json:3347` ve `messages/en.json:3347` ("yer değiştirir" / "swap positions") ile `page.tsx:30-35` (`splice` ile taşıyıp araya ekleme).
- **Sorun:** Admin, iki öğenin takas edileceğini bekliyor; gerçekte aradaki tüm öğeler bir kayıyor.
- **Öneri:** Metin "Bıraktığınız satırın yerine taşınır, aradakiler kayar" şeklinde düzeltilmeli. dnd-kit'e geçildiğinde canlı yerleşme animasyonu zaten bu davranışı açıkça gösterecek.
- **Efor:** S

### B9. Düşük · UX: Kayıt sonrası admin'in kendi sidebar'ı güncellenmiyor
- **Kanıt:** `sidebar.tsx:62-77`: fetch yalnızca `[role]` değişince çalışıyor. `page.tsx:86` başarı toast'ından sonra hiçbir yayın veya invalidation yapılmıyor.
- **Öneri:** B4 uygulandıktan sonra PUT'tan sonra `router.refresh()` çağrılmalı (layout sunucudan yeniden okur). B4'ten önceki geçici çözüm olarak bir `nav-config-changed` CustomEvent / BroadcastChannel ile sidebar'a refetch tetiklenebilir.
- **Efor:** S

### B10. Düşük · Bilgi mimarisi: Gizli veya devre dışı öğeler ayırt edilmiyor
- **Kanıt:** `sidebar.tsx:150-172`: bayi ve müşteri menüleri `menuVisibility`, `featureVisibility`, `moduleControls` ve `teamOnly` ile filtreleniyor. Düzenleyici bu filtrelerin hiçbirini göstermiyor (`page.tsx:147`).
- **Sorun:** Admin, kullanıcıların hiç görmediği öğeleri (kapalı modül, teamOnly "Ekip") sıralarken zaman harcıyor ve gerçek menünün kaç öğeden oluştuğunu bilmiyor.
- **Öneri:** Satırda "Gizli", "Modül kapalı" ve "Yalnız ekip" rozetleri gösterilmeli; görünürlük anahtarı aynı satırda olmalı (bkz. birleştirme önerisi). "Yalnızca görünenleri göster" filtresi eklenmeli.
- **Efor:** S (birleştirmeyle birlikte M)

### B11. Düşük · Mimari/Bakım: Rol başına ternary tekrarları ve hook sırası
- **Kanıt:** `page.tsx:95-96, 147, 156-157`: aynı `r === 'admin' ? … : …` üçlüsü dört kez geçiyor. `page.tsx:41-43`: `setDragIndex` tanımından (`page.tsx:49`) önce bir effect içinde kullanılıyor. Effect render sonrasında çalıştığı için hata vermiyor, ama okunabilirliği bozuyor. `dragend`'de `dragIndex` sıfırlanmıyor: liste dışına bırakılarak iptal edilen sürüklemeden sonra eski indeks kalıyor ve dışarıdan gelen bir drag (ör. seçili metin) listeye bırakılırsa beklenmeyen bir taşıma yapılabiliyor (doğrulanmadı, mantıksal çıkarım).
- **Öneri:** Durum `Record<RoleTab, string[]>` olarak tek `useReducer` içinde tutulmalı (`MOVE`, `RESET_ROLE`, `LOAD` aksiyonları); katalog da `Record<RoleTab, NavItem[]>` olmalı. `onDragEnd` içinde `setDragIndex(null)` çağrılmalı. dnd-kit'e geçişte bu sorunların hepsi ortadan kalkar.
- **Efor:** S

### B12. Bilgi · Güvenlik: API uçları admin gate'e değil yalnızca role dayanıyor (sistem geneli, doğrulanmadı)
- **Kanıt:** `proxy.ts:79`: gate cookie kontrolü `pathname.startsWith('/admin')` için yapılıyor. `/api/admin/...` yolu bu önekle başlamıyor. Route'ta yalnızca `requireAuth(['ADMIN'])` var (`route.ts:25,43`).
- **Not:** ADMIN rolüne sahip ama gate'i geçmemiş bir oturum bu ucu doğrudan çağırabilir. Gate'in tasarım amacı bu ise sorun yok. Değilse tüm `/api/admin/*` için ortak bir `requireAdminGate()` kontrolü düşünülmeli. Bu sayfaya özgü bir durum değil, kayda geçmesi için not edildi.

---

## Eksik özellikler (Stripe Dashboard, Linear, Retool, PostHog kıyası)

1. **Canlı önizleme:** Linear'ın sidebar özelleştirmesi ve Retool'un navigasyon düzenleyicisi gibi, değişikliğin sonucunu gerçek sidebar bileşeniyle yan panelde göstermek (rol, grup, görünürlük birlikte).
2. **Erişilebilir sıralama:** Klavye ve ekran okuyucu desteği, "Pozisyona taşı" ve yukarı/aşağı butonları (Stripe ayar listeleri ve GitHub proje alanı sıralaması bunu sunuyor).
3. **Sürüm geçmişi ve geri alma:** AuditLog zaten old/new tutuyor. "Son 10 değişiklik · kim · ne zaman · bu sürüme dön" paneli PostHog'un ayar geçmişine denk düşüyor.
4. **Taslak ve yayınla:** Değişiklikleri önce taslak olarak saklayıp, önizleme bağlantısıyla (ör. `?navPreview=draft`) bir rol olarak gezdikten sonra yayınlamak.
5. **Segment ve bayi bazlı sıra:** Şu an tek global sıra var. Ürün seviyesinde bayi segmentine (dealer segment merkezi mevcut) veya plan katmanına göre farklı menü sunmak, kişiselleştirme için doğal bir sonraki adım.
6. **Kullanım verisiyle önerilen sıra:** PostHog'daki menü tıklama verisine göre "en çok kullanılanları yukarı al" önerisi; operatör onayıyla uygulanır.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör tek bir "Navigasyon" ekranında rol seçiyor ve o rolün menüsünü *kullanıcının göreceği haliyle* düzenliyor. Grupları ve öğeleri sürüklüyor ya da klavyeyle taşıyor, görünürlüğü aynı satırdan açıp kapatıyor, grup adını yerinde düzenliyor. Sağdaki canlı önizleme anında güncelleniyor. Yapışkan alt çubukta değişiklik sayısı, Geri al ve Kaydet var. Kaydettiğinde kendi sidebar'ı da hemen yenileniyor.

**Yerleşim (masaüstü):**
- Üst: kompakt başlık. "Son güncelleme: 3 gün önce · Furkan" ve "Geçmiş" bağlantısı.
- Sol (≈60%): Rol segment kontrolü (Admin / Bayi / Müşteri, her birinde dirty noktası), arama kutusu ve "Yalnız görünenler" filtresi. Altında iki seviyeli sortable ağaç: grup başlıkları katlanabilir ve bütün olarak taşınabilir; öğe satırlarında menü ikonu, etiket, rozetler (Gizli / Modül kapalı / Yalnız ekip / Yeni), görünürlük switch'i, satır menüsü (Üste / Alta / Gruba taşı / Pozisyon).
- Sağ (≈40%, yapışkan): gerçek `Sidebar` render fonksiyonuyla çizilen önizleme. Masaüstü ve mobil sheet görünümü arasında geçiş yapılabiliyor.
- Alt: yapışkan değişiklik çubuğu.

**Mobil:** Önizleme bir sekmeye iniyor. Sıralama satır menüsü ve yukarı/aşağı butonlarıyla yapılıyor; sürükleme yalnızca tutamaçtan, dnd-kit'in TouchSensor'ı ve `delay` ayarıyla.

**Motion (ölçülü):** dnd-kit'in `transform` tabanlı yerleşme animasyonu (150–200 ms) yeterli. Sürüklenen kart için hafif yükselme ve gölge, bırakılan satırda kısa bir arka plan vurgusu, önizlemede değişen öğede 600 ms'lik nabız. `prefers-reduced-motion` açıkken hepsi anlık geçişe düşmeli. Global LazyMotion'daki `m as Motion` yalnızca alt çubuğun giriş/çıkışında kullanılmalı. 3D veya dekoratif efekte yer yok; bu bir operasyon aracı.

**Veri/API değişiklikleri:**
- Tek anahtar: `Settings.navigationConfig = { version, roles: { admin|dealer|customer: { order: string[], groupOrder?: string[], itemGroups?, groupLabels?, hidden?: string[] } } }`. Mevcut üç anahtardan (`sidebarNavOrder`, sidebar-groups, menuVisibility) tek seferlik bir migration ile taşınmalı ve geçiş süresince okuyucu geriye uyumlu kalmalı.
- `GET/PUT /api/admin/navigation`: PUT rol bazında kısmi olmalı, `baseVersion` ile 409 çakışma dönebilmeli, zod ile katalog doğrulaması ve dedupe yapmalı, transaction içinde audit log yazmalı ve `revalidateTag('nav-config')` çağırmalı.
- `GET /api/admin/navigation/history`: AuditLog'dan son N sürüm; `POST …/restore`.
- `lib/nav-catalog.ts`: ikonsuz, sunucuda da kullanılabilir saf katalog (key, href, labelKey, groupKey, featureKey, moduleKey, teamOnly). İkon eşlemesi istemci tarafında kalmalı.
- `lib/sidebar-model.ts`: `buildNavBlocks()`. Sidebar ve düzenleyici aynı fonksiyonu kullanmalı.
- Layout'lar `getNavigationConfig(role)` (önbellekli, fail-safe) ile config'i sunucuda okuyup `Sidebar`'a prop geçmeli; istemci tarafındaki 3 ayar fetch'i kalkmalı.

---

## Çakışmalar / birleştirme önerisi

Bu sayfa tek bir kavramın, yani "rol bazlı navigasyon yapısı"nın üç parçasından biri. Diğer iki parça başka sayfalarda:

| Sayfa | Yönettiği | Kanıt |
|---|---|---|
| `/admin/sidebar-order` | Öğe sırası (3 rol) | `Settings.sidebarNavOrder` |
| `/admin/menu-groups` | Grup etiketleri ve öğenin grubu (yalnızca bayi/müşteri) | `app/admin/menu-groups/page.tsx:19-56`, `/api/admin/settings/sidebar-groups` |
| `/admin/settings` → "Menü/sayfa görünürlüğü" | Öğe görünürlüğü (bayi/müşteri) | `app/admin/settings/settings-client.tsx:2006-2028` |

Üçü aynı katalogu (`components/dashboard/sidebar.tsx` exportları) okuyor ve aynı render fonksiyonunu etkiliyor, ama birbirlerinin etkisini göstermiyorlar. Grup sırası örtük olarak öğe sırasından türüyor; bu yüzden admin bir sayfada yaptığı değişikliğin sonucunu ancak diğer sayfadaki ayarı da bilerek tahmin edebiliyor. Admin sidebar'ında da iki ayrı menü maddesi var (`sidebar.tsx:200-201`).

**Öneri:** Bu sayfa `/admin/menu-groups` ile birleştirilip `/admin/navigation` ("Navigasyon Yöneticisi") olmalı. `/admin/settings` içindeki menü görünürlüğü bloğu bu sayfaya taşınmalı ve Ayarlar'da yalnızca bir bağlantı bırakılmalı. Eski iki rota `redirect` ile yeni sayfaya yönlenmeli, admin menüsünde tek madde kalmalı. Bu birleştirme B1, B4, B9 ve B10'u yapısal olarak çözüyor.
