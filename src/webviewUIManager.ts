import { DATA_TYPES } from './dataTypes';
import { CONSTANTS } from './constants';
import { RENDER_WORKER_SOURCE } from './renderWorker';

/**
 * Handles HTML generation and webview communication
 */
export class WebviewUIManager {

    /**
     * Generate the HTML used for the webview panel
     */
    public getHtmlForWebview(cacheBudgetBytes: number = CONSTANTS.SLICE_CACHE_MEMORY_MB * 1024 * 1024): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Binary Image Viewer</title>
    <style>
        html {
            height: 100%;
            box-sizing: border-box;
        }

        *,
        *::before,
        *::after {
            box-sizing: inherit;
        }

        body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            margin: 0;
            padding: 24px;
            height: 100%;
            overflow: auto;
        }

        .container {
            display: flex;
            flex-direction: column;
            height: 100%;
            max-width: 1400px;
            min-height: 0;
            width: 100%;
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
            overflow: hidden;
            align-items: stretch;
        }

        .canvas-container {
            flex: 1;
            display: flex;
            justify-content: center;
            align-items: center;
            border: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editor-background);
            min-height: 0;
            overflow: hidden;
            border-radius: 6px;
            position: relative;
            min-width: 0;
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

        #imageContextMenu {
            position: fixed;
            z-index: 10;
            padding: 4px;
            max-width: calc(100vw - 8px);
            background-color: var(--vscode-menu-background, var(--vscode-editorWidget-background));
            color: var(--vscode-menu-foreground, var(--vscode-foreground));
            border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
            border-radius: 4px;
            box-shadow: 0 2px 8px var(--vscode-widget-shadow);
        }

        #copyImagePng {
            width: 100%;
            margin: 0;
            border: none;
            background: transparent;
            color: inherit;
            text-align: left;
            font: inherit;
            white-space: nowrap;
            text-transform: none;
            letter-spacing: normal;
            box-shadow: none;
        }

        #copyImagePng:hover:not(:disabled),
        #copyImagePng:focus-visible {
            background-color: var(--vscode-menu-selectionBackground);
            color: var(--vscode-menu-selectionForeground);
        }

        #copyImagePng:disabled {
            opacity: 0.5;
            cursor: default;
        }

        .side-panel {
            width: 320px;
            display: flex;
            flex-direction: column;
            gap: 20px;
            flex-shrink: 0;
            min-height: 0;
            overflow-y: auto;
        }

        .pixel-info .info-item {
            align-items: flex-start;
            gap: 12px;
        }

        .pixel-info .info-item span:last-child {
            min-width: 0;
            text-align: right;
            overflow-wrap: anywhere;
        }

        .side-panel--left {
            width: 260px;
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

        .info-subsection {
            margin-top: 16px;
            padding-top: 12px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .info-subsection h4 {
            margin: 0 0 10px 0;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
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
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .window-controls .control-group {
            margin-bottom: 0;
        }

        .window-controls .control-group:last-child {
            margin-bottom: 0;
        }

        @media (max-width: 1200px) {
            .content {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                grid-template-rows: minmax(320px, 1fr) auto;
                grid-template-areas:
                    "image image"
                    "left right";
                overflow: visible;
            }

            .side-panel {
                width: 100%;
                min-width: 0;
                overflow-wrap: anywhere;
                overflow: visible;
            }

            .side-panel--left {
                grid-area: left;
            }

            .side-panel--right {
                grid-area: right;
            }

            .canvas-container {
                grid-area: image;
                min-height: 320px;
            }
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
            <div class="control-group">
                <button id="reloadSlice" style="margin-top: 20px;">Reload</button>
            </div>
        </div>

        <div class="content">
            <div class="side-panel side-panel--left">
                <div class="info-panel">
                    <h3>File Information</h3>
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
                    <div class="info-subsection">
                        <h4>Statistics</h4>
                        <div class="info-item">
                            <span>Min:</span>
                            <span id="sliceStatMin">-</span>
                        </div>
                        <div class="info-item">
                            <span>Max:</span>
                            <span id="sliceStatMax">-</span>
                        </div>
                        <div class="info-item">
                            <span>Mean:</span>
                            <span id="sliceStatMean">-</span>
                        </div>
                        <div class="info-item">
                            <span>Sum:</span>
                            <span id="sliceStatSum">-</span>
                        </div>
                    </div>
                    <div class="info-subsection pixel-info">
                        <h4>Pixel</h4>
                        <div class="info-item">
                            <span>Position (x, y):</span>
                            <span id="pixelPosition">-</span>
                        </div>
                        <div class="info-item">
                            <span>Value:</span>
                            <span id="pixelValue">-</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="canvas-container">
                <canvas id="imageCanvas" tabindex="0" aria-label="Image preview"></canvas>
            </div>

            <div class="side-panel side-panel--right">
                <div class="info-panel">
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

    <div id="imageContextMenu" role="menu" aria-label="Image actions" style="display: none;">
        <button id="copyImagePng" type="button" role="menuitem">Copy Image as PNG</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const dataTypes = ${JSON.stringify(DATA_TYPES)};

        let fileInfo = null;
        let currentSliceData = null;
        let pixelInspection = null;
        let hoverPosition = null;
        let sliceMin = 0;
        let sliceMax = 0;
        let windowMin = null;
        let windowMax = null;
        let currentPlane = 'axial';
        let resizeAnimationFrame = null;
        let sliceRequestInFlight = false;
        let pendingSliceRequest = null;
        let activeSliceRequest = null;
        let prefetchRequestInFlight = false;
        let activePrefetchRequest = null;
        let prefetchQueue = [];
        let nextSliceRequestId = 1;
        const sliceCache = new Map();
        const inFlightPrefetchKeys = new Set();
        const PREFETCH_RADIUS = 5;
        const MAX_SLICE_CACHE_ENTRIES = 24;
        const MAX_SLICE_CACHE_BYTES = ${cacheBudgetBytes};
        let sliceCacheBytes = 0;
        let renderWorker = null;
        let workerSliceData = null;
        let activeRender = null;
        let pendingRender = null;
        let renderAnimationFrame = null;
        let renderEpoch = 0;
        let nextRenderId = 1;
        let recycledPixels = null;
        let hasRenderedImage = false;
        let copyingImage = false;
        const renderWorkerSource = ${JSON.stringify(RENDER_WORKER_SOURCE)};

        // DOM elements
        const widthInput = document.getElementById('width');
        const heightInput = document.getElementById('height');
        const dataTypeSelect = document.getElementById('dataType');
        const endiannessSelect = document.getElementById('endianness');
        const sliceInput = document.getElementById('slice');
        const sliceSlider = document.getElementById('sliceSlider');
        const loadSliceButton = document.getElementById('loadSlice');
        const reloadSliceButton = document.getElementById('reloadSlice');
        const windowMinInput = document.getElementById('windowMin');
        const windowMaxInput = document.getElementById('windowMax');
        const resetWindowButton = document.getElementById('resetWindow');
        const togglePlaneButton = document.getElementById('togglePlane');
        const canvas = document.getElementById('imageCanvas');
        const ctx = canvas.getContext('2d');
        const imageContextMenu = document.getElementById('imageContextMenu');
        const copyImagePngButton = document.getElementById('copyImagePng');
        const errorPanel = document.getElementById('errorPanel');
        const errorMessage = document.getElementById('errorMessage');

        // Info display elements
        const fileSizeEl = document.getElementById('fileSize');
        const numSlicesEl = document.getElementById('numSlices');
        const currentSliceEl = document.getElementById('currentSlice');
        const dimensionsEl = document.getElementById('dimensions');
        const sliceStatMinEl = document.getElementById('sliceStatMin');
        const sliceStatMaxEl = document.getElementById('sliceStatMax');
        const sliceStatMeanEl = document.getElementById('sliceStatMean');
        const sliceStatSumEl = document.getElementById('sliceStatSum');
        const pixelPositionEl = document.getElementById('pixelPosition');
        const pixelValueEl = document.getElementById('pixelValue');

        // Event listeners
        loadSliceButton.addEventListener('click', loadSlice);
        reloadSliceButton.addEventListener('click', reloadSlice);
        widthInput.addEventListener('input', handleMetadataChange);
        heightInput.addEventListener('input', handleMetadataChange);
        dataTypeSelect.addEventListener('change', handleMetadataChange);
        endiannessSelect.addEventListener('change', handleMetadataChange);

        // Slice navigation event listeners
        sliceInput.addEventListener('input', syncSliceControls);
        sliceSlider.addEventListener('input', syncSliceControls);
        windowMinInput.addEventListener('input', updateWindow);
        windowMaxInput.addEventListener('input', updateWindow);
        resetWindowButton.addEventListener('click', resetWindow);
        togglePlaneButton.addEventListener('click', togglePlane);

        // Keyboard shortcuts for slice navigation
        document.addEventListener('keydown', event => {
            if (imageContextMenu.style.display === 'block') {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    hideImageContextMenu(true);
                } else if (event.key === 'Tab') {
                    hideImageContextMenu();
                } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    event.preventDefault();
                }
                return;
            }
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
        });

        // Mouse wheel navigation on canvas
        canvas.addEventListener('wheel', event => {
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
        }, { passive: false });
        canvas.addEventListener('mousemove', event => {
            hoverPosition = { clientX: event.clientX, clientY: event.clientY };
            updatePixelInfo();
        });
        canvas.addEventListener('mouseleave', clearPixelHover);
        canvas.addEventListener('contextmenu', event => {
            event.preventDefault();
            event.stopPropagation();
            showImageContextMenu(event.clientX, event.clientY);
        });
        canvas.addEventListener('keydown', event => {
            if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                event.preventDefault();
                event.stopPropagation();
                const rect = canvas.getBoundingClientRect();
                showImageContextMenu(rect.left, rect.top);
            }
        });
        copyImagePngButton.addEventListener('click', copyImageAsPng);
        document.addEventListener('pointerdown', event => {
            if (!imageContextMenu.contains(event.target)) { hideImageContextMenu(); }
        });
        document.addEventListener('contextmenu', () => hideImageContextMenu());
        window.addEventListener('blur', () => hideImageContextMenu());
        window.addEventListener('scroll', () => {
            clearPixelHover();
            hideImageContextMenu();
        }, true);

        // Handle editor/sidebar resize to rescale canvas when VS Code panels move.
        window.addEventListener('resize', () => {
            hideImageContextMenu();
            scheduleCanvasScale();
        });
        if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
            const resizeObserver = new ResizeObserver(scheduleCanvasScale);
            resizeObserver.observe(canvas.parentElement);
        }
        window.addEventListener('pagehide', () => {
            if (renderWorker) { renderWorker.revokeUrl(); renderWorker.terminate(); }
            cancelRead(activeSliceRequest);
            cancelRead(activePrefetchRequest);
        });

        // Message handling
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case '${CONSTANTS.MESSAGE_TYPES.FILE_INFO}':
                    {
                        fileInfo = message;
                        fileSizeEl.textContent = formatBytes(message.fileSize);
                        const hasMetadata = Number.isFinite(message.width) &&
                            Number.isFinite(message.height) &&
                            Number.isFinite(message.depth) &&
                            typeof message.dataType === 'string' &&
                            typeof message.endianness === 'string';
                        if (hasMetadata) {
                            widthInput.value = String(message.width);
                            heightInput.value = String(message.height);
                            dataTypeSelect.value = message.dataType;
                            endiannessSelect.value = message.endianness === 'big' ? 'big' : 'little';
                            sliceInput.value = '0';
                            sliceSlider.value = '0';
                            currentPlane = 'axial';
                            togglePlaneButton.textContent = 'Plane: Axial';
                            clearSliceCacheAndPrefetch();
                            windowMin = null;
                            windowMax = null;
                            sliceMin = 0;
                            sliceMax = 255;
                            clearSliceStatistics();
                            updateWindowControls();
                        }
                        updateSliceInfo();
                        hideError();
                        if (hasMetadata) {
                            loadSlice();
                        }
                    }
                    break;
                case '${CONSTANTS.MESSAGE_TYPES.SLICE_DATA}':
                    {
                        if (message.priority === 'prefetch') {
                            if (message.requestId !== undefined && (!activePrefetchRequest || message.requestId !== activePrefetchRequest.requestId)) {
                                return;
                            }

                            const completedRequest = activePrefetchRequest;
                            try {
                                if (completedRequest) {
                                    const current = buildSliceRequest(false, 'visible');
                                    if (completedRequest.cancelRequested || !current ||
                                        !isSameSliceRequest({ ...completedRequest, slice: current.slice }, current) ||
                                        Math.abs(completedRequest.slice - current.slice) > PREFETCH_RADIUS) {
                                        return;
                                    }
                                    const receivedData = normalizeReceivedSliceData(message, completedRequest);
                                    cacheSliceData(receivedData);
                                    updateFileSize(message.fileSize);
                                    if (requestMatchesCurrentControls(completedRequest)) {
                                        displaySliceData(receivedData);
                                        hideError();
                                    }
                                }
                            } catch (error) {
                                showError(String(error));
                            } finally {
                                finishPrefetchRequest(completedRequest);
                            }
                            return;
                        }

                        if (message.requestId !== undefined && (!activeSliceRequest || message.requestId !== activeSliceRequest.requestId)) {
                            return;
                        }

                        const completedRequest = activeSliceRequest;
                        try {
                            if (!completedRequest || completedRequest.cancelRequested ||
                                !requestMatchesCurrentControls(completedRequest)) {
                                return;
                            }
                            const receivedData = normalizeReceivedSliceData(message, completedRequest);
                            cacheSliceData(receivedData);
                            updateFileSize(message.fileSize);
                            if (requestMatchesCurrentControls(completedRequest)) {
                                displaySliceData(receivedData);
                                hideError();
                            }
                        } catch (error) {
                            showError(String(error));
                        } finally {
                            finishSliceRequest(completedRequest);
                        }
                    }
                    break;
                case '${CONSTANTS.MESSAGE_TYPES.ERROR}':
                    {
                        if (message.priority === 'prefetch') {
                            if (message.requestId !== undefined && (!activePrefetchRequest || message.requestId !== activePrefetchRequest.requestId)) {
                                return;
                            }

                            const completedRequest = activePrefetchRequest;
                            if (!message.cancelled && completedRequest && !completedRequest.cancelRequested && requestMatchesCurrentControls(completedRequest)) {
                                showError(message.message);
                            }
                            finishPrefetchRequest(completedRequest);
                            return;
                        }

                        if (message.requestId !== undefined) {
                            if (!activeSliceRequest || message.requestId !== activeSliceRequest.requestId) {
                                return;
                            }
                            const completedRequest = activeSliceRequest;
                            if (!message.cancelled && !completedRequest.cancelRequested && requestMatchesCurrentControls(completedRequest)) {
                                showError(message.message);
                            }
                            finishSliceRequest(completedRequest);
                        } else {
                            showError(message.message);
                        }
                    }
                    break;
            }
        });

        function loadSlice() {
            requestSlice(false);
        }

        function reloadSlice() {
            requestSlice(true);
        }

        function requestSlice(forceReload) {
            clearPixelHover();
            if (forceReload) {
                clearSliceCacheAndPrefetch();
            }

            const request = buildSliceRequest(forceReload, 'visible');
            if (!request) {
                return;
            }

            pendingSliceRequest = null;
            if (activeSliceRequest && !isSameSliceRequest(activeSliceRequest, request)) {
                cancelRead(activeSliceRequest);
            }
            if (activePrefetchRequest && activePrefetchRequest.cacheKey !== request.cacheKey) {
                cancelRead(activePrefetchRequest);
            }
            if (!currentSliceData || currentSliceData.cacheKey !== request.cacheKey) {
                invalidateRender();
            }

            const cachedSlice = forceReload ? null : sliceCache.get(request.cacheKey);
            if (cachedSlice) {
                sliceCache.delete(request.cacheKey);
                sliceCache.set(request.cacheKey, cachedSlice);
                displaySliceData(cachedSlice);
                hideError();
            } else if (activePrefetchRequest && !activePrefetchRequest.cancelRequested && activePrefetchRequest.cacheKey === request.cacheKey) {
                // The prefetch response will render if this slice is still current.
            } else {
                prefetchQueue = prefetchQueue.filter(queued => queued.cacheKey !== request.cacheKey);
                request.priority = 'visible';
                if (sliceRequestInFlight) {
                    pendingSliceRequest = request;
                } else {
                    sendSliceRequest(request);
                }
            }

            prefetchQueue = [];
            if (request.plane !== 'axial' || request.forceReload) {
                return;
            }

            const maxSlice = parseInt(sliceInput.max);
            if (!Number.isFinite(maxSlice) || maxSlice < 0) {
                return;
            }

            const sliceBytes = request.width * request.height * getBytesPerPixel(request.dataType);
            const radius = Math.min(PREFETCH_RADIUS, Math.max(0, Math.floor((MAX_SLICE_CACHE_BYTES / sliceBytes - 1) / 2)));
            const minSlice = Math.max(0, request.slice - radius);
            const lastSlice = Math.min(maxSlice, request.slice + radius);

            const neighbors = [];
            for (let distance = 1; distance <= radius; distance++) {
                neighbors.push(request.slice + distance, request.slice - distance);
            }
            for (const slice of neighbors) {
                if (slice < minSlice || slice > lastSlice) { continue; }

                const neighborRequest = buildSliceRequest(false, 'prefetch', slice);
                if (!neighborRequest || sliceCache.has(neighborRequest.cacheKey) ||
                    inFlightPrefetchKeys.has(neighborRequest.cacheKey) ||
                    (activePrefetchRequest && !activePrefetchRequest.cancelRequested && activePrefetchRequest.cacheKey === neighborRequest.cacheKey) ||
                    (activeSliceRequest && !activeSliceRequest.cancelRequested && activeSliceRequest.cacheKey === neighborRequest.cacheKey) ||
                    (pendingSliceRequest && pendingSliceRequest.cacheKey === neighborRequest.cacheKey) ||
                    prefetchQueue.some(queued => queued.cacheKey === neighborRequest.cacheKey)) {
                    continue;
                }

                prefetchQueue.push(neighborRequest);
            }

            processPrefetchQueue();
        }

        function buildSliceRequest(forceReload, priority, sliceOverride) {
            const width = Number(widthInput.value);
            const height = Number(heightInput.value);
            const slice = sliceOverride !== undefined ? sliceOverride : sliceInput.value.trim() === '' ? NaN : Number(sliceInput.value);
            const dataType = dataTypeSelect.value;
            const endianness = endiannessSelect.value === 'little';

            if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
                !Number.isSafeInteger(slice) || width <= 0 || height <= 0 || slice < 0) {
                showError('Please enter valid positive values for width, height, and slice.');
                return;
            }

            const request = {
                width,
                height,
                slice,
                dataType,
                endianness,
                plane: currentPlane,
                forceReload,
                priority
            };

            request.cacheKey = buildSliceCacheKey(request);
            return request;
        }

        function updateFileSize(fileSize) {
            if (typeof fileSize !== 'number' || !Number.isFinite(fileSize)) {
                return;
            }

            if (!fileInfo) {
                fileInfo = { fileSize };
            } else {
                fileInfo = { ...fileInfo, fileSize };
            }

            fileSizeEl.textContent = formatBytes(fileSize);
            updateSliceInfo();
        }

        function sendSliceRequest(request) {
            const requestId = nextSliceRequestId++;
            activeSliceRequest = { ...request, priority: 'visible', requestId };
            sliceRequestInFlight = true;

            vscode.postMessage({
                type: '${CONSTANTS.MESSAGE_TYPES.READ_SLICE}',
                ...activeSliceRequest
            });
        }

        function finishSliceRequest(completedRequest) {
            sliceRequestInFlight = false;
            activeSliceRequest = null;

            if (!pendingSliceRequest) {
                processPrefetchQueue();
                return;
            }

            const nextRequest = pendingSliceRequest;
            pendingSliceRequest = null;

            if (!requestMatchesCurrentControls(nextRequest) || sliceCache.has(nextRequest.cacheKey)) {
                processPrefetchQueue();
                return;
            }

            if (!completedRequest || completedRequest.cancelRequested || !isSameSliceRequest(nextRequest, completedRequest)) {
                sendSliceRequest(nextRequest);
                return;
            }

            processPrefetchQueue();
        }

        function isSameSliceRequest(left, right) {
            return left.width === right.width &&
                left.height === right.height &&
                left.slice === right.slice &&
                left.dataType === right.dataType &&
                left.endianness === right.endianness &&
                left.plane === right.plane;
        }

        function requestMatchesCurrentControls(request) {
            return request.width === Number(widthInput.value) &&
                request.height === Number(heightInput.value) &&
                sliceInput.value.trim() !== '' && request.slice === Number(sliceInput.value) &&
                request.dataType === dataTypeSelect.value &&
                request.endianness === (endiannessSelect.value === 'little') &&
                request.plane === currentPlane;
        }

        function cancelRead(request) {
            if (request && !request.cancelRequested) {
                request.cancelRequested = true;
                if (request.priority === 'prefetch') { inFlightPrefetchKeys.delete(request.cacheKey); }
                vscode.postMessage({ type: '${CONSTANTS.MESSAGE_TYPES.CANCEL_SLICE}', requestId: request.requestId });
            }
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

        function navigateToSlice(newSlice) {
            sliceInput.value = newSlice;
            sliceSlider.value = newSlice;
        }

        function buildSliceCacheKey(request) {
            const byteOrder = request.endianness ? 'little' : 'big';
            return [
                request.width,
                request.height,
                request.dataType,
                byteOrder,
                request.plane,
                request.slice
            ].join('|');
        }

        function cacheSliceData(data) {
            if (!data.cacheKey) {
                data.cacheKey = buildSliceCacheKey(data);
            }

            evictCachedSlice(data.cacheKey);
            if (data.rawData.byteLength > MAX_SLICE_CACHE_BYTES) {
                return;
            }
            sliceCache.set(data.cacheKey, data);
            sliceCacheBytes += data.rawData.byteLength;

            while (sliceCache.size > MAX_SLICE_CACHE_ENTRIES || sliceCacheBytes > MAX_SLICE_CACHE_BYTES) {
                const oldestKey = sliceCache.keys().next().value;
                evictCachedSlice(oldestKey);
            }
        }

        function evictCachedSlice(cacheKey) {
            const data = sliceCache.get(cacheKey);
            if (data) {
                sliceCacheBytes -= data.rawData.byteLength;
                sliceCache.delete(cacheKey);
            }
        }

        function clearSliceCacheAndPrefetch() {
            cancelRead(activeSliceRequest);
            cancelRead(activePrefetchRequest);
            sliceCache.clear();
            sliceCacheBytes = 0;
            prefetchQueue = [];
            inFlightPrefetchKeys.clear();
            activePrefetchRequest = null;
            prefetchRequestInFlight = false;
            activeSliceRequest = null;
            pendingSliceRequest = null;
            sliceRequestInFlight = false;
            currentSliceData = null;
            pixelInspection = null;
            invalidateRender();
            workerSliceData = null;
            recycledPixels = null;
            if (renderWorker) { renderWorker.postMessage({ type: 'clear' }); }
        }

        function normalizeReceivedSliceData(data, request) {
            const rawData = decodeSliceData(data);
            const receivedData = {
                ...data,
                data: undefined,
                rawData,
                endianness: request ? request.endianness : data.endianness,
                cacheKey: request ? request.cacheKey : undefined
            };

            if (!receivedData.cacheKey) {
                receivedData.cacheKey = buildSliceCacheKey(receivedData);
            }

            return receivedData;
        }

        function displaySliceData(data) {
            currentSliceData = data;
            updateSliceRange(currentSliceData);
            renderSlice(currentSliceData);
            currentSliceEl.textContent = data.slice;
            dimensionsEl.textContent = \`\${data.width} × \${data.height}\`;
        }

        function processPrefetchQueue() {
            if (sliceRequestInFlight || prefetchRequestInFlight) {
                return;
            }

            while (prefetchQueue.length > 0) {
                const nextRequest = prefetchQueue.shift();
                if (!nextRequest || sliceCache.has(nextRequest.cacheKey) || inFlightPrefetchKeys.has(nextRequest.cacheKey)) {
                    continue;
                }

                const requestId = nextSliceRequestId++;
                activePrefetchRequest = { ...nextRequest, priority: 'prefetch', requestId };
                prefetchRequestInFlight = true;
                inFlightPrefetchKeys.add(activePrefetchRequest.cacheKey);

                vscode.postMessage({
                    type: '${CONSTANTS.MESSAGE_TYPES.READ_SLICE}',
                    ...activePrefetchRequest
                });
                return;
            }
        }

        function finishPrefetchRequest(completedRequest) {
            if (completedRequest) {
                inFlightPrefetchKeys.delete(completedRequest.cacheKey);
            }

            prefetchRequestInFlight = false;
            activePrefetchRequest = null;
            processPrefetchQueue();
        }

        function decodeSliceData(data) {
            if (data.rawData instanceof Uint8Array) {
                return data.rawData;
            }

            if (data.encoding === 'base64') {
                const binary = atob(data.data);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                if (data.byteLength !== undefined && bytes.byteLength !== data.byteLength) {
                    throw new Error('Decoded slice byte length does not match expected length');
                }
                return bytes;
            }

            if (data.data instanceof ArrayBuffer) {
                return new Uint8Array(data.data);
            }

            if (data.data instanceof Uint8Array) {
                return data.data;
            }

            return new Uint8Array(data.data);
        }

        function updateSliceRange(data) {
            const statistics = data.statistics || null;
            if (!statistics) {
                // Keep the last known slider range until the worker supplies
                // this slice's statistics. Missing statistics are not zeros.
                clearSliceStatistics();
                return;
            }

            sliceMin = statistics.min;
            sliceMax = statistics.max;
            sliceStatMinEl.textContent = formatStatisticValue(statistics.min);
            sliceStatMaxEl.textContent = formatStatisticValue(statistics.max);
            sliceStatMeanEl.textContent = formatStatisticValue(statistics.mean);
            sliceStatSumEl.textContent = formatStatisticValue(statistics.sum);
            updateWindowControls();
        }

        function clearSliceStatistics() {
            sliceStatMinEl.textContent = '-';
            sliceStatMaxEl.textContent = '-';
            sliceStatMeanEl.textContent = '-';
            sliceStatSumEl.textContent = '-';
        }

        function resetWindowToSliceRange() {
            windowMin = sliceMin;
            windowMax = sliceMax;
            updateWindowControls();
        }

        function clipWindowValueToSliceRange(value) {
            if (value === null) {
                return null;
            }

            return Math.min(sliceMax, Math.max(sliceMin, value));
        }

        function renderSlice(data) {
            pendingRender = { data, windowMin, windowMax, epoch: renderEpoch };
            scheduleRender();
        }

        function scheduleRender() {
            if (!pendingRender || activeRender || renderAnimationFrame !== null) {
                return;
            }
            renderAnimationFrame = requestAnimationFrame(() => {
                renderAnimationFrame = null;
                if (!pendingRender || activeRender) { return; }
                try {
                    if (!renderWorker) {
                        const url = URL.createObjectURL(new Blob([renderWorkerSource], { type: 'application/javascript' }));
                        let revoked = false;
                        const revoke = () => {
                            if (!revoked) { URL.revokeObjectURL(url); revoked = true; }
                        };
                        try {
                            const worker = new Worker(url);
                            renderWorker = worker;
                            worker.onmessage = event => {
                                revoke();
                                if (renderWorker !== worker) { return; }
                                const result = event.data;
                                const completed = activeRender;
                                if (!completed || result.renderId !== completed.renderId) { return; }
                                activeRender = null;
                                const isCurrent = completed.epoch === renderEpoch && completed.data === currentSliceData;
                                if (result.type === 'error') {
                                    workerSliceData = null;
                                    if (isCurrent) { showError(result.message); }
                                } else if (isCurrent) {
                                    try {
                                        const data = completed.data;
                                        if (!data.statistics) {
                                            data.statistics = result.statistics;
                                            updateSliceRange(data);
                                        }
                                        if (windowMin === null || windowMax === null) {
                                            resetWindowToSliceRange();
                                        }
                                        if (canvas.width !== result.width) { canvas.width = result.width; }
                                        if (canvas.height !== result.height) { canvas.height = result.height; }
                                        const imageData = new ImageData(new Uint8ClampedArray(result.pixels), result.width, result.height);
                                        ctx.putImageData(imageData, 0, 0);
                                        hasRenderedImage = true;
                                        recycledPixels = result.pixels;
                                        const rawData = decodeSliceData(data);
                                        const endianness = data.endianness !== undefined ? data.endianness : endiannessSelect.value === 'little';
                                        if (!Object.prototype.hasOwnProperty.call(dataTypes, data.dataType)) {
                                            throw new Error('Unsupported data type: ' + data.dataType);
                                        }
                                        const { bytesPerPixel, getter } = dataTypes[data.dataType];
                                        const view = new DataView(rawData.buffer, rawData.byteOffset, rawData.byteLength);
                                        const getValue = offset => view[getter](offset, endianness);
                                        pixelInspection = { width: data.width, height: data.height, rawData, bytesPerPixel, getValue };
                                        scaleCanvasToFit();
                                        hideError();
                                    } catch (error) {
                                        showError(String(error));
                                    }
                                }
                                // Painting intermediate window values keeps dragging live. Only the
                                // newest pending values are rendered next, so the queue cannot grow.
                                scheduleRender();
                            };
                            worker.onerror = event => {
                                revoke();
                                if (renderWorker !== worker) { return; }
                                failRenderer(event.message || 'Unable to start image renderer');
                            };
                            worker.onmessageerror = () => {
                                revoke();
                                if (renderWorker === worker) { failRenderer('Unable to receive rendered image'); }
                            };
                            worker.revokeUrl = revoke;
                        } catch (error) {
                            revoke();
                            throw error;
                        }
                    }
                    const request = pendingRender;
                    pendingRender = null;
                    request.renderId = nextRenderId++;
                    activeRender = request;
                    const data = request.data;
                    const message = {
                        renderId: request.renderId,
                        windowMin: request.windowMin,
                        windowMax: request.windowMax,
                        pixels: recycledPixels
                    };
                    if (workerSliceData !== data) {
                        message.slice = {
                            width: data.width, height: data.height, dataType: data.dataType,
                            endianness: data.endianness !== undefined ? data.endianness : endiannessSelect.value === 'little',
                            rawData: decodeSliceData(data), statistics: data.statistics
                        };
                        // Clone once per displayed slice. Never detach the hover/cache data.
                        workerSliceData = data;
                    }
                    const transfers = recycledPixels ? [recycledPixels] : [];
                    recycledPixels = null;
                    renderWorker.postMessage(message, transfers);
                } catch (error) {
                    failRenderer(String(error));
                }
            });
        }

        function invalidateRender() {
            renderEpoch++;
            hasRenderedImage = false;
            hideImageContextMenu();
            pendingRender = null;
            pixelInspection = null;
            if (activeRender && renderWorker) {
                renderWorker.revokeUrl();
                renderWorker.terminate();
                renderWorker = null;
                workerSliceData = null;
                activeRender = null;
                recycledPixels = null;
            }
        }

        function failRenderer(message) {
            if (renderWorker) {
                renderWorker.revokeUrl();
                renderWorker.terminate();
            }
            renderWorker = null;
            workerSliceData = null;
            activeRender = null;
            pendingRender = null;
            recycledPixels = null;
            showError('Failed to render slice: ' + message);
        }

        function showImageContextMenu(clientX, clientY) {
            copyImagePngButton.disabled = !hasRenderedImage || copyingImage;
            imageContextMenu.style.display = 'block';
            const rect = imageContextMenu.getBoundingClientRect();
            imageContextMenu.style.left = Math.max(4, Math.min(clientX, window.innerWidth - rect.width - 4)) + 'px';
            imageContextMenu.style.top = Math.max(4, Math.min(clientY, window.innerHeight - rect.height - 4)) + 'px';
            if (!copyImagePngButton.disabled) { copyImagePngButton.focus(); }
        }

        function hideImageContextMenu(restoreFocus = false) {
            imageContextMenu.style.display = 'none';
            if (restoreFocus) { canvas.focus(); }
        }

        async function copyImageAsPng() {
            hideImageContextMenu(true);
            if (!hasRenderedImage || copyingImage) { return; }
            copyingImage = true;
            try {
                if (typeof ClipboardItem === 'undefined' || !navigator.clipboard || !navigator.clipboard.write) {
                    throw new Error('Image clipboard access is unavailable in this version of VS Code.');
                }
                // Start encoding the canvas now, and write during the menu click's user activation.
                const png = new Promise((resolve, reject) => {
                    canvas.toBlob(blob => {
                        if (blob) { resolve(blob); }
                        else { reject(new Error('Unable to encode the displayed image as PNG.')); }
                    }, 'image/png');
                });
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
            } catch (error) {
                showError('Failed to copy image: ' + (error instanceof Error ? error.message : String(error)));
            } finally {
                copyingImage = false;
            }
        }

        function clearPixelHover() {
            hoverPosition = null;
            clearPixelInfo();
        }

        function clearPixelInfo() {
            pixelPositionEl.textContent = '-';
            pixelValueEl.textContent = '-';
        }

        function updatePixelInfo() {
            if (!hoverPosition || !pixelInspection) {
                clearPixelInfo();
                return;
            }

            const rect = canvas.getBoundingClientRect();
            const { clientX, clientY } = hoverPosition;
            const { width, height, rawData, bytesPerPixel, getValue } = pixelInspection;
            const x = Math.floor((clientX - rect.left) * width / rect.width);
            const y = Math.floor((clientY - rect.top) * height / rect.height);
            if (rect.width <= 0 || rect.height <= 0 || x < 0 || y < 0 || x >= width || y >= height) {
                clearPixelInfo();
                return;
            }

            const offset = (y * width + x) * bytesPerPixel;
            if (offset + bytesPerPixel > rawData.byteLength) {
                clearPixelInfo();
                return;
            }

            const value = getValue(offset);
            const valueText = Object.is(value, -0) ? '-0' : String(value);
            pixelPositionEl.textContent = '(' + x + ', ' + y + ')';
            pixelValueEl.textContent = valueText;
        }

        function scaleCanvasToFit() {
            const container = canvas.parentElement;
            if (!container) {
                return;
            }

            const containerRect = container.getBoundingClientRect();
            const containerWidth = Math.max(0, containerRect.width - 40);
            const containerHeight = Math.max(0, containerRect.height - 40);

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
            updatePixelInfo();
        }

        function scheduleCanvasScale() {
            if (!currentSliceData || resizeAnimationFrame !== null) {
                return;
            }

            resizeAnimationFrame = requestAnimationFrame(() => {
                resizeAnimationFrame = null;
                scaleCanvasToFit();
            });
        }

        function updateWindowControls() {
            const clippedWindowMin = clipWindowValueToSliceRange(windowMin);
            const clippedWindowMax = clipWindowValueToSliceRange(windowMax);
            let controlMin = sliceMin;
            let controlMax = sliceMax;

            if (controlMin === controlMax) {
                controlMin = controlMin - 0.5;
                controlMax = controlMax + 0.5;
            }

            windowMinInput.min = controlMin;
            windowMinInput.max = controlMax;
            windowMaxInput.min = controlMin;
            windowMaxInput.max = controlMax;
            windowMinInput.value = clippedWindowMin !== null ? clippedWindowMin : sliceMin;
            windowMaxInput.value = clippedWindowMax !== null ? clippedWindowMax : sliceMax;
            const dataRange = controlMax - controlMin;
            const step = dataRange > 0 ? dataRange / 255 : 1;
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
            if (!currentSliceData) {
                return;
            }

            updateSliceRange(currentSliceData);
            if (currentSliceData.statistics) {
                resetWindowToSliceRange();
            } else {
                windowMin = null;
                windowMax = null;
            }
            renderSlice(currentSliceData);
        }

        function showError(message) {
            errorMessage.textContent = message;
            errorPanel.style.display = 'block';
        }

        function hideError() {
            errorPanel.style.display = 'none';
        }

        function handleMetadataChange() {
            clearPixelHover();
            clearSliceCacheAndPrefetch();
            windowMin = null;
            windowMax = null;
            sliceMin = 0;
            sliceMax = 255;
            clearSliceStatistics();
            updateWindowControls();
            updateSliceInfo();
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
                } else if (Number.isFinite(fileInfo.depth) && fileInfo.depth > 0) {
                    numSlices = fileInfo.depth;
                    maxSlice = Math.max(0, numSlices - 1);
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
            if (!Object.prototype.hasOwnProperty.call(dataTypes, dataType)) {
                throw new Error('Unsupported data type: ' + dataType);
            }
            return dataTypes[dataType].bytesPerPixel;
        }

        function togglePlane() {
            clearPixelHover();
            clearSliceCacheAndPrefetch();
            currentPlane = currentPlane === 'axial' ? 'coronal' : 'axial';
            togglePlaneButton.textContent = 'Plane: ' + currentPlane.charAt(0).toUpperCase() + currentPlane.slice(1);

            windowMin = null;
            windowMax = null;
            sliceMin = 0;
            sliceMax = 255;
            clearSliceStatistics();
            updateWindowControls();
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

        function formatStatisticValue(value) {
            return Number.isFinite(value) ? String(value) : '-';
        }

        vscode.postMessage({ type: '${CONSTANTS.MESSAGE_TYPES.READY}' });
    </script>
</body>
</html>`;
    }
}
