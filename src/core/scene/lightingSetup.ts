import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export interface LightingRig {
  keyLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;
  ambientLight: THREE.AmbientLight;
  lights: THREE.DirectionalLight[];
}

export function setupLighting(scene: THREE.Scene): LightingRig {
  // Key light — 따뜻한 메인 조명, 섀도우 캐스팅
  const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
  keyLight.position.set(2, 3, 2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far = 20;
  keyLight.shadow.camera.left = -3;
  keyLight.shadow.camera.right = 3;
  keyLight.shadow.camera.top = 3;
  keyLight.shadow.camera.bottom = -3;
  scene.add(keyLight);

  // Fill light — 차가운 보조 조명
  const fillLight = new THREE.DirectionalLight(0xe6f0ff, 0.4);
  fillLight.position.set(-2, -1, 1);
  scene.add(fillLight);

  // Rim light — 뒤쪽 윤곽 조명
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
  rimLight.position.set(0, 1, -3);
  scene.add(rimLight);

  // Ambient — IBL이 보충하므로 낮은 강도
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);

  return {
    keyLight,
    fillLight,
    rimLight,
    ambientLight,
    lights: [keyLight, fillLight, rimLight],
  };
}

export async function loadEnvironmentMap(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  hdrPath: string,
): Promise<THREE.Texture | null> {
  try {
    const loader = new RGBELoader();
    const hdrTexture = await loader.loadAsync(hdrPath);
    hdrTexture.mapping = THREE.EquirectangularReflectionMapping;

    // PMREM 처리 (내장 머티리얼용)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;
    scene.environment = envMap;

    // 커스텀 셰이더용: 원본 equirectangular 텍스처에 mipmap 생성
    hdrTexture.generateMipmaps = true;
    hdrTexture.minFilter = THREE.LinearMipmapLinearFilter;
    hdrTexture.magFilter = THREE.LinearFilter;
    hdrTexture.needsUpdate = true;

    pmremGenerator.dispose();

    return hdrTexture;
  } catch (err) {
    console.warn('HDR environment map failed to load, IBL disabled:', err);
    return null;
  }
}
