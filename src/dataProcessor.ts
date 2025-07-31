import { SupportedDataType } from './constants';
import { getBytesPerPixel, findMinMax, applyWindowLevel } from './utils';

/**
 * Handles data type conversion, window/level calculations, and data processing
 */
export class DataProcessor {
    /**
     * Get bytes per pixel for a given data type
     */
    public getBytesPerPixel(dataType: SupportedDataType): number {
        return getBytesPerPixel(dataType);
    }

    /**
     * Compute global min and max for the entire image volume
     */
    public computeGlobalWindow(
        fileData: Uint8Array,
        _width: number,
        _height: number,
        dataType: SupportedDataType,
        endianness: boolean = true
    ): { windowMin: number; windowMax: number } {
        const bytesPerPixel = this.getBytesPerPixel(dataType);
        const numPixels = Math.floor(fileData.length / bytesPerPixel);
        const view = new DataView(fileData.buffer, fileData.byteOffset, fileData.byteLength);
        let min: number | undefined = undefined;
        let max: number | undefined = undefined;

        for (let i = 0; i < numPixels; i++) {
            let value: number;
            const offset = i * bytesPerPixel;
            
            switch (dataType) {
                case 'uint8':
                    value = view.getUint8(offset);
                    break;
                case 'int8':
                    value = view.getInt8(offset);
                    break;
                case 'uint16':
                    value = view.getUint16(offset, endianness);
                    break;
                case 'int16':
                    value = view.getInt16(offset, endianness);
                    break;
                case 'uint32':
                    value = view.getUint32(offset, endianness);
                    break;
                case 'int32':
                    value = view.getInt32(offset, endianness);
                    break;
                case 'float32':
                    value = view.getFloat32(offset, endianness);
                    break;
                case 'float64':
                    value = view.getFloat64(offset, endianness);
                    break;
                default:
                    value = view.getFloat32(offset, endianness);
                    break;
            }

            if (min === undefined || value < min) {
                min = value;
            }
            if (max === undefined || value > max) {
                max = value;
            }
        }

        return { windowMin: min ?? 0, windowMax: max ?? 0 };
    }

    /**
     * Convert raw data array to pixel values based on data type
     */
    public convertToPixelValues(
        rawData: Uint8Array,
        dataType: SupportedDataType,
        endianness: boolean = true
    ): number[] {
        const bytesPerPixel = this.getBytesPerPixel(dataType);
        const numPixels = Math.floor(rawData.length / bytesPerPixel);
        const values: number[] = [];
        const view = new DataView(rawData.buffer, rawData.byteOffset, rawData.byteLength);

        for (let i = 0; i < numPixels; i++) {
            const offset = i * bytesPerPixel;
            let value: number;

            switch (dataType) {
                case 'uint8':
                    value = view.getUint8(offset);
                    break;
                case 'int8':
                    value = view.getInt8(offset);
                    break;
                case 'uint16':
                    value = view.getUint16(offset, endianness);
                    break;
                case 'int16':
                    value = view.getInt16(offset, endianness);
                    break;
                case 'uint32':
                    value = view.getUint32(offset, endianness);
                    break;
                case 'int32':
                    value = view.getInt32(offset, endianness);
                    break;
                case 'float32':
                    value = view.getFloat32(offset, endianness);
                    break;
                case 'float64':
                    value = view.getFloat64(offset, endianness);
                    break;
                default:
                    value = view.getFloat32(offset, endianness);
                    break;
            }

            values.push(value);
        }

        return values;
    }

    /**
     * Apply window/level to raw data and return as Uint8ClampedArray for canvas
     */
    public applyWindowLevelToRawData(
        rawData: Uint8Array,
        dataType: SupportedDataType,
        windowMin: number,
        windowMax: number,
        endianness: boolean = true
    ): Uint8ClampedArray {
        const values = this.convertToPixelValues(rawData, dataType, endianness);
        return applyWindowLevel(values, windowMin, windowMax);
    }

    /**
     * Find min and max values in raw data
     */
    public findMinMaxInRawData(
        rawData: Uint8Array,
        dataType: SupportedDataType,
        endianness: boolean = true
    ): { min: number; max: number } {
        const values = this.convertToPixelValues(rawData, dataType, endianness);
        return findMinMax(values);
    }
}