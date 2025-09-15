// src/blockoutUI.js
import * as THREE from 'three';
import { refs } from '../../models/modelManager.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { completeBlockout } from '../../workflow/processSteps.js'; 
import { setReferenceDirection } from '../../utils/referenceDirection.js';

// Saved camera state for blockout operations
let savedCameraState = null;
let undercutMesh = null;

export function setupBlockoutUI() {
  // Get the blockout UI elements
  const btnDetectUndercuts = document.getElementById('btn-detect-undercuts');
  const btnApplyBlockout = document.getElementById('btn-apply-blockout');
  const btnRestoreCamera = document.getElementById('btn-restore-camera');
  const btnResetBlockout = document.getElementById('btn-reset-blockout'); // 초기화 버튼
  const btnComplete = document.getElementById('btn-blockout-complete');
  const blockoutDistanceSlider = document.getElementById('blockoutDistanceRange');

  // Add event listeners
  btnDetectUndercuts?.addEventListener('click', detectUndercuts);
  btnApplyBlockout?.addEventListener('click', applyBlockout);
  btnRestoreCamera?.addEventListener('click', restoreCamera);
  btnResetBlockout?.addEventListener('click', resetBlockout); // 초기화 버튼 이벤트
  btnComplete?.addEventListener('click', () => {
    // Clean up any undercut visualization - 제거 대신 숨김
    if (undercutMesh) {
      undercutMesh.visible = false;
    }
    
    // 블록아웃 완료 처리
    completeBlockout();
  });
  
  // Blockout distance slider
  if (blockoutDistanceSlider) {
    blockoutDistanceSlider.addEventListener('input', () => {
      // Update the display if needed
      const value = parseFloat(blockoutDistanceSlider.value);
    });
  }
}

// 블록아웃 초기화 함수
function resetBlockout() {
  // 1. 블록아웃 메쉬 찾아서 제거
  const blockoutMeshes = [];
  refs.scene.traverse((child) => {
    if (child.name === 'BlockoutMesh' || child.userData.type === 'blockout') {
      blockoutMeshes.push(child);
    }
  });
  
  // 블록아웃 메쉬들 제거
  blockoutMeshes.forEach(mesh => {
    refs.scene.remove(mesh);
    mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(mat => mat.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  });
  
  // 2. 언더컷 시각화 다시 표시
  if (undercutMesh) {
    undercutMesh.visible = true;
  }
  
  console.log(`블록아웃 초기화 완료: ${blockoutMeshes.length}개의 블록아웃 메쉬 제거됨`);
  
  // 사용자에게 알림
  const messageElement = document.getElementById('blockout-message');
  if (messageElement) {
    messageElement.textContent = `블록아웃이 초기화되었습니다. (${blockoutMeshes.length}개 제거)`;
    messageElement.style.opacity = '1';
    setTimeout(() => {
      messageElement.style.opacity = '0';
      setTimeout(() => {
        messageElement.textContent = '';
      }, 300);
    }, 3000);
  }
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
    const direction = new THREE.Vector3();
    refs.camera.getWorldDirection(direction);
    savedCameraState = {
      position: refs.camera.position.clone(),
      target: refs.controls.target.clone(),
      quaternion: refs.camera.quaternion.clone(),
      direction: direction.clone()
    };

    refs.camerastate = savedCameraState;

    if (window.referenceDirection && window.referenceDirection.set) {
      window.referenceDirection.set(refs.camera, direction.clone().negate());
      console.log('기준 방향이 설정되었습니다 (언더컷 감지 시점)');
    }
  }
  
  // Clean up previous undercut mesh if it exists
  if (undercutMesh) {
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
  
  // threshold를 0.1로 변경 (기존 0.01에서 변경)
  const threshold = 0.1;
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
  });
  
  undercutMesh = new THREE.Mesh(undercutGeometry, redMaterial);
  undercutMesh.renderOrder = 999;  
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
  if (!refs.targetMesh || !undercutMesh) {
    console.warn('No target mesh or undercuts detected');
    return;
  }
  
  // 두 개의 마테리얼 준비
  const skyMaterial = new THREE.MeshMatcapMaterial({
    matcap: refs.matcaps['sky'],
    side: THREE.DoubleSide,
    flatShading: false,
  });
  
  // 타겟 메쉬의 마테리얼 복사
  let targetMaterial;
  if (refs.targetMesh.material) {
    targetMaterial = refs.targetMesh.material.clone();
    targetMaterial.side = THREE.DoubleSide;
  } else {
    targetMaterial = new THREE.MeshStandardMaterial({
      color: 0x808080,
      side: THREE.DoubleSide,
    });
  }
  
  // Get blockout distance from slider if available
  let blockoutDistance = 0.1;
  const blockoutSlider = document.getElementById('blockoutDistanceRange');
  if (blockoutSlider) {
    blockoutDistance = parseFloat(blockoutSlider.value);
  }
  
  const insertionDir = new THREE.Vector3();
  
  if (savedCameraState && savedCameraState.direction) {
    insertionDir.copy(savedCameraState.direction);
  } else {
    refs.camera.getWorldDirection(insertionDir);
  }
  
  const undercutPositions = undercutMesh.geometry.attributes.position.array;
  const triangleCount = undercutPositions.length / 9;
  
  // 상단과 하단을 위한 별도 지오메트리 배열
  const topGeometries = [];
  const bottomGeometries = [];

  const halfDistance = blockoutDistance * 0.05;
  
  for (let i = 0; i < triangleCount; i++) {
    const a = new THREE.Vector3(
      undercutPositions[i * 9],
      undercutPositions[i * 9 + 1],
      undercutPositions[i * 9 + 2]
    );
    const b = new THREE.Vector3(
      undercutPositions[i * 9 + 3],
      undercutPositions[i * 9 + 4],
      undercutPositions[i * 9 + 5]
    );
    const c = new THREE.Vector3(
      undercutPositions[i * 9 + 6],
      undercutPositions[i * 9 + 7],
      undercutPositions[i * 9 + 8]
    );
  
    // Create extruded points
    const a2 = a.clone().addScaledVector(insertionDir, blockoutDistance);
    const b2 = b.clone().addScaledVector(insertionDir, blockoutDistance);
    const c2 = c.clone().addScaledVector(insertionDir, blockoutDistance);
    
    // 중간점
    const aMid = a.clone().addScaledVector(insertionDir, halfDistance);
    const bMid = b.clone().addScaledVector(insertionDir, halfDistance);
    const cMid = c.clone().addScaledVector(insertionDir, halfDistance);
  
    // 상단 부분 (하늘색)
    const topVertices = [];
    // Top face
    topVertices.push(a2.x, a2.y, a2.z, b2.x, b2.y, b2.z, c2.x, c2.y, c2.z);
    // Side faces - upper half
    topVertices.push(aMid.x, aMid.y, aMid.z, bMid.x, bMid.y, bMid.z, b2.x, b2.y, b2.z);
    topVertices.push(aMid.x, aMid.y, aMid.z, b2.x, b2.y, b2.z, a2.x, a2.y, a2.z);
    topVertices.push(bMid.x, bMid.y, bMid.z, cMid.x, cMid.y, cMid.z, c2.x, c2.y, c2.z);
    topVertices.push(bMid.x, bMid.y, bMid.z, c2.x, c2.y, c2.z, b2.x, b2.y, b2.z);
    topVertices.push(cMid.x, cMid.y, cMid.z, aMid.x, aMid.y, aMid.z, a2.x, a2.y, a2.z);
    topVertices.push(cMid.x, cMid.y, cMid.z, a2.x, a2.y, a2.z, c2.x, c2.y, c2.z);
    
    const topGeometry = new THREE.BufferGeometry();
    topGeometry.setAttribute('position', new THREE.Float32BufferAttribute(topVertices, 3));
    topGeometries.push(topGeometry);
  
    // 하단 부분 (타겟 메쉬 마테리얼)
    const bottomVertices = [];
    // Bottom face
    bottomVertices.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
    // Side faces - lower half
    bottomVertices.push(a.x, a.y, a.z, b.x, b.y, b.z, bMid.x, bMid.y, bMid.z);
    bottomVertices.push(a.x, a.y, a.z, bMid.x, bMid.y, bMid.z, aMid.x, aMid.y, aMid.z);
    bottomVertices.push(b.x, b.y, b.z, c.x, c.y, c.z, cMid.x, cMid.y, cMid.z);
    bottomVertices.push(b.x, b.y, b.z, cMid.x, cMid.y, cMid.z, bMid.x, bMid.y, bMid.z);
    bottomVertices.push(c.x, c.y, c.z, a.x, a.y, a.z, aMid.x, aMid.y, aMid.z);
    bottomVertices.push(c.x, c.y, c.z, aMid.x, aMid.y, aMid.z, cMid.x, cMid.y, cMid.z);
    
    const bottomGeometry = new THREE.BufferGeometry();
    bottomGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bottomVertices, 3));
    bottomGeometries.push(bottomGeometry);
  }
  
  // 상단과 하단을 각각 병합
  if (topGeometries.length > 0 && bottomGeometries.length > 0) {
    const mergedTopGeometry = BufferGeometryUtils.mergeGeometries(topGeometries, false);
    mergedTopGeometry.computeVertexNormals();
    
    const mergedBottomGeometry = BufferGeometryUtils.mergeGeometries(bottomGeometries, false);
    mergedBottomGeometry.computeVertexNormals();
    
    // 두 개의 메쉬 생성
    const topMesh = new THREE.Mesh(mergedTopGeometry, skyMaterial);
    topMesh.name = 'BlockoutMeshTop';
    topMesh.userData = { type: 'blockout', part: 'top' };
    
    const bottomMesh = new THREE.Mesh(mergedBottomGeometry, targetMaterial);
    bottomMesh.name = 'BlockoutMeshBottom';
    bottomMesh.userData = { type: 'blockout', part: 'bottom' };
    
    // 그룹으로 묶어서 씬에 추가
    const blockoutGroup = new THREE.Group();
    blockoutGroup.name = 'BlockoutMesh';
    blockoutGroup.userData = {
      type: 'blockout',
      createdAt: new Date().toISOString()
    };
    blockoutGroup.add(topMesh);
    blockoutGroup.add(bottomMesh);
    
    refs.scene.add(blockoutGroup);
    
    console.log(`블록아웃 메쉬 생성 완료: ${triangleCount}개 언더컷 영역 처리됨`);
    console.log(`상단: 하늘색 마테리얼, 하단: 타겟 메쉬 마테리얼`);
    
    // 언더컷 시각화를 제거하는 대신 숨김
    if (undercutMesh) {
      undercutMesh.visible = false;
    }
  }
}