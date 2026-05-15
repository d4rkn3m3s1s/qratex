import {
  parseNonNegativeIntEnv,
  parseOpenUnitFloatEnv,
  parsePositiveIntEnv,
} from '@/lib/safe-env-number';

describe('safe-env-number', () => {
  describe('parsePositiveIntEnv', () => {
    it('returns fallback for empty and invalid', () => {
      expect(parsePositiveIntEnv(undefined, 10)).toBe(10);
      expect(parsePositiveIntEnv('', 10)).toBe(10);
      expect(parsePositiveIntEnv('abc', 10)).toBe(10);
      expect(parsePositiveIntEnv('0', 10)).toBe(10);
      expect(parsePositiveIntEnv('-3', 10)).toBe(10);
    });
    it('parses positive integers', () => {
      expect(parsePositiveIntEnv('24', 10)).toBe(24);
      expect(parsePositiveIntEnv('001', 10)).toBe(1);
    });
  });

  describe('parseNonNegativeIntEnv', () => {
    it('allows zero', () => {
      expect(parseNonNegativeIntEnv('0', 5)).toBe(0);
    });
    it('rejects negative and NaN', () => {
      expect(parseNonNegativeIntEnv('-1', 5)).toBe(5);
      expect(parseNonNegativeIntEnv('x', 5)).toBe(5);
    });
  });

  describe('parseOpenUnitFloatEnv', () => {
    it('returns fallback outside (0,1]', () => {
      expect(parseOpenUnitFloatEnv('0', 0.1)).toBe(0.1);
      expect(parseOpenUnitFloatEnv('1.01', 0.1)).toBe(0.1);
      expect(parseOpenUnitFloatEnv('nan', 0.1)).toBe(0.1);
    });
    it('accepts valid ratios', () => {
      expect(parseOpenUnitFloatEnv('0.25', 0.1)).toBe(0.25);
      expect(parseOpenUnitFloatEnv('1', 0.1)).toBe(1);
    });
  });
});
