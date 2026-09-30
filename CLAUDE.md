# Army Men: notes for Claude

See README.md for the game, controls and file layout.

## Deploying (read before pushing to main)

The live site is https://stilotto.github.io/army-men/, deployed by
`.github/workflows/pages.yml` (Vite build of `dist/`) on every push to `main`.

**Known trap: stuck on the loading screen.** If the repo's Settings → Pages →
Source is "Deploy from a branch", GitHub *also* runs its own
"pages build and deployment" on every push, publishing the raw repo root.
Whichever of the two finishes last wins. The raw root used to hang on the
loading screen because `src/main.js` imports `three` by bare name.

Guards in place:
- `index.html` has an import map that loads three.js from jsDelivr, so the raw
  root works too. **When bumping `three` in package.json, update the version in
  that import map.** Any new bare-module dependency needs an import map entry.
- Settings → Pages → Source is set to **GitHub Actions** (since 2026-09-30),
  which stops the second deploy. If "pages build and deployment" runs ever
  reappear, the setting has been changed back; remind the user (only the
  repo owner can change it).

After pushing to `main`, check the Actions runs. If a "pages build and
deployment" run finished after "Deploy to GitHub Pages", re-run the
"Deploy to GitHub Pages" workflow so the built site is what's live.

## Checking changes

- `npm run build` must pass.
- Headless check: `npx vite preview`, then open `/?autostart&room=<id>&step=0.05`
  in Playwright (Chromium at `/opt/pw-browsers/chromium`, SwiftShader flags);
  `window.done` is set once the first frames have rendered. `&view=tour` starts
  the fly-through.
- Rooms live in `src/rooms/index.js`. Stilotto's Kitchen uses a `board.play`
  tile map; when changing its dimensions, also move its `tour` camera stops
  and `deploy` tiles to match.
