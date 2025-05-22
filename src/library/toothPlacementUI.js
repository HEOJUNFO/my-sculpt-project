// src/library/toothPlacementUI.js

import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { highlightSelectedTooth } from './dentalChartUI.js';
import { refs } from '../modelManager.js';

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
      디스탈 위치를 클릭하여 최종 배치하세요
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
 * 마우스 이동 핸들러 - 디스탈이 확정되지 않은 경우에만 프리뷰 업데이트
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
  
  // Find intersection with jaw
  const jaw = scene.children.find(c => c.isMesh && !c.userData.type);
  if (jaw) {
    const hits = raycaster.intersectObject(jaw);
    if (hits.length > 0) {
      currentDistalPoint = hits[0].point.clone();
      updatePreviewTooth();
    }
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
      
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      geometry.center();
      
      // 프리뷰용 반투명 재질 생성
      previewMaterial = new THREE.MeshStandardMaterial({
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
        boundingBox: geometry.boundingBox.clone() // 바운딩 박스 저장
      };
      
      // 기본 크기 설정
      const defaultScale = 0.1;
      previewTooth.scale.set(defaultScale, defaultScale, defaultScale);
      
      // 메지오 위치에 정확히 배치하기 위한 오프셋 계산
      // 치아 번호에 따라 메지오 방향 결정
      const toothId = parseInt(window.selectedToothId);
      let mesialOffset = new THREE.Vector3();
      
      // 바운딩 박스를 기준으로 메지오 방향 오프셋 계산
      const bbox = geometry.boundingBox;
      const toothLength = bbox.max.x - bbox.min.x; // X축을 치아 길이로 가정
      
      if (toothId >= 11 && toothId <= 18) {
        // 우측 상악 - 메지오는 중앙선 쪽 (음의 X 방향)
        mesialOffset.x = toothLength * defaultScale * 0.3;
      } else if (toothId >= 21 && toothId <= 28) {
        // 좌측 상악 - 메지오는 중앙선 쪽 (양의 X 방향)
        mesialOffset.x = -toothLength * defaultScale * 0.3;
      } else if (toothId >= 31 && toothId <= 38) {
        // 좌측 하악 - 메지오는 중앙선 쪽 (양의 X 방향)
        mesialOffset.x = -toothLength * defaultScale * 0.3;
      } else if (toothId >= 41 && toothId <= 48) {
        // 우측 하악 - 메지오는 중앙선 쪽 (음의 X 방향)
        mesialOffset.x = toothLength * defaultScale * 0.3;
      }
      
      // 메지오 위치에 치아의 메지오 부분이 오도록 위치 조정
      previewTooth.position.copy(mesialPosition);
      previewTooth.position.add(mesialOffset);
      
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
 */
function updatePreviewTooth() {
  if (!previewTooth || !mesialPoint || !currentDistalPoint) return;
  
  // 메지오-디스탈 벡터 계산
  const mesialToDistal = new THREE.Vector3().subVectors(currentDistalPoint, mesialPoint);
  const distance = mesialToDistal.length();
  
  // 거리에 비례한 스케일 설정
  const baseScale = 0.05; // 기본 스케일
  const scaleMultiplier = Math.max(0.1, Math.min(1.0, distance )); // 거리에 비례, 최소/최대 제한
  const finalScale = baseScale * scaleMultiplier;
  previewTooth.scale.set(finalScale, finalScale, finalScale);
  
  // 메지오 위치 기준으로 오프셋 재계산 (스케일 변경에 따라)
  const toothId = parseInt(window.selectedToothId);
  let mesialOffset = new THREE.Vector3();
  
  // 바운딩 박스를 기준으로 메지오 방향 오프셋 계산 (스케일 적용)
  const bbox = previewTooth.userData.boundingBox;
  if (bbox) {
    const toothLength = bbox.max.x - bbox.min.x; // X축을 치아 길이로 가정
    
    if (toothId >= 11 && toothId <= 18) {
      // 우측 상악 - 메지오는 중앙선 쪽 (음의 X 방향)
      mesialOffset.x = toothLength * finalScale * 0.3;
    } else if (toothId >= 21 && toothId <= 28) {
      // 좌측 상악 - 메지오는 중앙선 쪽 (양의 X 방향)
      mesialOffset.x = -toothLength * finalScale * 0.3;
    } else if (toothId >= 31 && toothId <= 38) {
      // 좌측 하악 - 메지오는 중앙선 쪽 (양의 X 방향)
      mesialOffset.x = -toothLength * finalScale * 0.3;
    } else if (toothId >= 41 && toothId <= 48) {
      // 우측 하악 - 메지오는 중앙선 쪽 (음의 X 방향)
      mesialOffset.x = toothLength * finalScale * 0.3;
    }
  }
  
  // 치아 위치 설정 - 메지오 마커 위치에 메지오 부분이 오도록 조정
  previewTooth.position.copy(mesialPoint);
  previewTooth.position.add(mesialOffset);
  
  // Z축 기준 회전만 적용 (메지오에서 디스탈로의 방향)
  if (distance > 0.001) { // 거리가 충분히 클 때만 회전 적용
    // 메지오-디스탈 벡터를 XY 평면에 투영 (Z축 회전을 위해)
    const direction2D = new THREE.Vector2(mesialToDistal.x, mesialToDistal.y);
    direction2D.normalize();
    
    // Z축 기준 회전각 계산
    const zRotationAngle = Math.atan2(direction2D.y, direction2D.x);
    
    // 기존 회전값 초기화 후 Z축 회전만 적용
    previewTooth.rotation.set(0, 0, 0);
    
    // 치아 번호에 따른 기본 회전 보정
    let baseRotation = 0;
    if (toothId >= 11 && toothId <= 18) {
      // 우측 상악
      baseRotation = Math.PI;
    } else if (toothId >= 21 && toothId <= 28) {
      // 좌측 상악
      baseRotation = 0;
    } else if (toothId >= 31 && toothId <= 38) {
      // 좌측 하악
      baseRotation = 0;
    } else if (toothId >= 41 && toothId <= 48) {
      // 우측 하악
      baseRotation = Math.PI;
    }
    
    // Z축 회전 적용 (메지오-디스탈 방향 + 기본 회전)
    previewTooth.rotation.z = zRotationAngle + baseRotation;
  }
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
  
  // 프리뷰 및 마커 제거
  cleanupPlacementObjects();
  
  // 글로벌 배치 함수 호출
  if (window.placeToothModel) {
    window.placeToothModel(
      window.selectedToothId, 
      window.selectedModelPath, 
      finalPosition, 
      finalRotation, 
      mesialToDistalDistance,
      finalScale // 스케일 정보 추가
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

/**
 * Optionally track placed tooth meshes
 * @param {THREE.Mesh} toothMesh 
 */

export function addPlacedTooth(toothMesh) {
  placedTeeth.push(toothMesh);
  console.log("추가된 치아:", toothMesh.userData?.toothId, "총 개수:", placedTeeth.length);
}