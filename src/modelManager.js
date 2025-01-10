// src/modelManager.js

import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { loadStlFileAsGeometry } from './stlHelpers.js';
import { centerAndScaleGeometry } from './geometryHelpers.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVHHelper } from 'three-mesh-bvh';
import { fitCameraToObject } from './cameraHelpers.js';

export let modelList = [];    // [{ fileName, geometry, mesh, customOpacity }, ...]
export let activeItemIndex = -1;
export let initialGeometry = null;
export let initialFileName = null;

export const undoStack = [];
export const redoStack = [];

// ------------------------
// ▼ Undo/Redo 핵심 함수들
// ------------------------

export function pushUndoState() {
    if (activeItemIndex < 0) return;       // 모델이 없다면 패스
    const item = modelList[activeItemIndex];
    if (!item) return;
  
    const mesh = item.mesh;
    const geo = mesh.geometry;
  
    const posAttr = geo.attributes.position;
    const normalAttr = geo.attributes.normal;
    if (!posAttr || !normalAttr) return;
  
    // 복사
    const positionsCopy = new Float32Array(posAttr.array.length);
    positionsCopy.set(posAttr.array);
    const normalsCopy = new Float32Array(normalAttr.array.length);
    normalsCopy.set(normalAttr.array);
  
    undoStack.push({
      itemIndex: activeItemIndex, // 어느 모델에 대한 것인지
      positions: positionsCopy,
      normals: normalsCopy,
    });
  
    console.log('pushUndoState - itemIndex:', activeItemIndex, 'undoStack size=', undoStack.length);
  }
  
  /**
   * Redo 데이터 푸시
   */
  export function pushRedoState() {
    if (activeItemIndex < 0) return;
    const item = modelList[activeItemIndex];
    if (!item) return;
  
    const mesh = item.mesh;
    const geo = mesh.geometry;
  
    const posAttr = geo.attributes.position;
    const normalAttr = geo.attributes.normal;
    if (!posAttr || !normalAttr) return;
  
    const positionsCopy = new Float32Array(posAttr.array.length);
    positionsCopy.set(posAttr.array);
    const normalsCopy = new Float32Array(normalAttr.array.length);
    normalsCopy.set(normalAttr.array);
  
    redoStack.push({
      itemIndex: activeItemIndex,
      positions: positionsCopy,
      normals: normalsCopy,
    });
  
    console.log('pushRedoState - itemIndex:', activeItemIndex, 'redoStack size=', redoStack.length);
  }
  
  /**
   * Undo 실행
   * - pop undoStack
   * - 만약 lastState.itemIndex != activeItemIndex면, 모델 강제 교체
   * - geometry 복원
   * - 현재 상태는 redoStack에 push
   */
  export function undo() {
    if (undoStack.length === 0) {
      console.log('No more undo states.');
      return;
    }
  
    // Undo 스택에서 마지막 상태를 꺼냄
    const lastState = undoStack.pop();
  
    // 현재 상태를 redo 스택에 저장
    pushRedoState();
  
    // 만약 lastState.itemIndex와 현재 activeItemIndex가 다르면,
    // 해당 모델로 강제 전환
    if (lastState.itemIndex !== activeItemIndex) {
      setTargetMeshAsActive(modelList[lastState.itemIndex].mesh);
    }
  
    // 이제 refs.targetMesh는 lastState.itemIndex의 모델
    const item = modelList[lastState.itemIndex];
    const mesh = item.mesh;
    const geo = mesh.geometry;
  
    const posAttr = geo.attributes.position;
    const normalAttr = geo.attributes.normal;
    if (!posAttr || !normalAttr) return;
  
    posAttr.array.set(lastState.positions);
    normalAttr.array.set(lastState.normals);
    posAttr.needsUpdate = true;
    normalAttr.needsUpdate = true;
  
    geo.computeBoundsTree({ setBoundingBox: false });
    if (refs.bvhHelper && refs.bvhHelper.parent !== null) {
      refs.bvhHelper.update();
    }
  
    console.log('Undo done for itemIndex=', lastState.itemIndex, 'undoStack size=', undoStack.length);
  }
  
  /**
   * Redo 실행
   * - pop redoStack
   * - 만약 lastState.itemIndex != activeItemIndex면, 모델 강제 전환
   * - geometry 복원
   * - 현재 상태는 undoStack에 push
   */
  export function redo() {
    if (redoStack.length === 0) {
      console.log('No more redo states in redoStack.');
      return;
    }
  
    const lastState = redoStack.pop();
  
    // 현재 상태를 undo 스택에 저장
    pushUndoState();
  
    // 모델 강제 전환
    if (lastState.itemIndex !== activeItemIndex) {
      setTargetMeshAsActive(modelList[lastState.itemIndex].mesh);
    }
  
    const item = modelList[lastState.itemIndex];
    const mesh = item.mesh;
    const geo = mesh.geometry;
  
    const posAttr = geo.attributes.position;
    const normalAttr = geo.attributes.normal;
    if (!posAttr || !normalAttr) return;
  
    posAttr.array.set(lastState.positions);
    normalAttr.array.set(lastState.normals);
    posAttr.needsUpdate = true;
    normalAttr.needsUpdate = true;
  
    geo.computeBoundsTree({ setBoundingBox: false });
    if (refs.bvhHelper && refs.bvhHelper.parent !== null) {
      refs.bvhHelper.update();
    }
  
    console.log('Redo done for itemIndex=', lastState.itemIndex, 'redoStack size=', redoStack.length);
  }

/** 
 * refs: scene, camera, controls, etc.
 * 여기서 transformControls도 initScene에서 할당
 */
export const refs = {
  scene: null,
  camera: null,
  controls: null,
  targetMesh: null,
  bvhHelper: null,
  params: null,      // (matcap, displayHelper, modelOpacity, transformMode, etc.)
  matcaps: null,
  transformControls: null, 
};

/** 활성 재질 */
function createActiveMaterial() {
  return new THREE.MeshMatcapMaterial({
    matcap: refs.matcaps[ refs.params.matcap ],
    flatShading: refs.params.flatShading,
    transparent: true,
    opacity: refs.params.modelOpacity, 
  });
}
/** 비활성 재질 */
function createInactiveMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xaaaaaa,
    transparent: true,
    opacity: refs.params.modelOpacity,
  });
}

/** 
 * 바운딩박스 중심에 기즈모(TransformControls)
 */
export function placeGizmoAtMeshCenter(mesh) {
  if (!mesh || !refs.transformControls) return;

  // 1) 월드 좌표계에서 메쉬의 바운딩박스
  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3()); // world coords center

  // 2) pivot 객체 생성
  const pivot = new THREE.Object3D();
  pivot.position.copy(center);
  pivot.name = 'PivotForMesh';

  refs.scene.add(pivot);

  // 3) 메쉬의 월드 위치/회전
  const meshWorldPos = new THREE.Vector3();
  mesh.getWorldPosition(meshWorldPos);

  const meshWorldQuat = new THREE.Quaternion();
  mesh.getWorldQuaternion(meshWorldQuat);

  // 4) 메쉬를 pivot 자식으로
  if (mesh.parent) {
    mesh.parent.remove(mesh);
  }
  pivot.add(mesh);

  // 로컬 좌표로 환산
  mesh.position.copy(pivot.worldToLocal(meshWorldPos));
  mesh.quaternion.copy(meshWorldQuat);

  // 5) TransformControls
  refs.transformControls.detach();
  refs.transformControls.attach(pivot);

  // helper
  if (!refs.scene.getObjectByName('transformControlsHelper')) {
    const helper = refs.transformControls.getHelper();
    helper.name = 'transformControlsHelper';
    refs.scene.add(helper);
  }
}

/** 모델 리스트 UI 업데이트 */
export function updateModelListUI() {
  const ul = document.getElementById('model-list');
  if (!ul) return;

  const dragHint = document.getElementById('drag-hint');
  ul.innerHTML = '';

  if (modelList.length === 0) {
    if (dragHint) {
      dragHint.style.display = 'block';
    }
    return; 
  } else {
    if (dragHint) {
      dragHint.style.display = 'none';
    }
  }

  modelList.forEach((item, idx) => {
    const li = document.createElement('li');
    li.classList.add('model-list-item');

    const filenameDiv = document.createElement('div');
    filenameDiv.classList.add('model-filename');
    let text = `${idx + 1}. ${item.fileName}`;
    if (idx === activeItemIndex) {
      filenameDiv.classList.add('model-filename--active');
    } else {
      filenameDiv.classList.add('model-filename--inactive');
    }
    filenameDiv.textContent = text;

    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.min = '0';
    opacitySlider.max = '1';
    opacitySlider.step = '0.01';
    opacitySlider.style.width = '80px';

    const currentOpacity = (item.customOpacity !== undefined)
      ? item.customOpacity
      : (item.mesh.material.opacity ?? 1.0);
    opacitySlider.value = String(currentOpacity);

    opacitySlider.addEventListener('input', e => {
      e.stopPropagation();
      const val = parseFloat(opacitySlider.value);
      item.customOpacity = val;
      item.mesh.material.opacity = val;
    });

    const deleteBtn = document.createElement('span');
    deleteBtn.textContent = ' ❌';
    deleteBtn.style.color = '#f66';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.addEventListener('click', e => {
      e.stopPropagation();
      removeFromList(idx);
    });

    li.addEventListener('click', (e) => {
      if (e.target === opacitySlider) return;
      activeItemIndex = idx;
      setTargetMeshAsActive(item.mesh);
      fitCameraToObject(refs.camera, item.mesh, refs.controls);
    });

    li.appendChild(filenameDiv);
    li.appendChild(opacitySlider);
    li.appendChild(deleteBtn);
    ul.appendChild(li);
  });
}

/** 활성 메쉬 교체 */
function setTargetMeshAsActive(mesh) {
  if (refs.bvhHelper) {
    refs.scene.remove(refs.bvhHelper);
    refs.bvhHelper = null;
  }
  refs.targetMesh = mesh;

  const idx = modelList.findIndex(it => it.mesh === mesh);
  activeItemIndex = idx;

  modelList.forEach((item, i) => {
    const userOp = (item.customOpacity !== undefined)
      ? item.customOpacity
      : (refs.params.modelOpacity ?? 1.0);

    if (i === idx) {
      item.mesh.material = createActiveMaterial();
      item.mesh.material.opacity = userOp;
    } else {
      item.mesh.material = createInactiveMaterial();
      item.mesh.material.opacity = userOp;
    }
  });

  // BVH Helper
  if (mesh) {
    const newHelper = new MeshBVHHelper(mesh, refs.params.depth);
    if (refs.params.displayHelper) {
      refs.scene.add(newHelper);
    }
    newHelper.update();
    refs.bvhHelper = newHelper;
  }

  updateModelListUI();

  // transformMode가 true → 바운딩박스 중심에 기즈모
  if (refs.params.transformMode && mesh) {
    placeGizmoAtMeshCenter(mesh);
  }
}

/** 모델 제거 */
function removeFromList(index) {
  const item = modelList[index];
  if (item && item.mesh) {
    refs.scene.remove(item.mesh);
  }
  modelList.splice(index, 1);

  if (activeItemIndex === index) {
    activeItemIndex = -1;
    refs.targetMesh = null;
    if (refs.bvhHelper) {
      refs.scene.remove(refs.bvhHelper);
      refs.bvhHelper = null;
    }
  } else if (activeItemIndex > index) {
    activeItemIndex--;
  }

  updateModelListUI();
}

/** 씬에 모델 추가 */
function addModelToScene(geometry, fileName) {
  if (!initialGeometry) {
    initialGeometry = geometry.clone();
    initialFileName = fileName;
  }

  centerAndScaleGeometry(geometry);
  geometry = BufferGeometryUtils.mergeVertices(geometry);
  geometry.computeVertexNormals();
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
  geometry.computeBoundsTree({ setBoundingBox: false });

  const mat = createActiveMaterial();
  const newMesh = new THREE.Mesh(geometry, mat);
  newMesh.frustumCulled = false;
  refs.scene.add(newMesh);

  const item = {
    fileName,
    geometry: geometry.clone(),
    mesh: newMesh,
    customOpacity: mat.opacity,
    originalGeometry: geometry.clone()
  };
  modelList.push(item);

  if (modelList.length === 1) {
    fitCameraToObject(refs.camera, newMesh, refs.controls);
  }

  setTargetMeshAsActive(newMesh);
}

/** 폴더/파일 드래그&드롭 */
export function onDropSTL(e) {
  e.preventDefault();
  
  const items = e.dataTransfer.items;
  if (!items || items.length === 0) return;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry();
      if (entry) {
        if (entry.isFile) {
          entry.file((file) => {
            if (file.name.toLowerCase().endsWith('.stl')) {
              loadStlFileAsGeometry(file)
                .then((geometry) => {
                  addModelToScene(geometry, file.name);
                })
                .catch((err) => console.error('STL load error:', err));
            }
          });
        } else if (entry.isDirectory) {
          readDirectory(entry);
        }
      }
    }
  }
}

function readDirectory(dirEntry) {
  const reader = dirEntry.createReader();
  reader.readEntries((entries) => {
    for (const entry of entries) {
      if (entry.isFile) {
        entry.file((file) => {
          if (file.name.toLowerCase().endsWith('.stl')) {
            loadStlFileAsGeometry(file)
              .then((geometry) => {
                addModelToScene(geometry, file.name);
              })
              .catch((err) => console.error('STL load error:', err));
          }
        });
      } else if (entry.isDirectory) {
        readDirectory(entry);
      }
    }
  }, (error) => {
    console.error(error);
  });
}

export function onDragOver(e) {
  e.preventDefault();
}

/** reset() */
export function reset() {
  if (activeItemIndex < 0) {
    console.log('No active item to reset.');
    return;
  }
  const activeItem = modelList[activeItemIndex];
  if (!activeItem.originalGeometry) {
    console.log('No original geometry stored for this item.');
    return;
  }

  const oldGeo = activeItem.mesh.geometry;
  oldGeo.dispose();
  activeItem.mesh.geometry = activeItem.originalGeometry.clone();
  activeItem.mesh.geometry.computeVertexNormals();
  activeItem.mesh.geometry.computeBoundsTree({ setBoundingBox: false });

  if (refs.bvhHelper) {
    refs.scene.remove(refs.bvhHelper);
    refs.bvhHelper = null;
  }
  const newHelper = new MeshBVHHelper(activeItem.mesh, refs.params.depth);
  if (refs.params.displayHelper) {
    refs.scene.add(newHelper);
  }
  newHelper.update();
  refs.bvhHelper = newHelper;

  console.log(`Reset model: ${activeItem.fileName}`);
}

/** saveChanges() */
export function saveChanges() {
  if (activeItemIndex < 0) {
    console.log('No item selected.');
    return;
  }
  if (!refs.targetMesh) {
    console.log('No targetMesh in the scene.');
    return;
  }
  modelList[activeItemIndex].geometry = refs.targetMesh.geometry.clone();
  console.log(`Saved changes for: ${modelList[activeItemIndex].fileName}`);
}

/** exportCurrentModel() */
export function exportCurrentModel() {
  if (!refs.targetMesh) {
    console.log('No model to export.');
    return;
  }
  const exporter = new STLExporter();
  const stlString = exporter.parse(refs.targetMesh);

  const blob = new Blob([stlString], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.style.display = 'none';
  document.body.appendChild(link);
  link.href = url;
  link.download = 'exportedModel.stl';
  link.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(link);

  console.log('Exported current model as STL.');
}
