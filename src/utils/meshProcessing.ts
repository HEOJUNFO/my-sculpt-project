// src/utils/meshProcessing.ts
import * as THREE from 'three';
import earcut from 'earcut';

// 타입 정의
export interface HoleFillingOptions {
  holeFillingMethod?: 'triangulate' | 'smooth';
}

export interface InnerFacesResult {
  usedVertices: Set<number>;
  usedFaces: Set<number>;
}

export interface HoleFillResult {
  newVertices: Float32Array;
  newNormals: Float32Array;
  newIndices: Uint32Array;
}

export interface ProjectionPlane {
  origin: THREE.Vector3;
  xAxis: THREE.Vector3;
  yAxis: THREE.Vector3;
  normal: THREE.Vector3;
}

/**
 * 경계 정점들로부터 내부 면들을 BFS로 추출하는 함수
 * @param vertices - 정점 배열
 * @param indices - 인덱스 배열
 * @param vertexFaceMap - 정점과 면의 관계 맵
 * @param borderVertexIndices - 경계 정점들의 인덱스
 * @returns 내부 면 추출 결과
 */
export function extractInnerFacesFromBorder(
  vertices: Float32Array,
  indices: Uint32Array,
  vertexFaceMap: number[][],
  borderVertexIndices: number[]
): InnerFacesResult {
  // 경계 내의 면만 추출
  const usedVertices = new Set<number>(borderVertexIndices);
  const usedFaces = new Set<number>();
  const queue: number[] = [];

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
    const vertexIndex = queue.shift()!;
    
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

/**
 * 구멍을 채우는 메시 재구성 함수
 * @param vertices - 정점 배열
 * @param normals - 노멀 배열
 * @param indices - 인덱스 배열
 * @param borderVertexIndices - 경계 정점들의 인덱스
 * @param options - 옵션 (holeFillingMethod: 'triangulate' | 'smooth')
 * @returns 구멍 채우기 결과
 */
export function fillHole(
  vertices: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
  borderVertexIndices: number[],
  options: HoleFillingOptions = {}
): HoleFillResult {
  const { holeFillingMethod = 'triangulate' } = options;
  
  console.log(`구멍 채우기 시작: ${borderVertexIndices.length}개 경계 정점, 방법: ${holeFillingMethod}`);
  
  if (borderVertexIndices.length < 3) {
    console.warn('구멍 채우기 실패: 경계 정점이 3개 미만');
    return { newVertices: vertices, newNormals: normals, newIndices: indices };
  }
  
  // 경계 정점들의 위치와 노멀 수집
  const borderVertices: THREE.Vector3[] = [];
  const borderNormals: THREE.Vector3[] = [];
  
  for (const vertexIndex of borderVertexIndices) {
    borderVertices.push(new THREE.Vector3(
      vertices[vertexIndex * 3],
      vertices[vertexIndex * 3 + 1],
      vertices[vertexIndex * 3 + 2]
    ));
    borderNormals.push(new THREE.Vector3(
      normals[vertexIndex * 3],
      normals[vertexIndex * 3 + 1],
      normals[vertexIndex * 3 + 2]
    ));
  }
  
  if (holeFillingMethod === 'triangulate') {
    return triangulateHole(vertices, normals, indices, borderVertices, borderNormals, borderVertexIndices);
  } else if (holeFillingMethod === 'smooth') {
    return smoothHoleFill(vertices, normals, indices, borderVertices, borderNormals, borderVertexIndices);
  }
  
  // 기본값: 삼각분할
  return triangulateHole(vertices, normals, indices, borderVertices, borderNormals, borderVertexIndices);
}

/**
 * 삼각분할을 통한 구멍 채우기
 */
function triangulateHole(
  vertices: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
  borderVertices: THREE.Vector3[],
  borderNormals: THREE.Vector3[],
  borderVertexIndices: number[]
): HoleFillResult {
  console.log('=== 삼각분할 구멍 채우기 시작 ===');
  console.log('입력 데이터:', {
    verticesCount: vertices.length / 3,
    normalsCount: normals.length / 3,
    indicesCount: indices.length / 3,
    borderVerticesCount: borderVertices.length,
    borderVertexIndicesCount: borderVertexIndices.length
  });
  
  // 입력 데이터 유효성 검사 (스택 오버플로우 방지를 위해 반복문 사용)
  const originalVertexCount = vertices.length / 3;
  let maxBorderIndex = 0;
  for (let i = 0; i < borderVertexIndices.length; i++) {
    if (borderVertexIndices[i] > maxBorderIndex) {
      maxBorderIndex = borderVertexIndices[i];
    }
  }
  
  console.log('경계 인덱스 검증:', {
    maxBorderIndex,
    originalVertexCount,
    isValid: maxBorderIndex < originalVertexCount
  });
  
  if (maxBorderIndex >= originalVertexCount) {
    console.error(`구멍 채우기 실패: 경계 인덱스 범위 오류. 최대 인덱스: ${maxBorderIndex}, 버텍스 수: ${originalVertexCount}`);
    return { newVertices: vertices, newNormals: normals, newIndices: indices };
  }
  
  // 경계 정점들의 중심점 계산
  console.log('경계 정점 중심점 계산 시작...');
  const center = new THREE.Vector3();
  const centerNormal = new THREE.Vector3();
  
  for (let i = 0; i < borderVertices.length; i++) {
    center.add(borderVertices[i]);
    centerNormal.add(borderNormals[i]);
  }
  center.divideScalar(borderVertices.length);
  centerNormal.normalize();
  
  console.log('중심점 계산 완료:', {
    center: { x: center.x, y: center.y, z: center.z },
    centerNormal: { x: centerNormal.x, y: centerNormal.y, z: centerNormal.z }
  });
  
  // 중심점을 새로운 정점으로 추가
  const newVertices = Array.from(vertices);
  const newNormals = Array.from(normals);
  
  newVertices.push(center.x, center.y, center.z);
  newNormals.push(centerNormal.x, centerNormal.y, centerNormal.z);
  
  // 중심점의 인덱스는 새로운 정점이 추가된 후의 인덱스
  const centerVertexIndex = (newVertices.length / 3) - 1;
  
  console.log('중심점 정점 추가 완료:', {
    centerVertexIndex,
    newVerticesCount: newVertices.length / 3,
    newNormalsCount: newNormals.length / 3
  });
  
  // 경계 정점들을 중심점과 연결하여 삼각형 생성
  const newIndices = Array.from(indices);
  
  console.log('삼각형 생성 시작...');
  for (let i = 0; i < borderVertexIndices.length; i++) {
    const currentIndex = borderVertexIndices[i];
    const nextIndex = borderVertexIndices[(i + 1) % borderVertexIndices.length];
    
    // 삼각형 추가 (시계방향으로 정렬)
    newIndices.push(currentIndex, nextIndex, centerVertexIndex);
    
    if (i < 5) { // 처음 5개 삼각형만 로그 출력
      console.log(`삼각형 ${i + 1}: [${currentIndex}, ${nextIndex}, ${centerVertexIndex}]`);
    }
  }
  
  console.log('삼각형 생성 완료:', {
    trianglesAdded: borderVertexIndices.length,
    newIndicesCount: newIndices.length / 3,
    originalIndicesCount: indices.length / 3
  });
  
  // 최종 검증 (스택 오버플로우 방지를 위해 반복문 사용)
  console.log('최종 검증 시작...');
  const finalVertexCount = newVertices.length / 3;
  let maxFinalIndex = 0;
  for (let i = 0; i < newIndices.length; i++) {
    if (newIndices[i] > maxFinalIndex) {
      maxFinalIndex = newIndices[i];
    }
  }
  
  console.log('최종 검증 결과:', {
    finalVertexCount,
    maxFinalIndex,
    isValid: maxFinalIndex < finalVertexCount,
    trianglesAdded: borderVertexIndices.length,
    originalTriangles: indices.length / 3,
    finalTriangles: newIndices.length / 3
  });
  
  if (maxFinalIndex >= finalVertexCount) {
    console.error(`삼각분할 최종 검증 실패: 최대 인덱스 ${maxFinalIndex} >= 버텍스 수 ${finalVertexCount}`);
    console.log('샘플 인덱스:', newIndices.slice(-20)); // 마지막 20개 인덱스
    return { newVertices: vertices, newNormals: normals, newIndices: indices };
  }
  
  console.log('=== 삼각분할 구멍 채우기 완료 ===');
  return {
    newVertices: new Float32Array(newVertices),
    newNormals: new Float32Array(newNormals),
    newIndices: new Uint32Array(newIndices)
  };
}

/**
 * 스무스한 구멍 채우기 (고급 알고리즘)
 */
function smoothHoleFill(
  vertices: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
  borderVertices: THREE.Vector3[],
  borderNormals: THREE.Vector3[],
  borderVertexIndices: number[]
): HoleFillResult {
  // 경계 정점들을 2D로 투영
  const plane = createProjectionPlane(borderVertices);
  const projectedPoints = borderVertices.map(vertex => projectToPlane(vertex, plane));
  
  // Earcut을 사용한 삼각분할
  const flatPoints: number[] = [];
  for (const point of projectedPoints) {
    flatPoints.push(point.x, point.y);
  }
  
  const triangles = earcut(flatPoints, [], 2);
  
  // 새로운 정점과 인덱스 생성
  const newVertices = Array.from(vertices);
  const newNormals = Array.from(normals);
  const newIndices = Array.from(indices);
  
  // 삼각형들을 추가
  for (let i = 0; i < triangles.length; i += 3) {
    const v1 = borderVertexIndices[triangles[i]];
    const v2 = borderVertexIndices[triangles[i + 1]];
    const v3 = borderVertexIndices[triangles[i + 2]];
    
    // 삼각형 추가
    newIndices.push(v1, v2, v3);
  }
  
  console.log(`스무스 채우기 완료: ${triangles.length / 3}개 삼각형 추가`);
  
  return {
    newVertices: new Float32Array(newVertices),
    newNormals: new Float32Array(newNormals),
    newIndices: new Uint32Array(newIndices)
  };
}

/**
 * 투영 평면 생성
 */
function createProjectionPlane(vertices: THREE.Vector3[]): ProjectionPlane {
  // 첫 번째 정점을 기준으로 평면 생성
  const origin = vertices[0];
  
  // 두 개의 벡터로 평면의 좌표계 생성
  const v1 = new THREE.Vector3().subVectors(vertices[1], origin).normalize();
  const v2 = new THREE.Vector3().subVectors(vertices[2], origin).normalize();
  
  // 평면의 노멀 벡터
  const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
  
  // 평면의 좌표축
  const xAxis = v1;
  const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
  
  return { origin, xAxis, yAxis, normal };
}

/**
 * 3D 점을 평면에 투영
 */
function projectToPlane(point: THREE.Vector3, plane: ProjectionPlane): THREE.Vector2 {
  const relative = new THREE.Vector3().subVectors(point, plane.origin);
  return new THREE.Vector2(
    relative.dot(plane.xAxis),
    relative.dot(plane.yAxis)
  );
}
