import Stats from 'three/examples/jsm/libs/stats.module.js';
import * as dat from 'three/examples/jsm/libs/lil-gui.module.min.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// STLLoader 임포트
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

// three-mesh-bvh
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
  CONTAINED,
  INTERSECTED,
  NOT_INTERSECTED,
  MeshBVHHelper,
} from 'three-mesh-bvh';

// Raycast / BufferGeometry 프로토타입 확장
THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

// 전역 변수들
let stats;
let scene, camera, renderer, controls;
let targetMesh = null;
let brush, symmetryBrush, bvhHelper;
let normalZ = new THREE.Vector3( 0, 0, 1 );
let brushActive = false;
let mouse = new THREE.Vector2(), lastMouse = new THREE.Vector2();
let mouseState = false, lastMouseState = false;
let lastCastPose = new THREE.Vector3();
let material, rightClick = false;

// Sculpt 파라미터
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

// ----------------------------------------------------------------
//    1) 지오메트리 중심 정렬 + 스케일 정규화 (바운딩 스피어 기반)
// ----------------------------------------------------------------
function centerAndScaleGeometry( geometry ) {

  // 1) center() : 모델의 중심을 (0,0,0) 근처로 이동
  geometry.center();

  // 2) 바운딩 스피어 계산 -> 반지름(radius)을 1로 맞춤
  geometry.computeBoundingSphere();
  if ( geometry.boundingSphere ) {
    const radius = geometry.boundingSphere.radius;
    const scaleFactor = 1 / radius; // 반지름이 1이 되도록 스케일
    geometry.scale( scaleFactor, scaleFactor, scaleFactor );
  }

}

// ----------------------------------------------------------------
//    2) 모델 전체가 화면에 들어오도록 카메라와 컨트롤을 조정
//       (일종의 Bounds 기능)
// ----------------------------------------------------------------
function fitCameraToObject( camera, object, offset = 1.25 ) {

  // object의 World Matrix가 최신 상태임을 보장
  object.updateWorldMatrix( true, false );

  // 바운딩 박스를 구함
  const box = new THREE.Box3().setFromObject( object );
  const center = box.getCenter( new THREE.Vector3() );
  const size = box.getSize( new THREE.Vector3() );

  // 최대 치수를 구함
  const maxDim = Math.max( size.x, size.y, size.z );

  // 카메라 fov는 degree(각도)이므로 라디안으로 변환
  const fov = camera.fov * ( Math.PI / 180 );
  // 모델을 모두 담기 위한 Z 거리 (단순 근사)
  let cameraZ = maxDim / 2 / Math.tan( fov / 2 );
  cameraZ *= offset; // 살짝 여유 공간을 주기 위해 offset 곱

  // 모델 중심 좌표와 거리 cameraZ를 이용해 카메라 위치 지정
  camera.position.set( center.x, center.y, center.z + cameraZ );
  camera.lookAt( center );

  // OrbitControls가 있다면, target도 모델 중심에 맞춤
  if ( controls ) {
    controls.target.copy( center );
    controls.update();
  }

}

// ----------------------------------------------------------------
//    STL 지오메트리 세팅 함수 (STL 업로드 시 호출)
// ----------------------------------------------------------------
function setTargetMeshGeometry( geometry ) {

  // 기존 targetMesh 제거
  if ( targetMesh ) {
    targetMesh.geometry.dispose();
    targetMesh.material.dispose();
    scene.remove( targetMesh );
    targetMesh = null;
  }

  // BVHHelper 제거
  if ( bvhHelper ) {
    scene.remove( bvhHelper );
    bvhHelper = null;
  }

  // (1) STL 지오메트리를 중심 정렬 및 스케일 정규화
  centerAndScaleGeometry( geometry );

  // (2) 남은 작업들
  geometry.deleteAttribute( 'uv' );
  geometry = BufferGeometryUtils.mergeVertices( geometry );
  geometry.computeVertexNormals();
  geometry.attributes.position.setUsage( THREE.DynamicDrawUsage );
  geometry.attributes.normal.setUsage( THREE.DynamicDrawUsage );
  geometry.computeBoundsTree( { setBoundingBox: false } );

  // (3) 새 mesh 생성
  targetMesh = new THREE.Mesh( geometry, material );
  targetMesh.frustumCulled = false;
  scene.add( targetMesh );

  // (4) BVH Helper (필요하면 다시 생성)
  bvhHelper = new MeshBVHHelper( targetMesh, params.depth );
  if ( params.displayHelper ) {
    scene.add( bvhHelper );
  }
  bvhHelper.update();

  // (5) 모델이 씬에 배치된 뒤 카메라와 컨트롤을 자동 조정
  fitCameraToObject( camera, targetMesh );

}

// ----------------------------------------------------------------
//                     STL 로더 & 드래그 앤 드롭
// ----------------------------------------------------------------
const stlLoader = new STLLoader();

// 드래그 영역에 파일이 들어오면 기본 이벤트 취소
window.addEventListener( 'dragover', e => {
  e.preventDefault();
}, false );

// 드롭이 발생하면 STL 파일 로드
window.addEventListener( 'drop', e => {

  e.preventDefault();

  if ( e.dataTransfer.files && e.dataTransfer.files.length > 0 ) {

    const file = e.dataTransfer.files[ 0 ];
    const reader = new FileReader();

    reader.addEventListener( 'load', event => {

      // arrayBuffer 받아 STL 파싱
      const arrayBuffer = event.target.result;
      const geometry = stlLoader.parse( arrayBuffer );

      // STL 지오메트리 세팅 (정규화 + scene에 추가 + 카메라조정)
      setTargetMeshGeometry( geometry );

    }, false );

    // 바이너리 STL 읽기
    reader.readAsArrayBuffer( file );

  }

}, false );

// ----------------------------------------------------------------
//        reset() : 현재 메쉬와 BVHHelper를 제거해 빈 상태로
// ----------------------------------------------------------------
function reset() {

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

}

// ----------------------------------------------------------------
//                       초기화 함수
// ----------------------------------------------------------------
function init() {

  const bgColor = 0x060609;

  // renderer
  renderer = new THREE.WebGLRenderer( { antialias: true } );
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.setClearColor( bgColor, 1 );
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild( renderer.domElement );
  renderer.domElement.style.touchAction = 'none';

  // scene
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog( 0x263238 / 2, 20, 60 );

  // light
  const light = new THREE.DirectionalLight( 0xffffff, 0.5 );
  light.position.set( 1, 1, 1 );
  scene.add( light );
  scene.add( new THREE.AmbientLight( 0xffffff, 0.4 ) );

  // brush line geometry
  const brushSegments = [ new THREE.Vector3(), new THREE.Vector3( 0, 0, 1 ) ];
  for ( let i = 0; i < 50; i ++ ) {
    const nexti = i + 1;
    const x1 = Math.sin( 2 * Math.PI * i / 50 );
    const y1 = Math.cos( 2 * Math.PI * i / 50 );
    const x2 = Math.sin( 2 * Math.PI * nexti / 50 );
    const y2 = Math.cos( 2 * Math.PI * nexti / 50 );

    brushSegments.push(
      new THREE.Vector3( x1, y1, 0 ),
      new THREE.Vector3( x2, y2, 0 )
    );
  }

  brush = new THREE.LineSegments();
  brush.geometry.setFromPoints( brushSegments );
  brush.material.color.set( 0xfb8c00 );
  scene.add( brush );

  symmetryBrush = brush.clone();
  scene.add( symmetryBrush );

  // camera
  camera = new THREE.PerspectiveCamera(
    75, window.innerWidth / window.innerHeight, 0.1, 50
  );
  camera.position.set( 0, 0, 3 );
  camera.far = 100;
  camera.updateProjectionMatrix();

  // stats
  stats = new Stats();
  document.body.appendChild( stats.dom );

  // matcaps
  matcaps[ 'Clay' ] = new THREE.TextureLoader().load( 'textures/B67F6B_4B2E2A_6C3A34_F3DBC6-256px.png' );
  matcaps[ 'Red Wax' ] = new THREE.TextureLoader().load( 'textures/763C39_431510_210504_55241C-256px.png' );
  matcaps[ 'Shiny Green' ] = new THREE.TextureLoader().load( 'textures/3B6E10_E3F2C3_88AC2E_99CE51-256px.png' );
  matcaps[ 'Normal' ] = new THREE.TextureLoader().load( 'textures/7877EE_D87FC5_75D9C7_1C78C0-256px.png' );

  material = new THREE.MeshMatcapMaterial( {
    flatShading: params.flatShading,
  } );

  for ( const key in matcaps ) {
    matcaps[ key ].encoding = THREE.sRGBEncoding;
  }

  // 초기에는 빈 상태 (reset() 호출 X)

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
  sculptFolder.add( params, 'flatShading' ).onChange( value => {
    if ( targetMesh ) {
      targetMesh.material.flatShading = value;
      targetMesh.material.needsUpdate = true;
    }
  } );
  sculptFolder.open();

  const helperFolder = gui.addFolder( 'BVH Helper' );
  helperFolder.add( params, 'depth', 1, 20, 1 ).onChange( d => {
    if ( bvhHelper ) {
      bvhHelper.depth = parseFloat( d );
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

  gui.add( { reset }, 'reset' );
  gui.add( { rebuildBVH: () => {
    if ( targetMesh ) {
      targetMesh.geometry.computeBoundsTree( { setBoundingBox: false } );
      if ( bvhHelper ) bvhHelper.update();
    }
  } }, 'rebuildBVH' );
  gui.open();

  // 이벤트 리스너
  window.addEventListener( 'resize', onWindowResize, false );
  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
  }

  window.addEventListener( 'pointermove', e => {
    mouse.x = ( e.clientX / window.innerWidth ) * 2 - 1;
    mouse.y = - ( e.clientY / window.innerHeight ) * 2 + 1;
    brushActive = true;
  } );

  window.addEventListener( 'pointerdown', e => {
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

  }, true );

  window.addEventListener( 'pointerup', e => {
    mouseState = Boolean( e.buttons & 3 );
    if ( e.pointerType === 'touch' ) {
      brushActive = false;
    }
  } );

  window.addEventListener( 'contextmenu', e => e.preventDefault() );

  // 휠 스크롤로 브러시 사이즈 조절
  window.addEventListener( 'wheel', e => {
    let delta = e.deltaY;
    if ( e.deltaMode === 1 ) {
      delta *= 40;
    }
    if ( e.deltaMode === 2 ) {
      delta *= 40;
    }
    params.size += delta * 0.0001;
    params.size = Math.max( Math.min( params.size, 0.25 ), 0.025 );
    gui.controllersRecursive().forEach( c => c.updateDisplay() );
  } );

  controls = new OrbitControls( camera, renderer.domElement );
  controls.minDistance = 1.5;

  controls.addEventListener( 'start', function () {
    this.active = true;
  } );

  controls.addEventListener( 'end', function () {
    this.active = false;
  } );

}

// ----------------------------------------------------------------
//                     브러시 수행 함수
// ----------------------------------------------------------------
function performStroke( point, brushObject, brushOnly = false, accumulatedFields = {} ) {

  if ( !targetMesh ) return; // 메쉬가 없으면 스컬팅 불가

  const {
    accumulatedTriangles = new Set(),
    accumulatedIndices = new Set(),
    accumulatedTraversedNodeIndices = new Set(),
  } = accumulatedFields;

  const inverseMatrix = new THREE.Matrix4();
  inverseMatrix.copy( targetMesh.matrixWorld ).invert();

  const sphere = new THREE.Sphere();
  sphere.center.copy( point ).applyMatrix4( inverseMatrix );
  sphere.radius = params.size;

  const indices = new Set();
  const tempVec = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const indexAttr = targetMesh.geometry.index;
  const posAttr = targetMesh.geometry.attributes.position;
  const normalAttr = targetMesh.geometry.attributes.normal;
  const triangles = new Set();
  const bvh = targetMesh.geometry.boundsTree;

  bvh?.shapecast( {

    intersectsBounds: ( box, isLeaf, score, depth, nodeIndex ) => {

      accumulatedTraversedNodeIndices.add( nodeIndex );

      const intersects = sphere.intersectsBox( box );
      const { min, max } = box;
      if ( intersects ) {
        for ( let x = 0; x <= 1; x ++ ) {
          for ( let y = 0; y <= 1; y ++ ) {
            for ( let z = 0; z <= 1; z ++ ) {
              tempVec.set(
                x === 0 ? min.x : max.x,
                y === 0 ? min.y : max.y,
                z === 0 ? min.z : max.z
              );
              if ( ! sphere.containsPoint( tempVec ) ) {
                return INTERSECTED;
              }
            }
          }
        }
        return CONTAINED;
      }
      return intersects ? INTERSECTED : NOT_INTERSECTED;

    },

    intersectsTriangle: ( tri, index, contained ) => {

      const triIndex = index;
      triangles.add( triIndex );
      accumulatedTriangles.add( triIndex );

      const i3 = 3 * index;
      const a = i3 + 0;
      const b = i3 + 1;
      const c = i3 + 2;
      const va = indexAttr.getX( a );
      const vb = indexAttr.getX( b );
      const vc = indexAttr.getX( c );
      if ( contained ) {
        indices.add( va );
        indices.add( vb );
        indices.add( vc );

        accumulatedIndices.add( va );
        accumulatedIndices.add( vb );
        accumulatedIndices.add( vc );
      } else {
        if ( sphere.containsPoint( tri.a ) ) {
          indices.add( va );
          accumulatedIndices.add( va );
        }
        if ( sphere.containsPoint( tri.b ) ) {
          indices.add( vb );
          accumulatedIndices.add( vb );
        }
        if ( sphere.containsPoint( tri.c ) ) {
          indices.add( vc );
          accumulatedIndices.add( vc );
        }
      }

      return false;

    }

  } );

  // 평균 노멀
  const localPoint = new THREE.Vector3();
  localPoint.copy( point ).applyMatrix4( inverseMatrix );

  const planePoint = new THREE.Vector3();
  let totalPoints = 0;
  indices.forEach( index => {
    tempVec.fromBufferAttribute( normalAttr, index );
    normal.add( tempVec );

    if ( ! brushOnly ) {
      totalPoints ++;
      tempVec.fromBufferAttribute( posAttr, index );
      planePoint.add( tempVec );
    }
  } );
  normal.normalize();
  brushObject.quaternion.setFromUnitVectors( normalZ, normal );

  if ( totalPoints ) {
    planePoint.multiplyScalar( 1 / totalPoints );
  }

  // 브러시 위치만 갱신할 경우
  if ( brushOnly ) {
    return;
  }

  const targetHeight = params.intensity * 0.0001;
  const plane = new THREE.Plane();
  plane.setFromNormalAndCoplanarPoint( normal, planePoint );

  indices.forEach( index => {
    tempVec.fromBufferAttribute( posAttr, index );

    const dist = tempVec.distanceTo( localPoint );
    const negated = params.invert !== rightClick ? -1 : 1;
    let intensity = 1.0 - ( dist / params.size );

    if ( params.brush === 'clay' ) {
      intensity = Math.pow( intensity, 3 );
      const planeDist = plane.distanceToPoint( tempVec );
      const clampedIntensity = negated * Math.min( intensity * 4, 1.0 );
      tempVec.addScaledVector(
        normal,
        clampedIntensity * targetHeight - negated * planeDist * clampedIntensity * 0.3
      );
    } else if ( params.brush === 'normal' ) {
      intensity = Math.pow( intensity, 2 );
      tempVec.addScaledVector( normal, negated * intensity * targetHeight );
    } else if ( params.brush === 'flatten' ) {
      intensity = Math.pow( intensity, 2 );
      const planeDist = plane.distanceToPoint( tempVec );
      tempVec.addScaledVector(
        normal,
        - planeDist * intensity * params.intensity * 0.01 * 0.5
      );
    }

    posAttr.setXYZ( index, tempVec.x, tempVec.y, tempVec.z );
    normalAttr.setXYZ( index, 0, 0, 0 );

  } );

  if ( indices.size ) {
    posAttr.needsUpdate = true;
  }

}

// ----------------------------------------------------------------
//                     노멀 업데이트 함수
// ----------------------------------------------------------------
function updateNormals( triangles, indices ) {

  if ( !targetMesh ) return;

  const tempVec = new THREE.Vector3();
  const tempVec2 = new THREE.Vector3();
  const indexAttr = targetMesh.geometry.index;
  const posAttr = targetMesh.geometry.attributes.position;
  const normalAttr = targetMesh.geometry.attributes.normal;

  const triangle = new THREE.Triangle();
  triangles.forEach( tri => {
    const tri3 = tri * 3;
    const i0 = tri3 + 0;
    const i1 = tri3 + 1;
    const i2 = tri3 + 2;

    const v0 = indexAttr.getX( i0 );
    const v1 = indexAttr.getX( i1 );
    const v2 = indexAttr.getX( i2 );

    triangle.a.fromBufferAttribute( posAttr, v0 );
    triangle.b.fromBufferAttribute( posAttr, v1 );
    triangle.c.fromBufferAttribute( posAttr, v2 );
    triangle.getNormal( tempVec2 );

    if ( indices.has( v0 ) ) {
      tempVec.fromBufferAttribute( normalAttr, v0 );
      tempVec.add( tempVec2 );
      normalAttr.setXYZ( v0, tempVec.x, tempVec.y, tempVec.z );
    }
    if ( indices.has( v1 ) ) {
      tempVec.fromBufferAttribute( normalAttr, v1 );
      tempVec.add( tempVec2 );
      normalAttr.setXYZ( v1, tempVec.x, tempVec.y, tempVec.z );
    }
    if ( indices.has( v2 ) ) {
      tempVec.fromBufferAttribute( normalAttr, v2 );
      tempVec.add( tempVec2 );
      normalAttr.setXYZ( v2, tempVec.x, tempVec.y, tempVec.z );
    }

  } );

  // 노멀 정규화
  indices.forEach( index => {
    tempVec.fromBufferAttribute( normalAttr, index );
    tempVec.normalize();
    normalAttr.setXYZ( index, tempVec.x, tempVec.y, tempVec.z );
  } );

  normalAttr.needsUpdate = true;

}

// ----------------------------------------------------------------
//                       렌더 루프
// ----------------------------------------------------------------
function render() {

  requestAnimationFrame( render );
  stats.begin();

  material.matcap = matcaps[ params.matcap ];

  // 스컬팅 로직
  if ( controls.active || ! brushActive || ! targetMesh ) {

    brush.visible = false;
    symmetryBrush.visible = false;
    lastCastPose.setScalar( Infinity );

  } else {

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
        // 클릭 안 했으면 -> 브러시 위치만 갱신
        performStroke( hit.point, brush, true );
        if ( params.symmetrical ) {
          hit.point.x *= -1;
          performStroke( hit.point, symmetryBrush, true );
          hit.point.x *= -1;
        }
        lastMouse.copy( mouse );
        lastCastPose.copy( hit.point );

      } else {
        // 마우스 이동 거리 / raycast 위치 차이
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

          performStroke( lastCastPose, brush, false, sets );
          if ( params.symmetrical ) {
            lastCastPose.x *= -1;
            performStroke( lastCastPose, symmetryBrush, false, sets );
            lastCastPose.x *= -1;
          }

          stepCount ++;
          if ( stepCount > params.maxSteps ) {
            break;
          }
        }

        if ( stepCount > 0 ) {
          updateNormals( changedTriangles, changedIndices );
          targetMesh.geometry.boundsTree?.refit( traversedNodeIndices );

          if ( bvhHelper && bvhHelper.parent !== null ) {
            bvhHelper.update();
          }

        } else {
          // 움직임이 너무 작다면 브러시 위치만 갱신
          performStroke( hit.point, brush, true );
          if ( params.symmetrical ) {
            hit.point.x *= -1;
            performStroke( hit.point, symmetryBrush, true );
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

// ----------------------------------------------------------------
//                      실행(초기화 + 루프)
// ----------------------------------------------------------------
init();
render();

