// src/modelManager.js

import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { loadStlFileAsGeometry } from './stlHelpers.js';
import { centerAndScaleGeometry } from './geometryHelpers.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVHHelper } from 'three-mesh-bvh';
import { fitCameraToObject } from './cameraHelpers.js';

export let modelList = [];  // [{ fileName, geometry, mesh }, ...]
export let activeItemIndex = -1;
export let initialGeometry = null;
export let initialFileName = null;

export const refs = {
  scene: null,
  camera: null,
  controls: null,
  targetMesh: null,
  bvhHelper: null,
  params: null,      // 여기엔 global params들 (matcap, displayHelper 등)
  matcaps: null,
};

/** 
 * 활성 / 비활성 재질 생성 (기존과 동일)
 * 단, 'transparent: true'를 꼭 켜줘야 opacity 반영됨
 */
function createActiveMaterial() {
  return new THREE.MeshMatcapMaterial({
    matcap: refs.matcaps[ refs.params.matcap ],
    flatShading: refs.params.flatShading,
    transparent: true,
    opacity: refs.params.modelOpacity,  // 초기값
  });
}
function createInactiveMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x555555,
    transparent: true,  // 투명도 슬라이더 반영 위해
    opacity: refs.params.modelOpacity,  // 초기값
  });
}

export function updateModelListUI() {
    const ul = document.getElementById('model-list');
    if ( !ul ) return;
  
    ul.innerHTML = '';
  
    modelList.forEach( (item, idx) => {
  
      // <li>를 생성하고, 클래스 부여
      const li = document.createElement('li');
      li.classList.add('model-list-item'); 
  
      // (A) 파일명 표시용 <div> (텍스트만)
      const filenameDiv = document.createElement('div');
      filenameDiv.classList.add('model-filename');
      
      // 활성 여부에 따라 스타일 분기
      let text = `${idx + 1}. ${item.fileName}`;
      if ( idx === activeItemIndex ) {
        filenameDiv.classList.add('model-filename--active');
      } else {
        filenameDiv.classList.add('model-filename--inactive');
      }
      
      filenameDiv.textContent = text;
  
      // (B) 투명도 슬라이더
      const opacitySlider = document.createElement('input');
      opacitySlider.type = 'range';
      opacitySlider.min = '0';
      opacitySlider.max = '1';
      opacitySlider.step = '0.01';
      opacitySlider.style.width = '80px'; 
      opacitySlider.value = String(item.mesh.material.opacity ?? 1.0);
  
      opacitySlider.addEventListener('input', () => {
        const val = parseFloat(opacitySlider.value);
        item.mesh.material.opacity = val;
      });
  
      // (C) 삭제 버튼
      const deleteBtn = document.createElement('span');
      deleteBtn.textContent = ' ❌';
      deleteBtn.style.color = '#f66';
      deleteBtn.style.cursor = 'pointer';
  
      deleteBtn.addEventListener('click', e => {
        e.stopPropagation(); // li 클릭 이벤트 막기
        removeFromList( idx );
      });
  
      // (D) li 클릭 -> 활성 모델 변경
      li.addEventListener('click', () => {
        activeItemIndex = idx;
        setTargetMeshAsActive(item.mesh);
      });
  
      // (E) li 구조: [ filenameDiv | opacitySlider | deleteBtn ]
      li.appendChild(filenameDiv);
      li.appendChild(opacitySlider);
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
    if ( !initialGeometry ) {
      initialGeometry = geometry.clone();
      initialFileName = fileName;
    }
  
    centerAndScaleGeometry( geometry );
    geometry = BufferGeometryUtils.mergeVertices( geometry );
    geometry.computeVertexNormals();
    geometry.attributes.position.setUsage( THREE.DynamicDrawUsage );
    geometry.attributes.normal.setUsage( THREE.DynamicDrawUsage );
    geometry.computeBoundsTree({ setBoundingBox: false });
  
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

    if ( modelList.length === 1 ) {
        fitCameraToObject( refs.camera, newMesh, refs.controls );
      }
  
    setTargetMeshAsActive( newMesh );
  }
  
  // ★ 수정된 부분: onDropSTL => 여러 파일 처리
  export function onDropSTL( e ) {
    e.preventDefault();
  
    const files = e.dataTransfer.files;
    if ( !files || files.length === 0 ) {
      return;
    }
  
    // 여러 파일을 순회
    for ( let i = 0; i < files.length; i++ ) {
      const file = files[i];
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
  
    if ( !initialFileName ) {
      addModelToScene( initialGeometry.clone(), 'InitialModel' );
    } else {
      addModelToScene( initialGeometry.clone(), initialFileName );
    }
  }
  
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