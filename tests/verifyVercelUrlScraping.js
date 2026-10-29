/**
 * Verification Test Suite: Vercel Link Extraction & Multi-Tier Fallback
 *
 * Verifies:
 * 1. vercel.json configuration (SPA routing + /api/* serverless rewrites).
 * 2. api/scrape-job-url.js Vercel Serverless Function contract.
 * 3. cleanJinaContent parser resilience (title extraction, markdown sanitization).
 * 4. scrapeJobUrl failover mechanism (Serverless -> Jina AI Reader -> CORS Proxies).
 * 5. Immunity to "Failed to fetch" browser exceptions and HTML fallback responses.
 */

import fs from 'fs';
import path from 'path';
import {
  cleanJinaContent,
  scrapeJobUrl,
  isJobDescriptionContent,
  INVALID_JOB_URL_ERROR,
} from '../src/services/jobUrlScraperService.js';
import vercelHandler, { config as vercelConfig } from '../api/scrape-job-url.js';

let passed = 0;
let total = 0;

function assert(condition, testName, details = '') {
  total++;
  if (condition) {
    passed++;
    console.log(`[PASS] ${testName}${details ? ` -> ${details}` : ''}`);
  } else {
    console.error(`[FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
  }
}

console.log('================================================================');
console.log('   VERCEL LINK EXTRACTION & SCRAPING VERIFICATION SUITE');
console.log('================================================================\n');

// ----------------------------------------------------------------------
// Category 1: vercel.json Deployment Configuration
// ----------------------------------------------------------------------
console.log('--- CATEGORY 1: vercel.json Deployment Configuration ---');

const vercelJsonPath = path.resolve('vercel.json');
assert(fs.existsSync(vercelJsonPath), 'Test 1A: vercel.json exists in project root');

let vercelConfigParsed = {};
try {
  vercelConfigParsed = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
} catch (e) {
  vercelConfigParsed = {};
}

const hasApiRewrite = vercelConfigParsed.rewrites?.some(
  (r) => r.source === '/api/(.*)' && r.destination === '/api/$1'
);
const hasSpaRewrite = vercelConfigParsed.rewrites?.some(
  (r) => r.source === '/(.*)' && r.destination === '/index.html'
);

assert(
  hasApiRewrite,
  'Test 1B: vercel.json explicitly routes /api/(.*) to /api/$1 serverless functions'
);
assert(
  hasSpaRewrite,
  'Test 1C: vercel.json preserves single-page app rewrite to /index.html'
);

// ----------------------------------------------------------------------
// Category 2: Vercel Serverless Function (api/scrape-job-url.js)
// ----------------------------------------------------------------------
console.log('\n--- CATEGORY 2: Vercel Serverless Function Implementation ---');

assert(
  typeof vercelHandler === 'function',
  'Test 2A: api/scrape-job-url.js exports default async function handler'
);
assert(
  vercelConfig && vercelConfig.runtime === 'nodejs',
  'Test 2B: api/scrape-job-url.js specifies Node.js runtime environment',
  `Runtime: ${vercelConfig?.runtime}`
);

// Mock res helper for Node.js handler testing
function createMockRes() {
  const headers = {};
  let statusCode = 200;
  let body = '';
  return {
    headers,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    status(code) {
      statusCode = code;
      return this;
    },
    set statusCode(code) {
      statusCode = code;
    },
    get statusCode() {
      return statusCode;
    },
    end(data) {
      if (data) body = data;
    },
    json(data) {
      body = JSON.stringify(data);
    },
    getBody() {
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    },
  };
}

// Test CORS pre-flight
const optionsRes = createMockRes();
await vercelHandler({ method: 'OPTIONS' }, optionsRes);
assert(
  optionsRes.statusCode === 200 && optionsRes.headers['access-control-allow-origin'] === '*',
  'Test 2C: Vercel handler satisfies CORS pre-flight (OPTIONS) with 200 and wildcard origin'
);

// Test empty/invalid URL
const invalidRes = createMockRes();
await vercelHandler({ method: 'POST', body: { url: '' } }, invalidRes);
assert(
  invalidRes.statusCode === 400 && invalidRes.getBody()?.success === false,
  'Test 2D: Vercel handler rejects empty URL payload with HTTP 400'
);

// Test non-job domain rejection
const nonJobRes = createMockRes();
await vercelHandler({ method: 'POST', body: { url: 'https://twitter.com/elonmusk' } }, nonJobRes);
const nonJobData = nonJobRes.getBody();
assert(
  nonJobRes.statusCode === 200 && nonJobData?.success === false && nonJobData?.error === INVALID_JOB_URL_ERROR,
  'Test 2E: Vercel handler pre-empts non-job domain with INVALID_JOB_URL_ERROR'
);

// ----------------------------------------------------------------------
// Category 3: Jina AI Reader Cleaner (cleanJinaContent)
// ----------------------------------------------------------------------
console.log('\n--- CATEGORY 3: Jina AI Reader Markdown Cleaner ---');

const rawJinaSample = `Title: Senior Full Stack Engineer (Python & React) - TechCorp Careers
URL Source: https://techcorp.com/careers/senior-full-stack

Markdown Content:
# Senior Full Stack Engineer
![TechCorp Logo](https://techcorp.com/logo.png)

We are hiring a Senior Full Stack Engineer.
**Role**: Senior Full Stack Engineer
**Experience**: 2 - 5 Years
**Skills**: Python, React, PostgreSQL, Docker, AWS

### Key Responsibilities:
- Design and scale distributed cloud applications
- Build responsive UI with React and Tailwind
[Apply for this job](https://techcorp.com/apply)
`;

const cleanedJina = cleanJinaContent(rawJinaSample);

assert(
  cleanedJina.title === 'Senior Full Stack Engineer (Python & React)',
  'Test 3A: cleanJinaContent extracts and cleans job title from Jina metadata',
  `Extracted Title: "${cleanedJina.title}"`
);
assert(
  !cleanedJina.text.includes('![TechCorp Logo]') && !cleanedJina.text.includes('URL Source:'),
  'Test 3B: cleanJinaContent strips Jina header lines and markdown image tags'
);
assert(
  cleanedJina.text.includes('Apply for this job') && !cleanedJina.text.includes('[Apply for this job]('),
  'Test 3C: cleanJinaContent transforms markdown links to clean readable text'
);
assert(
  isJobDescriptionContent(cleanedJina.text, { title: cleanedJina.title }),
  'Test 3D: Cleaned Jina content passes isJobDescriptionContent validation'
);

// Edge case: null or empty
const emptyJina = cleanJinaContent(null);
assert(
  emptyJina.text === '' && emptyJina.title === null,
  'Test 3E: cleanJinaContent handles null input gracefully without throwing'
);

// ----------------------------------------------------------------------
// Category 4: Immunity to "Failed to fetch" & HTML Fallbacks
// ----------------------------------------------------------------------
console.log('\n--- CATEGORY 4: Client Failover & Rejection Immunity ---');

// Simulate scenario where static host returns HTML (e.g. index.html) with 200 OK for /api/scrape-job-url
const originalFetch = globalThis.fetch;

// Mock 1: Server endpoint returns HTML instead of JSON (common Vercel SPA routing misconfiguration)
globalThis.fetch = async function (reqUrl, reqOpts) {
  const urlStr = String(reqUrl);
  if (urlStr === '/api/scrape-job-url') {
    return {
      ok: true,
      headers: {
        get: (h) => (h.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null),
      },
      text: async () => '<!DOCTYPE html><html><body>SPA Root</body></html>',
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0');
      },
    };
  }

  // Jina mock returns valid job content
  if (urlStr.startsWith('https://r.jina.ai/')) {
    return {
      ok: true,
      headers: {
        get: (h) => (h.toLowerCase() === 'content-type' ? 'text/plain' : null),
      },
      text: async () => rawJinaSample,
    };
  }

  return originalFetch.apply(this, arguments);
};

const htmlFallbackResult = await scrapeJobUrl('https://techcorp.com/careers/senior-full-stack');

assert(
  htmlFallbackResult.success === true && htmlFallbackResult.source === 'jina_reader',
  'Test 4A: scrapeJobUrl gracefully bypasses HTML response and falls back to Jina reader',
  `Success: ${htmlFallbackResult.success} | Source: ${htmlFallbackResult.source}`
);

// Mock 2: Server endpoint network error (Ollama / Vercel API offline)
globalThis.fetch = async function (reqUrl, reqOpts) {
  const urlStr = String(reqUrl);
  if (urlStr === '/api/scrape-job-url') {
    throw new TypeError('Failed to fetch');
  }

  if (urlStr.startsWith('https://r.jina.ai/')) {
    return {
      ok: true,
      headers: {
        get: (h) => (h.toLowerCase() === 'content-type' ? 'text/plain' : null),
      },
      text: async () => rawJinaSample,
    };
  }

  return originalFetch.apply(this, arguments);
};

const networkFailResult = await scrapeJobUrl('https://techcorp.com/careers/senior-full-stack');

assert(
  networkFailResult.success === true,
  'Test 4B: scrapeJobUrl recovers from initial "Failed to fetch" network error without crashing',
  `Result: ${networkFailResult.success ? 'Recovered cleanly' : 'Failed'}`
);

// Mock 3: All network endpoints fail (complete offline / blocked intranet site)
globalThis.fetch = async function () {
  throw new TypeError('Failed to fetch');
};

const allFailResult = await scrapeJobUrl('https://internal-company-portal.local/job/999');

assert(
  allFailResult.success === false,
  'Test 4C: scrapeJobUrl returns clean structured failure when all endpoints fail'
);
assert(
  !allFailResult.error.includes('Failed to fetch URL: Failed to fetch'),
  'Test 4D: User-facing error message replaces generic "Failed to fetch" with helpful guidance',
  `Message: "${allFailResult.error}"`
);

// Restore original fetch
globalThis.fetch = originalFetch;

console.log('\n================================================================');
console.log(`   VERCEL SCRAPING RESULTS: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
console.log('================================================================\n');

if (passed !== total) {
  process.exit(1);
}
