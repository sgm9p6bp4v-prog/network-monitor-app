const state = {
  selectedView: "dashboard",
  selectedDeviceId: "core-01",
  sessionSeconds: 3600,
  devices: [
    {
      id: "core-01",
      name: "fs-core-01",
      ip: "10.10.0.2",
      vendor: "FS",
      model: "S5860-20SQ",
      status: "up",
      fingerprint: "uuid+sysObjectID+chassis-8c:1f:64:10:00:01",
      x: 520,
      y: 70,
      interfaces: [
        { name: "eth1/1", admin: "up", oper: "up", inBps: "812 Mbps", outBps: "690 Mbps", errors: 0, discards: 2 },
        { name: "eth1/2", admin: "up", oper: "up", inBps: "226 Mbps", outBps: "241 Mbps", errors: 0, discards: 0 },
        { name: "eth1/20", admin: "down", oper: "down", inBps: "0 bps", outBps: "0 bps", errors: 0, discards: 0 }
      ]
    },
    {
      id: "agg-01",
      name: "fs-agg-01",
      ip: "10.10.0.11",
      vendor: "FS",
      model: "S5850-48T4Q",
      status: "up",
      fingerprint: "uuid+sysObjectID+chassis-8c:1f:64:10:00:11",
      x: 80,
      y: 245,
      interfaces: [
        { name: "eth1/49", admin: "up", oper: "up", inBps: "612 Mbps", outBps: "590 Mbps", errors: 0, discards: 1 },
        { name: "eth1/4", admin: "up", oper: "up", inBps: "92 Mbps", outBps: "38 Mbps", errors: 0, discards: 0 }
      ]
    },
    {
      id: "edge-01",
      name: "fs-edge-01",
      ip: "10.10.1.21",
      vendor: "FS",
      model: "S3410-24TS-P",
      status: "warning",
      fingerprint: "uuid+sysObjectID+chassis-8c:1f:64:10:01:21",
      x: 390,
      y: 395,
      interfaces: [
        { name: "eth1/1", admin: "up", oper: "up", inBps: "120 Mbps", outBps: "145 Mbps", errors: 1, discards: 6 },
        { name: "eth1/24", admin: "up", oper: "down", inBps: "0 bps", outBps: "0 bps", errors: 18, discards: 42 }
      ]
    },
    {
      id: "edge-02",
      name: "fs-edge-02",
      ip: "10.10.2.22",
      vendor: "FS",
      model: "S3410-24TS-P",
      status: "up",
      fingerprint: "uuid+sysObjectID+chassis-8c:1f:64:10:02:22",
      x: 820,
      y: 245,
      interfaces: [
        { name: "eth1/1", admin: "up", oper: "up", inBps: "140 Mbps", outBps: "109 Mbps", errors: 0, discards: 1 },
        { name: "eth1/13", admin: "up", oper: "up", inBps: "18 Mbps", outBps: "11 Mbps", errors: 0, discards: 0 }
      ]
    },
    {
      id: "pending-01",
      name: "fs-lab-pending",
      ip: "10.10.9.31",
      vendor: "FS",
      model: "LLDP candidate",
      status: "pending",
      fingerprint: "pending-lldp-one-sided",
      x: 820,
      y: 425,
      interfaces: [
        { name: "eth1/1", admin: "unknown", oper: "unknown", inBps: "n/a", outBps: "n/a", errors: 0, discards: 0 }
      ]
    }
  ],
  links: [
    { from: "core-01", to: "agg-01", status: "confirmed", label: "LLDP both sides" },
    { from: "core-01", to: "edge-02", status: "confirmed", label: "LLDP both sides" },
    { from: "agg-01", to: "edge-01", status: "confirmed", label: "LLDP both sides" },
    { from: "edge-02", to: "pending-01", status: "pending", label: "LLDP one side" }
  ],
  alerts: [
    {
      id: "alert-01",
      deviceId: "edge-01",
      title: "eth1/24 oper down",
      detail: "admin up + oper down for 3 polling cycles",
      severity: "critical",
      state: "active"
    },
    {
      id: "alert-02",
      deviceId: "edge-01",
      title: "eth1/24 discard rate",
      detail: "discard rate above global threshold",
      severity: "warning",
      state: "active"
    },
    {
      id: "alert-03",
      deviceId: "agg-01",
      title: "eth1/49 transient errors",
      detail: "acknowledged during maintenance window",
      severity: "warning",
      state: "acknowledged"
    }
  ],
  events: [
    { time: "12:04:22", text: "Worker completed interface status poll for 4 managed devices" },
    { time: "12:03:51", text: "LLDP link core-01 -> edge-02 auto-confirmed from both sides" },
    { time: "12:03:16", text: "Candidate fs-lab-pending kept pending after one-sided LLDP evidence" },
    { time: "12:02:40", text: "Alert edge-01 eth1/24 oper down remained active" }
  ],
  metricCatalog: [
    "interface.admin_status",
    "interface.oper_status",
    "interface.in_octets",
    "interface.out_octets",
    "interface.in_bps",
    "interface.out_bps",
    "interface.in_errors",
    "interface.out_errors",
    "interface.in_discards",
    "interface.out_discards",
    "interface.in_error_rate",
    "interface.out_error_rate",
    "interface.in_discard_rate",
    "interface.out_discard_rate"
  ]
};

const viewMeta = {
  dashboard: ["Current network state", "Dashboard"],
  devices: ["Inventory and interface state", "Devices"],
  topology: ["Seed-based LLDP discovery", "Topology"],
  alerts: ["Static thresholds", "Alerts"],
  settings: ["MVP architecture decisions", "Settings"]
};

function statusLabel(status) {
  if (status === "up") return "UP";
  if (status === "down") return "DOWN";
  if (status === "warning") return "WARNING";
  if (status === "pending") return "PENDING";
  return "UNKNOWN";
}

function alertStateLabel(stateName) {
  return stateName.charAt(0).toUpperCase() + stateName.slice(1);
}

function addEvent(text) {
  const now = new Date();
  state.events.unshift({
    time: now.toLocaleTimeString("it-IT", { hour12: false }),
    text
  });
  state.events = state.events.slice(0, 8);
}

function getManagedDevices() {
  return state.devices.filter((device) => device.status !== "pending");
}

function getDeviceById(id) {
  return state.devices.find((device) => device.id === id);
}

function getAlertCounts() {
  return state.alerts.reduce(
    (acc, alert) => {
      acc[alert.state] += 1;
      return acc;
    },
    { active: 0, acknowledged: 0, resolved: 0 }
  );
}

function renderKpis() {
  const managed = getManagedDevices();
  const up = managed.filter((device) => device.status === "up").length;
  const warning = managed.filter((device) => device.status === "warning").length;
  const counts = getAlertCounts();
  const pendingLinks = state.links.filter((link) => link.status === "pending").length;

  const kpis = [
    { label: "Managed devices", value: `${up}/${managed.length}`, trend: `${warning} warning, 0 down`, tone: "up" },
    { label: "Active alerts", value: counts.active, trend: `${counts.acknowledged} acknowledged`, tone: counts.active ? "down" : "up" },
    { label: "LLDP links", value: state.links.length, trend: `${pendingLinks} pending`, tone: pendingLinks ? "warning" : "up" },
    { label: "Worker queue", value: "3", trend: "arq + Redis mock", tone: "neutral" }
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

function renderDashboardDevices() {
  document.getElementById("dashboardDeviceList").innerHTML = state.devices
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
  document.getElementById("eventList").innerHTML = state.events
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
  document.getElementById("devicesTable").innerHTML = state.devices
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
      state.selectedDeviceId = row.dataset.deviceId;
      renderDeviceDetail();
    });
  });
}

function renderDeviceDetail() {
  const device = getDeviceById(state.selectedDeviceId) || state.devices[0];
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
              <strong>${iface.name}</strong>
              <span class="status-pill ${iface.admin === "up" ? "up" : "neutral"}">admin ${iface.admin}</span>
              <span class="status-pill ${iface.oper === "up" ? "up" : iface.oper === "down" ? "down" : "neutral"}">oper ${iface.oper}</span>
              <span class="muted">${iface.inBps} in</span>
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

  const normalized = new Map(
    state.devices.map((device) => [
      device.id,
      {
        ...device,
        x: margin + (device.x / designWidth) * Math.max(1, width - nodeWidth - margin * 2),
        y: margin + (device.y / designHeight) * Math.max(1, height - nodeHeight - margin * 2)
      }
    ])
  );

  svg.innerHTML = state.links
    .map((link) => {
      const from = normalized.get(link.from);
      const to = normalized.get(link.to);
      if (!from || !to) return "";
      const x1 = from.x + 75;
      const y1 = from.y + 35;
      const x2 = to.x + 75;
      const y2 = to.y + 35;
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
      state.selectedDeviceId = node.dataset.nodeDevice;
      switchView("devices");
      renderDeviceDetail();
    });
  });
}

function renderAlerts() {
  document.getElementById("alertList").innerHTML = state.alerts
    .map((alert) => {
      const device = getDeviceById(alert.deviceId);
      const canAck = alert.state === "active";
      const canResolve = alert.state !== "resolved";
      return `
        <article class="alert-item">
          <div>
            <strong>${alert.title}</strong>
            <p class="muted">${device ? device.name : "unknown device"} - ${alert.detail}</p>
          </div>
          <span class="status-pill ${alert.state}">${alertStateLabel(alert.state)}</span>
          <div class="alert-actions">
            <button class="small-button" type="button" data-alert-action="ack" data-alert-id="${alert.id}" ${canAck ? "" : "disabled"}>Ack</button>
            <button class="small-button" type="button" data-alert-action="resolve" data-alert-id="${alert.id}" ${canResolve ? "" : "disabled"}>Resolve</button>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-alert-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const alert = state.alerts.find((item) => item.id === button.dataset.alertId);
      if (!alert) return;
      if (button.dataset.alertAction === "ack" && alert.state === "active") {
        alert.state = "acknowledged";
        addEvent(`Alert ${alert.title} acknowledged`);
      }
      if (button.dataset.alertAction === "resolve") {
        alert.state = "resolved";
        addEvent(`Alert ${alert.title} resolved`);
      }
      renderAll();
    });
  });
}

function renderMetricCatalog() {
  document.getElementById("metricCatalog").innerHTML = state.metricCatalog
    .map((metric) => `<span class="metric-chip">${metric}</span>`)
    .join("");
}

function switchView(view) {
  state.selectedView = view;
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.view === view);
  });
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.viewPanel === view);
  });
  const [eyebrow, title] = viewMeta[view];
  document.getElementById("viewEyebrow").textContent = eyebrow;
  document.getElementById("viewTitle").textContent = title;
  if (view === "topology") requestAnimationFrame(renderTopology);
}

function simulatePoll() {
  const edge = getDeviceById("edge-01");
  const iface = edge.interfaces.find((item) => item.name === "eth1/24");
  iface.discards += 3;
  addEvent("Manual poll completed: status, traffic and discard rates refreshed");
  renderAll();
}

function simulateDiscovery() {
  const pendingLink = state.links.find((link) => link.status === "pending");
  if (pendingLink) {
    addEvent("LLDP discovery kept fs-lab-pending as pending: one-sided evidence only");
  } else {
    state.links.push({ from: "edge-02", to: "pending-01", status: "pending", label: "LLDP one side" });
    addEvent("LLDP discovery added a pending candidate link from edge-02");
  }
  renderAll();
  switchView("topology");
}

function tickSession() {
  state.sessionSeconds = Math.max(0, state.sessionSeconds - 1);
  const minutes = String(Math.floor(state.sessionSeconds / 60)).padStart(2, "0");
  const seconds = String(state.sessionSeconds % 60).padStart(2, "0");
  document.getElementById("sessionTimer").textContent = `${minutes}:${seconds}`;
}

function renderAll() {
  renderKpis();
  renderDashboardDevices();
  renderEvents();
  renderDevicesTable();
  renderDeviceDetail();
  renderTopology();
  renderAlerts();
  renderMetricCatalog();
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => switchView(item.dataset.view));
  });
  document.getElementById("runPollButton").addEventListener("click", simulatePoll);
  document.getElementById("runDiscoveryButton").addEventListener("click", simulateDiscovery);
  window.addEventListener("resize", () => {
    if (state.selectedView === "topology") renderTopology();
  });
}

bindEvents();
renderAll();
setInterval(tickSession, 1000);
