import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { axialToWorld } from "./hex";
import { mapBounds, type Cell, type Building } from "./map-data";

export const HEX_RADIUS = 1.25;
const buildingModels: Record<Building, string> = {
  townHall: "buildings/red/building_tavern_red",
  home: "buildings/red/building_home_A_red",
  lumbermill: "buildings/red/building_lumbermill_red",
  warehouse: "buildings/red/building_market_red",
  farm: "buildings/neutral/building_grain",
};
export async function createIsland(cells: Cell[]) {
  const root = new T.Group();
  const loader = new GLTFLoader();
  const paths = new Set(["tiles/base/hex_grass"]);
  for (const c of cells) {
    if (c.state === "unexplored") continue;
    if (c.type === "forest") paths.add("decoration/nature/trees_B_medium");
    if (c.type === "rock")
      paths.add("decoration/nature/mountain_B_grass_trees");
    if (c.building) paths.add(buildingModels[c.building]);
  }
  const models = new Map(
    await Promise.all(
      [...paths].map(
        async (path) =>
          [
            path,
            (
              await loader.loadAsync(
                `${import.meta.env.BASE_URL}kaykit/${path}.gltf`,
              )
            ).scene,
          ] as const,
      ),
    ),
  );
  // glTF-геометрия и материалы общие для клонов: выделение не создаёт копий текстур.
  for (const model of models.values())
    model.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  const scale = HEX_RADIUS / (2 / Math.sqrt(3));
  const sandMaterial = new T.MeshStandardMaterial({
    color: 0xdcc798,
    roughness: 1,
  });
  const unknownMaterial = new T.MeshStandardMaterial({
    color: 0x9baea4,
    roughness: 1,
  });
  const waterMaterial = new T.MeshStandardMaterial({
    color: 0x398c98,
    transparent: true,
    opacity: 0.35,
  });
  const hexGeometry = new T.CylinderGeometry(
    HEX_RADIUS * 0.995,
    HEX_RADIUS,
    1,
    6,
  );
  const picking: T.Object3D[] = [];
  const edges = new T.BufferGeometry();
  const vertices: number[] = [];
  const tileRoots: T.Group[] = [];
  cells.forEach((cell, index) => {
    const { x, z } = axialToWorld(cell, HEX_RADIUS);
    const tile = new T.Group();
    tile.position.set(x, cell.height, z);
    tileRoots.push(tile);
    root.add(tile);
    if (cell.type === "water" || cell.state === "unexplored") {
      const mesh = new T.Mesh(
        hexGeometry,
        cell.type === "water" ? waterMaterial : unknownMaterial,
      );
      mesh.scale.y = cell.type === "water" ? 0.025 : Math.max(0.1, cell.height);
      mesh.position.y = -mesh.scale.y / 2;
      tile.add(mesh);
    } else {
      const base = models.get("tiles/base/hex_grass")!.clone(true);
      base.scale.set(
        scale * 0.993,
        Math.max(0.1, cell.height) + 0.15,
        scale * 0.993,
      );
      tile.add(base);
      if (cell.type === "coast") {
        // Песчаная ступень соединяет берег с общей водой без встроенной воды в glTF.
        const beach = new T.Mesh(hexGeometry, sandMaterial);
        beach.scale.set(1.04, 0.24, 1.04);
        beach.position.y = 0.08 - cell.height;
        beach.receiveShadow = true;
        tile.add(beach);
      }
      const path = cell.building
        ? buildingModels[cell.building]
        : cell.type === "forest"
          ? "decoration/nature/trees_B_medium"
          : cell.type === "rock"
            ? "decoration/nature/mountain_B_grass_trees"
            : undefined;
      if (path) {
        const prop = models.get(path)!.clone(true);
        prop.scale.setScalar(
          scale * (cell.building && cell.building !== "farm" ? 1.55 : 1),
        );
        prop.rotation.y = T.MathUtils.degToRad(cell.rotation ?? 0);
        tile.add(prop);
      }
    }
    tile.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.userData.cellIndex = index;
        picking.push(o);
      }
    });
    for (let i = 0; i < 6; i++) {
      for (const j of [i, i + 1]) {
        const angle = (j * Math.PI) / 3;
        vertices.push(
          x + Math.sin(angle) * HEX_RADIUS * 0.995,
          cell.height + 0.013,
          z + Math.cos(angle) * HEX_RADIUS * 0.995,
        );
      }
    }
  });
  edges.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  root.add(
    new T.LineSegments(
      edges,
      new T.LineBasicMaterial({
        color: 0x51692a,
        transparent: true,
        opacity: 0.2,
      }),
    ),
  );
  const selection = new T.Mesh(
    new T.RingGeometry(HEX_RADIUS * 0.88, HEX_RADIUS * 0.98, 6),
    new T.MeshBasicMaterial({
      color: 0xffe5a0,
      side: T.DoubleSide,
      depthTest: true,
      transparent: true,
      opacity: 0.95,
    }),
  );
  // RingGeometry вершинами по X, а гексы KayKit — по Z.
  selection.rotation.set(-Math.PI / 2, 0, Math.PI / 6);
  selection.renderOrder = 5;
  selection.visible = false;
  root.add(selection);
  return {
    root,
    picking,
    bounds: mapBounds(cells, HEX_RADIUS),
    select(index: number) {
      selection.position.copy(tileRoots[index].position);
      selection.position.y += 0.035;
      selection.visible = true;
    },
  };
}
