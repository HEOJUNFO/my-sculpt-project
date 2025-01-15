// modelManager.js

import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { loadStlFileAsGeometry } from './stlHelpers.js';
import { centerAndScaleGeometry } from './geometryHelpers.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVHHelper } from 'three-mesh-bvh';
import { fitCameraToObject } from './cameraHelpers.js';

// 새로 분리한 UI 모듈 (UI 관련 코드 대부분 modelListUI.js로 이동)
import { updateModelListUI } from './modelListUI.js';

export let modelList = []; // [{ fileName, geometry, mesh, customOpacity }, ...]
export let activeItemIndex = -1;
export let initialGeometry = null;
export let initialFileName = null;

export const undoStack = [];
export const redoStack = [];

/**
 * refs: scene, camera, controls, etc.
 * (transformControls도 initScene에서 할당)
 */
export const refs = {
  scene: null,
  camera: null,
  controls: null,
  targetMesh: null,
  bvhHelper: null,
  params: null, // (matcap, displayHelper, modelOpacity, transformMode, etc.)
  matcaps: null,
  transformControls: null,
};

// ------------------------
// ▼ Undo/Redo 핵심 함수들
// ------------------------

export function pushUndoState() {
  if (activeItemIndex < 0) return; // 모델이 없다면 패스
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

  console.log(
    'pushUndoState - itemIndex:',
    activeItemIndex,
    'undoStack size=',
    undoStack.length
  );
}

/** Redo 데이터 푸시 */
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

  console.log(
    'pushRedoState - itemIndex:',
    activeItemIndex,
    'redoStack size=',
    redoStack.length
  );
}

/**
 * Undo 실행
 *  1. pop undoStack
 *  2. 만약 lastState.itemIndex != activeItemIndex면, 모델 강제 교체
 *  3. geometry 복원
 *  4. 현재 상태는 redoStack에 push
 */
export function undo() {
  if (undoStack.length === 0) {
    console.log('No more undo states.');
    return;
  }

  // Undo 스택에서 마지막 상태를 꺼냄
  const lastState = undoStack.pop();

  // 만약 lastState.itemIndex와 현재 activeItemIndex가 다르면,
  // 해당 모델로 강제 전환
  if (lastState.itemIndex !== activeItemIndex) {
    setTargetMeshAsActive(modelList[lastState.itemIndex].mesh);
  }
  // 현재 상태를 redo 스택에 저장
  pushRedoState();

  

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

  console.log(
    'Undo done for itemIndex=',
    lastState.itemIndex,
    'undoStack size=',
    undoStack.length
  );
}

/**
 * Redo 실행
 *  1. pop redoStack
 *  2. 만약 lastState.itemIndex != activeItemIndex면, 모델 강제 전환
 *  3. geometry 복원
 *  4. 현재 상태는 undoStack에 push
 */
export function redo() {
  if (redoStack.length === 0) {
    console.log('No more redo states in redoStack.');
    return;
  }

  // 1) redoStack에서 마지막 상태를 꺼냄
  const lastState = redoStack.pop();

  // 2) itemIndex가 다른 경우, 먼저 활성 모델 전환
  if (lastState.itemIndex !== activeItemIndex) {
    setTargetMeshAsActive(modelList[lastState.itemIndex].mesh);
  }

  // 3) 현재(=lastState.itemIndex) 모델의 상태를 undoStack에 저장
  pushUndoState();

  // 4) geometry 복원
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

  // BVH 갱신
  geo.computeBoundsTree({ setBoundingBox: false });
  if (refs.bvhHelper && refs.bvhHelper.parent !== null) {
    refs.bvhHelper.update();
  }

  console.log(
    'Redo done for itemIndex=',
    lastState.itemIndex,
    'redoStack size=',
    redoStack.length
  );
}

/** 활성 재질 */
function createActiveMaterial() {
  return new THREE.MeshMatcapMaterial({
    matcap: refs.matcaps[refs.params.matcap],
    transparent: true,
    opacity: refs.params.modelOpacity,
    side: THREE.DoubleSide,
    flatShading: false,
  });
}

/** 비활성 재질 */
function createInactiveMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xaaaaaa,
    transparent: true,
    opacity: refs.params.modelOpacity,
    side: THREE.DoubleSide,
    flatShading: false,
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

/**
 * 모델 삭제
 * - UI 갱신도 함께 호출
 */
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

  // UI 갱신 (modelListUI.js)
  updateModelListUI(
    modelList,
    activeItemIndex,
    refs,
    removeFromList,
    setTargetMeshAsActive
  );
}

/**
 * 활성 메쉬 교체
 * - BVH Helper / 재질 / UI 갱신
 */
function setTargetMeshAsActive(mesh) {
  if (refs.bvhHelper) {
    refs.scene.remove(refs.bvhHelper);
    refs.bvhHelper = null;
  }
  refs.targetMesh = mesh;

  const idx = modelList.findIndex((it) => it.mesh === mesh);
  activeItemIndex = idx;

  modelList.forEach((item, i) => {
    const userOp =
      item.customOpacity !== undefined
        ? item.customOpacity
        : refs.params.modelOpacity ?? 1.0;

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

  // UI 갱신 (modelListUI.js)
  updateModelListUI(
    modelList,
    activeItemIndex,
    refs,
    removeFromList,
    setTargetMeshAsActive
  );

  // transformMode가 true라면 바운딩박스 중심에 기즈모
  if (refs.params.transformMode && mesh) {
    placeGizmoAtMeshCenter(mesh);
  }
}

/**
 * 씬에 모델 추가
 */
export function addModelToScene(geometry, fileName) {
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
    originalGeometry: geometry.clone(),
  };
  modelList.push(item);

  // 첫 모델이면 카메라 맞춤
  if (modelList.length === 1) {
    fitCameraToObject(refs.camera, newMesh, refs.controls);
  }

  // 새로 추가된 메쉬를 활성화
  setTargetMeshAsActive(newMesh);
}

/** 
 * 폴더를 재귀적으로 읽어 STL 파일을 로드하는 Promise 반환 함수
 */
function readDirectoryPromise(dirEntry) {
  return new Promise((resolve, reject) => {
    const reader = dirEntry.createReader();
    reader.readEntries(
      (entries) => {
        // 하위 파일/폴더 각각에 대해 Promise를 생성해 저장할 배열
        const promises = [];

        for (const entry of entries) {
          if (entry.isFile) {
            // 파일인 경우
            const p = new Promise((res, rej) => {
              entry.file((file) => {
                if (file.name.toLowerCase().endsWith('.stl')) {
                  loadStlFileAsGeometry(file)
                    .then((geometry) => {
                      addModelToScene(geometry, file.name);
                      res();
                    })
                    .catch((err) => {
                      console.error('STL load error:', err);
                      rej(err);
                    });
                } else {
                  // STL 파일이 아니면 그냥 통과
                  res();
                }
              });
            });
            promises.push(p);
          } else if (entry.isDirectory) {
            // 폴더면 재귀
            promises.push(readDirectoryPromise(entry));
          }
        }

        // 현재 디렉토리의 모든 항목 로딩이 끝나면 resolve
        Promise.all(promises)
          .then(() => resolve())
          .catch((err) => reject(err));
      },
      (error) => {
        console.error(error);
        reject(error);
      }
    );
  });
}

/**
 * onDropSTL(e) - 드래그앤드롭으로 STL 추가
 * => 모든 모델 로딩이 끝나는 시점에 console.log 출력
 */
export function onDropSTL(e) {
  e.preventDefault();

  const items = e.dataTransfer.items;
  if (!items || items.length === 0) return;

  // '로딩 완료'를 체크하기 위해 Promise를 담을 배열
  const loadPromises = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry();
      if (entry) {
        // 파일이라면
        if (entry.isFile) {
          // 폴더가 아닌 실제 파일
          const p = new Promise((resolve, reject) => {
            entry.file((file) => {
              if (file.name.toLowerCase().endsWith('.stl')) {
                loadStlFileAsGeometry(file)
                  .then((geometry) => {
                    addModelToScene(geometry, file.name);
                    resolve();
                  })
                  .catch((err) => {
                    console.error('STL load error:', err);
                    reject(err);
                  });
              } else {
                // STL이 아니면 그냥 성공 처리
                resolve();
              }
            });
          });
          loadPromises.push(p);
        } else if (entry.isDirectory) {
          // 폴더라면 재귀적으로 처리
          loadPromises.push(readDirectoryPromise(entry));
        }
      }
    }
  }

  // 모든 로드/파싱이 끝나면 실행
  Promise.all(loadPromises)
    .then(() => {
      console.log('모든 STL 파일 로딩이 완료되었습니다!');
    })
    .catch((error) => {
      console.error('드롭한 파일들 중 로딩 실패가 있었습니다.', error);
    });
}

export function onDragOver(e) {
  e.preventDefault();
}

/**
 * reset()
 */
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

/**
 * saveChanges()
 */
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

/**
 * exportCurrentModel()
 */
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
