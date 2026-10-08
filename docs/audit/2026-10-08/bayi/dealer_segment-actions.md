# /dealer/segment-actions

**Amaç:** İşletmenin müşterilerini CLV segmentlerine (Risk Altında, Uyuyan, VIP, Sadık, Yeni, Segmentsiz) göre özetlemek ve her segment için önerilen aksiyonu "tek tıkla" uygulatmak. Kendi tanımıyla, dağınık churn / win-back / kampanya yüzeylerini tek bir "gör → uygula" panelinde birleştirmek (`lib/segment-action-center.ts:1-8`).

**Genel puan: 3/10** · **Karar: yeniden inşa** (veri katmanı ve aksiyon sözleşmesi baştan kurulmalı; ardından `/dealer/customers` ile tek bir "Müşteriler & Segmentler" merkezinde birleşmeli)

Özet: Fikir doğru ve değerli (Medallia / Square Marketing'deki "segment → otomatik aksiyon" kalıbı), ama uygulamada **5 aksiyon butonunun 4'ü her tıklamada 400 hatası alıyor**. Çalışan tek buton ("Flash teklif gönder") ise taslak hazırlamak yerine **onay almadan gerçek müşterilere bildirim gönderiyor**, gösterilen segmentten farklı bir kitleyi hedefliyor ve tekrar tıklamaya karşı koruması yok. Kartlardaki tutarlar ve risk oranları **platform genelindeki** CLV'den geliyor, bu işletmeye ait değil.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 2/10 | 5 aksiyondan 4'ü sözleşme uyumsuzluğu yüzünden her zaman başarısız oluyor. Çalışan tek aksiyon tehlikeli biçimde, onaysız gönderim yapıyor. Metrikler bu işletmeye değil, tüm platforma ait. |
| UX | 4/10 | "Gör → uygula" akışı anlaşılır, ama önizleme, onay, sonuç, geçmiş ve segment içeriğini görme (drill-down) yok. Hata durumu "veri yok" gibi görünüyor. |
| Görsel | 5/10 | Temiz shadcn kartları ve öncelik halkası var, ama hiyerarşi düz: değer/risk KPI'ları ikincil, emoji ikonlar ve 10px rozetler profesyonel durmuyor. |
| Mimari | 3/10 | Global (`userId @unique`) CLV modeli çok kiracılı (multi-tenant) bir üründe kullanılmış. Endpoint'lerin istek gövdesi test edilmemiş, i18n yok, hata yönetimi naif. |
| Performans | 6/10 | İki sorgu, sayfa hafif. Ancak sınırsız `IN (...)` listesi, cache yok ve tetiklenen POST'ta döngüyle tek tek yapılan `notification.create` çağrıları (N+1) var. |
| Erişilebilirlik + Mobil | 5/10 | Mobilde tek sütuna iniyor, butonlar tam genişlikte. Ancak anlam yalnızca renkle veriliyor, emoji'ler `aria-hidden` değil, yükleniyor durumunda `aria-busy` yok ve azaltılmış hareket desteklenmiyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Hero başlık ("Segment Aksiyon Merkezi") | ÇALIŞIYOR | `app/dealer/segment-actions/page.tsx:91-95` | Ortak `DashboardPageHero` kullanılıyor. Metin sabit Türkçe. |
| 2 | Bilgi notu bandı (`note`) | KISMİ | `page.tsx:97-101`, `app/api/dealer/segment-actions/route.ts:45,73` | "günlük cron 02:00" yazıyor, oysa cron `0 2 * * *` UTC'de (`lib/inngest/functions.ts:108`), yani TR saatiyle 05:00'te çalışıyor. Müşteri hiç yokken hem bu not hem boş durum kartı birlikte çıkıyor (aynı mesaj iki kez). |
| 3 | "Toplam N müşteri" sayacı | KISMİ | `page.tsx:103-107`, `route.ts:66` | Yüklenirken "Toplam 0 müşteri" yazıyor (yanlış veri flaşı). Sayı, tüketim kaydı olan müşteriler değil `clvRows.length`. Son CLV hesaplamasından sonra gelen müşteriler sessizce düşüyor. |
| 4 | "· N segment" sayacı | ÇALIŞIYOR | `page.tsx:106` | |
| 5 | Yükleniyor iskeleti (4 kart) | ÇALIŞIYOR | `page.tsx:109-114` | `aria-busy` ve ekran okuyucu metni yok. |
| 6 | Boş durum kartı | KISMİ | `page.tsx:115-122` | API hata verdiğinde de bu kart görünüyor (bkz. #7) ve "veri yok" sanılıyor. "Günlük hesaplama" ifadesi de tazelik bilgisi vermiyor. |
| 7 | Hata durumu + yeniden dene | EKSİK | `page.tsx:57-59` | Yalnızca toast gösteriliyor, kalıcı bir hata kartı ya da "Tekrar dene" yok. `res.json()` `res.ok` kontrolünden önce çağrıldığı için (`page.tsx:52`) HTML hata sayfası geldiğinde kullanıcı ham "Unexpected token <" mesajını görüyor. |
| 8 | Segment kartları + aciliyet sıralaması | ÇALIŞIYOR | `lib/segment-action-center.ts:100,140-144` | Sabit sıra: Risk, Uyuyan, VIP, Sadık, Yeni, Segmentsiz. Kullanıcı sıralayamıyor. |
| 9 | Segment renk noktası | KISMİ | `page.tsx:133`, `lib/segment-action-center.ts:38-45` | Renk dekoratif ve anlamı yalnız renkle veriliyor. `aria-hidden` yok. |
| 10 | "N müşteri · ort. ₺X" alt satırı | BOZUK | `page.tsx:137`, `route.ts:50-63`, `lib/clv-core.ts:80-87` | `avgSpent`, müşterinin **tüm işletmelerdeki** harcamasından hesaplanıyor. Segmentte tek müşteri varsa o kişinin platform genelindeki toplam harcaması tam olarak açığa çıkıyor. |
| 11 | Öncelik rozeti (Acil/Önemli/İzle) | ÇALIŞIYOR | `page.tsx:141-145`, `27-37` | 10px, `uppercase`. "İzle"nin büyük harfe çevrilmesi `lang` özniteliğine bağlı. |
| 12 | "Toplam değer" metriği | BOZUK | `page.tsx:150-153`, `lib/clv-core.ts:80-87,124` | Platform geneli harcama toplamı gösteriliyor, bu işletmenin cirosu değil. Bayi yanlış karar verir. |
| 13 | "Ort. kayıp riski" metriği | KISMİ | `page.tsx:154-159`, `lib/clv-core.ts:93-119` | Risk, müşterinin **başka işletmelere** verdiği geri bildirimlerden de besleniyor. Değer %5 olsa bile her zaman kırmızı gösteriliyor. |
| 14 | Önerilen aksiyon kutusu (etiket + gerekçe) | KISMİ | `page.tsx:163-169`, `lib/segment-action-center.ts:51-97` | Gerekçe metinleri global segmente dayanıyor ("30+ gündür pasif" ifadesi bu işletme için değil, platform geneli için doğru). VIP önceliği yüzünden 60 gündür gelmeyen bir VIP "Uyuyan" kartında hiç görünmüyor (`lib/clv-core.ts:62-67`). |
| 15 | "Flash teklif gönder" (Risk Altında) | KISMİ (tehlikeli) | `lib/segment-action-center.ts:59`, `app/api/dealer/campaigns/risk-segment/route.ts:38-71` | **Gerçek bildirim gönderiyor**, taslak üretmiyor. Onay ve önizleme yok. Hedef kitle CLV segmenti değil, son 30 günün `Feedback.churnRisk ≥ 0.5` kayıtları; yani karttaki N kişiyle gönderilen kişiler farklı. Tekrar tıklamaya karşı koruma (idempotency/cooldown) yok. Sayfanın gönderdiği `segment`/`source` alanları yok sayılıyor. |
| 16 | "Win-back kampanyası" (Uyuyan) | BOZUK | `page.tsx:74-77`, `app/api/dealer/win-back/route.ts:101-110,137-139` | Endpoint `userIds[]` ve `offerType` bekliyor, sayfa ise `{segment, source}` gönderiyor. Sonuç her zaman **400 "No users selected"**. |
| 17 | "Sadakat ödülü ver" (VIP) | BOZUK | `app/api/dealer/innovation/segment-proposals/route.ts:11-16,56-59` | Zod `segmentKey` alanını zorunlu tutuyor ve gönderilmiyor; sonuç her zaman **400 "Required"**. Üstelik `SegmentKey` içinde VIP karşılığı hiç yok (`lib/innovation-segment-templates.ts:1`). |
| 18 | "Referans daveti" (Sadık) | BOZUK | aynı (`segment-proposals/route.ts:56-59`) | Her zaman 400. Düzelse bile bu şablon "teşekkür + mikro ödül" taslağı, referans daveti değil (`innovation-segment-templates.ts:13-17`). |
| 19 | "Karşılama serisi" (Yeni) | BOZUK | aynı | Her zaman 400. Ayrıca "seri" denmesine rağmen hedef tek bir taslak (`PENDING` öneri), çok adımlı bir seri değil. |
| 20 | Segmentsiz kartı ("öneri yok") | ÇALIŞIYOR | `page.tsx:186-188`, `lib/segment-action-center.ts:94-95` | |
| 21 | Buton yükleniyor spinner'ı | KISMİ | `page.tsx:46,72,85,173-183` | Tek bir `applying` state kullanılıyor. İki kart art arda tetiklenirse ilkinin `finally` bloğu ikincinin kilidini açıyor (yarış koşulu). Spinner'ın erişilebilir metni yok. |
| 22 | Başarı bildirimi ("… hazırlandı ✓") | SAHTE | `page.tsx:81`, `lib/admin-toast.ts:17-18` | Yanıttaki `sent` / `eligibleCount` okunmuyor: **0 kişiye gidilse bile "hazırlandı ✓"** yazıyor. Fiilen gönderim yapıldığı halde "hazırlandı" deniyor. Önek "Basarili:" Türkçe karakter içermiyor. |
| 23 | Yetki (GET) | ÇALIŞIYOR | `route.ts:17-34`, `proxy.ts:50-73` | Sayfa yalnızca DEALER'a açık. API'deki STAFF/ADMIN dalları bu sayfadan erişilemediği için ölü yol. IDOR yok: `dealerId` oturumdan geliyor. |
| 24 | Çok dillilik (i18n) | EKSİK | `page.tsx:37,93-94,105,119-120,151,156,187`, `messages/en.json:2553` | Menü etiketinin EN karşılığı var ama sayfa tamamen sabit Türkçe. "Win-back" ve "Flash" gibi TR/EN karışık terimler kullanılıyor. |
| 25 | Aksiyon geçmişi / son uygulama zamanı | EKSİK | — | Hangi segmente ne zaman ne gönderildiği görünmüyor. `analyticsEvent` yalnızca risk aksiyonunda yazılıyor (`risk-segment/route.ts:73-80`). |
| 26 | Segment içeriğini görme (drill-down müşteri listesi) | EKSİK | — | "Kim bu 23 kişi?" sorusunun cevabı yok, `/dealer/customers` sayfasına bağlantı da yok. |
| 27 | Önizleme / onay modalı (mesaj, kanal, alıcı sayısı) | EKSİK | `page.tsx:70-87` | Gerçek gönderim yapan aksiyon için bu kritik. |
| 28 | Veri tazeliği (CLV `calculatedAt`) + yenile | EKSİK | `prisma/schema.prisma:2080` | Alan şemada var ama API döndürmüyor. |
| 29 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:110,124,172` | `sm:grid-cols-2` → mobilde tek sütun, buton tam genişlik. |
| 30 | Azaltılmış hareket | KISMİ | `page.tsx:112,128,177` | `animate-pulse` ve `animate-spin` için `motion-safe:`/`motion-reduce:` yok. Etkisi küçük. |
| 31 | Menü kaydı + görünürlük kontrolü | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:249`, `lib/visibility-controls.ts:62` | "analytics" grubunda. Doğrudan URL ile girişte görünürlük kontrolü yapılmıyor (doğrulanmadı, düşük önem). |

**Durum sayımı:** ÇALIŞIYOR 9 · KISMİ 9 · BOZUK 6 · SAHTE 1 · EKSİK 6 (toplam 31)

---

## Bulgular

### 1. Dört aksiyon butonu her zaman 400 hatası alıyor (sözleşme uyumsuzluğu)
- **Önem:** kritik · **Kategori:** işlevsellik / entegrasyon · **Efor:** M
- **Kanıt:** Sayfa her endpoint'e aynı gövdeyi gönderiyor: `JSON.stringify({ segment: seg.name, source: 'segment-action-center' })` (`page.tsx:74-77`).
  - `/api/dealer/win-back` POST: `userIds` dizisi yoksa `400 'No users selected'` dönüyor (`app/api/dealer/win-back/route.ts:108-110`), `offerType` yoksa `400` (`:137-139`).
  - `/api/dealer/innovation/segment-proposals` POST: `postSchema` içinde `segmentKey: z.enum(['sleeping','loyal','first_visit'])` zorunlu (`route.ts:11-16`). `safeParse` başarısız olunca `400 "Required"` dönüyor (`:56-59`).
  - Mantık testi (`__tests__/lib/segment-action-center.test.ts`) yalnızca endpoint **adresini** doğruluyor, gönderilen gövdeyi hiç test etmiyor. Bu yüzden kırılma fark edilmemiş.
- **Sorun:** Sayfanın vaat ettiği tek şey "tek tıkla uygula", ama Uyuyan, VIP, Sadık ve Yeni segmentlerinin hepsinde kullanıcı yalnızca "Dikkat: Required" ya da "Dikkat: No users selected" toast'ı görüyor. Bu, ürünün güvenilirliğini doğrudan zedeliyor.
- **Profesyonel öneri:** Aksiyonları endpoint adresi olarak değil, **sunucu tarafında tanımlı aksiyon tipi** olarak modelleyin. `SegmentAction` içinde `endpoint` yerine `actionType: 'risk_offer' | 'win_back' | 'vip_reward' | 'referral' | 'welcome'` tutun ve tek bir `POST /api/dealer/segment-actions/{actionType}/preview` ile `.../execute` çifti açın. Sunucu, segmentin alıcı listesini **kendisi** çözsün (istemciden `userIds` almasın) ve mevcut servislere (win-back teklif mesajı, `segmentCampaignProposal` oluşturma) iç fonksiyon olarak çağrı yapsın. Endpoint'ler arasında HTTP üzerinden ve gövde tahmin ederek bağ kurulmasın. Ek olarak her aksiyon tipi için bir route-düzeyi sözleşme testi yazın (zod şeması paylaşılsın: `lib/segment-actions/schema.ts`).

### 2. "Flash teklif gönder" onaysız gerçek gönderim yapıyor, yanlış kitleyi hedefliyor ve spam'e açık
- **Önem:** kritik · **Kategori:** veri bütünlüğü / müşteri güveni · **Efor:** M
- **Kanıt:**
  - Kod yorumu "Endpoint'ler kampanya taslağı üretir" diyor (`page.tsx:68-69`). Gerçekte `risk-segment` POST, `prisma.notification.create` ile müşterilere doğrudan bildirim yazıyor (`app/api/dealer/campaigns/risk-segment/route.ts:54-71`).
  - Hedef kitle `feedback` tablosunda son 30 günün `churnRisk ≥ 0.5` kayıtları (`:38-49`). Kartta gösterilen ise CLV "Risk Altında" segmentinin sayısı (`lib/segment-action-center.ts:57`). Bu iki küme farklı; kart "12 müşteri" derken 0 ya da 50 kişiye gidebilir.
  - Tekrar gönderim kontrolü, cooldown veya idempotency anahtarı yok. Her tıklamada aynı en fazla 50 kişiye yeniden "Sizi dinliyoruz" bildirimi gidiyor.
  - Sayfa yanıttaki `sent` değerini okumuyor ve her durumda "hazırlandı ✓" yazıyor (`page.tsx:81`).
  - Gönderim döngüsü N+1 (`for` içinde tek tek `create`, `:54-71`). Bildirim tercihi/izin kontrolü yapılmıyor.
- **Sorun:** Bayi, yalnızca bir taslak hazırladığını düşünürken gerçek müşterilere mesaj gidiyor. Birkaç tıklamada aynı müşteriye birden çok kez gidiyor. Gönderilen kişilerin ekranda vaat edilen kişilerle ilgisi yok. Bu, hem müşteri deneyimini hem de pazarlama izni (KVKK/İYS) açısından riskli.
- **Profesyonel öneri:** Tüm segment aksiyonları **iki aşamalı** olsun.
  1. **Önizleme:** sunucu alıcıları çözer; alıcı sayısını, örnek mesajı, kanalı ve (varsa) son 7 günde zaten mesaj almış kişi sayısını döner.
  2. **Onay:** sayfada bir `Dialog` (shadcn) açılır, mesaj düzenlenir ve "N kişiye gönder" ile onaylanır.

  Sunucu tarafında şunlar olsun: `SegmentActionRun` (dealerId, segment, actionType, recipientCount, sentCount, createdById, createdAt) tablosu; müşteri başına cooldown (örneğin aynı bayiden 7 gün içinde en fazla 1 promosyon; Redis `SET NX EX` veya DB üzerinden); `Idempotency-Key` başlığı; `createMany` ile toplu yazım; bildirim tercihi filtresi. Sonuç toast'ı gerçek sayıyı göstersin: "11 kişiye gönderildi · 3 kişi son 7 günde zaten bilgilendirildiği için atlandı".

### 3. Kart metrikleri ve segmentler platform geneline ait; bayiye çapraz işletme verisi sızıyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / gizlilik · **Efor:** L
- **Kanıt:**
  - `CustomerLifetimeValue.userId @unique` ve modelde `dealerId` yok (`prisma/schema.prisma:2069-2087`).
  - `recomputeAllCLV`, `consumption.groupBy({ by: ['customerId'] })` çağrısını **dealer filtresi olmadan** yapıyor (`lib/clv-core.ts:80-87`). Churn hesaplaması da tüm işletmelerin geri bildirimlerinden geliyor (`:93-119`).
  - Route bu global satırları yalnızca "bu bayide tüketimi olanlar" diye filtreleyip toplayarak döndürüyor (`app/api/dealer/segment-actions/route.ts:37-63`).
- **Sorun:**
  1. "Toplam değer" ve "ort. ₺X" değerleri işletmenin değil, müşterinin bütün platformdaki harcaması. Rakip işletmelerdeki ciro da dahil.
  2. Segment kişi sayısı 1 olduğunda o müşterinin platform genelindeki harcaması ve risk değeri tam olarak açığa çıkıyor (çok kiracılı gizlilik ihlali).
  3. Bir müşteri bu işletmeye 3 aydır gelmiyor ama başka bir yere her gün gidiyorsa "Uyuyan" sayılmıyor; win-back fırsatı kayboluyor.
  4. Segmentler birbirini dışladığı ve VIP önceliği yüksek olduğu için (`lib/clv-core.ts:62-67`) uyuyan VIP'ler hiç görünmüyor.

  Aynı kök neden `/dealer/customers` raporunda da tespit edildi.
- **Profesyonel öneri:** CLV'yi **bayi × müşteri** düzeyine taşıyın. `DealerCustomerMetrics(dealerId, customerId, totalSpent, visits, firstAt, lastAt, churn, segment, calculatedAt)` tablosu ve `@@unique([dealerId, customerId])` ekleyin; hesaplamayı `GROUP BY "dealerId","customerId"` ile tek SQL `INSERT … ON CONFLICT` olarak yazın. Churn yalnızca bu bayiye ait `Feedback` ve `ConsumptionReview` kayıtlarından gelsin. Segmentleri **etiket** modeline çevirin (bir müşteri aynı anda "VIP" ve "Uyuyan" olabilsin) ve aksiyon önceliğini etiket kombinasyonu belirlesin (örneğin "Uyuyan VIP" en acil win-back hedefi). Hesaplama, tek günlük toplayıcıya (`app/api/cron/daily/route.ts:51-59`) eklensin; şu an yalnızca Inngest'e bağlı (`lib/inngest/functions.ts:106-111`) ve üretimde Inngest'in çalıştığı **doğrulanmadı**.

### 4. Hata durumu boş durum gibi görünüyor; yeniden deneme yok
- **Önem:** orta · **Kategori:** UX / hata yönetimi · **Efor:** S
- **Kanıt:** `page.tsx:51-59`: `res.json()` çağrısı `res.ok` kontrolünden önce geliyor. Hata olduğunda yalnızca toast çıkıyor, `segments` boş kalıyor ve `page.tsx:115-122` "Henüz segment verisi yok" kartını gösteriyor.
- **Sorun:** DB kesintisi ya da 500 hatası, kullanıcıya "henüz veriniz yok" olarak yansıyor. Bu yanlış bir sonuç ve destek yükü yaratır.
- **Profesyonel öneri:** `error` state'i ekleyin ve "Segmentler yüklenemedi · Tekrar dene" kartını (`role="alert"`) gösterin. Veriyi projede yaygın olan bir fetch kancasıyla (SWR veya ortak `useJson`) yükleyin: `revalidateOnFocus` ve yeniden deneme olsun. JSON ayrıştırmasını `content-type` kontrolüyle güvenceye alın.

### 5. Yükleniyor/uygulanıyor state'lerinde yarış ve yanlış veri flaşı
- **Önem:** düşük · **Kategori:** doğruluk · **Efor:** S
- **Kanıt:** Yüklenirken "Toplam **0** müşteri" yazıyor (`page.tsx:103-106`). Tek bir `applying` state kullanıldığı için (`page.tsx:46,72,85`) iki kart art arda tetiklenince ilkinin `finally` bloğu ikinci butonun kilidini açıyor.
- **Profesyonel öneri:** Sayaç yüklenirken iskelet göstersin. `applying` bir `Set<string>` olsun ya da aksiyon başına `useMutation` benzeri bağımsız state kullanılsın. Önizleme modalı geldiğinde (Bulgu 2) bu sorun kendiliğinden azalır.

### 6. "Toplam müşteri" sayısı tüketim kaydı olan müşterilerden az; yeni müşteriler sessizce düşüyor
- **Önem:** orta · **Kategori:** veri doğruluğu · **Efor:** S
- **Kanıt:** `customerIds` tüketim kaydından geliyor (`route.ts:37-42`), ama `totalCustomers = customers.length` yani CLV satırı olanlar (`route.ts:66`). Not yalnızca **hiç** CLV satırı yokken gösteriliyor (`route.ts:67,73`).
- **Sorun:** Son hesaplamadan sonra gelen müşteriler ne toplamda ne de "Yeni" segmentinde görünüyor. Oysa "Yeni" segmentinin en çok işe yarayacağı an tam da bu.
- **Profesyonel öneri:** `totalCustomers = customerIds.length` olsun. Fark (`customerIds.length - clvRows.length`) "Henüz segmentlenmemiş N müşteri" olarak ayrı gösterilsin; bu müşteriler varsayılan olarak "Yeni" etiketine düşsün. API `calculatedAt` (en eski/en yeni) değerini döndürsün, arayüzde "Son güncelleme: 4 saat önce" rozeti bulunsun.

### 7. Aksiyon ↔ şablon anlam uyumsuzluğu
- **Önem:** orta · **Kategori:** ürün mantığı · **Efor:** S
- **Kanıt:** VIP için "Sadakat ödülü ver" endpoint'i `segment-proposals`, ama `SegmentKey` içinde VIP yok (`lib/innovation-segment-templates.ts:1`). "Referans daveti" gerçekte "teşekkür + mikro ödül" şablonuna gidiyor (`:13-17`). "Karşılama serisi" tek bir `PENDING` taslak üretiyor (`segment-proposals/route.ts:78-86`). Buton etiketi ile aksiyonun ne yaptığı birbirini tutmuyor.
- **Profesyonel öneri:** Aksiyon kataloğu sunucuda tek kaynaktan yönetilsin (etiket, açıklama, şablon, kanal, sonuç türü: "taslak oluşturur" ya da "hemen gönderir"). Buton metni sonucu açıkça söylesin: "Taslak oluştur" veya "N kişiye gönder". Referans için mevcut referral kademe sistemine (2026-08-08 turu) gerçek bir davet akışı bağlansın.

### 8. Çok dillilik ve terminoloji tutarsızlığı
- **Önem:** düşük · **Kategori:** tutarlılık · **Efor:** S
- **Kanıt:** Sayfa tamamen sabit Türkçe (`page.tsx:37,93-94,105,119-120,151,156,187`), oysa menü anahtarı EN'de mevcut (`messages/en.json:2553`). "Win-back" ve "Flash teklif" gibi karışık terimler kullanılıyor. Toast öneki "Basarili:" (`lib/admin-toast.ts:17`) Türkçe karakter içermiyor, ve bayi panelinde **admin** toast sarmalayıcısı kullanılıyor.
- **Profesyonel öneri:** `dealerSegmentActions.*` anahtarlarıyla `useTranslations` kullanın, segment adlarını sunucudan anahtar (`risk`, `dormant`, `vip` …) olarak alıp istemcide çevirin. Bayi panelinde `sonner`'ın doğrudan kullanımına ya da bayiye özel bir toast sarmalayıcısına geçin.

### 9. Erişilebilirlik eksikleri
- **Önem:** düşük · **Kategori:** a11y · **Efor:** S
- **Kanıt:** Emoji ikonlar (`page.tsx:166`) ve renk noktası (`:133`) `aria-hidden` değil. Kayıp riski her değerde kırmızı (`:157`). Spinner'ın erişilebilir etiketi yok (`:177`). İskelette `aria-busy` yok (`:110`). `animate-*` sınıfları için `motion-reduce` yok.
- **Profesyonel öneri:** Emoji yerine `lucide` ikonları (`Zap`, `MailOpen`, `Crown`, `Handshake`, `Sprout`) `aria-hidden` ile kullanılsın. Risk değeri eşiğe göre renklendirilsin ve yanına metin etiketi ("Yüksek") eklensin. Butona `aria-busy` ve `sr-only` "Uygulanıyor…" eklensin; `motion-safe:animate-pulse` kullanılsın.

### 10. Performans notları
- **Önem:** düşük · **Kategori:** performans · **Efor:** S
- **Kanıt:** Binlerce müşterisi olan bir bayide `customerLifetimeValue.findMany({ userId: { in: customerIds } })` sınırsız bir `IN` listesi oluşturuyor (`route.ts:50-57`). Gereksiz `_count` alanı var (`route.ts:40`). Cache yok.
- **Profesyonel öneri:** Bayi × müşteri tablosuna geçildiğinde (Bulgu 3) özet tek bir `GROUP BY segment` sorgusuyla hesaplanır. Sonuç, Upstash'te `dealer:{id}:segment-summary` anahtarıyla, CLV hesaplamasında geçersiz kılınan bir anahtar olarak 10-15 dk cache'lenebilir.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Segment drill-down + dışa aktarma:** Square Marketing ve Toast Guestbook'ta segment kartına tıklanınca müşteri listesi, son ziyaret, harcama ve CSV dışa aktarma gelir. Burada "kimler?" sorusunun cevabı yok.
2. **Aksiyon önizleme, kanal seçimi ve zamanlama:** Mesaj düzenleme, push/e-posta/SMS kanal seçimi, gönderim zamanı ve tahmini erişim. Square'in "Automatic Marketing" önizlemesindeki gibi.
3. **Aksiyon geçmişi ve sonuç ölçümü (closed loop):** Medallia ve Qualtrics'teki "action → outcome" takibi. Gönderilen kişi, geri dönen kişi, dönüşüm oranı, kazanılan ciro ve kontrol grubuna göre artış.
4. **Otomasyon kuralları:** "Bir müşteri Uyuyan'a düştüğünde otomatik win-back gönder" gibi tetikleyiciler, sıklık sınırı ve sessiz saatler. Toast/Square'in "always-on" kampanyaları.
5. **Segment trendi:** Segment büyüklüğünün zaman içinde değişimi (bu hafta Risk +4), segmentler arası geçiş (Sadık → Uyuyan) ve en büyük kayıp kaynağı.
6. **İzin/tercih uyumu:** Pazarlama izni olmayan veya bildirimi kapatmış müşterilerin alıcı listesinden çıkarılması ve sayılarının gösterilmesi (İYS/KVKK uyumlu "N kişi izin vermediği için atlandı").

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Bugün hangi müşteri grubuna ne yapmalıyım ve geçen sefer yaptığım işe yaradı mı?" sorusunu 10 saniyede yanıtlayan, güvenli bir aksiyon merkezi.

**Yerleşim:**
- **Üst şerit (KPI'lar):** Aktif müşteri (bu işletme) · Riskteki ciro (₺, yalnız bu işletme) · Son 30 günde geri kazanılan müşteri · Son hesaplama zamanı rozeti.
- **Öncelik kuyruğu (sol, geniş):** Segment kartları "fırsat büyüklüğü" (müşteri sayısı × ort. harcama × risk) ile sıralanmış. Her kartta küçük bir sparkline (segment büyüklüğünün 8 haftalık değişimi), "Bu hafta +4" delta göstergesi, birincil buton "Önizle ve gönder" ve ikincil buton "Müşterileri gör".
- **Sağ panel (masaüstü) / alt sayfa (mobil):** Seçili aksiyonun önizlemesi. Alıcı sayısı, atlananlar (cooldown/izin), düzenlenebilir mesaj, kanal ve zamanlama; "N kişiye gönder" onayı.
- **Alt bölüm:** "Son aksiyonlar" zaman çizelgesi. Gönderilen, açılan, geri dönen kişi ve tahmini ciro etkisi.

**Motion / 3B:** 3B burada yersiz. Ölçülü framer-motion (`m as Motion`) yeterli: önizleme panelinin kayarak açılması, gönderim sonrası kartın "gönderildi" durumuna yumuşak geçişi ve KPI sayılarının yumuşak sayaçla gelmesi. Hepsi `useReducedMotion` ile kapatılabilir olmalı. Kart listesinde sıralama değiştiğinde `layout` animasyonu kullanılabilir.

**Veri / API değişiklikleri:**
- `DealerCustomerMetrics` (bayi × müşteri) tablosu + etiket tabanlı segmentler; hesaplama günlük toplayıcıya eklenir.
- `GET /api/dealer/segment-actions` → `{ segments[{key, count, revenue, avgChurn, trend[], action{type,label,resultKind}}], unsegmentedCount, calculatedAt }`.
- `POST /api/dealer/segment-actions/{type}/preview` → alıcı sayısı, atlananlar, mesaj taslağı.
- `POST /api/dealer/segment-actions/{type}/execute` (`Idempotency-Key`) → `SegmentActionRun` kaydı + `createMany` bildirim + cooldown.
- `GET /api/dealer/segment-actions/runs` → geçmiş ve sonuç ölçümü (gönderimden sonraki 14 gün içinde `Consumption` kaydı olan alıcılar).
- Rol: STAFF için salt okunur görünüm; gönderme yetkisi rol iznine bağlanır (ekip modülü izinleriyle uyumlu).

---

## Çakışmalar / birleştirme önerisi

| Sayfa | Çakışma |
|---|---|
| `/dealer/customers` | Aynı global CLV ve segment verisini liste olarak gösteriyor (`app/dealer/customers/page.tsx:21,110-145`). Segment kartları bu sayfanın "segment görünümü" sekmesi olmalı; drill-down doğal olarak buraya bağlanır. |
| `/dealer/radar` (win-back) | Uyuyan müşteri listesi ve gerçek win-back gönderimi (`userIds` + `offerType`) burada çalışıyor. "Uyuyan" aksiyonu bu akışın önizleme modalını yeniden kullanmalı. |
| `/dealer/churn-risk` | Risk tanımı farklı: yalnız bu işletmenin QR geri bildirimleri. Aynı müşteri iki sayfada iki farklı risk değeriyle görünüyor. Tek bir risk tanımına inilmeli. |
| `/dealer/innovation` | Segment kampanya önerileri (`sleeping`/`loyal`/`first_visit`) ve onay → gönder akışı burada (`app/dealer/innovation/page.tsx:113-131,269-298`). Bu sayfanın VIP/Sadık/Yeni aksiyonları aslında bu akışın kırık bir kısayolu. |
| `/dealer/campaigns` | Kendi `targetSegment` sözlüğü var (`all/vip/loyal/active/risk`, `app/dealer/campaigns/page.tsx:38-44`). CLV segment adlarıyla eşleşmiyor; üçüncü bir segment sözlüğü. |

**Öneri:** Sayfayı kaldırmak yerine **"Müşteriler & Segmentler"** adında tek bir merkezde `/dealer/customers` ile birleştirin. Sekmeler: Segmentler (bu sayfanın yeni hali) · Müşteri listesi · Risk. Aksiyon yürütme tek bir sunucu servisinde toplansın (`lib/segment-actions/`). `/dealer/radar` ve `/dealer/innovation`'daki segment kampanyaları bu servisi kullansın; `/dealer/campaigns` aynı segment sözlüğünü paylaşsın. Böylece üç farklı segment tanımı ve dört farklı gönderim yolu tek bir modele iner.

---

## Doğrulama (şüpheci inceleme)

Her iddia çağıran ve çağrılan taraflar baştan okunarak çürütülmeye çalışıldı. Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Win-back ve segment-proposals aksiyonları her zaman 400 dönüyor (4/5 buton bozuk): **DOĞRULANDI**

- İstemci her aksiyona yalnız `{ segment, source }` gönderiyor (`app/dealer/segment-actions/page.tsx:74-77`). Uç noktaya göre gövde ayrıştırılmıyor.
- `/api/dealer/win-back` POST: `userIds` yoksa koşulsuz `400 'No users selected'` dönüyor (`app/api/dealer/win-back/route.ts:108-110`). `offerType` kontrolüne (`:137-139`) hiç ulaşılmıyor bile. "Uyuyan" butonu hiçbir veri durumunda başarılı olamaz.
- `/api/dealer/innovation/segment-proposals` POST: `segmentKey` zorunlu bir `z.enum(['sleeping','loyal','first_visit'])` (`route.ts:11-16`). Gövdede bu alan yok, bu yüzden `safeParse` başarısız oluyor ve 400 dönüyor (`:56-59`; zod `^3.22.4` ile mesaj "Required"). Özellik bayrağı kapalıysa önce 403 dönüyor (`:46-49`). İki durumda da VIP, Sadık ve Yeni butonları başarısız oluyor.
- Ayrıca VIP için uygun bir `segmentKey` yok: enum'da `vip` değeri bulunmuyor. Gövde düzeltilse bile VIP'in eşlenebileceği bir şablon yok.
- Testler (`__tests__/lib/segment-action-center.test.ts`) yalnız `endpoint` dizgesini doğruluyor; istek gövdesini ve sözleşmeyi hiç test etmiyor. İddia doğru.
- **Yeniden üretim:** Uyuyan müşterisi olan bir bayi olarak "Win-back kampanyası" butonuna tıklayın. Kırmızı "No users selected" bildirimi çıkar. VIP/Sadık/Yeni için "Required" (ya da "Özellik devre dışı") çıkar.
- Ek gözlem: Sayfa GET'i STAFF rolüne açık (`app/api/dealer/segment-actions/route.ts:17`), ancak win-back yalnız DEALER'a (`win-back/route.ts:97`), risk-segment ise DEALER/ADMIN'e (`risk-segment/route.ts:22`) açık. STAFF kullanıcısı butonları görüyor ama 403 alıyor.

### 2. Risk segmenti aksiyonu onaysız gerçek gönderim yapıyor, idempotency/cooldown yok, farklı kitleye gidiyor: **DOĞRULANDI**

- Tek tık, önizleme ya da onay olmadan doğrudan `prisma.notification.create` çalıştırıyor (`app/api/dealer/campaigns/risk-segment/route.ts:54-71`). Sayfadaki yorum "kampanya taslağı üretir" diyor (`page.tsx:68-69`), ama bu uç nokta taslak üretmiyor, gerçek bildirim gönderiyor.
- Tekilleştirme yalnız tek istek içinde yapılıyor (`seen` Set, `:52-56`). Önceki gönderimleri kontrol eden bir kayıt ya da cooldown yok. `analyticsEvent` yalnız günlüğe yazılıyor (`:73-80`) ve tekrar gönderimi engellemiyor. Her tıklama aynı kişilere yeni bir bildirim gönderiyor.
- Kitle farklı. Kart, platform genelindeki CLV `Risk Altında` segmentinin sayısını gösteriyor. Bu segment, tüm işletmelerden gelen `Feedback` ve `ConsumptionReview` churn ortalamasına göre `predictedChurn >= 0.5` olan müşterilerden oluşuyor (`lib/clv-core.ts:56,93-119`). Uç nokta ise yalnız bu bayinin QR kodlarına son 1 ayda bırakılmış `churnRisk >= 0.5` geri bildirimlerinden en fazla 50 satır seçiyor (`risk-segment/route.ts:38-49`). Kartta "12 müşteri" görünürken bildirim 0 kişiye ya da tamamen farklı kişilere gidebilir. Satırlar tekilleştirilmeden önce `take` uygulandığı için benzersiz alıcı sayısı 50'nin altında da kalabilir.
- İstemci yanıttaki `sent` alanını okumuyor ve her durumda "hazırlandı ✓" gösteriyor (`page.tsx:79-81`). `sent: 0` olsa bile başarı mesajı çıkıyor.
- İzin/tercih: Şemada ve `lib`/`app/api` altında pazarlama izni ya da bildirim tercihi alanı bulunamadı. Bu eksiklik bu uç noktaya özgü değil, platform genelinde bir boşluk. Bu yüzden bu alt iddia "kontrol yok" olarak doğru, ancak tek başına bu sayfanın hatası sayılmamalı.
- **Yeniden üretim:** Son 30 günde bu bayiye `churnRisk >= 0.5` olan geri bildirim bırakmış bir müşteri varken "Flash teklif gönder" butonuna 3 kez tıklayın. Müşterinin bildirim kutusunda 3 adet "Sizi dinliyoruz" kaydı oluşur.

### 3. Platform geneli CLV bayiye gösteriliyor (çapraz işletme veri sızıntısı): **DOĞRULANDI**

- `CustomerLifetimeValue` her kullanıcı için tek satır tutuyor (`userId @unique`) ve `dealerId` alanı yok (`prisma/schema.prisma:2069-2087`).
- Hesaplama dealer filtresi kullanmıyor: `consumption.groupBy({ by: ['customerId'] })` tüm işletmeleri topluyor (`lib/clv-core.ts:80-87`), churn da tüm işletmelerin feedback ve review kayıtlarından geliyor (`:93-119`).
- Route, yalnız müşteri kümesini bayiye göre süzüyor (`app/api/dealer/segment-actions/route.ts:37-41`). Değerleri ise süzülmemiş, global CLV satırlarından alıyor (`:50-63`). Sayfa bunları "Toplam değer" ve "ort. ₺" olarak gösteriyor (`page.tsx:137,152`).
- **Yeniden üretim:** Müşteri M, A bayisinde 100 ₺, B bayisinde 9.000 ₺ harcamış olsun. A bayisinin panelinde M "VIP" (>= 5000) segmentinde ve tek kişi olarak görünür. Kartta "1 müşteri · ort. ₺9.100" yazar. A bayisi böylece müşterinin rakip işletmelerdeki harcamasını öğrenir. Benzer şekilde B'de çok aktif olan bir müşteri A'da 30+ gündür pasif olsa bile A'da "Uyuyan" sayılmaz (global `lastPurchaseAt` kullanıldığı için). Pasif olmadığı halde B'nin olumsuz geri bildirimleri yüzünden "Risk Altında" da sayılabilir.
- Not: Toplam bir değer gösteriliyor, kişi adı gösterilmiyor. Ancak tek kişilik segmentlerde bu değer kişiye özel veriye dönüşüyor. Raporun "Çakışmalar" bölümünde belirtildiği gibi `/dealer/customers` aynı global CLV'yi müşteri bazında gösteriyor. Sızıntı yalnız bu sayfayla sınırlı değil.
