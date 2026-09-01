import { describe, expect, it } from 'vitest';
import { parseJavaVersion } from './javaVersion.js';

describe('Java version detection', () => {
  it.each([
    ['openjdk version "25.0.2" 2026-01-20', 'Java 25'],
    ['java version "21.0.8" 2025-07-15 LTS', 'Java 21'],
    ['java version "1.8.0_452"', 'Java 8'],
  ])('parses the executable version output', (output, expected) => {
    expect(parseJavaVersion(output)).toBe(expected);
  });

  it('does not invent a version without evidence', () => {
    expect(parseJavaVersion('unrecognized output')).toBeNull();
  });
});
