import Stats from 'three/examples/jsm/libs/stats.module.js';
import * as dat from 'three/examples/jsm/libs/lil-gui.module.min.js';
import * as THREE from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// BVH
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
  MeshBVHHelper,
} from 'three-mesh-bvh';

// STLExporter 추가!
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

// 리팩토링된 헬퍼들 (예: 별도 파일로 분리되어 있다고 가정)
import { centerAndScaleGeometry } from './geometryHelpers.js';
import { fitCameraToObject } from './cameraHelpers.js';
import { loadStlFileAsGeometry } from './stlHelpers.js';
import { performStroke, updateNormals } from './sculpt.js';

// three-mesh-bvh 프로토타입 확장
THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

// ---------------------- 전역 상태 ----------------------
let scene, camera, renderer, controls, stats;
let targetMesh = null, bvhHelper = null;
let brush, symmetryBrush;
let brushActive = false;
let mouse = new THREE.Vector2(), lastMouse = new THREE.Vector2();
let mouseState = false, lastMouseState = false;
let lastCastPose = new THREE.Vector3();
let material, rightClick = false;

// "처음 업로드된" 모델을 기억 -> reset() 시 복원
let initialGeometry = null;

// 업로드 모델 리스트 (최대 10개)
let modelList = []; // [{ fileName, geometry }, ...]

// 현재 로딩(선택)된 모델 인덱스
let activeItemIndex = -1;

// GUI / 파라미터들
const params = {
  matcap: 'Clay',
  size: 0.1,
  brush: 'clay',
  intensity: 50,
  maxSteps: 10,
  invert: false,
  symmetrical: true,
  flatShading: false,

  depth: 10,
  displayHelper: false,
};

const matcaps = {};

// ---------------------- 모델 리스트 UI 갱신 ----------------------
function updateModelListUI() {
  const ul = document.getElementById('model-list');
  if ( !ul ) return;

  ul.innerHTML = '';

  modelList.forEach( (item, idx) => {
    const li = document.createElement('li');
    li.textContent = `${idx + 1}. ${item.fileName}`;
    li.style.cursor = 'pointer';
    li.style.padding = '4px 0';

    // 리스트 항목 클릭 -> 해당 모델 불러오기
    li.addEventListener('click', () => {
      activeItemIndex = idx;
      setTargetMeshGeometry( item.geometry.clone() );
    });

    // 삭제 아이콘 추가
    const deleteBtn = document.createElement('span');
    deleteBtn.textContent = ' ❌';
    deleteBtn.style.marginLeft = '8px';
    deleteBtn.style.color = '#f66';
    deleteBtn.style.cursor = 'pointer';

    // 삭제 버튼 클릭 -> 리스트에서 제거
    deleteBtn.addEventListener('click', e => {
      e.stopPropagation(); // li의 클릭 이벤트 방지
      removeFromList(idx);
    });

    li.appendChild(deleteBtn);
    ul.appendChild(li);
  });
}

// ---------------------- 리스트에서 항목 제거 ----------------------
function removeFromList(index) {

  // 현재 씬에 표시중인 모델이라면, 씬 비우기
  if ( index === activeItemIndex ) {
    if ( targetMesh ) {
      targetMesh.geometry.dispose();
      targetMesh.material.dispose();
      scene.remove( targetMesh );
      targetMesh = null;
    }
    if ( bvhHelper ) {
      scene.remove( bvhHelper );
      bvhHelper = null;
    }
    activeItemIndex = -1;
  }

  modelList.splice(index, 1);
  updateModelListUI();
  console.log(`Removed item from list at index: ${index}`);
}

// ---------------------- STL 지오메트리를 씬에 로드 ----------------------
function setTargetMeshGeometry( geometry ) {

  if ( targetMesh ) {
    targetMesh.geometry.dispose();
    targetMesh.material.dispose();
    scene.remove( targetMesh );
    targetMesh = null;
  }
  if ( bvhHelper ) {
    scene.remove( bvhHelper );
    bvhHelper = null;
  }

  // "처음 업로드된" 모델 기록 (reset 용)
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

  // 새 Mesh
  targetMesh = new THREE.Mesh( geometry, material );
  targetMesh.frustumCulled = false;
  scene.add( targetMesh );

  // BVHHelper
  bvhHelper = new MeshBVHHelper( targetMesh, params.depth );
  if ( params.displayHelper ) {
    scene.add( bvhHelper );
  }
  bvhHelper.update();

  // 카메라 맞춤
  fitCameraToObject( camera, targetMesh, controls );
}

// ---------------------- reset(): 처음 업로드된 모델로 복원 ----------------------
function reset() {
  if ( !initialGeometry ) {
    console.log('아직 업로드된 모델이 없습니다.');
    return;
  }

  if ( targetMesh ) {
    targetMesh.geometry.dispose();
    targetMesh.material.dispose();
    scene.remove( targetMesh );
    targetMesh = null;
  }
  if ( bvhHelper ) {
    scene.remove( bvhHelper );
    bvhHelper = null;
  }

  const cloned = initialGeometry.clone();
  setTargetMeshGeometry( cloned );
}

// ---------------------- save(): 현재 선택된 모델에 변경사항 반영 ----------------------
function saveChanges() {
  if ( activeItemIndex < 0 ) {
    console.log('No item selected. Cannot save changes.');
    return;
  }
  if ( !targetMesh ) {
    console.log('No mesh in the scene. Nothing to save.');
    return;
  }

  // 현재 씬에서 스컬팅된 geometry를 다시 리스트에 저장
  modelList[activeItemIndex].geometry = targetMesh.geometry.clone();
  console.log(`Saved changes for item: ${modelList[activeItemIndex].fileName}`);
}

// ---------------------- export: STLExporter로 내보내기 ----------------------
function exportCurrentModel() {
  if ( !targetMesh ) {
    console.log( 'No model to export.' );
    return;
  }

  const exporter = new STLExporter();
  // Mesh 객체인 targetMesh 전달
  const stlString = exporter.parse( targetMesh );

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

// ---------------------- STL 파일 드래그앤드롭 ----------------------
function onDropSTL( e ) {
  e.preventDefault();
  if ( e.dataTransfer.files && e.dataTransfer.files.length > 0 ) {
    const file = e.dataTransfer.files[0];
    loadStlFileAsGeometry( file )
      .then( geometry => {
        // 씬에 표시
        setTargetMeshGeometry( geometry );

        // 리스트에 추가 + 현재 모델로 활성화
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
function onDragOver( e ) {
  e.preventDefault();
}

// ---------------------- init() ----------------------
function init() {

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.setClearColor( 0x060609, 1 );
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild( renderer.domElement );
  renderer.domElement.style.touchAction = 'none';

  scene = new THREE.Scene();

  // 라이트
  const light = new THREE.DirectionalLight( 0xffffff, 0.5 );
  light.position.set( 1, 1, 1 );
  scene.add( light );
  scene.add( new THREE.AmbientLight( 0xffffff, 0.4 ) );

  // 카메라
  camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 50 );
  camera.position.set( 0, 0, 3 );
  camera.far = 100;
  camera.updateProjectionMatrix();

  // Stats
  stats = new Stats();
  document.body.appendChild( stats.dom );

  // matcaps
  matcaps['Clay'] = new THREE.TextureLoader().load('textures/B67F6B_4B2E2A_6C3A34_F3DBC6-256px.png');
  matcaps['Red Wax'] = new THREE.TextureLoader().load('textures/763C39_431510_210504_55241C-256px.png');
  matcaps['Shiny Green'] = new THREE.TextureLoader().load('textures/3B6E10_E3F2C3_88AC2E_99CE51-256px.png');
  matcaps['Normal']   = new THREE.TextureLoader().load('textures/7877EE_D87FC5_75D9C7_1C78C0-256px.png');

  material = new THREE.MeshMatcapMaterial({
    flatShading: params.flatShading,
  });
  for ( const key in matcaps ) {
    matcaps[key].encoding = THREE.sRGBEncoding;
  }

  // 브러시(LineSegments)
  const brushSegments = [ new THREE.Vector3(), new THREE.Vector3( 0, 0, 1 ) ];
  for ( let i = 0; i < 50; i ++ ) {
    const nexti = i + 1;
    const x1 = Math.sin( (2*Math.PI*i)/50 );
    const y1 = Math.cos( (2*Math.PI*i)/50 );
    const x2 = Math.sin( (2*Math.PI*nexti)/50 );
    const y2 = Math.cos( (2*Math.PI*nexti)/50 );
    brushSegments.push(
      new THREE.Vector3( x1, y1, 0 ),
      new THREE.Vector3( x2, y2, 0 )
    );
  }
  brush = new THREE.LineSegments();
  brush.geometry.setFromPoints( brushSegments );
  brush.material.color.set( 'red' );
  // 항상 앞으로 표시되도록
  brush.renderOrder = 9999;          
  brush.material.depthTest = false;  
  scene.add( brush );

  symmetryBrush = brush.clone();
  scene.add( symmetryBrush );

  // OrbitControls
  controls = new OrbitControls( camera, renderer.domElement );
  // 사용자 요구사항: minDistance = 1.0
  controls.minDistance = 1.0;
  controls.addEventListener('start', () => { controls.active = true; });
  controls.addEventListener('end',   () => { controls.active = false; });

  // GUI
  const gui = new dat.GUI();
  gui.add( params, 'matcap', Object.keys( matcaps ) );

  const sculptFolder = gui.addFolder( 'Sculpting' );
  sculptFolder.add( params, 'brush', [ 'normal', 'clay', 'flatten' ] );
  sculptFolder.add( params, 'size', 0.025, 0.25, 0.005 );
  sculptFolder.add( params, 'intensity', 1, 100, 1 );
  sculptFolder.add( params, 'maxSteps', 1, 25, 1 );
  sculptFolder.add( params, 'symmetrical' );
  sculptFolder.add( params, 'invert' );
  sculptFolder.add( params, 'flatShading' ).onChange( val => {
    if ( targetMesh ) {
      targetMesh.material.flatShading = val;
      targetMesh.material.needsUpdate = true;
    }
  });
  sculptFolder.open();

  const helperFolder = gui.addFolder( 'BVH Helper' );
  helperFolder.add( params, 'depth', 1, 20, 1 ).onChange( val => {
    if ( bvhHelper ) {
      bvhHelper.depth = parseFloat( val );
      bvhHelper.update();
    }
  });
  helperFolder.add( params, 'displayHelper' ).onChange( display => {
    if ( !bvhHelper ) return;
    if ( display ) {
      scene.add( bvhHelper );
      bvhHelper.update();
    } else {
      scene.remove( bvhHelper );
    }
  });
  helperFolder.open();

  // reset, save, export, rebuildBVH
  gui.add({ reset }, 'reset');
  gui.add({ save: saveChanges }, 'save');
  gui.add({ export: exportCurrentModel }, 'export');
  gui.add({
    rebuildBVH: () => {
      if ( targetMesh ) {
        targetMesh.geometry.computeBoundsTree({ setBoundingBox: false });
        if ( bvhHelper ) bvhHelper.update();
      }
    }
  }, 'rebuildBVH');
  gui.open();

  // 이벤트
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('contextmenu', e => e.preventDefault() );
  window.addEventListener('wheel', onWheel );
  window.addEventListener('dragover', onDragOver, false);
  window.addEventListener('drop', onDropSTL, false);
}

// ---------------------- 이벤트 핸들러들 ----------------------
function onPointerMove( e ) {
  mouse.x = ( e.clientX / window.innerWidth ) * 2 - 1;
  mouse.y = - ( e.clientY / window.innerHeight ) * 2 + 1;
  brushActive = true;
}
function onPointerDown( e ) {
  mouse.x = ( e.clientX / window.innerWidth ) * 2 - 1;
  mouse.y = - ( e.clientY / window.innerHeight ) * 2 + 1;
  mouseState = Boolean( e.buttons & 3 );
  rightClick = Boolean( e.buttons & 2 );
  brushActive = true;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera( mouse, camera );
  raycaster.firstHitOnly = true;

  if ( targetMesh ) {
    const res = raycaster.intersectObject( targetMesh );
    controls.enabled = (res.length === 0);
  }
}
function onPointerUp( e ) {
  mouseState = Boolean( e.buttons & 3 );
  if ( e.pointerType === 'touch' ) {
    brushActive = false;
  }
}
function onWheel( e ) {
  let delta = e.deltaY;
  if ( e.deltaMode === 1 ) delta *= 40;
  if ( e.deltaMode === 2 ) delta *= 40;
  params.size += delta * 0.0001;
  params.size = Math.max( Math.min( params.size, 0.25 ), 0.025 );
}
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
}

// ---------------------- 렌더 루프 ----------------------
function renderLoop() {
  requestAnimationFrame( renderLoop );
  stats.begin();

  // matcap
  material.matcap = matcaps[ params.matcap ];

  if ( controls.active || ! brushActive || ! targetMesh ) {
    brush.visible = false;
    symmetryBrush.visible = false;
    lastCastPose.setScalar( Infinity );
  } else {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera( mouse, camera );
    raycaster.firstHitOnly = true;

    const hit = raycaster.intersectObject( targetMesh, true )[0];
    if ( hit ) {

      brush.visible = true;
      brush.scale.set( params.size, params.size, 0.1 );
      brush.position.copy( hit.point );

      symmetryBrush.visible = params.symmetrical;
      symmetryBrush.scale.set( params.size, params.size, 0.1 );
      symmetryBrush.position.copy( hit.point );
      symmetryBrush.position.x *= -1;

      controls.enabled = false;

      if ( lastCastPose.x === Infinity ) {
        lastCastPose.copy( hit.point );
      }

      if ( !(mouseState || lastMouseState) ) {
        // 클릭 안 된 상태 -> 위치만 갱신
        performStroke( hit.point, brush, true, {}, targetMesh, params, rightClick );
        if ( params.symmetrical ) {
          hit.point.x *= -1;
          performStroke( hit.point, symmetryBrush, true, {}, targetMesh, params, rightClick );
          hit.point.x *= -1;
        }
        lastMouse.copy( mouse );
        lastCastPose.copy( hit.point );

      } else {
        // 마우스 이동/클릭 상태
        const mdx = ( mouse.x - lastMouse.x ) * window.innerWidth * window.devicePixelRatio;
        const mdy = ( mouse.y - lastMouse.y ) * window.innerHeight * window.devicePixelRatio;
        let mdist = Math.sqrt( mdx*mdx + mdy*mdy );
        let castDist = hit.point.distanceTo( lastCastPose );

        const step = params.size * 0.15;
        const percent = Math.max( step / castDist, 1 / params.maxSteps );
        const mstep = mdist * percent;
        let stepCount = 0;

        const changedTriangles = new Set();
        const changedIndices = new Set();
        const traversedNodeIndices = new Set();
        const sets = {
          accumulatedTriangles: changedTriangles,
          accumulatedIndices: changedIndices,
          accumulatedTraversedNodeIndices: traversedNodeIndices
        };

        while ( castDist > step && mdist > params.size * 200 / hit.distance ) {
          lastMouse.lerp( mouse, percent );
          lastCastPose.lerp( hit.point, percent );
          castDist -= step;
          mdist -= mstep;

          performStroke( lastCastPose, brush, false, sets, targetMesh, params, rightClick );
          if ( params.symmetrical ) {
            lastCastPose.x *= -1;
            performStroke( lastCastPose, symmetryBrush, false, sets, targetMesh, params, rightClick );
            lastCastPose.x *= -1;
          }

          stepCount++;
          if ( stepCount > params.maxSteps ) {
            break;
          }
        }

        if ( stepCount > 0 ) {
          updateNormals( changedTriangles, changedIndices, targetMesh );
          targetMesh.geometry.boundsTree?.refit( traversedNodeIndices );
          if ( bvhHelper && bvhHelper.parent ) {
            bvhHelper.update();
          }
        } else {
          // 이동량이 너무 작으면 위치만
          performStroke( hit.point, brush, true, {}, targetMesh, params, rightClick );
          if ( params.symmetrical ) {
            hit.point.x *= -1;
            performStroke( hit.point, symmetryBrush, true, {}, targetMesh, params, rightClick );
            hit.point.x *= -1;
          }
        }
      }

    } else {
      controls.enabled = true;
      brush.visible = false;
      symmetryBrush.visible = false;
      lastMouse.copy( mouse );
      lastCastPose.setScalar( Infinity );
    }
  }

  lastMouseState = mouseState;

  renderer.render( scene, camera );
  stats.end();
}

// 실행
init();
renderLoop();
