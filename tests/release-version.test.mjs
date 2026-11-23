import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { versionFromTag } from '../scripts/release-version.mjs';

describe('versionFromTag', () => {
  it('derives the name and code from a v-prefixed tag', () => {
    expect(versionFromTag('v1.2.3')).toEqual({ name: '1.2.3', code: 1_002_003 });
  });

  it('accepts a tag without the v prefix', () => {
    expect(versionFromTag('2.0.0')).toEqual({ name: '2.0.0', code: 2_000_000 });
  });

  it('normalises leading zeroes', () => {
    expect(versionFromTag('v01.02.010')).toEqual({ name: '1.2.10', code: 1_002_010 });
  });

  it('allows patch versions above nine', () => {
    expect(versionFromTag('v1.0.10')).toEqual({ name: '1.0.10', code: 1_000_010 });
  });

  it.each(['', 'v1.2', 'v1.2.3.4', 'release-1', 'v1.2.x', 'vv1.2.3'])(
    'rejects malformed tag %j',
    (tag) => {
      expect(() => versionFromTag(tag)).toThrow(/vMAJOR\.MINOR\.PATCH/);
    },
  );

  it('rejects minor or patch values above 999', () => {
    expect(() => versionFromTag('v1.1000.0')).toThrow(/999 or lower/);
    expect(() => versionFromTag('v1.0.1000')).toThrow(/999 or lower/);
  });

  it('rejects a missing tag value', () => {
    expect(() => versionFromTag(undefined)).toThrow(/missing/);
  });
});

describe('release-version CLI', () => {
  it('emits environment assignments for GitHub Actions', () => {
    const output = execFileSync(process.execPath, ['scripts/release-version.mjs', 'v3.4.5'], {
      encoding: 'utf8',
    });
    expect(output).toContain('VERSION_NAME=3.4.5');
    expect(output).toContain('VERSION_CODE=3004005');
  });
});
