const CACHE_NAME="family-clock-v87-1-10-music-guard";
const AUDIO_CACHE_NAME="family-clock-drive-audio-runtime-v3";

const CORE_FILES=[
  "./",
  "./index.html",
  "./patient.html",
  "./boindex.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./assets/calm-background.svg",
  "./favicon.ico"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>Promise.all(CORE_FILES.map(file=>cache.add(file).catch(err=>console.warn("cache skip",file,err)))))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>![CACHE_NAME,AUDIO_CACHE_NAME].includes(k)).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

function isDriveAudioDownload(url){
  return url.hostname==="drive.google.com" && url.pathname.includes("/uc") && url.searchParams.get("export")==="download";
}

function isLiveApiOrEmbeddedMedia(url){
  return (
    url.hostname.includes("script.google") ||
    url.hostname.includes("script.googleusercontent") ||
    url.hostname.includes("googleusercontent") ||
    url.hostname==="drive.google.com" ||
    url.hostname.includes("open-meteo") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("youtube") ||
    url.hostname.includes("youtu.be") ||
    url.hostname.includes("doubleclick")
  );
}
function coreKeyFor(url){
  const fixed=fixedNestedLocalUrl(url);
  if(fixed)return coreKeyFor(new URL(fixed));
  const path=url.pathname.split("/").pop()||"";
  if(path==="patient.html")return "./patient.html";
  if(path==="boindex.html")return "./boindex.html";
  if(path==="index.html"||path==="")return "./index.html";
  if(path==="manifest.json")return "./manifest.json";
  if(path==="favicon.ico")return "./favicon.ico";
  if(url.pathname.endsWith("/"))return "./index.html";
  return "";
}
function isHtmlRequest(req,url){
  if(req.mode==="navigate")return true;
  if(url.origin!==self.location.origin)return false;
  return /\/(?:index|patient|boindex)\.html$/.test(url.pathname) || url.pathname.endsWith("/");
}
async function networkFirstHtml(req){
  const url=new URL(req.url);
  const cache=await caches.open(CACHE_NAME);
  const core=coreKeyFor(url)||req;
  try{
    const fresh=await fetch(req,{cache:"no-store"});
    if(fresh&&fresh.ok)cache.put(core,fresh.clone()).catch(()=>{});
    return fresh;
  }catch(err){
    const cached=await cache.match(core)||await cache.match(req,{ignoreSearch:true});
    return cached||Response.error();
  }
}

async function cacheFirstWithUpdate(req){
  const url=new URL(req.url);
  if(url.protocol!=="http:"&&url.protocol!=="https:")return new Response("",{status:204});
  
  
  const cache=await caches.open(CACHE_NAME);
  const core=coreKeyFor(url);
  const cached=core ? await cache.match(core) : await cache.match(req,{ignoreSearch:true});
  const network=fetch(req).then(res=>{
    if(res && res.ok){
      const putKey=core||req;
      cache.put(putKey,res.clone()).catch(()=>{});
    }
    return res;
  }).catch(()=>cached);
  return cached || network || Response.error();
}


function fixedNestedLocalUrl(url){
  if(url.origin!==self.location.origin)return "";
  const u=new URL(url.href);
  let p=u.pathname;

  // V77: /backoffice/index.html is the Backoffice page, not the public index.
  p=p.replace(/\/(?:boindex|backoffice)\/index\.html$/, "/boindex.html");
  

  // Repair old/broken links such as:
  // /luach/boindex/patient.html -> /luach/patient.html
  // /luach/boindex/manifest.json -> /luach/manifest.json
  // /luach/boindex/icons/icon-192.png -> /luach/icons/icon-192.png
  p=p.replace(/\/(?:boindex|backoffice)\/(patient\.html|boindex\.html|index\.html|manifest\.json|favicon\.ico)$/,"/$1");
  p=p.replace(/\/(?:boindex|backoffice)\/(icons\/[^?#]+)$/,"/$1");
  p=p.replace(/\/(?:boindex|backoffice)\/(assets\/[^?#]+)$/,"/$1");
  p=p.replace(/\/(?:boindex|backoffice)\/?$/,"/boindex.html");

  if(p!==u.pathname){
    u.pathname=p;
    return u.toString();
  }
  return "";
}


self.addEventListener("fetch",event=>{
  const req=event.request;
  // V84: media players, especially Safari/iOS, use Range requests. Let them pass through untouched.
  if(req.headers && req.headers.has && req.headers.has("range"))return;
  /* V84_RANGE_REQUEST_BYPASS */
  if(req.method!=="GET")return;
  let url;
  try{url=new URL(req.url)}catch{return}
  if(url.protocol!=="http:"&&url.protocol!=="https:")return;/* V86_IGNORE_NON_HTTP_FETCHES */
  
  const fixedNestedUrl=fixedNestedLocalUrl(url);
  if(fixedNestedUrl){
    event.respondWith(Response.redirect(fixedNestedUrl,302));
    return;
  }
  

  if(isHtmlRequest(req,url)){
    event.respondWith(networkFirstHtml(req));
    return;
  }

  if(isDriveAudioDownload(url)){
    event.respondWith(
      caches.open(AUDIO_CACHE_NAME).then(cache=>
        cache.match(req).then(cached=>{
          const network=fetch(req).then(res=>{
            if(res&&res.ok)cache.put(req,res.clone()).catch(()=>{});
            return res;
          }).catch(()=>cached);
          return cached || network || Response.error();
        })
      )
    );
    return;
  }

  if(isLiveApiOrEmbeddedMedia(url))return;

  event.respondWith(cacheFirstWithUpdate(req));
});

































































































/* V78_JSONP_LATE_CALLBACK_FIX_SW */

/* V79_PATIENT_PRINT_MUSIC_PRIVACY_SW */

/* V80_MUSIC_SHUFFLE_SW */

/* V81_MUSIC_FAST_SELECT_FIX_SW */

/* V82_MOBILE_CLOUD_SHARE_FIX_SW */

/* V83_MUSIC_FOLDER_RECURSION_FIX_SW */

/* V84_SCALE_SECURITY_TEMPLATE_SW */

/* V85_APPS_SCRIPT_TIMEOUT_FIX_SW */

/* V86_STABILITY_HARDENING_SW */

/* V87_SECURITY_RELEASE_CANDIDATE_SW */

/* V871_SECURITY_BLOCKERS_FIX_SW */
