import * as THREE from 'three';
import dentalVertShader from './shaders/dental.vert.glsl?raw';
import dentalFragShader from './shaders/dental.frag.glsl?raw';

export interface DentalMaterialOptions {
  albedo?: THREE.Color;
  roughness?: number;
  metalness?: number;
  sssColor?: THREE.Color;
  sssIntensity?: number;
  sssDistortion?: number;
  sssAmbient?: number;
  sssThickness?: number;
  translucencyPower?: number;
  translucencyScale?: number;
  depthColorNear?: THREE.Color;
  depthColorFar?: THREE.Color;
  depthRange?: number;
  opacity?: number;
  flatShading?: boolean;
  // 텍스처 옵션
  normalMap?: THREE.Texture | null;
  normalScale?: THREE.Vector2;
  aoMap?: THREE.Texture | null;
  aoIntensity?: number;
  hasUV?: boolean;
}

// 치아 프리셋
export const DENTAL_PRESETS = {
  tooth: {
    albedo: new THREE.Color(0.92, 0.88, 0.82),
    roughness: 0.3,
    metalness: 0.0,
    sssColor: new THREE.Color(1.0, 0.6, 0.45),
    sssIntensity: 0.6,
    sssDistortion: 0.2,
    sssAmbient: 0.12,
    sssThickness: 0.7,
    translucencyPower: 3.0,
    translucencyScale: 1.5,
    depthColorNear: new THREE.Color(0.95, 0.92, 0.88),
    depthColorFar: new THREE.Color(0.75, 0.60, 0.52),
    depthRange: 2.0,
  },
  gum: {
    albedo: new THREE.Color(0.85, 0.45, 0.40),
    roughness: 0.55,
    metalness: 0.0,
    sssColor: new THREE.Color(1.0, 0.3, 0.25),
    sssIntensity: 0.8,
    sssDistortion: 0.3,
    sssAmbient: 0.15,
    sssThickness: 0.9,
    translucencyPower: 2.0,
    translucencyScale: 1.0,
    depthColorNear: new THREE.Color(0.88, 0.50, 0.45),
    depthColorFar: new THREE.Color(0.65, 0.30, 0.25),
    depthRange: 1.5,
  },
  porcelain: {
    albedo: new THREE.Color(0.95, 0.93, 0.90),
    roughness: 0.15,
    metalness: 0.0,
    sssColor: new THREE.Color(0.9, 0.7, 0.6),
    sssIntensity: 0.4,
    sssDistortion: 0.15,
    sssAmbient: 0.08,
    sssThickness: 0.5,
    translucencyPower: 4.0,
    translucencyScale: 2.0,
    depthColorNear: new THREE.Color(0.98, 0.96, 0.93),
    depthColorFar: new THREE.Color(0.85, 0.78, 0.72),
    depthRange: 2.5,
  },
};

export function createDentalPBRMaterial(opts: DentalMaterialOptions = {}): THREE.ShaderMaterial {
  const preset = DENTAL_PRESETS.tooth;

  const material = new THREE.ShaderMaterial({
    vertexShader: dentalVertShader,
    fragmentShader: dentalFragShader,
    uniforms: {
      // PBR
      uAlbedo: { value: opts.albedo ?? preset.albedo.clone() },
      uRoughness: { value: opts.roughness ?? preset.roughness },
      uMetalness: { value: opts.metalness ?? preset.metalness },

      // SSS
      uSSSColor: { value: opts.sssColor ?? preset.sssColor.clone() },
      uSSSIntensity: { value: opts.sssIntensity ?? preset.sssIntensity },
      uSSSDistortion: { value: opts.sssDistortion ?? preset.sssDistortion },
      uSSSAmbient: { value: opts.sssAmbient ?? preset.sssAmbient },
      uSSSThickness: { value: opts.sssThickness ?? preset.sssThickness },

      // Translucency
      uTranslucencyPower: { value: opts.translucencyPower ?? preset.translucencyPower },
      uTranslucencyScale: { value: opts.translucencyScale ?? preset.translucencyScale },

      // Depth-based color shift
      uDepthColorNear: { value: opts.depthColorNear ?? preset.depthColorNear.clone() },
      uDepthColorFar: { value: opts.depthColorFar ?? preset.depthColorFar.clone() },
      uDepthRange: { value: opts.depthRange ?? preset.depthRange },

      // Multi-light system (3 directional lights)
      uLightPositions: { value: [
        new THREE.Vector3(2, 3, 2),
        new THREE.Vector3(-2, -1, 1),
        new THREE.Vector3(0, 1, -3),
      ] },
      uLightColors: { value: [
        new THREE.Color(1.0, 0.96, 0.90),
        new THREE.Color(0.90, 0.94, 1.0),
        new THREE.Color(1.0, 1.0, 1.0),
      ] },
      uLightIntensities: { value: [1.2, 0.4, 0.6] },
      uAmbientColor: { value: new THREE.Color(0.3, 0.3, 0.35) },

      // IBL
      uEnvMap: { value: null as THREE.Texture | null },
      uEnvMapIntensity: { value: 0.0 },
      uMaxMipLevel: { value: 8.0 },

      // Normal map
      uNormalMap: { value: opts.normalMap ?? null },
      uNormalScale: { value: opts.normalScale ?? new THREE.Vector2(1.0, 1.0) },
      uHasNormalMap: { value: opts.normalMap ? 1.0 : 0.0 },

      // AO map
      uAOMap: { value: opts.aoMap ?? null },
      uAOIntensity: { value: opts.aoIntensity ?? 1.0 },
      uHasAOMap: { value: opts.aoMap ? 1.0 : 0.0 },

      // UV flag
      uHasUV: { value: opts.hasUV ? 1.0 : 0.0 },

      // Camera
      uCameraPosition: { value: new THREE.Vector3() },

      // General
      uOpacity: { value: opts.opacity ?? 1.0 },
    },
    transparent: true,
    side: THREE.DoubleSide,
  });

  if (opts.flatShading) {
    (material as any).flatShading = true;
  }

  return material;
}
