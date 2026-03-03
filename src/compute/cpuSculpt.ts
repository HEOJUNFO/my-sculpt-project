// CPU 스컬핑 — sculpt.js에서 추출한 기존 CPU 구현
import * as THREE from 'three';
import { NOT_INTERSECTED, INTERSECTED, CONTAINED } from 'three-mesh-bvh';

export function performStrokeCPU(
  point: THREE.Vector3,
  brushObject: THREE.LineSegments,
  brushOnly: boolean,
  accumulatedFields: any,
  targetMesh: THREE.Mesh,
  params: any,
  rightClick: boolean,
): void {
  if (!targetMesh) return;

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
  const posAttr = targetMesh.geometry.attributes.position;
  const normalAttr = targetMesh.geometry.attributes.normal;
  const triangles = new Set<number>();
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
              if (!sphere.containsPoint(tempVec)) {
                return INTERSECTED;
              }
            }
          }
        }
        return CONTAINED;
      }
      return intersects ? INTERSECTED : NOT_INTERSECTED;
    },
    intersectsTriangle: (tri: any, triIndex: number, contained: boolean) => {
      triangles.add(triIndex);
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

  const localPoint = new THREE.Vector3();
  localPoint.copy(point).applyMatrix4(inverseMatrix);

  const planePoint = new THREE.Vector3();
  let totalPoints = 0;
  indices.forEach((index) => {
    tempVec.fromBufferAttribute(normalAttr, index);
    normal.add(tempVec);
    if (!brushOnly) {
      totalPoints++;
      tempVec.fromBufferAttribute(posAttr, index);
      planePoint.add(tempVec);
    }
  });
  normal.normalize();

  const normalZ = new THREE.Vector3(0, 0, 1);
  brushObject.quaternion.setFromUnitVectors(normalZ, normal);

  if (totalPoints) {
    planePoint.multiplyScalar(1 / totalPoints);
  }

  if (brushOnly) return;

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

  if (indices.size) {
    (posAttr as THREE.BufferAttribute).needsUpdate = true;
  }
}

export function updateNormalsCPU(
  triangles: Set<number>,
  indices: Set<number>,
  targetMesh: THREE.Mesh,
): void {
  if (!targetMesh) return;

  const tempVec = new THREE.Vector3();
  const tempVec2 = new THREE.Vector3();
  const indexAttr = targetMesh.geometry.index!;
  const posAttr = targetMesh.geometry.attributes.position;
  const normalAttr = targetMesh.geometry.attributes.normal;
  const triangle = new THREE.Triangle();

  triangles.forEach((tri) => {
    const tri3 = tri * 3;
    const v0 = indexAttr.getX(tri3);
    const v1 = indexAttr.getX(tri3 + 1);
    const v2 = indexAttr.getX(tri3 + 2);

    triangle.a.fromBufferAttribute(posAttr, v0);
    triangle.b.fromBufferAttribute(posAttr, v1);
    triangle.c.fromBufferAttribute(posAttr, v2);
    triangle.getNormal(tempVec2);

    if (indices.has(v0)) {
      tempVec.fromBufferAttribute(normalAttr, v0);
      tempVec.add(tempVec2);
      normalAttr.setXYZ(v0, tempVec.x, tempVec.y, tempVec.z);
    }
    if (indices.has(v1)) {
      tempVec.fromBufferAttribute(normalAttr, v1);
      tempVec.add(tempVec2);
      normalAttr.setXYZ(v1, tempVec.x, tempVec.y, tempVec.z);
    }
    if (indices.has(v2)) {
      tempVec.fromBufferAttribute(normalAttr, v2);
      tempVec.add(tempVec2);
      normalAttr.setXYZ(v2, tempVec.x, tempVec.y, tempVec.z);
    }
  });

  indices.forEach((index) => {
    tempVec.fromBufferAttribute(normalAttr, index);
    tempVec.normalize();
    normalAttr.setXYZ(index, tempVec.x, tempVec.y, tempVec.z);
  });

  (normalAttr as THREE.BufferAttribute).needsUpdate = true;
}
