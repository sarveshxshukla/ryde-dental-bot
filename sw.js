/* Ryde Dental staff-inbox service worker — handles install + push notifications */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

// network-only fetch handler (present so the app is installable; no caching, so the inbox is never stale)
self.addEventListener("fetch", function () {});

// a push arrived from the server
self.addEventListener("push", function (e) {
  var data = { title: "Ryde Dental", body: "" };
  try { data = e.data.json(); } catch (err) { if (e.data) data.body = e.data.text(); }
  e.waitUntil(self.registration.showNotification(data.title || "Ryde Dental", {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "rdf-alert",
    renotify: true,
    vibrate: [120, 60, 120]
  }));
});

// tapping the notification opens (or focuses) the staff inbox
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf("/admin") >= 0 && "focus" in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/admin");
    })
  );
});
