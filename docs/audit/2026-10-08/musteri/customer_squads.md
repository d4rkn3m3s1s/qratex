# /customer/squads

**Amaç:** Müşterinin arkadaşlarıyla bir "klan" kurup/katılıp ortak puan havuzu (Klan Sandığı), haftalık ekip hedefi, klan içi sıralama, global klan sıralaması ve klanlar arası ödül havuzlu "Klan Savaşı" ile sosyal oyunlaştırma deneyimi yaşaması.

**Genel puan: 4.5 / 10** · **Karar: yeniden tasarla** (altyapının savaş/escrow çekirdeği sağlam; ancak sayfanın vaat ettiği ekonominin yarısı kodda yok, birkaç veri bütünlüğü açığı var ve deneyim Duolingo/Starbucks seviyesinin çok gerisinde)

Kapsam: `app/customer/squads/page.tsx`, `app/customer/squads/layout.tsx`, `components/customer/squad-interactive.tsx`, `squad-weekly-goal.tsx`, `squad-leaderboard.tsx`, `squad-battle-panel.tsx`; API: `app/api/customer/squads/**`; motor: `lib/gamification-engine.ts`; puan kaynakları: `app/api/feedbacks/route.ts`, `app/api/dealer/consumptions/route.ts`; cron: `app/api/cron/squad-battles/route.ts`, `app/api/cron/daily/route.ts`, `lib/inngest/functions.ts`; şema: `prisma/schema.prisma:399-489`. Kod değiştirilmedi, hiçbir komut/DB işlemi çalıştırılmadı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Oluştur/katıl/ayrıl ve escrow'lu meydan okuma çalışıyor; ama sandık dağıtımı, %5 bonus, 10 üye sınırı, dondurma ve "katkı" rakamı ya yok ya sahte. |
| UX | 4/10 | Sayfa vaatleri gerçekle çelişiyor (%5 vs %10, "ay sonu dağıtım" yok), meydan okumada puanın kendi bakiyenden düşeceği söylenmiyor, geri sayım/sonuç/geçmiş yok. |
| Görsel | 5/10 | Temiz shadcn kartları ama jenerik; savaş anı "CANLI" rozetinden ibaret, klan kimliği (logo/renk) yok, hiyerarşi savaş panelini başlığın üstüne koyuyor. |
| Mimari | 5/10 | Savaş claim/escrow transaction'ları örnek kalitede; buna karşın iki ayrı "dondurma" kaynağı, ölü şema alanları, owner-leave cascade ile escrow kaybı ve TOCTOU üyelik yarışı var. |
| Performans | 6/10 | SSR + paralel sorgu iyi; ancak boş durumda kullanılmayan top-10 sorgusu, istemcide 2 ayrı şelale fetch ve sekme gizliyken de süren 15 sn polling var. |
| Erişilebilirlik + Mobil | 5/10 | `MotionConfig reducedMotion="user"` global; ama label-input bağı yok, tıklanabilir `Card` div'leri, `animate-pulse` hareket tercihine bakmıyor, savaş CTA satırı mobilde sarmıyor, i18n yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Oturum + CUSTOMER rol koruması (redirect) | ÇALIŞIYOR | `app/customer/squads/page.tsx:15-19` | |
| 2 | Sayfa seviyesinde modül kapısı (`squads` kapalıyken) | EKSİK | `page.tsx` içinde `assertModuleEnabled` yok; API'ler gate'li (`app/api/customer/squads/route.ts:16`) | Modül kapalıyken sayfa açılır, tüm aksiyonlar hata verir. |
| 3 | Boş durum hero: "%5 ekstra Pasif Puan kazan" vaadi | SAHTE | `page.tsx:58`; pasif puan üyelikten bağımsız verilir: `app/api/dealer/consumptions/route.ts:334-345` | Klansız kullanıcı da aynı pasif puanı alıyor; klan yalnızca `squad.totalPoints` sayacını artırıyor. |
| 4 | "Klan Oluştur" kartı → dialog | ÇALIŞIYOR | `components/customer/squad-interactive.tsx:77-91,110-132` | |
| 5 | Klan adı doğrulama | KISMİ | İstemci `≥3`, `maxLength 30` (`squad-interactive.tsx:21,123`); sunucu sadece `length<3` (`route.ts:29`) | Trim yok, sunucuda üst sınır/tip kontrolü yok, küfür filtresi yok. |
| 6 | Klan oluşturma API | KISMİ | `app/api/customer/squads/route.ts:14-104` | `Squad.name @unique` (`schema.prisma:401`) → aynı ad P2002 → 500 "Internal Server Error" toast'ı; hata mesajları İngilizce. |
| 7 | "Bir Klana Katıl" kartı → dialog | ÇALIŞIYOR | `squad-interactive.tsx:93-107,134-157` | |
| 8 | Davet kodu girişi (büyük harf, 6 karakter) | ÇALIŞIYOR | `squad-interactive.tsx:57,143-149` | |
| 9 | Katılma API | KISMİ | `app/api/customer/squads/join/route.ts` | Üye sınırı yok, üyelik kontrolü+create transaction dışında (yarış), hata mesajları İngilizce. |
| 10 | Dialog'larda Enter ile gönderim (form semantiği) | EKSİK | `squad-interactive.tsx:116-130,140-155` `<form>` yok | |
| 11 | Boş durumda klan keşfi / açık klan listesi / global sıralama | EKSİK | `allSquads` çekiliyor (`page.tsx:39-43`) ama boş durumda render edilmiyor (`page.tsx:49-64`) | Hem boşa sorgu hem kaçırılmış keşif fırsatı. |
| 12 | Savaş yokken sahibe "Meydan Oku" CTA | ÇALIŞIYOR | `squad-battle-panel.tsx:135-152` | |
| 13 | Savaş yokken sahip olmayan üyeye bilgi | KISMİ | `squad-battle-panel.tsx:136` `return null` | Üye savaş özelliğinin varlığından habersiz kalır. |
| 14 | Rakip klan seçimi | KISMİ | `squad-battle-panel.tsx:137,165-176`; liste = global top-10 (`page.tsx:85`) | Top-10 dışındaki klanlara meydan okunamaz; arama yok. |
| 15 | Ödül havuzu girişi | KISMİ | `squad-battle-panel.tsx:57,180-186`; sunucu kendi bakiyesinden düşer: `challenge/route.ts:116-118` | Varsayılan 500 puan, bakiyeden düşüleceği ve bakiye UI'da yazmıyor. |
| 16 | Süre girişi (1-168 saat) | ÇALIŞIYOR | `squad-battle-panel.tsx:188-197`; `challenge/route.ts:18` | Ondalıklı değer zod'un İngilizce hatasını döndürür. |
| 17 | Meydan okuma gönderimi (atomik escrow + çakışma kontrolü) | ÇALIŞIYOR | `challenge/route.ts:100-133` | Bildirim transaction sonrası; hata olursa 500 döner ama savaş/borç gerçekleşmiştir (`:151-159`). |
| 18 | Bekleyen meydan okuma görünümü | ÇALIŞIYOR | `squad-battle-panel.tsx:215-237` | |
| 19 | Kabul / Ret (atomik, iade) | ÇALIŞIYOR | `battles/[id]/respond/route.ts:73-158` | Ret bildirimi havuz 0 iken de "iade edildi" diyor (`:117`). |
| 20 | Meydan okumayı geri çekme (challenger) | EKSİK | Uç nokta yok; iptal yalnızca cron'la (`cron/squad-battles/route.ts:51-91`) | Puan süre dolana kadar kilitli. |
| 21 | Canlı skor + 15 sn polling | KISMİ | `squad-battle-panel.tsx:77-81,241-277` | Sekme gizliyken de çalışır; süresi dolmuş ama henüz kapanmamış savaş "CANLI" görünür (`battles/current/route.ts:36-41` endTime filtresi yok). |
| 22 | Savaş geri sayımı / bitiş saati | EKSİK | `endTime` tipte var (`squad-battle-panel.tsx:29`) ama render edilmiyor | |
| 23 | Savaşta katkı verenler listesi | EKSİK | API hazır: `battles/[id]/route.ts:157-179`; müşteri UI'ı çağırmıyor | Ölü uç nokta. |
| 24 | Savaş sonucu ekranı / geçmiş | EKSİK | Panel yalnızca pending/active gösterir (`battles/current/route.ts:38`) | Kazanma anı sadece bildirimde (`gamification-engine.ts:77-84`). |
| 25 | Üye sayısı "X / 10 Üye" | SAHTE | `page.tsx:91`; katılımda sınır yok (`join/route.ts:212-236`), şemada alan yok | |
| 26 | Klan adı başlığı | ÇALIŞIYOR | `page.tsx:93-95` | |
| 27 | "Puanların %5'i ortak havuza yansır" metni | SAHTE | `page.tsx:97`; gerçek oran %10: `lib/gamification-engine.ts:154` | |
| 28 | Davet kodu gösterimi (`select-all`) | ÇALIŞIYOR | `page.tsx:101-104` | |
| 29 | Davet kodunu kopyala / paylaş / derin link | EKSİK | `Copy` ikonu import edilmiş ama kullanılmıyor (`page.tsx:7`) | |
| 30 | Klandan Ayrıl | KISMİ | `squad-interactive.tsx:162-193`; `[id]/leave/route.ts:291-301` | Kurucu ayrılınca klan tümden silinir, üyeler bilgilendirilmez, açık savaşın escrow'u kaybolur (Bulgu 1). |
| 31 | Kurucu yönetimi (devir, üye çıkarma, ad/açıklama, kod yenileme) | EKSİK | Uç nokta yok; `Squad.description` (`schema.prisma:402`) hiç kullanılmıyor | |
| 32 | Haftalık ekip hedefi barı | KISMİ | `components/customer/squad-weekly-goal.tsx`; `weekly-goal/route.ts` | Hedef sabit 5, kimse değiştiremez; tamamlanınca ödül yok; `weeklyTeamProgress/weeklyGoalResetAt` ölü. |
| 33 | Haftalık hedef yükleniyor durumu | ÇALIŞIYOR | `squad-weekly-goal.tsx:48-56` | Hata durumunda `catch` yok (`:23-40`). |
| 34 | Klan içi lider tablosu | KISMİ | `page.tsx:67,114-149` | Ömür boyu harcanabilir `points` bakiyesine göre sıralar, klana katkıya göre değil; "XP" diye etiketler. |
| 35 | "Sen" / "Kurucu" rozetleri | ÇALIŞIYOR | `page.tsx:136-137` | |
| 36 | Avatar + baş harf yedeği | ÇALIŞIYOR | `page.tsx:127-133` | |
| 37 | Üye satırında "+X Katkı" | SAHTE | `page.tsx:143` `points*0.05` | Gerçek katkıyla ilgisi yok; ömür boyu bakiyenin %5'i. |
| 38 | Global top-10 klan sıralaması | KISMİ | `page.tsx:39-43,69-75`; `squad-leaderboard.tsx` | Kendi klanın top-10 dışındaysa yerin görünmez; vurgulama yok; "Toplam XP" etiketi yanlış (puan). |
| 39 | "Lv. N" klan seviyesi | KISMİ | `page.tsx:73` istemci formülü | Hiçbir avantaj/kilit açmıyor; anlamsız sayı. |
| 40 | Her klanda "Aktif" yeşil etiket | SAHTE | `squad-leaderboard.tsx:85-87` sabit metin | |
| 41 | "Sezon 1" rozeti | SAHTE | `squad-leaderboard.tsx:36-38` sabit | Sezon modeli/sıfırlama yok. |
| 42 | Sıralama giriş animasyonu (stagger) | ÇALIŞIYOR | `squad-leaderboard.tsx:44-48`; reduced-motion global: `components/providers.tsx:232` | |
| 43 | Klan logosu | SAHTE | `logo?` prop (`squad-leaderboard.tsx:15,66-70`) hiç beslenmiyor; şemada alan yok | Ölü kod. |
| 44 | Klan Sandığı bakiyesi | KISMİ | `page.tsx:156-172`; artış `gamification-engine.ts:143-162` | Sayaç doğru artıyor ama hiçbir şeye harcanmıyor; "XP" diye etiketli. |
| 45 | "Ay sonunda aktif üyelere paylaştırılır" | SAHTE | `page.tsx:169,180`; repo genelinde `treasuryPoints` için tek yazma artırım (`gamification-engine.ts:157`), dağıtım kodu yok | |
| 46 | "Nasıl Çalışır?" kartı | SAHTE | `page.tsx:174-182` | %5 (gerçekte %10), "QR okutup Puan veya XP" (gerçekte yalnızca feedback puanı), dağıtım yok; yazım hatası "üyelereeşit" (`:180`). |
| 47 | Hata sınırı | ÇALIŞIYOR | `app/customer/error.tsx` (segment geneli) | Jenerik. |
| 48 | Yükleniyor durumları | KISMİ | Savaş paneli yüklenirken `null` (`squad-battle-panel.tsx:132`) → sonradan beliren panel layout shift yaratır | |
| 49 | Çok dillilik (i18n) | EKSİK | Sayfa ve bileşenlerde tüm metin sabit TR; API hataları EN | `messages/en.json` mevcut ama kullanılmıyor. |
| 50 | Savaş bildirimleri (davet/başladı/ret/zafer) | ÇALIŞIYOR | `challenge/route.ts:151-159`; `respond/route.ts:112-178`; `gamification-engine.ts:77-84` | Derin link yok ("klan sayfanıza gidin"). |
| 51 | Klan aktivite akışı / sohbet / tepki | EKSİK | — | Sosyal ürünün çekirdeği yok. |
| 52 | Mobil yerleşim | KISMİ | `squad-battle-panel.tsx:140` `flex justify-between` sarma yok; diğer bloklar `md:` kırılımlı | 400px'te metin + buton sıkışır. |
| 53 | Dondurulmuş klana katılma/oluşturma engeli | BOZUK | Okunan anahtar `settings.admin_frozen_squads` (`join/route.ts:11,196-208`; `route.ts:11,44-47`); admin ise `squad.isFrozen` yazar (`app/api/admin/squads/route.ts:87-90`) ve anahtarı yazan kod yok | Admin "Soft Freeze" katılımı hiç engellemiyor. |

**Sayım:** ÇALIŞIYOR 17 · KISMİ 15 · BOZUK 1 · SAHTE 9 · EKSİK 11 → toplam 53.

---

## Bulgular

### 1. Kurucu ayrılınca klan silinir, açık savaşın escrow'u yok olur
- **Önem:** kritik · **Kategori:** veri bütünlüğü / ekonomi
- **Kanıt:** `app/api/customer/squads/[id]/leave/route.ts:291-295` (`prisma.squad.delete`); `prisma/schema.prisma:464-465` (`SquadBattle.squad1/squad2 onDelete: Cascade`); escrow tahsilatı `challenge/route.ts:116-118`.
- **Sorun:** Bekleyen ya da aktif bir savaş varken iki klandan herhangi birinin kurucusu "Klandan Ayrıl" derse klan silinir ve cascade ile `SquadBattle` satırı da silinir. Meydan okuyanın bakiyesinden düşülmüş ödül havuzu iade edilmeden yok olur. Bu, projenin "escrow net-sıfır" değişmezini ihlal ediyor. Üstelik rakip klan kurucusu, kendisine yöneltilmiş bir meydan okumayı yalnızca klanı silerek karşı tarafa puan kaybettirebilir. Diğer üyeler de klanlarının silindiğinden habersiz kalır.
- **Öneri:** (a) Kurucu ayrılırken klanı silme. Sahipliği en kıdemli/en aktif üyeye otomatik devret; tek üye kalmışsa "klanı dağıt" ayrı ve açık bir aksiyon olsun. (b) Dağıtma/silme yolu tek bir `dissolveSquad(tx)` servisinde toplansın. Bu servis önce açık savaşları `cancelled`'a çeksin, `rewardFunded && !rewardRefunded` olan havuzu `creditPointsAndXp` + `points_credited/squad_battle_refund` ile iade etsin, ardından silsin. (c) Uzun vadede `SquadBattle` FK'larını `onDelete: Restrict` yapıp silmeyi yalnızca bu servise bırakın; denetim izi de korunmuş olur. (d) Açık savaş varken ayrılmayı UI'da engelleyin ya da sonucunu açıkça söyleyin. Üyelere bildirim gönderin.
- **Efor:** M

### 2. Klan Sandığı hiçbir zaman dağıtılmıyor; sayfadaki ekonomi vaatleri gerçekle çelişiyor
- **Önem:** yüksek · **Kategori:** sahte özellik / güven
- **Kanıt:** Vaatler `page.tsx:58,97,169,179-180`; gerçek oran `lib/gamification-engine.ts:154` (`Math.ceil(points * 0.1)`); `treasuryPoints` repo genelinde yalnızca artırılıyor (`gamification-engine.ts:157`), dağıtan cron/servis yok; pasif puan üyelikten bağımsız: `app/api/dealer/consumptions/route.ts:334-345`.
- **Sorun:** Sayfa dört ayrı yerde ödül vaat ediyor: "%5 ekstra pasif puan", "%5 sandığa", "ay sonunda eşit paylaştırılır", "QR okutup Puan veya XP kazandığında". Gerçekte oran %10 ve yalnızca feedback puanından besleniyor. Sandık hiç dağıtılmıyor. Klana katılmak kullanıcıya ek puan getirmiyor. Kullanıcı biriken "Klan Sandığı"nı aylarca izleyip hiçbir şey almayacak; sadakat ürününde bu en hızlı güven kaybı yolu.
- **Öneri:** Ürün kararı verilmeli. **Seçenek A (önerilen):** Sandığı gerçek yapın. Sandık payı mint değil kullanıcının kazancından ayrılan bir pay olsun ya da açıkça "platform bonusu" olarak `points_credited` ile işlensin. Aylık `squad-treasury-payout` işi `app/api/cron/daily` orkestratörüne eklensin: ay başı claim (`updateMany where lastPayoutAt < monthStart`), "aktif üye" tanımı (ör. ay içinde ≥1 feedback), eşit/katkıya orantılı dağıtım, `points_credited` ile anti-fraud görünürlüğü ve bildirim. **Seçenek B:** Dağıtım yapılmayacaksa sandığı "Klan XP'si / klan seviyesi" olarak yeniden adlandırın ve yalnızca kozmetik kilit açsın. Hangisi seçilirse seçilsin, oranlar UI'da tek bir sabit kaynaktan (`lib/squad-economy.ts`) okunmalı. Böylece metin ile kod bir daha ayrışmaz.
- **Efor:** L

### 3. Admin "dondurma" müşteri katılım/oluşturma akışını engellemiyor
- **Önem:** yüksek · **Kategori:** bozuk / yetki
- **Kanıt:** Admin yazar `squad.isFrozen` (`app/api/admin/squads/route.ts:87-90`); müşteri uçları `settings.admin_frozen_squads` okur (`app/api/customer/squads/join/route.ts:11,196-208`, `route.ts:11,44-52`); bu anahtarı yazan kod yok (repo grep). Yalnızca `challenge/route.ts:77` doğru alanı kullanıyor.
- **Sorun:** Moderasyon amacıyla dondurulan klana herkes katılmaya devam edebiliyor. Dondurulmuş klandaki üye de yeni klan kurabiliyor. Ayrıca dondurulmuş klanın kendisi meydan okuyabiliyor, çünkü yalnızca hedefin `isFrozen` alanına bakılıyor. Bu iki kaynaklı "doğruluk" mimari bir borç.
- **Öneri:** `settings.admin_frozen_squads` okumalarını kaldırın ve tek kaynak olarak `Squad.isFrozen` kullanın. Kontrolü `assertSquadNotFrozen(squad)` yardımcısına toplayın; join, create, challenge (hem `mySquad` hem `target`) ve respond akışlarında çağırın. Sayfada dondurulmuş klan için "Klanın geçici olarak askıya alındı" bandı gösterin.
- **Efor:** S

### 4. Meydan okuma ödül havuzunun kendi bakiyeden düşüleceği söylenmiyor; riskler asimetrik
- **Önem:** yüksek · **Kategori:** UX / ekonomi tasarımı
- **Kanıt:** UI `squad-battle-panel.tsx:57` (varsayılan `'500'`), `:159` ("Rakip klanı, ödül havuzunu ve süreyi seç"), `:180`; sunucu `challenge/route.ts:116-118` (`debitPoints` kurucunun kişisel bakiyesinden).
- **Sorun:** Kurucu, varsayılan olarak 500 puanın kendi cüzdanından escrow'a alınacağını bilmeden "Meydan Oku"ya basabilir. Bakiye gösterilmiyor; yetersizse ancak sunucu hatasıyla öğreniyor. Ayrıca yalnızca meydan okuyan risk alıyor. Kabul eden taraf hiçbir şey koymuyor, rakip için reddetmenin hiçbir anlamı kalmıyor. Kazanırsa havuzun tamamı kendi üyelerine gidiyor. Bu dengesizlik oyun teorisi açısından meydan okumayı cezalandırıyor.
- **Öneri:** Dialog'u iki adımlı bir "bahis fişi" yapın: güncel bakiye, havuz kaydırıcısı (0, 100, 250, 500, bakiye sınırlı), "Bu puan bakiyenden şimdi düşülür; ret/süre dolumu/beraberlikte iade edilir" açıklaması ve onay adımı. Ekonomiyi simetrik yapın: kabul eden kurucu da eşit tutarı escrow'a koysun (`respond` accept transaction'ında `debitPoints`). Kazanan iki havuzun toplamını alsın. `rewardFunded` mantığı iki tarafa genişletilsin (`squad1Stake/squad2Stake`). Alternatif olarak puan koymadan "onur savaşı" modu ve platform tarafından finanse edilen haftalık resmi turnuvalar sunulabilir.
- **Efor:** M

### 5. "10 Üye" sınırı uygulanmıyor; üyelik yarış koşuluyla çift klana girilebilir
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / hile
- **Kanıt:** `page.tsx:91` ("/ 10 Üye"); `join/route.ts:212-236` (sınır yok; `findFirst` + `create` transaction dışında); `schema.prisma:434` (`@@unique([userId, squadId])`, `userId` tek başına unique değil).
- **Sorun:** (a) Bir klan sınırsız üye alabilir. Bu savaş skorunu doğrudan şişirir; bir kişi birkaç hesapla klanını büyütebilir. (b) Aynı kullanıcı iki farklı klana eşzamanlı join/create istekleriyle girebilir. Bundan sonra tüm akışlar `findFirst` ile rastgele birini seçer (`gamification-engine.ts:148,180`; `battles/current/route.ts:23`), tutarsız sandık/skor oluşur.
- **Öneri:** `SquadMember.userId` alanına `@unique` ekleyin. "Bir kullanıcı tek klan" kuralı DB seviyesinde garanti altına alınsın; P2002'yi kullanıcı dostu mesaja çevirin. Kapasiteyi `Squad.maxMembers` (varsayılan 10) olarak şemaya taşıyın. Join'i transaction içinde `SELECT ... FOR UPDATE` ya da `count` + koşullu insert ile yapın. Dolu klanda "Klan dolu" mesajı verin. UI'daki "/10" bu alandan gelsin.
- **Efor:** M

### 6. Savaş ortasında klan değiştirme ve sonradan katılanlar ödül alabilir
- **Önem:** orta · **Kategori:** ekonomi / hile
- **Kanıt:** Katılım kilidi yok (`join/route.ts`); `addToActiveBattleScore` katılımcıyı kendiliğinden oluşturur ve skoru *şimdiki* klana yazar, katılımcı satırının `squadId`'si ise ilk kayıttan kalır (`gamification-engine.ts:201-213`); ödeme `participants.filter(p => p.squadId === winnerId)` (`gamification-engine.ts:51`).
- **Sorun:** Bir kullanıcı kazanan taraftaki klana savaşın son dakikasında katılıp ödülden pay alabilir. Bir klanda katılımcı olduktan sonra rakip klana geçerse puanı rakibin skoruna yazılır ama ödemede eski klanının katılımcısı sayılır.
- **Öneri:** Kabul anında katılımcı listesini dondurun (`respond` zaten oluşturuyor, `respond/route.ts:130-156`). `addToActiveBattleScore` yalnızca mevcut katılımcı satırı varsa ve `squadId` eşleşiyorsa skor yazsın, satır oluşturmasın. Aktif savaştaki klandan ayrılma ve o klana katılma "savaş bitince" kuyruğuna alınsın ya da engellensin.
- **Efor:** S

### 7. Süresi dolmuş savaş "CANLI" görünür ve yeni meydan okumayı bloke eder
- **Önem:** orta · **Kategori:** doğruluk / zamanlama
- **Kanıt:** `battles/current/route.ts:36-41` (`endTime` filtresi yok); sonlandırma yalnızca cron'da: `vercel.json` günde 1 (`0 3 * * *`) + Inngest `*/10` (`lib/inngest/functions.ts:216-224`; Inngest'in canlıda aktif olduğu **doğrulanmadı**); çakışma kontrolü `challenge/route.ts:101-113`.
- **Sorun:** Skor yazımı `endTime > now` ile durur (`gamification-engine.ts:190`) ama panel savaşı "CANLI SAVAŞ" diye göstermeye devam eder. Polling de boşuna sürer. Sonuç gecikir ve yeni meydan okumalar 409 alır. Inngest aktif değilse bu durum 24 saate kadar uzayabilir.
- **Öneri:** `current` uç noktası `endTime <= now` olan aktif savaşı "sonuçlanıyor" durumunda döndürsün ve isteğe bağlı olarak `finishSquadBattle(id)` çağırsın; fonksiyon claim tabanlı ve idempotent, güvenli. Böylece sonuç cron'u beklemeden okumada kesinleşir. Çakışma kontrolü de `endTime > now` koşulunu içersin.
- **Efor:** S

### 8. Sahte/yanıltıcı sayılar: "+X Katkı", "XP" etiketleri, "Aktif", "Sezon 1", "Lv."
- **Önem:** orta · **Kategori:** sahte veri
- **Kanıt:** `page.tsx:142-143,166`; `squad-leaderboard.tsx:36-38,85-87,96-97`; `page.tsx:73`; kullanıcıda ayrı `xp` alanı var (`schema.prisma:47-49`).
- **Sorun:** Üye satırındaki "Katkı", kişinin ömür boyu harcanabilir bakiyesinin %5'i; gerçek katkıyla ilgisi yok. Bakiye ve klan toplamı "XP" diye etiketleniyor, oysa sistemde XP ayrı bir alan. "Aktif" ve "Sezon 1" sabit metin. Klan seviyesi hiçbir şeyi açmıyor. Ayrıca her üyenin bakiyesi diğer üyelere açık; bu küçük bir mahremiyet sızıntısı.
- **Öneri:** Gerçek katkı defteri tutun: `SquadContribution { squadId, userId, periodStart, points, feedbackCount }`. `addToSquadTreasury` ve `addToActiveBattleScore` aynı transaction'da buraya yazsın. Klan içi tablo "bu hafta / bu ay klana katkı"ya göre sıralansın. Etiketler "puan" ve "XP" diye doğru ayrılsın. Sezon gerçek bir `Season` modeline bağlanacaksa bağlansın, değilse kaldırılsın. "Aktif", son 7 günde etkinliği olan üye sayısından türetilsin. Bakiye yerine katkı gösterilsin.
- **Efor:** M

### 9. Hata mesajlarında TR/EN karışıklığı; aynı ad → 500
- **Önem:** orta · **Kategori:** dil / hata yönetimi
- **Kanıt:** `route.ts:31,56,69,100`; `join/route.ts:180,192,221,226`; `[id]/leave/route.ts:286`; `schema.prisma:401` (`name @unique`); istemci bu mesajları olduğu gibi toast'lıyor (`squad-interactive.tsx:38,65,179`).
- **Sorun:** Türk kullanıcı "You must leave your current squad first", "Invalid invite code", aynı adda klan kurmaya çalışınca da "Internal Server Error" görüyor. Sayfa i18n katmanını hiç kullanmıyor.
- **Öneri:** API'ler hata *kodu* döndürsün (`SQUAD_NAME_TAKEN`, `INVITE_INVALID`, `ALREADY_IN_SQUAD`, `SQUAD_FULL`, `SQUAD_FROZEN`). İstemci bunları `messages/{tr,en}.json` üzerinden çevirsin. P2002 409 + `SQUAD_NAME_TAKEN`'a eşlensin. Ad girerken müsaitlik kontrolü (debounce'lu GET) yapılsın. Sayfa metinleri `t()`'ye taşınsın.
- **Efor:** M

### 10. Savaş deneyimi yarım: geri sayım, katkıcılar, sonuç, geçmiş ve geri çekme yok
- **Önem:** orta · **Kategori:** eksik özellik / UX
- **Kanıt:** `squad-battle-panel.tsx:241-277` (yalnızca iki sayı + "VS"); `endTime` render edilmiyor; `battles/[id]/route.ts` müşteri UI'ında kullanılmıyor; challenger iptal uç noktası yok.
- **Sorun:** Savaş, ürünün en heyecanlı anı olması gerekirken statik bir skor kutusu. Ne kadar süre kaldığı, kimin taşıdığı, bitince kimin kazandığı sayfada görülmüyor.
- **Öneri:** Panel bir "savaş kartı"na dönüşsün: canlı geri sayım (`endTime`), iki klanın oransal ilerleme çubuğu (tug-of-war), `battles/[id]` uç noktasından ilk 5 katkıcı ve "Senin katkın: X". Bitişte bir kerelik sonuç ekranı gösterilsin (kazanan, pay, iade). Geçmiş için `GET /api/customer/squads/battles?status=completed` eklensin. Bekleyen davette challenger'a "Geri çek" (`DELETE` + atomik iade) verilsin. Polling `document.visibilityState` ile duraklatılsın ya da SSE/Redis pub-sub ile değiştirilsin.
- **Efor:** L

### 11. Sosyal büyüme döngüsü yok: davet kopyalama/paylaşma, derin link, klan keşfi
- **Önem:** orta · **Kategori:** eksik özellik / büyüme
- **Kanıt:** `page.tsx:7` (`Copy` import'u kullanılmıyor), `:101-104` (yalnızca `select-all`); boş durumda keşif yok (`page.tsx:49-64`) ama `allSquads` yine de sorgulanıyor (`:39-43`).
- **Sorun:** Klan büyümesi davetle olur. Mobilde kodu seçip kopyalamak zahmetli; paylaşım sayfası ve `?join=CODE` derin linki yok. Klansız kullanıcı da katılabileceği klanları göremiyor.
- **Öneri:** `navigator.share` + panoya kopyalama (sonner geri bildirimiyle), `/customer/squads?join=AB12C3` derin linki (oturum yoksa signin sonrası geri dönsün, dialog önceden dolu açılsın) ve QR davet kartı (sayfada qrcode zaten var). Boş durumda "Önerilen klanlar" (yakın mekân/aynı şehir, dolu olmayan, aktif) ve global sıralama. Kurucuya "kodu yenile" seçeneği. Mevcut referral modülüyle entegrasyon: davetle gelen yeni kullanıcı hem referral hem klan katılımı saysın.
- **Efor:** M

### 12. Haftalık ekip hedefi dekoratif: sabit 5, ödülsüz, ölü alanlar
- **Önem:** düşük · **Kategori:** kısmi özellik
- **Kanıt:** `weekly-goal/route.ts:52` (`weeklyTeamTarget` varsayılan 5, `schema.prisma:407`); yazan kod yok; `weeklyTeamProgress`/`weeklyGoalResetAt` hiç kullanılmıyor; `squad-weekly-goal.tsx:23-40` `catch` yok.
- **Sorun:** 10 kişilik bir klan için de hedef 5. Tamamlanınca hiçbir şey olmuyor (rozet, sandık bonusu, kutlama yok). Kullanıcının katılımdan önceki feedback'leri de sayılıyor.
- **Öneri:** Hedefi üye sayısına göre ölçeklendirin (ör. `max(5, members*2)`). Kurucuya 3 kademe seçtirin. Tamamlanınca bir kerelik atomik ödül verin (`weeklyGoalClaimedFor` claim alanı, `points_credited`) ve kutlama gösterin. Ölü alanları ya kullanın ya şemadan kaldırın. Fetch'e `catch` ve hata durumu ekleyin. Sayım `joinedAt`'ten sonrasıyla sınırlansın.
- **Efor:** M

### 13. Erişilebilirlik ve mobil kusurları
- **Önem:** düşük · **Kategori:** a11y / mobil
- **Kanıt:** `squad-interactive.tsx:77-80,93-96` (tıklanabilir `Card` div + içinde `pointer-events-none` Button); `:118,142` `<label>` `htmlFor` yok; `squad-battle-panel.tsx:164,180,189` `Label` bağlanmamış; `:246` `animate-pulse` (`motion-safe:` yok); `:140` mobilde sarmayan satır; `squad-interactive.tsx:167` native `confirm()`.
- **Sorun:** Ekran okuyucu input'ları etiketsiz okur. Kart semantiği belirsiz. Yanıp sönen rozet hareket hassasiyeti tercihini yok sayar. 400px'te savaş CTA'sı metni sıkıştırır. Native confirm, tasarım diliyle uyumsuz ve tehlikeli aksiyonun sonucunu (klan silinir) anlatmıyor.
- **Öneri:** Kartları `<button>` ya da `role="button"` + `tabIndex` + `onKeyDown` yapın veya yalnız iç butonu etkileşimli bırakın. `id`/`htmlFor` bağlayın. `motion-safe:animate-pulse` kullanın. CTA satırına `flex-col sm:flex-row` verin. Ayrılma için shadcn `AlertDialog` kullanın; kurucuysa "Klanın N üyesiyle birlikte dağıtılacak" ya da devir seçeneği gösterin.
- **Efor:** S

### 14. Ölü kod ve küçük temizlik
- **Önem:** düşük · **Kategori:** kod kalitesi
- **Kanıt:** Kullanılmayan import'lar `Users, Plus, Copy, Button` (`page.tsx:6-7`); ölü `logo` prop'u (`squad-leaderboard.tsx:15,66-70`); `squad-interactive.tsx:169` eski yorum ("leave endpoint later"); `squad-leaderboard.tsx:23` tekrar sıralama (sunucu zaten `totalPoints desc` getiriyor); `join/route.ts:238` boş yorum; yazım: "Klan&apos;a" (`page.tsx:56`, doğrusu "Klana"), "üyelereeşit" (`page.tsx:180`); `catch (err: any)` (`cron/squad-battles/route.ts:65,87`).
- **Öneri:** Temizlik PR'ı açın. Sandık/oran sabitleri tek modüle taşınırken bu satırlar da düzeltilsin.
- **Efor:** S

### 15. Performans: boş durumda gereksiz sorgu, şelale fetch, gizli sekmede polling
- **Önem:** düşük · **Kategori:** performans
- **Kanıt:** `page.tsx:22-44` (klansız kullanıcıda da top-10 sorgusu); istemci tarafı iki ek fetch (`squad-battle-panel.tsx:62`, `squad-weekly-goal.tsx:25`) ilk SSR'dan sonra başlıyor; `squad-battle-panel.tsx:77-81` görünürlükten bağımsız 15 sn polling; top-10 sorgusu önbelleksiz.
- **Öneri:** Top-10 global sıralamayı Upstash cache'e alın (60 sn TTL, savaş bitişinde/katılımda invalidate). Haftalık hedef ve güncel savaşı sunucuda ilk render'a gömün (prop olarak `initialBattle`, `initialGoal`); istemci yalnızca canlı güncelleme yapsın. Polling `visibilitychange` ile duraklatılsın.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Klan kimliği:** logo/amblem seçici, renk, kısa açıklama/slogan (Duolingo kulüpleri, oyun klanları). `Squad.description` şemada var ama kullanılmıyor.
2. **Aktivite akışı + tepkiler:** "Ayşe az önce Kahve Dünyası'nda QR okuttu +40", alkış/emoji tepkisi, kurucu duyurusu (Duolingo Friends Quest, Strava kulüp akışı).
3. **Ortak görev (co-op quest):** "Bu hafta klanca 20 farklı mekân", tamamlanınca herkese ödül ve kutu; Duolingo Friends Quest'in doğrudan karşılığı.
4. **Sezonlu klan ligi:** terfi/düşme, sezon sonu "Klan Wrapped" özeti (Spotify Wrapped tarzı: en çok gidilen mekân, MVP üye, kazanılan savaşlar).
5. **Yönetim araçları:** sahiplik devri, üye çıkarma, davet kodu yenileme, katılım onayı (açık/kapalı klan), rol (yardımcı kurucu).
6. **Davet/paylaşım döngüsü:** tek dokunuşla paylaş, derin link, QR davet kartı, referral ile birleşik ödül (Revolut/Monzo davet hissi).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Klanım benim ikinci ana sayfam." Kullanıcı açtığında üç soruya 2 saniyede cevap almalı: *Klanım bu hafta nasıl gidiyor? Benim katkım ne? Şu an yapabileceğim en değerli şey ne?* Sayfa bir ayarlar ekranı değil, canlı bir takım odası olmalı.

**Yerleşim (mobil öncelikli, tek sütun → masaüstünde 8/4):**
1. **Klan kimlik başlığı:** amblem + ad + kademe (lig) + üye avatar yığını (`5/10`, gerçek kapasite) + "Davet et" birincil butonu (paylaş sayfası). Ayarlar ikonu yalnızca kurucuda (devir, çıkarma, kod yenileme, dağıt).
2. **"Bu hafta" kartı (ana odak):** ortak hedef halkası (ölçeklenmiş hedef + ödül önizlemesi) + "Senin katkın: X / klan sırası #2" + tek CTA ("QR okut" → `/customer/scan`).
3. **Savaş kartı (duruma göre):** yoksa kurucuya "Rakip bul" (önerilen eşit güçte klanlar), üyeye "Kurucuna meydan okumasını öner". Pending'de iki tarafın stake'i ve geri sayım. Active'de tug-of-war çubuğu, geri sayım, ilk 5 katkıcı. Biten savaşta bir kerelik sonuç anı.
4. **Klan içi tablo (katkıya göre, haftalık/aylık sekme):** gerçek `SquadContribution` verisi, bakiye gösterilmez.
5. **Sandık:** gerçek dağıtım tarihi ("12 gün sonra ~140 puan / kişi tahmini") ya da Seçenek B'de klan XP çubuğu.
6. **Aktivite akışı** ve en altta **global lig** (kendi klanının konumu sabitlenmiş, top-10 dışındaysa "… #47 Senin klanın").

**Motion/3D (ölçülü):**
- Savaş tug-of-war çubuğunda skor değişince `m.div` layout spring (≈300 ms), skor rakamında sayaç animasyonu. Polling'le gelen değişim burada hissedilsin, sürekli yanıp sönme olmasın.
- Haftalık hedef tamamlanınca ve savaş kazanılınca **bir kerelik** konfeti (`lib/effects/confetti` zaten var). Mevcut imza ödül kutusu 3B bileşeni yalnızca ödül *talep* anında kullanılsın; sayfanın kalıcı parçası olmasın, maliyet ve odak açısından gereksiz.
- Tüm hareketler global `MotionConfig reducedMotion="user"`'a uysun; Tailwind animasyonları `motion-safe:` önekiyle.
- 3B klan amblemi **önerilmez**; rozet ekranındaki 3B dil ile çakışır ve bu sayfanın değeri sosyal/veri tarafında.

**Veri/API değişiklikleri:**
- Şema: `SquadMember.userId @unique`, `Squad.maxMembers`, `Squad.emblem/color`, `Squad.lastTreasuryPayoutAt`, `SquadContribution`, `SquadBattle.squad1Stake/squad2Stake`, `Squad.weeklyGoalClaimedFor`. `SquadBattle` FK'ları `Restrict`. Ölü `weeklyTeamProgress/weeklyGoalResetAt` ya kullanılmalı ya kaldırılmalı.
- Servis katmanı `lib/squads/`: `joinSquad`, `leaveSquad` (devir), `dissolveSquad` (iade ile), `assertSquadNotFrozen`, `recordContribution`, `payoutTreasury`, `claimWeeklyGoal`. Hepsi transaction + claim deseniyle, para hareketi `points_credited` ile.
- Uçlar: `GET /api/customer/squads/overview` (başlık + hafta + savaş + katkı tek çağrıda, SSR'da da kullanılır), `GET /battles?status=completed`, `DELETE /battles/:id` (geri çek), `POST /:id/transfer`, `POST /:id/kick`, `POST /:id/regenerate-code`, `GET /suggestions`.
- Hata kodları + i18n; top-10 global sıralama Upstash cache; sandık dağıtımı `app/api/cron/daily` orkestratörüne eklenecek alt görev ("tek uyanış" kuralına uygun).

---

## Çakışmalar / birleştirme önerisi

- **`/customer/ekip` ile ad çakışması:** Menü etiketi "Ekipler & Klanlar" (`messages/tr.json:2593`, `lib/visibility-controls.ts:95`), kartta "Haftalık ekip hedefi" (`squad-weekly-goal.tsx:64`) geçiyor; `/customer/ekip` ise tamamen farklı bir modül, iç ekip görev yönetimi (`app/customer/ekip/page.tsx`). Tüketici tarafında "Ekip" kelimesi bırakılmalı, bu modül tutarlı biçimde **"Klan"** diye adlandırılmalı. Menü etiketi "Klanım" ya da "Klanlar" olmalı.
- **`/customer/leaderboard` ve `/customer/category-leaderboard`:** Global klan sıralaması bu sayfanın içinde gömülü; `messages/en.json:76` liderlik sayfasının "squads" sıralamasını da kapsadığını söylüyor ama liderlik sayfası klan sekmesi içermiyor (grep: `app/customer/leaderboard` içinde "squad/klan" yok). Öneri: global klan ligi `/customer/leaderboard` içinde bir "Klanlar" sekmesine taşınsın. Bu sayfada yalnızca "kendi klanının konumu" özeti ve oraya link kalsın.
- **`/customer/quests` / turnuva / referral:** Ortak görev ve davet döngüsü yeniden tasarımda bu modüllerin altyapısını yeniden kullanmalı (görev motoru, referral kademesi). Ayrı bir klan görevi motoru yazılmamalı.
- **Kaldırma önerilmez:** Savaş/escrow çekirdeği sağlam ve modül admin panelinde yönetiliyor (`app/admin/squads`). Doğru karar, bulgu 1-5'i kapatıp sayfayı "takım odası" olarak yeniden tasarlamak.

---

## Doğrulama (şüpheci inceleme)

Salt okunur inceleme; kod ve veritabanına dokunulmadı. Not: iddialardaki satır numaraları mevcut çalışma ağacıyla uyuşmuyor (ör. `leave/route.ts` 63 satır, iddia 291-295 diyor). İçerik doğru olduğu için aşağıda güncel satırlar verildi.

### 1. Kurucunun ayrılması klanı ve açık savaşı cascade siliyor; escrow iadesiz yok oluyor: **DOĞRULANDI** (Kritik/Yüksek)
- `app/api/customer/squads/[id]/leave/route.ts:39-43`: kurucu ayrılınca koşulsuz `prisma.squad.delete`. Açık savaş, escrow ya da devir kontrolü yok.
- `prisma/schema.prisma:464-465`: `SquadBattle.squad1/squad2` için `onDelete: Cascade`. `:484-485`: katılımcılar da cascade ile siliniyor.
- Escrow, `challenge/route.ts:116-118` içinde `debitPoints` ile tahsil ediliyor. İade yalnızca üç yolda var: ret (`battles/[id]/respond/route.ts:84-92`), cron süre dolumu (`app/api/cron/squad-battles/route.ts:77-79`) ve sonlandırma (`lib/gamification-engine.ts:101-115`). Üçü de savaş satırının **var olmasını** gerektiriyor. Satır silinince iade edecek kayıt kalmıyor.
- **Yeniden üretim:** A klanının kurucusu (bakiye 1000) B'ye `rewardPool=1000` ile meydan okuyor; A'nın bakiyesi 0'a düşüyor ve savaş `pending` durumunda. B'nin kurucusu kabul ya da ret etmek yerine sayfadaki "Klandan Ayrıl" butonuna basıyor (`components/customer/squad-interactive.tsx:171`). B klanı ve savaş satırı silindiği için A'nın 1000 puanı kalıcı olarak yok oluyor. Aynı durum `active` savaşta ve A'nın kurucusu kendi klanını sildiğinde de geçerli. Ayrıca kullanıcı hesabı silindiğinde de (`Squad.owner onDelete: Cascade`, `schema.prisma:415`) aynı zincir çalışıyor.
- **Öneri:** `leaveSquad`/`dissolveSquad` adında bir servis yazılmalı. Bu servis tek transaction içinde açık (`pending`/`active`) savaşları claim deseniyle `cancelled` durumuna almalı ve `rewardFunded && !rewardRefunded` havuzunu `challengedById`'ye `points_credited` ile iade etmeli. Ardından ya kurucuyu en kıdemli üyeye devretmeli ya da klanı silmeli. Şemada `SquadBattle` FK'ları `onDelete: Restrict` (ya da soft-delete) yapılmalı ki iade yapılmadan silme veritabanı seviyesinde de engellensin.

### 2. Admin dondurması müşteri join/create akışında etkisiz: **DOĞRULANDI** (Yüksek, yönetim kontrolü işlevsiz)
- Admin dondurması yalnızca `Squad.isFrozen` alanını yazıyor (`app/api/admin/squads/route.ts:86-90`).
- Join (`join/route.ts:11,47-59`) ve create (`squads/route.ts:11,44-52,61-67`) ise `settings` tablosundaki `admin_frozen_squads` anahtarını okuyor. Repo genelinde (`app`, `lib`, `scripts`) bu anahtarı yazan **hiçbir kod yok**, yani `frozenIds` her zaman `[]`.
- `challenge/route.ts:77` yalnızca **hedef** klanın `isFrozen` değerine bakıyor; meydan okuyan klanın donmuşluğu kontrol edilmiyor. `respond/route.ts` kabul akışında da donmuşluk kontrolü yok.
- **Yeniden üretim:** Admin X klanını "Soft Freeze" yapıyor. Herhangi bir müşteri X'in davet koduyla `POST /api/customer/squads/join` çağırınca 200 alıyor ve klana katılıyor. X'in kurucusu başka bir klana meydan okuyabiliyor. Ayrıca X dondurulmuşken X'e yöneltilmiş eski bir `pending` meydan okumayı kabul edebiliyor.
- **Öneri:** Tek kaynak `Squad.isFrozen` olmalı. `assertSquadNotFrozen(squadId, tx)` yardımcısı join, create (mevcut üyelik), challenge (her iki taraf), respond/accept ve leave/dissolve akışlarında transaction içinde çağrılmalı. Ölü `admin_frozen_squads` okumaları kaldırılmalı.

### 3. Üyelik TOCTOU: eşzamanlı isteklerle iki klana girilebiliyor; üye sınırı yok: **DOĞRULANDI** (Orta; iddia edilen "Kritik" seviyesi abartılı)
- `join/route.ts:64-87`: `findFirst` ile üyelik kontrolü ve `create` transaction dışında yapılıyor. `schema.prisma:434` yalnızca `@@unique([userId, squadId])` tanımlıyor; `userId` tek başına unique değil. Create akışında da (`squads/route.ts:36-90`) aynı desen var; eşzamanlı create ile join da çift üyelik üretir.
- **Yeniden üretim:** Kullanıcı A ve B kodlarıyla iki `POST /join` isteğini aynı anda gönderiyor. İkisi de `existingMembership=null` okuyor ve iki `SquadMember` satırı oluşuyor. Bundan sonra `GET /squads` (`:120`), `addToSquadTreasury` (`gamification-engine.ts:148`) ve `addToActiveBattleScore` (`:180`) `orderBy` olmadan `findFirst` kullanıyor. Sonuç olarak sandık payı ve savaş skoru hangi klana gideceği belirsiz bir şekilde dağılıyor; leave yalnızca URL'deki klandan çıkarıyor.
- Üye sınırı: sayfa `{n} / 10 Üye` gösteriyor (`app/customer/squads/page.tsx:91`). Ancak join akışında sınır kontrolü yok ve repoda `maxMembers` alanı da yok. UI vaadi yalan ve klanlar sınırsız büyüyebiliyor.
- **Ciddiyet notu:** Yarış yalnızca kullanıcının kendi hesabıyla tetiklenebiliyor ve başka bir kullanıcıya doğrudan puan kaybı yaşatmıyor. "Savaş skorunu şişirme" de her üyenin kendi günlük tavanına tabi meşru kazancı; büyük klan avantajı bir istismardan çok tasarım eksiği. Bu yüzden seviye orta.
- **Öneri:** `SquadMember.userId @unique` (önce mevcut çift kayıtlar temizlenmeli) ve `Squad.maxMembers` eklenmeli. Join akışı tek transaction içinde yapılmalı: üye sayısı `count` ile ya da `SELECT ... FOR UPDATE` ile kilitlenip kontrol edilmeli; P2002 hatası "zaten bir klandasın" mesajına çevrilmeli.

### 4. Savaş ortasında klan değiştirme ile ödül/skor istismarı: **DOĞRULANDI** (Yüksek)
- Kabulde her iki klanın tüm üyeleri katılımcı olarak ekleniyor, skoru 0 olanlar dahil (`respond/route.ts:130-155`).
- `leave/route.ts:44-48` üyeyi savaş kontrolü yapmadan çıkarıyor; katılımcı satırı ise kalıyor (cascade yalnızca savaş, klan ya da kullanıcı silinirse çalışıyor).
- `addToActiveBattleScore` skoru **şimdiki** üyeliğe göre klan tarafına yazıyor (`gamification-engine.ts:180-213`). Ancak `upsert.update` yalnızca `score` değerini artırıyor; katılımcının eski `squadId` değeri korunuyor (`:201-205`).
- Ödeme `participant.squadId === winnerId` üzerinden yapılıyor (`:51`) ve skor şartı yok.
- **Yeniden üretim (a):** U, A vs B savaşında A üyesi (katılımcı satırı squadId=A). U, A'dan ayrılıp B'ye katılıyor, puan kazanıyor ve B'nin skoru artıyor. A yine de kazanırsa U, A katılımcısı olarak havuzdan pay alıyor. Yani karşı tarafa oynayıp kendi eski tarafından ödül alabiliyor.
- **Yeniden üretim (b):** Önde olan klana savaşın son dakikasında katılan biri tek bir geri bildirimle katılımcı satırı açıyor (squadId=şimdiki klan) ve sabit havuzdan eşit pay alıyor. Bu, savaşı fiilen kazanan üyelerin payını sulandırıyor. Puan "yoktan basılmıyor" (havuz escrow), ama dağıtım hatalı ve istismar edilebilir.
- **Öneri:** Kadro savaş başında dondurulmalı. `addToActiveBattleScore` yalnızca katılımcı tablosunda **aynı squadId** ile bulunan kullanıcıya skor yazmalı (yeni satırı yalnızca kabulden önce üye olanlara açmalı ya da `joinedAt <= acceptedAt` şartı aranmalı). Aktif savaştaki klandan ayrılma ya engellenmeli ya da ayrılan kullanıcının katılımcı satırı `forfeited` diye işaretlenmeli. Ödeme `score > 0` olan ve hâlâ o klanda bulunan katılımcılarla sınırlandırılmalı; daha iyisi skor ağırlıklı dağıtım yapılmalı.


---

## Uygulama (Dalga 2)

**Hedef rota:** `/customer/squads` (Oyna → Klan). Sayfa sunucu bileşeni: oturum + modül kapısı + ilk veri tek `getSquadOverview` ile sunucuda; istemci adası (`components/customer/m-klan/**`) yalnız yeniler. Yeni sunucu katmanı `lib/squads/` (`rules` tek kaynak, `membership`, `goal`, `battles`, `overview`, `errors`, `dto`). Bütün uçlar `defineRoute` (rol `CUSTOMER`, `module: 'squads'`, zod, rate limit, zarf v2, kodlu Türkçe hatalar). Testler: `__tests__/lib/squads-service.test.ts` (yeni), `squad-battle-score.test.ts` (kadro kilidi), `squad-battle-service.test.ts` (ayrılınca pay kaybı).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Oturum + rol koruması | ÇALIŞIYOR | Girişe `callbackUrl` ile (davet derin linki korunur). |
| 2 | Sayfa modül kapısı | ÇALIŞIYOR | `getModuleControls().squads === false` → dürüst boş durum; uçlar `MODULE_DISABLED`. |
| 3 | "%5 ekstra pasif puan" vaadi | KALDIRILDI | Gerçek değildi. Yerine `rules`'tan üretilen doğru vaatler (haftalık ödül aralığı, savaş, %10 klan gücü). |
| 4 | Klan oluştur → diyalog | ÇALIŞIYOR | `<form>`, `label`/`htmlFor`, gecikmeli ad müsaitlik kontrolü. |
| 5 | Klan adı doğrulama | ÇALIŞIYOR | Sunucu ve istemci aynı `squadNameSchema`: trim, 3–30, karakter kümesi, kaba dil süzgeci. |
| 6 | Klan oluşturma API | ÇALIŞIYOR | Kullanıcı satırı kilidi; aynı ad (harf duyarsız) 409 `SQUAD_NAME_TAKEN`; kod çakışmasında yeniden dener; kriptografik rastgele kod. |
| 7 | Katıl → diyalog | ÇALIŞIYOR | |
| 8 | Davet kodu girişi | ÇALIŞIYOR | Normalleştirme; `?join=KOD` ile dolu açılır. |
| 9 | Katılma API | ÇALIŞIYOR | Tek tx: `User` + `Squad` `FOR UPDATE`, dondurma, mevcut üyelik, kapasite 10; lidere bildirim; sıkı rate limit. |
| 10 | Enter ile gönderim | ÇALIŞIYOR | |
| 11 | Boş durumda keşif / global sıralama | ÇALIŞIYOR | Gerçek lig (keşif modu) + "kodu bir üyeden iste" notu. Açık katılım için ŞEMA İSTEĞİ (aşağıda). |
| 12 | Lidere "Meydan oku" | ÇALIŞIYOR | Üç adımlı meydan okuma fişi. |
| 13 | Üyeye savaş bilgisi | ÇALIŞIYOR | `return null` yerine açıklama. |
| 14 | Rakip seçimi | ÇALIŞIYOR | `GET /search` (ad araması, askıdakiler hariç, açık savaşı olan `busy`). |
| 15 | Ödül havuzu girişi | ÇALIŞIYOR | Varsayılan 0 (onur savaşı), bakiye görünür, bakiye üstü seçenekler kapalı, "şimdi düşülür / iade koşulları" metni. |
| 16 | Süre girişi | ÇALIŞIYOR | Çipler; Türkçe zod mesajları. |
| 17 | Meydan okuma gönderimi | ÇALIŞIYOR | Bildirim aynı tx'te; iki klan kimlik sırasıyla kilitlenir; `Idempotency-Key`; süresi dolanlar çakışma sayılmaz. |
| 18 | Bekleyen görünüm | ÇALIŞIYOR | Geri sayım + havuz + koşullar. |
| 19 | Kabul / Ret | ÇALIŞIYOR | Onay diyaloğu; kadro tx içinde; iki tarafın dondurması; süresi dolmuş davet reddedilir; iki kadroya bildirim. |
| 20 | Meydan okumayı geri çekme | ÇALIŞIYOR | `POST /battles/[id]/withdraw` → iadeli soft-cancel. |
| 21 | Canlı skor yoklaması | ÇALIŞIYOR | Yalnız açık savaşta ve sekme görünürken 15 sn; süresi dolan savaş okumada kapanır (Bulgu 7). |
| 22 | Geri sayım | ÇALIŞIYOR | `CountdownChip`; bitince tazeler. |
| 23 | Katkı verenler | ÇALIŞIYOR | İlk 6 + "senin katkın" / "kadroda değilsin". |
| 24 | Sonuç ekranı / geçmiş | ÇALIŞIYOR | 72 saat sonuç kartı (zaferde tek seferlik konfeti), sana yapılan ödeme defterden; `GET /battles` imleçli geçmiş. |
| 25 | "X / 10 üye" | ÇALIŞIYOR | `SQUAD_MAX_MEMBERS` sunucuda uygulanıyor. |
| 26 | Klan adı başlığı | ÇALIŞIYOR | Kimlik başlığı (amblem, slogan, seviye, kapasite, lig sırası). |
| 27 | "%5 havuza yansır" metni | KALDIRILDI | Gerçek oran (%10) `SQUAD_POWER_SHARE`'den okunuyor. |
| 28 | Davet kodu gösterimi | ÇALIŞIYOR | |
| 29 | Kopyala / paylaş / derin link | ÇALIŞIYOR | Pano, Web Share, `?join=` bağlantısı, QR (lazy `qrcode`). |
| 30 | Klandan ayrıl | ÇALIŞIYOR | `ConfirmAction` etki önizlemesi (devir / kapanış / savaş payı); aktif savaşta ayrılan kadrodan düşer. |
| 31 | Lider yönetimi | ÇALIŞIYOR | Devir, üye çıkarma (aktif savaşta kilitli), kod yenileme, ad/slogan, hedef kademesi; hepsi AuditLog'da. |
| 32 | Haftalık ekip hedefi | ÇALIŞIYOR | İstanbul haftası, kademe × üye sayısı, katılım sonrası geçerli geri bildirimler, katkı verene haftada bir ödül (`mintPoints`, tek-kez anahtar). |
| 33 | Hedef yükleniyor/hata | ÇALIŞIYOR | Veri SSR'da; `QueryState` hata + tekrar dene. |
| 34 | Klan içi tablo | ÇALIŞIYOR | Bu haftaki gerçek katkıya göre; bakiye gösterilmez. |
| 35 | "Sen" / "Lider" rozetleri | ÇALIŞIYOR | |
| 36 | Avatar + baş harf | ÇALIŞIYOR | |
| 37 | "+X Katkı" (bakiye × %5) | KALDIRILDI | Sahteydi. Yerine haftalık katkı sayısı + aktif savaş skoru. |
| 38 | Global top-10 | ÇALIŞIYOR | Kendi sıran (top-10 dışında da) sabit ve vurgulu; "puan" etiketi; 60 sn Redis önbelleği; askıdakiler hariç. |
| 39 | "Lv. N" | ÇALIŞIYOR | Klan gücünden türetilir, ne olduğu açıkça yazılı (prestij). |
| 40 | Sabit "Aktif" etiketi | KALDIRILDI | Sahte. |
| 41 | "Sezon 1" | KALDIRILDI | Sezon modeli yok (F4.4). |
| 42 | Sıralama stagger animasyonu | KALDIRILDI | Dekordu. Hareket artık durum değişimini anlatıyor: halat çekme yayı, sayaç, ilerleme çubuğu; azaltılmış harekette statik. |
| 43 | Klan logosu (ölü prop) | ÇALIŞIYOR | Kimlikten türeyen renkli monogram amblem (şema gerekmez). Yüklenebilir logo ŞEMA İSTEĞİ. |
| 44 | Klan sandığı bakiyesi | ÇALIŞIYOR | "Klan gücü" olarak dürüst tanım (harcanmaz, dağıtılmaz, seviyeyi belirler); "XP" etiketi kalktı. |
| 45 | "Ay sonunda paylaştırılır" | KALDIRILDI | Dağıtım kodu yoktu (Seçenek B). Gerçek ödül haftalık hedefte. |
| 46 | "Nasıl çalışır?" | ÇALIŞIYOR | Metin kural sabitlerinden üretiliyor; yazım hatası yok. |
| 47 | Hata sınırı | ÇALIŞIYOR | Segment `error.tsx` + bölüm içi `QueryState`. |
| 48 | Savaş paneli layout shift | ÇALIŞIYOR | Savaş ilk render'da sunucudan geliyor. |
| 49 | i18n | ÇALIŞIYOR | TR/EN metin modülü (`m-klan/copy.ts`, `useDsLocale`); API hata kodları istemcide çevriliyor. |
| 50 | Savaş bildirimleri | ÇALIŞIYOR | `data.href` derin link alanı; katılım, çıkarma, devir ve "savaş başladı" (iki kadro) bildirimleri eklendi. |
| 51 | Aktivite akışı / sohbet / tepki | ÇALIŞIYOR (günlük) · KALDIRILDI (sohbet/tepki) | Klan günlüğü gerçek kayıtlardan (üyelik, AuditLog, savaş satırları). Sohbet/tepki için model yok, ŞEMA İSTEĞİ. |
| 52 | Mobil yerleşim | ÇALIŞIYOR | Tek sütun → masaüstünde içerik + 22rem yan sütun; `flex-col sm:flex-row`; dokunma hedefi ≥ 44px. |
| 53 | Dondurulmuş klan engeli | ÇALIŞIYOR | Tek kaynak `Squad.isFrozen`: katılım, iki taraflı meydan okuma, kabul, ödül, düzenleme; sayfada askı bandı. |

**Sayım:** ÇALIŞIYOR 46 (51 yalnız günlük kısmıyla; sohbet/tepki kaldırıldı) · KALDIRILDI 7 (3, 27, 37, 40, 41, 42, 45) · BOZUK/SAHTE/KISMİ/EKSİK 0.

### Kapanan bulgular (15/15)

1. Kurucu ayrılınca escrow kaybı: P0-20 devri korunuyor; ek olarak aktif savaşta ayrılan üye kadrodan düşüyor ve `SQUAD_MEMBER_LEAVE` denetim kaydı yazılıyor.
2. Sandık vaatleri: Seçenek B (dürüst "klan gücü") + gerçek, defterli haftalık hedef ödülü; oranlar tek kaynaktan.
3. Dondurma: ölü `admin_frozen_squads` okumaları kaldırıldı; `Squad.isFrozen` her akışta.
4. Havuzun bakiyeden düşüldüğü söylenmiyordu: fiş, bakiye, varsayılan 0, iade koşulları. (Simetrik bahis ŞEMA İSTEĞİ.)
5. Üye sınırı + TOCTOU: kapasite sunucuda; katıl/kur kullanıcı satırı kilidiyle serileşiyor, klan satırı kilidiyle kapasite yarışı yok.
6. Savaş ortasında klan değiştirme: kadro kabulde (tx içinde) donuyor; `addToActiveBattleScore` yalnız aynı klanın kadro satırına ya da kabulden önce katılmış üyeye yazıyor; ayrılan pay alamıyor; aktif savaşta üye çıkarma kilitli.
7. Süresi dolmuş "CANLI" savaş: okumada claim'li kapanış; çakışma kontrolü `endTime > now`.
8. Sahte sayılar: "+Katkı", "XP", "Aktif", "Sezon 1" kalktı; bakiyeler diğer üyelere gösterilmiyor.
9. TR/EN karışıklığı, aynı ad → 500: kodlu Türkçe hatalar, 409, istemcide yerelleştirme.
10. Savaş deneyimi: geri sayım, halat çekme, katkıcılar, sonuç, geçmiş, geri çekme.
11. Davet döngüsü: kopyala, paylaş, derin link, QR, kod yenileme, lig keşfi.
12. Haftalık hedef: ölçekli, kademeli, ödüllü, İstanbul haftası, hata durumu.
13. Erişilebilirlik/mobil: form semantiği, etiket bağları, `ConfirmAction` (native `confirm` yok), sonsuz nabız yalnız `Ambient` içinde, mobil sarma, `meter`/`progressbar` rolleri.
14. Ölü kod: eski dört bileşen (`components/customer/squad-*.tsx`) silindi; yazım hataları gitti.
15. Performans: klansız kullanıcıda lig önbellekten, şelale fetch yok (SSR ilk veri), gizli sekmede yoklama yok, geçmiş yalnız açılınca yükleniyor.

### Kalan açıklar ve ŞEMA İSTEKLERİ

- **ŞEMA İSTEĞİ:** `SquadMember.userId @unique` (tek klan kuralını DB'de de garanti etmek için; bugün uygulama kilidiyle serileşiyor).
- **ŞEMA İSTEĞİ:** `SquadBattle.squad2Stake` (+ iade/ödeme mantığının iki tarafa genişlemesi): simetrik bahis (Bulgu 4'ün ikinci yarısı).
- **ŞEMA İSTEĞİ:** `Squad.archivedAt` + `SquadBattle` FK `onDelete: Restrict`. Son üye ayrılınca klan hâlâ siliniyor; escrow önce iade ediliyor ve AuditLog kalıyor ama savaş satırları cascade ile gidiyor (§4.4/5).
- **ŞEMA İSTEĞİ:** `Squad.joinPolicy` (açık/kapalı klan, katılım isteği): keşiften kodsuz katılım için.
- **ŞEMA İSTEĞİ:** `Squad.emblem`/`color` (yüklenebilir logo), klan sohbeti/tepki modeli, ölü `weeklyTeamProgress`/`weeklyGoalResetAt` alanlarının kaldırılması.
- Sezonlu klan ligi ve `/customer/leaderboard` içinde "Klanlar" sekmesi F4.4 ve lig yüzeyinin sahibine ait.
- Görsel doğrulama yapılmadı: dev server ve build bu dalgada yasak, yalnız `tsc` ve jest çalıştırıldı.
