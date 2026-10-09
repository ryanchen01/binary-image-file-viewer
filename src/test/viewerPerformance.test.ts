import * as assert from 'assert';
import * as vm from 'vm';
import { RENDER_WORKER_SOURCE } from '../renderWorker';
import { createViewer } from './viewerHarness';

suite('Worker rendering and navigation', () => {
    test('renders every datatype and byte order with matching statistics', () => {
        const types = [
            ['uint8', 1, 'setUint8'], ['int8', 1, 'setInt8'],
            ['uint16', 2, 'setUint16'], ['int16', 2, 'setInt16'],
            ['uint32', 4, 'setUint32'], ['int32', 4, 'setInt32'],
            ['float32', 4, 'setFloat32'], ['float64', 8, 'setFloat64']
        ] as const;
        for (const [type, size, setter] of types) {
            for (const littleEndian of [true, false]) {
                const bytes = new Uint8Array(size * 4 + 3);
                const view = new DataView(bytes.buffer);
                [0, 25, 50, 100].forEach((value, i) => view[setter](3 + i * size, value, littleEndian));
                const viewer = createViewer();
                viewer.display(bytes.subarray(3), type, littleEndian);
                assert.deepStrictEqual(Array.from(viewer.painted[0]), [
                    0, 0, 0, 255, 64, 64, 64, 255, 128, 128, 128, 255, 255, 255, 255, 255
                ]);
                assert.strictEqual(viewer.getElement('sliceStatMin').textContent, '0');
                assert.strictEqual(viewer.getElement('sliceStatMax').textContent, '100');
                assert.strictEqual(viewer.getElement('sliceStatSum').textContent, '175');
                assert.strictEqual(viewer.getElement('sliceStatMean').textContent, '43.75');
            }
        }
    });

    test('coalesces slider events, reuses pixels and statistics, and stays live during an outstanding render', () => {
        const viewer = createViewer();
        const bytes = new Uint8Array([0, 25, 50, 100]);
        viewer.display(bytes);
        const resets = viewer.canvasResets();
        viewer.setWindow('0', '75', false);
        viewer.setWindow('0', '50', false);
        viewer.flushFrames();
        assert.strictEqual(viewer.workerMessages.length, 2);
        assert.strictEqual(viewer.workerMessages[1].windowMax, 50);
        assert.ok(!viewer.workerMessages[1].slice, 'slider updates must not copy the slice again');
        assert.strictEqual(viewer.workerMessages[1].pixels.byteLength, 16);
        assert.strictEqual(viewer.painted.length, 1, 'conversion waits for the worker');
        viewer.setWindow('0', '100', false);
        viewer.setWindow('25', '100', false);
        viewer.flushJobs(); viewer.flushReplies();
        assert.strictEqual(viewer.painted.length, 2, 'intermediate frame paints before dragging ends');
        viewer.flush();
        assert.strictEqual(viewer.workerMessages.length, 3);
        assert.strictEqual(viewer.workerMessages[2].windowMin, 25);
        assert.strictEqual(viewer.workerMessages[2].windowMax, 100);
        assert.strictEqual(viewer.canvasResets(), resets);
        assert.deepStrictEqual(Array.from(bytes), [0, 25, 50, 100], 'cache/hover buffer must stay attached');
        assert.strictEqual(viewer.run('currentSliceData.statistics.sum'), 175);
    });

    test('does not paint a stale worker result over a new slice', () => {
        const viewer = createViewer();
        viewer.display(new Uint8Array([0, 25, 50, 100]));
        viewer.setWindow('0', '50', false);
        viewer.flushFrames();
        viewer.context.nextSlice = { width: 2, height: 2, rawData: new Uint8Array([5, 6, 7, 8]), dataType: 'uint8', slice: 1 };
        viewer.run('displaySliceData(nextSlice);');
        viewer.flushJobs(); viewer.flushReplies();
        assert.strictEqual(viewer.painted.length, 1);
        viewer.flush();
        assert.strictEqual(viewer.painted.length, 2);
        viewer.hover();
        assert.strictEqual(viewer.pixelInfo().value, '8');
    });

    test('metadata invalidation discards active rendering and teardown terminates the worker', () => {
        const viewer = createViewer();
        viewer.display(new Uint8Array([1, 2, 3, 4]));
        viewer.setWindow('0', '2', false); viewer.flushFrames();
        viewer.getElement('width').listeners.get('input')!();
        viewer.flush();
        assert.strictEqual(viewer.painted.length, 1);
        assert.strictEqual(viewer.run('currentSliceData'), null);
        viewer.windowListeners.get('pagehide')!();
        assert.strictEqual(viewer.workerTerminations(), 1);
    });

    test('enforces a byte budget, preserves LRU order, and skips oversized entries', () => {
        const viewer = createViewer(8);
        viewer.context.cacheData = [0, 1, 2].map(slice => ({ cacheKey: String(slice), rawData: new Uint8Array(4) }));
        viewer.run("cacheSliceData(cacheData[0]); cacheSliceData(cacheData[1]); getCachedSlice('0'); cacheSliceData(cacheData[2]);");
        assert.strictEqual(viewer.run("sliceCache.has('0') && sliceCache.has('2') && !sliceCache.has('1')"), true);
        assert.strictEqual(viewer.run('sliceCacheBytes'), 8);
        viewer.run('cacheSliceData({cacheKey: "large", rawData: new Uint8Array(9)});');
        assert.strictEqual(viewer.run('sliceCacheBytes'), 8);
        assert.strictEqual(viewer.run("sliceCache.has('large')"), false);
        viewer.run('cacheSliceData(cacheData[2]);');
        assert.strictEqual(viewer.run('sliceCacheBytes'), 8, 'replacements must not double count');
        viewer.run('clearSliceCacheAndPrefetch();');
        assert.strictEqual(viewer.run('sliceCacheBytes'), 0);
        const small = createViewer(2);
        small.display(new Uint8Array([1, 2, 3, 4]));
        assert.strictEqual(small.painted.length, 1, 'oversized slices must still display');
    });

    test('keeps only nearest current neighbors after jumps and reduces prefetching for large slices', () => {
        const viewer = createViewer();
        viewer.configure();
        for (const slice of [10, 100, 200, 300, 400, 500]) { viewer.navigate(slice); }
        assert.deepStrictEqual(Array.from(viewer.run('prefetchQueue.map(request => request.slice)')), [501, 499, 502, 498, 503, 497, 504, 496, 505, 495]);
        assert.strictEqual(viewer.postedMessages.filter(message => message.type === 'cancelSlice').length, 1);
        const bounded = createViewer(12);
        bounded.configure(); bounded.navigate(50);
        assert.deepStrictEqual(Array.from(bounded.run('prefetchQueue.map(request => request.slice)')), [51, 49]);
    });

    test('drops cancelled data before decoding and advances directly to the latest visible request', () => {
        const viewer = createViewer();
        viewer.configure(); viewer.navigate(10);
        const first = viewer.postedMessages.find(message => message.priority === 'visible');
        viewer.navigate(100); viewer.navigate(200);
        viewer.receive({ type: 'sliceData', requestId: first.requestId, encoding: 'base64', data: 'invalid!' });
        assert.strictEqual(viewer.getElement('errorMessage').textContent, '');
        assert.strictEqual(viewer.run('sliceCache.size'), 0);
        const visible = viewer.postedMessages.filter(message => message.priority === 'visible');
        assert.strictEqual(visible.length, 2);
        assert.strictEqual(visible[1].slice, 200);
    });

    test('ignores old cancellation errors after reload', () => {
        const viewer = createViewer(); viewer.configure(); viewer.navigate(10);
        const first = viewer.postedMessages.find(message => message.priority === 'visible');
        viewer.run('requestSlice(true);');
        const activeId = viewer.run('activeSliceRequest.requestId');
        viewer.receive({ type: 'error', requestId: first.requestId, cancelled: true, message: 'cancelled' });
        assert.strictEqual(viewer.run('activeSliceRequest.requestId'), activeId);
        assert.strictEqual(viewer.getElement('errorMessage').textContent, '');
    });

    test('drops cancelled prefetch data before decoding', () => {
        const viewer = createViewer(); viewer.configure(); viewer.navigate(10);
        const visible = viewer.postedMessages.find(message => message.priority === 'visible');
        viewer.receive({ ...visible, type: 'sliceData', data: new Uint8Array([1, 2, 3, 4]), fileSize: 4000 });
        const prefetch = viewer.postedMessages.find(message => message.priority === 'prefetch');
        assert.ok(prefetch);
        viewer.navigate(100);
        viewer.receive({ ...prefetch, type: 'sliceData', encoding: 'base64', data: 'invalid!' });
        assert.strictEqual(viewer.getElement('errorMessage').textContent, '');
        assert.strictEqual(viewer.run('sliceCache.size'), 1);
    });

    test('recovers from a worker failure on the next live update', () => {
        const viewer = createViewer(); viewer.display(new Uint8Array([0, 25, 50, 100]));
        viewer.run("renderWorker.onerror({message: 'worker stopped'});");
        assert.strictEqual(viewer.workerTerminations(), 1);
        assert.ok(viewer.getElement('errorMessage').textContent.includes('worker stopped'));
        viewer.setWindow('25', '100');
        assert.strictEqual(viewer.painted.length, 2);
        assert.strictEqual(viewer.run('!!renderWorker && !activeRender'), true);
        assert.strictEqual(viewer.getElement('errorPanel').style.display, 'none');
    });

    test('worker releases volume data on clear and reports malformed slices', () => {
        const results: any[] = [];
        const self: any = { postMessage: (message: any) => results.push(message) };
        vm.runInNewContext(RENDER_WORKER_SOURCE, { self });
        self.onmessage({ data: { renderId: 1, slice: { width: 2, height: 2, dataType: 'uint16', rawData: new Uint8Array(3) } } });
        assert.strictEqual(results[0].type, 'error');
        self.onmessage({ data: { type: 'clear' } });
        self.onmessage({ data: { renderId: 2 } });
        assert.ok(results[1].message.includes('No slice loaded'));
    });
});
