# /customer/referral

**Amaç:** Müşterinin kişisel davet kodunu görmesi, kopyalaması ve paylaşması; kendisine verilen bir davet kodunu uygulaması; davet ettiği kişileri, davet istatistiklerini ve 3/5/10/25 davet kademe (milestone) bonuslarını takip edip talep etmesi.

**Genel puan:** 5/10 · **Karar:** yeniden tasarla (sayfa iskeleti korunabilir; ama arkasındaki davet ekonomisi kurgusu ve sayfanın bilgi mimarisi baştan ele alınmalı)

> Kapsam notu: Sayfa tek bir API ucuna bağlı (`app/api/referral/route.ts`; GET/POST/PUT). Davetin asıl girişi olan kayıt akışı (`app/api/auth/register/route.ts`, `app/(auth)/auth/complete/page.tsx`) bu sayfanın paylaştığı bağlantıyı tükettiği için denetime dahil edildi. Satır numaraları `app/customer/referral/page.tsx` dosyasının kendi satırlarıdır.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Temel akışlar (kod, paylaş, uygula, kademe talep) çalışıyor; ancak "Kazanılan Puan" istatistiği yanlış hesaplanıyor, "Bekliyor" durumu hiç oluşmuyor, hata durumu yok ve davet ekonomisi sahte hesapla sömürülebilir. |
| UX | 5/10 | Bilgiler alt alta kart yığını; ana eylem (paylaş) ile ikincil eylem (kod uygula) aynı ağırlıkta, kademe hedefi sayfanın ortasında kayboluyor, iptal edilen paylaşımda yanıltıcı "kopyalandı" bildirimi çıkıyor. |
| Görsel | 6/10 | Ortak `DashboardPageHero` ve kart dili tutarlı; ama sayfanın "ödül" hissi zayıf, kademe bölümü düz metin + çip şeridi, oyunlaştırma sayfalarındaki (rozet/ödül kutusu) cilanın gerisinde. |
| Mimari | 5/10 | GET uç noktası 7 ardışık sorgu yapıyor ve okumada yazma (kod üretimi) yapıyor; ödül mantığı `register` ile `referral` uçlarında kopyalanmış ve iki kopya farklı kurallar uyguluyor; `tx: any` kaçakları var. |
| Performans | 6/10 | Tek istekli, hafif sayfa; fakat GET'teki sorgular paralel değil (`Promise.all` yok) ve liste her ziyarette tam yeniden çekiliyor. |
| Erişilebilirlik + mobil | 5/10 | Global `MotionConfig reducedMotion="user"` sayesinde hareket azaltma çalışıyor; ama kod alanı ve kod giriş alanında etiket yok, ilerleme çubuğunda `role="progressbar"` yok, 3 sütunlu istatistik ızgarası 400px'te 10px etiketlere düşüyor, sarı metinlerin koyu tema kontrastı zayıf. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (başlık/açıklama) | ÇALIŞIYOR | `app/customer/referral/layout.tsx:4-6` | `layoutMetadata.customerReferral` TR/EN mevcut. |
| 2 | Yetki: yalnız CUSTOMER rolü sayfaya girer, API oturum ister | ÇALIŞIYOR | `proxy.ts:53`, `app/api/referral/route.ts:28-31` | Sayfa istemci bileşeni; korumayı proxy + API yapıyor. |
| 3 | Modül kapısı (`referrals` modülü kapalıysa) | KISMİ | `route.ts:26-27`; sayfa `page.tsx:86-88` | API kapıyı uyguluyor, fakat rol bazlı görünürlüğü (`role` parametresi verilmiyor, `lib/module-gate.ts:96-101`) müşteri için kontrol etmiyor; sayfa da "modül kapalı" durumunu göstermiyor, boş/sıfır içerik çiziyor. |
| 4 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:161-168` | Tam ekran spinner; içerik iskeleti (skeleton) yok, düzen kayması oluşuyor. |
| 5 | Hata durumu (401/403/500/503) | BOZUK | `page.tsx:82-94` | Yalnız ağ istisnasında toast var; `success:false` yanıtlarında sessizce `data=null` kalıyor; boş kod, "—" puan, 0 istatistik ve çalışmayan "Kodu Paylaş" butonu gösteriliyor. Yeniden dene yok. |
| 6 | Hero başlığı | ÇALIŞIYOR | `page.tsx:172-178` | Ortak tasarım dili bileşeni. |
| 7 | Kişisel davet kodunun gösterimi | ÇALIŞIYOR | `page.tsx:193-197` | `readOnly` Input; `aria-label` yok, ekran okuyucu "boş düzenleme alanı" gibi okur. |
| 8 | İlk ziyarette kod üretimi | KISMİ | `route.ts:34-45` | GET içinde yan etki; iki eşzamanlı GET'te (React StrictMode dev çift effect, `next.config` `reactStrictMode: true`) `userId @unique` ihlali → 500. `nanoid(8).toUpperCase()` alfabesi `-` ve `_` içerir, `O/0`, `I/1` karışabilir; elle yazmaya uygun değil. |
| 9 | Kopyala butonu | KISMİ | `page.tsx:112-116` | `navigator.clipboard.writeText` beklenmiyor ve hatası yakalanmıyor; izin reddedilse bile "kopyalandı" toast'ı çıkar. Yalnız KOD kopyalanıyor, bağlantı kopyalanmıyor. |
| 10 | Paylaş butonu (Web Share API) | KISMİ | `page.tsx:118-135` | Bağlantı doğru (`/auth/register?ref=`). Kullanıcı paylaşım sayfasını iptal edince (`AbortError`) `catch` kodu kopyalayıp "kopyalandı" der (yanıltıcı). Masaüstü geri dönüşü bağlantıyı değil yalnız kodu kopyalar. |
| 11 | Ödül bilgisi kutucukları (sana / arkadaşına puan) | ÇALIŞIYOR | `page.tsx:211-222`, `route.ts:95-96` | Puan matrisinden canlı geliyor (varsayılan 1000/500, `lib/points-rules.ts:64-65`). |
| 12 | Davet kodu uygulama kartı | KISMİ | `page.tsx:228-251`, `route.ts:118-283` | İşlevsel ve P2002 ile çift bonus engelli; ama hesap yaşı, karşılıklı (A↔B) davet ve aktivasyon koşulu yok → bkz. Bulgu 2. |
| 13 | Kod girişini büyük harfe çevirme | ÇALIŞIYOR | `page.tsx:240` | Giriş alanında `<label>` yok, yalnız placeholder. |
| 14 | Uygulama hata/başarı mesajları | KISMİ | `route.ts:131,143,153,157,161,170,184,189,274` | Sunucu mesajları doğrudan toast'a basılıyor; bir kısmı İngilizce ("Invalid referral code"), bir kısmı Türkçe sabit ("Tebrikler! … puan kazandın!") — iki dilde de karışık görünür. |
| 15 | "X tarafından davet edildiniz" şeridi | ÇALIŞIYOR | `page.tsx:254-265` | "sen/siz" hitabı sayfa içinde karışık (`tr.json` customerReferral.referredBy vs yourCodeDescription). |
| 16 | İstatistik: Davet Edilen | ÇALIŞIYOR | `route.ts:76` | Gerçek `count`. |
| 17 | İstatistik: Tamamlanan | KISMİ | `route.ts:70-72` | Doğru sayıyor ama her davet anında `COMPLETED` oluşturulduğu için (bkz. #24) her zaman "Davet Edilen" ile aynı — anlamsız bir kart. |
| 18 | İstatistik: Kazanılan Puan | BOZUK | `route.ts:74-78` | Yorum "gerçek toplam kullan" diyor ama kod `take: 20` listesinin `reduce`'u; 20+ davette eksik. Kademe bonusları hiç dahil değil. |
| 19 | Davet Kademeleri kartı | ÇALIŞIYOR | `page.tsx:292-376`, `lib/referral-milestones.ts:20-25` | Tüm metinler sabit Türkçe (`page.tsx:297,299,313,323,333,347,368`; etiketler `lib/referral-milestones.ts:21-24`) — EN dilinde Türkçe görünür. |
| 20 | Kademe ödülünü talep et | ÇALIŞIYOR | `page.tsx:96-110`, `route.ts:291-363` | Sunucu sayımı yeniden yapıyor, JSON-guard'lı `updateMany` ile idempotent, `points_credited` yazıyor — iyi. Toast sabit TR + emoji (`page.tsx:102-106`); kutlama anı yok. |
| 21 | Sonraki kademeye ilerleme çubuğu | ÇALIŞIYOR | `page.tsx:329-345`, `lib/referral-milestones.ts:51-69` | `role="progressbar"`/`aria-valuenow` yok. |
| 22 | Kademe çip şeridi (alındı/hazır/kilitli) | ÇALIŞIYOR | `page.tsx:351-372` | Durum yalnız renk + emoji ile anlatılıyor; `text-yellow-600` koyu tema varyantı yok. |
| 23 | Davet ettiklerim listesi | KISMİ | `page.tsx:379-432`, `route.ts:48-57` | En yeni 20 kayıt; sayfalama/"tümünü gör" yok; 20'den eskiler görünmez. |
| 24 | "Bekliyor" rozeti | SAHTE (ölü dal) | `page.tsx:408-416`; `route.ts:208`; `app/api/auth/register/route.ts:117` | İki oluşturma yolu da `status: 'COMPLETED'` yazıyor; `PENDING` hiç oluşmuyor (şema varsayılanı `prisma/schema.prisma:1727` kullanılmıyor). |
| 25 | Boş durum + "Kodu Paylaş" CTA | ÇALIŞIYOR | `page.tsx:420-429` | Hata durumunda (kod yokken) CTA sessizce hiçbir şey yapmaz (`page.tsx:119`). |
| 26 | Tarih biçimi yerelleştirme | ÇALIŞIYOR | `page.tsx:71, 404` | |
| 27 | Giriş animasyonları + hareket azaltma | ÇALIŞIYOR | `page.tsx:181,229,276,293,379,392`; `components/providers.tsx:232` | Global `MotionConfig reducedMotion="user"`. CSS `hover:scale-[1.01]` (`page.tsx:307`) `motion-reduce` almıyor (önemsiz). |
| 28 | Mobil yerleşim | KISMİ | `page.tsx:268, 283` | 3 sütun + `text-[10px]` etiket; kod + iki buton `sm` altında dikey diziliyor (iyi). |
| 29 | Paylaşılan bağlantıyla kayıt (`?ref=`) | KISMİ | `app/(auth)/auth/register/page.tsx:60,96,213`; `app/api/auth/register/route.ts:99-145` | Bağlantı işliyor, ama kayıt yolu e-posta doğrulanmadan puan dağıtıyor ve aylık/ömür boyu limitleri ve modül kapısını atlıyor (Bulgu 1). |
| 30 | OAuth sonrası davet uygulama | ÇALIŞIYOR | `app/(auth)/auth/complete/page.tsx:34-45` | Sonuç kullanıcıya bildirilmiyor (`.catch(() => {})`). |
| 31 | Davet bildirimleri (iki tarafa) | ÇALIŞIYOR | `route.ts:242-257` | Metinler sabit TR. |
| 32 | Kötüye kullanım limitleri (ömür boyu 100 / ayda 30) | KISMİ | `route.ts:164-185`, `lib/innovation-config.ts:70-73` | Yalnız POST yolunda; kayıt yolunda yok; tx dışında kontrol (yarışta aşılabilir). |
| 33 | Kademe ulaşıldığında bildirim | EKSİK | — | Kademe talebi yalnız sayfayı açınca fark ediliyor; push/bildirim yok. |
| 34 | Bağlantı kopyala / QR davet kartı | EKSİK | — | QR ürününde davet QR'ı yok; yalnız kod kopyalanıyor. |
| 35 | Nitelikli davet (arkadaş ilk QR okutması/geri bildirimi sonrası ödül) | EKSİK | — | Ödül kayıt anında veriliyor. |
| 36 | Davet sıralaması / sosyal kanıt | EKSİK | — | |

**Durum sayıları:** ÇALIŞIYOR 18 · KISMİ 12 · BOZUK 2 · SAHTE 1 · EKSİK 4 (toplam 36 kalem incelendi).

---

## Bulgular

### 1. Kayıt yolu, e-posta doğrulanmadan davet edene puan basıyor ve tüm davet limitlerini atlıyor
- **Önem:** kritik · **Kategori:** güvenlik / puan ekonomisi
- **Kanıt:** `app/api/auth/register/route.ts:56-66` (kullanıcı `emailVerified: null` ile oluşturuluyor), `:99-145` (aynı istekte `COMPLETED` davet + `creditPointsAndXp` iki tarafa), `:13-14` (yalnız IP başına dakikada 5 kayıt), `:101-108` (ömür boyu/aylık limit ve `assertModuleEnabled('referrals')` YOK). Girişte doğrulama zorunlu: `lib/auth.ts:165`.
- **Sorun:** Bu sayfanın "Paylaş" butonunun ürettiği `/auth/register?ref=KOD` bağlantısıyla, var olmayan/atılabilir e-postalarla hesap açmak davet edene her seferinde varsayılan 1000 puan (`lib/points-rules.ts:65`) kazandırır; doğrulanmamış hesap hiç giriş yapamasa bile puan çoktan verilmiştir. POST yolundaki 100/30 limitleri kayıt yolunda uygulanmadığından tavan yok; üstüne 3/5/10/25 kademe bonusları (+4600) da bu sahte sayımla açılır. Ayrıca modül kapatılsa bile kayıt yolu puan dağıtmaya devam eder. Bu, hafızadaki "her puan basan yol escrow/tek seferlik/fraud görünürlüğü" ilkesinin ruhuna aykırı.
- **Profesyonel öneri:** Davet ödülünü kayıt anından ayırın: kayıtta `Referral` kaydı `PENDING` oluşturulsun (yalnız ilişki), ödül ise nitelikli bir olayda (e-posta doğrulandıktan SONRA ilk QR okutma/geri bildirim) tek bir paylaşılan servis fonksiyonu `lib/referral-service.ts → qualifyReferral(tx, referredId)` ile atomik verilsin. Limit kontrolleri (ömür boyu, aylık, `maxUsage`, modül kapısı, hesap yaşı) bu tek fonksiyona taşınsın ve kayıt + POST + OAuth yolları yalnız `attachReferral()` çağırsın. Mevcut sahte kazanım riskini ölçmek için `analyticsEvent(points_credited, category=referral)` kayıtları ile doğrulanmamış `referred` kullanıcılar karşılaştırılmalı (salt-okuma rapor).
- **Efor:** M

### 2. POST /api/referral: eski hesaplar istediği zaman ve karşılıklı (A↔B) kod uygulayarak puan basabiliyor
- **Önem:** yüksek · **Kategori:** güvenlik / puan ekonomisi
- **Kanıt:** `app/api/referral/route.ts:137-190` — yalnız "daha önce kod kullandın mı", "kendi kodun mu", limitler kontrol ediliyor; hesap yaşı, aktivasyon veya ters yönlü ilişki kontrolü yok. UI bu kartı referans almamış HER kullanıcıya gösteriyor: `page.tsx:228`.
- **Sorun:** A, B'nin kodunu uygular (A +500, B +1000); ardından B, A'nın kodunu uygular (B +500, A +1000). İki eski hesap birbirine 3000 puan basar, kimse yeni kullanıcı getirmez. Arkadaş grupları zincirleme yaparak kademe bonuslarını da açar.
- **Profesyonel öneri:** (a) Kod uygulamayı kayıttan sonraki kısa bir pencereyle sınırlayın (ör. 7 gün) ve UI'da kartı yalnız bu pencerede gösterin; (b) `Referral.findFirst({ referrerId: me, referredId: codeOwner })` ile döngüyü reddedin; (c) ödülü Bulgu 1'deki nitelikli olaya bağlayın. Hata kodlarını makine-okunur anahtarlarla döndürün (`{ code: 'REFERRAL_WINDOW_EXPIRED' }`), UI i18n ile çevirsin.
- **Efor:** S

### 3. "Kazanılan Puan" istatistiği yanlış: yalnız son 20 davet toplanıyor, kademe bonusları yok
- **Önem:** yüksek · **Kategori:** veri doğruluğu
- **Kanıt:** `app/api/referral/route.ts:74-78` (`totalPointsEarned: referrals.reduce(...)`, `referrals` `take: 20` ile `:56`). Yorum satırı (`:74`) tam tersini iddia ediyor.
- **Sorun:** 20'den fazla davet eden — tam da en değerli kullanıcı — kazancını eksik görür; kademe talep ettikten sonra sayı da artmaz. Güven kıran bir tutarsızlık.
- **Profesyonel öneri:** `prisma.referral.aggregate({ where: { referrerId }, _sum: { pointsEarned: true } })` + kademe bonusları için `analyticsEvent` toplamı (veya `referralMilestonesClaimed` × `REFERRAL_MILESTONES` puanı) ile "davetlerden toplam kazanç"ı ayrı kalemlerle döndürün (`perInvite`, `milestones`, `total`).
- **Efor:** S

### 4. Hata ve "modül kapalı" durumları kullanıcıya gösterilmiyor
- **Önem:** orta · **Kategori:** UX / hata yönetimi
- **Kanıt:** `page.tsx:82-94` — yalnız `result.success` true ise veri set ediliyor, `else` dalı yok; `res.ok` kontrol edilmiyor.
- **Sorun:** 401 (oturum düşmüş), 403 (modül kapalı), 503 (DB erişilemez) durumlarında kullanıcı boş kod alanı, "—" ödüller ve tıklanınca hiçbir şey yapmayan "Kodu Paylaş" butonu görür. Sorun anlaşılmaz, tekrar deneme yolu yok.
- **Profesyonel öneri:** Veri çekmeyi `useSWR('/api/referral')` (veya projedeki ortak fetch kancası) ile yapın; üç ayrı durum bileşeni çizin: skeleton, `ErrorState` (yeniden dene), `ModuleDisabledState` (API'nin gate yanıtındaki `reason`'a göre). Mutasyonlardan sonra `mutate()` ile iyimser güncelleme.
- **Efor:** S

### 5. Kademe bölümü ve sunucu mesajlarında TR/EN dil karışıklığı
- **Önem:** orta · **Kategori:** i18n / tutarlılık
- **Kanıt:** Sabit TR: `page.tsx:102,103,106,297,299,313,316,323,333,347,368`; kademe etiketleri `lib/referral-milestones.ts:21-24`; sunucu İngilizce hatalar `route.ts:143,153,157,161,189,265`, Türkçe sabit `route.ts:170,184,274,339-340`; bildirim metinleri `route.ts:247-254`. Ayrıca "sen/siz" karışık: `messages/tr.json` `customerReferral.yourCodeDescription` ("arkadaşlarınla") vs `myInvitesDescription` ("kodunuzu").
- **Sorun:** EN kullanıcı yarı Türkçe sayfa görür; TR kullanıcı "Invalid referral code" toast'ı görür. Marka adı i18n'de "QRateX" olarak sabit yazılmış (`customerReferral.shareTitle`), site adı ayarından gelmiyor.
- **Profesyonel öneri:** API tüm hatalarda `{ errorKey }` döndürsün; UI `t()` ile çevirsin. Kademe etiketleri `labelKey` + sayı parametresiyle i18n'e taşınsın. Bildirimler `lib/notification-i18n` benzeri anahtarla saklanıp okuma anında çevrilsin. Hitap tek tip ("sen") olsun; marka `seo.siteName`'den gelsin.
- **Efor:** S

### 6. Paylaş/kopyala geri bildirimi yanıltıcı ve bağlantı paylaşımı zayıf
- **Önem:** orta · **Kategori:** UX / işlevsellik
- **Kanıt:** `page.tsx:112-116` (`writeText` beklenmiyor, hata yakalanmıyor, toast koşulsuz), `page.tsx:126-134` (paylaşım iptali `catch` → `copyCode()` → "kopyalandı").
- **Sorun:** Kullanıcı paylaşım sayfasını kapatınca "kopyalandı" görür ama panoda bağlantı değil yalnız kod vardır; arkadaş kodu aldığında kayıt sayfasında kod alanı yoktur (`register/page.tsx` yalnız URL `?ref=` okuyor), kodu ancak kayıttan sonra bu sayfaya gelip uygulayabilir — davet dönüşümünü düşüren bir sürtünme.
- **Profesyonel öneri:** Birincil eylemi "Bağlantıyı paylaş" yapın; masaüstü geri dönüşü bağlantıyı kopyalasın; `AbortError`'ı sessizce yutun; kopyalama sonucu `await` edilip başarısızsa metni seçili gösterin. Butonda 1.5 sn'lik "Kopyalandı ✓" ikon değişimi (toast yerine yerinde onay). Kayıt formuna "Davet kodun var mı?" açılır alanı ekleyin.
- **Efor:** S

### 7. "Bekliyor" durumu ve "Tamamlanan" istatistiği ölü/anlamsız
- **Önem:** orta · **Kategori:** ölü kod / bilgi mimarisi
- **Kanıt:** `page.tsx:408-416` ve `:271`; oluşturma yolları her zaman `COMPLETED`: `route.ts:208`, `app/api/auth/register/route.ts:117`.
- **Sorun:** Kullanıcı aynı sayıyı iki kartta görür; "Bekliyor" rozeti hiç görünmez. Bulgu 1'deki nitelikli-davet modeli uygulanırsa bu iki öğe anlam kazanır; uygulanmazsa kaldırılmalı.
- **Profesyonel öneri:** Nitelikli davet modeline geçip davet satırında adım göstergesi kullanın ("Kayıt oldu → E-postayı doğruladı → İlk QR'ını okuttu"), "Bekliyor" yerine "Arkadaşın 1 adım uzakta" gibi eyleme yönelik metin ve hatırlatma gönder butonu (bildirimle) ekleyin.
- **Efor:** M (Bulgu 1 ile birlikte)

### 8. GET ucunda okumada yazma + ardışık 7 sorgu + eşzamanlılık 500'ü
- **Önem:** düşük · **Kategori:** mimari / performans
- **Kanıt:** `route.ts:34-45` (yoksa `create`, yarışta `ReferralCode.userId @unique` ihlali → genel 500), `:48-96` (findUnique, findMany, findUnique, count, count, user.findUnique, getPointsMatrix sırayla); `tx: any` `route.ts:201`, `app/api/auth/register/route.ts:111`; `maxUsage`/limit kontrolleri tx dışında (`route.ts:165-190`).
- **Sorun:** Neon üzerinde her sorgu ~ağ turu ekler; kod üretimi yarışında kullanıcı ilk ziyarette hata görebilir (dev'de StrictMode ile kolay tetiklenir). Kod alfabesi `-`/`_` içerir ve büyük harfe çevrilince `O/0`, `I/1` karışır.
- **Profesyonel öneri:** Kod üretimini `upsert` (veya `create` + P2002'de yeniden oku) ile idempotent yapın; kodu kayıt anında üretin. Bağımsız sorguları `Promise.all` ile paralelleyin. Kod için `customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 8)` kullanın. `tx: any` yerine `Prisma.TransactionClient`.
- **Efor:** S

### 9. Davet listesi 20 kayıtla sınırlı, sayfalama yok; davet edilenlerin tam adı ve fotoğrafı görünüyor
- **Önem:** düşük · **Kategori:** işlevsellik / gizlilik
- **Kanıt:** `route.ts:48-57` (`take: 20`), `page.tsx:390-418`.
- **Sorun:** Güçlü davetçiler geçmişlerini göremez. Ayrıca davet eden, davet edilenin profilindeki tam ad + görseli görür; KVKK açısından "ad + soyadının baş harfi" yeterli olur (doğrulanmadı: kayıt sözleşmesinde bu paylaşım belirtilmiş mi).
- **Profesyonel öneri:** İmleç tabanlı sayfalama (`cursor`) + "Daha fazla" butonu; adları `Ayşe K.` biçiminde maskeleyen sunucu tarafı seçim.
- **Efor:** S

### 10. Erişilebilirlik ve mobil cilası eksik
- **Önem:** düşük · **Kategori:** erişilebilirlik / mobil
- **Kanıt:** Etiketsiz alanlar `page.tsx:193-197`, `:238-243`; ilerleme çubuğu ARIA'sız `:339-344`; ham `<button>` tipsiz `:304`; koyu tema varyantı olmayan sarı metinler `:323`, `:363`; 3 sütun + `text-[10px]` `:268`, `:283`.
- **Sorun:** Ekran okuyucu kullanıcısı kodu ve ilerlemeyi anlamlandıramaz; küçük ekranda istatistik etiketleri okunaksız.
- **Profesyonel öneri:** `aria-label`/`<Label>` ekleyin, ilerlemeye `role="progressbar" aria-valuemin/max/now`, kademe çiplerine durum metni (`sr-only` "alındı"/"hazır"/"kilitli"). İstatistikleri mobilde yatay kaydırmalı "stat şeridi" veya 2+1 düzenine geçirin. Sarı tonlara `dark:text-yellow-400`.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Nitelikli davet ve adım takibi** (Revolut/Monzo: arkadaşın kartı aktive edince ödül; davet satırında ilerleme). Burada ödül anında, sahte hesaba açık.
2. **QR davet kartı ve kişisel davet bağlantısı** — bir QR ürününde, yüz yüze "okut ve katıl" en doğal kanal; Starbucks/Duolingo kişisel link + paylaşılabilir görsel kart sunar.
3. **Kademe ulaşıldı bildirimi ve kutlama anı** — Duolingo tarzı tam ekran "kademe açıldı" animasyonu + push; şu an kullanıcı sayfaya gelmezse ödülünü bilmez.
4. **Davet sıralaması / sosyal kanıt** (Duolingo lig, Robinhood "X kişi bu ay davet etti") — mevcut lig/turnuva sistemine "en çok davet eden" ekseni bağlanabilir.
5. **Davet edilen arkadaşa hatırlatma ("dürt")** ve kişiselleştirilmiş davet mesajı (kanal kısayolları: WhatsApp, Instagram hikâye görseli).
6. **Rozet bağlantısı** — `lib/surprise-badges.ts:57,137` davet sayısını rozet koşulunda kullanıyor ama sayfa bundan hiç bahsetmiyor; "3 davette X rozeti" hedefi gösterilmeli.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Arkadaşını getir, birlikte kazanın" tek bir kahraman eylem etrafında toplanmalı; kullanıcı sayfaya girdiğinde 2 saniyede (1) ne kazanacağını, (2) bir sonraki hedefe ne kadar kaldığını, (3) tek dokunuşla paylaşmayı görmeli.

**Yerleşim (mobil öncelikli):**
1. **Davet kahraman kartı:** Sol tarafta büyük "Sen +1000 · Arkadaşın +500" teklifi, sağda (mobilde altta) kişisel QR + kısa kod; altında tam genişlik "Bağlantıyı paylaş" birincil butonu ve küçük "Kodu kopyala" ikincil eylem. QR, `qrcode` kütüphanesiyle istemcide üretilir (projede zaten kullanılıyor — perf notu: landing'de dinamik import ediliyor).
2. **Kademe yolu (hedef odaklı):** Yatay bir "yol" üzerinde 3 → 5 → 10 → 25 durakları; mevcut konum işaretçisi, bir sonraki durakta "2 davet daha → +400". Talep edilebilir durak parlar ve dokunulunca talep edilir.
3. **Davetlerim:** Her satırda arkadaş (maskelenmiş ad) + adım göstergesi (Kayıt → Doğrulama → İlk QR) + "Hatırlat" butonu; sayfalama.
4. **Kazancım özeti:** Tek satırlık şerit — davet başı kazanç, kademe kazancı, toplam (doğru aggregate ile).
5. **Kod uygula:** Yalnız kayıttan sonraki pencerede, sayfanın en altında katlanabilir küçük bir alan; pencere dışında hiç gösterilmez.

**Motion/3D (ölçülü):** Kademe talebinde mevcut ödül kutusu/konfeti dilini yeniden kullanan kısa (≤1.2 sn) bir kutlama; puan sayacının yukarı sayması; kademe yolunda işaretçinin yaylı ilerlemesi. 3B gerekmez — bu sayfa bir "sosyal eylem" sayfası, ağır three.js sahnesi paylaşmayı geciktirir. Tümü global `reducedMotion="user"` altında statik geçişe düşer.

**Veri/API değişiklikleri:**
- `lib/referral-service.ts`: `attachReferral(tx, referredId, code)` (yalnız ilişki, `PENDING`) ve `qualifyReferral(tx, referredId)` (limitler + atomik ödül + `points_credited` + bildirim) — kayıt, OAuth ve POST yolları bunu çağırır; ilk nitelikli olay (doğrulanmış e-posta + ilk QR okutma/geri bildirim) `qualifyReferral`'ı tetikler.
- `GET /api/referral`: `Promise.all`, doğru `aggregate` toplamları, imleç sayfalama, maskelenmiş adlar, `canApplyCode` + `applyWindowEndsAt` alanları, i18n anahtarlı kademe etiketleri.
- Hata sözleşmesi: `{ errorKey, params }`.
- Kademe ulaşıldığında (nitelikli olay içinde) bildirim/push üretimi; talep yine kullanıcı eylemiyle (kutlama anı için) ama hatırlatmalı.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/campaigns`** (`app/customer/campaigns/page.tsx:190-215`) yalnız bu sayfaya yönlendiren bir "Davet et" kartı içeriyor — çakışma değil, doğru bir giriş noktası; korunmalı ama oradaki metin buradaki gerçek ödül değerlerini (puan matrisi) göstermeli.
- **`/customer/squads`** (`app/customer/squads/page.tsx:102-103`) ayrı bir "Davet Kodu" (ekip davet kodu) kavramı kullanıyor. Kullanıcı açısından iki farklı "davet kodu" karışıklık yaratır; adlandırma ayrıştırılmalı ("Ekip katılım kodu" vs "Arkadaş davet kodu").
- **Birleştirme:** Sayfa kendi başına kalmalı (sosyal büyüme döngüsünün tek evi), fakat kademe ve kazanç verisi `progress-hub` / ana panelde küçük bir "sonraki davet kademesi" widget'ı olarak özetlenebilir. `/admin/referrals` (`app/api/admin/referrals/route.ts`) bu sayfanın yönetim tarafı; nitelikli davet modeline geçişte admin'e "şüpheli davet zinciri" görünümü eklenmeli.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı; kod değiştirilmedi, veritabanına dokunulmadı. Okunan dosyalar: `app/api/auth/register/route.ts`, `app/api/referral/route.ts`, `app/customer/referral/page.tsx`, `lib/auth.ts`, `lib/points-rules.ts`, `lib/points-wallet.ts`, `lib/points-velocity.ts`, `lib/points-caps.ts`, `lib/referral-milestones.ts`, `lib/innovation-config.ts`, `lib/rate-limit.ts`, `lib/validations.ts`, `prisma/schema.prisma` (Referral / ReferralCode), `messages/tr.json`.

### 1. Davet bağlantısıyla kayıt, doğrulanmamış hesaplar için davet edene anında puan veriyor — **DOĞRULANDI (KRİTİK)**

- `app/api/auth/register/route.ts:57-64` kullanıcıyı `emailVerified: null` ile oluşturuyor; `:101-145` aynı istekte, e-posta doğrulamasını beklemeden `Referral` kaydını `status: 'COMPLETED'` yazıp `creditPointsAndXp` ile hem yeni hesaba (`referredPoints`, varsayılan 500) hem davet edene (`referrerPoints`, varsayılan 1000 — `lib/points-rules.ts:64-67`) puan basıyor.
- Bu yolda `assertModuleEnabled('referrals')` yok (karşılaştır: `app/api/referral/route.ts:120`), `maxInvitesPerReferrerLifetime` (100) ve `maxRedemptionsPerReferralCodePerMonth` (30) kontrolleri yok (karşılaştır: `app/api/referral/route.ts:164-185`). Yalnız `ReferralCode.isActive` ve `maxUsage` (varsayılan `null` = sınırsız, `schema.prisma:1747`) bakılıyor.
- `lib/auth.ts:165-169` doğrulanmamış hesabın girişini engelliyor, ama puan davet edenin hesabına çoktan yazılmış oluyor; gerçek posta kutusu bile gerekmiyor (`registerSchema` yalnız sözdizimsel `.email()` — `lib/validations.ts:26-29`). CAPTCHA yok.
- Tek fren `checkRateLimitDb('register:<ip>', 5, 60_000)` (`route.ts:13-14`) — IP başına dakikada 5 kayıt. `lib/points-velocity.ts:8-33` yalnız "şüpheli" bayrağı hesaplıyor, krediyi engellemiyor/geri almıyor.
- **Yeniden üretim:** Giriş yapmış saldırgan A, `/customer/referral`'dan kodunu alır. Script, `POST /api/auth/register` gövdesine `{name, email: "x<n>@ornek.tld", password, confirmPassword, referralCode: "<A_KODU>"}` gönderir (dakikada 5, IP rotasyonu ile çarpılabilir). Her istek A'ya +1000 puan yazar; 25 sahte kayıttan sonra A `/customer/referral`'da "Ödülü al" ile `PUT /api/referral` kademelerini (200+400+1000+3000 = 4600) de açar, çünkü `completedCount` sahte kayıtları da `COMPLETED` sayar (`route.ts:301-303`). Tek IP ile saatte ~300 kayıt ≈ 300.000 puan; `referrals` modülü kapalıyken de çalışır.
- Not: Öneri yerinde — ödül nitelikli olaya (doğrulanmış e-posta + ilk aktivite) bağlanmalı; kayıtta yalnız `PENDING` ilişki kurulmalı; limitler ve modül kapısı tek bir servis fonksiyonunda (`qualifyReferral`) toplanıp hem kayıt hem POST yolundan çağrılmalı.

### 2. Mevcut hesaplar karşılıklı (A↔B) davet kodu uygulayarak puan basabiliyor — **DOĞRULANDI (YÜKSEK)**

- `app/api/referral/route.ts:137-190` yalnız "zaten davet edilmiş misin" (`referredId` unique — `schema.prisma:1725`), "kendi kodun mu", aylık/ömür limiti ve `maxUsage` kontrol ediyor. Ters yönlü ilişki (`referrerId = me AND referredId = kodSahibi`), hesap yaşı veya "kayıttan sonra X gün içinde" penceresi kontrolü yok. Şemada çift yönü engelleyen bir kısıt da yok (`schema.prisma:1722-1740`).
- UI, davet edilmemiş her kullanıcıya kod uygulama kartını gösteriyor (`app/customer/referral/page.tsx:228`).
- **Yeniden üretim:** Kodsuz kayıt olmuş, doğrulanmış iki hesap A ve B. A, B'nin kodunu uygular → A +500, B +1000. B henüz kimse tarafından davet edilmediği için A'nın kodunu uygular → B +500, A +1000. Yeni kullanıcı gelmeden 3000 puan oluşur. Ayrıca bu sayımlar kademe sayacına da girer.
- Kapsam notu: Her hesap yalnız bir kez "davet edilen" olabildiği için sınır hesap başına 1500 puandır ve her hesap doğrulanmış e-posta gerektirir; bu yüzden 1. bulgudan daha zayıf ama gerçek bir puan basma yolu. Ek olarak "uygulama penceresi" olmadığı için aylarca aktif bir kullanıcı da sonradan herhangi bir koda bağlanabilir — bu da davetin "yeni kullanıcı kazanımı" anlamını boşaltır. Düzeltme: ters yön kontrolü, kayıttan sonra kısa bir uygulama penceresi (ör. 7 gün) ve ödülün nitelikli olaya bağlanması.

### 3. "Kazanılan Puan" istatistiği yanlış — **DOĞRULANDI (DÜŞÜK; KRİTİK/YÜKSEK değil)**

- `app/api/referral/route.ts:48-57` listeyi `take: 20` ile çekiyor; `:78` `totalPointsEarned` bu 20 kaydın `pointsEarned` toplamı. `:74` yorumu "gerçek toplam kullan" dese de kod bunu yapmıyor (oysa `totalReferrals` ve `completedReferrals` gerçek `count` ile hesaplanıyor — `:70-77`).
- **Yeniden üretim:** 21+ davet yapmış kullanıcıda kart (`page.tsx:272`, etiket "Kazanılan Puan" — `messages/tr.json:3396`) en eski davetlerin puanını göstermez; ör. 25 davette 25.000 yerine 20.000.
- Kademe bonuslarının hariç olması etiket tanımına bağlı bir ürün kararıdır (kademe kredileri `analyticsEvent` `category: 'referral_milestone'` olarak ayrı tutuluyor — `route.ts:329-334`); hata sayılmaz ama etiket "Davetlerden kazanılan" diye netleştirilmeli ya da `points_credited` (referral + referral_milestone, role=referrer) toplamı gösterilmeli.
- Etki yalnız görüntüleme; veri/puan bütünlüğünü bozmaz. Düzeltme: `prisma.referral.aggregate({ where: { referrerId }, _sum: { pointsEarned: true } })`.
