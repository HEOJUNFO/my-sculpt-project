// initScene.js — 슬림 오케스트레이터
import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { TrackballControls } from '../controls/TrackballControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from 'three-mesh-bvh';
import { setupCustomSculptUI } from '../../features/sculpt/sculptUI.js';
import {
  refs,
  reset,
  placeGizmoAtMeshCenter,
  addModelToScene,
} from '../../models/modelManager.js';

// 모듈화된 서브시스템
import { createWebGLRenderer, createWebGPURenderer } from './rendererSetup.ts';
import { setupLighting, loadEnvironmentMap } from './lightingSetup.ts';
import { createBrush } from './brushSetup.ts';
import { setupDebugGUI, createSubdivParams } from './guiSetup.ts';
import { createComposer } from '../../rendering/postprocessing/composerSetup.ts';

// three-mesh-bvh 프로토타입 확장
THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

// ---------------------- 전역 파라미터 ----------------------
const params = {
  matcap: 'Clay2',
  size: 0.03,
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
  flatShading: false,
  useWebGPU: false,

  // 렌더링 설정 (Phase 2a/2b)
  materialMode: 'matcap', // 'matcap' | 'pbr'
  enableSSAO: false,
  enableOutline: false,
  enableBloom: false,
  enableFXAA: true,
  useGPUSculpt: false,
};

const subdivParams = createSubdivParams();

// ---------------------- initScene() ----------------------
export function initScene() {
  const isDebugMode = window.location.href.includes('debug');

  // 렌더러
  const webglRenderer = createWebGLRenderer();
  const webgpuRenderer = createWebGPURenderer();
  let currentRenderer = webglRenderer;

  // 씬, 카메라, 조명
  const scene = new THREE.Scene();
  const lightingRig = setupLighting(scene);
  const dirLight = lightingRig.keyLight;

  const camera = new THREE.PerspectiveCamera(
    50, window.innerWidth / window.innerHeight, 0.1, 50
  );
  camera.position.set(0, 0, 3);
  camera.far = 100;
  camera.updateProjectionMatrix();

  // Stats (디버그 모드)
  let stats;
  if (isDebugMode) {
    stats = new Stats();
    document.body.appendChild(stats.dom);
  }

  // Matcap 텍스처
  const loader = new THREE.TextureLoader();
  const matcaps = {
    'Clay':     loader.load('textures/clay.jpg'),
    'Clay2':    loader.load('textures/B67F6B_4B2E2A_6C3A34_F3DBC6-256px.png'),
    'Red Clay': loader.load('textures/redClay.jpg'),
    'White':    loader.load('textures/white.jpg'),
    'MatcapFV': loader.load('textures/matcapFV.jpg'),
    'Pearl':    loader.load('textures/pearl.jpg'),
    'Red Wax':  loader.load('textures/763C39_431510_210504_55241C-256px.png'),
    'Normal':   loader.load('textures/7877EE_D87FC5_75D9C7_1C78C0-256px.png'),
    'Red':      loader.load('textures/red7.png'),
    'sky':      loader.load('textures/blockout.png'),
  };

  // 브러시
  const brush = createBrush(params.brushOpacity);
  scene.add(brush);

  // 컨트롤
  const controls = new TrackballControls(camera, currentRenderer.domElement);
  controls.rotateSpeed = 3;
  controls.panSpeed = 1;
  controls.addEventListener('start', () => { controls.active = true; });
  controls.addEventListener('end', () => { controls.active = false; });

  const transformControls = new TransformControls(camera, currentRenderer.domElement);
  transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value;
  });
  transformControls.setSize(0.8);

  // refs 할당
  refs.scene = scene;
  refs.camera = camera;
  refs.controls = controls;
  refs.targetMesh = null;
  refs.bvhHelper = null;
  refs.params = params;
  refs.matcaps = matcaps;
  refs.brush = brush;
  refs.transformControls = transformControls;
  refs.renderer = currentRenderer;
  refs.dirLight = dirLight;
  refs.lightingRig = lightingRig;
  refs.envMap = null;

  // 포스트 프로세싱 (WebGL 렌더러에서만 지원)
  refs.composer = createComposer(webglRenderer, scene, camera, params);

  // HDR 환경맵 로딩 (비동기, IBL용)
  loadEnvironmentMap(webglRenderer, scene, 'textures/studio_env.hdr')
    .then((envMap) => {
      refs.envMap = envMap;
      console.log('HDR environment map loaded');
    })
    .catch(() => {
      refs.envMap = null;
    });

  // 디버그 GUI
  if (isDebugMode) {
    setupDebugGUI(
      refs, params, subdivParams, matcaps, brush, scene, camera,
      webglRenderer, webgpuRenderer, stats,
      addModelToScene, reset, placeGizmoAtMeshCenter,
    );
  }

  // 커스텀 UI
  setupCustomSculptUI();

  return {
    renderer: currentRenderer,
    webglRenderer,
    webgpuRenderer,
    scene,
    camera,
    stats,
  };
}
