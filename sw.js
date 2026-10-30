const CACHE='shutterbook-v3';
const CORE=['./','./index.html','./manifest.json','./icon.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith('shutterbook-')&&key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);

  // Always use network for app pages; don't serve stale admin/dashboard HTML.
  if(url.origin===location.origin && (url.pathname.endsWith('/admin.html') || url.pathname.endsWith('/photographer.html') || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/app.js'))) {
    event.respondWith(fetch(event.request).then(response=>{
      if(response.ok) caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));
      return response;
    }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html'))));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
      if(response.ok&&url.origin===location.origin) {
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      }
      return response;
    }).catch(()=>caches.match('./index.html')))
  );
});
