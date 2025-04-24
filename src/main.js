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

// 모델 드래그&드롭 이벤트
import { onDropSTL, onDragOver } from './modelManager.js';

// 메모 모달 관련
import { onMemoNewOkBtn, onMemoEditUpdateBtn, onMemoEditDeleteBtn, makeDraggable } from './memo.js';

// Import the setupBlockoutUI function
import { setupBlockoutUI } from './blockoutUI.js';

// Import process steps module
import { 
  initProcessSteps, 
  completeUpload, 
  completeSculpting, 
  completeBlockout,
  STEPS 
} from './processSteps.js';

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
  window.addEventListener('drop', (e) => {
    onDropSTL(e);
    // STL 파일이 로드되면 스컬프 모드로 자동 전환
    completeUpload(); // 업로드 후 스컬프 모드로 전환
  }, false);

  //    - 메모 모달 버튼
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

  // Setup the blockout UI
  setupBlockoutUI();
  
  // 프로세스 단계 UI 초기화
  initProcessSteps();

  // 스컬프 완료 버튼에 단계 전환 이벤트 추가
  const btnCompleteSculpt = document.getElementById('btn-complete-sculpt');
  if (btnCompleteSculpt) {
    btnCompleteSculpt.addEventListener('click', () => {
      completeSculpting(); // 스컬프 완료 시 다음 단계로 진행
    });
  }

  // 블록아웃 완료 버튼에 이벤트 추가
  const btnBlockoutComplete = document.getElementById('btn-blockout-complete');
  if (btnBlockoutComplete) {
    btnBlockoutComplete.addEventListener('click', () => {
      completeBlockout(); // 블록아웃 완료 후 스컬프 모드로 전환
    });
  }

  // 3) 렌더 루프 시작
  startRenderLoop(renderer, scene, camera, stats);
  
  // 전역 접근을 위해 window 객체에 추가 (디버깅용)
  window.appSteps = { completeSculpting, completeBlockout, STEPS };
}

// 실행
main();