// src/sculpt.js — Sculpt Dispatcher 래퍼
// GPU/CPU 자동 선택은 sculptDispatcher에서 처리
import {
  performStroke as dispatchStroke,
  updateNormals as dispatchUpdateNormals,
} from '../../compute/sculptDispatcher.ts';

/**
 * 브러시(performStroke) 함수
 * @param {THREE.Vector3} point
 * @param {THREE.LineSegments} brushObject
 * @param {boolean} brushOnly (true면 위치 갱신만)
 * @param {Object} accumulatedFields
 * @param {THREE.Mesh} targetMesh
 * @param {Object} params
 * @param {boolean} rightClick
 */
export function performStroke(
  point,
  brushObject,
  brushOnly = false,
  accumulatedFields = {},
  targetMesh,
  params,
  rightClick
) {
  dispatchStroke(point, brushObject, brushOnly, accumulatedFields, targetMesh, params, rightClick);
}

/**
 * 노멀 업데이트(정규화) 함수
 */
export function updateNormals(triangles, indices, targetMesh) {
  dispatchUpdateNormals(triangles, indices, targetMesh);
}
