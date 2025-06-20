import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class BinaryImageEditorProvider implements vscode.CustomReadonlyEditorProvider {
    constructor(private readonly context: vscode.ExtensionContext) {}

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new BinaryImageEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            'binaryImageViewer.editor',
            provider
        );
        return providerRegistration;
    }

    public async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CustomDocument> {
        return {
            uri,
            dispose: () => {}
        };
    }

    public async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        token: vscode.CancellationToken
    ): Promise<void> {
        // Configure webview
        webviewPanel.webview.options = {
            enableScripts: true,
        };

        // Set the HTML content
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

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
                            message.dataType
                        );
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );
    }

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

    private calculateMaxSlices(fileSize: number, width: number, height: number, dataType: string): number {
        const bytesPerPixel = this.getBytesPerPixel(dataType);
        const sliceSize = width * height * bytesPerPixel;
        return Math.floor(fileSize / sliceSize);
    }

    private async readSlice(
        webview: vscode.Webview,
        uri: vscode.Uri,
        width: number,
        height: number,
        slice: number,
        dataType: string
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
                dataType
            });
        } catch (error) {
            webview.postMessage({
                type: 'error',
                message: `Failed to read slice: ${error}`
            });
        }
    }

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

    private getHtmlForWebview(webview: vscode.Webview): string {
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
                <label for="slice">Slice</label>
                <input type="number" id="slice" value="0" min="0">
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
        
        // DOM elements
        const widthInput = document.getElementById('width');
        const heightInput = document.getElementById('height');
        const dataTypeSelect = document.getElementById('dataType');
        const sliceInput = document.getElementById('slice');
        const loadSliceButton = document.getElementById('loadSlice');
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
            
            if (width <= 0 || height <= 0 || slice < 0) {
                showError('Please enter valid positive values for width, height, and slice.');
                return;
            }
            
            vscode.postMessage({
                type: 'readSlice',
                width,
                height,
                slice,
                dataType
            });
        }
        
        function renderSlice(data) {
            const { width, height, dataType } = data;
            const rawData = new Uint8Array(data.data);
            
            // Set canvas actual size (for drawing)
            canvas.width = width;
            canvas.height = height;
            
            // Create image data
            const imageData = ctx.createImageData(width, height);
            const pixels = imageData.data;
            
            // Convert binary data to grayscale pixels
            const values = parseDataType(rawData, dataType);
            const { min, max } = findMinMax(values);
            
            for (let i = 0; i < values.length; i++) {
                const normalized = (values[i] - min) / (max - min);
                const grayscale = Math.floor(normalized * 255);
                
                const pixelIndex = i * 4;
                pixels[pixelIndex] = grayscale;     // R
                pixels[pixelIndex + 1] = grayscale; // G
                pixels[pixelIndex + 2] = grayscale; // B
                pixels[pixelIndex + 3] = 255;       // A
            }
            
            ctx.putImageData(imageData, 0, 0);
            
            // Scale canvas to fit container after rendering
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
        
        function parseDataType(buffer, dataType) {
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
                    getValue = (offset) => view.getUint16(offset, true); // little endian
                    break;
                case 'int16':
                    bytesPerPixel = 2;
                    getValue = (offset) => view.getInt16(offset, true);
                    break;
                case 'float32':
                    bytesPerPixel = 4;
                    getValue = (offset) => view.getFloat32(offset, true);
                    break;
                case 'int32':
                    bytesPerPixel = 4;
                    getValue = (offset) => view.getInt32(offset, true);
                    break;
                case 'float64':
                    bytesPerPixel = 8;
                    getValue = (offset) => view.getFloat64(offset, true);
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
                const sliceSize = width * height * bytesPerPixel;
                const numSlices = Math.floor(fileInfo.fileSize / sliceSize);
                
                numSlicesEl.textContent = numSlices.toString();
                sliceInput.max = Math.max(0, numSlices - 1).toString();
                
                // Reset slice to 0 if current slice exceeds available slices
                if (parseInt(sliceInput.value) >= numSlices) {
                    sliceInput.value = '0';
                }
            } else {
                numSlicesEl.textContent = '-';
                sliceInput.max = '';
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
