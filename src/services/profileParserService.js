/**
 * Resume Parsing Service Handler
 * Ingests raw resume text, wraps it inside <user_input> XML tags,
 * calls local Ollama (http://localhost:11434) with format: "json",
 * and maps the output into the structured Master Profile schema.
 */

import { OLLAMA_BASE_URL, DEFAULT_MODEL, safeParseJson, extractOllamaResponseText } from './ollamaService.js';
import { normalizeMasterProfile, validateMasterProfile } from '../types/masterProfileSchema.js';

/**
 * Builds the XML-delimited prompt for parsing raw resume text into Master Profile JSON.
 *
 * @param {string} rawResumeText - Raw resume text from upload or paste
 * @returns {string} Formatted prompt
 */
export function buildProfileParsingPrompt(rawResumeText) {
  const safeInput = (rawResumeText || '').trim();

  return `You are a high-precision resume intelligence extraction AI.
Analyze the candidate's raw resume enclosed in the <user_input> XML tags below.
Extract and structure all details into the required JSON schema.

<user_input>
${safeInput}
</user_input>

CRITICAL INSTRUCTIONS:
1. Return ONLY a valid JSON object matching the exact schema below.
2. Do NOT wrap output in markdown code fences (e.g. no \`\`\`json).
3. Do NOT invent fake companies or false credentials.
4. From the candidate's history and skills, intelligently infer:
   - "eligibleJobRoles.targetFamilies": 2-4 broader engineering/professional domains (e.g. "Full-Stack Engineering", "Frontend Architecture", "DevOps & Cloud Systems").
   - "eligibleJobRoles.primaryRoles": 2-4 primary job titles the candidate is directly qualified for.
   - "eligibleJobRoles.crossoverRoles": 2-4 realistic adjacent/pivot crossover roles supported by their background (e.g. Solutions Architect, Technical Product Manager, Engineering Manager).
   - "eligibleJobRoles.domainStrengths": Notable industry or platform domains (e.g. "FinTech", "SaaS", "E-commerce").
5. Categorize technical skills into: languages, frontend, backend, cloudAndDevOps, and aiAndTooling.

Required JSON Structure:
{
  "personalInfo": {
    "fullName": "Candidate Full Name",
    "headline": "Current or Target Professional Headline",
    "email": "Email address or empty string",
    "phone": "Phone number or empty string",
    "location": "City, State or Location",
    "linkedin": "LinkedIn URL or handle",
    "github": "GitHub URL or handle",
    "portfolio": "Personal website or portfolio URL"
  },
  "professionalSummary": "A comprehensive 3-5 sentence professional summary highlighting key strengths and quantifiable metrics",
  "eligibleJobRoles": {
    "targetFamilies": ["Engineering Family 1", "Family 2"],
    "primaryRoles": ["Primary Title 1", "Primary Title 2"],
    "crossoverRoles": ["Crossover Role 1", "Crossover Role 2"],
    "domainStrengths": ["Domain 1", "Domain 2"]
  },
  "coreTechnicalSkills": {
    "languages": ["Skill 1", "Skill 2"],
    "frontend": ["React", "CSS", "..."],
    "backend": ["Node.js", "SQL", "..."],
    "cloudAndDevOps": ["Docker", "AWS", "..."],
    "aiAndTooling": ["Git", "Jest", "..."]
  },
  "workExperience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "location": "City, State or Remote",
      "startDate": "YYYY-MM or YYYY",
      "endDate": "YYYY-MM or Present",
      "current": false,
      "bulletPoints": [
        "Action verb + achievement + measurable outcome"
      ]
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "role": "Role / Creator",
      "techStack": ["Tech 1", "Tech 2"],
      "description": "Short project overview",
      "highlights": ["Key achievement or metric"],
      "liveUrl": "",
      "repoUrl": ""
    }
  ],
  "education": [
    {
      "institution": "University / College",
      "degree": "Degree (e.g. B.S.)",
      "fieldOfStudy": "Field of Study (e.g. Computer Science)",
      "graduationYear": "YYYY",
      "honors": "Honors, GPA, or Dean's list if mentioned"
    }
  ],
  "certifications": [
    {
      "name": "Certification Name",
      "issuer": "Issuing Body",
      "issueDate": "YYYY",
      "credentialUrl": ""
    }
  ]
}`;
}

/**
 * Extracts plain text from an uploaded file (supports .txt, .md, .json, .csv, etc.).
 *
 * @param {File} file - Browser File object
 * @returns {Promise<string>} File text contents
 */
export async function extractTextFromFile(file) {
  if (!file) {
    throw new Error('No file provided for text extraction');
  }

  // Check file size (e.g. limit to 5MB)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('File exceeds maximum supported size (5MB). Please upload a smaller file.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        resolve(text.trim());
      } else {
        reject(new Error('Failed to read file as text'));
      }
    };

    reader.onerror = () => {
      reject(new Error(`Error reading file "${file.name}": ${reader.error?.message || 'Unknown read error'}`));
    };

    reader.readAsText(file);
  });
}

/**
 * Sends raw resume text to Ollama to be parsed into a Master Profile JSON object.
 *
 * @param {Object} params
 * @param {string} params.rawResumeText - The resume text to be parsed
 * @param {string} [params.model=DEFAULT_MODEL] - Ollama model (e.g. 'llama3.2:latest', 'mistral')
 * @param {string} [params.baseUrl=OLLAMA_BASE_URL] - Ollama server endpoint
 * @param {Object} [params.options] - Ollama generation options
 * @param {number} [params.timeoutMs=300000] - 300s (5-minute) timeout budget for local CPU LLM inference
 * @returns {Promise<{success: boolean, profile?: Object, raw?: string, error?: string}>}
 */
export async function parseResumeWithOllama({
  rawResumeText,
  model = DEFAULT_MODEL,
  baseUrl = OLLAMA_BASE_URL,
  options = { temperature: 0.1, num_predict: 2048 },
  timeoutMs = 300000,
}) {
  if (!rawResumeText || !rawResumeText.trim()) {
    return { success: false, error: 'Resume text is empty. Please provide resume content to parse.' };
  }

  try {
    // Check if the input is directly a pre-exported JSON master profile
    const trimmed = rawResumeText.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const directJson = JSON.parse(trimmed);
        if (directJson.personalInfo || directJson.eligibleJobRoles || directJson.workExperience) {
          const directNormalized = normalizeMasterProfile({
            ...directJson,
            metadata: {
              source: 'json_import',
              lastUpdated: new Date().toISOString(),
            },
          });
          const validation = validateMasterProfile(directNormalized);
          if (validation.valid) {
            return {
              success: true,
              profile: directNormalized,
              raw: trimmed,
              isDirectJson: true,
            };
          }
        }
      } catch {
        // Not a pure direct JSON, proceed with LLM parsing
      }
    }

    const prompt = buildProfileParsingPrompt(trimmed);

    const finalOptions = {
      temperature: 0.1,
      num_predict: 2048,
      ...options,
    };
    if (!finalOptions.num_predict || finalOptions.num_predict < 512) {
      finalOptions.num_predict = 2048;
    }

    const requestBody = {
      model,
      prompt,
      system:
        'You are an expert resume parsing engine. Always extract all profile sections into valid JSON matching the schema.',
      format: 'json',
      stream: false,
      options: finalOptions,
    };

    const cleanBaseUrl = (baseUrl || OLLAMA_BASE_URL).replace(/\/+$/, '');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${cleanBaseUrl}/api/generate`, {
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
        throw new Error(`Ollama API error (${response.status} ${response.statusText}): ${errorText || 'Failed to call Ollama'}`);
      }

      const result = await response.json();
      const rawText = extractOllamaResponseText(result);

      if (!rawText) {
        throw new Error('Ollama returned invalid response format (missing response string).');
      }

      // Safely parse JSON from model output
      const rawParsed = safeParseJson(rawText);

      // Normalize through schema helper to guarantee all arrays and fields exist
      const normalizedProfile = normalizeMasterProfile({
        ...rawParsed,
        metadata: {
          source: `ollama_${model}`,
          lastUpdated: new Date().toISOString(),
          modelUsed: model,
        },
      });

      return {
        success: true,
        profile: normalizedProfile,
        raw: rawText,
        durationMs: result.total_duration ? Math.round(result.total_duration / 1000000) : null,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    let message = error.message;
    if (error.name === 'AbortError') {
      message = `Resume parsing timed out after ${timeoutMs / 1000}s on ${baseUrl}. Local LLMs may require more time on initial startup or complex resumes; ensure your Ollama instance is responsive or try a lighter model.`;
    } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      message = `Cannot reach Ollama at ${baseUrl}. Ensure Ollama is running ('ollama serve') and CORS allows browser requests ($env:OLLAMA_ORIGINS="*").`;
    }

    return {
      success: false,
      error: message,
    };
  }
}

export default {
  buildProfileParsingPrompt,
  extractTextFromFile,
  parseResumeWithOllama,
};
