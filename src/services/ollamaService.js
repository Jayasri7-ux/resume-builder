/**
 * Ollama AI Service
 * Configured for local LLM integration at http://localhost:11434
 * Enforces JSON output format, XML prompt delimiters (<user_jd> / <user_input>),
 * and robust try/catch error boundaries.
 */

export const OLLAMA_BASE_URL = 'http://localhost:11434';
export const DEFAULT_MODEL = 'llama3.2:latest';

/**
 * Constructs an AI prompt strictly delimited with XML tags:
 * <user_jd> ... </user_jd> and <user_input> ... </user_input>
 * Instructs the LLM to output valid JSON conforming to the resume schema.
 *
 * @param {Object} params
 * @param {string} params.userJd - The Target Job Description
 * @param {string} params.userInput - The User's raw resume data / experience details
 * @param {string} [params.instructions] - Optional additional instructions or constraints
 * @returns {string} Formatted prompt string
 */
export function buildXmlPrompt({ userJd = '', userInput = '', instructions = '' }) {
  const safeJd = userJd.trim() || 'No specific job description provided. Optimize for general industry best practices.';
  const safeInput = userInput.trim() || 'No user input provided.';

  return `You are a professional career strategist and resume optimization AI.
Analyze the target job description and candidate background enclosed within the designated XML tags below.
Tailor and enhance the candidate's achievements, skills, and summary to align with the job requirements.

<user_jd>
${safeJd}
</user_jd>

<user_input>
${safeInput}
</user_input>

${instructions ? `Additional Guidelines:\n${instructions.trim()}\n` : ''}
CRITICAL REQUIREMENTS:
1. Return ONLY a valid JSON object matching the schema below.
2. Do NOT wrap output in markdown code fences (e.g. do not write \`\`\`json).
3. Do NOT include introductory text, conversational remarks, or concluding notes.

Expected JSON Schema:
{
  "tailoredSummary": "A concise, impactful professional summary matching the JD requirements (3-4 sentences)",
  "matchedSkills": ["Skill 1", "Skill 2", "Skill 3"],
  "missingKeywords": ["Keyword 1", "Keyword 2"],
  "highlightedExperiences": [
    {
      "role": "Job Title",
      "company": "Company Name",
      "bulletPoints": [
        "Strong action verb + specific task + quantifiable business outcome aligned to JD"
      ]
    }
  ],
  "recommendations": [
    "Specific actionable recommendation to improve ATS and hiring manager score"
  ],
  "matchScore": 85
}`;
}

/**
 * Checks connection to the local Ollama instance and retrieves installed models.
 * Resilient multi-endpoint health check:
 * 1. Checks /api/tags (retrieves available models & confirms 200 OK)
 * 2. Falls back to /api/version if /api/tags is unavailable or slow
 * 3. Falls back to root / if API endpoints are restricted
 *
 * Any 200 OK status from Ollama marks success: true ("Online").
 * Parsing errors are gracefully tolerated and never cause false-positive offline states.
 *
 * @param {string} [baseUrl=OLLAMA_BASE_URL] - Base URL of the Ollama server
 * @param {number} [timeoutMs=8000] - Timeout in milliseconds per probe (default: 8000ms)
 * @returns {Promise<{success: boolean, models: Array<Object>, version?: string, endpoint?: string, message?: string, error?: string}>}
 */
export async function checkOllamaConnection(baseUrl = OLLAMA_BASE_URL, timeoutMs = 8000) {
  const cleanBaseUrl = (baseUrl || OLLAMA_BASE_URL).replace(/\/+$/, '');

  const probeEndpoint = async (endpoint) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${cleanBaseUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
        },
        signal: controller.signal,
      });

      if (response.ok || response.status === 200) {
        let json = null;
        try {
          json = await response.json();
        } catch {
          // If body is plain text (e.g. "Ollama is running"), 200 OK is still valid
        }
        return { ok: true, status: response.status, data: json };
      }
      return { ok: false, status: response.status };
    } catch (err) {
      return { ok: false, error: err };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // 1. Primary probe: /api/tags (fetches models list + verifies 200 OK)
  const tagsResult = await probeEndpoint('/api/tags');
  if (tagsResult.ok) {
    const rawModels = tagsResult.data?.models;
    const models = Array.isArray(rawModels) ? rawModels : [];
    return {
      success: true,
      models,
      endpoint: '/api/tags',
      message: `Successfully connected to Ollama (${models.length} model${models.length === 1 ? '' : 's'} available)`,
    };
  }

  // 2. Secondary probe: /api/version (lightweight daemon health check)
  const versionResult = await probeEndpoint('/api/version');
  if (versionResult.ok) {
    const version = versionResult.data?.version || 'active';
    return {
      success: true,
      models: [],
      version,
      endpoint: '/api/version',
      message: `Successfully connected to Ollama (v${version})`,
    };
  }

  // 3. Tertiary probe: root / ("Ollama is running")
  const rootResult = await probeEndpoint('/');
  if (rootResult.ok) {
    return {
      success: true,
      models: [],
      endpoint: '/',
      message: 'Successfully connected to Ollama service',
    };
  }

  // Determine error diagnostic from probe failures
  const lastError = tagsResult.error || versionResult.error || rootResult.error;
  let errorMessage = lastError?.message || 'Failed to connect to Ollama.';

  if (lastError?.name === 'AbortError') {
    errorMessage = `Connection timed out after ${timeoutMs / 1000}s. Is Ollama running on ${cleanBaseUrl}?`;
  } else if (
    errorMessage.includes('Failed to fetch') ||
    errorMessage.includes('NetworkError') ||
    errorMessage.includes('ECONNREFUSED')
  ) {
    errorMessage = `Cannot reach Ollama at ${cleanBaseUrl}. Ensure Ollama is running ('ollama serve'). If in a browser, ensure CORS is enabled (e.g., set OLLAMA_ORIGINS="*" before starting Ollama).`;
  }

  return {
    success: false,
    models: [],
    error: errorMessage,
  };
}

/**
 * Safely extracts generated text from diverse Ollama output shapes:
 * - /api/generate: { response: "..." }
 * - /api/chat: { message: { content: "..." } }
 * - Axios/Client wrappers: { data: { response: "..." } } or { data: { message: { content: "..." } } }
 * - OpenAI compatible proxies: { choices: [{ message: { content: "..." } }] } or { choices: [{ text: "..." }] }
 * - Direct strings or generic text fields: { content: "..." } or { text: "..." }
 *
 * @param {any} result - Raw response object or string from Ollama
 * @returns {string|null} Extracted text string or null if not extractable
 */
export function extractOllamaResponseText(result) {
  if (!result) return null;
  if (typeof result === 'string') return result;

  // 1. Direct /api/generate format: result.response
  if (typeof result.response === 'string') {
    return result.response;
  }

  // 2. Direct /api/chat format: result.message.content
  if (result.message && typeof result.message.content === 'string') {
    return result.message.content;
  }

  // 3. Wrapped / data payload format (e.g. Axios, response.data.response or response.data.message.content)
  if (result.data) {
    if (typeof result.data.response === 'string') {
      return result.data.response;
    }
    if (result.data.message && typeof result.data.message.content === 'string') {
      return result.data.message.content;
    }
    if (typeof result.data === 'string') {
      return result.data;
    }
  }

  // 4. OpenAI / proxy format (choices[0].message.content or choices[0].text)
  if (Array.isArray(result.choices) && result.choices.length > 0) {
    const firstChoice = result.choices[0];
    if (firstChoice) {
      if (typeof firstChoice.text === 'string') return firstChoice.text;
      if (firstChoice.message && typeof firstChoice.message.content === 'string') {
        return firstChoice.message.content;
      }
    }
  }

  // 5. Generic fallback text attributes
  if (typeof result.content === 'string') return result.content;
  if (typeof result.text === 'string') return result.text;

  return null;
}

/**
 * Safely parses JSON string, attempting fallback extraction if surrounded by extra text.
 *
 * @param {string|Object} rawText - String that should contain JSON (or pre-parsed Object)
 * @returns {Object} Parsed JSON object
 */
export function safeParseJson(rawText) {
  if (rawText && typeof rawText === 'object') {
    return rawText;
  }

  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Response is empty or not a string');
  }

  const cleanText = rawText.trim();

  // Try direct parse
  try {
    return JSON.parse(cleanText);
  } catch {
    // If wrapped in markdown code fences, strip them
    const fenceCleaned = cleanText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    try {
      return JSON.parse(fenceCleaned);
    } catch {
      // Find the first outer '{' and matching '}'
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          const potentialJson = cleanText.slice(firstBrace, lastBrace + 1);
          return JSON.parse(potentialJson);
        } catch {
          // If outer brace slice fails, check bracket slice
        }
      }

      // Check for array format [...]
      const firstBracket = cleanText.indexOf('[');
      const lastBracket = cleanText.lastIndexOf(']');

      if (firstBracket !== -1 && lastBracket > firstBracket) {
        const potentialArray = cleanText.slice(firstBracket, lastBracket + 1);
        return JSON.parse(potentialArray);
      }

      throw new Error('Could not parse valid JSON object from model response');
    }
  }
}

export const DEFAULT_OLLAMA_OPTIONS = {
  temperature: 0.3,
  num_predict: 1024,
};

/**
 * Sends a generation request to Ollama using JSON format and XML prompt delimiters.
 * Wraps execution inside comprehensive try/catch error boundaries.
 *
 * @param {Object} params
 * @param {string} [params.baseUrl=OLLAMA_BASE_URL] - Base URL of Ollama
 * @param {string} [params.model=DEFAULT_MODEL] - Target model name (e.g. 'mistral', 'llama3')
 * @param {string} [params.userJd=''] - Job description wrapped in <user_jd>
 * @param {string} [params.userInput=''] - Candidate details wrapped in <user_input>
 * @param {string} [params.systemPrompt] - Optional system prompt
 * @param {string} [params.customPrompt] - Optional full prompt override (will still be sent with format: 'json')
 * @param {Object} [params.options] - Ollama generation options (temperature, num_predict, etc.)
 * @param {number} [params.timeoutMs=300000] - Timeout in milliseconds (default: 300000ms / 5 minutes for CPU inference)
 * @returns {Promise<{success: boolean, data?: Object, raw?: string, model?: string, durationMs?: number, error?: string}>}
 */
export async function generateResumeContent({
  baseUrl = OLLAMA_BASE_URL,
  model = DEFAULT_MODEL,
  userJd = '',
  userInput = '',
  instructions = '',
  systemPrompt = 'You are an expert AI resume builder. You always respond in valid JSON matching the requested schema.',
  customPrompt = null,
  options = DEFAULT_OLLAMA_OPTIONS,
  timeoutMs = 300000,
} = {}) {
  try {
    const prompt = customPrompt || buildXmlPrompt({ userJd, userInput, instructions });

    const finalOptions = {
      temperature: 0.3,
      num_predict: 1024,
      ...options,
    };
    if (!finalOptions.num_predict || finalOptions.num_predict < 512) {
      finalOptions.num_predict = 1024;
    }

    const requestBody = {
      model,
      prompt,
      system: systemPrompt,
      stream: false,
      format: 'json',
      options: finalOptions,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Ollama API error (${response.status} ${response.statusText}): ${errorText || 'Unknown error'}`);
      }

      const result = await response.json();

      const rawText = extractOllamaResponseText(result);

      if (!rawText) {
        throw new Error('Ollama returned an unexpected response structure (missing "response" or "message.content" text field).');
      }

      // Parse the JSON payload produced by Ollama
      const parsedData = safeParseJson(rawText);

      return {
        success: true,
        data: parsedData,
        raw: rawText,
        model: result.model || model,
        durationMs: result.total_duration ? Math.round(result.total_duration / 1000000) : null,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    let errorMessage = error.message;

    if (error.name === 'AbortError') {
      errorMessage = `Request timed out after ${timeoutMs / 1000}s. Local LLM generation took longer than the timeout limit.`;
    } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      errorMessage = `Network error contacting Ollama at ${baseUrl}. Ensure Ollama is running ('ollama serve') and accessible with CORS enabled (OLLAMA_ORIGINS="*").`;
    }

    return {
      success: false,
      error: errorMessage,
      details: error,
    };
  }
}

export default {
  OLLAMA_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_OLLAMA_OPTIONS,
  buildXmlPrompt,
  checkOllamaConnection,
  extractOllamaResponseText,
  safeParseJson,
  generateResumeContent,
};
