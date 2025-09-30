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

interface WorkingData {
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

  constructor(originalGeometry: THREE.BufferGeometry) {
    this.originalGeometry = originalGeometry;

    // 플리퍼 원본과 동일한 작업용 데이터 구조
    this.newVertices = [];
    this.newNormals = [];
    this.newIndices = [];
    this.vertexFaceMap = [];
    this.borderVertexIndices = [];

    this._initializeWorkingData();
  }

  /**
   * 플리퍼용 메시 절단 (원본 로직 보존) - 정적 메서드로 API 호환성 유지
   */
  static performFlipperCutting(
    originalGeometry: THREE.BufferGeometry,
    selectedAreaPoints: DrawingPoint[]
  ): WorkingData {
    const cutter = new MeshCutter(originalGeometry);

    // 1. 각 점에 대해 면 분할 (플리퍼 원본 3.1, 3.2 단계)
    cutter.subdivideIntersectedFaces(selectedAreaPoints);

    // 2. 연속된 점들 사이의 경로 찾기 및 면 분할 (플리퍼 원본 4단계)
    cutter.performKnifeCuts(selectedAreaPoints);

    // 3. 플리퍼가 기대하는 형태로 결과 반환
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
      this.vertexFaceMap[this.newIndices[baseIndex]].push(i);
      this.vertexFaceMap[this.newIndices[baseIndex + 1]].push(i);
      this.vertexFaceMap[this.newIndices[baseIndex + 2]].push(i);
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
      this.vertexFaceMap[vertexIndex] = this.vertexFaceMap[vertexIndex].filter(
        (f) => f !== faceIndex
      );
    }

    // 첫 번째 면은 기존 위치에 교체
    this.newIndices.splice(baseIndex, 3, ...newTriangles[0]);

    // 첫 번째 면 정점들의 vertexFaceMap 업데이트
    for (const vertexIndex of newTriangles[0]) {
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

      this.vertexFaceMap[pseudoDrawingPoint.newVertexIndex!] = [];
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
