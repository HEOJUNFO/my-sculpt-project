import * as THREE from "three";
import { InformedGeometry } from "./InformedGeometry";

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
  private geometry: InformedGeometry;
  private fixedVerticeCount: number;

  constructor(
    boundaryPoints: THREE.Vector3[],
    config: Partial<MinimalSurfaceConfig> = {}
  ) {
    this.geometry = new InformedGeometry();
    this.fixedVerticeCount = boundaryPoints.length;
    
    // 경계 정점들 추가
    for (const point of boundaryPoints) {
      this.geometry.addVertex(point, new THREE.Vector3(0, 0, 1)); // 임시 노멀
    }
    
    this.config = {
      edgeLengthMin: 0.002,
      edgeLengthMax: 0.008,
      stepCount: 8,
      smoothIterations: 10,
      ...config,
    };
  }

  public generate() {
    this.createInitialTriangleFan();
    this.smoothAndSubdivide();
    return this.createCompactedResult();
  }

  private createInitialTriangleFan() {
    // 중심점 계산
    const center = new THREE.Vector3();
    for (let i = 0; i < this.fixedVerticeCount; i++) {
      center.add(this.geometry.positions[i]!);
    }
    center.divideScalar(this.fixedVerticeCount);
    
    // 중심 정점 추가
    const centerIndex = this.geometry.addVertex(center, new THREE.Vector3(0, 0, 1));

    // 삼각형 팬 생성
    this.geometry.addFace(this.fixedVerticeCount - 1, 0, centerIndex);
    
    for (let i = 1; i < this.fixedVerticeCount; i++) {
      this.geometry.addFace(i - 1, i, centerIndex);
    }
  }

  private smoothAndSubdivide() {
    try {
      for (let i = 0; i < this.config.stepCount; i++) {
        this.performAdaptiveSubdivision(this.config.edgeLengthMin);
        this.performLaplacianSmoothing(this.config.smoothIterations);
        this.mergeShortEdges(this.config.edgeLengthMax);
        this.performLaplacianSmoothing(this.config.smoothIterations);
      }
    } catch (error) {
      throw error;
    }
  }

  private performLaplacianSmoothing(iterations: number) {
    for (let iter = 0; iter < iterations; iter++) {
      // 새로운 위치들을 먼저 계산 (동시에 업데이트하기 위해)
      const newPositions = new Map<number, THREE.Vector3>();
      
      for (let index = 0; index < this.geometry.positions.length; index++) {
        const position = this.geometry.positions[index];
        
        // 고정된 정점이거나 삭제된 정점은 건너뜀
        if (position === null || index < this.fixedVerticeCount) {
          continue;
        }
        
        const neighbors = this.geometry.edges.get(index);
        if (!neighbors || neighbors.size === 0) {
          console.error("performLaplacianSmoothing: 유효하지 않은 정점", {
            index,
            neighbors,
          });
          continue;
        }
        
        // 인접 정점들의 중심 계산
        const centroid = new THREE.Vector3();
        for (const neighborIndex of neighbors) {
          const neighborPos = this.geometry.positions[neighborIndex];
          if (neighborPos) {
            centroid.add(neighborPos);
          }
        }
        centroid.divideScalar(neighbors.size);
        
        newPositions.set(index, centroid);
      }
      
      // 새로운 위치로 업데이트
      for (const [index, newPosition] of newPositions) {
        this.geometry.positions[index] = newPosition;
      }
    }
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
    for (const [vertexIndex, neighbors] of this.geometry.edges) {
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
        const pos1 = this.geometry.positions[vertexIndex];
        const pos2 = this.geometry.positions[neighborIndex];
        
        if (pos1 && pos2) {
          const length = pos1.distanceTo(pos2);
          
          if (length > lengthThreshold) {
            longEdges.push([vertexIndex, neighborIndex]);
          }
        }
      }
    }

    return longEdges;
  }

  private perform2To4Subdivision(edge: [number, number]) {
    const [v1, v2] = edge;

    const pos1 = this.geometry.positions[v1];
    const pos2 = this.geometry.positions[v2];
    
    if (!pos1 || !pos2) return;

    // 엣지를 공유하는 두 면 찾기 (검증을 먼저 수행)
    const sharedFaces = this.geometry.findFacesWithEdge(v1, v2);
    
    if (sharedFaces.length !== 2) {
      console.error("perform2To4Subdivision: 유효하지 않은 면 개수", {
        v1,
        v2,
        sharedFacesCount: sharedFaces.length,
      });
      return;
    }

    // 검증 통과 후에만 새로운 정점 추가
    const midpoint = new THREE.Vector3()
      .addVectors(pos1, pos2)
      .multiplyScalar(0.5);

    const c = this.geometry.addVertex(midpoint, new THREE.Vector3(0, 0, 1));

    const windingDirection = this.checkWindingDirection(v1, v2, sharedFaces[0]);
    const [faceA, faceB] = windingDirection
      ? sharedFaces
      : sharedFaces.reverse();

    // 기존 면들 제거
    this.geometry.removeFace(faceA[0], faceA[1], faceA[2]);
    this.geometry.removeFace(faceB[0], faceB[1], faceB[2]);

    // 4개의 새로운 면 추가
    // faceA에서 v1, v2가 아닌 정점 찾기
    const a = faceA.find((v) => v !== v1 && v !== v2)!;

    // faceB에서 v1, v2가 아닌 정점 찾기
    const b = faceB.find((v) => v !== v1 && v !== v2)!;

    // 4개의 새로운 면 생성
    this.geometry.addFace(v1, c, a);
    this.geometry.addFace(c, v2, a);
    this.geometry.addFace(v2, c, b);
    this.geometry.addFace(c, v1, b);
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

      // 이미 삭제된 정점은 건너뛰기
      if (
        this.geometry.positions[v1] === null ||
        this.geometry.positions[v2] === null
      ) {
        continue;
      }

      // v1을 v2로 병합 (v1이 더 큰 인덱스)
      const toMerge = Math.max(v1, v2);
      const mergeInto = Math.min(v1, v2);
      
      this.geometry.mergeVertices(mergeInto, toMerge);

      // edgeQueue의 모든 엣지에서 toMerge를 mergeInto로 변경하고 길이 재계산
      for (const edge of edgeQueue) {
        if (edge.v1 === toMerge) edge.v1 = mergeInto;
        if (edge.v2 === toMerge) edge.v2 = mergeInto;
        
        // mergeInto가 관련된 엣지의 길이 재계산
        if (edge.v1 === mergeInto || edge.v2 === mergeInto) {
          const pos1 = this.geometry.positions[edge.v1];
          const pos2 = this.geometry.positions[edge.v2];
          if (pos1 && pos2) {
            edge.length = pos1.distanceTo(pos2);
          }
        }
      }

      // edgeQueue 재정렬
      edgeQueue.sort((a, b) => a.length - b.length);
    }
  }

  /**
   * 모든 엣지를 수집하여 반환합니다.
   */
  private collectAllEdges(): EdgeInfo[] {
    const edgeQueue: EdgeInfo[] = [];

    for (const [vertexIndex, neighbors] of this.geometry.edges) {
      for (const neighborIndex of neighbors) {
        if (neighborIndex < vertexIndex) continue;

        // 경계점을 포함한 엣지는 제외 (고정된 정점을 포함하는 엣지)
        if (
          vertexIndex < this.fixedVerticeCount ||
          neighborIndex < this.fixedVerticeCount
        ) {
          continue;
        }

        const pos1 = this.geometry.positions[vertexIndex];
        const pos2 = this.geometry.positions[neighborIndex];
        
        if (pos1 && pos2) {
          const length = pos1.distanceTo(pos2);
          
          edgeQueue.push({
            v1: vertexIndex,
            v2: neighborIndex,
            length: length,
          });
        }
      }
    }

    return edgeQueue;
  }

  private createCompactedResult() {
    // InformedGeometry의 compact 사용
    const { geometry: compacted } = this.geometry.compact();
    
    return {
      vertices: compacted.positions,
      fixedVerticeCount: this.fixedVerticeCount,
      faces: Array.from(compacted.faces.values()),
    };
  }
}
