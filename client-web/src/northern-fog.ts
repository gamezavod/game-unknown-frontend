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

/** Объёмное рассеяние до видимой поверхности: дальний туман не перекрывает ближнюю крышу. */
export function createNorthernFog(
  renderer: T.WebGLRenderer,
  camera: T.OrthographicCamera,
  region: FogRegion,
) {
  const target = new T.WebGLRenderTarget(1, 1, {
    type: renderer.extensions.has("EXT_color_buffer_float")
      ? T.HalfFloatType
      : T.UnsignedByteType,
    depthTexture: new T.DepthTexture(1, 1, T.UnsignedIntType),
    samples: 2,
  });
  const day = new T.Color(0xb9d0ca),
    night = new T.Color(0x57798b);
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
  };
  const material = new T.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    vertexShader: `varying vec2 vUv;void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform sampler2D tScene,tDepth;
      uniform mat4 uCameraWorld,uProjectionInverse;uniform vec3 uColor;
      uniform float uFrontZ,uTransition,uBottomY,uTopY,uTime;
      vec3 world(float depth){vec4 p=uProjectionInverse*vec4(vUv*2.-1.,depth*2.-1.,1.);return (uCameraWorld*(p/p.w)).xyz;}
      float density(vec3 p){
        float edge=uFrontZ+sin(p.x*.28)*.85+sin(p.x*.71+.8)*.45+sin(p.x*1.4+uTime*.035)*.18;
        float north=1.-smoothstep(edge-uTransition,edge,p.z);
        float height=smoothstep(uBottomY,uBottomY+.6,p.y)*(1.-smoothstep(uTopY-1.,uTopY,p.y));
        return north*height*.95;
      }
      void main(){
        vec3 origin=world(0.);vec3 surface=world(texture2D(tDepth,vUv).x);
        vec3 ray=normalize(world(1.)-origin);
        float enter=max(0.,(uTopY-origin.y)/ray.y);
        float leave=min((uBottomY-origin.y)/ray.y,dot(surface-origin,ray));
        float stepSize=max(0.,leave-enter)/16.;float opticalDepth=0.;
        float firstZ=(origin+ray*enter).z,lastZ=(origin+ray*leave).z;
        if(stepSize>0. && min(firstZ,lastZ)<=uFrontZ+1.5){
          if(max(firstZ,lastZ)<uFrontZ-uTransition-1.5) opticalDepth=max(0.,leave-enter-1.2)*.95;
          else for(int i=0;i<16;i++){vec3 p=origin+ray*(enter+(float(i)+.5)*stepSize);opticalDepth+=density(p)*stepSize;}
        }
        float fog=1.-exp(-opticalDepth);
        gl_FragColor=vec4(mix(texture2D(tScene,vUv).rgb,uColor,fog),1.);
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
      material.dispose();
      quad.geometry.dispose();
    },
  };
}
