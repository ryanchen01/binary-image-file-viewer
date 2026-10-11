import { DATA_TYPES } from './dataTypes';
import { CONSTANTS, SupportedDataType } from './constants';

/**
 * Get bytes per pixel for a given data type
 */
export function getBytesPerPixel(dataType: SupportedDataType): number {
    if (!Object.prototype.hasOwnProperty.call(DATA_TYPES, dataType)) {
        throw new Error(`Unsupported data type: ${dataType}`);
    }
    return DATA_TYPES[dataType].bytesPerPixel;
}

/**
 * Validate image metadata
 */
export function validateMetadata(width: number, height: number, dataType: SupportedDataType): void {
    if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
        throw new Error('Invalid width or height');
    }
    if (!CONSTANTS.SUPPORTED_DATA_TYPES.includes(dataType)) {
        throw new Error(`Unsupported data type: ${dataType}`);
    }
}
