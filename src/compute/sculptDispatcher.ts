// Sculpt Dispatcher: GPU/CPU 자동 선택
import * as THREE from 'three';
import { performStrokeCPU, updateNormalsCPU } from './cpuSculpt.ts';
import { isGPUSculptAvailable, displaceVerticesGPU, initGPUSculpt } from './gpuSculpt.ts';
import { NOT_INTERSECTED, INTERSECTED, CONTAINED } from 'three-mesh-bvh';

// GPU 스컬핑은 영향 정점 수가 이 임계값을 넘어야 활성화
const GPU_THRESHOLD = 5000;

// GPU 초기화 (최초 한 번)
let gpuInitPromise: Promise<boolean> | null = null;

function ensureGPUInit(): void {
  if (!gpuInitPromise) {
    gpuInitPromise = initGPUSculpt();
  }
}

/**
 * 스컬프 디스패처 — CPU 또는 GPU 경로 자동 선택
 */
export function performStroke(
  point: THREE.Vector3,
  brushObject: THREE.LineSegments,
  brushOnly: boolean,
  accumulatedFields: any,
  targetMesh: THREE.Mesh,
  params: any,
  rightClick: boolean,
): void {
  // GPU 스컬핑이 비활성화이거나, brushOnly인 경우 항상 CPU
  if (!params.useGPUSculpt || brushOnly || !isGPUSculptAvailable()) {
    performStrokeCPU(point, brushObject, brushOnly, accumulatedFields, targetMesh, params, rightClick);
    return;
  }

  // BVH shapecast로 영향 범위 파악 (CPU)
  const {
    accumulatedTriangles = new Set<number>(),
    accumulatedIndices = new Set<number>(),
    accumulatedTraversedNodeIndices = new Set<number>(),
  } = accumulatedFields;

  const inverseMatrix = new THREE.Matrix4();
  inverseMatrix.copy(targetMesh.matrixWorld).invert();

  const sphere = new THREE.Sphere();
  sphere.center.copy(point).applyMatrix4(inverseMatrix);
  sphere.radius = params.size;

  const indices = new Set<number>();
  const tempVec = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const indexAttr = targetMesh.geometry.index!;
  const posAttr = targetMesh.geometry.attributes.position as THREE.BufferAttribute;
  const normalAttr = targetMesh.geometry.attributes.normal as THREE.BufferAttribute;
  const bvh = (targetMesh.geometry as any).boundsTree;

  bvh?.shapecast({
    intersectsBounds: (box: THREE.Box3, _isLeaf: boolean, _score: number, _depth: number, nodeIndex: number) => {
      accumulatedTraversedNodeIndices.add(nodeIndex);
      const intersects = sphere.intersectsBox(box);
      const { min, max } = box;
      if (intersects) {
        for (let x = 0; x <= 1; x++) {
          for (let y = 0; y <= 1; y++) {
            for (let z = 0; z <= 1; z++) {
              tempVec.set(
                x === 0 ? min.x : max.x,
                y === 0 ? min.y : max.y,
                z === 0 ? min.z : max.z,
              );
              if (!sphere.containsPoint(tempVec)) return INTERSECTED;
            }
          }
        }
        return CONTAINED;
      }
      return NOT_INTERSECTED;
    },
    intersectsTriangle: (tri: any, triIndex: number, contained: boolean) => {
      accumulatedTriangles.add(triIndex);
      const i3 = 3 * triIndex;
      const va = indexAttr.getX(i3);
      const vb = indexAttr.getX(i3 + 1);
      const vc = indexAttr.getX(i3 + 2);

      if (contained) {
        indices.add(va); indices.add(vb); indices.add(vc);
        accumulatedIndices.add(va); accumulatedIndices.add(vb); accumulatedIndices.add(vc);
      } else {
        if (sphere.containsPoint(tri.a)) { indices.add(va); accumulatedIndices.add(va); }
        if (sphere.containsPoint(tri.b)) { indices.add(vb); accumulatedIndices.add(vb); }
        if (sphere.containsPoint(tri.c)) { indices.add(vc); accumulatedIndices.add(vc); }
      }
      return false;
    },
  });

  // 평균 노말 + 브러시 회전
  const localPoint = sphere.center.clone();
  const planePoint = new THREE.Vector3();
  let totalPoints = 0;
  indices.forEach((index) => {
    tempVec.fromBufferAttribute(normalAttr, index);
    normal.add(tempVec);
    totalPoints++;
    tempVec.fromBufferAttribute(posAttr, index);
    planePoint.add(tempVec);
  });
  normal.normalize();
  brushObject.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

  if (totalPoints) planePoint.multiplyScalar(1 / totalPoints);

  // 임계값 미달이면 CPU 폴백
  if (indices.size < GPU_THRESHOLD) {
    // CPU에서 displacement 수행
    const targetHeight = params.intensity * 0.0001;
    const plane = new THREE.Plane();
    plane.setFromNormalAndCoplanarPoint(normal, planePoint);

    indices.forEach((index) => {
      tempVec.fromBufferAttribute(posAttr, index);
      const dist = tempVec.distanceTo(localPoint);
      const negated = params.invert !== rightClick ? -1 : 1;
      let intensity = 1.0 - dist / params.size;

      if (params.brush === 'clay') {
        intensity = Math.pow(intensity, 3);
        const planeDist = plane.distanceToPoint(tempVec);
        const clampedIntensity = negated * Math.min(intensity * 4, 1.0);
        tempVec.addScaledVector(
          normal,
          clampedIntensity * targetHeight - negated * planeDist * clampedIntensity * 0.3,
        );
      } else if (params.brush === 'normal') {
        intensity = Math.pow(intensity, 2);
        tempVec.addScaledVector(normal, negated * intensity * targetHeight);
      } else if (params.brush === 'flatten') {
        intensity = Math.pow(intensity, 2);
        const planeDist = plane.distanceToPoint(tempVec);
        tempVec.addScaledVector(normal, -planeDist * intensity * params.intensity * 0.01 * 0.5);
      }

      posAttr.setXYZ(index, tempVec.x, tempVec.y, tempVec.z);
      normalAttr.setXYZ(index, 0, 0, 0);
    });

    if (indices.size) posAttr.needsUpdate = true;
    return;
  }

  // GPU 경로: async dispatch (fire-and-forget, 다음 프레임에 반영)
  const brushTypeMap: Record<string, number> = { clay: 0, normal: 1, flatten: 2 };

  displaceVerticesGPU(
    posAttr.array as Float32Array,
    normalAttr.array as Float32Array,
    new Uint32Array([...indices]),
    {
      center: [localPoint.x, localPoint.y, localPoint.z],
      radius: params.size,
      normal: [normal.x, normal.y, normal.z],
      intensity: params.intensity,
      planePoint: [planePoint.x, planePoint.y, planePoint.z],
      brushType: brushTypeMap[params.brush] ?? 1,
      invert: params.invert !== rightClick,
      targetHeight: params.intensity * 0.0001,
    },
  ).then(() => {
    posAttr.needsUpdate = true;
    normalAttr.needsUpdate = true;
  });
}

export function updateNormals(
  triangles: Set<number>,
  indices: Set<number>,
  targetMesh: THREE.Mesh,
): void {
  // Normal 업데이트는 항상 CPU (GPU 경로에서는 displacement와 동시에 zero 처리됨)
  updateNormalsCPU(triangles, indices, targetMesh);
}

// GPU 초기화 시작 (모듈 로드 시)
ensureGPUInit();
