// src/features/tooth-removal/toothRemovalCore.js
// 치아 제거 핵심 로직 - 1단계 구현 (lasso select + knife cut + 내부면 삭제)

import * as THREE from 'three';
import { LassoSelector } from '../../utils/lassoSelection.js';
import { MeshCutter } from '../../utils/meshCutter.js';
import { extractInnerFacesFromBorder } from '../../utils/meshProcessing.js';
import { refs, modelList, activeItemIndex } from '../../models/modelManager.js';
import { MeshBVHHelper } from 'three-mesh-bvh';

/**
 * 치아 제거 시스템 클래스
 */
export class ToothRemovalSystem {
  constructor() {
    // 올가미 선택 시스템
    this.lassoSelector = null;
    
    // geometry 백업 관리
    this.originalGeometry = null;      // 완전한 원본 (처음 상태)
    this.geometryBackup = null;        // 현재 작업 기준점 (되돌리기용)
    this.lastConfirmedGeometry = null; // 마지막 확정된 상태
    
    // 상태 관리
    this.isActive = false;
    this.isSelectionComplete = false;
    this.isRemovalComplete = false;
    this.selectedPoints = [];
    
    // 콜백 함수들
    this.onUpdateMessage = null;
    this.onPointProgress = null;
    this.onSelectionComplete = null;
    this.onRemovalComplete = null;
    this.onError = null;
  }

  /**
   * 치아 제거 시스템 초기화
   */
  init(options = {}) {
    if (!refs.targetMesh) {
      const message = '치아 제거할 대상 메시가 없습니다.';
      console.warn(message);
      if (this.onError) this.onError(message);
      return false;
    }

    // 콜백 함수 설정
    this.onUpdateMessage = options.onUpdateMessage || (() => {});
    this.onPointProgress = options.onPointProgress || (() => {});
    this.onSelectionComplete = options.onSelectionComplete || (() => {});
    this.onRemovalComplete = options.onRemovalComplete || (() => {});
    this.onError = options.onError || (() => {});

    // geometry 백업 시스템 초기화
    this.originalGeometry = refs.targetMesh.geometry;           // 완전한 원본
    this.geometryBackup = this.originalGeometry.clone();       // 현재 작업 기준점
    this.lastConfirmedGeometry = this.originalGeometry.clone(); // 마지막 확정 상태

    // LassoSelector 초기화
    this.initLassoSelector();

    // 상태 초기화
    this.isActive = true;
    this.isSelectionComplete = false;
    this.isRemovalComplete = false;
    this.selectedPoints = [];

    console.log('치아 제거 시스템 초기화 완료');
    return true;
  }

  /**
   * LassoSelector 초기화
   */
  initLassoSelector() {
    // 기존 LassoSelector 정리
    if (this.lassoSelector) {
      this.lassoSelector.cleanup();
    }

    // 치아 제거용 LassoSelector 생성 (주황색 마커)
    this.lassoSelector = new LassoSelector(refs.targetMesh, refs.scene, refs.camera, refs.renderer, {
      controls: refs.controls,
      markerColors: {
        first: 0x00ff00,    // 첫 점: 초록
        regular: 0xff0000,  // 일반 점: 빨강
        preview: 0xffa500   // 미리보기: 주황 (발치용)
      },
      curveQuality: 20,
      minDistanceBetweenPoints: 0.01,
      onUpdateMessage: (message) => {
        if (this.onUpdateMessage) this.onUpdateMessage(message);
      },
      onPointAdded: (pointCount) => {
        this.selectedPoints = Array(pointCount).fill(null); // 임시로 개수만 맞춤
        console.log(`치아 제거: 점 추가됨 (${pointCount}개)`);
        // UI 업데이트를 위한 콜백 호출
        if (this.onPointProgress) {
          this.onPointProgress(pointCount);
        }
      },
      onComplete: (points) => {
        this.onLassoComplete(points);
      },
      onError: (error) => {
        console.error('LassoSelector 오류:', error);
        if (this.onError) this.onError(`선택 오류: ${error}`);
      }
    });
  }

  /**
   * 치아 선택 시작
   */
  startSelection() {
    if (!this.isActive) {
      console.warn('치아 제거 시스템이 초기화되지 않았습니다.');
      return false;
    }

    if (this.isSelectionComplete) {
      this.onUpdateMessage('이미 선택이 완료되었습니다. "치아 제거" 버튼을 클릭하거나 초기화하세요.');
      return false;
    }

    // 올가미 선택 시작
    const success = this.lassoSelector.startSelection();
    if (success) {
      this.onUpdateMessage('Alt 키를 누른 상태에서 제거할 치아 영역을 선택하세요.');
    }

    return success;
  }

  /**
   * 치아 선택 중지
   */
  stopSelection() {
    if (this.lassoSelector) {
      this.lassoSelector.stopSelection();
    }
  }

  /**
   * 올가미 선택 완료 콜백
   */
  onLassoComplete(points) {
    console.log('치아 영역 선택 완료:', points.length, '개 점');
    
    this.selectedPoints = points;
    this.isSelectionComplete = true;
    
    // 선택 중지
    this.stopSelection();
    
    // 완료 콜백 호출
    this.onSelectionComplete(points);
    this.onUpdateMessage('치아 영역 선택이 완료되었습니다. "치아 제거" 버튼을 클릭하세요.');
  }

  /**
   * 치아 제거 실행
   */
  removeTooth() {
    if (!this.isSelectionComplete || this.selectedPoints.length === 0) {
      const message = '먼저 제거할 치아 영역을 선택해주세요.';
      console.warn(message);
      this.onError(message);
      return false;
    }

    this.onUpdateMessage('치아를 제거하는 중...');

    try {
      // 1. MeshCutter를 이용한 knife cut 수행 (현재 geometry 사용)
      console.log('1단계: Knife cut 수행');
      const currentGeometry = refs.targetMesh.geometry;
      console.log('현재 geometry 정보:', {
        vertices: currentGeometry.attributes.position.count,
        faces: currentGeometry.index ? currentGeometry.index.count / 3 : 'no index'
      });
      const cuttingData = MeshCutter.performFlipperCutting(currentGeometry, this.selectedPoints);
      const { newVertices, newNormals, newIndices, vertexFaceMap, borderVertexIndices } = cuttingData;

      // 2. 내부 면 찾기
      console.log('2단계: 내부 면 찾기');
      const { usedVertices, usedFaces } = extractInnerFacesFromBorder(
        newVertices, newIndices, vertexFaceMap, borderVertexIndices
      );

      // 3. 내부 면들 제거
      console.log('3단계: 내부 면 제거');
      const remainingGeometry = this.removeInnerFaces(newVertices, newNormals, newIndices, usedFaces);

      // 4. 메시 업데이트
      console.log('4단계: 메시 업데이트');
      this.updateMeshGeometry(remainingGeometry);

      // 치아 제거 상태 업데이트
      this.isRemovalComplete = true;

      // 완료 콜백
      this.onRemovalComplete();
      this.onUpdateMessage('치아 제거가 완료되었습니다. 되돌리기 또는 다음 치아 제거를 선택하세요.');

      console.log('치아 제거 완료');
      return true;

    } catch (error) {
      console.error('치아 제거 중 오류 발생:', error);
      this.onError(`치아 제거 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * 내부 면들을 제거하여 새로운 geometry 생성
   */
  removeInnerFaces(vertices, normals, indices, usedFaces) {
    const totalFaces = indices.length / 3;
    
    // 제거할 면들을 Set으로 변환
    const facesToRemove = new Set(usedFaces);
    
    console.log(`전체 면 수: ${totalFaces}, 제거할 면 수: ${facesToRemove.size}`);

    // 남길 면들의 인덱스 수집
    const remainingFaceIndices = [];
    for (let i = 0; i < totalFaces; i++) {
      if (!facesToRemove.has(i)) {
        remainingFaceIndices.push(i);
      }
    }

    console.log(`남은 면 수: ${remainingFaceIndices.length}`);

    // 사용되는 정점들 찾기
    const usedVertexSet = new Set();
    for (const faceIndex of remainingFaceIndices) {
      const baseIdx = faceIndex * 3;
      usedVertexSet.add(indices[baseIdx]);
      usedVertexSet.add(indices[baseIdx + 1]);
      usedVertexSet.add(indices[baseIdx + 2]);
    }

    // 정점 재매핑
    const usedVertices = Array.from(usedVertexSet).sort((a, b) => a - b);
    const vertexMap = new Map();
    usedVertices.forEach((oldIndex, newIndex) => {
      vertexMap.set(oldIndex, newIndex);
    });

    // 새로운 정점 배열 생성
    const newVertices = [];
    const newNormals = [];
    for (const vertexIndex of usedVertices) {
      newVertices.push(
        vertices[vertexIndex * 3],
        vertices[vertexIndex * 3 + 1],
        vertices[vertexIndex * 3 + 2]
      );
      newNormals.push(
        normals[vertexIndex * 3],
        normals[vertexIndex * 3 + 1],
        normals[vertexIndex * 3 + 2]
      );
    }

    // 새로운 인덱스 배열 생성
    const newIndices = [];
    for (const faceIndex of remainingFaceIndices) {
      const baseIdx = faceIndex * 3;
      newIndices.push(
        vertexMap.get(indices[baseIdx]),
        vertexMap.get(indices[baseIdx + 1]),
        vertexMap.get(indices[baseIdx + 2])
      );
    }

    // 새로운 BufferGeometry 생성
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newVertices, 3));
    newGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    newGeometry.setIndex(newIndices);

    // 노멀과 바운딩 정보 재계산
    newGeometry.computeVertexNormals();
    newGeometry.computeBoundingBox();
    newGeometry.computeBoundingSphere();

    return newGeometry;
  }

  /**
   * 메시의 geometry 업데이트
   */
  updateMeshGeometry(newGeometry) {
    if (!refs.targetMesh) return;

    console.log('치아 제거 후 geometry 업데이트 시작');

    // 기존 geometry 정리
    const oldGeometry = refs.targetMesh.geometry;
    if (oldGeometry && oldGeometry !== this.originalGeometry) {
      oldGeometry.dispose();
    }

    // 새 geometry 적용
    refs.targetMesh.geometry = newGeometry;

    // BVH 트리 재계산 (스컬프팅을 위해 필수)
    if (newGeometry.computeBoundsTree) {
      newGeometry.computeBoundsTree({ setBoundingBox: false });
      console.log('BVH 트리 재계산 완료');
    }

    // 드로우 사용법 설정 (스컬프팅을 위해)
    newGeometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    newGeometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);

    // 메시 렌더링 설정 (스컬프팅을 위해)
    refs.targetMesh.frustumCulled = false;

    // modelManager 상태 동기화 (중요!)
    this.updateModelManagerState(newGeometry);

    // BVH Helper 업데이트 (스컬프팅 시각화를 위해)
    this.updateBVHHelper();

    // 스컬프팅 시스템에 geometry 변경 알림
    this.notifyGeometryChange();

    console.log('치아 제거 후 geometry 업데이트 완료');
  }

  /**
   * modelManager의 상태들을 새 geometry에 맞게 업데이트
   */
  updateModelManagerState(newGeometry) {
    if (activeItemIndex >= 0 && modelList[activeItemIndex]) {
      const activeItem = modelList[activeItemIndex];
      
      // 현재 모델의 geometry 상태 업데이트
      if (activeItem.geometry) {
        activeItem.geometry.dispose();
      }
      activeItem.geometry = newGeometry.clone();
      
      console.log('modelManager 상태 동기화 완료');
    }
  }

  /**
   * 스컬프팅 시스템에 geometry 변경 알림
   */
  notifyGeometryChange() {
    // 전역 이벤트 발생으로 다른 시스템들에게 geometry 변경 알림
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('geometryChanged', {
        detail: {
          targetMesh: refs.targetMesh,
          source: 'tooth-removal'
        }
      }));
      console.log('geometry 변경 이벤트 발생');
    }
  }

  /**
   * BVH Helper 업데이트 (스컬프팅 시각화용)
   */
  updateBVHHelper() {
    if (refs.bvhHelper) {
      // 기존 helper 제거
      if (refs.bvhHelper.parent) {
        refs.scene.remove(refs.bvhHelper);
      }
      refs.bvhHelper = null;
    }

    // 새 BVH helper 생성
    if (refs.targetMesh && refs.scene) {
      try {
        const depth = (refs.params && refs.params.depth) ? refs.params.depth : 10;
        const newHelper = new MeshBVHHelper(refs.targetMesh, depth);
        
        // helper 표시 여부는 기존 설정 따름 (기본값: false)
        const displayHelper = refs.params && refs.params.displayHelper;
        if (displayHelper) {
          refs.scene.add(newHelper);
        }
        
        newHelper.update();
        refs.bvhHelper = newHelper;
        
        console.log('BVH Helper 업데이트 완료');
      } catch (error) {
        console.warn('BVH Helper 업데이트 중 오류:', error);
      }
    }
  }

  /**
   * 현재 작업 기준점으로 되돌리기 (lasso 선택은 유지)
   */
  restoreOriginal() {
    if (!this.geometryBackup || !refs.targetMesh) {
      const message = '원본 geometry 백업이 없습니다.';
      console.warn(message);
      this.onError(message);
      return false;
    }

    this.onUpdateMessage('원본 상태로 되돌리는 중...');

    try {
      // 현재 geometry 정리
      const currentGeometry = refs.targetMesh.geometry;
      if (currentGeometry && currentGeometry !== this.originalGeometry) {
        currentGeometry.dispose();
      }

      // 원본 geometry 복원
      const restoredGeometry = this.geometryBackup.clone();
      refs.targetMesh.geometry = restoredGeometry;

      // BVH 트리 재계산
      if (restoredGeometry.computeBoundsTree) {
        restoredGeometry.computeBoundsTree({ setBoundingBox: false });
      }

      // 드로우 사용법 설정
      restoredGeometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
      restoredGeometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);

      // 메시 렌더링 설정 (스컬프팅을 위해)
      refs.targetMesh.frustumCulled = false;

      // modelManager 상태도 원본으로 복원
      this.updateModelManagerState(restoredGeometry);

      // BVH Helper 업데이트
      this.updateBVHHelper();

      // 스컬프팅 시스템에 geometry 변경 알림
      this.notifyGeometryChange();

      // 제거 상태만 리셋 (lasso 선택은 유지)
      this.isRemovalComplete = false;

      this.onUpdateMessage('메쉬가 복원되었습니다. 다시 치아 제거를 할 수 있습니다.');
      console.log('원본 상태 복원 완료');
      return true;

    } catch (error) {
      console.error('원본 복원 중 오류:', error);
      this.onError(`원본 복원 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * 완전 원본 상태로 되돌리기 (모든 치아 제거 취소)
   */
  restoreToCompleteOriginal() {
    if (!this.originalGeometry || !refs.targetMesh) {
      const message = '완전한 원본 geometry가 없습니다.';
      console.warn(message);
      if (this.onError) this.onError(message);
      return false;
    }

    this.onUpdateMessage('완전 원본 상태로 되돌리는 중...');

    try {
      // 현재 geometry 정리
      const currentGeometry = refs.targetMesh.geometry;
      if (currentGeometry && currentGeometry !== this.originalGeometry) {
        currentGeometry.dispose();
      }

      // 완전 원본 geometry 복원
      const restoredGeometry = this.originalGeometry.clone();
      refs.targetMesh.geometry = restoredGeometry;

      // BVH 트리 재계산
      if (restoredGeometry.computeBoundsTree) {
        restoredGeometry.computeBoundsTree({ setBoundingBox: false });
      }

      // 드로우 사용법 설정
      restoredGeometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
      restoredGeometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);

      // 메시 렌더링 설정 (스컬프팅을 위해)
      refs.targetMesh.frustumCulled = false;

      // 백업들을 원본으로 재설정
      if (this.geometryBackup && this.geometryBackup !== this.originalGeometry) {
        this.geometryBackup.dispose();
      }
      if (this.lastConfirmedGeometry && this.lastConfirmedGeometry !== this.originalGeometry) {
        this.lastConfirmedGeometry.dispose();
      }
      this.geometryBackup = this.originalGeometry.clone();
      this.lastConfirmedGeometry = this.originalGeometry.clone();

      // modelManager 상태도 원본으로 복원
      this.updateModelManagerState(restoredGeometry);

      // BVH Helper 업데이트
      this.updateBVHHelper();

      // 스컬프팅 시스템에 geometry 변경 알림
      this.notifyGeometryChange();

      // 상태 완전 초기화
      this.isSelectionComplete = false;
      this.isRemovalComplete = false;
      this.selectedPoints = [];

      this.onUpdateMessage('완전 원본 상태로 복원되었습니다.');
      console.log('완전 원본 상태 복원 완료');
      return true;

    } catch (error) {
      console.error('완전 원본 복원 중 오류:', error);
      if (this.onError) this.onError(`완전 원본 복원 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * 선택 상태만 초기화 (geometry는 그대로)
   */
  reset() {
    // 올가미 선택 완전 정리
    if (this.lassoSelector) {
      this.lassoSelector.cleanup();
      this.lassoSelector = null;
    }

    // 새로운 LassoSelector 생성
    this.initLassoSelector();

    // 상태 초기화
    this.isSelectionComplete = false;
    this.isRemovalComplete = false;
    this.selectedPoints = [];

    this.onUpdateMessage('치아 제거 시스템이 초기화되었습니다.');
    console.log('치아 제거 시스템 리셋 완료');
  }

  /**
   * 현재 치아 제거를 확정하고 다음 치아 선택 시작
   */
  finalizeCurrent() {
    if (!this.isRemovalComplete) {
      const message = '먼저 치아 제거를 완료해주세요.';
      console.warn(message);
      if (this.onError) this.onError(message);
      return false;
    }

    console.log('현재 치아 제거 확정 및 다음 치아 선택 시작');

    // 현재 제거 상태를 확정하고 다음 작업을 위한 기준점으로 설정
    if (refs.targetMesh && refs.targetMesh.geometry) {
      // 이전 백업들 정리
      if (this.geometryBackup && this.geometryBackup !== this.originalGeometry) {
        this.geometryBackup.dispose();
      }
      if (this.lastConfirmedGeometry && this.lastConfirmedGeometry !== this.originalGeometry) {
        this.lastConfirmedGeometry.dispose();
      }
      
      // 현재 상태를 새로운 확정 상태로 저장
      this.lastConfirmedGeometry = refs.targetMesh.geometry.clone();
      
      // 다음 작업을 위한 새로운 기준점으로 현재 geometry 설정
      this.geometryBackup = refs.targetMesh.geometry.clone();
      
      // BVH 트리 재계산 (현재 geometry에 대해)
      if (refs.targetMesh.geometry.computeBoundsTree) {
        refs.targetMesh.geometry.computeBoundsTree({ setBoundingBox: false });
      }
      
      // model manager 상태도 업데이트
      this.updateModelManagerState(refs.targetMesh.geometry);
      
      // BVH helper 업데이트
      this.updateBVHHelper();
      
      // 다른 시스템에 geometry 변경 알림
      this.notifyGeometryChange();
      
      console.log('현재 치아 제거 상태가 확정되고 다음 작업을 위한 기준점으로 설정됨');
    }

    // 새로운 선택을 위해 올가미 선택 초기화
    if (this.lassoSelector) {
      this.lassoSelector.cleanup();
      this.lassoSelector = null;
    }

    // 새로운 LassoSelector 생성
    this.initLassoSelector();

    // 상태 초기화 (새로운 선택을 위해)
    this.isSelectionComplete = false;
    this.isRemovalComplete = false;
    this.selectedPoints = [];

    // 새로운 선택 시작
    this.startSelection();

    this.onUpdateMessage('다음 치아를 선택하세요. Alt 키를 누른 상태에서 제거할 치아 영역을 선택하세요.');
    console.log('다음 치아 제거 모드 시작');
    return true;
  }

  /**
   * 발치 완료 - lasso 마커와 선들 완전 제거
   */
  completeToothRemoval() {
    console.log('발치 완료 - lasso 정리 시작');
    
    // 올가미 선택 완전 정리 (마커, 선 모두 제거)
    if (this.lassoSelector) {
      this.lassoSelector.cleanup();
      this.lassoSelector = null;
    }

    // 시스템 비활성화
    this.isActive = false;
    
    // 초기화된 경우에만 메시지 업데이트
    if (this.onUpdateMessage && typeof this.onUpdateMessage === 'function') {
      this.onUpdateMessage('발치가 완료되었습니다. 이제 자유 수정을 할 수 있습니다.');
    }
    
    console.log('발치 완료 - lasso 정리 완료');
  }

  /**
   * 시스템 완전 정리
   */
  cleanup() {
    // 올가미 선택 정리
    if (this.lassoSelector) {
      this.lassoSelector.cleanup();
      this.lassoSelector = null;
    }

    // 백업 geometry 정리
    if (this.geometryBackup && this.geometryBackup !== this.originalGeometry) {
      this.geometryBackup.dispose();
    }
    this.geometryBackup = null;
    
    if (this.lastConfirmedGeometry && this.lastConfirmedGeometry !== this.originalGeometry) {
      this.lastConfirmedGeometry.dispose();
    }
    this.lastConfirmedGeometry = null;

    // 상태 초기화
    this.originalGeometry = null;
    this.isActive = false;
    this.isSelectionComplete = false;
    this.isRemovalComplete = false;
    this.selectedPoints = [];

    console.log('치아 제거 시스템 정리 완료');
  }

  /**
   * 현재 상태 정보 반환
   */
  getState() {
    return {
      isActive: this.isActive,
      isSelectionComplete: this.isSelectionComplete,
      isRemovalComplete: this.isRemovalComplete,
      selectedPointCount: this.selectedPoints.length,
      hasBackup: !!this.geometryBackup
    };
  }
}

// 전역 인스턴스
export const toothRemovalSystem = new ToothRemovalSystem();
