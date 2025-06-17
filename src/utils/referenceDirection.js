// src/utils/referenceDirection.js
import * as THREE from 'three';

// 기준 방향 정보를 저장하는 객체
let referenceDirectionData = {
  cameraDirection: null,
  cameraPosition: null,
  cameraUp: null,
  viewMatrix: null,
  isSet: false,
  timestamp: null,
  insertionDirection: null // 블록아웃 시 사용된 삽입 방향
};

/**
 * 언더컷 감지 시점의 카메라 상태를 기준 방향으로 저장
 * @param {THREE.Camera} camera - 현재 카메라
 * @param {THREE.Vector3} insertionDir - 블록아웃 삽입 방향 (선택적)
 */
export function setReferenceDirection(camera, insertionDir = null) {
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  
  referenceDirectionData = {
    cameraDirection: direction.clone(),
    cameraPosition: camera.position.clone(),
    cameraUp: camera.up.clone(),
    viewMatrix: camera.matrixWorldInverse.clone(),
    isSet: true,
    timestamp: Date.now(),
    insertionDirection: insertionDir ? insertionDir.clone() : direction.clone().negate()
  };
  
  console.log('기준 방향 설정됨:', referenceDirectionData);
  
  // 전역 이벤트 발생
  window.dispatchEvent(new CustomEvent('referenceDirectionSet', { 
    detail: referenceDirectionData 
  }));
}

/**
 * 기준 방향이 설정되었는지 확인
 */
export function hasReferenceDirection() {
  return referenceDirectionData.isSet;
}

/**
 * 기준 방향 데이터 가져오기
 */
export function getReferenceDirection() {
  if (!referenceDirectionData.isSet) {
    console.warn('기준 방향이 아직 설정되지 않았습니다.');
    return null;
  }
  return { ...referenceDirectionData };
}

/**
 * 현재 좌표계를 기준 방향에 맞춰 변환
 * @param {THREE.Vector3} point - 변환할 점
 * @param {THREE.Camera} currentCamera - 현재 카메라
 * @returns {THREE.Vector3} 변환된 점
 */
export function transformToReferenceSpace(point, currentCamera) {
  if (!referenceDirectionData.isSet) {
    console.warn('기준 방향이 설정되지 않았습니다. 원본 점을 반환합니다.');
    return point.clone();
  }
  
  // 현재 카메라의 방향
  const currentDirection = new THREE.Vector3();
  currentCamera.getWorldDirection(currentDirection);
  
  // 기준 방향과 현재 방향 사이의 회전 계산
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(currentDirection, referenceDirectionData.cameraDirection);
  
  // 점을 회전
  const transformedPoint = point.clone();
  transformedPoint.applyQuaternion(quaternion);
  
  return transformedPoint;
}

/**
 * 치아 배치를 위한 정규화된 방향 벡터 계산
 * @param {string} toothId - 치아 ID
 * @returns {Object} 정규화된 방향 정보
 */
export function getNormalizedToothDirection(toothId) {
  if (!referenceDirectionData.isSet) {
    console.warn('기준 방향이 설정되지 않았습니다.');
    return null;
  }
  
  const toothNum = parseInt(toothId);
  const insertionDir = referenceDirectionData.insertionDirection;
  
  // 기준 좌표계 생성 (블록아웃 시점의 뷰 기준)
  const forward = insertionDir.clone().normalize();
  const up = referenceDirectionData.cameraUp.clone();
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();
  up.crossVectors(forward, right).normalize();
  
  // 치아 번호에 따른 기본 방향 설정
  let localDirection = new THREE.Vector3();
  let localUp = new THREE.Vector3(0, 1, 0);
  
  if (toothNum >= 11 && toothNum <= 18) {
    // 우측 상악
    localDirection.set(-1, 0, 0); // 우측 방향
  } else if (toothNum >= 21 && toothNum <= 28) {
    // 좌측 상악
    localDirection.set(1, 0, 0); // 좌측 방향
  } else if (toothNum >= 31 && toothNum <= 38) {
    // 좌측 하악
    localDirection.set(1, 0, 0); // 좌측 방향
    localUp.set(0, -1, 0); // 하악이므로 위아래 반전
  } else if (toothNum >= 41 && toothNum <= 48) {
    // 우측 하악
    localDirection.set(-1, 0, 0); // 우측 방향
    localUp.set(0, -1, 0); // 하악이므로 위아래 반전
  }
  
  // 기준 좌표계로 변환
  const worldDirection = new THREE.Vector3();
  worldDirection.addScaledVector(right, localDirection.x);
  worldDirection.addScaledVector(up, localDirection.y);
  worldDirection.addScaledVector(forward, localDirection.z);
  
  const worldUp = new THREE.Vector3();
  worldUp.addScaledVector(right, localUp.x);
  worldUp.addScaledVector(up, localUp.y);
  worldUp.addScaledVector(forward, localUp.z);
  
  return {
    direction: worldDirection.normalize(),
    up: worldUp.normalize(),
    right: right.clone(),
    forward: forward.clone(),
    baseRotation: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldDirection)
  };
}

/**
 * 기준 방향 초기화
 */
export function clearReferenceDirection() {
  referenceDirectionData = {
    cameraDirection: null,
    cameraPosition: null,
    cameraUp: null,
    viewMatrix: null,
    isSet: false,
    timestamp: null,
    insertionDirection: null
  };
  console.log('기준 방향이 초기화되었습니다.');
}

// 전역 접근을 위해 window 객체에 추가
window.referenceDirection = {
  set: setReferenceDirection,
  get: getReferenceDirection,
  has: hasReferenceDirection,
  clear: clearReferenceDirection,
  getNormalizedToothDirection
};