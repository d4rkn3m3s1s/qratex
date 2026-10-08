# /admin/segments

**Amaç:** Platform operatörüne tüm `CUSTOMER` rolündeki kullanıcıların davranışa dayalı altı segmente (VIP, Sadık, Aktif, Yeni, Riskli, Pasif) dağılımını göstermek ve seçilen segmentten örnek müşterileri listelemek. Segmentasyon, istek anında `app/api/admin/segments/route.ts` içinde sabit kodlu kurallarla hesaplanıyor.

**Genel puan:** 3.9 / 10

**Karar:** **yeniden inşa.** Sayfa salt okunur, tek ekranlık bir "sayaç + 10 kişilik önizleme" görünümü. Arkasındaki sınıflandırma motoru veri bütünlüğü hataları içeriyor: soft-delete edilmiş yorumları sayıyor, 10.000 kullanıcıda sessizce kesiliyor ve en yeni müşterileri dışarıda bırakıyor, VIP önceliği yüzünden kaybedilen VIP'leri "Riskli"de göstermiyor. Daha önemlisi, platformda aynı adları (VIP / Sadık / Risk) farklı anlamlarla kullanan **dört ayrı segment tanımı** var. Bu sayfa bunlardan hiçbiriyle hizalı değil ve hiçbir aksiyona bağlanmıyor. Sayfanın UI'ı kısmen korunabilir. Ancak veri kaynağı, günlük cron'la hesaplanan `CustomerLifetimeValue` + `CustomerSegment` tablolarına (tek doğruluk kaynağı) taşınmalı ve sayfa "segment → kişiler → aksiyon" akışına dönüştürülmeli.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Sayılar görünüyor ama yanlış: silinmiş yorumlar sayılıyor, 10k üstü müşteri kesiliyor, "Pasif"/"Yeni" açıklamaları kurallarla çelişiyor. Müşteri listesi rastgele denebilecek 10 kişi (id sırasıyla). |
| UX | 4/10 | Kart ve dağılım çubuğu okunaklı. Ancak detay paneli ekranın altında açılıyor ve kaydırılmıyor. Hata ile boş durum aynı mesajı gösteriyor, URL durumu yok, satırlar tıklanamıyor, aksiyon yok. |
| Görsel | 6/10 | Ortak `AdminPremiumHero` ve kart dili tutarlı, renk kodlaması anlaşılır. Lucide ikon ile emoji çift kullanılıyor, hero ikonu (Shield) başlık ikonuyla (PieChart) çelişiyor, kartlar arasında hiyerarşi yok. |
| Mimari | 2/10 | Segment mantığı route içinde sabit kodlu ve test edilmiyor. `clv-core`, kampanya gönderimi ve `UserVIPStatus` ile aynı adları farklı anlamla kullanıyor. Açıklamalar istemcide ayrıca sabit kodlu, ölü import'lar var. |
| Performans | 4/10 | Her istekte 10.000'e kadar kullanıcı, satır başına 3 ilişki sayımıyla (biri hiç kullanılmıyor) belleğe çekiliyor. Önbellek yok ve aynı uç her admin dashboard açılışında da çağrılıyor (gerçek süre ölçülmedi). |
| Erişilebilirlik + mobil | 4/10 | Grid mobilde 2 sütuna iniyor. Ancak seçilebilir kartlar ve çubuk dilimleri `div onClick` olduğundan klavyeyle erişilemiyor. `aria-pressed` yok, yalnızca renkle kodlanmış lejant var, `hover:scale-105` dokunmatikte anlamsız. Sayfa i18n dışı. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | API yetki kontrolü (yalnız ADMIN + token-replay) | ÇALIŞIYOR | `app/api/admin/segments/route.ts:11-12`, `lib/api-auth.ts:52-80` | IDOR yüzeyi yok (parametre almıyor). Admin gizli kapısı proxy katmanında ayrıca var. |
| 2 | Veri çekme (`useQuery`, `['admin','segments']`, staleTime 60 sn) | ÇALIŞIYOR | `app/admin/segments/page.tsx:86-95` | Global `retry: 1` (`components/providers.tsx:212`). |
| 3 | Yükleniyor durumu | KISMİ | `page.tsx:100-107` | Tüm sayfa spinner'a dönüyor, hero bile kayboluyor. İskelet yok, metin "analiz ediliyor" diyor ama AI analizi yok. |
| 4 | Hata durumu | BOZUK | `page.tsx:86` (`isError` okunmuyor), `page.tsx:139-144` | API 500/403 dönünce `segments=[]` olur ve "Henüz segment yok veya veriler yüklenemedi" görünür. Hata, boş veriyle aynı mesajı alıyor. Yeniden deneme yok, hata ayrıntısı yok. |
| 5 | Hero: başlık, açıklama, eyebrow | SAHTE | `page.tsx:113-121` | "AI destekli otomatik müşteri segmentasyonu" iddiası yanlış: segmentasyon `route.ts:64-87`'deki sabit `if/else` kuralları, hiçbir AI çağrısı yok. |
| 6 | "Yenile" butonu | KISMİ | `page.tsx:123-128` | `refetch()` çalışıyor ama `isFetching` gösterilmiyor, buton kilitlenmiyor, başarı/başarısızlık geri bildirimi yok. Kullanıcı bir şeyin olup olmadığını anlayamıyor. |
| 7 | "Toplam müşteri" sayacı | KISMİ | `page.tsx:130-135`, `route.ts:17,111` | `customers.length` değeri `take: 10_000` ile sınırlı. 10k üstünde yanlış toplam gösterir ve kesildiğine dair uyarı yok. |
| 8 | 6 segment kartı (ikon, ad, sayı, %) | ÇALIŞIYOR | `page.tsx:146-170` | Görsel olarak doğru. Sayıların doğruluğu #20'ye bağlı. |
| 9 | Kart seç/kaldır (toggle) | KISMİ | `page.tsx:152-155` | Fareyle çalışıyor. `Card` bir `div`: `role`, `tabIndex`, `onKeyDown` ve `aria-pressed` yok, klavyeyle erişilemiyor. |
| 10 | Segment yüzde etiketi | KISMİ | `page.tsx:163` | `Math.round` her dilimde ayrı uygulandığından toplam %99/%101 olabilir. Ayrıca payda kesilmiş toplam (#7). |
| 11 | Boş durum (segment yok) | KISMİ | `page.tsx:139-144`, `page.tsx:174-199` | Boş durumda bile "Segment Dağılımı" kartı içi boş bir çubukla render ediliyor. Mesaj hata ile karışık (#4). |
| 12 | Dağılım çubuğu (yatay yığılmış bar, tıklanınca seç) | KISMİ | `page.tsx:174-189` | Animasyonlu ve tıklanabilir. Ancak dilimler `div onClick` (klavye yok), bilgi yalnızca `title` tooltip'inde (dokunmatikte görünmez), seçili dilim vurgulanmıyor, tekrar tıklayınca kaldırma yok (kartlardan farklı davranış). |
| 13 | Lejant | ÇALIŞIYOR | `page.tsx:190-197` | Tıklanamıyor (kart/çubukla tutarsız). Yalnızca renk noktası var. |
| 14 | Segment detay başlığı (emoji + ad + sayı) | ÇALIŞIYOR | `page.tsx:205-209` | Sayı tüm segmenti, liste ise yalnızca 10 kişiyi gösteriyor (#16). |
| 15 | Segment açıklamaları | KISMİ | `page.tsx:210-217` ↔ `route.ts:64-87` | İstemcide sabit kodlu ve kurallarla çelişiyor: "Yeni = son 7 günde katılanlar" ama 7 gün içinde 2+ yorum yapan yeni kullanıcı "Aktif"e düşüyor. "Pasif = uzun süredir aktif olmayan" ama son 30 günde 1 yorum yapan kullanıcı da "Pasif". "VIP" eşikleri (Lv5, 20 yorum, 3 rozet) gösterilmiyor. |
| 16 | Segment müşteri önizlemesi | KISMİ | `route.ts:18,96`, `page.tsx:224-245` | Her segmentten yalnızca ilk 10 kişi geliyor ve sıralama `id asc` (cuid ≈ en eski kayıtlar). Yani "Riskli"de en değerli riskli müşteriler değil, en eski 10 kişi görünüyor. "10 / N gösteriliyor" bilgisi ve "tümünü gör" yok. |
| 17 | Satır: avatar, ad, e-posta | ÇALIŞIYOR | `page.tsx:228-237` | `AvatarImage src=''` boş string ile render ediliyor (`page.tsx:229`). Fallback çalışıyor ama gereksiz istek/uyarı riski var (doğrulanmadı). |
| 18 | Satır: seviye ve puan rozetleri | ÇALIŞIYOR | `page.tsx:238-243` | |
| 19 | Segmentte müşteri yok mesajı | ÇALIŞIYOR | `page.tsx:220-221` | |
| 20 | Segment sınıflandırma motoru (sunucu) | BOZUK | `route.ts:15-88` | Soft-delete edilmiş yorumlar sayılıyor (`deletedAt` filtresi yok: `route.ts:27-31`, `route.ts:43-47`). `shadow_ban`/`flagged` kullanıcılar dahil. VIP önceliği kaybedilen VIP'leri "Riskli"den gizliyor. Ayrıntı Bulgular B1–B4'te. |
| 21 | Giriş animasyonları (kart stagger, bar genişliği, detay, satırlar) | ÇALIŞIYOR | `page.tsx:151,181-182,203,225` | Stagger `Math.min(i,10)` ile sınırlı, ölçülü. |
| 22 | Azaltılmış hareket desteği | KISMİ | `components/providers.tsx:232` (`MotionConfig reducedMotion="user"`), `page.tsx:153` | Framer transform animasyonları kapanıyor. Ancak bar `width` animasyonu transform olmadığı için sürüyor, Tailwind `hover:scale-105` için `motion-reduce:` varyantı yok. |
| 23 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:146` (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`), `page.tsx:234-238` | Satırlarda `truncate` ve `shrink-0` doğru. Detay paneli seçimden sonra ekran dışında kalıyor (bkz. B9). |
| 24 | Yorum ve rozet sayısının gösterimi | EKSİK | `route.ts:103-104`, `page.tsx:42-43` | API `feedbackCount` ve `badgeCount` döndürüyor, tip tanımlı, UI hiç göstermiyor. Segment kuralının gerekçesi görünmüyor. |
| 25 | Müşteri satırından detaya geçiş | EKSİK | `page.tsx:225-244` | Satır tıklanamıyor. `/admin/users/[id]` rotası yok (`app/admin/users/` altında yalnızca `page.tsx`, `users-client.tsx` var) ve kullanıcılar sayfası URL parametresi okumuyor. |
| 26 | URL durumu (`?segment=risk`) | EKSİK | `page.tsx:84` (yalnızca `useState`) | Seçim paylaşılamıyor, yenilemede kayboluyor. |
| 27 | Admin dashboard → segment derin bağlantısı | KISMİ | `app/admin/admin-dashboard-client.tsx:589` | Dashboard'daki her segment rozeti `/admin/segments`'e gidiyor ama hangi segmente tıklandığı taşınmıyor (#26 eksik olduğu için). |
| 28 | Dışa aktarma (CSV) | EKSİK | — | Segment listesi indirilemiyor. |
| 29 | Segmentten aksiyon (bildirim, kampanya, kupon, sürpriz kutu, playbook) | EKSİK | — | `app/admin/playbooks/page.tsx:98` bu sayfaya "Segmentler" diye bağlanıyor ama dönüş yolu yok. |
| 30 | Zaman içinde trend (segment geçişleri, haftalık değişim) | EKSİK | `route.ts:38-40` | Yalnızca anlık görüntü var, tarihçe saklanmıyor. |
| 31 | Kural şeffaflığı ve düzenleme | EKSİK | `route.ts:64-87` | Eşikler sabit kodlu, UI'da görünmüyor. `CustomerSegment.criteria` (Json) alanı var ama bu sayfa kullanmıyor. |
| 32 | Arama, filtre, sıralama, sayfalama | EKSİK | — | Segment içi tam liste yok. |
| 33 | i18n | EKSİK | `page.tsx:104,114-120,142,176,208-221`, `route.ts:52-57` | Sidebar etiketi `messages/en.json:2489` ile çevrilebilir. Sayfa ve API'den gelen segment adları ise sabit Türkçe. |
| 34 | Sayfa `<title>` metadata | EKSİK | `app/admin/layout.tsx:11-21`, `app/admin/segments/` (layout yok) | Sekme başlığı yalnızca varsayılan admin etiketi. Admin sayfalarının çoğunda aynı durum var (65 sayfaya karşı 8 layout). |
| 35 | Sunucu tarafı önbellek | EKSİK | `route.ts:7` (`force-dynamic`), `lib/redis.ts:81` (`cachedJson` mevcut, kullanılmıyor) | Ağır sorgu her açılışta yeniden koşuyor. |

**Durum özeti:** ÇALIŞIYOR 10 · KISMİ 11 · BOZUK 2 · SAHTE 1 · EKSİK 11 (toplam 35)

---

## Bulgular

### B1 — Soft-delete edilmiş yorumlar segmenti belirliyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü · **Efor:** S
- **Kanıt:** `app/api/admin/segments/route.ts:27-31` (`_count: { feedbacks: true, ... }` filtresiz), `route.ts:43-47` (`groupBy` `where` içinde `deletedAt` yok). Model: `prisma/schema.prisma` Feedback, `deletedAt DateTime? // soft delete; null = active`.
- **Sorun:** Admin ya da sahte yorum tespiti tarafından silinen yorumlar hem toplam yorum sayısına (VIP eşiği ≥20, Riskli eşiği ≥3) hem son 30 gün sayısına (Sadık ≥5, Aktif ≥2) giriyor. Somut senaryo: 20 sahte yorumu silinmiş bir kullanıcı Lv5 ve 3 rozetle hâlâ "VIP" görünür. `trustFlagged`, `fraudScore` ve `User.fraudStatus = 'shadow_ban'` da hiç dikkate alınmıyor. Platformun güven altyapısını (trust-command, fraud-prevention) segment görünümü yok sayıyor.
- **Öneri:** `_count.select.feedbacks` için `{ where: { deletedAt: null } }` filtreli sayım kullanılmalı, `groupBy` `where` koşuluna `deletedAt: null` eklenmeli. Kullanıcı sorgusunda `fraudStatus: { not: 'shadow_ban' }` filtrelenmeli ya da bu kullanıcılar "Şüpheli" diye ayrı bir kova olarak gösterilmeli. Kalıcı çözüm B3'teki tek segment motorudur.

### B2 — 10.000 kullanıcıda sessiz kesilme; en yeni müşteriler dışarıda kalıyor
- **Önem:** yüksek · **Kategori:** doğruluk / ölçeklenebilirlik · **Efor:** M
- **Kanıt:** `route.ts:15-18` (`take: 10_000, orderBy: { id: 'asc' }`), `route.ts:111` (`totalCustomers: customers.length`), `page.tsx:133`.
- **Sorun:** cuid kimlikleri zamana göre artan sırada olduğundan `id asc` en eski 10.000 müşteriyi seçer. Platform 10k müşteriyi geçtiği anda en son katılanlar hesaplanmaz. "Yeni" segmenti fiilen sıfıra iner, "Toplam müşteri" 10.000'de donar ve UI'da kesildiğine dair hiçbir işaret yok. Operatör büyümenin durduğunu sanabilir.
- **Öneri:** Segmentasyon uygulama belleğinde değil veritabanında yapılmalı. (a) Kısa vadede sayımlar SQL `CASE WHEN` + `GROUP BY` ile tek sorguda alınmalı (Prisma `$queryRaw`, tipli sonuç), önizleme satırları segment başına ayrı `LIMIT 10` sorgusuyla çekilmeli. (b) Uzun vadede günlük `recomputeAllCLV` cron'unun yazdığı `CustomerLifetimeValue.segmentId` alanı okunmalı (`prisma/schema.prisma` CustomerLifetimeValue, `lib/clv-core.ts:51-63`). O zaman sayım `groupBy segmentId` ile milisaniyeler içinde alınır. Toplam için ayrı bir `count()` kullanılmalı.

### B3 — Platformda aynı adla dört farklı segment tanımı var; bu sayfa hiçbiriyle hizalı değil
- **Önem:** yüksek · **Kategori:** mimari / ürün tutarlılığı · **Efor:** L
- **Kanıt:**
  - Bu sayfa: VIP = Lv≥5 ∧ ≥20 yorum ∧ ≥3 rozet. Riskli = ≥3 yorum ∧ son 30 günde 0 (`route.ts:64-83`).
  - CLV motoru: VIP = toplam harcama ≥5000, "Risk Altında" = `predictedChurn ≥ 0.5`, "Uyuyan" = 30+ gün pasif (`lib/clv-core.ts:12-18, 62-63`). Bayi Segment Aksiyon Merkezi de bunu kullanıyor (`lib/segment-action-center.ts:1-8`, `app/api/dealer/segment-actions/route.ts`).
  - Kampanya gönderimi: `vip` = `vipStatus` kaydı olan, `risk` = son 30 günde ortalama puanı ≤2 olan (`app/api/dealer/campaigns/[id]/send/route.ts:48-70`).
  - Playbook taslakları `targetSegment: 'risk' | 'vip' | 'loyal' | 'active'` üretiyor (`lib/growth-playbooks.ts:74,97`). Playbooks sayfası operatörü "Segmentler" butonuyla bu sayfaya yönlendiriyor (`app/admin/playbooks/page.tsx:98`).
- **Sorun:** Operatör bu sayfada "Riskli: 340" görüp bir playbook'tan `risk` kampanyası başlattığında gönderim başka bir kitleye (düşük puan verenlere) gider. Bayi panelindeki "Risk Altında" ise üçüncü bir kitledir. Aynı kelimenin üç anlamı var ve sayılar karşılaştırılamaz. Bu bir veri bütünlüğü ve güven sorunu: karar ekranı ile aksiyon motoru birbirinden kopuk.
- **Öneri:** Tek bir **Segment Registry** kurulmalı. `CustomerSegment` tablosu (zaten `criteria Json`, `color`, `isActive` taşıyor) tek kaynak olsun. Kurallar `lib/segments/` altında saf ve test edilebilir bir `classify(metrics)` fonksiyonunda dursun ve cron bunu kullansın. Admin sayfası, bayi aksiyon merkezi ve kampanya gönderimi aynı `segmentId` ile çalışsın. Geçiş süresince bu sayfada "Tanım" bölümü her segmentin kuralını açıkça göstermeli. Playbook ile kampanya gönderimindeki `targetSegment` değerleri registry anahtarlarına eşlenmeli.

### B4 — Sınıflandırma önceliği yanlış sonuç veriyor: kaybedilen VIP'ler görünmez, "Pasif" ve "Yeni" yanlış etiketleniyor
- **Önem:** orta · **Kategori:** doğruluk / ürün mantığı · **Efor:** S
- **Kanıt:** `route.ts:65-87` (if/else zinciri), açıklamalar `page.tsx:211-216`.
- **Sorun:**
  1. VIP koşulu yaşam boyu sayılara dayanıyor ve zincirde ilk sırada. Altı aydır hiç yorum yazmayan bir VIP asla "Riskli"ye düşmüyor. Oysa churn takibinde en önemli kitle tam olarak budur.
  2. Son 30 günde **1** yorum yazmış, 7 günden eski kullanıcı "Pasif"e düşüyor. UI bu kitleyi "Uzun süredir aktif olmayan müşteriler" diye açıklıyor.
  3. İlk haftasında 2+ yorum yazan yeni kullanıcı "Aktif"e düşüyor. "Yeni" kartı "son 7 günde katılanlar" sayısı değil. Bu metrik onboarding takibi için yanıltıcı.
  4. Kod yorumları da kodla çelişiyor: `route.ts:68` ">5 ... level > 2" diyor, kod `>= 5` ve `>= 2`.
- **Öneri:** Değer ekseni (VIP/standart) ile yaşam döngüsü ekseni (yeni/aktif/riskli/uyuyan) ayrılmalı. İki boyutlu bir matris kullanılmalı, örneğin "VIP × Riskli" ayrı görülebilmeli. Aktivite yalnızca `Feedback` ile değil, `ConsumptionReview` (`prisma/schema.prisma` `@@index([customerId, createdAt])`), `loginStreakLastDay` ve oyun oturumlarıyla birlikte ölçülmeli. Kurallar, sınır değer testleriyle birim testine alınmalı.

### B5 — Ağır sorgu, önbelleksiz ve admin dashboard'da her açılışta çalışıyor
- **Önem:** orta · **Kategori:** performans · **Efor:** S
- **Kanıt:** `route.ts:15-35` (10k satır, satır başına `feedbacks`/`badges`/`rewards` için 3 ilişki sayımı), `route.ts:31` (`rewards` sayımı hiç kullanılmıyor), `route.ts:7` (`force-dynamic`). Uç ayrıca `app/admin/admin-dashboard-client.tsx:86`'da her dashboard yüklemesinde çağrılıyor. Dashboard ise yalnızca sayıları kullanıyor (`admin-dashboard-client.tsx:586-590`). `lib/redis.ts:81` `cachedJson` hazır.
- **Sorun:** Her çağrı, e-posta ve görsel URL'leri dahil 10k satırı ilişki alt sorgularıyla taşıyor. Dashboard yalnızca 6 sayı istediği hâlde bu yükü her seferinde tetikliyor. Gerçek süre ölçülmedi. Neon pooler ve `connection_limit` bağlamında (memory: perf-backend-optimization) dashboard'ın 12 paralel isteğinden en ağırı olması muhtemel ama doğrulanmadı.
- **Öneri:** `rewards` sayımı kaldırılmalı. Yanıt, `cachedJson('admin:segments:v1', 300, ...)` ile 5 dakikalığına önbelleğe alınmalı ve "son hesaplama: hh:mm" bilgisi döndürülmeli. "Yenile" butonu `?fresh=1` ile önbelleği atlamalı. Dashboard için yalnızca sayıları dönen hafif bir `?summary=1` modu eklenmeli. B2'deki DB-tarafı sayımla birlikte bu uç O(1) maliyete iner.

### B6 — Hata durumu boş durumla aynı; kullanıcı hatayı göremiyor
- **Önem:** orta · **Kategori:** hata yönetimi / UX · **Efor:** S
- **Kanıt:** `page.tsx:86` (`isError`/`error` alınmıyor), `page.tsx:139-144`, `route.ts:115` (500'de `success` alanı yok, `error: 'Internal server error'` İngilizce).
- **Sorun:** 500, 401 ya da token-replay 403 durumunda sayfa "Henüz segment yok veya veriler yüklenemedi" gösteriyor ve altında boş bir dağılım kartı render ediliyor. Operatör sistemin bozuk mu yoksa verinin boş mu olduğunu ayıramıyor, yeniden deneme butonu da yok.
- **Öneri:** `isError` durumunda ayrı bir hata kartı (`role="alert"`, hata mesajı, "Tekrar dene") gösterilmeli. Boş durumda dağılım kartı gizlenmeli. API hata metni Türkçeleştirilip `{ success:false, error }` sözleşmesine uyulmalı. Diğer admin sayfalarında kullanılan ortak bir `<AdminErrorState>` varsa o kullanılmalı (varlığı doğrulanmadı).

### B7 — "AI destekli" iddiası sahte
- **Önem:** orta · **Kategori:** dürüstlük / içerik · **Efor:** S
- **Kanıt:** `page.tsx:120` ("AI destekli otomatik müşteri segmentasyonu ve analizi"), `page.tsx:104` ("analiz ediliyor..."). Gerçek mantık `route.ts:64-87`, saf eşik kuralları.
- **Sorun:** Operatöre yanlış güven veriyor. Platformda gerçek AI çıktısı olan `Feedback.churnRisk` ve `CustomerLifetimeValue.predictedChurn` var ama bu sayfa onları kullanmıyor.
- **Öneri:** Kısa vadede metin "Kural tabanlı davranış segmentasyonu" olarak düzeltilmeli. Orta vadede B3 ile `predictedChurn` tabanlı risk skoru gerçekten kullanılmalı. Ancak o zaman "AI tahmini" rozeti, model ve güven aralığı bilgisiyle gösterilmeli.

### B8 — Önizleme listesi temsil edici değil ve eksik olduğunu söylemiyor
- **Önem:** orta · **Kategori:** UX / veri sunumu · **Efor:** M
- **Kanıt:** `route.ts:18,96` (`orderBy id asc` + `slice(0, 10)`), `page.tsx:208` ("({selected.count} müşteri)"), `page.tsx:224`.
- **Sorun:** Başlıkta "VIP Segment (412 müşteri)" yazıyor ama 10 satır görünüyor, "10 / 412" ibaresi yok. Gösterilen 10 kişi en eski hesaplar. "Riskli" için en değerli, "Yeni" için en son katılanlar olmalıydı. API'nin döndürdüğü `feedbackCount`/`badgeCount` gösterilmediğinden kişinin neden o segmentte olduğu da anlaşılmıyor.
- **Öneri:** Segment başına anlamlı bir varsayılan sıralama tanımlanmalı (VIP: puan desc, Riskli: son aktiviteden geçen gün desc + yaşam boyu değer, Yeni: `createdAt desc`). Ayrı bir `GET /api/admin/segments/[id]/members?cursor=&sort=&q=` ucuyla sayfalanmış tam liste sunulmalı. Satırda "neden bu segmentte" sütunları (son aktivite, 30 günlük yorum, toplam yorum, rozet) gösterilmeli. Başlıkta "10 / 412 gösteriliyor · Tümünü gör" bulunmalı.

### B9 — Klavye ve ekran okuyucu erişimi yok; detay paneli görüş alanı dışında açılıyor
- **Önem:** orta · **Kategori:** erişilebilirlik / mobil · **Efor:** S
- **Kanıt:** `page.tsx:152-155` (`Card onClick`, rol ve tabIndex yok), `page.tsx:181-186` (bar dilimleri `div onClick`, yalnızca `title`), `page.tsx:157-160` (lucide ikon ve emoji yan yana, emoji `aria-hidden` değil), `page.tsx:153` (`hover:scale-105`), `page.tsx:202-251` (detay sayfa sonunda).
- **Sorun:** Segment seçimi klavyeyle yapılamıyor. Seçili durum ekran okuyucuya bildirilmiyor (`aria-pressed`/`aria-selected` yok). Tooltip dokunmatikte görünmüyor. Ekran okuyucu "taç simgesi VIP" yerine emojiyi okuyor. Mobilde 6 kart 3 satır tutuyor ve altta dağılım kartı var. Karta dokunulduğunda detay ekranın dışında açılıyor ve otomatik kaydırma yok, kullanıcı bir şey olmadığını sanıyor.
- **Öneri:** Kartlar `role="radiogroup"` / `role="radio"` (ya da `ToggleGroup` shadcn bileşeni) ile işaretlenmeli, ok tuşlarıyla gezinme eklenmeli. Seçimden sonra detay başlığına `scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })` ve odak taşınmalı. Mobilde detay alttan açılan bir `Sheet` içinde gösterilmeli. Emoji kaldırılmalı (lucide ikon zaten var) ya da `aria-hidden` yapılmalı. `hover:scale-105` yerine `motion-safe:hover:-translate-y-0.5` + kenarlık vurgusu kullanılmalı. Bar dilimleri `button` olmalı, yüzde etiketi lejantta görünür metin olarak yazılmalı.

### B10 — Seçim URL'de tutulmuyor; dashboard derin bağlantısı segmenti kaybediyor
- **Önem:** düşük · **Kategori:** UX / bilgi mimarisi · **Efor:** S
- **Kanıt:** `page.tsx:84` (`useState`), `app/admin/admin-dashboard-client.tsx:589` (her rozet `href="/admin/segments"`).
- **Sorun:** Dashboard'da "Riskli 340" rozetine tıklayan operatör segment seçili olmayan bir sayfaya düşüyor. Seçim paylaşılamıyor ve yenilemede kayboluyor.
- **Öneri:** `useSearchParams` ile `?segment=risk` durumu tutulmalı (`router.replace`, `scroll:false`). Dashboard rozetleri `href={`/admin/segments?segment=${seg.id}`}` olarak güncellenmeli.

### B11 — "Yenile" geri bildirimsiz
- **Önem:** düşük · **Kategori:** UX · **Efor:** S
- **Kanıt:** `page.tsx:86` (`isFetching` alınmıyor), `page.tsx:123-128`.
- **Sorun:** Buton tıklandığında ikon dönmüyor, buton kilitlenmiyor, veri değişmezse hiçbir şey olmamış gibi görünüyor. Art arda tıklama aynı ağır sorguyu tekrar tetikliyor (B5).
- **Öneri:** `isFetching` sırasında `RefreshCw` için `animate-spin` + `disabled` uygulanmalı. Bitince hero altında "Son hesaplama: 14:32" bilgisi gösterilmeli. Önbellekle birlikte "Yeniden hesapla" ayrı bir aksiyon olmalı.

### B12 — Ölü kod, tip kopyası ve sabit kodlu tasarım eşlemeleri
- **Önem:** düşük · **Kategori:** kod kalitesi · **Efor:** S
- **Kanıt:** `page.tsx:18` (`Trophy` kullanılmıyor), `page.tsx:25` (`toast` kullanılmıyor), `page.tsx:29-45` (`SegmentData` tipi API'den ayrı elle kopyalanmış), `page.tsx:47-81` (4 ayrı renk ve ikon haritası) ve `admin-dashboard-client.tsx:588`'deki beşinci bir renk haritası, `page.tsx:211-216` (açıklamalar istemcide). `route.ts:51` `typeof customers` dışında tip `any` kaçağı yok.
- **Sorun:** Segment kimliği, rengi, ikonu ve açıklaması üç dosyaya dağılmış. Yeni bir segment eklemek için üç yerin birlikte değiştirilmesi gerekiyor, aksi hâlde sessizce `Users` ikonuna ve tanımsız gradyana düşülüyor (`segmentColors[seg.color]` → `undefined`).
- **Öneri:** Segment meta verisi (id, label, açıklama, ton, ikon adı) tek bir `lib/segments/registry.ts` içinde tutulmalı. API yalnızca id ve sayıları dönmeli, UI ve dashboard aynı registry'den okumalı. Paylaşılan yanıt tipi `types/` altında export edilmeli. Ölü import'lar silinmeli.

### B13 — Görsel hiyerarşi ve ikon tutarlılığı
- **Önem:** düşük · **Kategori:** görsel · **Efor:** S
- **Kanıt:** `page.tsx:117` (başlıkta `PieChart`), `page.tsx:121` (hero ikonu `Shield`), `page.tsx:157-160` (gradyan ikon + emoji + ad), `page.tsx:125` (`text-emerald-900` sabit, users sayfasıyla tutarlı: `app/admin/users/users-client.tsx:738`).
- **Sorun:** Hero'da iki farklı ikon var ve Shield anlam taşımıyor. Altı kart eşit ağırlıkta. Operatörün en çok ilgilenmesi gereken "Riskli" ile "Pasif" vurgulanmıyor, dikkat önceliği oluşmuyor.
- **Öneri:** Hero ikonu tek bir anlamlı ikon olmalı (`PieChart` ya da `Users`). Kartlar "yaşam döngüsü akışı" (Yeni → Aktif → Sadık → VIP, alt şeritte Riskli → Uyuyan) olarak dizilmeli. Riskli kartında son 7 güne göre değişim (▲ +12) gösterilmeli. Ayrıntı vizyon bölümünde.

### B14 — i18n dışı sayfa
- **Önem:** düşük · **Kategori:** dil tutarlılığı · **Efor:** M
- **Kanıt:** `page.tsx:104,114-120,142,176,208,211-216,221,235`; `route.ts:52-57` (segment adları Türkçe sabit). Sidebar etiketi ise `messages/en.json:2489` / `messages/tr.json:2489` ile çevriliyor.
- **Sorun:** EN yerel ayarındaki admin, sidebar'da "Segments" görüyor ama sayfa tamamen Türkçe. API'nin metin (ad, emoji) döndürmesi çeviriyi daha da zorlaştırıyor.
- **Öneri:** API yalnızca `id` dönmeli, etiket ve açıklama `t('admin.segments.<id>.label')` ile gelmeli (B12 registry ile birlikte).

---

## Eksik özellikler (kıyas ürünlerle)

- **Kişi listesi ve profil derinliği (PostHog Cohorts, Stripe Customers):** Segment başına sayfalanmış, aranabilir, sıralanabilir tam üye listesi gerekiyor. Satıra tıklayınca kullanıcı detay çekmecesi açılmalı (puan geçmişi, yorumlar, rozetler, trust/fraud durumu). Bugün `/admin/users/[id]` bile yok.
- **Zaman içinde trend ve geçiş akışı (PostHog Lifecycle, Amplitude):** Haftalık "yeni / geri dönen / uyuyan / kaybedilen" lifecycle grafiği ve segmentler arası geçiş (Sankey) gerekiyor, örneğin "Bu hafta 23 Sadık → Riskli". Bunun için günlük segment anlık görüntüsü saklanmalı (ör. `CustomerSegmentSnapshot { date, segmentId, count }`).
- **Segmentten aksiyon (Braze/Customer.io, Retool):** Seçili segmente bildirim, push, kupon, sürpriz kutu, görev ya da playbook uygulama gerekiyor. Aksiyon onay adımı, hedef sayısı önizlemesi ve audit log ile korunmalı. Platformda uçlar zaten var (push merkezi, surprise-boxes, playbooks/apply).
- **Kural oluşturucu ve özel segmentler (PostHog cohort builder, Linear filtreleri):** "Lv ≥ X ve son N günde ≥ M yorum" gibi kuralların UI'dan tanımlanması, canlı önizleme sayısı ve sürümleme. `CustomerSegment.criteria Json` alanı buna hazır.
- **Dışa aktarma ve paylaşılabilir görünüm:** CSV/JSON indirme (sunucu tarafında, rate-limit'li, audit log'lu) ve URL'de kalıcı filtre durumu.
- **Kırılımlar (Stripe Sigma tarzı):** Segment dağılımının bayi kategorisi (`businessCategory`), kazanım kaynağı (referral/UTM) ve `abCohort`'a göre kırılması, gamification A/B etkisinin segment geçişine yansıması.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında üç soruya beş saniyede cevap alabilmeli: "Müşteri tabanım nasıl dağılmış?", "Bu hafta ne değişti, kim kayıp riskinde?", "Buna ne yapmalıyım?". Sayfa bir sayaç ekranı olmaktan çıkıp **gör → anla → uygula** döngüsüne dönüşmeli.

**Yerleşim (masaüstü):**
1. **Hero (sade):** başlık, "Son hesaplama 02:00 · Kural seti v3" rozeti, "Yeniden hesapla" ve "Dışa aktar" butonları.
2. **Lifecycle şeridi:** soldan sağa akan altı kart: Yeni → Aktif → Sadık → VIP, alt sırada Riskli → Uyuyan. Her kartta sayı, toplam içindeki pay ve 7 günlük değişim (yeşil/kırmızı delta + mini sparkline) gösterilir. Kartlar `ToggleGroup` olarak çalışır ve klavyeyle gezilir. Riskli kartı, delta pozitifse uyarı tonunda vurgulanır.
3. **İki sütunlu gövde:**
   - Sol (geniş): seçili segmentin **üye tablosu** (TanStack Table). Sütunlar: ad/e-posta, son aktivite, 30 günlük yorum, toplam yorum, rozet, puan, trust tier. Arama, sıralama, cursor sayfalama, çoklu seçim olur. Satır tıklanınca kullanıcı detay `Sheet`'i açılır.
   - Sağ (dar): **"Bu segment nedir?"** kartı (kural açıkça yazılı, ör. "Son 30 günde ≥5 yorum ve Lv ≥2"), **haftalık geçiş** mini Sankey'i (nereden gelip nereye gitti) ve **önerilen aksiyon** kartı. Aksiyon kartı `lib/segment-action-center.ts`'teki `actionForSegment` desenini admin bağlamına uyarlar ("Riskli 340 kişiye geri kazanım bildirimi gönder", hedef sayısı önizlemesi ve onay adımıyla).
4. **Mobil:** kart şeridi yatay kaydırılan çip sırasına dönüşür. Üye listesi kart listesi olur. Detay ve aksiyonlar alttan açılan `Sheet`'te gösterilir. Seçim sonrası otomatik odak taşınır.

**Motion (ölçülü):** Kart sayılarında ilk yüklemede kısa bir sayaç animasyonu (≤600 ms, `useReducedMotion` ile kapatılır). Segment değişiminde tablo için `AnimatePresence` + opacity çapraz geçişi (layout animasyonu değil). Dağılım çubuğunda `width` yerine `scaleX` + `transform-origin:left` kullanılmalı ki `MotionConfig reducedMotion="user"` kapsasın. 3D gerekmiyor ve önerilmiyor. Bu bir operasyon ekranı, yoğunluk ve okunabilirlik öncelikli olmalı.

**Veri ve API değişiklikleri:**
- **Tek segment motoru:** `lib/segments/classify.ts`, saf bir `classify(metrics, rules)` fonksiyonu olmalı ve birim testleri yazılmalı. Mevcut `recomputeAllCLV` cron'u (`app/api/internal/inngest/calculate-clv/route.ts`, `lib/clv-core.ts`) bu fonksiyonu çağırıp `CustomerLifetimeValue.segmentId` yazmalı. Metrik girdileri: yorum (Feedback + ConsumptionReview, `deletedAt: null`), son aktivite (`loginStreakLastDay`, oyun oturumu), harcama ve `predictedChurn`. `fraudStatus = 'shadow_ban'` olanlar dışlanmalı.
- **Anlık görüntü tablosu:** `CustomerSegmentSnapshot { id, date @db.Date, segmentId, count }` + `@@unique([date, segmentId])`. Cron her gece yazar, trend ve delta buradan okunur. Geçişler için isteğe bağlı olarak `CustomerSegmentTransition { date, fromSegmentId, toSegmentId, count }` eklenebilir.
- **Uçlar:**
  - `GET /api/admin/segments` → `{ segments: [{ id, count, delta7d }], total, computedAt, rulesVersion }`. `groupBy segmentId` + `cachedJson` (5 dk) ile çalışır. Dashboard da yalnızca bunu kullanır.
  - `GET /api/admin/segments/[id]/members?cursor&sort&q` → sayfalanmış üye listesi.
  - `POST /api/admin/segments/[id]/actions` → mevcut push, kupon ve playbook uçlarına yönlendiren, idempotency anahtarlı ve audit log'lu aksiyon.
  - `GET /api/admin/segments/export?segment=` → stream CSV, rate-limit ve audit log ile.
- **Uyum:** `campaign.targetSegment` ve `PlaybookDraftCampaign.targetSegment` değerleri registry anahtarlarına bağlanmalı. Kampanya gönderimi (`app/api/dealer/campaigns/[id]/send/route.ts:40-82`) kendi ad-hoc sorguları yerine `segmentId` ile hedeflemeli (bayi kapsamı `qrCode.dealerId` ile korunarak).

---

## Çakışmalar / birleştirme önerisi

- **`/admin` (dashboard) segment widget'ı** (`app/admin/admin-dashboard-client.tsx:577-595`): aynı ucu çağırıyor, yalnızca sayıları gösteriyor. Çakışma değil, özet. Ancak aynı ağır ucu kullanmamalı (B5) ve her rozet ilgili segmente derin bağlanmalı (B10).
- **Bayi Segment Aksiyon Merkezi** (`app/api/dealer/segment-actions/route.ts`, `lib/segment-action-center.ts`): kavramsal olarak aynı ürün, ama farklı bir tanım setiyle (CLV) çalışıyor. **Birleştirilmeli:** iki panel aynı segment motorunu kullanmalı. Admin platform geneline, bayi kendi müşterilerine baksın.
- **`/admin/playbooks`** (`app/admin/playbooks/page.tsx:98`, `lib/growth-playbooks.ts:74-97`): bu sayfaya bağlanıyor ama farklı segment anahtarları üretiyor. Segment detayındaki "Önerilen aksiyon" kartı playbook'u doğrudan uygulamalı, iki sayfa çift yönlü bağlanmalı.
- **`/admin/innovation/segment-proposals`**: bayilerin önerdiği segment kampanyalarını onaylıyor (`segmentKey`). Segment anahtarları bu registry'den gelmeli. Sayfa ayrı kalabilir, ama segment detayında "bu segment için bekleyen öneriler" sayısı gösterilmeli.
- **`/admin/analytics`** (`app/api/admin/analytics/route.ts:454-491`): oradaki "segment" kavramı bayi `businessCategory` sapma analizi. İsim çakışması var, işlev çakışması yok. O ekranda etiket "kategori" olarak netleştirilmeli.
- **`/admin/users`**: segment üye listesi ile kullanıcı yönetimi aynı kullanıcı detay çekmecesini paylaşmalı. Kullanıcılar sayfasına `?segment=` filtresi eklenirse üye tablosu orada da yeniden kullanılabilir.
- **Sonuç:** Sayfa kaldırılmamalı. "Müşteri Segmentleri" platformun tek segment merkezi olarak, CLV/CustomerSegment altyapısı üzerinde yeniden inşa edilmeli. Dashboard widget'ı, playbooks ve bayi aksiyon merkezi bu merkeze bağlanmalı.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunurdur: kod okundu, veritabanına dokunulmadı, hiçbir komut çalıştırılmadı.

### 1. Soft-delete edilmiş yorumlar segment eşiklerine sayılıyor — **DOĞRULANDI** (önem: ORTA, güvenlik değil)

- `app/api/admin/segments/route.ts:27-33` `_count.feedbacks` ilişki sayımı filtresizdir, `route.ts:43-47` `feedback.groupBy` de yalnızca `createdAt` ve `userId` ile filtreler. `deletedAt: null` hiçbir yerde yok.
- `prisma/schema.prisma:830` `Feedback.deletedAt` soft delete alanıdır. Yazan tek yer `app/api/admin/feedbacks/route.ts:366-369` (`updateMany … deletedAt: new Date()`). Yani admin'in spam/sahte diye sildiği yorumlar satır olarak kalır ve sayılır.
- Projenin geri kalanı bu alanı tutarlı biçimde filtreliyor (`lib/activity-badges.ts:30`, `lib/surprise-badges.ts:136`, `app/api/admin/dashboard/route.ts:239`). Bu uç istisna.
- `User.fraudStatus` (`schema.prisma:100`) için de filtre yok. `lib/fraud/engine.ts:30,53` kullanıcıyı `shadow_ban` yapabiliyor ama segment ucu bu kullanıcıları normal müşteri gibi sınıflandırıyor.
- **Yeniden üretim:** Bir müşteri 3 sahte yorum gönderir, admin `/admin/feedbacks`'ten üçünü siler. 30 gün sonra müşteri `_count.feedbacks = 3` ve `recentCount = 0` ile `route.ts:81` dalına düşer ve "Riskli" görünür. Aynı şekilde 30 gün içinde silinen 5 yorum, Lv≥2 bir kullanıcıyı "Sadık" yapar (`route.ts:69`).
- **Not:** Etki analitik doğrulukla sınırlı. Bu ekrandan hiçbir aksiyon tetiklenmiyor, puan veya erişim değişmiyor. "Sistematik şişme" ifadesi soft-delete hacmine bağlı ve canlı veri okunmadan büyüklüğü doğrulanamaz. KRİTİK/YÜKSEK değil, ORTA.

### 2. `take: 10_000` + `orderBy id asc` en yeni müşterileri sessizce dışlıyor — **DOĞRULANDI** (önem: YÜKSEK ama gizli; eşik aşılınca tetiklenir)

- `route.ts:15-18` `role: 'CUSTOMER'`, `take: 10_000`, `orderBy: { id: 'asc' }`. `schema.prisma:30` `User.id @default(cuid())`. cuid v1 zaman damgası önekli olduğu için leksikografik artan sıra kabaca en eskiden en yeniye gider, kesilen kısım da en yeni kayıtlar olur.
- `route.ts:111` `totalCustomers: customers.length` gerçek toplamı değil kesilmiş dizinin uzunluğunu döndürür. `page.tsx:133` bunu "Toplam müşteri" diye basar, `page.tsx:163,179` yüzdeleri de bu paydaya göre hesaplar. UI'da kesilme uyarısı yok, API'de `count()` da yok.
- **Yeniden üretim:** 10.001. CUSTOMER kaydolduğu anda ekran "Toplam müşteri: 10000" gösterir ve yeni kayıt hiçbir segmente girmez. Son 7 günde katılanların hepsi 10.000 sınırının dışında kalırsa (büyüyen platformda kaçınılmaz) "Yeni" segmenti 0'a düşer. Aynı uç `app/admin/admin-dashboard-client.tsx:86`'da dashboard widget'ını da besliyor, yani hata iki ekranda görünür.
- **Not:** Bugün canlıda müşteri sayısının 10.000'i geçip geçmediği doğrulanmadı (DB okunmadı). Kod davranışı ise kesin ve deterministik. Doğru çözüm, sınıflandırmayı sınırsız ama toplu (cron/snapshot veya SQL `GROUP BY`) yapmak ve toplamı ayrı bir `count()` ile vermek.

### 3. Segment tanımları kampanya hedefleme ve CLV motoruyla çelişiyor — **ÇÜRÜTÜLDÜ** (KRİTİK/YÜKSEK hata olarak; geçerli bir ORTA seviye ürün tutarlılığı gözlemi)

- Olgusal kısım doğru: `lib/clv-core.ts:12-18` harcama/ziyaret/churn tabanlı, `app/api/dealer/campaigns/[id]/send/route.ts:48-82` ise `vipStatus`, 30 gün ortalama puan ≤2 ve ≥3 yorum gibi ad-hoc tanımlar kullanıyor. `lib/growth-playbooks.ts:97` aynı anahtarları (`risk`/`loyal`/`active`) üretiyor. Bu ekrandaki tanımlar (`route.ts:64-87`) üçünden de farklı.
- Ancak somut bir kullanıcı/veri hasarı senaryosu kurulamıyor:
  - `/admin/segments` salt okunur bir rapor ekranı. `page.tsx` içinde kampanya, push veya playbook tetikleyen hiçbir aksiyon yok. Segment kimliği başka bir uca aktarılmıyor.
  - Kampanya gönderimi bayi kapsamlı (`qrCode: { dealerId }`) ve bayinin kendi seçtiği `targetSegment` ile çalışıyor. Admin bu ekranda gördüğü kitleyi oraya "göndermiyor". `app/admin/playbooks/page.tsx:98` yalnızca bir gezinme bağlantısı.
  - Kampanya ucu kendi tanımıyla tutarlı çalışıyor, yanlış kişiye gönderim veya yetki aşımı yok.
- **Sonuç:** "Aynı ad, farklı kitle" bir tutarlılık ve güven sorunu (operatör kafa karışıklığı). Mevcut raporun "Yeniden tasarım vizyonu → Uyum" ve "Çakışmalar" bölümlerinde zaten doğru biçimde ele alınmış. Hata/güvenlik bulgusu olarak KRİTİK/YÜKSEK sınıfına girmiyor, ürün borcu (ORTA) olarak kalmalı.
