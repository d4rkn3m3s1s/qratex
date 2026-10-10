# /customer/donations

**Amaç:** Müşterinin biriktirdiği sadakat puanlarını sosyal sorumluluk projelerine (su, çevre, eğitim, hayvanlar, sağlık) bağışlaması; kişisel “etkisini” görmesi, bağışçı liderlik tablosu ve topluluk akışıyla bu davranışın oyunlaştırılması.

**Genel puan:** 5,3 / 10 · **Karar:** koru-iyileştir

Çekirdek akış sağlam: puan düşümü atomik, bağış, proje sayacı ve bildirim aynı transaction içinde yazılıyor, sunucu tarafında zod doğrulaması ve modül kapısı var. Buna karşın sayfada bir sahte buton, iki bozuk liderlik durumu, sessizce yutulan API hataları, filtreye bağlı yanlış “Senin etkin” verisi, kırık bir derin link (`?tab=leaderboard`) ve ciddi i18n sızıntıları var. Ürün olarak da en büyük eksik **güven ve kanıt katmanı**: puanın gerçek dünyada neye dönüştüğünü gösteren bir şey yok.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | Bağış akışı uçtan uca çalışıyor; ancak 1–2 bağışçılı liderlik boş kalıyor, “Senin sıralaman” kartı hiç render olmuyor, hero CTA’sı ölü, GET hataları sessiz. |
| UX | 5/10 | Her filtre tıklaması ve her bağıştan sonra tüm sayfa iskelete düşüyor; bağış anı yalnızca bir toast; sekme URL’e bağlı değil. |
| Görsel | 6/10 | Kategori renkleri ve kartlar derli toplu, ama sayfa “şablon dashboard” hissi veriyor; mobilde başlık iki kez görünüyor; kategori gradyanları ve yıldız/turuncu rozetler sistemin geri kalanıyla tutarsız. |
| Mimari | 5/10 | 1242 satırlık tek client dosya, prop-drilling ile 14 prop’lu dialog, `useEffect` + `fetch` (SWR/React Query yok), istek iptali yok, ölü import ve ölü kod var. |
| Performans | 5/10 | GET 8 ardışık Prisma sorgusu (Promise.all yok, cache yok); kategori değişince kategoriden bağımsız liderlik/akış/toplamlar da yeniden hesaplanıyor. |
| Erişilebilirlik + mobil | 4/10 | Mobilde çift `<h1>`, `whitespace-nowrap` + `px-6` sekmelerin 375px’de taşma olasılığı, filtre ve hızlı tutar butonlarında `aria-pressed` yok, podyum DOM sırası 2-1-3. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota kabuğu: `dynamic(..., { ssr:false })` + iskelet | ÇALIŞIYOR | app/customer/donations/page.tsx:7-19 | Kod bölme amaçlı; bilinçli tercih. |
| 2 | Segment metadata (başlık/açıklama) | ÇALIŞIYOR | app/customer/donations/layout.tsx:4-6 | |
| 3 | İkinci yükleniyor iskeleti (client içinde) | KISMİ | donations-client.tsx:255-266 | page.tsx iskeletiyle farklı şekil → art arda iki farklı iskelet, düzen sıçraması. |
| 4 | Mobil başlık kartı (`sm:hidden`) | KISMİ | donations-client.tsx:270-275 | Hero zaten `<h1>` içeriyor (components/admin/admin-premium-hero.tsx:227) → mobilde iki `<h1>`, iki başlık. |
| 5 | Hero: eyebrow, başlık, açıklama | ÇALIŞIYOR | donations-client.tsx:277-286 | Eyebrow “Müşteri alanı” jenerik, sayfaya bir şey katmıyor. |
| 6 | Hero chip “Sosyal sorumluluk” | ÇALIŞIYOR | donations-client.tsx:287-292 | Yalnızca dekoratif. |
| 7 | “Hemen Bağış Yap” butonu | SAHTE | donations-client.tsx:295-298 | `onClick` yok; hiçbir şey yapmıyor. |
| 8 | “Nasıl Çalışır?” dialog’u | ÇALIŞIYOR | donations-client.tsx:299-307, 559-585 | `Play` ikonu video vaadi veriyor, açılan şey 3 maddelik metin. |
| 9 | Stat: Puanınız | ÇALIŞIYOR | donations-client.tsx:313; route.ts:50-53,141 | DB’den canlı bakiye. |
| 10 | Stat: Bağışınız | ÇALIŞIYOR | donations-client.tsx:314; route.ts:69-73 | Gizli bağışlar dahil. |
| 11 | Stat: Toplam etki | KISMİ | donations-client.tsx:315; route.ts:114-116 | Etiket “etki” ama değer platformdaki toplam bağışlanan **puan**. |
| 12 | Stat: Sıralamanız | KISMİ | donations-client.tsx:316; route.ts:111 | Sadece herkese açık ilk 10 içinde hesaplanıyor; 11. ve sonrası her zaman “-”. |
| 13 | “Senin etkin” bölümü | KISMİ | donations-client.tsx:174-185, 338-419 | Kategoriye göre filtrelenmiş proje listesinden türetiliyor; filtre değişince kişisel etki kayboluyor (bkz. B4). |
| 14 | Etki kartları (proje başına) | KISMİ | donations-client.tsx:358-394 | Pasif/kapanmış projelere yapılan bağışlar görünmez; `key={idx}`. |
| 15 | Toplam özet (puan / proje sayısı / sıra) | KISMİ | donations-client.tsx:398-415 | “Desteklenen proje” filtreye göre değişiyor; “Toplam puan” değişmiyor → tutarsız ikili. |
| 16 | Sekmeler (Projeler / Liderlik / Aktivite) | KISMİ | donations-client.tsx:422-436 | `defaultValue` sabit; `?tab=leaderboard` derin linki yok sayılıyor (components/customer/dashboard/customer-dashboard.tsx:703). |
| 17 | Kategori filtresi | KISMİ | donations-client.tsx:153-155, 441-473 | Tam sayfa iskelete düşürüyor, istek iptali yok (yarış), kategoriler sabit kodlu, `aria-pressed` yok. |
| 18 | Öne çıkan projeler bölümü | ÇALIŞIYOR | donations-client.tsx:476-494 | |
| 19 | Öne çıkan kart: toplam etki istatistiği | ÇALIŞIYOR | donations-client.tsx:605, 648-657 | |
| 20 | İlerleme yüzdesi ve çubuğu | KISMİ | donations-client.tsx:604, 654, 662-667, 725 | `goal=0` (admin buna izin veriyor: app/api/admin/donations/route.ts:133) → `%NaN` / `Infinity`. |
| 21 | Kartta “Senin katkın” kutusu | ÇALIŞIYOR | donations-client.tsx:676-689 | |
| 22 | Kart bağış butonu, hedefe ulaşınca devre dışı | KISMİ | donations-client.tsx:695-704, 789-796 | Kısıt sadece istemcide; sunucu hedefi kontrol etmiyor (B5). |
| 23 | Tüm projeler ızgarası | ÇALIŞIYOR | donations-client.tsx:497-512 | |
| 24 | Projeler boş durumu | KISMİ | donations-client.tsx:515-527 | Hata/modül kapalı/401 durumunda da “Henüz proje yok — yakında” gösteriyor (B2). |
| 25 | Proje etiketleri (`tags`) | EKSİK | donations-client.tsx:62; prisma/schema.prisma:1686 | API dönüyor, UI hiç göstermiyor. |
| 26 | Başlangıç/bitiş tarihi (`startDate`/`endDate`) | EKSİK | prisma/schema.prisma:1689-1690; route.ts:56-66 | Ne gösteriliyor ne uygulanıyor; süresi biten projeye bağış yapılabiliyor. |
| 27 | Proje detay görünümü | EKSİK | — | Açıklama `line-clamp-2` ile kesiliyor (donations-client.tsx:643, 754), devamını okumanın yolu yok. |
| 28 | Liderlik podyumu | KISMİ | donations-client.tsx:841-924 | Yalnızca ≥3 bağışçıda çiziliyor; kullanıcının kendisi podyumdaysa “Sen” işareti yok. |
| 29 | Liderlik: 1–2 bağışçı durumu | BOZUK | donations-client.tsx:831-832, 841, 927 | Podyum çizilmiyor, `rest` boş → sekme tamamen boş kalıyor (B1). |
| 30 | Liderlik listesi + “Siz” vurgusu | ÇALIŞIYOR | donations-client.tsx:927-964 | |
| 31 | “Daha fazla yükle” | ÇALIŞIYOR | donations-client.tsx:966-976 | API en fazla 10 döndüğü için en fazla 2 kayıt açıyor; anlamsız sayfalama. |
| 32 | “Senin sıralaman” kartı (ilk 10 dışı) | BOZUK | donations-client.tsx:834-836, 978-1002; route.ts:88 | Koşul matematiksel olarak hiç sağlanmaz → ölü kod; çeviri metni boş vaat veriyor (B3). |
| 33 | Liderlik boş durumu | ÇALIŞIYOR | donations-client.tsx:815-829 | |
| 34 | Aktivite akışı (“Canlı Aktivite”) | KISMİ | donations-client.tsx:1008-1067; route.ts:119-127 | “Canlı” ama polling/realtime yok; `formatRelativeTime` locale’siz → EN’de Türkçe. |
| 35 | Aktivite boş durumu | ÇALIŞIYOR | donations-client.tsx:1009-1023 | |
| 36 | Bağış dialog’u aç/kapat | KISMİ | donations-client.tsx:542-557, 1101-1108 | Tutar/mesaj/görünürlük projeler arası taşınıyor; işlem sürerken kapatılabiliyor. |
| 37 | Hızlı tutar butonları | ÇALIŞIYOR | donations-client.tsx:1123-1143 | Bakiye üstü devre dışı; `aria-pressed` ve `type="button"` yok. |
| 38 | Serbest tutar girişi | KISMİ | donations-client.tsx:198, 1103, 1149-1158 | `parseInt` → “10.5” sessizce 10, “1e3” sessizce 1; “Tümü/maks” kısayolu yok. |
| 39 | Yetersiz bakiye satır içi uyarısı | ÇALIŞIYOR | donations-client.tsx:1165 | |
| 40 | Etki önizlemesi | KISMİ | donations-client.tsx:1104, 1170-1189 | `Math.floor` ile küçük tutarlarda “0 ağaç” gösterebiliyor. |
| 41 | Mesaj alanı | KISMİ | donations-client.tsx:1192-1202; route.ts:18 | Sunucu 500 karakter sınırı var, istemcide `maxLength`/sayaç yok; mesaj kullanıcıya/topluluğa hiçbir yerde gösterilmiyor (yalnızca admin: app/admin/donations/page.tsx:414). |
| 42 | “Herkese açık” anahtarı | KISMİ | donations-client.tsx:126, 1205-1217; route.ts:85, 120 | Açıklama yalnızca akıştan söz ediyor, ama liderliği de belirliyor; varsayılan açık ve gerçek ad + fotoğraf tüm müşterilere gösteriliyor. |
| 43 | Bağış gönderimi (atomik düşüm) | ÇALIŞIYOR | donations-client.tsx:195-249; route.ts:219-250; lib/points-wallet.ts:75-118 | `updateMany ... points >= x` koşullu düşüm → çift harcama yok. |
| 44 | Başarı geri bildirimi | KISMİ | donations-client.tsx:225-227; lib/admin-toast.ts | Açıklama sabit Türkçe; admin-toast “Basarili: ” önekini (Türkçe karaktersiz) müşteri UI’ına basıyor; kutlama anı yok. |
| 45 | Oturum puanı senkronu (`update({points})`) | ÇALIŞIYOR | donations-client.tsx:236; lib/auth.ts:272-275 | |
| 46 | Bağış sonrası yeniden yükleme | KISMİ | donations-client.tsx:237, 159 | Tüm sayfa iskelete düşüyor, liderlik `visibleCount` sıfırlanıyor. |
| 47 | GET hata yönetimi | BOZUK | donations-client.tsx:164-186 | `success:false` (401/403/500/503) sessizce yutuluyor; yalnızca ağ istisnasında toast (B2). |
| 48 | POST hata yönetimi | ÇALIŞIYOR | donations-client.tsx:241-246; route.ts:198-216, 272-277 | |
| 49 | Kimlik + menü + modül kapısı (API) | ÇALIŞIYOR | route.ts:25-44, 175-194 | |
| 50 | Sunucu doğrulaması (zod) | ÇALIŞIYOR | route.ts:15-20, 196-204 | |
| 51 | Sunucuda hedef/bitiş tarihi kontrolü | EKSİK | route.ts:207-238 | Yalnızca `isActive`; aşırı fonlama ve süresi geçmiş projeye bağış mümkün (B5). |
| 52 | Uygulama içi bildirim | ÇALIŞIYOR | route.ts:240-247 | Başlık/mesaj sabit Türkçe. |
| 53 | Puan hareket kaydı (ledger) | EKSİK | prisma/schema.prisma (Transaction/Ledger modeli yok) | Bağış, kullanıcının puan geçmişinde “harcama” olarak izlenemiyor. |
| 54 | XP / rozet / görev entegrasyonu | EKSİK | lib ve app/api altında bağışa bağlı başka kullanım yok | Bağış oyunlaştırma ekonomisine bağlı değil. |
| 55 | Çoklu dil | KISMİ | donations-client.tsx:226; route.ts:103, 243-244, 263-264; lib/utils.ts:74 | Anahtarlar TR/EN’de eksiksiz ama sabit metinler, `tr-TR` sayı biçimi, `%45` sırası, DB içeriği tek dilli. |
| 56 | Azaltılmış hareket | KISMİ | components/providers.tsx:232 | `MotionConfig reducedMotion="user"` transform’ları kapatıyor; `width` animasyonları (çubuklar) ve kademeli girişlerin opaklığı devam ediyor. |
| 57 | Kullanıcının bağış geçmişi / makbuzu | EKSİK | — | Ne zaman, hangi projeye, hangi mesajla bağış yaptığını listeleyen görünüm yok. |

**Özet sayım:** ÇALIŞIYOR 23 · KISMİ 23 · BOZUK 3 · SAHTE 1 · EKSİK 7 (toplam 57)

---

## Bulgular

### B1 — Liderlik sekmesi 1 veya 2 bağışçıda tamamen boş
- **Önem:** yüksek · **Kategori:** işlevsellik/hata · **Efor:** S
- **Kanıt:** donations-client.tsx:831-832 (`top3 = slice(0,3)`, `rest = slice(3)`), :841 (`top3.length >= 3 &&`), :927 (`rest.length > 0 &&`).
- **Sorun:** `leaderboard.length` 1 ya da 2 iken boş durum dönmüyor (`length === 0` değil), podyum ≥3 şartıyla çizilmiyor, `rest` boş. Sonuç: başlıksız, içeriksiz bir sekme. Bu tam olarak modülün yeni açıldığı, yani ilk bağışçıların “lider olduk mu?” diye baktığı anda yaşanıyor.
- **Öneri:** Podyumu esnek hale getirin: 1 kişide tek sütun, 2 kişide 1–2 sütun, boş basamaklar “Bu basamak senin olabilir” gibi davet eden yer tutucularla gösterilsin. Podyum render’ını `top3.map` ile veri güdümlü yapın, 2-1-3 görsel sırasını CSS `order` ile kurun; DOM sırası 1-2-3 kalsın (ekran okuyucu için).

### B2 — GET hataları sessizce yutuluyor; modül kapalıyken “Henüz proje yok” yalanı
- **Önem:** yüksek · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** donations-client.tsx:164-186 (yalnızca `if (data.success)`; `else` dalı yok), :515-527 (boş durum), lib/module-gate.ts:119-127 (403 + `success:false` + açıklayıcı `error`).
- **Sorun:** Modül yönetici tarafından kapatıldığında, oturum düştüğünde (401) ya da DB erişilemediğinde istemci hiçbir şey göstermiyor; bütün istatistikler 0, projeler boş ve “Yakında yeni projeler eklenecek” metni çıkıyor. Kullanıcı yanlış bilgilendiriliyor, destek talebi doğuruyor.
- **Öneri:** Üç durumlu bir veri katmanı kurun (`loading | error | ready`). `res.ok` ve `data.success` ayrı ayrı ele alınsın; 403 `reason: module_disabled_*` için özel “Bu bölüm geçici olarak kapalı” ekranı, diğer hatalar için “Tekrar dene” butonlu hata kartı. Bunu SWR/React Query ile yapmak yeniden deneme, odakla tazeleme ve iptali bedavaya getirir.

### B3 — “Senin sıralaman” kartı hiçbir zaman görünmüyor (ölü kod + boş vaat)
- **Önem:** orta · **Kategori:** işlevsellik/ölü kod · **Efor:** M
- **Kanıt:** route.ts:83-89 (`take: 10`), :111 (sıra yalnızca bu 10 içinde), donations-client.tsx:834-836 (`currentUserEntry` aynı 10’dan geliyor → `rank > 10` ve “ilk 10’da değil” koşulları asla doğru olmaz), messages/tr.json `customerDonations.yourStandingDescription` (“İlk 10 dışında kalsan da yerin burada görünür.”).
- **Sorun:** Özellik tasarlanmış ama sunucu verisi buna izin vermiyor. Hero’daki “Sıralamanız” da aynı nedenle 11. sıradan itibaren “-”. Duolingo tipi liglerin en güçlü motivasyonu (“bir üst sıraya X puan kaldı”) burada çalışmıyor.
- **Öneri:** API’de kullanıcının gerçek sırasını ayrı hesaplayın: kullanıcının herkese açık toplamını alın, ardından `HAVING SUM(points) > myTotal` olan bağışçı sayısını sayan tek bir `$queryRaw` (ya da günlük materialize edilmiş bir `DonorStanding` özeti) kullanın. Yanıta `me: { rank, total, gapToNext }` ekleyin; UI’da “Bir üst sıraya 120 puan” mikro metni gösterin.

### B4 — “Senin etkin” ve özet sayıları kategori filtresine göre değişiyor
- **Önem:** orta · **Kategori:** veri doğruluğu · **Efor:** S
- **Kanıt:** donations-client.tsx:160 (`?category=`), :174-185 (etkiler filtrelenmiş `projects`’ten türetiliyor), route.ts:56-60 (filtre + `isActive: true`), :146 (`totalProjects: projects.length`).
- **Sorun:** Kullanıcı “Hayvanlar” filtresini seçince “Senin etkin” bölümündeki su/çevre kartları kayboluyor, “Desteklenen proje” 3’ten 1’e iniyor; “Toplam puan” ise değişmiyor. Ayrıca kapatılmış (pasif) projelere yapılan bağışlar kişisel etkiden tamamen siliniyor. Kişisel geçmiş, katalog filtresine bağlanmamalı.
- **Öneri:** Kişisel etkiyi ayrı bir yanıt alanı olarak sunucuda üretin: `donation.groupBy({ by: ['projectId'], where: { userId } })` + ilgili projeleri (aktif/pasif fark etmeksizin) `findMany({ where: { id: { in } } })`. Kategori filtresini istemci tarafına taşıyın (en fazla 150 proje zaten tek seferde geliyor) ya da `/api/customer/donations/projects` ile `/api/customer/donations/me` uçlarını ayırın.

### B5 — Sunucu hedefi, bitiş tarihini ve yarışı denetlemiyor
- **Önem:** orta · **Kategori:** veri bütünlüğü · **Efor:** S
- **Kanıt:** route.ts:207-216 (yalnızca `isActive` kontrolü, transaction dışında), :235-238 (koşulsuz `increment`), prisma/schema.prisma:1683-1690 (`goal`, `endDate`), donations-client.tsx:699, 792 (hedef kısıtı yalnızca istemcide).
- **Sorun:** Doğrudan API çağrısıyla ya da eski sayfayla hedefe ulaşmış projeye bağış yapılabiliyor; `current` hedefi aşıyor. `endDate` hiç kontrol edilmiyor. Admin projeyi kapatırken eşzamanlı bağış transaction dışındaki kontrolden geçebiliyor. Puan kaybı yok ama “Hedef tamamlandı” sözü ile defter tutarsızlaşıyor.
- **Öneri:** Transaction içinde koşullu güncelleme: `tx.donationProject.updateMany({ where: { id, isActive: true, OR: [{ endDate: null }, { endDate: { gt: now } }], current: { lt: goal } }, data: { current: { increment } } })`, `count === 0` ise anlamlı bir hata ile geri alın. Hedefi aşan son bağış için “kalan tutara kırp” mı yoksa “reddet” mi olduğuna ürün kararı verin ve UI’da “Hedefe 40 puan kaldı” gösterin.

### B6 — Hero’daki birincil CTA “Hemen Bağış Yap” hiçbir şey yapmıyor
- **Önem:** orta · **Kategori:** sahte etkileşim · **Efor:** S
- **Kanıt:** donations-client.tsx:295-298 (`onClick` yok).
- **Sorun:** Sayfanın görsel olarak en baskın butonu ölü. Güven kaybettirir.
- **Öneri:** Butonu ya öne çıkan (ya da hedefe en yakın) projenin bağış dialog’unu açacak şekilde bağlayın ya da proje ızgarasına yumuşak kaydırma yapsın. Daha iyisi: kullanıcıya özel “Senin için önerilen proje” (en çok bağış yaptığı kategori + hedefe en yakın) tek dokunuşla açılsın.

### B7 — Kategori değişimi ve bağış sonrası tam sayfa iskelet + istek yarışı
- **Önem:** orta · **Kategori:** UX/performans · **Efor:** M
- **Kanıt:** donations-client.tsx:153-159 (`setLoading(true)` her çağrıda), :255-266 (erken dönüş tüm ağacı söküyor), :237 (bağış sonrası `fetchData()`), AbortController yok.
- **Sorun:** Her filtre tıklaması hero, sekmeler, liderlik dahil her şeyi söküp iskelete döndürüyor; kaydırma konumu ve açık sekme durumu sıfırlanıyor, ilerleme çubukları baştan animasyon yapıyor. Hızlı art arda iki tıklamada geç dönen yanıt yenisinin üzerine yazabilir (yanlış kategori görünür).
- **Öneri:** İlk yükleme ile yeniden doğrulamayı ayırın (`isLoading` vs `isValidating`), filtreyi istemcide uygulayın ya da yalnızca ızgara alanında iskelet gösterin. SWR’ın `keepPreviousData` davranışı ve anahtar tabanlı iptal bu sorunu tek seferde çözer. Bağış sonrası tam yeniden yükleme yerine iyimser güncelleme: projenin `current` ve `userDonation` alanlarını yerel olarak artırın, arka planda sessizce yeniden doğrulayın.

### B8 — Panodaki “Liderlik” derin linki kırık; sekme URL’e bağlı değil
- **Önem:** orta · **Kategori:** navigasyon · **Efor:** S
- **Kanıt:** components/customer/dashboard/customer-dashboard.tsx:703 (`/customer/donations?tab=leaderboard`), donations-client.tsx:422 (`defaultValue="projects"`, `useSearchParams` kullanımı yok).
- **Sorun:** Panodan “Liderlik”e basan kullanıcı Projeler sekmesine düşüyor. Sekme paylaşılamıyor, geri tuşu sekmeyi korumuyor.
- **Öneri:** Sekmeyi `useSearchParams` ile kontrollü yapın (`value` + `onValueChange` → `router.replace('?tab=…', { scroll:false })`). Aynısını kategori filtresi için de yapın (`?category=water`).

### B9 — Gizlilik varsayılanı: gerçek ad + fotoğraf herkese açık, açıklama eksik
- **Önem:** orta · **Kategori:** gizlilik/KVKK · **Efor:** M
- **Kanıt:** donations-client.tsx:126 (`isPublic` varsayılan `true`), :1207-1210 (açıklama yalnızca “aktivite akışı” diyor), route.ts:85, 93-96, 120-123 (ad + görsel tüm müşterilere dönüyor; `userId` de yanıtta).
- **Sorun:** Kullanıcının tam adı ve profil fotoğrafı, bağış miktarıyla birlikte platformdaki tüm müşterilere gösteriliyor; anahtarın etkisi (liderliğe de girme) eksik anlatılıyor. Ayrıca diğer kullanıcıların `userId` değerleri istemciye sızıyor (yalnızca “ben miyim” kontrolü için gerekli).
- **Öneri:** Herkese açık görünümde “Ad S.” biçiminde maskeleme ya da kullanıcı adı/takma ad kullanın; anahtar metnini “Liderlik tablosunda ve topluluk akışında adınla görün” olarak düzeltin. Kullanıcının bu tercihi her bağışta yeniden seçmek yerine profil ayarı olarak hatırlansın. `userId` yerine sunucuda hesaplanan `isMe: boolean` dönün.

### B10 — i18n sızıntıları ve müşteri UI’ında admin toast öneki
- **Önem:** orta · **Kategori:** dil/tutarlılık · **Efor:** S
- **Kanıt:** donations-client.tsx:226 (sabit “Senin sayende …”), :44 + lib/admin-toast.ts (“Basarili: ” / “Dikkat: ” öneki, Türkçe karaktersiz), route.ts:103 (“Anonim”), :243-244 (bildirim), :263-264 (“birim”, “Etki”), :200, 213, 274 (sabit Türkçe hatalar), :1060 + lib/utils.ts:33-36 (`formatRelativeTime` locale parametresi verilmemiş), lib/utils.ts:74 (`formatNumber` sabit `tr-TR`), donations-client.tsx:654, 765 (“%45” biçimi EN’de de).
- **Sorun:** EN kullanıcı Türkçe toast, Türkçe göreli zaman ve Türkçe bildirim görüyor; TR kullanıcı “Basarili: Teşekkürler! …” gibi hem karaktersiz hem çift başlıklı bir toast görüyor. Ayrıca ton karışık: “Puanınız / Bağışınız” (siz) ile “Senin etkin / Senin katkın” (sen) yan yana.
- **Öneri:** Müşteri tarafında `sonner`’ı doğrudan (ya da müşteriye özel önek-siz bir sarmalayıcı) kullanın; toast açıklamasını parametreli çeviri anahtarına taşıyın (`t('customerDonations.successImpact', { value, unit, label })`). Sunucu hata ve bildirim metinlerini kullanıcının `preferredLanguage`’ına göre üretin. `Intl.NumberFormat`/`Intl.RelativeTimeFormat` için aktif locale’i geçirin. Hitap dilini tek tona (“sen”) sabitleyin.

### B11 — GET’te 8 ardışık sorgu, cache yok, filtreden bağımsız veriler her tıklamada yeniden hesaplanıyor
- **Önem:** orta · **Kategori:** performans · **Efor:** M
- **Kanıt:** route.ts:50, 56, 69, 76, 83, 93, 114, 119 (hepsi sırayla `await`), :32-44 (öncesinde iki kapı kontrolü).
- **Sorun:** Neon üzerinde her tur gidiş-dönüş eklenerek gecikme birikiyor; liderlik, platform toplamı ve akış kategoriyle hiç ilgili değil ama her filtre tıklamasında yeniden sorgulanıyor. Liderlik `groupBy` tüm tabloyu tarıyor.
- **Öneri:** Bağımsız sorguları `Promise.all` ile paralelleyin; liderlik + platform toplamı + akışı projede zaten kurulu Upstash Redis katmanında 30–60 sn TTL ile önbellekleyin ve bağış POST’unda etiketi geçersiz kılın. Uçları ayırın: `GET /donations/projects` (katalog, cache’lenebilir), `GET /donations/me` (kişisel, no-store), `GET /donations/community` (liderlik+akış, kısa TTL).

### B12 — `goal = 0` ve tanımsız kategori ile görsel bozulma
- **Önem:** düşük · **Kategori:** sağlamlık · **Efor:** S
- **Kanıt:** app/api/admin/donations/route.ts:131, 133 (kategori serbest string, `goal` 0 olabilir), donations-client.tsx:604, 725 (bölme), :617, 630, 696, 1111 (`categoryGradients[project.category]` tanımsız olabilir).
- **Sorun:** `goal=0` iken `0/0 = NaN` → “%NaN” ve buton aktif; bilinmeyen kategoride üst şerit ve ikon zemini görünmez, proje hiçbir filtreyle bulunamaz.
- **Öneri:** Admin tarafında `goal >= 1` ve kategori için enum doğrulaması (zod); istemcide `safeProgress` yardımcı fonksiyonu ve kategori için tek bir `getCategoryTheme(category)` (varsayılanlı) eşlemesi. Uzun vadede kategorileri DB tablosu yapın.

### B13 — Mobil: çift başlık ve sekme taşması
- **Önem:** düşük · **Kategori:** mobil/erişilebilirlik · **Efor:** S
- **Kanıt:** donations-client.tsx:270-275 + components/admin/admin-premium-hero.tsx:227 (iki `<h1>`), donations-client.tsx:423-435 (`px-6` + ikon) + components/ui/tabs.tsx:30 (`whitespace-nowrap`), app/customer/layout.tsx:36-41 (`overflow-x-hidden`).
- **Sorun:** Mobilde başlık iki kez okunuyor. Üç sekme yaklaşık 400px+ genişlik istiyor; 375px’lik ekranda içerik alanı ~350px, üst kap `overflow-x-hidden` olduğu için son sekmenin kırpılması yüksek olasılık (ekran görüntüsüyle **doğrulanmadı**).
- **Öneri:** Mobil başlık kartını kaldırıp hero’nun mobil düzenini kullanın. Sekmeleri `grid grid-cols-3 w-full` ile eşit genişlikte yapın, mobilde ikon üstte/etiket altta veya yalnızca kısa etiket.

### B14 — Bağış dialog’unda durum sızıntısı ve form sağlamlığı
- **Önem:** düşük · **Kategori:** UX · **Efor:** S
- **Kanıt:** donations-client.tsx:124-126 (dialog durumu sayfa seviyesinde), :545 (`onClose` yalnızca `setSelectedProject(null)`), :198 ve :1103 (`parseInt`), :1194-1201 (`maxLength` yok), :1110-1118 (`DialogTitle` = `<h2>` içinde `div`/`p`).
- **Sorun:** A projesinde 250 yazıp vazgeçen kullanıcı B projesini açınca 250 hazır geliyor; ondalık giriş sessizce kırpılıyor; 500 karakteri aşan mesaj sunucudan İngilizce zod hatasıyla dönüyor; işlem sürerken dialog kapatılabiliyor.
- **Öneri:** Dialog’u kendi durumunu tutan bağımsız bir bileşen yapın (proje değişince sıfırlansın), `inputMode="numeric"` + tamsayı maskesi, “Tümü” kısayolu, mesaj için `maxLength={500}` + sayaç, `donating` iken `onOpenChange` kilidi.

### B15 — Ölü importlar ve monolit dosya
- **Önem:** düşük · **Kategori:** mimari · **Efor:** M
- **Kanıt:** donations-client.tsx:5 (`Image` kullanılmıyor), :29 (`Progress` kullanılmıyor), :1070-1100 (14 prop’lu `DonationDialog`), :591-801 (iki neredeyse kopya kart bileşeni).
- **Öneri:** `components/customer/donations/` altına `ProjectCard` (varyant: `featured | default`), `DonorPodium`, `DonorList`, `ActivityFeed`, `DonateSheet` olarak bölün; veri katmanını `useDonations()` hook’una alın.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Kanıt ve şeffaflık katmanı (Starbucks Foundation, Patreon güncellemeleri, “charity: water” modeli):** Partner kurum adı/logosu, “bu puanlar kim tarafından gerçek bağışa çevriliyor” açıklaması, proje güncellemeleri (fotoğraf, rapor, tamamlanma belgesi) ve dönemsel “etki raporu”. Şu an etki değerleri admin’in girdiği `perPoint` çarpanından ibaret (prisma/schema.prisma:1685); kullanıcıya doğrulanabilir hiçbir şey sunulmuyor.
2. **Kişisel bağış geçmişi ve makbuz:** tarih, proje, miktar, mesaj, görünürlük; puan hareketleri için bir ledger (şemada yok). Revolut/Monzo’daki “harcama detay ekranı” eşdeğeri.
3. **Oyunlaştırma bağlantısı (Duolingo):** bağış başına XP, “İlk bağış”, “3 farklı kategori”, “Hedefi tamamlayan bağışçı” rozetleri, bağış serisi ve sezonluk görev entegrasyonu; liderlikte dönem filtresi (hafta/ay/tüm zamanlar) ve “bir üst sıraya X puan”.
4. **Topluluk hedefi anı:** proje hedefe ulaştığında tüm katkıda bulunanlara bildirim + kutlama ekranı; “kendi bağışın hedefi tamamladı” özel anı.
5. **Yıllık özet entegrasyonu (Spotify Wrapped):** /customer/my-year’de bağış etkisi kartı (“2026’da 1.240 litre temiz suya katkı”), paylaşılabilir görsel.
6. **Tekrarlayan / otomatik bağış:** “Her ay puanlarımın %10’unu bu projeye aktar” ya da “bakiyem 1000’i geçince 100 bağışla” (Starbucks’ın yuvarlama bağışı ve Monzo’nun “round-up” mantığı).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** “Puanım bir işe yaradı” hissini **somut, doğrulanabilir ve paylaşılabilir** kılmak. Kullanıcı sayfaya girdiğinde önce kendi etkisini (kaç litre, kaç fidan) büyük ve tek bir hikâye olarak görmeli; ardından tek dokunuşla önerilen projeye bağış yapabilmeli; bağış anı küçük ama unutulmaz bir kutlama olmalı.

**Yerleşim (mobil öncelikli):**
1. **Etki başlığı:** hero’daki 4 jenerik istatistik yerine tek bir “Senin etkin” kartı: toplam etki birimleri ikonlu sayaçlar olarak, altında “3 projeye 1.240 puan” özeti ve “Bir üst sıraya 120 puan” göstergesi. Kategori filtresinden bağımsız.
2. **Önerilen proje şeridi:** hedefe en yakın ve kullanıcının ilgi kategorisindeki 1 proje; “Hedefe 40 puan kaldı — sen tamamla” gibi bağlamsal CTA. Hero’daki ölü buton buraya bağlanır.
3. **Katalog:** sticky yatay kaydırılabilir kategori çipleri (URL’e bağlı), istemci tarafı filtreleme, tek `ProjectCard` bileşeni; karta dokununca alttan açılan detay sayfası (tam açıklama, partner, etiketler, bitiş tarihi, proje güncellemeleri, son bağışçılar).
4. **Bağış sayfası (bottom sheet):** büyük tutar seçici (hızlı tutarlar + “Tümü”), canlı etki önizlemesi (“250 puan = 5 fidan”), görünürlük tercihi profilden hatırlanır, mesaj sayaçlı.
5. **Topluluk sekmesi:** liderlik (dönem filtresi, esnek podyum, “Sen” sabit satırı) ve akış tek sekmede birleşir; akış gerçekten canlı olacaksa 30–60 sn polling ya da sayfa görünürken SSE.

**Motion / 3B (yerinde ve ölçülü):**
- Bağış onayında: ilerleme çubuğunun eski değerden yeni değere akması + kategori temalı küçük parçacık patlaması (su damlası, yaprak) — 600–800 ms, `useReducedMotion` ile yalnızca opaklık geçişine düşsün.
- Hedef tamamlandığında tek seferlik konfeti ve rozet açılışı; projede zaten bulunan rozet/ödül açılış diline (karakter rozeti reveal deseni) bağlanırsa tutarlı olur.
- 3B burada gereksiz: three.js sahnesi bu sayfanın amacına bir şey katmaz, ağırlık ekler. Sonsuz döngülü taç animasyonu (donations-client.tsx:876-881) ve her kart için `whileHover y:-4` kaldırılabilir; giriş animasyonları yalnızca ilk yüklemede oynasın.

**Veri / API değişiklikleri:**
- Uçları ayırın: `GET /api/customer/donations/projects?category=` (Redis cache’li katalog), `GET /api/customer/donations/me` (bakiye, kişisel etki, gerçek sıra, `gapToNext`, geçmiş), `GET /api/customer/donations/community?period=` (liderlik + akış, kısa TTL), `POST /api/customer/donations` (koşullu `updateMany` ile hedef/tarih/aktiflik kontrolü transaction içinde).
- Şema: `PointTransaction` (ledger) tablosu — bağış, mağaza, hediye gibi tüm harcamalar tek yerde; `DonationProject` için `partnerName`, `partnerLogoUrl`, `updates` ilişkisi; kategori için ayrı tablo veya enum; kullanıcıda `donationVisibilityDefault`.
- Oyunlaştırma: POST sonrası `after()` ile rozet/görev değerlendirmesi (mevcut rozet altyapısına olay olarak).
- İstemci: SWR/React Query, URL’e bağlı sekme ve kategori, iyimser güncelleme.

---

## Çakışmalar / birleştirme önerisi

- **/customer/leaderboard:** Genel liderlik zaten kategori (`points | feedbacks | badges | referrals`) ve dönem destekliyor (app/customer/leaderboard/page.tsx:56-74). Bağış liderliği burada ayrı ve daha zayıf (dönemsiz, yalnızca ilk 10) bir kopya. Öneri: `/api/leaderboard`’a `category=donations` ekleyin; bağış sayfasındaki liderlik sekmesi bu ortak bileşeni `category="donations"` ile gömsün. Tek liderlik motoru, tek tasarım.
- **/customer/shop ve /customer/rewards:** Bağış da bir puan harcama yolu. Starbucks gibi ödül kataloğunda “Bağış” kategorisi olarak da görünmeli (giriş noktası); ancak bağış sayfasının kendisi etki anlatımı nedeniyle ayrı kalmalı.
- **/customer/my-year:** Bağış verisi kullanılmıyor; Wrapped kartı eklenmeli (birleştirme değil, entegrasyon).
- **Pano kartı (customer-dashboard.tsx:680-706):** Sabit Türkçe metinler ve kırık `?tab=` linki; sayfa URL’e bağlandığında ve metinler çeviriye taşındığında tutarlı hale gelir.

Sayfa kaldırılmamalı veya başka bir sayfaya gömülmemeli: amaç özgün ve marka için değerli (sosyal sorumluluk). Karar: **koru-iyileştir**; önce B1, B2, B6, B8 (hepsi S efor), ardından B3, B4, B5, B11, sonra vizyondaki güven katmanı.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı; veritabanına, build'e veya dev server'a dokunulmadı. Okunan dosyalar: `app/customer/donations/page.tsx`, `app/customer/donations/donations-client.tsx`, `app/api/customer/donations/route.ts`, `lib/module-gate.ts`, `lib/api-http.ts`, `proxy.ts`, `app/customer/layout.tsx`, `messages/tr.json`.

### 1. Liderlik sekmesi 1 veya 2 bağışçı varken tamamen boş render oluyor — **DOĞRULANDI**

- Boş durum yalnızca `leaderboard.length === 0` iken dönüyor (donations-client.tsx:815).
- Podyum yalnızca `top3.length >= 3` iken çiziliyor (donations-client.tsx:841); liste kartı `rest.length > 0` şartına bağlı (donations-client.tsx:927) ve `rest = leaderboard.slice(3)` (donations-client.tsx:832) 1–2 kayıtta boş.
- "Senin sıran" kartı (`showCurrentUserAfterTop`, donations-client.tsx:835-836): kullanıcı listede değilse `currentUserEntry` undefined → false; listedeyse sıra ≤ 10 ve ilk 10 içinde → yine false.
- API tarafında liste `isPublic: true` bağışlardan `take: 10` ile kuruluyor (app/api/customer/donations/route.ts:83-108); 1–2 farklı herkese açık bağışçı olması gerçekçi bir durum (modülün ilk günleri, ya da çoğu bağışın `isPublic=false` yapılması).
- **Yeniden üretim:** Herkese açık bağış yapmış tek bir kullanıcı (A) olsun. A veya başka bir müşteri `/customer/donations` → "Liderlik" sekmesi: `space-y-8` kapsayıcısı içinde hiçbir çocuk render edilmez; sekme başlığı ve boş durum mesajı da yoktur. Üstelik A, kendi "Etkin" kartında `#1` sırasını görür (donations-client.tsx:411, `userStats.rank`) ama liderlik sekmesinde kendini göremez — tutarsızlık.
- **Ciddiyet notu:** Güvenlik/veri sorunu değil, görünür bir UX hatası; "KRİTİK" değil, Orta/Yüksek UX olarak sınıflandırılmalı. Düzeltme yaklaşımı: podyumu `top3.length` kadar esnek çizen (1 kişi → yalnız 1. basamak, 2 kişi → 1. ve 2. basamak; boş basamaklar "Sıradaki sen ol" yer tutucusu) bir `Podium` bileşeni; ayrıca boş durum koşulunu "render edilecek içerik yok" üzerinden değil, veri sayısından bağımsız olarak her durumda en az bir öğe çizecek şekilde kurmak.

### 2. GET başarısız yanıtları sessizce yutuluyor; modül kapalı/401/500'de yanıltıcı boş durum — **DOĞRULANDI**

- `fetchData` yalnızca `data.success` true iken state set ediyor; `else` dalı yok, `res.ok` kontrolü yok (donations-client.tsx:164-186). Toast yalnızca `catch` içinde (donations-client.tsx:187-189), yani ağ hatası veya JSON parse hatası olursa çıkar.
- Sunucu tüm hata durumlarında geçerli JSON dönüyor, dolayısıyla `res.json()` patlamıyor ve `catch`'e düşülmüyor:
  - 401 `{ error: 'Unauthorized' }` (route.ts:26-31),
  - 403 menü gizli `{ success:false, reason:'menu_hidden_for_role' }` (lib/module-gate.ts:153-161),
  - 403 modül kapalı `{ success:false, reason:'module_disabled_globally' }` (lib/module-gate.ts:119-127),
  - 503 DB erişilemez `{ code:'SERVICE_UNAVAILABLE', retryable:true }` (lib/api-http.ts:18-28),
  - 500 `{ error: 'Internal server error' }` (route.ts:165-168).
- Sayfa düzeyinde modül/menü kapısı yok: `page.tsx` yalnızca dinamik import yapıyor (page.tsx:7-23), `app/customer/layout.tsx` modül kontrolü yapmıyor, `proxy.ts` `/customer/*` için yalnızca rol kontrolü yapıyor (proxy.ts:53, 124). Kod tabanında `module_disabled_globally` yanıtını yakalayan istemci tarafı bir interceptor da yok (grep ile yalnızca lib/module-gate.ts ve admin dosyalarında geçiyor).
- **Yeniden üretim:** Yönetici `donations` modülünü kapatır. Müşteri yer imi, PWA kısayolu, panodaki bağış kartı linki ya da açık sekme yenilemesiyle `/customer/donations`'a girer → GET 403 → state başlangıç değerlerinde kalır: istatistikler 0, `projects=[]` → "Henüz proje yok / Yakında yeni projeler eklenecek" (donations-client.tsx:515-527; messages/tr.json:3476-3477), liderlikte "Henüz bağış yok". Kullanıcıya modülün kapatıldığı söylenmez. Aynı durum Neon soğuk başlangıç/kesintisinde (503) ve oturum düşmesinde (401) de yaşanır.
- **Ek bulgu (iddiayı güçlendiriyor):** Kategori değişiminde (`useEffect` → `[activeCategory]`, donations-client.tsx:153-155) ikinci istek başarısız olursa state sıfırlanmaz; önceki kategorinin projeleri yeni seçilen kategori filtresi altında, hata bildirimi olmadan gösterilmeye devam eder.
- **Ciddiyet notu:** Veri sızıntısı veya puan kaybı yok (POST tarafı ayrı ve doğru şekilde kapılı); etkisi yanıltıcı UX ve destek yükü. "Yüksek" UX olarak yerinde. Düzeltme yaklaşımı: `fetchData` içinde `!res.ok || !data.success` için açık bir `error` state'i (`{ kind: 'module_disabled' | 'unauthorized' | 'unavailable' | 'unknown', retryable }`) tutmak; `reason` alanına göre ayrı ekranlar (modül kapalı → bilgilendirici kilit ekranı + panoya dönüş; 401 → yeniden giriş yönlendirmesi; 503/500 → "Tekrar dene" düğmeli hata kartı) çizmek; tercihen tüm müşteri sayfalarında ortak bir `useGatedFetch`/SWR fetcher ile bu sözleşmeyi tek yerde çözmek ve sayfa düzeyinde (server component/layout) `assertModuleEnabled` eşdeğeri bir kapı ile kapalı modülde istemci gövdesini hiç yüklememek.

### Özet

| İddia | Karar |
|---|---|
| Liderlik 1–2 bağışçıda boş render | Doğrulandı (UX, güvenlik değil) |
| GET hataları yutuluyor, yanıltıcı boş durum | Doğrulandı (UX; ek olarak kategori değişiminde bayat veri) |

---

## Uygulama (Dalga 2)

**Yeni yer:** Cüzdan → **Bağış** (`/customer/wallet/donate`). `/customer/donations` sorgu parametrelerini koruyarak kalıcı yönlendirme; eski pano bağlantısı `?tab=leaderboard` Topluluk sekmesine düşer. 1242 satırlık `donations-client.tsx` silindi; yerine `components/customer/m-cuzdan-hareketler/` altında küçük bileşenler (`donate-view`, `donate-parts` — tek `ProjectCard`, `donate-sheet`, `community-tab`, `history-tab`, `donate-module-off`).

**Gerçek bağış akışı:** `POST /api/customer/wallet/donate` (`defineRoute`: yalnız CUSTOMER, zod gövde, 10/dk hız sınırı, 8 KB gövde sınırı, modül+menü kapısı) → `lib/customer-wallet/donate/service.ts` `makeDonation`: tek transaction'da (1) istek anahtarı defterde varsa önceki bağış döner (çift dokunuş = tek düşüm), (2) **koşullu** `UPDATE "DonationProject"` (aktif, arşivsiz, başlangıç ≤ şimdi < bitiş, `current + puan ≤ goal`), (3) `Donation` satırı, (4) `debitPoints(tx, { source: 'donation', sourceId: donation.id, idempotencyKey })` — `lib/economy` üzerinden; `PointsLedger` satırı = makbuzun defter kaydı, eksi bakiye imkânsız, yetersizse her şey geri alınır, (5) kullanıcının dilinde bildirim. Yanıt sonrası (`after`) topluluk önbelleği sürümlenir; hedefi tamamlayan bağışta katkı veren herkese bildirim. Okuma uçları: `GET /api/customer/wallet/donate` (katalog + kişisel etki + gerçek sıra), `/community`, `/history`, `/history/[donationId]`. Eski `/api/customer/donations` yeni uçların takma adı (admin modül özeti bu yolu listeliyor). Testler: `__tests__/lib/customer-wallet-donate.test.ts` (rota dahil 18 test).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Rota kabuğu (`ssr:false`) | ÇALIŞIYOR | Sunucu bileşeni + SSR ön yükleme; Topluluk/Bağışlarım sekmeleri ve bağış paneli tembel yüklenir |
| 2 | Segment metadata | ÇALIŞIYOR | TR/EN |
| 3 | İkinci iskelet | ÇALIŞIYOR | Tek iskelet (`loading.tsx`), sonra SSR verisi — düzen sıçraması yok |
| 4 | Mobil başlık kartı (çift `h1`) | KALDIRILDI | Cüzdan kabuğunun tek `h1`'i |
| 5 | Hero | KALDIRILDI | Yerine "Senin etkin" kartı |
| 6 | Hero çipi | KALDIRILDI | Yalnız dekoratifti |
| 7 | "Hemen Bağış Yap" (SAHTE) | ÇALIŞIYOR | "Senin için önerilen" projenin "Bağış yap"ı paneli açar (en çok bağışladığın kategoride hedefe en yakın açık proje, sunucuda seçilir) |
| 8 | "Nasıl çalışır" | ÇALIŞIYOR | `<details>`; video vaadi (Play ikonu) yok; görünürlük ve makbuz anlatılır |
| 9 | Puanınız | ÇALIŞIYOR | Etki kartında bakiye |
| 10 | Bağışınız | ÇALIŞIYOR | |
| 11 | Toplam etki | ÇALIŞIYOR | Doğru etiketle: "Toplulukta N bağışçı toplam M puan bağışladı" |
| 12 | Sıralamanız | ÇALIŞIYOR | Gerçek sıra (ilk 10 dışında da), "bir üst sıraya X puan" |
| 13 | "Senin etkin" | ÇALIŞIYOR | Katalog filtresinden bağımsız (sunucuda) |
| 14 | Etki kartları | ÇALIŞIYOR | Birim+etiket bazında toplanır; kapanmış/arşivli projelere bağışlar da sayılır ve "kapandı" diye belirtilir |
| 15 | Toplam özet | ÇALIŞIYOR | Tutarlı ikili (puan + proje sayısı) |
| 16 | Sekmeler | ÇALIŞIYOR | URL'de (`tab`), `leaderboard`/`activity` eski değerleri anlaşılır, `aria` sekme rolleri |
| 17 | Kategori filtresi | ÇALIŞIYOR | İstemcide (tam sayfa iskelet yok, yarış yok), veri güdümlü (sabit liste değil), radiogroup |
| 18 | Öne çıkan bölüm | ÇALIŞIYOR | Tek ızgarada önce sıralanır + "Öne çıkan" rozeti (iki kopya kart birleşti) |
| 19 | Öne çıkan kart istatistiği | ÇALIŞIYOR | |
| 20 | İlerleme | ÇALIŞIYOR | `goal = 0` → "Hedefsiz kampanya" (NaN yok), `role="progressbar"` |
| 21 | Senin katkın | ÇALIŞIYOR | |
| 22 | Hedefte devre dışı buton | ÇALIŞIYOR | Sunucu da koşullu güncellemeyle reddeder |
| 23 | Tüm projeler ızgarası | ÇALIŞIYOR | |
| 24 | Projeler boş durumu | ÇALIŞIYOR | Hata/yetkisiz/modül kapalı ayrı ekranlar |
| 25 | Etiketler | ÇALIŞIYOR | Proje detayında |
| 26 | Başlangıç/bitiş | ÇALIŞIYOR | Gösterilir ("12 gün kaldı") ve uygulanır (katalog + bağış) |
| 27 | Proje detayı | ÇALIŞIYOR | `?project=` derin linkli çekmece: tam açıklama, dönüşüm oranı, tarihler, etiketler |
| 28 | Podyum | ÇALIŞIYOR | "Sen" işareti; DOM sırası 1-2-3, görsel 2-1-3 |
| 29 | 1–2 bağışçı | ÇALIŞIYOR | Esnek podyum, boş basamak "Bu basamak senin olabilir" |
| 30 | Liste + "Siz" | ÇALIŞIYOR | |
| 31 | "Daha fazla yükle" | KALDIRILDI | İlk 10 tek ekranda; kendi sıran ayrı "Senin yerin" kartında |
| 32 | "Senin sıralaman" kartı | ÇALIŞIYOR | Gerçek sıra SQL ile |
| 33 | Liderlik boş | ÇALIŞIYOR | |
| 34 | Aktivite akışı | ÇALIŞIYOR | "Son bağışlar" ("Canlı" iddiası yok), elle yenile + odakta tazeleme, yerel göreli zaman |
| 35 | Aktivite boş | ÇALIŞIYOR | |
| 36 | Bağış paneli aç/kapat | ÇALIŞIYOR | Her açılışta sıfırlanır; işlem sürerken kapatılamaz |
| 37 | Hızlı tutarlar | ÇALIŞIYOR | Bakiye/kalanla sınırlı + "Tümü (N)" |
| 38 | Serbest tutar | ÇALIŞIYOR | Tam sayı; "10.5" sessizce kırpılmaz, hata gösterilir; binlik ayırıcı kabul |
| 39 | Yetersiz bakiye | ÇALIŞIYOR | Satır içi + sunucu kodu |
| 40 | Etki önizlemesi | ÇALIŞIYOR | Ondalıklı ("0,2 fidan"), `aria-live` |
| 41 | Mesaj | ÇALIŞIYOR | 280 karakter sayaç; kime görüneceği yazılı; makbuzda görünür |
| 42 | Herkese açık anahtarı | ÇALIŞIYOR | Varsayılan son tercih, hiç yoksa **gizli**; ad maskeli, foto yok; açıklama sıralamayı da anlatıyor |
| 43 | Atomik düşüm | ÇALIŞIYOR | `lib/economy` `debitPoints` + defter + tek-kez anahtarı |
| 44 | Başarı geri bildirimi | ÇALIŞIYOR | Kutlama paneli: onay ikonu, etki, ilerleme eski→yeni (`celebrate` bütçesi, azaltılmışta statik), yeni bakiye, makbuz bağlantısı; ekran okuyucuya duyuru |
| 45 | Oturum puanı senkronu | ÇALIŞIYOR | + Ana Sayfa ve Hareketler önbellekleri tazelenir |
| 46 | Bağış sonrası yenileme | ÇALIŞIYOR | Önbellek yerinde güncellenir, arkadan tazelenir; sekme/kaydırma korunur |
| 47 | GET hata yönetimi | ÇALIŞIYOR | Zarf v2 kodlu hata → `QueryState` |
| 48 | POST hata yönetimi | ÇALIŞIYOR | Kodlar: INSUFFICIENT_POINTS · GOAL_EXCEEDED (kalan ile) · GOAL_REACHED · PROJECT_CLOSED · MODULE_DISABLED · RATE_LIMITED |
| 49 | Kimlik + menü + modül kapısı | ÇALIŞIYOR | API + sayfa düzeyinde (kapalıysa dürüst kilit ekranı + kendi bağış geçmişi) |
| 50 | Zod | ÇALIŞIYOR | `points` 1–100.000 tam sayı, mesaj ≤ 280, istek anahtarı zorunlu |
| 51 | Sunucuda hedef/bitiş | ÇALIŞIYOR | Transaction içinde koşullu UPDATE |
| 52 | Uygulama içi bildirim | ÇALIŞIYOR | Kullanıcının dilinde; hedef tamamlanınca katkı verenlere ayrıca |
| 53 | Puan hareket kaydı | ÇALIŞIYOR | `PointsLedger` (source `donation`); Hareketler → Puan defterinde görünür |
| 54 | XP / rozet / görev | KALDIRILDI (bu dalgada) | Bağışa XP/puan basmak yeni bir mint yolu = ekonomi kararı (matris + tavan) ister; ürün sahibi onayı olmadan eklenmedi |
| 55 | Çoklu dil | ÇALIŞIYOR | Arayüz, bildirim, hata, sayı/zaman biçimi; proje içeriği yöneticinin girdiği dilde (DB tek dilli) |
| 56 | Azaltılmış hareket | ÇALIŞIYOR | Yalnız transform/opaklık animasyonu (`scaleX`); `useReducedMotionPref` ile statik |
| 57 | Bağış geçmişi / makbuz | ÇALIŞIYOR | "Bağışlarım" sekmesi (imleçli) + `?receipt=` makbuz: makbuz no, tarih, etki, not, görünürlük, defter kaydı, bağış sonrası bakiye |

### Kapanan bulgular
B1 (1–2 bağışçıda boş liderlik), B2 (yutulan hatalar), B3 (ölü sıralama kartı), B4 (filtreye bağlı kişisel etki), B5 (hedef/tarih/yarış), B6 (sahte CTA), B7 (tam sayfa iskelet, yarış), B8 (derin bağlantı), B9 (gizlilik: maske, `isMe`, varsayılan gizli), B10 (i18n + admin toast), B11 (paralel sorgu + sürümlü önbellek + uç ayrımı), B12 (`goal = 0`, tanımsız kategori), B13 (çift başlık, sekme taşması — pill sekmeler yatay kayar, ≥ 44px), B14 (panel durum sızıntısı, form sağlamlığı), B15 (monolit + ölü importlar). **15/15.**

Eksik özelliklerden uygulananlar: kişisel bağış geçmişi ve makbuz (2), topluluk hedefi anı (4: tamamlayana kutlama + katkı verenlere bildirim), "bir üst sıraya X puan" (3'ün bir kısmı).

### Kalanlar
- Partner kurum, proje güncellemeleri ve etki raporu (eksik özellik 1) — **ŞEMA İSTEĞİ:** `DonationProject.partnerName`, `partnerLogoUrl` ve `DonationProjectUpdate` ilişkisi (başlık, metin, görsel, tarih). Şema dalgası bittiği için uydurma veriyle doldurulmadı.
- Görünürlük tercihi şu an "son bağıştaki tercih"ten türetiliyor; kalıcı profil ayarı için **ŞEMA İSTEĞİ:** `User.donationVisibilityDefault Boolean?`.
- Bağışa XP/rozet/görev bağlantısı ve tekrarlayan bağış (eksik özellik 3'ün kalanı, 5, 6): ürün/ekonomi kararı.
- Ortak liderlik motoruna (`/api/leaderboard?category=donations`) birleşme: Lig yüzeyinin sahipliğinde.
- Görsel doğrulama ekran görüntüsüyle yapılmadı (dev server/build bu dalgada yasak).
