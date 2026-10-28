/**
 * Verification Test Suite for Ollama Health-Check & Status Flag Logic
 *
 * Verifies:
 * 1. Health check queries /api/tags and parses 200 OK with models list.
 * 2. Health check falls back to /api/version when /api/tags is absent and detects 200 OK.
 * 3. Health check falls back to root / ("Ollama is running") and handles plain text 200 OK.
 * 4. Zero parsing errors on 200 OK: malformed JSON or empty body never causes false-positive offline states.
 * 5. Trailing slash normalization in baseUrl (e.g. "http://localhost:11434/").
 * 6. Clean error handling on genuine network rejection / offline state.
 */

import { checkOllamaConnection } from '../src/services/ollamaService.js';

console.log('================================================================');
console.log('       OLLAMA HEALTH-CHECK & CONNECTION VERIFICATION SUITE');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${testName}`);
    if (details) console.log(`       -> ${details}`);
  } else {
    console.error(`[FAIL] ${testName}`);
    if (details) console.error(`       -> ${details}`);
  }
}

async function runHealthTests() {
  const originalFetch = globalThis.fetch;

  try {
    // ------------------------------------------------------------------
    // TEST 1: Primary probe /api/tags with 200 OK and model list
    // ------------------------------------------------------------------
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/api/tags')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            models: [
              { name: 'llama3.2:latest', size: 2000000000 },
              { name: 'mistral:latest', size: 4000000000 },
            ],
          }),
        };
      }
      return { ok: false, status: 404 };
    };

    const resTags = await checkOllamaConnection('http://localhost:11434');
    assert(
      resTags.success === true && resTags.models.length === 2 && resTags.models[0].name === 'llama3.2:latest',
      'Test 1: Health check succeeds via /api/tags with 200 OK and parses available models',
      `Success: ${resTags.success} | Models found: ${resTags.models.map((m) => m.name).join(', ')}`
    );

    // ------------------------------------------------------------------
    // TEST 2: Fallback to /api/version when /api/tags returns 404
    // ------------------------------------------------------------------
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/api/tags')) {
        return { ok: false, status: 404, statusText: 'Not Found' };
      }
      if (urlStr.endsWith('/api/version')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ version: '0.3.14' }),
        };
      }
      return { ok: false, status: 404 };
    };

    const resVersion = await checkOllamaConnection('http://localhost:11434');
    assert(
      resVersion.success === true && resVersion.endpoint === '/api/version' && resVersion.version === '0.3.14',
      'Test 2: Health check falls back to /api/version on 404 and switches status to Online',
      `Success: ${resVersion.success} | Endpoint: ${resVersion.endpoint} | Version: ${resVersion.version}`
    );

    // ------------------------------------------------------------------
    // TEST 3: Fallback to root / when both /api/tags and /api/version fail
    // ------------------------------------------------------------------
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/api/tags') || urlStr.endsWith('/api/version')) {
        return { ok: false, status: 404, statusText: 'Not Found' };
      }
      if (urlStr.endsWith('/')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => {
            throw new Error('Unexpected token O in JSON at position 0');
          },
          text: async () => 'Ollama is running',
        };
      }
      return { ok: false, status: 404 };
    };

    const resRoot = await checkOllamaConnection('http://localhost:11434');
    assert(
      resRoot.success === true && resRoot.endpoint === '/',
      'Test 3: Health check handles plain text 200 OK from root / without failing on JSON parse',
      `Success: ${resRoot.success} | Endpoint: ${resRoot.endpoint} | Message: ${resRoot.message}`
    );

    // ------------------------------------------------------------------
    // TEST 4: Resilient parsing: malformed or null models field does NOT fail 200 OK
    // ------------------------------------------------------------------
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/api/tags')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ models: null }), // models is null instead of array
        };
      }
      return { ok: false, status: 404 };
    };

    const resNullModels = await checkOllamaConnection('http://localhost:11434');
    assert(
      resNullModels.success === true && Array.isArray(resNullModels.models) && resNullModels.models.length === 0,
      'Test 4: 200 OK with null models field safely converts to empty array and preserves Online status',
      `Success: ${resNullModels.success} | Models count: ${resNullModels.models.length}`
    );

    // ------------------------------------------------------------------
    // TEST 5: Trailing slash URL normalization
    // ------------------------------------------------------------------
    const requestedUrls = [];
    globalThis.fetch = async (url) => {
      requestedUrls.push(String(url));
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ models: [] }),
      };
    };

    await checkOllamaConnection('http://localhost:11434///');
    assert(
      requestedUrls[0] === 'http://localhost:11434/api/tags',
      'Test 5: Trailing slashes in baseUrl are cleanly normalized to prevent double-slash URL corruption',
      `Normalized URL requested: "${requestedUrls[0]}"`
    );

    // ------------------------------------------------------------------
    // TEST 6: Genuine connection offline / connection refused
    // ------------------------------------------------------------------
    globalThis.fetch = async () => {
      const err = new TypeError('Failed to fetch (ECONNREFUSED)');
      throw err;
    };

    const resOffline = await checkOllamaConnection('http://localhost:11434', 100);
    assert(
      resOffline.success === false && resOffline.error.includes('Ensure Ollama is running'),
      'Test 6: Genuine network offline state returns success: false with clear startup guidance',
      `Error caught: "${resOffline.error.slice(0, 60)}..."`
    );

    // ------------------------------------------------------------------
    // TEST 7: Timeout boundary handling
    // ------------------------------------------------------------------
    globalThis.fetch = async () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    };

    const resTimeout = await checkOllamaConnection('http://localhost:11434', 50);
    assert(
      resTimeout.success === false && resTimeout.error.includes('Connection timed out'),
      'Test 7: AbortController timeout cleanly reports timeout without unhandled rejection',
      `Message: "${resTimeout.error}"`
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('\n================================================================');
  console.log(`   HEALTH-CHECK TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runHealthTests();
