# /dealer/settings

**Amaç:** Bayinin (işletme sahibi) hesap kimliğini (ad, avatar, telefon), işletme profilini (ad, adres, konum, açıklama, çalışma saatleri, varsayılan yanıt, dil, tatil modu), bildirim tercihlerini, güvenliğini (2FA, şifre) ve ana panel düzeni ile erişilebilirlik tercihlerini tek bir sekmeli sayfadan yönetmesi. Onboarding'in "profil" ve "konum" adımları da buraya yönlendirir (`app/api/dealer/onboarding/route.ts:47-48`).

**Genel puan: 4.2/10** · **Karar: yeniden tasarla**

Kısa özet: Güvenlik sekmesi (2FA + şifre) ve konum/adres akışı gerçekten çalışıyor. Buna karşın sayfanın vaat ettiği şeylerin önemli bir kısmı ya sahte (bildirim sekmesinin tamamı `setTimeout` ile "kaydedildi" diyor), ya da kaydedilip hiçbir yerde okunmuyor (tatil modu, çalışma saatleri, varsayılan yanıt şablonu). Profil formunda veri kaybına yol açabilen bir yükleme/kaydetme yarışı ve oturum yenilendiğinde düzenlenmekte olan formun üzerine yazılması var. Dil seçimi kaydediliyor ama arayüze yansımıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Güvenlik ve konum gerçek; bildirim sekmesi tamamen sahte, 3 işletme alanı ölü veri, dil seçimi etkisiz, panel düzeni kaydı benchmark widget'ını kalıcı olarak gizliyor. |
| UX | 4/10 | Üç kartı kapsayan tek "Kaydet" butonu, GPS'in anında, geri kalanın elle kaydedilmesi, yükleniyor/hata/kirli durum göstergesi yok, sekme URL'de tutulmuyor. |
| Görsel | 6/10 | Tutarlı shadcn kartları ve kapak şeridi düzgün; ancak her kartın kendi renkli ikon kutusu ve her butonun farklı gradyanı (amber, kırmızı, zümrüt) görsel hiyerarşiyi dağıtıyor. |
| Mimari | 3/10 | 1084 satırlık tek istemci bileşeni, ham `fetch` + elle state (React Query yok), paylaşılan tek `saving` bayrağı, `any[]`, gerçek bildirim tercih altyapısı (`lib/notification-prefs.ts`) ve hazır `PrivacySecuritySettings` bileşeni kullanılmıyor. |
| Performans | 6/10 | Hafif sayfa; ama `session` her yenilendiğinde iki API yeniden çağrılıyor, Nominatim çağrısı önbelleksiz ve hız sınırsız. |
| Erişilebilirlik + Mobil | 4/10 | Mobilde sekmelerin erişilebilir adı yok, elle yazılmış avatar modalı focus-trap/Esc/role içermiyor, birçok `Label` alanına bağlı değil, ikon-butonlarda `aria-label` yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa başlığı (DashboardPageHero) | ÇALIŞIYOR | `app/dealer/settings/page.tsx:386-392` | i18n anahtarları tr/en'de mevcut (99/99 anahtar doğrulandı). |
| 2 | Sayfa metadata (layout) | ÇALIŞIYOR | `app/dealer/settings/layout.tsx:4-6` | |
| 3 | Rol koruması (yalnız DEALER) | ÇALIŞIYOR | `proxy.ts:50-73` | `/dealer` öneki DEALER dışındaki rolleri yönlendiriyor. |
| 4 | Sekme çubuğu (Profil / Bildirimler / Güvenlik / Görünüm) | KISMİ | `page.tsx:395-413` | Mobilde (`hidden sm:inline`) yalnız ikon kalıyor, erişilebilir ad yok; sekme durumu URL'de değil (onboarding'den derin bağlantı mümkün değil). |
| 5 | Profil verisini yükleme (GET `/api/user/profile`) | KISMİ | `page.tsx:89-139`, `app/api/user/profile/route.ts:102-168` | Yükleniyor/hata durumu yok; hata sessizce yutuluyor (`page.tsx:121-123`); `[session]` bağımlılığı yüzünden tekrar tekrar çalışıyor (Bulgu B2). |
| 6 | Sahte telefon varsayılanı | BOZUK | `page.tsx:76` | `'+90 555 123 4567'` başlangıç değeri; GET başarısız olursa Kaydet bunu kalıcı yazar (Bulgu B1). |
| 7 | Avatar kartı (kapak şeridi + avatar + ad + e-posta) | ÇALIŞIYOR | `page.tsx:423-458` | |
| 8 | Avatar üzerinde hover kamera katmanı | KISMİ | `page.tsx:434-441` | `opacity-0 group-hover:opacity-100`; klavye odağında görünmez kalıyor (`focus-visible` yok). |
| 9 | "Avatarı değiştir" butonu | ÇALIŞIYOR | `page.tsx:446-454` | |
| 10 | Avatar seçim modalı | KISMİ | `page.tsx:999-1081` | Elle yazılmış katman: `role="dialog"`, `aria-modal`, focus trap, Esc ile kapanma, odak iadesi yok. Projede Radix `Dialog` mevcut (`components/ui/dialog.tsx:4`). |
| 11 | Avatar kategori düğmeleri (8 kategori) | ÇALIŞIYOR | `page.tsx:1033-1044`, `lib/avatar-options.ts:3-107` | Kategori adları sabit Türkçe ("Hayvanlar", "Meyveler"…), EN arayüzde çevrilmiyor. |
| 12 | Avatar ızgarası + seçili işaret | ÇALIŞIYOR | `page.tsx:1047-1074` | Tüm görseller `alt="Avatar"`; butonlarda `aria-pressed`/`aria-label` yok. Seçim yalnız yerel; kalıcılık "Değişiklikleri kaydet"e bağlı (toast bunu söylüyor). |
| 13 | Modal kapatma (X / arka plan tıklama) | KISMİ | `page.tsx:1006`, `1025-1027` | X butonunda `aria-label` yok; Esc yok. |
| 14 | Ad Soyad alanı | KISMİ | `page.tsx:473-483` | Sunucu `min(2)` istiyor (`route.ts:12`); adı boş (ör. OAuth ile adsız gelen) bayi hiçbir profil alanını kaydedemez, yalnız jenerik hata görür. |
| 15 | E-posta (salt okunur) | ÇALIŞIYOR | `page.tsx:484-497` | E-posta değiştirme akışı EKSİK. |
| 16 | Telefon | KISMİ | `page.tsx:499-510` | Biçim doğrulaması/maske yok; bkz. #6. |
| 17 | İşletme adı | ÇALIŞIYOR | `page.tsx:528-539` | Onboarding "profil" adımını tamamlar (`onboarding/route.ts:39`). |
| 18 | Adres | ÇALIŞIYOR | `page.tsx:540-551` | Müşteri keşif/yakınımdakiler uçları tüketiyor. |
| 19 | Enlem / Boylam alanları | ÇALIŞIYOR | `page.tsx:552-577` | Harita önizlemesi/pin yok; aralık dışı değerde sunucu 400'ü jenerik toast'a dönüşüyor. |
| 20 | "Konumumu al" (GPS + ters geokod + anında kayıt) | ÇALIŞIYOR | `page.tsx:198-265` | Formun geri kalanından farklı olarak ANINDA sunucuya yazıyor; kullanıcının elle yazdığı adresi sessizce eziyor. |
| 21 | "Koordinattan adres bul" | ÇALIŞIYOR | `page.tsx:267-289`, `app/api/location/reverse/route.ts:17-85` | Yalnız formu doldurur (kaydetmez) — #20 ile tutarsız. Nominatim'e önbelleksiz/hız sınırsız proxy. |
| 22 | GPS ve adres butonlarının yerleşimi | KISMİ (doğrulanmadı) | `page.tsx:578-599` | İki `inline-flex` buton `space-y-4` içinde kardeş; Tailwind 3'te ikincisine `margin-top` uygulanıyor → aynı satırda dikey kayma olası. Görsel olarak doğrulanmadı. |
| 23 | İşletme açıklaması | KISMİ | `page.tsx:600-611` | `Label` alana bağlı değil (`htmlFor` yok); sunucu 500 karakter sınırı (`route.ts:16`) UI'da gösterilmiyor. |
| 24 | Çalışma saatleri | SAHTE | `page.tsx:612-621`; tüketici yok | Yalnız `app/api/user/profile` yazıyor; kod tabanında başka hiçbir okuyucu yok. Şema yorumu JSON biçimi bekliyor (`prisma/schema.prisma:89`), UI serbest metin topluyor. |
| 25 | Varsayılan yanıt şablonu | SAHTE | `page.tsx:622-631`; tüketici yok | Yanıt bestecisi bu alanı hiç okumuyor (`replyTemplate` araması yalnız bu iki dosyada). |
| 26 | Tercih edilen dil | BOZUK | `page.tsx:632-642`, `184` | DB'ye yazılıyor ama `update()` yalnız `{name, image}` gönderiyor; JWT'deki `preferredLanguage` değişmiyor (`lib/auth.ts:272-280`), `lib/app-locale.tsx:24-29` ayrıca localStorage'ı öncelikliyor. Arayüz dili değişmez. |
| 27 | Tatil modu anahtarı | SAHTE | `page.tsx:643-659`; tüketici yok | Metin "Müşterileriniz bunu uygulamanızda görecektir" diyor (`messages/tr.json` `dealerSettings.holidayModeDescription`), ama `holidayMode` hiçbir yerde okunmuyor. |
| 28 | "Değişiklikleri kaydet" (profil) | KISMİ | `page.tsx:161-195`, `660-663` | Avatar + kişisel + işletme kartlarının tümünü tek butonla kaydediyor; sunucu hata mesajı gösterilmiyor; kirli-durum / kaydedilmemiş değişiklik uyarısı yok. |
| 29 | Otomasyon kartı → otomatik yanıt kuralları bağlantısı | ÇALIŞIYOR | `page.tsx:667-687` | Hedef sayfa mevcut (`app/dealer/settings/auto-replies/page.tsx`). |
| 30 | E-posta bildirimleri (3 anahtar) | SAHTE | `page.tsx:141-147`, `715-730` | State sabit `true` başlıyor, hiçbir yerden yüklenmiyor, hiçbir yere yazılmıyor. |
| 31 | Push bildirimleri (2 anahtar) | SAHTE | `page.tsx:741-755` | Aynı; tarayıcı push aboneliği de istenmiyor. |
| 32 | "Ayarları kaydet" (bildirim) | SAHTE | `page.tsx:291-297` | `setTimeout(1000)` sonra başarı toast'ı; ağ çağrısı yok. |
| 33 | 2FA durum gösterimi | KISMİ | `components/auth/two-factor-settings.tsx:25-34`, `137-147` | GET başarısızsa `status=null` → 2FA açık olan kullanıcıya "Etkinleştir" butonu gösterilir (sunucu `2FA zaten aktif` diye reddeder). |
| 34 | 2FA kurulumu (QR + secret) | ÇALIŞIYOR | `two-factor-settings.tsx:36-53`, `156-176` | Metinler sabit Türkçe (i18n dışı). |
| 35 | 2FA doğrula ve etkinleştir | ÇALIŞIYOR | `two-factor-settings.tsx:55-80` | |
| 36 | Kurtarma kodları gösterimi + kopyala | ÇALIŞIYOR | `two-factor-settings.tsx:123-135` | İndirme/yazdırma seçeneği yok. |
| 37 | 2FA devre dışı bırak | KISMİ | `two-factor-settings.tsx:82-102` | Yerel `prompt()` kullanıyor; erişilebilirlik ve PWA standalone modunda kötü deneyim. |
| 38 | Mevcut şifre + göster/gizle | ÇALIŞIYOR | `page.tsx:791-812` | |
| 39 | Yeni şifre + göster/gizle | ÇALIŞIYOR | `page.tsx:813-831` | |
| 40 | Şifre gücü çubuğu | ÇALIŞIYOR | `page.tsx:367-382`, `832-849` | Renk + metin birlikte; `aria-live` yok. |
| 41 | Şifre tekrarı + eşleşme göstergesi | ÇALIŞIYOR | `page.tsx:851-871` | |
| 42 | Şifreyi güncelle | KISMİ | `page.tsx:299-332`, `app/api/user/password/route.ts:13-88` | Hız sınırı ve bcrypt doğrulaması var; ancak diğer oturumlar (JWT) geçersiz kılınmıyor, e-posta ile haber verilmiyor. |
| 43 | OAuth kullanıcısı için ilk şifre oluşturma | ÇALIŞIYOR | `page.tsx:334-363`, `app/api/user/initial-password/route.ts:18-74` | Hız sınırı ve yeniden doğrulama yok; uzunluk üst sınırı 128 iken değiştirme ucunda 200 (tutarsız). |
| 44 | Panel düzeni yükleme | ÇALIŞIYOR | `page.tsx:127-138`, `app/api/dealer/dashboard-layout/route.ts:32-59` | Widget etiketleri sunucuda sabit Türkçe (`route.ts:22-30`). |
| 45 | Widget görünürlük anahtarı | ÇALIŞIYOR | `page.tsx:920-927` | State yerinde mutasyonla değişiyor (`newWidgets[index].visible = checked`); `Switch`'te `aria-label` yok. |
| 46 | Widget yukarı/aşağı taşıma | ÇALIŞIYOR | `page.tsx:931-958` | İkon butonlarda `aria-label` yok; sürükle-bırak yok; önizleme yok. |
| 47 | "Görünümü kaydet" | KISMİ | `page.tsx:964-983` | Panel `['dealer','dashboard-layout']` sorgusu 5 dk `staleTime` ile önbellekte (`app/dealer/dealer-dashboard-client.tsx:178-186`) ve geçersiz kılınmıyor; ayrıca benchmark widget'ı kayboluyor (Bulgu B5). |
| 48 | Erişilebilirlik anahtarları (yüksek kontrast / animasyon azalt / renk körü) | KISMİ | `page.tsx:989-993`, `components/settings/accessibility-toggles.tsx:20-92` | Anında uygulanıyor ve localStorage'da tutuluyor (cihaz bazlı, hesaba bağlı değil); metinler sabit Türkçe; "Animasyonları azalt" yalnız CSS'i etkiliyor (`app/globals.css:825-832`), framer-motion JS animasyonlarını durdurmuyor. |
| 49 | Sekme içerik giriş animasyonu | ÇALIŞIYOR | `page.tsx:417-421`, `693-696`, `770-774`, `899` | Ölçülü; `MotionConfig reducedMotion="user"` OS tercihine uyuyor (`components/providers.tsx:232`). |
| 50 | Profil yükleniyor durumu | EKSİK | `page.tsx:89-139` | Form boş alanlarla açılıyor, Kaydet etkin. |
| 51 | Hata durumu / yeniden dene | EKSİK | `page.tsx:121-123`, `135` | Boş `catch`. |
| 52 | Kaydedilmemiş değişiklik uyarısı | EKSİK | — | |
| 53 | İşletme logosu yükleme | EKSİK | `prisma/schema.prisma:84` | `businessLogo` müşteri tarafında okunuyor (`app/api/customer/favorites/route.ts:45` vb.) ama bayi tarafında yazan hiçbir uç yok. |
| 54 | Veri dışa aktarma / hesap silme (KVKK) | EKSİK | `app/api/user/data-export/route.ts:12`, `app/api/user/delete-account/route.ts:17` | API'ler DEALER'a açık; hazır `components/settings/privacy-security.tsx` bileşeni hiçbir sayfada kullanılmıyor (yetim). |
| 55 | Aktif oturumlar / giriş geçmişi | EKSİK | — | `AuditLog` (`CHANGE_PASSWORD`, `UPDATE_PROFILE`) var ama gösterilmiyor. |

Toplam: 55 özellik — ÇALIŞIYOR 26 · KISMİ 15 · BOZUK 2 · SAHTE 6 · EKSİK 6.

---

## Bulgular

### B1 — Profil yüklenmeden/yüklenemeden kaydedilirse işletme verisi silinir
- **Önem:** kritik · **Kategori:** veri bütünlüğü · **Efor:** S
- **Kanıt:** `page.tsx:71-87` (başlangıç state: `businessName: ''`, `phone: '+90 555 123 4567'`), `page.tsx:98-124` (GET hatası sessizce yutuluyor), `page.tsx:164-181` (PATCH `businessName: profile.businessName || null` vb.), `app/api/user/profile/route.ts:48-57` (`null` gelen her alan yazılır).
- **Sorun:** GET `/api/user/profile` yavaşken, başarısız olduğunda veya Neon geçici erişilemezken form boş değerlerle görünür ve "Değişiklikleri kaydet" etkindir. Bayi yalnızca avatarını değiştirip kaydetse bile `businessName`, `address`, `businessDesc`, `latitude/longitude`, `businessHours`, `defaultReplyTemplate` `null` olarak yazılır, telefon da sahte `+90 555 123 4567` değeriyle kalıcılaşır. İşletme adının silinmesi onboarding'i geri "tamamlanmamış"a düşürür ve keşif sayfasından konum kaybolur.
- **Öneri:** Profil verisini React Query ile yükleyin (`useQuery(['me','profile'])`), `isLoading` sırasında iskelet gösterin ve form/Kaydet'i devre dışı bırakın; `isError` durumunda "Profil yüklenemedi — yeniden dene" kartı gösterin, formu hiç açmayın. Formu `react-hook-form` + `zod` ile kurun ve PATCH'e yalnız **değişen alanları** (`dirtyFields`) gönderin — sunucu zaten kısmi güncellemeyi destekliyor (`route.ts:48-57`). Sahte telefon varsayılanını kaldırın.

### B2 — Oturum yenilendiğinde düzenlenmekte olan form ve panel düzeni sunucu değerleriyle eziliyor
- **Önem:** yüksek · **Kategori:** veri kaybı / durum yönetimi · **Efor:** S
- **Kanıt:** `page.tsx:89-139` (`useEffect(..., [session])` içinde `loadProfile` + `loadWidgets`), `components/providers.tsx:220` (`<SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus>`), `page.tsx:184` (`update()` de oturumu değiştirir).
- **Sorun:** next-auth her pencere odağında ve 5 dakikada bir oturumu yeniden çeker; yeni `session` nesnesi efekti yeniden tetikler ve `setProfile` tüm alanları sunucu değeriyle değiştirir, `setDashboardWidgets` de sıralamayı sıfırlar. Bayi uzun bir işletme açıklaması yazarken başka sekmeye geçip dönerse yazdıkları kaybolur. (Kod okunarak çıkarıldı; tarayıcıda doğrulanmadı.)
- **Öneri:** Veri yüklemeyi `session?.user?.id`'ye bağlayın (nesneye değil) veya React Query'ye taşıyıp `refetchOnWindowFocus: false` ile formu "ilk yükleme → yerel taslak" modeline geçirin. Form `reset()` yalnız ilk başarılı yüklemede ve başarılı kayıttan sonra çağrılmalı.

### B3 — Bildirimler sekmesinin tamamı sahte
- **Önem:** yüksek · **Kategori:** sahte özellik · **Efor:** M
- **Kanıt:** `page.tsx:141-147` (sabit `true` state), `page.tsx:291-297` (`setTimeout(() => { … toast.success(...) }, 1000)`), `page.tsx:715-762`.
- **Sorun:** 5 anahtar hiçbir yerden okunmuyor ve hiçbir yere yazılmıyor; "Bildirim ayarları güncellendi!" toast'ı kullanıcıyı yanıltıyor. Sayfa yenilenince her şey yeniden açık görünür. Oysa projede gerçek bir tür×kanal tercih altyapısı var: `User.notificationPrefs` (`prisma/schema.prisma` User modeli), `lib/notification-prefs.ts` (app/email/push kanalları, `isChannelEnabled`), `lib/notify-prefs-server.ts`, `lib/team-notify.ts:34-35`; müşteri ayarları bunu kullanıyor (`app/api/customer/settings/route.ts:216-236`). Ayrıca "haftalık rapor" ve "kritik uyarı" tercihleri `/dealer/ai-settings` içinde ayrıca gerçek olarak tutuluyor (`app/api/dealer/ai-settings/route.ts:26-30`) — aynı kavram iki yerde.
- **Öneri:** `NOTIFICATION_GROUPS`'a bayi grupları ekleyin (`feedback-new`, `feedback-negative`, `weekly-brief`, `incident`, `team`) ve bildirim üreten kodda `kindToGroup` eşlemesini tamamlayın. Bayi için `GET/PATCH /api/dealer/notification-prefs` (müşteri ucundaki birleştirme mantığını paylaşan bir helper ile) yazın. UI'ı tür (satır) × kanal (Uygulama / E-posta / Push sütunu) matrisi olarak kurun; Push sütunu `hooks/use-push-notifications.ts` ile tarayıcı izni ve abonelik durumunu göstersin. `ai-settings`'teki `weeklyReportEnabled/alertOn*` alanlarını bu matrise taşıyın ya da oradan tek kaynaklı okuyun. Değişiklikler anahtar başına iyimser (optimistic) kaydedilsin; ayrı "Kaydet" butonu kaldırılsın.

### B4 — Tatil modu, çalışma saatleri ve varsayılan yanıt şablonu kaydediliyor ama hiçbir yerde kullanılmıyor
- **Önem:** yüksek · **Kategori:** sahte özellik / yanıltıcı vaat · **Efor:** L
- **Kanıt:** `holidayMode`, `businessHours`, `defaultReplyTemplate` yalnız `app/dealer/settings/page.tsx` ve `app/api/user/profile/route.ts`'te geçiyor (geniş grep, `node_modules`/`generated` hariç). Tatil modu metni: "Müşterileriniz bunu uygulamanızda görecektir" (`messages/tr.json` → `dealerSettings.holidayModeDescription`). Şema `businessHours` için JSON biçimi tanımlıyor (`prisma/schema.prisma:89`), UI serbest metin topluyor (`page.tsx:614-620`).
- **Sorun:** Bayi tatil modunu açtığında müşteri tarafında hiçbir şey değişmiyor; QR geri bildirim formu, keşif ve favoriler işletmeyi açık gösteriyor. Çalışma saatleri keşif/"şu an açık" gibi bir yerde görünmüyor; varsayılan yanıt şablonu yanıt bestecisine gelmiyor. Bu, kıyas ürünlerde (Google Business Profile "geçici olarak kapalı", Yelp "saatler") temel ve görünür özellikler.
- **Öneri:** (a) Kısa vadede: tüketicisi olmayan alanları gizleyin veya "yakında" rozetiyle salt okunur yapın — yanıltıcı vaat kaldırılmalı. (b) Gerçek uygulama: `businessHours`'ı yapılandırılmış veri olarak (gün × aralık listesi + özel günler/tatiller) toplayan bir saat düzenleyici bileşen yazın, `lib/business-hours.ts` içinde `isOpenNow(tz)` yardımcıyı paylaşın; keşif/yakınımdakiler kartında "Açık / 18:00'de kapanır" gösterin. Tatil modunu bitiş tarihli (`holidayUntil`) yapın; QR herkese açık uç (`app/api/qr-codes/public/[code]/route.ts`) ve keşif uçları bu bayrağı okuyup "Geçici olarak kapalı" şeridi göstersin, kampanya/flash teklif üretimini duraklatsın. Varsayılan yanıt şablonunu geri bildirim yanıt bestecisinde "Şablonu ekle" olarak sunun ve `{{müşteri_adı}}`, `{{işletme}}` değişkenlerini destekleyin; ideal olarak `/dealer/settings/auto-replies` ile tek "Yanıt şablonları" kütüphanesinde birleştirin.

### B5 — Panel düzeni API'si benchmark widget'ını kalıcı olarak gizliyor
- **Önem:** yüksek · **Kategori:** hata (çapraz sayfa) · **Efor:** S
- **Kanıt:** `app/api/dealer/dashboard-layout/route.ts:22-30` (`DEFAULT_WIDGETS` içinde `benchmark-comparison` yok), `route.ts:44-50` (yanıt yalnız `DEFAULT_WIDGETS` üzerinden eşleniyor), `app/dealer/dealer-dashboard-client.tsx:188-197` (istemci yedeğinde `benchmark-comparison` var), `dealer-dashboard-client.tsx:961` (render koşulu).
- **Sorun:** Düzen API'si başarıyla yanıt verdiği sürece (yani normalde her zaman) panel `benchmark-comparison` widget'ını hiç almıyor ve göstermiyor; ayarlar sayfasında da bu widget listelenmediği için açılamıyor. Ayrıca PUT, widget `id`'leri için izin listesi uygulamıyor (`route.ts:10-20`), GET ise bilinmeyenleri sessizce düşürüyor.
- **Öneri:** Widget kataloğunu tek bir paylaşılan modüle taşıyın (`lib/dealer-dashboard-widgets.ts`: `id`, i18n `labelKey`, varsayılan sıra, gerekli plan) ve hem API, hem panel, hem ayarlar sayfası bunu kullansın. PUT'ta `z.enum(WIDGET_IDS)` ile doğrulayın. Etiketleri sunucuda değil istemcide `t(labelKey)` ile çevirin.

### B6 — Dil tercihi kaydediliyor ama arayüze yansımıyor
- **Önem:** yüksek · **Kategori:** hata · **Efor:** S
- **Kanıt:** `page.tsx:184` (`update({ name, image })` — `preferredLanguage` yok), `lib/auth.ts:272-280` (JWT yalnız açıkça gönderilen alanları günceller), `lib/app-locale.tsx:22-29` (dil önce localStorage'dan, sonra oturumdan okunur). Müşteri ayarları bunu doğru yapıyor: `app/customer/settings/page.tsx:431`.
- **Sorun:** Bayi "English"i seçip kaydettiğinde DB değişir ama arayüz Türkçe kalır; yeniden giriş yapsa bile daha önce dil değiştiricisi kullandıysa localStorage değeri kazanır. Ayrıca alan "İşletme bilgileri" kartında duruyor — arayüz dili mi, müşteriye yönelik iletişim dili mi olduğu belirsiz.
- **Öneri:** Kayıtta `update({ preferredLanguage })` çağırın ve `useAppLocale().setLocale()` ile anında uygulayın. Dil seçimini "Tercihler" bölümüne taşıyın ve iki kavramı ayırın: "Panel dili" (kullanıcıya özel) ve "Müşteri iletişim dili / varsayılan yanıt dili" (işletmeye özel).

### B7 — Şifre değişikliği diğer oturumları kapatmıyor; ilk şifre ucu korumasız
- **Önem:** orta · **Kategori:** güvenlik · **Efor:** M
- **Kanıt:** `lib/auth.ts:61` (`strategy: 'jwt'`, varsayılan 24 sa), `app/api/user/password/route.ts:66-80` (yalnız hash güncelleniyor), `app/api/user/initial-password/route.ts:18-54` (hız sınırı yok, yeniden kimlik doğrulama yok).
- **Sorun:** Şifresi çalındığı için şifresini değiştiren bayinin, saldırganın elindeki JWT'si süresi dolana kadar geçerli kalır. OAuth hesabında ele geçirilmiş bir oturum, ilk-şifre ucu ile kalıcı bir parola kimliği ekleyebilir. Şifre değişikliği hesap sahibine e-posta ile bildirilmiyor.
- **Öneri:** `User.sessionVersion Int @default(0)` ekleyin; şifre değişiminde artırın ve `jwt` callback'inde (mevcut token-replay Redis katmanıyla birlikte) uyuşmayan token'ları reddedin. Güvenlik sekmesine "Diğer tüm oturumlardan çıkış yap" butonu ekleyin. İlk-şifre ucuna `checkRateLimitDb` ve 2FA etkinse TOTP doğrulaması ekleyin. Her iki işlemde mevcut mail altyapısıyla "Şifreniz değiştirildi" bildirimi gönderin. Şifre uzunluk sınırlarını (128/200) tek sabitte birleştirin.

### B8 — Ad alanı boşsa tüm profil kaydı başarısız; sunucu hata mesajları gösterilmiyor
- **Önem:** orta · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** `app/api/user/profile/route.ts:12` (`name: z.string().min(2)`), `page.tsx:168` (`name: profile.name` her zaman gönderiliyor), `page.tsx:187-189` (yanıt gövdesi okunmadan jenerik `profileUpdateError`).
- **Sorun:** Adı olmayan (veya tek karakter) kullanıcı hiçbir alanı kaydedemez ve nedenini öğrenemez. Aynı şekilde 500 karakteri aşan açıklama veya aralık dışı koordinat da jenerik "güncellenemedi" ile sonuçlanır. Zod mesajları İngilizce (`String must contain at least 2 character(s)`) — gösterilse bile dil karışır.
- **Öneri:** İstemci tarafında aynı zod şemasını (`lib/schemas/dealer-profile.ts` olarak paylaşın) alan bazında satır içi hata olarak gösterin; `Textarea`'lara `maxLength` + karakter sayacı ekleyin. Sunucu `fieldErrors` döndürsün, istemci bunları ilgili alana bağlasın.

### B9 — Kayıt anlambilimi tutarsız: GPS anında kaydediyor, gerisi tek uzak butona bağlı
- **Önem:** orta · **Kategori:** UX · **Efor:** M
- **Kanıt:** `page.tsx:247` (`persistGpsToProfile` anında PATCH), `page.tsx:282` ("Koordinattan adres bul" yalnız formu değiştirir), `page.tsx:660-663` (avatar + kişisel bilgiler + işletme bilgileri için tek Kaydet, üçüncü kartın en altında), `page.tsx:59` (dört sekmede paylaşılan tek `saving` bayrağı — profil kaydedilirken şifre butonu "Güncelleniyor" der).
- **Sorun:** Kullanıcı neyin kaydedildiğini bilemez: avatarı seçince toast "kaydetmeyi unutmayın" der ama Kaydet butonu iki kart aşağıda; GPS ise elle yazılmış adresi sorgusuz ezip kaydeder.
- **Öneri:** Her bölüme kendi kayıt alanını verin (bölüm başına "Kaydet / Vazgeç" alt çubuğu) veya sayfa genelinde kirli durum algılayan yapışkan bir "Kaydedilmemiş değişiklikler — Kaydet / Geri al" çubuğu kullanın (Shopify/Stripe ayar deseni). GPS sonucu önce bir onay kartında ("Bu adresi kullan?" + harita önizlemesi) gösterilsin, kayıt kullanıcı onayıyla yapılsın. `saving` durumunu bölüm başına ayırın; `beforeunload` ve rota değişiminde uyarı ekleyin.

### B10 — Erişilebilirlik açıkları (sekme adları, modal, etiketler, ikon butonlar)
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `page.tsx:397-412` (mobilde metin `hidden`, `aria-label` yok), `page.tsx:999-1081` (elle modal: `role`, `aria-modal`, focus trap, Esc yok), `page.tsx:601, 613, 623, 633` (`Label` `htmlFor` yok), `page.tsx:725, 750, 920` (`Switch`'ler isimsiz), `page.tsx:931-958, 1025` (ikon butonlar `aria-label`'sız), `page.tsx:434-441` (odakta görünmeyen kamera katmanı), `page.tsx:1062` (tüm avatarlar `alt="Avatar"`), `components/auth/two-factor-settings.tsx:83` (`prompt()`).
- **Sorun:** Ekran okuyucu kullanıcısı mobilde dört isimsiz sekme, isimsiz anahtarlar ve "button" diye okunan ok butonları duyar; avatar modalında odak arka plana kaçar.
- **Öneri:** Sekmelerde `aria-label` veya `sr-only` metin; avatar seçici için `components/ui/dialog.tsx` (Radix) kullanın ve ızgarayı `role="radiogroup"` + ok tuşu gezinmesi olarak kurun; her `Switch`'e `aria-labelledby` ile satır başlığını bağlayın; sıralama butonlarına "{widget} yukarı taşı" etiketleri ve `aria-live` duyurusu ekleyin; 2FA kapatmayı TOTP giriş alanlı bir `AlertDialog`'a çevirin.

### B11 — Panel düzeni kaydı panel önbelleğini geçersiz kılmıyor
- **Önem:** düşük · **Kategori:** durum tutarlılığı · **Efor:** S
- **Kanıt:** `page.tsx:964-977` (ham `fetch` PUT), `app/dealer/dealer-dashboard-client.tsx:178-186` (`staleTime: 5 * 60_000`).
- **Sorun:** İstemci içi gezinmede bayi panele döndüğünde 5 dakikaya kadar eski düzeni görür ve ayarın işe yaramadığını düşünür.
- **Öneri:** Kaydı `useMutation` ile yapın ve `onSuccess`'te `queryClient.setQueryData(['dealer','dashboard-layout'], widgets)`; daha iyisi düzen düzenlemeyi doğrudan panelin üzerinde "Düzenle" moduna taşıyın (aşağıdaki vizyona bakın).

### B12 — Ters geokod ucu önbelleksiz ve hız sınırsız (Nominatim kullanım politikası riski)
- **Önem:** düşük · **Kategori:** güvenilirlik · **Efor:** S
- **Kanıt:** `app/api/location/reverse/route.ts:32-48` (her istek doğrudan Nominatim'e, `cache: 'no-store'`, kullanıcı başı sınır yok, `accept-language` sabit `tr`).
- **Sorun:** Nominatim saniyede 1 istek ve önbellek bekliyor; herhangi bir oturum sahibi ucu döngüye alarak uygulamanın sunucu IP'sini engelletebilir. EN arayüzde adres Türkçe döner.
- **Öneri:** Koordinatları ~5 ondalığa yuvarlayıp Upstash Redis'te 30 gün önbelleğe alın, `checkRateLimitDb('geocode:'+userId, 10, 60_000)` ekleyin, `accept-language`'ı kullanıcının diline bağlayın.

### B13 — Avatar alanı serbest URL kabul ediyor; varsayılan avatar sessizce kalıcılaşıyor
- **Önem:** düşük · **Kategori:** girdi doğrulama · **Efor:** S
- **Kanıt:** `app/api/user/profile/route.ts:13` (`image: z.string().max(2048)`), `page.tsx:95` (resim yoksa `BAYİ AVATAR ERKEK 1.svg` atanıyor ve `page.tsx:169` ile kaydediliyor).
- **Sorun:** API doğrudan çağrılarak harici (izleme pikseli içeren) bir URL avatar olarak atanabilir; bu görsel başka kullanıcılara gösterildiği yerlerde dış istek üretir (gösterim yüzeyi doğrulanmadı). Seçim yapmamış bayiye ilk kayıtta erkek avatarı atanır.
- **Öneri:** `image`'ı `avatarList` izin listesi veya kendi R2 alan adınızla sınırlayın; varsayılan atamayı kaldırıp baş harf fallback'ini kullanın.

### B14 — i18n tutarsızlığı ve kod kalitesi
- **Önem:** düşük · **Kategori:** mimari / i18n · **Efor:** M
- **Kanıt:** `components/auth/two-factor-settings.tsx:115-172` ve `components/settings/accessibility-toggles.tsx:52-71` (sabit Türkçe), `lib/avatar-options.ts:3-107` (kategori adları), `app/api/dealer/dashboard-layout/route.ts:23-29` (Türkçe etiketler), `page.tsx:68` (`useState<any[]>`), `page.tsx:924` (state mutasyonu), `page.tsx:135` (boş `catch`), `page.tsx` toplam 1084 satır tek bileşen.
- **Öneri:** Sayfayı sekme başına bileşenlere bölün (`components/dealer/settings/{profile,business,notifications,security,appearance}-section.tsx`), paylaşılan `useDealerProfile()` hook'u ve tipli `DashboardWidget` arayüzü kullanın; tüm metinleri `t()`'ye taşıyın.

### B15 — Uygulama içi "Animasyonları azalt" framer-motion'ı etkilemiyor
- **Önem:** düşük · **Kategori:** erişilebilirlik / motion · **Efor:** S
- **Kanıt:** `app/globals.css:825-832` (yalnız CSS `animation/transition` süreleri), `components/providers.tsx:232` (`MotionConfig reducedMotion="user"` yalnız OS tercihini izler).
- **Sorun:** Bu sayfadaki sekme geçişleri, modal ölçek animasyonu ve avatar `whileHover/whileTap` efektleri, kullanıcı uygulama içinde "Animasyonları azalt"ı açsa bile çalışmaya devam eder.
- **Öneri:** `MotionConfig`'in `reducedMotion` değerini `readAccessibilityPrefs().reduceAnimations ? 'always' : 'user'` olacak şekilde `AccessibilityClassSync` ile senkronlayın (global düzeltme; tüm panelleri etkiler).

---

## Eksik özellikler (kıyas ürünlerle)

1. **Yapılandırılmış çalışma saatleri + özel günler + "geçici kapalı" (bitiş tarihli)** — Google Business Profile ve Yelp for Business'ın temel profil alanı; müşteri tarafında "Şu an açık" rozeti olarak görünmeli. Şu an serbest metin ve hiç kullanılmıyor.
2. **İşletme logosu ve kapak görseli yükleme + profil önizlemesi** — `businessLogo` müşteri kartlarında okunuyor ama bayi yükleyemiyor. Square/Toast/GBP "müşterinin gördüğü haliyle önizle" sunar.
3. **Gerçek bildirim matrisi (tür × kanal) + sessiz saatler + özet sıklığı** — Medallia/Qualtrics'te uyarı kuralları (ör. "puan ≤ 2 ise anında", "günlük özet 09:00"), Square'de kanal bazlı tercih. Mevcut `notificationPrefs` altyapısı üzerine kurulabilir.
4. **Ekip/çoklu kullanıcı ve konum kapsamı** — Toast/Square'de ayarlar "İşletme" (paylaşılan) ve "Hesabım" (kişisel) olarak ayrılır; burada işletme alanları kişisel `User` satırında, personel (STAFF) ayrımı yok. En azından "İşletme" ve "Hesap" bölümleri bilgi mimarisinde ayrılmalı.
5. **Güvenlik merkezi: aktif oturumlar, giriş geçmişi, tüm cihazlardan çıkış, şifre değişikliği e-postası** — Google/Square standardı; `AuditLog` verisi zaten mevcut.
6. **KVKK/GDPR: veri dışa aktarma ve hesap kapatma** — API'ler DEALER'a açık, hazır `PrivacySecuritySettings` bileşeni yetim; aboneliği olan bayi için "hesabı kapat" Stripe iptaliyle birlikte ele alınmalı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi ayarlara girdiğinde "müşterim beni nasıl görüyor?" sorusunun cevabını ve hesabının güvenlik durumunu tek bakışta görür; her değişiklik ya anında (anahtarlar) ya da açık bir kirli-durum çubuğuyla (formlar) kaydedilir, hiçbir şey sessizce kaybolmaz veya sahte onay vermez.

**Yerleşim (masaüstü):** Sol tarafta sabit dikey bölüm gezinmesi (URL ile senkron: `/dealer/settings?section=business`), sağda içerik. Bölümler:
1. **İşletme profili** — ad, kategori, açıklama (sayaçlı), logo/kapak yükleme (R2), iletişim; sağ sütunda canlı "müşteri kartı önizlemesi" (keşif kartı + QR form başlığı bileşenleri yeniden kullanılarak).
2. **Konum ve saatler** — adres arama (otomatik tamamlama), haritada sürüklenebilir pin (Leaflet + OSM karoları, `ssr:false` ile kod bölünmüş), GPS sonucu onay kartıyla; haftalık saat düzenleyici (gün satırı × aralık çipleri, "tümüne kopyala"), özel günler ve bitiş tarihli "Geçici olarak kapalı" anahtarı.
3. **Yanıt ve iletişim** — müşteri iletişim dili, yanıt şablonları kütüphanesi (`auto-replies` ile birleşik), imza.
4. **Bildirimler** — tür × kanal matrisi, push izin durumu, sessiz saatler, haftalık özet günü/saati.
5. **Hesabım** — ad, avatar (Radix Dialog içinde radiogroup), panel dili, e-posta değiştirme (doğrulama mailiyle).
6. **Güvenlik** — durum özeti kartı ("2FA açık · son şifre değişikliği 34 gün önce"), 2FA, şifre, aktif oturumlar, giriş geçmişi.
7. **Görünüm ve erişilebilirlik** — tema, erişilebilirlik tercihleri (hesaba bağlı kalıcılık), panel düzenine "Panelde düzenle" kısayolu.
8. **Veri ve gizlilik** — dışa aktarma, hesap kapatma (çift onaylı, abonelik uyarısıyla).

Mobilde sol gezinme yatay kaydırılabilir çip şeridine veya "ayarlar ana listesi → alt sayfa" (iOS Ayarlar deseni) yapısına dönüşür; kirli-durum çubuğu alt güvenli alana (`env(safe-area-inset-bottom)`) yapışır.

**Motion/3D önerisi (ölçülü):** 3D'ye gerek yok — burası bir yapılandırma yüzeyi, sakinlik ve öngörülebilirlik öncelikli. Önerilenler: bölüm geçişinde 150 ms opaklık geçişi (mevcut `y:10` kaydırması yeterli, büyütülmemeli); kirli-durum çubuğunun alttan `layout` animasyonuyla girişi; kayıt başarısında buton içinde kısa bir onay işareti morph'u (toast yerine yerinde geri bildirim); widget sıralamasında `Reorder.Group` ile sürükle-bırak ve `layout` animasyonu. Tüm bunlar `MotionConfig` üzerinden hem OS hem uygulama içi "animasyonları azalt" tercihine uymalı (B15).

**Veri / API değişiklikleri:**
- `GET/PATCH /api/dealer/profile` (DEALER'a özel, alan bazlı zod, `fieldErrors`, yalnız değişen alanlar); `/api/user/profile` kişisel alanlarla sınırlansın.
- `businessHours` → yapılandırılmış JSON (`{ weekly: {mon:[{open,close}]...}, exceptions: [{date, closed|ranges}] , tz }`), `holidayUntil DateTime?`; okuyucular: QR herkese açık uç, keşif/yakınımdakiler, flash teklif üretimi.
- `POST /api/dealer/branding` (R2'ye logo/kapak yükleme, boyut/tür doğrulaması, `businessLogo` + yeni `businessCover`).
- `GET/PATCH /api/dealer/notification-prefs` (`lib/notification-prefs.ts` genişletilerek), `ai-settings` uyarı bayraklarının buraya taşınması.
- `User.sessionVersion` + `POST /api/user/sessions/revoke-all`; `GET /api/user/security-activity` (AuditLog'dan son 20 olay).
- Paylaşılan `lib/dealer-dashboard-widgets.ts` kataloğu (B5).
- İstemci: React Query (`['dealer','profile']`, `['dealer','notification-prefs']`), `react-hook-form` + paylaşılan zod şemaları, bölüm başına bileşenler.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/ai-settings`** — "Haftalık rapor" ve "kritik uyarı" (toksik/acil/churn) tercihleri orada gerçek olarak tutuluyor (`app/api/dealer/ai-settings/route.ts:26-30`), bu sayfadaki sahte `emailWeekly` / `emailAlerts` / `pushAlerts` anahtarlarıyla aynı kavram. Bildirim teslim tercihleri (kanal, sıklık) **bu sayfada**, AI'ın neyi tespit edeceği (modüller, eşikler) **ai-settings'te** kalmalı; çift kaynak kaldırılmalı.
- **`/dealer/settings/auto-replies`** — "Varsayılan yanıt şablonu" alanı (ölü veri) ile otomatik yanıt kuralları aynı alanın parçası; tek bir "Yanıtlar" bölümünde (şablon kütüphanesi + kurallar) birleştirilmeli.
- **`/dealer` (panel)** — "Görünüm" sekmesindeki widget düzenleyici, panelin kendisinde "Düzeni düzenle" modu olarak daha doğal; ayarlarda yalnız "varsayılana sıfırla" kısayolu kalabilir.
- **`/dealer/onboarding`** — Profil ve konum adımları bu sayfaya derin bağlantı olmadan yönleniyor; bölüm parametreli URL'ler (`?section=location`) ile onboarding doğrudan ilgili bölümü açmalı.
- **`/customer/settings` ve `components/settings/privacy-security.tsx`** — Güvenlik, erişilebilirlik ve gizlilik blokları roller arasında paylaşılan bileşenlere çekilmeli; yetim `PrivacySecuritySettings` bayi ayarlarında yeniden kullanılabilir.
- Sayfa **kaldırılmamalı**: bayi panelinin tek hesap/işletme profili yüzeyi ve onboarding'in hedefi.

---

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışılarak kod baştan okundu (sayfa, çağrılan API'ler, `lib/auth.ts`, `lib/app-locale.tsx`, `components/providers.tsx`, `node_modules/next-auth` v4.24.15 istemci kaynağı, panel istemcisi). Tarayıcıda çalıştırma yapılmadı; kararlar kod okumasına dayanır.

### 1. Profil GET başarısız/yavaşken Kaydet tüm işletme alanlarını siler ve sahte telefonu yazar — **DOĞRULANDI**
- Başlangıç state'i `phone: '+90 555 123 4567'` ve boş işletme alanları (`app/dealer/settings/page.tsx:71-87`). GET hatası sessizce yutuluyor (`:102`, `:121-123`), yükleme bayrağı yok.
- Kaydet butonu yalnız `saving` ile kilitli (`:660`); GET bitmeden veya başarısız olduktan sonra tıklanabilir.
- `handleSaveProfile` boş alanları `null` gönderiyor (`:170-177`); API `typeof x !== 'undefined'` kontrolüyle `null`'ı yazıyor (`app/api/user/profile/route.ts:48-57`).
- Etki zinciri doğrulandı: onboarding `businessName` ve `address`/`latitude` ile hesaplanıyor (`app/api/dealer/onboarding/route.ts:39-40`), keşif `latitude: { not: null }` filtresiyle bayiyi listeliyor (`app/api/customer/discovery/route.ts:337`).
- Yeniden üretim: DB geçici olarak erişilemezken (`responseIfDatabaseUnavailable` → 503) ya da yavaş bağlantıda sayfayı aç → ad alanını düzelt → Kaydet. Sonuç: `businessName/address/businessDesc/latitude/longitude/businessHours/defaultReplyTemplate = NULL`, `phone = '+90 555 123 4567'`, `holidayMode = false`; bayi keşiften düşer, onboarding geri açılır.

### 2. `useEffect([session])` oturum yenilendiğinde kaydedilmemiş düzenlemeleri eziyor — **DOĞRULANDI**
- `SessionProvider refetchInterval={5*60} refetchOnWindowFocus` (`components/providers.tsx:220`). next-auth v4.24.15 istemcisi her `visibilitychange` olayında ve aralıkta `getSession()` ile yeni nesne alıp `setSession(...)` çağırıyor (`node_modules/next-auth/react/index.js:412-419`, `:454-481`); derin eşitlik kontrolü yok, referans her seferinde değişiyor.
- Efekt bağımlılığı `[session]` (`page.tsx:139`): önce ad/avatarı session'dan yazıyor (`:91-96`), sonra GET ile tüm profil alanlarını (`:104-120`) ve widget listesini (`:133`) sunucu değerleriyle değiştiriyor.
- Yeniden üretim: işletme açıklamasını yaz veya avatar seç (kaydetme) → başka sekmeye geç ve geri dön → taslak sunucudaki değere döner. 5 dakikalık aralıkta sekmeden ayrılmadan da olur. (Kod + kütüphane kaynağıyla kesin; tarayıcıda gözlemlenmedi.)

### 3. Bildirim tercihleri kaydı sahte — **DOĞRULANDI**
- `handleSaveNotifications` yalnız `setTimeout` + `toast.success` (`page.tsx:291-297`); `notifications` state'i sabit başlangıçlı (`:141-147`), hiçbir uçtan okunmuyor ve yazılmıyor.
- Gerçek altyapı var ama bu sayfa kullanmıyor: `User.notificationPrefs` (`prisma/schema.prisma:46`), `lib/notification-prefs.ts`, `lib/notify-prefs-server.ts`, müşteri tarafı `app/api/customer/settings/route.ts:216-222`.
- Yeniden üretim: tüm anahtarları kapat → Kaydet → "güncellendi" tostu → sayfayı yenile → hepsi yine açık; e-posta/push gönderimi değişmez.

### 4. Tatil modu müşteriye gösteriliyor iddiası yanlış; alan ölü veri — **DOĞRULANDI**
- Tüm `*.ts/*.tsx` içinde `holidayMode` / `businessHours` / `defaultReplyTemplate` yalnızca `app/dealer/settings/page.tsx` ve `app/api/user/profile/route.ts`'te geçiyor (grep; `lib/intern-task-emails.ts`'teki "tatil" eşleşmesi alakasız düz metin).
- Metin "Müşterileriniz bunu uygulamanızda görecektir" diyor (`messages/tr.json:528`, `messages/en.json:528`); QR akışı, keşif, favoriler bu bayrağı okumuyor.
- Yeniden üretim: tatil modunu aç + kaydet → bayinin QR geri bildirim sayfası ve keşif listesi hiçbir değişiklik göstermez. Güvenlik açığı değil; ürün sözü tutulmuyor (yanıltıcı arayüz).

### 5. Dashboard düzeni API'si `benchmark-comparison` widget'ını düşürüyor — **DOĞRULANDI**
- `DEFAULT_WIDGETS` listesinde `benchmark-comparison` yok (`app/api/dealer/dashboard-layout/route.ts:22-30`); GET yalnız bu listeyi map'liyor (`:44-50`), DB'de kayıtlı olsa bile bu id düşüyor.
- Panel API başarılıysa yalnız API listesini kullanıyor; yerel varsayılan (benchmark dahil) sadece API başarısızken devreye giriyor (`app/dealer/dealer-dashboard-client.tsx:178-197`). Benchmark kartı yalnız widget döngüsünde render ediliyor (`:961`), başka yerde yok.
- Yeniden üretim: herhangi bir bayi `/dealer`'ı açar → `/api/dealer/benchmark` veri döndürse bile karşılaştırma kartı görünmez; ayarlar "Görünüm" sekmesinde de açılacak bir satır yok.

### 6. Tercih edilen dil kaydı arayüze yansımıyor — **DOĞRULANDI** (kısmi nüansla)
- Kayıt sonrası yalnız `update({ name, image })` (`page.tsx:184`); JWT `preferredLanguage`'ı yalnız açıkça gönderilirse güncelliyor (`lib/auth.ts:272-277`) veya yalnız girişte DB'den okuyor (`:214-244`).
- `AppLocaleProvider` önce `localStorage`'ı, yoksa session'ı kullanıyor (`lib/app-locale.tsx:24-29`); bu sayfa `setLocale` çağırmıyor.
- Yeniden üretim: EN seç → Kaydet → arayüz Türkçe kalır. Nüans: çıkış/giriş sonrası `localStorage`'da dil yoksa EN uygulanır; daha önce dil değiştiricisi (`components/layout/language-switcher.tsx:32`) kullanılmışsa `localStorage` kazanır ve ayar hiç etkili olmaz. Ciddiyet KRİTİK değil, ORTA; ama hata gerçek.

### Özet
| # | İddia | Karar |
|---|---|---|
| 1 | GET başarısızken Kaydet işletme verisini siler | Doğrulandı (yüksek — veri kaybı) |
| 2 | Session yenilemesi taslağı ezer | Doğrulandı (yüksek — veri kaybı, kullanıcı girdisi) |
| 3 | Bildirim kaydı sahte | Doğrulandı |
| 4 | Tatil modu / çalışma saatleri / şablon ölü veri | Doğrulandı (yanıltıcı arayüz, güvenlik değil) |
| 5 | Benchmark widget'ı API tarafından düşürülüyor | Doğrulandı |
| 6 | Dil tercihi arayüze yansımıyor | Doğrulandı (orta) |

---

## Uygulama (Dalga 2)

`/dealer/settings` baştan yazıldı. Sayfa artık altı sekmeden oluşuyor: **İşletme · Hesabım · Bildirimler · Güvenlik · AI · Abonelik**. `/dealer/ai-settings` ve `/dealer/billing` bu sayfaya kalıcı yönlendiriliyor (`permanentRedirect`); sorgu parametreleri ve Stripe dönüşündeki `session_id` korunuyor. Mimari şöyle:

- **Sunucu önce.** `app/dealer/settings/page.tsx` yetkiyi DB'den alıyor (`requireAuth(['DEALER'])`). Ayarlar ve abonelik özeti tek paralel turda yükleniyor (`lib/dealer-settings/load.server.ts`, `billing.server.ts`) ve React Query'ye gömülüyor. Bir yükleme düşerse istemci adası BFF'i yeniden çağırıyor ve hata `QueryState` ile görünür kalıyor. **Yükleme kilidi korunuyor:** veri gelmeden form açılmıyor, varsayılan değerlerle kayıt yapılamıyor.
- **BFF (defineRoute).** `GET /api/dealer/settings`, `PATCH …/business`, `POST|DELETE …/business/logo`, `PATCH …/account`, `GET|PATCH …/ai`, `POST …/ai/retrain`, `POST …/sessions`, `DELETE …/push-devices/:id`. Hepsi şu kurallarla çalışıyor: rol DEALER, zod `.strict()`, rate limit, yalnız değişen alanlar, `baseVersion` ile iyimser kilit (409) ve denetim kaydı.
- **İstemci.** `components/dealer/b-ayarlar/**` QDL v2 ile yazıldı: `PanelPage`, `SectionTabs` (URL `?tab=`), `SectionCard`, RHF + paylaşılan zod, `DirtyBar` (Kaydet / Geri al, Ctrl+S, `beforeunload`, 409 bandı, mobil sekme çubuğu payı). İşletme dışındaki sekmeler `next/dynamic` ile ayrı parçalarda yükleniyor. Testler: `__tests__/dealer/b-ayarlar/*.test.ts` (25 test).

### Özellik envanteri: yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Sayfa başlığı | ÇALIŞIYOR: QDL `PageHeader`. Üstte "müşterinin gördüğü / güvenlik / AI / plan" özet kutucukları var; dokununca ilgili sekme açılır |
| 2 | Metadata | ÇALIŞIYOR: sayfa metadata'sı doğru ("ekip erişimi, entegrasyonlar" vaadi kaldırıldı) |
| 3 | Rol koruması | ÇALIŞIYOR: proxy + sayfada ve her BFF'de `requireAuth(['DEALER'])` |
| 4 | Sekme çubuğu | ÇALIŞIYOR: URL'de `?tab=`, mobilde metin görünür, ←/→ ile gezinme, ≥44px. Onboarding'in "profil/konum" adları kanonik sekmeye yönlendiriliyor |
| 5 | Profil yükleme | ÇALIŞIYOR: SSR + `QueryState` (iskelet, hata, tekrar dene). Oturum yenilense de form ezilmiyor (B2) |
| 6 | Sahte telefon varsayılanı | KALDIRILDI: başlangıç değeri yok, veri sunucudan geliyor |
| 7–9 | Avatar kartı / hover katmanı / değiştir | ÇALIŞIYOR: Hesabım sekmesinde. Katman `group-focus-visible` ile klavyede de görünüyor |
| 10 | Avatar modalı | ÇALIŞIYOR: Radix `Dialog` (odak tuzağı, Esc, odak iadesi) |
| 11 | Avatar kategorileri | ÇALIŞIYOR: `ChoiceChips` radiogroup |
| 12 | Avatar ızgarası | ÇALIŞIYOR: `role="radio"` + `aria-checked` + "Kategori avatarı N" adları |
| 13 | Modal kapatma | ÇALIŞIYOR: Radix kapatma düğmesi + Esc |
| 14 | Ad soyad | ÇALIŞIYOR: satır içi zod hatası; ad yalnız değiştiyse gönderiliyor (B8) |
| 15 | E-posta (salt okunur) | ÇALIŞIYOR. E-posta değiştirme akışı hâlâ yok (Kalanlar) |
| 16 | Telefon | ÇALIŞIYOR: biçim doğrulaması, `type="tel"` |
| 17–18 | İşletme adı / adres | ÇALIŞIYOR |
| 19 | Enlem/boylam | ÇALIŞIYOR: `NumberField` aralık hataları alanın yanında; OSM "Haritada gör" bağlantısı |
| 20 | Konumumu al | ÇALIŞIYOR: artık anında kaydetmiyor. Bulunan adres onay kartında gösteriliyor ("Adresi ve konumu kullan / Yalnız koordinat / Vazgeç") ve forma işleniyor (B9) |
| 21 | Koordinattan adres bul | ÇALIŞIYOR: aynı onay kartı. Uç 5 ondalığa yuvarlıyor, Redis'te 30 gün önbelleğe alıyor, 10/dk/kullanıcı sınırı uyguluyor, dili parametreyle alıyor, 8 sn zaman aşımı var (B12) |
| 22 | Buton yerleşimi | ÇALIŞIYOR: `flex-wrap` ile |
| 23 | Açıklama | ÇALIŞIYOR: etiket bağlı, 500 karakterlik sayaç |
| 24 | Çalışma saatleri | ÇALIŞIYOR: yapılandırılmış haftalık düzenleyici (gün × en çok 3 aralık, 24 saat, gece yarısını aşan aralık, "hafta içine / tüm günlere kopyala"). JSON yazıyor; Keşfet, mekân detayı ve Kaydettiklerim (`lib/places/business-hours`) aynı kuralla "Açık · 18:00'de kapanır" gösteriyor. Eski serbest metin çözülüp yükleniyor ve uyarı bandı gösteriliyor |
| 25 | Varsayılan yanıt şablonu | ÇALIŞIYOR: gelen kutusu "Varsayılan şablonum" olarak okuyor (`lib/dealer-inbox/server.ts`) |
| 26 | Tercih edilen dil | ÇALIŞIYOR: Hesabım › Panel dili. Kayıtta oturum `update({ preferredLanguage })` ve `setLocale` ile anında uygulanıyor (B6) |
| 27 | Tatil modu | ÇALIŞIYOR: Keşfet ve mekân sayfası "Tatilde" gösteriyor. Önizleme kartı da canlı gösteriyor |
| 28 | Değişiklikleri kaydet | ÇALIŞIYOR: sekme başına `DirtyBar`. Yalnız değişen alanlar gidiyor, sunucu mesajları alanın yanında ya da bantta görünüyor, 409 durumunda "güncel hâli yükle" sunuluyor |
| 29 | Otomasyon bağlantısı | ÇALIŞIYOR: AI sekmesi › Otomasyon |
| 30 | E-posta bildirimleri (3 sahte anahtar) | KALDIRILDI. Yerine gerçek "Haftalık özet e-postası" geldi (`AISettings.weeklyReportEnabled`; `lib/weekly-digest-core` artık uyuyor) |
| 31 | Push anahtarları (2 sahte) | KALDIRILDI. Yerine gerçek "Bu cihazda anlık bildirim" (abone ol / bırak) ve kayıtlı cihaz listesi (kaldırılabilir) geldi |
| 32 | Ayarları kaydet (setTimeout) | KALDIRILDI: anahtarlar anında ve iyimser kaydediliyor; hata olursa değer geri dönüyor ve hata gösteriliyor |
| 33 | 2FA durumu | ÇALIŞIYOR: durum sunucu anlık görüntüsünden geliyor; GET düşerse yanlış "Etkinleştir" gösterilmiyor |
| 34–36 | 2FA kurulum, doğrulama, kurtarma kodları | ÇALIŞIYOR: kodlar kopyalanabiliyor ve **indirilebiliyor**; yeni kod üretme eklendi |
| 37 | 2FA kapat | ÇALIŞIYOR: `prompt()` yerine kod alanlı `Dialog` |
| 38–41 | Şifre alanları ve güç göstergesi | ÇALIŞIYOR: göster/gizle düğmesi `aria-pressed`, güç göstergesi `aria-live` |
| 42 | Şifreyi güncelle | ÇALIŞIYOR: `sessionVersion` artınca diğer oturumlar düşüyor (Dalga 1). E-posta bildirimi yok (Kalanlar) |
| 43 | İlk şifre | ÇALIŞIYOR (uç paylaşımlı; hız sınırı Kalanlar'da) |
| 44–47 | Panel düzeni (yükle, görünürlük, sırala, kaydet) | KALDIRILDI: yeni Bugün paneli bu düzeni okumuyor, ayar hiçbir şeyi değiştirmiyordu. Yetim kalan `app/api/dealer/dashboard-layout` silindi (B5 ve B11 bu yolla kapandı) |
| 48 | Erişilebilirlik anahtarları | ÇALIŞIYOR: Hesabım. "Bu cihazda" uygulandığı açıkça yazıyor |
| 49 | Sekme geçiş animasyonu | ÇALIŞIYOR: `SectionTabs` fade (`duration-base`), azaltılmış hareket CSS tarafında |
| 50–52 | Yükleniyor / hata / kaydedilmemiş değişiklik | ÇALIŞIYOR |
| 53 | Logo yükleme | ÇALIŞIYOR: R2 (`logos/<bayi>/…`). Baytlardan biçim doğrulanıyor, sharp ile yeniden kodlanıyor (EXIF atılıyor), eski logo siliniyor, işlem denetime düşüyor. R2 yoksa dürüst not gösteriliyor |
| 54 | Veri dışa aktarma / hesap silme | Dışa aktarma ÇALIŞIYOR (Hesabım › Verileriniz). Hesap silme bayiye SUNULMADI: aktif abonelik ve cascade riski var (Kalanlar) |
| 55 | Oturumlar / giriş geçmişi | ÇALIŞIYOR: "Diğer cihazlardan çık / Her yerden çık" (`sessionVersion`) ve son 10 güvenlik olayı (`AuditLog`: şifre, oturum, hesap, işletme, AI). Cihaz cihaz aktif oturum listesi yok (JWT) |

### Kapanan bulgular
B1 · B2 · B3 · B4 · B5 (kaldırma ile) · B6 · B8 · B9 · B10 · B11 (kaldırma ile) · B12 · B13 (bayi yazma yolu yalnız hazır avatar, kayıtlı görsel ya da boş değer kabul ediyor) · B14 (sekme başına bileşen, tipli sözleşme). B7 kısmen kapandı: oturum iptali ve şifre değişiminde `sv` artışı var.

### Kalanlar
- **B7 kalanı:** şifre değişince e-posta bildirimi gönderilmiyor. `/api/user/initial-password` için hız sınırı ve 2FA ara adımı yok. Uç paylaşımlı (müşteri de kullanıyor), sahiplik dışında.
- **B13 kalanı:** paylaşımlı `PATCH /api/user/profile`, DEALER için `image` alanına hâlâ serbest URL kabul ediyor. Yeni yüzey o ucu kullanmıyor. Ucun sahibi bayi izin listesini `isAllowedDealerAvatar` (lib/dealer-settings/write.server) ile eklemeli.
- **B15:** uygulama içi "animasyonları azalt" ayarının framer'a bağlanması global bir iş (`lib/motion` / providers).
- E-posta değiştirme akışı ve bayi hesap kapatma: doğrulama maili ve abonelik iptali gerekiyor, ürün kararı bekliyor.
- i18n: diğer bayi yüzeyleri gibi bu yüzey de yalnız Türkçe.
