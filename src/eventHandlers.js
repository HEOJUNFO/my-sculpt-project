// src/eventHandlers.js

import * as THREE from 'three';
import { pushUndoState, refs, redoStack, undo, redo } from './modelManager.js';
import { memos, openEditMemoModal, openNewMemoModal } from './memo.js';

export let mouse = new THREE.Vector2();
export let lastMouse = new THREE.Vector2();
export let mouseState = false;
export let lastMouseState = false;
export let lastCastPose = new THREE.Vector3();
export let brushActive = false;
export let rightClick = false;

const isMac = navigator.userAgent.toLowerCase().includes('mac');

export function onKeyDown(e){
  const primaryKeyPressed = isMac ? e.metaKey : e.ctrlKey;
  if (primaryKeyPressed && e.key.toLowerCase() === 'z') {
    if (e.shiftKey) {
      // Redo
      redo();
    } else {
      // Undo
      undo();
    }
    e.preventDefault();
  }
}

// -------------------------------------------------------------------
/** Pointer Down */
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

  // 3) 메모 모드
  if ( refs.params.memoMode ) {
    // 메모 클릭
    const memoHits = raycaster.intersectObjects( memos.map(m => m.object), true );
    if ( memoHits && memoHits.length > 0 ) {
      const memoObj = memoHits[0].object;
      const foundIndex = memos.findIndex(m => m.object === memoObj);
      if (foundIndex >= 0) {
        openEditMemoModal(foundIndex);
        return;
      }
    }
    // 새 메모
    if ( refs.targetMesh ) {
      const meshHits = raycaster.intersectObject( refs.targetMesh, true );
      if ( meshHits && meshHits.length > 0 ) {
        openNewMemoModal( meshHits[0].point );
      }
    }
    return;
  }

  // transformMode 중이면 sculpt 무효
  if ( refs.params.transformMode ) {
    return;
  }

  // 4) Sculpt
  if (!refs.targetMesh) return;
  const res = raycaster.intersectObject(refs.targetMesh);
  refs.controls.enabled = (res.length === 0);

  // 만약 어떤 폴리곤을 찍었다면 → Undo 스택에 현재 상태를 기록
  if (res.length !== 0) {
    pushUndoState();
    redoStack.length = 0; // redoStack 초기화
  }
}

/** Pointer Up */
export function onPointerUp(e) {
  mouseState = Boolean( e.buttons & 3 );
  if ( e.pointerType === 'touch' ) {
    brushActive = false;
  }
}

/** Pointer Move */
export function onPointerMove(e) {
  mouse.x = ( e.clientX / window.innerWidth ) * 2 - 1;
  mouse.y = - ( e.clientY / window.innerHeight ) * 2 + 1;
  brushActive = true;
}

/** Wheel */
export function onWheel(e) {
  let delta = e.deltaY;
  if ( e.deltaMode === 1 ) delta *= 40;
  if ( e.deltaMode === 2 ) delta *= 40;

  const sizeKeyPressed = isMac ? e.metaKey : e.shiftKey;

  if ( sizeKeyPressed ) {
    refs.params.size += delta * 0.0001;
    refs.params.size = Math.max(Math.min(refs.params.size, 0.25), 0.01);

    const sizeRange = document.getElementById('sizeRange');
    if (sizeRange) {
      sizeRange.value = refs.params.size.toFixed(4);
    }
  }
  else if ( e.ctrlKey ) {
    refs.params.intensity += delta * 0.1;
    refs.params.intensity = Math.max(1, Math.min(refs.params.intensity, 50));

    const intensityRange = document.getElementById('intensityRange');
    if (intensityRange) {
      intensityRange.value = String(refs.params.intensity);
    }
  }
}

/** Window Resize */
export function onWindowResize() {
  refs.camera.aspect = window.innerWidth / window.innerHeight;
  refs.camera.updateProjectionMatrix();
  refs.renderer?.setSize( window.innerWidth, window.innerHeight );
}

export function someUpdateFunc() {
  lastMouseState = mouseState;
}
