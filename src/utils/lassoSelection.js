// src/utils/lassoSelection.js
// 올가미 선택 공통 모듈 - 플리퍼의 기존 코드를 클래스 기반으로 추상화

import * as THREE from 'three';

/**
 * 올가미 기반 영역 선택을 위한 공통 클래스
 * 플리퍼와 발치 기능에서 공통으로 사용
 */
export class LassoSelector {
  constructor(targetMesh, scene, camera, renderer, options = {}) {
    this.targetMesh = targetMesh;
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.controls = options.controls; // 카메라 컨트롤 (옵션)
    
    // 설정 옵션
    this.options = {
      markerColors: {
        first: options.markerColors?.first || 0x00ff00,    // 첫 점: 초록
        regular: options.markerColors?.regular || 0xff0000, // 일반 점: 빨강
        preview: options.markerColors?.preview || 0xffa500  // 미리보기: 주황
      },
      markerSizes: {
        first: options.markerSizes?.first || 0.005,
        regular: options.markerSizes?.regular || 0.003
      },
      curveQuality: options.curveQuality || 20,
      minDistanceBetweenPoints: options.minDistanceBetweenPoints || 0.01,
      onUpdateMessage: options.onUpdateMessage || (() => {}), // 상태 변경 콜백
      onPointAdded: options.onPointAdded || (() => {}), // 점 추가 콜백
      onComplete: options.onComplete || (() => {}), // 영역 완성 콜백
      onPointDragComplete: options.onPointDragComplete || (() => {}), // 점 드래깅 완료 콜백
      onError: options.onError || (() => {}) // 오류 콜백
    };
    
    // 상태 변수들 (플리퍼 기존 변수들)
    this.drawingPoints = [];
    this.pointMarkers = [];
    this.curveLines = [];
    this.lineClosed = false;
    
    // 마우스 관련 변수
    this.isDrawing = false;
    this.lastMousePosition = new THREE.Vector2();
    this.hoveredPointIndex = -1;
    
    // 점 드래깅 변수
    this.selectedPointIndex = -1;
    this.isDraggingPoint = false;
    
    // 이벤트 핸들러 바인딩
    this.boundEventHandlers = {
      onKeyDown: this.onKeyDown.bind(this),
      onKeyUp: this.onKeyUp.bind(this),
      onPointerDown: this.onPointerDown.bind(this),
      onPointerMove: this.onPointerMove.bind(this),
      onPointerUp: this.onPointerUp.bind(this),
      onClick: this.onClick.bind(this),
      onWindowBlur: this.onWindowBlur.bind(this)
    };
    
    // 활성 상태
    this.isActive = false;
  }
  
  /**
   * 올가미 선택 시작
   */
  startSelection() {
    if (this.isActive) {
      console.warn('LassoSelector가 이미 활성화되어 있습니다.');
      return false;
    }
    
    if (!this.targetMesh) {
      console.warn('대상 메시가 설정되지 않았습니다.');
      this.options.onError('대상 메시가 없습니다.');
      return false;
    }
    
    this.isActive = true;
    this.addEventListeners();
    this.options.onUpdateMessage('올가미 선택이 시작되었습니다. Alt 키를 누른 상태에서 드래그하여 영역을 선택하세요.');
    
    console.log('LassoSelector 활성화됨');
    return true;
  }
  
  /**
   * 올가미 선택 중지
   */
  stopSelection() {
    if (!this.isActive) return false;
    
    this.isActive = false;
    this.removeEventListeners();
    
    // 커서 스타일 초기화
    this.renderer.domElement.style.cursor = 'auto';
    
    console.log('LassoSelector 비활성화됨');
    return true;
  }
  
  /**
   * 모든 데이터 정리
   */
  cleanup(preserveSelection = false) {
    // 이벤트 리스너 제거
    this.stopSelection();
    
    // 마커들 제거
    this.pointMarkers.forEach(marker => {
      if (marker && marker.parent) {
        marker.parent.remove(marker);
        marker.geometry?.dispose();
        marker.material?.dispose();
      }
    });
    
    // 곡선들 제거
    this.curveLines.forEach(line => {
      if (line && line.parent) {
        line.parent.remove(line);
        line.geometry?.dispose();
        line.material?.dispose();
      }
    });
    
    // 상태 초기화
    if (!preserveSelection) {
      this.drawingPoints = [];
    }
    this.pointMarkers = [];
    this.curveLines = [];
    this.lineClosed = false;
    this.isDrawing = false;
    this.hoveredPointIndex = -1;
    this.selectedPointIndex = -1;
    this.isDraggingPoint = false;
    
    console.log('LassoSelector 데이터 정리 완료');
  }
  
  /**
   * 이벤트 리스너 추가
   */
  addEventListeners() {
    const rendererDom = this.renderer.domElement;
    
    // 기존 이벤트 리스너 제거 (중복 방지)
    this.removeEventListeners();
    
    // 새 이벤트 리스너 추가
    rendererDom.addEventListener('pointerdown', this.boundEventHandlers.onPointerDown);
    rendererDom.addEventListener('pointermove', this.boundEventHandlers.onPointerMove);
    rendererDom.addEventListener('pointerup', this.boundEventHandlers.onPointerUp);
    rendererDom.addEventListener('click', this.boundEventHandlers.onClick);
    
    window.addEventListener('keydown', this.boundEventHandlers.onKeyDown);
    window.addEventListener('keyup', this.boundEventHandlers.onKeyUp);
    window.addEventListener('blur', this.boundEventHandlers.onWindowBlur);
  }
  
  /**
   * 이벤트 리스너 제거
   */
  removeEventListeners() {
    const rendererDom = this.renderer.domElement;
    
    rendererDom.removeEventListener('pointerdown', this.boundEventHandlers.onPointerDown);
    rendererDom.removeEventListener('pointermove', this.boundEventHandlers.onPointerMove);
    rendererDom.removeEventListener('pointerup', this.boundEventHandlers.onPointerUp);
    rendererDom.removeEventListener('click', this.boundEventHandlers.onClick);
    
    window.removeEventListener('keydown', this.boundEventHandlers.onKeyDown);
    window.removeEventListener('keyup', this.boundEventHandlers.onKeyUp);
    window.removeEventListener('blur', this.boundEventHandlers.onWindowBlur);
  }
  
  /**
   * 키 다운 이벤트 핸들러
   */
  onKeyDown(event) {
    if (!this.isActive) return;
    
    // 트리거 키 (기본: Alt)
    if (event.key === 'Alt' || event.altKey) {
      // 그리기 모드가 닫히지 않았다면 커서 변경
      if (this.drawingPoints.length === 0 || this.curveLines.length < this.drawingPoints.length) {
        this.renderer.domElement.style.cursor = 'crosshair';
        
        // 카메라 컨트롤 비활성화
        if (this.controls) {
          this.controls.enabled = false;
        }
      }
    }
  }
  
  /**
   * 키 업 이벤트 핸들러
   */
  onKeyUp(event) {
    if (!this.isActive) return;
    
    // 트리거 키 해제
    if (event.key === 'Alt' || event.altKey) {
      // 그리기 중이었다면 중지
      if (this.isDrawing) {
        this.isDrawing = false;
      }
      
      // 커서 스타일 초기화 (드래깅 중이 아니면)
      if (!this.isDraggingPoint) {
        this.renderer.domElement.style.cursor = 'auto';
      }
      
      // 카메라 컨트롤 재활성화 (드래깅 중이 아니면)
      if (!this.isDraggingPoint && this.controls) {
        this.controls.enabled = true;
      }
    }
  }
  
  /**
   * 포인터 다운 이벤트 핸들러
   */
  onPointerDown(event) {
    if (!this.isActive) return;
    
    // 영역이 이미 닫혔다면 점 이동 처리
    if (this.lineClosed && this.hoveredPointIndex !== -1) {
      event.preventDefault();
      
      // 카메라 컨트롤 비활성화
      if (this.controls) {
        this.controls.enabled = false;
      }
      
      this.selectedPointIndex = this.hoveredPointIndex;
      this.isDraggingPoint = true;
      return;
    }
    
    // Alt 키가 눌려 있지 않다면 무시
    if (!event.altKey) return;
    
    // 화면 좌표를 정규화된 디바이스 좌표로 변환
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.lastMousePosition = new THREE.Vector2(mouseX, mouseY);
    
    // 레이캐스터 생성
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), this.camera);
    
    // 마커 클릭 처리
    const markerIntersects = raycaster.intersectObjects(this.pointMarkers);
    if (markerIntersects.length > 0) {
      this.handleMarkerClick(markerIntersects[0].object, event);
      return;
    }
    
    // 대상 메시와의 교차점 확인
    const intersects = raycaster.intersectObject(this.targetMesh, true);
    if (intersects.length > 0) {
      // 그리기 모드 활성화
      this.isDrawing = true;
      
      // 첫 번째 점이고 Shift 키가 같이 눌려있다면 영역 그리기 완료
      if (this.drawingPoints.length > 2 && event.shiftKey && 
          intersects[0].point.distanceTo(this.drawingPoints[0].position) < 0.1) {
        this.completeArea();
        return;
      }
      
      // 새 점 추가
      this.addPoint(intersects[0]);
      
      // 커서 스타일 변경
      this.renderer.domElement.style.cursor = 'crosshair';
    }
  }
  
  /**
   * 마커 클릭 처리
   */
  handleMarkerClick(clickedMarker, event) {
    const markerIndex = this.pointMarkers.indexOf(clickedMarker);
    if (markerIndex === -1) return;
    
    // Alt 키를 누른 상태로 마커 클릭: 해당 점 이후의 모든 점 제거
    if (event.altKey) {
      this.removePointsAfter(markerIndex);
      this.options.onUpdateMessage(`${markerIndex + 1}번 점 이후의 모든 점을 제거했습니다. 계속해서 그리세요.`);
      return;
    }
    
    // 일반 마커 클릭: 점 제거
    this.removePoint(markerIndex);
  }
  
  /**
   * 포인터 이동 이벤트 핸들러
   */
  onPointerMove(event) {
    if (!this.isActive) return;
    
    // 화면 좌표를 정규화된 디바이스 좌표로 변환
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const mouse = new THREE.Vector2(mouseX, mouseY);
    
    // 레이캐스터 생성
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);
    
    // 점 드래깅 처리
    if (this.isDraggingPoint && this.selectedPointIndex !== -1) {
      const intersects = raycaster.intersectObject(this.targetMesh, true);
      if (intersects.length > 0) {
        this.updatePointPosition(this.selectedPointIndex, intersects[0]);
      }
      return;
    }
    
    // 호버링 점 확인
    this.updateHoveredPoint(raycaster, event);
    
    // 그리기 모드에서 드래그로 점 추가
    if (this.isDrawing && event.altKey) {
      // 마우스가 충분히 이동했을 때만 새 점 추가
      if (mouse.distanceTo(this.lastMousePosition) > 0.01) {
        this.lastMousePosition.copy(mouse);
        
        const intersects = raycaster.intersectObject(this.targetMesh, true);
        if (intersects.length > 0) {
          const newIntersection = intersects[0];
          
          // 이전 점과의 거리 확인
          if (this.drawingPoints.length > 0) {
            const lastPoint = this.drawingPoints[this.drawingPoints.length - 1].position;
            const newPoint = newIntersection.point.clone();
            
            if (lastPoint.distanceTo(newPoint) > this.options.minDistanceBetweenPoints) {
              this.addPoint(newIntersection);
            }
          } else {
            this.addPoint(newIntersection);
          }
        }
      }
    }
  }
  
  /**
   * 호버링 점 업데이트 및 커서 변경
   */
  updateHoveredPoint(raycaster, event) {
    const prevHoveredIndex = this.hoveredPointIndex;
    this.hoveredPointIndex = -1;
    
    this.drawingPoints.forEach((pointData, index) => {
      if (pointData.marker) {
        const intersects = raycaster.intersectObject(pointData.marker);
        if (intersects.length > 0) {
          this.hoveredPointIndex = index;
        }
      }
    });
    
    // 호버링 상태 변경 시 커서 스타일 업데이트
    if (prevHoveredIndex !== this.hoveredPointIndex) {
      if (this.hoveredPointIndex === 0 && this.drawingPoints.length > 2 && !this.lineClosed) {
        // 첫 번째 점에 호버링 - 영역 닫기 가능
        this.renderer.domElement.style.cursor = 'pointer';
      } else if (this.hoveredPointIndex !== -1 && this.lineClosed) {
        // 점에 호버링 - 이동 가능
        this.renderer.domElement.style.cursor = 'move';
      } else if (this.isDrawing) {
        // 그리기 중
        this.renderer.domElement.style.cursor = 'crosshair';
      } else if (event.altKey && !this.lineClosed) {
        // Alt 키 누른 상태에서 그리기 가능
        this.renderer.domElement.style.cursor = 'crosshair';
      } else {
        // 기본 상태
        this.renderer.domElement.style.cursor = 'auto';
      }
    }
  }
  
  /**
   * 포인터 업 이벤트 핸들러
   */
  onPointerUp(event) {
    if (!this.isActive) return;
    
    // 점 드래깅 종료
    if (this.isDraggingPoint) {
      this.isDraggingPoint = false;
      this.selectedPointIndex = -1;
      
      // 카메라 컨트롤 재활성화
      if (this.controls) {
        this.controls.enabled = true;
      }
      
      // 영역이 닫혀있다면 점 드래깅 완료 콜백 호출
      if (this.lineClosed) {
        this.options.onPointDragComplete(this.drawingPoints.slice());
      }
      
      return;
    }
    
    // 그리기 종료 - Alt 키가 여전히 눌려있다면 그리기 모드 유지
    if (this.isDrawing && !event.altKey) {
      this.isDrawing = false;
    }
  }
  
  /**
   * 클릭 이벤트 핸들러 - 영역 닫기
   */
  onClick(event) {
    if (!this.isActive) return;
    
    // 드래깅 중이거나 Alt 키가 눌려있거나 이미 완료되었으면 무시
    if (this.isDraggingPoint || event.altKey || this.lineClosed) return;
    
    // 첫 번째 점 클릭으로 영역 닫기
    if (this.hoveredPointIndex === 0 && this.drawingPoints.length > 2) {
      this.completeArea();
    }
  }
  
  /**
   * 윈도우 포커스 아웃 이벤트 핸들러
   */
  onWindowBlur() {
    if (!this.isActive) return;
    
    if (this.isDrawing) {
      this.isDrawing = false;
      
      // 카메라 컨트롤 재활성화
      if (this.controls) {
        this.controls.enabled = true;
      }
    }
    
    if (this.isDraggingPoint) {
      this.isDraggingPoint = false;
      this.selectedPointIndex = -1;
      
      // 카메라 컨트롤 재활성화
      if (this.controls) {
        this.controls.enabled = true;
      }
    }
  }
  
  /**
   * 점 추가
   */
  addPoint(intersect) {
    // 점 위치와 노멀 가져오기
    const position = intersect.point.clone();
    let normal = intersect.face.normal.clone();
    normal.transformDirection(this.targetMesh.matrixWorld).normalize();
    
    // Z-fighting 방지를 위해 노멀 방향으로 약간 오프셋
    const markerPosition = position.clone().addScaledVector(normal, 0.001);
    
    // 마커 생성 (첫 번째 점이면 다른 색상/크기)
    const isFirst = this.drawingPoints.length === 0;
    const markerSize = isFirst ? this.options.markerSizes.first : this.options.markerSizes.regular;
    const markerColor = isFirst ? this.options.markerColors.first : this.options.markerColors.regular;
    
    const markerGeometry = new THREE.SphereGeometry(markerSize, 8, 8);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: markerColor });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    
    marker.position.copy(markerPosition);
    marker.renderOrder = 9999; // 최상위 렌더링
    this.scene.add(marker);
    
    // 점 데이터 저장
    const pointData = {
      position: position,
      normal: normal,
      marker: marker,
      faceIndex: intersect.faceIndex
    };
    
    this.drawingPoints.push(pointData);
    this.pointMarkers.push(marker);
    
    // 두 점 이상이면 곡선 생성
    if (this.drawingPoints.length >= 2) {
      const prevPoint = this.drawingPoints[this.drawingPoints.length - 2];
      const currPoint = this.drawingPoints[this.drawingPoints.length - 1];
      
      const curve = this.createCurveBetweenPoints(prevPoint, currPoint);
      this.curveLines.push(curve);
    }
    
    // 상태 업데이트
    if (this.drawingPoints.length === 1) {
      this.options.onUpdateMessage('첫 번째 점이 추가되었습니다. Alt 키를 누른 상태로 계속 드래그하여 경계선을 그리세요.');
    } else if (this.drawingPoints.length >= 3) {
      this.options.onUpdateMessage('Alt+Shift+첫번째점 클릭으로 영역을 완성하세요 (3점 이상 필요).');
    }
    
    // 점 추가 콜백 호출
    this.options.onPointAdded(this.drawingPoints.length);
    
    console.log(`점 추가됨 (총 ${this.drawingPoints.length}개)`);
  }
  
  /**
   * 두 점 사이에 곡선 생성
   */
  createCurveBetweenPoints(pointA, pointB) {
    const positionA = pointA.position;
    const positionB = pointB.position;
    const normalA = pointA.normal;
    const normalB = pointB.normal;
    
    // 거리에 따라 샘플 수 조정
    const distance = positionA.distanceTo(positionB);
    const sampleCount = Math.max(this.options.curveQuality, Math.floor(distance * 500));
    
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
      
      const intersects = raycaster.intersectObject(this.targetMesh, true);
      
      if (intersects.length > 0) {
        // 레이캐스팅 성공 시 교차점 사용
        let hitNormal = intersects[0].face.normal.clone();
        hitNormal.transformDirection(this.targetMesh.matrixWorld);
        
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
    
    // 선 색상 결정
    const isClosing = pointA === this.drawingPoints[this.drawingPoints.length - 1] && 
                     pointB === this.drawingPoints[0];
                     
    const lineMaterial = new THREE.LineBasicMaterial({
      color: isClosing ? 0x00ff00 : 0xff0000,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.8,
      linewidth: 2
    });
    
    const curveLine = new THREE.Line(curveGeometry, lineMaterial);
    curveLine.renderOrder = 9999;
    
    this.scene.add(curveLine);
    
    return curveLine;
  }
  
  /**
   * 영역 완성
   */
  completeArea() {
    if (this.drawingPoints.length < 3) {
      const message = '영역 완성에는 최소 3개의 점이 필요합니다.';
      console.warn(message);
      this.options.onUpdateMessage(message);
      return false;
    }
    
    // 영역 닫기 (마지막 점과 첫 점 연결)
    const firstPoint = this.drawingPoints[0];
    const lastPoint = this.drawingPoints[this.drawingPoints.length - 1];
    
    // 마지막 점과 첫 점을 연결하는 곡선 생성
    const closingCurve = this.createCurveBetweenPoints(lastPoint, firstPoint);
    this.curveLines.push(closingCurve);

    this.lineClosed = true;
    this.isDrawing = false;
    
    // 커서 초기화
    this.renderer.domElement.style.cursor = 'auto';
    
    // 완성 콜백 호출
    this.options.onComplete(this.drawingPoints.slice()); // 복사본 전달
    this.options.onUpdateMessage('영역이 완성되었습니다.');
    
    console.log('올가미 영역 완성');
    return true;
  }
  
  /**
   * 특정 인덱스 이후의 모든 점 제거
   */
  removePointsAfter(index) {
    if (index < 0 || index >= this.drawingPoints.length - 1) return;
    
    // 해당 인덱스 이후의 모든 점 제거
    for (let i = this.drawingPoints.length - 1; i > index; i--) {
      const marker = this.pointMarkers[i];
      if (marker && marker.parent) {
        this.scene.remove(marker);
        marker.geometry?.dispose();
        marker.material?.dispose();
      }
      
      this.pointMarkers.pop();
      this.drawingPoints.pop();
    }
    
    // 곡선 업데이트
    for (let i = this.curveLines.length - 1; i >= index; i--) {
      const curveLine = this.curveLines[i];
      if (curveLine && curveLine.parent) {
        this.scene.remove(curveLine);
        curveLine.geometry?.dispose();
        curveLine.material?.dispose();
      }
      this.curveLines.pop();
    }
    
    // 상태 재설정
    this.isDrawing = true;
    this.lineClosed = false;
  }
  
  /**
   * 특정 점 제거
   */
  removePoint(index) {
    if (index < 0 || index >= this.drawingPoints.length) return;
    
    // 마커 제거
    const marker = this.pointMarkers[index];
    if (marker && marker.parent) {
      this.scene.remove(marker);
      marker.geometry?.dispose();
      marker.material?.dispose();
    }
    
    this.pointMarkers.splice(index, 1);
    this.drawingPoints.splice(index, 1);
    
    // 점 제거 콜백 호출
    this.options.onPointAdded(this.drawingPoints.length);
    
    // 연결된 곡선 업데이트
    this.updateCurvesAfterPointRemoval(index);
  }
  
  /**
   * 점 제거 후 곡선 업데이트
   */
  updateCurvesAfterPointRemoval(removedIndex) {
    const curvesToRemove = [];
    
    // 제거된 점에 연결된 곡선 찾기
    if (removedIndex > 0) {
      curvesToRemove.push(removedIndex - 1);
    }
    if (removedIndex < this.curveLines.length) {
      curvesToRemove.push(removedIndex);
    }
    
    // 곡선 제거
    curvesToRemove.sort((a, b) => b - a).forEach(curveIndex => {
      if (this.curveLines[curveIndex] && this.curveLines[curveIndex].parent) {
        this.scene.remove(this.curveLines[curveIndex]);
        this.curveLines[curveIndex].geometry?.dispose();
        this.curveLines[curveIndex].material?.dispose();
      }
      this.curveLines.splice(curveIndex, 1);
    });
    
    // 새 곡선 생성 (필요한 경우)
    if (this.drawingPoints.length >= 2 && removedIndex > 0 && removedIndex < this.drawingPoints.length) {
      const prevPointIndex = removedIndex - 1;
      const nextPointIndex = removedIndex;
      
      if (prevPointIndex >= 0 && nextPointIndex < this.drawingPoints.length) {
        const prevPoint = this.drawingPoints[prevPointIndex];
        const nextPoint = this.drawingPoints[nextPointIndex];
        
        const newCurve = this.createCurveBetweenPoints(prevPoint, nextPoint);
        this.curveLines.splice(prevPointIndex, 0, newCurve);
      }
    }
  }
  
  /**
   * 점 위치 업데이트 (드래깅용)
   */
  updatePointPosition(index, intersection) {
    if (index < 0 || index >= this.drawingPoints.length) return;
    
    // 새 위치와 노멀 가져오기
    const position = intersection.point.clone();
    let normal = intersection.face.normal.clone();
    normal.transformDirection(this.targetMesh.matrixWorld).normalize();
    
    // 점 데이터 업데이트
    const pointData = this.drawingPoints[index];
    pointData.position.copy(position);
    pointData.normal.copy(normal);
    pointData.faceIndex = intersection.faceIndex;
    
    // 마커 위치 업데이트
    if (pointData.marker) {
      pointData.marker.position.copy(position.clone().addScaledVector(normal, 0.001));
    }
    
    // 연결된 곡선 업데이트
    this.updateConnectedCurves(index);
  }
  
  /**
   * 점에 연결된 곡선 업데이트
   */
  updateConnectedCurves(index) {
    if (index < 0 || index >= this.drawingPoints.length) return;
    
    const pointsCount = this.drawingPoints.length;
    
    // 이전 점으로의 곡선 업데이트
    if (index > 0) {
      this.updateCurveBetweenPoints(index - 1, index);
    } else if (this.lineClosed) {
      // 첫 번째 점이면서 영역이 닫혔다면 마지막-첫번째 연결 곡선 업데이트
      this.updateCurveBetweenPoints(pointsCount - 1, 0);
    }
    
    // 다음 점으로의 곡선 업데이트
    if (index < pointsCount - 1) {
      this.updateCurveBetweenPoints(index, index + 1);
    } else if (this.lineClosed) {
      // 마지막 점이면서 영역이 닫혔다면 마지막-첫번째 연결 곡선 업데이트
      this.updateCurveBetweenPoints(pointsCount - 1, 0);
    }
  }
  
  /**
   * 두 점 사이의 곡선 업데이트
   */
  updateCurveBetweenPoints(startIndex, endIndex) {
    // 인덱스 유효성 검사
    if (startIndex < 0 || startIndex >= this.drawingPoints.length || 
        endIndex < 0 || endIndex >= this.drawingPoints.length) {
      return;
    }
    
    // 곡선 인덱스 결정
    let curveIndex = -1;
    
    // 일반 경우 - 인접한 점들
    if (endIndex === startIndex + 1) {
      curveIndex = startIndex;
    } 
    // 닫는 곡선 - 마지막 점과 첫 번째 점
    else if (startIndex === this.drawingPoints.length - 1 && endIndex === 0) {
      curveIndex = this.curveLines.length - 1;
    }
    
    if (curveIndex >= 0 && curveIndex < this.curveLines.length) {
      // 기존 곡선 제거
      if (this.curveLines[curveIndex] && this.curveLines[curveIndex].parent) {
        this.curveLines[curveIndex].parent.remove(this.curveLines[curveIndex]);
        this.curveLines[curveIndex].geometry?.dispose();
        this.curveLines[curveIndex].material?.dispose();
      }
      
      // 새 곡선 생성
      const curveLine = this.createCurveBetweenPoints(
        this.drawingPoints[startIndex], 
        this.drawingPoints[endIndex]
      );
      
      // 배열에서 교체
      this.curveLines[curveIndex] = curveLine;
    }
  }
  
  /**
   * 현재 선택된 점들 반환
   */
  getSelectedPoints() {
    return this.drawingPoints.slice(); // 복사본 반환
  }
  
  /**
   * 영역이 완성되었는지 확인
   */
  isAreaClosed() {
    return this.lineClosed;
  }
  
  /**
   * 현재 상태 정보 반환
   */
  getState() {
    return {
      isActive: this.isActive,
      pointCount: this.drawingPoints.length,
      isAreaClosed: this.lineClosed,
      isDrawing: this.isDrawing,
      isDragging: this.isDraggingPoint
    };
  }
}
