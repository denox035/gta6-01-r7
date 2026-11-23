// City construction: 9x9 blocks of procedural buildings with canvas window
// textures, roads with dashed markings, sidewalks, palms, streetlights, a
// central plaza with fountain, a park with pond, container docks, beach + sea.
// Also owns the road graph (right-hand lanes) and building AABBs for collision.
import { CITY, PALETTE } from './config.js';

const THREE = window.THREE;

function windowTexture(rng, base) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  const lit = ['#ffd97a', '#ffe9b0', '#9fd8ff', '#2b2f38', '#2b2f38', '#ffd97a'];
  for (let y = 12; y < 244; y += 22) {
    for (let x = 10; x < 118; x += 20) {
      g.fillStyle = lit[Math.floor(rng.next() * lit.length)];
      g.fillRect(x, y, 13, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function box(w, h, d, color, x, y, z, parent) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export function buildCity(rng) {
  const group = new THREE.Group();
  const colliders = [];   // {minX,maxX,minZ,maxZ}
  const roadLines = [];   // grid line coordinates, for the road graph
  const { blocks, blockSize, roadWidth, half } = CITY;
  const step = blockSize;

  // Ground slab.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 220, half * 2 + 220),
    new THREE.MeshLambertMaterial({ color: 0x8a8f7a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 10);
  group.add(ground);

  // Sea + beach on the -Z (north) edge.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 220, 120),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.02, CITY.seaZ - 50);
  group.add(sea);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 220, 36),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0, CITY.seaZ - 12);
  group.add(sand);

  // Roads: one grid strip per block boundary, plus dashed centre markings.
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
  for (let i = 0; i <= blocks; i += 1) {
    const c = -half + i * step;
    roadLines.push(c);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, half * 2 + 60), roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(c, 0.01, 10);
    group.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 60, roadWidth), roadMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.01, c + 20);
    group.add(h);
    // Dashes along both directions.
    for (let d = -half; d < half; d += 12) {
      const dv = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), dashMat);
      dv.rotation.x = -Math.PI / 2;
      dv.position.set(c, 0.02, d + 20);
      group.add(dv);
      const dh = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
      dh.rotation.x = -Math.PI / 2;
      dh.position.set(d, 0.02, c + 20);
      group.add(dh);
    }
  }

  // Sidewalk pads + buildings per block.
  const wallBases = ['#e8c39e', '#d9a06b', '#c9d6df', '#f2e6c9', '#b7c9a8', '#e6b8a2', '#a8c8d8', '#d8c8e8'];
  const roofColors = [0x7a6a58, 0x5d6d7e, 0x6e5849, 0x4a6b5d];
  const centre = (blocks - 1) / 2; // block index of the plaza
  for (let bx = 0; bx < blocks; bx += 1) {
    for (let bz = 0; bz < blocks; bz += 1) {
      const cx = -half + bx * step + step / 2;
      const cz = 20 + -half + bz * step + step / 2;
      const isCentre = bx === centre && bz === centre;
      const isPark = bx === 1 && bz === 1;
      const isDocks = bz === blocks - 1 && (bx === 7 || bx === 8);
      const isParking = bx === 7 && bz === 1;
      // Sidewalk pad.
      const pad = new THREE.Mesh(
        new THREE.PlaneGeometry(step - roadWidth, step - roadWidth),
        new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }),
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(cx, 0.03, cz);
      group.add(pad);

      if (isCentre) {
        // Central plaza: fountain + benches.
        const plaza = new THREE.Mesh(
          new THREE.CircleGeometry(11, 24),
          new THREE.MeshLambertMaterial({ color: PALETTE.plaza }),
        );
        plaza.rotation.x = -Math.PI / 2;
        plaza.position.set(cx, 0.05, cz);
        group.add(plaza);
        const basin = new THREE.Mesh(
          new THREE.CylinderGeometry(4.5, 5, 1, 20),
          new THREE.MeshLambertMaterial({ color: 0x9db8c4 }),
        );
        basin.position.set(cx, 0.5, cz);
        group.add(basin);
        const water = new THREE.Mesh(
          new THREE.CircleGeometry(4, 20),
          new THREE.MeshLambertMaterial({ color: 0x3fa7d6 }),
        );
        water.rotation.x = -Math.PI / 2;
        water.position.set(cx, 1.02, cz);
        group.add(water);
        const jet = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.5, 3, 8),
          new THREE.MeshLambertMaterial({ color: 0xdfe8ec }),
        );
        jet.position.set(cx, 2.2, cz);
        group.add(jet);
        continue;
      }
      if (isPark) {
        const lawn = new THREE.Mesh(
          new THREE.PlaneGeometry(step - roadWidth - 2, step - roadWidth - 2),
          new THREE.MeshLambertMaterial({ color: PALETTE.grass }),
        );
        lawn.rotation.x = -Math.PI / 2;
        lawn.position.set(cx, 0.05, cz);
        group.add(lawn);
        const pond = new THREE.Mesh(
          new THREE.CircleGeometry(5, 20),
          new THREE.MeshLambertMaterial({ color: 0x3fa7d6 }),
        );
        pond.rotation.x = -Math.PI / 2;
        pond.position.set(cx + 4, 0.07, cz - 3);
        group.add(pond);
        for (let t = 0; t < 5; t += 1) addPalm(group, cx - 8 + rng.range(0, 16), cz - 8 + rng.range(0, 16), rng);
        continue;
      }
      if (isDocks) {
        const cols = [0xd35400, 0x2980b9, 0x27ae60, 0xc0392b, 0x8e44ad];
        for (let i = 0; i < 6; i += 1) {
          const col = box(6, 2.6, 2.6, cols[i % cols.length],
            cx - 8 + (i % 3) * 8, 1.3, cz - 5 + Math.floor(i / 3) * 6, group);
          col.rotation.y = rng.chance(0.5) ? 0 : Math.PI / 2;
          colliders.push({ minX: col.position.x - 3, maxX: col.position.x + 3, minZ: col.position.z - 3, maxZ: col.position.z + 3 });
        }
        continue;
      }
      if (isParking) {
        const lot = new THREE.Mesh(
          new THREE.PlaneGeometry(step - roadWidth - 2, step - roadWidth - 2),
          new THREE.MeshLambertMaterial({ color: 0x55595e }),
        );
        lot.rotation.x = -Math.PI / 2;
        lot.position.set(cx, 0.05, cz);
        group.add(lot);
        continue;
      }

      // Normal block: 1-4 buildings.
      const n = rng.int(1, 3);
      for (let b = 0; b < n; b += 1) {
        const w = rng.range(7, 12);
        const d = rng.range(7, 12);
        const h = rng.range(8, 34);
        const ox = rng.range(-6, 6);
        const oz = rng.range(-6, 6);
        const x = cx + ox;
        const z = cz + oz;
        const tex = windowTexture(rng, wallBases[Math.floor(rng.next() * wallBases.length)]);
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        const bld = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        bld.position.set(x, h / 2, z);
        group.add(bld);
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.6, 0.6, d + 0.6),
          new THREE.MeshLambertMaterial({ color: roofColors[Math.floor(rng.next() * roofColors.length)] }),
        );
        roof.position.set(x, h + 0.3, z);
        group.add(roof);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
      // A palm or two on most blocks.
      if (rng.chance(0.6)) addPalm(group, cx + rng.range(-9, 9), cz + rng.range(-9, 9), rng);
    }
  }

  // Streetlights along every road, every other block corner.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  const lights = [];
  for (let i = 0; i <= blocks; i += 2) {
    for (let j = 0; j <= blocks; j += 2) {
      const x = -half + i * step + roadWidth / 2 + 1;
      const z = 20 + -half + j * step + roadWidth / 2 + 1;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), poleMat);
      pole.position.set(x, 3.5, z);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
      lamp.position.set(x, 7.1, z);
      group.add(lamp);
      lights.push(lamp);
    }
  }

  // Boardwalk palms along the beach.
  for (let x = -half; x <= half; x += 22) addPalm(group, x, CITY.seaZ + 8, rng);

  return { group, colliders, roadLines, lights };
}

function addPalm(group, x, z, rng) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.3, 5.5, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a6d3b }),
  );
  trunk.position.set(x, 2.75, z);
  trunk.rotation.z = rng.range(-0.08, 0.08);
  group.add(trunk);
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 2.4, 7),
    new THREE.MeshLambertMaterial({ color: 0x2e9e4f }),
  );
  crown.position.set(x, 6.2, z);
  group.add(crown);
}

// Circle vs AABB resolution: push the circle out of any building it overlaps.
export function resolveCollisions(x, z, radius, colliders) {
  let px = x, pz = z;
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(px, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pz, c.maxZ));
    const dx = px - nx, dz = pz - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        px = nx + (dx / d) * radius;
        pz = nz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pushL = px - c.minX + radius;
        const pushR = c.maxX - px + radius;
        const pushU = pz - c.minZ + radius;
        const pushD = c.maxZ - pz + radius;
        const m = Math.min(pushL, pushR, pushU, pushD);
        if (m === pushL) px = c.minX - radius;
        else if (m === pushR) px = c.maxX + radius;
        else if (m === pushU) pz = c.minZ - radius;
        else pz = c.maxZ + radius;
      }
    }
  }
  return { x: px, z: pz };
}

export function clampToCity(x, z) {
  const h = CITY.half + 20;
  return {
    x: Math.max(-h, Math.min(h, x)),
    z: Math.max(CITY.seaZ + 4, Math.min(h + 20, z)),
  };
}
