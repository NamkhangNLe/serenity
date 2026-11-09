import { computeLayout, meanPairDistance, LAYOUT_W, LAYOUT_H } from './graphLayout';
import { seedThoughts, outgoingLinks } from './thoughts';

function linksOf(thoughts) {
  const seen = new Set();
  const list = [];
  for (const t of thoughts) {
    for (const target of outgoingLinks(thoughts, t)) {
      const key = [t.id, target.id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ a: t.id, b: target.id });
    }
  }
  return list;
}

function assertNoOverlap(nodes) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      expect(d).toBeGreaterThanOrEqual(nodes[i].r + nodes[j].r - 2);
    }
  }
}

function assertInBounds(nodes) {
  for (const n of nodes) {
    expect(n.x).toBeGreaterThanOrEqual(n.r - 1);
    expect(n.x).toBeLessThanOrEqual(LAYOUT_W - n.r + 1);
    expect(n.y).toBeGreaterThanOrEqual(n.r - 1);
    expect(n.y).toBeLessThanOrEqual(LAYOUT_H - n.r + 1);
  }
}

test('seed layout has no overlapping nodes and stays in bounds', () => {
  const thoughts = seedThoughts();
  const nodes = computeLayout(thoughts, linksOf(thoughts));
  expect(nodes.length).toBe(thoughts.length);
  assertNoOverlap(nodes);
  assertInBounds(nodes);
});

test('layout is deterministic', () => {
  const thoughts = seedThoughts();
  const a = computeLayout(thoughts, linksOf(thoughts));
  const b = computeLayout(thoughts, linksOf(thoughts));
  expect(a).toEqual(b);
});

test('linked nodes end up closer than unlinked nodes', () => {
  // Two clusters of 5, fully linked internally, no links between them.
  const thoughts = [];
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < 5; i++) {
      thoughts.push({ id: `c${c}-${i}`, text: `cluster ${c} node ${i}`, createdAt: i });
    }
  }
  const links = [];
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        links.push({ a: `c${c}-${i}`, b: `c${c}-${j}` });
      }
    }
  }
  const nodes = computeLayout(thoughts, links);
  assertNoOverlap(nodes);
  const linkedPairs = links.map((l) => [l.a, l.b]);
  const unlinkedPairs = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      unlinkedPairs.push([`c0-${i}`, `c1-${j}`]);
    }
  }
  expect(meanPairDistance(nodes, linkedPairs)).toBeLessThan(
    meanPairDistance(nodes, unlinkedPairs)
  );
});

test('25 thoughts lay out without overlap', () => {
  const thoughts = Array.from({ length: 25 }, (_, i) => ({
    id: `t${i}`,
    text: `thought number ${i} about things`,
    createdAt: i,
  }));
  const links = [];
  for (let i = 1; i < 25; i++) {
    links.push({ a: `t${i - 1}`, b: `t${i}` });
  }
  const nodes = computeLayout(thoughts, links);
  assertNoOverlap(nodes);
  assertInBounds(nodes);
});
