import * as THREE from 'three';

export const getSphere = (pos, color) => {
  const depthTest = false;
  const transparent = true;
  const opacity = 0.8;
  const geo = new THREE.SphereGeometry(0.01, 16, 16);
  const mat = new THREE.MeshBasicMaterial({ color, depthTest, transparent, opacity });
  const sphere = new THREE.Mesh(geo, mat);
  sphere.position.copy(pos);
  return sphere;
}

export const getLine = (p1, p2, color) => {
  const geo = new THREE.BufferGeometry([p1, p2]);
  const mat = new THREE.LineBasicMaterial({ color });
  const line = new THREE.Line(geo, mat);
  return line;
}
