# Gizlilik etiketleri — App Store "App Privacy" + Google Play "Data safety"

Kaynak gerçek: `ios/App/App/PrivacyInfo.xcprivacy`. Bir SDK/özellik eklendiğinde **üçü birlikte**
güncellenir (manifest, bu dosya, iki konsol formu). Dayanak:
- PostHog (`components/analytics/posthog-consent.ts`): varsayılan **kapalı** (`opt_out_capturing_by_default`),
  yalnız analitik onayıyla açılır; oturum kaydı kapalı; `person_profiles: identified_only`.
- Sentry (`@sentry/nextjs`): çökme + performans; kullanıcıya bağlanmaz.
- Reklam SDK'sı, IDFA, ATT istemi **yok**. Veri satışı/paylaşımı (reklam amaçlı) **yok**.
- Konum: müşteri uygulaması cihaz konumunu **toplamaz** (Keşfet'teki mesafe filtresi tarayıcıda hesaplanır;
  doğrulayın — sunucuya koordinat gönderiliyorsa aşağıya "Yaklaşık konum / Uygulama işlevi" ekleyin).
  İşletme adresi/koordinatı işletmenin kendi girdiği veridir, kullanıcı verisi değildir.

## App Store Connect → App Privacy

"Do you or your third-party partners use data for tracking?" → **No**

| Veri türü | Toplanıyor | Kullanıcıya bağlı | Takip | Amaç |
|---|---|---|---|---|
| Contact Info › Name | Evet | Evet | Hayır | App Functionality |
| Contact Info › Email Address | Evet | Evet | Hayır | App Functionality |
| Contact Info › Phone Number | Evet (isteğe bağlı) | Evet | Hayır | App Functionality |
| User Content › Photos or Videos | Evet (isteğe bağlı) | Evet | Hayır | App Functionality |
| User Content › Other User Content (yorumlar) | Evet | Evet | Hayır | App Functionality |
| Purchases › Purchase History (kasada işlenen tüketim) | Evet | Evet | Hayır | App Functionality |
| Identifiers › User ID | Evet | Evet | Hayır | App Functionality, Analytics |
| Usage Data › Product Interaction | Evet (onayla) | Evet | Hayır | Analytics |
| Diagnostics › Crash Data | Evet | Hayır | Hayır | App Functionality |
| Diagnostics › Performance Data | Evet | Hayır | Hayır | App Functionality |

Toplanmayan: Location, Health, Financial Info (kart/banka), Contacts, Browsing/Search History,
Sensitive Info, Device ID (IDFA), Advertising Data, Audio.

## Google Play Console → Data safety

- Veri toplanıyor veya paylaşılıyor mu? **Evet (toplanıyor)**
- Aktarımda şifreleniyor mu? **Evet** (yalnız HTTPS)
- Kullanıcı veri silme isteyebilir mi? **Evet** — uygulama içi (Ayarlar > Hesabı sil, `/api/user/delete-account`)
  ve web: https://qratex.com/customer/settings
- Üçüncü tarafla **paylaşım**: **Hayır** (PostHog ve Sentry "hizmet sağlayıcı" sayılır, Play tanımında paylaşım değildir)

| Kategori › Tür | Toplanır | Zorunlu mu | Amaç |
|---|---|---|---|
| Kişisel bilgi › Ad | Evet | Zorunlu | Uygulama işlevi, Hesap yönetimi |
| Kişisel bilgi › E-posta | Evet | Zorunlu | Uygulama işlevi, Hesap yönetimi, İletişim |
| Kişisel bilgi › Telefon | Evet | İsteğe bağlı | Hesap yönetimi |
| Kişisel bilgi › Kullanıcı kimlikleri | Evet | Zorunlu | Uygulama işlevi, Analiz |
| Fotoğraflar ve videolar › Fotoğraflar | Evet | İsteğe bağlı | Uygulama işlevi |
| Uygulama etkinliği › Uygulama etkileşimleri | Evet | İsteğe bağlı (onay) | Analiz |
| Uygulama etkinliği › Kullanıcı tarafından oluşturulan diğer içerik | Evet | İsteğe bağlı | Uygulama işlevi |
| Finansal bilgi › Satın alma geçmişi | Evet | Zorunlu | Uygulama işlevi |
| Uygulama bilgileri ve performansı › Kilitlenme günlükleri | Evet | Zorunlu | Uygulama işlevi |
| Uygulama bilgileri ve performansı › Teşhis | Evet | Zorunlu | Uygulama işlevi |

Play "Uygulama erişimi": giriş gerekiyor → inceleme hesapları (bkz. `listing.md` İnceleme notu).
Play "Reklamlar": **Hayır**.
