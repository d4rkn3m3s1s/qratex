# /auth/complete

**Amaç:** OAuth (Google/GitHub) girişinin/kaydının ardından uğranan ara adım. Şifresi olmayan (yeni OAuth) hesaba isteğe bağlı "şifre oluştur" adımı sunar, URL'de `ref` varsa davet kodunu `/api/referral` ile uygular, ardından `next` parametresine yönlendirir.
Dosya: `app/(auth)/auth/complete/page.tsx` (+ `layout.tsx`, `app/(auth)/layout.tsx` → `AuthShell`, `app/(auth)/error.tsx`).

**Genel puan: 4.8/10** · **Karar: yeniden tasarla** (rota korunmalı ama tek sorumlu "OAuth sonrası onboarding" adımına dönüştürülmeli; açık yönlendirme acil düzeltilmeli)

---

## Puan kartı

| Alan | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Ana akış çalışıyor ama `next` açık yönlendirmeye izin veriyor, davet sonucu hiç kontrol edilmeden "bonus eklendi" deniyor, OAuth ile seçilen DEALER rolü kayboluyor. |
| UX | 4/10 | Atlanan şifre adımı her Google girişinde tekrar karşına çıkıyor; davet ödülü miktarı/kutlaması yok; metin "Google" diye sabit, GitHub kullanıcısına yanlış. |
| Görsel | 4/10 | Düz bir kart + spinner; ürünün geri kalanındaki (karşılama videosu, rozet, 3B kutu) marka hissinin hiçbiri yok; ilk izlenim anı harcanıyor. |
| Mimari | 5/10 | Hazır `safePostLoginRedirect` yardımcısı kullanılmıyor; aynı işi yapan iki ayrı şifre ucu var (`/api/auth/set-password` ve `/api/user/initial-password`), politikalar farklı. |
| Performans | 8/10 | Hafif istemci bileşeni, 1 GET + en fazla 2 POST; tek kusur temizlenmeyen `setTimeout`. |
| Erişilebilirlik + Mobil | 6/10 | `role="status"`/`aria-live` ve `Label` var; ama `<form>` ve `autoComplete="new-password"` yok, göster/gizle düğmesi ~20px dokunma hedefi, hata `aria-describedby` ile alana bağlı değil. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Suspense fallback (spinner + sr-only metin) | ÇALIŞIYOR | `page.tsx:165-173`, `175-181` | `useSearchParams` için zorunlu sınır doğru kurulmuş. |
| 2 | Oturum yüklenirken bekleme | ÇALIŞIYOR | `page.tsx:49` | `status === 'loading'` iken hiçbir şey yapılmıyor, spinner görünür. |
| 3 | Oturumsuz kullanıcıyı `/auth/login`'e atma | KISMİ | `page.tsx:50` | `ref` ve `next` atılıyor; login'e `callbackUrl` taşınmıyor → davet kodu ve hedef kaybolur. |
| 4 | Şifre var mı kontrolü (`GET /api/auth/set-password`) | ÇALIŞIYOR | `page.tsx:53-61`, `app/api/auth/set-password/route.ts:19-26` | Hata/401'de `hasPassword:true` varsayıp atlıyor (fail-open, ama yalnız UX adımı olduğu için kabul edilebilir). |
| 5 | Şifre adımı başlık + açıklama | KISMİ | `page.tsx:92-96` | "Google ile giriş yaptın" sabit; GitHub ile gelen kullanıcıya yanlış (`register/page.tsx:162-164` GitHub sunuyor). i18n dışında. |
| 6 | Şifre alanı | KISMİ | `page.tsx:102-111` | `<form>` yok, `name` yok, `autoComplete="new-password"` yok → parola yöneticisi kaydetme/üretme teklif etmez. |
| 7 | Şifreyi göster/gizle | ÇALIŞIYOR | `page.tsx:112-119` | `aria-label` var; dokunma hedefi yalnız ikon boyutu (h-5 w-5). |
| 8 | İstemci tarafı min 8 karakter kontrolü | KISMİ | `page.tsx:67`, `set-password/route.ts:29` | Kayıt formu büyük+küçük harf+rakam şart koşuyor (`lib/validations.ts:30-37`); bu yol yalnız uzunluk istiyor → tutarsız politika. |
| 9 | Enter ile gönderme | ÇALIŞIYOR | `page.tsx:109` | Form yerine `onKeyDown` ile taklit ediliyor. |
| 10 | "Şifreyi Kaydet ve Devam Et" + yükleniyor | ÇALIŞIYOR | `page.tsx:123`, `components/ui/button.tsx:50-64` | `loading` düğmeyi devre dışı bırakıyor. |
| 11 | Sunucu hata mesajının gösterimi | ÇALIŞIYOR | `page.tsx:75-80`, `121` | `role="alert"` var; `aria-invalid`/`aria-describedby` yok (Input bunları destekliyor: `components/ui/input.tsx:12`). |
| 12 | "Şimdilik atla" | KISMİ | `page.tsx:124-126` | Atlama kalıcı değil: login her Google girişini buraya yolluyor (`login/page.tsx:265-268`), şifresiz hesapta adım her seferinde tekrar çıkar. |
| 13 | Davet kodu uygulama (`POST /api/referral`) | KISMİ | `page.tsx:36-42`, `app/api/referral/route.ts:118-283` | Yanıt hiç okunmuyor; yalnız ağ hatası `catch` ile yutuluyor. |
| 14 | "Davet bonusu hesabınıza eklendi!" başarı ekranı | SAHTE | `page.tsx:140-145` | `phase==='done' && refCode` koşulu yeter; API 400 (kod zaten kullanılmış), 404 (geçersiz), modül kapalı veya 500 dönse bile başarı gösterilir. |
| 15 | "Davet kodu işleniyor" ara durumu | ÇALIŞIYOR | `page.tsx:147-158` | |
| 16 | `next` hedefine yönlendirme | BOZUK | `page.tsx:24-25`, `44` | `startsWith('/')` kontrolü `//evil.com` ve `/\evil.com`'u geçiriyor → açık yönlendirme (bkz. Bulgu 1). |
| 17 | Yönlendirme gecikmesi (400/1200ms) | ÇALIŞIYOR | `page.tsx:44` | Zamanlayıcı unmount'ta temizlenmiyor (küçük). |
| 18 | Canlı bölge (`role=status`, `aria-live`, `aria-busy`) | ÇALIŞIYOR | `page.tsx:133-138` | |
| 19 | Segment hata sınırı | ÇALIŞIYOR | `app/(auth)/error.tsx:236-277` | Sentry + yeniden dene + girişe dön. |
| 20 | Metadata (noindex, sekme başlığı) | ÇALIŞIYOR | `complete/layout.tsx`, `app/(auth)/layout.tsx:219-221` | Başlık "Profili tamamla" ama sayfa profil tamamlamıyor (bkz. Eksikler). |
| 21 | AuthShell başlık: logo + tema düğmesi | ÇALIŞIYOR | `components/auth/auth-shell.tsx:55-116` | 44px tema düğmesi, skip-link var. |
| 22 | Rol niyetinin korunması (Kayıt'ta DEALER seçip OAuth) | BOZUK | `register/page.tsx:151-156`, `prisma/schema.prisma` User `role @default(CUSTOMER)`, `lib/auth.ts` `events.createUser` yalnız `emailVerified` yazıyor, `proxy.ts:60-73` | `next=/dealer` gelir, kullanıcı CUSTOMER oluşturulmuştur, proxy `/customer`'a geri atar; işletme hesabı açma niyeti sessizce kaybolur. |
| 23 | Dil desteği (i18n) | KISMİ | `page.tsx:67,76,79,92-96,99,105,116,123,125` | Şifre adımının tamamı sabit Türkçe; durum metinleri `t()` ile. Üstelik i18n metinleri "siz" (`messages/tr.json:2411`), sabit metinler "sen" diliyle → hitap karışık. |
| 24 | Azaltılmış hareket | KISMİ | `page.tsx:148`, `169` | Yalnız `animate-spin`; `motion-safe:` yok. Etkisi düşük. |
| 25 | Şifre gücü göstergesi / onay alanı | EKSİK | — | Göster/gizle onay alanının yerini kısmen tutuyor ama güç geri bildirimi yok. |
| 26 | Davet ödülü miktarı ve kutlama | EKSİK | API `pointsEarned` dönüyor: `referral/route.ts:272-276` | Sayfa bu değeri hiç kullanmıyor. |
| 27 | Profil tamamlama (ad, avatar, dil, bildirim izni, ilgi alanı) | EKSİK | — | Metadata "Profili tamamla" vaat ediyor. |
| 28 | Şifre belirleme denetim kaydı (audit log) | EKSİK | `set-password/route.ts:59-62` vs `app/api/user/initial-password/route.ts:56-65` | Ayarlar sayfasındaki eş uç audit yazıyor, bu yol yazmıyor. |
| 29 | İlk anlamlı aksiyona bağlama (QR okut / karşılama) | EKSİK | — | Yönlendirme sonrası onboarding'i `OnboardingSheet` + `WelcomeVideoModal` (`app/customer/layout.tsx:46-48`) üstleniyor; bu sayfa ile bağı yok. |

**Sayım:** ÇALIŞIYOR 13 · KISMİ 8 · BOZUK 2 · SAHTE 1 · EKSİK 5 (toplam 29)

---

## Bulgular

### 1. Açık yönlendirme (open redirect): `next=//evil.com`
- **Önem:** Kritik · **Kategori:** güvenlik
- **Kanıt:** `app/(auth)/auth/complete/page.tsx:24-25` (`const safeNext = nextUrl.startsWith('/') ? nextUrl : '/customer'`), `:44` (`router.replace(safeNext)`). Next 16.1.6 router'ı, farklı origin'li URL'yi `isExternalURL` ile tespit edip `location.replace` ile tam sayfa dışarı gönderiyor (`node_modules/next/dist/client/components/app-router-instance.js:210-222`, `router-reducer/reducers/navigate-reducer.js:146-147`). `new URL('//evil.com/x', 'https://qratex…')` → `https://evil.com/x`; `new URL('/\\evil.com', …)` → `https://evil.com/` (yerelde Node ile doğrulandı).
- **Sorun:** Oturumu açık herhangi bir kullanıcı `https://<site>/auth/complete?next=//evil.com` bağlantısına tıkladığında, şifresi varsa ~400ms sonra saldırgan alan adına gönderilir. Güvenilir alan adından başlayan bir bağlantı olduğu için oltalama ("oturum süren doldu, tekrar giriş yap") için ideal. Zincir de mümkün: `login/page.tsx:67` ham `callbackUrl`'i okuyor, `:267` yine yalnız `startsWith('/')` ile `next`'e koyuyor → `/auth/login?callbackUrl=//evil.com` → Google → `/auth/complete?next=//evil.com` → dış site.
- **Ayrıca:** Projedeki hazır yardımcı `lib/safe-callback-url.ts:13` de `//`'yi engelliyor ama `/\evil.com` (ters bölü) varyantını engellemiyor.
- **Öneri:** Tek kaynak bir `resolveInternalPath(raw)` yardımcısı: `new URL(raw, location.origin)` ile çözümle, `origin` eşit değilse reddet, yalnız `pathname+search+hash` döndür; ayrıca izinli önek listesi (`/customer`, `/dealer`, `/staff`, `/admin`, `/`) uygula. `safePostLoginRedirect`'i de bu yaklaşımla düzelt (ters bölü ve kontrol karakterleri). Bu sayfa, login sayfasının Google dalı ve register'ın `callbackWithRef`'i aynı yardımcıyı kullansın. Birim testi: `//x`, `/\x`, `/%5Cx`, `\t/x`, `javascript:`.
- **Efor:** S

### 2. Davet sonucu kontrol edilmeden "bonus eklendi" gösteriliyor
- **Önem:** Yüksek · **Kategori:** veri doğruluğu / UX
- **Kanıt:** `page.tsx:36-43` (yanıt atılıyor, yalnız ağ hatası `.catch(() => {})`), `:140-145` (başarı ekranı yalnız `refCode` varlığına bağlı). API ise birçok başarısızlık yolu dönüyor: zaten kullanılmış 400 (`referral/route.ts:142-144`), geçersiz 404 (`:152-154`), kendi kodun (`:160-162`), aylık/ömür boyu limit (`:168-185`), modül kapalı (`:120-121`), 500.
- **Sorun:** Puan ekonomisinde kullanıcıya olmayan bir ödülü vaat etmek güveni doğrudan zedeler; kullanıcı puanının neden gelmediğini destek kanalına taşır. Ayrıca gerçek kazanılan `pointsEarned` hiç gösterilmiyor.
- **Öneri:** Yanıtı tipli oku (`{success, pointsEarned} | {error, code}`); başarıda "+N puan" kutlama durumu, başarısızlıkta nötr bilgi ("Davet kodu uygulanamadı: … — kodu daha sonra Davet sayfasından girebilirsin" + `/customer/referral` bağlantısı). API hata mesajları İngilizce (`'Invalid referral code'`) olduğu için API'ye makine-okunur `code` alanı (`ALREADY_USED`, `INVALID`, `SELF`, `LIMIT`, `MODULE_OFF`) ekleyip metni istemcide i18n'den üret.
- **Efor:** S

### 3. OAuth ile "İşletme" kaydı sessizce müşteri hesabına dönüşüyor
- **Önem:** Yüksek · **Kategori:** işlevsellik / akış
- **Kanıt:** `register/page.tsx:151-156` (`next=/dealer`), OAuth düğmeleri rol seçiminden bağımsız gösteriliyor (`:261`, `:291`); `prisma/schema.prisma` User `role Role @default(CUSTOMER)`; `lib/auth.ts` `events.createUser` yalnız `emailVerified` set ediyor; `proxy.ts:60-73` CUSTOMER'ı `/dealer`'dan `/customer`'a atıyor.
- **Sorun:** İşletme sahibi Google ile kaydolur, müşteri paneline düşer, hiçbir açıklama görmez. Bu sayfa niyetin işlenebileceği tek ara durak ama `next`'i yalnız kör bir hedef olarak kullanıyor.
- **Öneri:** `next` yerine açık bir `intent=dealer` parametresi taşı; `/auth/complete` yeni hesapta (`createdAt` < birkaç dakika ve rol CUSTOMER) "İşletme hesabı oluştur" adımı göstersin ve sunucu tarafında doğrulanmış bir uçla (ör. `POST /api/onboarding/role`, yalnız yeni + henüz bayi kaydı olmayan hesaplar için, mevcut dealer kayıt doğrulamalarını yeniden kullanarak) rol/Dealer kaydı başlatsın; sonra JWT'yi `update()` ile tazelesin. Alternatif: register'da DEALER seçiliyken OAuth düğmelerini gizleyip e-posta akışına zorlamak (daha ucuz, daha kötü UX).
- **Efor:** M

### 4. "Şimdilik atla" kalıcı değil — şifresiz kullanıcı her girişte aynı ekranla karşılaşıyor
- **Önem:** Orta · **Kategori:** UX
- **Kanıt:** `login/page.tsx:265-268` her Google girişini `/auth/complete`'e yolluyor; `page.tsx:58` `hasPassword === false` ise her seferinde `password` fazına geçiyor; atlama hiçbir yere yazılmıyor (`page.tsx:124`).
- **Sorun:** Kullanıcının "hayır" kararına saygı göstermeyen tekrar eden bir engel; her giriş bir tık uzuyor. Duolingo/Revolut gibi ürünler isteğe bağlı adımları bir kez sorar, sonra ayarlara/hatırlatıcıya taşır.
- **Öneri:** `User` üzerinde `passwordPromptDismissedAt` (veya mevcut bir tercih JSON'u) alanı; GET ucu `{hasPassword, promptDismissed}` dönsün, atlama `POST /api/auth/set-password { dismiss: true }` ile kaydedilsin. Tekrar sorma yalnız bir güvenlik bağlamında (ör. 30 gün sonra veya Google hesabı bağlantısı kaldırılmak istenirken) yapılsın; ayarlar sayfasındaki "Şifre oluştur" kartı zaten var (`app/customer/settings/page.tsx:898-910`).
- **Efor:** S

### 5. Aynı işi yapan iki şifre ucu, iki farklı politika
- **Önem:** Orta · **Kategori:** mimari / güvenlik tutarlılığı
- **Kanıt:** `app/api/auth/set-password/route.ts` (rate limit 5/5dk `:39`, `hashPassword` `:59`, `emailVerified` set `:62`, audit yok, try/catch yok) ile `app/api/user/initial-password/route.ts` (rate limit yok, `bcrypt.hash(...,12)` sabit `:50`, audit log var `:56-65`, `emailVerified` yok, max 128 vs 200). Kayıt şeması ise karmaşıklık istiyor (`lib/validations.ts:30-37`).
- **Sorun:** Aynı hesap güvenliği olayı iz bırakıp bırakmamaya, hangi sayfadan yapıldığına göre değişiyor; OAuth yolu kayıttan zayıf şifreye izin veriyor. Ayrıca her iki uçta da "şifre yok mu?" kontrolü ile `update` ayrı adım (TOCTOU); etkisi düşük ama `updateMany({ where: { id, password: null } })` ile atomik yapılabilir.
- **Öneri:** Tek servis fonksiyonu `setInitialPassword(userId, plain, meta)` (lib/), tek zod şeması (`passwordPolicySchema`, kayıtla ortak), atomik koşullu güncelleme, rate limit + audit log + `emailVerified`; iki rota bu fonksiyonu çağıran ince sarmalayıcılar olsun ya da biri kaldırılsın. Hata yanıtlarına makine-okunur kod ekle.
- **Efor:** M

### 6. Parola yöneticisi ve form semantiği yok
- **Önem:** Orta · **Kategori:** erişilebilirlik / UX
- **Kanıt:** `page.tsx:98-123` — `<form>` yok, `name`/`autoComplete` yok, kullanıcı adı alanı yok; Enter `onKeyDown` ile taklit ediliyor (`:109`).
- **Sorun:** "Şifre oluştur" ekranının birincil amacı kullanıcının bu şifreyi sonra hatırlaması; ama tarayıcı/iOS Keychain/1Password güçlü şifre önermiyor ve kaydetmeyi teklif etmiyor. Sonuç: unutulan şifre → şifre sıfırlama trafiği.
- **Öneri:** `<form onSubmit>` + gizli `<input type="email" autoComplete="username" value={session.user.email} readOnly hidden>` + şifre alanında `name="new-password" autoComplete="new-password"`; hata metnini `Input`'un `error`/`errorId` özellikleriyle alana bağla (`aria-invalid`, `aria-describedby`); göster/gizle düğmesini 44×44 dokunma hedefine büyüt.
- **Efor:** S

### 7. Sağlayıcıya ve dile duyarsız sabit metin
- **Önem:** Orta · **Kategori:** i18n / içerik
- **Kanıt:** `page.tsx:92-96` "Google ile giriş yaptın … E-postan Google ile doğrulanmış sayılır"; GitHub sağlayıcısı etkin (`lib/auth.ts` GitHubProvider, `register/page.tsx:162-164`). Şifre adımının tüm metinleri sabit TR (`:67,76,79,99,105,116,123,125`); EN kullanıcı Türkçe görür. Hitap karışık ("hesabınıza" `messages/tr.json:2411` vs "yaptın").
- **Sorun:** Yanlış sağlayıcı adı güveni zedeler; GitHub'da "e-postan doğrulanmış sayılır" iddiası da tartışmalı (GitHub sağlayıcısı birincil e-postanın `verified` bayrağına bakmıyor: `node_modules/next-auth/providers/github.js:36`; `allowDangerousEmailAccountLinking: true` ile birlikte hesap bağlama riski — bu sayfanın dışında, **doğrulanmadı**, ayrıca incelenmeli).
- **Öneri:** Sağlayıcıyı sunucudan al (GET ucu `provider: 'google' | 'github'` dönsün, `Account` tablosundan), tüm metinleri `auth.complete.*` anahtarlarına taşı, tek hitap dili seç (ürünün geri kalanı "sen" ise TR mesajları da "sen").
- **Efor:** S

### 8. Oturumsuz yönlendirmede davet ve hedef kayboluyor
- **Önem:** Düşük · **Kategori:** akış
- **Kanıt:** `page.tsx:50` `router.replace('/auth/login')`.
- **Sorun:** Nadir (OAuth dönüşünde çerez gecikmesi, oturum süresi dolmuş sekme) ama olduğunda davet kodu kalıcı olarak düşer; `ref` yalnız URL'de yaşıyor, hiçbir yerde saklanmıyor.
- **Öneri:** `ref`'i ilk girişte kısa ömürlü, httpOnly bir çerezde (`qx_ref`, 7 gün) sakla ve sunucu tarafında hesap oluşturma anında uygula; login'e `callbackUrl=/auth/complete?…` taşı.
- **Efor:** S

### 9. Temizlenmeyen zamanlayıcı ve aşama makinesi
- **Önem:** Düşük · **Kategori:** kod kalitesi
- **Kanıt:** `page.tsx:44` `setTimeout` dönüş değeri saklanmıyor; aşama durumu dört string + iki ayrı bayrak (`saving`, `pwError`).
- **Sorun:** Kullanıcı bu arada geri giderse yönlendirme yine tetiklenir; akış büyüdükçe (rol, profil, izinler) bu yapı dağılır.
- **Öneri:** `useReducer` tabanlı açık bir durum makinesi (`checking → password? → role? → referral → done`), zamanlayıcıyı `useEffect` temizliğiyle yönet.
- **Efor:** S

### 10. Mevcut kullanıcılar da bu yoldan davet bonusu alabiliyor
- **Önem:** Düşük · **Kategori:** ekonomi (bilgi)
- **Kanıt:** `page.tsx:36-42` hesap yaşı kontrolü yok; `referral/route.ts:137-144` yalnız "daha önce kullanmış mı" bakıyor. Aynı yetenek zaten `/customer/referral` sayfasında açık (`app/customer/referral/page.tsx:137-160`).
- **Sorun:** Bu sayfaya özgü bir açık değil (ürün kararı); ama "yeni kullanıcı daveti" anlamı korunacaksa kontrol sunucuda olmalı.
- **Öneri:** Ürün kararı netleştirilsin; "yalnız yeni hesaplar" ise API'de `createdAt` penceresi (ör. 7 gün) veya "ilk geri bildirimden önce" koşulu.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Karşılama/ödül anı (Starbucks Rewards, Duolingo):** Davetle gelen kullanıcıya "+N puan hoş geldin hediyesi" kartı, puanın bakiyeye akışı ve "ilk QR okutmanda +X daha" sonraki adım vaadi. Şu an yalnız tek satır metin.
2. **Tek seferlik, adımlı onboarding (Revolut/Monzo):** Ad onayı, avatar, dil, bildirim izni (push merkezi zaten var), konum izni (Yakındakiler için) — her biri atlanabilir, ilerleme çubuğu ile; metadata "Profili tamamla" diyor ama hiçbiri yok.
3. **Güçlü şifre deneyimi:** Güç göstergesi, parola yöneticisi entegrasyonu, ya da modern yaklaşım: şifre yerine **passkey** önerisi ("Bu cihazda Face ID ile giriş").
4. **Hesap türü seçimi:** OAuth sonrası "Müşteri misin, işletme mi?" adımı (Bulgu 3).
5. **Davet edenin kimliği:** "Ayşe seni davet etti — ikinize de 500 puan" gibi sosyal kanıt (API `referredBy` bilgisine zaten sahip).
6. **Kaldığın yerden devam:** QR okutup geri bildirim verirken girişe yönlendirilen kullanıcıyı tam o işletmeye/forma geri götürmek (`next` korunuyor ama bağlamı kullanıcıya söylenmiyor: "Kahve Dünyası değerlendirmene dönüyoruz").

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Giriş sonrası boş bekleme ekranı" yerine 10–20 saniyelik, atlanabilir, kişiselleştirilmiş bir **hoş geldin anı**. Mevcut kullanıcı (şifreli, eski hesap) için ise sayfa görünmez olmalı: sunucu tarafında karar verilip doğrudan hedefe gidilmeli.

**Yerleşim (mobil öncelikli, tek sütun, max-w-md):**
1. **Sunucu ön kontrolü:** Sayfayı server component + client adım bileşenlerine böl. Server tarafında `getServerSession` + tek sorguyla `{hasPassword, promptDismissed, createdAt, role, provider, pendingRef}` oku. Eski hesap ve yapılacak adım yoksa `redirect(resolveInternalPath(next))` — spinner hiç görünmez, ağ turu azalır.
2. **Adım 1 — Hoş geldin kartı:** Avatar (Google fotoğrafı), "Merhaba Furkan" ve davet varsa davet edenin adı + ödül miktarı.
3. **Adım 2 — Hesap türü** (yalnız `intent=dealer` veya belirsizse).
4. **Adım 3 — Giriş yöntemi güvencesi:** "Passkey ekle" (birincil) / "Şifre belirle" (ikincil) / "Şimdi değil" (kalıcı kaydedilir).
5. **Adım 4 — İzinler:** Bildirim (push) ve isteğe bağlı konum; her biri tek dokunuş.
6. **Bitiş:** Davet ödülü varsa puan sayacı animasyonu, ardından `next`'e veya ilk QR okutma çağrısına geçiş. Müşteri layout'undaki `OnboardingSheet` bu akışı tamamlayan kullanıcıya tekrar gösterilmemeli (aynı bayrak).

**Motion/3B (ölçülü):** Adımlar arası `m as Motion` ile 200–250ms yatay kaydırma + opaklık; ödül anında puan sayacı (`useSpring`) ve kısa bir konfeti/parıltı. Burada three.js kullanılmamalı: bu sayfa giriş kritik yolunda, ağır paket indirmemeli. İstenirse imza ödül kutusunun statik bir görseli/küçük Lottie'si yeter. Tüm animasyonlar `useReducedMotion` ile kapatılabilir; spinner'lar `motion-safe:animate-spin`.

**Veri/API değişiklikleri:**
- `lib/safe-redirect.ts`: origin karşılaştırmalı tek yönlendirme doğrulayıcı (Bulgu 1) — tüm auth sayfaları ortak kullanır.
- `GET /api/onboarding/state` → `{ hasPassword, promptDismissed, provider, isNewAccount, role, referral: { pending, referrerName, rewardPoints } }`.
- `POST /api/onboarding/password` (birleşik servis, Bulgu 5), `POST /api/onboarding/dismiss`, `POST /api/onboarding/role`.
- `POST /api/referral` yanıtına makine-okunur `code`; davet kodu URL'den httpOnly çereze taşınıp sunucuda uygulanabilsin (Bulgu 8).
- `User` tablosuna `onboardingCompletedAt` / `passwordPromptDismissedAt` (veya mevcut tercih JSON'u) — şema değişikliği canlı Neon'a dikkatli migration ile.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/settings` şifre kartı** (`app/customer/settings/page.tsx:395-410`) ↔ bu sayfanın şifre adımı: aynı iş, farklı uç (`/api/user/initial-password` vs `/api/auth/set-password`) ve farklı politika. UI ikisi de kalabilir ama **tek servis + tek uç** olmalı.
- **`/customer/referral` "kod uygula"** (`app/customer/referral/page.tsx:137-160`) ↔ bu sayfanın sessiz davet uygulaması: ortak bir `applyReferral()` istemci yardımcısı ve ortak hata/başarı metinleri kullanılmalı; burada başarısız olan davet için oraya yönlendirme yapılmalı.
- **`OnboardingSheet` + `WelcomeVideoModal`** (`app/customer/layout.tsx:46-48`) ↔ bu sayfanın "hesabını tamamla" rolü: üç ayrı ilk-kullanım yüzeyi var ve birbirinden habersiz (biri localStorage bayrağı `qratex-onboarding-done` kullanıyor). Önerilen yeniden tasarımda `/auth/complete` sunucu tarafı onboarding durumunun sahibi olmalı, layout'taki yüzeyler bu duruma göre gösterilmeli.
- **Kaldırma önerilmez:** OAuth geri dönüşünün tek ortak ara noktası olarak rota değerli; doğru yer burası.

---

## Doğrulama (şüpheci inceleme)

Yöntem: her iddia çürütülmeye çalışılarak çağıran/çağrılan kod, `proxy.ts`, `lib/auth.ts`, `lib/safe-callback-url.ts`, `app/api/referral/route.ts`, `prisma/schema.prisma` ve Next 16.1.6 istemci router kaynağı baştan okundu. Uygulama, DB, test veya build çalıştırılmadı; yalnız WHATWG `URL` çözümlemesi ve Next'in `addPathPrefix`/`normalizePathTrailingSlash` yardımcıları yerelde Node ile denendi (DB'ye dokunmayan saf fonksiyonlar).

### 1. Açık yönlendirme `/auth/complete?next=//evil.com` → **DOĞRULANDI (Kritik)**
- **Kontrol 1, sunucu tarafında koruma var mı?** Yok. `proxy.ts` `config.matcher` yalnız `/api`, `/admin`, `/admin-gate`, `/dealer`, `/customer` (proxy.ts sonu); `/auth/*` hiç proxy'den geçmiyor. `complete/layout.tsx` yalnız metadata üretiyor, `redirect` yok.
- **Kontrol 2, router dışarı gider mi?** Evet. `page.tsx:25` yalnız `startsWith('/')`; `:44` `router.replace(safeNext)`. `app-router-instance.js` `dispatchNavigateAction` → `new URL(addBasePath(href), location.href)`; basePath boş olduğundan `'//evil.com/x'` değişmeden geçiyor (Node ile denendi), `isExternalURL` = `url.origin !== window.location.origin` (`app-router-utils.js:25-27`) → `navigate-reducer.js:146-147` `handleExternalUrl` → `mpaNavigation` → `app-router.js:207-209` `location.replace/assign`.
- **Varyantlar (Node ile doğrulandı):** `//evil.com/x` → `https://evil.com/x`; `/\evil.com` (sorguda `next=/%5Cevil.com`, `searchParams.get` çözer) → `https://evil.com/`; `/\t/evil.com` → `https://evil.com/`.
- **Login zinciri:** `login/page.tsx:67` ham `callbackUrl`, `:267` yine yalnız `startsWith('/')`; `lib/auth.ts` içinde özel `redirect` callback'i yok, next-auth varsayılanı göreli `/auth/complete?next=%2F%2Fevil.com` adresini kabul ediyor → zincir çalışır.
- **Ön koşul / sınır:** Kurban oturum açık olmalı (`page.tsx:50` oturumsuzu login'e atar). Şifreli hesapta otomatik ~400 ms sonra; şifresiz OAuth hesabında "şifre" adımından (kaydet veya atla) sonra. `lib/safe-callback-url.ts:13` `'/\evil.com'` için `true` döndürüyor (`startsWith('//')` yakalamıyor) — ek iddia da doğru; bu yardımcı login/magic/forgot/reset sayfalarında kullanılıyor, yani etki bu sayfayla sınırlı değil.
- **Yeniden üretim:** Oturum açıkken `https://<site>/auth/complete?next=/%5Cevil.com` aç → tarayıcı `https://evil.com/` adresine tam sayfa geçer.

### 2. Davet bonusu başarısı sahte gösteriliyor → **DOĞRULANDI (Yüksek)**
- `page.tsx:37-41` `fetch` sonucu hiçbir değişkene atanmıyor, `res.ok`/gövde okunmuyor; `.catch` yalnız ağ hatasını yutar. `:140-145` koşul `phase === 'done' && refCode`; `messages/tr.json:2411` "Davet bonusu hesabınıza eklendi!".
- API'nin bonus vermeden döndüğü dallar (satırlar güncel okumayla): modül kapalı `referral/route.ts:120-121`, 401 `:124`, zaten kullanılmış `:143` ve P2002 `:265`, geçersiz kod 404 `:153`, pasif kod, kendi kodu `:161`, ömür boyu limit `:170`, aylık limit `:184`, `maxUsage`, 500.
- **Yeniden üretim:** Daha önce davet kodu kullanmış bir hesapla (veya geçersiz kodla) `/auth/register?ref=XXXX` → Google → `/auth/complete?ref=XXXX&next=/customer`: API 400/404 döner, ekranda yeşil tik ve "Davet bonusu hesabınıza eklendi!" görünür, bakiye değişmez. Ekonomi tarafında sahte kredi YOK (sunucu atomik, `points_credited` yazıyor); sorun yalnız kullanıcıya yanlış bilgi verilmesi — yine de puan güvenine doğrudan dokunduğu için Yüksek uygun.

### 3. OAuth ile DEALER kaydı CUSTOMER olarak oluşuyor → **DOĞRULANDI (Yüksek; kök neden bu sayfanın dışında)**
- `register/page.tsx:151-156` DEALER seçiliyken yalnız `next=/dealer` taşınıyor; Google/GitHub düğmeleri (`:261`, `:291` civarı) rolden bağımsız. Rol bilgisi sunucuya hiçbir yoldan gitmiyor.
- `PrismaAdapter` kullanıcıyı şemadaki varsayılanla oluşturuyor: `prisma/schema.prisma:37` `role Role @default(CUSTOMER)`. `lib/auth.ts:316-323` `events.createUser` yalnız `emailVerified` yazıyor; `signIn` callback'i (`:303-309`) rol ataması yapmıyor. JWT rolü DB'den okuyor (`lib/auth.ts:240`).
- `/auth/complete` `router.replace('/dealer')` yapar → `proxy.ts` `/dealer` için `token.role !== 'DEALER'` → `roleRedirects.CUSTOMER` = `/customer`'a atar. Kod tabanında müşteriyi işletmeye yükselten self-servis bir uç bulunamadı (`app/api` + `lib` taramasında `role: 'DEALER'` geçen dosyalar yalnız sorgu filtresi). E-posta kayıt yolu ise rolü doğru yazıyor (`app/api/auth/register/route.ts:40,62`) → tutarsızlık gerçek.
- **Yeniden üretim:** `/auth/register` → "İşletme" seç → Google ile devam (yeni Google hesabı) → `/auth/complete?next=/dealer` → kullanıcı açıklamasız `/customer`'a düşer; DB'de `role=CUSTOMER`, Dealer kaydı yok.
- **Not:** Hata `/auth/complete`'in kendi kodunda değil, kayıt/OAuth akışında; ama bu sayfa niyetin işlenebileceği tek ara durak olduğu için rapordaki sahiplik makul. Önerilen `intent=dealer` + sunucu doğrulamalı rol ucu yaklaşımı doğru yön; ucuz ara çözüm olarak DEALER seçiliyken OAuth düğmelerini gizlemek veya `/auth/complete`'te "İşletme hesabı e-posta ile oluşturulur" açıklaması gösterilmesi de geçerli.

**Özet:** 3 iddianın 3'ü de doğrulandı; hiçbiri çürütülemedi. 1 numara canlıda acil düzeltilmeli (ortak güvenli yönlendirme yardımcısı + `safePostLoginRedirect` ters bölü düzeltmesi).

---

## Uygulama (Dalga 2)

Sahip: p-auth yüzeyi. A1 (P0-02 güvenli `next`, dürüst davet sonucu `referral-outcome.ts`, OAuth niyet çerezi, işletme uyuşmazlığı açıklaması) korundu.

**Mimari:** `page.tsx` sunucu bileşeni — oturum, şifre durumu, sağlayıcı ve rol DB'den ilk HTML ile gelir (istemci GET + spinner turu kalktı); oturum yoksa `ref` ve `next` korunarak girişe gönderilir. Adımlar `complete-view.tsx`; kart, şifre alanı ve bantlar ortak `components/auth/p-auth/**`.

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Suspense yedeği | KALDIRILDI | Sunucu render. |
| 2 | Oturum yüklenirken bekleme | KALDIRILDI | Oturum sunucuda okunur. |
| 3 | Oturumsuz → giriş | ÇALIŞIYOR | `callbackUrl=/auth/complete?ref&next` ile; davet ve hedef kaybolmaz. |
| 4 | Şifre var mı | ÇALIŞIYOR | Sunucuda (DB hatasında isteğe bağlı adım atlanır). |
| 5 | Başlık + açıklama | ÇALIŞIYOR | Sağlayıcı adı (Google/GitHub) DB'den. |
| 6 | Şifre alanı | ÇALIŞIYOR | `<form>`, `new-password`, gizli `username` (hesap e-postası). |
| 7 | Göster/gizle | ÇALIŞIYOR | 44×44. |
| 8 | Şifre politikası | ÇALIŞIYOR | Kayıtla AYNI kural (istemci canlı + `/api/auth/set-password` sunucu zorunlu). |
| 9 | Enter ile gönderme | ÇALIŞIYOR | Gerçek form. |
| 10 | Kaydet + yükleniyor | ÇALIŞIYOR | |
| 11 | Hata gösterimi | ÇALIŞIYOR | Kodlu (`WEAK_PASSWORD`, `PASSWORD_TOO_LONG`, `RATE_LIMITED`, `ALREADY_SET`) → TR/EN; `aria-describedby`. |
| 12 | "Şimdilik atla" | ÇALIŞIYOR | Bu cihazda hatırlanır; hesap bazlı kalıcılık ŞEMA İSTEĞİ (`passwordPromptDismissedAt`). |
| 13 | Davet uygulama | ÇALIŞIYOR | |
| 14 | "Bonus eklendi" ekranı | ÇALIŞIYOR | A1: yalnız gerçekten işlenen ödülde, puan miktarıyla. |
| 15 | "İşleniyor" ara durumu | ÇALIŞIYOR | |
| 16 | `next` yönlendirmesi | ÇALIŞIYOR | A1 tek kaynak. |
| 17 | Yönlendirme gecikmesi | ÇALIŞIYOR | Zamanlayıcı temizlenir; davetsiz akışta bekleme yok. |
| 18 | Canlı bölge | ÇALIŞIYOR | AuthCard `live`. |
| 19 | Segment hata sınırı | ÇALIŞIYOR | |
| 20 | Metadata | ÇALIŞIYOR | |
| 21 | Kabuk | ÇALIŞIYOR | Ortak AuthShell. |
| 22 | Rol niyeti (DEALER + OAuth) | ÇALIŞIYOR | A1 niyet çerezi + kayıt ekranı niyet yazılamazsa OAuth'u durdurur; girişten başlatılan OAuth eski niyeti temizler; mevcut müşteri hesabına bağlanınca açıklama kartı. |
| 23 | i18n | ÇALIŞIYOR | Tüm metinler TR/EN, tek hitap ("sen"). |
| 24 | Azaltılmış hareket | ÇALIŞIYOR | |
| 25 | Şifre gücü | ÇALIŞIYOR | Ortak PasswordField. |
| 26 | Davet ödülü miktarı | ÇALIŞIYOR | "+N puan". |
| 27 | Profil tamamlama | KALDIRILDI | Bu sayfanın kapsamı değil (müşteri karşılama `OnboardingSheet`'in işi); sahte adım eklenmedi. |
| 28 | Denetim kaydı | ÇALIŞIYOR | `SET_INITIAL_PASSWORD` (Ayarlar'daki eş uçla aynı iz). |
| 29 | İlk anlamlı aksiyona bağlama | KALDIRILDI | Müşteri ana sayfa/karşılama yüzeyinin işi; burada yönlendirme güvenli hedefe gider. |

**Kapanan bulgular:** 1 (A1), 2 (A1), 3 (A1 + istemci), 5 (iki şifre ucu aynı politikaya + denetim kaydına bağlandı), 6, 7, 8, 9 → 8/10. Bulgu 4 kısmen (cihaz bazlı).
**Kalanlar:** Bulgu 4'ün hesap bazlı kalıcılığı (ŞEMA İSTEĞİ); Bulgu 10 (mevcut kullanıcının davet kodu) ürün kararı, `/api/referral` sahibinin işi.
**Doğrulama:** `__tests__/api/auth-p-auth.test.ts` (set-password: 401, WEAK_PASSWORD, atomik yazım + denetim, ALREADY_SET) + `__tests__/lib/auth-pages.test.ts` yeşil.
