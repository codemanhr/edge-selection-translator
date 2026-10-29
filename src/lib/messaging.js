(function (root, factory) {
  const api = factory();
  // A service worker that sees a broken `module` object must still publish EST.
  // Otherwise importScripts throws and no listener is ever registered.
  try {
    if (typeof module === 'object' && module && module.exports) module.exports = api;
  } catch (err) {}
  const host = root || (typeof globalThis !== 'undefined' ? globalThis : {});
  const EST = (host.EST = host.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TRANSLATE_PORT = 'est-translate';
  const KEEPALIVE_PORT = 'est-keepalive';
  const MESSAGE_RELOAD = '扩展已重新加载，请刷新此页面后再翻译';
  const MESSAGE_UNREACHABLE = '无法连接扩展后台';
  const DEFAULT_ATTEMPTS = 8;
  const HANDSHAKE_MS = 2500;
  const RESULT_MS = 30000;
  const WAKE_MS = 1000;

  function errorText(err) {
    return String((err && (err.message || err)) || '');
  }

  function isContextInvalidated(err) {
    return /invalidated/i.test(errorText(err));
  }

  // A sleeping MV3 worker fails the first attempt with one of these. An
  // invalidated content-script context will not recover until the page reloads.
  function isRetryableConnectionError(err) {
    if (isContextInvalidated(err)) return false;
    return /Receiving end does not exist|Could not establish connection|message port closed|message channel closed|disconnected port|asynchronous response/i.test(errorText(err));
  }

  function connectionFailure(err) {
    return isContextInvalidated(err) || isRetryableConnectionError(err) || /无法连接扩展后台/.test(errorText(err));
  }

  function shortLastError(err) {
    const text = errorText(err).replace(/\s+/g, ' ').trim();
    if (!text || text === MESSAGE_UNREACHABLE || text === MESSAGE_RELOAD) return '';
    if (/^无法连接扩展后台/.test(text) && !/[A-Za-z]/.test(text)) return '';
    return text.length > 80 ? text.slice(0, 79) + '…' : text;
  }

  function userFacingBackgroundError(err) {
    if (isContextInvalidated(err)) return MESSAGE_RELOAD;
    if (isRetryableConnectionError(err) || /无法连接扩展后台/.test(errorText(err))) {
      const detail = shortLastError(err);
      return detail ? MESSAGE_UNREACHABLE + '（' + detail + '）' : MESSAGE_UNREACHABLE;
    }
    return errorText(err) || '翻译失败';
  }

  function rejectError(err) {
    if (err instanceof Error) return err;
    return new Error(errorText(err) || MESSAGE_UNREACHABLE);
  }

  // An extension reload leaves chrome.runtime in place with an empty id, and
  // reading the id can itself throw. A missing runtime (sandboxed frame) is a
  // connect failure, not a reload.
  function assertRuntimeUsable(runtime) {
    if (!runtime) throw new Error(MESSAGE_UNREACHABLE);
    try {
      if (('id' in runtime) && !runtime.id) throw new Error('Extension context invalidated.');
    } catch (err) {
      if (isContextInvalidated(err)) throw rejectError(err);
      throw err;
    }
  }

  function retryDelayMs(index) {
    const steps = [200, 500, 1000, 1500, 2200, 3000, 4000];
    return steps[index] || 4000;
  }

  // `done()` with no error only when the worker actually answered. Edge drops
  // the first message to a stopped worker and still runs the callback with
  // lastError set and no response. Treating that as a wake sends the
  // translation into a worker that is not listening yet.
  function wakeExtensionWorker(runtime, done) {
    function finish(err) {
      if (typeof done === 'function') done(err);
    }
    if (!runtime || typeof runtime.sendMessage !== 'function') {
      finish(new Error(MESSAGE_UNREACHABLE));
      return;
    }
    try {
      runtime.sendMessage({ type: 'est-ping' }, function (response) {
        let last;
        try { last = runtime.lastError; } catch (err) {
          finish(isContextInvalidated(err) ? rejectError(err) : new Error(MESSAGE_UNREACHABLE));
          return;
        }
        if (last && isContextInvalidated(last.message || last)) {
          finish(new Error(last.message || String(last)));
          return;
        }
        // A real response wins over a stale or cross-frame lastError.
        if (response !== undefined && response !== null) {
          finish();
          return;
        }
        const text = last && (last.message || String(last));
        finish(new Error(text || 'Could not establish connection. Receiving end does not exist.'));
      });
    } catch (err) {
      if (isContextInvalidated(err)) throw rejectError(err);
      finish(rejectError(err));
    }
  }

  // Retry the ping until the worker answers. The payload must not be sent
  // from the timeout: that timer only means the ping was not answered.
  function proveWorkerAwake(runtime, options) {
    const limit = options && options.attempts ? options.attempts : DEFAULT_ATTEMPTS;
    const delay = options && options.delay
      ? options.delay
      : function (ms, done) { setTimeout(done, ms); };
    const wakeMs = options && options.wakeMs != null ? options.wakeMs : WAKE_MS;
    return new Promise(function (resolve, reject) {
      function attempt(index) {
        let settled = false;
        let timer = null;
        function finish(err) {
          if (settled) return;
          settled = true;
          if (timer != null) {
            clearTimeout(timer);
            timer = null;
          }
          if (!err) {
            resolve(true);
            return;
          }
          const wrapped = rejectError(err);
          if (isContextInvalidated(wrapped)) {
            reject(wrapped);
            return;
          }
          if (index + 1 < limit && (isRetryableConnectionError(wrapped) || connectionFailure(wrapped))) {
            delay(retryDelayMs(index), function () { attempt(index + 1); });
            return;
          }
          reject(wrapped);
        }
        timer = setTimeout(function () {
          timer = null;
          finish(new Error('Could not establish connection. Receiving end does not exist.'));
        }, wakeMs);
        try {
          wakeExtensionWorker(runtime, function (err) { finish(err || null); });
        } catch (err) {
          finish(err);
        }
      }
      attempt(0);
    });
  }

  function resultBody(response) {
    const body = Object.assign({ ok: false }, response || {});
    delete body.type;
    body.type = 'est-result';
    return body;
  }

  // Listener first, then est-ready. The content side also sends est-hello
  // because this first ready can be posted before its listener exists.
  function attachTranslatePort(port, deps) {
    const translate = deps && deps.translate;
    const keepAlive = deps && deps.keepAlive ? deps.keepAlive : function () { return function () {}; };
    let stop = null;
    function finishKeepAlive() {
      if (!stop) return;
      const end = stop;
      stop = null;
      try { end(); } catch (err) {}
    }
    function post(message) {
      try { port.postMessage(message); } catch (err) {}
    }
    function ready() {
      post({ type: 'est-ready' });
    }
    let poke = null;
    let gotTranslate = false;
    function stopPoke() {
      if (poke == null) return;
      clearInterval(poke);
      poke = null;
    }
    port.onMessage.addListener(function (message) {
      if (!message || !message.type) return;
      if (message.type === 'est-hello') {
        ready();
        return;
      }
      if (message.type !== 'translate') return;
      gotTranslate = true;
      stopPoke();
      if (!stop) stop = keepAlive() || null;
      let pending;
      try {
        pending = translate(message);
      } catch (err) {
        finishKeepAlive();
        post({ type: 'est-result', ok: false, error: (err && err.message) || '翻译失败' });
        return;
      }
      Promise.resolve(pending).then(function (response) {
        finishKeepAlive();
        post(resultBody(response));
      }, function (err) {
        finishKeepAlive();
        post({ type: 'est-result', ok: false, error: (err && err.message) || '翻译失败' });
      });
    });
    if (port.onDisconnect && typeof port.onDisconnect.addListener === 'function') {
      port.onDisconnect.addListener(function () {
        stopPoke();
        finishKeepAlive();
      });
    }
    // Edge drops a postMessage made inside onConnect. Keep announcing
    // est-ready until the translate payload shows up.
    ready();
    if (!gotTranslate) {
      try {
        poke = setInterval(function () {
          if (!gotTranslate) ready();
        }, 250);
      } catch (err) {
        poke = null;
      }
    }
  }

  function sendExtensionMessage(message, runtime, options) {
    const limit = options && options.attempts ? options.attempts : DEFAULT_ATTEMPTS;
    const schedule = options && options.schedule
      ? options.schedule
      : function (fn, ms) { return setTimeout(fn, ms); };
    const cancel = options && options.cancel
      ? options.cancel
      : function (id) { clearTimeout(id); };
    const delay = options && options.delay
      ? options.delay
      : function (ms, done) { schedule(done, ms); };
    const handshakeMs = options && options.handshakeMs != null ? options.handshakeMs : HANDSHAKE_MS;
    const resultMs = options && options.resultMs != null ? options.resultMs : RESULT_MS;

    try {
      assertRuntimeUsable(runtime);
    } catch (err) {
      return Promise.reject(rejectError(err));
    }
    const portOptions = {
      limit: Math.min(limit, 3),
      delay: delay,
      schedule: schedule,
      cancel: cancel,
      handshakeMs: handshakeMs,
      resultMs: resultMs
    };
    if (typeof runtime.connect !== 'function' && typeof runtime.sendMessage !== 'function') {
      return Promise.reject(new Error(MESSAGE_UNREACHABLE));
    }
    // Edge does not wake an inactive worker on runtime.connect, and a port
    // opened in the same turn as an unanswered ping is disconnected. Ping
    // until the worker answers, then send the translation on a later turn.
    // The port is only a fallback after a proven wake whose sendMessage
    // still fails (a live worker, a broken callback channel).
    if (typeof runtime.sendMessage === 'function') {
      const state = { awake: false };
      return sendViaCallback(message, runtime, {
        limit: limit,
        delay: delay,
        wakeMs: options && options.wakeMs,
        state: state
      }).catch(function (err) {
        if (!err || !err.workerAwake || typeof runtime.connect !== 'function' || !isRetryableConnectionError(err)) {
          return Promise.reject(err);
        }
        return sendViaPort(message, runtime, portOptions);
      });
    }
    return sendViaPort(message, runtime, portOptions);
  }

  function sendViaPort(message, runtime, options) {
    return new Promise(function (resolve, reject) {
      function attempt(index) {
        let port = null;
        let settled = false;
        let sent = false;
        let timer = null;
        let helloTimer = null;

        function cleanup() {
          if (timer != null) {
            try { options.cancel(timer); } catch (err) {}
            timer = null;
          }
          if (helloTimer != null) {
            clearTimeout(helloTimer);
            helloTimer = null;
          }
          const current = port;
          port = null;
          if (!current) return;
          try { current.disconnect(); } catch (err) {}
        }

        function fail(err) {
          if (settled) return;
          settled = true;
          cleanup();
          const wrapped = rejectError(err);
          if (isRetryableConnectionError(wrapped) && index + 1 < options.limit) {
            options.delay(retryDelayMs(index), function () { attempt(index + 1); });
            return;
          }
          reject(wrapped);
        }

        function succeed(response) {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(response);
        }

        function arm(ms) {
          if (timer != null) {
            try { options.cancel(timer); } catch (err) {}
          }
          timer = options.schedule(function () {
            timer = null;
            fail(new Error('Could not establish connection. Receiving end does not exist.'));
          }, ms);
        }

        function onPortMessage(incoming) {
          if (!incoming || settled) return;
          if (incoming.type === 'est-ready') {
            if (sent) return;
            sent = true;
            try { port.postMessage(message); } catch (err) { fail(err); return; }
            if (!settled) arm(options.resultMs);
            return;
          }
          if (incoming.type === 'est-result') {
            const response = Object.assign({}, incoming);
            delete response.type;
            succeed(response);
          }
        }

        function onDisconnect() {
          if (settled) return;
          let last;
          try { last = runtime.lastError; } catch (err) { fail(err); return; }
          const text = last && (last.message || String(last));
          fail(new Error(text || 'The message port closed before a response was received.'));
        }

        try {
          port = runtime.connect({ name: TRANSLATE_PORT });
        } catch (err) {
          fail(err);
          return;
        }
        if (!port || !port.onMessage || typeof port.onMessage.addListener !== 'function' || typeof port.postMessage !== 'function') {
          fail(new Error('Could not establish connection. Receiving end does not exist.'));
          return;
        }
        try {
          port.onMessage.addListener(onPortMessage);
          if (port.onDisconnect && typeof port.onDisconnect.addListener === 'function') {
            port.onDisconnect.addListener(onDisconnect);
          }
        } catch (err) {
          fail(err);
          return;
        }
        if (settled) return;
        try { port.postMessage({ type: 'est-hello' }); } catch (err) { fail(err); return; }
        // est-ready during hello already started the result timer. Replacing
        // it with the short handshake timeout would abort a slow translation.
        if (!settled && !sent) arm(options.handshakeMs);
        if (!settled && !sent) {
          helloTimer = setTimeout(function () {
            helloTimer = null;
            if (settled || sent || !port) return;
            try { port.postMessage({ type: 'est-hello' }); } catch (err) {}
          }, 50);
        }
      }
      attempt(0);
    });
  }

  function sendViaCallback(message, runtime, options) {
    if (typeof runtime.sendMessage !== 'function') {
      return Promise.reject(new Error(MESSAGE_UNREACHABLE));
    }
    const wakeMs = options.wakeMs != null ? options.wakeMs : WAKE_MS;
    const state = options.state || { awake: false };
    return new Promise(function (resolve, reject) {
      function attempt(index) {
        let settled = false;
        function fail(err) {
          if (settled) return;
          settled = true;
          const wrapped = rejectError(err);
          if (state.awake) wrapped.workerAwake = true;
          if (isRetryableConnectionError(wrapped) && index + 1 < options.limit) {
            options.delay(retryDelayMs(index), function () { attempt(index + 1); });
            return;
          }
          reject(wrapped);
        }
        function deliver() {
          if (settled) return;
          try {
            runtime.sendMessage(message, function (response) {
              let last;
              try { last = runtime.lastError; } catch (err) { fail(err); return; }
              if (last && isContextInvalidated(last.message || last)) {
                fail(new Error(last.message || String(last)));
                return;
              }
              // Edge can set lastError when another frame returns false even
              // though the worker already delivered a response.
              if (response !== undefined) {
                if (settled) return;
                settled = true;
                resolve(response);
                return;
              }
              if (last) {
                fail(new Error(last.message || String(last)));
                return;
              }
              if (settled) return;
              settled = true;
              resolve(response);
            });
          } catch (err) {
            fail(err);
          }
        }
        // One ping per attempt. A timeout or a dropped ping retries the ping
        // and does not send the translation on this turn.
        proveWorkerAwake(runtime, {
          attempts: 1,
          delay: options.delay,
          wakeMs: wakeMs
        }).then(function () {
          if (settled) return;
          state.awake = true;
          setTimeout(deliver, 0);
        }, function (err) {
          fail(err);
        });
      }
      attempt(0);
    });
  }

  function emptyPort() {
    return {
      onDisconnect: { addListener: function () {} },
      disconnect: function () {}
    };
  }

  // Top-frame keepalive. Ping until the worker answers, then open the port
  // on a later turn. While the tab is visible the port keeps the worker from
  // going idle between pages and after a tab switch.
  function createBackgroundConnection(runtime, options) {
    const proveAttempts = options && options.attempts ? options.attempts : 4;
    const wakeMs = options && options.wakeMs != null ? options.wakeMs : WAKE_MS;
    const delay = options && options.delay
      ? options.delay
      : function (ms, done) { setTimeout(done, ms); };
    let desired = true;
    let port = null;
    let opening = null;
    let retryTimer = null;
    let retryIndex = 0;

    function clearRetry() {
      if (retryTimer == null) return;
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    function armRetry() {
      if (!desired || retryTimer != null) return;
      retryTimer = setTimeout(function () {
        retryTimer = null;
        if (!desired || port) return;
        const again = ensure();
        if (again && typeof again.catch === 'function') again.catch(function () {});
      }, retryDelayMs(retryIndex));
      retryIndex = Math.min(retryIndex + 1, 6);
      if (retryTimer && typeof retryTimer.unref === 'function') retryTimer.unref();
    }

    function bindDisconnect(next) {
      if (!next.onDisconnect || typeof next.onDisconnect.addListener !== 'function') return;
      next.onDisconnect.addListener(function () {
        if (port !== next) return;
        port = null;
        try { void runtime.lastError; } catch (err) {}
        if (desired) armRetry();
      });
    }

    function ensure() {
      if (!desired) return Promise.resolve(false);
      if (port) return Promise.resolve(true);
      if (opening) return opening;
      opening = proveWorkerAwake(runtime, {
        attempts: proveAttempts,
        delay: delay,
        wakeMs: wakeMs
      }).then(function () {
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            opening = null;
            if (!desired) {
              resolve(false);
              return;
            }
            if (port) {
              retryIndex = 0;
              resolve(true);
              return;
            }
            let next = null;
            try {
              next = runtime.connect({ name: KEEPALIVE_PORT });
            } catch (err) {
              if (isContextInvalidated(err)) {
                desired = false;
                reject(rejectError(err));
                return;
              }
              armRetry();
              resolve(false);
              return;
            }
            if (!next || typeof next.disconnect !== 'function') next = emptyPort();
            port = next;
            try { bindDisconnect(next); } catch (err) {}
            // A port that dies in this turn is not a live worker. Do not
            // report success, and do not open another port synchronously.
            setTimeout(function () {
              if (!desired) {
                resolve(false);
                return;
              }
              if (port !== next) {
                armRetry();
                resolve(false);
                return;
              }
              retryIndex = 0;
              resolve(true);
            }, 0);
          }, 0);
        });
      }, function (err) {
        opening = null;
        if (isContextInvalidated(err)) {
          desired = false;
          throw err;
        }
        armRetry();
        throw err;
      });
      return opening;
    }

    function release() {
      desired = false;
      clearRetry();
      const current = port;
      port = null;
      opening = null;
      if (!current) return;
      try { current.disconnect(); } catch (err) {}
    }

    function reconnect() {
      desired = true;
      clearRetry();
      const current = port;
      port = null;
      if (current) {
        try { current.disconnect(); } catch (err) {}
      }
      return ensure();
    }

    const ready = ensure();
    return {
      ready: ready,
      ensure: ensure,
      reconnect: reconnect,
      release: release
    };
  }

  return {
    TRANSLATE_PORT: TRANSLATE_PORT,
    KEEPALIVE_PORT: KEEPALIVE_PORT,
    MESSAGE_RELOAD: MESSAGE_RELOAD,
    MESSAGE_UNREACHABLE: MESSAGE_UNREACHABLE,
    sendExtensionMessage: sendExtensionMessage,
    connectionFailure: connectionFailure,
    isRetryableConnectionError: isRetryableConnectionError,
    isContextInvalidated: isContextInvalidated,
    userFacingBackgroundError: userFacingBackgroundError,
    wakeExtensionWorker: wakeExtensionWorker,
    proveWorkerAwake: proveWorkerAwake,
    createBackgroundConnection: createBackgroundConnection,
    attachTranslatePort: attachTranslatePort
  };
});
