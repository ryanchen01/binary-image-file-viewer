// Keep this script self-contained. A Blob worker works in a VS Code webview,
// and storing the source as a string also keeps production minification safe.
export const RENDER_WORKER_SOURCE = `
let slice = null;
let reader = null;
let statistics = null;

function createReader(rawData, dataType, littleEndian) {
    const view = new DataView(rawData.buffer, rawData.byteOffset, rawData.byteLength);
    switch (dataType) {
        case 'uint8': return { size: 1, get: offset => view.getUint8(offset) };
        case 'int8': return { size: 1, get: offset => view.getInt8(offset) };
        case 'uint16': return { size: 2, get: offset => view.getUint16(offset, littleEndian) };
        case 'int16': return { size: 2, get: offset => view.getInt16(offset, littleEndian) };
        case 'uint32': return { size: 4, get: offset => view.getUint32(offset, littleEndian) };
        case 'int32': return { size: 4, get: offset => view.getInt32(offset, littleEndian) };
        case 'float32': return { size: 4, get: offset => view.getFloat32(offset, littleEndian) };
        case 'float64': return { size: 8, get: offset => view.getFloat64(offset, littleEndian) };
        default: throw new Error('Unsupported data type: ' + dataType);
    }
}

function computeStatistics(count) {
    let min = reader.get(0);
    let max = min;
    let sum = min;
    for (let i = 1; i < count; i++) {
        const value = reader.get(i * reader.size);
        if (value < min) { min = value; }
        if (value > max) { max = value; }
        sum += value;
    }
    return { min, max, sum, mean: sum / count };
}

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
            reader = createReader(slice.rawData, slice.dataType, slice.endianness);
            const count = slice.width * slice.height;
            if (!Number.isSafeInteger(count) || count <= 0 || count * reader.size > slice.rawData.byteLength) {
                throw new Error('Invalid slice dimensions or byte length');
            }
            statistics = slice.statistics || computeStatistics(count);
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
