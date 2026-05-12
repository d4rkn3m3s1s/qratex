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

Sidebar filtrelemesi: `menuVisibility[key] !== false` **ve** modül kontrolleri (`moduleControls`, `featureVisibility`) — bkz. `components/dashboard/sidebar.tsx`.

## Yeni bayi menü özelliği checklist

1. `lib/visibility-controls.ts` → `DEALER_MENU_CATALOG`  
2. `components/dashboard/sidebar.tsx` → `dealerNavItems` (aynı `key`, `href`)  
3. `messages/en.json` & `messages/tr.json` → `sidebarNav.dealer.<labelKey>`  
4. Sayfa route: `app/dealer/...` ve gerekli API’ler  
5. `npm run verify:menu` (Jest: katalog ↔ sidebar senkronu)

## Sözleşme sürümü

`MENU_VISIBILITY_CONTRACT_VERSION` (`lib/visibility-controls.ts`) — katalog yapısında uyumsuz kırılım olursa artırılmalı; admin GET yanıtındaki `meta.menuVisibilityContractVersion` ile uyumludur.
