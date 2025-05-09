// src/blockoutUI.js
import * as THREE from 'three';
import { refs } from './modelManager.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { completeBlockout } from './processSteps.js'; // 프로세스 단계 관리 임포트

// Saved camera state for blockout operations
let savedCameraState = null;
let undercutMesh = null;

export function setupBlockoutUI() {
  // Get the blockout UI elements
  const btnDetectUndercuts = document.getElementById('btn-detect-undercuts');
  const btnApplyBlockout = document.getElementById('btn-apply-blockout');
  const btnRestoreCamera = document.getElementById('btn-restore-camera');
  const btnComplete = document.getElementById('btn-blockout-complete');
  const blockoutDistanceSlider = document.getElementById('blockoutDistanceRange');

  // Add event listeners
  btnDetectUndercuts?.addEventListener('click', detectUndercuts);
  btnApplyBlockout?.addEventListener('click', applyBlockout);
  btnRestoreCamera?.addEventListener('click', restoreCamera);
  btnComplete?.addEventListener('click', () => {
    // Clean up any undercut visualization
    if (undercutMesh && undercutMesh.parent) {
      refs.scene.remove(undercutMesh);
      undercutMesh.geometry.dispose();
      undercutMesh.material.dispose();
      undercutMesh = null;
    }
    
    // 블록아웃 완료 처리
    completeBlockout();
  });
  
  // Blockout distance slider
  if (blockoutDistanceSlider) {
    blockoutDistanceSlider.addEventListener('input', () => {
      // Update the display if needed
      const value = parseFloat(blockoutDistanceSlider.value);
      console.log(`Blockout distance set to: ${value}`);
    });
  }
}

// Save current camera state
function saveCameraState() {
  const direction = new THREE.Vector3();
  refs.camera.getWorldDirection(direction);
  
  savedCameraState = {
    position: refs.camera.position.clone(),
    target: refs.controls.target.clone(),
    quaternion: refs.camera.quaternion.clone(),
    direction: direction.clone()
  };
  
  console.log('Camera state saved for blockout');
}

// Restore saved camera state
function restoreCamera() {
  if (savedCameraState) {
    refs.camera.position.copy(savedCameraState.position);
    refs.controls.target.copy(savedCameraState.target);
    refs.camera.quaternion.copy(savedCameraState.quaternion);
    refs.controls.update();
    console.log('Camera restored to saved state');
  } else {
    console.warn('No saved camera state to restore');
  }
}

// Detect undercuts from current camera view
function detectUndercuts() {
  if (!refs.targetMesh) {
    console.warn('No target mesh to detect undercuts on');
    return;
  }
  
  // Save camera state if not already saved
  if (!savedCameraState) {
    saveCameraState();
  }
  
  // Clean up previous undercut mesh if it exists
  if (undercutMesh && undercutMesh.parent) {
    refs.scene.remove(undercutMesh);
    undercutMesh.geometry.dispose();
    undercutMesh.material.dispose();
    undercutMesh = null;
  }
  
  refs.targetMesh.updateMatrixWorld(true);
  const geometry = refs.targetMesh.geometry;
  const posAttr = geometry.attributes.position;
  const indexAttr = geometry.index;
  const matrixWorld = refs.targetMesh.matrixWorld;
  const cameraPos = refs.camera.position;
  
  const undercutPositions = [];
  const undercutNormals = [];
  
  // Use a small threshold to detect faces facing away from camera
  const threshold = 0.01;
  const triangleCount = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;
  
  for (let i = 0; i < triangleCount; i++) {
    let a, b, c;
    if (indexAttr) {
      const aIndex = indexAttr.getX(i * 3);
      const bIndex = indexAttr.getX(i * 3 + 1);
      const cIndex = indexAttr.getX(i * 3 + 2);
      a = new THREE.Vector3().fromBufferAttribute(posAttr, aIndex).applyMatrix4(matrixWorld);
      b = new THREE.Vector3().fromBufferAttribute(posAttr, bIndex).applyMatrix4(matrixWorld);
      c = new THREE.Vector3().fromBufferAttribute(posAttr, cIndex).applyMatrix4(matrixWorld);
    } else {
      a = new THREE.Vector3().fromBufferAttribute(posAttr, i * 3).applyMatrix4(matrixWorld);
      b = new THREE.Vector3().fromBufferAttribute(posAttr, i * 3 + 1).applyMatrix4(matrixWorld);
      c = new THREE.Vector3().fromBufferAttribute(posAttr, i * 3 + 2).applyMatrix4(matrixWorld);
    }
  
    // Calculate triangle center and normal
    const center = new THREE.Vector3().addVectors(a, b).add(c).divideScalar(3);
    const ab = new THREE.Vector3().subVectors(b, a);
    const ac = new THREE.Vector3().subVectors(c, a);
    const normal = new THREE.Vector3().crossVectors(ab, ac).normalize();
    
    // Calculate view vector (from triangle center to camera)
    const viewVec = new THREE.Vector3().subVectors(cameraPos, center).normalize();
  
    // Check if face is facing away from camera (undercut)
    const dot = normal.dot(viewVec);
    if (dot <= threshold) {
      undercutPositions.push(a.x, a.y, a.z);
      undercutPositions.push(b.x, b.y, b.z);
      undercutPositions.push(c.x, c.y, c.z);
  
      undercutNormals.push(normal.x, normal.y, normal.z);
      undercutNormals.push(normal.x, normal.y, normal.z);
      undercutNormals.push(normal.x, normal.y, normal.z);
    }
  }
  
  // Create visualization for undercuts
  const undercutGeometry = new THREE.BufferGeometry();
  undercutGeometry.setAttribute('position', new THREE.Float32BufferAttribute(undercutPositions, 3));
  undercutGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(undercutNormals, 3));
  
  const redMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5,
    depthTest: true,      // 깊이 테스트 비활성화
    depthWrite: false      // 깊이 버퍼에 쓰지 않음
  });
  
  undercutMesh = new THREE.Mesh(undercutGeometry, redMaterial);
  undercutMesh.renderOrder = 9999;  // 높은 렌더링 순서 설정
  
  // 미세하게 오프셋을 주어 Z-fighting 방지
  const offsetDirection = new THREE.Vector3();
  if (savedCameraState && savedCameraState.direction) {
    offsetDirection.copy(savedCameraState.direction);
  } else {
    refs.camera.getWorldDirection(offsetDirection);
  }
  offsetDirection.negate();  // 카메라 방향의 반대 방향으로 오프셋
  undercutMesh.position.addScaledVector(offsetDirection, 0.001);
  
  refs.scene.add(undercutMesh);
  
  const undercutCount = undercutPositions.length / 9; // Each triangle has 3 vertices, each vertex has 3 coordinates
  console.log(`Detected ${undercutCount} undercut triangles`);
  
  // Update the UI with the count if needed
  const countElement = document.getElementById('undercut-count');
  if (countElement) {
    countElement.textContent = `${undercutCount} undercuts detected`;
  }
}

function applyBlockout() {
  if (!refs.targetMesh) {
    console.warn('대상 메시가 없어 블록아웃을 적용할 수 없습니다');
    return;
  }
  
  // 언더컷이 감지되었는지 확인
  if (!undercutMesh || !undercutMesh.parent) {
    console.warn('감지된 언더컷이 없습니다. 먼저 언더컷을 감지해주세요.');
    return;
  }
  
  // 슬라이더에서 블록아웃 거리 가져오기
  const blockoutDistanceSlider = document.getElementById('blockoutDistanceRange');
  const blockoutDistance = blockoutDistanceSlider ? parseFloat(blockoutDistanceSlider.value) : 0.1;
  
  console.log(`블록아웃 적용 중: 거리 = ${blockoutDistance}`);
  
  // 대상 메시에서 지오메트리 데이터 가져오기
  refs.targetMesh.updateMatrixWorld(true);
  const geometry = refs.targetMesh.geometry;
  const posAttr = geometry.attributes.position;
  const indexAttr = geometry.index;
  const matrixWorld = refs.targetMesh.matrixWorld;
  
  // 중복 작업을 피하기 위해 수정된 정점을 추적할 Set 생성
  const modifiedVertices = new Set();
  
  // 저장된 상태나 현재 카메라에서 카메라 위치 가져오기
  const cameraPos = savedCameraState ? savedCameraState.position.clone() : refs.camera.position.clone();
  
  // 카메라에서 멀어지는 면을 감지하기 위한 임계값 (detectUndercuts와 동일)
  const threshold = 0.01;
  const triangleCount = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;
  
  // 메시의 각 삼각형에 대해
  for (let i = 0; i < triangleCount; i++) {
    let a, b, c;
    let aIndex, bIndex, cIndex;
    
    if (indexAttr) {
      aIndex = indexAttr.getX(i * 3);
      bIndex = indexAttr.getX(i * 3 + 1);
      cIndex = indexAttr.getX(i * 3 + 2);
      a = new THREE.Vector3().fromBufferAttribute(posAttr, aIndex).applyMatrix4(matrixWorld);
      b = new THREE.Vector3().fromBufferAttribute(posAttr, bIndex).applyMatrix4(matrixWorld);
      c = new THREE.Vector3().fromBufferAttribute(posAttr, cIndex).applyMatrix4(matrixWorld);
    } else {
      aIndex = i * 3;
      bIndex = i * 3 + 1;
      cIndex = i * 3 + 2;
      a = new THREE.Vector3().fromBufferAttribute(posAttr, aIndex).applyMatrix4(matrixWorld);
      b = new THREE.Vector3().fromBufferAttribute(posAttr, bIndex).applyMatrix4(matrixWorld);
      c = new THREE.Vector3().fromBufferAttribute(posAttr, cIndex).applyMatrix4(matrixWorld);
    }
    
    // 삼각형 중심과 노멀 계산
    const center = new THREE.Vector3().addVectors(a, b).add(c).divideScalar(3);
    const ab = new THREE.Vector3().subVectors(b, a);
    const ac = new THREE.Vector3().subVectors(c, a);
    const normal = new THREE.Vector3().crossVectors(ab, ac).normalize();
    
    // 시점 벡터 계산 (삼각형 중심에서 카메라 방향)
    const viewVec = new THREE.Vector3().subVectors(cameraPos, center).normalize();
    
    // 면이 카메라로부터 멀어지는지 확인 (언더컷)
    const dot = normal.dot(viewVec);
    if (dot <= threshold) {
      // 이 삼각형은 언더컷이므로 정점을 블록아웃 방향으로 이동
      
      // 월드 공간 정점을 수정을 위해 로컬 좌표로 변환
      const localA = new THREE.Vector3().fromBufferAttribute(posAttr, aIndex);
      const localB = new THREE.Vector3().fromBufferAttribute(posAttr, bIndex);
      const localC = new THREE.Vector3().fromBufferAttribute(posAttr, cIndex);
      
      // 월드 공간에서 로컬 공간으로 시점 벡터 변환
      const inverseMatrix = new THREE.Matrix4().copy(matrixWorld).invert();
      const localViewVec = viewVec.clone().transformDirection(inverseMatrix);
      
      // 방향을 반대로 하기 위해 localViewVec의 방향을 반전
      localViewVec.negate();
      
      // 아직 수정되지 않은 정점에 블록아웃 적용
      if (!modifiedVertices.has(aIndex)) {
        modifiedVertices.add(aIndex);
        const newPos = localA.clone().addScaledVector(localViewVec, blockoutDistance);
        posAttr.setXYZ(aIndex, newPos.x, newPos.y, newPos.z);
      }
      
      if (!modifiedVertices.has(bIndex)) {
        modifiedVertices.add(bIndex);
        const newPos = localB.clone().addScaledVector(localViewVec, blockoutDistance);
        posAttr.setXYZ(bIndex, newPos.x, newPos.y, newPos.z);
      }
      
      if (!modifiedVertices.has(cIndex)) {
        modifiedVertices.add(cIndex);
        const newPos = localC.clone().addScaledVector(localViewVec, blockoutDistance);
        posAttr.setXYZ(cIndex, newPos.x, newPos.y, newPos.z);
      }
    }
  }
  
  // 지오메트리 업데이트
  posAttr.needsUpdate = true;
  geometry.computeVertexNormals();
  
  // 지오메트리에 BVH가 있는 경우 업데이트
  if (geometry.boundsTree) {
    geometry.boundsTree.refit();
  }
  
  // BVH 헬퍼 업데이트
  if (refs.bvhHelper) {
    refs.bvhHelper.update();
  }
  
  // 언더컷 시각화 정리
  if (undercutMesh && undercutMesh.parent) {
    refs.scene.remove(undercutMesh);
    undercutMesh.geometry.dispose();
    undercutMesh.material.dispose();
    undercutMesh = null;
  }
  
  console.log(`블록아웃이 ${modifiedVertices.size}개의 정점에 적용되었습니다.`);
  
  // UI 업데이트
  const countElement = document.getElementById('undercut-count');
  if (countElement) {
    countElement.textContent = `블록아웃이 ${modifiedVertices.size}개의 정점에 적용되었습니다`;
  }
}