// memo.js

import * as THREE from 'three';

// 메모 배열 (외부에서 접근해야 하므로 export)
export const memos = []; // { object: THREE.Mesh, position: THREE.Vector3, text: string }

// 임시 위치, 편집 인덱스
let pendingMemoPosition = new THREE.Vector3();
let editingMemoIndex = -1;

// 모달 열고 닫기 (기존 코드 그대로)
export function openNewMemoModal( point3D ) {
  pendingMemoPosition.copy( point3D );
  const modal = document.getElementById('memo-modal-new');

  const input = document.getElementById('memo-input-new');
  modal.style.display = 'block';
  input.value = '';
}

export function closeNewMemoModal() {
  const modal = document.getElementById('memo-modal-new');
  modal.style.display = 'none';
}

export function openEditMemoModal( memoIndex ) {
  editingMemoIndex = memoIndex;
  const modal = document.getElementById('memo-modal-edit');

  const input = document.getElementById('memo-input-edit');
  modal.style.display = 'block';

  // 기존 메모 내용
  input.value = memos[memoIndex].text;
}

export function closeEditMemoModal() {
  const modal = document.getElementById('memo-modal-edit');
  modal.style.display = 'none';
  editingMemoIndex = -1;
}

// 메모 구체 생성 함수
export function createMemoSphere( position ) {
  const sphereGeo = new THREE.SphereGeometry( 0.02, 16, 16 );
  const sphereMat = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
  const sphere = new THREE.Mesh( sphereGeo, sphereMat );
  sphere.position.copy( position );
  return sphere;
}

// 새 메모 확인
export function onMemoNewOkBtn( scene ) {
  const input = document.getElementById('memo-input-new');
  const text = input.value; // trim() 제거했다고 가정

  if ( !text ) {
    console.log("No memo text provided.");
  }

  const memoObj = createMemoSphere( pendingMemoPosition );
  scene.add( memoObj );

  memos.push({
    object: memoObj,
    position: pendingMemoPosition.clone(),
    text,
  });
  console.log("New memo created:", text, pendingMemoPosition);
  closeNewMemoModal();
}

// 기존 메모 수정/삭제
export function onMemoEditUpdateBtn( scene ) {
  if ( editingMemoIndex < 0 || !memos[editingMemoIndex] ) {
    console.log("Invalid memo index for update.");
    closeEditMemoModal();
    return;
  }

  // 1) 기존 구체 제거
  const oldMemo = memos[editingMemoIndex];
  scene.remove( oldMemo.object );

  // 2) 같은 위치에 새 구체 생성
  const newSphere = createMemoSphere( oldMemo.position );
  scene.add( newSphere );

  // 3) 배열 내용 갱신
  oldMemo.object = newSphere;         // 구체 교체
  const input = document.getElementById('memo-input-edit');
  oldMemo.text = input.value;         // 텍스트 갱신

  console.log("Memo updated:", editingMemoIndex, oldMemo.text);

  closeEditMemoModal();
}

export function onMemoEditDeleteBtn( scene ) {
  if ( editingMemoIndex < 0 || !memos[editingMemoIndex] ) {
    console.log("Invalid memo index for delete.");
    closeEditMemoModal();
    return;
  }
  // 씬에서 제거
  scene.remove( memos[editingMemoIndex].object );
  memos.splice(editingMemoIndex, 1);
  console.log("Memo deleted:", editingMemoIndex);

  closeEditMemoModal();
}

export function makeDraggable(modalElement) {
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
  
    // 마우스를 누르면 드래그 시작
    modalElement.addEventListener('mousedown', (e) => {
      isDragging = true;
  
      // 모달의 현재 위치와, 마우스 다운 지점의 상대적 오프셋
      // (modalElement.getBoundingClientRect()를 써도 됩니다.)
      offsetX = e.clientX - modalElement.offsetLeft;
      offsetY = e.clientY - modalElement.offsetTop;
    });
  
    // 전역 document에 mousemove 리스너 → 드래그 중에 위치 이동
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
  
      // 모달 위치 변경
      modalElement.style.left = x + 'px';
      modalElement.style.top = y + 'px';
    });
  
    // 전역 document에 mouseup 리스너 → 드래그 종료
    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }