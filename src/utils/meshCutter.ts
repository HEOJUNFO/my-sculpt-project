// src/utils/meshCutter.ts
// 메시 절단 기하학적 연산 (플리퍼 원본 knife cut 로직 보존)

import * as THREE from "three";
import earcut from "earcut";

// 타입 정의
interface DrawingPoint {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  faceIndex: number;
  newVertexIndex?: number;
}

interface Edge {
  start: THREE.Vector3;
  end: THREE.Vector3;
  startIndex: number;
  endIndex: number;
}

interface Intersection {
  point: THREE.Vector3;
  edge: Edge;
  triangle: number;
}

interface SplitResult {
  edgeStartIndex: number;
  edgeEndIndex: number;
  otherVertexIndex: number;
  pseudoDrawingPoint: DrawingPoint;
  splitTriangles: number[];
}

interface EdgeInfo {
  v1: number;
  v2: number;
  length: number;
}

interface  WorkingData {
  newVertices: number[];
  newNormals: number[];
  newIndices: number[];
  vertexFaceMap: number[][];
  borderVertexIndices: number[];
}

/**
 * 두 선분의 교차점 찾기 (플리퍼 원본 함수 그대로)
 */
export function findEdgeIntersection(
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  p4: THREE.Vector3
): THREE.Vector3 | null {
  // 기준 평면의 노멀 벡터 (p1, p2, p3이 같은 평면에 있다고 가정)
  const u = new THREE.Vector3().subVectors(p2, p1);
  const v = new THREE.Vector3().subVectors(p3, p1);
  const normal = new THREE.Vector3().crossVectors(u, v).normalize();

  // 평면상의 좌표계를 만들기 위한 기준 축
  const xAxis = u.clone().normalize();
  const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();

  // 3D 점을 2D 평면으로 투영
  function projectTo2D(p: THREE.Vector3): THREE.Vector2 {
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

  const ua =
    ((b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x)) / denom;
  const ub =
    ((a2.x - a1.x) * (a1.y - b1.y) - (a2.y - a1.y) * (a1.x - b1.x)) / denom;

  if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null; // 선분 범위 밖

  // 교차점 계산 (p1 + ua * (p2 - p1))
  const intersection = new THREE.Vector3().addVectors(
    p1,
    new THREE.Vector3().subVectors(p2, p1).multiplyScalar(ua)
  );

  return intersection;
}

/**
 * 메시 절단 도구 클래스
 * 플리퍼의 원본 knife cut 로직을 정확히 재현
 */
export class MeshCutter {
  private originalGeometry: THREE.BufferGeometry;
  private newVertices: number[];
  private newNormals: number[];
  private newIndices: number[];
  private vertexFaceMap: number[][];
  private borderVertexIndices: number[];
  private deletedVertices: Set<number>;
  private adjacencyMap: Map<number, Set<number>>;

  constructor(originalGeometry: THREE.BufferGeometry) {
    this.originalGeometry = originalGeometry;

    // 플리퍼 원본과 동일한 작업용 데이터 구조
    this.newVertices = [];
    this.newNormals = [];
    this.newIndices = [];
    this.vertexFaceMap = [];
    this.borderVertexIndices = [];
    this.deletedVertices = new Set();
    this.adjacencyMap = new Map();

    this._initializeWorkingData();
  }

  /**
   * 플리퍼용 메시 절단 (원본 로직 보존) - 정적 메서드로 API 호환성 유지
   */
  static performFlipperCutting(
    originalGeometry: THREE.BufferGeometry,
    selectedAreaPoints: DrawingPoint[],
    edgeMergeThreshold: number = 0.005
  ): WorkingData {
    const cutter = new MeshCutter(originalGeometry);

    console.log("=== Knife Cut 시작 ===");

    // 1. 각 점에 대해 면 분할 (플리퍼 원본 3.1, 3.2 단계)
    cutter.subdivideIntersectedFaces(selectedAreaPoints);

    // 2. 연속된 점들 사이의 경로 찾기 및 면 분할 (플리퍼 원본 4단계)
    cutter.performKnifeCuts(selectedAreaPoints);

    console.log("Knife Cut 완료");
    console.log(
      `  정점: ${cutter.newVertices.length / 3}개, 면: ${cutter.newIndices.length / 3}개, 경계 정점: ${cutter.borderVertexIndices.length}개`
    );

    // 3. 엣지 병합 단계
    console.log("=== 엣지 병합 시작 ===");
    cutter.buildAdjacencyMap();
    cutter.mergeShortEdges(edgeMergeThreshold);
    cutter.compactDeletedVertices();
    cutter.verifyDataIntegrity();
    console.log("=== 엣지 병합 완료 ===");

    // 4. 플리퍼가 기대하는 형태로 결과 반환
    return cutter.getWorkingData();
  }

  /**
   * 작업용 데이터 초기화 (플리퍼 원본과 동일)
   */
  private _initializeWorkingData() {
    const positions = this.originalGeometry.attributes.position.array;
    const normals = this.originalGeometry.attributes.normal.array;
    const indices = this.originalGeometry.index!.array;

    // 플리퍼와 동일한 방식으로 배열 복사
    this.newVertices = Array.from(positions);
    this.newNormals = Array.from(normals);
    this.newIndices = Array.from(indices);
    this.vertexFaceMap = Array.from({ length: positions.length / 3 }, () => []);
    this.borderVertexIndices = [];

    // vertexFaceMap 구축 (플리퍼 원본과 동일)
    for (let i = 0; i < this.newIndices.length / 3; i += 1) {
      const baseIndex = i * 3;
      const v0 = this.newIndices[baseIndex];
      const v1 = this.newIndices[baseIndex + 1];
      const v2 = this.newIndices[baseIndex + 2];
      
      // vertexFaceMap 안전한 접근 보장
      if (!this.vertexFaceMap[v0]) this.vertexFaceMap[v0] = [];
      if (!this.vertexFaceMap[v1]) this.vertexFaceMap[v1] = [];
      if (!this.vertexFaceMap[v2]) this.vertexFaceMap[v2] = [];
      
      this.vertexFaceMap[v0].push(i);
      this.vertexFaceMap[v1].push(i);
      this.vertexFaceMap[v2].push(i);
    }
  }

  /**
   * 각 면에 속한 점들을 삼각분할 (플리퍼 원본 로직)
   */
  subdivideIntersectedFaces(selectedAreaPoints: DrawingPoint[]) {
    // 각 면에 속한 점들을 그룹화
    const facePointsMap = new Map<number, DrawingPoint[]>();
    for (const point of selectedAreaPoints) {
      if (!facePointsMap.has(point.faceIndex)) {
        facePointsMap.set(point.faceIndex, []);
      }
      facePointsMap.get(point.faceIndex)!.push(point);
    }

    // 각 면에 대한 처리 (플리퍼 원본과 동일)
    for (const [faceIndex, points] of facePointsMap) {
      this._subdivideFace(faceIndex, points);
    }
  }

  /**
   * 개별 면 삼각분할 (플리퍼 원본 로직 그대로)
   */
  private _subdivideFace(faceIndex: number, points: DrawingPoint[]) {
    // 면의 기하학적 정보 준비
    const baseIndex = faceIndex * 3;
    const vertexIndices = [
      this.newIndices[baseIndex],
      this.newIndices[baseIndex + 1],
      this.newIndices[baseIndex + 2],
    ];

    const vertices = [
      new THREE.Vector3(
        this.newVertices[vertexIndices[0] * 3],
        this.newVertices[vertexIndices[0] * 3 + 1],
        this.newVertices[vertexIndices[0] * 3 + 2]
      ),
      new THREE.Vector3(
        this.newVertices[vertexIndices[1] * 3],
        this.newVertices[vertexIndices[1] * 3 + 1],
        this.newVertices[vertexIndices[1] * 3 + 2]
      ),
      new THREE.Vector3(
        this.newVertices[vertexIndices[2] * 3],
        this.newVertices[vertexIndices[2] * 3 + 1],
        this.newVertices[vertexIndices[2] * 3 + 2]
      ),
    ];

    // 로컬 좌표계 생성
    const normal = new THREE.Vector3()
      .crossVectors(
        new THREE.Vector3().subVectors(vertices[1], vertices[0]),
        new THREE.Vector3().subVectors(vertices[2], vertices[0])
      )
      .normalize();
    const xAxis = new THREE.Vector3()
      .subVectors(vertices[1], vertices[0])
      .normalize();
    const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();

    // 점들을 2D로 투영
    const points2D = points.map((point) => {
      const v = new THREE.Vector3().subVectors(point.position, vertices[0]);
      return {
        x: v.dot(xAxis),
        y: v.dot(yAxis),
        originalPoint: point,
      };
    });

    // 새로운 정점 추가 및 인덱스 매핑
    const newVertexIndices = new Map<DrawingPoint, number>();
    for (const point of points) {
      const newVertexIndex = this.newVertices.length / 3;
      newVertexIndices.set(point, newVertexIndex);
      point.newVertexIndex = newVertexIndex;

      this.newVertices.push(
        point.position.x,
        point.position.y,
        point.position.z
      );
      this.newNormals.push(point.normal.x, point.normal.y, point.normal.z);
      this.borderVertexIndices.push(newVertexIndex);

      // vertexFaceMap 확장
      this.vertexFaceMap.push([]);
    }

    // Earcut을 위한 데이터 준비
    const flatPoints: number[] = [];
    // 원래 삼각형의 정점들도 포함
    for (const vertex of vertices) {
      const v = new THREE.Vector3().subVectors(vertex, vertices[0]);
      flatPoints.push(v.dot(xAxis), v.dot(yAxis));
    }
    // 새로운 점들 추가
    for (const p of points2D) {
      flatPoints.push(p.x, p.y);
    }

    // Earcut으로 삼각분할
    const triangles = earcut(flatPoints, [3], 2);

    // 새로운 삼각형들 생성
    const newTriangles: number[][] = [];
    for (let i = 0; i < triangles.length; i += 3) {
      const triangle = [triangles[i], triangles[i + 1], triangles[i + 2]];

      const newTriangle = triangle.map((idx) => {
        if (idx < 3) {
          // 원래 면의 정점
          return vertexIndices[idx];
        } else {
          // 새로운 점
          return newVertexIndices.get(points[idx - 3])!;
        }
      });
      newTriangles.push(newTriangle);
    }

    // vertexFaceMap에서 기존 면 제거
    for (const vertexIndex of vertexIndices) {
      if (!this.vertexFaceMap[vertexIndex]) {
        this.vertexFaceMap[vertexIndex] = [];
      }
      this.vertexFaceMap[vertexIndex] = this.vertexFaceMap[vertexIndex].filter(
        (f) => f !== faceIndex
      );
    }

    // 첫 번째 면은 기존 위치에 교체
    this.newIndices.splice(baseIndex, 3, ...newTriangles[0]);

    // 첫 번째 면 정점들의 vertexFaceMap 업데이트
    for (const vertexIndex of newTriangles[0]) {
      if (!this.vertexFaceMap[vertexIndex]) {
        this.vertexFaceMap[vertexIndex] = [];
      }
      this.vertexFaceMap[vertexIndex].push(faceIndex);
    }

    // 나머지 면들 추가
    for (let i = 1; i < newTriangles.length; i++) {
      const newFaceIndex = this.newIndices.length / 3;
      this.newIndices.push(...newTriangles[i]);

      for (const vertexIndex of newTriangles[i]) {
        if (!this.vertexFaceMap[vertexIndex]) {
          this.vertexFaceMap[vertexIndex] = [];
        }
        this.vertexFaceMap[vertexIndex].push(newFaceIndex);
      }
    }
  }

  /**
   * 연속된 점들 사이의 knife cut 수행 (플리퍼 원본 로직)
   */
  performKnifeCuts(selectedAreaPoints: DrawingPoint[]) {
    for (let i = 0; i < selectedAreaPoints.length; i++) {
      const startDrawingPoint = selectedAreaPoints[i];
      const endDrawingPoint =
        selectedAreaPoints[(i + 1) % selectedAreaPoints.length];
      this._edgeBetweenSelectedAreaPoints(startDrawingPoint, endDrawingPoint);
    }
  }

  /**
   * 삼각형이 endPoint를 포함하는지 확인 (플리퍼 원본)
   */
  private _isTriangleContainsEndPoint(
    faceIndex: number,
    endDrawingPoint: DrawingPoint
  ): boolean {
    const baseIndex = faceIndex * 3;
    return (
      this.newIndices[baseIndex] === endDrawingPoint.newVertexIndex ||
      this.newIndices[baseIndex + 1] === endDrawingPoint.newVertexIndex ||
      this.newIndices[baseIndex + 2] === endDrawingPoint.newVertexIndex
    );
  }

  /**
   * 삼각형의 세 정점을 Vector3로 변환 (플리퍼 원본)
   */
  private _getTriangleVertices(faceIndex: number): THREE.Vector3[] {
    const baseIndex = faceIndex * 3;
    return [
      new THREE.Vector3(
        this.newVertices[this.newIndices[baseIndex] * 3],
        this.newVertices[this.newIndices[baseIndex] * 3 + 1],
        this.newVertices[this.newIndices[baseIndex] * 3 + 2]
      ),
      new THREE.Vector3(
        this.newVertices[this.newIndices[baseIndex + 1] * 3],
        this.newVertices[this.newIndices[baseIndex + 1] * 3 + 1],
        this.newVertices[this.newIndices[baseIndex + 1] * 3 + 2]
      ),
      new THREE.Vector3(
        this.newVertices[this.newIndices[baseIndex + 2] * 3],
        this.newVertices[this.newIndices[baseIndex + 2] * 3 + 1],
        this.newVertices[this.newIndices[baseIndex + 2] * 3 + 2]
      ),
    ];
  }

  /**
   * 삼각형을 교차점으로 분할 (플리퍼 원본 로직)
   */
  private _splitTriangleAtIntersection({
    triangleIndex,
    intersectionPoint,
    edge,
    intersectionPseudoDrawingPoint,
    newBorderIndex,
  }: { triangleIndex: number; intersectionPoint: THREE.Vector3; edge: Edge } & (
    | {
        intersectionPseudoDrawingPoint: DrawingPoint;
        newBorderIndex?: undefined;
      }
    | { newBorderIndex: number; intersectionPseudoDrawingPoint?: undefined }
  )): SplitResult {
    const vertexIndices = [
      this.newIndices[triangleIndex * 3],
      this.newIndices[triangleIndex * 3 + 1],
      this.newIndices[triangleIndex * 3 + 2],
    ];

    const otherVertexIndexIndex = vertexIndices.findIndex(
      (idx) => idx !== edge.startIndex && idx !== edge.endIndex
    );
    const otherVertexIndex = vertexIndices[otherVertexIndexIndex];
    const edgeStartIndex = vertexIndices[(otherVertexIndexIndex + 1) % 3];
    const edgeEndIndex = vertexIndices[(otherVertexIndexIndex + 2) % 3];

    let pseudoDrawingPoint: DrawingPoint;
    if (intersectionPseudoDrawingPoint) {
      // 이미 생성된 교차점 정점 재사용
      pseudoDrawingPoint = intersectionPseudoDrawingPoint;
    } else {
      // 새로운 교차점 정점 생성
      const newVertexIndex = this.newVertices.length / 3;
      this.newVertices.push(
        intersectionPoint.x,
        intersectionPoint.y,
        intersectionPoint.z
      );

      // 엣지의 시작점과 끝점의 노멀 보간
      const startNormal = new THREE.Vector3(
        this.newNormals[edgeStartIndex * 3],
        this.newNormals[edgeStartIndex * 3 + 1],
        this.newNormals[edgeStartIndex * 3 + 2]
      );
      const endNormal = new THREE.Vector3(
        this.newNormals[edgeEndIndex * 3],
        this.newNormals[edgeEndIndex * 3 + 1],
        this.newNormals[edgeEndIndex * 3 + 2]
      );

      // 교차점이 엣지의 어느 부분에 있는지 계산
      const edgeVector = new THREE.Vector3().subVectors(edge.end, edge.start);
      const intersectionVector = new THREE.Vector3().subVectors(
        intersectionPoint,
        edge.start
      );
      const t = intersectionVector.length() / edgeVector.length();

      // 노멀 보간
      const newNormal = new THREE.Vector3()
        .lerpVectors(startNormal, endNormal, t)
        .normalize();
      this.newNormals.push(newNormal.x, newNormal.y, newNormal.z);

      pseudoDrawingPoint = {
        position: intersectionPoint,
        normal: newNormal,
        faceIndex: -1, // 교차점은 특정 면에 속하지 않음
        newVertexIndex,
      };

      // vertexFaceMap 확장 (배열 범위 보장)
      while (this.vertexFaceMap.length <= newVertexIndex) {
        this.vertexFaceMap.push([]);
      }
      this.borderVertexIndices.splice(newBorderIndex, 0, newVertexIndex);
    }

    // 기존 삼각형을 첫 번째 삼각형으로 대체
    this.newIndices.splice(
      triangleIndex * 3,
      3,
      edgeStartIndex,
      pseudoDrawingPoint.newVertexIndex!,
      otherVertexIndex
    );
    
    // vertexFaceMap 안전한 접근 보장
    if (!this.vertexFaceMap[edgeEndIndex]) {
      this.vertexFaceMap[edgeEndIndex] = [];
    }
    this.vertexFaceMap[edgeEndIndex] = this.vertexFaceMap[edgeEndIndex].filter(
      (face) => face !== triangleIndex
    );

    // 두 번째 삼각형 추가
    this.newIndices.push(
      pseudoDrawingPoint.newVertexIndex!,
      edgeEndIndex,
      otherVertexIndex
    );
    const newTriangleIndex = this.newIndices.length / 3 - 1;
    
    // vertexFaceMap 안전한 접근 보장
    if (!this.vertexFaceMap[edgeEndIndex]) {
      this.vertexFaceMap[edgeEndIndex] = [];
    }
    if (!this.vertexFaceMap[otherVertexIndex]) {
      this.vertexFaceMap[otherVertexIndex] = [];
    }
    if (!this.vertexFaceMap[pseudoDrawingPoint.newVertexIndex!]) {
      this.vertexFaceMap[pseudoDrawingPoint.newVertexIndex!] = [];
    }
    
    this.vertexFaceMap[edgeEndIndex].push(newTriangleIndex);
    this.vertexFaceMap[otherVertexIndex].push(newTriangleIndex);
    this.vertexFaceMap[pseudoDrawingPoint.newVertexIndex!].push(
      triangleIndex,
      newTriangleIndex
    );

    return {
      edgeStartIndex,
      edgeEndIndex,
      otherVertexIndex,
      pseudoDrawingPoint,
      splitTriangles: [triangleIndex, newTriangleIndex],
    };
  }

  /**
   * 인접 삼각형 찾기 (플리퍼 원본 로직)
   */
  private _findAdjacentTriangle(
    edge: Edge,
    currentTriangle: number
  ): number | null {
    // edge의 첫 번째 정점에 연결된 모든 면들
    if (!this.vertexFaceMap[edge.startIndex]) {
      this.vertexFaceMap[edge.startIndex] = [];
    }
    const facesWithStartVertex = this.vertexFaceMap[edge.startIndex];

    // 이 면들 중에서 edge의 두 번째 정점도 포함하고, currentTriangle이 아닌 면 찾기
    for (const faceIndex of facesWithStartVertex) {
      if (faceIndex === currentTriangle) continue;

      const faceVertexIndices = [
        this.newIndices[faceIndex * 3],
        this.newIndices[faceIndex * 3 + 1],
        this.newIndices[faceIndex * 3 + 2],
      ];

      // edge의 end 정점도 포함하는지 확인
      if (faceVertexIndices.includes(edge.endIndex)) {
        return faceIndex;
      }
    }

    return null;
  }

  /**
   * 두 점 사이 knife cut (플리퍼 원본 로직 - 재귀적)
   */
  private _edgeBetweenSelectedAreaPoints(
    startDrawingPoint: DrawingPoint,
    endDrawingPoint: DrawingPoint
  ) {
    if (!this.vertexFaceMap[startDrawingPoint.newVertexIndex!]) {
      this.vertexFaceMap[startDrawingPoint.newVertexIndex!] = [];
    }
    const candidateTriangleFaceIndexes =
      this.vertexFaceMap[startDrawingPoint.newVertexIndex!];

    // candidate 중 endPoint가 포함되면 종료
    for (const faceIndex of candidateTriangleFaceIndexes) {
      if (this._isTriangleContainsEndPoint(faceIndex, endDrawingPoint)) {
        return;
      }
    }

    // 교차점 찾기
    let intersection: Intersection | null = null;

    for (const faceIndex of candidateTriangleFaceIndexes) {
      const edgeVertexIndexes = [
        this.newIndices[faceIndex * 3],
        this.newIndices[faceIndex * 3 + 1],
        this.newIndices[faceIndex * 3 + 2],
      ].filter((idx) => idx !== startDrawingPoint.newVertexIndex);

      if (edgeVertexIndexes.length !== 2) continue;

      const edge: Edge = {
        start: new THREE.Vector3(
          this.newVertices[edgeVertexIndexes[0] * 3],
          this.newVertices[edgeVertexIndexes[0] * 3 + 1],
          this.newVertices[edgeVertexIndexes[0] * 3 + 2]
        ),
        end: new THREE.Vector3(
          this.newVertices[edgeVertexIndexes[1] * 3],
          this.newVertices[edgeVertexIndexes[1] * 3 + 1],
          this.newVertices[edgeVertexIndexes[1] * 3 + 2]
        ),
        startIndex: edgeVertexIndexes[0],
        endIndex: edgeVertexIndexes[1],
      };

      const endPointOnPlane = endDrawingPoint.position.clone();

      // 첫 번째 삼각형의 법선 벡터를 사용하여 평면 계산
      const vertices = this._getTriangleVertices(faceIndex);
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

      if (intersectionPosition) {
        intersection = {
          point: intersectionPosition,
          edge: edge,
          triangle: faceIndex,
        };
        break;
      }
    }

    if (!intersection) {
      throw new Error("교차점 찾기 실패");
    }

    // 엣지 반대편의 삼각형 찾기
    const otherTriangle = this._findAdjacentTriangle(
      intersection.edge,
      intersection.triangle
    );
    if (otherTriangle === null) {
      throw new Error("반대편 삼각형 찾기 실패");
    }

    // 교차된 삼각형 분할
    const newBorderIndex = this.borderVertexIndices.findIndex(
      (idx) => idx === startDrawingPoint.newVertexIndex
    ) + 1;
    const splitResult = this._splitTriangleAtIntersection({
      triangleIndex: intersection.triangle,
      intersectionPoint: intersection.point,
      edge: intersection.edge,
      newBorderIndex,
    });

    // 반대편 삼각형도 같은 방식으로 분할하되, 이미 생성된 교차점 정점 재사용
    this._splitTriangleAtIntersection({
      triangleIndex: otherTriangle,
      intersectionPoint: intersection.point,
      edge: intersection.edge,
      intersectionPseudoDrawingPoint: splitResult.pseudoDrawingPoint,
    });

    // 이후 엣지 반대편의 쪼개진 두 삼각형을 candidate로 반복 (재귀 호출)
    this._edgeBetweenSelectedAreaPoints(
      splitResult.pseudoDrawingPoint,
      endDrawingPoint
    );
  }

  /**
   * 인접성 맵 구축
   * newIndices로부터 각 정점의 인접 정점들을 추출하여 adjacencyMap에 저장
   */
  private buildAdjacencyMap(): void {
    this.adjacencyMap.clear();

    // 모든 정점에 대해 빈 Set 초기화
    const vertexCount = this.newVertices.length / 3;
    for (let i = 0; i < vertexCount; i++) {
      this.adjacencyMap.set(i, new Set());
    }

    // 모든 면을 순회하며 엣지 정보 추출
    const faceCount = this.newIndices.length / 3;
    for (let i = 0; i < faceCount; i++) {
      const baseIdx = i * 3;
      const v0 = this.newIndices[baseIdx];
      const v1 = this.newIndices[baseIdx + 1];
      const v2 = this.newIndices[baseIdx + 2];

      // 양방향 연결 추가
      this.adjacencyMap.get(v0)!.add(v1);
      this.adjacencyMap.get(v0)!.add(v2);
      this.adjacencyMap.get(v1)!.add(v0);
      this.adjacencyMap.get(v1)!.add(v2);
      this.adjacencyMap.get(v2)!.add(v0);
      this.adjacencyMap.get(v2)!.add(v1);
    }
  }

  /**
   * 경계선에 인접한 엣지들만 수집
   * borderVertexIndices의 정점들과 연결된 모든 엣지를 수집하고 길이 계산
   */
  private collectCandidateEdges(): EdgeInfo[] {
    const edgeQueue: EdgeInfo[] = [];
    const processedEdges = new Set<string>();

    // 경계 정점들과 연결된 모든 엣지 수집
    for (const borderVertex of this.borderVertexIndices) {
      const neighbors = this.adjacencyMap.get(borderVertex);
      if (!neighbors) continue;

      for (const neighbor of neighbors) {
        // 엣지 키 생성 (v1 < v2 보장)
        const v1 = Math.min(borderVertex, neighbor);
        const v2 = Math.max(borderVertex, neighbor);
        const edgeKey = `${v1}-${v2}`;

        // 이미 처리한 엣지는 건너뛰기
        if (processedEdges.has(edgeKey)) continue;
        processedEdges.add(edgeKey);

        // 엣지 길이 계산
        const pos1 = new THREE.Vector3(
          this.newVertices[v1 * 3],
          this.newVertices[v1 * 3 + 1],
          this.newVertices[v1 * 3 + 2]
        );
        const pos2 = new THREE.Vector3(
          this.newVertices[v2 * 3],
          this.newVertices[v2 * 3 + 1],
          this.newVertices[v2 * 3 + 2]
        );
        const length = pos1.distanceTo(pos2);

        edgeQueue.push({ v1, v2, length });
      }
    }

    return edgeQueue;
  }

  /**
   * 짧은 엣지들을 병합하여 메시를 단순화
   * MinimalSurfaceGenerator의 mergeShortEdges 참고
   */
  private mergeShortEdges(threshold: number = 0.005): void {
    // 모든 후보 엣지 수집
    const edgeQueue = this.collectCandidateEdges();

    // 길이 기준으로 정렬
    edgeQueue.sort((a, b) => a.length - b.length);

    console.log(`엣지 병합 시작: ${edgeQueue.length}개 후보, threshold=${threshold}`);
    let mergedCount = 0;

    // 짧은 엣지들을 순차적으로 병합
    while (edgeQueue.length > 0) {
      const { v1, v2, length } = edgeQueue.shift()!;

      // 임계값보다 긴 엣지가 나오면 종료
      if (length >= threshold) {
        break;
      }

      // 이미 삭제된 정점은 건너뛰기
      if (this.deletedVertices.has(v1) || this.deletedVertices.has(v2)) {
        continue;
      }

      // 엣지 병합 (v2를 v1로 병합)
      this.mergeEdge(v1, v2, edgeQueue);
      mergedCount++;
    }

    console.log(`엣지 병합 완료: ${mergedCount}개 병합됨`);
  }

  /**
   * 두 정점을 병합
   * v2를 v1로 병합하고, v2를 삭제된 정점으로 표시
   * 정점 위치는 v2의 위치를 사용
   * MinimalSurfaceGenerator의 mergeEdge 참고
   */
  private mergeEdge(v1: number, v2: number, edgeQueue: EdgeInfo[]): void {
    if (
      v1 === v2 ||
      this.deletedVertices.has(v1) ||
      this.deletedVertices.has(v2)
    )
      return;

    // v2의 위치를 v1로 복사
    this.newVertices[v1 * 3] = this.newVertices[v2 * 3];
    this.newVertices[v1 * 3 + 1] = this.newVertices[v2 * 3 + 1];
    this.newVertices[v1 * 3 + 2] = this.newVertices[v2 * 3 + 2];

    // v2의 노멀을 v1로 복사
    this.newNormals[v1 * 3] = this.newNormals[v2 * 3];
    this.newNormals[v1 * 3 + 1] = this.newNormals[v2 * 3 + 1];
    this.newNormals[v1 * 3 + 2] = this.newNormals[v2 * 3 + 2];

    // newIndices에서 v2를 v1로 치환
    for (let i = 0; i < this.newIndices.length; i++) {
      if (this.newIndices[i] === v2) {
        this.newIndices[i] = v1;
      }
    }

    // vertexFaceMap 업데이트
    const v2Faces = this.vertexFaceMap[v2] || [];
    const v1Faces = this.vertexFaceMap[v1] || [];

    for (const faceIndex of v2Faces) {
      if (!v1Faces.includes(faceIndex)) {
        v1Faces.push(faceIndex);
      }
    }
    this.vertexFaceMap[v2] = [];

    // adjacencyMap 업데이트
    const v1Neighbors = this.adjacencyMap.get(v1)!;
    const v2Neighbors = this.adjacencyMap.get(v2)!;

    for (const neighbor of v2Neighbors) {
      if (neighbor !== v1) {
        // v2의 인접 정점들을 v1에 연결
        v1Neighbors.add(neighbor);
        const neighborNeighbors = this.adjacencyMap.get(neighbor)!;
        neighborNeighbors.delete(v2);
        neighborNeighbors.add(v1);
      }
    }

    // v1과 v2 사이의 연결 제거
    v1Neighbors.delete(v2);

    // v2의 인접성 맵 제거
    this.adjacencyMap.delete(v2);

    // v2를 삭제된 정점으로 표시
    this.deletedVertices.add(v2);

    // borderVertexIndices에서 v2를 v1로 교체
    const borderIndex = this.borderVertexIndices.indexOf(v2);
    if (borderIndex !== -1) {
      this.borderVertexIndices[borderIndex] = v1;
    }

    // edgeQueue의 모든 엣지에서 v2를 v1로 변경하고 길이 재계산
    for (const edge of edgeQueue) {
      if (edge.v1 === v2) edge.v1 = v1;
      if (edge.v2 === v2) edge.v2 = v1;

      // v1이 관련된 엣지의 길이 재계산
      if (edge.v1 === v1 || edge.v2 === v1) {
        const pos1 = new THREE.Vector3(
          this.newVertices[edge.v1 * 3],
          this.newVertices[edge.v1 * 3 + 1],
          this.newVertices[edge.v1 * 3 + 2]
        );
        const pos2 = new THREE.Vector3(
          this.newVertices[edge.v2 * 3],
          this.newVertices[edge.v2 * 3 + 1],
          this.newVertices[edge.v2 * 3 + 2]
        );
        edge.length = pos1.distanceTo(pos2);
      }
    }

    // edgeQueue 재정렬
    edgeQueue.sort((a, b) => a.length - b.length);
  }

  /**
   * 삭제된 정점들을 실제로 제거하고 인덱스 재매핑
   */
  private compactDeletedVertices(): void {
    if (this.deletedVertices.size === 0) {
      return;
    }

    console.log(`정점 압축 시작: ${this.deletedVertices.size}개 정점 제거`);

    // 새로운 정점 인덱스 매핑 생성
    const vertexMap = new Map<number, number>();
    const newVertices: number[] = [];
    const newNormals: number[] = [];

    let newIndex = 0;
    const vertexCount = this.newVertices.length / 3;

    for (let i = 0; i < vertexCount; i++) {
      if (!this.deletedVertices.has(i)) {
        vertexMap.set(i, newIndex);
        newVertices.push(
          this.newVertices[i * 3],
          this.newVertices[i * 3 + 1],
          this.newVertices[i * 3 + 2]
        );
        newNormals.push(
          this.newNormals[i * 3],
          this.newNormals[i * 3 + 1],
          this.newNormals[i * 3 + 2]
        );
        newIndex++;
      }
    }

    // newIndices 재매핑
    const newIndices: number[] = [];
    for (let i = 0; i < this.newIndices.length; i++) {
      const oldIndex = this.newIndices[i];
      const mappedIndex = vertexMap.get(oldIndex);
      if (mappedIndex !== undefined) {
        newIndices.push(mappedIndex);
      }
    }

    // vertexFaceMap 재구축
    const newVertexFaceMap: number[][] = Array.from(
      { length: newVertices.length / 3 },
      () => []
    );

    const faceCount = newIndices.length / 3;
    for (let i = 0; i < faceCount; i++) {
      const baseIdx = i * 3;
      newVertexFaceMap[newIndices[baseIdx]].push(i);
      newVertexFaceMap[newIndices[baseIdx + 1]].push(i);
      newVertexFaceMap[newIndices[baseIdx + 2]].push(i);
    }

    // borderVertexIndices 재매핑 (순서 유지)
    const newBorderVertexIndices: number[] = [];
    for (const oldIndex of this.borderVertexIndices) {
      const mappedIndex = vertexMap.get(oldIndex);
      if (mappedIndex !== undefined) {
        // 중복 체크 (병합으로 인해 중복 가능)
        if (!newBorderVertexIndices.includes(mappedIndex)) {
          newBorderVertexIndices.push(mappedIndex);
        }
      }
    }

    // 데이터 교체
    this.newVertices = newVertices;
    this.newNormals = newNormals;
    this.newIndices = newIndices;
    this.vertexFaceMap = newVertexFaceMap;
    this.borderVertexIndices = newBorderVertexIndices;

    // 삭제된 정점 목록 초기화
    this.deletedVertices.clear();

    console.log(
      `정점 압축 완료: ${newVertices.length / 3}개 정점, ${newBorderVertexIndices.length}개 경계 정점`
    );
  }

  /**
   * 데이터 무결성 검증
   */
  private verifyDataIntegrity(): void {
    // deletedVertices와 adjacencyMap의 일관성 확인
    const adjacencySet = new Set(this.adjacencyMap.keys());
    for (const vertexIndex of this.deletedVertices) {
      if (adjacencySet.has(vertexIndex)) {
        throw new Error(
          `무결성 오류: 삭제된 정점 ${vertexIndex}이 adjacencyMap에 존재함`
        );
      }
    }

    // borderVertexIndices의 모든 정점이 유효한지 확인
    const vertexCount = this.newVertices.length / 3;
    for (const borderVertex of this.borderVertexIndices) {
      if (borderVertex >= vertexCount || this.deletedVertices.has(borderVertex)) {
        throw new Error(
          `무결성 오류: 유효하지 않은 경계 정점 ${borderVertex}`
        );
      }
    }

    // newIndices의 모든 인덱스가 유효한지 확인
    for (const index of this.newIndices) {
      if (index >= vertexCount || this.deletedVertices.has(index)) {
        throw new Error(`무결성 오류: 유효하지 않은 인덱스 ${index}`);
      }
    }

    console.log("데이터 무결성 검증 완료");
  }

  /**
   * 현재 상태를 플리퍼가 기대하는 형태로 반환
   */
  getWorkingData(): WorkingData {
    return {
      newVertices: this.newVertices,
      newNormals: this.newNormals,
      newIndices: this.newIndices,
      vertexFaceMap: this.vertexFaceMap,
      borderVertexIndices: this.borderVertexIndices,
    };
  }
}
