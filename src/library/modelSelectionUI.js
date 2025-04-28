// Model Selection UI module
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as THREE from 'three';
import { highlightSelectedTooth } from './dentalChartUI.js';
import { startToothPlacement } from './toothPlacementUI.js';

// Module variables
let stlLoader;
let setTargetMeshGeometryFn;

// 3D 프리뷰 관련 변수
let previewScene, previewCamera, previewRenderer, previewControls;
let previewContainer, previewMesh;

// Matcap 텍스처 관리
const matcaps = {};
matcaps['Clay'] = new THREE.TextureLoader().load('textures/B67F6B_4B2E2A_6C3A34_F3DBC6-256px.png');

/**
 * Initialize model selection functionality
 * @param {STLLoader} loader - The STL loader instance
 * @param {Function} setGeometryFn - Function to set the target mesh geometry
 */
export function initModelSelection(loader, setGeometryFn) {
  stlLoader = loader;
  setTargetMeshGeometryFn = setGeometryFn;
  
  // Matcap 텍스처 인코딩 설정
  for (const key in matcaps) {
    matcaps[key].encoding = THREE.sRGBEncoding;
  }
  
  // Add styles for model selection UI
  const styleElement = document.createElement('style');
  styleElement.textContent = `
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
    .ui-header {
      display: flex;
      flex-direction: column;
      margin-bottom: 10px;
    }
    .ui-header h3 {
      margin: 0;
      font-size: 18px;
      color: #333;
      text-align: center;
    }
    .ui-actions {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 15px;
      margin-top: 10px;
    }
    .ui-actions button {
      padding: 8px 12px;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
      transition: background-color 0.2s;
    }
    .models-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 15px;
    }
    .model-item {
      display: flex;
      align-items: center;
      padding: 10px;
      border-radius: 8px;
      cursor: pointer;
      transition: background-color 0.2s;
      border: 1px solid #e0e0e0;
    }
    .model-item:hover {
      background-color: #f5f5f5;
    }
    .model-item.selected {
      background-color: #e3f2fd;
      border-color: #2196F3;
    }
    .model-preview {
      width: 40px;
      height: 40px;
      background-color: #f0f0f0;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 12px;
    }
    .model-icon {
      font-size: 24px;
    }
    .model-info {
      flex: 1;
    }
    .model-name {
      font-weight: bold;
      color: #333;
      margin-bottom: 4px;
    }
    .model-group {
      font-size: 12px;
      color: #666;
    }
    
    /* 프리뷰 관련 스타일 추가 */
    #model-preview-container {
      width: 100%;
      height: 220px;
      background-color: #f8f8f8;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 15px;
      position: relative;
      box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.1);
    }
    
    .preview-loading {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: rgba(255, 255, 255, 0.7);
      z-index: 1;
    }
    
    .preview-loading-spinner {
      width: 30px;
      height: 30px;
      border: 3px solid rgba(33, 150, 243, 0.3);
      border-radius: 50%;
      border-top: 3px solid #2196F3;
      animation: spin 1s linear infinite;
    }
    
    #preview-controls-hint {
      position: absolute;
      bottom: 10px;
      left: 10px;
      background-color: rgba(0, 0, 0, 0.6);
      color: white;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 4px;
      pointer-events: none;
      opacity: 0.8;
    }
    
    #place-model-btn {
      background-color: #4caf50;
      color: white;
      flex: 1;
    }
    #place-model-btn:hover {
      background-color: #45a049;
    }
    #cancel-model-btn {
      background-color: #f5f5f5;
      color: #333;
    }
    #cancel-model-btn:hover {
      background-color: #e0e0e0;
    }
    #loading-message {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 20px;
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      z-index: 2000;
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
  document.head.appendChild(styleElement);
}

/**
 * 프리뷰 화면 초기화
 * @param {HTMLElement} container - 프리뷰를 표시할 컨테이너
 */
function initPreviewScene(container) {
  // 씬 생성
  previewScene = new THREE.Scene();
  previewScene.background = new THREE.Color(0xf8f8f8);
  
  // 카메라 생성
  previewCamera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
  previewCamera.position.set(0, 5, 10);
  
  // 렌더러 생성
  previewRenderer = new THREE.WebGLRenderer({ antialias: true });
  previewRenderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(previewRenderer.domElement);
  
  // 컨트롤 추가
  previewControls = new OrbitControls(previewCamera, previewRenderer.domElement);
  previewControls.enableDamping = true;
  previewControls.dampingFactor = 0.25;
  
  // 조명 추가
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  previewScene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1, 1, 1);
  previewScene.add(directionalLight);
  
  // 그리드 헬퍼 제거함
  
  // 컨트롤 힌트 추가
  const hintElement = document.createElement('div');
  hintElement.id = 'preview-controls-hint';
  hintElement.textContent = '마우스 드래그: 회전 / 휠: 확대/축소';
  container.appendChild(hintElement);
  
  // 애니메이션 루프 시작
  animatePreview();
}

/**
 * 프리뷰 애니메이션 루프
 */
function animatePreview() {
  if (!previewRenderer) return;
  
  requestAnimationFrame(animatePreview);
  previewControls.update();
  previewRenderer.render(previewScene, previewCamera);
}

/**
 * 모델 프리뷰 로드
 * @param {string} modelPath - 모델 파일 경로
 */
function loadModelPreview(modelPath) {
  // 로딩 표시
  if (previewContainer) {
    const loadingElement = document.createElement('div');
    loadingElement.className = 'preview-loading';
    loadingElement.innerHTML = '<div class="preview-loading-spinner"></div>';
    loadingElement.id = 'preview-loading';
    previewContainer.appendChild(loadingElement);
  }
  
  // 기존 프리뷰 메시 제거
  if (previewMesh && previewScene) {
    previewScene.remove(previewMesh);
    previewMesh = null;
  }
  
  // 모델 로드
  const loader = new STLLoader();
  loader.load(
    modelPath,
    (geometry) => {
      // 재질 생성
      const material = new THREE.MeshMatcapMaterial({
        flatShading: false,
        side: THREE.DoubleSide,
        matcap: matcaps['Clay']
      });
      for (const key in matcaps) matcaps[key].encoding = THREE.sRGBEncoding;
      
      // 메시 생성
      previewMesh = new THREE.Mesh(geometry, material);
      
      // 메시 중앙 정렬
      geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);
      
      // 씬에 추가
      previewScene.add(previewMesh);
      
      // 로딩 표시 제거
      const loadingElement = document.getElementById('preview-loading');
      if (loadingElement) {
        loadingElement.remove();
      }
      
      // 카메라 및 컨트롤 초기화 (모델 중심으로)
      const boundingBox = new THREE.Box3().setFromObject(previewMesh);
      const size = boundingBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = previewCamera.fov * (Math.PI / 180);
      const cameraDistance = maxDim / (2 * Math.tan(fov / 2));
      
      previewCamera.position.set(0, cameraDistance * 0.6, cameraDistance);
      previewControls.target.set(0, 0, 0);
      previewControls.update();
    },
    // 로드 진행 상황
    (xhr) => {
      console.log((xhr.loaded / xhr.total * 100) + '% 로드됨');
    },
    // 오류 처리
    (error) => {
      console.error('프리뷰 모델 로드 오류:', error);
      
      // 로딩 표시 제거
      const loadingElement = document.getElementById('preview-loading');
      if (loadingElement) {
        loadingElement.remove();
      }
    }
  );
}

/**
 * 프리뷰 리소스 정리
 */
function cleanupPreview() {
  if (previewRenderer) {
    previewRenderer.dispose();
    previewRenderer.domElement.remove();
    previewRenderer = null;
  }
  
  if (previewControls) {
    previewControls.dispose();
    previewControls = null;
  }
  
  previewScene = null;
  previewCamera = null;
  previewMesh = null;
  previewContainer = null;
}

/**
 * Load a tooth model
 * @param {string} toothId - The tooth ID to load
 */
export function loadToothModel(toothId) {
  // Highlight selected tooth in UI
  highlightSelectedTooth(toothId);
  
  // All possible model paths
  const modelPaths = ['AA', 'AK', 'ED', 'JM', 'JS', 'ND', 'VB', 'YL'];
  
  // Show loading message
  showLoadingMessage(toothId);
  
  // Check model availability and load
  const availableModels = [];
  let loadedCount = 0;
  
  modelPaths.forEach(path => {
    // Create STL file path
    const stlPath = `/models/${path}/${path}_${toothId}.stl`;
    
    // Check if file exists
    checkFileExists(stlPath)
      .then(exists => {
        loadedCount++;
        
        if (exists) {
          availableModels.push({
            path: stlPath,
            name: `${path}_${toothId}`,
            group: path
          });
        }
        
        // When all paths are checked, show model selection UI
        if (loadedCount === modelPaths.length) {
          hideLoadingMessage();
          if (availableModels.length > 0) {
            showModelSelectionUI(toothId, availableModels);
          } else {
            alert(`${toothId}번 치아에 사용 가능한 모델이 없습니다.`);
          }
        }
      })
      .catch(error => {
        console.error(`Path check error (${stlPath}):`, error);
        loadedCount++;
        
        // When all paths are checked, show model selection UI
        if (loadedCount === modelPaths.length) {
          hideLoadingMessage();
          if (availableModels.length > 0) {
            showModelSelectionUI(toothId, availableModels);
          } else {
            alert(`${toothId}번 치아에 사용 가능한 모델이 없습니다.`);
          }
        }
      });
  });
}

/**
 * Check if a file exists
 * @param {string} url - The URL to check
 * @returns {Promise<boolean>} - Promise resolving to true if file exists
 */
function checkFileExists(url) {
  return new Promise((resolve) => {
    // Try to load file using STLLoader
    const loader = new STLLoader();
    
    loader.load(
      url,
      // Success - file exists
      () => {
        resolve(true);
      },
      // Progress - ignore
      () => {},
      // Error - file doesn't exist
      () => {
        resolve(false);
      }
    );
  });
}

/**
 * Show loading message
 * @param {string} toothId - The tooth ID being loaded
 */
function showLoadingMessage(toothId) {
  // Remove existing message if any
  hideLoadingMessage();
  
  const loadingMessage = document.createElement('div');
  loadingMessage.id = 'loading-message';
  loadingMessage.innerHTML = `
    <div class="loading-spinner"></div>
    <p>${toothId}번 치아 모델을 검색 중입니다...</p>
  `;
  document.body.appendChild(loadingMessage);
}

/**
 * Hide loading message
 */
function hideLoadingMessage() {
  const existingMessage = document.getElementById('loading-message');
  if (existingMessage) {
    existingMessage.remove();
  }
}

/**
 * Show model selection UI
 * @param {string} toothId - The tooth ID
 * @param {Array} availableModels - Array of available models
 */
function showModelSelectionUI(toothId, availableModels) {
  // Remove existing UI if any
  const existingUI = document.getElementById('model-selection-ui');
  if (existingUI) {
    existingUI.remove();
  }
  
  // Create models list HTML
  let modelsListHTML = '';
  availableModels.forEach((model, index) => {
    modelsListHTML += `
      <div class="model-item" data-path="${model.path}" data-index="${index}">
        <div class="model-preview" id="preview-${index}">
          <span class="model-icon">🦷</span>
        </div>
        <div class="model-info">
          <div class="model-name">${model.name}</div>
          <div class="model-group">그룹: ${model.group}</div>
        </div>
      </div>
    `;
  });
  
  // Create new UI
  const selectionUI = document.createElement('div');
  selectionUI.id = 'model-selection-ui';
  selectionUI.innerHTML = `
    <div class="ui-header">
      <h3>${toothId}번 치아 모델 선택</h3>
    </div>
    
    <!-- 3D 프리뷰 컨테이너 추가 -->
    <div id="model-preview-container"></div>
    
    <div class="ui-actions">
      <button id="place-model-btn">위치 지정</button>
      <button id="cancel-model-btn">취소</button>
    </div>
    <div class="models-list">
      ${modelsListHTML}
    </div>
  `;
  
  document.body.appendChild(selectionUI);
  
  // 프리뷰 컨테이너 초기화
  previewContainer = document.getElementById('model-preview-container');
  initPreviewScene(previewContainer);
  
  // Model item click event
  document.querySelectorAll('.model-item').forEach(item => {
    item.addEventListener('click', () => {
      // Remove existing selection
      document.querySelectorAll('.model-item').forEach(el => {
        el.classList.remove('selected');
      });
      
      // Highlight new selection
      item.classList.add('selected');
      
      // 선택된 모델 프리뷰 로드
      const modelPath = item.getAttribute('data-path');
      loadModelPreview(modelPath);
    });
  });
  
  // Place button event - 새로 추가
  document.getElementById('place-model-btn').addEventListener('click', () => {
    const selectedItem = document.querySelector('.model-item.selected');
    if (selectedItem) {
      const modelPath = selectedItem.getAttribute('data-path');
      selectionUI.remove();
      
      // 프리뷰 리소스 정리
      cleanupPreview();
      
      startToothPlacement(toothId, modelPath);
    } else {
      alert('모델을 선택해주세요.');
    }
  });
  
  // Cancel button event
  document.getElementById('cancel-model-btn').addEventListener('click', () => {
    selectionUI.remove();
    
    // 프리뷰 리소스 정리
    cleanupPreview();
  });
  
  // 자동으로 첫 번째 모델 선택 및 프리뷰 표시
  if (availableModels.length > 0) {
    const firstItem = document.querySelector('.model-item');
    firstItem.classList.add('selected');
    const modelPath = firstItem.getAttribute('data-path');
    loadModelPreview(modelPath);
  }
}

/**
 * Load and display an STL model
 * @param {string} modelPath - Path to the STL model
 */
export function loadSTLModel(modelPath) {
  const loader = new STLLoader();
  
  loader.load(
    modelPath,
    (geometry) => {
      // Process on successful load
      const positionAttr = geometry.getAttribute('position');
      if (!positionAttr) {
        console.error('BufferGeometry has no position attribute.');
        return;
      }
      const positions = positionAttr.array;

      const indices = [];
      for (let i = 0; i < positions.length / 3; i += 3) {
        indices.push(i, i + 1, i + 2);
      }

      // Create new BufferGeometry
      let newGeometry = new THREE.BufferGeometry();

      // Register position attribute
      newGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3)
      );

      // Set indices
      newGeometry.setIndex(
        new THREE.Uint32BufferAttribute(indices, 1)
      );

      // Setup geometry and display on screen
      setTargetMeshGeometryFn(newGeometry);
    },
    // Load progress
    (xhr) => {
      console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    },
    // Load error
    (error) => {
      console.error('STL load error:', error);
      alert(`모델을 로드할 수 없습니다: ${modelPath}`);
    }
  );
}