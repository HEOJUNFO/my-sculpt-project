// src/features/tooth-removal/toothRemovalUI.ts
// 치아 제거 UI 시스템

import { toothRemovalSystem } from './toothRemovalCore.js';
import { DrawingPointData } from '../../utils/lassoSelection.js';

/**
 * 치아 제거 UI 초기화
 */
export function initToothRemovalUI(): void {
  console.log('치아 제거 UI 초기화');

  // 치아 제거 시스템 초기화
  const success = toothRemovalSystem.init({
    onUpdateMessage: updateToothRemovalInfoText,
    onPointProgress: onToothPointProgress,
    onSelectionComplete: onToothSelectionComplete,
    onRemovalComplete: onToothRemovalComplete,
    onError: onToothRemovalError
  });

  if (success) {
    // 선택 시작
    toothRemovalSystem.startSelection();
    
    // UI 상태 업데이트
    updateUIState();
    
    updateToothRemovalInfoText('치아 제거 모드가 활성화되었습니다. Alt 키를 누른 상태에서 제거할 치아 영역을 선택하세요.');
  } else {
    updateToothRemovalInfoText('치아 제거 모드 초기화에 실패했습니다.');
  }
}

/**
 * 치아 제거 UI 정리
 */
export function cleanupToothRemovalUI(): void {
  console.log('치아 제거 UI 정리');
  
  try {
    // 시스템이 활성화된 상태에서만 정리 작업 수행
    const systemState = toothRemovalSystem.getState();
    if (systemState.isActive || systemState.hasBackup) {
      // lasso 마커와 선들 완전 제거
      toothRemovalSystem.completeToothRemoval();
      
      // 시스템 정리
      toothRemovalSystem.cleanup();
    }
  } catch (error) {
    console.warn('치아 제거 시스템 정리 중 오류 (무시됨):', error);
    // 에러가 발생해도 UI 정리는 계속 진행
  }
  
  // UI 상태 초기화
  updateUIState();
  updateToothRemovalInfoText('');
}

/**
 * 치아 제거 실행
 */
export function executeToothRemoval(): void {
  console.log('치아 제거 실행');
  
  const state = toothRemovalSystem.getState();
  if (!state.isSelectionComplete) {
    updateToothRemovalInfoText('먼저 제거할 치아 영역을 선택해주세요.');
    return;
  }

  // 제거 실행
  toothRemovalSystem.removeTooth();
}

/**
 * 원본 상태로 되돌리기 (메쉬만 복원, lasso 선택 유지)
 */
export function restoreToothRemoval(): void {
  console.log('치아 제거 되돌리기 (메쉬만)');
  
  toothRemovalSystem.restoreOriginal();
  updateUIState();
}

/**
 * 모든 것 초기화 (lasso 선택 + 완전 원본 메쉬 복원)
 */
export function resetToothSelection(): void {
  console.log('치아 제거 시스템 전체 초기화');
  
  // 완전 원본 geometry로 복원 (모든 치아 제거 취소)
  toothRemovalSystem.restoreToCompleteOriginal();
  updateUIState();
}

/**
 * 다음 치아 제거 (현재 치아 제거 확정하고 새로운 치아 선택)
 */
export function nextToothRemoval(): void {
  console.log('다음 치아 제거 시작');
  
  toothRemovalSystem.finalizeCurrent();
  updateUIState();
}

/**
 * 치아 점 추가 진행 콜백
 */
function onToothPointProgress(_pointCount: number): void {
  updateUIState();
}

/**
 * 치아 선택 완료 콜백
 */
function onToothSelectionComplete(_points: DrawingPointData[]): void {
  updateUIState();
}

/**
 * 치아 제거 완료 콜백
 */
function onToothRemovalComplete(): void {
  updateUIState();
}

/**
 * 치아 제거 오류 콜백
 */
function onToothRemovalError(error: string): void {
  console.error('치아 제거 오류:', error);
  updateToothRemovalInfoText(`오류: ${error}`);
}

/**
 * UI 상태 업데이트
 */
function updateUIState(): void {
  try {
    const state = toothRemovalSystem.getState();
    
    // 치아 제거 버튼 - 영역 선택 완료 시 활성화
    const removeBtn = document.getElementById('btn-remove-tooth') as HTMLButtonElement | null;
    if (removeBtn) {
      removeBtn.disabled = !state.isSelectionComplete || state.isRemovalComplete;
      if (state.isSelectionComplete && !state.isRemovalComplete) {
        removeBtn.classList.add('active');
      } else {
        removeBtn.classList.remove('active');
      }
    }

    // 되돌리기 버튼 - 치아 제거 완료 시 활성화 (메쉬만 복원)
    const restoreBtn = document.getElementById('btn-restore-tooth') as HTMLButtonElement | null;
    if (restoreBtn) {
      restoreBtn.disabled = !state.isRemovalComplete;
      if (state.isRemovalComplete) {
        restoreBtn.classList.add('active');
      } else {
        restoreBtn.classList.remove('active');
      }
    }

    // 초기화 버튼 - 선택이 시작되었거나 완료되었을 때 활성화 (모든 것 초기화)
    const resetBtn = document.getElementById('btn-reset-tooth-selection') as HTMLButtonElement | null;
    if (resetBtn) {
      // 선택된 점이 있거나, 선택 완료, 제거 완료 상태면 활성화
      const canReset = state.isActive && (state.isSelectionComplete || state.isRemovalComplete);
      resetBtn.disabled = !canReset;
      if (canReset) {
        resetBtn.classList.add('active');
      } else {
        resetBtn.classList.remove('active');
      }
    }

    // 다음 치아 제거 버튼 - 치아 제거 완료 시 활성화
    const nextBtn = document.getElementById('btn-next-tooth-removal') as HTMLButtonElement | null;
    if (nextBtn) {
      nextBtn.disabled = !state.isRemovalComplete;
      if (state.isRemovalComplete) {
        nextBtn.classList.add('active');
      } else {
        nextBtn.classList.remove('active');
      }
    }
  } catch (error) {
    console.warn('치아 제거 UI 상태 업데이트 중 오류:', error);
  }
}

/**
 * 정보 텍스트 업데이트
 */
export function updateToothRemovalInfoText(text: string): void {
  try {
    const infoElement = document.getElementById('tooth-removal-info') as HTMLElement | null;
    if (infoElement) {
      infoElement.textContent = text;
    }
  } catch (error) {
    console.warn('치아 제거 정보 텍스트 업데이트 중 오류:', error);
  }
}

/**
 * 치아 제거 버튼 이벤트 핸들러
 */
export function setupToothRemovalEventHandlers(): void {
  // 치아 제거 버튼
  const removeBtn = document.getElementById('btn-remove-tooth') as HTMLButtonElement | null;
  if (removeBtn) {
    removeBtn.addEventListener('click', executeToothRemoval);
  }

  // 되돌리기 버튼  
  const restoreBtn = document.getElementById('btn-restore-tooth') as HTMLButtonElement | null;
  if (restoreBtn) {
    restoreBtn.addEventListener('click', restoreToothRemoval);
  }

  // 선택 초기화 버튼
  const resetBtn = document.getElementById('btn-reset-tooth-selection') as HTMLButtonElement | null;
  if (resetBtn) {
    resetBtn.addEventListener('click', resetToothSelection);
  }

  // 다음 치아 제거 버튼
  const nextBtn = document.getElementById('btn-next-tooth-removal') as HTMLButtonElement | null;
  if (nextBtn) {
    nextBtn.addEventListener('click', nextToothRemoval);
  }

  console.log('치아 제거 이벤트 핸들러 설정 완료');
}
