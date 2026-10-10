/* Qratex push bildirimi dinleyicileri.
 *
 * Üretimde next-pwa'nın /sw.js'i bu dosyayı `importScripts('/push-sw.js')` ile içe alır
 * (config/pwa.js) — kapsam `/`'da TEK service worker vardır. Geliştirmede next-pwa kapalı
 * olduğundan bu dosya tek başına kaydedilir (lib/pwa/service-worker.ts).
 * Burada skipWaiting/clientsClaim/fetch dinleyicisi YOKTUR: yaşam döngüsü Workbox'a aittir.
 */

function qxParsePushPayload(event) {
  if (!event.data) return null;
  try {
    return event.data.json();
  } catch (_) {
    // Düz metin yük: başlık olarak göster.
    try {
      return { title: 'Qratex', body: event.data.text() };
    } catch (__) {
      return null;
    }
  }
}

function qxSafeUrl(raw) {
  try {
    const url = new URL(raw || '/', self.location.origin);
    // Yalnız kendi origin'imize yönlendir (bildirim yükünden açık yönlendirme olmasın).
    return url.origin === self.location.origin ? url.href : self.location.origin + '/';
  } catch (_) {
    return self.location.origin + '/';
  }
}

self.addEventListener('push', function (event) {
  const data = qxParsePushPayload(event);
  if (!data) return;
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192x192.svg',
    badge: '/icons/icon-96x96.svg',
    tag: data.tag || undefined,
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      url: qxSafeUrl((data.data && data.data.url) || data.url || '/'),
    },
  };
  event.waitUntil(self.registration.showNotification(data.title || 'Qratex', options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const target = qxSafeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // Hedef zaten açıksa odakla; değilse açık bir pencereyi hedefe götür; hiç yoksa yeni pencere.
      for (let i = 0; i < clientList.length; i++) {
        if (clientList[i].url === target && 'focus' in clientList[i]) return clientList[i].focus();
      }
      const client = clientList.find(function (c) { return c.focused; }) || clientList[0];
      if (client && 'navigate' in client) {
        return client.navigate(target).then(function (c) { return (c || client).focus(); }).catch(function () {
          return self.clients.openWindow(target);
        });
      }
      return self.clients.openWindow(target);
    })
  );
});
