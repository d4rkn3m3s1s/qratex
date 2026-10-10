# /auth/login

**Amaç** · Tüm rollerin (müşteri, bayi, admin, personel) ortak giriş kapısı: e-posta+şifre, isteğe bağlı Google, magic link ve 2FA adımı; başarılı girişte role göre panele veya `callbackUrl` hedefine yönlendirme. Müşteri açısından: QR okutup geri bildirim veren tüketicinin puan/rozet/lig dünyasına geçtiği eşik.

**Genel puan: 4.4 / 10** · **Karar: yeniden tasarla** (çekirdek kimlik doğrulama sunucu tarafında sağlam; ama sayfa üretimde demo/geliştirici ekranı gibi davranıyor, bir açık yönlendirme + DOM XSS açığı ve tüketici akışını kıran birkaç hata var.)

Dosyalar: `app/(auth)/auth/login/page.tsx`, `app/(auth)/auth/login/layout.tsx`, `app/(auth)/auth/layout.tsx`, `app/(auth)/layout.tsx`, `app/(auth)/error.tsx`, `components/auth/auth-shell.tsx`, `lib/auth.ts`, `lib/validations.ts`, `lib/safe-callback-url.ts`, `app/api/public/auth-features/route.ts`, `app/api/auth/magic-link/route.ts`, `app/api/auth/[...nextauth]/route.ts`, `proxy.ts`, `next.config.*` (headers), `app/(auth)/auth/complete/page.tsx`.
Prisma modelleri: `User` (email, password, emailVerified, twoFactorEnabled, twoFactorSecret — schema.prisma:233-237), `RateLimitCounter` (schema.prisma:1096), `AuthEmailToken` (schema.prisma:367), `Settings` (schema.prisma:899), `TwoFactorRecoveryCode`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Kimlik doğrulama, 2FA ve magic link çalışıyor; ancak `callbackUrl` doğrulanmıyor, sunucu hata mesajları yutuluyor, 2FA butonu ham anahtar gösteriyor, NextAuth hata/verify sayfaları yok. |
| UX | 4/10 | Tüketicinin karşılaştığı ilk şey "Admin / Bayi / Müşteri" demo kartları ve düz metin şifreler; QR bağlamı, kilitlenme nedeni, doğrulanmamış e-posta gibi durumlar kullanıcıya hiç anlatılmıyor. |
| Görsel | 5/10 | Temiz shadcn glass kart, tutarlı; ama markasız, oyunlaştırma vaadini (puan/rozet/lig) hiç taşımıyor; Google butonu ve magic link sonradan "pop" ediyor. |
| Mimari | 4/10 | 560 satırlık tek istemci bileşen; üç ayrı giriş yolu üç ayrı yönlendirme mantığıyla yazılmış (biri güvenli, ikisi değil); özellik bayrakları istemcide fetch ile geliyor. |
| Performans | 7/10 | Hafif sayfa; tek küçük fetch. Kayıplar: sabit 500 ms yapay bekleme, `getSession()` ek turu, tam sayfa yeniden yükleme, mount sonrası logo/özellik kaynaklı layout shift. |
| Erişilebilirlik + mobil | 5/10 | Etiketler ve `role="alert"` var, global reduced-motion açık; fakat `autocomplete` yok, hata mesajları `aria-describedby` ile bağlı değil, magic link alanı etiketsiz, şifre göz butonu ~20 px dokunma alanı, 10 px açıklama metni. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Kart giriş animasyonu (fade + y) | ÇALIŞIYOR | page.tsx:272-277 | Ölçülü; global `MotionConfig reducedMotion="user"` (components/providers.tsx:232) altında. |
| 2 | Üst bar logo → ana sayfa | KISMİ | auth-shell.tsx:58-100 | Logo yalnız `mounted` sonrası çiziliyor (62) → ilk boyamada boş link, layout shift; 4 adet `priority` görsel. |
| 3 | Tema değiştirici | ÇALIŞIYOR | auth-shell.tsx:43-52, 102-115 | 44 px dokunma alanı doğru. |
| 4 | "İçeriğe geç" bağlantısı | ÇALIŞIYOR | auth-shell.tsx:56, 118-122 | |
| 5 | Arka plan gradient mesh | ÇALIŞIYOR | auth-shell.tsx:126-129 | |
| 6 | Başlık / alt başlık ("Tekrar Hoş Geldiniz") | ÇALIŞIYOR | page.tsx:279-282 | İlk kez gelen QR kullanıcısı için yanlış ton. |
| 7 | Demo hesap kartları (Admin/Bayi/Müşteri) | KISMİ | page.tsx:26-62, 284-315 | İşlevsel ama üretimde herkese açık; ortam bayrağı yok. Bkz. Bulgu 2. |
| 8 | Demo tek tık giriş | KISMİ | page.tsx:188-223 | `callbackUrl` yok sayılıyor (217); `2FA_REQUIRED` ayrıştırılmıyor; 500 ms sabit bekleme (209). |
| 9 | Google ile giriş (koşullu) | KISMİ | page.tsx:264-269, 317-355 | Mutlak `callbackUrl` atılıyor (`startsWith('/')`), `//evil.com` kabul ediliyor; `ref` davet kodu taşınmıyor. |
| 10 | GitHub ile giriş | EKSİK | page.tsx:74, 94 | Bayrak fetch ediliyor ama buton yok; kayıt sayfasında var (register/page.tsx:162-164) → tutarsız. |
| 11 | "veya" / "email ile" ayırıcıları | ÇALIŞIYOR | page.tsx:318-325, 357-366 | |
| 12 | E-posta alanı + zod doğrulama | KISMİ | page.tsx:405-424; validations.ts:8-17 | `autoComplete` yok, `trim/lowercase` yok; büyük harfle yazılan e-posta `findUnique` ile eşleşmez (lib/auth.ts:136-137). |
| 13 | Şifre alanı | KISMİ | page.tsx:441-450 | `autoComplete="current-password"` yok; giriş şemasında `min(8)` (validations.ts:16) politikayı girişte de dayatıyor. |
| 14 | Şifre göster/gizle | ÇALIŞIYOR | page.tsx:451-458 | aria-label doğru; dokunma alanı yalnız ikon boyutu (~20 px). |
| 15 | Alan hata mesajları | KISMİ | page.tsx:418-423, 460-465 | `role="alert"` var ama `Input`'a `errorId` verilmediği için `aria-describedby` bağlanmıyor (components/ui/input.tsx:13-16). |
| 16 | Şifremi unuttum bağlantısı (+callbackUrl aktarımı) | KISMİ | page.tsx:78-81, 429-439 | Mail yapılandırılmamış uyarısı yalnızca `title` ile → mobilde görünmez. |
| 17 | Giriş butonu + yükleniyor durumu | ÇALIŞIYOR | page.tsx:468-470; components/ui/button.tsx:54-86 | |
| 18 | Kimlik bilgisi hatası bildirimi | KISMİ | page.tsx:148-150 vs lib/auth.ts:120,131-133,168 | Kilitlenme, oran sınırı, "e-postayı doğrula" mesajlarının hepsi "Email veya şifre hatalı" olarak gösteriliyor. |
| 19 | Başarı toast'ı + role göre yönlendirme | KISMİ | page.tsx:120-132 | `STAFF` rolü dalı yok → `/` (landing). `proxy.ts:90` STAFF yönlendirmesi matcher'da `/` olmadığı için (proxy.ts:124) hiç çalışmaz. |
| 20 | `callbackUrl` sonrası yönlendirme | BOZUK | page.tsx:67, 125-126 | Doğrulanmadan `window.location.href`'e veriliyor → açık yönlendirme + `javascript:` DOM XSS. Bkz. Bulgu 1. |
| 21 | 2FA kod adımı | ÇALIŞIYOR | page.tsx:143-147, 160-186, 368-402; lib/auth.ts:182-194 | Sunucu tarafı doğrulama gerçek. |
| 22 | 2FA gönder butonunun yükleniyor metni | BOZUK | page.tsx:387 | `auth.loading` anahtarı tr.json/en.json'da yok → kullanıcı ekranda düz "auth.loading" görür (i18n/request.ts:36 anahtarı geri döndürür). |
| 23 | 2FA hata mesajları | KISMİ | page.tsx:164, 178 | Sabit Türkçe metin (EN kullanıcıda dil karışıklığı); kilitlenme durumu da "2FA kodu hatalı" görünür. |
| 24 | 2FA "geri" | ÇALIŞIYOR | page.tsx:389-401 | Bekleyen şifre state'den temizleniyor. |
| 25 | Magic link formu (koşullu) | KISMİ | page.tsx:225-262, 474-508; api/auth/magic-link/route.ts | Çalışıyor; ancak input'un `<Label>`'ı yok, sunucunun ham hata metni doğrudan toast'a basılıyor (252; route.ts:83), mevcut kullanıcıda gönderim hatası 502, olmayanda 200 → hesap varlığı sızar. |
| 26 | Magic link "mail yapılandırılmadı" uyarısı | KISMİ | page.tsx:509-511; tr.json `auth.loginMagicLinkNeedMail` | Tüketiciye "SMTP (Gmail uygulama şifresi) veya Resend" gibi altyapı metni gösteriliyor. |
| 27 | Demo kimlik bilgileri kutusu (düz metin şifreler) | SAHTE | page.tsx:515-525; messages/tr.json:2318-2321 | Üretim giriş ekranında admin şifresi düz metin. |
| 28 | "Hesabınız yok mu? Kayıt olun" | KISMİ | page.tsx:528-533 | `callbackUrl` kayıt sayfasına aktarılmıyor → QR/geri bildirim bağlamı kaybolur. |
| 29 | `?registered=true` karşılama toast'ı | SAHTE (ölü kod) | page.tsx:105-109 | Kod tabanında bu parametreyi gönderen hiçbir yer yok (grep: yalnız bu satır). |
| 30 | Giriş özellik bayrakları fetch (`/api/public/auth-features`) | ÇALIŞIYOR | page.tsx:83-103; api/public/auth-features/route.ts:9-24 | İptal korumalı; ama sonuç gelene kadar Google/magic link yok → layout shift. |
| 31 | Suspense yedeği (spinner) | ÇALIŞIYOR | page.tsx:540-557 | |
| 32 | Segment hata sınırı | ÇALIŞIYOR | app/(auth)/error.tsx:11-53 | Sentry'ye raporluyor. |
| 33 | Metadata (noindex, sekme başlığı) | ÇALIŞIYOR | login/layout.tsx:4-6; (auth)/layout.tsx:4-6; auth/layout.tsx:9-20 | |
| 34 | Oturum açık kullanıcıyı panele yönlendirme | EKSİK | proxy.ts:124 | `/auth/*` matcher dışında; sayfa da `useSession` kontrolü yapmıyor. |
| 35 | NextAuth hata / doğrulama sayfaları | BOZUK | lib/auth.ts:64-68 | `pages.error='/auth/error'`, `verifyRequest='/auth/verify'` → ikisi de yok (glob: eşleşme yok). OAuth hataları 404'e düşer; login sayfası `?error=` parametresini de okumuyor. |
| 36 | Doğrulama e-postasını yeniden gönder | EKSİK | api/auth altında yalnız GET verify-email (route.ts:5) | Doğrulanmamış kullanıcı yanlış "şifre hatalı" mesajıyla çıkmaza giriyor. |
| 37 | Beni hatırla / uzun oturum | EKSİK | lib/auth.ts:31-39 | Sabit 24 saat; sadakat uygulamasında tüketici her gün yeniden giriş yapar. |
| 38 | Kilitlenme / oran sınırı geri sayımı | EKSİK | lib/auth.ts:114-134 | Sunucu süreyi hesaplıyor, istemci göstermiyor. |
| 39 | Azaltılmış hareket desteği | ÇALIŞIYOR | components/providers.tsx:232 | `whileHover/whileTap` ölçekleri de buna tabi. |
| 40 | Passkey / Apple / telefon (SMS OTP) girişi | EKSİK | — | Mobil tüketici için standart. |
| 41 | Giriş hunisi analitiği | EKSİK | page.tsx (track çağrısı yok) | Kayıt sayfası `track('user_registered')` kullanıyor (register/page.tsx:113); girişte yöntem/başarı/hata olayı yok. |

**Durum özeti:** ÇALIŞIYOR 15 · KISMİ 14 · BOZUK 3 · SAHTE 2 · EKSİK 7 (toplam 41)

---

## Bulgular

### 1. KRİTİK · Güvenlik · `callbackUrl` doğrulanmadan yönlendiriliyor: açık yönlendirme + `javascript:` DOM XSS
- **Kanıt:** page.tsx:67 `const callbackUrl = searchParams.get('callbackUrl') || '/'`; page.tsx:125-126 `window.location.href = callbackUrl;`. CSP `script-src 'self' 'unsafe-inline' ...` (next.config headers, `source: '/:path*'`; proxy.ts:21) — `javascript:` URL'leri engellenmiyor. Aynı dosyada magic link yolu `safePostLoginRedirect` kullanıyor (page.tsx:234-237), magic sayfası da kullanıyor (auth/magic/page.tsx:18-22) → tutarsızlık.
- **Sorun:** `https://qratex…/auth/login?callbackUrl=https://sahte-qratex.com/oturum-suresi-doldu` linki, gerçek girişten hemen sonra kullanıcıyı oltalama sayfasına taşır (klasik "tekrar giriş yapın" tuzağı). Daha kötüsü `callbackUrl=javascript:fetch('/api/...')` ile kod, **yeni açılmış oturumun** bağlamında Qratex origin'inde çalışır: puan harcama, ödül talebi, profil/e-posta değiştirme gibi tüm müşteri API'leri tetiklenebilir. Bağlantı bir QR'a ya da e-postaya gömülerek yayılabilir. (Tarayıcıda canlı denenmedi; kod ve CSP okumasıyla doğrulandı.)
- **Öneri:** Tek bir `resolvePostLoginTarget(raw, role)` yardımcı fonksiyonu yazılmalı ve üç giriş yolu da (kimlik bilgisi, demo, Google) yalnızca onu kullanmalı: `safePostLoginRedirect(raw, window.location.origin)` + rol izin listesi (müşteri `/admin`'e yönlendirilmesin). NextAuth `callbacks.redirect` de açıkça yazılarak sunucu tarafında aynı kural uygulanmalı (savunma derinliği). Uzun vadede CSP'den `'unsafe-inline'` kaldırılıp nonce tabanlı script'e geçilmeli. Regresyon testi: `javascript:`, `//evil.com`, `https://evil.com`, `/\evil.com`, `%2F%2Fevil.com` vakaları.
- **Efor:** S

### 2. KRİTİK · Güvenlik/Veri bütünlüğü · Üretim giriş ekranında admin dahil demo hesap şifreleri düz metin ve tek tık girişle sunuluyor
- **Kanıt:** page.tsx:35-62 (`admin@qratex.com / Admin123!`, `dealer… / Dealer123!`, `customer… / Customer123!`), page.tsx:515-525 + messages/tr.json:2319-2321 (düz metin gösterim). prisma/seed.ts:30-46 bu hesapları `emailVerified` ve 10 000 puanla oluşturuyor, üretim koruması yok. Hiçbir ortam bayrağı (ör. `NEXT_PUBLIC_DEMO_MODE`) bu bloğu gizlemiyor.
- **Sorun:** Seed üretim veritabanında bir kez çalıştırıldıysa (bu denetimde DB'ye dokunulmadığı için **doğrulanmadı**), herkes tek tıkla ADMIN olur. Admin gizli kapısı bunu durdurmaz: (a) proxy, cookie'nin HMAC'ini doğrulamıyor, yalnızca `userId.<64 hex>` biçimine bakıyor (lib/admin-gate-edge.ts:14-22) → sahte cookie yeterli; (b) `verifyGateCookie` (lib/admin-gate.ts) hiçbir API'de çağrılmıyor → admin API'leri kapıdan bağımsız; (c) cevap tek rakam, varsayılan `7`, dakikada 8 deneme (api/admin/gate/route.ts:47) → en fazla 2 dakikada kırılır. Müşteri demo hesabı ise ortak bir cüzdan: 10 000 puanlık hesap herkesçe ödül talebinde kullanılabilir, liderlik/lig verisini kirletir (puan ekonomisi değişmezleriyle çelişir).
- **Öneri:** Demo bloğu tamamen ortam bayrağının arkasına alınmalı (`process.env.NEXT_PUBLIC_DEMO_LOGIN === '1'` yalnız preview/dev). Ayrıca sunucuda `authorize` içinde bilinen demo e-postaları `NODE_ENV==='production'` iken reddedilmeli (istemci bayrağına güvenmemek için). Üretim DB'sinde bu üç hesabın varlığı kontrol edilip şifreleri döndürülmeli/devre dışı bırakılmalı; seed betiğine üretim koruması eklenmeli. Admin kapısında proxy'de Web Crypto (`crypto.subtle`, edge uyumlu) ile HMAC doğrulaması yapılmalı ve `/api/admin/*` için aynı kontrol bir `requireAdminGate()` yardımcısıyla zorunlu kılınmalı. Satış demosu ihtiyacı için ayrı, salt-okunur, sıfırlanan bir "sandbox tenant" düşünülmeli.
- **Efor:** M

### 3. YÜKSEK · İşlevsellik · NextAuth `error` ve `verifyRequest` sayfaları mevcut değil
- **Kanıt:** lib/auth.ts:64-68 (`error: '/auth/error'`, `verifyRequest: '/auth/verify'`); `app/**/auth/{error,verify}/**` glob → eşleşme yok. Login sayfası `searchParams.get('error')` okumuyor (page.tsx yalnız `callbackUrl` ve `registered` okuyor).
- **Sorun:** Google OAuth'ta iptal, `OAuthCallback`, `AccessDenied`, sağlayıcı yapılandırma hataları NextAuth tarafından `/auth/error?error=…` adresine yönlendirilir → kullanıcı 404 sayfası görür. Tüketicinin en çok kullanacağı sosyal giriş yolunda sessiz çıkmaz.
- **Öneri:** `pages.error` doğrudan `/auth/login` yapılmalı ve login sayfası `?error=` kodunu (`OAuthAccountNotLinked`, `AccessDenied`, `Verification`, `CredentialsSignin`…) i18n anahtarlarına eşleyen bir `AuthErrorBanner` ile kartın üstünde kalıcı (toast değil) göstermeli. `verifyRequest` mevcut `/auth/verify-email` akışına bağlanmalı veya kaldırılmalı.
- **Efor:** S

### 4. YÜKSEK · UX/İşlevsellik · Sunucunun anlamlı hata mesajları istemcide yutuluyor
- **Kanıt:** Sunucu ayrı mesajlar fırlatıyor: kilitlenme (lib/auth.ts:120), oran sınırı (131-133), e-posta doğrulanmamış (168), 2FA hatalı (192). İstemci `result.error` içeriğine bakmadan her durumda `auth.wrongCredentials` gösteriyor (page.tsx:148-150); 2FA adımında her hata "2FA kodu hatalı" (page.tsx:178).
- **Sorun:** Kayıt olup e-postasını doğrulamamış yeni tüketici doğru şifreyi girdiği halde "Email veya şifre hatalı" görür, şifre sıfırlamaya yönelir, başarısız denemeler `recordFailedLoginAttemptDb` ile sayılıp hesabı kilitler — kilitlendiğinde de yine aynı mesajı görür. Tam bir destek talebi üreticisi. Ayrıca sunucu mesajları sabit Türkçe; EN kullanıcı için de Türkçe.
- **Öneri:** `authorize` hata metinleri yerine makine okunur kodlar fırlatmalı (`auth.error.EMAIL_NOT_VERIFIED`, `auth.error.LOCKED:900`, `auth.error.RATE_LIMITED:60`, `2FA_REQUIRED`, `auth.error.INVALID_2FA`). İstemci bunları `translateKnownMessageKey` ile çevirip duruma özel arayüz göstermeli: doğrulanmamışsa "Doğrulama e-postasını tekrar gönder" butonu (yeni `POST /api/auth/verify-email/resend`, oran sınırlı, enumerasyonsuz yanıt); kilitlenmede geri sayımlı devre dışı buton. Kullanıcı sayımı riskini artırmamak için "doğrulanmamış" mesajı yalnızca şifre doğruysa döndürülüyor (mevcut sırada 165 satırı şifre kontrolünden ÖNCE; bu da düzeltilmeli — şifre kontrolünden sonraya alınmalı ki doğrulanmamış hesaplar şifresiz sorgulanamasın).
- **Efor:** M

### 5. YÜKSEK · UX/Bilgi mimarisi · Tüketici giriş deneyimi demo/geliştirici ekranı gibi kurgulanmış
- **Kanıt:** Kartta ilk blok "Demo Hesaplar" (page.tsx:284-315), en altta düz metin şifreler (515-525); başlık "Tekrar Hoş Geldiniz" (tr.json `auth.loginTitle`). QR'dan gelen geri bildirim sayfası login'e `callbackUrl` olmadan bağlanıyor (app/(public)/feedback/[code]/page.tsx:509-511); kayıt bağlantısı `callbackUrl` taşımıyor (page.tsx:530).
- **Sorun:** Starbucks Rewards / Duolingo'da giriş ekranı değer önerisinin devamıdır ("puanların seni bekliyor"). Burada QR okutup gelen bir müşteri ilk olarak "Admin — Tam yetki" kartını görüyor; giriş sonrası okuttuğu işletmeye/geri bildirime değil genel `/customer` paneline atılıyor. Bu hem güven hem dönüşüm kaybı.
- **Öneri:** Bkz. "Yeniden tasarım vizyonu". Kısa vadede: demo bloğu kaldırılır, `callbackUrl` tüm giriş/kayıt bağlantılarına taşınır (`/feedback/[code]` ve `/c/[token]` → `?callbackUrl=/feedback/<code>`), QR bağlamı varsa kartın üstünde işletme adı/logosu ve "Giriş yap, bu geri bildirim için +X puan kazan" bandı gösterilir (yeni hafif uç: `GET /api/public/qr-context?code=` → işletme adı, logo, kazanılacak puan; Redis cache).
- **Efor:** M

### 6. ORTA · Bozuk metin · 2FA butonunda ham i18n anahtarı görünüyor
- **Kanıt:** page.tsx:387 `t('auth.loading')`; anahtar messages/tr.json ve en.json'da yok (betikle doğrulandı); `t()` eksik anahtarda anahtarı döndürür (i18n/request.ts:36).
- **Sorun:** 2FA kullanan her kullanıcı gönderim sırasında "auth.loading" yazısı görür.
- **Öneri:** Butonun kendi `loading` prop'u kullanılmalı (`<Button loading={isLoading}>`), böylece diğer butonlarla aynı spinner + `common.loading` davranışı gelir. CI'ya "kullanılan `t('…')` anahtarları mesaj dosyalarında var mı" denetimi eklenmeli (statik grep betiği).
- **Efor:** S

### 7. ORTA · İşlevsellik · Rol yönlendirmesinde STAFF dalı yok; personel landing'e düşüyor
- **Kanıt:** page.tsx:128-129 (yalnız ADMIN/DEALER/CUSTOMER); proxy.ts:90-92 `/`→`/staff` yönlendirmesi var ama matcher `/`'yi içermiyor (proxy.ts:124); landing (`app/(public)/page.tsx`) STAFF kontrolü yapmıyor.
- **Sorun:** Personel her girişte pazarlama sayfasına iniyor, paneli elle bulmak zorunda.
- **Öneri:** Rol→rota eşlemesi tek bir paylaşılan sabit olarak (`lib/role-home.ts`) tanımlanıp login, proxy ve `/auth/complete` tarafından kullanılmalı; STAFF → `/staff`.
- **Efor:** S

### 8. ORTA · Güvenlik · Google yolunda `//` ile başlayan hedef kabul ediliyor; `/auth/complete` doğrulamasız yönlendiriyor
- **Kanıt:** page.tsx:267 `callbackUrl.startsWith('/') ? callbackUrl : '/customer'` (`//evil.com` geçer); app/(auth)/auth/complete/page.tsx:24-25 aynı kontrol, ardından `router.replace(safeNext)` (44).
- **Sorun:** `?callbackUrl=//evil.com` + Google girişi → `/auth/complete?next=//evil.com` → harici siteye yönlendirme (Next router protokol-göreli URL'yi harici sayar; tarayıcıda **doğrulanmadı**, kod okumasıyla olası).
- **Öneri:** Bulgu 1'deki ortak `resolvePostLoginTarget` hem burada hem `/auth/complete`'te kullanılmalı. Aynı düzeltme mutlak ama aynı-origin URL'leri de doğru işler (şu an Google yolu bunları atıp `/customer`'a düşüyor → deep link kaybı).
- **Efor:** S

### 9. ORTA · Ürün · Sabit 24 saatlik oturum, "beni hatırla" yok
- **Kanıt:** lib/auth.ts:31-39 (varsayılan 24 sa); sayfada kalıcılık seçeneği yok.
- **Sorun:** Sadakat/oyunlaştırma ürününde (seri, günlük görev, lig) tüketiciyi her gün giriş ekranına döndürmek, Duolingo serisi mantığının tam tersi; PWA olarak yüklenen uygulamada özellikle sinir bozucu. Güvenlik gerekçesi (puan ekonomisi) geçerli ama tek boyutlu çözülmüş.
- **Öneri:** Rol bazlı oturum politikası: CUSTOMER için kayan (sliding) 30 gün + hassas işlemlerde (ödül talebi, puan transferi, e-posta değişikliği) "yeniden doğrulama" (step-up: şifre/2FA/passkey); ADMIN/DEALER için mevcut kısa süre. NextAuth JWT `maxAge` rol bazlı ayarlanamadığı için `jwt` callback'inde `token.exp`/`issuedAt` + rol ile özel süre kontrolü ve token-replay Redis katmanında iptal.
- **Efor:** M

### 10. ORTA · Erişilebilirlik/mobil · Form alanları şifre yöneticisi ve ekran okuyucu için eksik işaretlenmiş
- **Kanıt:** E-posta (page.tsx:409-416) ve şifre (443-450) alanlarında `autoComplete` yok; `errorId` verilmediği için `aria-describedby` boş (components/ui/input.tsx:13-16); magic link input'unun etiketi yok (page.tsx:488-496); şifre göz butonu dokunma alanı ikon kadar (451-458); demo açıklaması `text-[10px]` (310); "Şifremi unuttum" uyarısı yalnız `title` (432-436).
- **Sorun:** iOS/Android şifre yöneticisi ve WebAuthn otomatik doldurma güvenilir tetiklenmez; ekran okuyucu hatayı alanla ilişkilendirmez; mobilde küçük hedefler.
- **Öneri:** `autoComplete="username webauthn"` / `"current-password"`, `autoCapitalize="none"`, `spellCheck={false}`, `enterKeyHint="go"`; hata `<p id>` + `errorId`; magic input'a görünür veya `sr-only` label; göz butonunu `h-11 w-11` yapmak; `title` uyarısını görünür yardım metnine dönüştürmek. E-posta `trim().toLowerCase()` hem login hem register şemasında `z.string().trim().toLowerCase()` ile normalize edilmeli (register route da şu an normalize etmiyor → magic link `toLowerCase` yaptığı için büyük harfli kayıtlar magic link alamaz: api/auth/magic-link/route.ts:66).
- **Efor:** S

### 11. ORTA · Güvenlik/UX · Magic link: ham sunucu hatası ve hesap varlığı sızıntısı, altyapı metni tüketiciye gösteriliyor
- **Kanıt:** api/auth/magic-link/route.ts:79-86 (yalnız mevcut+doğrulanmış kullanıcıda gönderim hatası → 502 + `sent.error`); page.tsx:252 bu metni toast'a basıyor; page.tsx:510 ve route.ts:44-45 "SMTP (Gmail uygulama şifresi) veya Resend" metni.
- **Sorun:** 502/200 farkı e-posta varlığını ele verir (ana giriş yolu enumerasyona karşı özenle korunmuşken). Sağlayıcı hata metni iç bilgi sızdırabilir. Tüketici "SMTP" ne demek bilmez.
- **Öneri:** Gönderim hatası loglanıp istemciye her zaman aynı genel 200 yanıt dönülmeli; mail yapılandırılmamışsa magic link bölümü hiç render edilmemeli (yönetici uyarısı admin paneline taşınmalı). Magic link ayrıca ana e-posta alanını yeniden kullanmalı (ikinci bir e-posta input'u gereksiz tekrar).
- **Efor:** S

### 12. DÜŞÜK · Ölü kod / tutarsızlık
- **Kanıt:** `?registered=true` toast'ı (page.tsx:105-109) hiçbir yerden tetiklenmiyor; GitHub bayrağı okunuyor ama buton yok (page.tsx:94) — kayıt sayfasında var; demo girişte `2FA_REQUIRED` ve `callbackUrl` ele alınmıyor (page.tsx:201-217); 500 ms yapay gecikme iki yerde (122, 209); doğrulama başarılı olduktan sonra verify-email sayfası login'e bağlam taşımıyor (verify-email/page.tsx:81,104).
- **Öneri:** Ölü toast'ı kaldırıp yerine gerçek bağlamsal karşılama: verify-email ve reset-password başarı akışları `?status=verified|password-reset` ile gelsin, login kalıcı bilgi bandı göstersin. GitHub kararını tek yerde ver (tüketici ürününde GitHub yerine Apple önerilir). Yapay bekleme yerine `signIn(..., { redirect: false })` sonrası doğrudan hedefe `router.replace` + `router.refresh()` veya yalnız gerekli olduğunda tam yükleme.
- **Efor:** S

### 13. DÜŞÜK · Performans/Görsel · Sonradan beliren öğeler ve layout shift
- **Kanıt:** Google butonu, ayırıcılar ve magic link `authFeatures` fetch'i bitene kadar yok (page.tsx:83-103, 317, 357, 474); logo `mounted` sonrası (auth-shell.tsx:62).
- **Öneri:** Login sayfasını sunucu bileşeni kabuğu + istemci form adası olarak ayırmak: özellik bayrakları (`getBooleanSiteSetting`, env) sunucuda okunup prop olarak geçirilir → fetch ve CLS ortadan kalkar. Logo için iki tema görseli CSS ile (`dark:hidden`) zaten seçiliyor; `mounted` koşulu gereksiz.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Passkey (WebAuthn) ve Apple ile giriş** — Revolut/Monzo ve Starbucks mobilde şifresiz giriş sunuyor; iOS tüketicisi için "Apple ile giriş" beklenen standart. `autocomplete="webauthn"` conditional UI ile e-posta alanına entegre.
2. **Telefon numarası + SMS/WhatsApp OTP** — Türkiye'de kafe/restoran sadakatinde baskın yöntem; e-posta doğrulama sürtünmesini ortadan kaldırır.
3. **QR bağlamlı giriş** — "X Kafe'deki geri bildirimin seni bekliyor: +50 puan" bandı, giriş sonrası doğrudan o geri bildirim/ödül anına dönüş (Starbucks "Scan to earn" sonrası akış).
4. **Kalıcı oturum + step-up doğrulama** — 30 gün kayan oturum, hassas işlemlerde yeniden doğrulama.
5. **Doğrulama e-postasını yeniden gönderme ve kilitlenme geri sayımı** — durum bazlı, kalıcı (toast olmayan) hata kartları.
6. **Giriş hunisi analitiği** — yöntem (şifre/Google/magic/2FA), hata kodu, süre; PostHog huni zaten kurulu.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Tüketici için giriş ekranı "kapı" değil "ödülün eşiği" olmalı. QR'dan gelen kişi, ne kazanacağını görür, tek dokunuşla (passkey/Google/Apple) girer ve kaldığı yere döner. Bayi/admin aynı form üzerinden girer ama onlara özel hiçbir şey tüketiciye görünmez.

**Yerleşim (mobil öncelikli, 360-430 px):**
1. **Bağlam bandı (koşullu):** `callbackUrl` bir QR/geri bildirim yoluysa kartın üstünde işletme logosu + adı + "Giriş yap, +X puan ve seri gününü koru" mesajı. Bağlam yoksa marka maskotu ve "Puanların, rozetlerin, ligin seni bekliyor" tek satır.
2. **Birincil eylemler:** Passkey (destekleniyorsa), Apple, Google — tam genişlik, 48 px yükseklik, sağlayıcı sırası platforma göre (iOS'ta Apple üstte).
3. **E-posta ile devam:** Tek e-posta alanı → "Devam" → ikinci adımda şifre VEYA "Bana giriş bağlantısı gönder" seçeneği (magic link ayrı form olmaktan çıkar, aynı e-postayı kullanır). Bu iki adımlı yapı aynı zamanda hesap yoksa "Kayıt ol"a e-posta önceden doldurulmuş geçişi sağlar.
4. **Durum kartları:** Hata kodlarına göre kalıcı inline kart (doğrulanmamış → yeniden gönder; kilitli → geri sayım; OAuth hatası → açıklama). Toast yalnız başarı için.
5. **2FA adımı:** 6 kutulu OTP girişi (yapıştırma desteği, 6. hanede otomatik gönderim), "kurtarma kodu kullan" ikincil bağlantı.
6. **Alt bilgi:** Kayıt ol (callbackUrl taşıyarak), dil seçici.

**Motion/3D (ölçülü):** Kart girişindeki mevcut fade yeterli; 3D sahne giriş ekranına konmamalı (LCP ve düşük segment cihaz maliyeti). Önerilen tek "an": başarılı girişte 400-600 ms'lik kısa geçiş — bağlam bandındaki puan rozetinin hafifçe parlayıp yukarı kayması ve hedefe `router.replace`. Hata durumunda alan için 2-3 px yatay "shake" (reduced-motion'da devre dışı; global `MotionConfig` zaten var). Demo kartlarındaki `whileHover` ölçekleri kaldırılır.

**Veri/API değişiklikleri:**
- `lib/post-login-target.ts`: `resolvePostLoginTarget(raw, role, origin)` — tüm yollar ve NextAuth `callbacks.redirect` için tek kaynak; `lib/role-home.ts` rol→ana sayfa eşlemesi.
- `lib/auth.ts` `authorize`: hata kodları (`EMAIL_NOT_VERIFIED` şifre kontrolünden sonra, `LOCKED:<sn>`, `RATE_LIMITED:<sn>`, `INVALID_2FA`); demo e-postalarını üretimde reddet; `pages.error = '/auth/login'`.
- `POST /api/auth/verify-email/resend` (oran sınırlı, her durumda aynı yanıt).
- `GET /api/public/qr-context?code=` (işletme adı/logo/kazanılacak puan; Redis cache, build-time DB fail-safe kuralına uygun try/catch).
- Sayfa: sunucu bileşeni kabuk (özellik bayrakları + QR bağlamı sunucuda) + istemci form adası; `useForm` şemasında e-posta `trim().toLowerCase()`, girişte `min(8)` kaldırılır (yalnız `min(1)`).
- Admin kapısı (bu sayfanın dışında ama demo riskiyle bağlantılı): proxy'de `crypto.subtle` ile HMAC doğrulama + `/api/admin/*` için `requireAdminGate()`.
- Analitik: `login_viewed`, `login_method_selected`, `login_succeeded{method}`, `login_failed{code}` olayları.

---

## Çakışmalar / birleştirme önerisi

- **`/auth/login` ↔ `/auth/register`:** Aynı kart iskeleti, OAuth butonları ve yönlendirme mantığı iki dosyada ayrı ayrı ve tutarsız (login'de GitHub yok, register'da var; register `ref` davet kodunu taşıyor, login taşımıyor). İki adımlı "e-posta ile devam" akışında tek bir `/auth` giriş noktası (e-posta var → şifre/magic, yok → kayıt) birleştirme için doğal aday; en azından paylaşılan `components/auth/social-buttons.tsx`, `auth-error-banner.tsx`, `post-login-target.ts` çıkarılmalı.
- **`/auth/magic` ve `/auth/complete`:** Her biri kendi yönlendirme doğrulamasını yapıyor (biri güvenli, biri değil). Ortak yardımcıya bağlanmalı; sayfalar kalabilir.
- **Magic link formu:** Login sayfası içinde ikinci bir e-posta formu olarak çakışıyor; ana e-posta adımına seçenek olarak katlanmalı.
- **Demo hesap bloğu:** Üretim giriş sayfasından kaldırılmalı; satış demosu gerekiyorsa ayrı, ortam bayraklı bir `/demo` rotası ve izole sandbox verisiyle.
- Sayfanın kendisi kaldırılmamalı; sistemin tek kimlik kapısı olarak korunup yeniden tasarlanmalı.

---

## Doğrulama (şüpheci inceleme)

Yöntem: Yalnız kod okuması (DB'ye, dev server'a, tarayıcıya dokunulmadı). Okunan dosyalar: `app/(auth)/auth/login/page.tsx`, `app/(auth)/auth/complete/page.tsx`, `lib/safe-callback-url.ts`, `lib/auth.ts`, `proxy.ts`, `next.config.js`, `lib/admin-gate.ts`, `lib/admin-gate-edge.ts`, `lib/api-auth.ts`, `app/api/admin/gate/route.ts`, `prisma/seed.ts`, `messages/{tr,en}.json`, `node_modules/next-auth/core/{index,routes/callback}.js`, `node_modules/next/dist/client/components/{app-router.js,router-reducer/reducers/navigate-reducer.js}` (Next 16.1.6).

### 1. Açık yönlendirme + `javascript:` DOM XSS (callbackUrl) — **DOĞRULANDI**
- `page.tsx:67` ham `callbackUrl` alınıyor; `page.tsx:125-126` hiçbir filtre olmadan `window.location.href = callbackUrl`. Bu yol hem şifreli girişte (`onSubmit` → `page.tsx:152`) hem 2FA adımında (`page.tsx:176`) çalışıyor. Aynı dosyada magic link yolu `safePostLoginRedirect` kullanıyor (`page.tsx:234`), yani güvenli yardımcı mevcut ama kimlik bilgisi yolunda atlanmış.
- `/auth/*` `proxy.ts:124` matcher'ında yok; bu yüzden sayfaya `next.config.js:343-347` CSP'si uygulanıyor ve `script-src 'unsafe-inline'` içeriyor → `javascript:` URL navigasyonu CSP tarafından engellenmez.
- Yeniden üretim: `https://<site>/auth/login?callbackUrl=javascript:fetch('/api/...',{method:'POST',...})` bağlantısı gönderilir; kurban kendi e-posta/şifresiyle giriş yapar → 500 ms sonra kod Qratex origin'inde, taze oturum cookie'siyle çalışır. `callbackUrl=https://evil.example` ile aynı akış klasik oltalama yönlendirmesi olur. (Demo butonları `roleRoutes` kullandığından bu yoldan etkilenmez.)
- Not: Proxy'nin `withAuth` yönlendirmesi meşru `callbackUrl`'leri MUTLAK aynı-origin URL olarak üretir; düzeltmede `safePostLoginRedirect(callbackUrl, window.location.origin)` kullanılması bu meşru akışı bozmaz.

### 2. Üretim giriş ekranında ADMIN demo şifresi + tek tık giriş; admin kapısı durdurmuyor — **DOĞRULANDI (bir ayrıntı düzeltmesiyle)**
- Kodda kesin olanlar: şifreler istemci paketinde düz metin (`page.tsx:35-62`) ve her ortamda koşulsuz render ediliyor (`page.tsx:285-314`, `515-525`; `messages/tr.json:2318-2321`, `en.json` aynı). Seed'de üretim koruması yok, hesaplar `emailVerified` ile oluşturuluyor ve `update: {}` olduğundan şifre hiç döndürülmüyor (`prisma/seed.ts:30-46`).
- Hesabın canlıda var olduğuna dair kanıt: proje hafızası (`team-module.md`) canlı Neon DB'de "admin@qratex.com ADMIN kaldı" diyor. Şifrenin hâlâ `Admin123!` olduğu DB'ye dokunulmadığı için **doğrulanmadı**; ancak şifreyi değiştiren bir kod yolu görülmedi.
- Admin kapısı gerçekten koruma sağlamıyor: (a) `lib/admin-gate-edge.ts:14-22` yalnız `userId.<64 hex>` biçimini kontrol ediyor, HMAC doğrulamıyor; giriş yapan saldırgan kendi `userId`'sini `/api/auth/session` yanıtından bilir ve `admin_gate=<id>.<64 adet 'a'>` cookie'sini elle koyarak `/admin`'e girer. (b) `verifyGateCookie` `lib/admin-gate.ts` dışında hiçbir yerde çağrılmıyor; `lib/api-auth.ts` `requireAuth` gate kontrol etmiyor ve `proxy.ts` `/api/*` isteklerini auth middleware'e hiç sokmuyor → `/api/admin/*` uçları yalnız ADMIN rolüyle erişilebilir. (c) Cookie sahtelenmese bile cevap tek rakam, varsayılan `7`, oran sınırı dakikada 8 (`app/api/admin/gate/route.ts:47`) → en kötü 2 dakikada kaba kuvvetle geçilir.
- Yeniden üretim: giriş sayfasındaki "Admin" demo kartına tıkla → ADMIN JWT; ardından `/api/admin/...` uçlarını doğrudan çağır (gate gerekmiyor) veya sahte gate cookie ile panele gir.
- Düzeltme: iddiadaki "müşteri demo hesabı 10 000 puanlı" ayrıntısı yanlış — seed'de müşteri 150 puan (`prisma/seed.ts:90`); 10 000 puan ve level 99 ADMIN hesabında (`seed.ts:41-43`). Puan ekonomisi riski yine geçerli: herkesin ortak kullandığı CUSTOMER hesabıyla ödül talebi/oyun ödülü alınabilir.

### 3. Google yolunda `//evil.com` kabul ediliyor; `/auth/complete` doğrulamasız yönlendiriyor — **DOĞRULANDI**
- `page.tsx:267` yalnız `startsWith('/')` kontrol ediyor; `//evil.com` (ve tarayıcının `/` sayıp normalize ettiği `/\evil.com`) geçer. NextAuth'a giden `callbackUrl` göreli `/auth/complete?next=...` olduğu için NextAuth'un varsayılan `redirect` koruması devreye girmez.
- `app/(auth)/auth/complete/page.tsx:24-25` aynı zayıf kontrol, `:44` `router.replace(safeNext)`. Next 16.1.6 App Router harici origin'i tespit edip (`app-router-instance.js:222` `isExternalURL`, `navigate-reducer.js` `handleExternalUrl`) `location.replace/assign` ile gerçek harici navigasyon yapıyor (`app-router.js:207-209`).
- Yeniden üretim (Google girişi bile gerekmez): oturumu açık bir kullanıcıya `https://<site>/auth/complete?next=//evil.example` bağlantısı → şifre adımı yoksa ~400 ms içinde `evil.example`'a yönlendirilir. Oturum yoksa `/auth/login`'e düşer; Google ile girerse yine harici siteye gider.

### 4. NextAuth `pages.error` ve `verifyRequest` var olmayan rotalara işaret ediyor — **DOĞRULANDI (önem: orta, güvenlik değil UX)**
- `lib/auth.ts:64-68` `error: '/auth/error'`, `verifyRequest: '/auth/verify'`; `app/(auth)/auth/` altında yalnız `complete, forgot-password, login, magic, register, reset-password, verify-email` var.
- NextAuth v4 OAuth hatalarında (kullanıcı Google onayını iptal eder → `callback.js:85-96`, `OAuthAccountNotLinked` → `:165`, `Callback` → `:176/193`) `/api/auth/error?error=...`'a, oradan `core/index.js:215-217` ile `pages.error`'a yönlendiriyor → `/auth/error` 404 (`app/not-found.tsx`). Login sayfası `?error=` parametresini hiç okumuyor.
- Yeniden üretim: "Google ile giriş" → Google ekranında "İptal" → kullanıcı 404 sayfasında kalır, ne olduğu söylenmez.
- `verifyRequest` kısmı pratikte etkisiz: projede NextAuth EmailProvider yok (magic link Credentials `magicToken` ile çalışıyor), bu sayfaya hiçbir akış yönlendirmez; yalnız ölü yapılandırma. Gerçek etki `pages.error` kaynaklı. Şiddet KRİTİK/YÜKSEK değil, ORTA olarak ele alınmalı.

---

## Uygulama (Dalga 2)

Sahip: p-auth yüzeyi. Güvenlik düzeltmeleri (P0-02 `resolvePostLoginTarget`, kodlu `authorize` hataları, `/auth/error`, `/auth/signin`, 2FA ara adımı, resend ucu) A1'de yapılmıştı; bu dalga UX/tasarım + kalan işlevleri kapattı ve A1 davranışını korudu.

**Mimari:** `page.tsx` artık sunucu bileşeni (özellik bayrakları, oturum, QR bağlamı sunucuda → `/api/public/auth-features` fetch'i ve sonradan beliren butonlar yok); form/2FA/demo küçük istemci adası `login-view.tsx`. Ortak kabuk ve primitifler `components/auth/p-auth/**` (AuthCard, PasswordField, TwoFactorStep/OtpField, OAuthButtons, DemoAccounts, SignedInPanel, copy TR/EN). QDL v2 ops kaydı: `surface-1` düz kart, ince kenarlık, tek CSS giriş (`qx-enter`, azaltılmış harekette kapalı), landing gradient zemini kaldırıldı.

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Kart giriş animasyonu | ÇALIŞIYOR | framer yerine tek CSS `qx-enter` (ops: tek giriş). |
| 2 | Logo → ana sayfa | ÇALIŞIYOR | `mounted` beklemesi kaldırıldı; iki tema görseli CSS `dark:` ile, ilk HTML'de (CLS yok). |
| 3 | Tema değiştirici | ÇALIŞIYOR | İkon CSS ile seçilir; yanına TR/EN dil değiştirici eklendi. |
| 4 | İçeriğe geç | ÇALIŞIYOR | |
| 5 | Gradient mesh zemin | KALDIRILDI | Yol haritası §4.2: auth'ta landing zemini yok; `surface-0` sakin zemin. |
| 6 | Başlık / alt başlık | ÇALIŞIYOR | "Giriş yap · Puanların, ödüllerin ve panelin seni bekliyor"; QR'dan gelince "X geri bildirimine dön". |
| 7 | Demo hesap kartları | ÇALIŞIYOR | Proje sahibinin kararıyla KALIR; formun altına ikincil bölüm olarak taşındı (tüketicinin ilk gördüğü şey değil). |
| 8 | Demo tek tık giriş | ÇALIŞIYOR | `callbackUrl` güvenli hedefle uygulanır, 2FA adımı işlenir, 500 ms yapay bekleme yok, başarısızlık kalıcı bantta. |
| 9 | Google ile giriş | ÇALIŞIYOR | Güvenli `next` yolu; kayıt ekranından kalmış "işletme" niyeti çerezi girişte temizlenir. |
| 10 | GitHub ile giriş | ÇALIŞIYOR | Yapılandırılmışsa kayıtla tutarlı biçimde gösterilir. |
| 11 | Ayırıcılar | ÇALIŞIYOR | Tek "veya" ayırıcısı. |
| 12 | E-posta alanı | ÇALIŞIYOR | `autocomplete=username`, `autocapitalize=none`, normalize, satır içi hata. |
| 13 | Şifre alanı | ÇALIŞIYOR | `current-password`, girişte yalnız boş kontrolü. |
| 14 | Göster/gizle | ÇALIŞIYOR | 44×44, `aria-pressed`. |
| 15 | Alan hataları | ÇALIŞIYOR | `errorId` → `aria-describedby`. |
| 16 | Şifremi unuttum | ÇALIŞIYOR | callback + yazılan e-posta (sessionStorage, URL'de değil) taşınır; mail kapalıysa hedef sayfa bunu baştan söyler. |
| 17 | Giriş butonu | ÇALIŞIYOR | |
| 18 | Kimlik bilgisi hata bildirimi | ÇALIŞIYOR | Kilit/oran sınırı geri sayımı, doğrulanmamış → yeniden gönder, askı, OAuth hataları kalıcı bantta. |
| 19 | Başarı + rol yönlendirmesi | ÇALIŞIYOR | Toast yerine "Yönlendiriliyorsun…" bandı; STAFF → /staff (A1 tek kaynak). |
| 20 | callbackUrl yönlendirmesi | ÇALIŞIYOR | A1 `resolvePostLoginTarget`. |
| 21 | 2FA adımı | ÇALIŞIYOR | 6 hücreli OTP (tek gerçek input, `one-time-code`, yapıştırma, 6. hanede otomatik gönderim) + "kurtarma kodu kullan" modu; bağlantıyla girişle ortak bileşen. |
| 22 | 2FA "auth.loading" | ÇALIŞIYOR | Buton `loading` prop'u. |
| 23 | 2FA hataları | ÇALIŞIYOR | TR/EN; kilitte 2FA'dan çıkıp bant. |
| 24 | 2FA geri | ÇALIŞIYOR | |
| 25 | Magic link formu | ÇALIŞIYOR | İkinci e-posta alanı kaldırıldı; ana e-posta alanını kullanan "Şifresiz giriş bağlantısı gönder"; yanıt varlıktan bağımsız. |
| 26 | "Mail yapılandırılmadı" altyapı metni | KALDIRILDI | Mail yoksa bölüm hiç çizilmez (sunucu bayrağı). |
| 27 | Demo bilgileri kutusu | ÇALIŞIYOR | Sahip kararıyla korunur; açılır `<details>` içinde. |
| 28 | Kayıt bağlantısı | ÇALIŞIYOR | callback + e-posta taşınır. |
| 29 | `?registered=true` toast'ı | KALDIRILDI | Hiçbir yer üretmiyordu (ölü kod). |
| 30 | Özellik bayrakları fetch | ÇALIŞIYOR | Sunucuda okunur (`getAuthFeatures`). |
| 31 | Suspense yedeği | KALDIRILDI | Sayfa sunucuda çizildiği için gereksiz. |
| 32 | Segment hata sınırı | ÇALIŞIYOR | Aynı AuthCard diliyle yeniden yazıldı. |
| 33 | Metadata | ÇALIŞIYOR | |
| 34 | Oturum açıksa | ÇALIŞIYOR | Sessiz yönlendirme yerine "Zaten giriş yaptın · Devam et / Çıkış yap, başka hesapla gir" kartı. |
| 35 | NextAuth hata/verify sayfaları | ÇALIŞIYOR | A1; AuthCard diliyle yeniden çizildi. |
| 36 | Doğrulama e-postasını yeniden gönder | ÇALIŞIYOR | |
| 37 | Beni hatırla / uzun oturum | KALAN | Rol bazlı oturum süresi `lib/auth.ts` jwt politikası (F1.2, güvenlik sahibi) — UX dalgasında değiştirilmedi. |
| 38 | Kilit geri sayımı | ÇALIŞIYOR | |
| 39 | Azaltılmış hareket | ÇALIŞIYOR | |
| 40 | Passkey / Apple / SMS | KALAN | WebAuthn kimlik tablosu ve SMS sağlayıcısı yok → ŞEMA İSTEĞİ (Authenticator modeli); Apple anahtarları ortam işi. |
| 41 | Giriş hunisi analitiği | ÇALIŞIYOR | `login_method_selected`, `login_succeeded{method}`, `login_failed{method,code}`, `magic_link_requested` (rızaya bağlı `track`). |

**Kapanan bulgular:** 1 (A1), 3 (A1 + yeni kart), 4, 5 (QR bağlam bandı, demo alta), 6, 7, 8 (A1), 10, 11, 12, 13 → 11/13.
**Kalanlar:** Bulgu 2 (demo bloğu üretimde) proje sahibinin kararıyla bilinçli olarak açık; Bulgu 9 (beni hatırla) güvenlik/oturum politikası işi. Passkey/Apple/SMS altyapı gerektirir.
**Doğrulama:** `npx jest __tests__/api/auth-p-auth.test.ts` (22 test) + A1 kimlik paketleri yeşil; kapsamlı tsc 0 hata. Tarayıcıda görsel doğrulama yapılmadı (dev server yasak).
