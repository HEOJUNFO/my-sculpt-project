// src/processSteps.js
// 프로세스 단계를 숫자로 관리하는 모듈

// Import UI module integration functions
import { initLibraryMode, cleanupLibraryMode } from '../features/library/libraryIntegration.js';
import { initFlipperUI, cleanupFlipperUI } from '../features/flipper/flipperUI.js';
import { initExportUI, cleanupExportUI } from '../features/export/exportUI.js';
import { initToothRemovalUI, cleanupToothRemovalUI, setupToothRemovalEventHandlers } from '../features/tooth-removal/toothRemovalUI.js';
import { refs } from '../models/modelManager.js';


// 단계 정의 (상수)
export const STEPS = {
  UPLOAD: 'upload',
  BLOCKOUT: 'blockout',
  TOOTH_REMOVAL: 'tooth-removal',
  LIBRARY: 'library',
  FLIPPER: 'flipper',
  EXPORT: 'export'
};

// 단계 숫자 정의 (tooth-removal 추가로 인한 재정의)
// 1 = 업로드 UI (초기 단계)
// 2 = 업로드 단계 + 스컬프 UI
// 3 = 블록아웃 단계 + 블록아웃 UI
// 4 = 블록아웃 단계 + 스컬프 UI
// 5 = 치아 제거 단계 + 치아 제거 UI
// 6 = 치아 제거 단계 + 스컬프 UI
// 7 = 라이브러리 단계 + 라이브러리 UI
// 8 = 라이브러리 단계 + 스컬프 UI
// 9 = 플리퍼 단계 + 플리퍼 UI
// 10 = 플리퍼 단계 + 스컬프 UI
// 11 = 익스포트 단계 + 익스포트 UI

// 현재 단계 숫자 (처음에는 1: 업로드 UI)
let currentStep = 1;

/**
 * 현재 단계 번호를 반환하는 함수
 */
export function getCurrentStep() {
  return currentStep;
}

/**
 * 현재 단계가 치아 제거 단계인지 확인하는 함수
 */
export function isToothRemovalStep() {
  return currentStep === 5;
}

/**
 * 현재 단계가 라이브러리 단계인지 확인하는 함수
 */
export function isLibraryStep() {
  return currentStep === 7;
}

/**
 * 현재 단계가 플리퍼 단계인지 확인하는 함수
 */
export function isFlipperStep() {
  return currentStep === 9;
}

/**
 * 현재 단계가 스컬프를 실행해도 되는 단계인지 확인
 */
export function canSculpt() {
  // 단계 2, 4, 6, 8, 10에서만 스컬프 가능
  return currentStep === 2 || currentStep === 4 || currentStep === 6 || currentStep === 8 || currentStep === 10;
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
      // 단계 5-6: 치아 제거 단계 활성화, 업로드와 블록아웃 단계 완료
      activeStep = STEPS.TOOTH_REMOVAL;
      completedSteps = [STEPS.UPLOAD, STEPS.BLOCKOUT];
    }
    else if (currentStep >= 7 && currentStep <= 8) {
      // 단계 7-8: 라이브러리 단계 활성화, 이전 단계들 완료
      activeStep = STEPS.LIBRARY;
      completedSteps = [STEPS.UPLOAD, STEPS.BLOCKOUT, STEPS.TOOTH_REMOVAL];
    }
    else if (currentStep >= 9 && currentStep <= 10) {
      // 단계 9-10: 플리퍼 단계 활성화, 이전 단계들 완료
      activeStep = STEPS.FLIPPER;
      completedSteps = [STEPS.UPLOAD, STEPS.BLOCKOUT, STEPS.TOOTH_REMOVAL, STEPS.LIBRARY];
    }
    else if (currentStep >= 11) {
      // 단계 11: 익스포트 단계 활성화, 이전 단계들 완료
      activeStep = STEPS.EXPORT;
      completedSteps = [STEPS.UPLOAD, STEPS.BLOCKOUT, STEPS.TOOTH_REMOVAL, STEPS.LIBRARY, STEPS.FLIPPER];
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
  const toothRemovalUI = document.getElementById('tooth-removal-ui');
  const dragHint = document.getElementById('drag-hint');
  
  // 디버그 로그
  console.log('현재 단계:', currentStep);
  
  // 모든 UI 숨기기
  if (uploadUI) uploadUI.style.display = 'none';
  if (sculptUI) sculptUI.style.display = 'none';
  if (blockoutUI) blockoutUI.style.display = 'none';
  if (toothRemovalUI) toothRemovalUI.style.display = 'none';
  if (dragHint) dragHint.style.display = 'none';
  
  // 이전 단계의 특수 UI들 정리
  if (currentStep !== 5 && currentStep !== 6) {
    cleanupToothRemovalUI();
  }
  
  if (currentStep !== 7 && currentStep !== 8) {
    cleanupLibraryMode();
  }
  
  if (currentStep !== 9 && currentStep !== 10) {
    cleanupFlipperUI();
  }
  
  if (currentStep !== 11) {
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
      
    case 5: // 치아 제거 UI 표시
      initToothRemovalUI(); // Initialize tooth removal UI
      if (toothRemovalUI) toothRemovalUI.style.display = 'block';
      if (sculptUI) sculptUI.style.display = 'none'; // Hide sculpt UI
      break;
    
    case 6: // 스컬프 UI 표시 (치아 제거 단계)
      if (sculptUI) sculptUI.style.display = 'block';
      break;
      
    case 7: // 라이브러리 UI 표시
      initLibraryMode(); // Initialize library UI
      if (sculptUI) sculptUI.style.display = 'none'; // Hide sculpt UI
      break;
    
    case 8: // 스컬프 UI 표시 (라이브러리 단계)
      if (sculptUI) sculptUI.style.display = 'block';
      break;
      
    case 9: // 플리퍼 UI 표시
      initFlipperUI(); // Initialize flipper UI
      if (sculptUI) sculptUI.style.display = 'none'; // Hide sculpt UI
      break;
      
    case 10: // 스컬프 UI 표시 (플리퍼 단계)
      if (sculptUI) sculptUI.style.display = 'block';
      break;
      
    case 11: // 익스포트 UI 표시
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
    // 블록아웃 후 스컬프 완료: 단계 5로 (치아 제거 UI)
    setStep(5);
  }
  else if (currentStep === 6) {
    // 치아 제거 후 스컬프 완료: 단계 7로 (라이브러리 UI)
    setStep(7);
  }
  else if (currentStep === 8) {
    // 라이브러리 후 스컬프 완료: 단계 9로 (플리퍼 UI)
    setStep(9);
  }
  else if (currentStep === 10) {
    // 플리퍼 후 스컬프 완료: 단계 11로 (익스포트 UI)
    setStep(11);
  }
  console.log('스컬프 완료 - 다음 단계로 진행:', currentStep);
}

// 원래 모델(잇몸)을 찾는 함수 추가
function findBaseModel() {
  // 모델 리스트에서 라이브러리 치아가 아닌 모델 찾기
  if (window.modelList) {
    // modelList 배열을 순회하며 원래 모델 찾기
    for (const item of window.modelList) {
      // 라이브러리 치아가 아닌 메쉬를 찾음 (userData.isLibraryTooth가 없거나 false)
      if (item.mesh && (!item.mesh.userData || !item.mesh.userData.isLibraryTooth)) {
        return item.mesh;
      }
    }
  }
  
  // 또는 씬에서 직접 찾기
  if (refs.scene) {
    for (const object of refs.scene.children) {
      if (object.isMesh && (!object.userData || !object.userData.isLibraryTooth)) {
        return object;
      }
    }
  }
  
  // 찾지 못한 경우
  console.warn('원래 모델(잇몸)을 찾을 수 없습니다.');
  return null;
}

/**
 * 블록아웃 완료 시 - 단계 4로 변경 (블록아웃 단계 + 스컬프 UI)
 */
export function completeBlockout() {
  setStep(4); // 단계 4: 블록아웃 단계 + 스컬프 UI
  console.log('블록아웃 완료 - 스컬프 UI로 돌아감');
}

/**
 * 치아 제거 완료 시 - 단계 6으로 변경 (치아 제거 단계 + 스컬프 UI)
 */
export function completeToothRemoval() {
  setStep(6); // 단계 6: 치아 제거 단계 + 스컬프 UI
  console.log('치아 제거 완료 - 스컬프 UI로 돌아감');
}

/**
 * 라이브러리 완료 시 - 단계 8로 변경 (라이브러리 단계 + 스컬프 UI)
 */
export function completeLibrary() {
  setStep(8); // 단계 8: 라이브러리 단계 + 스컬프 UI
  console.log('라이브러리 완료 - 스컬프 UI로 돌아감');
}

/**
 * 플리퍼 완료 시 - 단계 10으로 변경 (플리퍼 단계 + 스컬프 UI)
 */
export function completeFlipper() {
  setStep(10); // 단계 10: 플리퍼 단계 + 스컬프 UI
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
    case STEPS.TOOTH_REMOVAL:
      setStep(5); // 치아 제거 단계의 시작점
      break;
    case STEPS.LIBRARY:
      setStep(7); // 라이브러리 단계의 시작점
      break;
    case STEPS.FLIPPER:
      setStep(9); // 플리퍼 단계의 시작점
      break;
    case STEPS.EXPORT:
      setStep(11); // 익스포트 단계
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
  isToothRemovalStep,
  isLibraryStep,
  isFlipperStep,
  canSculpt,
  completeSculpting,
  completeBlockout,
  completeToothRemoval,
  completeLibrary,
  completeFlipper,
  STEPS
};