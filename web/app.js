// web/app.js — version STATIQUE (GitHub Pages).
// Tout se passe dans le navigateur : on charge la config, on interroge l'Open Data de Paris,
// et on fait tourner le moteur de recommandation côté client. Aucun serveur.

import config from "./config.js";
import { recommend } from "./engine/index.js";
import { validateAndExpire } from "./data/freshness.js";
import { opendataParisAdapter } from "./data/adapters/opendata-paris.js";

const $ = (sel) => document.querySelector(sel);
const TZ = config.city?.timezone;

const state = {
  neighborhoods: {},
  location: null,
  geoActive: false,
  bounds: config.city?.bounds || null,
  cityLabel: config.city?.label || "la zone",
  sel: { group: null, budget: undefined, moodId: null, time: undefined },
};

// Chargement des événements du jour (Open Data), en tâche de fond dès l'ouverture.
let offers = [];
let offersError = null;
const offersReady = (async () => {
  try {
    const now = new Date();
    const raw = await opendataParisAdapter({ name: "que-faire", limit: 200, timezone: TZ }, { now });
    const fresh = validateAndExpire(raw, now, { timeZone: TZ, staleAfterHours: config.freshness?.staleAfterHours });
    offers = fresh.active;
  } catch (err) {
    offersError = err;
    console.error("[today.paris] chargement Open Data échoué :", err);
  }
  return offers;
})();

// --- Horloge -------------------------------------------------------------
function tickClock() {
  const opts = { weekday: "long", hour: "2-digit", minute: "2-digit" };
  $("#clock").textContent = "🕐 " + new Date().toLocaleString("fr-FR", opts);
}

// --- Rendu de "chips" à choix unique ------------------------------------
function renderChips(containerId, items, stateKey, defaultValue) {
  const box = $("#" + containerId);
  box.innerHTML = "";
  items.forEach((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = it.emoji ? `${it.emoji} ${it.label}` : it.label;
    b.setAttribute("role", "radio");
    const isDefault = it.value === defaultValue || it.id === defaultValue;
    b.setAttribute("aria-pressed", String(isDefault));
    if (isDefault) state.sel[stateKey] = it.value !== undefined ? it.value : it.id;
    b.addEventListener("click", () => {
      [...box.children].forEach((c) => c.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true");
      state.sel[stateKey] = it.value !== undefined ? it.value : it.id;
    });
    box.appendChild(b);
  });
}

// --- Initialisation de l'interface depuis la config (import direct) ------
function initUI() {
  if (config.tagline) $("#tagline").textContent = config.tagline;
  $("#demoBanner").hidden = true; // données réelles
  const footer = document.querySelector(".footer p");
  if (footer) footer.textContent = "today.paris — Source : « Que faire à Paris ? », Open Data Ville de Paris.";

  const sel = $("#neighborhood");
  sel.innerHTML = "";
  config.neighborhoods.forEach((n) => {
    state.neighborhoods[n.id] = n;
    const o = document.createElement("option");
    o.value = n.id;
    o.textContent = n.label;
    sel.appendChild(o);
  });
  sel.value = config.neighborhoods[0].id;
  setLocationFromNeighborhood(sel.value);
  sel.addEventListener("change", () => {
    state.geoActive = false;
    $("#geoStatus").hidden = true;
    setLocationFromNeighborhood(sel.value);
  });

  const moods = Object.entries(config.moods).map(([id, m]) => ({ id, label: m.label, emoji: m.emoji }));
  const groups = Object.entries(config.groups).map(([id, g]) => ({ id, label: g.label, emoji: g.emoji }));
  renderChips("groups", groups, "group", groups[0].id);
  renderChips("budgets", config.budgets.map((b) => ({ ...b, id: String(b.value) })), "budget", null);
  renderChips("moods", moods, "moodId", moods[0].id);
  renderChips("times", config.times.map((t) => ({ ...t, id: String(t.value) })), "time", 60);
}

function setLocationFromNeighborhood(id) {
  const n = state.neighborhoods[id];
  if (n) state.location = { lat: n.lat, lng: n.lng };
}

// --- Géolocalisation ----------------------------------------------------
function useGeolocation() {
  const status = $("#geoStatus");
  if (!navigator.geolocation) {
    status.hidden = false;
    status.style.color = "var(--muted)";
    status.textContent = "Géolocalisation non disponible sur cet appareil.";
    return;
  }
  status.hidden = false;
  status.style.color = "var(--muted)";
  status.textContent = "Localisation en cours…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const b = state.bounds;
      const inZone = !b || (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng);
      if (inZone) {
        state.location = { lat, lng };
        state.geoActive = true;
        status.style.color = "var(--good)";
        status.textContent = "📍 Position détectée — on part de là.";
      } else {
        status.style.color = "var(--muted)";
        status.textContent = `Vous semblez hors de ${state.cityLabel} : on garde le quartier choisi.`;
      }
    },
    () => {
      status.style.color = "var(--muted)";
      status.textContent = "Localisation refusée : on garde le quartier choisi.";
    },
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

  await offersReady; // les événements du jour sont-ils chargés ?

  if (offersError) {
    results.innerHTML = `<div class="error">Impossible de contacter l'Open Data de Paris pour l'instant. Réessayez dans un instant.</div>`;
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
  };

  try {
    const data = recommend({ context, candidates: offers, config });
    renderResults(data);
  } catch (err) {
    console.error(err);
    results.innerHTML = `<div class="error">Une erreur est survenue. Réessayez.</div>`;
  } finally {
    btn.disabled = false;
  }
}

// --- Rendu des résultats ------------------------------------------------
function renderResults(data) {
  const results = $("#results");
  const cats = config.categories || {};
  const list = data.results || [];

  if (list.length === 0) {
    results.innerHTML = `
      <div class="empty">
        <p><strong>Rien d'idéal à cet instant précis.</strong></p>
        <p>Essayez d'augmenter le budget ou le temps disponible, ou décochez « ouvert maintenant ».</p>
      </div>`;
    return;
  }

  const head = `<p class="results-head">Voici ${list.length} idée${list.length > 1 ? "s" : ""} pour vous, maintenant :</p>`;
  results.innerHTML = head + list.map((o, i) => card(o, i, cats)).join("");

  results.querySelectorAll("[data-offer]").forEach((btn) => {
    btn.addEventListener("click", () => onAction(btn));
  });
}

function availabilityBadge(a) {
  if (!a) return "";
  if (a.kind === "event-now") return `🔴 en ce moment${a.closingLabel ? ` · jusqu'à ${escapeHtml(a.closingLabel)}` : ""}`;
  if (a.kind === "event-today") return `🗓️ aujourd'hui à ${escapeHtml(a.startsAt || "")}`;
  if (a.kind === "ongoing") return "🗓️ à l'affiche";
  if (a.closingLabel === "24h/24") return "⏰ ouvert 24h/24";
  if (a.closingLabel) return `⏰ ouvert jusqu'à ${escapeHtml(a.closingLabel)}`;
  return "";
}

function card(o, i, cats) {
  const emoji = cats[o.category]?.emoji || "📍";
  const catLabel = cats[o.category]?.label || o.category;
  const reasons = (o.reasons || []).map((r) => `<span class="reason">${escapeHtml(r)}</span>`).join("");

  const avail = availabilityBadge(o.availability);
  const meta = [
    o.distance ? `<span>📍 ${o.distance}</span>` : "",
    avail ? `<span>${avail}</span>` : "",
    o.durationMin ? `<span>⏳ ~${o.durationMin} min</span>` : "",
    `<span class="price">💶 ${escapeHtml(o.price)}</span>`,
  ].join("");

  const action = o.booking
    ? `<a class="btn-action" href="${escapeAttr(o.booking.url)}" target="_blank" rel="noopener" data-offer="${escapeAttr(o.id)}" data-action="booking" data-pos="${i}">${escapeHtml(o.booking.label)}</a>`
    : `<button class="btn-action" type="button" data-offer="${escapeAttr(o.id)}" data-action="interest" data-pos="${i}">👍 Ça m'intéresse</button>`;

  return `
    <article class="offer">
      <div class="offer-top">
        <span class="offer-emoji">${emoji}</span>
        <h3 class="offer-name">${escapeHtml(o.name)}</h3>
      </div>
      <p class="offer-desc">${escapeHtml(catLabel)} · ${escapeHtml(o.neighborhood || "")}<br>${escapeHtml(o.descriptionShort || "")}</p>
      <div class="offer-meta">${meta}</div>
      <div class="reasons">${reasons}</div>
      <div class="offer-actions">${action}</div>
    </article>`;
}

// Version statique : pas de serveur, donc pas de mesure de clic côté serveur.
// On donne juste un retour visuel ; le lien de réservation s'ouvre normalement.
function onAction(btn) {
  if (btn.getAttribute("data-action") === "interest") {
    btn.classList.add("done");
    btn.textContent = "✓ Noté";
  }
}

// --- Sécurité d'affichage ------------------------------------------------
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// --- Init ----------------------------------------------------------------
tickClock();
setInterval(tickClock, 30000);
initUI();
$("#form").addEventListener("submit", getRecommendations);
$("#geoloc").addEventListener("click", useGeolocation);
