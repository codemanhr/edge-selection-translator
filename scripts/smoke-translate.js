'use strict';

const { translateText } = require('../src/lib/router.js');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0';

async function main() {
  const result = await translateText({
    text: 'Hello',
    sourceLang: 'auto',
    targetLang: 'zh-Hans',
    engine: 'bing'
  }, {
    fetch: fetch,
    userAgent: USER_AGENT,
    timeoutMs: 15000
  });
  const translated = result.translatedText || '';
  const chinese = /[\u4e00-\u9fff]/.test(translated);
  const summary = {
    ok: !!result.ok && chinese,
    engine: result.engine || '',
    fallback: !!result.fallback,
    detectedLang: result.detectedLang || '',
    translated: translated.slice(0, 40),
    note: result.note || '',
    error: result.ok ? '' : (result.error || 'failed')
  };
  process.stdout.write((summary.ok ? 'SMOKE_TRANSLATE_OK ' : 'SMOKE_TRANSLATE_FAILED ') + JSON.stringify(summary) + '\n');
  process.exit(summary.ok ? 0 : 1);
}

main().catch(function (err) {
  process.stderr.write(String(err && err.stack || err) + '\n');
  process.exit(1);
});
