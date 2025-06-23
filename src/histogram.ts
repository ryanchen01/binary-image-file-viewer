export function computeHistogram(values: number[], numBins = 256, min?: number, max?: number): number[] {
    if (values.length === 0) {
        return new Array(numBins).fill(0);
    }
    if (min === undefined) {
        min = Math.min(...values);
    }
    if (max === undefined) {
        max = Math.max(...values);
    }
    if (min === max) {
        max = min + 1; // avoid divide by zero
    }
    const hist = new Array(numBins).fill(0);
    const binWidth = (max - min) / numBins;
    for (const v of values) {
        const idx = Math.floor((v - min) / binWidth);
        const clamped = Math.max(0, Math.min(numBins - 1, idx));
        hist[clamped]++;
    }
    return hist;
}

export function percentileRange(values: number[], lower = 0.0, upper = 1.0): { min: number; max: number } {
    if (values.length === 0) {
        return { min: 0, max: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length - 1;
    const idx = (p: number) => p * n;
    const interp = (p: number) => {
        const i = idx(p);
        const i0 = Math.floor(i);
        const i1 = Math.min(n, i0 + 1);
        const t = i - i0;
        return sorted[i0] * (1 - t) + sorted[i1] * t;
    };
    return { min: interp(lower), max: interp(upper) };
}
