import * as T from "three";

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
