// src/eventHandlers.js

import * as THREE from 'three';
import { refs } from './modelManager.js';
import { memos, openEditMemoModal, openNewMemoModal } from './memo.js';

/** 
 * 포인터/브러시 관련 전역 상태 
 * - 필요 시 modelManager.js, 또는 다른 중앙 관리 파일에 둘 수도 있음
 */
export let mouse = new THREE.Vector2();
export let lastMouse = new THREE.Vector2();
export let mouseState = false;
export let lastMouseState = false;
export let lastCastPose = new THREE.Vector3();
export let brushActive = false;
export let rightClick = false;

// Mac vs Windows: sizeKey (shift vs meta)
const isMac = navigator.userAgent.toLowerCase().includes('mac');

/** 
 * Pointer Down 
 */
export function onPointerDown(e) {
  // 1) 모달 열려 있는지 체크
  const newModal = document.getElementById('memo-modal-new');
  const editModal = document.getElementById('memo-modal-edit');
  const isNewOpen  = newModal && newModal.style.display === 'block';
  const isEditOpen = editModal && editModal.style.display === 'block';

  // (★) 메모 모드이면서, 모달도 열려 있으면 → 메모 작업 스킵
  if ( refs.params.memoMode && (isNewOpen || isEditOpen) ) {
    return;
  }

  // 2) 일반 포인터 상태 갱신
  mouse.x = ( e.clientX / window.innerWidth ) * 2 - 1;
  mouse.y = - ( e.clientY / window.innerHeight ) * 2 + 1;
  mouseState = Boolean( e.buttons & 3 );
  rightClick = Boolean( e.buttons & 2 );
  brushActive = true;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, refs.camera);
  raycaster.firstHitOnly = true;

  // 3) 메모 모드 체크
  if ( refs.params.memoMode ) {
    // 메모 오브젝트 클릭 → 수정 모달
    const memoHits = raycaster.intersectObjects( memos.map(m => m.object), true );
    if ( memoHits && memoHits.length > 0 ) {
      const memoObj = memoHits[0].object;
      const foundIndex = memos.findIndex(m => m.object === memoObj);
      if (foundIndex >= 0) {
        openEditMemoModal(foundIndex);
        return;
      }
    }

    // 그 외 → targetMesh에 새 메모
    if ( refs.targetMesh ) {
      const meshHits = raycaster.intersectObject( refs.targetMesh, true );
      if ( meshHits && meshHits.length > 0 ) {
        openNewMemoModal( meshHits[0].point );
      }
    }
    return;
  }

  if ( refs.params.transformMode ) {
    return;
  }

  // 5) Sculpt 모드
  if (!refs.targetMesh) return;
  const res = raycaster.intersectObject(refs.targetMesh);
  refs.controls.enabled = (res.length === 0);
}


/** 
 * Pointer Up 
 */
export function onPointerUp(e) {
  mouseState = Boolean( e.buttons & 3 );
  // 터치인 경우, 뗄 때 브러시 비활성화
  if ( e.pointerType === 'touch' ) {
    brushActive = false;
  }
}

/** 
 * Pointer Move 
 */
export function onPointerMove(e) {
  mouse.x = ( e.clientX / window.innerWidth ) * 2 - 1;
  mouse.y = - ( e.clientY / window.innerHeight ) * 2 + 1;
  brushActive = true;
}

/** 
 * Wheel (마우스 휠) 
 *  - Mac: Cmd + Wheel → size 
 *  - Win: Shift + Wheel → size
 *  - Ctrl + Wheel → intensity
 */
export function onWheel(e) {
  let delta = e.deltaY;

  // FireFox 등 deltaMode 보정
  if ( e.deltaMode === 1 ) delta *= 40;
  if ( e.deltaMode === 2 ) delta *= 40;

  // Mac은 metaKey, 그 외 OS는 shiftKey
  const sizeKeyPressed = isMac ? e.metaKey : e.shiftKey;

  if ( sizeKeyPressed ) {
    // size 변경
    refs.params.size += delta * 0.0001;
    refs.params.size = Math.max(Math.min(refs.params.size, 0.25), 0.025);

    // 슬라이더 연동
    const sizeRange = document.getElementById('sizeRange');
    if (sizeRange) {
      sizeRange.value = refs.params.size.toFixed(4);
    }
  }
  else if ( e.ctrlKey ) {
    // intensity 변경
    refs.params.intensity += delta * 0.1;
    refs.params.intensity = Math.max(1, Math.min(refs.params.intensity, 100));

    // 슬라이더 연동
    const intensityRange = document.getElementById('intensityRange');
    if (intensityRange) {
      intensityRange.value = String(refs.params.intensity);
    }
  }
}

/**
 * Window Resize 
 */
export function onWindowResize() {
  refs.camera.aspect = window.innerWidth / window.innerHeight;
  refs.camera.updateProjectionMatrix();
  refs.renderer?.setSize( window.innerWidth, window.innerHeight );
  // ↑ refs.renderer가 없다면, main.js 쪽에서 renderer를 불러와서 처리
}

export function someUpdateFunc() {
  lastMouseState = mouseState;
}