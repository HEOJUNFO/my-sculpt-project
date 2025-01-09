// src/sculptUI.js

import { refs } from './modelManager.js';

/**
 * 브러시 UI (버튼 + 슬라이더) 초기화
 *  - 브러시 모드 버튼 (normal/clay/flatten)
 *  - 사이즈/강도 슬라이더 (sizeRange / intensityRange)
 */
export function setupCustomSculptUI() {
  // (1) 브러시 모드 버튼
  const btnNormal   = document.getElementById('btn-normal');
  const btnClay     = document.getElementById('btn-clay');
  const btnFlatten  = document.getElementById('btn-flatten');

  // 브러시 모드 전환 함수
  function setBrushMode(mode) {
    // refs.params에 모드 설정
    refs.params.brush = mode;

    // 모든 버튼의 'active' 제거
    btnNormal?.classList.remove('active');
    btnClay?.classList.remove('active');
    btnFlatten?.classList.remove('active');

    // 해당 모드 버튼만 'active' 부여
    if (mode === 'normal')  btnNormal?.classList.add('active');
    if (mode === 'clay')    btnClay?.classList.add('active');
    if (mode === 'flatten') btnFlatten?.classList.add('active');
  }

  // 버튼이 실제 존재하면 이벤트 연결
  if (btnNormal && btnClay && btnFlatten) {
    btnNormal.addEventListener('click',   () => setBrushMode('normal'));
    btnClay.addEventListener('click',     () => setBrushMode('clay'));
    btnFlatten.addEventListener('click',  () => setBrushMode('flatten'));
  }

  // 초기값: main(initScene)에서 설정했던 refs.params.brush를 반영
  setBrushMode(refs.params.brush);

  // (2) 브러시 사이즈/강도 슬라이더
  const sizeRange      = document.getElementById('sizeRange');
  const intensityRange = document.getElementById('intensityRange');

  // sizeRange 이벤트
  if (sizeRange) {
    // 초기값
    sizeRange.value = String(refs.params.size);

    // 슬라이더 변경 -> refs.params.size 반영
    sizeRange.addEventListener('input', () => {
      refs.params.size = parseFloat(sizeRange.value);
    });
  }

  // intensityRange 이벤트
  if (intensityRange) {
    // 초기값
    intensityRange.value = String(refs.params.intensity);

    // 슬라이더 변경 -> refs.params.intensity 반영
    intensityRange.addEventListener('input', () => {
      refs.params.intensity = parseFloat(intensityRange.value);
    });
  }
}
