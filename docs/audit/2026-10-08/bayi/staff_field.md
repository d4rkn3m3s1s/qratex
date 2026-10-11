# /staff/field

**Amaç:** İşletme personelinin (STAFF rolü) vardiya sırasında kısa bir saha notu ("Kasa yoğun", "Kısa kesinti") ve isteğe bağlı GPS konumu göndermesi; bu notların işletme yöneticisine operasyonel sinyal olarak ulaşması.

**Genel puan: 3/10** · **Karar: birleştir** (personel ana paneline "Hızlı saha bildirimi" olarak taşınmalı; arka uç ise `/dealer/incidents` + `/dealer/team` tarafında tüketilen gerçek bir veri modeline bağlanmalı)

Kısa özet: Sayfa teknik olarak "gönder → kaydet → listele" döngüsünü çalıştırıyor, ama ürün olarak **tek yönlü bir kara delik**. Gönderilen pingleri yönetici tarafında okuyan **hiçbir ekran ya da API yok**; açıklama metnindeki "Yönetici panellerinde analitik olarak görülür" ve "offline vardiya" vaatleri gerçek değil. Liste de ham JSON bastığı için iş arkadaşlarının kesin GPS koordinatlarını ve iç `dealerId`'yi personele gösteriyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Kayıt yazılıyor ama hiçbir tüketici yok; doğrulama hatası `[object Object]` olarak görünüyor, boş ping engellenmiyor, offline vaadi karşılıksız. |
| UX | 3/10 | Liste ham `JSON.stringify` çıktısı, kimin yazdığı belli değil, yükleniyor/hata durumu yok, hızlı şablon (çip) yok; 15 sn'ye varan konum beklemesinde hiçbir açıklama yok. |
| Görsel | 4/10 | shadcn kartlarıyla temiz ve tutarlı ama "monospace JSON kutusu" bir son kullanıcı ekranında bulunmamalı; durum/öncelik görsel dili yok. |
| Mimari | 3/10 | İş verisi `AnalyticsEvent` JSON alanına yazılıyor (analitik tablosu, 90 gün retention ile silinir), sorgu JSON path filtresiyle; ayrı model/durum alanı yok; `DealerStaff.isActive` kontrol edilmiyor. |
| Performans | 7/10 | Tek küçük GET + tek POST; `event` indeksi seçici. JSON path filtresi indekssiz ama 7 gün + 25 satır sınırıyla şimdilik sorun değil. |
| Erişilebilirlik + mobil | 4/10 | Mobil yerleşim düzgün (`max-w-lg`, tam genişlik buton), ama `Label` input'a bağlı değil, form yok (Enter çalışmıyor), canlı bölge/aria-busy yok, metinlerin çoğu sabit Türkçe. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (başlık/açıklama i18n) | ÇALIŞIYOR | `app/staff/field/page.tsx:5-7`, `messages/tr.json:137-138` | "Saha kaydı" / "Field check-in". Sayfa içi başlık ise "Saha modu" — isimlendirme tutarsız. |
| 2 | Rol kapısı (yalnız STAFF) | ÇALIŞIYOR | `app/staff/layout.tsx:30-33` | Rol dışı kullanıcı `/auth/login`'e yönleniyor. |
| 3 | İçeriğe atla bağlantısı | ÇALIŞIYOR | `app/staff/layout.tsx:36` | |
| 4 | Üst bar: site adı, kullanıcı adı, Çıkış | ÇALIŞIYOR | `app/staff/layout.tsx:37-53` | "Personel" ve "Çıkış" sabit Türkçe. |
| 5 | Route loading / error boundary | ÇALIŞIYOR | `app/staff/loading.tsx:1`, `app/staff/error.tsx:10-19` | Sentry'ye raporluyor. |
| 6 | "Panele dön" bağlantısı | ÇALIŞIYOR | `staff-field-client.tsx:80-82` | Sabit Türkçe metin. |
| 7 | Başlık kartı + açıklama | SAHTE | `staff-field-client.tsx:88-90` | "QR / offline vardiya" ve "Yönetici panellerinde analitik olarak görülür" iddiaları karşılıksız (bkz. #20, #21). |
| 8 | Not alanı (maks. 240) | KISMİ | `staff-field-client.tsx:101-102`, `route.ts:11` | Sınır istemci ve sunucuda tutarlı; ama `Label` `htmlFor` yok, karakter sayacı yok, placeholder yok. |
| 9 | Konum alma (Geolocation API) | KISMİ | `staff-field-client.tsx:39-60` | Çalışıyor; ama `enableHighAccuracy` + `timeout: 15000` ile kullanıcı 15 sn'ye kadar sadece dönen ikon görüyor; `coords.accuracy` gönderilmiyor; konum gönderimi kapatılamıyor (anahtar yok). |
| 10 | Konum reddi / alınamadı bildirimi | ÇALIŞIYOR | `staff-field-client.tsx:55-59` | Sabit Türkçe toast. |
| 11 | Gönder butonu + spinner + çift tıklama engeli | ÇALIŞIYOR | `staff-field-client.tsx:104-107` | `disabled={sending}` doğru. |
| 12 | Boş ping engeli | EKSİK | `staff-field-client.tsx:64`, `route.ts:10-14` | Not da konum da yokken `{dealerId, note:null, latitude:null, longitude:null}` kaydı oluşuyor. |
| 13 | Doğrulama hatası mesajı | BOZUK | `route.ts:57` + `staff-field-client.tsx:67` | Sunucu `error: parsed.error.flatten()` (nesne) dönüyor; istemci `new Error(j.error)` yapıyor → toast'ta "[object Object]". |
| 14 | Başarı toast'ı + not temizleme + listeyi yenileme | ÇALIŞIYOR | `staff-field-client.tsx:68-70` | Toast metni sabit Türkçe ("Saha ping kaydedildi"). |
| 15 | Son kayıtlar listesi (7 gün, 25 kayıt) | KISMİ | `route.ts:23-33`, `staff-field-client.tsx:118-130` | Veri doğru kapsamda (işletme), ama satır içeriği ham JSON. |
| 16 | Kayıt içeriğinin gösterimi | BOZUK | `staff-field-client.tsx:125-127` | `JSON.stringify(p.data)` → `{"dealerId":"c…","note":"…","latitude":41.0…,"longitude":29.0…}`. İç kimlik ve kesin koordinat son kullanıcıya basılıyor. |
| 17 | Kaydı kimin gönderdiği | EKSİK | `route.ts:32`, `staff-field-client.tsx:18` | API `userId` dönüyor ama istemci tipinde bile yok; isim gösterilmiyor. Liste tüm ekibin pinglerini karışık gösteriyor. |
| 18 | Liste yükleniyor durumu | EKSİK | `staff-field-client.tsx:18, 119-120` | İlk render'da `pings=[]` → veri gelmeden "Henüz kayıt yok" yanıltıcı boş durumu yanıp sönüyor. |
| 19 | Liste hata durumu | BOZUK | `staff-field-client.tsx:20-28` | `r.ok` kontrol edilmiyor, `catch` sessizce yutuyor → 500/403'te de "Henüz kayıt yok" görünüyor. |
| 20 | Yönetici tarafında görünürlük | SAHTE | `staff-field-client.tsx:89-90`; `staff_field_ping` yalnız `app/api/staff/field-ping/route.ts:25,63`'te geçiyor | `/dealer/team` (`app/dealer/team/page.tsx:79-94`) pingleri çekmiyor; `/api/customer/analytics` yalnız `points_credited` okuyor; admin tarafında da tüketici yok. Veri yazılıp hiç okunmuyor. |
| 21 | Offline gönderim / kuyruk | SAHTE | `staff-field-client.tsx:61-65, 89` | Ağ yokken `fetch` atar, toast'ta "Failed to fetch" görünür; kuyruk/Background Sync/IndexedDB yok. |
| 22 | Göreli zaman gösterimi | KISMİ | `staff-field-client.tsx:124`, `lib/utils.ts:33-36` | `locale` parametresi geçilmiyor → İngilizce arayüzde de "5 dakika önce". |
| 23 | i18n | KISMİ | `staff-field-client.tsx:12, 67` | `useAppT` yalnız tek anahtar için kullanılıyor; diğer ~15 metin sabit Türkçe. |
| 24 | Enter ile gönderme / form semantiği | EKSİK | `staff-field-client.tsx:99-107` | `<form onSubmit>` yok; mobil klavyede "Git" tuşu bir şey yapmıyor. |
| 25 | Hızlı şablon çipleri ("Kasa yoğun", "Kısa kesinti") | EKSİK | `staff-field-client.tsx:97` | Örnekler sadece açıklama metninde; tek dokunuşla seçilemiyor. |
| 26 | Kategori / öncelik | EKSİK | `route.ts:10-14` | Şema yalnız `note/latitude/longitude`; "acil" ile "bilgi" ayrımı yok. |
| 27 | Fotoğraf eki | EKSİK | — | Saha raporlamasında standart (bozuk ekipman, dökülme vb.). |
| 28 | Rate limit | EKSİK | `route.ts:47-84`; `proxy.ts`'de rate limit yok | Bir personel döngüyle sınırsız kayıt basabilir. |
| 29 | Pasif personel engeli (`DealerStaff.isActive`) | BOZUK | `lib/api-auth.ts:158-168`, `prisma/schema.prisma:2438`, `app/api/dealer/staff/[id]/route.ts:20-25` | `dealerId` yalnız giriş anındaki JWT'den; işletme personeli pasifleştirse de token süresince ping atıp ekibin konumlarını okuyabilir. |
| 30 | Konum verisi için KVKK aydınlatma/rıza | EKSİK | `staff-field-client.tsx:88-90` | Çalışan konumu kişisel veri; ne amaç ne saklama süresi ne de kimin göreceği yazıyor. |
| 31 | Saklama süresi | KISMİ | `lib/analytics-event-retention.ts:9, 17-26` | Analitik tablosunun genel 90 gün temizliğine tabi; iş kaydı olarak bilinçli bir politika değil. |

---

## Bulgular

### 1. Pingler hiçbir yerde okunmuyor — sayfanın vaadi sahte
- **Önem:** kritik · **Kategori:** işlevsellik / ürün · **Efor:** M
- **Kanıt:** `staff-field-client.tsx:89-90` ("Yönetici panellerinde analitik olarak görülür"); `staff_field_ping` dizesi kod tabanında yalnız `app/api/staff/field-ping/route.ts:25,63`'te geçiyor. `app/dealer/team/page.tsx:79-94` personel/görev/vardiya/izin/eğitim/checklist çekiyor ama pingleri çekmiyor. `app/dealer/incidents` ise yalnız `DEALER`/`ADMIN` rolüne açık (`app/api/dealer/incidents/route.ts:33,86`).
- **Sorun:** Personel "kasa yoğun" ya da "kesinti var" yazdığında bunu bir yöneticinin göreceğine inanıyor; gerçekte veri analitik tablosuna düşüp 90 gün sonra siliniyor. Bu, güven kaybına yol açan sahte bir geri bildirim döngüsü.
- **Öneri:** Pingi bir "iş nesnesi"ne dönüştürün: yöneticinin gördüğü, onayladığı, kapattığı bir kayıt. En az iki tüketici gerekli: (a) `/dealer/team` içinde "Saha akışı" sekmesi (kim, ne zaman, ne, harita küçük resmi, "gördüm/çözüldü" aksiyonu), (b) kategorisi "kesinti/arıza" olan bildirimlerin `/dealer/incidents`'a otomatik olay olarak düşmesi ve bayiye push/bildirim merkezi üzerinden anlık uyarı. Bu yapılana kadar açıklama metni dürüst hale getirilmeli.

### 2. Liste ham JSON basıyor; iş arkadaşlarının kesin GPS koordinatları açığa çıkıyor
- **Önem:** yüksek · **Kategori:** gizlilik / UX · **Efor:** S
- **Kanıt:** `route.ts:28` (filtre yalnız `dealerId`, kullanıcı değil), `route.ts:32` (`data` tamamen dönüyor), `staff-field-client.tsx:125-127` (`JSON.stringify(p.data)`).
- **Sorun:** Aynı işletmedeki her personel, diğer personellerin son 7 gündeki notlarını ve tam hassasiyetli enlem/boylamını (ev adresine kadar inebilir, ör. vardiya dışı ping) görüyor; yanında iç `dealerId` de basılıyor. Kimin gönderdiği gösterilmediği için anonim ama yine de kişisel konum verisi. KVKK açısından "veri minimizasyonu" ihlali.
- **Öneri:** API'de iki ayrı görünüm: personel için `GET` yalnız `userId = session.user.id` kayıtlarını, koordinat yerine "konum eklendi ✓" bayrağıyla dönsün; ekip görünümü yöneticiye (DEALER) ait ayrı bir uçta olsun. İstemcide satırı yapılandırılmış render edin: zaman, not, kategori çipi, konum ikonu. `dealerId` hiçbir zaman istemciye dönmemeli.

### 3. Doğrulama hatası "[object Object]" olarak gösteriliyor
- **Önem:** yüksek · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** `route.ts:57` `{ error: parsed.error.flatten() }` + `staff-field-client.tsx:67` `throw new Error(j.error || …)`.
- **Sorun:** Zod hata nesnesi `Error` mesajına string'e çevrilir → toast "[object Object]". Ayrıca sunucu HTML hata sayfası dönerse (`r.json()` atar) "Unexpected token <" gibi teknik metin görünür.
- **Öneri:** Proje genelinde tek bir API hata sözleşmesi: `{ error: string, code: string, fields?: Record<string,string[]> }`. İstemcide `fetchJson` yardımcısı `r.ok` + content-type kontrol edip i18n'li mesaja çevirsin; alan hataları input altında gösterilsin.

### 4. Pasifleştirilmiş personel ping atmaya ve ekibin kayıtlarını okumaya devam edebiliyor
- **Önem:** yüksek · **Kategori:** yetki · **Efor:** M
- **Kanıt:** `lib/api-auth.ts:158-168` (yalnız JWT'deki `dealerId`); `lib/auth.ts:254-256` (dealerId yalnız oturum açılışında yazılıyor); `prisma/schema.prisma:2438` `isActive`; `app/api/dealer/staff/[id]/route.ts:20-25` pasifleştirme oturumu düşürmüyor.
- **Sorun:** İşten ayrılan/pasife alınan çalışan, JWT süresi boyunca işletmenin saha akışını (ve bulgu #2 nedeniyle koordinatları) okuyabilir, sahte kayıt basabilir. Bu sistemik bir sorun (tüm `/api/staff/*` uçları aynı yardımcıyı kullanıyor) ama bu sayfada etkisi en çok konum verisinde.
- **Öneri:** `getStaffDealerId`'i asenkron, `DealerStaff { userId, isActive }` doğrulayan ve sonucu Upstash Redis'te kısa TTL ile (ör. 60 sn) önbellekleyen bir `requireActiveStaff()` ile değiştirin; pasifleştirmede ilgili cache anahtarını silin (token-replay için kurulan "Redis sıcak katman + DB kaynak-doğruluk" desenini yeniden kullanın).

### 5. "Offline vardiya" vaadi karşılıksız
- **Önem:** orta · **Kategori:** işlevsellik · **Efor:** M
- **Kanıt:** `staff-field-client.tsx:89` metni; `61-65` düz `fetch`; offline kuyruk/IndexedDB/Background Sync kodu yok.
- **Sorun:** Saha senaryosu (bodrum depo, zayıf şebeke) tam da ağın koptuğu yer; şu an not kaybolur ve kullanıcı yalnız "Failed to fetch" görür (not alanı temizlenmediği için metin kalır ama kullanıcı yeniden göndermesi gerektiğini bilmez).
- **Öneri:** next-pwa zaten kurulu: istemci tarafında `idb-keyval` ile "bekleyen bildirimler" kuyruğu, `online` olayında ve sayfa açılışında boşaltma; her kayda istemci tarafında `clientId` (UUID) verip sunucuda idempotent `upsert` ile tekrar gönderimde çift kayıt önleme. UI'da "2 bildirim gönderilmeyi bekliyor" rozeti.

### 6. Veri modeli yanlış yerde: iş kaydı analitik tablosunda
- **Önem:** orta · **Kategori:** mimari · **Efor:** M
- **Kanıt:** `route.ts:60-72` (`prisma.analyticsEvent.create` + JSON `data`); `route.ts:28` JSON path filtresi; `prisma/schema.prisma:1028-1045` (JSON için indeks yok); `lib/analytics-event-retention.ts:9,23-25` (90 gün sonra koşulsuz silinir).
- **Sorun:** Durum (açık/görüldü/çözüldü), kategori, atanan kişi, fotoğraf gibi alanlar eklenemiyor; dealer bazlı sorgu indekssiz JSON taramasına dayanıyor; analitik temizliği iş kaydını da siliyor; GDPR dışa aktarımında (`app/api/user/data-export/route.ts:48`) "analitik" olarak karışıyor.
- **Öneri:** `StaffFieldReport { id, dealerId, userId, category, severity, note, lat?, lng?, accuracyM?, photoUrl?, status, acknowledgedById?, acknowledgedAt?, resolvedAt?, clientId @unique, createdAt }` modeli, `@@index([dealerId, createdAt])`, `@@index([dealerId, status])`. Analitik olayı istenirse ayrıca sadece sayım için yazılsın. Konum için kendi saklama politikası (ör. 30 gün sonra koordinatları null'la).

### 7. Boş ping ve sınırsız gönderim
- **Önem:** orta · **Kategori:** veri bütünlüğü / kötüye kullanım · **Efor:** S
- **Kanıt:** `route.ts:10-14` (tüm alanlar opsiyonel), `staff-field-client.tsx:64` (`note || undefined`), rate limit yok (`route.ts:47-84`, `proxy.ts`).
- **Öneri:** Zod'da `.refine(d => d.note?.trim() || d.category)`; butonu not/kategori seçilmeden pasif yapın. Kullanıcı başına Upstash `Ratelimit.slidingWindow(10, '10 m')`.

### 8. Yükleniyor/hata durumları yanıltıcı
- **Önem:** orta · **Kategori:** UX · **Efor:** S
- **Kanıt:** `staff-field-client.tsx:18` başlangıç `[]`, `20-28` sessiz `catch` ve `r.ok` kontrolsüz, `119-120` boş durum.
- **Sorun:** Ağ hatası, 403 ("Personel bu işletmeye bağlı değil", `lib/api-auth.ts:163`) ve gerçek boşluk aynı "Henüz kayıt yok" mesajıyla gösteriliyor.
- **Öneri:** Üç durumlu (`loading | error | ready`) state veya SWR; iskelet satırlar, tekrar dene butonlu hata kartı, `aria-busy`. 403'te "Hesabınız bir işletmeye bağlı değil, yöneticinize başvurun" gibi anlamlı mesaj.

### 9. Konum akışı belirsiz ve güvenilmez
- **Önem:** orta · **Kategori:** UX / veri kalitesi · **Efor:** S
- **Kanıt:** `staff-field-client.tsx:39-54` (15 sn timeout, yüksek hassasiyet, `accuracy` atılıyor), konum aç/kapa yok; koordinatlar istemciden geliyor, sunucuda doğrulama yok (`route.ts:12-13`).
- **Sorun:** Kullanıcı neden beklediğini bilmiyor; konumsuz göndermek isteyen personelin seçeneği yok; ±2 km doğruluklu bir Wi-Fi konumu da kesinmiş gibi saklanıyor. Konum bilgisi yoklama/denetim için kullanılırsa kolayca sahtelenebilir.
- **Öneri:** "Konum ekle" anahtarı (varsayılan açık, tercih localStorage'da), buton metni "Konum alınıyor…" → "Gönderiliyor…" aşamaları, `maximumAge: 60000` + `timeout: 8000`, `accuracy` alanını saklayıp UI'da "≈ 30 m" göstermek. Yoklama amacı varsa ayrı bir mekanizma (işletme QR'ı okutma veya işletme koordinatına geofence mesafesi sunucuda hesaplanarak) kullanılmalı.

### 10. i18n ve erişilebilirlik eksikleri
- **Önem:** düşük · **Kategori:** erişilebilirlik / i18n · **Efor:** S
- **Kanıt:** sabit Türkçe metinler `staff-field-client.tsx:56,58,68,72,81,86,89,96,97,101,106,115,120`; `formatRelativeTime` locale'siz `124`; `Label` bağlı değil `101-102`; `<form>` yok `99-107`; liste `max-h-64 overflow-y-auto` kaydırılabilir bölge ama odaklanamaz `118`.
- **Öneri:** Tüm metinleri `staffField.*` anahtarlarına taşıyın, `useAppLocale()` ile `formatRelativeTime(p.createdAt, locale)`; `<form onSubmit>` + `id/htmlFor`; listeyi `<ol aria-label>` yapıp gönderim sonrası `aria-live="polite"` duyurusu.

### 11. İsimlendirme tutarsızlığı
- **Önem:** düşük · **Kategori:** bilgi mimarisi · **Efor:** S
- **Kanıt:** metadata "Saha kaydı" (`messages/tr.json:137`), sayfa başlığı "Saha modu" (`staff-field-client.tsx:86`), panel butonu "Saha modu" + `Radio` ikonu (`app/staff/staff-dashboard-client.tsx:202-205`), sayfa ikonu `MapPin`, kart "Hızlı ping".
- **Öneri:** Tek kavram: "Saha bildirimi". "Ping" iç jargon; personel için anlamsız.

---

## Eksik özellikler (kıyas ürünlerle)

Kıyas: Toast (Shift notes / Manager log), Square Team (shift notes), 7shifts / Connecteam (manager logbook, quick reports, photo), Zenput/Crunchtime (saha denetimi), Medallia (frontline "close the loop").

1. **Yöneticiye ulaşan akış + kapatma döngüsü:** "Görüldü" / "Çözüldü" durumu, personele "yöneticiniz gördü" geri bildirimi (Connecteam, 7shifts manager log).
2. **Kategori + öncelik + hızlı şablon çipleri:** Kasa yoğun / Stok bitti / Arıza / Hijyen / Müşteri şikâyeti; "Acil" seçilirse yöneticiye anlık push.
3. **Fotoğraf eki:** Arıza/dökülme kanıtı (R2 altyapısı zaten var).
4. **Gerçek offline kuyruk:** idempotent, gönderilmeyi bekleyen sayacı ile.
5. **Vardiya bağlamı:** Bildirimin aktif `StaffShift` kaydına bağlanması; vardiya devri (handover) notu olarak bir sonraki vardiyaya gösterilmesi (Toast manager log deseni).
6. **Geri bildirim sinyalleriyle korelasyon:** Aynı saatlerde gelen olumsuz müşteri geri bildirimleriyle "Kasa yoğundu" notunun eşleştirilmesi — Qratex'in AI içgörü katmanı için değerli operasyonel bağlam (Medallia "operational data + experience data").

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Personel, vardiya ortasında telefonunu çıkarıp **iki dokunuşla** (kategori çipi → Gönder) bir saha bildirimi bırakır; bildirimin yöneticiye ulaştığını ve ne zaman görüldüğünü kendi listesinde görür. Yönetici ise `/dealer/team` içinde canlı bir "Saha akışı"nda bunları önceliğe göre görür; arıza/kesinti türleri otomatik olay (incident) olur ve gün sonu AI özeti (operations-brief) bu notları bağlam olarak kullanır.

**Yerleşim (personel tarafı):**
- Ayrı sayfa yerine personel ana panelinde (`/staff`) üstte sabit bir "Saha bildirimi" düğmesi → mobilde alt sayfa (bottom sheet / shadcn `Drawer`).
- Sheet içeriği: kategori çipleri (2 satır, ikonlu), isteğe bağlı not (`Textarea`, sayaçlı), "Fotoğraf ekle", "Konum ekle" anahtarı + doğruluk göstergesi, öncelik ("Acil" toggle), tam genişlik Gönder.
- "Bildirimlerim" listesi: zaman · kategori çipi · not · durum rozeti (Gönderildi / Görüldü / Çözüldü / Kuyrukta). Ham JSON yok, koordinat yok.
- `/staff/field` derin bağlantı olarak kalabilir ama aynı bileşeni (`components/staff/field-report-sheet.tsx`) tam sayfa modunda render etmeli.

**Yerleşim (yönetici tarafı):**
- `/dealer/team` → "Saha akışı" sekmesi: filtre (kategori, durum, personel), satırda personel adı/avatarı, isteğe bağlı mini harita (statik, harici tile yerine işletme konumuna göre mesafe metni yeterli), "Görüldü" ve "Olay aç" aksiyonları.
- Bayi ana panelinde açık acil bildirim sayısı rozeti.

**Motion:** Ölçülü. Gönderimde buton içinde "konum → gönderiliyor → ✓" geçişi (framer-motion `m` ile 150–200 ms layout/opacity), listeye yeni öğenin yukarıdan kayarak eklenmesi; `useReducedMotion` ile kapatılabilir. 3B veya dekoratif animasyon **gereksiz** — bu bir hız aracı.

**Veri/API değişiklikleri:**
- Yeni `StaffFieldReport` modeli (bulgu #6).
- `POST /api/staff/field-reports` (idempotent `clientId`, Zod refine, rate limit, `requireActiveStaff`).
- `GET /api/staff/field-reports?mine=1` (yalnız kendi kayıtları, koordinatsız).
- `GET/PATCH /api/dealer/field-reports` (DEALER, durum güncelleme; `acknowledgedAt` yazınca personele bildirim).
- Kategori "arıza/kesinti" + "acil" → `Incident` kaydı oluşturma ve push merkezi üzerinden bayiye bildirim (mevcut bildirim altyapısı).
- Mevcut `AnalyticsEvent` yazımı yalnız sayım/funnel için tutulabilir; geçmiş `staff_field_ping` kayıtları tek seferlik betikle yeni modele taşınabilir (canlı Neon — dikkatli, kuru çalıştırmalı).

---

## Çakışmalar / birleştirme önerisi

- **`/staff` (personel ana paneli):** Bu sayfa yalnızca bir form ve bir liste; personel paneline sheet olarak gömülmesi gezinme adımını kaldırır. Ayrı rota yalnız derin bağlantı için kalmalı.
- **`/dealer/incidents`:** "Kısa kesinti" örneği tam olarak bir olay kaydı; şu an olaylar yalnız DEALER/ADMIN tarafından açılabiliyor (`app/api/dealer/incidents/route.ts:33,86`). Saha bildirimleri bu boru hattının **personel girişi** olarak tasarlanmalı — iki ayrı "sorun bildirme" kavramı olmamalı.
- **`/dealer/team`:** Personel yönetiminin doğal tüketim noktası; saha akışı buraya bir sekme olarak eklenmeli.
- **`/dealer/operations-brief`:** Günlük operasyon özeti saha notlarını bağlam olarak kullanmalı (şu an bu veriye erişmiyor).

---

## Doğrulama (şüpheci inceleme)

Yöntem: `app/staff/field/page.tsx`, `app/staff/field/staff-field-client.tsx`, `app/api/staff/field-ping/route.ts`, `lib/api-auth.ts`, `lib/auth.ts` (jwt/session callback'leri), `app/staff/layout.tsx`, `proxy.ts`, `app/api/dealer/staff/[id]/route.ts`, `app/dealer/team/page.tsx`, `prisma/schema.prisma` (`AnalyticsEvent`, `DealerStaff`) ve kod tabanındaki tüm `analyticsEvent` okuyucuları baştan okundu. Kod değiştirilmedi, DB'ye dokunulmadı.

### 1. Saha pingleri yöneticiye hiç ulaşmıyor — **DOĞRULANDI**
- `staff_field_ping` / `staff_field` dizgisi kod tabanında YALNIZ `app/api/staff/field-ping/route.ts:25-26` (GET, STAFF) ve `:63-64` (POST) içinde geçiyor.
- Tüm `prisma.analyticsEvent.findMany/count` ve ham SQL (`"AnalyticsEvent"`) okuyucuları tarandı: admin tarafı yalnız `webhook_delivery`, `module_gate_blocked`, `innovation_ab_*` olaylarını okuyor; `app/api/admin/health/route.ts:51-55` yalnız distinct `userId` sayıyor; dealer tarafında hiçbir okuyucu yok. `groupBy` ile genel bir olay paneli de yok.
- Buna karşın arayüz `staff-field-client.tsx:89-90` "Yönetici panellerinde analitik olarak görülür" diyor → sahte vaat.
- 90 gün silme: `lib/analytics-event-retention.ts:9,23` + `app/api/internal/inngest/analytics-event-cleanup/route.ts:16` mevcut (zamanlayıcıya bağlanıp bağlanmadığı bu incelemede doğrulanmadı; asıl bulgu için belirleyici değil).
- Yeniden üretim: STAFF olarak "Kısa kesinti" gönder → bayi hesabıyla `/dealer/team`, `/dealer/incidents`, `/dealer/analytics` dahil hiçbir ekranda bu kayıt görünmez.

### 2. İş arkadaşlarının GPS koordinatları ham JSON olarak tüm personele gösteriliyor — **DOĞRULANDI** (önem: YÜKSEK değil ORTA)
- `route.ts:24-29` filtre yalnız `event + category + createdAt(7 gün) + data.dealerId`; `userId` filtresi yok. `:32` `data` ve `userId` alanlarını olduğu gibi döndürüyor.
- POST `:65-70` `latitude/longitude`'u tam hassasiyetle saklıyor; istemci `enableHighAccuracy: true` istiyor (`staff-field-client.tsx:52`).
- `staff-field-client.tsx:125-127` `JSON.stringify(p.data)` → aynı işletmedeki her STAFF, "Son kayıtlar" başlığı altında (kendi kayıtlarıymış gibi) iş arkadaşlarının koordinatlarını ve `dealerId`'yi görüyor; API yanıtında ayrıca gönderenin `userId`'si de var, yani konum kişiyle eşleştirilebilir.
- Önemi düşüren etkenler: sızıntı işletme sınırını aşmıyor (dealerId filtresi doğru), arayüz isim göstermiyor, `dealerId` personel açısından sır değil. Ama personel pingi işyeri dışından (ör. yoldan/evden) atabildiği için konum kişisel veridir ve "bilmesi gereken" ilkesine aykırı biçimde yayılıyor → KVKK veri minimizasyonu açısından gerçek sorun.
- Yeniden üretim: Aynı bayiye bağlı A ve B personeli. A konum izni vererek ping atar. B `/staff/field` açar → listede A'nın `{"dealerId":"…","note":"…","latitude":41.0xxxx,"longitude":28.9xxxx}` kaydını görür; DevTools'ta yanıtta A'nın `userId`'si de vardır.

### 3. Doğrulama hatası '[object Object]' olarak gösteriliyor — **ÇÜRÜTÜLDÜ**
- Kod kusuru gerçek: `route.ts:57` `error: parsed.error.flatten()` nesne döndürüyor (zod ^3.22.4), `staff-field-client.tsx:67` bunu `new Error(...)`'a verirse mesaj `[object Object]` olur.
- Ancak arayüzden 400'e ulaşan somut senaryo kurulamadı: not `<Input maxLength={240}>` (`:102`) ile şemadaki `max(240)` aynı birimle (UTF-16 kod birimi) sınırlı; boş not `note || undefined` ile atlanıyor (`:64`); `latitude/longitude` Geolocation API'den daima geçerli aralıkta geliyor; gövde bozuksa `req.json().catch(() => ({}))` geçerli boş nesneye düşüyor. Diğer tüm hata yolları (`requireAuth`, `getStaffDealerId`, `responseIfDatabaseUnavailable`, 500) `error` alanını string döndürüyor.
- Sonuç: yalnız API'yi elle çağıran biri tetikleyebilir; son kullanıcıyı etkilemiyor. Yeni modele geçişte (bulgu #6) hata gövdesi `{ error: string, fieldErrors }` sözleşmesine çekilmeli — bu bir kod hijyeni maddesi, KRİTİK/YÜKSEK değil.

### 4. Pasif personel ping atabiliyor ve ekip konumlarını okuyabiliyor — **DOĞRULANDI** (iddiadan daha geniş)
- `lib/api-auth.ts:158-168` yalnız JWT'deki `dealerId`'ye bakıyor; `DealerStaff.isActive` (`prisma/schema.prisma:2438`) hiçbir `/api/staff/*` ucunda kontrol edilmiyor (`isActive` geçen yerler şablon/eğitim kayıtlarına ait: `checklists/complete:34`, `me:39,50`, `training/complete:30`).
- `app/api/dealer/staff/[id]/route.ts:22-40` yalnız `isActive` alanını günceller; rolü değiştirmez, oturumu düşürmez. Bayi bunu `app/dealer/team/page.tsx:485` anahtarıyla yapıyor.
- İddianın "JWT süresince" kısmı eksik: `lib/auth.ts:227,254-256` girişte `staffProfile.dealerId`'yi `isActive`'e BAKMADAN token'a yazıyor; `authorize` ve `app/staff/layout.tsx:30-33` de kontrol etmiyor. Yani pasifleştirilen personel 24 saatlik (`lib/auth.ts:35`) oturum dolduktan sonra **yeniden giriş yaparak** süresiz erişmeye devam edebilir.
- Yeniden üretim: Bayi `/dealer/team`'de personel A'yı pasif yapar. A çıkış yapıp tekrar giriş yapar → `/staff/field` açılır, `GET /api/staff/field-ping` aktif ekip arkadaşlarının son 7 günlük konumlarını döndürür, `POST` yeni kayıt yazar. Bulgu #2 ile birleşince ayrılmış çalışanın eski ekibinin konumunu izlemesi mümkün.
- Öneri: `requireActiveStaff()` yardımcı fonksiyonu (DB'den `DealerStaff { userId, isActive: true }` doğrulaması, Redis'te kısa TTL'li önbellek — token-replay deseniyle aynı) tüm `/api/staff/*` uçlarında `getStaffDealerId` yerine kullanılmalı; ayrıca `jwt` callback'inde girişte `isActive=false` ise `dealerId` yazılmamalı ve pasifleştirme anında ilgili JTI'ler iptal listesine eklenmeli.

---

## Uygulama (Dalga 2)

**Sonuç: birleştirildi.** `/staff/field` artık sorgu parametrelerini koruyarak `/staff?bildir=1`'e kalıcı yönlenir (`app/staff/field/page.tsx`, `permanentRedirect`); "Bugün" ekranı bu parametreyle **Saha bildirimi** alt sayfasını açar (`components/staff/b-ekip/field-report-sheet.tsx`). Veri modeli analitik tablosundan çıkarıldı: her bildirim bir **`Incident`** iş kaydıdır (`type: custom`, `metadata.source = staff_field_report`, kategori/acil/raporlayan/`clientId`/yuvarlanmış konum). Bayi bunu hem `/dealer/team` → **Saha** sekmesinde (görüldü / çözüldü / yeniden aç) hem de vaka kuyruğunda görür; acil bildirimde bayiye anında uygulama içi bildirim gider, durum değişince personele haber gider. Eski `POST/GET /api/staff/field-ping` 410 ile emekli; yeni uç `POST/GET /api/staff/field-reports` (`defineRoute`, aktif personel kapsamı, 10 dk'da 10 rate limit, `clientId` idempotent).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Sayfa metadata | KALDIRILDI | Rota yönlendirmeye dönüştü; tek kavram "Saha bildirimi". |
| 2 | Rol kapısı | ÇALIŞIYOR | `/staff` layout + uçlarda aktif personel kapsamı. |
| 3 | İçeriğe atla | ÇALIŞIYOR | `/staff` layout'unda. |
| 4 | Üst bar | ÇALIŞIYOR | TR/EN, düzgün çıkış (`signOut()`). |
| 5 | Loading / error | ÇALIŞIYOR | `/staff` sınırları. |
| 6 | "Panele dön" | KALDIRILDI | Ayrı sayfa yok; alt sayfa kapatılır. |
| 7 | Başlık kartı + açıklama | ÇALIŞIYOR | Dürüst metin: "Yöneticin hemen görür; durumunu buradan takip edebilirsin." |
| 8 | Not alanı | ÇALIŞIYOR | Etiketli `textarea`, 500 karakter + sayaç. |
| 9 | Konum alma | ÇALIŞIYOR | "Konumumu ekle" anahtarı (tercih hatırlanır), `timeout 8 sn`, `maximumAge 60 sn`, doğruluk (`accuracyM`) saklanır; "Konum alınıyor…" aşaması. |
| 10 | Konum reddi | ÇALIŞIYOR | Bildirim konumsuz gönderilir, kullanıcıya söylenir. |
| 11 | Gönder + çift tık engeli | ÇALIŞIYOR | `aria-busy`, aşamalı etiket. |
| 12 | Boş ping engeli | ÇALIŞIYOR | Konu (kategori) zorunlu; istemci ve zod. |
| 13 | Doğrulama hatası mesajı | ÇALIŞIYOR | Zarf v2 `error` her zaman metin; alan altında `role=alert`. |
| 14 | Başarı + temizleme + yenileme | ÇALIŞIYOR | Hedefli yenileme (`staff-today`). |
| 15 | Son kayıtlar listesi | ÇALIŞIYOR | "Saha bildirimlerim": YALNIZ kendi kayıtları. |
| 16 | Kayıt içeriği gösterimi | ÇALIŞIYOR | Yapılandırılmış satır: kategori, acil, not, zaman, durum rozeti. Ham JSON, koordinat ve `dealerId` yok. |
| 17 | Kimin gönderdiği | ÇALIŞIYOR | Bayi görünümünde raporlayan adı; personel yalnız kendi kayıtlarını görür. |
| 18 | Liste yükleniyor | ÇALIŞIYOR | Sunucu ön yükleme + `QueryState`. |
| 19 | Liste hata durumu | ÇALIŞIYOR | Görünür hata + tekrar dene. |
| 20 | Yönetici görünürlüğü | ÇALIŞIYOR | `/dealer/team` Saha sekmesi + KPI ("açık saha bildirimi", "acil"), vaka kuyruğu; durum döngüsü. |
| 21 | Offline gönderim | ÇALIŞIYOR | Ağ yoksa cihaz kuyruğu (localStorage, ≤ 20), `online` olayında ve açılışta boşaltma, `clientId` ile çift kayıt yok; "x bildirim bağlantı bekliyor" rozeti. |
| 22 | Göreli zaman | ÇALIŞIYOR | `Intl.RelativeTimeFormat` dile göre. |
| 23 | i18n | ÇALIŞIYOR | TR/EN sözlük. |
| 24 | Enter / form semantiği | ÇALIŞIYOR | `<form onSubmit>`. |
| 25 | Hızlı şablon çipleri | ÇALIŞIYOR | 6 konu çipi (Yoğunluk, Stok bitti, Arıza, Hijyen, Müşteri şikâyeti, Diğer), `radiogroup`. |
| 26 | Kategori / öncelik | ÇALIŞIYOR | Kategori + "Acil" anahtarı → Incident önemi (acil=high; arıza/hijyen/şikâyet=medium). |
| 27 | Fotoğraf eki | EKSİK | Bu dalgada yapılmadı (R2 yükleme akışı ayrı iş). |
| 28 | Rate limit | ÇALIŞIYOR | Kullanıcı başına 10 dk'da 10. |
| 29 | Pasif personel engeli | ÇALIŞIYOR | Kiracı çözümü DB'den aktif bağ ister (403); pasifleştirmede oturumlar düşer. |
| 30 | KVKK aydınlatma | ÇALIŞIYOR | Anahtar altında "Yalnız yöneticin görür, ~100 m hassasiyetle saklanır"; bayi ekranında da gizlilik notu. |
| 31 | Saklama süresi | ÇALIŞIYOR | İş kaydı (Incident) — analitik 90 gün temizliğine tabi değil; koordinat yalnız ~100 m'ye yuvarlanmış saklanır. |

### Kapanan bulgular (11/11)
1 (yöneticiye ulaşan akış + kapatma döngüsü) · 2 (personel yalnız kendi kayıtları, koordinat dönmez, ham JSON yok) · 3 (çürütülmüştü; yine de zarf v2 ile hijyen kapandı) · 4 (pasif personel 403 + oturum iptali) · 5 (gerçek çevrimdışı kuyruk) · 6 (analitik tablosu yerine Incident iş kaydı) · 7 (boş bildirim yok, rate limit) · 8 (yükleniyor/hata durumları) · 9 (konum anahtarı, aşamalar, doğruluk) · 10 (i18n, form semantiği, etiketler, `role=alert`) · 11 (tek kavram "Saha bildirimi").

### Kalanlar
- **Fotoğraf eki** (#27): yapılmadı.
- **Vardiya devri notu / müşteri geri bildirimiyle korelasyon / operations-brief bağlamı**: yapılmadı (başka yüzeyler).
- **Ayrı model** (`StaffFieldReport`) yerine mevcut `Incident` kullanıldı (şema değişikliği yasak); eski `staff_field_ping` analitik kayıtları taşınmadı (canlı DB'ye dokunulmadı).
- **Navigasyon**: `lib/navigation/registry.ts` hâlâ `/staff/field` bağlantısını içeriyor (yönlendirme çalışır; bağlantının `/staff?bildir=1` olması navigasyon ajanının işi).
