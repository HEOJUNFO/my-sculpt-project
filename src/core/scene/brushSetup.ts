import * as THREE from 'three';

export function createBrush(opacity: number): THREE.LineSegments {
  const brushMat = new THREE.LineBasicMaterial({
    color: 'red',
    transparent: true,
    opacity,
    depthTest: false,
  });

  const segments: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(0, 0, 1)];
  for (let i = 0; i < 50; i++) {
    const nexti = i + 1;
    const x1 = Math.sin((2 * Math.PI * i) / 50);
    const y1 = Math.cos((2 * Math.PI * i) / 50);
    const x2 = Math.sin((2 * Math.PI * nexti) / 50);
    const y2 = Math.cos((2 * Math.PI * nexti) / 50);
    segments.push(new THREE.Vector3(x1, y1, 0), new THREE.Vector3(x2, y2, 0));
  }

  const geo = new THREE.BufferGeometry().setFromPoints(segments);
  const brush = new THREE.LineSegments(geo, brushMat);
  brush.renderOrder = 9999;
  return brush;
}
