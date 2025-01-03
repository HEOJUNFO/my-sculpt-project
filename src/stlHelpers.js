// src/stlHelpers.js
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import * as THREE from 'three';

/**
 * STL 로딩(파일 드래그 앤 드롭 등) 시 사용될 로더 인스턴스
 *  - 필요 시 싱글턴 또는 매번 생성 등 자유롭게
 */
export const stlLoader = new STLLoader();

/**
 * File 객체 -> ArrayBuffer -> THREE.Geometry(혹은 BufferGeometry) 로 변환
 * @param {File} file 
 * @returns {Promise<THREE.BufferGeometry>} 
 */
export function loadStlFileAsGeometry( file ) {

  return new Promise( (resolve, reject) => {

    const reader = new FileReader();

    reader.addEventListener( 'load', event => {
      try {
        const arrayBuffer = event.target.result;
        const geometry = stlLoader.parse( arrayBuffer );
        resolve( geometry );
      } catch ( err ) {
        reject( err );
      }
    }, false );

    reader.addEventListener( 'error', reject );

    // 바이너리 STL 읽기
    reader.readAsArrayBuffer( file );

  } );

}
