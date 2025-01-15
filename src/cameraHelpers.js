// src/cameraHelpers.js
import * as THREE from 'three';

/**
 * 주어진 카메라로부터 오브젝트가 카메라 시야(프러스텀)에 포함되는지 여부를 반환
 * @param {THREE.Camera} camera 
 * @param {THREE.Object3D} object 
 * @returns {boolean} 오브젝트가 카메라 시야 내라면 true, 아니면 false
 */
export function isObjectInCameraViewFrustum(camera, object) {
  // 오브젝트의 바운딩 박스 계산
  const box = new THREE.Box3().setFromObject(object);

  // 카메라 매트릭스 업데이트
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  // 카메라에서 ViewProjection 매트릭스 추출 & Frustum 생성
  const frustum = new THREE.Frustum();
  const cameraViewProjectionMatrix = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );
  frustum.setFromProjectionMatrix(cameraViewProjectionMatrix);

  // 오브젝트의 바운딩 박스가 프러스텀과 교차(시야 내)하는지 판단
  return frustum.intersectsBox(box);
}

/**
 * 단, 오브젝트가 시야 내에 없을 때만 동작
 * @param {THREE.Camera} camera 
 * @param {THREE.Object3D} object 
 * @param {THREE.TrackballControls} controls
 * @param {number} offset 여유 공간 비율 (기본값 1.25)
 */
export function fitCameraToObject(camera, object, controls, offset = 1.5) {
  console.log('fitCameraToObject');

  // 오브젝트 월드 변환 행렬 업데이트
  object.updateWorldMatrix(true, false);

  // 프러스텀에 잡히지 않은 경우에만 카메라 보정
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  const fov = camera.fov * (Math.PI / 180);
  let cameraZ = (maxDim / 2) / Math.tan(fov / 2);
  cameraZ *= offset;

  camera.position.set(center.x, center.y, center.z + cameraZ);
  camera.lookAt(center);

  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
}