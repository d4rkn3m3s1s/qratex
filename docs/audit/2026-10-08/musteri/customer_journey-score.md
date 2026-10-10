# /customer/journey-score

**Amaç** · Müşteriye kendi "yolculuk skorunu" (0–100), bu skora bağlı 4 aşamalı ilerleme şeridini ve kayıt / geri bildirim / rozet / ödül / tüketim olaylarından oluşan kronolojik bir zaman çizelgesini ("Timehop") göstermek. Menüde "Yolculuk Skorum", sayfa başlığında ise "Zaman Çizelgem" adıyla geçiyor.

**Genel puan: 4.5 / 10** · **Karar: birleştir** (zaman çizelgesi birleşik bir "Aktivite / Yolculuk" akışına, skor ise yeniden tanımlanarak Gelişim Merkezi'ne (`/customer/progress-hub`) taşınmalı)

Kapsam: `app/customer/journey-score/page.tsx` (357 satır), `app/customer/journey-score/layout.tsx`, `app/api/customer/journey-timeline/route.ts`, `app/api/customer/journey-score/route.ts`, `messages/tr.json` + `messages/en.json` (`journeyScore` bloğu, 1744–1778), `components/ui/progress.tsx`, `components/ui/inline-loading-status.tsx`, `components/layout/dashboard-page-hero.tsx` → `components/admin/admin-premium-hero.tsx`, `components/providers.tsx` (QueryClient + MotionConfig), `lib/api-auth.ts`, `lib/module-gate.ts`, `prisma/schema.prisma` (Feedback, ConsumptionReview, UserBadge, UserReward, Consumption). Kod çalıştırılmadı; tüm bulgular okumaya dayalı. Sayfaya ait test bulunamadı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Veri çekme ve çizim çalışıyor, ancak skor formülü "ne kadar olumlu puan verdiğini" ölçüyor; rozet sayısı 10'da, yorum sayısı 100'de kesiliyor ve hata durumu yanlış "boş/0" ekranına düşüyor. |
| UX | 4/10 | Skor iki kez (halka + çubuk) gösteriliyor, aşama metinleri ölçülmeyen davranışları (tüketim/ziyaret) iddia ediyor, olaylar tıklanamıyor ve "sonraki adım" ipucu yanıltıcı. |
| Görsel | 6/10 | Halka animasyonu ve ortalanmış zaman çizelgesi düzgün; buna karşılık sabit renkli metrik kartlar ile tıklanamayan kartlardaki hover efektleri diğer premium sayfaların gerisinde kalıyor. |
| Mimari | 4/10 | İki ayrı uç ve iki ayrı yetki/replay kontrolü var, olay metinleri sunucuda sabit Türkçe üretiliyor, ConsumptionReview modeli yok sayılıyor, modül kapatma anahtarı uygulanmıyor ve ölü kod/importlar mevcut. |
| Performans | 6/10 | Sorgular küçük, indeksli ve `Promise.all` ile paralel çalışıyor; ancak 40 px'lik maskot için 543 KB'lık optimize edilmemiş bir SVG iniyor ve iki sorgu tamamlanmadan sayfa tümüyle spinner'da bekliyor. |
| Erişilebilirlik + Mobil | 5/10 | `MotionConfig reducedMotion="user"` sayesinde hareket azaltma destekleniyor ve başlık hiyerarşisi doğru; fakat skor halkası ile progress bar etiketsiz, kartlar sahte hover affordance'ı taşıyor ve mobil zaman çizgisi hizası doğrulanmadı. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (layout) | KISMİ | `layout.tsx:5`, `messages/tr.json:89-90` | Açıklamada "Bileşik skor bileşenleri ve haftalık değişim" yazıyor, ancak sayfada haftalık değişim de skor bileşeni dökümü de yok; vaat edilen içerik bulunmuyor. |
| 2 | Kimlik doğrulama (proxy + API) | ÇALIŞIYOR | `proxy.ts:124`, `journey-timeline/route.ts:14`, `journey-score/route.ts:14` | `userId` oturumdan alınıyor, IDOR yüzeyi yok. ADMIN rolü de erişebiliyor ve kendi (büyük olasılıkla boş) verisini görüyor; zararsız. |
| 3 | Modül aç/kapa anahtarı (`journey_score`) | EKSİK | `lib/module-controls.ts:29`; iki route'ta da `assertModuleEnabled` çağrısı yok (`lib/module-gate.ts:92`) | Yönetici modülü kapatsa bile doğrudan URL ve API çalışmaya devam ediyor; anahtar yalnızca menüyü etkiliyor. |
| 4 | Yükleniyor durumu | KISMİ | `page.tsx:95-101` | İki sorgunun ikisi de bitene kadar yalnızca tam sayfa spinner görünüyor; iskelet ve kademeli gösterim yok. |
| 5 | Hata durumu | BOZUK | `page.tsx:77-80` (`res.ok` kontrolü yok), `page.tsx:84-93` (`isError` okunmuyor) | Timeline uçta hata olursa `{error}` gövdesi başarılı veri sayılıyor ve "Listeniz henüz boş" gösteriliyor. Skor hatasında `retry:1` (`providers.tsx:212`) sonrasında skor 0 ve "Tanışma" aşaması gösteriliyor. |
| 6 | Hero (eyebrow/başlık/açıklama) | ÇALIŞIYOR | `page.tsx:128-134` | h1 hero içinde (`admin-premium-hero.tsx:227`). Hero'daki başlık "Zaman Çizelgem", menüdeki ad ise "Yolculuk Skorum" (`tr.json:2586`); ikisi uyuşmuyor. |
| 7 | "Geri bildirim yolculukları" CTA kartı | ÇALIŞIYOR | `page.tsx:136-145` → `/customer/feedbacks`; hedef sayfada `feedbacks/page.tsx:584` her geri bildirim için `/journey` bağlantısı veriyor | CTA tek tek yolculuklara değil listeye götürüyor; kullanıcı aradığı yolculuğu orada yeniden bulmak zorunda. |
| 8 | Animasyonlu skor halkası | ÇALIŞIYOR (görsel) | `page.tsx:153-175` | Etiketsiz (`role="img"` ve `aria-label` yok). |
| 9 | Skor formülü (sunucu) | BOZUK (ürün mantığı) | `journey-score/route.ts:28-36` | Bulgu 1'e bakın: tek bir 5★ yorum 92 puan getiriyor; etkileşim ağırlığı yalnızca yaklaşık %9. |
| 10 | Skor başlığı/açıklaması | SAHTE (iddia) | `tr.json:1752-1753` "İşletmelerdeki etkileşiminiz hesaplanarak belirlendi" | Skor, etkileşimi değil verilen puanların ortalamasını ölçüyor. |
| 11 | Seviye rozeti | ÇALIŞIYOR | `page.tsx:181-183`, `journey-timeline/route.ts:136` | Timeline ucu hata verirse "Sev." etiketi boş kalıyor. |
| 12 | Puan rozeti | ÇALIŞIYOR | `page.tsx:184-186` | Sayı biçimlendirmesi yok (ör. 12500 yerine "12.500" gösterilmeli). |
| 13 | Rozet sayısı | BOZUK | `journey-timeline/route.ts:35` (`take: 10`) + `:135` (`userBadges.length`) | 10'dan fazla rozeti olan kullanıcıda burada "10" görünüyor; Gelişim Merkezi ise gerçek sayıyı (`stats/route.ts:23` `userBadge.count`) gösteriyor. |
| 14 | "Toplam Yorum" kartı | KISMİ | `journey-score/route.ts:24` (`take: 100`), `:27` | 100'de kesiliyor. ConsumptionReview (tüketim yorumu) sayılmıyor (bulgu 2). |
| 15 | "Pozitif Oran" kartı | KISMİ | `page.tsx:216`, `journey-score/route.ts:29` | AI tarafından henüz işlenmemiş (`sentiment=null`) yorumlar pozitif sayılmadığı için oran düşük çıkıyor. "%67" biçimi EN dilinde de aynen kalıyor. |
| 16 | `avgRating` / `recentAvgRating` metrikleri | ÖLÜ (gönderiliyor, kullanılmıyor) | `journey-score/route.ts:43-45`; sayfada okunmuyor | Skorun asıl belirleyicisi olan iki metrik kullanıcıya hiç gösterilmiyor. |
| 17 | "Timehop (Zaman Çizelgesi)" başlığı | KISMİ | `page.tsx:223`, `tr.json:1759` | Üçüncü taraf bir marka adı (Timehop) arayüz metnine sızmış. |
| 18 | "Yolculukta neredesiniz?" kartı + maskot | KISMİ | `page.tsx:224-245`, `MASCOT_SRC` `page.tsx:54-55` | Maskot SVG'si 543 KB ama 40×40 px gösteriliyor; `.svg` uzantılı kaynak next/image tarafından optimize edilmiyor (bulgu 9). |
| 19 | Aşama rozeti + progress bar | ÇALIŞIYOR (tekrar) | `page.tsx:246-250` | Aynı skor halkada zaten gösteriliyor; progress bar'ın `aria-label`'ı yok. |
| 20 | 4 aşama çipi | KISMİ | `page.tsx:251-270`, `tr.json:1771-1774` | "Düzenli ziyaret" gibi aşama adları ziyaret ölçmeyen bir skordan türetiliyor. |
| 21 | Aşama ipucu metni | SAHTE | `page.tsx:111-118`, `tr.json:1768` "Düzenli tüketim yapıyorsunuz" | Skor hesabında tüketim verisi hiç yok. |
| 22 | "Sonraki adım" ipucu | BOZUK (yanıltıcı) | `page.tsx:109`, `:119-124` | `5 - totalFeedbackCount` kuralı formülle ilişkisiz (bulgu 4). |
| 23 | Zaman çizelgesi listesi | KISMİ | `journey-timeline/route.ts:20-49`, `:131`, `:141` | Kaynaklar farklı pencerelerle (20/10/10/10) kesildiği için akışta boşluklar oluşuyor; sayfalama yok. Aktif kullanıcıda "Yolculuk Başladı" olayı listeden düşüyor. |
| 24 | Olay türü: kayıt | ÇALIŞIYOR | `journey-timeline/route.ts:65-75` | Metin sabit Türkçe. |
| 25 | Olay türü: geri bildirim | ÇALIŞIYOR | `:78-89` | İşletme adı, yorum metni ve işletme yanıtı yok; "4/5 puan ile geri bildirim verildi" dışında bilgi taşımıyor. |
| 26 | Olay türü: rozet | ÇALIŞIYOR | `:92-102` | — |
| 27 | Olay türü: ödül | ÇALIŞIYOR | `:105-115` | `claimedAt` (kullanıldı) ile `redeemedAt` (talep edildi) ayrımı gösterilmiyor (`schema.prisma:703-704`). |
| 28 | Olay türü: tüketim | ÇALIŞIYOR | `:118-128` | İşletme ve ürün adı yok, tutar `tr-TR` + "₺" olarak sabit. |
| 29 | Olay türü: `vip` | ÖLÜ | Tipte tanımlı (`page.tsx:20`, `route.ts:53`), hiçbir yerde üretilmiyor | — |
| 30 | Diğer olay türleri (tüketim yorumu, görev, oyun, davet, sürpriz kutu, turnuva, puan hareketi) | EKSİK | — | Platformun oyunlaştırma çekirdeği zaman çizelgesinde görünmüyor. |
| 31 | Geri bildirim olayındaki yıldız çipi | ÇALIŞIYOR | `page.tsx:326-331` | — |
| 32 | Göreli + mutlak tarih | ÇALIŞIYOR | `page.tsx:334`, `:342` | date-fns yerel ayarı doğru seçiliyor (`page.tsx:67`). |
| 33 | Emoji / ikon fallback | ÇALIŞIYOR | `page.tsx:312-316` | `\p{Emoji}` rakamları da yakalıyor; mevcut veride sorun çıkarmaz (doğrulanmadı). |
| 34 | Olaydan detaya gitme | EKSİK | `page.tsx:320-345` (Link yok) | Kart ve düğümde hover efekti var (`:309`, `:322`) ama tıklanınca hiçbir şey olmuyor; sahte affordance. |
| 35 | Boş durum | BOZUK | `page.tsx:275-282` | Kayıt olayı her zaman eklendiği için (`route.ts:65`) gerçek kullanıcıda bu ekran neredeyse hiç görünmüyor; yalnızca hata anında beliriyor ve yanlış mesaj veriyor. |
| 36 | Kaydırınca giriş animasyonu | ÇALIŞIYOR | `page.tsx:297-302` | Global `MotionConfig reducedMotion="user"` (`providers.tsx:232`) dönüşümleri kapatıyor. |
| 37 | `AnimatePresence` | ÖLÜ | `page.tsx:289-351` | Çocuklarda `exit` tanımı yok ve liste değişmiyor; etkisiz. |
| 38 | Metrik kartlarındaki hover gölgesi | KISMİ | `page.tsx:197`, `:209` | Tıklanamayan kartta tıklanabilirlik hissi veriyor. |
| 39 | Mobil zaman çizgisi | KISMİ (doğrulanmadı) | `page.tsx:284-307` | Çizgi merkezi yaklaşık 28 px, düğüm merkezi yaklaşık 32 px; düğüm kart solunun ~8 px üstüne biniyor. Görsel olarak doğrulanmadı. |
| 40 | i18n (arayüz metinleri) | ÇALIŞIYOR | `tc('journeyScore.*')` | — |
| 41 | i18n (olay metinleri) | BOZUK | `journey-timeline/route.ts:69-70, 82-83, 96-97, 109-110, 122-123` | EN kullanıcısı "Yolculuk Başladı", "Rozet Kazanıldı" ve "₺" görüyor. "QRateX" yazımı da sabit. |
| 42 | Filtre / tür sekmesi / arama | EKSİK | — | 30 olay, filtre olmadan karışık bir akışta sunuluyor. |
| 43 | Skor geçmişi / trend grafiği | EKSİK | Metadata `tr.json:90` "haftalık değişim" vaat ediyor | — |
| 44 | "Skor nasıl hesaplanır?" açıklaması | EKSİK | — | Kullanıcı skoru nasıl yükselteceğini bilemiyor. |
| 45 | Paylaşma / özet kartı | EKSİK | — | — |
| 46 | Yenile / çekerek yenile | EKSİK | `refetchOnWindowFocus:false` (`providers.tsx:213`) | — |
| 47 | Kullanılmayan import ve değişkenler | ÖLÜ KOD | `page.tsx:7` (`CheckCircle2`, `Lock`, `ShieldAlert`, `Gift`, `Coffee`), `:8` (`CardHeader`, `CardTitle`), `:110` (`positiveRatePercent`), `:26` `metadata?: any`, `:44` `Record<string, any>` | `Gift`/`Coffee` yalnızca `iconMaps` içinde kullanılıyor, ancak olaylar emoji taşıdığı için bu ikonlara pratikte hiç düşülmüyor. |

**Durum özeti:** ÇALIŞIYOR 18 · KISMİ 13 · BOZUK 6 · SAHTE 2 · EKSİK 8 (ölü kod/veri satırları KISMİ sayıldı).

---

## Bulgular

### 1. Yolculuk skoru etkileşimi değil, "ne kadar olumlu puan verdiğini" ölçüyor
- **Önem:** kritik · **Kategori:** ürün mantığı / veri bütünlüğü
- **Kanıt:** `app/api/customer/journey-score/route.ts:34-36`

  ```ts
  const raw = avgRating * 20 + positiveRate * 30 + Math.min(1, count / 10) * 20 + recentAvg * 15;
  const journeyScore = count === 0 ? 0 : Math.round((raw / 225) * 100);
  ```

- **Sorun:** 225'lik ham puanın 175'i (avgRating ×20 + recentAvg ×15) verilen yıldızlardan, 30'u AI duygu analizinden geliyor. Etkileşim payı en fazla 20, yani yaklaşık %9. Somut örnekler:
  - Tek bir 5★ olumlu yorum: 100+30+2+75 = 207 → **92**. Kullanıcı tek yorumla "Sadakat" aşamasına çıkıyor.
  - 10 dürüst, ortalaması 3★ olan nötr yorum: 60+0+20+45 = 125 → **56**.
  - 10 eleştirel 2★ yorum: 90 → **40**.

  Platformun özü dürüst geri bildirim toplamak; bu formül ise eleştiren kullanıcıyı "düşük skor" ile cezalandırıyor ve puan şişirmeyi ödüllendiriyor. Bu da işletmelere giden verinin kalitesini doğrudan bozan bir teşvik. Ayrıca `scoreDesc` metni ("etkileşiminiz hesaplanarak", `tr.json:1753`) kullanıcıya gerçeği söylemiyor.
- **Öneri:** Skoru **katkı/etkileşim skoru** olarak yeniden tanımlayın ve verilen puanın yönünü (iyi/kötü) skordan tamamen çıkarın. Önerilen bileşenler: (a) son 90 gündeki yorum sayısı (Feedback + ConsumptionReview), (b) yorum kalitesi (metin uzunluğu, medya, AI tarafından "yararlı" işaretlenen ifadeler; toksik ya da `trustFlagged` olanlar hariç), (c) düzenlilik (haftalık seri), (d) işletmenin aksiyon aldığı veya yanıtladığı yorum sayısı (my-year ucu bu veriyi zaten topluyor, `my-year/route.ts` başlık yorumu). Formülü `lib/journey-score.ts` içinde saf bir fonksiyon olarak yazın, birim testlerle "5★ ile 1★ aynı skoru verir" değişmezini sabitleyin ve sayfada "Skorun nasıl hesaplanır" çekmecesinde bileşen bileşen gösterin.
- **Efor:** M

### 2. Tüketim yorumları (ConsumptionReview) skora ve zaman çizelgesine hiç girmiyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü
- **Kanıt:** `journey-score/route.ts:20-25` ve `journey-timeline/route.ts:25-30` yalnızca `prisma.feedback` sorguluyor. Oysa `ConsumptionReview` modeli (`schema.prisma:1602`) müşteri tarafından `app/api/customer/consumptions/[id]/review/route.ts:175` üzerinden yazılıyor ve karakter rozeti sistemi yalnızca bu modeli sayıyor.
- **Sorun:** Kartla tüketim yapıp yorum yazan bir kullanıcının "Toplam Yorum" değeri 0, skoru 0, aşaması "Tanışma" görünüyor ve "5 geri bildirim daha paylaşın" mesajını alıyor. Aynı kullanıcı `/customer/feedbacks` sayfasında yorumlarını görebiliyor (`/api/customer/reviews`). Sayfalar arasında tutarsız bir gerçeklik oluşuyor.
- **Öneri:** İki kaynağı birleştiren ortak bir `getCustomerReviewActivity(userId)` yardımcı fonksiyonu yazın. Bu fonksiyon Feedback (`deletedAt:null`) ve ConsumptionReview'u `{source, rating, sentiment, createdAt, dealerName, replied}` biçiminde normalize etsin; skor, timeline, my-year ve stats aynı fonksiyonu kullansın.
- **Efor:** M

### 3. Hata yönetimi yanlış ekran üretiyor (sahte boş durum, sahte 0 skor)
- **Önem:** yüksek · **Kategori:** hata yönetimi
- **Kanıt:** `page.tsx:77-80` (`return res.json()`, `res.ok` kontrolü yok); `page.tsx:84-93` (`isError` hiçbir yerde okunmuyor); `page.tsx:105-106` (`?? 0` varsayılanları); `page.tsx:275` boş durum.
- **Sorun:** Token-replay 403'ü (`lib/api-auth.ts:70-76`), 401 ya da 500 durumunda timeline `{error}` gövdesini başarılı veri sayıyor ve "Listeniz henüz boş" gösteriyor; seviye/puan/rozet rozetleri boş kalıyor. Skor ucu hata verirse skor 0, aşama "Tanışma" oluyor ve "5 geri bildirim daha paylaşın" yönlendirmesi çıkıyor. Kullanıcı verisinin silindiğini düşünebilir.
- **Öneri:** Her iki `queryFn`'de `if (!res.ok) throw` kullanın. Sayfada bölüm bazında hata kartı ("Yüklenemedi · Tekrar dene" ve `refetch`) gösterin. Skor ile timeline'ı birbirinden bağımsız render edin: skor gelmese de timeline görünsün. Boş durumu ancak `isSuccess && events.length <= 1` (yalnızca kayıt olayı varsa) koşuluyla, "İlk QR'ını okut" CTA'sıyla gösterin.
- **Efor:** S

### 4. Aşama metinleri ve "sonraki adım" ipucu formülle çelişiyor
- **Önem:** yüksek · **Kategori:** UX / doğruluk
- **Kanıt:** `page.tsx:57-63` (aşama eşikleri 30/55/80), `page.tsx:109` (`feedbackTarget = 5 - count`), `page.tsx:119-124`; `tr.json:1768` "Düzenli tüketim yapıyorsunuz", `tr.json:1772` "Düzenli ziyaret".
- **Sorun:** Aşama adları ve ipuçları tüketim ve ziyaret davranışını anlatıyor, oysa skorda tüketim verisi yok. "En az {count} geri bildirim daha paylaşın" kuralının skorla bağı yok: tek bir 5★ zaten 92 puan getiriyor. 6 adet 1★ yorumu olan kullanıcıya "etkileşimi sürdürün" deniyor, ama daha fazla yorum skoruna en fazla birkaç puan ekleyebiliyor. Kullanıcıya gerçekleştiremeyeceği bir hedef gösteriliyor.
- **Öneri:** Aşamaları ve "sonraki adım" ipucunu yeni skorun (bulgu 1) bileşenlerinden **hesaplanan somut görevlere** bağlayın. Örneğin "Sonraki aşama için: 2 yorum daha + 1 hafta seri". Bu hedefi sunucu döndürsün (`nextMilestone: {stage, missing: [{kind, remaining}]}`), istemci yalnızca göstersin. Duolingo'daki "bir sonraki lige kaç XP" netliği hedeflenmeli.
- **Efor:** M

### 5. Sayılar yanlış: rozet 10'da, yorum 100'de kesiliyor
- **Önem:** yüksek · **Kategori:** veri doğruluğu
- **Kanıt:** `journey-timeline/route.ts:35` `take: 10` → `:135` `totalBadges: userBadges.length`; `journey-score/route.ts:24` `take: 100` → `:42` `totalFeedbackCount: count`. Karşılaştırma: `app/api/customer/stats/route.ts:23` `prisma.userBadge.count`.
- **Sorun:** 25 rozeti olan kullanıcı burada "10 Rozet", Gelişim Merkezi'nde "25" görüyor. 150 yorumu olan kullanıcı "100 Toplam Yorum" görüyor. Ayrıca `avgRating`/`positiveRate` "tüm zamanlar" değil, "son 100 yorum" üzerinden hesaplanıyor.
- **Öneri:** Sayılar için `count()` ve `aggregate({_avg})` kullanın; listeleme sorgularını sayım sorgularından ayırın. Rozet/puan/seviye özetini zaten var olan `/api/customer/stats` ucundan alın, aynı veriyi tekrar hesaplamayın.
- **Efor:** S

### 6. Zaman çizelgesi metinleri sunucuda sabit Türkçe; EN kullanıcı karışık dil görüyor
- **Önem:** orta · **Kategori:** i18n
- **Kanıt:** `journey-timeline/route.ts:69-70`, `:82-83`, `:96-97`, `:109-110`, `:122-123` ("Yolculuk Başladı", "Rozet Kazanıldı: …", "₺ tutarında tüketim", `toLocaleString('tr-TR')`); `page.tsx:216` `%{…}`.
- **Sorun:** Arayüz İngilizceyken kartların başlığı ve açıklaması Türkçe kalıyor. Para birimi ve yüzde biçimi sabit.
- **Öneri:** Uç metin değil, **yapısal olay** döndürsün: `{type, at, refId, data:{rating, badgeName, rewardName, amount, dealerName}}`. Metinleri istemcide `tc('journeyEvents.badge', {name})` ile, sayıları `Intl.NumberFormat(locale, {style:'currency'})` ve `{style:'percent'}` ile üretin. Bu yaklaşım ileride push/mail için aynı olay sözlüğünün yeniden kullanılmasını da sağlar.
- **Efor:** S

### 7. Zaman çizelgesi kronolojik olarak tutarsız ve sayfalanmıyor
- **Önem:** orta · **Kategori:** veri / UX
- **Kanıt:** `journey-timeline/route.ts:29` (feedback 20), `:35` / `:41` / `:47` (badge/reward/consumption 10'ar), `:131` sıralama, `:141` `slice(0, 30)`.
- **Sorun:** Her kaynak kendi penceresinden kesildiği için birleşik akışta boşluk oluşuyor. Örneğin 11. en yeni tüketim, 15. en yeni yorumdan daha yeni olabilir ama listeye girmiyor. Aktif kullanıcıda kayıt olayı ("Yolculuk Başladı") 30'un dışında kalıyor; yani "yolculuğun başlangıcı" yalnızca yeni kullanıcılara görünüyor. "Daha fazla yükle" seçeneği yok.
- **Öneri:** Cursor tabanlı bir birleşik akış kurun: `GET /api/customer/activity?before=<ISO>&limit=20`. Her kaynaktan `createdAt < before` koşuluyla `limit` kadar kayıt alın, birleştirip ilk `limit`'i döndürün ve `nextCursor` verin. Bu doğru bir k-yollu birleştirmedir. Uzun vadede tek bir `CustomerActivity` olay tablosu (yazma anında append) bu sorunu kökten çözer ve yeni kaynak eklemek tek satıra iner. İstemcide `useInfiniteQuery` kullanın. "Yolculuk Başladı" kartı akıştan ayrılıp sayfa başında sabit bir "üyelik tarihi" bilgisi olarak gösterilsin.
- **Efor:** M (cursor birleştirme) / L (olay tablosu)

### 8. Oyunlaştırma çekirdeği zaman çizelgesinde yok
- **Önem:** orta · **Kategori:** ürün kapsamı
- **Kanıt:** `journey-timeline/route.ts:20-49` yalnızca 5 kaynak sorguluyor; `vip` türü tanımlı ama hiç üretilmiyor (`:53`).
- **Sorun:** Görev tamamlama, mini oyun ödülü, davet (referral) kademesi, sürpriz kutu açma, turnuva sonucu, lig terfisi, seviye atlama ve tüketim yorumu gibi kullanıcı açısından en "anlamlı anlar" akışta görünmüyor. Mevcut akış yorumlar ve tüketimlerden oluşan kuru bir log gibi duruyor.
- **Öneri:** Bulgu 7'deki olay sözlüğüne öncelik sırasıyla `level_up`, `quest_completed`, `game_reward`, `referral_tier`, `surprise_box`, `tournament_result` ve `review_replied` (işletme yanıtladı) türlerini ekleyin. `review_replied` en değerli olandır: kullanıcıya "sesin duyuldu" hissini verir. Branch'teki "An Motoru" (moment engine) spesifikasyonu (`3a8b00f`) bu olay sözlüğünün doğal sahibi olabilir; o sistemle hizalanmalı (doğrulanmadı).
- **Efor:** L

### 9. 40 px maskot için 543 KB'lık optimize edilmemiş SVG
- **Önem:** orta · **Kategori:** performans
- **Kanıt:** `page.tsx:54-55`, `:237-243`; dosya `public/images/zamanikimizisilerizimizideğil/fantastik 1.svg` = 543.461 bayt. Next.js `.svg` kaynakları `dangerouslyAllowSVG` olmadan optimize etmez (`next.config` içinde bu ayar bulunamadı).
- **Sorun:** Mobil kullanıcı küçük bir avatar için yarım megabayt indiriyor; ayrıca bu PWA ön belleğini de şişirebilir.
- **Öneri:** Maskotun 80×80 (2x) WebP/AVIF sürümünü üretin (`sharp` projede zaten var) ya da SVG'yi SVGO ile sadeleştirin. Tüm "fantastik/ANİMAL" setini build-time'da raster küçük resimlere dönüştüren bir betik yazın. Klasör adındaki Unicode/URL kodlama kırılganlığını (`%C4%9F`) da ASCII bir yeniden adlandırmayla giderin.
- **Efor:** S

### 10. Tıklanamayan öğelerde sahte affordance; olaylardan detaya gidilemiyor
- **Önem:** orta · **Kategori:** UX / erişilebilirlik
- **Kanıt:** `page.tsx:309` (`whileHover scale+rotate`), `:322` (`hover:-translate-x-1`, `hover:shadow-md`), `:197`/`:209` (metrik kartı hover gölgesi); hiçbirinde Link, `onClick` ya da `tabIndex` yok.
- **Sorun:** Kullanıcı kartın tıklanabilir olduğunu sanıyor, ama hiçbir şey olmuyor. Bir geri bildirim olayından ilgili `/customer/feedbacks/[id]/journey` sayfasına, rozetten `/customer/badges`'e, ödülden kupon koduna gitmek mümkün değil.
- **Öneri:** Her olay türüne `href` eşlemesi ekleyin: feedback → `/customer/feedbacks/{id}/journey`, badge → `/customer/badges?highlight={id}`, reward → `/customer/rewards#{id}`, consumption → `/customer/consumptions/{id}`. Kartı `<Link>` ile sarın ve focus-visible halkası verin. Bağlantısı olmayan kartlardan hover hareketini kaldırın.
- **Efor:** S

### 11. Modül kapatma anahtarı sayfayı ve API'yi korumuyor
- **Önem:** orta · **Kategori:** yetki / yönetişim
- **Kanıt:** `lib/module-controls.ts:29` (`journey_score`, "optional"); `lib/module-gate.ts:92` `assertModuleEnabled` diğer müşteri uçlarında kullanılıyor (ör. `app/api/customer/lounge/route.ts:4`), bu iki uçta kullanılmıyor.
- **Sorun:** Yönetici modülü kapattığında menü gizleniyor, ancak URL ve API çalışmaya devam ediyor; yönetici iradesi uygulanmamış oluyor.
- **Öneri:** Her iki uca `const blocked = await assertModuleEnabled('journey_score', { role:'customer', userId }); if (blocked) return blocked;` ekleyin. İstemcide 403 + `reason: module_disabled_*` geldiğinde "Bu bölüm şu an kapalı" kartını gösterin.
- **Efor:** S

### 12. Bilgi mimarisi: skor iki kez, kimlik üç ayrı adla
- **Önem:** orta · **Kategori:** UX / bilgi mimarisi
- **Kanıt:** Skor halkası `page.tsx:153-175` + "Skor x/100" ve progress bar `:247-250`. Adlar: menü "Yolculuk Skorum" (`tr.json:2586`), hero "Zaman Çizelgem" (`tr.json:1747`), bölüm "Timehop (Zaman Çizelgesi)" (`tr.json:1759`).
- **Sorun:** Sayfanın ne olduğu net değil: bir skor sayfası mı, bir aktivite akışı mı? Aynı sayı iki görselde tekrar ediliyor. "Timehop" üçüncü taraf bir ürün adı.
- **Öneri:** Sayfanın kimliğini tek ada indirin ("Yolculuğum"). Skor halkası, aşama şeridini içinde barındıran tek bir "hero gauge" olsun (halkanın çevresine 4 aşama segmenti yerleştirilerek). Progress bar kaldırılsın. Başlık ile menü adı eşitlensin.
- **Efor:** S

### 13. Erişilebilirlik eksikleri
- **Önem:** düşük · **Kategori:** erişilebilirlik
- **Kanıt:** SVG halka `page.tsx:159` etiketsiz; Radix progress `page.tsx:250` için `aria-label` yok (`components/ui/progress.tsx:18`); metrik kartı ikonları `:200`, `:212` `aria-hidden` taşımıyor; aşama çipindeki "✓" `:266` ekran okuyucuya "check mark" diye okunuyor; düğümler yalnızca renkle ayrışıyor.
- **Öneri:** Halkaya `role="img" aria-label="Yolculuk skoru 72/100, Aktif geri bildirim aşaması"` ekleyin. Progress'e `aria-label` verin. Aşama listesini `<ol>` + `aria-current="step"` ile kurun. Dekoratif ikonlara `aria-hidden` ekleyin. Olay listesini `<ol>`/`<li>` + `<time dateTime>` ile semantik hale getirin.
- **Efor:** S

### 14. Ölü kod, `any` kaçakları, gereksiz `AnimatePresence`
- **Önem:** düşük · **Kategori:** kod kalitesi
- **Kanıt:** `page.tsx:7` kullanılmayan `CheckCircle2`, `Lock`, `ShieldAlert`; `:8` `CardHeader`, `CardTitle`; `:110` `positiveRatePercent` (hesaplanıyor ama kullanılmıyor, `:216` aynı değeri yeniden hesaplıyor); `:26` `metadata?: any`; `:44` `Record<string, any>`; `:289` `exit` tanımı olmayan `AnimatePresence`; tipte `vip` türü var ama hiç üretilmiyor. Route'larda `as { userId: string; deletedAt: null }` cast'i (`journey-score/route.ts:21`, `journey-timeline/route.ts:26`) gereksiz.
- **Öneri:** Olay tipini sunucuyla paylaşılan tek bir `lib/journey/types.ts` dosyasına taşıyın (ayrık birleşim: `{type:'feedback', data:{rating}} | …`). `any` ve cast'leri kaldırın, kullanılmayan importları temizleyin.
- **Efor:** S

### 15. İki ayrı uç, iki ayrı auth/replay kontrolü
- **Önem:** düşük · **Kategori:** mimari / performans
- **Kanıt:** `page.tsx:75-93` iki `useQuery`; her iki uç da `requireAuth` → `checkTokenReplay` çalıştırıyor (`lib/api-auth.ts:64-77`). Feedback tablosu iki uçta ayrı ayrı sorgulanıyor (`journey-score/route.ts:20`, `journey-timeline/route.ts:25`).
- **Sorun:** Her sayfa açılışında çift oturum doğrulaması ve aynı tablo için iki sorgu yapılıyor; sayfa ikisini birden bekliyor.
- **Öneri:** Bir özet ucu (`/api/customer/journey` → `{score, breakdown, nextMilestone, counts}`, kullanıcı başına 60 sn Upstash cache, yorum/rozet yazımında invalidation) ve bir akış ucu (`/api/customer/activity`, cursor'lu) tanımlayın. Özet hızlı gelsin ve akış ayrıca yüklensin.
- **Efor:** M

---

## Eksik özellikler (kıyas ürünlerle)

1. **Skor trendi ve "bu hafta +6" göstergesi** (Duolingo XP grafiği, Revolut harcama trendi): metadata bunu vaat ediyor ama ekranda yok. Haftalık skor anlık görüntüsü (`JourneyScoreSnapshot` ya da cron ile Redis'te tutulan 12 haftalık dizi) ve bir sparkline eklenmeli.
2. **Şeffaf skor dökümü ve "nasıl yükseltirim"** (Starbucks Rewards'taki "Next reward at X stars"): skorun bileşenlerini ve eksik kalan adımları somut görevler halinde gösteren bir çekmece eksik.
3. **Filtrelenebilir, sonsuz kaydırmalı aktivite akışı** (Monzo/Revolut işlem akışı): tür çipleri (Yorum · Rozet · Ödül · Tüketim · Oyun), aylara göre yapışkan başlıklar ve "daha fazla yükle".
4. **Etki anları ("Sesin duyuldu")**: işletmenin yanıt verdiği ya da aksiyon aldığı yorumlar akışta öne çıkarılmalı. my-year ucu bu veriyi zaten üretiyor.
5. **Paylaşılabilir yolculuk kartı** (Spotify Wrapped): aşama ve kilometre taşlarını gösteren, OG-image ile üretilen dikey bir hikâye kartı. `/customer/my-year` ile ortak altyapı kullanılabilir.
6. **Kilometre taşı kutlaması**: aşama atlandığında tek seferlik bir kutlama anı (konfeti/maskot reveal) ve buna bağlı push bildirimi. Bugün aşama değişimi kullanıcıya hiçbir şekilde bildirilmiyor.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Kullanıcı sayfaya girdiğinde üç saniye içinde üç soruya yanıt bulmalı: *"Ne kadar katkı verdim?"*, *"Bir sonraki aşamaya ne kaldı?"*, *"Sesim nerede duyuldu?"*. Sayfa bir skor kartı olmaktan çıkıp **kişisel katkı hikâyesine** dönüşmeli. Skor dürüstlüğü ödüllendirmeli; puanın yönü skoru asla etkilememeli.

**Yerleşim (mobil öncelikli):**
1. **Hero gauge:** Tek bir halka; çevresinde 4 aşama segmenti. Ortada skor, altında "bu hafta +6" çipi. Sağda ya da altta maskot; aşamaya göre değişen poz/ifade kullanılabilir (mevcut fantastik seti, WebP olarak).
2. **"Sonraki aşama" kartı:** 2–3 somut görev ilerleme çubuğu (ör. "2 yorum daha", "3 günlük seri", "1 fotoğraflı yorum"). Her görevin yanında doğrudan aksiyon butonu (QR okut / tüketim yorumla).
3. **Skor dökümü çekmecesi:** Bileşen başına çubuk ve kısa açıklama, ayrıca "puanın yönü skoru etkilemez" güvencesi.
4. **"Sesin duyuldu" şeridi:** İşletmenin yanıtladığı ya da aksiyon aldığı son 3 yorum, yatay kaydırılan kartlar halinde; her biri ilgili `/journey` sayfasına bağlanır.
5. **Aktivite akışı:** Tür filtre çipleri, ay başlıkları, tek sütunlu (masaüstünde de) kompakt satırlar ve tıklanabilir detaylar. Masaüstündeki zikzak yerleşim okumayı zorlaştırıyor; tek sütun + sol zaman çizgisi daha profesyonel bir sonuç verir.

**Motion / 3D (yerinde ve ölçülü):** Halka dolumu yalnızca ilk açılışta ve skor değiştiğinde oynasın (önceki değer `localStorage`'da tutularak "+6" farkı animasyonla gösterilir). Aşama atlandığında tek seferlik bir kutlama gösterilsin; mevcut 3B sürpriz kutusu/küre dili yerine hafif bir 2B konfeti + maskot sıçraması yeterli, çünkü bu sayfada sürekli 3B sahne gerekmiyor. Akış satırlarında giriş animasyonu yalnızca ilk sayfa için ve `stagger ≤ 30 ms` olacak şekilde kalsın; tıklanamayan öğelerde hover hareketi olmasın. `reducedMotion="user"` zaten global olarak uygulanıyor; konfeti de buna bağlanmalı.

**Veri / API değişiklikleri:**
- `lib/journey/score.ts`: saf skor fonksiyonu (etkileşim, kalite, düzenlilik, etki) + birim testleri.
- `lib/journey/activity-sources.ts`: Feedback, ConsumptionReview, UserBadge, UserReward, Consumption, quest/game/referral/surprise-box kaynaklarını ortak olay biçimine dönüştüren adaptörler.
- `GET /api/customer/journey` (özet: skor, döküm, sonraki aşama hedefi, sayım). `count`/`aggregate` kullanır, Upstash cache ile 60 sn tutulur, `assertModuleEnabled('journey_score')` uygulanır.
- `GET /api/customer/activity?before=&types=&limit=` (cursor'lu birleşik akış). Uzun vadede yazma anında doldurulan bir `CustomerActivity` tablosu (An Motoru ile hizalı).
- Haftalık skor anlık görüntüsü: mevcut tek-tetikli cron'a eklenecek bir adım (`953c8fe` ile kurulan yapı). Bu yeni bir puan basma yolu değil; yalnızca okuma/özet, dolayısıyla ekonomi değişmezlerini etkilemez.
- Olay metinlerinin tamamı istemcide i18n ile üretilir; uç yalnızca yapısal veri döndürür.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/progress-hub` (Gelişim Merkezi):** Seviye, XP, istatistik ve rozet özetini zaten doğru sayılarla (`stats/route.ts:23`) gösteriyor ve bu sayfaya link veriyor (`progress-hub/page.tsx:227`). Bu sayfadaki seviye/puan/rozet rozetleri birebir tekrar ediyor ve üstelik daha yanlış veri gösteriyor. **Öneri:** Yolculuk skoru ve aşama şeridi, Gelişim Merkezi'nin bir bölümü ya da sekmesi olsun.
- **`/customer/my-year` (QRATEX'te Yılım):** Feedback/Consumption/UserBadge'den toplanan kilometre taşlarını ve "işletme yorumuna aksiyon aldı" etkisini gösteriyor (`my-year/route.ts` başlık yorumu). Bu sayfanın "zaman çizelgesi" hikâyesiyle aynı amaca hizmet ediyor. **Öneri:** Ortak `activity-sources` katmanını paylaşsınlar; my-year yıllık "Wrapped" özeti, aktivite akışı ise sürekli akış olarak kalsın.
- **`/customer/feedbacks` + `/customer/feedbacks/[id]/journey`:** Geri bildirim başına yolculuk zaten var; bu sayfadaki CTA kartı ile geri bildirim olayları oraya yönlenmeli, içerik çoğaltılmamalı.
- **`/customer/analytics`, `/customer/trends`, `/customer/spending-overview`:** Kişisel istatistik ve trend alanında örtüşüyorlar. Skor trend grafiği eklenirken analytics ile aynı grafik bileşeni ve dönem seçici kullanılmalı.

**Sonuç:** `/customer/journey-score` tek başına yaşamaya devam etmek yerine (1) skor ve aşama bölümü Gelişim Merkezi'ne, (2) zaman çizelgesi birleşik bir "Aktivite / Yolculuğum" akışına taşınacak şekilde **birleştirilmeli**. Eski URL yeni hedefe 308 ile yönlendirilmeli; menüdeki `journey_score` anahtarı (`sidebar.tsx:289`, `discover/page.tsx:58`, `visibility-controls.ts:88`) yeni hedefe bağlanmalı. Birleştirme yapılmasa bile bulgu 1 (skor formülü), 2 (ConsumptionReview), 3 (hata durumu) ve 5 (yanlış sayılar) bağımsız olarak hemen düzeltilmeli.

---

## Doğrulama (şüpheci inceleme)

Bu bölümde her iddiayı çürütmeye çalışarak kodu yeniden okudum. Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Skor formülü olumlu puan vermeyi ödüllendiriyor: **DOĞRULANDI (önem: orta)**
- Kanıt: `app/api/customer/journey-score/route.ts:28-36`. Hesabı elle yeniden yaptım. Tek bir 5★ olumlu yorumda `count<3` olduğu için `recentAvg = avgRating = 5` olur (`:30-32`). Bu durumda `raw = 100 + 30 + 2 + 75 = 207`, skor `round(207/225*100) = 92` çıkar. `journeyStageIndex` 80 ve üstünü 3 numaralı aşamaya koyar (`page.tsx:57-63`), bu da `stage3 = "Sadakat"` (`messages/tr.json:1773`) demek. On adet 3★ nötr yorum `60+0+20+45 = 125` ile 56 puan alır. On adet 2★ yorum `40+0+20+30 = 90` ile 40 puan alıp "Düzenli ziyaret" aşamasında kalır. Etkileşim (sayı) bileşeni en fazla 20/225, yani yaklaşık %9 ağırlık taşıyor. Skorun yaklaşık %91'i verilen yıldıza bağlı.
- Yeniden üretim: Yeni bir müşteri tek bir QR geri bildiriminde 5★ verir ve bu sayfada "Sadakat" aşamasını görür. On ziyaretinde dürüstçe 2★ veren müşteri ise 40 puan ve "Düzenli ziyaret" görür. `scoreDesc` metni ("İşletmelerdeki etkileşiminiz hesaplanarak belirlendi", `tr.json:1753`) ile hesap çelişiyor.
- Çürütme denemesi: Skor yalnızca görüntüleme amaçlı. `journeyScore` başka hiçbir yerde okunmuyor (grep: yalnızca route ve bu sayfa). Puan, ödül ya da rozet basmıyor, dolayısıyla ekonomiye etkisi yok. Bu yüzden "kritik" değil. Yine de kullanıcıya yanlış bilgi veren ve yorum puanlarını yukarı çeken ters bir teşvik gerçekten var. Önem derecesini "orta" olarak düzelttim.

### 2. ConsumptionReview yok sayılıyor: **DOĞRULANDI (önem: yüksek)**
- Kanıt: `journey-score/route.ts:20-25` ve `journey-timeline/route.ts:25-30` yalnızca `prisma.feedback` sorgusu yapıyor. Tüketim yorumu ise `tx.consumptionReview.create` ile ayrı tabloya yazılıyor (`app/api/customer/consumptions/[id]/review/route.ts`, satır ~175). Bu yol `Feedback` kaydı oluşturmuyor.
- Tutarsızlık: `/customer/feedbacks` sayfası tüketim yorumlarını `/api/customer/reviews` üzerinden varsayılan sekmede listeliyor (`app/customer/feedbacks/page.tsx:96,114`). Gelişim Merkezi de bu yorumları sayıyor (`app/api/customer/stats/route.ts:60,153`: `feedbackCount + consumptionReviewCount`).
- Yeniden üretim: Yalnızca kartla tüketim yapıp yorum yazan müşterinin `Feedback` kaydı yoktur. Bu sayfada skor 0, "Toplam Yorum" 0 ve "Tanışma" aşaması görünür, altında da "en az 5 geri bildirim daha paylaşın" yazar. Zaman çizelgesinde tüketimler görünür ama yorumlar görünmez. Proje belleğine göre karakter rozeti de yalnızca ConsumptionReview'ı sayıyor. Yani platformun asıl yorum yolu bu sayfada hiç görünmüyor.

### 3. Hata yanıtları başarılı veri gibi işleniyor: **DOĞRULANDI (önem: orta)**
- Kanıt: Zaman çizelgesi sorgusu `page.tsx:77-80` satırlarında `res.ok` ya da `j.error` kontrolü yapmadan `res.json()` döndürüyor. `requireAuth` hata durumunda 401, 403 (token-replay dahil) veya Forbidden için `{ error }` gövdesi dönüyor (`lib/api-auth.ts:24-25,41-42,72-74`). Bu gövde react-query'de başarılı veri sayılıyor ve `timelineData.timeline` undefined kalıyor. `events = []` olunca (`:103`) "Listeniz henüz boş." görünüyor (`:275-281`). Rozet satırında da `stats?.level`, `stats?.points` ve `stats?.totalBadges` boş kalıyor, örneğin "Sev. " ve " Puan" (`:182-188`). Skor sorgusu `j.error` gördüğünde hata fırlatıyor (`:89`). Ancak `isError` hiç okunmuyor (`:84`). Varsayılan yeniden denemeler bitince `isLoading` false oluyor ve `score ?? 0` ile `m` varsayılanı yüzünden 0 puan ve "Tanışma" aşaması gösteriliyor (`:105-107`). Uygulama genelinde fetch'i saran bir global yapı da bulunamadı.
- Yeniden üretim: Neon zaman aşımı yüzünden iki uç da 500 dönebilir ya da token-replay korumasından 403 gelebilir. Bu durumda kullanıcı boş zaman çizelgesi ve 0 skor görür, hata mesajı veya "tekrar dene" seçeneği çıkmaz. Kullanıcı verisinin silindiğini düşünebilir. Önem derecesi orta, çünkü veri kaybı yok ve sorun yalnızca gösterimde.

### 4. Rozet ve yorum sayıları sorgu limitiyle kesiliyor: **DOĞRULANDI (önem: orta)**
- Kanıt: `journey-timeline/route.ts:35` satırında `take: 10` var ve `:135` satırında `totalBadges: userBadges.length` kullanılıyor. Bu yüzden rozet sayısı en fazla 10 gösterilebiliyor. Gelişim Merkezi ise gerçek `prisma.userBadge.count` değerini gösteriyor (`stats/route.ts:23`). Benzer şekilde `journey-score/route.ts:24` satırında `take: 100` var ve `:42` satırındaki `totalFeedbackCount` en fazla 100 olabiliyor. Ortalama ve pozitif oran da son 100 kayıtla hesaplanıyor. `totalFeedbacks` (`:134`, take 20) sayfada kullanılmıyor, bu yüzden görünür bir etkisi yok.
- Yeniden üretim: 14 rozeti olan bir kullanıcı bu sayfada "10 Rozet", Gelişim Merkezi'nde ise "14" görür. 100 eşiği ancak çok aktif kullanıcılarda devreye girer. Rozet sınırı ise 29 karakter rozeti ve davranışsal rozetler düşünüldüğünde gerçekçi bir senaryo.
- Ek gözlem (doğrulandı, küçük): Skor ucu `deletedAt: null` filtresi kullanıyor, `stats/route.ts:22` satırındaki `feedback.count` ise kullanmıyor. Silinmiş geri bildirimi olan kullanıcıda iki sayfadaki sayılar bu nedenle de farklı çıkabilir.

**Özet:** 4 iddianın 4'ü de kodla doğrulandı. Ancak 1 numaralı bulgu yalnızca görüntülemeyi etkilediği ve ekonomiye dokunmadığı için "orta" seviyeye indirilmeli. Gerçekten "yüksek" önemde olan bulgu 2'dir (ConsumptionReview'ın yok sayılması), çünkü kartla tüketim yapan kullanıcıların tamamını etkiliyor.

---

## Uygulama (Dalga 2)

**Yeni yüzey:** `/customer/me/progress` (Ben → İlerleme). Skor "Katkı skorun" bölümü (`#katki`), zaman çizelgesi "Yolculuğun" akışı (`#yolculuk`) oldu. Eski `/customer/journey-score` kalıcı yönlendirme koçanı; eski uçlar `app/api/customer/journey-score` ve `app/api/customer/journey-timeline` **silindi** (tek tüketicileri bu sayfaydı). Yeni uç: `GET /api/customer/me/progress/journey` (`defineRoute`, CUSTOMER, `module: 'journey_score'`, zod, rate limit). Saf mantık: `components/customer/m-ben-ilerleme/contribution.ts`, `journey-cursor.ts`; testler `__tests__/customer/m-ben-ilerleme/{contribution,period-and-cursor,server-summary-trends,routes}.test.ts`.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Metadata | ÇALIŞIYOR | Vaat edilen "bileşen dökümü + haftalık değişim" artık gerçekten var |
| 2 | Kimlik doğrulama | ÇALIŞIYOR | Yalnız CUSTOMER; kimlik oturumdan |
| 3 | Modül anahtarı `journey_score` | ÇALIŞIYOR | Kapalıyken katkı bölümü ve akış çizilmez, uç 403 MODULE_DISABLED |
| 4 | Yükleniyor | ÇALIŞIYOR | Skor sunucuda; akış görünür alana yaklaşınca, iskeletle |
| 5 | Hata durumu | ÇALIŞIYOR | Zarf v2 okuyucu `res.ok`'a bakar; `QueryState` hata ≠ boş; skor hatası "hesaplanamadı" (0 değil) |
| 6 | Hero | ÇALIŞIYOR | Tek ad: "İlerleme" (menü ile aynı) |
| 7 | "Geri bildirim yolculukları" CTA | KALDIRILDI | Her yorum olayı doğrudan kendi `/journey` ya da tüketim sayfasına bağlanır |
| 8 | Skor halkası | ÇALIŞIYOR | 4 aşamalı halka, `role="img"` + `aria-label` |
| 9 | Skor formülü | ÇALIŞIYOR | Katılım 35 · Ayrıntı 25 · Düzenlilik 25 · Etki 15; yıldızın yönü hiçbir bileşene girmez (girdi tipinde yok, testli) |
| 10 | "Etkileşiminiz" iddiası | ÇALIŞIYOR | Açıklama artık doğru + "1★ dürüst yorum 5★ ile aynı değerde" güvencesi |
| 11 | Seviye rozeti | ÇALIŞIYOR | Kahramanda, doğru eğriyle |
| 12 | Puan rozeti | ÇALIŞIYOR | `Intl` biçimli `PointsChip` |
| 13 | Rozet sayısı (10'da kesiliyordu) | ÇALIŞIYOR | `count()` |
| 14 | "Toplam Yorum" (100'de kesiliyor, CR yok) | ÇALIŞIYOR | Trend KPI'sı SQL `count`, Feedback ∪ ConsumptionReview |
| 15 | "Pozitif oran" | KALDIRILDI | Değer yargısı; yerine yargısız "Deneyimlerin" dağılımı (okunmamış ayrı) |
| 16 | `avgRating`/`recentAvgRating` | KALDIRILDI | Puan yönü skora girmez |
| 17 | "Timehop" başlığı | KALDIRILDI | "Yolculuğun" |
| 18 | Maskot (543 KB SVG) | KALDIRILDI | Gereksiz ağırlık |
| 19 | Aşama rozeti + progress bar (tekrar) | KALDIRILDI | Tek halka + 4 aşama listesi (`<ol>`, `aria-current="step"`) |
| 20 | 4 aşama çipi | ÇALIŞIYOR | Tanışma · Katılımcı · Düzenli ses · Güvenilir ses (ölçülen davranışla uyumlu adlar) |
| 21 | "Düzenli tüketim" ipucu | KALDIRILDI | Yerine hesaplanan plan |
| 22 | "Sonraki adım" (5−sayı) | ÇALIŞIYOR | Sunucu planı: "N yorum daha, K'si 100+ karakter, W'si farklı haftada" (`planToReach`, testli) |
| 23 | Zaman çizelgesi listesi | ÇALIŞIYOR | İmleçli k-yollu birleştirme, `(at, key)` imleci, "Daha fazla göster" |
| 24 | Olay: kayıt | ÇALIŞIYOR | Akış sonunda "Yolculuğun … tarihinde başladı" (aktif kullanıcıda da görünür) |
| 25 | Olay: geri bildirim | ÇALIŞIYOR | İşletme adı + yıldız + kaynak; `/feedbacks/[id]/journey` |
| 26 | Olay: rozet | ÇALIŞIYOR | Görselli |
| 27 | Olay: ödül | ÇALIŞIYOR | Cüzdan → Ödüllerim'e bağlı |
| 28 | Olay: tüketim | ÇALIŞIYOR | Mekân + ürün; tutar gösterilmez (para Cüzdan'da) |
| 29 | `vip` türü | KALDIRILDI | Ölü tip |
| 30 | Diğer olay türleri | ÇALIŞIYOR | Tüketim yorumu, **işletme yanıtı ("Sesin duyuldu")**, görev, seviye, lig eklendi. Oyun/davet/kutu/turnuva puan hareketi olarak Cüzdan → Hareketler (defter) akışında; burada tekrar edilmez |
| 31 | Yıldız çipi | ÇALIŞIYOR | Olay metninde |
| 32 | Göreli + mutlak tarih | ÇALIŞIYOR | `<time dateTime>`, İstanbul saati, ay başlıkları |
| 33 | Emoji/ikon yedeği | ÇALIŞIYOR | Türe göre ikon, rozette `BadgeGlyph` |
| 34 | Olaydan detaya gitme | ÇALIŞIYOR | Hedefi olan olay `Link` + odak halkası; hedefsiz olayda hover yok |
| 35 | Boş durum | ÇALIŞIYOR | Yalnız gerçek boşlukta ("Bu süzgeçte henüz bir olay yok"); hata ayrı |
| 36 | Giriş animasyonu | ÇALIŞIYOR | `Reveal` (ilk 12 öğe bütçeli, azaltılmış harekette statik) |
| 37 | `AnimatePresence` | KALDIRILDI | Ölü kod |
| 38 | Hover gölgesi (tıklanamayan) | KALDIRILDI | |
| 39 | Mobil çizgi hizası | KALDIRILDI | Zikzak yerine tek sütun liste |
| 40 | i18n (arayüz) | ÇALIŞIYOR | |
| 41 | i18n (olay metinleri) | ÇALIŞIYOR | Uç yapısal olay döndürür; metin istemcide TR/EN |
| 42 | Filtre | ÇALIŞIYOR | Tümü · Yorumlar · Rozetler · Ödüller · Ziyaretler · Kilometre taşları |
| 43 | Skor trendi | ÇALIŞIYOR | Son 8 haftanın skoru veriden yeniden hesaplanır (anlık görüntü tablosu gerekmedi) + "Bu hafta ±N" |
| 44 | "Nasıl hesaplanır?" | ÇALIŞIYOR | Bileşen çubukları + tavanlar + açıklama |
| 45 | Paylaşma kartı | KALDIRILDI | Paylaşılabilir hikâye kartı Yılım'ın kapsamı |
| 46 | Yenile | ÇALIŞIYOR | Akış odakta tazelenir; özet her ziyarette sunucuda |
| 47 | Ölü kod/`any` | KALDIRILDI | Sayfa ve iki uç tamamen yeniden yazıldı/silindi; tipler `types.ts` ayrık birleşim |

### Kapanan bulgular
1 (formül), 2 (ConsumptionReview skora ve akışa girdi), 3 (hata ≠ boş/0), 4 (aşama metinleri + hesaplanan plan), 5 (`count()`), 6 (yapısal olay + istemci i18n), 7 (imleçli birleşik akış), 8 (işletme yanıtı, görev, seviye, lig olayları), 9 (maskot kaldırıldı), 10 (tıklanabilir olaylar, sahte hover yok), 11 (modül kapısı API'de), 12 (tek ad, tek gauge), 13 (erişilebilirlik: `role=img`, `<ol>`, `aria-current`, `<time>`), 14 (ölü kod), 15 (iki uç → sunucu özeti + tek akış ucu). **15/15.**

### Kalanlar
- Aşama atlama push bildirimi: kalıcı aşama kaydı gerektirir (skor her istekte veriden hesaplanıyor). İstenirse **ŞEMA İSTEĞİ:** `User.contributionStage Int?` (son bildirilen aşama) — An Motoru'na yeni `stage_up` anı ile bağlanır.
- `messages/*.json` içindeki `journeyScore.*` anahtarları artık kullanılmıyor (paylaşılan dosya; temizlik i18n sahibine).
