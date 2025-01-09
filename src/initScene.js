// src/initScene.js

import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import * as dat from 'three/examples/jsm/libs/lil-gui.module.min.js'; 
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from 'three-mesh-bvh';


import { setupCustomSculptUI } from './sculptUI.js'; // 브러시/슬라이더 UI 초기화

// 메모 로직
import {
    memos,
  } from './memo.js';


// 모델 관리
import {
    refs,
    reset,
    saveChanges,
    exportCurrentModel,

  } from './modelManager.js';

// three-mesh-bvh 확장
THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

// 전역 파라미터 (원래 main.js에서 쓰던 값 그대로 이동하거나, 필요에 따라 분리)
const params = {
  matcap: 'Clay',

  // Sculpting
  size: 0.1,
  brush: 'clay',
  intensity: 25,
  maxSteps: 10,
  invert: false,
  symmetrical: false,
  flatShading: false,

  // BVH Helper
  depth: 10,
  displayHelper: false,

  // 투명도
  brushOpacity: 1.0,
  modelOpacity: 1.0,

  // 메모 모드
  memoMode: false,

  // Hide Memo
  memoHide: false,
};

export function initScene() {
  // 1) renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x060609, 1);
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none'; // 모바일 터치 스크롤 방지

  // 2) scene
  const scene = new THREE.Scene();

  // 3) light
  const light = new THREE.DirectionalLight(0xffffff, 0.5);
  light.position.set(1, 1, 1);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  // 4) camera
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 0, 3);
  camera.far = 100;
  camera.updateProjectionMatrix();

  // 5) stats (FPS 등 성능 정보)
  const stats = new Stats();
  document.body.appendChild(stats.dom);

  // 6) matcaps
  const matcaps = {};
  matcaps['Clay']        = new THREE.TextureLoader().load('textures/B67F6B_4B2E2A_6C3A34_F3DBC6-256px.png');
  matcaps['Red Wax']     = new THREE.TextureLoader().load('textures/763C39_431510_210504_55241C-256px.png');
  matcaps['Shiny Green'] = new THREE.TextureLoader().load('textures/3B6E10_E3F2C3_88AC2E_99CE51-256px.png');
  matcaps['Normal']      = new THREE.TextureLoader().load('textures/7877EE_D87FC5_75D9C7_1C78C0-256px.png');

  // 브러시(LineSegments) 예시 생성 (원래 main.js에서 만들었던 것)
  const brushMat = new THREE.LineBasicMaterial({
    color: 'red',
    transparent: true,
    opacity: params.brushOpacity,
    depthTest: false,
  });

  // 50각형 + 축 한 줄 등 예시
  const brushSegments = [ new THREE.Vector3(), new THREE.Vector3(0,0,1) ];
  for ( let i = 0; i < 50; i ++ ) {
    const nexti = i + 1;
    const x1 = Math.sin((2 * Math.PI * i) / 50);
    const y1 = Math.cos((2 * Math.PI * i) / 50);
    const x2 = Math.sin((2 * Math.PI * nexti) / 50);
    const y2 = Math.cos((2 * Math.PI * nexti) / 50);
    brushSegments.push(
      new THREE.Vector3(x1,y1,0),
      new THREE.Vector3(x2,y2,0),
    );
  }
  const brushGeo = new THREE.BufferGeometry().setFromPoints(brushSegments);
  const brush = new THREE.LineSegments(brushGeo, brushMat);
  brush.renderOrder = 9999; // GUI보다 앞
  scene.add(brush);

  // ▼ TrackballControls
  const controls = new TrackballControls(camera, renderer.domElement);
  controls.rotateSpeed = 3;
  controls.addEventListener('start', ()=>{ controls.active = true; });
  controls.addEventListener('end',   ()=>{ controls.active = false; });

  // refs 연결 (modelManager.js의 refs)
  refs.scene = scene;
  refs.camera = camera;
  refs.controls = controls;
  refs.targetMesh = null;
  refs.bvhHelper = null;
  refs.params = params;
  refs.matcaps = matcaps;
  
  // (옵션) brush 객체도 refs에 저장할지 여부
  refs.brush = brush;

  // GUI (dat.GUI)
  const gui = new dat.GUI();

  // 예시: Model Folder
  const modelFolder = gui.addFolder('Model');
  modelFolder.add(params, 'matcap', Object.keys(matcaps)).name('Matcap');
  modelFolder.open();

  // Sculpt Folder
  const sculptFolder = gui.addFolder('Sculpting');
  sculptFolder.add(params, 'maxSteps',1,25,1);
  sculptFolder.add(params, 'invert');
  sculptFolder.add(params, 'flatShading').onChange( val => {
    if ( refs.targetMesh ) {
      refs.targetMesh.material.flatShading = val;
      refs.targetMesh.material.needsUpdate = true;
    }
  });
  sculptFolder.add(params, 'brushOpacity', 0.0, 1.0, 0.01).name('Brush Opacity')
    .onChange(val => {
      brush.material.opacity = val;
    });
  sculptFolder.open();

  // BVH Helper
  const helperFolder = gui.addFolder('BVH Helper');
  helperFolder.add(params, 'depth', 1, 20, 1).onChange(val => {
    if ( refs.bvhHelper ) {
      refs.bvhHelper.depth = parseFloat(val);
      refs.bvhHelper.update();
    }
  });
  helperFolder.add(params, 'displayHelper').onChange( display => {
    if ( !refs.bvhHelper ) return;
    if ( display ) {
      scene.add( refs.bvhHelper );
      refs.bvhHelper.update();
    } else {
      scene.remove( refs.bvhHelper );
    }
  });
  helperFolder.open();

  // Memo Mode
  gui.add(params, 'memoMode').name('Memo Mode');

  // Hide Memo
  gui.add(params, 'memoHide').name('Hide Memo')
    .onChange( (hideVal) => {
      memos.forEach( (m) => {
        m.object.visible = !hideVal;
      });
    });

  
  // Buttons
  gui.add({ reset }, 'reset');
  gui.add({ save: saveChanges }, 'save');
  gui.add({ export: exportCurrentModel }, 'export');
  gui.add({
    rebuildBVH: () => {
      if ( refs.targetMesh ) {
        refs.targetMesh.geometry.computeBoundsTree({ setBoundingBox: false });
        if ( refs.bvhHelper ) {
          refs.bvhHelper.update();
        }
      }
    }
  }, 'rebuildBVH');

  gui.open();

  // 커스텀 UI 세팅 (브러시 버튼, 슬라이더 등)
  setupCustomSculptUI();

  // 반환: main.js 쪽에서 받아서 renderLoop()에 넘겨줄 수 있음
  return {
    renderer,
    scene,
    camera,
    stats
  };
}
