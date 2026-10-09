import * as vscode from 'vscode';
import { CONSTANTS, SupportedDataType, ViewType } from './constants';
import { FileCacheManager } from './fileCacheManager';
import { DataProcessor } from './dataProcessor';
import { SliceReader } from './sliceReader';
import { WebviewUIManager } from './webviewUIManager';
import { MhdMetadata, parseMhdHeader, resolveMhdDataFilePath } from './mhdParser';

interface BinaryImageDocument extends vscode.CustomDocument {
    readonly sourceUri: vscode.Uri;
    readonly dataUri: vscode.Uri;
    readonly metadata?: MhdMetadata;
}

/**
 * Custom editor provider responsible for rendering binary image files in a
 * readonly webview. The provider reads slices of the file on demand and sends
 * them to the webview for visualization.
 */
export class BinaryImageEditorProvider implements vscode.CustomReadonlyEditorProvider {
    private fileCacheManager: FileCacheManager;
    private dataProcessor: DataProcessor;
    private sliceReader: SliceReader;
    private webviewUIManager: WebviewUIManager;

    constructor(_context: vscode.ExtensionContext) {
        this.fileCacheManager = new FileCacheManager();
        this.dataProcessor = new DataProcessor();
        this.sliceReader = new SliceReader();
        this.webviewUIManager = new WebviewUIManager();
    }

    /**
     * Register the provider with VS Code.
     *
     * @param context Extension context used to create the provider.
     * @returns Disposable that unregisters the provider.
     */
    public static register(context: vscode.ExtensionContext, viewType: ViewType = CONSTANTS.VIEW_TYPES.BINARY_EDITOR): vscode.Disposable {
        const provider = new BinaryImageEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            viewType,
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
    ): Promise<BinaryImageDocument> {
        const metadata = await this.readMhdMetadata(uri);
        const dataUri = metadata
            ? vscode.Uri.file(resolveMhdDataFilePath(uri.fsPath, metadata.elementDataFile))
            : uri;

        return {
            uri,
            sourceUri: uri,
            dataUri,
            metadata,
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
        const binaryImageDocument = document as BinaryImageDocument;
        const reads = new Map<number, vscode.CancellationTokenSource>();
        let disposed = false;

        // Configure webview
        webviewPanel.webview.options = {
            enableScripts: true,
        };

        // Set the HTML content
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

        // Handle messages from the webview
        const messageSubscription = webviewPanel.webview.onDidReceiveMessage(
            async (message) => {
                if (disposed) {
                    return;
                }
                switch (message.type) {
                    case CONSTANTS.MESSAGE_TYPES.READY:
                        // Send initial file data when webview is ready
                        await this.sendFileData(webviewPanel.webview, binaryImageDocument);
                        break;
                    case CONSTANTS.MESSAGE_TYPES.READ_SLICE:
                        // Read a specific slice from the file
                        const cancellation = new vscode.CancellationTokenSource();
                        reads.set(message.requestId, cancellation);
                        try {
                            await this.readSlice(
                                webviewPanel.webview,
                                binaryImageDocument.dataUri,
                                message.width,
                                message.height,
                                message.slice,
                                message.dataType,
                                message.endianness,
                                message.plane || 'axial',
                                message.forceReload || false,
                                message.requestId,
                                message.priority || 'visible',
                                cancellation.token
                            );
                        } finally {
                            reads.delete(message.requestId);
                            cancellation.dispose();
                        }
                        break;
                    case CONSTANTS.MESSAGE_TYPES.CANCEL_SLICE:
                        reads.get(message.requestId)?.cancel();
                        break;
                    case CONSTANTS.MESSAGE_TYPES.COMPUTE_GLOBAL_WINDOW:
                        // Compute global min/max for the entire image
                        try {
                            const { windowMin, windowMax } = await this.computeGlobalWindow(
                                binaryImageDocument.dataUri,
                                message.width,
                                message.height,
                                message.dataType,
                                message.endianness,
                                message.depth || message.width
                            );
                            webviewPanel.webview.postMessage({
                                type: CONSTANTS.MESSAGE_TYPES.WINDOW_DATA,
                                windowMin,
                                windowMax
                            });
                        } catch (error) {
                            webviewPanel.webview.postMessage({
                                type: CONSTANTS.MESSAGE_TYPES.ERROR,
                                message: `Failed to compute global window: ${error}`
                            });
                        }
                        break;
                }
            }
        );

        // Clean up cache when panel is disposed
        webviewPanel.onDidDispose(() => {
            disposed = true;
            messageSubscription.dispose();
            for (const read of reads.values()) {
                read.cancel();
            }
            this.fileCacheManager.evictFile(binaryImageDocument.sourceUri);
            this.fileCacheManager.evictFile(binaryImageDocument.dataUri);
        });
    }

    /**
     * Send basic file information to the webview so that the UI can display
     * file metadata before any slice data is requested.
     */
    private async sendFileData(webview: vscode.Webview, document: BinaryImageDocument): Promise<void> {
        try {
            const stats = await this.fileCacheManager.getFileStats(document.dataUri);
            webview.postMessage({
                type: CONSTANTS.MESSAGE_TYPES.FILE_INFO,
                fileSize: stats.size,
                width: document.metadata?.width,
                height: document.metadata?.height,
                depth: document.metadata?.depth,
                dataType: document.metadata?.dataType,
                endianness: document.metadata?.endianness,
                sourceFile: document.dataUri.fsPath,
                metadataFile: document.metadata ? document.sourceUri.fsPath : undefined
            });
        } catch (error) {
            webview.postMessage({
                type: CONSTANTS.MESSAGE_TYPES.ERROR,
                message: `Failed to read file info: ${error}`
            });
        }
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
     * @param _endianness True for little-endian, false for big-endian.
     * @param plane View plane ('axial' or 'coronal').
     */
    private async readSlice(
        webview: vscode.Webview,
        uri: vscode.Uri,
        width: number,
        height: number,
        slice: number,
        dataType: string,
        _endianness: boolean = true,
        plane: string = 'axial',
        forceReload: boolean = false,
        requestId?: number,
        priority: string = 'visible',
        token?: vscode.CancellationToken
    ): Promise<void> {
        try {
            if (token?.isCancellationRequested) {
                throw new Error('Slice read cancelled');
            }
            if (forceReload) {
                this.fileCacheManager.evictFile(uri);
            }

            const typedDataType = dataType as SupportedDataType;
            let sliceData: Uint8Array;
            let resultWidth: number;
            let resultHeight: number;
            let fileSize: number;

            if (plane === 'axial') {
                const stats = await this.fileCacheManager.getFileStats(uri);
                fileSize = stats.size;
                const { offset, length } = this.sliceReader.getAxialSliceRange(
                    stats.size, width, height, slice, typedDataType
                );
                sliceData = await this.fileCacheManager.readFileRange(uri, offset, length, token);
                resultWidth = width;
                resultHeight = height;
            } else {
                const stats = await this.fileCacheManager.getFileStats(uri);
                fileSize = stats.size;
                const { ranges, resultWidth: coronalWidth, resultHeight: coronalHeight } = this.sliceReader.getCoronalSliceRanges(
                    stats.size, width, height, slice, typedDataType
                );
                sliceData = await this.fileCacheManager.readFileRanges(uri, ranges, token);
                resultWidth = coronalWidth;
                resultHeight = coronalHeight;
            }

            if (token?.isCancellationRequested) {
                throw new Error('Slice read cancelled');
            }
            // VS Code 1.57+ transports ArrayBuffers without base64 expansion.
            // Restrict pooled Buffers to the actual slice's byte range.
            const data = sliceData.byteOffset === 0 && sliceData.byteLength === sliceData.buffer.byteLength
                ? sliceData.buffer
                : sliceData.buffer.slice(sliceData.byteOffset, sliceData.byteOffset + sliceData.byteLength);

            // Convert to the appropriate format and send to webview
            webview.postMessage({
                type: CONSTANTS.MESSAGE_TYPES.SLICE_DATA,
                data,
                encoding: 'binary',
                byteLength: sliceData.byteLength,
                width: resultWidth,
                height: resultHeight,
                fileSize,
                slice,
                dataType,
                plane,
                endianness: _endianness,
                priority,
                requestId
            });
        } catch (error) {
            webview.postMessage({
                type: CONSTANTS.MESSAGE_TYPES.ERROR,
                message: `Failed to read slice: ${error}`,
                cancelled: token?.isCancellationRequested === true,
                priority,
                requestId
            });
        }
    }

    /**
     * Get the file data using the file cache manager.
     * This ensures we only read the file once and reuse the data for all slice operations.
     */
    private async getFileData(uri: vscode.Uri): Promise<Uint8Array> {
        return this.fileCacheManager.getFileData(uri);
    }

    private async readMhdMetadata(uri: vscode.Uri): Promise<MhdMetadata | undefined> {
        if (!uri.fsPath.toLowerCase().endsWith('.mhd')) {
            return undefined;
        }

        if (uri.scheme && uri.scheme !== 'file') {
            throw new Error('MHD files must be opened from the local file system');
        }

        try {
            const headerData = await vscode.workspace.fs.readFile(uri);
            return parseMhdHeader(Buffer.from(headerData).toString('utf8'));
        } catch (err) {
            throw new Error(`Unable to parse MHD metadata: ${err}`);
        }
    }

    /**
     * Compute the global min and max for the entire image volume.
     */
    private async computeGlobalWindow(
        uri: vscode.Uri,
        width: number,
        height: number,
        dataType: string,
        endianness: boolean = true,
        _depth: number = width
    ): Promise<{ windowMin: number; windowMax: number }> {
        try {
            const fileData = await this.getFileData(uri);
            return this.dataProcessor.computeGlobalWindow(
                fileData, width, height, dataType as any, endianness
            );
        } catch (err) {
            throw new Error(`Failed to compute window: ${err}`);
        }
    }

    /**
     * Generate the HTML used for the webview panel. The markup includes the UI
     * and scripts required to display and navigate image slices.
     */
    private getHtmlForWebview(_webview: vscode.Webview): string {
        const memoryMB = vscode.workspace.getConfiguration?.('binaryImageViewer')
            .get<number>('sliceCacheMemoryMB', CONSTANTS.SLICE_CACHE_MEMORY_MB)
            ?? CONSTANTS.SLICE_CACHE_MEMORY_MB;
        const budget = Number.isFinite(memoryMB)
            ? Math.max(1, Math.min(1024, memoryMB)) : CONSTANTS.SLICE_CACHE_MEMORY_MB;
        return this.webviewUIManager.getHtmlForWebview(budget * 1024 * 1024);
    }
}
