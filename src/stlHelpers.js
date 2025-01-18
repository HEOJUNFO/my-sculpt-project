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

        const positionAttr = geometry.getAttribute('position');
        if ( ! positionAttr ) {
          throw new Error('BufferGeometry has no position attribute.');
        }
        const positions = positionAttr.array; // Float32Array


        const indices = [];
        // positions.length는 (정점 수 * 3) 이므로, 실제 정점 개수 = positions.length / 3
        for ( let i = 0; i < positions.length / 3; i += 3 ) {
          indices.push( i, i + 1, i + 2 );
        }

        // 4) 새로운 BufferGeometry 생성
        let newGeometry = new THREE.BufferGeometry();

        // position 어트리뷰트 등록 (3개씩 -> x, y, z)
        // 주의: 두 번째 인자로 3을 넣어야 x,y,z로 묶임
        newGeometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute( positions, 3 )
        );

        // 인덱스 설정
        // 만약 정점 수가 매우 많을 경우, Uint32BufferAttribute( indices, 1 )가 필요할 수도 있음
        // (65,535개 초과인 경우)
        newGeometry.setIndex(
          new THREE.Uint32BufferAttribute( indices, 1 )
        );

        
        resolve( newGeometry );
      } catch ( err ) {
        reject( err );
      }
    }, false );

    reader.addEventListener( 'error', reject );

    // 바이너리 STL 읽기
    reader.readAsArrayBuffer( file );

  } );

}


// let attributes = geometry.getAttribute( 'position' );
        // if(attributes === undefined) {
        //   console.log('a given BufferGeometry object must have a position attribute.');
        //   attributes = geometry.getAttribute( 'vertices' );
        // }
        // let position = attributes.array;
        // let vertices = [];
        // for ( let i = 0; i < position.length; i += 3 ) {
        //   vertices.push( new THREE.Vector3( position[ i ], position[ i + 1 ], position[ i + 2 ] ) );
        // }
      
        // let newGeometry = new THREE.BufferGeometry().setFromPoints( vertices );