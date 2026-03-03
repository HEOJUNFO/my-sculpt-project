// GPU Compute Shader: Normal Recalculation
// 삼각형 face normal을 계산하고 정점에 누적한 뒤 정규화

// Pass 1: 삼각형별 face normal 계산 + 정점 normal에 누적
// (atomicAdd가 f32를 지원하지 않으므로 i32 고정소수점 사용)

struct NormalParams {
  triangleCount: u32,
  vertexCount: u32,
  _pad: vec2u,
};

@group(0) @binding(0) var<storage, read> positions: array<f32>;
@group(0) @binding(1) var<storage, read_write> normalsI32: array<atomic<i32>>;
@group(0) @binding(2) var<storage, read> indexBuffer: array<u32>;
@group(0) @binding(3) var<storage, read> affectedTriangles: array<u32>;
@group(0) @binding(4) var<uniform> params: NormalParams;

const FIXED_POINT_SCALE: f32 = 1000000.0;

fn floatToFixed(v: f32) -> i32 {
  return i32(v * FIXED_POINT_SCALE);
}

@compute @workgroup_size(64)
fn accumulateNormals(@builtin(global_invocation_id) globalId: vec3u) {
  let triIdx = globalId.x;
  if (triIdx >= params.triangleCount) { return; }

  let tri = affectedTriangles[triIdx];
  let i0 = indexBuffer[tri * 3u];
  let i1 = indexBuffer[tri * 3u + 1u];
  let i2 = indexBuffer[tri * 3u + 2u];

  let p0 = vec3f(positions[i0 * 3u], positions[i0 * 3u + 1u], positions[i0 * 3u + 2u]);
  let p1 = vec3f(positions[i1 * 3u], positions[i1 * 3u + 1u], positions[i1 * 3u + 2u]);
  let p2 = vec3f(positions[i2 * 3u], positions[i2 * 3u + 1u], positions[i2 * 3u + 2u]);

  let edge1 = p1 - p0;
  let edge2 = p2 - p0;
  let faceNormal = normalize(cross(edge1, edge2));

  let fnx = floatToFixed(faceNormal.x);
  let fny = floatToFixed(faceNormal.y);
  let fnz = floatToFixed(faceNormal.z);

  // atomicAdd로 각 정점에 face normal 누적
  atomicAdd(&normalsI32[i0 * 3u], fnx);
  atomicAdd(&normalsI32[i0 * 3u + 1u], fny);
  atomicAdd(&normalsI32[i0 * 3u + 2u], fnz);

  atomicAdd(&normalsI32[i1 * 3u], fnx);
  atomicAdd(&normalsI32[i1 * 3u + 1u], fny);
  atomicAdd(&normalsI32[i1 * 3u + 2u], fnz);

  atomicAdd(&normalsI32[i2 * 3u], fnx);
  atomicAdd(&normalsI32[i2 * 3u + 1u], fny);
  atomicAdd(&normalsI32[i2 * 3u + 2u], fnz);
}

// Pass 2: 누적된 i32 normal을 정규화하여 float normal 버퍼에 기록
@group(0) @binding(5) var<storage, read_write> normalsF32: array<f32>;
@group(0) @binding(6) var<storage, read> affectedVertices: array<u32>;

@compute @workgroup_size(64)
fn normalizeNormals(@builtin(global_invocation_id) globalId: vec3u) {
  let i = globalId.x;
  if (i >= params.vertexCount) { return; }

  let vi = affectedVertices[i];
  let idx3 = vi * 3u;

  let nx = f32(atomicLoad(&normalsI32[idx3])) / FIXED_POINT_SCALE;
  let ny = f32(atomicLoad(&normalsI32[idx3 + 1u])) / FIXED_POINT_SCALE;
  let nz = f32(atomicLoad(&normalsI32[idx3 + 2u])) / FIXED_POINT_SCALE;

  let n = normalize(vec3f(nx, ny, nz));

  normalsF32[idx3] = n.x;
  normalsF32[idx3 + 1u] = n.y;
  normalsF32[idx3 + 2u] = n.z;
}
