// initScene.js
import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import * as dat from 'three/examples/jsm/libs/lil-gui.module.min.js'; 
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import WebGPURenderer from 'three/src/renderers/webgpu/WebGPURenderer.js';

// three-subdivide 라이브러리 (npm 또는 CDN)
import { LoopSubdivision } from 'three-subdivide';

import { startRenderLoop } from './renderLoop.js';

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
  placeGizmoAtMeshCenter,
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
  wireframe: false,

  // WebGPU
  useWebGPU: false,
};

// --- Subdivide 설정을 위한 파라미터 객체 (GUI에서 노출) ---
const subdivParams = {
  iterations: 1,         // 몇 번 subdivision 할지
  split: true,           // 평면(co-planar)인 면을 split할지
  uvSmooth: false,       // UV도 스무딩 할지
  preserveEdges: false,  // geometry의 edge 보존할지
  flatOnly: false,       // flat subdiv만 적용할지 (스무딩X)
  maxTriangles: Infinity // 삼각형 개수 제한
};

// ---------------------- initScene() ----------------------
export function initScene() {
  const isDebugMode = window.location.href.includes('debug');

  // (1) WebGLRenderer
  const webglRenderer = new THREE.WebGLRenderer({ antialias: true });
  webglRenderer.setPixelRatio(window.devicePixelRatio);
  webglRenderer.setSize(window.innerWidth, window.innerHeight);
  webglRenderer.setClearColor(0x060609, 1);
  webglRenderer.outputEncoding = THREE.sRGBEncoding;
  webglRenderer.domElement.style.touchAction = 'none';
  document.body.appendChild(webglRenderer.domElement);

  // (2) WebGPURenderer
  const webgpuRenderer = new WebGPURenderer({ antialias: true });
  webgpuRenderer.setSize(window.innerWidth, window.innerHeight);
  webgpuRenderer.setClearColor(0x060609, 1);
  webgpuRenderer.outputEncoding = THREE.sRGBEncoding;
  webgpuRenderer.domElement.style.touchAction = 'none';
  webgpuRenderer.domElement.style.display = 'none';
  document.body.appendChild(webgpuRenderer.domElement);

  let currentRenderer = webglRenderer;

  // Scene, Camera, Light
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x263238 / 2, 20, 60);

  const light = new THREE.DirectionalLight(0xffffff, 0.5);
  light.position.set(1, 1, 1);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    50
  );
  camera.position.set(0, 0, 3);
  camera.far = 100;
  camera.updateProjectionMatrix();

  // Stats
  let stats;
  if (isDebugMode) {
    stats = new Stats();
    document.body.appendChild(stats.dom);
  }

  // Matcaps
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
  
  // Brush
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

  // Controls
  const controls = new TrackballControls(camera, currentRenderer.domElement);
  controls.rotateSpeed = 3;
  controls.addEventListener('start', ()=>{ controls.active = true; });
  controls.addEventListener('end',   ()=>{ controls.active = false; });

  // TransformControls
  const transformControls = new TransformControls(camera, currentRenderer.domElement);
  transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = ! event.value;
  });
  transformControls.setSize(0.8);

  // refs
  refs.scene = scene;
  refs.camera = camera;
  refs.controls = controls;
  refs.targetMesh = null;
  refs.bvhHelper = null;
  refs.params = params;
  refs.matcaps = matcaps;
  refs.brush = brush;
  refs.transformControls = transformControls;

  // dat.GUI
  let gui;
  if (isDebugMode) {
    gui = new dat.GUI();

    // Model Folder
    const modelFolder = gui.addFolder('Model');
    modelFolder.add(params, 'matcap', Object.keys(matcaps)).name('Matcap');
    modelFolder
      .add(params, 'wireframe')
      .name('Wireframe')
      .onChange((value) => {
        if (refs.targetMesh) {
          const mats = Array.isArray(refs.targetMesh.material)
            ? refs.targetMesh.material
            : [refs.targetMesh.material];
          mats.forEach(mat => mat.wireframe = value);
        }
      });
    modelFolder.add({
      addSphere: () => {
        addModelToScene(new THREE.IcosahedronGeometry(1, 100), 'Icosahedron');
        fitCameraToObject(camera, refs.targetMesh, controls);
      }
    }, 'addSphere').name('Add Sphere');

    // ---- Subdivision UI 추가 ----
    const subdivFolder = modelFolder.addFolder('Subdivision');
    subdivFolder.add(subdivParams, 'iterations', 1, 5, 1).name('Iterations');
    subdivFolder.add(subdivParams, 'split').name('Split');
    subdivFolder.add(subdivParams, 'uvSmooth').name('uvSmooth');
    subdivFolder.add(subdivParams, 'preserveEdges').name('PreserveEdges');
    subdivFolder.add(subdivParams, 'flatOnly').name('FlatOnly');

    // Subdivide 적용 버튼
    subdivFolder.add({
      subdivideMesh: () => {
        if (refs.targetMesh) {
          // geometry를 subdivision
          // (주의: 너무 많은 iterations나 큰 모델은 성능에 부담)
          refs.targetMesh.geometry = LoopSubdivision.modify(
            refs.targetMesh.geometry,
            subdivParams.iterations,
            {
              split: subdivParams.split,
              uvSmooth: subdivParams.uvSmooth,
              preserveEdges: subdivParams.preserveEdges,
              flatOnly: subdivParams.flatOnly,
              maxTriangles: Infinity
            }
          );
          // 혹시 BVH Helper 표시 중이면 다시 계산
          refs.targetMesh.geometry.computeBoundsTree?.();
          if (refs.bvhHelper) {
            refs.bvhHelper.update();
          }
        }
      }
    }, 'subdivideMesh').name('Apply Subdivide');
    // ---- Subdivision UI 끝 ----

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
          params.transformMode = false;
          transformCtrl.updateDisplay();
          refs.transformControls?.detach();
          refs.scene.remove(refs.transformControls);
        }
      });

    // Transform Mode
    const transformCtrl = gui.add(params, 'transformMode')
      .name('Transform Mode')
      .onChange((value) => {
        if (value) {
          params.memoMode = false;
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
    
    gui.add(params, 'transformType', [ 'translate', 'rotate', 'scale' ] )
      .name('Transform Mode Type')
      .onChange((mode) => {
        if (refs.transformControls) {
          refs.transformControls.setMode(mode);
        }
      });

    gui.add(params, 'memoHide').name('Hide Memo').onChange((hideVal) => {
      memos.forEach((m) => {
        m.object.visible = !hideVal;
      });
    });

    // WebGPU 전환 체크
    gui.add(params, 'useWebGPU')
      .name('Use WebGPU')
      .onChange((useWebGPU) => {
        if (useWebGPU) {
          // WebGPU로 전환
          webglRenderer.domElement.style.display = 'none';
          webgpuRenderer.domElement.style.display = '';
          currentRenderer = webgpuRenderer;

          // Controls 재설정
          controls.dispose();
          const newControls = new TrackballControls(camera, webgpuRenderer.domElement);
          newControls.rotateSpeed = 3;
          newControls.addEventListener('start', ()=>{ newControls.active = true; });
          newControls.addEventListener('end',   ()=>{ newControls.active = false; });
          refs.controls = newControls;

          transformControls.dispose();
          const newTransformControls = new TransformControls(camera, webgpuRenderer.domElement);
          newTransformControls.addEventListener('dragging-changed', (event) => {
            newControls.enabled = ! event.value;
          });
          newTransformControls.setSize(0.8);
          refs.transformControls = newTransformControls;

          if(refs.targetMesh) {
            fitCameraToObject(camera, refs.targetMesh, newControls);
          }

          startRenderLoop(webgpuRenderer, scene, camera, stats);

        } else {
          // WebGL로 전환
          webgpuRenderer.domElement.style.display = 'none';
          webglRenderer.domElement.style.display = '';
          currentRenderer = webglRenderer;

          controls.dispose();
          const newControls = new TrackballControls(camera, webglRenderer.domElement);
          newControls.rotateSpeed = 3;
          newControls.addEventListener('start', ()=>{ newControls.active = true; });
          newControls.addEventListener('end',   ()=>{ newControls.active = false; });
          refs.controls = newControls;

          transformControls.dispose();
          const newTransformControls = new TransformControls(camera, webglRenderer.domElement);
          newTransformControls.addEventListener('dragging-changed', (event) => {
            newControls.enabled = ! event.value;
          });
          newTransformControls.setSize(0.8);
          refs.transformControls = newTransformControls;

          if(refs.targetMesh) {
            fitCameraToObject(camera, refs.targetMesh, newControls);
          }

          startRenderLoop(webglRenderer, scene, camera, stats);
        }
      });

    // Buttons
    gui.add({ reset }, 'reset');
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

  // 커스텀 UI
  setupCustomSculptUI();

  return {
    renderer: currentRenderer,
    webglRenderer,
    webgpuRenderer,
    scene,
    camera,
    stats
  };
}
