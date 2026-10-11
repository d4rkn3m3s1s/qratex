# /admin/ab-testing

**Amaç:** Bayileri (DEALER) A/B/C kohortlarına bölüp her kohorta farklı XP/puan çarpanı uygulandığını varsayarak geri bildirim hacmi, ortalama puan ve bayi yanıt oranı üzerindeki etkiyi karşılaştırmak.

**Genel puan:** 3/10 · **Karar:** **birleştir** (`/admin/innovation` içindeki gerçek A/B altyapısı ve `FeatureFlag` modeliyle tek bir "Deneyler" modülünde yeniden kurulmalı; bu sayfa kendi başına bırakılmamalı)

> Özet hüküm: Sayfa teknik olarak hatasız yükleniyor ve yetki kontrolleri doğru; ancak **ölçtüğünü iddia ettiği deney hiç çalışmıyor**. `abCohort` alanı kod tabanında hiçbir puan/XP yolunda okunmuyor; ekrandaki "x1.5 XP / x2.0 XP" etiketleri sunucuda sabit yazılmış metinden ibaret. Kohortlar arasında görülen her fark gürültüdür ve bu ekrana bakılarak karar verilmesi yanlış ürün kararına götürür.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 2/10 | Veri çekme ve atama butonu çalışıyor, ama çekirdek vaat olan "çarpan uygulaması" hiçbir yerde yok; metrikler tedavi öncesi veriyle kirli. |
| UX | 3/10 | Tek bakışta "hangi kohort kazanıyor?" sorusuna cevap yok; özet kartı yukarıdaki kartların aynısını tekrarlıyor; hata durumu "boş veri" gibi görünüyor. |
| Görsel | 5/10 | Ortak `AdminPremiumHero` ile tutarlı; fakat kart köşe dekoru görünmüyor (negatif z-index), açık temada beyaz atama butonu kontrastsız, "Deneysel" iki kez tekrarlanıyor. |
| Mimari | 2/10 | Deney tanımı yok (kohort etiketi + çarpan route içinde sabit), atama genel amaçlı `bootstrap` ucuna gömülü, audit log yok, sistemde aynı amaçlı ikinci bir A/B altyapısı var. |
| Performans | 6/10 | Ölçek küçükken sorun yok; ancak tüm bayiler belleğe alınıyor, atama döngüsü bayi başına tek `UPDATE` (N sorgu), cache yok. |
| Erişilebilirlik + mobil | 5/10 | Grid mobilde düzgün yığılıyor; iskelette `aria-busy`/ekran okuyucu metni yok, `animate-spin`/`animate-pulse` azaltılmış hareketi gözetmiyor, metrik çiftleri semantik değil. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişimi: ADMIN rolü + gizli kapı (gate cookie) | ÇALIŞIYOR | `proxy.ts:51`, `proxy.ts:79-87` | Sayfa yolu için doğru. |
| 2 | API yetkisi (`GET /api/admin/ab-testing/overview`) | ÇALIŞIYOR | `app/api/admin/ab-testing/overview/route.ts:24-25` | `requireAuth(['ADMIN'])` + token-replay kontrolü (`lib/api-auth.ts:52-80`). Gizli kapı API'yi kapsamıyor (bkz. Bulgu 6). |
| 3 | Hero başlık / açıklama / ikon | ÇALIŞIYOR (içerik yanıltıcı) | `app/admin/ab-testing/page.tsx:78-82` | "puan çarpanları atayın" diyor; kartlarda "XP çarpanı" yazıyor; ikisi de uygulanmıyor. |
| 4 | "Deneysel mod" rozeti (chip) | SAHTE | `page.tsx:83-87` | Hiçbir moda bağlı değil, yalnızca dekor; eyebrow "Deneysel" ile tekrar. |
| 5 | "Yenile" butonu | ÇALIŞIYOR | `page.tsx:90-99`, `page.tsx:68-72` | Yenilerken kartlar iskelete dönüyor (veri kayboluyor), `animate-spin` azaltılmış hareketi gözetmiyor. |
| 6 | "Boş cohortları ata (N)" butonu | KISMİ | `page.tsx:100-105`, `page.tsx:49-66`, `app/api/admin/bootstrap/route.ts:184-206` | Çalışıyor ama rastgele değil (createdAt sırasıyla round-robin), her çağrıda sayaç A'dan başlıyor → dengesizlik; onay yok, audit yok, geri alınamaz. |
| 7 | Atama butonunun koşullu görünmesi | ÇALIŞIYOR | `page.tsx:100` | Yalnızca `unassigned > 0` iken görünür. |
| 8 | Yükleniyor iskeleti (3 kart) | ÇALIŞIYOR | `page.tsx:111-114` | `aria-busy`/sr-only metin yok. |
| 9 | Kohort kartı — etiket (A Kontrol / B x1.5 / C x2.0) | ÇALIŞIYOR (sabit kod) | `overview/route.ts:11-15` | Etiket sunucuda sabit; deney tanımı yok. |
| 10 | Kohort kartı — "XP çarpanı x{n}" | **SAHTE** | `page.tsx:122`, `overview/route.ts:17-21` | `abCohort` hiçbir puan/XP yolunda okunmuyor; tek okuyucular bu route ve bootstrap (grep: `abCohort` yalnızca `prisma/schema.prisma:102`, `overview/route.ts`, `bootstrap/route.ts`). Gerçek XP hesabı `app/api/feedbacks/route.ts:301-318` kohortu hiç dikkate almıyor. |
| 11 | Kohort kartı — bayi sayısı | ÇALIŞIYOR | `overview/route.ts:43-44,79` | |
| 12 | Kohort kartı — geri bildirim sayısı | KISMİ | `overview/route.ts:59-63` | Tüm zamanlar; atama tarihinden önceki veri dahil (atama zamanı hiç tutulmuyor). |
| 13 | Kohort kartı — ortalama puan | KISMİ | `overview/route.ts:81`, `page.tsx:137` | Veri yoksa `0.00` gösterir (gerçek bir puanmış gibi); tüm zamanlar; ondalık ayırıcı TR yerel ayarına uymuyor. |
| 14 | Kohort kartı — yanıt oranı | KISMİ | `overview/route.ts:64-74,82`, `page.tsx:141` | Bayi davranışı; müşteri XP çarpanıyla nedensel bağı yok (bkz. Bulgu 3). |
| 15 | Kart köşe dekoru (hover'da renklenen çeyrek daire) | BOZUK (görsel olarak doğrulanmadı) | `page.tsx:117-118`, `components/ui/card.tsx:15` | Kart stacking context oluşturmuyor (z-index/isolate yok) ve `bg-card` opak; `-z-10` çocuk kartın arka planının altına çiziliyor → görünmez. |
| 16 | "Cohort Etki Özeti" kartı | SAHTE (bilgi katmıyor) | `page.tsx:149-172` | Yukarıdaki kartlardaki ortalama puan ve yanıt oranını aynen tekrarlıyor; kontrol grubuna göre fark (lift), güven aralığı, anlamlılık yok. |
| 17 | Boş durum ("Henüz cohort verisi yok…") | KISMİ | `page.tsx:154-158` | API hatasında da aynı mesaj çıkıyor (bkz. #18). |
| 18 | Hata durumu | KISMİ | `page.tsx:36-39` | Yalnızca toast; kartlar tamamen kaybolur, özet kart "önce atayın" der → hata "veri yok" ile karışır; yeniden dene CTA'sı yok. |
| 19 | Toplam bayi sayısı (`totals.dealerCount`) | EKSİK (çekiliyor, gösterilmiyor) | `page.tsx:26,35`, `overview/route.ts:92` | State'e yazılıyor ama hiçbir yerde render edilmiyor. |
| 20 | Atanmamış bayi sayısı | KISMİ | `page.tsx:103` | Yalnızca buton etiketinde; sıfırken hiç görünmüyor. |
| 21 | Bayi adları (`businessName`, `name`) | EKSİK (çekiliyor, atılıyor) | `overview/route.ts:29` | Gereksiz veri çekimi; drill-down yok. |
| 22 | Modül kontrolü `ab_testing` (Ayarlar → Modüller) | SAHTE | `lib/module-controls.ts:65`, `components/dashboard/sidebar.tsx:438-439`, `overview/route.ts` (assertModuleEnabled yok) | Kapatılınca ne menü ne sayfa ne API etkileniyor; ADMIN menüsü modül filtresini tamamen atlıyor. |
| 23 | Ayarlar sayfasındaki ikinci "A/B cohort ata" butonu | ÇALIŞIYOR (kopya) | `app/admin/settings/settings-client.tsx:841` | Aynı mutasyon iki yerden, bağlamsız (demo seed butonlarının arasında) tetiklenebiliyor. |
| 24 | Playbook sayfasından bağlantı | ÇALIŞIYOR | `app/admin/playbooks/page.tsx:104` | |
| 25 | i18n | EKSİK | `page.tsx` (tüm metinler sabit TR) | Menü etiketi i18n'li (`messages/tr.json:2487`), sayfa değil; "cohort/kohort/Cohort", "Dealer/Bayi" karışık. |
| 26 | Toast metinleri | KISMİ | `lib/admin-toast.ts:17,19` | Ortak önek "Basarili: " Türkçe karakter eksik (sistem geneli). |
| 27 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:110,160` | `md:grid-cols-3` → mobilde tek kolon; hero aksiyonları `flex-wrap`. |
| 28 | Azaltılmış hareket | KISMİ | `components/admin/admin-premium-hero.tsx:35,73`; `page.tsx:97,113` | Hero gözetiyor; sayfadaki spin/pulse gözetmiyor. |
| 29 | Ölü import | BOZUK (kalite) | `page.tsx:4` | `Zap` içe aktarılıp kullanılmıyor. |
| 30 | Deney yaşam döngüsü (oluştur / başlat / duraklat / bitir / kazananı yayınla) | EKSİK | — | Deney nesnesi yok. |
| 31 | İstatistiksel anlamlılık / güven aralığı / örneklem gücü | EKSİK | — | |
| 32 | Zaman serisi grafiği (kohort başına günlük metrik) | EKSİK | — | |
| 33 | Kohort sıfırlama / yeniden dengeleme / tekil bayi atama-çıkarma | EKSİK | — | Atama tek yönlü ve kalıcı. |
| 34 | Audit log (kim, ne zaman, kaç bayi) | EKSİK | `bootstrap/route.ts:184-206` | Audit kaydı yok. |
| 35 | Dışa aktarma (CSV) | EKSİK | — | |

**Durum sayımı:** ÇALIŞIYOR 9 · KISMİ 11 · BOZUK 2 · SAHTE 4 · EKSİK 9 (toplam 35)

---

## Bulgular

### 1. Deneyin tedavisi hiç uygulanmıyor — ekran sahte bir deney gösteriyor
- **Önem:** kritik · **Kategori:** veri bütünlüğü / sahte özellik
- **Kanıt:** `prisma/schema.prisma:102` (`abCohort String?`); kod tabanında `abCohort` yalnızca `app/api/admin/ab-testing/overview/route.ts:29,43,86` ve `app/api/admin/bootstrap/route.ts:187,194,197` içinde geçiyor. Gerçek ödül yolu `app/api/feedbacks/route.ts:301-318` VIP, sezonluk ve global çarpanı uyguluyor, kohort çarpanını uygulamıyor. Çarpanlar `overview/route.ts:17-21` içinde sabit.
- **Sorun:** Operatör "C kohortu x2 XP alıyor" sanıyor; gerçekte üç kohort da aynı kurallarla çalışıyor. Kohortlar arasındaki farklar tamamen rastlantısal (ve atama sırasına bağlı sistematik yanlılık). Bu ekrandan "x2 XP yanıt oranını artırıyor" gibi bir sonuç çıkarılırsa ürün/ekonomi kararı yanlış veriyle alınır.
- **Profesyonel öneri:** Kısa vadede sayfaya açık bir "Tedavi uygulanmıyor — yalnızca gözlem" uyarısı koyun veya menüden kaldırın. Kalıcı çözümde deneyi gerçek yapın: `Experiment` (id, key, hypothesis, primaryMetric, guardrailMetrics, status, startedAt, endedAt) ve `ExperimentAssignment` (experimentId, subjectId, variant, assignedAt) modelleri; varyant parametreleri (`xpMultiplier`, `pointMultiplier`) deneyde tutulur; `app/api/feedbacks/route.ts` içindeki çarpan zincirine `applyExperimentMultiplier(userId|dealerId, tx)` eklenir ve uygulanan çarpan mevcut `globalXpMultiplier` meta alanının yanına `experimentVariant` olarak yazılır (denetlenebilirlik). **Dikkat:** puan çarpanı yeni puan basımı demektir; `points-economy-invariants` kurallarına (atomik tek seferlik kredi, günlük üst sınır, fraud görünürlüğü) uyulmalı, puan çarpanı yerine yalnızca XP çarpanıyla başlanması daha güvenli.
- **Efor:** L

### 2. Kohort ataması rastgele değil ve artımlı çalıştırmada A kohortuna yığılıyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / deney tasarımı
- **Kanıt:** `app/api/admin/bootstrap/route.ts:185-200` — `orderBy: { createdAt: 'asc' }`, `let idx = 0` her istekte sıfırdan başlıyor, yalnızca atanmamış bayilerde artıyor.
- **Sorun:** (a) Atama kayıt sırasına göre deterministik round-robin; kayıt tarihi bayi olgunluğuyla korele olduğu için kohortlar karşılaştırılabilir değil. (b) Her çağrı A'dan başladığı için, yeni gelen bayiler tek tek atanırsa (ör. her hafta 1 bayi) hepsi A'ya düşer; 2'şerli gelirse A ve B dolar, C hiç büyümez. Kohort boyutları zamanla sistematik olarak bozulur.
- **Profesyonel öneri:** Atamayı `hash(experimentKey + dealerId) mod 100` ile deterministik-rastgele yapın (sistemde zaten `pickAbVariant` + `hashSeed` var: `lib/innovation-ab.ts:10-23`); ağırlıklar deney tanımından gelsin. Atama `ExperimentAssignment` tablosuna `assignedAt` ile yazılsın, `createMany({ skipDuplicates: true })` ile tek sorguda; yeni bayiler kayıt anında (veya ilk feedback'te) tembel olarak atansın — elle "ata" butonuna gerek kalmasın. İsteğe bağlı: kategori/şehir gibi değişkenlere göre katmanlı (stratified) atama.
- **Efor:** M

### 3. Metrikler tedavi öncesi veriyle kirli ve seçilen metrik tedaviyle nedensel olarak ilişkisiz
- **Önem:** yüksek · **Kategori:** veri doğruluğu / analitik
- **Kanıt:** `overview/route.ts:59-71` — feedback sorgularında tarih filtresi yok; atama zamanı hiçbir yerde saklanmıyor (`abCohort` yalnızca string). Kohort bayiye atanıyor (`bootstrap/route.ts:186`), XP ise müşteriye kazandırılan bir şey; ölçülen "yanıt oranı" (`dealerRepliedAt`) bayinin davranışı.
- **Sorun:** Bir bayinin 2 yıllık geçmişi ile dün atandığı kohortun etkisi aynı ortalamaya karışıyor; etki seyreltilip yok ediliyor. Ayrıca müşteri XP çarpanı bayinin yanıt verme hızını doğrudan etkilemez; birincil metrik hipotezle uyumsuz. Demo kafeler (`seed_demo_cafes`) de DEALER olduğu için kohortlara girip veriyi bozuyor (`bootstrap/route.ts:186` filtre yok).
- **Profesyonel öneri:** Her deneyin tek bir birincil metriği (ör. "kohort bayilerinde müşteri başına 30 günlük feedback sayısı" veya "tekrar ziyaret oranı") ve guardrail metrikleri (ortalama puan, fraud işaretli feedback oranı, basılan puan miktarı) olsun. Tüm sorgular `createdAt >= assignedAt` ile sınırlansın; demo/test bayileri (`isDemo` bayrağı veya e-posta/ID deseni) dışlansın. Hesaplama tek bir SQL `GROUP BY variant` sorgusuyla yapılsın.
- **Efor:** M

### 4. Sonuç ekranı karar verdirmiyor: lift, anlamlılık, güven aralığı yok; özet kartı tekrar
- **Önem:** yüksek · **Kategori:** UX / ürün
- **Kanıt:** `page.tsx:149-172` "Cohort Etki Özeti" aynı `avgRating` ve `avgReplyRate` değerlerini (`page.tsx:137,141` ile birebir) yeniden yazıyor; kontrol grubuna göre fark hesaplanmıyor.
- **Sorun:** Operatörün sorusu "B/C, A'dan anlamlı şekilde iyi mi, ne kadar, ne zaman emin olacağız?" — ekran buna cevap vermiyor. 3 bayilik kohortta `%33.3` ile `%50.0` farkı büyük görünür ama istatistiksel olarak anlamsızdır; ekran bu tuzağa düşürüyor.
- **Profesyonel öneri:** Özet kartını "Sonuç tablosu"na dönüştürün: varyant × metrik; her hücrede değer, kontrola göre göreli fark (±%), %95 güven aralığı (oranlar için Wilson/iki-oran z-testi, ortalamalar için Welch t-testi), anlamlılık rozeti (Anlamlı / Henüz değil / Yetersiz örneklem) ve "anlamlılık için tahmini kalan süre". Hesap sunucuda yapılsın (`lib/experiments/stats.ts`), UI yalnızca gösterir. Veri yoksa `0.00` yerine "—" ve "n < 30, yorum yapmayın" uyarısı.
- **Efor:** M

### 5. Atama işlemi onaysız, geri alınamaz ve denetim izi bırakmıyor; genel `bootstrap` ucuna gömülü
- **Önem:** orta · **Kategori:** mimari / operasyon güvenliği
- **Kanıt:** `page.tsx:49-66` (onay diyaloğu yok), `bootstrap/route.ts:184-206` (audit log yok, `assigned` dışında kim/ne zaman bilgisi yok), aynı mutasyon `settings-client.tsx:841`'de demo seed butonlarının arasında da var.
- **Sorun:** Canlı bayileri kalıcı olarak deney gruplarına yazan bir işlem, "demo veri üret" butonlarıyla aynı uçta ve aynı ağırlıkta duruyor. Sıfırlama, yeniden dengeleme, bayiyi deneyden çıkarma yok. Bayi başına ayrı `UPDATE` (N sorgu, `bootstrap/route.ts:193-201`) ve iki admin aynı anda tıklarsa okunan "atanmamış" listesi bayatlayıp üzerine yazılabilir.
- **Profesyonel öneri:** Ayrı bir `POST /api/admin/experiments/[id]/assign` ucu; önizleme ("12 bayi atanacak: A 4, B 4, C 4") + onay diyaloğu; `auditLog` kaydı (aktör, deney, sayılar, IP); `createMany({ skipDuplicates: true })` ile idempotent toplu yazım (yarış koşulunu da kapatır). Ayarlar sayfasındaki kopya buton kaldırılsın.
- **Efor:** S–M

### 6. Admin gizli kapısı `/api/admin/*` uçlarını kapsamıyor (sistem geneli)
- **Önem:** orta (sistem geneli; bu sayfaya özel değil) · **Kategori:** güvenlik
- **Kanıt:** `proxy.ts:79` gate kontrolü yalnızca `pathname.startsWith('/admin')` için; `/api/` istekleri `proxy.ts:103-116` içinde doğrudan geçiyor; `overview/route.ts:24` ve `bootstrap/route.ts:105` yalnızca rol kontrolü yapıyor.
- **Sorun:** Gizli kapının tehdit modeli "rolü kazara ADMIN yapılan kişi panele giremesin" ise, aynı kişi tarayıcı konsolundan `POST /api/admin/bootstrap {action:'assign_ab_cohorts'}` (ve bootstrap'taki diğer seed/clear aksiyonlarını) çağırabilir. Doğrulandı: kod yolu bunu engellemiyor. (Bu bilinçli bir tasarım tercihi olabilir; yine de belgelenmeli.)
- **Profesyonel öneri:** `requireAuth(['ADMIN'])` içine (veya `requireAdmin()` yardımcısına) gate cookie doğrulamasını (`gateCookieBelongsTo`) ekleyin; Node runtime'da HMAC doğrulaması ucuz. Böylece tüm admin API'leri tek noktadan korunur.
- **Efor:** S

### 7. Hata durumu "veri yok" gibi görünüyor; yenileme sırasında veri kayboluyor
- **Önem:** orta · **Kategori:** UX / hata yönetimi
- **Kanıt:** `page.tsx:36-39` hata halinde `cohorts=[]` ve toast; `page.tsx:116` boş dizide hiç kart çizilmiyor; `page.tsx:154-157` "Önce bayileri cohortlara atayın" diyor. `page.tsx:68-72` yenile → `load()` → `setLoading(true)` → kartlar iskelete dönüyor.
- **Sorun:** 500/403 sonrası operatör yanlış aksiyona (atama) yönlendiriliyor; yenile her seferinde içerik zıplatıyor.
- **Profesyonel öneri:** Durumları ayırın: `idle | loading | error | empty | ready`; hata için satır içi uyarı + "Tekrar dene"; yenilemede eski veriyi koruyup yalnızca üstte ince ilerleme göstergesi (SWR/React Query `isValidating` deseni) ve "Son güncelleme: hh:mm".
- **Efor:** S

### 8. Modül kontrolü `ab_testing` dekoratif
- **Önem:** orta · **Kategori:** mimari / tutarlılık
- **Kanıt:** `lib/module-controls.ts:65` "important" olarak katalogda; Ayarlar'da anahtarı gösteriliyor (`settings-client.tsx:1876-1877`); ADMIN menüsü filtreyi atlıyor (`components/dashboard/sidebar.tsx:438-439`); route'ta `assertModuleEnabled` yok.
- **Sorun:** Operatör modülü kapattığını sanıyor, hiçbir şey değişmiyor — güveni zedeleyen "sahte anahtar".
- **Profesyonel öneri:** Ya admin-scope modüller için de gerçek kapı uygulayın (menü gizleme + sayfa/API `assertModuleEnabled('ab_testing')`), ya da admin-scope girdileri katalogdan çıkarıp yalnızca gerçekten kapatılabilen modülleri listeleyin.
- **Efor:** S

### 9. Görsel kusurlar: görünmeyen dekor, kontrastsız birincil buton, tekrar eden "Deneysel"
- **Önem:** düşük · **Kategori:** görsel
- **Kanıt:** `page.tsx:117-118` (`-z-10` dekor, kart stacking context değil + `bg-card` opak, `components/ui/card.tsx:15`) — tarayıcıda görsel olarak doğrulanmadı, CSS boyama sırası gereği görünmez olmalı; `page.tsx:101` `bg-white text-emerald-900` hero `tone='auto'` açık temada neredeyse beyaz zemin üzerinde (`admin-premium-hero.tsx:92-94`) kenarlıksız; `page.tsx:79` eyebrow "Deneysel" + `page.tsx:85` chip "Deneysel mod".
- **Profesyonel öneri:** Dekoru kaldırın veya karta `isolate` verin; birincil aksiyonu tema `primary` varyantına bağlayın (zümrüt sabit renk diğer admin sayfalarıyla tutarsız); chip'i gerçek deney durumuna ("Çalışıyor · 14. gün") çevirin.
- **Efor:** S

### 10. Dil ve i18n tutarsızlığı
- **Önem:** düşük · **Kategori:** içerik / i18n
- **Kanıt:** `page.tsx:81` "Dealer kohortlarına", `page.tsx:103` "cohortları", `page.tsx:151` "Cohort Etki Özeti", `page.tsx:128` "Bayi"; sayfa next-intl kullanmıyor (menü etiketi `messages/tr.json:2487` i18n'li); `lib/admin-toast.ts:17` "Basarili: ".
- **Profesyonel öneri:** Terminolojiyi sabitleyin ("Deney", "Varyant", "Bayi"), metinleri `adminExperiments.*` anahtarlarına taşıyın, toast öneklerini Türkçe karakterlerle düzeltin (sistem geneli). Sayılar `Intl.NumberFormat('tr-TR')` ile.
- **Efor:** S

### 11. Performans ve kod kalitesi
- **Önem:** düşük · **Kategori:** performans / kalite
- **Kanıt:** `overview/route.ts:27-30` tüm bayiler + kullanılmayan `businessName/name` belleğe; `overview/route.ts:42-84` kohort başına sıralı döngü (3×2 sorgu, `dealerId IN (...)` ilişki join'i); cache yok; `page.tsx:4` kullanılmayan `Zap`; `page.tsx:45-47` `load` her render'da yeniden oluşturuluyor (kural dışı ama zararsız).
- **Profesyonel öneri:** Tek bir ham SQL/`groupBy` ile `variant → count, avg(rating), count(replied)`; 60 sn Upstash cache (`experiment:{id}:results`), atama sonrası invalidasyon; kullanılmayan alan ve importları temizleyin.
- **Efor:** S

---

## Eksik özellikler (kıyas: PostHog Experiments, Statsig, Optimizely, LaunchDarkly, Linear/Stripe iç araç kalitesi)

1. **Deney nesnesi ve yaşam döngüsü:** taslak → çalışıyor → duraklatıldı → tamamlandı; hipotez, sahip, başlangıç/bitiş, hedef örneklem, "kazananı yayınla" (varyantı global ayara terfi ettir).
2. **İstatistik motoru:** göreli lift, %95 güven aralığı, p-değeri veya Bayesçi "kazanma olasılığı", örneklem gücü hesabı, SRM (sample ratio mismatch) uyarısı — Bulgu 2'deki dengesizliği otomatik yakalar.
3. **Zaman serisi ve kümülatif grafik:** varyant başına günlük birincil metrik + kümülatif lift çizgisi (güven bandıyla).
4. **Guardrail metrikleri ve otomatik durdurma:** basılan puan miktarı, fraud işaretli feedback oranı, ortalama puan düşüşü eşiği aşarsa uyarı/otomatik duraklatma (ekonomi değişmezleriyle uyumlu).
5. **Hedefleme ve atama yönetimi:** segment/kategori/şehir filtresi, trafik yüzdesi, bayi bazlı override, deneyden çıkarma, atama geçmişi; hash tabanlı deterministik atama.
6. **Denetim ve dışa aktarma:** audit log, sonuç anlık görüntüsü (rapor PDF/CSV), deney notları/karar kaydı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör "Deneyler" sayfasını açtığında 5 saniyede şunu görür: hangi deneyler çalışıyor, hangisi anlamlı bir sonuca ulaştı, hangisi bir guardrail'i ihlal ediyor. Bir deneye tıklayınca tek ekranda hipotez → varyantlar → birincil metrik sonucu (lift + güven aralığı) → guardrail'ler → zaman serisi → atama sağlığı (SRM) → karar butonları.

**Yerleşim:**
- **Liste görünümü** (`/admin/experiments`): tablo — Ad, Tür (Gamification çarpanı / Kampanya metni / Push saati / Feature flag), Durum rozeti, Gün, Örneklem, Birincil metrik lift'i (renkli ±%, anlamlılık ikonu), Sahip. Üstte durum sekmeleri ve arama. Sağ üstte "Yeni deney".
- **Deney detayı** (`/admin/experiments/[id]`): üst şerit (durum, gün, örneklem/hedef ilerleme çubuğu, Duraklat/Bitir/Kazananı yayınla); "Sonuç" kartı (varyant × metrik tablosu, güven aralığı yatay çubukları — sıfır çizgisine göre); "Zaman içinde" grafiği; "Guardrail'ler" listesi (yeşil/sarı/kırmızı); "Atama" kartı (beklenen vs gerçek oran, SRM uyarısı, bayi listesi drill-down); "Geçmiş" (audit).
- **Oluşturma sihirbazı:** 1) Hipotez ve birincil metrik 2) Varyantlar ve parametreler (XP çarpanı, metin, push saati) 3) Hedefleme ve trafik 4) Guardrail'ler 5) Önizleme ve başlat (onay).

**Motion / 3D:** Bu bir analitik iş aracı; 3D yersiz. Ölçülü motion yeterli: güven aralığı çubuklarının ilk yüklemede 200 ms soldan büyümesi, lift sayısının değişince kısa sayaç geçişi (`m as Motion` + `useReducedMotion` ile kapatılır), durum rozetinde "çalışıyor" için yavaş nabız (yalnızca `prefers-reduced-motion: no-preference`). Yenilemede iskelet yerine yerinde güncelleme.

**Veri / API değişiklikleri:**
- Prisma: `Experiment` (key unique, type, status, hypothesis, primaryMetric, guardrails Json, variants Json [{key, weight, params}], subjectType 'DEALER'|'CUSTOMER', startedAt, endedAt, ownerId) ve `ExperimentAssignment` (experimentId, subjectId, variant, assignedAt; `@@unique([experimentId, subjectId])`, `@@index([experimentId, variant])`). `User.abCohort` kaldırılır (veri göçüyle).
- `/admin/innovation` içindeki `campaignAb.experiments` (Settings JSON) ve `AnalyticsEvent` tabanlı impression/conversion akışı (`app/api/customer/innovation/ab/variant/route.ts`, `app/api/admin/innovation/ab-report/route.ts`) aynı modele taşınır; `FeatureFlag` modeli deneyin "kazananı yayınla" hedefi olur.
- API: `GET/POST /api/admin/experiments`, `GET/PATCH /api/admin/experiments/[id]`, `POST .../[id]/assign` (önizleme + onay, idempotent), `GET .../[id]/results` (sunucu tarafı istatistik, Upstash 60 sn cache, `createdAt >= assignedAt` filtresi, demo bayi dışlama).
- Çalışma zamanı: `lib/experiments/runtime.ts` → `getVariant(experimentKey, subjectId)` (hash, Redis sıcak katman + DB doğruluk), ödül zincirine `applyExperimentMultiplier` (atomik, günlük üst sınır içinde, meta'ya varyant yazılır).
- Alternatif: PostHog zaten entegre (`components/analytics/posthog-provider.tsx`); istemci tarafı metin/görsel deneyleri için PostHog Experiments kullanılabilir. Ancak puan/XP çarpanı gibi **sunucuda para benzeri değer basan** deneyler mutlaka sunucu tarafında, DB'de denetlenebilir atamayla yürütülmeli.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/innovation` → "A/B kampanya deneyleri" kartı** (`app/admin/innovation/page.tsx:378-430`): Sistemdeki *gerçekten çalışan* A/B altyapısı burada (hash tabanlı varyant, impression/conversion olayları, 30 günlük rapor). `/admin/ab-testing` ile aynı amaca hizmet ediyor ama ayrı veri modeli ve ayrı ekran kullanıyor. **İkisi tek "Deneyler" modülünde birleştirilmeli.**
- **`/admin/features` (FeatureFlag modeli, `prisma/schema.prisma:974-987`)**: Deneylerin kazanan varyantının yayınlandığı yer olarak aynı modüle bağlanmalı (LaunchDarkly/Statsig deseni: flag + experiment aynı yüzeyde).
- **`/admin/gamification-settings` global XP/puan çarpanları** (`lib/gamification-settings.ts`, `app/api/feedbacks/route.ts:303-318`): Kohort çarpanı uygulanacaksa bu zincirin bir halkası olmalı; ayarlar sayfasından deney detayına bağlantı verilmeli.
- **`/admin/settings` "A/B cohort ata" butonu** (`settings-client.tsx:841`): Kopya mutasyon; kaldırılmalı.
- **`/admin/economy-sim`**: Puan çarpanı deneyi başlatmadan önce ekonomi etkisini simüle etmek için oluşturma sihirbazından bağlantı verilebilir.
- **Karar:** `/admin/ab-testing` rotası, yeni `/admin/experiments` modülüne yönlendirilsin (redirect); yeni modül hazır olana kadar mevcut sayfa "Tedavi uygulanmıyor — yalnızca gözlem" uyarısıyla işaretlensin veya menüden gizlensin.

---

## Doğrulama (şüpheci inceleme)

Yöntem: İddialar çürütülmeye çalışılarak kod baştan okundu (`proxy.ts`, `lib/api-auth.ts`, `lib/admin-gate-edge.ts`, `app/api/admin/bootstrap/route.ts`, `app/api/admin/ab-testing/overview/route.ts`, `app/api/feedbacks/route.ts`, `app/api/admin/settings/admin-gate/route.ts`, `lib/demo-cafes-seed.ts`, `prisma/schema.prisma`). Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. A/B kohort çarpanı hiçbir puan/XP yolunda uygulanmıyor — **DOĞRULANDI**

- Depo genelinde `abCohort` araması (node_modules/.next/docs hariç) yalnızca şu konumları döndürüyor: `prisma/schema.prisma:102`, `app/api/admin/bootstrap/route.ts:187,194,197`, `app/api/admin/ab-testing/overview/route.ts:29,43,86`. Hiçbir `lib/*` ödül yardımcısı, cron ya da kredi yolu alanı okumuyor.
- Tek müşteri ödül zinciri `app/api/feedbacks/route.ts:314-318`: `applyVipMultiplier` → `applySeasonalCampaignMultiplier` → `gamiSettings.pointMultiplier` / `xpMultiplier`. Kohort halkası yok.
- `MULT` (`overview/route.ts:17-21`) ve `LABELS` (`:11-15`) sabit; sayfa `page.tsx:122` "XP çarpanı x{multiplier}" ve `page.tsx:164` "x{multiplier} kuralı ile çalışan grup" diyerek var olmayan bir tedaviyi gerçekmiş gibi sunuyor.
- Ek not: `abCohort` bayi (`role: 'DEALER'`) üzerinde, XP/puan ise müşteriye veriliyor; çarpanın uygulanabilmesi için ödül anında QR → `dealerId` → kohort çözümlemesi gerekirdi, bu da yazılmamış.
- Yeniden üretim: Bir bayi C kohortuna atanmışken o bayinin QR'ı üzerinden geri bildirim gönderen müşteri, A kohortundaki bir bayide aldığı puan/XP'nin aynısını alır (yalnız VIP/sezonsal/global çarpan fark yaratır). Ekrandaki A/B/C farkları tamamen tedavisiz gözlemdir.
- Etki: Kullanıcı verisi bozulmuyor; risk karar düzeyinde (yanıltıcı analitik). "Kritik" yerine **Yüksek (ürün doğruluğu)** seviyesi daha isabetli.

### 2. Kohort ataması deterministik round-robin ve her çağrıda A'dan başlıyor — **DOĞRULANDI** (önem: Orta)

- `bootstrap/route.ts:185-201`: `orderBy: { createdAt: 'asc' }`, `let idx = 0` istek başına sıfırlanıyor, yalnızca atanmamışlarda artıyor. Her çağrıda yeni atanmamış bayi sayısı 3'ün katı değilse fazlalık sistematik olarak A'ya (sonra B'ye) gidiyor; tek tek kayıt olan bayiler için her çağrı → A.
- Atama zamanı tutulmuyor (şemada `abCohortAssignedAt` vb. yok); `overview/route.ts:58-71` metrikleri tüm zamanlar için `deletedAt: null` filtresiyle topluyor → atama öncesi veri sonuçlara karışıyor.
- Demo kafeler `lib/demo-cafes-seed.ts:145` ile `role: 'DEALER'` olarak yaratılıyor; ne atama (`bootstrap/route.ts:186`) ne overview (`overview/route.ts:28`) demo bayileri dışlıyor.
- Yeniden üretim: 3 kohort dengeliyken 1 yeni bayi kayıt olur, admin "Boş cohortları ata" der → A; ertesi gün 1 yeni bayi daha → yine A. N tur sonra A'da N fazla, en yeni (henüz olgunlaşmamış) bayiler yoğun şekilde A'da.
- Çürütme denemesi: Mekanizma gerçek, ancak 1. bulgu nedeniyle zaten hiçbir tedavi uygulanmadığından bu dengesizlik bugün yalnızca gözlemsel bir sapma; doğrudan kullanıcı/veri zararı yok. 1. bulgu düzeltilip deney gerçekten yürütülmeye başlanırsa geçerlilik sorunu olarak kritikleşir. Doğru çözüm, raporda önerilen hash tabanlı (`hash(experimentKey:subjectId) mod 100` → ağırlık) atama + `ExperimentAssignment.assignedAt` ve sonuçlarda `createdAt >= assignedAt` filtresidir.

### 3. Admin gizli kapısı API katmanını korumuyor — **DOĞRULANDI** (önem: Yüksek, sistem geneli; düşünülenden daha ağır)

- `proxy.ts:105-119`: `/api/*` istekleri `authMiddleware`'e hiç girmeden `NextResponse.next()` ile geçiyor. Gate kontrolü yalnızca `proxy.ts:79` (`pathname.startsWith('/admin')`) içinde.
- `lib/api-auth.ts` `requireAuth` yalnızca oturum + rol kontrol ediyor; gate cookie'sine bakmıyor. `verifyGateCookie` (`lib/admin-gate.ts:55`) üretim kodunda hiçbir API rotasında çağrılmıyor (yalnız `__tests__/lib/admin-gate.test.ts`).
- **Ağırlaştırıcı:** `app/api/admin/settings/admin-gate/route.ts:19-27` GET ucu yalnız `requireAuth(['ADMIN'])` ile korunuyor ve gizli cevabı (`answer: gate.answer`) JSON'da döndürüyor. Yorumdaki varsayım ("admin zaten paneldeyse gate'i geçmiştir", `:16-17`) proxy'nin `/api` yollarını muaf tutması nedeniyle yanlış.
- Yeniden üretim: Rolü (kazara/kötü niyetle) ADMIN yapılmış ama cevabı bilmeyen hesap, oturum çerezleriyle `GET /api/admin/settings/admin-gate` çağırır → yanıtta `answer` gelir → `/admin-gate`'e bu rakamı girer → panele tam erişim. Alternatif olarak hiç panele girmeden `POST /api/admin/bootstrap {"action":"clear_suspicious_activities"}` veya `assign_ab_cohorts` gibi mutasyonları doğrudan çalıştırır; ayrıca `PUT /api/admin/settings/admin-gate` ile cevabı değiştirip gerçek kurucuları kilitleyebilir.
- Sonuç: Kapının "rol yetmez" tehdit modeli (proje belleği: admin-gate-security) API düzeyinde fiilen geçersiz. Bilinçli bir tercih olduğuna dair kodda işaret yok; tersine `settings/admin-gate` GET yorumu gate'in API'yi de koruduğunu varsayıyor.
- Öneri: `requireAuth`'a (veya ayrı `requireAdmin()` yardımcısına) ADMIN rolü için `verifyGateCookie(cookies().get('admin_gate'), userId, gate.answer)` kontrolü eklenmeli (`/api/admin/gate` GET/POST hariç); gate cevabı Redis'te kısa TTL ile önbelleklenip DB yükü sınırlanmalı. En azından `settings/admin-gate` GET cevabı döndürmemeli (yalnız soru + "cevap ayarlı" bayrağı), PUT ise mevcut cevabın yeniden girilmesini istemeli.

---

## Uygulama (Dalga 2)

**Sonuç:** `/admin/ab-testing` emekli; `permanentRedirect` ile **`/admin/features?tab=deneyler`** adresine yönlenir. **Bulgu 1 kararı:** tedavisi hiçbir yerde uygulanmayan bayi kohort "deneyi" (A/B/C XP çarpanı) **kaldırıldı**. Farkları tamamen gürültüydü ve puan basan bir çarpanı ekonomi değişmezleri dışında eklemek doğru olmazdı. Yerine sistemde **gerçekten çalışan** A/B altyapısı (eski `/admin/innovation` "kampanya deneyleri": `Settings.innovationPlatform.campaignAb`, hash tabanlı yapışkan atama, `innovation_ab_impression/conversion` olayları) tam bir deney ürününe dönüştü.

- **Yaşam döngüsü:** taslak → çalışıyor → duraklatıldı → tamamlandı (kazanan + karar notu). Her geçiş gerekçeli, `Settings.updatedAt` iyimser kilitli (409) ve `entity: Experiment` olarak denetlenir. Başlamış deneyde varyant, boyut ve pay kilitli (atama bozulmasın, SRM). Yalnız taslak silinebilir.
- **Atama:** `sha256("<kullanıcı>:<deney>") % 100 < B payı` (varyant ucuyla birebir; testte `pickAbVariant` ile eşitlik doğrulanır). "Atama denetleyicisi" kimlik ya da e-postayla kullanıcının kovasını ve varyantını gösterir.
- **Sonuç (sunucuda, `lib/admin-flags/stats.ts`):** deney penceresiyle sınırlı (`startedAt…endedAt`), **tekil kullanıcı** bazlı dönüşüm oranı; varyant başına %95 Wilson aralığı, B − A farkı için Newcombe aralığı, göreli lift, iki oran z-testi p, **SRM** (ki-kare, p < 0,001) ve yetersiz örneklemde "yorum yapmayın" (varyant başına en az 100 kullanıcı, toplam 10 dönüşüm). Günlük gösterim serisi (İstanbul günleri) + erişilebilir tablo. Redis önbelleği 60 sn (tamamlanan deney 10 dk).
- **Kill-switch:** `ab_testing` modül anahtarı artık gerçek: kapalıyken varyant ucu herkese A verir ve gösterim yazmaz. Dönüşüm ucu yalnız çalışan deney için yazar (rastgele kimlikle istatistik kirletilemez) ve IP başına hız sınırı uygular.

Sunucu: `lib/admin-flags/experiments.server.ts`. BFF: `GET/POST /api/admin/feature-control/experiments`, `PATCH …/experiments/:id`, `GET …/experiments/:id/results`, `GET …/experiments/:id/assignment`. Müşteri uçları `app/api/customer/innovation/ab/{variant,event}` `defineRoute`'a taşındı (geriye uyumlu `legacySpread`). Eski `GET /api/admin/ab-testing/overview` silindi.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Sayfa erişimi | ÇALIŞIYOR | |
| 2 | API yetkisi | ÇALIŞIYOR | `defineRoute` ADMIN + rate limit. |
| 3 | Hero başlık/açıklama | ÇALIŞIYOR | Doğru içerik: hash atama, pencere sınırlı tekil kullanıcı sonuçları. |
| 4 | "Deneysel mod" rozeti | KALDIRILDI | Dekordu; yerine gerçek durum rozeti ("Çalışıyor · 14. gün"). |
| 5 | Yenile | ÇALIŞIYOR | Yenilemede veri korunur (yerinde güncelleme). |
| 6 | "Boş cohortları ata" | KALDIRILDI | Sıralı round-robin yerine hash ataması; elle atama gerekmez. |
| 7 | Atama butonu koşulu | KALDIRILDI | Bkz. 6. |
| 8 | Yükleniyor iskeleti | ÇALIŞIYOR | `QueryState` (aria-busy, statik). |
| 9 | Kohort etiketi | KALDIRILDI | Deney nesnesi var (ad, anahtar, hipotez, metrik). |
| 10 | "XP çarpanı x{n}" | KALDIRILDI | Sahteydi (Bulgu 1). |
| 11 | Kohort bayi sayısı | KALDIRILDI | Yerine varyant başına gören tekil kullanıcı. |
| 12 | Geri bildirim sayısı | KALDIRILDI | Tedavi öncesi veriyle kirliydi; yerine pencere sınırlı gösterim/dönüşüm. |
| 13 | Ortalama puan | KALDIRILDI | Tedaviyle ilişkisiz. |
| 14 | Yanıt oranı | KALDIRILDI | Nedensel bağı yoktu. |
| 15 | Kart köşe dekoru | KALDIRILDI | Ops kaydı. |
| 16 | "Etki özeti" kartı | ÇALIŞIYOR | Sonuç: karar bandı + fark/GA/lift/p + varyant tablosu + GA çubukları + SRM uyarısı. |
| 17 | Boş durum | ÇALIŞIYOR | "Henüz deney yok" ile "bu pencerede gösterim yok, entegrasyonu kontrol edin" ayrı. |
| 18 | Hata durumu | ÇALIŞIYOR | `QueryState` + "Tekrar dene"; hata "veri yok" ile karışmaz. |
| 19 | Toplam bayi sayısı | KALDIRILDI | Kohort modeliyle birlikte. |
| 20 | Atanmamış bayi sayısı | KALDIRILDI | Bkz. 6. |
| 21 | Bayi adları (çekilip atılan) | KALDIRILDI | |
| 22 | `ab_testing` modül kontrolü | ÇALIŞIYOR | Varyant ve dönüşüm uçları okur (taranan bağlarda "API kapısı · 2 uç"). |
| 23 | Ayarlar'daki ikinci "A/B cohort ata" butonu | KALAN (sahiplik dışı) | `settings-client.tsx` + `bootstrap` `assign_ab_cohorts` aksiyonu Ayarlar/Demo yüzeyinin; tedavisiz olduğu için kaldırılmalı. |
| 24 | Playbook bağlantısı | ÇALIŞIYOR | `/admin/ab-testing` yeni sekmeye yönlenir. |
| 25 | i18n | KALAN | Terimler sabitlendi ("Deney", "Varyant", "Kontrol"), metinler tam Türkçe; `messages/*` anahtarlarına taşınmadı. |
| 26 | Toast metinleri | ÇALIŞIYOR | `sonner`, Türkçe karakterli. |
| 27 | Mobil yerleşim | ÇALIŞIYOR | DataTable kart görünümü, sonuç tablosu yatay kaydırmalı. |
| 28 | Azaltılmış hareket | ÇALIŞIYOR | Yalnız `motion-safe:` spinner; sonsuz animasyon yok. |
| 29 | Ölü import | KALDIRILDI | Sayfa yeniden yazıldı. |
| 30 | Deney yaşam döngüsü | ÇALIŞIYOR | Yukarıda. Kazanan otomatik yayılmaz (bilinçli; ekranın varsayılanı ayrıca güncellenir). |
| 31 | İstatistiksel anlamlılık | ÇALIŞIYOR | Wilson/Newcombe/z-testi/SRM + minimum örneklem. Güç hesabı ("kalan süre") yok. |
| 32 | Zaman serisi | ÇALIŞIYOR | Günlük gösterim sparkline'ları + tablo (son 30 gün). |
| 33 | Atama yönetimi | ÇALIŞIYOR | Hash ataması + atama denetleyicisi; tekil kullanıcı override'ı yok. |
| 34 | Denetim kaydı | ÇALIŞIYOR | Her oluşturma/düzenleme/geçiş; "Değişiklik geçmişi" sekmesi. |
| 35 | CSV dışa aktarma | KALAN | Sonuçlar ekranda ve tablo olarak; dosya dışa aktarma eklenmedi. |

### Kapanan bulgular (9 tam, 1 kısmi, 1 başka dalgada)
1 (sahte deney kaldırıldı, gerçek deney ürünü), 2 (hash ataması), 3 (pencere sınırlı tekil kullanıcı metrikleri), 4 (lift/GA/anlamlılık/SRM sunucuda), 5 (onaylı, gerekçeli, denetimli yaşam döngüsü; Ayarlar'daki kopya buton hariç), 7 (hata ve yenileme), 8 (`ab_testing` gerçek), 9 (görsel kusurlar), 11 (SQL `GROUP BY`, Redis önbelleği, ölü import). 10 kısmi: terminoloji ve Türkçe tamam, i18n kaldı. 6 sistem geneli: gizli kapı denetimi `requireAuth` içinde (başka dalga).

### Kalanlar
- Guardrail metrikleri ve otomatik durdurma; güç hesabı ve tahmini kalan süre.
- `User.abCohort` alanı artık hiçbir yerde anlamlı değil. Ayarlar/bootstrap'taki atama butonu kaldırılmalı, alan bir şema dalgasında düşürülmeli (**ŞEMA İSTEĞİ**, acil değil).
- Bugün `/api/customer/innovation/ab/variant` ucunu çağıran müşteri ekranı yok; deney oluşturmak tek başına kimseyi etkilemez. Sonuç ekranı bunu "bu pencerede gösterim yok" diye dürüstçe söyler. Bir ekranın bu uca bağlanması ilgili müşteri yüzeyinin işi.
