// src/processSteps.js
// 프로세스 단계를 관리하는 모듈

export const STEPS = {
  UPLOAD: 'upload',
  SCULPT: 'sculpt',        // 백엔드에서만 사용되는 스컬프 단계 (UI에 표시되지 않음)
  BLOCKOUT: 'blockout',
  LIBRARY: 'library',
  FLIPPER: 'flipper',
  EXPORT: 'export'
};

// 현재 UI 표시 단계와 내부 워크플로우 단계
let currentDisplayStep = STEPS.UPLOAD;  // UI에 표시되는 단계
let currentWorkflowState = {
  inSculptMode: false,     // 현재 스컬프 모드인지 여부
  completedUpload: false,  // 업로드 완료 여부
  completedBlockout: false, // 블록아웃 완료 여부
  completedLibrary: false,  // 라이브러리 완료 여부
  completedFlipper: false   // 플리퍼 완료 여부
};

const completedSteps = new Set();

/**
 * UI 업데이트 - 현재 단계와 완료된 단계를 시각적으로 표시
 */
export function updateStepsUI() {
  const steps = document.querySelectorAll('.process-step');
  steps.forEach(step => {
    const stepName = step.getAttribute('data-step');
    
    // 클래스 초기화
    step.classList.remove('active', 'completed');
    
    // 현재 단계 표시
    if (stepName === currentDisplayStep) {
      step.classList.add('active');
    }
    
    // 완료된 단계 표시
    if (completedSteps.has(stepName)) {
      step.classList.add('completed');
    }
  });
}

/**
 * 스컬프 모드 전환
 * @param {boolean} enabled - 스컬프 모드 활성화 여부
 */
export function setSculptMode(enabled) {
  currentWorkflowState.inSculptMode = enabled;
  
  // 스컬프 UI와 블록아웃 UI 전환
  const sculptUI = document.getElementById('sculpt-ui');
  const blockoutUI = document.getElementById('blockout-ui');
  
  if (sculptUI && blockoutUI) {
    if (enabled) {
      sculptUI.style.display = 'block';
      blockoutUI.style.display = 'none';
    } else {
      // 현재 표시 단계가 블록아웃일 때만 블록아웃 UI 표시
      if (currentDisplayStep === STEPS.BLOCKOUT) {
        sculptUI.style.display = 'none';
        blockoutUI.style.display = 'block';
      }
    }
  }
}

/**
 * 스컬프 완료 처리
 * 각 메인 단계 사이에 스컬프 작업이 있으므로, 현재 어느 단계에서 완료되었는지 확인하고 다음 단계로 진행
 */
export function completeSculpting() {
  // 현재 어느 단계에서 스컬프 완료가 호출되었는지에 따라 다음 단계 결정
  if (!currentWorkflowState.completedUpload) {
    // 업로드 후 첫 스컬프 완료 시
    currentWorkflowState.completedUpload = true;
    completedSteps.add(STEPS.UPLOAD);
    currentDisplayStep = STEPS.BLOCKOUT;
    setSculptMode(false); // 스컬프 모드 비활성화
  } 
  else if (!currentWorkflowState.completedBlockout) {
    // 블록아웃 후 스컬프 완료 시
    currentWorkflowState.completedBlockout = true;
    completedSteps.add(STEPS.BLOCKOUT);
    currentDisplayStep = STEPS.LIBRARY;
    setSculptMode(false);
  }
  else if (!currentWorkflowState.completedLibrary) {
    // 라이브러리 후 스컬프 완료 시
    currentWorkflowState.completedLibrary = true;
    completedSteps.add(STEPS.LIBRARY);
    currentDisplayStep = STEPS.FLIPPER;
    setSculptMode(false);
  }
  else if (!currentWorkflowState.completedFlipper) {
    // 플리퍼 후 스컬프 완료 시
    currentWorkflowState.completedFlipper = true;
    completedSteps.add(STEPS.FLIPPER);
    currentDisplayStep = STEPS.EXPORT;
    setSculptMode(false);
  }
  
  updateStepsUI();
}

/**
 * 블록아웃 완료 처리
 * 블록아웃 완료 후 다시 스컬프 모드로 전환
 */
export function completeBlockout() {
  // 블록아웃 UI는 숨기고, 스컬프 UI 표시
  const blockoutUI = document.getElementById('blockout-ui');
  const sculptUI = document.getElementById('sculpt-ui');
  
  if (blockoutUI && sculptUI) {
    blockoutUI.style.display = 'none';
    sculptUI.style.display = 'block';
  }
  
  // 스컬프 모드 활성화 (블록아웃 완료 후 스컬프 작업이 필요함)
  setSculptMode(true);
}

/**
 * 파일 업로드 완료 처리
 * 업로드 후 바로 스컬프 모드로 전환
 */
export function completeUpload() {
  // 스컬프 모드 활성화
  setSculptMode(true);
}

/**
 * 특정 단계로 이동 (UI 상에서만)
 * @param {string} step - 이동할 단계 이름
 */
export function goToStep(step) {
  if (Object.values(STEPS).includes(step)) {
    currentDisplayStep = step;
    updateStepsUI();
    
    // 스컬프 <-> 블록아웃 UI 전환
    if (step === STEPS.BLOCKOUT && !currentWorkflowState.inSculptMode) {
      const sculptUI = document.getElementById('sculpt-ui');
      const blockoutUI = document.getElementById('blockout-ui');
      
      if (sculptUI && blockoutUI) {
        sculptUI.style.display = 'none';
        blockoutUI.style.display = 'block';
      }
    }
  } else {
    console.error('잘못된 단계 이름:', step);
  }
}

/**
 * 단계 UI 초기화 및 이벤트 설정
 */
export function initProcessSteps() {
  // 초기 UI 업데이트
  updateStepsUI();
  
  // 단계 클릭 이벤트 - 사용자가 단계를 직접 클릭하여 이동할 수 있도록 설정
  const steps = document.querySelectorAll('.process-step');
  steps.forEach(step => {
    step.addEventListener('click', () => {
      const stepName = step.getAttribute('data-step');
      goToStep(stepName);
    });
  });
}