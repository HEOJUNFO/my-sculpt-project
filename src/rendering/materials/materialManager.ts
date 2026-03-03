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
  lightingRig: { lights: THREE.DirectionalLight[] } | null,
  envMap: THREE.Texture | null,
): void {
  if (!mesh || !mesh.material) return;

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const mat of materials) {
    if (!(mat instanceof THREE.ShaderMaterial) || !mat.uniforms.uCameraPosition) continue;

    // Camera position
    mat.uniforms.uCameraPosition.value.copy(camera.position);

    // Multi-light positions, colors, intensities
    if (lightingRig && mat.uniforms.uLightPositions) {
      const positions = mat.uniforms.uLightPositions.value;
      const colors = mat.uniforms.uLightColors.value;
      const intensities = mat.uniforms.uLightIntensities.value;

      for (let i = 0; i < lightingRig.lights.length && i < 3; i++) {
        const light = lightingRig.lights[i];
        positions[i].copy(light.position);
        colors[i].copy(light.color);
        intensities[i] = light.intensity;
      }
    }

    // IBL environment map
    if (mat.uniforms.uEnvMap && envMap && !mat.uniforms.uEnvMap.value) {
      mat.uniforms.uEnvMap.value = envMap;
      mat.uniforms.uEnvMapIntensity.value = 1.0;
    }
  }
}

/**
 * PBR 머티리얼에 텍스처 설정 (노말맵, AO맵)
 */
export function setMaterialTextures(
  material: THREE.ShaderMaterial,
  options: {
    normalMap?: THREE.Texture | null;
    normalScale?: THREE.Vector2;
    aoMap?: THREE.Texture | null;
    aoIntensity?: number;
    hasUV?: boolean;
  },
): void {
  if (!material.uniforms.uHasUV) return;

  material.uniforms.uHasUV.value = options.hasUV ? 1.0 : 0.0;

  if (options.normalMap) {
    material.uniforms.uNormalMap.value = options.normalMap;
    material.uniforms.uHasNormalMap.value = 1.0;
    if (options.normalScale) {
      material.uniforms.uNormalScale.value.copy(options.normalScale);
    }
  } else {
    material.uniforms.uHasNormalMap.value = 0.0;
  }

  if (options.aoMap) {
    material.uniforms.uAOMap.value = options.aoMap;
    material.uniforms.uHasAOMap.value = 1.0;
    material.uniforms.uAOIntensity.value = options.aoIntensity ?? 1.0;
  } else {
    material.uniforms.uHasAOMap.value = 0.0;
  }
}
