// src/main.js

import Stats from 'three/examples/jsm/libs/stats.module.js';
import * as dat from 'three/examples/jsm/libs/lil-gui.module.min.js';
import * as THREE from 'three';

// ▼ TrackballControls import
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';

import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from 'three-mesh-bvh';

// 스컬팅 로직
import { performStroke, updateNormals } from './sculpt.js';

// 메모 로직 (memos 배열, 메모 오브젝트 등)
import {
  memos,
  openNewMemoModal,
  openEditMemoModal,
  onMemoNewOkBtn,
  onMemoEditUpdateBtn,
  onMemoEditDeleteBtn
} from './memo.js';

// 모델 관리 (STL 드롭, 모델 리스트, reset/save/export, etc.)
import {
  refs,  // { scene, camera, controls, targetMesh, bvhHelper, params, matcaps }
  reset,
  saveChanges,
  exportCurrentModel,
  onDropSTL,
  onDragOver,
} from './modelManager.js';

// three-mesh-bvh 프로토타입 확장
THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;


// ---------------------- 전역 상태 ----------------------
let renderer, stats;
let brush, symmetryBrush;
let brushActive = false;
let mouse = new THREE.Vector2(), lastMouse = new THREE.Vector2();
let mouseState = false, lastMouseState = false;
let lastCastPose = new THREE.Vector3();
let rightClick = false;

// ▼ 기존 파라미터 + memoHide
const params = {
  matcap: 'Clay',

  // Sculpting
  size: 0.1,
  brush: 'clay',
  intensity: 50,
  maxSteps: 10,
  invert: false,
  symmetrical: false,
  flatShading: false,

  // BVH Helper
  depth: 10,
  displayHelper: false,

  // 투명도
  brushOpacity: 1.0,
  modelOpacity: 1.0,

  // 메모 모드
  memoMode: false,

  // Hide Memo
  memoHide: false,
};

const matcaps = {};

// ---------------------- init() ----------------------
function init() {

  // 1) renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x060609, 1);
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';

  // 2) scene
  const scene = new THREE.Scene();

  // 3) light
  const light = new THREE.DirectionalLight(0xffffff, 0.5);
  light.position.set(1, 1, 1);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  // 4) camera
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 0, 3);
  camera.far = 100;
  camera.updateProjectionMatrix();

  // 5) stats
  stats = new Stats();
  document.body.appendChild(stats.dom);

  // 6) matcaps
  matcaps['Clay'] = new THREE.TextureLoader().load('textures/B67F6B_4B2E2A_6C3A34_F3DBC6-256px.png');
  matcaps['Red Wax'] = new THREE.TextureLoader().load('textures/763C39_431510_210504_55241C-256px.png');
  matcaps['Shiny Green'] = new THREE.TextureLoader().load('textures/3B6E10_E3F2C3_88AC2E_99CE51-256px.png');
  matcaps['Normal']   = new THREE.TextureLoader().load('textures/7877EE_D87FC5_75D9C7_1C78C0-256px.png');

  // 브러시(LineSegments)
  const brushMat = new THREE.LineBasicMaterial({
    color: 'red',
    transparent: true,
    opacity: params.brushOpacity,
    depthTest: false,
  });

  const brushSegments = [ new THREE.Vector3(), new THREE.Vector3(0,0,1) ];
  for ( let i = 0; i < 50; i ++ ) {
    const nexti = i+1;
    const x1 = Math.sin((2*Math.PI*i)/50);
    const y1 = Math.cos((2*Math.PI*i)/50);
    const x2 = Math.sin((2*Math.PI*nexti)/50);
    const y2 = Math.cos((2*Math.PI*nexti)/50);
    brushSegments.push(
      new THREE.Vector3(x1,y1,0),
      new THREE.Vector3(x2,y2,0),
    );
  }
  const brushGeo = new THREE.BufferGeometry().setFromPoints(brushSegments);
  brush = new THREE.LineSegments(brushGeo, brushMat);
  brush.renderOrder = 9999;
  scene.add(brush);

  symmetryBrush = brush.clone();
  scene.add(symmetryBrush);

  // ▼ TrackballControls로 교체
  // (OrbitControls -> TrackballControls)
  const controls = new TrackballControls(camera, renderer.domElement);
  // 필요시 추가 설정 (rotateSpeed, zoomSpeed, etc.)
 controls.rotateSpeed = 3;

  controls.addEventListener('start', ()=>{ controls.active = true; });
  controls.addEventListener('end', ()=>{ controls.active = false; });

  // modelManager.js에서 사용할 참조
  refs.scene = scene;
  refs.camera = camera;
  refs.controls = controls;
  refs.targetMesh = null;
  refs.bvhHelper = null;
  refs.params = params;
  refs.matcaps = matcaps;

  // GUI
  const gui = new dat.GUI();

  // Model Folder
  const modelFolder = gui.addFolder('Model');
  modelFolder.add(params, 'matcap', Object.keys(matcaps)).name('Matcap');
  modelFolder.add(params, 'modelOpacity', 0.0, 1.0, 0.01).name('Model Opacity').onChange(val => {
    if ( refs.targetMesh ) {
      refs.targetMesh.material.opacity = val;
    }
  });
  modelFolder.open();

  // Sculpt Folder
  const sculptFolder = gui.addFolder('Sculpting');
  sculptFolder.add(params, 'brush', [ 'normal','clay','flatten' ]);
  sculptFolder.add(params, 'size', 0.025,0.25,0.005);
  sculptFolder.add(params, 'intensity',1,100,1);
  sculptFolder.add(params, 'maxSteps',1,25,1);
  sculptFolder.add(params, 'invert');
  sculptFolder.add(params, 'flatShading').onChange( val => {
    if ( refs.targetMesh ) {
      refs.targetMesh.material.flatShading = val;
      refs.targetMesh.material.needsUpdate = true;
    }
  });
  sculptFolder.add(params, 'brushOpacity',0.0,1.0,0.01).name('Brush Opacity')
    .onChange(val => {
      brush.material.opacity = val;
      symmetryBrush.material.opacity = val;
    });
  sculptFolder.open();

  // BVH Helper
  const helperFolder = gui.addFolder('BVH Helper');
  helperFolder.add(params, 'depth', 1, 20, 1).onChange(val => {
    if ( refs.bvhHelper ) {
      refs.bvhHelper.depth = parseFloat(val);
      refs.bvhHelper.update();
    }
  });
  helperFolder.add(params, 'displayHelper').onChange( display => {
    if ( !refs.bvhHelper ) return;
    if ( display ) {
      refs.scene.add( refs.bvhHelper );
      refs.bvhHelper.update();
    } else {
      refs.scene.remove( refs.bvhHelper );
    }
  });
  helperFolder.open();

  // Memo Mode
  gui.add(params, 'memoMode').name('Memo Mode');

  // Hide Memo
  gui.add(params, 'memoHide').name('Hide Memo')
    .onChange( (hideVal) => {
      memos.forEach( (m) => {
        m.object.visible = !hideVal;
      });
    });

  // Buttons
  gui.add({ reset }, 'reset');
  gui.add({ save: saveChanges }, 'save');
  gui.add({ export: exportCurrentModel }, 'export');
  gui.add({
    rebuildBVH: () => {
      if ( refs.targetMesh ) {
        refs.targetMesh.geometry.computeBoundsTree({ setBoundingBox: false });
        if ( refs.bvhHelper ) {
          refs.bvhHelper.update();
        }
      }
    }
  }, 'rebuildBVH');
  gui.open();

  // 메모 모달 버튼
  document.getElementById('memo-new-ok-btn').addEventListener('click', () => onMemoNewOkBtn( scene ));
  document.getElementById('memo-edit-update-btn').addEventListener('click', () => onMemoEditUpdateBtn( scene ));
  document.getElementById('memo-edit-delete-btn').addEventListener('click', () => onMemoEditDeleteBtn( scene ));

  // 윈도우 이벤트
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('wheel', onWheel);
  window.addEventListener('dragover', onDragOver, false);
  window.addEventListener('drop', onDropSTL, false);

}

// 렌더 루프
function renderLoop() {
  requestAnimationFrame(renderLoop);
  stats.begin();

  // TrackballControls는 매 프레임 update() 필요
  refs.controls.update();

  if ( refs.targetMesh ) {
    refs.targetMesh.material.matcap = refs.matcaps[ refs.params.matcap ];
  }

  if ( params.memoMode || refs.controls.active || ! brushActive || ! refs.targetMesh ) {
    brush.visible = false;
    symmetryBrush.visible = false;
    lastCastPose.setScalar( Infinity );
  } else {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera( mouse, refs.camera );
    raycaster.firstHitOnly = true;

    const hit = raycaster.intersectObject( refs.targetMesh, true )[0];
    if ( hit ) {
      brush.visible = true;
      brush.scale.set( params.size, params.size, 0.1 );
      brush.position.copy( hit.point );

      symmetryBrush.visible = params.symmetrical;
      symmetryBrush.scale.set( params.size, params.size, 0.1 );
      symmetryBrush.position.copy( hit.point );
      symmetryBrush.position.x *= -1;

      // TrackballControls: camera movement is manual, we just disable interactions if needed
      refs.controls.enabled = false;

      if ( lastCastPose.x === Infinity ) {
        lastCastPose.copy( hit.point );
      }

      if ( ! ( mouseState || lastMouseState ) ) {
        performStroke( hit.point, brush, true, {}, refs.targetMesh, params, rightClick );
        if ( params.symmetrical ) {
          hit.point.x *= -1;
          performStroke( hit.point, symmetryBrush, true, {}, refs.targetMesh, params, rightClick );
          hit.point.x *= -1;
        }
        lastMouse.copy( mouse );
        lastCastPose.copy( hit.point );

      } else {
        // 스컬팅 로직
        const mdx = ( mouse.x - lastMouse.x ) * window.innerWidth * window.devicePixelRatio;
        const mdy = ( mouse.y - lastMouse.y ) * window.innerHeight * window.devicePixelRatio;
        let mdist = Math.sqrt( mdx * mdx + mdy * mdy );
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
          accumulatedTraversedNodeIndices: traversedNodeIndices,
        };

        while ( castDist > step && mdist > params.size * 200 / hit.distance ) {
          lastMouse.lerp( mouse, percent );
          lastCastPose.lerp( hit.point, percent );
          castDist -= step;
          mdist -= mstep;

          performStroke( lastCastPose, brush, false, sets, refs.targetMesh, params, rightClick );
          if ( params.symmetrical ) {
            lastCastPose.x *= -1;
            performStroke( lastCastPose, symmetryBrush, false, sets, refs.targetMesh, params, rightClick );
            lastCastPose.x *= -1;
          }

          stepCount++;
          if ( stepCount > params.maxSteps ) {
            break;
          }
        }

        if ( stepCount > 0 ) {
          updateNormals( changedTriangles, changedIndices, refs.targetMesh );
          refs.targetMesh.geometry.boundsTree?.refit( traversedNodeIndices );
          if ( refs.bvhHelper && refs.bvhHelper.parent ) {
            refs.bvhHelper.update();
          }
        } else {
          // 움직임 작으면 위치만
          performStroke( hit.point, brush, true, {}, refs.targetMesh, params, rightClick );
          if ( params.symmetrical ) {
            hit.point.x *= -1;
            performStroke( hit.point, symmetryBrush, true, {}, refs.targetMesh, params, rightClick );
            hit.point.x *= -1;
          }
        }
      }

    } else {
      refs.controls.enabled = true;
      brush.visible = false;
      symmetryBrush.visible = false;
      lastMouse.copy( mouse );
      lastCastPose.setScalar( Infinity );
    }
  }

  lastMouseState = mouseState;
  renderer.render( refs.scene, refs.camera );
  stats.end();
}

// ---------------------- 이벤트 핸들러들 ----------------------
function onPointerDown( e ) {
  mouse.x = ( e.clientX / window.innerWidth ) * 2 - 1;
  mouse.y = - ( e.clientY / window.innerHeight ) * 2 + 1;
  mouseState = Boolean( e.buttons & 3 );
  rightClick = Boolean( e.buttons & 2 );
  brushActive = true;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera( mouse, refs.camera );
  raycaster.firstHitOnly = true;

  // 메모 모드
  if ( params.memoMode ) {
    const memoHits = raycaster.intersectObjects( memos.map(m => m.object), true );
    if ( memoHits && memoHits.length > 0 ) {
      const memoObj = memoHits[0].object;
      const foundIndex = memos.findIndex( m => m.object === memoObj );
      if ( foundIndex >= 0 ) {
        openEditMemoModal( foundIndex );
        return;
      }
    }
  }

  if ( ! refs.targetMesh ) return;
  if ( params.memoMode ) {
    const meshHits = raycaster.intersectObject( refs.targetMesh, true );
    if ( meshHits && meshHits.length > 0 ) {
      openNewMemoModal( meshHits[0].point );
    }
    return;
  }

  // 스컬팅
  const res = raycaster.intersectObject( refs.targetMesh );
  refs.controls.enabled = (res.length === 0);
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
  refs.camera.aspect = window.innerWidth / window.innerHeight;
  refs.camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
}

// ---------------------- 실행 ----------------------
function main() {
  init();
  renderLoop();
}

main();
