// src/sculptUI.js

import { refs } from './modelManager.js';
// undo, redo 함수를 직접 import 해야 합니다.
import { undo, redo } from './modelManager.js';

export function setupCustomSculptUI() {
  // (1) 브러시 모드 버튼들
  const btnNormal  = document.getElementById('btn-normal');
  const btnClay    = document.getElementById('btn-clay');
  const btnFlatten = document.getElementById('btn-flatten');
  // (만약 Invert 버튼도 있다면)
  const btnInvert  = document.getElementById('btn-invert');

  function setBrushMode(mode) {
    refs.params.brush = mode;
    btnNormal?.classList.remove('active');
    btnClay?.classList.remove('active');
    btnFlatten?.classList.remove('active');
    if (mode === 'normal')  btnNormal?.classList.add('active');
    if (mode === 'clay')    btnClay?.classList.add('active');
    if (mode === 'flatten') btnFlatten?.classList.add('active');
  }
  setBrushMode(refs.params.brush);

  // 브러시 버튼 이벤트
  btnNormal?.addEventListener('click',  () => setBrushMode('normal'));
  btnClay?.addEventListener('click',    () => setBrushMode('clay'));
  btnFlatten?.addEventListener('click', () => setBrushMode('flatten'));

  // (Invert 버튼이 있다면)
  if (btnInvert) {
    if (refs.params.invert) btnInvert.classList.add('active');
    btnInvert.addEventListener('click', () => {
      refs.params.invert = !refs.params.invert;
      btnInvert.classList.toggle('active', refs.params.invert);
    });
  }

  // (2) 슬라이더
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

  // (3) Undo / Redo 버튼
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');

  // 'undo()' 함수를 호출
  btnUndo?.addEventListener('click', () => {
    undo();
  });

  // 'redo()' 함수를 호출
  btnRedo?.addEventListener('click', () => {
    redo();
  });
}
