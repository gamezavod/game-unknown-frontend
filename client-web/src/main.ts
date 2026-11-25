import { renderArt } from "./ui-art";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createIsland, HEX_RADIUS } from "./island";
import {
  fitIslandCamera,
  cameraPanBounds,
  openIslandNavigation,
} from "./camera";
import { createAtmosphere } from "./atmosphere";
import { demoMapSource, terrainNames, buildingNames, isWaterTerrain, type Cell } from "./map-data";
import { canPickCell } from "./selection";
import { hexKey, type Axial } from "./hex";
import { GameApiError } from "./game-api";
import { renderCells, worldApi, type ForestAction, type IslandSnapshot } from "./world-api";
import { TapGesture } from "./gestures";
import { mountMatchThree } from "./match3-ui";
import type { Warehouse } from "./match3-api";
import { mountSystemTheme } from "./theme";
import { penpotHomeIcons } from "./penpot-home-icons";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/onest";
import "@fontsource/pt-serif/700.css";
import "./style.css";
import "./penpot-layout.css";

const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
const $ = (id: string) => document.getElementById(id)!;

function mountHomeHud() {
  document.querySelectorAll<HTMLImageElement>("[data-home-icon]").forEach((image) => {
    const name = image.dataset.homeIcon as keyof typeof penpotHomeIcons;
    image.outerHTML = renderArt(penpotHomeIcons[name], `home-art home-icon--${name}`);
  });
  window.addEventListener("match3:warehouse", (event) => {
    const detail = (event as CustomEvent<Warehouse>).detail;
    Object.entries(detail).forEach(([resource, stock]) => {
      const element = document.querySelector<HTMLElement>(`[data-home-resource="${resource}"]`);
      if (!element) return;
      element.textContent = String(stock.amount);
      if (element.nextElementSibling) element.nextElementSibling.textContent = `/ ${stock.limit}`;
    });
  });
}

async function start() {
  mountSystemTheme();
  mountHomeHud();
  const shifts = mountMatchThree();
  const preview = import.meta.env.DEV && new URLSearchParams(location.search).has("match3-preview");
  let snapshot: IslandSnapshot | undefined;
  if (!preview) {
    try {
      snapshot = await worldApi.load();
    } catch (error) {
      console.error(error);
      showError("Не удалось загрузить остров с сервера. Проверьте соединение и обновите страницу.");
      return;
    }
  }
  let cells = snapshot ? renderCells(snapshot) : await demoMapSource.load();
  let island = await createIsland(cells);
  let openIsland = openIslandNavigation(cells, HEX_RADIUS);
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
  let span = Math.max(b.width, b.depth, b.maxHeight + 4);
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
  let navigationRevision = 0;
  function reset() {
    navigationRevision++;
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
    else if (e.key === "Enter" && snapshot) {
      showCellList = true;
      renderPanel();
      cellSelect.focus();
    }
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
  let atmosphere = createAtmosphere(cells, center, span, camera, renderer, !!snapshot);
  scene.add(atmosphere.root);
  let nightBlend = document.body.classList.contains("night") ? 1 : 0;
  const panel = $("island-panel");
  const actionButton = $("island-action") as HTMLButtonElement;
  const cellSelect = $("island-select") as HTMLSelectElement;
  let selectedCell: Axial | undefined;
  let showCellList = false;
  let working = false;
  let syncFailed = false;
  let mapMessage = "";
  let refreshTimer: number | undefined;
  let worldQueue = Promise.resolve();

  function renderPanel() {
    const index = selectedCell ? cells.findIndex((cell) => hexKey(cell) === hexKey(selectedCell!)) : -1;
    const cell = cells[index];
    panel.hidden = !snapshot || (!cell && !showCellList && !mapMessage);
    if (panel.hidden) return;
    const inFog = cell?.type === "fog";
    const differentSite = inFog && snapshot?.activeSite && hexKey(snapshot.activeSite) !== hexKey(cell);
    $("island-title").textContent = cell ? cell.building ? buildingNames[cell.building] : terrainNames[cell.type] : "Участки острова";
    $("island-lookup").hidden = !showCellList;
    cellSelect.value = index < 0 ? "" : String(index);
    $("island-status").textContent = mapMessage || (cell?.sapling ? "Здесь растёт саженец." : differentSite ? "Сначала закончи раскопки на начатом участке." : "");
    $("island-status").hidden = !$("island-status").textContent;
    const action = syncFailed ? "refresh"
      : inFog && !differentSite ? "dig"
      : cell && !cell.building && cell.type === "forest" ? "chopForest"
      : cell && !cell.building && cell.type === "grass" && !cell.sapling ? "plantForest"
      : undefined;
    const labels = {
      refresh: "Обновить остров",
      dig: snapshot?.activeSite ? "Продолжить раскопки" : "Начать раскопки",
      chopForest: "Срубить лес",
      plantForest: "Посадить лес",
    };
    actionButton.hidden = !action;
    actionButton.dataset.action = action;
    actionButton.textContent = action ? labels[action] : "";
    actionButton.disabled = working;
  }

  function fillCellList() {
    const options = cells.flatMap((cell, index) => {
      if (isWaterTerrain(cell.type)) return [];
      const title = cell.building ? buildingNames[cell.building] : terrainNames[cell.type];
      return [new Option(title + " · " + cell.q + ", " + cell.r, String(index))];
    });
    cellSelect.replaceChildren(new Option("Выберите участок", ""), ...options);
  }

  function selectCell(index: number) {
    const cell = cells[index];
    if (!cell || !island.select(index)) return;
    selectedCell = { q: cell.q, r: cell.r };
    mapMessage = "";
    renderPanel();
  }

  function closePanel() {
    selectedCell = undefined;
    mapMessage = "";
    showCellList = false;
    island.clearSelection();
    renderPanel();
  }

  function scheduleGrowth() {
    window.clearTimeout(refreshTimer);
    if (!snapshot?.saplings.length) return;
    const next = Math.min(...snapshot.saplings.map((sapling) => sapling.plantedAt + sapling.growthDurationMs));
    refreshTimer = window.setTimeout(() => updateWorld(), Math.max(4000, next - Date.now()));
  }

  function footprint(cell: Cell) {
    const terrain = isWaterTerrain(cell.type) || cell.type === "fog" ? cell.type : "land";
    return [cell.q, cell.r, terrain, cell.height];
  }

  async function applySnapshot(next: IslandSnapshot, focus?: Axial) {
    const updated = renderCells(next);
    if (JSON.stringify(cells) !== JSON.stringify(updated)) {
      const expanded = JSON.stringify(cells.map(footprint)) !== JSON.stringify(updated.map(footprint));
      const newIsland = await createIsland(updated);
      scene.remove(island.root);
      island.dispose();
      island = newIsland;
      scene.add(island.root);
      cells = updated;

      if (expanded) {
        const { width, depth, maxHeight } = island.bounds;
        span = Math.max(width, depth, maxHeight + 4);
        island.visualBounds.getCenter(center);
        camera.far = span * 15;
        (scene.fog as T.Fog).near = span * 4.5;
        (scene.fog as T.Fog).far = span * 9;
        shoreFill.position.set(span * 0.2, span * 0.12, span).add(center);
        shoreFill.target.position.copy(center);
        sun.position.set(-span * 0.65, span * 0.85, -span * 0.45).add(center);
        sun.target.position.copy(center);
        Object.assign(sun.shadow.camera, { left: -span * 0.65, right: span * 0.65, top: span * 0.65, bottom: -span * 0.65, far: span * 5 });
        sun.shadow.camera.updateProjectionMatrix();
        scene.remove(atmosphere.root);
        atmosphere.dispose();
        atmosphere = createAtmosphere(cells, center, span, camera, renderer, true);
        scene.add(atmosphere.root);
        openIsland = openIslandNavigation(cells, HEX_RADIUS);
        resize();
      }
      fillCellList();
    }

    snapshot = next;
    const destination = focus ?? selectedCell;
    if (destination) {
      const index = cells.findIndex((cell) => hexKey(cell) === hexKey(destination));
      if (index >= 0 && island.select(index)) selectedCell = destination;
    }
  }

  function updateWorld(forestEdit?: { type: ForestAction; position: Axial }, focus?: Axial) {
    if (!snapshot) return;
    worldQueue = worldQueue.then(async () => {
      if (!snapshot) return;
      working = true;
      renderPanel();
      try {
        const next = forestEdit
          ? await worldApi.forest(forestEdit.type, forestEdit.position, snapshot.serverSavedAt)
          : await worldApi.load();
        await applySnapshot(next, focus);
        syncFailed = false;
        mapMessage = focus ? "Новый участок открыт." : "";
      } catch (error) {
        if (forestEdit && error instanceof GameApiError && error.status === 409) {
          try {
            await applySnapshot(await worldApi.load());
            syncFailed = false;
            mapMessage = "Остров обновился. Проверь участок и попробуй ещё раз.";
            return;
          } catch {
            // Следующая попытка начнётся с загрузки актуальной карты.
          }
        }
        syncFailed = true;
        mapMessage = "Не удалось обновить остров. Попробуй ещё раз.";
      } finally {
        working = false;
        renderPanel();
        scheduleGrowth();
      }
    });
  }

  fillCellList();
  scheduleGrowth();
  cellSelect.addEventListener("change", () => {
    if (cellSelect.value !== "") selectCell(Number(cellSelect.value));
  });
  $("island-close").addEventListener("click", closePanel);
  actionButton.addEventListener("click", () => {
    if (working) return;
    const action = actionButton.dataset.action;
    if (action === "refresh") updateWorld();
    else if (selectedCell && action === "dig") {
      const target = selectedCell;
      closePanel();
      shifts.openDig(target);
    } else if (selectedCell && (action === "chopForest" || action === "plantForest")) {
      updateWorld({ type: action, position: selectedCell });
    }
  });
  window.addEventListener("match3:cell-revealed", (event) => {
    updateWorld(undefined, (event as CustomEvent<Axial>).detail);
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateWorld();
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
    if (!hit) {
      closePanel();
      return;
    }
    const index = hit.object.userData.cellIndex as number;
    if (cells[index]?.type === "fog" || canPickCell(cells, index, ray.ray, hit.distance, atmosphere.fog.region, clock.elapsedTime)) {
      selectCell(index);
    }
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
  let panCache:
    | {
        revision: number;
        zoom: number;
        aspect: number;
        targetX: number;
        limits: ReturnType<typeof cameraPanBounds>;
      }
    | undefined;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const night = document.body.classList.contains("night");
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
    const aspect = camera.right - camera.left;
    if (
      !panCache ||
      panCache.revision !== navigationRevision ||
      panCache.zoom !== camera.zoom ||
      panCache.aspect !== aspect ||
      Math.abs(panCache.targetX - controls.target.x) > 0.5
    ) {
      panCache = {
        revision: navigationRevision,
        zoom: camera.zoom,
        aspect,
        targetX: controls.target.x,
        limits: cameraPanBounds(
          camera,
          controls.target,
          openIsland,
          atmosphere.fog.region,
        ),
      };
    }
    const limits = panCache.limits;
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
