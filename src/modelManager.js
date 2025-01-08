// src/modelManager.js

import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { loadStlFileAsGeometry } from './stlHelpers.js';
import { centerAndScaleGeometry } from './geometryHelpers.js';
import { fitCameraToObject } from './cameraHelpers.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import {
    MeshBVHHelper,
  } from 'three-mesh-bvh';

// "외부(main.js)에서" 접근할 수 있도록 export
export let modelList = [];  // [{ fileName, geometry }, ...]
export let activeItemIndex = -1;
export let initialGeometry = null; // 처음 업로드된 모델

// scene, targetMesh, bvhHelper 는 main.js  등에서 만든 후 주입
// 여기서는 '참조'를 담아둘 객체를 export (또는 setter 함수를 export)
export const refs = {
  scene: null,
  camera: null,
  controls: null,
  targetMesh: null,
  bvhHelper: null,
  params: null,
  matcaps: null,
};

// 모델 리스트 갱신 UI
export function updateModelListUI() {
  const ul = document.getElementById('model-list');
  if ( !ul ) return;

  ul.innerHTML = '';
  modelList.forEach( (item, idx) => {
    const li = document.createElement('li');
    li.textContent = `${idx + 1}. ${item.fileName}`;
    li.style.cursor = 'pointer';
    li.style.padding = '4px 0';

    li.addEventListener('click', () => {
      activeItemIndex = idx;
      setTargetMeshGeometry( item.geometry.clone() );
    });

    // 삭제 아이콘
    const deleteBtn = document.createElement('span');
    deleteBtn.textContent = ' ❌';
    deleteBtn.style.marginLeft = '8px';
    deleteBtn.style.color = '#f66';
    deleteBtn.style.cursor = 'pointer';

    deleteBtn.addEventListener('click', e => {
      e.stopPropagation();
      removeFromList(idx);
    });

    li.appendChild(deleteBtn);
    ul.appendChild(li);
  });
}

export function removeFromList(index) {
  if ( index === activeItemIndex ) {
    // targetMesh 제거
    if ( refs.targetMesh ) {
      refs.targetMesh.geometry.dispose();
      refs.targetMesh.material.dispose();
      refs.scene.remove( refs.targetMesh );
      refs.targetMesh = null;
    }
    // bvhHelper 제거
    if ( refs.bvhHelper ) {
      refs.scene.remove( refs.bvhHelper );
      refs.bvhHelper = null;
    }
    activeItemIndex = -1;
  }
  modelList.splice(index, 1);
  updateModelListUI();
  console.log(`Removed item from list at index: ${index}`);
}

// 모델 설정
export function setTargetMeshGeometry( geometry ) {
  const { scene, targetMesh, bvhHelper, params, matcaps, controls } = refs;

  // 기존 mesh 제거
  if ( targetMesh ) {
    targetMesh.geometry.dispose();
    targetMesh.material.dispose();
    scene.remove( targetMesh );
    refs.targetMesh = null;
  }
  if ( bvhHelper ) {
    scene.remove( bvhHelper );
    refs.bvhHelper = null;
  }

  // "처음 업로드된" 모델 저장
  if ( !initialGeometry ) {
    initialGeometry = geometry.clone();
  }

  // 지오메트리 전처리
  centerAndScaleGeometry( geometry );
  geometry = BufferGeometryUtils.mergeVertices( geometry );
  geometry.computeVertexNormals();
  geometry.attributes.position.setUsage( THREE.DynamicDrawUsage );
  geometry.attributes.normal.setUsage( THREE.DynamicDrawUsage );
  geometry.computeBoundsTree({ setBoundingBox: false });

  // 새 Material (matcap, 투명도 등)
  const mat = new THREE.MeshMatcapMaterial({
    matcap: matcaps[ params.matcap ],
    flatShading: params.flatShading,
    transparent: true,
    opacity: params.modelOpacity,
  });

  const newMesh = new THREE.Mesh( geometry, mat );
  newMesh.frustumCulled = false;
  scene.add( newMesh );
  refs.targetMesh = newMesh;

  // BVHHelper
  const newHelper = new MeshBVHHelper( newMesh, params.depth );
  if ( params.displayHelper ) {
    scene.add( newHelper );
  }
  newHelper.update();
  refs.bvhHelper = newHelper;

  // 카메라 맞춤
  fitCameraToObject( refs.camera, newMesh, controls );
}

// reset
export function reset() {
  if ( !initialGeometry ) {
    console.log('No initial model to reset to.');
    return;
  }

  if ( refs.targetMesh ) {
    refs.targetMesh.geometry.dispose();
    refs.targetMesh.material.dispose();
    refs.scene.remove( refs.targetMesh );
    refs.targetMesh = null;
  }
  if ( refs.bvhHelper ) {
    refs.scene.remove( refs.bvhHelper );
    refs.bvhHelper = null;
  }

  const cloned = initialGeometry.clone();
  setTargetMeshGeometry( cloned );
}

// 저장
export function saveChanges() {
  if ( activeItemIndex < 0 ) {
    console.log('No item selected. Cannot save changes.');
    return;
  }
  if ( ! refs.targetMesh ) {
    console.log('No mesh in the scene. Nothing to save.');
    return;
  }
  modelList[activeItemIndex].geometry = refs.targetMesh.geometry.clone();
  console.log(`Saved changes for item: ${modelList[activeItemIndex].fileName}`);
}

// STL Export
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

// STL 드래그앤드롭
export function onDropSTL( e ) {
  e.preventDefault();
  if ( e.dataTransfer.files && e.dataTransfer.files.length > 0 ) {
    const file = e.dataTransfer.files[0];
    loadStlFileAsGeometry( file )
      .then( geometry => {
        setTargetMeshGeometry( geometry );

        modelList.push({
          fileName: file.name,
          geometry: geometry.clone(),
        });
        activeItemIndex = modelList.length - 1;

        updateModelListUI();
      })
      .catch( err => {
        console.error( 'STL 로딩 실패:', err );
      });
  }
}
export function onDragOver( e ) {
  e.preventDefault();
}
