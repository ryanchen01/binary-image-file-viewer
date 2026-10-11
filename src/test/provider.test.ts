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
import { getBytesPerPixel } from '../utils';
import { WebviewUIManager } from '../webviewUIManager';
import { createViewer } from './viewerHarness';

suite('BinaryImageEditorProvider', () => {
    const provider = new BinaryImageEditorProvider();

    test('getBytesPerPixel returns expected values', () => {
        assert.strictEqual(getBytesPerPixel('uint8'), 1);
        assert.strictEqual(getBytesPerPixel('uint16'), 2);
        assert.strictEqual(getBytesPerPixel('int16'), 2);
        assert.strictEqual(getBytesPerPixel('float32'), 4);
        assert.strictEqual(getBytesPerPixel('int32'), 4);
        assert.strictEqual(getBytesPerPixel('float64'), 8);
        assert.throws(() => getBytesPerPixel('unknown' as any), /Unsupported data type/);
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
        const metadataPath = path.join(os.tmpdir(), 'images', 'case', 'image.mhd');
        const dataPath = resolveMhdDataFilePath(metadataPath, 'recon.raw');

        assert.strictEqual(dataPath, path.join(path.dirname(metadataPath), 'recon.raw'));
        assert.strictEqual(resolveMhdDataFilePath(metadataPath, '..scan.raw'), path.join(path.dirname(metadataPath), '..scan.raw'));
        assert.throws(() => resolveMhdDataFilePath(metadataPath, '../recon.raw'), /outside the MHD folder/);
        assert.throws(() => resolveMhdDataFilePath(metadataPath, '..'), /outside the MHD folder/);
        assert.throws(() => resolveMhdDataFilePath(metadataPath, 'file://recon.raw'), /URI values/);
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

    test('generated HTML includes window controls', () => {
        const html = new WebviewUIManager().getHtmlForWebview();
        assert.ok(html.includes('id="windowMin"'));
        assert.ok(html.includes('id="windowMax"'));
        assert.ok(html.includes('id="resetWindow"'));
        assert.ok(html.includes('id="reloadSlice"'));
    });

    test('generated HTML places file information left of the canvas and window controls on the right', () => {
        const html = new WebviewUIManager().getHtmlForWebview();
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
        const html = new WebviewUIManager().getHtmlForWebview();
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
        const html = new WebviewUIManager().getHtmlForWebview();

        assert.ok(html.includes('.side-panel--left {'));
        assert.ok(html.includes('width: 260px;'));
        assert.ok(html.includes('class="side-panel side-panel--left"'));
        assert.ok(html.includes('class="side-panel side-panel--right"'));
    });

    test('generated HTML can shrink inside resized VS Code editor area', () => {
        const html = new WebviewUIManager().getHtmlForWebview();
        assert.ok(html.includes('overflow: auto;'));
        assert.ok(html.includes('min-height: 0;'));
        assert.ok(html.includes('ResizeObserver'));
        assert.ok(html.includes('@media (max-width: 1200px)'));
        assert.ok(html.includes('flex-direction: column;'));
        assert.ok(!html.includes('calc(100vh - 48px)'));
        assert.ok(!html.includes('min-height: 400px'));
    });

    test('mhd parser rejects malformed and unsafe dimensions without truncating them', () => {
        for (const dimensions of ['16junk 8', '2.5 8', '1e3 8', '9007199254740993 8', '0 8', '-1 8']) {
            assert.throws(() => parseMhdHeader([
                'BinaryData = True',
                'BinaryDataByteOrderMSB = False',
                'CompressedData = False',
                `DimSize = ${dimensions}`,
                'ElementType = MET_UCHAR',
                'ElementDataFile = image.raw'
            ].join('\n')), /DimSize/, dimensions);
        }
    });

    test('slice byte ranges reject fractional, non-finite, and unsafe dimensions and indices', () => {
        const reader = new SliceReader();
        for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
            for (const [width, height] of [[invalid, 2], [2, invalid]]) {
                assert.throws(() => reader.getAxialSliceRange(16, width, height, 0, 'uint8'));
                assert.throws(() => reader.getCoronalSliceRanges(16, width, height, 0, 'uint8'));
            }
        }
        for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
            assert.throws(() => reader.getAxialSliceRange(16, 2, 2, invalid, 'uint8'));
            assert.throws(() => reader.getCoronalSliceRanges(16, 2, 2, invalid, 'uint8'));
        }
    });

    test('slice controls reject fractional dimensions and fractional or empty indices', () => {
        for (const [field, value] of [['width', '2.5'], ['height', '2.5'], ['slice', '0.5'], ['slice', '']]) {
            const viewer = createViewer();
            viewer.configure();
            viewer.getElement(field).value = value;
            viewer.getElement('loadSlice').listeners.get('click')!();
            assert.strictEqual(viewer.postedMessages.filter(message => message.type === 'readSlice').length, 0, `${field}=${value}`);
            assert.ok(viewer.getElement('errorMessage').textContent.length > 0);
        }
    });

    test('a refreshed file size cannot paint a response after it resets the selected slice', () => {
        const viewer = createViewer();
        viewer.configure(2, 2, 10);
        viewer.navigate(5);
        const request = viewer.postedMessages.find(message => message.type === 'readSlice' && message.priority === 'visible');
        assert.ok(request);
        viewer.receive({
            ...request,
            type: 'sliceData',
            encoding: 'binary',
            data: new Uint8Array([1, 2, 3, 4]).buffer,
            fileSize: 4
        });
        viewer.flush();
        assert.strictEqual(viewer.getElement('slice').value, '0');
        assert.strictEqual(viewer.getElement('slice').max, '0');
        assert.strictEqual(viewer.getElement('sliceSlider').value, '0');
        assert.strictEqual(viewer.painted.length, 0, 'slice 5 must not render when the refreshed controls select slice 0');
    });

    test('mhd metadata sets controls and requests the first slice', () => {
        const viewer = createViewer();
        viewer.receive({ type: 'fileInfo', fileSize: 128, width: 4, height: 4, depth: 4, dataType: 'uint16', endianness: 'big' });
        assert.strictEqual(viewer.getElement('width').value, '4');
        assert.strictEqual(viewer.getElement('height').value, '4');
        assert.strictEqual(viewer.getElement('dataType').value, 'uint16');
        assert.strictEqual(viewer.getElement('endianness').value, 'big');
        assert.strictEqual(viewer.getElement('slice').max, '3');
        const request = viewer.postedMessages.find(message => message.type === 'readSlice' && message.priority === 'visible');
        assert.ok(request);
        assert.strictEqual(request.slice, 0);
        assert.strictEqual(request.width, 4);
        assert.strictEqual(request.height, 4);
        assert.strictEqual(request.dataType, 'uint16');
        assert.strictEqual(request.endianness, false);
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

            const localProvider = new BinaryImageEditorProvider();
            const doc = await localProvider.openCustomDocument(vscode.Uri.file(metadataPath), {} as any, {} as any);
            const resolvedDataPath = (doc as any).dataUri.fsPath;
            const resolvedMetadataPath = doc.uri.fsPath;
            assert.strictEqual(resolvedDataPath.toLowerCase(), dataPath.toLowerCase());

            const messages: any[] = [];
            let receive!: (message: any) => Promise<void>;
            await localProvider.resolveCustomEditor(doc, {
                webview: {
                    postMessage: (message: any) => messages.push(message),
                    onDidReceiveMessage: (listener: any) => { receive = listener; return { dispose: () => undefined }; }
                },
                onDidDispose: () => undefined
            } as any, {} as any);
            await receive({ type: 'ready' });

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
