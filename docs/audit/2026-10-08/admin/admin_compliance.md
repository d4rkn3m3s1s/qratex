# /admin/compliance

**Amaç:** Qratex platform operatörü için “KVKK & 5651 Uyum Merkezi”. Tek sayfada uyum KPI’ları (kullanıcı sayısı, denetim logu hacmi, IP kapsamı, çözülmemiş şüpheli olay), veri sahibi başvuru (DSR) kuyruğu, KVKK veri envanteri, birleşik güvenlik log akışı (AuditLog + CardAuditLog + SuspiciousActivity, IP maskeli), hukuki kontrol listesi ve uyum notları gösteriliyor.

**Genel puan:** 4.2 / 10 · **Karar:** yeniden tasarla. Sayfa bir “uyum merkezi” olarak var olmayı hak ediyor. Ancak bugünkü hâli, `/admin/privacy-requests` sayfasının yeteneksiz bir kopyası olan DSR kuyruğunu, `/admin/audit` sayfasıyla örtüşen ve yalnızca son 25 satırı gösteren bir log akışını ve sabit kodlu, gerçekle uyuşmayan bir “envanteri” bir araya getiriyor. Bunun yerine ölçülen ve eyleme dönüşen bir uyum kokpitine dönüştürülmeli.

> Kapsam: `app/admin/compliance/page.tsx` (427 satır, tek dosya, `'use client'`), `app/admin/layout.tsx`, `components/admin/admin-premium-hero.tsx`, `lib/admin-toast.ts`, `lib/request-metadata.ts`, `lib/gdpr-core.ts`, `lib/innovation-config.ts`, `lib/analytics-event-retention.ts`. API tarafında `app/api/admin/compliance/overview/route.ts`, `app/api/admin/compliance/logs/route.ts`, `app/api/admin/privacy-requests/route.ts`, `app/api/admin/privacy-requests/[id]/route.ts` ve `app/api/customer/privacy-request/route.ts` okundu. Prisma tarafında `DataSubjectRequest`, `AuditLog`, `CardAuditLog` ve `SuspiciousActivity` modelleri incelendi. Kod çalıştırılmadı; bulguların hepsi statik okumaya dayanıyor. Çalışma zamanına bağlı olanlar “doğrulanmadı” diye işaretlendi.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | KPI’lar ve maskeli log akışı çalışıyor. DSR kuyruğu ise talebi yürütmeden “Tamamlandı” yaptırıyor; envanter ve kontrol listesi statik. Log akışında sayfalama, tarih ve aksiyon filtresi yok, bu yetenekler API’de var ama UI’ya bağlanmamış. |
| UX | 4/10 | Altı kart alt alta, öncelik sırası yok. Durum ve tür değerleri ham İngilizce kodlarla gösteriliyor. Overview yüklenemezse sayfanın gövdesi tamamen kayboluyor. Sayaçlar yanıltıcı. |
| Görsel | 5/10 | Hero ve shadcn kartları tutarlı ama “madde işaretli düz metin” blokları, renksiz önem rozetleri ve yoğun tablo nedeniyle kıyas ürünlerin (Stripe/Linear) gerisinde kalıyor. |
| Mimari | 4/10 | 427 satırlık tek client bileşeni. DSR mantığı `/admin/privacy-requests` ile kopya. Hukuki envanter API içine sabit kodlanmış. Kaynak değişiminde yarış koşulu var ve aksiyonlar denetim izi bırakmıyor. |
| Performans | 5/10 | Overview, Redis’te 60 sn önbelleğe alınıyor (iyi). Log ucu ise 25 satır göstermek için 4×300 satır çekip bellekte birleştiriyor. Kaynak değiştikçe overview de yeniden çağrılıyor. |
| Erişilebilirlik + Mobil | 4/10 | Tablolar `overflow-x-auto` içinde. Filtre butonlarında `aria-pressed` yok, arama kutusunun etiketi yok, tablolarda `caption`/`scope` yok. Mobilde 8 sütunlu log tablosu yatay kaydırmaya mahkûm. İskelet (skeleton) yüklemesi yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Hero başlık (“KVKK & 5651 Uyum Merkezi”) | ÇALIŞIYOR | `page.tsx:163-167`, `admin-premium-hero.tsx:9,35-37` | `useReducedMotion` ve `motion-reduce` destekleniyor. |
| 2 | Yetki: yalnızca ADMIN (tüm API uçlarında) | ÇALIŞIYOR | `overview/route.ts:51`, `logs/route.ts:34`, `privacy-requests/route.ts:9`, `[id]/route.ts:18,61` | Uçlar `requireAuth(['ADMIN'])` ile korunuyor. Rol içi ince yetki (ör. yalnızca DPO) yok. |
| 3 | Log araması (metin kutusu) | KISMİ | `page.tsx:172-177`, `144-152` | Yalnızca o an yüklü 25 satırı istemcide süzüyor; sunucuda arama yapılmıyor. |
| 4 | Genel “Yenile” butonu | KISMİ | `page.tsx:179-182`, `overview/route.ts:58-59` | Overview Redis’ten 60 sn boyunca aynı veriyi döner; buton önbelleği atlatmaz. |
| 5 | Satır içi hata metni (`role="alert"`) | KISMİ | `page.tsx:183-187`, `103-109` | Overview hatasında `overview` null kalır ve tüm gövde (`206`) render edilmez. Kullanıcı yalnızca tek satırlık hata görür. |
| 6 | Kaynak filtresi: Tüm Loglar | BOZUK | `page.tsx:188-203`, `138-142`, `logs/route.ts:113-133,205` | API “all” isteğine `RUNTIME_GUARD` kayıtlarını da ekler. UI’daki `sourceLabelMap` bu kaynağı tanımadığı için rozet boş kalır ve arama metnine “undefined” girer. |
| 7 | Kaynak filtresi: Denetim | ÇALIŞIYOR | `page.tsx:188-203`, `logs/route.ts:57` | |
| 8 | Kaynak filtresi: Kart Denetimi | ÇALIŞIYOR | `logs/route.ts:76` | |
| 9 | Kaynak filtresi: Şüpheli Olaylar | ÇALIŞIYOR | `logs/route.ts:94` | |
| 10 | Kaynak filtresi: Runtime guard (modül/menü engeli) | EKSİK | `logs/route.ts:113` | API `source=runtime` değerini destekliyor, UI’da buton yok. |
| 11 | Kaynak değişiminde yeniden yükleme | BOZUK | `page.tsx:134-136`, `93-118` | `AbortController` ve istek sırası kontrolü yok. Hızlı tıklamada geç gelen eski yanıt yeni filtrenin üstüne yazılır (yarış koşulu). |
| 12 | KPI: Kayıtlı Kullanıcılar | ÇALIŞIYOR | `page.tsx:209-217`, `overview/route.ts:77` | `toLocaleString()` locale verilmeden çağrılıyor (`216`). |
| 13 | KPI: Denetim Logları | ÇALIŞIYOR | `page.tsx:218-226` | |
| 14 | KPI: Denetim IP Kapsamı + iyi/orta/düşük rozeti | ÇALIŞIYOR (ölçtüğü şey sistemik açık) | `page.tsx:154-159,227-248`, `overview/route.ts:81,90` | Hesap doğru. Ancak AuditLog yazımlarının neredeyse hiçbiri IP kaydetmiyor (Bulgu B3), dolayısıyla değer düşük çıkacaktır. Canlı değer doğrulanmadı. |
| 15 | KPI: Çözülmemiş Şüpheli Olay | ÇALIŞIYOR | `page.tsx:249-257`, `overview/route.ts:85` | İlgili listeye bağlantı yok, tıklanamaz. |
| 16 | Overview’dan gelen ama gösterilmeyen alanlar (totalFeedbacks, totalConsumptions, activeSuspiciousLast30d, withUserAgentPercent, cardAuditCoverage, note) | EKSİK (ölü veri) | `overview/route.ts:78-79,82-84,86,113`; `page.tsx` bunları kullanmıyor | Ana panel (`admin-dashboard-client.tsx:606-612`) bu alanları gösteriyor; uyum sayfası daha az gösteriyor. |
| 17 | DSR kuyruğu kartı (`#kvkk-queue`) | KISMİ | `page.tsx:260-318` | `overview &&` bloğunun içinde olduğu için overview hatasında kuyruk da kaybolur. Son 100 kaydı gösterir (`privacy-requests/route.ts:14`). |
| 18 | `#kvkk-queue` derin bağlantısı (Inovasyon sayfasından) | BOZUK (doğrulanmadı) | `innovation/page.tsx:210`, `page.tsx:206,260` | Kart, asenkron veri geldikten sonra DOM’a ekleniyor. İlk boyamada hedef yok, bu yüzden hash kaydırması büyük olasılıkla çalışmaz. |
| 19 | DSR kuyruğu “Yenile” | ÇALIŞIYOR | `page.tsx:264-266`, `79-91` | |
| 20 | DSR açıklama metni (“Başvurular POST /api/customer/privacy-request ile alınır”) | SAHTE / yanıltıcı | `page.tsx:270-273` | Hiçbir müşteri UI’ı bu ucu çağırmıyor; tek referans bu açıklama metni. Müşteri ayarları doğrudan `/api/user/data-export` ve `/api/user/delete-account` uçlarına gidiyor (`components/settings/privacy-security.tsx:111,131`). Kuyruk pratikte boş kalır. |
| 21 | DSR tablo: Tür sütunu | KISMİ | `page.tsx:295` | Ham kod gösteriliyor (`access`/`deletion`). `/admin/privacy-requests` sayfasında TR etiketler var (`privacy-requests/page.tsx:25-29`). |
| 22 | DSR tablo: Durum rozeti | KISMİ | `page.tsx:298` | Ham `received`/`in_review` gösteriliyor; renk yok. |
| 23 | DSR tablo: Makbuz ve Tarih | ÇALIŞIYOR | `page.tsx:300-303` | `toLocaleString()` locale verilmeden çağrılıyor; log tablosu ise `tr-TR` kullanıyor (`388`). |
| 24 | DSR mesajı (başvuru metni) | EKSİK | `page.tsx:293-312` | `message` alanı API’den geliyor ama gösterilmiyor. |
| 25 | DSR SLA (KVKK m.13: 30 gün) ve kalan süre | EKSİK | — | Talebin ne kadar süredir beklediği görünmüyor. |
| 26 | Buton: “İncelemede” | KISMİ | `page.tsx:305-307`, `[id]/route.ts:10-12,35-44` | Her durumda görünüyor; tamamlanmış talebi yeniden açar ve `processedAt` eski değerinde kalır. Busy/disable durumu yok. |
| 27 | Buton: “Tamamlandı” | BOZUK (süreç açısından) | `page.tsx:308-310` | Silme veya erişim talebini **yürütmeden** kapatıyor. Onay penceresi yok, denetim izi yok (Bulgu B1). |
| 28 | Buton: “Reddet” | EKSİK | — | API `rejected` durumunu destekliyor (`[id]/route.ts:11`), buton yalnızca diğer sayfada var. |
| 29 | Veri paketi indirme / Anonimleştirme | EKSİK | `[id]/route.ts:57-118` | Bu sayfada yok; yalnızca `/admin/privacy-requests` sayfasında var. |
| 30 | DSR yükleniyor ve boş durum | ÇALIŞIYOR | `page.tsx:286-291` | |
| 31 | DSR hata durumu | KISMİ | `page.tsx:84-88` | API hatası “Kayıt yok” olarak maskeleniyor; operatör kuyruğun boş olduğunu sanır. |
| 32 | KVKK Veri Envanteri | SAHTE (statik) | `overview/route.ts:9-42`, `page.tsx:320-338` | Sabit kodlanmış 4 kategori. Gerçek şemayla ve gerçek saklama uygulamasıyla uyuşmuyor (Bulgu B5). Düzenlenemez, sürümlenmez. |
| 33 | 5651 log akışı tablosu | KISMİ | `page.tsx:340-396`, `99` | Yalnızca en yeni 25 satır gösteriliyor. Sayfalama, tarih aralığı ve aksiyon filtresi yok; API bunları destekliyor (`logs/route.ts:38-43`). |
| 34 | IP maskeleme | ÇALIŞIYOR | `logs/route.ts:221-224`, `request-metadata.ts:35-47` | IPv4 için `a.b.*.*`, IPv6 için ilk iki blok gösteriliyor. |
| 35 | Maskesiz IP parametresi `includeSensitive=true` | KISMİ (güvenlik) | `logs/route.ts:44,223` | UI kullanmıyor; her ADMIN ham IP alabilir ve bu erişim loglanmıyor (Bulgu B6). |
| 36 | Kullanıcı sütunu (ad ve e-posta) | ÇALIŞIYOR | `page.tsx:377-380`, `logs/route.ts:144-151` | N+1 yok, toplu `findMany` kullanılıyor. |
| 37 | Tarayıcı (UA) sütunu: kısaltma ve `title` | ÇALIŞIYOR | `page.tsx:382-384` | |
| 38 | Önem rozeti | KISMİ | `page.tsx:385-387` | Tek renk `outline`. LOW ile CRITICAL görsel olarak ayırt edilemiyor; RUNTIME_GUARD satırlarında “önem” alanına `reason` yazılıyor (`logs/route.ts:214`). |
| 39 | Zaman sütunu | ÇALIŞIYOR | `page.tsx:388` | Mutlak zaman; göreli zaman yok. |
| 40 | “Toplam gösterilen kayıt” sayacı | KISMİ | `page.tsx:346` | Yalnızca filtrelenmiş 25’lik dilimin sayısı. API’nin `pagination.total` değeri kullanılmıyor. |
| 41 | Log boş durumu (“Henüz log yok.”) | KISMİ | `page.tsx:363-368` | Arama sonucu boş olduğunda da “Henüz log yok” diyor; yanıltıcı. |
| 42 | Log satır detayı (oldData/newData, entityId) | EKSİK | `logs/route.ts:65-73` | `entityId` ve diff seçilmiyor. Olay incelemesi yapılamıyor. |
| 43 | Log dışa aktarma (CSV/JSON, imzalı) | EKSİK | — | 5651 veya mahkeme talebinde kanıt üretilemiyor. |
| 44 | Hukuki Kontrol Listesi | SAHTE (statik) | `overview/route.ts:116-121`, `page.tsx:398-409` | Dört satır düz metin. İşaretlenemiyor, sorumlu ve tarih yok. |
| 45 | Detaylı Uyum Notları | SAHTE (statik) | `page.tsx:411-421` | JSX içine gömülü sabit metin. |
| 46 | Sayfa ilk yükleme durumu | KISMİ | `page.tsx:72,206` | İskelet yok. Veri gelene kadar yalnızca hero ve araç çubuğu görünüyor. Route seviyesindeki `app/admin/loading.tsx` client fetch sürecini kapsamıyor. |
| 47 | Mobil davranış | KISMİ | `page.tsx:169,208,269,348` | Filtre çubuğu sarılıyor, KPI ızgarası tek sütuna düşüyor. Tablolarda kart görünümü yok. |
| 48 | Erişilebilirlik: filtre durumu, arama etiketi, tablo semantiği | EKSİK | `page.tsx:172-177,189-194,274-283,349-360` | `aria-pressed` yok, `<label>` / `aria-label` yok, `<caption>` ve `scope` yok. |

**Durum sayımı (48 özellik):** ÇALIŞIYOR 16 · KISMİ 15 · BOZUK 4 · SAHTE 4 · EKSİK 9. Sayımda 14 numaralı satır ÇALIŞIYOR, 35 numaralı satır KISMİ olarak sayıldı.

---

## Bulgular (önem sırasıyla)

### B1. Kritik · Uyum/Veri bütünlüğü · DSR “Tamamlandı” talebi yürütmeden kapatıyor ve hiçbir DSR aksiyonu denetim izi bırakmıyor
- **Kanıt:** `page.tsx:308-310` → `PATCH /api/admin/privacy-requests/[id]`. `[id]/route.ts:35-46` yalnızca `status` ve `processedAt` güncelliyor; `auditLog.create` çağrısı yok. Dışa aktarma (`[id]/route.ts:85-91`) de loglanmıyor. Anonimleştirme logu (`lib/gdpr-core.ts:162-170`) `userId` olarak **veri sahibini** yazıyor; işlemi yapan admin kaydedilmiyor. Kardeş sayfa ise “Tüm işlemler denetim günlüğüne yazılır” diyor (`privacy-requests/page.tsx:133-134`); bu iddia yanlış.
- **Sorun:** Bir silme talebi tek tıkla, onay sorulmadan, veri anonimleştirilmeden “completed” yapılabiliyor. Ardından kim, ne zaman, neden kapattı sorusunun cevabı yok. KVKK m.13 kapsamındaki bir denetimde ya da veri sahibinin şikâyetinde bu durum ispat edilemez. Ayrıca bir adminin herhangi bir kullanıcının tam kişisel veri paketini indirmesi iz bırakmıyor; bu bir iç tehdit vektörü.
- **Öneri:** DSR’yi bir **durum makinesi** olarak modelleyin: `received → in_review → (executed) → completed | rejected`. `completed` durumuna yalnızca tür bazlı yürütme kanıtı varsa geçilsin: silme talebinde `anonymizeUser` başarıyla çalışmış olmalı, erişim talebinde export üretilmiş ve teslim edilmiş olmalı. `rejected` için gerekçe metni zorunlu olsun. `PATCH` ve `POST` uçlarına ortak bir `recordDsrEvent(actorId, requestId, from, to, reason, ip, ua)` yardımcısı ekleyin ve bunu `AuditLog`’a (`entity='DataSubjectRequest'`, `userId = admin`, `newData` içinde `subjectUserId`) yazın. Geri dönüşü olmayan adımlar için tipli onay diyaloğu kullanın (veri sahibinin e-postasını yazdırın). Aynı uçta optimistic concurrency için `where: { id, status: expected }` kullanın.
- **Efor:** M

### B2. Yüksek · Mimari/Ürün · DSR kuyruğu iki sayfada kopya; uyum sayfasındaki kopya yetersiz ve kuyruğu besleyen giriş kanalı yok
- **Kanıt:** `page.tsx:260-318` ile `app/admin/privacy-requests/page.tsx:45-215` aynı uçları kullanıyor, ancak uyum sayfasında etiketler, Reddet, Export, Anonimleştir, mesaj ve busy durumu yok. Sidebar her iki sayfayı ayrı ayrı listeliyor (`components/dashboard/sidebar.tsx:207-208`). `POST /api/customer/privacy-request` ucunu çağıran hiçbir müşteri UI’ı yok (repo genelinde aranınca yalnızca `page.tsx:271` bulunuyor). Müşteri ayarları doğrudan `/api/user/data-export` ve `/api/user/delete-account` uçlarına gidiyor (`components/settings/privacy-security.tsx:111,131`); bu uçlar `DataSubjectRequest` kaydı oluşturmuyor.
- **Sorun:** Operatör iki ekranda iki farklı yetenek seti görüyor. Asıl önemlisi, kuyruk pratikte boş kalıyor: müşterilerin self-servis silme ve export işlemleri kayıt altına alınmadan doğrudan yürütülüyor. Uyum sayfası “talep kuyruğu” gösteriyor ama gerçek talepler orada görünmüyor.
- **Öneri:** (1) Tek DSR yüzeyi kalsın: `/admin/privacy-requests` kanonik sayfa olsun. Uyum merkezinde yalnızca “açık talep / SLA’sı yaklaşan / gecikmiş” özet kartı ve derin bağlantı bulunsun. (2) Müşteri tarafındaki `data-export` ve `delete-account` akışları da bir `DataSubjectRequest` kaydı (`channel='self_service'`, `status='completed'`) üretsin. Böylece KVKK raporu tüm hak kullanımlarını kapsar. (3) Silme veya erişim için ayrı bir müşteri formu isteniyorsa (ör. düzeltme talebi) `privacy-security.tsx` içine “Düzeltme talebi gönder” formu eklenip mevcut uç bağlansın.
- **Efor:** M

### B3. Yüksek · Uyum/Veri · “Denetim IP Kapsamı” KPI’ı sistemik bir açığı ölçüyor: AuditLog yazımlarının neredeyse hiçbiri IP veya User-Agent kaydetmiyor
- **Kanıt:** Repo genelinde 88 `auditLog.create` çağrısı var (`grep`). Bunlardan yalnızca `app/api/admin/cards/generate/route.ts:101-102` `ipAddress`/`userAgent` yazıyor (`cards/[id]/route.ts:144,230` satırları ise `CardAuditLog` yazımı). Örnekler: `app/api/customer/privacy-request/route.ts:65-73`, `lib/gdpr-core.ts:162-170`. Ortak bir audit yardımcısı yok.
- **Sorun:** Sayfa “5651 log bütünlüğü” iddia ediyor ve IP kapsamını iyi/orta/düşük diye derecelendiriyor, ama veri üretim tarafı bu alanları doldurmuyor. KPI büyük olasılıkla kalıcı olarak “düşük” gösteriyor (canlı değer doğrulanmadı). Ayrıca IP yazılan tek yerde ham `x-forwarded-for` saklanıyor; bu başlık virgüllü bir zincir olabilir.
- **Öneri:** `lib/audit.ts` içinde `writeAudit({ actorId, action, entity, entityId, before, after, request })` yardımcısı oluşturun. IP’yi `getClientIp(request)` ile (Vercel `x-real-ip` veya XFF’nin ilk değeri) normalize edin; UA’yı 512 karakterle sınırlayın. 88 çağrı noktasını bu yardımcıya kodemod ile taşıyın. Uyum sayfasındaki KPI’ya “son 7 günde IP’siz yazılan audit’ler – en çok üreten ilk 5 aksiyon” kırılımı ekleyin; ekip neyi düzelteceğini bu listeden görür.
- **Efor:** L

### B4. Yüksek · Veri bütünlüğü · Kullanıcı silindiğinde denetim izi de siliniyor (Cascade)
- **Kanıt:** `prisma/schema.prisma` içinde `AuditLog.user` ilişkisi `onDelete: Cascade` olarak tanımlı (model AuditLog). Hard delete yolları: `app/api/user/delete-account/route.ts:39`, `app/api/admin/users/route.ts:676`, `app/api/admin/users/bulk/route.ts:79`.
- **Sorun:** Bir kullanıcı hesabını sildiğinde veya admin toplu silme yaptığında, o kullanıcının ve onun yaptığı işlemlerin tüm AuditLog kayıtları da kalıcı olarak gider. Bu, sayfanın “5651 log bütünlüğü” maddesiyle (`overview/route.ts:120`) doğrudan çelişiyor. Bir admin hesabı silinirse o adminin tüm idari işlem geçmişi yok olur.
- **Öneri:** `AuditLog.userId` alanını nullable yapın ve `onDelete: SetNull` kullanın. Bunun yanında silinmeyen bir `actorLabel`/`actorEmailHash` snapshot alanı tutun. Uzun vadede audit tablosunu append-only yapın: DB rolüyle `UPDATE`/`DELETE` yetkisini kaldırın ya da günlük hash zinciri ve R2’ye WORM arşiv kullanın. Hesap silme akışını `anonymizeUser` yoluna yönlendirin (hard delete yerine), ki bu `gdpr-core` tasarımıyla da uyumlu. Not: Şema değişikliği canlı Neon’da migration gerektirir.
- **Efor:** M

### B5. Yüksek · Doğruluk · “KVKK Veri Envanteri” sabit kodlu ve gerçek uygulamayla çelişiyor
- **Kanıt:** `overview/route.ts:9-42`. “Davranış ve oyunlaştırma” kategorisinde `AnalyticsEvent` için saklama süresi “24 ay” yazıyor; oysa Inngest işi bu kayıtları 90 günde siliyor (`lib/analytics-event-retention.ts:9`, `app/api/internal/inngest/analytics-event-cleanup/route.ts:16`). Yapılandırmadaki `retentionDaysPersonalData: 730` (`lib/innovation-config.ts:75`) değeri hiçbir silme işleminde kullanılmıyor; yalnızca gösteriliyor (`innovation/page.tsx:206`). Envanter `phone`, `address`, `latitude/longitude`, `businessName` gibi `User` alanlarını, kartı ve tüketimi atlıyor; `gdpr-core.ts:28-38,124-139` bu alanları kişisel veri olarak ele alıyor.
- **Sorun:** Operatöre ve olası bir denetçiye yanlış bilgi veren bir “resmî” envanter, hiç envanter olmamasından daha risklidir. Konum verisi gibi özel nitelikli olmaya yakın alanlar envanterde görünmüyor.
- **Öneri:** Envanteri koddan çıkarıp **veri olarak** yönetin. Bir `DataInventoryItem` tablosu (veya `SystemSetting` JSON’u) oluşturun: kategori, model, alanlar, amaç, hukuki dayanak, saklama günü, imha yöntemi, sorumlu, son gözden geçirme tarihi. Admin bunu düzenleyebilsin ve değişiklikler sürümlensin. Bir “drift” kontrolü ekleyin: Prisma DMMF’ten (`Prisma.dmmf`) kişisel veri işaretli alanları (`/// @pii` yorumu) okuyup envanterde karşılığı olmayanları uyarı olarak gösterin. Saklama sütunu, ilgili cron’un gerçek değerinden (`DEFAULT_RETENTION_DAYS`) okunsun.
- **Efor:** L

### B6. Orta · Güvenlik · Maskesiz IP’ye denetimsiz erişim (`includeSensitive=true`)
- **Kanıt:** `logs/route.ts:44,221-224`. Sayfa başlığı “IP Maskeleme Açık” diyor (`page.tsx:342`).
- **Sorun:** Herhangi bir ADMIN oturumu URL’ye bir parametre ekleyerek ham IP’leri alabiliyor ve bu erişim hiçbir yere yazılmıyor. KVKK’daki veri minimizasyonu ilkesi ve “erişim kayıtları düzenli denetlenmelidir” notu (`page.tsx:419`) bununla çelişiyor.
- **Öneri:** Maskesiz görünüm açık bir “gerekçe ile aç” akışına bağlansın: gerekçe metni zorunlu olsun, süre sınırlı olsun (ör. 15 dk imzalı token), her açılış `AuditLog`’a (`action='pii_unmask'`) yazılsın ve uyum sayfasında “PII erişimleri” sekmesinde listelensin. Mümkünse yalnızca `SUPER_ADMIN`/DPO kapsamına açılsın.
- **Efor:** S

### B7. Orta · Doğruluk · “Tüm Loglar” görünümünde RUNTIME_GUARD satırları etiketsiz ve aramayı kirletiyor
- **Kanıt:** API’de `source === 'all'` olduğunda `analyticsEvent` sorgulanıyor ve `source: 'RUNTIME_GUARD'` dönüyor (`logs/route.ts:113,205`). UI tipi bu değeri tanımıyor (`page.tsx:45`, `138-142`). Rozet `{sourceLabelMap[log.source]}` ifadesinden boş geliyor (`373`). Arama dizesine `"undefined"` ekleniyor (`148`). “Önem” sütunu bu satırlarda `reason` değerini gösteriyor (`logs/route.ts:214`).
- **Sorun:** Operatör kaynağı belirsiz satırlar görüyor. “undefined” araması bu satırları eşliyor. Bu kayıtlar 90 günde silinen bir tablodan geliyor (B5), dolayısıyla 5651 akışında kalıcı log gibi sunulmaları yanıltıcı.
- **Öneri:** API ve UI arasında ortak bir `LogSource` tipi oluşturun (ör. `lib/compliance/types.ts` içinde, `as const` dizi ile). UI’ya “Erişim engeli (runtime)” filtresini ve etiketini ekleyin. RUNTIME_GUARD satırlarına “90 gün saklanır” rozeti koyun. `severity` ile `reason` ayrı alanlar olarak dönsün.
- **Efor:** S

### B8. Orta · Performans/Ölçeklenebilirlik · Log ucu 25 satır için 1200 satır çekip bellekte birleştiriyor; sayfalama göstermelik
- **Kanıt:** `logs/route.ts:64,83,101,123` (her kaynaktan `take: 300`), `217-221` (sıralama ve `slice`). UI her zaman `page=1&pageSize=25` istiyor (`page.tsx:99`). `total` en fazla 1200 olabiliyor ve gerçek toplamı yansıtmıyor.
- **Sorun:** Daha derin sayfalara erişilemiyor; 300’ün ötesindeki kayıtlar hiçbir koşulda görünmüyor. Her istekte 4 sorgu, 1200 satır ve kullanıcı lookup’ı yapılıyor. Gerçek bir “5651 log arşivi” için bu yetersiz.
- **Öneri:** Kaynaklar arası **keyset (cursor) sayfalama** kullanın: istemci `before=<createdAt,id>` gönderir, her kaynaktan `take: pageSize+1` alınır, birleştirilip kesilir ve bir sonraki cursor döner. Böylece sorgu başına en fazla 4×(n+1) satır okunur. Arama sunucuya taşınsın (`action`, `entity`, `userEmail` → `userId` çözümü). Uzun vadede tek bir `unified_security_log` view’ı veya materialized view düşünülebilir. UI tarafında “Daha fazla yükle” ya da sanal liste kullanılsın.
- **Efor:** M

### B9. Orta · Hata yönetimi/UX · Overview hatasında tüm sayfa gövdesi kayboluyor; DSR hatası “Kayıt yok” diye maskeleniyor
- **Kanıt:** `page.tsx:206` (`{overview && (...)}` bloğu DSR, log ve envanteri birlikte sarıyor), `84-88` (DSR hatası `setPrivacyRows([])` ile boş listeye dönüşüyor).
- **Sorun:** Overview 10 COUNT sorgusu yapıyor (`overview/route.ts:76-87`). Bunlardan biri zaman aşımına uğrarsa log akışı ve DSR kuyruğu da görünmez olur, oysa bunlar ayrı uçlardan başarıyla gelmiş olabilir. DSR ucu 500 dönerse operatör “Kayıt yok” görür ve bekleyen yasal talepleri kaçırır.
- **Öneri:** Her bölümü bağımsız bir veri birimi yapın. Önerilen yapı: bölüm başına `useSWR` (veya React Query), bölüm başına iskelet, bölüm başına hata kartı ve “tekrar dene” butonu. DSR için hata durumu açıkça “Kuyruk yüklenemedi” desin.
- **Efor:** S

### B10. Orta · Yarış koşulu · Kaynak filtresi hızlı değiştirildiğinde eski yanıt yenisinin üstüne yazılıyor
- **Kanıt:** `page.tsx:134-136` (`source` değiştikçe `fetchData`), `93-118` (iptal ve sıra kontrolü yok).
- **Sorun:** “Şüpheli Olaylar” seçili görünürken “Tüm Loglar” verisi listelenebilir. Ayrıca her filtre değişikliği overview ve DSR’yi de yeniden çağırıyor (`97-100,110`).
- **Öneri:** Overview ve DSR yalnızca mount’ta ve manuel yenilemede çağrılsın. Log isteği `AbortController` ile iptal edilebilir olsun ya da SWR anahtarı `['logs', source, cursor, q]` olsun. Filtre durumu URL’ye (`?source=`) yazılsın; bu paylaşılabilir bağlantı da sağlar.
- **Efor:** S

### B11. Orta · Süreç · DSR durum geçişleri doğrulanmıyor; tamamlanmış talep yeniden açılabiliyor
- **Kanıt:** `page.tsx:305-311` (iki buton her satırda koşulsuz görünüyor), `[id]/route.ts:35-44` (geçiş kuralı yok; `in_review`’a dönüşte `processedAt` eski değerinde kalıyor).
- **Sorun:** `completed → in_review` geçişi mümkün ve tutarsız bir kayıt bırakıyor (hem incelemede hem işlenmiş görünür). Busy durumu olmadığı için çift tıklama iki PATCH isteği gönderir.
- **Öneri:** Sunucuda izinli geçiş tablosu (`ALLOWED: Record<Status, Status[]>`) tanımlayın. Geçersiz geçişe 409 dönülsün. UI’da yalnızca izinli aksiyonlar gösterilsin ve istek sürerken butonlar disable edilsin.
- **Efor:** S

### B12. Düşük · Dil/Tutarlılık · TR/EN karışıklığı ve locale tutarsızlığı
- **Kanıt:** Ham kodlar: `row.type` / `row.status` (`page.tsx:295,298`), `entity: 'Security'`, `'PhysicalCard'` (`logs/route.ts:175,190`), `severity: 'HIGH'`. Locale vermeyen `toLocaleString()` çağrıları (`page.tsx:216,301,303`) ile `tr-TR` kullanan çağrı (`388`) bir arada. API hata metni “Uyum loglari” şeklinde ı harfi olmadan yazılmış (`logs/route.ts:238`). Önbellek yorumu “11 ayrı COUNT” diyor, oysa 10 sorgu var (`overview/route.ts:54,76-87`). Sayfa başlıkları i18n sistemini (`useAppT`) kullanmıyor, kardeş sayfa `/admin/audit` kullanıyor (`audit/page.tsx:10,32`).
- **Öneri:** Etiket haritalarını tek modüle toplayın (`lib/compliance/labels.ts`) ve iki sayfa da bunu kullansın. Tarih ve sayı biçimlendirmesi ortak `formatDateTime`/`formatNumber` yardımcılarından geçsin. Metinler `messages/tr.json` / `messages/en.json` dosyalarına taşınsın (sidebar zaten `compliance` anahtarına sahip: `messages/tr.json:2510`).
- **Efor:** S

### B13. Düşük · İçerik · Operatör UI’ında geliştirici jargonu ve sahte “kontrol listesi”
- **Kanıt:** `page.tsx:271` (uç adı `POST /api/customer/privacy-request`), `398-421` (madde işaretli düz metin).
- **Öneri:** Uç adını kaldırın; yerine “Talepler müşteri ayarlarındaki Gizlilik bölümünden gelir” yazıp bağlantı verin. Kontrol listesini durumlu bir uyum kontrolüne çevirin (bkz. Yeniden tasarım vizyonu).
- **Efor:** S

### B14. Düşük · Erişilebilirlik · Filtre, arama ve tablo semantiği eksik
- **Kanıt:** `page.tsx:172-177` (yalnızca placeholder; `aria-label` yok), `189-194` (seçili durumu sadece görsel; `aria-pressed` yok), `274-283,349-360` (`<caption>` ve `scope="col"` yok), `236-246` (rozet bilgisi yalnızca renk ve kısa kelimeyle veriliyor).
- **Öneri:** Kaynak filtresini shadcn `ToggleGroup` (`type="single"`, radiogroup semantiği) ile değiştirin. Aramaya görünmez etiket ekleyin. Tablolara `caption` ekleyin. Yazma yapan DSR butonlarına `aria-busy` ekleyin. Mobilde log tablosunu kart listesine dönüştürün (`md:` altında `<dl>` kartları).
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

- **Gerçek bir denetim ve olay gezgini** (Stripe “Events & logs”, PostHog “Activity”): sunucu taraflı arama, tarih aralığı, aktör/varlık facet’leri, cursor ile sonsuz kaydırma, satıra tıklayınca yan panelde `oldData → newData` diff, `entityId` derin bağlantısı ve “aynı IP/kullanıcıdan son olaylar” korelasyonu.
- **İmzalı kanıt dışa aktarma:** seçilen aralığın CSV/JSON çıktısı, SHA-256 özeti ve “kim, ne zaman dışa aktardı” kaydı. Mahkeme veya BTK talebinde kanıt paketi olarak kullanılır.
- **DSR SLA yönetimi** (Linear tarzı kuyruk): KVKK m.13’teki 30 günlük süre için kalan gün göstergesi, gecikme uyarısı, sorumlu atama, iç notlar, müşteriye sonuç e-postası (kabul/ret gerekçesi) ve kimlik doğrulama adımı.
- **Saklama ve imha politikası motoru:** her veri sınıfı için hedef saklama süresi, bunu uygulayan cron/Inngest işinin son çalışma zamanı, silinen kayıt sayısı ve başarısızlık uyarısı. Bugün yalnızca `AnalyticsEvent` için bir temizlik işi var.
- **Rıza (consent) kaydı görünümü:** aydınlatma ve açık rıza metinlerinin sürümleri, kullanıcıların hangi sürümü ne zaman onayladığı, pazarlama/konum/AI rızası oranları. Kontrol listesinin ilk maddesi bunu istiyor ama sistemde karşılığı yok.
- **Erişim incelemesi (access review):** ADMIN rolündeki hesapların listesi, son giriş, 2FA durumu, son 30 gün PII erişimi ve “yeniden onayla / rolü kaldır” aksiyonu (Retool ve Vanta tarzı periyodik inceleme).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında üç soruya beş saniyede cevap alabilmeli: “Bugün yasal risk var mı?”, “Kim neye dokundu?”, “Bekleyen yasal talep var mı?”. Sayfa bilgi panosu olmaktan çıkıp **durum bildiren ve eyleme yönlendiren** bir uyum kokpitine dönüşmeli.

**Yerleşim (sekme yapısı; URL’de `?tab=`):**
1. **Genel bakış:** Üstte 4 sağlık sinyali; her biri tıklanabilir ve “neden” açıklaması içersin:
   - DSR: açık, 7 günden az süre kalan ve gecikmiş talep sayıları.
   - Log kapsamı: IP ve UA yüzdesi + son 7 günde IP’siz yazan ilk 5 aksiyon.
   - Saklama işleri: son başarılı çalışma, silinen kayıt sayısı.
   - Çözülmemiş şüpheli olay (önem dağılımı küçük bir yığılmış çubukla).
   
   Altında “Uyum kontrolleri” listesi yer alsın. Her kontrolün otomatik bir değerlendiricisi olsun ve ✓ / uyarı / ✗ durumu üretsin: “AuditLog Cascade değil”, “retention cron son 48 saatte çalıştı”, “aydınlatma metni sürümü yayınlı”, “ADMIN hesaplarında 2FA yüzdesi”, “maskesiz IP erişimi son 30 günde X kez”. Sabit kontrol listesi böylece ölçülen bir listeye dönüşür.
2. **Olay gezgini:** Birleşik log akışı. Facet filtreleri (kaynak, önem, aktör, varlık, tarih), sunucu taraflı arama, cursor sayfalama, satır detay paneli (diff + korelasyon) ve imzalı dışa aktarma.
3. **Veri envanteri:** DB’den gelen, düzenlenebilir ve sürümlü envanter. Şema ile drift uyarısı ve her kategori için gerçek saklama işine bağlantı.
4. **Veri sahibi talepleri:** Burada ayrı bir kopya tutulmaz. Özet kart ve `/admin/privacy-requests` sayfasına bağlantı yeterli (bkz. Çakışmalar).
5. **PII erişimleri:** maskesiz IP açılışları, veri paketi indirmeleri ve anonimleştirmeler; aktör ve gerekçeyle birlikte.

**Motion / 3D:** Bu ekran hukuki ve operasyonel bir araç; 3D veya dekoratif animasyon **yersiz** olur. Önerilen ölçülü dokunuşlar:
- Sağlık kartlarında durum değiştiğinde 150 ms renk geçişi.
- Olay gezgininde yeni satırlar için `m.tr` ile 120 ms opacity girişi (global `LazyMotion` ve `m as Motion` desenine uygun).
- Detay paneli için shadcn `Sheet` kaydırması.

Tümü `useReducedMotion` ile kapatılabilir olmalı. Hero’daki “breathe” animasyonu zaten azaltılmış hareket desteğine sahip; korunabilir.

**Veri ve API değişiklikleri:**
- `GET /api/admin/compliance/health`: kontrol değerlendiricilerinin sonucunu döner; Redis’te 60 sn önbelleklenir; `?fresh=1` ile önbellek atlanabilir (Yenile butonu bunu kullanır).
- `GET /api/admin/compliance/logs`: cursor tabanlı (`before`), sunucu tarafı `q`, `actorId`, `severity[]`; yanıt `{ items, nextCursor }`. `includeSensitive` kaldırılır, yerine `POST /api/admin/compliance/unmask` (gerekçe + kısa ömürlü token + audit) gelir.
- `lib/audit.ts` içinde `writeAudit()`: IP/UA normalizasyonu ve aktör zorunluluğu; 88 çağrı noktası buna taşınır.
- Şema: `AuditLog.userId` alanı `SetNull` olur ve `actorLabel` eklenir; `DataSubjectRequest` modeline `channel`, `assigneeId`, `dueAt`, `resolutionNote` eklenir; yeni `DataInventoryItem` modeli oluşturulur. Hepsi canlı Neon’da migration gerektirir; dikkatli planlanmalı.
- İstemci tarafında 427 satırlık tek dosya, sekme başına bir bileşene bölünür (`components/admin/compliance/*`); veri bölüm başına `useSWR` ile çekilir.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/privacy-requests`:** DSR kuyruğu doğrudan kopya ve kanonik sürüm o sayfa. Uyum sayfasındaki tablo kaldırılmalı, yerine özet kart ve derin bağlantı konmalı. `innovation/page.tsx:210` içindeki `#kvkk-queue` bağlantısı `/admin/privacy-requests` adresine çevrilmeli. Sidebar’da iki ayrı “Shield” girdisi (`sidebar.tsx:207-208`) tek bir “Uyum” grubu altında toplanmalı.
- **`/admin/audit`:** Yalnızca AuditLog’u gösteriyor ama filtre, sayfalama ve diff (`oldData`/`newData`) sunuyor (`audit/page.tsx:20-29,43-61`). Uyum sayfasının log akışı ise birden fazla kaynağı gösteriyor ama sığ. Önerilen yol, ikisini tek bir “Olay gezgini” bileşeninde birleştirmek: `/admin/audit` sayfası uyum merkezinin “Olay gezgini” sekmesine yönlendirsin (ya da aynı bileşeni `source=audit` ön filtresiyle göstersin).
- **`/admin/trust-command`:** Şüpheli olay ve son audit özetlerini zaten gösteriyor ve uyum sayfasına bağlantı veriyor (`trust-command/page.tsx:193-203`). Rol ayrımı netleşmeli: Trust Command güvenlik ve dolandırıcılık operasyonu (gerçek zamanlı), Uyum Merkezi yasal yükümlülük ve kanıt (KVKK/5651). Şüpheli olayların çözümü Trust Command veya `/admin/fraud-prevention` üzerinden yapılmalı; uyum sayfası yalnızca sayıyı ve bağlantıyı gösterir.
- **Ana admin paneli:** `admin-dashboard-client.tsx:84,597-612` aynı overview ucunu kullanıyor ve uyum sayfasının kendisinden **daha fazla** alan gösteriyor (UA kapsamı, kart denetim kapsamı, son 30 gün şüpheli olay). Overview sözleşmesi tek tip tanımlanmalı (`lib/compliance/types.ts`) ve uyum sayfası bu verinin tamamını kullanmalı.
- **`/admin/innovation` uyum bölümü:** `retentionDaysPersonalData` ve iletişim e-postası orada düzenleniyor (`innovation/page.tsx:206`; varsayılan `kvkk@example.com`, `lib/innovation-config.ts:76`). Bu ayarlar uyum merkezinin “Politika” bölümüne taşınmalı ve gerçek imha işine bağlanmalı.

---

## Doğrulama (şüpheci inceleme)

Salt okunur inceleme; kod, veritabanı, build veya test çalıştırılmadı. Her iddia çağıran/çağrılan taraflar ve Prisma şeması üzerinden yeniden okundu.

### 1. DSR talepleri yürütülmeden "completed" yapılabiliyor ve DSR durum değişiklikleri ile veri paketi dışa aktarımı denetim izi bırakmıyor — **DOĞRULANDI**

- `app/admin/compliance/page.tsx:308-310`: "Tamamlandı" butonu onay sormadan `setPrivacyStatus(row.id, 'completed')` çağırıyor (`:120-132`). Talep türü (deletion/access) ya da yürütülüp yürütülmediği kontrol edilmiyor.
- `app/api/admin/privacy-requests/[id]/route.ts:35-44`: PATCH, durum ne olursa olsun `status` ve `processedAt` yazıyor; `auditLog.create` yok, işlemi yapan admin hiçbir yerde saklanmıyor (`DataSubjectRequest` üzerinde `processedBy` benzeri alan da yok).
- Aynı dosya `:85-91`: `action=export` kullanıcının tam veri paketini döndürüyor; audit kaydı yok.
- `lib/gdpr-core.ts:162-170`: anonimleştirme logunda `userId` veri sahibinin kendisi; işlemi yapan admin kaydedilmiyor, IP/UA da yok.
- `app/admin/privacy-requests/page.tsx:133-134` "Tüm işlemler denetim günlüğüne yazılır" diyor; bu, koda göre yanlış.

**Yeniden üretim:** Bir müşteri silme talebi (`type: deletion`) oluşturur. Herhangi bir ADMIN `/admin/compliance` sayfasında "Tamamlandı"ya basar. Talep `completed` ve `processedAt` dolu görünür, ama kullanıcı anonimleştirilmemiştir ve AuditLog'da bu durum değişikliğine ait tek satır yoktur. Ayrıca bir admin `POST /api/admin/privacy-requests/{id}?action=export` ile herhangi bir talebe bağlı kullanıcının tüm kişisel verisini indirebilir; bu da iz bırakmaz.

**Not:** `/admin/privacy-requests` sayfasındaki ayrı "Tamamlandı" butonu (`page.tsx:200-201`) da aynı PATCH ucunu kullanıyor; sorun yalnızca uyum sayfasına özgü değil, uca özgü. Düzeltme sunucu tarafında yapılmalı: deletion türünde `completed` geçişi ancak `anonymize` başarıyla çalıştıysa (ya da zorunlu bir `resolutionNote` ile) kabul edilmeli; PATCH, export ve anonymize işlemlerinin her biri aktör admin id'si ve `getAuditRequestMeta(request)` ile AuditLog'a yazılmalı.

### 2. AuditLog `onDelete: Cascade` nedeniyle kullanıcı (admin dahil) silindiğinde denetim izi yok oluyor — **DOĞRULANDI**

- `prisma/schema.prisma:1118`: `user User @relation(fields: [userId], references: [id], onDelete: Cascade)`, `userId String` (zorunlu). Karşılaştırma için `CardAuditLog` `onDelete: SetNull` kullanıyor (`schema.prisma:1649`); yani doğru desen projede zaten var.
- Hard delete yolları: `app/api/admin/users/route.ts:676` (tekil), `app/api/admin/users/bulk/route.ts:79` (toplu), `app/api/user/delete-account/route.ts:39` (müşterinin kendi hesabı). Admin silme uçları hedefin rolünü kontrol etmiyor; yalnızca kendini silmeyi engelliyor (`users/route.ts:662`, `bulk/route.ts:73-76`).

**Yeniden üretim:** Admin A, `DELETE /api/admin/users?id=<adminB>` çağırır. B'nin yaptığı tüm idari işlemlerin AuditLog satırları (kupon, ayar, rol değişiklikleri vb.) cascade ile silinir. Geriye yalnızca A'nın yazdığı tek "delete user" satırı kalır. Aynı şekilde müşteri kendi hesabını sildiğinde kendi `data_subject_request` kanıt satırı da (`customer/privacy-request/route.ts:65-73`) silinir; KVKK başvurusunun alındığına dair ispat kaybolur.

**Not:** Silme sonrasında yazılan "delete" logu sorunu çözmez; silinen kişinin geçmiş işlemleri geri gelmez. Çözüm: `userId String?` + `onDelete: SetNull` ve silme anında doldurulan bir `actorLabel` (e-posta/rol özeti). Canlı Neon'da migration gerektirir.

### 3. AuditLog yazımlarının neredeyse tamamı IP ve User-Agent kaydetmiyor — **ÇÜRÜTÜLDÜ** (abartılı; dar bir alt küme için geçerli)

- `lib/request-metadata.ts:28` içindeki `getAuditRequestMeta()` 52 dosyada import ediliyor ve 130 yerde kullanılıyor (`auditMeta` ya da `...getAuditRequestMeta(request)` spread). Örnekler: `app/api/admin/users/bulk/route.ts:61,87`, `app/api/admin/coupons/route.ts:86,115`, `app/api/admin/features/route.ts:60,120,189,239`, `app/api/admin/api-keys/route.ts:73,107`.
- Denetçinin "yalnızca `cards/generate` IP yazıyor" tespiti, grep'in sadece literal `ipAddress:` aradığını, spread desenini kaçırdığını gösteriyor.
- `auditLog.create` içeren dosyalardan IP/UA meta'sı **hiç** geçmeyenler yalnızca şunlar: `app/api/admin/settings/modules/route.ts`, `app/api/admin/team/autotask/route.ts`, `app/api/admin/users/[id]/plan/route.ts`, `app/api/customer/privacy-request/route.ts`, `lib/achievements.ts`, `lib/billing-core.ts`, `lib/gdpr-core.ts`. Bunlardan uyum açısından önemli olanlar `privacy-request` ve `gdpr-core`; ilgili eksiklik 1. maddeye dahil edildi.

"Neredeyse tamamı" iddiası koda göre yanlış. IP kapsamı KPI'ının canlı değeri doğrulanmadı (DB'ye dokunulmadı). Ancak düşük çıkıyorsa nedeni çoğunlukla IP'siz yazan ödül/oyunlaştırma yollarıdır (`lib/achievements.ts` vb.); bu yollar sunucu içi olaylardır ve 5651 kapsamındaki idari erişim kaydı sayılmaz. Bu nedenle KPI'ın paydası "idari işlemler" ile sınırlandırılmalı.

### 4. `includeSensitive=true` ile her ADMIN ham IP'leri denetimsiz alabiliyor — **ÇÜRÜTÜLDÜ** (KRİTİK/YÜKSEK olarak; düşük öncelikli sertleştirme notu olarak geçerli)

- `app/api/admin/compliance/logs/route.ts:34-35`: uç yalnızca `requireAuth(['ADMIN'])`; `:44` ve `:223` doğru, bayrak maskeyi kaldırıyor ve erişim loglanmıyor.
- Ancak burada yetki sınırı aşılmıyor: aynı ADMIN `GET /api/security/suspicious` (`app/api/security/suspicious/route.ts:24` yalnızca ADMIN, `:43-52` `include` ile tüm skaler alanları, yani maskelenmemiş `ipAddress` ve `userAgent` alanlarını döndürüyor) üzerinden ham IP'leri bayraksız da alabiliyor. Ayrıca `userAgent` bu uçta hiç maskelenmiyor. ADMIN olmayan bir kullanıcının bu veriye ulaştığı bir senaryo kurulamadı; UI'da bu parametreyi kullanan bir çağrı da yok.

Bu maddede somut bir kullanıcıya ya da veriye zarar yok; bulgu, veri minimizasyonu açısından tutarsızlık. Öneri: maskeleme tek bir yardımcıda (`lib/pii-redact.ts`) merkezileşmeli ve IP döndüren tüm admin uçlarına (suspicious dahil) uygulanmalı. Maskesiz görüntüleme gerekçe isteyen ve AuditLog'a yazılan ayrı bir eylem olmalı. Önceliği orta/düşük.

---

## Uygulama (Dalga 2)

**Hedef rota:** `/admin/privacy` (KVKK merkezi). `/admin/compliance` artık sorgu parametrelerini koruyarak `permanentRedirect` ile oraya yönlenir. 427 satırlık tek istemci dosyası kaldırıldı. Yerine sunucu bileşeni sayfa (genel bakış sunucuda ölçülür) ve `components/admin/a-kvkk/` altında sekme başına tembel yüklenen bileşenler geldi: Genel bakış · Talepler · Envanter · Saklama · Rıza · 5651 kayıtları. Eski `GET /api/admin/compliance/overview` ve `/logs` uçları silindi. Yerlerine `defineRoute` tabanlı yeni uçlar geldi: `GET /api/admin/privacy?section=overview|retention|consent`, `GET /api/admin/privacy/logs`, `GET /api/admin/privacy/logs/export`. Sunucu mantığı `lib/admin-privacy/{contract,server}.ts` dosyalarında.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Hero başlık | ÇALIŞIYOR | `PageHeader` ("KVKK merkezi"), ops kaydı. |
| 2 | Yetki | ÇALIŞIYOR | Tüm uçlar `defineRoute` roles ADMIN + rate limit (dışa aktarım `sensitive`). |
| 3 | Log araması | ÇALIŞIYOR | Sunucuda: işlem/varlık metni + kullanıcı (ad/e-posta → kimlik çözümü). |
| 4 | Genel Yenile | ÇALIŞIYOR | "Şimdi ölç" `fresh=1` ile Redis önbelleğini atlar. |
| 5 | Satır içi hata | ÇALIŞIYOR | Her sekme bağımsız `QueryState`; bir bölümün hatası diğerlerini gizlemez (`PanelErrorBoundary`). |
| 6 | Tüm Loglar filtresi | ÇALIŞIYOR | Ortak `LogSource` tipi; erişim engeli satırları etiketli ve "90 gün saklanır" rozetli. |
| 7–9 | Denetim / Kart / Şüpheli filtreleri | ÇALIŞIYOR | `radiogroup` + `aria-checked`. |
| 10 | Runtime guard filtresi | ÇALIŞIYOR | "Erişim engeli" seçeneği eklendi. |
| 11 | Kaynak değişiminde yarış | ÇALIŞIYOR | TanStack Query anahtarı filtrelerden oluşur; eski yanıt yeni filtrenin üstüne yazılamaz. Filtreler URL'de. |
| 12–13 | KPI: kullanıcı / denetim logu sayısı | KALDIRILDI | Ham hacim sayısı uyum sinyali değil; yerine ölçülen kontroller ve oranlar geldi. |
| 14 | IP kapsamı KPI | ÇALIŞIYOR | Payda düzeltildi: son 7 gün, kişi aktörlü kayıtlar (sistem olayları hariç). IP'siz yazan ilk 5 işlem listeleniyor (doğrulamadaki "payda" notu). |
| 15 | Çözülmemiş şüpheli olay | ÇALIŞIYOR | Yüksek/kritik ayrı sayılıyor, `/admin/trust` sayfasına bağlantı var. |
| 16 | Gösterilmeyen ölü alanlar | KALDIRILDI | Kullanılmayan sayımlar sorgudan çıkarıldı; UA kapsamı gösteriliyor. |
| 17 | DSR kuyruğu kartı | ÇALIŞIYOR | Kopya kaldırıldı. Kanonik kuyruk "Talepler" sekmesinde; genel bakışta açık/geciken/en yakın son tarih var. |
| 18 | `#kvkk-queue` derin bağlantısı | ÇALIŞIYOR | Eski bağlantılar yönlendirmeyle merkeze iner; kanonik derin bağlantı `?tab=talepler&status=overdue`. |
| 19 | DSR Yenile | ÇALIŞIYOR | |
| 20 | Geliştirici jargonu açıklaması | KALDIRILDI | Yerine boş durumda şu metin geldi: "Başvurular müşteri ayarlarındaki Gizlilik bölümünden gelir; e-postayla geleni Talep ekle ile kuyruğa alın." |
| 21–22 | Ham tür/durum | ÇALIŞIYOR | TR etiketler ve tonlu rozetler. |
| 23 | Makbuz ve tarih | ÇALIŞIYOR | `tr-TR` + Europe/Istanbul biçimleyiciler (`format.ts`). |
| 24 | DSR mesajı | ÇALIŞIYOR | Detay panelinde. |
| 25 | SLA | ÇALIŞIYOR | Kalan gün rozeti ve sayaçlar. |
| 26 | "İncelemede" | ÇALIŞIYOR | Durum makinesi; geçersiz geçişte 409. |
| 27 | "Tamamlandı" | KALDIRILDI | Elle kapanış yok; kapanış yalnız yürütme kanıtıyla. |
| 28 | Reddet | ÇALIŞIYOR | Gerekçeli. |
| 29 | Export / anonimleştirme | ÇALIŞIYOR | Talep detay panelinde. |
| 30–31 | DSR yükleniyor/boş/hata | ÇALIŞIYOR | Hata ayrı durum ("Talepler yüklenemedi"). |
| 32 | KVKK veri envanteri (statik) | ÇALIŞIYOR | Sabit 4 kategori kaldırıldı. "Envanter" sekmesi `PII_REGISTRY`'nin kendisini gösteriyor: model, kategori, alanlar, dışa aktarım, silme stratejisi, saklama, hukuki sebep. Sürüklenmeye karşı şema testi var (`__tests__/lib/pii-registry.test.ts`). |
| 33 | 5651 log tablosu | ÇALIŞIYOR | Kaynaklar arası keyset sayfalama (her kaynaktan en fazla size+1 satır), tarih aralığı (İstanbul günü), "Daha fazla yükle". |
| 34 | IP maskeleme | ÇALIŞIYOR | |
| 35 | `includeSensitive=true` | KALDIRILDI | Maskesiz IP bu yüzeyden alınamaz (veri minimizasyonu). |
| 36–37 | Kullanıcı / UA sütunu | ÇALIŞIYOR | UA 160 karakterle kesilir, tamamı `title` ile. |
| 38 | Önem rozeti | ÇALIŞIYOR | Önem tonlu (Düşük/Orta/Yüksek/Kritik); `reason` ayrı alan olarak dönüyor. |
| 39 | Zaman | ÇALIŞIYOR | |
| 40 | "Toplam gösterilen" sayacı | KALDIRILDI | Yanıltıcı toplam yerine cursor sayfalama kullanılıyor. |
| 41 | Log boş durumu | ÇALIŞIYOR | Filtreye göre "Bu filtrede kayıt yok" / "Henüz kayıt yok". |
| 42 | Satır detayı | ÇALIŞIYOR (kısmi kapsam) | `entityId` gösteriliyor. `oldData/newData` farkı `/admin/audit` yüzeyinde (sahibi başka ajan). |
| 43 | Log dışa aktarma | ÇALIŞIYOR | CSV (BOM, `;`, formül kaçışı), en fazla 5000 satır, `x-content-sha256` özeti; her dışa aktarım `AuditLog`'a (`compliance_log_export`, filtreler, satır sayısı, özet) yazılır. |
| 44 | Hukuki kontrol listesi (statik) | ÇALIŞIYOR | Ölçülen "Uyum kontrolleri" ile değiştirildi: KVKK süresi, saklama işinin son 48 saatte çalışması, 5651 IP kapsamı, rıza kanıtı, yüksek önemli olaylar. Ölçülemeyen kontrol `unknown` döner, sessizce "ok" sayılmaz. |
| 45 | Uyum notları (statik) | KALDIRILDI | Sabit metin yerine her kontrol kendi gerekçe cümlesini taşıyor. |
| 46 | İlk yükleme | ÇALIŞIYOR | Genel bakış sunucuda ön yüklenir; diğer sekmelerde iskelet var. |
| 47 | Mobil | ÇALIŞIYOR | Log ve envanter tabloları `md` altında kart listesine döner; dokunma hedefleri ≥44px. |
| 48 | Erişilebilirlik | ÇALIŞIYOR | `radiogroup`, etiketli alanlar, tablolarda `caption`/`scope`, rıza çubuklarında `role=meter`, grafik için ekran okuyucu tablosu. |

### Yeni (eksik özellikler listesinden)
- **Saklama ve imha politikası görünümü:** Otomatik uygulanan süreler `PII_REGISTRY.retentionField` ve analitik 90 gün kuralından okunur. Her kural için şu an süresi dolmuş ve bir sonraki çalışmada silinecek satır sayısı gösterilir. Temizlik işlerinin (`db-cleanup`, `analytics-event-cleanup`) son başarılı çalışması, ardışık hata sayısı ve son hatası günlük orkestratörün kalıcı izinden okunur. Yalnız politika olarak yazılı süreler ayrı listede durur.
- **Rıza kaydı görünümü:** `ConsentRecord` üzerinden 7/30/90 günlük pencere: karar sayısı, farklı kişi/cihaz sayısı, kategori bazında onay oranları, yalnız zorunluya izin oranı, sürüme ve kaynağa göre dağılım, İstanbul günlerine göre günlük dağılım.
- **İmzalı kanıt dışa aktarma:** SHA-256 özeti ve denetim kaydıyla.

### Kapanan bulgular
B1, B2, B5, B6, B7, B8, B9, B10, B11, B12, B13, B14: 14 bulgudan 12'si kapandı. B3 doğrulamada çürütülmüştü; paydası düzeltildi ve kırılım eklendi. B4 (`AuditLog` Cascade) şema dalgasında `SetNull` + `actorSnapshot` ile kapanmıştı ve doğrulandı.

### Kalanlar
- **Düzenlenebilir ve sürümlü envanter (DB'de `DataInventoryItem`):** Uygulanmadı, bilinçli olarak. Envanter kodda tek kaynak, aynı kayıt silme ve dışa aktarmayı da yürütüyor. DB'de düzenlenebilir bir kopya ikinci bir doğruluk kaynağı yaratırdı. Gerekirse ŞEMA İSTEĞİ olarak açılabilir.
- **Erişim incelemesi (admin 2FA, son giriş):** Bu yüzeyin kapsamı dışında bırakıldı (kullanıcı/yetki yüzeyi).
- **Log satırında diff ve korelasyon:** `/admin/audit` yüzeyinde.
- **Geciken DSR için cron bildirimi:** `app/api/cron/daily/jobs.ts` başka bir ajanda staged olduğu için eklenmedi.
