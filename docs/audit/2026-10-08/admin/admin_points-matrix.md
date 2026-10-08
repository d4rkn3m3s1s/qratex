# /admin/points-matrix

**Amaç:** Platformun "puan basan" kurallarını (geri bildirim, tüketim yorumu, referans, doğum günü, seri/streak kilometre taşları, görev varsayılanı, günlük çark) tek bir JSON ayarı (`Settings.key = 'points_matrix'`) olarak düzenlemek; kaydedilen değerler 12 farklı API yolu tarafından `getPointsMatrix()` ile okunur.
**Genel puan:** 5.4 / 10
**Karar:** koru-iyileştir (kısa vadede kritik veri güvenliği düzeltmeleri) → orta vadede "Ekonomi" merkezi altında **birleştir** (economy-sim + gamification-settings + puan tavanları)

İncelenen dosyalar: `app/admin/points-matrix/page.tsx` (1001 satır, tek client bileşen), `app/admin/layout.tsx`, `app/api/admin/settings/points-matrix/route.ts`, `lib/points-rules.ts`, `lib/validations-admin.ts:86-88`, `lib/admin-toast.ts`, `components/admin/admin-premium-hero.tsx`, `components/ui/label.tsx`, tüketiciler: `app/api/gamification/spin/route.ts`, `app/api/streak/route.ts`, `app/api/referral/route.ts`, `app/api/birthday/route.ts`, `app/api/feedbacks/route.ts`, `app/api/customer/consumptions/[id]/review/route.ts`, `app/api/admin/economy-sim/route.ts`, `components/gamification/spin-wheel.tsx`, `lib/points-caps.ts`, `lib/referral-milestones.ts`, `prisma/schema.prisma` (Settings: 899-907, User.points/xp `Int`).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | Tüm alanlar gerçekten sunucuya yazılıyor ve tüketiciler okuyor; ancak yükleme hatasında sahte varsayılanların canlıya yazılabilmesi, streak simülasyonunun yanlış mantığı ve milestone girişinde odak kaybı ciddi kusurlar. |
| UX | 5/10 | Tek uzun form, değer aralığı/etki uyarısı yok, kaydetmeden önce fark (diff) ve onay yok, sayı alanları silinince "1"e zıplıyor, kaydedilmemiş değişiklik koruması yok. |
| Görsel | 6/10 | Ortak `AdminPremiumHero` ve kart dili tutarlı; ama iç içe Card'lar (Card > Card) yoğun, hiyerarşi düz, hero Kaydet butonunun sabit `bg-white text-emerald-900` rengi tema token'larından kopuk. |
| Mimari | 5/10 | 1001 satırlık monolit; tip ve varsayılanlar `lib/points-rules.ts` ile kopyalanmış ve birbirinden sapmış (streak 3 vs 7 kilometre taşı); sunucu şeması `z.unknown()`, üst sınır yok; önbellek süreç-içi. |
| Performans | 7/10 | Tek GET/PUT, hafif; her tuş vuruşunda `JSON.stringify(matrix)` ve tüm formun yeniden render'ı önemsiz ölçekte. Lazy/skeleton yok ama sayfa küçük. |
| Erişilebilirlik + mobil | 4/10 | `Label`'ların hiçbiri `htmlFor` ile input'a bağlı değil, çöp kutusu ikon butonlarında `aria-label` yok, native `select` etiketsiz; mobilde grid'ler düzgün yığılıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | API yetki kontrolü (yalnız ADMIN) | ÇALIŞIYOR | `route.ts:20-21`, `route.ts:39-40` | `requireAuth(['ADMIN'])`, GET ve PUT ikisinde de. |
| 2 | Hero (eyebrow "Ekonomi", başlık, açıklama) | KISMİ | `page.tsx:398-402` | Açıklama çarkı ve tüketim yorumunu saymıyor; sayfanın en çok değer basan iki bölümü eksik anılıyor. |
| 3 | "Yenile" butonu | KISMİ | `page.tsx:405-413`, `202-222` | Kirli (dirty) form varken onaysız yeniden yükleyip düzenlemeleri siler. |
| 4 | Hero "Kaydet" butonu | ÇALIŞIYOR | `page.tsx:414-417`, `247-271` | `!isDirty` iken pasif. Renk sabit beyaz; açık temada açık zemin üzerinde ayrışması zayıf olabilir (görsel olarak doğrulanmadı). |
| 5 | "Genel puan sistemi" bilgi kartı | ÇALIŞIYOR | `page.tsx:422-428` | Statik metin; bahsedilen "Ödül Yönetimi" ve "rozet kataloğu" sayfalarına link yok. |
| 6 | Dirty rozeti (Değiştirildi / Güncel) | KISMİ | `page.tsx:193`, `199-200`, `434` | İlk yükleme başarısız olursa `initialSignature=''` kalır ve rozet yanlışlıkla "Değiştirildi" gösterir (bkz. Bulgu 1). |
| 7 | "Tüm alanlar gerçek API'ye bağlı… puan motoru anında kullanır" açıklaması | KISMİ | `page.tsx:437`, `lib/points-rules.ts:242-262` | Önbellek süreç-içi 60 sn; `clearPointsMatrixCache()` yalnızca PUT'u işleyen örneği temizler. Diğer serverless örnekler 60 sn eski kuralla puan basar. Metin geliştirici dili. |
| 8 | Feedback "Detaylı Yorum Eşiği" | KISMİ | `page.tsx:447-464` | `clampPositive` onChange'de: alan silinince "1" olur, ardından "80" yazınca "180" çıkar. |
| 9 | Feedback temel puan / XP | ÇALIŞIYOR | `page.tsx:465-498`; tüketici `app/api/feedbacks/route.ts:284-285` | Üst sınır yok. |
| 10 | Feedback detaylı puan / XP | ÇALIŞIYOR | `page.tsx:499-538` | Üst sınır yok; "detaylı < temel" gibi mantıksız durumlar uyarılmıyor. |
| 11 | Tüketim yorumu eşiği | KISMİ | `page.tsx:547-562` | #8 ile aynı giriş kusuru. |
| 12 | Tüketim yorumu temel/detaylı puan-XP | ÇALIŞIYOR | `page.tsx:563-642`; tüketici `consumptions/[id]/review/route.ts:163-164` | Rozet sistemi bu yolu sayar; değer etkisi büyük ama sayfada uyarı yok. |
| 13 | Referral: kodu giren / kod sahibi puanı | ÇALIŞIYOR | `page.tsx:648-680`; `app/api/referral/route.ts:192-194`, `auth/register/route.ts:109-110` | Etiket dil bilgisi hatalı: "Kodu Sahibi" → "Kod Sahibi" (`page.tsx:667`). Referans kademe ödülleri (`lib/referral-milestones.ts:20-25`) burada yok. |
| 14 | Doğum günü bonus puanı | ÇALIŞIYOR | `page.tsx:682-699`; `app/api/birthday/route.ts:99-100` | |
| 15 | Görev (Quest) varsayılan puan / XP | KISMİ | `page.tsx:701-743`; `lib/points-rules.ts:301-314` | Yalnızca `reward` alanı olmayan görevlerde geçerli; reward nesnesi olup `xp` alanı olmayanlarda XP matristen değil `floor(points/2)`'den gelir. Sayfa bunu anlatmıyor. |
| 16 | Streak kilometre taşı düzenleme (gün / bonus) | BOZUK | `page.tsx:753` (`key={`${milestone.days}-${index}`}`), `282-295` | Gün alanına her tuş vuruşunda `days` değişir → satır key'i değişir → React satırı yeniden bağlar → input odağı kaybolur; ek olarak liste her tuşta yeniden sıralanır ve satır yer değiştirir. |
| 17 | "Milestone Ekle" | KISMİ | `page.tsx:273-280` | `{days:1, points:0}` ekler; aynı gün tekrar edebilir (doğrulama yok). 1. gün bonusu verilirse seri her sıfırlandığında tekrar kazanılır. |
| 18 | Milestone silme | ÇALIŞIYOR | `page.tsx:298-308`, `771-778` | Son satır silinemez. İkon butonunda `aria-label` yok. |
| 19 | "Çark varsayılanına dön" | ÇALIŞIYOR | `page.tsx:798-817` | Onaysız; ama kaydedilmeden canlıya gitmiyor ve toast uyarıyor. |
| 20 | Çark aktif/pasif switch | ÇALIŞIYOR | `page.tsx:822-833`; `spin/route.ts:45-48` | Switch'in erişilebilir adı yok (yanındaki `<p>` bağlı değil). |
| 21 | Günlük çevirme limiti | ÇALIŞIYOR | `page.tsx:834-846`; `spin/route.ts:50-54`, `69-75` | Atomik guard sunucuda mevcut; üst sınır yok. |
| 22 | Çark ödül etiketi | KISMİ | `page.tsx:852-858` | Serbest metin; "100 Puan" etiketi + 10 değer gibi tutarsızlık engellenmiyor (kullanıcıya yanıltıcı vaat). |
| 23 | Çark ödül tipi (points/xp/nothing) | ÇALIŞIYOR | `page.tsx:859-870` | Native `select`, seçenekler İngilizce ham değer, `Label` bağlı değil. |
| 24 | Çark ödül değeri | ÇALIŞIYOR | `page.tsx:871-879` | `nothing` iken pasif. |
| 25 | Ağırlık + canlı yüzde | ÇALIŞIYOR | `page.tsx:880-890`, `387` | Yüzdeler yuvarlandığından toplam %100 tutmayabilir; beklenen değer (EV) gösterilmiyor. |
| 26 | "Çark Ödülü Ekle" | KISMİ | `page.tsx:310-327` (`id: spin_custom_${length+1}`) | Silme + ekleme sonrası yinelenen `id` üretir → çark yanlış dilimi gösterir (bkz. Bulgu 4). |
| 27 | Çark ödülü silme | ÇALIŞIYOR | `page.tsx:365-376`, `892-899` | Son ödül silinemez; `aria-label` yok. |
| 28 | Simülasyon: örnek feedback uzunluğu | KISMİ | `page.tsx:378-381`, `920-930` | Eşik mantığı doğru; ama VIP/sezon/global çarpan ve günlük 500 / haftalık 2000 tavanı (`lib/points-caps.ts:13-14`, `feedbacks/route.ts:313-317`) yansıtılmıyor. |
| 29 | Simülasyon: örnek tüketim yorumu uzunluğu | KISMİ | `page.tsx:382-385`, `931-941` | Tavan (`review/route.ts:191`) yansıtılmıyor. |
| 30 | Simülasyon: örnek streak günü | BOZUK | `page.tsx:240-245` vs `lib/points-rules.ts:296-299`, `streak/route.ts:157` | Sayfa "en yakın alttaki" taşın bonusunu gösteriyor (15. gün → 250); sunucu yalnızca TAM gün eşleşmesinde verir (15. gün → 0). Yanlış bilgi. |
| 31 | Referral mantığı özeti | ÇALIŞIYOR | `page.tsx:954-959` | |
| 32 | Doğum günü mantığı özeti | ÇALIŞIYOR | `page.tsx:960-963` | |
| 33 | Çark algoritma simülasyonu (bilet 0-99) | ÇALIŞIYOR | `page.tsx:387-394`, `966-985` vs `points-rules.ts:320-340` | Sunucudaki kümülatif seçimle uyumlu; %1 çözünürlük. Dağılım grafiği / beklenen puan yok. |
| 34 | "Geri Al" | ÇALIŞIYOR | `page.tsx:228-234`, `990-992` | |
| 35 | Alt "Kaydet" | ÇALIŞIYOR | `page.tsx:993-995` | Hero'daki Kaydet ile yinelenen eylem; sticky değil. |
| 36 | Yükleniyor durumu | SAHTE | `page.tsx:190-192` | Yükleme süresince `EMPTY_MATRIX` sabit değerleri gerçekmiş gibi gösterilir, alanlar düzenlenebilir; yanıt gelince düzenlemeler sessizce ezilir. Skeleton yok. |
| 37 | Hata durumu (GET başarısız) | BOZUK | `page.tsx:217-221`, `193`, `200`, `414` | Yalnızca toast; form sahte varsayılanlarla açık kalır, Kaydet etkin olur (bkz. Bulgu 1). |
| 38 | Sunucu tarafı doğrulama | KISMİ | `lib/validations-admin.ts:86-88` (`matrix: z.unknown()`), `points-rules.ts:108-116` | Tip/negatiflik normalize ediliyor; üst sınır, mantıksal tutarlılık, kopya gün/id kontrolü yok. |
| 39 | Denetim kaydı (AuditLog, eski+yeni değer) | ÇALIŞIYOR | `route.ts:70-81` | Sayfada görünmüyor; geçmiş/geri dönme arayüzü yok. |
| 40 | Önbellek geçersizleştirme | KISMİ | `route.ts:82`, `points-rules.ts:242-248` | Süreç-içi; Upstash Redis kullanılmıyor (karşılaştırma: `character-thresholds` da aynı desen). |
| 41 | Kaydedilmemiş değişiklik uyarısı (sayfadan çıkışta) | EKSİK | Repo'da `beforeunload` kullanımı yok | |
| 42 | Eşzamanlı düzenleme koruması (sürüm/ETag) | EKSİK | `route.ts:56-68` | Son yazan kazanır; iki admin birbirini sessizce ezer. |
| 43 | Değişiklik geçmişi / fark görünümü / geri yükleme | EKSİK | — | AuditLog verisi var, kullanılmıyor. |
| 44 | Aralık uyarısı + "yüksek etkili değişiklik" onayı | EKSİK | — | Bkz. Bulgu 2. |
| 45 | Mobil yerleşim | KISMİ | `page.tsx:441`, `465`, `753`, `851` | Grid'ler yığılıyor; ama tek uzun form + sticky olmayan kaydet mobilde çok uzun kaydırma. |
| 46 | Label–input ilişkilendirmesi | EKSİK | `page.tsx:448`, `467`, `483`… tüm `Label`'lar `htmlFor`'suz; `components/ui/label.tsx:17-21` | Ekran okuyucu alanları adsız okur; etikete tıklayınca odak gitmez. |
| 47 | İkon butonlarında erişilebilir ad | EKSİK | `page.tsx:771-778`, `892-899` | |
| 48 | Uluslararasılaştırma (i18n) | EKSİK | Tüm metinler sabit; sidebar `messages/en.json:2512` çevrilmiş | EN arayüzde sayfa TR kalır; TR içinde "Feedback", "Referral", "Streak Milestones", "Milestone Ekle", "Quest", `points/xp/nothing` karışık. |

**Sayım:** 48 özellik — ÇALIŞIYOR 22 · KISMİ 15 · BOZUK 3 · SAHTE 1 · EKSİK 7

---

## Bulgular

### 1. Kritik · veri bütünlüğü · İlk yükleme hata verirse sahte varsayılanlar canlı ekonomiye yazılabiliyor
- **Kanıt:** `page.tsx:192` (`useState(EMPTY_MATRIX)`), `page.tsx:193` (`initialSignature=''`), `page.tsx:200` (`isDirty = signature !== initialSignature`), `page.tsx:217-221` (catch yalnızca toast), `page.tsx:414` ve `993` (Kaydet `loading||saving||!isDirty` ile pasif); `page.tsx:61-67` (istemci varsayılanı 3 streak taşı) vs `lib/points-rules.ts:70-80` (sunucu varsayılanı 7 taş).
- **Sorun:** GET 500/502 döner, oturum düşer ve HTML yönlendirmesi gelir (`response.json()` fırlatır) ya da ağ kesilirse `matrix` istemci sabitlerinde kalır, `initialSignature` boş kalır → rozet "Değiştirildi", Kaydet etkin. Admin "kaydet"e basarsa canlı matris istemci varsayılanıyla ezilir: 60/90/180/365 günlük streak ödülleri (1000–10000 puan) sessizce silinir, tüm özelleştirilmiş çark/feedback değerleri kaybolur. Formda gerçek değer sanılan sahte sayılar gösterildiği için admin farkı göremez.
- **Öneri:** Üç durumlu veri modeli kur: `status: 'loading' | 'error' | 'ready'`. `ready` olmadan formu render etme; `loading`'de skeleton, `error`'da "Matris yüklenemedi — tekrar dene" boş durumu göster ve Kaydet'i tamamen gizle. İstemci varsayılan kopyasını (`EMPTY_MATRIX`) sil; "varsayılana dön" ihtiyacı için `GET` yanıtına `defaults: getDefaultPointsMatrix()` ekle. Sunucuda ek savunma: PUT gövdesine `baseVersion` (Settings.updatedAt) zorunlu olsun, eşleşmezse 409 (Bulgu 6 ile aynı mekanizma).
- **Efor:** S

### 2. Yüksek · güvenlik/ekonomi · Üst sınır yok: tek yanlış tuş milyonlarca puan basar ya da `Int` taşmasıyla akışları kırar
- **Kanıt:** `lib/validations-admin.ts:86-88` (`matrix: z.unknown()`), `lib/points-rules.ts:108-116` (yalnızca alt sınır), `prisma/schema.prisma` User `points Int`, `xp Int`; karşılaştırma: `app/api/admin/gamification/settings/route.ts:11-16` ("ekonomi koruması" ile `clampNum(min,max)`).
- **Sorun:** Referral'a `10000000` yerine `100000000` yazmak, çark ödülüne fazladan sıfır eklemek doğrudan para benzeri değer basar; referans, doğum günü, streak, çark ve görev yolları feedback tavanına (`lib/points-caps.ts:13-14`) tabi değil. 2.147.483.647'yi aşan bir değer ise `creditPointsAndXp` içinde Postgres taşma hatası verir → kayıt (`auth/register/route.ts:109`), referans ve çark transaction'ları 500 ile düşer. Proje hafızasındaki "puan basan her yol" ilkesi bu ayarlama yüzeyini de kapsamalı.
- **Öneri:** `adminPointsMatrixPutSchema`'yı gerçek bir Zod şemasına çevir (alan bazlı `int().min().max()`: ör. feedback ≤ 1000, referral ≤ 20000, streak tek taş ≤ 50000, çark değeri ≤ 1000, dailyLimit ≤ 10, eşik ≤ 2000, gün 2–3650 ve benzersiz, prize id benzersiz). Sınırları tek kaynakta (`lib/points-rules.ts` içinde `POINTS_MATRIX_LIMITS`) tut ve hem istemci hem sunucu kullansın. UI'da: önceki değere göre ±%50 üstü değişikliklerde alan yanında amber uyarı ve kaydetmeden önce "Bu değişiklik tahmini günlük basımı X → Y puan yapar" özetli onay diyaloğu.
- **Efor:** M

### 3. Yüksek · doğruluk · Streak simülasyonu sunucudan farklı mantıkla çalışıyor (yanlış bilgi)
- **Kanıt:** `page.tsx:240-245` (tam eşleşme yoksa en yakın alttaki taşın puanı) vs `lib/points-rules.ts:296-299` (yalnızca `days ===` eşleşmesi), `app/api/streak/route.ts:157`.
- **Sorun:** Admin "15. günde +250" görür; gerçekte 15. günde 0, yalnızca tam 14. günde 250 verilir. Etiket de "Yakın bonus" diyerek belirsiz. Ekonomi kararını yanlış önizlemeye dayandırır.
- **Öneri:** Simülasyon mantığını kopyalamak yerine `lib/points-rules.ts`'deki saf fonksiyonları (`getStreakMilestoneBonus`, `getFeedbackReward`, `pickSpinPrize`) istemciden doğrudan import et (Prisma import'unu ayrı bir `points-rules-core.ts`'e ayırarak istemci paketine girmemesini sağla). Önizlemeyi "1–N gün arası kümülatif kazanç" zaman çizelgesi olarak göster: hangi gün kaç puan, toplam kaç.
- **Efor:** S

### 4. Yüksek · doğruluk · Yinelenen çark ödül id'si kullanıcıya yanlış ödülü gösterir
- **Kanıt:** `page.tsx:318` (`id: spin_custom_${prev.spin.prizes.length + 1}`), `lib/points-rules.ts:136-139` (id benzersizliği yok), `app/api/gamification/spin/route.ts:57`, `components/gamification/spin-wheel.tsx:151-158` (`findIndex(p.id === apiPrize.id)`).
- **Sorun:** 7 ödül → ekle (`spin_custom_8`) → bir ödül sil (6+1=7) → ekle → yine `spin_custom_8`. Sunucu ikinci ödülü seçip onun değerini kredilediğinde istemci `findIndex` ile ilk eşleşen dilimi bulur, çarkı o dilimde durdurur ve onun etiketini gösterir: kullanıcı "50 Puan" görür, 10 puan alır (veya tersi). Güven ve destek talebi riski.
- **Öneri:** Yeni ödüle `crypto.randomUUID()` tabanlı id ver; sunucu normalize aşamasında id çakışmasını 400 ile reddet (veya deterministik olarak yeniden adlandır). İstemci tarafında sunucunun döndürdüğü `index`'i id'den önce tercih etmek de çakışmayı tolere eder.
- **Efor:** S

### 5. Yüksek · UX/hata · Streak gün alanı her tuş vuruşunda odağı kaybediyor
- **Kanıt:** `page.tsx:753` (key `days`'e bağlı), `page.tsx:287` (`clampPositive`), `page.tsx:292` (her güncellemede sıralama).
- **Sorun:** "7"yi "70" yapmak isteyen admin "0"a bastığında satır yeniden bağlanır, odak kaybolur ve satır listenin sonuna atlar. Alanı silmek değeri "1"e çevirir ve yine key değişir. Pratikte gün değerini klavyeyle düzenlemek mümkün değil.
- **Öneri:** Her taşa kalıcı bir `uid` ver (yalnızca istemci durumu için) ve key olarak onu kullan; sıralamayı `onBlur`'da veya kaydetme anında yap. Sayısal alanlar için ortak bir `NumberField` bileşeni yaz: ham string durumunu tutar, `onBlur`'da clamp eder, geçersizse satır içi hata gösterir (bu tüm sayfadaki #8/#11 kusurunu da çözer).
- **Efor:** S

### 6. Orta · eşzamanlılık · Son yazan kazanır, iki admin birbirinin değişikliğini sessizce ezer
- **Kanıt:** `route.ts:52-68` (koşulsuz `upsert`), GET yanıtında `updatedAt` yok (`route.ts:24-28`).
- **Sorun:** Ekonomi ayarı birden fazla kişinin (Furkan + yardımcı) dokunduğu bir yüzey; sekmede açık kalmış eski form tüm matrisi geri yazar. AuditLog'da eski değer var ama geri dönüş manuel SQL gerektirir.
- **Öneri:** GET'te `version: setting.updatedAt.toISOString()` dön, PUT'ta `baseVersion` iste; `updateMany({ where: { key, updatedAt: base } })` ile koşullu yaz, `count===0` → 409 + güncel matris. UI'da "Bu matris siz düzenlerken X tarafından değiştirildi" bandı ve alan bazlı birleştirme/fark görünümü.
- **Efor:** M

### 7. Orta · mimari · "Anında uygulanır" vaadi süreç-içi önbellekle tutmuyor
- **Kanıt:** `lib/points-rules.ts:242-262` (modül düzeyi değişken, TTL 60 sn), `route.ts:82` (`clearPointsMatrixCache()` yalnızca o örnek), `page.tsx:437`.
- **Sorun:** Vercel'de birden fazla fonksiyon örneği varken diğer örnekler 60 sn boyunca eski değerle puan basar. Çarkı acil kapatma (`spin.enabled=false`) senaryosunda bu bir dakikalık pencere önemli.
- **Öneri:** Projede zaten bulunan Upstash Redis katmanına taşı: anahtar `points_matrix:v{updatedAt}` veya kaydetmede Redis'e yaz + süreç-içi önbelleği Redis'teki sürüm numarasına göre doğrula (token-replay için kullanılan "Redis sıcak katman + DB kaynak-doğruluk" deseni). UI metnini "Değişiklikler en geç ~60 sn içinde tüm sunuculara yayılır" olarak dürüstleştir veya Redis ile gerçekten anında yap.
- **Efor:** M

### 8. Orta · UX/veri · Sahte yükleme durumu ve düzenlemenin sessizce ezilmesi
- **Kanıt:** `page.tsx:190-192`, `page.tsx:214-216`; inputlarda `disabled={loading}` yok.
- **Sorun:** Sayfa açılır açılmaz gerçek olmayan sayılar gösterilir; hızlı davranan admin değer değiştirirse GET yanıtı geldiğinde değişiklik uyarısız kaybolur. "Yenile" de kirli formda onaysız aynı şeyi yapar (`page.tsx:407`).
- **Öneri:** Bulgu 1'deki durum makinesiyle birlikte skeleton; kirli formda Yenile → "Kaydedilmemiş değişiklikler silinecek" satır içi onay. Ek olarak `beforeunload` + App Router geçişleri için `useUnsavedChangesGuard` ortak hook'u (diğer admin ayar sayfaları da kullanır).
- **Efor:** S

### 9. Orta · bilgi mimarisi · Ekonominin parçaları dört sayfaya dağılmış; bu sayfa kendini "genel puan sistemi" olarak tanıtıyor
- **Kanıt:** `page.tsx:425`; tavanlar sabit kodlu `lib/points-caps.ts:13-14`; referans kademeleri sabit kodlu `lib/referral-milestones.ts:20-25`; çarpanlar `app/admin/gamification-settings` (`feedbacks/route.ts:313-317`); simülatör `app/admin/economy-sim`; referans aylık limiti innovation ayarında (`referral/route.ts:~180`).
- **Sorun:** Admin feedback puanını 200'e çıkardığında günlük 500 tavanının etkiyi sınırladığını, global çarpanın 1.5 olduğunu ya da tüketim yorumunda çarpanın hiç uygulanmadığını (`review/route.ts:163-200`'de `pointMultiplier` yok) bu sayfadan göremez. "Gerçek" kazanç ile gösterilen kazanç farklı.
- **Öneri:** Bkz. "Çakışmalar". Kısa vadede her bölüm kartına "Etkileyen diğer ayarlar" satırı (çarpan değeri + tavan + linkler) ekle; GET'e `context: { multipliers, caps }` alanı ekleyip simülasyonu bunlarla hesapla.
- **Efor:** M

### 10. Orta · erişilebilirlik · Form alanlarının erişilebilir adı yok
- **Kanıt:** Tüm `Label` kullanımları `htmlFor`'suz (`page.tsx:448, 467, 483, 501, 520, 548, 565, 584, 605, 624, 654, 667, 687, 707, 725, 755, 763, 835, 853, 860, 872, 881, 921, 932, 943, 970`); ikon butonları `page.tsx:771-778`, `892-899`; Switch `page.tsx:827`.
- **Sorun:** Ekran okuyucu "düzenleme alanı, sayı" diye okur; tekrarlanan "Temel Puan" etiketleri bağlamsız. Klavye kullanıcısı silme butonlarının neyi sildiğini bilemez.
- **Öneri:** `useId()` tabanlı bir `Field` bileşeni (label + input + yardım + hata, `aria-describedby`); ikon butonlara `aria-label="14. gün kilometre taşını sil"`; tablo benzeri satırlar için `role="group"` + `aria-labelledby`. Native `select` yerine shadcn `Select` ve Türkçe seçenek adları ("Puan", "XP", "Boş").
- **Efor:** S

### 11. Düşük · dil/tutarlılık · TR/EN karışıklığı ve geliştirici dili
- **Kanıt:** "Feedback Puanları" `page.tsx:444`, "Referral" `650`, "Görev (Quest)" `703`, "Streak Milestones" `748`, "Milestone Ekle" `784`, `points/xp/nothing` `866-868`, "backend'de ağırlıklı (weighted)" `795`, "Tüm alanlar gerçek API'ye bağlıdır" `437`, "Kodu Sahibi" `667`; toast önekleri ASCII "Basarili:" (`lib/admin-toast.ts:20`) ve `toast.info` önek almıyor (`page.tsx:233`).
- **Öneri:** Sayfayı `messages/tr.json`/`en.json`'a taşı (sidebar zaten i18n'li); terim sözlüğü: Geri bildirim, Davet, Seri, Kilometre taşı, Görev, Çark. Toast öneklerini doğru Türkçe karakterlerle düzelt.
- **Efor:** S

### 12. Düşük · mimari · Ölü kod ve tip kopyası
- **Kanıt:** `page.tsx:236-238` (`updateNumber` yalnızca setter'ı çağıran anlamsız sarmalayıcı, tek yerde kullanılıyor `453`); `page.tsx:14-54` ve `87-187` `lib/points-rules.ts:6-50`, `150-240`'ın elle kopyası; `useEffect` bağımlılık dizisi `fetchMatrix`'i içermiyor (`224-226`).
- **Öneri:** Tipleri ve normalize'ı `lib/points-rules-core.ts` (Prisma'sız) altında paylaş; formu bölüm bileşenlerine ayır (`FeedbackSection`, `StreakSection`, `SpinSection`, `PreviewPanel`) ve tek bir `useReducer` ile `setIn(path, value)` güncellemesi kullan — 1001 satır yaklaşık 400'e iner.
- **Efor:** M

### 13. Düşük · ürün mantığı · 1. gün / kopya gün kilometre taşı tuzakları
- **Kanıt:** `page.tsx:277` (`days: 1` varsayılan), `lib/points-rules.ts:296-299` (`find` ilk eşleşeni alır).
- **Sorun:** 1. güne bonus verilirse seriyi bilerek bozan kullanıcı her sıfırlamada tekrar kazanır; aynı gün iki kez girilirse ikincisi sessizce yok sayılır.
- **Öneri:** Gün ≥ 2 ve benzersiz kuralı (istemci + sunucu); ekle butonu son taşın 2 katı gibi anlamlı bir öneriyle satır açsın.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Sürüm geçmişi + fark + tek tıkla geri yükleme** (Stripe "Events", PostHog feature flag geçmişi): AuditLog'daki `oldData/newData` zaten var; sayfada sağ panelde "Son 20 değişiklik — kim, ne zaman, hangi alan" ve "Bu sürüme dön".
2. **Kaydetmeden önce değişiklik özeti ve etki tahmini onayı** (Retool/Stripe fiyat değişikliği onayı): "3 alan değişti; tahmini günlük basım +%34" diyaloğu.
3. **Gerçek veriye dayalı etki analizi**: son 30 günün `points_credited` olaylarından kaynak bazlı (feedback/çark/streak/referral/doğum günü) basılan puan dağılımı ve yeni kurallarla yeniden hesaplanmış tahmin (economy-sim'in genişletilmiş hali).
4. **Zamanlanmış / taslak değişiklik ve A/B segmenti** (PostHog flags, Linear zamanlama): "Cuma 18:00'de çark limitini 2 yap", ya da yalnızca bir segmentte dene; projede `ab-testing` ve `seasonal-campaigns` altyapısı zaten var.
5. **Acil durum anahtarı (kill switch)**: tüm puan basımını veya tek bir kaynağı anında durdurma, Redis ile örnekler arası anlık yayılım.
6. **Eşzamanlı düzenleme algısı**: "X bu sayfayı düzenliyor" ve 409 çakışma birleştirmesi.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Ekonomi kontrol masası". Admin bir değeri değiştirdiğinde (a) kullanıcının gerçekte ne alacağını (çarpan + tavan dahil), (b) platformun günlük/haftalık ne kadar puan basacağını, (c) neyin değiştiğini görerek, güvenle ve geri alınabilir şekilde yayına alabilmeli.

**Yerleşim (masaüstü):**
- Üstte kompakt başlık + durum çubuğu: "Canlı sürüm: 3 Eki 14:12, Furkan · 2 kaydedilmemiş değişiklik" + sticky "İncele ve yayınla" butonu.
- Solda dikey bölüm navigasyonu (Geri bildirim · Tüketim yorumu · Davet · Doğum günü · Seri · Görev · Çark · Tavanlar & çarpanlar), her öğede değişiklik noktası. Linear ayar sayfalarındaki gibi tek kolon, okunur form.
- Sağda sabit "Önizleme" paneli: seçili bölüme göre bağlamsal — seri için 1–90 gün kümülatif çizgi grafiği, çark için ağırlık halka grafiği + beklenen değer (EV puan/çevirme), feedback için "kısa/uzun yorumda net kazanç (çarpan ve tavan sonrası)".
- Kirli alanlar eski değeri üstü çizili gri, yenisi vurgulu gösterir; sınır dışı değerde satır içi hata.
- "İncele ve yayınla" → yan çekmece (Sheet): alan bazlı diff tablosu, etki tahmini, isteğe bağlı not (AuditLog'a yazılır), onay.
- Alt sekme: "Geçmiş" — AuditLog zaman çizelgesi, her kayıtta diff ve "bu sürüme dön".

**Mobil:** Bölüm navigasyonu yatay kaydırılabilir sekme çubuğuna dönüşür; önizleme her bölümün altına katlanabilir kart olur; "İncele ve yayınla" safe-area'lı alt sabit çubukta.

**Motion (ölçülü):** Değer değişince önizleme sayısında 150 ms'lik sayı geçişi (`m as Motion`, `useReducedMotion` ile kapatılır); çark halka grafiğinde ağırlık değişince dilimlerin yumuşak yeniden boyutlanması; kaydetme başarılı olunca durum çubuğunda kısa onay. 3D gereksiz — bu bir operasyon aracı, dikkat dağıtmamalı.

**Veri / API değişiklikleri:**
- `GET /api/admin/settings/points-matrix` → `{ matrix, defaults, limits, version, updatedBy, context: { multipliers, caps } }`.
- `PUT` → gerçek Zod şeması (`POINTS_MATRIX_LIMITS`), `baseVersion` ile koşullu yazma (409), id/gün benzersizliği, opsiyonel `note`.
- Yeni `GET /api/admin/settings/points-matrix/history` → AuditLog'dan `action='UPDATE_POINTS_MATRIX'` kayıtları (sayfalı); `POST …/restore` → seçili sürümü yeni sürüm olarak yazar.
- `POST …/preview` (veya istemcide saf fonksiyon) → son 30 gün olay hacmiyle yeni kural etkisi.
- Önbellek: Redis'te sürüm anahtarı; kaydetmede tüm örneklerde anlık geçersizleşme.
- Tavanlar (`DAILY/WEEKLY_FEEDBACK_POINTS_CAP`) ve referans kademeleri sabit koddan matrise (veya ayrı `economy_limits` ayarına) taşınır.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/economy-sim`**: Aynı matrisi okuyup yalnızca feedback/görev/çark için toplu tahmin yapıyor (`app/api/admin/economy-sim/route.ts:22-53`); bu sayfadaki "Canlı Puan Mantığı Simülasyonu" ile işlev olarak örtüşüyor ve ikisi de eksik (economy-sim streak/referral/doğum günü/tüketim yorumunu, bu sayfa çarpan/tavanı içermiyor). **Öneri:** simülatörü bu sayfanın sağ önizleme paneline ve "Etki" sekmesine birleştir, `/admin/economy-sim`'i kaldır veya yönlendir.
- **`/admin/gamification-settings`**: Puan/XP çarpanları ve günlük XP tavanı; bu sayfadaki değerlerin gerçek etkisini doğrudan belirliyor. **Öneri:** aynı "Ekonomi" merkezinde "Çarpanlar & tavanlar" bölümü olarak birleştir.
- **`/admin/quests`**: Görev bazlı ödüller orada; buradaki "varsayılan görev ödülü" yalnızca yedek değer. Görev formunda "boş bırakılırsa matris varsayılanı (100 puan / 50 XP) kullanılır" ipucu ve buraya link verilmeli.
- **`/admin/referrals` + innovation referral limitleri**: Davet ödülü burada, kademe ödülleri sabit kodda, aylık kullanım limiti innovation ayarında. Davetle ilgili tüm kurallar tek bölümde toplanmalı.
- **`/admin/character-thresholds`**: Aynı "Settings JSON + 60 sn süreç-içi önbellek" desenini kopyalıyor (`lib/character-thresholds.ts:3,51`); Redis'e geçiş ve sürüm/çakışma mekanizması ortak bir `versionedSetting<T>()` yardımcısı olarak her iki sayfaya birden uygulanmalı.
- **Sonuç:** Sayfa kaldırılmamalı — ekonominin tek yazma noktası ve tüketicileri doğru bağlı. Ancak `/admin/economy-sim` + `/admin/gamification-settings` ile birlikte sekmeli tek bir **"Ekonomi"** sayfasına (Kurallar · Çarpanlar & tavanlar · Etki/simülasyon · Geçmiş) birleştirilmeli.

---

## Doğrulama (şüpheci inceleme)

İncelenen kod: `app/admin/points-matrix/page.tsx`, `app/api/admin/settings/points-matrix/route.ts`, `lib/points-rules.ts`, `lib/validations-admin.ts`, `lib/points-wallet.ts`, `app/api/auth/register/route.ts`, `app/api/gamification/spin/route.ts`, `components/gamification/spin-wheel.tsx`, `app/api/admin/users/route.ts`, `prisma/schema.prisma`. Hiçbir kod/veritabanı çalıştırılmadı; tüm kararlar kod okumasına dayanır.

### 1. Yükleme hatasında sahte varsayılanlar canlı puan matrisini ezebilir — **DOĞRULANDI**

- Zincir kodda birebir var: `matrix` `EMPTY_MATRIX` ile başlıyor (`page.tsx:192`), `initialSignature` `''` (`page.tsx:193`); `isDirty = matrixSignature !== initialSignature` (`page.tsx:200`) bu yüzden ilk render'dan itibaren `true`. GET başarısız olursa `catch` yalnızca toast atıyor, `initialSignature` hiç set edilmiyor (`page.tsx:217-219`), `finally` `loading=false` yapıyor (`page.tsx:220`). Sonuç: rozet "Değiştirildi" (`page.tsx:434`), her iki Kaydet düğmesi etkin (`page.tsx:414`, `:993` → `disabled={loading || saving || !isDirty}`).
- İstemci varsayılanı sunucununkiyle aynı değil: `EMPTY_MATRIX.streak.milestones` yalnızca 7/14/30 gün (`page.tsx:61-67`), sunucu varsayılanı 60/90/180/365 günü de içeriyor (`lib/points-rules.ts:70-80`). PUT gövdesi doğrudan `normalizePointsMatrix` ile kaydediliyor (`route.ts` PUT, `z.unknown()` sonrası upsert), yani "eksik alan" kavramı yok; gönderilen tam matris canlı değeri tamamen değiştirir. Önbellek de hemen temizleniyor (`clearPointsMatrixCache()`), etki anında.
- **Yeniden üretim:** Admin sayfayı açar; GET geçici olarak 500 döner (Neon soğuk başlangıç / bağlantı hatası → `route.ts` GET `catch` 500) ya da ağ kesilir. Admin hata toast'ını kapatıp örneğin yalnızca doğum günü puanını değiştirir ve Kaydet'e basar. PUT başarılı olur; 60/90/180/365 günlük seri ödülleri (1000–10000 puan) ve daha önce özelleştirilmiş tüm feedback/çark/referans değerleri istemci sabitleriyle değişir. 60+ günlük seriye ulaşan müşteriler bundan sonra milestone ödülü alamaz (`getStreakMilestoneBonus` tam eşleşme arıyor, `lib/points-rules.ts:296-299`).
- **Sınır:** Oturum düşmesi senaryosu tek başına zarar üretmez — GET 401 ise PUT da `requireAuth(['ADMIN'])` ile 401 döner. Zarar, geçici 5xx/ağ hatası + admin'in kaydetmesi kombinasyonunda oluşur. Eski değer `auditLog.oldData`'da tutulduğu için veri teknik olarak kurtarılabilir, ama arayüzde geri yükleme yok.
- **Öneri:** Üç durumlu yükleme modeli (`loading | ready | error`); `error` durumunda form yerine hata kartı + "Tekrar dene", Kaydet/Geri Al tamamen gizli. `isDirty` yalnızca `initialSignature !== ''` iken hesaplanmalı. Kalıcı çözüm olarak PUT'a iyimser kilit (`If-Match`/`version` = son okunan `updatedAt`) eklenmeli; sürüm uyuşmazsa 409 dönülmeli. Bu, hem bu senaryoyu hem iki adminin birbirinin değişikliğini ezmesini kapatır.

### 2. Puan matrisinde üst sınır doğrulaması yok — **DOĞRULANDI (kısmen; önem derecesi abartılı)**

- Doğru olan kısım: Şema `matrix: z.unknown()` (`lib/validations-admin.ts:86-88`), normalizasyon yalnızca alt sınır uyguluyor (`lib/points-rules.ts:108-116`), istemci de yalnızca `Math.max(0, …)` (`page.tsx:84`). `User.points`/`xp` `Int` (`prisma/schema.prisma:47,49`), `Referral.bonusGiven/pointsEarned` da tamsayı. 2.147.483.647 üstü bir değer (örn. `10000000000` gibi fazladan sıfırlı yazım hatası) kaydedilebilir.
- **Yeniden üretim (taşma):** Admin `referral.referredPoints = 3000000000` kaydeder. Referans kodlu her kayıtta `register/route.ts:109-148` içindeki transaction `creditPointsAndXp` → `points: { increment: 3e9 }` (`lib/points-wallet.ts:36-40`) aşamasında Postgres "integer out of range" ile düşer; dış `catch` 500 döner. Kullanıcı hesabı ve doğrulama maili ise transaction'dan ÖNCE oluşturulduğu için (`register/route.ts:58-96`) kullanıcı "kayıt başarısız" görür ama hesap vardır — kafa karıştırıcı yarım durum. Aynı şekilde büyük değerli bir çark ödülü seçildiğinde `spin/route.ts` transaction'ı 500 döner (günlük hak tüketilmez çünkü tx geri alınır).
- Çürütülen kısım: "Sınırsız puan basımı" bir yetki aşımı değil. Admin zaten `POST /api/admin/users` `add_points` ile istediği kullanıcıya istediği kadar puan ekleyebiliyor (`app/api/admin/users/route.ts:399-404`). Yani güvenlik açığı değil, yanlış yapılandırmaya karşı koruma eksikliği. Ayrıca taşma ancak ≥ 2^31 değerle tetiklenir; gerçekçi tetik yalnızca yazım hatasıdır. Önem: **ORTA** (KRİTİK/YÜKSEK değil).
- **Öneri:** `adminPointsMatrixPutSchema` gerçek bir Zod şemasına dönüşmeli: alan bazında makul tavanlar (örn. feedback ≤ 1.000, referans ≤ 10.000, streak ≤ 50.000, çark ödülü ≤ 5.000, `dailyLimit` ≤ 10, ödül sayısı ≤ 24), ihlalde alan yoluyla 400. Formda aynı sınırlar `max` ve satır içi uyarı olarak gösterilmeli; önceki değere göre >%500 artışta "Bu değer öncekinin X katı" onay adımı eklenmeli.

### 3. Yinelenen çark ödül id'si ile gösterilen ve kredilenen ödül farklılaşıyor — **DOĞRULANDI**

- Id üretimi dizi uzunluğuna bağlı: `spin_custom_${prev.spin.prizes.length + 1}` (`page.tsx:318`). Sunucu normalizasyonu id benzersizliğini kontrol etmiyor (`lib/points-rules.ts:136-139`). Sunucu ödülü nesne olarak seçip o nesnenin `value`'sunu krediliyor (`spin/route.ts` → `pickSpinPrize` + `creditPointsAndXp(tx, { points: prize.value })`), ama yanıttaki `index` de `findIndex(entry.id === prize.id)` ile ilk eşleşmeye gidiyor. İstemci önce `prizes.findIndex((p) => p.id === apiPrize.id)` ile ilk eşleşen dilimi seçiyor (`spin-wheel.tsx:151-158`) ve toast/konfeti/`onPrizeWon` için `prizes[selectedIndex]`'in label/value'sunu kullanıyor (`spin-wheel.tsx:158, 171-194`), sunucunun döndürdüğü `value`'yu değil.
- **Yeniden üretim:** Varsayılan 7 ödül. Admin "Büyük Ödül" ekler → `spin_custom_8`, değeri 1000. Sonra "10 Puan"ı (index 0) siler → uzunluk 7. Tekrar "Teselli" ekler → yine `spin_custom_8`, değeri 5. Kaydedilir (sunucu kabul eder). Müşteri çarkı çevirir, sunucu "Teselli"yi seçip 5 puan kredilir; istemci ilk `spin_custom_8` dilimi olan "Büyük Ödül"de durur, "1000 puan hesabına eklendi!" toast'ı ve konfeti gösterir. Bildirim kaydı (`notification.message`) ise 5 puan der — kullanıcı tutarsızlık görür, destek talebi/güven kaybı. Ters yönde de oluşur. `analyticsEvent.prizeId` de iki ödülü ayırt edemez.
- **Öneri:** Id'yi `crypto.randomUUID()` (veya `spin_${Date.now().toString(36)}`) ile üret; sunucuda `normalizePointsMatrix` yinelenen id'leri ya 400 ile reddetmeli ya da `-2` sonekiyle tekilleştirmeli. Ayrıca istemci, sunucunun döndürdüğü `index`'i birincil kaynak kabul etmeli ve toast'ta her zaman `apiPrize.value/label` göstermeli (gösterilen = kredilenen garantisi); sunucu da `index`'i nesne kimliğiyle (`rules.indexOf(prize)`) hesaplamalı.
