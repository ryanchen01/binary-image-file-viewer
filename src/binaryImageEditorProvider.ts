import * as vscode from 'vscode';
import { CONSTANTS, SupportedDataType } from './constants';
import { FileCacheManager } from './fileCacheManager';
import { SliceReader } from './sliceReader';
import { WebviewUIManager } from './webviewUIManager';
import { MhdMetadata, parseMhdHeader, resolveMhdDataFilePath } from './mhdParser';

interface BinaryImageDocument extends vscode.CustomDocument {
    readonly dataUri: vscode.Uri;
    readonly metadata?: MhdMetadata;
}

/** Reads image slices on demand for the readonly custom editor. */
export class BinaryImageEditorProvider implements vscode.CustomReadonlyEditorProvider<BinaryImageDocument> {
    private readonly fileCacheManager = new FileCacheManager();
    private readonly sliceReader = new SliceReader();

    public async openCustomDocument(
        uri: vscode.Uri,
        _openContext: vscode.CustomDocumentOpenContext,
        _token: vscode.CancellationToken
    ): Promise<BinaryImageDocument> {
        let metadata: MhdMetadata | undefined;
        if (uri.fsPath.toLowerCase().endsWith('.mhd')) {
            if (uri.scheme && uri.scheme !== 'file') {
                throw new Error('MHD files must be opened from the local file system');
            }
            try {
                const headerData = await vscode.workspace.fs.readFile(uri);
                metadata = parseMhdHeader(Buffer.from(headerData).toString('utf8'));
            } catch (error) {
                throw new Error(`Unable to parse MHD metadata: ${error}`);
            }
        }
        const dataUri = metadata
            ? vscode.Uri.file(resolveMhdDataFilePath(uri.fsPath, metadata.elementDataFile))
            : uri;
        return { uri, dataUri, metadata, dispose: () => {} };
    }

    public async resolveCustomEditor(
        binaryImageDocument: BinaryImageDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        const webview = webviewPanel.webview;
        const reads = new Map<number, vscode.CancellationTokenSource>();
        let disposed = false;
        webview.options = { enableScripts: true };
        const memoryMB = vscode.workspace.getConfiguration('binaryImageViewer')
            .get<number>('sliceCacheMemoryMB', CONSTANTS.SLICE_CACHE_MEMORY_MB);
        const budget = Number.isFinite(memoryMB)
            ? Math.max(1, Math.min(1024, memoryMB)) : CONSTANTS.SLICE_CACHE_MEMORY_MB;
        webview.html = new WebviewUIManager().getHtmlForWebview(budget * 1024 * 1024);

        const messageSubscription = webview.onDidReceiveMessage(async (message) => {
            if (disposed) { return; }
            switch (message.type) {
                case CONSTANTS.MESSAGE_TYPES.READY: {
                    try {
                        const stats = await this.fileCacheManager.getFileStats(binaryImageDocument.dataUri);
                        webview.postMessage({
                            type: CONSTANTS.MESSAGE_TYPES.FILE_INFO,
                            fileSize: stats.size,
                            width: binaryImageDocument.metadata?.width,
                            height: binaryImageDocument.metadata?.height,
                            depth: binaryImageDocument.metadata?.depth,
                            dataType: binaryImageDocument.metadata?.dataType,
                            endianness: binaryImageDocument.metadata?.endianness,
                            sourceFile: binaryImageDocument.dataUri.fsPath,
                            metadataFile: binaryImageDocument.metadata ? binaryImageDocument.uri.fsPath : undefined
                        });
                    } catch (error) {
                        webview.postMessage({
                            type: CONSTANTS.MESSAGE_TYPES.ERROR,
                            message: `Failed to read file info: ${error}`
                        });
                    }
                    break;
                }
                case CONSTANTS.MESSAGE_TYPES.READ_SLICE: {
                    const { width, height, slice, dataType, requestId } = message;
                    const endianness = message.endianness ?? true;
                    const plane = message.plane ?? 'axial';
                    const priority = message.priority ?? 'visible';
                    const uri = binaryImageDocument.dataUri;
                    const cancellation = new vscode.CancellationTokenSource();
                    reads.get(requestId)?.cancel();
                    reads.set(requestId, cancellation);
                    const token = cancellation.token;
                    try {
                        if (token.isCancellationRequested) {
                            throw new Error('Slice read cancelled');
                        }
                        const typedDataType = dataType as SupportedDataType;
                        let sliceData: Uint8Array;
                        let resultWidth: number;
                        let resultHeight: number;
                        const stats = await this.fileCacheManager.getFileStats(uri);
                        const fileSize = stats.size;

                        if (plane === 'axial') {
                            const { offset, length } = this.sliceReader.getAxialSliceRange(
                                stats.size, width, height, slice, typedDataType
                            );
                            sliceData = await this.fileCacheManager.readFileRanges(uri, [{ offset, length }], token);
                            resultWidth = width;
                            resultHeight = height;
                        } else {
                            const { ranges, resultWidth: coronalWidth, resultHeight: coronalHeight } = this.sliceReader.getCoronalSliceRanges(
                                stats.size, width, height, slice, typedDataType
                            );
                            sliceData = await this.fileCacheManager.readFileRanges(uri, ranges, token);
                            resultWidth = coronalWidth;
                            resultHeight = coronalHeight;
                        }

                        if (token.isCancellationRequested) {
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
                            endianness,
                            priority,
                            requestId
                        });
                    } catch (error) {
                        webview.postMessage({
                            type: CONSTANTS.MESSAGE_TYPES.ERROR,
                            message: `Failed to read slice: ${error}`,
                            cancelled: token.isCancellationRequested === true,
                            priority,
                            requestId
                        });
                    } finally {
                        if (reads.get(requestId) === cancellation) { reads.delete(requestId); }
                        cancellation.dispose();
                    }
                    break;
                }
                case CONSTANTS.MESSAGE_TYPES.CANCEL_SLICE:
                    reads.get(message.requestId)?.cancel();
                    break;
            }
        });
        webviewPanel.onDidDispose(() => {
            disposed = true;
            messageSubscription.dispose();
            for (const read of reads.values()) { read.cancel(); }
        });
    }
}
