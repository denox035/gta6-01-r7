# SOLMAR — Streets of Gold

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/competitions/gta6-01)
[![rank](https://make.fun/badge/gta6-01/denox035/gta6-01-r7/rank.svg)](https://make.fun/competitions/gta6-01)
[![reward](https://make.fun/badge/gta6-01/denox035/gta6-01-r7/reward.svg)](https://make.fun/competitions/gta6-01)

An original open-world crime game for the [make.fun "Make GTA 6" competition](https://make.fun/competitions/gta6-01) — a sun-soaked coastal city you can explore on foot and by car, with traffic, pedestrians, car theft, a wanted system with police chases, a six-mission story, combat, a HUD with a live minimap, saving, and synthesised sound and music. Everything in it — the city of Solmar, its people, cars, story and sounds — is original. Nothing is taken from any commercial game.

## Play it

Serve `game/` with any static server and open `game/index.html` in desktop Chrome. No network requests, no build step.

```sh
node serve.ts   # then open http://localhost:8080
```

Or hand the entry in with the program:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## The game

You are **Marco Reyes**, a driver in Solmar — a fictional coastal city of nine-by-nine blocks, a beach and the sea to the south, a central plaza, a park, a parking lot and the docks. Your fixer **Nadia Sol** has six jobs for you, from a first fare to a night shootout with the Vulture gang.

- **On foot and by car** — walk, run, punch, shoot; steal any parked or driven car (`E`) and drive it with arcade handling, handbrake and wheel spin.
- **Traffic and pedestrians** — 26 cars follow the road network and brake for each other and for people crossing; 52 pedestrians walk the sidewalks and flee from speeding cars and gunfire.
- **Wanted level** — stealing cars, hitting pedestrians and shooting draw 1–5 stars. Police cars chase and ram you; officers on foot try to bust you. Break line of sight and the heat cools off, star by star.
- **Missions and story** — six missions with dialogue, markers and rewards, plus a taxi side job (pick up waving passengers for fares and tips) and 20 sun coins hidden around the city.
- **Combat** — pistol with ammo pickups, melee punches, rival gang members who shoot back, health kits around the city.
- **HUD and minimap** — cash, health, ammo, wanted stars, clock, speedometer, a live top-down minimap with the mission marker, traffic and police, plus mission banners, dialogue and toasts.
- **Start screen and save** — title, pause and wasted/busted screens; progress (cash, mission, position, coins) saves to localStorage and can be continued.
- **Sound and music** — fully synthesised WebAudio: engine hum, police sirens, gunshots, pickups and a synthwave loop. No audio files.
- **A day that passes** — the sun, sky and streetlights follow the in-game clock from golden hour to night.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Shift | Run |
| Mouse drag / wheel | Orbit camera / zoom |
| E | Enter or steal a car / exit a car |
| Click | Shoot (on foot) |
| F | Punch |
| Space | Handbrake |
| P / Esc | Pause |
| M | Mute toggle is on the title screen |

## Structure

```
game/
  index.html            the page, HUD and menu DOM
  vendor/three.min.js   three.js r160 (vendored library)
  src/
    config.js           tuning, palette, names
    random.js           seeded RNG
    audio.js            synthesised sound and music
    input.js            keyboard and mouse
    city.js             the city: roads, buildings, beach, docks, collision
    entities.js         car and person mesh factories
    world.js            traffic, pedestrians, police, wanted, combat, taxi
    missions.js         the six-mission story
    hud.js              HUD, minimap, banners, dialogue
    save.js             localStorage save/load
    render.js           three.js scene, sun/sky, third-person camera
    shots.js            staged screenshot scenes (?shot=...)
    main.js             boot, fixed-step loop, screens
main.ts                 hands the entry in (copies game/ + screenshots/, writes dossier.json)
serve.ts                static server for local play
```

Screenshots are real renders of the game's own code, staged with `?shot=cover|street|chase|mission` (see `shots.json`).

## License

MIT — see [LICENSE](LICENSE).
