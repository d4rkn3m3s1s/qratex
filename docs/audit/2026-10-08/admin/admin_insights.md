# /admin/insights

**Amaç:** Platformdaki bayileri `User.businessCategory` alanına göre gruplayıp sektör bazlı bir karşılaştırma (bayi sayısı, ortalama puan, toplam tarama) göstermek. Hero metnine göre bu veri ileride bayilere ücretli bir "sektör içgörüsü" paketi olarak da sunulabilir.
**Genel puan:** 3/10
**Karar:** birleştir. Sayfa tek başına korunacak kadar değerli değil. Ayrıca bağlı olduğu "demo veriyi sil" aksiyonu canlı veriyi yok ediyor; bu düzeltilmeden sayfa kullanılmamalı.

> Özet: Sayfa 148 satırlık bir server component. İki toplu SQL sorgusu ve 5 dakikalık bir `unstable_cache` ile sektör kartları üretiyor. Asıl sorunlar sayfanın dışında:
> 1. `businessCategory` alanını gerçek akışlarda **hiçbir yer yazmıyor**. Kayıt ve bayi profili bu alanı toplamıyor. Bu yüzden sayfa pratikte yalnızca demo verisiyle doluyor.
> 2. Sayfadaki "Demo veriyi sil" butonu demo kayıtlarını değil, **TÜM bayilerin** kategorisini siliyor. Bu kategoriyi müşteri liderlik tablosu, bayi benchmark'ı, ziyaret görevleri ve "ayın işletmesi" de kullanıyor.
> 3. "Demo sektör verisi üret" butonu canlıdaki gerçek bayilere `demo-cafe` gibi kategoriler yazıyor. Bu kategoriler müşterilerin gördüğü ekrana sızıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 2/10 | Veri kaynağı fiilen boş. İki butondan biri canlı veriyi siliyor, diğeri kirletiyor. Cache temizlenmediği için butonlar da çalışmıyormuş gibi görünüyor. |
| UX | 3/10 | Kart ızgarası düzgün ama zaman aralığı, karşılaştırma, detay ve filtre yok. "0.0k tarama" gibi yanıltıcı biçimler var. Odak önerisi, kendi iddiasıyla çelişen bir sezgiye dayanıyor. |
| Görsel | 5/10 | Ortak `AdminPremiumHero` dili tutarlı. Kartlar ise sıradan shadcn kartları: her kartta aynı gradyan şerit, grafik yok, ham slug gösteriliyor (`demo-cafe`). |
| Mimari | 4/10 | SQL tarafı iyi (O(n²) giderilmiş, tarama ayrı sorguda toplanıp fan-out önlenmiş). Ama cache tag'i hiç geçersiz kılınmıyor, aynı mantık ölü `/api/admin/insights` route'unda kopya duruyor ve demo seed/clear canlı tablolar üzerinde çalışıyor. |
| Performans | 7/10 | İki paralel toplu sorgu ve 5 dk cache var; istemci JS'i neredeyse yok. Seed aksiyonu bayi başına tek tek `update` yapıyor (N sorgu). |
| Erişilebilirlik + Mobil | 5/10 | Izgara mobilde tek sütuna iniyor. Hero `useReducedMotion`'a uyuyor. Ancak yıkıcı aksiyonda onay yok, istatistik kutuları anlamsal değil (`dl` yok), sidebar etiketi Türkçe arayüzde İngilizce. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı yetki kontrolü (ADMIN değilse yönlendirme) | ÇALIŞIYOR | app/admin/insights/page.tsx:57-61 | ADMIN olmayan, oturumu açık kullanıcı da `/auth/signin`'e gidiyor; 403 sayfası daha doğru olurdu. Proxy gizli kapısı ayrıca var. |
| 2 | Sektör toplama sorgusu (bayi sayısı + puan toplamı) | KISMİ | page.tsx:17-28 | Zaman penceresi yok (tüm zamanlar). Ortalama yorum ağırlıklı: çok yorum alan tek bayi sektör ortalamasını belirliyor. Yalnızca `LOWER`, `TRIM` yok. |
| 3 | Sektör başına tarama toplamı (ayrı sorgu) | ÇALIŞIYOR | page.tsx:29-36 | Join fan-out'unu önlemek için doğru şekilde ayrılmış. `isActive=false` QR'ların taramaları da dahil. |
| 4 | 5 dk `unstable_cache` (`admin-insights` tag'i) | KISMİ | page.tsx:50-53 | Tag'i geçersiz kılan kod yok (`grep "admin-insights"` → yalnızca bu dosya). Seed/clear sonrası 5 dk boyunca eski veri gösteriliyor. |
| 5 | Hero: eyebrow, başlık, açıklama | KISMİ | page.tsx:66-70 | TR/EN karışık ("Sektörel karşılaştırma (global insights)"). "Anonimleştirilmiş" iddiası tek bayilik sektörlerde geçersiz (bkz. B7). Marka "QRateX" olarak yazılmış. |
| 6 | "Demo sektör verisi üret" (hero) | BOZUK (riskli) | page.tsx:73 → app/api/admin/bootstrap/route.ts:237-266 | Canlıda gerçek bayilere `demo-*` kategorisi yazıyor. Bayi başına ayrı `update` (N+1). Sayfa yenilense de cache yüzünden etkisi görünmüyor. |
| 7 | "Demo veriyi sil" (hero) | BOZUK (veri kaybı) | page.tsx:74 → route.ts:268-279 | `businessCategory != null` olan **tüm** bayileri `null` yapıyor. Tracker'daki `insightsDealerIds` hiç kullanılmıyor. Onay yok. |
| 8 | Sektör kartı: kategori adı | KISMİ | page.tsx:82-86 | Ham slug + CSS `capitalize` ("Demo-cafe"). Etiket sözlüğü veya i18n yok. |
| 9 | Kart rozeti: "N Bayi" | ÇALIŞIYOR | page.tsx:88-90 | — |
| 10 | Ortalama puan kutusu | KISMİ | page.tsx:96-100; 43-45 | Hiç yorumu olmayan sektör "0.0" gösteriyor ("—" olmalı). Örneklem büyüklüğü (yorum sayısı) gösterilmiyor. |
| 11 | Tarama kutusu ("k" biçimi) | BOZUK | page.tsx:103 | `(totalScans/1000).toFixed(1)+"k"`: 37 tarama "0.0k", 999 tarama "1.0k" görünüyor. `Intl.NumberFormat` compact kullanılmamış. |
| 12 | Kart üst gradyan şeridi | ÇALIŞIYOR | page.tsx:81 | Dekoratif, her kartta aynı. Bilgi taşımıyor. |
| 13 | Taramaya göre azalan sıralama | ÇALIŞIYOR | page.tsx:49 | Kullanıcı sıralamayı değiştiremiyor. |
| 14 | "Odak önerisi" kartı | SAHTE | page.tsx:113-120 | En az taranan sektörü alıp "puan/etkileşim düşük" diyor; puana hiç bakmıyor. Tek sektör varsa aynı sektörü hem lider hem zayıf gösteriyor. "Playbook tanımlayın" yazıyor ama `/admin/playbooks`'a link vermiyor. |
| 15 | Boş durum metni | KISMİ | page.tsx:121-126 | "Bayiler kategori bilgisi ile kayıt oldukça" yazıyor, ama kayıt akışı bu alanı toplamıyor. `businessCategory` yalnızca demo seed'lerde yazılıyor (lib/demo-cafes-seed.ts:139,149; bootstrap/route.ts:248). Yani boş durum kendi kendine dolmayacak. |
| 16 | Boş durumda tekrarlanan seed/clear butonları | KISMİ | page.tsx:127-140 | Hero'daki butonların kopyası; aynı ekranda iki set var. |
| 17 | Yükleniyor durumu | ÇALIŞIYOR | app/admin/loading.tsx | Genel panel iskeleti; sayfaya özel kart iskeleti yok. |
| 18 | Hata durumu | ÇALIŞIYOR | app/admin/error.tsx | Sorgu hata verirse genel admin error boundary devreye giriyor (Sentry'ye gidiyor). Sayfaya özel kısmi düşüş yok. |
| 19 | Responsive ızgara (1/2/3 sütun) | ÇALIŞIYOR | page.tsx:78 | — |
| 20 | Azaltılmış hareket | ÇALIŞIYOR | components/admin/admin-premium-hero.tsx:35, 73, 199 | Hero animasyonları `useReducedMotion`'a uyuyor. Kartlarda animasyon yok. |
| 21 | Buton yükleniyor/toast geri bildirimi | ÇALIŞIYOR | components/admin/bootstrap-action-button.tsx:39-79 | JSON olmayan 500 yanıtında `res.json()` hata fırlatıyor ve kullanıcı ham "Unexpected token" mesajı görüyor. |
| 22 | `/api/admin/insights` GET route'u | KISMİ (ölü kod) | app/api/admin/insights/route.ts | Hiçbir istemci çağırmıyor (yalnızca lib/data/admin-api-catalog.json:466'da listeli). Sayfadakinden farklı semantikle (uncategorized dahil, `AVG`) kopya mantık. |
| 23 | Sidebar girişi | KISMİ | components/dashboard/sidebar.tsx:173; messages/tr.json:2477 | TR çevirisi de "Global Benchmarks". |
| 24 | Modül anahtarı `insights_global` | EKSİK | lib/module-controls.ts:64 | Katalogda var ama sayfa bu anahtarı kontrol etmiyor. Kapatmanın sayfaya bir etkisi yok. |
| 25 | Yıkıcı aksiyon için onay diyaloğu | EKSİK | page.tsx:74, 134-139 | Tek tıkla toplu silme yapılıyor. |
| 26 | Admin denetim kaydı (audit log) | EKSİK | bootstrap/route.ts (grep "audit" → yok) | Kimin, ne zaman, kaç bayiyi sildiğinin izi tutulmuyor. |
| 27 | Zaman aralığı / dönem karşılaştırması | EKSİK | page.tsx:17-36 | Tüm zamanlar; trend veya delta yok. |
| 28 | Sektör detayına inme (drill-down) | EKSİK | — | Karta tıklanmıyor; dağılım, en iyi/en kötü bayiler ve QR'lar görülemiyor. |
| 29 | Dışa aktarma (CSV) | EKSİK | — | Hero "abonelik paketi olarak sunun" diyor ama veriyi dışarı almanın yolu yok. |
| 30 | Kategori taksonomisi / atama yönetimi | EKSİK | prisma/schema.prisma:99 (serbest `String?`) | Kanonik liste yok. Bayi veya admin kategoriyi atayamıyor. |
| 31 | Sayfa `<title>` metadata | EKSİK | page.tsx (metadata export yok) | Sekme yalnızca layout varsayılanını gösteriyor. |

**Sayım:** ÇALIŞIYOR 10 · KISMİ 9 · BOZUK 3 · SAHTE 1 · EKSİK 8 = 31

---

## Bulgular

### B1. "Demo veriyi sil" tüm bayilerin sektör kategorisini siliyor (canlı veri kaybı)
- **Önem:** kritik · **Kategori:** veri bütünlüğü
- **Kanıt:** app/api/admin/bootstrap/route.ts:268-279
  ```ts
  const result = await prisma.user.updateMany({
    where: { role: 'DEALER', businessCategory: { not: null } },
    data: { businessCategory: null },
  });
  await saveTracker({ ...tracker, insightsDealerIds: [] });
  ```
  Seed aşamasında `insightsDealerIds` takip ediliyor (route.ts:257-260). Silme aşaması bu listeyi kullanmıyor; yalnızca boşaltıyor. Özet ucu demo kayıtları `startsWith: 'demo-'` ile sayıyor (bootstrap/summary/route.ts:17), yani sistemin geri kalanı "demo" ile neyin kastedildiğini biliyor.
- **Sorun:** Butona basan admin, `demo-cafes-seed`'in yazdığı `cafe/restaurant/bakery` kategorileri dahil kategorisi olan her bayinin kategorisini siler. `businessCategory` şu yerlerde kullanılıyor:
  - müşteri liderlik tablosu (app/api/customer/category-leaderboard/route.ts:31-53)
  - bayi benchmark'ındaki "komşu segment" (app/api/dealer/benchmark/route.ts:217-249)
  - ziyaret görevleri (lib/visit-missions.ts:49-72)
  - ayın işletmesi rozeti (lib/business-of-month.ts:82-88)
  - admin analytics tenant benchmark'ı (app/api/admin/analytics/route.ts:427-454)

  Bunların hepsi tek tıkla sessizce bozulur. Onay yok, audit yok, geri alma yok. Aynı aksiyon `/admin/settings` sayfasındaki "toplu temizlik"ten de tetikleniyor (app/admin/settings/settings-client.tsx:628).
- **Profesyonel öneri:**
  1. Silmeyi, yalnızca bootstrap'in değiştirdiği kayıtlarla sınırla: `where: { id: { in: tracker.insightsDealerIds }, businessCategory: { startsWith: 'demo-' } }`. Bayinin önceki değeri null değilse onu geri yükleyebilmek için tracker'da `{id, previous}` çiftleri tut.
  2. Bootstrap/seed aksiyonlarını prod'da bir ortam bayrağının (`ALLOW_DEMO_SEED`) arkasına al. Varsayılan olarak kapalı olsun.
  3. Yıkıcı her aksiyona etkilenecek kayıt sayısını gösteren bir `AlertDialog` ve yazarak onay ekle ("SİL").
  4. `AdminAuditLog` (ya da mevcut audit altyapısı) üzerinden actor, aksiyon ve etkilenen sayıyı kaydet.
  5. Canlıda bugüne kadar bu butona basıldı mı, `Settings.admin_bootstrap_tracker_v1` geçmişi ve DB log'larıyla kontrol et (bu rapor kapsamında DB'ye dokunulmadı; **doğrulanmadı**).
- **Efor:** S (sınırlama) + M (onay, audit, bayrak)

### B2. "Demo sektör verisi üret" canlıdaki gerçek bayilere sahte kategori yazıyor ve müşteri ekranına sızıyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü
- **Kanıt:** bootstrap/route.ts:237-266. Kategorisi olmayan **her** gerçek bayiye `demo-cafe | demo-restaurant | …` yazılıyor. Müşteri tarafı `/api/customer/category-leaderboard` kategori listesini doğrudan bu alandan üretiyor (route.ts:30-38) ve `/customer/category-leaderboard` sayfasında gösteriyor.
- **Sorun:** Bir admin bu sayfayı "doldurmak" için butona bastığında, müşteriler kategori listesinde "demo-cafe" görür. Gerçek bayiler benchmark'ta yanlış peer grubuna girer. Ayrıca bayi başına tek `update` atılıyor (N+1, route.ts:246-252).
- **Profesyonel öneri:** Demo verisi gerçek kullanıcı satırlarını değiştirmemeli. Demo ihtiyacı için iki seçenek var:
  - (a) `isDemo` bayraklı ayrı sentetik bayiler oluşturup tüm müşteri sorgularında `isDemo=false` filtresi uygula,
  - (b) insights sayfasına "örnek görünüm" modu ekle: DB'ye yazmadan, istemcide açıkça "ÖRNEK VERİ" filigranıyla render edilsin.

  Tercih (b) olmalı: canlı ortamı hiç kirletmez. Seed kalacaksa `updateMany` + `CASE` ile tek sorguya indir.
- **Efor:** M

### B3. Sayfanın veri kaynağı yok: `businessCategory` hiçbir gerçek akışta yazılmıyor
- **Önem:** yüksek · **Kategori:** ürün / işlevsellik
- **Kanıt:** Repo genelinde `businessCategory` yazan yerler yalnızca lib/demo-cafes-seed.ts:139,149 ve bootstrap/route.ts:248. Kayıt (app/api/auth/register), bayi profili ve onboarding bu alanı toplamıyor. Şema alanı serbest metin (prisma/schema.prisma:99). Boş durum metni ise "Bayiler kategori bilgisi ile kayıt oldukça içgörü kartları dolacaktır" diyor (page.tsx:123-125).
- **Sorun:** Sayfa üretimde ya boş ya da yalnızca demo verisi gösterir. Hero'daki "bu verileri abonelik paketi olarak sunabilirsiniz" vaadinin arkasında gerçek veri yok. Boş durum mesajı yanlış beklenti yaratıyor.
- **Profesyonel öneri:**
  - Kanonik bir `BusinessCategory` tablosu oluştur (slug, TR/EN etiket, ikon, üst kategori) ve `User.businessCategoryId` FK ekle.
  - Bayi onboarding'ine ve `/dealer/settings`'e zorunlu kategori seçimi koy.
  - Admin için toplu atama ekranı ekle: kategorisiz bayiler listesi + AI ile öneri (işletme adı/açıklamasından sınıflandırma, onaylı uygulama).
  - Boş durum gerçeği söylemeli ("X bayinin kategorisi yok → Ata") ve aksiyon linki vermeli.
- **Efor:** L

### B4. Cache tag'i hiç geçersiz kılınmıyor; butonlar "çalışmıyor" görünüyor
- **Önem:** orta · **Kategori:** hata
- **Kanıt:** page.tsx:50-53 (`tags: ['admin-insights']`, `revalidate: 300`). `grep -rn "admin-insights"` yalnızca bu dosyayı döndürüyor. bootstrap/route.ts'de `revalidateTag` yok. Buton `reloadOnDone` ile sayfayı yeniliyor (bootstrap-action-button.tsx:62-64).
- **Sorun:** Seed/clear sonrası sayfa yenilense de 5 dakikaya kadar eski kartlar görünür. Admin tekrar basar ve B1/B2'nin etkisini katlar.
- **Profesyonel öneri:** Insights'ı etkileyen her mutasyondan sonra (bootstrap insights aksiyonları ve ileride kategori atama) `revalidateTag('admin-insights')` çağır. `window.location.reload()` yerine `router.refresh()` kullan. Hero'ya "son güncelleme: hh:mm · yenile" göstergesi koy.
- **Efor:** S

### B5. "Odak önerisi" iddia ettiği hesabı yapmıyor
- **Önem:** orta · **Kategori:** yanlış veri
- **Kanıt:** page.tsx:49 dizi taramaya göre azalan sıralanıyor. page.tsx:117 `stats[stats.length - 1]` (en az taranan) için "puan/etkileşim düşük" diyor.
- **Sorun:** Puanı 4.9 olan ama az taranan küçük bir sektör "puanı düşük" diye işaretleniyor. Tek sektör varsa aynı sektör hem ilk kart hem "zayıf sektör" oluyor. Öneri, yapılacak işe (playbook) bağlanmıyor.
- **Profesyonel öneri:** Öneriyi kural tabanlı ve açıklanabilir yap. Örnek kural: platform medyanına göre puan z-skoru < -1 **ve** yeterli örneklem (n ≥ 30 yorum, ≥ 3 bayi). Kartta gerekçeyi göster ("ort. 3.2 vs platform 4.1, 214 yorum"). "Playbook oluştur" butonu `/admin/playbooks/new?category=…` ile ön-dolu açılsın. Yeterli veri yoksa öneri gösterilmesin.
- **Efor:** S-M

### B6. Sayı biçimleri yanıltıcı ("0.0k", "0.0" puan)
- **Önem:** orta · **Kategori:** UX / yanlış veri
- **Kanıt:** page.tsx:103 `(stat.totalScans / 1000).toFixed(1)}k`. page.tsx:44 yorum yoksa `avgRating = 0`, page.tsx:98 bunu "0.0" olarak gösteriyor.
- **Sorun:** 450 tarama "0.5k", 30 tarama "0.0k" görünüyor. Yorumsuz sektör, en kötü puanlı sektörle aynı "0.0"ı alıyor.
- **Profesyonel öneri:** `Intl.NumberFormat('tr-TR', { notation: 'compact' })` kullan. Yorum yoksa "—" ve "Yeterli veri yok" etiketi göster. Puanın yanında örneklem sayısını (`ratingN`) da göster. `ratingN` sorguda zaten var ama UI'a taşınmıyor.
- **Efor:** S

### B7. "Anonimleştirilmiş" iddiası küçük sektörlerde geçersiz; satılacak veri için k-anonimlik eşiği yok
- **Önem:** orta · **Kategori:** gizlilik / ürün
- **Kanıt:** Hero açıklaması page.tsx:69. Kartlar `dealerCount = 1` olan sektörleri de gösteriyor (page.tsx:79-110). Karşılaştırma için: bayi benchmark'ı `peerIds.length >= 3` eşiği uyguluyor (dealer/benchmark/route.ts:230), müşteri liderlik tablosu `MIN_FEEDBACKS = 3` uyguluyor.
- **Sorun:** Tek bayili bir sektörün "ortalaması" o bayinin kendi metriğidir. Bu veri "anonim sektör içgörüsü" olarak bayilere sunulursa rakip bayinin verisi ifşa olur.
- **Profesyonel öneri:** Sistem genelinde tek bir `MIN_PEER_DEALERS` (≥ 3, tercihen 5) sabiti tanımla. Eşiğin altındaki sektörleri admin görünümünde "örneklem küçük" etiketiyle soluk göster, dışa açılan her yüzeyde tamamen gizle. Benchmark ve insights aynı yardımcı fonksiyonu (`lib/benchmark/peer-aggregate.ts`) kullansın.
- **Efor:** S-M

### B8. Ölü ve kopya API: `/api/admin/insights`
- **Önem:** düşük · **Kategori:** mimari / ölü kod
- **Kanıt:** app/api/admin/insights/route.ts. Hiçbir `fetch` çağrısı yok; yalnızca lib/data/admin-api-catalog.json:466'da kayıtlı. Sayfa ise aynı sorguyu farklı semantikle kendi içinde çalıştırıyor (sayfa: `LOWER` ile, kategorisizler hariç, `SUM/N`; API: `COALESCE 'uncategorized'`, `AVG`).
- **Sorun:** İki kaynak birbirinden kopabilir. API ayrıca 5 dk cache olmadan her çağrıda tam tarama yapıyor.
- **Profesyonel öneri:** Toplama mantığını `lib/insights/category-aggregate.ts` içine taşı. Sayfa (RSC) ve API (CSV export ve ileride bayilere açılacak uç) aynı fonksiyonu kullansın. Uç kullanılmayacaksa sil.
- **Efor:** S

### B9. Dil karışıklığı ve tutarsız adlandırma
- **Önem:** düşük · **Kategori:** i18n
- **Kanıt:** Sidebar TR etiketi "Global Benchmarks" (messages/tr.json:2477). Başlık "Sektörel karşılaştırma (global insights)" (page.tsx:68). Modül adı "Global Insights" (lib/module-controls.ts:64). Marka "QRateX" (page.tsx:69). Sayfa metni `t()` kullanmıyor; locale'den bağımsız olarak sabit Türkçe.
- **Profesyonel öneri:** Tek bir ad seç ("Sektör Karşılaştırması") ve sidebar, modül kataloğu ve sayfa başlığında aynı anahtarı kullan. Sayfa metinlerini `messages/*.json`'a taşı. Kategori etiketleri de B3'teki taksonomiden lokalize gelsin.
- **Efor:** S

### B10. Modül anahtarı etkisiz; sayfaya özel metadata yok
- **Önem:** düşük · **Kategori:** mimari
- **Kanıt:** `insights_global` (lib/module-controls.ts:64) yalnızca katalogda geçiyor. page.tsx bu anahtarı okumuyor. Sidebar öğesinin `key` alanı yok (sidebar.tsx:173). Sayfa `metadata` export etmiyor.
- **Profesyonel öneri:** Modül kapalıysa sayfa "modül devre dışı" durumunu göstersin ve sidebar öğesi gizlensin; ya da anahtarı katalogdan kaldır. `export const metadata = { title: 'Sektör Karşılaştırması' }` ekle.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

Kıyas: Stripe Dashboard, PostHog Insights, Linear Insights, Retool.

1. **Zaman aralığı ve karşılaştırma dönemi:** son 7/30/90 gün ve önceki döneme göre delta (Stripe/PostHog'da standart). Şu an tüm zamanlar gösteriliyor ve trend görünmüyor.
2. **Sektör drill-down:** karta tıklayınca sektörün puan dağılımı (1-5 histogram), en iyi/en kötü bayiler, haftalık trend ve yorum duygu dağılımı açılsın (PostHog'da breakdown → detay).
3. **Kırılım ve metrik seçici:** metrik (puan, tarama, yorum/tarama dönüşümü, yanıt oranı, aktif bayi oranı), kırılım (sektör × şehir/lokasyon) ve sıralama kullanıcı tarafından seçilebilsin.
4. **Dışa aktarma ve paylaşılabilir rapor:** CSV/PDF ve "bayilere içgörü paketi" önizlemesi. Hero'daki ticari vaadin teslim edilebilir hali.
5. **Kategori yönetimi:** kanonik taksonomi, kategorisiz bayi kuyruğu ve AI destekli toplu atama (Retool tarzı tablo + toplu aksiyon).
6. **Veri güveni göstergeleri:** her metrikte örneklem büyüklüğü, k-anonimlik eşiği, "son güncelleme" zamanı ve elle yenileme.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Admin sayfayı açtığında üç soruya 10 saniyede cevap alabilmeli:
1. Hangi sektör büyüyor, hangisi geriliyor?
2. Hangi sektörde müşteri memnuniyeti platform ortalamasının altında, ve bu istatistiksel olarak anlamlı mı?
3. Buna karşı hangi aksiyonu almalıyım (playbook, kampanya, bayi koçluğu)?

**Yerleşim:**
- **Üst şerit (KPI satırı):** kategorili bayi oranı (ör. "%34 · 120 bayi kategorisiz → Ata"), platform ortalama puanı, dönem tarama toplamı ve deltası. Kategorisiz oranı, B3 çözülene kadar sayfanın en önemli metriği.
- **Kontrol çubuğu:** dönem seçici (7/30/90g + karşılaştırma), metrik seçici, minimum örneklem anahtarı. Seçimler URL query'de dursun ki paylaşılabilsin.
- **Ana görünüm:** kart ızgarası yerine **sıralanabilir tablo ve ona bağlı dağılım grafiği** (x: tarama hacmi, y: ortalama puan, nokta boyutu: bayi sayısı, renk: platform medyanına göre sapma). Kart ızgarası 10+ sektörde taranamaz; tablo + grafik Stripe/PostHog standardı. Tablo satırında sparkline (haftalık puan trendi) olsun.
- **Sağ panel / drawer:** satıra tıklayınca sektör detayı açılsın: dağılım histogramı, en iyi/en kötü 5 bayi (admin içi, isimli), açıklanabilir "odak önerisi" ve "Playbook oluştur" CTA'sı.
- **Demo/örnek veri:** DB'ye yazmayan, filigranlı "Örnek görünüm" anahtarı. Seed/clear butonları bu sayfadan kaldırılsın; gerekiyorsa yalnızca `/admin/settings` → "Geliştirici araçları" altında, ortam bayrağı ve onay diyaloğuyla dursun.

**Motion / 3D:** Bu bir analitik yüzey, 3D gereksiz. Ölçülü motion yeterli:
- dönem değişince tablo satırlarında `layout` animasyonuyla sıra değişimi (framer `m` + `LayoutGroup`, 200ms),
- grafik noktalarında tek seferlik 150ms geçiş,
- drawer için standart slide-in.

Hepsi `useReducedMotion` ile kapatılabilir olsun. Kartlardaki dekoratif gradyan şerit kaldırılsın; renk yalnızca anlam taşıdığında (sapma yönü) kullanılsın.

**Veri / API değişiklikleri:**
1. `BusinessCategory` modeli + `User.businessCategoryId` (migration ile mevcut serbest metinleri eşleştir).
2. `lib/insights/category-aggregate.ts`: parametreler `{ from, to, compareFrom, compareTo, minPeers }`. Her sektör için `dealerCount, ratedDealerCount, ratingN, avgRating (bayi-ağırlıklı ve yorum-ağırlıklı ayrı), scans, feedbackPerScan, deltas` döndürsün. Tarama zaman serisi için `QRCode.scanCount` (kümülatif sayaç) yerine olay tablosu gerekiyor; varsa scan event tablosu kullanılmalı (**doğrulanmadı**, şemada ayrıca incelenmeli).
3. RSC'de `unstable_cache` key'ine dönem parametrelerini ekle. Tag `admin-insights`, kategori atama ve bootstrap mutasyonlarında `revalidateTag` ile temizlensin.
4. `GET /api/admin/insights?from&to&format=csv` aynı fonksiyonu kullansın (ölü route yeniden amaçlandırılır).
5. Bayi benchmark'ı (`/api/dealer/benchmark` neighborSegment) ve müşteri liderlik tablosu aynı taksonomiyi ve `MIN_PEER_DEALERS` sabitini paylaşsın.

---

## Çakışmalar / birleştirme önerisi

- **/admin/analytics:** `app/api/admin/analytics/route.ts:420-470` zaten bayi başına `segment = businessCategory` ile "tenant benchmark" ve segment ortalaması hesaplıyor. Bu sayfa ile kavramsal olarak aynı iş ("sektör/segment kıyası") iki yerde ve farklı formüllerle yapılıyor (analytics: dönem filtreli, bayi-ağırlıklı, ≥ 3 yorum eşiği; insights: tüm zamanlar, yorum-ağırlıklı, eşiksiz).
- **/admin/dealers-health** ve **/admin/segments:** bayi sağlığı ve segment görünümleri aynı bilgi alanında. Sektör, bu ekranlarda bir **kırılım boyutu** olmalı; ayrı bir sayfa olmasına gerek yok.
- **/admin/settings → "Hızlı admin başlangıcı":** aynı seed/clear butonlarını içeriyor (settings-client.tsx:838-842) ve toplu temizlikte aynı yıkıcı `clear_insights_categories`'i çağırıyor (settings-client.tsx:628). B1 düzeltmesi iki yeri birden kapsamalı.
- **Öneri:** `/admin/insights` sayfasını `/admin/analytics` altında "Sektör" sekmesine (ya da `/admin/analytics?view=sectors`) taşı ve analytics'teki tenant benchmark ile tek toplama fonksiyonunu paylaş. Mevcut URL'yi 308 ile yeni sekmeye yönlendir. Sidebar'daki "Global Benchmarks" girişini kaldır. Kategori taksonomisi (B3) hazır olana kadar sekme, kategorisiz bayi oranını ve "Ata" aksiyonunu öne çıkaran bir kurulum durumunda kalsın.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunurdur; veritabanına bağlanılmadı, canlıda hangi değerlerin bulunduğu **doğrulanmadı**. Kararlar yalnızca kod okumasına dayanır.

**Ön tespit (her iki iddia için belirleyici):** Uygulama içinde `User.businessCategory` alanına yazan yalnızca iki yol var: `app/api/admin/bootstrap/route.ts:249-252` (`seed_insights_categories`) ve `lib/demo-cafes-seed.ts:139,149` (`seed_demo_cafes`; `cafe`/`restaurant`/`bakery`, e-postası `@qratex.com` olan demo bayiler). Kayıt akışında, bayi profilinde ya da admin kullanıcı düzenlemesinde bu alanı yazan bir yol yok: `updateUserSchema` alanı içermiyor (`app/api/admin/users/route.ts:15-32`), `prisma/seed.ts` de yazmıyor. Yani gerçek bayiler pratikte her zaman `businessCategory = null` durumunda. Bu tespit iddia 1'in etkisini daraltıyor, iddia 2'nin etkisini ise genişletiyor.

### 1. `clear_insights_categories` tüm bayilerin `businessCategory` alanını null yapıyor — **DOĞRULANDI (önem: YÜKSEK değil ORTA)**

- **Kod gerçeği doğru:** `route.ts:270-276` filtreyi yalnızca `role: 'DEALER', businessCategory: { not: null }` ile kuruyor. `seed_insights_categories`'in `route.ts:256-259`'da kaydettiği `tracker.insightsDealerIds` okunuyor (`route.ts:269`) ama filtrede kullanılmıyor, yalnızca sıfırlanıyor (`route.ts:277`). Diğer iki temizleme aksiyonu ise tracker ve işaretçi kullanıyor (`route.ts:352-358`, `route.ts:434-441`). Bu tutarsızlık açıkça bir hata.
- **Onay ve audit yok:** `components/admin/bootstrap-action-button.tsx:41-72` tıklamada doğrudan POST atıyor, onay adımı yok. Route içinde audit çağrısı yok. Toplu temizleme de onaysız: `app/admin/settings/settings-client.tsx:622-629`.
- **Yanıltıcı özet:** `app/api/admin/bootstrap/summary/route.ts:14-19` "demo" sayısını `startsWith: 'demo-'` ile sayıyor. Silme ise `demo-` öneki olmayan değerleri de siliyor. Admin'e gösterilen sayı ile silinen kayıt sayısı birbirini tutmuyor.
- **Somut senaryo:** Admin önce `seed_demo_cafes` çalıştırıyor. Müşteriye görünen demo kafeler `cafe`/`restaurant`/`bakery` kategorisini alıyor. Ardından `/admin/insights` sayfasında "Demo veriyi sil" düğmesine basıyor. Kendi ürettiği `demo-*` değerleriyle birlikte demo kafelerin kategorileri de null oluyor. Bunun üç sonucu var: (a) `/customer/category-leaderboard` kategori listesi boşalıyor (`app/api/customer/category-leaderboard/route.ts:30-38`). (b) Kategoriye bağlı ziyaret görevleri bu işletmelerdeki ziyaretlerle ilerlemiyor (`lib/visit-missions.ts:49-50,64-71`), yani müşteri ödülü kaçırıyor. (c) Bayi benchmark'ındaki `neighborSegment` kayboluyor (`app/api/dealer/benchmark/route.ts:219-249`).
- **Abartılı kısım:** "Gerçek prod verisinin geri dönüşsüz kaybı" iddiası koddan desteklenmiyor. Uygulamada gerçek bir kategori kaynağı olmadığından silinen değerler ya `demo-*` ya da demo kafelerin değerleri. Demo kafelerin değerleri `seed_demo_cafes` yeniden çalıştırılınca geri geliyor, çünkü upsert'in `update` dalı `businessCategory`'yi yeniden yazıyor (`demo-cafes-seed.ts:139`). Tek istisna, kategorisi canlı veritabanına doğrudan SQL ya da betikle elle girilmiş bayiler. Böyle kayıtlar varsa bu değerler gerçekten kaybolur. Bunların varlığı **doğrulanmadı**. Daha önce tetiklenip tetiklenmediği de doğrulanmadı.
- **Düzeltme yönü:** Filtreyi `id IN tracker.insightsDealerIds OR businessCategory LIKE 'demo-%'` olarak daralt; bu, diğer iki clear aksiyonunun desenidir. Silmeden önce etkilenecek sayıyı gösteren bir onay diyaloğu ekle, `AuditLog` kaydı yaz ve `revalidateTag('admin-insights')` çağır. Kalıcı çözüm için raporun "Yeniden tasarım vizyonu" bölümüne bak: veritabanına yazmayan örnek görünüm ve kategori taksonomisi.

### 2. `seed_insights_categories` canlıdaki gerçek bayilere `demo-*` kategorisi yazıyor ve bu değer müşteriye görünüyor — **DOĞRULANDI (önem: YÜKSEK)**

- **Kod:** `route.ts:239-255` tüm `DEALER`'ları çekiyor ve kategorisi boş olan her birine `categories[index % 5]` yazıyor (`demo-cafe`, `demo-restaurant` vb.). Ortam bayrağı, demo hesap filtresi (ör. `@qratex.com` / `demo-dealer-*` id) ya da onay yok. Ön tespitte gösterildiği gibi gerçek bayilerin kategorisi her zaman null olduğundan **canlıdaki tüm gerçek bayiler** gelişigüzel bir sahte sektöre atanıyor. Atama `createdAt` sırasına göre modulo ile yapılıyor; işletmenin gerçek türüyle bir ilişkisi yok.
- **Müşteriye sızma:** `category-leaderboard/route.ts:30-38` `demo-cafe` gibi değerleri filtrelemeden açılır listeye döndürüyor, `:53` bu değerle gerçek işletmeleri sıralıyor. Bu dosyalarda `demo` filtresi yok (grep ile doğrulandı). `components/customer/business-of-month-badge.tsx:69` kategoriyi müşteriye `· demo-cafe` biçiminde basıyor. Bayi tarafında `dealer/benchmark/route.ts:219-249` ilgisiz işletmeleri "aynı iş kategorisi" diye kıyaslıyor; ≥3 akran koşulu çoğu durumda sağlanacağı için bu kıyas bayiye gösteriliyor.
- **Somut senaryo:** Admin `/admin/insights` sayfasındaki boş durumda "Demo sektör verisi üret" düğmesine basıyor (`page.tsx:73` ya da `:129-133`). Örneğin bir berber `demo-hotel` sektörüne atanıyor. Müşteri `/customer/category-leaderboard` sayfasında `demo-hotel` seçeneğini görüyor ve gerçek işletmeleri bu sahte sektörde sıralanmış buluyor.
- **N+1:** Doğru (`route.ts:249-252`, bayi başına bir `update`). Ancak bu tek seferlik bir admin işlemi; performans etkisi ikincil. Asıl sorun veri bütünlüğü.
- **Düzeltme yönü:** Seed'i yalnızca demo hesaplarla sınırla (id öneki ya da e-posta alanı) ve üretim ortamında ortam bayrağıyla kapat. Ya da tercihen veritabanına hiç yazmayan "örnek görünüm" moduna geç. Müşteriye ve bayiye dönen tüm uçlarda `demo-` önekli kategorileri savunmacı olarak dışla. Geriye dönük temizlik gerekiyorsa tracker'daki id'lerle hedefli `updateMany` kullan.
