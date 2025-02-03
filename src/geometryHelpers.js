/**
 * 중심 정렬 + 바운딩 스피어 기반으로 반지름 = 1이 되도록 스케일링
 */
export function centerAndScaleGeometry( geometry ) {
  
  // (필요시) 지오메트리 중심을 (0,0,0)에 맞추고 싶다면 주석 해제
  // geometry.center();

  // 바운딩 스피어 계산
  geometry.computeBoundingSphere();

  const radius = geometry.boundingSphere.radius;
  console.log("현재 지오메트리 반지름:", radius);

  let scaleFactor = 1;

  // 원하는 조건에 따라 스케일값을 결정
  if (radius > 50) {
    scaleFactor = 0.004;  // 예: 매우 큰 모델이면 0.004배로 축소
  } else if (radius > 5) {
    scaleFactor = 0.04;   // 예: 큰 모델이면 0.04배로 축소
  }
  else if (radius > 0.5) {
    scaleFactor = 0.4;    // 예: 중간 정도 크기라면 0.4배로 축소
  } else if (radius > 0.05) {
    scaleFactor = 4;      // 예: 꽤 작은 모델이면 4배로 확대
  } 

  // 계산된 스케일 팩터를 적용
  geometry.scale(scaleFactor, scaleFactor, scaleFactor);
  geometry.userData.scaleFactor = scaleFactor;

}