// Helpers for the Serenity thoughts graph: [[wikilinks]], backlinks,
// seed data, and localStorage persistence.

export const STORAGE_KEY = 'serenity.thoughts.v1';

export function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// A thought's linkable name is its first line, trimmed, max 60 chars.
export function titleOf(thought) {
  const first = (thought.text || '').split('\n')[0].trim();
  return first.length > 60 ? first.slice(0, 60) + '…' : first;
}

export function truncate(s, n) {
  const str = (s || '').trim();
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

const LINK_RE = /\[\[([^\][]+)\]\]/g;

// Split text into plain segments and [[link]] segments.
export function parseLinks(text) {
  const segments = [];
  let last = 0;
  let m;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ type: 'text', value: text.slice(last, m.index) });
    }
    segments.push({ type: 'link', target: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push({ type: 'text', value: text.slice(last) });
  }
  return segments;
}

function norm(s) {
  return (s || '').trim().toLowerCase();
}

// Resolve a [[target]] to a thought: exact title match first, then
// title-starts-with, then text-starts-with. Returns null when dangling.
export function findThoughtByTitle(thoughts, target) {
  const t = norm(target);
  if (!t) return null;
  let hit = thoughts.find((th) => norm(titleOf(th)) === t);
  if (hit) return hit;
  hit = thoughts.find((th) => norm(titleOf(th)).startsWith(t));
  if (hit) return hit;
  hit = thoughts.find((th) => norm(th.text).startsWith(t));
  return hit || null;
}

// Same as parseLinks, but each link segment also gets the id of the
// thought it resolves to (null when dangling).
export function resolveLinks(thoughts, text) {
  return parseLinks(text).map((seg) => {
    if (seg.type !== 'link') return seg;
    const match = findThoughtByTitle(thoughts, seg.target);
    return { ...seg, id: match ? match.id : null };
  });
}

// Every thought that links TO the given thought id.
export function backlinks(thoughts, thoughtId) {
  return thoughts.filter((th) => {
    if (th.id === thoughtId) return false;
    return resolveLinks(thoughts, th.text).some(
      (s) => s.type === 'link' && s.id === thoughtId
    );
  });
}

// The distinct thoughts this thought links out to.
export function outgoingLinks(thoughts, thought) {
  const ids = [];
  const seen = new Set();
  for (const seg of resolveLinks(thoughts, thought.text)) {
    if (seg.type === 'link' && seg.id && !seen.has(seg.id)) {
      seen.add(seg.id);
      ids.push(seg.id);
    }
  }
  return ids.map((id) => thoughts.find((t) => t.id === id)).filter(Boolean);
}

// Example thoughts so the feed and graph are alive on first load.
// They link to each other, so the graph has edges from the start.
export function seedThoughts() {
  const now = Date.now();
  const raw = [
    'The best ideas arrive in the shower, when there is nothing to write them down on [[shower thoughts]]',
    'shower thoughts: why do we only get good ideas when our hands are busy?',
    'Build a capture flow so fast the thought never gets a chance to escape [[frictionless capture]]',
    'frictionless capture is the whole product — one tap, no decisions, no folders',
    'What if notes linked themselves, and the graph grew on its own? [[graph]]',
    'graph view should feel like a constellation, not a spreadsheet [[serenity]]',
    'serenity: drop a thought, watch it find its people',
  ];
  return raw.map((text, i) => ({
    id: `seed-${i + 1}`,
    text,
    createdAt: now - (raw.length - i) * 1000 * 60 * 37,
  }));
}

// Returns null when nothing was ever saved (caller should seed).
// An empty array is a real saved state and is returned as-is.
export function loadThoughts() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((t) => t && typeof t.text === 'string');
  } catch {
    return null;
  }
}

export function saveThoughts(thoughts) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(thoughts));
  } catch {
    // Storage full or unavailable (private mode): the app still works
    // in-memory for this session.
  }
}
