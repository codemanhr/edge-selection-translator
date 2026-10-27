(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function errorText(err) {
    return String((err && (err.message || err)) || '');
  }

  function isContextInvalidated(err) {
    return /invalidated/i.test(errorText(err));
  }

  // A sleeping MV3 worker, or Edge's promise-based sendMessage, fails the
  // first attempt with one of these. The callback form plus one retry
  // reaches the worker after it has started. An invalidated context will
  // not recover until the page is reloaded.
  function isRetryableConnectionError(err) {
    if (isContextInvalidated(err)) return false;
    return /Receiving end does not exist|Could not establish connection|message port closed/i.test(errorText(err));
  }

  function connectionFailure(err) {
    return isContextInvalidated(err) || isRetryableConnectionError(err) || /无法连接扩展后台/.test(errorText(err));
  }

  function sendExtensionMessage(message, runtime, options) {
    const limit = options && options.attempts ? options.attempts : 3;
    const delay = options && options.delay ? options.delay : function (ms, done) { setTimeout(done, ms); };
    if (!runtime || typeof runtime.sendMessage !== 'function') {
      return Promise.reject(new Error('Extension context invalidated.'));
    }
    return new Promise(function (resolve, reject) {
      function attempt(index) {
        let settled = false;
        function fail(err) {
          if (settled) return;
          settled = true;
          const wrapped = err instanceof Error ? err : new Error(errorText(err) || '无法连接扩展后台');
          if (isRetryableConnectionError(wrapped) && index + 1 < limit) {
            delay(200 * (index + 1), function () { attempt(index + 1); });
            return;
          }
          reject(wrapped);
        }
        try {
          runtime.sendMessage(message, function (response) {
            let last;
            try { last = runtime.lastError; } catch (err) { fail(err); return; }
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
    sendExtensionMessage: sendExtensionMessage,
    connectionFailure: connectionFailure,
    isRetryableConnectionError: isRetryableConnectionError,
    isContextInvalidated: isContextInvalidated
  };
});
