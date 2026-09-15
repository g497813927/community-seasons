import { selectContext } from './targets.mjs';

// One explicitly selected page, with bounded requests and no navigation support.
export async function connectInspector(url, { WebSocketClass = WebSocket, timeoutMs = 10000 } = {}) {
  const socket = new WebSocketClass(url);
  const pending = new Map();
  const contexts = new Map();
  let sequence = 0;
  let disconnected = false;

  function rejectPending(message) {
    disconnected = true;
    for (const task of pending.values()) {
      clearTimeout(task.timer);
      task.reject(Error(message));
    }
    pending.clear();
  }
  socket.addEventListener('message', event => {
    let message;
    try {
      message = JSON.parse(event.data);
      if (!message || typeof message !== 'object' || Array.isArray(message)) throw Error('Invalid message');
    } catch { rejectPending('Inspector sent invalid JSON.'); socket.close(); return; }
    if (message.method === 'Runtime.executionContextCreated') {
      const context = message.params?.context;
      if (context) contexts.set(context.id, context);
    }
    if (message.method === 'Runtime.executionContextDestroyed') contexts.delete(message.params?.executionContextId);
    if (message.method === 'Runtime.executionContextsCleared') contexts.clear();
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    clearTimeout(task.timer);
    if (message.error) task.reject(Error(`Inspector rejected ${task.method}.`));
    else task.resolve(message.result);
  });
  socket.addEventListener('close', () => rejectPending('Inspector disconnected.'));
  socket.addEventListener('error', () => rejectPending('Inspector connection failed.'));

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(Error('Inspector connection timed out.')), timeoutMs);
      const opened = () => finish();
      const failed = () => finish(Error('Inspector connection failed.'));
      function finish(error) {
        clearTimeout(timer);
        socket.removeEventListener('open', opened);
        socket.removeEventListener('error', failed);
        socket.removeEventListener('close', failed);
        error ? reject(error) : resolve();
      }
      socket.addEventListener('open', opened, { once: true });
      socket.addEventListener('error', failed, { once: true });
      socket.addEventListener('close', failed, { once: true });
    });
  } catch (error) { socket.close(); throw error; }

  return {
    call(method, params = {}) {
      if (disconnected) return Promise.reject(Error('Inspector disconnected.'));
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(Error(`Inspector timed out: ${method}.`)); }, timeoutMs);
        pending.set(id, { method, resolve, reject, timer });
        try { socket.send(JSON.stringify({ id, method, params })); }
        catch { clearTimeout(timer); pending.delete(id); reject(Error('Inspector could not send the request.')); }
      });
    },
    async contextForFrame(frameId) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (disconnected) throw Error('Inspector disconnected.');
        const context = selectContext([...contexts.values()], frameId);
        if (context) return context;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw Error('No default execution context mapped to the exact QA frame. The bridge must provide auxData.frameId and auxData.isDefault.');
    },
    close() { rejectPending('Inspector closed.'); socket.close(); },
  };
}
