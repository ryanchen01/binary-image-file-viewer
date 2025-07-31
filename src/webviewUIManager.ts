import { CONSTANTS } from './constants';

/**
 * Handles HTML generation and webview communication
 */
export class WebviewUIManager {

    /**
     * Generate the HTML used for the webview panel
     */
    public getHtmlForWebview(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Binary Image Viewer</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            margin: 0;
            padding: 24px;
            overflow: hidden;
        }
        
        .container {
            display: flex;
            flex-direction: column;
            height: calc(100vh - 48px);
            max-width: 1400px;
            margin: 0 auto;
        }
        
        .controls {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            align-items: flex-start;
            padding: 16px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 24px;
        }
        
        .control-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 0;
        }
        
        .control-group label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            white-space: nowrap;
        }
        
        .control-group input[type="number"] {
            width: 80px;
            padding: 6px 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            font-size: 13px;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
            box-sizing: border-box;
        }
        
        .control-group input[type="range"] {
            width: 100%;
            padding: 0;
            background-color: transparent;
            border: none;
            border-radius: 0;
            cursor: pointer;
        }
        
        .control-group select {
            width: 120px;
            padding: 6px 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            font-size: 13px;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
            box-sizing: border-box;
            cursor: pointer;
        }
        
        .control-group input:focus,
        .control-group select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }
        
        .control-group input:hover,
        .control-group select:hover {
            border-color: var(--vscode-input-border-hover);
        }
        
        .content {
            display: flex;
            flex: 1;
            gap: 24px;
            min-height: 0;
        }
        
        .canvas-container {
            flex: 1;
            display: flex;
            justify-content: center;
            align-items: center;
            border: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editor-background);
            min-height: 400px;
            overflow: hidden;
            border-radius: 6px;
            position: relative;
        }
        
        #imageCanvas {
            max-width: 100%;
            max-height: 100%;
            width: auto;
            height: auto;
            object-fit: contain;
            image-rendering: pixelated;
            transition: transform 0.3s ease;
        }
        
        .sidebar {
            width: 320px;
            display: flex;
            flex-direction: column;
            gap: 20px;
            flex-shrink: 0;
        }
        
        .info-panel {
            padding: 16px;
            background-color: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .info-panel h3 {
            margin: 0 0 12px 0;
            font-size: 13px;
            color: var(--vscode-foreground);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .info-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            font-size: 12px;
            padding: 4px 0;
        }
        
        .info-item span:first-child {
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
        }
        
        .info-item span:last-child {
            color: var(--vscode-foreground);
            font-family: var(--vscode-editor-font-family);
            font-weight: 600;
        }
        
        .error {
            color: var(--vscode-errorForeground);
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 12px 16px;
            border-radius: 6px;
            margin: 10px 0;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            font-size: 12px;
            line-height: 1.4;
        }
        
        .window-controls {
            margin-top: 20px;
            padding-top: 16px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        
        .window-controls .control-group {
            margin-bottom: 12px;
        }
        
        .window-controls .control-group:last-child {
            margin-bottom: 0;
        }
        
        button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s ease;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
        }
        
        button:active {
            transform: translateY(0);
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }
        
        button:disabled {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="controls">
            <div class="control-group">
                <label for="width">Width</label>
                <input type="number" id="width" placeholder="Width" min="1">
            </div>
            <div class="control-group">
                <label for="height">Height</label>
                <input type="number" id="height" placeholder="Height" min="1">
            </div>
            <div class="control-group">
                <label for="dataType">Data Type</label>
                <select id="dataType">
                    <option value="float32">float32</option>
                    <option value="float64">float64</option>
                    <option value="uint8">uint8</option>
                    <option value="int8">int8</option>
                    <option value="uint16">uint16</option>
                    <option value="int16">int16</option>
                    <option value="uint32">uint32</option>
                    <option value="int32">int32</option>
                </select>
            </div>
            <div class="control-group">
                <label for="endianness">Endianness</label>
                <select id="endianness">
                    <option value="little">Little-Endian</option>
                    <option value="big">Big-Endian</option>
                </select>
            </div>
            <div class="control-group">
                <label for="slice">Slice</label>
                <input type="number" id="slice" value="0" min="0">
            </div>
            <div class="control-group">
                <label for="sliceSlider">Navigate</label>
                <input type="range" id="sliceSlider" value="0" min="0" max="0" style="width: 150px;margin-top: 6px;">
            </div>
            <div class="control-group">
                <button id="loadSlice" style="margin-top: 20px;">Load Slice</button>
            </div>
        </div>
        
        <div class="content">
            <div class="canvas-container">
                <canvas id="imageCanvas"></canvas>
            </div>
            
            <div class="sidebar">
                <div class="info-panel">
                    <h3>File Information</h3>
                    <div class="info-item">
                        <span>File Name:</span>
                        <span id="fileName">-</span>
                    </div>
                    <div class="info-item">
                        <span>File Size:</span>
                        <span id="fileSize">-</span>
                    </div>
                    <div class="info-item">
                        <span>Number of Slices:</span>
                        <span id="numSlices">-</span>
                    </div>
                    <div class="info-item">
                        <span>Current Slice:</span>
                        <span id="currentSlice">-</span>
                    </div>
                    <div class="info-item">
                        <span>Dimensions:</span>
                        <span id="dimensions">-</span>
                    </div>
                    <div class="window-controls">
                        <h3>Window/Level Controls</h3>
                        <div class="control-group">
                            <label for="windowMin">Window Min</label>
                            <input type="range" id="windowMin" value="0" min="0" max="255">
                        </div>
                        <div class="control-group">
                            <label for="windowMax">Window Max</label>
                            <input type="range" id="windowMax" value="255" min="0" max="255">
                        </div>
                        <div class="control-group">
                            <label>&nbsp;</label>
                            <button id="resetWindow">Reset</button>
                        </div>
                        <div class="control-group">
                            <label>&nbsp;</label>
                            <button id="togglePlane">Plane: Axial</button>
                        </div>
                    </div>
                </div>
                
                <div id="errorPanel" class="error" style="display: none;">
                    <div id="errorMessage"></div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        let fileInfo = null;
        let currentSliceData = null;
        let sliceMin = 0;
        let sliceMax = 0;
        let windowMin = null;
        let windowMax = null;
        let globalComputed = false;
        let currentPlane = 'axial';
        
        // DOM elements
        const widthInput = document.getElementById('width');
        const heightInput = document.getElementById('height');
        const dataTypeSelect = document.getElementById('dataType');
        const endiannessSelect = document.getElementById('endianness');
        const sliceInput = document.getElementById('slice');
        const sliceSlider = document.getElementById('sliceSlider');
        const loadSliceButton = document.getElementById('loadSlice');
        const windowMinInput = document.getElementById('windowMin');
        const windowMaxInput = document.getElementById('windowMax');
        const resetWindowButton = document.getElementById('resetWindow');
        const togglePlaneButton = document.getElementById('togglePlane');
        const canvas = document.getElementById('imageCanvas');
        const ctx = canvas.getContext('2d');
        const errorPanel = document.getElementById('errorPanel');
        const errorMessage = document.getElementById('errorMessage');
        
        // Info display elements
        const fileNameEl = document.getElementById('fileName');
        const fileSizeEl = document.getElementById('fileSize');
        const numSlicesEl = document.getElementById('numSlices');
        const currentSliceEl = document.getElementById('currentSlice');
        const dimensionsEl = document.getElementById('dimensions');
        
        // Event listeners
        loadSliceButton.addEventListener('click', loadSlice);
        widthInput.addEventListener('input', updateSliceInfo);
        heightInput.addEventListener('input', updateSliceInfo);
        dataTypeSelect.addEventListener('change', updateSliceInfo);
        
        // Slice navigation event listeners
        sliceInput.addEventListener('input', syncSliceControls);
        sliceSlider.addEventListener('input', syncSliceControls);
        windowMinInput.addEventListener('input', updateWindow);
        windowMaxInput.addEventListener('input', updateWindow);
        resetWindowButton.addEventListener('click', resetWindow);
        togglePlaneButton.addEventListener('click', togglePlane);
        
        // Keyboard shortcuts for slice navigation
        document.addEventListener('keydown', handleKeyboard);
        
        // Mouse wheel navigation on canvas
        canvas.addEventListener('wheel', handleMouseWheel, { passive: false });        
        
        // Handle window resize to rescale canvas
        window.addEventListener('resize', () => {
            if (currentSliceData) {
                setTimeout(scaleCanvasToFit, 100);
            }
        });
        
        // Message handling
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case '${CONSTANTS.MESSAGE_TYPES.FILE_INFO}':
                    handleFileInfo(message);
                    break;
                case '${CONSTANTS.MESSAGE_TYPES.SLICE_DATA}':
                    handleSliceData(message);
                    break;
                case '${CONSTANTS.MESSAGE_TYPES.WINDOW_DATA}':
                    sliceMin = message.windowMin;
                    sliceMax = message.windowMax;
                    windowMin = sliceMin;
                    windowMax = sliceMax;
                    updateWindowControls();
                    if (currentSliceData) {
                        renderSlice(currentSliceData);
                    }
                    break;
                case '${CONSTANTS.MESSAGE_TYPES.ERROR}':
                    showError(message.message);
                    break;
            }
        });
        
        function handleFileInfo(info) {
            fileInfo = info;
            fileNameEl.textContent = info.fileName;
            fileSizeEl.textContent = formatBytes(info.fileSize);
            updateSliceInfo();
            if (!globalComputed) {
                vscode.postMessage({
                    type: '${CONSTANTS.MESSAGE_TYPES.COMPUTE_GLOBAL_WINDOW}',
                    width: parseInt(widthInput.value),
                    height: parseInt(heightInput.value),
                    dataType: dataTypeSelect.value,
                    endianness: endiannessSelect.value === 'little'
                });
                globalComputed = true;
            }
            hideError();
        }
        
        function handleSliceData(data) {
            currentSliceData = data;
            renderSlice(data);
            currentSliceEl.textContent = data.slice;
            dimensionsEl.textContent = \`\${data.width} × \${data.height}\`;
            hideError();
        }
        
        function loadSlice() {
            const width = parseInt(widthInput.value);
            const height = parseInt(heightInput.value);
            const slice = parseInt(sliceInput.value);
            const dataType = dataTypeSelect.value;
            const endianness = endiannessSelect.value === 'little';
            
            if (width <= 0 || height <= 0 || slice < 0) {
                showError('Please enter valid positive values for width, height, and slice.');
                return;
            }
            
            vscode.postMessage({
                type: '${CONSTANTS.MESSAGE_TYPES.READ_SLICE}',
                width,
                height,
                slice,
                dataType,
                endianness,
                plane: currentPlane,
                forceReload: true
            });
        }
        
        function syncSliceControls(event) {
            const sourceElement = event.target;
            const newValue = parseInt(sourceElement.value);
            
            if (sourceElement === sliceInput) {
                sliceSlider.value = newValue;
            } else if (sourceElement === sliceSlider) {
                sliceInput.value = newValue;
            }
            
            if (sourceElement === sliceSlider || 
                (sourceElement === sliceInput && event.type === 'input')) {
                loadSlice();
            }
        }
        
        function handleKeyboard(event) {
            if (document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement !== sliceInput) {
                return;
            }
            
            const currentSlice = parseInt(sliceInput.value);
            const maxSlice = parseInt(sliceInput.max);
            
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (currentSlice > 0) {
                    navigateToSlice(currentSlice - 1);
                    loadSlice();
                }
            } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                if (currentSlice < maxSlice) {
                    navigateToSlice(currentSlice + 1);
                    loadSlice();
                }
            } else if (event.key === 'Enter' && document.activeElement === sliceInput) {
                loadSlice();
            }
        }
        
        function handleMouseWheel(event) {
            event.preventDefault();
            
            const currentSlice = parseInt(sliceInput.value);
            const maxSlice = parseInt(sliceInput.max);
            
            if (event.deltaY < 0 && currentSlice > 0) {
                navigateToSlice(currentSlice - 1);
                loadSlice();
            } else if (event.deltaY > 0 && currentSlice < maxSlice) {
                navigateToSlice(currentSlice + 1);
                loadSlice();
            }
        }
        
        function navigateToSlice(newSlice) {
            sliceInput.value = newSlice;
            sliceSlider.value = newSlice;
        }
        
        function renderSlice(data) {
            const { width, height, dataType } = data;
            const rawData = new Uint8Array(data.data);
            const endianness = endiannessSelect.value === 'little';

            canvas.width = width;
            canvas.height = height;

            const imageData = ctx.createImageData(width, height);
            const pixels = imageData.data;
            const view = new DataView(rawData.buffer, rawData.byteOffset, rawData.byteLength);

            let bytesPerPixel = 1;
            let getValue;
            switch (dataType) {
                case 'uint8':
                    bytesPerPixel = 1;
                    getValue = (offset) => view.getUint8(offset);
                    break;
                case 'int8':
                    bytesPerPixel = 1;
                    getValue = (offset) => view.getInt8(offset);
                    break;
                case 'uint16':
                    bytesPerPixel = 2;
                    getValue = (offset) => view.getUint16(offset, endianness);
                    break;
                case 'int16':
                    bytesPerPixel = 2;
                    getValue = (offset) => view.getInt16(offset, endianness);
                    break;
                case 'uint32':
                    bytesPerPixel = 4;
                    getValue = (offset) => view.getUint32(offset, endianness);
                    break;
                case 'int32':
                    bytesPerPixel = 4;
                    getValue = (offset) => view.getInt32(offset, endianness);
                    break;
                case 'float32':
                    bytesPerPixel = 4;
                    getValue = (offset) => view.getFloat32(offset, endianness);
                    break;
                case 'float64':
                    bytesPerPixel = 8;
                    getValue = (offset) => view.getFloat64(offset, endianness);
                    break;
                default:
                    throw new Error(\`Unsupported data type: \${dataType}\`);
            }

            const range = windowMax - windowMin || 1;
            const numPixels = width * height;
            for (let i = 0; i < numPixels; i++) {
                const value = getValue(i * bytesPerPixel);
                let normalized = (value - windowMin) / range;
                if (normalized < 0) normalized = 0;
                else if (normalized > 1) normalized = 1;
                const grayscale = Math.round(normalized * 255);

                const pixelIndex = i * 4;
                pixels[pixelIndex] = grayscale;
                pixels[pixelIndex + 1] = grayscale;
                pixels[pixelIndex + 2] = grayscale;
                pixels[pixelIndex + 3] = 255;
            }

            ctx.putImageData(imageData, 0, 0);
            scaleCanvasToFit();
        }
        
        function scaleCanvasToFit() {
            const container = canvas.parentElement;
            const containerRect = container.getBoundingClientRect();
            const containerWidth = containerRect.width - 40;
            const containerHeight = containerRect.height - 40;
            
            const imageWidth = canvas.width;
            const imageHeight = canvas.height;
            
            if (imageWidth > 0 && imageHeight > 0 && containerWidth > 0 && containerHeight > 0) {
                const scaleX = containerWidth / imageWidth;
                const scaleY = containerHeight / imageHeight;
                const scale = Math.min(scaleX, scaleY);
                
                const displayWidth = Math.floor(imageWidth * scale);
                const displayHeight = Math.floor(imageHeight * scale);
                
                canvas.style.width = displayWidth + 'px';
                canvas.style.height = displayHeight + 'px';
            }
        }
        
        function findMinMax(values) {
            let min = values[0];
            let max = values[0];
            
            for (let i = 1; i < values.length; i++) {
                if (values[i] < min) min = values[i];
                if (values[i] > max) max = values[i];
            }
            
            return { min, max };
        }
        
        function updateWindowControls() {
            let minVal = sliceMin;
            let maxVal = sliceMax;
            if (sliceMin === sliceMax) {
                minVal = sliceMin - 0.5;
                maxVal = sliceMax + 0.5;
            }
            windowMinInput.min = minVal;
            windowMinInput.max = maxVal;
            windowMaxInput.min = minVal;
            windowMaxInput.max = maxVal;
            windowMinInput.value = windowMin !== null ? windowMin : minVal;
            windowMaxInput.value = windowMax !== null ? windowMax : maxVal;
            const dataRange = maxVal - minVal;
            const step = dataRange / 255;
            windowMinInput.step = step;
            windowMaxInput.step = step;
        }
        
        function updateWindow() {
            windowMin = parseFloat(windowMinInput.value);
            windowMax = parseFloat(windowMaxInput.value);
            if (windowMin > windowMax) {
                const temp = windowMin;
                windowMin = windowMax;
                windowMax = temp;
            }
            if (currentSliceData) {
                renderSlice(currentSliceData);
            }
        }
        
        function resetWindow() {
            const width = parseInt(widthInput.value);
            const height = parseInt(heightInput.value);
            if (width > 0 && height > 0) {
                vscode.postMessage({
                    type: '${CONSTANTS.MESSAGE_TYPES.COMPUTE_GLOBAL_WINDOW}',
                    width,
                    height,
                    dataType: dataTypeSelect.value,
                    endianness: endiannessSelect.value === 'little'
                });
            }
            windowMin = sliceMin;
            windowMax = sliceMax;
            updateWindowControls();
            if (currentSliceData) {
                renderSlice(currentSliceData);
            }
        }
        
        function showError(message) {
            errorMessage.textContent = message;
            errorPanel.style.display = 'block';
        }
        
        function hideError() {
            errorPanel.style.display = 'none';
        }
        
        function updateSliceInfo() {
            if (!fileInfo) return;
            
            const width = parseInt(widthInput.value);
            const height = parseInt(heightInput.value);
            const dataType = dataTypeSelect.value;
            
            if (width > 0 && height > 0) {
                const bytesPerPixel = getBytesPerPixel(dataType);
                let numSlices, maxSlice;
                
                if (currentPlane === 'coronal') {
                    maxSlice = Math.max(0, height - 1);
                    numSlices = height;
                } else {
                    const sliceSize = width * height * bytesPerPixel;
                    numSlices = Math.floor(fileInfo.fileSize / sliceSize);
                    maxSlice = Math.max(0, numSlices - 1);
                }
                
                numSlicesEl.textContent = numSlices.toString();
                sliceInput.max = maxSlice.toString();
                sliceSlider.max = maxSlice.toString();
                
                if (parseInt(sliceInput.value) > maxSlice) {
                    sliceInput.value = '0';
                    sliceSlider.value = '0';
                }
            } else {
                numSlicesEl.textContent = '-';
                sliceInput.max = '';
                sliceSlider.max = '0';
            }
        }
        
        function getBytesPerPixel(dataType) {
            switch (dataType) {
                case 'uint8':
                case 'int8':
                    return 1;
                case 'uint16':
                case 'int16':
                    return 2;
                case 'float32':
                case 'uint32':
                case 'int32':
                    return 4;
                case 'float64':
                    return 8;
                default:
                    return 4;
            }
        }
        
        function togglePlane() {
            currentPlane = currentPlane === 'axial' ? 'coronal' : 'axial';
            togglePlaneButton.textContent = 'Plane: ' + currentPlane.charAt(0).toUpperCase() + currentPlane.slice(1);
            
            updateSliceInfo();
            
            sliceInput.value = '0';
            sliceSlider.value = '0';
            
            const width = parseInt(widthInput.value);
            const height = parseInt(heightInput.value);
            if (width > 0 && height > 0) {
                loadSlice();
            }
        }
        
        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        vscode.postMessage({ type: '${CONSTANTS.MESSAGE_TYPES.READY}' });
    </script>
</body>
</html>`;
    }
}