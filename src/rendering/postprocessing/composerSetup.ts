import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface ComposerParams {
  enableSSAO: boolean;
  enableOutline: boolean;
  enableBloom: boolean;
  enableFXAA: boolean;
}

export function createComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  params: ComposerParams,
): EffectComposer {
  const pixelRatio = renderer.getPixelRatio();
  const width = window.innerWidth;
  const height = window.innerHeight;

  const composer = new EffectComposer(renderer);

  // 1. 기본 렌더 패스
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 2. SSAO — 캐비티/홈 깊이 강조
  const ssaoPass = new SSAOPass(scene, camera, width, height);
  ssaoPass.kernelRadius = 8;
  ssaoPass.minDistance = 0.005;
  ssaoPass.maxDistance = 0.1;
  ssaoPass.enabled = params.enableSSAO;
  // @ts-ignore: isSSAOPass 태그 (렌더 루프에서 동적 비활성화용)
  ssaoPass.isSSAOPass = true;
  composer.addPass(ssaoPass);

  // 3. 외곽선 — 활성 모델 하이라이트
  const outlinePass = new OutlinePass(
    new THREE.Vector2(width, height),
    scene,
    camera,
  );
  outlinePass.edgeStrength = 3.0;
  outlinePass.edgeGlow = 0.5;
  outlinePass.edgeThickness = 1.0;
  outlinePass.visibleEdgeColor.set('#ffffff');
  outlinePass.hiddenEdgeColor.set('#190a05');
  outlinePass.enabled = params.enableOutline;
  composer.addPass(outlinePass);

  // 4. 블룸 — 하이라이트 글로우
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.3, // strength
    0.4, // radius
    0.85, // threshold
  );
  bloomPass.enabled = params.enableBloom;
  // @ts-ignore: isUnrealBloomPass 태그
  bloomPass.isUnrealBloomPass = true;
  composer.addPass(bloomPass);

  // 5. FXAA — 안티앨리어싱
  const fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.uniforms['resolution'].value.set(
    1 / (width * pixelRatio),
    1 / (height * pixelRatio),
  );
  fxaaPass.enabled = params.enableFXAA;
  composer.addPass(fxaaPass);

  // 6. 출력 패스 — 감마/톤매핑
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  return composer;
}

/**
 * Composer 리사이즈 핸들러
 */
export function resizeComposer(composer: EffectComposer | null, renderer: THREE.WebGLRenderer): void {
  if (!composer) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = renderer.getPixelRatio();

  composer.setSize(width, height);

  // FXAA resolution uniform 업데이트
  for (const pass of composer.passes) {
    if (pass instanceof ShaderPass && pass.uniforms?.['resolution']) {
      pass.uniforms['resolution'].value.set(
        1 / (width * pixelRatio),
        1 / (height * pixelRatio),
      );
    }
  }
}

/**
 * OutlinePass에 선택된 객체 설정
 */
export function setOutlineTarget(composer: EffectComposer | null, mesh: THREE.Mesh | null): void {
  if (!composer || !mesh) return;

  for (const pass of composer.passes) {
    if (pass instanceof OutlinePass) {
      pass.selectedObjects = [mesh];
      break;
    }
  }
}
