// src/processSteps.js
// 프로세스 단계를 숫자로 관리하는 모듈

// Import UI module integration functions
import { initLibraryMode, cleanupLibraryMode } from './libraryIntegration.js';
import { initFlipperUI, cleanupFlipperUI } from './flipper/flipperUI.js';
import { initExportUI, cleanupExportUI } from './exportUI.js';

// 단계 정의 (상수)
export const STEPS = {
  UPLOAD: 'upload',
  BLOCKOUT: 'blockout',
  LIBRARY: 'library',
  FLIPPER: 'flipper',
  EXPORT: 'export'
};

// 단계 숫자 정의
// 1 = 업로드 UI (초기 단계)
// 2 = 업로드 단계 + 스컬프 UI
// 3 = 블록아웃 단계 + 블록아웃 UI
// 4 = 블록아웃 단계 + 스컬프 UI
// 5 = 라이브러리 단계 + 라이브러리 UI
// 6 = 라이브러리 단계 + 스컬프 UI
// 7 = 플리퍼 단계 + 플리퍼 UI
// 8 = 플리퍼 단계 + 스컬프 UI
// 9 = 익스포트 단계 + 익스포트 UI

// 현재 단계 숫자 (처음에는 1: 업로드 UI)
let currentStep = 1;

/**
 * 현재 단계 번호를 반환하는 함수
 */
export function getCurrentStep() {
  return currentStep;
}

/**
 * 현재 단계가 라이브러리 단계인지 확인하는 함수
 */
export function isLibraryStep() {
  return currentStep === 5;
}

/**
 * 현재 단계가 플리퍼 단계인지 확인하는 함수
 */
export function isFlipperStep() {
  return currentStep === 7;
}

/**
 * 현재 단계가 스컬프를 실행해도 되는 단계인지 확인
 */
export function canSculpt() {
  // 단계 2, 4, 6, 8에서만 스컬프 가능
  return currentStep === 2 || currentStep === 4 || currentStep === 6 || currentStep === 8;
}

/**
 * 현재 단계에 따라 상단 진행 바 업데이트
 */
function updateTopBar() {
  const steps = document.querySelectorAll('.process-step');
  steps.forEach(step => {
    const stepName = step.getAttribute('data-step');
    
    // 클래스 초기화
    step.classList.remove('active', 'completed');
    
    // 현재 단계에 따른 활성화 단계 결정
    let activeStep = '';
    let completedSteps = [];
    
    if (currentStep >= 1 && currentStep <= 2) {
      // 단계 1-2: 업로드 단계 활성화
      activeStep = STEPS.UPLOAD;
    } 
    else if (currentStep >= 3 && currentStep <= 4) {
      // 단계 3-4: 블록아웃 단계 활성화, 업로드 단계 완료 
      activeStep = STEPS.BLOCKOUT;
      completedSteps = [STEPS.UPLOAD];
    }
    else if (currentStep >= 5 && currentStep <= 6) {
      // 단계 5-6: 라이브러리 단계 활성화, 업로드와 블록아웃 단계 완료
      activeStep = STEPS.LIBRARY;
      completedSteps = [STEPS.UPLOAD, STEPS.BLOCKOUT];
    }
    else if (currentStep >= 7 && currentStep <= 8) {
      // 단계 7-8: 플리퍼 단계 활성화, 이전 단계들 완료
      activeStep = STEPS.FLIPPER;
      completedSteps = [STEPS.UPLOAD, STEPS.BLOCKOUT, STEPS.LIBRARY];
    }
    else if (currentStep >= 9) {
      // 단계 9: 익스포트 단계 활성화, 이전 단계들 완료
      activeStep = STEPS.EXPORT;
      completedSteps = [STEPS.UPLOAD, STEPS.BLOCKOUT, STEPS.LIBRARY, STEPS.FLIPPER];
    }
    
    // 현재 활성화 단계 표시
    if (stepName === activeStep) {
      step.classList.add('active');
    }
    
    // 완료된 단계 표시
    if (completedSteps.includes(stepName)) {
      step.classList.add('completed');
    }
  });
}

/**
 * 현재 단계에 따라 UI 컴포넌트 표시/숨김
 */
function updateUIVisibility() {
  // 모든 UI 컴포넌트
  const uploadUI = document.getElementById('upload-ui');
  const sculptUI = document.getElementById('sculpt-ui');
  const blockoutUI = document.getElementById('blockout-ui');
  const dragHint = document.getElementById('drag-hint');
  
  // 디버그 로그
  console.log('현재 단계:', currentStep);
  
  // 모든 UI 숨기기
  if (uploadUI) uploadUI.style.display = 'none';
  if (sculptUI) sculptUI.style.display = 'none';
  if (blockoutUI) blockoutUI.style.display = 'none';
  if (dragHint) dragHint.style.display = 'none';
  
  // 이전 단계의 특수 UI들 정리
  if (currentStep !== 5 && currentStep !== 6) {
    cleanupLibraryMode();
  }
  
  if (currentStep !== 7 && currentStep !== 8) {
    cleanupFlipperUI();
  }
  
  if (currentStep !== 9) {
    cleanupExportUI();
  }
  
  // 현재 단계 숫자에 따라 적절한 UI 표시
  switch (currentStep) {
    case 1: // 업로드 UI 표시
      if (uploadUI) uploadUI.style.display = 'block';
      if (dragHint) dragHint.style.display = 'block';
      break;
      
    case 2: // 스컬프 UI 표시 (업로드 단계)
      if (sculptUI) sculptUI.style.display = 'block';
      break;
      
    case 3: // 블록아웃 UI 표시 (블록아웃 단계)
      if (blockoutUI) blockoutUI.style.display = 'block';
      break;
      
    case 4: // 스컬프 UI 표시 (블록아웃 단계)
      if (sculptUI) sculptUI.style.display = 'block';
      break;
      
    case 5: // 라이브러리 UI 표시
      initLibraryMode(); // Initialize library UI
      if (sculptUI) sculptUI.style.display = 'none'; // Hide sculpt UI
      break;
    
    case 6: // 스컬프 UI 표시 (라이브러리 단계)
      if (sculptUI) sculptUI.style.display = 'block';
      break;
      
    case 7: // 플리퍼 UI 표시
      initFlipperUI(); // Initialize flipper UI
      if (sculptUI) sculptUI.style.display = 'none'; // Hide sculpt UI
      break;
      
    case 8: // 스컬프 UI 표시 (플리퍼 단계)
      if (sculptUI) sculptUI.style.display = 'block';
      break;
      
    case 9: // 익스포트 UI 표시
      initExportUI(); // Initialize export UI
      if (sculptUI) sculptUI.style.display = 'none'; // Hide sculpt UI
      break;
      
    default: // 기타 단계
      if (sculptUI) sculptUI.style.display = 'block';
      break;
  }
}

/**
 * 단계 설정 함수 - 특정 단계로 직접 이동
 */
export function setStep(step) {
  if (step >= 1) {
    currentStep = step;
    updateTopBar();
    updateUIVisibility();
    console.log('단계 변경됨:', currentStep);
    
    // 전역 상태 업데이트 - 이벤트 발생
    window.dispatchEvent(new CustomEvent('appStepChanged', { 
      detail: { step: currentStep } 
    }));
  } else {
    console.error('잘못된 단계 번호:', step);
  }
}

/**
 * 업로드 완료 시 - 단계 2로 변경
 */
export function completeUpload() {
  setStep(2); // 단계 2: 업로드 단계 + 스컬프 UI
  console.log('업로드 완료 - 스컬프 UI 표시');
}

/**
 * 스컬프 완료 시 - 현재 단계에 따라 다음 단계로 진행
 */
export function completeSculpting() {
  if (currentStep === 2) {
    // 업로드 후 첫 스컬프 완료: 단계 3으로 (블록아웃 UI)
    setStep(3);
  } 
  else if (currentStep === 4) {
    // 블록아웃 후 스컬프 완료: 단계 5로 (라이브러리 UI)
    setStep(5);
  }
  else if (currentStep === 6) {
    // 라이브러리 후 스컬프 완료: 단계 7로 (플리퍼 UI)
    setStep(7);
  }
  else if (currentStep === 8) {
    // 플리퍼 후 스컬프 완료: 단계 9로 (익스포트 UI)
    setStep(9);
  }
  console.log('스컬프 완료 - 다음 단계로 진행:', currentStep);
}

/**
 * 블록아웃 완료 시 - 단계 4로 변경 (블록아웃 단계 + 스컬프 UI)
 */
export function completeBlockout() {
  setStep(4); // 단계 4: 블록아웃 단계 + 스컬프 UI
  console.log('블록아웃 완료 - 스컬프 UI로 돌아감');
}

/**
 * 라이브러리 완료 시 - 단계 6으로 변경 (라이브러리 단계 + 스컬프 UI)
 */
export function completeLibrary() {
  setStep(6); // 단계 6: 라이브러리 단계 + 스컬프 UI
  console.log('라이브러리 완료 - 스컬프 UI로 돌아감');
}

/**
 * 플리퍼 완료 시 - 단계 8로 변경 (플리퍼 단계 + 스컬프 UI)
 */
export function completeFlipper() {
  setStep(8); // 단계 8: 플리퍼 단계 + 스컬프 UI
  console.log('플리퍼 완료 - 스컬프 UI로 돌아감');
}

/**
 * 특정 단계 이름으로 이동 (단계명 기반)
 * 주로 상단바 클릭을 위한 함수
 */
export function goToStep(stepName) {
  // 단계명에 따라 적절한 숫자 단계로 이동
  switch (stepName) {
    case STEPS.UPLOAD:
      setStep(1); // 업로드 단계의 시작점
      break;
    case STEPS.BLOCKOUT:
      setStep(3); // 블록아웃 단계의 시작점
      break;
    case STEPS.LIBRARY:
      setStep(5); // 라이브러리 단계의 시작점
      break;
    case STEPS.FLIPPER:
      setStep(7); // 플리퍼 단계의 시작점
      break;
    case STEPS.EXPORT:
      setStep(9); // 익스포트 단계
      break;
    default:
      console.error('알 수 없는 단계 이름:', stepName);
  }
}

/**
 * 단계 UI 초기화 및 이벤트 설정
 */
export function initProcessSteps() {
  // 초기 UI 업데이트
  updateTopBar();
  updateUIVisibility();
  
  // 단계 클릭 이벤트 - 사용자가 단계를 직접 클릭하여 이동할 수 있도록 설정
  const steps = document.querySelectorAll('.process-step');
  steps.forEach(step => {
    step.addEventListener('click', () => {
      const stepName = step.getAttribute('data-step');
      goToStep(stepName);
    });
  });
}

// Expose functions for global access (for use in library UI)
window.appSteps = {
  getCurrentStep,
  isLibraryStep,
  isFlipperStep,
  canSculpt,
  completeSculpting,
  completeBlockout,
  completeLibrary,
  completeFlipper,
  STEPS
};