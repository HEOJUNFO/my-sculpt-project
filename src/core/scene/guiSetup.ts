import * as THREE from 'three';
import * as dat from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { LoopSubdivision } from 'three-subdivide';
import { fitCameraToObject } from '../controls/cameraHelpers.js';
import { switchRenderer } from './rendererSetup.ts';
import { startRenderLoop } from './renderLoop.js';
import { memos } from '../../features/memo/memo.js';

export interface SubdivParams {
  iterations: number;
  split: boolean;
  uvSmooth: boolean;
  preserveEdges: boolean;
  flatOnly: boolean;
  maxTriangles: number;
}

export function createSubdivParams(): SubdivParams {
  return {
    iterations: 1,
    split: true,
    uvSmooth: false,
    preserveEdges: false,
    flatOnly: false,
    maxTriangles: Infinity,
  };
}

export function setupDebugGUI(
  refs: any,
  params: any,
  subdivParams: SubdivParams,
  matcaps: Record<string, THREE.Texture>,
  brush: THREE.LineSegments,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  webglRenderer: THREE.WebGLRenderer,
  webgpuRenderer: any,
  stats: any,
  addModelToScene: (geo: THREE.BufferGeometry, name: string) => void,
  reset: () => void,
  placeGizmoAtMeshCenter: (mesh: THREE.Mesh) => void,
): any {
  const gui = new (dat as any).GUI();

  // --- Model Folder ---
  const modelFolder = gui.addFolder('Model');
  modelFolder.add(params, 'matcap', Object.keys(matcaps)).name('Matcap');
  modelFolder
    .add(params, 'wireframe')
    .name('Wireframe')
    .onChange((value: boolean) => {
      if (refs.targetMesh) {
        const mats = Array.isArray(refs.targetMesh.material)
          ? refs.targetMesh.material
          : [refs.targetMesh.material];
        mats.forEach((mat: any) => (mat.wireframe = value));
      }
    });
  modelFolder
    .add(params, 'flatShading')
    .name('Flat Shading')
    .onChange((value: boolean) => {
      if (refs.targetMesh) {
        const mats = Array.isArray(refs.targetMesh.material)
          ? refs.targetMesh.material
          : [refs.targetMesh.material];
        mats.forEach((mat: any) => (mat.flatShading = value));
        refs.targetMesh.material.needsUpdate = true;
      }
    });
  modelFolder.add(
    {
      addSphere: () => {
        addModelToScene(new THREE.IcosahedronGeometry(1, 100), 'Icosahedron');
        fitCameraToObject(camera, refs.targetMesh, refs.controls);
      },
    },
    'addSphere',
  ).name('Add Sphere');

  // --- Subdivision ---
  const subdivFolder = modelFolder.addFolder('Subdivision');
  subdivFolder.add(subdivParams, 'iterations', 1, 5, 1).name('Iterations');
  subdivFolder.add(subdivParams, 'split').name('Split');
  subdivFolder.add(subdivParams, 'uvSmooth').name('uvSmooth');
  subdivFolder.add(subdivParams, 'preserveEdges').name('PreserveEdges');
  subdivFolder.add(subdivParams, 'flatOnly').name('FlatOnly');
  subdivFolder.add(
    {
      subdivideMesh: () => {
        if (refs.targetMesh) {
          refs.targetMesh.geometry = LoopSubdivision.modify(
            refs.targetMesh.geometry,
            subdivParams.iterations,
            {
              split: subdivParams.split,
              uvSmooth: subdivParams.uvSmooth,
              preserveEdges: subdivParams.preserveEdges,
              flatOnly: subdivParams.flatOnly,
              maxTriangles: Infinity,
            },
          );
          refs.targetMesh.geometry.computeBoundsTree?.();
          if (refs.bvhHelper) refs.bvhHelper.update();
        }
      },
    },
    'subdivideMesh',
  ).name('Apply Subdivide');
  modelFolder.open();

  // --- Sculpt Folder ---
  const sculptFolder = gui.addFolder('Sculpting');
  sculptFolder.add(params, 'maxSteps', 1, 25, 1);
  sculptFolder
    .add(params, 'brushOpacity', 0.0, 1.0, 0.01)
    .name('Brush Opacity')
    .onChange((val: number) => {
      (brush.material as THREE.LineBasicMaterial).opacity = val;
    });
  sculptFolder.open();

  // --- BVH Helper ---
  const helperFolder = gui.addFolder('BVH Helper');
  helperFolder.add(params, 'depth', 1, 20, 1).onChange((val: number) => {
    if (refs.bvhHelper) {
      refs.bvhHelper.depth = parseFloat(String(val));
      refs.bvhHelper.update();
    }
  });
  helperFolder.add(params, 'displayHelper').onChange((display: boolean) => {
    if (!refs.bvhHelper) return;
    if (display) {
      scene.add(refs.bvhHelper);
      refs.bvhHelper.update();
    } else {
      scene.remove(refs.bvhHelper);
    }
  });
  helperFolder.open();

  // --- Memo / Transform Modes ---
  const memoCtrl = gui
    .add(params, 'memoMode')
    .name('Memo Mode')
    .onChange((value: boolean) => {
      if (value) {
        params.transformMode = false;
        transformCtrl.updateDisplay();
        refs.transformControls?.detach();
        refs.scene.remove(refs.transformControls);
      }
    });

  const transformCtrl = gui
    .add(params, 'transformMode')
    .name('Transform Mode')
    .onChange((value: boolean) => {
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

  gui
    .add(params, 'transformType', ['translate', 'rotate', 'scale'])
    .name('Transform Mode Type')
    .onChange((mode: string) => {
      if (refs.transformControls) refs.transformControls.setMode(mode);
    });

  gui.add(params, 'memoHide').name('Hide Memo').onChange((hideVal: boolean) => {
    memos.forEach((m: any) => {
      m.object.visible = !hideVal;
    });
  });

  // --- WebGPU Toggle ---
  gui
    .add(params, 'useWebGPU')
    .name('Use WebGPU')
    .onChange((useWebGPU: boolean) => {
      const result = switchRenderer(
        useWebGPU,
        webglRenderer,
        webgpuRenderer,
        camera,
        refs.controls,
        refs.transformControls,
        refs.targetMesh,
        startRenderLoop,
        scene,
        stats,
      );
      refs.renderer = result.renderer;
      refs.controls = result.controls;
      refs.transformControls = result.transformControls;
    });

  // --- Buttons ---
  gui.add({ reset }, 'reset');
  gui.add(
    {
      rebuildBVH: () => {
        if (refs.targetMesh) {
          refs.targetMesh.geometry.computeBoundsTree({ setBoundingBox: false });
          if (refs.bvhHelper) refs.bvhHelper.update();
        }
      },
    },
    'rebuildBVH',
  );

  gui.open();
  return gui;
}
