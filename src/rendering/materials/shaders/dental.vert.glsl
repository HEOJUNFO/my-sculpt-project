// Dental PBR + SSS Vertex Shader
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec3 vViewPosition;
varying float vDepth;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vNormal = normalize(normalMatrix * normal);

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  vDepth = -mvPosition.z;

  gl_Position = projectionMatrix * mvPosition;
}
