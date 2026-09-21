import test from "node:test";
import assert from "node:assert/strict";
import { PresentationScroll, wheelPixels } from "../web/presentation-scroll.mjs";

const anchors = [
  { name: "home", top: 0 },
  { name: "topology", top: 900 },
  { name: "dashboard", top: 2100 },
  { name: "devices", top: 3000 }
];
const move = (scroll, delta, current) => scroll.move(delta, current, anchors, 900, 3000);
function settle(scroll, current) {
  for (let frame = 0; frame < 240; frame++) current = scroll.advance(current, 16, 900);
  assert.equal(current, scroll.target);
  return current;
}

test("one wheel step travels only its distance, even after animation settles", () => {
  const scroll = new PresentationScroll();
  assert.equal(move(scroll, 120, 0), 120);
  assert.equal(settle(scroll, 0), 120);
  assert.equal(scroll.stop, null);
});

test("arrival discards excess momentum and waits for three further wheel steps", () => {
  const scroll = new PresentationScroll();
  scroll.reset(800);
  assert.equal(move(scroll, 120, 800), 900);
  for (let i = 0; i < 20; i++) assert.equal(move(scroll, 120, 850), 900);
  assert.equal(settle(scroll, 850), 900);
  assert.equal(move(scroll, 120, 900), 900);
  assert.equal(move(scroll, 120, 900), 900);
  assert.ok(move(scroll, 120, 900) > 900);
  assert.ok(scroll.target < 1000);
});

test("reverse travel stops on the same pages and direction changes release immediately", () => {
  const scroll = new PresentationScroll();
  scroll.reset(2250);
  assert.equal(move(scroll, -200, 2250), 2100);
  settle(scroll, 2250);
  assert.equal(move(scroll, -120, 2100), 2100);
  assert.equal(move(scroll, -120, 2100), 2100);
  assert.ok(move(scroll, -120, 2100) < 2100);
  scroll.reset(800);
  move(scroll, 120, 800);
  settle(scroll, 800);
  assert.equal(move(scroll, -120, 900), 780);
});

test("large trackpad gestures cannot skip a page or bypass an arrival hold", () => {
  const scroll = new PresentationScroll();
  assert.ok(move(scroll, 10000, 0) < 900);
  scroll.reset(800);
  move(scroll, 10000, 800);
  settle(scroll, 800);
  assert.equal(move(scroll, 10000, 900), 900);
  assert.equal(move(scroll, 10000, 900), 900);
  assert.ok(move(scroll, 10000, 900) < 1000);
});

test("small trackpad deltas accumulate and native wheel units normalize", () => {
  const scroll = new PresentationScroll();
  scroll.reset(890);
  move(scroll, 20, 890);
  settle(scroll, 890);
  for (let i = 0; i < 25; i++) assert.equal(move(scroll, 10, 900), 900);
  move(scroll, 10, 900);
  assert.equal(move(scroll, 10, 900), 910);
  assert.equal(wheelPixels({ deltaY: 3, deltaMode: 1 }, 900), 48);
  assert.equal(wheelPixels({ deltaY: -1, deltaMode: 2 }, 900), -900);
});

test("reverse input cancels pending forward travel", () => {
  const scroll = new PresentationScroll();
  move(scroll, 240, 0);
  assert.equal(move(scroll, -80, 100), 20);
  assert.equal(settle(scroll, 100), 20);
});

test("animation is frame-rate independent and brakes on approach", () => {
  const scroll = new PresentationScroll();
  move(scroll, 200, 0);
  const once = scroll.advance(0, 32, 900);
  const twice = scroll.advance(scroll.advance(0, 16, 900), 16, 900);
  assert.ok(Math.abs(once - twice) < 0.001);
  scroll.reset(800);
  move(scroll, 120, 800);
  const brakingStep = scroll.advance(800, 16, 900) - 800;
  scroll.stop = null;
  assert.ok(brakingStep < scroll.advance(800, 16, 900) - 800);
});

test("layout changes reset holds and use actual section offsets", () => {
  const scroll = new PresentationScroll();
  scroll.reset(800);
  move(scroll, 120, 800);
  scroll.reset(600);
  assert.equal(scroll.stop, null);
  assert.equal(scroll.move(240, 600, [{name: "topology", top: 820}], 844, 4000), 820);
  scroll.reset(2950);
  assert.equal(move(scroll, 240, 2950), 3000);
});
