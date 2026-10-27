(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MESSAGE_RELOAD = '扩展已重新加载，请刷新此页面后再翻译';
  const MESSAGE_UNREACHABLE = '无法连接扩展后台';
  const DEFAULT_ATTEMPTS = 8;
  const WAKE_MS = 1000;

  function errorText(err) {
    return String((err && (err.message || err)) || '');
  }

  function isContextInvalidated(err) {
    return /invalidated/i.test(errorText(err));
  }

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

  // Callback form only. `done(err)` runs when the ping has been answered.
  // Invalidation is rethrown or passed through; a sleeping worker is not.
  function wakeExtensionWorker(runtime, done) {
    function finish(err) {
      if (typeof done === 'function') done(err);
    }
    if (!runtime || typeof runtime.sendMessage !== 'function') {
      finish();
      return;
    }
    try {
      runtime.sendMessage({ type: 'est-ping' }, function () {
        let last;
        try { last = runtime.lastError; } catch (err) {
          finish(isContextInvalidated(err) ? rejectError(err) : undefined);
          return;
        }
        if (last && isContextInvalidated(last.message || last)) {
          finish(new Error(last.message || String(last)));
          return;
        }
        finish();
      });
    } catch (err) {
      if (isContextInvalidated(err)) throw rejectError(err);
      finish();
    }
  }

  function sendExtensionMessage(message, runtime, options) {
    const limit = options && options.attempts ? options.attempts : DEFAULT_ATTEMPTS;
    const delay = options && options.delay
      ? options.delay
      : function (ms, done) { setTimeout(done, ms); };
    try {
      assertRuntimeUsable(runtime);
    } catch (err) {
      return Promise.reject(rejectError(err));
    }
    if (typeof runtime.sendMessage !== 'function') {
      return Promise.reject(new Error(MESSAGE_UNREACHABLE));
    }
    // Do not open runtime.connect here. On Mac Edge a port opened while the
    // wake ping is still unanswered is dropped, and the worker stays inactive.
    return sendViaCallback(message, runtime, { limit: limit, delay: delay });
  }

  function sendViaCallback(message, runtime, options) {
    return new Promise(function (resolve, reject) {
      function attempt(index) {
        let settled = false;
        let wakeTimer = null;
        function fail(err) {
          if (settled) return;
          settled = true;
          if (wakeTimer != null) {
            clearTimeout(wakeTimer);
            wakeTimer = null;
          }
          const wrapped = rejectError(err);
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
        let woke = false;
        function afterWake(err) {
          if (woke || settled) return;
          woke = true;
          if (wakeTimer != null) {
            clearTimeout(wakeTimer);
            wakeTimer = null;
          }
          if (err && isContextInvalidated(err)) {
            fail(err);
            return;
          }
          setTimeout(deliver, 0);
        }
        wakeTimer = setTimeout(afterWake, WAKE_MS);
        try {
          wakeExtensionWorker(runtime, afterWake);
        } catch (err) {
          if (wakeTimer != null) clearTimeout(wakeTimer);
          fail(err);
        }
      }
      attempt(0);
    });
  }

  return {
    MESSAGE_RELOAD: MESSAGE_RELOAD,
    MESSAGE_UNREACHABLE: MESSAGE_UNREACHABLE,
    sendExtensionMessage: sendExtensionMessage,
    connectionFailure: connectionFailure,
    isRetryableConnectionError: isRetryableConnectionError,
    isContextInvalidated: isContextInvalidated,
    userFacingBackgroundError: userFacingBackgroundError,
    wakeExtensionWorker: wakeExtensionWorker
  };
});
