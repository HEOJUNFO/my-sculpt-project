// src/renderLoop.js

import * as THREE from 'three';
import { refs } from './modelManager.js';
import { performStroke, updateNormals } from './sculpt.js';
import {
  mouse,
  lastMouse,
  mouseState,
  lastMouseState,
  lastCastPose,
  brushActive,
  rightClick,
  someUpdateFunc,
} from './eventHandlers.js';

let animationId = null; // 현재 렌더 루프의 requestAnimationFrame ID를 저장할 변수

/**
 * 렌더 루프를 중단하는 함수
 */
export function stopRenderLoop() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

/**
 * 렌더링 루프를 시작하는 함수
 */
export function startRenderLoop(renderer, scene, camera, stats) {

  // 혹시 이전에 실행중인 루프가 있다면 중지
  stopRenderLoop();

  // WebGPU인지 판별
  const useRenderAsync = (typeof renderer.renderAsync === 'function');

  function animate() {
    animationId = requestAnimationFrame(animate); // 다음 프레임 예약

    if (stats) stats.begin();

    refs.controls.update();

    // matcap 설정
    if ( refs.targetMesh ) {
      refs.targetMesh.material.matcap = refs.matcaps[ refs.params.matcap ];
    }

    // 브러시 표시 여부
    if (
      refs.params.memoMode ||
      refs.controls.active ||
      !brushActive ||
      !refs.targetMesh ||
      refs.params.transformMode
    ) {
      // 메모 모드이거나, 카메라 컨트롤 중이거나, 브러시 비활성시
      if ( refs.brush ) {
        refs.brush.visible = false;
      }
      lastCastPose.setScalar(Infinity);

    } else {
      // 브러시 표시 + 충돌 검사
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      raycaster.firstHitOnly = true;

      const hit = raycaster.intersectObject(refs.targetMesh, true)[0];
      if ( hit ) {
        if ( refs.brush ) {
          refs.brush.visible = true;
          refs.brush.scale.set( refs.params.size, refs.params.size, 0.1 );
          refs.brush.position.copy( hit.point );

          const zFactor = 0.01 + (refs.params.intensity * 0.01);
          refs.brush.scale.z = zFactor;
        }

        refs.controls.enabled = false;

        if ( lastCastPose.x === Infinity ) {
          lastCastPose.copy(hit.point);
        }

        if ( !(mouseState || lastMouseState) ) {
          // 브러시 첫 클릭
          performStroke(hit.point, refs.brush, true, {}, refs.targetMesh, refs.params, rightClick);

          lastMouse.copy(mouse);
          lastCastPose.copy(hit.point);

        } else {
          // 드래그 중
          const mdx = (mouse.x - lastMouse.x) * window.innerWidth * window.devicePixelRatio;
          const mdy = (mouse.y - lastMouse.y) * window.innerHeight * window.devicePixelRatio;
          let mdist = Math.sqrt(mdx*mdx + mdy*mdy);
          let castDist = hit.point.distanceTo(lastCastPose);

          const step = refs.params.size * 0.15;
          const percent = Math.max(step / castDist, 1 / refs.params.maxSteps);
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

          while ( castDist > step && mdist > refs.params.size * 200 / hit.distance ) {
            lastMouse.lerp(mouse, percent);
            lastCastPose.lerp(hit.point, percent);
            castDist -= step;
            mdist -= mstep;

            performStroke(lastCastPose, refs.brush, false, sets, refs.targetMesh, refs.params, rightClick);
            stepCount++;
            if ( stepCount > refs.params.maxSteps ) {
              break;
            }
          }

          if ( stepCount > 0 ) {
            updateNormals(changedTriangles, changedIndices, refs.targetMesh);
            refs.targetMesh.geometry.boundsTree?.refit(traversedNodeIndices);
            if ( refs.bvhHelper && refs.bvhHelper.parent ) {
              refs.bvhHelper.update();
            }
          } else {
            // 움직임 작으면 단일 stroke만
            performStroke(hit.point, refs.brush, true, {}, refs.targetMesh, refs.params, rightClick);
          }
        }

      } else {
        // 대상 mesh hit 없음
        if ( refs.brush ) {
          refs.brush.visible = false;
        }
        refs.controls.enabled = true;
        lastMouse.copy(mouse);
        lastCastPose.setScalar(Infinity);
      }
    }

    someUpdateFunc();

 
      // const triCount = countTrianglesInScene(scene);
      // console.log('Triangle Count:', triCount);
    

    // WebGPU -> renderAsync, WebGL -> render
    if (useRenderAsync) {
      renderer.renderAsync(scene, camera).then(() => {
        if (stats) stats.end();
      });
    } else {
      renderer.render(scene, camera);
      if (stats) stats.end();
    }
  }

  // 루프 시작
  animate();
}
