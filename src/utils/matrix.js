import * as THREE from 'three';

export const getMatrixBasisAB = (avec, bvec, xvec) => {
  const anorm = avec.clone().normalize();
  const bnorm = bvec.clone().normalize();

  const dot = anorm.dot(bnorm);

  // --- avec ≈ bvec (same direction)
  if (dot > 1 - 1e-10) {
    // bnorm을 z축으로 두고 xvec을 x축 기준으로 투영해서 좌표계 생성
    const zaxis = bnorm.clone();
    const xaxis = xvec.clone().sub(zaxis.clone().multiplyScalar(xvec.dot(zaxis)));
    if (xaxis.length() < 1e-8) {
      throw new Error('xvec is parallel to b. Please input another xvec');
    }
    xaxis.normalize();
    const yaxis = new THREE.Vector3().crossVectors(zaxis, xaxis).normalize();

    const Tm = new THREE.Matrix3().set(
      xaxis.x, yaxis.x, zaxis.x,
      xaxis.y, yaxis.y, zaxis.y,
      xaxis.z, yaxis.z, zaxis.z
    );

    const e = Tm.elements;
    return new THREE.Matrix4().set(
      e[0], e[3], e[6], 0,
      e[1], e[4], e[7], 0,
      e[2], e[5], e[8], 0,
         0,    0,    0, 1
    );
  }

  // --- avec ≈ -bvec (opposite direction)
  if (dot < -1 + 1e-10) {
    const axis = new THREE.Vector3().crossVectors(anorm, xvec).normalize();
    return new THREE.Matrix4().makeRotationAxis(axis, Math.PI);
  }

  // --- 일반 케이스: avec → bvec 회전 계산
  const tmp = (Math.abs(anorm.x) < 0.9) ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const sx = new THREE.Vector3().crossVectors(tmp, anorm).normalize();
  const sy = new THREE.Vector3().crossVectors(anorm, sx).normalize();
  const sz = anorm.clone();
  const Sm = new THREE.Matrix3().set(
    sx.x, sy.x, sz.x,
    sx.y, sy.y, sz.y,
    sx.z, sy.z, sz.z
  );

  const zaxis = bnorm.clone();
  const xaxis = xvec.clone().sub(zaxis.clone().multiplyScalar(xvec.dot(zaxis)));
  if (xaxis.length() < 1e-8) {
    throw new Error('xvec is parallel to b. Please input another xvec');
  }
  xaxis.normalize();
  const yaxis = new THREE.Vector3().crossVectors(zaxis, xaxis).normalize();
  const Tm = new THREE.Matrix3().set(
    xaxis.x, yaxis.x, zaxis.x,
    xaxis.y, yaxis.y, zaxis.y,
    xaxis.z, yaxis.z, zaxis.z
  );

  // --- R = T * S^T ---
  const SmT = Sm.clone().transpose();
  const R3 = new THREE.Matrix3().multiplyMatrices(Tm, SmT);

  const e = R3.elements;
  const R4 = new THREE.Matrix4().set(
    e[0], e[3], e[6], 0,
    e[1], e[4], e[7], 0,
    e[2], e[5], e[8], 0,
       0,    0,    0, 1
  );
  return R4;
}

export const getMatrixBasis = (bvec, xvec) => {
  const bnorm = bvec.clone().normalize();

  const zaxis = bnorm.clone();
  const xaxis = xvec.clone().sub(zaxis.clone().multiplyScalar(xvec.dot(zaxis)));
  if (xaxis.length() < 1e-8) {
    throw new Error('xvec is parallel to b. Please input another xvec');
  }

  xaxis.normalize();
  const yaxis = new THREE.Vector3().crossVectors(zaxis, xaxis).normalize();
  const Tm = new THREE.Matrix4().makeBasis(xaxis, yaxis, zaxis);
  return Tm;
}
