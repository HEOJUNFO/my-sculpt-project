import * as THREE from 'three';

export function setupLighting(scene: THREE.Scene): THREE.DirectionalLight {
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(1, 1, 1);
  scene.add(dirLight);
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  return dirLight;
}
