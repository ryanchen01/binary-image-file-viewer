import * as path from 'path';
import { SupportedDataType } from './constants';

export interface MhdMetadata {
    width: number;
    height: number;
    depth: number;
    dataType: SupportedDataType;
    endianness: 'little' | 'big';
    elementDataFile: string;
}

const ELEMENT_TYPE_MAP: Record<string, SupportedDataType> = {
    MET_FLOAT: 'float32',
    MET_DOUBLE: 'float64',
    MET_UCHAR: 'uint8',
    MET_CHAR: 'int8',
    MET_USHORT: 'uint16',
    MET_SHORT: 'int16',
    MET_UINT: 'uint32',
    MET_INT: 'int32'
};

export function parseMhdHeader(content: string): MhdMetadata {
    const fields = parseFields(content);
    const binaryData = getRequiredField(fields, 'BinaryData');
    if (!parseBoolean(binaryData)) {
        throw new Error('Unsupported MHD file: BinaryData must be True');
    }

    const compressedData = getRequiredField(fields, 'CompressedData');
    if (parseBoolean(compressedData)) {
        throw new Error('Unsupported MHD file: CompressedData must be False');
    }

    const dimSize = parseDimSize(getRequiredField(fields, 'DimSize'));
    const elementType = getRequiredField(fields, 'ElementType').toUpperCase();
    const dataType = ELEMENT_TYPE_MAP[elementType];
    if (!dataType) {
        throw new Error(`Unsupported MHD ElementType: ${elementType}`);
    }

    const byteOrderMsb = parseBoolean(getRequiredByteOrderField(fields));
    const elementDataFile = normalizeElementDataFile(getRequiredField(fields, 'ElementDataFile'));

    return {
        width: dimSize[0],
        height: dimSize[1],
        depth: dimSize.length === 3 ? dimSize[2] : 1,
        dataType,
        endianness: byteOrderMsb ? 'big' : 'little',
        elementDataFile
    };
}

export function resolveMhdDataFilePath(metadataPath: string, elementDataFile: string): string {
    if (path.isAbsolute(elementDataFile)) {
        throw new Error('Unsupported MHD ElementDataFile: absolute paths are not allowed');
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(elementDataFile)) {
        throw new Error('Unsupported MHD ElementDataFile: URI values are not allowed');
    }

    const metadataDir = path.dirname(metadataPath);
    const resolvedPath = path.resolve(metadataDir, elementDataFile);
    const relativePath = path.relative(metadataDir, resolvedPath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error('Unsupported MHD ElementDataFile: paths outside the MHD folder are not allowed');
    }

    return resolvedPath;
}

function parseFields(content: string): Map<string, string> {
    const fields = new Map<string, string>();
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) {
            continue;
        }

        const separatorIndex = trimmedLine.indexOf('=');
        if (separatorIndex < 0) {
            continue;
        }

        const key = trimmedLine.slice(0, separatorIndex).trim();
        const value = trimmedLine.slice(separatorIndex + 1).trim();
        if (key) {
            fields.set(key, value);
        }
    }

    return fields;
}

function getRequiredField(fields: Map<string, string>, key: string): string {
    const value = fields.get(key);
    if (!value) {
        throw new Error(`Invalid MHD file: missing ${key}`);
    }

    return value;
}

function getRequiredByteOrderField(fields: Map<string, string>): string {
    const value = fields.get('BinaryDataByteOrderMSB') ?? fields.get('ElementByteOrderMSB');
    if (!value) {
        throw new Error('Invalid MHD file: missing BinaryDataByteOrderMSB or ElementByteOrderMSB');
    }

    return value;
}

function parseBoolean(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
        return true;
    }
    if (normalized === 'false') {
        return false;
    }

    throw new Error(`Invalid MHD boolean value: ${value}`);
}

function parseDimSize(value: string): number[] {
    const dimensions = value.split(/\s+/).map((part) => Number.parseInt(part, 10));
    if (
        (dimensions.length !== 2 && dimensions.length !== 3) ||
        dimensions.some((dimension) => !Number.isInteger(dimension) || dimension <= 0)
    ) {
        throw new Error('Invalid MHD DimSize: expected two or three positive integer dimensions');
    }

    return dimensions;
}

function normalizeElementDataFile(value: string): string {
    const trimmedValue = value.trim();
    const doubleQuoted = /^"(.+)"$/.exec(trimmedValue);
    const singleQuoted = /^'(.+)'$/.exec(trimmedValue);
    const wasQuoted = Boolean(doubleQuoted || singleQuoted);
    const unquotedValue = (doubleQuoted?.[1] ?? singleQuoted?.[1] ?? trimmedValue).trim();
    const normalizedValue = unquotedValue.toUpperCase();

    if (!unquotedValue) {
        throw new Error('Invalid MHD ElementDataFile: missing data file');
    }
    if (normalizedValue === 'LIST' || normalizedValue === 'LOCAL') {
        throw new Error(`Unsupported MHD ElementDataFile: ${unquotedValue}`);
    }
    if (!wasQuoted && /\s/.test(unquotedValue)) {
        throw new Error('Unsupported MHD ElementDataFile: whitespace is not allowed in the data file path');
    }

    return unquotedValue;
}
