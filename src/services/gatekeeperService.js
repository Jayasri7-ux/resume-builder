/**
 * The Gatekeeper AI Engine & Deterministic Baseline Scoring Service
 *
 * Enforces:
 * 1. Clean JD Input & Sanitization (HTML strip, UTF-8 normalization, > 50 words validation, XML wrapping).
 * 2. Gatekeeper AI Guardrail (Industry validation, strict <= 1 year experience limit, crossover role match).
 * 3. Deterministic Baseline Scoring Engine (30% Tech, 40% Role/Domain, 20% Experience, 10% Education -> bounded [40, 85]).
 * 4. Unified Integration Workflow function.
 */

import { OLLAMA_BASE_URL, DEFAULT_MODEL, safeParseJson } from './ollamaService.js';
import { extractTechnicalRequirements, analyzeMissingTech } from './techExtractionService.js';

// ======================================================================
// 1. Clean JD Input, Sanitization & Strict Gibberish Interception
// ======================================================================

/**
 * Rigorous Sanity & Gibberish Validator
 * Intercepts keyboard smashing, random high-entropy strings, repeating syllables,
 * and text lacking coherent professional job description structure.
 *
 * @param {string} text - Cleaned text to evaluate
 * @returns {{ isValid: boolean, reason?: string }}
 */
export function validateJdSanity(text) {
  if (!text || typeof text !== 'string') {
    return {
      isValid: false,
      reason: 'Invalid or meaningless Job Description detected. Please enter a valid professional job description.',
    };
  }

  const rawWords = text.trim().split(/\s+/).filter(Boolean);
  const cleanTokens = rawWords
    .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 0);

  if (cleanTokens.length === 0) {
    return {
      isValid: false,
      reason: 'Invalid or meaningless Job Description detected. Please enter a valid professional job description.',
    };
  }

  // 1. Repetitive nonsense syllables / low unique ratio
  // E.g. repeating "ask oed kefweo wkejds" multiple times
  const uniqueWords = new Set(cleanTokens);
  const uniqueRatio = uniqueWords.size / cleanTokens.length;
  if (cleanTokens.length >= 16 && uniqueRatio < 0.28) {
    return {
      isValid: false,
      reason: 'Invalid or meaningless Job Description detected. Please enter a valid professional job description.',
    };
  }

  // 2. Scan for Gibberish Tokens (keyboard smashing / high-entropy words)
  const techAcronyms = new Set([
    'html', 'grpc', 'http', 'json', 'yaml', 'sync', 'npm', 'wsdl', 'smtp', 'rest', 'api',
    'sql', 'nosql', 'css', 'sdk', 'cli', 'jwt', 'ci', 'cd', 'ui', 'ux', 'dom', 'tcp', 'udp'
  ]);
  let gibberishWordCount = 0;

  for (const token of cleanTokens) {
    if (techAcronyms.has(token)) continue;

    const isLongVowelless = token.length >= 4 && !/[aeiouy]/i.test(token);
    const hasConsonantCluster = /[bcdfghjklmnpqrstvwxyz]{5,}/i.test(token);
    const hasCharRepeat = /([a-z])\1{3,}/i.test(token);
    const hasKeyboardMash = /(asdf|dfgh|hjkl|qwer|wery|zxcv|xcvb)/i.test(token);

    if (isLongVowelless || hasConsonantCluster || hasCharRepeat || hasKeyboardMash) {
      gibberishWordCount++;
    }
  }

  if (gibberishWordCount / cleanTokens.length > 0.12 || gibberishWordCount >= 3) {
    return {
      isValid: false,
      reason: 'Invalid or meaningless Job Description detected. Please enter a valid professional job description.',
    };
  }

  // 3. Dictionary / Professional Vocabulary Recognition Ratio
  const recognizedVocab = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you',
    'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one',
    'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when',
    'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'years', 'your', 'good',
    'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
    'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any',
    'these', 'give', 'day', 'most', 'us', 'is', 'are', 'was', 'were', 'been', 'has', 'had', 'may', 'must', 'should',
    'job', 'role', 'title', 'company', 'description', 'requirements', 'responsibilities', 'qualifications', 'experience',
    'skills', 'team', 'software', 'developer', 'engineer', 'engineering', 'candidate', 'position', 'technology',
    'technologies', 'applications', 'system', 'systems', 'data', 'design', 'develop', 'development', 'building', 'management',
    'project', 'projects', 'degree', 'education', 'bachelor', 'bachelors', 'masters', 'university', 'college', 'graduate',
    'fresher', 'intern', 'internship', 'junior', 'senior', 'associate', 'lead', 'full', 'stack', 'frontend', 'backend',
    'web', 'python', 'java', 'javascript', 'react', 'node', 'django', 'flask', 'sql', 'database', 'databases', 'cloud',
    'git', 'github', 'agile', 'communication', 'problem', 'solving', 'analytical', 'performance', 'maintenance', 'testing',
    'code', 'review', 'collaborate', 'collaboration', 'cross', 'functional', 'product', 'customer', 'business', 'client',
    'enterprise', 'industry', 'tools', 'environment', 'platform', 'platforms', 'services', 'rest', 'api', 'apis',
    'architecture', 'writing', 'clean', 'modular', 'documentation', 'learning', 'eager', 'opportunity', 'join', 'seeking',
    'looking', 'passionate', 'ambitious', 'ability', 'hands', 'knowledge', 'understanding', 'proficiency', 'proficient',
    'strong', 'foundational', 'competitive', 'hybrid', 'remote', 'office', 'location', 'bangalore', 'india', 'hours',
    'salary', 'apply', 'resume', 'hire', 'hiring', 'overview', 'summary', 'key', 'about', 'plus', 'preferred', 'minimum',
    'yrs', 'level', 'entry', 'entry-level', 'practical', 'delivery', 'collaborative', 'scalable', 'build'
  ]);

  let recognizedCount = 0;
  for (const token of cleanTokens) {
    if (recognizedVocab.has(token) || /^\d+$/.test(token)) {
      recognizedCount++;
    }
  }

  const recognizedRatio = recognizedCount / cleanTokens.length;
  if (recognizedRatio < 0.35) {
    return {
      isValid: false,
      reason: 'Invalid or meaningless Job Description detected. Please enter a valid professional job description.',
    };
  }

  // 4. Word count validation: strictly greater than 50 words
  if (rawWords.length <= 50) {
    return {
      isValid: false,
      reason: `Job description must be strictly greater than 50 words (received ${rawWords.length} words). Please provide a comprehensive job description with responsibilities and requirements.`,
    };
  }

  // 5. Structural Coherence: Must contain at least 2 Job Description anchor concepts
  const jdAnchorKeywords = [
    'job', 'role', 'title', 'responsibilities', 'requirements', 'qualifications', 'experience', 'skills',
    'developer', 'engineer', 'candidate', 'position', 'software', 'technology', 'technologies', 'team',
    'company', 'degree', 'education', 'apply', 'employment', 'duties', 'work', 'project', 'full-time',
    'internship', 'intern', 'fresher', 'junior', 'associate', 'hiring', 'bachelor', 'applications'
  ];

  let anchorCount = 0;
  for (const kw of jdAnchorKeywords) {
    if (cleanTokens.includes(kw) || text.toLowerCase().includes(kw)) {
      anchorCount++;
    }
  }

  if (anchorCount < 2) {
    return {
      isValid: false,
      reason: 'Invalid or meaningless Job Description detected. Please enter a valid professional job description.',
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Sanitizes raw job description text:
 * - Strips HTML tags
 * - Normalizes UTF-8 encoding and punctuation
 * - Normalizes whitespace
 * - Validates word count is strictly greater than 50 words
 * - Enforces zero-tolerance sanity and gibberish interception
 * - Wraps output in <user_jd> ... </user_jd> XML delimiters
 *
 * @param {string} rawText - Raw input text
 * @returns {{ cleanedText: string, wrappedXml: string, wordCount: number }}
 * @throws {Error} If text is invalid or word count is <= 50 words or fails sanity check
 */
export function sanitizeJobDescription(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Job description input cannot be empty. Please provide valid text.');
  }

  // 1. Strip HTML tags
  let cleaned = rawText.replace(/<[^>]*>/g, ' ');

  // 2. Normalize non-standard Unicode spaces and punctuation
  cleaned = cleaned
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ');

  // 3. Normalize whitespace
  cleaned = cleaned
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

  // 4. Validate word count strictly greater than 50 words
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= 50) {
    throw new Error(
      `Job description must be strictly greater than 50 words (received ${words.length} words). Please provide a comprehensive job description with responsibilities and requirements.`
    );
  }

  // 5. Strict Sanity & Gibberish Interception
  const sanityCheck = validateJdSanity(cleaned);
  if (!sanityCheck.isValid) {
    throw new Error(sanityCheck.reason);
  }

  // 6. Wrap in strict XML delimiters
  const wrappedXml = `<user_jd>\n${cleaned}\n</user_jd>`;

  return {
    cleanedText: cleaned,
    wrappedXml,
    wordCount: words.length,
  };
}

// ======================================================================
// 2. The Gatekeeper AI Engine (Industry & Experience Guardrail)
// ======================================================================

/**
 * Builds the Gatekeeper AI prompt strictly conforming to JSON format rules.
 *
 * @param {Object} params
 * @param {Object} params.masterProfile - User's ground-truth Master Profile
 * @param {string} params.wrappedXmlJd - Sanitized JD wrapped in <user_jd>
 * @returns {string} Formatted prompt string
 */
export function buildGatekeeperPrompt({ masterProfile, wrappedXmlJd }) {
  const targetFamilies = masterProfile?.eligibleJobRoles?.targetFamilies || [];
  const primaryRoles = masterProfile?.eligibleJobRoles?.primaryRoles || [];
  const crossoverRoles = masterProfile?.eligibleJobRoles?.crossoverRoles || [];
  const skills = [
    ...(masterProfile?.coreTechnicalSkills?.languages || []),
    ...(masterProfile?.coreTechnicalSkills?.frontend || []),
    ...(masterProfile?.coreTechnicalSkills?.backend || []),
    ...(masterProfile?.coreTechnicalSkills?.databases || []),
  ];

  return `You are the strict Gatekeeper AI for the Resume Fit career optimization platform.
Your objective is to evaluate whether a Job Description is valid and eligible for an entry-level candidate.

CANDIDATE BACKGROUND:
- Total Experience: 0-1 years (Entry-Level / Fresher / Recent Graduate)
- Core Engineering Domains: ${targetFamilies.join(', ')}
- Eligible Primary Roles: ${primaryRoles.join(', ')}
- Eligible Crossover Roles: ${crossoverRoles.join(', ')}
- Core Technical Skills: ${skills.join(', ')}

TARGET JOB DESCRIPTION:
${wrappedXmlJd}

STRICT GATEKEEPER EVALUATION RULES:
1. INDUSTRY VALIDATION:
   - The role MUST belong to Software Engineering, Web Development, IT, Data/Analytics, or Applied AI.
   - If the JD belongs to an unrelated industry (e.g. Mechanical, Civil, Nursing, Construction, Site Engineering, Medical, Culinary, Agriculture), INSTANTLY ABORT.
2. EXPERIENCE LIMIT & JUNIOR/FRESHER ALLOWANCE:
   - Candidate has 0-1 years experience (Entry-Level / Fresher / Recent Graduate).
   - Valid entry-level, fresher, and junior roles (such as "Junior Python Developer", "Python Developer (Fresher)", "Associate Developer", or roles requiring 0-1 years / recent graduates) MUST BE APPROVED (PROCEED).
   - If the JD mentions working with, collaborating with, or being mentored by senior engineers / tech leads, but the role itself is an entry-level or junior role, you MUST PROCEED.
   - Restrict experience blocking strictly to roles that explicitly demand mid-level, senior, or higher multi-year experience (e.g., "3+ years", "5+ years", "Mid-Level", "Senior Engineer", "Lead Developer", "Engineering Manager"). If so, INSTANTLY ABORT.
3. CROSSOVER ROLE & TECH CHECK:
   - If it meets entry-level criteria, verify if it reasonably matches the candidate's eligible job roles and technical skill sets.
   - If completely unrelated (e.g. SAP ABAP Consultant, Cobol Mainframe, Hardware FPGA), ABORT.

OUTPUT FORMAT REQUIREMENTS:
- You must return ONLY a valid JSON object matching one of the two formats below:
  If blocked:
  {"status": "ABORT", "reason": "Specific reason (e.g., Mismatched industry: Civil Engineering or Requires 3+ years experience)"}
  If approved:
  {"status": "PROCEED", "reason": "Valid entry-level matching role approved."}
- Do NOT wrap output in markdown code blocks (no \`\`\`json). Do NOT add extra conversational commentary.`;
}

/**
 * Deterministic rule-based Gatekeeper verification.
 * Scans for senior experience keywords, multi-year patterns, and unrelated industry flags.
 * Used for pre-checks and reliable offline fallback.
 *
 * @param {string} cleanedJdText - Sanitized plain text JD
 * @param {Object} masterProfile - Ground-truth Master Profile
 * @returns {{ status: 'PROCEED' | 'ABORT', reason: string }}
 */
export function evaluateGatekeeperRules(cleanedJdText, masterProfile) {
  // 0. Sanity & Gibberish Interception
  const sanity = validateJdSanity(cleanedJdText);
  if (!sanity.isValid) {
    return {
      status: 'ABORT',
      reason: sanity.reason,
    };
  }

  const text = (cleanedJdText || '').toLowerCase();

  // 1. Industry Validation: Unrelated non-IT/software industries
  const unrelatedIndustryPatterns = [
    { regex: /\b(civil engineering|civil engineer|structural engineer|site engineer|autocad surveyor|quantity surveyor)\b/i, label: 'Civil / Structural Engineering' },
    { regex: /\b(mechanical engineer|automobile engineering|hvac technician|plumbing technician|piping engineer)\b/i, label: 'Mechanical / HVAC Engineering' },
    { regex: /\b(nursing|registered nurse|physician|clinical nurse|pharmacist|dental assistant|veterinarian)\b/i, label: 'Healthcare & Nursing' },
    { regex: /\b(culinary arts|executive chef|pastry chef|food beverage server|bartender)\b/i, label: 'Culinary / Hospitality' },
    { regex: /\b(construction manager|building inspector|carpenter|electrician lineman)\b/i, label: 'Construction Trades' },
  ];

  for (const { regex, label } of unrelatedIndustryPatterns) {
    if (regex.test(text)) {
      return {
        status: 'ABORT',
        reason: `Mismatched industry: Target job belongs to ${label}, which is outside candidate's software/IT qualifications.`,
      };
    }
  }

  // 2. Experience Limit: Strictly block roles that explicitly demand mid-level, senior,
  // or higher multi-year experience, while allowing valid junior and fresher roles.

  // Extract explicit Job Title / Position line if present
  const titleLineMatch = (cleanedJdText || '').match(
    /(?:job\s+title|position\s+title|position|role\s+title|role)\s*:\s*([^\n\r]+)/i
  );
  const titleString = titleLineMatch ? titleLineMatch[1].trim() : '';
  const titleLower = titleString.toLowerCase();

  // Junior / Fresher / Entry-Level indicators
  const juniorRoleKeywords = /\b(junior|jr\.|fresher|freshers|entry[- ]level|intern|internship|trainee|associate|graduate)\b/i;
  const isTitleJunior = juniorRoleKeywords.test(titleLower);

  const isJuniorOrFresher =
    isTitleJunior ||
    /\b(?:junior\s+(?:software|full\s*stack|frontend|backend|python|java|web|data|devops|cloud|systems?|qa|application|platform|mobile)?\s*(?:engineer|developer|architect|programmer)|python\s+developer\s*\(\s*fresher\s*\)|fresher\s+(?:software|python|web)?\s*(?:developer|engineer)|entry[- ]level\s+(?:software|developer|engineer))\b/i.test(
      text.slice(0, 350)
    ) ||
    /\b(0\s*(?:-|to)\s*1\s*(?:years?|yrs?)|freshers?\s+(?:can\s+)?apply|for\s+freshers?|recent\s+graduates?)\b/i.test(
      text
    );

  // (a) Senior Title & Role Check
  // Explicit senior roles: Senior, Sr., Tech Lead, Team Lead, Principal, Staff, Architect, Engineering Manager, Director
  const seniorRoleTitleRegex =
    /\b(senior|sr\.|tech\s+lead|team\s+lead|lead\s+developer|lead\s+engineer|lead\s+architect|principal|staff\s+engineer|staff\s+developer|director\s+of\s+engineering|head\s+of\s+engineering|engineering\s+manager|solution\s+architect|solutions\s+architect|enterprise\s+architect|vp\s+of\s+engineering)\b/i;

  if (seniorRoleTitleRegex.test(titleLower) && !isTitleJunior) {
    const match = titleString.match(seniorRoleTitleRegex);
    return {
      status: 'ABORT',
      reason: `Experience limit exceeded: Role requires senior-level seniority (detected: "${match[0]}"). Candidate is entry-level (0-1 year).`,
    };
  }

  // If role is NOT explicitly junior/fresher, check for explicit senior job openings in the text
  if (!isJuniorOrFresher) {
    const explicitSeniorRolePattern =
      /\b(?:hiring|seeking|looking\s+for|opening\s+for|position\s+of|role\s+of)?\s*(?:an?|our)?\s*\b(senior\s+(?:software|full\s*stack|frontend|backend|python|java|web|data|devops|cloud|systems?|qa|application|platform|mobile)?\s*(?:engineer|developer|architect|programmer)|sr\.\s+(?:software|full\s*stack|frontend|backend|python|java|web|data|devops|cloud|systems?|qa|application|platform|mobile)?\s*(?:engineer|developer|architect|programmer)|tech\s+lead|team\s+lead|lead\s+(?:software|full\s*stack|frontend|backend|python|java|web|data|devops|cloud|systems?|qa|application|platform|mobile)?\s*(?:engineer|developer|architect|programmer)|principal\s+(?:engineer|developer|architect)|staff\s+(?:engineer|developer)|head\s+of\s+engineering|engineering\s+manager|solution\s+architect|solutions\s+architect|enterprise\s+architect)\b/i;

    const seniorRoleMatch = text.match(explicitSeniorRolePattern);
    if (seniorRoleMatch) {
      // Ensure this senior reference is not a collaboration or mentorship sentence
      const matchedIndex = seniorRoleMatch.index || 0;
      const precedingText = text.slice(Math.max(0, matchedIndex - 60), matchedIndex);
      const isMentorshipContext =
        /\b(collaborat(?:e|ing)\s+with|work(?:ing)?\s+(?:with|alongside)|mentor(?:ed)?\s+by|guidance\s+(?:of|from)|supervis(?:ed)?\s+by|supervision\s+of|report(?:ing)?\s+to|learn(?:ing)?\s+from|support(?:ing)?|shadow(?:ing)?|partner(?:ing)?\s+with|assist(?:ing)?|under\s+(?:the\s+)?(?:guidance\s+of\s+)?(?:our\s+)?)\b/i.test(
          precedingText
        );

      if (!isMentorshipContext) {
        return {
          status: 'ABORT',
          reason: `Experience limit exceeded: Role requires senior-level seniority (detected: "${seniorRoleMatch[1]}"). Candidate is entry-level (0-1 year).`,
        };
      }
    }
  }

  // (b) Mid-Level Explicit Check
  // Only blocks if role explicitly specifies mid-level and is not a junior / fresher posting
  const isMidLevel =
    /\bmid[- ]level\b/i.test(titleLower) || (/\bmid[- ]level\b/i.test(text) && !isJuniorOrFresher);
  if (isMidLevel) {
    const match = text.match(/\bmid[- ]level\b/i);
    return {
      status: 'ABORT',
      reason: `Experience limit exceeded: Role requires more than 1 year of experience (detected: "${match[0]}"). Only entry-level (0-1 year) roles are allowed.`,
    };
  }

  // (c) Higher Multi-Year Experience Requirements (e.g. 3+ years, 5+ years, 2-4 years, minimum of 3 years)
  // Preserves allowance for 0-1 year, 0-2 years, 1-2 years, and junior/fresher postings.
  const multiYearPatterns = [
    // 3+ years, 4+ years, 5+ years, etc.
    /\b([3-9]|\d{2,})\s*\+\s*(?:years?|yrs?)\b/i,
    // Minimum of 3 years, at least 4 years, min 3 years, etc.
    /\b(?:minimum|at\s+least|min\.?)\s+(?:of\s+)?([3-9]|\d{2,})\s*(?:years?|yrs?)\b/i,
    // Multi-year ranges starting at 3+ (e.g. 3-5 years, 4-6 years)
    /\b([3-9]|\d{2,})\s*(?:\+|to|-)\s*(?:[3-9]|\d{2,})\s*(?:years?|yrs?)(?:\s+of)?(?:\s+experience)?\b/i,
    // Mid-level spans reaching 4+ years (e.g. 2-4 years, 2 to 5 years)
    /\b2\s*(?:to|-)\s*([4-9]|\d{2,})\s*(?:years?|yrs?)(?:\s+of)?(?:\s+experience)?\b/i,
    // 3+ years of experience / 5 years experience
    /\b([3-9]|\d{2,})\s*(?:years?|yrs?)(?:\s+of)?\s+experience\b/i,
  ];

  for (const pattern of multiYearPatterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        status: 'ABORT',
        reason: `Experience limit exceeded: Role requires more than 1 year of experience (detected: "${match[0]}"). Only entry-level (0-1 year) roles are allowed.`,
      };
    }
  }

  // 3. Crossover Role & Technical Domain Check
  const eligibleRoles = [
    ...(masterProfile?.eligibleJobRoles?.primaryRoles || []),
    ...(masterProfile?.eligibleJobRoles?.crossoverRoles || []),
    'software engineer', 'developer', 'programmer', 'web developer', 'full stack', 'frontend', 'backend', 'python', 'data analyst', 'nlp'
  ].map((r) => r.toLowerCase());

  const hasRoleMatch = eligibleRoles.some((role) => text.includes(role));
  const candidateSkills = [
    ...(masterProfile?.coreTechnicalSkills?.languages || []),
    ...(masterProfile?.coreTechnicalSkills?.frontend || []),
    ...(masterProfile?.coreTechnicalSkills?.backend || []),
    ...(masterProfile?.coreTechnicalSkills?.databases || []),
  ].map((s) => s.toLowerCase());

  const hasTechMatch = candidateSkills.some((skill) => text.includes(skill));

  if (!hasRoleMatch && !hasTechMatch) {
    return {
      status: 'ABORT',
      reason: 'Role mismatch: Job description does not align with candidate eligible job roles or technical proficiencies.',
    };
  }

  return {
    status: 'PROCEED',
    reason: 'Valid entry-level matching role approved.',
  };
}

/**
 * Runs the Gatekeeper AI engine using local Ollama (format: 'json') with deterministic fallback.
 *
 * @param {Object} params
 * @param {string} params.wrappedXmlJd - Sanitized JD wrapped in <user_jd>
 * @param {string} params.cleanedJdText - Sanitized plain text JD
 * @param {Object} params.masterProfile - Candidate Master Profile
 * @param {string} [params.model=DEFAULT_MODEL] - Ollama model name
 * @param {string} [params.baseUrl=OLLAMA_BASE_URL] - Ollama base URL
 * @returns {Promise<{ status: 'PROCEED' | 'ABORT', reason: string, engine: string }>}
 */
export async function evaluateGatekeeper({
  wrappedXmlJd,
  cleanedJdText,
  masterProfile,
  model = DEFAULT_MODEL,
  baseUrl = OLLAMA_BASE_URL,
}) {
  // First evaluate deterministic rules for instant high-precision guardrail
  const ruleResult = evaluateGatekeeperRules(cleanedJdText, masterProfile);

  // If deterministic rules already flagged a hard abort (e.g. Civil Engineer or 5+ years experience), enforce it immediately
  if (ruleResult.status === 'ABORT') {
    return {
      status: 'ABORT',
      reason: ruleResult.reason,
      engine: 'Deterministic Gatekeeper Rules',
    };
  }

  // Attempt Ollama AI evaluation if connection is alive
  try {
    const prompt = buildGatekeeperPrompt({ masterProfile, wrappedXmlJd });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.1 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const result = await response.json();
      if (result && typeof result.response === 'string') {
        const parsed = safeParseJson(result.response);
        if (parsed && (parsed.status === 'ABORT' || parsed.status === 'PROCEED')) {
          return {
            status: parsed.status,
            reason: parsed.reason || (parsed.status === 'PROCEED' ? 'Valid entry-level matching role approved.' : 'Role blocked by Gatekeeper AI.'),
            engine: `Ollama AI (${model})`,
          };
        }
      }
    }
  } catch {
    // If Ollama is offline or timed out, rule-based result is used
  }

  // Default to verified rule result
  return {
    status: ruleResult.status,
    reason: ruleResult.reason,
    engine: 'Deterministic Gatekeeper Rules (Ollama Standby)',
  };
}

// ======================================================================
// 3. Deterministic Baseline Scoring Engine
// ======================================================================

/**
 * Calculates a deterministic mathematical "Before" Match Score:
 * - Tech Stack Match (30% weight)
 * - Domain / Role Match (40% weight)
 * - Experience Fit (20% weight - full points awarded as <= 1 year gatekeeper passed)
 * - Education / Qualification (10% weight)
 *
 * Bounded realistically between 40 and 85.
 *
 * @param {Object} params
 * @param {string} params.cleanedJdText - Sanitized plain text JD
 * @param {Object} params.masterProfile - Candidate Master Profile
 * @param {Object} [params.techXRayData] - Optional pre-computed Tech X-Ray analysis data
 * @returns {Object} Comprehensive score report with granular breakdown
 */
export function calculateBaselineScore({ cleanedJdText, masterProfile, techXRayData }) {
  const text = (cleanedJdText || '').toLowerCase();

  // 1. Tech Stack Match (30%)
  // Proportional Tech Scoring: scales directly with Profile Tech Fit percentage
  // (e.g., matching percentage multiplied by the 30-point weight), preventing a disconnect
  // between a "100% Technical Match" badge and a low numerical points breakdown.
  let techFitPercentage = null;
  let matchedTechNames = [];

  if (techXRayData && typeof techXRayData.coveragePercentage === 'number') {
    techFitPercentage = techXRayData.coveragePercentage;
    if (Array.isArray(techXRayData.matchedTech)) {
      matchedTechNames = techXRayData.matchedTech.map((t) => (typeof t === 'string' ? t : t.name));
    }
  } else {
    try {
      const extractedTech = extractTechnicalRequirements(cleanedJdText);
      const analysis = analyzeMissingTech({ extractedTech, masterProfile });
      const totalItems = (analysis.matchedTech || []).length + (analysis.missingTech || []).length;
      if (totalItems > 0) {
        techFitPercentage = analysis.coveragePercentage;
        matchedTechNames = analysis.matchedTech.map((t) => t.name);
      }
    } catch {
      // Fallback to text matching if extraction encounters an edge case
    }
  }

  const candidateSkills = [
    ...(masterProfile?.coreTechnicalSkills?.languages || []),
    ...(masterProfile?.coreTechnicalSkills?.frontend || []),
    ...(masterProfile?.coreTechnicalSkills?.backend || []),
    ...(masterProfile?.coreTechnicalSkills?.databases || []),
    ...(masterProfile?.coreTechnicalSkills?.cloudAndDevOps || []),
    ...(masterProfile?.coreTechnicalSkills?.aiAndTooling || []),
  ];

  const matchedFromProfile = candidateSkills.filter((skill) => {
    const sLower = skill.toLowerCase();
    // Use word-boundary regex for short tech tokens like 'c', 'sql', 'git'
    if (sLower.length <= 3) {
      return new RegExp(`\\b${sLower}\\b`, 'i').test(text);
    }
    return text.includes(sLower);
  });

  const allMatchedKeywords = Array.from(new Set([...matchedTechNames, ...matchedFromProfile]));

  let techStackScore;
  if (techFitPercentage !== null) {
    // Proportional scaling: (matching percentage / 100) * 30 points
    const fitRatio = Math.max(0, Math.min(100, techFitPercentage)) / 100;
    techStackScore = Math.round(fitRatio * 30);
    // Safety check: if candidate has direct profile skills matched in the text, preserve a sensible minimum
    if (matchedFromProfile.length > 0 && techStackScore === 0) {
      techStackScore = Math.round(Math.min(1, matchedFromProfile.length / 4) * 30);
    }
  } else {
    // Fallback if no specific JD tech was detected by dictionary
    const fallbackRatio = matchedFromProfile.length > 0 ? Math.min(1, matchedFromProfile.length / 4) : 0.5;
    techStackScore = Math.round(fallbackRatio * 30);
  }

  // 2. Domain / Role Match (40%)
  const primaryRoles = (masterProfile?.eligibleJobRoles?.primaryRoles || []).map((r) => r.toLowerCase());
  const crossoverRoles = (masterProfile?.eligibleJobRoles?.crossoverRoles || []).map((r) => r.toLowerCase());
  const targetFamilies = (masterProfile?.eligibleJobRoles?.targetFamilies || []).map((f) => f.toLowerCase());

  let domainRoleScore = 15; // baseline software development
  const matchedRoles = [];

  // Check exact primary roles (40 pts)
  for (const role of primaryRoles) {
    if (text.includes(role)) {
      domainRoleScore = 40;
      matchedRoles.push(role);
      break;
    }
  }

  // Check crossover roles or families if no primary match yet (30 pts)
  if (domainRoleScore < 40) {
    for (const role of crossoverRoles) {
      if (text.includes(role)) {
        domainRoleScore = 32;
        matchedRoles.push(role);
        break;
      }
    }
  }

  if (domainRoleScore < 32) {
    for (const family of targetFamilies) {
      if (text.includes(family) || text.includes(family.split(' ')[0])) {
        domainRoleScore = 25;
        matchedRoles.push(family);
        break;
      }
    }
  }

  // Check general engineering keywords (20 pts)
  if (domainRoleScore < 25) {
    if (/\b(software developer|software engineer|web developer|programmer|application developer)\b/i.test(text)) {
      domainRoleScore = 20;
      matchedRoles.push('Software Engineer');
    }
  }

  // 3. Experience Fit (20%)
  // Full 20 points awarded since it passed the <= 1 year gatekeeper check
  const experienceFitScore = 20;

  // 4. Education / Qualification (10%)
  // Candidate holds B.Tech in IT. Check if JD values Bachelor's / Engineering / IT.
  let educationFitScore = 8;
  const educationKeywords = /\b(b\.?tech|b\.?e\.?|bachelor|degree|computer science|information technology|graduate|engineering)\b/i;
  if (educationKeywords.test(text)) {
    educationFitScore = 10;
  }

  // Sum raw components
  const rawTotal = techStackScore + domainRoleScore + experienceFitScore + educationFitScore;

  // Bounded realistically between 40 and 85
  const overallScore = Math.max(40, Math.min(85, Math.round(rawTotal)));

  return {
    overallScore,
    breakdown: {
      techStack: {
        score: techStackScore,
        max: 30,
        matchedKeywords: allMatchedKeywords.length > 0 ? allMatchedKeywords : matchedFromProfile,
      },
      domainRole: {
        score: domainRoleScore,
        max: 40,
        matchedRoles: matchedRoles.length > 0 ? matchedRoles : ['Software Engineering General'],
      },
      experienceFit: {
        score: experienceFitScore,
        max: 20,
        status: 'ENTRY_LEVEL_APPROVED',
      },
      educationFit: {
        score: educationFitScore,
        max: 10,
        qualification: 'B.Tech IT (SVCET) Verified',
      },
    },
  };
}

// ======================================================================
// 4. Integration Workflow Function
// ======================================================================

/**
 * Executes the complete Gatekeeper pipeline:
 * 1. Sanitization (HTML strip, UTF-8 normalize, > 50 words validation, XML wrap).
 * 2. Gatekeeper AI Evaluation (Industry check, <= 1 yr experience limit, crossover check).
 * 3. Deterministic Baseline Scoring (30% Tech, 40% Role, 20% Exp, 10% Edu -> [40, 85]).
 *
 * @param {Object} params
 * @param {string} params.rawJdText - Raw Job Description text
 * @param {Object} params.masterProfile - User's ground-truth Master Profile
 * @param {string} [params.model=DEFAULT_MODEL] - Ollama model name
 * @param {string} [params.baseUrl=OLLAMA_BASE_URL] - Ollama base URL
 * @returns {Promise<{
 *   success: boolean,
 *   status: 'PROCEED' | 'ABORT',
 *   reason: string,
 *   wordCount?: number,
 *   cleanedText?: string,
 *   wrappedXml?: string,
 *   baselineScore?: Object,
 *   engine?: string
 * }>}
 */
export async function evaluateJobDescriptionPipeline({
  rawJdText,
  masterProfile,
  model = DEFAULT_MODEL,
  baseUrl = OLLAMA_BASE_URL,
}) {
  // Step 1: Clean & Sanitize
  let sanitized;
  try {
    sanitized = sanitizeJobDescription(rawJdText);
  } catch (err) {
    return {
      success: false,
      status: 'ABORT',
      reason: err.message,
    };
  }

  // Step 2: Gatekeeper Evaluation
  const gatekeeperResult = await evaluateGatekeeper({
    wrappedXmlJd: sanitized.wrappedXml,
    cleanedJdText: sanitized.cleanedText,
    masterProfile,
    model,
    baseUrl,
  });

  if (gatekeeperResult.status === 'ABORT') {
    return {
      success: false,
      status: 'ABORT',
      reason: gatekeeperResult.reason,
      wordCount: sanitized.wordCount,
      cleanedText: sanitized.cleanedText,
      engine: gatekeeperResult.engine,
    };
  }

  // Step 3: Deterministic Baseline Scoring
  const baselineScore = calculateBaselineScore({
    cleanedJdText: sanitized.cleanedText,
    masterProfile,
  });

  return {
    success: true,
    status: 'PROCEED',
    reason: gatekeeperResult.reason,
    wordCount: sanitized.wordCount,
    cleanedText: sanitized.cleanedText,
    wrappedXml: sanitized.wrappedXml,
    baselineScore,
    engine: gatekeeperResult.engine,
  };
}

export default {
  validateJdSanity,
  sanitizeJobDescription,
  buildGatekeeperPrompt,
  evaluateGatekeeperRules,
  evaluateGatekeeper,
  calculateBaselineScore,
  evaluateJobDescriptionPipeline,
};
