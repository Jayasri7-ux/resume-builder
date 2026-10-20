/**
 * Ollama AI Service
 * Configured for local LLM integration at http://localhost:11434
 * Enforces JSON output format, XML prompt delimiters (<user_jd> / <user_input>),
 * and robust try/catch error boundaries.
 */

export const OLLAMA_BASE_URL = 'http://localhost:11434';
export const DEFAULT_MODEL = 'mistral';

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
 *
 * @param {string} [baseUrl=OLLAMA_BASE_URL] - Base URL of the Ollama server
 * @param {number} [timeoutMs=6000] - Timeout in milliseconds
 * @returns {Promise<{success: boolean, models: Array<Object>, message?: string, error?: string}>}
 */
export async function checkOllamaConnection(baseUrl = OLLAMA_BASE_URL, timeoutMs = 6000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Ollama server returned status: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models : [];

    return {
      success: true,
      models,
      message: `Successfully connected to Ollama (${models.length} model${models.length === 1 ? '' : 's'} available)`,
    };
  } catch (error) {
    let errorMessage = error.message;

    if (error.name === 'AbortError') {
      errorMessage = `Connection timed out after ${timeoutMs / 1000}s. Is Ollama running on ${baseUrl}?`;
    } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      errorMessage = `Cannot reach Ollama at ${baseUrl}. Ensure Ollama is running ('ollama serve'). If in a browser, ensure CORS is enabled (e.g., set OLLAMA_ORIGINS="*" before starting Ollama).`;
    }

    return {
      success: false,
      models: [],
      error: errorMessage,
    };
  }
}

/**
 * Safely parses JSON string, attempting fallback extraction if surrounded by extra text.
 *
 * @param {string} rawText - String that should contain JSON
 * @returns {Object} Parsed JSON object
 */
export function safeParseJson(rawText) {
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
        const potentialJson = cleanText.slice(firstBrace, lastBrace + 1);
        return JSON.parse(potentialJson);
      }

      throw new Error('Could not parse valid JSON object from model response');
    }
  }
}

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
  options = { temperature: 0.3 },
} = {}) {
  try {
    const prompt = customPrompt || buildXmlPrompt({ userJd, userInput, instructions });

    const requestBody = {
      model,
      prompt,
      system: systemPrompt,
      stream: false,
      format: 'json',
      options,
    };

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Ollama API error (${response.status} ${response.statusText}): ${errorText || 'Unknown error'}`);
    }

    const result = await response.json();

    if (!result || typeof result.response !== 'string') {
      throw new Error('Ollama returned an unexpected response structure (missing "response" text field).');
    }

    // Parse the JSON payload produced by Ollama
    const parsedData = safeParseJson(result.response);

    return {
      success: true,
      data: parsedData,
      raw: result.response,
      model: result.model || model,
      durationMs: result.total_duration ? Math.round(result.total_duration / 1000000) : null,
    };
  } catch (error) {
    let errorMessage = error.message;

    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
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
  buildXmlPrompt,
  checkOllamaConnection,
  safeParseJson,
  generateResumeContent,
};
