// Dental PBR + SSS Vertex Shader
// UV + TBN matrix support for normal mapping

varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec3 vViewPosition;
varying float vDepth;
varying vec2 vUv;
varying vec3 vTangent;
varying vec3 vBitangent;

uniform float uHasUV;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vNormal = normalize(normalMatrix * normal);

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  vDepth = -mvPosition.z;

  // UV 좌표
  #ifdef USE_UV
    vUv = uv;
  #else
    vUv = vec2(0.0);
  #endif

  // TBN 매트릭스 (tangent 어트리뷰트가 있을 때만 유효)
  #ifdef USE_TANGENT
    vTangent = normalize(normalMatrix * tangent.xyz);
    vBitangent = normalize(cross(vNormal, vTangent) * tangent.w);
  #else
    vTangent = vec3(1.0, 0.0, 0.0);
    vBitangent = vec3(0.0, 1.0, 0.0);
  #endif

  gl_Position = projectionMatrix * mvPosition;
}
