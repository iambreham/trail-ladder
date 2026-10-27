import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { clone as cloneSkinned, retargetClip } from "three/addons/utils/SkeletonUtils.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

const MILES = [0, 2.2, 7.6, 21.8, 47.8];
const LOOK = {
  riverside: {
    fog: 0xC4A07A, near: 24, far: 240, hemi: 0xF3D2B4, ground: 0x7A4A32,
    sun: 0xFFE0C2, sunInt: 2.35, exp: 0.92, path: "asphalt", groundMap: "sandstone",
    pathW: 1.7, water: true
  },
  angels: {
    fog: 0xC48B62, near: 16, far: 280, hemi: 0xF0C4A0, ground: 0x6E3A28,
    sun: 0xFFD2A8, sunInt: 2.55, exp: 0.96, path: "sandstone", groundMap: "sandstone",
    pathW: 0.85, tint: 0xE7C2A4, chains: true, rocks: 1
  },
  halfdome: {
    fog: 0xC9D4DC, near: 20, far: 340, hemi: 0xD7E4EC, ground: 0x5E6868,
    sun: 0xFFF6E8, sunInt: 2.45, exp: 0.98, path: "granite", groundMap: "granite",
    pathW: 1.15, steps: 0.28, pines: true, falls: true, cables: true
  },
  inca: {
    fog: 0xC5D0C2, near: 10, far: 150, hemi: 0xD6E6D4, ground: 0x3E5A34,
    sun: 0xFFF4E2, sunInt: 1.55, exp: 0.84, path: "stone", groundMap: "forest",
    pathW: 0.95, steps: 0.18, pines: true, ruins: true, gate: true, clouds: true
  }
};

const TEX = {
  sandstone: ["assets/tex/sandstone_diff.webp", "assets/tex/sandstone_nor.webp"],
  asphalt: ["assets/tex/asphalt_diff.webp", "assets/tex/asphalt_nor.webp"],
  granite: ["assets/tex/granite_diff.webp", "assets/tex/granite_nor.webp"],
  forest: ["assets/tex/forest_diff.webp", "assets/tex/forest_nor.webp"],
  stone: ["assets/tex/stone_diff.webp", "assets/tex/stone_nor.webp"],
  bark: ["assets/tex/bark_diff.webp", "assets/tex/bark_nor.webp"]
};

export function startRace3D(ctx) {
  return boot(ctx).catch(err => {
    console.warn("Race 3D unavailable, using the flat course.", err);
    if (ctx.onFail) ctx.onFail(err);
  });
}

async function boot(ctx) {
  const canvas = ctx.canvas;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: "high-performance"
    });
  } catch (err) {
    throw err;
  }
  if (!renderer.getContext()) throw new Error("no webgl");
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xC4A07A, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xC4A07A, 24, 240);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.18, 700);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 2.2;
  controls.maxDistance = 18;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY;
  let customOrbit = false;
  let portraitOn = false;
  controls.addEventListener("start", () => { customOrbit = true; portraitOn = false; });

  const hemi = new THREE.HemisphereLight(0xF3D2B4, 0x7A4A32, 0.42);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xFFE0C2, 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const bump = makeProgress(ctx);
  bump(0.04);
  const courses = await fetch("assets/terrain/courses.json").then(r => {
    if (!r.ok) throw new Error("courses");
    return r.json();
  });
  bump(0.1);
  const zones = [];
  for (const meta of courses.zones) {
    const buf = await fetch("assets/terrain/" + meta.file).then(r => {
      if (!r.ok) throw new Error(meta.file);
      return r.arrayBuffer();
    });
    zones.push(parseZone(meta, buf));
    bump(0.1 + 0.16 * (zones.length / courses.zones.length));
  }
  layoutZones(zones);

  const texLoader = new THREE.TextureLoader();
  const textures = {};
  async function loadPair(name) {
    if (textures[name]) return textures[name];
    const [diff, nor] = TEX[name];
    const map = await loadTex(texLoader, diff, true);
    const normalMap = await loadTex(texLoader, nor, false);
    textures[name] = { map, normalMap };
    return textures[name];
  }

  const youT = (ctx.getShown && ctx.getShown().you) || 0;
  const firstId = zoneAt(zones, youT).id;
  const need = new Set([LOOK[firstId].groundMap, LOOK[firstId].path, "bark"]);
  let loadedTex = 0;
  for (const name of need) {
    await loadPair(name);
    loadedTex++;
    bump(0.28 + 0.12 * (loadedTex / need.size));
  }

  const gltfLoader = new GLTFLoader();
  const michelle = await loadGLTF(gltfLoader, "assets/michelle.glb");
  bump(0.5);
  const soldier = await loadGLTF(gltfLoader, "assets/soldier.glb");
  bump(0.62);
  const hdr = await new Promise((res, rej) => {
    new RGBELoader().load("assets/tex/sky.hdr", res, undefined, rej);
  });
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromEquirectangular(hdr).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.background = hdr;
  scene.environmentIntensity = 0.82;
  bump(0.74);

  const clips = retargetOnto(michelle, soldier);
  const body = findSkinned(michelle.scene);
  const shirtYou = recolorMap(body.material.map, 0xE8772E);
  const shirtPace = recolorMap(body.material.map, 0x3B5B85);

  const runners = {};
  for (const key of ["you", "pace", "last"]) {
    runners[key] = makeRunner(key, michelle.scene, clips, key === "you" ? shirtYou : key === "pace" ? shirtPace : null);
    scene.add(runners[key].pivot);
  }

  for (const name of Object.keys(TEX)) {
    if (!textures[name]) await loadPair(name);
  }
  bump(0.8);

  const mats = {};
  function groundMat(name, tint) {
    const key = name + (tint || "");
    if (mats[key]) return mats[key];
    const pair = textures[name];
    const mat = new THREE.MeshStandardMaterial({
      map: pair.map, roughness: 0.9, metalness: 0, color: tint || 0xffffff
    });
    triplanar(mat, name === "forest" ? 0.07 : 0.11);
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = 1;
    mat.polygonOffsetUnits = 1;
    mats[key] = mat;
    return mat;
  }
  function pathMat(name, tint) {
    const key = "path-" + name + (tint || "");
    if (mats[key]) return mats[key];
    const pair = textures[name];
    const mat = new THREE.MeshStandardMaterial({
      map: pair.map, normalMap: pair.normalMap, roughness: name === "asphalt" ? 0.72 : 0.86,
      metalness: 0, color: tint || 0xffffff, side: THREE.DoubleSide
    });
    mats[key] = mat;
    return mat;
  }

  const bark = textures.bark;
  const trunkMat = new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, roughness: 0.86, metalness: 0 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4E6B32, roughness: 0.82, metalness: 0 });
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x2E4A28, roughness: 0.8, metalness: 0 });
  const rockGeo = new THREE.DodecahedronGeometry(0.55, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 2.8, 6);
  trunkGeo.translate(0, 1.4, 0);
  const canopyGeo = new THREE.IcosahedronGeometry(1.35, 1);
  canopyGeo.translate(0, 3.3, 0);
  const pineGeo = new THREE.ConeGeometry(1.45, 4.4, 7);
  pineGeo.translate(0, 4.1, 0);

  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x6E9088, roughness: 0.06, metalness: 0.02, transparent: true,
    opacity: 0.86, depthWrite: false, side: THREE.DoubleSide
  });
  const clock = new THREE.Clock();
  const falls = [];
  for (const zone of zones) {
    const look = LOOK[zone.id];
    const group = new THREE.Group();
    group.position.set(zone.ox, 0, zone.oz);
    group.name = zone.id;
    scene.add(group);
    zone.group = group;
    const coarse = terrainMesh(zone, groundMat(look.groundMap, look.tint));
    coarse.receiveShadow = true;
    group.add(coarse);
    const patch = new THREE.Mesh(new THREE.BufferGeometry(), groundMat(look.groundMap, look.tint).clone());
    patch.material.polygonOffset = false;
    patch.receiveShadow = true;
    patch.frustumCulled = false;
    group.add(patch);
    zone.patch = patch;
    const pmat = pathMat(look.path, look.tint);
    group.add(buildStrip(zone, look.pathW, 0.1, pmat, look.steps || 0));
    if (look.water) group.add(buildWater(zone, waterMat));
    if (look.chains) addChains(group, zone, textures.sandstone);
    if (look.pines) addPines(group, zone, trunkGeo, trunkMat, pineGeo, pineMat, look === LOOK.halfdome);
    if (zone.id === "riverside") addCottonwoods(group, zone, trunkGeo, trunkMat, canopyGeo, leafMat);
    addRocks(group, zone, rockGeo, groundMat(look.groundMap, look.tint));
    if (look.falls) falls.push(...addFalls(group, zone));
    if (look.cables) addCables(group, zone);
    if (look.ruins) addRuins(group, zone, pathMat("stone"));
    if (look.gate) addGate(group, zone, pathMat("stone"));
    if (look.clouds) addClouds(group, zone);
  }

  // Remaining zone textures stream in after the first zone can draw.
  let ready = false;
  let loopOn = false;
  let raf = 0;
  let youZone = zoneAt(zones, youT).id;
  const fade = { u: 1, from: null, to: null };
  applyLook(LOOK[youZone], 1);

  function applyLook(look, u) {
    const fogC = new THREE.Color(look.fog);
    const hemiC = new THREE.Color(look.hemi);
    const gC = new THREE.Color(look.ground);
    const sunC = new THREE.Color(look.sun);
    if (fade.from && u < 1) {
      fogC.copy(fade.from.fog).lerp(new THREE.Color(look.fog), u);
      hemiC.copy(fade.from.hemi).lerp(new THREE.Color(look.hemi), u);
      gC.copy(fade.from.ground).lerp(new THREE.Color(look.ground), u);
      sunC.copy(fade.from.sun).lerp(new THREE.Color(look.sun), u);
      scene.fog.near = fade.from.near + (look.near - fade.from.near) * u;
      scene.fog.far = fade.from.far + (look.far - fade.from.far) * u;
      sun.intensity = fade.from.sunInt + (look.sunInt - fade.from.sunInt) * u;
      renderer.toneMappingExposure = fade.from.exp + (look.exp - fade.from.exp) * u;
    } else {
      scene.fog.near = look.near;
      scene.fog.far = look.far;
      sun.intensity = look.sunInt;
      renderer.toneMappingExposure = look.exp;
    }
    scene.fog.color.copy(fogC);
    hemi.color.copy(hemiC);
    hemi.groundColor.copy(gC);
    sun.color.copy(sunC);
    renderer.setClearColor(fogC, 1);
  }

  function resize() {
    const st = ctx.stage;
    const w = st.clientWidth, h = st.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  function renderOnce() { renderer.render(scene, camera); }
  function resume() {
    if (!ready || loopOn) return;
    if (document.hidden || !document.body.classList.contains("mode-race")) return;
    loopOn = true;
    clock.getDelta();
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    loopOn = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function place(key) {
    const r = runners[key];
    if (!r) return;
    const t = ctx.getShown()[key];
    const a = frameAt(zones, t);
    const b = frameAt(zones, Math.min(1, t + 0.0015));
    const tangent = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
    if (tangent.lengthSq() < 1e-6) tangent.set(a.tx, 0, a.tz);
    if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0);
    tangent.normalize();
    r.facing = tangent;
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const lateral = key === "you" ? -0.42 : key === "last" ? 0.42 : 0;
    const y = heightAt(a.zone, a.lx, a.lz) + 0.12;
    r.pivot.position.set(a.x + side.x * lateral, y, a.z + side.z * lateral);
    r.pivot.lookAt(r.pivot.position.x + tangent.x, y, r.pivot.position.z + tangent.z);
    r.frame = a;
    if (key === "you" && a.zone.id !== youZone) {
      fade.from = {
        fog: scene.fog.color.clone(), hemi: hemi.color.clone(), ground: hemi.groundColor.clone(),
        sun: sun.color.clone(), near: scene.fog.near, far: scene.fog.far,
        sunInt: sun.intensity, exp: renderer.toneMappingExposure
      };
      fade.u = 0;
      fade.to = a.zone.id;
      youZone = a.zone.id;
      if (ctx.fade) {
        ctx.fade.style.background = "#" + new THREE.Color(LOOK[youZone].fog).getHexString();
        ctx.fade.classList.remove("on");
        void ctx.fade.offsetWidth;
        ctx.fade.classList.add("on");
      }
    }
  }
  function frameCam() {
    const you = runners.you;
    if (!you) return;
    const p = you.pivot.position;
    const facing = (you.facing || new THREE.Vector3(1, 0, 0)).clone();
    facing.y = 0;
    if (facing.lengthSq() < 1e-6) facing.set(1, 0, 0);
    facing.normalize();
    const side = new THREE.Vector3(-facing.z, 0, facing.x);
    let target, pos;
    if (portraitOn) {
      target = new THREE.Vector3(p.x, p.y + 1.28, p.z);
      pos = target.clone().addScaledVector(facing, 1.7).addScaledVector(side, 0.55);
      pos.y = p.y + 1.42;
      camera.position.copy(pos);
      camera.lookAt(target);
      controls.target.copy(target);
      return;
    }
    target = new THREE.Vector3(p.x, p.y + 1.2, p.z);
    if (!customOrbit) {
      const zone = you.frame.zone;
      const t = ctx.getShown().you;
      const backFrac = (6.2 / zone.pathLen) * (zone.t1 - zone.t0);
      const backT = Math.max(zone.t0, t - backFrac);
      if (t - backT > 1e-6) {
        const back = frameAt(zones, backT);
        const camY = heightAt(back.zone, back.lx, back.lz) + 2.55;
        pos = new THREE.Vector3(back.x + side.x * 1.05, camY, back.z + side.z * 1.05);
      } else {
        pos = new THREE.Vector3(p.x - facing.x * 6.2 + side.x * 1.05, p.y + 2.55, p.z - facing.z * 6.2 + side.z * 1.05);
      }
      camera.position.copy(pos);
      camera.lookAt(target);
      controls.target.copy(target);
    } else {
      const off = camera.position.clone().sub(controls.target);
      controls.target.copy(target);
      camera.position.copy(target).add(off);
      controls.update();
    }
  }
  function tick() {
    if (!loopOn) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, clock.getDelta());
    if (fade.to && fade.u < 1) {
      fade.u = Math.min(1, fade.u + dt / 0.6);
      applyLook(LOOK[fade.to], fade.u);
      if (fade.u >= 1) fade.to = null;
    }
    let animChanged = false;
    const jobs = ctx.getJobs ? ctx.getJobs() : {};
    for (const key of ["you", "pace", "last"]) {
      const r = runners[key];
      const moving = wantsRun(ctx, key);
      if (moving !== r.moving) {
        r.moving = moving;
        animChanged = true;
        const next = moving ? r.run : r.idle;
        const prev = moving ? r.idle : r.run;
        next.reset().fadeIn(0.18).play();
        prev.fadeOut(0.18);
      }
      if (moving) {
        const speed = r.prev.distanceTo(r.pivot.position) / Math.max(dt, 1e-4);
        r.run.timeScale = jobs[key] ? THREE.MathUtils.clamp(speed / 3.3, 0.55, 1.75) : 1;
      }
      r.prev.copy(r.pivot.position);
      r.mixer.update(dt);
    }
    const you = runners.you;
    if (you && you.frame) {
      const z = you.frame.zone;
      if (!z.patchCenter || you.pivot.position.distanceTo(z.patchCenter) > 8) {
        rebuildPatch(z, you.pivot.position.x, you.pivot.position.z);
        z.patchCenter = you.pivot.position.clone();
      }
    }
    for (const f of falls) {
      f.time += dt;
      const arr = f.geo.attributes.position;
      for (let i = 0; i < f.count; i++) {
        let y = arr.getY(i) + dt * f.speed[i];
        if (y > f.top) y = f.base;
        arr.setY(i, y);
      }
      arr.needsUpdate = true;
    }
    sun.target.position.copy(you.pivot.position);
    sun.position.set(you.pivot.position.x + 16, you.pivot.position.y + 26, you.pivot.position.z + 8);
    const sc = sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14;
    sc.updateProjectionMatrix();
    frameCam();
    renderer.render(scene, camera);
    if (animChanged && ctx.publish) ctx.publish();
  }
  function anims() {
    const o = {};
    for (const key of ["you", "pace", "last"]) o[key] = runners[key] && runners[key].moving ? "run" : "idle";
    return o;
  }
  function stride() {
    const model = runners.pace && runners.pace.model;
    const bone = model && (model.getObjectByName("mixamorigLeftLeg") || model.getObjectByName("mixamorigLeftUpLeg"));
    return bone ? bone.quaternion.x : 0;
  }
  function world() {
    const o = {};
    const shown = ctx.getShown();
    for (const key of ["you", "pace", "last"]) {
      const t = shown[key];
      const path = frameAt(zones, t);
      const w = runners[key] ? runners[key].pivot.position : { x: 0, y: 0, z: 0 };
      o[key] = { t, x: w.x, y: w.y, z: w.z, pathX: path.x, pathZ: path.z, zone: path.zone.id };
    }
    return o;
  }

  ctx.recenterBtn.addEventListener("click", () => { if (api) api.recenter(); });
  window.addEventListener("resize", () => { if (ready) resize(); });

  const api = {
    ready: true,
    place, resume, pause,
    recenter() { customOrbit = false; portraitOn = false; frameCam(); },
    portrait(on) { portraitOn = on !== false; customOrbit = false; frameCam(); },
    anims, stride, world,
    tris: () => renderer.info.render.triangles,
    renderOnce, resize
  };

  ready = true;
  for (const key of ["you", "pace", "last"]) place(key);
  const yz = runners.you.frame.zone;
  rebuildPatch(yz, runners.you.pivot.position.x, runners.you.pivot.position.z);
  yz.patchCenter = runners.you.pivot.position.clone();
  resize();
  api.recenter();
  bump(1);
  if (ctx.onReady) ctx.onReady(api);
}

function makeProgress(ctx) {
  return function bump(v) {
    if (ctx.loadFill) ctx.loadFill.style.width = Math.round(Math.max(0, Math.min(1, v)) * 100) + "%";
  };
}

function wantsRun(ctx, key) {
  if (ctx.reduced && ctx.reduced()) return false;
  const jobs = ctx.getJobs ? ctx.getJobs() : {};
  if (jobs[key]) return true;
  const race = ctx.getRace ? ctx.getRace() : null;
  if (!race || race.phase !== "live") return false;
  if (key === "you") return false;
  const steps = key === "pace" ? race.pace : race.last;
  return steps > 1 && steps < ctx.GOAL - 1;
}

function loadTex(loader, url, srgb) {
  return new Promise((res, rej) => {
    loader.load(url, tex => {
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 4;
      res(tex);
    }, undefined, rej);
  });
}

function loadGLTF(loader, url) {
  return new Promise((res, rej) => loader.load(url, res, undefined, rej));
}

function parseZone(meta, buf) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== "HT01") throw new Error("heightmap " + meta.id);
  const w = dv.getUint32(4, true);
  const h = dv.getUint32(8, true);
  const pathN = dv.getUint32(12, true);
  let o = 20;
  const minX = dv.getFloat32(o, true); o += 4;
  const maxX = dv.getFloat32(o, true); o += 4;
  const minZ = dv.getFloat32(o, true); o += 4;
  const maxZ = dv.getFloat32(o, true); o += 4;
  const emin = dv.getFloat32(o, true); o += 4;
  const span = dv.getFloat32(o, true); o += 4;
  const grid = new Uint16Array(w * h);
  for (let i = 0; i < grid.length; i++) { grid[i] = dv.getUint16(o, true); o += 2; }
  const path = [];
  for (let i = 0; i < pathN; i++) {
    const x = dv.getFloat32(o, true); o += 4;
    const z = dv.getFloat32(o, true); o += 4;
    path.push({ x, z, e: 0 });
  }
  for (let i = 0; i < pathN; i++) path[i].e = dv.getUint16(o, true), o += 2;
  let maxE = -1, maxI = 0;
  for (let i = 0; i < path.length; i++) if (path[i].e >= maxE) { maxE = path[i].e; maxI = i; }
  const a = path[0], b = path[path.length - 1];
  const loop = Math.hypot(a.x - b.x, a.z - b.z) < 180;
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  const base = emin + (path[0].e / 65535) * span;
  return {
    id: meta.id, t0: meta.t0, t1: meta.t1, w, h, minX, maxX, minZ, maxZ,
    emin, span, base, grid, path, cum, pathLen: cum[cum.length - 1] || 1,
    outbound: loop ? maxI : path.length - 1, river: meta.river || 1, loop
  };
}

function layoutZones(zones) {
  let cursor = 0;
  for (const z of zones) {
    z.ox = cursor - z.minX;
    z.oz = -z.minZ;
    cursor = z.ox + z.maxX + 1400;
  }
}

function zoneAt(zones, t) {
  const x = Math.max(0, Math.min(1, t || 0));
  for (const z of zones) if (x <= z.t1 + 1e-7) return z;
  return zones[zones.length - 1];
}

function sampleLocal(zone, t) {
  const span = Math.max(1e-6, zone.t1 - zone.t0);
  const u = THREE.MathUtils.clamp((t - zone.t0) / span, 0, 1);
  const d = u * zone.pathLen;
  const cum = zone.cum;
  let lo = 1, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const seg = cum[i] - cum[i - 1] || 1;
  const k = THREE.MathUtils.clamp((d - cum[i - 1]) / seg, 0, 1);
  const p0 = zone.path[i - 1], p1 = zone.path[i];
  const x = p0.x + (p1.x - p0.x) * k;
  const z = p0.z + (p1.z - p0.z) * k;
  let tx = p1.x - p0.x, tz = p1.z - p0.z;
  const len = Math.hypot(tx, tz) || 1;
  tx /= len; tz /= len;
  return { x, z, tx, tz, i };
}

function frameAt(zones, t) {
  const zone = zoneAt(zones, t);
  const s = sampleLocal(zone, t);
  return {
    zone, lx: s.x, lz: s.z, tx: s.tx, tz: s.tz,
    x: s.x + zone.ox, z: s.z + zone.oz, i: s.i
  };
}

function heightAt(zone, x, z) {
  const u = (x - zone.minX) / (zone.maxX - zone.minX);
  const v = (z - zone.minZ) / (zone.maxZ - zone.minZ);
  const fx = THREE.MathUtils.clamp(u, 0, 1) * (zone.w - 1);
  const fz = THREE.MathUtils.clamp(v, 0, 1) * (zone.h - 1);
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const x1 = Math.min(zone.w - 1, x0 + 1), z1 = Math.min(zone.h - 1, z0 + 1);
  const tx = fx - x0, tz = fz - z0;
  const g = zone.grid;
  const w = zone.w;
  const e00 = g[z0 * w + x0], e10 = g[z0 * w + x1], e01 = g[z1 * w + x0], e11 = g[z1 * w + x1];
  const e = (e00 * (1 - tx) + e10 * tx) * (1 - tz) + (e01 * (1 - tx) + e11 * tx) * tz;
  return zone.emin + (e / 65535) * zone.span - zone.base;
}

function heightGrid(zone, sampler) {
  const pos = [];
  const idx = [];
  const { w, h, xs } = sampler;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = xs(i, j).x;
      const z = xs(i, j).z;
      pos.push(x, heightAt(zone, x, z), z);
    }
  }
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const a = j * w + i;
      idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function terrainMesh(zone, mat) {
  const geo = heightGrid(zone, {
    w: zone.w, h: zone.h,
    xs: (i, j) => ({
      x: zone.minX + (zone.maxX - zone.minX) * (i / (zone.w - 1)),
      z: zone.minZ + (zone.maxZ - zone.minZ) * (j / (zone.h - 1))
    })
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.material.userData.role = "ground";
  return mesh;
}

function rebuildPatch(zone, wx, wz) {
  const N = 70;
  const span = 160;
  const cx = wx - zone.ox, cz = wz - zone.oz;
  const geo = heightGrid(zone, {
    w: N, h: N,
    xs: (i, j) => ({
      x: cx - span / 2 + span * (i / (N - 1)),
      z: cz - span / 2 + span * (j / (N - 1))
    })
  });
  if (zone.patch.geometry) zone.patch.geometry.dispose();
  zone.patch.geometry = geo;
  zone.patch.material.userData.role = "ground";
}

function triplanar(mat, scale) {
  mat.onBeforeCompile = shader => {
    shader.uniforms.uScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWpos;\nvarying vec3 vWnrm;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWpos = (modelMatrix * vec4(transformed, 1.0)).xyz;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvWnrm = mat3(modelMatrix) * objectNormal;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uScale;\nvarying vec3 vWpos;\nvarying vec3 vWnrm;")
      .replace("#include <map_fragment>", `
        vec3 bn = abs(normalize(vWnrm));
        bn = pow(bn, vec3(3.0));
        bn /= bn.x + bn.y + bn.z + 1e-4;
        vec4 cx = texture2D(map, vWpos.zy * uScale);
        vec4 cy = texture2D(map, vWpos.xz * uScale);
        vec4 cz = texture2D(map, vWpos.xy * uScale);
        vec4 sampledDiffuseColor = cx * bn.x + cy * bn.y + cz * bn.z;
        diffuseColor *= sampledDiffuseColor;
      `);
  };
  mat.customProgramCacheKey = () => "triplanar-" + scale;
}

function sideAt(zone, i) {
  const p = zone.path[i];
  const q = zone.path[Math.min(zone.path.length - 1, i + 1)];
  const r = zone.path[Math.max(0, i - 1)];
  let dx = q.x - r.x, dz = q.z - r.z;
  const L = Math.hypot(dx, dz) || 1;
  dx /= L; dz /= L;
  return { x: p.x, z: p.z, sx: -dz, sz: dx, tx: dx, tz: dz, y: heightAt(zone, p.x, p.z) };
}

function buildStrip(zone, half, lift, mat, step) {
  const pos = [];
  const uv = [];
  const idx = [];
  let travelled = 0;
  let stair = null;
  let prev = null;
  const last = zone.outbound;
  function push(x, z, sx, sz, y, d) {
    const v = pos.length / 3;
    pos.push(x + sx * half, y + lift, z + sz * half, x - sx * half, y + lift, z - sz * half);
    uv.push(d * 0.15, 0, d * 0.15, 1);
    if (v >= 2) idx.push(v - 2, v, v - 1, v - 1, v, v + 1);
  }
  for (let i = 0; i <= last; i++) {
    const s = sideAt(zone, i);
    if (i > 0) travelled += Math.hypot(s.x - zone.path[i - 1].x, s.z - zone.path[i - 1].z);
    let y = s.y;
    if (step) {
      if (stair == null) stair = s.y;
      const diff = s.y - stair;
      if (Math.abs(diff) >= step && prev) {
        const snapped = stair + Math.sign(diff) * step * Math.floor(Math.abs(diff) / step);
        push(prev.x, prev.z, prev.sx, prev.sz, stair, travelled);
        push(prev.x, prev.z, prev.sx, prev.sz, snapped, travelled);
        stair = snapped;
      }
      y = stair == null ? s.y : stair;
    }
    push(s.x, s.z, s.sx, s.sz, y, travelled);
    prev = s;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.strip = true;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

function buildWater(zone, mat) {
  const pos = [];
  const idx = [];
  const last = zone.outbound;
  const half = 2.4;
  const off = 6.5 * (zone.river || 1);
  for (let i = 0; i <= last; i++) {
    const s = sideAt(zone, i);
    const x = s.x + s.sx * off, z = s.z + s.sz * off;
    const y = heightAt(zone, x, z) + 0.04;
    const v = pos.length / 3;
    pos.push(x + s.sx * half, y, z + s.sz * half, x - s.sx * half, y, z - s.sz * half);
    if (v >= 2) idx.push(v - 2, v, v - 1, v - 1, v, v + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

function scatter(zone, every, startU, endU, lateral, fn) {
  const last = zone.outbound;
  const a = Math.floor(last * startU);
  const b = Math.floor(last * endU);
  let acc = 0;
  for (let i = Math.max(1, a); i <= b; i++) {
    const dx = zone.path[i].x - zone.path[i - 1].x;
    const dz = zone.path[i].z - zone.path[i - 1].z;
    acc += Math.hypot(dx, dz);
    if (acc < every) continue;
    acc = 0;
    const s = sideAt(zone, i);
    for (const sign of lateral) fn(s, sign, i / Math.max(1, last));
  }
}

function addCottonwoods(group, zone, trunkGeo, trunkMat, canopyGeo, leafMat) {
  const trunks = [], leaves = [];
  scatter(zone, 18, 0.02, 0.98, [1], (s, sign) => {
    const side = zone.river || 1;
    const x = s.x + s.sx * side * 5.2;
    const z = s.z + s.sz * side * 5.2;
    const y = heightAt(zone, x, z);
    if (y - s.y > 8 || y - s.y < -2) return;
    if (trunks.length > 42) return;
    trunks.push(x, y, z);
    leaves.push(x, y, z);
  });
  group.add(instances(trunkGeo, trunkMat, trunks, 1, false));
  group.add(instances(canopyGeo, leafMat, leaves, 1, false));
}

function addPines(group, zone, trunkGeo, trunkMat, pineGeo, pineMat, lowerOnly) {
  const trunks = [], tops = [];
  const end = lowerOnly ? 0.62 : 0.96;
  scatter(zone, 16, 0.03, end, [-1, 1], (s, sign) => {
    const dist = 4.8 + (sign > 0 ? 1.4 : 2.2);
    const x = s.x + s.sx * sign * dist;
    const z = s.z + s.sz * sign * dist;
    const y = heightAt(zone, x, z);
    if (Math.abs(y - s.y) > 7) return;
    if (trunks.length > 70) return;
    trunks.push(x, y, z);
    tops.push(x, y, z);
  });
  if (!trunks.length) return;
  group.add(instances(trunkGeo, trunkMat, trunks, 1.15, false));
  group.add(instances(pineGeo, pineMat, tops, 1.15, false));
}

function addRocks(group, zone, geo, mat) {
  const pts = [];
  const scales = [];
  scatter(zone, 11, 0.01, 0.99, [-1, 1], (s, sign) => {
    if (pts.length > 48) return;
    const dist = 2.4 + ((s.x * 13) % 1 + 1) % 1 * 2.2;
    const x = s.x + s.sx * sign * dist;
    const z = s.z + s.sz * sign * dist;
    const y = heightAt(zone, x, z);
    if (Math.abs(y - s.y) > 5) return;
    pts.push(x, y - 0.15, z);
    scales.push(0.45 + Math.abs(Math.sin(s.x * 0.17 + sign)) * 0.9);
  });
  if (!pts.length) return;
  const mesh = instances(geo, mat, pts, 1, false, scales);
  group.add(mesh);
}

function instances(geo, mat, triples, sy, cast, scales) {
  const n = triples.length / 3;
  if (!n) return new THREE.Group();
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.set(triples[i * 3], triples[i * 3 + 1], triples[i * 3 + 2]);
    const sc = scales ? scales[i] : 1;
    s.set(sc, sc * sy, sc);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), triples[i * 3] * 0.37);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.castShadow = !!cast;
  mesh.receiveShadow = true;
  return mesh;
}

function addChains(group, zone, pair) {
  const postGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.85, 5);
  postGeo.translate(0, 0.42, 0);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x8A8E86, roughness: 0.45, metalness: 0.55 });
  const posts = [];
  const last = zone.outbound;
  const a = Math.floor(last * 0.78);
  const b = Math.floor(last * 0.96);
  let acc = 0;
  for (let i = Math.max(1, a); i <= b; i++) {
    acc += Math.hypot(zone.path[i].x - zone.path[i - 1].x, zone.path[i].z - zone.path[i - 1].z);
    if (acc < 3.2) continue;
    acc = 0;
    const s = sideAt(zone, i);
    const left = heightAt(zone, s.x + s.sx * 2.2, s.z + s.sz * 2.2);
    const right = heightAt(zone, s.x - s.sx * 2.2, s.z - s.sz * 2.2);
    const sign = left < right ? 1 : -1;
    posts.push({ x: s.x + s.sx * sign * 0.85, z: s.z + s.sz * sign * 0.85, y: s.y });
  }
  if (posts.length < 2) return;
  const triples = [];
  posts.forEach(p => triples.push(p.x, p.y, p.z));
  group.add(instances(postGeo, postMat, triples, 1, true));
  const chainPos = [];
  const chainIdx = [];
  for (let i = 0; i < posts.length - 1; i++) {
    const A = posts[i], B = posts[i + 1];
    const v = chainPos.length / 3;
    chainPos.push(A.x, A.y + 0.72, A.z, B.x, B.y + 0.72, B.z, (A.x + B.x) / 2, (A.y + B.y) / 2 + 0.48, (A.z + B.z) / 2);
    chainIdx.push(v, v + 2, v + 2, v + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(chainPos, 3));
  geo.setIndex(chainIdx);
  const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xC5C8C2 }));
  group.add(line);
  void pair;
}

function addFalls(group, zone) {
  const last = zone.outbound;
  const grades = [];
  for (let i = 1; i <= last; i++) {
    const ds = Math.hypot(zone.path[i].x - zone.path[i - 1].x, zone.path[i].z - zone.path[i - 1].z) || 1;
    const dy = heightAt(zone, zone.path[i].x, zone.path[i].z) - heightAt(zone, zone.path[i - 1].x, zone.path[i - 1].z);
    grades.push({ i, g: dy / ds });
  }
  grades.sort((a, b) => b.g - a.g);
  const picked = [];
  for (const g of grades) {
    if (g.g < 0.12) break;
    if (picked.every(p => Math.abs(p.i - g.i) > 40)) picked.push(g);
    if (picked.length === 2) break;
  }
  const systems = [];
  const mat = new THREE.MeshBasicMaterial({
    color: 0xE7F1F2, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide
  });
  for (const g of picked) {
    const s = sideAt(zone, g.i);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(7, 16), mat);
    plane.position.set(s.x + s.sx * 3.5, s.y + 6, s.z + s.sz * 3.5);
    plane.lookAt(s.x, s.y + 6, s.z);
    group.add(plane);
    const count = 140;
    const arr = new Float32Array(count * 3);
    const speed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = s.x + s.sx * 3.5 + (Math.random() - 0.5) * 5;
      arr[i * 3 + 1] = s.y + Math.random() * 14;
      arr[i * 3 + 2] = s.z + s.sz * 3.5 + (Math.random() - 0.5) * 5;
      speed[i] = 1.5 + Math.random() * 2.2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xF4FBFC, size: 0.35, transparent: true, opacity: 0.55, depthWrite: false
    }));
    group.add(points);
    systems.push({ geo, count, speed, base: s.y, top: s.y + 14, time: 0 });
  }
  return systems;
}

function addCables(group, zone) {
  const last = zone.outbound;
  const posts = [];
  let acc = 999;
  for (let i = Math.floor(last * 0.9); i <= last; i++) {
    if (i > 0) acc += Math.hypot(zone.path[i].x - zone.path[i - 1].x, zone.path[i].z - zone.path[i - 1].z);
    if (acc < 5) continue;
    acc = 0;
    const s = sideAt(zone, i);
    posts.push(s);
  }
  if (posts.length < 2) return;
  const postGeo = new THREE.CylinderGeometry(0.04, 0.05, 1.05, 5);
  postGeo.translate(0, 0.52, 0);
  const postMat = new THREE.MeshStandardMaterial({ color: 0xD9D4CC, roughness: 0.6, metalness: 0.25 });
  const triples = [];
  for (const s of posts) {
    triples.push(s.x + s.sx * 0.7, s.y, s.z + s.sz * 0.7);
    triples.push(s.x - s.sx * 0.7, s.y, s.z - s.sz * 0.7);
  }
  group.add(instances(postGeo, postMat, triples, 1, true));
  const chainPos = [];
  const chainIdx = [];
  for (const sign of [-1, 1]) {
    for (let i = 0; i < posts.length - 1; i++) {
      const A = posts[i], B = posts[i + 1];
      const v = chainPos.length / 3;
      chainPos.push(
        A.x + A.sx * sign * 0.7, A.y + 0.95, A.z + A.sz * sign * 0.7,
        B.x + B.sx * sign * 0.7, B.y + 0.95, B.z + B.sz * sign * 0.7
      );
      chainIdx.push(v, v + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(chainPos, 3));
  geo.setIndex(chainIdx);
  group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xF2F0EA })));
}

function addRuins(group, zone, mat) {
  const spots = [0.22, 0.48, 0.73];
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const u of spots) {
    const s = sideAt(zone, Math.floor(zone.outbound * u));
    const x = s.x + s.sx * 6, z = s.z + s.sz * 6;
    const y = heightAt(zone, x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.lookAt(x + s.tx, y, z + s.tz);
    const wall = new THREE.Mesh(box, mat);
    wall.scale.set(3.2, 1.3, 0.45);
    wall.position.y = 0.65;
    wall.castShadow = true;
    wall.receiveShadow = true;
    const wall2 = wall.clone();
    wall2.position.set(1.4, 0.4, 1.6);
    wall2.scale.set(1.6, 0.8, 0.4);
    g.add(wall, wall2);
    group.add(g);
  }
}

function addGate(group, zone, mat) {
  const s = sideAt(zone, zone.path.length - 1);
  const g = new THREE.Group();
  g.position.set(s.x, s.y, s.z);
  g.lookAt(s.x - s.tx, s.y, s.z - s.tz);
  const stone = mat;
  const pillarGeo = new THREE.BoxGeometry(0.7, 3.1, 0.85);
  for (const x of [-1.35, 1.35]) {
    const p = new THREE.Mesh(pillarGeo, stone);
    p.position.set(x, 1.55, 0);
    p.castShadow = true;
    p.receiveShadow = true;
    g.add(p);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.55, 0.9), stone);
  lintel.position.y = 3.25;
  lintel.castShadow = true;
  g.add(lintel);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.16, 6, 10, Math.PI), stone);
  arch.rotation.z = Math.PI;
  arch.position.y = 3.05;
  arch.castShadow = true;
  g.add(arch);
  group.add(g);
}

function addClouds(group, zone) {
  const mat = new THREE.SpriteMaterial({ color: 0xF7F8F4, transparent: true, opacity: 0.28, depthWrite: false });
  scatter(zone, 42, 0.02, 0.98, [1], (s, sign) => {
    const sp = new THREE.Sprite(mat);
    const lift = 16 + Math.abs(Math.sin(s.x * 0.01)) * 18;
    sp.position.set(s.x + s.sx * 8, s.y + lift, s.z + s.sz * 8);
    const sc = 22 + (s.z % 7);
    sp.scale.set(sc, sc * 0.45, 1);
    group.add(sp);
  });
}

function retargetOnto(michelle, soldier) {
  const target = findSkinned(michelle.scene);
  const sourceMesh = findSkinned(soldier.scene);
  // The armature is a sibling of the mesh. The retarget mixer has to root
  // at the scene so bone-name tracks resolve, while still exposing .skeleton.
  const source = soldier.scene;
  source.skeleton = sourceMesh.skeleton;
  const byName = {};
  for (const c of soldier.animations) byName[c.name] = c;
  const runSrc = byName.Run || byName.run;
  const idleSrc = byName.Idle || byName.idle;
  if (!runSrc || !idleSrc) throw new Error("soldier clips");
  const run = retargetClip(target, source, runSrc, { hip: hipName(target), getBoneName: bone => bone.name });
  const idle = retargetClip(target, source, idleSrc, { hip: hipName(target), getBoneName: bone => bone.name });
  run.name = "Run";
  idle.name = "Idle";
  target.skeleton.pose();
  return { run, idle };
}

function hipName(mesh) {
  const bones = mesh.skeleton.bones;
  const hip = bones.find(b => /hips$/i.test(b.name));
  return hip ? hip.name : bones[0].name;
}

function findSkinned(root) {
  let found = null;
  root.traverse(o => { if (!found && o.isSkinnedMesh) found = o; });
  if (!found) throw new Error("no skinned mesh");
  return found;
}

function recolorMap(src, hex) {
  const img = src.image;
  const c = document.createElement("canvas");
  c.width = img.width || 512;
  c.height = img.height || 512;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  const image = g.getImageData(0, 0, c.width, c.height);
  const d = image.data;
  const tr = (hex >> 16) & 255, tg = (hex >> 8) & 255, tb = hex & 255;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gc = d[i + 1], b = d[i + 2];
    if (r + gc > 380 && r > 180 && gc > 140 && b < 160 && gc > b + 30) {
      const shade = (0.3 * r + 0.6 * gc + 0.1 * b) / 255;
      const keep = 0.42 + shade * 0.85;
      d[i] = Math.min(255, tr * keep);
      d[i + 1] = Math.min(255, tg * keep);
      d[i + 2] = Math.min(255, tb * keep);
    }
  }
  g.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.wrapS = src.wrapS;
  tex.wrapT = src.wrapT;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function makeRunner(key, scene, clips, shirtMap) {
  const model = cloneSkinned(scene);
  // The example file parents the meter-scale mesh under a 0.01 root scale.
  model.scale.setScalar(100);
  model.rotation.y = Math.PI;
  const mesh = findSkinned(model);
  mesh.frustumCulled = false;
  mesh.castShadow = key !== "last";
  mesh.material = mesh.material.clone();
  if (shirtMap) {
    mesh.material.map = shirtMap;
    mesh.material.metalness = 0.12;
  }
  if (key === "last") ghostify(mesh.material);
  const mixer = new THREE.AnimationMixer(mesh);
  const idle = mixer.clipAction(clips.idle);
  const run = mixer.clipAction(clips.run);
  idle.play();
  run.time = key === "pace" ? 0.18 : key === "last" ? 0.41 : 0;
  const pivot = new THREE.Group();
  pivot.add(model);
  const tag = makeLabel(key === "you" ? "You" : key === "pace" ? "Pace" : "Last chance");
  tag.position.y = 1.92;
  pivot.add(tag);
  if (key === "you") {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.52, 28),
      new THREE.MeshBasicMaterial({ color: 0xE8772E, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    pivot.add(ring);
  }
  if (key === "pace") attachFlag(mesh);
  return { pivot, model, mixer, idle, run, moving: false, prev: new THREE.Vector3() };
}

function ghostify(mat) {
  mat.transparent = true;
  mat.depthWrite = false;
  mat.roughness = 0.22;
  mat.metalness = 0.02;
  mat.opacity = 1;
  mat.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `#include <opaque_fragment>
       float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.1);
       gl_FragColor.rgb += vec3(0.62, 0.82, 0.78) * fres * 0.85;
       gl_FragColor.a = 0.14 + 0.62 * fres;`
    );
  };
  mat.customProgramCacheKey = () => "ghost-fresnel-v1";
}

function attachFlag(mesh) {
  let hand = null;
  mesh.traverse(o => {
    if (hand) return;
    if (/RightHand$/.test(o.name) && !/Thumb|Index|Middle|Ring|Pinky/.test(o.name)) hand = o;
  });
  if (!hand) return;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.014, 0.62, 5),
    new THREE.MeshStandardMaterial({ color: 0x243B5C, roughness: 0.5 })
  );
  pole.position.set(0.02, 0.34, 0.04);
  pole.castShadow = true;
  const pennant = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x7C9A4E, roughness: 0.55, side: THREE.DoubleSide })
  );
  pennant.position.set(0.15, 0.58, 0.04);
  hand.add(pole, pennant);
}

function makeLabel(text) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(251,248,240,0.9)";
  g.beginPath();
  g.moveTo(20, 8);
  g.arcTo(252, 8, 252, 56, 16);
  g.arcTo(252, 56, 4, 56, 16);
  g.arcTo(4, 56, 4, 8, 16);
  g.arcTo(4, 8, 252, 8, 16);
  g.closePath();
  g.fill();
  g.fillStyle = "#1E2419";
  g.font = "700 28px Georgia, serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(0.92, 0.23, 1);
  return s;
}
