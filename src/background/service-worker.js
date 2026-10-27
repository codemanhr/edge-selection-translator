'use strict';

chrome.runtime.onInstalled.addListener(function () {
  chrome.action.setBadgeBackgroundColor({ color: '#0f6cbd' });
});
