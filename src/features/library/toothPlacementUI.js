// src/library/toothPlacementUI.js

import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { highlightSelectedTooth } from './dentalChartUI.js';

/**
 * Module-level state
 */
let scene, camera, renderer, controls;
// 모듈 변수와 윈도우 변수 둘 다 선언하여 공유 가능하게 함
let placementActive = false;
window.placementActive = false; // 전역 객체에 노출
let selectedToothId = null;
window.selectedToothId = null; // 전역 객체에 추가
let selectedModelPath = null;
window.selectedModelPath = null; // 전역 객체에 추가

// 새로운 메지오-디스탈 배치 관련 변수들
let mesialPoint = null; // 메지오 위치 (첫 번째 클릭)
let currentDistalPoint = null; // 현재 디스탈 위치 (마우스 따라다님)
let mesialMarker = null; // 메지오 마커
let previewTooth = null; // 프리뷰 치아
let previewMaterial = null;
let placementPhase = 'mesial'; // 'mesial' 또는 'distal'
let distalConfirmed = false; // 디스탈 포인트가 확정되었는지 여부
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();

// 스케일 정보 저장용 변수 추가
let originalGeometryBounds = null; // 원본 지오메트리 크기 정보

/**
 * Initialize tooth placement functionality
 * @param {THREE.Scene} sceneObj
 * @param {THREE.Camera} cameraObj
 * @param {THREE.WebGLRenderer} rendererObj
 * @param {OrbitControls} controlsObj
 */
export function initToothPlacement(sceneObj, cameraObj, rendererObj, controlsObj) {
  scene    = sceneObj;
  camera   = cameraObj;
  renderer = rendererObj;
  controls = controlsObj;

  // Add CSS for placement UI
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    #placement-ui {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: white;
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      padding: 15px;
      z-index: 1200;
      display: none;
      width: 400px;
    }
    #placement-status {
      margin-bottom: 10px;
      text-align: center;
      font-weight: bold;
      color: #333;
    }
    #placement-instructions {
      margin-bottom: 15px;
      text-align: center;
      color: #555;
      min-height: 40px;
    }
    .placement-buttons {
      display: flex;
      gap: 10px;
      justify-content: center;
    }
    .placement-button {
      padding: 8px 16px;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
      transition: background-color 0.2s;
    }
    #confirm-placement-btn {
      background-color: #4caf50;
      color: white;
    }
    #confirm-placement-btn:hover {
      background-color: #45a049;
    }
    #confirm-placement-btn:disabled {
      background-color: #a5d6a7;
      cursor: not-allowed;
    }
    #cancel-placement-btn {
      background-color: #f5f5f5;
      color: #333;
    }
    #cancel-placement-btn:hover {
      background-color: #e0e0e0;
    }
    .phase-indicator {
      display: flex;
      justify-content: center;
      margin-bottom: 15px;
      gap: 20px;
    }
    .phase-step {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 10px;
      border-radius: 15px;
      font-size: 12px;
      font-weight: bold;
    }
    .phase-step.active {
      background-color: #4691E0;
      color: white;
    }
    .phase-step.inactive {
      background-color: #f0f0f0;
      color: #666;
    }
    .phase-step.completed {
      background-color: #4caf50;
      color: white;
    }
    .control-hint {
      text-align: center;
      font-size: 12px;
      color: #666;
      margin-top: 10px;
      line-height: 1.4;
    }
  `;
  document.head.appendChild(styleEl);

  // Create the placement UI container
  const placementUI = document.createElement('div');
  placementUI.id = 'placement-ui';
  placementUI.innerHTML = `
    <div id="placement-status">치아 위치 선정</div>
    
    <div class="phase-indicator">
      <div class="phase-step active" id="mesial-phase">
        <span>1</span>
        <span>메지오 설정</span>
      </div>
      <div class="phase-step inactive" id="distal-phase">
        <span>2</span>
        <span>디스탈 설정</span>
      </div>
    </div>
    
    <div id="placement-instructions">메지오(중앙선 쪽) 위치를 클릭하세요</div>
    
    <div class="placement-buttons">
      <button id="confirm-placement-btn" class="placement-button" disabled>확인</button>
      <button id="cancel-placement-btn"  class="placement-button">취소</button>
    </div>
    
    <div class="control-hint">
      메지오 클릭 후 마우스를 움직여 크기와 방향을 조절하고<br>
      디스탈 위치를 클릭하여 최종 배치하세요<br>
      <strong>✨ 마우스가 어디에 있든 크기 조절 가능합니다</strong>
    </div>
  `;
  document.body.appendChild(placementUI);

  // Wire up buttons
  document.getElementById('confirm-placement-btn').addEventListener('click', confirmPlacement);
  document.getElementById('cancel-placement-btn').addEventListener('click', cancelPlacement);

  // Listen for mouse events in the 3D canvas
  renderer.domElement.addEventListener('click', onMouseClick);
  renderer.domElement.addEventListener('mousemove', onMouseMove);
}

/**
 * Begin placement for a specific tooth
 * @param {string} toothId 
 * @param {string} modelPath 
 */
export function startToothPlacement(toothId, modelPath) {
  placementActive = true;
  window.placementActive = true;
  
  selectedToothId = toothId;
  window.selectedToothId = toothId;
  selectedModelPath = modelPath;
  window.selectedModelPath = modelPath;
  
  console.log("메지오-디스탈 배치 모드 활성화:", placementActive);
  console.log("선택된 치아 ID:", selectedToothId);
  console.log("선택된 모델 경로:", selectedModelPath);
  
  // 상태 초기화
  resetPlacementState();
  highlightSelectedTooth(toothId);

  const ui = document.getElementById('placement-ui');
  const instr = document.getElementById('placement-instructions');
  const confirmBtn = document.getElementById('confirm-placement-btn');

  ui.style.display = 'block';
  confirmBtn.disabled = true;
  
  // 첫 번째 단계로 설정
  placementPhase = 'mesial';
  distalConfirmed = false; // 디스탈 확정 플래그 초기화
  updatePhaseIndicator();
  instr.textContent = `${toothId}번 치아의 메지오(중앙선 쪽) 위치를 클릭하세요`;
  
  // Disable orbit controls while placing
  if (controls) controls.enabled = true;
}

/**
 * 배치 상태 초기화
 */
function resetPlacementState() {
  mesialPoint = null;
  currentDistalPoint = null;
  placementPhase = 'mesial';
  distalConfirmed = false; // 디스탈 확정 플래그 초기화
  originalGeometryBounds = null; // 원본 지오메트리 정보 초기화
  
  // 기존 마커와 프리뷰 정리
  cleanupPlacementObjects();
}

/**
 * 단계 표시기 업데이트
 */
function updatePhaseIndicator() {
  const mesialPhase = document.getElementById('mesial-phase');
  const distalPhase = document.getElementById('distal-phase');
  
  if (placementPhase === 'mesial') {
    mesialPhase.className = 'phase-step active';
    distalPhase.className = 'phase-step inactive';
  } else if (placementPhase === 'distal') {
    mesialPhase.className = 'phase-step completed';
    distalPhase.className = 'phase-step active';
  }
}

/**
 * Handle clicks in the Three.js canvas during placement
 */
function onMouseClick(event) {
  console.log("Mouse Click - placementActive:", window.placementActive, "phase:", placementPhase, "distalConfirmed:", distalConfirmed);
  if (!window.placementActive) return;
  
  // Convert to normalized device coords
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left)/rect.width)*2 - 1;
  mouse.y = -((event.clientY - rect.top)/rect.height)*2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Check if click is on an existing marker (mesial marker removal)
  if (mesialMarker && placementPhase === 'mesial') {
    const markerIntersects = raycaster.intersectObject(mesialMarker);
    if (markerIntersects.length > 0) {
      // Remove mesial marker and reset
      resetPlacementState();
      document.getElementById('placement-instructions').textContent = 
        `${window.selectedToothId}번 치아의 메지오(중앙선 쪽) 위치를 클릭하세요`;
      document.getElementById('confirm-placement-btn').disabled = true;
      updatePhaseIndicator();
      return;
    }
  }

  // Find the jaw mesh
  const jaw = scene.children.find(c => c.isMesh && !c.userData.type);
  if (!jaw) return;

  const hits = raycaster.intersectObject(jaw);
  if (hits.length === 0) return;

  const point = hits[0].point.clone();
  
  if (placementPhase === 'mesial') {
    // 첫 번째 클릭: 메지오 위치 설정
    setMesialPoint(point);
  } else if (placementPhase === 'distal' && !distalConfirmed) {
    // 두 번째 클릭: 디스탈 위치 설정하고 확정 (아직 확정되지 않은 경우에만)
    setDistalPoint(point);
  }
}

/**
 * 메지오 포인트 설정
 */
function setMesialPoint(point) {
  mesialPoint = point.clone();
  mesialPoint.z +=0.15
  mesialPoint.y -=0.1
  
  // 메지오 마커 생성
  createMesialMarker(point);
  
  // 프리뷰 치아 생성 시작
  createPreviewTooth(point);
  
  // 다음 단계로 진행
  placementPhase = 'distal';
  distalConfirmed = false; // 디스탈이 아직 확정되지 않음
  updatePhaseIndicator();
  
  document.getElementById('placement-instructions').textContent = 
    '마우스를 움직여 크기와 방향을 조절하고 디스탈(먼 쪽) 위치를 클릭하세요';
}

/**
 * 디스탈 포인트 설정
 */
function setDistalPoint(point) {
  currentDistalPoint = point.clone();
  distalConfirmed = true; // 디스탈 포인트 확정
  
  // 최종 배치 확인 버튼 활성화
  document.getElementById('confirm-placement-btn').disabled = false;
  document.getElementById('placement-instructions').textContent = 
    '위치와 크기가 올바르면 확인 버튼을 클릭하세요';
  
  // 프리뷰 치아 최종 업데이트
  updatePreviewTooth();
  
  console.log("디스탈 포인트 확정됨 - 더 이상 프리뷰 변경되지 않음");
}

/**
 * 개선된 마우스 이동 핸들러 - 허공에서도 메지오 포인트와의 거리 기준으로 크기 조절
 */
function onMouseMove(event) {
  // 디스탈이 확정된 후에는 마우스 이동에 따른 프리뷰 업데이트를 중지
  if (!window.placementActive || placementPhase !== 'distal' || !mesialPoint || !previewTooth || distalConfirmed) {
    return;
  }
  
  // Convert to normalized device coords
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left)/rect.width)*2 - 1;
  mouse.y = -((event.clientY - rect.top)/rect.height)*2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  
  // 🚀 개선된 부분: 마우스가 어디에 있든 3D 포인트 계산
  let newDistalPoint = null;
  
  // 1단계: 먼저 턱뼈 표면과의 교차점 시도 (가장 정확함)
  const jaw = scene.children.find(c => c.isMesh && !c.userData.type);
  if (jaw) {
    const hits = raycaster.intersectObject(jaw);
    if (hits.length > 0) {
      newDistalPoint = hits[0].point.clone();
      console.log("턱뼈 표면 사용");
    }
  }
  
  // 2단계: 턱뼈 교차점이 없으면 메지오 포인트 기준 가상 평면 사용
  if (!newDistalPoint && mesialPoint) {
    // 메지오 포인트를 지나고 카메라 방향에 수직인 평면 생성
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    cameraDirection.negate(); // 카메라에서 바라보는 방향의 반대
    
    const plane = new THREE.Plane();
    plane.setFromNormalAndCoplanarPoint(cameraDirection, mesialPoint);
    
    // 마우스 레이와 평면의 교차점 계산
    const intersectionPoint = new THREE.Vector3();
    const intersected = raycaster.ray.intersectPlane(plane, intersectionPoint);
    
    if (intersected) {
      newDistalPoint = intersectionPoint;
      console.log("가상 평면 사용 - 메지오와의 거리:", mesialPoint.distanceTo(newDistalPoint).toFixed(3));
    }
  }
  
  // 3단계: 그래도 없으면 카메라-메지오 거리 기준으로 투영
  if (!newDistalPoint && mesialPoint) {
    // 카메라에서 메지오 포인트까지의 거리 계산
    const distanceToMesial = camera.position.distanceTo(mesialPoint);
    
    // 마우스 레이 방향으로 같은 거리만큼 이동한 점 계산
    const direction = new THREE.Vector3();
    raycaster.ray.direction.normalize();
    
    newDistalPoint = camera.position.clone()
      .add(direction.multiplyScalar(distanceToMesial));
      
    console.log("카메라 거리 기준 투영 사용");
  }
  
  // 새로운 디스탈 포인트로 업데이트
  if (newDistalPoint) {
    currentDistalPoint = newDistalPoint;
    updatePreviewTooth();
  }
}

/**
 * 메지오 마커 생성
 */
function createMesialMarker(pos) {
  console.log('메지오 마커 생성:', pos);
  const geom = new THREE.SphereGeometry(0.03, 16, 16);
  const mat = new THREE.MeshBasicMaterial({ 
    color: 0x00ff00, // 초록색 (메지오)
    depthTest: false,
    transparent: true,
    opacity: 0.8
  });
  mesialMarker = new THREE.Mesh(geom, mat);
  mesialMarker.position.copy(pos);
  
  // 약간 위로 오프셋
  mesialMarker.position.y += 0.002;
  
  // 렌더링 순서 높게 설정
  mesialMarker.renderOrder = 9999;
  
  scene.add(mesialMarker);
}



/**
 * 프리뷰 치아 생성
 */
function createPreviewTooth(mesialPosition) {
  // 로딩 메시지 표시
  const loadingMessage = document.createElement('div');
  loadingMessage.id = 'preview-loading';
  loadingMessage.style.cssText = `
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0,0,0,0.7);
    color: #fff; padding: 20px; border-radius: 10px;
    z-index: 2000;
  `;
  loadingMessage.innerHTML = `
    <div class="loading-spinner"></div>
    <p>${window.selectedToothId}번 치아 미리보기를 생성 중입니다...</p>
  `;
  document.body.appendChild(loadingMessage);
  
  // STL 로더 생성
  const loader = new STLLoader();
  
  // 모델 로드
  loader.load(
    window.selectedModelPath,
    (geometry) => {
      const posAttr = geometry.getAttribute('position');
      if (!posAttr) {
        console.error('No position attribute.');
        loadingMessage.remove();
        return;
      }
      
      // 지오메트리 처리 (실제 배치와 동일한 방식)
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.center();
      
      // 원본 지오메트리 크기 정보 저장 (스케일 계산용)
      originalGeometryBounds = {
        boundingBox: geometry.boundingBox.clone(),
        size: new THREE.Vector3()
      };
      geometry.boundingBox.getSize(originalGeometryBounds.size);
      
      // 프리뷰용 반투명 재질 생성
      previewMaterial = new THREE.MeshBasicMaterial({
        color: 0x3399ff,
        transparent: true,
        opacity: 0.6,
        metalness: 0.1,
        roughness: 0.8,
        side: THREE.DoubleSide
      });
      
      // 프리뷰 치아 생성
      previewTooth = new THREE.Mesh(geometry, previewMaterial);
      previewTooth.userData = { 
        type: 'previewTooth', 
        toothId: window.selectedToothId,
        originalBounds: originalGeometryBounds // 원본 크기 정보 저장
      };

      const defaultScale = 0.01; // 적당한 초기 크기
      previewTooth.scale.set(defaultScale, defaultScale, defaultScale);
      
      // 초기 위치 설정 (메지오 위치)
      previewTooth.position.copy(mesialPosition);
      console.log(previewTooth.rotation)
      
      // 씬에 추가
      scene.add(previewTooth);
      
      // 로딩 메시지 제거
      loadingMessage.remove();
    },
    (xhr) => {
      // 로딩 진행 상황
    },
    (error) => {
      console.error('STL 로드 오류:', error);
      loadingMessage.remove();
      alert('치아 모델을 로드할 수 없습니다.');
    }
  );
}

/**
 * 프리뷰 치아 업데이트 (메지오-디스탈 거리와 방향에 따라)
 * 메지오 기준으로 마우스 위치에 따라 rotation.z 값 변경 추가
 */
function updatePreviewTooth() {
  if (!previewTooth || !mesialPoint || !currentDistalPoint || !originalGeometryBounds) return;
  
  // 메지오-디스탈 벡터 계산
  const mesialToDistal = new THREE.Vector3().subVectors(currentDistalPoint, mesialPoint);
  const distance = mesialToDistal.length();
  
  // 통일된 스케일 계산 방식 사용
  const scaleFactor = window.calculateUniformScale(previewTooth.geometry, distance);
  previewTooth.scale.set(scaleFactor, scaleFactor, scaleFactor);
  
  // 메지오 위치 기준으로 오프셋 계산
  const toothId = parseInt(window.selectedToothId);
  let mesialOffset = new THREE.Vector3();
  
  // 치아 길이 계산 (스케일 적용)
  const toothLength = originalGeometryBounds.size.x * scaleFactor;
  
  // 치아 번호에 따른 메지오 방향 오프셋 계산
  if (toothId >= 11 && toothId <= 18) {
    // 우측 상악 - 메지오는 중앙선 쪽 (음의 X 방향)
    mesialOffset.x = toothLength * 0.4;
  } else if (toothId >= 21 && toothId <= 28) {
    // 좌측 상악 - 메지오는 중앙선 쪽 (양의 X 방향)
    mesialOffset.x = -toothLength * 0.4;
  } else if (toothId >= 31 && toothId <= 38) {
    // 좌측 하악 - 메지오는 중앙선 쪽 (양의 X 방향)
    mesialOffset.x = -toothLength * 0.4;
  } else if (toothId >= 41 && toothId <= 48) {
    // 우측 하악 - 메지오는 중앙선 쪽 (음의 X 방향)
    mesialOffset.x = toothLength * 0.4;
  }
  
  // 치아 위치 설정 - 메지오 마커 위치에 메지오 부분이 오도록 조정
  previewTooth.position.copy(mesialPoint);
  previewTooth.position.add(mesialOffset);
  
  // 회전 초기화
  previewTooth.rotation.set(0, 0, 0);
  
  // 치아 번호에 따른 기본 회전 보정
  let baseRotation = 0;
  if (toothId >= 11 && toothId <= 18) {
    // 우측 상악
    baseRotation = Math.PI;
  } else if (toothId >= 21 && toothId <= 28) {
    // 좌측 상악
    baseRotation = -0.25;
  } else if (toothId >= 31 && toothId <= 38) {
    // 좌측 하악
    baseRotation = 0;
  } else if (toothId >= 41 && toothId <= 48) {
    // 우측 하악
    baseRotation = Math.PI;
  }
  
  previewTooth.rotation.x = baseRotation;
  
  // 🚀 메지오 기준으로 마우스 위치에 따른 rotation.z 계산
  // 메지오에서 디스탈로의 2D 벡터 계산 (XY 평면에서)
  const mesialToDistal2D = new THREE.Vector2(
    currentDistalPoint.x - mesialPoint.x,
    currentDistalPoint.y - mesialPoint.y
  );
  
  // 벡터의 각도 계산 (atan2 사용)
  // atan2는 -π ~ π 범위의 값을 반환
  let rotationZ = Math.atan2(-mesialToDistal2D.y, -mesialToDistal2D.x) * 0.8;
  
  // 치아 번호에 따른 회전 보정 (필요시)
  // 각 사분면별로 다른 기준각을 적용할 수 있음
  if (toothId >= 11 && toothId <= 18) {
    // 우측 상악 - 추가 보정이 필요한 경우
    // rotationZ += Math.PI; // 예시: 180도 추가 회전
  } else if (toothId >= 21 && toothId <= 28) {
    // 좌측 상악
    // rotationZ += 0; // 기본값 유지
  } else if (toothId >= 31 && toothId <= 38) {
    // 좌측 하악
    // rotationZ += 0; // 기본값 유지
  } else if (toothId >= 41 && toothId <= 48) {
    // 우측 하악
    // rotationZ += Math.PI; // 예시: 180도 추가 회전
  }
  
  // rotation.z 적용
  previewTooth.rotation.z = rotationZ;
  
  // 디버깅용 로그 (필요시 주석 해제)
  console.log(`치아 ${toothId} - 메지오-디스탈 각도: ${(rotationZ * 180 / Math.PI).toFixed(1)}도`);
}
/**
 * 배치 객체들 정리
 */
function cleanupPlacementObjects() {
  // 메지오 마커 제거
  if (mesialMarker) {
    scene.remove(mesialMarker);
    mesialMarker.geometry.dispose();
    mesialMarker.material.dispose();
    mesialMarker = null;
  }
  
  // 프리뷰 치아 제거
  if (previewTooth) {
    scene.remove(previewTooth);
    if (previewTooth.geometry) previewTooth.geometry.dispose();
    if (previewTooth.material) previewTooth.material.dispose();
    previewTooth = null;
  }
  
  // 프리뷰 재질 정리
  if (previewMaterial) {
    previewMaterial.dispose();
    previewMaterial = null;
  }
}

/**
 * User confirms placement → calls global placeToothModel
 */
function confirmPlacement() {
  if (!window.placementActive || !mesialPoint || !currentDistalPoint || !previewTooth) return;

  console.log("메지오-디스탈 배치 확인");
  console.log("메지오 위치:", mesialPoint);
  console.log("디스탈 위치:", currentDistalPoint);
  
  // 최종 위치와 회전값 계산
  const finalPosition = previewTooth.position.clone();
  const finalRotation = previewTooth.rotation.clone();
  const finalScale = previewTooth.scale.x; // 균등 스케일이므로 x값만 사용
  
  // 메지오-디스탈 거리 계산
  const mesialToDistalDistance = mesialPoint.distanceTo(currentDistalPoint);
  
  // 프리뷰와 동일한 스케일 정보 전달
  const scaleInfo = {
    scaleFactor: finalScale,
    mesialToDistalDistance: mesialToDistalDistance,
    originalBounds: originalGeometryBounds,
    usePreviewScale: true // 프리뷰 스케일을 우선 사용하도록 플래그 설정
  };
  
  // 프리뷰 및 마커 제거
  cleanupPlacementObjects();
  
  // 글로벌 배치 함수 호출 (스케일 정보 추가)
  if (window.placeToothModel) {
    window.placeToothModel(
      window.selectedToothId, 
      window.selectedModelPath, 
      finalPosition, 
      finalRotation, 
      mesialToDistalDistance,
      scaleInfo // 상세한 스케일 정보 전달
    );
  }
  
  cleanupPlacement();
}

/**
 * User cancels placement
 */
function cancelPlacement() {
  cleanupPlacement();
}

/**
 * Reset state and hide UI
 */
function cleanupPlacement() {
  cleanupPlacementObjects();
  resetPlacementState();
  
  placementActive = false;
  window.placementActive = false;
  selectedToothId = null;
  window.selectedToothId = null;
  selectedModelPath = null;
  window.selectedModelPath = null;
  
  document.getElementById('placement-ui').style.display = 'none';
  
  // Re-enable orbit controls
  if (controls) {
    controls.enabled = true;
  }
}

/**
 * Utility to check if placement is active
 */
export function isPlacementActive() {
  return placementActive || window.placementActive;
}
