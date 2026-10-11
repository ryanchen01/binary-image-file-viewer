import { DATA_TYPES } from './dataTypes';

// Keep this script self-contained. A Blob worker works in a VS Code webview,
// and storing the source as a string also keeps production minification safe.
export const RENDER_WORKER_SOURCE = `
const dataTypes = ${JSON.stringify(DATA_TYPES)};
let slice = null;
let reader = null;
let statistics = null;

self.onmessage = event => {
    const request = event.data;
    if (request.type === 'clear') {
        slice = null;
        reader = null;
        statistics = null;
        return;
    }
    try {
        if (request.slice) {
            slice = request.slice;
            const descriptor = dataTypes[slice.dataType];
            if (!Object.prototype.hasOwnProperty.call(dataTypes, slice.dataType)) {
                throw new Error('Unsupported data type: ' + slice.dataType);
            }
            const view = new DataView(slice.rawData.buffer, slice.rawData.byteOffset, slice.rawData.byteLength);
            reader = {
                size: descriptor.bytesPerPixel,
                get: offset => view[descriptor.getter](offset, slice.endianness)
            };
            const count = slice.width * slice.height;
            if (!Number.isSafeInteger(count) || count <= 0 || count * reader.size > slice.rawData.byteLength) {
                throw new Error('Invalid slice dimensions or byte length');
            }
            statistics = slice.statistics;
            if (!statistics) {
                let min = reader.get(0);
                let max = min;
                let sum = min;
                for (let i = 1; i < count; i++) {
                    const value = reader.get(i * reader.size);
                    if (value < min) { min = value; }
                    if (value > max) { max = value; }
                    sum += value;
                }
                statistics = { min, max, sum, mean: sum / count };
            }
        }
        if (!slice) { throw new Error('No slice loaded in renderer'); }

        const min = request.windowMin === null ? statistics.min : request.windowMin;
        const max = request.windowMax === null ? statistics.max : request.windowMax;
        const range = max - min || 1;
        const count = slice.width * slice.height;
        const buffer = request.pixels && request.pixels.byteLength === count * 4
            ? request.pixels : new ArrayBuffer(count * 4);
        const pixels = new Uint8ClampedArray(buffer);
        for (let i = 0; i < count; i++) {
            const value = reader.get(i * reader.size);
            let normalized = (value - min) / range;
            if (normalized < 0) { normalized = 0; }
            else if (normalized > 1) { normalized = 1; }
            const grayscale = Math.round(normalized * 255);
            const offset = i * 4;
            pixels[offset] = grayscale;
            pixels[offset + 1] = grayscale;
            pixels[offset + 2] = grayscale;
            pixels[offset + 3] = 255;
        }
        self.postMessage({
            type: 'rendered', renderId: request.renderId,
            width: slice.width, height: slice.height,
            statistics, pixels: buffer
        }, [buffer]);
    } catch (error) {
        self.postMessage({ type: 'error', renderId: request.renderId, message: String(error) });
    }
};
`;
