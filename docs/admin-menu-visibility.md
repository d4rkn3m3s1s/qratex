# Menü ve özellik görünürlüğü (Admin)

Bu doküman, bayi ve müşteri sol menü öğelerinin nasıl yönetildiğini ve yeni bir menü özelliği eklerken izlenecek adımları özetler.

## Veritabanı (`settings`)

| `key` | İçerik |
|-------|--------|
| `featureVisibility` | `{ dealer: {...}, customer: {...} }` — modül anahtarları (`MODULE_CATALOG`) |
| `systemFeatureVisibility` | Admin/platform modül bayrakları (ayrı satır; normalize edilirken `featureVisibility.system` ile birleşir) |
| `menuVisibility` | `{ dealer: {...}, customer: {...} }` — menü satırı anahtarları (`DEALER_MENU_CATALOG` / `CUSTOMER_MENU_CATALOG`) |
| `moduleControls` | Global modül aç/kapa (`lib/module-controls.ts`) |

## API’ler

### Admin (tam yönetim)

- **`GET /api/admin/settings/visibility`**  
  - Yetki: `ADMIN`  
  - Dönen: `success`, `meta` (`menuVisibilityContractVersion`, `menuItemCounts`, `settingsKeys`), `catalog` (menü + özellik listeleri), `featureVisibility`, `menuVisibility`, `systemFeatureVisibility` (normalize).

- **`PUT /api/admin/settings/visibility`**  
  - Yetki: `ADMIN`  
  - Gövde: `{ featureVisibility, systemFeatureVisibility?, menuVisibility }`  
  - Bilinmeyen menü/özellik anahtarı **400** (`invalidKeys`).  
  - Kayıt sonrası audit log yazar.

### Bayi / müşteri (okuma)

- **`GET /api/settings/visibility`**  
  - Yetki: `DEALER`, `CUSTOMER` veya `ADMIN`  
  - Oturum rolüne göre: `menuVisibility`, `featureVisibility`, `moduleControls` (yalnızca o role ait haritalar).  
  - `menuVisibilityContractVersion`: istemcinin sözleşme sürümünü kontrol etmesi için.

## Varsayılanlar ve eksik anahtarlar

`lib/visibility-controls.ts` içindeki `normalizeRoleVisibility`:

- Katalogdaki her menü anahtarı için başlangıç **`true`**.
- Veritabanında yalnızca boolean değerler okunur; katalogda olmayan eski anahtarlar **yok sayılır**.
- Kataloga yeni eklenen anahtar, DB’de yoksa **açık** kabul edilir.

Menü sunucuda çözülür: `lib/navigation/get-shell-config.ts` → `getShellConfig(role)` (tek `settings.findMany`, 5 dk önbellek, `revalidateTag(NAV_SETTINGS_TAG)` ile anında tazelenir) ve `lib/navigation/shell-config.ts` → `buildShellConfig` (`menuVisibility[menuKey] !== false` **ve** `moduleControls` / `featureVisibility`, üst rota kapalıysa altları da). Aynı karar **sayfa düzeyinde** de uygulanır: kapalı bölüm URL'den açılırsa panel kabuğundaki `RouteGate` "Bu bölüm şu anda kullanılamıyor" durumu gösterir (ana sayfa ve ayarlar kapatılamaz). İstemci menü için istek atmaz.

## Yeni menü sayfası checklist

Menü kataloğu (`DEALER_MENU_CATALOG` / `CUSTOMER_MENU_CATALOG`), sidebar, mobil alt sekme, ⌘K paleti, Qra site haritası ve yönlendirmeler **tek navigasyon kaydından** (`lib/navigation/registry.ts`) türetilir:

1. `lib/navigation/registry.ts` → bir `NavRoute` satırı (kalıcı `id`, `href`, iki dilli `label`, ikon; admin'in gizleyebilmesi gerekiyorsa `menuKey`, modüle bağlıysa `moduleKey`).
2. Sayfa route'u: `app/<rol>/...` ve gerekli API'ler.
3. Müşteri menüsündeyse `lib/qra-knowledge-base.ts` → `QRA_PURPOSE[id]` (bir cümle amaç).
4. Eski bir URL'nin yerini alıyorsa `redirectFrom` + eski sayfayı emekli koçanına çevir; `UPDATE_NAV_REDIRECTS=1 npx jest __tests__/menu-visibility-catalog.test.ts`.
5. `npm run verify:menu` (CI'da da koşar): kayıt ↔ dosya sistemi iki yönlü, koçan/yönlendirme kuralları, ikon tekilliği, iç bağlantılarda 404/emekli hedef yok, Qra haritası, arama iniş adresleri.

## Sözleşme sürümü

`MENU_VISIBILITY_CONTRACT_VERSION` (`lib/visibility-controls.ts`) — katalog yapısında uyumsuz kırılım olursa artırılmalı; admin GET yanıtındaki `meta.menuVisibilityContractVersion` ile uyumludur.
