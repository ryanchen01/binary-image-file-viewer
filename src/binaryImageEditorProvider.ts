import * as vscode from 'vscode';
import * as path from 'path';
import { CONSTANTS } from './constants';
import { FileCacheManager } from './fileCacheManager';
import { DataProcessor } from './dataProcessor';
import { SliceReader } from './sliceReader';
import { WebviewUIManager } from './webviewUIManager';

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

    constructor(private readonly context: vscode.ExtensionContext) {
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

        // Set the HTML content
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case CONSTANTS.MESSAGE_TYPES.READY:
                        // Send initial file data when webview is ready
                        await this.sendFileData(webviewPanel.webview, document.uri);
                        break;
                    case CONSTANTS.MESSAGE_TYPES.READ_SLICE:
                        // Read a specific slice from the file
                        await this.readSlice(
                            webviewPanel.webview,
                            document.uri,
                            message.width,
                            message.height,
                            message.slice,
                            message.dataType,
                            /* endianness */ undefined,
                            message.plane || 'axial',
                            message.forceReload || false
                        );
                        break;
                    case CONSTANTS.MESSAGE_TYPES.COMPUTE_GLOBAL_WINDOW:
                        // Compute global min/max for the entire image
                        try {
                            const { windowMin, windowMax } = await this.computeGlobalWindow(
                                document.uri,
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
            },
            undefined,
            this.context.subscriptions
        );

        // Clean up cache when panel is disposed
        webviewPanel.onDidDispose(() => {
            this.fileCacheManager.evictFile(document.uri);
        });
    }

    /**
     * Send basic file information to the webview so that the UI can display
     * name and size before any slice data is requested.
     */
    private async sendFileData(webview: vscode.Webview, uri: vscode.Uri): Promise<void> {
        try {
            const stats = await vscode.workspace.fs.stat(uri);
            if (stats.size > CONSTANTS.MAX_FILE_SIZE) {
                throw new Error(`File size ${stats.size} exceeds safe limit`);
            }
            webview.postMessage({
                type: CONSTANTS.MESSAGE_TYPES.FILE_INFO,
                fileSize: stats.size,
                fileName: path.basename(uri.fsPath)
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
        forceReload: boolean = false
    ): Promise<void> {
        try {
            if (forceReload) {
                this.fileCacheManager.evictFile(uri);
            }
            const fileData = await this.fileCacheManager.getFileData(uri);
            
            const { sliceData, resultWidth, resultHeight } = this.sliceReader.readSlice(
                fileData, width, height, slice, dataType as any, plane
            );

            // Convert to the appropriate format and send to webview
            webview.postMessage({
                type: CONSTANTS.MESSAGE_TYPES.SLICE_DATA,
                data: Array.from(sliceData),
                width: resultWidth,
                height: resultHeight,
                slice,
                dataType,
                plane
            });
        } catch (error) {
            webview.postMessage({
                type: CONSTANTS.MESSAGE_TYPES.ERROR,
                message: `Failed to read slice: ${error}`
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
        return this.webviewUIManager.getHtmlForWebview();
    }
}