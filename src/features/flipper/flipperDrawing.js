// src/flipper/flipperDrawing.js
import * as THREE from 'three';
import { refs } from '../../models/modelManager.js'
import { generateFlipper } from './flipperGeometry.js';
import { LassoSelector } from '../../utils/lassoSelection.ts';

// 플리퍼 상태 변수
let flipperThickness = 1.0; // 기본 두께 (mm)
let flipperMesh = null;
let lassoSelector = null; // LassoSelector 인스턴스

// 카메라 상태 저장용
let savedCameraState = null;

/**
 * 플리퍼 그리기 모드 초기화
 */
export function initFlipperDrawing() {
  console.log('플리퍼 그리기 모드 초기화');
  
  // 기존에 생성된 플리퍼 메시가 있는지 확인
  if (flipperMesh && flipperMesh.parent) {
    console.log('기존 플리퍼가 있습니다. 플리퍼 데이터 초기화를 건너뜁니다.');
    
    // 상태 메시지 업데이트
    updateFlipperInfoText('기존 플리퍼가 있습니다. 완료 버튼을 클릭하거나, 초기화 후 새로 그리세요.');
    
    // 완료 버튼 활성화
    const completeBtn = document.getElementById('btn-flipper-complete');
    if (completeBtn) {
      completeBtn.disabled = false;
      completeBtn.classList.add('active');
    }
    
    // LassoSelector 초기화
    initLassoSelector();
    
    return true;
  }
  
  // 이전 데이터 초기화
  cleanupFlipperData();
  
  // 상태 메시지 업데이트
  updateFlipperInfoText('모델에 플리퍼 영역을 그려주세요. Alt 키를 누른 상태에서 드래그하여 경계선을 그리세요.');
  
  // LassoSelector 초기화
  initLassoSelector();
  
  return true;
}

/**
 * LassoSelector 초기화
 */
function initLassoSelector() {
  if (!refs.targetMesh) {
    console.warn('플리퍼를 그릴 대상 메시가 없습니다.');
    return false;
  }
  
  // 기존 LassoSelector 정리
  if (lassoSelector) {
    lassoSelector.cleanup();
  }
  
  // 새 LassoSelector 생성
  lassoSelector = new LassoSelector(refs.targetMesh, refs.scene, refs.camera, refs.renderer, {
    controls: refs.controls, // 카메라 컨트롤 전달
    curveQuality: 20,
    minDistanceBetweenPoints: 0.01,
    onUpdateMessage: (message) => {
      updateFlipperInfoText(message);
    },
    onComplete: (points) => {
      onFlipperAreaComplete(points);
    },
    onPointDragComplete: (points) => {
      onFlipperPointDragComplete(points);
    },
    onError: (error) => {
      console.error('LassoSelector 오류:', error);
      updateFlipperInfoText(`오류: ${error}`);
    }
  });
  
  // 선택 시작
  return lassoSelector.startSelection();
}

/**
 * 플리퍼 영역 완성 콜백
 */
function onFlipperAreaComplete(points) {
  console.log('플리퍼 영역 완성됨:', points.length, '개 점');
  
  // 상태 메시지 업데이트
  updateFlipperInfoText('플리퍼 영역이 설정되었습니다. 두께를 조절한 후 "플리퍼 생성" 버튼을 클릭하세요.');
  
  // 생성 버튼 활성화
  const generateBtn = document.getElementById('btn-generate-flipper');
  if (generateBtn) {
    generateBtn.disabled = false;
    generateBtn.classList.add('active');
  }
}

/**
 * 플리퍼 점 드래깅 완료 콜백
 */
function onFlipperPointDragComplete(points) {
  console.log('플리퍼 점 드래깅 완료:', points.length, '개 점');
  
  // 기존 플리퍼 메시가 있다면 업데이트
  if (flipperMesh && flipperMesh.parent) {
    updateFlipperMesh();
  }
}

/**
 * 플리퍼 모든 데이터 정리
 */
export function cleanupFlipperData(preserveFlipper = false) {
  // LassoSelector 정리
  if (lassoSelector) {
    lassoSelector.cleanup();
    lassoSelector = null;
  }
  
  // 플리퍼 메쉬가 있다면 제거 (단, preserveFlipper가 true인 경우 유지)
  if (!preserveFlipper && flipperMesh && flipperMesh.parent) {
    flipperMesh.parent.remove(flipperMesh);
    flipperMesh.geometry.dispose();
    flipperMesh.material.dispose();
    flipperMesh = null;
  }
  
  console.log('플리퍼 데이터 정리 완료');
}

/**
 * 플리퍼 이벤트 리스너 제거 (LassoSelector 중지)
 */
export function removeFlipperEventListeners() {
  if (lassoSelector) {
    lassoSelector.stopSelection();
  }
  
  console.log('플리퍼 이벤트 리스너 제거됨');
}

/**
 * 플리퍼 두께 설정
 */
export function setFlipperThickness(thickness) {
  // 이전 두께와 현재 두께 저장
  const previousThickness = flipperThickness;
  flipperThickness = thickness;
  console.log(`플리퍼 두께: ${thickness}mm (이전: ${previousThickness}mm)`);
  
  // 플리퍼가 이미 생성되어 있다면 업데이트
  if (flipperMesh && flipperMesh.parent) {
    // 기존 메시 제거
    refs.scene.remove(flipperMesh);
    flipperMesh.geometry.dispose();
    flipperMesh.material.dispose();
    flipperMesh = null;
    
    // 약간의 지연 후 재생성 (UI 업데이트를 위해)
    setTimeout(() => {
      generateFlipper();
    }, 50);
  }
}

/**
 * 플리퍼 메시 업데이트
 */
function updateFlipperMesh() {
  // 이미 생성된 플리퍼가 있다면 업데이트
  if (flipperMesh && flipperMesh.parent) {
    // 로딩 메시지 표시
    updateFlipperInfoText('플리퍼를 업데이트하는 중...');
    
    // 기존 플리퍼 제거
    refs.scene.remove(flipperMesh);
    flipperMesh.geometry.dispose();
    flipperMesh.material.dispose();
    flipperMesh = null;
    
    // 약간의 지연 후 플리퍼 재생성
    setTimeout(() => {
      generateFlipper();
    }, 100);
  }
}

/**
 * 모듈 정리 함수
 */
export function cleanupFlipperModule(preserveFlipper = false) {
  removeFlipperEventListeners();
  cleanupFlipperData(preserveFlipper);
}

/**
 * 플리퍼 메시 반환 (외부에서 접근용)
 */
export function getFlipperMesh() {
  return flipperMesh;
}

/**
 * 상태 정보 공유 함수 - flipperGeometry.js에서 사용
 */
export function getFlipperState() {
  const drawingPoints = lassoSelector ? lassoSelector.getSelectedPoints() : [];
  
  return {
    drawingPoints, 
    flipperThickness
  };
}

/**
 * 플리퍼 메시 설정 함수 - flipperGeometry.js에서 사용
 */
export function setFlipperMesh(mesh) {
  flipperMesh = mesh;
}

/**
 * 정보 텍스트 업데이트
 */
export function updateFlipperInfoText(text) {
  const infoElement = document.getElementById('flipper-info');
  if (infoElement) {
    infoElement.textContent = text;
  }
}

/**
 * 플리퍼 메시만 초기화하는 함수
 * 점과 선은 그대로 유지합니다.
 */
export function resetFlipperMeshOnly() {
  // 플리퍼 메쉬가 있다면 제거
  if (flipperMesh && flipperMesh.parent) {
    refs.scene.remove(flipperMesh);
    flipperMesh.geometry.dispose();
    flipperMesh.material.dispose();
    flipperMesh = null;
  }
  
  // 영역이 완료된 상태라면 생성 버튼 활성화
  if (lassoSelector && lassoSelector.isAreaClosed()) {
    const generateBtn = document.getElementById('btn-generate-flipper');
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.classList.add('active');
      generateBtn.innerHTML = '<span style="display: flex; align-items: center; justify-content: center;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>플리퍼 생성</span>';
      generateBtn.style.background = '#555';
    }
  }
  
  // 완료 버튼 비활성화
  const completeBtn = document.getElementById('btn-flipper-complete');
  if (completeBtn) {
    completeBtn.disabled = true;
    completeBtn.classList.remove('active');
  }
  
  // 상태 메시지 업데이트
  updateFlipperInfoText('플리퍼 메시가 초기화되었습니다. 원하는 경우 "플리퍼 생성" 버튼을 다시 클릭하세요.');
  
  return true;
}