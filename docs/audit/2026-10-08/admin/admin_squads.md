# /admin/squads

**Amaç:** Platform operatörünün tüm klanları (Squad) görmesi, araması/sıralaması, sahip ve üyelerini incelemesi, davet kodlarını görmesi ve gerekirse bir klanı "dondurması" (moderasyon). Dosya: `app/admin/squads/page.tsx` (141 satır, tek `'use client'` bileşeni), API: `app/api/admin/squads/route.ts` (GET + PATCH).

**Genel puan:** 4/10 · **Karar:** yeniden tasarla (kardeş sayfa `/admin/squads/battles` ile tek bir "Klan Merkezi"nde birleştirilerek)

Kısa hüküm: Sayfa bir liste + tek moderasyon düğmesinden ibaret. Listeleme, arama, sıralama ve sayfalama temel düzeyde çalışıyor. Ancak sayfanın tek gerçek aksiyonu olan **"Soft Freeze" fiilen etkisiz**: veritabanına `Squad.isFrozen` yazılıyor, fakat müşteri tarafındaki katılma/oluşturma akışları başka bir kaynağa (`Settings.admin_frozen_squads`) bakıyor. Bu kaynağa ise kod tabanında hiçbir yer yazmıyor. Dondurulmuş klan puan, hazine ve savaş skoru kazanmaya devam ediyor. Sonuçta operatöre "dondurdum" hissi veren ama sonuç doğurmayan bir kontrol var.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Listeleme/arama/sıralama/sayfalama çalışıyor; tek moderasyon aksiyonu (freeze) yaptırımsız, CSV yalnızca 20 satırı kapsıyor, hata yönetimi yok. |
| UX | 3/10 | Freeze için onay yok, durum rozeti yok, boş/yükleniyor/hata durumu yok; arama Enter ile çalışmıyor; klan detayı, puan ve savaş bilgisi yok. |
| Görsel | 3/10 | Ham `rounded border p-3` satırlar, virgülle birleştirilmiş üye metni, native `<select>`; diğer admin sayfalarındaki hero/stat kartı diliyle ve shadcn `Table`/`Badge`/`Select` ile tutarsız. |
| Mimari | 4/10 | İki ayrı "dondurma" kaynağı (kolon ile Settings JSON), `any` tipli where/orderBy, zod doğrulaması yok, audit log yok, i18n yok, battles sayfası menüden kopuk. |
| Performans | 6/10 | Sorgular sayfalı ve indeksli; ancak her klanın TÜM üyeleri (`points` dahil) sınırsız çekiliyor, filtrele tıklamasında çift istek ve yarış var. |
| Erişilebilirlik + Mobil | 4/10 | Basit dikey yığın mobilde dağılmıyor; ancak input/select etiketsiz, tekrarlayan "Soft Freeze" düğmeleri bağlamsız (hangi klan?), aria-live yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişimi: ADMIN rolü + gizli kapı cookie'si | ÇALIŞIYOR | `proxy.ts:60-87` | `/admin/*` sayfası rol ve gate cookie ile korunuyor. |
| 2 | API yetkisi (`requireAuth(['ADMIN'])`) | KISMİ | `app/api/admin/squads/route.ts:9,81`; `proxy.ts:104-117`; `lib/api-auth.ts:52-80` | Rol ve token-replay kontrolü var. `/api/*` istekleri gate middleware'ine hiç girmiyor, `requireAuth` da gate cookie'ye bakmıyor. Gizli kapı API'de uygulanmıyor (sistem geneli, bkz. Bulgu 2). |
| 3 | Başlık/açıklama (PageHeader → DashboardPageHero) | ÇALIŞIYOR | `page.tsx:75-79`; `components/dashboard/page-header.tsx:14-22` | Başlıkta "Klan / Squad" diye TR/EN karışık. |
| 4 | CSV dışa aktarma | KISMİ | `page.tsx:55-71` | Yalnızca o anki sayfadaki en fazla 20 klanı aktarıyor (`data.squads`). UTF-8 BOM eklenmediği için Excel'de Türkçe karakterler bozulur. Sütunlar İngilizce, tarih/puan/üye listesi yok. |
| 5 | Yenile düğmesi + "Yükleniyor..." etiketi | KISMİ | `page.tsx:30-37,78` | `load()` içinde try/catch yok. Ağ hatası veya JSON parse hatasında `setLoading(false)` çalışmaz, düğme kalıcı olarak "Yükleniyor..." durumunda kilitli kalır. |
| 6 | Arama kutusu (ad / kod / owner) | KISMİ | `page.tsx:82`; API `route.ts:22-29` | Sunucu tarafı arama doğru (insensitive, owner relation). Ancak bir `<form>` yok, Enter tuşu çalışmıyor. Yazılan değer yalnızca "Filtrele" veya sıralama/sayfa değişince uygulanıyor; bu da sıralamayı değiştiren kullanıcıya fark ettirmeden yarım kalmış aramayı uygulatıyor. |
| 7 | Sıralama (en yeni / en eski / üye sayısı ↑↓) | ÇALIŞIYOR | `page.tsx:83-92`; `route.ts:32-35` | `members._count` sıralaması doğru. Puan, hazine ve son aktivite sıralamaları yok. |
| 8 | "Filtrele" düğmesi | KISMİ | `page.tsx:93,38` | `setPage(1); load()` aynı anda çalışıyor. Sayfa 1 değilse `load()` eski `page` değeriyle bir istek atar, `useEffect` ise page=1 ile ikinci bir istek atar. AbortController olmadığı için hangisi son dönerse o ekranda kalıyor (yarış). |
| 9 | Stat: Toplam squad | ÇALIŞIYOR | `page.tsx:97`; `route.ts:50-53` | Global sayım, filtreden bağımsız (etikette bu belirtilmiyor). Yüklenirken "0" gösteriyor. |
| 10 | Stat: Toplam üye | ÇALIŞIYOR | `page.tsx:98` | Aynı not geçerli. |
| 11 | Stat: Ort. üye/squad | ÇALIŞIYOR | `page.tsx:99`; `route.ts:64` | API bazen string (`toFixed`), bazen number (0) dönüyor. Tip sözleşmesi (`number`, `page.tsx:11`) yanlış. |
| 12 | Klan satırı: ad | ÇALIŞIYOR | `page.tsx:106` | Açıklama (`description`) gösterilmiyor. |
| 13 | Owner + davet kodu | ÇALIŞIYOR | `page.tsx:107` | Owner tıklanabilir değil (kullanıcı detayına link yok). |
| 14 | Üye listesi | KISMİ | `page.tsx:108`; `route.ts:43` | Tüm üyeler virgülle tek satıra yazılıyor, üye sayısı sınırsız (`join` route'unda tavan yok). Üye başına `points` çekiliyor ama kullanılmıyor. Üyelerden kullanıcı sayfasına geçilemiyor, üye çıkarma imkânı yok. |
| 15 | Soft Freeze / Freeze Kaldır | BOZUK | `page.tsx:40-53,110-112`; `route.ts:86-91`; `join/route.ts:11,47-59`; `customer/squads/route.ts:11,44-66` | Yalnızca `Squad.isFrozen` yazılıyor. Bu kolonu okuyan tek yer, meydan okumanın HEDEF kontrolü (`challenge/route.ts:69,77`). Katılma/oluşturma ise hiç yazılmayan `Settings.admin_frozen_squads` anahtarını okuyor. Ayrıntı Bulgu 1'de. |
| 16 | Dondurulmuş durumu göstergesi | EKSİK | `page.tsx:105-113` | Rozet, renk veya filtre yok. Durumu yalnızca düğme metninden anlamak mümkün. |
| 17 | Freeze için onay diyaloğu / gerekçe | EKSİK | `page.tsx:110` | Tek tıkla "destructive" aksiyon çalışıyor. Ne gerekçe alanı ne geri al seçeneği var. |
| 18 | Audit log (kim, ne zaman, neden dondurdu) | EKSİK | `route.ts:86-91` | `AuditLog` modeli mevcut (`prisma/schema.prisma:1106`) ve başka admin uçlarında kullanılıyor (`app/api/admin/api-keys/route.ts:74`), burada kullanılmıyor. |
| 19 | Sayfalama: Önceki / Sonraki | ÇALIŞIYOR | `page.tsx:118-138` | Sayfa numarasına atlama ve sayfa boyutu seçimi yok. |
| 20 | Sayfa göstergesi "Sayfa x / y" | ÇALIŞIYOR | `page.tsx:127-129` | Sonuç yokken `totalPages=0` olduğu için "Sayfa 1 / 0" görünür (`route.ts:70`). |
| 21 | Yükleniyor durumu (skeleton) | EKSİK | `page.tsx:96-117` | Liste boş kalıyor, statlar "0" gösteriyor. Veri yokmuş gibi yanıltıcı bir görüntü oluşuyor. `components/ui/skeleton.tsx` mevcut ama kullanılmıyor. |
| 22 | Boş durum | EKSİK | `page.tsx:104` | Arama sonuç vermezse kart başlığının altı bomboş kalıyor. `components/ui/empty-state.tsx` mevcut ama kullanılmıyor. |
| 23 | Hata durumu | BOZUK | `page.tsx:33-36` | `!res.ok` durumunda sessizce eski veri kalıyor, toast çıkmıyor. İstek reddedilirse unhandled rejection oluşuyor ve loading kilitleniyor. |
| 24 | Toast geri bildirimi | ÇALIŞIYOR | `page.tsx:48,51`; `lib/admin-toast.ts:16-19` | Önek "Basarili: " ASCII (ş eksik). Freeze sonrası metin yanıltıcı, çünkü işlem fiilen etkisiz. |
| 25 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:81,96` | `flex-col md:flex-row`, `grid-cols-1 md:grid-cols-3`. Basit ama taşmıyor. |
| 26 | Form etiketleri / aria | EKSİK | `page.tsx:82-92,110` | Input ve select için `<Label>`/`aria-label` yok. Freeze düğmesi hangi klan için olduğunu söylemiyor (`aria-label` yok). |
| 27 | i18n | EKSİK | `page.tsx:76-136` | Tüm metinler sabit kodlu. Kardeş battles sayfası `useAppT` kullanıyor (`battles/page.tsx:16,19`), sidebar etiketi i18n'den geliyor (`messages/tr.json:2480`). "Owner", "Soft Freeze", "Squad" gibi İngilizce kelimeler var. |
| 28 | Klan savaşları yönetimine geçiş | EKSİK | `components/dashboard/sidebar.tsx:176`; `app/admin/squads/battles/page.tsx` | `/admin/squads/battles` ne sidebar'da ne bu sayfada linkli. Yalnızca URL bilinerek erişilebiliyor (yetim sayfa). |
| 29 | Klan detayı (totalPoints, treasuryPoints, haftalık hedef, savaş geçmişi, oluşturulma tarihi) | EKSİK | `prisma/schema.prisma:399-423`; `page.tsx:13-20` | Şemada olan ekonomi alanları admin'e hiç gösterilmiyor. |
| 30 | Moderasyon aksiyonları: yeniden adlandır, davet kodu yenile, üye çıkar, sahiplik devri, klanı sil | EKSİK | `route.ts:86-94` | PATCH yalnızca freeze/unfreeze kabul ediyor. |
| 31 | URL'de durum (q/page/sort) | EKSİK | `page.tsx:26-28` | Yenilemede veya link paylaşımında filtre kayboluyor. |
| 32 | Durum filtresi (aktif / dondurulmuş / savaşta) | EKSİK | `route.ts:21-29` | Yok. |
| 33 | PATCH girdi doğrulaması | KISMİ | `route.ts:84-91` | zod yok. `squadId` eksik veya geçersizse Prisma hatası genel bir 500 olarak dönüyor (404 yerine). |
| 34 | GET parametre doğrulaması | KISMİ | `route.ts:14-18` | `page=abc` → NaN → `skip: NaN` → 500. `pageSize` üst sınırsız (`pageSize=100000` her klanın tüm üyeleriyle döner). |

**Sayım:** ÇALIŞIYOR 12 · KISMİ 8 · BOZUK 2 · SAHTE 0 · EKSİK 12 (toplam 34)

---

## Bulgular

### 1. "Soft Freeze" fiilen etkisiz: iki ayrı dondurma kaynağı var ve hiçbiri tutarlı uygulanmıyor
- **Önem:** yüksek · **Kategori:** hata / veri bütünlüğü / moderasyon · **Efor:** M
- **Kanıt:**
  - Admin yalnızca kolonu yazıyor: `app/api/admin/squads/route.ts:87-90` (`data: { isFrozen: ... }`).
  - Katılma, kolona değil `Settings` anahtarına bakıyor: `app/api/customer/squads/join/route.ts:11,47-59` (`admin_frozen_squads`).
  - Klan oluşturma da aynı anahtara bakıyor: `app/api/customer/squads/route.ts:11,44-66`.
  - `admin_frozen_squads` anahtarına yazan hiçbir kod yok. Tüm repoda yalnızca bu iki okuma var (grep ile doğrulandı).
  - `isFrozen` kolonunun tek tüketicisi, meydan okumanın hedef kontrolü: `app/api/customer/squads/challenge/route.ts:69,77`. Meydan okuyan klanın kendisi kontrol edilmiyor (`challenge/route.ts:50-53` yalnızca `id, name` seçiyor).
  - Dondurulmuş klan kazanmaya devam ediyor:
    - pasif puan: `app/api/dealer/consumptions/route.ts:329-340`
    - hazine payı: `lib/gamification-engine.ts:143-160` (çağrı: `app/api/feedbacks/route.ts:327`)
    - aktif savaş skoru: `lib/gamification-engine.ts:180-212`
  - Savaş kabulü (`app/api/customer/squads/battles/[id]/respond/route.ts`) ve admin savaş oluşturma (`app/api/admin/squads/battles/route.ts:41-50`) isFrozen kontrol etmiyor.
- **Sorun:** Operatör kötüye kullanım gören (ör. puan çiftliği yapan) bir klanı dondurduğunu sanıyor ve "Squad donduruldu" toast'ını görüyor. Gerçekte klana yeni üye katılabiliyor, üyeleri yeni klan kurabiliyor, klan meydan okuyabiliyor, savaş kabul edebiliyor, puan ve hazine biriktiriyor. Sonuç doğurmayan bir moderasyon kontrolü, hiç olmamasından daha tehlikeli; çünkü operatör sorunu çözdüğünü düşünüp takibi bırakıyor.
- **Profesyonel öneri:** Tek bir hakikat kaynağı belirlenmeli: `Squad.isFrozen` kolonu, ve `Settings.admin_frozen_squads` okumaları kaldırılmalı. Bunun için `lib/squad-guard.ts` içinde `assertSquadActive(squadId, tx)` adlı tek bir koruyucu yazılmalı. Bu koruyucu şu noktalarda çağrılmalı:
  - katılma (hedef klan),
  - oluşturma (mevcut üyelik dondurulmuşsa),
  - meydan okuma (hem meydan okuyan hem hedef),
  - savaş kabulü (iki taraf),
  - admin savaş oluşturma.

  Puan tarafında `addToSquadTreasury`, `addToActiveBattleScore` ve dealer pasif puanının klan payı, dondurulmuş klan için no-op olmalı. Kullanıcının kişisel puanı korunur, yalnızca klan katkısı kesilir. Bu davranış "points economy invariants" ilkesine (tek kaynak, fail-closed) uygun.

  Ayrıca "dondur" kavramı ürün düzeyinde tanımlanmalı. Önerilen semantik: *dondurulmuş klan = yeni üye yok, savaş başlatma/kabul yok, klan puanı/hazine birikmez; mevcut üyeler ayrılabilir.* Bu semantik admin onay diyaloğunda madde madde gösterilmeli. Müşteri tarafında (`GET /api/customer/squads`) `isFrozen` döndürülmeli ve klan ekranında bir şerit ile gösterilmeli. Aktif bir savaş varken dondurma yapılırsa savaşın ne olacağı (iptal + escrow iadesi `rewardRefunded` yoluyla) açıkça seçtirilmeli.

### 2. Admin "gizli kapı" API katmanında uygulanmıyor (sistem geneli)
- **Önem:** yüksek · **Kategori:** güvenlik · **Efor:** M
- **Kanıt:**
  - `proxy.ts:104-117`: `/api/*` istekleri `authMiddleware`'e hiç girmiyor, yalnızca güvenlik başlıkları ekleniyor.
  - `proxy.ts:79-87`: gate cookie kontrolü yalnızca sayfa yollarında yapılıyor.
  - `lib/api-auth.ts:52-80`: `requireAuth` rol ve token-replay kontrol ediyor, `admin_gate` cookie'sini kontrol etmiyor (`lib/api-auth.ts` içinde `admin_gate` geçmiyor).
- **Sorun:** Gizli kapının tasarım amacı (`proxy.ts:76-77` yorumu: "Rolü kazara/kötü niyetle ADMIN yapılan stajyer bile gizli rakamı bilmeden panele giremez") yalnızca HTML sayfaları için gerçekleşiyor. ADMIN rolündeki ama gate cevabını bilmeyen bir oturum `PATCH /api/admin/squads` dahil tüm admin uçlarını doğrudan çağırabilir. Bu sayfaya özgü değil, ama bu sayfanın yazma ucunu da kapsıyor.
- **Profesyonel öneri:** `requireAuth` içine, rol listesinde `ADMIN` bulunduğunda `gateCookieBelongsTo(cookies().get('admin_gate'), session.user.id)` kontrolü eklenmeli (HMAC doğrulaması `lib/admin-gate-edge.ts` içinde zaten var). Cron/otomasyon için ayrı imzalı yol bırakılmalı. Alternatif olarak proxy'de `/api/admin/*` için aynı gate kontrolü yapılabilir, ama tek noktada (requireAuth) yapmak daha az kaçak bırakır. Doğrulama için admin rotalarına toplu bir entegrasyon testi yazılmalı.

### 3. Yükleme akışında hata yönetimi yok: sayfa "Yükleniyor..." durumunda kilitlenebilir, hatalar sessiz
- **Önem:** orta · **Kategori:** hata / UX · **Efor:** S
- **Kanıt:** `page.tsx:30-37`: try/catch/finally yok. `!res.ok` durumunda toast yok. `setLoading(false)` yalnızca başarılı akışta çalışıyor.
- **Sorun:** Ağ kesintisi, 403 (token-replay ihlali, `lib/api-auth.ts:70-75`) veya 500 durumunda operatör ya eski veriyi güncel sanıyor ya da kalıcı olarak kilitli bir Yenile düğmesiyle kalıyor.
- **Profesyonel öneri:** Veri katmanı, projedeki diğer admin sayfalarıyla tutarlı bir `useSWR`/`useQuery` benzeri hook'a taşınmalı. Hook şunları sağlamalı: `AbortController`, `finally { setLoading(false) }`, `error` durumu için `EmptyState` + "Tekrar dene" düğmesi, 401/403 durumunda gate'e veya girişe yönlendirme. Eski veri gösteriliyorsa "son güncelleme: hh:mm" bilgisi eklenmeli.

### 4. Filtrele tıklamasında çift istek ve yarış koşulu; arama Enter ile çalışmıyor
- **Önem:** orta · **Kategori:** hata / UX · **Efor:** S
- **Kanıt:** `page.tsx:93` (`setPage(1); load();`), `page.tsx:38` (`useEffect(() => load(), [page, sort])`), `page.tsx:82` (form yok).
- **Sorun:** Kullanıcı 3. sayfadayken arama yapıp Filtrele'ye basarsa ilk istek `page=3&q=...` ile gider (stale closure), ardından `page=1&q=...` gelir. Sıralı dönüş garanti olmadığından ekranda "Sayfa 3 / 1" gibi tutarsız bir durum kalabilir. Ayrıca sıralama değiştirildiğinde, kullanıcı henüz Filtrele'ye basmadığı halde yazılı `q` uygulanıyor.
- **Profesyonel öneri:** Filtre durumu URL'ye taşınmalı (`useSearchParams` + `router.replace`), tek bir `useEffect` URL'ye bağlanmalı ve önceki istekler `AbortController` ile iptal edilmeli. Arama 300 ms debounce'lu canlı arama olmalı (Filtrele düğmesi kaldırılır) veya en azından `<form onSubmit>` ile Enter desteklenmeli. Bu sayede link paylaşımı ve geri tuşu da çalışır.

### 5. Freeze tek tıkla, gerekçesiz ve izsiz
- **Önem:** orta · **Kategori:** UX / denetlenebilirlik · **Efor:** S
- **Kanıt:** `page.tsx:110-112` (onay yok), `route.ts:86-91` (AuditLog yazılmıyor); `AuditLog` modeli `prisma/schema.prisma:1106-1125`.
- **Sorun:** Destructive renkli düğme her satırda duruyor ve yanlış tık doğrudan uygulanıyor. Kim, ne zaman, neden dondurduğu kayıt altına alınmıyor. Klan sahibine bildirim de gitmiyor.
- **Profesyonel öneri:** `AlertDialog` (mevcut: `components/ui/alert-dialog.tsx`) içinde dondurmanın etkileri listelenmeli, zorunlu bir "gerekçe" alanı ve "klan sahibine bildir" seçeneği olmalı. Sunucuda `prisma.$transaction` içinde `squad.update` + `auditLog.create({ action: 'SQUAD_FREEZE', entity: 'Squad', entityId, oldData, newData: { reason } })` birlikte yazılmalı. Klan detayında "Moderasyon geçmişi" sekmesi gösterilmeli. Dondurma isteğe bağlı bir süreyle yapılabilmeli (`frozenUntil`); açılışı mevcut günlük cron (`app/api/cron/daily/route.ts`) yapar.

### 6. CSV yalnızca görünen sayfayı aktarıyor ve Excel'de Türkçe karakterleri bozar
- **Önem:** orta · **Kategori:** veri doğruluğu · **Efor:** S
- **Kanıt:** `page.tsx:56` (`data?.squads`, en fazla 20 satır), `page.tsx:64` (BOM yok).
- **Sorun:** "CSV" adlı düğme operatöre tam veri setini aldığını düşündürüyor. Raporlamada yanlış sonuçlara yol açar.
- **Profesyonel öneri:** Sunucu tarafında `GET /api/admin/squads/export?q=&sort=&status=` ucu yazılmalı. Bu uç, aynı filtreyle akışlı (streaming) CSV döndürmeli ve `﻿` BOM eklemeli. Sütunlar şunlar olmalı: ad, sahip e-postası, üye sayısı, totalPoints, treasuryPoints, haftalık hedef/ilerleme, isFrozen, createdAt, son savaş. Düğme metni "Filtrelenmiş sonuçları dışa aktar (N klan)" olmalı.

### 7. API sözleşmesi zayıf: `any` where/orderBy, doğrulanmamış parametreler, aşırı veri
- **Önem:** orta · **Kategori:** mimari / performans · **Efor:** S
- **Kanıt:**
  - `route.ts:21,32`: `any` tipli where/orderBy.
  - `route.ts:14-15`: `parseInt` ile alınan parametreler sınırsız ve NaN'a açık.
  - `route.ts:43`: tüm üyeler ve `points` sınırsız çekiliyor.
  - `route.ts:64`: string ve number karışık dönüyor.
  - `route.ts:70`: sonuç yokken `totalPages` 0.
- **Sorun:** `?page=abc` 500 döndürüyor. `?pageSize=100000` tüm klanları tüm üyeleriyle çekiyor. Üye sayısına tavan olmadığı için (`join/route.ts:61-87`) tek bir büyük klan liste yanıtını şişirebilir.
- **Profesyonel öneri:** Parametreler zod şemasıyla doğrulanmalı (`page ≥ 1`, `pageSize ∈ [10, 100]`, `sort` enum). Tipler `Prisma.SquadWhereInput` / `Prisma.SquadOrderByWithRelationInput` olmalı. Liste yanıtında üyeler yerine `_count: { select: { members: true } }` ile ilk 5 üyenin avatarı dönmeli; tüm üyeler detay ucunda (`GET /api/admin/squads/[id]`) sayfalı verilmeli. `avgMembersPerSquad` number olarak dönmeli, `totalPages` en az 1 olmalı.

### 8. Kardeş sayfa `/admin/squads/battles` yetim; savaş oluşturma formu yalnızca ilk 20 klanı listeliyor
- **Önem:** orta · **Kategori:** bilgi mimarisi / hata · **Efor:** M
- **Kanıt:**
  - `components/dashboard/sidebar.tsx:176`: yalnızca `/admin/squads` var.
  - `page.tsx` içinde battles linki yok.
  - Battles sayfası klanları parametresiz çekiyor (`app/admin/squads/battles/page.tsx:46`), API varsayılanı 20 (`route.ts:15`).
- **Sorun:** Operatör klan savaşlarını yönetecek ekranı bulamıyor. Bulsa bile 21. ve sonraki klanlar savaş oluşturma açılır listesinde görünmüyor. Ayrıca iki sayfa farklı toast sarmalayıcıları (`lib/admin-toast` / doğrudan `sonner`) ve farklı i18n yaklaşımları kullanıyor.
- **Profesyonel öneri:** İki sayfa tek "Klan Merkezi" altında sekmeler olarak birleştirilmeli (bkz. yeniden tasarım). Savaş formundaki klan seçici, `q` parametresiyle sunucu tarafı aranan bir `Combobox`'a dönüştürülmeli; dondurulmuş klanlar seçilemez gösterilmeli.

### 9. Durum görünmezliği: yükleniyor, boş, dondurulmuş
- **Önem:** düşük · **Kategori:** UX / görsel · **Efor:** S
- **Kanıt:** `page.tsx:97-99` (yüklenirken "0"), `page.tsx:104` (boş durum yok), `page.tsx:105-113` (dondurulmuş rozeti yok), `page.tsx:127-128` ("Sayfa 1 / 0").
- **Profesyonel öneri:** Statlarda `Skeleton`, listede satır skeleton'ları; sonuç yoksa `EmptyState` ve "Filtreleri temizle" düğmesi olmalı. Dondurulmuş satırda `Badge variant="secondary"` + kilit ikonu + "dondurulma tarihi · gerekçe" tooltip'i gösterilmeli. Stat etiketleri "Platform geneli" olarak işaretlenmeli veya filtreye duyarlı yapılmalı.

### 10. Dil karışıklığı ve i18n eksikliği
- **Önem:** düşük · **Kategori:** tutarlılık · **Efor:** S
- **Kanıt:** `page.tsx:76` ("Klan / Squad Yönetimi"), `:107` ("Owner"), `:111` ("Soft Freeze", "Freeze Kaldır"), `:57` (İngilizce CSV başlıkları); `lib/admin-toast.ts:17` ("Basarili"). Sidebar etiketi ise i18n'den "Klan Yönetimi" (`messages/tr.json:2480`).
- **Profesyonel öneri:** Ürün dilinde tek bir terim seçilmeli ("Klan"), metinler `useAppT` ile `adminSquads.*` anahtarlarına taşınmalı (battles sayfası bunu zaten yapıyor), `admin-toast` önekleri Türkçe karakterle düzeltilmeli.

### 11. Erişilebilirlik
- **Önem:** düşük · **Kategori:** a11y · **Efor:** S
- **Kanıt:** `page.tsx:82-92` (etiketsiz input/select), `page.tsx:110` (bağlamsız tekrarlayan düğmeler), yükleme için `aria-live` yok.
- **Profesyonel öneri:** Görünür veya `sr-only` `<Label>`'lar eklenmeli. Düğmeye `aria-label={\`${s.name} klanını dondur\`}` verilmeli. Liste bir `<Table>` (`components/ui/table.tsx`) olarak `<caption>` ile kurulmalı, sonuç sayısı `aria-live="polite"` ile duyurulmalı. Native `<select>` shadcn `Select` ile değiştirilerek diğer admin sayfalarıyla tutarlı hale getirilmeli.

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog)

1. **Klan detay paneli (Sheet/drawer):** sahip, üyeler (sayfalı, katılma tarihi, kişisel puan, kullanıcı detayına link), totalPoints, treasuryPoints, haftalık hedef/ilerleme, savaş geçmişi ve W/L oranı, moderasyon geçmişi (AuditLog). Stripe'ın müşteri detay drawer'ı gibi listeden çıkmadan açılmalı.
2. **Moderasyon eylem seti:** uygunsuz adı yeniden adlandırma, davet kodunu yenileme (sızmış kodlar için), üye çıkarma, sahipliği devretme, klanı silme (escrow ve aktif savaş iadesiyle), süreli dondurma.
3. **Sağlık ve kötüye kullanım sinyalleri:** "son 7 günde puan artışı", "tek kaynaklı puan yoğunluğu", "aynı IP/cihazdan üyeler" gibi sütunlar ve bunlara göre sıralama. `/admin/fraud-prevention` ile çapraz link.
4. **Gelişmiş filtreler ve kaydedilmiş görünümler:** durum (aktif/dondurulmuş/savaşta), üye aralığı, puan aralığı, oluşturulma tarihi; Linear tarzı filtre çipleri, URL'de kalıcı.
5. **Toplu işlemler:** çoklu seçimle dondurma/çözme, CSV export.
6. **Trend metrikleri:** haftalık yeni klan, aktif klan oranı (son 7 günde puan alan), ortalama üye dağılımı (histogram). PostHog tarzı küçük sparkline'lar.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör tek ekranda klan ekosisteminin sağlığını görür, şüpheli bir klanı iki tıkta bulur, detayını listeden ayrılmadan inceler ve gerekçeli, denetlenebilir, *gerçekten uygulanan* bir moderasyon aksiyonu alır.

**Yerleşim: "Klan Merkezi" (`/admin/squads`, sekmeli):**
- **Üst şerit (KPI):** Toplam klan · Aktif klan (7g) · Dondurulmuş · Aktif savaş · Bekleyen meydan okuma · Haftalık hedefe ulaşan klan oranı. Her kart tıklanınca ilgili filtreyi uygular. Mevcut `components/admin/admin-progress-stat-card.tsx` yeniden kullanılır.
- **Sekmeler:** `Klanlar` | `Savaşlar` (bugünkü `/admin/squads/battles` içeriği taşınır, eski rota buraya yönlendirilir) | `Moderasyon günlüğü` (AuditLog, entity='Squad').
- **Klanlar sekmesi:**
  - Üstte filtre çipleri ve debounce'lu arama.
  - `Table` sütunları: Ad + durum rozeti · Sahip · Üye (avatar yığını + sayı) · Puan · Hazine · Haftalık ilerleme (mini progress) · Son aktivite · Satır menüsü (⋯).
  - Satıra tıklayınca sağdan `Sheet` ile detay paneli açılır.
  - Mobilde tablo, kart listesine dönüşür. Detay paneli tam ekran sheet olur.
- **Aksiyonlar:** Satır menüsü ve detay panelinde, hepsi `AlertDialog` ile etkileri ve gerekçe alanını gösterir. Sonuç toast'ı "Geri al" eylemi taşır (5 sn).

**Motion / 3D:** Bu bir operasyon ekranı; 3D yerinde değil. framer-motion (`m as Motion`) yalnızca ölçülü kullanılmalı:
- Sheet giriş/çıkışı,
- tablo satırı güncellendiğinde (dondurma sonrası) 300 ms renk vurgusu,
- KPI sayılarında kısa sayım animasyonu.

Hepsi `useReducedMotion` ile kapatılabilir olmalı. Liste stagger'ı veya dekoratif efekt önerilmez.

**Veri / API değişiklikleri:**
- `GET /api/admin/squads`:
  - zod doğrulamalı parametreler: `q, page, pageSize ≤ 100, sort ∈ {newest, oldest, members, points, treasury, activity}, status`,
  - yanıtta `_count.members` ve ilk 5 üye,
  - `totalPoints`, `treasuryPoints`, `weeklyTeamProgress/Target`, `isFrozen`, `createdAt`,
  - filtreye duyarlı statlar.
- `GET /api/admin/squads/[id]`: detay, sayfalı üyeler, son 20 savaş, AuditLog kayıtları.
- `POST /api/admin/squads/[id]/actions`:
  - discriminated union: `freeze{reason, until?, cancelActiveBattle}`, `unfreeze{reason}`, `rename{name}`, `regenerateInvite`, `removeMember{userId}`, `transferOwner{userId}`, `delete{reason}`,
  - her biri transaction içinde AuditLog yazar, gerekirse bildirim gönderir,
  - savaş iptalinde escrow iadesi mevcut `rewardRefunded` guard'ıyla yapılır.
- `GET /api/admin/squads/export`: akışlı, BOM'lu CSV.
- **Şema:** `Squad` modeline `frozenAt DateTime?`, `frozenReason String?`, `frozenUntil DateTime?` alanları eklenir. `Settings.admin_frozen_squads` okumaları kaldırılır.
- **Uygulama katmanı:** `lib/squad-guard.ts → assertSquadActive()` katılma/oluşturma/meydan okuma/kabul/admin-savaş noktalarında çağrılır. Klan puanı yazan üç noktada (`addToSquadTreasury`, `addToActiveBattleScore`, dealer pasif puan klan payı) dondurulmuş klan için klan katkısı atlanır.
- **Güvenlik:** `requireAuth` içine ADMIN için gate cookie kontrolü eklenir (Bulgu 2).

---

## Çakışmalar / birleştirme önerisi

- **`/admin/squads/battles`:** Aynı alanın (klanlar) ikinci yarısı. Sidebar'da yok, bu sayfadan linklenmemiş, klan listesini bu sayfanın sayfalı API'sinden 20 kayıtla çekiyor. **Birleştirilmeli:** "Klan Merkezi" içinde `Savaşlar` sekmesi olmalı, eski rota yönlendirilmeli.
- **`/admin/modules` (overview):** `squads` modülünün açık/kapalı durumunu ve sayısını gösteriyor (`app/api/admin/modules/overview/route.ts:34,62-65`). Klan Merkezi'nin başlığında modül durumu ("Squads modülü: Açık") ve modül ayarına bir link gösterilmeli. Ayrı sayfa olarak kalması mantıklı, birleştirme gerekmez.
- **`/admin/fraud-prevention`:** Klan kaynaklı puan anomalileri için çapraz bağlantı kurulmalı (klan detay panelinden "bu klanın üyelerini fraud ekranında aç"). Birleştirme gerekmez.
- **`/admin/ekip`:** İsim benzerliği var ("Ekip"), ama iç personel modülü; müşteri klanlarıyla ilgisi yok. Sidebar'da `Users2` ikonu her ikisinde de kullanılıyor (`sidebar.tsx:176,198`), görsel karışıklık yaratıyor. Klan için farklı bir ikon (ör. `Shield`/`Swords`) seçilmeli.

---

## Doğrulama (şüpheci inceleme)

### 1. Klan dondurma (Soft Freeze) yaptırımsız: admin ile müşteri akışı farklı kaynaklara bakıyor — **DOĞRULANDI**

- Yazma tarafı: `app/api/admin/squads/route.ts:86-90` yalnızca `Squad.isFrozen` alanını günceller (şema: `prisma/schema.prisma:411`).
- Okuma tarafı: `app/api/customer/squads/join/route.ts:11,48-60` ve `app/api/customer/squads/route.ts:11,44-66` `Settings` tablosundaki `admin_frozen_squads` anahtarını okur. Repoda (`node_modules`, `.next`, üretilmiş istemci ve audit dokümanları hariç) bu anahtara yazan hiçbir kod yok; genel `PUT /api/admin/settings` teorik olarak keyfi anahtar yazabilir ama bunu yapan bir UI/akış yok. Sonuç: bu iki kontrol pratikte her zaman boş listeyle çalışır.
- `isFrozen`'ı okuyan TEK yer `app/api/customer/squads/challenge/route.ts:69,77` ve o da yalnızca HEDEF klanı kontrol eder; meydan okuyan klan (`mySquad`, satır 51-54) `isFrozen` seçmez.
- `app/api/customer/squads/battles/[id]/respond/route.ts`, `app/api/admin/squads/battles/route.ts:41-50`, `app/api/cron/squad-battles/route.ts` içinde `isFrozen`/`frozen` geçmiyor (grep ile doğrulandı).
- Puan akışı: `app/api/dealer/consumptions/route.ts:328-340` (pasif puan klan `totalPoints`'e), `lib/gamification-engine.ts:143-160` (`addToSquadTreasury`) ve `:173-212` (`addToActiveBattleScore`) dondurma kontrolü yapmaz; çağıran `app/api/feedbacks/route.ts:300,327,329` da yapmaz.

**Yeniden üretim:** Admin `/admin/squads`'ta X klanında "Soft Freeze"e basar → `toast.success('Squad donduruldu')` (`app/admin/squads/page.tsx:51`), `Squad.isFrozen=true`. Ardından (a) bir müşteri X'in davet koduyla `POST /api/customer/squads/join` çağırır → `admin_frozen_squads` satırı olmadığından 200 ile katılır; (b) X'in sahibi `POST /api/customer/squads/challenge` ile Y klanına meydan okur → yalnız Y kontrol edildiği için savaş oluşur; (c) X üyeleri işletmede tüketim yapar / geri bildirim bırakır → `totalPoints`, `treasuryPoints` ve aktif savaş skoru artmaya devam eder. Yani dondurmanın tek etkisi "başkaları X'e meydan okuyamaz" olur; operatör ise klanın durdurulduğunu sanır.

**Not:** Raporun önerdiği tek kaynak (`Squad.isFrozen` + `lib/squad-guard.ts`) ve `Settings.admin_frozen_squads` okumalarının kaldırılması doğru yön. Ek olarak meydan okuyan tarafın ve `respond` uç noktasında her iki klanın kontrol edilmesi gerekir.

### 2. Admin gizli kapı (gate cookie) /api/admin/* uçlarında uygulanmıyor — **DOĞRULANDI**

- `proxy.ts:104-118`: `/api/` ile başlayan her istek `authMiddleware`'e hiç girmeden yalnız güvenlik/CORS başlıklarıyla `NextResponse.next()` alır. Gate kontrolü (`proxy.ts:76-88`) sadece `/admin` sayfa yollarında çalışır.
- `lib/api-auth.ts:52-80` `requireAuth` yalnızca oturum + rol + token-replay kontrolü yapar; `admin_gate` cookie'sine bakmaz. `app/` ve `lib/` altında `gateCookieBelongsTo`/`verifyGateCookie` çağıran başka bir API yolu yok (grep: yalnız `proxy.ts:81-82` ve `app/api/admin/gate/route.ts:68` cookie'yi set eder).
- `app/api/admin/squads/route.ts:82-83` PATCH yalnız `requireAuth(['ADMIN'])` kullanır.

**Yeniden üretim:** Rolü ADMIN olan ama gate cevabını bilmeyen bir kullanıcı (proxy.ts:76-77 yorumundaki "rolü kazara ADMIN yapılan stajyer" senaryosu) giriş yapar. `/admin/squads` sayfası onu `/admin-gate`'e yönlendirir; ancak aynı tarayıcıdan `fetch('/api/admin/squads', {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({squadId:'<id>', action:'freeze'})})` çağrısı 200 döner ve klan dondurulur. Aynı durum `GET /api/admin/squads` (tüm klan sahiplerinin e-posta/puan verisi) ve diğer tüm `/api/admin/*` uçları için geçerlidir.

**Ek gözlem (doğrulandı):** Sayfa tarafındaki kontrol de kriptografik değildir: `lib/admin-gate-edge.ts:14-22` `gateCookieBelongsTo` HMAC'i doğrulamaz, yalnız `"<kendi userId>.<64 hex>"` biçimine bakar. ADMIN rollü kullanıcı kendi userId'sini bildiği için `admin_gate=<userId>.<herhangi 64 hex>` cookie'sini elle koyarak sayfa kapısını da geçebilir. Dolayısıyla düzeltme yalnız `requireAuth`'a biçim kontrolü eklemek değil; Node runtime'daki API katmanında `verifyGateCookie` (HMAC + güncel cevap, `lib/admin-gate.ts:54-61`) ile gerçek doğrulama yapmak olmalı; proxy'de ise Web Crypto (`crypto.subtle`, edge'de async HMAC mümkün) ile aynı doğrulama yapılmalı. `/api/admin/gate` kendisi bu kontrolden muaf tutulmalı (aksi halde döngü).


---

## Uygulama (Dalga 2)

`/admin/squads` yeniden inşa edildi: **Klan Merkezi** (sekmeler: Klanlar | Savaşlar | Moderasyon günlüğü). Sunucu bileşeni KPI ile etkin sekmenin ilk sayfasını paralel çeker (`app/admin/squads/page.tsx`), istemci adası `components/admin/a-klanlar/**`. Sunucu mantığı `lib/admin-squads/{contract,server,actions.server}.ts`; tüm uçlar `defineRoute` (ADMIN + zod + rate limit). `/admin/squads/battles` → `?tab=battles` kalıcı yönlendirme (sorgu korunur). Test: `__tests__/admin/a-klanlar/squads-server.test.ts` (15/15).

Yeni / yeniden yazılan uçlar: `GET /api/admin/squads` (liste), `/stats`, `/options`, `/export`, `/audit`, `GET /api/admin/squads/[id]`, `POST /api/admin/squads/[id]/actions`. Eski `PATCH /api/admin/squads` kaldırıldı.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Sayfa erişimi | ÇALIŞIYOR (proxy + sunucu bileşeninde DB'den `requireAuth(['ADMIN'])`) |
| 2 | API yetkisi | ÇALIŞIYOR — `defineRoute` (rol + zod + rate limit). Gizli kapının API katmanı sistem geneli konu (Bulgu 2), bu yüzeyin dışında |
| 3 | Başlık | ÇALIŞIYOR — QDL `PageHeader` "Klan Merkezi", tek terim "Klan" |
| 4 | CSV | ÇALIŞIYOR — sunucu ucu, filtrenin tamamı (≤10.000), BOM, Türkçe başlıklar, formül enjeksiyonu nötr, denetime yazılır |
| 5 | Yenile + yükleniyor | ÇALIŞIYOR — react-query; hata görünür (ErrorState/QueryState + Tekrar dene), kilitlenme yok |
| 6 | Arama | ÇALIŞIYOR — FilterBar, debounce'lu canlı arama, URL'de |
| 7 | Sıralama | ÇALIŞIYOR — kuruluş, üye, klan puanı, klan gücü, ad (sunucu, kararlı) |
| 8 | "Filtrele" düğmesi | KALDIRILDI — canlı arama + URL durumu; yarış, iptal sinyalli tek sorguyla kapandı |
| 9-11 | Statlar | ÇALIŞIYOR — 8 KPI (klan, aktif 7g, dondurulmuş, canlı savaş, süresi dolan, escrow, ödenen/iade 7g); yüklenirken iskelet, sayı tipi tutarlı |
| 12 | Klan adı | ÇALIŞIYOR — slogan da gösterilir |
| 13 | Lider + davet kodu | ÇALIŞIYOR — liderden Kullanıcı 360'a link; kod kopyalanabilir (detay) |
| 14 | Üye listesi | ÇALIŞIYOR — detay panelinde katılma tarihi/puan, 360 linki, çıkar / lider yap |
| 15 | Dondur / Çöz | ÇALIŞIYOR — tek kaynak `Squad.isFrozen`; müşteri katılma/meydan okuma/kabul/hedef ödülü bu kolonu okuyor (lib/squads), klan gücü payı artık dondurulmuşta birikmiyor, açık savaşlar iadeli iptal ediliyor |
| 16 | Dondurulmuş göstergesi | ÇALIŞIYOR — durum rozeti + filtre + KPI + detayda tarih/gerekçe/kim |
| 17 | Onay + gerekçe | ÇALIŞIYOR — etkiler madde madde, zorunlu gerekçe |
| 18 | Audit log | ÇALIŞIYOR — her aksiyon transaction içinde AuditLog; detayda "Moderasyon geçmişi", ayrı sekmede günlük |
| 19-20 | Sayfalama + gösterge | ÇALIŞIYOR — DataTable sunucu sayfalama, sayfa boyutu seçimi, "1 / 0" yok |
| 21-23 | Yükleniyor / boş / hata | ÇALIŞIYOR — iskelet, filtreli/ilk-kullanım boş durumu, görünür hata |
| 24 | Toast | ÇALIŞIYOR — sunucu sonucuna göre (no-op, iptal edilen savaş sayısı) |
| 25 | Mobil | ÇALIŞIYOR — tablo kart düzenine geçer, detay alttan tam genişlik sheet, ≥44px hedefler |
| 26 | Etiket / aria | ÇALIŞIYOR — FilterBar etiketli, üye düğmeleri bağlamlı `aria-label`, sonuç sayısı `aria-live` |
| 27 | i18n / dil | ÇALIŞIYOR (Türkçe, tam karakter; "Owner/Soft Freeze/Squad" kalktı). Ayrı `adminSquads.*` anahtarlarına taşınmadı: diğer Dalga 2 admin ekranlarıyla aynı düzen |
| 28 | Savaşlara geçiş | ÇALIŞIYOR — "Savaşlar" sekmesi; klan detayından klanın savaşlarına derin link |
| 29 | Klan detayı | ÇALIŞIYOR — puan, güç, sicil (G/M/B/iptal), son 20 savaş, kuruluş. Haftalık ilerleme gösterilmedi: `weeklyTeamProgress` müşteri tarafında hesaplanan hedefle değişti, eski alan yanıltıcı olurdu |
| 30 | Moderasyon aksiyonları | ÇALIŞIYOR — yeniden adlandır, sloganı kaldır, davet kodu yenile, üye çıkar, liderlik devri. **Klan silme KALDIRILDI** (cascade silme yasak; dondurma = arşiv) |
| 31 | URL durumu | ÇALIŞIYOR — q/status/sort/page/size/tab/squad |
| 32 | Durum filtresi | ÇALIŞIYOR — etkin / dondurulmuş / savaşta |
| 33-34 | Parametre doğrulama | ÇALIŞIYOR — zod (`.catch` ile NaN → 1, boyut 10–100, sort izin listesi), 404/409/400 kodlu |

### Kapanan bulgular
1 (dondurma etkisiz — tek kaynak + yaptırım + savaş iadesi), 3 (hata yönetimi), 4 (yarış/Enter), 5 (onay/gerekçe/iz + lider bildirimi), 6 (CSV), 7 (API sözleşmesi, `any` yok, üyeler listede çekilmiyor), 8 (yetim savaş sayfası + 20 klan sınırı → aranabilir seçici `/options`), 9 (durum görünürlüğü), 10 (dil), 11 (erişilebilirlik). Eksik özelliklerden 1 (detay paneli), 2 (moderasyon seti, silme hariç), 4 (filtreler, URL'de), 6'nın bir kısmı (7 günlük aktif klan, yeni klan) uygulandı.

### Kalanlar
- **Bulgu 2 (gizli kapı API katmanı):** sistem geneli `requireAuth`/proxy işi; bu yüzeyin sahipliğinde değil.
- **Tüketim puanının klan toplamı (`totalPoints`)** dondurulmuş klanda hâlâ artıyor: yazım `lib/consumption/service.ts` (tüketim yüzeyi), geri alma `lib/dealer/kasa/server.ts`; tek taraflı değişiklik geri almada asimetri yaratırdı. Klan gücü (hazine) ve savaş skoru dondurmada duruyor.
- **Süreli dondurma (`frozenUntil`)** ve dondurma meta alanları: ŞEMA İSTEĞİ (`Squad.frozenAt/frozenReason/frozenUntil`). Şimdilik zaman/gerekçe AuditLog'dan okunuyor.
- Toplu dondurma ve kötüye kullanım sinyali sütunları (tek kaynaklı puan yoğunluğu, aynı cihaz) uygulanmadı: güvenilir sinyal kaynağı fraud yüzeyinde; sahte sütun yazılmadı.
