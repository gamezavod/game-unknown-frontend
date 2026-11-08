import * as T from "three";
import { axialToWorld } from "./hex";
import type { Cell } from "./map-data";
import { HEX_RADIUS } from "./island";
import { createNorthernFog, northernFogRegion } from "./northern-fog";

/** Море и визуальный туман читают ту же карту, что и суша; скрытых координат острова здесь нет. */
export function createAtmosphere(
  cells: Cell[],
  center: T.Vector3,
  span: number,
  camera: T.OrthographicCamera,
  renderer: T.WebGLRenderer,
) {
  const root = new T.Group();
  const land = cells
    .filter((c) => c.type !== "water")
    .map((c) => axialToWorld(c, HEX_RADIUS));
  const seaGeometry = new T.PlaneGeometry(span * 8, span * 8, 160, 160);
  seaGeometry.rotateX(-Math.PI / 2);
  seaGeometry.translate(center.x, -0.03, center.z);
  const positions = seaGeometry.getAttribute("position"),
    colors: number[] = [];
  const deep = new T.Color(0x0b4c62),
    shallow = new T.Color(0x4fa79c),
    color = new T.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      z = positions.getZ(i);
    const distance = Math.min(...land.map((p) => Math.hypot(x - p.x, z - p.z)));
    const blend = Math.exp(-Math.max(0, distance - HEX_RADIUS) * 0.8);
    color.copy(deep).lerp(shallow, blend * 0.9);
    colors.push(color.r, color.g, color.b);
  }
  seaGeometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  const seaMaterial = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0,
  });
  const sea = new T.Mesh(seaGeometry, seaMaterial);
  sea.receiveShadow = true;
  root.add(sea);
  const glints: number[] = [];
  for (let i = 0; i < 1500; i++) {
    const x = center.x + Math.sin(i * 127.1) * span * 3,
      z = center.z + Math.sin(i * 311.7) * span * 3;
    glints.push(x, 0.002, z, x + 0.08 + (i % 5) * 0.06, 0.002, z);
  }
  const wavesGeometry = new T.BufferGeometry();
  wavesGeometry.setAttribute(
    "position",
    new T.Float32BufferAttribute(glints, 3),
  );
  const wavesMaterial = new T.LineBasicMaterial({
    color: 0x85bfb8,
    transparent: true,
    opacity: 0.14,
  });
  const waves = new T.LineSegments(wavesGeometry, wavesMaterial);
  root.add(waves);
  const fog = createNorthernFog(
    renderer,
    camera,
    northernFogRegion(cells, HEX_RADIUS, span),
  );
  // Лёгкие движущиеся полосы ряби поверх пространственного градиента глубины.
  const waterTime = { value: 0 };
  seaMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterTime;
    shader.vertexShader =
      "varying vec2 vSea;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvSea=position.xz;",
      );
    shader.fragmentShader =
      "uniform float uWaterTime; varying vec2 vSea;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float waterRipple=sin(vSea.x*2.7+vSea.y*.5+uWaterTime*.45)*sin(vSea.y*1.6-uWaterTime*.28);
      diffuseColor.rgb*=1.+waterRipple*.025;`,
      );
  };
  return {
    root,
    fog,
    update(time: number, night: number) {
      waves.position.x = Math.sin(time * 0.18) * 0.12;
      wavesMaterial.opacity = T.MathUtils.lerp(0.17, 0.09, night);
      fog.update(time, night);
      waterTime.value = time;
    },
  };
}
