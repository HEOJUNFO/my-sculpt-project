// toothPlacementUI.js

import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { highlightSelectedTooth } from './dentalChartUI.js';

/**
 * Module-level state
 */
let scene, camera, renderer, controls;
let placementActive = false;
let selectedToothId = null;
let selectedModelPath = null;
let placementPoints = [];
let placementMarkers = [];
let placedTeeth = [];
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let previewTooth = null;
let previewMaterial = null;
let rotationHelper = null;
let isDragging = false;
let isRotating = false;
let startRotation = 0;
let rotationPlane = new THREE.Plane();

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
      width: 350px;
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
    #rotation-slider-container {
      margin-top: 15px;
      display: none;
    }
    #rotation-slider {
      width: 100%;
      margin-top: 5px;
    }
    .slider-label {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
    }
    .slider-value {
      font-weight: bold;
      color: #4691E0;
    }
    .control-hint {
      text-align: center;
      font-size: 12px;
      color: #666;
      margin-top: 5px;
    }
  `;
  document.head.appendChild(styleEl);

  // Create the placement UI container
  const placementUI = document.createElement('div');
  placementUI.id = 'placement-ui';
  placementUI.innerHTML = `
    <div id="placement-status">치아 위치 선정</div>
    <div id="placement-instructions">치아를 배치할 위치를 클릭하세요</div>
    
    <div id="rotation-slider-container">
      <div class="slider-label">
        <span>회전 각도:</span>
        <span class="slider-value" id="rotation-value">0°</span>
      </div>
      <input type="range" id="rotation-slider" min="0" max="360" value="0">
      <div class="control-hint">드래그로 위치 조정, 슬라이더로 회전 조정</div>
    </div>
    
    <div class="placement-buttons">
      <button id="confirm-placement-btn" class="placement-button" disabled>확인</button>
      <button id="cancel-placement-btn"  class="placement-button">취소</button>
    </div>
  `;
  document.body.appendChild(placementUI);

  // Wire up buttons
  document.getElementById('confirm-placement-btn').addEventListener('click', confirmPlacement);
  document.getElementById('cancel-placement-btn').addEventListener('click', cancelPlacement);
  
  // Rotation slider
  const rotationSlider = document.getElementById('rotation-slider');
  rotationSlider.addEventListener('input', (e) => {
    if (previewTooth) {
      const angle = (parseInt(e.target.value) * Math.PI) / 180;
      previewTooth.rotation.y = angle;
      
      // Update displayed value
      document.getElementById('rotation-value').textContent = `${e.target.value}°`;
    }
  });

  // Listen for mouse events in the 3D canvas
  renderer.domElement.addEventListener('click', onMouseClick);
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('mouseup', onMouseUp);
}

/**
 * Begin placement for a specific tooth
 * @param {string} toothId 
 * @param {string} modelPath 
 */
export function startToothPlacement(toothId, modelPath) {
  placementActive   = true;
  selectedToothId   = toothId;
  selectedModelPath = modelPath;
  placementPoints   = [];

  clearPlacementMarkers();
  cleanupPreviewTooth();
  highlightSelectedTooth(toothId);

  const ui          = document.getElementById('placement-ui');
  const instr       = document.getElementById('placement-instructions');
  const confirmBtn  = document.getElementById('confirm-placement-btn');
  const sliderContainer = document.getElementById('rotation-slider-container');

  ui.style.display = 'block';
  sliderContainer.style.display = 'none';
  confirmBtn.disabled = true;
  
  // 치아 번호에 따라 다른 안내 메시지
  const isMolar = [17, 27, 37, 47].includes(parseInt(toothId));
  
  if (isMolar) {
    const quadrant = getToothQuadrant(parseInt(toothId));
    instr.textContent = `${toothId}번 치아 배치: ${quadrant} 위치를 클릭하세요`;
  } else {
    instr.textContent = '두 지점을 클릭하세요 (중앙에 배치됩니다)';
  }
  
  // Disable orbit controls while placing
  if (controls) controls.enabled = true;
}

/**
 * Get the quadrant description for the tooth
 */
function getToothQuadrant(toothId) {
  // 치아 사분면 정보 반환
  if (toothId >= 11 && toothId <= 18) return "우측 상악";
  if (toothId >= 21 && toothId <= 28) return "좌측 상악";
  if (toothId >= 31 && toothId <= 38) return "좌측 하악";
  if (toothId >= 41 && toothId <= 48) return "우측 하악";
  return "";
}

/**
 * Handle clicks in the Three.js canvas during placement
 */
function onMouseClick(event) {
  if (!placementActive) return;
  
  // If we already have a preview tooth, ignore clicks
  if (previewTooth) return;

  // Convert to normalized device coords
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left)/rect.width)*2 - 1;
  mouse.y = -((event.clientY - rect.top)/rect.height)*2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Check if click is on an existing marker
  const markerIntersects = raycaster.intersectObjects(placementMarkers);
  if (markerIntersects.length > 0) {
    // Remove clicked marker
    const clickedMarker = markerIntersects[0].object;
    const markerIndex = placementMarkers.indexOf(clickedMarker);
    if (markerIndex !== -1) {
      // Remove from scene and arrays
      scene.remove(clickedMarker);
      clickedMarker.geometry.dispose();
      clickedMarker.material.dispose();
      placementMarkers.splice(markerIndex, 1);
      placementPoints.splice(markerIndex, 1);
      
      // Update UI
      const isMolar = [17, 27, 37, 47].includes(parseInt(selectedToothId));
      const needed  = isMolar ? 1 : 2;
      const instr   = document.getElementById('placement-instructions');
      const confirmBtn = document.getElementById('confirm-placement-btn');
      
      confirmBtn.disabled = placementPoints.length < needed;
      
      if (placementPoints.length === 0) {
        instr.textContent = isMolar
          ? `${selectedToothId}번 치아 배치: 위치를 클릭하세요`
          : '두 지점을 클릭하세요 (중앙에 배치됩니다)';
      } else if (!isMolar && placementPoints.length === 1) {
        instr.textContent = '두 번째 지점을 클릭하세요.';
      }
      
      return;
    }
  }

  // Find the jaw mesh (the root mesh without userData.type)
  const jaw = scene.children.find(c => c.isMesh && !c.userData.type);
  if (!jaw) return;

  const hits = raycaster.intersectObject(jaw);
  if (hits.length === 0) return;

  const point = hits[0].point.clone();
  
  // 대구치 (17, 27, 37, 47)의 경우
  const isMolar = [17, 27, 37, 47].includes(parseInt(selectedToothId));
  
  if (isMolar) {
    // 대구치는 즉시 프리뷰 생성 (드래그 및 회전 가능)
    createPreviewTooth(point);
  } else {
    // 일반 치아는 두 지점 클릭으로 마커 생성
    placementPoints.push(point);
    createMarker(point);
    
    if (placementPoints.length === 2) {
      // 비대구치는 프리뷰 없이 바로 확인 버튼만 활성화
      document.getElementById('placement-instructions').textContent = 
        '위치가 올바르면 확인 버튼을 클릭하세요';
      document.getElementById('confirm-placement-btn').disabled = false;
    } else {
      document.getElementById('placement-instructions').textContent = '두 번째 지점을 클릭하세요.';
    }
  }
}

/**
 * 비대구치를 위한 간단한 프리뷰 생성 (드래그, 회전 기능 없음)
 */
function createSimplePreview(position) {
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
    <p>${selectedToothId}번 치아 미리보기를 생성 중입니다...</p>
  `;
  document.body.appendChild(loadingMessage);
  
  // STL 로드
  const loader = new STLLoader();
  loader.load(
    selectedModelPath,
    (geometry) => {
      const posAttr = geometry.getAttribute('position');
      if (!posAttr) {
        console.error('No position attribute.');
        loadingMessage.remove();
        return;
      }
      
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      if (geometry.boundingSphere) {
        const radius = geometry.boundingSphere.radius;
        geometry.scale(0.2 / radius, 0.2 / radius, 0.2 / radius);
      }
      geometry.center();
      
      // 프리뷰용 반투명 재질 생성
      previewMaterial = new THREE.MeshStandardMaterial({
        color: 0x3399ff,
        transparent: true,
        opacity: 0.7,
        metalness: 0.1,
        roughness: 0.8,
        side: THREE.DoubleSide
      });
      
      // 프리뷰 치아 생성
      previewTooth = new THREE.Mesh(geometry, previewMaterial);
      previewTooth.position.copy(position);
      previewTooth.userData = { type: 'previewTooth', toothId: selectedToothId };
      
      // 기본 회전 설정
      setInitialRotation(previewTooth);
      
      // 씬에 추가
      scene.add(previewTooth);
      
      // UI 업데이트 (슬라이더 없이)
      document.getElementById('placement-instructions').textContent = 
        '위치가 올바르면 확인 버튼을 클릭하세요';
      document.getElementById('confirm-placement-btn').disabled = false;
      
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
 * Create a preview tooth at the specified position
 */
function createPreviewTooth(position) {
  // Preview tooth 생성 전 STL 로딩 시작
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
    <p>${selectedToothId}번 치아 미리보기를 생성 중입니다...</p>
  `;
  document.body.appendChild(loadingMessage);
  
  // STL 로더 생성
  const loader = new STLLoader();
  
  // 모델 로드
  loader.load(
    selectedModelPath,
    (geometry) => {
      /*** geometry processing ***/
      const posAttr = geometry.getAttribute('position');
      if (!posAttr) {
        console.error('No position attribute.');
        loadingMessage.remove();
        return;
      }
      
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      if (geometry.boundingSphere) {
        const radius = geometry.boundingSphere.radius;
        geometry.scale(0.2 / radius, 0.2 / radius, 0.2 / radius);
      }
      geometry.center();
      
      // 프리뷰용 반투명 재질 생성
      previewMaterial = new THREE.MeshStandardMaterial({
        color: 0x3399ff,
        transparent: true,
        opacity: 0.7,
        metalness: 0.1,
        roughness: 0.8,
        side: THREE.DoubleSide
      });
      
      // 프리뷰 치아 생성
      previewTooth = new THREE.Mesh(geometry, previewMaterial);
      previewTooth.position.copy(position);
      previewTooth.userData = { type: 'previewTooth', toothId: selectedToothId };
      
      // 회전 설정 (치아 번호에 따른 기본 회전)
      setInitialRotation(previewTooth);
      
      // 씬에 추가
      scene.add(previewTooth);
      
      // 회전 가이드 생성
      createRotationHelper(position);
      
      // UI 업데이트
      document.getElementById('placement-instructions').textContent = 
        '위치와 각도를 조정한 후 확인 버튼을 클릭하세요';
      document.getElementById('confirm-placement-btn').disabled = false;
      document.getElementById('rotation-slider-container').style.display = 'block';
      
      // 슬라이더 초기값 설정 (현재 Y축 회전값을 기준으로)
      const degrees = (previewTooth.rotation.y * 180 / Math.PI) % 360;
      const normalizedDegrees = degrees >= 0 ? degrees : degrees + 360;
      document.getElementById('rotation-slider').value = normalizedDegrees.toFixed(0);
      document.getElementById('rotation-value').textContent = `${normalizedDegrees.toFixed(0)}°`;
      
      // 로딩 메시지 제거
      loadingMessage.remove();
    },
    (xhr) => {
      // 로딩 진행 상황 표시 가능
    },
    (error) => {
      console.error('STL 로드 오류:', error);
      loadingMessage.remove();
      alert('치아 모델을 로드할 수 없습니다.');
    }
  );
}

/**
 * Set the initial rotation based on tooth ID
 */
function setInitialRotation(tooth) {
  const toothId = parseInt(selectedToothId);
  
  // Y축 기준으로 회전값 설정
  let yRotation = 0;
  
  // 치아 번호에 따른 기본 회전각 설정
  if (toothId >= 11 && toothId <= 18) {
    // 우측 상악
    yRotation = Math.PI;
  } else if (toothId >= 21 && toothId <= 28) {
    // 좌측 상악
    yRotation = 0;
  } else if (toothId >= 31 && toothId <= 38) {
    // 좌측 하악
    yRotation = 0;
  } else if (toothId >= 41 && toothId <= 48) {
    // 우측 하악
    yRotation = Math.PI;
  }
  
  // 대구치(17, 27, 37, 47)인 경우 추가 미세 조정
  if ([17, 27, 37, 47].includes(toothId)) {
    // 각 대구치별 미세 회전각 조정
    if (toothId === 17) yRotation += Math.PI * 0.1;
    if (toothId === 27) yRotation -= Math.PI * 0.1;
    if (toothId === 37) yRotation += Math.PI * 0.1;
    if (toothId === 47) yRotation -= Math.PI * 0.1;
  }
  
  tooth.rotation.set(0, yRotation, 0);
}

/**
 * Create a rotation helper object
 */
function createRotationHelper(position) {
  if (rotationHelper) {
    scene.remove(rotationHelper);
  }
  
  // 회전 기준점 시각화를 위한 객체
  const geometry = new THREE.RingGeometry(0.12, 0.15, 32);
  const material = new THREE.MeshBasicMaterial({ 
    color: 0x00aaff, 
    transparent: true, 
    opacity: 0.7,
    side: THREE.DoubleSide
  });
  
  rotationHelper = new THREE.Mesh(geometry, material);
  rotationHelper.position.copy(position);
  
  // X축 방향으로 회전 (수평 평면에 놓기)
  rotationHelper.rotation.x = Math.PI / 2;
  
  scene.add(rotationHelper);
}

/**
 * Create a small red sphere marker at the selected point
 * @param {THREE.Vector3} pos 
 */
function createMarker(pos) {
  const geom = new THREE.SphereGeometry(0.025, 16, 16);
  const mat  = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const marker = new THREE.Mesh(geom, mat);
  marker.position.copy(pos);
  scene.add(marker);
  placementMarkers.push(marker);
}

/**
 * Remove all existing markers from the scene
 */
function clearPlacementMarkers() {
  placementMarkers.forEach(m => {
    scene.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  });
  placementMarkers = [];
}

/**
 * Clean up any preview tooth
 */
function cleanupPreviewTooth() {
  if (previewTooth) {
    scene.remove(previewTooth);
    if (previewTooth.geometry) previewTooth.geometry.dispose();
    if (previewTooth.material) previewTooth.material.dispose();
    previewTooth = null;
  }
  
  // 회전 헬퍼 제거
  if (rotationHelper) {
    scene.remove(rotationHelper);
    rotationHelper.geometry.dispose();
    rotationHelper.material.dispose();
    rotationHelper = null;
  }
  
  // 프리뷰 재질 정리
  if (previewMaterial) {
    previewMaterial.dispose();
    previewMaterial = null;
  }
}

/**
 * Handle mouse down events
 */
function onMouseDown(event) {
  if (!placementActive || !previewTooth) return;
  
  // 대구치 (17, 27, 37, 47)인지 확인
  const isMolar = [17, 27, 37, 47].includes(parseInt(selectedToothId));
  if (!isMolar) return; // 비대구치는 드래그/회전 불가
  
  // Convert to normalized device coords
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left)/rect.width)*2 - 1;
  mouse.y = -((event.clientY - rect.top)/rect.height)*2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  
  // Check if clicking on preview tooth (for dragging)
  const toothIntersects = raycaster.intersectObject(previewTooth);
  if (toothIntersects.length > 0) {
    isDragging = true;
    controls.enabled = false;
    return;
  }
  
  // Check if clicking on rotation helper (for rotation)
  if (rotationHelper) {
    const helperIntersects = raycaster.intersectObject(rotationHelper);
    if (helperIntersects.length > 0) {
      isRotating = true;
      controls.enabled = false;
      
      // 회전 시작 각도 저장
      const hitPoint = helperIntersects[0].point;
      startRotation = Math.atan2(
        hitPoint.z - previewTooth.position.z,
        hitPoint.x - previewTooth.position.x
      );
      
      // 회전 평면 설정
      rotationPlane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 1, 0),
        previewTooth.position
      );
      
      return;
    }
  }
}

/**
 * Handle mouse move events
 */
function onMouseMove(event) {
  if (!placementActive || (!isDragging && !isRotating)) return;
  
  // 대구치 (17, 27, 37, 47)인지 확인
  const isMolar = [17, 27, 37, 47].includes(parseInt(selectedToothId));
  if (!isMolar) return; // 비대구치는 드래그/회전 불가
  
  // Convert to normalized device coords
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left)/rect.width)*2 - 1;
  mouse.y = -((event.clientY - rect.top)/rect.height)*2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  
  if (isDragging && previewTooth) {
    // Find intersection with jaw
    const jaw = scene.children.find(c => c.isMesh && !c.userData.type);
    if (jaw) {
      const hits = raycaster.intersectObject(jaw);
      if (hits.length > 0) {
        const point = hits[0].point.clone();
        
        // 이동
        previewTooth.position.copy(point);
        
        // 회전 헬퍼도 같이 이동
        if (rotationHelper) {
          rotationHelper.position.copy(point);
        }
      }
    }
  } else if (isRotating && previewTooth && rotationHelper) {
    // 마우스 위치에서 회전 평면과의 교차점 계산
    const ray = raycaster.ray;
    const intersectionPoint = new THREE.Vector3();
    ray.intersectPlane(rotationPlane, intersectionPoint);
    
    // 현재 각도 계산
    const currentAngle = Math.atan2(
      intersectionPoint.z - previewTooth.position.z,
      intersectionPoint.x - previewTooth.position.x
    );
    
    // 회전각 변화량 계산
    const deltaAngle = currentAngle - startRotation;
    
    // Y축 기준 회전 적용
    previewTooth.rotation.y += deltaAngle;
    
    startRotation = currentAngle;
    
    // 슬라이더 업데이트
    const degrees = (previewTooth.rotation.y * 180 / Math.PI) % 360;
    const normalizedDegrees = degrees >= 0 ? degrees : degrees + 360;
    document.getElementById('rotation-slider').value = normalizedDegrees.toFixed(0);
    document.getElementById('rotation-value').textContent = `${normalizedDegrees.toFixed(0)}°`;
  }
}

/**
 * Handle mouse up events
 */
function onMouseUp() {
  isDragging = false;
  isRotating = false;
  
  if (controls) {
    controls.enabled = true;
  }
}

/**
 * User confirms placement → calls global placeToothModel
 */
function confirmPlacement() {
  if (!placementActive) return;

  const isMolar = [17, 27, 37, 47].includes(parseInt(selectedToothId));
  
  // 프리뷰가 있는 경우 (대구치)
  if (previewTooth) {
    // 최종 배치를 위해 프리뷰의 위치와 회전값 사용
    const finalPosition = previewTooth.position.clone();
    const finalRotation = previewTooth.rotation.clone();
    
    // 프리뷰 제거
    cleanupPreviewTooth();
    clearPlacementMarkers();
    
    // 글로벌 배치 함수 호출
    if (window.placeToothModel) {
      window.placeToothModel(selectedToothId, selectedModelPath, finalPosition, finalRotation);
    }
  } 
  // 프리뷰가 없는 경우 (비대구치)
  else if (placementPoints.length === 2) {
    // 두 점의 중간 계산
    const midpoint = new THREE.Vector3()
      .addVectors(placementPoints[0], placementPoints[1])
      .multiplyScalar(0.5);
    
    // 기본 회전값 계산
    const rotation = new THREE.Euler();
    const toothId = parseInt(selectedToothId);
    
    // Y축 기준으로 회전값 설정
    let yRotation = 0;
    
    // 치아 번호에 따른 기본 회전각 설정
    if (toothId >= 11 && toothId <= 18) {
      // 우측 상악
      yRotation = Math.PI;
    } else if (toothId >= 21 && toothId <= 28) {
      // 좌측 상악
      yRotation = 0;
    } else if (toothId >= 31 && toothId <= 38) {
      // 좌측 하악
      yRotation = 0;
    } else if (toothId >= 41 && toothId <= 48) {
      // 우측 하악
      yRotation = Math.PI;
    }
    
    rotation.set(0, yRotation, 0);
    
    // 마커 제거
    clearPlacementMarkers();
    
    // 글로벌 배치 함수 호출
    if (window.placeToothModel) {
      window.placeToothModel(selectedToothId, selectedModelPath, midpoint, rotation);
    }
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
  cleanupPreviewTooth();
  placementActive = false;
  selectedToothId = null;
  selectedModelPath = null;
  placementPoints = [];
  clearPlacementMarkers();
  document.getElementById('placement-ui').style.display = 'none';
  document.getElementById('rotation-slider-container').style.display = 'none';
  
  // Re-enable orbit controls
  if (controls) {
    controls.enabled = true;
  }
}

/**
 * Utility to check if placement is active
 */
export function isPlacementActive() {
  return placementActive;
}

/**
 * Optionally track placed tooth meshes
 * @param {THREE.Mesh} toothMesh 
 */
export function addPlacedTooth(toothMesh) {
  placedTeeth.push(toothMesh);
}