// src/exportUI.js
import { exportCurrentModel } from './modelManager.js';

// Export UI container 
let exportUIContainer = null;

/**
 * Initialize the Export UI
 * This function will be called when transitioning to the export step (step 9)
 */
export function initExportUI() {
  console.log('Initializing Export UI');
  
  // Create UI container if not exists
  if (!exportUIContainer) {
    exportUIContainer = document.createElement('div');
    exportUIContainer.id = 'export-ui';
    exportUIContainer.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 400px;
      background: #ffffff;
      color: #000;
      font: 14px sans-serif;
      padding: 20px;
      border: 1px solid #444;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      text-align: center;
    `;
    
    exportUIContainer.innerHTML = `
      <h2 style="margin: 0 0 20px 0; font-size: 24px; color: #333;">
        모델 내보내기
      </h2>
      
      <div style="
        background-color: #f5f5f5;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
        text-align: left;
      ">
        <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #333;">
          내보내기 형식 선택
        </h3>
        
        <div style="margin-bottom: 15px;">
          <input type="radio" id="format-stl" name="export-format" value="stl" checked>
          <label for="format-stl" style="margin-left: 5px;">STL 파일 (3D 프린팅용)</label>
        </div>
        
        <div style="margin-bottom: 15px;">
          <input type="radio" id="format-obj" name="export-format" value="obj">
          <label for="format-obj" style="margin-left: 5px;">OBJ 파일 (텍스처 포함)</label>
        </div>
        
        <div>
          <input type="radio" id="format-gltf" name="export-format" value="gltf">
          <label for="format-gltf" style="margin-left: 5px;">glTF 파일 (웹 표시용)</label>
        </div>
      </div>
      
      <div style="
        background-color: #f5f5f5;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
        text-align: left;
      ">
        <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #333;">
          추가 옵션
        </h3>
        
        <div style="margin-bottom: 10px;">
          <input type="checkbox" id="option-binary" checked>
          <label for="option-binary" style="margin-left: 5px;">바이너리 형식 (더 작은 파일 크기)</label>
        </div>
        
        <div>
          <input type="checkbox" id="option-compress">
          <label for="option-compress" style="margin-left: 5px;">ZIP으로 압축하기</label>
        </div>
      </div>
      
      <div style="display: flex; gap: 10px; justify-content: center;">
        <button id="btn-export-model" style="
          padding: 12px 24px;
          background: #7066FF;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
        ">
          내보내기
        </button>
        
        <button id="btn-cancel-export" style="
          padding: 12px 24px;
          background: #f5f5f5;
          color: #333;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
        ">
          취소
        </button>
      </div>
    `;
    
    document.body.appendChild(exportUIContainer);
    
    // Add event listeners
    setupExportEvents();
  }
}

/**
 * Set up event listeners for the Export UI
 */
function setupExportEvents() {
  // Export button
  const exportBtn = document.getElementById('btn-export-model');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      // Get selected format
      const formatSTL = document.getElementById('format-stl');
      const formatOBJ = document.getElementById('format-obj');
      const formatGLTF = document.getElementById('format-gltf');
      
      let format = 'stl';
      if (formatOBJ && formatOBJ.checked) format = 'obj';
      if (formatGLTF && formatGLTF.checked) format = 'gltf';
      
      // Get options
      const binaryOption = document.getElementById('option-binary')?.checked || false;
      const compressOption = document.getElementById('option-compress')?.checked || false;
      
      console.log(`Exporting as ${format} (binary: ${binaryOption}, compress: ${compressOption})`);
      
      // For now, just use the existing export function from modelManager
      exportCurrentModel();
      
      // Show success message
      const successMessage = document.createElement('div');
      successMessage.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(76, 175, 80, 0.9);
        color: white;
        padding: 12px 24px;
        border-radius: 4px;
        font-weight: bold;
        z-index: 2000;
        transition: opacity 0.5s;
      `;
      successMessage.textContent = '모델이 성공적으로 내보내졌습니다!';
      document.body.appendChild(successMessage);
      
      // Remove the success message after 3 seconds
      setTimeout(() => {
        successMessage.style.opacity = '0';
        setTimeout(() => {
          successMessage.remove();
        }, 500);
      }, 3000);
    });
  }
  
  // Cancel button
  const cancelBtn = document.getElementById('btn-cancel-export');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      cleanupExportUI();
    });
  }
}

/**
 * Clean up the Export UI
 */
export function cleanupExportUI() {
  console.log('Cleaning up Export UI');
  
  if (exportUIContainer) {
    exportUIContainer.remove();
    exportUIContainer = null;
  }
}