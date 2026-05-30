// Save to STASHd — popup logic.
// Auth: Supabase email/password via the project's REST endpoint.
// Save: POST /api/public/extension/save on the STASHd app.

const DEFAULT_APP_URL = "https://project--26a4cdd9-8737-4b1a-a009-f87ca1db9bb4.lovable.app";
const SUPABASE_URL = "https://lefanhnswvkmtwbawowy.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxlZmFuaG5zd3ZrbXR3YmF3b3d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzgxNjEsImV4cCI6MjA5NTY1NDE2MX0.K02B0-VtdM_m_yrogpqJ1WBLfZ6UsQisnRoVo6PRzJQ";

const $ = (id) => document.getElementById(id);
const views = ["loadingView", "loginView", "saveView", "successView", "settingsView"];
function show(id) {
  for (const v of views) $(v).classList.toggle("hidden", v !== id);
}

async function getStored(keys) {
  return new Promise((res) => chrome.storage.local.get(keys, res));
}
async function setStored(obj) {
  return new Promise((res) => chrome.storage.local.set(obj, res));
}
async function clearStored(keys) {
  return new Promise((res) => chrome.storage.local.remove(keys, res));
}

async function getAppUrl() {
  const { appUrl } = await getStored(["appUrl"]);
  return (appUrl || DEFAULT_APP_URL).replace(/\/$/, "");
}

// ---------- auth ----------
async function getValidSession() {
  const { session } = await getStored(["session"]);
  if (!session) return null;
  // Refresh if close to expiry (60s slack)
  const expiresAt = session.expires_at ?? 0;
  if (expiresAt * 1000 > Date.now() + 60_000) return session;
  if (!session.refresh_token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!res.ok) return null;
    const next = await res.json();
    await setStored({ session: next });
    return next;
  } catch {
    return null;
  }
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.msg || json.error || "Sign-in failed");
  await setStored({ session: json });
  return json;
}

async function signOut() {
  await clearStored(["session"]);
}

// ---------- page metadata capture ----------
function extractMetadataInPage() {
  function pick(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const v = el?.getAttribute("content") || el?.getAttribute("href");
      if (v && v.trim()) return v.trim();
    }
    return null;
  }
  const image = pick([
    'meta[property="og:image:secure_url"]',
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
    'link[rel="image_src"]',
  ]);
  const description = pick([
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
    'meta[name="description"]',
  ]);
  const title = pick(['meta[property="og:title"]', 'meta[name="twitter:title"]']) || document.title;
  const siteName = pick(['meta[property="og:site_name"]']);
  let absImage = image;
  try { if (image) absImage = new URL(image, location.href).toString(); } catch {}
  return {
    url: location.href,
    title: title || "",
    description: description || "",
    image: absImage,
    source: siteName || location.hostname.replace(/^www\./, ""),
  };
}

async function capturePage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) {
    return {
      url: tab?.url || "",
      title: tab?.title || "",
      description: "",
      image: tab?.favIconUrl || null,
      source: tab?.url ? new URL(tab.url).hostname.replace(/^www\./, "") : "",
    };
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractMetadataInPage,
    });
    return result;
  } catch {
    return {
      url: tab.url,
      title: tab.title || "",
      description: "",
      image: tab.favIconUrl || null,
      source: new URL(tab.url).hostname.replace(/^www\./, ""),
    };
  }
}

// ---------- API ----------
async function apiFetch(path, opts = {}) {
  const session = await getValidSession();
  if (!session?.access_token) {
    const err = new Error("Not signed in");
    err.code = "auth";
    throw err;
  }
  const appUrl = await getAppUrl();
  const res = await fetch(`${appUrl}${path}`, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  });
  let json = null;
  try { json = await res.json(); } catch {}
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json;
}

async function loadCollections(selectedId) {
  const sel = $("collection");
  sel.innerHTML = '<option value="">No collection</option>';
  try {
    const { collections } = await apiFetch("/api/public/extension/collections");
    for (const c of collections) {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name;
      if (c.id === selectedId) o.selected = true;
      sel.appendChild(o);
    }
  } catch (e) {
    console.warn("Failed to load collections", e);
  }
}

// ---------- UI flows ----------
async function showSaveView() {
  show("saveView");
  $("saveError").classList.add("hidden");
  const meta = await capturePage();
  $("title").value = meta.title || "";
  $("previewTitle").textContent = meta.title || meta.url || "Untitled";
  $("previewSource").textContent = meta.source || "";
  if (meta.image) {
    $("previewImage").style.backgroundImage = `url("${meta.image.replace(/"/g, '\\"')}")`;
  } else {
    $("previewImage").style.backgroundImage = "";
  }
  $("saveView").dataset.url = meta.url || "";
  $("saveView").dataset.image = meta.image || "";
  $("saveView").dataset.description = meta.description || "";
  $("saveView").dataset.source = meta.source || "";
  loadCollections();
}

async function bootstrap() {
  show("loadingView");
  const session = await getValidSession();
  if (!session) {
    show("loginView");
    return;
  }
  await showSaveView();
}

// ---------- handlers ----------
document.addEventListener("DOMContentLoaded", () => {
  bootstrap();

  $("loginBtn").addEventListener("click", async () => {
    const email = $("email").value.trim();
    const password = $("password").value;
    if (!email || !password) return;
    $("loginError").classList.add("hidden");
    $("loginBtn").disabled = true;
    $("loginBtn").textContent = "Signing in…";
    try {
      await signIn(email, password);
      await showSaveView();
    } catch (e) {
      $("loginError").textContent = e.message;
      $("loginError").classList.remove("hidden");
    } finally {
      $("loginBtn").disabled = false;
      $("loginBtn").textContent = "Sign in";
    }
  });

  $("logoutBtn").addEventListener("click", async () => {
    await signOut();
    show("loginView");
  });

  $("saveBtn").addEventListener("click", async () => {
    const v = $("saveView");
    const url = v.dataset.url;
    if (!url) {
      $("saveError").textContent = "This page can't be saved.";
      $("saveError").classList.remove("hidden");
      return;
    }
    const notes = $("notes").value.trim();
    const userDescription = notes || v.dataset.description || "";
    const payload = {
      url,
      title: $("title").value.trim() || v.dataset.url,
      description: userDescription,
      image: v.dataset.image || null,
      source: v.dataset.source || "",
      collection_id: $("collection").value || null,
    };
    $("saveError").classList.add("hidden");
    $("saveBtn").disabled = true;
    $("saveBtn").textContent = "Saving…";
    try {
      const result = await apiFetch("/api/public/extension/save", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const meta = [
        result?.item?.category,
        result?.item?.subcategory,
      ].filter(Boolean).join(" · ");
      $("successMeta").textContent = meta || "Categorized and tagged for you.";
      const appUrl = await getAppUrl();
      $("openAppLink").href = `${appUrl}/dashboard`;
      show("successView");
    } catch (e) {
      if (e.code === "auth") { show("loginView"); return; }
      $("saveError").textContent = e.message;
      $("saveError").classList.remove("hidden");
    } finally {
      $("saveBtn").disabled = false;
      $("saveBtn").textContent = "Save to STASHd";
    }
  });

  $("saveAnotherBtn").addEventListener("click", () => {
    $("notes").value = "";
    showSaveView();
  });

  $("settingsBtn").addEventListener("click", async () => {
    $("appUrl").value = await getAppUrl();
    show("settingsView");
  });
  $("saveSettingsBtn").addEventListener("click", async () => {
    const url = $("appUrl").value.trim().replace(/\/$/, "");
    if (url) await setStored({ appUrl: url });
    bootstrap();
  });
  $("cancelSettingsBtn").addEventListener("click", () => bootstrap());
});
