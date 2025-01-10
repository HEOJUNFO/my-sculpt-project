// src/main.js

import { initScene } from './initScene.js';
import { startRenderLoop } from './renderLoop.js';

// 이벤트 핸들러
import {
  onPointerDown,
  onPointerUp,
  onPointerMove,
  onWheel,
  onWindowResize,
  onKeyDown
} from './eventHandlers.js';

// 모델 드래그&드롭 이벤트 (필요시)
import { onDropSTL, onDragOver } from './modelManager.js';

// 예: 메모 모달 버튼 (필요시)
import { onMemoNewOkBtn, onMemoEditUpdateBtn, onMemoEditDeleteBtn,makeDraggable } from './memo.js';

/**
 * 프로그램 진입점
 */
function main() {
  // 1) 씬/카메라/렌더러/GUI 초기화
  const { renderer, scene, camera, stats } = initScene();

  // 2) 이벤트 리스너 등록
  //    - 포인터, 휠, 리사이즈
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('contextmenu', e => e.preventDefault()); 
  window.addEventListener('wheel', onWheel);
  window.addEventListener('keydown', onKeyDown);

  //    - 드래그/드롭으로 STL 로드
  window.addEventListener('dragover', onDragOver, false);
  window.addEventListener('drop', onDropSTL, false);

  //    - 메모 모달 버튼 (HTML 내 버튼 요소가 존재한다고 가정)
  makeDraggable(document.getElementById('memo-modal-new'));
  makeDraggable(document.getElementById('memo-modal-edit'));

  const memoNewOkBtn      = document.getElementById('memo-new-ok-btn');
  const memoEditUpdateBtn = document.getElementById('memo-edit-update-btn');
  const memoEditDeleteBtn = document.getElementById('memo-edit-delete-btn');

  if (memoNewOkBtn) {
    memoNewOkBtn.addEventListener('click', (e) => {
      e.stopPropagation(); 
      onMemoNewOkBtn(scene);
    });
  }
  if (memoEditUpdateBtn) {
    memoEditUpdateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onMemoEditUpdateBtn(scene);
    });
  }
  if (memoEditDeleteBtn) {
    memoEditDeleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onMemoEditDeleteBtn(scene);
    });
  }

  // 3) 렌더 루프 시작
  startRenderLoop(renderer, scene, camera, stats);
}

// 실행
main();
