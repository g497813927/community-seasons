import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../../src/lib/game/cloud-browser.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { shouldSuggestBilibili } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36';
const bili = 'Mozilla/5.0 (iPhone; CPU iPhone OS 12_4_7 like Mac OS X) AppleWebKit/607.3.9 (KHTML, like Gecko) Mobile/16G192 BiliApp/10320 os/ios model/iPhone 6 mobi_app/iphone build/10320 osVer/12.4.7 network/1 channel/AppStore Edg/91.0.4472.77';
// Keep the supplied UA's browser/app fields; installation and session IDs are irrelevant.
const recentBili = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/621.2.5.10.10 (KHTML, like Gecko) Mobile/22F76 BiliApp/84800100 os/ios model/iPhone 16 Pro Max mobi_app/iphone build/84800100 osVer/18.5 network/2 channel/pink_overseas c_locale/zh-Hans_CN s_locale/zh_CN disable_rcmd/0 timezone/Asia/Shanghai utcOffset/+08:00 isDaylightTime/0 alwaysTranslate/0 ipRegion/CN legalRegion/CN themeId/1 sh/62';
const desktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';
const failed = { status: 'error', error: 'unavailable' };

test('external mobile browsers get an app suggestion only after cloud access fails', () => {
  for (const ua of [safari, android]) {
    assert.equal(shouldSuggestBilibili(ua, failed), true);
    assert.equal(shouldSuggestBilibili(ua, { status: 'unsupported', error: null }), true);
    for (const status of ['checking', 'synced', 'queued', 'saving', 'local', 'pending', 'conflict']) {
      assert.equal(shouldSuggestBilibili(ua, { status, error: null }), false, `${status} keeps cloud controls`);
    }
    for (const error of ['invalid-save', 'too-large']) {
      assert.equal(shouldSuggestBilibili(ua, { status: 'error', error }), false, `${error} needs its save-specific explanation`);
    }
  }
});

test('BiliApp and bilibili UAs retain retry controls even after failure', () => {
  for (const ua of [bili, recentBili, bili.toLowerCase(), `${android} bilibili/8.0`, `${safari} BILIBILI`]) {
    assert.equal(shouldSuggestBilibili(ua, failed), false);
    assert.equal(shouldSuggestBilibili(ua, { status: 'unsupported', error: null }), false);
  }
  assert.equal(shouldSuggestBilibili(desktop, failed), false);
  assert.equal(shouldSuggestBilibili('', failed), false);
});
