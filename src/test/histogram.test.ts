import * as assert from 'assert';
import { computeHistogram, percentileRange } from '../histogram';

describe('Histogram utilities', () => {
    it('computeHistogram bins values correctly', () => {
        const hist = computeHistogram([0,1,2,3,4], 5, 0, 5);
        assert.deepStrictEqual(hist, [1,1,1,1,1]);
    });

    it('percentileRange computes expected values', () => {
        const values = Array.from({length:101}, (_,i)=>i);
        const { min, max } = percentileRange(values, 0.1, 0.9);
        assert.strictEqual(min, 10);
        assert.strictEqual(max, 90);
    });
});
