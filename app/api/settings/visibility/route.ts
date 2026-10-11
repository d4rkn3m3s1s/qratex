/**
 * EMEKLİ UÇ (bilgi mimarisi B8). Eskiden sidebar her panel açılışında bu ucu istemciden,
 * önbelleksiz çağırıyordu (gizli öğe önce görünüp sonra kayboluyordu, açılış başına ek DB
 * sorgusu). Menü artık RSC layout'ta `getShellConfig(role)` ile tek sorgu + önbellekle çözülür;
 * hiçbir istemci bu yolu çağırmıyor. Sahipsiz okuma yüzeyi açık kalmasın diye 410 döner.
 * Yönetim (yazma) uçları: `/api/admin/navigation`, `/api/admin/settings/visibility`.
 */
import { ApiError, defineRoute } from '@/lib/http/define-route';

const gone = () => {
  throw new ApiError('GONE', 'Menü ve özellik görünürlüğü artık panel kabuğunda sunucuda çözülüyor (lib/navigation/get-shell-config).', { status: 410 });
};

export const GET = defineRoute({ name: 'settings.visibility.retired', roles: ['ADMIN', 'DEALER', 'CUSTOMER'] }, gone);
