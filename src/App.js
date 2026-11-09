import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import GraphView from './components/GraphView';
import {
  backlinks,
  loadThoughts,
  makeId,
  outgoingLinks,
  resolveLinks,
  saveThoughts,
  seedThoughts,
  titleOf,
} from './lib/thoughts';

const VIEWS = [
  { id: 'feed', label: 'Feed' },
  { id: 'bubbles', label: 'Bubbles' },
  { id: 'graph', label: 'Graph' },
];

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fullTime(ts) {
  return new Date(ts).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Renders thought text with [[links]] as clickable buttons.
// Resolved links open the target thought; dangling links prefill the
// composer so the thought can be created (Obsidian-style).
function ThoughtText({ thoughts, text, onOpenLink }) {
  const segments = resolveLinks(thoughts, text);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'link' ? (
          <button
            key={i}
            type="button"
            className={seg.id ? 'wikilink' : 'wikilink dangling'}
            title={seg.id ? 'Open linked thought' : 'Create this thought'}
            onClick={(e) => {
              e.stopPropagation();
              onOpenLink(seg);
            }}
          >
            {seg.target}
          </button>
        ) : (
          <span key={i}>{seg.value}</span>
        )
      )}
    </>
  );
}

// Radial placement for the bubbles view — the original signature layout:
// each bubble sits on a ring, rotated out from the center and rotated back.
function bubbleStyle(index, total) {
  const perRing = 8;
  const ring = Math.floor(index / perRing);
  const inRing = index % perRing;
  const ringCount = Math.min(perRing, total - ring * perRing);
  const angle = (inRing / ringCount) * 360 + ring * 25;
  const radius = 115 + ring * 100;
  return {
    transform: `rotate(${angle}deg) translate(${radius}px) rotate(-${angle}deg)`,
  };
}

function bubbleSize(text) {
  const len = titleOf({ text }).length;
  const d = 84 + Math.min(72, len * 1.1);
  return { width: d, height: d, fontSize: len > 40 ? 12 : 14 };
}

function App() {
  const [thoughts, setThoughts] = useState(() => {
    const loaded = loadThoughts();
    return loaded === null ? seedThoughts() : loaded;
  });
  const [view, setView] = useState('feed');
  const [query, setQuery] = useState('');
  const [input, setInput] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const composerRef = useRef(null);

  useEffect(() => {
    saveThoughts(thoughts);
  }, [thoughts]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return thoughts;
    return thoughts.filter((t) => t.text.toLowerCase().includes(q));
  }, [thoughts, query]);

  const sorted = useMemo(
    () => [...visible].sort((a, b) => b.createdAt - a.createdAt),
    [visible]
  );

  const linkCount = useMemo(() => {
    const pairs = new Set();
    for (const t of thoughts) {
      for (const target of outgoingLinks(thoughts, t)) {
        pairs.add([t.id, target.id].sort().join('|'));
      }
    }
    return pairs.size;
  }, [thoughts]);

  const selected = thoughts.find((t) => t.id === selectedId) || null;
  const selectedBacklinks = selected ? backlinks(thoughts, selected.id) : [];
  const selectedOutgoing = selected ? outgoingLinks(thoughts, selected) : [];

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    const thought = { id: makeId(), text, createdAt: Date.now() };
    setThoughts((prev) => [thought, ...prev]);
    setInput('');
  };

  const handleOpenLink = (seg) => {
    if (seg.id) {
      setSelectedId(seg.id);
      return;
    }
    setInput(seg.target);
    setView('feed');
    setTimeout(() => {
      if (composerRef.current) composerRef.current.focus();
    }, 0);
  };

  const handleDelete = (id) => {
    setThoughts((prev) => prev.filter((t) => t.id !== id));
    setSelectedId(null);
  };

  const handleClearAll = () => {
    if (
      window.confirm(
        'Delete all thoughts? This clears your local save too.'
      )
    ) {
      setThoughts([]);
      setSelectedId(null);
    }
  };

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-mark">serenity</span>
            <span className="brand-tag">drop a thought, watch it find its people</span>
          </div>
          <input
            type="search"
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search thoughts…"
            aria-label="Search thoughts"
          />
        </div>
        <nav className="view-tabs" aria-label="Views">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={view === v.id ? 'view-tab active' : 'view-tab'}
              aria-pressed={view === v.id}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
          <span className="stats">
            {thoughts.length} thought{thoughts.length === 1 ? '' : 's'} ·{' '}
            {linkCount} link{linkCount === 1 ? '' : 's'}
            {query.trim() && ` · showing ${visible.length}`}
          </span>
        </nav>
      </header>

      <main className="main">
        <form onSubmit={handleSubmit} className="composer">
          <textarea
            ref={composerRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Drop a thought… use [[double brackets]] to link thoughts"
            rows={2}
            aria-label="Drop a thought"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e);
            }}
          />
          <div className="composer-foot">
            <span className="composer-hint">
              [[link]] another thought · Cmd/Ctrl+Enter to drop
            </span>
            <button type="submit" className="btn-primary" disabled={!input.trim()}>
              Drop it
            </button>
          </div>
        </form>

        {view === 'feed' && (
          <section className="feed" aria-label="Thought feed">
            {sorted.length === 0 ? (
              <p className="empty">
                {query.trim()
                  ? 'No thoughts match that search.'
                  : 'No thoughts yet. Drop the first one above.'}
              </p>
            ) : (
              sorted.map((t) => {
                const outs = outgoingLinks(thoughts, t).length;
                const backs = backlinks(thoughts, t.id).length;
                return (
                  <article
                    key={t.id}
                    className="thought-card"
                    onClick={() => setSelectedId(t.id)}
                  >
                    <p className="thought-text">
                      <ThoughtText
                        thoughts={thoughts}
                        text={t.text}
                        onOpenLink={handleOpenLink}
                      />
                    </p>
                    <div className="thought-meta">
                      <span>{relativeTime(t.createdAt)}</span>
                      {outs > 0 && <span>· {outs} link{outs === 1 ? '' : 's'}</span>}
                      {backs > 0 && (
                        <span>· {backs} backlink{backs === 1 ? '' : 's'}</span>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </section>
        )}

        {view === 'bubbles' && (
          <section className="bubbles-stage" aria-label="Thought bubbles">
            {sorted.length === 0 ? (
              <p className="empty">No thoughts match. Drop one above.</p>
            ) : (
              <div className="bubble-container">
                {sorted.map((t, i) => {
                  const links = outgoingLinks(thoughts, t).length + backlinks(thoughts, t.id).length;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className="bubble"
                      style={{ ...bubbleStyle(i, sorted.length), ...bubbleSize(t.text) }}
                      title={t.text}
                      onClick={() => setSelectedId(t.id)}
                    >
                      {titleOf(t)}
                      {links > 0 && <span className="bubble-links">{links}↗</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {view === 'graph' && (
          <section aria-label="Thought graph">
            <GraphView
              thoughts={visible}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </section>
        )}
      </main>

      <footer className="app-footer">
        <span>Thoughts are saved in your browser (localStorage).</span>
        <button type="button" className="btn-ghost" onClick={handleClearAll}>
          Clear all
        </button>
      </footer>

      {selected && (
        <div
          className="detail-overlay"
          onClick={() => setSelectedId(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Thought detail"
        >
          <div className="detail-card" onClick={(e) => e.stopPropagation()}>
            <div className="detail-meta">{fullTime(selected.createdAt)}</div>
            <p className="detail-text">
              <ThoughtText
                thoughts={thoughts}
                text={selected.text}
                onOpenLink={handleOpenLink}
              />
            </p>

            {selectedOutgoing.length > 0 && (
              <div className="detail-section">
                <h3>Links to</h3>
                <ul>
                  {selectedOutgoing.map((t) => (
                    <li key={t.id}>
                      <button type="button" className="link-row" onClick={() => setSelectedId(t.id)}>
                        {titleOf(t)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="detail-section">
              <h3>Linked from</h3>
              {selectedBacklinks.length === 0 ? (
                <p className="muted">Nothing links here yet.</p>
              ) : (
                <ul>
                  {selectedBacklinks.map((t) => (
                    <li key={t.id}>
                      <button type="button" className="link-row" onClick={() => setSelectedId(t.id)}>
                        {titleOf(t)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="detail-actions">
              <button
                type="button"
                className="btn-danger"
                onClick={() => handleDelete(selected.id)}
              >
                Delete thought
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setSelectedId(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
