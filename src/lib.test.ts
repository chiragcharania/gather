import { expect, test } from 'vitest';
import { initials, validMessage } from './lib';
test('composer rejects empty and oversized messages but permits attachment-only messages', () => { expect(validMessage('  ', false)).toBe(false); expect(validMessage('', true)).toBe(true); expect(validMessage('a'.repeat(4001), true)).toBe(false); expect(validMessage('hello', false)).toBe(true); });
test('initials handle names and email addresses', () => { expect(initials('Alex Morgan')).toBe('AM'); expect(initials('')).toBe('?'); });
