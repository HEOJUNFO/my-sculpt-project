// src/utils/InformedGeometry.ts
// 메시 데이터를 일관성 있게 관리하는 InformedGeometry 클래스

import * as THREE from "three";

/**
 * 메시 기하학 데이터를 일관성 있게 관리하는 클래스
 * - positions: Vector3 | null 배열 (삭제된 정점은 null)
 * - normals: Vector3 | null 배열
 * - faces: Map으로 관리 (중복 방지, winding 방향 유지)
 * - edges: adjacency map (자동 동기화)
 * - vertexFaces는 관리하지 않음 (edges를 통해 필요시 계산)
 * 
 * Invariant: 정점이 존재하면 edges에 빈 Set이라도 반드시 존재
 */
export class InformedGeometry {
  positions: (THREE.Vector3 | null)[];
  normals: (THREE.Vector3 | null)[];
  faces: Map<string, [number, number, number]>; // key: 정렬된 인덱스, value: 원본 순서
  edges: Map<number, Set<number>>; // adjacency map

  constructor() {
    this.positions = [];
    this.normals = [];
    this.faces = new Map();
    this.edges = new Map();
  }

  // ============================================================================
  // 생성 및 변환
  // ============================================================================

  /**
   * BufferGeometry로부터 InformedGeometry 생성
   */
  static fromBufferGeometry(geometry: THREE.BufferGeometry): InformedGeometry {
    const informed = new InformedGeometry();

    const positionAttr = geometry.attributes.position;
    const normalAttr = geometry.attributes.normal;
    const indexAttr = geometry.index;

    if (!positionAttr) {
      throw new Error("fromBufferGeometry: position attribute가 없습니다.");
    }

    // 정점 데이터 복사
    const vertexCount = positionAttr.count;
    for (let i = 0; i < vertexCount; i++) {
      const position = new THREE.Vector3(
        positionAttr.getX(i),
        positionAttr.getY(i),
        positionAttr.getZ(i)
      );

      let normal = null;
      if (normalAttr) {
        normal = new THREE.Vector3(
          normalAttr.getX(i),
          normalAttr.getY(i),
          normalAttr.getZ(i)
        );
      }

      informed.positions.push(position);
      informed.normals.push(normal);
      informed.edges.set(i, new Set()); // Invariant: 빈 Set이라도 존재
    }

    // 면 데이터 복사
    if (indexAttr) {
      const indices = indexAttr.array;
      for (let i = 0; i < indices.length; i += 3) {
        informed.addFace(indices[i], indices[i + 1], indices[i + 2]);
      }
    }

    return informed;
  }

  /**
   * BufferGeometry로 변환
   * 주의: 호출 전 compact()로 null 정점 제거 필요
   * 사용: geometry.compact().geometry.toBufferGeometry()
   */
  toBufferGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();

    const positions = this.positions.flatMap((p) =>
      p ? [p.x, p.y, p.z] : [0, 0, 0]
    );
    const normals = this.normals.flatMap((n) =>
      n ? [n.x, n.y, n.z] : [0, 0, 1]
    );
    const indices = Array.from(this.faces.values()).flatMap((face) => face);

    // BufferGeometry 설정
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3)
    );
    geometry.setIndex(indices);

    return geometry;
  }

  /**
   * 복사본 생성
   */
  clone(): InformedGeometry {
    const cloned = new InformedGeometry();

    // positions와 normals 복사
    cloned.positions = this.positions.map((p) => (p ? p.clone() : null));
    cloned.normals = this.normals.map((n) => (n ? n.clone() : null));

    // faces 복사
    for (const [key, face] of this.faces) {
      cloned.faces.set(key, [...face] as [number, number, number]);
    }

    // edges 복사
    for (const [vertex, neighbors] of this.edges) {
      cloned.edges.set(vertex, new Set(neighbors));
    }

    return cloned;
  }

  // ============================================================================
  // 정점 관리
  // ============================================================================

  /**
   * 새 정점 추가
   */
  addVertex(position: THREE.Vector3, normal: THREE.Vector3): number {
    const index = this.positions.length;
    this.positions.push(position.clone());
    this.normals.push(normal.clone());
    this.edges.set(index, new Set()); // Invariant 유지
    return index;
  }

  /**
   * 정점 삭제 (null로 표시)
   */
  deleteVertex(index: number): void {
    if (index < 0 || index >= this.positions.length) {
      return;
    }

    this.positions[index] = null;
    this.normals[index] = null;

    // 이 정점과 연결된 모든 면 제거
    const facesToRemove = this.findFacesWithVertex(index);
    for (const face of facesToRemove) {
      this.removeFace(face[0], face[1], face[2]);
    }

    // edges에서 제거
    this.edges.delete(index);
  }

  /**
   * 정점 위치와 노멀 설정
   */
  setVertex(
    index: number,
    position: THREE.Vector3,
    normal: THREE.Vector3
  ): void {
    if (index < 0 || index >= this.positions.length) {
      throw new Error(`setVertex: 유효하지 않은 인덱스 ${index}`);
    }

    this.positions[index] = position.clone();
    this.normals[index] = normal.clone();
  }

  /**
   * 정점 정보 가져오기
   */
  getVertex(
    index: number
  ): { position: THREE.Vector3; normal: THREE.Vector3 } | null {
    if (index < 0 || index >= this.positions.length) {
      return null;
    }

    const pos = this.positions[index];
    const nor = this.normals[index];

    if (pos === null || nor === null) {
      return null;
    }

    return { position: pos, normal: nor };
  }

  // ============================================================================
  // 면 관리 (edges 자동 동기화)
  // ============================================================================

  /**
   * 면 추가 (edges 자동 업데이트)
   * @returns 추가 성공시 true, 이미 존재하면 false
   */
  addFace(v1: number, v2: number, v3: number): boolean {
    const key = this.makeFaceKey([v1, v2, v3]);

    // 이미 존재하는 면인지 확인
    if (this.faces.has(key)) {
      return false;
    }

    // 면 추가 (원본 순서 유지)
    this.faces.set(key, [v1, v2, v3]);

    // edges 업데이트
    this.addEdge(v1, v2);
    this.addEdge(v2, v3);
    this.addEdge(v3, v1);

    return true;
  }

  /**
   * 면 제거 (edges 자동 업데이트)
   * @returns 제거 성공시 true, 없으면 false
   */
  removeFace(v1: number, v2: number, v3: number): boolean {
    const key = this.makeFaceKey([v1, v2, v3]);

    if (!this.faces.has(key)) {
      return false;
    }

    this.faces.delete(key);

    // edges 업데이트 (다른 면이 공유하지 않으면 제거)
    this.removeEdgeIfNotShared(v1, v2);
    this.removeEdgeIfNotShared(v2, v3);
    this.removeEdgeIfNotShared(v3, v1);

    return true;
  }

  /**
   * 면 조회
   */
  getFace(v1: number, v2: number, v3: number): [number, number, number] | null {
    const key = this.makeFaceKey([v1, v2, v3]);
    return this.faces.get(key) || null;
  }

  /**
   * 면 존재 여부 확인
   */
  hasFace(v1: number, v2: number, v3: number): boolean {
    const key = this.makeFaceKey([v1, v2, v3]);
    return this.faces.has(key);
  }

  // ============================================================================
  // 고수준 헬퍼 (edges 기반 계산)
  // ============================================================================

  /**
   * 정점을 포함하는 모든 면 찾기 (O(degree²))
   */
  findFacesWithVertex(v: number): [number, number, number][] {
    const result: [number, number, number][] = [];
    const neighbors = this.edges.get(v);

    if (!neighbors || neighbors.size === 0) {
      return result;
    }

    const checked = new Set<string>();

    // 인접 정점들의 조합으로 면 찾기
    for (const n1 of neighbors) {
      for (const n2 of neighbors) {
        if (n1 >= n2) continue;

        const key = this.makeFaceKey([v, n1, n2]);
        if (!checked.has(key)) {
          checked.add(key);
          const face = this.faces.get(key);
          if (face) {
            result.push(face);
          }
        }
      }
    }

    return result;
  }

  /**
   * 엣지를 공유하는 면들 찾기 (O(degree))
   */
  findFacesWithEdge(v1: number, v2: number): [number, number, number][] {
    const result: [number, number, number][] = [];
    const neighbors1 = this.edges.get(v1)!;
    const neighbors2 = this.edges.get(v2)!;

    // v1과 v2 모두와 연결된 정점들 찾기
    for (const v3 of neighbors1) {
      if (v3 === v2) continue;
      if (neighbors2.has(v3)) {
        const face = this.getFace(v1, v2, v3);
        if (face) {
          result.push(face);
        }
      }
    }

    return result;
  }

  /**
   * 엣지를 공유하는 모든 면 제거
   */
  removeEdge(v1: number, v2: number): void {
    const facesToRemove = this.findFacesWithEdge(v1, v2);
    for (const face of facesToRemove) {
      this.removeFace(face[0], face[1], face[2]);
    }
  }

  /**
   * 두 정점을 병합 (v2를 v1로 병합, v1의 위치/노멀 유지)
   */
  mergeVertices(v1: number, v2: number): void {
    if (v1 === v2) return;

    // 정점 존재 확인
    if (this.positions[v1] === null || this.positions[v2] === null) {
      throw new Error(`mergeVertices: 유효하지 않은 정점 (v1=${v1}, v2=${v2})`);
    }

    // v2를 포함하는 모든 면을 v1로 변경
    const facesToUpdate = this.findFacesWithVertex(v2);
    const newFaces: Array<[number, number, number]> = [];

    for (const face of facesToUpdate) {
      // 면 제거
      this.removeFace(face[0], face[1], face[2]);

      // v2를 v1로 대체
      const newFace: [number, number, number] = [
        face[0] === v2 ? v1 : face[0],
        face[1] === v2 ? v1 : face[1],
        face[2] === v2 ? v1 : face[2],
      ];

      // 중복 정점이 있는 면은 추가하지 않음
      if (
        newFace[0] !== newFace[1] &&
        newFace[1] !== newFace[2] &&
        newFace[2] !== newFace[0]
      ) {
        newFaces.push(newFace);
      }
    }

    // 새 면들 추가
    for (const newFace of newFaces) {
      this.addFace(newFace[0], newFace[1], newFace[2]);
    }

    // v2 삭제
    this.positions[v2] = null;
    this.normals[v2] = null;
    this.edges.delete(v2);
  }

  // ============================================================================
  // 압축
  // ============================================================================

  /**
   * null 정점 제거 및 인덱스 재매핑
   */
  compact(): { geometry: InformedGeometry; vertexMap: Map<number, number> } {
    const compacted = new InformedGeometry();
    const vertexMap = new Map<number, number>();

    // null이 아닌 정점들만 복사
    for (let i = 0; i < this.positions.length; i++) {
      const pos = this.positions[i];
      const nor = this.normals[i];

      if (pos !== null && nor !== null) {
        const newIndex = compacted.positions.length;
        vertexMap.set(i, newIndex);
        compacted.positions.push(pos.clone());
        compacted.normals.push(nor.clone());
        compacted.edges.set(newIndex, new Set()); // Invariant 유지
      }
    }

    // 면들 재매핑하여 추가
    for (const face of this.faces.values()) {
      const [v0, v1, v2] = face;
      const mappedV0 = vertexMap.get(v0);
      const mappedV1 = vertexMap.get(v1);
      const mappedV2 = vertexMap.get(v2);

      if (
        mappedV0 !== undefined &&
        mappedV1 !== undefined &&
        mappedV2 !== undefined
      ) {
        compacted.addFace(mappedV0, mappedV1, mappedV2);
      }
    }

    // edges는 addFace에서 자동으로 생성됨
    return { geometry: compacted, vertexMap };
  }

  // ============================================================================
  // 유틸리티
  // ============================================================================

  /**
   * null이 아닌 정점 개수
   */
  getVertexCount(): number {
    let count = 0;
    for (const pos of this.positions) {
      if (pos !== null) count++;
    }
    return count;
  }

  /**
   * 면 개수
   */
  getFaceCount(): number {
    return this.faces.size;
  }

  /**
   * 면 키 생성 (정렬된 인덱스)
   */
  makeFaceKey(indices: number[]): string {
    const sorted = [...indices].sort((a, b) => a - b);
    return sorted.join("-");
  }

  // ============================================================================
  // Private 헬퍼
  // ============================================================================

  /**
   * 엣지 추가 (양방향)
   * Invariant: vertex가 존재하면 edges에 빈 Set이라도 존재
   */
  private addEdge(v1: number, v2: number): void {
    this.edges.get(v1)!.add(v2);
    this.edges.get(v2)!.add(v1);
  }

  /**
   * 엣지가 다른 면과 공유되지 않으면 제거
   */
  private removeEdgeIfNotShared(v1: number, v2: number): void {
    // 이 엣지를 공유하는 면이 있는지 확인
    const sharedFaces = this.findFacesWithEdge(v1, v2);

    // 공유하는 면이 없으면 엣지 제거
    if (sharedFaces.length === 0) {
      this.edges.get(v1)?.delete(v2);
      this.edges.get(v2)?.delete(v1);
    }
  }
}
