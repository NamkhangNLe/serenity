import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import GraphView from './components/GraphView';
import {
  backlinks,
  findThoughtCandidates,
  loadThoughts,
  makeId,
  outgoingLinks,
  resolveLinks,
  saveThoughts,
  seedThoughts,
  titleOf,
  validateImportedThoughts,
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

// The brand mark: a tiny constellation — three stars joined by lines.
// Serenity has no people and no logo yet; this is its mark.
function BrandMark() {
  return (
    <svg className="brand-svg" viewBox="0 0 32 32" aria-hidden="true">
      <line x1="8" y1="22" x2="16" y2="9" />
      <line x1="16" y1="9" x2="25" y2="18" />
      <circle cx="8" cy="22" r="3" />
      <circle cx="16" cy="9" r="3.6" />
      <circle cx="25" cy="18" r="2.6" />
    </svg>
  );
}

// Renders thought text with [[links]] as clickable buttons.
// Exact matches open the target thought; ambiguous links (several
// thoughts could match) open the disambiguation chooser; dangling
// links prefill the composer so the thought can be created
// (Obsidian-style).
function ThoughtText({ thoughts, text, onOpenLink }) {
  const segments = resolveLinks(thoughts, text);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'link' ? (
          <button
            key={i}
            type="button"
            className={
              seg.id
                ? 'wikilink'
                : seg.candidates.length > 0
                  ? 'wikilink ambiguous'
                  : 'wikilink dangling'
            }
            title={
              seg.id
                ? 'Open linked thought'
                : seg.candidates.length > 0
                  ? `${seg.candidates.length} thoughts could match — pick one`
                  : 'Create this thought'
            }
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
// The positioning transform lives on the OUTER button; the pop-in
// animation lives on an INNER element, so the animation can never
// override the positioning (the old .bubble animation did exactly
// that, collapsing every bubble to the centre).
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
  const [disambig, setDisambig] = useState(null); // {target, candidates}
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [notice, setNotice] = useState('');
  const [suggest, setSuggest] = useState(null); // {query, start, caret, active}
  const composerRef = useRef(null);
  const importRef = useRef(null);

  useEffect(() => {
    saveThoughts(thoughts);
  }, [thoughts]);

  // Esc closes the detail modal, the disambiguation chooser, and the
  // link autocomplete — in that priority order.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (suggest) {
        setSuggest(null);
      } else if (disambig) {
        setDisambig(null);
      } else if (selectedId) {
        setSelectedId(null);
        setEditing(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [suggest, disambig, selectedId]);

  // A short-lived status line (import/export feedback) that clears itself.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(t);
  }, [notice]);

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

  // --- composer + [[link]] autocomplete ---------------------------------

  const updateSuggest = (value, caret) => {
    const before = value.slice(0, caret);
    const m = /\[\[([^\]\n]*)$/.exec(before);
    if (!m) {
      setSuggest(null);
      return;
    }
    const q = m[1];
    // With an empty query, offer the most recent thoughts.
    const list = q
      ? findThoughtCandidates(thoughts, q).slice(0, 6)
      : [...thoughts].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
    setSuggest({ query: q, start: m.index, caret, active: 0, list });
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInput(value);
    updateSuggest(value, e.target.selectionStart);
  };

  const acceptSuggestion = (thought) => {
    if (!suggest) return;
    const title = titleOf(thought);
    const before = input.slice(0, suggest.start);
    const after = input.slice(suggest.caret);
    const next = `${before}[[${title}]]${after}`;
    setInput(next);
    setSuggest(null);
    const pos = before.length + title.length + 4;
    setTimeout(() => {
      if (composerRef.current) {
        composerRef.current.focus();
        composerRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const handleComposerKeyDown = (e) => {
    if (suggest && suggest.list.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        setSuggest((s) => ({
          ...s,
          active: (s.active + dir + s.list.length) % s.list.length,
        }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        acceptSuggestion(suggest.list[suggest.active]);
        return;
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    const thought = { id: makeId(), text, createdAt: Date.now() };
    setThoughts((prev) => [thought, ...prev]);
    setInput('');
    setSuggest(null);
  };

  // --- links ---------------------------------------------------------------

  const handleOpenLink = (seg) => {
    if (seg.id) {
      setSelectedId(seg.id);
      return;
    }
    if (seg.candidates && seg.candidates.length > 0) {
      setDisambig({ target: seg.target, candidates: seg.candidates });
      return;
    }
    setInput(seg.target);
    setView('feed');
    setTimeout(() => {
      if (composerRef.current) composerRef.current.focus();
    }, 0);
  };

  const handleCreateFromDisambig = (target) => {
    setDisambig(null);
    setInput(target);
    setView('feed');
    setTimeout(() => {
      if (composerRef.current) composerRef.current.focus();
    }, 0);
  };

  // --- edit / delete / clear ----------------------------------------------

  const handleDelete = (id) => {
    setThoughts((prev) => prev.filter((t) => t.id !== id));
    setSelectedId(null);
    setEditing(false);
  };

  const handleSaveEdit = () => {
    const text = editText.trim();
    if (!text || !selected) return;
    setThoughts((prev) =>
      prev.map((t) => (t.id === selected.id ? { ...t, text } : t))
    );
    setEditing(false);
  };

  const handleClearAll = () => {
    if (
      window.confirm(
        'Delete all thoughts? This clears your local save too. ' +
          'Export a backup first if you want to keep them.'
      )
    ) {
      setThoughts([]);
      setSelectedId(null);
      setEditing(false);
    }
  };

  const handleReseed = () => {
    const seeds = seedThoughts();
    const existing = new Set(thoughts.map((t) => t.text));
    const missing = seeds.filter((s) => !existing.has(s.text));
    if (missing.length === 0) {
      setNotice('The starter thoughts are already here.');
      return;
    }
    setThoughts((prev) => [...missing, ...prev]);
    setNotice(`Restored ${missing.length} starter thought${missing.length === 1 ? '' : 's'}.`);
  };

  // --- export / import ------------------------------------------------------

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(thoughts, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `serenity-thoughts-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`Exported ${thoughts.length} thought${thoughts.length === 1 ? '' : 's'} as JSON.`);
  };

  const handleImportFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        // Accept either a bare array or the {thoughts: [...]} export shape.
        const list = Array.isArray(parsed) ? parsed : parsed.thoughts;
        const imported = validateImportedThoughts(list);
        if (imported === null) {
          setNotice('That file does not look like a Serenity export.');
          return;
        }
        if (imported.length === 0) {
          setNotice('No usable thoughts found in that file.');
          return;
        }
        setThoughts((prev) => [...imported, ...prev]);
        setNotice(
          `Imported ${imported.length} thought${imported.length === 1 ? '' : 's'} from ${file.name}.`
        );
      } catch {
        setNotice('Could not read that file — is it valid JSON?');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-mark">
              <BrandMark />
              serenity
            </span>
            <span className="brand-tag">
              your thoughts, linked — a private constellation, kept on your device
            </span>
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
            onChange={handleInputChange}
            onKeyDown={handleComposerKeyDown}
            onKeyUp={(e) => updateSuggest(e.target.value, e.target.selectionStart)}
            onClick={(e) => updateSuggest(e.target.value, e.target.selectionStart)}
            placeholder="Drop a thought… type [[ to link another thought"
            rows={2}
            aria-label="Drop a thought"
          />
          {suggest && suggest.list.length > 0 && (
            <ul className="suggest-list" role="listbox" aria-label="Link suggestions">
              {suggest.list.map((t, i) => (
                <li key={t.id} role="option" aria-selected={i === suggest.active}>
                  <button
                    type="button"
                    className={i === suggest.active ? 'suggest-item active' : 'suggest-item'}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      acceptSuggestion(t);
                    }}
                  >
                    {titleOf(t)}
                  </button>
                </li>
              ))}
              <li className="suggest-note">
                Enter to link · Esc to dismiss
              </li>
            </ul>
          )}
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
                {!query.trim() && (
                  <>
                    {' '}
                    <button type="button" className="btn-ghost" onClick={handleReseed}>
                      Restore the starter thoughts
                    </button>
                  </>
                )}
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
                      <span className="bubble-inner">
                        {titleOf(t)}
                        {links > 0 && <span className="bubble-links">{links}↗</span>}
                      </span>
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
        <span>Thoughts are saved in your browser (localStorage). No account, no server.</span>
        <span className="footer-actions">
          <button type="button" className="btn-ghost" onClick={handleExport}>
            Export
          </button>
          <button type="button" className="btn-ghost" onClick={() => importRef.current && importRef.current.click()}>
            Import
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            className="import-input"
            aria-label="Import thoughts JSON"
            onChange={handleImportFile}
          />
          <button type="button" className="btn-ghost" onClick={handleReseed}>
            Restore starters
          </button>
          <button type="button" className="btn-ghost" onClick={handleClearAll}>
            Clear all
          </button>
        </span>
      </footer>
      {notice && <div className="notice" role="status">{notice}</div>}

      {disambig && (
        <div
          className="detail-overlay"
          onClick={() => setDisambig(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Which thought did you mean?"
        >
          <div className="detail-card" onClick={(e) => e.stopPropagation()}>
            <div className="detail-meta">“{disambig.target}” could be…</div>
            <p className="detail-text disambig-title">
              Links match a thought title exactly. Pick the one you meant:
            </p>
            <div className="detail-section">
              <ul>
                {disambig.candidates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="link-row"
                      onClick={() => {
                        setDisambig(null);
                        setSelectedId(t.id);
                      }}
                    >
                      {titleOf(t)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="detail-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => handleCreateFromDisambig(disambig.target)}
              >
                Create “{disambig.target}” instead
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setDisambig(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="detail-overlay"
          onClick={() => {
            setSelectedId(null);
            setEditing(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Thought detail"
        >
          <div className="detail-card" onClick={(e) => e.stopPropagation()}>
            <div className="detail-meta">{fullTime(selected.createdAt)}</div>
            {editing ? (
              <div className="edit-box">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={4}
                  aria-label="Edit thought"
                  autoFocus
                />
                <div className="detail-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSaveEdit}
                    disabled={!editText.trim()}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <p className="detail-text">
                <ThoughtText
                  thoughts={thoughts}
                  text={selected.text}
                  onOpenLink={handleOpenLink}
                />
              </p>
            )}

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
              {!editing && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setEditText(selected.text);
                    setEditing(true);
                  }}
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setSelectedId(null);
                  setEditing(false);
                }}
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
