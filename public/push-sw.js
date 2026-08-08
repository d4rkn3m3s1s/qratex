self.addEventListener('push', function (event) {
    if (event.data) {
        const data = event.data.json()
        const options = {
            body: data.body,
            icon: data.icon || '/icons/icon-192x192.svg',
            badge: '/icons/icon-192x192.svg',
            vibrate: [100, 50, 100],
            data: {
                dateOfArrival: Date.now(),
                primaryKey: '2',
                url: data.data?.url || '/',
            },
        }
        event.waitUntil(self.registration.showNotification(data.title, options))
    }
})

self.addEventListener('notificationclick', function (event) {
    event.notification.close()
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            if (clientList.length > 0) {
                let client = clientList[0]
                for (let i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused) {
                        client = clientList[i]
                    }
                }
                return client.focus()
            }
            return clients.openWindow(event.notification.data.url)
        })
    )
})
