# /admin/ecosystem

**Amaç:** Platform operatörüne tek bakışta "ekosistemin" durumunu göstermek: toplam kullanıcı, rol dağılımı (ADMIN/DEALER/CUSTOMER/STAFF), son 7 gündeki geri bildirim ve tüketim sayısı, ardından yönetim araçlarına hızlı bağlantılar.

**Genel puan:** 4.5 / 10
**Karar:** **birleştir** — sayfa doğru çalışıyor ama içeriğinin 2/3'ü `/admin/platform-pulse` ile birebir aynı metrik; tek özgün içerik 4 sayılık rol dağılımı. Bu içerik platform nabzına (veya `/admin` ana panosuna) "Ekosistem" bölümü olarak taşınmalı, rota oraya yönlendirilmeli.

Dosyalar: `app/admin/ecosystem/page.tsx` (154 satır, client), `app/admin/ecosystem/layout.tsx` (yalnız metadata), `app/api/admin/ecosystem-summary/route.ts` (61 satır), `lib/admin-ecosystem-types.ts`, `messages/{tr,en}.json → adminEcosystem`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Gösterdiği 4 KPI + rol dağılımı doğru ve yetkili şekilde hesaplanıyor, fakat yenileme/tekrar dene/trend/karşılaştırma/derinlemesine inme yok; "ekosistem" iddiasını karşılamıyor. |
| UX | 4/10 | Bağlamsız ham sayılar (önceki dönem yok), KPI kartlarından biri "oluşturulma zamanı"na harcanmış, hata durumunda hızlı bağlantılar da kayboluyor. |
| Görsel | 5/10 | Ortak `AdminPremiumHero` + shadcn kartlarla tutarlı ve temiz; ama hiyerarşi düz, hiçbir görselleştirme (oran çubuğu, sparkline) yok. |
| Mimari | 5/10 | Basit ve okunaklı; ancak sunucuda tek sorgu ile render edilebilecek veri client `useEffect` ile çekiliyor, Redis cache yok, platform-pulse ile aynı sorgular kopyalanmış. |
| Performans | 7/10 | 3 paralel ve indeksli sorgu (`@@index([role])`, `@@index([createdAt])`); maliyet düşük. Tek eksi: gereksiz client round-trip + spinner. |
| Erişilebilirlik + Mobil | 6/10 | Grid mobilde düzgün katlanıyor, ikonlar `aria-hidden`; fakat sayılar `<h3>` olarak işaretli, h2 atlanıyor, yükleme durumu `role="status"`/`aria-live` değil. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (başlık/açıklama) | ÇALIŞIYOR | `app/admin/ecosystem/layout.tsx:4-6`, `messages/tr.json:163-164` | "Ekosistem özeti" / "Rol dağılımı ve ekosistem anlık görüntüsü." |
| 2 | Sayfa erişim yetkisi (rol + gizli kapı) | ÇALIŞIYOR | `proxy.ts:51`, `proxy.ts:79-86` | `/admin/*` için ADMIN rolü + `admin_gate` HMAC cookie zorunlu. |
| 3 | API yetkisi | ÇALIŞIYOR (kapı hariç) | `app/api/admin/ecosystem-summary/route.ts:12-13`, `proxy.ts:104-118` | `requireAuth(['ADMIN'])` + token-replay kontrolü var; `/api/*` gizli kapı cookie'sini kontrol etmiyor (sistem geneli tasarım, bkz. Bulgu 8). |
| 4 | Hero (eyebrow / başlık / açıklama / ikon) | ÇALIŞIYOR | `page.tsx:71-77`, `components/admin/admin-premium-hero.tsx:108-118` | `h1` doğru; arka plan "breathe" animasyonu `useReducedMotion` ile kapanıyor (`admin-premium-hero.tsx:35`). |
| 5 | Veri çekme (`GET /api/admin/ecosystem-summary`) | ÇALIŞIYOR | `page.tsx:34-65` | `cache: 'no-store'`; unmount'ta `cancelled` bayrağı ile state yarışı engelleniyor (`page.tsx:35,40,62-64`). |
| 6 | Yükleniyor durumu | KISMİ | `page.tsx:79-83` | Ortada spinner + metin; iskelet yok (layout shift), `role="status"`/`aria-live` yok. |
| 7 | Hata bildirimi (toast) | KISMİ | `page.tsx:41-43,53-56`, `lib/admin-toast.ts:18-19` | Toast'a sabit "Dikkat: " öneki ekleniyor → EN dilde "Dikkat: Could not load snapshot" (dil karışıklığı). HTTP 503/401/403 ayrımı yok. |
| 8 | Hata/boş durumu metni | KISMİ | `page.tsx:149-151`, `messages/tr.json → adminEcosystem.empty` | Tüm hatalarda "Veritabanı bağlantısını kontrol edin" yazıyor (401/403'te yanıltıcı); **tekrar dene butonu yok**. |
| 9 | KPI: Toplam kullanıcı | ÇALIŞIYOR | `page.tsx:87-92`, `route.ts:18-21,41` | Rollerin toplamı; shadow-ban/flagged/test hesapları dahil (User'da `deletedAt` yok, `fraudStatus` filtrelenmiyor — `prisma/schema.prisma` User modeli). Tanım belirtilmemiş. |
| 10 | KPI: Geri bildirim (7 gün) | ÇALIŞIYOR | `page.tsx:93-98`, `route.ts:22-24` | `deletedAt: null` filtresi doğru; platform-pulse'taki `feedbacks7d` ile birebir aynı tanım (`app/api/admin/platform-pulse/route.ts:32-35,53`). |
| 11 | KPI: Tüketim kaydı (7 gün) | ÇALIŞIYOR | `page.tsx:99-104`, `route.ts:25-27` | platform-pulse `consumptions7d` ile aynı (`platform-pulse/route.ts:55`). |
| 12 | KPI: Anlık görüntü zamanı | ÇALIŞIYOR (değeri düşük) | `page.tsx:105-112` | 4 KPI slotundan biri metadata'ya harcanıyor; `generatedAt!` non-null assertion (`page.tsx:47`) — alan yoksa "Invalid Date". |
| 13 | Rol dağılımı rozetleri (4 rol) | ÇALIŞIYOR | `page.tsx:67,115-128`, `route.ts:30-39` | Sabit sıralama, eksik rol 0'a düşüyor. Tıklanamaz (users sayfasına filtreli geçiş yok); oran/yüzde yok. |
| 14 | Rol açıklama metni | KISMİ | `messages/tr.json → adminEcosystem.rolesHint` | "ADMIN, bayi, müşteri ve personel sayıları." — büyük harf/küçük harf ve EN/TR karışık. |
| 15 | Hızlı bağlantılar (7 adet) | ÇALIŞIYOR | `page.tsx:14-22,130-147` | Tüm hedefler mevcut (`app/admin/{platform-pulse,users,dealers-health,feedbacks,api-catalog,modules,analytics}/page.tsx`). Ancak yalnız veri başarıyla gelince render ediliyor (Bulgu 3). |
| 16 | Sayı/tarih yerelleştirme | ÇALIŞIYOR | `page.tsx:24-26,109` | `tr-TR`/`en-US` ikili; başka dil eklenirse sessizce TR'ye düşer. |
| 17 | Duyarlı yerleşim (mobil) | ÇALIŞIYOR | `page.tsx:86,120,132` | `sm:2 / lg:4` KPI, `flex-wrap` rozetler, `sm:2 / xl:3` link grid. |
| 18 | Azaltılmış hareket | KISMİ | `admin-premium-hero.tsx:35-37`, `page.tsx:143` | Hero uyuyor; link okundaki hover `translate` için `motion-reduce:` yok (önemsiz). |
| 19 | Navigasyon girişleri | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:160`, `app/admin/admin-utils.ts:92`, `app/admin/platform-pulse/page.tsx:295-300` | Kenar çubuğunda 2. sırada + hızlı erişim + platform-pulse'tan geri link. |
| 20 | Cache katmanı (Redis) | EKSİK | `route.ts` (cache yok) vs `platform-pulse/route.ts:19-22,120` | Kardeş uç 60 sn Redis'te; bu uç her istekte DB'ye gidiyor. Düşük maliyetli ama tutarsız. |
| 21 | Manuel yenile / otomatik yenile | EKSİK | `page.tsx:34-65` (tek seferlik efekt) | "Anlık görüntü" etiketine rağmen yenileme yolu yok. |
| 22 | Önceki dönem kıyası / trend | EKSİK | `route.ts:15-28` | Yalnız mutlak 7 günlük sayı; delta, sparkline yok. |
| 23 | Dönem seçici (24s/7g/30g) | EKSİK | `route.ts:15` sabit 7 gün | — |
| 24 | Dışa aktarma (CSV) | EKSİK | — | platform-pulse'ta CSV var (`lib/data/product-roadmap.json:15-19`), burada yok. |
| 25 | Otomatik test | EKSİK | `__tests__`/`tests`'te `ecosystem` eşleşmesi yok | Rota sözleşmesi test edilmiyor. |

Sayım: ÇALIŞIYOR 14 · KISMİ 5 · BOZUK 0 · SAHTE 0 · EKSİK 6 (toplam 25).

Not: Sayfada mock/rastgele/"yakında" verisi **yok**; gösterilen her sayı gerçek Prisma sorgusundan geliyor.

---

## Bulgular

### 1. Sayfa, platform-pulse'un alt kümesi — ayrı rota olarak varlık nedeni zayıf
- **Önem:** yüksek · **Kategori:** bilgi mimarisi / mimari · **Efor:** M
- **Kanıt:** `app/api/admin/ecosystem-summary/route.ts:22-27` ile `app/api/admin/platform-pulse/route.ts:32-35,53,55` aynı `feedback.count({deletedAt:null, createdAt>=7g})` ve `consumption.count({createdAt>=7g})` sorgularını yapıyor; platform-pulse ayrıca 24s değerleri, yeni kullanıcılar, günlük seriler ve audit akışı veriyor. `/admin` panosu da `user.count()` gösteriyor (`app/api/admin/dashboard/route.ts:42`). Kenar çubuğunda üç sayfa art arda: `sidebar.tsx:159-161`.
- **Sorun:** Operatör aynı "7 günlük geri bildirim" sayısını iki ayrı sayfada görüyor; üstelik pulse 60 sn cache'li, ecosystem canlı olduğundan iki sayı bir dakika boyunca farklı olabilir. Kenar çubuğunda "Pano / Ekosistem / Platform nabzı" üçlüsü neyin nerede olduğunu bulanıklaştırıyor. Bu sayfaya özgü tek bilgi 4 sayılık rol dağılımı.
- **Öneri:** Rol dağılımını `/api/admin/platform-pulse` yanıtına `usersByRole` alanı olarak ekle (aynı `Promise.all` içine tek `user.groupBy`), platform-pulse sayfasında "Ekosistem bileşimi" bölümü olarak göster. `/admin/ecosystem` rotasını `next.config` `redirects` ya da `app/admin/ecosystem/page.tsx` içinde `redirect('/admin/platform-pulse#ecosystem')` ile yönlendir; `sidebar.tsx:160`, `admin-utils.ts:92`, `platform-pulse/page.tsx:295-300`, `product-roadmap.json` ve `admin-api-catalog.json:315-319` girdilerini güncelle. `ecosystem-summary` ucunu bir sürüm boyunca deprecate edip sonra sil.

### 2. KPI'lar bağlamsız: kıyas, trend ve tanım yok
- **Önem:** orta · **Kategori:** UX / ürün · **Efor:** M
- **Kanıt:** `route.ts:15-28` yalnız tek pencere; `page.tsx:87-104` yalnız mutlak sayı basıyor. 4. kart sadece zaman damgası (`page.tsx:105-112`).
- **Sorun:** "Son 7 günde 1.284 tüketim" iyi mi kötü mü, operatör bilemez. Stripe/PostHog'da her KPI önceki dönemle delta (%) ve mini trend taşır. Zaman damgası KPI slotunu boşa harcıyor.
- **Öneri:** API'de önceki 7 günlük pencereyi de hesapla (`createdAt: {gte: since14, lt: since7}` — mevcut `createdAt` indeksleri yeter) ve `{current, previous, deltaPct}` döndür; günlük seri için platform-pulse'taki `buildUtcCalendarDayBuckets` yardımcısını yeniden kullan. Kartlarda: büyük sayı + renkli delta rozeti (artış/azalış, yön ikonla da belirtilmeli — yalnız renk değil) + 7 noktalı sparkline. Zaman damgasını başlığın sağına "Güncellendi: 14:32 · Yenile" satırı olarak taşı; boşalan 4. KPI slotuna "Yeni kullanıcı (7g)" veya "Aktif bayi (7g, en az 1 tüketim)" koy.

### 3. Hata durumunda hızlı bağlantılar da kayboluyor, tekrar dene yok
- **Önem:** orta · **Kategori:** UX / hata yönetimi · **Efor:** S
- **Kanıt:** Hızlı bağlantılar `data ?` dalının içinde (`page.tsx:84-148`); hata dalı yalnız bir paragraf (`page.tsx:149-151`). Yeniden çekme fonksiyonu yok (`page.tsx:34-65` efekt içine gömülü).
- **Sorun:** DB 503 verdiğinde (`lib/api-http.ts:18-27`, `retryable: true` döndürüyor) operatör hem veriyi hem de veriden bağımsız gezinme bağlantılarını kaybediyor; geri dönmek için sayfayı yenilemek zorunda. Ayrıca 401/403'te de "Veritabanı bağlantısını kontrol edin" yazıyor — yanlış teşhis.
- **Öneri:** Fetch'i `load()` fonksiyonuna (ya da projedeki SWR/React Query desenine) çıkar; hata durumunda `res.status`'a göre ayrı mesaj (503 → "Veritabanı geçici olarak erişilemiyor", 401/403 → "Oturum/yetki"), "Tekrar dene" butonu ve `retryable` ise kısa geri çekilmeli otomatik bir yeniden deneme. Hızlı bağlantılar bölümünü veri koşulunun dışına taşı.

### 4. Admin toast'ında sabit Türkçe önek → EN arayüzde dil karışıklığı
- **Önem:** orta (sistem geneli) · **Kategori:** i18n · **Efor:** S
- **Kanıt:** `lib/admin-toast.ts:13,17,19` — `'Bilgi: '`, `'Basarili: '` (Türkçe karakter de eksik), `'Dikkat: '` sabit; `page.tsx:42,55` bu toast'ı yerelleştirilmiş metinle çağırıyor.
- **Sorun:** EN dilinde "Dikkat: Could not load snapshot" görünüyor; TR'de "Basarili" yazım hatası. Tüm admin sayfalarını etkiler.
- **Öneri:** Öneki kaldırmak en temizi (sonner zaten ikon/renkle türü belirtiyor). Önek isteniyorsa `adminToast.prefix.{info,success,error}` i18n anahtarları ve locale'i parametre alan bir fabrika (`createAdminToast(t)`) kullan.

### 5. Client-side veri çekme gereksiz; sunucu bileşeni ile anında render edilebilir
- **Önem:** düşük · **Kategori:** mimari / performans · **Efor:** S-M
- **Kanıt:** `page.tsx:1` `'use client'`; veri `useEffect` + `fetch` ile (`page.tsx:34-65`); layout zaten sunucu bileşeni (`layout.tsx`).
- **Sorun:** Sayfa önce boş hero + spinner gösterip ikinci bir round-trip bekliyor (TTFB + API çağrısı + auth/token-replay iki kez). Veri tamamen sunucu tarafında hesaplanabilir ve kullanıcıya özel değil.
- **Öneri:** Birleştirme yapılmazsa: sorguları `lib/admin-ecosystem.ts` içinde `getEcosystemSummary()` olarak topla, sayfayı async RSC yap, `redisGetJson`/`redisSetJson` ile 60 sn cache'le (platform-pulse deseni, `platform-pulse/route.ts:19-22,120`). Etkileşimli kısımlar (yenile butonu) küçük bir client adası olsun; `Suspense` + iskelet kart ile akış.

### 6. Başlık hiyerarşisi ve canlı bölge erişilebilirliği
- **Önem:** düşük · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** KPI sayıları `CardTitle` ile render ediliyor ve `CardTitle` `<h3>` (`components/ui/card.tsx:44`, `page.tsx:90,96,102,108`); "Rol dağılımı" da `h3` (`page.tsx:117`) ama sonraki "Hızlı bağlantılar" `h2` (`page.tsx:131`) → h1 → h3 → h2 sıçraması. Yükleme alanı (`page.tsx:80-83`) `role="status"` taşımıyor.
- **Sorun:** Ekran okuyucu başlık listesinde "1.284", "37" gibi anlamsız başlıklar görüyor; yükleme/hata değişimi duyurulmuyor.
- **Öneri:** KPI'ları `<dl>`/`<dt>`/`<dd>` yapısıyla ya da etiket `h2/h3`, değer `p` olacak şekilde yeniden kur; bölümleri `section aria-labelledby` ile sar; yükleme kabına `role="status" aria-live="polite"`, hata kabına `role="alert"`.

### 7. "Toplam kullanıcı" tanımı belirsiz (shadow-ban/test hesapları dahil)
- **Önem:** düşük · **Kategori:** veri doğruluğu · **Efor:** S
- **Kanıt:** `route.ts:18-21` filtresiz `user.groupBy`; User modelinde `fraudStatus` ("clean"/"flagged"/"shadow_ban") alanı var ama kullanılmıyor (`prisma/schema.prisma`, User modeli `fraudStatus` satırı).
- **Sorun:** Fraud nedeniyle gölge-yasaklı hesaplar "ekosistem" büyüklüğünü şişiriyor; operatör bunu bilemiyor. Bu bir hata değil ama metrik tanımı belgelenmemiş.
- **Öneri:** KPI altına küçük bir tanım satırı/tooltip ("Tüm roller, fraud işaretliler dahil") ekle veya `fraudStatus` kırılımını ayrı göster (clean / flagged / shadow_ban) — fraud ekranına link ile.

### 8. API uçları gizli admin kapısının dışında (sistem geneli)
- **Önem:** düşük (bu uç için) · **Kategori:** güvenlik / derinlemesine savunma · **Efor:** M (sistem geneli)
- **Kanıt:** `proxy.ts:79-86` kapı cookie'sini yalnız sayfa yollarında kontrol ediyor; `proxy.ts:104-118` `/api/*` için yalnız güvenlik/CORS başlığı ekleyip geçiriyor; `requireAuth` (`lib/api-auth.ts:52-80`) kapı cookie'sini bilmiyor.
- **Sorun:** Kapı sorusunu geçmemiş ama ADMIN oturumu ele geçirilmiş biri `/api/admin/ecosystem-summary`'yi doğrudan çağırabilir. Bu uçta yalnız toplu sayılar döndüğü için etki küçük; ama aynı açık yazma yapan admin uçları için de geçerli. Kapının tasarım amacı (bkz. proje notu "Admin gate security") UI kamuflajıysa bilinçli kabul edilebilir — doğrulanmadı.
- **Öneri:** Kapı bir güvenlik katmanı olarak kastediliyorsa `requireAuth(['ADMIN'])` içine (veya proxy'deki `/api/admin/*` dalına) `gateCookieBelongsTo` kontrolünü ekle; sadece kamuflajsa bu kararı `docs`'ta açıkça yaz.

### 9. Küçük kod kalitesi notları
- **Önem:** düşük · **Kategori:** kod kalitesi · **Efor:** S
- **Kanıt / Sorun:** `page.tsx:47` `json.generatedAt!` non-null assertion — alan eksikse "Invalid Date" (`page.tsx:109`); `page.tsx:41` doğrulama yalnız iki alana bakıyor, `feedbacksLast7Days` eksikse sessizce 0 gösteriyor (yanlış "sıfır"). `page.tsx:67` `roleOrder` her render'da yeniden oluşturuluyor (önemsiz). `page.tsx:25` yalnız `en`/diğer ayrımı. `rolesHint` metninde "ADMIN" büyük harf (`messages/tr.json → adminEcosystem.rolesHint`).
- **Öneri:** Yanıtı tek bir `zod` şemasıyla doğrula (proje genelinde `apiOk` deseniyle uyumlu, `lib/api-http.ts:34-38`), eksik alanı "—" ile göster; `roleOrder`'ı modül sabitine taşı; locale → Intl eşlemesini ortak bir yardımcıdan al; metni "Admin, bayi, müşteri ve personel sayıları." olarak düzelt.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Dönem karşılaştırması ve sparkline** (Stripe Dashboard "vs previous period", PostHog trend kartları) — her KPI için delta % ve 7/30 günlük mini grafik.
2. **Derinlemesine inme (drill-down)** — rol rozetine tıklayınca `/admin/users?role=DEALER`'a gitmek; şu an users sayfası rol filtresini URL'den okumuyor (`app/admin/users/users-client.tsx:176,254` yalnız yerel state), bu yüzden küçük bir `useSearchParams` desteği de gerekli.
3. **Dönem seçici + yenile/otomatik yenile + "güncellendi X sn önce"** (Linear/Retool iç araç standardı).
4. **Ekosistem sağlığı göstergeleri** — aktif bayi oranı (7g'de ≥1 tüketim), aktif müşteri (WAU/MAU), bayi başına tüketim, yeni kayıt, puan basım/harcama dengesi (ekonomi değişmezleriyle uyumlu), fraud-işaretli oranı. "Ekosistem" adını hak ettirecek olan bunlar.
5. **CSV/dışa aktarma ve paylaşılabilir anlık görüntü** (platform-pulse'ta CSV zaten var).
6. **Anomali vurgusu** — haftalık düşüş eşiği aşıldığında kartta uyarı rozeti ve ilgili sayfaya bağlantı (PostHog alerts benzeri).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sabah tek bir ekran açıp "ekosistem büyüyor mu, nerede sorun var?" sorusuna 5 saniyede cevap alır ve tek tıkla ilgili araca iner. Bu ekran ayrı bir sayfa değil, **Platform nabzı içindeki "Ekosistem bileşimi" bölümü** olmalı.

**Yerleşim (platform-pulse içinde):**
1. Üst şerit: dönem seçici (24s / 7g / 30g), "Güncellendi 14:32 · Yenile" ve CSV.
2. KPI satırı (4 kart): Toplam kullanıcı · Yeni kullanıcı · Geri bildirim · Tüketim — her biri büyük sayı + önceki döneme göre delta rozeti (ok ikonu + renk) + sparkline.
3. "Ekosistem bileşimi" kartı: rol dağılımı tek bir yatay yığılmış oran çubuğu (ADMIN/DEALER/CUSTOMER/STAFF, yüzde + mutlak sayı), altında tıklanabilir rol listesi → filtreli kullanıcılar. Yanında "aktif bayi oranı" ve "fraud-işaretli hesaplar" mini metrikleri.
4. Hızlı bağlantılar: ayrı bölüm olarak kaldırılır; her KPI/rol satırı kendi bağlamında link taşır (kenar çubuğu zaten tüm araçları listeliyor).

**Motion / 3D:** Bu bir operasyon ekranı; 3D yerinde değil. Ölçülü motion: KPI sayılarında ilk yüklemede kısa (≤400 ms) sayaç animasyonu ve oran çubuğunun soldan dolması — `m as Motion` + global LazyMotion ile, `useReducedMotion` true ise doğrudan son değer. Yenilemede yalnız değişen sayılarda kısa bir vurgu (arka plan flash), sürekli animasyon yok.

**Veri / API değişiklikleri:**
- `GET /api/admin/platform-pulse?range=7d` yanıtına `usersByRole`, `previous` pencere değerleri, `activeDealers7d` (`consumption.groupBy({by:['dealerId'], where:{createdAt>=since}})` sayısı — `@@index([dealerId, createdAt])` mevcut) ve `fraudStatusCounts` (`user.groupBy({by:['fraudStatus']})`) ekle; tümü tek `Promise.all`'da, sonuç Redis'te range başına 60 sn.
- Yanıtı `apiOk` + zod şemasıyla tiplendir; istemcide tek `usePlatformPulse(range)` hook'u.
- `/api/admin/ecosystem-summary` bir sürüm deprecate → silme; `admin-api-catalog.json` güncellenir.
- Rota testi: yetkisiz 401/403, boş DB'de sıfırlar, rol eşleme.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/platform-pulse`** — en güçlü çakışma: geri bildirim 7g ve tüketim 7g metrikleri birebir aynı (`platform-pulse/route.ts:32-35,53,55` ↔ `ecosystem-summary/route.ts:22-27`); pulse daha zengin (24s, yeni kullanıcı, seriler, audit, CSV). **Öneri: ecosystem → platform-pulse'a birleştir**, rota yönlendirilsin.
- **`/admin` (ana pano)** — `user.count()` ve rol bazlı bayi sayımı zaten var (`app/api/admin/dashboard/route.ts:42,83`). Toplam kullanıcı KPI'ı üçüncü kez tekrarlanıyor.
- **Hızlı bağlantılar** — `sidebar.tsx:159-180` ve `admin-utils.ts:91-120` (HIZLI_ERISIM) zaten aynı hedefleri listeliyor; sayfadaki 7 bağlantılık ızgara üçüncü bir navigasyon kopyası.
- Kenar çubuğunda "Pano / Ekosistem özeti / Platform nabzı" art arda üç "genel bakış" girişi (`sidebar.tsx:159-161`) — birleştirme sonrası ikiye iner.
