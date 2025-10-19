// src/utils/meshProcessing.ts
import * as THREE from "three";
import { InformedGeometry } from "./InformedGeometry.js";

export interface InnerFacesResult {
  usedVertices: Set<number>;
  usedFaces: Array<[number, number, number]>;
}

/**
 * 경계 정점들로부터 내부 면들을 BFS로 추출하는 함수
 * @param geometry - InformedGeometry 객체
 * @param borderVertexIndices - 경계 정점들의 인덱스
 * @returns 내부 면 추출 결과
 */
export function extractInnerFacesFromBorder(
  geometry: InformedGeometry,
  borderVertexIndices: number[]
): InnerFacesResult {
  // 경계 내의 면만 추출
  const usedVertices = new Set<number>(borderVertexIndices);
  const usedFaces: Array<[number, number, number]> = [];
  const usedFaceKeys = new Set<string>();
  const queue: number[] = [];

  // 내부 vertex 찾기
  // 1. 경계 vertex들의 평균 위치 계산
  const center = new THREE.Vector3();
  for (const vertexIndex of borderVertexIndices) {
    const pos = geometry.positions[vertexIndex];
    if (pos) {
      center.add(pos);
    }
  }
  center.divideScalar(borderVertexIndices.length);

  // 2. 평균 위치에 가장 가까운 vertex 찾기
  let closestVertexIndex = -1;
  let minDistance = Infinity;

  for (let i = 0; i < geometry.positions.length; i++) {
    // 이미 경계에 있는 vertex는 건너뛰기
    if (borderVertexIndices.includes(i)) continue;

    const pos = geometry.positions[i];
    if (!pos) continue;

    const distance = pos.distanceTo(center);
    if (distance < minDistance) {
      minDistance = distance;
      closestVertexIndex = i;
    }
  }

  if (closestVertexIndex === -1) {
    throw new Error('내부 정점을 찾을 수 없습니다.');
  }

  // 3. 가장 가까운 vertex를 시작점으로 사용
  usedVertices.add(closestVertexIndex);
  queue.push(closestVertexIndex);

  // BFS로 내부 면 찾기
  while (queue.length > 0) {
    const vertexIndex = queue.shift()!;

    // 이 vertex를 사용하는 모든 face들 확인
    const faces = geometry.findFacesWithVertex(vertexIndex);

    for (const face of faces) {
      const faceKey = geometry.makeFaceKey(face);

      // 이미 처리한 면이면 건너뛰기
      if (usedFaceKeys.has(faceKey)) continue;

      // face 추가
      usedFaceKeys.add(faceKey);
      usedFaces.push(face);

      // 새로운 vertex들을 큐에 추가
      for (const v of face) {
        if (!usedVertices.has(v)) {
          usedVertices.add(v);
          queue.push(v);
        }
      }
    }
  }

  return {
    usedVertices,
    usedFaces,
  };
}
