// Run with: node --test "tests/frontend/*.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const appJsPath = join(here, "..", "..", "web", "app.js");
const source = readFileSync(appJsPath, "utf8");

const PAYLOAD = '<img src=x onerror="window.__xss=1">';

function makeEl() {
  return {
    _innerHTML: "",
    textContent: "",
    className: "",
    value: "",
    disabled: false,
    checked: false,
    clientWidth: 900,
    clientHeight: 560,
    offsetWidth: 165,
    offsetHeight: 92,
    scrollHeight: 92,
    dataset: {},
    hidden: false,
    style: {
      setProperty() {},
      getPropertyValue() {
        return "";
      }
    },
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      }
    },
    get innerHTML() {
      return this._innerHTML;
    },
    set innerHTML(value) {
      this._innerHTML = String(value);
    },
    setAttribute() {},
    getAttribute() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    closest() {
      return null;
    },
    contains() {
      return false;
    },
    addEventListener() {},
    append() {},
    focus() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 900, height: 560 };
    }
  };
}

function makeDocument() {
  const els = new Map();
  return {
    getElementById(id) {
      if (!els.has(id)) els.set(id, makeEl());
      return els.get(id);
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    addEventListener() {},
    createElement() {
      return makeEl();
    },
    body: makeEl(),
    documentElement: makeEl(),
    _els: els
  };
}

function loadApp() {
  const sandbox = {
    __NETWATCH_NO_BOOTSTRAP__: true,
    console,
    document: makeDocument(),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({
      columnGap: "0",
      gap: "0",
      getPropertyValue() {
        return "";
      }
    }),
    CSS: {
      escape(value) {
        return String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
      }
    },
    innerWidth: 1200,
    innerHeight: 800,
    scrollY: 0,
    performance: {
      now() {
        return 0;
      }
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const epilogue = `;globalThis.__nw = {
    appState,
    escapeHtml,
    renderDashboardDevices,
    renderEvents,
    renderAlerts,
    renderDevicesTable,
    renderDeviceDetail,
    renderKpis,
    renderPresentationDashboard,
    renderPresentationDevices,
    renderTopology,
    renderShowcaseTopology,
    renderSettings
  };`;
  vm.runInContext(source + epilogue, sandbox);
  return sandbox;
}

function poisonedSnapshot() {
  return {
    mode: "live",
    devices: [
      {
        id: "evil",
        name: PAYLOAD,
        model: PAYLOAD,
        ip: PAYLOAD,
        vendor: PAYLOAD,
        fingerprint: PAYLOAD,
        status: "up",
        layout: { x: 1, y: 1 },
        interfaces: [
          {
            id: "evil-if",
            name: PAYLOAD,
            if_alias: PAYLOAD,
            if_descr: PAYLOAD,
            admin_status: "up",
            oper_status: "up",
            in_bps: null,
            out_bps: null,
            in_errors: 0,
            out_errors: 0,
            in_discards: 0,
            out_discards: 0
          }
        ]
      }
    ],
    links: [],
    alerts: [
      {
        id: "a",
        device_id: "evil",
        title: PAYLOAD,
        detail: PAYLOAD,
        severity: "warning",
        state: "active"
      }
    ],
    events: [{ id: "e", time: "00:00:00", text: PAYLOAD }],
    metric_catalog: [PAYLOAD],
    seeds: [],
    runtime: {},
    settings: { polling: {}, thresholds: {}, security: {} }
  };
}

function seedPoisonedSnapshot(sandbox) {
  sandbox.__nw.appState.snapshot = poisonedSnapshot();
  sandbox.__nw.appState.selectedDeviceId = "evil";
}

function assertEscapedHtml(html) {
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/i);
}

function allRenderedHtml(sandbox) {
  return [...sandbox.document._els.values()].map((el) => el.innerHTML).join("\n");
}

test("escapeHtml escapes dangerous markup and tolerates nullish values", () => {
  const sandbox = loadApp();
  const { escapeHtml } = sandbox.__nw;

  const escaped = escapeHtml(PAYLOAD);
  assert.match(escaped, /&lt;/);
  assert.match(escaped, /&gt;/);
  assert.doesNotMatch(escaped, /<img/i);
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("renderDashboardDevices escapes device strings in #dashboardDeviceList", () => {
  const sandbox = loadApp();
  seedPoisonedSnapshot(sandbox);

  sandbox.__nw.renderDashboardDevices();

  assertEscapedHtml(sandbox.document.getElementById("dashboardDeviceList").innerHTML);
});

test("renderEvents escapes event strings in #eventList", () => {
  const sandbox = loadApp();
  seedPoisonedSnapshot(sandbox);

  sandbox.__nw.renderEvents();

  assertEscapedHtml(sandbox.document.getElementById("eventList").innerHTML);
});

test("renderAlerts escapes alert and device strings in #alertList", () => {
  const sandbox = loadApp();
  seedPoisonedSnapshot(sandbox);

  sandbox.__nw.renderAlerts();

  assertEscapedHtml(sandbox.document.getElementById("alertList").innerHTML);
});

test("renderDevicesTable escapes device strings in #devicesTable", () => {
  const sandbox = loadApp();
  seedPoisonedSnapshot(sandbox);

  sandbox.__nw.renderDevicesTable();

  assertEscapedHtml(sandbox.document.getElementById("devicesTable").innerHTML);
});

test("renderDeviceDetail escapes device and interface strings in #deviceDetail", () => {
  const sandbox = loadApp();
  seedPoisonedSnapshot(sandbox);

  sandbox.__nw.renderDeviceDetail();

  assertEscapedHtml(sandbox.document.getElementById("deviceDetail").innerHTML);
});

test("renderKpis escapes re-injected stream state in #kpiGrid", () => {
  const sandbox = loadApp();
  seedPoisonedSnapshot(sandbox);
  sandbox.document.getElementById("eventStreamState").textContent = PAYLOAD;

  sandbox.__nw.renderKpis();

  assertEscapedHtml(sandbox.document.getElementById("kpiGrid").innerHTML);
});

test("presentation and topology renderers escape device-controlled strings", () => {
  const sandbox = loadApp();
  seedPoisonedSnapshot(sandbox);

  sandbox.__nw.renderPresentationDashboard();
  sandbox.__nw.renderPresentationDevices();
  sandbox.__nw.renderTopology();
  sandbox.__nw.renderShowcaseTopology();
  sandbox.__nw.renderSettings();

  const html = allRenderedHtml(sandbox);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, new RegExp(PAYLOAD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("showcase topology normalizes enum fields before writing class attributes", () => {
  const sandbox = loadApp();
  seedPoisonedSnapshot(sandbox);
  sandbox.__nw.appState.snapshot.devices[0].status = 'up" autofocus onfocus="window.__xss=1';

  sandbox.__nw.renderShowcaseTopology();

  const html = sandbox.document.getElementById("showcaseNodeLayer").innerHTML;
  assert.doesNotMatch(html, /autofocus onfocus/i);
  assert.match(html, /showcase-node unknown/);
});
