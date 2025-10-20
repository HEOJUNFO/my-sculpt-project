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

  constructor(originalGeometry: THREE.BufferGeometry) {
    this.geometry = InformedGeometry.fromBufferGeometry(originalGeometry);
    this.borderVertexIndices = [];
  }

  static performCutting(
    originalGeometry: THREE.BufferGeometry,
    selectedAreaPoints: {
      position: THREE.Vector3;
      normal: THREE.Vector3;
      faceIndex: number;
    }[],
    edgeMergeThreshold: number = 0.005,
  ) {
    const cutter = new MeshCutter(originalGeometry);
    const faceIndices = originalGeometry.getIndex()!.array;
    const borderPoints: DrawingPoint[] = selectedAreaPoints.map((point) => ({
      position: point.position,
      normal: point.normal,
      face: [
        faceIndices[point.faceIndex * 3],
        faceIndices[point.faceIndex * 3 + 1],
        faceIndices[point.faceIndex * 3 + 2],
      ],
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
    cutter.mergeShortEdges(edgeMergeThreshold);

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
        face: undefined,
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

    // candidate 중 endPoint가 포함되면 종료
    for (const face of candidateTriangles) {
      if (this._isTriangleContainsEndPoint(face, endDrawingPoint)) {
        return;
      }
    }

    // 교차점 찾기 + 교차 실패 시를 대비한 가장 가까운 후보 정점 트래킹
    let intersection: Intersection | null = null;
    const vertexCandidates: {vertexIndex: number, distance: number}[] = [];

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

      // endPoint를 face 평면에 투영 (THREE.Plane 사용)
      const endPointOnPlane = this._projectPointToFacePlane(face, endDrawingPoint.position);

      // 교차 실패 대비: edge의 각 정점과 start-endPointOnPlane 선분 간 최단거리 측정
      for (const vIdx of edgeVertexIndexes) {
        const candidatePos = this.geometry.positions[vIdx]!;
        vertexCandidates.push({vertexIndex: vIdx, distance: candidatePos.distanceTo(endPointOnPlane)});
      }

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
        break;
      }
    }

    if (!intersection) {
      // 교차 실패: 가장 가까운 후보 정점으로 우회 진행
      console.warn("교차점 찾기 실패: 가장 가까운 후보 정점으로 우회 진행", vertexCandidates);
      const vIndex = vertexCandidates.sort((a, b) => a.distance - b.distance)[0].vertexIndex;

      // 경계 인덱스에 삽입
      const newBorderIndex =
        this.borderVertexIndices.findIndex(
          (idx) => idx === startDrawingPoint.newVertexIndex
        ) + 1;
      this.borderVertexIndices.splice(newBorderIndex, 0, vIndex);

      // 기존 정점을 pseudoDrawingPoint로 사용하여 재귀 진행
      const fallbackPoint: DrawingPoint = {
        position: this.geometry.positions[vIndex]!,
        normal: this.geometry.normals[vIndex]!,
        newVertexIndex: vIndex,
      };

      this._edgeBetweenSelectedAreaPoints(fallbackPoint, endDrawingPoint);
      return;

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
   * 주어진 face의 평면으로 3D 포인트를 정사영
   */
  private _projectPointToFacePlane(
    face: [number, number, number],
    point: THREE.Vector3
  ): THREE.Vector3 {
    const a = this.geometry.positions[face[0]]!;
    const b = this.geometry.positions[face[1]]!;
    const c = this.geometry.positions[face[2]]!;

    const plane = new THREE.Plane().setFromCoplanarPoints(a, b, c);
    return plane.projectPoint(point, new THREE.Vector3());
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

    console.log(`${mergeCount}개 정점 병합`);

    this.borderVertexIndices = this.borderVertexIndices.filter((idx) => {
      const isValid = this.geometry.positions[idx] !== null;
      if (!isValid) {
        console.log("정리: 삭제된 border 제거:", idx);
        borderVertexSet.delete(idx);
      }
      return isValid;
    });


    // 임시적 조치: neighbor 적은 정점 제거
    for (let i = 0; i<this.geometry.positions.length; i++) {
      const neighbors = this.geometry.edges.get(i);
      if (neighbors && neighbors.size <= 1) {
        console.warn(`${i}번 정점 삭제: ${neighbors.size}개 인접 정점`);
        for (const neighbor of neighbors) {
          this.geometry.edges.get(neighbor)?.delete(i);
        }
        this.geometry.positions[i] = null;
        this.geometry.normals[i] = null;
        this.geometry.edges.delete(i);
      }
    }

    console.log("  3단계: Border face topology 재구성 시작");
    for (let i = 0; i < this.borderVertexIndices.length; i++) {
      const a = this.borderVertexIndices[i];
      const b =
        this.borderVertexIndices[(i + 1) % this.borderVertexIndices.length];
      const c =
        this.borderVertexIndices[(i + 2) % this.borderVertexIndices.length];

      // abc 면이 존재하는지 확인
      const abcFace = this.geometry.getFace(a, b, c);
      if (abcFace) {
        const d = this.findOppositeVertex(a, b, c, borderVertexSet);

        if (d !== null) {
          const windingDirection = this.checkEdgeWindingInFace(a, b, abcFace);
          this.geometry.removeFace(a, b, c);

          if(windingDirection) {
            this.geometry.addFace(a, b, d);
            this.geometry.addFace(b, c, d);
          } else {
            this.geometry.addFace(a, d, b);
            this.geometry.addFace(b, d, c);
          }
        }
      }
    }
  }

  /**
   * 엣지 winding direction 확인
   * v1 -> v2 순서가 face에서 유지되는지 확인
   */
  private checkEdgeWindingInFace(v1: number, v2: number, face: [number, number, number]): boolean {
    const [f1, f2, f3] = face;
    return (f1 === v1 && f2 === v2) || 
           (f2 === v1 && f3 === v2) || 
           (f3 === v1 && f1 === v2);
  }

  /**
   * 재귀적으로 반대편 정점을 찾는 함수
   * abc가 아닌 acd 면을 찾아 d를 리턴
   * 
   * @param a 첫 번째 정점
   * @param b 중간 정점 (제외할 정점)
   * @param c 세 번째 정점
   * @param borderVertexSet 경계 정점 집합
   * @returns 반대편 정점 인덱스 또는 null
   */
  private findOppositeVertex(
    a: number, 
    b: number, 
    c: number, 
    borderVertexSet: Set<number>
  ): number | null {
    // ac를 가지는 면들 찾기
    const facesWithAC = this.geometry.findFacesWithEdge(a, c);
    
    // abc가 아닌 면 찾기 (acd)
    const oppositeFace = facesWithAC.find(face => !face.includes(b));
    
    if (!oppositeFace) {
      return null; // d를 찾지 못함
    }
    
    // d 정점 찾기 (a, c가 아닌 정점)
    const d = oppositeFace.find(v => v !== a && v !== c);
    
    if (d === undefined) {
      return null;
    }
    
    // d가 경계점이 아니면 면 삭제하고 d 리턴
    if (!borderVertexSet.has(d)) {
      this.geometry.removeFace(oppositeFace[0], oppositeFace[1], oppositeFace[2]);
      return d;
    }
    
    // d가 경계점이면 재귀 호출
    // dac에 대해 호출
    const e1 = this.findOppositeVertex(d, a, c, borderVertexSet);
    
    if (e1 !== null) {
      const dacFace = this.geometry.getFace(d, a, c)!;
      const isDA = this.checkEdgeWindingInFace(d, a, dacFace);
      this.geometry.removeFace(...dacFace);
      
      if (isDA) {
        this.geometry.addFace(d, a, e1);
      } else {
        this.geometry.addFace(a, d, e1);
      }
      
      return e1;
    }
    
    // acd에 대해 호출
    const e2 = this.findOppositeVertex(a, c, d, borderVertexSet);
    
    if (e2 !== null) {
      const acdFace = this.geometry.getFace(a, c, d)!;
      const isCD = this.checkEdgeWindingInFace(c, d, acdFace);
      this.geometry.removeFace(...acdFace);
      
      if (isCD) {
        this.geometry.addFace(c, d, e2);
      } else {
        this.geometry.addFace(d, c, e2);
      }
      
      return e2;
    }
    
    // 둘 다 null이면 null 리턴
    return null;
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
