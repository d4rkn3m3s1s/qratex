# /admin/games

**Amaç:** Platform operatörünün mini oyun registry'sini (`lib/minigame-config.ts` → `MINI_GAMES`, 19 oyun) yönettiği panel. Her oyunu açıp kapatır; ödül puanı/XP, ödül eşiği, maks. skor, min. süre ve görsel kimliği (başlık, açıklama, emoji, renk) `MiniGameConfig` override satırıyla ezer. Bugün ve son 30 gün için oynanma ve dağıtılan puan istatistiklerini gösterir.

**Genel puan: 5/10** · **Karar: koru-iyileştir** (veri modeli ve sunucu tarafı ödül hesabı sağlam. Ancak override'ların yarısı oyun ekranına hiç ulaşmıyor ve bir durum bayatlığı hatası kapatılan oyunu sessizce yeniden açabiliyor. Bu ikisi düzeltilmeden panel "yönetiyormuş gibi" davranıyor.)

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Aç/kapat ve ödül puanı/XP gerçekten etkili. Eşik, maks. skor ve görsel override'lar ise oyun bileşenlerine ulaşmıyor (istemci statik `DEF` okuyor). Kapatılan oyunu geri açan bir bayat durum hatası var. Pacman paneli tümüyle kapsam dışında. |
| UX | 5/10 | Kart başına satır içi düzenleme anlaşılır. Ama 19 kartlık tek uzun ızgarada arama, filtre ve sıralama yok. "Varsayılana sıfırla" düğmesi yok, değişikliğin ekonomiye etkisi gösterilmiyor ve kaydetmeden önce onay alınmıyor. |
| Görsel | 6/10 | Accent kenarlığı ve pasif kartın gri tonu kimliği iyi taşıyor. Ancak `p-6` çift dolgu oluşturuyor, başlık hiyerarşisi diğer admin sayfalarıyla tutarsız ve "özelleştirilmiş" rozeti yanlış bilgi verebiliyor. |
| Mimari | 5/10 | Effective birleştirme mantığı iki yerde kopyalanmış (route ve lib). Sayfa tamamen client'ta, `useEffect` ile veri çekiyor. Audit kaydına `oldData` yazılmıyor. `revalidateTag(...,'max')` anında yürürlük sağlamıyor (SWR). |
| Performans | 7/10 | GET tek seferde 4 paralel sorgu atıyor ve N+1 yok. Her toggle sonrasında 3 `groupBy` ile tüm liste yeniden çekiliyor ve istatistikler cache'lenmiyor. Kabul edilebilir düzeyde. |
| Erişilebilirlik + Mobil | 4/10 | `Label`–`Input` bağı yok. `Switch`'in erişilebilir adı yok. Pasif kartlarda %72 opaklık kontrastı düşürüyor. Mobilde çift yatay dolgu ve 19 uzun kart var. Azaltılmış hareket global `MotionConfig` ile karşılanıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Erişim kontrolü (sayfa) | ÇALIŞIYOR | `proxy.ts:51,79-84` (ADMIN rolü + gizli kapı cookie'si) | Sayfa ADMIN rolü ve gate cookie'si ister. |
| 2 | Erişim kontrolü (API) | ÇALIŞIYOR | `app/api/admin/games/route.ts:27-28,149-150` `requireAuth(['ADMIN'])` | Token-replay kontrolü dahil (`lib/api-auth.ts:64-77`). |
| 3 | PATCH hız sınırı | KISMİ | `route.ts:152-158`, `lib/rate-limit.ts:303-318` | Sayaç bellek içi ve instance başına tutuluyor. Serverless ortamda dağıtık değil. |
| 4 | İlk yükleme spinner'ı | ÇALIŞIYOR | `page.tsx:178-184` | İskelet yok, yalnızca dönen ikon gösteriliyor. |
| 5 | Yükleme hatası durumu | BOZUK | `page.tsx:99-104,186-204` | Hata yalnızca toast olarak çıkıyor. Ekranda "0/0 oyun aktif" yazısı ve boş ızgara kalıyor. Yeniden dene düğmesi yok. |
| 6 | Boş durum | EKSİK | `page.tsx:204-316` | `games=[]` olduğunda hiçbir açıklama gösterilmiyor. |
| 7 | Başlık + "x/y oyun aktif" sayacı | ÇALIŞIYOR | `page.tsx:186,196-199` | Sayaç doğru. Pacman sayılmıyor (bkz. #29). |
| 8 | Oyun kartı (accent kenarlık, pasifte gri) | KISMİ | `page.tsx:217-228` | `${accent}55` 6 haneli hex varsayıyor. `#fff` gibi kısa ya da geçersiz renkte kenarlık sessizce kayboluyor. |
| 9 | Kart giriş animasyonu (stagger) | ÇALIŞIYOR | `page.tsx:211-216`; `components/providers.tsx:232` `reducedMotion="user"` | Ölçülü. Azaltılmış hareket tercihine uyuyor. |
| 10 | gameType mono etiketi | ÇALIŞIYOR | `page.tsx:232` | |
| 11 | "özelleştirilmiş" rozeti | BOZUK | `page.tsx:209,236-239` | Override satırı var olduğu sürece görünüyor. Oyunu bir kez kapatıp açmak tüm alanları null olan bir satır bırakıyor ve rozet kalıcı olarak yanlış bilgi veriyor. |
| 12 | Aktif/pasif anahtarı (anında kaydet) | KISMİ | `page.tsx:122-139,241-245`; `route.ts:196-200` | Kayıt çalışıyor. Ancak hub ve start'a yansıması gecikebilir (bkz. B3). Erişilebilir adı yok. Düzenleme modundayken bayat durum hatası var (B2). |
| 13 | İstatistik: "Bugün" | KISMİ | `route.ts:30,35-39` | Yalnızca `status:'completed'`, yani kazanılan oyunları sayıyor. Gün UTC'ye göre hesaplanıyor, TR saatiyle 00:00-03:00 arası önceki güne yazılıyor. |
| 14 | İstatistik: "30g oynanma" | KISMİ (yanıltıcı) | `route.ts:40-44`; `complete/route.ts:101` | Kaybedilen oyunlar `failed` olarak yazılıyor ve sayılmıyor. Etiket "oynanma" diyor ama sayılan şey "kazanma". |
| 15 | İstatistik: "30g puan" | ÇALIŞIYOR | `route.ts:45-50,107` | `_sum.rewardPoints` doğru. Streak XP dahil değil, bu beklenen davranış. |
| 16 | `rewarded30d` (ödüllenen oturum sayısı) | SAHTE/ÖLÜ | `route.ts:106`; `page.tsx:53` | API hesaplayıp döndürüyor ama UI hiç göstermiyor. |
| 17 | Effective özet hapları (ödül, eşik, min. süre) | ÇALIŞIYOR | `page.tsx:259-265` | Gösterilen değerler sunucunun ödül hesabıyla tutarlı. |
| 18 | Düzenle / Vazgeç | ÇALIŞIYOR | `page.tsx:112-119,301-308` | Başka bir kartta "Düzenle"ye basmak kaydedilmemiş değişiklikleri uyarısız siliyor. |
| 19 | Form: Başlık override | KISMİ | `page.tsx:274`; hub `games-hub.tsx:55-60`; oyun `bot-hunter-game.tsx:188` | Yalnızca hub kartında görünüyor. Oyun ekranı ve sonuç başlığı statik `DEF.title` kullanıyor. Tamamlama bildirimi effective başlığı kullanıyor (`complete/route.ts`). |
| 20 | Form: Emoji override | KISMİ | `page.tsx:275`; `route.ts:133-136` | Yalnızca hub'da görünüyor. Uzunluk sınırı 400 karakter, tek grafem doğrulaması yok. |
| 21 | Form: Açıklama override | KISMİ | `page.tsx:277` | Yalnızca hub'da görünüyor. Oyun ekranındaki açıklama `DEF`'ten okunuyor. |
| 22 | Form: Renk (hex) override | KISMİ | `page.tsx:279`; `route.ts:133-136`; `bot-hunter-game.tsx:191,211…` | Hex doğrulaması yok. Oyun ekranı ve `GameShell` `DEF.accent` kullanıyor, override yalnızca hub'a ulaşıyor. |
| 23 | Form: Ödül puanı | ÇALIŞIYOR | `page.tsx:280`; `minigame-config-effective.ts:107-116` | Sunucu ödülü effective değerden veriyor. Üst sınır 1.000.000 ve onay adımı yok (B4). |
| 24 | Form: Ödül XP | ÇALIŞIYOR | `page.tsx:283` | Ödül puanıyla aynı risk. |
| 25 | Form: Maks. skor | BOZUK (yarı etkili) | `page.tsx:284`; `complete/route.ts:17,61`; `bot-hunter-game.tsx:152` | Sunucu bu değere göre kırpıyor. İstemci ise oyunu `DEF.maxScore`'da bitiriyor, dolayısıyla maks. skoru yükseltmek oynanışta etkisiz. 10.000 üstü değerler zod tarafından reddediliyor. |
| 26 | Form: Ödül eşiği | BOZUK | `page.tsx:287`; `bot-hunter-game.tsx:95`; `complete/route.ts:86,101` | İstemci `won`'u `DEF.rewardThreshold`'a göre hesaplıyor. Eşik düşürülürse yeni eşiği geçen oyuncu `won:false` gönderiyor ve ödül almıyor. Eşik yükseltilirse "Kazandın" ekranı çıkıyor ama ödül 0 geliyor ve "Ödül için X gerekiyordu" metni eski eşiği gösteriyor (`game-shell.tsx:292`). |
| 27 | Form: Min. süre | ÇALIŞIYOR | `page.tsx:288`; `complete/route.ts` `tooFast` | `0` değeri bot süre korumasını tamamen kapatıyor ve bunun için bir uyarı yok. |
| 28 | Kaydet (tam PATCH) | KISMİ | `page.tsx:141-176`; `route.ts:147-229` | Upsert, audit ve revalidate çalışıyor. Bayat `enabled` gönderiyor (B2). Zod hataları İngilizce ve alan adı içermiyor. |
| 29 | Pacman ("Yıldız Avı") yönetimi | EKSİK | `games-hub.tsx:26-31`; `pacman/complete/route.ts:8,14,64` | Pacman registry dışında kalıyor. Panelden kapatılamıyor, ödülü değiştirilemiyor ve istatistiği görünmüyor. |
| 30 | Eşik ≤ maks. skor tutarlılık kontrolü | KISMİ | `route.ts:177-187` | Gönderilmeyen alan mevcut override yerine registry varsayılanıyla karşılaştırılıyor. UI her iki alanı da gönderdiği için UI'da sorun çıkmıyor, ama API'ye kısmi PATCH atıldığında yanlış kabul ya da yanlış red üretebiliyor. |
| 31 | Audit kaydı | KISMİ | `route.ts:202-212` | Yalnızca `newData` yazılıyor, `oldData` yok, yani "neden-neyden-neye" izi tutulmuyor. Sayfada değişiklik geçmişi görünümü yok. |
| 32 | Varsayılana sıfırla | SAHTE/EKSİK | `page.tsx:9` (`RotateCcw` import edilmiş ama kullanılmıyor); `route.ts:62` yorumu "admin 'sıfırla' referansı" | Düğme yok. Override satırını silen bir uç (DELETE) da yok. |
| 33 | Oyunu kapatmanın süren oturumlara etkisi | EKSİK | `complete/route.ts` (`enabled` kontrolü yok), `start/route.ts:34-39` | Kapatmadan önce başlatılan oturum tamamlanınca yine ödül alıyor. |
| 34 | Arama / filtre / sıralama | EKSİK | `page.tsx:204-316` | 19 kart tek ızgarada, registry sırasıyla listeleniyor. |
| 35 | Toplu işlem (hepsini kapat, ödül çarpanı) | EKSİK | — | Bir etkinlikte ya da istismar anında tek tek tıklamak gerekiyor. |
| 36 | Mobil düzen | KISMİ | `page.tsx:189` `p-6` + `app/admin/layout.tsx` dış dolgusu; `page.tsx:196` `text-3xl` | Çift yatay dolgu var. Form `grid-cols-2` 400 px'de dar ama kullanılabilir. |
| 37 | i18n | EKSİK | `page.tsx` tüm metinler sabit Türkçe; kıyas: `app/admin/gamification-settings/page.tsx` `useAppT()` | Kardeş sayfalarla tutarsız. |

**Sayım (37 özellik, her satır tek duruma atanmıştır):** ÇALIŞIYOR 12 · KISMİ 13 · BOZUK 4 · SAHTE 2 (#16, #32) · EKSİK 6

---

## Bulgular

### B1 · KRİTİK · Doğruluk/Ekonomi · Eşik, maks. skor ve görsel override'ları oyun ekranına ulaşmıyor
- **Kanıt:** Tüm oyun bileşenleri statik registry okuyor: `components/customer/games/bot-hunter-game.tsx:13` `const DEF = getMiniGame('bot-hunter')!`, `:95` `endGame(scoreRef.current >= DEF.rewardThreshold …)`, `:152` `>= DEF.maxScore`, `:188-195` `title/accent/rewardThreshold={DEF…}`. Aynı desen `combo-tap`, `data-miner`, `data-snake`, `frost-catcher`, `guardian-of-trust`, `lucky-wheel`, `memory-match` ve diğerlerinde de var. `lib/use-mini-game.ts:70` sunucunun `config`'ini state'e alıyor ama hiçbir oyun `config`'i kullanmıyor (grep sonucu boş). Sunucu ödülü yalnızca `won && !tooFast` ise veriyor (`app/api/customer/games/[game]/complete/route.ts:86`) ve `won` istemciden geliyor.
- **Sorun:** Admin bir oyunun eşiğini 15'ten 10'a indirdiğinde 12 skor yapan oyuncu istemcide "kaybetti" sayılıyor, `won:false` gönderiyor ve sunucu `failed` yazıp ödül vermiyor. Eşik yükseltildiğinde oyuncu "Kazandın!" ekranını görüyor ama ödül 0 geliyor ve `GameShell` "Ödül için 15 skor gerekiyordu" diyerek eski eşiği gösteriyor (`game-shell.tsx:292`). Maks. skoru yükseltmek de etkisiz, çünkü istemci oyunu `DEF.maxScore`'da sonlandırıyor. Kısacası panel ekonomiyi yönettiğini söylüyor ama oyuncu deneyimi ile sunucu kararı birbirinden ayrışıyor. Bu durum güven kaybına ve destek taleplerine yol açar.
- **Öneri:** Effective konfigürasyonu tek gerçek kaynak yapın. `start` cevabı zaten `config` döndürüyor (`start/route.ts:96-102`); bunu `{title, emoji, accent, description, maxScore, rewardThreshold, rewardPoints, rewardXp, minDurationSec}` ile genişletin. `useMiniGame` bunu dışa versin, her oyun bileşeni `DEF` yerine `g.config ?? DEF` okusun; `GameShell` de bu değerleri prop olarak alsın. Bunun yanında sunucu `won`'a güvenmeyi bırakmalı ve `eligible = !tooFast && clampedScore >= game.rewardThreshold` hesaplamalı (oyun mantığına özel bir "can kaldı mı" koşulu gerekiyorsa bu da sunucuya taşınmalı). Panelde de hangi alanın nereye yansıdığını gösteren bir "yansıma haritası" etiketi bulunmalı ("Hub + oyun ekranı + bildirim").
- **Efor:** M

### B2 · YÜKSEK · Doğruluk (yarış/bayat durum) · Düzenleme açıkken anahtarla kapatılan oyun "Kaydet"le sessizce yeniden açılıyor
- **Kanıt:** `page.tsx:114` `setEdit(toEdit(g))` → `toEdit` içinde `enabled: g.effective.enabled` (`:75`). Düzenleme modunda kart üzerindeki `Switch` aktif kalıyor (`:241-245`, yalnızca `busy` iken disabled). `toggleEnabled` `load()` çağırıyor (`:133`) ama `edit` state'i güncellenmiyor. `save` her durumda `enabled: edit.enabled` gönderiyor (`:150`).
- **Senaryo:** "Düzenle" → anahtarla oyunu kapat (PATCH `enabled:false`, başarı toast'ı) → ödül puanını değiştir → "Kaydet" (PATCH `enabled:true`) → oyun tekrar açılıyor. Admin bunu fark etmiyor. Acil bir kill-switch geri alınmış oluyor.
- **Öneri:** Düzenleme formunun PATCH'i yalnızca değişen alanları göndersin (form "dirty" alan takibi yapsın). `enabled` asla form state'inden gönderilmesin. Daha sağlam bir yol da iyimser eşzamanlılık: GET her satır için `updatedAt` döndürür, PATCH bunu `If-Match` benzeri `expectedUpdatedAt` olarak yollar ve sunucu uyuşmazlıkta 409 döner. Böylece iki admin arasındaki "son yazan kazanır" sorunu da kapanır.
- **Efor:** S

### B3 · YÜKSEK · Mimari/Operasyon · "Oyunu kapat" anında yürürlüğe girmiyor; süren oturumlar yine ödül alıyor
- **Kanıt:** `route.ts:217` `revalidateTag(MINIGAME_CONFIG_TAG, 'max')`. Next 16.1.6'da `'max'` profili etiketi bayat olarak işaretliyor ve sonraki isteğe bayat veriyi sunarken arka planda yeniliyor (stale-while-revalidate). Kodun yorumundaki "değişiklik hemen yürürlüğe girer" iddiası bu semantikle çelişiyor (canlıda ölçülmedi, Next belge semantiğinden çıkarım). Önbellek `revalidate: 60` (`lib/minigame-config-effective.ts:84`). `complete` route'u `game.enabled` kontrol etmiyor (`[game]/complete/route.ts:33-40`).
- **Sorun:** Bir oyunda istismar fark edilip oyun kapatıldığında, değişiklikten sonraki ilk istek(ler) ve kapatmadan önce başlatılmış tüm aktif oturumlar ödül almaya devam ediyor. Ekonomi değişmezlerinde "kapatma = derhal kesme" beklentisi var.
- **Öneri:** Admin mutasyonunda `revalidateTag(tag, { expire: 0 })` ile anında sona erdirme kullanın, ya da `enabled` bayrağını Upstash Redis sıcak katmanından okuyun (perf notlarındaki token-replay deseni: Redis sıcak, DB kaynak-doğruluk). `complete` route'una `if (!game.enabled) → ödülsüz kapat` kuralı ekleyin. Panelde "Kapat" sonrası bir "Etkin: şimdi / yayılıyor" göstergesi bulunsun.
- **Efor:** S

### B4 · YÜKSEK · Ekonomi/Güvenlik · Puan basan alanlarda koruma yok: 1.000.000 puan, 0 eşik, 0 sn
- **Kanıt:** `route.ts:129-132` `z.number().int().min(0).max(1_000_000)`. Panelde onay adımı yok (`page.tsx:297`). `minDurationSec: 0` `tooFast` kontrolünü etkisizleştiriyor. `rewardThreshold: 0` ile `won:true` gönderen herkes ödül alıyor. `points-caps`/`velocity` yalnızca tespit yapıyor, oyun tamamlamada uygulanmıyor (`complete/route.ts:158-170` yalnızca `analyticsEvent` yazıyor).
- **Sorun:** Bir yazım hatası (fazladan basılan "0") ya da ele geçirilmiş bir admin oturumu, 19 oyun × günlük hak × tüm müşteriler üzerinden sınırsız puan basabilir. Proje bellek notundaki "puan basan her yol" ilkesi için koruma panelde değil, yalnızca sunucu kırpmasında bulunmalı.
- **Öneri:** (1) Sunucu tarafında makul tavanlar tanımlayın: `rewardPoints ≤ 1000`, `rewardXp ≤ 500`, `minDurationSec ≥ 3`, `rewardThreshold ≥ 1`. Tavanlar `GamificationSettings`'ten okunabilir. (2) Panelde varsayılanın 2 katını aşan ya da `minDurationSec`'i düşüren değişiklikler için bir "etki önizlemesi" diyaloğu gösterin: "Son 30 gündeki 1.240 kazanıma göre bu değişiklik aylık +186.000 puan getirir". Hesap `rewarded30d × Δpuan` ile yapılabilir, veri zaten API'de mevcut (`route.ts:106`). (3) Yüksek riskli değişikliklerde ikinci onay ya da gate cevabı istenebilir.
- **Efor:** M

### B5 · ORTA · Veri doğruluğu · "30g oynanma" ve "Bugün" yalnızca kazanılan oyunları sayıyor; gün UTC
- **Kanıt:** `route.ts:37,42` `status: 'completed'`; `complete/route.ts:101` `status: won ? 'completed' : 'failed'`; `route.ts:30` `toISOString().slice(0,10)`.
- **Sorun:** Operatör "oynanma" sayısını görüyor ama gerçekte görülen kazanma sayısı. Zorluk ayarı için en kritik metrik olan kazanma oranı hesaplanamıyor, terk edilen (`active` kalan) oturumlar da görünmüyor. Gün sınırı TR saatiyle 03:00'te geçiyor.
- **Öneri:** API `started`, `completed`, `failed`, `abandoned`, `rewarded` ve `points` sayılarını ayrı döndürsün. UI'da "Başlatma → Kazanma → Ödül" mini huni gösterilsin ve "kazanma oranı %" ile "ödül oranı %" öne çıkarılsın. Gün anahtarı için bir `Europe/Istanbul` yardımcısı kullanılsın, ya da en azından etikete "(UTC)" yazılsın.
- **Efor:** S

### B6 · ORTA · Kapsam · Pacman ("Yıldız Avı") panelin tamamen dışında
- **Kanıt:** `MINI_GAMES` içinde pacman yok (`lib/minigame-config.ts:73-372`). Hub kartı sabit kodlanmış (`components/customer/games/games-hub.tsx:26-31`). Ayrı uç: `app/api/customer/games/pacman/complete/route.ts:8,14,64` statik `MINIGAME` sabitlerini kullanıyor.
- **Sorun:** Başlık "x/19 oyun aktif" diyor ama müşteri 20 oyun görüyor. Pacman kapatılamıyor, ödülü değiştirilemiyor ve istatistiği yok.
- **Öneri:** Pacman'i registry'ye `scoreKind: 'stars'` gibi bir alanla taşıyın, ya da registry'ye `legacy: true` satırı ekleyip `pacman/*` route'larının `getEffectiveMiniGame('pacman')` okumasını sağlayın.
- **Efor:** M

### B7 · ORTA · UX/Doğruluk · "özelleştirilmiş" rozeti yanlış bilgi veriyor; sıfırlama yolu yok
- **Kanıt:** `page.tsx:209` `hasOverride = !!g.override`; `RotateCcw` import edilmiş ama kullanılmıyor (`page.tsx:9`). API'de DELETE yok.
- **Sorun:** Oyunu bir kez kapatıp açmak, tüm alanları null olan bir satır bırakıyor ve rozet kalıcı olarak görünüyor. Gerçekten özelleştirilmiş bir oyunu varsayılana döndürmek için 9 alanın tek tek temizlenmesi gerekiyor.
- **Öneri:** Rozeti, effective değerin varsayılandan farklı olduğu alan sayısına göre hesaplayın ("3 alan özelleştirildi" ve üzerine gelindiğinde fark listesi). Alan bazında "↺" ve kart bazında "Varsayılana sıfırla" eylemi ekleyin. Kart bazındaki sıfırlama için `DELETE /api/admin/games?gameType=` kullanılsın; satır silinsin ama `enabled=false` ise korunsun.
- **Efor:** S

### B8 · ORTA · Doğrulama/Dil · Girdi doğrulaması zayıf; hata mesajları İngilizce ve alan adı içermiyor
- **Kanıt:** `route.ts:133-136` `strOverride` hex, grafem veya uzunluk kontrolü yapmıyor (400 karakter). `route.ts:160-163` `parsed.error.errors[0].message` gibi zod v3 varsayılan mesajlarını ("Expected integer, received float", "Number must be greater than or equal to 0") toast'a aktarıyor. `page.tsx:146` `Number('1.5')`. İstemci tarafında doğrulama yok.
- **Sorun:** `accent: "#fff"` girildiğinde hub'da `${accent}40` (`games-hub.tsx:189-208`) geçersiz CSS üretiyor ve kart vurgusunu kaybediyor. 400 karakterlik başlık hub kartını bozuyor. Hata mesajı hangi alanın hatalı olduğunu söylemiyor ve Türkçe arayüzde İngilizce görünüyor.
- **Öneri:** `accent` için `/^#[0-9a-f]{6}$/i` kullanın ve UI'da renk seçici + önizleme sunun. `emoji` için `Intl.Segmenter` ile tek grafem kontrolü yapın. `title` için en fazla 40, `description` için en fazla 160 karakter sınırı koyun ve karakter sayacı gösterin. Paylaşılan bir zod şemasını hem istemcide (react-hook-form + zodResolver, alan altı hata mesajı) hem sunucuda kullanın. Mesajlar Türkçe olsun ve `path` içersin.
- **Efor:** S

### B9 · ORTA · Denetlenebilirlik · Audit kaydında önceki değer yok, sayfada geçmiş görünümü yok
- **Kanıt:** `route.ts:202-212` yalnızca `newData` yazıyor. Şemada `oldData Json?` alanı mevcut (`prisma/schema.prisma:1112`).
- **Sorun:** Ekonomi etkili bir değişikliğin "kim, ne zaman, neyden neye" sorusu cevaplanamıyor ve geri alma zor.
- **Öneri:** Upsert'ten önce mevcut satırı okuyup `oldData`'yı yazın; ikisini aynı `$transaction` içine alın. Kart üzerinde "Geçmiş" çekmecesi gösterin: son 10 `minigame_config_update` kaydı, diff ve "bu sürüme geri dön" eylemi (Linear/Stripe benzeri olay akışı).
- **Efor:** S

### B10 · DÜŞÜK · Mimari · Effective birleştirme mantığı kopyalanmış
- **Kanıt:** `route.ts:58-60,94-105` (`num`/`str`) ile `lib/minigame-config-effective.ts:41-58` (`mergeOne`). Küçük bir sapma bile var: route `str()` değeri kırpmadan döndürüyor, `mergeOne` kırpıyor.
- **Öneri:** `mergeOne`'ı dışa aktarın ve admin GET bunu kullansın. Tek birleştirme fonksiyonu ve tek test.
- **Efor:** S

### B11 · DÜŞÜK · Kısmi PATCH tutarlılık kontrolü varsayılana göre yapılıyor
- **Kanıt:** `route.ts:177-181` `effMax ?? def.maxScore`; mevcut override hesaba katılmıyor.
- **Sorun:** UI her iki alanı gönderdiği için UI'da sorun yok. Ancak API'yi kullanan bir script (`admin-api-catalog.json:355`'te listelenmiş) yalnızca `maxScore` gönderdiğinde, mevcut override eşiğinin altına düşerek ödülü erişilemez kılabilir.
- **Öneri:** Kontrolü "mevcut override + gelen alanlar + varsayılan" birleşimi üzerinden yapın.
- **Efor:** S

### B12 · DÜŞÜK · Erişilebilirlik · Etiketler bağlı değil, anahtarın adı yok, pasif kartta kontrast düşük
- **Kanıt:** `page.tsx:349-357` `Label`/`Input` için `htmlFor`/`id` yok. `:241` `Switch`'te `aria-label` yok. `:221` `opacity: 0.72` muted metni WCAG AA altına itebilir (ölçülmedi). `:227` emoji `aria-hidden` değil.
- **Öneri:** `useId` ile alan bağı kurun, `aria-label={`${title} oyununu ${enabled ? 'kapat' : 'aç'}`}` ekleyin. Pasif durumu opaklık yerine "Pasif" rozeti ve gri accent ile gösterin. Emojiye `aria-hidden` verin.
- **Efor:** S

### B13 · DÜŞÜK · Ölü kod / tutarlılık
- **Kanıt:** `RotateCcw` (`page.tsx:9`) ve `stats.rewarded30d` (`page.tsx:53`) kullanılmıyor. `p-6` (`page.tsx:189`) layout dolgusunun üzerine ekleniyor. Metinler i18n dışında, oysa kardeşi `gamification-settings` `useAppT()` kullanıyor.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Değişiklik etkisi önizlemesi ve ekonomi korumaları** (Stripe'ın fiyat değişikliği onayı, PostHog'un experiment uyarıları gibi). Son 30 günün verisiyle aylık puan etkisi tahmini ve sunucu tarafı tavanlar.
2. **Zamanlanmış ve geçici override'lar**: "Hafta sonu 2× ödül", "Ramazan etkinliği 01–07". `startsAt/endsAt` alanlarıyla sezonluk etkinlik modülüne bağlanabilir.
3. **Oyun başına analitik detay paneli**: 30/90 günlük trend sparkline, kazanma ve ödül oranı, skor dağılım histogramı (eşik ayarı için en değerli görsel), `tooFast` reddi sayısı (bot sinyali), en çok oynayanlar.
4. **Değişiklik geçmişi + geri al** (Linear tarzı aktivite akışı, Retool audit).
5. **Toplu işlemler ve acil durdurma**: "Tüm oyunları duraklat", seçili oyunlara ödül çarpanı, CSV/JSON dışa aktarma.
6. **Canlı önizleme**: hub kartı ve oyun başlığı override'ının müşteri görünümünde nasıl duracağı (accent ve emoji ile).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Oyun ekonomisi kontrol odası". Operatör ilk bakışta hangi oyunun puan sızdırdığını, hangisinin çok zor ya da çok kolay olduğunu ve neyin kapalı olduğunu görmeli. Her değişikliği etkisini görerek ve geri alınabilir şekilde yapmalı.

**Yerleşim:**
- **Üst şerit (KPI):** Aktif oyun sayısı (pacman dahil), bugünkü oturum, 30 günlük basılan puan (önceki dönemle karşılaştırmalı), genel kazanma oranı ve `tooFast` red oranı. Sağda "Tümünü duraklat" acil eylemi (onaylı).
- **Ana görünüm: yoğun tablo** (Stripe/Linear tarzı, kart ızgarası yerine). Sütunlar: oyun (emoji + ad + gameType), durum anahtarı, ödül p/xp, eşik/maks (küçük ilerleme çubuğu), kazanma oranı, 30g puan ve sparkline, "özelleştirildi" sayısı. Arama, "yalnız pasif" / "yalnız özelleştirilmiş" filtreleri ve sütun sıralaması olsun. Mobilde tablo kompakt satır kartlarına dönüşsün.
- **Sağ çekmece (Sheet) ile düzenleme:** Satıra tıklanınca açılır ve üç sekmeden oluşur. "Ödül & zorluk" sekmesinde alanlar varsayılan değerle yan yana durur, alan başına ↺ düğmesi vardır ve skor histogramının üzerinde sürüklenebilir bir eşik çizgisi bulunur. "Görünüm" sekmesinde renk seçici ve canlı hub kartı önizlemesi yer alır. "Geçmiş" sekmesi audit diff'ini ve geri al eylemini içerir. Kaydet düğmesi önce "etki özeti" diyaloğunu açar.
- **Durumlar:** İskelet satırlar; hata durumunda bir hata kartı ve "Yeniden dene" düğmesi; boş durum açıklaması.

**Motion/3D:** 3D burada yersiz. Bu bir operatör aracı ve hız ile okunabilirlik öncelikli. Motion ölçülü kalmalı: tabloda giriş stagger'ı olmamalı (19 satırda gecikme yaratır). Çekmece ~200 ms kayarak açılabilir. Bir anahtar değiştiğinde satır kısa bir accent nabzıyla yanıp sönebilir (tek seferlik, `reducedMotion` ile kapanır). KPI sayıları değiştiğinde kısa bir sayma animasyonu kullanılabilir. Global `MotionConfig reducedMotion="user"` korunmalı.

**Veri/API değişiklikleri:**
- `GET /api/admin/games`: `mergeOne` kullanılsın, pacman eklensin. İstatistikler `started/completed/failed/abandoned/rewarded/points/tooFastRejected` olarak ayrılsın ve skor histogramı (`starsCollected` bucket'ları) dönsün. Her satıra `updatedAt` ve `customizedFields[]` eklensin. İstatistik kısmı 60 sn'lik Upstash cache'ine alınabilir (konfigürasyon hariç).
- `PATCH`: Yalnızca değişen alanlar gönderilsin. `expectedUpdatedAt` ile 409 dönülsün. Sunucu tavanları ve hex/grafem/uzunluk doğrulaması eklensin, Türkçe ve alan yollu hata mesajları verilsin. `oldData` yazılsın. `revalidateTag(tag, { expire: 0 })` ya da Redis bayrağı kullanılsın.
- `DELETE /api/admin/games?gameType=`: Override sıfırlansın.
- `POST /api/admin/games/bulk`: Toplu duraklatma ve çarpan için.
- Müşteri tarafı: `start` tam effective config döndürsün. Oyun bileşenleri `DEF` yerine bu config'i okusun. `complete`, ödül uygunluğunu `won` yerine sunucuda skor/eşik karşılaştırmasıyla belirlesin ve `enabled=false` olan oyuna ödül vermesin.
- İsteğe bağlı: Zamanlanmış override'lar için `MiniGameConfig`'e `scheduleStart/End` ve `multiplier` alanları, ya da ayrı bir `MiniGameEvent` tablosu.

---

## Çakışmalar / birleştirme önerisi

- Doğrudan bir kopya sayfa yok. `/admin/gamification-settings`, `/admin/points-matrix`, `/admin/economy-sim`, `/admin/league-settings`, `/admin/surprise-boxes` ve `/admin/quests` sayfalarında mini oyun referansı bulunamadı (grep boş).
- Bununla birlikte, bu sayfa **puan basan bir kaynak** ve ekonomi kararları dağınık durumda. Önerim, sayfayı kaldırmak ya da birleştirmek değil, bir **"Oyunlaştırma & Ekonomi" bilgi mimarisi grubu** altında toplamak. `/admin/points-matrix` (puan kuralları), `/admin/games` (oyun ödülleri) ve `/admin/economy-sim` (simülasyon) aynı sekme ailesinde yer alsın. Oyun ödül değişiklikleri `economy-sim`'in girdi modeline beslensin, böylece "etki önizlemesi" tek bir hesap motorundan gelsin.
- Turnuva (`app/api/customer/tournament/route.ts` `getEffectiveMiniGame`) bu sayfanın konfigürasyonuna bağlı, ama turnuva için bir admin ekranı yok. Oyun detay çekmecesinde "bu oyun aktif turnuvada kullanılıyor" uyarısı gösterilmeli.

---

## Doğrulama (şüpheci inceleme)

Her iddia çağıran/çağrılan kod baştan okunarak çürütülmeye çalışıldı. Kod değiştirilmedi, DB'ye dokunulmadı.

### 1. Admin eşik/maks. skor override'ı istemci ile sunucu ödül kararını ayrıştırıyor — **DOĞRULANDI** (Yüksek)

- Kanıt: 20 oyun bileşeninin tamamı `const DEF = getMiniGame('<tip>')!` ile **statik registry** değerini okuyor (ör. `components/customer/games/bot-hunter-game.tsx:13`). Kazanma kararı istemcide `DEF.rewardThreshold` ile veriliyor (`bot-hunter-game.tsx:95`), oyun `DEF.maxScore`'da bitiyor (`:152`), GameShell'e `rewardThreshold={DEF.rewardThreshold}` geçiyor (`:195`). `start` route'u effective `config` döndürüyor (`app/api/customer/games/[game]/start/route.ts:96-102`) ve `useMiniGame` bunu state'e alıyor (`lib/use-mini-game.ts:72`), ama hiçbir oyun bileşeni `game.config`'i okumuyor (grep boş).
- Sunucu: `eligible = won && !tooFast` (`complete/route.ts:86`), ödül `computeEffectiveReward` ile effective eşikle hesaplanıyor (`lib/minigame-config-effective.ts:111-121`), oturum durumu `won ? 'completed' : 'failed'` (`complete/route.ts:101`).
- Yeniden üretim (eşik düşürme): registry eşiği 10 olan oyunda admin eşiği 5 yapar. Oyuncu 7 skor alır, istemci `7 >= DEF(10)` yanlış olduğu için `won:false` gönderir. Sunucu `eligible=false` sonucuna varır ve 0 puan verir; oturum `failed` olur. Ertesi `start` çağrısı aynı oturumu döndürür ve `complete` 409 verir, yani günlük hak da yanar.
- Yeniden üretim (eşik yükseltme): eşik 20 yapılır. Oyuncu 15 skor alır, istemci `won:true` gönderir, sunucu `15 < 20` olduğu için ödül 0 verir. "Kazandın" ekranı ve "Kazandın ama ödül eşiğini geçemedin" toast'ı gösterilir; GameShell "Ödül için 10 skor gerekiyordu" yazar (yanlış sayı). `maxScore` yükseltmesi istemcide etkisizdir (oyun `DEF.maxScore`'da biter).
- Ek gözlem: başlık/emoji/açıklama/renk override'ları da oyun ekranına yansımıyor (`DEF.title`, `DEF.accent`).

### 2. Kapatılan oyun Kaydet ile sessizce yeniden açılıyor — **DOĞRULANDI** (Yüksek)

- Kanıt: `toEdit` `enabled`'ı düzenleme başlangıcında dondurur (`app/admin/games/page.tsx:75`, `:114`). Kart üzerindeki Switch düzenleme sırasında da etkindir; yalnızca `busy` ile kilitlenir (`:241-245`). `toggleEnabled` `load()` çağırır ama `edit` state'ine dokunmaz (`:133`). `save` her zaman `enabled: edit.enabled` gönderir (`:150`). Sunucu tanımlı (`!== undefined`) her alanı yazar (`app/api/admin/games/route.ts:195-197`).
- Yeniden üretim: Oyun açıkken "Düzenle" tıklanır. Aynı kartın Switch'i ile oyun kapatılır, toast "kapatıldı" der. Ardından ödül puanı değiştirilip "Kaydet" tıklanır. Gövdede `enabled:true` gider ve oyun tekrar açılır. Formda `enabled` alanı görünmediği için admin bunu fark etmez. Daha gerçekçi bir varyant: iki admin ya da iki sekme var, A düzenleme formunu açık tutarken B oyunu kapatır, A kaydeder ve kill-switch geri alınır. Aynı kayıp-güncelleme, form tüm alanları gönderdiği için diğer alanlar için de geçerli.

### 3. Oyun kapatma anında yürürlüğe girmiyor, aktif oturumlar ödül almaya devam ediyor — **DOĞRULANDI** (şiddet: Orta)

- Kanıt (a): `revalidateTag(MINIGAME_CONFIG_TAG, 'max')` (`app/api/admin/games/route.ts:217`). Next 16.1.6'nın `node_modules/next/dist/server/web/spec-extension/revalidate.js` dosyasında profil verildiğinde ve `expire !== 0` olduğunda bu çağrı stale-while-revalidate işaretlemesi yapar: bayat değer arka plan yenilemesi bitene kadar servis edilmeye devam eder. Anında geçersizleştirme `updateTag` ile yapılır, ancak o da route handler'da hata fırlatır. Bu yüzden kapatmadan hemen sonraki ilk istek(ler) `enabled:true` görebilir. Pencere kısa, canlıda ölçülmedi.
- Kanıt (b): `complete/route.ts` dosyasında `game.enabled` kontrolü hiç yok (`:35` sonrası). Kontrol yalnızca `start/route.ts:33-38` içinde var.
- Yeniden üretim: Müşteri oyunu başlatır (oturum `active`). Admin istismar şüphesiyle oyunu kapatır. Müşteri oyunu bitirip `complete` çağırır ve tam ödülü alır. Oturumların yaş üst sınırı yok, bu yüzden günün erken saatinde açılıp tamamlanmamış oturumlar da kapatmadan sonra ödüllendirilir.
- Şiddet notu: Etki, kapatma anında `active` olan oturumlarla sınırlı (kullanıcı/oyun/gün başına en fazla 1 ödül). Sınırsız basım yok, bu yüzden "Kritik" değil "Orta". Çözüm: `complete` içinde `if (!game.enabled)` olduğunda ödülü 0'a çekin ve oturumu `failed/disabled` olarak kapatın. Konfigürasyon okumasını kill-switch için cache'siz yapın (ya da `revalidateTag(tag, { expire: 0 })` kullanın) veya Redis'te bir `minigame:disabled` bayrağı tutun.

### 4. Puan basan alanlar için sunucu tavanı yok — **ÇÜRÜTÜLDÜ** (Kritik/Yüksek güvenlik bulgusu olarak; Düşük/Orta seviye operasyonel koruma eksikliği olarak kalır)

- Gerçek olan kısım: Şemada `rewardPoints`/`rewardXp` için 0..1.000.000 aralığı var, `rewardThreshold=0` ve `minDurationSec=0` de kabul ediliyor (`app/api/admin/games/route.ts:127-130`). `complete` içinde oyun puanına tavan yok, `points_credited` yalnızca görünürlük amaçlı (`complete/route.ts:162-171`).
- Çürüten kısım: "Ele geçirilmiş admin oturumu" senaryosu yeni bir saldırı yüzeyi açmıyor. ADMIN rolü zaten `PATCH /api/admin/users` üzerinden herhangi bir kullanıcının puanını sınırsız ayarlayabiliyor (`app/api/admin/users/route.ts:19` `points: z.number().optional()`, `:399-404` `add_points` `increment: data.amount`). `POST /api/admin/surprise-box/send` de üst sınırsız puan gönderebiliyor (`app/api/admin/surprise-box/send/route.ts:12` `z.number().int().min(0)`, `randomCount` en fazla 500). Oyun yolu bundan daha yavaş ve daha sınırlı: kullanıcı başına oyun başına günde 1 ödül (`@@unique([userId, gameType, dayKey])`). `threshold=0` ve `minDurationSec=0` meşru operatör seçimleri (etkinlik/kolay mod); skor zaten istemci bildirimi olduğu için eşik tek başına güvenlik sınırı değil.
- Kalan risk: Yazım hatası (150 yerine 1500/15000 girmek). Bu bir güvenlik açığı değil, operasyonel koruma eksikliği. Öneri: registry varsayılanının ×N katını aşan değerler için Kaydet'te "etki özeti + onay" diyaloğu gösterin (tahmini günlük basım = son 7 günün ödül alan oturum sayısı × yeni puan). Sunucuda makul bir yumuşak tavan (ör. 5.000) koyun; bunun üstü için açık bir `confirmHighReward:true` bayrağı isteyin. Audit'e `oldData` yazın.
