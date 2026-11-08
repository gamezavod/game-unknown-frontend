import * as T from "three";
import { axialToWorld } from "./hex";
import type { Cell } from "./map-data";
import { HEX_RADIUS } from "./island";

/** Море и визуальный туман читают ту же карту, что и суша; скрытых координат острова здесь нет. */
export function createAtmosphere(
  cells: Cell[],
  center: T.Vector3,
  span: number,
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
  // Одна полупрозрачная пелена: маски соседних клеток объединяются максимумом,
  // поэтому перекрытие не превращается в непрозрачную белую «вату».
  const hidden = cells
    .filter((c) => c.state === "unexplored")
    .map((c) => axialToWorld(c, HEX_RADIUS));
  const dayMist = new T.Color(0xb5c6b9),
    nightMist = new T.Color(0x668c9c);
  const fogUniforms = {
    uColor: { value: dayMist.clone() },
    uTime: { value: 0 },
    uNight: { value: 0 },
    uCells: { value: hidden.map((p) => new T.Vector2(p.x, p.z)) },
  };
  if (hidden.length) {
    const fogMaterial = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      uniforms: fogUniforms,
      vertexShader: `varying vec2 vGround;
        void main(){vec4 world=modelMatrix*vec4(position,1.);vGround=world.xz;gl_Position=projectionMatrix*viewMatrix*world;}`,
      fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uNight;
        uniform vec2 uCells[${hidden.length}];varying vec2 vGround;
        void main(){float density=0.;
          for(int i=0;i<${hidden.length};i++){
            vec2 d=vGround-uCells[i];d.x+=sin(vGround.y*.6+uTime*.08)*.2;
            density=max(density,exp(-dot(d,d)/12.));
          }
          float ripple=.92+.08*sin(vGround.x*.7+vGround.y*.8+uTime*.12);
          gl_FragColor=vec4(uColor,density*ripple*mix(.58,.45,uNight));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const fogPlane = new T.Mesh(
      new T.PlaneGeometry(span * 2, span * 2),
      fogMaterial,
    );
    fogPlane.rotation.x = -Math.PI / 2;
    fogPlane.position.set(
      center.x,
      Math.max(...cells.map((c) => c.height)) + 0.55,
      center.z,
    );
    fogPlane.renderOrder = 2;
    root.add(fogPlane);
  }
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
