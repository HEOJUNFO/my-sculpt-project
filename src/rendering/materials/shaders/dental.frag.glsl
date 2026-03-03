// Dental PBR + SSS Fragment Shader
// SSS approximation: Barre-Brisebois & Bouchard (GDC 2011)

precision highp float;

// PBR uniforms
uniform vec3 uAlbedo;
uniform float uRoughness;
uniform float uMetalness;

// SSS uniforms
uniform vec3 uSSSColor;
uniform float uSSSIntensity;
uniform float uSSSDistortion;
uniform float uSSSAmbient;
uniform float uSSSThickness;

// Translucency
uniform float uTranslucencyPower;
uniform float uTranslucencyScale;

// Depth-based color shift (enamel simulation)
uniform vec3 uDepthColorNear;
uniform vec3 uDepthColorFar;
uniform float uDepthRange;

// Lighting
uniform vec3 uLightPosition;
uniform vec3 uLightColor;
uniform vec3 uAmbientColor;

// Camera
uniform vec3 uCameraPosition;

// General
uniform float uOpacity;

// Varyings
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec3 vViewPosition;
varying float vDepth;

#define PI 3.14159265359
#define RECIPROCAL_PI 0.31830988618
#define saturate(x) clamp(x, 0.0, 1.0)

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

// --- Subsurface Scattering Approximation ---
// Fast SSS (GDC 2011, Barre-Brisebois & Bouchard)
vec3 calculateSSS(
  vec3 N, vec3 L, vec3 V,
  vec3 lightColor, vec3 sssColor,
  float distortion, float power, float scale, float ambient, float thickness
) {
  // Distort light by surface normal for wrap-around effect
  vec3 sssLightDir = L + N * distortion;

  // View-dependent SSS component
  float sssDot = pow(saturate(dot(V, -sssLightDir)), power) * scale;

  // Thickness attenuation - thinner areas scatter more light
  float sss = (sssDot + ambient) * thickness;

  return sssColor * lightColor * sss;
}

// --- Depth-based enamel color shift ---
vec3 depthColorShift(float depth, vec3 nearColor, vec3 farColor, float range) {
  float t = saturate(depth / range);
  // Smooth hermite interpolation
  t = t * t * (3.0 - 2.0 * t);
  return mix(nearColor, farColor, t);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPosition - vWorldPosition);
  vec3 L = normalize(uLightPosition - vWorldPosition);
  vec3 H = normalize(V + L);

  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 0.0);

  // --------- PBR: Cook-Torrance BRDF ---------

  // Base reflectivity (dielectric=0.04 for dental material)
  vec3 F0 = vec3(0.04);
  F0 = mix(F0, uAlbedo, uMetalness);

  // Distribution, Geometry, Fresnel
  float D = distributionGGX(N, H, uRoughness);
  float G = geometrySmith(N, V, L, uRoughness);
  vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

  // Specular
  vec3 numerator = D * G * F;
  float denominator = 4.0 * NdotV * NdotL + 0.0001;
  vec3 specular = numerator / denominator;

  // Diffuse (energy conservation)
  vec3 kS = F;
  vec3 kD = (1.0 - kS) * (1.0 - uMetalness);
  vec3 diffuse = kD * uAlbedo * RECIPROCAL_PI;

  // Direct lighting
  vec3 directLight = (diffuse + specular) * uLightColor * NdotL;

  // --------- SSS: Subsurface Scattering ---------
  vec3 sss = calculateSSS(
    N, L, V,
    uLightColor, uSSSColor,
    uSSSDistortion,
    uTranslucencyPower,
    uTranslucencyScale,
    uSSSAmbient,
    uSSSThickness
  ) * uSSSIntensity;

  // --------- Depth-based enamel translucency ---------
  vec3 depthTint = depthColorShift(vDepth, uDepthColorNear, uDepthColorFar, uDepthRange);

  // --------- Ambient ---------
  vec3 ambient = uAmbientColor * uAlbedo;

  // --------- Rim light (edge glow for organic feel) ---------
  float rim = 1.0 - NdotV;
  rim = smoothstep(0.4, 1.0, rim);
  vec3 rimColor = uLightColor * rim * 0.15;

  // --------- Final composition ---------
  vec3 color = directLight + sss + ambient + rimColor;
  // Apply depth-based color modulation
  color *= depthTint;

  // Simple tone mapping (Reinhard)
  color = color / (color + vec3(1.0));
  // Gamma correction
  color = pow(color, vec3(1.0 / 2.2));

  gl_FragColor = vec4(color, uOpacity);
}
