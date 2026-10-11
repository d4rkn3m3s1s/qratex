# Yol Durumu — 2026-10-12

Dal: `feat/platform-overhaul` · Kaynaklar: `docs/quality/GATES.md` (son ölçüm 51f100e2), `docs/audit/2026-10-08/E2E-RAPORU.md`, bu turun 7 ajan özeti.
Dürüstlük notu: Aşağıdaki "kapandı" maddelerinin bir kısmı yalnız kodda/tsc+jest ile doğrulandı, tarayıcıda yeniden denenmedi; her maddede belirtildi. Native uygulamalar HİÇBİR cihazda derlenmedi/çalıştırılmadı.

## 1. Kapı panosu (son ölçüm: 6 YEŞİL, 12 KIRMIZI)

| Kapı | Ölçülen | Durum |
|---|---|---|
| tsc | 0 hata | YEŞİL |
| jest | tümü geçti | YEŞİL |
| build | başarılı | YEŞİL |
| `/feedback/[code]` JS | ≤150 KB | YEŞİL |
| Yatay taşma | 0 rota | YEŞİL |
| Lighthouse en iyi uygulamalar | ≥96 | YEŞİL |
| e2e (salt-okur) | 70/99 geçti, 29 başarısız, 6 atlandı | KIRMIZI |
| Konsol hatası | 13 (12/79 rota) — 429 `/api/consent`, 429 bildirim akışı, `/admin/roadmap` chunk 404, `/dealer/innovation` CLIENT_FETCH_ERROR | KIRMIZI |
| Başarısız istek | 17 (12/79) — aynı 429'lar, `/admin/ekip` Google avatar ORB | KIRMIZI |
| axe kritik+ciddi | 13 rota | KIRMIZI |
| Dokunma hedefi <44px | 177 (19/79 rota) | KIRMIZI |
| Kontrast AA | 3 (cüzdan "Tüm hareketler" 4.46, `/guven` 4.49) | KIRMIZI |
| LH oturum | `/admin` girişe düşüyor (kapı çerezi taşınmıyor) | KIRMIZI |
| LH performans (mobil) | 4/11 rota <90 (`/` 68) | KIRMIZI |
| LH SEO (public) | `/auth/login` 69, `/auth/register` 69, `/feedback/DEMO` 92 | KIRMIZI |
| LCP | en kötü 7.07 sn (`/`; diğerleri <2.5 sn) | KIRMIZI |
| CLS | ~0.135 her rotada (ortak kaynak; çerez bandı şüphesi, doğrulanmadı) | KIRMIZI |
| npm audit (üretim) | 4 kritik | KIRMIZI |

Doğrulanmamış yorumlar: e2e zaman aşımları büyük olasılıkla dev sunucusu yükünden (6 paralel ajan); 429'lar istek sınırından. `a025e95f` noindex düzeltmesi SEO ölçümüne yansımamış görünüyor — ayrıca bakılmalı.

## 2. E2E açıkları (~45 maddeden)

### Bu turda kapanan
- **Müşteri:** oyun mod seçici günlük hakkı önceden gösteriyor (5f99176b, tarayıcıda görüldü); Sahte Avcısı pratik `?mod=` (yalnız kod); guardian-of-trust yönlendirmesi; telafi kabulünde çift gönderim kilidi + gerçek telafi kabul testi (20 puan, tek defter kaydı); karakter rozeti açılışında çift istek/503 (tek istek doğrulandı).
- **Bayi:** duvar ekranı uçtan uca test edildi; çerez bannerı `/wall/` kiosk ekranını örtüyordu → gizlendi (6a46914e, tarayıcıda doğrulandı); otomatik yanıt "?" kontrast notu hata değil.
- **Admin:** Konsey metrik uydurmasına bekçi (21664c28, jest 16/16); a-genel-kullanici yetki/arama/360 etkileşimleri doğrulandı (REPORT.md yazılmadı).
- **Public/Auth:** şifre sıfırlama 500 (transaction bekleme süresi) ve claim yanlış mesajı (5483760a) — ikisi de sunucuda yeniden denenmedi; `/offline` başlığı zaten düzeltikti.

### Kalan
- 44px altı dokunma hedefleri (DataTable, sayfalama, Switch, chip'ler) — paylaşılan DS bileşenleri, **tasarım kararı** bekliyor.
- Kısaltılmış turlar (m-ben, m-ses-ayar, p-public, p-qr-huni, p-auth) hâlâ tam kapsanmadı; auth ölçümleri eksik.
- Kapı panosundaki kırmızılar (yukarıda): 429 rate-limit, roadmap chunk 404, ORB avatar, axe/kontrast, SEO, LCP/CLS, npm audit.
- Ürün/tasarım kararı bekleyen ~12 madde (E2E-RAPORU.md'deki listeler).

## 3. Android / iOS hazırlığı

### Yapılan (kodda; cihazda denenmedi)
- Capacitor kabuğu: `capacitor.config.ts`, kimlik `com.qratex.app`; sunucu `CAPACITOR_SERVER_URL` → https NEXT_PUBLIC_APP_URL/NEXTAUTH_URL → `https://qratex.com` (localhost'a asla bağlanmaz). `android/` ve `ios/` projeleri repoda; `native-shell/` çevrimdışı ekranı.
- Android geri tuşu yöneticisi (önce açık katman, sonra geri, kökte "çıkmak için tekrar basın"), status bar tema takibi, splash, klavye.
- Native push (dce60e10): FCM HTTP v1 + APNs (.p8, HTTP/2), `sendPush` tek cephe (5 gönderim yolu taşındı), `/api/push/native` kayıt ucu, istemci izin/jeton akışı. Jeton geçici olarak `endpoint="native:<fcm|apns>:<token>"`; kalıcı alan isteği `SCHEMA-REQUESTS-ek.md`'de.
- Bu makinede Android SDK ve Xcode yok → derleme yapılmadı.

### Proje sahibinin yapması gerekenler
1. **Firebase projesi** → Android uygulaması (`com.qratex.app`), `google-services.json` → `android/app/`; FCM servis hesabı JSON'unu sunucu env'ine ekle.
2. **APNs**: Apple Developer'da .p8 Auth Key, Key ID, **Team ID**, bundle id → sunucu env; Xcode'da Push Notifications + Background Modes yeteneği.
3. **İmzalama**: Android upload keystore (yedekle!), Play App Signing; iOS dağıtım sertifikası + provisioning profile.
4. **Mağaza hesapları**: Google Play Console (tek sefer ücret), Apple Developer Program (yıllık); mağaza listeleri, gizlilik beyanları, ekran görüntüleri.
5. **Deep link doğrulama**: `/.well-known/assetlinks.json` için release imza **SHA256** parmak izi; `apple-app-site-association` için **Team ID**.
6. Android Studio / Xcode kurulu makinede `npx cap sync` + gerçek cihaz testi (geri tuşu, push, deep link, harici linkler).
7. Prod env'de `CAPACITOR_SERVER_URL` (veya https `NEXT_PUBLIC_APP_URL`) tanımla.

## 4. Sıradaki adım: tasarım aşaması
- Dokunma hedefi/DS bileşen boyutları, kontrast ve axe maddeleri tasarım kararı ister → tasarım aşamasında topluca ele alınmalı.
- Paralelde teknik borç: rate-limit 429'ları, roadmap chunk 404, SEO noindex doğrulaması, CLS ortak kaynağı, `/` LCP, npm audit kritikleri; ardından kapıları yük olmadan (tek sunucu) yeniden ölç.
