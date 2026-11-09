// Pure force-directed layout for the Serenity graph.
//
// Replaces the old fixed-ring placement (nodes on two rings by index,
// which ignored link structure entirely). This is a small custom
// simulation: repulsion between all nodes, springs along [[link]]
// edges, weak gravity toward the centre, and hard collision
// separation so circles never overlap.
//
// Deterministic: no Math.random anywhere, so the same thoughts always
// lay out the same way. Warm-startable: pass previous positions and
// existing nodes barely move when a thought is added.

import { titleOf } from './thoughts';

export const LAYOUT_W = 800;
export const LAYOUT_H = 560;

// Node radius grows a little with how connected the thought is, so
// hub thoughts read as hubs. Labels wrap to at most two lines inside
// the circle (see wrapLabel in GraphView).
export function nodeRadius(thought, degree) {
  return 34 + Math.min(12, (degree || 0) * 3);
}

function degreeOf(id, links) {
  let d = 0;
  for (const l of links) {
    if (l.a === id || l.b === id) d += 1;
  }
  return d;
}

// Deterministic golden-angle spiral start position for a node index.
function spiralStart(i, total) {
  const angle = i * 2.39996; // golden angle
  const radius = 40 + 34 * Math.sqrt(i);
  return {
    x: LAYOUT_W / 2 + Math.cos(angle) * radius,
    y: LAYOUT_H / 2 + Math.sin(angle) * radius * 0.7,
  };
}

// thoughts: [{id, text, ...}]
// links: [{a: id, b: id}] undirected, deduped
// prev: Map<id, {x, y}> of previous positions (warm start), optional
// Returns: [{id, x, y, r, thought}]
export function computeLayout(thoughts, links, prev) {
  const nodes = thoughts.map((t, i) => {
    const start = prev && prev.has(t.id) ? prev.get(t.id) : spiralStart(i, thoughts.length);
    return {
      id: t.id,
      thought: t,
      x: start.x,
      y: start.y,
      vx: 0,
      vy: 0,
      r: nodeRadius(t, degreeOf(t.id, links)),
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = links
    .map((l) => [byId.get(l.a), byId.get(l.b)])
    .filter(([a, b]) => a && b && a !== b);

  const n = nodes.length;
  if (n === 0) return [];
  if (n === 1) {
    nodes[0].x = LAYOUT_W / 2;
    nodes[0].y = LAYOUT_H / 2;
    return nodes.map(strip);
  }

  const CX = LAYOUT_W / 2;
  const CY = LAYOUT_H / 2;
  const REST = 150; // spring rest length for a linked pair
  const REPEL = 9000; // repulsion strength
  const ITERATIONS = 260;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const cooling = 1 - iter / ITERATIONS; // settle over time
    // Repulsion between every pair.
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        const minD = a.r + b.r + 14;
        if (d2 < 1) {
          dx = (i % 2 === 0 ? 1 : -1) * 0.7;
          dy = 0.7;
          d2 = 1;
        }
        const d = Math.sqrt(d2);
        // Stronger push when closer than the minimum gap.
        const f = (d < minD ? REPEL * 2.2 : REPEL) / d2;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }
    // Springs along edges pull linked nodes together.
    for (const [a, b] of edges) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = ((d - REST) / REST) * 0.9;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
    // Weak gravity toward the centre keeps unlinked nodes from drifting off.
    for (const nd of nodes) {
      nd.vx += (CX - nd.x) * 0.0016;
      nd.vy += (CY - nd.y) * 0.0016;
    }
    // Integrate with damping and a per-step cap.
    for (const nd of nodes) {
      nd.vx *= 0.82;
      nd.vy *= 0.82;
      let stepX = nd.vx * cooling;
      let stepY = nd.vy * cooling;
      const step = Math.sqrt(stepX * stepX + stepY * stepY);
      const maxStep = 14;
      if (step > maxStep) {
        stepX = (stepX / step) * maxStep;
        stepY = (stepY / step) * maxStep;
      }
      nd.x += stepX;
      nd.y += stepY;
      nd.x = Math.max(nd.r + 8, Math.min(LAYOUT_W - nd.r - 8, nd.x));
      nd.y = Math.max(nd.r + 8, Math.min(LAYOUT_H - nd.r - 8, nd.y));
    }
  }

  // Final hard separation passes: guarantee no two circles overlap,
  // even if springs pulled a linked pair too close.
  for (let pass = 0; pass < 120; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const minD = a.r + b.r + 6;
        if (d < minD) {
          const push = (minD - d) / 2;
          const ux = dx / d;
          const uy = dy / d;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
          moved = true;
        }
      }
    }
    for (const nd of nodes) {
      nd.x = Math.max(nd.r + 4, Math.min(LAYOUT_W - nd.r - 4, nd.x));
      nd.y = Math.max(nd.r + 4, Math.min(LAYOUT_H - nd.r - 4, nd.y));
    }
    if (!moved) break;
  }

  return nodes.map(strip);
}

function strip(n) {
  return { id: n.id, x: n.x, y: n.y, r: n.r, thought: n.thought };
}

// Mean distance helpers, used by tests to show the layout actually
// respects link structure (linked pairs end up closer than unlinked).
export function meanPairDistance(nodes, pairs) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let sum = 0;
  let count = 0;
  for (const [a, b] of pairs) {
    const na = byId.get(a);
    const nb = byId.get(b);
    if (!na || !nb) continue;
    sum += Math.hypot(na.x - nb.x, na.y - nb.y);
    count += 1;
  }
  return count ? sum / count : 0;
}

export function titleForTest(t) {
  return titleOf(t);
}
