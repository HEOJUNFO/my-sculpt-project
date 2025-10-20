import * as THREE from "three";
import earcut from "earcut";
import { InformedGeometry } from "./InformedGeometry.js";

// 타입 정의
interface DrawingPoint {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  face?: [number, number, number];
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
  triangle: [number, number, number];
}

interface SplitResult {
  edgeStartIndex: number;
  edgeEndIndex: number;
  otherVertexIndex: number;
  pseudoDrawingPoint: DrawingPoint;
  splitTriangles: [number, number, number][];
}

interface WorkingData {
  borderVertexIndices: number[];
  geometry: InformedGeometry;
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
 * 메시 절단 도구 클래스 (InformedGeometry 기반)
 * 플리퍼의 원본 knife cut 로직을 정확히 재현
 */
export class MeshCutter {
  private geometry: InformedGeometry; // 주 데이터 구조
  private borderVertexIndices: number[];
  private debugScene: THREE.Scene | null = null;
  private debugObjects: THREE.Object3D[] = [];

  constructor(originalGeometry: THREE.BufferGeometry, debugScene?: THREE.Scene) {
    this.geometry = InformedGeometry.fromBufferGeometry(originalGeometry);
    this.borderVertexIndices = [];
    this.debugScene = debugScene || null;
  }

  static performCutting(
    originalGeometry: THREE.BufferGeometry,
    selectedAreaPoints: {
      position: THREE.Vector3;
      normal: THREE.Vector3;
      faceIndex: number;
    }[],
    edgeMergeThreshold: number = 0.005,
    debugScene?: THREE.Scene
  ) {
    const cutter = new MeshCutter(originalGeometry, debugScene);
    const faceIndices = originalGeometry.getIndex()!.array;
    const borderPoints: DrawingPoint[] = selectedAreaPoints.map((point) => ({
      position: point.position,
      normal: point.normal,
      face: [faceIndices[point.faceIndex * 3], faceIndices[point.faceIndex * 3 + 1], faceIndices[point.faceIndex * 3 + 2]],
    }));

    console.log("=== Knife Cut 시작 ===");

    // 1. 각 점에 대해 면 분할
    cutter.subdivideIntersectedFaces(borderPoints);

    // 2. 연속된 점들 사이의 경로 찾기 및 면 분할 
    cutter.performKnifeCuts(borderPoints);

    console.log(
      `Knife Cut 완료
      정점: ${cutter.geometry.getVertexCount()}개, 면: ${cutter.geometry.getFaceCount()}개, 경계 정점: ${
        cutter.borderVertexIndices.length
      }개`
    );

    // 3. 엣지 병합 단계
    console.log("=== 엣지 병합 시작 ===");
    cutter.mergeShortEdges(edgeMergeThreshold);
    console.log("=== 엣지 병합 완료 ===");

    // 4. 플리퍼가 기대하는 형태로 결과 반환 (compact된 상태)
    return cutter.getWorkingData();
  }

  /**
   * 각 면에 속한 점들을 삼각분할 (플리퍼 원본 로직)
   */
  subdivideIntersectedFaces(selectedAreaPoints: DrawingPoint[]) {
    // 각 면에 속한 점들을 그룹화
    const facePointsMap = new Map<string, DrawingPoint[]>();
    for (const point of selectedAreaPoints) {
      const faceKey = this.geometry.makeFaceKey(point.face!);
      if (!facePointsMap.has(faceKey)) {
        facePointsMap.set(faceKey, []);
      }
      facePointsMap.get(faceKey)!.push(point);
    }

    // 각 면에 대한 처리 (플리퍼 원본과 동일)
    for (const [faceKey, points] of facePointsMap) {
      this._subdivideFace(this.geometry.faces.get(faceKey)!, points);
    }
  }

  /**
   * 개별 면 삼각분할 (플리퍼 원본 로직 그대로)
   */
  private _subdivideFace(
    face: [number, number, number],
    points: DrawingPoint[]
  ) {
    const [v0, v1, v2] = face;

    const vertices = [
      this.geometry.positions[v0]!,
      this.geometry.positions[v1]!,
      this.geometry.positions[v2]!,
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
      const newVertexIndex = this.geometry.addVertex(
        point.position,
        point.normal
      );
      newVertexIndices.set(point, newVertexIndex);
      point.newVertexIndex = newVertexIndex;

      this.borderVertexIndices.push(newVertexIndex);
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

    // 기존 면 제거
    this.geometry.removeFace(v0, v1, v2);

    // 새로운 삼각형들 생성
    for (let i = 0; i < triangles.length; i += 3) {
      const earcutTriangle = [triangles[i], triangles[i + 1], triangles[i + 2]];

      const newTriangle = earcutTriangle.map((idx) => {
        if (idx < 3) {
          // 원래 면의 정점
          return face[idx];
        } else {
          // 새로운 점
          return newVertexIndices.get(points[idx - 3])!;
        }
      });
      this.geometry.addFace(newTriangle[0], newTriangle[1], newTriangle[2]);
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
    face: [number, number, number],
    endDrawingPoint: DrawingPoint
  ): boolean {
    return (
      face[0] === endDrawingPoint.newVertexIndex ||
      face[1] === endDrawingPoint.newVertexIndex ||
      face[2] === endDrawingPoint.newVertexIndex
    );
  }

  /**
   * 삼각형을 교차점으로 분할 (플리퍼 원본 로직)
   */
  private _splitTriangleAtIntersection({
    face,
    intersectionPoint,
    edge,
    intersectionPseudoDrawingPoint,
    newBorderIndex,
  }: {
    face: [number, number, number];
    intersectionPoint: THREE.Vector3;
    edge: Edge;
  } & (
    | {
        intersectionPseudoDrawingPoint: DrawingPoint;
        newBorderIndex?: undefined;
      }
    | { newBorderIndex: number; intersectionPseudoDrawingPoint?: undefined }
  )): SplitResult {
    const otherVertexIndexIndex = face.findIndex(
      (idx) => idx !== edge.startIndex && idx !== edge.endIndex
    );
    const otherVertexIndex = face[otherVertexIndexIndex];
    const edgeStartIndex = face[(otherVertexIndexIndex + 1) % 3];
    const edgeEndIndex = face[(otherVertexIndexIndex + 2) % 3];

    let pseudoDrawingPoint: DrawingPoint;
    if (intersectionPseudoDrawingPoint) {
      // 이미 생성된 교차점 정점 재사용
      pseudoDrawingPoint = intersectionPseudoDrawingPoint;
    } else {
      // 새로운 교차점 정점 생성
      const startNormal = this.geometry.normals[edgeStartIndex]!;
      const endNormal = this.geometry.normals[edgeEndIndex]!;

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

      const newVertexIndex = this.geometry.addVertex(
        intersectionPoint,
        newNormal
      );

      pseudoDrawingPoint = {
        position: intersectionPoint,
        normal: newNormal,
        face: face,
        newVertexIndex,
      };

      this.borderVertexIndices.splice(newBorderIndex, 0, newVertexIndex);
    }

    // 기존 삼각형 제거
    this.geometry.removeFace(face[0], face[1], face[2]);

    // 첫 번째 삼각형 추가
    const newTriangle1 = [
      edgeStartIndex,
      pseudoDrawingPoint.newVertexIndex!,
      otherVertexIndex,
    ] as [number, number, number];
    this.geometry.addFace(...newTriangle1);

    // 두 번째 삼각형 추가
    const newTriangle2 = [
      pseudoDrawingPoint.newVertexIndex!,
      edgeEndIndex,
      otherVertexIndex,
    ] as [number, number, number];
    this.geometry.addFace(...newTriangle2);

    return {
      edgeStartIndex,
      edgeEndIndex,
      otherVertexIndex,
      pseudoDrawingPoint,
      splitTriangles: [newTriangle1, newTriangle2],
    };
  }

  /**
   * 인접 삼각형 찾기 (플리퍼 원본 로직)
   */
  private _findAdjacentTriangle(
    edge: Edge,
    currentFace: [number, number, number]
  ): [number, number, number] | null {
    const candidates = this.geometry.findFacesWithEdge(
      edge.startIndex,
      edge.endIndex
    );
    const currentFaceKey = this.geometry.makeFaceKey(currentFace);
    for (const candidate of candidates) {
      if (this.geometry.makeFaceKey(candidate) !== currentFaceKey)
        return candidate;
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
    const candidateTriangles = this.geometry.findFacesWithVertex(
      startDrawingPoint.newVertexIndex!
    );

    // 디버깅: start/end 포인트 표시
    this._addDebugPoint(startDrawingPoint.position, 0x00ff00); // 초록색
    this._addDebugPoint(endDrawingPoint.position, 0xff0000); // 빨간색

    // candidate 중 endPoint가 포함되면 종료
    for (const face of candidateTriangles) {
      if (this._isTriangleContainsEndPoint(face, endDrawingPoint)) {
        return;
      }
    }

    // 교차점 찾기
    let intersection: Intersection | null = null;

    for (const face of candidateTriangles) {
      const edgeVertexIndexes = face.filter(
        (idx) => idx !== startDrawingPoint.newVertexIndex
      );
      if (edgeVertexIndexes.length !== 2) continue;

      const edge: Edge = {
        start: this.geometry.positions[edgeVertexIndexes[0]]!,
        end: this.geometry.positions[edgeVertexIndexes[1]]!,
        startIndex: edgeVertexIndexes[0],
        endIndex: edgeVertexIndexes[1],
      };

      // 디버깅: 검사 중인 엣지 표시
      this._addDebugEdge(edge.start, edge.end, 0xffff00); // 노란색

      const endPointOnPlane = endDrawingPoint.position.clone();

      // 첫 번째 삼각형의 법선 벡터를 사용하여 평면 계산
      const vertices = face.map((vIdx) => this.geometry.positions[vIdx]!);
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
          triangle: face,
        };
        this.clearDebugObjects();
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
    const newBorderIndex =
      this.borderVertexIndices.findIndex(
        (idx) => idx === startDrawingPoint.newVertexIndex
      ) + 1;
    const splitResult = this._splitTriangleAtIntersection({
      face: intersection.triangle,
      intersectionPoint: intersection.point,
      edge: intersection.edge,
      newBorderIndex,
    });

    // 반대편 삼각형도 같은 방식으로 분할하되, 이미 생성된 교차점 정점 재사용
    this._splitTriangleAtIntersection({
      face: otherTriangle,
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
   * 점에서 선분까지의 최단 거리와 projection point 계산
   */
  private projectPointToEdge(
    point: THREE.Vector3,
    edgeStart: THREE.Vector3,
    edgeEnd: THREE.Vector3
  ): { distance: number; projection: THREE.Vector3; t: number } {
    const AB = new THREE.Vector3().subVectors(edgeEnd, edgeStart);
    const AP = new THREE.Vector3().subVectors(point, edgeStart);
    
    const abLengthSq = AB.lengthSq();
    if (abLengthSq < 1e-10) {
      // 엣지 길이가 0에 가까우면 시작점으로
      return {
        distance: point.distanceTo(edgeStart),
        projection: edgeStart.clone(),
        t: 0
      };
    }
    
    // t는 0-1 사이로 clamp (선분 범위 내)
    const t = Math.max(0, Math.min(1, AP.dot(AB) / abLengthSq));
    
    // Projection point = A + t * AB
    const projection = new THREE.Vector3()
      .copy(edgeStart)
      .add(AB.multiplyScalar(t));
    
    const distance = point.distanceTo(projection);
    
    return { distance, projection, t };
  }

  /**
   * 짧은 엣지 병합 및 border edge projection
   */
  private mergeShortEdges(threshold: number): void {
    // Border vertex set 생성 (빠른 검색)
    const borderVertexSet = new Set(this.borderVertexIndices);
    
    console.log(`  초기 경계 정점 수: ${this.borderVertexIndices.length}`);
    
    // === 1단계: Adjacent Vertex Merging ===
    console.log("  1단계: 인접 정점 병합 시작");
    let mergeCount = 0;
    
      for (let i = 0; i < this.borderVertexIndices.length; i++) {
        const borderVertex = this.borderVertexIndices[i];
        
        if (!this.geometry.positions[borderVertex]) {
          console.log("이미 삭제된 border 제거:", borderVertex);
          this.borderVertexIndices.splice(i, 1);
          borderVertexSet.delete(borderVertex);
          continue;
        }
      
      const borderPos = this.geometry.positions[borderVertex]!;
      const adjacentVertices = this.geometry.edges.get(borderVertex)!;
      
      // 인접 정점들 중 threshold보다 가까운 것 찾기
      for (const adjacentVertex of adjacentVertices) {
        // 이미 삭제되었으면 스킵
        const adjacentPos = this.geometry.positions[adjacentVertex]!;
        
        const distance = borderPos.distanceTo(adjacentPos);
        
        if (distance < threshold) {
          // border vertex로 병합 (adjacentVertex를 borderVertex로)
          this.geometry.mergeVertices(borderVertex, adjacentVertex);
          mergeCount++;
          
          // adjacentVertex가 border vertex였다면 제거
          if (borderVertexSet.has(adjacentVertex)) {
            const idx = this.borderVertexIndices.indexOf(adjacentVertex);
            if (idx !== -1) {
              this.borderVertexIndices.splice(idx, 1);
              borderVertexSet.delete(adjacentVertex);
            }
          }
        }
      }
    }
    
    console.log(`  1단계 완료: ${mergeCount}개 정점 병합`);
    
    // 1단계 후 정리: mergeVertices가 다른 border 정점들도 삭제했을 수 있으므로 정리
    this.borderVertexIndices = this.borderVertexIndices.filter(idx => {
      const isValid = this.geometry.positions[idx] !== null;
      if (!isValid) {
        console.log("1단계 정리: 삭제된 border 제거:", idx);
        borderVertexSet.delete(idx);
      }
      return isValid;
    });
    
    // === 2단계: Border Edge Projection ===
    console.log("  2단계: Border edge projection 시작");
    let projectionCount = 0;
    
    // Border edges 생성 (정점 인덱스만 저장, borderIdx는 동적으로 계산)
    const borderEdges: Array<{ v1: number; v2: number }> = [];
    for (let i = 0; i < this.borderVertexIndices.length; i++) {
      const v1 = this.borderVertexIndices[i];
      const v2 = this.borderVertexIndices[(i + 1) % this.borderVertexIndices.length];
      borderEdges.push({ v1, v2 });
    }
    
    // 각 border edge에 대해 인접 face 처리
    for (const { v1, v2 } of borderEdges) {
      // 엣지가 유효한지 확인
      const pos1 = this.geometry.positions[v1];
      const pos2 = this.geometry.positions[v2];
      if (!pos1 || !pos2) continue;
      
      // 이 엣지를 포함하는 면들 찾기
      const facesWithEdge = this.geometry.findFacesWithEdge(v1, v2);
      
      for (const face of facesWithEdge) {
        // Opposite vertex 찾기 (v1, v2가 아닌 나머지)
        const oppositeVertex = face.find(idx => idx !== v1 && idx !== v2);
        if (oppositeVertex === undefined) continue;
        
        // 이미 border vertex면 스킵
        if (borderVertexSet.has(oppositeVertex)) continue;
        
        const oppositePos = this.geometry.positions[oppositeVertex];
        if (!oppositePos) continue;
        
        // Opposite vertex에서 border edge까지 projection 계산
        const { distance, projection, t } = this.projectPointToEdge(oppositePos, pos1, pos2);
        
        if (distance < threshold) {
          // Opposite vertex의 노멀 계산 (엣지 노멀 보간)
          const normal1 = this.geometry.normals[v1]!;
          const normal2 = this.geometry.normals[v2]!;
          const newNormal = new THREE.Vector3().lerpVectors(normal1, normal2, t).normalize();
          
          // Opposite vertex를 projection 위치로 이동
          this.geometry.setVertex(oppositeVertex, projection, newNormal);
          
          // borderVertexIndices에 삽입 (v1과 v2 사이에)
          // 현재 borderVertexIndices에서 v1의 위치를 찾아서 그 다음에 삽입
          const currentV1Idx = this.borderVertexIndices.indexOf(v1);
          if (currentV1Idx !== -1) {
            this.borderVertexIndices.splice(currentV1Idx + 1, 0, oppositeVertex);
            borderVertexSet.add(oppositeVertex);
          }
          
          // 해당 face는 이제 degenerate (넓이 0) - 즉시 삭제
          this.geometry.removeFace(face[0], face[1], face[2]);
          
          projectionCount++;
        }
      }
    }
    
    console.log(`  2단계 완료: ${projectionCount}개 정점 projection`);
    
    // 2단계 후 최종 정리: 삭제된 정점이 혹시 남아있는지 확인
    const beforeFinalCleanup = this.borderVertexIndices.length;
    this.borderVertexIndices = this.borderVertexIndices.filter(idx => {
      const isValid = this.geometry.positions[idx] !== null;
      if (!isValid) {
        console.log("2단계 정리: 삭제된 border 제거:", idx);
        borderVertexSet.delete(idx);
      }
      return isValid;
    });
    console.log(`  2단계 정리: ${beforeFinalCleanup - this.borderVertexIndices.length}개 삭제된 정점 제거`);
    console.log(`  최종 경계 정점 수: ${this.borderVertexIndices.length}`);

    // 현재 borderVertexIndices의 모든 정점에 debug point 추가 (빨강)
    if (this.debugScene) {
      for (const idx of this.borderVertexIndices) {
        const pos = this.geometry.positions[idx];
        if (pos) {
          this._addDebugPoint(pos, 0xff0000, 0.0008); // 약간 작은 구로 표시
        }
      }
    }
  }

  /**
   * 디버깅용 점 추가
   */
  private _addDebugPoint(position: THREE.Vector3, color: number = 0xff0000, size: number = 0.001): void {
    if (!this.debugScene) return;

    const geometry = new THREE.SphereGeometry(size, 4, 4);
    const material = new THREE.MeshBasicMaterial({ color });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(position);
    this.debugScene.add(sphere);
    this.debugObjects.push(sphere);
  }

  /**
   * 디버깅용 엣지 라인 추가
   */
  private _addDebugEdge(start: THREE.Vector3, end: THREE.Vector3, color: number = 0xffff00, lineWidth: number = 1): void {
    if (!this.debugScene) return;

    const points = [start, end];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
      color, 
      linewidth: lineWidth,
      depthTest: false, // 항상 보이도록
      transparent: true,
      opacity: 0.8
    });
    const line = new THREE.Line(geometry, material);
    this.debugScene.add(line);
    this.debugObjects.push(line);
  }

  /**
   * 디버깅 오브젝트 제거
   */
  clearDebugObjects(): void {
    if (!this.debugScene) return;

    for (const obj of this.debugObjects) {
      this.debugScene.remove(obj);
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    }
    this.debugObjects = [];
  }

  /**
   * 현재 상태를 플리퍼가 기대하는 형태로 반환
   */
  getWorkingData(): WorkingData {
    // InformedGeometry를 compact하여 삭제된 정점 제거
    const { geometry: compacted, vertexMap } = this.geometry.compact();

    // borderVertexIndices 재매핑
    const newBorderVertexIndices = this.borderVertexIndices.map(index => vertexMap.get(index)!);

    return {
      borderVertexIndices: newBorderVertexIndices,
      geometry: compacted
    };
  }
}
