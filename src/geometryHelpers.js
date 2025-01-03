
/**
 * 중심 정렬 + 바운딩 스피어 기반으로 반지름 = 1이 되도록 스케일링
 */
export function centerAndScaleGeometry( geometry ) {

  // 1) 지오메트리 중심을 (0,0,0)에 옮김
  geometry.center();

  // 2) 바운딩 스피어 계산 -> 반지름(radius)을 1로 맞춤
  geometry.computeBoundingSphere();
  if ( geometry.boundingSphere ) {
    const radius = geometry.boundingSphere.radius;
    const scaleFactor = 1 / radius;
    geometry.scale( scaleFactor, scaleFactor, scaleFactor );
  }

}
