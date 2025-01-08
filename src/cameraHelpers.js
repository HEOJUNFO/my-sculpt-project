// src/cameraHelpers.js
import * as THREE from 'three';

/**
 * object(주로 mesh)가 화면에 꽉 차도록 카메라와 OrbitControls 위치/타겟을 조정
 * @param {THREE.Camera} camera 
 * @param {THREE.Object3D} object 
 * @param {number} offset 여유 공간 비율 (기본값 1.25)
 * @param {THREE.TrackballControls } controls
 */
export function fitCameraToObject( camera, object, controls, offset = 1.25 ) {
    console.log('fitCameraToObject');

  object.updateWorldMatrix( true, false );

  // 바운딩 박스로부터 모델의 크기 및 중심 계산
  const box = new THREE.Box3().setFromObject( object );
  const center = box.getCenter( new THREE.Vector3() );
  const size = box.getSize( new THREE.Vector3() );
  const maxDim = Math.max( size.x, size.y, size.z );

  // 카메라 fov 고려해서 모델을 한눈에 담을 수 있는 Z 위치 계산
  const fov = camera.fov * ( Math.PI / 180 );
  let cameraZ = maxDim / 2 / Math.tan( fov / 2 );
  cameraZ *= offset;

  // 카메라를 모델 중심 + cameraZ 위치로 세팅
  camera.position.set( center.x, center.y, center.z + cameraZ );
  camera.lookAt( center );

  // OrbitControls도 타겟을 모델 중심에 맞추고 갱신
  if ( controls ) {
    controls.target.copy( center );
    controls.update();
  }

}
