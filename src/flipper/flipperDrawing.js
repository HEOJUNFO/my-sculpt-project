// src/flipper/flipperDrawing.js
import * as THREE from 'three';
import { refs } from '../modelManager.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { generateFlipper } from './flipperGeometry.js';

// 플리퍼 상태 변수
let drawingPoints = [];
let pointMarkers = [];
let curveLines = [];
let selectedAreaPoints = [];
let flipperThickness = 1.0; // 기본 두께 (mm)
let curveQuality = 20; // 곡선 품질
let flipperMesh = null;

// 마우스 관련 변수
let isDrawing = false;
let minDistanceBetweenPoints = 0.01;
let lastMousePosition = new THREE.Vector2();
let hoveredPointIndex = -1;

// 점 드래깅 변수
let selectedPointIndex = -1;
let isDraggingPoint = false;

// 카메라 상태 저장용
let savedCameraState = null;

/**
 * 플리퍼 그리기 모드 초기화
 */
export function initFlipperDrawing() {
  console.log('플리퍼 그리기 모드 초기화');
  
  // 기존에 생성된 플리퍼 메시가 있는지 확인
  if (flipperMesh && flipperMesh.parent) {
    console.log('기존 플리퍼가 있습니다. 플리퍼 데이터 초기화를 건너뜁니다.');
    
    // 상태 메시지 업데이트
    updateFlipperInfoText('기존 플리퍼가 있습니다. 완료 버튼을 클릭하거나, 초기화 후 새로 그리세요.');
    
    // 완료 버튼 활성화
    const completeBtn = document.getElementById('btn-flipper-complete');
    if (completeBtn) {
      completeBtn.disabled = false;
      completeBtn.classList.add('active');
    }
    
    // 이벤트 리스너 추가
    addFlipperEventListeners();
    
    return true;
  }
  
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
export function cleanupFlipperData(preserveFlipper = false) {
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
  
  // 플리퍼 메쉬가 있다면 제거 (단, preserveFlipper가 true인 경우 유지)
  if (!preserveFlipper && flipperMesh && flipperMesh.parent) {
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
  
  lastMousePosition = new THREE.Vector2(mouseX, mouseY);
  
  // 레이캐스터 생성
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), refs.camera);
  
  // 대상 메시와의 교차점 확인
  const intersects = raycaster.intersectObject(refs.targetMesh, true);
  
  // 마커 인터섹션 체크
  const markerIntersects = raycaster.intersectObjects(pointMarkers);
  if (markerIntersects.length > 0) {
    // 클릭된 마커
    const clickedMarker = markerIntersects[0].object;
    const markerIndex = pointMarkers.indexOf(clickedMarker);
    if (markerIndex !== -1) {
      // Alt 키를 누른 상태로 마커 클릭: 해당 점 이후의 모든 점 제거
      if (event.altKey) {
        // 해당 점 이후의 모든 점과 곡선 제거
        removePointsAfter(markerIndex);
        // 상태 메시지 업데이트
        updateFlipperInfoText(`${markerIndex + 1}번 점 이후의 모든 점을 제거했습니다. 계속해서 그리세요.`);
        return;
      }
      
      // Alt 키 없이 마커 클릭: 기존 동작 - 마커 제거
      refs.scene.remove(clickedMarker);
      clickedMarker.geometry.dispose();
      clickedMarker.material.dispose();
      pointMarkers.splice(markerIndex, 1);
      drawingPoints.splice(markerIndex, 1);
      
      // 제거된 점에 연결된 곡선 업데이트
      updateCurvesAfterPointRemoval(markerIndex);
      
      // UI 업데이트
      const isMolar = [17, 27, 37, 47].includes(parseInt(window.selectedToothId));
      const needed  = isMolar ? 1 : 2;
      const instr   = document.getElementById('placement-instructions');
      const confirmBtn = document.getElementById('btn-flipper-complete');
      
      confirmBtn.disabled = pointMarkers.length < needed;
      
      if (pointMarkers.length === 0) {
        instr.textContent = isMolar
          ? `${window.selectedToothId}번 치아 배치: 위치를 클릭하세요`
          : '두 지점을 클릭하세요 (중앙에 배치됩니다)';
      } else if (!isMolar && pointMarkers.length === 1) {
        instr.textContent = '두 번째 지점을 클릭하세요.';
      }
      
      return;
    }
  }
  
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
 * 특정 인덱스 이후의 모든 점과 곡선 제거
 * @param {number} index - 유지할 마지막 점의 인덱스
 */
function removePointsAfter(index) {
  // 인덱스가 유효한지 확인
  if (index < 0 || index >= drawingPoints.length - 1) return;
  
  // 해당 인덱스 이후의 모든 점 제거
  for (let i = drawingPoints.length - 1; i > index; i--) {
    // 마커 제거
    const marker = pointMarkers[i];  // placementMarkers를 pointMarkers로 수정
    if (marker && marker.parent) {
      refs.scene.remove(marker);
      marker.geometry.dispose();
      marker.material.dispose();
    }
    
    // 배열에서 제거
    pointMarkers.pop();  // placementMarkers를 pointMarkers로 수정
    drawingPoints.pop();
  }
  
  // 곡선 업데이트
  for (let i = curveLines.length - 1; i >= index; i--) {
    const curveLine = curveLines[i];
    if (curveLine && curveLine.parent) {
      refs.scene.remove(curveLine);
      curveLine.geometry.dispose();
      curveLine.material.dispose();
    }
    curveLines.pop();
  }
  
  // 그리기 상태 재설정 - 계속 그릴 수 있도록
  isDrawing = true;
  selectedAreaPoints = []; // 닫힌 영역 초기화

  // 버튼 상태 업데이트
  const completeBtn = document.getElementById('btn-flipper-complete');
  const generateBtn = document.getElementById('btn-generate-flipper');
  if (completeBtn) completeBtn.disabled = true;
  if (generateBtn) generateBtn.disabled = true;
}

/**
 * 점 제거 후 연결된 곡선 업데이트
 * @param {number} removedIndex - 제거된 점의 인덱스
 */
function updateCurvesAfterPointRemoval(removedIndex) {
  // 제거해야 할 곡선들
  const curvesToRemove = [];
  
  // 제거된 점에 연결된 곡선 찾기 (앞/뒤)
  if (removedIndex > 0) {
    curvesToRemove.push(removedIndex - 1);
  }
  if (removedIndex < curveLines.length) {
    curvesToRemove.push(removedIndex);
  }
  
  // 곡선 제거 (인덱스가 큰 것부터 제거하여 인덱스 변경 방지)
  curvesToRemove.sort((a, b) => b - a).forEach(curveIndex => {
    if (curveLines[curveIndex] && curveLines[curveIndex].parent) {
      refs.scene.remove(curveLines[curveIndex]);
      curveLines[curveIndex].geometry.dispose();
      curveLines[curveIndex].material.dispose();
    }
    curveLines.splice(curveIndex, 1);
  });
  
  // 남은 점이 2개 이상이고 삭제된 점이 중간에 있다면 새 곡선 생성
  if (drawingPoints.length >= 2 && removedIndex > 0 && removedIndex < drawingPoints.length) {
    const prevPointIndex = removedIndex - 1;
    const nextPointIndex = removedIndex; // 삭제 후 인덱스가 조정됨
    
    if (prevPointIndex >= 0 && nextPointIndex < drawingPoints.length) {
      const prevPoint = drawingPoints[prevPointIndex];
      const nextPoint = drawingPoints[nextPointIndex];
      
      const newCurve = createCurveBetweenPoints(prevPoint, nextPoint);
      curveLines.splice(prevPointIndex, 0, newCurve);
    }
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
function onPointerUp(event) {
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
 * 플리퍼 포인터 업 이벤트 핸들러
 */
function onFlipperPointerUp(event) {
  onPointerUp(event);
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
  
  position.addScaledVector(normal, 0.001);
  
  // drawingPoints 업데이트
  const pointData = drawingPoints[index];
  pointData.position.copy(position);
  pointData.normal.copy(normal);
  
  // 마커 위치 업데이트
  if (pointData.marker) {
    pointData.marker.position.copy(position);
  }
  
  // 연결된 곡선 업데이트
  updateConnectedCurves(index);
  
  // selectedAreaPoints 업데이트 - 필요시 확장
  if (selectedAreaPoints.length > 0) {
    while (index >= selectedAreaPoints.length) {
      selectedAreaPoints.push(new THREE.Vector3());
    }
    selectedAreaPoints[index] = position.clone();
  }
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
  // 이전 두께와 현재 두께 저장
  const previousThickness = flipperThickness;
  flipperThickness = thickness;
  console.log(`플리퍼 두께: ${thickness}mm (이전: ${previousThickness}mm)`);
  
  // 플리퍼가 이미 생성되어 있다면 업데이트
  if (flipperMesh && flipperMesh.parent) {
    // 기존 메시 제거
    refs.scene.remove(flipperMesh);
    flipperMesh.geometry.dispose();
    flipperMesh.material.dispose();
    flipperMesh = null;
    
    // 약간의 지연 후 재생성 (UI 업데이트를 위해)
    setTimeout(() => {
      generateFlipper();
    }, 50);
  }
}


/**
 * 플리퍼 메시 업데이트
 */
function updateFlipperMesh() {
  // 이미 생성된 플리퍼가 있다면 업데이트
  if (flipperMesh && flipperMesh.parent) {
    // 로딩 메시지 표시
    updateFlipperInfoText('플리퍼를 업데이트하는 중...');
    
    // 이 부분이 누락됨: 기존 플리퍼 제거
    refs.scene.remove(flipperMesh);
    flipperMesh.geometry.dispose();
    flipperMesh.material.dispose();
    flipperMesh = null;
    
    // 약간의 지연 후 플리퍼 재생성
    setTimeout(() => {
      generateFlipper();
    }, 100);
  }
}

/**
 * 모듈 정리 함수
 */
export function cleanupFlipperModule(preserveFlipper = false) {
  removeFlipperEventListeners();
  cleanupFlipperData(preserveFlipper);
}

/**
 * 플리퍼 메시 반환 (외부에서 접근용)
 */
export function getFlipperMesh() {
  return flipperMesh;
}

/**
 * 상태 정보 공유 함수 - flipperGeometry.js에서 사용
 */
export function getFlipperState() {
  return {
    selectedAreaPoints, 
    drawingPoints, 
    flipperThickness
  };
}

/**
 * 플리퍼 메시 설정 함수 - flipperGeometry.js에서 사용
 */
export function setFlipperMesh(mesh) {
  flipperMesh = mesh;
}

/**
 * 정보 텍스트 업데이트
 */
export function updateFlipperInfoText(text) {
  const infoElement = document.getElementById('flipper-info');
  if (infoElement) {
    infoElement.textContent = text;
  }
}