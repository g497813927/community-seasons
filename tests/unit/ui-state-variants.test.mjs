import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../src/package.json', import.meta.url));
const { compile, optimize } = require('@tailwindcss/node');
const postcss = require('postcss');
const stylesheet = fileURLToPath(new URL('../../src/app/globals.css', import.meta.url));
const compiler = await compile(fs.readFileSync(stylesheet, 'utf8'), {
  base: path.dirname(stylesheet),
  from: stylesheet,
  onDependency() {},
});
const css = optimize(compiler.build([
  'data-open:block',
  'data-closed:hidden',
  'data-checked:opacity-100',
  'data-active:font-bold',
  'data-horizontal:flex-col',
  'data-vertical:flex-row',
  'group-data-horizontal/tabs:block',
  'group-data-vertical/tabs:hidden',
  'not-data-checked:opacity-0',
]), { minify: true }).code;
const selectors = new Set();
postcss.parse(css).walkRules(rule => selectors.add(rule.selector));

test('compiled UI states preserve legacy attributes, false values, and selector specificity', () => {
  for (const [state, utility] of [
    ['open', 'block'],
    ['closed', 'hidden'],
    ['checked', 'opacity-100'],
    ['active', 'font-bold'],
  ]) {
    const className = `.data-${state}\\:${utility}`;
    assert.ok(selectors.has(
      `${className}:where([data-state=${state}]),` +
      `${className}:where([data-${state}]:not([data-${state}=false]))`,
    ), `${state} must support both attribute forms without increasing specificity`);
  }
  assert.ok(selectors.has('.data-horizontal\\:flex-col:where([data-orientation=horizontal])'));
  assert.ok(selectors.has('.data-vertical\\:flex-row:where([data-orientation=vertical])'));
  assert.ok(selectors.has('.group-data-horizontal\\/tabs\\:block:is(:where(.group\\/tabs):where([data-orientation=horizontal]) *)'));
  assert.ok(selectors.has('.group-data-vertical\\/tabs\\:hidden:is(:where(.group\\/tabs):where([data-orientation=vertical]) *)'));
  assert.ok(selectors.has('.not-data-checked\\:opacity-0:not(:where([data-state=checked]),:where([data-checked]:not([data-checked=false])))'));
});
