// src/sculptUI.js

import { refs } from './modelManager.js';
// exportCurrentModel 함수 추가 import
import { undo, redo, exportCurrentModel } from './modelManager.js';

export function setupCustomSculptUI() {
  // (1) 브러시 모드 버튼들
  const btnNormal  = document.getElementById('btn-normal');
  const btnClay    = document.getElementById('btn-clay');
  const btnFlatten = document.getElementById('btn-flatten');
  const btnInvert  = document.getElementById('btn-invert');   // invert
  const btnUndo    = document.getElementById('btn-undo');     // undo
  const btnRedo    = document.getElementById('btn-redo');     // redo
  const btnExport  = document.getElementById('btn-export');   // export

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

  // Invert
  btnInvert?.addEventListener('click', () => {
    refs.params.invert = !refs.params.invert;
    btnInvert.classList.toggle('active', refs.params.invert);
  });

  // Undo / Redo
  btnUndo?.addEventListener('click', () => undo());
  btnRedo?.addEventListener('click', () => redo());

  // (2) Export 버튼 → exportCurrentModel() 호출
  btnExport?.addEventListener('click', () => {
    exportCurrentModel();
  });

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
}
