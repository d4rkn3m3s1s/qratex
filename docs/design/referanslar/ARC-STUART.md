# Tasarım referansları: uiarc.dev / arc-library / stuartdesk.com

> Tarih: 2026-10-12 · Kaynak: WebFetch ile okunan sayfa içerikleri (görsel/CSS ayrıntısı metinden çıkarıldı; ekran görüntüsü alınmadı). Kod değiştirilmedi.

## 1. Kaynak özetleri

### uiarc.dev (Arc, ticari site)
- "AI ajanlarınızın kullanabileceği React UI kütüphanesi": 157 bileşen + 91 blok, llms.txt, MCP sunucusu, her bileşen için AI'ya yönelik Markdown sayfası.
- Ücretsiz katman + **Arc Pro (tek seferlik $199)**: dock, share sheet, data grid, time dial, voice orb, lightbox, checkout summary, metrics dashboard gibi hareketi yoğun parçalar Pro'da.
- Animasyon kalıpları: **morph** (select tetikleyicisi listeye büyür, buton panele dönüşür), **sayı akışı** (bakiye/toplamlar sayarak değişir), **scrub/spin** (çizgi grafikte sürükleyerek okuma, döndürülebilir kadran), **fiziksel geri bildirim** (sınırda direnen sayı alanı), **metin açılışı** (blur/kelime/satır/silme, görünüme girince), **layout akışı** (arşivlenen satırın boşluğu yumuşakça kapanır). Her animasyonda reduced-motion yedeği var.
- Görsel dil: fotoğraf/yumuşak illüstrasyon ağırlıklı, semantik renk token'ları; belirgin bir marka paleti dayatmıyor.

### github.com/kuratlielia/arc-library (açık kaynak kısım)
- **MIT lisansı, © 2026 Elia Kuratli.** 109 bileşen + 22 blok (Actions 18, Inputs 34, Disclosure 13, Feedback 9, Data 30, Text 4, Special 1). Bloklar: sayfa başlığı, komut paleti, giriş/kayıt, fiyat karşılaştırma, hero, SSS, header/footer.
- Teknoloji: React 19 + TS, Next.js App Router/Vite, **Motion (motion.dev, `motion` paketi)**, **CSS Modules + CSS değişkenleri** (Tailwind gerekmez), bazılarında lucide-react ve Radix.
- Dağıtım: **shadcn uyumlu `@uiarc` registry** (`npx shadcn@latest add @uiarc/<ad>`) veya elle kopyala; token'lar `@uiarc/arc-foundation` ile tek seferde kurulur.

### stuartdesk.com (Stuart for Mac)
- Görüşme sırasında kod/doküman/geçmiş görüşmelerden kaynaklı cevap veren macOS uygulaması (erken erişim). Ürün sitesi, kütüphane değil.
- Dil: iddialı kısa başlıklar ("Don't say 'let me check.' Just answer."), konuşma tonunda kısa gövde metni, monospace kaynak çipleri (`auth/saml/okta.ts`), üst simge dipnotlarla kaynak bağlama, hap biçimli durum etiketleri ("now", "Promise caught"), "Listening 00:40" sayaç, gerçekçi uygulama penceresi/menü çubuğu mockup'ları, numaralı 3 adım akışı, aylık/yıllık geçiş + "%17 tasarruf" rozeti. Apple'a yakın, sakin, ürünü bağlam içinde gösteren estetik.
- **© 2026 Mutaqin Aryawijaya, tüm hakları saklıdır.** Açık lisans yok.

## 2. Qratex'e uyan / uymayan

**Uyanlar**
- Arc'ın hareket felsefesi (amaca hizmet eden morph, sayı akışı, layout geçişi, zorunlu reduced-motion) QDL v2 + `lib/motion` ile aynı yönde ve "AI yapımı gibi" görüntünün panzehiri: dekoratif glow/gradient yerine **durum değişimini anlatan** hareket.
- shadcn registry dağıtımı → kaynak bizde olur, istediğimiz kadar değiştiririz.
- Stuart'ın dili: somut mockup + kısa iddialı başlık + kanıt çipleri. Landing'deki jenerik SaaS kartı hissini kırmak için doğrudan ilham.

**Uymayanlar / dikkat**
- Arc **CSS Modules + kendi token'ları** kullanıyor; Qratex Tailwind 3 + `app/globals.css` token'ları. Doğrudan eklemek iki stil sistemi ve ikinci token seti demek → **eklenen her bileşen Tailwind + QDL token'larına yeniden yazılmalı.**
- Arc `motion` paketini (`motion/react`, `motion.div`) kullanıyor; Qratex global **LazyMotion + `m`**. `motion.*` LazyMotion strict altında hata verir / tam bundle'ı çeker → importlar `m as Motion` desenine çevrilmeli, `framer-motion`'dan alınmalı (ikinci animasyon paketi kurulmamalı).
- `@uiarc/arc-foundation` globals'a çakışan token getirir → **kurmayın**, gerekli değişkenleri QDL'e eşleyin.
- Stuart'ın macOS/Apple estetiği kopyalanmamalı; yalnız ton ve kompozisyon fikri alınır.

## 3. Uyarlanabilecek bileşen ve animasyonlar

| Arc parçası (ücretsiz/MIT varsayımıyla*) | Ne işe yarar | Qratex'te nerede |
|---|---|---|
| Number / count-up | Değer değişince rakamlar akar | Cüzdan kartı bakiyesi, çark ödül sonucu, bayi günlük ciro |
| Wallet card (blok) | Kart + bakiye + hareket | Müşteri cüzdan/ödül kartı (yapı ilhamı) |
| Command palette (blok) | ⌘K arama/aksiyon | Admin ⌘K, bayi hızlı işlem |
| Morph select / confirm morph | Tetikleyici panele dönüşür; buton yerinde "emin misin?"e döner | Admin filtreleri, silme/puan iadesi onayları (dialog yerine) |
| Inbox triage (layout akışı) | Arşivlenen satır kaybolur, boşluk yumuşakça kapanır | Admin gelen kutusu, ekip kanbanı, bildirim listesi |
| Line chart scrub / donut | Sürükleyerek değer okuma | Bayi panosu, admin analitik |
| Text reveal (blur/kelime/satır) | Görünüme girince metin açılışı | Landing hero başlığı (tek yerde, ölçülü) |
| Number field "push back" | Sınırda fiziksel direnç | Puan/adet giriş alanları |
| Toast, dialog, tabs | Temel etkileşim cilası | Mevcut shadcn karşılıklarına davranış referansı |
| Pricing, FAQ, hero, footer blokları | Landing bölümleri | Landing yapı referansı |

\* Bir parçanın ücretsiz repo'da mı Pro'da mı olduğu her eklemeden önce GitHub'da doğrulanmalı. Pro parçaları (dock, share sheet, data grid, time dial, voice orb, checkout summary, metrics dashboard) **lisans alınmadan kullanılmaz**.

Stuart'tan alınacak kalıplar (kod değil, fikir): kanıt çipleri (landing'de "QR okut → puan" akışını gerçek ekran parçalarıyla göstermek), hap durum etiketleri ("şimdi", "kazandın"), canlı sayaç, stok illüstrasyon yerine gerçek arayüz mockup'ı, aylık/yıllık geçişli fiyat kartı, kısa iddialı başlık yazımı.

## 4. Lisans durumu
- **arc-library (GitHub): MIT** → kopyalanabilir, değiştirilebilir, ticari kullanılabilir. Şart: telif/lisans bildirimi korunmalı (dosya başına `// Adapted from arc-library (MIT) © 2026 Elia Kuratli` + repoda üçüncü taraf bildirimleri dosyası).
- **uiarc.dev Pro**: ücretli; lisans sayfası okunamadı → **satın almadan kopyalama, yalnız ilham al.** MIT'in yalnız GitHub repo içeriğini kapsadığını varsay.
- **stuartdesk.com: All rights reserved** → **kopyalama (metin, görsel, CSS, mockup), yalnız ilham al.**

## 5. Entegrasyon yaklaşımı
- Tercih: **shadcn registry ile ayrı dalda tek tek çek → hemen Tailwind/QDL'e yeniden yaz** (veya kopyala-yapıştır). npm paketi yok; kaynak bizde.
- `@uiarc` namespace'i `components.json`'a eklenebilir ama CLI'nin `motion` ve `arc-foundation` bağımlılıklarını kurmasına izin verilmemeli (önce diff/dry-run ile kontrol).
- Motion uyumu: `import { motion } from "motion/react"` → `import { m as Motion } from "framer-motion"`; `AnimatePresence`, `useSpring`, `useMotionValue`, `animate` framer-motion'dan. `layout` animasyonu için gereken özellik setinin (`domMax`) LazyMotion'da yüklü olduğunu kontrol et; değilse yalnız o yüzeyde yerel yükle.
- Bundle: kopyalanan bileşen başına birkaç KB; asıl risk ikinci animasyon paketi ve CSS Modules token dosyası — ikisinden kaçınılırsa etki ihmal edilebilir. Ağır olanlar (grafik, komut paleti) `next/dynamic` ile ayrılmalı (son perf turu ortak JS'i 228.9 KB gz'ye indirdi; geri büyütmeyin).
- Reduced-motion yedeklerini koruyun (`useReducedMotion`), süre/eğrileri `lib/motion` token'larına eşleyin.

## 6. Öncelikli 10 maddelik öneri
1. **Bakiye sayı akışı**: cüzdan kartı + çark sonucu + bayi ciro için tek `AnimatedNumber` (Arc number'dan uyarlama, MIT atıflı).
2. **Admin ⌘K komut paleti**: Arc command palette bloğunu QDL ile uyarla; `next/dynamic`.
3. **Liste layout akışı**: gelen kutusu, bildirimler, kanbanda silme/arşivde boşluk kapanma animasyonu.
4. **Confirm morph**: yıkıcı aksiyonlarda modal yerine yerinde onay (admin puan iadesi, bayi iptal).
5. **Landing'de gerçek ürün mockup'ları** (Stuart ilhamı): glow/kart ızgarası yerine gerçek Qratex ekran parçaları + kısa iddialı başlık.
6. **Kanıt/durum çipleri**: "şimdi", "+50 puan", "doğrulandı" hap etiketleri, QDL tipografisiyle.
7. **Hero metin açılışı**: yalnız bir başlıkta kelime/blur reveal; başka yerde tekrarlama (tekrar "AI yapımı" hissini artırır).
8. **Bayi grafiğinde scrub**: sürükleyince günün değeri; mevcut grafik üstüne davranış olarak.
9. **Sayı alanında sınır direnci**: puan/adet inputlarında min/max'ta küçük yay geri tepmesi.
10. **Fiyat/paket kartlarında aylık-yıllık geçiş + tasarruf rozeti** (bayi paketleri için); Arc pricing bloğu yapı referansı.

Not: Görsel yön kararı (`docs/design/YUZEYLER.html`, `KARSILASTIRMA-2.html`) hâlâ bekliyor. Arc parçaları yönden bağımsız bir davranış katmanı olduğundan 1-4 ve 8-9 karar beklenmeden uygulanabilir; 5-7 ve 10 yön kararına bağlı.
