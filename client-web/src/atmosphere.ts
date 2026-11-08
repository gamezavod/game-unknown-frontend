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
  const deep = new T.Color(0x165a82),
    shallow = new T.Color(0x48a4ab),
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
  // Несколько перекрывающихся мягких объёмов над каждой неисследованной клеткой.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!,
    gradient = ctx.createRadialGradient(64, 64, 5, 64, 64, 64);
  gradient.addColorStop(0, "rgba(220,232,211,1)");
  gradient.addColorStop(0.4, "rgba(220,232,211,.94)");
  gradient.addColorStop(0.75, "rgba(220,232,211,.42)");
  gradient.addColorStop(1, "rgba(220,232,211,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const mistMaterial = new T.SpriteMaterial({
    map: new T.CanvasTexture(canvas),
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    depthTest: false,
    color: 0xe4ead9,
  });
  const clouds: { sprite: T.Sprite; baseY: number; phase: number }[] = [];
  for (const c of cells) {
    if (c.state !== "unexplored") continue;
    const p = axialToWorld(c, HEX_RADIUS);
    for (let i = 0; i < 3; i++) {
      const cloud = new T.Sprite(mistMaterial);
      const baseY = c.height + 0.12 + i * 0.35;
      cloud.position.set(
        p.x + Math.sin(i * 2.4 + c.q) * 0.45,
        baseY,
        p.z + Math.cos(i * 2.4 + c.r) * 0.4,
      );
      cloud.scale.set(HEX_RADIUS * 3.4, HEX_RADIUS * 2.5, 1);
      root.add(cloud);
      clouds.push({ sprite: cloud, baseY, phase: c.q * 0.7 + c.r * 0.4 + i });
    }
  }
  const dayMist = new T.Color(0xe4ead9),
    nightMist = new T.Color(0x6b91a2);
  return {
    root,
    update(time: number, night: number) {
      waves.position.x = Math.sin(time * 0.18) * 0.12;
      wavesMaterial.opacity = T.MathUtils.lerp(0.17, 0.09, night);
      mistMaterial.color.copy(dayMist).lerp(nightMist, night);
      mistMaterial.opacity = T.MathUtils.lerp(0.72, 0.68, night);
      for (const c of clouds)
        c.sprite.position.y = c.baseY + Math.sin(time * 0.25 + c.phase) * 0.07;
    },
  };
}
