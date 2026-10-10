# /auth/verify-email

**Amaç:** Kayıt sonrası e-postaya gönderilen `?token=` linkini tüketip `User.emailVerified` alanını doldurmak. Bu adım credentials ile kayıt olan her müşterinin uygulamaya ilk girişinin önündeki zorunlu kapıdır (`lib/auth.ts:165` doğrulanmamış kullanıcıyı girişte reddeder).

**Genel puan: 4/10** · **Karar: yeniden tasarla.** Sayfa küçük ve temiz yazılmış. Ancak bağlı olduğu akış (kayıt, doğrulama, yeniden gönderim, giriş) uçtan uca kırık. Üretimde kullanıcı bu sayfaya hiç yönlendirilmiyor. Link kaybolursa ya da süresi dolarsa hesabı kurtarmanın yolu yok. Hata ekranındaki birincil aksiyon da çıkmaza götürüyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Mutlu yol çalışıyor. Süresi dolmuş, zaten kullanılmış ya da eşzamanlı istek durumları yanlış veya çıkmaz sonuç veriyor, yeniden gönderim de hiç yok. |
| UX | 3/10 | Doğrulama başarılı olunca kullanıcı tekrar şifre girmeye gönderiliyor. Hata durumunda "Yeniden Kayıt" ve "Giriş Yap" butonlarının ikisi de işe yaramıyor. |
| Görsel | 5/10 | Tutarlı bir glass kart var ama sıradan: ikon, metin ve buton. Ürünün oyunlaştırılmış kimliğiyle (rozet, puan, hoş geldin anı) hiçbir bağ kurmuyor. |
| Mimari | 4/10 | Durum değiştiren bir GET isteği useEffect içinden atılıyor. Token düz metin saklanıyor, iptal koruması yok, API hata metinleri sabit Türkçe. |
| Performans | 8/10 | Tek ve hafif bir istek var, ağır bağımlılık yok. Suspense fallback ile içerik kartı arasında küçük bir yerleşim kayması oluşuyor. |
| Erişilebilirlik + mobil | 6/10 | aria-live, 44px hedefler ve odak halkaları mevcut. Sayfada h1 yok, hata `role="alert"` ile duyurulmuyor, iç içe `min-h-dvh` mobilde gereksiz kaydırma üretiyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Suspense fallback (tam ekran spinner, sr-only metin) | ÇALIŞIYOR | `app/(auth)/auth/verify-email/page.tsx:11-23,120-125` | Fallback kartsız, içerik kartlı; geçişte kayma olur |
| 2 | URL'den `token` okuma | ÇALIŞIYOR | `page.tsx:26-28` | |
| 3 | Token yoksa anında hata | ÇALIŞIYOR | `page.tsx:33-37` | |
| 4 | Doğrulama API çağrısı (`GET /api/auth/verify-email`) | KISMİ | `page.tsx:38-52`, `app/api/auth/verify-email/route.ts:5-37` | GET isteği yan etki yaratıyor; iptal/tekillik koruması yok (bkz. B4, B5) |
| 5 | Yükleniyor durumu (spinner + metin, `aria-busy`) | ÇALIŞIYOR | `page.tsx:62-74` | |
| 6 | Başarı mesajı | KISMİ | `page.tsx:41-43`, `route.ts:32` | API'nin sabit TR metni gösteriliyor; EN kullanıcı Türkçe görür (B6) |
| 7 | Başarı → "Giriş Yap" butonu | KISMİ | `page.tsx:79-86` | E-posta önceden doldurulmuyor, otomatik giriş ve callbackUrl yok (B7) |
| 8 | Hata mesajı | KISMİ | `page.tsx:44-47,89-92`, `route.ts:9,17,21,35` | Sabit TR metin; tüm hata türleri aynı ekran ve aynı aksiyonlarla gösteriliyor |
| 9 | Hata → "Yeniden Kayıt" | BOZUK | `page.tsx:94-101`, `app/api/auth/register/route.ts:48-51` | E-posta zaten kayıtlı olduğu için yeniden kayıt her zaman "Bu email adresi zaten kayıtlı" hatası verir; çıkmaz (B2) |
| 10 | Hata → "Giriş Yap" | KISMİ | `page.tsx:102-109`, `lib/auth.ts:165-169` | Doğrulanmamış kullanıcı girişte yine reddedilir; aksiyon döngüye sokar |
| 11 | Süresi dolmuş link ayrımı | KISMİ | `route.ts:19-22` | Mesaj farklı ama aksiyon yok; token da siliniyor, kullanıcı kalıcı olarak kilitleniyor (B1) |
| 12 | "Zaten doğrulandı" durumu | EKSİK | `route.ts:16-18` | Kullanılmış token "Geçersiz veya süresi dolmuş" olarak dönüyor; doğrulanmış kullanıcı hata görür (B4) |
| 13 | Doğrulama e-postasını yeniden gönderme | EKSİK | `grep sendVerificationEmail` → yalnız `register/route.ts:87` ve `test-email` | Uç da UI da yok (B1) |
| 14 | Bağlantı hatası durumu | KISMİ | `page.tsx:49-52` | "Tekrar dene" butonu yok; aynı token ile yeniden denemek için sayfayı yenilemek gerekiyor |
| 15 | aria-live duyurusu | KISMİ | `page.tsx:62-68` | Hata da `role="status"` (polite) içinde; `role="alert"` olmalı |
| 16 | Metadata (başlık, noindex) | ÇALIŞIYOR | `verify-email/layout.tsx:4-6`, `(auth)/layout.tsx:4-6` | |
| 17 | AuthShell başlığı (logo + tema anahtarı) | ÇALIŞIYOR | `components/auth/auth-shell.tsx:55-116` | |
| 18 | Ana içeriğe atla bağlantısı | ÇALIŞIYOR | `auth-shell.tsx:56,118-124` | |
| 19 | Segment error boundary | ÇALIŞIYOR | `app/(auth)/error.tsx:11-40` | Sentry'ye raporluyor |
| 20 | Azaltılmış hareket desteği (spinner) | ÇALIŞIYOR | `app/globals.css:801-809` | Global kural `animation-iteration-count:1` uyguluyor |
| 21 | Mobil yerleşim | KISMİ | `page.tsx:56` ile `auth-shell.tsx:55,121` | İç içe `min-h-dvh` ve çift padding var; sticky başlık yüzünden içerik viewport'tan taşar (B9) |
| 22 | Sayfa başlık hiyerarşisi | KISMİ | `page.tsx:59`, `components/ui/card.tsx:44` | `CardTitle` bir `h3`; sayfada h1 yok |
| 23 | Kullanılan token'ı URL'den temizleme | EKSİK | `page.tsx` (yok) | Token tarayıcı geçmişinde kalıyor; hata durumunda hâlâ geçerli olabilir |
| 24 | Doğrulama sonrası otomatik giriş / onboarding | EKSİK | `page.tsx:79-86` | |
| 25 | Hoş geldin ödülü / ilk puan anı | EKSİK | — | Referral bonusu zaten kayıt anında veriliyor (B3), doğrulamada gösterilmiyor |
| 26 | Analytics (`email_verified` funnel adımı) | EKSİK | `route.ts` ve `page.tsx` (track yok); kayıtta var: `register/page.tsx:113` | PostHog funnel'ı kayıt → doğrulama adımında kör |
| 27 | API rate limit | EKSİK | `route.ts:5-14` | Diğer auth uçlarında `checkRateLimitDb` var; burada yok |
| 28 | Token saklama güvenliği | KISMİ | `prisma/schema.prisma:358-364` ile `367-380` | `VerificationToken` düz metin; aynı projedeki `AuthEmailToken` hash'liyor |
| 29 | Eşzamanlı istek güvenliği | BOZUK | `route.ts:12-30` | İki paralel istek: ikincisinin `delete`'i P2025 fırlatır ve 500 "Doğrulama yapılamadı" döner (B5) |

**Sayım:** çalışıyor 9 · kısmi 11 · bozuk 2 · sahte 0 · eksik 7 (toplam 29)

---

## Bulgular

### B1. Yeniden gönderim yok: link kaybolan veya süresi dolan kullanıcı kalıcı olarak kilitleniyor
- **Önem:** Kritik · **Kategori:** İşlevsellik / veri bütünlüğü
- **Kanıt:** `sendVerificationEmail` yalnız `app/api/auth/register/route.ts:87`'de çağrılıyor (diğer tek kullanıcı `app/api/test-email/route.ts`). Süresi dolan token `route.ts:20`'de siliniyor. Girişte `lib/auth.ts:165-169` doğrulanmamış kullanıcıyı reddediyor. `app/api/auth/forgot-password/route.ts:67` ve `app/api/auth/magic-link/route.ts:72` yalnız `emailVerified` kullanıcıya mail atıyor. Yeniden kayıt da `register/route.ts:48-51` yüzünden imkânsız. Doğrulanmamış kullanıcıları ya da süresi dolmuş `VerificationToken` kayıtlarını temizleyen bir cron bulunamadı (`app/api/cron`, `lib` altında grep).
- **Sorun:** 24 saati kaçıran, maili spam'e düşen ya da Resend'in teslim edemediği kullanıcı için credentials ile hiçbir kurtarma yolu yok. Giriş, şifre sıfırlama, magic link ve yeniden kayıt kapıları dördü de kapalı; destek ekibinin elle DB müdahalesi gerekir. Aynı mekanizma e-posta işgaline de açık: biri başkasının adresiyle kayıt olursa o adres credentials için sonsuza dek kilitlenir.
- **Profesyonel öneri:**
  - `POST /api/auth/verify-email/resend` ucu ekle. Gövdede `{ email }` alsın; e-posta ve IP başına rate limit uygulasın (`checkRateLimitDb`, ör. 3/saat). Yanıt her durumda aynı olsun ("Eğer bu adres doğrulama bekliyorsa yeni link gönderdik"), kullanıcı varlığı sızmasın. Yalnız `emailVerified IS NULL` kullanıcıya gönderilsin ve eski token'lar geçersiz kılınsın.
  - Bu sayfanın "süresi dolmuş" ve "geçersiz" durumlarında, giriş sayfasındaki "e-postanızı doğrulayın" hatasında ve kayıt sonrası kartta tek tıkla yeniden gönderim sunulsun; 60 saniyelik geri sayım da olsun.
  - Süresi dolan token'ı silmek yerine işaretle (bkz. B4). API böylece "süresi doldu" durumunda hangi e-postaya ait olduğunu (maskeli: `f***@gmail.com`) döndürebilir ve yeniden gönderim tek tıkla, e-posta yazdırmadan yapılır.
  - Doğrulanmamış hesaplar için N gün sonra temizlik ya da "talep edilebilir" duruma geçiş yapan bir db-cleanup adımı ekle. E-posta işgalini bu kapatır.
- **Efor:** M

### B2. Üretimde kayıt sonrası "e-postanı kontrol et" ekranı hiç görünmüyor; kullanıcı sessizce giriş sayfasına düşüyor
- **Önem:** Kritik · **Kategori:** İşlevsellik / funnel (bu sayfaya giden akış)
- **Kanıt:** `app/api/auth/register/route.ts:161` → `exposeVerifyUrl = !emailSent && NODE_ENV !== 'production'`. Üretimde `verifyUrl` hiçbir zaman dönmüyor. `app/(auth)/auth/register/page.tsx:115` doğrulama kartını yalnız `if (result.verifyUrl)` koşulunda gösteriyor. Aksi halde `:127-137` "Giriş yapabilirsiniz" toast'ı veriyor, `signIn('credentials')` çağırıyor (sonucu kontrol edilmiyor, doğrulanmamış olduğu için başarısız) ve `router.push('/customer')` yapıyor. `proxy.ts:72` oturumsuz kullanıcıyı `/auth/login`'e atıyor. `verifySentTemplate` metni (`messages/tr.json:2421`) üretimde fiilen ölü kod.
- **Sorun:** Kullanıcı "Giriş yapabilirsiniz" yazısını görüyor, ardından açıklamasız biçimde giriş ekranına düşüyor ve giriş denemesi "E-posta adresinizi doğrulayın" hatası veriyor. Gelen kutusuna bakması gerektiğini, maili hangi adrese attığımızı ve spam'i kontrol etmesi gerektiğini hiç öğrenmiyor. Kayıt → doğrulama funnel'ının en büyük kaçağı büyük olasılıkla burası (ölçülmedi; B8'deki analytics eksikliği yüzünden ölçülemiyor da).
- **Profesyonel öneri:** Kayıt istemcisi dalı `verifyUrl` yerine API'nin açık `requiresVerification: true` bayrağına bağlamalı. Ekran tasarımı: e-posta adresi, "Mail uygulamasını aç" kısayolları (Gmail/Outlook web linkleri), "Yeniden gönder" (geri sayımlı), "Adresi değiştir" ve spam ipucu. `verifyUrl` yalnız dev'de "dev linki" olarak ayrı bir blokta kalsın. İdeali bu "bekleme" ekranını `/auth/verify-email` sayfasının token'sız haline taşımak (`/auth/verify-email?sent=1&email=…`). Böylece sayfa "bekle → doğrula → hoş geldin" akışının tek sahibi olur.
- **Efor:** S

### B3. Referral puanı e-posta doğrulanmadan basılıyor; doğrulama ekonomik bir kapı değil
- **Önem:** Yüksek · **Kategori:** Güvenlik / puan ekonomisi
- **Kanıt:** `app/api/auth/register/route.ts:101-146`: referral `COMPLETED` yazılıyor ve `creditPointsAndXp` hem davet edilene hem davet edene puan veriyor. Kullanıcı `emailVerified: null` (`:63`) iken, yani doğrulamadan önce oluyor. Doğrulama ucu (`verify-email/route.ts:24-30`) ekonomiyle hiç ilişkili değil.
- **Sorun:** Var olmayan adreslerle yapılan kayıtlar, davet edenin cüzdanına gerçek puan basıyor. Tek engel IP başına 5/dk rate limit (`register/route.ts:14`), bu da IP değiştirerek aşılır. Doğrulanmamış ve hiç giriş yapamayacak hesaplar ekonomiye para basıyor. Bu, projenin "her puan basan yol emanet/doğrulama arkasında olmalı" ilkesiyle çelişiyor. `points_credited` izi yazılıyor (`:126-131`), yani görünür ama önlenmiyor.
- **Profesyonel öneri:** Kayıtta referral'ı `PENDING` olarak yaz, puan verme. Puanı (`creditPointsAndXp` + `points_credited`) doğrulama transaction'ının içinde, atomik ve tek seferlik ver: `updateMany where status='PENDING'` deseniyle durum geçişi tek kez olsun. Doğrulama başarı ekranı da "+N puan hoş geldin bonusu" anını göstersin (bkz. vizyon). Bildirimler de o an gönderilsin.
- **Efor:** M

### B4. Doğrulama idempotent değil: kullanılmış ya da taranmış link "geçersiz" hatası veriyor, kullanıcı doğrulanmış olsa bile
- **Önem:** Yüksek · **Kategori:** Mimari / UX
- **Kanıt:** `route.ts:12-18`: token silindikten sonra (`:29`) aynı link `findUnique` ile `null` dönüyor ve 400 "Geçersiz veya süresi dolmuş link" alıyor. `next.config` `reactStrictMode: true` (`next.config.*:258`). Sayfadaki effect'te iptal bayrağı yok (`page.tsx:32-53`); aynı akıştaki `magic/page.tsx:32-50` `cancelled` koruması kullanıyor. Doğrulama, durum değiştiren bir GET ile yapılıyor.
- **Sorun:**
  1. Maildeki linke ikinci kez tıklayan (çok yaygın), sayfayı yenileyen ya da linki başka cihazda açan kullanıcı doğrulanmış olduğu halde kırmızı X ve "Yeniden Kayıt" görüyor.
  2. JS çalıştıran kurumsal link tarayıcıları (ör. Microsoft Defender Safe Links) token'ı kullanıcıdan önce tüketebilir. Kullanıcı ilk tıklamasında hata görür (davranış doğrulanmadı ama sektörde bilinen bir risk).
  3. Geliştirmede StrictMode effect'i iki kez çalıştırıyor; iki istek yarışıyor ve son çözülen kazanıyor. Geliştirici doğrulama hatasını yanıltıcı biçimde görebiliyor.
- **Profesyonel öneri:** Token'ı silme. `AuthEmailToken` modeline `purpose='email_verify'` ekle (hash'li, `consumedAt` alanlı; desen hazır: `prisma/schema.prisma:367-380`). API şu durumları döndürsün: `verified`, `already_verified`, `expired` (maskeli e-posta + yeniden gönderilebilir), `invalid`. Durum değiştiren işlemi `POST`'a taşı; sayfa yüklenince istemci POST atsın. Tarayıcıların ön-getirmesine dayanıklı olmanın en sağlam yolu ise "E-postamı doğrula" onay butonudur. Kullanıcı zaten maildeki butona bastığı için ek sürtünme düşük kalır. Bu seçimi ürün kararı olarak işaretle. Effect'e `cancelled` ya da `AbortController` ekle.
- **Efor:** M

### B5. Eşzamanlı iki istek 500 üretiyor; hata `captureApiError` yerine yalnız console'a düşüyor
- **Önem:** Orta · **Kategori:** Hata yönetimi / yarış koşulu
- **Kanıt:** `route.ts:12` (oku) ve `:24-30` (`$transaction[update, delete]`): iki istek aynı token'ı okursa ikincinin `verificationToken.delete` çağrısı P2025 fırlatır ve `:33-35` 500 "Doğrulama yapılamadı" döner. Aynı dosyada Sentry/`captureApiError` yok; `register/route.ts:174-175` kullanıyor. Kullanıcının e-postası değiştiyse `user.update where email` (`:25-27`) da P2025 ile 500'e düşer (e-posta değişikliği akışının varlığı doğrulanmadı).
- **Sorun:** Kullanıcı doğrulanmış olmasına rağmen "Doğrulama yapılamadı" görüyor ve olay izlenebilir değil.
- **Profesyonel öneri:** Tek bir koşullu atomik güncelleme kullan: `updateMany({ where: { tokenHash, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } })`. `count === 0` ise satırı okuyup `already_verified`/`expired` ayrımını yap. Kullanıcı güncellemesini `userId` ile ve `updateMany where emailVerified: null` biçiminde idempotent yap. Bilinmeyen hataları `captureApiError` ile raporla.
- **Efor:** S

### B6. Dil karışıklığı: API metinleri sabit Türkçe, sayfa bunları doğrudan gösteriyor
- **Önem:** Orta · **Kategori:** i18n
- **Kanıt:** `route.ts:9,17,21,32,35` sabit TR metinler döndürüyor. `page.tsx:43,46` önce `data.message`/`data.error` değerini gösteriyor, i18n anahtarları (`messages/en.json:2433-2436`) yalnız alan boş kalırsa devreye giriyor. Projede bunun deseni zaten var: `lib/translate-known-message.ts` (`auth.*` anahtarları) ve `register/route.ts:17,178`.
- **Sorun:** EN kullanıcısı başlığı "Email verification" görürken mesajı "E-posta adresiniz doğrulandı." görüyor. Doğrulama e-postası da tamamen sabit TR (`lib/email.ts:26-45`), `preferredLanguage` dikkate alınmıyor.
- **Profesyonel öneri:** API bir durum kodu döndürsün (`{ status: 'expired', code: 'auth.verifyExpired' }`); metni istemci `useAppT` ile seçsin. UI sabit metinlerle değil, duruma göre farklı içerik ve aksiyon setleriyle çizilsin. Doğrulama e-postası kayıt anındaki locale ile gönderilsin.
- **Efor:** S

### B7. Başarı sonrası sürtünme: kullanıcı yeniden şifre girmeye gönderiliyor
- **Önem:** Orta · **Kategori:** UX
- **Kanıt:** `page.tsx:79-86`: yalnız `href="/auth/login"`. E-posta önceden doldurulmuyor, `callbackUrl` ve rol tabanlı yönlendirme yok. Projede tek kullanımlık giriş altyapısı zaten var (`AuthEmailToken` `purpose: magic_login`, `lib/auth-email-token.ts`, `magic/page.tsx:34-37`).
- **Sorun:** Starbucks, Duolingo ve Monzo'da e-posta doğrulaması kullanıcıyı doğrudan uygulamanın içine alır. Burada kullanıcı az önce kanıtladığı kimlik için yeniden şifre yazmak zorunda kalıyor; ilk değer anı bir adım gecikiyor.
- **Profesyonel öneri:** Doğrulama transaction'ında kısa ömürlü (ör. 5 dk) bir `magic_login` token'ı üret ve yanıtta dön. İstemci `signIn('credentials', { magicToken })` ile otomatik giriş yapıp `/customer` onboarding'ine yönlendirsin. Güvenlik notu: token linkini açan cihazın oturum açması, magic link ile aynı tehdit modelidir; kabul edilebilir, fakat 2FA açık hesaplarda otomatik giriş atlanmalı. Otomatik giriş istenmiyorsa en azından `/auth/login?email=…&verified=1` ile e-postayı doldur ve "Doğrulandı" rozetini göster.
- **Efor:** M

### B8. Funnel ölçümü yok: doğrulama adımı analytics'te görünmüyor
- **Önem:** Orta · **Kategori:** Ürün / gözlemlenebilirlik
- **Kanıt:** Kayıt `track('user_registered')` gönderiyor (`register/page.tsx:113`) ve `analyticsEvent` yazıyor (`register/route.ts:149-156`). `verify-email/route.ts` ve `page.tsx` içinde hiçbir event yok.
- **Sorun:** Kayıt → doğrulama → ilk geri bildirim funnel'ında en kritik düşüş noktası ölçülemiyor. B1 ve B2'nin etkisi sayısal olarak görülemiyor.
- **Profesyonel öneri:** Sunucuda `analyticsEvent { event: 'email_verified', data: { latencyMs: now - createdAt } }` yaz, istemcide `track('email_verified', { outcome })` gönder. Hata sonuçlarını da (`expired`, `invalid`, `already_verified`) ayrı ayrı izle.
- **Efor:** S

### B9. Mobil yerleşim: iç içe `min-h-dvh` ve çift padding
- **Önem:** Düşük · **Kategori:** Mobil / görsel
- **Kanıt:** `page.tsx:56` `flex min-h-dvh … p-4 sm:p-6`. Bu, `auth-shell.tsx:121`'deki `main` içinde duruyor; `main` zaten `flex-1 … p-4 sm:p-6` ve üstünde sticky header var (`:57`). Fallback de `min-h-dvh` (`page.tsx:15`). Diğer auth sayfaları yalnız `w-full max-w-md` kullanıyor (`register/page.tsx:200-205`).
- **Sorun:** Toplam yükseklik header + 100dvh + padding oluyor; tek kartlık ekranda gereksiz dikey kaydırma çıkıyor ve kart tam ortalanmıyor. Fallback ile içerik arasında da görsel sıçrama var.
- **Profesyonel öneri:** Dış sarmalayıcıyı kaldır ve AuthShell'in ortalamasına güven. Fallback'i aynı kart iskeletiyle (Skeleton) çiz.
- **Efor:** S

### B10. Erişilebilirlik ayrıntıları
- **Önem:** Düşük · **Kategori:** Erişilebilirlik
- **Kanıt:** Hata `role="status"` (polite) bölgesinde (`page.tsx:63-66`); sayfada h1 yok (`card.tsx:44` h3); hata sonrası odak yönetimi yok; hata butonları `flex` içinde ve `wrap` yok (`page.tsx:93`).
- **Profesyonel öneri:** Başlığı `h1` yap. Hata için `role="alert"` kullan. Sonuç gelince odağı sonuç başlığına taşı (`tabIndex=-1` + `focus()`). Aksiyonları mobilde `flex-col sm:flex-row` ile alt alta diz.
- **Efor:** S

### B11. Token güvenliği ve hijyen
- **Önem:** Düşük · **Kategori:** Güvenlik
- **Kanıt:** `VerificationToken.token` düz metin (`schema.prisma:358-364`); `AuthEmailToken` aynı projede hash'liyor (`:366-370`). `verify-email/route.ts` rate limit içermiyor. Token kullanımdan sonra URL'de kalıyor (`page.tsx`, `router.replace` yok).
- **Sorun:** DB sızıntısında bekleyen hesaplar doğrudan doğrulanabilir. Token 256 bit olduğundan kaba kuvvet pratik değil, ama sınırsız istek DB'ye bedava yük bindirir.
- **Profesyonel öneri:** B4'teki `AuthEmailToken` geçişiyle hash'leme kendiliğinden gelir. Uca IP başına hafif bir rate limit ekle. Sonuç alındıktan sonra `router.replace('/auth/verify-email?status=…')` ile token'ı geçmişten temizle.
- **Efor:** S (B4 ile birlikte)

### B12. İlişkili risk: OAuth bağlama + doğrulama linki üzerinden hesap ön-ele geçirme (pre-account takeover)
- **Önem:** Yüksek · **Kategori:** Güvenlik (zincir; parçalar kod okunarak doğrulandı, uçtan uca denenmedi)
- **Kanıt:** `lib/auth.ts:42-46,51-52` `allowDangerousEmailAccountLinking: true`. `events.createUser` (`:316-321`) yalnız yeni OAuth kullanıcısında `emailVerified` set ediyor, var olan kullanıcıya bağlanınca etmiyor. Credentials kapısı yalnız `emailVerified` kontrol ediyor (`:165`).
- **Senaryo:** Saldırgan kurbanın e-postasıyla şifreli kayıt açar (doğrulanmamış). Kurban daha sonra Google ile giriş yapar; NextAuth hesabı saldırganın oluşturduğu User satırına bağlar ve kurban bu hesapta puan ve rozet biriktirir. Kurbanın gelen kutusunda "Hesabınızı oluşturdunuz, doğrulayın" maili durmaktadır. Kurban bu linke tıklarsa (bu sayfa) `emailVerified` dolar ve saldırgan kendi şifresiyle aynı hesaba girer.
- **Profesyonel öneri:** OAuth bir hesaba bağlanırken hesap doğrulanmamışsa ve şifresi varsa şifreyi sıfırla (`password=null`) ve `emailVerified`'ı set et. Bu sektörde standart önlemdir; `linkAccount` event'i ya da `signIn` callback'inde yapılabilir. Doğrulama sayfası da doğrulanan hesabı açıkça göstersin (maskeli e-posta, oluşturulma zamanı). Kullanıcı "bu hesabı ben açmadım" diyebilsin ve bu seçenek hesabı iptal etsin.
- **Efor:** S-M

### B13. Login'de "doğrulanmamış" mesajı şifreden önce dönüyor (kullanıcı sayımı)
- **Önem:** Düşük · **Kategori:** Güvenlik (ilişkili akış)
- **Kanıt:** `lib/auth.ts:165-169`: şifre karşılaştırmasından (`:171`) önce ayrı bir mesaj fırlatılıyor; `:154-157`'deki enumeration koruma yorumuyla çelişiyor.
- **Öneri:** Önce şifreyi doğrula, "doğrulanmamış" mesajını yalnız şifre doğruysa göster. Bu mesajı da yeniden gönderim CTA'sına bağla (B1).
- **Efor:** S

### Notlar (sorun değil)
- `useAppT` `useMemo` ile stabil (`lib/app-locale.tsx:57-60`), dolayısıyla effect bağımlılığındaki `t` sonsuz döngü üretmiyor.
- `PRIVATE_NO_STORE_HEADERS` tüm yanıtlarda var. `Referrer-Policy` `next.config` üzerinden tüm yollara uygulanıyor (`:328`), token harici sitelere referrer ile sızmaz.
- Kayıt bildirimi tipi yanlış: "E-postanızı doğrulayın" `type: 'success'` ile yazılıyor (`register/route.ts:90-97`) ve doğrulamadan sonra temizlenmiyor; bildirim merkezinde eskimiş bir görev olarak kalıyor. Küçük ama doğrulama başarısında okundu yapılmalı ya da silinmeli.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Yeniden gönderim ve adres değiştirme** (Starbucks, Monzo): geri sayımlı "Yeniden gönder", "Yanlış adres mi? Değiştir", "Mail uygulamasını aç" kısayolları.
2. **Kod ile doğrulama (6 haneli OTP)** (Revolut, Duolingo): PWA kurulu kullanıcıda mail linki PWA yerine tarayıcıda açılır ve oturum çerezi ayrı kalır. Linkle birlikte gönderilen bir kod, kullanıcının bulunduğu bağlamda (PWA'da) doğrulamayı tamamlar. QR odaklı ve mobil öncelikli bir üründe bu, link akışından daha güvenilir bir yoldur.
3. **Doğrulama = otomatik giriş + onboarding** (Duolingo, Monzo): doğrulanan kullanıcı doğrudan ilk görev ve ilk QR tarama yönlendirmesine iner.
4. **Hoş geldin değer anı** (Starbucks Rewards "ilk yıldız", Duolingo ilk XP): referral ya da hoş geldin bonusu doğrulamada açılır; puan sayacı ve seviye çubuğu ilk kez dolar.
5. **Durum farkındalığı**: "Zaten doğrulandı, devam et", "Süresi doldu, yeni link tek tıkla", "Bu hesabı ben açmadım".
6. **Funnel analitiği**: doğrulama oranı ve kayıttan doğrulamaya geçen süre.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Mailimdeki butona bastım, saniyeler içinde uygulamanın içindeyim ve ilk ödülümü gördüm." Sayfa bir hata ekranı olmaktan çıkıp kayıt yolculuğunun kapanış anı olmalı.

**Tek sayfa, dört durum** (`/auth/verify-email`):
1. **Bekleme** (`?sent=1`, token yok): büyük zarf illüstrasyonu, maskeli e-posta, "Mail uygulamasını aç" (Gmail/Outlook), 6 haneli kod girişi (OTP alternatifi), geri sayımlı "Yeniden gönder", "Adresi değiştir". Kayıt sayfası buraya yönlendirir (B2).
2. **Doğrulanıyor** (token var): kart iskeleti ve kısa ilerleme metni; yerleşim sıçraması yok.
3. **Başarı**: onay işareti çizim animasyonu (SVG path, ~600ms), ardından hoş geldin bonusu varsa puan kartı "+N" sayarak dolar. Birincil CTA "Uygulamaya geç" otomatik girişle `/customer`'a gider. İkincil bağlantı "Bildirimleri aç". 2-3 saniyelik otomatik yönlendirme sayacı da olabilir.
4. **Sorun**: duruma özel kopya ve aksiyon. `expired` için "Yeni link gönder" (maskeli e-posta ile tek tık), `already_verified` için yeşil bilgi ve "Uygulamaya geç / Giriş yap", `invalid` için "E-postanı yaz, yeni link gönderelim", `network` için "Tekrar dene". "Yeniden Kayıt" tamamen kaldırılmalı.

**Motion / 3D:** Bu bir geçiş ekranı; three.js sahnesi gereksiz ve yükleme süresi ekler. framer-motion (`m as Motion`) ile ölçülü bir dil yeterli: onay ikonunun çizimi, puan sayacı, CTA'nın hafif girişi. Konfeti yalnız bonus varsa ve tek sefer oynasın. `useReducedMotion` ve `html.reduce-animations` durumunda statik onay ikonu ve anında sayı gösterilsin. Projede karakter rozeti ya da maskot görseli varsa başarı durumunda statik bir maskot selamı marka tutarlılığı sağlar.

**Veri ve API değişiklikleri:**
- `AuthEmailToken` modeline `purpose: 'email_verify'` ekle: hash'li, `consumedAt`, `expiresAt`. `VerificationToken` kullanımını emekliye ayır (mevcut bekleyen token'lar için bir geçiş dönemi boyunca eski tabloya fallback bırak).
- `POST /api/auth/verify-email` `{ token }` alır ve `{ status: 'verified'|'already_verified'|'expired'|'invalid', maskedEmail?, loginToken?, welcomeBonus? }` döndürür. Tek atomik `updateMany` + `user.updateMany where emailVerified null` + referral `PENDING→COMPLETED` ve puan kredisi + `points_credited` + `analyticsEvent email_verified` + ilgili bildirimlerin temizlenmesi, hepsi tek transaction'da.
- `POST /api/auth/verify-email/resend` `{ email }` ya da `{ token }` alır (süresi dolmuş token'dan e-postayı çözer). Rate limit uygular ve kullanıcı varlığını sızdırmaz.
- `POST /api/auth/verify-email/code` `{ email, code }` alır: OTP yolu (hash'li, 5 deneme limiti).
- Kayıt API'si `requiresVerification: true` döner; referral puanı vermez, `PENDING` yazar.
- `lib/auth.ts` içinde OAuth bağlanırken doğrulanmamış hesabın şifresi sıfırlansın (B12).
- E-posta şablonu kullanıcının locale'iyle gönderilsin, kod ve link birlikte yer alsın.

---

## Çakışmalar / birleştirme önerisi

- **`/auth/register` doğrulama kartı** (`register/page.tsx:166-197`) ile bu sayfa aynı işin iki yarısı ve ikisi de eksik. Kayıttaki kart üretimde zaten görünmüyor (B2). "Bekleme" durumu bu sayfaya taşınmalı; kayıt yalnız yönlendirme yapmalı. Tek akış sahibi: `/auth/verify-email`.
- **`/auth/magic`** aynı "linkten gelen token → istemci tüketir" desenini daha sağlam uyguluyor (`cancelled` koruması, `AuthEmailToken` hash'leme). Ortak bir `useConsumeEmailToken` hook'u ve ortak `TokenResultCard` bileşeni çıkarılarak `magic`, `reset-password` ve `verify-email` aynı durum makinesini (working/success/expired/invalid/network) ve görsel dili paylaşmalı.
- Sayfa **kaldırılmamalı**: credentials kaydı olduğu sürece zorunlu bir kapıdır. Doğru yön birleştirmek değil, akışın sahibi haline getirmektir.

---

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışıldı. Okunan kaynaklar: `app/api/auth/verify-email/route.ts`, `app/(auth)/auth/verify-email/page.tsx`, `app/api/auth/register/route.ts`, `app/(auth)/auth/register/page.tsx`, `lib/auth.ts`, `app/api/auth/forgot-password/route.ts`, `app/api/auth/magic-link/route.ts`, `app/api/auth/set-password/route.ts`, `app/api/admin/users/route.ts`, `proxy.ts`, `lib/app-locale.tsx`, `lib/points-rules.ts`, `lib/rate-limit.ts`, `prisma/schema.prisma` (ReferralCode), `node_modules/next-auth/core/lib/callback-handler.js` (next-auth 4.24.15). Hiçbir şey çalıştırılmadı; DB'ye dokunulmadı.

### 1. Doğrulama linki kaybolan/süresi dolan kullanıcı kalıcı kilit — **DOĞRULANDI (nüanslı)**
- `sendVerificationEmail` uygulama içinde yalnız `register/route.ts:87`'de (ve dev amaçlı `api/test-email`, sahte token ile) çağrılıyor; "yeniden gönder" ucu ya da UI'si yok (grep: `resend-verification|resendVerif` boş). Süresi dolan token `verify-email/route.ts:19-22`'de siliniyor.
- Credentials girişi `lib/auth.ts:165-169`'da, şifre sıfırlama `forgot-password/route.ts:67`'de, magic link `magic-link/route.ts:72`'de `emailVerified` şartına takılıyor; yeniden kayıt `register/route.ts:48-51`'de "zaten kayıtlı" diyor. Cron'larda (`app/api/cron/*`) doğrulanmamış hesap temizliği yok; admin uçlarında mevcut kullanıcıyı doğrulanmış işaretleyen yol yok (`admin/users/route.ts:260` yalnız yeni kullanıcı yaratırken).
- **Nüans:** E-posta bir Google hesabına (veya yapılandırılmışsa GitHub) bağlıysa kullanıcı OAuth ile girebilir; aşağıda (#4) gösterildiği gibi bu, `emailVerified`'ı da doldurur. Yani kilit, Google hesabı olmayan adresler (kurumsal/Hotmail/Yandex vb.) için kalıcıdır; tek çıkış admin'in kaydı silmesidir. E-posta işgali senaryosu da geçerli: saldırgan Google'sız bir adresi kaydedip 24 saat beklerse gerçek sahip o adresle credentials hesabı açamaz.
- **Yeniden üretim:** Kayıt ol → maili açma → 24 saat sonra linke tıkla ("süresi dolmuş", token silinir) → giriş "E-posta adresinizi doğrulayın", şifremi unuttum sessizce mail göndermez, kayıt "zaten kayıtlı".

### 2. Üretimde doğrulama yönlendirme ekranı ölü kod, yanıltıcı toast — **DOĞRULANDI**
- `register/route.ts:161` `exposeVerifyUrl = !emailSent && NODE_ENV !== 'production'` → üretimde `verifyUrl` hiç dönmez; `register/page.tsx:115` dalı üretimde asla çalışmaz. Kod `register/page.tsx:127-129`'da `t('auth.toastCanSignIn')` = "Giriş yapabilirsiniz." (`messages/tr.json:2419`) gösteriyor; sunucunun döndürdüğü doğru `message` ("doğrulama linkine tıklayıp giriş yapın") yok sayılıyor.
- `register/page.tsx:131-135` `signIn(..., redirect:false)` sonucu kontrol edilmiyor; `authorize` `lib/auth.ts:168`'de hata fırlatır, oturum oluşmaz. `router.push('/customer')` → `proxy.ts` `withAuth` `authorized: ({token}) => !!token` (≈ satır 97-100) yanlış döner → açıklamasız `/auth/login`'e atılır.
- **Yeniden üretim (üretim):** Yeni e-postayla kayıt → "Kayıt başarılı! Giriş yapabilirsiniz." → /customer yerine login ekranı; kullanıcı şifreyle girmeyi dener → "E-posta adresinizi doğrulayın" hatasıyla ilk kez durumu öğrenir. Ayrıca `lib/auth.ts:166` her denemeyi başarısız giriş sayıyor; 5 denemede 15 dk kilit de devreye girebilir.

### 3. Referral puanı doğrulamadan basılıyor — **DOĞRULANDI**
- `register/route.ts:63` `emailVerified: null` ile kullanıcı yaratıldıktan hemen sonra `:101-146` referral'ı `COMPLETED` yazıp `creditPointsAndXp` ile iki tarafa kredi veriyor. Varsayılan matris `lib/points-rules.ts:63-66`: davet edilene 500, davet edene **1000** puan. `ReferralCode.maxUsage` varsayılan `null` = sınırsız (`schema.prisma:1747`), `api/referral/route.ts:39-43` maxUsage set etmiyor.
- Tek engel `register:${ip}` 5/dk (`register/route.ts:14`) ve IP `x-forwarded-for`'un ilk değerinden alınıyor (`lib/rate-limit.ts:208-212`). Tek IP ile bile ~7.200 kayıt/gün → davet edene teorik ~7,2M puan; hiçbir hesap giriş yapamasa da davet edenin cüzdanı gerçek puanla doluyor. `points_credited` olayı yazılıyor (görünürlük var) ama engelleme yok. Bu, hafızadaki "puan ekonomisi değişmezleri" (atomik tek seferlik kredi, sahte hesap direnci) ilkesine aykırı.
- **Yeniden üretim:** Hesap A referral kodunu alır; script `POST /api/auth/register` ile `x+1@ornek.invalid`, `x+2@...` adresleri ve `referralCode=KOD` gönderir (dakikada 5) → A'nın puanı her kayıtta +1000 artar.

### 4. OAuth bağlama ile hesap ön-ele geçirme — **DOĞRULANDI (iddiadan da ağır)**
- İddianın bir öncülü yanlış ama sonuç daha kötü: `lib/auth.ts:316-321` `events.createUser` yalnız yeni kullanıcıda **değil**. next-auth 4.24.15 `core/lib/callback-handler.js:152-172`'de e-postayla eşleşen mevcut kullanıcı `allowDangerousEmailAccountLinking` ile bağlandığında da (`user = userByEmail`) `events.createUser` çağrılıyor. Dolayısıyla kurbanın doğrulama linkine tıklaması bile gerekmiyor.
- **Zincir:** (1) Saldırgan kurbanın Gmail adresiyle kendi şifresini belirleyerek kayıt olur (`register/route.ts:57-64`, `emailVerified:null`). (2) Kurban daha sonra "Google ile giriş" yapar → aynı `User` satırına bağlanır (`lib/auth.ts:45`), `createUser` event'i `updateMany where emailVerified null` ile `emailVerified`'ı doldurur (`lib/auth.ts:320`). (3) Saldırgan e-posta + kendi şifresiyle credentials girişi yapar; `lib/auth.ts:165` artık geçer, 2FA kurban açmadıysa yok → kurbanın hesabına (puan, sipariş, profil) tam erişim. Kurban şifreyi `set-password` ile ezemez çünkü şifre zaten var (`set-password/route.ts:53-56`); `/api/user/password` mevcut şifreyi ister.
- Ek kanıt: kayıt aynı satıra "E-postanızı doğrulayın" bildirimi de yazıyor (`register/route.ts:90-97`), kurban Google ile girdiğinde bunu görüp linke tıklarsa sonuç aynı.
- Uçtan uca denenmedi (canlı DB yasağı); next-auth kaynak kodu ve uygulama kodu okunarak doğrulandı. Önem: KRİTİK.
- **Düzeltme yönü:** OAuth ile mevcut doğrulanmamış hesaba bağlanırken `password`'u null'la (ve bekleyen `VerificationToken`'ları sil), `createUser` event'ini `linkAccount` event'inden ayır; ya da doğrulanmamış hesaba otomatik bağlamayı reddedip sahibine "hesap talebi" akışı sun.

### 5. Doğrulama idempotent değil, eşzamanlı istekte 500 — **DOĞRULANDI (önem: ORTA)**
- Kullanılmış link: token `route.ts:29`'da silindiği için ikinci açılış `:16-17` "Geçersiz veya süresi dolmuş link" + sayfada "Yeniden Kayıt" (`page.tsx:94-101`) gösterir; kayıt ise "zaten kayıtlı" der. Kesin.
- Yarış: iki istek `:12-14`'te token'ı bulursa ikincinin transaction'ındaki `verificationToken.delete` P2025 fırlatır → tx geri alınır → `:33-35` 500 "Doğrulama yapılamadı". Kullanıcı ilk istekle zaten doğrulanmış olur (veri bozulmaz).
- `reactStrictMode: true` (`next.config:258`) yalnız **dev**'de efekti iki kez çalıştırır; üretim için tek başına geçerli değil. Ancak üretimde de somut bir tetikleyici var: efekt bağımlılığı `[token, t]` (`page.tsx:53`) ve `useAppT` `locale`'e göre yeni fonksiyon döndürüyor (`lib/app-locale.tsx:57-60`). `localStorage`'da `en` kayıtlı kullanıcıda `AppLocaleProvider` ilk render'da `tr` ile başlayıp efektte `en`'e geçiyor (`lib/app-locale.tsx:21-29`) → `t` değişir → ikinci fetch atılır; iptal/`cancelled` koruması olmadığından son gelen yanıt durumu belirler. İkinci yanıt (P2025 500 ya da "geçersiz link") sonra gelirse kullanıcı doğrulandığı halde hata ekranı görür.
- Veri kaybı/güvenlik etkisi yok; etkisi yanıltıcı UX ve gereksiz destek talebi. Bu yüzden KRİTİK/YÜKSEK değil, ORTA.
- **Yeniden üretim:** Tarayıcıda `localStorage` locale anahtarını `en` yap → doğrulama linkini aç → Network'te iki `GET /api/auth/verify-email` görülür; sıralamaya göre ekran hata ile biter. Ya da başarılı doğrulamadan sonra aynı linke tekrar tıkla.

---

## Uygulama (Dalga 2)

Sahip: p-auth yüzeyi. A1 (POST + idempotent `verifyEmailWithToken`, durum kodları, `expired` + maskeli e-posta, resend ucu, hash'li token, oran sınırı, `qualifyReferral`) korundu.

**Mimari:** `page.tsx` sunucu bileşeni (token prop; GET yan etkisiz). `verify-email-view.tsx` her durumu ortak AuthCard ile çizer; geçersiz bağlantı ortak `VerifyPending` kartına (e-posta yazarak yeniden gönder) düşer. Kayıt artık hash'li `AuthEmailToken` üretir (eski düz metin `VerificationToken` yalnız geçiş için okunur).

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Suspense yedeği | KALDIRILDI | Sunucu render; yükleme aynı kart iskeletinde (yerleşim sıçraması yok). |
| 2 | URL'den token | ÇALIŞIYOR | |
| 3 | Token yoksa hata | ÇALIŞIYOR | "Bağlantı geçersiz" bandı + yeniden gönder kartı. |
| 4 | Doğrulama API çağrısı | ÇALIŞIYOR | A1 POST. |
| 5 | Yükleniyor | ÇALIŞIYOR | `live=polite`. |
| 6 | Başarı mesajı | ÇALIŞIYOR | TR/EN, sunucu metni kullanılmaz. |
| 7 | Başarı → "Giriş yap" | ÇALIŞIYOR | `?verified=1` → girişte kalıcı "e-postan doğrulandı" bandı. Otomatik giriş kalan (aşağıda). |
| 8 | Hata mesajı | ÇALIŞIYOR | Duruma özel kart. |
| 9 | "Yeniden Kayıt" | KALDIRILDI | Çıkmazdı ("zaten kayıtlı"). |
| 10 | Hata → "Giriş Yap" | ÇALIŞIYOR | Yalnız anlamlı durumlarda; doğrulanmamış girişte yeniden gönder bandı. |
| 11 | Süresi dolmuş ayrımı | ÇALIŞIYOR | Tek dokunuşla (e-posta yazdırmadan) yeni bağlantı + geri sayım. |
| 12 | "Zaten doğrulandı" | ÇALIŞIYOR | Başarı tonu. |
| 13 | Yeniden gönderme | ÇALIŞIYOR | |
| 14 | Bağlantı hatası tekrar dene | ÇALIŞIYOR | |
| 15 | aria-live | ÇALIŞIYOR | Hata `alert`; sonuçta odak başlığa. |
| 16 | Metadata | ÇALIŞIYOR | |
| 17 | AuthShell | ÇALIŞIYOR | Logo CLS'siz, dil + tema. |
| 18 | İçeriğe atla | ÇALIŞIYOR | |
| 19 | Segment hata sınırı | ÇALIŞIYOR | Aynı kart diliyle. |
| 20 | Azaltılmış hareket | ÇALIŞIYOR | |
| 21 | Mobil yerleşim | ÇALIŞIYOR | İç içe `min-h-dvh` yok; mobilde üstten hizalı. |
| 22 | Başlık hiyerarşisi | ÇALIŞIYOR | `h1`. |
| 23 | Token'ı URL'den temizleme | ÇALIŞIYOR | |
| 24 | Doğrulama sonrası otomatik giriş | KALAN | Doğrulama ucunun kısa ömürlü giriş bileti üretmesi bir güvenlik politikası kararıdır (2FA'lı hesaplar, bağlantı tarayıcıları) — `lib/auth-email-token` / F1.2 sahibi. |
| 25 | Hoş geldin ödülü anı | KALDIRILDI | Ödül doğrulamada değil ilk QR deneyiminde işlenir (A1 P0-16); burada sahte sayaç gösterilmez, bekleyen davet kayıt ekranında dürüstçe anlatılır. |
| 26 | Analitik (`email_verified`) | ÇALIŞIYOR | `track('email_verified', { outcome })` — tüm sonuçlar ayrı. |
| 27 | API oran sınırı | ÇALIŞIYOR | A1. |
| 28 | Token saklama güvenliği | ÇALIŞIYOR | Kayıt artık hash'li token üretir. |
| 29 | Eşzamanlı istek | ÇALIŞIYOR | A1 atomik. |

**Kapanan bulgular:** B1 (A1 + şifremi-unuttum doğrulama dalı), B2 (A1 + kart), B3 (A1), B4 (A1), B5 (A1), B6, B8, B9, B10, B11 (kayıt hash'li token), B12 (A1 `claimUnverifiedAccount`), B13 (A1) → 12/13.
**Kalanlar:** B7 (otomatik giriş) güvenlik politikası kararı; `?verified=1` ile kalıcı bant + tek dokunuşla giriş ekranı şimdilik karşılık.
