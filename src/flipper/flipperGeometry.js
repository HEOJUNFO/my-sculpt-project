// src/flipper/flipperGeometry.js
import * as THREE from 'three';
import { refs } from '../modelManager.js';
import { getFlipperState, setFlipperMesh, updateFlipperInfoText } from './flipperDrawing.js';

/**
 * 플리퍼 생성
 */
export function generateFlipper() {
  const { selectedAreaPoints, drawingPoints, flipperThickness } = getFlipperState();
  
  if (selectedAreaPoints.length < 3) {
    console.warn('플리퍼 생성을 위한 영역이 정의되지 않았습니다.');
    updateFlipperInfoText('먼저 플리퍼 영역을 정의해주세요.');
    return false;
  }
  
  // 로딩 메시지 표시
  updateFlipperInfoText('플리퍼를 생성하는 중...');
  
  try {
    // 1. 모든 경계점 수집
    const boundaryPoints = [];
    selectedAreaPoints.forEach(point => {
      boundaryPoints.push(point.clone());
    });
    
    // 2. 평균 노멀 계산
    const averageNormal = new THREE.Vector3();
    drawingPoints.forEach(pointData => {
      averageNormal.add(pointData.normal);
    });
    
    // 유효한 노멀 확인
    if (averageNormal.length() < 0.001) {
      averageNormal.set(0, 0, 1);
    } else {
      averageNormal.normalize();
    }
    
    // 3. 평균 노멀과 무게중심을 이용하여 평면 생성
    const centroid = new THREE.Vector3();
    boundaryPoints.forEach(point => {
      centroid.add(point);
    });
    centroid.divideScalar(boundaryPoints.length);
    
    // 4. 튼튼한 축으로 경계점을 평면에 투영
    let tempUp = new THREE.Vector3(0, 1, 0);
    if (Math.abs(averageNormal.dot(tempUp)) > 0.9) {
      tempUp.set(1, 0, 0);
    }
    
    const tangent1 = new THREE.Vector3().crossVectors(averageNormal, tempUp).normalize();
    const tangent2 = new THREE.Vector3().crossVectors(averageNormal, tangent1).normalize();
    
    // 경계점을 2D로 투영
    const boundary2D = [];
    boundaryPoints.forEach(point => {
      const relativePos = point.clone().sub(centroid);
      const x = relativePos.dot(tangent1);
      const y = relativePos.dot(tangent2);
      boundary2D.push(new THREE.Vector2(x, y));
    });
    
    // 5. 경계 정리
    const cleanBoundary2D = [];
    const minPointDistance = 0.0001;
    
    for (let i = 0; i < boundary2D.length; i++) {
      const p1 = boundary2D[i];
      const p2 = boundary2D[(i + 1) % boundary2D.length];
      
      cleanBoundary2D.push(p1);
      
      if (p1.distanceTo(p2) < minPointDistance) {
        continue;
      }
    }
    
    // 고밀도 삼각형 그리드 사용
    let triangles = createDenseTriangleGrid(cleanBoundary2D, 80);
    
    // 6. 삼각분할을 위한 3D 정점 생성 (개선된 레이캐스트)
    const frontPositions = new Float32Array(triangles.length * 3);
    const frontNormals = new Float32Array(triangles.length * 3);
    
    // 정점 맵 - 원래 점 인덱스에서 노멀이 있는 정점으로
    const vertexMap = new Map();
    
    for (let i = 0; i < triangles.length; i++) {
      const point2D = triangles[i];
      
      // 3D 정점 가져오기 또는 생성
      let vertex3D;
      const key = `${point2D.x.toFixed(6)},${point2D.y.toFixed(6)}`;
      
      if (vertexMap.has(key)) {
        vertex3D = vertexMap.get(key);
      } else {
        // 2D 점을 3D로 변환
        const worldPoint = centroid.clone()
          .add(tangent1.clone().multiplyScalar(point2D.x))
          .add(tangent2.clone().multiplyScalar(point2D.y));
        
        // 다양한 오프셋으로 다중 레이캐스팅
        const raycastOffsets = [0.1, 0.2, 0.05, 0.15];
        let bestIntersect = null;
        let bestDistance = Infinity;
        
        for (const offset of raycastOffsets) {
          const rayStart = worldPoint.clone().add(averageNormal.clone().multiplyScalar(offset));
          const rayDir = averageNormal.clone().negate();
          
          const raycaster = new THREE.Raycaster(rayStart, rayDir);
          raycaster.firstHitOnly = true;
          const intersects = raycaster.intersectObject(refs.targetMesh, true);
          
          if (intersects.length > 0) {
            const distance = intersects[0].distance;
            if (distance < bestDistance) {
              bestDistance = distance;
              bestIntersect = intersects[0];
            }
          }
        }
        
        if (bestIntersect) {
          // 최적의 교차점과 노멀 사용
          vertex3D = {
            position: bestIntersect.point.clone(),
            normal: bestIntersect.face.normal.clone().transformDirection(refs.targetMesh.matrixWorld),
            point2D: new THREE.Vector2(point2D.x, point2D.y)
          };
          // z-fighting 방지
          vertex3D.position.addScaledVector(vertex3D.normal, 0.002);
        } else {
          // 대체 - 평균 노멀이 있는 평면 점 사용
          vertex3D = {
            position: worldPoint.clone(),
            normal: averageNormal.clone(),
            point2D: new THREE.Vector2(point2D.x, point2D.y)
          };
        }
        
        vertexMap.set(key, vertex3D);
      }
      
      // 앞면의 위치와 노멀 설정
      frontPositions[i * 3] = vertex3D.position.x;
      frontPositions[i * 3 + 1] = vertex3D.position.y;
      frontPositions[i * 3 + 2] = vertex3D.position.z;
      
      frontNormals[i * 3] = vertex3D.normal.x;
      frontNormals[i * 3 + 1] = vertex3D.normal.y;
      frontNormals[i * 3 + 2] = vertex3D.normal.z;
    }
    
    // 경계로부터의 거리를 계산할 2D 도형 생성
    const shape2D = new THREE.Shape();
    if (cleanBoundary2D.length > 0) {
      shape2D.moveTo(cleanBoundary2D[0].x, cleanBoundary2D[0].y);
      for (let i = 1; i < cleanBoundary2D.length; i++) {
        shape2D.lineTo(cleanBoundary2D[i].x, cleanBoundary2D[i].y);
      }
      shape2D.closePath();
    }
    
    // 경계로부터의 최대 거리 찾기
    const centroid2D = new THREE.Vector2();
    cleanBoundary2D.forEach(point => {
      centroid2D.add(point);
    });
    centroid2D.divideScalar(cleanBoundary2D.length);
    
    let maxDistanceFromBorder = 0;
    cleanBoundary2D.forEach(point => {
      const distToBoundary = point.distanceTo(centroid2D);
      maxDistanceFromBorder = Math.max(maxDistanceFromBorder, distToBoundary);
    });
    
    // 7. 가변 압출로 뒷면 위치 생성
    const backPositions = new Float32Array(frontPositions.length);
    const backNormals = new Float32Array(frontNormals.length);
    
    // 각 정점에 대한 경계로부터의 거리 계산
    const distancesFromBorder = [];
    
    for (let i = 0; i < triangles.length; i++) {
      const point2D = triangles[i];
      
      let minDistToBorder = Number.MAX_VALUE;
      
      for (let j = 0; j < cleanBoundary2D.length; j++) {
        const p1 = cleanBoundary2D[j];
        const p2 = cleanBoundary2D[(j + 1) % cleanBoundary2D.length];
        
        const distToSegment = distanceToLineSegment(
          point2D.x, point2D.y,
          p1.x, p1.y,
          p2.x, p2.y
        );
        
        minDistToBorder = Math.min(minDistToBorder, distToSegment);
      }
      
      const normalizedDistance = Math.min(minDistToBorder / maxDistanceFromBorder, 1);
      distancesFromBorder[i] = normalizedDistance;
    }
    
    // 유효하지 않은 삼각형 필터링
    const validTriangleIndices = [];
    for (let i = 0; i < triangles.length / 3; i++) {
      const idx1 = i * 3;
      const idx2 = idx1 + 1;
      const idx3 = idx1 + 2;
      
      let hasInvalidCoord = false;
      
      for (let j = 0; j < 3; j++) {
        const x = frontPositions[(idx1 + j) * 3];
        const y = frontPositions[(idx1 + j) * 3 + 1];
        const z = frontPositions[(idx1 + j) * 3 + 2];
        
        if (isNaN(x) || isNaN(y) || isNaN(z)) {
          hasInvalidCoord = true;
          break;
        }
      }
      
      if (!hasInvalidCoord) {
        validTriangleIndices.push(idx1, idx2, idx3);
      }
    }
    
    // 경계로부터의 거리에 따라 압출 적용
    for (let i = 0; i < frontPositions.length; i += 3) {
      const vertexIndex = i / 3;
      const nx = frontNormals[i];
      const ny = frontNormals[i + 1];
      const nz = frontNormals[i + 2];
      
      const normalizedDistance = distancesFromBorder[vertexIndex];
       
      // 시그모이드 함수로 크기 조정
      const sigmoidValue = normalizedDistance / (0.1 + normalizedDistance);
      const scaleFactor = sigmoidValue / (1 / (0.1 + 1));
      
      // flipperThickness 사용
      const extrusionAmount = (flipperThickness * 0.01) * scaleFactor;
    
      // 가변 두께로 노멀을 따라 오프셋
      backPositions[i] = frontPositions[i] + nx * extrusionAmount;
      backPositions[i + 1] = frontPositions[i + 1] + ny * extrusionAmount;
      backPositions[i + 2] = frontPositions[i + 2] + nz * extrusionAmount;
      
      // 뒷면을 위한 노멀 반전
      backNormals[i] = -nx;
      backNormals[i + 1] = -ny;
      backNormals[i + 2] = -nz;
    }
    
    // 정점과 노멀 수집
    const positionArray = [];
    const normalArray = [];
    
    // 앞면 정점 추가
    for (let i = 0; i < frontPositions.length; i++) {
      positionArray.push(frontPositions[i]);
      normalArray.push(frontNormals[i]);
    }
    
    // 뒷면 정점 추가
    for (let i = 0; i < backPositions.length; i++) {
      positionArray.push(backPositions[i]);
      normalArray.push(backNormals[i]);
    }
    
    // 측면 생성
    const frontFaceCount = triangles.length / 3;
    const vertexCount = frontPositions.length / 3;
    
    // 엣지 맵으로 엣지 추적
    const edgeMap = new Map();
    
    // 앞면의 엣지 찾기
    for (let i = 0; i < frontFaceCount; i++) {
      const idx0 = i * 3;
      const idx1 = idx0 + 1;
      const idx2 = idx0 + 2;
      
      // 유효하지 않은 정점 건너뛰기
      let hasInvalidCoord = false;
      for (let j = 0; j < 3; j++) {
        const x = frontPositions[(idx0 + j) * 3];
        const y = frontPositions[(idx0 + j) * 3 + 1];
        const z = frontPositions[(idx0 + j) * 3 + 2];
        
        if (isNaN(x) || isNaN(y) || isNaN(z)) {
          hasInvalidCoord = true;
          break;
        }
      }
      
      if (hasInvalidCoord) continue;
      
      // 세 개의 모든 엣지 확인
      addEdge(idx0, idx1);
      addEdge(idx1, idx2);
      addEdge(idx2, idx0);
    }
    
    // 엣지 추가 도우미 함수
    function addEdge(a, b) {
      const edgeKey = a < b ? `${a}-${b}` : `${b}-${a}`;
      
      if (edgeMap.has(edgeKey)) {
        // 내부 엣지 제거 (두 번 나타남)
        edgeMap.delete(edgeKey);
      } else {
        // 새 엣지 추가
        edgeMap.set(edgeKey, [a, b]);
      }
    }
    
    // 남은 엣지가 경계 엣지
    for (const [key, [a, b]] of edgeMap.entries()) {
      // 인덱스 검증
      if (a >= frontPositions.length / 3 || b >= frontPositions.length / 3) {
        continue;
      }
      
      // 앞면 정점
      const ax = frontPositions[a * 3];
      const ay = frontPositions[a * 3 + 1];
      const az = frontPositions[a * 3 + 2];
      
      const bx = frontPositions[b * 3];
      const by = frontPositions[b * 3 + 1];
      const bz = frontPositions[b * 3 + 2];
      
      // 뒷면 정점
      const cx = backPositions[a * 3];
      const cy = backPositions[a * 3 + 1];
      const cz = backPositions[a * 3 + 2];
      
      const dx = backPositions[b * 3];
      const dy = backPositions[b * 3 + 1];
      const dz = backPositions[b * 3 + 2];
      
      // 유효하지 않은 정점 건너뛰기
      if (isNaN(ax) || isNaN(ay) || isNaN(az) || 
          isNaN(bx) || isNaN(by) || isNaN(bz) ||
          isNaN(cx) || isNaN(cy) || isNaN(cz) ||
          isNaN(dx) || isNaN(dy) || isNaN(dz)) {
        continue;
      }
      
      // 벽면 노멀 계산
      const edgeDir = new THREE.Vector3(
        bx - ax,
        by - ay,
        bz - az
      ).normalize();
      
      const faceNormal = new THREE.Vector3(
        frontNormals[a * 3],
        frontNormals[a * 3 + 1],
        frontNormals[a * 3 + 2]
      );
      
      const wallNormal = new THREE.Vector3().crossVectors(edgeDir, faceNormal).normalize();
      
      // 유효한 노멀 확인
      if (isNaN(wallNormal.x) || isNaN(wallNormal.y) || isNaN(wallNormal.z) ||
          wallNormal.length() < 0.001) {
        wallNormal.copy(averageNormal);
      }
      
      // 첫 번째 삼각형: a, b, c
      positionArray.push(ax, ay, az);
      positionArray.push(bx, by, bz);
      positionArray.push(cx, cy, cz);
      
      for (let i = 0; i < 3; i++) {
        normalArray.push(wallNormal.x, wallNormal.y, wallNormal.z);
      }
      
      // 두 번째 삼각형: b, d, c
      positionArray.push(bx, by, bz);
      positionArray.push(dx, dy, dz);
      positionArray.push(cx, cy, cz);
      
      for (let i = 0; i < 3; i++) {
        normalArray.push(wallNormal.x, wallNormal.y, wallNormal.z);
      }
    }
    
    // Float32Arrays 생성
    const positions = new Float32Array(positionArray);
    const normals = new Float32Array(normalArray);
    
    // 지오메트리 생성
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    
    // 부드러운 음영을 위한 정점 노멀 계산
    geometry.computeVertexNormals();
    
    // 원래 모델과 유사한 재질 생성
    const surfaceMaterial = new THREE.MeshMatcapMaterial({
      matcap: refs.matcaps['Red Wax'],
      side: THREE.DoubleSide,
      flatShading: false,
    });
    
    // 메시 생성
    const surfaceMesh = new THREE.Mesh(geometry, surfaceMaterial);
    surfaceMesh.userData.isFlipperMesh = true;
    refs.scene.add(surfaceMesh);
    
    // 참조 저장
    setFlipperMesh(surfaceMesh);
    
    // 성공 메시지 업데이트
    updateFlipperInfoText(`플리퍼가 생성되었습니다. 두께: ${flipperThickness}mm`);
    
    // 완료 버튼 활성화
    const completeBtn = document.getElementById('btn-flipper-complete');
    if (completeBtn) {
      completeBtn.disabled = false;
      completeBtn.classList.add('active');
    }
    
    console.log('플리퍼 생성 완료');
    return true;
  } catch (error) {
    console.error('플리퍼 생성 중 오류 발생:', error);
    updateFlipperInfoText('플리퍼 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
    return false;
  }
}

/**
 * 고밀도 삼각형 그리드 생성 함수
 */
function createDenseTriangleGrid(boundaryPoints, gridSize = 80) {
  // 경계 상자 찾기
  const minX = Math.min(...boundaryPoints.map(p => p.x));
  const maxX = Math.max(...boundaryPoints.map(p => p.x));
  const minY = Math.min(...boundaryPoints.map(p => p.y));
  const maxY = Math.max(...boundaryPoints.map(p => p.y));
  
  // 지정된 해상도로 조밀한 그리드 생성
  const stepX = (maxX - minX) / gridSize;
  const stepY = (maxY - minY) / gridSize;
  
  // 정점 생성
  const vertices = [];
  
  // 다각형 내부의 그리드 점 생성
  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const x = minX + i * stepX;
      const y = minY + j * stepY;
      const point = new THREE.Vector2(x, y);
      
      if (isPointInPolygon(point, boundaryPoints)) {
        vertices.push(point.clone());
      }
    }
  }
  
  // 경계 점 추가
  boundaryPoints.forEach(p => {
    vertices.push(p.clone());
  });
  
  // Delaunay 삼각분할 생성
  const delaunay = computeDelaunay(vertices);
  
  // 경계 내부의 삼각형 필터링
  const triangleVertices = [];
  
  for (let i = 0; i < delaunay.length; i += 3) {
    const p0 = delaunay[i];
    const p1 = delaunay[i + 1];
    const p2 = delaunay[i + 2];
    
    // 삼각형 중심 계산
    const centroid = new THREE.Vector2(
      (p0.x + p1.x + p2.x) / 3,
      (p0.y + p1.y + p2.y) / 3
    );
    
    // 중심이 경계 내부에 있으면 삼각형 유지
    if (isPointInPolygon(centroid, boundaryPoints)) {
      triangleVertices.push(p0, p1, p2);
    }
  }
  
  return triangleVertices;
}

/**
 * 간단한 Delaunay 삼각분할
 */
function computeDelaunay(points) {
  // 모든 점을 포함하는 슈퍼 삼각형 생성
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));
  
  const dx = maxX - minX;
  const dy = maxY - minY;
  const dmax = Math.max(dx, dy) * 2;
  
  const superTriangle = [
    new THREE.Vector2(minX - dmax, minY - dmax),
    new THREE.Vector2(minX + dx + dmax, minY - dmax),
    new THREE.Vector2(minX - dmax, minY + dy + dmax)
  ];
  
  // 슈퍼 삼각형으로 시작
  const triangles = [superTriangle[0], superTriangle[1], superTriangle[2]];
  
  // 점을 하나씩 추가
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    
    // 해당 점이 외접원에 포함되는 삼각형 찾기
    const badTriangles = [];
    
    for (let j = 0; j < triangles.length; j += 3) {
      const t0 = triangles[j];
      const t1 = triangles[j + 1];
      const t2 = triangles[j + 2];
      
      if (isPointInCircumcircle(p, t0, t1, t2)) {
        badTriangles.push(j);
      }
    }
    
    // 다각형 구멍의 경계 찾기
    const polygon = [];
    
    for (let j = 0; j < badTriangles.length; j++) {
      const t = badTriangles[j];
      
      // 삼각형의 각 엣지
      const edges = [
        [triangles[t], triangles[t + 1]],
        [triangles[t + 1], triangles[t + 2]],
        [triangles[t + 2], triangles[t]]
      ];
      
      // 엣지가 다른 잘못된 삼각형과 공유되는지 확인
      for (const edge of edges) {
        let isShared = false;
        
        for (let k = 0; k < badTriangles.length; k++) {
          if (j === k) continue;
          
          const otherT = badTriangles[k];
          const otherEdges = [
            [triangles[otherT], triangles[otherT + 1]],
            [triangles[otherT + 1], triangles[otherT + 2]],
            [triangles[otherT + 2], triangles[otherT]]
          ];
          
          for (const otherEdge of otherEdges) {
            if ((edge[0] === otherEdge[0] && edge[1] === otherEdge[1]) ||
                (edge[0] === otherEdge[1] && edge[1] === otherEdge[0])) {
              isShared = true;
              break;
            }
          }
          
          if (isShared) break;
        }
        
        if (!isShared) {
          polygon.push(edge[0], edge[1]);
        }
      }
    }
    
    // 잘못된 삼각형 제거
    badTriangles.sort((a, b) => b - a);
    
    for (const t of badTriangles) {
      triangles.splice(t, 3);
    }
    
    // 점과 다각형 엣지를 연결하는 새 삼각형 추가
    for (let j = 0; j < polygon.length; j += 2) {
      triangles.push(polygon[j], polygon[j + 1], p);
    }
  }
  
  // 슈퍼 삼각형과 정점을 공유하는 삼각형 제거
  const result = [];
  
  for (let i = 0; i < triangles.length; i += 3) {
    const t0 = triangles[i];
    const t1 = triangles[i + 1];
    const t2 = triangles[i + 2];
    
    const usesSuperTriangle = 
      superTriangle.some(sp => 
        (t0.x === sp.x && t0.y === sp.y) || 
        (t1.x === sp.x && t1.y === sp.y) || 
        (t2.x === sp.x && t2.y === sp.y)
      );
    
    if (!usesSuperTriangle) {
      result.push(t0, t1, t2);
    }
  }
  
  return result;
}

/**
 * 점이 삼각형의 외접원 내부에 있는지 확인
 */
function isPointInCircumcircle(p, a, b, c) {
  const ax = a.x - p.x;
  const ay = a.y - p.y;
  const bx = b.x - p.x;
  const by = b.y - p.y;
  const cx = c.x - p.x;
  const cy = c.y - p.y;
  
  const det = 
    (ax * ax + ay * ay) * (bx * cy - cx * by) -
    (bx * bx + by * by) * (ax * cy - cx * ay) +
    (cx * cx + cy * cy) * (ax * by - bx * ay);
  
  return det > 0;
}

/**
 * 점이 다각형 내부에 있는지 확인
 */
function isPointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }
  
  return inside;
}

/**
 * 점과 선분 사이의 거리 계산 함수
 */
function distanceToLineSegment(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = -1;
  
  if (len_sq !== 0)
    param = dot / len_sq;

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;
  
  return Math.sqrt(dx * dx + dy * dy);
}