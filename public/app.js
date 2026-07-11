// public/app.js — logique de l'interface today.paris
const $ = (sel) => document.querySelector(sel);

const state = {
  config: null,
  neighborhoods: {},        // id -> {lat,lng,label}
  location: null,           // {lat,lng} effectivement utilisé
  geoActive: false,
  bounds: null,             // zone géographique couverte (vient de la config du domaine)
  cityLabel: "la zone",
  sel: { group: null, budget: undefined, moodId: null, time: undefined },
};

// --- Horloge -------------------------------------------------------------
function tickClock() {
  const now = new Date();
  const opts = { weekday: "long", hour: "2-digit", minute: "2-digit" };
  $("#clock").textContent = "🕐 " + now.toLocaleString("fr-FR", opts);
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

// --- Chargement de la configuration -------------------------------------
async function loadConfig() {
  const cfg = await fetch("/api/config").then((r) => r.json());
  state.config = cfg;
  state.bounds = cfg.city?.bounds || null;
  state.cityLabel = cfg.city?.label || "la zone";
  if (cfg.tagline) $("#tagline").textContent = cfg.tagline;

  // Bandeau "démo" + attribution : dépend de la nature réelle/fictive des données.
  const banner = $("#demoBanner");
  const footer = document.querySelector(".footer p");
  if (cfg.hasDemoData) {
    if (banner) banner.hidden = false;
    if (footer) footer.textContent = "today.paris — MVP. Données de démonstration.";
  } else {
    if (banner) banner.hidden = true;
    if (footer) footer.textContent = "today.paris — Source : « Que faire à Paris ? », Open Data Ville de Paris.";
  }

  // Quartiers
  const sel = $("#neighborhood");
  sel.innerHTML = "";
  cfg.neighborhoods.forEach((n) => {
    state.neighborhoods[n.id] = n;
    const o = document.createElement("option");
    o.value = n.id;
    o.textContent = n.label;
    sel.appendChild(o);
  });
  const firstId = cfg.neighborhoods[0].id;
  sel.value = firstId;
  setLocationFromNeighborhood(firstId);
  sel.addEventListener("change", () => {
    state.geoActive = false;
    $("#geoStatus").hidden = true;
    setLocationFromNeighborhood(sel.value);
  });

  // Groupes, budgets, envies, temps (avec valeurs par défaut sensées)
  renderChips("groups", cfg.groups, "group", cfg.groups[0].id);
  renderChips("budgets", cfg.budgets.map((b) => ({ ...b, id: String(b.value) })), "budget", null);
  renderChips("moods", cfg.moods, "moodId", cfg.moods[0].id);
  renderChips("times", cfg.times.map((t) => ({ ...t, id: String(t.value) })), "time", 60);
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

// --- Appel au moteur ----------------------------------------------------
async function getRecommendations(e) {
  e.preventDefault();
  const btn = $("#submit");
  const results = $("#results");
  btn.disabled = true;
  results.innerHTML = '<div class="spinner"></div>';

  const context = {
    location: state.location,
    group: state.sel.group,
    budget: state.sel.budget,
    moodId: state.sel.moodId,
    timeAvailableMin: state.sel.time,
    requireOpenNow: $("#openNow").checked,
  };

  try {
    const data = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context }),
    }).then((r) => r.json());
    renderResults(data);
  } catch (err) {
    results.innerHTML = `<div class="error">Une erreur est survenue. Réessayez.</div>`;
  } finally {
    btn.disabled = false;
  }
}

// --- Rendu des résultats ------------------------------------------------
function renderResults(data) {
  const results = $("#results");
  const cats = state.config.categories || {};
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

  // Boutons d'action -> mesure des clics
  results.querySelectorAll("[data-offer]").forEach((btn) => {
    btn.addEventListener("click", () => onAction(btn, data));
  });
}

// Badge de disponibilité : événement en cours / plus tard aujourd'hui, ou lieu ouvert.
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
  const demoTag = o.demo ? `<span class="offer-demo-tag">démo</span>` : "";
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
        ${demoTag}
      </div>
      <p class="offer-desc">${escapeHtml(catLabel)} · ${escapeHtml(o.neighborhood || "")}<br>${escapeHtml(o.descriptionShort || "")}</p>
      <div class="offer-meta">${meta}</div>
      <div class="reasons">${reasons}</div>
      <div class="offer-actions">${action}</div>
    </article>`;
}

async function onAction(btn, data) {
  const offerId = btn.getAttribute("data-offer");
  const action = btn.getAttribute("data-action");
  const pos = Number(btn.getAttribute("data-pos"));
  // On enregistre le clic (signal d'usage pour la boucle d'amélioration)
  fetch("/api/click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      offerId,
      action,
      position: pos,
      moodId: data.context?.moodId,
      group: data.context?.group,
    }),
  }).catch(() => {});

  if (action === "interest") {
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
$("#form").addEventListener("submit", getRecommendations);
$("#geoloc").addEventListener("click", useGeolocation);
loadConfig().catch(() => {
  $("#results").innerHTML = `<div class="error">Impossible de charger la configuration.</div>`;
});
