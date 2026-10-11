# /admin/agent-council/agents

**Amaç:** Grok Konseyi'ndeki dört ajanın (Harper · Veri, Benjamin · Mantık, Lucas · Denge, Grok · Kaptan) "etki ağırlıklarını" (0.1–3.0) yapılandırmak ve `Settings` tablosuna `agent_council_profiles` anahtarıyla kaydetmek.

**Genel puan: 2.5/10** · **Karar: birleştir** (ana `/admin/agent-council` sayfasına "Ajanlar / Konsey yapılandırması" paneli olarak taşınmalı ve ağırlıklar konsey motoruna GERÇEKTEN bağlanmalı; bağlanmayacaksa sayfa kaldırılmalı)

> Özet tespit: Sayfa teknik olarak kaydediyor, ama kaydettiği değeri **sistemde hiçbir kod okumuyor**. `agent_council_profiles` anahtarı tüm depoda yalnızca bu sayfada geçiyor (`app/admin/agent-council/agents/page.tsx:30`, `:50`); konsey motoru (`lib/agent-council.ts`, `lib/agent-dialogue.ts`) ve `app/api/admin/agents/*` uçları ayarları hiç sorgulamıyor. Ayrıca sayfaya kenar çubuğundan ya da konsey sayfasından hiçbir bağlantı yok (yetim rota). Yani yönetici bir ayar düzenlediğini sanıyor, ama ayarın hiçbir etkisi yok.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 1.5/10 | Kaydetme/yükleme çalışıyor ama ağırlıkların konsey çıktısına etkisi sıfır (sahte yapılandırma); doğrulama ve yükleme-yarış koruması yok. |
| UX | 3/10 | Ağırlığın ne yaptığı, nereye etki ettiği açıklanmıyor; yükleme/hata/kirli durum yok; sayfaya ulaşmanın yolu yok. |
| Görsel | 4/10 | Hero ortak tasarım dilinde, ama altındaki `rounded-none border-4 border-black` brütalist kart admin panelinde yalnızca 2 sayfada var ve hero ile çelişiyor; persona renkleri/ikonları kullanılmıyor. |
| Mimari | 3/10 | Ajan listesi `COUNCIL_AGENT_ORDER`/`AGENT_PERSONAS` yerine sayfada kopyalanmış; genel amaçlı `Settings` PUT'u şemasız `unknown` değer kabul ediyor; tüketici katman yok. |
| Performans | 8/10 | Tek küçük GET + PUT; ağır bağımlılık yok. Tek kusur: istemci bileşeni yükleme tamamlanmadan varsayılanları gerçek veri gibi gösteriyor. |
| Erişilebilirlik + mobil | 4/10 | Sayı girişlerinin erişilebilir adı yok, başlık hiyerarşisi h1→h3 atlıyor; mobilde satırlar sığıyor ama dokunmatik için sayı girişi zayıf kontrol. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota metadata (noindex, i18n başlık/açıklama) | ÇALIŞIYOR | `app/admin/agent-council/agents/layout.tsx:4-6`, `messages/tr.json:170` | Metadata i18n anahtarlı, sayfa gövdesi değil. |
| 2 | Sayfa yetkisi (ADMIN rolü + gizli kapı çerezi) | ÇALIŞIYOR | `proxy.ts:51`, `proxy.ts:79-84` | `/admin/:path*` matcher kapsamında. |
| 3 | API yetkisi (GET/PUT `requireAuth(['ADMIN'])`) | ÇALIŞIYOR | `app/api/admin/settings/route.ts:43`, `:126` | IDOR riski yok; tek kiracılı platform ayarı. |
| 4 | Hero (başlık, açıklama, ikon) | ÇALIŞIYOR | `page.tsx:67-71`, `components/admin/admin-premium-hero.tsx:150-170` | Metin Türkçe karakter içermiyor: "agirliklarini". |
| 5 | Mevcut ayarı yükleme (`GET ?key=agent_council_profiles`) | KISMİ | `page.tsx:27-41`, `route.ts:57-71` | `res.ok` kontrol edilmiyor; hata sessizce yutuluyor (`:36-38`). |
| 6 | Varsayılan ağırlıklar (4 ajan × 1.0) | KISMİ | `page.tsx:16-21` | `lib/agent-dialogue.ts:31` `COUNCIL_AGENT_ORDER` ile kopya; yeni ajan eklenirse senkron bozulur. |
| 7 | Yükleme bitmeden düzenleme/kaydetme | BOZUK | `page.tsx:24`, `:33-34`, `:43-53` | Yükleme sürerken yapılan düzenleme, gelen veriyle ezilir; erken "Kaydet" ise DB'deki gerçek değeri varsayılanlarla ezer. |
| 8 | Ajan satırları listesi | ÇALIŞIYOR | `page.tsx:80-100` | Persona bilgisi (codename, rol, renk) gösterilmiyor. |
| 9 | Ağırlık sayı girişi (min 0.1, max 3, step 0.1) | KISMİ | `page.tsx:86-97` | `min/max` HTML ipucu; boş giriş `Number('')=0` olur, 0 veya 99 kaydedilebilir. |
| 10 | "0.1 - 3.0 arasi etki katsayisi" yardım metni | KISMİ | `page.tsx:84` | Etkinin ne olduğunu açıklamıyor; Türkçe karakter yok. |
| 11 | Kaydet (PUT, `category: 'ai'`) | KISMİ | `page.tsx:43-63`, `route.ts:123-188` | Değer DB'ye yazılıyor ama hiçbir tüketicisi yok (bkz. #12). |
| 12 | Ağırlıkların konsey kararına etkisi | SAHTE | `lib/agent-council.ts:67-70`, `:118-119`; `lib/agent-dialogue.ts:405-415`; anahtar yalnızca `page.tsx:30,50`'de geçiyor | Kazanan/konsensüs sabit formüllerle ve regex ile seçiliyor; ağırlık okunmuyor. |
| 13 | "Kaydediliyor…" durumu / buton devre dışı | ÇALIŞIYOR | `page.tsx:101-104` | |
| 14 | Başarı/hata toast'ı | KISMİ | `page.tsx:56-59`, `lib/admin-toast.ts:16-19` | Sunucu hata mesajı (`data.error`) atılıyor, genel metin gösteriliyor; önekler "Basarili:" Türkçe karaktersiz. |
| 15 | Denetim kaydı (AuditLog eski/yeni değer) | ÇALIŞIYOR | `route.ts:170-182` | Sayfada görünür değil. |
| 16 | Önbellek geçersizleştirme (`revalidateTag('settings')`) | ÇALIŞIYOR | `route.ts:184` | Bu anahtarı okuyan önbellek yok; etkisiz ama zararsız. |
| 17 | Karanlık tema | ÇALIŞIYOR | `page.tsx:73` | `dark:border-zinc-700`. |
| 18 | Azaltılmış hareket | ÇALIŞIYOR | `admin-premium-hero.tsx:162`, `:35` | Yalnızca hero'da hareket var, `useReducedMotion` uygulanmış. |
| 19 | Mobil yerleşim (≈400px) | ÇALIŞIYOR | `page.tsx:81` | `flex-1` + `w-28` sığıyor; dokunmatik için kaydırıcı/stepper yok. |
| 20 | Yükleniyor durumu (iskelet) | EKSİK | `page.tsx:24-41` | İlk boyamada varsayılanlar gerçek veri gibi görünüyor. |
| 21 | Yükleme hatası durumu | EKSİK | `page.tsx:36-38` | Hata yutuluyor; yönetici varsayılanları "kayıtlı değer" sanıyor. |
| 22 | Kaydedilmemiş değişiklik göstergesi / ayrılma uyarısı | EKSİK | `page.tsx` tamamı | Kirli durum izlenmiyor. |
| 23 | Varsayılana sıfırla / geri al | EKSİK | — | |
| 24 | Sunucu tarafı şema doğrulaması | EKSİK | `lib/validations.ts:201-205` (`value: z.unknown()`) | Herhangi bir JSON `agent_council_profiles` altına yazılabilir. |
| 25 | Eşzamanlı düzenleme koruması (sürüm/updatedAt) | EKSİK | `route.ts:154-166` | Son yazan kazanır. |
| 26 | PUT için hız sınırı | EKSİK | `route.ts:123-130` (POST'ta var: `:207`) | Tutarsızlık; düşük risk. |
| 27 | Navigasyon girişi (kenar çubuğu / konsey sayfasından bağlantı / geri dön) | EKSİK | `components/dashboard/sidebar.tsx:188` yalnızca `/admin/agent-council`; konsey sayfasında `/agents` bağlantısı yok | Yetim rota; yalnızca URL ile erişiliyor (ve `scripts/admin-responsive-scan.mjs:34`). |
| 28 | Persona bilgileri (rol, düşünme tarzı, odak, renk) | EKSİK | `lib/agent-personas.ts:23-68` mevcut ama içe aktarılmıyor | "Ajan Profilleri" başlığına rağmen profil yok. |
| 29 | Girişlerin erişilebilir adı (`<label>`/`aria-label`) | EKSİK | `page.tsx:83-97` | Ekran okuyucu yalnızca "döndürme kutusu" okur. |
| 30 | Değişiklik geçmişi / kim ne zaman değiştirdi | EKSİK | AuditLog yazılıyor (`route.ts:170`) ama sayfada okunmuyor | |
| 31 | Ağırlık etkisinin önizlemesi (son koşuyu yeniden puanlama) | EKSİK | — | Kıyas ürünlerde standart. |
| 32 | i18n (EN arayüz) | EKSİK | `page.tsx:56-84` sabit metin | Metadata i18n, gövde değil; "Agent Weights" İngilizce başlık TR sayfada. |

**Durum sayıları:** ÇALIŞIYOR 11 · KISMİ 7 · BOZUK 1 · SAHTE 1 · EKSİK 12 → toplam 32

---

## Bulgular

### 1. Ağırlıklar hiçbir yerde kullanılmıyor — sahte yapılandırma ekranı
- **Önem:** yüksek · **Kategori:** işlevsellik / veri bütünlüğü
- **Kanıt:** `app/admin/agent-council/agents/page.tsx:30`, `:50` — `agent_council_profiles` anahtarının depodaki tek geçişleri. Konsey motoru: `lib/agent-council.ts:67-70` (skorlar sabit formüllerle), `:118` (kazanan = en yüksek ham skor), `:119` (konsensüs = düz ortalama). Diyalog motoru: `lib/agent-dialogue.ts:405-415` (`pickWinner` regex ile). `app/api/admin/agents/run/route.ts:32` doğrudan `computeCouncil(goal)` çağırıyor; hiçbir yapılandırma parametresi yok. `lib/agent-dialogue.ts` / `lib/agent-council.ts` / `app/api/admin/agents/**` içinde "settings" araması boş.
- **Sorun:** Yönetici Harper'ı 3.0'a çıkarıp kaydediyor, "Başarılı" toast'ı görüyor; ama bir sonraki konsey koşusu birebir aynı mantıkla çalışıyor. Bu, yöneticiye yanlış kontrol hissi veren, güven kırıcı bir sahte ayar. Denetim kaydı da (`route.ts:170`) etkisiz bir değişikliği "update" olarak kayda geçiriyor.
- **Profesyonel öneri:** Ya bağla ya kaldır. Bağlamak için: `lib/agent-council-config.ts` içinde zod şemalı `CouncilConfig` (`weights: Record<AgentName, number>` 0.1–3.0, opsiyonel `enabled`, `temperature`, `captainOverride`) ve `getCouncilConfig()` (try/catch + varsayılan; `unstable_cache`/Redis, `settings` etiketiyle — `revalidateTag('settings')` zaten tetikleniyor). `computeCouncil` içinde: `weightedScore = rawScore * weight[agent]` ile kazanan seçimi, `consensusScore` için ağırlıklı ortalama, LLM istemine "Ağırlıklar: Harper=…" satırı; `lib/agent-dialogue.ts` `pickWinner`'da regex eşleşmesi yoksa ağırlıkla sıralama. Koşu kaydına (`AgentRun.context`) kullanılan `configSnapshot` yaz ki geçmişte hangi ağırlıkla karar verildiği izlenebilsin. Bağlanmayacaksa sayfa ve layout silinmeli, `admin-responsive-scan.mjs:34` girdisi kaldırılmalı.
- **Efor:** M

### 2. Yükleme–kaydetme yarışı: gerçek ayar varsayılanlarla ezilebilir
- **Önem:** orta · **Kategori:** veri bütünlüğü / durum yönetimi
- **Kanıt:** `page.tsx:24` (state varsayılanla başlıyor), `:33-34` (yanıt geldiğinde koşulsuz `setWeights`), `:101` (buton yükleme sırasında etkin).
- **Sorun:** Yavaş ağda (Neon soğuk başlangıç) yönetici varsayılan 1.0 değerlerini görür, düzenler; GET dönünce düzenlemesi sessizce kaybolur. Ya da GET'ten önce "Kaydet"e basarsa DB'deki gerçek profil `1/1/1/1` ile üzerine yazılır. GET hatasında da (`:36-38`) aynı varsayılanlar kaydedilebilir.
- **Profesyonel öneri:** `status: 'loading' | 'ready' | 'error'` durum makinesi; yükleme bitene kadar iskelet + devre dışı form; hata durumunda "Yeniden dene" ve kaydetmeyi kilitle. `useSWR`/React Query ile `fallbackData` yerine gerçek `isLoading`. Sunucuya `expectedUpdatedAt` gönderip uyuşmazlıkta 409 döndürerek iyimser eşzamanlılık.
- **Efor:** S

### 3. Değer doğrulaması yok — 0, negatif dışı uç değerler ve keyfi JSON kabul ediliyor
- **Önem:** orta · **Kategori:** doğrulama
- **Kanıt:** `page.tsx:95` `Number(e.target.value)` (boş → 0); `:88-89` yalnızca HTML ipucu; `lib/validations.ts:203` `value: z.unknown()`; `route.ts:141-142` yalnızca `points_matrix` normalize ediliyor.
- **Sorun:** 0 veya 50 gibi değerler kaydedilir; Bulgu 1 düzeltilip ağırlıklar bağlandığında bu, kazanan seçimini tek ajana kilitleyebilir veya çarpmada skoru sıfırlar. Ayrıca ADMIN, bu genel uçla anahtar altına herhangi bir şekil yazabilir; yüklemede `value.weights` öğeleri doğrulanmadan state'e alınıyor (`page.tsx:33-34`, `name` eksikse `key` tekrarı/undefined).
- **Profesyonel öneri:** Anahtar-başına şema kaydı: `route.ts` içinde `points_matrix` için yapılan normalize desenini genelleştir (`SETTING_SCHEMAS[key]?.parse(value)`); `agent_council_profiles` için zod (`AgentName` enum, 0.1–3.0, `multipleOf(0.1)`). İstemcide aynı şemayla satır içi hata ve `onBlur` clamp. Bilinmeyen/eksik ajanları `COUNCIL_AGENT_ORDER` üzerinden birleştir.
- **Efor:** S

### 4. Yetim rota — sayfaya hiçbir yerden ulaşılamıyor
- **Önem:** orta · **Kategori:** bilgi mimarisi
- **Kanıt:** `components/dashboard/sidebar.tsx:188` yalnızca `/admin/agent-council`; `app/admin/agent-council/page.tsx` içinde `/agent-council/agents` bağlantısı yok (yalnızca API fetch'leri `:135`, `:178`, `:215`, `:249`); depoda rota adı yalnızca `scripts/admin-responsive-scan.mjs:34`'te geçiyor. Sayfada konseye geri dönüş bağlantısı da yok (geçmiş sayfasında var: `history/page.tsx:45`).
- **Sorun:** Özellik keşfedilemez; ancak URL bilen biri bulur. Aynı "konsey" alanı üç ayrı sayfaya bölünmüş ama aralarında gezinme yok.
- **Profesyonel öneri:** Konsey sayfasını sekmeli bir çalışma alanına dönüştür: "Konsey" · "Geçmiş" · "Ajanlar" (Linear'ın proje sekmeleri gibi, URL senkron `?tab=`). Ajan yapılandırması ayrıca konsey sayfasında bir `Sheet` (yan panel) olarak "Ajanları yapılandır" düğmesinden açılabilir; böylece yönetici ağırlığı değiştirip hemen yeni koşu başlatabilir.
- **Efor:** M

### 5. "Ajan Profilleri" başlığı var, profil yok — persona verisi kullanılmıyor, liste kopyalanmış
- **Önem:** orta · **Kategori:** mimari / UX
- **Kanıt:** `page.tsx:16-21` sabit isim listesi; `lib/agent-personas.ts:23-68` (codename, archetype, thinkingStyle, focus, grokRole, sprite renkleri) içe aktarılmıyor; `lib/agent-dialogue.ts:31` `COUNCIL_AGENT_ORDER` ile tekrar. Konsey sayfası aynı ajanlar için ikon/renk eşlemesi kullanıyor (`app/admin/agent-council/page.tsx:59-60`).
- **Sorun:** Yönetici "Harper" isminden başka bir şey görmüyor; hangi ajanın neye baktığını bilmeden ağırlık vermesi isteniyor. Konsey sayfasıyla görsel kimlik (renk/ikon) uyumsuz.
- **Profesyonel öneri:** Her ajan için kart: persona rengiyle şerit + ikon, codename, archetype, `focus` etiketleri, `grokRole` alıntısı; son 30 gündeki koşularda kazanma oranı ve ortalama skor (`AgentDecision.winnerAgent`, `AgentMessage.score` — her ikisi de `@@index([winnerAgent])`/`@@index([agentName])` ile indeksli, `prisma/schema.prisma:2303`, `:2338`). Ajan listesi tek kaynaktan (`COUNCIL_AGENT_ORDER` + `AGENT_PERSONAS`) üretilmeli.
- **Efor:** M

### 6. Hata yönetimi bilgi kaybediyor
- **Önem:** düşük · **Kategori:** hata yönetimi
- **Kanıt:** `page.tsx:56` sunucu mesajı `throw new Error(data.error …)` ile atılıyor ama `:58` `catch {}` onu kullanmıyor; `:31` `res.ok` kontrolü yok; `:55` JSON olmayan yanıtta (`res.json()` hatası) aynı genel mesaj.
- **Sorun:** 400 doğrulama hatası ile 500 ve 401 (gate çerezi süresi dolmuş) aynı "kaydedilemedi" metniyle görünür; yönetici neyi düzelteceğini bilemez.
- **Profesyonel öneri:** `catch (e)` ile `e.message`'ı toast açıklamasına koy; 401/403'te gate'e yönlendirme; alan bazlı 400 hatalarını satır altında göster.
- **Efor:** S

### 7. Dil ve yazım tutarsızlığı (Türkçe karakter yok, TR/EN karışık)
- **Önem:** düşük · **Kategori:** içerik / i18n
- **Kanıt:** `page.tsx:56` "Kayit basarisiz", `:69` "agirliklarini", `:84` "arasi … katsayisi", `:76` "Agent Weights" (İngilizce başlık); `lib/admin-toast.ts:17` "Basarili: ". Metadata ise doğru Türkçe ve i18n'li (`messages/tr.json:170`).
- **Sorun:** Aynı ekranda düzgün Türkçe (hero eyebrow "Yönetim paneli") ile ASCII Türkçe ve İngilizce başlık yan yana; profesyonel his zedeleniyor, EN yerelinde gövde çevrilmiyor.
- **Profesyonel öneri:** Metinleri `messages/{tr,en}.json` altına `adminAgentCouncilAgents.*` ad alanıyla taşı; `lib/admin-toast.ts` öneklerini düzelt (tüm admin toast'larını etkiler — tek noktadan kazanım).
- **Efor:** S

### 8. Erişilebilirlik ve görsel tutarlılık
- **Önem:** düşük · **Kategori:** erişilebilirlik / görsel
- **Kanıt:** `page.tsx:86-97` girişin `id`/`aria-label`'ı yok, isim `<p>` ile bağlanmamış; `components/ui/card.tsx:44` `CardTitle` = `h3`, hero `h1` (`admin-premium-hero.tsx:227`) → h2 atlanıyor; `page.tsx:73` `rounded-none border-4 border-black` — admin altında yalnızca bu sayfa ve `history/page.tsx`'te var (74 admin dizininden 2'si).
- **Sorun:** Ekran okuyucu kullanıcısı hangi ajanın ağırlığını değiştirdiğini duyamaz; brütalist kart, yuvarlak/blur'lu premium hero ile aynı ekranda çatışıyor.
- **Profesyonel öneri:** Her satırı `<Label htmlFor>` + `Input id` ile bağla veya shadcn `Slider` + sayı girişi ikilisi (`aria-valuetext="Harper ağırlığı 1.5"`); kart stilini panelin standart `Card` görünümüne çek; `CardTitle`'ı `asChild`/`h2` yap.
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog)

1. **Etki önizlemesi / simülasyon:** PostHog'un "değişikliği önizle" ve Retool'un test-koşusu yaklaşımı gibi — son N konsey koşusunu yeni ağırlıklarla yeniden puanlayıp "kazanan değişirdi: 3/20 koşu" diff'i göstermek (yeni `POST /api/admin/agents/config/preview`, `AgentMessage.score` üzerinden saf hesap, LLM çağrısı yok).
2. **Sürümlü yapılandırma + geri alma:** Stripe'ın ayar geçmişi gibi; AuditLog zaten eski/yeni değeri tutuyor (`route.ts:170-182`) — "Değişiklik geçmişi" çekmecesi ve tek tıkla önceki sürüme dönüş.
3. **Ajan başına performans metrikleri:** kazanma oranı, ortalama skor, aksiyona dönüşme oranı (`AgentOutcome` ile), son kullanım.
4. **Ajan aç/kapat ve ek parametreler:** ajan devre dışı bırakma, LLM sıcaklığı, kaptan geçersiz kılma; kirli durum çubuğu ("2 kaydedilmemiş değişiklik · Vazgeç · Kaydet", Linear tarzı yapışkan alt bar).
5. **Normalize görünüm:** ham çarpanın yanında yüzde pay (ör. Harper %37) ve yığılmış çubuk — ağırlıkların göreli etkisi bir bakışta.
6. **Eşzamanlılık ve izin ayrıntısı:** iyimser kilit (409), "en son X tarafından Y dakika önce değiştirildi" bilgisi.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Yönetici konsey çalışma alanındayken "Ajanlar" sekmesine geçer; her ajanı kendi kimlik rengiyle, ne düşündüğüyle ve son 30 gündeki performansıyla görür; bir ağırlığı kaydırıcıyla değiştirdiğinde hemen altında "Bu ayarla son 20 koşunun 3'ünde kazanan değişirdi" önizlemesi belirir; kaydettiğinde bir sonraki koşu bu ağırlıkla yürür ve koşu kaydında hangi yapılandırmanın kullanıldığı görünür.

**Yerleşim:**
- Üstte sekmeler: Konsey · Geçmiş · Ajanlar (aynı hero, `?tab=` URL senkronu).
- "Ajanlar" sekmesi: 2×2 (mobilde tek sütun) ajan kartları — persona şeridi/ikonu, codename + archetype, odak etiketleri, kazanma oranı mini çubuğu, `Slider` (0.1–3.0, 0.1 adım) + sayısal giriş, "varsayılan 1.0" işareti.
- Sağda (mobilde altta) "Etki dağılımı" yığılmış çubuğu ve önizleme diff'i.
- Yapışkan alt kaydetme çubuğu (kirli durumda görünür) + "Varsayılana sıfırla" + "Geçmiş" çekmecesi (AuditLog).

**Motion/3D:** 3D gereksiz. Ölçülü framer-motion (`m as Motion`, global LazyMotion): yığılmış çubuk segmentlerinin `layout` geçişi (200 ms), kaydetme çubuğunun alttan kayarak gelmesi, önizleme sayılarının yumuşak sayaç geçişi. Tümü `useReducedMotion` ile anlık geçişe düşmeli. Hero'daki nefes animasyonu yeterli; ek dekoratif hareket eklenmemeli.

**Veri/API değişiklikleri:**
- `lib/agent-council-config.ts`: zod şema, `getCouncilConfig()` (try/catch + varsayılan, `settings` etiketli önbellek), `COUNCIL_AGENT_ORDER`'dan türeyen varsayılanlar.
- `lib/agent-council.ts` / `lib/agent-dialogue.ts`: ağırlıklı kazanan + ağırlıklı konsensüs + LLM istemine ağırlık bilgisi; `AgentRun.context.configSnapshot`.
- `GET/PUT /api/admin/agents/config` (genel settings ucunu kullanmak yerine): şema doğrulama, `expectedUpdatedAt` ile 409, hız sınırı, AuditLog.
- `GET /api/admin/agents/stats?days=30`: ajan başına `groupBy` (`AgentDecision.winnerAgent`, `AgentMessage.agentName` ortalama `score`) — indeksler mevcut.
- `POST /api/admin/agents/config/preview`: son N koşuyu yeni ağırlıklarla yeniden puanlama (salt okuma).

---

## Çakışmalar / birleştirme önerisi

- **`/admin/agent-council`** (ana konsey) ve **`/admin/agent-council/history`** ile aynı alanı paylaşıyor; üçü ayrı sayfa ama birbirine bağlı değil (bu sayfa tamamen yetim). Öneri: üçünü tek bir sekmeli "Grok Konseyi" çalışma alanında **birleştir**; bu sayfa "Ajanlar" sekmesi olur.
- **`/admin/ai-settings`** genel AI yapılandırma sayfası olarak var; ancak bu sayfa `category: 'ai'` ile kaydetmesine rağmen orada konsey ayarı yok (`app/admin/ai-settings` içinde "council/konsey" araması boş). Konsey yapılandırması konsey çalışma alanında kalmalı; `ai-settings` en fazla oraya bir bağlantı vermeli.
- Ağırlıklar motorla bağlanmayacaksa doğru karar **kaldır**: sahte bir ayar ekranı, hiç olmamasından daha zararlıdır.

---

## Doğrulama (şüpheci inceleme)

### 1. "Ajan ağırlıkları kaydediliyor ama konsey motoru tarafından hiç okunmuyor" — **DOĞRULANDI**

Çürütme denemesi ve bulgular:
- `agent_council_profiles` anahtarı `app/`, `lib/`, `components/` altında yalnızca `app/admin/agent-council/agents/page.tsx:30` (GET) ve `:50` (PUT) satırlarında geçiyor. `.weights` okuması da yalnızca aynı sayfada (`:33-34`); diğer `weights` eşleşmeleri ilgisiz (`lib/badge-algorithm.ts`, `lib/gamification-ab.ts`).
- Dolaylı okuma yolu da yok: `lib/agent-*.ts` dosyalarında `settings`/`getSetting`/önbellek erişimi sıfır eşleşme; `app/api/admin/agents/**` altında `settings` veya `weight` geçmiyor. Yani "kategori `ai` ayarlarını topluca çekip içinden ağırlık alan" bir kod da bulunmuyor.
- Motor: `app/api/admin/agents/run/route.ts:32` yalnızca `computeCouncil(goal)` çağırıyor; `lib/agent-council.ts:118` kazananı ham `critique.score` sıralamasıyla, `:119` konsensüsü `AGENTS.length`'e bölünen düz ortalamayla hesaplıyor. Diyalog yolu `lib/agent-dialogue.ts:405-415` `pickWinner` konu metnine regex uyguluyor; ağırlık parametresi yok.
- Kayıt tarafı gerçek: `app/api/admin/settings/route.ts:154-182` ayarı upsert ediyor ve `AuditLog` yazıyor, sayfa `toast.success` gösteriyor (`page.tsx:57`).

Yeniden üretim: Yönetici `/admin/agent-council/agents`'ta Harper'ı 3.0, diğerlerini 0.1 yapıp kaydeder → "Ajan profilleri kaydedildi" toast'ı ve AuditLog satırı oluşur → `/admin/agent-council`'da aynı hedefle koşu başlatır → `winnerAgent` ve `consensusScore` ağırlık değişikliğinden önceki koşuyla aynı formülle (ham skor / düz ortalama) üretilir. Ayar hiçbir çıktıyı etkilemez.

Etki değerlendirmesi: Güvenlik açığı veya veri bozulması değil; bir **işlevsel doğruluk / yanıltıcı kontrol** hatası. Yönetici, konsey kararlarını ayarladığına inanarak bu ekrana güvenip yanlış sonuç çıkarabilir. Bu nedenle "yüksek" önem derecesi ürün güveni açısından savunulabilir; "kritik" değildir. Raporun önerisi (motora bağla — `getCouncilConfig()` + ağırlıklı kazanan/konsensüs + koşuya `configSnapshot` — ya da sayfayı kaldır) yerinde.

---

## Uygulama (Dalga 2)

Rota emekli: `/admin/agent-council/agents` → `permanentRedirect('/admin/agent-council?tab=ayarlar')`. **Ajan ağırlıkları kaldırıldı**: hiçbir yerde okunmuyordu ve dürüst bir karşılığı yoktu. Yerine konsey motorunun GERÇEKTEN okuduğu ayarlar geldi: tartışma turu (1–3), konuşan uzmanlar (Kaptan her zaman açık), veri paketi aç/kapat, kurum talimatı (tüm istemlere eklenir). Ayarlar `Settings['agent_council_config']` altında; `GET/PUT /api/admin/council/config` (zod, `expectedUpdatedAt` 409, rate limit, AuditLog). Her oturum ayarın anlık görüntüsünü saklıyor.

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Metadata | ÇALIŞIYOR | |
| 2 | Sayfa yetkisi | ÇALIŞIYOR | |
| 3 | API yetkisi | ÇALIŞIYOR | Kendi `defineRoute` ucu; genel `settings` PUT'u artık kullanılmıyor. |
| 4 | Hero | ÇALIŞIYOR | Ortak `PageHeader`, doğru Türkçe. |
| 5 | Ayar yükleme | ÇALIŞIYOR | Sunucu ön yüklemesi ve `QueryState`; hata görünür, bozuk kayıt "varsayılana düşüldü" uyarısıyla. |
| 6 | Varsayılanlar | ÇALIŞIYOR | Tek kaynak `DEFAULT_COUNCIL_CONFIG`, sunucudan. |
| 7 | Yükleme/kaydetme yarışı (BOZUK) | ÇALIŞIYOR | Form yalnız veri gelince açılıyor; `expectedUpdatedAt` ile 409, "güncel hâli yükle". |
| 8 | Ajan satırları | ÇALIŞIYOR | Persona adı, rolü, odağı ve avatarı. |
| 9 | Ağırlık girişi | KALDIRILDI | Etkisizdi. Yerine tur ve uzman seçimi (`ChoiceChips`). |
| 10 | Yardım metni | ÇALIŞIYOR | Her ayarın etkisi açıklanıyor; çağrı tahmini gösteriliyor. |
| 11 | Kaydet | ÇALIŞIYOR | Değer motor tarafından tüketiliyor (oturum oluşturulurken anlık görüntüye girer, `stepSession` onu okur). |
| 12 | Ağırlıkların etkisi (SAHTE) | KALDIRILDI | Gerekçe yukarıda. |
| 13 | Kaydediliyor durumu | ÇALIŞIYOR | |
| 14 | Toast | ÇALIŞIYOR | Sunucu mesajı gösteriliyor. |
| 15 | Denetim kaydı | ÇALIŞIYOR | Sayfada "Değişiklik geçmişi" olarak okunuyor. |
| 16 | revalidateTag | KALDIRILDI | Önbellek yok; değer her oturum başında okunuyor. |
| 17 | Karanlık tema | ÇALIŞIYOR | Rol token'ları; brütalist kart kaldırıldı. |
| 18 | Azaltılmış hareket | ÇALIŞIYOR | |
| 19 | Mobil | ÇALIŞIYOR | ≥44px çipler. |
| 20 | İskelet | ÇALIŞIYOR | `skeleton="form"`. |
| 21 | Yükleme hatası | ÇALIŞIYOR | |
| 22 | Kirli durum / ayrılma uyarısı | ÇALIŞIYOR | Yapışkan kaydetme çubuğu, "Kaydedilmemiş değişiklik var", `beforeunload`. |
| 23 | Varsayılana sıfırla / geri al | ÇALIŞIYOR | "Varsayılanlar", "Vazgeç" ve geçmişten "Bu sürümü forma yükle". |
| 24 | Sunucu şema doğrulaması | ÇALIŞIYOR | `councilConfigSchema`. |
| 25 | Eşzamanlı düzenleme koruması | ÇALIŞIYOR | 409. |
| 26 | PUT hız sınırı | ÇALIŞIYOR | `mutation`. |
| 27 | Navigasyon | ÇALIŞIYOR | Sekme; oturumda ve formda "Ayarlar" bağlantıları. |
| 28 | Persona bilgileri | ÇALIŞIYOR | |
| 29 | Erişilebilir adlar | ÇALIŞIYOR | `aria-label` ve `<label htmlFor>`. |
| 30 | Değişiklik geçmişi | ÇALIŞIYOR | Son 10 kayıt, kim ve ne zaman. |
| 31 | Etki önizlemesi | KALDIRILDI | Ağırlık kalmadığı için anlamsız. Yerine "en fazla N LLM çağrısı" tahmini ve "Son 90 günde öne çıkanlar" (gerçek `winnerAgent` dağılımı) geldi. |
| 32 | i18n | KISMİ (kalan) | Tam Türkçe; EN eklenmedi (paylaşılan `messages`). |

**Kapanan bulgular:** B1 (kaldırıldı ve gerçek ayarlarla değiştirildi), B2, B3, B4, B5, B6, B8; B7 Türkçe tarafı kapandı (EN kalan) → 8/8. AI sağlayıcı ve model platform genelinde ayarlanıyor; ayarlar sekmesi bunu salt okunur gösteriyor ve `/admin/ai/studio`'ya bağlantı veriyor.
