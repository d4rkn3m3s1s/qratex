# Müşteri Paneli — Sentez Raporu (2026-10-08)

> Kapsam: tüketici tarafının tamamı (QR okutan, geri bildirim veren, puan/XP/rozet/lig kazanan, oyun oynayan, ödül alan son kullanıcı). Auth akışları, herkese açık sayfalar, `/c/[token]`, `/feedback/[code]`, `/customer/**` (22 mini oyun dahil), `/offline`, `/surveys/[id]`, `/table-signal` — **80 sayfa**.
> Kaynak: bu klasördeki 80 sayfa raporu ve her raporun sonundaki "Doğrulama (şüpheci inceleme)" bölümü. Doğrulamada **çürütülen** alt iddialar sayılmadı (bkz. §3.4).
> Kıyas çıtası: Starbucks Rewards (kazan → harca döngüsü), Duolingo (seri, lig, günlük görev), Revolut/Monzo (mobil his, defter şeffaflığı), Spotify Wrapped (paylaşılabilir anlatı).
> Salt okunur inceleme. Kod, veritabanı, build ve test çalıştırılmadı. Sentez sırasında iki bulgu doğrudan dosyadan bir kez daha teyit edildi: `lib/safe-callback-url.ts:13` ve `app/api/customer/games/[game]/start/route.ts:56-73`, `app/api/gamification/progress/route.ts:151-224`.

---

## 1. Yönetici özeti

**Panel sağlık puanı: 4,2 / 10**

80 sayfanın genel puan ortalaması **4,48**. Sağlık puanı bunun biraz altında tutuldu, çünkü doğrulanmış güvenlik ve puan ekonomisi açıkları ortalamanın gösterdiğinden ağır. Envanterde **~3.390 özellik** sayıldı; bunların **~360'ı "bozuk" ya da "sahte"** (≈ %11). "Kısmi" çalışan özellikler bunun yaklaşık iki katı.

Tek cümleyle: **ürünün yüzeyi geniş ve görsel olarak iddialı, ama alttaki güven katmanı (kimlik, puan defteri, oturum durumu, veri doğruluğu) bu genişliği taşıyamıyor.** 80 sayfanın hiçbiri 6'yı geçmiyor. Sorunlar tek tek sayfa hatası olarak değil, birkaç ortak kök nedenin her sayfada tekrar etmesi olarak görünüyor.

**En ağır beş sonuç (hepsi doğrulandı):**

1. **Kimlik ve yönlendirme güvenliği kırık.** Login `callbackUrl` değeri filtrelenmeden `window.location.href`'e veriliyor. Bu hem açık yönlendirme hem `javascript:` ile DOM XSS demek (CSP `unsafe-inline` içeriyor). Ortak `safePostLoginRedirect` yardımcısı `/\evil.com` ile aşılıyor; bu yüzden gerçek Qratex şifre sıfırlama ve magic link e-postaları oltalama aracına dönüşebiliyor. Magic link 2FA'yı atlıyor. Şifre sıfırlama açık oturumları düşürmüyor. Üretim giriş ekranında ADMIN demo şifresi düz metin duruyor.
2. **Puan ekonomisinin "net-sıfır / atomik tek seferlik kredi" değişmezleri birden çok yoldan deliniyor.** Kayıt rotası, e-posta doğrulanmadan ve limit uygulamadan davet puanı basıyor (tek IP'den günde teorik ~7,2M puan). Bayi, mutlu saat çarpanını sınırsız girip tek tüketimde 50M puan basabiliyor. Herhangi bir müşteri `POST /api/gamification/progress` ile gizli olmayan her rozeti kendine verip puan alabiliyor. Otomatik ödüllenen görevler "Ödül Al" ile ikinci kez ödeniyor. 22 mini oyunun tamamında skor istemci beyanı.
3. **Yetkisiz veri erişimi (IDOR / kapsam açığı) yaygın.** Oturumsuz `/api/gamification/badges?userId=` ve `/api/gamification/quests?userId=` başka kullanıcının verisini döndürüyor. STAFF rolü `GET /api/feedbacks` ile tüm platformun geri bildirimlerini ve müşteri e-postalarını okuyabiliyor. Liderlik ucu oturumsuz ve kullanıcının "liderlikte gösterme" tercihini yok sayıyor. Ekip modülünde yöneticiye tüm kullanıcı tabanı listeleniyor; rolü silinen kişi bayat JWT ile yetkisini koruyor.
4. **KVKK uyumu kağıt üzerinde.** Çerez reddi hiçbir izlemeyi durdurmuyor: PostHog autocapture ve session replay rızasız çalışıyor. Şifre sıfırlama token'ı PostHog'a gidiyor. Dört yasal sayfanın "son güncelleme" tarihi render anından üretiliyor. Şartlara onay hiçbir yerde kaydedilmiyor.
5. **Kullanıcıya gösterilen sayıların önemli kısmı yanlış ya da uydurma.** Seri sabit 0. "Kazanılan puan" yorum sayısı × 50. Sonraki ödül sabit "Ücretsiz Kahve". Seviye ilerlemesi geometrik eğri yerine doğrusal formülle hesaplanıyor. Haftalık liderlik sentetik 50/100 formülüyle sıralanıyor. Trendlerdeki "son rozetler" her kullanıcıda boş. Ana sayfada uydurma "Bize güvenen işletmeler" şeridi var. Hata durumları neredeyse her sayfada "henüz veri yok" boş durumu olarak gösteriliyor, bu da yanlışı görünmez kılıyor.

**Olumlu taraf:** Oyun motorlarının görsel cilası (mind-thief, bot-hunter 7/10 görsel), seviye/escrow gibi bazı yollarda `updateMany` ile atomik guard kullanımı, `points_credited` görünürlüğünün çoğu kredi yolunda yazılması, rate-limit ve modül-kapısı altyapısının var olması (sorun eksik kullanılmaları). Yani düzeltme büyük oranda **var olan doğru desenleri tek merkezde toplayıp her yere uygulama** işi; sıfırdan icat gerekmiyor.

**Öneri:** Önce 7 bağımsız P0 epiği paralel olarak kapatılmalı (§7). Ardından bilgi mimarisi 58 müşteri rotasından ~18 birincil yüzeye indirilmeli (§5). Görsel/motion dili tek bir "arena + cüzdan" sistemine bağlanmalı (§6). Yeni özellik eklemek, P0 ve P1'deki ortak altyapı (puan defteri, tek seviye eğrisi, tek seri servisi, tek veri durumu katmanı) bitmeden yapılmamalı.

---

## 2. Tüm sayfaların puan tablosu

Sütunlar: genel / işlevsellik / UX / görsel (10 üzerinden) · karar · envanterdeki özellik sayısı · bozuk + sahte özellik sayısı.

| # | Route | Genel | İşlev. | UX | Görsel | Karar | Özellik | Bozuk+Sahte |
|---|---|---|---|---|---|---|---|---|
| 1 | `/auth/complete` | 4,8 | 5 | 4 | 4 | yeniden tasarla | 29 | 3 |
| 2 | `/auth/forgot-password` | 5,5 | 6 | 4 | 5 | koru-iyileştir | 31 | 1 |
| 3 | `/auth/login` | 4,4 | 5 | 4 | 5 | yeniden tasarla | 41 | 5 |
| 4 | `/auth/magic` | 5,0 | 5 | 4 | 4 | koru-iyileştir | 29 | 2 |
| 5 | `/auth/register` | 4,5 | 3 | 4 | 6 | yeniden tasarla | 44 | 4 |
| 6 | `/auth/reset-password` | 5,5 | 6 | 5 | 6 | koru-iyileştir | 36 | 0 |
| 7 | `/auth/verify-email` | 4,0 | 4 | 3 | 5 | yeniden tasarla | 29 | 2 |
| 8 | `/blog/[slug]` | 4,5 | 5 | 4 | 3 | yeniden tasarla | 35 | 2 |
| 9 | `/blog` | 3,5 | 4 | 3 | 4 | yeniden tasarla | 37 | 3 |
| 10 | `/cerez-politikasi` | 3,5 | 2 | 4 | 4 | yeniden inşa | 34 | 5 |
| 11 | `/experience/[token]` | 3,3 | 3 | 2 | 3 | yeniden tasarla | 38 | 5 |
| 12 | `/feedback/[code]` | 4,8 | 5 | 5 | 6 | yeniden tasarla | 51 | 7 |
| 13 | `/gizlilik-politikasi` | 3,5 | 3 | 3 | 3 | yeniden inşa | 28 | 3 |
| 14 | `/guven` | 4,0 | 4 | 3 | 4 | yeniden tasarla | 27 | 3 |
| 15 | `/kullanim-sartlari` | 3,8 | 3 | 3 | 4 | yeniden tasarla | 33 | 1 |
| 16 | `/kvkk-aydinlatma-metni` | 3,5 | 3 | 3 | 3 | yeniden inşa | 29 | 1 |
| 17 | `/neden-qratex` | 5,0 | 5 | 4 | 5 | yeniden tasarla | 31 | 3 |
| 18 | `/` (landing) | 4,5 | 4 | 4 | 6 | yeniden tasarla | 53 | 12 |
| 19 | `/c/[token]` | 5,5 | 6 | 5 | 5 | yeniden tasarla | 43 | 4 |
| 20 | `/customer/ai-insights` | 4,0 | 4 | 4 | 5 | birleştir | 52 | 7 |
| 21 | `/customer/analytics` | 4,0 | 4 | 4 | 5 | birleştir | 40 | 10 |
| 22 | `/customer/badges` | 4,5 | 4 | 4 | 6 | yeniden tasarla | 52 | 12 |
| 23 | `/customer/campaigns` | 3,0 | 1 | 3 | 5 | yeniden inşa | 30 | 9 |
| 24 | `/customer/category-leaderboard` | 3,9 | 3 | 3 | 4 | birleştir | 36 | 2 |
| 25 | `/customer/consumptions/[id]` | 4,4 | 5 | 4 | 5 | yeniden tasarla | 39 | 5 |
| 26 | `/customer/consumptions` | 5,0 | 5 | 5 | 6 | yeniden tasarla | 36 | 3 |
| 27 | `/customer/discover` | 4,0 | 4 | 3 | 4 | birleştir | 24 | 4 |
| 28 | `/customer/donations` | 5,3 | 6 | 5 | 6 | koru-iyileştir | 57 | 4 |
| 29 | `/customer/ekip/departmanlar` | 5,0 | 6 | 5 | 6 | koru-iyileştir | 35 | 1 |
| 30 | `/customer/ekip` | 5,0 | 6 | 5 | 6 | birleştir | 78 | 4 |
| 31 | `/customer/event` | 4,0 | 3 | 4 | 5 | birleştir | 34 | 4 |
| 32 | `/customer/experiences` | 3,0 | 3 | 2 | 3 | yeniden inşa | 41 | 7 |
| 33 | `/customer/favorites` | 3,8 | 3 | 3 | 5 | yeniden tasarla | 32 | 3 |
| 34 | `/customer/feedbacks/[id]/journey` | 4,8 | 5 | 4 | 4 | birleştir | 31 | 1 |
| 35 | `/customer/feedbacks` | 4,5 | 5 | 4 | 5 | yeniden tasarla | 46 | 3 |
| 36 | `/customer/games/bot-hunter` | 5,0 | 5 | 5 | 7 | yeniden tasarla | 50 | 3 |
| 37 | `/customer/games/combo-tap` | 5,0 | 5 | 5 | 6 | yeniden tasarla | 51 | 4 |
| 38 | `/customer/games/data-miner` | 4,5 | 4 | 4 | 6 | yeniden tasarla | 46 | 4 |
| 39 | `/customer/games/data-snake` | 5,3 | 5 | 5 | 6 | koru-iyileştir | 53 | 7 |
| 40 | `/customer/games/frost-catcher` | 5,0 | 5 | 5 | 6 | birleştir | 47 | 3 |
| 41 | `/customer/games/guardian-of-trust` | 5,0 | 5 | 5 | 6 | yeniden tasarla | 53 | 1 |
| 42 | `/customer/games/lucky-wheel` | 4,0 | 4 | 4 | 5 | birleştir | 44 | 3 |
| 43 | `/customer/games/memory-match` | 5,2 | 5 | 5 | 6 | koru-iyileştir | 38 | 2 |
| 44 | `/customer/games/mind-thief` | 5,0 | 5 | 5 | 7 | koru-iyileştir | 56 | 4 |
| 45 | `/customer/games/network-defender` | 3,8 | 3 | 4 | 5 | yeniden inşa | 48 | 5 |
| 46 | `/customer/games/pacman` | 3,8 | 2 | 4 | 6 | birleştir | 49 | 5 |
| 47 | `/customer/games` (hub) | 5,5 | 6 | 5 | 6 | yeniden tasarla | 36 | 3 |
| 48 | `/customer/games/review-detective` | 5,0 | 5 | 5 | 6 | birleştir | 44 | 2 |
| 49 | `/customer/games/review-stack` | 5,5 | 6 | 5 | 6 | koru-iyileştir | 54 | 1 |
| 50 | `/customer/games/signal-pipe` | 5,0 | 6 | 4 | 6 | koru-iyileştir | 42 | 1 |
| 51 | `/customer/games/spam-breaker` | 5,0 | 5 | 4,5 | 6 | koru-iyileştir | 50 | 5 |
| 52 | `/customer/games/spam-defense` | 5,0 | 6 | 5 | 5 | birleştir | 45 | 2 |
| 53 | `/customer/games/speed-order` | 5,0 | 3 | 5 | 6 | koru-iyileştir | 48 | 5 |
| 54 | `/customer/games/troll-slayer` | 4,5 | 5 | 4 | 6 | birleştir | 55 | 3 |
| 55 | `/customer/games/trust-merge` | 5,0 | 5 | 5 | 6 | koru-iyileştir | 55 | 1 |
| 56 | `/customer/games/truth-vs-fake` | 4,5 | 5 | 4 | 6 | birleştir | 46 | 4 |
| 57 | `/customer/games/word-spot` | 4,5 | 5 | 4 | 6 | birleştir | 44 | 2 |
| 58 | `/customer/journey-score` | 4,5 | 4 | 4 | 6 | birleştir | 47 | 8 |
| 59 | `/customer/leaderboard` | 3,6 | 3 | 4 | 6 | yeniden inşa | 57 | 12 |
| 60 | `/customer/lounge` | 3,5 | 3 | 3 | 4 | birleştir | 36 | 8 |
| 61 | `/customer/my-card` | 4,5 | 5 | 4 | 5 | yeniden tasarla | 49 | 9 |
| 62 | `/customer/my-year` | 4,5 | 4 | 4 | 4 | yeniden tasarla | 31 | 3 |
| 63 | `/customer/nearby` | 4,0 | 4 | 4 | 5 | yeniden tasarla | 46 | 8 |
| 64 | `/customer` (dashboard) | 4,6 | 4 | 4 | 6 | yeniden tasarla | 67 | 11 |
| 65 | `/customer/progress-hub` | 4,0 | 4 | 4 | 4 | birleştir | 43 | 6 |
| 66 | `/customer/quests` | 3,5 | 2 | 4 | 6 | yeniden inşa | 41 | 7 |
| 67 | `/customer/referral` | 5,0 | 5 | 5 | 6 | yeniden tasarla | 36 | 3 |
| 68 | `/customer/remedy/[offerId]` | 4,0 | 3 | 4 | 4 | yeniden tasarla | 33 | 4 |
| 69 | `/customer/remedy` | 4,5 | 4 | 4 | 6 | yeniden tasarla | 32 | 4 |
| 70 | `/customer/rewards` | 4,6 | 4 | 5 | 6 | yeniden tasarla | 55 | 7 |
| 71 | `/customer/scan` | 5,4 | 6 | 4,5 | 5,5 | yeniden tasarla | 36 | 3 |
| 72 | `/customer/settings` | 4,3 | 4 | 4 | 5 | yeniden tasarla | 58 | 8 |
| 73 | `/customer/shop` | 4,8 | 5 | 4 | 5 | yeniden tasarla | 50 | 8 |
| 74 | `/customer/spending-overview` | 4,8 | 6 | 4 | 4 | birleştir | 38 | 1 |
| 75 | `/customer/squads` | 4,5 | 5 | 4 | 5 | yeniden tasarla | 53 | 10 |
| 76 | `/customer/surprise-boxes` | 5,0 | 5 | 4 | 6 | yeniden tasarla | 47 | 10 |
| 77 | `/customer/trends` | 3,9 | 3 | 4 | 6 | birleştir | 48 | 13 |
| 78 | `/offline` | 4,5 | 4 | 3 | 5 | yeniden tasarla | 23 | 1 |
| 79 | `/surveys/[id]` | 4,5 | 5 | 4 | 4 | yeniden tasarla | 34 | 2 |
| 80 | `/table-signal` | 4,5 | 4 | 4 | 4 | yeniden tasarla | 39 | 1 |

**Dağılım:** yeniden tasarla 40 · birleştir 20 · koru-iyileştir 13 · yeniden inşa 7. En düşük beş sayfa: `campaigns` (3,0), `experiences` (3,0), `experience/[token]` (3,3), `blog`/`cerez`/`gizlilik`/`kvkk`/`lounge`/`quests` (3,5). En yüksek: `reset-password`, `forgot-password`, `c/[token]`, `games` hub, `review-stack` (5,5).

**Okuma notu:** 22 mini oyunun puanları birbirine çok yakın (3,8–5,5). Bunun nedeni hepsinin aynı `GameShell` + `useMiniGame` + generic `start/complete` katmanını paylaşması. Bu katmanın düzeltilmesi 22 sayfayı birden yukarı taşır (§4, K1).

---

## 3. Doğrulanmış kritik hatalar (P0)

Aşağıdakiler sayfa raporlarının doğrulama bölümünde **"doğrulandı"** olarak işaretlenmiş ve şiddeti P0 (güvenlik, puan basma, veri sızıntısı ya da ana akışın tamamen kırık olması) düzeyinde kalmış bulgulardır. Her birinde kanıt dosya:satır olarak verildi.

### 3.1 Kimlik ve oturum

**P0-1 · Açık yönlendirme + `javascript:` DOM XSS (giriş zinciri)**
- `app/(auth)/auth/login/page.tsx:67, 125-126`: ham `callbackUrl` doğrudan `window.location.href`'e atanıyor (şifreli ve 2FA girişi).
- `lib/safe-callback-url.ts:13`: `s.startsWith('/') && !s.startsWith('//')` kontrolü `/\evil.com` değerini geçiriyor; WHATWG ayrıştırıcısı bunu `https://evil.com` olarak çözüyor. Sentez sırasında dosyadan yeniden teyit edildi.
- `app/(auth)/auth/complete/page.tsx:24-25, 44`: `next=//evil.com` ve `/\evil.com` kabul ediliyor; Next 16.1.6 router harici URL'ye `location.replace` yapıyor.
- `app/api/auth/forgot-password/route.ts:70-73` ve `app/api/auth/magic-link/route.ts:75-77`: zararlı `callbackUrl` gerçek Qratex e-postasına gömülüyor.
- CSP `script-src 'unsafe-inline'` (next.config.js:343-347); `/auth/*` proxy matcher dışında.
- Etkilenen sayfalar: login, complete, forgot-password, reset-password, magic.

**P0-2 · Üretim giriş ekranında ADMIN demo şifresi ve sahtelenebilir admin kapısı**
- `app/(auth)/auth/login/page.tsx:35-62, 285-314, 515-525`: demo hesaplar (ADMIN dahil) koşulsuz render ediliyor ve tek tıkla giriş yapılıyor.
- `lib/admin-gate-edge.ts:14-22`: kapı çerezi yalnızca biçim olarak kontrol ediliyor, HMAC doğrulanmıyor; `verifyGateCookie` hiçbir API'de çağrılmıyor.
- Canlı DB'de şifrenin hâlâ geçerli olup olmadığı **doğrulanmadı** (DB'ye dokunulmadı); kod tarafı kesin.

**P0-3 · OAuth ile hesap ön-ele geçirme**
- `lib/auth.ts:45, 52`: `allowDangerousEmailAccountLinking: true` (teyit edildi).
- `lib/auth.ts:316-321` `events.createUser`, var olan satıra bağlanırken de çalışıp saldırganın önceden açtığı doğrulanmamış satırı `emailVerified` yapıyor. Saldırganın şifresi hesapta kalıyor, kurban `set-password` ile değiştiremiyor (`set-password/route.ts:53-56`). Zincir kod okunarak doğrulandı, uçtan uca denenmedi.

**P0-4 · Magic link 2FA'yı atlıyor**
- `lib/auth.ts:89-106`: magic dalı `twoFactorEnabled` okumuyor; şifre dalı ise `:182-194`'te TOTP istiyor. Önkoşul `enableMagicLink` açık olması.

**P0-5 · Şifre sıfırlama açık oturumları iptal etmiyor**
- `lib/auth-email-token.ts:54-63`: yalnızca `password` ve `consumedAt` yazılıyor; `sessionVersion`/`passwordChangedAt` yok. next-auth her session çağrısında JWT süresini yenilediği için çalınmış oturum süresiz yaşıyor.

**P0-6 · Kayıt sonrası doğrulama akışı kırık ve geri dönüşsüz kilit**
- `app/api/auth/register/route.ts:161-167`: üretimde `verifyUrl` dönmüyor → `register/page.tsx:115-137` doğrulama ekranını hiç göstermiyor, "Giriş yapabilirsiniz" deyip başarısız `signIn` çağırıyor (lockout sayacına deneme yazılıyor).
- Yeniden gönderim ucu yok (`sendVerificationEmail` yalnızca `register/route.ts:87`); süresi dolan token siliniyor (`verify-email/route.ts:19-22`); forgot/magic yalnızca doğrulanmış hesaba çalışıyor; aynı e-postayla yeniden kayıt reddediliyor (`register/route.ts:44-51`). Google'ı olmayan adres kalıcı kilitleniyor; e-posta işgali mümkün.

### 3.2 Puan ekonomisi (net-sıfır ve atomik kredi değişmezleri)

**P0-7 · Kayıt rotası davet puanını doğrulamasız ve limitsiz basıyor**
- `app/api/auth/register/route.ts:63` `emailVerified:null` ile kullanıcı yaratılıp `:101-146`'da hemen COMPLETED referral + `creditPointsAndXp` (davet eden 1000, davet edilen 500; `lib/points-rules.ts:63-66`).
- `/api/referral`'daki modül kapısı (`referral/route.ts:120`) ve ömür/aylık limitler (`:164-186`) bu yolda yok; `maxUsage` tx dışında okunuyor (`register/route.ts:107`). Tek fren IP başına dakikada 5 kayıt.
- Ek yol: mevcut doğrulanmış hesaplar karşılıklı kod uygulayarak (A↔B) hesap başına 1.500 puan basabiliyor (`referral/route.ts:137-190`).

**P0-8 · Mutlu saat çarpanı doğrulanmıyor → bayi tek tüketimde milyonlarca puan basabiliyor**
- `app/api/happy-hour/route.ts:121-138`: `multiplier || 2.0` dışında kontrol yok.
- `app/api/dealer/consumptions/route.ts:324, 335-350`: `floor(1000*0.05*multiplier)` doğrudan `user.points`'e yazılıyor; `points_credited` yazılmıyor. `multiplier:1e6` ile 50.000.000 puan.
- Çürütülen kısım (sayılmadı): negatif çarpan puan düşürmüyor (`:328` `if (passivePoints>0)`).

**P0-9 · Müşteri gizli olmayan her rozeti kendine verip puan basabiliyor**
- `app/api/gamification/progress/route.ts:151-224`: `requireAuth(['CUSTOMER','ADMIN'])` sonrası istekten gelen `badgeId` için koşul doğrulaması yapılmadan `userBadge.create` ve `requirement.value || 100` kadar puan + XP kredisi (sentez sırasında teyit edildi). Rozet id'leri tahmin edilebilir (`lib/badge-catalog.ts`).

**P0-10 · Otomatik ödüllenen görevler ikinci kez ödeniyor; başarımda yarış koşulu**
- `lib/visit-missions.ts:105-128` ve `lib/achievements.ts:113-172` ödülü veriyor ama `CLAIM_QUEST_REWARD` audit'i yazmıyor; `app/api/gamification/quests/route.ts:61-89` `claimed`'ı yalnızca bu audit'ten hesaplıyor; `claim/route.ts:82-101` ikinci kez ödüyor.
- `lib/achievements.ts:92-122` oku-hesapla-yaz, `completedAt:null` koşulu yok → eşzamanlı istekte çift kredi (vitrin ve hediye akışlarıyla tetiklenebiliyor).

**P0-11 · Mini oyunlar (22 sayfa): istemci skoru, sınırsız deneme, 409 ile kaybolan oyun, belirsiz turnuva ödülü**
- `app/api/customer/games/[game]/complete/route.ts:15-22, 61, 81-87`: `score`, `won`, `durationSec` istemciden; tek koruma `maxScore` kırpması ve 8-12 sn `minDurationSec`. Betikle oyun başına günde ~120-170 puan + turnuva tavan skoru.
- `app/api/customer/games/[game]/start/route.ts:56-73`: yalnızca `completed` kilitleniyor; `active` ve `failed` oturum aynı `sessionId` ile `canPlay:true` dönüyor (teyit edildi). Sonuç (a) yenileyerek sınırsız deneme, (b) kaybeden oyuncu tam bir tur oynayıp `complete/route.ts:98-108, 177-181`'de 409 alıyor.
- `app/api/customer/tournament/route.ts:29-35`: sıralamada eşitlik kırıcı yok; tavan skorda (çoğu oyunda kolay erişilebilir) 500/300/150 ödülü keyfi dağılıyor. "3'ten fazla kişiye ödül" alt iddiası **doğrulanmadı**, keyfi dağıtım kesin.
- Pacman ayrı: `components/customer/pacman-game.tsx:307-343, 372-486` stale closure yüzünden sonuç sunucuya hiç gönderilmiyor (meşru oyuncu asla ödül almıyor); `pacman/complete/route.ts:45-54` oturumun `gameType`'ını doğrulamıyor, 5 sn eşiği oynamadan ödüle izin veriyor.
- Oyuna özel P0'lar: `speed-order-game.tsx:121, 147-154` yanlış dokunuş turu çözülemez kılıyor; `network-defender-game.tsx:31, 38, 46-49` id/indeks uyuşmazlığı grafı kırıyor; `data-snake-game.tsx:169-181, 206-209` ve `spam-breaker-game.tsx:183-185` ödül eşiğini işlevsiz bırakıyor (UI 12/18 diyor, ödül yalnızca tam temizlikte).

**P0-12 · Offline-sync yolu doğrulamasız ve tekrar oynatılabilir tüketim yazıyor**
- `app/api/dealer/offline-sync/route.ts:128-131` (status kontrolü yok), `:142` (payload istek gövdesinden), `:214-223` (`parseFloat`, zod/limit yok). Bayi aynı kuyruk id'siyle sınırsız tüketim yazabiliyor; müşterinin harcama ve ziyaret sayıları şişiyor. Pasif puan basmıyor.

**P0-13 · Hediye alıcısı benzersiz olmayan isimle seçiliyor (geri alınamaz puan kaybı)**
- `app/api/customer/shop/gift/route.ts:67-76`: `name equals insensitive` + `orderBy`'sız `findFirst`; alıcı önizlemesi yok (`shop-client.tsx:308-320`).

### 3.3 Yetki, gizlilik, uyum

**P0-14 · IDOR ve kapsam açıkları**
- `app/api/gamification/badges/route.ts:79-87, 147-183, 286-291`: oturumsuz `?userId=` ile puan, seviye, yorum sayısı ve rozetler. Hedef id'ler `character-leaderboard/route.ts:75`'ten alınabiliyor.
- `app/api/gamification/quests/route.ts:20-21`: oturumsuz `?userId=` ile görev ilerlemesi (orta şiddet).
- `app/api/feedbacks/route.ts:28, 43-51, 77-79`: STAFF için `where` daraltılmıyor; tüm platformun geri bildirimleri ve `user.email`.
- `app/api/customer/reviews/route.ts:29-58`: `include` tüm skalerleri döndürüyor; bayi iç notu, gizli `characterCategory`, `churnRisk` müşteriye gidiyor.
- `app/api/leaderboard/route.ts:78`: oturum opsiyonel; `showLeaderboard` tercihi (`settings/route.ts:55, 163, 196`) hiçbir sorguda okunmuyor; `needsReview` fraud bayrağı (`:137, 212, 273, 345`) yanıtta. (Shadow-ban alt iddiası çürütüldü, sayılmadı.)
- `app/api/admin/team/members/route.ts:12-28`: CUSTOMER rolündeki ekip yöneticisi boş `q` ile tüm kullanıcıların ad/e-posta/rolünü listeleyebiliyor.
- `lib/team-access.ts:21`: `user?.adminTeamRole ?? sessionRole` fail-open; çıkarılan yönetici bayat JWT ile kendini yeniden yönetici ekleyebiliyor.
- `app/api/cards/[token]/route.ts:31-37, 64-68`: oturumsuz uç kart sahibinin adını, fotoğrafını, kullanıcı id'sini döndürüyor; aynı token Wallet QR'ında ve "Paylaş" akışında dağıtılıyor.

**P0-15 · Çerez rızası uygulanmıyor; giriş token'ları PostHog'a gidiyor**
- `components/layout/cookie-consent-banner.tsx:31-39`: `optionalRejected` yazılıyor, hiçbir yerde okunmuyor.
- `components/analytics/posthog-provider.tsx:18-25` (autocapture + session replay açık), `:37-41` (`$current_url` tam query string, token dahil); `app/layout.tsx:170` koşulsuz mount. Reset token'ı 60 dk geçerli (`forgot-password/route.ts:68`).
- Tercih geri alınamıyor (banner bir kez seçilince açılmıyor, `cookie-consent-banner.tsx:18-21`).

**P0-16 · Anonim geri bildirimler AI, otomatik yanıt, telafi, webhook ve ısı haritası hattını tamamen atlıyor**
- `app/api/feedbacks/route.ts:283-545` tüm yan etkiler `if (session?.user?.id)` içinde; anonim dal `:547-554`. Webhook, heatmap, analytics ve cache invalidation için telafi yolu yok. QR akışının çoğunluğu anonim olduğundan bayi ürününün çekirdeği etkileniyor.
- Aynı sayfada fotoğraf yükleme fiilen bozuk: base64 JSON gövdesi (`feedback/[code]/page.tsx:172-183`), Postgres'e yazılıyor, Vercel 4,5 MB sınırında 413 alıyor; fotoğrafları gösteren UI yok.

### 3.4 Ana akışı tamamen kıran hatalar

| # | Hata | Kanıt |
|---|---|---|
| P0-17 | Kampanya listesi canlıda her zaman boş (yanıt şekli uyumsuz) | `app/customer/campaigns/page.tsx:51` `data.happyHours` ↔ `app/api/happy-hour/route.ts:94-101` `activeNow/upcoming` |
| P0-18 | Mobilde kart QR'ı isim satırının altında kırpılıyor; kasada QR gösterilemiyor | `app/customer/my-card/page.tsx:174` (aspect + overflow-hidden), `:235`; headless ölçümü raporda |
| P0-19 | AI Öneriler sekmesi tek yorumlu kullanıcıda sayfayı çökertiyor; uç sınırsız ücretli LLM çağrısı | `app/api/customer/ai-recommendations/route.ts:48-58` ↔ `ai-insights/page.tsx:411`; rate limit/cache yok |
| P0-20 | Etkinlik görevi (challenge) üretimde yapılandırılamıyor, kart hiç render edilmiyor | `app/api/admin/seasonal-campaigns/route.ts:15-29` şemada alan yok, zod strip |
| P0-21 | Görev ilerleme motoru yok; varsayılan/seed/custom görevler hiç ilerlemiyor | `userQuest`'e yalnızca `lib/achievements.ts` ve `lib/visit-missions.ts` yazıyor; `bootstrap/route.ts:72-97` `give_feedback` tipleri |
| P0-22 | Ödül teslim zinciri yok: puan düşüyor, kod hiçbir yerde doğrulanamıyor; telafi kabulü hiçbir şey teslim etmiyor ve seçim doğrulanmıyor | `prisma/schema.prisma:680-714` (`claimedAt`'e yazan yok); `app/api/customer/remedy/[offerId]/route.ts:15-18, 159-190` |
| P0-23 | Kurucu ayrılınca klan ve açık savaş cascade siliniyor, escrow iadesiz yok oluyor | `app/api/customer/squads/[id]/leave/route.ts:39-43`; `schema.prisma:464-465` |
| P0-24 | Kayıp sonrası oyun ve `/customer/scan` kamera cleanup'ı istisna fırlatıp kabuğu hata ekranına düşürebiliyor | `app/customer/scan/page.tsx:126-129` (stop beklenmeden `clear()`); sınır zinciri React iç davranışından çıkarıldı, tarayıcıda yeniden üretilmedi |

### 3.5 Doğrulamada çürütülen ya da şiddeti düşürülen iddialar (sayılmadı)

- Negatif happy hour çarpanı puanı düşürmüyor (campaigns).
- `shadow_ban` kullanıcıların liderlikte görünmesi: bugün `shadow_ban` yazan aktif kod yolu yok (leaderboard).
- Magic link hesap açmıyor; yalnızca doğrulanmış mevcut kullanıcıya gönderiliyor (kullanım şartları).
- Landing CTA'sının "tüketici kaydında checkout'a ulaşamama" iddiası: kayıt formunda görünür rol seçici var (landing).
- "Personel metriği manipülasyonu": `dealerStaffId`'yi okuyan yüzey yok (feedback).
- Mini oyunlarda "GET/POST farklı sıra → 3'ten fazla ödül" ve memory-match bildirim hatasında "otomatik tekrar deneme 409 alır" alt iddiaları doğrulanmadı.
- Bazı bulguların şiddeti raporlarda düşürüldü ve burada da P1'e alındı: doğum günü 500 puanlık anlık talep (`app/api/birthday/route.ts:101, 113-150`, orta), `experience-share` keyfi metin (orta), `improvement-request` bildirim spam'i (orta), Stats ucundaki puan ekonomisi dışı sahte değerler (orta).

---

## 4. Sayfalar arası ortak temalar ve kök nedenler

Aşağıdaki kalıplar sayfa sayfa tekrar ediyor. Her biri, tek merkezde çözülünce çok sayıda sayfayı birden düzelten bir altyapı eksikliği.

**K1 · Sunucu otoriter olmayan oyun ve ödül modeli (≈30 sayfa).** Oyun skoru, kazanma bayrağı, oyun ödül eşiği istemcide hesaplanıp sunucuya bildiriliyor. Sunucu admin override'ını uygularken istemci statik registry'yi kullanıyor (`use-mini-game.ts:70` config'i saklıyor ama hiçbir oyun okumuyor). Yani admin eşiği değiştirince hak edilen ödül reddediliyor ya da "kazandın + 0 puan" çelişkisi çıkıyor. Oturum durum makinesi tanımsız: `failed` ne kilit ne de devam edilebilir oturum sayılıyor. **Kök:** `MiniGameSession` için `active → completed | failed | abandoned` durum makinesi ve "günün hakkı" tanımının tek yerde (`lib/minigame-day.ts`) olmaması; seed + girdi günlüğüyle sunucu tarafı yeniden oynatma olmaması.

**K2 · Puan defteri yok; her ekran kendi puan rakamını üretiyor (≈15 sayfa).** "Kazanılan puan" analytics'te `amount*2`, feedbacks'te `length*50`, dashboard aktivitesinde `rating>=4 ? 75 : 50`, haftalık lig 50/100 sentetik formülü, my-year 90 günde silinebilen `AnalyticsEvent`'ten (escrow iadesini kazanç sayarak), rozet sayfasında `requirement.value` (gerçek ödül yerine eşik). **Kök:** `PointsLedger` (append-only, kategori + kaynak id + tekil anahtar) tablosunun olmaması. `points_credited` iyi bir başlangıç ama silinebilir analytics tablosunda ve harcama tarafı (`points_spent`) hiç yazılmıyor.

**K3 · Aynı kavramın birden çok formülü.** Seviye ilerlemesi: `lib/utils.ts:94-106` geometrik ×1,5 iken stats/trends/progress-hub/sidebar/admin set_level doğrusal 1000. Seri: `User.loginStreakCount`, `UserStreak`, trends algoritması, quests, analytics, stats'taki sabit 0 — en az 5 kaynak. İşletme sıralaması: category-leaderboard, discovery trendingVenues, business-of-month üç ayrı formül. Yorum korpusu: Feedback ile ConsumptionReview birleştirilmiyor; journey-score, my-year, trends, spending-overview kart sahibi kullanıcıya "0 yorum" gösteriyor. **Kök:** `lib/leveling.ts`, `lib/streak.ts`, `lib/business-ranking.ts`, `lib/reviews/corpus.ts` gibi tek-kaynak alan servislerinin olmaması.

**K4 · Hata, boş, yükleniyor ve kapalı modül durumları ayrışmıyor (≈45 sayfa).** Desen hep aynı: `fetch` → `res.ok` kontrol edilmiyor → `success:false` sessizce boş diziye düşüyor → "Henüz X yok" boş durumu. Neon kesintisinde, token-replay 403'ünde ya da admin modülü kapattığında kullanıcı yanlış bilgi görüyor, yeniden deneme yolu yok. Uygulamada TanStack Query kurulu (`providers.tsx:207-216`) ama sayfaların çoğu elle `useEffect` + `useState` kullanıyor; AbortController yok, bu yüzden filtre değişiminde yarış koşulları (category-leaderboard, analytics, leaderboard, nearby, donations). **Kök:** ortak `fetchJson` (content-type + `res.ok` + kodlu hata) ve `<QueryState loading|error|empty|moduleDisabled|data>` bileşeninin olmaması.

**K5 · `/api/*` yetki modeli varsayılan-izin.** `proxy.ts:105-118` API'de kimlik doğrulamıyor. Rol kontrolü uca bırakılmış ve tutarsız: `requireAuth()` rol listesiz çağrılıyor (`/api/feedbacks`, `/api/user/profile`), bazı uçlar çıplak `getServerSession` kullanıyor (`/api/birthday`, `/api/customer/reviews`), bazıları `?userId=` kabul ediyor. `include` ile tüm skalerler dönüyor; açık DTO katmanı yok. Modül kapısı (`assertModuleEnabled`) 43 müşteri API'sinden yalnızca ~10'unda var; `vip_lounge` kapısı katalogda bile yok. **Kök:** varsayılan-reddet sarmalayıcısı (`withCustomerRoute({ roles, module, rateLimit })`) ve açık müşteri DTO'larının olmaması.

**K6 · Zaman dilimi UTC.** Analytics saatlik grafik TR 08:00-10:59'u hiç göstermiyor; mutlu saat 3 saat kayık uygulanıyor; doğum günü, oyun gün anahtarı, trends kovaları, my-year yıl sınırı, ekip görev bitiş tarihi, nearby açık/kapalı — hepsi sunucu UTC'si. Proje `lib/happy-hour-live.ts` ve `lib/surprise-badges.ts:120`'de doğru deseni bir kez kurmuş. **Kök:** `lib/time/istanbul.ts` (dayKey, ay/hafta sınırı, `AT TIME ZONE` SQL yardımcıları) olmaması.

**K7 · Sahte veya dekoratif sosyal kanıt ve vaatler.** Landing "Bize güvenen işletmeler" DEMO şeridi, SSR'da 10K+/500+/1M+ yedek sayılar; `/guven` "signed URL" iddiası (kod yok); lounge ayrıcalık listesi; surprise-boxes "yorum yaz, kutu ihtimalin artar"; word-spot "turlar hızlanıyor"; review-detective "ipuçları azalır"; lucky-wheel "doğru anda durdur" becerisi. Duolingo/Starbucks'un gücü vaatlerin birebir tutulmasından geliyor; burada vaat ile mekanik ayrışmış.

**K8 · i18n sızıntısı ve hitap karışıklığı.** Ham anahtarlar ekranda: `auth.loading`, `publicFeedback.rateStaff`, `customerShop.all/owned`, `customerSettings.passwordTitle`, `customerDashboard.levelUpTitle`, surprise-boxes `errorLoading`. Kök neden: `i18n/request.ts:35-37` eksik anahtarda anahtarı döndürüyor, bu yüzden kodda yaygın olan `t(x) || 'yedek'` deseni hiç çalışmıyor. API'ler sabit Türkçe metin dönüyor, 26 müşteri dosyası `lib/admin-toast.ts`'in "Basarili:" önekini kullanıyor.

**K9 · framer-motion inline transform çakışması.** `style={{ transform: 'translate(-50%,-50%)' }}` ile `animate={{ scale }}` aynı elemanda: combo-tap, speed-order, network-defender, mind-thief, bot-hunter radar ve my-card tilt. Framer kendi transform'unu yazıp merkezlemeyi bozuyor; mobilde sağ kenarda kırpılma. Proje hafızasında (`scroll-scene-traps.md`) bu tuzak zaten kayıtlı ama oyunlara yayılmamış. `domAnimation` içinde `layout` olmadığı için favorites'teki `layout` animasyonu ölü.

**K10 · Yetim ve kopya sayfalar.** `discover`, `favorites`, `lounge`, `experiences` menüde ve hiçbir linkte yok. Menü tanımının 4 elle kopyası var (sidebar, discover, visibility-controls, qra-knowledge-base) ve kaymaya başlamış. 21 oyun `page.tsx`'i birebir aynı iskelet. 4 yasal sayfa kopyala-yapıştır. Derin bağlantılar ölü: `?focus=`, `?dealerId=`, `?promo=` (nearby), `?hasReview=false` (consumptions), `?tab=` (donations); 6 ayrı yerden "işletme profili"ne gidiliyor ama böyle bir rota yok.

**K11 · Erişilebilirlik ve mobil temel eksikleri.** Canvas oyunların hiçbiri klavye/ekran okuyucuyla oynanamıyor; uygulama içi "reduce-animations" ayarı framer'ı ve FX katmanını durdurmuyor, OS `prefers-reduced-motion` birleşik okunmuyor. Hover ile görünen kritik aksiyonlar (ekip kartları, departman silme). Mobilde `h1` yok (`page-heading.tsx:21` `hidden sm:flex`). Turnuva bileşeni açık temada koyu zemine koyu metin (`game-tournament.tsx` + `game-shell.tsx:97-104`). Yıldız puanlama radiogroup değil.

**K12 · Fizik kare hızına bağlı.** spam-breaker, troll-slayer, pacman: 120/144 Hz ekranda oyun 2-2,4 kat hızlı; bu da turnuva adaletini bozuyor. Kardeş oyunlar (`frost-catcher`, `spam-defense`) zaten `performance.now()` tabanlı.

---

## 5. Bilgi mimarisi önerisi

Bugün müşteri tarafında 58 `/customer/**` rotası var (22'si oyun). Kullanıcının aklında 5 soru var: **Ne kazanabilirim? Nerede kazanırım? Ne kadar ilerledim? Neyi harcarım? Sesim ne oldu?** Menü bu beş soruya göre kurulmalı.

### 5.1 Yeni menü (mobilde alt sekme + merkez buton, masaüstünde kenar çubuğu)

```
[ Ana Sayfa ]  [ Keşfet ]  ( ◉ TARA )  [ Oyna ]  [ Cüzdan ]          + Profil menüsü (avatar)
```

| Birincil yüzey | Rota | İçerik (birleşen sayfalar) |
|---|---|---|
| **Ana Sayfa** | `/customer` | Puan bakiyesi + seviye halkası + "sonraki ödüle X puan" · bugünkü seri · günlük 3 hedef · bekleyen aksiyonlar (yorum bekleyen tüketim, açılmamış kutu, hazır ödül, telafi teklifi) · lig özet şeridi. Tek BFF ucu `/api/customer/home`. |
| **Tara** (merkez FAB) | `/customer/scan` | Tam ekran vizör; `/c/`, `/feedback/`, düz kod çözen ortak `lib/qr-resolve.ts`. Kart aktivasyonu da buradan. |
| **Keşfet** | `/customer/nearby` | Sekmeler: **Yakınımda** (harita/liste) · **Kaydettiklerim** (`favorites`) · **Fırsatlar** (`campaigns` + `event` + happy hour + flash teklif) · **En iyiler** (`category-leaderboard`). |
| Mekân detayı (yeni) | `/customer/venue/[dealerId]` | Açık/kapalı, aktif teklif, yol tarifi, kullanıcının o mekândaki geçmişi, favori toggle, "QR okut, puan kazan". `experiences` içeriği (damga kartı, iyileştirme isteği) buraya gelir. Bütün ölü `?focus=` bağlantıları buraya bağlanır. |
| **Oyna** | `/customer/games` | Oyun Merkezi + **Görevler** (`quests`) + **Sürpriz Kutular** + **Klan** (`squads`) + **Turnuva** sekmeleri. Oyunlar tek dinamik rota `/customer/games/[game]`. |
| **Cüzdan** | `/customer/wallet` (yeni çatı) | **Kartım** (`my-card` + `lounge` statüsü) · **Ödüller** (`rewards` katalog + `shop` kozmetik sekmesi) · **Ödüllerim** (alınan ödül kodları/QR, telafi kuponları, kutu kuponları — tek cüzdan) · **Hareketler** (puan defteri + `consumptions` + `spending-overview`) · **Bağış** (`donations`). |
| **İlerleme** (profil menüsü) | `/customer/progress` | `progress-hub` + `journey-score` + `trends` + `analytics` tek sayfada: seviye yolu, seri takvimi, rozet koleksiyonu kısayolu, lig. **Rozetler** (`badges`) ve **Lig** (`leaderboard`) alt sayfa kalır. |
| **Yılım** | `/customer/my-year` | Wrapped tarzı hikâye; yıl seçici. Sezonluk olarak ana sayfadan duyurulur. |
| **Seslerim** (profil menüsü) | `/customer/feedbacks` | Birleşik zaman çizelgesi: QR geri bildirimi + tüketim yorumu. Detay çekmecesi = yolculuk (`feedbacks/[id]/journey`) + `consumptions/[id]` yorum düzenleme + telafi (`remedy`, `remedy/[offerId]`). `ai-insights` buradaki "Sesin" özet kartına iner; sohbet ikincil. |
| **Davet** | `/customer/referral` | Kalır. |
| **Ayarlar** | `/customer/settings` | Kalır; Gizlilik sekmesine çerez tercih merkezi + yasal belgeler + kabul edilen sürümler. |
| **Ekip** | `/ekip` (paylaşılan) | Yalnızca ekip üyelerine görünür; `/customer/ekip` ve `/admin/ekip` tek rotada, rol bazlı derin bağlantı sorunu ortadan kalkar. |

### 5.2 Kaldırılacaklar

- `/customer/discover` → kaldır, `/customer`'a yönlendir; işlevi global arama/komut paletine taşı.
- `/customer/experiences` → mevcut haliyle kaldır (ham dealerId girişi); içeriği mekân detayına.
- `/customer/lounge` → Kartım altında "Statü" bölümüne; rota yönlendirmesi kalsın.
- `/customer/trends`, `/customer/analytics`, `/customer/journey-score`, `/customer/spending-overview` → İlerleme ve Hareketler'e birleşir, rotalar yönlendirme olarak kalır.
- `/customer/games/lucky-wheel` → kaldır; dashboard'daki sunucu otoriter günlük çark (`/api/gamification/spin`) zaten aynı vaadi veriyor.
- Pacman'e özel API'ler (`/api/customer/games/pacman/*`) → generic `[game]` route'una ve registry'ye taşı.

### 5.3 Oyun kataloğu birleştirme (22 → ~12)

| Birleşik oyun | İçine giren |
|---|---|
| **Arena Savunması** (Çekirdek / Arena modları) | `spam-defense`, `troll-slayer` |
| **Güven Kalkanı** | `guardian-of-trust`, `frost-catcher` |
| **Yorum Dedektifi** (Kaydır / Dava / Harf modları, ortak `MiniGameContent` havuzu) | `truth-vs-fake`, `review-detective`, `word-spot` |
| **Bot Avcısı** | `bot-hunter` (+ `mind-thief`'in boss mekaniği opsiyonel) |
| Korunanlar | `combo-tap`, `data-snake`, `data-miner` (beceri mekaniğiyle), `memory-match`, `review-stack`, `signal-pipe`, `spam-breaker`, `speed-order`, `trust-merge`, `pacman` (registry'ye) |
| Yeniden inşa | `network-defender` (dalga + karantina mekaniği) |

### 5.4 Herkese açık taraf

- Dört yasal sayfa → `(legal)` route grubu + `LegalDocumentLayout` + sürümlü içerik (`LegalDocument`/`LegalAcceptance`).
- `/` tüketiciye (Okut → Kazan → Harca hikâyesi), `/isletmeler` işletmeye; `/neden-qratex` işletme sayfasının alt bölümü.
- `/blog` → Page modeline bağlanan CMS; tüketici içeriği `/customer` içinde "Rehberler" olarak.
- `/experience/[token]` → sunucu bileşeni, OG kartı, referral'a bağlı tek CTA.

---

## 6. Tasarım ve motion vizyonu

### 6.1 Tek görsel dil: "Cüzdan sakin, arena canlı"

Bugün her sayfa kendi dilini kuruyor: admin hero bileşeni müşteride, `admin-toast` müşteride, oyun kabuğu sabit koyu ama içindeki turnuva bileşeni tema token'ı kullanıyor, yasal sayfalar 40 sonsuz animasyonlu landing zemininin üstünde. Önerilen sistem iki katmanlı:

- **Cüzdan katmanı** (ana sayfa, cüzdan, hareketler, ayarlar, yasal, seslerim): Monzo/Revolut sadeliği. Token tabanlı açık/koyu tema, tek tipografik ölçek (gövde 16px, ikincil 14px, 12px altı yok), 8pt ızgara, sayılar `tabular-nums`. Hareket yalnızca anlam taşıdığında: bakiye değişiminde sayaç, liste girişinde 1 kez stagger. Arka plan statik.
- **Arena katmanı** (oyunlar, kutu açılışı, rozet reveal, seviye atlama, Wrapped): bilinçli olarak koyu bir alt ağaç (`data-scene="arena"` + `color-scheme: dark`), kendi token seti, neon vurgular. Bütün oyun içi bileşenler (turnuva, liderlik, sonuç kartı) bu token'larla yazılır; açık tema sızıntısı biter.

Ortak bileşen kütüphanesi (`components/customer/ui/`): `PointsChip`, `XpRing`, `StreakFlame`, `RewardProgress` ("Kahve'ye 120 puan"), `BadgeGlyph` (yol → `next/image`, emoji → metin; progress-hub'daki dosya yolu basma hatasını kapatır), `StarRating` (radiogroup), `QueryState`, `StatusCallout`, `EmptyState` (hata/boş/aramada sonuç yok ayrımlı), `CustomerToast` (öneksiz, i18n).

### 6.2 Motion ilkeleri

1. **Tek hareket tercihi kaynağı:** `useMotionPreference()` = uygulama ayarı **veya** OS `prefers-reduced-motion`. `MotionConfig reducedMotion`, FX katmanı, konfeti, oyun sarsıntısı, ses ve titreşim bu tek kaynaktan beslenir; ses ayrı bir anahtar olur.
2. **Konum CSS'te, animasyon framer'da:** konumlandırma framer kullanmayan sarmalayıcıda, `scale/rotate` içteki `Motion` elemanında. Lint kuralı: aynı elemanda `style.transform` + `animate` yasak.
3. **An kayıtlı ve idempotent:** seviye atlama, rozet, ödül kutlaması sunucuda "görüldü" bayrağı olan bir anla tetiklenir (An Motoru spec'i, `3a8b00f`). Bugünkü "her ziyarette konfeti" hatası bu modelle yapısal olarak kapanır.
4. **Süre bütçesi:** mikro geri bildirim 120-180 ms, sayfa içi geçiş 220-300 ms, kutlama anı en fazla 1,2 sn ve atlanabilir. Sonsuz döngü yalnızca arena katmanında ve görünür alandayken.
5. **Paylaşılan öğe geçişi:** kart → kasada göster paneli, ödül kartı → cüzdandaki pass (`layoutId`; `domMax` yalnızca bu yüzeylerde lazy yüklenir).

### 6.3 3D / canvas nerede, nerede değil

| Yüzey | Teknik | Gerekçe |
|---|---|---|
| Sürpriz kutu açılışı, imza ödül kutusu | three.js (mevcut süperelipsoid + bloom altyapısı) | Ürünün "değişken ödül" anı; 3D'nin karşılığını veren tek yer. `next/dynamic`, yalnızca açılışta yüklenir. |
| Karakter rozeti reveal | three.js küre/maskot (mevcut) | Koleksiyon kimliği. Statik PNG yedeği zorunlu. |
| Kartım kart yüzü | CSS 3D (`perspective`, `useMotionValue` tilt, tek seferlik parıltı) | three.js gereksiz; bugünkü `perspective-[1400px]` sınıfı Tailwind 3.4'te yok, tilt çalışmıyor. |
| Mini oyunlar | 2D canvas, ortak `useGameLoop` (sabit adım + dt) | Kare hızından bağımsız fizik ve ileride sunucu replay için deterministik çekirdek. Mind-thief'teki `Boss3D` her öfke geçişinde WebGL'i yeniden kurmamalı; rengi ref ile değiştirmeli. |
| Wrapped / Yılım | DOM + framer hikâye slaytları, 9:16 PNG paylaşım kartı (`character-share-card` genelleştirilir) | Paylaşılabilirlik canvas'tan daha önemli. |
| Harita | Mevcut harita kütüphanesi, pin üstünde puan çarpanı rozeti | 3D gereksiz. |
| Yasal, ayarlar, hareketler, seslerim, auth | Animasyonsuz ya da tek giriş | Okuma ve güven yüzeyleri; landing zemini kaldırılır. |
| Landing | Tek ölçülü hero sahnesi + statik bölümler | 40 sonsuz animasyon tek CSS katmanına iner, görünmezken durur. |

---

## 7. Önceliklendirilmiş epikler

Her epik bağımsız bir ajan tarafından paralel uygulanabilecek şekilde kesildi: dokunduğu dosya kümeleri mümkün olduğunca ayrık, bağımlılıklar belirtildi. Efor: S ≤ 1 gün, M 2-4 gün, L 1-2 hafta, XL 2+ hafta. Canlı Neon gerektiren şema değişiklikleri işaretlendi; migrate planlı ve onaylı yapılmalı.

### P0 — güvenlik ve ekonomi (hemen, paralel)

| ID | Epik | Sayfalar | Kapsam ve gerekçe | Efor |
|---|---|---|---|---|
| E1 | **Giriş yönlendirme ve demo hesap güvenliği** | auth/login, auth/complete, auth/forgot-password, auth/reset-password, auth/magic | `resolvePostLoginTarget(raw, role, origin)` (URL ayrıştırıcıyla köken karşılaştırması, `\`, kontrol karakteri, `javascript:` reddi) tüm yollarda ve NextAuth `callbacks.redirect`'te; birim testleri. Demo bloğu ortam bayrağının arkasına, `authorize` üretimde demo e-postalarını reddeder. Admin kapısında proxy'de `crypto.subtle` HMAC doğrulaması + `/api/admin` için `requireAdminGate()`. `pages.error` → login + `?error=` banner'ı. Dosyalar: `lib/safe-callback-url.ts`, `lib/auth.ts` (callbacks), login/complete sayfaları, `lib/admin-gate-edge.ts`. | M |
| E2 | **Oturum ve hesap güvenliği** | auth/register, auth/verify-email, auth/reset-password, auth/magic, customer/settings | `User.sessionVersion` + JWT `sv` claim + Redis sıcak katman; sıfırlamada artır. Magic link birinci faktör, 2FA açıksa ara adım. OAuth bağlamada doğrulanmamış satırın şifresini null'la (`allowDangerousEmailAccountLinking` sonucu). Token tüketimi `updateMany` + `count===1`. Ortak `emailSchema` (trim + lowercase). `POST /api/auth/verify-email/resend`. Hesap silmede yeniden doğrulama. Şema değişikliği (canlı Neon). E1 ile `lib/auth.ts`'te çakışma: E1 yalnızca `callbacks.redirect`'e, E2 `jwt`/`authorize`'a dokunsun. | M |
| E3 | **Davet ve kayıt ekonomisi** | auth/register, customer/referral, auth/complete | Kayıtta `Referral PENDING` (puansız); ödül doğrulanmış e-posta + ilk QR olayında `lib/referral-service.ts qualifyReferral()` ile atomik. Modül kapısı, ömür/aylık limitler, ters yönlü ilişki reddi, `maxUsage` atomik claim tek serviste. Davet sonucu `/auth/complete`'te gerçek yanıtla gösterilir. Kayıt `{status:'verification_required'}` sözleşmesi + "gelen kutunu kontrol et" ekranı. Bağımlı: E2'nin resend ucu. | M |
| E4 | **Mini oyun güven çekirdeği** | customer/games ve 22 oyun sayfası | `MiniGameSession` durum makinesi (`failed`/`abandoned` kilit sayılır, yeniden açılış `attempt` ile sınırlı); `won` sunucuda effective eşikten türetilir; `getEffectiveMiniGame` sayfaya prop olarak; turnuvada deterministik eşitlik kırıcı + hafta kapanışında `TournamentResult @@unique([gameType, weekKey, rank])`; oyun kategorisine günlük puan tavanı; pacman stale closure hotfix + `gameType` kontrolü + registry'ye taşıma. Sunucu replay (seed + girdi günlüğü) E4'ün ikinci fazı (L). Dosyalar: `app/api/customer/games/**`, `app/api/customer/tournament`, `lib/use-mini-game.ts`, `components/customer/games/game-shell.tsx`. | L |
| E5 | **Puan basma yollarını kapatma** | customer/campaigns, customer/quests, customer/badges, customer/shop, customer/spending-overview, customer/lounge | Happy hour zod (çarpan [1, tavan], HH:mm, gün 0-6) + consumptions'ta clamp ve `points_credited`. `POST /api/gamification/progress` rozet verme ucu kapatılır ya da koşul doğrulamasına bağlanır. `UserQuest.rewardedAt` + tüm görev ödeme yolları `updateMany(rewardedAt:null)`; achievements yarışı. Offline-sync: payload DB'den, yalnızca PENDING/FAILED, canlı uçla ortak servis. Hediye: `recipientUserId` + onay ekranı. Doğum günü: `requireAuth` + 30 gün kuralı. Pasif ürün satın alma `isActive`. Canlıdaki `points_credited` olaylarının çift ödeme için taranması (salt okunur rapor). | M |
| E6 | **API yetki modeli ve IDOR kapatma** | customer/badges, customer/quests, customer/feedbacks, customer/leaderboard, customer/ekip, customer/ekip/departmanlar, c/[token], customer/my-card, customer/nearby | `withCustomerRoute({roles, module, rateLimit})` sarmalayıcısı; `?userId=` parametreleri kaldırılır ya da ADMIN'e kısıtlanır; `/api/feedbacks` varsayılan-reddet switch; `/api/customer/reviews` açık select; leaderboard oturum zorunlu + `leaderboardVisible` kolonu + `needsReview` çıkarılır; ekip: `team-access` yalnızca DB rolü, members araması davet modeline, `CompanyTask.createdBy` SetNull; `/api/cards/[token]` sahibi olmayana kimlik dönmez; innovation nearby/radar oturum + kapı. Şema değişikliği (canlı Neon). | M |
| E7 | **Rıza ve analitik gizliliği** | /, cerez-politikasi, gizlilik-politikasi, kvkk-aydinlatma-metni, auth/reset-password, auth/magic, offline | `lib/consent` (useConsent + olay kanalı + sürüm); PostHog `opt_out_capturing_by_default`, analitik ve replay ayrı kategori; `before_send` ile `token`/`code` redaksiyonu, `/auth/*` için replay kapalı, sayfada `history.replaceState`; footer ve Ayarlar'dan açılan tercih merkezi; SW `others` kuralında kimlikli yollar `NetworkOnly`, çıkışta runtime önbellek temizliği; `privacy-request` ucunda `email` override kaldırılır + rate limit. | M |

### P1 — doğruluk altyapısı ve kırık ana akışlar

| ID | Epik | Sayfalar | Kapsam ve gerekçe | Efor |
|---|---|---|---|---|
| E8 | **Puan defteri ve tek-kaynak hesap servisleri** | customer, customer/progress-hub, customer/trends, customer/analytics, customer/journey-score, customer/my-year, customer/feedbacks, customer/badges, customer/leaderboard | `PointsLedger` (append-only, kaynak + tekil anahtar, harcama dahil); `lib/leveling.ts`, `lib/streak.ts` (Europe/Istanbul, grace), `lib/reviews/corpus.ts` (Feedback ∪ ConsumptionReview, `deletedAt:null`), `lib/time/istanbul.ts`. Sahte değerlerin kaldırılması: stats `streak:0`, `length*50`, `rating>=4?75:50`, `amount*2`, sabit "Ücretsiz Kahve", rozet `requirement.value`, trends rozet sorgusu (`users:{some:{id}}` → `userBadge.userId`). Şema değişikliği. Bu epik bittikten sonra E15 ve E17 başlar. | L |
| E9 | **Veri durumu katmanı ve i18n güvenliği** | yaklaşık 45 müşteri sayfası (önce: campaigns, favorites, remedy, donations, rewards, my-card, journey-score, category-leaderboard, event, surprise-boxes) | `fetchJson` + `<QueryState>` + TanStack Query geçişi (abort, keepPreviousData, yeniden dene, `moduleDisabled` durumu); campaigns yanıt sözleşmesi düzeltmesi; i18n: eksik anahtarlar, `t(x) || y` lint yasağı, CI'da anahtar doğrulaması, API'ler kod döner; müşteri tarafında `admin-toast` yerine `CustomerToast`. Sayfa başına mekanik değişiklik; birden çok ajana sayfa grubu olarak bölünebilir. | L |
| E10 | **Ödül teslim zinciri ve cüzdan** | customer/rewards, customer/remedy, customer/remedy/[offerId], customer/surprise-boxes, customer/my-card | `UserReward.status/expiresAt/redeemedDealerId`, `POST /api/dealer/rewards/redeem` atomik tek kullanım, kısa ömürlü imzalı QR pass; telafi: seçim allowlist + snapshot, puan türünde atomik kredi, diğerlerinde kod; kupon anlamının tanımlanması; kutu kuponlarının cüzdana bağlanması; Wallet butonları yalnızca yapılandırılmışsa. Şema değişikliği. Bağımlı: E8 defteri. | XL |
| E11 | **Geri bildirim hattı** | feedback/[code], customer/feedbacks, customer/feedbacks/[id]/journey, customer/consumptions, customer/consumptions/[id] | Oturumdan bağımsız "feedback oluşturuldu" yan etkileri tek fonksiyonda; AI analizi `after()` içinde; R2 presigned fotoğraf + galeri; çipler `quickTags` alanına (bonus yalnızca kullanıcı metnine); çıkar çatışması (bayi/staff kendi QR'ı); `dealerStaffId` doğrulaması; claimToken ile anonim yorumu sonradan hesaba bağlama; birleşik zaman çizelgesi + işletme yanıtı/telafi görünümü; consumptions sayfalama ve doğru istatistik; PUT'ta metin silme ve karakter rozeti tetikleme. | L |
| E12 | **Tara ve Kart mobil deneyimi** | customer/scan, customer/my-card, c/[token] | `useQrScanner` hook (idempotent async teardown, start iptali), `lib/qr-resolve.ts`, kodlu doğrulama hataları (NOT_FOUND/EXPIRED/RATE_LIMITED), merkez Tara FAB'ı; kart yüzü + ayrı "Kasada göster" paneli (wake lock, kısa ömürlü kod), çevrimdışı son kart anlık görüntüsü; `/c/[token]` register `callbackUrl` taşıma, yetim kart düzeltmesi, rol bazlı yönlendirme. | M |
| E13 | **Kampanya, etkinlik ve görev motoru** | customer/campaigns, customer/event, customer/quests | `HappyHour.timezone` ve global kampanyaların puana dahil edilmesi; seasonal challenge admin şeması + `challengeRewardBadgeId` FK + bitişten sonra talep penceresi; `lib/quests/engine.ts recordQuestEvent()` + `periodKey` ile günlük/haftalık döngü; "Fırsatlar" birleşik akışı. Şema değişikliği. Bağımlı: E5'in happy hour doğrulaması. | L |
| E14 | **Yasal belge altyapısı** | cerez-politikasi, gizlilik-politikasi, kvkk-aydinlatma-metni, kullanim-sartlari, guven, auth/register, auth/complete | `(legal)` route grubu, `LegalDocument` + `LegalAcceptance` modelleri, sabit `effectiveAt`, `h1`/`h2` hiyerarşisi, içindekiler, haklar eylem paneli (indir/sil/talep), kayıt ve OAuth sonrası onay adımı; `/guven` metninin koda göre düzeltilmesi (signed URL iddiası). Metin içeriği hukuk danışmanıyla yazılmalı; teknik iskelet bağımsız ilerleyebilir. | L |

### P2 — bilgi mimarisi ve ürün yeniden inşası

| ID | Epik | Sayfalar | Kapsam ve gerekçe | Efor |
|---|---|---|---|---|
| E15 | **Navigasyon kaydı ve sayfa birleştirme** | customer/discover, customer/favorites, customer/lounge, customer/experiences, customer/nearby, customer/progress-hub, customer/trends, customer/analytics, customer/journey-score, customer/spending-overview, customer/consumptions, customer/ai-insights | Tipli tek nav kaydı (sidebar, arama, admin kataloğu, QRA bilgi tabanı buradan türer); §5'teki yeni menü; `/customer/venue/[dealerId]` mekân detayı; İlerleme ve Cüzdan çatı sayfaları; yönlendirmeler; derin bağlantıların bağlanması. Bağımlı: E8. | L |
| E16 | **Oyun kataloğu konsolidasyonu** | customer/games ve 22 oyun sayfası | Tek `app/customer/games/[game]/page.tsx`; §5.3 birleştirmeleri; ortak `useGameLoop` (sabit adım), `ArenaTarget` (transform çakışması), içerik havuzu `MiniGameContent` tablosu; network-defender yeniden inşa; speed-order soft-lock ve data-snake/spam-breaker eşik düzeltmeleri; sonuç kartı CTA'ları ve kişisel rekor. Bağımlı: E4 çekirdeği. Oyun başına iş paralel ajanlara bölünebilir. | L |
| E17 | **Lig ve sosyal rekabet** | customer/leaderboard, customer/category-leaderboard, customer/squads, customer/donations | Haftalık kohort lig (terfi/düşme, geri sayım, yapışkan "sen" satırı) defterden; `lib/business-ranking.ts` (Bayes, güven filtresi, Redis); klan: sahiplik devri, `dissolveSquad` escrow iadesi, `SquadMember.userId @unique`, savaş katılımcılarının dondurulması, sandık ödemesi ya da kaldırılması; bağış liderliği 1-2 bağışçı düzeltmesi. Şema değişikliği. Bağımlı: E8. | L |
| E18 | **Ana sayfa BFF ve dashboard yeniden tasarımı** | customer | `/api/customer/home` tek uç (Redis'te kullanıcıdan bağımsız trend/sponsorlu), sunucu tarafı ilk render (oturum flaşı biter), puan/XP terminoloji ayrımı, seviye atlama anının idempotent hale gelmesi, favori çift kart hatası, sponsorlu kartın linke bağlanması. Bağımlı: E8, E9. | M |
| E19 | **Herkese açık sayfalar ve SEO** | /, neden-qratex, blog, blog/[slug], experience/[token], surveys/[id], table-signal | Canonical/OG/Twitter için `buildPageMetadata`; sitemap'e yazılar; `@tailwindcss/typography` ya da `ArticleBody`; landing'de sahte sosyal kanıt ve DEMO şeridinin kaldırılması, `HyperText` istatistik hatası, stats sorgusunun düzeltilmesi, `/isletmeler` ayrımı; experience share sunucu bileşeni + moderasyon; anket cevap doğrulaması + `@@unique([surveyId,userId])`; table-signal rate limit + bayi bildirimi. | L |

### P3 — deneyim derinliği

| ID | Epik | Sayfalar | Kapsam ve gerekçe | Efor |
|---|---|---|---|---|
| E20 | **Tasarım sistemi ve motion dili** | tüm müşteri sayfaları | §6'daki cüzdan/arena token'ları, ortak bileşenler, `useMotionPreference`, transform-çakışma lint kuralı, landing zemininin sadeleştirilmesi; kartım CSS 3D tilt. | L |
| E21 | **Wrapped, paylaşım ve anlar** | customer/my-year, customer/badges, customer/surprise-boxes, customer/referral, experience/[token] | Hikâye slaytları, yıl seçici + `UserYearSnapshot`, ortak `lib/share-card` (9:16 PNG, referral bağlantılı), An Motoru ile kutlama anları, sürpriz kutuda nadirlik kademeleri ve gerçek kazanım kuralı. Bağımlı: E8, E20. | L |
| E22 | **Erişilebilirlik ve mobil temelleri** | 22 oyun sayfası, customer/ekip, customer/settings, customer/consumptions/[id], surveys/[id], tüm başlıklar | Oyunlarda klavye şeması, `aria-live` HUD, rahat mod; mobil `h1`; hover-only aksiyonların menüye taşınması; `StarRating` radiogroup; 44px dokunma hedefi; turnuva bileşeninin arena teması. | M |
| E23 | **Giriş yöntemleri ve onboarding** | auth/login, auth/register, auth/complete, auth/verify-email, c/[token], feedback/[code] | Passkey (WebAuthn conditional UI), e-posta OTP, QR bağlamlı giriş bandı (işletme + kazanılacak puan), kalıcı CUSTOMER oturumu + step-up, adımlı onboarding, işletme kaydının ayrı kapıdan yapılması. Bağımlı: E1, E2. | L |

### Paralel uygulama notları

- **Hemen başlayabilir (birbirinden bağımsız):** E1, E3, E4, E5, E6, E7. E2, `lib/auth.ts`'te E1 ile aynı dosyaya dokunduğu için dosya bölgesi ayrımıyla (E1 `callbacks.redirect`, E2 `jwt`/`authorize`) paralel yürüyebilir.
- **Şema değişikliği gerektirenler** (canlı Neon, planlı migrate): E2, E4, E5, E6, E8, E10, E13, E14, E17. Bunlar tek bir migrate penceresinde toplanmalı; her epik kendi migration'ını hazırlar, uygulama tek seferde ve onayla yapılır.
- **Kritik yol:** E8 (defter + tek-kaynak servisler) → E15/E17/E18 → E21. E8'i bekletmemek için E9 (veri durumu katmanı) aynı anda sayfa grupları halinde ilerleyebilir.
- Proje sahibinin çalışma tercihi gereği her epik `tsc` ile ilerlemeli, build en sona bırakılmalı; görsel düzeltmeler (E12, E16, E20) headless Chrome tezgâhıyla ölçülerek doğrulanmalı.
