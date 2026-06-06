const appState = {
  selectedView: "home",
  selectedDeviceId: "core-01",
  autoPollTimer: null,
  topologyPositions: {},
  draggingNode: null,
  tunnelAnimation: null,
  snapshot: {
    devices: [],
    links: [],
    alerts: [],
    events: [],
    metric_catalog: [],
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
  key: null,
  until: 0,
  releasedKey: null
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
  return {
    viewport,
    scroll,
    dashboardStart,
    landingProgress: clamp(scroll / viewport, 0, 1),
    postTopologyProgress: clamp((scroll - viewport) / viewport, 0, 1),
    patternProgress: clamp((scroll - viewport) / (viewport * (1 + patternSectionRatio)), 0, 1),
    dashboardProgress: clamp((scroll - viewport * (dashboardStart - 0.28)) / (viewport * 0.28), 0, 1),
    dashboardBgProgress: clamp((scroll - viewport * 2) / (viewport * patternSectionRatio), 0, 1)
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
    scroll,
    viewport,
    dashboardStart
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
  document.body.style.setProperty("--stage-bg-rgb", stageRgb);
  if (scroll >= viewport * (dashboardStart - 0.08)) {
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
  updatePresentationProgress();
  const topologySection = document.getElementById("topologyShowcase");
  const dashboardSection = document.getElementById("presentationDashboard");
  const targets = {
    home: 0,
    topology: topologySection?.offsetTop ?? window.innerHeight,
    dashboard: dashboardSection?.offsetTop ?? window.innerHeight * (2 + patternSectionRatio)
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
  return [
    { name: "home", top: 0 },
    { name: "topology", top: topologySection?.offsetTop ?? window.innerHeight },
    { name: "dashboard", top: dashboardSection?.offsetTop ?? window.innerHeight * (2 + patternSectionRatio) }
  ];
}

function resetPresentationScrollHoldIfAwayFromAnchor() {
  if (!document.body.classList.contains("presentation-mode")) {
    presentationScrollHold.key = null;
    presentationScrollHold.releasedKey = null;
    presentationScrollHold.until = 0;
    return;
  }

  const current = window.scrollY;
  const atAnchor = getPresentationAnchorTops().some((anchor) => Math.abs(current - anchor.top) <= 8);
  if (!atAnchor) {
    presentationScrollHold.key = null;
    presentationScrollHold.releasedKey = null;
    presentationScrollHold.until = 0;
  }
}

function maybeHoldPresentationWheel(event) {
  if (!document.body.classList.contains("presentation-mode")) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(".dashboard-card")) return;

  const direction = event.deltaY > 0 ? "down" : event.deltaY < 0 ? "up" : null;
  if (!direction) return;

  const current = window.scrollY;
  const anchor = getPresentationAnchorTops().find((item) => Math.abs(current - item.top) <= 4);
  if (!anchor) {
    resetPresentationScrollHoldIfAwayFromAnchor();
    return;
  }

  if ((anchor.name === "home" && direction === "up") || (anchor.name === "dashboard" && direction === "down")) {
    return;
  }

  const key = `${anchor.name}:${direction}`;
  const now = performance.now();
  if (presentationScrollHold.releasedKey === key) return;

  if (presentationScrollHold.key === key && now >= presentationScrollHold.until) {
    presentationScrollHold.key = null;
    presentationScrollHold.releasedKey = key;
    presentationScrollHold.until = 0;
    return;
  }

  if (presentationScrollHold.key !== key) {
    presentationScrollHold.key = key;
    presentationScrollHold.until = now + presentationScrollHoldMs;
  }

  event.preventDefault();
  event.stopPropagation();
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
  const response = await fetch(path);
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

async function loadSnapshot() {
  appState.snapshot = await apiGet("/api/snapshot");
  document.getElementById("backendState").textContent = "Connected";
  renderAll();
}

function renderKpis() {
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
    { label: "Event stream", value: "WS", trend: document.getElementById("eventStreamState").textContent }
  ];

  document.getElementById("kpiGrid").innerHTML = kpis
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
    ? appState.snapshot.events.slice(0, 12)
    : [{ time: "--:--:--", text: "Waiting for worker events" }];
  eventsTarget.innerHTML = events
    .map((event) => `<li><time>${escapeHtml(event.time)}</time> - ${escapeHtml(event.text)}</li>`)
    .join("");
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
  if (getDevices().length === 0) {
    document.getElementById("dashboardDeviceList").innerHTML = `
      <article class="device-row">
        <div class="device-name">
          <strong>No live devices yet</strong>
          <span>Open Settings and import an SNMP seed switch.</span>
        </div>
      </article>
    `;
    return;
  }
  document.getElementById("dashboardDeviceList").innerHTML = getDevices()
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
  document.getElementById("eventList").innerHTML = appState.snapshot.events
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
  if (getDevices().length === 0) {
    document.getElementById("devicesTable").innerHTML = `
      <tr>
        <td colspan="4">No live devices yet. Add a seed switch from Settings.</td>
      </tr>
    `;
    document.getElementById("deviceDetailTitle").textContent = "No device selected";
    document.getElementById("deviceDetail").innerHTML = "";
    return;
  }
  document.getElementById("devicesTable").innerHTML = getDevices()
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
  const device = getDeviceById(appState.selectedDeviceId) || getDevices()[0];
  if (!device) return;
  appState.selectedDeviceId = device.id;
  document.getElementById("deviceDetailTitle").textContent = device.name;
  document.getElementById("deviceDetail").innerHTML = `
    <dl class="settings-list">
      <div><dt>Management IP</dt><dd>${device.ip}</dd></div>
      <div><dt>Vendor</dt><dd>${device.vendor}</dd></div>
      <div><dt>Model</dt><dd>${device.model}</dd></div>
      <div><dt>Fingerprint</dt><dd>${device.fingerprint}</dd></div>
    </dl>
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
              <span class="muted">${formatBps(iface.in_bps)} in<br>${formatBps(iface.out_bps)} out</span>
              <span class="muted">${iface.in_errors + iface.out_errors} errors<br>${iface.in_discards + iface.out_discards} discards</span>
              <span class="muted">${formatSpeed(iface.if_high_speed)}</span>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderTopology() {
  const canvas = document.getElementById("topologyCanvas");
  const svg = document.getElementById("linkLayer");
  const nodes = document.getElementById("nodeLayer");
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
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="3" stroke-dasharray="${dash}" stroke-linecap="round" />`;
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

function renderShowcaseLinks() {
  const stage = document.getElementById("showcaseMap");
  const svg = document.getElementById("showcaseLinkLayer");
  if (!stage || !svg) return;

  const stageRect = stage.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${stage.clientWidth || 1} ${stage.clientHeight || 1}`);
  svg.innerHTML = appState.snapshot.links
    .map((link) => {
      const from = document.querySelector(`[data-showcase-node="${CSS.escape(link.from)}"]`);
      const to = document.querySelector(`[data-showcase-node="${CSS.escape(link.to)}"]`);
      if (!from || !to) return "";
      const fromRect = from.getBoundingClientRect();
      const toRect = to.getBoundingClientRect();
      const x1 = fromRect.left - stageRect.left + fromRect.width / 2;
      const y1 = fromRect.top - stageRect.top + fromRect.height / 2;
      const x2 = toRect.left - stageRect.left + toRect.width / 2;
      const y2 = toRect.top - stageRect.top + toRect.height / 2;
      const dash = link.status === "confirmed" ? "0" : "8 7";
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#263746" stroke-width="2" stroke-dasharray="${dash}" stroke-linecap="round" />`;
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
      appState.draggingNode = {
        id: node.dataset.showcaseNode,
        pointerId: event.pointerId,
        offsetX: event.clientX - nodeRect.left,
        offsetY: event.clientY - nodeRect.top,
        width: nodeRect.width,
        height: nodeRect.height
      };
      node.classList.add("is-dragging");
      node.setPointerCapture(event.pointerId);
    });

    node.addEventListener("pointermove", (event) => {
      const drag = appState.draggingNode;
      if (!drag || drag.pointerId !== event.pointerId || drag.id !== node.dataset.showcaseNode) return;
      const stage = document.getElementById("showcaseMap");
      const stageRect = stage.getBoundingClientRect();
      const x = clamp(event.clientX - stageRect.left - drag.offsetX, 24, stageRect.width - drag.width - 24);
      const y = clamp(event.clientY - stageRect.top - drag.offsetY, 112, stageRect.height - drag.height - 24);
      appState.topologyPositions[drag.id] = { x, y };
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      renderShowcaseLinks();
    });

    node.addEventListener("pointerup", (event) => {
      if (appState.draggingNode?.pointerId === event.pointerId) {
        node.classList.remove("is-dragging");
        appState.draggingNode = null;
      }
    });

    node.addEventListener("pointercancel", () => {
      node.classList.remove("is-dragging");
      appState.draggingNode = null;
    });
  });
}

function renderShowcaseTopology() {
  const stage = document.getElementById("showcaseMap");
  const nodes = document.getElementById("showcaseNodeLayer");
  const svg = document.getElementById("showcaseLinkLayer");
  if (!stage || !nodes || !svg) return;

  const width = stage.clientWidth || window.innerWidth;
  const height = stage.clientHeight || window.innerHeight;
  const cardWidth = clamp(window.innerWidth * 0.15, 220, 288);
  const cardHeight = 132;
  const devices = getDevices();

  if (devices.length === 0) {
    svg.innerHTML = "";
    nodes.innerHTML = `
      <div class="showcase-empty">
        <strong>No topology yet</strong>
        <span>Add a live SNMP seed to discover LLDP neighbors.</span>
      </div>
    `;
    return;
  }

  nodes.innerHTML = devices
    .map((device, index) => {
      const saved = appState.topologyPositions[device.id];
      const pos = saved || defaultShowcasePosition(device, index, devices.length, width, height, cardWidth, cardHeight);
      appState.topologyPositions[device.id] = pos;
      const status = device.status || "unknown";
      const model = device.model || "Unknown";
      return `
        <button class="showcase-node ${status}" type="button" style="left:${pos.x}px;top:${pos.y}px" data-showcase-node="${device.id}">
          <span class="showcase-node-title">${device.name}</span>
          <span class="showcase-status ${status}">${statusLabel(status)}</span>
          <span class="showcase-meta">${device.ip}<br>${device.vendor || "Unknown"}<br>${model}</span>
        </button>
      `;
    })
    .join("");

  bindShowcaseDrag();
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
  if (appState.snapshot.alerts.length === 0) {
    document.getElementById("alertList").innerHTML = `
      <article class="alert-item">
        <div>
          <strong>No active alerts</strong>
          <p class="muted">Live SNMP import will create basic admin-up/oper-down alerts.</p>
        </div>
      </article>
    `;
    return;
  }
  document.getElementById("alertList").innerHTML = appState.snapshot.alerts
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

  bindAlertActionButtons(document.getElementById("alertList"));
}

function renderSettings() {
  const polling = appState.snapshot.settings.polling || {};
  const security = appState.snapshot.settings.security || {};
  document.getElementById("pollingSettings").innerHTML = Object.entries(polling)
    .map(([key, value]) => `<div><dt>${key.replaceAll("_", " ")}</dt><dd>${value}</dd></div>`)
    .join("");
  document.getElementById("securitySettings").innerHTML = Object.entries(security)
    .map(([key, value]) => `<div><dt>${key.replaceAll("_", " ")}</dt><dd>${value}</dd></div>`)
    .join("");
  document.getElementById("metricCatalog").innerHTML = appState.snapshot.metric_catalog
    .map((metric) => `<span class="metric-chip">${metric}</span>`)
    .join("");
  document.getElementById("liveModeBadge").textContent = `${appState.snapshot.mode || "mock"} mode`;
  document.getElementById("liveModeBadge").className = `status-pill ${appState.snapshot.mode === "live" ? "up" : "neutral"}`;
  syncSeedVersionFields();
}

function switchView(view, behavior = "smooth") {
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

  if (!viewMeta[view]) return;
  enterAppMode(view);
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.view === view);
  });
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.viewPanel === view);
  });
  const [eyebrow, title] = viewMeta[view];
  document.getElementById("viewEyebrow").textContent = eyebrow;
  document.getElementById("viewTitle").textContent = title;
  if (window.location.hash !== `#${view}`) {
    history.pushState(null, "", `#${view}`);
  }
}

async function runPoll() {
  const result = await apiPost("/api/poll");
  appState.snapshot = result.snapshot;
  renderAll();
}

async function runDiscovery() {
  const result = await apiPost("/api/discovery");
  appState.snapshot = result.snapshot;
  renderAll();
  switchView("topology");
}

async function clearLiveInventory() {
  stopAutoPoll();
  const result = await apiPost("/api/live/clear");
  appState.snapshot = result.snapshot;
  appState.selectedDeviceId = "";
  document.getElementById("seedResult").className = "seed-result success";
  document.getElementById("seedResult").textContent = "Mock data cleared. Add a seed switch to start live discovery.";
  renderAll();
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
    startAutoPoll();
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
      document.getElementById("eventStreamState").textContent = `Poll failed: ${error.message}`;
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
  document.getElementById("runPollButton").addEventListener("click", runPoll);
  document.getElementById("runDiscoveryButton").addEventListener("click", runDiscovery);
  document.getElementById("presentationRunPoll").addEventListener("click", runPoll);
  document.getElementById("clearLiveButton").addEventListener("click", clearLiveInventory);
  document.getElementById("seedForm").addEventListener("submit", submitSeed);
  document.getElementById("seedVersion").addEventListener("change", syncSeedVersionFields);
  document.getElementById("autoPollToggle").addEventListener("change", () => {
    if (document.getElementById("autoPollToggle").checked) {
      startAutoPoll();
    } else {
      stopAutoPoll();
    }
  });
  window.addEventListener("resize", () => {
    renderTopology();
    renderShowcaseTopology();
    updatePresentationProgress();
  });
  window.addEventListener("scroll", () => {
    updatePresentationProgress();
    resetPresentationScrollHoldIfAwayFromAnchor();
  }, { passive: true });
  window.addEventListener("wheel", maybeHoldPresentationWheel, { passive: false });
  window.addEventListener("hashchange", () => {
    const view = window.location.hash.replace("#", "");
    switchView(viewMeta[view] ? view : "home");
  });
}

function connectEvents() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws/events`);
  socket.addEventListener("open", () => {
    document.getElementById("eventStreamState").textContent = "WebSocket connected";
    renderKpis();
    renderPresentationDashboard();
  });
  socket.addEventListener("message", async () => {
    await loadSnapshot();
  });
  socket.addEventListener("close", () => {
    document.getElementById("eventStreamState").textContent = "WebSocket closed";
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
  if (viewMeta[view]) {
    switchView(view, "auto");
  } else {
    enterPresentationMode("home", "auto");
  }
  if (appState.snapshot.mode === "live" && appState.snapshot.devices.length > 0) {
    startAutoPoll();
  }
}).catch((error) => {
  document.getElementById("backendState").textContent = "Backend unavailable";
  document.getElementById("eventStreamState").textContent = error.message;
});
