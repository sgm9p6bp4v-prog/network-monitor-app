const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const stopResistancePixels = 260;
const maxStopContribution = 100;

export function wheelPixels(event, viewport) {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport : 1;
  return event.deltaY * unit;
}

export class PresentationScroll {
  constructor() {
    this.reset(0);
  }

  reset(top) {
    this.target = top;
    this.direction = 0;
    this.stop = null;
  }

  move(delta, current, anchors, viewport, maxScroll) {
    if (!Number.isFinite(delta) || !delta) return this.target;
    const direction = Math.sign(delta);
    if (direction !== this.direction) this.reset(current);
    this.direction = direction;

    if (this.stop) {
      // Arrival consumes the incoming gesture; only further input releases the page.
      if (Math.abs(current - this.stop.top) > 1) return this.target;
      this.stop.effort += Math.min(Math.abs(delta), maxStopContribution);
      if (this.stop.effort < stopResistancePixels) return this.target;
      delta = direction * (this.stop.effort - stopResistancePixels);
      this.stop = null;
    }

    const travel = clamp(delta, -Math.min(280, viewport * 0.45), Math.min(280, viewport * 0.45));
    const next = clamp(this.target + travel, 0, maxScroll);
    const candidates = anchors.filter((anchor) =>
      anchor.top <= maxScroll + 1 && (anchor.top - this.target) * direction > 1
    );
    const anchor = direction > 0 ? candidates[0] : candidates.at(-1);
    if (anchor && (next - anchor.top) * direction >= 0) {
      this.target = anchor.top;
      this.stop = { ...anchor, effort: 0 };
    } else {
      this.target = next;
    }
    return this.target;
  }

  advance(current, elapsed, viewport) {
    const distance = this.target - current;
    if (Math.abs(distance) <= 1) return this.target;
    const brakingDistance = Math.min(200, viewport * 0.22);
    const approach = this.stop ? 1 - clamp(Math.abs(distance) / brakingDistance, 0, 1) : 0;
    const responseMs = 105 + approach * 80;
    return current + distance * (1 - Math.exp(-elapsed / responseMs));
  }
}
