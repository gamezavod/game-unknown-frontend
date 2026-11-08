import * as T from "three";
import { axialToWorld } from "./hex";
import type { Cell } from "./map-data";
import { HEX_RADIUS } from "./island";

/** Море и визуальный туман читают ту же карту, что и суша; скрытых координат острова здесь нет. */
export function createAtmosphere(
  cells: Cell[],
  center: T.Vector3,
  span: number,
  camera: T.OrthographicCamera,
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
    shallow = new T.Color(0x3b9b98),
    color = new T.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      z = positions.getZ(i);
    const distance = Math.min(...land.map((p) => Math.hypot(x - p.x, z - p.z)));
    const blend = Math.exp(-Math.max(0, distance - HEX_RADIUS) * 0.6);
    color.copy(deep).lerp(shallow, blend * 0.85);
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
  // Светлая атмосферная перспектива по глубине сцены. Луч экранного пикселя
  // пересекается с землёй; дымка следует карте при перемещении и масштабировании.
  const hidden = cells
    .filter((c) => c.state === "unexplored")
    .map((c) => axialToWorld(c, HEX_RADIUS));
  const farZ = hidden.length
    ? Math.max(...hidden.map((p) => p.z))
    : center.z - span * 0.35;
  const dayMist = new T.Color(0xb9d0ca),
    nightMist = new T.Color(0x50778b);
  const fogUniforms = {
    uColor: { value: dayMist.clone() },
    uTime: { value: 0 },
    uNight: { value: 0 },
    uCameraWorld: { value: camera.matrixWorld },
    uProjectionInverse: { value: camera.projectionMatrixInverse },
    uGroundY: { value: cells.reduce((s, c) => s + c.height, 0) / cells.length },
    uClearZ: { value: farZ + span * 0.28 },
    uFarZ: { value: farZ - span * 0.2 },
  };
  const fogMaterial = new T.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: fogUniforms,
    vertexShader: `varying vec2 vNdc;
      void main(){vNdc=position.xy;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `uniform mat4 uCameraWorld;uniform mat4 uProjectionInverse;
      uniform vec3 uColor;uniform float uGroundY,uClearZ,uFarZ,uTime,uNight;varying vec2 vNdc;
      void main(){
        vec4 view=uProjectionInverse*vec4(vNdc,0.,1.);view/=view.w;
        vec3 origin=(uCameraWorld*view).xyz;
        vec3 direction=(uCameraWorld*vec4(0.,0.,-1.,0.)).xyz;
        vec3 ground=origin+direction*((uGroundY-origin.y)/direction.y);
        float drift=sin(ground.x*.22+uTime*.04)*.3+sin(ground.x*.55-ground.z*.18)*.15;
        float density=1.-smoothstep(uFarZ,uClearZ,ground.z+drift);
        gl_FragColor=vec4(uColor,density*mix(.97,.88,uNight));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const haze = new T.Mesh(new T.PlaneGeometry(2, 2), fogMaterial);
  haze.frustumCulled = false;
  haze.renderOrder = 100;
  root.add(haze);
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
      diffuseColor.rgb*=1.+waterRipple*.035;`,
      );
  };
  return {
    root,
    update(time: number, night: number) {
      waves.position.x = Math.sin(time * 0.18) * 0.12;
      wavesMaterial.opacity = T.MathUtils.lerp(0.17, 0.09, night);
      fogUniforms.uColor.value.copy(dayMist).lerp(nightMist, night);
      fogUniforms.uTime.value = time;
      fogUniforms.uNight.value = night;
      waterTime.value = time;
    },
  };
}
