// src/sculptUI.js

import { refs,importModel} from './modelManager.js'; // Ensure importModel is exported from modelManager.js
import { undo, redo, exportCurrentModel } from './modelManager.js';

export function setupCustomSculptUI() {
  // (Existing Code) Brush Mode Buttons
  const btnNormal  = document.getElementById('btn-normal');
  const btnClay    = document.getElementById('btn-clay');
  const btnFlatten = document.getElementById('btn-flatten');
  const btnInvert  = document.getElementById('btn-invert');   // invert
  const btnUndo    = document.getElementById('btn-undo');     // undo
  const btnRedo    = document.getElementById('btn-redo');     // redo
  const btnExport  = document.getElementById('btn-export');   // export
  const btnImport  = document.getElementById('btn-import');   // Import Button
  const fileInput  = document.getElementById('file-input');   // Hidden File Input

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

  // Brush Mode Button Events
  btnNormal?.addEventListener('click',  () => setBrushMode('normal'));
  btnClay?.addEventListener('click',    () => setBrushMode('clay'));
  btnFlatten?.addEventListener('click', () => setBrushMode('flatten'));

  // Invert Button Event
  btnInvert?.addEventListener('click', () => {
    refs.params.invert = !refs.params.invert;
    btnInvert.classList.toggle('active', refs.params.invert);
  });

  // Undo / Redo Button Events
  btnUndo?.addEventListener('click', () => undo());
  btnRedo?.addEventListener('click', () => redo());

  // Export Button Event
  btnExport?.addEventListener('click', () => {
    exportCurrentModel();
  });

  btnImport?.addEventListener('click', () => {
    if (fileInput) {
      fileInput.click(); // 숨겨진 파일 입력 트리거
    } else {
      console.error('fileInput 요소를 찾을 수 없습니다.');
    }
  });

  fileInput?.addEventListener('change', (event) => {
    const files = event.target.files;
    if (files.length > 0) {
      for (const file of files) {
        importModel(file);
      }
      // 파일 입력 초기화
      fileInput.value = '';
    }
  });


  // (Existing) Sliders
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
