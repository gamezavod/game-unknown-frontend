import * as T from "three";
import { fogDensityAt, type FogRegion } from "./northern-fog";

/** Оптическая непрозрачность между камерой и точкой попадания, в мировых координатах. */
export function fogOpacityAlongRay(
  ray: T.Ray,
  distance: number,
  region: FogRegion,
  time = 0,
) {
  if (Math.abs(ray.direction.y) < 1e-6) return 0;
  const a = (region.topY - ray.origin.y) / ray.direction.y;
  const b = (region.bottomY - ray.origin.y) / ray.direction.y;
  const enter = Math.max(0, Math.min(a, b)),
    leave = Math.min(distance, Math.max(a, b));
  if (leave <= enter) return 0;
  const step = (leave - enter) / 16,
    point = new T.Vector3();
  let opticalDepth = 0;
  for (let i = 0; i < 16; i++)
    opticalDepth +=
      fogDensityAt(region, ray.at(enter + (i + 0.5) * step, point), time) *
      step;
  return 1 - Math.exp(-opticalDepth);
}
