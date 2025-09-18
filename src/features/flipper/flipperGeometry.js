// src/flipper/flipperGeometry.js
import * as THREE from 'three';
import { refs } from '../../models/modelManager.js'
import { getFlipperState, setFlipperMesh, updateFlipperInfoText } from './flipperDrawing.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshCutter } from '../../utils/meshCutter.js';

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

    // 2-4. 메시 절단 수행 (MeshCutter 사용 - 플리퍼 원본 로직 보존)
    const cuttingData = MeshCutter.performFlipperCutting(originalGeometry, selectedAreaPoints);
    const { newVertices, newNormals, newIndices, vertexFaceMap, borderVertexIndices } = cuttingData;



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


