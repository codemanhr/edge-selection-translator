(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TRANSLATE_PORT = 'est-translate';
  const MESSAGE_RELOAD = '扩展已重新加载，请刷新此页面后再翻译';
  const MESSAGE_UNREACHABLE = '无法连接扩展后台';
  const DEFAULT_ATTEMPTS = 5;
  const HANDSHAKE_MS = 2000;
  const RESULT_MS = 30000;

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

  function userFacingBackgroundError(err) {
    if (isContextInvalidated(err)) return MESSAGE_RELOAD;
    if (isRetryableConnectionError(err) || /无法连接扩展后台/.test(errorText(err))) return MESSAGE_UNREACHABLE;
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

  // Fire-and-forget ping. The callback form starts a stopped MV3 worker even
  // when nobody answers the first message. Invalidation must surface; a
  // sleeping worker must not.
  function wakeExtensionWorker(runtime) {
    if (!runtime || typeof runtime.sendMessage !== 'function') return;
    try {
      runtime.sendMessage({ type: 'est-ping' }, function () {
        try { void runtime.lastError; } catch (err) {}
      });
    } catch (err) {
      if (isContextInvalidated(err)) throw rejectError(err);
    }
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
    port.onMessage.addListener(function (message) {
      if (!message || !message.type) return;
      if (message.type === 'est-hello') {
        ready();
        return;
      }
      if (message.type !== 'translate') return;
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
      port.onDisconnect.addListener(function () { finishKeepAlive(); });
    }
    ready();
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
    if (typeof runtime.connect !== 'function' && typeof runtime.sendMessage !== 'function') {
      return Promise.reject(new Error(MESSAGE_UNREACHABLE));
    }
    if (typeof runtime.connect === 'function') {
      return sendViaPort(message, runtime, {
        limit: limit,
        delay: delay,
        schedule: schedule,
        cancel: cancel,
        handshakeMs: handshakeMs,
        resultMs: resultMs
      });
    }
    return sendViaCallback(message, runtime, { limit: limit, delay: delay });
  }

  function sendViaPort(message, runtime, options) {
    return new Promise(function (resolve, reject) {
      function attempt(index) {
        let port = null;
        let settled = false;
        let sent = false;
        let timer = null;

        function cleanup() {
          if (timer != null) {
            try { options.cancel(timer); } catch (err) {}
            timer = null;
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
            options.delay(400 * (index + 1), function () { attempt(index + 1); });
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
          wakeExtensionWorker(runtime);
        } catch (err) {
          fail(err);
          return;
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
      }
      attempt(0);
    });
  }

  function sendViaCallback(message, runtime, options) {
    if (typeof runtime.sendMessage !== 'function') {
      return Promise.reject(new Error(MESSAGE_UNREACHABLE));
    }
    return new Promise(function (resolve, reject) {
      function attempt(index) {
        let settled = false;
        function fail(err) {
          if (settled) return;
          settled = true;
          const wrapped = rejectError(err);
          if (isRetryableConnectionError(wrapped) && index + 1 < options.limit) {
            options.delay(400 * (index + 1), function () { attempt(index + 1); });
            return;
          }
          reject(wrapped);
        }
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
      attempt(0);
    });
  }

  return {
    TRANSLATE_PORT: TRANSLATE_PORT,
    MESSAGE_RELOAD: MESSAGE_RELOAD,
    MESSAGE_UNREACHABLE: MESSAGE_UNREACHABLE,
    sendExtensionMessage: sendExtensionMessage,
    connectionFailure: connectionFailure,
    isRetryableConnectionError: isRetryableConnectionError,
    isContextInvalidated: isContextInvalidated,
    userFacingBackgroundError: userFacingBackgroundError,
    wakeExtensionWorker: wakeExtensionWorker,
    attachTranslatePort: attachTranslatePort
  };
});
