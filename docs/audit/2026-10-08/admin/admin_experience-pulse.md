# /admin/experience-pulse

**Amaç:** "Ritim stüdyosu" — müşteri tarafındaki "Ritim köşesi" ve bayi tarafındaki "Vardiya ritmi" vitrin kartlarının TR/EN metinlerini, mood (gradyan) seçimini, ipuçlarını ve CTA'sını düzenleyen tek-kayıtlık (Settings `experiencePulseStudio`) içerik editörü.

**Genel puan: 3.5 / 10** · **Karar: KALDIR** (ürün bu vitrini gerçekten istiyorsa: tüketici yüzeyi inşa edilene kadar menüden gizle, sonra genel bir "Vitrin / İçerik bloğu" sisteminin parçası olarak yeniden inşa et)

> Ana tespit: Editör teknik olarak çalışıyor, ama ürettiği içeriği **hiçbir ekran göstermiyor**. `/api/customer/experience-pulse` ve `/api/dealer/experience-pulse` uçlarını çağıran tek bir istemci kodu yok; bu uçlar ve admin sayfası aynı commit'te (18b7bb2) eklenmiş, tüketici sayfaları (Ritim köşesi / Vardiya ritmi) git geçmişinde hiç var olmamış. Aynı commit eski `experience-guide` sayfalarını sildi. Sonuç: admin kaydettiği her şey boşa gidiyor; sayfa "çalışan ama etkisiz" bir kontrol paneli.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 2/10 | Form okur/yazar ama çıktısının hiçbir kullanıcı yüzeyinde karşılığı yok; ipucu ekle/sil yok, önizleme yok, yükleme hatasında varsayılanlarla üzerine yazma riski var. |
| UX | 4/10 | 30+ alanlık düz form, önizleme yok, kaydedilmemiş değişiklik takibi yok, Kaydet yalnızca en üstte, hata mesajları ham (Zod/sunucu metni). |
| Görsel | 6/10 | Diğer admin sayfalarıyla tutarlı (AdminPremiumHero + premium kart + aksan şeridi); ancak geliştirici odaklı "API" kartı ve boş `CardDescription` gürültü yaratıyor. |
| Mimari | 3/10 | Ölü tüketici uçları, no-op modül kapıları (`dealer_shift_pulse` katalogda yok, `experience_pulse_studio` hiçbir yerde kontrol edilmiyor), upsert+audit transaction dışında, iyimser eşzamanlılık yok. |
| Performans | 7/10 | Tek `findUnique` + tek upsert; sayfa hafif. Eksi: tüketici GET uçları her çağrıda kısıtsız `analyticsEvent` INSERT yapıyor. |
| Erişilebilirlik + Mobil | 5/10 | Input'ların çoğu `Label htmlFor` ile bağlı; Mood `Label`'ı Select'e bağlı değil, yükleniyor durumu `aria-live` değil, mobilde Kaydet butonu uzun formun en üstünde kalıyor (sticky bar yok). |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişim kontrolü (proxy + admin gate + `requireAuth(['ADMIN'])`) | ÇALIŞIYOR | `proxy.ts:51,79,124`; `app/api/admin/settings/experience-pulse/route.ts:17,37` | GET ve PUT ikisi de ADMIN'e kısıtlı; IDOR yüzeyi yok (tek global kayıt). |
| 2 | Hero (eyebrow, başlık, açıklama, ikon) | ÇALIŞIYOR | `app/admin/experience-pulse/page.tsx:253-271` | Açıklama "görüntülemeler analytics'e düşer" diyor — tüketici yok, pratikte sıfır olay (bkz. #25). |
| 3 | "Yenile" butonu | KISMİ | `page.tsx:261-264`, `212-225` | Kaydedilmemiş düzenlemeleri onay sormadan siler; dirty state yok. |
| 4 | "Kaydet" butonu (PUT) | KISMİ | `page.tsx:231-249`, `265-268` | Çalışıyor; ancak hata mesajı sunucunun ham metni (`e.message`) — Zod'un İngilizce "String must contain at most 160 character(s)" mesajı TR arayüzde çıkar; `details` (alan bazlı hata) yok sayılıyor. |
| 5 | "Son yayın" zaman damgası | KISMİ | `page.tsx:273-277` | `toLocaleString()` uygulama dilini değil tarayıcı dilini kullanır; "yayın" kavramı yok (taslak/yayın ayrımı yok), yalnızca son kayıt zamanı. |
| 6 | "API" bilgi kartı | KISMİ | `page.tsx:279-287`; `messages/tr.json` `adminExperiencePulse.apiHint` | Başlık sabit kodlu "API" (i18n dışı); son kullanıcıya iç uç adlarını gösteriyor; bu uçların istemcisi olmadığı için yanıltıcı. |
| 7 | Yükleniyor durumu | KISMİ | `page.tsx:289-290` | Metin olarak "Yenile…" (reload etiketi yeniden kullanılmış); skeleton yok, `aria-live`/`aria-busy` yok. |
| 8 | Yükleme hata durumu | BOZUK | `page.tsx:207, 220-224, 265` | Hata olursa toast + form **varsayılan payload ile** görünür, Kaydet aktif kalır → admin farkında olmadan DB'deki gerçek içeriği varsayılanlarla ezebilir. Hata kartı/yeniden dene yok. |
| 9 | Boş durum (hiç kayıt yok) | ÇALIŞIYOR | `lib/experience-pulse-settings.ts:96-98, 148-155`; route `:24` | Kayıt yoksa normalize edilmiş varsayılan döner; ilk kayıtta `create_*` audit aksiyonu. |
| 10 | Müşteri vitrini düzenleyici kartı | ÇALIŞIYOR (etkisiz) | `page.tsx:293-299` | Form çalışıyor; içerik hiçbir müşteri ekranında görünmüyor. |
| 11 | Bayi vitrini düzenleyici kartı | ÇALIŞIYOR (etkisiz) | `page.tsx:300-306` | Aynı durum; bayi ekranı yok. |
| 12 | Başlık TR/EN alanları | ÇALIŞIYOR | `page.tsx:102-119`; şema `lib/experience-pulse-settings.ts:5-8,18` | İstemcide `maxLength` yok (sunucu 160); boş string kabul ediliyor (`z.string()` min yok). |
| 13 | Alt başlık TR/EN | ÇALIŞIYOR | `page.tsx:120-137` | Aynı sınır/boşluk notu. |
| 14 | Rozet metni TR/EN | ÇALIŞIYOR | `page.tsx:138-155` | Aynı. |
| 15 | Mood / gradyan seçici | KISMİ | `page.tsx:156-170`, `29` | 4 seçenek; görsel önizleme/renk swatch yok; `Label`'ın `htmlFor`'u yok (Select'e bağlı değil); `v as PulseMood` cast. |
| 16 | İpuçları (perks) düzenleme | KISMİ | `page.tsx:33-77`; şema `:22` (`min(1).max(5)`) | Başlık "en fazla 5" diyor ama ekle/sil/sırala butonu yok — admin varsayılan 3 ipucuna kilitli. |
| 17 | CTA etiketi TR/EN | ÇALIŞIYOR | `page.tsx:173-190` | — |
| 18 | CTA yolu | KISMİ | `page.tsx:191-199`; şema `lib/experience-pulse-settings.ts:24-32` | Yalnızca başa `/` ekliyor; `//evil.com` (protocol-relative) geçer; müşteri kartına `/dealer/...` yazılabilir; rota varlığı doğrulanmıyor. Şu an render eden yok → gizli (latent) açık yönlendirme. |
| 19 | Canlı önizleme (müşteri/bayi kartı nasıl görünecek) | EKSİK | — | Mood seçimi önizlemesiz anlamsız. |
| 20 | Kaydedilmemiş değişiklik takibi / çıkışta uyarı | EKSİK | — | `payload` ile sunucu snapshot'ı karşılaştırılmıyor. |
| 21 | Alan bazlı doğrulama / satır içi hata | EKSİK | route `:55-60` `details` dönüyor, sayfa kullanmıyor | — |
| 22 | Eşzamanlı düzenleme koruması (iyimser kilit) | EKSİK | route `:63-78` | Son yazan kazanır; `updatedAt` karşılaştırması yok. |
| 23 | Denetim kaydı (audit log) | ÇALIŞIYOR | route `:80-91` | old/new veri tutuluyor; ancak upsert ile aynı transaction'da değil (`:68` ve `:81` ayrı), audit başarısız olursa kayıt yine kalır ve istemci 500 alır. |
| 24 | PUT rate limit | KISMİ | route `:39-51`; `lib/rate-limit.ts:303-320` | Bellek içi `Map` → serverless örnek başına; dağıtık değil. Hata mesajı TR sabit. |
| 25 | "Görüntülemeler analytics'e düşer" | SAHTE (etkisiz) | `app/api/customer/experience-pulse/route.ts:30-43`; `app/api/dealer/experience-pulse/route.ts:89-102` | Olay yazan uçlar var ama çağıran istemci yok; admin sayfasında da görüntülenme metriği gösterilmiyor. |
| 26 | Müşteri okuma ucu `/api/customer/experience-pulse` | ÖLÜ KOD | route dosyası tamamı; repo genelinde istemci çağrısı yok | Boş `if` bloğu (`:19-21` "Feature removed: customer_pulse_lounge"), kullanılmayan `assertModuleEnabled` import'u (`:5`) ve `request` parametresi. |
| 27 | Bayi okuma ucu + modül kapısı `dealer_shift_pulse` | BOZUK / ÖLÜ | `app/api/dealer/experience-pulse/route.ts:20-28` | `dealer_shift_pulse` anahtarı `MODULE_CATALOG`'da yok (`lib/module-controls.ts`), `assertModuleEnabled` `controls[key] === false` kontrolü (`lib/module-gate.ts:100`) hiç tetiklenmez → kapı no-op. İstemcisi de yok. |
| 28 | Modül kontrolü `experience_pulse_studio` | SAHTE | `lib/module-controls.ts:55-62`; admin route'ta gate çağrısı yok | /admin/modules'ta kapatılabilir görünüyor ama hiçbir şeyi engellemiyor. |
| 29 | Bayi Keşfet menüsünde "Vardiya ritmi" | EKSİK/ÖLÜ | `app/dealer/discover/page.tsx:34`; `messages/tr.json:2570` | Tip ve çeviri anahtarı var, link yok. |
| 30 | Sayfa `<title>` metadata'sı | EKSİK | `app/admin/experience-pulse/` altında `layout.tsx` yok (karşılaştırma: `app/admin/platform-pulse/layout.tsx`) | Sekme başlığı yalnızca "Admin". |
| 31 | Mobil yerleşim | KISMİ | `page.tsx:292` (`lg:grid-cols-2`), `260` (`flex-wrap`) | Kartlar alt alta diziliyor (iyi); ama ~32 input'luk formda Kaydet en üstte, sticky alt bar yok. |
| 32 | Azaltılmış hareket | ÇALIŞIYOR | `components/admin/admin-premium-hero.tsx:9,35,73,126` | Hero `useReducedMotion` + `motion-reduce` destekli; sayfada başka animasyon yok (yükleme ikonunun `animate-spin`'i hariç). |
| 33 | i18n tutarlılığı | KISMİ | `lib/admin-toast.ts` (`'Basarili: '`, `'Dikkat: '` önekleri); route `:42,56` | Toast önekleri diakritiksiz TR ve EN arayüzde de TR; sunucu hataları TR sabit / Zod EN. `t()` değişken desteklerken `.replace('{n}', …)` elle yapılıyor (`page.tsx:50,62`). |
| 34 | Sürüm geçmişi / geri al | EKSİK | audit `oldData` var, UI yok | — |
| 35 | Varsayılana sıfırla | EKSİK | `getDefaultExperiencePulsePayload` var, UI yok | — |
| 36 | Taslak / zamanlanmış yayın / hedefleme (segment, bayi) | EKSİK | — | Tek global kayıt; bayi başına özelleştirme yok. |

**Durum sayımı (36 özellik):** Çalışıyor 11 · Kısmi 11 · Bozuk 3 · Sahte 2 · Eksik 9 (ölü kod #26 "bozuk", #29 "eksik" kümesine dahil edildi; #10–11 "çalışıyor" sayıldı ama çıktıları etkisiz).

---

## Bulgular

### 1. [KRİTİK · Ürün/Mimari] Editörün ürettiği içeriği gösteren hiçbir yüzey yok
- **Kanıt:** `/api/customer/experience-pulse` ve `/api/dealer/experience-pulse` repo genelinde hiçbir `.ts/.tsx` istemcisinden çağrılmıyor (grep: yalnızca route dosyaları ve `apiHint` çeviri metni). `app/customer`/`app/dealer` altında pulse sayfası yok; `git log -G "experience-pulse"` yalnızca 18b7bb2'yi döndürüyor; o commit `app/customer/experience-guide/page.tsx` ve `app/dealer/experience-guide/page.tsx`'i silmiş, yerine tüketici sayfası eklememiş. Müşteri ucu yorumu: "Feature removed: customer_pulse_lounge" (`app/api/customer/experience-pulse/route.ts:20`).
- **Sorun:** Admin menüsünde (`components/dashboard/sidebar.tsx:204`) ve modül kataloğunda yer alan, denetim kaydı üreten bir editör, sıfır kullanıcı etkisiyle çalışıyor. Operatöre "yayınladım" hissi veriyor ("Son yayın"), ama hiçbir müşteri/bayi bunu görmüyor. Bu, admin paneline güveni aşındıran en kötü tür "sahte işlev".
- **Öneri:** Kısa vadede sayfayı menüden kaldır, `experience_pulse_studio` modül kaydını ve iki tüketici ucunu sil (Settings satırı zararsız kalabilir). Ürün bu vitrini istiyorsa önce tüketici bileşenini (`components/customer/pulse-spotlight-card.tsx` benzeri; müşteri dashboard'unda ve bayi operasyon özetinde bir kart) inşa et, sonra editörü genel bir "Vitrin blokları" sistemine taşı (bkz. yeniden tasarım).
- **Efor:** S (kaldırma) / L (gerçek tüketici + editör yeniden inşası)

### 2. [YÜKSEK · Güvenlik/Performans] Tüketici GET uçları her çağrıda kısıtsız AnalyticsEvent INSERT yapıyor
- **Kanıt:** `app/api/customer/experience-pulse/route.ts:30-43`, `app/api/dealer/experience-pulse/route.ts:89-102`; iki uçta da rate limit yok; `proxy.ts`'de global API rate limit yok.
- **Sorun:** UI tarafından hiç kullanılmayan bu uçlar, oturum açmış her müşteri/bayi tarafından döngüyle çağrılabilir; her çağrı canlı Neon'a bir `analyticsEvent` satırı yazar (tekilleştirme, oturum başına sınır yok). Ölü bir uç, gerçek bir yazma-şişirme vektörü. Ayrıca `experience_pulse_view` olayları analitik raporları kirletebilir.
- **Öneri:** Uçları kaldır (Bulgu 1). Tutulacaksa: görüntülenme olayını istemciden PostHog'a gönder veya sunucuda `userId+gün` anahtarlı Redis `SET NX` ile günde bir kez yaz; uçlara `checkRateLimit` ekle.
- **Efor:** S

### 3. [ORTA · Veri bütünlüğü] Yükleme başarısız olursa varsayılanlar gösterilip Kaydet açık kalıyor
- **Kanıt:** `page.tsx:207` (başlangıç state = varsayılan), `220-224` (catch yalnızca toast), `265` (`disabled={saving || loading}` — hata durumu yok).
- **Sorun:** Geçici ağ/DB hatasında admin varsayılan metinleri gerçek içerik sanıp düzenleyip kaydedebilir; mevcut özelleştirmeler sessizce ezilir (audit'te kalır ama geri alma UI'ı yok).
- **Öneri:** `loadState: 'loading' | 'error' | 'ready'` ayrımı; hata durumunda formu gösterme, "Yeniden dene" içeren hata kartı göster; Kaydet yalnızca `ready` iken aktif. PUT'a `expectedUpdatedAt` ekleyip sunucuda uyuşmazlıkta 409 dön (Bulgu 6 ile birlikte).
- **Efor:** S

### 4. [ORTA · Mimari] Modül kapıları no-op
- **Kanıt:** `dealer_shift_pulse` (`app/api/dealer/experience-pulse/route.ts:20`) `MODULE_CATALOG`'da yok (`lib/module-controls.ts`); `assertModuleEnabled` yalnızca `controls[key] === false` ise engelliyor (`lib/module-gate.ts:100`) → hiç tetiklenmez. `experience_pulse_studio` (`lib/module-controls.ts:56`) hiçbir route'ta kontrol edilmiyor. Müşteri ucunda kapı tamamen silinmiş, boş `if` kalmış (`route.ts:19-21`) ve `assertModuleEnabled` import'u kullanılmıyor (`:5`).
- **Sorun:** /admin/modules ekranındaki anahtar operatöre kontrol yanılsaması veriyor. Bu desen başka modüllerde de varsa (katalogda olmayan anahtarla `assertModuleEnabled`) sistematik bir sorun — doğrulanmadı.
- **Öneri:** `assertModuleEnabled` için anahtar tipini `MODULE_CATALOG` anahtarlarından türetilen bir union yap (`type ModuleKey = typeof MODULE_CATALOG[number]['key']` ve katalogu `as const`), böylece katalogda olmayan anahtar derleme hatası verir. Bu sayfa kaldırılırsa ilgili katalog girdisini de sil.
- **Efor:** S (bu sayfa) / M (tip güvenli katalog)

### 5. [ORTA · Güvenlik (latent)] CTA yolu doğrulaması zayıf
- **Kanıt:** `lib/experience-pulse-settings.ts:24-32` ve `:134-135` — yalnızca başa `/` ekleniyor.
- **Sorun:** `//attacker.example` değeri `/` ile başladığı için aynen saklanır; ileride bir `<Link href>`/`<a href>` ile render edilirse protocol-relative dış yönlendirme olur. Müşteri kartına bayi rotası da yazılabilir.
- **Öneri:** Şemada `^/(?!/)` regex'i, rol önekine göre izin listesi (`customer` yüzü için `/customer/`, bayi için `/dealer/`) ve UI'da serbest metin yerine mevcut rota kataloğundan (sidebar/discover href'leri) seçilen bir combobox.
- **Efor:** S

### 6. [ORTA · UX] Form deneyimi: önizleme yok, dirty state yok, ipucu ekle/sil yok, ham hata
- **Kanıt:** Önizleme bileşeni yok; `payload` snapshot karşılaştırması yok (`page.tsx:207-249`); ipucu ekle/sil yok (`page.tsx:47-74` yalnızca map) ama başlık "en fazla 5" (`adminExperiencePulse.perksHeading`); `toast.error(e.message)` (`page.tsx:245`) ve sunucunun `details`'i kullanılmıyor (route `:58`); istemci `maxLength` yok.
- **Sorun:** Mood gibi tamamen görsel bir ayar, sonucu görmeden seçiliyor; Yenile kaydedilmemiş işi siliyor; 161. karakterde admin İngilizce Zod mesajı alıyor ve hangi alanın hatalı olduğunu bilmiyor.
- **Öneri:** `react-hook-form` + `zodResolver(pulseFaceSchema)` ile alan bazlı hata; `maxLength` ve karakter sayacı; `useFieldArray` ile ipucu ekle/sil/sürükle-sırala (1–5); `isDirty` ile sticky "Kaydedilmemiş değişiklikler · Vazgeç / Kaydet" alt barı ve `beforeunload` uyarısı; Yenile'de dirty ise satır içi onay.
- **Efor:** M

### 7. [DÜŞÜK · Mimari] Upsert ve audit log transaction dışında; eşzamanlı yazmada son yazan kazanır
- **Kanıt:** route `:63-91` — `findUnique`, `upsert`, `auditLog.create` üç ayrı çağrı.
- **Sorun:** Audit yazımı başarısız olursa ayar kaydedilmiş ama istemci 500 almış olur (tekrar deneme ikinci audit'siz kaydı tetikler). İki admin aynı anda düzenlerse biri sessizce kaybolur.
- **Öneri:** `prisma.$transaction([...])` ve `expectedUpdatedAt` ile iyimser kilit (409 + "başkası güncelledi, farkı gör" UI'ı).
- **Efor:** S

### 8. [DÜŞÜK · i18n/Erişilebilirlik] Dil karışıklığı ve küçük a11y açıkları
- **Kanıt:** `CardTitle` "API" sabit (`page.tsx:283`); toast önekleri "Basarili:/Dikkat:" diakritiksiz ve EN arayüzde de TR (`lib/admin-toast.ts`); `toLocaleString()` uygulama dilini almıyor (`page.tsx:275`); Mood `Label` `htmlFor`'suz (`page.tsx:157`); boş `<CardDescription />` (`page.tsx:99`); yükleniyor metni = "Yenile…" (`page.tsx:290`); sayfaya özgü metadata yok.
- **Öneri:** `Intl.DateTimeFormat(locale)` + göreli zaman; Select'e `id` verip Label'ı bağla; yükleme için skeleton + `aria-busy`; `layout.tsx` ile `adminLayoutSectionMetadata` (platform-pulse'taki gibi); admin-toast öneklerini i18n'e taşı (sistem genelinde).
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog)

1. **Canlı yan yana önizleme** — Stripe'ın e-posta/checkout markalama ekranı gibi, düzenlerken gerçek bileşenin TR/EN ve açık/koyu tema önizlemesi.
2. **Taslak → yayın akışı ve sürüm geçmişi** — audit `oldData` zaten tutuluyor; "Sürümler" çekmecesi, fark görünümü ve tek tıkla geri al (Linear/Retool sürüm geçmişi).
3. **Etki metrikleri** — PostHog tarzı: görüntülenme, CTA tıklama oranı, mood'a göre CTR; içerik değiştiğinde öncesi/sonrası karşılaştırma.
4. **Hedefleme ve zamanlama** — segment/bayi/lokasyon bazında farklı vitrin, başlangıç–bitiş tarihi (PostHog feature flag payload'u gibi).
5. **Alan bazlı doğrulama + rota seçici** — serbest metin yerine mevcut rotalardan seçim, karakter sayaçları.
6. **Eşzamanlı düzenleme koruması** — 409 + fark çözümleme.

---

## Yeniden tasarım vizyonu

**Önkoşul:** Önce tüketici yüzeyi. Müşteri dashboard'unda (`components/customer/dashboard/customer-dashboard.tsx`) bir "Ritim kartı" ve bayi operasyon özetinde (`/dealer/operations-brief`) bir "Vardiya ritmi" kartı; ikisi de aynı `PulseSpotlightCard` bileşenini ve sunucu bileşeninde Redis cache'li (`unstable_cache` + tag) okuma helper'ını kullanır (build-time DB fail-safe kuralına uygun try/catch + varsayılan). Bu yapılmadan editörün yaşaması anlamsız.

**Hedef deneyim (admin):** "Vitrin blokları" — tek tip, çok yüzeyli içerik editörü.
- **Yerleşim:** Solda yüzey listesi (Müşteri dashboard, Bayi operasyon özeti, ileride başka slotlar); ortada form (sekme: TR | EN, alanlar karakter sayaçlı, ipucu listesi `useFieldArray` + sürükle-sırala); sağda yapışkan canlı önizleme (gerçek `PulseSpotlightCard`, dil ve tema anahtarı, mobil/masaüstü genişlik anahtarı). Altta sticky eylem barı: dirty göstergesi · Vazgeç · Taslak kaydet · Yayınla.
- **Üst şerit:** Yayın durumu rozeti (Taslak / Yayında / Zamanlanmış), son yayınlayan kişi + göreli zaman, son 7 gün görüntülenme ve CTA CTR mini-sparkline.
- **Motion/3D:** 3D gereksiz. Önizlemede mood değişiminde gradyanın 200–300 ms crossfade'i (framer-motion `m` + `AnimatePresence`, `useReducedMotion` ile anlık geçiş); kaydetmede eylem barında küçük onay mikro-etkileşimi. Hero'nun mevcut "breathe" animasyonu yeterli.
- **Veri/API:**
  - Settings JSON yerine (veya yanında) `ContentBlock { id, surface, locale-json, mood, ctaPath, status, publishAt, unpublishAt, version, updatedById }` modeli; geçmiş için `ContentBlockVersion`.
  - `PUT` gövdesine `expectedVersion`; `$transaction` içinde yazım + audit; 409 çakışma.
  - Rota izin listesi şemada (`^/(?!/)` + rol öneki).
  - Görüntülenme/CTA olayları istemciden PostHog'a; sunucu tarafında günlük tekilleştirme; admin üst şeridi PostHog/Redis'ten özet okur.
  - `assertModuleEnabled` anahtarları katalogdan türetilen tip ile.

---

## Çakışmalar / birleştirme önerisi

- **Doğrudan kopya yok.** `/admin/platform-pulse` isim olarak karışıyor ama tamamen farklı (platform metrik paneli, `app/api/admin/platform-pulse/route.ts`); menüde yan yana "pulse" adları operatörü yanıltabilir.
- **Kavramsal birleşme adayı:** `/admin/pages` (CMS sayfaları) ve `/admin/design-language`/`/admin/themes` — hepsi "kullanıcıya görünen içerik/görünüm" yönetimi. Bu sayfa yaşatılacaksa ayrı bir menü öğesi değil, `/admin/pages` altında "Vitrin blokları" sekmesi olmalı. (Bu sayfaların ayrıntılı kapsamı bu denetimde doğrulanmadı.)
- **Öneri:** Şimdilik **kaldır**: `app/admin/experience-pulse/`, `app/api/admin/settings/experience-pulse/`, `app/api/customer/experience-pulse/`, `app/api/dealer/experience-pulse/`, `lib/module-controls.ts` içindeki `experience_pulse_studio` girdisi, sidebar satırı (`components/dashboard/sidebar.tsx:204`), `app/dealer/discover/page.tsx:34` `shift_pulse` tipi, ilgili çeviri anahtarları ve `lib/data/admin-api-catalog.json:692-697`. Ürün kararı "vitrin istiyoruz" olursa yukarıdaki vizyonla yeniden inşa et.

---

## Doğrulama (şüpheci inceleme)

### İddia 1 — Kullanılmayan müşteri/bayi experience-pulse GET uçları her çağrıda kısıtsız analyticsEvent satırı yazıyor

**Karar: DOĞRULANDI (olgular doğru; önem derecesi abartılı — gerçekçi seviye ORTA/DÜŞÜK, KRİTİK/YÜKSEK değil).**

Okunarak doğrulanan olgular:
- `app/api/customer/experience-pulse/route.ts:30-43` ve `app/api/dealer/experience-pulse/route.ts:36-49`: ADMIN dışındaki her GET çağrısında koşulsuz `prisma.analyticsEvent.create` yapılıyor; tekilleştirme (kullanıcı+gün), örnekleme veya sayaç yok. (İddiadaki dealer satır aralığı `89-102` yanlış; dosya 59 satır, doğru aralık 36-49.)
- Rate limit yok: `proxy.ts:105-119` `/api/` isteklerini yalnızca güvenlik/CORS başlıklarıyla geçiriyor; `lib/api-auth.ts` içinde de limit yok.
- İstemci yok: `app/`, `lib/`, `components/`, `hooks/` altında `/api/customer/experience-pulse` veya `/api/dealer/experience-pulse` çağıran hiçbir kod bulunmadı; tek referanslar `messages/tr.json:3026` ve `messages/en.json:3026` içindeki bilgi metni.
- Müşteri kapısı silinmiş: `app/api/customer/experience-pulse/route.ts:19-21` boş `if` gövdesi (yalnızca yorum); `assertModuleEnabled` import'u (satır 5) ölü.
- Bayi kapısı etkisiz: `dealer_shift_pulse` anahtarı `lib/module-controls.ts:17-69` `MODULE_CATALOG` içinde yok. `normalizeModuleControls` (`lib/module-controls.ts:78-88`) yalnızca katalog anahtarlarını korur, bu yüzden `controls['dealer_shift_pulse']` her zaman `undefined` olur ve `lib/module-gate.ts:100` asla `true` vermez. Rol görünürlüğü tarafında da `normalizeRoleVisibility` (`lib/visibility-controls.ts:129-137`) yalnızca `scope: 'dealer'` katalog anahtarlarını tutar, dolayısıyla `lib/module-gate.ts:101` de asla engellemez. Admin bu ucu hiçbir ayardan kapatamaz.
- Veri kalıcılığı: `AnalyticsEvent` (`prisma/schema.prisma:1028-1042`) üzerinde süre sonu/TTL yok ve `app/api/cron/db-cleanup/route.ts:11` açıkça "AnalyticsEvent SİLİNMEZ" diyor; yazılan satırlar kalıcı olarak birikiyor.

Yeniden üretim senaryosu (salt mantıksal, çalıştırılmadı):
1. Herhangi bir CUSTOMER hesabıyla oturum aç, oturum çerezini al.
2. `for i in $(seq 1 100000); do curl -s -b "<oturum çerezi>" https://<alan>/api/customer/experience-pulse >/dev/null; done`
3. Her istek canlı Neon'da 1 `settings.findUnique` + 1 `AnalyticsEvent` INSERT (3 indeks + bileşik indeks güncellemesi) yapar → 100.000 kalıcı satır; temizleme cron'u bunları silmez. Bayi hesabıyla `/api/dealer/experience-pulse` için aynısı geçerli; modül kapısı engellemez.

Önem derecesine neden itiraz ediyorum:
- Saldırı oturum açmış hesap gerektiriyor; hiçbir ayrıcalık yükseltmesi, veri sızıntısı veya puan basımı yok. Döndürülen veri (`spotlight`) zaten herkese açık vitrin içeriği.
- Aynı desen kod tabanında yaygın: `app/api` altında 33 `route.ts` dosyası `analyticsEvent.create` yapıyor ve hiçbirinde genel limit yok. Yani sorun bu sayfaya özgü değil, sistem genelinde "kimliği doğrulanmış yazma çoğaltma" sınıfının bir örneği. Bu uçların farkı yalnızca işlevsiz (istemcisiz) olmaları, yani maliyetin karşılığında hiçbir ürün değeri olmaması.
- Gerçek etki: tablo şişmesi, Neon depolama/yazma maliyeti ve `experience_pulse_view` analitiğinin kirlenmesi (bu olayı okuyan bir panel de bulunamadı, yani analitik değeri zaten sıfır).

Öneri (ürün seviyesi):
- Kısa vade: Bu iki uç istemcisiz ölü kod olduğu için raporun "Çakışmalar / birleştirme" bölümündeki kaldırma önerisiyle birlikte sil. Saklanacaksa: görüntülenme kaydını sunucudan çıkar, istemci tarafı PostHog olayına taşı; ya da Upstash Redis üzerinde `SET pulse_view:{userId}:{yyyy-mm-dd} NX EX 86400` ile kullanıcı-gün tekilleştirmesi yap ve yalnızca ilk görüntülemede yaz.
- Kapı tutarlılığı: `assertModuleEnabled` imzasını `ModuleKey = (typeof MODULE_CATALOG)[number]['key']` tipine daralt (katalog `as const` olmalı); böylece `dealer_shift_pulse` gibi katalogda olmayan anahtarlar derleme hatası verir. Müşteri ucunda boş `if` bloğunu ve ölü import'u kaldır ya da gerçek bir `experience_pulse` müşteri modül anahtarı ekle.
- Sistem geneli: `lib/api-auth.ts` `requireAuth` üstüne isteğe bağlı, Upstash tabanlı kullanıcı başı kayan pencere limiti (`@upstash/ratelimit`) ekle ve analitik yazan GET uçlarına uygula; bu bulgu tek sayfalık değil, 33 uçluk bir sınıf olarak ele alınmalı.

---

## Uygulama (Dalga 2)

Karar uygulandı (**KALDIR**, yol haritası §6.3): editörün çıktısını gösteren hiçbir yüzey yoktu. Silinenler: sayfa gövdesi (artık `/admin`'e sorgu parametrelerini koruyan `permanentRedirect`), `app/api/admin/settings/experience-pulse/route.ts`, iki ölü tüketici GET ucu `app/api/customer/experience-pulse/route.ts` ve `app/api/dealer/experience-pulse/route.ts` (her çağrıda kısıtsız `AnalyticsEvent` yazıyordu), `lib/experience-pulse-settings.ts` ve `lib/module-controls.ts` içindeki `experience_pulse_studio` modül satırı. `Settings.experiencePulseStudio` satırı (varsa) zararsız veri olarak kalır; okuyan kod yok.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Gerekçe |
|---|---|---|---|
| 1-36 | Tüm özellikler (editör, form alanları, mood, ipuçları, CTA, kaydet/yenile, API kartı, tüketici uçları, modül kapıları, audit) | KALDIRILDI | Tüketicisi olmayan ayar yoktur (§4.4-8); içerik hiçbir müşteri/bayi ekranında gösterilmiyordu. |
| 25 | "Görüntülemeler analytics'e düşer" | KALDIRILDI | Olay yazan uçlar silindi; yazma-şişirme yüzeyi kapandı. |
| 26-27 | Ölü tüketici uçları | KALDIRILDI | Silindi. |
| 28 | `experience_pulse_studio` sahte modül | KALDIRILDI | Katalogdan çıkarıldı. |
| 29 | "Vardiya ritmi" keşif tipi | KALDIRILDI | Bu yüzeyden link yoktu; bayi keşif sayfasındaki tip/çeviri anahtarı o yüzeyin sahipliğinde. |

### Kapanan bulgular
1 · 2 · 3 · 4 · 5 (açık yönlendirme yüzeyi kod ile birlikte gitti) · 6 · 7 · 8 — **8/8**.

### Kalanlar
- `messages/{tr,en}.json → adminExperiencePulse` anahtarları ve `lib/navigation/legacy-nav.ts`'teki eski satır paylaşılan dosyalarda; okuyan sayfa yok, navigasyon ajanı / i18n temizliği kaldıracak. Kayıtta `redirectFrom` zaten `/admin`.
- Ürün bu vitrini isterse genel bir "Vitrin blokları" sistemiyle, önce tüketici bileşeni yazılarak yeniden kurulmalı.
