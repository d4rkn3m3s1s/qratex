# /auth/register

**Amaç:** Yeni kullanıcının (Müşteri veya İşletme) e-posta+şifre ya da Google/GitHub ile hesap oluşturması; varsa `?ref=` davet kodunu uygulayıp e-posta doğrulamasına yönlendirmesi. QR okutan tüketicinin sadakat programına "ilk adım" kapısıdır.

**Genel puan:** 4.5/10 · **Karar:** yeniden tasarla

Form katmanı (doğrulama, erişilebilir hata mesajları, i18n anahtarları) sağlam; ancak **kayıt sonrası akış üretimde kırık** (doğrulama ekranı hiç görünmüyor, kullanıcı sessizce login'e atılıyor), **doğrulanmamış hesap için kurtarma yolu yok** ve **kayıt rotası davet puanını doğrulama beklemeden, platform limitlerini atlayarak basıyor**. Yüzey kozmetik olarak iyi, akış ve ekonomi tarafı yeniden tasarım istiyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Form gönderimi çalışıyor ama üretimde "e-postanı doğrula" ekranı erişilemez, otomatik giriş her zaman başarısız ve doğrulama linki kaybolan kullanıcı kalıcı olarak kilitli. |
| UX | 4/10 | Kullanıcıya "Giriş yapabilirsiniz" deniyor, ardından login'e atılıp "E-postanızı doğrulayın" hatası alıyor; şifre kuralları ancak hata verildikten sonra görünüyor. |
| Görsel | 6/10 | Temiz glass kart, rol kartları ve tutarlı shadcn dili; ama Qratex'in oyunlaştırma kimliğinden (puan, rozet, ödül vaadi) hiçbir iz yok, jenerik SaaS kayıt formu. |
| Mimari | 4/10 | Kayıt rotası atomik değil (kullanıcı oluşturulduktan sonraki her hata 500 + yarım hesap), davet mantığı `/api/referral` ile kopyalanmış ve oradaki limitleri atlıyor. |
| Performans | 6/10 | İstemci hafif; ancak sunucu tarafında SMTP gönderimi istek yolunda senkron (zaman aşımları 15–20 sn) ve ~8 seri DB roundtrip var. |
| Erişilebilirlik + Mobil | 7/10 | `aria-invalid`/`aria-describedby`/`role="alert"`, 44px dokunma hedefleri, `inputMode`, `autoComplete`, reduced-motion global; fakat sayfada `h1` yok ve rol seçimi radio grubu değil. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Suspense yükleniyor durumu (spinner + sr-only metin) | ÇALIŞIYOR | `app/(auth)/auth/register/page.tsx:46-54, 467-472` | `useSearchParams` için gerekli sarmalayıcı. |
| 2 | AuthShell üst bar: logo → ana sayfa | ÇALIŞIYOR | `components/auth/auth-shell.tsx:58-100` | Logolar `mounted` sonrası çiziliyor → header'da layout shift. |
| 3 | Tema değiştirme düğmesi | ÇALIŞIYOR | `components/auth/auth-shell.tsx:43-52, 102-115` | DOM'a elle class basıyor + next-themes; çift kaynak ama çalışır. |
| 4 | "Ana içeriğe geç" bağlantısı | ÇALIŞIYOR | `components/auth/auth-shell.tsx:56, 118-124` | |
| 5 | Arka plan gradient mesh | ÇALIŞIYOR | `components/auth/auth-shell.tsx:126-129` | |
| 6 | Kart giriş animasyonu (opacity + y) | ÇALIŞIYOR | `page.tsx:202-207` | `MotionConfig reducedMotion="user"` global (`components/providers.tsx:232`). |
| 7 | Başlık + alt başlık | ÇALIŞIYOR | `page.tsx:209-218` | `CardTitle` bir `h3` (`components/ui/card.tsx:44`); sayfada `h1` yok. |
| 8 | Davet kodu satırı ("bonus puan kazanacaksınız") | KISMİ | `page.tsx:60, 213-217` | Herhangi bir `?ref=` değeri için vaat gösteriliyor; kod geçerli mi, aktif mi, limiti dolmuş mu kontrol edilmiyor. Geçersiz kodda sunucu sessizce yok sayıyor (`route.ts:106-108`). |
| 9 | Hesap türü seçimi (Müşteri / İşletme) | KISMİ | `page.tsx:23-26, 146-149, 221-252` | E-posta yolunda çalışır; OAuth yolunda seçim kayboluyor (bkz. #11). `role="group"` + `aria-pressed` yerine radio semantiği daha doğru. |
| 10 | OAuth sağlayıcı keşfi (`/api/public/auth-features`) | ÇALIŞIYOR | `page.tsx:69-78`, `app/api/public/auth-features/route.ts:9-24` | Yalnız yapılandırılmış sağlayıcı gösteriliyor; hata yutuluyor (butonlar gizli kalır, kabul edilebilir). |
| 11 | Google ile kayıt | KISMİ | `page.tsx:151-160` | `role` OAuth'a hiç taşınmıyor; yeni kullanıcı `@default(CUSTOMER)` (`prisma/schema.prisma` User.role) ile oluşur, `next=/dealer` proxy tarafından `/customer`'a çevrilir (`proxy.ts:59-71`). İşletme seçen kullanıcı sessizce müşteri olur. |
| 12 | GitHub ile kayıt | KISMİ | `page.tsx:162-164, 286-300` | #11 ile aynı rol kaybı. Tüketici uygulamasında GitHub'ın varlığı da hedef kitleyle uyumsuz. |
| 13 | "veya e-posta ile kayıt" ayırıcısı | ÇALIŞIYOR | `page.tsx:304-313` | |
| 14 | İsim alanı (2–50 karakter) | ÇALIŞIYOR | `page.tsx:318-339`, `lib/validations.ts:21-25` | |
| 15 | E-posta alanı | KISMİ | `page.tsx:341-364`, `lib/validations.ts:26-29` | `trim()`/`toLowerCase()` yok; DB'de `email @unique` büyük/küçük harfe duyarlı, login `findUnique({ email: cred.email })` birebir arıyor (`lib/auth.ts:136-137`). `Ali@Gmail.com` ile kayıt olan `ali@gmail.com` ile giremez ve iki ayrı hesap açılabilir. |
| 16 | Şifre alanı + karmaşıklık kuralı | ÇALIŞIYOR | `page.tsx:366-396`, `lib/validations.ts:30-37` | Kurallar yalnız hata sonrası görünüyor; güç göstergesi yok. |
| 17 | Şifre göster/gizle | ÇALIŞIYOR | `page.tsx:381-388` | 44px hedef, doğru aria-label. Tek toggle iki alanı birden açar (bilinçli). |
| 18 | Şifre tekrar alanı + eşleşme kontrolü | ÇALIŞIYOR | `page.tsx:398-420`, `lib/validations.ts:41-44` | |
| 19 | Alan hata mesajları (i18n anahtarları) | ÇALIŞIYOR | `page.tsx:333-338` vb., `lib/translate-known-message.ts:5-11` | `role="alert"` + `aria-describedby` bağlı. |
| 20 | Gönder butonu (loading) | ÇALIŞIYOR | `page.tsx:422-424`, `components/ui/button.tsx:54-64` | Loading'de `disabled`, çift gönderim engelli. |
| 21 | Kayıt API'si `POST /api/auth/register` | KISMİ | `app/api/auth/register/route.ts:12-180` | Çalışır; ama atomik değil, e-posta normalize etmiyor, davet limitlerini atlıyor (bkz. bulgular). |
| 22 | Hız sınırı (5 istek/dk/IP) | ÇALIŞIYOR | `route.ts:13-28`, `lib/rate-limit.ts:23-37, 208-212` | `Retry-After` istemcide kullanılmıyor, sadece genel toast. |
| 23 | Sunucu hata toast'ları | KISMİ | `page.tsx:105-111` | "Bu email adresi zaten kayıtlı" düz Türkçe metin olarak dönüyor (`route.ts:50`); `auth.emailAlreadyRegistered` anahtarı `messages/tr.json:2409`'da mevcut ama kullanılmıyor → EN kullanıcı Türkçe hata görür. |
| 24 | "E-postanızı doğrulayın" kartı | BOZUK | `page.tsx:115-125, 166-199`, `route.ts:161-167` | Kart yalnız `result.verifyUrl` dönerse açılır; sunucu `verifyUrl`'i yalnız *e-posta gönderilemediğinde VE production dışında* döndürüyor. Üretimde bu ekran **hiç** görünmez. |
| 25 | "Doğrulama linki gönderildi" varyantı (`verifySentTemplate`, `verifyOpenLinkSent`) | SAHTE (ölü kod) | `page.tsx:167-169` | `emailSent === true` ile `verifyUrl` aynı anda gelemez (`route.ts:161`); bu dal erişilemez. |
| 26 | "Başka hesapla kayıt ol" | ÇALIŞIYOR | `page.tsx:187-194` | Yalnız geliştirme ortamında görülebilen kartın içinde. |
| 27 | Kayıt sonrası otomatik giriş + panel yönlendirmesi | BOZUK | `page.tsx:131-138`, `lib/auth.ts:165-169` | `emailVerified` null olduğu için `signIn('credentials')` her zaman başarısız; sonuç kontrol edilmiyor. `router.push('/customer')` → proxy `/auth/login`'e atar (`proxy.ts:72`). Ayrıca her kayıtta `recordFailedLoginAttemptDb` bir "başarısız giriş" yazar (`lib/auth.ts:166`). |
| 28 | Başarı toast'ı ("Giriş yapabilirsiniz" / "Davet bonusu eklendi. Giriş yapabilirsiniz.") | BOZUK | `page.tsx:127-129`, `messages/tr.json` `auth.toastCanSignIn`, `auth.toastReferralBonus` | Üretimde yanlış bilgi: kullanıcı doğrulamadan giriş yapamaz. |
| 29 | Davet bonusu uygulama (sunucu) | KISMİ | `route.ts:99-146` | Puan basıyor ve `points_credited` yazıyor (değişmez uyumlu), ama doğrulamasız, modül anahtarı/ömür boyu/aylık limitler olmadan (bkz. B1). |
| 30 | Doğrulama e-postası gönderimi | ÇALIŞIYOR | `route.ts:74-87`, `lib/email.ts:25-49` | İstek yolunda senkron; SMTP zaman aşımları 15–20 sn (`lib/mail-sender.ts:82`). Şablon yalnız Türkçe. |
| 31 | "E-postanızı doğrulayın" bildirimi | KISMİ | `route.ts:89-97` | `type: 'success'`, sabit Türkçe metin; doğrulamadan sonra da okunmamış kalan bayat bir bildirim. |
| 32 | İstemci analitiği (PostHog `user_registered`) | ÇALIŞIYOR | `page.tsx:113`, `lib/analytics.ts:6-14` | `identify` çağrılmıyor; huni kişi bazında kopuk. |
| 33 | Sunucu analitiği (`AnalyticsEvent user_registered`) | ÇALIŞIYOR | `route.ts:148-156` | |
| 34 | Kullanım Şartları / Gizlilik Politikası linkleri | ÇALIŞIYOR | `page.tsx:427-443`, `app/(public)/kullanim-sartlari`, `app/(public)/gizlilik-politikasi` | Onay zımni ("kayıt olarak kabul edersiniz"); hiçbir onay zaman damgası saklanmıyor. |
| 35 | "Zaten hesabınız var mı? Giriş yapın" | ÇALIŞIYOR | `page.tsx:446-454` | `?ref=` login'e taşınmıyor (davet bağlamı kaybolur). |
| 36 | "Şifrenizi mi unuttunuz?" | KISMİ | `page.tsx:455-460`, `app/api/auth/forgot-password/route.ts:67` | Kayıt sayfasında yeri tuhaf; doğrulanmamış hesaba işe yaramıyor (yalnız `emailVerified` olana mail atar). |
| 37 | Segment hata sınırı (Sentry + tekrar dene) | ÇALIŞIYOR | `app/(auth)/error.tsx:11-53` | |
| 38 | Metadata (noindex + başlık şablonu) | ÇALIŞIYOR | `app/(auth)/auth/register/layout.tsx:4-6`, `app/(auth)/layout.tsx:4-6`, `app/(auth)/auth/layout.tsx:9-20` | |
| 39 | Oturum açıksa panele yönlendirme | EKSİK | `proxy.ts:124` (matcher `/auth/*` içermiyor), sayfada `useSession` yok | Giriş yapmış kullanıcı kayıt formunu görür. |
| 40 | Doğrulama e-postasını yeniden gönder | EKSİK | `app/api/auth/` altında böyle bir uç yok | Link 24 saatte ölür (`route.ts:81`) → hesap kalıcı kilitli (bkz. B3). |
| 41 | Şifre gücü / kural checklist'i | EKSİK | `page.tsx:366-396` | |
| 42 | Dil tercihini (`preferredLanguage`) kaydetme | EKSİK | `route.ts:57-64` | Varsayılan `"tr"`; EN arayüzle kayıt olan kullanıcı TR mail/bildirim alır. |
| 43 | Bot koruması (Turnstile/hCaptcha, tek kullanımlık e-posta filtresi) | EKSİK | Kod tabanında `turnstile|hcaptcha|recaptcha|disposable` yok | Davet suistimaliyle birleşince kritik (B1). |
| 44 | KVKK açık rıza / ticari ileti (İYS) izni kaydı | EKSİK | `User` modelinde onay alanı yok | Yalnız zımni metin; denetlenebilir onay kaydı yok. |

**Özet:** 44 özellik · 24 ÇALIŞIYOR · 10 KISMİ · 3 BOZUK · 1 SAHTE · 6 EKSİK

---

## Bulgular

### B1 — Kayıt rotası davet puanını doğrulamasız ve limitsiz basıyor
- **Önem:** kritik · **Kategori:** güvenlik / puan ekonomisi
- **Kanıt:** `app/api/auth/register/route.ts:99-146` (kredi, kullanıcı oluşturulduğu anda, `emailVerified: null` iken `route.ts:63`); karşılaştırma: `app/api/referral/route.ts:120-121` (`assertModuleEnabled('referrals')`), `:164-170` (`maxInvitesPerReferrerLifetime`, varsayılan 100), `:172-186` (`maxRedemptionsPerReferralCodePerMonth`, varsayılan 30) — **bunların hiçbiri kayıt rotasında yok**. Varsayılan ödül: davet eden 1000, davet edilen 500 puan (`lib/points-rules.ts:63-66`).
- **Sorun:** Bir kullanıcı kendi `?ref=` linkiyle sahte/tek kullanımlık e-postalarla kayıt açarak her hesap için 1000 puan kazanır; e-posta doğrulaması, CAPTCHA, modül kapatma anahtarı ve aylık/ömür boyu tavanlar devre dışı. Hız sınırı yalnız IP başına 5/dk (`route.ts:14`) — IP döndürmeyle pratikte sınırsız. Ayrıca `COMPLETED` davet sayısı kademe ödüllerini de (`app/api/referral/route.ts:69-90`, `lib/referral-milestones.ts`) besliyor; ikinci bir puan musluğu açılıyor. `points_credited` yazıldığı için velocity dedektörü görür ama yalnız işaretler, engellemez. `maxUsage` kontrolü de oku-sonra-yaz (`route.ts:107` → `:132-135`), eşzamanlı kayıtlarda aşılabilir.
- **Profesyonel öneri:** Davet ödülünü **iki aşamalı** yapın: kayıt anında `Referral` satırı `status: 'PENDING'` (puansız) oluşturulsun; puan **e-posta doğrulandığında** (`app/api/auth/verify-email/route.ts` içinde, aynı transaction'da) ve tercihen "ilk gerçek eylem" (ilk `ConsumptionReview`) sonrası `updateMany({ where: { id, status: 'PENDING' } })` claim deseniyle tek seferlik verilsin. Limit/modül kontrollerini tek bir `applyReferral(tx, { referredId, code })` servisine (`lib/referral-service.ts`) taşıyın ve hem `/api/referral` hem kayıt/doğrulama yolu bunu çağırsın. `maxUsage`'ı `updateMany({ where: { id, OR: [{ maxUsage: null }, { usageCount: { lt: maxUsage } }] }, data: { usageCount: { increment: 1 } } })` ile atomik claim edin, `count === 0` ise ödülsüz devam edin. Kayıt formuna Cloudflare Turnstile ekleyin.
- **Efor:** M

### B2 — Üretimde kayıt sonrası akış kırık: doğrulama ekranı yok, "giriş yapabilirsiniz" yalanı, sessiz login yönlendirmesi
- **Önem:** yüksek · **Kategori:** işlevsellik / UX
- **Kanıt:** Sunucu `verifyUrl`'i yalnız `!emailSent && NODE_ENV !== 'production'` iken döndürüyor (`route.ts:161-167`). İstemci doğrulama kartını yalnız `result.verifyUrl` varsa açıyor (`page.tsx:115-125`); aksi halde "Giriş yapabilirsiniz" toast'ı (`page.tsx:127-129`), `signIn('credentials')` (`page.tsx:131-135`, sonuç kontrol edilmiyor) ve `router.push('/customer')` (`page.tsx:137`). `authorize` doğrulanmamış hesabı reddediyor (`lib/auth.ts:165-169`), proxy oturumsuz kullanıcıyı `/auth/login`'e atıyor (`proxy.ts:72`).
- **Sorun:** Üretimdeki her e-posta kaydı: (1) yanlış başarı mesajı, (2) arka planda başarısız giriş denemesi — `recordFailedLoginAttemptDb` sayaca yazılıyor, 5'te 15 dk kilit (`lib/auth.ts:166`, `lib/rate-limit.ts:215-216`), (3) açıklamasız login ekranı, (4) kullanıcı tekrar denediğinde "E-postanızı doğrulayın" hatası. Kart içindeki `verifySentTemplate` dalı ise ölü kod (`page.tsx:167-169`). Bu, QR okutup "puan kazanmak" için gelen tüketicinin dönüşüm hunisindeki en kritik adımda kopuş demek. E-posta hiç gönderilemezse (SMTP yok) üretimde kullanıcının hiçbir doğrulama yolu da kalmıyor; sunucunun döndürdüğü `message` (`route.ts:169-171`) istemcide gösterilmiyor.
- **Profesyonel öneri:** API sözleşmesini açık hale getirin: `{ status: 'verification_required', emailSent: boolean, maskedEmail, devVerifyUrl? }`. İstemci `status === 'verification_required'` olduğunda **her zaman** "Gelen kutunu kontrol et" ekranına geçsin (otomatik `signIn` yalnız doğrulama gerekmeyen durumda ve `res.ok` kontrolüyle). Bu ekranda: maskeli e-posta, "Gmail'i aç / Outlook'u aç" kısayolları, 60 sn geri sayımlı "Tekrar gönder" (B3), "E-postayı yanlış yazdım" (hesabı silip yeniden başlatan değil, adresi güncelleyen uç), ve doğrulama linki başka cihazda açıldığında bu sekmenin kendini ilerletmesi için 5 sn'lik hafif polling (`GET /api/auth/verify-status?email=` → yalnız boolean, hız sınırlı). `emailSent === false` ise kullanıcıya açıkça "Doğrulama e-postası gönderilemedi" deyin ve yeniden gönder butonunu öne çıkarın.
- **Efor:** M

### B3 — Doğrulanmamış hesabın kurtarma yolu yok; e-posta "işgali" mümkün
- **Önem:** yüksek · **Kategori:** güvenlik / veri bütünlüğü
- **Kanıt:** Token 24 saat (`route.ts:81`); yeniden gönderme ucu yok (`app/api/auth/` altında `register, verify-email, forgot-password, magic-link, set-password, reset-password, 2fa` var, resend yok); şifre sıfırlama ve magic link yalnız `emailVerified` hesaplara çalışıyor (`app/api/auth/forgot-password/route.ts:67`, `app/api/auth/magic-link/route.ts:72`); aynı e-postayla tekrar kayıt reddediliyor (`route.ts:44-51`).
- **Sorun:** (a) Doğrulama linki 24 saatte kullanılmayan her kullanıcı kalıcı olarak kilitli — ne giriş ne kayıt ne sıfırlama yapabiliyor. (b) Bir saldırgan başkasının e-postasıyla kayıt açarsa gerçek sahip e-posta+şifreyle asla kayıt olamaz. Google/GitHub `allowDangerousEmailAccountLinking: true` (`lib/auth.ts:45, 52`) olduğundan mağdur OAuth ile girerse saldırganın yarattığı kullanıcı satırına (saldırganın adı ve şifre hash'iyle) bağlanır; `/auth/complete` "şifre var" diye şifre belirleme adımını da atlar. `emailVerified` null kaldığı sürece saldırgan şifreyle giremiyor, ancak bu satırın sonradan doğrulanacağı bir yol eklenirse ön-ele-geçirme (pre-hijack) açığına dönüşür — istismar uçtan uca **doğrulanmadı**.
- **Profesyonel öneri:** `POST /api/auth/resend-verification` (e-posta + IP başına hız sınırı, yanıt her zaman aynı → enumeration yok, eski token'ları sil). Kayıtta mevcut ama **doğrulanmamış** bir e-posta gelirse 400 yerine: şifreyi güncelle + yeni token gönder (ya da 7 günden eski doğrulanmamış satırları cron ile temizleyin). OAuth ile hesap bağlanırken satır doğrulanmamışsa `events.linkAccount` içinde mevcut `password`'ü null'layıp `emailVerified`'ı set edin (sağlayıcı e-postayı kanıtladı; saldırganın şifresi geçersizleşir).
- **Efor:** M

### B4 — E-posta normalize edilmiyor (büyük/küçük harf, boşluk)
- **Önem:** yüksek · **Kategori:** veri bütünlüğü
- **Kanıt:** `lib/validations.ts:26-29` (yalnız `.email()`), `route.ts:40-46, 57-64`; login `lib/auth.ts:136-137` birebir eşleşme; `forgot-password` ise `toLowerCase()` yapıyor (`app/api/auth/forgot-password/route.ts:61`) → yollar arası tutarsız.
- **Sorun:** Mobil klavyenin otomatik büyük harfiyle `Ayse@gmail.com` kaydı oluşur; kullanıcı `ayse@gmail.com` ile giriş yapamaz, şifre sıfırlama ise küçük harfli adresi arayıp bulamaz. Aynı kişi için iki hesap (ve iki davet bonusu) açılabilir.
- **Profesyonel öneri:** Tek bir `emailSchema = z.string().trim().toLowerCase().email().max(320)` tanımlayıp register/login/forgot/magic/verify yollarının hepsinde kullanın; mevcut veride çakışan kayıtları tespit eden salt-okunur bir rapor betiği ile (canlı DB'ye yazmadan) temizlik planı çıkarın; uzun vadede Postgres `citext` veya `lower(email)` unique index.
- **Efor:** S

### B5 — Kayıt işlemi atomik değil, SMTP istek yolunda senkron
- **Önem:** orta · **Kategori:** mimari / performans
- **Kanıt:** `route.ts:57-72` (user.create) → `:77-83` (token) → `:87` (SMTP) → `:90-97` (bildirim) → `:101-146` (davet tx) → `:149-156` (analitik); hepsi seri `await`, tek `try` altında, hata halinde `500 auth.registerServerError` (`route.ts:173-179`). E-posta varlık kontrolü ile `create` arası yarışta P2002 de 500 olarak döner.
- **Sorun:** Kullanıcı oluşturulduktan sonraki herhangi bir hata kullanıcıya "kayıt başarısız" der ama hesap oluşmuştur; yeniden denemede "zaten kayıtlı" alır ve (B3 yüzünden) kilitlenir. SMTP yavaşsa kullanıcı 15–40 sn spinner izler.
- **Profesyonel öneri:** User + VerificationToken + bildirim + `Referral(PENDING)` + analitik tek `prisma.$transaction` içinde; e-posta gönderimi transaction sonrası `after()` ile (projede feedback için kullanılan desen) ya da kuyrukta; P2002'yi 409 `auth.emailAlreadyRegistered` olarak eşleyin.
- **Efor:** S

### B6 — OAuth ile "İşletme" seçimi sessizce kayboluyor
- **Önem:** orta · **Kategori:** işlevsellik
- **Kanıt:** `page.tsx:151-164` (rol yalnız `next` yolunu etkiliyor), User.role `@default(CUSTOMER)`, `proxy.ts:59-71` (`/dealer` → CUSTOMER rolünü `/customer`'a yönlendirir), `app/(auth)/auth/complete/page.tsx:24-25, 44`.
- **Sorun:** Google ile "İşletme" kaydı yapan kullanıcı müşteri paneline düşer, hiçbir açıklama görmez.
- **Profesyonel öneri:** Rol seçimini kayıt formundan çıkarın (bkz. vizyon): tüketici kaydı varsayılan, işletme kaydı ayrı bir `/isletme/kayit` akışı (vergi no, işletme adı, onboarding). Kısa vadede: OAuth öncesi imzalı, kısa ömürlü bir `signup_intent` çerezi yazıp `/auth/complete`'te sunucu tarafında (yalnız yeni oluşturulmuş kullanıcı için) rolü uygulayın.
- **Efor:** M

### B7 — Davet bonusu vaadi doğrulanmadan gösteriliyor
- **Önem:** orta · **Kategori:** UX / güven
- **Kanıt:** `page.tsx:60, 213-217`; sunucu geçersiz/pasif/limiti dolmuş kodu sessizce atlıyor (`route.ts:106-108`); public doğrulama ucu yok (`app/api/public/` yalnız `auth-features, experience-share, stats`).
- **Sorun:** `?ref=BOGUS` ile gelen kullanıcıya "bonus puan kazanacaksınız" denir, sonra bonus gelmez. Ayrıca davet edenin adı/avatarı gösterilmediği için sosyal kanıt fırsatı kaçıyor.
- **Profesyonel öneri:** `GET /api/public/referral/[code]` → `{ valid, inviterFirstName, inviterAvatar, bonusPoints }` (hız sınırlı, Redis cache 60 sn). Kayıt kartının üstünde "Ayşe seni davet etti — kaydolunca **500 puan** senin" kartı; kod geçersizse sessizce gizlenir.
- **Efor:** S

### B8 — Dil karışıklığı (TR/EN) ve sabit Türkçe sunucu metinleri
- **Önem:** düşük · **Kategori:** i18n
- **Kanıt:** `route.ts:50` düz metin (anahtar `auth.emailAlreadyRegistered` `messages/tr.json:2409`'da var); bildirimler sabit TR (`route.ts:93-94, 138-139`); doğrulama e-postası yalnız TR (`lib/email.ts:26-45`); TR etiketi "Email" (`messages/tr.json` `auth.emailLabel`) — diğer metinler "E-posta" diyor; `preferredLanguage` set edilmiyor (`route.ts:57-64`).
- **Profesyonel öneri:** Hata dönüşlerini anahtar olarak verin, istemci dilini (`useAppLocale`) payload'a ekleyip `preferredLanguage`'a yazın ve mail/bildirim şablonlarını bu dile göre seçin.
- **Efor:** S

### B9 — Erişilebilirlik ve küçük UX boşlukları
- **Önem:** düşük · **Kategori:** erişilebilirlik
- **Kanıt:** Sayfada `h1` yok (`CardTitle` = `h3`, `components/ui/card.tsx:44`); rol seçimi `role="group"` + `aria-pressed` (`page.tsx:221-232`) — tek seçimli olduğundan `radiogroup`/`radio` + ok tuşu gezinmesi beklenir; şifre kuralları ancak hata sonrası duyuruluyor; ilk hatalı alana odak taşınması `react-hook-form`'un varsayılan `shouldFocusError`'una bırakılmış (doğrulanmadı); AuthShell logoları `mounted` sonrası çiziliyor (`auth-shell.tsx:62`) → CLS.
- **Profesyonel öneri:** `CardTitle asChild` ya da `as="h1"`; rol seçimini Radix `RadioGroup` ile; şifre altında canlı checklist (`aria-live="polite"`); logo için CSS `dark:` tabanlı tek render (mounted koşulu gereksiz, iki `<Image>` zaten class ile ayrışıyor).
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Değer önizlemesi / "hoş geldin ödülü" vitrini** — Starbucks Rewards kayıt ekranı ilk ödülü (ör. doğum günü içeceği, hoş geldin yıldızları) somut gösterir; Duolingo kayıttan önce değer sunar. Qratex kaydında puan, rozet, lig, oyun vaadinin hiçbiri görünmüyor; yalnız "avantajlardan yararlanın" (`messages/tr.json` `auth.registerSubtitle`).
2. **Önce dene, sonra kaydol (progressive onboarding)** — Duolingo hesap açmadan ilk dersi oynatır. QR okutan kullanıcı geri bildirimini misafir olarak bırakıp, "kazandığın 50 puanı kaybetme — kaydet" anında kaydolmalı; şu an kayıt duvarı önde.
3. **Şifresiz kayıt (magic link / passkey / Apple ile giriş)** — Revolut/Monzo tarzı mobil his için e-posta kodu (OTP) ve WebAuthn passkey; iOS kitlesi için "Apple ile devam et". Projede magic-link altyapısı var (`app/api/auth/magic-link`) ama yalnız doğrulanmış hesaplara.
4. **Doğrulama ekranında gelen kutusu kısayolları + yeniden gönder + otomatik ilerleme** (B2/B3).
5. **Sosyal kanıt ile davet karşılaması** — "Ayşe seni davet etti" kişiselleştirilmiş kart (B7).
6. **Denetlenebilir KVKK/İYS onayı ve pazarlama izni** — ayrı, varsayılan kapalı onay kutusu + `ConsentRecord` tablosu (sürüm, zaman, IP).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "30 saniyede ilk puanını kazan." Kayıt bir form değil, sadakat programına giriş töreni. Tüketici odaklı tek akış; işletme kaydı ayrı kapıdan.

**Yerleşim (mobil öncelikli, tek sütun, 3 adım):**
1. **Karşılama** — Üstte ödül vitrini: davetle gelindiyse davet edenin avatarı + "500 puan seni bekliyor"; QR'dan gelindiyse işletme logosu + "Bu ziyaretin puanını kaydet". Altında büyük "Google ile devam et" / "Apple ile devam et" ve "E-posta ile devam et". Rol seçimi yok; alt kenarda küçük "İşletme misiniz? İşletme hesabı açın →" bağlantısı.
2. **Kimlik** — Yalnız e-posta (identifier-first). Mevcut ve doğrulanmış hesapsa şifre adımına (login ile birleşik akış), yeni ise isim + şifre (canlı kural checklist'i, göster/gizle) ya da "şifresiz devam et (e-posta kodu)". Tek "Devam" butonu, alt kenara sabit (safe-area).
3. **Doğrula & ödül** — Maskeli e-posta, gelen kutusu kısayolları, 60 sn geri sayımlı tekrar gönder, otomatik ilerleme. Doğrulama tamamlanınca "Hoş geldin" ekranı: puan sayacı 0 → 500'e tıklanarak dolar, ilk rozet ("Yeni Üye") yerine oturur, "İlk QR'ını okut" CTA'sı.

**Motion / 3D (ölçülü):** Adımlar arası yatay `AnimatePresence` kaydırma (200–250 ms, reduced-motion'da çapraz solma). Ödül vitrininde projedeki imza sürpriz kutusunun (`three.js`) **statik/düşük maliyetli poster karesi** veya CSS ile hafif parıltı — kayıt sayfası LCP'si için gerçek 3B sahne yüklemeyin; 3B açılışı yalnız doğrulama sonrası "hoş geldin" ekranında, `ssr:false` + lazy ile. Puan sayacı `useSpring`; konfeti tek seferlik ve kısa.

**Veri / API değişiklikleri:**
- `POST /api/auth/register` → tek transaction; yanıt `{ status: 'verification_required' | 'signed_in', emailSent, maskedEmail }`; e-posta `after()`/kuyruk.
- `POST /api/auth/resend-verification`, `GET /api/auth/verify-status` (boolean, hız sınırlı).
- `GET /api/public/referral/[code]` (davet önizlemesi).
- `lib/referral-service.ts` → `createPendingReferral` (kayıtta) + `completeReferral` (doğrulamada; modül, ömür/aylık tavan, atomik `maxUsage` claim, `points_credited`).
- Ortak `emailSchema` (trim + lowercase) tüm auth yollarında.
- `User.preferredLanguage` kayıtta set; `ConsentRecord` modeli (KVKK/İYS).
- Turnstile doğrulaması (`lib/turnstile.ts`) kayıt ve yeniden gönder uçlarında.
- `/auth/*` için oturum açık kullanıcıyı rolüne göre yönlendiren sunucu kontrolü (layout'ta `getServerSession` veya proxy matcher'a `/auth/:path*` eklemek).

---

## Çakışmalar / birleştirme önerisi

- **`/auth/login` ile çakışma:** İki sayfa aynı kart iskeletini, OAuth butonlarını, `auth-features` çağrısını ve şifre alanını kopyalıyor (`app/(auth)/auth/login/page.tsx:272-278` vs `register/page.tsx:202-208`). Identifier-first tek bir `/auth` akışında birleştirilmeli (`/auth/login` ve `/auth/register` aynı bileşene farklı başlangıç adımıyla yönlensin); OAuth buton grubu ve şifre alanı `components/auth/` altında paylaşılan bileşenlere çıkarılmalı.
- **`/auth/complete` ile çakışma:** Davet uygulama mantığı üç yerde (kayıt API'si, `/api/referral`, `/auth/complete` → `/api/referral`) — tek servis (`lib/referral-service.ts`) altında toplanmalı. `/auth/complete`'in "şifre oluştur" adımı yeni akışın 2. adımıyla aynı işi yapıyor; birleşik akışa alınabilir.
- **`/auth/verify-email`:** Doğrulama sonrası "hoş geldin + ödül" ekranı bu sayfa üzerinden açılmalı; şu an kayıt sayfasındaki ölü doğrulama kartı (`page.tsx:166-199`) kaldırılıp tek "gelen kutunu kontrol et" bileşenine dönüştürülmeli.
- **İşletme kaydı:** Rol seçimi bu tüketici sayfasından ayrılıp işletme onboarding'ine (`app/dealer/onboarding`) bağlı ayrı bir kayıt kapısına taşınmalı.

---

## Doğrulama (şüpheci inceleme)

Salt okunur inceleme; kod çalıştırılmadı, veritabanına dokunulmadı. Okunan dosyalar: `app/(auth)/auth/register/page.tsx`, `app/api/auth/register/route.ts`, `app/api/referral/route.ts`, `lib/auth.ts`, `lib/validations.ts`, `lib/rate-limit.ts`, `lib/points-rules.ts`, `lib/innovation-config.ts`, `app/api/auth/{verify-email,forgot-password,magic-link,set-password}/route.ts`, `proxy.ts`, `prisma/schema.prisma`, `messages/tr.json`.

### 1. Kayıt rotası davet puanını doğrulamasız ve limitsiz basıyor — **DOĞRULANDI**
- Kredi, kullanıcı `emailVerified: null` (`route.ts:63`) ile oluşturulduktan hemen sonra aynı istekte yazılıyor (`route.ts:101-146`); doğrulama linkine tıklanmasını bekleyen hiçbir koşul yok. `verify-email/route.ts` yalnız `emailVerified` set ediyor, puanla ilgisi yok.
- `/api/referral` POST'taki üç koruma kayıt yolunda yok: `assertModuleEnabled('referrals')` (`referral/route.ts:120-121`), ömür boyu tavan 100 ve aylık tavan 30 (`referral/route.ts:164-186`, varsayılanlar `lib/innovation-config.ts:71-72`). Yalnız `maxUsage` kontrolü var (`route.ts:107`) ve o da tx dışında okunup tx içinde artırılıyor (`route.ts:132-135`) — yarış penceresi küçük ama gerçek.
- Tek fren `register:${ip}` 5/dk (`route.ts:14`); `getClientIdentifier` `x-forwarded-for` ilk değerini alıyor (`lib/rate-limit.ts:208-211`). Vercel arkasında bu başlık platformca yazıldığı için IP sahteciliği sınırlı, fakat birkaç IP/proxy ile ölçeklenir.
- Yeniden üretim: A kullanıcısı kendi `?ref=KOD` linkini alır → `POST /api/auth/register` gövdesine `{name, email:"x1@tek-kullanimlik.tld", password:"Aa123456", confirmPassword:"Aa123456", role:"CUSTOMER", referralCode:"KOD"}` gönderir → yanıt `referralApplied:true`; A'nın cüzdanına 1000 puan (`lib/points-rules.ts:63-66`) + `Referral` satırı `COMPLETED` olarak yazılır. Gerçek posta kutusu gerekmez. Dakikada 5, saatte 300 tekrar; referral modülü yönetimden kapatılmış olsa bile çalışır. COMPLETED sayısı kademe ödüllerini (`claimableReferralMilestones(completedCount…)`, `referral/route.ts:~90`) de besler.
- Not: `points_credited` yazılması (`route.ts:126-131`) sadece görünürlük sağlar; engelleme yoktur. Önerilen düzeltme raporun önceki bölümündeki yönle uyumlu: kayıtta `PENDING` referral, kredi `verify-email` başarısında tek servis (`lib/referral-service.ts`) üzerinden, modül + ömür/aylık tavan + atomik `updateMany where usageCount < maxUsage` claim ile.

### 2. Üretimde doğrulama ekranı gösterilmiyor, yanlış "giriş yapabilirsiniz" + sessiz başarısız giriş — **DOĞRULANDI**
- `verifyUrl` yalnız `!emailSent && NODE_ENV !== 'production'` iken dönüyor (`route.ts:161-167`). İstemci doğrulama kartını yalnız `result.verifyUrl` varken açıyor (`page.tsx:115-125`). Dolayısıyla e-posta BAŞARIYLA gönderildiğinde (üretimin normal yolu, hatta geliştirmede de) kart hiç açılmaz; `verifySentTemplate` dalı (`page.tsx:167-169`) pratikte erişilemez (yalnız dev'de `emailSent=false` iken kart açılır ve o zaman da `verifyDevTemplate` seçilir).
- Bunun yerine `toastCanSignIn` = "Giriş yapabilirsiniz." (`messages/tr.json:2419`) gösterilir (`page.tsx:127-129`), `signIn('credentials', {redirect:false})` sonucu kontrol edilmez (`page.tsx:131-135`); `authorize` `emailVerified` null olduğu için hata fırlatır ve `recordFailedLoginAttemptDb(ip:email)` ile lockout sayacına 1 deneme yazar (`lib/auth.ts:165-169`). Ardından `router.push('/customer' | '/dealer')` → token olmadığı için `proxy.ts` (withAuth `authorized: !!token`, `proxy.ts:72` civarı) kullanıcıyı açıklamasız `/auth/login`'e atar.
- Yeniden üretim: üretimde e-posta ile kayıt ol → "Kayıt başarılı! Giriş yapabilirsiniz." toast'u → login sayfasına düşülür, "e-postanı kontrol et" yönlendirmesi yok. Sunucunun doğru `message` alanı (`route.ts:169-171`) istemcide hiç kullanılmıyor; e-posta gönderilemezse üretimde kullanıcı hiçbir doğrulama yolu görmez.
- Şiddet notu: lockout etkisi tek deneme (5 eşiğinden) olduğu için ikincil; asıl etki her üretim kaydında yanlış yönlendirme ve terk.

### 3. Doğrulanmamış hesap kalıcı kilitleniyor; e-posta işgali — **DOĞRULANDI** (tam pre-hijack kısmı koşullu)
- Token 24 saat (`route.ts:81`). `app/api/auth` altında yeniden gönderim ucu yok (dizin: `2fa, [...nextauth], forgot-password, magic-link, register, reset-password, set-password, verify-email`); `sendVerificationEmail` yalnız `register` ve `test-email` tarafından çağrılıyor. `forgot-password` (`:67`) ve `magic-link` (`:72`) yalnız `emailVerified` hesaba token üretiyor; kayıt aynı e-postayı reddediyor (`route.ts:44-51`); doğrulanmamış kullanıcıları temizleyen cron/iş yok (repo genelinde `emailVerified`/`verificationToken` aramasıyla doğrulandı).
- Senaryo A (kendi hesabı): link 24 saat içinde açılmazsa → login "E-posta adresinizi doğrulayın", kayıt "zaten kayıtlı", şifre sıfırlama sessizce gönderilmez. Kurtuluş yalnız OAuth (yapılandırılmışsa) veya admin müdahalesi.
- Senaryo B (işgal): saldırgan `kurban@gmail.com` ile kayıt açar → kurban e-posta+şifre ile hiç kayıt olamaz. Kurban Google ile girerse `allowDangerousEmailAccountLinking: true` (`lib/auth.ts:45,52`) mevcut satıra bağlanır; bu yol `createUser` event'ini tetiklemediği için `emailVerified` null kalır (`lib/auth.ts:316-321` yalnız yeni kullanıcıda çalışır), `/api/auth/set-password` ise şifre zaten olduğu için reddeder (`set-password/route.ts:55-57`) → saldırganın şifre hash'i kurbanın aktif hesabında durur.
- Tam ele geçirme ek bir kurban eylemi gerektirir: kurban kendi kutusuna gelen (saldırganın tetiklediği) doğrulama linkine tıklarsa `emailVerified` set olur ve saldırgan kendi bildiği şifreyle aynı hesaba girer. Bu zincir kod okumasıyla tutarlı ama kurbanın tıklamasına bağlı; "doğrulanmadı/koşullu" olarak işaretlenmeli. Kayıt engelleme (DoS) kısmı koşulsuz gerçektir.

### 4. E-posta büyük/küçük harf normalize edilmiyor — **DOĞRULANDI**
- `registerSchema.email` trim/lowercase yapmıyor (`lib/validations.ts:26-29`); kayıt ham değeri `findUnique`/`create` ediyor (`route.ts:44-64`); `User.email` düz `String @unique` (citext yok, `prisma/schema.prisma` User modeli) → Postgres'te büyük/küçük harfe duyarlı benzersizlik. `authorize` `cred.email`'i birebir arıyor (`lib/auth.ts:136-137`).
- En sert etki iddiada belirtilenden de ağır: `forgot-password` (`:61`) ve `magic-link` (`:66`) e-postayı küçültüp arıyor → `Ayse@gmail.com` olarak kaydolmuş bir kullanıcı, adresi birebir aynı yazsa bile şifre sıfırlama ve sihirli link alamaz (kullanıcı bulunamaz). Girişte ise yalnız birebir aynı harf düzeniyle girebilir.
- Yeniden üretim: `Ayse@gmail.com` ile kayıt → doğrula → `ayse@gmail.com` ile giriş "E-posta veya şifre hatalı"; şifre sıfırlama hiçbir zaman e-posta göndermez. `ayse@gmail.com` ile ikinci kayıt da kabul edilir → aynı kişiye iki hesap ve (bulgu 1 ile birleşince) iki davet kredisi.
- Küçük düzeltme: "mobil klavye otomatik büyük harf" gerekçesi zayıf — `type="email"` alanlarında iOS/Android genelde otomatik büyük harf uygulamaz; ama tarayıcı otomatik doldurma, kopyala-yapıştır ve elle yazılan büyük harf aynı sonucu doğurur. Bulgu gerçek; tetikleyici gerekçe abartılı.

---

## Uygulama (Dalga 2)

Sahip: p-auth yüzeyi. A1 (P0-16 davet PENDING, P0-39 doğrulama ekranı + resend ucu, OAuth niyet çerezi, e-posta normalizasyonu) korunarak üstüne kuruldu.

**Mimari:** `page.tsx` sunucu bileşeni — sosyal kayıt bayrakları, oturum ve `?ref=` davet önizlemesi (`getReferralPreview`: modül açık mı, kod etkin mi, kotası dolmuş mu, davet eden askıda mı; yalnız ad + sunucu matrisinden puan) ilk HTML ile gelir. Form `register-view.tsx` (düz durum + paylaşılan `registerSchema`), primitifler `components/auth/p-auth/**`.

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Suspense spinner | KALDIRILDI | Sunucu render; gereksiz. |
| 2 | Logo | ÇALIŞIYOR | `mounted` kapısı kaldırıldı (CLS yok). |
| 3 | Tema | ÇALIŞIYOR | + TR/EN dil değiştirici. |
| 4 | İçeriğe geç | ÇALIŞIYOR | |
| 5 | Gradient zemin | KALDIRILDI | Ops kaydı: sakin `surface-0`. |
| 6 | Kart animasyonu | ÇALIŞIYOR | Tek CSS girişi. |
| 7 | Başlık | ÇALIŞIYOR | Sayfanın tek `h1`'i; "QR okut, geri bildirim ver, puan ve ödül kazan". |
| 8 | Davet satırı | ÇALIŞIYOR | Geçersiz/pasif/kotası dolmuş kodda hiç gösterilmez; geçerlide "Ayşe seni davet etti · doğrulama + ilk QR sonrası +N puan" (N sunucu matrisinden); işletme seçilince "bonus yalnız müşteri hesabına". |
| 9 | Hesap türü seçimi | ÇALIŞIYOR | Gerçek radyo grubu (ok tuşları, ekran okuyucuda konum duyurusu); `?role=dealer` ile önseçim. |
| 10 | OAuth keşfi | ÇALIŞIYOR | Sunucuda. |
| 11 | Google ile kayıt | ÇALIŞIYOR | Niyet çerezi (A1) + istemci: işletme niyeti yazılamazsa OAuth BAŞLATILMAZ, hata bandı. |
| 12 | GitHub ile kayıt | ÇALIŞIYOR | Aynı niyet akışı. |
| 13 | Ayırıcı | ÇALIŞIYOR | |
| 14 | İsim | ÇALIŞIYOR | `autocomplete=name`, satır içi hata. |
| 15 | E-posta | ÇALIŞIYOR | İstemci + sunucu normalize; diğer kimlik ekranlarında yazılan e-posta ön doldurulur (URL'de taşınmaz). |
| 16 | Şifre + kural | ÇALIŞIYOR | Kurallar yazarken canlı işaretlenir (hata ÖNCESİ görünür). |
| 17 | Göster/gizle | ÇALIŞIYOR | İki alan birlikte. |
| 18 | Tekrar + eşleşme | ÇALIŞIYOR | Canlı "eşleşiyor / eşleşmiyor". |
| 19 | Alan hataları | ÇALIŞIYOR | Gönderimde ilk hatalı alana odak. |
| 20 | Gönder butonu | ÇALIŞIYOR | Oran sınırında geri sayım metni. |
| 21 | Kayıt API'si | ÇALIŞIYOR | Kodlu yanıt (`EMAIL_TAKEN` 409, `VALIDATION` + alan, `RATE_LIMITED` + `retryAfterSec`); yarışta P2002 → 409; doğrulama token'ı hash'li `AuthEmailToken`; token/e-posta hatası hesabı geri almaz, `emailSent:false` dürüstçe döner. |
| 22 | Hız sınırı | ÇALIŞIYOR | `Retry-After` istemcide geri sayım. |
| 23 | Sunucu hata toast'ları | ÇALIŞIYOR | Kalıcı bant; "zaten kayıtlı" → Giriş yap / Şifremi unuttum / Doğrulama bağlantısını yeniden gönder. EN kullanıcıya TR metin yok. |
| 24 | "E-postanı doğrula" kartı | ÇALIŞIYOR | Ortak `VerifyPending` (gelen kutusu kısayolları, 60 sn geri sayımlı yeniden gönder, "Bilgileri düzenle"). |
| 25 | `verifySentTemplate` ölü dalı | KALDIRILDI | |
| 26 | "Başka hesapla kayıt ol" | ÇALIŞIYOR | "Bilgileri düzenle" (form değerleri korunur). |
| 27 | Kayıt sonrası otomatik giriş | KALDIRILDI | E-posta doğrulaması zorunlu; başarısız arka plan girişi ve kilit sayacı kirletme yok. |
| 28 | "Giriş yapabilirsiniz" toast'ı | KALDIRILDI | Yanlış bilgiydi. |
| 29 | Davet bonusu (sunucu) | ÇALIŞIYOR | A1: PENDING; ödül doğrulama + ilk QR'da. |
| 30 | Doğrulama e-postası | ÇALIŞIYOR | Şablon yalnız TR (ortak `lib/email` — kalan, aşağıda). |
| 31 | "E-postanı doğrula" bildirimi | ÇALIŞIYOR | `type: info`, kullanıcının dilinde. |
| 32 | İstemci analitiği | ÇALIŞIYOR | `user_registered{role,method,referral}`, `register_failed{code}`, `register_method_selected`. |
| 33 | Sunucu analitiği | ÇALIŞIYOR | `emailSent` eklendi. |
| 34 | Şartlar/Gizlilik bağlantıları | ÇALIŞIYOR | Onayın denetlenebilir kaydı yok → kalan (ŞEMA İSTEĞİ). |
| 35 | Giriş bağlantısı | ÇALIŞIYOR | callback + e-posta taşınır. |
| 36 | "Şifrenizi mi unuttunuz?" (altbilgi) | KALDIRILDI | Kayıt altbilgisinde yeri yoktu; "zaten kayıtlı" bandına taşındı. Doğrulanmamış hesaba artık şifremi-unuttum ile doğrulama bağlantısı gider. |
| 37 | Segment hata sınırı | ÇALIŞIYOR | |
| 38 | Metadata | ÇALIŞIYOR | |
| 39 | Oturum açıksa | ÇALIŞIYOR | "Zaten giriş yaptın · Devam et / Çıkış yap, başka hesapla gir" kartı. |
| 40 | Yeniden gönder | ÇALIŞIYOR | |
| 41 | Şifre gücü / kural listesi | ÇALIŞIYOR | 4 segment + metin ("Şifre gücü: iyi"), yalnız renge dayanmaz. |
| 42 | `preferredLanguage` | ÇALIŞIYOR | İstemci dili kayıtla yazılır. |
| 43 | Bot koruması | KALAN | Turnstile/hCaptcha anahtarı + CSP değişikliği gerektirir (platform kararı); A1 sonrası davet puanı doğrulama + ilk QR'a bağlı olduğundan ekonomik risk düştü. |
| 44 | KVKK/İYS onay kaydı | KALAN | ŞEMA İSTEĞİ: şartlar/İYS onayı için ayrı kayıt (ör. `ConsentRecord`'a `kind` + `documentVersion`, ya da `TermsAcceptance`). Mevcut `ConsentRecord` çerez rızası semantiğinde ("en yeni satır geçerli") olduğu için kayıt onayıyla karıştırılmadı. |

**Kapanan bulgular:** B1 (A1), B2 (A1 + kart), B3 (A1 resend + şifremi-unuttum doğrulama dalı), B4 (A1), B6 (A1 + istemci koruması), B7, B8 (kodlar, bildirim dili, `preferredLanguage`), B9 → 8/9; B5 kısmen (P2002 → 409; hata sonrası yarım hesap yerine dürüst `emailSent`).
**Kalanlar:** B5'te SMTP gönderiminin istek yolunda senkron kalması bilinçli (gönderim sonucu ekranda dürüstçe gösteriliyor; `after()`'a alınırsa "gönderilemedi" uyarısı kaybolur). Doğrulama e-postası şablonunun dile göre seçilmesi ortak `lib/email.ts` işi. Bot koruması ve onay kaydı yukarıda.
**Doğrulama:** `__tests__/api/auth-p-auth.test.ts` (kayıt: başarı/dil/token, EMAIL_TAKEN, P2002, VALIDATION alanı, token hatası) + `__tests__/lib/referral.test.ts` yeşil.
