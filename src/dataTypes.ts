/** Shared binary layout used by file reads, rendering, and pixel inspection. */
export const DATA_TYPES = {
    uint8: { bytesPerPixel: 1, getter: 'getUint8' },
    int8: { bytesPerPixel: 1, getter: 'getInt8' },
    uint16: { bytesPerPixel: 2, getter: 'getUint16' },
    int16: { bytesPerPixel: 2, getter: 'getInt16' },
    uint32: { bytesPerPixel: 4, getter: 'getUint32' },
    int32: { bytesPerPixel: 4, getter: 'getInt32' },
    float32: { bytesPerPixel: 4, getter: 'getFloat32' },
    float64: { bytesPerPixel: 8, getter: 'getFloat64' }
} as const;
