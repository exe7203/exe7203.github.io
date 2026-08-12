const APP_CACHE = "quicknav-app-v3";
const SHARE_CACHE = "quicknav-private-share-v2";
const SHARE_MAX_AGE_MS = 5 * 60 * 1000;
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith("quicknav-app-") && key !== APP_CACHE) ||
                (key.startsWith("quicknav-private-share-") &&
                  key !== SHARE_CACHE),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (
    event.data?.type !== "CACHE_APP_ASSETS" ||
    !Array.isArray(event.data.urls)
  ) {
    return;
  }

  event.waitUntil(cacheAppAssets(event.data.urls));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(handleSharedText(request));
    return;
  }

  if (request.method === "GET" && url.pathname === "/__shared_text__") {
    event.respondWith(takeSharedText());
    return;
  }

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      deleteStaleSharedText()
        .then(() => fetch(request))
        .then((response) => {
          const copy = response.clone();
          caches.open(APP_CACHE).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  if (["style", "script", "image", "font"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          if (response.ok) {
            caches
              .open(APP_CACHE)
              .then((cache) => cache.put(request, response.clone()));
          }
          return response;
        });
        return cached || network;
      }),
    );
  }
});

async function cacheAppAssets(urls) {
  const safeUrls = urls
    .slice(0, 80)
    .map((value) => {
      try {
        return new URL(String(value), self.location.origin);
      } catch {
        return null;
      }
    })
    .filter((url) => url?.origin === self.location.origin);

  const cache = await caches.open(APP_CACHE);
  await Promise.allSettled(
    safeUrls.map(async (url) => {
      const request = new Request(url, { credentials: "same-origin" });
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response);
      }
    }),
  );
}

async function handleSharedText(request) {
  const formData = await request.formData();
  const text =
    String(formData.get("text") || "").trim() ||
    String(formData.get("title") || "").trim() ||
    String(formData.get("url") || "").trim();

  const cache = await caches.open(SHARE_CACHE);
  const key = new Request(`${self.location.origin}/__shared_text__`);
  await cache.put(
    key,
    new Response(JSON.stringify({ text, storedAt: Date.now() }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }),
  );

  return Response.redirect(`${self.location.origin}/?share-target=1`, 303);
}

async function takeSharedText() {
  const cache = await caches.open(SHARE_CACHE);
  const key = new Request(`${self.location.origin}/__shared_text__`);
  const response = await cache.match(key);
  if (!response) {
    return new Response("No shared text", { status: 404 });
  }
  await cache.delete(key);

  const payload = await response.json();
  if (
    typeof payload?.text !== "string" ||
    typeof payload?.storedAt !== "number" ||
    Date.now() - payload.storedAt > SHARE_MAX_AGE_MS
  ) {
    return new Response("Shared text expired", { status: 404 });
  }

  return new Response(JSON.stringify({ text: payload.text }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function deleteStaleSharedText() {
  const cache = await caches.open(SHARE_CACHE);
  const key = new Request(`${self.location.origin}/__shared_text__`);
  const response = await cache.match(key);
  if (!response) return;

  try {
    const payload = await response.json();
    if (
      typeof payload?.storedAt !== "number" ||
      Date.now() - payload.storedAt > SHARE_MAX_AGE_MS
    ) {
      await cache.delete(key);
    }
  } catch {
    await cache.delete(key);
  }
}
