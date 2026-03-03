// GPU Compute Shader: Vertex Displacement for Sculpting
// BVH shapecast는 CPU에서 수행하고, 영향받는 정점만 GPU에서 변형

struct BrushParams {
  center: vec3f,
  radius: f32,
  normal: vec3f,
  intensity: f32,
  planePoint: vec3f,
  brushType: u32,   // 0=clay, 1=normal, 2=flatten
  invert: u32,
  targetHeight: f32,
  _pad: vec2f,
};

@group(0) @binding(0) var<storage, read_write> positions: array<f32>;
@group(0) @binding(1) var<storage, read_write> normals: array<f32>;
@group(0) @binding(2) var<storage, read> affectedIndices: array<u32>;
@group(0) @binding(3) var<uniform> params: BrushParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) globalId: vec3u) {
  let i = globalId.x;
  if (i >= arrayLength(&affectedIndices)) { return; }

  let vertexIndex = affectedIndices[i];
  let idx3 = vertexIndex * 3u;

  var pos = vec3f(positions[idx3], positions[idx3 + 1u], positions[idx3 + 2u]);
  let nrm = normalize(params.normal);
  let localPoint = params.center;

  let dist = distance(pos, localPoint);
  let negated = select(1.0, -1.0, params.invert != 0u);
  var intensityFactor = 1.0 - (dist / params.radius);

  let planeNormal = nrm;
  let planeDist = dot(pos - params.planePoint, planeNormal);
  let targetHeight = params.targetHeight;

  if (params.brushType == 0u) {
    // Clay
    intensityFactor = pow(intensityFactor, 3.0);
    let clampedIntensity = negated * min(intensityFactor * 4.0, 1.0);
    pos += nrm * (clampedIntensity * targetHeight - negated * planeDist * clampedIntensity * 0.3);
  } else if (params.brushType == 1u) {
    // Normal
    intensityFactor = pow(intensityFactor, 2.0);
    pos += nrm * (negated * intensityFactor * targetHeight);
  } else {
    // Flatten
    intensityFactor = pow(intensityFactor, 2.0);
    pos += nrm * (-planeDist * intensityFactor * params.intensity * 0.01 * 0.5);
  }

  positions[idx3] = pos.x;
  positions[idx3 + 1u] = pos.y;
  positions[idx3 + 2u] = pos.z;

  // Zero out normals (second pass에서 재계산)
  normals[idx3] = 0.0;
  normals[idx3 + 1u] = 0.0;
  normals[idx3 + 2u] = 0.0;
}
