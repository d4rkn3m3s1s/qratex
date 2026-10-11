# /admin/economy-sim

**Amaç:** Platform operatörünün, kayıtlı puan matrisine göre "N geri bildirim + M görev + K çark çekişi olursa toplam ne kadar puan/XP basılır?" sorusunu cevaplayan bir "what-if" ekonomi tahmin aracı olması.

**Genel puan:** 3/10 · **Karar:** **birleştir** (`/admin/points-matrix` içine, kaydedilmemiş taslak matris üzerinde çalışan, gerçek veriyle kalibre edilmiş bir "Ekonomi etkisi" paneli olarak yeniden kurulmalı)

> Özet hüküm: Sayfa küçük (137 satır, tek API ucu) ve teknik olarak sade; yetki doğru, canlı veriye yazmıyor. Ancak **ürettiği sayı gerçek ekonomiyle tutarlı değil**: gerçek ödül yolundaki VIP / sezonsal kampanya / platform geneli çarpanları ve günlük-haftalık tavanları yok sayıyor, görevler için her görevin kendi ödülü yerine yalnızca matristeki "varsayılan" ödülü kullanıyor ve puan basan ~15 kaynaktan yalnızca 3'ünü modelliyor. Üstelik "what-if" adını taşımasına rağmen hipotetik bir matrisi deneyemiyor — yalnızca canlıda **kayıtlı** matrisi okuyor. Türkçe ondalık yazımı (`0,25`) sayfayı error boundary'ye düşürüyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Hesap matematiksel olarak tutarlı ama modellediği ekonomi gerçek ödül zincirinin küçük ve hatalı bir alt kümesi; "what-if" için taslak matris girilemiyor. |
| UX | 3/10 | Dört serbest metin kutusu + tek buton; zaman/kullanıcı boyutu yok, sonuç girdiler değişince bayatlıyor ama bunu söylemiyor, sessiz kırpma (clamp) ve Türkçe sayı biçimi hataları kullanıcıyı yanıltıyor. |
| Görsel | 5/10 | Ortak `AdminPremiumHero` + shadcn kartlarıyla diğer admin sayfalarıyla tutarlı; ancak sonuç alanı tek büyük sayı + tek satırlık döküm, grafik/kıyas/bağlam yok. |
| Mimari | 3/10 | Hesap mantığı route içinde kopya ve gerçek ödül kodundan (`app/api/feedbacks/route.ts`) bağımsız; yanıt tipi istemcide `Record<string, unknown>` cast'iyle okunuyor; sunucuda NaN doğrulaması yok. |
| Performans | 8/10 | Tek ayar okuması (60 sn bellek cache'li), N+1 yok; tek dezavantaj cache'in instance başına olması (kaydetmeden sonra 60 sn bayat matris görülebilir). |
| Erişilebilirlik + mobil | 4/10 | Grid mobilde düzgün yığılıyor ve azaltılmış hareket global CSS ile karşılanıyor; ama `Label`'lar input'lara bağlı değil, sonuç/hata için `aria-live` yok, Enter ile hesaplama yok, sayısal alanlar `type="number"` değil. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişimi: ADMIN rolü + gizli kapı (gate cookie) | ÇALIŞIYOR | `proxy.ts:51-87` | `/admin/*` için rol + `admin_gate` cookie kontrolü. |
| 2 | API yetkisi `GET /api/admin/economy-sim` | ÇALIŞIYOR | `app/api/admin/economy-sim/route.ts:13-14`, `lib/api-auth.ts:52-80` | `requireAuth(['ADMIN'])` + token-replay. Proxy `/api/*` için gate kontrolü yapmıyor (`proxy.ts:105-119`) ama uç salt okunur ve zararsız. |
| 3 | Hero (eyebrow "Simülasyon", başlık, açıklama, ikon) | ÇALIŞIYOR (metin kısmen yanıltıcı) | `app/admin/economy-sim/page.tsx:61-65` | "Puan matrisi ayarlarınıza göre" diyor; yalnızca kayıtlı matris, yalnızca 3 kaynak, çarpanlar hariç. |
| 4 | "Puan matrisi" kısayol butonu | ÇALIŞIYOR | `page.tsx:66-72` | `/admin/points-matrix`'e gider. |
| 5 | "Senaryo" kartı başlık/açıklama | ÇALIŞIYOR | `page.tsx:76-80` | |
| 6 | Girdi: Geri bildirim adedi | KISMİ | `page.tsx:82-85`, `route.ts:17` | Serbest metin (`type="number"` yok, `min/max` yok). `1.000` yazılırsa `Number('1.000') = 1` → sessizce 1 olarak hesaplanır. 10.000 üstü sessizce kırpılır. Boş bırakılırsa ekranda boş görünür ama sunucu 100 kullanır (`'' \|\| '100'`). Ondalık (`10.5`) kesirli puan üretir. |
| 7 | Girdi: Detaylı metin oranı (0–1) | **BOZUK** | `page.tsx:86-89`, `route.ts:18`, `page.tsx:122` | Türkçe ondalık `0,25` → `Number('0,25') = NaN` → `Math.max(0, Math.min(1, NaN)) = NaN` → tüm toplamlar `NaN` → JSON'da `null` → `est.totalPoints.toLocaleString` TypeError → `app/admin/error.tsx`. Yüzde olarak `25` yazılırsa sessizce 1'e kırpılır (hepsi "detaylı"). |
| 8 | Girdi: Görev tamamlama | KISMİ (yanlış model) | `page.tsx:90-93`, `route.ts:30-32` | Her zaman `matrix.quest.default` (varsayılan 100 puan, `lib/points-rules.ts:81-83`) kullanılır. Gerçekte her `Quest.reward` zorunlu Json (`prisma/schema.prisma:652`) ve admin formu kendi değerini yazar (`app/admin/quests/page.tsx:130,170`, form varsayılanı 50); claim yolu `getQuestReward(quest.reward, …)` kullanır (`app/api/gamification/quests/[id]/claim/route.ts:96`). Varsayılan yalnızca fallback. |
| 9 | Girdi: Çark çekişi | KISMİ | `page.tsx:94-97`, `route.ts:34-53` | Beklenen değer hesabı doğru; fakat `dailyLimit` ve kullanıcı sayısıyla ilişkilendirilmiyor (gerçekte çekiş sayısı = aktif kullanıcı × günlük limit × gün). |
| 10 | "Hesapla" butonu + dönen ikon | ÇALIŞIYOR | `page.tsx:98-103` | Yüklenirken devre dışı. Form olmadığı için Enter ile tetiklenmiyor. `animate-spin` azaltılmış harekette global CSS ile durduruluyor (`app/globals.css:801-809`). |
| 11 | Açılışta otomatik hesaplama | ÇALIŞIYOR | `page.tsx:45-47` | Varsayılan girdilerle bir kez çağırır (eslint exhaustive-deps uyarısı muhtemel, davranış kasıtlı). |
| 12 | Hata kartı | KISMİ | `page.tsx:36-40`, `page.tsx:107-111` | JSON olmayan yanıtta (`r.json()` patlarsa) İngilizce `SyntaxError` mesajı gösterilir; 401/403 durumunda yeniden giriş yönlendirmesi yok; hata sırasında eski sonuç kartı ekranda kalır (`payload` temizlenmiyor). |
| 13 | Yükleniyor durumu | KISMİ | `page.tsx:99-101`, `page.tsx:113` | Yalnızca buton ikonu döner; ilk açılışta sonuç alanı tamamen boş, iskelet yok; yeniden hesaplamada eski sonuç "güncel" gibi durur. |
| 14 | Sonuç: Toplam puan | KISMİ (yanlış model) | `page.tsx:120-123`, `route.ts:55` | Gerçek feedback zinciri VIP → sezonsal kampanya → platform çarpanı → günlük/haftalık tavan uygular (`app/api/feedbacks/route.ts:308-318`); sim bunların hiçbirini uygulamıyor. |
| 15 | Sonuç: Toplam XP | KISMİ (yanlış model) | `page.tsx:124-127`, `route.ts:56` | Gerçek yolda `reward.xp * gamiSettings.xpMultiplier` (`app/api/feedbacks/route.ts:318`); sim çarpanı yok sayıyor. |
| 16 | Sonuç: kaynak dökümü (feedback/görev/çark puanı) | ÇALIŞIYOR | `page.tsx:128-131` | Sadece puan dökümü; XP dökümü yok. |
| 17 | XP dökümü (`feedbackXp`, `questXp`, `spinXp`) | EKSİK (API döndürüyor, UI göstermiyor) | `route.ts:67-76` vs `page.tsx:49-57` | Hesaplanan veri atılıyor. |
| 18 | `matrixSnapshot` ve kırpılmış `inputs` gösterimi | EKSİK (ölü veri) | `route.ts:60-66` | Hangi matris değerleriyle ve hangi (kırpılmış) girdilerle hesaplandığı kullanıcıya gösterilmiyor; sessiz clamp'ın tek ipucu bu olabilirdi. |
| 19 | Not metni ("Tahmindir…") | ÇALIŞIYOR | `route.ts:77`, `page.tsx:117` | |
| 20 | Çark pasifse davranış | KISMİ | `route.ts:36` | Çark kapalıyken sessizce 0 döner; UI'da "çark pasif" bilgisi yok. |
| 21 | Sunucu tarafı girdi kırpma | KISMİ | `route.ts:17-20` | Aralık kırpması var ama NaN/sonsuz/kesirli doğrulama yok; Zod şeması yok; 400 döndürülmüyor. |
| 22 | Matris cache tutarlılığı | KISMİ | `lib/points-rules.ts:242-262`, `app/api/admin/settings/points-matrix/route.ts:80` | Kaydetme yalnızca o isteği karşılayan instance'ın bellek cache'ini temizler; diğer serverless instance'larda sim 60 sn'ye kadar eski matrisle hesaplayabilir. |
| 23 | Sonuç bayatlama göstergesi | EKSİK | `page.tsx:21-28` | Girdiler değişince `qs` değişir ama sonuç yeniden hesaplanmaz ve "güncel değil" uyarısı verilmez. |
| 24 | Taslak (kaydedilmemiş) matrisle what-if | EKSİK | `route.ts:22` | Yalnızca `getPointsMatrix()` (canlı kayıt). Bir ayarı denemek için önce canlıya kaydetmek gerekiyor — simülatörün varlık nedeniyle çelişiyor. |
| 25 | Diğer puan kaynakları (tüketim yorumu, referral, doğum günü, streak, mini oyun, turnuva, sürpriz kutu, rozet ödülü, login streak, ziyaret görevi, klan savaşı, sezonluk etkinlik) | EKSİK | `points_credited` yazan dosyalar: `app/api/customer/games/[game]/complete/route.ts:167`, `app/api/customer/tournament/route.ts:168`, `app/api/surprise-box/[id]/open/route.ts:66`, `lib/login-streak.ts:160`, `lib/visit-missions.ts:123`, `lib/badge-reward-points.ts:63` vb. | Matriste referral/birthday/streak/consumptionReview bile var (`lib/points-rules.ts:27-41`) ama sim kullanmıyor. |
| 26 | Puan harcama kanalları (ödül, mağaza, bağış, rozet açma) | EKSİK | `prisma/schema.prisma:612` (`pointCost`), `app/api/customer/shop/route.ts`, `app/api/customer/donations/route.ts`, `app/api/gamification/rewards/route.ts` | Yalnızca basım (mint) tarafı var; net enflasyon / yükümlülük hesaplanamıyor. |
| 27 | Zaman ufku ve kullanıcı sayısı boyutu | EKSİK | `page.tsx:13-16` | "Toplam" hangi süre ve kaç kullanıcı için belli değil; tavanlar (500/gün, 2000/hafta — `lib/points-caps.ts:13-14`) bu yüzden modellenemiyor. |
| 28 | Gerçek veriden taban çizgisi (son 30 gün) | EKSİK | — | Varsayılan girdiler sabit (`page.tsx:13-16`), `AnalyticsEvent points_credited` geçmişinden beslenmiyor. |
| 29 | Senaryo kaydetme / karşılaştırma / URL'de paylaşma | EKSİK | `page.tsx:21-28` | `qs` URL'ye yazılmıyor; sayfa yenilenince senaryo kaybolur. |
| 30 | Dışa aktarma (CSV/PNG) | EKSİK | — | |
| 31 | Grafik / dağılım görselleştirmesi | EKSİK | — | Çark için olasılık dağılımı, kaynak bazında yığılmış çubuk vb. yok. |
| 32 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:81`, `page.tsx:119` | `sm:grid-cols-2`, sonuçlar `grid-cols-2 md:grid-cols-4`; taşma yok. |
| 33 | Form erişilebilirliği (label–input ilişkisi) | KISMİ | `page.tsx:83-96` | `Label` `htmlFor` almıyor, `Input` `id` almıyor → ekran okuyucu alan adını okumaz, etikete tıklamak odaklamaz. |
| 34 | Sonuç/hata için `aria-live` | EKSİK | `page.tsx:107-134` | Hesaplama sonucu ve hata ekran okuyucuya duyurulmuyor. |
| 35 | Sayfa başlığı (`<title>`) | EKSİK | `page.tsx:1` (`'use client'`), `app/admin/layout.tsx:11-21` | İstemci sayfası metadata export edemiyor; sekme yalnızca "Admin" gösterir. |
| 36 | Kenar çubuğu girişi | KISMİ | `components/dashboard/sidebar.tsx:179`, `messages/tr.json:2483` | Etiket "Ekonomi sim" (yarım kısaltma); ikon `Activity`, "Platform nabzı" ile aynı (`sidebar.tsx:161`); `/admin/points-matrix` (`sidebar.tsx:209`) ile listede birbirinden uzak. |

**Durum sayımı:** ÇALIŞIYOR 10 · KISMİ 12 · BOZUK 1 · SAHTE 0 · EKSİK 13 (toplam 36)

---

## Bulgular

### 1. Türkçe ondalık (`0,25`) sayfayı çökertiyor
- **Önem:** yüksek · **Kategori:** hata / girdi doğrulama · **Efor:** S
- **Kanıt:** `app/api/admin/economy-sim/route.ts:17-20` (`Number(...)` + `Math.max/min`, NaN kontrolü yok), `route.ts:25-27,55-56` (NaN yayılır), `page.tsx:122` (`est.totalPoints.toLocaleString`).
- **Sorun:** `Number('0,25')` NaN; `Math.max(0, Math.min(1, NaN))` NaN döndürür, kırpma NaN'ı yakalamaz. Toplamlar NaN → `JSON.stringify` bunları `null` yapar → istemcide `null.toLocaleString` TypeError → `app/admin/error.tsx` tüm sayfayı hata ekranına çevirir. Türkçe arayüzde virgüllü ondalık en olası yazımdır. Aynı kök nedenle `1.000` (TR binlik ayırıcı) sessizce `1` olarak hesaplanır — çökmez ama 1000 kat yanlış sonuç verir.
- **Profesyonel öneri:** Sunucuda Zod ile `z.coerce.number().finite().int().min(0).max(…)` şeması kur; geçersiz girdide 400 + alan bazlı hata döndür. İstemcide alanları `type="number"` + `min/max/step` ile ya da `Intl.NumberFormat('tr-TR')` uyumlu bir sayı ayrıştırıcısıyla (virgül→nokta, binlik ayırıcı temizleme) bağla; oranı yüzde slider'ı (0–100 %) olarak sun. Sonuç kartında `inputs` yankısını göster ki kırpılan/ayrıştırılan değer görünür olsun. Ayrıca render tarafında `?? 0` ile savunmacı biçimlendirme yap.

### 2. Simülatör gerçek ödül zincirini modellemiyor — üretilen sayı karar için güvenilmez
- **Önem:** yüksek · **Kategori:** veri doğruluğu / iş mantığı · **Efor:** L
- **Kanıt:** Sim: `route.ts:23-28` (yalnızca taban/detaylı ödül). Gerçek yol: `app/api/feedbacks/route.ts:308-318` (`applyVipMultiplier` → `applySeasonalCampaignMultiplier` → `gamiSettings.pointMultiplier` → `capFeedbackPoints`; XP için `gamiSettings.xpMultiplier`), `lib/points-caps.ts:13-14` (500/gün, 2000/hafta tavan).
- **Sorun:** Platform çarpanı 1.5'e, aktif bir sezonsal kampanyaya veya yoğun VIP kitlesine sahip bir senaryoda sim düşük tahmin; tavana takılan yoğun kullanıcılarda ise yüksek tahmin üretir. Ekran "Tahmini toplam" diye kesin görünümlü büyük bir sayı gösterdiği için operatör yanlış bütçe/enflasyon kararı verir. Hesap mantığı gerçek koddan ayrı yazıldığı için ödül kodu değiştikçe sapma büyüyecek.
- **Profesyonel öneri:** Ödül hesaplamasını saf (yan etkisiz) bir modüle çıkar — ör. `lib/economy/reward-pipeline.ts` içinde `computeFeedbackReward({ base, vipMultiplier, seasonalMultiplier, globalMultiplier, earnedToday, earnedThisWeek })` — ve hem `app/api/feedbacks/route.ts` hem simülatör aynı fonksiyonu çağırsın (tek gerçek kaynak). Simülatöre kullanıcı segmenti girdisi ekle (VIP dağılımı, aktif kampanya çarpanı otomatik okunur, kullanıcı başına ortalama günlük feedback) ve tavan etkisini kullanıcı başına uygula. Her çarpanı sonuç ekranında "şelale" (waterfall) olarak göster: taban → VIP → kampanya → platform → tavan kesintisi → net.

### 3. Görev puanı yanlış kaynaktan hesaplanıyor (varsayılan ödül, görevin kendi ödülü değil)
- **Önem:** yüksek · **Kategori:** veri doğruluğu · **Efor:** S
- **Kanıt:** `route.ts:30-32` (`matrix.quest.default`), `lib/points-rules.ts:301-314` (`getQuestReward` önce `quest.reward.points` kullanır), `prisma/schema.prisma:652` (`reward Json` zorunlu), `app/admin/quests/page.tsx:130,170` (admin formu her görevin ödülünü yazar, varsayılan 50).
- **Sorun:** Varsayılan matris değeri 100 puan; admin panelinden açılan görevler tipik olarak 50 puan. Sim görev puanını sistematik olarak (ör. 2 kat) şişirebilir; özel/gizemli görevlerdeki yüksek ödülleri ise hiç görmez.
- **Profesyonel öneri:** Aktif görevlerin (`Quest.isActive`) ödüllerini okuyup, son 30 günlük `UserQuest.completedAt` dağılımına göre ağırlıklı ortalama görev ödülünü hesapla; kullanıcıya "ortalama görev ödülü: X (aktif N görevden)" olarak göster ve isterse elle geçersiz kılabilsin. Ziyaret görevlerini (`lib/visit-missions.ts:123`, kategori `quest`) de aynı kalemde topla.

### 4. "What-if" taslak matrisle yapılamıyor; aynı amaçlı ikinci simülasyon `/admin/points-matrix` içinde
- **Önem:** yüksek · **Kategori:** ürün mimarisi / çakışma · **Efor:** M
- **Kanıt:** `route.ts:22` (yalnızca kayıtlı matris), `app/admin/points-matrix/page.tsx:911-985` ("Canlı Puan Mantığı Simülasyonu" — taslak matrisle tekil olay sonucu + çark bileti simülasyonu).
- **Sorun:** Bir ekonomi simülatörünün temel kullanım durumu "matrisi değiştirirsem ne olur?" sorusudur. Bu sayfada değişiklik denemek için önce canlıya kaydetmek gerekir — yani deney canlı kullanıcılar üzerinde yapılır. Öte yandan matris sayfası taslak üzerinde olay-bazlı önizleme yapıyor ama toplu etki göstermiyor. İki yarım araç, tek tam araç yerine.
- **Profesyonel öneri:** Simülatörü `POST /api/admin/economy-sim` olarak yeniden tasarla; gövdede opsiyonel `matrixOverride` (Zod ile `normalizePointsMatrix` üzerinden) kabul etsin. `/admin/points-matrix` sayfasına sağ tarafta yapışkan bir "Ekonomi etkisi" paneli ekle: kullanıcı matrisi düzenlerken panel "kayıtlı vs taslak" farkını (aylık basılacak puan, kullanıcı başına ortalama, % değişim) debounced olarak gösterir. Kaydet butonunun yanında "Bu değişiklik aylık puan basımını +%34 artırır" gibi bir onay özeti ver. `/admin/economy-sim` rotasını bu panele yönlendir.

### 5. Puan ekonomisinin yalnızca 3 basım kaynağı ve hiçbir harcama kanalı modellenmiyor
- **Önem:** orta · **Kategori:** işlevsellik / kapsam · **Efor:** L
- **Kanıt:** Sim kapsamı `route.ts:23-53`. `points_credited` yazan diğer yollar: `app/api/customer/games/[game]/complete/route.ts:167`, `app/api/customer/tournament/route.ts:168`, `app/api/surprise-box/[id]/open/route.ts:66`, `lib/login-streak.ts:160`, `lib/badge-reward-points.ts:63`, `app/api/customer/consumptions/[id]/review/route.ts:164`, `app/api/referral/route.ts:96`, `app/api/birthday/route.ts:17`, `app/api/streak/route.ts:157`. Harcama: `app/api/customer/shop/route.ts`, `app/api/customer/donations/route.ts`, `app/api/gamification/rewards/route.ts`, `prisma/schema.prisma:612`.
- **Sorun:** "Ekonomi" adı altında yalnızca kısmi bir basım tahmini yapılıyor. Net enflasyon (basım − harcama), dolaşımdaki toplam puan yükümlülüğü, ödül kataloğunun TL maliyetine dönüşüm gibi operatörün asıl ihtiyaç duyduğu metrikler hesaplanamıyor. Proje bellek notlarındaki "escrow/net-zero" ekonomisi kuralı da bu ekranda görünür değil.
- **Profesyonel öneri:** Kaynak (source) ve havuz (sink) kavramlarını açık bir kayıt defterine dönüştür: her basım/harcama yolunun `category` değeri zaten `AnalyticsEvent` üzerinde var. Bir `lib/economy/ledger-categories.ts` sabit listesi tanımla, simülatör her kategori için "olay sayısı × ortalama ödül" modelini bu listeden üretsin. Harcama tarafında son 30 günlük kullanım oranından (redeem rate) beklenen harcamayı türet ve sonucu "Net akış" olarak göster.

### 6. Zaman ve kullanıcı boyutu yok; varsayılanlar gerçek veriden beslenmiyor
- **Önem:** orta · **Kategori:** UX / bilgi mimarisi · **Efor:** M
- **Kanıt:** `page.tsx:13-16` (sabit `120 / 0.25 / 30 / 150`), sonuç kartında süre/kitle bilgisi yok (`page.tsx:114-133`).
- **Sorun:** "Tahmini toplam 12.345 puan" — hangi sürede, kaç kullanıcıda? Bu bağlam olmadan sayı yorumlanamaz; tavanlar ve çark günlük limiti de bu yüzden modellenemez.
- **Profesyonel öneri:** Girdileri "Kitle" (aktif kullanıcı sayısı, segment), "Davranış" (kullanıcı başına günlük feedback, detaylı oran, görev tamamlama oranı, çark katılım oranı) ve "Ufuk" (7/30/90 gün) olarak üç gruba ayır. "Son 30 günün gerçek değerleriyle doldur" butonu, `AnalyticsEvent` (`points_credited`, kategori bazında) ve `Feedback` metin uzunluğu dağılımından sunucu tarafında taban çizgisini hesaplasın (Upstash cache, 10 dk). Sonucu "gerçekleşen vs. senaryo" karşılaştırmalı göster.

### 7. Sessiz kırpma, bayat sonuç ve kayıp bağlam
- **Önem:** orta · **Kategori:** UX / durum yönetimi · **Efor:** S
- **Kanıt:** `route.ts:17-20` (clamp), `route.ts:60-66` (`inputs`/`matrixSnapshot` dönüyor ama kullanılmıyor), `page.tsx:21-28` (girdiler değişince sonuç güncellenmiyor), `page.tsx:36-40` (hata sırasında eski `payload` korunuyor).
- **Sorun:** 50.000 yazan kullanıcı 10.000 üzerinden hesaplanmış sonucu, değişmiş girdilerin yanında gösterilen eski sonucu, ya da bir hatanın altında kalan önceki başarılı sonucu güncel sanabilir.
- **Profesyonel öneri:** Girdileri debounced (300 ms) otomatik hesaplamaya bağla ya da girdiler sonuçtan farklıysa sonuç kartını soluklaştırıp "Girdiler değişti — yeniden hesapla" rozeti göster. Sonuç başlığında "Hesaplanan girdiler: …" satırı ve kırpılan alanlar için uyarı ver. Hata durumunda sonuç kartını "son başarılı hesap" etiketiyle işaretle. Senaryoyu URL query'sine yaz (`useSearchParams` + `router.replace`) ki paylaşılabilsin ve yenilemede kaybolmasın.

### 8. Gösterilmeyen XP dökümü ve gevşek tipleme
- **Önem:** düşük · **Kategori:** mimari / ölü veri · **Efor:** S
- **Kanıt:** `route.ts:67-76` (`feedbackXp`, `questXp`, `spinXp` dönüyor), `page.tsx:17`, `page.tsx:49-57` (`Record<string, unknown>` + cast), `page.tsx:117` (`payload?.note as string`).
- **Sorun:** Yanıt sözleşmesi istemci ve sunucu arasında paylaşılmıyor; alan adı değişirse derleyici yakalamaz. XP kalemleri hesaplanıp atılıyor.
- **Profesyonel öneri:** `lib/economy/sim-types.ts` içinde `EconomySimResponse` tipini (veya Zod şemasını) tanımla, route `satisfies` ile, sayfa generic `fetchJson<EconomySimResponse>` ile kullansın. XP dökümünü puan dökümüyle aynı tabloda ikinci sütun olarak göster.

### 9. Erişilebilirlik: etiket–alan bağı, canlı bölge, klavye
- **Önem:** düşük · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `page.tsx:83-96` (`Label` `htmlFor` yok, `Input` `id` yok), `page.tsx:98-103` (form yok, Enter çalışmaz), `page.tsx:107-134` (`aria-live` yok).
- **Sorun:** Ekran okuyucu alanları "düzenlenebilir metin" olarak okur; hesap sonucu ve hata duyurulmaz; klavye kullanıcısı her seferinde butona Tab'lamak zorunda.
- **Profesyonel öneri:** Girdileri `<form onSubmit>` içine al, `useId` ile `htmlFor`/`id` bağla, alan altına `aria-describedby` ile aralık açıklaması (ör. "0–10.000") ekle, sonuç kartına `aria-live="polite"` + `aria-busy={loading}` ver, hata kartına `role="alert"`.

### 10. Matris cache'i instance başına; kaydetmeden hemen sonra bayat tahmin
- **Önem:** düşük · **Kategori:** tutarlılık / performans · **Efor:** S
- **Kanıt:** `lib/points-rules.ts:242-262` (modül seviyesinde bellek cache, 60 sn), `app/api/admin/settings/points-matrix/route.ts:80` (yalnızca yerel instance'ı temizler).
- **Sorun:** Matris sayfasında kaydedip hemen simülatöre geçen operatör, isteği başka bir serverless instance karşılarsa 60 sn'ye kadar eski matrisle hesaplanmış sonuç görür. (Ödül yollarını da aynı şekilde etkiler, ama orada etki küçüktür.)
- **Profesyonel öneri:** Matris okumasını projede zaten kullanılan Upstash Redis katmanına taşı (sürüm anahtarı `points_matrix:v{updatedAt}`), ya da kaydetmede `revalidateTag('points-matrix')` + `unstable_cache` kullan. Simülatör özelinde (admin, düşük trafik) cache'i atlayıp doğrudan oku ve sonuçta "matris sürümü: güncellenme zamanı" göster.

### 11. Navigasyon ve adlandırma tutarsızlığı
- **Önem:** düşük · **Kategori:** bilgi mimarisi · **Efor:** S
- **Kanıt:** `components/dashboard/sidebar.tsx:179` (ikon `Activity`, `sidebar.tsx:161` "Platform nabzı" ile aynı), `messages/tr.json:2483` ("Ekonomi sim"), `sidebar.tsx:209` (puan matrisi listede ~30 satır uzakta), `page.tsx:1` (`<title>` yok).
- **Sorun:** Düz ~70 maddelik admin menüsünde ekonomiyle ilgili araçlar (puan matrisi, oyunlaştırma ayarları, ödüller, sezonsal kampanyalar, ekonomi sim) dağınık; operatör aynı işi yapan iki ekranı birbirinden habersiz kullanıyor.
- **Profesyonel öneri:** Birleştirme kararıyla birlikte "Ekonomi" adlı tek bir menü grubu oluştur (Puan matrisi + Etki simülasyonu + Oyunlaştırma çarpanları + Ödül kataloğu + Ekonomi sağlığı). Sayfayı server component sarmalayıcıyla bölüp `generateMetadata` ile "Ekonomi simülatörü" başlığını ver.

---

## Eksik özellikler (kıyas ürünlerle)

Stripe Dashboard (gelir/raporlama), PostHog (insights, karşılaştırmalı dönemler), Retool iç araçları (form + tablo + grafik), Linear (keskin bilgi yoğunluğu) referans alındığında:

1. **Taslak vs. kayıtlı karşılaştırma (diff görünümü):** Stripe'ın fiyat değişikliği önizlemesi gibi, "bu matris değişikliği aylık basımı +%X değiştirir" özeti ve kaydetme öncesi onay.
2. **Gerçek veriyle kalibrasyon:** PostHog tarzı "son 30 gün" taban çizgisi; senaryo çizgisi gerçekleşen eğriyle aynı grafikte.
3. **Zaman serisi projeksiyonu:** 7/30/90 günlük kümülatif basım, harcama ve net dolaşım grafiği (yığılmış alan grafiği, kaynak bazında renk).
4. **Kaynak/havuz (source/sink) muhasebesi:** Tüm `points_credited` kategorileri + harcama kanalları; net enflasyon ve dolaşımdaki toplam puan yükümlülüğü (TL karşılığıyla).
5. **Kaydedilebilir ve paylaşılabilir senaryolar:** Adlandırılmış senaryolar, yan yana karşılaştırma (A/B/C), URL ile paylaşım, CSV dışa aktarma.
6. **Duyarlılık (sensitivity) analizi:** "Hangi parametre toplam basımı en çok etkiliyor?" tornado grafiği; çark için beklenen değer ve varyans (dağılım histogramı).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör puan matrisinde bir değeri değiştirdiği anda, ekranın sağında bu değişikliğin platform ekonomisine 30 günlük etkisini — gerçek kullanıcı davranışıyla kalibre edilmiş biçimde — görür; kaydetmeden önce "net dolaşım +%18, kullanıcı başına aylık +42 puan, tavana takılan kullanıcı oranı %6 → %11" gibi somut bir özetle karar verir.

**Yerleşim:**
- `/admin/points-matrix` iki sütunlu olur: solda mevcut matris düzenleyicisi, sağda yapışkan (sticky) "Ekonomi etkisi" paneli (mobilde alttan açılan sheet).
- Panel üç bölüm: (1) **Kitle ve ufuk** — aktif kullanıcı (gerçek veriden önceden dolu), segment, 7/30/90 gün seçici; (2) **Sonuç** — iki büyük KPI (basılacak puan, net akış) + "kayıtlı → taslak" değişim rozetleri; altında kaynak bazında yığılmış çubuk ve çarpan şelalesi; (3) **Varsayımlar** — açılır bölümde davranış parametreleri (kullanıcı başına feedback, detaylı oran slider'ı, görev tamamlama oranı, çark katılımı), her biri "gerçek: X" ipucuyla.
- Senaryolar: üstte sekme benzeri senaryo çipleri ("Mevcut", "Kampanya haftası", "Çark 2x"), URL'de saklanır, CSV dışa aktarma.

**Motion / 3D:** Bu bir operatör aracı; 3D gereksiz. Ölçülü motion yeterli: KPI sayılarında `m` (LazyMotion) ile 200–300 ms sayı geçişi (tween), taslak-kayıtlı farkı değiştikçe rozetin yumuşak renk geçişi, grafik çubuklarında `layout` animasyonu. `useReducedMotion` ile hepsi anında değişime düşsün. Hesaplama sırasında tüm kartı iskelete çevirmek yerine yalnızca değişen değerlerde hafif opaklık düşüşü.

**Veri / API değişiklikleri:**
- `lib/economy/reward-pipeline.ts`: feedback/yorum/görev/çark ödül hesaplarının saf fonksiyonları; hem gerçek route'lar hem simülatör kullanır.
- `POST /api/admin/economy-sim`: gövde Zod ile doğrulanır `{ matrixOverride?, audience: { activeUsers, segment? }, horizonDays, behavior: {...} }`; yanıt `{ baseline, scenario, delta, bySource[], waterfall[], capImpact, warnings[] }`, tipi `lib/economy/sim-types.ts`'ten paylaşılır.
- `GET /api/admin/economy-sim/baseline`: son 30 gün `AnalyticsEvent` `points_credited` kategori toplamları, aktif kullanıcı, detaylı metin oranı, görev tamamlama ve çark katılım oranları, harcama toplamları; Upstash'te 10 dk cache, build-time DB fail-safe kuralına uygun try/catch.
- Ödül kodu ile sim arasında sapmayı önlemek için birim testi: aynı girdilerle `reward-pipeline` çıktısının feedback route'unda kredilenen tutarla eşleşmesi.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/points-matrix`** — `app/admin/points-matrix/page.tsx:911-985` "Canlı Puan Mantığı Simülasyonu" ve "Çark Algoritma Simülasyonu" bölümleri, bu sayfayla aynı amaca (matrisin etkisini önizlemek) hizmet ediyor; matris sayfası taslak üzerinde çalışıyor ama toplu etkiyi göstermiyor, bu sayfa toplu etki gösteriyor ama taslak kabul etmiyor. **Öneri: birleştir** — simülatörü matris sayfasının yan paneline taşı, `/admin/economy-sim`'i oraya yönlendir (`redirect`), kenar çubuğu girişini kaldır.
- **`/admin/gamification-settings`** — platform geneli `xpMultiplier`/`pointMultiplier` buradan yönetiliyor (`lib/gamification-settings.ts:22-32`) ve gerçek ödülü doğrudan etkiliyor; birleşik "Ekonomi" grubunda simülatör bu çarpanları da taslak olarak değiştirebilmeli.
- **`/admin/seasonal-campaigns`** — kampanya çarpanları gerçek ödülü etkiliyor (`lib/seasonal-campaign-live.ts:74`); simülatörde "aktif/planlı kampanyayı dahil et" seçeneği olarak bağlanmalı.

---

## Doğrulama (şüpheci inceleme)

### 1. Virgüllü ondalık girdi NaN üretip sayfayı error boundary'ye düşürüyor — **Karar: DOĞRULANDI** (önem: ORTA; yalnızca ADMIN etkileniyor, veri bozulmuyor)

- `app/api/admin/economy-sim/route.ts:18`: `Number('0,25')` → `NaN`; `Math.min(1, NaN)` → `NaN`, `Math.max(0, NaN)` → `NaN`. Sıkıştırma NaN'ı süzmüyor.
- `route.ts:25-28`: `Math.round(NaN)` → `detailedN = NaN`, dolayısıyla `baseN`, `feedbackPoints`, `feedbackXp` NaN; `route.ts:55-56` → `totalPoints`/`totalXp` NaN. `NextResponse.json` (JSON.stringify) NaN'ı `null` yazar; yanıt 200 döner, `success: true`.
- `app/admin/economy-sim/page.tsx:36-37`: `r.ok` true olduğu için hata yolu çalışmaz, `setPayload(j)` yapılır. `page.tsx:113` `est` truthy (nesne var), `page.tsx:122` `null.toLocaleString('tr-TR')` render sırasında TypeError atar. Bu segmentte daha yakın bir `error.tsx` yok (`app/admin/economy-sim/` yalnızca `page.tsx` içeriyor); hata `app/admin/error.tsx` tarafından yakalanır ve sayfa içeriği "Bir hata oluştu" ekranıyla değişir (Sentry'ye de gider).
- Yan bulgular da kodla tutarlı: `'1.000'` → `Number` 1 olarak okunur (`route.ts:17`), Türkçe binlik ayırıcıyla 1000 yazan operatör sessizce 1 için hesap görür; boş alan `''` `|| '100'` ile varsayılana düşer (`route.ts:17-20`), ekranda boş görünürken sunucu 100/0.2/40/200 kullanır ve `inputs` yanıtı istemcide gösterilmediği için bu fark fark edilmez. `abc` gibi herhangi bir sayısal olmayan değer de aynı çökmeye yol açar (`feedbackCount=abc` → tüm toplamlar NaN).
- **Yeniden üretim:** ADMIN olarak `/admin/economy-sim` aç → "Detaylı metin oranı" alanına Türkçe alışkanlıkla `0,25` yaz → "Hesapla" → admin hata ekranı. Türkçe arayüzde ondalık virgül en olası girdi olduğundan senaryo gerçekçi.
- **Önem notu:** "KRİTİK" değil; salt okunur bir admin aracı, hiçbir kayıt yazılmıyor, kullanıcı/puan verisi etkilenmiyor. Ama araç doğal Türkçe girdide çöküyor, bu yüzden düzeltilmeli.
- **Öneri:** Sunucuda Zod ile `z.coerce.number().finite()` + aralık doğrulaması; geçersiz girdide 400 ve alan bazlı hata (`{ field, message }`) dön, sessiz varsayılana düşme. İstemcide oranı 0–100 % slider + sayı alanı olarak al, sayı alanlarını `type="number"`/`inputMode="decimal"` ve virgülü noktaya normalleyen bir ayrıştırıcıyla yönet; yanıttaki `inputs`'u "hesaplanan varsayımlar" olarak göster. Render tarafında `Number.isFinite` koruması olan ortak bir `formatNumber` yardımcısı kullan ki tek bir bozuk alan tüm sayfayı düşürmesin.

### 2. Simülatörün verdiği tahmin gerçek ödül mantığıyla tutarsız — **Karar: ÇÜRÜTÜLDÜ** (KRİTİK/YÜKSEK hata olarak; olgusal tespitler doğru, ürün/doğruluk iyileştirmesi olarak ORTA önemde yeniden sınıflanmalı)

- Olgular kodla doğru: gerçek feedback ödülü VIP → sezonsal kampanya → platform çarpanı → `capFeedbackPoints` zincirinden geçiyor (`app/api/feedbacks/route.ts:309-318`), tavan 500/gün ve 2000/hafta (`lib/points-caps.ts:13-14`); sim bunların hiçbirini uygulamıyor (`route.ts:23-28`). Görev ödülü gerçekte görev başına `quest.reward` (`lib/points-rules.ts:301-314`, `app/api/gamification/quests/[id]/claim/route.ts:96`), sim ise yalnızca `matrix.quest.default` (varsayılan 100 puan, `lib/points-rules.ts:81-82`) kullanıyor; admin görev formu varsayılanı 50 (`app/admin/quests/page.tsx:87`).
- Neden "hata/güvenlik bulgusu" olarak çürütüldü: Endpoint salt okunur, hiçbir veri yazmıyor; hiçbir kod yolu bu tahmini bir karar/ayar olarak tüketmiyor. Sayfa kendini açıkça "toplu tahmin, canlı veriyi değiştirmez" (`page.tsx:64`) ve "Tahmindir; gerçek dağılım kullanıcı davranışına bağlıdır" (`route.ts:77`) diye etiketliyor. Bir kullanıcının ya da verinin etkilendiği somut bir senaryo kurulamıyor; "yanlış bütçe kararı" spekülatif bir dolaylı etki.
- "Sistematik olarak yanlış" ifadesi de abartılı: sapmalar zıt yönlü. Çarpanlar (VIP, kampanya, platform) gerçeği yukarı iterken tavanlar aşağı çeker; sim kullanıcı sayısı almadığı için kullanıcı başına tavan zaten modellenemez. Yön, matris ve kampanya durumuna göre değişir.
- **Öneri (iyileştirme olarak):** Raporun "Yeniden tasarım vizyonu" bölümündeki `lib/economy/reward-pipeline.ts` yaklaşımı doğru çözüm: ödül hesabını saf fonksiyonlara çıkarıp hem gerçek route'lar hem sim tarafından kullanmak; sime aktif kullanıcı sayısı ekleyip tavanı kullanıcı başına uygulamak; görev ödülünü aktif `Quest` kayıtlarının ağırlıklı ortalamasından okumak; aktif çarpanları ve kampanyaları "dahil et" seçenekleri olarak göstermek ve hangi kuralların modellenmediğini sonuç kartında açıkça listelemek.

---

## Uygulama (Dalga 2)

Rota `/admin/economy?tab=simulation` (sekme **Simülasyon**, `next/dynamic` ile yalnız açılınca yüklenir); `/admin/economy-sim` kalıcı yönlenir. Eski `GET /api/admin/economy-sim` silindi. Yeni BFF: `GET /api/admin/economy/flow?days=7|30|90` (PointsLedger) ve `POST /api/admin/economy/simulate` (taslak matris/çarpan, salt okunur); ikisi de `defineRoute` + zod + rate limit. Hesap saf `lib/admin-economy/simulate.ts` içinde (Jest testli).

| # | Özellik | Yeni durum |
|---|---|---|
| 1, 2 | Erişim / API yetkisi | ÇALIŞIYOR |
| 3 | Hero | ÇALIŞIYOR — stüdyo başlığı; kapsam ve varsayımlar sonuçta açıkça listelenir |
| 4 | Puan matrisi kısayolu | KALDIRILDI — aynı sayfada sekme |
| 5 | Senaryo kartı | ÇALIŞIYOR — "Taslak etkisi" |
| 6–9 | Serbest metin girdileri | KALDIRILDI — davranış uydurma sayılarla değil, seçili dönemin GERÇEK olay hacmiyle modellenir |
| 10 | Hesapla | ÇALIŞIYOR — "Taslağı simüle et" |
| 11 | Açılışta hesap | ÇALIŞIYOR — akış (gerçek veri) açılışta yüklenir |
| 12 | Hata kartı | ÇALIŞIYOR — `ErrorState` + Tekrar dene, Türkçe |
| 13 | Yükleniyor | ÇALIŞIYOR — iskelet; yeniden yüklemede soluklaşma + `aria-busy` |
| 14, 15 | Toplam puan/XP | ÇALIŞIYOR — gerçek basım/harcama/net/arz/enflasyon/kullanım oranı + önceki dönem kıyası |
| 16 | Kaynak dökümü | ÇALIŞIYOR — tüm defter kaynakları, tür (basım/harcama/transfer/düzeltme), pay |
| 17 | XP dökümü | KISMİ — defter `xpDelta` sunucuda toplanır; tabloda puan odaklı gösterim |
| 18 | Girdi/matris yankısı | ÇALIŞIYOR — her satırda ölçekleme dayanağı + varsayımlar listesi |
| 19 | Not | ÇALIŞIYOR |
| 20 | Çark pasif | ÇALIŞIYOR — taslakta kapalıysa çark basımı 0 |
| 21 | Sunucu doğrulama | ÇALIŞIYOR — zod (dönem, taslak matris `pointsMatrixSchema`) → 400 |
| 22 | Cache tutarlılığı | ÇALIŞIYOR — simülasyon kayıtlı matrisi önbelleksiz okur |
| 23 | Bayatlama göstergesi | ÇALIŞIYOR — dönem değişince "yeniden hesaplayın" uyarısı |
| 24 | Taslakla what-if | ÇALIŞIYOR — kaydedilmemiş matris/çarpan taslakları |
| 25 | Diğer kaynaklar | ÇALIŞIYOR — tüm defter kaynakları gözlenir; matris dışı olanlar sabit taşınır |
| 26 | Harcama kanalları | ÇALIŞIYOR — harcama, net akış, kullanım oranı |
| 27 | Zaman ufku | ÇALIŞIYOR — 7/30/90 gün (Europe/Istanbul) |
| 28 | Gerçek taban çizgisi | ÇALIŞIYOR — PointsLedger |
| 29 | Senaryo kaydetme/URL | KISMİ (kalan) — sekme URL'de; adlandırılmış senaryo yok |
| 30 | Dışa aktarma | EKSİK (kalan) |
| 31 | Grafik | ÇALIŞIYOR — günlük basım/harcama çubukları (+ sr-only veri tablosu), MetricTile eğilim çizgisi |
| 32 | Mobil | ÇALIŞIYOR |
| 33, 34 | a11y | ÇALIŞIYOR — `ChoiceChips` radiogroup, `aria-live` sonuç, tablo `caption`/`scope` |
| 35 | `<title>` | ÇALIŞIYOR — sunucu `metadata` "Ekonomi Stüdyosu" |
| 36 | Kenar çubuğu | ÇALIŞIYOR — registry `admin.economy` (navigasyon ajanının; `redirectFrom` tanımlı) |

**Kapanan bulgular:** 1 (serbest girdi kalktı, zod), 2 (gerçek defter + oransal model; varsayımlar açık), 3 (görev ölçeklenmez, açıkça yazılı), 4 (birleşti), 5, 6, 7, 8, 9, 10, 11. **Kalanlar:** adlandırılmış/paylaşılabilir senaryolar ve CSV; defter dışı eski kredi yolları akışta görünmez (lib/economy göçü sürdükçe kapsam büyür — arayüzde yazılı).
