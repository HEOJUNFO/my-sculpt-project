// src/features/export/htmlExporter.js
import * as THREE from 'three';
import { refs } from '../../models/modelManager.js';

/**
 * 씬의 현재 상태를 독립적인 HTML 파일로 내보내기
 */
export function exportAsHTML() {
  console.log('HTML로 씬 내보내기 시작...');
  
  // 로딩 메시지 표시
  const loadingMessage = document.createElement('div');
  loadingMessage.id = 'html-export-loading';
  loadingMessage.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 20px;
    border-radius: 10px;
    z-index: 2000;
  `;
  loadingMessage.innerHTML = `
    <div class="loading-spinner"></div>
    <p>HTML 파일을 생성하는 중...</p>
  `;
  document.body.appendChild(loadingMessage);
  
  try {
    // 씬 데이터 수집
    const sceneData = collectSceneData();
    
    // HTML 템플릿 생성
    const htmlContent = generateHTMLTemplate(sceneData);
    
    // 파일 다운로드
    downloadHTML(htmlContent, 'dental_model_viewer.html');
    
    // 로딩 메시지 제거
    loadingMessage.remove();
    
    // 성공 메시지
    showHTMLExportSuccess();
    
  } catch (error) {
    console.error('HTML 내보내기 오류:', error);
    loadingMessage.remove();
    alert('HTML 내보내기 중 오류가 발생했습니다.');
  }
}

/**
 * 씬의 모든 데이터를 수집
 */
function collectSceneData() {
  const sceneData = {
    meshes: [],
    camera: {},
    lights: [],
    background: null
  };
  
  // 카메라 정보 저장
  if (refs.camera) {
    sceneData.camera = {
      position: refs.camera.position.toArray(),
      rotation: refs.camera.rotation.toArray(),
      fov: refs.camera.fov,
      aspect: refs.camera.aspect,
      near: refs.camera.near,
      far: refs.camera.far
    };
  }
  
  // 모든 메시 정보 수집
  refs.scene.traverse((object) => {
    if (object.isMesh) {
      const meshData = {
        name: object.name || 'Unnamed',
        geometry: geometryToJSON(object.geometry),
        material: materialToJSON(object.material),
        position: object.position.toArray(),
        rotation: object.rotation.toArray(),
        scale: object.scale.toArray(),
        userData: object.userData
      };
      sceneData.meshes.push(meshData);
    } else if (object.isLight) {
      const lightData = {
        type: object.type,
        color: object.color.toArray(),
        intensity: object.intensity,
        position: object.position.toArray()
      };
      sceneData.lights.push(lightData);
    }
  });
  
  // 배경색
  if (refs.scene.background) {
    sceneData.background = refs.scene.background.getHex();
  }
  
  return sceneData;
}

/**
 * Geometry를 JSON으로 변환
 */
function geometryToJSON(geometry) {
  const data = {
    positions: Array.from(geometry.attributes.position.array),
    normals: geometry.attributes.normal ? Array.from(geometry.attributes.normal.array) : null,
    indices: geometry.index ? Array.from(geometry.index.array) : null
  };
  return data;
}

/**
 * Material을 JSON으로 변환
 */
function materialToJSON(material) {
  const data = {
    type: material.type,
    color: material.color ? material.color.getHex() : 0xffffff,
    opacity: material.opacity || 1,
    transparent: material.transparent || false,
    side: material.side || THREE.FrontSide,
    flatShading: material.flatShading || false,
    roughness: material.roughness !== undefined ? material.roughness : 0.5,
    metalness: material.metalness !== undefined ? material.metalness : 0.5
  };
  
  // Matcap 텍스처가 있는 경우
  if (material.matcap && material.matcap.image) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = material.matcap.image.width;
      canvas.height = material.matcap.image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(material.matcap.image, 0, 0);
      data.matcapData = canvas.toDataURL('image/png');
    } catch (e) {
      console.warn('Matcap 텍스처 변환 실패:', e);
    }
  }
  
  return data;
}

/**
 * HTML 템플릿 생성
 */
function generateHTMLTemplate(sceneData) {
  const sceneDataJSON = JSON.stringify(sceneData);
  
  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dental Model Viewer</title>
    <style>
        body {
            margin: 0;
            overflow: hidden;
            font-family: Arial, sans-serif;
            background: #060609;
        }
        #info {
            position: absolute;
            top: 10px;
            left: 10px;
            color: white;
            background: rgba(0, 0, 0, 0.7);
            padding: 10px;
            border-radius: 5px;
            z-index: 100;
        }
        #loading {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-size: 24px;
        }
        .loading-spinner {
            width: 40px;
            height: 40px;
            margin: 0 auto 10px;
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top: 4px solid white;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div id="info">
        <h3>Dental Model Viewer</h3>
        <p>마우스: 회전 | 휠: 확대/축소 | 우클릭: 이동</p>
    </div>
    <div id="loading">
        <div class="loading-spinner"></div>
        <p>모델 로딩 중...</p>
    </div>

    <script async src="https://unpkg.com/es-module-shims@1.6.3/dist/es-module-shims.js"></script>
    <script type="importmap">
    {
        "imports": {
            "three": "https://unpkg.com/three@0.178.0/build/three.module.js",
            "three/addons/": "https://unpkg.com/three@0.178.0/examples/jsm/"
        }
    }
    </script>

    <script type="module">
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

        // 씬 데이터
        const sceneData = ${sceneDataJSON};

        // Three.js 초기화
        const scene = new THREE.Scene();
        if (sceneData.background) {
            scene.background = new THREE.Color(sceneData.background);
        } else {
            scene.background = new THREE.Color(0x060609);
        }

        // 카메라 설정
        const camera = new THREE.PerspectiveCamera(
            sceneData.camera.fov,
            window.innerWidth / window.innerHeight,
            sceneData.camera.near,
            sceneData.camera.far
        );
        camera.position.fromArray(sceneData.camera.position);
        camera.rotation.fromArray(sceneData.camera.rotation);

        // 렌더러 설정
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        document.body.appendChild(renderer.domElement);

        // 컨트롤 설정
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.25;
        controls.rotateSpeed = 0.5;
        controls.zoomSpeed = 1.2;
        controls.panSpeed = 0.8;

        // 조명 복원
        let hasLights = false;
        sceneData.lights.forEach(lightData => {
            let light;
            if (lightData.type === 'DirectionalLight') {
                light = new THREE.DirectionalLight(
                    new THREE.Color().fromArray(lightData.color),
                    lightData.intensity
                );
                hasLights = true;
            } else if (lightData.type === 'AmbientLight') {
                light = new THREE.AmbientLight(
                    new THREE.Color().fromArray(lightData.color),
                    lightData.intensity
                );
                hasLights = true;
            }
            if (light) {
                light.position.fromArray(lightData.position);
                scene.add(light);
            }
        });
        
        // 조명이 없으면 기본 조명 추가
        if (!hasLights) {
            const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
            scene.add(ambientLight);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
            directionalLight.position.set(1, 1, 1);
            scene.add(directionalLight);
        }

        // 메시 복원
        const textureLoader = new THREE.TextureLoader();
        let loadedMeshes = 0;
        const totalMeshes = sceneData.meshes.length;

        sceneData.meshes.forEach((meshData, index) => {
            // Geometry 복원
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', 
                new THREE.Float32BufferAttribute(meshData.geometry.positions, 3)
            );
            if (meshData.geometry.normals) {
                geometry.setAttribute('normal', 
                    new THREE.Float32BufferAttribute(meshData.geometry.normals, 3)
                );
            }
            if (meshData.geometry.indices) {
                geometry.setIndex(meshData.geometry.indices);
            }
            geometry.computeBoundingSphere();

            // Material 복원
            let material;
            const matData = meshData.material;
            
            if (matData.type === 'MeshMatcapMaterial' && matData.matcapData) {
                // Matcap 텍스처가 있는 경우
                const texture = textureLoader.load(matData.matcapData, () => {
                    loadedMeshes++;
                    checkLoadingComplete();
                });
                texture.colorSpace = THREE.SRGBColorSpace;
                material = new THREE.MeshMatcapMaterial({
                    matcap: texture,
                    color: matData.color,
                    opacity: matData.opacity,
                    transparent: matData.transparent,
                    side: matData.side,
                    flatShading: matData.flatShading
                });
            } else {
                // 기본 재질
                material = new THREE.MeshStandardMaterial({
                    color: matData.color,
                    opacity: matData.opacity,
                    transparent: matData.transparent,
                    side: matData.side,
                    flatShading: matData.flatShading,
                    roughness: matData.roughness,
                    metalness: matData.metalness
                });
                loadedMeshes++;
                checkLoadingComplete();
            }

            // 메시 생성
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = meshData.name;
            mesh.position.fromArray(meshData.position);
            mesh.rotation.fromArray(meshData.rotation);
            mesh.scale.fromArray(meshData.scale);
            mesh.userData = meshData.userData;
            mesh.frustumCulled = false;

            scene.add(mesh);
        });
        
        // 로딩 완료 체크
        function checkLoadingComplete() {
            if (loadedMeshes === totalMeshes || totalMeshes === 0) {
                document.getElementById('loading').style.display = 'none';
                
                // 카메라 위치 조정 (모든 객체가 보이도록)
                const box = new THREE.Box3().setFromObject(scene);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const fov = camera.fov * (Math.PI / 180);
                let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
                cameraZ *= 1.5; // 여유 공간
                
                controls.target.copy(center);
                controls.update();
            }
        }

        // 애니메이션 루프
        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

        // 윈도우 리사이즈 처리
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        // 초기 로딩 체크 (메시가 없는 경우)
        if (totalMeshes === 0) {
            checkLoadingComplete();
        }
    </script>
</body>
</html>`;
}

/**
 * HTML 콘텐츠 다운로드
 */
function downloadHTML(content, filename) {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.style.display = 'none';
  link.href = url;
  link.download = filename;
  
  document.body.appendChild(link);
  link.click();
  
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(link);
  }, 100);
}

/**
 * HTML 내보내기 성공 메시지
 */
function showHTMLExportSuccess() {
  const message = document.createElement('div');
  message.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(76, 175, 80, 0.9);
    color: white;
    padding: 12px 24px;
    border-radius: 4px;
    font-weight: bold;
    z-index: 2000;
    transition: opacity 0.5s;
  `;
  message.textContent = '3D 모델이 HTML 파일로 성공적으로 내보내졌습니다!';
  document.body.appendChild(message);
  
  setTimeout(() => {
    message.style.opacity = '0';
    setTimeout(() => message.remove(), 500);
  }, 3000);
}