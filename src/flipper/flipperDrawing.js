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
let minDistanceBetweenPoints = 0.02; // 점이 같은 face에 여러개 들어가면 지금 버그있어 길게 잡았음. 나중에 고치면 줄여도 됨.
let lastMousePosition = new THREE.Vector2();
let hoveredPointIndex = -1;

// 점 드래깅 변수
let selectedPointIndex = -1;
let isDraggingPoint = false;

// 카메라 상태 저장용
let savedCameraState = null;


const MERGE_DISTANCE = 0.002;

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
      
      // Alt 키를 누른 상태에서 컨트롤 일시 비활성화
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
  // position.addScaledVector(normal, 0.001);
  const markerPosition = position.clone().addScaledVector(normal, 0.001);
  
  // 마커 생성 (첫 번째 점이면 초록색, 나머지는 빨간색)
  const isFirst = drawingPoints.length === 0;
  const markerSize = isFirst ? 0.002 : 0.001;
  const markerColor = isFirst ? 0x00ff00 : 0xff0000;
  
  const markerGeometry = new THREE.SphereGeometry(markerSize, 8, 8);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: markerColor });
  const marker = new THREE.Mesh(markerGeometry, markerMaterial);
  
  marker.position.copy(markerPosition);
  refs.scene.add(marker);
  
  // 점 데이터 저장
  const pointData = {
    position: position,
    normal: normal,
    marker: marker,
    faceIndex: intersect.faceIndex,  // 면의 인덱스 저장
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
  
  // position.addScaledVector(normal, 0.001);
  
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
  
  // 평균 노멀 계산 (Z-fighting 방지용)
  const averageNormal = new THREE.Vector3()
    .addVectors(normalA, normalB)
    .normalize();
  
  // 모든 점을 노멀 방향으로 약간 오프셋
  for (let i = 0; i < curvePoints.length; i++) {
    curvePoints[i].addScaledVector(averageNormal, 0.001);
  }
  
  const curveGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
  
  // 선 색상은 일반적인 경계선은 빨간색, 닫힌 영역 완성선은 초록색
  const isClosing = pointA === drawingPoints[drawingPoints.length - 1] && 
                   pointB === drawingPoints[0];
                   
  const lineMaterial = new THREE.LineBasicMaterial({
    color: isClosing ? 0x00ff00 : 0xff0000,
    depthTest: false,    // 깊이 테스트 비활성화
    depthWrite: false,   // 깊이 버퍼에 쓰지 않음
    transparent: true,   // 투명도 활성화
    opacity: 0.8,        // 마커와 유사한 투명도
    linewidth: 2         // 더 두꺼운 선 (일부 브라우저에서 제한될 수 있음)
  });
  
  const curveLine = new THREE.Line(curveGeometry, lineMaterial);
  
  // 높은 렌더링 순서 설정 (마커와 동일)
  curveLine.renderOrder = 9999;
  
  refs.scene.add(curveLine);
  
  return curveLine;
}

/**
 * 경계선을 따라 메시 분할 및 내부 면 추출
 */
function splitMeshAlongBoundary() {
  if (!refs.targetMesh || drawingPoints.length < 2) {
    console.warn('메시 분할을 위한 점이 부족합니다.');
    return null;
  }

  // 1. 원본 메시의 geometry 복사
  const originalGeometry = refs.targetMesh.geometry.clone();
  const positions = originalGeometry.attributes.position.array;
  const normals = originalGeometry.attributes.normal.array;
  const indices = originalGeometry.index ? originalGeometry.index.array : null;

  // 2. 새로운 정점과 면을 저장할 배열
  const newVertices = Array.from(positions); // 각 정점의 x, y, z 쌍
  const newNormals = Array.from(normals); // 각 정점 노말의 x, y, z 쌍
  const newIndices = Array.from(indices); // 각 삼각형의 정점 인덱스 저장. 3개씩 쌍
  const vertexFaceMap = Array.from({ length: newVertices.length / 3 }, () => []);
  for (let i = 0; i < newIndices.length / 3; i += 1) {
    const baseIndex = i * 3;
    vertexFaceMap[newIndices[baseIndex]].push(i);
    vertexFaceMap[newIndices[baseIndex+1]].push(i);
    vertexFaceMap[newIndices[baseIndex+2]].push(i);
  }
  const borderVertexIndices = [];

  const splitTriangles = []; // 각 drawingPoint에 대해 쪼개진 삼각형들의 faceIndex 저장

  // 3. 각 점에 대해 면 분할
  function mergeOrSplitPoint(point) {
    const faceIndex = point.faceIndex;
    const baseIndex = faceIndex * 3;
    
    // 면의 세 정점 인덱스
    const vertexIndices = [indices[baseIndex], indices[baseIndex + 1], indices[baseIndex + 2]];

    // 점이 면의 변에도 가깝지 않으면 면의 중심에서 분할
    const a = vertexIndices[0];
    const b = vertexIndices[1];
    const c = vertexIndices[2];

    // 새로운 점 추가
    const newVertexIndex = newVertices.length / 3;
    point.newVertexIndex = newVertexIndex;
    newVertices.push(point.position.x, point.position.y, point.position.z);
    newNormals.push(point.normal.x, point.normal.y, point.normal.z);
    borderVertexIndices.push(newVertexIndex);

    // 쪼개진 삼각형들의 faceIndex 저장
    const splitFaceIndexes = [faceIndex, newIndices.length / 3, newIndices.length / 3 + 1]
    splitTriangles.push(splitFaceIndexes);

    // 기존 면을 첫 번째 삼각형으로 대체
    newIndices.splice(baseIndex, 3, a, newVertexIndex, c);
    vertexFaceMap[b]=vertexFaceMap[b].filter(face => face !== faceIndex);

    // 두 개의 새로운 삼각형 추가
    newIndices.push(newVertexIndex, b, c, a, b, newVertexIndex);

    vertexFaceMap[c].push(splitFaceIndexes[1]);
    vertexFaceMap[a].push(splitFaceIndexes[2]);
    vertexFaceMap[b].push(splitFaceIndexes[1], splitFaceIndexes[2]);
    vertexFaceMap[newVertexIndex] = [...splitFaceIndexes];
  }

  for (let i = 0; i < drawingPoints.length; i++) {
    mergeOrSplitPoint(drawingPoints[i]);
  }

  /**
   * 삼각형이 endPoint를 포함하는지 확인
   */
  function isTriangleContainsEndPoint(faceIndex, endDrawingPoint) {
    const baseIndex = faceIndex * 3;
    return newIndices[baseIndex] === endDrawingPoint.newVertexIndex ||
           newIndices[baseIndex + 1] === endDrawingPoint.newVertexIndex || 
           newIndices[baseIndex + 2] === endDrawingPoint.newVertexIndex;
  }

  /**
   * 삼각형의 세 정점을 Vector3로 변환
   */
  function getTriangleVertices(faceIndex) {
    const baseIndex = faceIndex * 3;
    return [
      new THREE.Vector3(
        newVertices[newIndices[baseIndex] * 3],
        newVertices[newIndices[baseIndex] * 3 + 1],
        newVertices[newIndices[baseIndex] * 3 + 2]
      ),
      new THREE.Vector3(
        newVertices[newIndices[baseIndex + 1] * 3],
        newVertices[newIndices[baseIndex + 1] * 3 + 1],
        newVertices[newIndices[baseIndex + 1] * 3 + 2]
      ),
      new THREE.Vector3(
        newVertices[newIndices[baseIndex + 2] * 3],
        newVertices[newIndices[baseIndex + 2] * 3 + 1],
        newVertices[newIndices[baseIndex + 2] * 3 + 2]
      )
    ];
  }

  /**
   * 삼각형을 교차점으로 분할
   */
  function splitTriangleAtIntersection(triangleIndex, intersectionPoint, edge, intersectionPseudoDrawingPoint = null) {
    // 아래 3개가 삼각형의 정점 인덱스
    const edgeStartIndex = edge.startIndex;
    const edgeEndIndex = edge.endIndex;
    const otherVertexIndex = [newIndices[triangleIndex*3], newIndices[triangleIndex*3+1], newIndices[triangleIndex*3+2]].find(idx => idx !== edgeStartIndex && idx !== edgeEndIndex);

    let pseudoDrawingPoint;
    if (intersectionPseudoDrawingPoint !== null) {
      // 이미 생성된 교차점 정점 재사용
      pseudoDrawingPoint = intersectionPseudoDrawingPoint;
    } else {
      // 새로운 교차점 정점 생성
      const newVertexIndex = newVertices.length / 3;
      newVertices.push(intersectionPoint.x, intersectionPoint.y, intersectionPoint.z);

            
      // 엣지의 시작점과 끝점의 노말 보간
      const startNormal = new THREE.Vector3(
        newNormals[edgeStartIndex * 3],
        newNormals[edgeStartIndex * 3 + 1],
        newNormals[edgeStartIndex * 3 + 2]
      );
      const endNormal = new THREE.Vector3(
        newNormals[edgeEndIndex * 3],
        newNormals[edgeEndIndex * 3 + 1],
        newNormals[edgeEndIndex * 3 + 2]
      );
      
      // 교차점이 엣지의 어느 부분에 있는지 계산
      const edgeVector = new THREE.Vector3().subVectors(edge.end, edge.start);
      const intersectionVector = new THREE.Vector3().subVectors(intersectionPoint, edge.start);
      const t = intersectionVector.length() / edgeVector.length();
      
      // 노말 보간
      const newNormal = new THREE.Vector3().lerpVectors(startNormal, endNormal, t).normalize();
      newNormals.push(newNormal.x, newNormal.y, newNormal.z);

      
      pseudoDrawingPoint = {
        position: intersectionPoint,
        normal: newNormal,
        newVertexIndex
      };
      vertexFaceMap[pseudoDrawingPoint.newVertexIndex] = [];
      borderVertexIndices.push(newVertexIndex);
    }

    // 기존 삼각형을 첫 번째 삼각형으로 대체
    newIndices.splice(triangleIndex*3, 3, edgeStartIndex, pseudoDrawingPoint.newVertexIndex, otherVertexIndex);
    vertexFaceMap[edgeEndIndex] = vertexFaceMap[edgeEndIndex].filter(face => face !== triangleIndex);
    // 두 번째 삼각형 추가
    newIndices.push(pseudoDrawingPoint.newVertexIndex, edgeEndIndex, otherVertexIndex);
    const newTriangleIndex = newIndices.length / 3 - 1;
    vertexFaceMap[edgeEndIndex].push(newTriangleIndex);
    vertexFaceMap[otherVertexIndex].push(newTriangleIndex);
    vertexFaceMap[pseudoDrawingPoint.newVertexIndex].push(triangleIndex, newTriangleIndex);


    debugDrawLine(pseudoDrawingPoint.position, new THREE.Vector3(
      newVertices[otherVertexIndex*3],
      newVertices[otherVertexIndex*3+1],
      newVertices[otherVertexIndex*3+2]
    ), {color: 0xffff00});
  

    return {
      edgeStartIndex,
      edgeEndIndex,
      otherVertexIndex,
      pseudoDrawingPoint,
      splitTriangles: [triangleIndex, newTriangleIndex]
    };
  }

  function findAdjacentTriangle(edge, currentTriangle) {
    // edge의 첫 번째 정점에 연결된 모든 면들
    const facesWithStartVertex = vertexFaceMap[edge.startIndex];
    
    // 이 면들 중에서 edge의 두 번째 정점도 포함하고, currentTriangle이 아닌 면 찾기
    for (const faceIndex of facesWithStartVertex) {
      if (faceIndex === currentTriangle) continue;

      const faceVertexIndices = [
        newIndices[faceIndex * 3],
        newIndices[faceIndex * 3 + 1],
        newIndices[faceIndex * 3 + 2]
      ];
      
      // edge의 end 정점도 포함하는지 확인
      if (
          faceVertexIndices.includes(edge.endIndex)) {
        return faceIndex;
      }
    }
    
    return null;
  }

  /**
   * 두 점 사이 knife cut
   */
  function edgeBetweenDrawingPoints(startDrawingPoint, endDrawingPoint, candidateTriangleFaceIndexes) {
    // candidate 중 endPoint가 포함되면 종료
    for (const faceIndex of candidateTriangleFaceIndexes) {
      if (isTriangleContainsEndPoint(faceIndex, endDrawingPoint)) {
        return;
      }
    }

    // 교차점 찾기
    let intersection = null;
    
    for (const faceIndex of candidateTriangleFaceIndexes) {
      const edgeVertexIndexes = [newIndices[faceIndex*3], newIndices[faceIndex*3+1], newIndices[faceIndex*3+2]].filter(idx => idx !== startDrawingPoint.newVertexIndex);
      console.assert(edgeVertexIndexes.length === 2, 'edgeVertexIndexes.length !== 2');

      const edge = {
        start: new THREE.Vector3(
          newVertices[edgeVertexIndexes[0] * 3],
          newVertices[edgeVertexIndexes[0] * 3 + 1],
          newVertices[edgeVertexIndexes[0] * 3 + 2]
        ),
        end: new THREE.Vector3(
          newVertices[edgeVertexIndexes[1] * 3],
          newVertices[edgeVertexIndexes[1] * 3 + 1],
          newVertices[edgeVertexIndexes[1] * 3 + 2]
        ),
        startIndex: edgeVertexIndexes[0],
        endIndex: edgeVertexIndexes[1]
      }

      const endPointOnPlane = endDrawingPoint.position.clone();
    
      // 첫 번째 삼각형의 법선 벡터를 사용하여 평면 계산
      const vertices = getTriangleVertices(faceIndex);
      const v1 = new THREE.Vector3().subVectors(vertices[1], vertices[0]);
      const v2 = new THREE.Vector3().subVectors(vertices[2], vertices[0]);
      const planeNormal = new THREE.Vector3().crossVectors(v1, v2).normalize();
      
      // endPoint를 평면에 투영
      const v = new THREE.Vector3().subVectors(endPointOnPlane, vertices[0]);
      const distance = v.dot(planeNormal);
      endPointOnPlane.sub(planeNormal.multiplyScalar(distance));


      const intersectionPosition = findEdgeIntersection(
        startDrawingPoint.position,
        endPointOnPlane,
        edge.start,
        edge.end
      );

      if(intersectionPosition) {
        intersection = {
          point: intersectionPosition,
          edge: edge,
          triangle: faceIndex
        }
        break;
      }

    }

    if (!intersection){
      throw new Error('교차점 찾기 실패');
    }

    debugDrawPoint(intersection.point, {size: 0.0005, color: 0xffffff});

    // 엣지 반대편의 삼각형 찾기
    const otherTriangle = findAdjacentTriangle(intersection.edge, intersection.triangle);
    if(otherTriangle === null) {
      throw new Error('반대편 삼각형 찾기 실패');
    }

    // 교차된 삼각형 분할
    const splitResult = splitTriangleAtIntersection(
      intersection.triangle,
      intersection.point,
      intersection.edge
    );

    // 반대편 삼각형도 같은 방식으로 분할하되, 이미 생성된 교차점 정점 재사용
    const otherSplitResult = splitTriangleAtIntersection(
      otherTriangle,
      intersection.point,
      intersection.edge,
      splitResult.pseudoDrawingPoint  // 이미 생성된 교차점 정점 전달
    );

    // 이후 엣지 반대편의 쪼개진 두 삼각형을 candidate로 반복
    edgeBetweenDrawingPoints(
      splitResult.pseudoDrawingPoint,
      endDrawingPoint,
      otherSplitResult.splitTriangles
    );
  }

  // 4. 연속된 점들 사이의 경로 찾기 및 면 분할
  try{
    for (let i = 0; i < drawingPoints.length; i++) {
    const startDrawingPoint = drawingPoints[i];
    const endDrawingPoint = drawingPoints[(i + 1) % drawingPoints.length];
    
      edgeBetweenDrawingPoints(startDrawingPoint, endDrawingPoint, splitTriangles[i]);
    }
  } catch (e) {
    console.error(e);
  }

  //5. 경계 내의 면만 추출
  const usedVertices = new Set(borderVertexIndices);
  const usedFaces = new Set();
  const queue = [];

  // 내부 vertex 찾기
  // 1. 경계 vertex들의 평균 위치 계산
  const center = new THREE.Vector3();
  for (const vertexIndex of borderVertexIndices) {
    center.add(new THREE.Vector3(
      newVertices[vertexIndex * 3],
      newVertices[vertexIndex * 3 + 1],
      newVertices[vertexIndex * 3 + 2]
    ));
  }
  center.divideScalar(borderVertexIndices.length);

  // 2. 평균 위치에 가장 가까운 vertex 찾기
  let closestVertexIndex = -1;
  let minDistance = Infinity;

  for (let i = 0; i < newVertices.length / 3; i++) {
    // 이미 경계에 있는 vertex는 건너뛰기
    if (borderVertexIndices.includes(i)) continue;
    
    const vertexPos = new THREE.Vector3(
      newVertices[i * 3],
      newVertices[i * 3 + 1],
      newVertices[i * 3 + 2]
    );
    
    const distance = vertexPos.distanceTo(center);
    if (distance < minDistance) {
      minDistance = distance;
      closestVertexIndex = i;
    }
  }

  // 3. 가장 가까운 vertex를 시작점으로 사용
  usedVertices.add(closestVertexIndex);
  queue.push(closestVertexIndex);


  // BFS로 내부 면 찾기
  while (queue.length > 0) {
    const vertexIndex = queue.shift();
    
    // 이 vertex를 사용하는 모든 face들 확인
    for (const faceIndex of vertexFaceMap[vertexIndex]) {
      if (usedFaces.has(faceIndex)) continue;
      
      // face의 모든 vertex들 확인
      const faceVertices = [
        newIndices[faceIndex * 3],
        newIndices[faceIndex * 3 + 1],
        newIndices[faceIndex * 3 + 2]
      ];
      
      // face 추가
      usedFaces.add(faceIndex);
      
      // 새로운 vertex들을 큐에 추가
      for (const v of faceVertices) {
        if (!usedVertices.has(v)) {
          usedVertices.add(v);
          queue.push(v);
        }
      }
    }
  }

  console.log(usedFaces )

  // 사용된 vertex와 face만으로 새로운 geometry 생성
  const finalVertices = [];
  const finalNormals = [];
  const finalIndices = [];
  const vertexMap = new Map(); // old index -> new index 매핑

  // 사용된 vertex들만 추출
  for (const vertexIndex of usedVertices) {
    vertexMap.set(vertexIndex, finalVertices.length / 3);
    finalVertices.push(
      newVertices[vertexIndex * 3],
      newVertices[vertexIndex * 3 + 1],
      newVertices[vertexIndex * 3 + 2]
    );
    finalNormals.push(
      newNormals[vertexIndex * 3],
      newNormals[vertexIndex * 3 + 1],
      newNormals[vertexIndex * 3 + 2]
    );
  }

  // 사용된 face들만 추출
  for (const faceIndex of usedFaces) {
    finalIndices.push(
      vertexMap.get(newIndices[faceIndex * 3]),
      vertexMap.get(newIndices[faceIndex * 3 + 1]),
      vertexMap.get(newIndices[faceIndex * 3 + 2])
    );
  }

  // 새 geometry 생성
  const newGeometry = new THREE.BufferGeometry();
  newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(finalVertices, 3));
  newGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(finalNormals, 3));
  newGeometry.setIndex(finalIndices);

  // 새 메시 생성
  const newMesh = new THREE.Mesh(
    newGeometry,
    new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.8
    })
  );

  // 원본 메시의 변환 적용
  newMesh.position.copy(refs.targetMesh.position);
  newMesh.rotation.copy(refs.targetMesh.rotation);
  newMesh.scale.copy(refs.targetMesh.scale);

  return newMesh;
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
  
  // 메시 분할 및 내부 면 추출
  const splitMesh = splitMeshAlongBoundary();
  if (splitMesh) {
    // 기존 플리퍼 메시가 있다면 제거
    if (flipperMesh && flipperMesh.parent) {
      refs.scene.remove(flipperMesh);
      flipperMesh.geometry.dispose();
      flipperMesh.material.dispose();
    }
    
    // 새 메시 설정
    flipperMesh = splitMesh;
    refs.scene.add(flipperMesh);
    
    // 원본 메시 숨기기
    if (refs.targetMesh) {
      refs.targetMesh.visible = false;
    }
    
    // 메시 설정
    setFlipperMesh(flipperMesh);
  }
  
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

/**
 * 플리퍼 메시만 초기화하는 함수
 * 점과 선은 그대로 유지합니다.
 */
export function resetFlipperMeshOnly() {
  // 플리퍼 메쉬가 있다면 제거
  if (flipperMesh && flipperMesh.parent) {
    refs.scene.remove(flipperMesh);
    flipperMesh.geometry.dispose();
    flipperMesh.material.dispose();
    flipperMesh = null;
  }
  
  // 영역이 완료된 상태라면 생성 버튼 활성화
  if (selectedAreaPoints.length > 0) {
    const generateBtn = document.getElementById('btn-generate-flipper');
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.classList.add('active');
      generateBtn.innerHTML = '<span style="display: flex; align-items: center; justify-content: center;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>플리퍼 생성</span>';
      generateBtn.style.background = '#555';
    }
  }
  
  // 완료 버튼 비활성화
  const completeBtn = document.getElementById('btn-flipper-complete');
  if (completeBtn) {
    completeBtn.disabled = true;
    completeBtn.classList.remove('active');
  }
  
  // 상태 메시지 업데이트
  updateFlipperInfoText('플리퍼 메시가 초기화되었습니다. 원하는 경우 "플리퍼 생성" 버튼을 다시 클릭하세요.');
  
  return true;
}

/**
 * 두 선분의 교차점 찾기 (같은 평면 위에 있다고 가정)
 * @param {THREE.Vector3} p1 
 * @param {THREE.Vector3} p2 
 * @param {THREE.Vector3} p3 
 * @param {THREE.Vector3} p4 
 * @returns {THREE.Vector3|null}
 */
function findEdgeIntersection(p1, p2, p3, p4) {
  // 기준 평면의 노멀 벡터 (p1, p2, p3이 같은 평면에 있다고 가정)
  const u = new THREE.Vector3().subVectors(p2, p1);
  const v = new THREE.Vector3().subVectors(p3, p1);
  const normal = new THREE.Vector3().crossVectors(u, v).normalize();

  // 평면상의 좌표계를 만들기 위한 기준 축
  const xAxis = u.clone().normalize();
  const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();

  // 3D 점을 2D 평면으로 투영
  function projectTo2D(p) {
    const d = new THREE.Vector3().subVectors(p, p1);
    return new THREE.Vector2(d.dot(xAxis), d.dot(yAxis));
  }

  const a1 = projectTo2D(p1);
  const a2 = projectTo2D(p2);
  const b1 = projectTo2D(p3);
  const b2 = projectTo2D(p4);

  // 2D에서 선분 교차 테스트
  const denom = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(denom) < 1e-10) return null; // 평행함

  const ua = ((b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x)) / denom;
  const ub = ((a2.x - a1.x) * (a1.y - b1.y) - (a2.y - a1.y) * (a1.x - b1.x)) / denom;

  if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null; // 선분 범위 밖

  // 교차점 계산 (p1 + ua * (p2 - p1))
  const intersection = new THREE.Vector3().addVectors(
    p1,
    new THREE.Vector3().subVectors(p2, p1).multiplyScalar(ua)
  );

  return intersection;
}

function debugDrawPoint(point, {size = 0.0002, color = 0xffff00, opacity = 0.5} = {}) {
  const sphereGeometry = new THREE.SphereGeometry(size, 8, 8);
  const sphereMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.position.copy(point);
  refs.scene.add(sphere);
  return sphere;
}

function debugDrawLine(startPoint, endPoint, {width = 0.0002, color = 0xffff00, opacity = 0.5} = {}) {
     // 두 점 사이의 거리 계산
    const distance = startPoint.distanceTo(endPoint);
    
    // 실린더 생성
    const cylinderGeometry = new THREE.CylinderGeometry(width, width, distance, 8);
    const cylinderMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
    const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
    
    // 실린더 위치 및 회전 설정
    const midPoint = new THREE.Vector3().addVectors(startPoint, endPoint).multiplyScalar(0.5);
    cylinder.position.copy(midPoint);
    
    // 실린더를 두 점을 잇는 방향으로 회전
    const direction = new THREE.Vector3().subVectors(endPoint, startPoint).normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction
    );
    cylinder.quaternion.copy(quaternion);
    
    refs.scene.add(cylinder);
    return cylinder;
}
