const CACHE_NAME = "pikul-app-v2";
const ASSETS_TO_CACHE = [
  // --- ROOT (CUSTOMER) ---
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./firebase-config.js",
  "./pikul.jpeg",
  "./manifest.json",

  // --- SELLER ---
  "./seller/",
  "./seller/index.html",
  "./seller/kasir.html",
  "./seller/styles.css",
  "./seller/seller.js",
  "./Mitra-Pikul.png",

  // --- ADMIN ---
  "./admin/",
  "./admin/index.html",
  "./admin/styles.css",
  "./admin/admin.js",
  "./Admin-Pikul.png",

  // --- EXTERNAL LIBS (Opsional: Cache ini agar peta/qr jalan offline jika browser mengizinkan) ---
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js",
];

// 1. INSTALL: Simpan semua file ke cache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Membuka cache PIKUL...");
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. ACTIVATE: Hapus cache lama jika ada update versi
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("Menghapus cache lama:", cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. FETCH: Strategi "Stale-While-Revalidate"
// Ambil dari cache dulu biar cepat, lalu update dari network di background
self.addEventListener("fetch", (event) => {
  // Abaikan request ke Firestore/Google Maps (biarkan online)
  if (
    event.request.url.includes("firestore") ||
    event.request.url.includes("googleapis")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          // Update cache dengan versi terbaru dari network
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === "basic"
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Jika offline dan tidak ada di cache, bisa return halaman offline custom disini
        });

      // Return cache jika ada, jika tidak tunggu network
      return cachedResponse || fetchPromise;
    })
  );
});
