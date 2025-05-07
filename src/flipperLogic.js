// src/flipperLogic.js
import * as THREE from 'three';
import { refs } from './modelManager.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// 플리퍼 상태 변수
let flipperMesh = null;
let drawingPoints = [];
let pointMarkers = [];
let curveLines = [];
let selectedAreaPoints = [];
let flipperThickness = 1.5; // 기본 두께 (mm)
let curveQuality = 20; // 곡선 품질

// 마우스 관련 변수
let isDrawing = false;
let minDistanceBetweenPoints = 0.01;
let lastMousePosition = new THREE.Vector2();
let hoveredPointIndex = -1;

// 점 드래깅 변수
let selectedPointIndex = -1;
let isDraggingPoint = false;

/**
 * 플리퍼 그리기 모드 초기화
 */
export function initFlipperDrawing() {
  console.log('플리퍼 그리기 모드 초기화');
  
  // 이전 데이터 초기화
  cleanupFlipperData();
  
  // 상태 메시지 업데이트
  updateFlipperInfoText('모델에 플리퍼 영역을 그려주세요. Alt 키를 누른 상태에서 드래그하여 경계선을 그리세요.');
  
  // 이벤트 리스너 추가
  addFlipperEventListeners();
  
  return true;
}

/**
 * 플리퍼 모든 데이터 정리
 */
function cleanupFlipperData() {
  // 모든 마커 제거
  pointMarkers.forEach(marker => {
    if (marker && marker.parent) {
      marker.parent.remove(marker);
    }
  });
  
  // 모든 곡선 제거
  curveLines.forEach(line => {
    if (line && line.parent) {
      line.parent.remove(line);
    }
  });
  
  // 플리퍼 메시가 있다면 제거
  if (flipperMesh && flipperMesh.parent) {
    flipperMesh.parent.remove(flipperMesh);
    flipperMesh.geometry.dispose();
    flipperMesh.material.dispose();
    flipperMesh = null;
  }
  
  // 배열 초기화
  drawingPoints = [];
  pointMarkers = [];
  curveLines = [];
  selectedAreaPoints = [];
  
  // 마우스 상태 초기화
  isDrawing = false;
  hoveredPointIndex = -1;
  selectedPointIndex = -1;
  isDraggingPoint = false;
  
  console.log('플리퍼 데이터 정리 완료');
}

/**
 * 플리퍼 이벤트 리스너 추가
 */
function addFlipperEventListeners() {
  // 레퍼런스 DOM 요소
  const rendererDom = refs.renderer.domElement;
  
  // 기존 이벤트 리스너 확인 및 제거 (중복 방지)
  rendererDom.removeEventListener('pointerdown', onFlipperPointerDown);
  rendererDom.removeEventListener('pointermove', onFlipperPointerMove);
  rendererDom.removeEventListener('pointerup', onFlipperPointerUp);
  rendererDom.removeEventListener('click', onFlipperClick);
  
  // 키보드 이벤트 리스너 제거
  window.removeEventListener('keydown', onFlipperKeyDown);
  window.removeEventListener('keyup', onFlipperKeyUp);
  
  // 새 이벤트 리스너 추가
  rendererDom.addEventListener('pointerdown', onFlipperPointerDown);
  rendererDom.addEventListener('pointermove', onFlipperPointerMove);
  rendererDom.addEventListener('pointerup', onFlipperPointerUp);
  rendererDom.addEventListener('click', onFlipperClick);
  
  // 키보드 이벤트 리스너 추가
  window.addEventListener('keydown', onFlipperKeyDown);
  window.addEventListener('keyup', onFlipperKeyUp);
  
  // 윈도우 포커스 아웃 시 상태 리셋
  window.addEventListener('blur', () => {
    if (isDrawing) {
      isDrawing = false;
      refs.controls.enabled = true;
    }
    
    if (isDraggingPoint) {
      isDraggingPoint = false;
      selectedPointIndex = -1;
      refs.controls.enabled = true;
    }
  });
  
  console.log('플리퍼 이벤트 리스너 추가됨');
}

/**
 * 플리퍼 이벤트 리스너 제거
 */
export function removeFlipperEventListeners() {
  const rendererDom = refs.renderer.domElement;
  
  rendererDom.removeEventListener('pointerdown', onFlipperPointerDown);
  rendererDom.removeEventListener('pointermove', onFlipperPointerMove);
  rendererDom.removeEventListener('pointerup', onFlipperPointerUp);
  rendererDom.removeEventListener('click', onFlipperClick);
  
  window.removeEventListener('keydown', onFlipperKeyDown);
  window.removeEventListener('keyup', onFlipperKeyUp);
  
  // 커서 스타일 초기화
  rendererDom.style.cursor = 'auto';
  
  console.log('플리퍼 이벤트 리스너 제거됨');
}

/**
 * Alt 키 다운 이벤트 핸들러
 */
function onFlipperKeyDown(event) {
  // Alt 키 (18)
  if (event.keyCode === 18 || event.key === 'Alt') {
    // 그리기 모드가 닫히지 않았다면 커서 변경
    if (drawingPoints.length === 0 || curveLines.length < drawingPoints.length) {
      refs.renderer.domElement.style.cursor = 'crosshair';
      
      // Alt 키를 누르면 컨트롤 일시 비활성화
      refs.controls.enabled = false;
    }
  }
}

/**
 * Alt 키 업 이벤트 핸들러
 */
function onFlipperKeyUp(event) {
  // Alt 키 (18)
  if (event.keyCode === 18 || event.key === 'Alt') {
    // 그리기 중이었다면 중지
    if (isDrawing) {
      isDrawing = false;
    }
    
    // 커서 스타일 초기화 (드래깅 중이 아니면)
    if (!isDraggingPoint) {
      refs.renderer.domElement.style.cursor = 'auto';
    }
    
    // 컨트롤 재활성화 (드래깅 중이 아니면)
    if (!isDraggingPoint) {
      refs.controls.enabled = true;
    }
  }
}

/**
 * 포인터 다운 이벤트 핸들러
 */
function onFlipperPointerDown(event) {
  // 영역이 이미 닫혔다면 점 이동 처리
  if (selectedAreaPoints.length > 0 && hoveredPointIndex !== -1) {
    event.preventDefault();
    
    refs.controls.enabled = false;
    selectedPointIndex = hoveredPointIndex;
    isDraggingPoint = true;
    return;
  }
  
  // Alt 키가 눌려 있지 않다면 무시 (다른 동작과 충돌 방지)
  if (!event.altKey) return;
  
  // 타겟 메시가 없다면 무시
  if (!refs.targetMesh) {
    console.warn('플리퍼를 그릴 대상 메시가 없습니다.');
    return;
  }
  
  // 컨트롤 비활성화 (그리기 중)
  refs.controls.enabled = false;
  
  // 화면 좌표를 정규화된 디바이스 좌표로 변환
  const rect = refs.renderer.domElement.getBoundingClientRect();
  const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  // 마우스 위치 저장
  lastMousePosition = new THREE.Vector2(mouseX, mouseY);
  
  // 레이캐스터 생성
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), refs.camera);
  
  // 대상 메시와의 교차점 확인
  const intersects = raycaster.intersectObject(refs.targetMesh, true);
  
  if (intersects.length > 0) {
    // 그리기 모드 활성화
    isDrawing = true;
    
    // 첫 번째 점이고 Alt+Shift 키가 같이 눌려있다면 영역 그리기 완료로 처리
    if (drawingPoints.length > 2 && event.shiftKey && 
        intersects[0].point.distanceTo(drawingPoints[0].position) < 0.1) {
      completeFlipperArea();
      return;
    }
    
    // 새 점 추가
    addFlipperPoint(intersects[0]);
    
    // 커서 스타일 변경
    refs.renderer.domElement.style.cursor = 'crosshair';
  }
}

/**
 * 포인터 이동 이벤트 핸들러
 */
function onFlipperPointerMove(event) {
  if (!refs.targetMesh) return;
  
  // 화면 좌표를 정규화된 디바이스 좌표로 변환
  const rect = refs.renderer.domElement.getBoundingClientRect();
  const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  const mouse = new THREE.Vector2(mouseX, mouseY);
  
  // 레이캐스터 생성
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, refs.camera);
  
  // 점 드래깅 처리
  if (isDraggingPoint && selectedPointIndex !== -1) {
    const intersects = raycaster.intersectObject(refs.targetMesh, true);
    if (intersects.length > 0) {
      updatePointPosition(selectedPointIndex, intersects[0]);
    }
    return;
  }
  
  // 호버링 점 확인
  const prevHoveredIndex = hoveredPointIndex;
  hoveredPointIndex = -1;
  
  drawingPoints.forEach((pointData, index) => {
    if (pointData.marker) {
      const intersects = raycaster.intersectObject(pointData.marker);
      if (intersects.length > 0) {
        hoveredPointIndex = index;
      }
    }
  });
  
  // 호버링 상태 변경 시 커서 스타일 업데이트
  if (prevHoveredIndex !== hoveredPointIndex) {
    if (hoveredPointIndex === 0 && drawingPoints.length > 2 && selectedAreaPoints.length === 0) {
      // 첫 번째 점에 호버링 - 영역 닫기 가능
      refs.renderer.domElement.style.cursor = 'pointer';
    } else if (hoveredPointIndex !== -1 && selectedAreaPoints.length > 0) {
      // 점에 호버링 - 이동 가능
      refs.renderer.domElement.style.cursor = 'move';
    } else if (isDrawing) {
      // 그리기 중
      refs.renderer.domElement.style.cursor = 'crosshair';
    } else if (event.altKey && selectedAreaPoints.length === 0) {
      // Alt 키 누른 상태에서 그리기 가능
      refs.renderer.domElement.style.cursor = 'crosshair';
    } else {
      // 기본 상태
      refs.renderer.domElement.style.cursor = 'auto';
    }
  }
  
  // 그리기 모드에서 드래그로 점 추가
  if (isDrawing && event.altKey) {
    // 마우스가 충분히 이동했을 때만 새 점 추가
    if (mouse.distanceTo(lastMousePosition) > 0.01) {
      // 마우스 위치 업데이트
      lastMousePosition.copy(mouse);
      
      // 대상 메시와의 교차점 확인
      const intersects = raycaster.intersectObject(refs.targetMesh, true);
      
      if (intersects.length > 0) {
        const newIntersection = intersects[0];
        
        // 이전 점 존재하면 거리 확인
        if (drawingPoints.length > 0) {
          const lastPoint = drawingPoints[drawingPoints.length - 1].position;
          const newPoint = newIntersection.point.clone();
          
          // 마지막 점과의 거리가 최소 거리보다 크면 새 점 추가
          if (lastPoint.distanceTo(newPoint) > minDistanceBetweenPoints) {
            addFlipperPoint(newIntersection);
          }
        } else {
          // 첫 번째 점 추가
          addFlipperPoint(newIntersection);
        }
      }
    }
  }
}

/**
 * 포인터 업 이벤트 핸들러
 */
function onFlipperPointerUp(event) {
  // 점 드래깅 종료
  if (isDraggingPoint) {
    isDraggingPoint = false;
    selectedPointIndex = -1;
    
    // 영역이 닫혔다면 플리퍼 업데이트
    if (selectedAreaPoints.length > 0) {
      updateFlipperMesh();
    }
    
    // 컨트롤 재활성화
    refs.controls.enabled = true;
    return;
  }
  
  // 그리기 종료 - Alt 키가 여전히 눌려있다면 그리기 모드 유지
  if (isDrawing && !event.altKey) {
    isDrawing = false;
    
    // 컨트롤 재활성화
    setTimeout(() => {
      refs.controls.enabled = true;
    }, 50);
  }
}

/**
 * 클릭 이벤트 핸들러 - 영역 닫기 또는 점 제거
 */
function onFlipperClick(event) {
  // 드래깅 중이면 무시
  if (isDraggingPoint) return;
  
  // Alt 키가 눌려있거나 이미 그리기 완료되었으면 무시
  if (event.altKey || selectedAreaPoints.length > 0) return;
  
  // 첫 번째 점 클릭으로 영역 닫기
  if (hoveredPointIndex === 0 && drawingPoints.length > 2) {
    completeFlipperArea();
    return;
  }
}

/**
 * 플리퍼 점 추가
 */
function addFlipperPoint(intersect) {
  // 점 위치와 노멀 가져오기
  const position = intersect.point.clone();
  let normal = intersect.face.normal.clone();
  normal.transformDirection(refs.targetMesh.matrixWorld).normalize();
  
  // Z-fighting 방지를 위해 노멀 방향으로 약간 오프셋
  position.addScaledVector(normal, 0.001);
  
  // 마커 생성 (첫 번째 점이면 초록색, 나머지는 빨간색)
  const isFirst = drawingPoints.length === 0;
  const markerSize = isFirst ? 0.005 : 0.003;
  const markerColor = isFirst ? 0x00ff00 : 0xff0000;
  
  const markerGeometry = new THREE.SphereGeometry(markerSize, 8, 8);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: markerColor });
  const marker = new THREE.Mesh(markerGeometry, markerMaterial);
  
  marker.position.copy(position);
  refs.scene.add(marker);
  
  // 점 데이터 저장
  const pointData = {
    position: position,
    normal: normal,
    marker: marker
  };
  
  drawingPoints.push(pointData);
  pointMarkers.push(marker);
  
  // 두 점 이상이면 곡선 생성
  if (drawingPoints.length >= 2) {
    const prevPoint = drawingPoints[drawingPoints.length - 2];
    const currPoint = drawingPoints[drawingPoints.length - 1];
    
    const curve = createCurveBetweenPoints(prevPoint, currPoint);
    curveLines.push(curve);
  }
  
  // 상태 메시지 업데이트
  if (drawingPoints.length === 1) {
    updateFlipperInfoText('첫 번째 점이 추가되었습니다. Alt 키를 누른 상태로 계속 드래그하여 경계선을 그리세요.');
  } else if (drawingPoints.length >= 3) {
    updateFlipperInfoText('Alt+Shift+첫번째점 클릭으로 영역을 완성하세요 (3점 이상 필요).');
  }
  
  console.log(`플리퍼 점 추가 (총 ${drawingPoints.length}개)`);
}

/**
 * 점 위치 업데이트
 */
function updatePointPosition(index, intersection) {
  if (index < 0 || index >= drawingPoints.length) return;
  
  // 새 위치와 노멀 가져오기
  const position = intersection.point.clone();
  let normal = intersection.face.normal.clone();
  normal.transformDirection(refs.targetMesh.matrixWorld).normalize();
  
  // Z-fighting 방지를 위해 노멀 방향으로 약간 오프셋
  position.addScaledVector(normal, 0.001);
  
  // 점 데이터 업데이트
  const pointData = drawingPoints[index];
  pointData.position.copy(position);
  pointData.normal.copy(normal);
  
  // 마커 위치 업데이트
  if (pointData.marker) {
    pointData.marker.position.copy(position);
  }
  
  // 연결된 곡선 업데이트
  updateConnectedCurves(index);
}

/**
 * 점에 연결된 곡선 업데이트
 */
function updateConnectedCurves(index) {
  if (index < 0 || index >= drawingPoints.length) return;
  
  const pointsCount = drawingPoints.length;
  
  // 이전 점으로의 곡선 업데이트
  if (index > 0) {
    updateCurveBetweenPoints(index - 1, index);
  } else if (selectedAreaPoints.length > 0) {
    // 첫 번째 점이면서 영역이 닫혔다면 마지막-첫번째 연결 곡선 업데이트
    updateCurveBetweenPoints(pointsCount - 1, 0);
  }
  
  // 다음 점으로의 곡선 업데이트
  if (index < pointsCount - 1) {
    updateCurveBetweenPoints(index, index + 1);
  } else if (selectedAreaPoints.length > 0) {
    // 마지막 점이면서 영역이 닫혔다면 마지막-첫번째 연결 곡선 업데이트
    updateCurveBetweenPoints(pointsCount - 1, 0);
  }
}

/**
 * 두 점 사이의 곡선 업데이트
 */
function updateCurveBetweenPoints(startIndex, endIndex) {
  // 인덱스 유효성 검사
  if (startIndex < 0 || startIndex >= drawingPoints.length || 
      endIndex < 0 || endIndex >= drawingPoints.length) {
    return;
  }
  
  // 곡선 인덱스 결정
  let curveIndex = -1;
  
  // 일반 경우 - 인접한 점들
  if (endIndex === startIndex + 1) {
    curveIndex = startIndex;
  } 
  // 닫는 곡선 - 마지막 점과 첫 번째 점
  else if (startIndex === drawingPoints.length - 1 && endIndex === 0) {
    curveIndex = curveLines.length - 1;
  }
  
  if (curveIndex >= 0 && curveIndex < curveLines.length) {
    // 기존 곡선 제거
    if (curveLines[curveIndex] && curveLines[curveIndex].parent) {
      curveLines[curveIndex].parent.remove(curveLines[curveIndex]);
    }
    
    // 새 곡선 생성
    const curveLine = createCurveBetweenPoints(drawingPoints[startIndex], drawingPoints[endIndex]);
    
    // 배열에서 교체
    curveLines[curveIndex] = curveLine;
  }
}

/**
 * 두 점 사이에 곡선 생성
 */
function createCurveBetweenPoints(pointA, pointB) {
  const positionA = pointA.position;
  const positionB = pointB.position;
  const normalA = pointA.normal;
  const normalB = pointB.normal;
  
  // 거리에 따라 샘플 수 조정
  const distance = positionA.distanceTo(positionB);
  const sampleCount = Math.max(curveQuality, Math.floor(distance * 500));
  
  // 표면 위 점 샘플링
  const pointsOnSurface = [];
  
  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;
    
    // 위치와 노멀 선형 보간
    let pos = new THREE.Vector3().lerpVectors(positionA, positionB, t);
    let normal = new THREE.Vector3().lerpVectors(normalA, normalB, t).normalize();
    
    // 노멀 방향으로 조금 위에서 아래로 레이캐스팅
    const rayOrigin = pos.clone().addScaledVector(normal, 0.1);
    const rayDirection = normal.clone().negate();
    const raycaster = new THREE.Raycaster(rayOrigin, rayDirection);
    
    const intersects = raycaster.intersectObject(refs.targetMesh, true);
    
    if (intersects.length > 0) {
      // 레이캐스팅 성공 시 교차점 사용
      let hitNormal = intersects[0].face.normal.clone();
      hitNormal.transformDirection(refs.targetMesh.matrixWorld);
      
      pos = intersects[0].point.clone().addScaledVector(hitNormal, 0.001);
      pointsOnSurface.push(pos);
    } else {
      // 레이캐스팅 실패 시 보간점 사용
      pos.addScaledVector(normal, 0.001);
      pointsOnSurface.push(pos);
    }
  }
  
  // 성능을 위해 점 단순화
  const simplifiedPoints = [];
  const simplificationFactor = Math.max(1, Math.floor(pointsOnSurface.length / 100));
  
  for (let i = 0; i < pointsOnSurface.length; i += simplificationFactor) {
    simplifiedPoints.push(pointsOnSurface[i]);
  }
  
  // 마지막 점 추가 (누락된 경우)
  if (simplifiedPoints[simplifiedPoints.length - 1] !== pointsOnSurface[pointsOnSurface.length - 1]) {
    simplifiedPoints.push(pointsOnSurface[pointsOnSurface.length - 1]);
  }
  
  // Catmull-Rom 곡선 생성
  const curve = new THREE.CatmullRomCurve3(simplifiedPoints);
  const curvePoints = curve.getPoints(50);
  const curveGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
  
  // 선 색상은 일반적인 경계선은 빨간색, 닫힌 영역 완성선은 초록색
  const isClosing = pointA === drawingPoints[drawingPoints.length - 1] && 
                   pointB === drawingPoints[0];
                   
  const lineMaterial = new THREE.LineBasicMaterial({
    color: isClosing ? 0x00ff00 : 0xff0000
  });
  
  const curveLine = new THREE.Line(curveGeometry, lineMaterial);
  refs.scene.add(curveLine);
  
  return curveLine;
}

/**
 * 플리퍼 영역 그리기 완료
 */
function completeFlipperArea() {
  if (drawingPoints.length < 3) {
    console.warn('플리퍼 영역에는 최소 3개의 점이 필요합니다.');
    updateFlipperInfoText('플리퍼 영역에는 최소 3개의 점이 필요합니다.');
    return;
  }
  
  // 영역 닫기 (마지막 점과 첫 점 연결)
  const firstPoint = drawingPoints[0];
  const lastPoint = drawingPoints[drawingPoints.length - 1];
  
  // 마지막 점과 첫 점을 연결하는 곡선 생성
  const closingCurve = createCurveBetweenPoints(lastPoint, firstPoint);
  curveLines.push(closingCurve);
  
  // 경계 점 수집
  selectedAreaPoints = drawingPoints.map(point => point.position.clone());
  
  // 상태 메시지 업데이트
  updateFlipperInfoText('플리퍼 영역이 설정되었습니다. 두께를 조절한 후 "플리퍼 생성" 버튼을 클릭하세요.');
  
  // 컨트롤 재활성화
  setTimeout(() => {
    refs.controls.enabled = true;
  }, 50);
  
  // 그리기 모드 종료
  isDrawing = false;
  
  // 생성 버튼 활성화
  const generateBtn = document.getElementById('btn-generate-flipper');
  if (generateBtn) {
    generateBtn.disabled = false;
    generateBtn.classList.add('active');
  }
  
  console.log('플리퍼 영역 그리기 완료');
}

/**
 * 플리퍼 두께 설정
 */
export function setFlipperThickness(thickness) {
  flipperThickness = thickness;
  console.log(`플리퍼 두께: ${thickness}mm`);
  
  // 플리퍼가 이미 생성되어 있다면 업데이트
  if (flipperMesh && flipperMesh.parent) {
    generateFlipper();
  }
}

/**
 * 플리퍼 메시 업데이트
 */
function updateFlipperMesh() {
  // 이미 생성된 플리퍼가 있다면 업데이트
  if (flipperMesh && flipperMesh.parent) {
    generateFlipper();
  }
}

/**
 * 플리퍼 생성
 */
export function generateFlipper() {
  if (selectedAreaPoints.length < 3) {
    console.warn('플리퍼 생성을 위한 영역이 정의되지 않았습니다.');
    updateFlipperInfoText('먼저 플리퍼 영역을 정의해주세요. (Alt 키를 누른 상태에서 드래그해서 경계선을 그리세요)');
    return false;
  }
  
  // 이전 플리퍼 제거
  if (flipperMesh && flipperMesh.parent) {
    flipperMesh.parent.remove(flipperMesh);
    flipperMesh.geometry.dispose();
    flipperMesh.material.dispose();
    flipperMesh = null;
  }
  
  // 로딩 메시지 표시
  updateFlipperInfoText('플리퍼를 생성하는 중...');
  
  // 프로세스 시작
  console.log('플리퍼 생성 시작...');
  
  // 1. 영역 중심과 평균 노멀 계산
  const centroid = new THREE.Vector3();
  const averageNormal = new THREE.Vector3();
  
  drawingPoints.forEach(point => {
    centroid.add(point.position);
    averageNormal.add(point.normal);
  });
  
  centroid.divideScalar(drawingPoints.length);
  averageNormal.normalize();
  
  // 2. 로컬 좌표계 설정을 위한 기저 벡터 계산
  let tempUp = new THREE.Vector3(0, 1, 0);
  if (Math.abs(averageNormal.dot(tempUp)) > 0.9) {
    tempUp.set(1, 0, 0);
  }
  
  const tangent1 = new THREE.Vector3().crossVectors(averageNormal, tempUp).normalize();
  const tangent2 = new THREE.Vector3().crossVectors(averageNormal, tangent1).normalize();
  
  // 3. 3D 점들을 2D 평면에 투영
  const points2D = [];
  drawingPoints.forEach(point => {
    const relativePos = point.position.clone().sub(centroid);
    const x = relativePos.dot(tangent1);
    const y = relativePos.dot(tangent2);
    points2D.push(new THREE.Vector2(x, y));
  });
  
  // 4. 2D 형상 생성 (THREE.Shape)
  const shape = new THREE.Shape();
  
  // 형상 윤곽선 정의
  shape.moveTo(points2D[0].x, points2D[0].y);
  for (let i = 1; i < points2D.length; i++) {
    shape.lineTo(points2D[i].x, points2D[i].y);
  }
  shape.closePath();
  
  // 5. 형상 세분화 (더 부드러운 곡면을 위해)
  const shapeGeometry = new THREE.ShapeGeometry(shape, 32);
  
  // 6. 세분화된 2D 형상의 각 정점을 3D 공간으로 역투영
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const normals = [];
  
  // 위쪽면 (top face)
  const positions = shapeGeometry.getAttribute('position').array;
  
  for (let i = 0; i < positions.length; i += 3) {
    const x2D = positions[i];
    const y2D = positions[i + 1];
    
    // 3D 공간으로 역투영
    const pos3D = centroid.clone()
      .add(tangent1.clone().multiplyScalar(x2D))
      .add(tangent2.clone().multiplyScalar(y2D));
    
    // 가장 가까운 표면 점 찾기
    const rayOrigin = pos3D.clone().addScaledVector(averageNormal, 0.2);
    const rayDirection = averageNormal.clone().negate();
    
    const raycaster = new THREE.Raycaster(rayOrigin, rayDirection);
    const intersects = raycaster.intersectObject(refs.targetMesh, true);
    
    if (intersects.length > 0) {
      // 가장 가까운 교차점 사용
      const hitNormal = intersects[0].face.normal.clone();
      hitNormal.transformDirection(refs.targetMesh.matrixWorld);
      
      // 위쪽 면
      const topVertex = intersects[0].point.clone().addScaledVector(hitNormal, 0.001);
      vertices.push(topVertex.x, topVertex.y, topVertex.z);
      normals.push(hitNormal.x, hitNormal.y, hitNormal.z);
      
      // 아래쪽 면 (bottom face) - 두께 적용
      const bottomVertex = topVertex.clone().addScaledVector(hitNormal, flipperThickness * 0.01);
      vertices.push(bottomVertex.x, bottomVertex.y, bottomVertex.z);
      normals.push(-hitNormal.x, -hitNormal.y, -hitNormal.z); // 노멀 반전
    } else {
      // 레이캐스트 실패 시 평균 노멀 사용
      // 위쪽 면
      vertices.push(pos3D.x, pos3D.y, pos3D.z);
      normals.push(averageNormal.x, averageNormal.y, averageNormal.z);
      
      // 아래쪽 면
      const bottomVertex = pos3D.clone().addScaledVector(averageNormal, flipperThickness * 0.01);
      vertices.push(bottomVertex.x, bottomVertex.y, bottomVertex.z);
      normals.push(-averageNormal.x, -averageNormal.y, -averageNormal.z);
    }
  }
  
  // 삼각형 인덱스 생성
  const indices = [];
  const vertCount = vertices.length / 3;
  const faceCount = vertCount / 2;
  
  // 위쪽 면과 아래쪽 면의 삼각형
  for (let i = 0; i < faceCount; i += 3) {
    // 위쪽 면 삼각형 (반시계 방향)
    indices.push(i, i + 1, i + 2);
    
    // 아래쪽 면 삼각형 (시계 방향으로 뒤집음)
    indices.push(i + faceCount, i + faceCount + 2, i + faceCount + 1);
  }
  
  // 측면 삼각형 생성 (위쪽과 아래쪽 면을 연결)
  for (let i = 0; i < faceCount; i++) {
    const next = (i + 1) % faceCount;
    
    // 위쪽면 정점, 아래쪽면 정점, 다음 위쪽면 정점
    indices.push(i, i + faceCount, next);
    
    // 다음 위쪽면 정점, 아래쪽면 정점, 다음 아래쪽면 정점
    indices.push(next, i + faceCount, next + faceCount);
  }
  
  // 버퍼 지오메트리 완성
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  
  // 지오메트리 정리 (중복 정점 병합, 노멀 계산)
  const mergedGeometry = BufferGeometryUtils.mergeVertices(geometry);
  mergedGeometry.computeVertexNormals();
  
  // 메시 생성
  const material = new THREE.MeshMatcapMaterial({
    matcap: refs.matcaps['Red Wax'],
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide
  });
  
  flipperMesh = new THREE.Mesh(mergedGeometry, material);
  flipperMesh.userData.isFlipperMesh = true;
  refs.scene.add(flipperMesh);
  
  // 성공 메시지 업데이트
  updateFlipperInfoText(`플리퍼가 생성되었습니다. 두께: ${flipperThickness}mm`);
  
  // 적용 버튼 활성화
  const applyBtn = document.getElementById('btn-apply-flipper');
  if (applyBtn) {
    applyBtn.disabled = false;
    applyBtn.classList.add('active');
  }
  
  console.log('플리퍼 생성 완료');
  return true;
}

/**
 * 플리퍼 적용 - 최종 메시로 변환
 */
export function applyFlipper() {
  if (!flipperMesh) {
    console.warn('적용할 플리퍼가 없습니다.');
    return false;
  }
  
  if (!refs.targetMesh) {
    console.warn('대상 메시가 없습니다.');
    return false;
  }
  
  // 로딩 메시지 표시
  updateFlipperInfoText('플리퍼를 적용하는 중...');
  
  try {
    // 플리퍼 메시를 대상 메시와 결합
    const targetGeometry = refs.targetMesh.geometry.clone();
    const flipperGeometry = flipperMesh.geometry.clone();
    
    // 두 지오메트리 병합
    const mergedGeometry = BufferGeometryUtils.mergeGeometries(
      [targetGeometry, flipperGeometry], 
      false
    );
    
    // 중복 정점 병합 및 정리
    const cleanGeometry = BufferGeometryUtils.mergeVertices(mergedGeometry);
    cleanGeometry.computeVertexNormals();
    cleanGeometry.computeBoundingSphere();
    
    // 기존 지오메트리 교체
    refs.targetMesh.geometry.dispose();
    refs.targetMesh.geometry = cleanGeometry;
    
    // BVH 재계산 (성능 최적화)
    refs.targetMesh.geometry.computeBoundsTree?.({ setBoundingBox: false });
    
    // BVH 헬퍼 업데이트
    if (refs.bvhHelper && refs.bvhHelper.parent) {
      refs.bvhHelper.update();
    }
    
    // 플리퍼 메시 제거 (이미 대상 메시에 병합됨)
    if (flipperMesh && flipperMesh.parent) {
      flipperMesh.parent.remove(flipperMesh);
      flipperMesh.geometry.dispose();
      flipperMesh.material.dispose();
      flipperMesh = null;
    }
    
    // 성공 메시지 업데이트
    updateFlipperInfoText('플리퍼가 성공적으로 적용되었습니다! 완료 버튼을 클릭하세요.');
    
    // 완료 버튼 활성화
    const completeBtn = document.getElementById('btn-flipper-complete');
    if (completeBtn) {
      completeBtn.disabled = false;
      completeBtn.classList.add('active');
    }
    
    console.log('플리퍼 적용 완료');
    return true;
  } catch (error) {
    console.error('플리퍼 적용 중 오류 발생:', error);
    updateFlipperInfoText('플리퍼 적용 중 오류가 발생했습니다.');
    return false;
  }
}

/**
 * 정보 텍스트 업데이트
 */
function updateFlipperInfoText(text) {
  const infoElement = document.getElementById('flipper-info');
  if (infoElement) {
    infoElement.textContent = text;
  }
}

/**
 * 모듈 정리 함수
 */
export function cleanupFlipperModule() {
  removeFlipperEventListeners();
  cleanupFlipperData();
}

/**
 * 플리퍼 메시 반환 (외부에서 접근용)
 */
export function getFlipperMesh() {
  return flipperMesh;
}