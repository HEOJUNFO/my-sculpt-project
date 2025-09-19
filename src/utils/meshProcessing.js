// src/utils/meshProcessing.js
import * as THREE from 'three';

/**
 * 경계 정점들로부터 내부 면들을 BFS로 추출하는 함수
 * @param {Float32Array} vertices - 정점 배열
 * @param {Uint32Array} indices - 인덱스 배열
 * @param {Array} vertexFaceMap - 정점과 면의 관계 맵
 * @param {Array} borderVertexIndices - 경계 정점들의 인덱스
 * @returns {Object} { usedVertices, usedFaces, center, closestVertexIndex }
 */
export function extractInnerFacesFromBorder(vertices, indices, vertexFaceMap, borderVertexIndices) {
  // 경계 내의 면만 추출
  const usedVertices = new Set(borderVertexIndices);
  const usedFaces = new Set();
  const queue = [];

  // 내부 vertex 찾기
  // 1. 경계 vertex들의 평균 위치 계산
  const center = new THREE.Vector3();
  for (const vertexIndex of borderVertexIndices) {
    center.add(new THREE.Vector3(
      vertices[vertexIndex * 3],
      vertices[vertexIndex * 3 + 1],
      vertices[vertexIndex * 3 + 2]
    ));
  }
  center.divideScalar(borderVertexIndices.length);

  // 2. 평균 위치에 가장 가까운 vertex 찾기
  let closestVertexIndex = -1;
  let minDistance = Infinity;

  for (let i = 0; i < vertices.length / 3; i++) {
    // 이미 경계에 있는 vertex는 건너뛰기
    if (borderVertexIndices.includes(i)) continue;
    
    const vertexPos = new THREE.Vector3(
      vertices[i * 3],
      vertices[i * 3 + 1],
      vertices[i * 3 + 2]
    );
    
    const distance = vertexPos.distanceTo(center);
    if (distance < minDistance) {
      minDistance = distance;
      closestVertexIndex = i;
    }
  }

  // 3. 가장 가까운 vertex를 시작점으로 사용
  usedVertices.add(closestVertexIndex);
  queue.push(closestVertexIndex);

  // BFS로 내부 면 찾기
  while (queue.length > 0) {
    const vertexIndex = queue.shift();
    
    // 이 vertex를 사용하는 모든 face들 확인
    for (const faceIndex of vertexFaceMap[vertexIndex]) {
      if (usedFaces.has(faceIndex)) continue;
      
      // face의 모든 vertex들 확인
      const faceVertices = [
        indices[faceIndex * 3],
        indices[faceIndex * 3 + 1],
        indices[faceIndex * 3 + 2]
      ];
      
      // face 추가
      usedFaces.add(faceIndex);
      
      // 새로운 vertex들을 큐에 추가
      for (const v of faceVertices) {
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
