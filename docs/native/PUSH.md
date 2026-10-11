# Native Push (Android FCM + iOS APNs)

Web-push (VAPID) is unchanged. On top of it, the Capacitor shell registers FCM/APNs device tokens.

## Single entry point

`sendPush(userId, { title, body, url?, icon?, kind? })` in `lib/push.ts`. Every server path that sends a push goes through it
(`team-notify`, `table-signal`, `dealer-queues/radar`, `marketing-delivery`, `cards/[token]/found`). `sendPushNotification(...)`
remains as a backward-compatible wrapper.

- `kind` given → `isUserChannelEnabled(userId, kind, 'push')` (lib/notify-prefs-server) is checked first; disabled → nothing is sent.
- One query loads the user's active `PushSubscription` rows (max 20) and splits them:
  - `native:fcm:<token>` → FCM HTTP v1, `native:apns:<token>` → APNs (`lib/push-native.ts`)
  - other → web-push, only if `isAllowedPushEndpoint` (SSRF guard); anything else is deactivated.
- Dead tokens (FCM `UNREGISTERED`/404, APNs 410/`BadDeviceToken`/`Unregistered`, web 404/410) are deleted; results go to `PushNotificationLog`.

## Storage (temporary)

`PushSubscription` has no platform/token columns. Native tokens are stored as `endpoint = "native:<fcm|apns>:<token>"`,
`p256dh = auth = "native"`. Schema request: `docs/audit/2026-10-08/SCHEMA-REQUESTS-ek.md` (PushSubscription.platform/token).

## Environment (all optional — missing = provider silently skipped)

| Var | Meaning |
| --- | --- |
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase service account JSON (raw or base64). Needs `project_id`, `client_email`, `private_key`. |
| `APNS_KEY_ID`, `APNS_TEAM_ID` | Apple key id / team id |
| `APNS_KEY_P8` | Contents of the `.p8` key (PEM; `\n` escapes accepted) |
| `APNS_BUNDLE_ID` | App bundle id (`apns-topic`) |
| `APNS_PRODUCTION` | `true` → `api.push.apple.com`, otherwise sandbox |

FCM OAuth token is cached ~1h; APNs ES256 JWT is reused for 40 min. APNs uses `node:http2` (APNs is HTTP/2 only), so it
needs the Node runtime (not Edge).

## Client

`lib/native/push-client.ts` (dynamic imports of `@capacitor/core` + `@capacitor/push-notifications`):
`isNativePushPlatform`, `getNativePushStatus`, `registerNativePush`, `unregisterNativePush`. Both settings hooks
(`components/customer/m-ayarlar/use-push-device.ts`, `components/dealer/b-ayarlar/use-push-device.ts`) branch to it when
`Capacitor.isNativePlatform()`; on the web they keep the VAPID flow. Permission is asked only on button press.
Tapping a notification opens `data.url` (in-app paths only).

API: `POST /api/push/native { platform: 'android'|'ios', token }`, `DELETE /api/push/native { platform?, token? }` — all roles.
A token already bound to another account moves to the current one (the device belongs to whoever is signed in). Max 10 active native devices per user.

## Remaining native setup (outside the repo code)

- Android: add `google-services.json` to `android/app/`, and the Google Services Gradle plugin.
- iOS: enable the Push Notifications + Background Modes (remote notifications) capability in Xcode; with the plain Capacitor plugin the
  token is an APNs token (not FCM), which is why the server talks to APNs directly.
- Logout should call `unregisterNativePush()` so the device stops receiving the previous user's notifications.
- `lib/legal/processors.ts` should list Google FCM / Apple APNs as processors once production keys are added.

Tests: `__tests__/lib/push-native.test.ts` (fetch and APNs transport mocked).
