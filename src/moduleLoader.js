// src/moduleLoader.js

/**
 * 모듈을 동적으로 로드하는 헬퍼 함수
 * @param {string} modulePath - 로드할 모듈의 경로
 * @returns {Promise} - 모듈이 로드되면 해결되는 Promise
 */
export function loadModuleScript(modulePath) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = modulePath;
      
      script.onload = () => {
        console.log(`모듈 로드 완료: ${modulePath}`);
        resolve();
      };
      
      script.onerror = (error) => {
        console.error(`모듈 로드 실패: ${modulePath}`, error);
        reject(error);
      };
      
      document.head.appendChild(script);
    });
  }
  
  /**
   * 여러 모듈을 동시에 로드하는 함수
   * @param {Array<string>} modulePaths - 로드할 모듈 경로 배열
   * @returns {Promise} - 모든 모듈이 로드되면 해결되는 Promise
   */
  export function loadModules(modulePaths) {
    const loadPromises = modulePaths.map(path => loadModuleScript(path));
    return Promise.all(loadPromises);
  }
  
  /**
   * 모듈을 로드하고 모듈에서 export한 함수들을 전역(window)에 등록하는 함수
   * @param {string} modulePath - 로드할 모듈 경로
   * @param {Array<string>} exportNames - export된 함수 이름들
   * @returns {Promise} - 모듈 로드 및 함수 등록이 완료되면 해결되는 Promise
   */
  export function loadModuleExports(modulePath, exportNames) {
    return new Promise((resolve, reject) => {
      // 고유한 콜백 함수 이름 생성
      const callbackName = `onModuleLoaded_${Math.random().toString(36).substring(2, 11)}`;
      
      // 전역 콜백 함수 정의
      window[callbackName] = (exports) => {
        // 내보낸 함수들을 전역에 등록
        exportNames.forEach(name => {
          if (exports[name]) {
            window[name] = exports[name];
          } else {
            console.warn(`모듈 ${modulePath}에서 ${name} 함수를 찾을 수 없습니다.`);
          }
        });
        
        // 콜백 함수 제거
        delete window[callbackName];
        
        // Promise 해결
        resolve(exports);
      };
      
      // 모듈 스크립트 생성
      const script = document.createElement('script');
      script.type = 'module';
      script.textContent = `
        import * as moduleExports from '${modulePath}';
        window['${callbackName}'](moduleExports);
      `;
      
      script.onerror = (error) => {
        delete window[callbackName];
        console.error(`모듈 로드 실패: ${modulePath}`, error);
        reject(error);
      };
      
      document.head.appendChild(script);
    });
  }