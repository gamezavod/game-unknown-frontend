import * as T from "three";
import { axialToWorld } from "./hex";
import type { Cell } from "./map-data";

export interface FogRegion {
  frontZ: number;
  transition: number;
  bottomY: number;
  topY: number;
  opaqueZ: number;
}
/** Единый северный объём, привязанный к координатам карты. */
export function northernFogRegion(
  cells: Cell[],
  radius: number,
  span: number,
): FogRegion {
  const positions = cells
    .filter((c) => c.type !== "water")
    .map((c) => axialToWorld(c, radius));
  const minZ = Math.min(...positions.map((p) => p.z));
  const maxZ = Math.max(...positions.map((p) => p.z));
  const frontZ = minZ + (maxZ - minZ) * 0.29;
  const transition = span * 0.14;
  return {
    frontZ,
    transition,
    bottomY: -0.9,
    topY: Math.max(...cells.map((c) => c.height)) + span * 0.3,
    opaqueZ: frontZ - transition - 1.7,
  };
}
export function fogFrontAtX(region: FogRegion, x: number, time = 0) {
  return (
    region.frontZ +
    Math.sin(x * 0.28) * 0.85 +
    Math.sin(x * 0.71 + 0.8) * 0.45 +
    Math.sin(x * 1.4 + time * 0.035) * 0.18
  );
}
export function fogDensityAt(region: FogRegion, point: T.Vector3, time = 0) {
  const t = T.MathUtils.clamp(
    (fogFrontAtX(region, point.x, time) - point.z) / region.transition,
    0,
    1,
  );
  const vertical =
    T.MathUtils.smoothstep(point.y, region.bottomY, region.bottomY + 0.6) *
    (1 - T.MathUtils.smoothstep(point.y, region.topY - 1, region.topY));
  return t * t * (3 - 2 * t) * vertical * 0.95;
}

function visibilityMask(cells: Cell[]) {
  const minQ = Math.min(...cells.map((cell) => cell.q));
  const minR = Math.min(...cells.map((cell) => cell.r));
  const width = Math.max(...cells.map((cell) => cell.q)) - minQ + 1;
  const height = Math.max(...cells.map((cell) => cell.r)) - minR + 1;
  const pixels = new Uint8Array(width * height);
  pixels.fill(255);
  for (const cell of cells) {
    pixels[(cell.r - minR) * width + cell.q - minQ] = cell.state === "visible" ? 0 : 165;
  }
  const texture = new T.DataTexture(pixels, width, height, T.RedFormat);
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return { texture, bounds: new T.Vector4(minQ, minR, width, height) };
}

/** Дымка по глубине сцены сохраняет передние крыши и показывает силуэты на границе карты. */
export function createNorthernFog(
  renderer: T.WebGLRenderer,
  camera: T.OrthographicCamera,
  region: FogRegion,
  map?: { cells: Cell[]; radius: number; southRow: number },
) {
  const mask = map && visibilityMask(map.cells);
  const target = new T.WebGLRenderTarget(1, 1, {
    type: renderer.extensions.has("EXT_color_buffer_float")
      ? T.HalfFloatType
      : T.UnsignedByteType,
    depthTexture: new T.DepthTexture(1, 1, T.UnsignedIntType),
    samples: 2,
  });
  const day = new T.Color(map ? 0xd0e3d9 : 0xb9d0ca),
    night = new T.Color(map ? 0x8198a6 : 0x57798b);
  const uniforms = {
    tScene: { value: target.texture },
    tDepth: { value: target.depthTexture },
    uCameraWorld: { value: camera.matrixWorld },
    uProjectionInverse: { value: camera.projectionMatrixInverse },
    uFrontZ: { value: region.frontZ },
    uTransition: { value: region.transition },
    uBottomY: { value: region.bottomY },
    uTopY: { value: region.topY },
    uColor: { value: day.clone() },
    uTime: { value: 0 },
    tVisibility: { value: mask?.texture ?? null },
    uMaskBounds: { value: mask?.bounds },
    uHexRadius: { value: map?.radius },
    uSouthRow: { value: map?.southRow },
  };
  const material = new T.ShaderMaterial({
    uniforms,
    defines: mask ? { MAP_FOG: 1 } : {},
    depthTest: false,
    depthWrite: false,
    vertexShader: `varying vec2 vUv;void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform sampler2D tScene,tDepth;
      uniform mat4 uCameraWorld,uProjectionInverse;uniform vec3 uColor;
      uniform float uFrontZ,uTransition,uBottomY,uTopY,uTime;
      #ifdef MAP_FOG
        uniform sampler2D tVisibility;
        uniform vec4 uMaskBounds;
        uniform float uHexRadius, uSouthRow;
        vec2 hexAt(vec2 axial) {
          vec3 cube=vec3(axial,-axial.x-axial.y);
          vec3 cell=floor(cube+.5);
          vec3 delta=abs(cell-cube);
          if(delta.x>delta.y && delta.x>delta.z) cell.x=-cell.y-cell.z;
          else if(delta.y>delta.z) cell.y=-cell.x-cell.z;
          return cell.xy;
        }
        const vec2 HEX_STEPS[6] = vec2[6](
          vec2(1.,0.), vec2(0.,1.), vec2(-1.,1.),
          vec2(-1.,0.), vec2(0.,-1.), vec2(1.,-1.)
        );
        float cellCoverage(vec2 cell, float ambient) {
          vec2 index=cell-uMaskBounds.xy;
          if(all(greaterThanEqual(index,vec2(0.))) && all(lessThan(index,uMaskBounds.zw))){
            float coverage=texture2D(tVisibility,(index+.5)/uMaskBounds.zw).r;
            if(coverage<.99) return coverage;
          }
          return ambient;
        }
        float coverageWeight(vec2 delta, float spread) {
          vec2 local=vec2(1.7320508*(delta.x+.5*delta.y),1.5*delta.y);
          return 1.-smoothstep(.19,spread,length(local));
        }
        float mapCoverage(vec3 p) {
          float r=p.z/(1.5*uHexRadius);
          vec2 axial=vec2(p.x/(1.7320508*uHexRadius)-.5*r,r);
          vec2 cell=hexAt(axial);
          float drift=sin(p.x*.46+p.z*.52+uTime*.14)*sin(p.x*.19-p.z*.31-uTime*.08);
          float spread=1.38+drift*.12;
          float coast=uSouthRow+sin(p.x*.31+uTime*.09)*.48;
          float ambient=1.-smoothstep(coast-2.7,coast-.6,r);
          float total=coverageWeight(axial-cell,spread);
          float coverage=cellCoverage(cell,ambient)*total;
          for(int i=0;i<6;i++){
            vec2 neighbor=cell+HEX_STEPS[i];
            float weight=coverageWeight(axial-neighbor,spread);
            coverage+=cellCoverage(neighbor,ambient)*weight;
            total+=weight;
          }
          // Дымка над водой уходит к южному краю мягче, чем над силуэтами суши.
          float sea=1.-smoothstep(coast-3.5,coast+.45,r);
          return smoothstep(0.,1.,coverage/total)*mix(sea,1.,smoothstep(.12,.65,p.y));
        }
      #endif
      vec3 world(float depth){vec4 p=uProjectionInverse*vec4(vUv*2.-1.,depth*2.-1.,1.);return (uCameraWorld*(p/p.w)).xyz;}
      #ifndef MAP_FOG
        float density(vec3 p){
          float edge=uFrontZ+sin(p.x*.28)*.85+sin(p.x*.71+.8)*.45+sin(p.x*1.4+uTime*.035)*.18;
          float north=1.-smoothstep(edge-uTransition,edge,p.z);
          float height=smoothstep(uBottomY,uBottomY+.6,p.y)*(1.-smoothstep(uTopY-1.,uTopY,p.y));
          return north*height*.95;
        }
      #endif
      void main(){
        vec3 origin=world(0.);
        float depth=texture2D(tDepth,vUv).x;
        vec3 surface=world(depth);
        vec3 ray=normalize(world(1.)-origin);
        #ifdef MAP_FOG
          // При отсутствии поверхности продолжаем дымку от уровня моря в фон.
          if(depth>=.999999) surface=origin+ray*(-origin.y/ray.y);
          float fog=mapCoverage(surface);
          float cloud=sin(surface.x*.22+surface.z*.34+uTime*.08)*sin(surface.x*.51-surface.z*.13-uTime*.11);
          vec3 color=uColor*(1.+.035*cloud);
        #else
          float enter=max(0.,(uTopY-origin.y)/ray.y);
          float leave=min((uBottomY-origin.y)/ray.y,dot(surface-origin,ray));
          float stepSize=max(0.,leave-enter)/16.;float opticalDepth=0.;
          float firstZ=(origin+ray*enter).z,lastZ=(origin+ray*leave).z;
          if(stepSize>0. && min(firstZ,lastZ)<=uFrontZ+1.5){
            if(max(firstZ,lastZ)<uFrontZ-uTransition-1.5) opticalDepth=max(0.,leave-enter-1.2)*.95;
            else for(int i=0;i<16;i++){vec3 p=origin+ray*(enter+(float(i)+.5)*stepSize);opticalDepth+=density(p)*stepSize;}
          }
          float fog=1.-exp(-opticalDepth);
          vec3 color=uColor;
        #endif
        gl_FragColor=vec4(mix(texture2D(tScene,vUv).rgb,color,fog),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const scene = new T.Scene();
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  const size = new T.Vector2();
  return {
    region,
    update(time: number, blend: number) {
      uniforms.uTime.value = time;
      uniforms.uColor.value.copy(day).lerp(night, blend);
    },
    resize() {
      renderer.getDrawingBufferSize(size);
      target.setSize(size.x, size.y);
    },
    render(worldScene: T.Scene) {
      renderer.setRenderTarget(target);
      renderer.render(worldScene, camera);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    dispose() {
      target.dispose();
      mask?.texture.dispose();
      material.dispose();
      quad.geometry.dispose();
    },
  };
}
