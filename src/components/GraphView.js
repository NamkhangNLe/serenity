import React, { useMemo, useRef, useState } from 'react';
import { outgoingLinks, titleOf, truncate } from '../lib/thoughts';

const W = 800;
const H = 560;
const CX = W / 2;
const CY = H / 2;

// Interactive node graph: thoughts are circles, [[links]] are lines.
// Drag the background to pan, use the buttons to zoom, click a node to open it.
export default function GraphView({ thoughts, selectedId, onSelect }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);

  const nodes = useMemo(() => {
    const n = thoughts.length;
    return thoughts.map((t, i) => {
      if (n <= 1) return { id: t.id, x: CX, y: CY, thought: t };
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      // Alternate two rings so linked nodes do not sit on one circle.
      const r = i % 2 === 0 ? 150 : 215;
      return {
        id: t.id,
        x: CX + Math.cos(angle) * r,
        y: CY + Math.sin(angle) * r,
        thought: t,
      };
    });
  }, [thoughts]);

  const edges = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const seen = new Set();
    const list = [];
    for (const t of thoughts) {
      for (const target of outgoingLinks(thoughts, t)) {
        const key = [t.id, target.id].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const a = byId.get(t.id);
        const b = byId.get(target.id);
        if (a && b) list.push({ a, b, id: key });
      }
    }
    return list;
  }, [thoughts, nodes]);

  const onPointerDown = (e) => {
    if (e.target.closest && e.target.closest('.graph-node')) return;
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      pan: { ...pan },
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    setPan({ x: d.pan.x + dx, y: d.pan.y + dy });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="graph-wrap">
      <div className="graph-tools">
        <button type="button" onClick={() => setScale((s) => Math.min(2, +(s + 0.2).toFixed(2)))} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(2)))} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }}>Reset</button>
        <span className="graph-hint">Drag to pan · click a node to open it</span>
      </div>
      {thoughts.length === 0 ? (
        <p className="empty">No thoughts match. Drop one above.</p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="graph-svg"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <g transform={`translate(${CX + pan.x} ${CY + pan.y}) scale(${scale}) translate(${-CX} ${-CY})`}>
            {edges.map((e) => (
              <line
                key={e.id}
                x1={e.a.x}
                y1={e.a.y}
                x2={e.b.x}
                y2={e.b.y}
                className="graph-edge"
              />
            ))}
            {nodes.map((n) => (
              <g
                key={n.id}
                className={`graph-node${n.id === selectedId ? ' selected' : ''}`}
                transform={`translate(${n.x} ${n.y})`}
                onClick={() => onSelect(n.id)}
              >
                <circle r={30} />
                <text textAnchor="middle" dy="4">
                  {truncate(titleOf(n.thought), 16)}
                </text>
              </g>
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}
