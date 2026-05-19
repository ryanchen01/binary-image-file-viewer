import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { BinaryImageEditorProvider } from '../binaryImageEditorProvider';
import { CONSTANTS } from '../constants';
import { openMhdText, openMhdViewer } from '../mhdCommands';
import { parseMhdHeader, resolveMhdDataFilePath } from '../mhdParser';
import { SliceReader } from '../sliceReader';
import { applyWindowLevel, calculateMaxSlices, getBytesPerPixel } from '../utils';

suite('BinaryImageEditorProvider', () => {
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    const provider = new BinaryImageEditorProvider(context);

    test('getBytesPerPixel returns expected values', () => {
        assert.strictEqual(getBytesPerPixel('uint8'), 1);
        assert.strictEqual(getBytesPerPixel('uint16'), 2);
        assert.strictEqual(getBytesPerPixel('int16'), 2);
        assert.strictEqual(getBytesPerPixel('float32'), 4);
        assert.strictEqual(getBytesPerPixel('int32'), 4);
        assert.strictEqual(getBytesPerPixel('float64'), 8);
        assert.strictEqual(getBytesPerPixel('unknown' as any), 4);
    });

    test('supported extensions include mhd', () => {
        assert.ok(CONSTANTS.SUPPORTED_EXTENSIONS.includes('.mhd'));
    });

    test('package contributes mhd as an optional custom editor and keeps raw/bin default viewer separate', async () => {
        const manifest = await readPackageManifest();
        const binaryEditor = manifest.contributes.customEditors.find((editor: any) =>
            editor.viewType === CONSTANTS.VIEW_TYPES.BINARY_EDITOR
        );
        const mhdEditor = manifest.contributes.customEditors.find((editor: any) =>
            editor.viewType === CONSTANTS.VIEW_TYPES.MHD_EDITOR
        );

        assert.ok(binaryEditor);
        assert.deepStrictEqual(binaryEditor.selector, [
            { filenamePattern: '*.raw' },
            { filenamePattern: '*.bin' }
        ]);
        assert.ok(!binaryEditor.selector.some((selector: any) => selector.filenamePattern === '*.mhd'));
        assert.ok(mhdEditor);
        assert.deepStrictEqual(mhdEditor.selector, [{ filenamePattern: '*.mhd' }]);
        assert.strictEqual(mhdEditor.priority, 'option');
    });

    test('package contributes editor title toggles for mhd text and viewer modes', async () => {
        const manifest = await readPackageManifest();
        const editorTitleMenus = manifest.contributes.menus['editor/title'];
        const openViewerMenu = editorTitleMenus.find((menu: any) =>
            menu.command === CONSTANTS.COMMANDS.OPEN_MHD_VIEWER
        );
        const openTextMenu = editorTitleMenus.find((menu: any) =>
            menu.command === CONSTANTS.COMMANDS.OPEN_MHD_TEXT
        );

        assert.ok(openViewerMenu);
        assert.ok(openViewerMenu.when.includes('resourceExtname == .mhd'));
        assert.ok(openViewerMenu.when.includes(`activeCustomEditorId != ${CONSTANTS.VIEW_TYPES.MHD_EDITOR}`));
        assert.strictEqual(openViewerMenu.group, 'navigation');
        assert.ok(openTextMenu);
        assert.strictEqual(openTextMenu.when, `activeCustomEditorId == ${CONSTANTS.VIEW_TYPES.MHD_EDITOR}`);
        assert.strictEqual(openTextMenu.group, 'navigation');
    });

    test('mhd parser reads the provided 3D float example', () => {
        const metadata = parseMhdHeader([
            'ObjectType = Image',
            'NDims = 3',
            'BinaryData = True',
            'BinaryDataByteOrderMSB = False',
            'CompressedData = False',
            'TransformMatrix = 1 0 0 0 1 0 0 0 -1',
            'Offset = -251.053588 -264.249776 -534.000000',
            'CenterOfRotation = 0 0 0',
            'AnatomicalOrientation = RAI',
            'ElementSpacing = 4.000000 4.000000 4.000000',
            'DimSize = 128 128 128',
            'ElementType = MET_FLOAT',
            'ElementDataFile = recon_combined.raw'
        ].join('\n'));

        assert.deepStrictEqual(metadata, {
            width: 128,
            height: 128,
            depth: 128,
            dataType: 'float32',
            endianness: 'little',
            elementDataFile: 'recon_combined.raw'
        });
    });

    test('mhd parser maps byte order, dimensions, and element types', () => {
        const elementTypes = new Map<string, string>([
            ['MET_DOUBLE', 'float64'],
            ['MET_UCHAR', 'uint8'],
            ['MET_CHAR', 'int8'],
            ['MET_USHORT', 'uint16'],
            ['MET_SHORT', 'int16'],
            ['MET_UINT', 'uint32'],
            ['MET_INT', 'int32']
        ]);

        for (const [elementType, dataType] of elementTypes) {
            const metadata = parseMhdHeader([
                '# comment',
                'BinaryData=True',
                'BinaryDataByteOrderMSB = True',
                'CompressedData = False',
                'DimSize = 16 8',
                `ElementType = ${elementType}`,
                'ElementDataFile = "image.raw"'
            ].join('\n'));

            assert.strictEqual(metadata.width, 16);
            assert.strictEqual(metadata.height, 8);
            assert.strictEqual(metadata.depth, 1);
            assert.strictEqual(metadata.dataType, dataType);
            assert.strictEqual(metadata.endianness, 'big');
            assert.strictEqual(metadata.elementDataFile, 'image.raw');
        }
    });

    test('mhd parser accepts ElementByteOrderMSB as the byte order field', () => {
        const metadata = parseMhdHeader([
            'BinaryData = True',
            'ElementByteOrderMSB = True',
            'CompressedData = False',
            'DimSize = 16 8 2',
            'ElementType = MET_USHORT',
            'ElementDataFile = image.raw'
        ].join('\n'));

        assert.strictEqual(metadata.endianness, 'big');
        assert.strictEqual(metadata.dataType, 'uint16');
        assert.strictEqual(metadata.depth, 2);
    });

    test('mhd parser allows quoted data filenames with spaces', () => {
        const metadata = parseMhdHeader([
            'BinaryData = True',
            'BinaryDataByteOrderMSB = False',
            'CompressedData = False',
            'DimSize = 16 8',
            'ElementType = MET_UCHAR',
            'ElementDataFile = "scan 001.raw"'
        ].join('\n'));

        assert.strictEqual(metadata.elementDataFile, 'scan 001.raw');
    });

    test('mhd parser rejects unsupported or incomplete headers', () => {
        assert.throws(() => parseMhdHeader([
            'BinaryData = True',
            'BinaryDataByteOrderMSB = False',
            'CompressedData = True',
            'DimSize = 16 16 16',
            'ElementType = MET_FLOAT',
            'ElementDataFile = image.raw'
        ].join('\n')), /CompressedData must be False/);

        assert.throws(() => parseMhdHeader([
            'BinaryData = True',
            'BinaryDataByteOrderMSB = False',
            'CompressedData = False',
            'DimSize = 16 16 16',
            'ElementType = MET_FLOAT'
        ].join('\n')), /missing ElementDataFile/);

        assert.throws(() => parseMhdHeader([
            'BinaryData = True',
            'BinaryDataByteOrderMSB = False',
            'CompressedData = False',
            'DimSize = 16 16 16',
            'ElementType = MET_LONG',
            'ElementDataFile = image.raw'
        ].join('\n')), /Unsupported MHD ElementType/);

        assert.throws(() => parseMhdHeader([
            'BinaryData = True',
            'BinaryDataByteOrderMSB = False',
            'CompressedData = False',
            'DimSize = 16 16 16',
            'ElementType = MET_FLOAT',
            'ElementDataFile = LIST'
        ].join('\n')), /Unsupported MHD ElementDataFile/);
    });

    test('mhd data file resolver keeps data files local to the metadata folder', () => {
        const metadataPath = path.join('D:', 'images', 'case', 'image.mhd');
        const dataPath = resolveMhdDataFilePath(metadataPath, 'recon.raw');

        assert.strictEqual(dataPath, path.join('D:', 'images', 'case', 'recon.raw'));
        assert.throws(() => resolveMhdDataFilePath(metadataPath, '..\\recon.raw'), /outside the MHD folder/);
        assert.throws(() => resolveMhdDataFilePath(metadataPath, 'file://recon.raw'), /URI values/);
    });

    test('calculateMaxSlices computes correct slice count', () => {
        const fileSize = 200;
        const slices = calculateMaxSlices(fileSize, 10, 5, 'uint8');
        assert.strictEqual(slices, 4);
    });

    test('slice reader computes axial slice byte ranges', () => {
        const reader = new SliceReader();
        const range = reader.getAxialSliceRange(400, 10, 5, 2, 'uint16');
        assert.deepStrictEqual(range, { offset: 200, length: 100 });
    });

    test('slice reader computes coronal slice byte ranges', () => {
        const reader = new SliceReader();
        const result = reader.getCoronalSliceRanges(400, 10, 5, 2, 'uint16');
        assert.strictEqual(result.resultWidth, 10);
        assert.strictEqual(result.resultHeight, 4);
        assert.deepStrictEqual(result.ranges, [
            { offset: 40, length: 20 },
            { offset: 140, length: 20 },
            { offset: 240, length: 20 },
            { offset: 340, length: 20 }
        ]);
    });

    test('applyWindowLevel maps values into 0-255 range', () => {
        const values = [0, 50, 100, 150];
        const mapped = applyWindowLevel(values, 0, 100);
        assert.deepStrictEqual(Array.from(mapped), [0, 128, 255, 255]);
    });

    test('generated HTML includes window controls', () => {
        const asAny = provider as any;
        const html: string = asAny.getHtmlForWebview({} as any);
        assert.ok(html.includes('id="windowMin"'));
        assert.ok(html.includes('id="windowMax"'));
        assert.ok(html.includes('id="resetWindow"'));
        assert.ok(html.includes('id="reloadSlice"'));
    });

    test('generated HTML places file information left of the canvas and window controls on the right', () => {
        const asAny = provider as any;
        const html: string = asAny.getHtmlForWebview({} as any);
        const leftPanelIndex = html.indexOf('class="side-panel side-panel--left"');
        const canvasIndex = html.indexOf('class="canvas-container"');
        const rightPanelIndex = html.indexOf('class="side-panel side-panel--right"');
        const fileInfoIndex = html.indexOf('<h3>File Information</h3>', leftPanelIndex);
        const windowControlsIndex = html.indexOf('<h3>Window/Level Controls</h3>', rightPanelIndex);

        assert.ok(leftPanelIndex >= 0);
        assert.ok(canvasIndex > leftPanelIndex);
        assert.ok(rightPanelIndex > canvasIndex);
        assert.ok(fileInfoIndex > leftPanelIndex && fileInfoIndex < canvasIndex);
        assert.ok(windowControlsIndex > rightPanelIndex);
    });

    test('generated HTML places statistics under file information', () => {
        const asAny = provider as any;
        const html: string = asAny.getHtmlForWebview({} as any);
        const fileInfoIndex = html.indexOf('<h3>File Information</h3>');
        const statisticsIndex = html.indexOf('<h4>Statistics</h4>', fileInfoIndex);

        assert.ok(statisticsIndex > fileInfoIndex);
        assert.ok(!html.includes('id="fileName"'));
        assert.ok(html.includes('id="sliceStatMin"'));
        assert.ok(html.includes('id="sliceStatMax"'));
        assert.ok(html.includes('id="sliceStatMean"'));
        assert.ok(html.includes('id="sliceStatSum"'));
    });

    test('generated HTML narrows the left side panel independently', () => {
        const asAny = provider as any;
        const html: string = asAny.getHtmlForWebview({} as any);

        assert.ok(html.includes('.side-panel--left {'));
        assert.ok(html.includes('width: 260px;'));
        assert.ok(html.includes('class="side-panel side-panel--left"'));
        assert.ok(html.includes('class="side-panel side-panel--right"'));
    });

    test('generated HTML can shrink inside resized VS Code editor area', () => {
        const asAny = provider as any;
        const html: string = asAny.getHtmlForWebview({} as any);
        assert.ok(html.includes('overflow: auto;'));
        assert.ok(html.includes('min-height: 0;'));
        assert.ok(html.includes('ResizeObserver'));
        assert.ok(html.includes('@media (max-width: 1200px)'));
        assert.ok(html.includes('flex-direction: column;'));
        assert.ok(!html.includes('calc(100vh - 48px)'));
        assert.ok(!html.includes('min-height: 400px'));
    });

    test('generated HTML coalesces slice requests and supports manual reloads', () => {
        const asAny = provider as any;
        const html: string = asAny.getHtmlForWebview({} as any);
        assert.ok(html.includes('pendingSliceRequest'));
        assert.ok(html.includes('decodeSliceData'));
        assert.ok(html.includes('requestSlice(false)'));
        assert.ok(html.includes('requestSlice(true)'));
        assert.ok(html.includes('updateFileSize(data.fileSize)'));
        assert.ok(!html.includes('computeGlobalWindow'));
    });

    test('generated HTML caches slices and prefetches nearby axial slices', () => {
        const asAny = provider as any;
        const html: string = asAny.getHtmlForWebview({} as any);

        assert.ok(html.includes('const sliceCache = new Map();'));
        assert.ok(/const PREFETCH_RADIUS = \d+;/.test(html));
        assert.ok(html.includes('const MAX_SLICE_CACHE_ENTRIES = 24;'));
        assert.ok(html.includes('function enqueueNearbyPrefetchRequests(targetRequest)'));
        assert.ok(html.includes('targetRequest.slice - PREFETCH_RADIUS'));
        assert.ok(html.includes('targetRequest.slice + PREFETCH_RADIUS'));
        assert.ok(html.includes("request.priority = 'visible';"));
        assert.ok(html.includes("priority: 'prefetch'"));
    });

    test('generated HTML suppresses duplicate prefetches and clears slice cache on metadata changes', () => {
        const asAny = provider as any;
        const html: string = asAny.getHtmlForWebview({} as any);

        assert.ok(html.includes('function isSliceRequestKnown(cacheKey)'));
        assert.ok(html.includes('sliceCache.has(cacheKey)'));
        assert.ok(html.includes('inFlightPrefetchKeys.has(cacheKey)'));
        assert.ok(html.includes('prefetchQueue.some(request => request.cacheKey === cacheKey)'));
        assert.ok(html.includes('function clearSliceCacheAndPrefetch()'));
        assert.ok(html.includes('sliceCache.clear();'));
        assert.ok(html.includes('prefetchQueue = [];'));
        assert.ok(html.includes('clearSliceCacheAndPrefetch();'));
    });

    test('generated HTML stores stale prefetch responses without rendering over the active slice', () => {
        const asAny = provider as any;
        const html: string = asAny.getHtmlForWebview({} as any);
        const prefetchHandlerIndex = html.indexOf('function handlePrefetchSliceData(data)');
        const cacheIndex = html.indexOf('cacheSliceData(receivedData);', prefetchHandlerIndex);
        const matchIndex = html.indexOf('if (requestMatchesCurrentControls(completedRequest))', cacheIndex);
        const renderIndex = html.indexOf('displaySliceData(receivedData);', matchIndex);

        assert.ok(prefetchHandlerIndex >= 0);
        assert.ok(cacheIndex > prefetchHandlerIndex);
        assert.ok(matchIndex > cacheIndex);
        assert.ok(renderIndex > matchIndex);
    });

    test('generated HTML preserves window values across slice changes and only clips slider positions to the new slice range', () => {
        const asAny = provider as any;
        const html: string = asAny.getHtmlForWebview({} as any);
        const displayIndex = html.indexOf('function displaySliceData(data)');
        const updateIndex = html.indexOf('updateSliceRange(currentSliceData);', displayIndex);
        const renderIndex = html.indexOf('renderSlice(currentSliceData);', updateIndex);
        const resetIndex = html.indexOf('resetWindowToSliceRange();', updateIndex);
        assert.ok(updateIndex >= 0);
        assert.ok(renderIndex > updateIndex);
        assert.ok(resetIndex === -1 || resetIndex > renderIndex);
        assert.ok(html.includes('clipWindowValueToSliceRange(windowMin)'));
        assert.ok(!html.includes('syncWindowToSliceRange()'));
        assert.ok(!html.includes('windowMin = clippedWindowMin;'));
        assert.ok(!html.includes('windowMax = clippedWindowMax;'));
        assert.ok(html.includes('windowMinInput.min = controlMin;'));
        assert.ok(html.includes('windowMaxInput.max = controlMax;'));
    });

    test('generated HTML computes and clears slice statistics from decoded slice values', () => {
        const asAny = provider as any;
        const html: string = asAny.getHtmlForWebview({} as any);

        assert.ok(html.includes('function computeSliceStatistics(data)'));
        assert.ok(html.includes('let sum = min;'));
        assert.ok(html.includes('mean: sum / numPixels'));
        assert.ok(html.includes('updateSliceStatisticsDisplay(statistics);'));
        assert.ok(html.includes('clearSliceStatistics();'));
    });

    test('generated HTML applies mhd metadata defaults and auto-loads the first slice', () => {
        const asAny = provider as any;
        const html: string = asAny.getHtmlForWebview({} as any);
        const fileInfoIndex = html.indexOf('function handleFileInfo(info)');
        const applyIndex = html.indexOf('applyMetadataFromFileInfo(info);', fileInfoIndex);
        const loadIndex = html.indexOf('loadSlice();', applyIndex);

        assert.ok(html.includes('function applyMetadataFromFileInfo(info)'));
        assert.ok(html.includes("widthInput.value = String(info.width);"));
        assert.ok(html.includes("heightInput.value = String(info.height);"));
        assert.ok(html.includes('dataTypeSelect.value = info.dataType;'));
        assert.ok(html.includes("endiannessSelect.value = info.endianness === 'big' ? 'big' : 'little';"));
        assert.ok(html.includes('Number.isFinite(fileInfo.depth) && fileInfo.depth > 0'));
        assert.ok(applyIndex > fileInfoIndex);
        assert.ok(loadIndex > applyIndex);
    });

    test('mhd document resolves data file and sends metadata file info', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'binary-image-viewer-'));
        const metadataPath = path.join(tempDir, 'image.mhd');
        const dataPath = path.join(tempDir, 'recon_combined.raw');
        const fileSize = 4 * 4 * 2 * 4;
        const header = [
            'BinaryData = True',
            'BinaryDataByteOrderMSB = False',
            'CompressedData = False',
            'DimSize = 4 4 2',
            'ElementType = MET_FLOAT',
            'ElementDataFile = recon_combined.raw'
        ].join('\n');

        try {
            await fs.writeFile(metadataPath, header);
            await fs.writeFile(dataPath, Buffer.alloc(fileSize));

            const localProvider = new BinaryImageEditorProvider(context);
            const doc = await localProvider.openCustomDocument(vscode.Uri.file(metadataPath), {} as any, {} as any);
            const resolvedDataPath = (doc as any).dataUri.fsPath;
            const resolvedMetadataPath = (doc as any).sourceUri.fsPath;
            assert.strictEqual(resolvedDataPath.toLowerCase(), dataPath.toLowerCase());

            const messages: any[] = [];
            await (localProvider as any).sendFileData({ postMessage: (message: any) => messages.push(message) }, doc);

            assert.deepStrictEqual(messages[0], {
                type: 'fileInfo',
                fileSize,
                width: 4,
                height: 4,
                depth: 2,
                dataType: 'float32',
                endianness: 'little',
                sourceFile: resolvedDataPath,
                metadataFile: resolvedMetadataPath
            });
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });

    test('open mhd viewer command switches the active mhd to the viewer custom editor', async () => {
        const calls: any[][] = [];
        const errors: string[] = [];
        const uri = vscode.Uri.file(path.join('D:', 'images', 'case', 'image.mhd'));

        await openMhdViewer(uri, {
            executeCommand: async (command: string, ...args: unknown[]) => {
                calls.push([command, ...args]);
            },
            showErrorMessage: async (message: string) => {
                errors.push(message);
            }
        });

        assert.deepStrictEqual(errors, []);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0][0], 'vscode.openWith');
        assert.strictEqual((calls[0][1] as vscode.Uri).fsPath, uri.fsPath);
        assert.strictEqual(calls[0][2], CONSTANTS.VIEW_TYPES.MHD_EDITOR);
        assert.deepStrictEqual(calls[0][3], {
            viewColumn: vscode.ViewColumn.Active,
            preview: false
        });
    });

    test('open mhd viewer command ignores extra toolbar arguments', async () => {
        const calls: any[][] = [];
        const errors: string[] = [];
        const uri = vscode.Uri.file(path.join('D:', 'images', 'case', 'image.mhd'));

        await openMhdViewer(uri, [uri], {
            executeCommand: async (command: string, ...args: unknown[]) => {
                calls.push([command, ...args]);
            },
            showErrorMessage: async (message: string) => {
                errors.push(message);
            }
        });

        assert.deepStrictEqual(errors, []);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0][0], 'vscode.openWith');
        assert.strictEqual(calls[0][2], CONSTANTS.VIEW_TYPES.MHD_EDITOR);
    });

    test('open mhd text command switches the active mhd back to the default text editor', async () => {
        const calls: any[][] = [];
        const uri = vscode.Uri.file(path.join('D:', 'images', 'case', 'image.mhd'));

        await openMhdText(uri, {
            executeCommand: async (command: string, ...args: unknown[]) => {
                calls.push([command, ...args]);
            },
            showErrorMessage: async () => undefined
        });

        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0][0], 'vscode.openWith');
        assert.strictEqual((calls[0][1] as vscode.Uri).fsPath, uri.fsPath);
        assert.strictEqual(calls[0][2], 'default');
        assert.deepStrictEqual(calls[0][3], {
            viewColumn: vscode.ViewColumn.Active,
            preview: false
        });
    });

    test('mhd toggle commands reject non-mhd targets', async () => {
        const calls: any[][] = [];
        const errors: string[] = [];
        const uri = vscode.Uri.file(path.join('D:', 'images', 'case', 'image.raw'));

        await openMhdViewer(uri, {
            executeCommand: async (command: string, ...args: unknown[]) => {
                calls.push([command, ...args]);
            },
            showErrorMessage: async (message: string) => {
                errors.push(message);
            }
        });

        assert.deepStrictEqual(calls, []);
        assert.deepStrictEqual(errors, ['Open an MHD file before switching the MHD viewer.']);
    });

    test('openCustomDocument returns a document with the same URI', async () => {
        const uri = vscode.Uri.file('/tmp/test.raw');
        const doc = await provider.openCustomDocument(uri, {} as any, {} as any);
        assert.strictEqual(doc.uri.fsPath, uri.fsPath);
        assert.ok(typeof doc.dispose === 'function');
    });
});

async function readPackageManifest(): Promise<any> {
    return JSON.parse(await fs.readFile(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8'));
}
