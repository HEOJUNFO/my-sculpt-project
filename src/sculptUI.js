// src/sculptUI.js

import { refs } from './modelManager.js';

export function setupCustomSculptUI() {
  // (1) 브러시 모드 버튼들
  const btnNormal  = document.getElementById('btn-normal');
  const btnClay    = document.getElementById('btn-clay');
  const btnFlatten = document.getElementById('btn-flatten');

  function setBrushMode(mode) {
    refs.params.brush = mode;
    btnNormal.classList.remove('active');
    btnClay.classList.remove('active');
    btnFlatten.classList.remove('active');

    if (mode === 'normal')  btnNormal.classList.add('active');
    if (mode === 'clay')    btnClay.classList.add('active');
    if (mode === 'flatten') btnFlatten.classList.add('active');
  }
  setBrushMode(refs.params.brush);

  // (2) 브러시 모드 버튼 이벤트
  btnNormal.addEventListener('click',  () => setBrushMode('normal'));
  btnClay.addEventListener('click',    () => setBrushMode('clay'));
  btnFlatten.addEventListener('click', () => setBrushMode('flatten'));

  // (3) 슬라이더
  const sizeRange      = document.getElementById('sizeRange');
  const intensityRange = document.getElementById('intensityRange');

  if (sizeRange) {
    sizeRange.value = String(refs.params.size);
    sizeRange.addEventListener('input', () => {
      refs.params.size = parseFloat(sizeRange.value);
    });
  }

  if (intensityRange) {
    intensityRange.value = String(refs.params.intensity);
    intensityRange.addEventListener('input', () => {
      refs.params.intensity = parseFloat(intensityRange.value);
    });
  }

  // (4) Invert 버튼
  const btnInvert = document.getElementById('btn-invert');
  if (btnInvert) {
    // 초기 상태에 따라 active 클래스 적용
    if (refs.params.invert) btnInvert.classList.add('active');

    // 버튼 클릭 -> invert 토글
    btnInvert.addEventListener('click', () => {
      refs.params.invert = !refs.params.invert;
      // true면 active 클래스 추가, false면 제거
      btnInvert.classList.toggle('active', refs.params.invert);
    });
  }
}
