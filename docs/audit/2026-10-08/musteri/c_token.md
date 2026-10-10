# /c/[token]

**Amaç:** Fiziksel QRateX kartının (ve aynı QR'ın basıldığı Apple/Google Wallet kartının) giriş noktası. Kartı okutan kişiye kartın durumunu gösterir. Kart kullanılmamışsa (`UNUSED`) giriş yapmış müşterinin kartı kendi hesabına tek seferde bağlamasını (aktivasyon) sağlar. Kart aktifse sahibini gösterir ve sahibini kendi paneline yönlendirir.

**Genel puan:** 5.5 / 10 · **Karar:** **yeniden tasarla.** Rota ve temel iş kuralı doğru, korunmalı. Ancak kayıt hunisi kırık, yetim kart çıkmazı var, kişisel veri sızıyor ve aktivasyon anı Starbucks/Duolingo seviyesinin çok altında. Rota, rol farkındalığı olan bir "kart deep-link yönlendiricisi" olarak yeniden kurgulanmalı.

Kapsam: `app/c/[token]/page.tsx` (445 satır, tek dosya, `'use client'`), `app/c/` altında layout/metadata/loading/error dosyası yok. Bağlı API'ler: `GET /api/cards/[token]`, `POST /api/cards/[token]/activate`. Prisma modelleri: `PhysicalCard`, `CardAuditLog`, `User`. Çapraz etkiler için şunlar da okundu: `app/(auth)/auth/register/page.tsx`, `app/(auth)/auth/login/page.tsx`, `app/customer/my-card/page.tsx`, `app/customer/scan/page.tsx`, `app/dealer/scan/page.tsx`, `app/api/dealer/cards/scan/[token]/route.ts`, `app/api/admin/cards/[id]/route.ts`, `app/api/admin/cards/[id]/unassign/route.ts`, `app/api/user/delete-account/route.ts`, `lib/utils.ts` (`generateCardToken`), `lib/wallet.ts`, `proxy.ts`, `next.config` başlıkları, `components/providers.tsx`, `app/globals.css`, `app/robots.ts`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | Mutlu yol (giriş yapmış müşteri, kullanılmamış kart) çalışıyor. Ama "Kayıt Ol" yolu kartı unutuyor, yetim kartlar çıkmaza giriyor, aktivasyonda TOCTOU yarışı var. |
| UX | 5/10 | Akış anlaşılır ama sıradan. Başarı anında tam ekran spinner yanıp sönüyor, kutlama ve ödül yok. Yanlış rolde ve başkasının kartında kullanıcıya yapacak anlamlı bir şey sunulmuyor. |
| Görsel | 5/10 | Genel bir shadcn `Card` ve bulanık lekelerden ibaret. Fiziksel kartın görseli yok, emoji ile lucide ikonları karışık, açık temada uyarı metinleri soluk. |
| Mimari | 5/10 | Tamamen istemci tarafında fetch yapıyor, i18n yok. Aktivasyon `requireAuth` yerine çıplak `getServerSession` kullanıyor. QR alan adı iki dosyada sabit kodlu. GET ucu gereğinden fazla veri dönüyor. |
| Performans | 7/10 | Sayfa küçük ve iki istek paralel gidiyor. Yine de RSC ile spinner'sız açılabilecekken hidrasyon → session → kart şelalesi var. |
| Erişilebilirlik + mobil | 5/10 | Mobil yerleşim düzgün (`sm:` kırılımları, `w-full` butonlar). Açık temada `text-*-400` kontrastı WCAG'ı geçmiyor, durum değişimleri için `aria-live` yok, JS ile yürüyen sonsuz animasyon azaltılmış hareket tercihine uymuyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | URL'den token okuma | ÇALIŞIYOR | `page.tsx:43-44` | `params.token as string` ile tip zorlanıyor, doğrulama yok. Sunucu 404 dönüyor, sorun değil. |
| 2 | Kart bilgisini getirme (`GET /api/cards/[token]`) | ÇALIŞIYOR | `page.tsx:54-80`, `api/cards/[token]/route.ts:22-70` | `useEffect` deps listesinde `fetchCardInfo` yok (lint uyarısı), döngü yok. |
| 3 | Yükleniyor durumu (tam ekran spinner) | KISMİ | `page.tsx:126-139` | İlk yüklemede doğru çalışıyor. Aktivasyon sonrası yeniden yüklemede de tetikleniyor ve başarı anını bölüyor (bkz. B6). |
| 4 | Hata: kart bulunamadı | ÇALIŞIYOR | `page.tsx:160`, `route.ts:41-44` | |
| 5 | Hata: bloklu kart | KISMİ | `page.tsx:153-161`, `route.ts:47-54` | API `reason` döndürüyor ama sayfa göstermiyor. Kart sahibine bile neden ya da destek yolu sunulmuyor. |
| 6 | Hata: genel / ağ / 500 | KISMİ | `page.tsx:75-77, 162` | Başlık yalnızca "Hata", "Tekrar dene" butonu yok, tek çıkış ana sayfa. |
| 7 | "Ana Sayfaya Dön" | ÇALIŞIYOR | `page.tsx:169-171` | |
| 8 | Aktif kart: sahip adı ve avatarı | ÇALIŞIYOR (güvenlik sorunu) | `page.tsx:206-226`, `route.ts:31-37, 64-68` | Kişisel veri herkese açık (bkz. B4). |
| 9 | Aktif kart: "kendi kartım" ayrımı | ÇALIŞIYOR | `page.tsx:181, 222, 228-234` | |
| 10 | "Kartımı Görüntüle" → `/customer/my-card` | ÇALIŞIYOR | `page.tsx:240-245` | Rota mevcut. |
| 11 | "Tüketim Geçmişim" → `/customer/consumptions` | ÇALIŞIYOR | `page.tsx:246-255` | Rota mevcut. |
| 12 | Başkasının kartı, oturum yok: Giriş Yap / Kayıt Ol | KISMİ | `page.tsx:259-275` | Giriş yapmak bu kartla ilgili hiçbir şeyi değiştirmiyor, CTA amaçsız. Kayıt yolu kırık (#17). |
| 13 | Başkasının kartı, oturum var: "Panelime Git" | ÇALIŞIYOR | `page.tsx:277-279` | Bayi/personel için `proxy.ts:62-71` uygun panele yönlendiriyor. |
| 14 | Aktivasyon kahraman ikonu (nabız gölgesi) | ÇALIŞIYOR | `page.tsx:305-317` | Sonsuz JS animasyonu (bkz. B13). |
| 15 | Fayda listesi (3 statik madde, sırayla giriş animasyonu) | ÇALIŞIYOR | `page.tsx:326-345` | Statik metin, kişisel değil. Hoş geldin ödülü ya da gerçek değer önerisi yok. |
| 16 | Oturum yok: "Giriş Yap" (`signIn` + `callbackUrl`) | ÇALIŞIYOR | `page.tsx:361-368`, `lib/auth.ts:64-65`, `login/page.tsx:125-126` | Girişten sonra `/c/[token]`'a dönüyor. |
| 17 | Oturum yok: "Kayıt Ol" (`/auth/register?callbackUrl=`) | **BOZUK** | `page.tsx:270, 370` → `register/page.tsx:137, 153-156` | Kayıt sayfası `callbackUrl`'ı hiç okumuyor, kullanıcı `/customer`'a düşüyor ve kart unutuluyor (bkz. B1). |
| 18 | Yanlış rol uyarısı (müşteri dışı hesap) | KISMİ | `page.tsx:377-388` | Hesap değiştirme/çıkış butonu yok. Bayi/personel tarama ekranına yönlendirilmiyor (bkz. B8). |
| 19 | Hazır durumu: "Merhaba, {ad}!" | ÇALIŞIYOR | `page.tsx:389-411` | |
| 20 | "Kartı Aktive Et" butonu + yükleniyor durumu | ÇALIŞIYOR | `page.tsx:416-434` | Çift tıklamaya karşı `disabled` var. |
| 21 | İstemci tarafı oturum/rol ön kontrolü | ÇALIŞIYOR | `page.tsx:83-91` | Sunucu da aynı kontrolü yapıyor (`activate/route.ts:21-31`). |
| 22 | Aktivasyonun atomikliği | KISMİ | `activate/route.ts:40-80` | Transaction var ama oku-sonra-yaz koşulsuz yapılıyor, TOCTOU yarışı mümkün (bkz. B3). |
| 23 | Aktivasyon audit log'u | ÇALIŞIYOR | `activate/route.ts:91-102` | IP bilgisi ham `x-forwarded-for` (virgüllü liste, taklit edilebilir). |
| 24 | `ALREADY_ACTIVATED` olunca kartı yeniden yükleme | ÇALIŞIYOR | `page.tsx:103-105` | |
| 25 | `ALREADY_YOURS` kodu | KISMİ | `page.tsx:101-106`, `activate/route.ts:65-66` | Yalnızca toast gösteriliyor. Ne yeniden yükleme ne yönlendirme yapılıyor, bayat ekran kalıyor. |
| 26 | Başarı: toast → yeniden yükleme → 1,5 sn sonra yönlendirme | KISMİ | `page.tsx:109-117, 62` | Spinner yanıp sönüyor, kutlama ve ödül yok (bkz. B6). |
| 27 | Yetim kart (`ACTIVATED` + `customer=null`) | **BOZUK** | `page.tsx:180`, `schema.prisma:1522`, `delete-account/route.ts:39`, `activate/route.ts:63-68` | Sonsuz "başka kullanıcıya bağlı" döngüsü (bkz. B2). |
| 28 | "Powered by QRateX" alt bilgisi | ÇALIŞIYOR | `page.tsx:439-441` | Yalnızca aktivasyon görünümünde var. Diğer durumlarda yok, tutarsız. |
| 29 | Sayfa başlığı / metadata / noindex | EKSİK | `app/c/` altında layout yok, `robots.ts:20` `/c/`'yi kapsamıyor | Sekme başlığı genel kök başlık. Token içeren URL'ler dizinlenmeye açık (doğrulanmadı: Google'a gerçekten sızıp sızmadığı). |
| 30 | Çoklu dil (i18n) | EKSİK | Tüm metinler sabit Türkçe. Kardeş `dealer/scan` ve `customer/scan` `useAppT` kullanıyor. | |
| 31 | Azaltılmış hareket | KISMİ | `globals.css:801-807` CSS `animate-pulse`'u durduruyor. `providers.tsx:232` `MotionConfig reducedMotion="user"` | JS `boxShadow` döngüsü (`page.tsx:307-314`) transform olmadığı için durmuyor. |
| 32 | Hız sınırı (rate limit) | EKSİK | `route.ts`, `activate/route.ts` | Token 21 karakter ve ~121 bit, kaba kuvvet pratik değil. Yine de iki uç tamamen sınırsız. |
| 33 | Token-replay / oturum güvenlik kontrolü | EKSİK | `activate/route.ts:19` `getServerSession`, `lib/api-auth.ts:52-79` | Kod tabanındaki standart `requireAuth` atlanmış. |
| 34 | Aktivasyon hoş geldin ödülü (puan/XP/rozet) | EKSİK | `activate/route.ts` içinde puan/bildirim yok | Starbucks kayıtta yıldız veriyor. |
| 35 | Aktivasyondan hemen sonra Wallet'a ekleme | EKSİK | Wallet ucu var (`/api/wallet/apple`, `/api/wallet/google`, `my-card/page.tsx:416, 445`) ama burada sunulmuyor. | |
| 36 | Kayıp/bulunan kart bildirimi | EKSİK | `page.tsx:257-281` | Başkasının kartını bulan biri için akış yok. |
| 37 | Uygulama içi tarayıcıdan bu sayfaya ulaşma | **BOZUK** (sayfalar arası) | `my-card/page.tsx:563-567` "QR tara" → `customer/scan/page.tsx:23-29` | Tarayıcı yalnızca `/feedback/` desenini tanıyor, kart QR'ını reddediyor (bkz. B5). |
| 38 | Kart görseli (fiziksel kartın dijital ikizi) | EKSİK | `page.tsx:305-317` | Yalnızca `CreditCard` ikonu var. `my-card`'da `LegendDigitalCard` bileşeni mevcut ama burada kullanılmıyor. |
| 39 | Durum değişiminde ekran okuyucu duyurusu | EKSİK | `page.tsx:348-412` | `AnimatePresence` blokları `role="status"` / `aria-live` taşımıyor. |
| 40 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:128, 151, 360, 418` | Tek sütun, tam genişlik butonlar, dokunma hedefleri 40-48 px. |
| 41 | Açık tema kontrastı (uyarı/başarı metinleri) | **BOZUK** (a11y) | `page.tsx:230, 357, 385, 399, 402, 405` | `text-emerald-400` / `text-amber-400` / `text-red-400` için `dark:` ayrımı yok. |
| 42 | Bayi/personel kamera ile okuttuğunda rol bazlı yönlendirme | EKSİK | `page.tsx:377-388`, `dealer/scan/page.tsx:162-165` | Bayi uygulama içi tarayıcıda `/c/` desenini tanıyor ama telefon kamerasıyla gelirse çıkmaz bir ekran görüyor. |
| 43 | Boş `CardFooter` (oturum yokken) | KISMİ (kozmetik) | `page.tsx:415-435` | Koşul sağlanmayınca alt boşluk kalıyor. |

**Sayım:** ÇALIŞIYOR 19 · KISMİ 10 · BOZUK 4 · SAHTE 0 · EKSİK 10 (toplam 43).

---

## Bulgular

### B1 — YÜKSEK · İşlevsellik / Dönüşüm · "Kayıt Ol" kartı unutuyor, kayıt hunisi kırık
- **Kanıt:** `app/c/[token]/page.tsx:270` ve `:370` → `/auth/register?callbackUrl=/c/${token}`. `app/(auth)/auth/register/page.tsx:57-60` yalnızca `ref` parametresini okuyor. Başarılı kayıtta `:137` `router.push(selectedRole === 'DEALER' ? '/dealer' : '/customer')` çalışıyor. OAuth yolu `:153-156` `next=/customer` sabiti kullanıyor. E-posta doğrulama gerekirse (`:117-124`) de dönüş adresi kayboluyor.
- **Sorun:** Fiziksel kartın asıl hedef kitlesi henüz hesabı olmayan kişi. Bu kişi tam olarak bu yolu kullanıyor: kartı okutuyor, "Kayıt Ol"a basıyor, hesabını açıyor ve kartın olmadığı `/customer` paneline düşüyor. Kart aktive edilmeden kalıyor. Bayi kartı taradığında `CARD_NOT_ACTIVATED` alıyor (`dealer/cards/scan/[token]/route.ts`) ve tüketim puanı yazılamıyor. Sessiz bir dönüşüm kaybı.
- **Öneri:** Kayıt sayfası `callbackUrl`'ı okumalı. `login/page.tsx:267`'deki "yalnızca `/` ile başlayan yolu kabul et" kuralıyla doğrulanıp üç dala da taşınmalı: credentials sonrası `router.push`, OAuth için `/auth/complete?next=`, e-posta doğrulama linki için de bekleyen hedef. Daha sağlam bir çözüm: `/c/[token]` "bekleyen kart" bilgisini kısa ömürlü, imzalı bir cookie'ye (`pending_card=<token>`, 30 dk) yazsın. `/auth/complete` ve müşteri panelinin ilk açılışı bu cookie'yi görürse "Kartını bağlamayı bitir" modalını açsın. Böylece kullanıcı hangi yoldan gelirse gelsin (OAuth, magic link, e-posta doğrulama sonrası farklı cihaz) kart kaybolmaz. Ölçüm için PostHog'a `card_activation_started` / `card_activation_completed` olayları eklenmeli.
- **Efor:** S (callbackUrl) / M (pending-card cookie + modal).

### B2 — YÜKSEK · Veri bütünlüğü · Yetim kart (hesap silinince) kalıcı çıkmaza giriyor
- **Kanıt:** `prisma/schema.prisma:1522` `customer User? ... onDelete: SetNull`. `app/api/user/delete-account/route.ts:39` `prisma.user.delete` kartın `status`'una dokunmuyor. Sonuçta kart `ACTIVATED` durumunda ama `customerId=null`. Sayfa `page.tsx:180` `cardInfo?.isActivated && cardInfo.customer` koşulu sağlanmadığı için aktivasyon akışını gösteriyor. Butona basılınca `activate/route.ts:63-68` `status === 'ACTIVATED'` ve `customerId (null) !== user.id` olduğundan `ALREADY_ACTIVATED` → "Bu kart başka bir kullanıcıya bağlı" mesajı geliyor. `page.tsx:103-105` yeniden yüklüyor, aynı ekran tekrar çıkıyor ve döngü sonsuz. Admin tarafında `unassign/route.ts:46` `!card.customer` koşulunda 400 "zaten atanmamış" dönüyor, kurtarma yapamıyor. Yalnızca `admin/cards/[id]/route.ts:115-126` PATCH ile `status: 'UNUSED'` elle verilerek çözülebiliyor (`customerId`'yi temizlemiyor, `updateData: any`).
- **Sorun:** Hesabını silip yeniden kaydolan ya da kartını başkasına veren kullanıcı kartı bir daha kullanamıyor. Ekran yanlış ve kendi içinde çelişkili bilgi veriyor ("aktive et" diyor, sonra "başkasına bağlı" diyor).
- **Öneri:** (1) Hesap silme transaction'ı içinde kullanıcının kartlarını `status: 'UNUSED', customerId: null, activatedAt: null` yapıp `CardAuditLog`'a `RELEASED_ON_ACCOUNT_DELETE` yazsın. (2) Mevcut yetim kartlar için tek seferlik bir düzeltme script'i yazılsın (`status='ACTIVATED' AND customerId IS NULL`). (3) GET ucu ve sayfa bu durumu açıkça ayırsın: `isActivated` yerine `state: 'claimable' | 'mine' | 'taken' | 'blocked'` gibi tek bir türetilmiş alan dönsün. Böylece istemci kural tekrarlamaz. (4) `unassign` ucu yetim kartı da serbest bırakabilsin.
- **Efor:** S-M.

### B3 — ORTA · Veri bütünlüğü / Yarış koşulu · Aktivasyonda TOCTOU
- **Kanıt:** `app/api/cards/[token]/activate/route.ts:42-51` `findUnique` ile durum okunuyor, `:72-88` ise `update({ where: { id: card.id } })` ile koşulsuz yazılıyor. Prisma interaktif transaction'ı Postgres'te varsayılan `READ COMMITTED` ile çalışıyor ve satır kilidi almıyor.
- **Sorun:** İki kullanıcı aynı kullanılmamış kartı aynı anda aktive ederse (token fotoğraflanmış, paylaşılmış ya da çift sekme açılmış olabilir) iki istek de `UNUSED` görür ve ikisi de yazar. Son yazan kazanır, iki kullanıcı da "başarıyla aktive edildi" mesajı alır, audit log'da iki `ACTIVATED` kaydı oluşur. Olasılık düşük ama sonuç sessiz ve geri izlemesi zor.
- **Öneri:** Koşullu yazma kullanılmalı: `tx.physicalCard.updateMany({ where: { id, status: 'UNUSED' }, data: {...} })`. Ardından `count === 0` ise kart yeniden okunup `ALREADY_YOURS` / `ALREADY_ACTIVATED` ayrımı yapılmalı. Bu, projedeki "atomik tek seferlik kredi" deseniyle de aynı yaklaşım.
- **Efor:** S.

### B4 — YÜKSEK · Güvenlik / KVKK · Herkese açık GET ucu kart sahibinin adını, fotoğrafını ve kullanıcı id'sini veriyor
- **Kanıt:** `app/api/cards/[token]/route.ts:31-37` ve `:64-68` her istekte `customer.id`, `customer.name` (tam ad) ve `customer.image` dönüyor; ucun oturum kontrolü yok. `:52` iç not olan `blockReason` da dönüyor. Aynı QR Wallet kartında (`lib/wallet.ts:51, 60, 305`) ve "paylaş" akışında herkese gösterilmek üzere dağıtılıyor (`my-card/page.tsx:389-395` "QRateX dijital kartımı inceleyin!").
- **Sorun:** Kasada gösterilen Wallet kartını telefonla okutan herhangi biri ya da paylaşılan linki açan biri kart sahibinin tam adını ve profil fotoğrafını görüyor. Bu, veri minimizasyonu ilkesine aykırı (KVKK md.4). `customer.id`'nin istemcide tek kullanımı `isOwnCard` karşılaştırması (`page.tsx:181`) ve bu karşılaştırma sunucuda yapılabilir.
- **Öneri:** GET ucu, oturumdaki kullanıcıya göre görünüm üretmeli. Sahibe tam ad ve avatar dönmeli. Diğer herkese yalnızca `state: 'taken'` ve maskelenmiş bir ifade (ör. "F. U." ya da hiç isim) dönmeli. `isMine: boolean` sunucuda hesaplanmalı, `customer.id` istemciye hiç gitmemeli. `blockReason` yalnızca sahibe ve kullanıcıya dönük bir mesaj olarak verilmeli; admin notu dışarı çıkmamalı.
- **Efor:** S.

### B5 — ORTA · Bilgi mimarisi / Sayfalar arası · Uygulama içinden kart ekleme yolu kopuk
- **Kanıt:** `app/customer/my-card/page.tsx:553-567` boş durumda "İşletmedeki QR ile kartını etkinleştirerek başla" yazıp "QR tara" ile `/customer/scan`'e götürüyor. `app/customer/scan/page.tsx:23-29` `extractCodeFromDecoded` yalnızca `/feedback/` desenini tanıyor, kart URL'sinde `t.slice(-8)` döndürüyor ve ardından `:31-37` `qr-codes/public` 404 veriyor, sonuç "bulunamadı" hatası.
- **Sorun:** Uygulamadaki müşteri kartını uygulama içinden ekleyemiyor. Önerilen yol hata veriyor ve tek çalışan yol telefonun kendi kamerası.
- **Öneri:** `customer/scan` tek bir "evrensel QR çözücü" haline gelmeli: `/c/<token>` → `/c/<token>`, `/feedback/<code>` → feedback, düz token → kart sorgusu. Aynı çözücü `dealer/scan/page.tsx:162-170` ile paylaşılan bir `lib/qr-resolve.ts` modülüne taşınmalı. `my-card` boş durumuna ayrıca "Kart numarasını elle gir" alanı eklenmeli (kartın arkasındaki kısa kod).
- **Efor:** M.

### B6 — ORTA · UX / Oyunlaştırma · Aktivasyon anı düz: spinner yanıp sönüyor, kutlama ve ödül yok
- **Kanıt:** `page.tsx:109` toast → `:112` `await fetchCardInfo()`. Bu çağrı `:62` `setLoading(true)` yaptığı için `:126-139` tam ekran "Kart bilgisi yükleniyor..." gösteriyor, ardından "Kart Aktif" kartı geliyor, `:115-117` 1,5 sn sonra da yönlendirme oluyor. API (`activate/route.ts`) puan, rozet ya da bildirim üretmiyor.
- **Sorun:** Kullanıcının markayla fiziksel temasının en duygusal anı (kartı "benim" yapmak) bir toast, bir spinner ve bir sayfa değişimine sıkışıyor. Kıyas: Starbucks kart kaydında bonus yıldız ve animasyonlu kart sunuyor, Duolingo ilk görev tamamlanınca kutlama ekranı gösteriyor.
- **Öneri:** Başarılı yanıtı iyimser biçimde yerel duruma uygulamak gerekiyor; yeniden yükleme yapılmamalı. Sonra tam ekran bir "Kart senin" sahnesi gösterilmeli: kart görseli (`LegendDigitalCard` yeniden kullanılabilir) ön yüzden arka yüze döner, sahibin adı kartın üstünde belirir, tek seferlik konfeti ya da parıltı oynar (azaltılmış harekette statik). Altında üç net sonraki adım yer almalı: "Wallet'a ekle" (ucu zaten var), "İlk yorumunu yap: +X puan", "Kartıma git". Kullanıcıyı otomatik yönlendirmek yerine seçim kendisine bırakılmalı. Ödül tarafında, ekonomi değişmezlerine uygun biçimde (atomik, tek seferlik, `points_credited` görünür) bir `CARD_ACTIVATION_BONUS` kredisi aktivasyon transaction'ına eklenebilir. Bu bir ürün kararıdır, tutarı yönetimden ayarlanabilir olmalı.
- **Efor:** M.

### B7 — ORTA · Erişilebilirlik · Açık temada uyarı ve başarı metinleri okunmuyor
- **Kanıt:** `page.tsx:230` `text-emerald-400`, `:357` `text-amber-400`, `:385` `text-red-400`, `:399, 402, 405` `text-emerald-400` / `text-emerald-400/70`. Bu metinlerde `dark:` varyantı yok. Tema `providers.tsx:225` `defaultTheme="system"`. Kontrastın hesaplanmış değeri doğrulanmadı ama renkler ve arka planlardan tahmin: `emerald-400`/`amber-400` neredeyse beyaz zeminde (`bg-*-500/10`) WCAG AA'nın (4.5:1) çok altında.
- **Sorun:** Akışın en önemli mesajları açık temada en zayıf kontrastla gösteriliyor: "giriş yapın", "sadece müşteri", "hazırsınız".
- **Öneri:** Renkler, aynı dosyadaki fayda listesinin uyguladığı `text-*-700 dark:text-*-400` desenine geçirilmeli (`:328-330` zaten bu deseni kullanıyor). Daha iyisi, durum kutuları tek bir `<StatusCallout tone="success|warning|danger">` bileşenine toplanıp tasarım token'larıyla yönetilmeli. Bu kutulara `role="status"` (hata için `role="alert"`) eklenmeli.
- **Efor:** S.

### B8 — ORTA · UX / Rol farkındalığı · Yanlış rol bir çıkmaz; bayi ve personel kartı kamerayla okutunca ne yapacağını bilmiyor
- **Kanıt:** `page.tsx:377-388` "Sadece müşteri hesapları kart aktive edebilir" yazıyor ve buton göstermiyor. `:416` aktivasyon butonu da gizli. Bayinin uygulama içi tarayıcısı `/c/` desenini zaten tanıyor (`dealer/scan/page.tsx:162-165`).
- **Sorun:** Kasadaki bayi ya da personel müşterinin kartını telefonun kamerasıyla okutursa müşteriyi bulmak ve tüketim eklemek yerine bir uyarı görüyor. Yanlış hesapla girmiş bir müşterinin ise hesap değiştirme seçeneği yok.
- **Öneri:** `/c/[token]` rol bazlı bir yönlendirici olmalı. `DEALER`/`STAFF` rolündeki kullanıcı `/dealer/scan?token=…` (ya da personel karşılığına) yönlendirilmeli ve tarama sayfası bu parametreyle `handleScan`'i otomatik tetiklemeli. Diğer roller için "Farklı hesapla giriş yap" butonu (`signOut({ callbackUrl: '/c/'+token })`) eklenmeli.
- **Efor:** S-M.

### B9 — ORTA · Yapılandırma · QR alan adı demo adresine sabit kodlu (doğrulanmadı)
- **Kanıt:** `app/admin/cards/cards-client.tsx:82` ve `app/customer/my-card/page.tsx:41` `const QR_DOMAIN = 'https://demoqratex.vercel.app'`. Buna karşılık Wallet tarafı `lib/wallet.ts:35, 267` `process.env.NEXT_PUBLIC_APP_URL` kullanıyor.
- **Sorun:** Basılan fiziksel kartların QR'ı kalıcıdır. Üretim alan adı `demoqratex.vercel.app` değilse (bu doğrulanmadı) bütün basılı kartlar yanlış hosta yönlenir. Ayrıca aynı kart için Wallet QR'ı ile panel QR'ı farklı alan adına işaret edebilir.
- **Öneri:** Tek kaynak `lib/public-app-origin` ya da `NEXT_PUBLIC_APP_URL` olmalı ve basım için ayrıca `NEXT_PUBLIC_CARD_QR_ORIGIN` gibi açık ve kalıcı bir değişken tanımlanmalı. Alan adı değişse bile eski kartlar için kalıcı bir yönlendirme planlanmalı.
- **Efor:** S.

### B10 — DÜŞÜK · Güvenlik tutarlılığı · Aktivasyon ucu standart `requireAuth`'u atlıyor, rate limit yok
- **Kanıt:** `activate/route.ts:19` doğrudan `getServerSession(authOptions)`. Projedeki `lib/api-auth.ts:52-79` `requireAuth` token-replay (jti + IP/UA) kontrolü yapıyor. `activate/route.ts:99` ham `x-forwarded-for` kullanıyor (`getClientIp` yardımcısı mevcut). İki uçta da `checkRateLimitDb` (`lib/rate-limit.ts:23`) yok.
- **Sorun:** Bu uç, kartı hesaba kalıcı olarak bağlayan, yani yazma yapan bir uç ve kod tabanındaki oturum sertleştirmesinin dışında kalıyor. Audit log'daki IP değeri güvenilmez.
- **Öneri:** `requireAuth(['CUSTOMER'])` + `getClientIp` kullanılmalı. GET için IP başına, POST için kullanıcı başına makul bir sınır (ör. 20/dk) konmalı.
- **Efor:** S.

### B11 — DÜŞÜK · Hata yönetimi · Yeniden deneme yok, `ALREADY_YOURS` işlenmiyor
- **Kanıt:** `page.tsx:160-162` kodsuz hatalar için başlık sadece "Hata", `:168-171` tek çıkış ana sayfa. `:101-106` yalnızca `ALREADY_ACTIVATED` durumunda yeniden yükleme yapıyor.
- **Öneri:** Ağ ve 5xx hatalarında "Tekrar dene" butonu eklenmeli. `ALREADY_YOURS` başarı gibi ele alınmalı (sahip görünümüne geçilmeli). Bloklu kartta sahibine "Destekle iletişime geç" bağlantısı gösterilmeli.
- **Efor:** S.

### B12 — DÜŞÜK · Mimari · İstemci tarafında render, metadata/i18n yok, `/c/` robots kapsamı dışında
- **Kanıt:** `page.tsx:1` `'use client'`, `app/c/` altında `layout.tsx` / `generateMetadata` yok. `app/robots.ts:20` varsayılan disallow listesinde `/c/` yok. Kardeş sayfalar `useAppT` kullanırken burada tüm metinler sabit Türkçe.
- **Öneri:** Sayfa bir sunucu bileşenine dönüştürülmeli: `getServerSession` + Prisma ile kart durumu sunucuda çözülsün ve ilk boyamada spinner olmasın. Etkileşim (aktive et butonu) küçük bir istemci adası olarak kalmalı. `metadata: { title: 'Kartını etkinleştir', robots: { index: false } }` eklenmeli, robots varsayılanına `/c/` dahil edilmeli. Metinler `useAppT` anahtarlarına taşınmalı.
- **Efor:** M.

### B13 — DÜŞÜK · Motion · Sonsuz JS animasyonu azaltılmış hareket tercihine uymuyor
- **Kanıt:** `page.tsx:305-314` `boxShadow` anahtar kareleri `repeat: Infinity` ile dönüyor. `MotionConfig reducedMotion="user"` (`providers.tsx:232`) transform dışındaki değerleri durdurmuyor. `:300-301` iki büyük `blur-3xl` + `animate-pulse` katmanı CSS ile durduruluyor (`globals.css:801-807`) ama düşük donanımlı telefonda sürekli GPU yükü oluşturuyor. Uygulamanın kendi "animasyonları azalt" tercihi (`html.reduce-animations`, `globals.css:824-830`) JS animasyonlarını kapsamıyor.
- **Öneri:** `useReducedMotion()` ile koşullu hale getirilmeli. Bekleme anında sonsuz nabız yerine tek seferlik giriş animasyonu kullanılmalı; hareket bütçesi aktivasyon kutlamasına (B6) ayrılmalı.
- **Efor:** S.

### B14 — DÜŞÜK · UX · Başkasının kartında anlamsız CTA'lar, kayıp kart akışı yok
- **Kanıt:** `page.tsx:257-281` başkasına ait aktif kartta oturumu olmayan kişiye "Giriş Yap / Kayıt Ol" sunuluyor; giriş yapmak bu kartla ilgili hiçbir şeyi değiştirmiyor.
- **Öneri:** Bu görünüm "Bu kart bir QRateX üyesine ait" bilgisini, "Kart buldum, sahibine ilet" aksiyonunu (anonim, sahibine push/mail giden bir kayıp kart bildirimi) ve "Kendi kartını al" pazarlama CTA'sını göstermeli.
- **Efor:** M.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Hoş geldin ödülü ve ilk görev zinciri** (Starbucks kayıt bonusu, Duolingo ilk ders): aktivasyonla birlikte tek seferlik puan ve "ilk 3 görev" kartı (ilk yorum, ilk oyun, profil fotoğrafı).
2. **Kartın dijital ikizi ve kutlama sahnesi** (Revolut/Monzo kart teslim ekranı): fiziksel kartın gerçek tasarımı, dönme ve sahip adının kartın üzerine "basılması".
3. **Aktivasyon sonrası tek dokunuşla Apple/Google Wallet'a ekleme**: uç ve iş mantığı mevcut, yalnızca bu ana bağlanmamış.
4. **Tek ekranda giriş** (Starbucks/Revolut magic link): sayfadan ayrılmadan e-posta → magic link → otomatik aktivasyon. `/auth/magic` altyapısı zaten var, "bekleyen kart" cookie'siyle birleştirilmeli.
5. **Kayıp/çalıntı kart yönetimi**: sahip için "kartımı dondur" (müşteri self-servis blok) ve bulan kişi için "sahibine ilet" akışı.
6. **Rol farkındalığı olan deep-link**: aynı QR müşteriye aktivasyon/kart, bayi ve personele tüketim ekleme ekranı açmalı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Okut, sahiplen, kutla" akışı 10 saniyenin altında bitmeli. Kullanıcı kartı okuttuğu anda kartın kendisini görmeli (genel bir ikon değil). Tek bir birincil aksiyon olmalı ve aktivasyon anı markayla ilk "aha" anına dönüşmeli. Aynı URL, kimin okuttuğuna göre doğru ekranı açmalı.

**Yerleşim (mobil öncelikli, tek sütun):**
1. **Üst:** Kartın dijital ikizi (`LegendDigitalCard`'ın paylaşılan, sade bir varyantı). Kullanılmamış kartta isim alanı boş ve kesik çizgili ("Senin adın burada").
2. **Orta:** Duruma göre tek bir mesaj ve tek birincil buton. Durumlar: `claimable` (oturum var → "Kartı benim yap"; oturum yok → e-posta alanı + "Devam et" ve Google butonu), `mine` (son kullanım, puan bakiyesi, "Kartıma git"), `taken` (maskelenmiş bilgi + "Kart buldum"), `blocked` (sahibine neden ve destek; diğerlerine nötr mesaj), `orphan` artık oluşmamalı.
3. **Alt:** Fayda listesi, kişisel değer önerisine dönüşmeli: "Aktive edince +X puan", "Yakındaki N işletmede geçerli". Bu bilgi sunucudan gelmeli, sabit kodlu olmamalı.
4. **Başarı sahnesi:** Tam ekran kart dönüşü, puan sayacı animasyonu, "Wallet'a ekle", "İlk yorumu yap" ve "Kartıma git" seçenekleri. Otomatik yönlendirme olmamalı.

**Motion/3D (yerinde ve ölçülü):** Bekleme ekranında sonsuz nabız olmamalı. Kart, girişte tek bir yay (spring) animasyonuyla oturmalı. Aktivasyonda bir `rotateY` dönüşü ve kısa bir parıltı ya da konfeti yeterli. three.js gerekli değil; CSS 3D + framer-motion bu iş için yeterli ve hafif. Bütün hareketler `useReducedMotion()` ve `html.reduce-animations` ile statik geçişe düşmeli.

**Veri/API değişiklikleri:**
- `GET /api/cards/[token]` → oturuma duyarlı bir "görünüm modeli" dönmeli: `{ state, isMine, holderDisplay (maskeli/tam), activationBonus, canWallet, blockedMessage? }`. `customer.id` ve ham `blockReason` dışarı çıkmamalı.
- `POST /api/cards/[token]/activate` → `requireAuth(['CUSTOMER'])`, koşullu `updateMany` (`status: 'UNUSED'`), opsiyonel atomik hoş geldin kredisi, rate limit, `getClientIp`. Yanıt yeni görünüm modelini dönmeli ki istemci yeniden fetch etmesin.
- Hesap silme → kartları serbest bırakmalı. Mevcut yetim kartlar için tek seferlik düzeltme yapılmalı.
- Kayıt/OAuth/magic link → `callbackUrl` veya imzalı `pending_card` cookie'si desteklemeli.
- Sayfa RSC + küçük istemci adası olmalı. `metadata` noindex verilmeli, metinler i18n anahtarlarına taşınmalı.
- Ortak bir `lib/qr-resolve.ts` ile `customer/scan`, `dealer/scan` ve `/c/[token]` aynı çözümleyiciyi kullanmalı.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/my-card`:** Kart görüntüleme, paylaşma ve Wallet işleri orada. Sahip görünümü (`page.tsx:179-288`) bunun zayıf bir kopyası. Öneri: `/c/[token]` sahibe ayrıntılı panel göstermesin; kısa bir özet ve `my-card`'a bağlantı yeterli. Kart görseli iki sayfada da aynı paylaşılan bileşenden gelmeli.
- **`/customer/scan` ve `/dealer/scan`:** Aynı QR'ı farklı mantıklarla çözüyorlar. Biri kart QR'ını hiç tanımıyor (B5). Tek bir çözümleyici modülde birleştirilmeli; `/c/[token]` rol bazlı yönlendirici olarak "tek doğru giriş noktası" olmalı.
- **Admin kart atama (`/api/admin/cards/[id]/assign`) ve PATCH durum değiştirme:** Aktivasyonla aynı veriyi değiştiriyorlar ama farklı kurallarla. Örneğin PATCH `UNUSED` yaparken `customerId`'yi temizlemiyor (`admin/cards/[id]/route.ts:115-126`), bu da tutarsız durumlar üretebiliyor. Kart durum geçişleri tek bir servis fonksiyonunda (`lib/cards/transition.ts`) toplanmalı ve her geçiş audit log yazmalı.
- **Kaldırma ya da birleştirme gerekmiyor:** Rota, basılı kartların kalıcı hedefi olduğu için korunmalı; yalnızca yeniden tasarlanmalı.

---

## Doğrulama (şüpheci inceleme)

Her iddia kod baştan okunarak çürütülmeye çalışıldı (sayfa, çağrılan API'ler, `proxy.ts`, Prisma şeması, kayıt/silme akışları). Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Kayıt akışı `callbackUrl`'u yok sayıyor → **DOĞRULANDI** (önem: Yüksek değil, Orta-Yüksek; kurtarılabilir dönüşüm kaybı)

- `app/c/[token]/page.tsx:270` ve `:370` → `/auth/register?callbackUrl=/c/<token>`.
- `app/(auth)/auth/register/page.tsx:60` yalnızca `ref` okunuyor; `callbackUrl` dosyada hiç geçmiyor. Credentials sonrası `:137` sabit `/customer`, OAuth için `:151-156` sabit `next=/customer`. E-posta doğrulama dalı (`:115-124`) da hedefi taşımıyor.
- `/customer/my-card` boş durumu (`app/customer/my-card/page.tsx:553-568`) kullanıcıyı `/customer/scan`'e gönderiyor; o sayfa da yalnızca `/feedback/<code>`'a yönlendiriyor (`app/customer/scan/page.tsx:35`), kart QR'ını tanımıyor. Panelde aktivasyon yolu yok (`app/customer` altında `activate` çağrısı yok).
- Bayi taraması `UNUSED` kartta `CARD_NOT_ACTIVATED` dönüyor (`app/api/dealer/cards/scan/[token]/route.ts:76-82`).
- **Yeniden üretim:** Oturumsuz kişi kartı okutur → "Kayıt Ol" → formu doldurur → `/customer`'a düşer; kart `UNUSED` kalır. Kasada bayi okutunca "Bu kart henüz aktive edilmemiş" alır.
- **Çürütmeye karşı not:** Veri kaybı yok; kullanıcı fiziksel kartı yeniden okutup giriş yapmış hâlde aktive edebilir. Ama bunu ona söyleyen hiçbir yüzey yok, bu yüzden pratikte sessiz kayıp. Giriş (`login/page.tsx:67,125`) `callbackUrl`'u doğru taşıyor; sorun yalnızca kayıt dalında.

### 2. Yetim kart (ACTIVATED + `customerId=null`) → **DOĞRULANDI**

- Şema: `prisma/schema.prisma:1522` `onDelete: SetNull`; `status` dokunulmuyor. Uygulamada kartı `UNUSED`'a döndüren tek yer admin unassign (`grep status: 'UNUSED'`).
- Silme engellenmiyor: `Consumption.customer` `onDelete: Cascade` (`schema.prisma:1586`), şemada `Restrict`/`NoAction` yok. `app/api/user/delete-account/route.ts:39` doğrudan `user.delete` yapıyor; kartları serbest bırakmıyor. Aynı durum admin kullanıcı silme uçları için de geçerli (`app/api/admin/users/route.ts`, `bulk/route.ts`; ayrıntısı okunmadı).
- Sayfa: `page.tsx:180` `isActivated && customer` false → aktivasyon ekranı. `activate/route.ts:63-68` `status === 'ACTIVATED'` ve `customerId (null) !== user.id` → 409 `ALREADY_ACTIVATED` ("Bu kart başka bir kullanıcıya bağlı"); `page.tsx:103-105` yeniden yükleyip aynı ekranı gösteriyor.
- Admin unassign `:46-49` `!card.customerId` → 400 "zaten atanmamış". Kurtarma yalnızca admin PATCH `status: 'UNUSED'` ile mümkün (`app/api/admin/cards/[id]/route.ts:115-126`; yetim kartta `customerId` zaten null olduğundan sonuç tutarlı).
- **Yeniden üretim:** Müşteri kartını aktive eder → Ayarlar'dan hesabını siler → kartı (ya da yeni hesabıyla) okutur → "Kartı Aktive Et" → "Bu kart başka bir kullanıcıya bağlı" toast'u; ekran değişmez. "Sonsuz döngü" ifadesi abartılı (otomatik döngü yok, kullanıcının her tıklaması aynı hatayı veriyor) ama kart fiilen kilitli.
- Ek gözlem (doğrulanmadı): bayi taraması yetim kartta `customer: null` ile 200 dönüyor (`dealer/cards/scan/[token]/route.ts:99-105`). `dealer/scan` arayüzünün bunu nasıl ele aldığı okunmadı.

### 3. Herkese açık kart ucu kişisel veri sızdırıyor → **DOĞRULANDI** (önem: Orta; KVKK veri minimizasyonu, kritik değil)

- `proxy.ts:105-118` `/api/*` için kimlik doğrulama uygulamıyor (yalnız güvenlik/CORS başlıkları). `app/api/cards/[token]/route.ts` oturum kontrolü yapmıyor; `:64-68` `customer.id`, `name`, `image` dönüyor; `:47-53` bloklu kartta `reason: blockReason` dönüyor.
- Aynı URL dağıtılıyor: Apple/Google Wallet QR'ı `lib/wallet.ts:51,60,305`, "paylaş/kopyala" `app/customer/my-card/page.tsx:383-395`.
- **Yeniden üretim:** Kayıp ya da fotoğraflanmış fiziksel kart veya kasada gösterilen Wallet QR'ı → herhangi bir telefonla okutulur → oturumsuz `GET /api/cards/<token>` sahibin tam adını, profil fotoğrafı URL'sini (OAuth'ta gerçek yüz fotoğrafı) ve iç kullanıcı kimliğini döner. Token döndürülmediği için erişim kalıcı.
- **Çürütmeye karşı notlar:** Token nanoid olduğundan tahmin edilemez; sızıntı yalnızca QR'ı/linki görenle sınırlı. Ad zaten Wallet kartının başlığında görünüyor (`lib/wallet.ts:299-301`), bu yüzden asıl fazlalık **fotoğraf + `customer.id`**. `blockReason` kısmı zayıf: admin arayüzü sabit metin gönderiyor (`cards-client.tsx:308`, `[id]/route.ts:119`) ve sayfa bunu göstermiyor; serbest metin yalnızca doğrudan API çağrısıyla girilebiliyor.
- **Öneri:** Uç, oturuma duyarlı bir görünüm modeli dönmeli. Sahibe tam veri, diğerlerine `isMine: false` ve maskeli ad ("F*** U.") verilmeli; `id`, `image` ve `blockReason` ise yalnız sahip/admin için olmalı. `isOwnCard` karşılaştırması sunucuya taşınmalı (`isMine` bayrağı) ki istemci `customer.id`'ye ihtiyaç duymasın.

---

## Uygulama (Dalga 2)

> Yüzey sahibi: `p-kart-masa-offline`. Sayfa sunucu bileşeni olarak yeniden yazıldı (`app/c/[token]/page.tsx` + `_server/card-page.ts`); etkileşim üç küçük istemci adasında (`components/customer/p-kart-masa-offline/card/`: `card-claim.tsx`, `found-report.tsx`, `switch-account.tsx`); kart ikizi `card-twin.tsx` (hook'suz, sunucuda çizilir). Sahiplenme mantığı tek yerde: `lib/cards/claim.ts`. Testler: `__tests__/api/card-claim.test.ts` (13 test).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | URL'den token okuma | ÇALIŞIYOR | Sunucuda güvenli `decodeURIComponent` + `CARD_TOKEN_PATTERN`; bozuk biçimde DB'ye gidilmez. |
| 2 | Kart bilgisini getirme | ÇALIŞIYOR | Sunucuda `loadCardPage` (oturuma göre görünüm modeli); spinner şelalesi yok. `GET /api/cards/[token]` (A3 sürümü) dış uyumluluk için korunur, sayfa artık çağırmaz. |
| 3 | Yükleniyor durumu | ÇALIŞIYOR | `loading.tsx` statik iskelet; başarıda yeniden yükleme yok (spinner yanıp sönmesi bitti). |
| 4 | Hata: kart bulunamadı | ÇALIŞIYOR | Arşivli kart da bulunamadı görünür. |
| 5 | Hata: bloklu kart | ÇALIŞIYOR | Sahibine "dondurdun → Kartım'da çöz" / "yönetim engeli → Kartım"; başkasına nötr mesaj. Blok gerekçesi hiç dışarı çıkmaz. |
| 6 | Hata: genel / ağ / 500 | ÇALIŞIYOR | Hata paneli + "Tekrar dene"; aktivasyonda kodlu, eyleme dönük metin; çevrimdışıyken istek atılmaz. |
| 7 | "Ana Sayfaya Dön" | ÇALIŞIYOR | Tüm durum panellerinde + logo bağlantısı. |
| 8 | Sahip adı ve avatarı | ÇALIŞIYOR | Ad yalnız sahibine (kart ikizinde); avatar kaldırıldı; başkasına yalnız "Qratex üyesi". |
| 9 | "Kendi kartım" ayrımı | ÇALIŞIYOR | Sunucuda (`deriveCardViewState`); `customer.id` istemciye gitmez. |
| 10 | "Kartımı Görüntüle" | ÇALIŞIYOR | `/customer/wallet/card` (my-card emekli). |
| 11 | "Tüketim Geçmişim" | KALDIRILDI | Sahip özeti artık kullanım sayısı + son kullanım (yalnız sahibin tüketimleri) gösterir; ayrıntılı geçmiş Cüzdan › Hareketler'de. |
| 12 | Başkasının kartı, oturumsuz: Giriş/Kayıt | KALDIRILDI | Amaçsız CTA; yerine "Kartı buldum, sahibine haber ver" + "Kendi kartını edin". |
| 13 | Başkasının kartı, oturumlu: "Panelime Git" | KALDIRILDI | Aynı gerekçe; müşteriye "Kartıma git". |
| 14 | Aktivasyon kahraman ikonu (sonsuz nabız) | KALDIRILDI | Sonsuz JS animasyonu; yerine kartın dijital ikizi (tek giriş animasyonu). |
| 15 | Fayda listesi | ÇALIŞIYOR | Kişisel değer: tüketim yorumu puanları sunucudaki puan matrisinden (`consumptionReview`), sabit kodlu değil. |
| 16 | Oturumsuz: "Giriş yap" (callbackUrl) | ÇALIŞIYOR | `/auth/login?callbackUrl=` kodlanmış. |
| 17 | Oturumsuz: "Kayıt ol" (callbackUrl) | ÇALIŞIYOR | Kayıt sayfası artık `callbackUrl`'ı okuyor (auth yüzeyi); bu sayfa kodlanmış dönüş adresi gönderir. |
| 18 | Yanlış rol uyarısı | ÇALIŞIYOR | Personel → personel paneli, yönetici → Kartlar; sahiplenilebilir kartta "Farklı hesapla giriş yap" (çıkış + bu karta dönüş). |
| 19 | "Merhaba, {ad}!" | ÇALIŞIYOR | |
| 20 | "Kartı Aktive Et" + yükleniyor | ÇALIŞIYOR | "Kartı benim yap"; çift tıklama `loading` ile kilitli. |
| 21 | İstemci oturum/rol ön kontrolü | ÇALIŞIYOR | Sunucuda; istemci kural tekrar etmez. |
| 22 | Aktivasyonun atomikliği | ÇALIŞIYOR | Koşullu `updateMany` (önceki durum yazmadan önce yakalanır) + yarış testi. |
| 23 | Aktivasyon audit log'u | ÇALIŞIYOR | `getClientIp` (ilk IP) + UA; yetim kart için ayrıca `RELEASED_ORPHAN`. |
| 24 | `ALREADY_ACTIVATED` | ÇALIŞIYOR | Açıklayıcı metin, düğme devre dışı; yeniden yükleme döngüsü yok. |
| 25 | `ALREADY_YOURS` | ÇALIŞIYOR | Başarı gibi ele alınır (başka sekmede bağlanmışsa bayat ekran kalmaz). |
| 26 | Başarı akışı | ÇALIŞIYOR | Kart yerinde döner (CSS 3D), sahibin adı belirir, tek seferlik ışıma (≤ 1,2 sn); otomatik yönlendirme yok; sonraki adımlar. |
| 27 | Yetim kart | ÇALIŞIYOR | Bağsız ACTIVATED ya da sahibi anonimleştirilmiş kart "sahiplenilebilir" görünür ve bağlanır. |
| 28 | Alt bilgi | ÇALIŞIYOR | Tüm durumlarda tek alt bilgi. |
| 29 | Metadata / noindex | ÇALIŞIYOR | `title`, `robots: noindex`, canonical yok. |
| 30 | Çoklu dil | ÇALIŞIYOR | TR/EN (`copy.ts`, `getServerLocale`). |
| 31 | Azaltılmış hareket | ÇALIŞIYOR | `useMotionPolicy`; azaltılmışta dönüş yerine çapraz geçiş, ışıma yok, sonsuz döngü yok. |
| 32 | Rate limit | ÇALIŞIYOR | Sayfa IP 60/dk, aktivasyon kullanıcı 10/dk, kayıp bildirimi IP 3/10 dk (+ kart başına 6 sa). |
| 33 | Token-replay / `requireAuth` | ÇALIŞIYOR | Aktivasyon `defineRoute` + `requireAuth(['CUSTOMER'])`. |
| 34 | Hoş geldin ödülü | KALDIRILDI | Yönetilebilir ekonomi ayarı yok; sabit kodlu puan basılmaz (ilke: ayar varsayılanı sunucudan, puan yalnız defterden). Kazanç yolu (tüketim yorumu puanı) gerçek matristen gösterilir. Ürün kararı verilirse `lib/economy` + Ekonomi Stüdyosu ayarıyla eklenmeli. |
| 35 | Aktivasyon sonrası Wallet'a ekleme | ÇALIŞIYOR | Başarı ekranında platforma göre (iOS → Apple, diğer → Google), yalnız yapılandırılmışsa. |
| 36 | Kayıp/bulunan kart bildirimi | ÇALIŞIYOR | `POST /api/cards/[token]/found` → sahibe bildirim + push; kimlikler paylaşılmaz. |
| 37 | Uygulama içi tarayıcıdan ulaşma | ÇALIŞIYOR | Tara yüzeyi `lib/qr-resolve` ile kart QR'ını tanıyor (customer_scan Dalga 2). |
| 38 | Kart görseli (dijital ikiz) | ÇALIŞIYOR | `CardTwin` (Kartım ile aynı malzeme dili). |
| 39 | Ekran okuyucu duyurusu | ÇALIŞIYOR | `announce` + `role=status/alert`, başarıda odak başlığa. |
| 40 | Mobil yerleşim | ÇALIŞIYOR | Tek sütun, dokunma hedefleri ≥ 44 px. |
| 41 | Açık tema kontrastı | ÇALIŞIYOR | Yalnız rol token'ları (`TONE_CALLOUT`, `text-fg*`); `*-400` sabitleri yok. |
| 42 | Bayi kamerayla okutunca rol yönlendirme | ÇALIŞIYOR | İşletme hesabı → `/dealer/scan?token=…` ve kart otomatik sorgulanır. |
| 43 | Boş `CardFooter` | KALDIRILDI | Yapı yeniden yazıldı. |

### Kapanan bulgular (13/14)
- **B1** (kayıt hunisi): dönüş adresi kodlanmış; kayıt sayfası `callbackUrl` taşıyor. *Kalan:* imzalı `pending_card` çerezi (OAuth/e-posta doğrulama sonrası farklı cihaz) yapılmadı.
- **B2** (yetim kart): sahiplenme tarafında kapandı (bağsız ya da anonim sahipli kart bağlanır + `RELEASED_ORPHAN`).
- **B3** (TOCTOU), **B4** (kimlik sızıntısı — A3 + sunucu görünüm modeli), **B6** (kutlama/sonraki adımlar), **B7** (kontrast), **B8** (rol yönlendirme), **B10** (`requireAuth` + rate limit + `getClientIp`), **B11** (yeniden dene, `ALREADY_YOURS`, bloklu kart yolu), **B12** (RSC + metadata + i18n), **B13** (sonsuz animasyon), **B14** (kayıp kart akışı).
- **B5**: Tara yüzeyi tarafından kapatıldı (lib/qr-resolve).

### Kalanlar
- **B9** (kalan): `app/admin/cards/cards-client.tsx:82` hâlâ `QR_DOMAIN = 'https://demoqratex.vercel.app'` (admin yüzeyi; basım QR'ı `lib/wallet-card/snapshot#resolveCardOrigin` ile tek kaynağa bağlanmalı).
- Hesap anonimleştirme (`lib/gdpr-core`) kartı serbest bırakmıyor; kart sahiplenme anında serbest bırakılıyor. Kartım'ın `consumptionsCount` sayımı karta göre (müşteriye göre değil); yeniden sahiplenilen kartta önceki sahibin kullanım sayısını gösterebilir (cüzdan yüzeyine iletildi). Bu sayfa yalnız sahibin tüketimlerini sayar.
- Tek ekranda magic link (eksik özellik 4) yapılmadı.
