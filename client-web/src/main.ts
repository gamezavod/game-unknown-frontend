import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createIsland } from "./island";
import {
  demoMapSource,
  terrainNames,
  buildingNames,
  type Cell,
} from "./map-data";
import { TapGesture } from "./gestures";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
const $ = (id: string) => document.getElementById(id)!;
async function start() {
  const cells = await demoMapSource.load();
  const island = await createIsland(cells);
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  const scene = new T.Scene();
  scene.background = new T.Color(0xbcd7d5);
  scene.fog = new T.FogExp2(0xbcd7d5, 0.012);
  scene.add(island.root);
  const b = island.bounds;
  const span = Math.max(b.width, b.depth, b.maxHeight + 4);
  const center = new T.Vector3(b.centerX, 0, b.centerZ);
  const camera = new T.PerspectiveCamera(38, 1, 0.1, span * 15);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.enableRotate = false;
  controls.screenSpacePanning = false;
  controls.mouseButtons.LEFT = T.MOUSE.PAN;
  controls.mouseButtons.RIGHT = T.MOUSE.PAN;
  controls.touches.ONE = T.TOUCH.PAN;
  controls.touches.TWO = T.TOUCH.DOLLY_PAN;
  controls.minDistance = span * 0.38;
  controls.maxDistance = span * 6;
  const resetOffset = new T.Vector3(0.32, 0.93, 1.12).normalize();
  const cameraLimits = span * 0.7;
  function reset() {
    const aspect = innerWidth / innerHeight;
    const distance =
      span *
      Math.max(
        1.55,
        0.55 / (Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * aspect),
      );
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(resetOffset, distance);
    controls.update();
  }
  $("reset").addEventListener("click", reset);
  $("zoom-in").addEventListener("click", () => zoom(0.8));
  $("zoom-out").addEventListener("click", () => zoom(1.25));
  function zoom(factor: number) {
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(
      T.MathUtils.clamp(
        offset.length() * factor,
        controls.minDistance,
        controls.maxDistance,
      ),
    );
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "+" || e.key === "=") zoom(0.8);
    else if (e.key === "-") zoom(1.25);
    else if (e.key === "Home") reset();
    else if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
    ) {
      const offset = new T.Vector3(
        e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0,
        0,
        e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0,
      );
      controls.target.add(offset);
      camera.position.add(offset);
    } else return;
    e.preventDefault();
  });
  const sky = new T.HemisphereLight(0xdaf6ff, 0x6f7442, 2.5);
  scene.add(sky);
  const sun = new T.DirectionalLight(0xffe3ad, 3.5);
  sun.position.copy(center).add(new T.Vector3(-span * 0.5, span, span * 0.6));
  sun.castShadow = true;
  sun.target.position.copy(center);
  scene.add(sun, sun.target);
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -span,
    right: span,
    top: span,
    bottom: -span,
    far: span * 5,
  });
  sun.shadow.normalBias = 0.035;
  const seaMaterial = new T.MeshStandardMaterial({
    color: 0x287f8c,
    roughness: 0.65,
    metalness: 0.18,
  });
  const sea = new T.Mesh(
    new T.PlaneGeometry(span * 24, span * 24),
    seaMaterial,
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(b.centerX, -0.03, b.centerZ);
  sea.receiveShadow = true;
  scene.add(sea);
  // Небольшие блики на воде: одна геометрия, один draw call.
  const glints: number[] = [];
  for (let i = 0; i < 850; i++) {
    const x = b.centerX + Math.sin(i * 127.1) * 0.5 * span * 8;
    const z = b.centerZ + Math.sin(i * 311.7) * 0.5 * span * 8;
    glints.push(x, 0, z, x + 0.13 + (i % 4) * 0.06, 0, z);
  }
  const glintGeometry = new T.BufferGeometry();
  glintGeometry.setAttribute(
    "position",
    new T.Float32BufferAttribute(glints, 3),
  );
  const glintMaterial = new T.LineBasicMaterial({
    color: 0xc1e5da,
    transparent: true,
    opacity: 0.14,
  });
  const waves = new T.LineSegments(glintGeometry, glintMaterial);
  scene.add(waves);
  // Мягкая дымка у дальнего берега, без тяжёлого постпроцессинга.
  const mistCanvas = document.createElement("canvas");
  mistCanvas.width = mistCanvas.height = 128;
  const ctx = mistCanvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(220,238,228,.65)");
  gradient.addColorStop(1, "rgba(220,238,228,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const mistMaterial = new T.SpriteMaterial({
    map: new T.CanvasTexture(mistCanvas),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const mist = new T.Group();
  scene.add(mist);
  for (let i = 0; i < 9; i++) {
    const cloud = new T.Sprite(mistMaterial);
    cloud.position.set(
      b.centerX + ((i - 4) * span) / 8,
      1.1,
      b.centerZ - b.depth * 0.4,
    );
    cloud.scale.set(span * 0.45, span * 0.22, 1);
    mist.add(cloud);
  }
  let night = false,
    nightBlend = 0,
    automatic = false;
  $("time-toggle").addEventListener("click", () => {
    night = !night;
    document.body.classList.toggle("night", night);
    $("time-toggle").setAttribute("aria-pressed", String(night));
    $("time-toggle").textContent = night ? "☾ Ночь" : "☀ День";
  });
  document
    .querySelector<HTMLInputElement>("#auto-time")!
    .addEventListener("change", (e) => {
      automatic = (e.target as HTMLInputElement).checked;
    });
  let cycleElapsed = 0;
  function select(index: number) {
    island.select(index);
    const c = cells[index];
    $("cell-title").textContent =
      c.state === "unexplored"
        ? "Неизведанная земля"
        : c.building
          ? buildingNames[c.building]
          : terrainNames[c.type];
    $("cell-coordinates").textContent = `q: ${c.q} · r: ${c.r}`;
    $("cell-type").textContent = terrainNames[c.type];
    $("cell-state").textContent =
      c.state === "unexplored"
        ? "Не исследована"
        : c.building
          ? "Стартовое здание"
          : "Природная территория";
    document.querySelector<HTMLSelectElement>("#cell-select")!.value =
      String(index);
    $("selection").hidden = false;
    $("selection-hint").hidden = true;
  }
  $("map-count").textContent =
    `${cells.length} клеток · ${cells.filter((c) => c.building).length} зданий`;
  const cellSelect = document.querySelector<HTMLSelectElement>("#cell-select")!;
  cells.forEach((c: Cell, index) => {
    const option = new Option(
      `${c.q}, ${c.r} · ${c.state === "unexplored" ? "Не исследована" : c.building ? buildingNames[c.building] : terrainNames[c.type]}`,
      String(index),
    );
    cellSelect.add(option);
  });
  cellSelect.addEventListener("change", () => {
    if (cellSelect.value !== "") select(Number(cellSelect.value));
  });
  const gesture = new TapGesture(),
    ray = new T.Raycaster();
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button === 0)
      gesture.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
  });
  canvas.addEventListener("pointermove", (e) =>
    gesture.move(e.pointerId, e.clientX, e.clientY),
  );
  canvas.addEventListener("pointercancel", () => gesture.cancel());
  canvas.addEventListener("lostpointercapture", () => gesture.cancel());
  canvas.addEventListener("pointerup", (e) => {
    if (!gesture.up(e.pointerId, e.clientX, e.clientY, e.timeStamp)) return;
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(
      new T.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    const hit = ray.intersectObjects(island.picking, false)[0];
    if (hit) select(hit.object.userData.cellIndex as number);
  });
  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    if (innerWidth > 900)
      camera.setViewOffset(
        innerWidth,
        innerHeight,
        110,
        0,
        innerWidth,
        innerHeight,
      );
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();
  reset();
  const dayBackground = new T.Color(0xbcd7d5),
    nightBackground = new T.Color(0x172d49);
  const daySun = new T.Color(0xffe3ad),
    nightSun = new T.Color(0xa3c5ff);
  const previousTarget = new T.Vector3(),
    targetCorrection = new T.Vector3();
  const clock = new T.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (automatic) {
      cycleElapsed += dt;
      if (cycleElapsed > 35) {
        cycleElapsed = 0;
        $("time-toggle").click();
      }
    }
    nightBlend = T.MathUtils.damp(nightBlend, night ? 1 : 0, 2, dt);
    (scene.background as T.Color)
      .copy(dayBackground)
      .lerp(nightBackground, nightBlend);
    (scene.fog as T.FogExp2).color.copy(scene.background as T.Color);
    sun.color.copy(daySun).lerp(nightSun, nightBlend);
    sun.intensity = T.MathUtils.lerp(3.5, 0.8, nightBlend);
    sky.intensity = T.MathUtils.lerp(2.5, 0.65, nightBlend);
    renderer.toneMappingExposure = T.MathUtils.lerp(1.3, 0.95, nightBlend);
    mistMaterial.opacity = T.MathUtils.lerp(0.55, 0.2, nightBlend);
    glintMaterial.opacity = 0.12 + 0.03 * Math.sin(clock.elapsedTime);
    waves.position.x = Math.sin(clock.elapsedTime * 0.2) * 0.2;
    controls.update();
    previousTarget.copy(controls.target);
    controls.target.x = T.MathUtils.clamp(
      controls.target.x,
      center.x - cameraLimits,
      center.x + cameraLimits,
    );
    controls.target.z = T.MathUtils.clamp(
      controls.target.z,
      center.z - cameraLimits,
      center.z + cameraLimits,
    );
    controls.target.y = 0;
    camera.position.add(
      targetCorrection.copy(controls.target).sub(previousTarget),
    );
    // Дымка сохраняет насыщенность острова при широком мобильном ракурсе.
    (scene.fog as T.FogExp2).density = 0.4 / camera.position.distanceTo(controls.target);
    renderer.render(scene, camera);
  });
  $("loading").hidden = true;
  canvas.dataset.ready = "true";
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    renderer.setAnimationLoop(null);
    showError(
      "Графика приостановлена. Перезагрузите страницу, чтобы вернуться на остров.",
    );
  });
}
function showError(message: string) {
  $("loading").hidden = true;
  $("error").textContent = message;
  $("error").hidden = false;
}
start().catch((error) => {
  console.error(error);
  showError(
    "Не удалось открыть остров. Проверьте соединение и поддержку WebGL 2, затем перезагрузите страницу.",
  );
});
