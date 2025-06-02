// src/intersectionDetection.js
import * as THREE from 'three';
import { refs } from '../models/modelManager.js';

// 교차점 표시 관련 변수들
let intersectionMeshes = [];
let isIntersectionVisible = false;
let intersectionMaterial = null;

/**
 * 교차점 표시 시스템 초기화
 */
export function initIntersectionDetection() {
  // 교차점 표시용 재질 생성
  intersectionMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000, // 빨간색
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false
  });
  
  console.log('교차점 검출 시스템 초기화 완료');
}

/**
 * 두 메시 간의 교차점을 검출하는 함수
 * @param {THREE.Mesh} meshA - 첫 번째 메시 (원본 모델)
 * @param {THREE.Mesh} meshB - 두 번째 메시 (치아 모델)
 * @returns {Array} 교차하는 삼각형들의 정보
 */
function detectMeshIntersection(meshA, meshB) {
  const intersections = [];
  
  // 메시 A와 B의 월드 변환 매트릭스 업데이트
  meshA.updateMatrixWorld(true);
  meshB.updateMatrixWorld(true);
  
  // 바운딩 박스 교차 검사부터 시작
  const boxA = new THREE.Box3().setFromObject(meshA);
  const boxB = new THREE.Box3().setFromObject(meshB);
  
  if (!boxA.intersectsBox(boxB)) {
    console.log('바운딩 박스가 교차하지 않음');
    return intersections;
  }
  
  console.log('바운딩 박스 교차 확인됨');
  
  // 더 정확한 교차 검사 - 정점 단위
  const geometryA = meshA.geometry;
  const geometryB = meshB.geometry;
  
  const positionsA = geometryA.attributes.position.array;
  const positionsB = geometryB.attributes.position.array;
  
  const matrixA = meshA.matrixWorld;
  const matrixB = meshB.matrixWorld;
  
  const vertexA = new THREE.Vector3();
  const vertexB = new THREE.Vector3();
  
  const intersectionThreshold = 0.05; // 교차 임계값 (조정 가능)
  const intersectionPoints = [];
  
  // 메시 A의 정점들을 메시 B와 비교
  for (let i = 0; i < positionsA.length; i += 3) {
    vertexA.set(positionsA[i], positionsA[i + 1], positionsA[i + 2]);
    vertexA.applyMatrix4(matrixA);
    
    // 메시 B의 바운딩 박스 내에 있는지 확인
    if (boxB.containsPoint(vertexA)) {
      // 메시 B의 가장 가까운 정점 찾기
      let minDistance = Infinity;
      let closestPoint = null;
      
      for (let j = 0; j < positionsB.length; j += 3) {
        vertexB.set(positionsB[j], positionsB[j + 1], positionsB[j + 2]);
        vertexB.applyMatrix4(matrixB);
        
        const distance = vertexA.distanceTo(vertexB);
        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = vertexB.clone();
        }
      }
      
      // 임계값보다 가까우면 교차점으로 간주
      if (minDistance < intersectionThreshold) {
        intersectionPoints.push({
          point: vertexA.clone(),
          distance: minDistance,
          meshA: meshA,
          meshB: meshB
        });
      }
    }
  }
  
  console.log(`교차점 ${intersectionPoints.length}개 발견`);
  return intersectionPoints;
}

/**
 * 교차점들을 시각화하는 함수
 * @param {Array} intersectionPoints - 교차점 배열
 */
function visualizeIntersections(intersectionPoints) {
  // 기존 교차점 메시들 제거
  clearIntersectionVisualization();
  
  if (intersectionPoints.length === 0) {
    console.log('시각화할 교차점이 없습니다.');
    return;
  }
  
  // 교차점들을 구체로 표시
  intersectionPoints.forEach((intersection, index) => {
    const sphereGeometry = new THREE.SphereGeometry(0.005, 8, 8);
    const sphereMesh = new THREE.Mesh(sphereGeometry, intersectionMaterial.clone());
    
    sphereMesh.position.copy(intersection.point);
    sphereMesh.userData = {
      type: 'intersectionMarker',
      distance: intersection.distance,
      index: index
    };
    
    // 렌더링 순서를 높게 설정하여 다른 객체 위에 표시
    sphereMesh.renderOrder = 9999;
    
    refs.scene.add(sphereMesh);
    intersectionMeshes.push(sphereMesh);
  });
  
  console.log(`${intersectionPoints.length}개 교차점 시각화 완료`);
}

/**
 * 고급 교차점 검출 - 레이캐스팅 기반
 * @param {THREE.Mesh} baseMesh - 원본 메시 (잇몸)
 * @param {THREE.Mesh} toothMesh - 치아 메시
 */
function detectAdvancedIntersection(baseMesh, toothMesh) {
  const intersectionData = [];
  
  // 치아 메시의 정점들에서 원본 메시로 레이캐스팅
  const raycaster = new THREE.Raycaster();
  const geometry = toothMesh.geometry;
  const positions = geometry.attributes.position.array;
  const matrix = toothMesh.matrixWorld;
  
  const vertex = new THREE.Vector3();
  const direction = new THREE.Vector3();
  
  for (let i = 0; i < positions.length; i += 3) {
    // 치아 정점의 월드 좌표
    vertex.set(positions[i], positions[i + 1], positions[i + 2]);
    vertex.applyMatrix4(matrix);
    
    // 정점에서 원본 메시 중심 방향으로 레이 생성
    const meshCenter = new THREE.Vector3();
    baseMesh.geometry.computeBoundingBox();
    baseMesh.geometry.boundingBox.getCenter(meshCenter);
    meshCenter.applyMatrix4(baseMesh.matrixWorld);
    
    direction.subVectors(meshCenter, vertex).normalize();
    
    raycaster.set(vertex, direction);
    
    // 원본 메시와의 교차 검사
    const intersects = raycaster.intersectObject(baseMesh);
    
    if (intersects.length > 0) {
      const intersection = intersects[0];
      // 교차점이 매우 가까우면 겹침으로 간주
      if (intersection.distance < 0.02) { // 임계값 조정 가능
        intersectionData.push({
          point: intersection.point.clone(),
          distance: intersection.distance,
          normal: intersection.face.normal.clone(),
          meshA: baseMesh,
          meshB: toothMesh,
          vertexIndex: i / 3
        });
      }
    }
  }
  
  return intersectionData;
}

/**
 * 모든 치아 모델과 원본 모델 간의 교차점 검출
 */
export function detectAllIntersections() {
  console.log('전체 교차점 검출 시작...');
  
  // 원본 모델(잇몸) 찾기
  const baseMesh = findBaseMesh();
  if (!baseMesh) {
    console.error('원본 모델을 찾을 수 없습니다.');
    return;
  }
  
  // 배치된 치아 모델들 찾기
  const toothMeshes = findAllToothMeshes();
  if (toothMeshes.length === 0) {
    console.warn('배치된 치아 모델이 없습니다.');
    return;
  }
  
  console.log(`원본 모델: ${baseMesh.userData?.fileName || 'Unknown'}`);
  console.log(`치아 모델 개수: ${toothMeshes.length}`);
  
  let allIntersections = [];
  
  // 각 치아 모델에 대해 교차점 검출
  toothMeshes.forEach((toothMesh, index) => {
    console.log(`치아 ${index + 1} (ID: ${toothMesh.userData?.toothId}) 교차점 검출 중...`);
    
    // 고급 교차점 검출 사용
    const intersections = detectAdvancedIntersection(baseMesh, toothMesh);
    
    if (intersections.length > 0) {
      console.log(`치아 ${toothMesh.userData?.toothId}: ${intersections.length}개 교차점 발견`);
      allIntersections = allIntersections.concat(intersections);
    }
  });
  
  console.log(`총 ${allIntersections.length}개 교차점 발견`);
  
  // 교차점 시각화
  if (allIntersections.length > 0) {
    visualizeIntersections(allIntersections);
    
    // 성공 메시지 표시
    showIntersectionStatusMessage(
      `${allIntersections.length}개의 교차점이 발견되었습니다.`, 
      'success'
    );
  } else {
    showIntersectionStatusMessage('교차점이 발견되지 않았습니다.', 'info');
  }
  
  return allIntersections;
}

/**
 * 원본 메시(잇몸) 찾기
 */
function findBaseMesh() {
  // refs.targetMesh가 라이브러리 치아가 아니면 원본 모델
  if (refs.targetMesh && (!refs.targetMesh.userData || !refs.targetMesh.userData.isLibraryTooth)) {
    return refs.targetMesh;
  }
  
  // 씬에서 라이브러리 치아가 아닌 메시 찾기
  for (const object of refs.scene.children) {
    if (object.isMesh && (!object.userData || !object.userData.isLibraryTooth)) {
      return object;
    }
  }
  
  return null;
}

/**
 * 모든 치아 메시 찾기
 */
function findAllToothMeshes() {
  const toothMeshes = [];
  
  // 전역 배치된 치아 배열에서 찾기
  if (window.placedTeeth && window.placedTeeth.length > 0) {
    toothMeshes.push(...window.placedTeeth);
  }
  
  // 씬에서 직접 찾기 (백업)
  refs.scene.children.forEach(object => {
    if (object.isMesh && object.userData && object.userData.isLibraryTooth) {
      // 중복 제거
      if (!toothMeshes.includes(object)) {
        toothMeshes.push(object);
      }
    }
  });
  
  return toothMeshes;
}

/**
 * 교차점 시각화 정리
 */
export function clearIntersectionVisualization() {
  intersectionMeshes.forEach(mesh => {
    if (mesh.parent) {
      refs.scene.remove(mesh);
    }
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  });
  
  intersectionMeshes = [];
  console.log('교차점 시각화 정리 완료');
}

/**
 * 교차점 표시 토글
 */
export function toggleIntersectionVisualization() {
  if (isIntersectionVisible) {
    // 현재 표시 중이면 숨기기
    clearIntersectionVisualization();
    isIntersectionVisible = false;
    showIntersectionStatusMessage('교차점 표시가 비활성화되었습니다.', 'info');
    return false;
  } else {
    // 현재 숨겨져 있으면 표시하기
    detectAllIntersections();
    isIntersectionVisible = true;
    return true;
  }
}

/**
 * 교차점 상태 메시지 표시
 */
function showIntersectionStatusMessage(message, type = 'info') {
  const existingMessage = document.getElementById('intersection-status-message');
  if (existingMessage) {
    existingMessage.remove();
  }
  
  const messageDiv = document.createElement('div');
  messageDiv.id = 'intersection-status-message';
  
  let backgroundColor = '#2196F3'; // 기본 파란색
  if (type === 'success') backgroundColor = '#4CAF50'; // 초록색
  if (type === 'warning') backgroundColor = '#FF9800'; // 주황색
  if (type === 'error') backgroundColor = '#F44336';   // 빨간색
  
  messageDiv.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: ${backgroundColor};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-weight: bold;
    z-index: 2000;
    transition: opacity 0.5s;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  `;
  
  messageDiv.textContent = message;
  document.body.appendChild(messageDiv);
  
  // 3초 후 자동으로 제거
  setTimeout(() => {
    messageDiv.style.opacity = '0';
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.remove();
      }
    }, 500);
  }, 3000);
}

/**
 * 교차점 검출 상태 확인
 */
export function isIntersectionDetectionActive() {
  return isIntersectionVisible;
}

/**
 * 교차점 검출 설정 변경
 */
export function updateIntersectionSettings(settings) {
  if (settings.color && intersectionMaterial) {
    intersectionMaterial.color.setHex(settings.color);
  }
  
  if (settings.opacity && intersectionMaterial) {
    intersectionMaterial.opacity = settings.opacity;
  }
  
  // 현재 표시 중이면 다시 그리기
  if (isIntersectionVisible) {
    clearIntersectionVisualization();
    detectAllIntersections();
  }
}