import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/app/globals.css', 'utf8');
const properties = (source: string) =>
  Object.fromEntries([...source.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]));
const light = properties(css.split(":root[data-theme='dark']")[0]);
const dark = { ...light, ...properties(css.split(":root[data-theme='dark']")[1].split('}')[0]) };
function color(tokens: Record<string, string>, name: string): string {
  const value = tokens[name];
  return value.startsWith('var(') ? color(tokens, value.slice(6, -1)) : value;
}
function luminance(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((part) => {
      const value = parseInt(part, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
describe.each([
  ['light', light],
  ['dark', dark],
] as const)('%s theme contrast', (_, tokens) => {
  it('keeps body, supporting text, actions and state labels at WCAG AA', () => {
    for (const [fg, bg] of [
      ['text', 'bg'],
      ['text', 'surface'],
      ['muted', 'surface'],
      ['muted', 'surface-soft'],
      ['primary-foreground', 'accent'],
      ['accent-ink', 'accent-soft'],
      ['success', 'success-bg'],
      ['danger', 'danger-bg'],
      ['warning', 'warning-bg'],
      ['offline', 'surface'],
      ['pending-sync', 'surface'],
      ['disabled', 'surface-soft'],
      ['brand-offwhite', 'brand-carbon'],
      ['brand-acid', 'brand-carbon'],
    ]) {
      expect(
        contrast(color(tokens, fg), color(tokens, bg)),
        `${fg} on ${bg}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('keeps field boundaries and keyboard focus distinguishable', () => {
    for (const fg of ['control-border', 'focus']) {
      expect(contrast(color(tokens, fg), color(tokens, 'surface')), fg).toBeGreaterThanOrEqual(3);
    }
  });
});
