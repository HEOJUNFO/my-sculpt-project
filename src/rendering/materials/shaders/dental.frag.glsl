// Dental PBR + SSS Fragment Shader
// SSS approximation: Barre-Brisebois & Bouchard (GDC 2011)
// Multi-light + IBL + Normal Map + AO Map

precision highp float;

// ===== PBR uniforms =====
uniform vec3 uAlbedo;
uniform float uRoughness;
uniform float uMetalness;

// ===== SSS uniforms =====
uniform vec3 uSSSColor;
uniform float uSSSIntensity;
uniform float uSSSDistortion;
uniform float uSSSAmbient;
uniform float uSSSThickness;

// ===== Translucency =====
uniform float uTranslucencyPower;
uniform float uTranslucencyScale;

// ===== Depth-based color shift (enamel simulation) =====
uniform vec3 uDepthColorNear;
uniform vec3 uDepthColorFar;
uniform float uDepthRange;

// ===== Multi-Light System (3 directional lights) =====
uniform vec3 uLightPositions[3];
uniform vec3 uLightColors[3];
uniform float uLightIntensities[3];
uniform vec3 uAmbientColor;

// ===== IBL =====
uniform sampler2D uEnvMap;
uniform float uEnvMapIntensity;
uniform float uMaxMipLevel;

// ===== Normal Map =====
uniform sampler2D uNormalMap;
uniform vec2 uNormalScale;
uniform float uHasNormalMap;

// ===== AO Map =====
uniform sampler2D uAOMap;
uniform float uAOIntensity;
uniform float uHasAOMap;

// ===== Camera =====
uniform vec3 uCameraPosition;

// ===== General =====
uniform float uOpacity;
uniform float uHasUV;

// ===== Varyings =====
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec3 vViewPosition;
varying float vDepth;
varying vec2 vUv;
varying vec3 vTangent;
varying vec3 vBitangent;

#define PI 3.14159265359
#define RECIPROCAL_PI 0.31830988618
#define saturate(x) clamp(x, 0.0, 1.0)
#define NUM_LIGHTS 3

// --- GGX/Trowbridge-Reitz Distribution ---
float distributionGGX(vec3 N, vec3 H, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH = max(dot(N, H), 0.0);
  float NdotH2 = NdotH * NdotH;

  float denom = NdotH2 * (a2 - 1.0) + 1.0;
  denom = PI * denom * denom;

  return a2 / max(denom, 0.0001);
}

// --- Smith's Schlick-GGX Geometry Function ---
float geometrySchlickGGX(float NdotV, float roughness) {
  float r = roughness + 1.0;
  float k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
}

// --- Fresnel-Schlick Approximation ---
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(saturate(1.0 - cosTheta), 5.0);
}

// --- Fresnel-Schlick with roughness (for IBL) ---
vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
  return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(saturate(1.0 - cosTheta), 5.0);
}

// --- Subsurface Scattering Approximation ---
// Fast SSS (GDC 2011, Barre-Brisebois & Bouchard)
vec3 calculateSSS(
  vec3 N, vec3 L, vec3 V,
  vec3 lightColor, vec3 sssColor,
  float distortion, float power, float scale, float ambient, float thickness
) {
  vec3 sssLightDir = L + N * distortion;
  float sssDot = pow(saturate(dot(V, -sssLightDir)), power) * scale;
  float sss = (sssDot + ambient) * thickness;
  return sssColor * lightColor * sss;
}

// --- Depth-based enamel color shift ---
vec3 depthColorShift(float depth, vec3 nearColor, vec3 farColor, float range) {
  float t = saturate(depth / range);
  t = t * t * (3.0 - 2.0 * t);
  return mix(nearColor, farColor, t);
}

// --- Equirectangular UV from direction ---
vec2 envMapEquirect(vec3 dir) {
  float phi = atan(dir.z, dir.x);
  float theta = asin(clamp(dir.y, -1.0, 1.0));
  return vec2(phi * (0.5 / PI) + 0.5, theta * (1.0 / PI) + 0.5);
}

// --- Direct lighting for a single light ---
vec3 calculateDirectLight(
  vec3 N, vec3 V, vec3 lightPos, vec3 lightColor, float lightIntensity,
  vec3 albedo, float roughness, float metalness, vec3 F0
) {
  vec3 L = normalize(lightPos - vWorldPosition);
  vec3 H = normalize(V + L);
  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 0.0);

  float D = distributionGGX(N, H, roughness);
  float G = geometrySmith(N, V, L, roughness);
  vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

  vec3 numerator = D * G * F;
  float denominator = 4.0 * NdotV * NdotL + 0.0001;
  vec3 specular = numerator / denominator;

  vec3 kS = F;
  vec3 kD = (1.0 - kS) * (1.0 - metalness);
  vec3 diffuse = kD * albedo * RECIPROCAL_PI;

  return (diffuse + specular) * lightColor * lightIntensity * NdotL;
}

void main() {
  // ===== Normal computation =====
  vec3 N;
  if (uHasNormalMap > 0.5 && uHasUV > 0.5) {
    vec3 normalSample = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
    normalSample.xy *= uNormalScale;
    vec3 T = normalize(vTangent);
    vec3 B = normalize(vBitangent);
    vec3 Ng = normalize(vNormal);
    mat3 TBN = mat3(T, B, Ng);
    N = normalize(TBN * normalSample);
  } else {
    N = normalize(vNormal);
  }

  vec3 V = normalize(uCameraPosition - vWorldPosition);
  float NdotV = max(dot(N, V), 0.0);

  // Base reflectivity
  vec3 F0 = vec3(0.04);
  F0 = mix(F0, uAlbedo, uMetalness);

  // ===== Multi-light direct lighting + SSS =====
  vec3 directLight = vec3(0.0);
  vec3 sss = vec3(0.0);

  for (int i = 0; i < NUM_LIGHTS; i++) {
    vec3 L = normalize(uLightPositions[i] - vWorldPosition);

    directLight += calculateDirectLight(
      N, V, uLightPositions[i], uLightColors[i], uLightIntensities[i],
      uAlbedo, uRoughness, uMetalness, F0
    );

    sss += calculateSSS(
      N, L, V,
      uLightColors[i] * uLightIntensities[i], uSSSColor,
      uSSSDistortion, uTranslucencyPower, uTranslucencyScale,
      uSSSAmbient, uSSSThickness
    ) * uSSSIntensity;
  }

  // ===== IBL (Image-Based Lighting) =====
  vec3 iblDiffuse = vec3(0.0);
  vec3 iblSpecular = vec3(0.0);

  if (uEnvMapIntensity > 0.0) {
    vec3 R = reflect(-V, N);

    // Diffuse irradiance — 최대 mip에서 샘플 (완전 blur)
    vec2 diffUV = envMapEquirect(N);
    iblDiffuse = textureLod(uEnvMap, diffUV, uMaxMipLevel).rgb * uAlbedo;
    vec3 kS_ibl = fresnelSchlickRoughness(NdotV, F0, uRoughness);
    vec3 kD_ibl = (1.0 - kS_ibl) * (1.0 - uMetalness);
    iblDiffuse *= kD_ibl;

    // Specular reflection — roughness 기반 mip에서 샘플
    vec2 specUV = envMapEquirect(R);
    float specLod = uRoughness * uMaxMipLevel;
    iblSpecular = textureLod(uEnvMap, specUV, specLod).rgb * kS_ibl;

    iblDiffuse *= uEnvMapIntensity;
    iblSpecular *= uEnvMapIntensity;
  }

  // ===== Depth-based enamel translucency =====
  vec3 depthTint = depthColorShift(vDepth, uDepthColorNear, uDepthColorFar, uDepthRange);

  // ===== Ambient =====
  vec3 ambient = uAmbientColor * uAlbedo;

  // ===== AO Map =====
  float ao = 1.0;
  if (uHasAOMap > 0.5 && uHasUV > 0.5) {
    ao = mix(1.0, texture2D(uAOMap, vUv).r, uAOIntensity);
  }

  // ===== Rim light (key light 기반) =====
  float rim = 1.0 - NdotV;
  rim = smoothstep(0.4, 1.0, rim);
  vec3 rimColor = uLightColors[0] * rim * 0.15;

  // ===== Final composition =====
  vec3 color = directLight + sss + (ambient + iblDiffuse) * ao + iblSpecular + rimColor;
  color *= depthTint;

  // Output linear HDR — tone mapping and gamma handled by OutputPass
  gl_FragColor = vec4(color, uOpacity);
}
