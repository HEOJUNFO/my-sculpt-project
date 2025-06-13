// src/flipper/flipperGeometry.js
import * as THREE from 'three';
import { refs } from '../../models/modelManager.js'
import { getFlipperState, setFlipperMesh, updateFlipperInfoText } from './flipperDrawing.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import earcut from 'earcut';

/**
 * 플리퍼 생성
 */
export function generateFlipper() {
  const { drawingPoints, flipperThickness } = getFlipperState();
  const selectedAreaPoints = drawingPoints;

  if (selectedAreaPoints.length < 3) {
    console.warn('플리퍼 생성을 위한 영역이 정의되지 않았습니다.');
    updateFlipperInfoText('먼저 플리퍼 영역을 정의해주세요.');
    return false;
  }
  
  // 로딩 메시지 표시
  updateFlipperInfoText('플리퍼를 생성하는 중...');
  
  try {
    // 1. 원본 메시의 geometry 복사
    const originalGeometry = refs.targetMesh.geometry.clone();
    const positions = originalGeometry.attributes.position.array;
    const normals = originalGeometry.attributes.normal.array;
    const indices = originalGeometry.index ? originalGeometry.index.array : null;

    // 2. 새로운 정점과 면을 저장할 배열
    const newVertices = Array.from(positions); // 각 정점의 x, y, z 쌍
    const newNormals = Array.from(normals); // 각 정점 노말의 x, y, z 쌍
    const newIndices = Array.from(indices); // 각 삼각형의 정점 인덱스 저장. 3개씩 쌍
    const vertexFaceMap = Array.from({ length: newVertices.length / 3 }, () => []);
    for (let i = 0; i < newIndices.length / 3; i += 1) {
      const baseIndex = i * 3;
      vertexFaceMap[newIndices[baseIndex]].push(i);
      vertexFaceMap[newIndices[baseIndex+1]].push(i);
      vertexFaceMap[newIndices[baseIndex+2]].push(i);
    }
    const borderVertexIndices = [];

    // 3. 각 점에 대해 면 분할
    // 3.1 각 면에 속한 점들을 그룹화
    const facePointsMap = new Map(); // faceIndex -> points[]
    for (const point of selectedAreaPoints) {
      if (!facePointsMap.has(point.faceIndex)) {
        facePointsMap.set(point.faceIndex, []);
      }
      facePointsMap.get(point.faceIndex).push(point);
    }

    // 3.2 각 면에 대한 처리
    for (const [faceIndex, points] of facePointsMap) {
      // 면의 기하학적 정보 준비
      const baseIndex = faceIndex * 3;
      const vertexIndices = [indices[baseIndex], indices[baseIndex + 1], indices[baseIndex + 2]];
      const vertices = [
        new THREE.Vector3(newVertices[vertexIndices[0] * 3], newVertices[vertexIndices[0] * 3 + 1], newVertices[vertexIndices[0] * 3 + 2]),
        new THREE.Vector3(newVertices[vertexIndices[1] * 3], newVertices[vertexIndices[1] * 3 + 1], newVertices[vertexIndices[1] * 3 + 2]),
        new THREE.Vector3(newVertices[vertexIndices[2] * 3], newVertices[vertexIndices[2] * 3 + 1], newVertices[vertexIndices[2] * 3 + 2])
      ];

      // 로컬 좌표계 생성
      const normal = new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(vertices[1], vertices[0]),
        new THREE.Vector3().subVectors(vertices[2], vertices[0])
      ).normalize();
      const xAxis = new THREE.Vector3().subVectors(vertices[1], vertices[0]).normalize();
      const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();

      // 점들을 2D로 투영
      const points2D = points.map(point => {
        const v = new THREE.Vector3().subVectors(point.position, vertices[0]);
        return {
          x: v.dot(xAxis),
          y: v.dot(yAxis),
          originalPoint: point
        };
      });

      // 새로운 정점 추가 및 인덱스 매핑
      const newVertexIndices = new Map(); // originalPoint -> newVertexIndex
      for (const point of points) {
        const newVertexIndex = newVertices.length / 3;
        newVertexIndices.set(point, newVertexIndex);
        point.newVertexIndex = newVertexIndex;
        
        newVertices.push(point.position.x, point.position.y, point.position.z);
        newNormals.push(point.normal.x, point.normal.y, point.normal.z);
        borderVertexIndices.push(newVertexIndex);

        // vertexFaceMap 확장
        vertexFaceMap.push([]);
      }

      // Earcut을 위한 데이터 준비
      const flatPoints = [];
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
      // holes는 null, dims는 2, 그리고 원래 삼각형의 정점 수를 전달
      const triangles = earcut(flatPoints, [3], 2);

      // 1. 분할된 면들의 vertexIndex 3개 쌍들의 배열 만들기
      const newTriangles = [];
      for (let i = 0; i < triangles.length; i += 3) {
        const triangle = [
          triangles[i],
          triangles[i + 1],
          triangles[i + 2]
        ];
        
        const newTriangle = triangle.map(idx => {
          if (idx < 3) { // 원래 면의 정점
            return vertexIndices[idx];
          } else { // 새로운 점
            return newVertexIndices.get(points[idx - 3]);
          }
        });
        newTriangles.push(newTriangle);
      }

      // 2. 기존 면을 vertexFaceMap에서 제거
      for (const vertexIndex of vertexIndices) {
        vertexFaceMap[vertexIndex] = vertexFaceMap[vertexIndex].filter(f => f !== faceIndex);
      }

      // 3. 첫 번째 면은 newIndices에서 splice로 대체
      newIndices.splice(baseIndex, 3, ...newTriangles[0]);

      // 4. 첫 번째 면 꼭짓점들의 vertexFaceMap에 첫 번째 면 추가
      for (const vertexIndex of newTriangles[0]) {
        vertexFaceMap[vertexIndex].push(faceIndex);
      }

      // 5. 나머지 면들은 원래 방식대로 새로운 삼각형 추가 및 vertexFaceMap 업데이트
      for (let i = 1; i < newTriangles.length; i++) {
        const newFaceIndex = newIndices.length / 3;
        newIndices.push(...newTriangles[i]);
        
        for (const vertexIndex of newTriangles[i]) {
          if (!vertexFaceMap[vertexIndex]) {
            vertexFaceMap[vertexIndex] = [];
          }
          vertexFaceMap[vertexIndex].push(newFaceIndex);
        }
      }
    }

    /**
     * 삼각형이 endPoint를 포함하는지 확인
     */
    function isTriangleContainsEndPoint(faceIndex, endDrawingPoint) {
      const baseIndex = faceIndex * 3;
      return newIndices[baseIndex] === endDrawingPoint.newVertexIndex ||
            newIndices[baseIndex + 1] === endDrawingPoint.newVertexIndex || 
            newIndices[baseIndex + 2] === endDrawingPoint.newVertexIndex;
    }

    /**
     * 삼각형의 세 정점을 Vector3로 변환
     */
    function getTriangleVertices(faceIndex) {
      const baseIndex = faceIndex * 3;
      return [
        new THREE.Vector3(
          newVertices[newIndices[baseIndex] * 3],
          newVertices[newIndices[baseIndex] * 3 + 1],
          newVertices[newIndices[baseIndex] * 3 + 2]
        ),
        new THREE.Vector3(
          newVertices[newIndices[baseIndex + 1] * 3],
          newVertices[newIndices[baseIndex + 1] * 3 + 1],
          newVertices[newIndices[baseIndex + 1] * 3 + 2]
        ),
        new THREE.Vector3(
          newVertices[newIndices[baseIndex + 2] * 3],
          newVertices[newIndices[baseIndex + 2] * 3 + 1],
          newVertices[newIndices[baseIndex + 2] * 3 + 2]
        )
      ];
    }

    /**
     * 삼각형을 교차점으로 분할
     */
    function splitTriangleAtIntersection(triangleIndex, intersectionPoint, edge, intersectionPseudoDrawingPoint = null) {
      const vertexIndices = [newIndices[triangleIndex*3], newIndices[triangleIndex*3+1], newIndices[triangleIndex*3+2]];
      const otherVertexIndexIndex = vertexIndices.findIndex(idx => idx !== edge.startIndex && idx !== edge.endIndex);
      // 아래 3개가 삼각형의 정점 인덱스
      const otherVertexIndex = vertexIndices[otherVertexIndexIndex];
      const edgeStartIndex = vertexIndices[(otherVertexIndexIndex+1)%3];
      const edgeEndIndex = vertexIndices[(otherVertexIndexIndex+2)%3];

      

      let pseudoDrawingPoint;
      if (intersectionPseudoDrawingPoint !== null) {
        // 이미 생성된 교차점 정점 재사용
        pseudoDrawingPoint = intersectionPseudoDrawingPoint;
      } else {
        // 새로운 교차점 정점 생성
        const newVertexIndex = newVertices.length / 3;
        newVertices.push(intersectionPoint.x, intersectionPoint.y, intersectionPoint.z);

              
        // 엣지의 시작점과 끝점의 노말 보간
        const startNormal = new THREE.Vector3(
          newNormals[edgeStartIndex * 3],
          newNormals[edgeStartIndex * 3 + 1],
          newNormals[edgeStartIndex * 3 + 2]
        );
        const endNormal = new THREE.Vector3(
          newNormals[edgeEndIndex * 3],
          newNormals[edgeEndIndex * 3 + 1],
          newNormals[edgeEndIndex * 3 + 2]
        );
        
        // 교차점이 엣지의 어느 부분에 있는지 계산
        const edgeVector = new THREE.Vector3().subVectors(edge.end, edge.start);
        const intersectionVector = new THREE.Vector3().subVectors(intersectionPoint, edge.start);
        const t = intersectionVector.length() / edgeVector.length();
        
        // 노말 보간
        const newNormal = new THREE.Vector3().lerpVectors(startNormal, endNormal, t).normalize();
        newNormals.push(newNormal.x, newNormal.y, newNormal.z);

        
        pseudoDrawingPoint = {
          position: intersectionPoint,
          normal: newNormal,
          newVertexIndex
        };
        vertexFaceMap[pseudoDrawingPoint.newVertexIndex] = [];
        borderVertexIndices.push(newVertexIndex);
      }

      // 기존 삼각형을 첫 번째 삼각형으로 대체
      newIndices.splice(triangleIndex*3, 3, edgeStartIndex, pseudoDrawingPoint.newVertexIndex, otherVertexIndex);
      vertexFaceMap[edgeEndIndex] = vertexFaceMap[edgeEndIndex].filter(face => face !== triangleIndex);
      // 두 번째 삼각형 추가
      newIndices.push(pseudoDrawingPoint.newVertexIndex, edgeEndIndex, otherVertexIndex);
      const newTriangleIndex = newIndices.length / 3 - 1;
      vertexFaceMap[edgeEndIndex].push(newTriangleIndex);
      vertexFaceMap[otherVertexIndex].push(newTriangleIndex);
      vertexFaceMap[pseudoDrawingPoint.newVertexIndex].push(triangleIndex, newTriangleIndex);

      return {
        edgeStartIndex,
        edgeEndIndex,
        otherVertexIndex,
        pseudoDrawingPoint,
        splitTriangles: [triangleIndex, newTriangleIndex]
      };
    }

    function findAdjacentTriangle(edge, currentTriangle) {
      // edge의 첫 번째 정점에 연결된 모든 면들
      const facesWithStartVertex = vertexFaceMap[edge.startIndex];
      
      // 이 면들 중에서 edge의 두 번째 정점도 포함하고, currentTriangle이 아닌 면 찾기
      for (const faceIndex of facesWithStartVertex) {
        if (faceIndex === currentTriangle) continue;

        const faceVertexIndices = [
          newIndices[faceIndex * 3],
          newIndices[faceIndex * 3 + 1],
          newIndices[faceIndex * 3 + 2]
        ];
        
        // edge의 end 정점도 포함하는지 확인
        if (
            faceVertexIndices.includes(edge.endIndex)) {
          return faceIndex;
        }
      }
      
      return null;
    }

    /**
     * 두 점 사이 knife cut
     */
    function edgeBetweenSelectedAreaPoints(startDrawingPoint, endDrawingPoint, candidateTriangleFaceIndexes_unused) {
      const candidateTriangleFaceIndexes = vertexFaceMap[startDrawingPoint.newVertexIndex];
      // candidate 중 endPoint가 포함되면 종료
      for (const faceIndex of candidateTriangleFaceIndexes) {
        if (isTriangleContainsEndPoint(faceIndex, endDrawingPoint)) {
          return;
        }
      }

      // 교차점 찾기
      let intersection = null;
      
      for (const faceIndex of candidateTriangleFaceIndexes) {
        const edgeVertexIndexes = [newIndices[faceIndex*3], newIndices[faceIndex*3+1], newIndices[faceIndex*3+2]].filter(idx => idx !== startDrawingPoint.newVertexIndex);
        console.assert(edgeVertexIndexes.length === 2, 'edgeVertexIndexes.length !== 2');

        const edge = {
          start: new THREE.Vector3(
            newVertices[edgeVertexIndexes[0] * 3],
            newVertices[edgeVertexIndexes[0] * 3 + 1],
            newVertices[edgeVertexIndexes[0] * 3 + 2]
          ),
          end: new THREE.Vector3(
            newVertices[edgeVertexIndexes[1] * 3],
            newVertices[edgeVertexIndexes[1] * 3 + 1],
            newVertices[edgeVertexIndexes[1] * 3 + 2]
          ),
          startIndex: edgeVertexIndexes[0],
          endIndex: edgeVertexIndexes[1]
        }

        const endPointOnPlane = endDrawingPoint.position.clone();
      
        // 첫 번째 삼각형의 법선 벡터를 사용하여 평면 계산
        const vertices = getTriangleVertices(faceIndex);
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

        if(intersectionPosition) {
          intersection = {
            point: intersectionPosition,
            edge: edge,
            triangle: faceIndex
          }
          break;
        }

      }

      if (!intersection){
        throw new Error('교차점 찾기 실패');
      }

      // 엣지 반대편의 삼각형 찾기
      const otherTriangle = findAdjacentTriangle(intersection.edge, intersection.triangle);
      if(otherTriangle === null) {
        throw new Error('반대편 삼각형 찾기 실패');
      }

      // 교차된 삼각형 분할
      const splitResult = splitTriangleAtIntersection(
        intersection.triangle,
        intersection.point,
        intersection.edge
      );

      // 반대편 삼각형도 같은 방식으로 분할하되, 이미 생성된 교차점 정점 재사용
      const otherSplitResult = splitTriangleAtIntersection(
        otherTriangle,
        intersection.point,
        intersection.edge,
        splitResult.pseudoDrawingPoint  // 이미 생성된 교차점 정점 전달
      );

      // 이후 엣지 반대편의 쪼개진 두 삼각형을 candidate로 반복
      edgeBetweenSelectedAreaPoints(
        splitResult.pseudoDrawingPoint,
        endDrawingPoint,
        otherSplitResult.splitTriangles
      );
    }

    // 4. 연속된 점들 사이의 경로 찾기 및 면 분할
    for (let i = 0; i < selectedAreaPoints.length; i++) {
      const startDrawingPoint = selectedAreaPoints[i];
      const endDrawingPoint = selectedAreaPoints[(i + 1) % selectedAreaPoints.length];
      edgeBetweenSelectedAreaPoints(startDrawingPoint, endDrawingPoint, vertexFaceMap[startDrawingPoint.newVertexIndex]);
    }

    //5. 경계 내의 면만 추출
    const usedVertices = new Set(borderVertexIndices);
    const usedFaces = new Set();
    const queue = [];

    // 내부 vertex 찾기
    // 5.1. 경계 vertex들의 평균 위치 계산
    const center = new THREE.Vector3();
    for (const vertexIndex of borderVertexIndices) {
      center.add(new THREE.Vector3(
        newVertices[vertexIndex * 3],
        newVertices[vertexIndex * 3 + 1],
        newVertices[vertexIndex * 3 + 2]
      ));
    }
    center.divideScalar(borderVertexIndices.length);

    // 5.2. 평균 위치에 가장 가까운 vertex 찾기
    let closestVertexIndex = -1;
    let minDistance = Infinity;

    for (let i = 0; i < newVertices.length / 3; i++) {
      // 이미 경계에 있는 vertex는 건너뛰기
      if (borderVertexIndices.includes(i)) continue;
      
      const vertexPos = new THREE.Vector3(
        newVertices[i * 3],
        newVertices[i * 3 + 1],
        newVertices[i * 3 + 2]
      );
      
      const distance = vertexPos.distanceTo(center);
      if (distance < minDistance) {
        minDistance = distance;
        closestVertexIndex = i;
      }
    }

    // 5.3. 가장 가까운 vertex를 시작점으로 사용
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
          newIndices[faceIndex * 3],
          newIndices[faceIndex * 3 + 1],
          newIndices[faceIndex * 3 + 2]
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

    // 사용된 vertex와 face만으로 새로운 geometry 생성
    const finalVertices = [];
    const finalNormals = [];
    const finalIndices = [];
    const vertexMap = new Map(); // old index -> new index 매핑

    // 사용된 vertex들만 추출
    for (const vertexIndex of usedVertices) {
      vertexMap.set(vertexIndex, finalVertices.length / 3);
      finalVertices.push(
        newVertices[vertexIndex * 3],
        newVertices[vertexIndex * 3 + 1],
        newVertices[vertexIndex * 3 + 2]
      );
      finalNormals.push(
        newNormals[vertexIndex * 3],
        newNormals[vertexIndex * 3 + 1],
        newNormals[vertexIndex * 3 + 2]
      );
    }

    // 사용된 face들만 추출
    for (const faceIndex of usedFaces) {
      finalIndices.push(
        vertexMap.get(newIndices[faceIndex * 3]),
        vertexMap.get(newIndices[faceIndex * 3 + 1]),
        vertexMap.get(newIndices[faceIndex * 3 + 2])
      );
    }

    // 6. 부풀어오른 면 만들기
    //  0~borderVertexCount: 경계 정점
    //  borderVertexCount~borderAndBackVertexCount: 뒷면 정점
    //  borderAndBackVertexCount~: 부풀어오른 면 정점. 그러나 vertexPositions에 없고 inflatedPositions에 있음
    const borderVertexCount = borderVertexIndices.length;
    const borderAndBackVertexCount = finalVertices.length / 3;
    const innerVertexCount = borderAndBackVertexCount - borderVertexCount;   

    const vertexPositions = Array.from({length: finalVertices.length / 3}, (_, i) => new THREE.Vector3(finalVertices[i*3], finalVertices[i*3+1], finalVertices[i*3+2]));
    const vertexNormals = Array.from({length: finalNormals.length / 3}, (_, i) => new THREE.Vector3(finalNormals[i*3], finalNormals[i*3+1], finalNormals[i*3+2]));


    function getDistanceToBorder(position) {
      let minDistance = Infinity;
      for (let i=0; i<borderVertexCount; i++) {
        const distance = position.distanceTo(vertexPositions[i]);
        if (distance < minDistance) minDistance = distance;
      }
      return minDistance;
    }

    const borderDistances = Array.from({length: innerVertexCount}, (_, i) => getDistanceToBorder(vertexPositions[borderVertexCount + i]));
    const maxDistance = Math.max(...borderDistances);

    let inflatedPositions = [];

    for(let i=0; i<innerVertexCount; i++) {
      const normalizedDistance = borderDistances[i] / maxDistance;
      const sigmoidValue = normalizedDistance / (0.05 + normalizedDistance);
      const scaleFactor = sigmoidValue / (1 / (0.05 + 1));
      const extrusionAmount = (flipperThickness * 0.01) * (0.5 + 0.5 * scaleFactor);
      
      const position = vertexPositions[borderVertexCount + i].clone();
      const normal = vertexNormals[borderVertexCount + i].clone();
      normal.multiplyScalar(extrusionAmount);
      position.add(normal);
      inflatedPositions.push(position);
    }

    // inflated 면, vertexEdgeMap 만들기
    const oneFaceCount = finalIndices.length / 3;
    let inflatedFaces = []; // 제대로 된 면이 아니라, back face 기준의 인덱스임. 나중에 borderVertexCount 이상이면 backVertexCount 더해 front vertex 인덱스로 변환해야 함.
    const vertexEdgeMap = Array.from({ length: borderAndBackVertexCount }, () => new Set());

    for(let i=0; i<oneFaceCount; i++) {
      const face = finalIndices.slice(i*3, i*3+3);
      inflatedFaces.push(face);
      vertexEdgeMap[face[0]].add(face[1]);
      vertexEdgeMap[face[0]].add(face[2]);
      vertexEdgeMap[face[1]].add(face[0]);
      vertexEdgeMap[face[1]].add(face[2]);
      vertexEdgeMap[face[2]].add(face[0]);
      vertexEdgeMap[face[2]].add(face[1]);
    }


    function collapseShortEdges(){
      let edgeLenSum = 0;
      let edgeLenCount = 0;
      for(let i=borderVertexCount; i<borderAndBackVertexCount; i++) { // front vertex 루프
        const neighbors = vertexEdgeMap[i];
        for (const n of neighbors) {
          if (n < borderVertexCount) continue; // border는 건너뜀
          const edgeLen = inflatedPositions[i - borderVertexCount].distanceTo(inflatedPositions[n - borderVertexCount]);
          edgeLenSum += edgeLen;
          edgeLenCount++;
        }
      }
      const averageEdgeLen = edgeLenSum / edgeLenCount;
      const threshold = averageEdgeLen * 0.7;

      for(let i=borderVertexCount; i<borderAndBackVertexCount; i++) { // front vertex 루프
        const neighbors = vertexEdgeMap[i];
        for (const n of neighbors) {
          if(n === i) console.warn('n === i');
          if (n < borderVertexCount || n < i) continue; // border거나 자기보다 작은 인덱스는 건너뜀
          const edgeLen = inflatedPositions[i - borderVertexCount].distanceTo(inflatedPositions[n - borderVertexCount]);
          if (edgeLen < threshold) {
            // 두 엣지가 들어있는 face들 제거
            const count = inflatedFaces.length;
            inflatedFaces = inflatedFaces.filter(face => !(face.includes(i) && face.includes(n)));
            console.assert(inflatedFaces.length === count-2, 'inflatedFaces.length !== count-2');
            // face의 작은 인덱스 큰 인덱스로 변경
            for (const face of inflatedFaces) {
              const idx = face.indexOf(i);
              if (idx !== -1) {
                face[idx] = n;
              }
            }
            // 큰 인덱스를 평균위치로 변경
            inflatedPositions[n-borderVertexCount] = inflatedPositions[i-borderVertexCount].clone().add(inflatedPositions[n-borderVertexCount]).multiplyScalar(0.5);

            // 작은 인덱스 i가 사라질 예정. 작은 인덱스의 엣지들 큰 인덱스로 넘기고 작은 인덱스로 향하는 edge 제거
            for (const m of vertexEdgeMap[i]) {
              if(m===n) continue;
              vertexEdgeMap[n].add(m);
              vertexEdgeMap[m].add(n);
              vertexEdgeMap[n].delete(i);
              vertexEdgeMap[m].delete(i);
            }
            vertexEdgeMap[i] = new Set();
            break;
          }
        }
      }
    }

    const lambda = 0.60;
    const mu = -0.64;

    function computeSmoothedPositions(sourcePositions, lambda) {
      const smoothedPositions = [];
      for (let i = borderVertexCount; i < borderAndBackVertexCount; i++) {
        const neighbors = vertexEdgeMap[i];

        if(neighbors.size === 0) {
          smoothedPositions.push(sourcePositions[i-borderVertexCount].clone());
          continue;
        }

        const average = new THREE.Vector3();
        
        for (const n of neighbors) {
          const pos = n < borderVertexCount
            ? vertexPositions[n]
            : sourcePositions[n - borderVertexCount];
          if(pos === undefined) throw new Error('pos === undefined');
          if(isNaN(pos.x)) {
            console.warn('pos is NaN', i, n, pos);
            throw new Error('pos is NaN');
          }
          average.add(pos);
        }

        average.divideScalar(neighbors.size);

        const current = sourcePositions[i-borderVertexCount];
        const diff = average.clone().sub(current).multiplyScalar(lambda);

        smoothedPositions.push(current.clone().add(diff));
      }
      return smoothedPositions;
    }

    const smoothCount = 20;
    for (let cycle = 0; cycle < smoothCount; cycle++) {
      const tempPositions = computeSmoothedPositions(inflatedPositions, lambda);
      inflatedPositions = computeSmoothedPositions(tempPositions, mu);
      collapseShortEdges();
      if(inflatedPositions.some(p => isNaN(p.x))) {
        console.warn('inflatedPositions is NaN', inflatedPositions);
        throw new Error('inflatedPositions is NaN');
      }
    }

    // inflated 정점 만들기
    for(let i=0; i<innerVertexCount; i++) {
      const position = inflatedPositions[i];
      finalVertices.push(
        position.x,
        position.y,
        position.z
      );
      const normal = vertexNormals[borderVertexCount + i];
      finalNormals.push(
        normal.x,
        normal.y,
        normal.z
      );
    }

    // inflated 면 만들기
    for(const inflatedFace of inflatedFaces) {
      const face = inflatedFace.map(v => v<borderVertexCount ? v : v+innerVertexCount);
      finalIndices.push(...face);
    }


    // 뒷면 normal 반전
    const backVertexStart = borderVertexCount * 3;
    const backVertexEnd = borderAndBackVertexCount * 3;
    for(let i=backVertexStart; i<backVertexEnd; i++) {
      finalNormals[i] = -finalNormals[i];
    }

    // 새 geometry 생성
    let newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(finalVertices, 3));
    newGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(finalNormals, 3));
    newGeometry.setIndex(finalIndices);

    // 노말 다시 계산
    newGeometry = BufferGeometryUtils.mergeVertices(newGeometry);
    newGeometry.computeVertexNormals(true);

    newGeometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    newGeometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    newGeometry.computeBoundsTree({ setBoundingBox: false });

    // 원래 모델과 유사한 재질 생성
    const surfaceMaterial = new THREE.MeshMatcapMaterial({
      matcap: refs.matcaps['Red'],
      side: THREE.DoubleSide,
      flatShading: false,
    });

    // 메시 생성
    const surfaceMesh = new THREE.Mesh(newGeometry, surfaceMaterial);
    surfaceMesh.userData.isFlipperMesh = true;
    surfaceMesh.userData.canSculpt = true;
    surfaceMesh.frustumCulled = false;
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
 * 두 선분의 교차점 찾기 (같은 평면 위에 있다고 가정)
 * @param {THREE.Vector3} p1 
 * @param {THREE.Vector3} p2 
 * @param {THREE.Vector3} p3 
 * @param {THREE.Vector3} p4 
 * @returns {THREE.Vector3|null}
 */
function findEdgeIntersection(p1, p2, p3, p4) {
  // 기준 평면의 노멀 벡터 (p1, p2, p3이 같은 평면에 있다고 가정)
  const u = new THREE.Vector3().subVectors(p2, p1);
  const v = new THREE.Vector3().subVectors(p3, p1);
  const normal = new THREE.Vector3().crossVectors(u, v).normalize();

  // 평면상의 좌표계를 만들기 위한 기준 축
  const xAxis = u.clone().normalize();
  const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();

  // 3D 점을 2D 평면으로 투영
  function projectTo2D(p) {
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

  const ua = ((b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x)) / denom;
  const ub = ((a2.x - a1.x) * (a1.y - b1.y) - (a2.y - a1.y) * (a1.x - b1.x)) / denom;

  if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null; // 선분 범위 밖

  // 교차점 계산 (p1 + ua * (p2 - p1))
  const intersection = new THREE.Vector3().addVectors(
    p1,
    new THREE.Vector3().subVectors(p2, p1).multiplyScalar(ua)
  );

  return intersection;
}
