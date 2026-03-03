// GPU Compute Sculpting Engine — WebGPU Compute Shader 기반
import displaceShaderSource from './shaders/sculptDisplace.wgsl?raw';
import normalsShaderSource from './shaders/sculptNormals.wgsl?raw';

let gpuDevice: GPUDevice | null = null;
let displacePipeline: GPUComputePipeline | null = null;
let _normalAccumPipeline: GPUComputePipeline | null = null;
let _normalNormPipeline: GPUComputePipeline | null = null;
let initialized = false;

// 버퍼 풀: 매 프레임 재할당 방지
let pooledPositionBuffer: GPUBuffer | null = null;
let pooledNormalBuffer: GPUBuffer | null = null;
let pooledNormalI32Buffer: GPUBuffer | null = null;
let pooledMaxVertices = 0;

export function isGPUSculptAvailable(): boolean {
  return initialized && gpuDevice !== null;
}

export async function initGPUSculpt(): Promise<boolean> {
  if (initialized) return gpuDevice !== null;

  try {
    if (!navigator.gpu) {
      console.warn('[GPUSculpt] WebGPU not supported');
      initialized = true;
      return false;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      console.warn('[GPUSculpt] No WebGPU adapter');
      initialized = true;
      return false;
    }

    gpuDevice = await adapter.requestDevice();

    // Displacement pipeline
    const displaceModule = gpuDevice.createShaderModule({ code: displaceShaderSource });
    displacePipeline = gpuDevice.createComputePipeline({
      layout: 'auto',
      compute: { module: displaceModule, entryPoint: 'main' },
    });

    // Normal accumulation pipeline
    const normalsModule = gpuDevice.createShaderModule({ code: normalsShaderSource });
    _normalAccumPipeline = gpuDevice.createComputePipeline({
      layout: 'auto',
      compute: { module: normalsModule, entryPoint: 'accumulateNormals' },
    });

    // Normal normalization pipeline
    _normalNormPipeline = gpuDevice.createComputePipeline({
      layout: 'auto',
      compute: { module: normalsModule, entryPoint: 'normalizeNormals' },
    });

    initialized = true;
    void _normalAccumPipeline;
    void _normalNormPipeline;
    console.log('[GPUSculpt] Initialized successfully');
    return true;
  } catch (err) {
    console.warn('[GPUSculpt] Init failed:', err);
    initialized = true;
    return false;
  }
}

function ensureBufferPool(totalVertices: number): void {
  if (!gpuDevice || totalVertices <= pooledMaxVertices) return;

  // 2배 여유 할당
  pooledMaxVertices = totalVertices * 2;
  const byteSize = pooledMaxVertices * 3 * 4;

  pooledPositionBuffer?.destroy();
  pooledNormalBuffer?.destroy();
  pooledNormalI32Buffer?.destroy();

  pooledPositionBuffer = gpuDevice.createBuffer({
    size: byteSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  pooledNormalBuffer = gpuDevice.createBuffer({
    size: byteSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  pooledNormalI32Buffer = gpuDevice.createBuffer({
    size: byteSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
}

export interface GPUDisplaceParams {
  center: [number, number, number];
  radius: number;
  normal: [number, number, number];
  intensity: number;
  planePoint: [number, number, number];
  brushType: number; // 0=clay, 1=normal, 2=flatten
  invert: boolean;
  targetHeight: number;
}

/**
 * GPU에서 정점 변형 수행
 * positionArray, normalArray: geometry.attributes.position.array 등의 Float32Array
 * affectedIndices: BVH shapecast로 식별된 정점 인덱스
 */
export async function displaceVerticesGPU(
  positionArray: Float32Array,
  normalArray: Float32Array,
  affectedIndices: Uint32Array,
  params: GPUDisplaceParams,
): Promise<void> {
  if (!gpuDevice || !displacePipeline) return;

  const totalVertices = positionArray.length / 3;
  ensureBufferPool(totalVertices);
  if (!pooledPositionBuffer || !pooledNormalBuffer) return;

  // 위치/노말 데이터 업로드
  gpuDevice.queue.writeBuffer(pooledPositionBuffer, 0, positionArray as unknown as ArrayBuffer);
  gpuDevice.queue.writeBuffer(pooledNormalBuffer, 0, normalArray as unknown as ArrayBuffer);

  // 영향받는 인덱스 버퍼
  const indicesBuffer = gpuDevice.createBuffer({
    size: affectedIndices.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  gpuDevice.queue.writeBuffer(indicesBuffer, 0, affectedIndices as unknown as ArrayBuffer);

  // Uniform 버퍼 (BrushParams 구조체, 64 bytes)
  const uniformData = new Float32Array(16);
  uniformData[0] = params.center[0];
  uniformData[1] = params.center[1];
  uniformData[2] = params.center[2];
  uniformData[3] = params.radius;
  uniformData[4] = params.normal[0];
  uniformData[5] = params.normal[1];
  uniformData[6] = params.normal[2];
  uniformData[7] = params.intensity;
  uniformData[8] = params.planePoint[0];
  uniformData[9] = params.planePoint[1];
  uniformData[10] = params.planePoint[2];
  // u32 fields
  const uniformView = new DataView(uniformData.buffer);
  uniformView.setUint32(44, params.brushType, true);
  uniformView.setUint32(48, params.invert ? 1 : 0, true);
  uniformView.setFloat32(52, params.targetHeight, true);
  // pad

  const uniformBuffer = gpuDevice.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  gpuDevice.queue.writeBuffer(uniformBuffer, 0, uniformData);

  // Bind group
  const bindGroup = gpuDevice.createBindGroup({
    layout: displacePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: pooledPositionBuffer } },
      { binding: 1, resource: { buffer: pooledNormalBuffer } },
      { binding: 2, resource: { buffer: indicesBuffer } },
      { binding: 3, resource: { buffer: uniformBuffer } },
    ],
  });

  // Dispatch
  const workgroupCount = Math.ceil(affectedIndices.length / 64);
  const encoder = gpuDevice.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(displacePipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(workgroupCount);
  pass.end();

  // Readback
  const readbackPosBuffer = gpuDevice.createBuffer({
    size: positionArray.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const readbackNrmBuffer = gpuDevice.createBuffer({
    size: normalArray.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  encoder.copyBufferToBuffer(pooledPositionBuffer, 0, readbackPosBuffer, 0, positionArray.byteLength);
  encoder.copyBufferToBuffer(pooledNormalBuffer, 0, readbackNrmBuffer, 0, normalArray.byteLength);

  gpuDevice.queue.submit([encoder.finish()]);

  // 결과 복사
  await readbackPosBuffer.mapAsync(GPUMapMode.READ);
  await readbackNrmBuffer.mapAsync(GPUMapMode.READ);

  const posResult = new Float32Array(readbackPosBuffer.getMappedRange());
  const nrmResult = new Float32Array(readbackNrmBuffer.getMappedRange());

  positionArray.set(posResult);
  normalArray.set(nrmResult);

  readbackPosBuffer.unmap();
  readbackNrmBuffer.unmap();

  // 임시 버퍼 정리
  indicesBuffer.destroy();
  uniformBuffer.destroy();
  readbackPosBuffer.destroy();
  readbackNrmBuffer.destroy();
}
