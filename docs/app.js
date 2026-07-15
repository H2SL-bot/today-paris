// web/app.js — version STATIQUE bilingue (fr par défaut, en sous /en/).
// Tout se passe dans le navigateur : config + Open Data + moteur, côté client. Aucun serveur.

import config from "./config.js";
import { UI, localizeConfig, GYG } from "./i18n.js";
import { UI_DATA } from "./ui-i18n.data.js";
import { makeEventTranslator, localizeNeighborhood } from "./translate.js";
import { recommend } from "./engine/index.js";
import { validateAndExpire } from "./data/freshness.js";
import { opendataParisAdapter } from "./data/adapters/opendata-paris.js";

const $ = (sel) => document.querySelector(sel);
const TZ = config.city?.timezone;
const LANG = (location.pathname.match(/^\/(en|es|zh|ar)(\/|$)/) || [])[1] || "fr";
const L = UI[LANG];
const CFG = localizeConfig(config, LANG); // config avec libellés/textes traduits pour le moteur
// Libellés de réservation par langue (les clés sont les valeurs françaises produites par l'adaptateur).
const BOOK = { en: { "Réserver": "Book", "En savoir plus": "Learn more", "Site web": "Website", "Y aller": "Go there" }, es: { "Réserver": "Reservar", "En savoir plus": "Saber más", "Site web": "Sitio web", "Y aller": "Cómo llegar" }, zh: UI_DATA.zh.booking, ar: UI_DATA.ar.booking };
const bookLabel = (s) => (BOOK[LANG] ? BOOK[LANG][s] || s : s);
const HOME = "https://today.paris" + (LANG === "fr" ? "/" : `/${LANG}/`); // lien de partage par défaut
// Traduction d'affichage des noms/desc d'événements (dico chargé plus bas ; fr = identité).
let translate = makeEventTranslator(null, LANG);

const state = {
  neighborhoods: {},
  location: null,
  geoActive: false,
  bounds: config.city?.bounds || null,
  cityLabel: config.city?.label || "la zone",
  stats: null,
  sel: { group: null, budget: undefined, moodId: null, time: undefined },
};

// Chargement des données (événements Open Data en direct + lieux OSM statiques).
let offers = [];
let offersError = null;
const offersReady = (async () => {
  const now = new Date();
  const todayParis = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [snapshot, venues, dict] = await Promise.all([
    // Instantané quotidien des événements (inventaire COMPLET ~850, léger & mis en cache).
    fetch("/events.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("/venues.json").then((r) => (r.ok ? r.json() : { offers: [] })).then((j) => j.offers || []).catch(() => []),
    // Dictionnaire de traduction des événements de la langue courante (fr = aucun).
    LANG !== "fr" ? fetch(`/translations.${LANG}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null),
  ]);
  translate = makeEventTranslator(dict, LANG);

  let events;
  if (snapshot && snapshot.builtFor === todayParis && Array.isArray(snapshot.offers)) {
    events = snapshot.offers; // instantané du jour à jour : on l'utilise tel quel
  } else {
    // Instantané absent ou daté d'hier (avant le passage de la boucle) → direct Open Data.
    events = await opendataParisAdapter({ name: "que-faire", limit: 1000, timezone: TZ }, { now })
      .catch(() => (snapshot && snapshot.offers) || []);
  }
  const raw = [...events, ...venues];
  if (raw.length === 0) offersError = new Error("no data");
  const fresh = validateAndExpire(raw, now, { timeZone: TZ, staleAfterHours: config.freshness?.staleAfterHours });
  offers = fresh.active;
  return offers;
})();

// "Cerveau" : apprentissage (stats) + envoi impressions/clics/visites. Anonyme, sans cookie.
const BRAIN = config.brainUrl;
if (BRAIN) {
  fetch(`${BRAIN}/stats`).then((r) => (r.ok ? r.json() : null)).then((s) => { state.stats = s; }).catch(() => {});
}
function sendEvents(events) {
  if (!BRAIN || !events || !events.length) return;
  fetch(`${BRAIN}/event`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events }), keepalive: true }).catch(() => {});
}
(function countView() {
  try {
    const isVisit = !sessionStorage.getItem("tp_v");
    if (isVisit) sessionStorage.setItem("tp_v", "1");
    sendEvents([{ type: "view", path: location.pathname, visit: isVisit }]);
  } catch {}
})();

// --- Horloge -------------------------------------------------------------
function tickClock() {
  $("#clock").textContent = "🕐 " + new Date().toLocaleString(L.clockLocale, { weekday: "long", hour: "2-digit", minute: "2-digit" });
}

// --- Chips à choix unique ------------------------------------------------
function renderChips(containerId, items, stateKey, defaultValue) {
  const box = $("#" + containerId);
  box.innerHTML = "";
  items.forEach((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = it.emoji ? `${it.emoji} ${it.label}` : it.label;
    b.setAttribute("role", "radio");
    b.dataset.val = String(it.value !== undefined ? it.value : it.id); // pour refléter un choix (ex. « au hasard »)
    const isDefault = it.value === defaultValue || it.id === defaultValue;
    b.setAttribute("aria-checked", String(isDefault)); // aria-checked (pas aria-pressed) pour role=radio
    if (isDefault) state.sel[stateKey] = it.value !== undefined ? it.value : it.id;
    b.addEventListener("click", () => {
      [...box.children].forEach((c) => c.setAttribute("aria-checked", "false"));
      b.setAttribute("aria-checked", "true");
      state.sel[stateKey] = it.value !== undefined ? it.value : it.id;
    });
    box.appendChild(b);
  });
}

// --- Initialisation ------------------------------------------------------
function initUI() {
  $("#demoBanner").hidden = true;

  const sel = $("#neighborhood");
  sel.innerHTML = "";
  CFG.neighborhoods.forEach((n) => {
    state.neighborhoods[n.id] = n;
    const o = document.createElement("option");
    o.value = n.id;
    o.textContent = n.label;
    sel.appendChild(o);
  });
  sel.value = CFG.neighborhoods[0].id;
  setLocationFromNeighborhood(sel.value);
  sel.addEventListener("change", () => {
    state.geoActive = false;
    $("#geoStatus").hidden = true;
    setLocationFromNeighborhood(sel.value);
  });

  const moods = Object.entries(CFG.moods).map(([id, m]) => ({ id, label: m.label, emoji: m.emoji }));
  const groups = Object.entries(CFG.groups).map(([id, g]) => ({ id, label: g.label, emoji: g.emoji }));
  renderChips("groups", groups, "group", groups[0].id);
  renderChips("budgets", CFG.budgets.map((b) => ({ ...b, id: String(b.value) })), "budget", null);
  renderChips("moods", moods, "moodId", moods[0].id);
  renderChips("times", CFG.times.map((t) => ({ ...t, id: String(t.value) })), "time", 60);
}

function setLocationFromNeighborhood(id) {
  const n = state.neighborhoods[id];
  if (n) state.location = { lat: n.lat, lng: n.lng };
}

// --- Géolocalisation ----------------------------------------------------
function useGeolocation() {
  const status = $("#geoStatus");
  const say = (txt, color) => { status.hidden = false; status.style.color = color || "var(--muted)"; status.textContent = txt; };
  if (!navigator.geolocation) return say(L.locUnavail);
  say(L.locating);
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const b = state.bounds;
      const inZone = !b || (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng);
      if (inZone) { state.location = { lat, lng }; state.geoActive = true; say(L.locFound, "var(--good)"); }
      else say(L.locOutside(state.cityLabel));
    },
    () => say(L.locDenied),
    { timeout: 8000 }
  );
}

// --- Le moteur, côté navigateur -----------------------------------------
async function getRecommendations(e) {
  e.preventDefault();
  const btn = $("#submit");
  const results = $("#results");
  btn.disabled = true;
  results.innerHTML = '<div class="spinner"></div>';

  await offersReady;
  if (offersError) {
    results.innerHTML = `<div class="error">${L.dataErr}</div>`;
    btn.disabled = false;
    return;
  }

  const context = {
    location: state.location,
    group: state.sel.group,
    budget: state.sel.budget,
    moodId: state.sel.moodId,
    timeAvailableMin: state.sel.time,
    requireOpenNow: $("#openNow").checked,
    stats: state.stats,
  };

  try {
    renderResults(recommend({ context, candidates: offers, config: CFG }));
  } catch (err) {
    console.error(err);
    results.innerHTML = `<div class="error">${L.err}</div>`;
  } finally {
    btn.disabled = false;
  }
}

// --- Rendu des résultats ------------------------------------------------
function renderResults(data) {
  const results = $("#results");
  const cats = CFG.categories || {};
  const list = data.results || [];

  if (list.length === 0) {
    $("#map").hidden = true;
    results.innerHTML = `<div class="empty"><p><strong>${L.emptyTitle}</strong></p><p>${L.emptyHint}</p><button class="btn-primary pcta" id="relax" type="button">${L.relax}</button></div>`;
    $("#relax")?.addEventListener("click", relaxFilters);
    return;
  }

  results.innerHTML = `<p class="results-head">${L.resultsHead(list.length)}</p>` + list.map((o, i) => card(o, i, cats)).join("");
  results.querySelectorAll("[data-offer]").forEach((btn) => btn.addEventListener("click", () => onAction(btn)));
  results.querySelectorAll(".btn-share").forEach((btn) => btn.addEventListener("click", () => onShare(btn)));
  sendEvents(list.map((o) => ({ type: "impression", category: o.category, offerId: o.id })));
  renderMap(list);
  // La réponse d'abord : on l'amène à l'écran (sur mobile elle était sous la carte, hors champ).
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  results.querySelector(".results-head")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

// --- Carte (Leaflet chargé À LA DEMANDE : seulement au 1er affichage de résultats) ----------
// NB : `L` (majuscule) désigne mes textes ; Leaflet est window.L. On n'alourdit pas l'accueil
// des visiteurs qui ne lancent pas de recherche (~46 Ko gzip + CSS économisés).
let _leafletPromise = null;
function ensureLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (_leafletPromise) return _leafletPromise;
  _leafletPromise = new Promise((resolve) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/vendor/leaflet/leaflet.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "/vendor/leaflet/leaflet.js";
    s.onload = () => resolve(window.L || null);
    s.onerror = () => resolve(null); // carte optionnelle : on n'échoue jamais là-dessus
    document.head.appendChild(s);
  });
  return _leafletPromise;
}
let _map = null, _markers = null;
function ensureMap(LF) {
  if (_map) return _map;
  const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  _map = LF.map("map", { scrollWheelZoom: false }).setView([config.city.center.lat, config.city.center.lng], 12);
  LF.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? "dark_all" : "light_all"}/{z}/{x}/{y}{r}.png`, {
    subdomains: "abcd", maxZoom: 20,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
  }).addTo(_map);
  _markers = LF.layerGroup().addTo(_map);
  return _map;
}
function pin(LF, emoji) {
  return LF.divIcon({ className: "pin-wrap", html: `<div class="pin">${emoji}</div>`, iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15] });
}
async function renderMap(list) {
  const LF = await ensureLeaflet();
  if (!LF) return; // Leaflet indisponible : carte optionnelle, le reste marche
  $("#map").hidden = false;
  const map = ensureMap(LF);
  map.invalidateSize();
  _markers.clearLayers();
  const cats = CFG.categories || {};
  const bounds = [];
  list.forEach((o) => {
    if (!Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return;
    LF.marker([o.lat, o.lng], { icon: pin(LF, cats[o.category]?.emoji || "📍") })
      .bindPopup(`<strong>${escapeHtml(translate(o.name).name)}</strong><br>${escapeHtml(o.distance)} · ${escapeHtml(o.price)}`)
      .addTo(_markers);
    bounds.push([o.lat, o.lng]);
  });
  if (state.location) {
    LF.circleMarker([state.location.lat, state.location.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#b8324f", fillOpacity: 1 })
      .bindPopup(L.youAreHere).addTo(_markers);
    bounds.push([state.location.lat, state.location.lng]);
  }
  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
}

function availabilityBadge(a) {
  if (!a) return "";
  if (a.kind === "event-now") return `${L.onNow}${a.closingLabel ? ` · ${L.until} ${escapeHtml(a.closingLabel)}` : ""}`;
  if (a.kind === "event-today") return `${L.todayAt} ${escapeHtml(a.startsAt || "")}`;
  if (a.kind === "ongoing") return L.showing;
  if (a.closingLabel === "24h/24") return L.open247;
  if (a.closingLabel) return `${L.openUntil} ${escapeHtml(a.closingLabel)}`;
  return "";
}

function card(o, i, cats) {
  const emoji = cats[o.category]?.emoji || "📍";
  const catLabel = cats[o.category]?.label || o.category;
  const t = translate(o.name, o.descriptionShort || ""); // nom + desc traduits (événements)
  const reasons = (o.reasons || []).map((r) => `<span class="reason">${escapeHtml(r)}</span>`).join("");
  const avail = availabilityBadge(o.availability);
  const meta = [
    o.distance ? `<span>📍 ${o.distance}</span>` : "",
    avail ? `<span>${avail}</span>` : "",
    o.durationMin ? `<span>⏳ ~${o.durationMin} min</span>` : "",
    `<span class="price">💶 ${escapeHtml(o.price)}</span>`,
  ].join("");
  const bookUrl = o.booking ? safeUrl(o.booking.url) : null;
  const action = bookUrl
    ? `<a class="btn-action" href="${escapeAttr(bookUrl)}" target="_blank" rel="noopener nofollow" data-offer="${escapeAttr(o.id)}" data-cat="${escapeAttr(o.category)}" data-action="booking" data-pos="${i}">${escapeHtml(bookLabel(o.booking.label))}</a>`
    : `<button class="btn-action" type="button" data-offer="${escapeAttr(o.id)}" data-cat="${escapeAttr(o.category)}" data-action="interest" data-pos="${i}">${L.interest}</button>`;
  const imgSrc = o.image && safeUrl(o.image.url);
  const img = imgSrc ? `<img class="offer-img" src="${escapeAttr(imgSrc)}" alt="${escapeAttr(o.image.alt || t.name)}" loading="lazy" onerror="this.remove()">` : "";
  return `
    <article class="offer">
      ${img}
      <div class="offer-top"><span class="offer-emoji">${emoji}</span><h3 class="offer-name">${escapeHtml(t.name)}</h3></div>
      <p class="offer-desc">${escapeHtml(catLabel)} · ${escapeHtml(localizeNeighborhood(o.neighborhood || "", LANG))}<br>${escapeHtml(t.desc || "")}</p>
      <div class="offer-meta">${meta}</div>
      <div class="reasons">${reasons}</div>
      <div class="offer-actions">${action}<button class="btn-share" type="button" data-oid="${escapeAttr(o.id)}" data-cat="${escapeAttr(o.category)}" data-name="${escapeAttr(t.name)}" data-url="${escapeAttr(bookUrl || HOME)}">${L.share}</button></div>
    </article>`;
}

function onAction(btn) {
  sendEvents([{ type: "click", category: btn.getAttribute("data-cat"), offerId: btn.getAttribute("data-offer") }]);
  if (btn.getAttribute("data-action") === "interest") {
    btn.classList.add("done");
    btn.textContent = L.noted;
  }
}

// Partage : partage natif (mobile) sinon copie du lien (ordinateur). Ne partage que des données réelles.
async function onShare(btn) {
  const name = btn.getAttribute("data-name");
  const url = btn.getAttribute("data-url");
  const text = L.shareText(name);
  try {
    if (navigator.share) {
      await navigator.share({ title: name, text, url });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      btn.textContent = L.shared;
      setTimeout(() => { btn.textContent = L.share; }, 2000);
    }
  } catch { /* partage annulé : rien à faire */ }
  sendEvents([{ type: "click", category: btn.getAttribute("data-cat"), offerId: btn.getAttribute("data-oid") }]);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// N'accepte qu'une URL http(s) absolue (normalise « www.x.fr » en https://). Écarte javascript:,
// data:, etc. — les liens viennent d'organisateurs tiers via l'Open Data (non maîtrisés).
function safeUrl(u) {
  if (!u) return null;
  let s = String(u).trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s.replace(/^\/+/, ""); // pas de schéma -> https://
  try {
    const url = new URL(s);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// « Au hasard » : tire une envie au hasard, la reflète dans les chips, et lance la recherche.
function surpriseMe(e) {
  const moodIds = Object.keys(CFG.moods || {});
  if (moodIds.length) {
    const pick = moodIds[Math.floor(Math.random() * moodIds.length)];
    state.sel.moodId = pick;
    const box = $("#moods");
    if (box) [...box.children].forEach((c) => c.setAttribute("aria-checked", String(c.dataset.val === pick)));
  }
  getRecommendations(e);
}

// « Élargir la recherche » (état vide) : relâche les filtres les plus restrictifs
// (décoche « ouvert maintenant », budget → peu importe, temps → tout mon temps) puis relance.
function relaxFilters(e) {
  const openNow = $("#openNow");
  if (openNow) openNow.checked = false;
  setChoiceToAny("budgets", "budget");
  setChoiceToAny("times", "time");
  getRecommendations(e);
}
function setChoiceToAny(containerId, stateKey) {
  const box = $("#" + containerId);
  if (box) [...box.children].forEach((c) => c.setAttribute("aria-checked", String(c.dataset.val === "null")));
  state.sel[stateKey] = null; // « peu importe » / « tout mon temps » = aucune contrainte
}

// --- Init ----------------------------------------------------------------
tickClock();
setInterval(tickClock, 30000);
initUI();
$("#form").addEventListener("submit", getRecommendations);
$("#surprise").addEventListener("click", surpriseMe);
$("#geoloc").addEventListener("click", useGeolocation);
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

// Widget GetYourGuide (expériences réservables) chargé APRÈS le rendu de la page (non bloquant) :
// le script tiers n'entre pas en concurrence avec l'affichage initial du site.
(function loadGyg() {
  if (!document.querySelector(".affiliate")) return;
  const inject = () => {
    if (document.querySelector('script[src*="widget.getyourguide.com"]')) return;
    const s = document.createElement("script");
    s.async = true;
    s.defer = true;
    s.src = GYG.loader;
    s.setAttribute("data-gyg-partner-id", GYG.partnerId);
    document.body.appendChild(s);
  };
  if (document.readyState === "complete") setTimeout(inject, 600);
  else window.addEventListener("load", () => setTimeout(inject, 600), { once: true });
})();
