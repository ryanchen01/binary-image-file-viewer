import * as assert from 'assert';
import * as vm from 'vm';
import { WebviewUIManager } from '../webviewUIManager';

export interface TestElement {
    value: string;
    max?: string;
    textContent: string;
    style: Record<string, string>;
    listeners: Map<string, (event?: any) => void>;
    addEventListener(type: string, listener: (event?: any) => void): void;
}

/** Runs the shipped webview script with controllable frames and worker replies. */
export function createViewer(cacheBudgetBytes?: number) {
    const elements = new Map<string, TestElement>();
    const getElement = (id: string): TestElement => {
        let element = elements.get(id);
        if (!element) {
            element = {
                value: id === 'endianness' ? 'little' : '0',
                textContent: '', style: {}, listeners: new Map(),
                addEventListener(type, listener) { this.listeners.set(type, listener); }
            };
            elements.set(id, element);
        }
        return element;
    };
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    const painted: Uint8ClampedArray[] = [];
    let canvasResets = 0;
    let width = 0;
    let height = 0;
    const canvas = Object.assign(getElement('imageCanvas'), {
        getBoundingClientRect: () => rect,
        getContext: () => ({ putImageData: (image: { data: Uint8ClampedArray }) => painted.push(image.data.slice()) }),
        parentElement: { getBoundingClientRect: () => ({ width: 240, height: 140 }) }
    });
    Object.defineProperties(canvas, {
        width: { get: () => width, set: value => { width = value; canvasResets++; } },
        height: { get: () => height, set: value => { height = value; canvasResets++; } }
    });
    const frames: Array<() => void> = [];
    const jobs: Array<() => void> = [];
    const replies: Array<() => void> = [];
    const blobs = new Map<string, string>();
    const workerMessages: any[] = [];
    const postedMessages: any[] = [];
    let nextUrl = 1;
    let workerTerminations = 0;
    class MockWorker {
        onmessage?: (event: { data: any }) => void;
        onerror?: (event: { message: string }) => void;
        onmessageerror?: () => void;
        terminated = false;
        private scope: any;
        constructor(url: string) {
            this.scope = {
                postMessage: (message: any, transfers: ArrayBuffer[]) => {
                    const data = structuredClone(message, { transfer: transfers });
                    replies.push(() => { if (!this.terminated) { this.onmessage?.({ data }); } });
                }
            };
            vm.runInNewContext(blobs.get(url)!, { self: this.scope, DataView, Uint8ClampedArray, ArrayBuffer });
        }
        postMessage(message: any, transfers: ArrayBuffer[] = []) {
            const data = structuredClone(message, { transfer: transfers });
            workerMessages.push(data);
            jobs.push(() => { if (!this.terminated) { this.scope.onmessage({ data }); } });
        }
        terminate() { this.terminated = true; workerTerminations++; }
    }
    const windowListeners = new Map<string, (event?: any) => void>();
    const context = vm.createContext({
        Uint8Array, Uint8ClampedArray, ArrayBuffer, DataView, atob,
        Blob: class { source: string; constructor(parts: string[]) { this.source = parts.join(''); } },
        URL: {
            createObjectURL: (blob: { source: string }) => { const url = String(nextUrl++); blobs.set(url, blob.source); return url; },
            revokeObjectURL: (url: string) => blobs.delete(url)
        },
        Worker: MockWorker,
        ImageData: class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} },
        document: { getElementById: getElement, addEventListener: () => undefined },
        window: { addEventListener: (type: string, listener: () => void) => windowListeners.set(type, listener) },
        acquireVsCodeApi: () => ({ postMessage: (message: any) => postedMessages.push(message) }),
        requestAnimationFrame: (callback: () => void) => { frames.push(callback); return frames.length; }
    });
    const script = new WebviewUIManager().getHtmlForWebview(cacheBudgetBytes).match(/<script>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script);
    vm.runInContext(script, context);
    const run = (source: string) => vm.runInContext(source, context);
    const flushFrames = () => { const batch = frames.splice(0); batch.forEach(callback => callback()); };
    const flushJobs = () => { const batch = jobs.splice(0); batch.forEach(callback => callback()); };
    const flushReplies = () => { const batch = replies.splice(0); batch.forEach(callback => callback()); };
    const flush = () => {
        for (let i = 0; i < 20 && (frames.length || jobs.length || replies.length); i++) {
            flushFrames(); flushJobs(); flushReplies();
        }
        assert.strictEqual(frames.length + jobs.length + replies.length, 0, 'renderer must become idle');
    };
    return {
        rect, getElement, windowListeners, context, painted, workerMessages, postedMessages,
        run, flushFrames, flushJobs, flushReplies, flush,
        canvasResets: () => canvasResets, workerTerminations: () => workerTerminations,
        pixelInfo() {
            return { position: getElement('pixelPosition').textContent, value: getElement('pixelValue').textContent };
        },
        display(rawData: Uint8Array, dataType = 'uint8', littleEndian = true, slice = 0, plane = 'axial') {
            getElement('endianness').value = littleEndian ? 'little' : 'big';
            context.sliceData = { width: 2, height: 2, rawData, dataType, slice, plane, endianness: littleEndian };
            run('displaySliceData(sliceData);');
            flush();
        },
        hover(clientX = 250, clientY = 125) { canvas.listeners.get('mousemove')!({ clientX, clientY }); },
        leave() { canvas.listeners.get('mouseleave')!(); },
        setWindow(min = '0', max = '1', finish = true) {
            getElement('windowMin').value = min;
            getElement('windowMax').value = max;
            getElement('windowMin').listeners.get('input')!();
            if (finish) { flush(); }
        },
        receive(data: any) { windowListeners.get('message')!({ data }); },
        configure(width = 2, height = 2, maxSlice = 999, dataType = 'uint8') {
            getElement('width').value = String(width); getElement('height').value = String(height);
            getElement('dataType').value = dataType; getElement('slice').max = String(maxSlice);
        },
        navigate(slice: number) { getElement('slice').value = String(slice); run('requestSlice(false);'); }
    };
}
