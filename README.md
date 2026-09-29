# Army Men: Kitchen Floor

A turn-based game with little plastic army men, played on a 1970s kitchen floor
with 8-inch linoleum tiles. Everything is built in code (Three.js): the
figures, the speckled linoleum, the avocado fridge, the cereal box and the
dice. There are no image or model files.

## Run it

```bash
npm install
npm run dev      # open the printed localhost URL
npm run build    # static build in dist/
```

## Playing

- **Tap a figure** to pick it up. Blue tiles show where it can move. Red rings
  show which enemies it can shoot, and the number you need to roll.
- On your turn every figure can **move, then shoot** once.
- The **dice** are thrown onto the floor. Any die at or above the number knocks
  the target over.
- Tall things (cereal box, soup can, mug, toy block) block shots. Anything next
  to a target on your side gives it **cover** (-1).
- **Lying flat** soldiers are harder to hit. Bazookas, mortars and flamethrowers
  ignore that.
- The **Officer** gives +1 to friends within 2 tiles.
- The **machine gun and mortar** can't move and fire in the same turn. The
  mortar lobs over anything, and its blast can knock over the neighbours.
- Knock over the whole enemy army to win.

| Figure | Move | Range | Dice | Hits on |
|---|---|---|---|---|
| Officer (pistol and field glasses) | 2 | 2 | 1 | 4+ |
| Rifleman (standing, aiming) | 2 | 4 | 1 | 4+ |
| Prone rifleman (lying flat) | 1 | 5 | 1 | 3+ |
| Charging rifleman (arms out) | 3 | 3 | 1 | 4+ |
| Bazooka | 2 | 3 | 1 | 3+ |
| Machine gun (on its tripod) | 1 | 5 | 3 | 5+ |
| Mortar | 1 | 2-7 | 1 | 4+ |
| Flamethrower | 2 | 2 | 2 | 3+ |

### Views and controls

- **Grown-up view (1):** standing over the game, looking down.
- **Kid's-eye view (2):** down on the floor, eyes about a foot above the
  linoleum, with a shallow depth of field. During combat the camera swings
  behind the shooter.
- Drag to look around. Right-drag, shift-drag or two fingers to slide. Wheel
  or pinch to zoom. WASD / arrow keys pan, Q/E rotate, Enter ends the turn.
- **HQ/LQ** toggles the graphics quality for slower Chromebooks.

## Layout

```
src/
  main.js            boot, input, render loop
  camera.js          grown-up / kid's-eye camera rig
  ui.js              menus, HUD, dice readout
  scene/world.js     renderer, lights, post-processing, floor and walls
  scene/textures.js  procedural linoleum, wood, wallpaper, dice faces, sprites
  scene/props.js     cabinets, fridge, stove, dinette, and floor terrain
  rooms/index.js     battlefields (kitchen now; bathroom, game room, porch next)
  units/figure.js    procedural army-man poses (IK-posed, merged meshes)
  units/types.js     unit stats and starting line-up
  units/unitView.js  figure placement, hopping, recoil and toppling
  game/rules.js      movement, line of sight, cover, to-hit
  game/game.js       turn flow and acting out combat
  game/ai.js         the computer opponent
  fx/effects.js      muzzle flashes, tracers, rockets, mortar, flame, explosions
  fx/dice.js         3D dice thrown onto the floor
  fx/audio.js        synthesized sound effects
```

### Adding a room

Add an entry to `ROOMS` in `src/rooms/index.js` with a floor palette, a board
position, terrain placements and a `furnish(group)` function that builds the
furniture. Set `available: true` to unlock it on the title screen.

## Hosting

`.github/workflows/pages.yml` builds and deploys to GitHub Pages on every push
to `main`. In the repo settings, set **Pages → Source** to **GitHub Actions**.
The site then lives at https://stilotto.github.io/army-men/.
