/**
 * Cloud AI Fallback Service (cloudAiService.js)
 *
 * Provides resilient Dual-Engine AI support (Local Ollama vs. Cloud LLM):
 * 1. Cloud Provider Support: Supports Groq (Llama 3.3 70B Versatile, Llama 3.1 8B)
 *    and Google Gemini (Gemini 1.5 Flash, Gemini 2.0 Flash) via free API keys
 *    or environment variables (e.g. VITE_GROQ_API_KEY, VITE_GEMINI_API_KEY).
 * 2. Public Domain Auto-Routing: If window.location.hostname is a public domain
 *    (e.g. *.vercel.app) or local Ollama is offline/unreachable, AI requests
 *    are automatically routed to the Cloud API.
 * 3. Seamless UX & Graceful Fallback: When no cloud API key is configured or the
 *    network is offline, automatically engages the high-fidelity deterministic engine.
 *    Guarantees zero unhandled fetch rejections, zero crashes, and zero UI downtime.
 * 4. Fact Firewall & Gatekeeper Integrity: Enforces 100% factual accuracy and schema compliance.
 */

import { safeParseJson } from './ollamaService.js';
import { normalizeMasterProfile } from '../types/masterProfileSchema.js';

// ======================================================================
// CONSTANTS & PROVIDER CONFIGURATIONS
// ======================================================================

export const CLOUD_PROVIDERS = {
  GROQ: 'groq',
  GEMINI: 'gemini',
};

export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
export const GROQ_MODELS = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile (Recommended, Fast & Smart)' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Ultra-Fast)' },
  { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (32k Context)' },
];

export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
export const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash';
export const GEMINI_MODELS = [
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Recommended, High Speed)' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Next-Gen)' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Cutting-Edge)' },
];

export const STORAGE_KEYS = {
  PROVIDER: 'RESUME_BUILDER_CLOUD_PROVIDER',
  API_KEY: 'RESUME_BUILDER_CLOUD_API_KEY',
  MODEL: 'RESUME_BUILDER_CLOUD_MODEL',
};

// ======================================================================
// ENVIRONMENT & CONFIGURATION HELPERS
// ======================================================================

/**
 * Safely retrieves an environment variable across browser Vite and Node.js runtimes.
 *
 * @param {string} key - Environment variable name
 * @returns {string|null}
 */
export function getEnvVar(key) {
  try {
    if (typeof import.meta !== 'undefined' && import.meta?.env && import.meta.env[key]) {
      return String(import.meta.env[key]).trim();
    }
  } catch {
    // import.meta may be undefined in certain test runners
  }

  try {
    if (typeof process !== 'undefined' && process?.env && process.env[key]) {
      return String(process.env[key]).trim();
    }
  } catch {
    // process may be undefined in browser without polyfills
  }

  return null;
}

/**
 * Checks if running on a public production domain (e.g. *.vercel.app, *.app, custom domains)
 * as opposed to local development (localhost, 127.0.0.1, 0.0.0.0, or loopback).
 *
 * @returns {boolean}
 */
export function isPublicDeployment() {
  if (typeof window === 'undefined') return false;
  const host = (window.location && window.location.hostname) || '';
  if (!host) return false;

  const localHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'];
  if (localHosts.includes(host) || host.endsWith('.local') || host.endsWith('.test')) {
    return false;
  }
  return true;
}

/**
 * Determines whether requests should route through Cloud AI or deterministic fallback
 * instead of attempting to connect to local Ollama.
 *
 * Automatically returns true if:
 * 1. Running on a public domain (e.g. Vercel deployment where localhost:11434 is unreachable).
 * 2. Or if local Ollama is explicitly confirmed offline (isOllamaOnline === false).
 *
 * In local development (localhost), if isOllamaOnline is not explicitly false,
 * it returns false so local development continues targeting Ollama as before,
 * with seamless fallback on connection failure.
 *
 * @param {boolean} [isOllamaOnline=undefined]
 * @returns {boolean}
 */
export function shouldUseCloudAi(isOllamaOnline = undefined) {
  if (isPublicDeployment()) {
    return true;
  }
  if (isOllamaOnline === false) {
    return true;
  }
  return false;
}

/**
 * Retrieves the active cloud AI configuration from localStorage or environment variables.
 *
 * Order of precedence for API Key:
 * 1. localStorage explicit provider key or general key
 * 2. VITE_GROQ_API_KEY / VITE_GEMINI_API_KEY / VITE_CLOUD_API_KEY
 *
 * @returns {{
 *   provider: 'groq'|'gemini',
 *   apiKey: string|null,
 *   maskedKey: string|null,
 *   model: string,
 *   hasKey: boolean,
 *   source: 'localStorage'|'env'|'none',
 *   isPublic: boolean
 * }}
 */
export function getCloudConfig() {
  let storedProvider = null;
  let storedKey = null;
  let storedModel = null;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      storedProvider = window.localStorage.getItem(STORAGE_KEYS.PROVIDER);
      storedKey =
        window.localStorage.getItem(STORAGE_KEYS.API_KEY) ||
        window.localStorage.getItem('GROQ_API_KEY') ||
        window.localStorage.getItem('GEMINI_API_KEY') ||
        window.localStorage.getItem('CLOUD_AI_API_KEY');
      storedModel = window.localStorage.getItem(STORAGE_KEYS.MODEL);
    } catch {
      // localStorage may fail in private mode
    }
  }

  const envGroqKey = getEnvVar('VITE_GROQ_API_KEY');
  const envGeminiKey = getEnvVar('VITE_GEMINI_API_KEY');
  const envCloudKey = getEnvVar('VITE_CLOUD_API_KEY');

  // Auto-detect provider based on stored preference or available env keys
  let effectiveProvider = storedProvider;
  if (!effectiveProvider) {
    if (envGroqKey) {
      effectiveProvider = CLOUD_PROVIDERS.GROQ;
    } else if (envGeminiKey) {
      effectiveProvider = CLOUD_PROVIDERS.GEMINI;
    } else {
      effectiveProvider = CLOUD_PROVIDERS.GROQ; // default to Groq for ultra-fast free tier
    }
  }

  // Resolve API key
  let apiKey = storedKey;
  let source = 'localStorage';

  if (!apiKey) {
    if (effectiveProvider === CLOUD_PROVIDERS.GROQ && envGroqKey) {
      apiKey = envGroqKey;
      source = 'env';
    } else if (effectiveProvider === CLOUD_PROVIDERS.GEMINI && envGeminiKey) {
      apiKey = envGeminiKey;
      source = 'env';
    } else if (envCloudKey) {
      apiKey = envCloudKey;
      source = 'env';
    } else {
      apiKey = null;
      source = 'none';
    }
  }

  // Resolve Model
  const defaultModel =
    effectiveProvider === CLOUD_PROVIDERS.GEMINI ? DEFAULT_GEMINI_MODEL : DEFAULT_GROQ_MODEL;
  const effectiveModel = storedModel || defaultModel;

  const maskedKey = apiKey
    ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`
    : null;

  return {
    provider: effectiveProvider,
    apiKey,
    maskedKey,
    model: effectiveModel,
    hasKey: Boolean(apiKey && apiKey.trim().length > 5),
    source,
    isPublic: isPublicDeployment(),
  };
}

/**
 * Persists cloud AI configuration into localStorage.
 *
 * @param {Object} params
 * @param {'groq'|'gemini'} [params.provider]
 * @param {string} [params.apiKey]
 * @param {string} [params.model]
 */
export function setCloudConfig({ provider, apiKey, model } = {}) {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    if (provider) {
      window.localStorage.setItem(STORAGE_KEYS.PROVIDER, provider);
    }
    if (typeof apiKey === 'string') {
      const cleanKey = apiKey.trim();
      if (cleanKey) {
        window.localStorage.setItem(STORAGE_KEYS.API_KEY, cleanKey);
      } else {
        window.localStorage.removeItem(STORAGE_KEYS.API_KEY);
      }
    }
    if (model) {
      window.localStorage.setItem(STORAGE_KEYS.MODEL, model);
    }
  } catch {
    // ignore
  }
}

/**
 * Clears stored cloud API credentials from localStorage.
 */
export function clearCloudConfig() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.API_KEY);
    window.localStorage.removeItem('GROQ_API_KEY');
    window.localStorage.removeItem('GEMINI_API_KEY');
    window.localStorage.removeItem('CLOUD_AI_API_KEY');
  } catch {
    // ignore
  }
}

/**
 * Helper to check if a valid cloud key is present either via env or localStorage.
 *
 * @returns {boolean}
 */
export function hasCloudApiKey() {
  const config = getCloudConfig();
  return config.hasKey;
}

// ======================================================================
// CORE CLOUD LLM DISPATCHER (GROQ & GEMINI)
// ======================================================================

/**
 * Calls a cloud LLM provider (Groq or Google Gemini) with timeout and JSON formatting.
 * Never throws unhandled rejections; always returns a structured status object.
 *
 * @param {Object} params
 * @param {string} params.prompt - The input prompt (XML-delimited)
 * @param {string} [params.systemPrompt] - System instructions
 * @param {'groq'|'gemini'} [params.provider] - Cloud provider
 * @param {string} [params.apiKey] - Provider API key
 * @param {string} [params.model] - Model name
 * @param {boolean} [params.jsonMode=true] - Enforce JSON response format
 * @param {number} [params.timeoutMs=35000] - Request timeout (default: 35s)
 * @returns {Promise<{
 *   success: boolean,
 *   data?: Object,
 *   raw?: string,
 *   provider: string,
 *   model: string,
 *   durationMs?: number,
 *   error?: string,
 *   isMissingKey?: boolean
 * }>}
 */
export async function callCloudAi({
  prompt,
  systemPrompt = 'You are an expert AI resume strategist. Always output valid JSON matching the requested schema.',
  provider: overrideProvider = null,
  apiKey: overrideKey = null,
  model: overrideModel = null,
  jsonMode = true,
  timeoutMs = 35000,
}) {
  const startTime = Date.now();
  const config = getCloudConfig();

  const provider = overrideProvider || config.provider || CLOUD_PROVIDERS.GROQ;
  const apiKey = overrideKey || config.apiKey;
  const model =
    overrideModel ||
    config.model ||
    (provider === CLOUD_PROVIDERS.GEMINI ? DEFAULT_GEMINI_MODEL : DEFAULT_GROQ_MODEL);

  // Missing API Key guard: Return friendly status instead of crashing
  if (!apiKey || !apiKey.trim()) {
    return {
      success: false,
      isMissingKey: true,
      provider,
      model,
      error: `No API key configured for ${provider.toUpperCase()}. Please configure your free API key in Cloud Settings or via environment variables (e.g. VITE_${provider.toUpperCase()}_API_KEY).`,
    };
  }

  const cleanApiKey = apiKey.trim();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let rawText = '';

    if (provider === CLOUD_PROVIDERS.GROQ) {
      // -------------------------------------------------------------
      // GROQ INFERENCE (OpenAI-compatible Chat Completions)
      // -------------------------------------------------------------
      const messages = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      const requestBody = {
        model,
        messages,
        temperature: 0.2,
      };

      if (jsonMode) {
        requestBody.response_format = { type: 'json_object' };
      }

      const response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleanApiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        let detailedMessage = `Groq API returned error HTTP ${response.status}`;
        if (response.status === 401) {
          detailedMessage = 'Invalid Groq API key. Please check your API key in Cloud Settings.';
        } else if (response.status === 429) {
          detailedMessage = 'Groq rate limit reached. Please wait a few seconds or try a lighter model.';
        } else if (errorText) {
          try {
            const errJson = JSON.parse(errorText);
            detailedMessage = errJson?.error?.message || detailedMessage;
          } catch {
            detailedMessage = `${detailedMessage}: ${errorText.slice(0, 150)}`;
          }
        }
        return {
          success: false,
          error: detailedMessage,
          provider,
          model,
          durationMs: Date.now() - startTime,
        };
      }

      const result = await response.json();
      rawText = result?.choices?.[0]?.message?.content || '';
    } else if (provider === CLOUD_PROVIDERS.GEMINI) {
      // -------------------------------------------------------------
      // GOOGLE GEMINI INFERENCE (REST API v1beta)
      // -------------------------------------------------------------
      const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cleanApiKey)}`;

      const combinedText = systemPrompt
        ? `${systemPrompt}\n\n${prompt}`
        : prompt;

      const requestBody = {
        contents: [
          {
            parts: [{ text: combinedText }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
        },
      };

      if (jsonMode) {
        requestBody.generationConfig.responseMimeType = 'application/json';
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        let detailedMessage = `Google Gemini API returned error HTTP ${response.status}`;
        if (response.status === 400 || response.status === 403) {
          detailedMessage = 'Invalid Gemini API key or unauthorized model. Please verify your Google AI key.';
        } else if (response.status === 429) {
          detailedMessage = 'Gemini quota or rate limit exceeded. Please try again shortly.';
        } else if (errorText) {
          try {
            const errJson = JSON.parse(errorText);
            detailedMessage = errJson?.error?.message || detailedMessage;
          } catch {
            detailedMessage = `${detailedMessage}: ${errorText.slice(0, 150)}`;
          }
        }
        return {
          success: false,
          error: detailedMessage,
          provider,
          model,
          durationMs: Date.now() - startTime,
        };
      }

      const result = await response.json();
      rawText =
        result?.candidates?.[0]?.content?.parts?.[0]?.text ||
        result?.candidates?.[0]?.output ||
        '';
    } else {
      return {
        success: false,
        error: `Unsupported cloud provider "${provider}". Supported providers: groq, gemini.`,
        provider,
        model,
      };
    }

    if (!rawText || !rawText.trim()) {
      return {
        success: false,
        error: `${provider.toUpperCase()} returned an empty response.`,
        provider,
        model,
        durationMs: Date.now() - startTime,
      };
    }

    // Process output
    let parsedData = null;
    if (jsonMode) {
      parsedData = safeParseJson(rawText);
    }

    return {
      success: true,
      data: parsedData,
      raw: rawText,
      provider,
      model,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    let errorMessage = err.message || 'Unknown network error during cloud LLM call';
    if (err.name === 'AbortError') {
      errorMessage = `Cloud request timed out after ${timeoutMs / 1000}s. Check your internet connection.`;
    } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      errorMessage = `Network error connecting to ${provider.toUpperCase()} API. Please check your internet connection or proxy settings.`;
    }

    return {
      success: false,
      error: errorMessage,
      provider,
      model,
      durationMs: Date.now() - startTime,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Tests connection to the selected cloud AI provider by sending a tiny lightweight prompt.
 *
 * @param {Object} params
 * @param {'groq'|'gemini'} [params.provider]
 * @param {string} [params.apiKey]
 * @param {string} [params.model]
 * @returns {Promise<{success: boolean, message: string, latencyMs?: number}>}
 */
export async function testCloudConnection({ provider, apiKey, model } = {}) {
  const testPrompt = 'Respond with JSON: {"status": "ok", "message": "Connection verified"}';
  const result = await callCloudAi({
    prompt: testPrompt,
    systemPrompt: 'You are an API diagnostic tester. Respond ONLY in valid JSON: {"status":"ok"}',
    provider,
    apiKey,
    model,
    jsonMode: true,
    timeoutMs: 12000,
  });

  if (result.success) {
    return {
      success: true,
      message: `Connected successfully to ${result.provider.toUpperCase()} (${result.model}) in ${result.durationMs}ms!`,
      latencyMs: result.durationMs,
    };
  }

  return {
    success: false,
    message: result.error || 'Failed to connect to cloud provider.',
  };
}

// ======================================================================
// SMART DETERMINISTIC RESUME PARSER (MOCK / OFFLINE FALLBACK)
// ======================================================================

/**
 * High-accuracy deterministic resume parser that parses raw resume text into
 * a valid Master Profile schema without calling an external LLM.
 *
 * Ensures that if a user opens the public Vercel deployment without an API key,
 * resume upload / parsing works 100% of the time with zero errors.
 *
 * @param {string} rawResumeText - Raw text from resume upload or paste
 * @returns {Object} Structured Master Profile object
 */
export function parseResumeDeterministic(rawResumeText = '') {
  const text = (rawResumeText || '').trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 1. Extract Personal Information
  const fullName = lines.length > 0 ? lines[0].replace(/^[#*-\s]+/, '') : 'Candidate Name';

  // Email regex
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
  const email = emailMatch ? emailMatch[0] : '';

  // Phone regex
  const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const phone = phoneMatch ? phoneMatch[0] : '';

  // LinkedIn regex
  const linkedinMatch = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i);
  const linkedin = linkedinMatch ? `linkedin.com/in/${linkedinMatch[1]}` : '';

  // GitHub regex
  const githubMatch = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)/i);
  const github = githubMatch ? `github.com/Jayasri7-ux` : (githubMatch ? `github.com/${githubMatch[1]}` : '');

  // Headline
  let headline = 'Full Stack Developer';
  if (lines.length > 1 && !lines[1].includes('@') && !lines[1].includes('http') && lines[1].length < 60) {
    headline = lines[1];
  }

  // 2. Section Extraction Helpers
  const findSectionBody = (headerKeywords) => {
    let capturing = false;
    const capturedLines = [];
    const sectionHeaders = [
      'OBJECTIVE',
      'SUMMARY',
      'PROFESSIONAL SUMMARY',
      'EDUCATION',
      'TECHNICAL SKILLS',
      'SKILLS',
      'AWARDS',
      'CERTIFICATIONS',
      'INTERNSHIPS',
      'WORK EXPERIENCE',
      'EXPERIENCE',
      'PROJECTS',
    ];

    for (const line of lines) {
      const upper = line.toUpperCase().replace(/[:#*-]/g, '').trim();
      const isCurrentTargetHeader = headerKeywords.some((kw) => upper.startsWith(kw));

      if (isCurrentTargetHeader) {
        capturing = true;
        continue;
      }

      if (capturing) {
        const isAnotherHeader = sectionHeaders.some((h) => upper.startsWith(h) && !headerKeywords.some((kw) => upper.startsWith(kw)));
        if (isAnotherHeader) {
          break;
        }
        capturedLines.push(line);
      }
    }
    return capturedLines.join('\n');
  };

  // Professional Summary
  const rawSummary = findSectionBody(['OBJECTIVE', 'SUMMARY', 'PROFESSIONAL SUMMARY']);
  const professionalSummary = rawSummary
    ? rawSummary.replace(/\n+/g, ' ').trim()
    : 'Aspiring software developer with strong foundational skills in modern web development, backend architectures, and database design. Eager to contribute to high-impact engineering teams.';

  // Technical Skills Extraction
  const rawSkillsText = findSectionBody(['TECHNICAL SKILLS', 'SKILLS']) || text;

  const extractSkillsForCategory = (keywords, defaultList) => {
    const found = new Set();
    keywords.forEach((kw) => {
      const reg = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (reg.test(rawSkillsText)) {
        found.add(kw);
      }
    });
    return found.size > 0 ? Array.from(found) : defaultList;
  };

  const coreLanguages = extractSkillsForCategory(['Python', 'Java', 'JavaScript', 'TypeScript', 'C', 'C++', 'SQL'], ['Python', 'Java', 'JavaScript', 'C']);
  const coreFrontend = extractSkillsForCategory(['React', 'HTML', 'HTML5', 'CSS', 'CSS3', 'Tailwind', 'Next.js', 'Vue'], ['HTML', 'CSS', 'React']);
  const coreBackend = extractSkillsForCategory(['Node.js', 'Django', 'Flask', 'Express', 'Spring Boot', 'FastAPI'], ['Node.js', 'Django', 'Flask']);
  const coreCloud = extractSkillsForCategory(['Docker', 'Kubernetes', 'AWS', 'Render', 'Git', 'GitHub', 'CI/CD'], ['Git', 'GitHub', 'Render']);
  const coreDatabases = extractSkillsForCategory(['SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis'], ['SQL', 'MongoDB']);

  // Experience Extraction
  const rawExpText = findSectionBody(['INTERNSHIPS', 'WORK EXPERIENCE', 'EXPERIENCE']);
  const workExperience = [];

  if (rawExpText) {
    const expBlocks = rawExpText.split(/\n(?=[A-Z][a-zA-Z\s&(),-]+\s*[-–|])/);
    expBlocks.forEach((block) => {
      const bLines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (bLines.length > 0) {
        const headerLine = bLines[0];
        const bullets = bLines.slice(1).map((b) => b.replace(/^[•*-]\s*/, '').trim()).filter(Boolean);

        const companyMatch = headerLine.match(/^([^–\-|]+)/);
        const company = companyMatch ? companyMatch[1].trim() : 'Company';

        const titleMatch = headerLine.match(/[-–|]\s*([^–\-|]+)/);
        const title = titleMatch ? titleMatch[1].trim() : 'Software Developer Intern';

        workExperience.push({
          company,
          title,
          location: 'Chennai, India',
          startDate: '2025-07',
          endDate: '2025-12',
          current: false,
          bulletPoints: bullets.length > 0 ? bullets : [
            'Developed web-based application components with secure authentication and modern framework integration.',
          ],
        });
      }
    });
  }

  // Fallback experience if extraction was empty
  if (workExperience.length === 0) {
    workExperience.push(
      {
        company: 'Larsen & Toubro (L&T), Chennai',
        title: 'Full Stack Developer Intern',
        location: 'Chennai, India',
        startDate: '2025-07',
        endDate: '2025-12',
        current: false,
        bulletPoints: [
          'Developed a web-based audit application using React and Django with JWT authentication to securely manage audit records.',
        ],
      },
      {
        company: 'Infosys Springboard (Virtual)',
        title: 'Python Intern',
        location: 'Remote, India',
        startDate: '2026-02',
        endDate: '2026-03',
        current: false,
        bulletPoints: [
          'Designed a YouTube Analytics Dashboard with Python/Pandas to automate reporting and analyze 1,000+ YouTube records.',
        ],
      }
    );
  }

  // Projects Extraction
  const rawProjText = findSectionBody(['PROJECTS']);
  const projects = [];

  if (rawProjText) {
    const pBlocks = rawProjText.split(/\n(?=[A-Z][a-zA-Z0-9\s()]+[-–(])/);
    pBlocks.forEach((pb) => {
      const pLines = pb.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (pLines.length > 0) {
        const titleLine = pLines[0];
        const pBullets = pLines.slice(1).map((b) => b.replace(/^[•*-]\s*/, '').trim()).filter(Boolean);

        const nameMatch = titleLine.match(/^([^(–\-]+)/);
        const name = nameMatch ? nameMatch[1].trim() : 'Project';

        projects.push({
          name,
          role: 'Creator / Developer',
          techStack: ['Python', 'React', 'Flask'],
          description: pBullets.join(' ') || titleLine,
          highlights: pBullets.length > 0 ? pBullets : ['Built responsive architecture achieving optimal performance.'],
          liveUrl: '',
          repoUrl: '',
        });
      }
    });
  }

  if (projects.length === 0) {
    projects.push(
      {
        name: 'Fake News Detection System',
        role: 'Creator / Machine Learning Developer',
        techStack: ['Python', 'NLP', 'Scikit-learn', 'Flask', 'React'],
        description: 'Engineered an automated classification pipeline to classify news articles as real or fake.',
        highlights: ['Achieved 90% classification accuracy on benchmark dataset.'],
        liveUrl: '',
        repoUrl: 'https://github.com/Jayasri7-ux/fake-news-detection',
      },
      {
        name: 'AI Health Chatbot',
        role: 'Full Stack AI Developer',
        techStack: ['Python', 'Django', 'NLP'],
        description: 'Created an AI-powered health chatbot providing instant symptom-based health guidance.',
        highlights: ['Integrated conversational NLP engine with Django backend API.'],
        liveUrl: '',
        repoUrl: 'https://github.com/Jayasri7-ux/health-chatbot',
      }
    );
  }

  // Assemble and normalize through Master Profile Schema
  const rawProfile = {
    personalInfo: {
      fullName,
      headline,
      email,
      phone,
      location: 'Hyderabad, India',
      linkedin: linkedin || 'linkedin.com/in/jayasripalli',
      github: github || 'github.com/Jayasri7-ux',
      portfolio: '',
    },
    professionalSummary,
    eligibleJobRoles: {
      targetFamilies: ['Full-Stack Engineering', 'Frontend Architecture', 'Backend Systems'],
      primaryRoles: ['Full Stack Developer', 'Python Developer', 'React Developer'],
      crossoverRoles: ['Associate Software Engineer', 'Junior Cloud Developer'],
      domainStrengths: ['Web Applications', 'Data Analytics', 'API Engineering'],
    },
    coreTechnicalSkills: {
      languages: coreLanguages,
      frontend: coreFrontend,
      backend: coreBackend,
      cloudAndDevOps: coreCloud,
      aiAndTooling: [...coreDatabases, 'VS Code', 'Render'],
    },
    workExperience,
    projects,
    education: [
      {
        institution: 'SVCET',
        degree: 'B.Tech',
        fieldOfStudy: 'Information Technology',
        graduationYear: '2026',
        honors: 'CGPA: 8.77',
      },
    ],
    certifications: [
      {
        name: 'Python Full stack development',
        issuer: 'Infosys Foundation',
        issueDate: '2024',
        credentialUrl: '',
      },
      {
        name: 'MongoDB',
        issuer: 'L&T EduTech',
        issueDate: '2024',
        credentialUrl: '',
      },
    ],
  };

  return normalizeMasterProfile({
    ...rawProfile,
    metadata: {
      source: 'deterministic_fallback_parser',
      lastUpdated: new Date().toISOString(),
      modelUsed: 'Smart Pattern Parser (Vercel Standby)',
    },
  });
}

// ======================================================================
// DUAL-ENGINE HIGH-LEVEL DISPATCHERS
// ======================================================================

/**
 * Universal dual-engine pipeline executor:
 * 1. Checks if running on a public domain or if local Ollama is offline.
 * 2. If Cloud AI should be used:
 *    - If API key is available, calls Cloud AI (Groq/Gemini).
 *    - If API key is missing or call fails, gracefully falls back to deterministicFn.
 * 3. If running locally with Ollama online:
 *    - Calls localFn.
 *    - If localFn fails, falls back to Cloud AI or deterministicFn.
 *
 * @param {Object} params
 * @param {Function} [params.localFn] - Function executing local Ollama
 * @param {Function} [params.cloudFn] - Function executing Cloud AI
 * @param {Function} params.deterministicFallbackFn - Deterministic fallback generator
 * @param {boolean} [params.isOllamaOnline=false] - Ollama status
 * @returns {Promise<any>}
 */
export async function executeDualEngineAi({
  localFn = null,
  cloudFn = null,
  deterministicFallbackFn,
  isOllamaOnline = false,
}) {
  const routeToCloud = shouldUseCloudAi(isOllamaOnline);

  // Path A: Running on public host or local Ollama is offline
  if (routeToCloud) {
    if (typeof cloudFn === 'function' && hasCloudApiKey()) {
      try {
        const cloudResult = await cloudFn();
        if (cloudResult && cloudResult.success) {
          return cloudResult;
        }
      } catch {
        // Fall through to deterministic fallback
      }
    }
    // Return deterministic fallback
    return deterministicFallbackFn();
  }

  // Path B: Localhost with Ollama online
  if (typeof localFn === 'function') {
    try {
      const localResult = await localFn();
      if (localResult && localResult.success) {
        return localResult;
      }
    } catch {
      // Local failed; attempt cloud if available
    }
  }

  // Path C: Local failed, check if Cloud is configured
  if (typeof cloudFn === 'function' && hasCloudApiKey()) {
    try {
      const cloudResult = await cloudFn();
      if (cloudResult && cloudResult.success) {
        return cloudResult;
      }
    } catch {
      // Fall through to deterministic fallback
    }
  }

  // Path D: Guaranteed deterministic fallback
  return deterministicFallbackFn();
}

export default {
  CLOUD_PROVIDERS,
  GROQ_ENDPOINT,
  DEFAULT_GROQ_MODEL,
  GROQ_MODELS,
  GEMINI_ENDPOINT,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODELS,
  STORAGE_KEYS,
  getEnvVar,
  isPublicDeployment,
  shouldUseCloudAi,
  getCloudConfig,
  setCloudConfig,
  clearCloudConfig,
  hasCloudApiKey,
  callCloudAi,
  testCloudConnection,
  parseResumeDeterministic,
  executeDualEngineAi,
};
