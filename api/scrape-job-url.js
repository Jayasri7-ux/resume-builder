/**
 * Vercel Serverless Function: /api/scrape-job-url
 *
 * Runs on Node.js in Vercel production without browser CORS restrictions.
 * Scrapes the target job posting URL directly using server-to-server fetch,
 * and falls back to Jina AI Reader if the target domain blocks datacenter IPs.
 */

import {
  cleanJobHtml,
  extractJobMetadata,
  isJobUrl,
  isKnownNonJobUrl,
  isJobDescriptionContent,
  isBotProtectionResponse,
  cleanJinaContent,
  INVALID_JOB_URL_ERROR,
} from '../src/services/jobUrlScraperService.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 15,
};

export default async function handler(req, res) {
  // 1. Enable full CORS for public deployment
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  // Unified response helper
  const sendJson = (status, data) => {
    res.statusCode = status;
    if (typeof res.status === 'function') {
      res.status(status);
    }
    res.setHeader('Content-Type', 'application/json');
    if (typeof res.json === 'function') {
      return res.json(data);
    }
    return res.end(JSON.stringify(data));
  };

  // 2. Extract target URL from POST body or GET query
  let targetUrl = null;
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    } else if (!body) {
      try {
        const buffers = [];
        for await (const chunk of req) {
          buffers.push(chunk);
        }
        const raw = Buffer.concat(buffers).toString();
        body = JSON.parse(raw || '{}');
      } catch {
        body = {};
      }
    }
    targetUrl = body?.url;
  } else if (req.method === 'GET') {
    targetUrl = req.query?.url;
    if (!targetUrl && req.url) {
      try {
        const parsed = new URL(req.url, 'http://localhost');
        targetUrl = parsed.searchParams.get('url');
      } catch {
        targetUrl = null;
      }
    }
  }

  if (!targetUrl || !isJobUrl(targetUrl)) {
    return sendJson(400, {
      success: false,
      error: 'Please provide a valid web link starting with http:// or https://',
    });
  }

  // Abort early for known non-job URLs (social media, news, blogs, wikis)
  if (isKnownNonJobUrl(targetUrl)) {
    return sendJson(200, {
      success: false,
      error: INVALID_JOB_URL_ERROR,
    });
  }

  // 3. Stage A: Direct server fetch with browser User-Agent
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    let rawHtml = '';
    let responseStatus = 200;
    let redirectedToAuth = false;

    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept':
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Upgrade-Insecure-Requests': '1',
        },
        signal: controller.signal,
        redirect: 'follow',
      });
      responseStatus = response.status;

      if (response.url && (
        response.url.includes('/login') ||
        response.url.includes('/signin') ||
        response.url.includes('/auth') ||
        response.url.includes('accounts.google.com')
      )) {
        redirectedToAuth = true;
      }

      if (response.ok) {
        rawHtml = await response.text();
      }
    } catch {
      // Direct fetch failed or timed out; proceed to Stage B (Jina AI reader)
    } finally {
      clearTimeout(timeout);
    }

    if (redirectedToAuth) {
      return sendJson(200, {
        success: false,
        error: 'This job link redirected to an authentication login screen. Please copy and paste the job description text directly.',
        isLoginRedirect: true,
      });
    }

    // If direct HTML was obtained without bot block, clean and return
    if (rawHtml && !isBotProtectionResponse(rawHtml, responseStatus)) {
      const cleanText = cleanJobHtml(rawHtml);
      const meta = extractJobMetadata(rawHtml);

      if (isJobDescriptionContent(cleanText, meta, targetUrl)) {
        const wordCount = cleanText.split(/\s+/).filter(Boolean).length;
        return sendJson(200, {
          success: true,
          text: cleanText,
          title: meta.title,
          company: meta.company,
          location: meta.location,
          wordCount,
          charCount: cleanText.length,
          source: 'vercel_direct',
        });
      }
    }

    // 4. Stage B: Server-Side Jina AI Reader (bypasses Cloudflare / SPA client rendering)
    try {
      const jinaController = new AbortController();
      const jinaTimeout = setTimeout(() => jinaController.abort(), 9000);

      const jinaRes = await fetch(`https://r.jina.ai/${targetUrl}`, {
        headers: {
          'Accept': 'text/plain, text/markdown',
          'X-No-Cache': 'true',
        },
        signal: jinaController.signal,
      });
      clearTimeout(jinaTimeout);

      if (jinaRes.ok) {
        const jinaRaw = await jinaRes.text();
        const cleaned = cleanJinaContent(jinaRaw);
        const meta = { title: cleaned.title, company: null };

        if (cleaned.text && isJobDescriptionContent(cleaned.text, meta, targetUrl)) {
          const wordCount = cleaned.text.split(/\s+/).filter(Boolean).length;
          return sendJson(200, {
            success: true,
            text: cleaned.text,
            title: cleaned.title || null,
            company: null,
            location: null,
            wordCount,
            charCount: cleaned.text.length,
            source: 'vercel_jina',
          });
        }
      }
    } catch {
      // Jina failed or timed out
    }

    // If content was fetched but failed JD validation
    return sendJson(200, {
      success: false,
      error: INVALID_JOB_URL_ERROR,
    });
  } catch {
    return sendJson(200, {
      success: false,
      error: INVALID_JOB_URL_ERROR,
    });
  }
}
