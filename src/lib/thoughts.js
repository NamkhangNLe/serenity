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

// Resolve a [[target]] to a thought by EXACT title match only
// (case-insensitive, trimmed). Prefix matching used to silently return
// the first-created match in array order, which made [[links]]
// ambiguous with no indication. Returns null when there is no exact
// match — call findThoughtCandidates for disambiguation options.
export function findThoughtByTitle(thoughts, target) {
  const t = norm(target);
  if (!t) return null;
  return thoughts.find((th) => norm(titleOf(th)) === t) || null;
}

// Every thought whose title could be what a [[target]] meant, best
// matches first: title-starts-with, then title-contains. Used by the
// disambiguation UI and composer autocomplete — never for silent
// resolution.
export function findThoughtCandidates(thoughts, target) {
  const t = norm(target);
  if (!t) return [];
  const starts = [];
  const contains = [];
  for (const th of thoughts) {
    const title = norm(titleOf(th));
    if (title === t) continue; // exact match is resolved, not a candidate
    if (title.startsWith(t)) starts.push(th);
    else if (title.includes(t)) contains.push(th);
  }
  return [...starts, ...contains];
}

// Same as parseLinks, but each link segment also gets the id of the
// thought it resolves to (null when dangling) and, when there is no
// exact match, the candidate thoughts for disambiguation.
export function resolveLinks(thoughts, text) {
  return parseLinks(text).map((seg) => {
    if (seg.type !== 'link') return seg;
    const match = findThoughtByTitle(thoughts, seg.target);
    return {
      ...seg,
      id: match ? match.id : null,
      candidates: match ? [] : findThoughtCandidates(thoughts, seg.target),
    };
  });
}

// Every thought that links TO the given thought id (exact resolution only).
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
// Each thought's first line is its exact linkable title, so every
// [[link]] below resolves exactly — no prefix guessing.
export function seedThoughts() {
  const now = Date.now();
  const raw = [
    'The best ideas arrive in the shower\nwhen there is nothing to write them down on [[shower thoughts]]',
    'shower thoughts\nwhy do we only get good ideas when our hands are busy?',
    'Build a capture flow so fast the thought never escapes\none tap, no decisions, no folders [[frictionless capture]]',
    'frictionless capture\nthe whole product: one tap, no decisions, no folders',
    'What if notes linked themselves?\nand the graph grew on its own [[graph]]',
    'graph\nthe view should feel like a constellation, not a spreadsheet [[serenity]]',
    'serenity\ndrop a thought, watch your constellation grow. private, local, yours.',
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

// Validate a parsed JSON import: returns the usable thoughts
// (fresh ids, original text + timestamp when sane), or null when the
// payload is not a thought list at all.
export function validateImportedThoughts(parsed) {
  if (!Array.isArray(parsed)) return null;
  const out = [];
  for (const item of parsed) {
    if (!item || typeof item.text !== 'string') continue;
    const text = item.text.trim();
    if (!text) continue;
    out.push({
      id: makeId(),
      text,
      createdAt:
        typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
          ? item.createdAt
          : Date.now(),
    });
  }
  return out;
}
