# /customer/feedbacks

**Amaç:** Müşterinin gönderdiği tüm geri bildirimleri (QR geri bildirimleri + tüketim yorumları) tek yerde göstermek; işletme yanıtlarını, telafi tekliflerini ve geri bildirim yolculuğunu bu listeden erişilebilir kılmak.

**Genel puan:** 4.5 / 10 · **Karar:** yeniden tasarla (telafi özetini `/customer/remedy` ile, tüketim yorumu listesini `/customer/consumptions` ile ilişkilendirerek tek bir "Seslerim" zaman çizelgesine dönüştür)

Dosyalar: `app/customer/feedbacks/page.tsx` (623 satır, tek client bileşen), `app/customer/feedbacks/layout.tsx` (yalnız metadata), bağlı alt sayfa `app/customer/feedbacks/[id]/journey/page.tsx`.
API: `GET /api/feedbacks` (`app/api/feedbacks/route.ts`), `GET /api/customer/reviews` (`app/api/customer/reviews/route.ts`), `GET /api/customer/remedy` (`app/api/customer/remedy/route.ts`), `GET /api/customer/feedbacks/[id]/journey`.
Modeller: `Feedback`, `ConsumptionReview` (schema.prisma:1602), `Consumption` (schema.prisma:1574), `RemedyOffer` (schema.prisma:1327).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Temel listeleme çalışıyor; ancak "Kazanılan puan" sahte, QR kartında işletme adı yanlış alandan geliyor, QR listesi sessizce 50'de kesiliyor, telafi eşleştirmesi en eski teklifi gösteriyor. |
| UX | 4/10 | Arama görünmez bir URL filtresi, hata/boş durumları birbirine karışıyor ("Henüz yorum yapmadınız" hata ve arama sonucunda da çıkıyor), kartlardan detay/düzenlemeye yol yok, Yorum Yap CTA'sı hedef sayfada filtreyi uygulamıyor. |
| Görsel | 5/10 | Glass kart dili tutarlı ama sayfa düz bir CRUD listesi; ödül/ilerleme hissi yok, duygu rozeti kontrastı zayıf, mobilde başlık satırı sarmıyor. |
| Mimari | 4/10 | 623 satırlık tek bileşen, iki kart tipi kopyala-yapıştır, `any` kaçakları, `res.ok` kontrolü yok, i18n yarım; API tarafında STAFF rolü için tüm platform verisini döndüren kapsam açığı ve reviews ucunda bayi notu sızıntısı var. |
| Performans | 6/10 | Üç uç paralel çağrılıyor (iyi); ama 200 yoruma kadar tam `include` ile her şey tek seferde çekilip her kart ayrı `Motion.div` ile render ediliyor, sayfalama yok. |
| Erişilebilirlik + mobil | 4/10 | Yıldız puanı ekran okuyucuya hiç aktarılmıyor, duygu ikonları etiketsiz, spinner'da durum metni yok; azaltılmış hareket global `MotionConfig` ile karşılanıyor (iyi), mobil 3 sütunlu istatistik ızgarası ve sarmayan kart başlıkları dar ekranda sıkışıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Masaüstü sayfa başlığı (`DashboardPageHeading`) | ÇALIŞIYOR | page.tsx:232-235, components/dashboard/page-heading.tsx:21 | Yalnız `sm:` ve üstünde görünür. |
| 2 | Mobil başlık kartı (`sm:hidden` ikinci `<h1>`) | ÇALIŞIYOR | page.tsx:237-242 | Aynı içerik iki kez yazılmış; ortak bileşene alınmalı. |
| 3 | Sayfa metadata'sı (layout) | ÇALIŞIYOR | layout.tsx; messages/tr.json `layoutMetadata.customerFeedbacks` | |
| 4 | Veri yükleme (3 paralel fetch) | KISMİ | page.tsx:108-154 | `res.ok` hiç kontrol edilmiyor; bir uç 500 HTML dönerse `res.json()` patlar ve üç veri kaynağı birden boş kalır (Promise.all hepsi-ya-hiç). AbortController yok. |
| 5 | Yükleniyor durumu | KISMİ | page.tsx:222-228 | Tam sayfa spinner; iskelet yok, `role="status"`/sr-only metin yok. |
| 6 | Hata durumu | KISMİ | page.tsx:149-151 | Yalnız toast; ekranda "Henüz tüketim yorumu yapmadınız" boş durumu kalır — kullanıcıya verisi yokmuş gibi yanlış mesaj; yeniden dene butonu yok. |
| 7 | Suspense fallback | KISMİ | page.tsx:619 | Sabit İngilizce "Loading...". |
| 8 | URL `?search=` filtresi (header aramasından gelir) | KISMİ | page.tsx:99-102, 192-211; components/dashboard/header.tsx:266-271; app/api/search/route.ts:97 | Sayfada görünür arama kutusu, aktif filtre çipi ya da "temizle" yok; istatistikler de filtreye göre değişir ama kullanıcı bunu bilmez. `toLowerCase()` Türkçe "İ/I" için hatalı (`toLocaleLowerCase('tr')` olmalı). |
| 9 | İstatistik: Toplam | KISMİ | page.tsx:213, 253 | QR listesi API'de varsayılan `pageSize=50` ile kesildiği için (lib/validations.ts:84-87, route.ts:37) 50'den fazla QR geri bildirimi olan kullanıcıda yanlış toplam; API'nin döndürdüğü `total` kullanılmıyor. |
| 10 | İstatistik: Ortalama puan | KISMİ | page.tsx:214-220, 266 | Veri yokken "0" gösterir (kötü puan gibi okunur), "—" olmalı. Kesilmiş listeler üzerinden hesaplanır. |
| 11 | İstatistik: Kazanılan puan | SAHTE | page.tsx:279 | `consumptionReviews.length * 50 + "+"` — sabit 50 varsayımı. QR geri bildirim puanları, detaylı yorum bonusu (100 puan, lib/points-rules.ts:58-62), günlük tavan kesintisi, VIP/sezon/platform çarpanları ve admin matris değişiklikleri yok sayılır. Ayrıca filtrelenmemiş diziyi kullanır (diğer iki istatistik filtrelenmiş). |
| 12 | Telafi özet kartı: başlık + "Tümünü gör" | ÇALIŞIYOR | page.tsx:288-308 | `/customer/remedy` mevcut. |
| 13 | Telafi listesi (ilk 8) | KISMİ | page.tsx:314-352 | Durum etiketleri sabit Türkçe ("Kabul edildi", "Bekliyor"), diğer durumlar ham İngilizce (`o.status`) basılır; fallback "İşletme" sabit. |
| 14 | Telafi boş durumu | ÇALIŞIYOR | page.tsx:309-312 | |
| 15 | "+N teklif daha" bağlantısı | ÇALIŞIYOR | page.tsx:354-361 | API 50 ile sınırlı olduğundan N en çok 42. |
| 16 | Sekmeler (Tüketim / QR) + sayaçlar | KISMİ | page.tsx:366-382 | Etiketler sabit Türkçe; sekme URL'de tutulmuyor; varsayılan her zaman "consumption" (yalnız QR verisi olan kullanıcı boş sekmeyle karşılaşır). |
| 17 | Tüketim kartı başlığı: işletme + ürün rozeti | ÇALIŞIYOR | page.tsx:414-427 | `flex justify-between` sarmıyor ve `truncate` yok; uzun işletme+ürün adında mobilde sıkışma riski (görsel olarak doğrulanmadı). |
| 18 | Yıldız gösterimi | KISMİ | page.tsx:168-179 | Yalnız ikon; `aria-label`/sr-only "5 üzerinden 4" yok. |
| 19 | Yorum metni / boş metin | ÇALIŞIYOR | page.tsx:430-432 | "Yorum metni yok" sabit TR. |
| 20 | Boyut puanları (dimensions) | KISMİ | page.tsx:435-446 | Etiketler formla tutarsız: burada "Servis/Ambiyans/Fiyat/Değer", formda "Hizmet/Ortam/Fiyat/Performans" (app/customer/consumptions/[id]/page.tsx:74-79). Sözlük kopyalanmış. `dimensions: any`. |
| 21 | İşletme yanıtı kutusu (tüketim) | ÇALIŞIYOR | page.tsx:449-456 | Yanıt tarihi (`dealerRepliedAt`) gösterilmiyor. |
| 22 | Telafi CTA'sı (tüketim kartı) | KISMİ | page.tsx:156-166, 459-472 | Aynı yoruma birden fazla teklif varsa yeni→eski sıralı listede `forEach` sonuncuyu (EN ESKİ) yazar; kullanıcı güncel teklif yerine eskisine gider. Kabul edilmemiş her durum "tür ve miktar seçin" der. |
| 23 | Göreli tarih | KISMİ | page.tsx:478, 580; lib/utils.ts:33-36 | `formatRelativeTime` locale parametresi geçilmiyor → EN kullanıcıda Türkçe. |
| 24 | "Yanıtlandı" rozeti | ÇALIŞIYOR | page.tsx:481-485, 589-593 | Sabit TR. |
| 25 | Tutar rozeti | KISMİ | page.tsx:486-490 | `amount && …` → tutar `0` ise JSX'e çıplak "0" basılır; para birimi daima `tr-TR` (lib/utils.ts:77). |
| 26 | Tüketim boş durumu + "Yorum Yap" CTA | KISMİ | page.tsx:386-401 | `/customer/consumptions?hasReview=false`'a gider ama o sayfa URL parametresini okumuyor (app/customer/consumptions/page.tsx:67 `useState('all')`, `useSearchParams` yok) → "bekleyenler" filtresi uygulanmaz. |
| 27 | QR kartı: işletme adı | BOZUK | page.tsx:129-132 vs app/api/feedbacks/route.ts:135-140 | İstemci `businessName: f.qrCode?.name` yazıyor; API'nin hesapladığı `qrCode.businessName` (bayinin işletme adı) çöpe atılıyor. Sonuç: başlıkta işletme yerine QR adı ("Masa 4") görünür ve yanındaki rozet aynı adı ikinci kez basar. |
| 28 | QR adı rozeti | ÇALIŞIYOR | page.tsx:535-537 | #27 yüzünden başlıkla aynı metin. |
| 29 | QR yıldız + duygu ikonu | KISMİ | page.tsx:181-190, 539-542 | Analiz edilmemiş (`sentiment=null`) geri bildirimde "Meh" (nötr) ikonu gösterir — veri yokken nötr iddia eder; ikonlar etiketsiz. |
| 30 | QR metni | ÇALIŞIYOR | page.tsx:546-548 | |
| 31 | QR işletme yanıtı | ÇALIŞIYOR | page.tsx:551-558 | |
| 32 | Telafi CTA'sı (QR kartı) | KISMİ | page.tsx:561-574 | #22 ile aynı "en eski teklif kazanır" hatası. |
| 33 | "Yolculuk" butonu → journey sayfası | ÇALIŞIYOR | page.tsx:583-588; app/api/customer/feedbacks/[id]/journey/route.ts:57 sahiplik kontrolü | Yalnız QR için; tüketim yorumunun yolculuğu yok. Journey ucu `deletedAt` filtrelemiyor (route.ts:29). |
| 34 | Duygu rozeti (Olumlu/Olumsuz/Nötr) | KISMİ | page.tsx:594-602; lib/utils.ts:308-315; components/ui/badge.tsx:10-11 | `getSentimentColor` yalnız metin rengi döner; Badge `default` varyantının `bg-primary` zemini korunur → mor zemin üstünde yeşil/kırmızı metin, düşük kontrast. Ayrıca kullanıcının kendi yorumuna "Olumsuz" etiketi basmak iç analitik dilidir. |
| 35 | QR boş durumu + "QR Tara" CTA | ÇALIŞIYOR | page.tsx:503-518 | |
| 36 | Liste giriş animasyonu (stagger, 10'da tavan) | ÇALIŞIYOR | page.tsx:404-409, 521-526; components/providers.tsx:232 `MotionConfig reducedMotion="user"` | Ölçülü; azaltılmış hareket global olarak karşılanıyor. |
| 37 | Kart hover efekti | KISMİ | page.tsx:410, 527; components/ui/card.tsx:19-20 | Kart tıklanabilir değil ama hover'da gölge verir → sahte etkileşim ipucu. |
| 38 | Sayfalama / daha fazla yükle | EKSİK | page.tsx:113 (parametresiz çağrı) | QR: 50, yorum: 200, telafi: 50 sabit tavan; QR için kesilme uyarısı bile yok. |
| 39 | Karttan tüketim/yorum detayına ve düzenlemeye geçiş | EKSİK | page.tsx:403-497 | Düzenleme `PUT` ile mevcut (app/customer/consumptions/[id]/page.tsx:187) ama bu sayfadan erişilmiyor. |
| 40 | Sıralama / filtre (puan, yanıtlı, telafili, tarih) | EKSİK | — | API `sentiment` filtresini destekliyor (route.ts:58-60) ama UI'da yok. |
| 41 | Görünür arama kutusu | EKSİK | — | Bkz. #8. |
| 42 | Çoklu dil (EN) | KISMİ | page.tsx:131, 317, 320-322, 371-379, 390-396, 431, 439-442, 452, 467-468, 483, 507-514, 547, 586, 597-600, 619 | Yalnız üst kısım `tc()` ile; liste gövdesinin tamamı sabit Türkçe. |
| 43 | Yetki/kapsam (API düzeyi) | BOZUK | app/api/feedbacks/route.ts:43-51 | CUSTOMER doğru kapsanıyor; ancak STAFF rolü hiçbir filtreye girmiyor ve tüm platformun geri bildirimlerini müşteri e-postalarıyla birlikte alıyor (bkz. Bulgu 1). |
| 44 | E-posta/bildirim derin bağlantısı | EKSİK | lib/notify-email.ts:121-127 | "Yanıtı gör" CTA'sı genel `/customer/feedbacks`'e gider; ilgili kart vurgulanmaz/açılmaz. |
| 45 | Her yorumda kazanılan puan/XP gösterimi | EKSİK | — | `points_credited` olayı ve bildirim verisinde `pointsEarned` mevcut (app/api/customer/consumptions/[id]/review/route.ts:198-217) ama listelenmiyor. |
| 46 | "Yeni yanıt" / okunmamış göstergesi | EKSİK | — | Hangi yanıtın yeni geldiği ayırt edilemiyor. |

**Durum özeti:** ÇALIŞIYOR 16 · KISMİ 20 · BOZUK 2 · SAHTE 1 · EKSİK 7 (toplam 46)

---

## Bulgular

### 1. STAFF rolü `GET /api/feedbacks` ile tüm platformun geri bildirimlerini ve müşteri e-postalarını okuyabiliyor
- **Önem:** kritik · **Kategori:** güvenlik / veri kapsamı (IDOR)
- **Kanıt:** app/api/feedbacks/route.ts:28 (`requireAuth()` rol kısıtı olmadan), 43-51 (yalnız CUSTOMER ve DEALER için `where` daraltılıyor; yorum "ADMIN sees all" ama `else` dalı yok), 77-79 (`user: { id, name, email, image }` seçiliyor). STAFF rolü şemada var (prisma/schema.prisma:22-27), parola ile oluşturuluyor (app/api/dealer/staff/route.ts:101, 126) ve kimlik doğrulama STAFF'ı engellemiyor (lib/auth.ts:101). Proxy `/api/*` isteklerine rol kontrolü uygulamıyor (proxy.ts:103-119).
- **Sorun:** Bir bayinin personel hesabıyla giriş yapan herkes `/api/feedbacks?page=N&pageSize=100` ile platformdaki tüm bayilerin tüm geri bildirimlerini, müşteri ad/e-posta/fotoğraflarıyla sayfa sayfa çekebilir. Bu, KVKK açısından kişisel veri sızıntısı ve rakip bayi verisine erişim demek. İlişkili not: ADMIN için gizli kapı (admin_gate cookie) yalnız sayfa yollarında uygulanıyor (proxy.ts:78-87), API'de değil — "rol yetmez" ilkesi bu uçta geçerli değil.
- **Öneri:** Uçta varsayılan-reddet kapsamı kur: `requireAuth(['CUSTOMER','DEALER','ADMIN'])` ve rol başına açık `switch` (bilinmeyen rol → 403). STAFF'ın gerçekten erişmesi gerekiyorsa `where.qrCode = { dealerId: session.user.dealerId }` ile kendi bayisine kilitle. Uzun vadede müşteri listesini ayrı, dar seçimli bir uca taşı (`GET /api/customer/feedbacks`) — müşteri tarafına `user.email` gibi alanlar hiç dönmesin; çok-rollü "her şeyi döndüren" uç yerine rol başına uç. Bu deseni tüm `requireAuth()` (rol listesiz) çağrılarında tarayan bir regresyon testi ekle.
- **Efor:** S

### 2. `GET /api/customer/reviews` bayinin iç notunu, gizli karakter kategorisini ve churn riskini müşteriye sızdırıyor
- **Önem:** yüksek · **Kategori:** güvenlik / veri bütünlüğü
- **Kanıt:** app/api/customer/reviews/route.ts:29-58 — `consumptionReview.findMany({ include: { consumption: { include: {...} } } })`. `include` tüm skaler alanları döndürür: `Consumption.note` ("Bayi notu", schema.prisma:1581), `Consumption.cardId`, `ConsumptionReview.characterCategory` ("kullanıcıya gösterilmez", schema.prisma:1611-1613), `churnRisk`, `sentiment`, `analyzedAt` (schema.prisma:1616-1618). Karşılaştırma: müşteri tüketim ucu `note`'u döndürmüyor (app/api/customer/consumptions/route.ts içinde `note` yok).
- **Sorun:** Bayinin kasada yazdığı iç not (ör. müşteri hakkında yorum) tarayıcının ağ sekmesinde müşteriye görünür. Karakter rozeti sisteminin "gizemli bar / sürpriz reveal" mekaniği, kategorinin ham JSON'da açıkça gelmesiyle bozulur. Kişinin kendi `churnRisk` skorunun ona gösterilmesi de ürün ve itibar açısından istenmeyen bir iç sinyaldir.
- **Öneri:** `include` yerine açık `select` kullan; yalnız sayfanın kullandığı alanları döndür (`id, rating, text, dimensions, dealerReply, dealerRepliedAt, createdAt, consumption{ id, amount, createdAt, dealer{...}, product{...} }`). Ayrıca `getServerSession` yerine `requireAuth(['CUSTOMER'])` kullanarak token-replay kontrolünü bu uca da getir (route.ts:16 bu kontrolü atlıyor). Müşteri uçları için ortak bir "public DTO" katmanı (`lib/dto/customer-review.ts`) oluşturulup iç alanların istemciye çıkması tip düzeyinde engellenmeli.
- **Efor:** S

### 3. "Kazanılan Puan" istatistiği uydurma bir formülle hesaplanıyor
- **Önem:** yüksek · **Kategori:** sahte veri / güven
- **Kanıt:** page.tsx:279 `{consumptionReviews.length * 50}+`; gerçek ödül matrisi lib/points-rules.ts:52-62 (taban 50, detaylı 100, admin tarafından değiştirilebilir), tavan ve çarpanlar app/api/feedbacks/route.ts:314-318 ve app/api/customer/consumptions/[id]/review/route.ts:165-187.
- **Sorun:** Puan ekonomisinin merkezde olduğu bir üründe kullanıcıya yanlış bakiye-benzeri rakam göstermek güven kırar: QR geri bildirim puanları hiç sayılmaz, detaylı yorum bonusu yok sayılır, tavan nedeniyle 0 puan alınan yorumlar 50 sayılır. Kullanıcı rakamı cüzdanıyla karşılaştırdığında tutarsızlık görür.
- **Öneri:** Gerçek kaynaktan hesapla: `points_credited` + `category: 'feedback'` analytics olaylarının toplamı (her iki kaynak bunu yazıyor; review route.ts:198-204, feedbacks route.ts:330-349). Bunu müşteri özet ucunda (`/api/customer/feedbacks/summary`) tek `aggregate` sorgusu olarak sun ve Redis ile kısa süre önbelleğe al. Daha iyisi: her yoruma kazanılan puanı bağla (bkz. Bulgu 10) ve üst kartta "Geri bildirimlerinden toplam X puan · bu ay Y" göster.
- **Efor:** M

### 4. QR kartında işletme adı yerine QR kod adı gösteriliyor
- **Önem:** yüksek · **Kategori:** yanlış veri
- **Kanıt:** page.tsx:129-132 (`businessName: f.qrCode?.name || 'İşletme'`), API zaten doğru değeri hesaplıyor: app/api/feedbacks/route.ts:139 (`businessName: f.qrCode.dealer?.businessName || f.qrCode.name`).
- **Sorun:** Müşteri hangi işletmeye geri bildirim verdiğini göremez; "Masa 4" + "Masa 4" rozeti gibi anlamsız tekrar çıkar. Header araması da işletme adıyla arar ama işletme adı listede yoktur.
- **Öneri:** Yeniden biçimlendirme katmanını kaldır, API tipini doğrudan kullan (`f.qrCode.businessName`). Kart başlığında işletme adı + logo, alt satırda QR konumu ("Masa 4") olmalı. API yanıtı için paylaşılan bir TypeScript tipi tanımlanıp istemcide `any` ile yeniden haritalama yapılmamalı.
- **Efor:** S

### 5. Listeler sessizce kesiliyor; sayfalama ve doğru toplam yok
- **Önem:** orta · **Kategori:** işlevsellik / veri doğruluğu
- **Kanıt:** page.tsx:113 parametresiz `fetch('/api/feedbacks')` → varsayılan `pageSize=50` (lib/validations.ts:84-87); API `total`/`totalPages` döndürüyor (route.ts:149-152) ama kullanılmıyor. Yorumlar 200'de kesiliyor (reviews route.ts:26) ve yalnız toast ile bildiriliyor (page.tsx:141-143); telafi 50 (remedy route.ts:41).
- **Sorun:** Aktif kullanıcı (Starbucks/Duolingo benzeri sadakat profili) eski geri bildirimlerini hiç göremez; "Toplam" ve "Ort. Puan" yalnız ilk sayfa üzerinden hesaplanır.
- **Öneri:** İki kaynağı sunucuda birleştiren tek, imleç tabanlı (`cursor=createdAt,id`) bir müşteri zaman çizelgesi ucu (`GET /api/customer/feedbacks?type=all|qr|review&cursor=`) ve istemcide `useSWRInfinite` + IntersectionObserver ile sonsuz kaydırma. İstatistikler ayrı bir özet ucundan (`count`, `avg`, puan toplamı) gelmeli; listeye göre değil.
- **Efor:** M

### 6. Hata, boş ve "arama sonucu yok" durumları ayrışmıyor
- **Önem:** orta · **Kategori:** UX / hata yönetimi
- **Kanıt:** page.tsx:118-120 (`res.ok` kontrolsüz `json()`), 149-151 (yalnız toast), 386-392 ve 503-509 (tek tip boş durum metni); arama filtresi 192-211.
- **Sorun:** (a) API 401/500 döndüğünde kullanıcı "Henüz tüketim yorumu yapmadınız" görür — verisinin silindiğini sanabilir. (b) Header'dan arama yapıp gelen kullanıcı eşleşme yoksa aynı "henüz yapmadınız" mesajını görür. (c) Bir uç düşerse Promise.all yüzünden diğer iki kaynağın verisi de gösterilmez.
- **Öneri:** Kaynak başına bağımsız durum (`Promise.allSettled` veya SWR anahtarı başına) ve üç ayrı UI durumu: `error` (yeniden dene butonlu satır içi kart), `empty` (ilk geri bildirim teşviki + puan vaadi), `noResults` ("'X' için sonuç yok · Filtreyi temizle"). Ortak `EmptyState`/`ErrorState` bileşenleri diğer müşteri sayfalarıyla paylaşılmalı.
- **Efor:** S

### 7. Telafi teklifi eşleştirmesi en eski teklifi seçiyor
- **Önem:** orta · **Kategori:** mantık hatası
- **Kanıt:** remedy route.ts:40 `orderBy: { createdAt: 'desc' }`; page.tsx:159-163 her teklif için `byFeedback[fid] = o` → son yazılan, yani EN ESKİ teklif kalır. CTA metni yalnız `accepted`'ı ayırt ediyor (page.tsx:466-468, 568-570).
- **Sorun:** Aynı geri bildirime ikinci (güncel) teklif gönderildiğinde kart eski teklife yönlendirir; eski teklif kabul edilmişse yeni bekleyen teklif hiç görünmez.
- **Öneri:** Eşleştirmede önceliği açıkça tanımla: `pending` > en yeni `accepted`. Daha doğrusu, teklif durumunu geri bildirim kaydının içine sunucuda gömmek (birleşik zaman çizelgesi ucunda `activeRemedy: { id, status, expiresAt }`) — istemcide iki listeyi join etmeye gerek kalmaz.
- **Efor:** S

### 8. Header araması görünmez bir filtre olarak çalışıyor ve Türkçe karakterde hatalı
- **Önem:** orta · **Kategori:** UX / i18n
- **Kanıt:** page.tsx:99-102, 194, 204 (`toLowerCase()`), components/dashboard/header.tsx:266-271, app/api/search/route.ts:97. Sayfada arama `Input`'u veya filtre çipi yok. Sekme varsayılanı sabit `consumption` (page.tsx:96).
- **Sorun:** Kullanıcı aramadan geldiğinde listenin neden kısaldığını, istatistiklerin neden değiştiğini anlamaz; filtreyi kaldırmanın yolu URL'yi elle silmektir. Eşleşme QR sekmesindeyse kullanıcı boş tüketim sekmesine düşer. `"İstanbul".toLowerCase()` → `"i̇stanbul"` (birleşik nokta) olduğundan "istanbul" araması eşleşmez.
- **Öneri:** Sayfa üstüne kalıcı bir arama alanı + aktif filtre çipi ekle; değeri URL ile senkron tut (`router.replace`). Sekmeyi de URL'de tut (`?tab=qr`) ve arama varken eşleşmesi olan sekmeyi otomatik seç. Karşılaştırmada `toLocaleLowerCase('tr')` + aksan normalizasyonu kullan; uzun vadede arama sunucuya (Postgres `ILIKE`/trigram) taşınmalı çünkü istemci yalnız ilk sayfayı görüyor.
- **Efor:** S

### 9. "Yorum Yap" CTA'sı hedef sayfada filtreyi uygulamıyor
- **Önem:** orta · **Kategori:** kırık akış
- **Kanıt:** page.tsx:395 `/customer/consumptions?hasReview=false`; app/customer/consumptions/page.tsx:67 `useState<'all'|'pending'|'reviewed'>('all')`, dosyada `useSearchParams` yok.
- **Sorun:** Puan kazandıran en önemli dönüşüm hareketi (yorumlanmamış tüketimi yorumlamak) kullanıcıyı tüm tüketimlerin karışık listesine bırakıyor.
- **Öneri:** Tüketimler sayfasında `filter` durumunu URL'den başlat (`?filter=pending`) ve bu sayfadaki CTA'yı buna göre güncelle. Daha iyisi: bu sayfanın üstünde "Yorum bekleyen 3 tüketimin var · +150 puan" satırı ile doğrudan ilk bekleyen tüketimin yorum ekranına derin bağlantı.
- **Efor:** S

### 10. Liste kartları çıkmaz sokak: detay, düzenleme, kazanılan ödül yok
- **Önem:** orta · **Kategori:** UX / bilgi mimarisi
- **Kanıt:** page.tsx:403-497 ve 520-609 (kart tıklanamaz; yalnız QR'da "Yolculuk" butonu), card hover efekti page.tsx:410/527 ile tıklanabilirmiş gibi davranıyor; düzenleme yolu app/customer/consumptions/[id]/page.tsx:187'de mevcut.
- **Sorun:** Kullanıcı bir yorumu düzeltemez, işletme yanıtının tarihini göremez, tüketim yorumunun "yolculuğunu" izleyemez, o yorumdan kaç puan/XP kazandığını bilemez. Hover gölgesi sahte etkileşim ipucu verir.
- **Öneri:** Her kartı bir detay çekmecesine (mobilde bottom sheet, masaüstünde yan panel) bağla: tam metin, boyutlar, kazanılan puan/XP + rozet ilerlemesine katkı, işletme yanıtı ve tarihi, telafi durumu, yolculuk adımları ve "Düzenle" (zaman penceresi içinde). Journey'i QR'a özel ayrı sayfa olmaktan çıkarıp bu çekmecenin bir bölümü yap; tüketim yorumları için de aynı adımları (`dealerRepliedAt`, `remedyOffers`) üret.
- **Efor:** M

### 11. Duygu (sentiment) gösterimi hem görsel hem ürün açısından sorunlu
- **Önem:** düşük · **Kategori:** görsel / UX
- **Kanıt:** page.tsx:181-190 (null → Meh ikonu), 594-602; lib/utils.ts:308-315 yalnız `text-*` döner; components/ui/badge.tsx:10-11 `default` varyant `bg-primary`.
- **Sorun:** Mor zemin üstünde yeşil/kırmızı metin okunaksız; analiz edilmemiş kayıt "nötr" gibi görünür; kullanıcının kendi yorumuna "Olumsuz" damgası vurmak dealer-tarafı analitik dilidir ve tüketiciye değer katmaz. Tüketim yorumlarında aynı alan (`ConsumptionReview.sentiment`) varken gösterilmez — tutarsız.
- **Öneri:** Müşteri tarafından duygu rozetini kaldır; yerine kullanıcıya anlamlı sonuç sinyalleri koy ("İşletme okudu", "Yanıtlandı", "Telafi teklif edildi", "Etki: işletme menüsünü güncelledi"). Duygu ikonu kalacaksa `variant="success|destructive|secondary"` kullan ve `null`'da hiç gösterme.
- **Efor:** S

### 12. i18n yarım: liste gövdesi tamamen sabit Türkçe
- **Önem:** düşük · **Kategori:** i18n / tutarlılık
- **Kanıt:** Bkz. envanter #42 satır listesi; `formatRelativeTime` locale'siz (page.tsx:478, 580); Suspense fallback İngilizce (page.tsx:619). Boyut etiketleri formla farklı (page.tsx:439-442 vs app/customer/consumptions/[id]/page.tsx:74-79).
- **Sorun:** EN arayüzü seçen kullanıcı başlıkları İngilizce, kartları Türkçe görür; TR kullanıcı yükleme sırasında "Loading..." görür. Aynı boyut iki sayfada farklı adlandırılır.
- **Öneri:** Tüm metinleri `customerFeedbacks.*` anahtarlarına taşı; boyut tanımlarını (`key`, `labelKey`, `icon`) `lib/review-dimensions.ts` gibi tek bir kaynaktan hem forma hem listeye ver; `formatRelativeTime(date, locale)` ile `useCustomerLocale()` kullan.
- **Efor:** S

### 13. Erişilebilirlik: puan ve durum bilgisi ekran okuyucuya aktarılmıyor
- **Önem:** düşük · **Kategori:** erişilebilirlik
- **Kanıt:** page.tsx:168-179 (yıldızlarda etiket yok), 181-190 (ikonlar etiketsiz), 222-228 (spinner'da `role="status"` yok).
- **Sorun:** Bir geri bildirim sayfasının en önemli bilgisi olan puan, ekran okuyucu kullanıcısı için tamamen kayıp.
- **Öneri:** Ortak `RatingStars` bileşeni: `role="img" aria-label={t('rating', {n, max})}`, ikonlar `aria-hidden`. Yükleme için iskelet + `aria-busy` ve sr-only durum metni. Kart başlığına `<h3>` ve liste için `<ul>/<li>` semantiği.
- **Efor:** S

### 14. Mimari: 623 satırlık tek bileşen, kopya kart kodu, `any` kaçakları
- **Önem:** düşük · **Kategori:** mimari / bakım
- **Kanıt:** page.tsx:64 (`dimensions: any`), 123 (`(f: any)`), iki kart bloğu 403-497 ve 520-609 neredeyse aynı (yanıt kutusu, telafi CTA'sı, alt bilgi); `amount && …` sıfırda "0" basar (page.tsx:486).
- **Sorun:** Her düzeltme iki yerde yapılmak zorunda (ör. Bulgu 7 iki kopyada var); API sözleşmesi tip güvencesiz.
- **Öneri:** `FeedbackTimelineItem` (birleşik tip) + `FeedbackCard` / `ReplyBlock` / `RemedyCta` / `RatingStars` alt bileşenleri; veri katmanını `useCustomerFeedbacks()` SWR kancasına al; API yanıt tiplerini `lib/types/customer-feedback.ts`'te paylaş. `amount != null && amount > 0` kontrolü.
- **Efor:** M

---

## Eksik özellikler (kıyas ürünlerle)

1. **Etki geri bildirimi ("Sesin işe yaradı")** — Starbucks/Google Maps "yorumunuz X kez görüntülendi", Duolingo'nun ilerleme anlatımı gibi: işletmenin okuduğu, yanıtladığı, telafi ettiği, hatta bir değişiklik yaptığı bilgisinin kart üzerinde görsel bir durum çizgisi olarak gösterilmesi. Veri kısmen var (`dealerFirstViewedAt`, `dealerRepliedAt`, `remedyOffers`), yalnız QR journey sayfasına gömülü.
2. **Yorum başına ödül şeridi** — her kartta "+100 puan · +50 XP · Karakter barına katkı" (Starbucks Stars, Duolingo XP). `points_credited` ve bildirim verisi mevcut.
3. **Bekleyen fırsatlar bandı** — "Yorum bekleyen 3 tüketimin var" + tahmini puan, tek dokunuşla yorum ekranı (Duolingo günlük hedef hissi).
4. **Zaman çizelgesi + filtre/sıralama** — tek akışta tüm geri bildirimler; çiplerle "Yanıtlananlar / Telafi var / 1-2 yıldız / Bu ay" (Monzo/Revolut işlem listesi deseni: tarih başlıklarıyla gruplu, sticky ay başlıkları).
5. **Kişisel özet / "Wrapped" köprüsü** — en çok yorum yapılan işletme, ortalama puan trendi, en uzun yorum; `/customer/my-year` ile bağlantı (Spotify Wrapped).
6. **Yorum düzenleme / silme ve derin bağlantı** — bildirim ve e-postadan doğrudan ilgili kartın açılması (`/customer/feedbacks?item=<id>` veya `#id`), yeni yanıtlar için okunmamış rozeti.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Geri bildirimlerim" bir arşiv değil, kullanıcının sesinin karşılık bulduğu bir **etki akışı** olmalı. Kullanıcı sayfayı açtığında üç soruya anında cevap almalı: *Ne kadar kazandım?* *Kim bana yanıt verdi / ne değişti?* *Şimdi ne yapabilirim (yorum bekleyen tüketim, açık telafi)?*

**Yerleşim (mobil öncelikli):**
1. **Özet şeridi (hero, kompakt):** Gerçek toplam geri bildirim, gerçek kazanılan puan (bu ay / toplam), ortalama puan, yanıt oranı ("Yorumlarının %62'si yanıtlandı"). Mobilde yatay kaydırılan 3-4 stat çipi (mevcut 3 sütunlu sıkışık ızgara yerine).
2. **Aksiyon bandı:** Açık telafi teklifi varsa üstte tek, öne çıkan kart ("Kahve Durağı sana telafi teklif etti · seç"); yorum bekleyen tüketimler için "+150 puan seni bekliyor". Mevcut 8 satırlık telafi listesi kaldırılır; tam liste `/customer/remedy`'de kalır.
3. **Birleşik zaman çizelgesi:** QR ve tüketim yorumları tek akışta, ay başlıklarıyla gruplu; tür bir ikon/etiketle ayrılır (sekme yerine filtre çipi: Tümü · Tüketim · QR · Yanıtlanan · Telafili). Kart: işletme logosu + adı, yıldızlar, metnin 3 satırı, alt satırda durum adımları (Gönderildi → Okundu → Yanıtlandı → Telafi) mini ilerleme çubuğu olarak, sağda "+100 puan" etiketi.
4. **Detay çekmecesi:** Kart dokununca bottom sheet: tam metin, boyut puanları, işletme yanıtı ve tarihi, yolculuk adımları (mevcut journey sayfasının içeriği buraya taşınır), "Düzenle".

**Motion / 3B (ölçülü):**
- Liste girişindeki mevcut stagger korunur (10'da tavanlı; iyi).
- Yeni işletme yanıtı gelmiş kartta tek seferlik, kısa bir vurgulama (border glow 600 ms) ve okunmamış noktası; `MotionConfig reducedMotion="user"` zaten global.
- Özet şeridinde puan sayısı ilk görünümde sayarak artabilir (CountUp, yalnız ilk yüklemede).
- Bu sayfada three.js **gerekmez**; 3B sürprizler rozet/ödül anlarına aittir. Durum çizgisindeki adım tamamlanma animasyonu (SVG stroke) yeterli ve anlamlı.

**Veri / API değişiklikleri:**
- `GET /api/customer/feedbacks/timeline?cursor=&type=&filter=&q=` — `Feedback` ve `ConsumptionReview`'u sunucuda birleştiren, dar `select`'li, imleç tabanlı uç; her öğede `business{name,logo}`, `rating`, `textPreview`, `reply{text,at}`, `journey{viewedAt,repliedAt}`, `activeRemedy{id,status}`, `reward{points,xp}` (points_credited olayından ya da kayıt anında `Feedback`/`ConsumptionReview` üzerine yazılacak `pointsAwarded` alanından — ikincisi tercih edilir; olay tablosunda join gerekmez).
- `GET /api/customer/feedbacks/summary` — `count`, `avgRating`, `pointsTotal`, `pointsThisMonth`, `replyRate`, `pendingReviewCount`; Upstash Redis'te kullanıcı başına kısa TTL, yeni geri bildirim/yanıtta etiket bazlı geçersizleştirme.
- `GET /api/feedbacks`'in müşteri tarafından kullanımı bırakılır (Bulgu 1 düzeltmesi yine de zorunlu).
- `GET /api/customer/reviews` açık `select`'e çevrilir (Bulgu 2).
- `/customer/consumptions` URL'den filtre okur (Bulgu 9).

---

## Çakışmalar / birleştirme önerisi

- **`/customer/remedy`** — Bu sayfa telafi listesinin ilk 8 kaydını tekrar ediyor (page.tsx:287-363) ve aynı ucu çağırıyor (`/api/customer/remedy`, app/customer/remedy/page.tsx:50). Öneri: listeyi buradan kaldır; yalnız "açık teklif varsa" tek aksiyon kartı ve kart düzeyinde telafi durumu kalsın. Telafi yönetimi `/customer/remedy`'de.
- **`/customer/feedbacks/[id]/journey`** — Tek geri bildirim için ayrı sayfa; içerik (3-5 adım) bir detay çekmecesine sığacak kadar küçük. Öneri: çekmeceye birleştir, rota derin bağlantı için kalsın (çekmeceyi açık başlatsın).
- **`/customer/consumptions`** — "Değerlendirilenler" filtresi tüketim yorumlarını zaten listeliyor; bu sayfadaki "Tüketim" sekmesiyle içerik örtüşmesi var. Öneri: Tüketimler = alışveriş geçmişi (yorum bekleyenler odaklı), Geri bildirimlerim = gönderilmiş seslerin etki akışı; iki sayfa birbirine bağlam bağlantılarıyla (bekleyen sayısı ↔ yorum detayı) bağlanmalı, aynı kartı iki farklı tasarımla göstermemeli.
- **`/customer/journey-score`** ve **`/customer/analytics`** — Her ikisi de bu sayfaya yönlendiriyor (journey-score/page.tsx:142, analytics/page.tsx:225); özet şeridindeki metrikler (yanıt oranı, ortalama puan trendi) analytics ile aynı kaynaktan beslenmeli ki sayılar sayfalar arasında tutarlı olsun.
- Sayfanın kendisi **kaldırılmamalı**: sidebar, header araması, e-posta CTA'ları ve 6 farklı sayfa bu rotaya bağlanıyor (components/dashboard/sidebar.tsx:293, lib/notify-email.ts:127 vb.); merkezi bir "seslerim" yüzeyi olarak yeniden tasarlanmalı.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı; kod değiştirilmedi, veritabanına/sunucuya dokunulmadı. Her iddia çağıran ve çağrılan taraflar, `proxy.ts`, `lib/api-auth.ts`, `lib/auth.ts` ve `prisma/schema.prisma` okunarak çürütülmeye çalışıldı.

### 1. STAFF rolü için `GET /api/feedbacks` kapsam açığı — **DOĞRULANDI (Yüksek)**

- `app/api/feedbacks/route.ts:28` `requireAuth()` rol listesi olmadan çağrılıyor; `lib/api-auth.ts:53-63` rol listesi boşsa yalnız oturum varlığını kontrol ediyor.
- `app/api/feedbacks/route.ts:46-50` yalnız `CUSTOMER` (`userId`) ve `DEALER` (`qrCode.dealerId`) için `where` daraltıyor; `else` dalı yok, `:51` yorumu yalnız ADMIN'i varsayıyor. Sonuç: `STAFF` için `where = { deletedAt: null }`, yani platformdaki tüm geri bildirimler.
- `:77-79` her kayıtta `user{id,name,email,image}` döndürülüyor; `lib/validations.ts:86` `pageSize` en fazla 100, `page` sınırsız, böylece sayfalayarak tamamı çekilebilir.
- `proxy.ts:103-118` `/api/*` için yalnız güvenlik/CORS başlığı ekliyor, rol kontrolü yapmıyor; yani ara katman engeli yok.
- `STAFF` hesabı gerçekten giriş yapabiliyor: bayi `app/api/dealer/staff/route.ts:94-101,121-128` ile şifreli `STAFF` kullanıcısı oluşturuyor, `lib/auth.ts` Credentials sağlayıcısı rol ayrımı yapmadan oturum açtırıyor.
- **Yeniden üretim:** Bayi A, personel ekleme ekranından bir personel hesabı oluşturur. Personel e-posta/şifreyle giriş yapar, tarayıcıda `fetch('/api/feedbacks?page=1&pageSize=100')` çalıştırır ve `page` değerini artırır. Başka bayilerin (rakiplerin) tüm geri bildirim metinlerini, puanlarını, işletme adlarını ve yorum yapan müşterilerin **ad + e-posta** bilgilerini alır. Bu hem çapraz kiracı (tenant) veri sızıntısı hem KVKK kapsamında kişisel veri ifşasıdır.
- **Kapsam notu:** `/customer/feedbacks` sayfasının kendisi bu açıktan etkilenmez (müşteri `userId` ile daraltılıyor). Açık, sayfanın kullandığı paylaşılan uçtadır. İddiadaki "admin gizli kapı cookie'si API'de uygulanmıyor" kısmı doğru (`proxy.ts:84` yalnız `/admin` sayfa yollarında kontrol ediyor) ama bu ayrı, platform geneli bir mimari karar; bu bulgunun şiddetini belirleyen kısım değil.
- **Düzeltme yaklaşımı:** Uç "varsayılan reddet" düzenine çevrilmeli: `requireAuth(['CUSTOMER','DEALER','ADMIN','STAFF'])` ve açık bir `switch`; `STAFF` için `lib/api-auth.ts:161` civarındaki personel→bayi çözümleyicisiyle `qrCode.dealerId = staffDealerId` (bayi uçlarındaki `app/api/dealer/feedbacks/search/route.ts:31` deseni), tanınmayan rolde 403. Bayi/personel yanıtında müşteri `email` alanı ihtiyaç yoksa çıkarılmalı. Bu uç için rol bazlı bir regresyon testi (STAFF başka bayinin kaydını göremez) eklenmeli.

### 2. `/api/customer/reviews` dahili alanları müşteriye döndürüyor — **ÇÜRÜTÜLDÜ (Kritik/Yüksek olarak)**

- Mekanik gözlem doğru: `app/api/customer/reviews/route.ts:33-58` `include` kullanıyor; `ConsumptionReview` ve `Consumption` skalerlerinin tamamı (`note`, `characterCategory`, `sentiment`, `churnRisk`) yanıtta. Ancak iddianın dayandığı "bu alanlar bilerek gizli" önermesi kodla çelişiyor:
  - `Consumption.note` müşteriye **bilerek gösteriliyor**: `app/customer/consumptions/[id]/page.tsx:339-342` "İşletme notu" etiketiyle ekrana basıyor; `app/api/customer/consumptions/route.ts:54` de `include` ile `note`'u zaten döndürüyor. İddiadaki "müşteri tüketim ucu note'u döndürmüyor" ifadesi yanlış.
  - `churnRisk` müşteriye başka yüzeyde açıkça gösteriliyor: `app/api/customer/ai-insights/route.ts:37,165` ve `app/customer/ai-insights/page.tsx:628-632` (yüzde olarak). Üstelik değer müşterinin **kendi** yorumuna ait; başka kullanıcı verisi yok.
  - `characterCategory` için şema yorumu "kullanıcıya gösterilmez" diyor (`prisma/schema.prisma` ConsumptionReview). Sızıntı gerçek ama etkisi yalnız oyunlaştırma sürprizinin ağ sekmesinden önceden görülebilmesi; güvenlik ya da başka kullanıcı verisi etkisi yok.
- **Karar gerekçesi:** Kritik/Yüksek seviyede bir kullanıcıyı ya da veriyi etkileyen somut senaryo kurulamadı. Geriye **düşük** öncelikli bir hijyen maddesi kalıyor: uç açık `select` beyaz listesine çevrilmeli (`characterCategory`, `analyzedAt`, `customerId` gibi UI'nin kullanmadığı alanlar çıkarılmalı). Rozet sürprizini korumak için asıl önemli olan bu.

### 3. Kazanılan puan istatistiği sahte — **DOĞRULANDI (şiddet: Orta, Kritik/Yüksek değil)**

- `app/customer/feedbacks/page.tsx:279` `consumptionReviews.length * 50` + "+" basıyor; etiket `messages/tr.json:1799` "Kazanılan Puan".
- Gerçek kredi akışı farklı: tüketim yorumu `getConsumptionReviewReward` ile detaylı metinde 100 puan (`lib/points-rules.ts:57-61`), sonra `capFeedbackPoints` ile günlük/haftalık tavana kırpılıyor (`app/api/customer/consumptions/[id]/review/route.ts:163-187`). QR geri bildirimleri de puan kazandırıyor (`app/api/feedbacks/route.ts:283-359`, VIP/sezon/global çarpanlı) ama sayıya hiç girmiyor. Matris admin tarafından değiştirilebildiği için 50 sabiti de garanti değil.
- **Yeniden üretim:** (a) Müşteri aynı gün tavanı doldurduktan sonra 3 tüketim yorumu daha yazar; bu yorumlar için 0 puan kredilenir ama kart "150+" gösterir, yani rakam **fazla** gösterilir ve "+" alt sınır iddiası da yanlış olur. (b) Yalnız QR geri bildirimi yapan müşteri gerçekte puan kazanmışken "0+" görür.
- **Not:** Yalnız gösterim hatası; bakiye, cüzdan ve puan basımı etkilenmiyor (puan ekonomisi değişmezleri bozulmuyor). Bu yüzden şiddet Orta. Ancak güven açısından ödül rakamının uydurulması ürün için önemli.
- **Düzeltme yaklaşımı:** Rakam istemcide tahmin edilmemeli. `points_credited` olaylarının (`category: 'feedback'`) kullanıcı için toplamı ya da tercihen kayıt anında `Feedback`/`ConsumptionReview` üzerine yazılan `pointsAwarded` alanı, bu raporda önerilen `GET /api/customer/feedbacks/summary` ucunda sunucuda toplanmalı; kart bu değeri "+" eki olmadan göstermeli, değer gelmezse kart gizlenmeli.

---

## Uygulama (Dalga 2)

**Yeni yüzey:** `/customer/me/voices` (Ben › Seslerim). Sunucu bileşeni `app/customer/me/voices/page.tsx` özet + ilk liste sayfası + telafileri paralel ön yükler; istemci adası `components/customer/m-seslerim/**` (çekmece gövdeleri `next/dynamic` ile yalnız açılınca yüklenir). Veri katmanı `lib/customer-voices/{types,core,server}.ts`; BFF uçları `GET /api/customer/voices` (imleç sayfalı birleşik liste), `GET /api/customer/voices/summary` ("Sesin"), `GET /api/customer/voices/[key]` (detay; `fb-<id>` / `cs-<consumptionId>`), `GET /api/customer/remedy` (telafi listesi, yeniden yazıldı). Hepsi `defineRoute` (yalnız CUSTOMER, zod, hız sınırı, zarf v2). Eski rotalar sorgu parametrelerini koruyarak `permanentRedirect` ile Seslerim'e gider. Testler: `__tests__/lib/customer-voices.test.ts`, `__tests__/api/customer-voices-routes.test.ts`, `__tests__/api/customer-review-write.test.ts` (35 test, yeşil).
### Özellik envanteri — yeni durum

| # | Yeni durum | Not |
|---|---|---|
| 1 | ÇALIŞIYOR | Tek `PageHeader` (ds/page), mobil ve masaüstü aynı başlık. |
| 2 | KALDIRILDI | Mobil kopya başlık gereksizdi; #1 her genişlikte çalışıyor. |
| 3 | ÇALIŞIYOR | `generateMetadata` TR/EN, `noindex`. |
| 4 | ÇALIŞIYOR | Sunucu ön yüklemesi kaynak başına bağımsız; istemcide `fetchJson` `!ok` ya da JSON olmayan gövdede hata fırlatır, `AbortSignal` var. |
| 5 | ÇALIŞIYOR | `loading.tsx` (`role="status"`, statik iskelet) + `QueryState` iskeletleri. |
| 6 | ÇALIŞIYOR | Hata, boş ve "sonuç yok" ayrı; kaynak başına `ErrorState` + "Tekrar dene". |
| 7 | ÇALIŞIYOR | Suspense yedeği iskelet (İngilizce "Loading..." yok). |
| 8 | ÇALIŞIYOR | Görünür arama kutusu, URL `?q=` (eski `?search=` yönlendirmede `?q=`'ya çevrilir); arama SUNUCUDA (işletme, ürün, QR noktası, metin) — yalnız ilk sayfada değil. |
| 9 | ÇALIŞIYOR | `count` ile gerçek toplam (kesilme yok). |
| 10 | ÇALIŞIYOR | `aggregate` ile ağırlıklı ortalama; yorum yoksa "—". |
| 11 | ÇALIŞIYOR | SAHTE `×50` formülü kaldırıldı: `points_credited` (kategori `feedback`) defter olaylarının gerçek toplamı + bu ay (İstanbul takvim ayı). |
| 12 | KALDIRILDI | Ayrı "Tümünü gör" gereksiz: telafiler aynı sayfada (aksiyon bandı + "Telafilerim"). |
| 13 | ÇALIŞIYOR | "Telafilerim": insan diliyle seçim ("%20 İndirim"), puan türünde hesaba geçen miktar, durum metni TR/EN. |
| 14 | KALDIRILDI | Teklif yoksa bölüm hiç çizilmez (boş gürültü); bekleyenler aksiyon bandında. |
| 15 | KALDIRILDI | Bekleyenlerin hepsi bantta; 50'den eski telafi varsa `hasMore` notu. |
| 16 | ÇALIŞIYOR | Sekme yerine URL senkronlu filtre çipleri (`?type=`, varsayılan "Tümü"). |
| 17 | ÇALIŞIYOR | Kart başlığı sarar ve kırpar (`truncate`, `flex-wrap`). |
| 18 | ÇALIŞIYOR | `RatingStars` `role="img"` + "5 üzerinden N yıldız". |
| 19 | ÇALIŞIYOR | TR/EN boş metin etiketi. |
| 20 | ÇALIŞIYOR | Boyut etiketleri tek sözlükten (form ile çekmece aynı), temizlik dahil. |
| 21 | ÇALIŞIYOR | Çekmecede yanıt + tarih. |
| 22 | ÇALIŞIYOR | `pickActiveRemedy`: açık > en yeni kabul > süresi dolmuş ("en eski teklif kazanır" hatası kapandı). |
| 23 | ÇALIŞIYOR | `Intl.RelativeTimeFormat` uygulama diliyle. |
| 24 | ÇALIŞIYOR | `StatusBadge` (ikon + metin), TR/EN. |
| 25 | ÇALIŞIYOR | Tutar çekmecedeki makbuzda; 0 ya da boş tutar gizli, para biçimi dile göre. |
| 26 | ÇALIŞIYOR | Aksiyon bandı, yorum bekleyen tüketimi doğrudan yazma çekmecesinde açar (hedef sayfanın filtre parametresine bağımlılık yok). |
| 27 | ÇALIŞIYOR | BOZUK düzeldi: başlıkta bayinin işletme adı, alt satırda QR noktası. |
| 28 | ÇALIŞIYOR | QR noktası ayrı satırda (tekrar yok). |
| 29 | ÇALIŞIYOR | Yıldız erişilebilir; duygu ikonu müşteri kartından KALDIRILDI (analizsizken "nötr" iddiası yok). |
| 30 | ÇALIŞIYOR | |
| 31 | ÇALIŞIYOR | |
| 32 | ÇALIŞIYOR | #22 ile aynı öncelik. |
| 33 | ÇALIŞIYOR | Kartın tamamı detay çekmecesini açar (`?id=` derin link); tüketim yorumları dahil, silinmiş kayıt filtreli. |
| 34 | KALDIRILDI | "Olumsuz" damgası iç analitik dili; yerine sonuç sinyalleri (okundu, yanıtlandı, telafi). |
| 35 | ÇALIŞIYOR | İlk kullanım `EmptyState` + "QR okut". |
| 36 | ÇALIŞIYOR | `listItem` bütçeli kademe (ilk 12, ≤ 0,6 sn), `useMotionPolicy`. |
| 37 | ÇALIŞIYOR | Kart gerçek `<button>`; hover ve odak artık gerçek etkileşim. |
| 38 | ÇALIŞIYOR | İmleç sayfalama: görünür alana yaklaşınca otomatik + "Daha eskileri göster" düğmesi. |
| 39 | ÇALIŞIYOR | Çekmecede yorum düzenleme (PATCH semantiği). |
| 40 | ÇALIŞIYOR | Durum filtresi: yanıtlanan, yanıt bekleyen, telafili, 1–2 yıldız; liste ay başlıklarıyla gruplu. |
| 41 | ÇALIŞIYOR | #8. |
| 42 | ÇALIŞIYOR | Bütün metinler `components/customer/m-seslerim/copy.ts` (TR/EN). |
| 43 | ÇALIŞIYOR | Bu yüzey `/api/feedbacks`'i artık kullanmıyor; kendi ucu yalnız CUSTOMER + `userId` kapsamlı. (`/api/feedbacks` STAFF açığı P0-05'te kapanmıştı.) |
| 44 | KALAN | Eski `/customer/feedbacks` CTA'sı Seslerim'e yönlenir; öğeye derin link için `lib/notify-email.ts` `ctaPath` → `/customer/me/voices?id=…` değişikliği sahiplik dışı. |
| 45 | ÇALIŞIYOR (tüketim) / KALAN (QR) | Tüketim yorumu artık `mintPoints(source: 'review', sourceId)` ile yazılır, kartta "+N puan" defterden okunur. QR kredisi `/api/feedbacks` POST'ta kaynağa bağlanmıyor (sahiplik dışı; F1.3 defter göçü). |
| 46 | ÇALIŞIYOR | "Yeni yanıt" işareti (cihaz başına son ziyaret anı; depolama yoksa sessizce yok). |

### Kapanan bulgular
1 (müşteri yüzeyi `/api/feedbacks`'ten çıktı; uç P0-05'te kapsamlı), 2 (`/api/customer/reviews` bu yüzeyde kullanılmıyor, zaten izin listeli), 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 — **14/14**.

### Eksik özelliklerden uygulananlar
Etki akışı (kartta durum adımları + çekmecede kronolojik yolculuk), yorum başına ödül (tüketim yorumu), bekleyen fırsatlar bandı (yorum bekleyen tüketim + açık telafi, gerçek ödül ve tavan), zaman çizelgesi + filtre, yorum düzenleme ve `?id=` derin link, yeni yanıt işareti. "Wrapped" köprüsü `/customer/my-year`'ın işi (uygulanmadı).

### Kalanlar
- E-posta ve bildirim için öğe derin linki (`lib/notify-email.ts`, `components/dashboard/notification-center.tsx`; sahiplik dışı).
- QR geri bildirimi başına puan (defterde `sourceId` yok; `/api/feedbacks` sahiplik dışı).
- Arama Postgres `ILIKE` ile yapılıyor; Türkçe `İ/ı` eşleşmesi veritabanı harmanlamasına bağlı (trigram/unaccent ayrı iş).
