# 🌸 Serenity — drop a thought

> *Twitter meets Obsidian: drop a random thought in under three seconds,
> watch it find its people in the graph.*

## What it is

Serenity is a fast capture box for random thoughts. Type a thought, drop it,
and it shows up in three places at once:

- **Feed** — a chronological, Twitter-style list of your thoughts with
  timestamps.
- **Bubbles** — the signature view: every thought is a circle, arranged in
  rings radiating from the center. Click a bubble to open it.
- **Graph** — an interactive node graph: thoughts are circles, `[[links]]`
  are lines between them. Drag to pan, zoom, click a node to open it.

## Linking (the Obsidian side)

Write `[[double brackets]]` inside any thought to link it to another thought.
A link matches a thought by its first line. Clicking a resolved link jumps to
that thought; clicking a dangling link (no matching thought yet) prefills the
composer so you can create it. Every thought shows its **backlinks**
("Linked from") — the thoughts that point at it.

## Persistence

Thoughts are saved to `localStorage`, so they survive a refresh. First load
seeds seven example thoughts (already linked to each other) so the feed and
graph are alive immediately. Use **Clear all** in the footer to wipe them.

## Run it

```bash
npm install
npm start        # dev server at http://localhost:3000
npm test         # test suite (composer, links, search)
npm run build    # production bundle in build/
```

Built with Create React App + React 19. No backend, no accounts, no tracking.
