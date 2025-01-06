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

// STLExporter
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

// (리팩토링 헬퍼)
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

let initialGeometry = null; // 처음 업로드된 모델
let modelList = [];         // [{ fileName, geometry }, ...]
let activeItemIndex = -1;   // 현재 선택된 모델 인덱스

const memos = []; // [{ object: THREE.Mesh, position: THREE.Vector3, text: string }]

// ---------------------- GUI / 파라미터 ----------------------
const params = {
  matcap: 'Clay',

  // Sculpting
  size: 0.1,
  brush: 'clay',
  intensity: 50,
  maxSteps: 10,
  invert: false,
  symmetrical: true,
  flatShading: false,

  // BVH
  depth: 10,
  displayHelper: false,

  // 투명도
  brushOpacity: 1.0,
  modelOpacity: 1.0,

  // 메모 모드
  memoMode: false,
};

const matcaps = {};

// ---------------------- 모달 관련 ----------------------
let pendingMemoPosition = new THREE.Vector3(); // 새 메모 생성하려고 클릭한 위치
let editingMemoIndex = -1; // 기존 메모 인덱스

function openNewMemoModal( point3D ) {
  pendingMemoPosition.copy( point3D );
  const modal = document.getElementById('memo-modal-new');
  const input = document.getElementById('memo-input-new');
  modal.style.display = 'block';
  input.value = ''; // 초기화
}

function closeNewMemoModal() {
  const modal = document.getElementById('memo-modal-new');
  modal.style.display = 'none';
}

function openEditMemoModal( memoIndex ) {
  editingMemoIndex = memoIndex;
  const modal = document.getElementById('memo-modal-edit');
  const input = document.getElementById('memo-input-edit');
  modal.style.display = 'block';

  // 기존 메모 내용 로드
  input.value = memos[memoIndex].text;
}

function closeEditMemoModal() {
  const modal = document.getElementById('memo-modal-edit');
  modal.style.display = 'none';
  editingMemoIndex = -1;
}

// 메모 구체 생성
function createMemoSphere( position ) {
  const sphereGeo = new THREE.SphereGeometry( 0.02, 16, 16 );
  const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffdd22 });
  const sphere = new THREE.Mesh( sphereGeo, sphereMat );
  sphere.position.copy( position );
  return sphere;
}

// ---------------------- 모델 리스트 UI ----------------------
function updateModelListUI() {
  const ul = document.getElementById('model-list');
  if ( !ul ) return;

  ul.innerHTML = '';

  modelList.forEach( (item, idx) => {
    const li = document.createElement('li');
    li.textContent = `${idx + 1}. ${item.fileName}`;
    li.style.cursor = 'pointer';
    li.style.padding = '4px 0';

    // 클릭 -> 해당 모델 로드
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

function removeFromList(index) {
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

// ---------------------- STL 로드 -> 씬에 반영 ----------------------
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

  if ( !initialGeometry ) {
    initialGeometry = geometry.clone();
  }

  centerAndScaleGeometry( geometry );
  geometry = BufferGeometryUtils.mergeVertices( geometry );
  geometry.computeVertexNormals();
  geometry.attributes.position.setUsage( THREE.DynamicDrawUsage );
  geometry.attributes.normal.setUsage( THREE.DynamicDrawUsage );
  geometry.computeBoundsTree({ setBoundingBox: false });

  const modelMat = new THREE.MeshMatcapMaterial({
    matcap: matcaps[ params.matcap ],
    flatShading: params.flatShading,
    transparent: true,
    opacity: params.modelOpacity,
  });

  targetMesh = new THREE.Mesh( geometry, modelMat );
  targetMesh.frustumCulled = false;
  scene.add( targetMesh );

  bvhHelper = new MeshBVHHelper( targetMesh, params.depth );
  if ( params.displayHelper ) {
    scene.add( bvhHelper );
  }
  bvhHelper.update();

  fitCameraToObject( camera, targetMesh, controls );
}

// ---------------------- reset() ----------------------
function reset() {
  if ( !initialGeometry ) {
    console.log('No initial model to reset to.');
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

// ---------------------- save() ----------------------
function saveChanges() {
  if ( activeItemIndex < 0 ) {
    console.log('No item selected. Cannot save changes.');
    return;
  }
  if ( !targetMesh ) {
    console.log('No mesh in the scene. Nothing to save.');
    return;
  }

  modelList[activeItemIndex].geometry = targetMesh.geometry.clone();
  console.log(`Saved changes for item: ${modelList[activeItemIndex].fileName}`);
}

// ---------------------- export STL ----------------------
function exportCurrentModel() {
  if ( !targetMesh ) {
    console.log( 'No model to export.' );
    return;
  }

  const exporter = new STLExporter();
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

// ---------------------- STL 드래그앤드롭 ----------------------
function onDropSTL( e ) {
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

  // 브러시 material
  const brushMaterial = new THREE.LineBasicMaterial({
    color: 'red',
    transparent: true,
    opacity: params.brushOpacity,
    depthTest: false,
  });

  // 브러시 geometry
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
  const brushGeo = new THREE.BufferGeometry().setFromPoints( brushSegments );

  brush = new THREE.LineSegments( brushGeo, brushMaterial );
  brush.renderOrder = 9999; 
  scene.add( brush );

  symmetryBrush = brush.clone();
  scene.add( symmetryBrush );

  // OrbitControls
  controls = new OrbitControls( camera, renderer.domElement );
  controls.minDistance = 1.0;
  controls.addEventListener('start', () => { controls.active = true; });
  controls.addEventListener('end',   () => { controls.active = false; });

  // GUI
  const gui = new dat.GUI();

  // Model 폴더
  const modelFolder = gui.addFolder('Model');
  modelFolder.add( params, 'matcap', Object.keys( matcaps ) ).name('Matcap');
  modelFolder.add( params, 'modelOpacity', 0.0, 1.0, 0.01 ).name('Model Opacity').onChange( val => {
    if ( targetMesh ) {
      targetMesh.material.opacity = val;
    }
  });
  modelFolder.open();

  // Sculpting 폴더
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
  sculptFolder.add( params, 'brushOpacity', 0.0, 1.0, 0.01 ).name('Brush Opacity')
    .onChange( val => {
      brush.material.opacity = val;
      symmetryBrush.material.opacity = val;
    });
  sculptFolder.open();

  // BVH Helper 폴더
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

  // 메모 모드 토글
  gui.add( params, 'memoMode' ).name('Memo Mode');

  // 버튼들
  gui.add({ reset }, 'reset');
  gui.add({ save: saveChanges }, 'save');
  gui.add({ export: exportCurrentModel }, 'export');
  gui.add({
    rebuildBVH: () => {
      if ( targetMesh ) {
        targetMesh.geometry.computeBoundsTree({ setBoundingBox: false });
        if ( bvhHelper ) {
          bvhHelper.update();
        }
      }
    }
  }, 'rebuildBVH');
  gui.open();

  document.getElementById('memo-new-ok-btn').addEventListener('click', onMemoNewOkBtn);
  document.getElementById('memo-edit-update-btn').addEventListener('click', onMemoEditUpdateBtn);
  document.getElementById('memo-edit-delete-btn').addEventListener('click', onMemoEditDeleteBtn);

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

// ---------------------- 새 메모 모달 OK ----------------------
function onMemoNewOkBtn() {
  closeNewMemoModal();

  const input = document.getElementById('memo-input-new');
  const text = input.value; // 그대로
  if (!text) {
    console.log("No memo text provided.");
    return;
  }
  const memoObj = createMemoSphere( pendingMemoPosition );
  scene.add( memoObj );

  memos.push({
    object: memoObj,
    position: pendingMemoPosition.clone(),
    text,
  });
  console.log("New memo created:", text, pendingMemoPosition);
}

// ---------------------- 기존 메모 수정/삭제 ----------------------
function onMemoEditUpdateBtn() {
  if ( editingMemoIndex < 0 || !memos[editingMemoIndex] ) {
    console.log("Invalid memo index for update.");
    closeEditMemoModal();
    return;
  }
  const input = document.getElementById('memo-input-edit');
  memos[editingMemoIndex].text = input.value;
  console.log("Memo updated:", editingMemoIndex, input.value);

  closeEditMemoModal();
}

function onMemoEditDeleteBtn() {
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

// ---------------------- 클릭 ----------------------
function onPointerDown( e ) {
  mouse.x = ( e.clientX / window.innerWidth ) * 2 - 1;
  mouse.y = - ( e.clientY / window.innerHeight ) * 2 + 1;
  mouseState = Boolean( e.buttons & 3 );
  rightClick = Boolean( e.buttons & 2 );
  brushActive = true;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera( mouse, camera );
  raycaster.firstHitOnly = true;

  // 1) 메모 배열(노란 구들)과의 충돌 체크
  const memoHits = raycaster.intersectObjects( memos.map(m => m.object), true );
  if ( memoHits && memoHits.length > 0 ) {
    // 해당 메모 편집 모달
    const memoObj = memoHits[0].object;
    const foundIndex = memos.findIndex( m => m.object === memoObj );
    if ( foundIndex >= 0 ) {
      openEditMemoModal(foundIndex);
      return;
    }
  }

  // 2) memoMode -> 새 메모
  if ( !targetMesh ) return;
  if ( params.memoMode ) {
    const meshHits = raycaster.intersectObject( targetMesh, true );
    if ( meshHits && meshHits.length > 0 ) {
      const hit = meshHits[0];
      openNewMemoModal(hit.point);
    }
    return;
  }

  // 3) 스컬팅 모드
  const res = raycaster.intersectObject( targetMesh );
  controls.enabled = (res.length === 0);
}

function onPointerUp( e ) {
  mouseState = Boolean( e.buttons & 3 );
  if ( e.pointerType === 'touch' ) {
    brushActive = false;
  }
}

function onPointerMove( e ) {
  mouse.x = ( e.clientX / window.innerWidth ) * 2 - 1;
  mouse.y = - ( e.clientY / window.innerHeight ) * 2 + 1;
  brushActive = true;
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
  if ( targetMesh ) {
    targetMesh.material.matcap = matcaps[ params.matcap ];
  }

  // 브러시 로직
  if ( params.memoMode || controls.active || ! brushActive || ! targetMesh ) {
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
        // 스컬핑 안 된 상태 -> 브러시 위치만
        performStroke( hit.point, brush, true, {}, targetMesh, params, rightClick );
        if ( params.symmetrical ) {
          hit.point.x *= -1;
          performStroke( hit.point, symmetryBrush, true, {}, targetMesh, params, rightClick );
          hit.point.x *= -1;
        }
        lastMouse.copy( mouse );
        lastCastPose.copy( hit.point );

      } else {
        // 스컬핑
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
          // 움직임 작으면 위치만
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

// ---------------------- 실행 ----------------------
init();
renderLoop();
