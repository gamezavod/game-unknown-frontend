import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import cells from './data/cells.json';
import { axialToWorld } from './hex';
import './style.css';
const names: Record<string,string> = {grass:'Трава',forest:'Лес',rock:'Камень',coast:'Побережье'};
const colors: Record<string,number> = {grass:0x98b77c,forest:0x769768,rock:0xaaa99a,coast:0xd4c393};
const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
function start() {
 const renderer = new T.WebGLRenderer({canvas,antialias:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.shadowMap.enabled=true;
 renderer.shadowMap.type=T.PCFSoftShadowMap;
 const scene=new T.Scene(); scene.background=new T.Color(0xdce9ed); scene.fog=new T.Fog(0xdce9ed,25,65);
 const camera=new T.PerspectiveCamera(40,1,.1,100);
 const controls=new OrbitControls(camera,canvas); controls.enableDamping=true; controls.enablePan=false;
 controls.minDistance=7; controls.maxDistance=23; controls.minPolarAngle=.15; controls.maxPolarAngle=Math.PI/2.35;
 function reset(){camera.position.set(9,11,14);controls.target.set(0,0,0);controls.update();}
 reset();document.querySelector('#reset')!.addEventListener('click',reset);
 scene.add(new T.HemisphereLight(0xf4f8ff,0x798c74,2.5));
 const sun=new T.DirectionalLight(0xfff4df,3);sun.position.set(-5,12,7);sun.castShadow=true;
 sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-8,right:8,top:8,bottom:-8});sun.shadow.normalBias=.03;scene.add(sun);
 const mat=(color:number)=>new T.MeshStandardMaterial({color,roughness:.95,flatShading:true});
 const sea=new T.Mesh(new T.PlaneGeometry(160,160),mat(0xa5c9cf));sea.rotation.x=-Math.PI/2;sea.position.y=-.08;sea.receiveShadow=true;scene.add(sea);
 const tiles:T.Mesh<T.CylinderGeometry,T.MeshStandardMaterial[]>[]=[];
 const buttons:HTMLButtonElement[]=[];
 cells.forEach((cell,index)=>{
  const {x,z}=axialToWorld(cell,1.25);
  // Cylinder vertices point along Z, matching the pointy-top axial grid.
  const tile=new T.Mesh(new T.CylinderGeometry(1.225,1.225,cell.height,6),[mat(0xa99b7c),mat(colors[cell.type]),mat(0x8f8068)]);
  tile.position.set(x,cell.height/2,z);tile.castShadow=true;tile.receiveShadow=true;tile.userData.index=index;scene.add(tile);tiles.push(tile);
  if(cell.type==='forest') [[-.35,.1],[.35,.3],[.05,-.4]].forEach(([dx,dz],i)=>{
   const trunk=new T.Mesh(new T.CylinderGeometry(.055,.08,.35,5),mat(0x796746));trunk.position.set(x+dx,cell.height+.17,z+dz);scene.add(trunk);
   const tree=new T.Mesh(new T.ConeGeometry(.33,.95+i*.12,5),mat(i%2?0x4e795b:0x608762));tree.position.set(x+dx,cell.height+.72,z+dz);tree.castShadow=true;scene.add(tree);
  });
  if(cell.type==='rock') [[0,0,.65],[.5,.2,.35],[-.4,.3,.3]].forEach(([dx,dz,size])=>{
   const rock=new T.Mesh(new T.IcosahedronGeometry(size,0),mat(0xb9b9ae));rock.position.set(x+dx,cell.height+size*.45,z+dz);rock.scale.y=1.25;rock.castShadow=true;scene.add(rock);
  });
  const button=document.createElement('button');button.type='button';button.textContent=`${cell.q}, ${cell.r}`;
  button.setAttribute('aria-label',`Клетка ${cell.q}, ${cell.r}: ${names[cell.type]}`);button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>select(index));document.querySelector('#cells')!.append(button);buttons.push(button);
 });
 function select(index:number){
  tiles.forEach((tile,i)=>tile.material.forEach(m=>{m.emissive.setHex(i===index?0xc6a34d:0);m.emissiveIntensity=.28;}));
  buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
  const c=cells[index];const dl=document.createElement('dl');
  [['Координаты',`q: ${c.q}, r: ${c.r}`],['Тип',names[c.type]],['Состояние',c.state]].forEach(([label,value])=>{const row=document.createElement('div');const dt=document.createElement('dt');const dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);dl.append(row);});
  document.querySelector('#details')!.replaceChildren(dl);
 }
 const ray=new T.Raycaster();let down:{x:number;y:number;id:number}|undefined;let moved=false;
 canvas.addEventListener('pointerdown',e=>{if(e.isPrimary&&e.button===0){down={x:e.clientX,y:e.clientY,id:e.pointerId};moved=false;}});
 canvas.addEventListener('pointermove',e=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)moved=true;});
 canvas.addEventListener('pointercancel',()=>{down=undefined;});
 canvas.addEventListener('pointerup',e=>{const click=down&&down.id===e.pointerId&&!moved;down=undefined;if(!click)return;const rect=canvas.getBoundingClientRect();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hit=ray.intersectObjects(tiles,false)[0];if(hit)select(hit.object.userData.index as number);});
 function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.setViewOffset(innerWidth,innerHeight,innerWidth>700?140:0,0,innerWidth,innerHeight);camera.updateProjectionMatrix();}
 window.addEventListener('resize',resize);resize();renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();showError('Графический контекст потерян. Перезагрузите страницу.');});
}
function showError(message:string){const element=document.querySelector<HTMLDivElement>('#error')!;element.textContent=message;element.hidden=false;}
try{start();}catch(error){console.error(error);showError('Не удалось запустить 3D-сцену. Проверьте WebGL и аппаратное ускорение браузера.');}
