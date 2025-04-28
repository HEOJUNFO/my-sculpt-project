// src/main.js

import { initScene } from './initScene.js';
import { startRenderLoop } from './renderLoop.js';
import { refs } from './modelManager.js';
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
import { onDropSTL, onDragOver, importModel } from './modelManager.js';

// 메모 모달 관련
import { onMemoNewOkBtn, onMemoEditUpdateBtn, onMemoEditDeleteBtn, makeDraggable } from './memo.js';

// Import the setupBlockoutUI function
import { setupBlockoutUI } from './blockoutUI.js';

// Import library integration (new)
import './libraryIntegration.js';

// Import process steps module
import { 
  initProcessSteps, 
  completeUpload, 
  completeSculpting, 
  completeBlockout,
  completeLibrary,
  completeFlipper,
  STEPS 
} from './processSteps.js';

/**
 * 프로그램 진입점
 */
function main() {
  // 1) 씬/카메라/렌더러/GUI 초기화
  const { renderer, scene, camera, stats } = initScene();

  refs.renderer = renderer;

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
  // 메인 윈도우의 드래그 드롭은 업로드 UI가 아닐 때만 사용
  window.addEventListener('dragover', onDragOver, false);
  window.addEventListener('drop', (e) => {
    // 업로드 UI 영역이 아닌 경우에만 처리
    if (!e.target.closest('#upload-ui')) {
      onDropSTL(e);
      // STL 파일이 로드되면 스컬프 모드로 자동 전환
      completeUpload(); // 업로드 후 스컬프 모드로 전환
    }
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
  
  // 업로드 UI 이벤트 설정
  setupUploadUI();
  
  // 프로세스 단계 UI 초기화
  initProcessSteps();

  // 스컬프 완료 버튼에 단계 전환 이벤트 추가
  const btnCompleteSculpt = document.getElementById('btn-complete-sculpt');
  if (btnCompleteSculpt) {
    btnCompleteSculpt.addEventListener('click', () => {
      console.log("Complete Sculpting 버튼 클릭됨");
      completeSculpting(); // 스컬프 완료 시 다음 단계로 진행
    });
  }

  // 블록아웃 완료 버튼에 이벤트 추가
  const btnBlockoutComplete = document.getElementById('btn-blockout-complete');
  if (btnBlockoutComplete) {
    btnBlockoutComplete.addEventListener('click', () => {
      console.log("Complete Blockout 버튼 클릭됨");
      completeBlockout(); // 블록아웃 완료 후 스컬프 모드로 전환
    });
  }

  // 3) 렌더 루프 시작
  startRenderLoop(renderer, scene, camera, stats);
  
  // 전역 접근을 위해 window 객체에 추가 (디버깅용)
  window.appSteps = { 
    completeSculpting, 
    completeBlockout, 
    completeLibrary,
    completeFlipper,
    STEPS 
  };
}

/**
 * 업로드 UI 이벤트 설정
 */
function setupUploadUI() {
  const uploadArea = document.querySelector('.upload-area');
  const btnBrowseFiles = document.getElementById('btn-browse-files');
  const fileInput = document.getElementById('file-input');
  
  // 업로드 영역 클릭 시 파일 선택 다이얼로그 표시
  if (uploadArea) {
    uploadArea.addEventListener('click', () => {
      if (fileInput) {
        fileInput.click();
      }
    });
  }
  
  // 파일 찾아보기 버튼 클릭 시 파일 선택 다이얼로그 표시
  if (btnBrowseFiles) {
    btnBrowseFiles.addEventListener('click', () => {
      if (fileInput) {
        fileInput.click();
      }
    });
  }
  
  // 드래그 오버 효과 추가
  if (uploadArea) {
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation(); // 이벤트 버블링 방지
      uploadArea.style.backgroundColor = '#e0e0e0';
      uploadArea.style.borderColor = '#7066FF';
    });
    
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.style.backgroundColor = '#f5f5f5';
      uploadArea.style.borderColor = '#aaa';
    });
    
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation(); // 이벤트 버블링 방지
      uploadArea.style.backgroundColor = '#f5f5f5';
      uploadArea.style.borderColor = '#aaa';
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        for (const file of files) {
          if (file.name.toLowerCase().endsWith('.stl')) {
            importModel(file);
          }
        }
        // 파일 업로드 후 스컬프 모드로 전환
        completeUpload();
      }
    });
  }
  
  // 파일 입력 변경 이벤트
  if (fileInput) {
    fileInput.addEventListener('change', (event) => {
      const files = event.target.files;
      if (files.length > 0) {
        for (const file of files) {
          if (file.name.toLowerCase().endsWith('.stl')) {
            importModel(file);
          }
        }
        // 파일 입력 초기화
        fileInput.value = '';
        // 파일 업로드 후 스컬프 모드로 전환
        completeUpload();
      }
    });
  }
}

// 실행
main();