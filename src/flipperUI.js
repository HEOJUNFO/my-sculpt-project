// src/flipperUI.js
import { completeFlipper } from './processSteps.js';

// Flipper UI container 
let flipperUIContainer = null;

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
      width: 210px;
      background: #d9d9d9;
      color: #fff;
      font: 14px sans-serif;
      padding: 10px;
      border: 1px solid #444;
      border-radius: 4px;
    `;
    
    flipperUIContainer.innerHTML = `
      <h2 style="margin: 0 0 4px 0; font-size: 14px; text-align: left; color: #000;">
        플리퍼 도구
      </h2>
      <hr style="border: none; border-top: 1px solid #666; margin: 6px 0;">
      
      <p id="flipper-info" style="color: #000; margin-bottom: 10px;">
        플리퍼 모드에서는 의치 플리퍼를 선택하고 조정할 수 있습니다.
      </p>
      
      <button id="btn-generate-flipper" class="brush-btn btn-full" style="
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
      ">
        <span style="display: inline-flex; align-items: center;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          플리퍼 생성
        </span>
      </button>
      
      <div class="slider-row" style="
        background-color: #ccc; 
        padding: 8px;
        margin-bottom: 12px;
        border-radius: 4px;
      ">
        <label for="flipperThicknessRange" style="
          display: inline-block;
          font-size: 12px;
          margin-bottom: 6px;
          color: #000;
        ">두께 조절</label>
        <input 
          type="range" 
          id="flipperThicknessRange" 
          min="0.5" 
          max="3" 
          step="0.1" 
          value="1.5"
          class="custom-slider"
          style="width: 100%;"
        />
      </div>
      
      <button id="btn-apply-flipper" class="brush-btn btn-full" style="
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
      ">
        <span style="display: inline-flex; align-items: center;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          플리퍼 적용
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
      ">
        <span style="display: inline-flex; align-items: center;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          플리퍼 완료
        </span>
      </button>
    `;
    
    document.body.appendChild(flipperUIContainer);
    
    // Add event listeners
    setupFlipperEvents();
  }
}

/**
 * Set up event listeners for the Flipper UI
 */
function setupFlipperEvents() {
  // Generate Flipper button
  const generateBtn = document.getElementById('btn-generate-flipper');
  if (generateBtn) {
    generateBtn.addEventListener('click', () => {
      const infoText = document.getElementById('flipper-info');
      if (infoText) {
        infoText.textContent = '플리퍼를 생성 중입니다...';
      }
      
      // Simulate processing time
      setTimeout(() => {
        if (infoText) {
          infoText.textContent = '플리퍼가 생성되었습니다. 두께를 조절하고 적용하세요.';
        }
      }, 1500);
    });
  }
  
  // Apply Flipper button
  const applyBtn = document.getElementById('btn-apply-flipper');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const thickness = document.getElementById('flipperThicknessRange')?.value || 1.5;
      const infoText = document.getElementById('flipper-info');
      
      if (infoText) {
        infoText.textContent = `두께 ${thickness}mm로 플리퍼를 적용 중입니다...`;
      }
      
      // Simulate processing time
      setTimeout(() => {
        if (infoText) {
          infoText.textContent = '플리퍼가 적용되었습니다. 원하는 결과가 나오면 완료 버튼을 클릭하세요.';
        }
      }, 1500);
    });
  }
  
  // Complete Flipper button
  const completeBtn = document.getElementById('btn-flipper-complete');
  if (completeBtn) {
    completeBtn.addEventListener('click', () => {
      // Call the completion function
      cleanupFlipperUI();
      completeFlipper();
    });
  }
  
  // Thickness slider
  const thicknessSlider = document.getElementById('flipperThicknessRange');
  if (thicknessSlider) {
    thicknessSlider.addEventListener('input', () => {
      // Update any visuals based on thickness if needed
      console.log(`Flipper thickness set to: ${thicknessSlider.value}mm`);
    });
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
}