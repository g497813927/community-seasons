import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { reportPath } from '../web/report-path.mjs';

test('checkpoint report links use the same URL path for POSIX and Windows inputs', () => {
  const caseId = 'webkit__frost_crown_skates_orbit_winter';
  for (const platform of [path.posix, path.win32]) {
    const directory = platform.join('cases', caseId, 'attempt-001');
    const recorded = JSON.parse(JSON.stringify({ report: reportPath(directory, 'report.json') }));
    assert.equal(recorded.report, `cases/${caseId}/attempt-001/report.json`);
    assert.equal(new URL(recorded.report, 'https://qa.example/results/progress.html').pathname,
      `/results/cases/${caseId}/attempt-001/report.json`);
    assert.equal(new URL('renderer.png', new URL(recorded.report, 'file:///results/progress.html')).pathname,
      `/results/cases/${caseId}/attempt-001/renderer.png`);
  }
});

test('recorded links still locate reports and screenshots through native filesystem joins', () => {
  const relative = reportPath('cases', path.win32.join('chromium__classic_none_none_none_spring', 'attempt-002'));
  const report = reportPath(relative, 'report.json');
  for (const [platform, root] of [[path.posix, '/results'], [path.win32, 'C:\\results']]) {
    assert.equal(platform.join(root, report), platform.join(root, 'cases', 'chromium__classic_none_none_none_spring', 'attempt-002', 'report.json'));
    for (const screenshot of ['renderer.png', 'failure.png', 'correct-rail-question.jpg', 'season-complete.jpg']) {
      assert.equal(platform.join(root, platform.dirname(report), screenshot), platform.join(root, relative, screenshot));
    }
  }
});
