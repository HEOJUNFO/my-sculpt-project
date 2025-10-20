// src/features/tooth-removal/toothRemovalCore.ts
// 치아 제거 핵심 로직 - 1단계 구현 (lasso select + knife cut + 내부면 삭제)

import * as THREE from "three";
import {
  DrawingPointData,
  LassoSelector,
  LassoSelectorOptions,
} from "../../utils/lassoSelection.js";
import { MeshCutter } from "../../utils/meshCutter.js";
import { extractInnerFacesFromBorder } from "../../utils/meshProcessing.js";
import { MinimalSurfaceGenerator } from "../../utils/minimalSurfaceGenerator.ts";
import { InformedGeometry } from "../../utils/InformedGeometry.ts";
import { refs, modelList, activeItemIndex } from "../../models/modelManager.js";

// refs 객체를 any 타입으로 처리 (JavaScript 모듈이므로)
const refsAny = refs as any;
import { MeshBVHHelper } from "three-mesh-bvh";
// 타입 정의
type ToothRemovalInitOptions = {
  onUpdateMessage?: (message: string) => void;
  onPointProgress?: (pointCount: number) => void;
  onSelectionComplete?: (points: DrawingPointData[]) => void;
  onRemovalComplete?: () => void;
  onError?: (error: string) => void;
};

type ToothRemovalState = {
  isActive: boolean;
  isSelectionComplete: boolean;
  isRemovalComplete: boolean;
  hasBackup: boolean;
};

/**
 * 치아 제거 시스템 클래스
 */
export class ToothRemovalSystem {
  private lassoSelector: LassoSelector | null = null;

  // geometry 백업 관리
  private backupGeometry: THREE.BufferGeometry | null = null; // 되돌리기/초기화용 백업

  // 상태 관리
  private isActive: boolean = false;
  private isSelectionComplete: boolean = false;
  private isRemovalComplete: boolean = false;
  private selectedPoints: DrawingPointData[] = [];

  // 콜백 함수들
  private onUpdateMessage: (message: string) => void = () => {};
  private onPointProgress: (pointCount: number) => void = () => {};
  private onSelectionComplete: (points: DrawingPointData[]) => void = () => {};
  private onRemovalComplete: () => void = () => {};
  private onError: (error: string) => void = () => {};

  /**
   * 치아 제거 시스템 초기화
   */
  public init(options: ToothRemovalInitOptions = {}): boolean {
    if (!refsAny.targetMesh) {
      const message = "치아 제거할 대상 메시가 없습니다.";
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
    this.backupGeometry = refsAny.targetMesh.geometry.clone(); // 백업 생성

    // LassoSelector 초기화
    this.initLassoSelector();

    // 상태 초기화
    this.isActive = true;
    this.isSelectionComplete = false;
    this.isRemovalComplete = false;
    this.selectedPoints = [];

    console.log("치아 제거 시스템 초기화 완료");
    return true;
  }

  /**
   * LassoSelector 초기화
   */
  private initLassoSelector() {
    // 기존 LassoSelector 정리
    if (this.lassoSelector) {
      this.lassoSelector.cleanup();
    }

    // 치아 제거용 LassoSelector 생성
    const options: LassoSelectorOptions = {
      controls: refsAny.controls,
      markerColors: {
        first: 0x00ff00, // 첫 점: 초록
        regular: 0xff0000, // 일반 점: 빨강
      },
      curveQuality: 20,
      minDistanceBetweenPoints: 0.01,
      onUpdateMessage: (message: string) => {
        if (this.onUpdateMessage) this.onUpdateMessage(message);
      },
      onPointAdded: (pointCount: number) => {
        this.selectedPoints = Array(pointCount).fill(
          null
        ) as DrawingPointData[]; // 임시로 개수만 맞춤
        
        // UI 업데이트를 위한 콜백 호출
        this.onPointProgress?.(pointCount);
      },
      onComplete: (points: DrawingPointData[]) => {
        this.onLassoComplete(points);
      },
      onError: (error: string) => {
        console.error("LassoSelector 오류:", error);
        if (this.onError) this.onError(`선택 오류: ${error}`);
      },
    };

    this.lassoSelector = new LassoSelector(
      refsAny.targetMesh,
      refsAny.scene,
      refsAny.camera,
      refsAny.renderer,
      options
    );
  }

  /**
   * 치아 선택 시작
   */
  public startSelection(): boolean {
    if (!this.isActive) {
      console.warn("치아 제거 시스템이 초기화되지 않았습니다.");
      return false;
    }

    if (this.isSelectionComplete) {
      this.onUpdateMessage(
        '이미 선택이 완료되었습니다. "치아 제거" 버튼을 클릭하거나 초기화하세요.'
      );
      return false;
    }

    // 올가미 선택 시작
    const success = this.lassoSelector?.startSelection() || false;
    if (success) {
      this.onUpdateMessage(
        "Alt 키를 누른 상태에서 제거할 치아 영역을 선택하세요."
      );
    }

    return success;
  }

  /**
   * 올가미 선택 완료 콜백
   */
  private onLassoComplete(points: DrawingPointData[]) {
    console.log("치아 영역 선택 완료:", points.length, "개 점");

    this.selectedPoints = points;
    this.isSelectionComplete = true;

    // 완료 콜백 호출
    this.onSelectionComplete(points);
    this.onUpdateMessage(
      '치아 영역 선택이 완료되었습니다. "치아 제거" 버튼을 클릭하세요.'
    );
  }

  /**
   * 치아 제거 실행
   */
  public removeTooth(): boolean {
    if (!this.isSelectionComplete || this.selectedPoints.length === 0) {
      const message = "먼저 제거할 치아 영역을 선택해주세요.";
      console.warn(message);
      this.onError(message);
      return false;
    }

    this.onUpdateMessage("치아를 제거하는 중...");

    this.lassoSelector?.stopSelection();

    try {
      // 1. MeshCutter를 이용한 knife cut 수행 (현재 geometry 사용)
      const currentGeometry = refsAny.targetMesh.geometry;

      const { borderVertexIndices, geometry } = MeshCutter.performCutting(
        currentGeometry,
        this.lassoSelector!.getSelectedPoints(),
        0.005,
        refsAny.scene // 디버깅용 scene 전달
      );

      // 2. 내부 면 찾기
      const { usedFaces } = extractInnerFacesFromBorder(
        geometry,
        borderVertexIndices
      );

      // 3. 내부 면들 제거
      for (const face of usedFaces) {
        geometry.removeFace(...face);
      }

      // 4. 구멍 채우기

      const filledGeometry = this.fillHoleInGeometry(
        geometry,
        borderVertexIndices
      );

      // 5. 메시 업데이트
      console.log("5단계: 메시 업데이트");
      this.updateMeshGeometry(filledGeometry);

      // 치아 제거 상태 업데이트
      this.isRemovalComplete = true;

      // 완료 콜백
      this.onRemovalComplete();
      this.onUpdateMessage(
        "치아 제거가 완료되었습니다. 되돌리기 또는 다음 치아 제거를 선택하세요."
      );

      console.log("치아 제거 완료");
      return true;
    } catch (error) {
      console.error("치아 제거 중 오류 발생:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.onError(`치아 제거 실패: ${errorMessage}`);
      return false;
    }
  }

  /**
   * geometry에서 구멍 채우기 (통합 최소 곡면 생성기 사용)
   */
  private fillHoleInGeometry(
    geometry: InformedGeometry,
    borderVertexIndices: number[]
  ): THREE.BufferGeometry {
    // 경계 정점들의 위치 수집
    const boundaryPoints = borderVertexIndices.map(
      (index) => geometry.positions[index]!
    );

    // 통합 최소 곡면 생성
    const minimalSurfaceResult = new MinimalSurfaceGenerator(
      boundaryPoints
    ).generate();

    const windingDirection = this.checkWindingDirection(
      geometry,
      borderVertexIndices
    );

    // 최소 곡면의 내부 정점들 추가 (경계 정점 제외)
    const borderVertexCount = borderVertexIndices.length;

    const vertexMap = new Map<number, number>();
    for (let i = 0; i < borderVertexCount; i++) {
      vertexMap.set(i, borderVertexIndices[i]);
    }

    for (let i = borderVertexCount; i < minimalSurfaceResult.vertices.length; i++) {
      const vertex = minimalSurfaceResult.vertices[i]!;
      const newIndex = geometry.addVertex(vertex, new THREE.Vector3(0, 0, 0));
      vertexMap.set(i, newIndex);
    }

    for (const [v0, v1, v2] of minimalSurfaceResult.faces) {
      if (windingDirection) {
      geometry.addFace(vertexMap.get(v0)!, vertexMap.get(v2)!, vertexMap.get(v1)!);
      } else {
        geometry.addFace(vertexMap.get(v0)!, vertexMap.get(v1)!, vertexMap.get(v2)!);
      }
    }

    const integratedGeometry = geometry.compact().geometry.toBufferGeometry();

    // 노멀과 바운딩 정보 재계산
    integratedGeometry.computeVertexNormals();
    integratedGeometry.computeBoundingBox();
    integratedGeometry.computeBoundingSphere();

    return integratedGeometry;
  }

  private checkWindingDirection(
    geometry: InformedGeometry,
    borderIndices: number[]
  ): boolean {
    const [v0, v1] = borderIndices;
    const [face] = geometry.findFacesWithEdge(v0, v1);

    const [a, b, c] = face;

    return (
      (a === v0 && b === v1) || (b === v0 && c === v1) || (c === v0 && a === v1)
    );
  }
  /**
   * 메시에 새로운 geometry 적용 (공통 로직)
   */
  private updateMeshGeometry(newGeometry: THREE.BufferGeometry) {
    if (!refsAny.targetMesh) return;

    // 기존 geometry 정리
    const oldGeometry = refsAny.targetMesh.geometry;
    if (oldGeometry && oldGeometry !== this.backupGeometry) {
      oldGeometry.dispose();
    }

    // 새 geometry 적용
    refsAny.targetMesh.geometry = newGeometry;

    // BVH 트리 재계산 (스컬프팅을 위해 필수)
    if (newGeometry.computeBoundsTree) {
      newGeometry.computeBoundsTree({ setBoundingBox: false });
      console.log("BVH 트리 재계산 완료");
    }

    // 드로우 사용법 설정 (스컬프팅을 위해)
    (newGeometry.attributes.position as THREE.BufferAttribute).setUsage(
      THREE.DynamicDrawUsage
    );
    (newGeometry.attributes.normal as THREE.BufferAttribute).setUsage(
      THREE.DynamicDrawUsage
    );

    // 메시 렌더링 설정 (스컬프팅을 위해)
    refsAny.targetMesh.frustumCulled = false;

    // modelManager 상태 동기화 (중요!)
    this.updateModelManagerState(newGeometry);

    // BVH Helper 업데이트 (스컬프팅 시각화를 위해)
    this.updateBVHHelper();

    // 스컬프팅 시스템에 geometry 변경 알림
    this.notifyGeometryChange();
  }

  /**
   * modelManager의 상태들을 새 geometry에 맞게 업데이트
   */
  private updateModelManagerState(newGeometry: THREE.BufferGeometry) {
    if (activeItemIndex >= 0 && modelList[activeItemIndex]) {
      const activeItem = modelList[activeItemIndex];

      // 현재 모델의 geometry 상태 업데이트
      if (activeItem.geometry) {
        activeItem.geometry.dispose();
      }
      activeItem.geometry = newGeometry.clone();

      console.log("modelManager 상태 동기화 완료");
    }
  }

  /**
   * 스컬프팅 시스템에 geometry 변경 알림
   */
  private notifyGeometryChange() {
    // 전역 이벤트 발생으로 다른 시스템들에게 geometry 변경 알림
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("geometryChanged", {
          detail: {
            targetMesh: refsAny.targetMesh,
            source: "tooth-removal",
          },
        })
      );
      console.log("geometry 변경 이벤트 발생");
    }
  }

  /**
   * BVH Helper 업데이트 (스컬프팅 시각화용)
   */
  private updateBVHHelper() {
    if (refsAny.bvhHelper) {
      // 기존 helper 제거
      if (refsAny.bvhHelper.parent) {
        refsAny.scene.remove(refsAny.bvhHelper);
      }
      refsAny.bvhHelper = null;
    }

    // 새 BVH helper 생성
    if (refsAny.targetMesh && refsAny.scene) {
      try {
        const depth =
          refsAny.params && refsAny.params.depth ? refsAny.params.depth : 10;
        const newHelper = new MeshBVHHelper(refsAny.targetMesh, depth);

        // helper 표시 여부는 기존 설정 따름 (기본값: false)
        const displayHelper = refsAny.params && refsAny.params.displayHelper;
        if (displayHelper) {
          refsAny.scene.add(newHelper);
        }

        newHelper.update();
        refsAny.bvhHelper = newHelper;

        console.log("BVH Helper 업데이트 완료");
      } catch (error) {
        console.warn("BVH Helper 업데이트 중 오류:", error);
      }
    }
  }

  /**
   * 백업 상태로 되돌리기 (lasso 선택은 유지)
   */
  public restoreOriginal(): boolean {
    this.onUpdateMessage("백업 상태로 되돌리는 중...");

    try {
      // 백업 geometry 복원
      const restoredGeometry = this.backupGeometry!.clone();
      this.updateMeshGeometry(restoredGeometry);

      // 제거 상태만 리셋 (lasso 선택은 유지)
      this.isRemovalComplete = false;

      this.onUpdateMessage(
        "메쉬가 복원되었습니다. 다시 치아 제거를 할 수 있습니다."
      );
      this.lassoSelector?.startSelection();
      console.log("백업 상태 복원 완료");
      return true;
    } catch (error) {
      console.error("백업 복원 중 오류:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.onError(`백업 복원 실패: ${errorMessage}`);
      return false;
    }
  }

  /**
   * 완전 초기화 (모든 치아 제거 취소)
   */
  public restoreToCompleteOriginal(): boolean {
    this.onUpdateMessage("완전 초기화 중...");

    try {
      // 백업 geometry 복원
      const restoredGeometry = this.backupGeometry!.clone();
      this.updateMeshGeometry(restoredGeometry);

      // 상태 완전 초기화
      this.isSelectionComplete = false;
      this.isRemovalComplete = false;
      this.initLassoSelector();
      this.startSelection();

      this.onUpdateMessage("완전 초기화 완료");
      console.log("완전 초기화 완료");
      return true;
    } catch (error) {
      console.error("완전 초기화 중 오류:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (this.onError) this.onError(`완전 초기화 실패: ${errorMessage}`);
      return false;
    }
  }

  /**
   * 현재 치아 제거를 확정하고 다음 치아 선택 시작
   */
  public finalizeCurrent(): boolean {
    if (!this.isRemovalComplete) {
      const message = "먼저 치아 제거를 완료해주세요.";
      console.warn(message);
      if (this.onError) this.onError(message);
      return false;
    }

    console.log("현재 치아 제거 확정 및 다음 치아 선택 시작");

    // 현재 제거 상태를 확정하고 백업을 현재 상태로 업데이트
    if (refsAny.targetMesh && refsAny.targetMesh.geometry) {
      // 이전 백업 정리
      if (this.backupGeometry) {
        this.backupGeometry.dispose();
      }

      // 현재 상태를 새로운 백업으로 설정
      this.backupGeometry = refsAny.targetMesh.geometry.clone();

      // BVH 트리 재계산 (현재 geometry에 대해)
      if (refsAny.targetMesh.geometry.computeBoundsTree) {
        refsAny.targetMesh.geometry.computeBoundsTree({
          setBoundingBox: false,
        });
      }

      // model manager 상태도 업데이트
      this.updateModelManagerState(refsAny.targetMesh.geometry);

      // BVH helper 업데이트
      this.updateBVHHelper();

      // 다른 시스템에 geometry 변경 알림
      this.notifyGeometryChange();
    }

    // 새로운 LassoSelector 생성
    this.initLassoSelector();

    // 상태 초기화 (새로운 선택을 위해)
    this.isSelectionComplete = false;
    this.isRemovalComplete = false;

    // 새로운 선택 시작
    this.startSelection();

    this.onUpdateMessage(
      "다음 치아를 선택하세요. Alt 키를 누른 상태에서 제거할 치아 영역을 선택하세요."
    );
    console.log("다음 치아 제거 모드 시작");
    return true;
  }

  /**
   * 발치 완료 - lasso 마커와 선들 완전 제거
   */
  public completeToothRemoval() {
    console.log("발치 완료 - lasso 정리 시작");

    // 올가미 선택 완전 정리 (마커, 선 모두 제거)
    if (this.lassoSelector) {
      this.lassoSelector.cleanup();
      this.lassoSelector = null;
    }

    // 시스템 비활성화
    this.isActive = false;

    // 초기화된 경우에만 메시지 업데이트
    if (this.onUpdateMessage && typeof this.onUpdateMessage === "function") {
      this.onUpdateMessage(
        "발치가 완료되었습니다. 이제 자유 수정을 할 수 있습니다."
      );
    }

    console.log("발치 완료 - lasso 정리 완료");
  }

  /**
   * 시스템 완전 정리
   */
  public cleanup() {
    // 올가미 선택 정리
    if (this.lassoSelector) {
      this.lassoSelector.cleanup();
      this.lassoSelector = null;
    }

    // 백업 geometry 정리
    if (this.backupGeometry) {
      this.backupGeometry.dispose();
    }
    this.backupGeometry = null;
    this.isActive = false;
    this.isSelectionComplete = false;
    this.isRemovalComplete = false;

    console.log("치아 제거 시스템 정리 완료");
  }

  /**
   * 현재 상태 정보 반환
   */
  public getState(): ToothRemovalState {
    return {
      isActive: this.isActive,
      isSelectionComplete: this.isSelectionComplete,
      isRemovalComplete: this.isRemovalComplete,
      hasBackup: !!this.backupGeometry,
    };
  }
}

// 전역 인스턴스
export const toothRemovalSystem = new ToothRemovalSystem();
