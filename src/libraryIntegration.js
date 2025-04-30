// src/libraryIntegration.js
import { refs } from './modelManager.js';
import { loadModuleExports } from './moduleLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Global UI container for the library
let libraryUIContainer = null;
let modulesLoaded = false;
let placedTeeth = []; // 배치된 치아 추적용 배열

// 라이브러리 모드 활성화 플래그 추가
let libraryModeActive = false;

/**
 * 치아 모델을 특정 위치에 배치하는 함수
 * @param {string} toothId - 치아 ID
 * @param {string} modelPath - STL 모델 경로
 * @param {THREE.Vector3} position - 배치 위치
 * @param {THREE.Euler} rotation - 회전값 (선택적)
 */
function placeToothModel(toothId, modelPath, position, rotation) {
  console.log(`치아 ${toothId} 배치 중, 위치:`, position);
  if (rotation) console.log(`회전값:`, rotation);
  
  const loader = new STLLoader();
  
  // 로딩 오버레이 표시
  const loadingMessage = document.createElement('div');
  loadingMessage.id = 'placement-loading';
  loadingMessage.style.cssText = `
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0,0,0,0.7);
    color: #fff; padding: 20px; border-radius: 10px;
    z-index: 2000;
  `;
  loadingMessage.innerHTML = `
    <div class="loading-spinner"></div>
    <p>${toothId}번 치아 모델을 배치 중입니다...</p>
  `;
  document.body.appendChild(loadingMessage);

  loader.load(
    modelPath,
    (geometry) => {
      const posAttr = geometry.getAttribute('position');
      if (!posAttr) {
        console.error('위치 속성이 없습니다.');
        loadingMessage.remove();
        return;
      }
      
      try {
        const positions = posAttr.array;
        const indices = [];
        for (let i = 0; i < positions.length / 3; i += 3) {
          indices.push(i, i + 1, i + 2);
        }

        let newGeometry = new THREE.BufferGeometry();
        newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        newGeometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
        newGeometry.deleteAttribute('uv');
        newGeometry = BufferGeometryUtils.mergeVertices(newGeometry);
        newGeometry.computeVertexNormals();
        newGeometry.computeBoundingSphere();
        if (newGeometry.boundingSphere) {
          const radius = newGeometry.boundingSphere.radius;
          newGeometry.scale(0.2 / radius, 0.2 / radius, 0.2 / radius);
        }
        newGeometry.center();
        newGeometry.computeBoundingBox();
        
        // 치아 재질 생성 - 치아 ID에 따라 다른 matcap 사용
        let matcapTexture;
        
        // 치아 번호에 따라 다른 matcap 선택
        if (parseInt(toothId) >= 11 && parseInt(toothId) <= 18) {
          // 우측 상악 (밝은 색상)
          matcapTexture = refs.matcaps['Pearl'] || refs.matcaps['White'];
        } else if (parseInt(toothId) >= 21 && parseInt(toothId) <= 28) {
          // 좌측 상악 (약간 다른 밝은 색상)
          matcapTexture = refs.matcaps['White'] || refs.matcaps['Pearl'];
        } else if (parseInt(toothId) >= 31 && parseInt(toothId) <= 38) {
          // 좌측 하악 (다른 색조)
          matcapTexture = refs.matcaps['Shiny Green'] || refs.matcaps['White'];
        } else if (parseInt(toothId) >= 41 && parseInt(toothId) <= 48) {
          // 우측 하악 (또 다른 색조)
          matcapTexture = refs.matcaps['Red Wax'] || refs.matcaps['White'];
        }
        
        const toothMaterial = new THREE.MeshMatcapMaterial({
          flatShading: false,
          side: THREE.DoubleSide,
          matcap: matcapTexture || refs.matcaps['White'],
          transparent: true,
          opacity: 0.9 // 치아는 약간 반투명하게
        });
        
        // 치아 메쉬 생성
        const toothMesh = new THREE.Mesh(newGeometry, toothMaterial);
        toothMesh.position.copy(position);
        
        // 회전 적용
        if (rotation) {
          toothMesh.rotation.copy(rotation);
        }
        
        // userdata에 정보 추가
        toothMesh.userData = { 
          type: 'placedTooth', 
          toothId, 
          modelPath,
          isLibraryTooth: true,  // 라이브러리에서 배치된 치아임을 표시
          originalMatcap: matcapTexture // 나중에 참조할 수 있도록 원본 matcap 저장
        };
        
        // 씬에 추가
        refs.scene.add(toothMesh);
        
        // 배치된 치아 추적 (중요)
        placedTeeth.push(toothMesh);
        console.log("배치된 치아 개수:", placedTeeth.length);
        
        // 설치된 치아 추적 (이 함수가 있다면)
        if (window.addPlacedTooth) {
          window.addPlacedTooth(toothMesh);
        }
        
        // 로딩 메시지 제거
        loadingMessage.remove();
        
        // 성공 메시지 표시
        showSuccessMessage(toothId);
        
        // 자동으로 TransformControls 부착
        attachTransformControlsToTooth(toothMesh);
      } catch (error) {
        console.error("치아 처리 중 오류:", error);
        loadingMessage.remove();
      }
    },
    (xhr) => console.log(`${(xhr.loaded / xhr.total * 100).toFixed(1)}% 로드됨`),
    (error) => {
      console.error('STL 로드 오류:', error);
      loadingMessage.remove();
      alert(`모델을 로드할 수 없습니다: ${modelPath}`);
    }
  );
}

/**
 * 성공 메시지 표시
 */
function showSuccessMessage(toothId) {
  const msg = document.createElement('div');
  msg.style.cssText = `
    position: fixed; top: 20px; left: 50%;
    transform: translateX(-50%);
    background: rgba(76,175,80,0.9);
    color: #fff; padding: 12px 20px;
    border-radius: 8px; font-weight: bold;
    z-index: 2000; transition: opacity 0.5s;
  `;
  msg.textContent = `${toothId}번 치아가 성공적으로 배치되었습니다.`;
  document.body.appendChild(msg);
  setTimeout(() => {
    msg.style.opacity = '0';
    setTimeout(() => msg.remove(), 500);
  }, 3000);
}

/**
 * 배치된 치아에 TransformControls 부착
 */
function attachTransformControlsToTooth(toothMesh) {
  console.log("TransformControls 부착 시도:", toothMesh);
  
  // 이미 TransformControls가 부착되어 있는지 확인
  if (refs.transformControls && refs.transformControls.object === toothMesh) {
    console.log("이미 같은 치아에 부착되어 있음");
    return;
  }
  
  // 이미 다른 객체에 부착되어 있는 경우 분리
  if (refs.transformControls && refs.transformControls.object) {
    console.log("다른 객체에서 분리");
    detachTransformControls();
  }
  
  // TransformControls 설정 및 부착
  if (refs.transformControls) {
    console.log("새 TransformControls 부착");
    refs.transformControls.attach(toothMesh);
    refs.scene.add(refs.transformControls.getHelper());
    
    // UI 생성
    createTransformUI();
    
    // 라이브러리 모드에서는 OrbitControls 비활성화
    if (refs.controls) {
      refs.controls.enabled = false;
    }
  } else {
    console.error("refs.transformControls가 없음");
  }
}

/**
 * TransformControls UI 생성
 */
function createTransformUI() {
  // 기존 UI가 있으면 제거
  const existingUI = document.getElementById('transform-ui');
  if (existingUI) existingUI.remove();
  
  // 새 UI 생성
  const ui = document.createElement('div');
  ui.id = 'transform-ui';
  ui.style.cssText = `
    position: fixed;
    top: 10px; right: 10px;
    z-index: 1100;
    background: rgba(255,255,255,0.8);
    padding: 12px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `;
  
  // UI 내용
  ui.innerHTML = `
    <div style="margin-bottom: 10px; font-weight: bold; color: #333;">위치 조정</div>
    <div style="display: flex; gap: 4px; margin-bottom: 10px;">
      <button id="translate-btn" class="transform-btn" style="flex: 1; padding: 6px; background: #4691E0; color: white; border: none; border-radius: 3px; cursor: pointer;">이동</button>
      <button id="rotate-btn" class="transform-btn" style="flex: 1; padding: 6px; background: #eee; color: #333; border: none; border-radius: 3px; cursor: pointer;">회전</button>
    </div>
    
    <div id="scale-ui" style="margin-top: 8px; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 4px;">
      <label>균일 크기 조절: <span id="scale-value">1.00</span></label>
      <div style="display: flex; margin-top: 5px;">
        <button id="scale-down-btn" style="flex: 1; margin-right: 4px; padding: 4px; background: #eee; border: none; border-radius: 3px; cursor: pointer;">-</button>
        <button id="scale-up-btn" style="flex: 1; padding: 4px; background: #eee; border: none; border-radius: 3px; cursor: pointer;">+</button>
      </div>
      <input type="range" id="scale-slider" min="0.1" max="3" step="0.01" value="1" style="width: 100%; margin-top: 5px;">
    </div>
    
    <button id="detach-btn" style="margin-top: 10px; width: 100%; padding: 8px; background: #ff6b6b; color: white; border: none; border-radius: 3px; cursor: pointer;">완료</button>
  `;
  
  document.body.appendChild(ui);
  
  // 버튼 이벤트 설정
  setupTransformUIEvents();
}

/**
 * TransformControls UI 이벤트 설정
 */
function setupTransformUIEvents() {
  // 현재 선택된 객체
  const getActiveObject = () => refs.transformControls?.object;
  
  // 기본 스케일 저장
  let originalScale = new THREE.Vector3(1, 1, 1);
  let currentScale = 1;
  
  // 객체의 초기 스케일 저장
  const object = getActiveObject();
  if (object) {
    // 초기 스케일 저장
    if (!object.userData.initialScale) {
      object.userData.initialScale = object.scale.clone();
    }
    originalScale = object.userData.initialScale.clone();
  }
  
  // 이동 모드 버튼
  document.getElementById('translate-btn')?.addEventListener('click', () => {
    refs.transformControls?.setMode('translate');
    updateButtonStyles('translate-btn');
  });
  
  // 회전 모드 버튼
  document.getElementById('rotate-btn')?.addEventListener('click', () => {
    refs.transformControls?.setMode('rotate');
    updateButtonStyles('rotate-btn');
  });
  
  // 스케일 다운 버튼
  document.getElementById('scale-down-btn')?.addEventListener('click', () => {
    const newScale = Math.max(0.1, currentScale - 0.01);
    applyUniformScale(newScale);
  });
  
  // 스케일 업 버튼
  document.getElementById('scale-up-btn')?.addEventListener('click', () => {
    const newScale = Math.min(3, currentScale + 0.01);
    applyUniformScale(newScale);
  });
  
  // 스케일 슬라이더
  document.getElementById('scale-slider')?.addEventListener('input', (e) => {
    const newScale = parseFloat(e.target.value);
    applyUniformScale(newScale);
  });
  
  // 완료 버튼
  document.getElementById('detach-btn')?.addEventListener('click', () => {
    detachTransformControls();
  });
  
  // 초기 버튼 스타일 설정
  updateButtonStyles('translate-btn');
  
  // 균일 스케일 적용 함수
  function applyUniformScale(newScaleFactor) {
    const object = getActiveObject();
    if (!object) return;
    
    // 초기 스케일이 저장되어 있는지 확인
    if (!object.userData.initialScale) {
      object.userData.initialScale = object.scale.clone();
      originalScale = object.scale.clone();
    }
    
    // 모든 축에 스케일 적용
    object.scale.set(
      originalScale.x * newScaleFactor,
      originalScale.y * newScaleFactor,
      originalScale.z * newScaleFactor
    );
    
    // UI 업데이트
    currentScale = newScaleFactor;
    document.getElementById('scale-value').textContent = newScaleFactor.toFixed(2);
    document.getElementById('scale-slider').value = newScaleFactor;
  }
  
  // 버튼 스타일 업데이트 함수
  function updateButtonStyles(activeBtn) {
    document.querySelectorAll('.transform-btn').forEach(btn => {
      if (btn.id === activeBtn) {
        btn.style.background = '#4691E0';
        btn.style.color = 'white';
      } else {
        btn.style.background = '#eee';
        btn.style.color = '#333';
      }
    });
  }
}

/**
 * TransformControls 분리
 */
function detachTransformControls() {
  if (refs.transformControls) {
    refs.transformControls.detach();
    
    // 헬퍼를 씬에서 제거 (최신 버전 Three.js 방식)
    const helper = refs.transformControls.getHelper();
    if (helper && refs.scene) {
      refs.scene.remove(helper);
    }
    
    const transformUI = document.getElementById('transform-ui');
    if (transformUI) transformUI.remove();
    
    // 컨트롤 다시 활성화
    if (refs.controls) {
      refs.controls.enabled = true;
    }
  }
}

/**
 * 치아 선택 클릭 이벤트 핸들러
 */
function handleToothSelection(event) {
  // 치아 배치 모드일 때는 무시
  if (window.placementActive) {
    console.log("배치 모드 활성화 - 선택 무시");
    return;
  }
  
  // 라이브러리 모드가 활성화되지 않았을 때도 무시
  if (!libraryModeActive) {
    console.log("라이브러리 모드 비활성화 - 선택 무시");
    return;
  }
  
  console.log("치아 선택 클릭 이벤트 발생", event, "placedTeeth:", placedTeeth.length);
  
  // 마우스 좌표 계산
  const rect = refs.renderer.domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  
  // 레이캐스터 생성
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, refs.camera);
  
  // 수정 5: 배치된 치아 목록 재확인
  console.log("배치된 치아 목록 검사:", placedTeeth.map(t => t.userData?.toothId || "unknown"));
  
  // 배치된 치아와 교차 확인 
  const intersects = raycaster.intersectObjects(placedTeeth, true); // true 추가: 자식 객체도 검사
  
  console.log("intersects 결과:", intersects.length);
  
  // 치아를 클릭한 경우
  if (intersects.length > 0) {
    // 클릭된 객체 또는 부모 객체(치아) 가져오기
    let clickedTooth = intersects[0].object;
    // 부모 객체가 치아인 경우 부모를 사용
    while (clickedTooth.parent && !clickedTooth.userData.type && clickedTooth.parent !== refs.scene) {
      clickedTooth = clickedTooth.parent;
    }
    
    console.log("선택된 치아:", clickedTooth, "치아 ID:", clickedTooth.userData?.toothId);
    
    // 이미 같은 치아가 선택되어 있으면 무시
    if (refs.transformControls && refs.transformControls.object === clickedTooth) {
      console.log("이미 선택된 치아 - 무시");
      return;
    }
    
    // 다른 치아가 선택되어 있었다면 UI 제거
    detachTransformControls();
    
    // 선택한 치아에 TransformControls 부착
    attachTransformControlsToTooth(clickedTooth);
    
    // 성공 메시지 표시
    const msg = document.createElement('div');
    msg.style.cssText = `
      position: fixed; top: 20px; left: 50%;
      transform: translateX(-50%);
      background: rgba(76,175,80,0.9);
      color: #fff; padding: 12px 20px;
      border-radius: 8px; font-weight: bold;
      z-index: 2000; transition: opacity 0.5s;
    `;
    msg.textContent = `치아가 선택되었습니다. 이제 위치를 조정할 수 있습니다.`;
    document.body.appendChild(msg);
    setTimeout(() => {
      msg.style.opacity = '0';
      setTimeout(() => msg.remove(), 500);
    }, 3000);
  } else {
    console.log("선택된 치아 없음");
  }
}

// 전역 객체에 함수 등록
window.placeToothModel = placeToothModel;

/**
 * Initialize the library mode UI
 * This should be called when transitioning to the library step
 */
export function initLibraryMode() {
  console.log('Initializing library mode UI');
  
  // 라이브러리 모드 활성화 플래그 설정
  libraryModeActive = true;

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
  
  // 치아 선택 이벤트 리스너 추가 
  // 이미 등록된 이벤트 리스너가 있다면 제거 후 다시 등록
  refs.renderer?.domElement.removeEventListener('click', handleToothSelection);
  refs.renderer?.domElement.addEventListener('click', handleToothSelection);
  
  // 컨트롤 패널 생성
  createLibraryControlPanel();
  
  // 배치된 치아 배열 초기화 제거함
  console.log("라이브러리 모드 진입 - 현재 배치된 치아 개수:", placedTeeth.length);
  
  // 치아 배치 함수 등록 확인
  console.log("치아 배치 함수 등록 완료:", typeof window.placeToothModel);
}

/**
 * Create a control panel for library mode with a completion button
 */
function createLibraryControlPanel() {
  const panel = document.createElement('div');
  panel.id = 'library-control-panel';
  panel.style.cssText = `
    position: fixed;
    left: 0px;
    bottom: 0px;
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
  
  // 완료 버튼 이벤트 리스너 수정: completeSculpting() -> completeLibrary()
  document.getElementById('complete-library-btn').addEventListener('click', () => {
    // 라이브러리 모드 비활성화 플래그 설정
    libraryModeActive = false;
    
    // 트랜스폼 컨트롤 UI 제거
    detachTransformControls();
    
    // 이 부분을 수정: completeSculpting() -> completeLibrary()
    // completeLibrary()는 단계 6(라이브러리 단계 + 스컬프 UI)로 설정
    if (window.appSteps && window.appSteps.completeLibrary) {
      window.appSteps.completeLibrary();
    }
    
    // 라이브러리 UI 정리
    cleanupLibraryMode();
  });
}

/**
 * Cleanup library mode UI components
 * This should be called when transitioning to the next step
 */
export function cleanupLibraryMode() {
  console.log('Cleaning up library mode UI');
  
  // 라이브러리 모드 비활성화 플래그 설정
  libraryModeActive = false;
  
  // Remove dental chart if it exists
  const dentalChart = document.getElementById('dental-chart-container');
  if (dentalChart) dentalChart.remove();
  
  // Remove model selection UI if it exists
  const modelSelectionUI = document.getElementById('model-selection-ui');
  if (modelSelectionUI) modelSelectionUI.remove();
  
  // Remove placement UI if it exists
  const placementUI = document.getElementById('placement-ui');
  if (placementUI) placementUI.remove();
  
  // Remove transform UI if it exists (라이브러리 모드가 종료될 때만 제거)
  const transformUI = document.getElementById('transform-ui');
  if (transformUI) transformUI.remove();
  
  // Remove library control panel if it exists
  const controlPanel = document.getElementById('library-control-panel');
  if (controlPanel) controlPanel.remove();
  
  // Detach transform controls if attached (라이브러리 모드가 종료될 때만 제거)
  detachTransformControls();
  
  // Remove tooth selection event listener
  refs.renderer?.domElement.removeEventListener('click', handleToothSelection);
  
  // Remove library container if it exists
  if (libraryUIContainer) {
    libraryUIContainer.remove();
    libraryUIContainer = null;
  }
}

/**
 * Make placedTeeth array available to other modules
 * @returns {Array} Array of placed tooth meshes
 */
function getPlacedTeeth() {
  return placedTeeth;
}

// Expose the function and array to the global scope for access by other modules
window.placedTeeth = placedTeeth;
window.appLib = window.appLib || {};
window.appLib.getPlacedTeeth = getPlacedTeeth;