import * as path from 'path';
import { CONSTANTS, SupportedDataType } from './constants';

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) {
        return '0 Bytes';
    }
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get bytes per pixel for a given data type
 */
export function getBytesPerPixel(dataType: SupportedDataType): number {
    switch (dataType) {
        case 'uint8':
        case 'int8':
            return 1;
        case 'uint16':
        case 'int16':
            return 2;
        case 'float32':
        case 'uint32':
        case 'int32':
            return 4;
        case 'float64':
            return 8;
        default:
            return 4; // default to float32
    }
}

/**
 * Validate image metadata
 */
export function validateMetadata(width: number, height: number, dataType: SupportedDataType): void {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        throw new Error('Invalid width or height');
    }
    if (!CONSTANTS.SUPPORTED_DATA_TYPES.includes(dataType)) {
        throw new Error(`Unsupported data type: ${dataType}`);
    }
}

/**
 * Get file name from URI
 */
export function getFileName(uri: string): string {
    return path.basename(uri);
}

/**
 * Calculate max slices based on file size and dimensions
 */
export function calculateMaxSlices(fileSize: number, width: number, height: number, dataType: SupportedDataType): number {
    const bytesPerPixel = getBytesPerPixel(dataType);
    const sliceSize = width * height * bytesPerPixel;
    return Math.floor(fileSize / sliceSize);
}

/**
 * Apply window/level to values and map to 0-255 range
 */
export function applyWindowLevel(values: number[], windowMin: number, windowMax: number): Uint8ClampedArray {
    const range = windowMax - windowMin || 1;
    const output = new Uint8ClampedArray(values.length);
    for (let i = 0; i < values.length; i++) {
        let normalized = (values[i] - windowMin) / range;
        if (normalized < 0) {
            normalized = 0;
        } else if (normalized > 1) {
            normalized = 1;
        }
        output[i] = Math.round(normalized * 255);
    }
    return output;
}

/**
 * Find min and max values in an array
 */
export function findMinMax(values: number[]): { min: number; max: number } {
    let min = values[0];
    let max = values[0];
    for (let i = 1; i < values.length; i++) {
        const v = values[i];
        if (v < min) {
            min = v;
        }
        if (v > max) {
            max = v;
        }
    }
    return { min, max };
}