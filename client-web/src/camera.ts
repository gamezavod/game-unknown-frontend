import * as T from "three";

/** Вписывает фактический 3D-объём в свободное поле экрана, включая высокие модели. */
export function fitIslandCamera(
  camera: T.OrthographicCamera,
  bounds: T.Box3,
  width: number,
  height: number,
) {
  const center = bounds.getCenter(new T.Vector3());
  const span = bounds.getSize(new T.Vector3()).length();
  camera.position
    .copy(center)
    .addScaledVector(new T.Vector3(0.12, 1.45, 1.75).normalize(), span * 3);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const viewBounds = bounds.clone().applyMatrix4(camera.matrixWorldInverse);
  const size = viewBounds.getSize(new T.Vector3());
  const aspect = width / height;
  // Вокруг острова остаётся вода; верхняя и нижняя панели не перекрывают сушу.
  const safeHeight = Math.max(
    height * 0.54,
    height - (width < 600 ? 220 : 200),
  );
  const halfHeight =
    Math.max(size.y / (safeHeight / height), size.x / (aspect * 0.94)) * 0.52;
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  // На коротком портретном экране оставляем воду и над выбранной карточкой.
  const verticalOffset = width < 600 && height < 650 ? -halfHeight * .13 : 0;
  camera.top = halfHeight + verticalOffset;
  camera.bottom = -halfHeight + verticalOffset;
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  return center;
}
