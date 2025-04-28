// Dental Chart UI module
import { loadToothModel } from './modelSelectionUI.js';

// Accurate teeth position data (user-defined positions)
const teethPositions = {
  "11": { "x": 163.390625, "y": 30, "jawType": "upper" },
  "12": { "x": 137.4609375, "y": 53.59375, "jawType": "upper" },
  "13": { "x": 120.203125, "y": 73.8671875, "jawType": "upper" },
  "14": { "x": 109.7421875, "y": 101.8671875, "jawType": "upper" },
  "15": { "x": 101.0234375, "y": 125.6484375, "jawType": "upper" },
  "16": { "x": 92.2265625, "y": 155.578125, "jawType": "upper" },
  "17": { "x": 86.640625, "y": 188.890625, "jawType": "upper" },
  "21": { "x": 195.03125, "y": 32.921875, "jawType": "upper" },
  "22": { "x": 223.84375, "y": 50.1015625, "jawType": "upper" },
  "23": { "x": 240.015625, "y": 71.6875, "jawType": "upper" },
  "24": { "x": 252.4765625, "y": 101.90625, "jawType": "upper" },
  "25": { "x": 261.578125, "y": 129.3515625, "jawType": "upper" },
  "26": { "x": 265.7734375, "y": 160.765625, "jawType": "upper" },
  "27": { "x": 275.1015625, "y": 193.0234375, "jawType": "upper" },
  "31": { "x": 194.3046875, "y": 190, "jawType": "lower" },
  "32": { "x": 224.2734375, "y": 168.078125, "jawType": "lower" },
  "33": { "x": 244.9765625, "y": 135.4765625, "jawType": "lower" },
  "34": { "x": 262.703125, "y": 106, "jawType": "lower" },
  "35": { "x": 274.140625, "y": 75.453125, "jawType": "lower" },
  "36": { "x": 277.671875, "y": 45.515625, "jawType": "lower" },
  "37": { "x": 282.71875, "y": 13.09375, "jawType": "lower" },
  "41": { "x": 162.8203125, "y": 190, "jawType": "lower" },
  "42": { "x": 133.5, "y": 168.875, "jawType": "lower" },
  "43": { "x": 119.5859375, "y": 135.0625, "jawType": "lower" },
  "44": { "x": 103.6484375, "y": 106.34375, "jawType": "lower" },
  "45": { "x": 90.7734375, "y": 75.3125, "jawType": "lower" },
  "46": { "x": 79.2421875, "y": 45.25, "jawType": "lower" },
  "47": { "x": 68.5390625, "y": 13.34375, "jawType": "lower" },
};

/**
 * Create a tooth element in the UI
 * @param {string} id - The tooth ID
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {HTMLElement} container - The container element
 * @param {string} numberPosition - Position for the tooth number ('top' or 'bottom')
 */
function createTooth(id, x, y, container, numberPosition) {
  const toothElement = document.createElement('div');
  toothElement.className = 'tooth';
  toothElement.setAttribute('data-id', id);
  toothElement.style.left = `${x - 15}px`;  // Offset by half width (30px)
  toothElement.style.top = `${y - 22.5}px`;   // Offset by half height (45px)
  
  // Add tooth click event
  toothElement.addEventListener('click', () => {
    loadToothModel(id);
  });
  
  const imgElement = document.createElement('img');
  imgElement.className = 'tooth-image';
  imgElement.src = `/images/${id}.png`;
  imgElement.alt = `Tooth ${id}`;
  toothElement.appendChild(imgElement);

  const numberElement = document.createElement('div');
  numberElement.className = 'tooth-number';
  numberElement.textContent = id;

  // Dynamically determine position of tooth number
  // Extract last digit of ID (e.g., 18 -> 8, 21 -> 1)
  const lastDigit = id % 10;
  
  // Check upper/lower jaw
  const isUpper = numberPosition === 'top';
  
  // Position based on tooth type (1,2 = vertical, 7,8 = horizontal)
  if (lastDigit <= 2) {
    // Anterior teeth (1, 2) - vertical direction
    if (isUpper) {
      numberElement.style.top = '-9px';
      numberElement.style.left = '8px'; // Slight offset from center
    } else {
      numberElement.style.bottom = '-9px';
      numberElement.style.left = '8px'; // Slight offset from center
    }
  } else if (lastDigit >= 7) {
    // Posterior teeth (7, 8) - horizontal direction
    if (id < 30) { // Upper jaw
      if (id < 20) { // Left side
        numberElement.style.left = '-9px';
      } else { // Right side
        numberElement.style.right = '-9px';
      }
    } else { // Lower jaw
      if (id < 40) { // Right side
        numberElement.style.right = '-9px';
      } else { // Left side
        numberElement.style.left = '-9px';
      }
    }
    numberElement.style.top = '15px'; // Centered vertically
  } else {
    // Middle teeth (3~6) - gradually changing position
    const ratio = (lastDigit - 2) / 5; // 0(tooth #3) to 0.8(tooth #6) ratio
    
    if (id < 30) { // Upper jaw
      if (id < 20) { // Left side
        numberElement.style.left = `${-9 * ratio}px`;
        numberElement.style.top = `${-9 * (1 - ratio)}px`;
      } else { // Right side
        numberElement.style.right = `${-9 * ratio}px`;
        numberElement.style.top = `${-9 * (1 - ratio)}px`;
      }
    } else { // Lower jaw
      if (id < 40) { // Right side
        numberElement.style.right = `${-9 * ratio}px`;
        numberElement.style.bottom = `${-9 * (1 - ratio)}px`;
      } else { // Left side
        numberElement.style.left = `${-9 * ratio}px`;
        numberElement.style.bottom = `${-9 * (1 - ratio)}px`;
      }
    }
  }

  toothElement.appendChild(numberElement);
  container.appendChild(toothElement);
}

/**
 * Highlight the selected tooth in the UI
 * @param {string} toothId - The tooth ID to highlight
 */
export function highlightSelectedTooth(toothId) {
  // Remove highlight from all teeth
  document.querySelectorAll('.tooth').forEach(tooth => {
    tooth.classList.remove('selected');
  });
  
  // Add highlight to selected tooth
  const selectedTooth = document.querySelector(`.tooth[data-id="${toothId}"]`);
  if (selectedTooth) {
    selectedTooth.classList.add('selected');
  }
}

/**
 * Creates the dental chart UI
 */
export function createDentalChartUI() {
  // Create dental chart container
  const dentalChartContainer = document.createElement('div');
  dentalChartContainer.id = 'dental-chart-container';
  document.body.appendChild(dentalChartContainer);

  // Add styles
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    #dental-chart-container {
      position: fixed;
      left: 20px;
      top: 50%;
      transform: translateY(-50%);
      width: 350px;
      background-color: white;
      border-radius: 10px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
      z-index: 1000;
      pointer-events: auto;
    }
    .jaw-label {
      text-align: center;
      margin: 20px 0 10px;
      font-size: 16px;
      font-weight: bold;
      color: #333;
    }
    .teeth-container {
      position: relative;
      height: 240px;
      margin: 0 auto;
      width: 100%;
    }
    .tooth {
      position: absolute;
      width: 30px;
      height: 45px;
      transition: transform 0.2s;
      display: flex;
      flex-direction: column;
      align-items: center;
      z-index: 10;
      cursor: pointer;
    }
    .tooth:hover {
      transform: scale(1.1);
    }
    .tooth.selected {
      border: 2px solid #FF5722;
      border-radius: 8px;
      background-color: rgba(255, 87, 34, 0.1);
    }
    .tooth-image {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .tooth-number {
      position: absolute;
      width: 15px;
      height: 15px;
      border-radius: 50%;
      background-color: #4691E0;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: bold;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      z-index: 20;
    }
    .selected-path {
      position: absolute;
      pointer-events: none;
      z-index: -1;
    }
  `;
  document.head.appendChild(styleElement);

  // Create upper jaw section
  const upperJawLabel = document.createElement('div');
  upperJawLabel.className = 'jaw-label';
  upperJawLabel.textContent = '상악';
  dentalChartContainer.appendChild(upperJawLabel);

  const upperJawContainer = document.createElement('div');
  upperJawContainer.className = 'teeth-container';
  upperJawContainer.id = 'upper-jaw';
  dentalChartContainer.appendChild(upperJawContainer);

  // Create lower jaw section
  const lowerJawLabel = document.createElement('div');
  lowerJawLabel.className = 'jaw-label';
  lowerJawLabel.textContent = '하악';
  dentalChartContainer.appendChild(lowerJawLabel);

  const lowerJawContainer = document.createElement('div');
  lowerJawContainer.className = 'teeth-container';
  lowerJawContainer.id = 'lower-jaw';
  dentalChartContainer.appendChild(lowerJawContainer);

  // Place upper jaw teeth (using user-defined positions)
  for (let id = 11; id <= 18; id++) {
    if (teethPositions[id]) {
      createTooth(id, teethPositions[id].x, teethPositions[id].y, upperJawContainer, 'top');
    }
  }

  for (let id = 21; id <= 28; id++) {
    if (teethPositions[id]) {
      createTooth(id, teethPositions[id].x, teethPositions[id].y, upperJawContainer, 'top');
    }
  }

  // Place lower jaw teeth (using user-defined positions)
  for (let id = 31; id <= 38; id++) {
    if (teethPositions[id]) {
      createTooth(id, teethPositions[id].x, teethPositions[id].y, lowerJawContainer, 'bottom');
    }
  }

  for (let id = 41; id <= 48; id++) {
    if (teethPositions[id]) {
      createTooth(id, teethPositions[id].x, teethPositions[id].y, lowerJawContainer, 'bottom');
    }
  }
}