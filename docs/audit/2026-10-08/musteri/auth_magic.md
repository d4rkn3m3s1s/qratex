# /auth/magic

**Amaç:** Şifresiz giriş (magic link) e-postasındaki bağlantının vardığı "iniş" sayfası. URL'deki `token`'ı NextAuth `credentials` sağlayıcısına (`magicToken`) gönderir, sunucu token'ı tek kullanımlık olarak tüketir, oturum açılır ve kullanıcı `callbackUrl` (yoksa `/`) hedefine yönlendirilir. Müşteri açısından: "e-postamdaki butona bastım → uygulamadayım" anı; QR okutup puan/rozet dünyasına dönen tüketicinin en kısa geri dönüş yolu.

Dosyalar: `app/(auth)/auth/magic/page.tsx`, `app/(auth)/auth/magic/layout.tsx`, `app/(auth)/auth/layout.tsx`, `app/(auth)/layout.tsx` → `components/auth/auth-shell.tsx`, `app/(auth)/error.tsx`, `lib/safe-callback-url.ts`, `lib/app-locale.tsx`, `lib/auth.ts` (authorize, magic dalı), `lib/auth-email-token.ts`, `app/api/auth/magic-link/route.ts` (bağlantıyı üreten uç), `lib/email.ts` (`sendMagicLinkEmail`), `lib/rate-limit.ts`, `components/analytics/posthog-provider.tsx`, `proxy.ts`, `app/(public)/home-client.tsx`, `prisma/schema.prisma` (`AuthEmailToken`).

**Genel puan: 5.0/10** · **Karar: koru-iyileştir** (sayfa küçük ve doğru kurgulanmış — token istemcide JS ile tüketiliyor, e-posta tarayıcı ön-yüklemesi token'ı yakmıyor — ama iki güvenlik açığı, bir yanlış-hata yarışı ve üçüncü tarafa token sızıntısı acilen kapatılmalı; ardından deneyim katmanı eklenmeli)

---

## Puan kartı

| Alan | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Mutlu yol çalışıyor; ama `callbackUrl` ters eğik çizgi/sekme ile dış siteye kaçırılabiliyor, magic link 2FA'yı atlıyor, ağ hatasında spinner sonsuza dönüyor, dil değişiminde gerçekte giriş yapılmışken "bağlantı geçersiz" gösterilebiliyor. |
| UX | 4/10 | Hata durumu tek tip ("geçersiz veya süresi doldu") ve tek çıkış ("Girişe dön"); yeni bağlantı isteme, hata nedenini açıklama, rol bazlı hedef yok; başarıda kullanıcı önce pazarlama landing'ine düşüyor. |
| Görsel | 4/10 | Düz shadcn kart + spinner; başarı anında hiçbir görsel geri bildirim yok (status `done` iken içerik boş); ürünün marka/oyunlaştırma dilinden iz yok. |
| Mimari | 6/10 | Doğru katmanlama (hash'li token, 15 dk TTL, tek kullanım, `safePostLoginRedirect`), ama tüketim atomik değil, efekt bağımlılığı (`t`) yanlış, yönlendirme kuralı 3 ayrı yerde farklı. |
| Performans | 6/10 | Sayfa hafif; fakat varsayılan hedef `/` olduğu için müşteri ağır landing'i baştan yükleyip sonra istemcide `/customer`'a itiliyor (çift gezinme). |
| Erişilebilirlik + Mobil | 5/10 | Mobil yerleşim düzgün, global reduced-motion var; ama durum değişimleri `aria-live` ile duyurulmuyor, spinner'ın ekran okuyucu metni yok, PWA/uygulama-içi tarayıcı çerez ayrımına karşı (kod ile giriş) yedek yol yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Suspense sınırı + yedek spinner | KISMİ | `page.tsx:75-86` | `useSearchParams` için doğru sınır; spinner `aria-hidden`, yanında sr-only metin yok → ekran okuyucu sessiz. |
| 2 | URL'den `token` okuma | ÇALIŞIYOR | `page.tsx:17` | |
| 3 | Token yoksa hata durumu | KISMİ | `page.tsx:28-31` | Hata kartı görünür ama neden "bağlantı eksik/kırpılmış" olduğu söylenmez; toast da atılmaz (diğer hata dalıyla tutarsız). |
| 4 | Otomatik giriş (`signIn('credentials', { magicToken, redirect:false })`) | KISMİ | `page.tsx:33-37` | Çalışıyor; ama efekt `t`'ye bağımlı (`page.tsx:51`) → dil değişince ikinci çağrı tüketilmiş token'la başarısız olur (Bulgu 4). |
| 5 | Sunucu tarafı token doğrulama/tüketim | KISMİ | `lib/auth.ts:89-107`, `lib/auth-email-token.ts:79-129` | SHA-256 hash, `consumedAt`, `expiresAt` kontrolü doğru; tüketim `findFirst`+koşulsuz `update` → atomik değil (Bulgu 6); 2FA kontrolü yok (Bulgu 2). |
| 6 | Token üretimi (15 dk, kullanıcı başına tek geçerli) | ÇALIŞIYOR | `app/api/auth/magic-link/route.ts:72-78`, `lib/auth-email-token.ts:19-36` | Yeni istek eski token'ı siler; bu yüzden eski e-postadaki bağlantı "geçersiz" görünür ve kullanıcıya nedeni söylenmez. |
| 7 | Hata durumunda toast | KISMİ | `page.tsx:39-42`, `59` | Toast ile kart açıklaması birebir aynı metni gösterir (çift mesaj); hata türü ayrımı yok. |
| 8 | Ağ/beklenmeyen hata yönetimi | BOZUK | `page.tsx:33-47` | `signIn` fırlatırsa (ağ kopması, CSRF uç hatası) `try/catch` yok → promise reddi yutulur, `status` `working`'de kalır, spinner sonsuza döner. |
| 9 | Başarı durumu ("Yönlendiriliyorsunuz…") | KISMİ | `page.tsx:44`, `59`, `63` | `done` iken içerikte hiçbir görsel öğe yok (spinner yalnız `working`'de); kullanıcı boş bir kart görür. |
| 10 | `callbackUrl` açık-yönlendirme koruması | BOZUK | `lib/safe-callback-url.ts:13`, `page.tsx:45-46` | `/\evil.com`, `/<TAB>/evil.com` gibi değerler geçer, tarayıcı bunları `https://evil.com`'a çözer (Bulgu 1). |
| 11 | Varsayılan hedef `/` | KISMİ | `page.tsx:45`, `app/(public)/home-client.tsx:21-33`, `proxy.ts:90`, `proxy.ts:138-140` | Landing yüklenip istemcide role göre itiliyor; `proxy` matcher'ı `/`'yi kapsamadığı için STAFF yönlendirmesi ölü kod, STAFF `/customer`'a gönderiliyor. |
| 12 | Hata CTA: "Girişe dön" (`callbackUrl` korunarak) | ÇALIŞIYOR | `page.tsx:20-23`, `64-68` | Metin `auth.forgotPasswordBack` anahtarından ödünç (anlamsal yeniden kullanım). |
| 13 | "Yeni bağlantı gönder" aksiyonu | EKSİK | `page.tsx:64-68` | Süresi dolmuş/kullanılmış bağlantıda tek yol giriş sayfasına dönüp e-postayı yeniden yazmak. |
| 14 | Hata nedeni ayrımı (süresi doldu / kullanıldı / yenisi istendi / özellik kapalı) | EKSİK | `lib/auth.ts:92-94`, `lib/auth-email-token.ts:83-111` | Sunucu tek mesaj fırlatıyor, istemci de tek anahtar gösteriyor. |
| 15 | Durum değişiminin ekran okuyucuya duyurulması | EKSİK | `page.tsx:58-60` | `CardDescription` (`<p>`) üzerinde `role="status"`/`aria-live` yok. |
| 16 | Sayfa başlığı hiyerarşisi | KISMİ | `components/ui/card.tsx:44`, `page.tsx:57` | Sayfadaki tek başlık `h3`; `h1` yok. |
| 17 | AuthShell üst bar (logo → `/`, tema değiştirici) | ÇALIŞIYOR | `components/auth/auth-shell.tsx:57-116` | Tema butonu 44px dokunma hedefi, `aria-label` var. |
| 18 | "İçeriğe atla" bağlantısı | ÇALIŞIYOR | `components/auth/auth-shell.tsx:56`, `118-124` | |
| 19 | Metadata: sekme başlığı + noindex | ÇALIŞIYOR | `magic/layout.tsx:4-6`, `auth/layout.tsx:19-30`, `(auth)/layout.tsx:38-40` | |
| 20 | i18n (TR/EN) | KISMİ | `messages/tr.json:2353,2360-2361,2375`, `messages/en.json` aynı satırlar; `lib/email.ts:126-142` | Sayfa çift dilli; bağlantıyı taşıyan e-posta ve API yanıtları yalnız Türkçe (`route.ts:25,38,45,93`). |
| 21 | Segment hata sınırı (`error.tsx`) | ÇALIŞIYOR | `app/(auth)/error.tsx:55-97` | Sentry'ye raporlar, "Tekrar dene" + "Giriş". |
| 22 | Azaltılmış hareket desteği | ÇALIŞIYOR | `app/globals.css:801-805`, `825-828` | Spinner durur; ek animasyon olmadığı için başka risk yok. |
| 23 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:54`, `auth-shell.tsx:121` | `max-w-md` + `px-4`, safe-area alt boşluğu var. |
| 24 | Token'ı URL'den/geçmişten temizleme | EKSİK | `page.tsx:17`, `components/analytics/posthog-provider.tsx:37-41` | Token adres çubuğunda kalıyor ve PostHog `$pageview`'ine tam query ile gidiyor (Bulgu 3). |
| 25 | Başka hesapla oturum zaten açıkken uyarı | EKSİK | `page.tsx:27-51` | Mevcut oturum sessizce başka kullanıcıyla değiştirilir; "X olarak açıksın, Y'ye geçilsin mi?" sorulmaz. |
| 26 | Özellik kapatılınca bekleyen token'ların geçersizleşmesi | KISMİ | `lib/auth.ts:89-107`, `route.ts:36-39` | `enableMagicLink=false` yalnız yeni üretimi durdurur; 15 dk içindeki token'lar çalışmaya devam eder. Düşük risk. |
| 27 | Kod ile giriş yedeği (OTP) / farklı tarayıcı-cihaz senaryosu | EKSİK | — | iOS PWA ayrı çerez kavanozu, Gmail/Outlook uygulama-içi tarayıcısı → oturum yanlış bağlamda açılır. |
| 28 | Giriş analitiği (başarı/başarısızlık olayı) | EKSİK | `page.tsx` tamamı | Funnel'da magic link dönüşümü ölçülemiyor (`lib/analytics.ts` kullanılmıyor). |
| 29 | Dönüş deneyimi (hoş geldin, seri/puan özeti) | EKSİK | `page.tsx:44-46` | Müşteri doğrudan landing'e/panele itiliyor; "tekrar hoş geldin" anı yok. |

---

## Bulgular

### 1. YÜKSEK · Güvenlik · `safePostLoginRedirect` ters eğik çizgi / kontrol karakteriyle atlatılıyor → gerçek Qratex e-postasıyla açık yönlendirme
- **Kanıt:** `lib/safe-callback-url.ts:13` yalnız `s.startsWith('/') && !s.startsWith('//')` kontrol ediyor. `page.tsx:45-46` sonucu doğrudan `window.location.href`'e veriyor. Bağlantıyı üreten uç da aynı yardımcıyı kullanıyor: `app/api/auth/magic-link/route.ts:75-77`. Doğrulama (Node, WHATWG URL ayrıştırıcısı, `https://qratex.com` tabanı): `'/\evil.com/x'` → `https://evil.com/x`; `'/\t/evil.com'` → `https://evil.com/`; `'/\n/evil.com'` → `https://evil.com/`. Testler (`__tests__/lib/safe-callback-url.test.ts:11-13`) yalnız `//evil.com` vakasını kapsıyor.
- **Sorun:** Saldırgan, kurbanın e-postasıyla `POST /api/auth/magic-link` çağırıp `callbackUrl: "/\\evil.com"` gönderir (zod yalnız uzunluğa bakıyor, `route.ts:17`). Kurban Qratex'in kendi alan adından gelen gerçek bir e-posta alır, tıklar, gerçekten giriş yapar ve hemen ardından `evil.com`'a gönderilir — "oturumunuz düştü, şifrenizi tekrar girin" oltalaması için ideal zincir. Aynı yardımcıyı kullanan `forgot-password` ve `reset-password` akışları da etkilenir.
- **Öneri:** Yardımcıyı "dize kalıbı" yerine "ayrıştır ve köken karşılaştır" mantığına çevirin: `const u = new URL(s, allowedOrigin); if (u.origin !== new URL(allowedOrigin).origin) return undefined; return u.pathname + u.search + u.hash;` — göreli yollar da URL ayrıştırıcısından geçtiği için `\`, sekme, satır sonu, `%5C` normalleştirmeleri tarayıcıyla aynı şekilde yorumlanır. İstemcide `allowedOrigin` olarak `window.location.origin`, sunucuda `getPublicAppOrigin()` kullanılmaya devam edilir. Ek olarak rol izin listesi (CUSTOMER `/admin*`'e yönlendirilmesin) ve NextAuth `callbacks.redirect` ile sunucu tarafı ikinci savunma hattı. Regresyon testlerine `/\evil.com`, `/\t/evil.com`, `/%0a/evil.com`, `javascript:`, `https://qratex.com.evil.com` vakaları eklenmeli.
- **Efor:** S

### 2. YÜKSEK · Güvenlik · Magic link iki aşamalı doğrulamayı (2FA) tamamen atlıyor
- **Kanıt:** Şifre dalında 2FA zorunlu (`lib/auth.ts:182-194`), magic dalında ise token tüketildikten hemen sonra kullanıcı döndürülüyor, `twoFactorEnabled` hiç okunmuyor (`lib/auth.ts:89-106`; `lib/auth-email-token.ts:90-107` seçimde 2FA alanları bile yok). Bağlantıyı üreten uç da 2FA'lı kullanıcıyı ayırmıyor (`route.ts:72`).
- **Sorun:** 2FA'nın amacı "e-posta/şifre ele geçse bile hesap güvende" garantisidir. E-postası ele geçen bir kullanıcının (veya ADMIN/DEALER hesabının) 2FA'sı, giriş sayfasındaki "E-posta ile giriş" butonuyla tek tıkla devre dışı kalıyor. Admin için gizli kapı katmanı ayrıca var ama bayi panelinde (puan basma, kampanya, müşteri verisi) böyle bir ikinci kapı yok.
- **Öneri:** Magic token "birinci faktör" sayılmalı. `consumeMagicLoginToken` `twoFactorEnabled` döndürsün; 2FA açıksa `authorize` `2FA_REQUIRED` fırlatsın ama token'ı "yarı tüketilmiş" (ör. `stage: 'awaiting_2fa'`, 5 dk) olarak işaretlesin; sayfa bu durumda aynı kartta 6 haneli kod adımını göstersin ve ikinci `signIn` çağrısı `{ magicToken, twoFactorCode }` ile yapılsın (giriş sayfasındaki 2FA adımı bileşen olarak çıkarılıp paylaşılabilir: `components/auth/two-factor-step.tsx`). Alternatif/ek: rol bazlı politika — ADMIN/DEALER/STAFF için magic link hiç üretilmesin.
- **Efor:** M

### 3. YÜKSEK · Gizlilik/Güvenlik · Canlı giriş token'ı PostHog'a (üçüncü taraf) ve session replay'e gidiyor
- **Kanıt:** `components/analytics/posthog-provider.tsx:37-41` her sayfa görüntülemesinde `pathname + '?' + searchParams.toString()`'i `$current_url` olarak gönderiyor; `disable_session_recording: false`, `autocapture: true` (`:23-24`). PostHogProvider kök layout'ta (`app/layout.tsx`). `/auth/magic?token=<64 hex>&callbackUrl=…` olduğu gibi gider. Token 15 dk geçerli (`route.ts:73`). (Üretimde `NEXT_PUBLIC_POSTHOG_KEY`'in tanımlı olduğu bu denetimde doğrulanmadı; hafıza notlarına göre PostHog funnel'ı canlıda.)
- **Sorun:** Mutlu yolda token milisaniyeler içinde tüketilir; ama ağ hatası (Bulgu 5), JS'nin geç yüklenmesi, uygulama-içi tarayıcıda yarıda kalma gibi durumlarda token PostHog'da **geçerliyken** okunabilir. PostHog projesine erişimi olan herkes (ekip üyeleri, stajyerler) başkası adına oturum açabilir. Aynı sızıntı `reset-password?token=` için de geçerli ve orada token şifre değiştirme yetkisi taşıyor.
- **Öneri:** (a) `PageviewTracker`'da hassas parametreleri maskeleyen bir izin-listesi uygulayın (`token`, `code`, `callbackUrl` gibi parametreler `[redacted]`), ayrıca `posthog.init`'e `sanitize_properties` / `before_send` ile `$current_url`, `$referrer` temizliği ekleyin; `/auth/*` yollarında session recording'i kapatın (`posthog.stopSessionRecording()` veya `session_recording.maskAllInputs` + URL tetikleyici). (b) Sayfa mount olur olmaz token'ı state'e alıp `history.replaceState(null, '', '/auth/magic')` ile adres çubuğundan silin. (c) Sentry `beforeSend`'de de aynı maskeleme olduğundan emin olun.
- **Efor:** S

### 4. YÜKSEK · Hata (yarış) · Dil değişimi efekti iptal edip token'ı ikinci kez denetiyor → kullanıcı giriş yapmışken "bağlantı geçersiz" görüyor
- **Kanıt:** Efekt bağımlılıkları `[token, t, rawCallback]` (`page.tsx:51`). `useAppT` `locale`'e bağlı `useMemo` döndürüyor (`lib/app-locale.tsx:57-60`). `AppLocaleProvider` `locale`'i her zaman `'tr'` ile başlatıp mount sonrası localStorage/oturum diline göre değiştiriyor (`lib/app-locale.tsx:21-29`). NextAuth `signIn(redirect:false)` dönmeden önce `__NEXTAUTH._getSession({ event: 'storage' })`'ı bekliyor (`node_modules/next-auth/react/index.js:268-275`) → oturumdaki `preferredLanguage` `sessionLocale`'i değiştirebilir. Her iki durumda `t` kimliği değişir, cleanup `cancelled = true` yapar, efekt yeniden çalışır ve aynı token'la ikinci `signIn` gönderilir. İlk çağrı token'ı tüketmiş ve çerezi yazmıştır; ikinci çağrı `Geçersiz veya süresi dolmuş bağlantı` alır; ilk çağrının başarısı `if (cancelled) return` (`page.tsx:38`) ile yok sayılır. Ayrıca `next.config` `reactStrictMode: true` → geliştirmede efekt çift çalışır, aynı sonuç her seferinde yaşanır. (Kod yolu doğrulandı; üretimde tetiklenme sıklığı çalışma zamanında gözlenmedi.)
- **Sorun:** İngilizce kullanan (localStorage `en`) müşteri bağlantıya tıklar, oturumu açılır ama ekranda kırmızı "Invalid or expired link" toast'ı ve "Back to login" görür; tekrar dener, yeni bağlantı ister — güven kaybı ve gereksiz e-posta.
- **Öneri:** Token tüketimini render döngüsünden ayırın: `useRef` ile "bir kez çalıştı" kilidi (`startedRef.current`), efekt bağımlılıkları yalnız `[token]`; `t` ve `rawCallback` ref üzerinden okunur. İptal yerine "unmount olduysa yalnız setState yapma" mantığı kullanılmalı; yönlendirme her durumda yapılmalı. Daha sağlam hedef: tüketimi istemciden tamamen çıkarıp bir **sunucu route handler'ına** taşımak (aşağıda "Yeniden tasarım vizyonu"), böylece StrictMode/yeniden render sorunu yapısal olarak ortadan kalkar.
- **Efor:** S

### 5. ORTA · Hata yönetimi · Ağ hatasında sonsuz spinner
- **Kanıt:** `page.tsx:33-47` async IIFE'de `try/catch` yok; `signIn` içindeki `getCsrfToken()` ve `fetch` reddedilirse (`next-auth/react/index.js:233-252`) hata `void` ile yutulur, `setStatus` hiç çağrılmaz.
- **Sorun:** Zayıf mobil bağlantıda (müşterinin QR okuttuğu kafe/mağaza ortamı tipik) kullanıcı sonsuza dek "Giriş yapılıyor…" görür; ne tekrar dene ne de geri dönüş yolu vardır. Token tüketilmediği için hâlâ geçerlidir ama kullanıcı bunu bilmez.
- **Öneri:** `try/catch` + ayrı `network_error` durumu: "Bağlantı kurulamadı — Tekrar dene" butonu (aynı token'la yeniden dener; token tüketilmediyse çalışır). 15 sn zaman aşımı (`AbortController` yerine `Promise.race`) ile sonsuz bekleme engellenmeli. `navigator.onLine` false ise doğrudan çevrimdışı mesajı.
- **Efor:** S

### 6. ORTA · Veri bütünlüğü · Token tüketimi atomik değil (çifte kullanım penceresi)
- **Kanıt:** `lib/auth-email-token.ts:83-116` önce `findFirst({ consumedAt: null })`, sonra koşulsuz `update({ where: { id } , data: { consumedAt } })`. Aynı desen şifre sıfırlamada da var (`:43-63`).
- **Sorun:** Eşzamanlı iki istek (Bulgu 4'teki çift çağrı, e-posta güvenlik tarayıcısının JS çalıştıran "detonation" ziyareti + kullanıcının tıklaması, saldırganın yakaladığı bağlantı) aynı token'la iki ayrı oturum alabilir. "Tek kullanımlık" vaadi yalnız sıralı isteklerde geçerli.
- **Öneri:** Koşullu tek adım tüketim: `const { count } = await prisma.authEmailToken.updateMany({ where: { tokenHash, purpose, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } }); if (count !== 1) return null;` ardından kullanıcıyı oku. Şifre sıfırlamada aynı `updateMany` transaction'ın ilk adımı olmalı. Birim testi: aynı token'la `Promise.all` iki çağrı → yalnız biri başarılı.
- **Efor:** S

### 7. ORTA · UX/Performans · Başarıdan sonra müşteri pazarlama landing'ine düşüyor
- **Kanıt:** `page.tsx:45` varsayılan `'/'`; `/` ağır landing (`app/(public)/home-client.tsx:36-48`: Hero, Features, Marquee, Demo, Pricing…) ve yönlendirme yalnız istemcide `useSession` sonrası `router.push` ile (`:21-33`). Giriş sayfası ise doğrudan role göre gidiyor (`login/page.tsx:123-130`). `proxy.ts:90` STAFF kuralı matcher'da `/` olmadığı için (`proxy.ts:138-140`) hiç çalışmıyor; `home-client.tsx:30` STAFF'ı `/customer`'a yolluyor, oradan proxy `/staff`'a atıyor → üç sıçrama.
- **Sorun:** Müşteri e-postadaki butona bastıktan sonra landing'in bir anlık parlamasını görür, ardından paneline itilir; ölçülebilir ek LCP ve "yanlış yere geldim" hissi.
- **Öneri:** Rol bazlı hedefi tek bir yardımcıda toplayın: `resolvePostLoginTarget({ callbackUrl, role })` (`lib/post-login-target.ts`), üç giriş yolu (şifre, magic, OAuth `/auth/complete`) ve landing yönlendirmesi bunu kullansın. Magic sayfası `signIn` sonrası `getSession()` ile rolü okuyup doğrudan `/customer` vb. hedefe gitsin; `proxy` matcher'ına `/` eklensin ya da landing'de sunucu tarafı `getServerSession` + `redirect()` yapılsın.
- **Efor:** S

### 8. ORTA · UX · Hata durumu tek tip ve çıkmaz
- **Kanıt:** Sunucu tek mesaj (`lib/auth.ts:93`), istemci tek anahtar (`page.tsx:41`, `59`), tek aksiyon (`page.tsx:64-68`, metin `auth.forgotPasswordBack`). Yeni istek eski token'ları sildiği için (`lib/auth-email-token.ts:29`) "iki kez bağlantı istedim, ilk e-postaya tıkladım" vakası da aynı hatayı üretir.
- **Sorun:** Kullanıcı neden başarısız olduğunu (süresi doldu mu, zaten kullandı mı, daha yeni bir e-posta mı var) bilemez; çözüm için giriş sayfasına dönüp e-postasını yeniden yazmak zorunda. Duolingo/Slack/Notion bu ekranda tek tıkla "yeni bağlantı gönder" sunar.
- **Öneri:** `authorize` makine okunur kodlar fırlatsın: `MAGIC_EXPIRED`, `MAGIC_USED`, `MAGIC_SUPERSEDED`, `MAGIC_DISABLED` (token satırı silinmek yerine `supersededAt` ile işaretlenirse "daha yeni bir bağlantı gönderildi, son e-postayı aç" denebilir). Sayfa her koda özel başlık/açıklama + birincil aksiyon göstersin. "Yeni bağlantı gönder" için yeni uç: `POST /api/auth/magic-link/resend { token }` — token hash'inden kullanıcıyı bulur (süresi dolmuş olsa bile, ör. 24 saate kadar), e-postayı göstermeden yeniden gönderir, aynı oran sınırını uygular; böylece kullanıcı e-posta yazmadan tek tıkla devam eder ve enumerasyon riski doğmaz.
- **Efor:** M

### 9. ORTA · Güvenlik/Kötüye kullanım · Bağlantı isteği yalnız IP başına sınırlı; kurbanın bağlantısı sürekli geçersiz kılınabilir ve gelen kutusu doldurulabilir
- **Kanıt:** `lib/rate-limit.ts:354-361` anahtar `email_magic_link:<ip>`, 15 dk'da 8 istek (`:346-348`); e-posta başına sınır yok. Her yeni istek önceki token'ı siliyor (`lib/auth-email-token.ts:29`). Mevcut doğrulanmış kullanıcıda gönderim hatası 502, diğerinde 200 (`route.ts:79-86` vs `89-96`) → hesap varlığı sızar (giriş sayfası raporunda da not edildi).
- **Sorun:** IP döndüren bir saldırgan hem kurbana e-posta yağdırabilir hem de kurbanın elindeki geçerli bağlantıyı sürekli iptal edebilir (kurban Bulgu 8'deki çıkmaz hatayı görür).
- **Öneri:** E-posta hash'i başına ikinci sınır (ör. 15 dk'da 3, saatte 6), gönderim hatasında da aynı 200 yanıtı (hata sunucuda loglanır/Sentry'ye gider), yeni token eski token'ı hemen silmek yerine 60 sn tolerans tanısın veya en fazla 2 aktif token tutulsun.
- **Efor:** S

### 10. DÜŞÜK · Erişilebilirlik · Durum geçişleri duyurulmuyor, başlık hiyerarşisi eksik
- **Kanıt:** `page.tsx:58-60` açıklama düz `<p>`; spinner'lar `aria-hidden` (`:63`, `:80`) ve yanlarında sr-only metin yok; tek başlık `h3` (`components/ui/card.tsx:44`).
- **Sorun:** Ekran okuyucu kullanıcısı "Giriş yapılıyor" → "Bağlantı geçersiz" geçişini duymaz; toast'a güvenmek zorunda kalır.
- **Öneri:** Durum metnine `role="status" aria-live="polite"` (hata dalında `role="alert"`), Suspense yedeğine `<span className="sr-only">…</span>`, `CardTitle`'a `asChild`/`as="h1"` desteği; hata durumunda odak birincil aksiyona taşınsın.
- **Efor:** S

### 11. DÜŞÜK · i18n · Bağlantıyı taşıyan e-posta ve API mesajları yalnız Türkçe
- **Kanıt:** `lib/email.ts:126-142` sabit Türkçe konu/gövde; `route.ts:25,38,45,61,83,93` Türkçe JSON mesajları.
- **Sorun:** EN arayüz kullanan müşteri Türkçe e-posta alır; sayfa ise İngilizce açılır — tutarsız ilk temas.
- **Öneri:** `sendMagicLinkEmail(to, url, name, locale)` imzası; locale `User.preferredLanguage`'den, yoksa isteğin `Accept-Language`/locale çerezinden. API mesajları kod döndürsün, istemci çevirsin.
- **Efor:** S

### 12. DÜŞÜK · UX · Başka hesapla açık oturum sessizce değiştiriliyor
- **Kanıt:** `page.tsx:27-47` mevcut `useSession` durumuna bakmadan `signIn` çağırıyor.
- **Sorun:** Paylaşılan cihazda (aile tableti, mağaza kiosku) A hesabı açıkken B'nin bağlantısı A'yı sessizce kapatır; kullanıcı neyin değiştiğini anlamaz.
- **Öneri:** Oturum açık ve e-posta farklıysa (token'dan maskeli e-posta için küçük bir `GET /api/auth/magic-link/peek?token=` yerine sunucu route'unda karar) "a***@gmail.com olarak açıksın; b***@gmail.com hesabına geçilsin mi?" onayı.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

- **Kod ile giriş yedeği (OTP):** Slack, Notion, Revolut ve Starbucks e-postada bağlantının yanında 6 haneli kod da verir. iOS'ta Qratex PWA olarak kuruluysa bağlantı Safari'de açılır ve oturum PWA'ya geçmez; Gmail/Outlook uygulama-içi tarayıcısı da ayrı çerez kavanozudur. Kod, kullanıcının bağlantıyı açtığı cihazdan bağımsız olarak "beklediği yerde" girmesini sağlar.
- **"Diğer cihazda onayla" (cross-device):** Bağlantı telefonda açılırsa masaüstündeki bekleyen giriş ekranı otomatik ilerlesin (Monzo/Slack deseni; Redis'te `magic:pending:<id>` + kısa yoklama ya da SSE).
- **Tek tıkla yeni bağlantı / hata nedenine özel ekran:** (Bulgu 8).
- **Dönüş anı (welcome back):** Duolingo'nun "seri kurtarıldı", Starbucks'ın "X yıldızın var, 1 ödüle 20 yıldız" kartı gibi — giriş sonrası 1-2 sn'lik kişisel özet (puan, seviye, kaçırılan rozet/turnuva) ve ardından panele geçiş.
- **Güvenlik bildirimi:** "Yeni bir cihazdan giriş yapıldı" e-postası/push'u ve "Bu sen değil misin? Tüm oturumları kapat" bağlantısı (Revolut/Monzo standardı); magic link 2FA'yı atlamadığı sürece bile hesap ele geçirme tespitinin ana sinyali.
- **Ölçüm:** `magic_link_requested → magic_link_opened → magic_login_success/failed(reason)` funnel olayları (PostHog zaten kurulu).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** E-postadaki "Giriş yap" butonuna basan müşteri, 1 saniyeden kısa sürede ve hiçbir ara ekran görmeden kendi paneline (`/customer`) "tekrar hoş geldin" karşılamasıyla iner. Bir şey ters giderse ekran neyin olduğunu tek cümleyle söyler ve tek tıkla düzeltir (yeni bağlantı / kodu gir / tekrar dene). 2FA'lı kullanıcı aynı kartta kod adımına geçer.

**Mimari (veri akışı):**
1. **Tüketimi tek ve kilitli POST'a indir:** E-postadaki bağlantı yine `/auth/magic?token=…` sayfasına gelsin; sayfa token'ı mount anında state'e alıp `history.replaceState` ile URL'den silsin ve **yalnız bir kez** `POST` ile tüketsin (mevcut `signIn` çağrısı `useRef` kilidiyle ya da kodlu yanıt döndüren yeni `POST /api/auth/magic/consume`). Neden GET'te tüketmiyoruz: e-posta güvenlik tarayıcıları GET'i ön-yükler ve token'ı yakar — mevcut tasarımın en doğru kararı budur ve korunmalı.
2. **Yanıt sözleşmesi:** `{ ok: true, target: '/customer' }` veya `{ ok: false, code: 'MAGIC_EXPIRED' | 'MAGIC_USED' | 'MAGIC_SUPERSEDED' | 'MAGIC_DISABLED' | 'TWO_FACTOR_REQUIRED', resendable: boolean }`. Hedef, `resolvePostLoginTarget({ callbackUrl, role })` ile sunucuda belirlenir (URL ayrıştırıcılı köken kontrolü + rol izin listesi).
3. **Atomik tüketim** (`updateMany … consumedAt: null`), 2FA dalında "yarı tüketilmiş" durum, e-posta başına oran sınırı, `supersededAt`.
4. **Analitik maskeleme:** `posthog-provider.tsx`'te hassas parametre redaksiyonu, `/auth/*`'ta session recording kapalı.

**Yerleşim (mobil öncelikli, tek kart):**
- Üstte marka işareti (AuthShell zaten veriyor), ortada durum ikonu, altında başlık + tek cümle açıklama, en altta birincil aksiyon. Durumlar: `verifying` (nabız atan marka halkası, "Kimliğin doğrulanıyor"), `two_factor` (6 kutulu OTP alanı, `autocomplete="one-time-code"`), `success` (onay işareti + "Hoş geldin, Furkan" + mini özet satırı: puan · seviye · aktif seri), `error:<code>` (neden + birincil "Yeni bağlantı gönder", ikincil "Kodla gir" / "Girişe dön"), `offline` ("Tekrar dene").
- Başarı ekranı en fazla ~900 ms gösterilir, sonra panel; `prefers-reduced-motion`'da animasyonsuz doğrudan geçiş.

**Motion (ölçülü):** framer-motion (`m as Motion`) ile yalnız durum geçişlerinde `AnimatePresence` çapraz geçişi (opacity + 8px y, 180 ms) ve başarıda onay işaretinin `pathLength` çizimi (300 ms). Three.js/3B burada yersiz: kullanıcı bu sayfada 1 saniyeden az kalmalı; 3B yükü (bundle + GPU) tam da bekleme süresini uzatır. Karşılama/kutlama gerekiyorsa panelin kendi "welcome back" kartına bırakılmalı.

**Veri/API değişiklikleri özeti:**
- `lib/safe-callback-url.ts` → URL ayrıştırıcılı köken kontrolü (+ testler).
- `lib/auth-email-token.ts` → `consumeMagicLoginToken` atomik, `twoFactorEnabled` döndürür, hata kodu döndürür; `supersededAt` alanı (`AuthEmailToken` modeline `supersededAt DateTime?`, `stage String?` — yeni migration).
- `lib/auth.ts` → magic dalında 2FA kontrolü, kodlu hatalar.
- `app/api/auth/magic-link/route.ts` → e-posta başına oran sınırı, tek tip yanıt, locale'li e-posta, opsiyonel 6 haneli kod üretimi (aynı satırda `codeHash`).
- Yeni: `POST /api/auth/magic-link/resend { token }`, `lib/post-login-target.ts`.
- `components/analytics/posthog-provider.tsx` → URL redaksiyonu.

---

## Çakışmalar / birleştirme önerisi

- **`/auth/login` (magic link formu, 2FA adımı) ile kısmi çakışma:** Giriş sayfasındaki 2FA kod adımı ve "bağlantı gönder" formu bu sayfada da gerekecek (2FA dalı, "yeni bağlantı gönder"). Ayrı sayfa olarak kalmalı (e-postadaki hedef URL sabit olmalı), ama 2FA adımı ve magic istek formu `components/auth/` altında paylaşılan bileşenlere çıkarılmalı.
- **Yönlendirme mantığı üç yerde ve üç farklı kuralla:** `login/page.tsx:123-130` (rol bazlı, `callbackUrl` doğrulanmadan), `magic/page.tsx:45` (doğrulanmış ama rol yok, varsayılan `/`), `home-client.tsx:21-33` (istemci tarafı rol yönlendirmesi, STAFF eksik). Tek `resolvePostLoginTarget` yardımcısında birleştirilmeli; `/auth/complete` de buna bağlanmalı.
- **`/auth/reset-password` ile ortak altyapı:** Aynı `AuthEmailToken` tablosu, aynı atomik olmayan tüketim deseni ve aynı PostHog URL sızıntısı; düzeltmeler iki akışa birlikte uygulanmalı.
- Sayfa kaldırılmamalı: magic link e-postalarının sabit iniş noktasıdır ve token'ı JS ile tüketme kararı (e-posta tarayıcılarının ön-yüklemesine karşı) doğrudur.

---

## Doğrulama (şüpheci inceleme)

Kod salt okunur incelendi; veritabanına, dev server'a, build'e veya testlere dokunulmadı. Yalnızca WHATWG URL ayrıştırma davranışı Node ile yerelde, veriye dokunmadan denendi.

### 1. Açık yönlendirme: `safePostLoginRedirect`, `'/\evil.com'` ve `'/\t/evil.com'` değerlerini kabul ediyor. Karar: **DOĞRULANDI** (Yüksek)

- `lib/safe-callback-url.ts:13`: `s.startsWith('/') && !s.startsWith('//')` kontrolü yalnızca ilk iki karaktere bakıyor. `trim()` (`:10`) yalnızca baştaki ve sondaki boşlukları siliyor, içerideki TAB/LF karakterleri yerinde kalıyor.
- Node'da denendi: `new URL('/\\evil.com', 'https://qratex.com/auth/magic')` → `https://evil.com/`. Aynı sonuç `'/\t/evil.com'` ve `'/\\/evil.com'` için de çıkıyor. Üçü de yardımcı fonksiyondan geçiyor. `URLSearchParams` gidiş-dönüşünde değer bozulmadan korunuyor (`%2F%5Cevil.com` → `/\evil.com`).
- Zincir: `app/api/auth/magic-link/route.ts:17` alana yalnızca `max(2048)` uyguluyor. `:75-77` aynı yardımcıyı çağırıp değeri e-postadaki URL'ye yazıyor. `app/(auth)/auth/magic/page.tsx:45-46` ise `window.location.href = dest` ile yönlendiriyor.
- Yeniden üretim: (1) Saldırgan `POST /api/auth/magic-link {"email":"kurban@…","callbackUrl":"/\\evil.com"}` gönderir. Uç kimlik doğrulaması istemiyor, yalnızca IP oran sınırı var (`:22`). (2) Kurban, Qratex'in kendi alan adından gerçek bir e-posta alır ve tıklar. (3) `signIn` başarılı olur, kurban gerçekten oturum açar. (4) Tarayıcı `https://evil.com/` adresine gider. Bu adreste "oturum süreniz doldu, şifrenizi girin" gibi bir sahte sayfa gösterilebilir.
- Önkoşul: `enableMagicLink` site ayarının açık olması gerekir (`route.ts:36`, varsayılan `false`; `prisma/seed.ts:662` ayarı `true` olarak oluşturuyor). Üretimdeki değer doğrulanmadı. Ayar kapalı olsa bile aynı yardımcı `forgot-password` ve `reset-password` akışlarında da kullanılıyor, yani zayıflık ortak.
- Düzeltme yaklaşımı: Prefix kontrolü yerine `new URL(raw, allowedOrigin)` ile ayrıştırılmalı, ardından `u.origin === allowed.origin` şartı aranmalı ve `pathname+search+hash` döndürülmeli. Ham girdi de reddedilmeli: `\`, ASCII kontrol karakterleri (`\x00-\x1F`) veya `%5C` içeriyorsa geri çevrilmeli. Testler (`__tests__/lib/safe-callback-url.test.ts`) bu üç vakayla genişletilmeli.

### 2. Magic link girişi 2FA'yı atlıyor. Karar: **DOĞRULANDI** (Yüksek)

- `lib/auth.ts:89-106`: magic dalı `consumeMagicLoginToken` dönüşünden hemen sonra kullanıcı nesnesini döndürüyor. `twoFactorEnabled`/`twoFactorSecret` okunmuyor. `lib/auth-email-token.ts:93-106` bu alanları seçmiyor bile. Şifre dalında ise `:182-194` arasında TOTP zorunlu.
- `proxy.ts` içinde 2FA ile ilgili bir kontrol yok (grep ile bakıldı). Oturum açıldıktan sonra 2FA'yı yeniden zorlayan başka bir katman da yok.
- Yeniden üretim: 2FA'sı açık bir ADMIN/DEALER hesabının e-postası ele geçirilir (şifre bilinmiyor, TOTP cihazı yok) → `/auth/login` üzerinden magic link istenir → bağlantıya tıklanır → 2FA sorulmadan JWT oturumu açılır (`role` dahil). Şifre sıfırlama yolu bu saldırıyı yapamaz, çünkü sıfırlamadan sonraki şifreli girişte 2FA yine soruluyor. 2FA'yı fiilen boşa çıkaran yol magic link.
- Önkoşul: Madde 1'deki gibi `enableMagicLink` açık olmalı. ADMIN için ayrıca gizli kapı (admin gate) var, ama bu bir 2FA ikamesi değil. Bayi/müşteri panelleri doğrudan açılıyor.
- Düzeltme yaklaşımı: `consumeMagicLoginToken` 2FA durumunu döndürmeli. 2FA açıksa token "doğrulandı ama tamamlanmadı" aşamasına geçmeli (`stage`), istemciye `TWO_FACTOR_REQUIRED` dönmeli, sayfa da aynı kartta OTP adımını göstermeli. Token, ancak `verifyTwoFactorForLogin` başarılı olunca tüketilmeli.

### 3. Canlı magic/reset token'ı PostHog'a gönderiliyor. Karar: **DOĞRULANDI** (Orta; asıl risk reset-password'de)

- `components/analytics/posthog-provider.tsx:37-41`: `$current_url` alanına `pathname + searchParams.toString()` yazılıyor, yani `?token=…` aynen gidiyor. `posthog-js`, `$pageleave` ve autocapture olaylarına da varsayılan olarak `window.location.href` ekliyor. `sanitize_properties` veya `before_send` ile maskeleme yapılmıyor (`:18-25`). Session recording açık (`:24`).
- Anahtarın üretimde tanımlı olduğu önceki oturum notlarında kayıtlı (Vercel'de `NEXT_PUBLIC_POSTHOG_KEY`, EU host, "deploy'a gömülü doğrulandı"). Olaylar `app/layout.tsx` üzerinden her sayfada toplanıyor.
- Magic sayfası için risk penceresi dar. Token sayfa açılır açılmaz `signIn` ile tüketiliyor. Kötüye kullanılabilmesi için tüketimin başarısız olması gerekir (ağ hatası, `/api/auth/providers` veya `csrf` fetch'inin düşmesi, sekmenin erkenden kapanması). Bu durumda token 15 dk geçerli kalır (`route.ts:73`).
- Reset-password için risk daha somut. Orada token, kullanıcı formu doldurana kadar URL'de ve geçerli kalıyor. Akışı yarıda bırakan bir kullanıcının token'ı 60 dk boyunca geçerli (`app/api/auth/forgot-password/route.ts:68`). PostHog projesine erişimi olan biri (ekip üyesi, stajyer, ele geçirilmiş bir PostHog hesabı) olaylardan token'ı alıp `reset-password?token=…` ile şifreyi değiştirebilir ve hesabı ele geçirebilir. Yani gizli bir kimlik bilgisi üçüncü taraf bir analitik deposunda düz metin olarak duruyor.
- Düzeltme yaklaşımı: `posthog.init` içine `before_send`/`sanitize_properties` eklenip `$current_url`, `$referrer` ve `$pathname` alanlarındaki `token`, `code` ve `callbackUrl` parametreleri `[redacted]` ile değiştirilmeli. `/auth/*` için session recording kapatılmalı. Sayfa token'ı okuduktan sonra `history.replaceState` ile URL'den silmeli.

### 4. Dil/oturum değişimi efekti iptal edip token'ı ikinci kez deniyor, giriş başarılı olduğu halde hata gösteriliyor. Karar: **BELİRSİZ** (geliştirmede kesin, üretimde gösterilemedi; etkisi UX düzeyinde)

- Mekanizma doğru: efektin bağımlılıkları `[token, t, rawCallback]` (`magic/page.tsx:51`). `t`, `locale` değişince yeni kimlik alıyor (`lib/app-locale.tsx:57-60`). Efekt yeniden çalışınca `cancelled=true` olur (`:48-50`) ve ikinci bir `signIn` başlar. Token ilk istekte tüketildiyse ikinci istek `'Geçersiz veya süresi dolmuş bağlantı'` alır, `status='error'` olur ve toast gösterilir. Bu arada ilk isteğin çerezi zaten yazılmıştır, yani kullanıcı aslında oturum açmıştır.
- Geliştirmede bu kesin: `next.config` içinde `reactStrictMode: true` (`:258`) olduğu için efekt mount'ta iki kez çalışıyor. İki istek neredeyse aynı anda gittiğinden `consumeMagicLoginToken`'daki findFirst→update TOCTOU (atomik değil, `auth-email-token.ts:83-116`) bazen ikisinin de başarılı olmasına izin veriyor, bazen de hata gösteriyor.
- Üretimde kesinleşmedi:
  - (a) `localStorage`'da `en` kayıtlı kullanıcıda `AppLocaleProvider` mount efekti (`:24-29`) `tr→en` geçişini yapıyor. Bu geçişin `MagicInner` efektinden önce mi sonra mı işleneceği hidrasyon sırasına bağlı. `MagicInner`, `useSearchParams` nedeniyle bir `Suspense` sınırının içinde ve sınır ayrı bir hidrasyon/istemci-render geçişinde mount olabilir. Öyle olursa `t` zaten `en` kimliğindedir ve yeniden çalışma olmaz.
  - (b) Oturum yolu: `preferredLanguage` değişikliği `signIn` içindeki `await __NEXTAUTH._getSession()` (`next-auth/react/index.js:268-275`) sırasında state'e yazılıyor. Ancak React 18 bu render'ı zamanlayıcıyla sonraya bırakıyor. `await signIn` devamındaki `if (cancelled)` kontrolü bir mikro görevde çalıştığı için büyük olasılıkla temizlikten önce geçiliyor.
- Somut bir üretim senaryosu tarayıcıda gözlenmeden "doğrulandı" denemez. Veri kaybı veya güvenlik etkisi yok: kullanıcı oturum açmış durumda, yalnızca yanlış bir hata görüyor. Yine de düzeltme ucuz ve doğru: `t`'yi bağımlılıklardan çıkarıp `useRef` ile okumak, tüketimi `useRef` kilidiyle tek seferlik yapmak, `cancelled` durumunda sonucu yok saymak yerine "zaten giriş yapıldı mı" kontrolüne (`getSession`) düşmek.

---

## Uygulama (Dalga 2)

Sahip: p-auth yüzeyi. A1 (ortak güvenli hedef, magic link'te 2FA ara adımı, atomik tüketim, `useRef` kilidi, token'ın URL'den silinmesi, analitik redaksiyonu, e-posta başına sınır) korundu.

**Mimari:** `page.tsx` sunucu bileşeni (token/via/callback, bağlantıyla giriş bayrağı ve açık oturum sunucuda); `magic-view.tsx` durum makinesi: `confirm_switch → working → two_factor | done | error | network`. 2FA adımı girişle ortak `TwoFactorStep` (6 hücreli OTP + kurtarma kodu).

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Suspense yedeği | KALDIRILDI | Sunucu render; yükleme durumu aynı kart iskeletinde (`live=polite`). |
| 2 | URL'den token okuma | ÇALIŞIYOR | Sunucudan prop. |
| 3 | Token yoksa hata | ÇALIŞIYOR | "Bağlantı geçersiz" + aynı kartta yeni bağlantı isteme formu. |
| 4 | Otomatik giriş | ÇALIŞIYOR | Tek seferlik kilit (A1). |
| 5 | Sunucu doğrulama/tüketim | ÇALIŞIYOR | A1 atomik + 2FA. |
| 6 | Token üretimi | ÇALIŞIYOR | |
| 7 | Hata toast'ı | KALDIRILDI | Çift mesaj; yerine kalıcı kart. |
| 8 | Ağ hatası | ÇALIŞIYOR | Ayrı `network` durumu: "Bağlantın henüz kullanılmadı · Tekrar dene" (aynı token ile). |
| 9 | Başarı durumu | ÇALIŞIYOR | Onay ikonu + "yönlendiriliyorsun". |
| 10 | callbackUrl koruması | ÇALIŞIYOR | A1. |
| 11 | Varsayılan hedef | ÇALIŞIYOR | Rol ana sayfası (landing sıçraması yok). |
| 12 | "Girişe dön" | ÇALIŞIYOR | callback korunur. |
| 13 | "Yeni bağlantı gönder" | ÇALIŞIYOR | Hata kartında e-posta yazıp aynı yerden yeni bağlantı (bağlantıyla giriş açıksa); yanıt varlıktan bağımsız. |
| 14 | Hata nedeni ayrımı | KALAN | Sunucu tek `INVALID_LINK` döner; süresi doldu/kullanıldı/yenisi istendi ayrımı `lib/auth.ts` + `AuthEmailToken.supersededAt` (ŞEMA İSTEĞİ) gerektirir. |
| 15 | Ekran okuyucu duyurusu | ÇALIŞIYOR | Durum kartları `status`/`alert`; hata/ağ durumunda odak başlığa. |
| 16 | Başlık hiyerarşisi | ÇALIŞIYOR | `h1`. |
| 17 | Kabuk | ÇALIŞIYOR | |
| 18 | İçeriğe atla | ÇALIŞIYOR | |
| 19 | Metadata | ÇALIŞIYOR | |
| 20 | i18n | ÇALIŞIYOR | Sayfa TR/EN; bağlantı e-postası şablonu TR (ortak `lib/email` — kalan). |
| 21 | Segment hata sınırı | ÇALIŞIYOR | |
| 22 | Azaltılmış hareket | ÇALIŞIYOR | |
| 23 | Mobil yerleşim | ÇALIŞIYOR | |
| 24 | Token'ı URL'den silme | ÇALIŞIYOR | A1. |
| 25 | Başka hesapla açık oturum uyarısı | ÇALIŞIYOR | Oturum açıksa bağlantı otomatik TÜKETİLMEZ: "X hesabıyla oturumun açık · Bağlantıyla giriş yap / Açık oturumla devam et". |
| 26 | Özellik kapatılınca bekleyen token'lar | KALAN | `authorize` magic dalında site ayarı okunması (`lib/auth.ts`, güvenlik sahibi); 15 dk'lık pencere, düşük risk. |
| 27 | Kod ile giriş (OTP) | KALAN | E-postada kod üretimi + `codeHash` alanı → ŞEMA İSTEĞİ. |
| 28 | Giriş analitiği | ÇALIŞIYOR | `login_succeeded{method:magic|oauth_2fa}`, `login_failed{code}`, `magic_link_requested`. |
| 29 | Dönüş anı (hoş geldin) | KALDIRILDI | Bu geçiş ekranında 3B/özet yok (yol haritası §4.2); karşılama müşteri ana sayfası / An Motoru'nun işi. |

**Kapanan bulgular:** 1 (A1), 2 (A1), 3 (A1), 4 (A1), 5 (ağ durumu), 6 (A1), 7 (rol hedefi), 8 (kısmen: yeni bağlantı tek ekranda; neden ayrımı kalan), 9 (A1), 10, 12 → 10/12 tam, 1 kısmi.
**Kalanlar:** Bulgu 8'in neden ayrımı ve Bulgu 11 (e-posta şablonu dili) — ortak `lib/auth.ts` / `lib/email.ts` + şema işi.
