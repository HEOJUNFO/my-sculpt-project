// src/exportUI.js
import { exportCurrentModel } from '../../modelManager.js';
import { refs } from '../../modelManager.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import * as THREE from 'three';

// External reference to placed teeth from libraryIntegration.js
let placedTeeth = [];

// Export UI container 
let exportUIContainer = null;

/**
 * Initialize the Export UI
 * This function will be called when transitioning to the export step (step 9)
 */
export function initExportUI() {
  console.log('Initializing Export UI');
  
  // Try to get the placedTeeth array from window object (set in libraryIntegration.js)
  if (window.appLib && window.appLib.getPlacedTeeth) {
    placedTeeth = window.appLib.getPlacedTeeth();
  } else if (window.placedTeeth) {
    placedTeeth = window.placedTeeth;
  }
  
  console.log(`Found ${placedTeeth.length} placed teeth for export`);
  
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
          내보내기 형식
        </h3>
        
        <div style="margin-bottom: 15px;">
          <input type="radio" id="format-stl" name="export-format" value="stl" checked>
          <label for="format-stl" style="margin-left: 5px;">STL 파일 (3D 프린팅용)</label>
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
      
      <div style="
        background-color: #e6f7ff;
        padding: 15px;
        border-radius: 8px;
        margin-bottom: 20px;
        text-align: left;
        border-left: 4px solid #1890ff;
      ">
        <p style="margin: 0; font-size: 14px;">
          <strong>내보내기 상태:</strong> 베이스 모델 + ${placedTeeth.length}개의 치아가 하나의 STL 파일로 결합됩니다.
        </p>
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
      // 디버깅 정보 출력
      debugExportIssue();
      
      // 씬에 보이는 그대로 내보내기
      exportExactAsShown();
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
 * 제대로 작동하지 않는 원인을 진단하는 함수
 */
function debugExportIssue() {
  console.log("==== 내보내기 치아 문제 디버깅 ====");
  
  console.log("1. window.placedTeeth 확인:", window.placedTeeth);
  if (window.placedTeeth) {
    console.log("   placedTeeth 길이:", window.placedTeeth.length);
    if (window.placedTeeth.length > 0) {
      console.log("   첫 번째 치아 샘플:", window.placedTeeth[0]);
      console.log("   첫 번째 치아 userData:", window.placedTeeth[0].userData);
      console.log("   첫 번째 치아 재질:", window.placedTeeth[0].material);
      console.log("   첫 번째 치아 지오메트리:", window.placedTeeth[0].geometry);
    }
  }
  
  console.log("2. window.appLib 확인:", window.appLib);
  if (window.appLib && window.appLib.getPlacedTeeth) {
    const teeth = window.appLib.getPlacedTeeth();
    console.log("   appLib.getPlacedTeeth() 결과:", teeth);
    console.log("   치아 개수:", teeth.length);
  }
  
  console.log("3. refs.scene 확인:", refs.scene);
  if (refs.scene) {
    console.log("   씬 내 객체 개수:", refs.scene.children.length);
    const teethInScene = refs.scene.children.filter(
      obj => obj.userData && obj.userData.type === 'placedTooth'
    );
    console.log("   씬에서 찾은 치아 개수:", teethInScene.length);
    if (teethInScene.length > 0) {
      console.log("   씬 내 첫 번째 치아:", teethInScene[0]);
    }
  }
  
  console.log("==== 디버깅 끝 ====");
}

/**
 * 씬에서 보이는 그대로의 크기로 결합 모델 내보내기
 * 스케일 역변환을 적용하지 않고 씬에 보이는 그대로 내보냅니다.
 */
function exportExactAsShown() {
  console.log("🚀 씬에 보이는 그대로 내보내기 시작...");

  // 베이스 모델 확인 
  if (!refs.targetMesh) {
    console.error('내보내기 실패: 베이스 모델(잇몸)이 없습니다.');
    alert('먼저 기본 모델(잇몸)을 로드해주세요.');
    return;
  }

  // 내보내기 설정 가져오기
  const formatSTL = document.getElementById('format-stl');
  
  let format = 'stl';
  
  const binaryOption = document.getElementById('option-binary')?.checked || false;
  console.log(`내보내기 형식: ${format}, 바이너리: ${binaryOption}`);
  
  // 씬에서 치아 모델 및 베이스 모델 수집
  const objectsToExport = [];
  
  // 베이스 모델 추가 (크기 변경 없이 그대로)
  console.log("베이스 모델 준비...");
  const baseModelClone = refs.targetMesh.clone();
  // 중요: 지오메트리를 복제하되 스케일 변환 없이 그대로 사용
  baseModelClone.geometry = refs.targetMesh.geometry.clone(); 
  
  // 재질 설정 (기존 재질 유지 가능성도 포함)
  baseModelClone.material = new THREE.MeshStandardMaterial({
    name: 'base-model-material',
    color: 0xc58182,  // 잇몸 색상 (분홍빛)
    roughness: 0.7,
    metalness: 0.1,
  });
  
  // 중요: 베이스 모델의 월드 트랜스폼을 그대로 유지
  baseModelClone.position.copy(refs.targetMesh.position);
  baseModelClone.rotation.copy(refs.targetMesh.rotation);
  baseModelClone.scale.copy(refs.targetMesh.scale);
  
  objectsToExport.push(baseModelClone);
  
  // 씬에서 치아 찾기 (userData.type === 'placedTooth' 인 객체)
  const teethInScene = refs.scene.children.filter(
    obj => obj.isMesh && obj.userData && obj.userData.type === 'placedTooth'
  );
  
  console.log(`씬에서 찾은 치아: ${teethInScene.length}개`);
  
  // 각 치아를 직접 복제하여 내보내기 목록에 추가
  let addedTeethCount = 0;
  
  teethInScene.forEach((tooth, index) => {
    try {
      console.log(`치아 #${index} (ID: ${tooth.userData.toothId || 'unknown'}) 처리 중...`);
      
      // 치아 복제 (크기 변경 없이 그대로)
      const toothClone = tooth.clone();
      toothClone.geometry = tooth.geometry.clone();
      
      // 치아 재질 생성 (ID에 따라 다른 색상 적용)
      toothClone.material = new THREE.MeshStandardMaterial({
        name: `tooth-${tooth.userData.toothId || index}-material`,
        color: getToothColor(tooth.userData.toothId),
        roughness: 0.4,
        metalness: 0.2,
      });
      
      // 중요: 원본 치아의 월드 트랜스폼을 그대로 적용
      toothClone.position.copy(tooth.position);
      toothClone.rotation.copy(tooth.rotation);
      toothClone.scale.copy(tooth.scale);
      toothClone.userData = { ...tooth.userData };
      
      // 내보내기 목록에 추가
      objectsToExport.push(toothClone);
      addedTeethCount++;
      
    } catch (err) {
      console.error(`치아 #${index} 추가 중 오류:`, err);
    }
  });
  
  // 배열에서 치아를 로드할 수 없다면 window.placedTeeth에서 시도
  if (addedTeethCount === 0 && window.placedTeeth && window.placedTeeth.length > 0) {
    console.log("window.placedTeeth에서 직접 치아 추가 시도...");
    
    window.placedTeeth.forEach((tooth, index) => {
      try {
        const toothClone = tooth.clone();
        toothClone.geometry = tooth.geometry.clone();
        
        toothClone.material = new THREE.MeshStandardMaterial({
          color: getToothColor(tooth.userData?.toothId),
          roughness: 0.4,
          metalness: 0.2
        });
        
        // 중요: 원본 치아의 월드 트랜스폼을 그대로 적용
        toothClone.position.copy(tooth.position);
        toothClone.rotation.copy(tooth.rotation);
        toothClone.scale.copy(tooth.scale);
        
        // 내보내기 목록에 추가
        objectsToExport.push(toothClone);
        addedTeethCount++;
        
      } catch (err) {
        console.error(`window.placedTeeth #${index} 추가 실패:`, err);
      }
    });
  }
  
  console.log(`내보내기 준비 완료: 베이스 모델 + ${addedTeethCount}개 치아`);
  
  // 결합 모델을 생성할 씬 준비
  const exportScene = new THREE.Scene();
  
  // 모든 객체를 씬에 추가
  objectsToExport.forEach(obj => exportScene.add(obj));
  
  // 씬의 월드 행렬 업데이트 (중요)
  exportScene.updateMatrixWorld(true);
  
  // 선택한 형식으로 내보내기
  try {
    console.log("STL 형식으로 내보내기...");
    const exporter = new STLExporter();
    
    // 중요: STL 내보내기 시 모든 메시의 행렬을 업데이트
    exportScene.traverse((obj) => {
      if (obj.isMesh) {
        obj.updateMatrix();
      }
    });
    
    const stlContent = exporter.parse(exportScene, { binary: binaryOption });
    
    downloadContent(
      stlContent, 
      'combined_model.stl', 
      binaryOption ? 'application/octet-stream' : 'text/plain'
    );
    
    showSuccessMessage(addedTeethCount);
  } catch (error) {
    console.error('내보내기 오류:', error);
    alert('모델 내보내기 중 오류가 발생했습니다.');
  }
}

/**
 * 콘텐츠 다운로드 유틸리티 함수
 */
function downloadContent(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.style.display = 'none';
  document.body.appendChild(link);
  link.href = url;
  link.download = filename;
  link.click();
  
  // 리소스 정리
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(link);
  }, 100);
}

/**
 * 성공 메시지 표시
 */
function showSuccessMessage(teethCount) {
  const message = document.createElement('div');
  message.style.cssText = `
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
  message.textContent = `모델이 성공적으로 내보내졌습니다! (베이스 모델 + ${teethCount}개 치아)`;
  document.body.appendChild(message);
  
  setTimeout(() => {
    message.style.opacity = '0';
    setTimeout(() => message.remove(), 500);
  }, 3000);
}

/**
 * 치아 ID에 따른 색상 가져오기
 * @param {string} toothId - 치아 ID
 * @returns {number} - 색상 코드 (16진수)
 */
function getToothColor(toothId) {
  // 치아 ID를 숫자로 변환
  const id = parseInt(toothId);
  
  // 치아 사분면에 따른 색상 스키마
  if (id >= 11 && id <= 18) {
    // 상악 우측 - 약간의 파란빛이 도는 흰색
    return 0xf0f8ff;
  } else if (id >= 21 && id <= 28) {
    // 상악 좌측 - 약간의 노란빛이 도는 흰색
    return 0xfcfcf0;
  } else if (id >= 31 && id <= 38) {
    // 하악 좌측 - 약간의 초록빛이 도는 흰색
    return 0xf0fcf0;
  } else if (id >= 41 && id <= 48) {
    // 하악 우측 - 약간의 분홍빛이 도는 흰색
    return 0xfff0f5;
  }
  
  // 기본값 - 순수한 흰색
  return 0xffffff;
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