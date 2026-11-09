import React, { useEffect, useMemo, useRef, useState } from 'react';
import { outgoingLinks, titleOf, truncate } from '../lib/thoughts';
import { LAYOUT_W, LAYOUT_H, computeLayout } from '../lib/graphLayout';

const W = LAYOUT_W;
const H = LAYOUT_H;
const CX = W / 2;
const CY = H / 2;

// Wrap a node label to at most two short lines so it stays inside
// its circle instead of spilling out (the old view truncated to 16
// chars in one line and still overflowed the 60px circle).
export function wrapLabel(text, maxChars = 11) {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  let overflow = false;
  for (const w of words) {
    const word = w.length > maxChars ? w.slice(0, maxChars - 1) + '…' : w;
    if (!cur) {
      cur = word;
    } else if ((cur + ' ' + word).length <= maxChars) {
      cur += ' ' + word;
    } else if (lines.length === 0) {
      lines.push(cur);
      cur = word;
    } else {
      overflow = true;
      break;
    }
  }
  if (cur) lines.push(cur);
  if (overflow && lines.length === 2) {
    lines[1] = truncate(lines[1], maxChars - 1) + '…';
  }
  return lines.slice(0, 2);
}

// Deterministic starfield for the dark canvas: same dots every render.
const STARS = Array.from({ length: 46 }, (_, i) => {
  const x = ((i * 137.5 + 53) % 800) / 800;
  const y = ((i * 89.3 + 191) % 560) / 560;
  return { x: x * W, y: y * H, r: 0.7 + ((i * 7) % 3) * 0.45, o: 0.25 + ((i * 13) % 10) / 22 };
});

// Interactive node graph: thoughts are glowing nodes on a dark
// constellation canvas, [[links]] are edges. Force-directed layout
// (see lib/graphLayout) puts linked thoughts near each other.
// Scroll/pinch zooms around the cursor, drag the background to pan,
// drag a node to move it, click a node to open it.
export default function GraphView({ thoughts, selectedId, onSelect }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef(null);
  const positionsRef = useRef(new Map());
  const dragRef = useRef(null); // {kind:'pan'|'node', ...}
  const pointersRef = useRef(new Map());
  const suppressClickRef = useRef(false);

  const edges = useMemo(() => {
    const seen = new Set();
    const list = [];
    const ids = new Set(thoughts.map((t) => t.id));
    for (const t of thoughts) {
      for (const target of outgoingLinks(thoughts, t)) {
        if (!ids.has(target.id)) continue;
        const key = [t.id, target.id].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({ a: t.id, b: target.id, id: key });
      }
    }
    return list;
  }, [thoughts]);

  // Layout: warm-started from the previous positions so adding a
  // thought doesn't reshuffle the whole constellation.
  const layout = useMemo(() => {
    const result = computeLayout(thoughts, edges, positionsRef.current);
    positionsRef.current = new Map(result.map((n) => [n.id, { x: n.x, y: n.y }]));
    return result;
  }, [thoughts, edges]);

  // Live positions (layout + node drags). Node drags mutate this state
  // directly; the memo above only re-runs when thoughts/edges change.
  const [live, setLive] = useState(layout);
  useEffect(() => {
    setLive(layout);
  }, [layout]);

  const nodesById = useMemo(() => new Map(live.map((n) => [n.id, n])), [live]);

  // Convert a client point to SVG (viewBox) coordinates.
  const toSvgPoint = (clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  };

  // Zoom around an SVG point (cursor / pinch midpoint), keeping the
  // world point under it fixed on screen.
  const zoomAround = (svgPoint, factor) => {
    setScale((s) => {
      const next = Math.max(0.35, Math.min(3, s * factor));
      const ratio = next / s;
      setPan((p) => ({
        x: svgPoint.x - CX - ratio * (svgPoint.x - CX - p.x),
        y: svgPoint.y - CY - ratio * (svgPoint.y - CY - p.y),
      }));
      return next;
    });
  };

  const zoomButton = (factor) => {
    zoomAround({ x: CX, y: CY }, factor);
  };

  // Native wheel listener (React's onWheel can't preventDefault):
  // wheel zooms around the cursor, not the centre.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e) => {
      e.preventDefault();
      const pt = toSvgPoint(e.clientX, e.clientY);
      zoomAround(pt, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e) => {
    const nodeEl = e.target.closest && e.target.closest('.graph-node');
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-id');
      const node = nodesById.get(id);
      if (!node) return;
      dragRef.current = {
        kind: 'node',
        id,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        orig: { x: node.x, y: node.y },
      };
    } else {
      dragRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        pan: { ...pan },
        moved: false,
      };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const prev = pointersRef.current.get(e.pointerId);
    if (prev) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Two-finger pinch: zoom around the midpoint, pan with it.
    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      const prevPts = dragRef.current && dragRef.current.pinchPts;
      if (prevPts) {
        const prevDist = Math.hypot(prevPts[0].x - prevPts[1].x, prevPts[0].y - prevPts[1].y);
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (prevDist > 0 && dist > 0) {
          const mid = {
            x: (pts[0].x + pts[1].x) / 2,
            y: (pts[0].y + pts[1].y) / 2,
          };
          const prevMid = {
            x: (prevPts[0].x + prevPts[1].x) / 2,
            y: (prevPts[0].y + prevPts[1].y) / 2,
          };
          zoomAround(toSvgPoint(mid.x, mid.y), dist / prevDist);
          setPan((p) => ({
            x: p.x + ((mid.x - prevMid.x) / svgRef.current.getBoundingClientRect().width) * W,
            y: p.y + ((mid.y - prevMid.y) / svgRef.current.getBoundingClientRect().height) * H,
          }));
          if (dragRef.current) dragRef.current.moved = true;
        }
      }
      if (dragRef.current) dragRef.current.pinchPts = pts;
      return;
    }

    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
    if (!d.moved) return;

    if (d.kind === 'pan') {
      const rect = svgRef.current.getBoundingClientRect();
      setPan({
        x: d.pan.x + (dx / rect.width) * W,
        y: d.pan.y + (dy / rect.height) * H,
      });
    } else if (d.kind === 'node') {
      const rect = svgRef.current.getBoundingClientRect();
      const wx = (dx / rect.width) * W / scale;
      const wy = (dy / rect.height) * H / scale;
      const nx = Math.max(20, Math.min(W - 20, d.orig.x + wx));
      const ny = Math.max(20, Math.min(H - 20, d.orig.y + wy));
      positionsRef.current.set(d.id, { x: nx, y: ny });
      setLive((prevLive) =>
        prevLive.map((n) => (n.id === d.id ? { ...n, x: nx, y: ny } : n))
      );
    }
  };

  const endPointer = (e) => {
    pointersRef.current.delete(e.pointerId);
    const d = dragRef.current;
    if (d && d.moved) {
      // A drag that ends over a node must NOT select it: suppress the
      // click event that follows pointerup.
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 80);
    }
    if (pointersRef.current.size < 2) dragRef.current = null;
  };

  const onNodeClick = (id) => {
    if (suppressClickRef.current) return;
    onSelect(id);
  };

  const resetView = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="graph-wrap">
      <div className="graph-tools">
        <button type="button" onClick={() => zoomButton(1.25)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoomButton(1 / 1.25)} aria-label="Zoom out">−</button>
        <button type="button" onClick={resetView}>Reset</button>
        <span className="graph-hint">Scroll to zoom · drag to pan · drag a node to move it · click a node to open it</span>
      </div>
      {thoughts.length === 0 ? (
        <p className="empty">No thoughts match. Drop one above.</p>
      ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="graph-svg"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          <defs>
            <radialGradient id="nodeGlow" cx="35%" cy="30%" r="80%">
              <stop offset="0%" stopColor="#c7d2fe" />
              <stop offset="55%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#4f46e5" />
            </radialGradient>
            <radialGradient id="nodeGlowSelected" cx="35%" cy="30%" r="80%">
              <stop offset="0%" stopColor="#fef3c7" />
              <stop offset="55%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#d97706" />
            </radialGradient>
            <filter id="nodeShadow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect x={0} y={0} width={W} height={H} className="graph-bg" />
          {STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} className="graph-star" opacity={s.o} />
          ))}
          <g transform={`translate(${CX + pan.x} ${CY + pan.y}) scale(${scale}) translate(${-CX} ${-CY})`}>
            {edges.map((e) => {
              const a = nodesById.get(e.a);
              const b = nodesById.get(e.b);
              if (!a || !b) return null;
              return (
                <line
                  key={e.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className="graph-edge"
                />
              );
            })}
            {live.map((n) => {
              const lines = wrapLabel(titleOf(n.thought));
              return (
                <g
                  key={n.id}
                  data-id={n.id}
                  className={`graph-node${n.id === selectedId ? ' selected' : ''}`}
                  transform={`translate(${n.x} ${n.y})`}
                  onClick={() => onNodeClick(n.id)}
                >
                  <circle r={n.r} fill={n.id === selectedId ? 'url(#nodeGlowSelected)' : 'url(#nodeGlow)'} filter="url(#nodeShadow)" />
                  <text textAnchor="middle" dy={lines.length === 1 ? '4' : '-3'}>
                    {lines.map((line, i) => (
                      <tspan key={i} x={0} dy={i === 0 ? 0 : 12}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}
