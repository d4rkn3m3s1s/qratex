/**
 * Ekip bağlantıları — alıcının PLATFORM rolüne göre panel seçimi (denetim Y3/Bulgu 19).
 * Proxy `/customer/*` yolunu yalnız CUSTOMER'a, `/admin/*` yolunu yalnız ADMIN'e açar; eski
 * bildirimler sabit `/admin/ekip` ya da `/customer/ekip` yazdığı için ekip yöneticisi (CUSTOMER)
 * "onay bekliyor" bildirimine tıklayınca panosuna değil ana sayfasına düşüyordu.
 *
 * Bayi ve personel ekip üyeleri için bir ekip paneli yok; onlar da müşteri panelinin ekip
 * yüzeyine yönlendirilemez (proxy rol uyuşmazlığında kendi paneline atar). Bu yüzden ekip
 * üyesi adayı yalnız CUSTOMER (ya da ADMIN) olabilir — bkz. members API.
 */
export function teamPanelBase(platformRole: string | null | undefined): '/admin/ekip' | '/customer/ekip' {
  return platformRole === 'ADMIN' ? '/admin/ekip' : '/customer/ekip';
}

export function teamTaskHref(platformRole: string | null | undefined, taskId: string): string {
  return `${teamPanelBase(platformRole)}?task=${encodeURIComponent(taskId)}`;
}

export function teamInitiativeHref(platformRole: string | null | undefined, initiativeId: string): string {
  return `${teamPanelBase(platformRole)}?tab=initiatives&initiative=${encodeURIComponent(initiativeId)}`;
}
