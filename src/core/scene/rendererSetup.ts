import * as THREE from 'three';
import WebGPURenderer from 'three/src/renderers/webgpu/WebGPURenderer.js';
import { TrackballControls } from '../controls/TrackballControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { fitCameraToObject } from '../controls/cameraHelpers.js';

const CLEAR_COLOR = 0x060009;

export function createWebGLRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(CLEAR_COLOR, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.touchAction = 'none';
  document.body.appendChild(renderer.domElement);
  return renderer;
}

export function createWebGPURenderer(): any {
  const renderer = new (WebGPURenderer as any)({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(CLEAR_COLOR, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.display = 'none';
  document.body.appendChild(renderer.domElement);
  return renderer;
}

export interface RendererSwitchResult {
  renderer: THREE.WebGLRenderer | any;
  controls: any;
  transformControls: any;
}

export function switchRenderer(
  useWebGPU: boolean,
  webglRenderer: THREE.WebGLRenderer,
  webgpuRenderer: any,
  camera: THREE.PerspectiveCamera,
  oldControls: any,
  oldTransformControls: any,
  targetMesh: THREE.Mesh | null,
  startRenderLoopFn: (renderer: any, scene: THREE.Scene, camera: THREE.PerspectiveCamera, stats: any) => void,
  scene: THREE.Scene,
  stats: any,
): RendererSwitchResult {
  const [activeRenderer, inactiveRenderer] = useWebGPU
    ? [webgpuRenderer, webglRenderer]
    : [webglRenderer, webgpuRenderer];

  inactiveRenderer.domElement.style.display = 'none';
  activeRenderer.domElement.style.display = '';

  oldControls.dispose();
  const controls = new TrackballControls(camera, activeRenderer.domElement);
  controls.rotateSpeed = 3;
  controls.panSpeed = 1;
  controls.addEventListener('start', () => { (controls as any).active = true; });
  controls.addEventListener('end', () => { (controls as any).active = false; });

  oldTransformControls.dispose();
  const transformControls = new TransformControls(camera, activeRenderer.domElement);
  transformControls.addEventListener('dragging-changed', (event: any) => {
    controls.enabled = !event.value;
  });
  transformControls.setSize(0.8);

  if (targetMesh) {
    fitCameraToObject(camera, targetMesh, controls);
  }

  startRenderLoopFn(activeRenderer, scene, camera, stats);

  return { renderer: activeRenderer, controls, transformControls };
}
