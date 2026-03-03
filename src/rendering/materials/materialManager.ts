import * as THREE from 'three';
import { createDentalPBRMaterial, DENTAL_PRESETS } from './dentalPBRMaterial.ts';

export type MaterialMode = 'matcap' | 'pbr';

/**
 * 활성 모델용 머티리얼 생성
 */
export function createActiveMaterial(
  mode: MaterialMode,
  matcaps: Record<string, THREE.Texture>,
  params: any,
  wireframeMode: boolean,
): THREE.Material {
  if (wireframeMode) {
    return new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true,
      transparent: true,
      opacity: params.modelOpacity,
      side: THREE.DoubleSide,
    });
  }

  if (mode === 'pbr') {
    return createDentalPBRMaterial({
      ...DENTAL_PRESETS.tooth,
      opacity: params.modelOpacity,
      flatShading: params.flatShading,
    });
  }

  return new THREE.MeshMatcapMaterial({
    matcap: matcaps[params.matcap],
    transparent: true,
    opacity: params.modelOpacity,
    side: THREE.DoubleSide,
    flatShading: params.flatShading,
  });
}

/**
 * 비활성 모델용 머티리얼 생성
 */
export function createInactiveMaterial(
  matcaps: Record<string, THREE.Texture>,
  params: any,
  wireframeMode: boolean,
): THREE.Material {
  if (wireframeMode) {
    return new THREE.MeshBasicMaterial({
      color: 0x666666,
      wireframe: true,
      transparent: true,
      opacity: params.modelOpacity,
      side: THREE.DoubleSide,
    });
  }

  return new THREE.MeshMatcapMaterial({
    matcap: matcaps['MatcapFV'],
    transparent: true,
    opacity: params.modelOpacity,
    side: THREE.DoubleSide,
    flatShading: params.flatShading,
  });
}

/**
 * PBR 머티리얼 유니폼 업데이트 (렌더 루프에서 매 프레임 호출)
 */
export function updatePBRUniforms(
  mesh: THREE.Mesh | null,
  camera: THREE.Camera,
  light: THREE.DirectionalLight | null,
): void {
  if (!mesh || !mesh.material) return;

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const mat of materials) {
    if (mat instanceof THREE.ShaderMaterial && mat.uniforms.uCameraPosition) {
      mat.uniforms.uCameraPosition.value.copy(camera.position);
      if (light) {
        mat.uniforms.uLightPosition.value.copy(light.position);
      }
    }
  }
}
