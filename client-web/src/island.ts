import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { axialToWorld, hexDirections } from "./hex";
import { canSelectCell } from "./selection";
import { forestLayout, mountainLayout } from "./scenery";
import { isWaterTerrain, mapBounds, type Cell, type Building } from "./map-data";

export const HEX_RADIUS = 1.25;
const buildingModels: Record<Building, string> = {
  townHall: "buildings/red/building_church_red",
  home: "buildings/red/building_home_A_red",
  lumbermill: "buildings/red/building_lumbermill_red",
  warehouse: "buildings/red/building_market_red",
  farm: "buildings/neutral/building_grain",
};
const rockModels = [
  "mountain_A_grass",
  "mountain_B_grass_trees",
  "mountain_C_grass",
];
const loader = new GLTFLoader();
const modelCache = new Map<string, Promise<T.Group>>();

function loadModel(path: string) {
  let cached = modelCache.get(path);
  if (!cached) {
    cached = loader.loadAsync(`${import.meta.env.BASE_URL}kaykit/${path}.gltf`).then(({ scene }) => {
      scene.traverse((object) => {
        if (!(object instanceof T.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        if (path === "tiles/base/hex_grass") {
          object.material = (object.material as T.MeshStandardMaterial).clone();
          (object.material as T.MeshStandardMaterial).color.set(0xd2d6a0);
        }
      });
      return scene;
    }).catch((error) => {
      modelCache.delete(path);
      throw error;
    });
    modelCache.set(path, cached);
  }
  return cached;
}
function decorationPath(c: Cell) {
  if (c.building) return buildingModels[c.building];
  return c.type === "rock"
    ? `decoration/nature/${rockModels[c.variant ?? 0]}`
    : undefined;
}
export async function createIsland(cells: Cell[]) {
  const root = new T.Group();
  const mountains = mountainLayout(cells, HEX_RADIUS);
  const paths = new Set([
    "tiles/base/hex_grass",
    "decoration/nature/rock_single_A",
    "decoration/nature/rock_single_B",
    "decoration/nature/tree_single_A",
    "decoration/nature/tree_single_B",
  ]);
  for (const c of cells) {
    const path = decorationPath(c);
    if (path && c.state === "visible") paths.add(path);
  }
  const models = new Map(await Promise.all([...paths].map(async (path) => [path, await loadModel(path)] as const)));
  const scale = HEX_RADIUS / (2 / Math.sqrt(3));
  const settlement = cells
    .filter((c) => c.building)
    .map((c) => axialToWorld(c, HEX_RADIUS));
  const settlementCenter = new T.Vector2(
    settlement.reduce((n, p) => n + p.x, 0) / Math.max(1, settlement.length),
    settlement.reduce((n, p) => n + p.z, 0) / Math.max(1, settlement.length),
  );
  const basaltMaterial = new T.MeshStandardMaterial({
    color: 0x52615a,
    emissive: 0x26362e,
    emissiveIntensity: 0.18,
    roughness: 1,
    flatShading: true,
  });
  const stratumMaterial = new T.MeshStandardMaterial({
    color: 0xb19c6b,
    roughness: 1,
  });
  const rockMaterial = new T.MeshStandardMaterial({
    color: 0x485650,
    roughness: 1,
    flatShading: true,
  });
  const clayMaterials = [0x92764e, 0x9c8257, 0x85734f].map(
    (color) =>
      new T.MeshStandardMaterial({
        color,
        roughness: 1,
        emissive: 0x30291c,
        emissiveIntensity: 0.2,
      }),
  );
  const sandMaterial = new T.MeshStandardMaterial({
    color: 0xc7ae6a,
    roughness: 1,
  });
  const unknownMaterial = new T.MeshStandardMaterial({
    color: 0x80914f,
    roughness: 1,
  });
  const waterMaterial = new T.MeshStandardMaterial({
    color: 0x286c76,
    transparent: true,
    opacity: 0.25,
  });
  const riverMaterial = new T.MeshStandardMaterial({ color: 0x3e9dac, roughness: 0.72 });
  const fogMaterial = new T.MeshStandardMaterial({ color: 0xc0d7d4, transparent: true, opacity: 0.58, roughness: 1 });
  const hexGeometry = new T.CylinderGeometry(HEX_RADIUS, HEX_RADIUS, 1, 6);
  const rockGeometry = new T.CylinderGeometry(
    HEX_RADIUS * 0.995,
    HEX_RADIUS * 0.96,
    1,
    6,
  );
  const land = new Set(
    cells.filter((c) => !isWaterTerrain(c.type) && c.type !== "fog").map((c) => `${c.q},${c.r}`),
  );
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
    const water = isWaterTerrain(cell.type);
    if (water || cell.state === "unexplored") {
      const material = cell.type === "river" ? riverMaterial : water ? waterMaterial : cell.type === "fog" ? fogMaterial : unknownMaterial;
      const mesh = new T.Mesh(
        hexGeometry,
        material,
      );
      mesh.scale.set(cell.type === "fog" ? 0.94 : 1, water || cell.type === "fog" ? 0.025 : 0.26, cell.type === "fog" ? 0.94 : 1);
      mesh.position.y = -mesh.scale.y / 2;
      mesh.castShadow = !water && cell.type !== "fog";
      mesh.receiveShadow = true;
      tile.add(mesh);
    } else {
      const base = models.get("tiles/base/hex_grass")!.clone(true);
      base.scale.set(scale * 0.997, 0.26, scale * 0.997);
      tile.add(base);
      if (cell.sapling) {
        const tree = models.get("decoration/nature/tree_single_A")!.clone(true);
        tree.scale.setScalar(scale * 0.33);
        tile.add(tree);
      } else if (cell.type === "forest" && !cell.building) {
        for (const tree of forestLayout(cell)) {
          const model = models
            .get(`decoration/nature/tree_single_${tree.species}`)!
            .clone(true);
          model.position.set(tree.x, 0, tree.z);
          model.scale.setScalar(scale * tree.scale);
          model.rotation.y = tree.rotation;
          tile.add(model);
        }
      } else {
        const path = decorationPath(cell);
        if (path) {
          const prop = models.get(path)!.clone(true),
            mountain = mountains.get(`${cell.q},${cell.r}`);
          const propScale = cell.building
            ? cell.building === "townHall"
              ? 2.3
              : cell.building === "farm"
                ? 1
                : 1.65
            : (mountain?.scale ?? 1);
          prop.scale.setScalar(scale * propScale);
          prop.rotation.y =
            mountain?.rotation ?? T.MathUtils.degToRad(cell.rotation ?? 0);
          if (mountain) prop.position.set(mountain.x, 0, mountain.z);
          else if (cell.building)
            prop.position.set(
              (x - settlementCenter.x) * 0.06,
              0,
              (z - settlementCenter.y) * 0.06,
            );
          tile.add(prop);
        }
      }
    }
    if (!water && cell.type !== "fog") {
      // Тёмный скальный фундамент и два слоя грунта под тонкой травяной шапкой.
      const layer = (
        bottom: number,
        top: number,
        radius: number,
        material: T.Material,
      ) => {
        const mesh = new T.Mesh(
          material === basaltMaterial ? rockGeometry : hexGeometry,
          material,
        );
        mesh.scale.set(radius, Math.max(0.05, top - bottom), radius);
        mesh.position.y = (top + bottom) / 2 - cell.height;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        tile.add(mesh);
      };
      const seed = Math.abs(cell.q * 19 + cell.r * 43);
      const rockTop = cell.height * (0.22 + (seed % 3) * 0.035);
      layer(-0.22, rockTop, 1.005, basaltMaterial);
      layer(
        rockTop - 0.03,
        cell.height - 0.24,
        0.998,
        clayMaterials[seed % clayMaterials.length],
      );
      layer(
        cell.height * (0.51 + (seed % 3) * 0.025),
        cell.height * (0.58 + (seed % 3) * 0.025),
        1.001,
        stratumMaterial,
      );
      const coastal = hexDirections.some(
        ([q, r]) => !land.has(`${cell.q + q},${cell.r + r}`),
      );
      if (coastal) {
        layer(-0.08, 0.12, 1.06, sandMaterial);
        // Крупные камни у открытых граней, а не одинаковое кольцо вокруг каждого гекса.
        hexDirections.forEach(([q, r], edge) => {
          if (
            land.has(`${cell.q + q},${cell.r + r}`) ||
            (cell.q + cell.r + edge) % 3 === 0
          )
            return;
          const d = axialToWorld({ q, r }, 1),
            angle = Math.atan2(d.x, d.z);
          const rock = models
            .get(`decoration/nature/rock_single_${edge % 2 ? "A" : "B"}`)!
            .clone(true);
          rock.position.set(
            Math.sin(angle) * HEX_RADIUS * 1.06,
            0.12 - cell.height,
            Math.cos(angle) * HEX_RADIUS * 1.06,
          );
          const stoneSize = 2.5 + ((seed + edge * 7) % 5) * 0.55;
          rock.scale.set(
            stoneSize,
            stoneSize * (0.8 + (edge % 3) * 0.2),
            stoneSize * 0.9,
          );
          rock.rotation.y = angle + seed * 0.07;
          rock.traverse((o) => {
            if (o instanceof T.Mesh) {
              o.material = rockMaterial;
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          tile.add(rock);
        });
      }
      hexDirections.forEach(([q, r]) => {
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
        const p1 = point(a, 1.07),
          p2 = point(b, 1.07),
          p3 = point(b, 1.14),
          p4 = point(a, 1.14);
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
        opacity: 0.12,
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
        opacity: 0.12,
        side: T.DoubleSide,
        depthWrite: false,
      }),
    ),
  );
  root.updateMatrixWorld(true);
  const visualBounds = new T.Box3().setFromObject(root);
  const framingPoints: T.Vector3[] = [];
  root.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    const positions = o.geometry.getAttribute("position");
    if (positions.count < 2000) {
      for (let i = 0; i < positions.count; i++)
        framingPoints.push(
          new T.Vector3()
            .fromBufferAttribute(positions, i)
            .applyMatrix4(o.matrixWorld),
        );
    } else {
      o.geometry.computeBoundingBox();
      const box = o.geometry.boundingBox!;
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z])
            framingPoints.push(
              new T.Vector3(x, y, z).applyMatrix4(o.matrixWorld),
            );
    }
  });
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
    framingPoints,
    bounds: mapBounds(cells, HEX_RADIUS),
    select(index: number) {
      if (!canSelectCell(cells, index) && cells[index]?.type !== "fog") return false;
      selection.position.copy(tileRoots[index].position);
      selection.position.y += 0.035;
      selection.visible = true;
      return true;
    },
    clearSelection() {
      selection.visible = false;
    },
    dispose() {
      const geometries = new Set<T.BufferGeometry>();
      const materials = new Set<T.Material>();
      root.traverse((object) => {
        if (!(object instanceof T.Mesh || object instanceof T.LineSegments)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      });
      for (const model of models.values()) model.traverse((object) => {
        if (!(object instanceof T.Mesh)) return;
        geometries.delete(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.delete(material);
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}
