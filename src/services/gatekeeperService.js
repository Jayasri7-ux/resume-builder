/**
 * The Gatekeeper AI Engine & Deterministic Baseline Scoring Service
 *
 * Enforces:
 * 1. Clean JD Input & Sanitization (HTML strip, UTF-8 normalization, >= 20 characters validation, XML wrapping).
 * 2. Gatekeeper AI Guardrail (Industry validation, strict <= 1 year experience limit, crossover role match).
 * 3. Deterministic Baseline Scoring Engine (30% Tech, 40% Role/Domain, 20% Experience, 10% Education -> bounded [40, 85]).
 * 4. Unified Integration Workflow function.
 */

import { OLLAMA_BASE_URL, DEFAULT_MODEL, safeParseJson, extractOllamaResponseText } from './ollamaService.js';
import {
  extractTechnicalRequirements,
  analyzeMissingTech,
  inspectDomainToolClusters,
} from './techExtractionService.js';

// ======================================================================
// 1. Conversational Contamination & Prompt Leakage Filter
// ======================================================================

/**
 * Common conversational artifacts, prompt leakage, and assistant inquiry patterns.
 */
export const CONVERSATIONAL_ARTIFACT_PATTERNS = [
  { name: 'clarity_inquiry', regex: /\b(?:would\s+you\s+like|do\s+you\s+(?:need|want))\s+(?:any\s+)?(?:more\s+)?clarity\b/i },
  { name: 'fine_tune_inquiry', regex: /\b(?:to\s+)?(?:further\s+)?fine[- ]tune\s+(?:this|the\s+job\s+description|the\s+role|the\s+jd|the\s+posting)(?:\s+further)?\b/i },
  { name: 'lean_heavily_inquiry', regex: /\bshould\s+(?:we|i)\s+(?:lean|focus)\s+more\s+heavily\b/i },
  { name: 'shift_timing_inquiry', regex: /\b(?:are\s+there\s+any|any)\s+specific\s+shift\s+timings\b/i },
  { name: 'assistant_closing_offer', regex: /\b(?:would\s+you\s+like|do\s+you\s+want)\s+me\s+to\s+(?:adjust|modify|tweak|rewrite|add|expand|tailor|refine|change)\b/i },
  { name: 'assistant_closing_feedback', regex: /\b(?:let\s+me\s+know|feel\s+free\s+to\s+let\s+me\s+know)\s+if\s+(?:you(?:'d|\s+would)?\s+like|you\s+need|you\s+want|there\s+are\s+any)\s+(?:any\s+)?(?:changes|modifications|adjustments|further|clarifications?|questions?|additions?)\b/i },
  { name: 'assistant_closing_alignment', regex: /\b(?:does\s+this\s+(?:align|sound|look)\s+(?:with|good|well)|hope\s+this\s+helps[!.]?|what\s+do\s+you\s+think\s+of\s+this\s*(?:draft|description|posting|role)?)\b/i },
  { name: 'assistant_intro_lead_in', regex: /\b(?:here(?:'s|\s+is)|below\s+is)\s+(?:the|a|an|your)?\s*(?:tailored|updated|revised|draft|complete)?\s*(?:job\s+description|jd|role\s+description|job\s+posting)\b/i },
  { name: 'assistant_intro_affirmation', regex: /\b(?:sure|certainly|absolutely)[!.,]?\s*(?:here(?:'s|\s+is)|i(?:'ve|\s+have)\s+(?:created|drafted|prepared|generated))\b/i },
  { name: 'assistant_creation_lead_in', regex: /\bhere is what i (?:came up with|crafted|wrote|generated)\b/i },
  { name: 'ai_disclaimer', regex: /\bas an ai (?:language model|assistant)\b/i },
  { name: 'assistant_general_inquiry', regex: /\bcan\s+i\s+help\s+you\s+with\s+anything\s+else\b/i }
];

/**
 * Detects conversational prompt contamination, assistant inquiries, or tuning prompts
 * in incoming pasted Job Description text.
 *
 * @param {string} text - Text to evaluate
 * @returns {{ hasContamination: boolean, matchedPatterns: string[] }}
 */
export function detectConversationalContamination(text) {
  if (!text || typeof text !== 'string') {
    return { hasContamination: false, matchedPatterns: [] };
  }
  const matchedPatterns = [];
  for (const { name, regex } of CONVERSATIONAL_ARTIFACT_PATTERNS) {
    if (regex.test(text)) {
      matchedPatterns.push(name);
    }
  }
  return {
    hasContamination: matchedPatterns.length > 0,
    matchedPatterns,
  };
}

/**
 * Strips conversational artifacts, assistant questions, tuning prompts,
 * and conversational greetings/outros from Job Description text,
 * preserving only the official Job Description body and responsibilities.
 *
 * @param {string} text - Raw or contaminated text
 * @returns {string} Clean official Job Description body
 */
export function stripConversationalArtifacts(text) {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text;

  // 1. Remove leading conversational intro prefixes
  const leadingIntroRegex = /^(?:(?:sure|certainly|absolutely)[!.,]?\s*)?(?:here(?:'s|\s+is)|below\s+is)\s+(?:the|a|an|your)?\s*(?:tailored|updated|revised|draft|complete)?\s*(?:job\s+description|jd|role\s+description|job\s+posting)?\s*(?:you\s+requested|for\s+your\s+review)?\s*:?\s*/i;
  cleaned = cleaned.replace(leadingIntroRegex, '').trim();

  // 2. Split into lines and filter lines matching conversational patterns
  const rawLines = cleaned.split(/\r?\n/);
  const cleanLines = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      cleanLines.push('');
      continue;
    }

    if (CONVERSATIONAL_ARTIFACT_PATTERNS.some(({ regex }) => regex.test(trimmed))) {
      // If line contains both JD text and conversational question, keep the JD part
      const sentences = trimmed.split(/(?<=[.!?])\s+/);
      const nonConversationalSentences = sentences.filter(
        (s) => !CONVERSATIONAL_ARTIFACT_PATTERNS.some(({ regex }) => regex.test(s))
      );
      if (nonConversationalSentences.length > 0) {
        cleanLines.push(nonConversationalSentences.join(' '));
      }
    } else {
      cleanLines.push(line);
    }
  }

  cleaned = cleanLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // 3. Remove trailing conversational questions or inquiries that may cling to the end of the text
  for (const { regex } of CONVERSATIONAL_ARTIFACT_PATTERNS) {
    cleaned = cleaned.replace(new RegExp(`\\s*${regex.source}.*$`, 'i'), '').trim();
  }

  return cleaned;
}

// ======================================================================
// 2. Exclusive Institution / College Tier Guardrail
// ======================================================================

/**
 * Patterns matching restrictive educational prerequisites demanding exclusive institutions
 * (e.g. "strictly from IIT or NIT", "Tier-1 colleges only", "IIT/BITS/NIT only").
 */
export const EXCLUSIVE_INSTITUTION_PATTERNS = [
  // 1. "strictly from IIT or NIT", "strictly from IIT/NIT/BITS", "only from IIT or NIT", "exclusively from IIT/NIT"
  {
    name: 'strictly_from_exclusive_institutes',
    regex: /\b(?:strictly|only|exclusively)\s+(?:from\s+)?(?:iits?|nits?|bits(?:\s+pilani)?|iiits?)(?:\s*(?:or|\/|,|\band\b)\s*(?:iits?|nits?|bits(?:\s+pilani)?|iiits?))*\b/i,
  },
  // 2. "IIT/BITS/NIT only", "IIT/NIT only", "IITs, NITs, BITS only", "IIT or NIT only"
  {
    name: 'exclusive_institutes_only',
    regex: /\b(?:iits?|nits?|bits(?:\s+pilani)?|iiits?)(?:\s*(?:or|\/|,|\band\b)\s*(?:iits?|nits?|bits(?:\s+pilani)?|iiits?))*\s*(?:only|graduates?\s+only|alumni\s+only|candidates?\s+only)\b/i,
  },
  // 3. "Tier-1 colleges only", "Tier-1 engineering colleges only", "Tier 1 institutes only", "Tier-1 only"
  {
    name: 'tier_1_colleges_only',
    regex: /\b(?:tier[- ]?1|top[- ]?tier|premier)\s*(?:engineering\s+)?(?:colleges?|institutes?|universities)?\s*(?:only|graduates?\s+only|candidates?\s+only|alumni\s+only)\b/i,
  },
  // 4. "candidates from Tier 1 colleges", "strictly from Tier-1", "hiring from Tier-1 only"
  {
    name: 'tier_1_strict_from',
    regex: /\b(?:strictly|only|exclusively|candidates?|graduates?|students?|hiring)?\s*(?:strictly\s+)?from\s+(?:tier[- ]?1|top[- ]?tier|premier)\s*(?:engineering\s+)?(?:colleges?|institutes?|universities)?\b/i,
  },
  // 5. "Tier-1 (IIT/NIT/BITS) only", "premier institutes (IIT/NIT/BITS)"
  {
    name: 'tier_1_parenthesized',
    regex: /\b(?:tier[- ]?1|top[- ]?tier|premier\s+institutes?)\s*(?:\([^)]*(?:iit|nit|bits|iiit)[^)]*\))\s*(?:only|graduates?\s+only|candidates?\s+only)?\b/i,
  },
  // 6. "only graduates from premier institutes"
  {
    name: 'premier_institutes_only',
    regex: /\b(?:only|strictly)?\s*(?:graduates?|candidates?)\s+from\s+premier\s+(?:engineering\s+)?(?:institutes?|colleges?|universities)\b/i,
  },
  // 7. "hiring exclusively from IIT/NIT"
  {
    name: 'hiring_exclusively_from',
    regex: /\bhiring\s+(?:strictly|exclusively|only)\s+from\s+(?:iits?|nits?|bits|iiits?|tier[- ]?1)\b/i,
  },
];

/**
 * Detects whether a Job Description contains restrictive exclusive institution or college tier prerequisites.
 *
 * @param {string} text - Cleaned or raw JD text
 * @returns {{ hasExclusiveRequirement: boolean, matchedPatterns: string[] }}
 */
export function detectExclusiveInstitutionRequirement(text) {
  if (!text || typeof text !== 'string') {
    return { hasExclusiveRequirement: false, matchedPatterns: [] };
  }

  const matchedPatterns = [];
  for (const { name, regex } of EXCLUSIVE_INSTITUTION_PATTERNS) {
    if (regex.test(text)) {
      matchedPatterns.push(name);
    }
  }

  return {
    hasExclusiveRequirement: matchedPatterns.length > 0,
    matchedPatterns,
  };
}

/**
 * Checks if candidate's education background contains an exclusive Tier-1 / premier institution
 * (e.g. IIT, NIT, BITS, IIIT).
 *
 * @param {Object} masterProfile - Ground-truth Master Profile
 * @returns {boolean} True if candidate possesses a matching institution
 */
export function candidateMatchesInstitutionTier(masterProfile) {
  const education = masterProfile?.education || [];
  const tier1Regex = /\b(iit|indian\s+institute\s+of\s+technology|nit|national\s+institute\s+of\s+technology|bits(?:\s+pilani)?|birla\s+institute\s+of\s+technology\s+and\s+science|iiit|indian\s+institute\s+of\s+information\s+technology)\b/i;

  for (const edu of education) {
    const inst = edu?.institution || '';
    if (tier1Regex.test(inst)) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates whether a JD demands an exclusive college tier or institution
 * that the candidate does not possess.
 *
 * @param {string} cleanedJdText - Sanitized plain text JD
 * @param {Object} masterProfile - Ground-truth Master Profile
 * @returns {{ isBlocked: boolean, failureReason?: string, reason?: string, reasoning?: string, matchedRequirement?: string, isExempt?: boolean }}
 */
export function evaluateExclusiveInstitutionTier(cleanedJdText, masterProfile) {
  const detection = detectExclusiveInstitutionRequirement(cleanedJdText);
  if (!detection.hasExclusiveRequirement) {
    return { isBlocked: false };
  }

  // If candidate actually graduated from an exclusive institution (IIT/NIT/BITS), allow it!
  const hasTier1 = candidateMatchesInstitutionTier(masterProfile);
  if (hasTier1) {
    return { isBlocked: false, isExempt: true };
  }

  const failureReason = 'Blocked: Exclusive institution requirement detected';
  const reason =
    'Blocked: Exclusive institution requirement detected (e.g., IIT/NIT only) which does not match profile education.';
  const reasoning =
    'Blocked: Exclusive institution requirement detected (e.g., IIT/NIT only) which does not match profile education.';

  return {
    isBlocked: true,
    failureReason,
    reason,
    reasoning,
    matchedRequirement: detection.matchedPatterns[0],
  };
}

// ======================================================================
// 3. Batch Year Eligibility & Graduation Year Guardrail
// ======================================================================

/**
 * Extracts candidate's graduation year from Master Profile education.
 *
 * @param {Object} masterProfile - Ground-truth Master Profile
 * @returns {string} Graduation year (e.g. "2026")
 */
export function getCandidateGraduationYear(masterProfile) {
  const education = masterProfile?.education || [];
  for (const edu of education) {
    const grad = edu?.graduationYear || '';
    const match = grad.match(/\b(20\d{2})\b(?:\s*$|\s*[-–—]\s*(20\d{2}))/);
    if (match) {
      return match[2] || match[1];
    }
  }
  return '2026';
}

/**
 * Patterns matching restrictive graduation batch years
 * (e.g. "strictly requires 2025 batch graduates", "2025 batch only", "eligible batches: 2025").
 */
export const RESTRICTIVE_BATCH_PATTERNS = [
  // 1. "strictly requires 2025 batch", "strictly for 2025 batch", "strictly 2025 batch", "only 2025 batch", "only for 2025 batch"
  /(?:strictly\s+(?:requires\s+|for\s+)?|only\s+(?:for\s+)?)(?:the\s+)?(20\d{2})\s+batch(?:\s+graduates?|\s+pass[- ]?outs?)?/i,
  // 2. "2025 batch only", "2025 batch graduates only", "2025 passouts only", "2025 passing out only"
  /\b(20\d{2})\s+batch(?:\s+graduates?|\s+pass[- ]?outs?|\s+passing[- ]?out|\s+students?)?\s+only\b/i,
  // 3. "2024 / 2025 batch only", "2024 or 2025 batch only", "2024, 2025 batch only"
  /\b(20\d{2}(?:\s*(?:or|\/|,|\band\b)\s*20\d{2})+)\s+batch(?:\s+graduates?|\s+pass[- ]?outs?)?\s+only\b/i,
  // 4. "eligible batch: 2025 only", "eligible batches: 2025", "batch eligibility: 2025 only"
  /\b(?:eligible\s+batch(?:es)?|batch\s+eligibility)\s*:\s*([^.\n\r]+)/i,
  // 5. "target batch: 2025 only", "targeted batch: 2025", "graduating batch: 2025"
  /\b(?:target(?:ed)?|graduating)\s+batch(?:es)?\s*:\s*([^.\n\r]+)/i,
  // 6. "batch of 2025 only", "batches of 2024 and 2025 only"
  /\bbatch(?:es)?\s+of\s+([^.\n\r]+?)\s+only\b/i,
  // 7. "strictly 2025 graduates", "strictly 2025 passouts"
  /\bstrictly\s+(?:from\s+)?(20\d{2})\s+(?:batch\s+)?(?:graduates?|pass[- ]?outs?)\b/i,
  // 8. "graduates of 2025 only", "passouts of 2025 only"
  /\b(?:graduates?|pass[- ]?outs?)\s+of\s+(20\d{2})\s+only\b/i,
];

/**
 * Evaluates whether a JD contains a restrictive graduation batch year prerequisite
 * that conflicts with the candidate's graduation year.
 *
 * @param {string} text - Cleaned or raw JD text
 * @param {Object} masterProfile - Candidate ground-truth Master Profile
 * @returns {{ isBlocked: boolean, failureReason?: string, reason?: string, reasoning?: string, requiredBatch?: string, candidateBatch?: string }}
 */
export function evaluateBatchYearEligibility(text, masterProfile) {
  if (!text || typeof text !== 'string') {
    return { isBlocked: false };
  }

  const candidateBatch = getCandidateGraduationYear(masterProfile);

  for (const pattern of RESTRICTIVE_BATCH_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const matchedSnippet = match[0];
      const capturedGroup = match[1];

      const yearMatches = (capturedGroup ? (capturedGroup + ' ' + matchedSnippet) : matchedSnippet).match(/\b(20\d{2})\b/g);
      if (yearMatches && yearMatches.length > 0) {
        const allowedYears = Array.from(new Set(yearMatches));

        // If candidate's batch year is included, they are eligible!
        if (allowedYears.includes(candidateBatch)) {
          continue;
        }

        const requiredBatch = allowedYears.join(' / ');
        const failureReason = 'Blocked: Batch year mismatch';
        const reason = `Blocked: Batch year mismatch. The role strictly requires ${requiredBatch} batch graduates, which conflicts with your profile's graduation year.`;
        const reasoning = reason;

        return {
          isBlocked: true,
          requiredBatch,
          candidateBatch,
          failureReason,
          reason,
          reasoning,
        };
      }
    }
  }

  return { isBlocked: false };
}

// ======================================================================
// 4. Clean JD Input, Sanitization & Strict Gibberish Interception
// ======================================================================

/**
 * Detects whether the text is a standard structured job description with bullet points
 * (e.g. containing structured sections such as "- Job Title:", "- Experience:", "- Key Responsibilities:").
 *
 * @param {string} text - Raw or cleaned JD text
 * @returns {boolean} True if text has standard structured JD bullet points
 */
export function isStandardStructuredBulletedJd(text) {
  if (!text || typeof text !== 'string') return false;

  // Check for standard structured field patterns (with or without leading bullets like -, *, •)
  const structuredFieldPatterns = [
    /[-*•–—]?\s*(?:job\s+title|position\s+title|role\s+title|job\s+role|title|position|role)\s*:/i,
    /[-*•–—]?\s*(?:experience|work\s+experience|exp|eligibility|batch|batch\s+eligibility|target\s+batch)\s*:/i,
    /[-*•–—]?\s*(?:key\s+responsibilities|responsibilities|core\s+responsibilities|duties|key\s+duties|what\s+you(?:'ll|\s+will)\s+do|role\s+overview|job\s+summary|about\s+the\s+role)\s*:/i,
    /[-*•–—]?\s*(?:required\s+technical\s+skills|required\s+skills|technical\s+skills|skills\s+required|core\s+skills|skills|tech\s+stack|requirements|key\s+requirements|qualifications|prerequisites)\s*:/i,
    /[-*•–—]?\s*(?:eligibility(?:\s*&\s*education)?|education|academic\s+qualifications?)\s*:/i,
    /[-*•–—]?\s*(?:location|job\s+location|work\s+location)\s*:/i,
  ];

  let matchedFields = 0;
  for (const pattern of structuredFieldPatterns) {
    if (pattern.test(text)) {
      matchedFields++;
    }
  }

  // Count bulleted lines (lines starting with -, *, •, –, —, or 1.)
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const bulletLines = lines.filter((l) => /^[-*•–—]\s+|\d+\.\s+/i.test(l));

  // A standard structured bulleted JD has:
  // 1. At least 2 standard structured field headers (e.g. "- Job Title:" and "- Experience:" or "- Key Responsibilities:")
  // 2. OR at least 1 primary header (like "- Job Title:" or "- Key Responsibilities:") AND multiple bullet points (>= 2 bullet lines)
  // 3. OR at least 1 structured field header and at least 1 bullet line
  return matchedFields >= 2 || (matchedFields >= 1 && bulletLines.length >= 1) || bulletLines.length >= 2;
}

/**
 * Rigorous Sanity & Gibberish Validator
 * Intercepts keyboard smashing, random high-entropy strings, repeating syllables,
 * and text under minimum character count (< 20 characters).
 * Correctly accepts standard structured job descriptions with bullet points and concise professional JDs.
 *
 * @param {string} text - Cleaned text to evaluate
 * @param {Object} [options={}] - Options (e.g. stripConversationalArtifacts)
 * @returns {{ isValid: boolean, reason?: string, failureReason?: string }}
 */
export function validateJdSanity(text, options = {}) {
  if (!text || typeof text !== 'string' || text.trim().length < 20) {
    return {
      isValid: false,
      failureReason: 'Blocked: Invalid/insufficient technical content',
      reason: 'Job description must contain at least 20 characters of valid text. Please provide a valid job description.',
    };
  }

  // Pre-processing filter: Detect Conversational Prompt Contamination
  if (!options.stripConversationalArtifacts) {
    const contamination = detectConversationalContamination(text);
    if (contamination.hasContamination) {
      return {
        isValid: false,
        failureReason: 'Blocked: Malformed job description detected',
        reason: 'Blocked: Malformed job description detected. Extraneous chat prompts or conversational text found mixed into the input.',
      };
    }
  }

  const rawWords = text.trim().split(/\s+/).filter(Boolean);
  const cleanTokens = rawWords
    .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 0);

  if (cleanTokens.length === 0) {
    return {
      isValid: false,
      failureReason: 'Blocked: Invalid/insufficient technical content',
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
      failureReason: 'Blocked: Invalid/insufficient technical content',
      reason: 'Invalid or meaningless Job Description detected. Please enter a valid professional job description.',
    };
  }

  // 2. Scan for Gibberish Tokens (keyboard smashing / high-entropy words)
  const techAcronyms = new Set([
    'html', 'html5', 'grpc', 'http', 'https', 'json', 'yaml', 'xml', 'sync', 'async',
    'npm', 'npx', 'pnpm', 'yarn', 'wsdl', 'smtp', 'rest', 'api', 'apis',
    'sql', 'nosql', 'mysql', 'postgresql', 'sqlite', 'plsql', 'tsql', 'mssql', 'graphql',
    'mongodb', 'redis', 'kafka',
    'css', 'css3', 'scss', 'sass', 'less',
    'sdk', 'sdks', 'cli', 'clis', 'jwt', 'jwts', 'ci', 'cd', 'cicd', 'ui', 'ux', 'dom',
    'tcp', 'udp', 'ip', 'dns', 'ssh', 'ssl', 'tls',
    'rxjs', 'redux', 'regex', 'oauth', 'crud', 'uuid', 'cors', 'nltk', 'spacy',
    'bash', 'zsh', 'jvm', 'jdk',
    'aws', 'gcp', 'azure', 'k8s', 'llm', 'llms', 'vms', 'dbs', 'orm', 'orms',
    'restful', 'fastapi', 'pytest', 'junit', 'devops', 'sysadmin', 'oop', 'oops', 'ts', 'js',
    'dbms', 'rdbms', 'dsa', 'sdlc', 'os', 'cn', 'qa', 'qc', 'etl', 'mvc', 'ai', 'ml', 'nlp', 'iot'
  ]);
  let gibberishWordCount = 0;

  for (const token of cleanTokens) {
    // Check if token or version-stripped token (e.g. html5 -> html, css3 -> css) or singular is a known tech acronym
    const baseToken = token.replace(/\d+$/, '');
    const singularToken = token.replace(/s$/, '');
    if (
      techAcronyms.has(token) ||
      (baseToken && techAcronyms.has(baseToken)) ||
      (singularToken && techAcronyms.has(singularToken))
    ) continue;

    // Only purely alphabetic words can be vowelless gibberish words (exclude tokens with numbers like 10th, 12th)
    const isLongVowelless = /^[a-z]{4,}$/i.test(token) && !/[aeiouy]/i.test(token);
    // Exclude 'y' from consonant cluster to prevent false positives on valid terms like mysql, sync, crypto
    // Also exclude legitimate English words like strengths, lengths
    const hasConsonantCluster =
      token !== 'strengths' &&
      token !== 'lengths' &&
      /^[a-z]+$/i.test(token) &&
      /[bcdfghjklmnpqrstvwxz]{5,}/i.test(token);
    const hasCharRepeat = /([a-z])\1{3,}/i.test(token);
    const hasKeyboardMash = /(asdf|dfgh|hjkl|qwer|wery|zxcv|xcvb)/i.test(token);

    if (isLongVowelless || hasConsonantCluster || hasCharRepeat || hasKeyboardMash) {
      gibberishWordCount++;
    }
  }

  const gibberishRatio = gibberishWordCount / cleanTokens.length;
  if (gibberishRatio > 0.15 || (cleanTokens.length < 20 && gibberishWordCount >= 2)) {
    return {
      isValid: false,
      failureReason: 'Blocked: Invalid/insufficient technical content',
      reason: 'Invalid or meaningless Job Description detected. Please enter a valid professional job description.',
    };
  }

  // 3. Explicit Recognition for Professional Bulleted JDs:
  // If the text matches standard structured JD formatting (e.g. "- Job Title:", "- Experience:",
  // "- Key Responsibilities:", "- Required Technical Skills:") and passed the gibberish check above,
  // it is 100% valid professional text. Never falsely block well-structured technical JDs.
  if (isStandardStructuredBulletedJd(text)) {
    return {
      isValid: true,
    };
  }

  // 4. Dictionary / Professional Vocabulary Recognition Ratio (for unstructured casual text)
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
    'web', 'python', 'java', 'javascript', 'typescript', 'react', 'node', 'django', 'flask', 'fastapi', 'sql', 'database', 'databases', 'cloud',
    'mysql', 'postgresql', 'postgres', 'mongodb', 'sqlite', 'graphql', 'html', 'html5', 'css', 'css3', 'vue', 'angular', 'svelte',
    'next', 'nuxt', 'express', 'nest', 'spring', 'boot', 'asp', 'net', 'laravel', 'rails', 'tailwind', 'bootstrap', 'redux',
    'docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp', 'linux', 'unix', 'jenkins', 'ci', 'cd', 'cicd',
    'git', 'github', 'gitlab', 'agile', 'scrum', 'jira', 'communication', 'problem', 'solving', 'analytical', 'performance', 'maintenance', 'testing',
    'code', 'review', 'collaborate', 'collaboration', 'cross', 'functional', 'product', 'customer', 'business', 'client',
    'enterprise', 'industry', 'tools', 'environment', 'platform', 'platforms', 'services', 'rest', 'api', 'apis', 'restful',
    'architecture', 'writing', 'clean', 'modular', 'documentation', 'learning', 'eager', 'opportunity', 'join', 'seeking',
    'looking', 'passionate', 'ambitious', 'ability', 'hands', 'knowledge', 'understanding', 'proficiency', 'proficient',
    'strong', 'foundational', 'competitive', 'hybrid', 'remote', 'office', 'location', 'bangalore', 'india', 'hours',
    'salary', 'apply', 'resume', 'hire', 'hiring', 'overview', 'summary', 'key', 'about', 'plus', 'preferred', 'minimum',
    'yrs', 'level', 'entry', 'entry-level', 'practical', 'delivery', 'collaborative', 'scalable', 'build',
    'duties', 'deliverables', 'tasks', 'prerequisites', 'competencies', 'structures', 'algorithms', 'microservices',
    'btech', 'be', 'bsc', 'mca', 'bca', 'jest', 'cypress', 'pytest', 'selenium', 'postman',
    // Data & AI
    'pandas', 'numpy', 'scikit', 'sklearn', 'nlp', 'machine', 'learning', 'model', 'models', 'analytics', 'analyst',
    // General Professional & Industry Vocab (Distinguishes legitimate non-IT JDs from random gibberish)
    'sales', 'marketing', 'operations', 'executive', 'executives', 'process', 'support', 'service', 'services',
    'customer', 'client', 'call', 'center', 'representative', 'representatives', 'account', 'accounts',
    'field', 'retail', 'market', 'markets', 'visit', 'visits', 'travel', 'meet', 'meeting', 'meetings',
    'report', 'reports', 'manager', 'managers', 'training', 'contract', 'contracts', 'target', 'targets',
    'monthly', 'daily', 'weekly', 'quarterly', 'annual', 'document', 'documentation', 'terminal', 'lead',
    'leads', 'generation', 'handling', 'fluency', 'language', 'commercial', 'direct', 'inbound', 'outbound',
    'voice', 'channel', 'expansion', 'onboarding', 'rate', 'rates', 'discount', 'shop', 'store', 'merchants',
    'merchant', 'partner', 'partners', 'presentation', 'demonstration', 'active', 'listening', 'persuasion',
    'energy', 'stamina', 'mindset', 'regional', 'national', 'global'
  ]);

  let recognizedCount = 0;
  for (const token of cleanTokens) {
    if (recognizedVocab.has(token) || techAcronyms.has(token) || /^\d+$/.test(token)) {
      recognizedCount++;
    }
  }

  const recognizedRatio = recognizedCount / cleanTokens.length;
  if (cleanTokens.length >= 8 && recognizedRatio < 0.25) {
    return {
      isValid: false,
      failureReason: 'Blocked: Invalid/insufficient technical content',
      reason: 'Invalid or meaningless Job Description detected. Please enter a valid professional job description.',
    };
  }

  // 4. Structural Coherence: Must contain at least 1 Job Description anchor concept or software/tech term
  const jdAnchorKeywords = [
    'job', 'role', 'title', 'responsibilities', 'requirements', 'qualifications', 'experience', 'skills',
    'developer', 'engineer', 'candidate', 'position', 'software', 'technology', 'technologies', 'team',
    'company', 'degree', 'education', 'apply', 'employment', 'duties', 'work', 'project', 'full-time',
    'internship', 'intern', 'fresher', 'junior', 'associate', 'hiring', 'bachelor', 'applications',
    'python', 'react', 'java', 'javascript', 'django', 'node', 'web', 'backend', 'frontend', 'analyst', 'sql', 'git', 'api'
  ];

  let anchorCount = 0;
  for (const kw of jdAnchorKeywords) {
    if (cleanTokens.includes(kw) || text.toLowerCase().includes(kw)) {
      anchorCount++;
    }
  }

  if (anchorCount < 1) {
    return {
      isValid: false,
      failureReason: 'Blocked: Invalid/insufficient technical content',
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
 * - Normalizes bullet points (•, ▪, ◦, * -> -)
 * - Normalizes whitespace
 * - Validates minimum character count (>= 20 characters)
 * - Enforces zero-tolerance sanity, gibberish interception, and conversational prompt detection
 * - Wraps output in <user_jd> ... </user_jd> XML delimiters
 *
 * @param {string} rawText - Raw input text
 * @param {Object} [options={}] - Options (e.g. stripConversationalArtifacts)
 * @returns {{ cleanedText: string, wrappedXml: string, wordCount: number }}
 * @throws {Error} If text is invalid or fails sanity check
 */
export function sanitizeJobDescription(rawText, options = {}) {
  if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new Error('Job description input cannot be empty. Please provide valid text.');
  }

  let sourceText = rawText;
  if (options.stripConversationalArtifacts) {
    sourceText = stripConversationalArtifacts(rawText);
  }

  // 1. Strip HTML tags
  let cleaned = sourceText.replace(/<[^>]*>/g, ' ');

  // 2. Normalize non-standard Unicode spaces and punctuation
  cleaned = cleaned
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ');

  // Normalize bullet points at line beginnings: •, ▪, ◦, * -> -
  cleaned = cleaned.replace(/^[ \t]*[•▪◦*]\s*/gm, '- ');
  // Ensure hyphen bullets have a trailing space: e.g. "-Job Title:" -> "- Job Title:"
  cleaned = cleaned.replace(/^[ \t]*[-–—](?=[A-Za-z0-9])/gm, '- ');

  // 3. Normalize whitespace
  cleaned = cleaned
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

  // 4. Low minimum character count check (< 20 characters)
  if (cleaned.length < 20) {
    throw new Error(
      `Job description must contain at least 20 characters of valid text (received ${cleaned.length} characters). Please provide a valid job description.`
    );
  }

  // 5. Strict Sanity & Gibberish Interception
  const sanityCheck = validateJdSanity(cleaned, options);
  if (!sanityCheck.isValid) {
    const err = new Error(sanityCheck.reason);
    if (sanityCheck.failureReason) {
      err.failureReason = sanityCheck.failureReason;
    }
    throw err;
  }

  // 6. Wrap in strict XML delimiters
  const wrappedXml = `<user_jd>\n${cleaned}\n</user_jd>`;
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);

  return {
    cleanedText: cleaned,
    wrappedXml,
    wordCount: words.length,
  };
}

// ======================================================================
// 5. Strict Experience Threshold & Seniority Guardrail (0-1 Year Ceiling)
// ======================================================================

export const EXACT_EXPERIENCE_MISMATCH_FAILURE_REASON =
  'Blocked: Experience level mismatch. The role requires experience greater than your entry-level threshold (0-1 year maximum).';

/**
 * Strict Experience Level Evaluator:
 * - ALLOW: Any experience range starting at 0 (e.g., "0 to 3 years", "0-2 years", "0–5 years", "0+ years", "0-1 year"),
 *   "0 years", "fresher", "fresh graduates", "entry-level with no experience", or any role requiring <= 1 year of experience.
 * - BLOCK STRICTLY: Roles that strictly require experience starting above 0 with no fresher inclusion
 *   (e.g., "1-2 years", "2+ years", "2 to 3 years", "minimum 1 year experience where upper bound goes above 1", "3+ years", "5+ years", "mid-level").
 * - Returns exact failureReason: "Blocked: Experience level mismatch. The role requires experience greater than your entry-level threshold (0-1 year maximum)."
 *
 * @param {string} rawText - Job description text
 * @returns {{ isBlocked: boolean, failureReason?: string, reason?: string, reasoning?: string, matchedText?: string, rule?: string, isSenior?: boolean }}
 */
export function evaluateExperienceLevel(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { isBlocked: false, failureReason: null, reason: null, reasoning: null };
  }

  const text = rawText.toLowerCase();

  // Extract explicit Job Title / Position line if present
  const titleLineMatch = rawText.match(
    /(?:job\s+title|position\s+title|role\s+title|job\s+role|title|position|role)\s*:\s*([^\n\r]+)/i
  );
  const titleString = titleLineMatch ? titleLineMatch[1].replace(/^[-*•–—]\s*/, '').trim() : '';
  const titleLower = titleString.toLowerCase();

  // Extract explicit Experience line if present
  const expLineMatch = rawText.match(
    /(?:experience|work\s+experience|exp|eligibility)\s*:\s*([^\n\r]+)/i
  );
  const expString = expLineMatch ? expLineMatch[1].replace(/^[-*•–—]\s*/, '').trim() : '';

  // Entry level synonyms strictly allowed (<= 1 year maximum)
  const entryLevelSynonymRegex =
    /\b(?:freshers?|fresh\s+graduates?|recent\s+graduates?|202[4-6]\s*batch|batch\s*of\s*202[4-6]|class\s*of\s*202[4-6]|entry[- ]level(?:\s+with\s+no\s+experience)?|junior\s+role(?:\s+with\s+0\s*[-–—\s\bto\b]+\s*1\s*(?:years?|yrs?))?|junior|jr\.|(?:0\s*(?:[-–—]|\bto\b)\s*)?1\s*(?:years?|yrs?)|(?:up\s+to|maximum|max\.?|under|less\s+than|<|<=)?\s*1\s*(?:years?|yrs?)|0\s*[-–—]\s*1\b|0\s*(?:years?|yrs?)\b|1\s*year\b|1\s*yr\b|intern|internship|graduate\s+trainee|trainee|associate\s+developer|associate\s+engineer|associate|campus\s+hire|college\s+hire|entry\s+level\s+software|fresher\s+developer|fresher\s+engineer|no\s+(?:prior\s+)?experience(?:\s+required)?|experience\s+not\s+required|freshers?\s+welcome|open\s+for\s+freshers?|open\s+to\s+freshers?|freshers?\s+can\s+apply|freshers?\s+are\s+eligible)\b/i;

  const isTitleJunior = entryLevelSynonymRegex.test(titleLower);

  // 1. Check for explicit senior-level title in Job Title line
  const seniorRoleTitleRegex =
    /\b(senior|sr\.|tech\s+lead|team\s+lead|lead\s+developer|lead\s+engineer|lead\s+architect|principal|staff\s+engineer|staff\s+developer|director\s+of\s+engineering|head\s+of\s+engineering|engineering\s+manager|solution\s+architect|solutions\s+architect|enterprise\s+architect|vp\s+of\s+engineering)\b/i;

  if (seniorRoleTitleRegex.test(titleLower) && !isTitleJunior) {
    const match = titleString.match(seniorRoleTitleRegex);
    const failureReason = 'Blocked: Requires senior experience';
    const reason = `Experience limit exceeded: Role requires senior-level seniority (detected: "${match[0]}"). Candidate is entry-level (0-1 year).`;
    return {
      isBlocked: true,
      isSenior: true,
      failureReason,
      reason,
      reasoning: `${failureReason}. Candidate profile is entry-level (0-1 years), but job demands senior seniority ("${match[0]}").`,
      matchedText: match[0],
      rule: 'senior job title',
    };
  }

  // Fresher & Entry-Level Inclusion Check:
  // 1. Ranges starting at 0: "0 to 3 years", "0-2 years", "0–5 years", "0-1 years", "0 to 10 yrs"
  const rangeStartingAtZeroRegex =
    /\b0\s*(?:[-–—/]|to|through|or)\s*\d+\s*(?:years?|yrs?)?\b/i;

  // 2. "0+" notation: "0+ years", "0+ yrs", "0+"
  const zeroPlusRegex =
    /\b0\s*\+\s*(?:years?|yrs?)?\b/i;

  // 3. Explicit "0 years" / "0 yrs" / "0 year"
  const zeroYearsRegex =
    /\b0\s*(?:years?|yrs?)\b/i;

  // 4. Explicit terms indicating freshers / entry-level / no experience are eligible
  const fresherInclusionRegex =
    /\b(?:freshers?|fresh\s+graduates?|recent\s+graduates?|entry[- ]level|no\s+(?:prior\s+)?experience(?:\s+required)?|experience\s+not\s+required|0\s+experience|zero\s+experience|graduate\s+trainee|campus\s+hire|college\s+hire|intern(?:ship)?|202[4-6]\s*batch|batch\s*of\s*202[4-6]|class\s*of\s*202[4-6]|freshers?\s+welcome|open\s+for\s+freshers?|open\s+to\s+freshers?|freshers?\s+can\s+apply|freshers?\s+are\s+eligible|for\s+freshers?)\b/i;

  const hasRangeStartingAtZero =
    rangeStartingAtZeroRegex.test(text) ||
    rangeStartingAtZeroRegex.test(expString) ||
    zeroPlusRegex.test(text) ||
    zeroPlusRegex.test(expString) ||
    zeroYearsRegex.test(text) ||
    zeroYearsRegex.test(expString) ||
    (Boolean(expString) && /\b0\s*(?:[-–—/]|to|through|or)\s*\d+\b/i.test(expString));

  const hasFresherTerms =
    fresherInclusionRegex.test(text) ||
    fresherInclusionRegex.test(expString) ||
    fresherInclusionRegex.test(titleString);

  const hasFresherInclusion = hasRangeStartingAtZero || hasFresherTerms;

  // 2. Strict Experience Ceiling & Threshold Rules:
  // If the role includes freshers or specifies a range starting at 0 (e.g., "0 to 3 years", "0-2 years", "0–5 years", "0+"),
  // freshers are eligible to apply -> allow it to pass (PROCEED).
  // Only block roles that strictly require experience starting above 0 with no fresher inclusion.
  if (!hasFresherInclusion) {
    const exceedingPatterns = [
      // Ranges starting above 0 where upper bound > 1: "1-2 years", "1 to 2 years", "2 to 3 years", "2-4 years"
      {
        regex: /\b(?:1\s*(?:[-–—]|\bto\b)\s*([2-9]|\d{2,})|([2-9]|\d{2,})\s*(?:[-–—]|\bto\b)\s*([2-9]|\d{2,}))\s*(?:years?|yrs?)\b/i,
        label: 'range exceeding 1 year',
      },
      // Minimum 1 year where upper bound goes above 1: "minimum 1-2 years", "min 1 to 3 yrs", "minimum 1 year up to 2 years"
      {
        regex: /\b(?:minimum|at\s+least|min\.?)\s+(?:of\s+)?1\s*(?:years?|yrs?)?[^.\n\r]{0,25}?(?:[-–—]|\bto\b|\bup\s+to\b)\s*([2-9]|\d{2,})\s*(?:years?|yrs?)\b/i,
        label: 'minimum 1 year with upper bound exceeding 1',
      },
      // Plus notation where threshold >= 1+: "1+ years", "2+ years", "3+ years", "5+ years"
      {
        regex: /\b([1-9]|\d{2,})\s*\+\s*(?:years?|yrs?)\b/i,
        label: 'plus experience notation',
      },
      // Fractional / decimal years > 1: "1.5 years", "2.5 years"
      {
        regex: /\b(?:1\.[1-9]|[2-9](?:\.\d+)?)\s*(?:\+\s*)?(?:years?|yrs?)\b/i,
        label: 'fractional/multi-year experience',
      },
      // Minimum / at least >= 2 years: "minimum 2 years", "at least 3 years"
      {
        regex: /\b(?:minimum|at\s+least|min\.?)\s+(?:of\s+)?([2-9]|\d{2,})\s*(?:years?|yrs?)\b/i,
        label: 'minimum multi-year experience',
      },
      // More than 1 year / greater than 1 year / > 1 year
      {
        regex: /(?:\b(?:more\s+than|greater\s+than)\b|>)\s*1\s*(?:years?|yrs?)\b/i,
        label: 'experience greater than 1 year',
      },
      // Standalone multi-year experience: "2 years experience", "3 years of experience", etc.
      {
        regex: /\b([2-9]|\d{2,})\s*(?:years?|yrs?)(?:\s+of)?(?:\s+(?:hands[- ]on\s+)?(?:software\s+development\s+)?experience|\s+work\s+experience)\b/i,
        label: 'standalone multi-year experience',
      },
      // Mid-level role requirement (unless junior/fresher title)
      {
        regex: /\bmid[- ]level\b/i,
        label: 'mid-level seniority',
      },
    ];

    for (const { regex, label } of exceedingPatterns) {
      const match = text.match(regex);
      if (match) {
        const failureReason = EXACT_EXPERIENCE_MISMATCH_FAILURE_REASON;
        const reason = `${failureReason} Role requires more than 1 year of experience (detected: "${match[0]}"). Candidate profile is entry-level (0-1 year maximum).`;
        const reasoning = `${failureReason} Candidate profile is entry-level (0-1 year maximum), but job requires experience exceeding 1 year ("${match[0]}").`;
        return {
          isBlocked: true,
          failureReason,
          reason,
          reasoning,
          matchedText: match[0],
          rule: label,
        };
      }
    }

    // Check explicit Experience line if present
    if (expString) {
      const expLineRegex = /\b(?:1\s*(?:[-–—]|\bto\b)\s*([2-9]|\d{2,})|([2-9]|\d{2,})\s*(?:[-–—]|\bto\b)\s*([2-9]|\d{2,})|([1-9]|\d{2,})\s*\+|([2-9]|\d{2,})\s*(?:years?|yrs?)|(?:more\s+than|>)\s*1)\b/i;
      const match = expString.match(expLineRegex);
      if (match) {
        const failureReason = EXACT_EXPERIENCE_MISMATCH_FAILURE_REASON;
        const reason = `${failureReason} Role requires more than 1 year of experience (detected: "${match[0]}"). Candidate profile is entry-level (0-1 year maximum).`;
        const reasoning = `${failureReason} Candidate profile is entry-level (0-1 year maximum), but job requires experience exceeding 1 year ("${match[0]}").`;
        return {
          isBlocked: true,
          failureReason,
          reason,
          reasoning,
          matchedText: match[0],
          rule: 'experience line exceeding 1 year',
        };
      }
    }
  }

  // 3. Explicit Senior roles in text (without mentorship context)
  const isExpJunior = entryLevelSynonymRegex.test(expString);
  const hasEntrySynonymInText =
    isTitleJunior ||
    isExpJunior ||
    hasFresherInclusion ||
    entryLevelSynonymRegex.test(text.slice(0, 1000)) ||
    /\b(freshers?\s+(?:can\s+)?apply|for\s+freshers?|open\s+to\s+freshers?|(?:0\s*(?:[-–—]|\bto\b)\s*)?1\s*(?:years?|yrs?)|0\s*[-–—]\s*1\b|recent\s+graduates?|2026\s+batch|2025\s+batch|1\s*(?:year|yr))\b/i.test(text);
    isTitleJunior ||
    isExpJunior ||
    entryLevelSynonymRegex.test(text.slice(0, 1000)) ||
    /\b(freshers?\s+(?:can\s+)?apply|for\s+freshers?|open\s+to\s+freshers?|(?:0\s*(?:[-–—]|\bto\b)\s*)?1\s*(?:years?|yrs?)|0\s*[-–—]\s*1\b|recent\s+graduates?|2026\s+batch|2025\s+batch|1\s*(?:year|yr))\b/i.test(text);

  if (!hasEntrySynonymInText) {
    const explicitSeniorRolePattern =
      /\b(?:hiring|seeking|looking\s+for|opening\s+for|position\s+of|role\s+of)?\s*(?:an?|our)?\s*\b(senior\s+(?:software|full\s*stack|frontend|backend|python|java|web|data|devops|cloud|systems?|qa|application|platform|mobile)?\s*(?:engineer|developer|architect|programmer)|sr\.\s+(?:software|full\s*stack|frontend|backend|python|java|web|data|devops|cloud|systems?|qa|application|platform|mobile)?\s*(?:engineer|developer|architect|programmer)|tech\s+lead|team\s+lead|lead\s+(?:software|full\s*stack|frontend|backend|python|java|web|data|devops|cloud|systems?|qa|application|platform|mobile)?\s*(?:engineer|developer|architect|programmer)|principal\s+(?:engineer|developer|architect)|staff\s+(?:engineer|developer)|head\s+of\s+engineering|engineering\s+manager|solution\s+architect|solutions\s+architect|enterprise\s+architect)\b/i;

    const seniorRoleMatch = text.match(explicitSeniorRolePattern);
    if (seniorRoleMatch) {
      const matchedIndex = seniorRoleMatch.index || 0;
      const precedingText = text.slice(Math.max(0, matchedIndex - 60), matchedIndex);
      const isMentorshipContext =
        /\b(collaborat(?:e|ing)\s+(?:closely\s+|directly\s+)?with|work(?:ing)?\s+(?:closely\s+|directly\s+|collaboratively\s+)?(?:with|alongside)|mentor(?:ed)?\s+by|guidance\s+(?:of|from)|supervis(?:ed)?\s+by|supervision\s+of|report(?:ing)?\s+to|learn(?:ing)?\s+from|support(?:ing)?|shadow(?:ing)?|partner(?:ing)?\s+with|assist(?:ing)?|under\s+(?:the\s+)?(?:guidance\s+of\s+)?(?:our\s+)?)\b/i.test(
          precedingText
        );

      if (!isMentorshipContext) {
        const failureReason = 'Blocked: Requires senior experience';
        const reason = `Experience limit exceeded: Role requires senior-level seniority (detected: "${seniorRoleMatch[1]}"). Candidate is entry-level (0-1 year).`;
        return {
          isBlocked: true,
          isSenior: true,
          failureReason,
          reason,
          reasoning: `${failureReason}. Candidate profile is entry-level (0-1 years), but job demands senior seniority ("${seniorRoleMatch[1]}").`,
          matchedText: seniorRoleMatch[1],
          rule: 'senior role in text',
        };
      }
    }
  }

  return { isBlocked: false, failureReason: null, reason: null, reasoning: null };
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
    ...(masterProfile?.coreTechnicalSkills?.cloudAndDevOps || []),
    ...(masterProfile?.coreTechnicalSkills?.aiAndTooling || []),
  ];

  return `You are the strict Gatekeeper AI for the Resume Fit career optimization platform.
Your objective is to evaluate whether a Job Description is valid and eligible for an entry-level candidate following strict sequential checks.

CANDIDATE BACKGROUND:
- Total Experience: 0-1 years (Entry-Level / Fresher / Recent Graduate)
- Core Engineering Domains: ${targetFamilies.join(', ')}
- Eligible Primary Roles: ${primaryRoles.join(', ')}
- Eligible Crossover Roles: ${crossoverRoles.join(', ')}
- Core Technical Skills: ${skills.join(', ')}

TARGET JOB DESCRIPTION:
${wrappedXmlJd}

STRICT SEQUENTIAL GATEKEEPER EVALUATION RULES:
0. CONVERSATIONAL & MALFORMED PROMPT CHECK:
   - If text contains conversational prompt leakage, chat introductions, assistant inquiries, or tuning prompts ("Would you like any more clarity", "To fine-tune this further", "Should we lean more heavily", "Are there any specific shift timings"), INSTANTLY ABORT with:
     {"status": "ABORT", "failureReason": "Blocked: Malformed job description detected", "reason": "Blocked: Malformed job description detected. Extraneous chat prompts or conversational text found mixed into the input.", "reasoning": "Blocked: Malformed job description detected. Extraneous chat prompts or conversational text found mixed into the input."}
1. INVALID TEXT CHECK:
   - If text is meaningless, gibberish, empty, or lacks standard professional JD structure, INSTANTLY ABORT with:
     {"status": "ABORT", "failureReason": "Blocked: Invalid/insufficient technical content", "reason": "Invalid or meaningless Job Description detected. Please enter a valid professional job description.", "reasoning": "Blocked: Invalid/insufficient technical content. Text does not contain coherent job responsibilities or qualifications."}
2. FRESHER / EXPERIENCE LEVEL CHECK:
   - Candidate has 0-1 years experience (Entry-Level / Fresher / Recent Graduate, 2026 Batch).
   - Valid entry-level, fresher, and junior roles ("Junior Python Developer", "Fresher", "2026 batch", "entry level", "junior role", "0-1 years", "0–1", "1 year", "up to 1 year", "maximum 1 year", "fresh graduates", "entry-level with no experience", "junior role with 0-1 year") MUST BE APPROVED (PROCEED).
   - If the role strictly requires a conflicting graduation batch year (e.g., strictly 2025 batch graduates), INSTANTLY ABORT with:
     {"status": "ABORT", "failureReason": "Blocked: Batch year mismatch", "reason": "Blocked: Batch year mismatch. The role strictly requires 2025 batch graduates, which conflicts with your profile's graduation year.", "reasoning": "Blocked: Batch year mismatch. The role strictly requires 2025 batch graduates, which conflicts with your profile's graduation year."}
   - Mentorship or collaboration mentions ("working alongside senior engineers") are allowed.
   - Any experience range starting at 0 (e.g., "0 to 3 years", "0-2 years", "0–5 years", "0+ years") indicates freshers are eligible and MUST BE APPROVED (PROCEED).
   - If the role strictly requires experience starting above 0 with no fresher inclusion (e.g., "1-2 years", "2+ years", "2 to 3 years", "minimum 1 year experience where upper bound goes above 1", "3+ years", "5+ years", "mid-level"), INSTANTLY ABORT with:
     {"status": "ABORT", "failureReason": "Blocked: Experience level mismatch. The role requires experience greater than your entry-level threshold (0-1 year maximum).", "reason": "Blocked: Experience level mismatch. The role requires experience greater than your entry-level threshold (0-1 year maximum).", "reasoning": "Blocked: Experience level mismatch. The role requires experience greater than your entry-level threshold (0-1 year maximum)."}
   - If the role explicitly requires senior title seniority ("Senior Engineer", "Lead Developer", "Engineering Manager", "Architect"), INSTANTLY ABORT with:
     {"status": "ABORT", "failureReason": "Blocked: Requires senior experience", "reason": "Experience limit exceeded: Role requires senior-level seniority.", "reasoning": "Blocked: Requires senior experience. Candidate profile is entry-level (0-1 years), but job demands senior seniority."}
3. EXCLUSIVE INSTITUTION / COLLEGE TIER CHECK:
   - Scan for restrictive educational prerequisites such as "strictly from IIT or NIT", "Tier-1 colleges only", "IIT/BITS/NIT only", or premier institute restrictions.
   - Candidate holds a degree from SVCET (non-IIT/NIT).
   - If the job demands an exclusive institution tier (IIT/NIT/BITS/Tier-1 only) which the candidate does not possess, INSTANTLY ABORT with:
     {"status": "ABORT", "failureReason": "Blocked: Exclusive institution requirement detected", "reason": "Blocked: Exclusive institution requirement detected (e.g., IIT/NIT only) which does not match profile education.", "reasoning": "Blocked: Exclusive institution requirement detected (e.g., IIT/NIT only) which does not match profile education."}
4. INDUSTRY & ROLE TYPE BLOCKLIST (CRITICAL):
   - The role MUST belong to Computer Science, Software Engineering, Web Development, IT, Data/Analytics, or Applied AI.
   - Explicitly scan and reject non-IT roles, BPO positions, tele-calling, voice-advisory, sales, or customer service:
     {"status": "ABORT", "failureReason": "Blocked: Non-IT / BPO tele-calling role detected", "reason": "Mismatched role/industry: Target job is a non-IT / BPO / sales role.", "reasoning": "Blocked: Non-IT / BPO tele-calling role detected. Target job belongs to BPO, tele-calling, voice-advisory, or sales operations, outside candidate software/IT qualifications."}
   - If the JD belongs to an unsupported engineering or non-technical domain (Mechanical, Civil, Chemical, Medical, Finance, Hospitality, Craft Trades), INSTANTLY ABORT with:
     {"status": "ABORT", "failureReason": "Blocked: Non-IT role detected", "reason": "Domain Mismatch: The required tools and skills belong to an unsupported engineering/business domain outside Computer Science & IT.", "reasoning": "Blocked: Non-IT role detected. Domain belongs outside Computer Science and IT."}
5. TECH DOMAIN & LANGUAGE TAXONOMY CHECK:
   - Only after passing the above filters, verify that the JD contains core software engineering requirements (programming languages, frameworks, developer tools) matching candidate proficiencies.
   - If completely unrelated or lacking developer tech, INSTANTLY ABORT with:
     {"status": "ABORT", "failureReason": "Blocked: Invalid/insufficient technical content", "reason": "Role mismatch: Job description does not align with candidate eligible job roles or technical proficiencies.", "reasoning": "Blocked: Invalid/insufficient technical content. Job description does not contain required software engineering technologies."}

OUTPUT FORMAT REQUIREMENTS:
- You must return ONLY a valid JSON object matching the formats above.
- Do NOT wrap output in markdown code blocks (no \`\`\`json). Do NOT add extra conversational commentary.`;
}

/**
 * Deterministic rule-based Gatekeeper verification following strict sequential checks:
 * 1. Invalid Text Check: Gibberish, empty strings, non-meaningful text, text length < 20 characters.
 * 2. Fresher / Experience Level Check: Comprehensive entry-level synonym matching vs senior experience blocking.
 * 3. Exclusive Institution / College Tier Check: Rejects restrictive educational prerequisites (e.g. IIT/NIT only).
 * 4. Industry & Role Type Blocklist (CRITICAL): Rejects non-IT roles, BPO, tele-calling, voice-advisory, sales, non-technical domains.
 * 5. Tech Domain & Language Taxonomy Check: Programming languages, frameworks, developer tools validation.
 *
 * @param {string} cleanedJdText - Sanitized plain text JD
 * @param {Object} masterProfile - Ground-truth Master Profile
 * @returns {{
 *   status: 'PROCEED' | 'ABORT',
 *   reason: string,
 *   failureReason?: string | null,
 *   reasoning?: string,
 *   detectedDomain?: string,
 *   matchedTools?: string[]
 * }}
 */
export function evaluateGatekeeperRules(cleanedJdText, masterProfile, options = {}) {
  // ====================================================================
  // PRE-PROCESSING: Conversational & Prompt Contamination Filter
  // ====================================================================
  let textToEvaluate = cleanedJdText;
  if (options.stripConversationalArtifacts) {
    textToEvaluate = stripConversationalArtifacts(cleanedJdText);
  } else {
    const contamination = detectConversationalContamination(cleanedJdText);
    if (contamination.hasContamination) {
      const failureReason = 'Blocked: Malformed job description detected';
      const reason = 'Blocked: Malformed job description detected. Extraneous chat prompts or conversational text found mixed into the input.';
      return {
        status: 'ABORT',
        failureReason,
        reason,
        reasoning: reason,
      };
    }
  }

  // ====================================================================
  // STEP 1: Specific Eligibility & Constraint Checks (Bypasses Generic Text Validation)
  // When a specific failure like "Batch year mismatch" or "Exclusive institution mismatch"
  // occurs, it bypasses the generic text validation check entirely and passes the exact
  // custom failureReason straight to the UI banner without replacing it with
  // "Invalid/insufficient technical content".
  // ====================================================================
  // 1a. Restrictive Batch Year Check:
  const batchCheck = evaluateBatchYearEligibility(textToEvaluate, masterProfile);
  if (batchCheck.isBlocked) {
    return {
      status: 'ABORT',
      failureReason: batchCheck.failureReason,
      reason: batchCheck.reason,
      reasoning: batchCheck.reasoning,
    };
  }

  // 1b. Exclusive Institution / College Tier Check:
  const institutionTierCheck = evaluateExclusiveInstitutionTier(textToEvaluate, masterProfile);
  if (institutionTierCheck.isBlocked) {
    return {
      status: 'ABORT',
      failureReason: institutionTierCheck.failureReason,
      reason: institutionTierCheck.reason,
      reasoning: institutionTierCheck.reasoning,
    };
  }

  // 1c. Strict Experience Threshold & Seniority Check:
  // Evaluates strict 1-year ceiling and senior roles early so exact failureReasons
  // bypass generic text validation or character-count checks.
  const earlyExpCheck = evaluateExperienceLevel(textToEvaluate);
  if (earlyExpCheck.isBlocked) {
    return {
      status: 'ABORT',
      failureReason: earlyExpCheck.failureReason,
      reason: earlyExpCheck.reason,
      reasoning: earlyExpCheck.reasoning,
    };
  }

  // ====================================================================
  // STEP 2: Invalid Text Check (Gibberish, empty strings, word count)
  // ====================================================================
  const sanity = validateJdSanity(textToEvaluate, { stripConversationalArtifacts: true });
  if (!sanity.isValid) {
    const failureReason = sanity.failureReason || 'Blocked: Invalid/insufficient technical content';
    return {
      status: 'ABORT',
      failureReason,
      reason: sanity.reason,
      reasoning: `${failureReason} - ${sanity.reason}`,
    };
  }

  const text = textToEvaluate.toLowerCase();

  // Extract explicit Job Title / Position line if present
  const titleLineMatch = textToEvaluate.match(
    /(?:job\s+title|position\s+title|role\s+title|job\s+role|title|position|role)\s*:\s*([^\n\r]+)/i
  );
  const titleString = titleLineMatch ? titleLineMatch[1].replace(/^[-*•–—]\s*/, '').trim() : '';
  const titleLower = titleString.toLowerCase();

  // Extract explicit Experience line if present
  const expLineMatch = textToEvaluate.match(
    /(?:experience|work\s+experience|exp|eligibility)\s*:\s*([^\n\r]+)/i
  );
  const expString = expLineMatch ? expLineMatch[1].replace(/^[-*•–—]\s*/, '').trim() : '';

  // ====================================================================
  // STEP 3: Fresher / Experience Level Check
  // Fresher-Inclusive Experience & Seniority Enforcement
  // ALLOW: Any experience range starting at 0 ("0-2 years", "0 to 3 years", "0–5 years", "0+ years", "0-1 year"),
  // "0 years", "fresher", "fresh graduates", "entry-level", or any role requiring <= 1 year.
  // BLOCK STRICTLY: Roles that strictly require experience starting above 0 with no fresher inclusion ("1-2 years", "2+ years", "2 to 3 years", etc.).
  // Returns exact failureReason: "Blocked: Experience level mismatch. The role requires experience greater than your entry-level threshold (0-1 year maximum)."
  // ====================================================================
  const expCheck = evaluateExperienceLevel(textToEvaluate);
  if (expCheck.isBlocked) {
    return {
      status: 'ABORT',
      failureReason: expCheck.failureReason,
      reason: expCheck.reason,
      reasoning: expCheck.reasoning,
    };
  }

  // ====================================================================
  // STEP 4: Industry & Role Type Blocklist (CRITICAL)
  // Scans and rejects non-IT roles, BPO positions, tele-calling, voice-advisory,
  // sales, customer service, and non-technical engineering/trade domains.
  // ====================================================================
  // 3a. BPO, Tele-calling, Voice-Advisory, Customer Care, Telesales & Sales
  const bpoAndTelecallingPatterns = [
    { regex: /\b(tele[- ]?calling|tele[- ]?caller|telemarketer|telemarketing)\b/i, label: 'Tele-calling / Telemarketing' },
    { regex: /\b(voice[- ]advisory|voice[- ]advisor|voice[- ]process|non[- ]voice[- ]process|voice[- ]and[- ]non[- ]voice)\b/i, label: 'Voice / Non-Voice Advisory' },
    { regex: /\b(bpo\b|bpo\s+operations|business\s+process\s+outsourcing|call\s+center|contact\s+center)\b/i, label: 'BPO / Call Center' },
    { regex: /\b(inbound\s+calling|outbound\s+calling|telesales|cold\s+calling)\b/i, label: 'Inbound / Outbound Calling' },
    { regex: /\b(customer\s+support\s+executive|customer\s+care\s+executive|customer\s+service\s+representative|client\s+support\s+executive)\b/i, label: 'BPO Customer Support' },
    { regex: /\b(debt\s+collection|collections\s+agent|collections\s+executive)\b/i, label: 'Debt Collection / BPO' },
    { regex: /\b(sales\s+executive|sales\s+representative|direct\s+sales|field\s+sales|retail\s+sales|store\s+cashier)\b/i, label: 'Sales / Retail' },
    { regex: /\b(business\s+development\s+executive|bde\b|inside\s+sales\s+executive)\b/i, label: 'Sales / Business Development' },
    { regex: /\b(data\s+entry\s+operator|data\s+entry\s+clerk|typist|receptionist|front\s+desk\s+executive)\b/i, label: 'Clerical / Data Entry' },
    { regex: /\b(real\s+estate\s+agent|insurance\s+agent|insurance\s+sales)\b/i, label: 'Non-IT Insurance / Real Estate Sales' },
  ];

  for (const { regex, label } of bpoAndTelecallingPatterns) {
    if (regex.test(titleLower) || regex.test(text)) {
      const failureReason = 'Blocked: Non-IT / BPO tele-calling role detected';
      const reason = `Mismatched role/industry: Target job is a non-IT / BPO / sales role (${label}), which is outside candidate's software/IT qualifications.`;
      return {
        status: 'ABORT',
        failureReason,
        reason,
        reasoning: `${failureReason}. Detected non-IT / BPO operational domain ("${label}"). Candidate qualifications are software engineering and IT.`,
      };
    }
  }

  // 3b. Dynamic Domain & Non-CS/IT Engineering Vectors (Mechanical, Civil, Chemical, Medical, Finance)
  const domainMismatch = inspectDomainToolClusters(textToEvaluate);
  if (domainMismatch.isDomainMismatch) {
    const detectedDomain = domainMismatch.domain || 'Non-IT Domain';
    const failureReason = `Blocked: Non-IT role detected: ${detectedDomain}`;
    const reason = domainMismatch.reason || 'Domain Mismatch: The required tools and skills belong to an unsupported engineering/business domain outside Computer Science & IT.';
    return {
      status: 'ABORT',
      failureReason,
      reason,
      reasoning: `${failureReason}. The required tools and skills (${domainMismatch.matchedTools?.slice(0, 4).join(', ') || 'unsupported'}) belong to an unsupported domain outside Computer Science & IT.`,
      detectedDomain: domainMismatch.domain,
      matchedTools: domainMismatch.matchedTools,
    };
  }

  // 3c. Unrelated Hospitality / Trades Fallback
  const unrelatedIndustryPatterns = [
    { regex: /\b(culinary arts|executive chef|pastry chef|food beverage server|bartender|head chef|line cook)\b/i, label: 'Culinary / Hospitality' },
    { regex: /\b(carpenter|welder fabricator|plumber|pipe fitter)\b/i, label: 'Craft Trades' },
  ];

  for (const { regex, label } of unrelatedIndustryPatterns) {
    if (regex.test(text)) {
      const failureReason = `Blocked: Non-IT role detected: ${label}`;
      const reason = `Mismatched industry: Target job belongs to ${label}, which is outside candidate's software/IT qualifications.`;
      return {
        status: 'ABORT',
        failureReason,
        reason,
        reasoning: `${failureReason}. Target role belongs to ${label}, which does not match candidate's software/IT degree and skills.`,
      };
    }
  }

  // ====================================================================
  // STEP 5: Tech Domain & Language Taxonomy Check
  // Validates core tech requirements (programming languages, frameworks, developer tools)
  // and checks alignment with candidate's technical profile.
  // CRITICAL: Ensure tech taxonomy and skill matching *only* run against official JD body!
  // ====================================================================
  const officialJdBody = stripConversationalArtifacts(textToEvaluate);
  const taxonomyText = officialJdBody.toLowerCase();

  // Core Software Engineering Technical Taxonomy
  const CORE_TECH_TAXONOMY = [
    // Languages
    'python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'c', 'golang', 'rust', 'php', 'ruby',
    'kotlin', 'swift', 'dart', 'scala', 'r', 'sql', 'html', 'css', 'bash', 'shell',
    // Frameworks & Libraries
    'react', 'angular', 'vue', 'next.js', 'nuxt', 'node.js', 'express', 'django', 'flask',
    'fastapi', 'spring', 'spring boot', 'asp.net', '.net', 'laravel', 'rails', 'tailwind',
    'bootstrap', 'redux', 'graphql', 'rest api', 'rest apis', 'restful', 'api', 'apis',
    // Data & AI
    'pandas', 'scikit-learn', 'sklearn', 'numpy', 'nlp', 'natural language processing', 'machine learning',
    'data analysis', 'data analytics', 'data science',
    // Databases
    'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'sqlite', 'oracle', 'cassandra',
    'dynamodb', 'nosql', 'elasticsearch',
    // Developer Tools & Cloud
    'git', 'github', 'gitlab', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'ci/cd',
    'jenkins', 'linux', 'unix', 'microservices', 'agile', 'scrum', 'jira', 'postman', 'jwt',
    'render', 'vs code'
  ];

  const matchedTechTerms = [];
  for (const tech of CORE_TECH_TAXONOMY) {
    if (tech.length <= 3) {
      if (new RegExp(`(?:^|[\\s,;:.()/\\[\\]-])${tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[\\s,;:.()/\\[\\]-]|$|s\\b)`, 'i').test(taxonomyText)) {
        matchedTechTerms.push(tech);
      }
    } else if (taxonomyText.includes(tech)) {
      matchedTechTerms.push(tech);
    }
  }

  // Check candidate eligible roles & candidate skills
  const eligibleRoles = [
    ...(masterProfile?.eligibleJobRoles?.primaryRoles || []),
    ...(masterProfile?.eligibleJobRoles?.crossoverRoles || []),
    ...(masterProfile?.eligibleJobRoles?.targetFamilies || []),
    'software engineer', 'developer', 'programmer', 'web developer', 'full stack', 'frontend', 'backend',
    'python', 'data analyst', 'analytics engineer', 'nlp', 'ai', 'machine learning', 'junior software engineer'
  ].map((r) => r.toLowerCase());

  const hasRoleMatch = eligibleRoles.some((role) => taxonomyText.includes(role));

  const candidateSkills = [
    ...(masterProfile?.coreTechnicalSkills?.languages || []),
    ...(masterProfile?.coreTechnicalSkills?.frontend || []),
    ...(masterProfile?.coreTechnicalSkills?.backend || []),
    ...(masterProfile?.coreTechnicalSkills?.databases || []),
    ...(masterProfile?.coreTechnicalSkills?.cloudAndDevOps || []),
    ...(masterProfile?.coreTechnicalSkills?.aiAndTooling || []),
  ].map((s) => s.toLowerCase());

  const hasCandidateSkillMatch = candidateSkills.some((skill) => {
    if (skill.length <= 3) {
      return new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(taxonomyText);
    }
    return taxonomyText.includes(skill);
  });

  // If the JD contains no recognized software technology OR has zero role & skill match with candidate profile
  if (matchedTechTerms.length === 0 || (!hasRoleMatch && !hasCandidateSkillMatch)) {
    const failureReason = 'Blocked: Invalid/insufficient technical content';
    const reason = 'Role mismatch: Job description does not align with candidate eligible job roles or technical proficiencies.';
    return {
      status: 'ABORT',
      failureReason,
      reason,
      reasoning: `${failureReason}. The job description does not contain required software engineering technologies (programming languages, frameworks, developer tools) matching candidate's technical profile.`,
    };
  }

  return {
    status: 'PROCEED',
    failureReason: null,
    reason: 'Valid entry-level matching role approved.',
    reasoning: 'Valid entry-level matching role approved. Meets entry-level experience requirements and aligns with candidate technical proficiencies.',
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
 * @param {number} [params.timeoutMs=15000] - Timeout in milliseconds (default: 15000ms)
 * @returns {Promise<{ status: 'PROCEED' | 'ABORT', reason: string, engine: string }>}
 */
export async function evaluateGatekeeper({
  wrappedXmlJd,
  cleanedJdText,
  masterProfile,
  model = DEFAULT_MODEL,
  baseUrl = OLLAMA_BASE_URL,
  timeoutMs = 15000,
  stripConversationalArtifacts = false,
}) {
  // First evaluate deterministic rules for instant high-precision guardrail
  const ruleResult = evaluateGatekeeperRules(cleanedJdText, masterProfile, { stripConversationalArtifacts });

  // If deterministic rules already flagged a hard abort (e.g. Civil Engineer or 5+ years experience), enforce it immediately
  if (ruleResult.status === 'ABORT') {
    return {
      status: 'ABORT',
      reason: ruleResult.reason,
      failureReason: ruleResult.failureReason || 'Blocked by Gatekeeper Rules',
      reasoning: ruleResult.reasoning || ruleResult.reason,
      detectedDomain: ruleResult.detectedDomain,
      matchedTools: ruleResult.matchedTools,
      engine: 'Deterministic Gatekeeper Rules',
    };
  }

  // Attempt Ollama AI evaluation if connection is alive
  const cleanBaseUrl = (baseUrl || OLLAMA_BASE_URL).replace(/\/+$/, '');

  try {
    const prompt = buildGatekeeperPrompt({ masterProfile, wrappedXmlJd });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${cleanBaseUrl}/api/generate`, {
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
          options: {
            temperature: 0.1,
            num_predict: 512, // Ensure ample token room (>= 512) for complete evaluation reasons
          },
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const result = await response.json();
        const rawText = extractOllamaResponseText(result);
        if (rawText) {
          const parsed = safeParseJson(rawText);
          if (parsed && (parsed.status === 'ABORT' || parsed.status === 'PROCEED')) {
            const isAbort = parsed.status === 'ABORT';
            return {
              status: parsed.status,
              reason: parsed.reason || (isAbort ? 'Role blocked by Gatekeeper AI.' : 'Valid entry-level matching role approved.'),
              failureReason: isAbort ? (parsed.failureReason || 'Blocked by Gatekeeper AI') : null,
              reasoning: parsed.reasoning || parsed.reason || (isAbort ? 'Role blocked by Gatekeeper AI.' : 'Valid entry-level matching role approved.'),
              engine: `Ollama AI (${model})`,
            };
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    // If Ollama is offline or timed out, rule-based result is used
  }

  // Default to verified rule result
  return {
    status: ruleResult.status,
    reason: ruleResult.reason,
    failureReason: ruleResult.failureReason,
    reasoning: ruleResult.reasoning,
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
  // Strip conversational artifacts to ensure baseline scoring only runs on official JD body
  const officialJdBody = stripConversationalArtifacts(cleanedJdText || '');

  // Hard guard: non-CS/IT engineering or BPO/sales roles produce no baseline score
  const domainMismatch = inspectDomainToolClusters(officialJdBody);
  if (domainMismatch.isDomainMismatch) {
    return null;
  }

  const text = officialJdBody.toLowerCase();
  if (/\b(tele[- ]?calling|voice[- ]process|bpo\b|customer\s+support\s+executive|telesales|sales\s+executive)\b/i.test(text)) {
    return null;
  }

  // Hard guard: Exclusive institution requirement not met by candidate
  const institutionTierCheck = evaluateExclusiveInstitutionTier(officialJdBody, masterProfile);
  if (institutionTierCheck.isBlocked) {
    return null;
  }

  // Hard guard: Restrictive batch year mismatch
  const batchCheck = evaluateBatchYearEligibility(officialJdBody, masterProfile);
  if (batchCheck.isBlocked) {
    return null;
  }

  // Hard guard: Experience level mismatch (> 1 year) or Senior role produces no baseline score
  const expCheck = evaluateExperienceLevel(officialJdBody);
  if (expCheck.isBlocked) {
    return null;
  }

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
      const extractedTech = extractTechnicalRequirements(officialJdBody);
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

  // Check standard SDE / Software Engineer entry-level role matching (crossover role match: 35 pts)
  if (domainRoleScore < 35) {
    const isSdeOrSoftwareEngineer =
      /\b(software\s+development\s+engineer|sde(?:[- ]?1)?|software\s+engineer|software\s+developer|trainee(?:\s+engineer)?)\b/i.test(text);
    const hasJuniorSdeCrossover = crossoverRoles.some((r) => r.includes('software engineer') || r.includes('developer'));
    if (isSdeOrSoftwareEngineer && hasJuniorSdeCrossover) {
      domainRoleScore = 35;
      matchedRoles.push('Software Engineer / SDE-1');
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
  timeoutMs = 15000,
  stripConversationalArtifacts: stripArtifacts = false,
}) {
  // Pre-Pipeline Check: Specific Hard-Stop Guardrails (Batch Year Mismatch, Exclusive Institution)
  // When a specific constraint is detected in the input, bypass generic text validation
  // and word count checks entirely, delivering the exact custom failureReason straight to the UI banner.
  const batchCheckEarly = evaluateBatchYearEligibility(rawJdText, masterProfile);
  if (batchCheckEarly.isBlocked) {
    return {
      success: false,
      status: 'ABORT',
      failureReason: batchCheckEarly.failureReason,
      reason: batchCheckEarly.reason,
      reasoning: batchCheckEarly.reasoning,
      engine: 'Deterministic Gatekeeper Rules',
    };
  }

  const institutionCheckEarly = evaluateExclusiveInstitutionTier(rawJdText, masterProfile);
  if (institutionCheckEarly.isBlocked) {
    return {
      success: false,
      status: 'ABORT',
      failureReason: institutionCheckEarly.failureReason,
      reason: institutionCheckEarly.reason,
      reasoning: institutionCheckEarly.reasoning,
      engine: 'Deterministic Gatekeeper Rules',
    };
  }

  // Step 1: Clean & Sanitize
  let sanitized;
  try {
    sanitized = sanitizeJobDescription(rawJdText, { stripConversationalArtifacts: stripArtifacts });
  } catch (err) {
    const isMalformed =
      err.failureReason === 'Blocked: Malformed job description detected' ||
      err.message.includes('Malformed job description detected');
    const failureReason = err.failureReason
      ? err.failureReason
      : isMalformed
      ? 'Blocked: Malformed job description detected'
      : 'Blocked: Invalid/insufficient technical content';
    return {
      success: false,
      status: 'ABORT',
      failureReason,
      reason: err.message,
      reasoning: isMalformed ? err.message : `${failureReason} - ${err.message}`,
      engine: 'Deterministic Gatekeeper Rules (Sanitization)',
    };
  }

  // Step 2: Gatekeeper Evaluation
  const gatekeeperResult = await evaluateGatekeeper({
    wrappedXmlJd: sanitized.wrappedXml,
    cleanedJdText: sanitized.cleanedText,
    masterProfile,
    model,
    baseUrl,
    timeoutMs,
    stripConversationalArtifacts: stripArtifacts,
  });

  if (gatekeeperResult.status === 'ABORT') {
    return {
      success: false,
      status: 'ABORT',
      failureReason: gatekeeperResult.failureReason || 'Blocked: Role blocked by Gatekeeper',
      reason: gatekeeperResult.reason,
      reasoning: gatekeeperResult.reasoning || gatekeeperResult.reason,
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
    failureReason: null,
    reason: gatekeeperResult.reason,
    reasoning: gatekeeperResult.reasoning || gatekeeperResult.reason,
    wordCount: sanitized.wordCount,
    cleanedText: sanitized.cleanedText,
    wrappedXml: sanitized.wrappedXml,
    baselineScore,
    engine: gatekeeperResult.engine,
  };
}

export default {
  CONVERSATIONAL_ARTIFACT_PATTERNS,
  detectConversationalContamination,
  stripConversationalArtifacts,
  EXCLUSIVE_INSTITUTION_PATTERNS,
  detectExclusiveInstitutionRequirement,
  candidateMatchesInstitutionTier,
  evaluateExclusiveInstitutionTier,
  RESTRICTIVE_BATCH_PATTERNS,
  getCandidateGraduationYear,
  evaluateBatchYearEligibility,
  EXACT_EXPERIENCE_MISMATCH_FAILURE_REASON,
  evaluateExperienceLevel,
  isStandardStructuredBulletedJd,
  validateJdSanity,
  sanitizeJobDescription,
  buildGatekeeperPrompt,
  evaluateGatekeeperRules,
  evaluateGatekeeper,
  calculateBaselineScore,
  evaluateJobDescriptionPipeline,
};
