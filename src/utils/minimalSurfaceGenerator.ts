// src/utils/minimalSurfaceGenerator.ts
// 통합 최소 곡면 생성기 - 적응형 세분화와 라플라시안 스무딩을 통한 고품질 최소 곡면 메시 생성

import * as THREE from "three";

// 타입 정의
export interface MinimalSurfaceConfig {
  edgeLengthMin: number;
  edgeLengthMax: number;
  stepCount: number;
  smoothIterations: number;
}

// 엣지 정보를 위한 타입 정의
interface EdgeInfo {
  v1: number;
  v2: number;
  length: number;
}

export class MinimalSurfaceGenerator {
  private config: MinimalSurfaceConfig;
  private vertices: THREE.Vector3[];
  private fixedVerticeCount: number;
  private faces: Map<string, [number, number, number]>;
  private adjacencyMap: Map<number, Set<number>>;
  private deletedVertices: Set<number>;

  constructor(
    boundaryPoints: THREE.Vector3[],
    config: Partial<MinimalSurfaceConfig> = {}
  ) {
    this.vertices = [...boundaryPoints];
    this.fixedVerticeCount = boundaryPoints.length;
    this.faces = new Map();
    this.adjacencyMap = new Map();
    this.deletedVertices = new Set();
    this.config = {
      edgeLengthMin: 0.005,
      edgeLengthMax: 0.01,
      stepCount: 10,
      smoothIterations: 30,
      ...config,
    };
  }

  public generate() {
    this.createInitialTriangleFan();
    this.smoothAndSubdivide();
    return {
      vertices: this.vertices,
      fixedVerticeCount: this.fixedVerticeCount,
      faces: Array.from(this.faces.values()),
    };
  }

  private createInitialTriangleFan() {
    const center = new THREE.Vector3();
    for (const vertex of this.vertices) {
      center.add(vertex);
    }
    center.divideScalar(this.fixedVerticeCount);
    this.vertices.push(center);

    const centerIndex = this.vertices.length - 1;

    // adjacency map과 faces 생성
    // adjacency map 정합성 체크를 위해서는 육각형 그리고 양방향 연결 그려볼 것
    this.adjacencyMap.set(
      0,
      new Set<number>([this.fixedVerticeCount - 1, 1, centerIndex])
    );
    this.addFace([this.fixedVerticeCount - 1, 0, centerIndex]);

    for (let i = 1; i < this.fixedVerticeCount; i++) {
      const set = new Set<number>([i - 1, i + 1, centerIndex]);
      this.adjacencyMap.set(i, set);
      this.addFace([i - 1, i, centerIndex]);
    }
    this.adjacencyMap.get(this.fixedVerticeCount - 1)!.add(0);

    const centerNeighbors = new Set<number>(
      Array(this.fixedVerticeCount)
        .fill(0)
        .map((_, i) => i)
    );
    this.adjacencyMap.set(centerIndex, centerNeighbors);
  }

  private addFace(face: [number, number, number]): void {
    // 키는 오름차순으로 정렬된 인덱스들
    const sortedIndices = [...face].sort((a, b) => a - b);
    const key = sortedIndices.join("-");

    // 값은 원래 방향 유지
    this.faces.set(key, face);
  }

  private removeFace(face: [number, number, number]): void {
    // 키는 오름차순으로 정렬된 인덱스들
    const sortedIndices = [...face].sort((a, b) => a - b);
    const key = sortedIndices.join("-");

    if (!this.faces.delete(key)) {
      throw new Error("removeFace: 유효하지 않은 면");
    }
  }

  private smoothAndSubdivide() {
    try{
      for (let i = 0; i < this.config.stepCount; i++) {
      this.performAdaptiveSubdivision(this.config.edgeLengthMin);
      this.verifyAdjacencyAndDeletedVertices();
      this.performLaplacianSmoothing(this.config.smoothIterations);
      this.mergeShortEdges(this.config.edgeLengthMax);
      this.verifyAdjacencyAndDeletedVertices();
      this.performLaplacianSmoothing(this.config.smoothIterations);
    }
    } catch (error) {
      console.log(this)
      throw error;
    }
  }

  private verifyAdjacencyAndDeletedVertices() {
    // adjacency map이 있으면 deletedVertices에는 없어야하고, deletedVertices에 있으면 adjacency map에는 없어야 함.
    const adjacencySet = new Set<number>(this.adjacencyMap.keys());
    const deletedVerticesSet = new Set<number>(this.deletedVertices);
    for (const vertexIndex of adjacencySet) {
      if (deletedVerticesSet.has(vertexIndex)) {
        throw new Error("verifyAdjacencyAndDeletedVertices: 유효하지 않은 인접 리스트" + vertexIndex);
      }
    }
    for (const vertexIndex of deletedVerticesSet) {
      if (adjacencySet.has(vertexIndex)) {
        throw new Error("verifyAdjacencyAndDeletedVertices: 유효하지 않은 인접 리스트" + vertexIndex);
      }
    }
  }

  private performLaplacianSmoothing(iterations: number) {
    let vertices = this.vertices;
    for (let iter = 0; iter < iterations; iter++) {
      vertices = vertices.map((vertex, index) => {
        if (index < this.fixedVerticeCount || this.deletedVertices.has(index))
          return vertex;
        const neighbors = this.adjacencyMap.get(index);
        if (!neighbors || neighbors.size === 0){
          console.error("performLaplacianSmoothing: 유효하지 않은 정점", {
            index,
            neighbors,
          });
          return vertex;
        }
        const centroid = new THREE.Vector3();
        for (const neighborIndex of neighbors) {
          centroid.add(vertices[neighborIndex]);
        }
        centroid.divideScalar(neighbors.size);
        return centroid;
      });
    }
    this.vertices = vertices;
  }

  private performAdaptiveSubdivision(lengthThreshold: number) {
    const longEdges = this.findLongEdges(lengthThreshold);
    for (const edge of longEdges) {
      this.perform2To4Subdivision(edge);
    }
  }

  private findLongEdges(lengthThreshold: number): [number, number][] {
    const longEdges: [number, number][] = [];

    // adjacency map을 순회하며 엣지 정보 수집
    for (const [vertexIndex, neighbors] of this.adjacencyMap) {
      for (const neighborIndex of neighbors) {
        if (neighborIndex < vertexIndex) continue;

        // 경계 엣지는 제외 (고정된 정점들 사이의 엣지)
        if (
          vertexIndex < this.fixedVerticeCount &&
          neighborIndex < this.fixedVerticeCount
        ) {
          continue;
        }

        // 엣지 길이 계산
        const length = this.vertices[vertexIndex].distanceTo(
          this.vertices[neighborIndex]
        );

        if (length > lengthThreshold) {
          longEdges.push([vertexIndex, neighborIndex]);
        }
      }
    }

    return longEdges;
  }

  private perform2To4Subdivision(edge: [number, number]) {
    const [v1, v2] = edge;

    // 엣지 중점 계산
    const midpoint = new THREE.Vector3()
      .addVectors(this.vertices[v1], this.vertices[v2])
      .multiplyScalar(0.5);

    // 새로운 정점 추가
    this.vertices.push(midpoint);
    const c = this.vertices.length - 1;

    // 엣지를 공유하는 두 면 찾기
    const sharedFaces = this.findSharedFaces(v1, v2);
    const windingDirection = this.checkWindingDirection(v1, v2, sharedFaces[0]);

    const [faceA, faceB] = windingDirection
      ? sharedFaces
      : sharedFaces.reverse();
    
    if(!faceA || !faceB) {
      console.error("perform2To4Subdivision: 유효하지 않은 면", {v1, v2, sharedFaces});
      return;
    }

    // 기존 면들 제거
    this.removeFace(faceA);
    this.removeFace(faceB);

    // 4개의 새로운 면 추가
    // faceA에서 v1, v2가 아닌 정점 찾기
    const a = faceA.find((v) => v !== v1 && v !== v2)!;

    // faceB에서 v1, v2가 아닌 정점 찾기
    const b = faceB.find((v) => v !== v1 && v !== v2)!;

    console.log("subdivide", { v1, v2, a, b, c });

    // 4개의 새로운 면 생성
    // TODO: 방향 고려
    this.addFace([v1, c, a]);
    this.addFace([c, v2, a]);
    this.addFace([v2, c, b]);
    this.addFace([c, v1, b]);

    // 인접 리스트 업데이트
    // 원래 edge 없애고 새 vertex에서부터 4개의 edge 추가
    this.adjacencyMap.get(v1)!.delete(v2);
    this.adjacencyMap.get(v2)!.delete(v1);

    const newVertexneighbors = new Set<number>([v1, v2, a, b]);
    this.adjacencyMap.set(c, newVertexneighbors);

    this.adjacencyMap.get(v1)!.add(c);
    this.adjacencyMap.get(v2)!.add(c);
    this.adjacencyMap.get(a)!.add(c);
    this.adjacencyMap.get(b)!.add(c);
  }

  private findSharedFaces(v1: number, v2: number): [number, number, number][] {
    const sharedFaces: [number, number, number][] = [];

    for (const face of this.faces.values()) {
      const [f1, f2, f3] = face;

      if (
        (f1 === v1 || f2 === v1 || f3 === v1) &&
        (f1 === v2 || f2 === v2 || f3 === v2)
      ) {
        sharedFaces.push(face);
      }
    }

    return sharedFaces;
  }

  private checkWindingDirection(
    v1: number,
    v2: number,
    face: [number, number, number]
  ): boolean {
    const [f1, f2, f3] = face;
    if (
      (f1 === v1 && f2 === v2) ||
      (f2 === v1 && f3 === v2) ||
      (f3 === v1 && f1 === v2)
    ) {
      return true;
    }
    return false;
  }

  /**
   * 짧은 엣지들을 병합하여 메시를 단순화합니다.
   * Priority queue를 사용하여 가장 짧은 엣지부터 순차적으로 병합합니다.
   */
  public mergeShortEdges(threshold: number): void {
    // 모든 엣지 수집
    const edgeQueue = this.collectAllEdges();

    // 길이 기준으로 정렬
    edgeQueue.sort((a, b) => a.length - b.length);

    // 짧은 엣지들을 순차적으로 병합
    while (edgeQueue.length > 0) {
      const { v1, v2, length } = edgeQueue.shift()!;

      // 임계값보다 긴 엣지가 나오면 종료
      if (length >= threshold) {
        break;
      }

      // 경계 엣지는 제외
      if (v1 < this.fixedVerticeCount && v2 < this.fixedVerticeCount) {
        continue;
      }

      this.mergeEdge(Math.max(v1, v2), Math.min(v1, v2), edgeQueue);
    }
  }

  /**
   * 모든 엣지를 수집하여 반환합니다.
   */
  private collectAllEdges(): EdgeInfo[] {
    const edgeQueue: EdgeInfo[] = [];

    for (const [vertexIndex, neighbors] of this.adjacencyMap) {
      for (const neighborIndex of neighbors) {
        if (neighborIndex < vertexIndex) continue;

        // 경계 엣지는 제외 (고정된 정점들 사이의 엣지)
        if (
          vertexIndex < this.fixedVerticeCount &&
          neighborIndex < this.fixedVerticeCount
        ) {
          continue;
        }

        const length = this.vertices[vertexIndex].distanceTo(
          this.vertices[neighborIndex]
        );

        edgeQueue.push({
          v1: vertexIndex,
          v2: neighborIndex,
          length: length,
        });
      }
    }

    return edgeQueue;
  }

  /**
   * 두 정점을 병합합니다.
   * v1을 v2로 병합하고, v1을 삭제된 정점으로 표시합니다.
   */
  private mergeEdge(v1: number, v2: number, edgeQueue: EdgeInfo[]) {
    console.log("mergeEdge", { v1, v2 });
    // 공유하는 면들 제거, v1을 v2로 변경
    if (v1 === v2) {
      return;
    }
    const facesToRemove = [];
    const facesToReAdd = [];
    for (const face of this.faces.values()) {
      if (face.includes(v1)) {
        facesToRemove.push(face);
        if (!face.includes(v2)) {
          const faceToReAdd = [...face] as [number, number, number];
          faceToReAdd[faceToReAdd.indexOf(v1)] = v2;
          facesToReAdd.push(faceToReAdd);
        }
      }
    }

    for (const face of facesToRemove) {
      this.removeFace(face);
    }
    for (const face of facesToReAdd) {
      this.addFace(face);
    }

    // v1의 모든 인접 정점들을 v2에 연결
    const v1Neighbors = this.adjacencyMap.get(v1)!;
    const v2Neighbors = this.adjacencyMap.get(v2)!;
    console.log("v1Neighbors", [...v1Neighbors]);
    for (const neighbor of v1Neighbors) {
      if (neighbor !== v2) {
        // v1의 인접 정점들을 v2에 연결
        v2Neighbors.add(neighbor);
        const neighborNeighbors = this.adjacencyMap.get(neighbor)!;
        neighborNeighbors.delete(v1);
        neighborNeighbors.add(v2);
      }
    }
    // v1을 삭제된 정점으로 표시
    this.deletedVertices.add(v1);

    // v1과 v2 사이의 연결 제거
    v2Neighbors.delete(v1);

    // v1의 인접성 맵 제거
    this.adjacencyMap.delete(v1);

    // 병합된 정점과 관련된 모든 엣지들의 길이 재계산
    for (const edge of edgeQueue) {
      if (edge.v1 === v1) edge.v1 = v2;
      if (edge.v2 === v1) edge.v2 = v2;
      if (edge.v1 === v2 || edge.v2 === v2) {
        edge.length = this.vertices[edge.v1].distanceTo(this.vertices[edge.v2]);
      }
    }

    edgeQueue.sort((a, b) => a.length - b.length);
    this.validateEdgeQueueVertexRemoved(edgeQueue, v1);
  }

  validateEdgeQueueVertexRemoved(edgeQueue: EdgeInfo[], removedVertex: number) {
    for (const edge of edgeQueue) {
      if (edge.v1 === removedVertex || edge.v2 === removedVertex) {
        throw new Error(
          `validateEdgeQueueVertexRemoved: 유효하지 않은 엣지 ${removedVertex} -> ${edge.v1} or ${edge.v2}`
        );
      }
    }
  }
}
