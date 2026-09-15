import test from 'node:test';
import assert from 'node:assert/strict';
import { connectInspector } from './cdp.mjs';

function fakeSocket(handle) {
  return class extends EventTarget {
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    send(text) { handle(this, JSON.parse(text)); }
    message(value) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })); }
    close() { this.dispatchEvent(new Event('close')); }
  };
}

test('CDP client correlates replies and retains only live default frame contexts', async () => {
  const WebSocketClass = fakeSocket((socket, request) => {
    if (request.method === 'Runtime.enable') {
      socket.message({ method: 'Runtime.executionContextCreated', params: { context: { id: 1, auxData: { frameId: 'qa', isDefault: true } } } });
      socket.message({ method: 'Runtime.executionContextDestroyed', params: { executionContextId: 1 } });
      socket.message({ method: 'Runtime.executionContextCreated', params: { context: { id: 2, auxData: { frameId: 'qa', isDefault: true } } } });
    }
    socket.message({ id: request.id, result: { called: request.method } });
  });
  const session = await connectInspector('ws://127.0.0.1:9222/page/qa', { WebSocketClass });
  try {
    assert.equal((await session.call('Runtime.enable')).called, 'Runtime.enable');
    assert.equal((await session.contextForFrame('qa')).id, 2);
    assert.deepEqual(await Promise.all([session.call('one'), session.call('two')]), [{ called: 'one' }, { called: 'two' }]);
  } finally { session.close(); }
});

test('CDP rejection and timeout are bounded without returning protocol payloads', async () => {
  const session = await connectInspector('ws://127.0.0.1:9222/page/qa', {
    timeoutMs: 20,
    WebSocketClass: fakeSocket((socket, request) => { if (request.method === 'denied') socket.message({ id: request.id, error: { message: 'Untrusted payload must not be printed' } }); }),
  });
  try {
    await assert.rejects(session.call('denied'), /^Error: Inspector rejected denied\.$/);
    await assert.rejects(session.call('unanswered'), /timed out/);
    await assert.rejects(session.contextForFrame('unknown'), /auxData.frameId/);
  } finally { session.close(); }
});

test('CDP disconnect rejects pending commands and later commands', async () => {
  const session = await connectInspector('ws://127.0.0.1:9222/page/qa', { WebSocketClass: fakeSocket(socket => socket.close()) });
  await assert.rejects(session.call('Runtime.enable'), /disconnected/);
  await assert.rejects(session.call('Page.enable'), /disconnected/);
  session.close();
});
