const appState = {
  selectedView: "home",
  selectedDeviceId: "core-01",
  autoPollTimer: null,
  topologyPositions: {},
  topologyLayoutSignature: "",
  topologyLogicalSize: { width: 1, height: 1 },
  topologyZoom: 1,
  topologyZoomUserSet: false,
  topologyPan: { x: 0, y: 0 },
  draggingNode: null,
  panningMap: null,
  selectedDeviceIndex: 0,
  monitorViewMode: window.localStorage?.getItem("netwatch.monitorViewMode") === "grid" ? "grid" : "carousel",
  deviceCarouselDrag: null,
  deviceCarouselSuppressClick: false,
  historyDeviceId: "",
  historyOverlayOpen: false,
  deviceHistory: null,
  tunnelAnimation: null,
  snapshot: {
    devices: [],
    links: [],
    alerts: [],
    events: [],
    metric_catalog: [],
    seeds: [],
    runtime: {},
    device_labels: {},
    settings: { polling: {}, security: {} }
  }
};

const viewMeta = {
  dashboard: ["Current network state", "Dashboard"],
  devices: ["Inventory and interface state", "Devices"],
  topology: ["Seed-based LLDP discovery", "Topology"],
  alerts: ["Static thresholds", "Alerts"],
  settings: ["MVP architecture decisions", "Settings"]
};

const landingRgb = [216, 211, 235];
const mapRgb = [252, 252, 239];
const dashboardRgb = [217, 217, 217];
const patternSectionRatio = 1 / 3;
const presentationScrollHoldMs = 1000;
const presentationScrollHold = {
  lockedUntil: 0,
  targetName: ""
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function interpolateRgb(from, to, progress) {
  return from.map((channel, index) => Math.round(channel + (to[index] - channel) * progress)).join(" ");
}

function interpolateRgbArray(from, to, progress) {
  return from.map((channel, index) => Math.round(channel + (to[index] - channel) * progress));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getPresentationMetrics() {
  const viewport = Math.max(1, window.innerHeight);
  const scroll = window.scrollY;
  const dashboardStart = 2 + patternSectionRatio;
  const devicesStart = dashboardStart + 1;
  return {
    viewport,
    scroll,
    dashboardStart,
    devicesStart,
    landingProgress: clamp(scroll / viewport, 0, 1),
    postTopologyProgress: clamp((scroll - viewport) / viewport, 0, 1),
    patternProgress: clamp((scroll - viewport) / (viewport * (1 + patternSectionRatio)), 0, 1),
    dashboardProgress: clamp((scroll - viewport * (dashboardStart - 0.28)) / (viewport * 0.28), 0, 1),
    dashboardBgProgress: clamp((scroll - viewport * 2) / (viewport * patternSectionRatio), 0, 1),
    devicesProgress: clamp((scroll - viewport * (devicesStart - 0.34)) / (viewport * 0.34), 0, 1)
  };
}

function updatePresentationProgress() {
  const shell = document.getElementById("presentationShell");
  if (!shell || !document.body.classList.contains("presentation-mode")) return;
  const {
    landingProgress,
    postTopologyProgress,
    patternProgress,
    dashboardProgress,
    dashboardBgProgress,
    devicesProgress,
    scroll,
    viewport,
    dashboardStart,
    devicesStart
  } = getPresentationMetrics();
  const baseRgb = interpolateRgbArray(landingRgb, mapRgb, landingProgress);
  const stageRgb = interpolateRgb(baseRgb, dashboardRgb, dashboardBgProgress);
  const mapOpacity = Math.min(
    clamp((landingProgress - 0.18) * 1.45, 0, 1),
    clamp(1 - postTopologyProgress * 1.16, 0, 1)
  );
  const tunnelOpacity = clamp(landingProgress * 0.72, 0, 0.72) * clamp(1 - postTopologyProgress * 1.15, 0, 1);
  const patternOffset = (0.5 - patternProgress) * 92;

  shell.style.setProperty("--transition-progress", landingProgress.toFixed(4));
  shell.style.setProperty("--post-topology-progress", postTopologyProgress.toFixed(4));
  shell.style.setProperty("--dashboard-progress", dashboardProgress.toFixed(4));
  shell.style.setProperty("--devices-progress", devicesProgress.toFixed(4));
  shell.style.setProperty("--stage-bg-rgb", stageRgb);
  shell.style.setProperty("--landing-opacity", clamp(1 - landingProgress * 1.65, 0, 1).toFixed(4));
  shell.style.setProperty("--pattern-opacity", clamp(1 - landingProgress * 1.2, 0, 1).toFixed(4));
  const codeOpacity = clamp(1 - postTopologyProgress * 1.2, 0, 1);
  shell.style.setProperty("--code-opacity", codeOpacity.toFixed(4));
  shell.style.setProperty("--code-pointer", codeOpacity > 0.08 ? "auto" : "none");
  shell.style.setProperty("--map-opacity", mapOpacity.toFixed(4));
  shell.style.setProperty("--tunnel-opacity", tunnelOpacity.toFixed(4));
  shell.style.setProperty("--pattern-offset", `${patternOffset.toFixed(1)}px`);
  shell.style.setProperty("--dashboard-live-x", `${((1 - dashboardProgress) * 72).toFixed(1)}px`);
  shell.style.setProperty("--dashboard-run-x", `${((1 - dashboardProgress) * -86).toFixed(1)}px`);
  shell.style.setProperty("--dashboard-card-y", `${((1 - dashboardProgress) * 92).toFixed(1)}px`);
  shell.style.setProperty("--devices-header-y", `${((1 - devicesProgress) * 28).toFixed(1)}px`);
  shell.style.setProperty("--devices-carousel-y", `${((1 - devicesProgress) * 56).toFixed(1)}px`);
  document.body.style.setProperty("--stage-bg-rgb", stageRgb);
  if (scroll >= viewport * (devicesStart - 0.08)) {
    appState.selectedView = "devices";
  } else if (scroll >= viewport * (dashboardStart - 0.08)) {
    appState.selectedView = "dashboard";
  } else if (landingProgress > 0.55) {
    appState.selectedView = "topology";
  } else {
    appState.selectedView = "home";
  }
}

function enterPresentationMode(view = "home", behavior = "smooth") {
  document.body.classList.add("presentation-mode");
  document.body.classList.toggle("is-home", view === "home");
  appState.selectedView = view;
  renderShowcaseTopology();
  renderPresentationDashboard();
  renderPresentationDevices();
  renderDeviceHistory();
  updatePresentationProgress();
  const topologySection = document.getElementById("topologyShowcase");
  const dashboardSection = document.getElementById("presentationDashboard");
  const devicesSection = document.getElementById("presentationDevices");
  const targets = {
    home: 0,
    topology: topologySection?.offsetTop ?? window.innerHeight,
    dashboard: dashboardSection?.offsetTop ?? window.innerHeight * (2 + patternSectionRatio),
    devices: devicesSection?.offsetTop ?? window.innerHeight * (3 + patternSectionRatio)
  };
  const top = targets[view] ?? 0;
  window.scrollTo({ top, behavior });
  window.requestAnimationFrame(updatePresentationProgress);
  if (view === "home" && window.location.hash) {
    history.pushState(null, "", window.location.pathname + window.location.search);
  } else if (view !== "home" && window.location.hash !== `#${view}`) {
    history.pushState(null, "", `#${view}`);
  }
}

function enterAppMode(view) {
  document.body.classList.remove("presentation-mode", "is-home");
  appState.selectedView = view;
  window.scrollTo({ top: 0, behavior: "auto" });
}

function getPresentationAnchorTops() {
  const topologySection = document.getElementById("topologyShowcase");
  const dashboardSection = document.getElementById("presentationDashboard");
  const devicesSection = document.getElementById("presentationDevices");
  return [
    { name: "home", top: 0 },
    { name: "topology", top: topologySection?.offsetTop ?? window.innerHeight },
    { name: "dashboard", top: dashboardSection?.offsetTop ?? window.innerHeight * (2 + patternSectionRatio) },
    { name: "devices", top: devicesSection?.offsetTop ?? window.innerHeight * (3 + patternSectionRatio) }
  ];
}

function updatePresentationHashForView(view) {
  if (view === "home") {
    if (window.location.hash) history.pushState(null, "", window.location.pathname + window.location.search);
    return;
  }
  if (window.location.hash !== `#${view}`) {
    history.pushState(null, "", `#${view}`);
  }
}

function resetPresentationScrollHoldIfAwayFromAnchor() {
  if (!document.body.classList.contains("presentation-mode")) {
    presentationScrollHold.lockedUntil = 0;
    presentationScrollHold.targetName = "";
    return;
  }
  if (performance.now() >= presentationScrollHold.lockedUntil) {
    presentationScrollHold.lockedUntil = 0;
    presentationScrollHold.targetName = "";
  }
}

function canScrollElementInDirection(element, deltaY) {
  if (!element) return false;
  const maxScroll = element.scrollHeight - element.clientHeight;
  if (maxScroll <= 2) return false;
  if (deltaY > 0) return element.scrollTop < maxScroll - 2;
  return element.scrollTop > 2;
}

function getInternalScrollTarget(target, deltaY) {
  if (!(target instanceof Element)) return null;
  const internal = target.closest(".device-card-scroll, .devices-showcase.is-grid-view .devices-carousel");
  return canScrollElementInDirection(internal, deltaY) ? internal : null;
}

function nearestPresentationAnchorIndex(anchors, current) {
  let nearest = 0;
  let distance = Number.POSITIVE_INFINITY;
  anchors.forEach((anchor, index) => {
    const nextDistance = Math.abs(anchor.top - current);
    if (nextDistance < distance) {
      nearest = index;
      distance = nextDistance;
    }
  });
  return nearest;
}

function getNextPresentationAnchorIndex(anchors, current, direction) {
  const anchorTolerance = Math.max(12, window.innerHeight * 0.025);
  const nearest = nearestPresentationAnchorIndex(anchors, current);
  const nearestAnchor = anchors[nearest];
  const atAnchor = Math.abs(nearestAnchor.top - current) <= anchorTolerance;

  if (atAnchor) {
    return clamp(nearest + (direction === "down" ? 1 : -1), 0, anchors.length - 1);
  }

  if (direction === "down") {
    const next = anchors.findIndex((anchor) => anchor.top > current + anchorTolerance);
    return next === -1 ? anchors.length - 1 : next;
  }

  for (let index = anchors.length - 1; index >= 0; index -= 1) {
    if (anchors[index].top < current - anchorTolerance) return index;
  }
  return 0;
}

function maybeHoldPresentationWheel(event) {
  if (!document.body.classList.contains("presentation-mode")) return;
  const target = event.target instanceof Element ? event.target : null;
  if (getInternalScrollTarget(target, event.deltaY)) return;

  const direction = event.deltaY > 0 ? "down" : event.deltaY < 0 ? "up" : null;
  if (!direction) return;

  event.preventDefault();
  event.stopPropagation();

  const now = performance.now();
  if (now < presentationScrollHold.lockedUntil) return;

  const current = window.scrollY;
  const anchors = getPresentationAnchorTops();
  const currentIndex = nearestPresentationAnchorIndex(anchors, current);
  const nextIndex = getNextPresentationAnchorIndex(anchors, current, direction);
  const currentAnchor = anchors[currentIndex];
  const nextAnchor = anchors[nextIndex];
  if (!nextAnchor || nextIndex === currentIndex) return;

  const immediateLandingToMap = currentAnchor.name === "home" && nextAnchor.name === "topology" && direction === "down";
  window.scrollTo({ top: nextAnchor.top, behavior: "smooth" });
  window.requestAnimationFrame(updatePresentationProgress);
  updatePresentationHashForView(nextAnchor.name);

  if (immediateLandingToMap) {
    presentationScrollHold.lockedUntil = now + 520;
    presentationScrollHold.targetName = nextAnchor.name;
  } else {
    presentationScrollHold.lockedUntil = now + presentationScrollHoldMs + 420;
    presentationScrollHold.targetName = nextAnchor.name;
  }
}

function letterizeLandingTitle() {
  const title = document.querySelector('[data-letterize="true"]');
  if (!title || title.dataset.ready === "true") return;
  const lines = Array.from(title.children).map((line) => line.textContent.trim());
  const total = lines.reduce((count, line) => count + Array.from(line).length, 0);
  let index = 0;
  title.textContent = "";

  lines.forEach((line) => {
    const lineEl = document.createElement("span");
    lineEl.className = "title-line";
    Array.from(line).forEach((char) => {
      const charEl = document.createElement("span");
      charEl.className = char === " " ? "letter-space" : "letter";
      charEl.style.setProperty("--i", index);
      charEl.style.setProperty("--total", total);
      charEl.textContent = char === " " ? String.fromCharCode(160) : char;
      lineEl.append(charEl);
      index += 1;
    });
    title.append(lineEl);
  });

  title.dataset.ready = "true";
}

function formatBps(value) {
  if (value === null || value === undefined) return "n/a";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} Gbps`;
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)} Mbps`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} Kbps`;
  return `${value} bps`;
}

function formatSpeed(value) {
  if (!value) return "unknown";
  if (value >= 1000) return `${value / 1000} Gbps`;
  return `${value} Mbps`;
}

function statusLabel(status) {
  if (status === "up") return "UP";
  if (status === "down") return "DOWN";
  if (status === "warning") return "WARNING";
  if (status === "pending") return "PENDING";
  if (status === "observed") return "OBSERVED";
  return "UNKNOWN";
}

function stateLabel(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getDevices() {
  return appState.snapshot.devices;
}

function getManagedDevices() {
  return getDevices().filter((device) => device.status !== "pending");
}

function getDeviceById(id) {
  return getDevices().find((device) => device.id === id);
}

function getAlertCounts() {
  return appState.snapshot.alerts.reduce(
    (acc, alert) => {
      acc[alert.state] += 1;
      return acc;
    },
    { active: 0, acknowledged: 0, resolved: 0 }
  );
}

async function apiGet(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} failed with ${response.status}`);
  return response.json();
}

async function apiPost(path) {
  return apiPostJson(path);
}

async function apiPostJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    let detail = `${path} failed with ${response.status}`;
    try {
      const error = await response.json();
      detail = error.detail || detail;
    } catch {
      detail = response.statusText || detail;
    }
    throw new Error(detail);
  }
  return response.json();
}

function isSavedMapLayout(layout) {
  return layout?.source === "saved-map" && Number.isFinite(Number(layout.x)) && Number.isFinite(Number(layout.y));
}

function applySavedTopologyLayouts(positions, devices) {
  devices.forEach((device) => {
    if (!isSavedMapLayout(device.layout)) return;
    positions[device.id] = {
      x: Number(device.layout.x),
      y: Number(device.layout.y)
    };
  });
}

let topologyLayoutSaveTimer = null;

function saveTopologyLayoutSoon() {
  window.clearTimeout(topologyLayoutSaveTimer);
  topologyLayoutSaveTimer = window.setTimeout(async () => {
    const layouts = {};
    getDevices().forEach((device) => {
      const position = appState.topologyPositions[device.id];
      if (!position) return;
      layouts[device.id] = {
        x: Math.round(position.x * 10) / 10,
        y: Math.round(position.y * 10) / 10,
        locked: Boolean(device.layout?.locked)
      };
      device.layout = { ...layouts[device.id], source: "saved-map" };
    });
    if (Object.keys(layouts).length === 0) return;
    try {
      const result = await apiPostJson("/api/topology/layout", { layouts });
      if (result.snapshot) appState.snapshot = result.snapshot;
    } catch (error) {
      console.warn("Topology layout save failed", error);
    }
  }, 350);
}

function getPollingSettings() {
  return appState.snapshot.settings?.polling || {};
}

function getSeedSummaryText() {
  const seeds = appState.snapshot.seeds || [];
  const polling = getPollingSettings();
  const runtime = appState.snapshot.runtime || {};
  const mode = appState.snapshot.mode || "mock";
  const auto = polling.backend_auto_poll ? `auto ${polling.backend_interval_seconds || 30}s` : "manual poll";
  if (seeds.length === 0) return `${mode} mode / ${auto}`;
  const loadedCredentials = Number(runtime.seed_credentials_loaded || 0);
  const savedCredentials = Number(runtime.seed_credentials_saved || 0);
  if (mode === "live" && loadedCredentials === 0) {
    return savedCredentials > 0
      ? `${seeds.length} seed saved / credentials pending load`
      : `${seeds.length} seed saved / credentials missing`;
  }
  const ok = seeds.filter((seed) => seed.status === "up").length;
  const credentialSummary = savedCredentials > 0 ? ` / ${loadedCredentials} credentials loaded` : "";
  return `${seeds.length} seed / ${ok} up${credentialSummary} / ${auto}`;
}

function updateSeedSummary() {
  const summary = document.getElementById("presentationSeedSummary");
  if (summary) summary.textContent = getSeedSummaryText();
}

function updatePollActionButtons(isBusy = false) {
  const polling = getPollingSettings();
  const enabled = Boolean(polling.backend_auto_poll);
  const interval = Number(polling.backend_interval_seconds || 30);
  const label = enabled ? "Stop Poll" : "Run Poll";
  const title = enabled ? `Polling every ${interval}s` : "Start polling every 30 seconds";
  ["presentationRunPoll", "runPollButton"].forEach((id) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.disabled = isBusy;
    button.classList.toggle("is-running", enabled);
    button.setAttribute("aria-pressed", String(enabled));
    button.title = isBusy ? "Polling in progress" : title;
    const labelTarget = button.querySelector("span");
    if (labelTarget) {
      labelTarget.textContent = label;
    } else {
      button.textContent = label;
    }
  });
}

function setLiveSetupOpen(open) {
  const modal = document.getElementById("liveSetupModal");
  if (!modal) return;
  modal.hidden = !open;
  if (open) {
    syncSeedVersionFields();
    document.getElementById("presentationSeedHost")?.focus();
  }
}

async function loadSnapshot() {
  appState.snapshot = await apiGet("/api/snapshot");
  const backendState = document.getElementById("backendState");
  if (backendState) backendState.textContent = "Connected";
  renderAll();
}

function renderKpis() {
  const target = document.getElementById("kpiGrid");
  if (!target) return;
  const managed = getManagedDevices();
  const up = managed.filter((device) => device.status === "up").length;
  const warning = managed.filter((device) => device.status === "warning").length;
  const down = managed.filter((device) => device.status === "down").length;
  const counts = getAlertCounts();
  const pendingLinks = appState.snapshot.links.filter((link) => link.status === "pending").length;
  const kpis = [
    { label: "Managed devices", value: `${up}/${managed.length}`, trend: `${warning} warning, ${down} down` },
    { label: "Active alerts", value: counts.active, trend: `${counts.acknowledged} acknowledged` },
    { label: "LLDP links", value: appState.snapshot.links.length, trend: `${pendingLinks} pending` },
    { label: "Event stream", value: "WS", trend: document.getElementById("eventStreamState")?.textContent || "WebSocket pending" }
  ];

  target.innerHTML = kpis
    .map(
      (kpi) => `
        <article class="kpi-card">
          <div>
            <span class="eyebrow">${kpi.label}</span>
            <div class="kpi-value">${kpi.value}</div>
          </div>
          <span class="kpi-trend">${kpi.trend}</span>
        </article>
      `
    )
    .join("");
}

function renderDashboardAlertDetail() {
  const alerts = appState.snapshot.alerts;
  if (alerts.length === 0) {
    return `
      <section class="dashboard-card-detail dashboard-alert-detail">
        <div class="dashboard-detail-heading">
          <span>Alert queue</span>
          <strong>0</strong>
        </div>
        <p class="dashboard-detail-empty">No active alert details yet.</p>
      </section>
    `;
  }

  return `
    <section class="dashboard-card-detail dashboard-alert-detail" aria-label="Alert details">
      <div class="dashboard-detail-heading">
        <span>Alert queue</span>
        <strong>${alerts.length}</strong>
      </div>
      <div class="dashboard-alert-list">
        ${alerts
          .map((alert) => {
            const device = getDeviceById(alert.device_id);
            const canAck = alert.state === "active";
            const canResolve = alert.state !== "resolved";
            return `
              <article class="dashboard-alert-item">
                <div>
                  <strong>${escapeHtml(alert.title)}</strong>
                  <span>${escapeHtml(device ? device.name : "unknown device")}</span>
                  <p>${escapeHtml(alert.detail)}</p>
                </div>
                <span class="dashboard-alert-state ${escapeHtml(alert.state)}">${escapeHtml(stateLabel(alert.state))}</span>
                <div class="dashboard-alert-actions">
                  <button type="button" data-alert-action="ack" data-alert-id="${escapeHtml(alert.id)}" ${canAck ? "" : "disabled"}>Ack</button>
                  <button type="button" data-alert-action="resolve" data-alert-id="${escapeHtml(alert.id)}" ${canResolve ? "" : "disabled"}>Resolve</button>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderDashboardDeviceDetail() {
  const devices = getDevices();
  if (devices.length === 0) {
    return `
      <section class="dashboard-card-detail dashboard-device-detail">
        <div class="dashboard-detail-heading">
          <span>Discovered devices</span>
          <strong>0</strong>
        </div>
        <p class="dashboard-detail-empty">No devices discovered yet.</p>
      </section>
    `;
  }

  return `
    <section class="dashboard-card-detail dashboard-device-detail" aria-label="Discovered devices">
      <div class="dashboard-detail-heading">
        <span>Discovered devices</span>
        <strong>${devices.length}</strong>
      </div>
      <div class="dashboard-device-list">
        ${devices
          .map(
            (device) => `
              <article class="dashboard-device-item">
                <div>
                  <strong>${escapeHtml(device.name)}</strong>
                  <span>${escapeHtml(device.ip || "unknown")} / ${escapeHtml(device.vendor || "unknown")}</span>
                  <p>${escapeHtml(device.model || "Unknown model")}</p>
                </div>
                <span class="dashboard-device-status ${escapeHtml(device.status || "unknown")}">${escapeHtml(statusLabel(device.status))}</span>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderDashboardEventDetail() {
  const events = appState.snapshot.events.slice(0, 20);
  if (events.length === 0) {
    return `
      <section class="dashboard-card-detail dashboard-event-detail">
        <div class="dashboard-detail-heading">
          <span>Event log</span>
          <strong>0</strong>
        </div>
        <p class="dashboard-detail-empty">No event log entries yet.</p>
      </section>
    `;
  }

  return `
    <section class="dashboard-card-detail dashboard-event-detail" aria-label="Event log">
      <div class="dashboard-detail-heading">
        <span>Event log</span>
        <strong>${events.length}</strong>
      </div>
      <ol class="dashboard-event-log">
        ${events
          .map(
            (event) => `
              <li class="dashboard-event-item">
                <time>${escapeHtml(event.time)}</time>
                <span>${escapeHtml(event.text)}</span>
              </li>
            `
          )
          .join("")}
      </ol>
    </section>
  `;
}

function renderPresentationDashboard() {
  const cardsTarget = document.getElementById("presentationDashboardCards");
  const eventsTarget = document.getElementById("presentationEventList");
  if (!cardsTarget || !eventsTarget) return;

  const managed = getManagedDevices();
  const up = managed.filter((device) => device.status === "up").length;
  const warning = managed.filter((device) => device.status === "warning").length;
  const down = managed.filter((device) => device.status === "down").length;
  const counts = getAlertCounts();
  const pendingLinks = appState.snapshot.links.filter((link) => link.status === "pending").length;
  const streamState = document.getElementById("eventStreamState")?.textContent || "WebSocket pending";
  const cards = [
    {
      tone: "black",
      title: "Managed<br>Devices",
      value: `${up} / ${managed.length}`,
      foot: `${warning} warning, ${down} down`,
      icon: "/assets/media/intelligent-iteration-icon.svg",
      bg: "#0c0c0c",
      hoverBg: "#191919",
      fg: "#e9e9e9",
      detail: renderDashboardDeviceDetail()
    },
    {
      tone: "teal",
      title: "LLDP<br>Links",
      value: appState.snapshot.links.length,
      foot: `${pendingLinks} pending`,
      icon: "/assets/media/financial-support-icon.svg",
      bg: "#66a3ad",
      hoverBg: "#80bbc1",
      fg: "#080808"
    },
    {
      tone: "orange",
      title: "Active<br>Alerts",
      value: counts.active,
      foot: `${counts.acknowledged} acknowledged`,
      icon: "/assets/media/full-stack-support-icon.svg",
      bg: "#f36b42",
      hoverBg: "#ff825a",
      fg: "#080808",
      detail: renderDashboardAlertDetail()
    },
    {
      tone: "neutral",
      title: "Event<br>Stream",
      value: "WS",
      foot: streamState,
      icon: "/assets/media/exponential-foresight-icon.svg",
      bg: "#e8e8e8",
      hoverBg: "#f5f5f5",
      fg: "#080808",
      detail: renderDashboardEventDetail()
    }
  ];

  cardsTarget.innerHTML = cards
    .map(
      (card) => `
        <article
          class="dashboard-card"
          data-tone="${card.tone}"
          style="--card-bg:${card.bg};--card-hover-bg:${card.hoverBg};--card-fg:${card.fg};"
        >
          <h3 class="dashboard-card-title">${card.title}</h3>
          <img class="dashboard-card-icon" src="${card.icon}" alt="" />
          <strong class="dashboard-card-value">${escapeHtml(card.value)}</strong>
          <span class="dashboard-card-foot">${escapeHtml(card.foot)}</span>
          ${card.detail || ""}
        </article>
      `
    )
    .join("");
  bindAlertActionButtons(cardsTarget);
  bindDashboardCardReveal(cardsTarget);

  const events = appState.snapshot.events.length
    ? appState.snapshot.events.slice(0, 20)
    : [{ time: "--:--:--", text: "Waiting for worker events" }];
  eventsTarget.innerHTML = events
    .map((event) => `<li><time>${escapeHtml(event.time)}</time> - ${escapeHtml(event.text)}</li>`)
    .join("");
  updateSeedSummary();
  updatePollActionButtons();
}

function getDeviceSummary(device) {
  const interfaces = device.interfaces || [];
  return interfaces.reduce(
    (acc, iface) => {
      if (iface.admin_status === "up") acc.adminUp += 1;
      if (iface.oper_status === "up") acc.operUp += 1;
      acc.inBps += iface.in_bps || 0;
      acc.outBps += iface.out_bps || 0;
      acc.errors += (iface.in_errors || 0) + (iface.out_errors || 0);
      acc.discards += (iface.in_discards || 0) + (iface.out_discards || 0);
      return acc;
    },
    { adminUp: 0, operUp: 0, inBps: 0, outBps: 0, errors: 0, discards: 0 }
  );
}

function getEndpointTraffic(device) {
  return device?.device_type === "endpoint" && device.observed_traffic ? device.observed_traffic : null;
}

function formatEndpointTraffic(device) {
  const traffic = getEndpointTraffic(device);
  if (!traffic) return "traffic n/a";
  const suffix = traffic.shared_port ? " shared port" : "estimated";
  return `${formatBps(traffic.endpoint_in_bps)} down / ${formatBps(traffic.endpoint_out_bps)} up (${suffix})`;
}

function formatInterfaceTraffic(iface, device) {
  if (device?.device_type === "endpoint" && iface.traffic_source === "switch-port") {
    return `${formatBps(iface.in_bps)} down / ${formatBps(iface.out_bps)} up`;
  }
  return `${formatBps(iface.in_bps)} in / ${formatBps(iface.out_bps)} out`;
}

function normalizeMacKey(value) {
  const text = String(value || "").toLowerCase().replace(/[^a-f0-9]/g, "");
  return text.length === 12 ? text : "";
}

function formatMacKey(value) {
  const key = normalizeMacKey(value);
  if (!key) return "";
  return key.match(/.{1,2}/g).join(":");
}

function isSnmpNamedSwitch(device) {
  if (!device || device.device_type === "endpoint" || device.device_type === "segment") return false;
  if (device.name_source === "mac-label") return false;
  if (device.seed_key || device.lldp_sys_name || device.lldp_mgmt_ip) return true;
  if (String(device.id || "").startsWith("live-")) return true;
  return (device.interfaces || []).length > 0 && Boolean(device.ip && device.ip !== "unknown");
}

function getDeviceMacCandidates(device) {
  const candidates = [
    device?.asset_mac,
    device?.mac,
    device?.observed_mac,
    device?.chassis_id,
    device?.fingerprint,
    ...(device?.observed_macs || [])
  ];
  const seen = new Set();
  return candidates
    .map(formatMacKey)
    .filter((mac) => {
      const key = normalizeMacKey(mac);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getDeviceMac(device) {
  return getDeviceMacCandidates(device)[0] || "";
}

function getMacLabelForMac(mac) {
  const key = normalizeMacKey(mac);
  return appState.snapshot.mac_labels?.[key] || {};
}

function getMacLabel(device, mac = "") {
  const key = normalizeMacKey(mac || getDeviceMac(device));
  return appState.snapshot.mac_labels?.[key] || device?.asset_label || {};
}

function getDeviceLabel(device) {
  return appState.snapshot.device_labels?.[device?.id] || device?.device_label || {};
}

function renderMacLabelEditor(device) {
  if (isSnmpNamedSwitch(device)) return "";
  const macs = getDeviceMacCandidates(device);
  const hasMacTarget = macs.length > 0;
  const mac = macs[0] || "";
  const label = hasMacTarget ? getMacLabel(device) : getDeviceLabel(device);
  const macInput = macs.length > 1
    ? `
      <label>
        <span>MAC address</span>
        <select name="mac">
          ${macs
            .map((candidate) => {
              const candidateLabel = getMacLabelForMac(candidate);
              const suffix = candidateLabel.name ? ` - ${candidateLabel.name}` : "";
              return `<option value="${escapeHtml(candidate)}" ${normalizeMacKey(candidate) === normalizeMacKey(mac) ? "selected" : ""}>${escapeHtml(candidate + suffix)}</option>`;
            })
            .join("")}
        </select>
      </label>
    `
    : hasMacTarget
      ? `<input name="mac" type="hidden" value="${escapeHtml(mac)}" />`
      : `<input name="device_id" type="hidden" value="${escapeHtml(device.id || "")}" />`;
  const descriptor = macs.length > 1
    ? `${macs.length} observed MACs available`
    : hasMacTarget
      ? `${mac} follows this asset across switch ports.`
      : "Saved to this observed port-description endpoint; no MAC is available yet.";
  return `
    <form class="mac-label-form" data-mac-label-form data-label-target="${hasMacTarget ? "mac" : "device"}" data-mac="${escapeHtml(mac)}" data-device-id="${escapeHtml(device.id || "")}">
      ${macInput}
      <label>
        <span>Asset name</span>
        <input name="name" type="text" maxlength="160" value="${escapeHtml(label.name || "")}" placeholder="${escapeHtml(device.name || "Endpoint")}" />
      </label>
      <label>
        <span>Description</span>
        <input name="description" type="text" maxlength="400" value="${escapeHtml(label.description || "")}" placeholder="Saved by MAC address" />
      </label>
      <button type="submit">Save MAC</button>
      <small data-mac-label-status>${escapeHtml(descriptor)}</small>
    </form>
  `;
}

function compactList(values, limit = 5) {
  const items = (values || []).filter(Boolean).map(String);
  if (items.length <= limit) return items.join(", ");
  return `${items.slice(0, limit).join(", ")} +${items.length - limit}`;
}

function formatInterfaceVlans(iface) {
  const pvid = iface.vlan_pvid ? `PVID ${iface.vlan_pvid}` : "";
  const tagged = compactList(iface.vlan_tagged || []);
  const untagged = compactList(iface.vlan_untagged || []);
  const parts = [];
  if (pvid) parts.push(pvid);
  if (untagged) parts.push(`untagged ${untagged}`);
  if (tagged) parts.push(`tagged ${tagged}`);
  return parts.join(" / ") || "VLAN n/a";
}

function summarizeDeviceVlans(device) {
  const vlans = new Set();
  (device.interfaces || []).forEach((iface) => {
    (iface.vlans || []).forEach((vlan) => vlans.add(String(vlan)));
    if (iface.vlan_pvid) vlans.add(String(iface.vlan_pvid));
  });
  return compactList([...vlans].sort((a, b) => Number(a) - Number(b)), 8) || "n/a";
}

function renderPresentationDeviceInterfaces(device) {
  const interfaces = device.interfaces || [];
  if (interfaces.length === 0) {
    return `<li class="device-interface-item"><strong>No interfaces discovered</strong><span>SNMP IF-MIB returned no rows</span></li>`;
  }

  return interfaces
    .map(
      (iface) => `
        <li class="device-interface-item">
          <div>
            <strong>${escapeHtml(iface.name || iface.if_descr || "Interface")}</strong>
            <span>${escapeHtml(iface.if_alias || iface.if_descr || "no alias")}</span>
            <span>${escapeHtml(formatInterfaceTraffic(iface, device))}</span>
            <span>${escapeHtml(formatInterfaceVlans(iface))}</span>
            ${iface.traffic_source === "switch-port" ? `<span>${escapeHtml(iface.traffic_note || "estimated from switch port")}</span>` : ""}
            <span>${escapeHtml(String((iface.in_errors || 0) + (iface.out_errors || 0)))} errors / ${escapeHtml(String((iface.in_discards || 0) + (iface.out_discards || 0)))} discards</span>
          </div>
          <span class="device-interface-state ${escapeHtml(iface.oper_status || "unknown")}">${escapeHtml(iface.admin_status || "n/a")} / ${escapeHtml(iface.oper_status || "n/a")}</span>
        </li>
      `
    )
    .join("");
}

function renderPresentationDevices() {
  const section = document.getElementById("presentationDevices");
  const track = document.getElementById("devicesTrack");
  const carousel = document.getElementById("devicesCarousel");
  if (!section || !track || !carousel) return;
  section.classList.toggle("is-grid-view", appState.monitorViewMode === "grid");
  updateMonitorViewControls();

  const devices = getDevices();
  const selectedFromId = devices.findIndex((device) => device.id === appState.selectedDeviceId);
  if (selectedFromId >= 0) {
    appState.selectedDeviceIndex = selectedFromId;
  }
  appState.selectedDeviceIndex = clamp(appState.selectedDeviceIndex, 0, Math.max(0, devices.length - 1));

  if (devices.length === 0) {
    track.innerHTML = `
      <article class="device-card devices-placeholder-card is-active" data-device-card data-device-index="0">
        <strong>No devices yet</strong>
        <span>Add a live seed switch or use mock data to populate the monitor.</span>
      </article>
    `;
    bindDeviceCarousel();
    updateDeviceCarousel();
    return;
  }

  track.innerHTML = devices
    .map((device, index) => {
      const summary = getDeviceSummary(device);
      const interfaces = device.interfaces || [];
      const endpointTraffic = getEndpointTraffic(device);
      const sourceLabel = device.device_type === "endpoint"
        ? `${device.observed_source || "MAC table"}${device.observed_vlan ? ` / VLAN ${device.observed_vlan}` : ""}`
        : device.device_type === "segment"
          ? `${device.observed_mac_count || 0} MACs / ${device.observed_source || "MAC table"}`
        : device.lldp_sys_name
          ? "LLDP neighbor"
          : "SNMP seed";
      const portLabel = device.observed_local_port || device.lldp_local_port || "n/a";
      const trafficLabel = endpointTraffic
        ? `${formatBps(endpointTraffic.endpoint_in_bps)} down<br>${formatBps(endpointTraffic.endpoint_out_bps)} up`
        : `${formatBps(summary.inBps)} in<br>${formatBps(summary.outBps)} out`;
      const trafficSourceLabel = endpointTraffic
        ? `${endpointTraffic.switch_name || "switch"} / ${endpointTraffic.switch_port || portLabel}${endpointTraffic.shared_port ? ` / ${endpointTraffic.shared_endpoint_count} endpoints` : ""}`
        : "direct interface counters";
      const vlanSummary = summarizeDeviceVlans(device);
      const observedMacs = device.observed_macs || [];
      const observedMacList = observedMacs.slice(0, 6).map((mac) => escapeHtml(mac)).join("<br>");
      const observedMacMore = observedMacs.length > 6 ? `<br>+${observedMacs.length - 6}` : "";
      return `
        <article class="device-card" data-device-card data-device-index="${index}" data-device-card-id="${escapeHtml(device.id)}">
          <header class="device-card-head">
            <h3>${escapeHtml(device.name || "Unknown device")}</h3>
            <span class="device-card-status ${escapeHtml(device.status || "unknown")}">${escapeHtml(statusLabel(device.status))}</span>
          </header>
          <div class="device-card-mark" aria-hidden="true">
            <span></span><span></span><span></span><span></span>
          </div>
          <div class="device-card-scroll">
            <div class="device-facts">
              <div class="device-fact"><span>Management IP</span><strong>${escapeHtml(device.ip || "unknown")}</strong></div>
              <div class="device-fact"><span>Vendor</span><strong>${escapeHtml(device.vendor || "unknown")}</strong></div>
              <div class="device-fact"><span>Model</span><strong>${escapeHtml(device.model || "unknown")}</strong></div>
              ${device.description ? `<div class="device-fact"><span>Description</span><strong>${escapeHtml(device.description)}</strong></div>` : ""}
              <div class="device-fact"><span>Source</span><strong>${escapeHtml(sourceLabel)}</strong></div>
              <div class="device-fact"><span>Switch port</span><strong>${escapeHtml(portLabel)}</strong></div>
              ${device.device_type === "segment" ? `<div class="device-fact"><span>Observed MACs</span><strong>${observedMacList}${observedMacMore}</strong></div>` : ""}
              <div class="device-fact"><span>Interfaces</span><strong>${summary.operUp}/${interfaces.length} oper up</strong></div>
              <div class="device-fact"><span>Traffic</span><strong>${trafficLabel}</strong></div>
              <div class="device-fact"><span>VLANs</span><strong>${escapeHtml(vlanSummary)}</strong></div>
              <div class="device-fact"><span>Traffic source</span><strong>${escapeHtml(trafficSourceLabel)}</strong></div>
              <div class="device-fact"><span>Errors</span><strong>${summary.errors} errors<br>${summary.discards} discards</strong></div>
            </div>
            ${renderMacLabelEditor(device)}
            <ol class="device-interface-list">
              ${renderPresentationDeviceInterfaces(device)}
            </ol>
          </div>
          <span class="device-card-foot">${escapeHtml(device.fingerprint || "no fingerprint")}</span>
        </article>
      `;
    })
    .join("");

  bindDeviceCarousel();
  bindMacLabelForms(track);
  updateDeviceCarousel();
}

function updateMonitorViewControls() {
  document.querySelectorAll("[data-monitor-view]").forEach((button) => {
    const isActive = button.dataset.monitorView === appState.monitorViewMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function setMonitorViewMode(mode) {
  appState.monitorViewMode = mode === "grid" ? "grid" : "carousel";
  try {
    window.localStorage.setItem("netwatch.monitorViewMode", appState.monitorViewMode);
  } catch {
    // Ignore private-mode storage failures; the in-memory setting still works.
  }
  renderPresentationDevices();
  updateDeviceCarousel();
}

function setSelectedDeviceIndex(index) {
  const devices = getDevices();
  if (devices.length === 0) {
    appState.selectedDeviceIndex = 0;
    return;
  }
  appState.selectedDeviceIndex = clamp(index, 0, devices.length - 1);
  appState.selectedDeviceId = devices[appState.selectedDeviceIndex]?.id || "";
  updateDeviceCarousel();
}

function openMonitorForDevice(deviceId, behavior = "smooth") {
  if (!getDeviceById(deviceId)) return;
  appState.selectedDeviceId = deviceId;
  const index = getDevices().findIndex((device) => device.id === deviceId);
  if (index >= 0) appState.selectedDeviceIndex = index;
  renderPresentationDevices();
  updateDeviceCarousel();
  switchView("devices", behavior);
}

function setHistoryOverlayOpen(open, updateHash = true) {
  appState.historyOverlayOpen = open;
  document.body.classList.toggle("history-overlay-open", open);
  if (open) {
    if (updateHash && window.location.hash !== "#history") {
      history.pushState(null, "", "#history");
    }
  } else if (updateHash && window.location.hash === "#history") {
    history.pushState(null, "", "#devices");
  }
}

async function openDeviceHistory(deviceId, behavior = "smooth") {
  if (!getDeviceById(deviceId)) return;
  appState.selectedDeviceId = deviceId;
  appState.historyDeviceId = deviceId;
  const index = getDevices().findIndex((device) => device.id === deviceId);
  if (index >= 0) appState.selectedDeviceIndex = index;
  enterPresentationMode("devices", behavior);
  try {
    appState.deviceHistory = await apiGet(`/api/devices/${encodeURIComponent(deviceId)}/history`);
  } catch (error) {
    appState.deviceHistory = { error: error.message, device: getDeviceById(deviceId), interfaces: [] };
  }
  renderDeviceHistory();
  setHistoryOverlayOpen(true);
}

function historySampleValue(sample) {
  const inBps = Number(sample?.in_bps || 0);
  const outBps = Number(sample?.out_bps || 0);
  return Math.max(0, inBps, outBps);
}

function historyBuckets(samples, columns = 18) {
  const now = Date.now() / 1000;
  const start = now - 3600;
  const width = 3600 / columns;
  const buckets = Array.from({ length: columns }, () => []);
  samples.forEach((sample) => {
    const ts = Number(sample.ts || 0);
    if (!Number.isFinite(ts)) return;
    const index = clamp(Math.floor((ts - start) / width), 0, columns - 1);
    buckets[index].push(historySampleValue(sample));
  });
  return buckets.map((bucket) => (bucket.length ? Math.max(...bucket) : 0));
}

function renderHistoryGrid(samples, capacity) {
  const columns = 18;
  const rows = 7;
  const values = historyBuckets(samples, columns);
  const maxObserved = Math.max(...values, 1);
  const maxCapacity = Number(capacity || 0) > 0 ? Number(capacity) * 1_000_000 : 0;
  const denominator = Math.max(maxObserved, maxCapacity * 0.18, 1);
  let cells = "";
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const normalized = values[column] / denominator;
      const height = Math.max(values[column] > 0 ? 1 : 0, Math.round(normalized * rows));
      const active = rows - row <= height;
      cells += `<span class="history-pill ${active ? "is-active" : ""}" aria-hidden="true"></span>`;
    }
  }
  return cells;
}

function renderDeviceHistory() {
  const section = document.getElementById("deviceHistory");
  const title = document.getElementById("historyDeviceName");
  const meta = document.getElementById("historyDeviceMeta");
  const list = document.getElementById("historyInterfaceList");
  if (!section || !title || !meta || !list) return;

  const device = appState.deviceHistory?.device || getDeviceById(appState.historyDeviceId || appState.selectedDeviceId);
  if (!device) {
    title.textContent = "Interface History";
    meta.textContent = "";
    list.innerHTML = `<article class="history-empty">No device selected</article>`;
    return;
  }

  title.textContent = device.name || "Interface History";
  meta.textContent = `${device.ip || "unknown"} / ${device.vendor || "unknown"} / ${device.model || "unknown"}`;
  const interfaces = appState.deviceHistory?.interfaces || [];
  if (appState.deviceHistory?.error) {
    list.innerHTML = `<article class="history-empty">${escapeHtml(appState.deviceHistory.error)}</article>`;
    return;
  }
  if (interfaces.length === 0) {
    list.innerHTML = `<article class="history-empty">No interfaces available</article>`;
    return;
  }

  list.innerHTML = interfaces
    .map((iface) => {
      const samples = iface.samples || [];
      const latest = samples[samples.length - 1] || {};
      return `
        <article class="history-interface-card">
          <div class="history-interface-meta">
            <span>${escapeHtml(iface.name || "Interface")}</span>
            <strong>${escapeHtml(formatBps(historySampleValue(latest)))}</strong>
            <small>${escapeHtml(iface.if_alias || "no alias")} / ${escapeHtml(iface.admin_status || "n/a")} ${escapeHtml(iface.oper_status || "n/a")}</small>
          </div>
          <div class="history-pill-grid" aria-label="${escapeHtml(iface.name || "Interface")} last hour traffic">
            ${renderHistoryGrid(samples, iface.if_high_speed)}
          </div>
        </article>
      `;
    })
    .join("");
}

function updateDeviceCarousel(dragOffset = 0) {
  const section = document.getElementById("presentationDevices");
  const carousel = document.getElementById("devicesCarousel");
  const track = document.getElementById("devicesTrack");
  if (!carousel || !track) return;
  const cards = Array.from(track.querySelectorAll("[data-device-card]"));
  const prev = document.getElementById("devicePrevButton");
  const next = document.getElementById("deviceNextButton");
  const isGrid = appState.monitorViewMode === "grid";

  section?.classList.toggle("is-grid-view", isGrid);
  updateMonitorViewControls();

  if (cards.length === 0) {
    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
    return;
  }

  if (isGrid) {
    track.style.transform = "";
    track.classList.remove("is-dragging");
    cards.forEach((card) => card.classList.add("is-active"));
    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
    return;
  }

  appState.selectedDeviceIndex = clamp(appState.selectedDeviceIndex, 0, cards.length - 1);
  const carouselRect = carousel.getBoundingClientRect();
  const cardWidth = cards[0].offsetWidth || cards[0].getBoundingClientRect().width;
  const styles = getComputedStyle(track);
  const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
  const baseOffset = carouselRect.width / 2 - cardWidth / 2;
  const x = baseOffset - appState.selectedDeviceIndex * (cardWidth + gap) + dragOffset;
  track.style.transform = `translate3d(${x.toFixed(1)}px, -50%, 0)`;

  cards.forEach((card, index) => {
    card.classList.toggle("is-active", index === appState.selectedDeviceIndex);
  });
  if (prev) prev.disabled = appState.selectedDeviceIndex === 0;
  if (next) next.disabled = appState.selectedDeviceIndex === cards.length - 1;
}

function bindDeviceCarousel() {
  const track = document.getElementById("devicesTrack");
  if (!track || track.dataset.bound === "true") return;
  track.dataset.bound = "true";

  track.addEventListener("pointerdown", (event) => {
    if (appState.monitorViewMode !== "carousel") return;
    if (event.button !== 0) return;
    if (event.target.closest("input, textarea, button, select, label, [data-mac-label-form]")) return;
    appState.deviceCarouselDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      currentX: event.clientX,
      moved: false
    };
    track.classList.add("is-dragging");
    track.setPointerCapture(event.pointerId);
  });

  track.addEventListener("pointermove", (event) => {
    if (appState.monitorViewMode !== "carousel") return;
    const drag = appState.deviceCarouselDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.currentX = event.clientX;
    if (Math.abs(drag.currentX - drag.startX) > 8) drag.moved = true;
    updateDeviceCarousel(drag.currentX - drag.startX);
  });

  function finishDrag(event) {
    if (appState.monitorViewMode !== "carousel") {
      appState.deviceCarouselDrag = null;
      track.classList.remove("is-dragging");
      return;
    }
    const drag = appState.deviceCarouselDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = drag.currentX - drag.startX;
    appState.deviceCarouselSuppressClick = drag.moved || Math.abs(delta) > 8;
    appState.deviceCarouselDrag = null;
    track.classList.remove("is-dragging");
    if (delta < -80) {
      setSelectedDeviceIndex(appState.selectedDeviceIndex + 1);
    } else if (delta > 80) {
      setSelectedDeviceIndex(appState.selectedDeviceIndex - 1);
    } else {
      updateDeviceCarousel();
    }
  }

  track.addEventListener("pointerup", finishDrag);
  track.addEventListener("pointercancel", finishDrag);
  track.addEventListener("click", (event) => {
    if (event.target.closest("input, textarea, button, select, label, [data-mac-label-form]")) return;
    const card = event.target.closest("[data-device-card]");
    if (!card || !track.contains(card)) return;
    if (appState.deviceCarouselSuppressClick) {
      appState.deviceCarouselSuppressClick = false;
      return;
    }
    const index = Number(card.dataset.deviceIndex || 0);
    setSelectedDeviceIndex(index);
    const deviceId = card.dataset.deviceCardId || getDevices()[index]?.id;
    if (deviceId) openDeviceHistory(deviceId);
  });
}

function bindAlertActionButtons(scope = document) {
  scope.querySelectorAll("[data-alert-action]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const action = button.dataset.alertAction;
      const alertId = button.dataset.alertId;
      const result = await apiPost(`/api/alerts/${alertId}/${action}`);
      appState.snapshot = result.snapshot;
      renderAll();
    });
  });
}

function bindMacLabelForms(scope = document) {
  scope.querySelectorAll("[data-mac-label-form]").forEach((form) => {
    if (form.dataset.bound === "true") return;
    form.dataset.bound = "true";
    form.addEventListener("click", (event) => event.stopPropagation());
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const status = form.querySelector("[data-mac-label-status]");
      const submit = form.querySelector("button[type='submit']");
      const isDeviceLabel = form.dataset.labelTarget === "device";
      const payload = {
        ...(isDeviceLabel
          ? { device_id: form.elements.device_id?.value || form.dataset.deviceId || "" }
          : { mac: form.elements.mac?.value || form.dataset.mac || "" }),
        name: form.elements.name?.value?.trim() || "",
        description: form.elements.description?.value?.trim() || ""
      };
      if (status) status.textContent = isDeviceLabel ? "Saving device label..." : "Saving MAC label...";
      if (submit) submit.disabled = true;
      try {
        const result = await apiPostJson(isDeviceLabel ? "/api/device-labels" : "/api/mac-labels", payload);
        appState.snapshot = result.snapshot;
        renderAll();
      } catch (error) {
        if (status) status.textContent = error.message;
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  });
}

function getDashboardCardMaxReveal(card) {
  const row = card.closest(".dashboard-card-row");
  if (!row || window.matchMedia("(max-width: 980px)").matches) return 0;
  const visibleHeight = row.getBoundingClientRect().height || window.innerHeight * 0.58;
  const renderedHeight = card.getBoundingClientRect().height;
  const contentHeight = Math.max(card.scrollHeight, renderedHeight);
  return Math.max(0, contentHeight - visibleHeight + 36);
}

function setDashboardCardReveal(card, value) {
  const next = clamp(value, 0, getDashboardCardMaxReveal(card));
  card.dataset.reveal = String(Math.round(next));
  card.style.setProperty("--card-reveal-y", `${next.toFixed(1)}px`);
}

function activateDashboardCard(card, scope = document) {
  scope.querySelectorAll(".dashboard-card").forEach((otherCard) => {
    if (otherCard === card) return;
    otherCard.classList.remove("is-interacting");
    setDashboardCardReveal(otherCard, 0);
  });
  card.classList.add("is-interacting");
}

function deactivateDashboardCard(card) {
  card.classList.remove("is-interacting");
  setDashboardCardReveal(card, 0);
}

function bindDashboardCardReveal(scope = document) {
  scope.querySelectorAll(".dashboard-card").forEach((card) => {
    if (card.dataset.revealBound === "true") return;
    card.dataset.revealBound = "true";
    setDashboardCardReveal(card, Number(card.dataset.reveal || 0));
    card.addEventListener(
      "wheel",
      (event) => {
        activateDashboardCard(card, scope);
        const current = Number(card.dataset.reveal || 0);
        const next = current + event.deltaY * 0.7;
        const maxReveal = getDashboardCardMaxReveal(card);
        const bounded = clamp(next, 0, maxReveal);
        if (bounded !== current) {
          event.preventDefault();
          event.stopPropagation();
          setDashboardCardReveal(card, bounded);
        }
      },
      { passive: false }
    );
    card.addEventListener("pointerenter", () => activateDashboardCard(card, scope));
    card.addEventListener("mouseenter", () => activateDashboardCard(card, scope));
    card.addEventListener("pointerleave", () => deactivateDashboardCard(card));
    card.addEventListener("mouseleave", () => deactivateDashboardCard(card));
  });
  if (scope.dataset.revealScopeBound !== "true") {
    scope.dataset.revealScopeBound = "true";
    scope.addEventListener("pointerover", (event) => {
      const card = event.target.closest(".dashboard-card");
      if (card && scope.contains(card)) activateDashboardCard(card, scope);
    });
    scope.addEventListener("mouseover", (event) => {
      const card = event.target.closest(".dashboard-card");
      if (card && scope.contains(card)) activateDashboardCard(card, scope);
    });
    scope.addEventListener("pointerleave", () => {
      scope.querySelectorAll(".dashboard-card").forEach((card) => deactivateDashboardCard(card));
    });
    scope.addEventListener("mouseleave", () => {
      scope.querySelectorAll(".dashboard-card").forEach((card) => deactivateDashboardCard(card));
    });
  }
}

function renderDashboardDevices() {
  const target = document.getElementById("dashboardDeviceList");
  if (!target) return;
  if (getDevices().length === 0) {
    target.innerHTML = `
      <article class="device-row">
        <div class="device-name">
          <strong>No live devices yet</strong>
          <span>Open Settings and import an SNMP seed switch.</span>
        </div>
      </article>
    `;
    return;
  }
  target.innerHTML = getDevices()
    .map(
      (device) => `
        <article class="device-row">
          <div class="device-name">
            <strong>${device.name}</strong>
            <span>${device.model}</span>
          </div>
          <span>${device.ip}</span>
          <span>${device.vendor}</span>
          <span class="status-pill ${device.status}">${statusLabel(device.status)}</span>
        </article>
      `
    )
    .join("");
}

function renderEvents() {
  const target = document.getElementById("eventList");
  if (!target) return;
  target.innerHTML = appState.snapshot.events
    .map(
      (event) => `
        <li>
          <time>${event.time}</time>
          ${event.text}
        </li>
      `
    )
    .join("");
}

function renderDevicesTable() {
  const table = document.getElementById("devicesTable");
  const detailTitle = document.getElementById("deviceDetailTitle");
  const detail = document.getElementById("deviceDetail");
  if (!table || !detailTitle || !detail) return;
  if (getDevices().length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="4">No live devices yet. Add a seed switch from Settings.</td>
      </tr>
    `;
    detailTitle.textContent = "No device selected";
    detail.innerHTML = "";
    return;
  }
  table.innerHTML = getDevices()
    .map(
      (device) => `
        <tr class="clickable-row" data-device-id="${device.id}">
          <td><strong>${device.name}</strong><br><span class="muted">${device.model}</span></td>
          <td>${device.ip}</td>
          <td>${device.vendor}</td>
          <td><span class="status-pill ${device.status}">${statusLabel(device.status)}</span></td>
        </tr>
      `
    )
    .join("");

  document.querySelectorAll("[data-device-id]").forEach((row) => {
    row.addEventListener("click", () => {
      appState.selectedDeviceId = row.dataset.deviceId;
      renderDeviceDetail();
    });
  });
}

function renderDeviceDetail() {
  const detailTitle = document.getElementById("deviceDetailTitle");
  const detail = document.getElementById("deviceDetail");
  if (!detailTitle || !detail) return;
  const device = getDeviceById(appState.selectedDeviceId) || getDevices()[0];
  if (!device) return;
  appState.selectedDeviceId = device.id;
  const endpointTraffic = getEndpointTraffic(device);
  detailTitle.textContent = device.name;
  detail.innerHTML = `
    <dl class="settings-list">
      <div><dt>Management IP</dt><dd>${device.ip}</dd></div>
      <div><dt>Vendor</dt><dd>${device.vendor}</dd></div>
      <div><dt>Model</dt><dd>${device.model}</dd></div>
      <div><dt>Fingerprint</dt><dd>${device.fingerprint}</dd></div>
      ${device.description ? `<div><dt>Description</dt><dd>${escapeHtml(device.description)}</dd></div>` : ""}
      ${endpointTraffic ? `<div><dt>Traffic source</dt><dd>${escapeHtml(endpointTraffic.switch_name || "switch")} / ${escapeHtml(endpointTraffic.switch_port || "port")} (${escapeHtml(endpointTraffic.note || "estimated")})</dd></div>` : ""}
    </dl>
    ${renderMacLabelEditor(device)}
    <div class="interface-list">
      ${device.interfaces
        .map(
          (iface) => `
            <article class="interface-item">
              <div>
                <strong>${iface.name}</strong>
                <span class="muted">${iface.if_alias || iface.if_descr || "no alias"}</span>
              </div>
              <span class="status-pill ${iface.admin_status === "up" ? "up" : "neutral"}">admin ${iface.admin_status}</span>
              <span class="status-pill ${iface.oper_status === "up" ? "up" : iface.oper_status === "down" ? "down" : "neutral"}">oper ${iface.oper_status}</span>
              <span class="muted">${escapeHtml(formatInterfaceTraffic(iface, device)).replace(" / ", "<br>")}</span>
              <span class="muted">${escapeHtml(formatInterfaceVlans(iface)).replaceAll(" / ", "<br>")}</span>
              <span class="muted">${iface.in_errors + iface.out_errors} errors<br>${iface.in_discards + iface.out_discards} discards</span>
              <span class="muted">${formatSpeed(iface.if_high_speed)}</span>
            </article>
          `
        )
        .join("")}
    </div>
  `;
  bindMacLabelForms(detail);
}

function renderTopology() {
  const canvas = document.getElementById("topologyCanvas");
  const svg = document.getElementById("linkLayer");
  const nodes = document.getElementById("nodeLayer");
  if (!canvas || !svg || !nodes) return;
  const width = canvas.clientWidth || 900;
  const height = canvas.clientHeight || 560;
  const nodeWidth = 165;
  const nodeHeight = 92;
  const margin = 24;
  const designWidth = 900;
  const designHeight = 540;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  if (getDevices().length === 0) {
    svg.innerHTML = "";
    nodes.innerHTML = `
      <div class="topology-empty">
        <strong>No topology yet</strong>
        <span>Add a live SNMP seed to discover LLDP neighbors.</span>
      </div>
    `;
    return;
  }

  const normalized = new Map(
    getDevices().map((device) => [
      device.id,
      {
        ...device,
        x: margin + (device.layout.x / designWidth) * Math.max(1, width - nodeWidth - margin * 2),
        y: margin + (device.layout.y / designHeight) * Math.max(1, height - nodeHeight - margin * 2)
      }
    ])
  );

  svg.innerHTML = appState.snapshot.links
    .map((link) => {
      const from = normalized.get(link.from);
      const to = normalized.get(link.to);
      if (!from || !to) return "";
      const x1 = from.x + nodeWidth / 2;
      const y1 = from.y + nodeHeight / 2;
      const x2 = to.x + nodeWidth / 2;
      const y2 = to.y + nodeHeight / 2;
      const stroke = link.status === "confirmed" ? "#1c7f5a" : "#a76505";
      const dash = link.status === "pending" ? "8 7" : "0";
      const label = [link.local_port, link.remote_port].filter(Boolean).join(" -> ");
      const labelSvg = label
        ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}" class="link-label">${escapeHtml(label)}</text>`
        : "";
      return `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="3" stroke-dasharray="${dash}" stroke-linecap="round" />${labelSvg}</g>`;
    })
    .join("");

  nodes.innerHTML = [...normalized.values()]
    .map(
      (device) => `
        <button class="topology-node ${device.status}" type="button" style="left:${device.x}px;top:${device.y}px" data-node-device="${device.id}">
          <span class="node-title">
            ${device.name}
            <span class="status-pill ${device.status}">${statusLabel(device.status)}</span>
          </span>
          <span class="node-meta">${device.ip}<br>${device.model}</span>
        </button>
      `
    )
    .join("");

  document.querySelectorAll("[data-node-device]").forEach((node) => {
    node.addEventListener("click", () => {
      appState.selectedDeviceId = node.dataset.nodeDevice;
      switchView("devices");
      renderDeviceDetail();
    });
  });
}

function topologyDeviceLabel(deviceMap, id) {
  const device = deviceMap.get(id);
  return `${device?.name || id} ${device?.ip || ""}`.toLowerCase();
}

function compareTopologyDeviceIds(deviceMap) {
  return (a, b) => topologyDeviceLabel(deviceMap, a).localeCompare(topologyDeviceLabel(deviceMap, b));
}

function getTopologySignature(devices, links) {
  const layoutVersion = "diagram-v1";
  const nodePart = devices.map((device) => device.id).sort().join("|");
  const linkPart = links
    .map((link) => [link.from, link.to].sort().join("<>"))
    .sort()
    .join("|");
  return `${layoutVersion}::${nodePart}::${linkPart}`;
}

function getValidTopologyLinks(devices, links) {
  const ids = new Set(devices.map((device) => device.id));
  return links.filter((link) => ids.has(link.from) && ids.has(link.to) && link.from !== link.to);
}

function buildTopologyAdjacency(devices, links) {
  const adjacency = new Map(devices.map((device) => [device.id, new Set()]));
  getValidTopologyLinks(devices, links).forEach((link) => {
    adjacency.get(link.from)?.add(link.to);
    adjacency.get(link.to)?.add(link.from);
  });
  return adjacency;
}

function getTopologyComponents(devices, adjacency, deviceMap) {
  const visited = new Set();
  const components = [];
  const ids = devices.map((device) => device.id).sort(compareTopologyDeviceIds(deviceMap));

  ids.forEach((id) => {
    if (visited.has(id)) return;
    const stack = [id];
    const component = [];
    visited.add(id);
    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      [...(adjacency.get(current) || [])]
        .sort(compareTopologyDeviceIds(deviceMap))
        .forEach((next) => {
          if (visited.has(next)) return;
          visited.add(next);
          stack.push(next);
        });
    }
    components.push(component.sort(compareTopologyDeviceIds(deviceMap)));
  });

  return components.sort((a, b) => b.length - a.length || compareTopologyDeviceIds(deviceMap)(a[0], b[0]));
}

function getTopologyChainOrder(component, adjacency, deviceMap) {
  const compare = compareTopologyDeviceIds(deviceMap);
  const endpoints = component.filter((id) => (adjacency.get(id)?.size || 0) <= 1).sort(compare);
  const start = endpoints[0] || [...component].sort(compare)[0];
  const order = [];
  const visited = new Set();
  let current = start;
  let previous = "";

  while (current && !visited.has(current)) {
    order.push(current);
    visited.add(current);
    const next = [...(adjacency.get(current) || [])]
      .filter((id) => id !== previous && !visited.has(id))
      .sort(compare)[0];
    previous = current;
    current = next;
  }

  component
    .filter((id) => !visited.has(id))
    .sort(compare)
    .forEach((id) => order.push(id));
  return order;
}

function getTopologyBfsLevels(root, component, adjacency, deviceMap) {
  const compare = compareTopologyDeviceIds(deviceMap);
  const componentIds = new Set(component);
  const visited = new Set([root]);
  const queue = [{ id: root, level: 0 }];
  const levels = [];

  while (queue.length) {
    const current = queue.shift();
    levels[current.level] ||= [];
    levels[current.level].push(current.id);
    [...(adjacency.get(current.id) || [])]
      .filter((id) => componentIds.has(id) && !visited.has(id))
      .sort(compare)
      .forEach((id) => {
        visited.add(id);
        queue.push({ id, level: current.level + 1 });
      });
  }

  component
    .filter((id) => !visited.has(id))
    .sort(compare)
    .forEach((id) => {
      levels[levels.length] = [id];
    });

  return levels.map((level) => level.sort(compare));
}

function normalizeRelativePositions(items, cardWidth, cardHeight) {
  const minX = Math.min(...items.map((item) => item.x));
  const minY = Math.min(...items.map((item) => item.y));
  const normalized = items.map((item) => ({ id: item.id, x: item.x - minX, y: item.y - minY }));
  const maxX = Math.max(...normalized.map((item) => item.x));
  const maxY = Math.max(...normalized.map((item) => item.y));
  return {
    items: normalized,
    width: maxX + cardWidth,
    height: maxY + cardHeight
  };
}

function layoutTopologyGrid(ids, spacingX, spacingY, maxRows, cardWidth, cardHeight) {
  return normalizeRelativePositions(
    ids.map((id, index) => ({
      id,
      x: Math.floor(index / maxRows) * spacingX,
      y: (index % maxRows) * spacingY
    })),
    cardWidth,
    cardHeight
  );
}

function layoutTopologyComponent(component, adjacency, deviceMap, spacingX, spacingY, maxRows, cardWidth, cardHeight) {
  const compare = compareTopologyDeviceIds(deviceMap);
  if (component.length === 1) {
    return normalizeRelativePositions([{ id: component[0], x: 0, y: 0 }], cardWidth, cardHeight);
  }

  const degrees = component.map((id) => ({ id, degree: adjacency.get(id)?.size || 0 }));
  const maxDegree = Math.max(...degrees.map((item) => item.degree));
  if (maxDegree <= 2) {
    return layoutTopologyGrid(getTopologyChainOrder(component, adjacency, deviceMap), spacingX, spacingY, maxRows, cardWidth, cardHeight);
  }

  const root = degrees
    .sort((a, b) => b.degree - a.degree || compare(a.id, b.id))[0]
    .id;
  const levels = getTopologyBfsLevels(root, component, adjacency, deviceMap);
  const items = [];
  let column = 0;

  levels.forEach((level, levelIndex) => {
    for (let offset = 0; offset < level.length; offset += maxRows) {
      const chunk = level.slice(offset, offset + maxRows);
      chunk.forEach((id, row) => {
        items.push({
          id,
          x: column * spacingX,
          y: row * spacingY
        });
      });
      column += 1;
    }
    if (levelIndex === 0 && levels[1]?.length) {
      const rootItem = items.find((item) => item.id === root);
      const visibleRows = Math.min(maxRows, levels[1].length);
      if (rootItem) rootItem.y = ((visibleRows - 1) * spacingY) / 2;
    }
  });

  return normalizeRelativePositions(items, cardWidth, cardHeight);
}

function isTopologyEndpoint(device) {
  return device?.device_type === "endpoint" || String(device?.id || "").startsWith("endpoint-");
}

function isTopologySegment(device) {
  return device?.device_type === "segment" || String(device?.id || "").startsWith("segment-");
}

function isTopologyPeripheral(device) {
  return isTopologyEndpoint(device) || isTopologySegment(device);
}

function getTopologyParentMap(devices, links, deviceMap) {
  const ids = new Set(devices.map((device) => device.id));
  const parentByChild = new Map();
  const childrenByParent = new Map();

  getValidTopologyLinks(devices, links).forEach((link) => {
    if (!ids.has(link.from) || !ids.has(link.to)) return;
    const from = deviceMap.get(link.from);
    const to = deviceMap.get(link.to);
    const fromPeripheral = isTopologyPeripheral(from);
    const toPeripheral = isTopologyPeripheral(to);
    if (fromPeripheral === toPeripheral) return;
    const parentId = fromPeripheral ? link.to : link.from;
    const childId = fromPeripheral ? link.from : link.to;
    if (parentByChild.has(childId)) return;
    parentByChild.set(childId, parentId);
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) || []), childId]);
  });

  childrenByParent.forEach((children, parentId) => {
    childrenByParent.set(parentId, children.sort(compareTopologyDeviceIds(deviceMap)));
  });

  return { parentByChild, childrenByParent };
}

function getRenderableTopologyLinks(devices, links) {
  const deviceMap = new Map(devices.map((device) => [device.id, device]));
  const { parentByChild } = getTopologyParentMap(devices, links, deviceMap);
  return getValidTopologyLinks(devices, links).filter((link) => {
    const from = deviceMap.get(link.from);
    const to = deviceMap.get(link.to);
    const fromPeripheral = isTopologyPeripheral(from);
    const toPeripheral = isTopologyPeripheral(to);
    if (fromPeripheral === toPeripheral) return true;
    const parentId = fromPeripheral ? link.to : link.from;
    const childId = fromPeripheral ? link.from : link.to;
    return parentByChild.get(childId) === parentId;
  });
}

function getCoreTopologyLevels(coreIds, links, deviceMap) {
  const coreSet = new Set(coreIds);
  const compare = compareTopologyDeviceIds(deviceMap);
  const coreAdjacency = new Map(coreIds.map((id) => [id, new Set()]));
  getValidTopologyLinks([...coreSet].map((id) => deviceMap.get(id)).filter(Boolean), links).forEach((link) => {
    if (coreSet.has(link.from) && coreSet.has(link.to)) {
      coreAdjacency.get(link.from)?.add(link.to);
      coreAdjacency.get(link.to)?.add(link.from);
    }
  });

  const root = coreIds
    .map((id) => ({ id, degree: coreAdjacency.get(id)?.size || 0 }))
    .sort((a, b) => b.degree - a.degree || compare(a.id, b.id))[0]?.id || coreIds[0];
  const levels = getTopologyBfsLevels(root, coreIds, coreAdjacency, deviceMap);
  return { root, levels };
}

function getTopologyRootId(coreIds, adjacency, deviceMap) {
  const sternpunkt = coreIds.find((id) => {
    const device = deviceMap.get(id);
    return `${device?.name || ""} ${device?.ip || ""}`.toLowerCase().includes("sternpunkt");
  });
  if (sternpunkt) return sternpunkt;
  return coreIds
    .map((id) => ({ id, degree: adjacency.get(id)?.size || 0 }))
    .sort((a, b) => b.degree - a.degree || compareTopologyDeviceIds(deviceMap)(a.id, b.id))[0]?.id || coreIds[0];
}

function getCoreTree(rootId, coreIds, links, deviceMap) {
  const coreSet = new Set(coreIds);
  const adjacency = new Map(coreIds.map((id) => [id, new Set()]));
  getValidTopologyLinks(coreIds.map((id) => deviceMap.get(id)).filter(Boolean), links).forEach((link) => {
    if (coreSet.has(link.from) && coreSet.has(link.to)) {
      adjacency.get(link.from)?.add(link.to);
      adjacency.get(link.to)?.add(link.from);
    }
  });

  const compare = compareTopologyDeviceIds(deviceMap);
  const parentByCore = new Map();
  const levels = [[rootId]];
  const visited = new Set([rootId]);
  let queue = [{ id: rootId, level: 0 }];
  while (queue.length) {
    const current = queue.shift();
    [...(adjacency.get(current.id) || [])]
      .filter((id) => !visited.has(id))
      .sort(compare)
      .forEach((id) => {
        visited.add(id);
        parentByCore.set(id, current.id);
        levels[current.level + 1] ||= [];
        levels[current.level + 1].push(id);
        queue.push({ id, level: current.level + 1 });
      });
  }

  coreIds
    .filter((id) => !visited.has(id))
    .sort(compare)
    .forEach((id) => {
      levels[1] ||= [];
      levels[1].push(id);
      parentByCore.set(id, rootId);
    });

  return { adjacency, parentByCore, levels: levels.map((level) => level.sort(compare)) };
}

function zoneVector(index, total) {
  const presets = {
    1: [{ x: 1, y: 0 }],
    2: [{ x: -1, y: 0 }, { x: 1, y: 0 }],
    3: [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
    4: [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }],
    5: [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    6: [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 1 }, { x: 1, y: 1 }]
  };
  if (presets[total]?.[index]) return presets[total][index];
  const angle = -Math.PI / 2 + (index / Math.max(1, total)) * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function radialVector(index, total, phase = -Math.PI / 2) {
  const angle = phase + (index / Math.max(1, total)) * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function normalizedVector(vector, fallback = { x: 1, y: 0 }) {
  const length = Math.hypot(vector.x, vector.y);
  if (length < 0.001) return fallback;
  return { x: vector.x / length, y: vector.y / length };
}

function placeSatelliteGroup(children, parent, side, positions, cursor, options) {
  const { cardHeight, satelliteX, satelliteY, deviceMap } = options;
  if (!children.length || !parent) return;
  const rows = children.length;
  const groupHeight = (rows - 1) * satelliteY + cardHeight;
  const startY = Math.max(cursor.top, parent.y + cardHeight / 2 - groupHeight / 2);
  const direction = side === "left" ? -1 : 1;
  const ordered = [...children].sort(compareTopologyDeviceIds(deviceMap));

  ordered.forEach((id, index) => {
    positions[id] = {
      x: parent.x + direction * satelliteX,
      y: startY + index * satelliteY
    };
  });
}

function placeEndpointZone(children, parentId, rootId, positions, options) {
  const { rootCenter, cardWidth, cardHeight, endpointRadius, endpointSpread, deviceMap } = options;
  const parent = positions[parentId];
  if (!parent || !children.length) return;
  const ordered = [...children].sort(compareTopologyDeviceIds(deviceMap));
  const parentCenter = { x: parent.x + cardWidth / 2, y: parent.y + cardHeight / 2 };
  const away = normalizedVector(
    parentId === rootId
      ? { x: 0, y: 1 }
      : { x: parentCenter.x - rootCenter.x, y: parentCenter.y - rootCenter.y },
    { x: 0, y: 1 }
  );
  const baseAngle = Math.atan2(away.y, away.x);
  const maxPerRing = 5;
  for (let offset = 0; offset < ordered.length; offset += maxPerRing) {
    const ring = Math.floor(offset / maxPerRing);
    const group = ordered.slice(offset, offset + maxPerRing);
    const spread = Math.min(Math.PI * 0.78, endpointSpread + group.length * 0.075);
    const step = group.length > 1 ? spread / (group.length - 1) : 0;
    const radius = endpointRadius + ring * (cardHeight * 1.02);
    group.forEach((id, index) => {
      const angle = baseAngle - spread / 2 + step * index;
      positions[id] = {
        x: parentCenter.x + Math.cos(angle) * radius - cardWidth / 2,
        y: parentCenter.y + Math.sin(angle) * radius - cardHeight / 2
      };
    });
  }
}

function getTopologyLayoutNodeSize(id, deviceMap, cardWidth, cardHeight) {
  const device = deviceMap.get(id);
  if (isTopologyEndpoint(device)) {
    return { width: cardWidth * 0.78, height: cardHeight * 0.62 };
  }
  return { width: cardWidth, height: cardHeight };
}

function resolveTopologyPositionOverlaps(positions, ids, deviceMap, cardWidth, cardHeight, gap = 34) {
  const sortedIds = [...ids].filter((id) => positions[id]);
  for (let pass = 0; pass < sortedIds.length; pass += 1) {
    let changed = false;
    sortedIds.sort((a, b) => positions[a].y - positions[b].y || positions[a].x - positions[b].x);
    for (let i = 0; i < sortedIds.length; i += 1) {
      for (let j = i + 1; j < sortedIds.length; j += 1) {
        const aId = sortedIds[i];
        const bId = sortedIds[j];
        const a = positions[sortedIds[i]];
        const b = positions[sortedIds[j]];
        const aDevice = deviceMap.get(aId);
        const bDevice = deviceMap.get(bId);
        const aEndpoint = isTopologyEndpoint(aDevice);
        const bEndpoint = isTopologyEndpoint(bDevice);
        const aSize = getTopologyLayoutNodeSize(aId, deviceMap, cardWidth, cardHeight);
        const bSize = getTopologyLayoutNodeSize(bId, deviceMap, cardWidth, cardHeight);
        const xOverlap = Math.min(a.x + aSize.width, b.x + bSize.width) - Math.max(a.x, b.x);
        const yOverlap = Math.min(a.y + aSize.height, b.y + bSize.height) - Math.max(a.y, b.y);
        if (xOverlap <= -gap || yOverlap <= -gap) continue;
        if (aEndpoint && !bEndpoint) {
          const aCenterY = a.y + aSize.height / 2;
          const bCenterY = b.y + bSize.height / 2;
          a.y = aCenterY <= bCenterY ? b.y - aSize.height - gap : b.y + bSize.height + gap;
          changed = true;
          continue;
        }
        b.y = a.y + aSize.height + gap;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

function getTopologyBounds(positions, ids, deviceMap, cardWidth, cardHeight) {
  return ids.reduce(
    (acc, id) => {
      const pos = positions[id];
      if (!pos) return acc;
      const size = getTopologyLayoutNodeSize(id, deviceMap, cardWidth, cardHeight);
      acc.minX = Math.min(acc.minX, pos.x);
      acc.minY = Math.min(acc.minY, pos.y);
      acc.maxX = Math.max(acc.maxX, pos.x + size.width);
      acc.maxY = Math.max(acc.maxY, pos.y + size.height);
      return acc;
    },
    { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: 0, maxY: 0 }
  );
}

function computeShowcaseTopologyLayout(devices, links, width, height, cardWidth, cardHeight) {
  const deviceMap = new Map(devices.map((device) => [device.id, device]));
  const validLinks = getValidTopologyLinks(devices, links);
  const margin = 240;
  const coreRadius = clamp(Math.min(width, height) * 0.76, 560, 900);
  const treeStepX = clamp(cardWidth + 330, 600, 740);
  const treeStepY = clamp(cardHeight + 190, 520, 680);
  const endpointRadius = clamp(cardWidth + 220, 440, 560);
  const endpointSpread = Math.PI * 0.52;
  const logicalWidthBase = Math.max(width * 2.15, coreRadius * 2 + endpointRadius * 2 + cardWidth + margin * 2);
  const logicalHeightBase = Math.max(height * 2.05, coreRadius * 2 + endpointRadius * 2 + cardHeight + margin * 2);
  const rootCenter = { x: logicalWidthBase / 2, y: logicalHeightBase / 2 };
  const positions = {};

  if (validLinks.length === 0) {
    const sortedIds = devices.map((device) => device.id).sort(compareTopologyDeviceIds(deviceMap));
    const grid = layoutTopologyGrid(sortedIds, endpointRadius, cardHeight + 74, Math.max(2, Math.ceil(Math.sqrt(sortedIds.length))), cardWidth, cardHeight);
    grid.items.forEach((item) => {
      positions[item.id] = { x: margin + item.x, y: margin + item.y };
    });
    return {
      positions,
      width: Math.max(logicalWidthBase, margin + grid.width + margin),
      height: Math.max(logicalHeightBase, margin + grid.height + margin)
    };
  }

  const { parentByChild, childrenByParent } = getTopologyParentMap(devices, links, deviceMap);
  const coreDevices = devices.filter((device) => !isTopologyEndpoint(device));
  const peripheralWithoutParent = devices.filter((device) => isTopologyPeripheral(device) && !parentByChild.has(device.id));
  const coreIds = coreDevices.map((device) => device.id).sort(compareTopologyDeviceIds(deviceMap));
  const coreAdjacency = buildTopologyAdjacency(coreDevices, validLinks.filter((link) => {
    const from = deviceMap.get(link.from);
    const to = deviceMap.get(link.to);
    return from && to && !isTopologyPeripheral(from) && !isTopologyPeripheral(to);
  }));

  const rootId = getTopologyRootId(coreIds, coreAdjacency, deviceMap);
  positions[rootId] = { x: rootCenter.x - cardWidth / 2, y: rootCenter.y - cardHeight / 2 };
  const { parentByCore, levels } = getCoreTree(rootId, coreIds, validLinks, deviceMap);
  const firstLevel = (levels[1] || []).sort(compareTopologyDeviceIds(deviceMap));
  const zoneByCore = new Map([[rootId, { x: 0, y: 0 }]]);

  firstLevel.forEach((id, index) => {
    const vector = firstLevel.length <= 6 ? zoneVector(index, firstLevel.length) : radialVector(index, firstLevel.length);
    zoneByCore.set(id, vector);
    positions[id] = {
      x: rootCenter.x + vector.x * coreRadius - cardWidth / 2,
      y: rootCenter.y + vector.y * coreRadius - cardHeight / 2
    };
  });

  levels.slice(2).forEach((level, levelIndex) => {
    const siblingsByParent = new Map();
    level.forEach((id) => {
      const parentId = parentByCore.get(id) || rootId;
      siblingsByParent.set(parentId, [...(siblingsByParent.get(parentId) || []), id]);
    });
    siblingsByParent.forEach((siblings, parentId) => {
      const parent = positions[parentId] || positions[rootId];
      const inherited = normalizedVector(zoneByCore.get(parentId) || { x: 1, y: 0 });
      const tangent = { x: -inherited.y, y: inherited.x };
      const offsetStart = -((siblings.length - 1) * treeStepY) / 2;
      siblings.sort(compareTopologyDeviceIds(deviceMap)).forEach((id, index) => {
        zoneByCore.set(id, inherited);
        positions[id] = {
          x: parent.x + inherited.x * treeStepX + tangent.x * (offsetStart + index * treeStepY),
          y: parent.y + inherited.y * treeStepX + tangent.y * (offsetStart + index * treeStepY)
        };
      });
    });
    level.forEach((id) => {
      if (positions[id]) return;
      const parentId = parentByCore.get(id) || rootId;
      const parent = positions[parentId] || positions[rootId];
      const vector = normalizedVector(zoneByCore.get(parentId) || { x: 1, y: 0 });
      zoneByCore.set(id, vector);
      positions[id] = {
        x: parent.x + vector.x * treeStepX,
        y: parent.y + vector.y * treeStepX
      };
    });
  });

  coreIds
    .filter((id) => !positions[id])
    .forEach((id, index) => {
      const vector = zoneVector(index, Math.max(1, coreIds.length));
      zoneByCore.set(id, vector);
      positions[id] = {
        x: rootCenter.x + vector.x * coreRadius - cardWidth / 2,
        y: rootCenter.y + vector.y * coreRadius - cardHeight / 2
      };
    });

  coreIds.forEach((parentId) => {
    placeEndpointZone(childrenByParent.get(parentId) || [], parentId, rootId, positions, {
      rootCenter,
      cardWidth,
      cardHeight,
      endpointRadius,
      endpointSpread,
      deviceMap
    });
  });

  if (peripheralWithoutParent.length) {
    const orphanIds = peripheralWithoutParent.map((device) => device.id).sort(compareTopologyDeviceIds(deviceMap));
    const grid = layoutTopologyGrid(orphanIds, endpointRadius, cardHeight + 56, Math.max(2, Math.ceil(Math.sqrt(orphanIds.length))), cardWidth, cardHeight);
    grid.items.forEach((item) => {
      positions[item.id] = { x: margin + item.x, y: logicalHeightBase + item.y };
    });
  }

  const allPositionedIds = devices.map((device) => device.id).filter((id) => positions[id]);
  resolveTopologyPositionOverlaps(positions, allPositionedIds, deviceMap, cardWidth, cardHeight);
  applySavedTopologyLayouts(positions, devices);
  const bounds = getTopologyBounds(positions, allPositionedIds, deviceMap, cardWidth, cardHeight);
  if (bounds.minX < margin) {
    const shift = margin - bounds.minX;
    allPositionedIds.forEach((id) => {
      positions[id].x += shift;
    });
    bounds.maxX += shift;
  }
  if (bounds.minY < margin) {
    const shift = margin - bounds.minY;
    allPositionedIds.forEach((id) => {
      positions[id].y += shift;
    });
    bounds.maxY += shift;
  }

  return {
    positions,
    width: Math.max(logicalWidthBase, bounds.maxX + margin),
    height: Math.max(logicalHeightBase, bounds.maxY + margin),
    focus: positions[rootId]
      ? { x: positions[rootId].x + cardWidth / 2, y: positions[rootId].y + cardHeight / 2 }
      : rootCenter
  };
}

function fitShowcaseZoom(logicalWidth, logicalHeight, stageWidth, stageHeight) {
  const fit = Math.min(1, (stageWidth - 8) / Math.max(1, logicalWidth), (stageHeight - 8) / Math.max(1, logicalHeight));
  return clamp(fit, 0.44, 1);
}

function updateShowcaseZoomControls() {
  const zoomIn = document.getElementById("showcaseZoomIn");
  const zoomOut = document.getElementById("showcaseZoomOut");
  if (!zoomIn || !zoomOut) return;
  zoomIn.disabled = appState.topologyZoom >= 1.75;
  zoomOut.disabled = appState.topologyZoom <= 0.28;
}

function clampShowcasePan(pan = appState.topologyPan) {
  const stage = document.getElementById("showcaseMap");
  if (!stage) return { x: 0, y: 0 };
  const zoom = appState.topologyZoom || 1;
  const logicalWidth = appState.topologyLogicalSize.width || stage.clientWidth || 1;
  const logicalHeight = appState.topologyLogicalSize.height || stage.clientHeight || 1;
  const scaledWidth = logicalWidth * zoom;
  const scaledHeight = logicalHeight * zoom;
  const slack = 180;
  const minX = scaledWidth <= stage.clientWidth ? stage.clientWidth - scaledWidth - slack : stage.clientWidth - scaledWidth;
  const minY = scaledHeight <= stage.clientHeight ? stage.clientHeight - scaledHeight - slack : stage.clientHeight - scaledHeight;
  const maxX = scaledWidth <= stage.clientWidth ? slack : 0;
  const maxY = scaledHeight <= stage.clientHeight ? slack : 0;
  return {
    x: clamp(pan.x, minX, maxX),
    y: clamp(pan.y, minY, maxY)
  };
}

function applyShowcasePan() {
  const stage = document.getElementById("showcaseMap");
  if (!stage) return;
  appState.topologyPan = clampShowcasePan(appState.topologyPan);
  stage.style.setProperty("--topology-pan-x", `${appState.topologyPan.x.toFixed(1)}px`);
  stage.style.setProperty("--topology-pan-y", `${appState.topologyPan.y.toFixed(1)}px`);
  requestAnimationFrame(renderShowcaseLinks);
}

function centerShowcaseOn(point) {
  const stage = document.getElementById("showcaseMap");
  if (!stage || !point) return;
  const zoom = appState.topologyZoom || 1;
  appState.topologyPan = {
    x: stage.clientWidth / 2 - point.x * zoom,
    y: stage.clientHeight / 2 - point.y * zoom
  };
  applyShowcasePan();
}

function applyShowcaseZoom() {
  const stage = document.getElementById("showcaseMap");
  if (stage) stage.style.setProperty("--topology-zoom", appState.topologyZoom.toFixed(3));
  applyShowcasePan();
  updateShowcaseZoomControls();
  requestAnimationFrame(renderShowcaseLinks);
}

function setShowcaseZoom(value, userSet = true) {
  appState.topologyZoom = clamp(value, 0.28, 1.75);
  if (userSet) appState.topologyZoomUserSet = true;
  applyShowcaseZoom();
}

function getAppliedShowcaseZoom() {
  const stage = document.getElementById("showcaseMap");
  const applied = Number.parseFloat(getComputedStyle(stage).getPropertyValue("--topology-zoom"));
  return Number.isFinite(applied) ? applied : appState.topologyZoom || 1;
}

function logicalPointFromClient(event, stageRect, zoom) {
  return {
    x: (event.clientX - stageRect.left - appState.topologyPan.x) / zoom,
    y: (event.clientY - stageRect.top - appState.topologyPan.y) / zoom
  };
}

function defaultShowcasePosition(device, index, total, width, height, cardWidth, cardHeight) {
  if (total === 2) {
    const presets = [
      { x: width * 0.14, y: height * 0.24 },
      { x: width * 0.52, y: height * 0.14 }
    ];
    return {
      x: clamp(presets[index].x, 32, Math.max(32, width - cardWidth - 36)),
      y: clamp(presets[index].y, 126, Math.max(126, height - cardHeight - 42))
    };
  }

  const layout = device.layout || {};
  if (typeof layout.x === "number" && typeof layout.y === "number") {
    const x = 56 + (layout.x / 900) * Math.max(1, width - cardWidth - 150);
    const y = 138 + (layout.y / 540) * Math.max(1, height - cardHeight - 260);
    return {
      x: clamp(x, 32, Math.max(32, width - cardWidth - 36)),
      y: clamp(y, 126, Math.max(126, height - cardHeight - 42))
    };
  }

  const span = Math.max(1, total - 1);
  const x = width * (0.14 + (index / span) * 0.48);
  const y = height * (0.22 + (index % 3) * 0.18);
  return {
    x: clamp(x, 32, Math.max(32, width - cardWidth - 36)),
    y: clamp(y, 126, Math.max(126, height - cardHeight - 42))
  };
}

function getLogicalNodeBox(node, stageRect, zoom) {
  const rect = node.getBoundingClientRect();
  return {
    left: (rect.left - stageRect.left - appState.topologyPan.x) / zoom,
    top: (rect.top - stageRect.top - appState.topologyPan.y) / zoom,
    width: rect.width / zoom,
    height: rect.height / zoom,
    get right() {
      return this.left + this.width;
    },
    get bottom() {
      return this.top + this.height;
    },
    get cx() {
      return this.left + this.width / 2;
    },
    get cy() {
      return this.top + this.height / 2;
    }
  };
}

function getStableLogicalNodeBox(node) {
  const position = appState.topologyPositions[node.dataset.showcaseNode] || {
    x: Number.parseFloat(node.style.left) || 0,
    y: Number.parseFloat(node.style.top) || 0
  };
  return {
    left: position.x,
    top: position.y,
    width: node.offsetWidth,
    height: node.offsetHeight,
    get right() {
      return this.left + this.width;
    },
    get bottom() {
      return this.top + this.height;
    },
    get cx() {
      return this.left + this.width / 2;
    },
    get cy() {
      return this.top + this.height / 2;
    }
  };
}

function getEdgePoint(box, targetBox) {
  const dx = targetBox.cx - box.cx;
  const dy = targetBox.cy - box.cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: dx >= 0 ? box.right : box.left,
      y: clamp(targetBox.cy, box.top + 24, box.bottom - 24)
    };
  }
  return {
    x: clamp(targetBox.cx, box.left + 28, box.right - 28),
    y: dy >= 0 ? box.bottom : box.top
  };
}

function showcaseLinkPoints(fromPoint, toPoint) {
  const dx = Math.abs(toPoint.x - fromPoint.x);
  const dy = Math.abs(toPoint.y - fromPoint.y);
  if (dx >= dy) {
    const midX = (fromPoint.x + toPoint.x) / 2;
    return [fromPoint, { x: midX, y: fromPoint.y }, { x: midX, y: toPoint.y }, toPoint];
  }
  const midY = (fromPoint.y + toPoint.y) / 2;
  return [fromPoint, { x: fromPoint.x, y: midY }, { x: toPoint.x, y: midY }, toPoint];
}

function pointsToSvgPath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function pathScore(points, fromId, toId, boxesById) {
  let hits = 0;
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const segmentLength = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    length += segmentLength;
    const steps = Math.max(3, Math.ceil(segmentLength / 28));
    for (let step = 1; step < steps; step += 1) {
      const p = {
        x: a.x + ((b.x - a.x) * step) / steps,
        y: a.y + ((b.y - a.y) * step) / steps
      };
      for (const [id, box] of boxesById) {
        if (id === fromId || id === toId) continue;
        if (p.x > box.left + 8 && p.x < box.right - 8 && p.y > box.top + 8 && p.y < box.bottom - 8) {
          hits += 1;
          break;
        }
      }
    }
  }
  return hits * 1_000_000 + length;
}

function chooseShowcaseLinkPoints(fromPoint, toPoint, fromId, toId, boxesById) {
  const boxes = [...boxesById.values()];
  const minX = Math.min(...boxes.map((box) => box.left));
  const maxX = Math.max(...boxes.map((box) => box.right));
  const minY = Math.min(...boxes.map((box) => box.top));
  const maxY = Math.max(...boxes.map((box) => box.bottom));
  const xLanes = [Math.min(fromPoint.x, toPoint.x) - 72, Math.max(fromPoint.x, toPoint.x) + 72, minX - 76, maxX + 76];
  const yLanes = [Math.min(fromPoint.y, toPoint.y) - 72, Math.max(fromPoint.y, toPoint.y) + 72, minY - 72, maxY + 72];
  const candidates = [
    showcaseLinkPoints(fromPoint, toPoint),
    ...xLanes.map((x) => [fromPoint, { x, y: fromPoint.y }, { x, y: toPoint.y }, toPoint]),
    ...yLanes.map((y) => [fromPoint, { x: fromPoint.x, y }, { x: toPoint.x, y }, toPoint])
  ];
  return candidates
    .map((points) => ({ points, score: pathScore(points, fromId, toId, boxesById) }))
    .sort((a, b) => a.score - b.score)[0].points;
}

function renderShowcaseLinks() {
  const stage = document.getElementById("showcaseMap");
  const plane = document.getElementById("showcaseMapPlane");
  const svg = document.getElementById("showcaseLinkLayer");
  if (!stage || !plane || !svg) return;

  const logicalWidth = appState.topologyLogicalSize.width || stage.clientWidth || 1;
  const logicalHeight = appState.topologyLogicalSize.height || stage.clientHeight || 1;
  const devices = getDevices();
  const linksToRender = getRenderableTopologyLinks(devices, appState.snapshot.links || []);
  svg.setAttribute("viewBox", `0 0 ${logicalWidth} ${logicalHeight}`);
  svg.setAttribute("width", String(logicalWidth));
  svg.setAttribute("height", String(logicalHeight));
  svg.innerHTML = linksToRender
    .map((link) => {
      const from = document.querySelector(`[data-showcase-node="${CSS.escape(link.from)}"]`);
      const to = document.querySelector(`[data-showcase-node="${CSS.escape(link.to)}"]`);
      if (!from || !to) return "";
      const fromBox = getStableLogicalNodeBox(from);
      const toBox = getStableLogicalNodeBox(to);
      const fromPoint = getEdgePoint(fromBox, toBox);
      const toPoint = getEdgePoint(toBox, fromBox);
      const dash = link.status === "confirmed" ? "0" : "8 7";
      const label = [link.local_port, link.remote_port].filter(Boolean).join(" -> ");
      const labelSvg = label
        ? `<text x="${(fromPoint.x + toPoint.x) / 2}" y="${(fromPoint.y + toPoint.y) / 2 - 7}" class="showcase-link-label">${escapeHtml(label)}</text>`
        : "";
      return `<g data-link-from="${escapeHtml(link.from)}" data-link-to="${escapeHtml(link.to)}"><line x1="${fromPoint.x}" y1="${fromPoint.y}" x2="${toPoint.x}" y2="${toPoint.y}" stroke="#263746" stroke-width="2" stroke-dasharray="${dash}" stroke-linecap="round" />${labelSvg}</g>`;
    })
    .join("");
}

function bindShowcaseDrag() {
  document.querySelectorAll("[data-showcase-node]").forEach((node) => {
    node.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const stage = document.getElementById("showcaseMap");
      if (!stage) return;
      const nodeRect = node.getBoundingClientRect();
      const zoom = appState.topologyZoom || 1;
      appState.draggingNode = {
        id: node.dataset.showcaseNode,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        offsetX: (event.clientX - nodeRect.left) / zoom,
        offsetY: (event.clientY - nodeRect.top) / zoom,
        width: node.offsetWidth,
        height: node.offsetHeight
      };
      node.classList.add("is-dragging");
      node.setPointerCapture(event.pointerId);
    });

    node.addEventListener("pointermove", (event) => {
      const drag = appState.draggingNode;
      if (!drag || drag.pointerId !== event.pointerId || drag.id !== node.dataset.showcaseNode) return;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) {
        drag.moved = true;
      }
      if (!drag.moved) return;
      const stage = document.getElementById("showcaseMap");
      const stageRect = stage.getBoundingClientRect();
      const zoom = appState.topologyZoom || 1;
      const logicalWidth = appState.topologyLogicalSize.width || stageRect.width / zoom;
      const logicalHeight = appState.topologyLogicalSize.height || stageRect.height / zoom;
      const point = logicalPointFromClient(event, stageRect, zoom);
      const x = clamp(point.x - drag.offsetX, 24, logicalWidth - drag.width - 24);
      const y = clamp(point.y - drag.offsetY, 112, logicalHeight - drag.height - 24);
      appState.topologyPositions[drag.id] = { x, y };
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      renderShowcaseLinks();
    });

    node.addEventListener("pointerup", (event) => {
      const drag = appState.draggingNode;
      if (drag?.pointerId === event.pointerId) {
        node.classList.remove("is-dragging");
        appState.draggingNode = null;
        if (drag.moved) {
          saveTopologyLayoutSoon();
        } else if (drag.id) {
          openMonitorForDevice(drag.id);
        }
      }
    });

    node.addEventListener("pointercancel", () => {
      node.classList.remove("is-dragging");
      appState.draggingNode = null;
    });
  });
}

function bindShowcasePan() {
  const stage = document.getElementById("showcaseMap");
  if (!stage || stage.dataset.panBound === "true") return;
  stage.dataset.panBound = "true";

  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.metaKey || event.target.closest("[data-showcase-node]")) return;
    event.preventDefault();
    appState.panningMap = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: appState.topologyPan.x,
      panY: appState.topologyPan.y
    };
    stage.classList.add("is-panning");
    stage.setPointerCapture(event.pointerId);
  });

  stage.addEventListener("pointermove", (event) => {
    const pan = appState.panningMap;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    appState.topologyPan = {
      x: pan.panX + event.clientX - pan.startX,
      y: pan.panY + event.clientY - pan.startY
    };
    applyShowcasePan();
  });

  const stopPan = (event) => {
    if (!appState.panningMap || appState.panningMap.pointerId !== event.pointerId) return;
    appState.panningMap = null;
    stage.classList.remove("is-panning");
    applyShowcasePan();
  };

  stage.addEventListener("pointerup", stopPan);
  stage.addEventListener("pointercancel", stopPan);

  window.addEventListener("keydown", (event) => {
    if (event.metaKey) stage.classList.add("is-pan-ready");
  });
  window.addEventListener("keyup", (event) => {
    if (!event.metaKey) stage.classList.remove("is-pan-ready");
  });
}

function renderShowcaseTopology() {
  const stage = document.getElementById("showcaseMap");
  const plane = document.getElementById("showcaseMapPlane");
  const nodes = document.getElementById("showcaseNodeLayer");
  const svg = document.getElementById("showcaseLinkLayer");
  if (!stage || !plane || !nodes || !svg) return;

  const width = stage.clientWidth || window.innerWidth;
  const height = stage.clientHeight || window.innerHeight;
  const cardWidth = clamp(window.innerWidth * 0.15, 220, 288);
  const cardHeight = 260;
  const devices = getDevices();
  const links = appState.snapshot.links || [];
  const signature = getTopologySignature(devices, getValidTopologyLinks(devices, links));
  let shouldCenterOnFocus = false;

  if (devices.length === 0) {
    svg.innerHTML = "";
    plane.style.width = "100%";
    plane.style.height = "100%";
    appState.topologyLogicalSize = { width: Math.max(1, width), height: Math.max(1, height) };
    appState.topologyLayoutSignature = signature;
    appState.topologyPositions = {};
    appState.topologyZoomUserSet = false;
    appState.topologyPan = { x: 0, y: 0 };
    shouldCenterOnFocus = true;
    setShowcaseZoom(1, false);
    nodes.innerHTML = `
      <div class="showcase-empty">
        <strong>No topology yet</strong>
        <span>Add a live SNMP seed to discover LLDP neighbors.</span>
      </div>
    `;
    return;
  }

  const layout = computeShowcaseTopologyLayout(devices, links, width, height, cardWidth, cardHeight);
  if (signature !== appState.topologyLayoutSignature) {
    appState.topologyPositions = { ...layout.positions };
    appState.topologyLayoutSignature = signature;
    appState.topologyZoomUserSet = false;
    appState.topologyPan = { x: 0, y: 0 };
    shouldCenterOnFocus = true;
  } else {
    devices.forEach((device) => {
      appState.topologyPositions[device.id] ||= layout.positions[device.id];
    });
  }

  appState.topologyLogicalSize = { width: layout.width, height: layout.height };
  plane.style.width = `${layout.width}px`;
  plane.style.height = `${layout.height}px`;
  nodes.style.width = `${layout.width}px`;
  nodes.style.height = `${layout.height}px`;
  if (!appState.topologyZoomUserSet) {
    setShowcaseZoom(fitShowcaseZoom(layout.width, layout.height, width, height), false);
    if (shouldCenterOnFocus) centerShowcaseOn(layout.focus);
  } else {
    applyShowcaseZoom();
  }

  nodes.innerHTML = devices
    .map((device, index) => {
      const saved = appState.topologyPositions[device.id];
      const pos = saved || layout.positions[device.id] || defaultShowcasePosition(device, index, devices.length, width, height, cardWidth, cardHeight);
      appState.topologyPositions[device.id] = pos;
      const status = device.status || "unknown";
      const model = device.model || "Unknown";
      const endpointTraffic = getEndpointTraffic(device);
      const source = device.device_type === "endpoint"
        ? device.mac || device.fingerprint
        : device.device_type === "segment"
          ? `${device.observed_mac_count || 0} MACs`
          : device.ip;
      const metaLines = device.device_type === "endpoint"
        ? [
            source || "unknown",
            device.observed_local_port || device.vendor || "observed endpoint",
            endpointTraffic ? formatEndpointTraffic(device) : (device.vendor || model)
          ]
        : device.device_type === "segment"
          ? [
              source || "multi-MAC",
              device.observed_local_port || "shared switch port",
              device.observed_local_port_alias || model
            ]
        : [source || "unknown", device.vendor || "Unknown", model];
      const kindClass = isTopologySegment(device)
        ? "is-segment"
        : isTopologyEndpoint(device)
          ? "is-endpoint"
          : device.status === "pending"
            ? "is-pending"
            : "is-seed";
      return `
        <button class="showcase-node ${status} ${kindClass}" type="button" style="left:${pos.x}px;top:${pos.y}px" data-showcase-node="${device.id}">
          <span class="showcase-node-title">${escapeHtml(device.name || "Unknown")}</span>
          <span class="showcase-status ${status}">${statusLabel(status)}</span>
          <span class="showcase-meta">${metaLines.map((line) => escapeHtml(line)).join("<br>")}</span>
        </button>
      `;
    })
    .join("");

  bindShowcaseDrag();
  bindShowcasePan();
  requestAnimationFrame(renderShowcaseLinks);
}

function startDotTunnel() {
  const canvas = document.getElementById("dotTunnelCanvas");
  if (!canvas || appState.tunnelAnimation) return;
  const context = canvas.getContext("2d");

  function draw(time) {
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const nextWidth = Math.max(1, Math.round(rect.width * scale));
    const nextHeight = Math.max(1, Math.round(rect.height * scale));
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }

    const width = canvas.width;
    const height = canvas.height;
    const cx = width * 0.55;
    const cy = height * 0.55;
    const t = time * 0.00008;
    context.clearRect(0, 0, width, height);
    context.save();
    context.scale(scale, scale);

    const cssWidth = width / scale;
    const cssHeight = height / scale;
    const centerX = cssWidth * 0.55;
    const centerY = cssHeight * 0.55;

    for (let ring = 0; ring < 34; ring += 1) {
      const depth = ((ring / 34) + t) % 1;
      const radius = 36 + depth * Math.max(cssWidth, cssHeight) * 0.72;
      const points = 48 + Math.round(depth * 72);
      const alpha = 0.05 + depth * 0.26;
      const dot = 0.55 + depth * 1.35;
      context.fillStyle = `rgba(35, 39, 43, ${alpha})`;
      for (let point = 0; point < points; point += 1) {
        const angle = (point / points) * Math.PI * 2 + t * 1.7 + depth * 1.2;
        const x = centerX + Math.cos(angle) * radius * 1.58;
        const y = centerY + Math.sin(angle) * radius * 0.48;
        if (x < -10 || x > cssWidth + 10 || y < -10 || y > cssHeight + 10) continue;
        context.beginPath();
        context.arc(x, y, dot, 0, Math.PI * 2);
        context.fill();
      }
    }

    context.restore();
    appState.tunnelAnimation = window.requestAnimationFrame(draw);
  }

  appState.tunnelAnimation = window.requestAnimationFrame(draw);
}

function renderAlerts() {
  const target = document.getElementById("alertList");
  if (!target) return;
  if (appState.snapshot.alerts.length === 0) {
    target.innerHTML = `
      <article class="alert-item">
        <div>
          <strong>No active alerts</strong>
          <p class="muted">Live SNMP import will create basic admin-up/oper-down alerts.</p>
        </div>
      </article>
    `;
    return;
  }
  target.innerHTML = appState.snapshot.alerts
    .map((alert) => {
      const device = getDeviceById(alert.device_id);
      const canAck = alert.state === "active";
      const canResolve = alert.state !== "resolved";
      return `
        <article class="alert-item">
          <div>
            <strong>${alert.title}</strong>
            <p class="muted">${device ? device.name : "unknown device"} - ${alert.detail}</p>
          </div>
          <span class="status-pill ${alert.state}">${stateLabel(alert.state)}</span>
          <div class="alert-actions">
            <button class="small-button" type="button" data-alert-action="ack" data-alert-id="${alert.id}" ${canAck ? "" : "disabled"}>Ack</button>
            <button class="small-button" type="button" data-alert-action="resolve" data-alert-id="${alert.id}" ${canResolve ? "" : "disabled"}>Resolve</button>
          </div>
        </article>
      `;
    })
    .join("");

  bindAlertActionButtons(target);
}

function renderSettings() {
  const polling = appState.snapshot.settings.polling || {};
  const security = appState.snapshot.settings.security || {};
  const pollingSettings = document.getElementById("pollingSettings");
  const securitySettings = document.getElementById("securitySettings");
  const metricCatalog = document.getElementById("metricCatalog");
  const liveModeBadge = document.getElementById("liveModeBadge");
  if (pollingSettings) {
    pollingSettings.innerHTML = Object.entries(polling)
      .map(([key, value]) => `<div><dt>${key.replaceAll("_", " ")}</dt><dd>${value}</dd></div>`)
      .join("");
  }
  if (securitySettings) {
    securitySettings.innerHTML = Object.entries(security)
      .map(([key, value]) => `<div><dt>${key.replaceAll("_", " ")}</dt><dd>${value}</dd></div>`)
      .join("");
  }
  if (metricCatalog) {
    metricCatalog.innerHTML = appState.snapshot.metric_catalog
      .map((metric) => `<span class="metric-chip">${metric}</span>`)
      .join("");
  }
  if (liveModeBadge) {
    liveModeBadge.textContent = `${appState.snapshot.mode || "mock"} mode`;
    liveModeBadge.className = `status-pill ${appState.snapshot.mode === "live" ? "up" : "neutral"}`;
  }
  const backendPoll = Boolean(polling.backend_auto_poll);
  const interval = Number(polling.backend_interval_seconds || 30);
  const legacyToggle = document.getElementById("autoPollToggle");
  const presentationToggle = document.getElementById("presentationBackendPollToggle");
  const presentationInterval = document.getElementById("presentationPollInterval");
  if (legacyToggle) legacyToggle.checked = backendPoll;
  if (presentationToggle) presentationToggle.checked = backendPoll;
  if (presentationInterval) presentationInterval.value = String(interval);
  updateSeedSummary();
  updatePollActionButtons();
  syncSeedVersionFields();
}

function switchView(view, behavior = "smooth") {
  if (view !== "history") {
    setHistoryOverlayOpen(false, false);
  }

  if (view === "history") {
    const deviceId = appState.historyDeviceId || appState.selectedDeviceId || getDevices()[0]?.id;
    if (deviceId) openDeviceHistory(deviceId, behavior);
    return;
  }

  if (view === "home") {
    enterPresentationMode("home", behavior);
    return;
  }

  if (view === "topology") {
    enterPresentationMode("topology", behavior);
    return;
  }

  if (view === "dashboard") {
    enterPresentationMode("dashboard", behavior);
    return;
  }

  if (view === "devices") {
    enterPresentationMode("devices", behavior);
    return;
  }

  enterPresentationMode("dashboard", behavior);
}

async function runPoll() {
  const result = await apiPost("/api/poll");
  appState.snapshot = result.snapshot;
  renderAll();
}

async function toggleBackendPoll() {
  const polling = getPollingSettings();
  const enabled = Boolean(polling.backend_auto_poll);
  const interval = Number(polling.backend_interval_seconds || 30) || 30;
  updatePollActionButtons(true);
  try {
    if (enabled) {
      await setBackendPolling(false, interval);
      return;
    }
    await runPoll();
    await setBackendPolling(true, 30);
  } finally {
    updatePollActionButtons(false);
  }
}

async function runDiscovery() {
  const result = await apiPost("/api/discovery");
  appState.snapshot = result.snapshot;
  renderAll();
  switchView("topology");
}

async function clearLiveInventory(resultId = "seedResult") {
  stopAutoPoll();
  const result = await apiPost("/api/live/clear");
  appState.snapshot = result.snapshot;
  appState.selectedDeviceId = "";
  const resultEl = document.getElementById(resultId);
  if (resultEl) {
    resultEl.className = "seed-result success";
    resultEl.textContent = "Live data and saved seed credentials cleared. Add a seed switch to start discovery.";
  }
  renderAll();
}

async function setBackendPolling(enabled, intervalSeconds = 30) {
  const result = await apiPostJson("/api/polling", {
    enabled,
    interval_seconds: Number(intervalSeconds || 30)
  });
  appState.snapshot = result.snapshot;
  renderAll();
  return result;
}

async function submitSeed(event) {
  event.preventDefault();
  const resultEl = document.getElementById("seedResult");
  const submit = document.getElementById("seedSubmitButton");
  const payload = {
    host: document.getElementById("seedHost").value.trim(),
    port: Number(document.getElementById("seedPort").value || 161),
    version: document.getElementById("seedVersion").value,
    community: document.getElementById("seedCommunity").value,
    username: document.getElementById("seedUsername").value,
    auth_key: document.getElementById("seedAuthKey").value,
    priv_key: document.getElementById("seedPrivKey").value,
    auth_protocol: document.getElementById("seedAuthProtocol").value,
    priv_protocol: document.getElementById("seedPrivProtocol").value
  };
  resultEl.className = "seed-result";
  resultEl.textContent = "Testing SNMP and reading IF-MIB/LLDP-MIB...";
  submit.disabled = true;
  try {
    const result = await apiPostJson("/api/live/seed", payload);
    appState.snapshot = result.snapshot;
    appState.selectedDeviceId = result.snapshot.devices[0]?.id || "";
    resultEl.className = "seed-result success";
    if (result.counts.interfaces === 0) {
      resultEl.className = "seed-result error";
      resultEl.textContent = `SNMP system works, but IF-MIB returned 0 interfaces. Check that the read-only view includes IF-MIB/ifTable/ifXTable.`;
    } else {
      resultEl.textContent = `Imported ${result.system.sys_name || payload.host}: ${result.counts.interfaces} interfaces, ${result.counts.lldp_candidates} LLDP candidates. Run poll again to calculate bps rates.`;
    }
    renderAll();
    await setBackendPolling(document.getElementById("autoPollToggle").checked, 30);
    switchView("devices");
  } catch (error) {
    resultEl.className = "seed-result error";
    resultEl.textContent = `SNMP test failed: ${error.message}`;
  } finally {
    submit.disabled = false;
  }
}

async function submitPresentationSeed(event) {
  event.preventDefault();
  const resultEl = document.getElementById("presentationSeedResult");
  const submit = document.getElementById("presentationSeedSubmitButton");
  const payload = {
    host: document.getElementById("presentationSeedHost").value.trim(),
    port: Number(document.getElementById("presentationSeedPort").value || 161),
    version: document.getElementById("presentationSeedVersion").value,
    community: document.getElementById("presentationSeedCommunity").value,
    username: document.getElementById("presentationSeedUsername").value,
    auth_key: document.getElementById("presentationSeedAuthKey").value,
    priv_key: document.getElementById("presentationSeedPrivKey").value,
    auth_protocol: document.getElementById("presentationSeedAuthProtocol").value,
    priv_protocol: document.getElementById("presentationSeedPrivProtocol").value
  };
  resultEl.className = "seed-result";
  resultEl.textContent = "Testing SNMP and reading IF-MIB/LLDP-MIB...";
  submit.disabled = true;
  try {
    const result = await apiPostJson("/api/live/seed", payload);
    appState.snapshot = result.snapshot;
    appState.selectedDeviceId = result.snapshot.devices[0]?.id || "";
    resultEl.className = result.counts.interfaces === 0 ? "seed-result error" : "seed-result success";
    resultEl.textContent = result.counts.interfaces === 0
      ? "SNMP system works, but IF-MIB returned 0 interfaces."
      : `Imported ${result.system.sys_name || payload.host}: ${result.counts.interfaces} interfaces, ${result.counts.lldp_candidates} LLDP candidates.`;
    renderAll();
    await setBackendPolling(
      document.getElementById("presentationBackendPollToggle").checked,
      Number(document.getElementById("presentationPollInterval").value || 30)
    );
    setLiveSetupOpen(false);
    switchView("devices");
  } catch (error) {
    resultEl.className = "seed-result error";
    resultEl.textContent = `SNMP test failed: ${error.message}`;
  } finally {
    submit.disabled = false;
  }
}

function startAutoPoll() {
  stopAutoPoll();
  const toggle = document.getElementById("autoPollToggle");
  if (!toggle || !toggle.checked) return;
  appState.autoPollTimer = window.setInterval(async () => {
    if ((appState.snapshot.mode || "mock") !== "live") return;
    try {
      await runPoll();
    } catch (error) {
      const streamState = document.getElementById("eventStreamState");
      if (streamState) streamState.textContent = `Poll failed: ${error.message}`;
    }
  }, 30000);
}

function stopAutoPoll() {
  if (appState.autoPollTimer) {
    window.clearInterval(appState.autoPollTimer);
    appState.autoPollTimer = null;
  }
}

function syncSeedVersionFields() {
  const version = document.getElementById("seedVersion")?.value || "2c";
  document.querySelectorAll(".v2-field").forEach((field) => {
    field.style.display = version === "2c" ? "grid" : "none";
  });
  document.querySelectorAll(".v3-field").forEach((field) => {
    field.style.display = version === "3" ? "grid" : "none";
  });
  const presentationVersion = document.getElementById("presentationSeedVersion")?.value || "2c";
  document.querySelectorAll(".presentation-v2-field").forEach((field) => {
    field.style.display = presentationVersion === "2c" ? "grid" : "none";
  });
  document.querySelectorAll(".presentation-v3-field").forEach((field) => {
    field.style.display = presentationVersion === "3" ? "grid" : "none";
  });
}

function renderAll() {
  renderKpis();
  renderDashboardDevices();
  renderEvents();
  renderDevicesTable();
  renderDeviceDetail();
  renderTopology();
  renderShowcaseTopology();
  renderPresentationDashboard();
  renderPresentationDevices();
  renderDeviceHistory();
  renderAlerts();
  renderSettings();
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => switchView(item.dataset.view));
  });
  document.querySelectorAll("[data-view-target]").forEach((item) => {
    item.addEventListener("click", () => switchView(item.dataset.viewTarget));
  });
  document.getElementById("runPollButton")?.addEventListener("click", toggleBackendPoll);
  document.getElementById("runDiscoveryButton")?.addEventListener("click", runDiscovery);
  document.getElementById("presentationRunPoll")?.addEventListener("click", toggleBackendPoll);
  document.getElementById("showcaseZoomIn")?.addEventListener("click", () => setShowcaseZoom(getAppliedShowcaseZoom() + 0.14));
  document.getElementById("showcaseZoomOut")?.addEventListener("click", () => setShowcaseZoom(getAppliedShowcaseZoom() - 0.14));
  document.getElementById("devicePrevButton")?.addEventListener("click", () => setSelectedDeviceIndex(appState.selectedDeviceIndex - 1));
  document.getElementById("deviceNextButton")?.addEventListener("click", () => setSelectedDeviceIndex(appState.selectedDeviceIndex + 1));
  document.querySelectorAll("[data-monitor-view]").forEach((button) => {
    button.addEventListener("click", () => setMonitorViewMode(button.dataset.monitorView));
  });
  document.getElementById("historyBackButton")?.addEventListener("click", () => setHistoryOverlayOpen(false));
  document.getElementById("presentationSetupButton")?.addEventListener("click", () => setLiveSetupOpen(true));
  document.getElementById("presentationClearAllButton")?.addEventListener("click", () => clearLiveInventory());
  document.getElementById("liveSetupClose")?.addEventListener("click", () => setLiveSetupOpen(false));
  document.getElementById("liveSetupBackdrop")?.addEventListener("click", () => setLiveSetupOpen(false));
  document.getElementById("presentationClearLiveButton")?.addEventListener("click", () => clearLiveInventory("presentationSeedResult"));
  document.getElementById("presentationSeedForm")?.addEventListener("submit", submitPresentationSeed);
  document.getElementById("presentationSeedVersion")?.addEventListener("change", syncSeedVersionFields);
  document.getElementById("presentationBackendPollToggle")?.addEventListener("change", async () => {
    await setBackendPolling(
      document.getElementById("presentationBackendPollToggle").checked,
      Number(document.getElementById("presentationPollInterval").value || 30)
    );
  });
  document.getElementById("presentationPollInterval")?.addEventListener("change", async () => {
    if (document.getElementById("presentationBackendPollToggle").checked) {
      await setBackendPolling(true, Number(document.getElementById("presentationPollInterval").value || 30));
    }
  });
  document.getElementById("clearLiveButton")?.addEventListener("click", () => clearLiveInventory("seedResult"));
  document.getElementById("seedForm")?.addEventListener("submit", submitSeed);
  document.getElementById("seedVersion")?.addEventListener("change", syncSeedVersionFields);
  document.getElementById("autoPollToggle")?.addEventListener("change", async () => {
    await setBackendPolling(document.getElementById("autoPollToggle").checked, 30);
  });
  window.addEventListener("resize", () => {
    renderTopology();
    renderShowcaseTopology();
    updateDeviceCarousel();
    updatePresentationProgress();
  });
  window.addEventListener("scroll", () => {
    updatePresentationProgress();
    resetPresentationScrollHoldIfAwayFromAnchor();
  }, { passive: true });
  window.addEventListener("wheel", maybeHoldPresentationWheel, { passive: false });
  window.addEventListener("hashchange", () => {
    const view = window.location.hash.replace("#", "");
    if (view === "history") {
      switchView("history", "auto");
    } else {
      setHistoryOverlayOpen(false, false);
      switchView(viewMeta[view] ? view : "home");
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && appState.historyOverlayOpen) {
      setHistoryOverlayOpen(false);
    }
  });
}

function connectEvents() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws/events`);
  socket.addEventListener("open", () => {
    const streamState = document.getElementById("eventStreamState");
    if (streamState) streamState.textContent = "WebSocket connected";
    renderKpis();
    renderPresentationDashboard();
  });
  socket.addEventListener("message", async () => {
    await loadSnapshot();
  });
  socket.addEventListener("close", () => {
    const streamState = document.getElementById("eventStreamState");
    if (streamState) streamState.textContent = "WebSocket closed";
    renderKpis();
    renderPresentationDashboard();
  });
}

letterizeLandingTitle();
bindEvents();
startDotTunnel();
updatePresentationProgress();
loadSnapshot().then(() => {
  connectEvents();
  const view = window.location.hash.replace("#", "");
  if (view === "history") {
    switchView("history", "auto");
  } else if (viewMeta[view]) {
    switchView(view, "auto");
  } else {
    enterPresentationMode("home", "auto");
  }
}).catch((error) => {
  const backendState = document.getElementById("backendState");
  const streamState = document.getElementById("eventStreamState");
  if (backendState) backendState.textContent = "Backend unavailable";
  if (streamState) streamState.textContent = error.message;
});
