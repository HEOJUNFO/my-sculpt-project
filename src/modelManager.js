// src/modelManager.js

import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { loadStlFileAsGeometry } from './stlHelpers.js';
import { centerAndScaleGeometry } from './geometryHelpers.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVHHelper } from 'three-mesh-bvh';
import { fitCameraToObject } from './cameraHelpers.js';

export let modelList = [];    // [{ fileName, geometry, mesh, customOpacity }, ...]
export let activeItemIndex = -1;
export let initialGeometry = null;
export let initialFileName = null;

export const refs = {
  scene: null,
  camera: null,
  controls: null,
  targetMesh: null,
  bvhHelper: null,
  params: null,      // (matcap, displayHelper, modelOpacity, etc.)
  matcaps: null,
};

function createActiveMaterial() {
  return new THREE.MeshMatcapMaterial({
    matcap: refs.matcaps[ refs.params.matcap ],
    flatShading: refs.params.flatShading,
    transparent: true,
    opacity: refs.params.modelOpacity, 
  });
}
function createInactiveMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x555555,
    transparent: true,
    opacity: refs.params.modelOpacity,
  });
}

export function updateModelListUI() {
    const ul = document.getElementById('model-list');
    if ( !ul ) return;
  
    // (추가) 화면 중앙에 위치한 안내 DIV
    const dragHint = document.getElementById('drag-hint');
  
    // 리스트 초기화
    ul.innerHTML = '';
  
    // 모델이 비어있으면 => 중앙 안내 문구 표시
    if ( modelList.length === 0 ) {
      if (dragHint) {
        dragHint.style.display = 'block';
      }
      return; // 리스트 생성 로직은 생략
    } else {
      // 모델이 하나 이상 있으면 => 중앙 안내 문구 숨김
      if (dragHint) {
        dragHint.style.display = 'none';
      }
    }
  
    // ▼ 여기부터는 modelList가 1개 이상일 때의 로직
    modelList.forEach( (item, idx) => {
      // li
      const li = document.createElement('li');
      li.classList.add('model-list-item');
  
      // 파일명
      const filenameDiv = document.createElement('div');
      filenameDiv.classList.add('model-filename');
      let text = `${idx + 1}. ${item.fileName}`;
      if ( idx === activeItemIndex ) {
        filenameDiv.classList.add('model-filename--active');
      } else {
        filenameDiv.classList.add('model-filename--inactive');
      }
      filenameDiv.textContent = text;
  
      // 슬라이더
      const opacitySlider = document.createElement('input');
      opacitySlider.type = 'range';
      opacitySlider.min = '0';
      opacitySlider.max = '1';
      opacitySlider.step = '0.01';
      opacitySlider.style.width = '80px';
  
      // 현재 opacity
      const currentOpacity = (item.customOpacity !== undefined)
        ? item.customOpacity
        : (item.mesh.material.opacity ?? 1.0);
      opacitySlider.value = String(currentOpacity);
  
      // 슬라이더 변경 이벤트
      opacitySlider.addEventListener('input', e => {
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
      deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        removeFromList(idx);
      });
  
      // li 클릭 -> 활성 모델 변경
      li.addEventListener('click', (e) => {
        if ( e.target === opacitySlider ) {
          return; // 슬라이더 클릭은 무시 (활성화 변경 X)
        }
        activeItemIndex = idx;
        setTargetMeshAsActive(item.mesh);
      });
  
      // li 구성
      li.appendChild(filenameDiv);
      li.appendChild(opacitySlider);
      li.appendChild(deleteBtn);
  
      ul.appendChild(li);
    });
  }

function setTargetMeshAsActive( mesh ) {
  if ( refs.bvhHelper ) {
    refs.scene.remove( refs.bvhHelper );
    refs.bvhHelper = null;
  }
  refs.targetMesh = mesh;

  const idx = modelList.findIndex( it => it.mesh === mesh );
  activeItemIndex = idx;

  modelList.forEach( (item, i) => {
    const userOp = (item.customOpacity !== undefined)
      ? item.customOpacity
      : (refs.params.modelOpacity ?? 1.0);

    if ( i === idx ) {
      item.mesh.material = createActiveMaterial();
      item.mesh.material.opacity = userOp; 
    } else {
      item.mesh.material = createInactiveMaterial();
      item.mesh.material.opacity = userOp; 
    }
  });

  if ( mesh ) {
    const newHelper = new MeshBVHHelper( mesh, refs.params.depth );
    if ( refs.params.displayHelper ) {
      refs.scene.add( newHelper );
    }
    newHelper.update();
    refs.bvhHelper = newHelper;
  }

  updateModelListUI();
}

function removeFromList( index ) {
  const item = modelList[ index ];
  if ( item && item.mesh ) {
    refs.scene.remove( item.mesh );
  }
  modelList.splice(index, 1);

  if ( activeItemIndex === index ) {
    activeItemIndex = -1;
    refs.targetMesh = null;
    if ( refs.bvhHelper ) {
      refs.scene.remove( refs.bvhHelper );
      refs.bvhHelper = null;
    }
  } else if ( activeItemIndex > index ) {
    activeItemIndex--;
  }

  updateModelListUI();
}

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
      geometry: geometry.clone(),      // 현재 적용된 geometry
      mesh: newMesh,
      customOpacity: mat.opacity,
      originalGeometry: geometry.clone()  // ← 원본 geometry를 별도로 복사해 저장
    };
    modelList.push( item );
  
    if ( modelList.length === 1 ) {
      fitCameraToObject( refs.camera, newMesh, refs.controls );
    }
  
    setTargetMeshAsActive( newMesh );
  }

export function onDropSTL( e ) {
  e.preventDefault();
  const files = e.dataTransfer.files;
  if ( !files || files.length === 0 ) return;

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

export function reset() {
    // 활성 모델이 없으면 종료
    if ( activeItemIndex < 0 ) {
      console.log('No active item to reset.');
      return;
    }
  
    const activeItem = modelList[ activeItemIndex ];
    if ( !activeItem.originalGeometry ) {
      console.log('No original geometry stored for this item.');
      return;
    }
  
    // 지금 편집 중인 메쉬의 geometry를 교체
    const oldGeo = activeItem.mesh.geometry;
    oldGeo.dispose(); // 기존 geometry 메모리 해제
    activeItem.mesh.geometry = activeItem.originalGeometry.clone();
    activeItem.mesh.geometry.computeVertexNormals();
    activeItem.mesh.geometry.computeBoundsTree({ setBoundingBox: false });
  
    // bvhHelper 리셋
    if ( refs.bvhHelper ) {
      refs.scene.remove( refs.bvhHelper );
      refs.bvhHelper = null;
    }
    const newHelper = new MeshBVHHelper( activeItem.mesh, refs.params.depth );
    if ( refs.params.displayHelper ) {
      refs.scene.add( newHelper );
    }
    newHelper.update();
    refs.bvhHelper = newHelper;
  
    console.log(`Reset model: ${activeItem.fileName}`);
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
