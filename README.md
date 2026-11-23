# SOLMAR — Streets of Gold

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/denox035/gta6-01-r7/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/denox035/gta6-01-r7/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original 3D open-world crime game for the
[make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01): a sun-soaked
coastal city to explore on foot and by car, with traffic, pedestrians, cars to
steal, a wanted level and police who respond, six story missions, combat, a
HUD with a live minimap, and a save system — all playable offline in desktop
Chrome from static files, with fully synthesised WebAudio sound and music.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests. Every script, image, sound and font is a
file under `game/` or a `data:` URI. three.js r160 is vendored under
`game/vendor/three.min.js`.

## Controls

- **W A S D** — move / drive · **Shift** — run · **E** — steal / exit car
- **Mouse** — aim and orbit the camera · **Click** — shoot pistol
- **F** — punch · **M** — start next mission · **P / Esc** — pause
- **H** — horn · **N** — mute

## The city

9×9 blocks of procedural buildings with canvas window textures, roads with
dashed markings, sidewalks, palms, streetlights, a central plaza with a
fountain, a park with a pond, container docks, a parking lot, a beach and the
sea. 26 traffic cars follow the road graph (right-hand lanes, braking for cars
and crossing pedestrians); 52 pedestrians stroll the sidewalks and flee
speeding cars and gunfire.

## Systems

- **Wanted 0–5 stars** for theft, hit-and-run and assault; police cars chase
  and ram, officers on foot try to bust you; heat decays star-by-star out of
  sight; wasted/busted screens with fines and hospital/police-station respawns.
- **6 missions** for Marco Reyes and fixer Nadia Sol — a first fare, a car
  theft, a package run, losing the heat, a getaway drive, a night shootout —
  with dialogue, beacons, rewards and auto-save; plus a taxi side job (fares
  with speed tips) and 20 collectible sun coins.
- **Combat**: pistol (hitscan, tracers, muzzle flash, ammo pickups), punches,
  4 rival gang members who shoot back, health kits.
- **HUD**: cash, health, ammo, wanted stars, clock, speedometer, live minimap
  (roads, traffic, police, mission marker, coins), banners, dialogue, toasts,
  damage vignette.
- **Day cycle**: sun, sky, fog and streetlights follow the in-game clock from
  golden hour to night. **Save**: localStorage (cash, mission, position,
  coins, stats) with Continue.

## Hand in

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored make.fun library.

## License

MIT — see [LICENSE](LICENSE). All names, characters, vehicles, story, art,
sounds and music are original; nothing is taken from any commercial game.
