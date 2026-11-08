import * as T from "three";
import { axialToWorld } from "./hex";
import type { Cell } from "./map-data";
import type { FogRegion } from "./northern-fog";
import { fogOpacityAlongRay } from "./fog-sampling";

/** Крупный изометрический кадр по видимой геометрии, с водой по краям. */
export function fitIslandCamera(
  camera: T.OrthographicCamera,
  bounds: T.Box3,
  width: number,
  height: number,
  framingPoints?: T.Vector3[],
) {
  const center = bounds.getCenter(new T.Vector3());
  const span = bounds.getSize(new T.Vector3()).length();
  camera.position
    .copy(center)
    .addScaledVector(new T.Vector3(0.14, 2.2, 1.4).normalize(), span * 3);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  // Общий AABB включает пустые углы вокруг неровного берега и отдаляет остров.
  const viewBounds = framingPoints?.length
    ? new T.Box3().setFromPoints(
        framingPoints.map((p) =>
          p.clone().applyMatrix4(camera.matrixWorldInverse),
        ),
      )
    : bounds.clone().applyMatrix4(camera.matrixWorldInverse);
  const size = viewBounds.getSize(new T.Vector3()),
    viewCenter = viewBounds.getCenter(new T.Vector3());
  const aspect = width / height;
  const halfHeight = Math.max(size.y / 0.72, size.x / (aspect * 0.965)) * 0.5;
  const verticalOffset = width < height ? halfHeight * 0.12 : halfHeight * 0.03;
  camera.left = viewCenter.x - halfHeight * aspect;
  camera.right = viewCenter.x + halfHeight * aspect;
  camera.top = viewCenter.y + halfHeight + verticalOffset;
  camera.bottom = viewCenter.y - halfHeight + verticalOffset;
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  return center;
}

export interface OpenIslandNavigation {
  bounds: T.Box3;
  shore: T.Vector3[];
}

/** Панорамирование привязано только к открытой суше, а не к скрытым клеткам. */
export function openIslandNavigation(
  cells: readonly Cell[],
  radius: number,
): OpenIslandNavigation {
  const shore: T.Vector3[] = [];
  for (const cell of cells) {
    if (cell.state !== "visible" || cell.type === "water") continue;
    const p = axialToWorld(cell, radius);
    for (let i = 0; i < 6; i++)
      shore.push(
        new T.Vector3(
          p.x + Math.sin((i * Math.PI) / 3) * radius * 1.08,
          0,
          p.z + Math.cos((i * Math.PI) / 3) * radius * 1.08,
        ),
      );
  }
  return {
    bounds: shore.length
      ? new T.Box3().setFromPoints(shore)
      : new T.Box3(new T.Vector3(-1, 0, -1), new T.Vector3(1, 0, 1)),
    shore,
  };
}

/** Оценка верхней пелены без изменения материала или геометрии тумана. */
export function fogScreenFraction(
  camera: T.OrthographicCamera,
  fog: FogRegion,
) {
  const direction = camera.getWorldDirection(new T.Vector3());
  let total = 0;
  for (const x of [-0.8, -0.4, 0, 0.4, 0.8]) {
    let clear = -1,
      hidden = 1;
    for (let i = 0; i < 9; i++) {
      const y = (clear + hidden) / 2,
        origin = new T.Vector3(x, y, -1).unproject(camera);
      const ray = new T.Ray(origin, direction),
        distance = Math.max(0, -origin.y / direction.y);
      if (fogOpacityAlongRay(ray, distance, fog) > 0.72) hidden = y;
      else clear = y;
    }
    total += (1 - (clear + hidden) / 2) / 2;
  }
  return total / 5;
}
export function southernWaterFraction(
  camera: T.OrthographicCamera,
  open: OpenIslandNavigation,
) {
  if (!open.shore.length) return 1;
  const visible = open.shore
    .map((p) => p.clone().project(camera))
    .filter((p) => Math.abs(p.x) <= 1.05);
  if (!visible.length) return 1;
  const bottom = Math.min(...visible.map((p) => p.y));
  return T.MathUtils.clamp((1 + bottom) / 2, 0, 1);
}

/** Короткий осмотр открытого острова. При слишком широком кадре диапазон схлопывается. */
export function cameraPanBounds(
  camera: T.OrthographicCamera,
  target: T.Vector3,
  open: OpenIslandNavigation,
  fog: FogRegion,
) {
  camera.updateMatrixWorld(true);
  const center = open.bounds.getCenter(new T.Vector3()),
    size = open.bounds.getSize(new T.Vector3());
  const viewWidth = (camera.right - camera.left) / camera.zoom;
  const halfTravel = Math.max(0, (size.x - viewWidth * 0.85) / 2);
  const perZ = Math.max(
    1e-6,
    (Math.abs(camera.matrixWorld.elements[6]) * camera.zoom) /
      (camera.top - camera.bottom),
  );
  const minX = center.x - halfTravel,
    maxX = center.x + halfTravel;
  const correctionX = T.MathUtils.clamp(target.x, minX, maxX) - target.x;
  const viewCamera = correctionX === 0 ? camera : camera.clone();
  if (correctionX !== 0) {
    viewCamera.position.x += correctionX;
    viewCamera.updateMatrixWorld(true);
  }
  const fogFraction = fogScreenFraction(viewCamera, fog),
    waterFraction = southernWaterFraction(viewCamera, open);
  let minZ = target.z + (fogFraction - 0.45) / perZ;
  let maxZ = target.z + (0.35 - waterFraction) / perZ;
  // Даже на крупном масштабе центр не уходит за открытую землю.
  minZ = Math.max(minZ, open.bounds.min.z + size.z * 0.12);
  maxZ = Math.min(maxZ, open.bounds.max.z - size.z * 0.12);
  const constrained = minZ > maxZ;
  if (constrained) {
    const middle = T.MathUtils.clamp(
      (minZ + maxZ) / 2,
      open.bounds.min.z,
      open.bounds.max.z,
    );
    minZ = maxZ = middle;
  }
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    constrained,
  };
}
