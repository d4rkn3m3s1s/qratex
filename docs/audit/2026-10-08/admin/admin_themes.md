# /admin/themes

**Amaç:** Platformun tamamında (müşteri, bayi, admin, landing) kullanılan renk paletini seçmek. 14 hazır tema ailesi (27 preset, açık+koyu varyantlı) ya da 3 renkli özel tema seçilir. Seçim `settings` tablosuna (`category: 'theme'`) yazılır ve `components/providers.tsx` içindeki `ThemeColorsProvider` üzerinden tüm kullanıcılara CSS değişkeni olarak uygulanır.

**Genel puan:** 4.5 / 10 · **Karar:** yeniden tasarla

Sayfa küçük ama etkisi büyük: tek bir tıklama, onay ya da önizleme adımı olmadan bütün kullanıcıların arayüzünü canlıda değiştiriyor. İstemci tarafında da tema durumu üç ayrı yerden (sayfa, `ThemeColorsProvider`, `SeasonalConceptApplier`) aynı CSS değişkenlerine yazılıyor. Bu yüzden görülen birkaç hatanın (mount anında yanlış palet yayını, kayıttan sonra eski palete geri dönme, "Aydınlık" temanın koyu modu bozması) ortak kökü aynı: temanın tek bir doğruluk kaynağı yok.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Preset seçme ve kaydetme genelde çalışıyor. Ama "Aydınlık" ailesi koyu modu bozuyor, özel tema kaydı atomik değil, mount anında sabit `purple` yayınlanıyor ve "Varsayılan Mod" bölümü yok. |
| UX | 4/10 | Kartı tıklamak anında yayına alıyor; taslak, önizleme, onay ve geri al yok. Yükleme hatası sessizce yutulup mor tema "aktif" gösteriliyor. |
| Görsel | 5/10 | Kartlar düzenli ama tek boyutlu. Önizleme yalnızca 3 nokta gösteriyor, gerçek bir arayüz önizlemesi yok. 14 aileden birkaçı birbirinin neredeyse aynısı. |
| Mimari | 4/10 | Tema durumu 3 bileşen arasında `CustomEvent` ile dağıtılıyor. İki ayrı `PUT` atomik değil. `revalidateTag(...,'max')` stale-while-revalidate davranıyor. `defaultMode` anahtarı tanımlı ama hiçbir yerde kullanılmıyor. |
| Performans | 7/10 | Veri küçük (tek GET, en fazla 3 satır), animasyon hafif. Tek eksik, statik preset verisinin tamamen istemcide işlenmesi. |
| Erişilebilirlik + Mobil | 3/10 | Tıklanabilir kartlar klavyeyle seçilemiyor. Renk input'larının etiketleri bağlı değil, kontrast denetimi yok. Aktif tema şeridi telefon genişliğinde taşıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Hero başlık ("Tema Yönetimi") | ÇALIŞIYOR | `app/admin/themes/page.tsx:313-317` | Metinler sabit Türkçe, `t()` kullanılmıyor. |
| 2 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:298-309` | `InlineLoadingStatus` ile `t('adminInlineLoading.themes')` kullanılıyor. |
| 3 | Tema ayarlarını çekme (GET `/api/admin/settings?category=theme`) | KISMİ | `page.tsx:158-195`, `lib/theme-settings-keys.ts:27-29`, `app/api/admin/settings/route.ts:42-118` | `res.ok` kontrol edilmiyor. `themes` ve `resolvedTheme` mount anındaki kapanıştan (stale closure) okunuyor. |
| 4 | Yükleme hata durumu | BOZUK | `page.tsx:190-194` | Hata yalnızca `console.error` ile loglanıyor. Ekran, gerçek tema ne olursa olsun varsayılan "Mor Gece"yi aktif gösteriyor (`page.tsx:84-86, 96`). |
| 5 | "Aktif Tema: …" başlığı | KISMİ | `page.tsx:322-326` | Fetch başarısız olursa yanlış bilgi veriyor. Özel temada "Aktif Tema: " ile "Özel Tema" string birleştirmesiyle yazılıyor. |
| 6 | Aktif tema renk örnekleri (5 swatch) | KISMİ | `page.tsx:329-349` | `flex gap-4` sarmıyor; 5×64px + 4×16px = 384px, 400px ekranda taşıyor. Etiketler İngilizce (`primary/background…`) ve hex değeri gösterilmiyor. |
| 7 | Hazır tema aile ızgarası (14 aile / 27 preset) | ÇALIŞIYOR | `page.tsx:102-124, 354-430`, `lib/theme-presets.ts:31-59` | Aile anahtarı `Light` son ekinden çıkarılıyor. |
| 8 | Karta tıklayınca anında aktifleştirme ve kaydetme | KISMİ | `page.tsx:208-241, 370` | Onay, taslak ve geri al yok. `saving` sırasında kartlar kilitlenmediği için art arda tıklamalar yarışıyor. Kayıttan sonra palet eski haline dönebiliyor (Bulgu 2). |
| 9 | "Palette aktif" rozeti | ÇALIŞIYOR | `page.tsx:372-379` | Dil karışık: "Palette" yerine "Palet" olmalı. |
| 10 | Koyu/Açık varyant göstergesi ve aktif çerçeve | KISMİ | `page.tsx:386-421` | `isActive` yalnızca fetch ve tıklama anında hesaplanıyor. Kullanıcı açık/koyu mod değiştirince çerçeve yanlış varyantta kalıyor. |
| 11 | Kartların sıralı giriş animasyonu | ÇALIŞIYOR | `page.tsx:358-363` | Global `MotionConfig reducedMotion="user"` sayesinde azaltılmış harekete uyuyor (`components/providers.tsx:232`). |
| 12 | "Varsayılan Mod" yönlendirme metni | SAHTE | `page.tsx:422-424` | Metin, sayfada olmayan bir "Varsayılan Mod" bölümüne yönlendiriyor. `THEME_SETTINGS_KEYS.defaultMode` (`lib/theme-settings-keys.ts:14`) projede hiçbir yerde okunmuyor; `ThemeProvider defaultTheme="system"` sabit kodlu (`providers.tsx:225`). |
| 13 | Paleti anında uygulama ve `qratex:theme-palette-preview` yayını | BOZUK | `page.tsx:126-155` | Effect `loading` beklenmeden mount anında çalışıyor ve sabit `purple` paletini hem uyguluyor hem global olarak yayınlıyor (Bulgu 3). |
| 14 | Açık/koyu mod değişince paleti yeniden uygulama | ÇALIŞIYOR | `page.tsx:155` (`resolvedTheme` bağımlılığı) | |
| 15 | "Aydınlık" ailesi (tek varyant) | BOZUK | `lib/theme-presets.ts:41, 141-147`, `page.tsx:73-79`, `providers.tsx:52-62` | Koyu modda beyaz arka plan ile koyu tema `muted/border/glass` değerleri karışıyor (Bulgu 1). |
| 16 | Özel tema: 3 `type="color"` seçici | ÇALIŞIYOR | `page.tsx:445-450, 461-466, 477-482` | |
| 17 | Özel tema: 3 hex metin girişi | KISMİ | `page.tsx:451-455, 467-471, 483-487` | Biçim doğrulaması yok. Geçersiz hex `hexToHSL` içinde `0 0% 0%` (siyah) olur (`lib/hex-to-hsl.ts:5-6`). 3 haneli `#RGB` desteklenmiyor, oysa yorum satırı destekliyor diyor. |
| 18 | Özel tema önizleme kutusu | KISMİ | `page.tsx:492-506` | Yalnızca 2 buton ve 1 rozet var; arka plan/ön plan, kart, sidebar ve grafik gösterilmiyor. Buton metin rengi `--primary-foreground` olarak kalıyor, kontrast kontrol edilmiyor. |
| 19 | "Özel Temayı Kaydet" | KISMİ | `page.tsx:243-294` | Birbirinden bağımsız iki `PUT` paralel gidiyor, atomik değil (Bulgu 4). |
| 20 | Özel tema aktifken canlı global uygulama | KISMİ | `page.tsx:127-133` | Her tuş vuruşu tüm uygulamaya yansıyor. Kaydetmeden sayfadan çıkılınca renkler geri alınmıyor (Bulgu 6). |
| 21 | Kaydediliyor durumu | KISMİ | `page.tsx:218, 508-511` | Spinner yalnızca özel tema butonunda var. Preset kartlarında ne gösterge ne kilit var. |
| 22 | Toast bildirimleri | ÇALIŞIYOR | `page.tsx:232-237, 285-290` | Sabit Türkçe metinler; sunucudan dönen `error` mesajı gösterilmiyor. |
| 23 | Yetki kontrolü | ÇALIŞIYOR | `proxy.ts:51, 79-84`, `app/api/admin/settings/route.ts:44, 125` | `requireAuth(['ADMIN'])` ve admin gizli kapısı. |
| 24 | Sunucu tarafında audit log | ÇALIŞIYOR | `app/api/admin/settings/route.ts:162-175` | Sayfada görünmüyor; tema değişikliği geri alınamıyor (Bulgu 5). |
| 25 | Public tema önbelleğini geçersiz kılma | KISMİ | `lib/revalidate-public-theme.ts:8`, `app/api/settings/theme/route.ts:5-8` | `'max'` profili stale-while-revalidate çalışıyor; kayıttan sonraki ilk okuma eski veriyi alıyor (Bulgu 2). |
| 26 | Klavye erişimi (tema kartı seçimi) | BOZUK | `page.tsx:364-371` | `Card` bir `div`; `onClick` var ama `role`, `tabIndex` ve `onKeyDown` yok. |
| 27 | Mobil yerleşim | KISMİ | `page.tsx:329, 495` | Izgara tek sütuna iniyor, ama swatch şeridi ve önizleme butonları sarmıyor. |
| 28 | Çok dillilik (i18n) | KISMİ | `page.tsx:82, 306` ve diğer satırlar | Yalnızca 1 anahtar `t()` ile çevriliyor, geri kalan her şey sabit TR/EN karışık. |
| 29 | Varsayılan açık/koyu mod ayarı | EKSİK | `lib/theme-settings-keys.ts:14` | Anahtar tanımlı, arayüzü ve tüketicisi yok. |
| 30 | Değişiklik geçmişi ve geri al | EKSİK | — | Mevcut genel rollback tema kayıtlarında çalışmıyor (Bulgu 5). |
| 31 | Kontrast (WCAG) denetimi | EKSİK | — | Özel renk için hiçbir uyarı yok. |
| 32 | Özel temada arka plan/ön plan ve açık/koyu varyant | EKSİK | `page.tsx:87-95` | Yalnızca 3 renk var; aynı renkler iki modda da kullanılıyor. |
| 33 | Taslak → önizle → yayınla akışı | EKSİK | — | Her tıklama doğrudan canlıya gidiyor. |
| 34 | Mevsimsel konsept çakışma uyarısı | EKSİK | `components/seasonal/seasonal-concept-applier.tsx:43-53` | Aktif bir konsept paleti ezebiliyor; sayfa bunu hiç belirtmiyor. |
| 35 | Varsayılana sıfırla | EKSİK | — | |

**Toplam:** 35 özellik · ÇALIŞIYOR 10 · KISMİ 13 · BOZUK 4 · SAHTE 1 · EKSİK 7

---

## Bulgular

### 1. "Aydınlık" teması koyu moddaki tüm kullanıcıların arayüzünü bozuyor
- **Önem:** yüksek · **Kategori:** hata / görsel bütünlük · **Efor:** S
- **Kanıt:** `lib/theme-presets.ts:41` (`light` preset'i, tek varyant), `lib/theme-presets.ts:141-147` (`mode: 'light'`, `background: #FFFFFF`, `foreground: gray800`). `resolveThemeIdForMode` (`page.tsx:73-79`, `providers.tsx:52-62`) koyu mod için `preferred = 'light'` buluyor ve onu döndürüyor. `applyRuntimeThemeToRoot` (`lib/apply-runtime-theme.ts:85-97, 108-114`) arka planı beyaz yaparken `mode=dark` olduğu için `--muted`, `--border`, `--glass-bg` ve `--muted-foreground` (`215 16% 68%`) değerlerini koyu tema değerlerine çekiyor. Ayrıca `defaultTheme="system"` (`providers.tsx:225`).
- **Sorun:** Admin "Aydınlık"ı seçtiğinde, işletim sistemi koyu moddaki her kullanıcı beyaz zemin üzerinde koyu muted yüzeyler, koyu kenarlıklar ve açık gri ikincil metin görüyor. Bu düşük kontrastlı, kırık bir arayüz demek. Kart, "sadece palet seçilir, açık/koyu otomatik" dese de bu aile yalnızca açık zemin içeriyor.
- **Öneri:** Preset modelini "aile → {light, dark}" olarak zorunlu tutun: `THEME_COLOR_PRESETS` yerine `{ id, name, variants: { light: Palette; dark: Palette } }` yapısına geçin ve tip seviyesinde her ailenin iki varyantı olmasını şart koşun. "Aydınlık"a bir koyu varyant ekleyin ya da onu "Mor"un açık varyantıyla birleştirip kaldırın. `resolveThemeIdForMode` mod uyuşmazlığında `mode` bilgisini preset'ten alsın; arka planı açık bir preset'e koyu mod değerleri hiçbir zaman verilmesin.

### 2. Kayıttan hemen sonra palet eski temaya dönebiliyor (stale-while-revalidate)
- **Önem:** yüksek · **Kategori:** hata / önbellek · **Efor:** S
- **Kanıt:** `lib/revalidate-public-theme.ts:8` `revalidateTag(PUBLIC_THEME_SETTINGS_CACHE_TAG, 'max')`. Next 16.1.6'da profil verilen `revalidateTag` stale-while-revalidate çalışır; anında süresini dolduran `updateTag` yalnızca Server Action'da kullanılabilir (`node_modules/next/dist/server/web/spec-extension/revalidate.js:39-62`). Kayıttan sonra sayfa `qratex:theme-palette-changed` yayınlıyor (`page.tsx:231, 284`). Provider `cache: 'no-store'` ile `/api/settings/theme`i yeniden çekiyor (`providers.tsx:115-117`), bu da `unstable_cache` üzerinden okuyor (`lib/get-public-theme-settings.ts:25-32`). Sonuç `setActiveThemeId(parsed.activeThemeId)` ile provider durumuna yazılıyor (`providers.tsx:99-101`) ve layout effect paleti yeniden boyuyor (`providers.tsx:141-180`).
- **Sorun:** Kayıttan sonraki ilk okuma büyük olasılıkla eski satırları döndürüyor. Provider eski `activeTheme`'i geri yazıyor, sayfanın uyguladığı yeni palet ezilip eskisine dönüyor; kartta ise yeni tema "aktif" görünmeye devam ediyor. SSR tarafında da (`app/layout.tsx:144`) ilk ziyaretçiler eski paleti görüyor. Canlıda gözlenmedi (doğrulanmadı), ama kod yolu bu sonucu doğuruyor.
- **Öneri:** Route handler'da `revalidateTag(tag, { expire: 0 })` ile anında süresini doldurun ya da kaydı Server Action'a taşıyıp `updateTag` kullanın. Daha sağlam çözüm: `PUT` yanıtı yeni tema satırlarını döndürsün, istemci `qratex:theme-palette-changed` yerine bu yanıtla provider'ı doğrudan güncellesin (iyimser güncelleme + sunucu onayı). Böylece kaydın hemen ardından bir okuma yapılmasına gerek kalmaz.

### 3. Sayfa açılır açılmaz sabit "purple" paleti tüm uygulamaya yayınlanıyor
- **Önem:** yüksek · **Kategori:** hata / yarış koşulu · **Efor:** S
- **Kanıt:** Başlangıç durumu `activeThemeId='purple'` (`page.tsx:96`). Effect (`page.tsx:126-155`) `loading` beklenmeden ilk render'da çalışıyor; `applyThemeColors` çağırıp `qratex:theme-palette-preview` ile `activeThemeId: 'purple'` yayınlıyor. Provider bu olayı alınca `setActiveThemeId('purple')` yapıyor (`providers.tsx:130`). Fetch `custom` dönerse sayfa yalnızca `applyRuntimeThemeToRoot` çağırıyor ve olay yayınlamıyor (`page.tsx:127-133`).
- **Sorun:** (a) Gerçek tema mor değilse, her sayfa açılışında palet önce mora dönüp sonra doğru temaya geçiyor. (b) Gerçek tema `custom` ise provider'ın durumu `purple` olarak takılı kalıyor. Admin başka sayfaya geçip açık/koyu modu değiştirdiğinde provider yanlış bir temayı (mor) uyguluyor. Durum ancak tam sayfa yenilemeyle düzeliyor.
- **Öneri:** Önizleme effect'ini `loading === false` koşuluna bağlayın; başlangıç durumunu sabit `purple` yerine `ThemeColorsProvider`'ın mevcut değerinden alın. Asıl çözüm: provider'ı bir context (`useThemePalette()` → `{ activeThemeId, customColors, preview(), commit(), reset() }`) olarak dışa açın; sayfa `CustomEvent` ve doğrudan DOM yazımı yerine bu API'yi kullansın. Önizleme sayfa kapanınca (`unmount`) otomatik geri alınsın.

### 4. Özel tema kaydı atomik değil: renkler ve aktif tema ayrı yazılıyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü · **Efor:** S
- **Kanıt:** `page.tsx:246-265` iki bağımsız `PUT` isteğini `Promise.all` ile paralel gönderiyor. Her `PUT` ayrı upsert ve ayrı audit kaydı oluşturuyor (`app/api/admin/settings/route.ts:146-175`). Transaction'lı toplu uç zaten var: `POST /api/admin/settings` (`route.ts:183-273`, `prisma.$transaction`).
- **Sorun:** Biri başarılı, diğeri başarısız olursa (ağ, 500, zaman aşımı) iki tutarsız durum oluşabiliyor: `activeTheme='custom'` kaydedilip renkler eski kalıyor (tüm kullanıcılar eski özel paleti görüyor), ya da renkler kaydedilip tema etkinleşmiyor. Kullanıcı yalnızca "Tema kaydedilemedi" mesajını görüyor ve neyin kaydedildiğini bilmiyor.
- **Öneri:** Mevcut `POST /api/admin/settings` toplu ucuyla `{ settings: [customColors, activeTheme] }` tek transaction'da gönderin. Uzun vadede tema için ayrı bir uç (`PUT /api/admin/theme`) açın; bu uç zod şemasıyla doğrulasın (`activeTheme ∈ preset id'leri ∪ {'custom'}`, renkler `^#[0-9a-f]{6}$`), tek audit kaydı yazsın ve anında invalidasyon yapsın.

### 5. Tema değişiklikleri geri alınamıyor; genel rollback tema kayıtlarını bozuyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / çapraz sayfa · **Efor:** M
- **Kanıt:** Tekil `PUT` audit'e `oldData` olarak ham değeri yazıyor (`route.ts:163-171`): `activeTheme` için string, `customColors` için `{primary,secondary,accent}`. `/admin/settings` "Kritik değişiklik geçmişi" tüm `entity: 'settings'` kayıtlarını listeliyor (`app/api/admin/settings/audit/route.ts:15`, `app/admin/settings/settings-client.tsx:924-946`). Rollback ucu `oldData`'yı `{ayarAnahtarı: değer}` haritası sanıyor (`app/api/admin/settings/rollback/route.ts:42-67`).
- **Sorun:** `activeTheme` kaydında "Bu sürüme dön" 400 dönüyor (string nesne değil), yani tema geri alınamıyor. `customColors` kaydında ise rollback `primary`, `secondary` ve `accent` adlı üç anlamsız `general` ayar satırı oluşturuyor, asıl `customColors` geri gelmiyor. Rollback ucu `revalidatePublicThemeSettings` da çağırmıyor.
- **Öneri:** Audit biçimini tekilleştirin: tekil `PUT` de `oldData`/`newData`'yı `{ [key]: value }` haritası olarak yazsın. Tema sayfasına kendi "Sürüm geçmişi" çekmecesini ekleyin; son N tema değişikliği küçük palet önizlemesi, admin adı ve zamanla listelensin, tek tıkla geri alınabilsin. Rollback ucu tema anahtarlarında public tema önbelleğini de geçersiz kılsın.

### 6. Her tıklama ve tuş vuruşu doğrudan canlıya gidiyor; taslak/önizleme yok, kaydedilmemiş renkler sızıyor
- **Önem:** orta · **Kategori:** UX / ürün güvenliği · **Efor:** M
- **Kanıt:** Kart `onClick` → `activateTheme` → anında `PUT` (`page.tsx:208-228, 370`). Özel tema aktifken her `onChange` global köke yazılıyor (`page.tsx:127-133, 448, 453`). Unmount'ta geri alma (cleanup) yok.
- **Sorun:** Admin "nasıl duruyor bakayım" diye karta tıkladığında tema bütün müşterilere ve bayilere yayınlanıyor. Özel renkleri denerken yarım hex (`#7c3`) bütün arayüzü anlık siyaha çekiyor. Kaydetmeden sayfadan çıkınca denenen renkler SPA gezintisi boyunca arayüzde kalıyor ve admin bunları yayınlanmış sanabiliyor.
- **Öneri:** İki aşamalı model kurun: **Önizleme** (yalnızca bu sekmede, `sessionStorage` + context; sayfadan çıkınca geri alınıyor) ve **Yayınla** (onay diyaloğunda "Tüm kullanıcılara uygulanacak" uyarısı ve kontrast raporu). Kaydedilmemiş değişiklik için sticky bir "Yayınlanmamış değişiklikler · Vazgeç / Yayınla" çubuğu koyun (Linear/Stripe ayar desenine benzer). Yarım hex için input'u debounce edin, yalnızca geçerli değerleri uygulayın.

### 7. "Varsayılan Mod" bölümü yok; `defaultMode` ayarı ölü kod
- **Önem:** orta · **Kategori:** sahte özellik / ölü kod · **Efor:** M
- **Kanıt:** `page.tsx:422-424` metni "alttaki 'Varsayılan Mod'" diyor. `THEME_SETTINGS_KEYS.defaultMode` (`lib/theme-settings-keys.ts:14`) için yapılan grep yalnızca tanım satırını buluyor. `ThemeProvider defaultTheme="system"` sabit kodlu (`providers.tsx:225`).
- **Sorun:** Admin, var olmayan bir kontrolü arıyor. Platformun varsayılan açık/koyu modunu belirleme ihtiyacı (örneğin marka koyu temada daha iyi görünüyorsa) karşılanmıyor.
- **Öneri:** Ya metni kaldırıp anahtarı silin, ya da özelliği uçtan uca yapın: sayfada üçlü segment kontrol (Sistem / Açık / Koyu), SSR'de `initialThemeSettings` içinden `defaultMode` okunsun ve `ThemeProvider`'a `defaultTheme` olarak geçilsin. Kullanıcının kendi `qratex-theme` seçimi (`localStorage`) her zaman öncelikli kalsın.

### 8. Mevsimsel konsept ve tema paleti aynı CSS değişkenleri için yarışıyor
- **Önem:** orta · **Kategori:** mimari / bilgi eksikliği · **Efor:** M
- **Kanıt:** `components/seasonal/seasonal-concept-applier.tsx:43-53` aktif konseptin `themePresetId` değerini `applyRuntimeThemeToRoot` ile köke yazıyor; `background` ve `foreground` vermediği için bu değişkenleri de siliyor (`lib/apply-runtime-theme.ts:98-107`). `ThemeColorsProvider` aynı köke kendi effect'inde yazıyor (`providers.tsx:141-180`). Sırası effect zamanlamasına bağlı. `/admin/seasonal-concepts` tema seçiyor (`app/admin/seasonal-concepts/page.tsx:57, 106`).
- **Sorun:** Aktif bir konsept varken /admin/themes'te seçilen tema kullanıcılara görünmeyebiliyor, ya da konsept paleti ile tema arka planı karışık bir sonuç çıkarıyor. Admin bunu tema sayfasında hiç göremiyor.
- **Öneri:** Palet çözümlemesini tek fonksiyona toplayın: `resolveEffectivePalette({ basePreset, custom, seasonalOverride, mode })`. Bunu yalnızca `ThemeColorsProvider` uygulasın; `SeasonalConceptApplier` yalnızca override verisini sağlasın. Tema sayfasının üstüne "Şu an 'Kış Konsepti' paleti etkin, 12 Ocak'a kadar temanızı ezer · Konsepte git" bilgilendirme bandı koyun.

### 9. Tema kartları klavyeyle seçilemiyor; form etiketleri input'lara bağlı değil
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `page.tsx:364-371`: `Card` bir `div`, `onClick` var, `role`, `tabIndex` ve `onKeyDown` yok. `page.tsx:443, 459, 475`: `<Label>`'larda `htmlFor`, input'larda `id` yok; hex metin input'larında `aria-label` yok. Swatch'lar yalnızca renkle anlam taşıyor, hex metni yok (`page.tsx:333-337`).
- **Sorun:** Klavye ve ekran okuyucu kullanıcıları tema seçemiyor. Renk seçicilerin ekran okuyucudaki adı boş.
- **Öneri:** Aile seçimini `role="radiogroup"` + `role="radio"` (`aria-checked`) olarak kurun, ok tuşlarıyla gezinme ve Enter/Space ile önizleme ekleyin (shadcn `RadioGroup` üstüne kart görünümü). Her renk alanını `ColorField` bileşeninde toplayın: `<label for>`, hex doğrulama, `aria-invalid` ve kontrast rozeti.

### 10. Hata durumu sessizce yanlış bilgi gösteriyor
- **Önem:** orta · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** `page.tsx:163-194`: `res.ok` kontrol edilmiyor, `catch` yalnızca `console.error` yapıyor, `finally` `loading=false` yapıyor. Varsayılan `isActive: i === 0` ile ilk preset aktif görünüyor (`page.tsx:84-86`).
- **Sorun:** 401, 500 ya da Neon kesintisinde ekran "Aktif Tema: Mor Gece" gösteriyor. Admin buna güvenip yanlış karar verebilir; bir sonraki tıklama da gerçek ayarın üstüne yazar.
- **Öneri:** Üç ayrı durum ayırt edilsin: yükleniyor, hata (yeniden dene butonu, düzenleme kilitli) ve veri. Veriyi React Query ile çekin (proje zaten `QueryClientProvider` kullanıyor, `providers.tsx:222`); yazma işlemlerini `useMutation` + `onError` geri sarma ile yapın. Sunucunun `error` mesajını toast'ta gösterin.

### 11. Kart tıklamaları kilitlenmiyor; ardışık seçimler yarışıyor
- **Önem:** düşük · **Kategori:** yarış koşulu · **Efor:** S
- **Kanıt:** `activateTheme` (`page.tsx:208-241`) `saving` true olsa da yeniden çağrılabiliyor; kartlarda `disabled` ya da `aria-busy` yok. Zaten aktif olan karta tıklamak da yeni bir `PUT` ve audit kaydı üretiyor.
- **Sorun:** Hızlı A→B tıklamasında yanıtlar ters sırayla gelirse toast ve UI B'yi gösterirken sunucuda A kalabiliyor (son yazan kazanır, ama sırası belirsiz). Audit log da gürültüyle doluyor.
- **Öneri:** Taslak/yayınla modeline geçilince (Bulgu 6) bu sorun büyük ölçüde ortadan kalkar. O zamana kadar: aktif olana tıklamayı yok sayın, `AbortController` ile önceki isteği iptal edin ve kayıt sırasında ızgarayı `aria-busy` ile kilitleyin.

### 12. Mobilde aktif tema şeridi ve önizleme butonları taşıyor
- **Önem:** düşük · **Kategori:** mobil · **Efor:** S
- **Kanıt:** `page.tsx:329` `flex gap-4` ile 5 adet `w-16` (yaklaşık 384px) var, `flex-wrap` yok. `page.tsx:495` önizlemede 3 eleman da `flex gap-4` ile sarmıyor. Ana alan `overflow-x-hidden` olduğu için (`app/admin/layout.tsx:37`) taşan kısım görünmeden kırpılıyor.
- **Öneri:** `flex-wrap` ya da `grid grid-cols-5` + `aspect-square` kullanın; mobilde swatch'ları 40px'e indirip hex'i alt satıra yazın.

### 13. Dil karışıklığı ve i18n eksikliği
- **Önem:** düşük · **Kategori:** içerik / i18n · **Efor:** S
- **Kanıt:** "Palette aktif" (`page.tsx:376`); swatch etiketleri `primary/secondary/background` (`page.tsx:337, 346`); preset adları TR/EN karışık ("Mor Gece", "Forest Night", "Royal Gold", "Forest Gün": `lib/theme-presets.ts`); `t()` yalnızca 1 kez kullanılıyor (`page.tsx:306`). `catch (error)` değişkenleri kullanılmıyor (`page.tsx:236, 289`).
- **Öneri:** Bütün metinleri `adminThemes.*` anahtarlarına taşıyın, preset adlarını tek dile (TR) çekin ya da `nameKey` ile çevrilebilir yapın.

### 14. Preset seti tekrar ediyor, aile adı türetme kırılgan
- **Önem:** düşük · **Kategori:** bilgi mimarisi · **Efor:** S
- **Kanıt:** "Orman" ile "Forest Night", "Okyanus" ile "Arctic", "Mor Gece" ile "Amethyst" palette çok yakın (`lib/theme-presets.ts:31-59`). Aile adı, ilk karşılaşılan preset'in adından `/\s+Gün$/` silinerek türetiliyor (`page.tsx:112`); sıralama TR/EN karışık isimlerle `localeCompare('tr')`.
- **Öneri:** 14 aileyi 8–10 ayrışık aileye indirin; her ailenin `familyName` alanı açıkça tanımlansın; kartları "Marka varsayılanı / Soğuk / Sıcak / Neon" gibi gruplarla sunun.

---

## Eksik özellikler (kıyas: Stripe Branding, Linear Appearance, Retool Theme Editor, PostHog)

1. **Taslak → canlı önizleme → yayınla akışı.** Stripe Branding'de değişiklikler önce önizlemede görülür, açıkça kaydedilir. Burada her tıklama yayına gidiyor.
2. **Gerçek arayüz önizlemesi.** Retool ve Linear temayı gerçek bileşenler (sidebar, kart, tablo, grafik, buton durumları) üzerinde açık ve koyu modda yan yana gösterir.
3. **Kontrast ve erişilebilirlik denetimi.** Her renk çifti için WCAG AA/AAA rozeti, yetersizse "en yakın erişilebilir ton" önerisi.
4. **Sürüm geçmişi ve tek tıkla geri alma.** Kim, ne zaman, hangi paletten hangisine geçti; palet küçük resmiyle birlikte.
5. **Varsayılan açık/koyu mod ve hedefleme.** Platform varsayılanı, panel bazında (müşteri/bayi/landing) palet, zamanlanmış yayın (mevsimsel konseptle tek yerde).
6. **Tema içe/dışa aktarma.** JSON ya da CSS değişkeni olarak kopyalama; marka renklerinden (logo) otomatik palet üretme.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Admin sayfaya girdiğinde neyin canlıda olduğunu (ve onu ezen bir mevsimsel konsept varsa onu) hemen görür. Bir palet seçtiğinde yalnızca kendi ekranında önizlenir, gerçek bileşenlerden oluşan bir "mini uygulama" önizlemesi açık ve koyu modda yan yana güncellenir. "Yayınla" dediğinde kontrast raporu ve "tüm kullanıcılara uygulanacak" onayından geçer. Yanlış bir şey olursa sürüm geçmişinden tek tıkla geri döner.

**Yerleşim (masaüstü iki sütun, mobilde tek sütun):**
- **Üst şerit:** "Canlıdaki tema" kartı (palet adı, 5 swatch + hex, yayınlayan ve zaman) · varsa mevsimsel konsept uyarı bandı · varsayılan mod için segment kontrol (Sistem/Açık/Koyu).
- **Sol sütun (yaklaşık 5/12):** Sekmeler "Hazır paletler" ve "Özel". Hazır paletler kategori gruplu `RadioGroup` kartları. Özel sekmede 5 `ColorField` (primary, secondary, accent, background, foreground), her mod için ayrı varyant, kontrast rozetleri ve "logodan üret" eylemi.
- **Sağ sütun (yaklaşık 7/12, sticky):** Önizleme tuvali. Gerçek `Sidebar`, `Card`, `Button` varyantları, bir `Badge`, küçük bir grafik ve bir form alanı, açık/koyu yan yana. Önizleme köke değil, kapsamlı bir kapsayıcıya yazılır: `applyRuntimeThemeToRoot(colors, previewContainerRef.current)`. Fonksiyon zaten `root` parametresi alıyor (`lib/apply-runtime-theme.ts:35-37`). Böylece uygulamanın geri kalanı hiç etkilenmez ve "sızıntı" sınıfı hatalar (Bulgu 3 ve 6) tamamen ortadan kalkar.
- **Alt sticky çubuk:** "Yayınlanmamış değişiklik · Vazgeç · Yayınla…" ve sağda "Geçmiş" çekmecesi.

**Motion / 3B:** 3B burada yersiz, eklenmemeli. Yerinde olan ölçülü motion: palet değişiminde önizleme tuvalinde 150–200ms renk crossfade (CSS `transition: background-color, color` yeterli, framer gerekmez); seçili kartta `layoutId` ile kayan seçim çerçevesi; yayın sonrası "canlıdaki tema" kartında kısa bir onay pulse'u. Hepsi `prefers-reduced-motion` altında kapanmalı (global `MotionConfig reducedMotion="user"` var; CSS geçişleri için `motion-reduce:transition-none` eklenmeli).

**Veri / API değişiklikleri:**
- `PUT /api/admin/theme`: tek uç, zod doğrulaması (`activeTheme` enum + `custom`, hex regex, `defaultMode` enum), tek transaction, tek audit (`{key: value}` haritası biçiminde) ve `revalidateTag(tag, { expire: 0 })`. Yanıt yeni satırları döndürür.
- `GET /api/admin/theme/history?limit=20`: tema audit kayıtları. `POST /api/admin/theme/rollback`: tema anahtarlarına özel, önbelleği de temizleyen geri alma.
- Preset modelinin aile tabanlı olması (`variants.light/dark` zorunlu) ve özel temanın da iki varyantlı olması.
- İstemci: `ThemeColorsProvider` bir context API'si açar (`palette`, `setPreviewScope`, `commit`); `CustomEvent` köprüsü ve sayfanın doğrudan `document.documentElement` yazımları kaldırılır. Mevsimsel override bu provider'a girdi olur.
- Sayfanın `metadata` başlığı için bir `layout.tsx` eklenir (şu an tarayıcı sekmesinde yalnızca genel "Admin" yazıyor).

---

## Çakışmalar / birleştirme önerisi

- **/admin/seasonal-concepts:** Bu sayfa da `themePresetId` ile platform paletini ezen bir tema seçiyor (`app/admin/seasonal-concepts/page.tsx:57, 106`; uygulayan bileşen `components/seasonal/seasonal-concept-applier.tsx:43-53`). Sayfaları ayrı tutun ama palet çözümlemesini tek provider'da birleştirin; tema sayfası aktif override'ı göstersin, konsept sayfası tema seçicisini bu sayfanın `ThemePalettePicker` bileşeninden yeniden kullansın.
- **/admin/settings:** Genel "Kritik değişiklik geçmişi" ve rollback, tema kayıtlarını listeliyor ama doğru geri alamıyor (Bulgu 5). Tema geçmişi tema sayfasına taşınsın; genel rollback tema anahtarlarını ya doğru işlesin ya da hariç tutsun.
- **/admin/design-language:** Statik tasarım dili dokümantasyon sayfası. Tema sayfasındaki "önizleme tuvali" ile doğal olarak eşleşiyor; uzun vadede "Görünüm" adlı tek bir bölüm altında sekme olarak birleştirilebilir (Palet · Mod · Tasarım dili). Zorunlu değil.
- **Karar:** Sayfa kaldırılmamalı ya da başka bir sayfaya katılmamalı; platformun tek palet otoritesi olarak **yeniden tasarlanmalı**. Bulgu 1–4 küçük eforla hemen kapatılabilir; taslak/yayınla ve kapsamlı önizleme M–L eforlu ikinci adımdır.

---

## Doğrulama (şüpheci inceleme)

Yöntem: Yalnızca kod okundu. Kod değiştirilmedi. Veritabanına dokunulmadı; build, test ve dev server çalıştırılmadı. İncelenen dosyalar: `app/admin/themes/page.tsx`, `components/providers.tsx`, `lib/apply-runtime-theme.ts`, `lib/theme-presets.ts`, `lib/theme-settings-keys.ts`, `lib/get-public-theme-settings.ts`, `lib/revalidate-public-theme.ts`, `app/api/settings/theme/route.ts`, `app/api/admin/settings/{route,rollback/route,audit/route}.ts`, `app/admin/settings/settings-client.tsx`, `hooks/use-theme-colors.ts`, `lib/validations.ts`. Next 16.1.6'nın `node_modules/next` içindeki `revalidate.js`, `unstable-cache.js`, `incremental-cache/index.js`, `tags-manifest.external.js` ve `config-shared.js` dosyaları da okundu.

### 1. "'Aydınlık' preset'i koyu modda kırık palet uyguluyor": **belirsiz**

Bugünkü arayüz iddia edilen hatayı üretemiyor. Onun yerine başka bir hata var ve o doğrulandı.

- **Render tarafındaki gözlem doğru.** DB'de `activeTheme = 'light'` olsaydı:
  - Koyu modda `resolveThemeIdForMode` `'light'` döndürürdü (`components/providers.tsx:57-60`).
  - `applyRuntimeThemeToRoot` beyaz `--background`/`--card` ile birlikte koyu `--muted`/`--border`/`--glass-bg` ve açık gri `--muted-foreground` yazardı (`lib/apply-runtime-theme.ts:87-99, 113-119`).
  - Sonuç gerçekten kırık bir karışım olurdu.
- **Ancak bugünkü sayfa `'light'` değerini hiç yazamıyor.**
  - `getThemeFamilyKey` içindeki regex büyük/küçük harf ayırmıyor. `'light'.replace(/Light$/i, '')` sonucu `''` oluyor (`app/admin/themes/page.tsx:48-50, 109`).
  - Bu yüzden "Aydınlık" kartının `familyKey` değeri `''`. Tıklanınca `activateTheme('')` çalışıyor (`page.tsx:370`).
  - `PUT` gövdesine `value: ''` gidiyor (`page.tsx:225`). `updateSettingsSchema` (`value: z.unknown()`, `lib/validations.ts:201-205`) bunu kabul ediyor.
- **`'light'` değeri yalnızca eski veriden gelebilir.** `77a7126` commit'inden önce sayfa `activateTheme(theme.id)` ile ham id kaydediyordu (`git show 74acb4d:app/admin/themes/page.tsx:330`). Canlı DB'de bugün `'light'` olup olmadığı **doğrulanmadı**, çünkü DB'ye dokunulmadı. Bu yüzden "tüm kullanıcılar etkilenir" iddiası kanıtlanamıyor.

**Doğrulanmış yan bulgu (orta önem): "Aydınlık" seçilemiyor ve seçilmeye çalışılınca platform paleti sessizce düşüyor.**

Yeniden üretim:
1. Admin "Aydınlık" kartına tıklar.
2. Sayfa `resolveThemeIdForMode('')` çağrısından `'purple'` alır. Mor Gece renklerini uygular ve Mor Gece kartını "aktif" işaretler (`page.tsx:73-79, 211-217`). Toast "Tema aktifleştirildi" der.
3. DB'ye `activeTheme = ''` yazılır.
4. Provider `''` değerini boş sayar ve hiçbir preset uygulamaz (`providers.tsx:161`).
5. Sonraki her ziyaretçi `globals.css` varsayılan paletini görür (koyu modda `--background: 222 47% 5%`). Admin ise Mor Gece'yi görür.

Kırık bir kontrast oluşmuyor. Ama seçim yanlış kaydediliyor ve admin ekranı canlıdaki durumla uyuşmuyor.

Öneri:
- Aile anahtarını regex ile değil, preset tablosundan türetin (`variants.light/dark` modeli).
- `PUT` tarafında `activeTheme` için `z.enum([...presetIds, 'custom'])` doğrulaması ekleyin.
- Tek varyantlı aileler için açık bir fallback tanımlayın. Örneğin `light` koyu modda `purple`'a düşsün, ya da tek modlu bir palette `mode` zorla `light` yapılsın.

### 2. "Kayıttan sonra provider eski temayı geri yazıyor (SWR)": **doğrulandı**

Bu karar kod yolundan çıkarıldı, canlıda gözlenmedi.

- `revalidatePublicThemeSettings`, `revalidateTag(tag, 'max')` çağırıyor (`lib/revalidate-public-theme.ts:8`).
- Next 16.1.6'da `max` profilinin `expire` süresi 365 gün (`config-shared.js:133-137`). Bu yüzden etiket "expired" olarak değil, yalnızca "stale" olarak işaretleniyor (`tags-manifest.external.js` içindeki `areTagsExpired` ve `areTagsStale`).
- `unstable_cache` stale bir girdide eski değeri **hemen döndürüyor** ve yenilemeyi arka planda yapıyor (`unstable-cache.js:165-197`, kaynaktaki yorum: "return stale immediately").
- `getPublicThemeSettings` bu önbelleği kullanıyor (`lib/get-public-theme-settings.ts:25-36`).
- İstemcideki `cache: 'no-store'` (`providers.tsx:88`) yalnızca tarayıcı önbelleğini atlıyor, sunucunun veri önbelleğini atlamıyor.
- Ek olarak yanıt `public, s-maxage=120` başlığı taşıyor (`app/api/settings/theme/route.ts:7`). Bu da CDN'de ikinci bir eski veri katmanı açıyor.

Yeniden üretim:
1. Aktif tema `blue` iken admin `green` kartına tıklar.
2. Sayfa yeşili uygular ve preview olayıyla provider'ı `green` yapar.
3. `PUT` 200 döner, ardından `qratex:theme-palette-changed` olayı tetiklenir (`page.tsx:231`).
4. Provider `/api/settings/theme` adresini yeniden okur ve eski satırları alır (`activeTheme: 'blue'`).
5. `setActiveThemeId('blue')` (`providers.tsx:99-101`) layout effect'i tetikler ve mavi palet geri yazılır (`providers.tsx:161-176`).
6. Sayfanın effect'i tekrar çalışmaz, çünkü bağımlılıkları değişmedi. Ekranda yeşil kart "aktif" görünür ama palet mavidir. Doğru renk ancak tam yeniden yüklemede gelir.

Öneri:
- Tema yazımında `revalidateTag(tag, { expire: 0 })` kullanın. Route handler içinde `updateTag` kullanılamaz (`revalidate.js`, hata kodu E872).
- Daha iyisi: `PUT` yanıtı yeni satırları döndürsün ve provider ikinci bir okuma yapmadan bunları uygulasın (kendi yazdığını okuma garantisi).

### 3. "Mount anında sabit 'purple' paleti uygulanıp global preview olayı yayınlanıyor": **doğrulandı**

Etki yalnızca o adminin oturumunda kalıyor, veri bozulmuyor. Önem düşük-orta.

- `activeThemeId` başlangıçta `'purple'` (`page.tsx:96`).
- Palet effect'i `loading` durumunu beklemiyor (`page.tsx:126-155`). İlk commit'te mor uygulanıyor ve `activeThemeId: 'purple'` ile preview olayı yayınlanıyor. Provider da `setActiveThemeId('purple')` çalıştırıyor (`providers.tsx:130`).
- Gerçek tema farklıysa fetch dönene kadar kısa bir mor flaş görünüyor.
- Gerçek tema `'custom'` ise `custom` dalı preview olayı **yayınlamıyor** (`page.tsx:127-133`). Provider'daki durum `'purple'` olarak kalıyor.

Yeniden üretim:
1. Aktif tema `custom` iken admin `/admin/themes` sayfasını açar.
2. Aynı sekmede (istemci tarafı gezinmeyle) başka bir admin sayfasına geçer.
3. Açık/koyu modu değiştirir.
4. Provider'ın layout effect'i `'purple'` uygular (`providers.tsx:141-177`). Admin, tam yeniden yüklemeye kadar platformu yanlış (mor) palette görür. DB ve diğer kullanıcılar etkilenmez.

Öneri:
- Effect `loading === false` olana kadar çalışmasın. Başlangıç durumu `null` olsun.
- Uzun vadede önizleme kökü değil, kapsamlı bir kapsayıcıyı boyasın. Provider ile sayfa arasındaki `CustomEvent` köprüsü bir context API'ye çevrilsin.

### 4. "Özel tema kaydı atomik değil": **doğrulandı**

Hata gerçek ama düşük olasılıklı. Önem orta.

- `customColors` ve `activeTheme='custom'`, `Promise.all` içindeki iki bağımsız `PUT` ile yazılıyor (`page.tsx:246-265`).
- Her `PUT` kendi upsert ve audit kaydını yapıyor. Ortak bir transaction yok (`app/api/admin/settings/route.ts:154-182`).

Yeniden üretim:
1. Neon bağlantısında anlık bir hata, renk `PUT`'unu 500 ile düşürür. `activeTheme` `PUT`'u ise başarılı olur.
2. DB'de `activeTheme='custom'` kalır. `customColors` ya eski hâlindedir ya da hiç yoktur.
3. Tüm ziyaretçiler eski özel renkleri görür. Satır hiç yoksa provider hiçbir şey uygulamaz (`providers.tsx:146` koşulu sağlanmaz) ve CSS varsayılanı görünür.
4. Admin "Tema kaydedilemedi" mesajını görür (`page.tsx:287`). Temanın aslında yayınlandığından haberi olmaz.

Not: Aynı uçta `$transaction` kullanan bir `POST` batch yolu zaten var (`route.ts:241-262`). Bu yol tema anahtarı geldiğinde önbelleği de temizliyor (`route.ts:282-284`). Kısa vadeli düzeltme olarak bu yola geçilebilir.

### 5. "Genel settings rollback tema audit kayıtlarını bozuyor / geri alamıyor": **doğrulandı**

Önem orta. Etkilenen yalnızca admin verisi.

- Tekil `PUT`, audit kaydının `oldData` alanına ham değeri yazıyor (`route.ts:169-179`), `{key: value}` haritası yazmıyor.
- Rollback ise `oldData`'nın bir nesne olmasını ve anahtarlarının ayar adı olmasını bekliyor (`rollback/route.ts:37-46, 57-69`).
- **`activeTheme` kaydı:** `oldData` bir string (ör. `"blue"`). Rollback 400 "Bu kayıt rollback için uygun değil" döndürüyor, yani geri alınamıyor.
- **`customColors` kaydı:** `oldData = {primary, secondary, accent}`.
  - Rollback bu yüzden `primary`, `secondary` ve `accent` adlı üç satırı `category: 'general'` ile upsert ediyor (`rollback/route.ts:62-66`).
  - Asıl `customColors` değişmiyor.
  - Kullanıcı yine de "Ayarlar geri alındı (3 anahtar)" mesajını görüyor (`settings-client.tsx:798-799`).
- **Önbellek temizlenmiyor:** Rollback rotası hiçbir `revalidateTag` / `revalidatePublicThemeSettings` çağırmıyor. Tema anahtarı doğru geri yazılsa bile public tema önbelleği temizlenmezdi.
- **Tema kayıtları da bu tuzağa açık:** Audit uç noktası tüm `entity: 'settings'` kayıtlarını listeliyor (`audit/route.ts:14-17`). UI her kayda "Bu sürüme dön" düğmesi koyuyor (`settings-client.tsx:924-945`).

Yeniden üretim:
1. Admin özel rengi kaydeder.
2. `/admin/settings` sayfasında "Geçmişi getir"e basar, `customColors` kaydını bulur ve "Bu sürüme dön"e basar.
3. Başarı mesajı görür ama tema değişmez. `settings` tablosunda üç anlamsız `general` satırı oluşur.

Kapsam notu: Sorun tema anahtarlarına özgü değil. Tekil `PUT` kullanan her ayarın (ör. `agent_council_profiles`) audit kaydı aynı yanlış biçimde.

Öneri:
- `PUT`'un audit biçimini `{[key]: oldValue}` olarak normalleştirin.
- Rollback anahtar başına `category` değerini korusun.
- Rollback etkilenen önbellek etiketlerini temizlesin.

### Özet

| # | İddia | Karar | Gerçek önem |
|---|---|---|---|
| 1 | Aydınlık koyu modda kırık palet | belirsiz | Bu hata yalnızca DB'de eski bir `'light'` değeri varsa oluşur. Bugünkü UI ise `activeTheme=''` yazıyor: doğrulanmış yan bulgu, orta önem. |
| 2 | Kayıt sonrası eski temanın geri yazılması | doğrulandı | Orta-yüksek: her kayıtta admin yanlış geri bildirim görür. |
| 3 | Mount'ta sabit purple ve preview olayı | doğrulandı | Düşük-orta: yalnızca o adminin oturumu etkilenir. |
| 4 | Özel tema kaydı atomik değil | doğrulandı | Orta: olasılık düşük ama etki tüm kullanıcılara yayılır. |
| 5 | Genel rollback tema audit'ini bozuyor | doğrulandı | Orta: admin verisi bozulur ve başarı mesajı yanıltır. |
