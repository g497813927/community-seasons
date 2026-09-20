import assert from 'node:assert/strict';

// The matrix owns signal handling so Playwright cannot close pages before their
// interrupted reports and invocation checkpoint have been written.
export const MATRIX_BROWSER_LAUNCH_OPTIONS = Object.freeze({
  headless: true, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
});

export class MatrixSourceChangedError extends Error {
  constructor(files) {
    super(`Source changed during matrix run: ${files.join(', ')}`);
    this.name = 'MatrixSourceChangedError';
    this.interrupted = true;
  }
}

export function caseFailureStatus(error, { stopSignal, pageErrors = [], blockedRequests = [] } = {}) {
  if (error.name === 'AssertionError' || pageErrors.length || blockedRequests.length) return 'failed';
  if (error.interrupted) return 'interrupted';
  const closedDuringSignal = ['SIGINT', 'SIGTERM', 'SIGHUP'].includes(stopSignal) &&
    /Target (?:page, context or browser has been closed|closed)|Browser has been closed/.test(error.message);
  return closedDuringSignal ? 'interrupted' : 'failed';
}

export function assertFixtureHealthy(snapshot, { renderer = false, interruptedBy } = {}) {
  if (renderer) assert.notEqual(snapshot.status, 'failed',
    `Renderer fixture failed${interruptedBy ? ' before interruption' : ''}: ${snapshot.errors.join('; ') || 'No fixture diagnostic was provided.'}`);
  let errors = snapshot.errors;
  // The renderer appends the requested stop reason to an otherwise healthy
  // interrupted snapshot. Remove only that exact entry, never a real failure.
  if (renderer && snapshot.status === 'interrupted' && interruptedBy && errors.at(-1) === interruptedBy.slice(0, 600)) {
    errors = errors.slice(0, -1);
  }
  assert.deepEqual(errors, [], renderer ? 'Renderer reported an error.' : 'Production App raised a functional error.');
  if (!renderer) assert.deepEqual(snapshot.violations, [], 'Functional probe detected a production invariant failure.');
}

export async function bounded(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(`${label} exceeded ${milliseconds}ms.`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

export async function closeMatrixResources(browsers, server, milliseconds = 10000) {
  const errors = [];
  await Promise.all([...browsers].map(async ([engine, browser]) => {
    try { await bounded(browser.close(), milliseconds, `${engine} browser close`); }
    catch (error) { errors.push(error.message); }
  }));
  if (!server) return errors;
  try {
    // All workers have finalized. Keep-alive fixture sockets must not delay exit.
    server.closeAllConnections();
    if (server.listening === false) return errors;
    await bounded(new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())), milliseconds, 'Fixture server close');
  } catch (error) { errors.push(error.message); }
  return errors;
}
