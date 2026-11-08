import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { axialToWorld } from "./hex";
import { mapBounds, type Cell, type Building } from "./map-data";

export const HEX_RADIUS = 1.25;
const buildingModels: Record<Building, string> = {
  townHall: "buildings/red/building_church_red",
  home: "buildings/red/building_home_A_red",
  lumbermill: "buildings/red/building_lumbermill_red",
  warehouse: "buildings/red/building_market_red",
  farm: "buildings/neutral/building_grain",
};
const forestModels = ["trees_A_medium", "trees_B_small", "trees_A_small"];
const rockModels = [
  "mountain_A_grass",
  "mountain_B_grass_trees",
  "mountain_C_grass",
];
function decorationPath(c: Cell) {
  if (c.building) return buildingModels[c.building];
  const models =
    c.type === "forest"
      ? forestModels
      : c.type === "rock"
        ? rockModels
        : undefined;
  return models ? `decoration/nature/${models[c.variant ?? 0]}` : undefined;
}
export async function createIsland(cells: Cell[]) {
  const root = new T.Group(),
    loader = new GLTFLoader();
  const paths = new Set(["tiles/base/hex_grass"]);
  for (const c of cells) {
    const path = decorationPath(c);
    if (path && c.state === "visible") paths.add(path);
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
  for (const [path, model] of models)
    model.traverse((o) => {
      if (!(o instanceof T.Mesh)) return;
      o.castShadow = true;
      o.receiveShadow = true;
      // Убираем выбеленный жёлтый оттенок травы, сохраняя UV и палитру KayKit.
      if (path === "tiles/base/hex_grass") {
        o.material = (o.material as T.MeshStandardMaterial).clone();
        (o.material as T.MeshStandardMaterial).color.set(0xd2d6a0);
      }
    });
  const scale = HEX_RADIUS / (2 / Math.sqrt(3));
  const sandMaterial = new T.MeshStandardMaterial({
    color: 0xc7ae6a,
    roughness: 1,
  });
  const unknownMaterial = new T.MeshStandardMaterial({
    color: 0x75877a,
    roughness: 1,
  });
  const waterMaterial = new T.MeshStandardMaterial({
    color: 0x286c76,
    transparent: true,
    opacity: 0.25,
  });
  const hexGeometry = new T.CylinderGeometry(HEX_RADIUS, HEX_RADIUS, 1, 6);
  const land = new Set(
    cells.filter((c) => c.type !== "water").map((c) => `${c.q},${c.r}`),
  );
  const directions = [
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
  ];
  const picking: T.Object3D[] = [],
    tileRoots: T.Group[] = [];
  const vertices: number[] = [],
    shoreVertices: number[] = [];
  cells.forEach((cell, index) => {
    const { x, z } = axialToWorld(cell, HEX_RADIUS);
    const tile = new T.Group();
    tile.position.set(x, cell.height, z);
    root.add(tile);
    tileRoots.push(tile);
    if (cell.type === "water" || cell.state === "unexplored") {
      const mesh = new T.Mesh(
        hexGeometry,
        cell.type === "water" ? waterMaterial : unknownMaterial,
      );
      mesh.scale.y =
        cell.type === "water" ? 0.025 : Math.max(0.1, cell.height) + 0.15;
      mesh.position.y = -mesh.scale.y / 2;
      mesh.castShadow = cell.type !== "water";
      mesh.receiveShadow = true;
      tile.add(mesh);
    } else {
      const base = models.get("tiles/base/hex_grass")!.clone(true);
      base.scale.set(
        scale * 0.997,
        Math.max(0.1, cell.height) + 0.15,
        scale * 0.997,
      );
      tile.add(base);
      const path = decorationPath(cell);
      if (path) {
        const prop = models.get(path)!.clone(true);
        prop.scale.setScalar(
          scale *
            (cell.building
              ? cell.building === "townHall"
                ? 1.85
                : cell.building === "farm"
                  ? 0.9
                  : 1.25
              : cell.type === "rock"
                ? 0.9
                : 0.92),
        );
        prop.rotation.y = T.MathUtils.degToRad(cell.rotation ?? 0);
        tile.add(prop);
      }
    }
    if (cell.type !== "water") {
      // Песчаная полка под обрывом: видна только вдоль внешнего силуэта.
      const coastal = directions.some(
        ([q, r]) => !land.has(`${cell.q + q},${cell.r + r}`),
      );
      if (coastal) {
        const beach = new T.Mesh(hexGeometry, sandMaterial);
        beach.scale.set(1.14, 0.24, 1.14);
        beach.position.y = 0.12 - cell.height;
        beach.receiveShadow = true;
        tile.add(beach);
      }
      directions.forEach(([q, r]) => {
        if (land.has(`${cell.q + q},${cell.r + r}`)) return;
        const delta = axialToWorld({ q, r }, 1),
          angle = Math.atan2(delta.x, delta.z);
        const a = angle - Math.PI / 6,
          b = angle + Math.PI / 6;
        const point = (angle: number, factor: number) => [
          x + Math.sin(angle) * HEX_RADIUS * factor,
          0.018,
          z + Math.cos(angle) * HEX_RADIUS * factor,
        ];
        const p1 = point(a, 1.15),
          p2 = point(b, 1.15),
          p3 = point(b, 1.28),
          p4 = point(a, 1.28);
        shoreVertices.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
      });
    }
    tile.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.userData.cellIndex = index;
        picking.push(o);
      }
    });
    if (cell.state === "visible")
      for (let i = 0; i < 6; i++)
        for (const j of [i, i + 1]) {
          const angle = (j * Math.PI) / 3;
          vertices.push(
            x + Math.sin(angle) * HEX_RADIUS * 0.997,
            cell.height + 0.012,
            z + Math.cos(angle) * HEX_RADIUS * 0.997,
          );
        }
  });
  const edges = new T.BufferGeometry();
  edges.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  root.add(
    new T.LineSegments(
      edges,
      new T.LineBasicMaterial({
        color: 0x35491f,
        transparent: true,
        opacity: 0.28,
      }),
    ),
  );
  const shore = new T.BufferGeometry();
  shore.setAttribute(
    "position",
    new T.Float32BufferAttribute(shoreVertices, 3),
  );
  root.add(
    new T.Mesh(
      shore,
      new T.MeshBasicMaterial({
        color: 0x8ed0be,
        transparent: true,
        opacity: 0.28,
        side: T.DoubleSide,
        depthWrite: false,
      }),
    ),
  );
  root.updateMatrixWorld(true);
  const visualBounds = new T.Box3().setFromObject(root);
  const selection = new T.Mesh(
    new T.RingGeometry(HEX_RADIUS * 0.88, HEX_RADIUS * 0.98, 6),
    new T.MeshBasicMaterial({
      color: 0xffdf92,
      side: T.DoubleSide,
      transparent: true,
      opacity: 0.95,
    }),
  );
  selection.rotation.set(-Math.PI / 2, 0, Math.PI / 6);
  selection.visible = false;
  root.add(selection);
  return {
    root,
    picking,
    visualBounds,
    bounds: mapBounds(cells, HEX_RADIUS),
    select(index: number) {
      selection.position.copy(tileRoots[index].position);
      selection.position.y += 0.035;
      selection.visible = true;
    },
  };
}
