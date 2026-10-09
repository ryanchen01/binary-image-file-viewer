import * as assert from 'assert';
import * as vm from 'vm';
import { WebviewUIManager } from '../webviewUIManager';

interface TestElement {
    value: string;
    textContent: string;
    hidden: boolean;
    style: Record<string, string>;
    offsetWidth: number;
    offsetHeight: number;
    listeners: Map<string, (event?: unknown) => void>;
    addEventListener(type: string, listener: (event?: unknown) => void): void;
}

function createViewer() {
    const elements = new Map<string, TestElement>();
    const getElement = (id: string): TestElement => {
        let element = elements.get(id);
        if (!element) {
            element = {
                value: id === 'endianness' ? 'little' : '0',
                textContent: '', hidden: true, style: {},
                offsetWidth: 180, offsetHeight: 60,
                listeners: new Map(),
                addEventListener(type, listener) { this.listeners.set(type, listener); }
            };
            elements.set(id, element);
        }
        return element;
    };
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    const canvas = Object.assign(getElement('imageCanvas'), {
        getBoundingClientRect: () => rect,
        getContext: () => ({
            createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
            putImageData: () => undefined
        }),
        parentElement: { getBoundingClientRect: () => ({ width: 240, height: 140 }) }
    });
    const windowListeners = new Map<string, () => void>();
    const context = vm.createContext({
        Uint8Array, ArrayBuffer, DataView,
        document: { getElementById: getElement, addEventListener: () => undefined },
        window: {
            innerWidth: 360, innerHeight: 180,
            addEventListener: (type: string, listener: () => void) => windowListeners.set(type, listener)
        },
        acquireVsCodeApi: () => ({ postMessage: () => undefined }),
        requestAnimationFrame: (callback: () => void) => { callback(); return 1; }
    });
    const html = new WebviewUIManager().getHtmlForWebview();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script);
    vm.runInContext(script, context);

    return {
        tooltip: getElement('pixelTooltip'), rect, getElement, windowListeners,
        display(rawData: Uint8Array, dataType = 'uint8', littleEndian = true, slice = 0, plane = 'axial') {
            getElement('endianness').value = littleEndian ? 'little' : 'big';
            context.sliceData = { width: 2, height: 2, rawData, dataType, slice, plane };
            vm.runInContext('displaySliceData(sliceData);', context);
        },
        hover(clientX = 250, clientY = 125) {
            canvas.listeners.get('mousemove')!({ clientX, clientY });
        },
        leave() { canvas.listeners.get('mouseleave')!(); },
        setWindow() {
            getElement('windowMin').value = '0';
            getElement('windowMax').value = '1';
            getElement('windowMin').listeners.get('input')!();
        }
    };
}

suite('Pixel hover', () => {
    const types = [
        { type: 'uint8', value: 250, size: 1 },
        { type: 'int8', value: -120, size: 1 },
        { type: 'uint16', value: 60000, size: 2 },
        { type: 'int16', value: -12345, size: 2 },
        { type: 'uint32', value: 4000000000, size: 4 },
        { type: 'int32', value: -2000000000, size: 4 },
        { type: 'float32', value: -12.125, size: 4 },
        { type: 'float64', value: 1.2345678901234567, size: 8 }
    ];
    for (const { type, value, size } of types) {
        for (const littleEndian of [true, false]) {
            test(`shows original ${type} value with ${littleEndian ? 'little' : 'big'} byte order on a scaled canvas`, () => {
                const viewer = createViewer();
                const rawData = new Uint8Array(size * 4);
                const view = new DataView(rawData.buffer);
                const offset = size * 3;
                switch (type) {
                    case 'uint8': view.setUint8(offset, value); break;
                    case 'int8': view.setInt8(offset, value); break;
                    case 'uint16': view.setUint16(offset, value, littleEndian); break;
                    case 'int16': view.setInt16(offset, value, littleEndian); break;
                    case 'uint32': view.setUint32(offset, value, littleEndian); break;
                    case 'int32': view.setInt32(offset, value, littleEndian); break;
                    case 'float32': view.setFloat32(offset, value, littleEndian); break;
                    case 'float64': view.setFloat64(offset, value, littleEndian); break;
                }
                // Use a subarray to also exercise nonzero byte offsets.
                const padded = new Uint8Array(rawData.length + 5);
                padded.set(rawData, 5);
                viewer.display(padded.subarray(5), type, littleEndian);
                viewer.hover();
                assert.strictEqual(viewer.tooltip.hidden, false);
                assert.strictEqual(viewer.tooltip.textContent, `Pixel (x: 1, y: 1)\nSlice: 0 (axial)\nValue: ${value}`);
                viewer.setWindow();
                assert.ok(viewer.tooltip.textContent.endsWith(`Value: ${value}`));
            });
        }
    }

    test('updates the value and displayed coordinates after slice, plane, and size changes', () => {
        const viewer = createViewer();
        viewer.display(new Uint8Array([1, 2, 3, 4]));
        viewer.hover();
        viewer.display(new Uint8Array([5, 6, 7, 8]), 'uint8', true, 3, 'coronal');
        assert.strictEqual(viewer.tooltip.textContent, 'Pixel (x: 1, y: 1)\nSlice: 3 (coronal)\nValue: 8');
        viewer.rect.width = 400;
        viewer.rect.height = 200;
        viewer.windowListeners.get('resize')!();
        assert.strictEqual(viewer.tooltip.textContent, 'Pixel (x: 0, y: 0)\nSlice: 3 (coronal)\nValue: 5');
    });

    test('hides without an image, outside the image, on exit, on scroll, and on metadata edits', () => {
        const viewer = createViewer();
        viewer.hover();
        assert.strictEqual(viewer.tooltip.hidden, true);
        viewer.display(new Uint8Array([1, 2, 3, 4]));
        for (const [x, y] of [[99, 50], [100, 49], [300, 50], [100, 150]]) {
            viewer.hover(x, y);
            assert.strictEqual(viewer.tooltip.hidden, true);
        }
        viewer.hover(100, 50);
        assert.ok(viewer.tooltip.textContent.includes('Pixel (x: 0, y: 0)'));
        viewer.leave();
        assert.strictEqual(viewer.tooltip.hidden, true);
        viewer.hover();
        viewer.windowListeners.get('scroll')!();
        assert.strictEqual(viewer.tooltip.hidden, true);
        viewer.hover();
        viewer.getElement('width').listeners.get('input')!();
        assert.strictEqual(viewer.tooltip.hidden, true);
    });

    test('keeps the tooltip inside the viewport near its bottom right edge', () => {
        const viewer = createViewer();
        viewer.display(new Uint8Array([1, 2, 3, 4]));
        viewer.hover();
        assert.strictEqual(viewer.tooltip.style.left, '58px');
        assert.strictEqual(viewer.tooltip.style.top, '53px');
    });

    for (const value of [NaN, Infinity, -Infinity, -0]) {
        test(`displays floating-point ${Object.is(value, -0) ? '-0' : String(value)} without replacing it`, () => {
            const viewer = createViewer();
            const bytes = new Uint8Array(32);
            new DataView(bytes.buffer).setFloat64(24, value, true);
            viewer.display(bytes, 'float64');
            viewer.hover();
            assert.ok(viewer.tooltip.textContent.endsWith('Value: ' + (Object.is(value, -0) ? '-0' : String(value))));
        });
    }
});
