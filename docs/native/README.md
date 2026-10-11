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
- Gereken: Android Studio (JDK 21), SDK 35+.
- İkon/splash: `android/app/src/main/res/mipmap-*` hâlâ Capacitor varsayılanıdır. Marka ikonu için
  `npx @capacitor/assets generate --android` (kaynak: 1024px PNG; `public/icons/icon-512x512.svg`'den
  üretilebilir) — paket kurulu değil, kurulum ayrı onay ister.
- İmzalama: `keytool -genkey -v -keystore qratex-release.jks -alias qratex -keyalg RSA -keysize 2048 -validity 10000`;
  keystore **repoya girmez**. `android/app/build.gradle` → `signingConfigs.release` env'den okunmalı.
- Derleme: Android Studio → *Build > Generate Signed App Bundle* (`.aab`) → Play Console.
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
- Derleme: Xcode → *Product > Archive* → App Store Connect → TestFlight → inceleme.
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
