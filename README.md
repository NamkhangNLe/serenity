# ✦ Serenity — your thoughts, linked

> *A private constellation of your thoughts: drop a random thought in under
> three seconds, link it with `[[double brackets]]`, and watch the graph grow.*

## What it is

Serenity is a fast capture box for random thoughts. It is local-first and
single-player: everything lives in your browser's localStorage, there are no
accounts, no server, and no other people. Type a thought, drop it, and it
shows up in three places at once:

- **Feed** — a chronological, Twitter-style list of your thoughts with
  timestamps.
- **Bubbles** — the signature view: every thought is a circle, arranged in
  rings radiating from the center. Click a bubble to open it.
- **Graph** — an interactive node graph on a dark constellation canvas:
  thoughts are glowing nodes, `[[links]]` are edges, and a force-directed
  layout pulls linked thoughts together. Scroll or pinch to zoom around the
  cursor, drag to pan, drag a node to move it, click a node to open it.

## Linking (the Obsidian side)

Write `[[double brackets]]` inside any thought to link it to another thought.
A link matches a thought by its exact first line (case-insensitive) — a
thought's first line is its linkable title. The composer offers `[[`
autocomplete so you can see what a link will resolve to before you drop it.
Clicking a resolved link jumps to that thought; clicking a dangling link (no
matching thought yet) prefills the composer so you can create it. If several
thoughts could match a link, you get a chooser instead of a silent guess.
Every thought shows its **backlinks** ("Linked from") — the thoughts that
point at it.

## Editing, backup, restore

Open any thought to edit or delete it. The footer offers **Export** (download
your thoughts as JSON), **Import** (load a Serenity JSON export), and
**Restore starters** (bring back the seven seed thoughts if they were cleared
or deleted). **Clear all** wipes everything, so export a backup first.

## Persistence

Thoughts are saved to `localStorage`, so they survive a refresh. First load
seeds seven example thoughts (already linked to each other) so the feed and
graph are alive immediately.

## Deploy

Pushes to the `build/thoughts-graph` branch deploy automatically to GitHub
Pages via `.github/workflows/deploy-pages.yml` (build from source, publish
the full `build/` output including favicon and manifest, then smoke-check
the live URL). Live at https://namkhangnle.github.io/serenity/.

## Run it

```bash
npm install
npm start        # dev server at http://localhost:3000
npm test         # test suite (composer, links, search, bubbles, layout)
npm run build    # production bundle in build/
```

Built with Create React App + React 19. No backend, no accounts, no tracking.
