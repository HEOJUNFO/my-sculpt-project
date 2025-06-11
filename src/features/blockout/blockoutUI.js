// src/blockoutUI.js
import * as THREE from 'three';
import { refs } from '../../models/modelManager.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { completeBlockout } from '../../workflow/processSteps.js'; // 프로세스 단계 관리 임포트

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
      console.log(`Blockout distance set to: ${value}`);
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
    const direction = new THREE.Vector3();
    refs.camera.getWorldDirection(direction);
    savedCameraState = {
      position: refs.camera.position.clone(),
      target: refs.controls.target.clone(),
      quaternion: refs.camera.quaternion.clone(),
      direction: direction.clone()
    };
    console.log('Camera state saved:', savedCameraState);
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
  
  const blockoutMaterial = new THREE.MeshMatcapMaterial({
    matcap: refs.matcaps['sky'],
    side: THREE.DoubleSide,
    flatShading: false,
  });
  
  // Get blockout distance from slider if available
  let blockoutDistance = 0.1; // Default distance
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
  const blockoutGeometries = [];
  
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
  
    // Create extruded triangle (prism)
    const a2 = a.clone().addScaledVector(insertionDir, blockoutDistance);
    const b2 = b.clone().addScaledVector(insertionDir, blockoutDistance);
    const c2 = c.clone().addScaledVector(insertionDir, blockoutDistance);
  
    const vertices = [];
    // Top face
    vertices.push(a2.x, a2.y, a2.z, b2.x, b2.y, b2.z, c2.x, c2.y, c2.z);
    // Bottom face
    vertices.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
    // Side 1
    vertices.push(a.x, a.y, a.z, b.x, b.y, b.z, b2.x, b2.y, b2.z);
    vertices.push(a.x, a.y, a.z, b2.x, b2.y, b2.z, a2.x, a2.y, a2.z);
    // Side 2
    vertices.push(b.x, b.y, b.z, c.x, c.y, c.z, c2.x, c2.y, c2.z);
    vertices.push(b.x, b.y, b.z, c2.x, c2.y, c2.z, b2.x, b2.y, b2.z);
    // Side 3
    vertices.push(c.x, c.y, c.z, a.x, a.y, a.z, a2.x, a2.y, a2.z);
    vertices.push(c.x, c.y, c.z, a2.x, a2.y, a2.z, c2.x, c2.y, c2.z);
  
    const prismGeometry = new THREE.BufferGeometry();
    prismGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    prismGeometry.computeVertexNormals();

    const nonIndexedPrismGeometry = prismGeometry.index ? prismGeometry.toNonIndexed() : prismGeometry;
    blockoutGeometries.push(nonIndexedPrismGeometry);
  }
  
  if (blockoutGeometries.length > 0) {
    // 이 부분이 수정된 부분: 병합하지 않고 별도 메쉬로 생성
    
    // 모든 블록아웃 지오메트리 통합
    const mergedBlockoutGeometry = BufferGeometryUtils.mergeGeometries(blockoutGeometries, false);
    mergedBlockoutGeometry.computeVertexNormals();
    mergedBlockoutGeometry.computeBoundingSphere();
    
    // 블록아웃 메쉬 생성 (별도 메쉬)
    const blockoutMesh = new THREE.Mesh(mergedBlockoutGeometry, blockoutMaterial);
    blockoutMesh.name = 'BlockoutMesh';
    blockoutMesh.userData = {
      type: 'blockout',
      createdAt: new Date().toISOString()
    };
    
    // 씬에 별도로 추가
    refs.scene.add(blockoutMesh);
    
    console.log(`블록아웃 메쉬 생성 완료: ${triangleCount}개 언더컷 영역 처리됨`);
    
    // 언더컷 시각화를 제거하는 대신 숨김
    if (undercutMesh) {
      undercutMesh.visible = false;
    }
  }
}