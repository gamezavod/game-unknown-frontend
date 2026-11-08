import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createIsland } from "./island";
import { fitIslandCamera, cameraPanBounds } from "./camera";
import { createAtmosphere } from "./atmosphere";
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
  renderer.toneMappingExposure = 1.08;
  const scene = new T.Scene();
  scene.background = new T.Color(0x9bbdb4);
  scene.add(island.root);
  const b = island.bounds;
  const span = Math.max(b.width, b.depth, b.maxHeight + 4);
  const center = island.visualBounds.getCenter(new T.Vector3());
  const camera = new T.OrthographicCamera(-10, 10, 10, -10, 0.1, span * 15);
  scene.fog = new T.Fog(0x9bbdb4, span * 4.5, span * 9);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.enableRotate = false;
  controls.screenSpacePanning = false;
  controls.mouseButtons.LEFT = T.MOUSE.PAN;
  controls.mouseButtons.RIGHT = T.MOUSE.PAN;
  controls.touches.ONE = T.TOUCH.PAN;
  controls.touches.TWO = T.TOUCH.DOLLY_PAN;
  controls.minZoom = 0.5;
  controls.maxZoom = 3;
  function reset() {
    // Убираем остаточную инерцию перед восстановлением ракурса.
    controls.enableDamping = false;
    controls.update();
    const target = fitIslandCamera(
      camera,
      island.visualBounds,
      innerWidth,
      innerHeight,
      island.framingPoints,
    );
    controls.target.copy(target);
    controls.update();
    controls.enableDamping = true;
  }
  $("reset").addEventListener("click", reset);
  $("zoom-in").addEventListener("click", () => zoom(1.2));
  $("zoom-out").addEventListener("click", () => zoom(1 / 1.2));
  function zoom(factor: number) {
    camera.zoom = T.MathUtils.clamp(
      camera.zoom * factor,
      controls.minZoom,
      controls.maxZoom,
    );
    camera.updateProjectionMatrix();
  }
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "+" || e.key === "=") zoom(1.2);
    else if (e.key === "-") zoom(1 / 1.2);
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
  const sky = new T.HemisphereLight(0xbad9db, 0x817650, 1.45);
  scene.add(sky);
  const shoreFill = new T.DirectionalLight(0xc2d3d1, 0.65);
  shoreFill.position
    .copy(center)
    .add(new T.Vector3(span * 0.2, span * 0.12, span));
  shoreFill.target.position.copy(center);
  scene.add(shoreFill, shoreFill.target);
  const sun = new T.DirectionalLight(0xffe4ad, 3.4);
  sun.position
    .copy(center)
    .add(new T.Vector3(-span * 0.65, span * 0.85, -span * 0.45));
  sun.castShadow = true;
  sun.target.position.copy(center);
  scene.add(sun, sun.target);
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -span * 0.65,
    right: span * 0.65,
    top: span * 0.65,
    bottom: -span * 0.65,
    far: span * 5,
  });
  sun.shadow.normalBias = 0.025;
  sun.shadow.bias = -0.00015;
  const atmosphere = createAtmosphere(cells, center, span, camera, renderer);
  scene.add(atmosphere.root);
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
    $("cell-type").textContent =
      c.state === "unexplored" ? "Скрыта туманом" : terrainNames[c.type];
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
    if (cellSelect.value !== "") {
      select(Number(cellSelect.value));
      document.querySelector<HTMLDetailsElement>(".lookup")!.open = false;
    }
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
    reset();
    atmosphere.fog.resize();
  }
  window.addEventListener("resize", resize);
  resize();
  const dayBackground = new T.Color(0x9bbdb4),
    nightBackground = new T.Color(0x172d49);
  const daySun = new T.Color(0xffe4ad),
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
    (scene.fog as T.Fog).color.copy(scene.background as T.Color);
    sun.color.copy(daySun).lerp(nightSun, nightBlend);
    sun.intensity = T.MathUtils.lerp(3.4, 1.2, nightBlend);
    shoreFill.intensity = T.MathUtils.lerp(0.65, 0.2, nightBlend);
    sky.intensity = T.MathUtils.lerp(1.45, 0.6, nightBlend);
    renderer.toneMappingExposure = T.MathUtils.lerp(1.08, 0.95, nightBlend);
    atmosphere.update(clock.elapsedTime, nightBlend);
    controls.update();
    previousTarget.copy(controls.target);
    const limits = cameraPanBounds(
      camera,
      controls.target,
      b,
      atmosphere.fog.region,
    );
    controls.target.x = T.MathUtils.clamp(
      controls.target.x,
      limits.minX,
      limits.maxX,
    );
    controls.target.z = T.MathUtils.clamp(
      controls.target.z,
      limits.minZ,
      limits.maxZ,
    );
    controls.target.y = center.y;
    camera.position.add(
      targetCorrection.copy(controls.target).sub(previousTarget),
    );
    atmosphere.fog.render(scene);
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
