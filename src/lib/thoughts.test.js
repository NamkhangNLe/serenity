import {
  findThoughtByTitle,
  findThoughtCandidates,
  resolveLinks,
  seedThoughts,
  validateImportedThoughts,
} from './thoughts';

const thoughts = [
  { id: 'a', text: 'shower thoughts\nwhy do we only get good ideas?', createdAt: 1 },
  { id: 'b', text: 'shower thoughts at night\nthe best ideas after dark', createdAt: 2 },
  { id: 'c', text: 'frictionless capture\none tap, no folders', createdAt: 3 },
];

test('[[link]] resolution is exact-match-only', () => {
  // A prefix is not a match, even when only one thought has it.
  expect(findThoughtByTitle(thoughts, 'shower')).toBeNull();
  expect(findThoughtByTitle(thoughts, 'shower thoughts at')).toBeNull();
  // Exact title, case-insensitive, resolves.
  expect(findThoughtByTitle(thoughts, 'shower thoughts').id).toBe('a');
  expect(findThoughtByTitle(thoughts, 'SHOWER THOUGHTS').id).toBe('a');
  expect(findThoughtByTitle(thoughts, '  frictionless capture  ').id).toBe('c');
  expect(findThoughtByTitle(thoughts, 'no such thought')).toBeNull();
});

test('prefix matches become disambiguation candidates, never a silent pick', () => {
  const cands = findThoughtCandidates(thoughts, 'shower');
  expect(cands.map((t) => t.id)).toEqual(['a', 'b']);
  // Exact matches are resolved, not candidates.
  expect(findThoughtCandidates(thoughts, 'shower thoughts').map((t) => t.id)).toEqual(['b']);
  expect(findThoughtCandidates(thoughts, 'zzz')).toEqual([]);
});

test('resolveLinks marks ambiguous links with their candidates', () => {
  const segs = resolveLinks(thoughts, 'try [[shower]] and [[frictionless capture]]');
  const ambiguous = segs.find((s) => s.type === 'link' && s.target === 'shower');
  expect(ambiguous.id).toBeNull();
  expect(ambiguous.candidates.map((t) => t.id)).toEqual(['a', 'b']);
  const exact = segs.find((s) => s.type === 'link' && s.target === 'frictionless capture');
  expect(exact.id).toBe('c');
  expect(exact.candidates).toEqual([]);
});

test('every [[link]] in the seed data resolves exactly', () => {
  const seeds = seedThoughts();
  for (const t of seeds) {
    for (const seg of resolveLinks(seeds, t.text)) {
      if (seg.type === 'link') {
        expect(seg.id).not.toBeNull();
      }
    }
  }
});

test('validateImportedThoughts accepts arrays and rejects junk', () => {
  expect(validateImportedThoughts([{ text: 'hello' }]).length).toBe(1);
  expect(validateImportedThoughts([{ text: '  ' }, { nope: 1 }])).toEqual([]);
  expect(validateImportedThoughts({ thoughts: [] })).toBeNull();
  expect(validateImportedThoughts('nope')).toBeNull();
});
