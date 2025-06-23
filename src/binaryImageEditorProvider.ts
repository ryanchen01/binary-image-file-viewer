import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Custom editor provider responsible for rendering binary image files in a
 * readonly webview. The provider reads slices of the file on demand and sends
 * them to the webview for visualization.
 */
export class BinaryImageEditorProvider implements vscode.CustomReadonlyEditorProvider {
    constructor(private readonly context: vscode.ExtensionContext) {}

    /**
     * Register the provider with VS Code.
     *
     * @param context Extension context used to create the provider.
     * @returns Disposable that unregisters the provider.
     */
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new BinaryImageEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            'binaryImageViewer.editor',
            provider
        );
        return providerRegistration;
    }

    /**
     * Create a simple custom document representation. The provider does not
     * modify the file so the document only exposes its URI.
     */
    public async openCustomDocument(
        uri: vscode.Uri,
        _openContext: vscode.CustomDocumentOpenContext,
        _token: vscode.CancellationToken
    ): Promise<vscode.CustomDocument> {
        return {
            uri,
            dispose: () => {}
        };
    }

    /**
     * Resolve the custom editor by wiring up the webview and responding to
     * messages from the client side.
     */
    public async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Configure webview
        webviewPanel.webview.options = {
            enableScripts: true,
        };

        // Generate a nonce for CSP
        const nonce = getNonce();

        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'ready':
                        // Send initial file data when webview is ready
                        await this.sendFileData(webviewPanel.webview, document.uri);
                        break;
                    case 'readSlice':
                        // Read a specific slice from the file
                        await this.readSlice(
                            webviewPanel.webview,
                            document.uri,
                            message.width,
                            message.height,
                            message.slice,
                            message.dataType,
                            message.endianness
                        );
                        break;
                    case 'calculateSlices':
                        try {
                            const stats = await vscode.workspace.fs.stat(document.uri);
                            const count = this.calculateMaxSlices(
                                stats.size,
                                message.width,
                                message.height,
                                message.dataType
                            );
                            webviewPanel.webview.postMessage({
                                type: 'sliceCount',
                                count
                            });
                        } catch (error) {
                            webviewPanel.webview.postMessage({
                                type: 'sliceCount',
                                count: 0
                            });
                        }
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        // Set the HTML content after registering the message listener to ensure
        // we receive the initial 'ready' message from the webview.
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, nonce);
    }

    /**
     * Send basic file information to the webview so that the UI can display
     * name and size before any slice data is requested.
     */
    private async sendFileData(webview: vscode.Webview, uri: vscode.Uri): Promise<void> {
        try {
            const stats = await vscode.workspace.fs.stat(uri);
            webview.postMessage({
                type: 'fileInfo',
                fileSize: stats.size,
                fileName: path.basename(uri.fsPath)
            });
        } catch (error) {
            webview.postMessage({
                type: 'error',
                message: `Failed to read file info: ${error}`
            });
        }
    }

    /**
     * Calculate how many slices are available in a file based on its size and
     * image metadata.
     */
    private calculateMaxSlices(fileSize: number, width: number, height: number, dataType: string): number {
        const bytesPerPixel = this.getBytesPerPixel(dataType);
        const sliceSize = width * height * bytesPerPixel;
        return Math.floor(fileSize / sliceSize);
    }

    /**
     * Read a specific slice from the binary file and send it to the webview.
     *
     * @param webview Target webview to post the slice data to.
     * @param uri URI of the file being read.
     * @param width Width of the image in pixels.
     * @param height Height of the image in pixels.
     * @param slice Slice index to read.
     * @param dataType Datatype of each pixel.
     * @param endianness True for little-endian, false for big-endian.
     */
    private async readSlice(
        webview: vscode.Webview,
        uri: vscode.Uri,
        width: number,
        height: number,
        slice: number,
        dataType: string,
        endianness: boolean = true
    ): Promise<void> {
        try {
            const bytesPerPixel = this.getBytesPerPixel(dataType);
            const sliceSize = width * height * bytesPerPixel;
            const offset = slice * sliceSize;

            // Read the file data
            const fileData = await vscode.workspace.fs.readFile(uri);
            
            if (offset + sliceSize > fileData.length) {
                throw new Error('Slice extends beyond file size');
            }

            // Extract the slice data
            const sliceData = fileData.slice(offset, offset + sliceSize);

            // Convert to the appropriate format and send to webview
            webview.postMessage({
                type: 'sliceData',
                data: Array.from(sliceData),
                width,
                height,
                slice,
                dataType,
                endianness
            });
        } catch (error) {
            webview.postMessage({
                type: 'error',
                message: `Failed to read slice: ${error}`
            });
        }
    }

    /**
     * Return the number of bytes that a pixel of the given type occupies.
     */
    private getBytesPerPixel(dataType: string): number {
        switch (dataType) {
            case 'uint8':
                return 1;
            case 'uint16':
            case 'int16':
                return 2;
            case 'float32':
            case 'int32':
                return 4;
            case 'float64':
                return 8;
            default:
                return 4; // default to float32
        }
    }

    /**
     * Generate the HTML used for the webview panel. The markup includes the UI
     * and scripts required to display and navigate image slices.
     * @param nonce Nonce for CSP
     */
    private getHtmlForWebview(webview: vscode.Webview, nonce: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob:; script-src 'nonce-${nonce}' blob:; worker-src blob:; style-src 'unsafe-inline' ${webview.cspSource}; font-src ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Binary Image Viewer</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            margin: 0;
            padding: 20px;
        }
        
        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        
        .controls {
            display: flex;
            gap: 10px;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 20px;
        }
        
        .control-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        
        .control-group label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        
        .control-group input, .control-group select {
            padding: 4px 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
        }
        
        .content {
            display: flex;
            flex: 1;
            gap: 20px;
        }
        
        .canvas-container {
            flex: 2;
            display: flex;
            justify-content: center;
            align-items: center;
            border: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editor-background);
            min-height: 400px;
            overflow: hidden;
        }
        
        #imageCanvas {
            max-width: 100%;
            max-height: 100%;
            width: auto;
            height: auto;
            object-fit: contain;
            image-rendering: pixelated;
        }
        
        .sidebar {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        
        .info-panel {
            padding: 15px;
            background-color: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
        }

        .window-controls {
            display: flex;
            gap: 5px;
            align-items: center;
            margin-top: 10px;
        }

        #histogramCanvas {
            width: 100%;
            height: 100px;
            border: 1px solid var(--vscode-panel-border);
        }
        
        .info-panel h3 {
            margin: 0 0 10px 0;
            font-size: 14px;
            color: var(--vscode-foreground);
        }
        
        .info-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 12px;
        }
        
        .error {
            color: var(--vscode-errorForeground);
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
        }
        
        button {
            padding: 6px 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
        }
        
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        button:disabled {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="controls">
            <div class="control-group">
                <label for="width">Width</label>
                <input type="number" id="width" placeholder="Enter width" min="1">
            </div>
            <div class="control-group">
                <label for="height">Height</label>
                <input type="number" id="height" placeholder="Enter height" min="1">
            </div>
            <div class="control-group">
                <label for="dataType">Data Type</label>
                <select id="dataType">
                    <option value="float32">float32</option>
                    <option value="uint8">uint8</option>
                    <option value="uint16">uint16</option>
                    <option value="int16">int16</option>
                    <option value="int32">int32</option>
                    <option value="float64">float64</option>
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
                <input type="range" id="sliceSlider" value="0" min="0" max="0" style="width: 100px;">
            </div>
            <div class="control-group">
                <label for="loadSlice">Load</label>
                <button id="loadSlice">Load Slice</button>
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
                </div>

                <div class="info-panel">
                    <h3>Windowing</h3>
                    <div class="window-controls">
                        <input type="range" id="windowMin" min="0" max="255" value="0">
                        <input type="range" id="windowMax" min="0" max="255" value="255">
                    </div>
                </div>

                <div id="errorPanel" class="error" style="display: none;">
                    <div id="errorMessage"></div>
                </div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        
        let fileInfo = null;
        let currentSliceData = null;
        let currentValues = null;

        // Histogram and worker code removed
        
        // DOM elements
        const widthInput = document.getElementById('width');
        const heightInput = document.getElementById('height');
        const dataTypeSelect = document.getElementById('dataType');
        const endiannessSelect = document.getElementById('endianness');
        const sliceInput = document.getElementById('slice');
        const sliceSlider = document.getElementById('sliceSlider');
        const loadSliceButton = document.getElementById('loadSlice');
        const canvas = document.getElementById('imageCanvas');
        const ctx = canvas.getContext('2d');
        const histogramCanvas = document.getElementById('histogramCanvas') as HTMLCanvasElement;
        if (!histogramCanvas) {
            console.error("Element with ID 'histogramCanvas' not found in the DOM.");
            return;
        }
        const histCtx = histogramCanvas.getContext('2d');
        const windowMinInput = document.getElementById('windowMin');
        const windowMaxInput = document.getElementById('windowMax');
        // const autoWindowButton = document.getElementById('autoWindow');
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

        windowMinInput.addEventListener('input', () => {
            if (currentValues) renderCurrent();
        });
        windowMaxInput.addEventListener('input', () => {
            if (currentValues) renderCurrent();
        });
        // autoWindowButton and histogram logic removed
        
        // Slice navigation event listeners
        sliceInput.addEventListener('input', syncSliceControls);
        sliceSlider.addEventListener('input', syncSliceControls);
        
        // Keyboard shortcuts for slice navigation
        document.addEventListener('keydown', handleKeyboard);
        
        // Mouse wheel navigation on canvas
        canvas.addEventListener('wheel', handleMouseWheel);
        
        // Handle window resize to rescale canvas
        window.addEventListener('resize', () => {
            if (currentSliceData) {
                setTimeout(scaleCanvasToFit, 100); // Small delay to ensure layout is complete
            }
        });
        
        // Message handling
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'fileInfo':
                    handleFileInfo(message);
                    break;
                case 'sliceData':
                    handleSliceData(message);
                    break;
                case 'sliceCount':
                    numSlicesEl.textContent = String(message.count);
                    sliceInput.max = sliceSlider.max = String(Math.max(0, message.count - 1));
                    break;
                case 'error':
                    showError(message.message);
                    break;
            }
        });
        
        function handleFileInfo(info) {
            fileInfo = info;
            fileNameEl.textContent = info.fileName;
            fileSizeEl.textContent = formatBytes(info.fileSize);
            updateSliceInfo(); // Update slice information when file info is available
            hideError();
        }
        
        function handleSliceData(data) {
            currentSliceData = data;
            const { width, height, dataType } = data;
            const rawData = new Uint8Array(data.data);
            const endianness = endiannessSelect.value === 'little';
            currentValues = parseDataType(rawData, dataType, endianness);
            const { min, max } = findMinMax(currentValues);
            windowMinInput.value = min;
            windowMaxInput.value = max;
            renderCurrent();
            currentSliceEl.textContent = data.slice;
            dimensionsEl.textContent = data.width + ' x ' + data.height;
            hideError();
        }
        
        function loadSlice() {
            const width = parseInt(widthInput.value);
            const height = parseInt(heightInput.value);
            const slice = parseInt(sliceInput.value);
            const dataType = dataTypeSelect.value;
            const endianness = endiannessSelect.value === 'little';

            const invalid =
                Number.isNaN(width) ||
                Number.isNaN(height) ||
                Number.isNaN(slice) ||
                width <= 0 ||
                height <= 0 ||
                slice < 0;

            if (invalid) {
                showError('Please enter valid positive integer values for width, height, and slice.');
                return;
            }
            
            vscode.postMessage({
                type: 'readSlice',
                width,
                height,
                slice,
                dataType,
                endianness
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
            
            // Auto-load slice when using slider or when pressing Enter in input
            if (sourceElement === sliceSlider || (sourceElement === sliceInput && event.type === 'keydown' && event.key === 'Enter')) {
                loadSlice();
            }
        }
        
        function handleKeyboard(event) {
            // Only handle navigation if canvas or document is focused
            if (document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement !== sliceInput) {
                return; // Don't interfere with other input fields
            }
            
            const currentSlice = parseInt(sliceInput.value);
            const maxSlice = parseInt(sliceInput.max);
            
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (currentSlice > 0) {
                    navigateToSlice(currentSlice - 1);
                }
            } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                if (currentSlice < maxSlice) {
                    navigateToSlice(currentSlice + 1);
                }
            }
        }
        
        function handleMouseWheel(event) {
            event.preventDefault();
            
            const currentSlice = parseInt(sliceInput.value);
            const maxSlice = parseInt(sliceInput.max);
            
            if (event.deltaY < 0 && currentSlice > 0) {
                // Scroll up - previous slice
                navigateToSlice(currentSlice - 1);
            } else if (event.deltaY > 0 && currentSlice < maxSlice) {
                // Scroll down - next slice
                navigateToSlice(currentSlice + 1);
            }
        }
        
        function navigateToSlice(newSlice) {
            sliceInput.value = newSlice;
            sliceSlider.value = newSlice;
            loadSlice();
        }
        
        function renderCurrent() {
            if (!currentValues) return;
            const width = parseInt(widthInput.value);
            const height = parseInt(heightInput.value);

            canvas.width = width;
            canvas.height = height;

            const imageData = ctx.createImageData(width, height);
            const pixels = imageData.data;

            const wMin = parseFloat(windowMinInput.value);
            const wMax = parseFloat(windowMaxInput.value);

            for (let i = 0; i < currentValues.length; i++) {
                let normalized = (currentValues[i] - wMin) / (wMax - wMin);
                if (normalized < 0) normalized = 0;
                if (normalized > 1) normalized = 1;
                const grayscale = Math.floor(normalized * 255);
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
            const containerWidth = containerRect.width - 40; // Account for padding and border
            const containerHeight = containerRect.height - 40;
            
            const imageWidth = canvas.width;
            const imageHeight = canvas.height;
            
            if (imageWidth > 0 && imageHeight > 0 && containerWidth > 0 && containerHeight > 0) {
                // Calculate scaling factor to fit the image in the container
                const scaleX = containerWidth / imageWidth;
                const scaleY = containerHeight / imageHeight;
                const scale = Math.min(scaleX, scaleY);
                
                // Apply scaling
                const displayWidth = Math.floor(imageWidth * scale);
                const displayHeight = Math.floor(imageHeight * scale);
                
                canvas.style.width = displayWidth + 'px';
                canvas.style.height = displayHeight + 'px';
            }
        }
        
        function parseDataType(buffer, dataType, endianness = true) {
            const view = new DataView(buffer.buffer);
            const values = [];
            let bytesPerPixel, getValue;
            
            switch (dataType) {
                case 'uint8':
                    bytesPerPixel = 1;
                    getValue = (offset) => view.getUint8(offset);
                    break;
                case 'uint16':
                    bytesPerPixel = 2;
                    getValue = (offset) => view.getUint16(offset, endianness);
                    break;
                case 'int16':
                    bytesPerPixel = 2;
                    getValue = (offset) => view.getInt16(offset, endianness);
                    break;
                case 'float32':
                    bytesPerPixel = 4;
                    getValue = (offset) => view.getFloat32(offset, endianness);
                    break;
                case 'int32':
                    bytesPerPixel = 4;
                    getValue = (offset) => view.getInt32(offset, endianness);
                    break;
                case 'float64':
                    bytesPerPixel = 8;
                    getValue = (offset) => view.getFloat64(offset, endianness);
                    break;
                default:
                    throw new Error(\`Unsupported data type: \${dataType}\`);
            }
            
            for (let i = 0; i < buffer.length; i += bytesPerPixel) {
                values.push(getValue(i));
            }
            
            return values;
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
        // requestHistogram and drawHistogram removed
        
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
                vscode.postMessage({
                    type: 'calculateSlices',
                    width,
                    height,
                    dataType
                });
            } else {
                numSlicesEl.textContent = '-';
                sliceInput.max = '';
                sliceSlider.max = '0';
            }
        }
        
        function getBytesPerPixel(dataType) {
            switch (dataType) {
                case 'uint8':
                    return 1;
                case 'uint16':
                case 'int16':
                    return 2;
                case 'float32':
                case 'int32':
                    return 4;
                case 'float64':
                    return 8;
                default:
                    return 4; // default to float32
            }
        }
        
        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        // Initialize
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}

/**
 * Generate a nonce for CSP.
 */
function getNonce(length = 32): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < length; i++) {
        nonce += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return nonce;
}
