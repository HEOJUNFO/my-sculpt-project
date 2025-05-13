// src/flipper/flipperUI.js
import { completeFlipper } from '../processSteps.js';
import { 
  initFlipperDrawing, 
  setFlipperThickness, 
  cleanupFlipperModule
} from './flipperDrawing.js';
import { generateFlipper } from './flipperGeometry.js';

// Flipper UI container 
let flipperUIContainer = null;
let teethVisible = true; // 치아 가시성 상태를 추적하는 변수 추가

/**
 * Initialize the Flipper UI
 * This function will be called when transitioning to the flipper step (step 7)
 */
export function initFlipperUI() {
  console.log('Initializing Flipper UI');
  
  // Create UI container if not exists
  if (!flipperUIContainer) {
    flipperUIContainer = document.createElement('div');
    flipperUIContainer.id = 'flipper-ui';
    flipperUIContainer.style.cssText = `
      position: absolute;
      left: 10px;
      bottom: 10px;
      width: 270px;
      background: #d9d9d9;
      color: #fff;
      font: 14px sans-serif;
      padding: 15px;
      border: 1px solid #444;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    `;
    
    flipperUIContainer.innerHTML = `
      <h2 style="margin: 0 0 8px 0; font-size: 16px; text-align: left; color: #000; font-weight: bold;">
        플리퍼 도구
      </h2>
      <hr style="border: none; border-top: 1px solid #666; margin: 6px 0;">
      
      <div id="flipper-instructions" style="
        background: #f0f0f0;
        border-radius: 4px;
        padding: 8px;
        margin-bottom: 12px;
        color: #333;
        font-size: 12px;
      ">
        <p style="margin: 0 0 4px 0; font-weight: bold;">사용 방법:</p>
        <ol style="margin: 0; padding-left: 18px;">
          <li>Alt 키를 누른 상태에서 모델에 점을 찍어 플리퍼 영역을 표시하세요.</li>
          <li>점 제거: 점을 클릭하면 삭제됩니다.</li>
          <li>특정 점부터 다시 그리기: Alt+점 클릭으로 해당 점 이후를 제거하고 다시 그립니다.</li>
          <li>영역을 닫으려면 첫 번째 초록색 점을 클릭하세요.</li>
          <li>두께를 조절한 후, 플리퍼 생성 버튼을 클릭하세요.</li>
        </ol>
      </div>
      
      <p id="flipper-info" style="color: #000; margin-bottom: 10px; min-height: 40px;">
        플리퍼 모드가 시작되었습니다. Alt 키를 누른 상태에서 점을 찍어 플리퍼 영역을 지정하세요.
      </p>
      
      <div class="slider-row" style="
        background-color: #ccc; 
        padding: 8px;
        margin-bottom: 12px;
        border-radius: 4px;
      ">
        <label for="flipperThicknessRange" style="
          display: block;
          font-size: 13px;
          margin-bottom: 6px;
          color: #000;
        ">두께 조절 (mm)</label>
        <div style="display: flex; align-items: center;">
          <input 
            type="range" 
            id="flipperThicknessRange" 
            min="0.2" 
            max="5" 
            step="0.1" 
            value="1.0"
            class="custom-slider"
            style="flex: 1; margin-right: 8px;"
          />
          <span id="thickness-value" style="color: #000; font-weight: bold;">1.0mm</span>
        </div>
      </div>
      
      <!-- 치아 숨기기/보이기 버튼 추가 -->
      <button id="btn-toggle-teeth" class="brush-btn btn-full" style="
        display: block;
        width: 100%;
        margin-bottom: 12px;
        text-align: center;
        background: #5c6bc0;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        height: 36px;
        position: relative;
        overflow: hidden;
      ">
        <span style="display: flex; align-items: center; justify-content: center;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          치아 숨기기
        </span>
      </button>
      
      <button id="btn-generate-flipper" class="brush-btn btn-full" style="
        display: block;
        width: 100%;
        margin-bottom: 12px;
        text-align: center;
        background: #555;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        height: 36px;
        position: relative;
        overflow: hidden;
        disabled: true;
      ">
        <span style="display: flex; align-items: center; justify-content: center;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          플리퍼 생성
        </span>
      </button>
      
      <button id="btn-flipper-complete" class="brush-btn btn-full" style="
        display: block;
        width: 100%;
        margin-bottom: 8px;
        text-align: center;
        background: #555;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        height: 36px;
        disabled: true;
      ">
        <span style="display: flex; align-items: center; justify-content: center;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          플리퍼 완료
        </span>
      </button>
      
      <button id="btn-reset-flipper" class="brush-btn btn-full" style="
        display: block;
        width: 100%;
        text-align: center;
        background: #444;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        height: 36px;
      ">
        <span style="display: flex; align-items: center; justify-content: center;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
            <path d="M3 2v6h6"></path>
            <path d="M3 13a9 9 0 1 0 3-7.7L3 8"></path>
          </svg>
          초기화
        </span>
      </button>
    `;
    
    document.body.appendChild(flipperUIContainer);
    
    // Add event listeners
    setupFlipperEvents();
    
    // 플리퍼 그리기 모드 시작
    initFlipperDrawing();
  }
}

/**
 * Set up event listeners for the Flipper UI
 */
function setupFlipperEvents() {
  // 두께 슬라이더
  const thicknessSlider = document.getElementById('flipperThicknessRange');
  const thicknessValue = document.getElementById('thickness-value');
  
  if (thicknessSlider) {
    thicknessSlider.addEventListener('input', () => {
      const value = parseFloat(thicknessSlider.value);
      
      // UI 업데이트
      if (thicknessValue) {
        thicknessValue.textContent = `${value.toFixed(1)}mm`;
      }
      
      // 플리퍼 두께 설정
      setFlipperThickness(value);
    });
  }
  
  // 치아 숨기기/보이기 버튼 이벤트 리스너 추가
  const toggleTeethBtn = document.getElementById('btn-toggle-teeth');
  if (toggleTeethBtn) {
    toggleTeethBtn.addEventListener('click', () => {
      toggleTeethVisibility();
    });
  }
  
  // 플리퍼 생성 버튼
  const generateBtn = document.getElementById('btn-generate-flipper');
  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.addEventListener('click', () => {
      // 로딩 효과 표시
      generateBtn.innerHTML = '<span style="display: inline-block; width: 16px; height: 16px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: flipper-spin 1s linear infinite;"></span> 생성 중...';
      generateBtn.disabled = true;
      
      // 스타일 추가
      const styleEl = document.createElement('style');
      styleEl.textContent = `
        @keyframes flipper-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(styleEl);
      
      // 약간의 지연 후 실행 (UI 업데이트를 위해)
      setTimeout(() => {
        const success = generateFlipper();
        
        // 버튼 상태 원복
        if (success) {
          generateBtn.innerHTML = '<span style="display: flex; align-items: center; justify-content: center;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>플리퍼 생성 완료</span>';
          generateBtn.style.background = '#4CAF50';
          
          // 완료 버튼 활성화
          const completeBtn = document.getElementById('btn-flipper-complete');
          if (completeBtn) {
            completeBtn.disabled = false;
            completeBtn.classList.add('active');
          }
        } else {
          generateBtn.innerHTML = '<span style="display: flex; align-items: center; justify-content: center;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>플리퍼 생성</span>';
          generateBtn.disabled = false;
        }
      }, 500);
    });
  }
  
  // 완료 버튼
  const completeBtn = document.getElementById('btn-flipper-complete');
  if (completeBtn) {
    completeBtn.disabled = true; // 초기에는 비활성화
    completeBtn.addEventListener('click', () => {
      // 리소스 정리
      cleanupFlipperModule(true);
      
      // UI 제거
      cleanupFlipperUI();
      
      // 치아 가시성 복원 (만약 숨겨져 있었다면)
      if (!teethVisible) {
        toggleTeethVisibility();
      }
      
      // 단계 완료 처리
      completeFlipper();
    });
  }
  
  // 초기화 버튼
  const resetBtn = document.getElementById('btn-reset-flipper');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      // 확인 대화상자
      if (confirm('모든 플리퍼 작업을 초기화하시겠습니까?')) {
        // 플리퍼 모듈 초기화
        cleanupFlipperModule();
        
        // 그리기 모드 재시작
        initFlipperDrawing();
        
        // 버튼 상태 초기화
        if (generateBtn) {
          generateBtn.disabled = true;
          generateBtn.style.background = '#555';
          generateBtn.innerHTML = '<span style="display: flex; align-items: center; justify-content: center;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>플리퍼 생성</span>';
        }
        
        if (completeBtn) {
          completeBtn.disabled = true;
          completeBtn.classList.remove('active');
        }
      }
    });
  }
}

/**
 * 치아 가시성 토글 함수
 * 배치된 모든 치아의 가시성을 토글합니다.
 */
function toggleTeethVisibility() {
  teethVisible = !teethVisible; // 상태 토글
  
  // 버튼 텍스트 변경
  const toggleBtn = document.getElementById('btn-toggle-teeth');
  if (toggleBtn) {
    const btnIcon = teethVisible ? 
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' :
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
    
    toggleBtn.innerHTML = `<span style="display: flex; align-items: center; justify-content: center;">
      ${btnIcon}
      ${teethVisible ? '치아 숨기기' : '치아 보이기'}
    </span>`;
    
    // 버튼 색상 변경
    toggleBtn.style.background = teethVisible ? '#5c6bc0' : '#ff7043';
  }
  
  // 치아 가시성 변경
  let placedTeeth = [];
  
  // window.placedTeeth 또는 window.appLib.getPlacedTeeth() 중 하나를 사용
  if (window.placedTeeth) {
    placedTeeth = window.placedTeeth;
  } else if (window.appLib && window.appLib.getPlacedTeeth) {
    placedTeeth = window.appLib.getPlacedTeeth();
  }
  
  // 배치된 모든 치아의 가시성을 토글
  placedTeeth.forEach(tooth => {
    if (tooth && tooth.visible !== undefined) {
      tooth.visible = teethVisible;
    }
  });
  
  // 상태 메시지 표시
  const message = document.createElement('div');
  message.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(33, 150, 243, 0.9);
    color: white;
    padding: 10px 20px;
    border-radius: 4px;
    font-weight: bold;
    z-index: 2000;
    transition: opacity 0.5s;
  `;
  message.textContent = teethVisible ? '치아가 표시되었습니다.' : '치아가 숨겨졌습니다.';
  document.body.appendChild(message);
  
  // 3초 후 메시지 사라짐
  setTimeout(() => {
    message.style.opacity = '0';
    setTimeout(() => message.remove(), 500);
  }, 3000);
  
  console.log(`치아 가시성 변경: ${teethVisible ? '표시' : '숨김'}`);
}

/**
 * 플리퍼 정보 텍스트 업데이트 함수
 * flipperDrawing.js에서 사용
 */
export function updateFlipperInfoText(text) {
  const infoElement = document.getElementById('flipper-info');
  if (infoElement) {
    infoElement.textContent = text;
  }
}

/**
 * Clean up the Flipper UI
 * This function will be called when transitioning out of the flipper step
 */
export function cleanupFlipperUI() {
  console.log('Cleaning up Flipper UI');
  
  if (flipperUIContainer) {
    flipperUIContainer.remove();
    flipperUIContainer = null;
  }
  
  // 치아 가시성 복원 (만약 숨겨져 있었다면)
  if (!teethVisible) {
    // 치아를 다시 표시
    let placedTeeth = [];
    if (window.placedTeeth) {
      placedTeeth = window.placedTeeth;
    } else if (window.appLib && window.appLib.getPlacedTeeth) {
      placedTeeth = window.appLib.getPlacedTeeth();
    }
    
    placedTeeth.forEach(tooth => {
      if (tooth && tooth.visible !== undefined) {
        tooth.visible = true;
      }
    });
    
    // 가시성 상태 변수 초기화
    teethVisible = true;
  }
}