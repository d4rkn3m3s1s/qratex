# /dealer/customers

**Amaç:** İşletmenin (bayinin) müşteri portföyünü tek listede göstermek: yaşam boyu değer (CLV), ziyaret sayısı, ortalama sepet, kayıp (churn) riski, segment ve güven skoru. Bayi tarafındaki CRM benzeri tek "müşteri listesi" yüzeyi.

**Genel puan:** 3.5 / 10 · **Karar:** yeniden inşa (veri katmanı işletme bazında yeniden kurulmalı; arayüz `/dealer/segment-actions` ve `/dealer/churn-risk` ile tek bir "Müşteriler" merkezinde birleştirilmeli)

> Özet: Sayfa 171 satırlık, tek tablolu, sade bir istemci bileşeni. Asıl sorun arayüz değil **veri**: `CustomerLifetimeValue` tablosu müşteri başına **platform geneli** tek satır tutuyor (`userId @unique`), API bu satırı olduğu gibi bayiye döndürüyor. Sonuç: bir bayi, müşterisinin **başka işletmelerdeki** harcamasını, ziyaret sayısını, son ziyaret tarihini ve bunlardan türeyen segmentini görüyor. Bu hem yanlış metrik hem de kiracılar arası (cross-tenant) veri sızıntısıdır.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 2/10 | Gösterilen 5 sayısal sütunun 4'ü başka işletmelerin verisini içeriyor; "Kayıp riski" sıralaması NULL'ları en üste koyuyor; arama/filtre/sayfalama/aksiyon yok. |
| UX | 3/10 | Salt-okunur, aksiyonsuz bir tablo; "bu bilgiyle ne yapacağım?" sorusuna cevap yok; hata durumunda bile "henüz veri yok" diyor. |
| Görsel | 4/10 | Paylaşılan hero ve shadcn kartı tutarlı, ancak segment rozetleri beyaz yazı + açık renk zeminle okunmuyor, KPI/özet yok, yükleme düz metin. |
| Mimari | 3/10 | Global CLV modeli çok kiracılı ürüne uymuyor; churn tanımı `/dealer/churn-risk` ile çelişiyor; i18n kullanılmıyor; `fetch` hata yönetimi `res.ok` kontrol etmiyor. |
| Performans | 6/10 | İstek başına 2 sorgu, `take` sınırı var; fakat bayinin tüm `Consumption` kayıtları üzerinde sınırsız `groupBy` + büyük `IN` listesi, önbellek yok. Mevcut ölçekte kabul edilebilir. |
| Erişilebilirlik + Mobil | 4/10 | 8 sütunlu tablo telefonda yatay kaydırmaya mahkûm; sıralama düğmelerinde `aria-pressed`, tabloda `caption`/`scope` yok; segment rozetleri WCAG AA kontrastını geçemiyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa hero'su (başlık "Müşteriler", açıklama, ikon) | KISMİ | `app/dealer/customers/page.tsx:66-70`, `components/admin/admin-premium-hero.tsx:151` | `eyebrow` verilmediği için varsayılan **"Yönetim paneli"** rozeti bayi sayfasında görünüyor. `className="text-white"` ikon sınıfı hero içindeki `[&_svg]:!text-foreground` ile eziliyor (ölü sınıf). |
| 2 | Kart başlığı + "CLV günlük olarak hesaplanır (gece 02:00)" | KISMİ | `page.tsx:74-75`, `lib/inngest/functions.ts:106-111` | Cron `0 2 * * *` UTC → Türkiye saatiyle **05:00**. Ayrıca CLV yalnızca Inngest ile tetikleniyor; tek günlük toplayıcı `app/api/cron/daily/route.ts:51-59` listesinde `calculate-clv` **yok**. Üretimde Inngest Cloud'un kayıtlı/çalışır olduğu **doğrulanmadı** (yerel `.env` içinde `INNGEST_*` anahtarı yok). Çalışmıyorsa tablo hiç dolmaz/bayatlar. |
| 3 | "Harcama" sıralaması | KISMİ | `page.tsx:78-85`, `app/api/dealer/customers/route.ts:67` | Sıralama `totalSpent` (platform geneli) üzerinden; ilk 100'e, bu işletmeye en çok harcayanlar değil platformda en çok harcayanlar giriyor. |
| 4 | "Kayıp riski" sıralaması | BOZUK | `route.ts:67` | `orderBy: { predictedChurn: 'desc' }` — PostgreSQL'de `DESC` varsayılanı **NULLS FIRST**. Churn verisi olmayan müşteriler (çoğunluk) listenin başına geliyor; gerçek riskliler 100 sınırının dışında kalabiliyor. Prisma 5'te `{ sort: 'desc', nulls: 'last' }` gerekir. |
| 5 | Veri çekme (`fetchList`) | KISMİ | `page.tsx:51-62` | `r.ok` kontrol edilmiyor; 400/401/403/500/503 yanıtları "boş liste" olarak işleniyor. `AbortController` yok: sıralama hızlı değiştirilirse eski yanıt yeniyi ezebilir (yarış koşulu). |
| 6 | Yükleniyor durumu | KISMİ | `page.tsx:97-98` | Düz "Yükleniyor..." metni; her sıralama değişiminde tablo tamamen kaybolup geri geliyor (düzen sıçraması). Diğer bayi sayfalarında `Skeleton` deseni var. |
| 7 | Boş durum | KISMİ | `page.tsx:99-102` | Hata, yetki reddi ve gerçekten boş durum aynı metinle gösteriliyor. Boş durumda yönlendirici aksiyon (ör. "Kart okutmaya başla → /dealer/scan") yok. |
| 8 | Hata bildirimi (toast) | KISMİ | `page.tsx:56` | Yalnızca ağ hatasında tetikleniyor (bkz. #5). Yeniden dene düğmesi yok. |
| 9 | Müşteri adı + e-posta | ÇALIŞIYOR | `page.tsx:121-124`, `route.ts:75-76` | İsim yoksa "İsimsiz". Tam e-posta adresi bayiye açık (KVKK/rıza notu için Bulgu 6). |
| 10 | Müşteri avatarı | EKSİK | `route.ts:77` döndürüyor, `page.tsx` kullanmıyor | API `image` alanını gönderiyor ama arayüz göstermiyor; gereksiz veri transferi. |
| 11 | Güven rozeti (Güvenilir/Nötr/İzlemede/Düşük + skor) | ÇALIŞIYOR | `page.tsx:31-44`, `125-138`, `lib/trust-score.ts:21-26` | Tasarım gereği bayiye açık (`lib/trust-score.ts:5`). Skor açıklaması yalnızca `title` (fareyle üzerine gelme) ile; dokunmatikte ve ekran okuyucuda erişilmez. Skor kısmen platform geneli sinyalden türüyor ve bağlamsız gösteriliyor. |
| 12 | Segment rozeti | KISMİ | `page.tsx:139-150`, `lib/clv-core.ts:12-18`, `62-69` | Segment platform geneli harcamadan atanıyor (bu işletmede "VIP" olmayan biri VIP görünür). Beyaz yazı + `#FFD700` / `#4ECDC4` / `#45B7D1` / `#95A5A6` zeminler AA kontrastını geçmiyor. `CustomerSegment.color` nullable (`prisma/schema.prisma:2094`) → renk yoksa beyaz yazı şeffaf zeminde görünmez. |
| 13 | Toplam harcama | BOZUK | `page.tsx:151`, `lib/clv-core.ts:80-87` | `consumption.groupBy({ by: ['customerId'] })` **dealerId filtresi olmadan** hesaplanıyor → tüm işletmelerdeki harcama toplamı. |
| 14 | Ziyaret | BOZUK | `page.tsx:152`, `lib/clv-core.ts:125` | Aynı sebep: tüm işletmelerdeki ziyaret sayısı. |
| 15 | Ortalama sepet | BOZUK | `page.tsx:153`, `lib/clv-core.ts:126` | Platform geneli; ayrıca `amount` nullable (`schema.prisma:1580`) olduğundan `_avg` yalnız tutarlı kayıtlardan, `totalVisits` ise tüm kayıtlardan sayılıyor → `toplam / ziyaret ≠ ort. sepet`. |
| 16 | Kayıp riski sütunu | KISMİ | `page.tsx:154-157`, `lib/clv-core.ts:93-119` | Ham İngilizce değerler (**HIGH / MEDIUM / LOW**) Türkçe arayüzde. Risk tüm işletmelerdeki geri bildirimlerin ortalaması; `/dealer/churn-risk` ise yalnız bu işletmenin QR geri bildirimlerinden hesaplıyor (`app/api/dealer/churn-risk/route.ts:41-58`) → aynı müşteri için iki sayfada iki farklı risk. Risk `null` iken "—" yeşil renkte. |
| 17 | Son ziyaret | BOZUK | `page.tsx:158-160`, `lib/clv-core.ts:128` | `lastPurchaseAt` = herhangi bir işletmedeki son tüketim. Bayi, müşterisinin dün **rakip bir işletmeye** gittiğini dolaylı olarak öğrenir. |
| 18 | Veri tazeliği göstergesi | EKSİK | `route.ts:87` döndürüyor, arayüz kullanmıyor | `calculatedAt` hiç gösterilmiyor; cron çalışmasa bile kullanıcı bunu fark edemez. |
| 19 | Sayfalama / "daha fazla" | EKSİK | `page.tsx:53` (`limit=100`), `route.ts:40` (üst sınır 200) | 100'den fazla müşterisi olan işletme geri kalanını hiçbir şekilde göremez. |
| 20 | Özet KPI'lar / toplam müşteri sayısı | EKSİK | `route.ts:90-91` | `count` sadece döndürülen satır sayısı (≤ limit); gerçek toplam, riskli sayısı, toplam CLV gibi özet yok. |
| 21 | Arama (ad/e-posta) | EKSİK | — | — |
| 22 | Filtreler (segment, risk, güven, son ziyaret aralığı) | EKSİK | — | — |
| 23 | Sütun başlığından sıralama (ziyaret, son ziyaret, ort. sepet) | EKSİK | `page.tsx:107-116` | Yalnızca iki sabit sıralama düğmesi. |
| 24 | Müşteri detay görünümü (zaman çizelgesi, yorumlar, ziyaret geçmişi) | EKSİK | — | Satırlar tıklanamaz; `ref` istemciye geldiği halde bir detay ucu yok. |
| 25 | Aksiyonlar (kampanya gönder, telafi teklifi, not, etiket) | EKSİK | — | Bu aksiyonlar `/dealer/segment-actions` ve `/dealer/remedy-queue`'da dağınık; bu sayfadan erişilemiyor. |
| 26 | Dışa aktarma (CSV) | EKSİK | — | — |
| 27 | CLV'si henüz hesaplanmamış yeni müşteriler | EKSİK | `route.ts:53-54` | Son cron'dan sonra gelen müşteri, `Consumption` kaydı olsa bile listede yok; sayısı da belirtilmiyor. |
| 28 | Para birimi biçimi | EKSİK | `page.tsx:151`, `153` | `toLocaleString('tr-TR')` ile çıplak sayı; "₺" yok, ondalık sayısı tutarsız. |
| 29 | Mobil davranış | KISMİ | `page.tsx:65`, `72`, `104-105`; `app/dealer/layout.tsx:35-39` | Tablo `overflow-x-auto` içinde (sayfa taşmıyor) fakat 8 sütun telefonda yatay kaydırma gerektiriyor; kart/satır görünümü yok. `CardHeader flex-row justify-between` sarılmıyor, dar ekranda başlık ve düğmeler sıkışıyor. Layout zaten yatay boşluk verirken sayfa ayrıca `p-6` ekliyor (telefonda çift boşluk). |
| 30 | Erişilebilirlik | KISMİ | `page.tsx:78-93`, `105-116` | Sıralama düğmelerinde `aria-pressed` yok (durum yalnız renkle). Tabloda `<caption>`, `th scope="col"` yok; sayısal sütunlarda birim yok. Güven skoru açıklaması yalnız `title`. |
| 31 | DEALER yetkisi (proxy + API) | ÇALIŞIYOR | `proxy.ts:50-73`, `route.ts:16-36` | `/dealer/*` yalnız DEALER rolüne açık; API `dealerId = session.user.id` kullanıyor, query'den bayi kimliği almıyor (IDOR yok). |
| 32 | STAFF / ADMIN API dalları | KISMİ | `route.ts:21-33`, `proxy.ts:52` | Sayfa yalnız DEALER'a açık olduğundan bu dallar arayüzden kullanılmıyor. STAFF doğrudan API ile tüm müşteri e-postalarını alabilir; personel için ayrıntılı izin (ör. "müşteri verisi görebilir") kontrolü yok. ADMIN `dealerId` vermezse 400 alır — sayfa bunu "veri yok" olarak gösterir. |
| 33 | Çok dillilik (i18n) | KISMİ | `page.tsx` tüm metinler sabit; karşılaştırma `app/dealer/churn-risk/page.tsx:101-102` | Kardeş sayfa `t()` kullanırken bu sayfa sabit Türkçe + sabit İngilizce risk etiketleri; dil değiştirildiğinde karma görünüm. |
| 34 | Satır anahtarı `ref` (gizlilik iddiası) | KISMİ | `route.ts:72-74` | Yorum "ham ID sızdırılmaz (gizlilik)" diyor ama aynı yanıtta tam ad ve e-posta dönüyor; gizlilik kazancı yok. `cuid` son 8 karakteri teorik olarak çakışabilir (yinelenen React key). Detay ucu için kararlı, imzalı bir referans gerekir. |
| 35 | Belge başlığı (sekme adı) | KISMİ | `page.tsx:1` (`'use client'`), `app/dealer/layout.tsx:13-23` | Sayfaya özel `metadata` yok; sekmede yalnız panel adı görünür. |
| 36 | API performansı / önbellek | KISMİ | `route.ts:43-69` | Bayinin tüm tüketimleri üzerinde her istekte `groupBy`; binlerce elemanlı `IN` listesi; Redis önbelleği yok (projede 9 yolda var). Mevcut ölçekte sorun değil, büyüyünce olur. |

**Durum dağılımı:** ÇALIŞIYOR 3 · KISMİ 16 · BOZUK 5 · SAHTE 0 · EKSİK 12 (toplam 36)

---

## Bulgular

### 1. Kiracılar arası veri sızıntısı: bayi, müşterisinin diğer işletmelerdeki harcama/ziyaret/son ziyaret bilgisini görüyor
- **Önem:** KRİTİK · **Kategori:** güvenlik / veri bütünlüğü · **Efor:** L
- **Kanıt:** `prisma/schema.prisma:2069-2087` (`CustomerLifetimeValue.userId @unique`, `dealerId` alanı yok); `lib/clv-core.ts:80-87` (`consumption.groupBy({ by: ['customerId'] })` — `dealerId` filtresi yok); `app/api/dealer/customers/route.ts:53-88` (bu global satırı olduğu gibi bayiye döndürüyor); `app/dealer/customers/page.tsx:151-160`.
- **Sorun:** API, müşteri listesini doğru şekilde bu bayinin tüketimlerinden çıkarıyor (`route.ts:43-47`), fakat her müşteri için gösterilen `totalSpent`, `totalVisits`, `avgOrderValue`, `lastPurchaseAt`, `predictedChurn` ve `segment` **tüm platformdaki** davranıştan hesaplanmış. Somut senaryo: Müşteri A, Kafe X'te 1 kez 80 ₺, Restoran Y'de 40 kez 9.000 ₺ harcamış. Kafe X'in panelinde A "VIP · 9.080 · 41 ziyaret · son ziyaret dün" görünüyor. Bu (a) ticari olarak hassas rakip verisini sızdırıyor (müşterinin rakipte ne kadar harcadığı ve en son ne zaman gittiği), (b) KVKK açısından müşterinin bir işletmeyle paylaştığı verinin başka bir işletmeye aktarılması anlamına geliyor, (c) bayinin bütün kararlarını (kime kampanya, kim riskli) yanlış veriye dayandırıyor. Aynı sızıntı `app/api/dealer/segment-actions/route.ts:51-63` üzerinden segment özetlerine de yansıyor.
- **Profesyonel öneri:** CLV'yi işletme × müşteri düzeyine taşıyın. Yeni bir `DealerCustomerStats` (veya `CustomerLifetimeValue`'a `dealerId` ekleyip `@@unique([dealerId, userId])`) modeli; `recomputeAllCLV` içinde `groupBy({ by: ['dealerId', 'customerId'] })` ile hesap; churn ortalaması da `Feedback.qrCode.dealerId` / `ConsumptionReview.consumption.dealerId` ile işletme bazında. Segment kuralları (`pickSegment`) bayi bazlı eşiklerle (ör. VIP = bu işletmedeki harcamanın üst %10'u) çalışmalı; sabit 5.000 ₺ eşiği her işletme türüne uymaz. Geçiş süresince **acil yama**: API'de global CLV yerine `consumption.groupBy({ by:['customerId'], where:{ dealerId }, _sum, _count, _avg, _max })` ile işletme bazlı metrikleri canlı hesaplayın ve segment/churn sütunlarını gizleyin. Platform geneli segmenti yalnız admin görmeli.

### 2. "Kayıp riski" sıralaması NULL değerleri en üste koyuyor
- **Önem:** YÜKSEK · **Kategori:** hata · **Efor:** S
- **Kanıt:** `app/api/dealer/customers/route.ts:67` — `orderBy: { predictedChurn: 'desc' }`; `package.json:37` Prisma 5.7.
- **Sorun:** PostgreSQL `ORDER BY ... DESC` varsayılan olarak `NULLS FIRST` uygular. `predictedChurn` yalnızca AI churn sinyali olan müşterilerde dolu (`lib/clv-core.ts:129`), çoğunluk `null`. "Kayıp riski" düğmesine basan bayi önce risksiz/verisiz müşterileri görüyor; `take: limit` (100) yüzünden gerçek riskli müşteriler listeye hiç girmeyebiliyor. Özelliğin tek amacını boşa çıkarıyor.
- **Profesyonel öneri:** `orderBy: [{ predictedChurn: { sort: 'desc', nulls: 'last' } }, { lastPurchaseAt: 'asc' }]` ve churn sıralamasında `where: { predictedChurn: { not: null } }` ile ayrı bir "riskli" görünümü. Uzun vadede risk sıralaması, Bulgu 1'deki işletme bazlı modelle ve recency (son ziyaretten geçen gün) ile birleştirilmiş bir skorla yapılmalı.

### 3. API hata yanıtları "henüz veri yok" olarak gösteriliyor
- **Önem:** YÜKSEK · **Kategori:** hata / UX · **Efor:** S
- **Kanıt:** `app/dealer/customers/page.tsx:53-57`, `99-102`; `route.ts:28-31`, `95-98`.
- **Sorun:** `fetch` 4xx/5xx'te reddetmez; kod `r.ok` kontrol etmeden `r.json()` alıp `data.customers` dizi değilse `[]` atıyor. 500, 503 (DB uyuyor — Neon), 403 (token replay, `lib/api-auth.ts:70-76`) durumlarında kullanıcı hiçbir uyarı görmeden "Henüz hesaplanmış müşteri verisi yok. Tüketim kaydı oluştukça günlük cron CLV üretir." metnini okuyor ve verisinin olmadığını sanıyor.
- **Profesyonel öneri:** Durumu `{ status: 'loading' | 'error' | 'empty' | 'ready' }` olarak modelleyin; `!res.ok` ise `error` + `data.error` mesajı + "Tekrar dene" düğmesi. Projede yaygın olan SWR/React Query desenine geçip (yeniden deneme, odak dönüşünde tazeleme, istek iptali) yarış koşulunu (#5) da aynı anda çözün.

### 4. CLV yenilemesi tek günlük cron'a bağlı değil; açıklamadaki saat yanlış
- **Önem:** YÜKSEK (çalışmıyorsa sayfa tamamen boş) · **Kategori:** mimari / güvenilirlik · **Efor:** S
- **Kanıt:** `lib/inngest/functions.ts:106-111` (`cron: '0 2 * * *'`, UTC); `app/api/cron/daily/route.ts:41-59` ("DB'ye dokunan bütün periyodik işler BURADA toplanır" — `calculate-clv` listede yok); `page.tsx:75` ("gece 02:00").
- **Sorun:** Proje kuralı (commit `953c8fe`) tüm DB işlerini tek uyanışlı `/api/cron/daily` toplayıcısında toplamak; CLV ise yalnız Inngest'e bağlı. Üretimde Inngest Cloud'un uygulamayı senkronize edip bu cron'u gerçekten çalıştırdığı **doğrulanmadı**. Çalışmıyorsa tablo hiç dolmuyor ya da günlerce bayat kalıyor ve arayüz bunu göstermiyor (`calculatedAt` kullanılmıyor). Çalışıyorsa bile Neon compute'unu ayrı bir uyanışla uyandırıyor. Ayrıca 02:00 UTC = 05:00 TSİ.
- **Profesyonel öneri:** `calculate-clv`'yi `daily` görev listesine ekleyin (Inngest tanımını kaldırın veya ikisinden birini `updateMany` claim deseniyle tekilleştirin). `recomputeAllCLV` döngüsündeki satır-satır `upsert` (`lib/clv-core.ts:137`) büyüdükçe `maxDuration = 60` toplayıcı limitini aşabilir; toplu `createMany` + `updateMany` ya da `INSERT ... ON CONFLICT` ile tek SQL'e indirin. Arayüzde "Son güncelleme: 3 saat önce" rozeti ve 36 saati aşan bayatlıkta uyarı gösterin.

### 5. Segment ve churn tanımı kardeş sayfalarla çelişiyor
- **Önem:** ORTA · **Kategori:** mimari / tutarlılık · **Efor:** M
- **Kanıt:** `lib/clv-core.ts:93-119` (churn = tüm işletmelerdeki Feedback + ConsumptionReview ortalaması); `app/api/dealer/churn-risk/route.ts:41-58` (churn = bu işletmenin QR geri bildirimleri); `page.tsx:154-157`.
- **Sorun:** Aynı müşteri `/dealer/customers`'ta "HIGH (62%)", `/dealer/churn-risk`'te hiç listelenmiyor olabilir (veya tersi). Bayi hangi sayıya güveneceğini bilemez; ürün güvenilirliği zedelenir.
- **Profesyonel öneri:** Tek bir `lib/customer-metrics` modülünde "işletme bazlı müşteri sağlığı" tanımı (recency, frequency, monetary + AI churn sinyali) oluşturun; churn-risk, segment-actions ve customers bu tek kaynaktan okusun. Etiketleri `Yüksek / Orta / Düşük` olarak i18n anahtarlarına bağlayın.

### 6. Tam e-posta ve isim, rıza/izin katmanı olmadan bayiye ve personele açık
- **Önem:** ORTA · **Kategori:** gizlilik / yetki · **Efor:** M
- **Kanıt:** `route.ts:64`, `75-76`; `route.ts:21-24` (STAFF dalı, izin kontrolü yok); `route.ts:72-73` ("gizlilik" yorumu); şemada müşteri tarafı paylaşım rızası alanı yok (`prisma/schema.prisma` içinde `marketingConsent` / `shareWith*` araması sonuçsuz).
- **Sorun:** Bayi listesinde müşterinin tam e-postası görünüyor; personel (STAFF) API'yi doğrudan çağırarak 200 müşterinin e-postasını toplayabiliyor. Kod içi yorum ham ID'yi gizlilik için gizlediğini söylerken e-postayı açık döndürmesi çelişkili. Projede `lib/pii-redact.ts` maskeleme yardımcıları mevcut ama yalnız log için kullanılıyor.
- **Profesyonel öneri:** Varsayılan olarak maskeli e-posta (`a***@gmail.com`) gösterin; tam iletişim bilgisini yalnızca müşterinin bu işletmeyle iletişim izni verdiği (pazarlama rızası) durumda açın. Personel için rol tabanlı izin (`customers:read`, `customers:contact`) ekleyin. Erişimleri denetim kaydına (audit log) yazın.

### 7. Ölçeklenmeyen liste: sayfalama, arama, filtre, toplam sayı yok
- **Önem:** ORTA · **Kategori:** işlevsellik · **Efor:** M
- **Kanıt:** `page.tsx:53` (`limit=100`), `route.ts:40`, `90-91`.
- **Sorun:** 100'den fazla müşterili işletme kalanını göremez; bir müşteriyi adıyla bulamaz; "kaç VIP'im var?" sorusunu cevaplayamaz. Bir CRM listesinin temel beklentileri karşılanmıyor.
- **Profesyonel öneri:** API'ye imleç tabanlı sayfalama (`cursor`, `take`), `q` (ad/e-posta `contains`, `mode: 'insensitive'`), `segment`, `risk`, `trust`, `lastVisitBefore/After` parametreleri ve ayrı bir `summary` nesnesi (toplam müşteri, aktif/uyuyan, riskli, ortalama CLV) ekleyin. Arayüzde URL'e senkron filtre çubuğu (`useSearchParams`), sütun başlığından sıralama, sanal kaydırma veya "Daha fazla yükle".

### 8. Segment rozetleri okunmuyor; risk yalnız renk/İngilizce ile anlatılıyor
- **Önem:** ORTA · **Kategori:** erişilebilirlik / görsel · **Efor:** S
- **Kanıt:** `page.tsx:141-145` (`text-white` + `backgroundColor: c.segment.color`), `lib/clv-core.ts:13-17` (açık tonlar), `page.tsx:27-28`, `154-157`.
- **Sorun:** Beyaz metin altın sarısı `#FFD700` üzerinde yaklaşık 1.4:1, turkuaz `#4ECDC4` üzerinde ~1.9:1 — WCAG AA (4.5:1) çok altında. Renk `null` ise metin görünmez. Risk "HIGH" gibi İngilizce ve verisi yokken "—" yeşil (iyi) renkte gösteriliyor.
- **Profesyonel öneri:** Segment rengini yalnız bir nokta/kenar vurgusu olarak kullanan, metni tema ön plan renginde tutan bir `SegmentBadge` bileşeni (renk yoksa nötr varsayılan). Risk için ikon + Türkçe etiket + yüzde içeren `RiskPill`; `null` için nötr gri "Veri yok".

### 9. Yarış koşulu ve yükleme deneyimi
- **Önem:** DÜŞÜK · **Kategori:** hata / UX · **Efor:** S
- **Kanıt:** `page.tsx:51-62`, `97-98`.
- **Sorun:** Sıralama düğmeleri arasında hızlı geçişte iptal edilmeyen iki istek yarışıyor; geç dönen eski sıralama sonucu ekranda kalabilir ve düğme durumu ile tablo uyuşmaz. Her değişimde tablo "Yükleniyor..." metnine dönüp düzen sıçraması yapıyor.
- **Profesyonel öneri:** `AbortController` veya SWR anahtarlı önbellek; yeni veri gelirken eski tabloyu soluk (`opacity-60`, `aria-busy`) tutup ilk yüklemede satır iskeleti gösterin.

### 10. Hero'da yanlış panel etiketi ve sayfa tutarlılığı
- **Önem:** DÜŞÜK · **Kategori:** tutarlılık / i18n · **Efor:** S
- **Kanıt:** `components/admin/admin-premium-hero.tsx:151` (`eyebrow = 'Yönetim paneli'`), `page.tsx:66-70`; `components/dashboard/sidebar.tsx:243-244` (Ekip ve Müşteriler aynı `Users` ikonu); i18n karşılaştırma `app/dealer/churn-risk/page.tsx:101`.
- **Sorun:** Bayi sayfasında "YÖNETİM PANELİ" rozeti görünüyor; menüde iki komşu öğe aynı ikonu taşıyor; sayfa i18n kullanmıyor.
- **Profesyonel öneri:** Bayi sayfaları için `eyebrow` varsayılanını panel bağlamından alan bir `DealerPageHero` sarmalayıcı; menüde `Contact`/`UserRound` gibi ayırt edici ikon; metinleri `messages/tr.json` / `en.json` altına `dealerCustomers.*` anahtarlarıyla taşıyın.

---

## Eksik özellikler (kıyas ürünlerle)

| Kıyas | Bu sayfada olmayan profesyonel yetenek |
|---|---|
| **Square Dashboard – Customer Directory** | Müşteri profil kartı (ziyaret zaman çizelgesi, satın alınan ürünler, notlar, etiketler), otomatik gruplar (ilk kez gelen, düzenli, geri kazanılacak), CSV içe/dışa aktarma, gruptan doğrudan pazarlama kampanyası başlatma. |
| **Toast – Guest Book / Guest Profiles** | Misafir tercihleri ve alerji/özel not alanı, sık sipariş edilen ürünler, ziyaret sıklığı grafiği, personelin müşteri kartına not düşebilmesi. |
| **Medallia / Qualtrics CX** | Müşteri bazında deneyim zaman çizelgesi (her geri bildirim + duygu + yanıt), "kapalı döngü" (close-the-loop) aksiyonu ve sorumlu atama, risk sinyalinin açıklaması (neden riskli: son 3 yorum negatif, 45 gündür gelmedi). |
| **Yelp for Business / Google Business Profile** | Yorum yapan müşteriyle bağlantı: müşterinin işletmeye bıraktığı yorumlara ve işletmenin yanıtlarına profil üzerinden erişim. |
| **Genel CRM beklentisi** | RFM ızgarası (recency × frequency) ile segment haritası, kaydedilmiş görünümler, toplu seçim + toplu aksiyon (kampanya/teklif/etiket), veri tazeliği ve "neden bu segmentte" açıklaması. |
| **KVKK uyumu** | Rıza durumu göstergesi, maskeli iletişim bilgisi, erişim denetim kaydı, müşteri silme/anonimleştirme talebinin listeye yansıması. |

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi bu sayfayı açtığında üç soruya 5 saniyede cevap almalı: *"Kaç müşterim var ve sağlıkları nasıl?"*, *"Bugün kimle ilgilenmeliyim?"*, *"Bu müşteri kim, benimle geçmişi ne?"* — ve cevaptan tek tıkla aksiyona geçebilmeli.

**Yerleşim:**
1. **Üst şerit (KPI'lar):** Toplam müşteri · Aktif (30 gün) · Uyuyan · Riskli · Ortalama işletme-içi CLV · Veri tazeliği rozeti. Her KPI tıklanınca listeyi o filtreye daraltır.
2. **Segment haritası (opsiyonel, katlanabilir):** RFM ızgarası — x: son ziyaretten geçen gün, y: ziyaret sıklığı; hücre yoğunluğu müşteri sayısı. "Şampiyonlar", "Kaybedilmek üzere", "Uyuyan" gibi kutulara tıklayınca liste filtrelenir. Bu, `/dealer/segment-actions`'ın yerini alır.
3. **Filtre çubuğu + arama:** segment, risk, güven, son ziyaret aralığı; URL'e senkron; kaydedilmiş görünümler.
4. **Liste:** masaüstünde yoğun tablo (avatar, ad + maskeli e-posta, segment, işletme-içi harcama ₺, ziyaret, son ziyaret "12 gün önce", risk pill, güven), çoklu seçim ve toplu aksiyon çubuğu (kampanya gönder / telafi teklifi / etiket). Telefonda her müşteri tek kart: ad, segment, "son ziyaret 12 gün önce", risk; kaydırma yerine dikey liste.
5. **Müşteri çekmecesi (sağdan `Sheet`):** zaman çizelgesi (ziyaretler, yorumlar, yanıtlar, kampanya etkileşimi), "neden riskli" açıklaması, önerilen sonraki adım, personel notları.

**Motion / 3D:** 3D gereksiz; bu bir veri yoğun iş ekranı. Ölçülü framer-motion (`m as Motion`, global LazyMotion): KPI sayılarında kısa sayaç animasyonu, filtre değişiminde liste için `layout` geçişi (yalnız ilk 20 satır), çekmece için yay tabanlı kayma. `useReducedMotion` ile hepsi anında geçişe düşmeli. Yükleme sırasında iskelet, veri tazelenirken eski içerik soluk.

**Veri / API değişiklikleri:**
- `DealerCustomerStats` modeli: `@@unique([dealerId, userId])`, alanlar: `totalSpent`, `visits`, `avgOrderValue` (yalnız tutarlı kayıtlardan, `pricedVisits` ayrıca), `firstVisitAt`, `lastVisitAt`, `churnScore` (işletme bazlı), `rfmSegment`, `calculatedAt`; indeksler `[dealerId, totalSpent]`, `[dealerId, churnScore]`, `[dealerId, lastVisitAt]`.
- Hesaplama: `/api/cron/daily` içinde, tek SQL `INSERT ... ON CONFLICT` ile; tüketim/yorum anında hafif artımlı güncelleme (opsiyonel) ki yeni müşteri ertesi günü beklemesin.
- `GET /api/dealer/customers?cursor&take&q&segment&risk&trust&sort&dir` + `GET /api/dealer/customers/summary` (Redis'te 5 dk önbellek, `dealer-customers:{dealerId}` anahtarı, yazımda geçersiz kılma) + `GET /api/dealer/customers/[ref]` (imzalı/opak `ref` ile, `dealerId` sahiplik kontrolü).
- Personel için `customers:read` izni; e-posta maskeleme ve rıza alanı.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/segment-actions`** — Aynı global CLV verisini (`app/api/dealer/segment-actions/route.ts:51-63`) segment özetine çeviriyor; aynı sızıntıyı taşıyor. Bu sayfanın "Segmentler" sekmesi/üst haritası olarak birleştirilmeli.
- **`/dealer/churn-risk`** — Farklı bir churn tanımıyla (işletme bazlı QR geri bildirimi) aynı soruyu cevaplıyor; iki sayfa birbirini yalanlıyor. "Risk altındakiler" sekmesi veya KPI filtresi olarak birleştirilmeli, tek churn tanımına inmeli.
- **`/dealer/consumptions`** — İşlem (ziyaret) bazlı liste; müşteri çekmecesindeki zaman çizelgesinin kaynağı olmalı. Ayrı sayfa olarak kalabilir ama müşteri adından bu sayfaya/çekmeceye bağlantı verilmeli.
- **Önerilen yapı:** Menüde "Analitik" altındaki `churn_risk` ve `segment_actions` girdileri kaldırılıp tek bir **"Müşteriler"** merkezi (`/dealer/customers` — sekmeler: Liste · Segmentler · Risk altında) oluşturulmalı; eski yollar 308 yönlendirmeyle yeni sekmelere bağlanmalı.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunurdur; kod değiştirilmedi, veritabanına dokunulmadı. Her iddia çürütülmeye çalışıldı.

### 1. Kiracılar arası veri sızıntısı: global CLV bayiye döndürülüyor — **DOĞRULANDI**

- `prisma/schema.prisma:2068-2086`: `CustomerLifetimeValue` modelinde `userId @unique` var, `dealerId` alanı yok; yani müşteri başına platform genelinde tek satır.
- `lib/clv-core.ts:80-87`: `consumption.groupBy({ by: ['customerId'] })` hiçbir `where` (dealerId) filtresi olmadan çalışıyor; `totalSpent`, `totalVisits`, `avgOrderValue`, `firstPurchaseAt`, `lastPurchaseAt` tüm işletmelerin toplamı.
- `lib/clv-core.ts:93-106`: churn de `feedback.groupBy({ by: ['userId'] })` ve `consumptionReview.groupBy({ by: ['customerId'] })` ile bayi ayrımı yapılmadan ortalanıyor; segment (`pickSegment`, satır 131) bu global metriklerden türüyor.
- Tek yazan yer `lib/clv-core.ts:137` (başka `customerLifetimeValue.upsert/create/update` yok).
- `app/api/dealer/customers/route.ts:43-47` müşteri kümesini bayiye göre doğru seçiyor, ama `route.ts:53-88` bu müşterilerin global satırını olduğu gibi döndürüyor (`totalSpent`, `totalVisits`, `avgOrderValue`, `lastPurchaseAt`, `predictedChurn`, `churnRisk`, `segment`). `app/api/dealer/segment-actions/route.ts:51-63` aynı global satırları segment özetine çeviriyor.
- **Yeniden üretim:** Müşteri M, Bayi A'da 1 kez 50 ₺, rakip Bayi B'de 40 kez toplam 8.000 ₺ tüketim yapmış olsun (B'deki son ziyareti dün). Gece CLV cron'u çalıştıktan sonra Bayi A `/dealer/customers` açtığında M için "Toplam harcama 8.050, Ziyaret 41, Son ziyaret: dün, Segment: VIP" görür. A, M'nin başka bir işletmede ne kadar harcadığını ve en son ne zaman gittiğini öğrenir (rekabet hassas veri + kişisel veri ifşası); ayrıca A için bu metrikler ve "VIP"/"Risk Altında" etiketi yanlıştır. B'ye yazılmış bir geri bildirimin churn'ü A'nın ekranındaki kayıp riskini de değiştirir.
- **Not:** Bu, kritik seviyede bir çok kiracılı izolasyon ihlalidir. Raporda önerilen işletme-bazlı `DealerCustomerStats` (`@@unique([dealerId, userId])`) yaklaşımı doğru çözüm; geçiş süresince acil önlem olarak API'nin metrikleri `consumption.groupBy({ by: ['customerId'], where: { dealerId } })` ile canlı hesaplaması ve global segment/churn alanlarını döndürmemesi gerekir.

### 2. Kayıp riski sıralaması NULL değerleri başa alıyor — **DOĞRULANDI**

- `app/api/dealer/customers/route.ts:67`: `orderBy: { predictedChurn: 'desc' }`; `nulls` belirtilmemiş. Prisma bu durumda düz `ORDER BY "predictedChurn" DESC` üretir ve PostgreSQL'de `DESC` için varsayılan `NULLS FIRST`'tür. Alan nullable (`schema.prisma`, `predictedChurn Float?`).
- `lib/clv-core.ts:129`: Müşterinin hiç `churnRisk` içeren Feedback/ConsumptionReview kaydı yoksa `predictedChurn = null`. Yani AI churn skoru üretilmemiş her müşteri listenin başına gelir.
- Sayfa `limit=100` istiyor (`app/dealer/customers/page.tsx:53`), API `take: limit` uyguluyor (`route.ts:68`).
- **Yeniden üretim:** 180 müşterisi olan bir bayide 120 müşterinin churn skoru yok (yorum bırakmamış), 60'ının var. "Kayıp riski" düğmesine basıldığında ilk 100 satırın tamamı `—` gösteren null satırlar olur; %80 riskli müşteriler 121. sıradan itibaren başladığı için ekranda hiç görünmez. Daha küçük bayilerde de riskliler null'ların altına itilir; görünümün amacı tersine döner.
- **Not:** Etki veriye bağlı (null oranı), ama mekanizma koddan kesin. Çözüm: `orderBy: [{ predictedChurn: { sort: 'desc', nulls: 'last' } }, { lastPurchaseAt: 'asc' }]` ve ideal olarak churn görünümünde `where: { predictedChurn: { not: null } }` ile "skor yok" müşterilerini ayrı bir bilgi satırında saymak. Önem derecesi YÜKSEK'ten çok ORTA'dır (güvenlik değil, işlevsel doğruluk).

### 3. Hata yanıtları sessizce boş liste olarak gösteriliyor — **DOĞRULANDI**

- `app/dealer/customers/page.tsx:53-57`: `fetch(...).then((r) => r.json())` — `r.ok` kontrolü yok. `.catch` yalnız ağ hatası veya JSON ayrıştırma hatasında çalışır.
- API hata gövdeleri geçerli JSON: 400 (`route.ts:28-31`), 401/403 (`requireAuth`), 500 (`route.ts:98`), 503 (`responseIfDatabaseUnavailable`, `route.ts:95-96`). Bunlarda `data.customers` tanımsız olduğundan `setList([])` çalışır, toast çıkmaz.
- `page.tsx:99-102`: Boş liste "Henüz hesaplanmış müşteri verisi yok. Tüketim kaydı oluştukça günlük cron CLV üretir." metnini gösterir.
- **Yeniden üretim:** (a) Neon geçici olarak erişilemezken bayi sayfayı açar → API 503 JSON döner → kullanıcı "henüz veri yok" görür, arızayı fark etmez. (b) ADMIN rolüyle `/dealer/customers` açılırsa sayfa `dealerId` göndermediği için API 400 döner → yine "henüz veri yok". (c) İşletmeye bağlı olmayan (`dealerId` oturumda yok) bir STAFF için `getStaffDealerId` 403 döner (`lib/api-auth.ts:158-166`) → aynı boş durum.
- **Not:** Gerçek bir kullanıcı/veri etkisi var ama güvenlik değil, UX/gözlemlenebilirlik sorunu; önem ORTA. Çözüm: `if (!r.ok) throw` ile durum koduna göre ayrışmış hata durumu (403 → "Bu görünüme erişiminiz yok", 503 → "Geçici bağlantı sorunu, tekrar dene" düğmesiyle), API'nin `note` alanını boş durumda göstermek ve boş/hata/yükleniyor durumlarını ayrı bileşenlere bölmek. Ayrıca `sort` hızlı değiştirildiğinde eski isteğin yeni sonucu ezmemesi için `AbortController` eklenmeli (ilgili ama ayrı bir yarış durumu).
