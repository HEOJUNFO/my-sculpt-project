// src/main.js

import Stats from 'three/examples/jsm/libs/stats.module.js';
import * as dat from 'three/examples/jsm/libs/lil-gui.module.min.js';
import * as THREE from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
  MeshBVHHelper,
} from 'three-mesh-bvh';

// ---- 우리가 만든 모듈들 import ----
import { centerAndScaleGeometry } from './geometryHelpers.js';
import { fitCameraToObject } from './cameraHelpers.js';
import { loadStlFileAsGeometry } from './stlHelpers.js';
import { performStroke, updateNormals } from './sculpt.js';

// Raycast / BufferGeometry 프로토타입 확장
THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

// -------------------------------------
// 전역 변수
// -------------------------------------
let scene, camera, renderer, controls, stats;
let targetMesh = null, bvhHelper = null;
let brush, symmetryBrush;
let brushActive = false;
let mouse = new THREE.Vector2(), lastMouse = new THREE.Vector2();
let mouseState = false, lastMouseState = false;
let lastCastPose = new THREE.Vector3();
let material, rightClick = false;

// ★ 처음 업로드된 모델을 기억하기 위한 변수
let initialGeometry = null;

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

// -------------------------------------
// STL 지오메트리 세팅
// -------------------------------------
function setTargetMeshGeometry( geometry ) {

  // 기존 mesh 제거
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

  // ----- "처음 업로드된" 모델을 저장 (이미 있으면 덮어쓰기 안 함)
  if ( !initialGeometry ) {
    // clone()으로 복제해두면, 나중에 스컬팅 등으로 geometry가 변형되어도
    // 최초 상태를 보존할 수 있습니다.
    initialGeometry = geometry.clone();
  }

  // 원하는 형태로 전처리
  centerAndScaleGeometry( geometry );
  geometry = BufferGeometryUtils.mergeVertices( geometry );
  geometry.computeVertexNormals();
  geometry.attributes.position.setUsage( THREE.DynamicDrawUsage );
  geometry.attributes.normal.setUsage( THREE.DynamicDrawUsage );
  geometry.computeBoundsTree( { setBoundingBox: false } );

  // 새 mesh
  targetMesh = new THREE.Mesh( geometry, material );
  targetMesh.frustumCulled = false;
  scene.add( targetMesh );

  // BVH Helper
  bvhHelper = new MeshBVHHelper( targetMesh, params.depth );
  if ( params.displayHelper ) {
    scene.add( bvhHelper );
  }
  bvhHelper.update();

  // 모델 맞춰서 카메라 조정
  fitCameraToObject( camera, targetMesh, controls );
}

// -------------------------------------
// reset : "처음 업로드한 모델"로 되돌리기
// -------------------------------------
function reset() {
  // 아직 아무 모델도 업로드 안 했다면
  if ( !initialGeometry ) {
    console.log('아직 업로드된 모델이 없습니다.');
    return;
  }

  // 씬에 있는 mesh 제거
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

  // initialGeometry를 clone() 해서 다시 씬에 적용
  const cloned = initialGeometry.clone();
  setTargetMeshGeometry( cloned );
}

// -------------------------------------
//  clear : 씬을 완전히 빈 상태로 만들고,
//          '처음 업로드된 모델' 기록(initialGeometry)도 지움
// -------------------------------------
function clearScene() {
  // 현재 mesh 제거
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

  // "처음 업로드된 모델" 기록도 null 로
  initialGeometry = null;

  console.log('씬이 완전히 비워졌습니다. 이제 새 모델을 업로드할 수 있습니다.');
}

// -------------------------------------
// 드래그 앤 드롭으로 STL 불러오기
// -------------------------------------
function onDropSTL( e ) {
  e.preventDefault();
  if ( e.dataTransfer.files && e.dataTransfer.files.length > 0 ) {
    const file = e.dataTransfer.files[0];
    loadStlFileAsGeometry( file )
      .then( geometry => {
        setTargetMeshGeometry( geometry );
      })
      .catch( err => {
        console.error( 'STL 로딩 실패:', err );
      });
  }
}
function onDragOver( e ) {
  e.preventDefault();
}

// -------------------------------------
// 초기화
// -------------------------------------
function init() {

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.setClearColor( 0x060609, 1 );
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild( renderer.domElement );
  renderer.domElement.style.touchAction = 'none';

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog( 0x263238 / 2, 20, 60 );

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

  // Material
  matcaps[ 'Clay' ] = new THREE.TextureLoader().load( 'textures/B67F6B_4B2E2A_6C3A34_F3DBC6-256px.png' );
  matcaps[ 'Red Wax' ] = new THREE.TextureLoader().load( 'textures/763C39_431510_210504_55241C-256px.png' );
  matcaps[ 'Shiny Green' ] = new THREE.TextureLoader().load( 'textures/3B6E10_E3F2C3_88AC2E_99CE51-256px.png' );
  matcaps[ 'Normal' ] = new THREE.TextureLoader().load( 'textures/7877EE_D87FC5_75D9C7_1C78C0-256px.png' );

  material = new THREE.MeshMatcapMaterial({
    flatShading: params.flatShading,
  });
  for ( const key in matcaps ) {
    matcaps[ key ].encoding = THREE.sRGBEncoding;
  }

  // 브러시
  const brushSegments = [ new THREE.Vector3(), new THREE.Vector3( 0, 0, 1 ) ];
  for ( let i = 0; i < 50; i ++ ) {
    const nexti = i + 1;
    const x1 = Math.sin( 2 * Math.PI * i / 50 );
    const y1 = Math.cos( 2 * Math.PI * i / 50 );
    const x2 = Math.sin( 2 * Math.PI * nexti / 50 );
    const y2 = Math.cos( 2 * Math.PI * nexti / 50 );
    brushSegments.push( new THREE.Vector3( x1, y1, 0 ), new THREE.Vector3( x2, y2, 0 ) );
  }
  brush = new THREE.LineSegments();
  brush.geometry.setFromPoints( brushSegments );
  brush.material.color.set( 0xfb8c00 );
  scene.add( brush );

  symmetryBrush = brush.clone();
  scene.add( symmetryBrush );

  // OrbitControls
  controls = new OrbitControls( camera, renderer.domElement );
  controls.minDistance = 1.5;
  controls.addEventListener( 'start', () => { controls.active = true; } );
  controls.addEventListener( 'end', () => { controls.active = false; } );

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
  } );
  sculptFolder.open();

  const helperFolder = gui.addFolder( 'BVH Helper' );
  helperFolder.add( params, 'depth', 1, 20, 1 ).onChange( val => {
    if ( bvhHelper ) {
      bvhHelper.depth = parseFloat( val );
      bvhHelper.update();
    }
  } );
  helperFolder.add( params, 'displayHelper' ).onChange( display => {
    if ( ! bvhHelper ) return;
    if ( display ) {
      scene.add( bvhHelper );
      bvhHelper.update();
    } else {
      scene.remove( bvhHelper );
    }
  } );
  helperFolder.open();

  // reset, rebuildBVH
  gui.add( { reset }, 'reset' );

  // ★ clear 버튼 추가
  //    -> 누르면 씬을 완전히 비우고, initialGeometry 도 null 처리
  gui.add( { clear: clearScene }, 'clear' );

  gui.add( {
    rebuildBVH: () => {
      if ( targetMesh ) {
        targetMesh.geometry.computeBoundsTree({ setBoundingBox: false });
        if ( bvhHelper ) bvhHelper.update();
      }
    }
  }, 'rebuildBVH' );
  gui.open();

  // Window 이벤트
  window.addEventListener( 'resize', onWindowResize );
  window.addEventListener( 'pointermove', onPointerMove );
  window.addEventListener( 'pointerdown', onPointerDown, true );
  window.addEventListener( 'pointerup', onPointerUp );
  window.addEventListener( 'contextmenu', e => e.preventDefault() );
  window.addEventListener( 'wheel', onWheel );
  window.addEventListener( 'dragover', onDragOver, false );
  window.addEventListener( 'drop', onDropSTL, false );

}

// -------------------------------------
// 이벤트 핸들러
// -------------------------------------
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
    controls.enabled = res.length === 0;
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

// -------------------------------------
// 애니메이션/렌더 루프
// -------------------------------------
function renderLoop() {
  requestAnimationFrame( renderLoop );
  stats.begin();

  // MATCAP
  material.matcap = matcaps[ params.matcap ];

  if ( controls.active || ! brushActive || ! targetMesh ) {
    // 스컬팅 비활성
    brush.visible = false;
    symmetryBrush.visible = false;
    lastCastPose.setScalar( Infinity );
  } else {
    // 스컬팅 로직
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera( mouse, camera );
    raycaster.firstHitOnly = true;

    const hit = raycaster.intersectObject( targetMesh, true )[ 0 ];
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

      if ( ! ( mouseState || lastMouseState ) ) {
        // 마우스 클릭 안 된 상태 -> 브러시 위치만 갱신
        performStroke( hit.point, brush, true, {}, targetMesh, params, rightClick );
        if ( params.symmetrical ) {
          hit.point.x *= -1;
          performStroke( hit.point, symmetryBrush, true, {}, targetMesh, params, rightClick );
          hit.point.x *= -1;
        }
        lastMouse.copy( mouse );
        lastCastPose.copy( hit.point );

      } else {
        // 마우스 이동/클릭 상태에서 스컬팅
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

          performStroke( lastCastPose, brush, false, sets, targetMesh, params, rightClick );
          if ( params.symmetrical ) {
            lastCastPose.x *= -1;
            performStroke( lastCastPose, symmetryBrush, false, sets, targetMesh, params, rightClick );
            lastCastPose.x *= -1;
          }

          stepCount ++;
          if ( stepCount > params.maxSteps ) {
            break;
          }
        }

        if ( stepCount > 0 ) {
          // 노멀 업데이트
          updateNormals( changedTriangles, changedIndices, targetMesh );
          targetMesh.geometry.boundsTree?.refit( traversedNodeIndices );
          if ( bvhHelper && bvhHelper.parent ) {
            bvhHelper.update();
          }
        } else {
          // 이동량이 너무 작으면 위치만 갱신
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
