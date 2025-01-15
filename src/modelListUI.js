// modelListUI.js
import { isObjectInCameraViewFrustum, fitCameraToObject } from './cameraHelpers.js';

/**
 * 모델 리스트 UI를 갱신하는 함수
 *
 * @param {Array} modelList               - 모델 리스트
 * @param {number} activeItemIndex        - 현재 활성화된 모델 인덱스
 * @param {object} refs                   - refs 객체 (scene, camera, controls 등)
 * @param {Function} removeFromList       - 모델 삭제 처리 콜백
 * @param {Function} setTargetMeshAsActive- 액티브 메쉬 교체 콜백
 */
export function updateModelListUI(
  modelList,
  activeItemIndex,
  refs,
  removeFromList,
  setTargetMeshAsActive
) {
  const ul = document.getElementById('model-list');
  if (!ul) return;

  const dragHint = document.getElementById('drag-hint');
  ul.innerHTML = '';

  // 배경색 4가지를 순환하기 위한 배열
  const backgroundColors = ['#d1d1d1', '#E0bcbc', '#f3f4c5', '#a3a3a3'];

  // 모델 리스트가 비었을 경우
  if (modelList.length === 0) {
    if (dragHint) {
      dragHint.style.display = 'block';
    }
    return;
  } else {
    if (dragHint) {
      dragHint.style.display = 'none';
    }
  }

  modelList.forEach((item, idx) => {
    const li = document.createElement('li');
    li.classList.add('model-list-item');

    // 배경색 순환 적용
    li.style.backgroundColor = backgroundColors[idx % 4];

    // 파일 이름 표시 영역
    const filenameDiv = document.createElement('div');
    filenameDiv.classList.add('model-filename');
    let text = `${idx + 1}. ${item.fileName}`;

    if (idx === activeItemIndex) {
      filenameDiv.classList.add('model-filename--active');
    } else {
      filenameDiv.classList.add('model-filename--inactive');
    }

    filenameDiv.textContent = text;

    // 불투명도 슬라이더
    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.min = '0';
    opacitySlider.max = '1';
    opacitySlider.step = '0.01';
    opacitySlider.style.width = '80px';
    opacitySlider.classList.add('custom-slider');

    const currentOpacity =
      item.customOpacity !== undefined
        ? item.customOpacity
        : item.mesh.material.opacity ?? 1.0;

    opacitySlider.value = String(currentOpacity);

    // 슬라이더 이벤트
    opacitySlider.addEventListener('input', (e) => {
      e.stopPropagation();
      const val = parseFloat(opacitySlider.value);
      item.customOpacity = val;
      item.mesh.material.opacity = val;
    });

    // 삭제 버튼
    const deleteBtn = document.createElement('span');
    deleteBtn.textContent = ' ❌';
    deleteBtn.style.color = '#f66';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromList(idx);
    });

    // 리스트 아이템 클릭 시 → 활성화 처리
    li.addEventListener('click', (e) => {
      // 슬라이더 자체 클릭 시에는 이벤트 무시
      if (e.target === opacitySlider) return;

      setTargetMeshAsActive(item.mesh);

      // 오브젝트가 이미 카메라 시야 안에 있으면 카메라 맞춤 스킵
      if (isObjectInCameraViewFrustum(refs.camera, item.mesh)) {
        console.log('Object is already visible, skipping camera fitting.');
      } else {
        fitCameraToObject(refs.camera, item.mesh, refs.controls);
      }
    });

    // DOM 구성
    li.appendChild(filenameDiv);
    li.appendChild(opacitySlider);
    li.appendChild(deleteBtn);
    ul.appendChild(li);
  });
}
