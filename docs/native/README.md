# Qratex native uygulama (Android / iOS) — Capacitor

## Model
Qratex Next.js **SSR** uygulamasıdır, statik export yoktur. Native uygulama, canlı sunucuyu
WebView'de yükleyen bir **kabuk**tur (`capacitor.config.ts` → `server.url`). Web'e çıkan her sürüm
mağaza güncellemesi gerektirmeden uygulamaya da yansır; native kod değişikliği (eklenti, izin,
ikon, deep link) olduğunda mağazaya yeni sürüm gerekir.

| Dosya | Görev |
|---|---|
| `capacitor.config.ts` | appId `com.qratex.app`, sunucu adresi, splash/status bar/klavye ayarları |
| `native-shell/index.html` | `webDir`: yalnız sunucuya ulaşılamazsa görünen çevrimdışı ekran |
| `android/`, `ios/` | `npx cap add` ile üretilmiş native projeler (git'te) |
| `components/native/native-bridge.tsx` | geri tuşu, status bar tema senkronu, splash, deep link, harici bağlantılar (yalnız native'de çalışır) |
| `lib/native/back-button.ts` | geri tuşu karar mantığı (açık katman → geçmiş → kökte "tekrar bas, çık") |
| `lib/native/app-links.ts` + `app/.well-known/*` | `assetlinks.json` ve `apple-app-site-association` (application/json) |
| `scripts/generate-pwa-icons.mjs` | PWA PNG ikonları (192, 512, maskable 512) |
| `scripts/generate-native-assets.mjs` | Android mipmap (legacy + round + adaptive foreground), splash (port/land, tüm yoğunluklar), iOS AppIcon 1024 + Splash, Play ikon/özellik grafiği |
| `scripts/generate-store-screenshots.mjs` | Mağaza ekran görüntüsü taslakları (`docs/native/store/screenshots/`) |
| `scripts/native-version.mjs` | iOS `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`'ı `package.json`'dan eşitler (`--build N`) |
| `.github/workflows/android.yml`, `ios.yml` | Bulutta derleme (secrets varsa imzalı, yoksa debug APK / simülatör) |
| `ios/App/App/PrivacyInfo.xcprivacy`, `{tr,en}.lproj/InfoPlist.strings` | Gizlilik manifesti, yerelleştirilmiş izin metinleri |
| `docs/native/store/` | Mağaza metinleri, gizlilik formları, ekran görüntüleri, yaş derecelendirme |

### Sunucu adresi
Sıra: `CAPACITOR_SERVER_URL` → `NEXT_PUBLIC_APP_URL` → `NEXTAUTH_URL` → `https://qratex.com`.
`NEXT_PUBLIC_APP_URL`/`NEXTAUTH_URL` yalnız `https://` ve localhost değilse kullanılır (yerelde
ikisi de `http://localhost:3000` olduğu için mağaza derlemesi yanlışlıkla localhost'a bağlanmaz).
Emülatörde yerel sunucu denemek için:

```bash
CAPACITOR_SERVER_URL=http://10.0.2.2:3000 npx cap sync android   # Android emülatörü → host makine
CAPACITOR_SERVER_URL=http://localhost:3000 npx cap sync ios      # iOS simülatörü
```
(`http://` verilirse `cleartext` otomatik açılır; mağaza derlemesinde HTTPS kullanın.)

## Geliştirme
```bash
npx cap sync            # config + eklentileri native projelere kopyala (her config/eklenti değişikliğinde)
npx cap open android    # Android Studio
npx cap open ios        # Xcode (yalnız macOS)
```
Bu repo Windows'ta hazırlandı: Android SDK / Xcode ile **derleme yapılmadı**. iOS derlemesi
macOS + Xcode 16+ + CocoaPods/SPM gerektirir.

## Android
- Gereken: Android Studio (JDK 21), SDK 36 (`android/variables.gradle`). Yerelde SDK yoksa CI kullanın.
- İkon/splash: `node scripts/generate-native-assets.mjs` (kaynak `public/icons/icon-512x512.svg`; adaptive
  arka plan `#4F46E5`, splash zemini `#0a0a0a` = `capacitor.config.ts`). Çıktılar git'te.
- Sürüm: `android/app/build.gradle` `package.json` sürümünü okur → `versionName = x.y.z`,
  `versionCode = x*10000+y*100+z`; `QRATEX_VERSION_CODE` env'i verilirse o kullanılır (CI: `100000 + run_number`).
  **Sürüm yükseltmek için yalnız `package.json` `version` alanını değiştirin.**
- İmzalama: `signingConfigs.release` env'den okur (`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`). Keystore yoksa release imzasız kalır. Anahtar üretimi: aşağıda.
- İzinler: `INTERNET`, `CAMERA` (QR, çalışma anında sorulur; kamera donanımı zorunlu değil);
  `POST_NOTIFICATIONS` push eklentisinden birleşir. `allowBackup=false` (oturum çerezleri yedeklenmez).
- Derleme: GitHub → *Actions › Android › Run workflow* → artifact (`.aab` Play'e, `.apk` cihaza).
- **App Links**: `AndroidManifest.xml`'de `qratex.com` / `www.qratex.com` için `autoVerify` intent-filter
  var. Doğrulama için imza parmak izini sunucu env'ine koyun:
  `ANDROID_SHA256_CERT_FINGERPRINTS="AA:BB:..."` (virgülle birden çok; Play App Signing kullanılıyorsa
  Play Console > *App integrity* sayfasındaki **App signing key** SHA-256'sı). **Şu an boş →
  `/.well-known/assetlinks.json` `[]` döner, bağlantılar doğrulanmaz (tarayıcıda açılır).**

## iOS
- Gereken: macOS, Xcode, Apple Developer hesabı.
- `ios/App/App/App.entitlements`: `applinks:qratex.com`, `applinks:www.qratex.com`, `aps-environment`
  (`development`; App Store derlemesinde Xcode `production` yapar). Xcode'da *Signing & Capabilities*
  altında Team seçin; Associated Domains ve Push Notifications yetenekleri Apple Developer'da App ID için
  açık olmalı.
- **Universal Links**: sunucu env'i `APPLE_TEAM_IDENTIFIER` (10 karakter; Wallet ile ortak).
  **Şu an boşsa `/.well-known/apple-app-site-association` `{"applinks":{"details":[]}}` döner.**
  `/api/*`, `/admin-gate*`, `/.well-known/*` uygulamada açılmaz.
- Derleme: GitHub → *Actions › iOS › Run workflow* (`upload_testflight` işaretliyse TestFlight'a yükler)
  ya da Mac'te Xcode → *Product > Archive*.
- İzin metinleri: `Info.plist` (İngilizce varsayılan) + `tr.lproj` / `en.lproj` `InfoPlist.strings`:
  kamera (QR), fotoğraf seçme, fotoğraflara kaydetme. Yeni izin eklenirse **üç dosyaya da** yazılır.
- `PrivacyInfo.xcprivacy`: takip yok; toplanan veri türleri `docs/native/store/privacy-labels.md` ile eş.
- `ITSAppUsesNonExemptEncryption=false` (yalnız HTTPS) → her yüklemede ihracat sorusu çıkmaz.
- Sürüm: `node scripts/native-version.mjs [--build N]` (CI otomatik çalıştırır).
- Apple 4.2 (Minimum Functionality) uyarısı: yalnız web sarmalayan uygulamalar reddedilebilir; push,
  kamera ile QR tarama, deep link gibi native yetenekler inceleme notunda belirtilmeli.

## Native davranışlar (web'de etkisiz)
- **Geri tuşu (Android)**: açık Radix dialog/alert-dialog/sheet, vaul drawer, menü/select/popover
  varsa Escape ile en üstteki kapanır → değilse `history.back()` → kök ekranlarda (`/`, `/app`,
  `/customer`, `/dealer`, `/staff`, `/admin`, `/login`) "Uygulamadan çıkmak için tekrar basın" ve
  2 sn içinde ikinci basışta çıkış. Bileşenlerin kayıt olması gerekmez (DOM tabanlı tek yönetici).
- **Status bar**: web görünümünün altına uzanır; içerik `env(safe-area-inset-*)` ile korunur
  (panel layout'ları zaten kullanıyor). Stil `<html class="dark">` değişimini izler.
- **Klavye**: `resize: native`.
- **Harici bağlantılar**: farklı host'a giden `<a>` tıklamaları sistem tarayıcısında açılır.
- `<html>` sınıfları: `native-app`, `native-android` / `native-ios` (gerektiğinde CSS ayrımı için).

## Karşılama / onboarding
"Görüldü" bilgisi localStorage'a ek olarak sunucuda (`Settings.user_settings_<id>.uiSeen`,
`/api/user/ui-seen`) tutulur; yeni cihazda/uygulamada tekrar gösterilmez.

## Push
Native push (FCM/APNs) ayrı iş kalemidir; `google-services.json` (Android) ve APNs anahtarı
gerektirir, ikisi de repoya girmez.

## Proje sahibinin yapması gerekenler (adım adım)

Kod tarafı hazır; aşağıdakiler hesap/anahtar gerektirdiği için elle yapılır. Sıra önemlidir.

### 1. Hesaplar
1. **Google Play Console** — https://play.google.com/console (tek seferlik 25 USD). Kişisel hesapta yeni
   uygulamalar için 12 testçi × 14 gün kapalı test şartı var; **kuruluş hesabı** (D-U-N-S numarası) bu şartı kaldırır.
2. **Apple Developer Program** — https://developer.apple.com/programs (yıllık 99 USD). Şirket adına açmak için
   D-U-N-S gerekir; mağazada satıcı adı olarak görünür.
3. Play Console'da uygulama oluşturun: ad *Qratex*, paket `com.qratex.app` (**sonradan değişmez**).
4. developer.apple.com → *Identifiers* → App ID `com.qratex.app` (**Push Notifications** ve **Associated Domains**
   işaretli) → App Store Connect → *Apps › +* (SKU: `qratex-ios`).

### 2. Android imzalama anahtarı (bir kez; KAYBETMEYİN)
```bash
keytool -genkeypair -v -keystore qratex-upload.jks -alias qratex -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 qratex-upload.jks > qratex-upload.jks.b64      # macOS: base64 -i qratex-upload.jks -o qratex-upload.jks.b64
```
Parolayı parola yöneticisine kaydedin, `.jks`'yi repoya koymayın. GitHub → *Settings › Secrets and variables ›
Actions*: `ANDROID_KEYSTORE_BASE64` (.b64 içeriği), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`qratex`),
`ANDROID_KEY_PASSWORD`. Play Console'da **Play App Signing** açık kalsın: bu anahtar *yükleme anahtarı* olur,
kaybolursa Play desteğinden sıfırlanabilir.

App Links parmak izi: Play Console → *Uygulama bütünlüğü › Uygulama imzalama* → **App signing key SHA-256** →
sunucu env'i `ANDROID_SHA256_CERT_FINGERPRINTS` (yükleme anahtarınınkini de virgülle ekleyin:
`keytool -list -v -keystore qratex-upload.jks -alias qratex`).

### 3. Firebase (Android push — FCM)
1. https://console.firebase.google.com → proje → *Android uygulaması ekle* → paket `com.qratex.app`.
2. `google-services.json`'ı **repoya koymayın**: `base64 -w0 google-services.json` → secret
   `GOOGLE_SERVICES_JSON_BASE64` (CI derlemede yazar, sonunda siler).
3. Sunucudan gönderim için hizmet hesabı anahtarı → `docs/native/PUSH.md`.

### 4. Apple push (.p8) ve App Store Connect API anahtarı
1. developer.apple.com → *Keys › +* → **Apple Push Notifications service (APNs)** → `.p8` (yalnız bir kez
   indirilir). Key ID + Team ID → Firebase *Proje ayarları › Cloud Messaging › APNs kimlik doğrulama anahtarı*
   (ya da doğrudan APNs kullanılıyorsa `PUSH.md`'deki env'ler).
2. App Store Connect → *Users and Access › Integrations › App Store Connect API* → anahtar (rol: App Manager).
   Secrets: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64` (`base64 -i AuthKey_XXXX.p8`),
   `APPLE_TEAM_ID` (10 karakter; sunucu env'i `APPLE_TEAM_IDENTIFIER` ile aynı değer).

### 5. iOS imzalama — fastlane match (bir kez, bir Mac'te)
Sertifika ve profilleri şifreli **özel** bir git deposunda tutar; CI salt-okunur çeker.
```bash
brew install fastlane
# Boş, ÖZEL bir repo açın: ör. github.com/<org>/qratex-certificates
fastlane match init                       # storage: git, URL: o repo
fastlane match appstore --app_identifier com.qratex.app --api_key_path asc.json
#   asc.json: {"key_id":"...","issuer_id":"...","key_filepath":"AuthKey_XXXX.p8"}
#   sorulan passphrase = MATCH_PASSWORD
```
Secrets: `MATCH_GIT_URL` (https), `MATCH_PASSWORD`, `MATCH_GIT_BASIC_AUTHORIZATION`
(`echo -n "kullanici:GITHUB_PAT" | base64`; PAT yalnız o repoya *contents: read*).
Bu secrets ve ASC anahtarı yoksa iOS iş akışı yalnız simülatör derlemesi üretir.

### 6. İlk derleme ve yükleme
1. *Actions › Android › Run workflow* → `qratex-android-release-*` artifact'indeki `.aab` → Play Console →
   *Dahili test* (ilk yükleme elle yapılır).
2. *Actions › iOS › Run workflow* (`upload_testflight` ✓) → App Store Connect › TestFlight → dahili testçiler.
3. Vercel env: `ANDROID_SHA256_CERT_FINGERPRINTS`, `APPLE_TEAM_IDENTIFIER` → yeniden deploy →
   `/.well-known/assetlinks.json` ve `/.well-known/apple-app-site-association` dolu dönmeli.

### 7. Mağaza girişleri (`docs/native/store/`)
- `listing.md` → açıklamalar, anahtar kelimeler, URL'ler, **inceleme notu + ayrı inceleme hesapları**.
- `privacy-labels.md` → App Privacy ve Data safety formları.
- `age-rating.md` → derecelendirme anketleri; UGC için bildir/engelle özelliğini doğrulayın.
- `screenshots.md` + `screenshots/` → görüntüler (iPad desteği açık: ya iPad görüntüsü ya iPhone-only).
- `assets/feature-graphic-1024x500.png`, `assets/play-icon-512.png` → Play mağaza girişi.

### Sürüm döngüsü
1. `package.json` `version` → artırın (ör. `1.0.1`), commit.
2. İki iş akışını çalıştırın; build numaraları `run_number`'dan otomatik artar.
3. Yalnız web değişikliği ise mağaza sürümü **gerekmez** (kabuk canlı sunucuyu yükler).
