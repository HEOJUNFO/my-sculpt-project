// src/modelManager.js

import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { loadStlFileAsGeometry } from './stlHelpers.js';
import { centerAndScaleGeometry } from './geometryHelpers.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVHHelper } from 'three-mesh-bvh';

// 모델 목록
export let modelList = [];  // [{ fileName, geometry, mesh }, ...]
export let activeItemIndex = -1;
export let initialGeometry = null;
// ▼ 추가: 첫 모델 이름도 기억
export let initialFileName = null;

// scene / camera / controls / targetMesh / bvhHelper 등 참조
export const refs = {
  scene: null,
  camera: null,
  controls: null,
  targetMesh: null,   // 현재 타겟 모델
  bvhHelper: null,
  params: null,
  matcaps: null,
};

/** 
 * "활성(선택된)" 모델용 재질: matcap 적용
 */
function createActiveMaterial() {
  return new THREE.MeshMatcapMaterial({
    matcap: refs.matcaps[ refs.params.matcap ],
    flatShading: refs.params.flatShading,
    transparent: true,
    opacity: refs.params.modelOpacity,
  });
}

/** 
 * "비활성(선택 안 된)" 모델용 재질: 단색(또는 텍스처 미적용)
 */
function createInactiveMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x555555,
  });
}

/**
 * 모델 리스트 UI 갱신 (list에 x 버튼 복원, (Active) 표시)
 */
export function updateModelListUI() {
  const ul = document.getElementById('model-list');
  if ( !ul ) return;

  ul.innerHTML = '';

  modelList.forEach( (item, idx) => {
    const li = document.createElement('li');

    let text = `${idx + 1}. ${item.fileName}`;
    if ( idx === activeItemIndex ) {
      text += ' (Active)';
      li.style.fontWeight = 'bold';
      li.style.color = '#ff6';
    } else {
      li.style.fontWeight = 'normal';
      li.style.color = '#fff';
    }

    li.textContent = text;
    li.style.cursor = 'pointer';
    li.style.padding = '4px 0';

    // 클릭 -> 해당 모델 활성
    li.addEventListener('click', () => {
      activeItemIndex = idx;
      setTargetMeshAsActive( item.mesh );
    });

    // 삭제 버튼(x)
    const deleteBtn = document.createElement('span');
    deleteBtn.textContent = ' ❌';
    deleteBtn.style.marginLeft = '8px';
    deleteBtn.style.color = '#f66';
    deleteBtn.style.cursor = 'pointer';

    deleteBtn.addEventListener('click', e => {
      e.stopPropagation(); // li 클릭 이벤트 막기
      removeFromList( idx );
    });

    li.appendChild(deleteBtn);
    ul.appendChild(li);
  });
}

/**
 * 현재 선택 모델 변경 -> targetMesh 바꾸고, bvhHelper 다시 생성
 * 그리고 활성 / 비활성 재질 설정
 */
function setTargetMeshAsActive( mesh ) {

  // 이전 helper 제거
  if ( refs.bvhHelper ) {
    refs.scene.remove( refs.bvhHelper );
    refs.bvhHelper = null;
  }

  // targetMesh 갱신
  refs.targetMesh = mesh;

  // modelList에서 이 mesh가 몇 번째인지 찾음
  const idx = modelList.findIndex( it => it.mesh === mesh );
  activeItemIndex = idx;

  // 1) 모든 모델 순회 -> 재질 변경
  modelList.forEach( (item, i) => {
    if ( i === idx ) {
      // 활성 -> matcap 적용
      item.mesh.material = createActiveMaterial();
    } else {
      // 비활성 -> 단색 재질
      item.mesh.material = createInactiveMaterial();
    }
  });

  // 2) 새 BVH helper
  if ( mesh ) {
    const newHelper = new MeshBVHHelper( mesh, refs.params.depth );
    if ( refs.params.displayHelper ) {
      refs.scene.add( newHelper );
    }
    newHelper.update();
    refs.bvhHelper = newHelper;
  }

  // 3) UI 갱신
  updateModelListUI();
}

/**
 * 모델 삭제 -> scene에서 제거 + modelList에서 제거
 */
function removeFromList( index ) {
  const item = modelList[ index ];
  if ( item && item.mesh ) {
    refs.scene.remove( item.mesh );
  }

  modelList.splice(index, 1);

  if ( activeItemIndex === index ) {
    // 삭제된 모델이 활성 모델이었다면
    activeItemIndex = -1;
    refs.targetMesh = null;
    if ( refs.bvhHelper ) {
      refs.scene.remove( refs.bvhHelper );
      refs.bvhHelper = null;
    }
  } else if ( activeItemIndex > index ) {
    // 인덱스 감소
    activeItemIndex--;
  }

  updateModelListUI();
}

/**
 * 새 STL 모델(scene에 추가)
 * - 기존 모델은 그대로 유지
 * - 새 모델은 자동으로 활성(targetMesh)
 */
function addModelToScene( geometry, fileName ) {
  // 첫 업로드 기록
  if ( !initialGeometry ) {
    initialGeometry = geometry.clone();
    // ▼ 추가: 첫 모델의 파일명도 저장
    initialFileName = fileName;
  }

  centerAndScaleGeometry( geometry );
  geometry = BufferGeometryUtils.mergeVertices( geometry );
  geometry.computeVertexNormals();
  geometry.attributes.position.setUsage( THREE.DynamicDrawUsage );
  geometry.attributes.normal.setUsage( THREE.DynamicDrawUsage );
  geometry.computeBoundsTree({ setBoundingBox: false });

  // 새 Mesh -> 임시로 활성 재질(나중에 setTargetMeshAsActive에서 보강)
  const mat = createActiveMaterial();
  const newMesh = new THREE.Mesh( geometry, mat );
  newMesh.frustumCulled = false;

  refs.scene.add( newMesh );

  const item = {
    fileName,
    geometry: geometry.clone(),
    mesh: newMesh,
  };
  modelList.push( item );

  // 새 모델 -> 활성
  setTargetMeshAsActive( newMesh );
}

// STL 드래그앤드롭 핸들러
export function onDropSTL( e ) {
  e.preventDefault();
  if ( e.dataTransfer.files && e.dataTransfer.files.length > 0 ) {
    const file = e.dataTransfer.files[0];
    loadStlFileAsGeometry( file )
      .then( geometry => {
        addModelToScene( geometry, file.name );
      })
      .catch( err => {
        console.error( 'STL load error:', err );
      });
  }
}

export function onDragOver( e ) {
  e.preventDefault();
}

// reset(): 첫 업로드 모델로만 복원
export function reset() {
  if ( !initialGeometry ) {
    console.log('No initial model to reset to.');
    return;
  }

  // 모든 mesh / helper 제거
  modelList.forEach( item => {
    refs.scene.remove( item.mesh );
  });
  modelList = [];
  activeItemIndex = -1;

  if ( refs.bvhHelper ) {
    refs.scene.remove( refs.bvhHelper );
    refs.bvhHelper = null;
  }
  refs.targetMesh = null;

  // ▼ 첫 모델 파일명으로 다시 추가
  if ( !initialFileName ) {
    // 만약 파일명이 없는 경우, "InitialModel" 등 기본값
    addModelToScene( initialGeometry.clone(), 'InitialModel' );
  } else {
    addModelToScene( initialGeometry.clone(), initialFileName );
  }
}

// saveChanges(): 현재 targetMesh.geometry를 modelList에 반영
export function saveChanges() {
  if ( activeItemIndex < 0 ) {
    console.log('No item selected.');
    return;
  }
  if ( ! refs.targetMesh ) {
    console.log('No targetMesh in the scene.');
    return;
  }
  modelList[activeItemIndex].geometry = refs.targetMesh.geometry.clone();
  console.log(`Saved changes for: ${modelList[activeItemIndex].fileName}`);
}

// exportCurrentModel(): 현재 targetMesh를 STLExport
export function exportCurrentModel() {
  if ( ! refs.targetMesh ) {
    console.log( 'No model to export.' );
    return;
  }
  const exporter = new STLExporter();
  const stlString = exporter.parse( refs.targetMesh );

  const blob = new Blob( [ stlString ], { type: 'text/plain' } );
  const url = URL.createObjectURL( blob );
  const link = document.createElement( 'a' );
  link.style.display = 'none';
  document.body.appendChild( link );
  link.href = url;
  link.download = 'exportedModel.stl';
  link.click();
  URL.revokeObjectURL( url );
  document.body.removeChild( link );

  console.log( 'Exported current model as STL.' );
}
