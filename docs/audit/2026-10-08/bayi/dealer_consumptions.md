# /dealer/consumptions

**Amaç:** İşletmenin (bayinin) fiziksel kart/QR taramasıyla kaydettiği tüketim (işlem) kayıtlarını kronolojik olarak listelemek. Müşteri, kartın son 4 hanesi, tarih, ürün, bayi notu, tutar ve (varsa) müşterinin bu tüketime bıraktığı puan görülür.

**Genel puan:** 4.5 / 10

**Karar:** yeniden tasarla. Sayfa çalışıyor ama salt okunur, filtresiz ve sayfalamalı bir "ham liste" olarak kalmış. Sayfayı besleyen API dosyasının POST yolunda ise puan ekonomisini doğrudan kıran kritik bir açık var. Bu açık ayrıca ele alınmalı.

> Kapsam: `app/dealer/consumptions/page.tsx` (216 satır), `app/dealer/consumptions/layout.tsx`, `app/dealer/layout.tsx`, `app/api/dealer/consumptions/route.ts` (GET + POST), `prisma/schema.prisma` (Consumption, ConsumptionReview, PhysicalCard), `lib/utils.ts#formatCurrency`, `lib/api-http.ts`, `lib/api-auth.ts#requireAuth`, `components/providers.tsx`, `app/api/happy-hour/route.ts`, `lib/seasonal-campaign-live.ts`, `messages/{tr,en}.json`, `next.config.js` (images). Kod çalıştırılmadı; tüm bulgular kod okunarak doğrulandı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Listeleme ve sayfalama çalışıyor. Ancak hata durumu yok, filtre/arama/dışa aktarma/detay da yok. Hata olunca "kayıt yok" gösteriliyor. |
| UX | 4/10 | Satırların hover efekti tıklanabilir izlenimi veriyor ama satırlar hiçbir yere gitmiyor. Puan rozeti "4 Puan" diye yazılıyor ve sadakat puanıyla karışıyor. Sayfa numarası URL'de tutulmuyor. |
| Görsel | 6/10 | Temiz ve tutarlı bir kart yapısı var. Ancak panelin geri kalanındaki `DashboardPageHero` yerine elle yazılmış bir hero kullanılmış. KPI hiyerarşisi yok. |
| Mimari | 3/10 | Veri çekme ham `fetch` + `useEffect` ile yapılıyor; yarış koruması ve `res.ok` kontrolü yok. React Query hazır olduğu hâlde kullanılmıyor. Aynı route dosyasındaki POST, puan ekonomisi değişmezlerini çiğniyor. |
| Performans | 6/10 | Sorgular indeksli (`@@index([dealerId, createdAt])`) ve `Promise.all` ile paralel. Ancak oturum her yenilendiğinde liste baştan çekiliyor, iskelet yeniden yanıp sönüyor ve kullanılmayan alanlar (email, review.text, category) gereksiz yere taşınıyor. |
| Erişilebilirlik + Mobil | 5/10 | Mobilde satırlar doğru biçimde alt alta diziliyor. Ancak toplam sayaç mobilde gizli, amber rozetin kontrastı düşük ve sayfa değişimi ekran okuyucuya duyurulmuyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa meta başlığı/açıklaması (segment layout) | KISMİ | `app/dealer/consumptions/layout.tsx:4-6`, `messages/tr.json:77-78` | Açıklama "Kullanım akışı, **anomali** ve ürüne bağlı taramalar" diyor ama sayfada anomali özelliği yok. Vaat ile içerik uyuşmuyor. |
| 2 | Kenar menü + Keşfet girişi | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:258`, `app/dealer/discover/page.tsx:69`, `lib/visibility-controls.ts:49` | Menüde "feedback" grubunda yer alıyor. Konum tartışmalı (bkz. Çakışmalar). |
| 3 | Rol/oturum koruması (API) | ÇALIŞIYOR | `app/api/dealer/consumptions/route.ts:31-33` | `requireAuth(['DEALER','ADMIN'])` ve token-replay kontrolü var. |
| 4 | Veri kapsamı: yalnız kendi kayıtları (IDOR koruması) | ÇALIŞIYOR | `route.ts:42,84` | `where: { dealerId: session.user.id }`. Başka bayinin verisine erişim yolu yok. |
| 5 | ADMIN erişimi | KISMİ | `route.ts:31,42` | ADMIN API'ye girebiliyor ama kendi ID'siyle filtreleniyor, bu yüzden liste her zaman boş geliyor. Bayi seçici (impersonation) yok. |
| 6 | Hero başlık + açıklama | ÇALIŞIYOR | `page.tsx:65-79` | Elle yazılmış gradient header. Diğer 25 bayi sayfası `DashboardPageHero` kullanıyor. |
| 7 | "Toplam işlem" sayacı | KISMİ | `page.tsx:80-85` | `hidden sm:block`: mobilde hiç görünmüyor. Yalnızca kayıt sayısını veriyor; ciro ya da ortalama sepet yok. |
| 8 | "İşlem listesi" kart başlığı | ÇALIŞIYOR | `page.tsx:90-92` | |
| 9 | Liste veri çekme (sayfa başı 15) | KISMİ | `page.tsx:42-60` | `res.ok` kontrol edilmiyor. Yarış koruması (AbortController) yok. Bağımlılık `session` nesnesi olduğu için gereksiz tekrar çekmeler oluyor (Bulgu B4). |
| 10 | Yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:94-106` | Her sayfa değişiminde ve her oturum yenilemesinde tüm liste iskelete dönüyor. |
| 11 | Boş durum | KISMİ | `page.tsx:107-112` | "Tarama yap" (`/dealer/scan`) gibi bir CTA yok. Ağ/sunucu hatasında da bu ekran görünüyor. |
| 12 | Hata durumu | EKSİK | `page.tsx:53-56` | Hata yalnızca `console.error` ile loglanıyor. Kullanıcıya mesaj ya da "yeniden dene" seçeneği gösterilmiyor. |
| 13 | Müşteri avatarı (resim / baş harf / ikon) | KISMİ | `page.tsx:124-130`, `next.config.js:270-291`, `app/api/user/profile/route.ts:13` | `image` alanına müşteri istediği URL'yi yazabiliyor. `remotePatterns` dışındaki hostlarda prod'da görsel kırık çıkar, dev'de `next/image` hata fırlatır (prod davranışı Next.js iç mantığına dayanıyor, çalıştırılarak doğrulanmadı). |
| 14 | Müşteri adı + "İsimsiz Müşteri" yedeği | ÇALIŞIYOR | `page.tsx:133-135` | |
| 15 | Kartın son 4 hanesi | ÇALIŞIYOR | `route.ts:87-95`, `page.tsx:137-139` | Maskeleme sunucuda yapılıyor (iyi). İstemcideki `substring(length-4)` gereksiz. `card.id` (iç ID) da yanıtla birlikte gidiyor. |
| 16 | Tarih/saat (yerel ayarlı) | ÇALIŞIYOR | `page.tsx:141` | Göreli zaman ("2 saat önce") yok. |
| 17 | Ürün rozeti | ÇALIŞIYOR | `page.tsx:145-149` | Kategori adı/ikonu API'den geliyor (`route.ts:66-72`) ama gösterilmiyor. |
| 18 | Bayi notu | ÇALIŞIYOR | `page.tsx:150-155` | Uzun notlarda kırpma ya da genişletme yok. |
| 19 | Tutar | KISMİ | `page.tsx:161-168`, `lib/utils.ts:77-82` | `formatCurrency` her zaman `tr-TR` + `TRY` kullanıyor. EN arayüzde de "₺1.234,50" görünüyor. `amount === 0` değeri "-" olarak gösteriliyor (truthy kontrolü). |
| 20 | Değerlendirme rozeti (yıldız + puan) | KISMİ | `page.tsx:171-174`, `messages/tr.json:911` | "4 Puan" metni sadakat puanıyla karışıyor. Yorum metni (`review.text`) API'den geliyor ama gösterilmiyor. Rozet tıklanamıyor; yoruma, yanıta ya da telafiye (remedy) geçiş yok. |
| 21 | "Değerlendirme yok" rozeti | ÇALIŞIYOR | `page.tsx:175-177` | Müşteriye "yorum hatırlat" aksiyonu yok. |
| 22 | Satır giriş animasyonu (stagger) | ÇALIŞIYOR | `page.tsx:116-121`, `components/providers.tsx:232` | Global `MotionConfig reducedMotion="user"` sayesinde azaltılmış hareket destekleniyor. |
| 23 | Satır hover efekti | SAHTE | `page.tsx:121` | `hover:bg-muted/30` tıklanabilirlik izlenimi veriyor ama satırda `onClick`/link yok. |
| 24 | Sayfa bilgisi "Sayfa x / y" | ÇALIŞIYOR | `page.tsx:185-189` | `aria-live` yok. |
| 25 | Önceki/Sonraki butonları | KISMİ | `page.tsx:191-208` | Çalışıyor. Ancak hızlı tıklamada yarış koşulu var, sayfa değişince yukarı kaydırma yapılmıyor ve sayfa numarası URL'de tutulmuyor. |
| 26 | Yerel `LazyMotion strict` sarmalayıcı | KISMİ | `page.tsx:5,63,214`, `components/providers.tsx:241` | Global LazyMotion zaten var; bu sarmalayıcı gereksiz. Proje kuralı `m as Motion` deseni, bu dosyada uygulanmamış. |
| 27 | URL'de sayfa/filtre durumu | EKSİK | `page.tsx:40` | Sayfa durumu yalnızca `useState`'te; sayfa yenilenince ya da link paylaşılınca 1. sayfaya dönülüyor. |
| 28 | Tarih aralığı filtresi | EKSİK | — | |
| 29 | Ürün/kategori filtresi | EKSİK | — | |
| 30 | "Değerlendirildi / değerlendirilmedi / düşük puan" filtresi | EKSİK | — | |
| 31 | Müşteri/not araması | EKSİK | — | |
| 32 | Sıralama (tutar, tarih, puan) | EKSİK | — | API'de sabit `createdAt desc` (`route.ts:45`). |
| 33 | Dışa aktarma (CSV/Excel) | EKSİK | — | |
| 34 | Özet KPI'lar (ciro, ortalama sepet, yorum dönüşüm oranı, tekrar eden müşteri) | EKSİK | — | |
| 35 | Kayıt detayı (drawer) | EKSİK | — | Satır → detay → yorum, yanıt ve remedy akışı yok. `app/api/dealer/consumption-reviews/[id]/remedy` mevcut ama bu sayfadan bağlantı yok. |
| 36 | Hatalı kaydı iptal/düzeltme (puan geri alma ile) | EKSİK | `grep consumption.update/delete` | Bayi tarafında iptal ya da düzeltme ucu yok. Yalnızca admin kart silerken kayıtlar siliniyor (`app/api/admin/cards/[id]/route.ts:201`). |
| 37 | Kaydı oluşturan personel | EKSİK | `prisma/schema.prisma:1574-1600` | `Consumption` modelinde personel ya da lokasyon alanı yok. |
| 38 | Anomali işaretleme (metadata'da vaat ediliyor) | EKSİK | `messages/tr.json:78` | |
| 39 | Canlı güncelleme (yeni tarama düşünce) | EKSİK | — | Layout'ta `RealtimeNotifications` var (`app/dealer/layout.tsx:48`) ama liste ona bağlı değil. |
| 40 | Mobil düzen (satır alt alta, ayırıcı) | ÇALIŞIYOR | `page.tsx:121,160` | |

**Durum sayıları:** ÇALIŞIYOR 15 · KISMİ 11 · BOZUK 0 · SAHTE 1 · EKSİK 13 (toplam 40)

---

## Bulgular

### B1. KRİTİK · Güvenlik/Ekonomi · Tüketim POST'u sınırsız çarpanla puan basıyor ve fraud dedektörüne görünmüyor
- **Kanıt:** `app/api/happy-hour/route.ts:121,132` (`multiplier` hiç doğrulanmıyor; `multiplier || 2.0`, üst sınır yok) → `app/api/dealer/consumptions/route.ts:312-326` (bayinin aktif happy-hour'larındaki en yüksek çarpan, **BASE_XP_CAP uygulandıktan sonra** ve tavansız biçimde çarpılıyor) → `route.ts:335-350` (ham `prisma.user.update({ points: { increment } })`; `analyticsEvent 'points_credited'` yazılmıyor).
- **Sorun:** Kötü niyetli bir bayi `multiplier: 1000000` ile bir happy hour oluşturup kendi ikinci müşteri hesabının kartına dakikada 5 tüketim girerse, her işlemde `floor(1000*0.05*1e6) = 50.000.000` puan basılır. `BASE_XP_CAP` yalnızca çarpandan önceki değeri sınırlıyor. Ayrıca bu yol `points_credited` olayı yazmadığı için `lib/points-caps.ts` ve `lib/points-velocity.ts` bu kredileri hiç görmüyor. Bu, projenin puan ekonomisi değişmezlerinin (madde 3) açık ihlali.
- **Profesyonel öneri:**
  1. Happy hour şemasına zod ile `multiplier: z.number().min(1).max(3)` gibi bir sınır koyun. DB tarafında da `CHECK` kısıtı ya da sunucuda clamp uygulayın.
  2. Tüketim yolunda nihai `passivePoints` için mutlak bir tavan belirleyin (ör. `PASSIVE_POINTS_MAX_PER_CONSUMPTION`). Ayrıca kart+bayi başına günlük toplam bir tavan ekleyin.
  3. Kredi işlemini `creditPointsAndXp` ile, `points_credited` (`category: 'consumption_passive'`) olayıyla aynı `$transaction` içinde yapın.
  4. Bayinin kendi hesabıyla ilişkili kartlara (aynı cihaz, IP ya da e-posta alan adı) kredi verilmesine velocity sinyali ekleyin.
- **Efor:** M

### B2. YÜKSEK · Veri bütünlüğü · Tüketim oluşturma atomik değil; kısmi hata çift kayıt ve çift puana yol açıyor
- **Kanıt:** `route.ts:240` (consumption.create), `:268` (auditLog), `:284` (notification), `:312-351` (puan). Hepsi ayrı ayrı `await` ediliyor ve tek bir transaction içinde değil. Hata durumunda `:378-385` 500 döndürüyor.
- **Sorun:** Kayıt oluştuktan sonra bildirim ya da puan adımı patlarsa bayi "kaydedilemedi" mesajı görür. Tarama ekranında yeniden denediğinde (`app/dealer/scan/page.tsx:305-321`) ikinci bir kayıt oluşur. İdempotency anahtarı da yok.
- **Profesyonel öneri:** Kayıt, audit ve puan kredisini tek bir `prisma.$transaction` içine alın. Bildirimi ve ısı haritasını `after()` ile transaction dışına taşıyın. İstemcinin ürettiği bir `idempotencyKey` (UUID) ekleyin ve `Consumption` üzerinde `@@unique([dealerId, idempotencyKey])` tanımlayın.
- **Efor:** M

### B3. YÜKSEK · UX/Hata yönetimi · Hata durumu yok; ağ ya da sunucu hatasında "Kayıt bulunamadı" gösteriliyor
- **Kanıt:** `page.tsx:47-56` (`res.ok` yok; `data.success` false olunca state güncellenmiyor; `catch` yalnızca loglama yapıyor), `page.tsx:107-112` (başlangıç state'i `[]` olduğu için boş durum devreye giriyor).
- **Sorun:** DB kesintisinde (`responseIfDatabaseUnavailable` 503) bayi "Henüz işletmenize ait bir tüketim kaydı yok" mesajını görüyor. Bu yanlış bir iş sinyali. Ayrıca `session.user.id` yoksa (`:44`) `loading` sonsuza kadar `true` kalıyor.
- **Profesyonel öneri:** Veri çekmeyi `useQuery(['dealer-consumptions', filters, page])` ile React Query'ye taşıyın (`QueryClientProvider` zaten var: `components/providers.tsx:222`). `isError` için "yeniden dene" butonlu bir hata kartı gösterin. Sayfa değişiminde `placeholderData: keepPreviousData` kullanarak liste iskelete dönmesin.
- **Efor:** S

### B4. ORTA · Performans/Mimari · Oturum yenilemesi listeyi baştan çekiyor; yarış koşulu var
- **Kanıt:** `page.tsx:60` (`[session, page]` bağımlılığı), `components/providers.tsx:220` (`SessionProvider refetchInterval={300} refetchOnWindowFocus`). Abort edilmeyen fetch: `page.tsx:47`.
- **Sorun:** next-auth v4 her yenilemede yeni bir `session` nesnesi üretiyor. Bunun sonucunda sekmeye her dönüşte ve 5 dakikada bir liste iskelete dönüp yeniden yükleniyor (next-auth iç davranışına dayanıyor, çalıştırılarak doğrulanmadı). Hızlı "Sonraki/Önceki" tıklamalarında geç gelen yanıt, gösterilen sayfa numarasıyla uyuşmayan veriyi ekrana basabilir.
- **Profesyonel öneri:** Bağımlılığı `session?.user?.id` ile sınırlayın ya da B3'teki React Query geçişiyle sorunu kökten çözün; query anahtarı ve iptal mekanizması otomatik gelir.
- **Efor:** S

### B5. ORTA · UX/Bilgi mimarisi · Puan rozeti yanıltıcı, yorum içeriği gizli, satır aksiyonsuz
- **Kanıt:** `page.tsx:171-174` ("{rating} Puan"), `messages/tr.json:911`; `review.text` API'den geliyor (`route.ts:75-80`) ama render edilmiyor; `page.tsx:121` hover efekti var ama tıklama yok.
- **Sorun:** Qratex'te "puan" sözcüğü sadakat puanını anlatıyor. "4 Puan" metni, müşterinin 4 sadakat puanı kazandığı gibi okunabilir. Bayi düşük puanlı (1-2 yıldız) bir işlemi listede görüyor ama yoruma ulaşamıyor, yanıt veremiyor ya da telafi başlatamıyor.
- **Profesyonel öneri:** Rozeti "★ 4/5" biçimine çevirin ve renk skalası ekleyin (1-2 kırmızı, 3 nötr, 4-5 yeşil). Satırı bir `Sheet` (sağ çekmece) açacak biçimde tıklanabilir yapın. Çekmecede yorum metni, boyut puanları (`dimensions`), bayi yanıtı (`dealerReply`), "AI ile yanıt öner" ve "Telafi teklif et" (`/api/dealer/consumption-reviews/[id]/remedy`) yer alsın.
- **Efor:** M

### B6. ORTA · i18n · Para birimi her dilde Türkçe biçimde; sunucu hata metinleri sabit Türkçe
- **Kanıt:** `lib/utils.ts:77-82` (`'tr-TR'` sabit), `page.tsx:164`; `route.ts:115,161,168,175,197` (Türkçe sabit hata metinleri).
- **Sorun:** EN arayüzde tarih "Oct 08, 2026" olarak yerelleşiyor ama tutar "₺1.234,50" biçiminde kalıyor; bu bir dil karışıklığı.
- **Profesyonel öneri:** `formatCurrency(amount, currency, locale)` imzasını yerel ayarı alacak biçimde genişletin ve sayfada `useAppLocale` ile çağırın. API hatalarını `code` alanıyla dönün (`CARD_NOT_FOUND` vb.); istemci bunları i18n anahtarına eşlesin.
- **Efor:** S

### B7. ORTA · Gizlilik · Kullanılmayan PII ve iç ID'ler yanıtla birlikte gidiyor
- **Kanıt:** `route.ts:53-59` (`email` seçiliyor ama sayfa kullanmıyor), `route.ts:49,63,69,77` (`card.id`, `product.id`, `category.id`, `review.id` dönüyor), `route.ts:91-94` (`...row` yayılımı `customerId` ve `dealerId` alanlarını da yanıta ekliyor).
- **Sorun:** Route içindeki yorum "Ham müşteri ID'si bayiye sızdırılmaz" diyor (`:54`). Ancak `...row` yayılımı Consumption satırındaki **`customerId`** alanını yanıta koyuyor. Prisma `include` kullanıldığında skaler alanların tamamı döner. Yani ham müşteri ID'si bayiye sızıyor ve bu, koddaki kendi gizlilik niyetiyle çelişiyor. E-posta ise `/dealer/customers` sayfasında zaten gösteriliyor (`app/dealer/customers/page.tsx:123`); bu yüzden e-posta yeni bir sızıntı sayılmaz ama gereksiz.
- **Profesyonel öneri:** `include` yerine açık bir `select` kullanın. Yanıtta yalnızca görüntülenen alanları bir DTO olarak döndürün (`id, amount, note, createdAt, cardLast4, customer{name,image}, product{name,categoryName}, review{rating,hasText}`). `customerId` gerekiyorsa opak bir müşteri anahtarı (HMAC) kullanın.
- **Efor:** S

### B8. ORTA · Tasarım tutarlılığı · Panel standardı dışında hero; proje motion kuralına aykırı yerel LazyMotion
- **Kanıt:** `page.tsx:65-87` (elle yazılmış header); `app/dealer/scan/page.tsx:34,352` ve 25 bayi sayfası `DashboardPageHero` kullanıyor; `page.tsx:5,63` (`LazyMotion strict` + `m`); global sağlayıcı `components/providers.tsx:241`.
- **Sorun:** Görsel dil sayfadan sayfaya kayıyor (ikon kutusu, eyebrow ve ton farklı). Gereksiz iç içe bir `LazyMotion` var ve proje genelindeki `m as Motion` desenine uyulmamış.
- **Profesyonel öneri:** `DashboardPageHero` kullanın (eyebrow: "Operasyon", ikon: History) ve KPI şeridini hero'nun altına taşıyın. Yerel `LazyMotion` kaldırılsın, `import { m as Motion }` deseni uygulansın.
- **Efor:** S

### B9. DÜŞÜK · Görsel/Erişilebilirlik · Kontrast, duyurular ve mobil sayaç
- **Kanıt:** `page.tsx:172` (`text-amber-500` + `bg-amber-500/10`, xs boyutta açık temada WCAG AA eşiğinin altında; hesap yapılmadı, tasarım değerlendirmesi), `page.tsx:81` (`hidden sm:block`), `page.tsx:187` (`aria-live` yok), `page.tsx:138,152,173` (ikonlarda `aria-hidden` yok).
- **Profesyonel öneri:** Rozet metnini `text-amber-700 dark:text-amber-400` yapın. Toplam sayaç mobilde de görünsün (kompakt KPI çipleri). Sayfa bilgisine `aria-live="polite"` ekleyin, dekoratif ikonlara `aria-hidden`. Sayfa değişiminde liste başına `scrollIntoView` ve odak taşıma ekleyin.
- **Efor:** S

### B10. DÜŞÜK · Doğruluk · `amount === 0` ve dış avatar hostları
- **Kanıt:** `page.tsx:162` (truthy kontrolü ücretsiz ikramı "-" olarak gösteriyor); `page.tsx:126` + `next.config.js:272-291` + `app/api/user/profile/route.ts:13` (serbest URL).
- **Profesyonel öneri:** `item.amount != null` kontrolü kullanın ve 0 için "İkram" etiketi gösterin. Avatarları R2'ye proxy'leyin ya da profil API'sinde `image` alanını izinli host listesine göre doğrulayın; desen dışı URL'lerde baş harfe düşen bir `onError` yedeği ekleyin.
- **Efor:** S

---

## Eksik özellikler (kıyas: Square Dashboard "Transactions", Toast "Sales/Orders", Medallia/Qualtrics "Transactional survey response", Yelp/GBP)

1. **Filtre + arama + kaydedilebilir görünümler:** Tarih aralığı ön ayarları (bugün, 7 gün, 30 gün, özel), ürün/kategori, değerlendirme durumu (yok, 1-2, 3, 4-5), tutar aralığı ve müşteri/not araması. Tümü URL'de tutulmalı (Square Transactions standardı).
2. **Özet KPI şeridi:** Seçili aralık için ciro, işlem sayısı, ortalama sepet, tekrar eden müşteri oranı ve **yorum dönüşüm oranı** (değerlendirilen ÷ toplam işlem). Medallia'nın "response rate" metriğinin karşılığı; Qratex'in çekirdek KPI'ı olmalı.
3. **İşlem detayı + kapanış döngüsü:** Detay çekmecesinde yorum, boyut puanları, bayi yanıtı, AI yanıt önerisi ve telafi (remedy) teklifi. Düşük puanlı işlemler "Aksiyon gerekli" olarak işaretlensin (Medallia/Qualtrics closed-loop).
4. **İptal/düzeltme (void/refund) ve denetim izi:** Yanlış girilen tüketimi gerekçeyle iptal etme; basılan pasif puanın atomik olarak geri alınması; `CardAuditLog`'a `CONSUMPTION_VOIDED` kaydı. Square/Toast'ta temel bir işlev.
5. **CSV/Excel dışa aktarma** ve muhasebe için planlanmış e-posta raporu.
6. **Personel/lokasyon atfı ve anomali uyarıları:** Kaydı kim girdi, hangi şubede; aynı karta kısa sürede çok sayıda işlem ya da sıra dışı tutar gibi anomaliler (metadata zaten anomali vaat ediyor; `@@index([customerId, createdAt])` velocity için hazır).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "İşlem Defteri". Bayi sayfayı açtığında üç soruya 5 saniyede cevap alabilmeli: Bugün ne kadar işlem/ciro yaptım? Bu işlemlerin ne kadarı yoruma dönüştü? Hangi işlem benim müdahalemi bekliyor?

**Yerleşim (masaüstü):**
1. `DashboardPageHero` (eyebrow "Operasyon", sağda "Kart tara" birincil CTA → `/dealer/scan`, ikincil olarak "Dışa aktar").
2. **KPI şeridi** (4 kart): Ciro, İşlem, Ort. sepet, Yorum dönüşümü. Her birinde önceki döneme göre değişim (Δ) ve küçük bir sparkline (recharts, mevcut paketlerde var).
3. **Araç çubuğu** (sticky, `top: env(safe-area-inset-top)`): tarih ön ayarları (segmented control), ürün/kategori çoklu seçim, değerlendirme durumu çipleri ("Aksiyon bekleyen" çipi kırmızı sayaçlı), arama kutusu. Durum `useSearchParams` ile URL'de tutulur.
4. **Liste:** Masaüstünde `@tanstack/react-table` (mevcut) ile yoğun tablo görünümü: tarih (göreli + tam tarih tooltip), müşteri, kart ****1234, ürün/kategori, tutar, değerlendirme (★ 4/5 renk skalası), durum. Satır tıklanınca sağdan **Sheet** açılır.
5. **Detay Sheet:** Üst kısımda işlem özeti; altında yorum ve boyutlar, bayi yanıt editörü (`/api/ai/generate-reply` önerisi), "Telafi teklif et" ve "İşlemi iptal et" (gerekçe zorunlu, onay sayfa içinde). En altta müşterinin bu işletmedeki son 5 işlemi (CLV bağlamı).

**Mobil:** KPI'lar yatay kaydırılabilir çipler olur. Liste kart görünümüne geçer; tutar ve puan sağda. Filtreler alt sayfa (Drawer) içinde açılır. "Kart tara" butonu alt navigasyonun üstünde FAB olarak durur.

**Motion (ölçülü):** Satır stagger yalnızca ilk yüklemede (sayfa/filtre değişiminde `keepPreviousData` ve opaklık geçişi yeterli). KPI sayılarında 300 ms'lik sayaç tween'i. Yeni bir işlem canlı olarak düştüğünde liste başına `layout` animasyonlu tek satır girişi ve kısa bir emerald vurgusu. 3B gereksiz: bu sayfa bir operasyon aracı, three.js burada değer katmaz. Global `reducedMotion="user"` korunmalı.

**Veri/API değişiklikleri:**
- `GET /api/dealer/consumptions?from&to&productId&categoryId&rating=none|low|mid|high&q&sort&cursor`. Offset yerine cursor sayfalama (`createdAt,id`); açık `select` ile DTO döndürülür (B7).
- `GET /api/dealer/consumptions/summary?from&to`: tek `groupBy`/`aggregate` ile ciro, sayı, ortalama ve yorum oranı. Kısa TTL'li Upstash cache (`dealerId+range` anahtarı), POST'ta invalidasyon.
- `GET /api/dealer/consumptions/export?…`: akışlı (streaming) CSV yanıt, rate limit'li.
- `POST /api/dealer/consumptions/[id]/void`: `updateMany({ where:{id, dealerId, voidedAt:null} })` ile claim; puanın atomik geri alınması ve audit kaydı. Şemaya `voidedAt`, `voidReason`, `createdByStaffId?`, `locationId?`, `idempotencyKey?` alanları eklenir.
- POST tarafında B1 ve B2 düzeltmeleri (çarpan sınırı, tavan, `points_credited`, transaction, idempotency).
- Canlı güncelleme: mevcut `RealtimeNotifications` kanalına `consumption_created` olayı; React Query `invalidateQueries`.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/scan`:** Kaydı **oluşturan** sayfa (`app/dealer/scan/page.tsx:305`). Defter ise kaydı **listeleyen** sayfa. İkisi tek bir "İşlemler" modülü olarak düşünülmeli: defterin hero'sunda "Kart tara" CTA'sı, tarama ekranında da "Son işlemler" mini listesi ve "Tümünü gör" bağlantısı olmalı. Birleştirmek şart değil ama aralarında çift yönlü geçiş zorunlu.
- **`/dealer/reviews`:** `ConsumptionReview` verisini gösteriyor (`app/api/dealer/reviews/route.ts:46`). Bu sayfadaki puan rozeti onunla örtüşüyor. Öneri: puan ve yorumun asıl yönetimi reviews sayfasında kalsın; defter yalnızca durumu gösterip detay çekmecesinden aynı yanıt/remedy bileşenini yeniden kullansın. Bileşen paylaşılsın, sayfa kopyalanmasın.
- **`/dealer/customers` (CLV) ve `/dealer/heatmap`:** Aynı tüketim verisinin türetilmiş görünümleri. Defter, müşteri adından (opak anahtarla) müşteri profiline/CLV'ye bağlantı vermeli.
- **Menü konumu:** Şu an "feedback" grubunda (`components/dashboard/sidebar.tsx:258`). Keşfet sayfası ise onu "Operasyon" bölümünde listeliyor (`app/dealer/discover/page.tsx:69`). Bu tutarsızlık giderilmeli ve sayfa Operasyon grubuna, `/dealer/scan`'in yanına taşınmalı.
- **Karar:** Kaldırılmamalı; işletmenin tek işlem defteri bu sayfa. Yeniden tasarlanıp `/dealer/scan` ile tek bir "İşlemler" bilgi mimarisi altında toplanmalı.

---

## Doğrulama (şüpheci inceleme)

İki KRİTİK/YÜKSEK iddia (B1, B2) çürütülmeye çalışılarak kod baştan okundu. İncelenen dosyalar: `app/api/happy-hour/route.ts`, `app/api/dealer/consumptions/route.ts`, `lib/happy-hour-live.ts`, `lib/seasonal-campaign-live.ts`, `lib/validations.ts`, `lib/api-auth.ts`, `lib/auth.ts`, `proxy.ts`, `prisma/schema.prisma`, `app/api/auth/register/route.ts`, `app/api/cards/[token]/activate/route.ts`, `app/api/customer/consumptions/[id]/review/route.ts`, `app/dealer/scan/page.tsx`. Kod değiştirilmedi, DB'ye dokunulmadı.

### B1. Sınırsız happy-hour çarpanı ile puan basımı: **DOĞRULANDI (KRİTİK kalır)**

Çürütme denemeleri ve sonuçları:
- **Çarpan sunucuda sınırlanıyor mu?** Hayır. `app/api/happy-hour/route.ts:121` gövdeden `multiplier`'ı alıyor, `:132` `multiplier || 2.0` ile doğrudan yazıyor; zod/clamp yok. Şemada `multiplier Float @default(2.0)` (`prisma/schema.prisma:1817`), DB tarafında da kısıt yok. Karşılaştırma için admin sezonluk kampanyada `z.number().min(1).max(10)` var (`app/api/admin/seasonal-campaigns/route.ts:19`); happy hour'da bu disiplin unutulmuş. HappyHour için başka bir create/update yolu yok (grep).
- **Proxy ya da rol kapısı engelliyor mu?** Hayır. `proxy.ts:105-118` `/api/*` için yalnızca güvenlik/CORS başlığı ekliyor. POST yalnızca `role === 'DEALER' || 'ADMIN'` kontrolü yapıyor (`app/api/happy-hour/route.ts:116`).
- **DEALER rolü elde etmek zor mu?** Hayır. Kayıt şeması `role: z.enum(['CUSTOMER','DEALER'])` (`lib/validations.ts:39`) ve register bu rolü doğrudan yazıyor (`app/api/auth/register/route.ts:57-63`). Girişte yalnızca e-posta doğrulaması aranıyor (`lib/auth.ts:165`), bayi onayı yok.
- **Tüketim tarafında tavan var mı?** `BASE_XP_CAP` yalnızca ham taban puana uygulanıyor (`app/api/dealer/consumptions/route.ts:304-306`). Çarpan bundan **sonra** ve tavansız çarpılıyor (`:316-319`, `:324`). Ardından sezonluk kampanya (en fazla 10x) ek çarpan olarak uygulanabiliyor (`:325`). `amount` gönderilmese bile taban 50 (`:305`).
- **Fraud dedektörü görüyor mu?** Hayır. Kredi ham `prisma.user.update({ points: { increment } })` (`:340-349`); `points_credited` AnalyticsEvent yazılmıyor. `lib/points-caps.ts:22,42` ve `lib/points-velocity.ts:17,51` yalnızca bu olayı sayıyor. Diğer bütün puan basan yollar bu olayı yazıyor (`lib/badge-reward-points.ts:62`, `lib/login-streak.ts:159`, `lib/visit-missions.ts:122` vb.), bu yol istisna. Ayrıca kanonik `creditPointsAndXp` atlandığı için seviye tutarlılığı da bozuluyor.
- **Puanın gerçek değeri var mı?** Var. Puan `app/api/gamification/rewards/route.ts`, `app/api/customer/shop/route.ts` gibi yollarda harcanıyor (decrement).

**Yeniden üretim:** (1) Bayi olarak kayıt ol, e-postayı doğrula. (2) `POST /api/happy-hour` gövdesi `{"name":"x","startTime":"00:00","endTime":"23:59","daysOfWeek":[0,1,2,3,4,5,6],"multiplier":1000000}`. (3) Suç ortağı müşteri hesabı fiziksel kartını aktive etmiş olsun (`app/api/cards/[token]/activate/route.ts:75`). (4) `POST /api/dealer/consumptions` gövdesi `{"cardToken":"<token>","amount":100}`. Hesap: `floor(1000 × 0.05 × 1e6) = 50.000.000` puan. Rate limit kart+bayi başına dakikada 5 (`:23`, `:191`), yani kart başına dakikada yaklaşık 250 milyon puan. Not: `User.points` `Int` (`prisma/schema.prisma:47`); ~2,1 milyar sınırına gelince increment hata verir. Bu durum sömürüyü sınırlamaz (hesap birkaç işlemde tavana dolar), yalnızca B2'deki "yarım kalan kayıt" durumunu tetikleyen ek bir yol açar.

**Düzeltme yaklaşımı:** (a) Happy hour POST'una zod şeması eklenmeli: `multiplier: z.number().min(1).max(3)` (ürün kararı), `HH:mm` regex'i, `daysOfWeek` 0-6 tamsayı dizisi. (b) Tüketim tarafında savunma derinliği olarak çarpan `clamp(1, MAX_HH_MULTIPLIER)` ile tekrar sınırlanmalı ve çarpanlar sonrası **nihai** pasif puana mutlak bir tavan konmalı (`PASSIVE_POINTS_CAP`). (c) Kredi `creditPointsAndXp` + aynı tx içinde `points_credited` (`category: 'consumption_passive'`, `dealerId`, `happyHourId`, `multiplier`) olarak yazılmalı. Böylece caps/velocity bu yolu görür. (d) Bayi-müşteri çifti başına günlük pasif puan tavanı ve "aynı bayi-aynı müşteri yüksek frekans" sinyali velocity dedektörüne eklenmeli. (e) Canlıdaki mevcut `HappyHour` satırlarında `multiplier > 3` olanlar admin panelinde listelenip incelenmeli (salt okunur sorgu ile, ayrı bir operasyon olarak).

### B2. Tüketim oluşturma atomik değil: **DOĞRULANDI (KISMEN) · şiddet YÜKSEK değil ORTA**

Doğru olan kısım: `consumption.create` (`app/api/dealer/consumptions/route.ts:240`), `cardAuditLog.create` (`:268`), `notification.create` (`:284`), happy-hour sorgusu (`:312`), squad sorgusu (`:329`) ve puan kredisi (`:335-349`) ayrı ayrı await ediliyor; ortak transaction ve idempotency anahtarı yok. `:240` sonrasındaki herhangi bir adım atarsa `catch` 500 ya da 503 döner (`:378-385`) ve `Consumption` satırı kalıcı olur.

Çürütülen kısımlar:
- **"Çift puan" iddiası tutmuyor.** Puan kredisi, hata verebilecek **son** DB adımı. Sonrasında yalnızca `.catch`'li ateşle-unut dinamik importlar (`:355-368`) ve `NextResponse.json` var. Yani bir istek 500 dönmüşse puan ya hiç yazılmamıştır (kredi öncesi hata) ya da squad dalında `$transaction` ile atomik olarak geri alınmıştır (`:335`). Yeniden deneme toplamda **tek** kredi üretir, iki değil.
- **"Bayi ekranı yeniden gönderiyor" kısmı abartılı.** `app/dealer/scan/page.tsx:318-321` hata durumunda yalnızca toast gösterip dönüyor; otomatik retry yok. Form açık kaldığı için (`setShowConsumptionForm(false)` yalnızca başarıda, `:324`) yeniden deneme **bayinin elle** tekrar basmasıyla oluyor. In-memory 12 sn aralık (`:188-190`) aynı instance'ta hızlı tekrarı 429'a düşürüyor, 12 sn sonrası geçiyor.

**Gerçekçi yeniden üretim:** Neon geçici bağlantı hatası ya da B1'deki `Int` taşması `:284` veya `:340` noktasında patlar. API 500 döner ve 1. `Consumption` satırı audit log'suz, puansız ve (hata konumuna göre) bildirimsiz kalır. Bayi 12 sn sonra "Kaydet"e tekrar basar, 2. satır tam olarak oluşur. Sonuç: müşteri ekranında aynı alım iki kez görünür. Her `Consumption` bir `ConsumptionReview` hakkı verdiği için müşteri ikinci bir yorum ödülü alabilir. Bu ödül `capFeedbackPoints` ve `points_credited` ile günlük tavana tabi (`app/api/customer/consumptions/[id]/review/route.ts:187,202`), dolayısıyla etkisi sınırlı. Bayi defteri/ciro KPI'ları ve heatmap şişer, kart audit trail'inde de bir kayıt eksik olur.

**Düzeltme yaklaşımı:** (a) `consumption.create` + `cardAuditLog.create` + `notification.create` + puan kredisi + `points_credited` tek `prisma.$transaction(async tx => …)` içinde toplanmalı. Happy-hour/sezon/squad okumaları tx öncesine alınabilir. (b) İstemci her form açılışında bir `idempotencyKey` (UUID) üretip POST'a eklemeli; şemaya `Consumption.idempotencyKey String? @unique` (ya da `@@unique([dealerId, idempotencyKey])`) eklenmeli. Çakışmada mevcut kayıt 200 ile dönmeli. (c) Tarama ekranında submit sırasında buton kilitlenmeli (şu an `submitting` var) ve 5xx sonrası "Kayıt oluşmuş olabilir. Son işlemleri kontrol et" durumu ve mini "Son işlemler" listesi gösterilmeli. Böylece bayi körlemesine tekrar basmaz.

### Özet

| İddia | Karar | Not |
|---|---|---|
| B1 · Sınırsız happy-hour çarpanı | Doğrulandı | KRİTİK kalır. Herkes bayi olarak kayıt olabildiği için sömürü eşiği düşük. |
| B2 · Atomik olmayan oluşturma | Kısmen doğrulandı | Çift kayıt mümkün, çift puan mümkün değil. Şiddet ORTA'ya düşürülmeli. |


---

## Uygulama (Dalga 2)

Sayfa "İşlem defteri" olarak yeniden yazıldı: sunucu bileşeni (`app/dealer/consumptions/page.tsx`) URL filtreleriyle ilk sayfa + özet (+ önceki eşit dönem) ve ürün listesini paralel yükler; istemci adası `components/dealer/b-kasa-tuketim/ledger-screen.tsx` (React Query, `keepPreviousData`, sığ URL eşitleme). Veri `lib/dealer/kasa/server.ts#listLedger` (açık `select` DTO, İstanbul günleri). Uçlar `defineRoute`: `GET /api/dealer/consumptions` (filtreli BFF), `GET /api/dealer/consumptions/export` (CSV), `POST /api/dealer/consumptions/[id]/void` (geri alma). Testler: `__tests__/lib/dealer-kasa-core.test.ts`, `__tests__/lib/dealer-kasa-server.test.ts`.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Meta başlık/açıklama | ÇALIŞIYOR | Sayfada iki dilli `generateMetadata`; "anomali" vaadi kaldırıldı (layout yalın). |
| 2 | Kenar menü + Keşfet | ÇALIŞIYOR | Navigasyon ajanının; dokunulmadı. |
| 3 | Rol/oturum koruması | ÇALIŞIYOR | `defineRoute` roles + `requireAuth` (DB). |
| 4 | Veri kapsamı (IDOR) | ÇALIŞIYOR | `resolveDealerScope`; her sorgu `dealerId` ile. |
| 5 | ADMIN erişimi | ÇALIŞIYOR | `?dealerId=` ile salt okunur (geri alma/kasa düğmeleri gizli, bilgi bandı). |
| 6 | Hero | ÇALIŞIYOR | QDL `PageHeader` (compact) + "Kasayı aç" ve "CSV indir" eylemleri. |
| 7 | "Toplam işlem" sayacı | ÇALIŞIYOR | KPI şeridi (mobilde de görünür): ciro, işlem, ortalama sepet, yorum dönüşümü (+ tekrar gelen müşteri oranı), önceki döneme göre değişim. |
| 8 | Liste kart başlığı | ÇALIŞIYOR | Tablo `caption` + mobil liste etiketi. |
| 9 | Liste veri çekme | ÇALIŞIYOR | React Query (iptal + anahtar), `kasaFetch` `res.ok`/zarf kontrolü; oturum yenilemesi yeniden çekmez. |
| 10 | Yükleniyor iskeleti | ÇALIŞIYOR | `QueryState` tablo iskeleti yalnız ilk yüklemede; sayfa/filtre değişiminde önceki veri kalır. |
| 11 | Boş durum | ÇALIŞIYOR | Filtreli boş ("Filtreleri temizle") ve hiç kayıt yok ("Kasayı aç" CTA) ayrı. |
| 12 | Hata durumu | ÇALIŞIYOR | `QueryState` hata + "Tekrar dene"; "200 + boş" yok. |
| 13 | Müşteri avatarı | ÇALIŞIYOR | Yalnız https/yerel yol; `onError` baş harfe düşer (`next/image` yok). |
| 14 | Müşteri adı + yedek | ÇALIŞIYOR | |
| 15 | Kartın son 4 hanesi | ÇALIŞIYOR | Sunucuda; iç kart kimliği yanıttan çıkarıldı. |
| 16 | Tarih/saat | ÇALIŞIYOR | İstanbul saat dilimi + göreli zaman. |
| 17 | Ürün rozeti | ÇALIŞIYOR | Kategori adı/ikonu detayda. |
| 18 | Bayi notu | ÇALIŞIYOR | Listede tek satır kırpma, detayda tam. |
| 19 | Tutar | ÇALIŞIYOR | `Intl` + yerel; `0` → "İkram". |
| 20 | Değerlendirme rozeti | ÇALIŞIYOR | "★ 4/5" renk skalası (1-2 tehlike, 3 nötr, 4-5 başarı; QDL ton token'ları, AA). Yorum metni, boyutlar, bayi yanıtı detayda; "Yanıtla / telafi teklif et" Gelen Kutusu'ndaki ilgili kayda (`/dealer/inbox?source=consumption&id=cr-…`) gider. |
| 21 | "Değerlendirme yok" rozeti | ÇALIŞIYOR | "Değerlendirilmedi"; hatırlatma aksiyonu eklenmedi (bkz. kalanlar). |
| 22 | Satır stagger | KALDIRILDI | Operasyon kaydı: sakin; animasyonsuz yoğun tablo. |
| 23 | Satır hover (sahte) | ÇALIŞIYOR | Satır artık detay çekmecesini açar (klavyeyle müşteri düğmesi). |
| 24 | Sayfa bilgisi | ÇALIŞIYOR | `aria-live`, toplam kayıt sayısıyla. |
| 25 | Önceki/Sonraki | ÇALIŞIYOR | Yarış yok (sorgu anahtarı), sayfa değişince liste başına kaydırma + odak, URL'de. |
| 26 | Yerel `LazyMotion` | KALDIRILDI | |
| 27 | URL'de durum | ÇALIŞIYOR | Dönem/özel tarih/puan/ürün/arama/sıralama/sayfa URL'de (sığ `replaceState`, sunucu da okur). |
| 28 | Tarih aralığı filtresi | ÇALIŞIYOR | Bugün/7/30/90 gün/tümü/özel (İstanbul günleri). |
| 29 | Ürün filtresi | ÇALIŞIYOR | Ayrı kategori filtresi eklenmedi (ürün filtresi + arama yeterli). |
| 30 | Değerlendirme filtresi | ÇALIŞIYOR | Tümü/değerlendirilmedi/1-2/3/4-5 + "Aksiyon bekleyen" (1-2★) hızlı çipi. Silinmiş yorum "değerlendirilmedi" sayılır. |
| 31 | Arama | ÇALIŞIYOR | Müşteri adı, ürün adı, not (≥2 karakter, 300 ms bekleme). |
| 32 | Sıralama | ÇALIŞIYOR | En yeni/en eski/tutar ↑↓ (null tutarlar sonda). |
| 33 | Dışa aktarma | ÇALIŞIYOR | CSV (`;`, UTF-8 BOM, formül enjeksiyonu nötr, ≤5000 satır, 10/dk). |
| 34 | Özet KPI'lar | ÇALIŞIYOR | Bkz. #7; önceki 0 iken değişim uydurulmaz. |
| 35 | Kayıt detayı | ÇALIŞIYOR | `DetailSheet` (önceki/sonraki gezinme): özet, pasif puan (defterden), yorum + boyutlar + yanıt, geri alma. |
| 36 | İptal/düzeltme | ÇALIŞIYOR | 15 dk + değerlendirilmemiş; gerekçe zorunlu; puan `debitPoints` ile ters kayıt, klan düşümü, `CONSUMPTION_VOIDED` denetimi, müşteriye bildirim (tek tx). Düzeltme = geri al + kasada yeniden gir. |
| 37 | Kaydı oluşturan personel | KISMİ | Aktör kart denetiminde (`CONSUMPTION_ADDED.userId`) ve mint meta'sında `staffId`; listede sütun yok (şema alanı yok — ŞEMA İSTEĞİ). |
| 38 | Anomali işaretleme | KALDIRILDI | Vaat metadata'dan çıkarıldı; puan tarafı anomali Dalga 1 velocity/tavanlarında. |
| 39 | Canlı güncelleme | ÇALIŞIYOR | İlk sayfadayken 30 sn'de bir tazeleme (sekme görünürken); geri alma/kasa kaydı sonrası sorgular geçersizlenir. SSE kanalı bağlanmadı. |
| 40 | Mobil düzen | ÇALIŞIYOR | Mobilde kart listesi, ≥44px hedefler, yatay kaydırılan dönem çipleri. |

### Kapanan bulgular
B1 (Dalga 1: çarpan zod + şelale + `mintPoints`), B2 (Dalga 1 tx + `clientOpId`; bu dalgada kasa form başına kimlik üretir), B3, B4, B5, B6 (yüzey metinleri ve para/tarih yerel; servis hata metinleri `code` ile eşlenir), B7 (açık DTO, e-posta/iç kimlikler yok), B8, B9, B10 → **10/10**.

### Kalanlar
- "Yorum hatırlat" aksiyonu: müşteriye ikinci bildirim için ayrı kural/tavan tasarımı gerekir; eklenmedi.
- Kategori filtresi ve tutar aralığı filtresi eklenmedi (ürün filtresi + sıralama ile karşılanıyor).
- Gerçek zamanlı (SSE) `consumption_created` olayı yok; 30 sn yoklama.
- **ŞEMA İSTEĞİ:** `Consumption.voidedAt`, `voidReason`, `voidedById`, `createdByStaffId`, `locationId` — yumuşak iptal (şu an silme + denetim anlık görüntüsü) ve personel/şube sütunu için.
