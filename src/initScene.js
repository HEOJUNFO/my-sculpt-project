// initScene.js
import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import * as dat from 'three/examples/jsm/libs/lil-gui.module.min.js'; 
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from 'three-mesh-bvh';

import { setupCustomSculptUI } from './sculptUI.js'; 
import { memos } from './memo.js'; 

import {
  refs,
  reset,
  exportCurrentModel,
  placeGizmoAtMeshCenter,
  undo,
  redo,
  addModelToScene,
} from './modelManager.js';
import { fitCameraToObject } from './cameraHelpers.js';

// three-mesh-bvh 프로토타입 확장
THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

// ---------------------- 전역 파라미터 ----------------------
const params = {
  matcap: 'Red Wax',
  size: 0.05,
  brush: 'clay',
  intensity: 25,
  maxSteps: 10,
  invert: false,
  symmetrical: false,
  depth: 10,
  displayHelper: false,
  brushOpacity: 1.0,
  modelOpacity: 1.0,
  memoMode: false,
  memoHide: false,
  transformMode: false,
  transformType: 'translate',
};

// ---------------------- initScene() ----------------------
export function initScene() {

  // URL에 debug 라는 문자열이 포함되어 있는지 체크
  const isDebugMode = window.location.href.includes('debug');
  // 또는 location.pathname, query string 등으로 구분 가능
  // const isDebugMode = location.pathname.includes('debug');

  // 1) renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x060609, 1);
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';

  // 2) scene
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog( 0x263238 / 2, 20, 60 );

  // 3) light
  const light = new THREE.DirectionalLight(0xffffff, 0.5);
  light.position.set(1, 1, 1);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  // 4) camera
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    50
  );
  camera.position.set(0, 0, 3);
  camera.far = 100;
  camera.updateProjectionMatrix();

  // 5) stats (debug 페이지일 때만 생성/표시)
  let stats;
  if (isDebugMode) {
    stats = new Stats();
    document.body.appendChild(stats.dom);
  }

  // 6) matcaps
  const matcaps = {};
  matcaps['Clay']        = new THREE.TextureLoader().load('textures/clay.jpg');
  matcaps['Clay2']       = new THREE.TextureLoader().load('textures/B67F6B_4B2E2A_6C3A34_F3DBC6-256px.png');
  matcaps['Red Clay']    = new THREE.TextureLoader().load('textures/redClay.jpg');
  matcaps['Green']       = new THREE.TextureLoader().load('textures/green.jpg');
  matcaps['White']       = new THREE.TextureLoader().load('textures/white.jpg');
  matcaps['MatcapFV']    = new THREE.TextureLoader().load('textures/matcapFV.jpg');
  matcaps['Pearl']       = new THREE.TextureLoader().load('textures/pearl.jpg');
  matcaps['Skin']        = new THREE.TextureLoader().load('textures/skin.jpg');
  matcaps['SkinHazardousarts']  = new THREE.TextureLoader().load('textures/skinhazardousarts.jpg');
  matcaps['SkinHazardousarts2'] = new THREE.TextureLoader().load('textures/skinhazardousarts2.jpg');
  matcaps['Red Wax']     = new THREE.TextureLoader().load('textures/763C39_431510_210504_55241C-256px.png');
  matcaps['Shiny Green'] = new THREE.TextureLoader().load('textures/3B6E10_E3F2C3_88AC2E_99CE51-256px.png');
  matcaps['Normal']      = new THREE.TextureLoader().load('textures/7877EE_D87FC5_75D9C7_1C78C0-256px.png');
  
  // 브러시(LineSegments)
  const brushMat = new THREE.LineBasicMaterial({
    color: 'red',
    transparent: true,
    opacity: params.brushOpacity,
    depthTest: false,
  });
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
  brush.renderOrder = 9999;
  scene.add(brush);

  // TrackballControls
  const controls = new TrackballControls(camera, renderer.domElement);
  controls.rotateSpeed = 3;
  controls.addEventListener('start', ()=>{ controls.active = true; });
  controls.addEventListener('end',   ()=>{ controls.active = false; });

  // TransformControls
  const transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.addEventListener('dragging-changed', (event) => {
    // 드래그 중이면 TrackballControls 비활성화
    controls.enabled = ! event.value;
  });
  // 기즈모 사이즈 축소
  transformControls.setSize(0.8);

  // refs 연결
  refs.scene = scene;
  refs.camera = camera;
  refs.controls = controls;
  refs.targetMesh = null;
  refs.bvhHelper = null;
  refs.params = params;
  refs.matcaps = matcaps;
  refs.brush = brush;
  refs.transformControls = transformControls;

  // dat.GUI (debug 페이지일 때만 생성)
  let gui;
  if (isDebugMode) {
    gui = new dat.GUI();

    // Model Folder
    const modelFolder = gui.addFolder('Model');
    modelFolder.add(params, 'matcap', Object.keys(matcaps)).name('Matcap');

    modelFolder.add({
      addSphere: () => {
        addModelToScene(new THREE.IcosahedronGeometry(1, 200), 'Icosahedron');
        fitCameraToObject(camera, refs.targetMesh, controls);
      }
    }, 'addSphere').name('Add Sphere');

    modelFolder.open();

    // Sculpt Folder
    const sculptFolder = gui.addFolder('Sculpting');
    sculptFolder.add(params, 'maxSteps',1,25,1);
    sculptFolder
      .add(params, 'brushOpacity', 0.0, 1.0, 0.01)
      .name('Brush Opacity')
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
    helperFolder.add(params, 'displayHelper').onChange(display => {
      if (!refs.bvhHelper) return;
      if ( display ) {
        scene.add(refs.bvhHelper);
        refs.bvhHelper.update();
      } else {
        scene.remove(refs.bvhHelper);
      }
    });
    helperFolder.open();

    // Memo Mode
    const memoCtrl = gui.add(params, 'memoMode')
      .name('Memo Mode')
      .onChange((value) => {
        if (value) {
          // 변수만 false로 설정
          params.transformMode = false;
          // transform UI 수동 갱신
          transformCtrl.updateDisplay();
          // transformControls 제거
          refs.transformControls?.detach();
          refs.scene.remove(refs.transformControls);
        }
      });

    // Transform Mode
    const transformCtrl = gui.add(params, 'transformMode')
      .name('Transform Mode')
      .onChange((value) => {
        if (value) {
          // 변수만 false로 설정
          params.memoMode = false;
          // memo UI 수동 갱신
          memoCtrl.updateDisplay();

          if (refs.targetMesh) {
            placeGizmoAtMeshCenter(refs.targetMesh);
            refs.transformControls?.setMode(params.transformType);
          }
        } else {
          refs.transformControls.detach();
          refs.scene.remove(refs.transformControls.getHelper());
        }
      });
    
    // Transform Type
    gui.add(params, 'transformType', [ 'translate', 'rotate', 'scale' ] )
      .name('Transform Mode Type')
      .onChange((mode) => {
        if (refs.transformControls) {
          refs.transformControls.setMode(mode);
        }
      });

    // Hide Memo
    gui.add(params, 'memoHide').name('Hide Memo').onChange((hideVal) => {
      memos.forEach((m) => {
        m.object.visible = !hideVal;
      });
    });

    // Buttons
    gui.add({ reset }, 'reset');
    gui.add({ export: exportCurrentModel }, 'export');
    gui.add({
      rebuildBVH: () => {
        if (refs.targetMesh) {
          refs.targetMesh.geometry.computeBoundsTree({ setBoundingBox: false });
          if (refs.bvhHelper) {
            refs.bvhHelper.update();
          }
        }
      }
    }, 'rebuildBVH');
    gui.open();
  }

  // 커스텀 UI (브러시 버튼, 슬라이더 등)
  setupCustomSculptUI();

  return {
    renderer,
    scene,
    camera,
    stats // debug가 아닐 경우 undefined이 반환될 수 있음.
  };
}
