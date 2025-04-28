// src/libraryIntegration.js
import { refs } from './modelManager.js';
import { loadModuleExports } from './moduleLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

// Global UI container for the library
let libraryUIContainer = null;
let modulesLoaded = false;

/**
 * Initialize the library mode UI
 * This should be called when transitioning to the library step
 */
export function initLibraryMode() {
  console.log('Initializing library mode UI');
  
  // Create library UI container if not exists
  if (!libraryUIContainer) {
    libraryUIContainer = document.createElement('div');
    libraryUIContainer.id = 'library-ui-container';
    document.body.appendChild(libraryUIContainer);
  
    // Load required CSS
    const style = document.createElement('style');
    style.textContent = `
      #dental-chart-container {
        position: fixed;
        left: 20px;
        top: 50%;
        transform: translateY(-50%);
        width: 350px;
        background-color: white;
        border-radius: 10px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        z-index: 1000;
      }
      .jaw-label {
        text-align: center;
        margin: 20px 0 10px;
        font-size: 16px;
        font-weight: bold;
        color: #333;
      }
      .teeth-container {
        position: relative;
        height: 240px;
        margin: 0 auto;
        width: 100%;
      }
      .tooth {
        position: absolute;
        width: 30px;
        height: 45px;
        transition: transform 0.2s;
        display: flex;
        flex-direction: column;
        align-items: center;
        z-index: 10;
        cursor: pointer;
      }
      .tooth:hover {
        transform: scale(1.1);
      }
      .tooth.selected {
        border: 2px solid #FF5722;
        border-radius: 8px;
        background-color: rgba(255, 87, 34, 0.1);
      }
      .tooth-image {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .tooth-number {
        position: absolute;
        width: 15px;
        height: 15px;
        border-radius: 50%;
        background-color: #4691E0;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: bold;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        z-index: 20;
      }
      
      #model-selection-ui {
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        padding: 15px;
        z-index: 1100;
        width: 320px;
        max-height: 80vh;
        overflow-y: auto;
      }
      
      #placement-ui {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: white;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 15px;
        z-index: 1200;
        display: none;
        width: 350px;
      }
      
      .loading-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top: 4px solid white;
        animation: spin 1s linear infinite;
        margin-bottom: 10px;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  // 로딩 메시지 표시
  const loadingMessage = document.createElement('div');
  loadingMessage.id = 'library-loading-message';
  loadingMessage.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 20px;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 2000;
  `;
  loadingMessage.innerHTML = `
    <div class="loading-spinner"></div>
    <p>라이브러리 모듈을 로드하는 중...</p>
  `;
  document.body.appendChild(loadingMessage);

  if (!modulesLoaded) {
    // 모듈 로드 및 초기화
    Promise.all([
      // dentalChartUI 모듈 로드
      loadModuleExports('/src/library/dentalChartUI.js', [
        'createDentalChartUI',
        'highlightSelectedTooth'
      ]),
      
      // modelSelectionUI 모듈 로드
      loadModuleExports('/src/library/modelSelectionUI.js', [
        'initModelSelection',
        'loadSTLModel',
        'loadToothModel'
      ]),
      
      // toothPlacementUI 모듈 로드
      loadModuleExports('/src/library/toothPlacementUI.js', [
        'initToothPlacement',
        'addPlacedTooth',
        'isPlacementActive',
        'startToothPlacement'
      ])
    ])
    .then(() => {
      console.log('모든 라이브러리 모듈이 로드되었습니다');
      modulesLoaded = true;
      
      // 로딩 메시지 제거
      const loadingMsg = document.getElementById('library-loading-message');
      if (loadingMsg) {
        loadingMsg.remove();
      }
      
      // 라이브러리 UI 초기화
      initLibraryUI();
    })
    .catch(error => {
      console.error('라이브러리 모듈 로드 중 오류 발생:', error);
      
      // 오류 발생 시 로딩 메시지 업데이트
      const loadingMsg = document.getElementById('library-loading-message');
      if (loadingMsg) {
        loadingMsg.innerHTML = `
          <div style="color: #ff6b6b; font-size: 24px; margin-bottom: 10px;">⚠️</div>
          <p>라이브러리 모듈을 로드하는 중 오류가 발생했습니다.</p>
          <p style="font-size: 12px; margin-top: 10px;">${error.message}</p>
          <button id="retry-load-btn" style="
            margin-top: 15px;
            padding: 8px 16px;
            background: #4691E0;
            border: none;
            border-radius: 4px;
            color: white;
            cursor: pointer;
          ">다시 시도</button>
        `;
        
        // 다시 시도 버튼에 이벤트 리스너 추가
        document.getElementById('retry-load-btn')?.addEventListener('click', () => {
          loadingMsg.remove();
          initLibraryMode();
        });
      }
    });
  } else {
    // 모듈이 이미 로드된 경우 바로 초기화
    const loadingMsg = document.getElementById('library-loading-message');
    if (loadingMsg) {
      loadingMsg.remove();
    }
    
    initLibraryUI();
  }
}

/**
 * 모듈 로드 후 라이브러리 UI 초기화
 */
function initLibraryUI() {
  // 치아 차트 UI 생성
  if (typeof window.createDentalChartUI === 'function') {
    window.createDentalChartUI();
  } else {
    console.error('createDentalChartUI 함수를 찾을 수 없습니다');
  }
  
  // 모델 선택 초기화
  if (typeof window.initModelSelection === 'function') {
    const stlLoader = new STLLoader();
    window.initModelSelection(stlLoader, (geometry) => {
      // 기존 addModelToScene 함수 사용
      if (refs.addModelToScene) {
        refs.addModelToScene(geometry, 'Library Model');
      }
    });
  } else {
    console.error('initModelSelection 함수를 찾을 수 없습니다');
  }
  
  // 치아 배치 초기화
  if (typeof window.initToothPlacement === 'function') {
    window.initToothPlacement(
      refs.scene,
      refs.camera,
      refs.renderer,
      refs.controls
    );
  } else {
    console.error('initToothPlacement 함수를 찾을 수 없습니다');
  }
  
  // 컨트롤 패널 생성
  createLibraryControlPanel();
}

/**
 * Create a control panel for library mode with a completion button
 */
function createLibraryControlPanel() {
  const panel = document.createElement('div');
  panel.id = 'library-control-panel';
  panel.style.cssText = `
    position: fixed;
    right: 20px;
    top: 20px;
    background: #fff;
    padding: 15px;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    z-index: 1100;
  `;
  
  panel.innerHTML = `
    <h3 style="margin: 0 0 10px 0;">라이브러리 모드</h3>
    <p style="font-size: 14px; margin: 0 0 15px 0;">
      상악 또는 하악의 치아를 선택하여 모델을 배치하세요.
    </p>
    <button id="complete-library-btn" style="
      background: #7066FF;
      color: white;
      border: none;
      padding: 8px 15px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
    ">라이브러리 완료</button>
  `;
  
  document.body.appendChild(panel);
  
  // Add event listener for completion button
  document.getElementById('complete-library-btn').addEventListener('click', () => {
    // Call the completion function from processSteps
    if (window.appSteps && window.appSteps.completeSculpting) {
      window.appSteps.completeSculpting();
    }
    
    // Clean up the library UI
    cleanupLibraryMode();
  });
}

/**
 * Cleanup library mode UI components
 * This should be called when transitioning to the next step
 */
export function cleanupLibraryMode() {
  console.log('Cleaning up library mode UI');
  
  // Remove dental chart if it exists
  const dentalChart = document.getElementById('dental-chart-container');
  if (dentalChart) dentalChart.remove();
  
  // Remove model selection UI if it exists
  const modelSelectionUI = document.getElementById('model-selection-ui');
  if (modelSelectionUI) modelSelectionUI.remove();
  
  // Remove placement UI if it exists
  const placementUI = document.getElementById('placement-ui');
  if (placementUI) placementUI.remove();
  
  // Remove library control panel if it exists
  const controlPanel = document.getElementById('library-control-panel');
  if (controlPanel) controlPanel.remove();
  
  // Remove library container if it exists
  if (libraryUIContainer) {
    libraryUIContainer.remove();
    libraryUIContainer = null;
  }
}