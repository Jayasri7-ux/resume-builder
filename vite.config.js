import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import {
  cleanJobHtml,
  extractJobMetadata,
  isJobUrl,
  isKnownNonJobUrl,
  isJobDescriptionContent,
  isBotProtectionResponse,
  INVALID_JOB_URL_ERROR,
} from './src/services/jobUrlScraperService.js'

function jobScraperPlugin() {
  const handler = async (req, res, next) => {
    if (req.url && (req.url === '/api/scrape-job-url' || req.url.startsWith('/api/scrape-job-url?'))) {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body || '{}');
            await processScrape(parsed.url, res);
          } catch (e) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload: ' + e.message }));
          }
        });
        return;
      } else if (req.method === 'GET') {
        const u = new URL(req.url, 'http://localhost');
        const targetUrl = u.searchParams.get('url');
        await processScrape(targetUrl, res);
        return;
      }
    }
    next();
  };

  async function processScrape(targetUrl, res) {
    res.setHeader('Content-Type', 'application/json');
    if (!targetUrl || !isJobUrl(targetUrl)) {
      res.statusCode = 400;
      res.end(JSON.stringify({
        success: false,
        error: 'Please provide a valid web link starting with http:// or https://',
      }));
      return;
    }

    // Abort early for known non-job URLs (social media, general news, wikis, etc.)
    if (isKnownNonJobUrl(targetUrl)) {
      res.statusCode = 200;
      res.end(JSON.stringify({
        success: false,
        error: INVALID_JOB_URL_ERROR,
      }));
      return;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Upgrade-Insecure-Requests': '1',
        },
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timeout);

      if (!response.ok) {
        res.statusCode = 200;
        let botOrRedirectMessage = `Target server responded with HTTP status ${response.status} (${response.statusText}). Please paste the job description text directly.`;
        if (response.status === 403 || response.status === 401) {
          botOrRedirectMessage = `Access to this job link was blocked by anti-bot verification or login authentication (HTTP ${response.status}). Please copy and paste the job description text directly.`;
        } else if (response.status === 429) {
          botOrRedirectMessage = 'Too many requests / rate limit reached for this site (HTTP 429). Please wait a moment or paste the job description text directly.';
        } else if (response.status === 404 || response.status === 410) {
          botOrRedirectMessage = `Job posting not found or expired (HTTP ${response.status}). Please check the URL or paste the job description text directly.`;
        }
        res.end(JSON.stringify({
          success: false,
          error: botOrRedirectMessage,
          isBotBlocked: response.status === 403 || response.status === 401,
        }));
        return;
      }

      // Check if redirect lead to an authentication/login screen
      if (response.url && (
        response.url.includes('/login') ||
        response.url.includes('/signin') ||
        response.url.includes('/auth') ||
        response.url.includes('accounts.google.com')
      )) {
        res.statusCode = 200;
        res.end(JSON.stringify({
          success: false,
          error: 'This job link redirected to an authentication login screen. Please copy and paste the job description text directly.',
          isLoginRedirect: true,
        }));
        return;
      }

      const rawHtml = await response.text();

      // Check for bot verification challenge screens (Cloudflare Turnstile, CAPTCHA, Incapsula)
      if (isBotProtectionResponse(rawHtml)) {
        res.statusCode = 200;
        res.end(JSON.stringify({
          success: false,
          error: 'Access blocked by automated bot security verification (Cloudflare/CAPTCHA). Please copy and paste the job description text directly.',
          isBotBlocked: true,
        }));
        return;
      }

      const cleanText = cleanJobHtml(rawHtml);
      const meta = extractJobMetadata(rawHtml);

      // Validate that extracted content is an actual job description
      if (!isJobDescriptionContent(cleanText, meta, targetUrl)) {
        res.statusCode = 200;
        res.end(JSON.stringify({
          success: false,
          error: INVALID_JOB_URL_ERROR,
        }));
        return;
      }

      const wordCount = cleanText.split(/\s+/).filter(Boolean).length;
      res.statusCode = 200;
      res.end(JSON.stringify({
        success: true,
        text: cleanText,
        title: meta.title,
        company: meta.company,
        location: meta.location,
        wordCount,
        charCount: cleanText.length,
      }));
    } catch (err) {
      res.statusCode = 200;
      const errorMsg = err.name === 'AbortError'
        ? 'Request timed out while connecting to the job posting URL.'
        : `Could not fetch job URL: ${err.message || 'Network error'}.`;
      res.end(JSON.stringify({
        success: false,
        error: `${errorMsg} Please paste the job description text directly.`,
      }));
    }
  }

  return {
    name: 'job-scraper-middleware',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), jobScraperPlugin()],
})
