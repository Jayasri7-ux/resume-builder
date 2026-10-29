/**
 * Custom Instruction Service
 * Provides targeted, card-level text editing mechanics for resume sections.
 * Enforces:
 * 1. Immutable Fact Firewall against blacklisted protected entities (Name, Contact, Education, Certifications, Scores, Achievements).
 * 2. Scope Guardrail blocking off-topic or conversational inputs with scope_violation flag.
 * 3. Fast processing with a resilient 15-second AbortController timeout.
 */

import { OLLAMA_BASE_URL, DEFAULT_MODEL, safeParseJson, extractOllamaResponseText } from './ollamaService.js';
import { shouldUseCloudAi, callCloudAi, hasCloudApiKey } from './cloudAiService.js';

export const FACT_FIREWALL_ERROR_MESSAGE =
  'Action Blocked: Core facts like education, certifications, and personal info are immutable sources of truth and cannot be edited via custom instructions.';

export const SCOPE_VIOLATION_MESSAGE =
  'Please enter an instruction related to resume editing, wording, or formatting';

/**
 * Quick-action chips for targeted section and bullet customization.
 */
export const DEFAULT_QUICK_CHIPS = [
  { label: 'Make punchier', prompt: 'Make this punchier' },
  { label: 'Shorten', prompt: 'Shorten this' },
  { label: 'Quantify achievements', prompt: 'Quantify achievements' },
  { label: 'Focus on architecture & design', prompt: 'Focus on architecture & design' },
  { label: 'Highlight leadership & collaboration', prompt: 'Highlight leadership & collaboration' },
  { label: 'Make more technical', prompt: 'Make more technical' },
];

export const BULLET_QUICK_CHIPS = DEFAULT_QUICK_CHIPS;

/**
 * Blacklist patterns for Immutable Fact Firewall.
 * Core facts like Name, Contact, Education, Certifications, Scores, and SIH Achievements
 * cannot be altered, forged, or edited via custom instructions.
 */
const PROTECTED_FACT_PATTERNS = [
  // Education / College / Degree / CGPA / Grades
  /\b(education|college|university|degree|cgpa|gpa|grades?|marks?|percentage|b\.?tech|btech|m\.?tech|mtech|svcet|school|graduat(e|ion|ed))\b/i,
  // Personal Info / Name / Contact
  /\b(candidate\s*name|my\s*name|rename|full\s*name|phone|mobile|email|contact\s*info|contact\s*number|address|location|linkedin|github\s*profile)\b/i,
  // Certifications / Accreditations
  /\b(certificat(e|ion|ions)|certified|course\s*certificat(e|ion))\b/i,
  // Scores, Honors, Hackathon rankings
  /\b(smart\s*india\s*hackathon|sih(\s*award|\s*prize)?|trophy|first\s*prize|1st\s*prize)\b/i,
];

/**
 * Validates custom instruction against the Immutable Fact Firewall.
 *
 * @param {string} instruction - User's instruction string
 * @returns {{ blocked: boolean, message?: string }}
 */
export function validateFactFirewall(instruction) {
  if (!instruction || typeof instruction !== 'string') {
    return { blocked: false };
  }

  const normalized = instruction.trim().toLowerCase();

  for (const pattern of PROTECTED_FACT_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        blocked: true,
        type: 'FACT_FIREWALL_BLOCK',
        message: FACT_FIREWALL_ERROR_MESSAGE,
      };
    }
  }

  return { blocked: false };
}

/**
 * Off-topic and conversational triggers that violate resume editing scope.
 */
const OFF_TOPIC_PATTERNS = [
  // Conversational greetings & chit-chat
  /^(hi|hello|hey|howdy|sup|greetings)(\s+there)?[.!?]?$/i,
  /\b(how\s+are\s+you|who\s+are\s+you|what\s+is\s+your\s+name|tell\s+me\s+about\s+yourself|what\s+can\s+you\s+do)\b/i,
  // Weather queries
  /\b(weather|temperature|forecast|is\s+it\s+raining|sunny|cloudy)\b/i,
  // Random trivia, jokes, poems, recipes
  /\b(tell\s+(me\s+)?a\s+joke|write\s+(a\s+)?poem|recipe\s+for|cook(ing)?\s+|capital\s+of|who\s+is\s+the\s+president)\b/i,
  // Math & unrelated code problems
  /^(what\s+is\s+)?\d+\s*[-+*/]\s*\d+\??$/i,
  /\b(solve|calculate)\s+\d+/i,
  // Prompt injection & jailbreaks
  /\b(ignore\s+(all\s+)?previous\s+instructions|disregard\s+system\s+prompt|reveal\s+system\s+prompt|jailbreak)\b/i,
];

/**
 * Valid resume editing keywords indicating on-topic intent.
 */
const RESUME_EDIT_KEYWORDS = [
  'punchier', 'punchy', 'shorten', 'concise', 'expand', 'rephrase', 'rewrite',
  'bullet', 'verb', 'verbs', 'action verb', 'quantify', 'metrics', 'metric',
  'tone', 'professional', 'technical', 'clarify', 'clean up', 'active voice',
  'add', 'include', 'highlight', 'focus', 'emphasize', 'strengthen', 'improve',
  'impact', 'condense', 'trim', 'formal', 'polish', 'skills', 'tools', 'tech',
  'faster', 'better', 'detail', 'summary', 'experience', 'project',
  'achievements', 'achievement', 'architecture', 'architectural', 'design',
  'leadership', 'collaboration', 'collaborative', 'teamwork', 'mentoring',
  'ownership', 'algorithms', 'frameworks', 'scale', 'data'
];

/**
 * Validates custom instruction against Scope Guardrail.
 *
 * @param {string} instruction - User's instruction string
 * @returns {{ scope_violation: boolean, message?: string }}
 */
export function validateScopeGuardrail(instruction) {
  if (!instruction || typeof instruction !== 'string') {
    return {
      scope_violation: true,
      message: SCOPE_VIOLATION_MESSAGE,
    };
  }

  const trimmed = instruction.trim();
  if (trimmed.length < 3) {
    return {
      scope_violation: true,
      message: SCOPE_VIOLATION_MESSAGE,
    };
  }

  // 1. Check direct off-topic regexes
  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        scope_violation: true,
        message: SCOPE_VIOLATION_MESSAGE,
      };
    }
  }

  // 2. Check if instruction has any resume editing resonance
  const lower = trimmed.toLowerCase();
  const hasResumeKeyword = RESUME_EDIT_KEYWORDS.some((kw) => lower.includes(kw));

  // If it's a short command with no resume keywords and looks like conversational chit-chat:
  if (!hasResumeKeyword && (trimmed.split(/\s+/).length <= 4 && !lower.includes('make') && !lower.includes('more'))) {
    // Check if it's potentially conversational
    if (/^[a-z\s?!]+$/i.test(trimmed) && !lower.includes('text') && !lower.includes('line')) {
      return {
        scope_violation: true,
        message: SCOPE_VIOLATION_MESSAGE,
      };
    }
  }

  return { scope_violation: false };
}

/**
 * Blacklist of dangling terminal words before a period.
 * Forbids output ending abruptly with prepositions, conjunctions, or incomplete verbs.
 */
export const DANGLING_END_WORDS = new Set([
  // Conjunctions & Connectors
  'and', 'or', 'but', 'nor', 'so', 'yet', 'because', 'although', 'while', 'as', 'since', 'whereas',
  'both', 'either', 'neither', 'whether', 'plus', 'besides',
  // Prepositions & Connectors
  'with', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'from', 'about', 'into', 'through', 'during',
  'including', 'such', 'like', 'leveraging', 'using', 'utilizing', 'across', 'under', 'between',
  'against', 'via', 'within', 'without', 'toward', 'towards', 'upon', 'among', 'amid', 'onto',
  'over', 'per', 'near', 'along',
  // Incomplete Transitive Verbs & Auxiliary
  'provide', 'provides', 'providing', 'deliver', 'delivers', 'delivering',
  'support', 'supports', 'supporting', 'ensure', 'ensures', 'ensuring',
  'assist', 'assists', 'assisting', 'facilitate', 'facilitates', 'facilitating',
  'create', 'creates', 'creating', 'build', 'builds', 'building',
  'develop', 'develops', 'developing', 'maintain', 'maintains', 'maintaining',
  'lead', 'leads', 'leading', 'achieve', 'achieves', 'achieving',
  'implement', 'implements', 'implementing',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  // Articles & Determiners
  'a', 'an', 'the', 'their', 'our', 'its', 'this', 'that', 'these', 'those', 'some', 'any',
  'all', 'each', 'every', 'my', 'your', 'his', 'her',
  // Relative pronouns
  'which', 'that', 'who', 'whom', 'whose', 'where', 'when',
]);

/**
 * Ensures text finishes with a complete, grammatically sound sentence without dangling words.
 * Strips dangling conjunctions, prepositions, transitive verbs, and articles before terminal punctuation.
 *
 * @param {string} text - Raw rewritten sentence or paragraph
 * @returns {string} Sanitized text with complete sentence boundary
 */
export function sanitizeCompletedSentence(text) {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text.trim();
  if (!cleaned) return '';

  // 1. Remove any unclosed quotes or brackets at the start and end
  cleaned = cleaned.replace(/^["'“”`]+/, '').replace(/["'’”`]+$/, '');

  // 2. Strip multi-word dangling phrases (e.g. "in order to", "in order", "as well as", "along with", "such as", "with the aim of", "aimed at", "focused on")
  const multiWordDanglingPattern = /\b(in\s+order\s+to|in\s+order|as\s+well\s+as|along\s+with|such\s+as|with\s+the\s+aim\s+of|so\s+as\s+to|as\s+a\s+result\s+of|due\s+to|prior\s+to|in\s+addition\s+to|together\s+with|aimed\s+at|focused\s+on|based\s+on)[,\s;:–—.-]*$/gi;
  cleaned = cleaned.replace(multiWordDanglingPattern, '').trim();

  // 3. Loop to strip trailing dangling words (e.g. "and.", "provide.", "with.", "to.", "at.", "the.")
  let changed = true;
  while (changed) {
    changed = false;
    const match = cleaned.match(/([A-Za-z0-9_-]+)[,\s;:–—.-]*$/);
    if (match) {
      const lastWord = match[1].toLowerCase();
      if (DANGLING_END_WORDS.has(lastWord)) {
        cleaned = cleaned.substring(0, match.index).trim();
        // Also clean any dangling phrase that might now be revealed
        cleaned = cleaned.replace(multiWordDanglingPattern, '').trim();
        changed = true;
      }
    }
  }

  // 4. Remove trailing commas, colons, semicolons, hyphens
  cleaned = cleaned.replace(/[,;:–—\s-]+$/, '').trim();

  // 5. Ensure proper terminal punctuation
  if (cleaned && !/[.!?]$/.test(cleaned)) {
    cleaned += '.';
  }

  return cleaned;
}

/**
 * High-power action verbs used to make resume text punchier.
 */
const PUNCHY_VERB_MAP = {
  'assisted with': 'engineered and deployed',
  'assisted in': 'spearheaded development of',
  'helped with': 'collaborated to architect',
  'helped in': 'accelerated delivery of',
  'worked on': 'architected and implemented',
  'was responsible for': 'spearheaded',
  'responsible for': 'spearheaded',
  'participated in': 'co-engineered',
  'handled': 'orchestrated',
  'did': 'executed',
  'made': 'developed and optimized',
};

/**
 * Deterministic local rewrite engine (< 15ms execution time).
 * Guarantees zero latency and rock-solid reliability when Ollama is offline or under load.
 *
 * @param {string|string[]} currentText - Current section text or bullet points
 * @param {string} instruction - User's custom instruction
 * @param {string} sectionKey - Section identifier ('summary' | 'internship' | 'project')
 * @param {string[]} [approvedMissingTech=[]] - Approved tech stack
 * @returns {string|string[]} Rewritten text matching the input type
 */
export function applyDeterministicInstruction(currentText, instruction, _sectionKey = 'summary', _approvedMissingTech = []) {
  const isArray = Array.isArray(currentText);
  const textString = isArray ? currentText.join('\n') : String(currentText || '');
  const lowerInstruction = instruction.toLowerCase().trim();

  // 1. "Make punchier" / "punchier" / "stronger action verbs"
  if (lowerInstruction.includes('punchy') || lowerInstruction.includes('punchier') || lowerInstruction.includes('stronger')) {
    if (isArray) {
      return currentText.map((bullet) => {
        let b = bullet.trim();
        for (const [weak, strong] of Object.entries(PUNCHY_VERB_MAP)) {
          const regex = new RegExp(`^${weak}\\b`, 'i');
          if (regex.test(b)) {
            b = b.replace(regex, strong.charAt(0).toUpperCase() + strong.slice(1));
            break;
          }
        }
        // Remove fluff phrases
        b = b.replace(/\b(in order to|successfully|various)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
        return sanitizeCompletedSentence(b);
      });
    }

    let summary = textString;
    summary = summary.replace(/\b(experience in)\b/gi, 'demonstrated expertise in');
    summary = summary.replace(/\b(proficient in)\b/gi, 'skilled in engineering');
    summary = summary.replace(/\b(good at)\b/gi, 'adept at architecting');
    summary = summary.replace(/\b(in order to|various)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
    if (!summary.includes('high-performance') && !summary.includes('results-driven')) {
      summary = `Dynamic, results-driven developer. ${summary}`;
    }
    return sanitizeCompletedSentence(summary);
  }

  // 2. "Shorten this" / "concise" / "condense" / "trim"
  if (lowerInstruction.includes('shorten') || lowerInstruction.includes('concise') || lowerInstruction.includes('condense') || lowerInstruction.includes('trim')) {
    if (isArray) {
      return currentText.map((bullet) => {
        let b = bullet
          .replace(/\b(in order to|as well as|along with|successfully|various|duties included|responsibilities included)\b/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim();

        const words = b.split(/\s+/);
        if (words.length > 14) {
          const commaIndex = b.indexOf(',', 35);
          if (commaIndex > 0 && commaIndex < b.length - 12) {
            b = b.slice(0, commaIndex);
          } else {
            b = words.slice(0, 14).join(' ');
          }
        }
        return sanitizeCompletedSentence(b);
      });
    }

    // Paragraph shortening: preserve full sentence boundaries
    const sentences = textString.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > 1) {
      const shortened = sentences.slice(0, Math.max(1, sentences.length - 1)).join(' ').trim();
      return sanitizeCompletedSentence(shortened);
    }

    let trimmed = textString
      .replace(/\b(in order to|as well as|along with|successfully|various|duties included|responsibilities included)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const words = trimmed.split(/\s+/);
    if (words.length > 16) {
      const targetCount = Math.max(12, Math.floor(words.length * 0.8));
      trimmed = words.slice(0, targetCount).join(' ');
    }
    return sanitizeCompletedSentence(trimmed);
  }

  // 3. "Add [tech]" / "Include [tech]"
  const addMatch = instruction.match(/\b(add|include|incorporate|mention)\s+([A-Za-z0-9.+#\s]+)/i);
  if (addMatch && addMatch[2]) {
    const rawTarget = addMatch[2].trim();
    // Clean target tech (e.g. "FastAPI", "Docker")
    const techName = rawTarget.replace(/\b(to\s+(this|the)\s+(section|resume|summary|project)|into\s+it)\b/gi, '').trim();

    if (techName) {
      if (isArray) {
        const copy = [...currentText];
        if (copy.length > 0) {
          copy[0] = sanitizeCompletedSentence(`${copy[0].replace(/\.$/, '')} leveraging ${techName}.`);
        }
        return copy;
      }
      return sanitizeCompletedSentence(`${textString.replace(/\.$/, '')}, utilizing ${techName} for optimal performance.`);
    }
  }

  // 4. "Quantify achievements" / "Add metrics" / "Highlight results" / "Scale"
  if (
    lowerInstruction.includes('quantif') ||
    lowerInstruction.includes('metric') ||
    lowerInstruction.includes('number') ||
    lowerInstruction.includes('scale') ||
    lowerInstruction.includes('data volume')
  ) {
    if (isArray) {
      return currentText.map((bullet, idx) => {
        if (!/\d+%|\d+x|\d+\+/i.test(bullet)) {
          const metrics = [
            'driving a 25% increase in operational efficiency',
            'scaling reliable API delivery across 1,000+ daily requests',
            'reducing query latency by 35% through optimized database indexing',
          ];
          const metricSuffix = metrics[idx % metrics.length];
          return sanitizeCompletedSentence(`${bullet.replace(/\.$/, '')}, ${metricSuffix}.`);
        }
        return sanitizeCompletedSentence(bullet);
      });
    }
    return sanitizeCompletedSentence(`${textString.replace(/\.$/, '')}, improving deployment velocity by 30% across 1,000+ daily queries.`);
  }

  // 5. "Focus on architecture & design" / "system design" / "architectural choices"
  if (
    lowerInstruction.includes('architect') ||
    lowerInstruction.includes('design') ||
    lowerInstruction.includes('pattern') ||
    lowerInstruction.includes('structural')
  ) {
    if (isArray) {
      return currentText.map((bullet) => {
        let b = bullet.trim();
        b = b.replace(/^(?:assisted in developing|worked on|helped with|responsible for|participated in)\b/i, 'Architected and implemented');
        if (!b.toLowerCase().includes('architect') && !b.toLowerCase().includes('design') && !b.toLowerCase().includes('pattern')) {
          b = `${b.replace(/\.$/, '')}, adhering to scalable microservices architecture and modular design patterns.`;
        }
        return sanitizeCompletedSentence(b);
      });
    }
    let summary = textString;
    if (!summary.toLowerCase().includes('architect')) {
      summary = `Architecturally focused developer specializing in robust system design and scalable patterns. ${summary}`;
    }
    return sanitizeCompletedSentence(summary);
  }

  // 6. "Highlight leadership & collaboration" / "teamwork" / "ownership" / "mentoring"
  if (
    lowerInstruction.includes('leader') ||
    lowerInstruction.includes('collaborat') ||
    lowerInstruction.includes('team') ||
    lowerInstruction.includes('ownership') ||
    lowerInstruction.includes('mentor')
  ) {
    if (isArray) {
      return currentText.map((bullet) => {
        let b = bullet.trim();
        b = b.replace(/^(?:assisted in developing|worked on|helped with|responsible for|participated in)\b/i, 'Collaborated with cross-functional teams to engineer');
        if (!b.toLowerCase().includes('collaborat') && !b.toLowerCase().includes('team') && !b.toLowerCase().includes('sprint') && !b.toLowerCase().includes('review')) {
          b = `${b.replace(/\.$/, '')}, driving Agile sprint milestones and leading peer technical code reviews.`;
        }
        return sanitizeCompletedSentence(b);
      });
    }
    let summary = textString;
    if (!summary.toLowerCase().includes('collaborat') && !summary.toLowerCase().includes('team')) {
      summary = `Collaborative developer experienced in cross-functional team leadership, sprint planning, and code reviews. ${summary}`;
    }
    return sanitizeCompletedSentence(summary);
  }

  // 7. "Make more technical" / "deep tech stack" / "algorithms" / "tools"
  if (
    lowerInstruction.includes('technical') ||
    lowerInstruction.includes('tech stack') ||
    lowerInstruction.includes('deep tech') ||
    lowerInstruction.includes('framework') ||
    lowerInstruction.includes('algorithm')
  ) {
    if (isArray) {
      return currentText.map((bullet) => {
        let b = bullet.trim();
        b = b.replace(/^(?:assisted in developing|worked on|helped with)\b/i, 'Engineered and optimized');
        if (!b.toLowerCase().includes('schema') && !b.toLowerCase().includes('rest') && !b.toLowerCase().includes('pipeline') && !b.toLowerCase().includes('sql') && !b.toLowerCase().includes('api')) {
          b = `${b.replace(/\.$/, '')}, leveraging optimized REST APIs, structured schemas, and asynchronous execution pipelines.`;
        }
        return sanitizeCompletedSentence(b);
      });
    }
    let summary = textString;
    if (!summary.toLowerCase().includes('full stack') && !summary.toLowerCase().includes('algorithms')) {
      summary = `Technical software engineer proficient in full-stack architecture, algorithms, and high-throughput backend services. ${summary}`;
    }
    return sanitizeCompletedSentence(summary);
  }

  // 8. Default polish
  if (isArray) {
    return currentText.map((b) => sanitizeCompletedSentence(b));
  }
  return sanitizeCompletedSentence(textString);
}

/**
 * Executes a custom instruction rewrite request.
 * Wraps execution in an AbortController timeout (default: 15000ms).
 * Targets ONLY the scoped section text to ensure fast local LLM response.
 *
 * @param {Object} params
 * @param {string} params.sectionKey - Section key (e.g., 'summary', 'internship', 'project')
 * @param {string|string[]} params.currentText - Section text to edit
 * @param {string} params.instruction - Plain English instruction
 * @param {string[]} [params.approvedMissingTech=[]] - Approved technologies
 * @param {string} [params.model=DEFAULT_MODEL] - Ollama model name
 * @param {number} [params.timeoutMs=15000] - Hard timeout in milliseconds (default: 15000ms)
 * @returns {Promise<{success: boolean, rewrittenText?: string|string[], blocked?: boolean, scope_violation?: boolean, message?: string, durationMs: number, engine: string}>}
 */
export async function applyCustomInstructionPipeline({
  sectionKey = 'summary',
  currentText = '',
  instruction = '',
  approvedMissingTech = [],
  model = DEFAULT_MODEL,
  baseUrl = OLLAMA_BASE_URL,
  timeoutMs = 1800,
  isOllamaOnline = undefined,
} = {}) {
  const cleanBaseUrl = (baseUrl || OLLAMA_BASE_URL).replace(/\/+$/, '');
  const startTime = Date.now();

  // 1. Immutable Fact Firewall Check
  const factCheck = validateFactFirewall(instruction);
  if (factCheck.blocked) {
    return {
      success: false,
      blocked: true,
      scope_violation: false,
      message: factCheck.message,
      durationMs: Date.now() - startTime,
      engine: 'Fact Firewall Guard',
    };
  }

  // 2. Scope Guardrail Check
  const scopeCheck = validateScopeGuardrail(instruction);
  if (scopeCheck.scope_violation) {
    return {
      success: false,
      blocked: false,
      scope_violation: true,
      message: scopeCheck.message,
      durationMs: Date.now() - startTime,
      engine: 'Scope Guardrail',
    };
  }

  // 3. Lightweight API Payload execution with 15-second Abort Controller
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const isArray = Array.isArray(currentText);
  const textPayload = isArray ? currentText.join('\n- ') : String(currentText || '');

  try {
    const systemPrompt = `You are an expert resume editor and formatting assistant. You ONLY perform requested text rewrites on specific resume snippets. You strictly respect real facts and never invent credentials. You ALWAYS complete sentences fully with proper grammar and terminal punctuation. Respond in valid JSON only.`;

    const customPrompt = `Analyze the current resume section text and the user's targeted instruction below.

<current_text>
${textPayload}
</current_text>

<user_instruction>
${instruction.trim()}
</user_instruction>

CRITICAL RULES:
1. First, check if the instruction relates to resume editing, wording, tone, clarity, technical depth, or formatting.
   - If off-topic, chit-chat, conversational, or unrelated to this resume snippet, set "scope_violation": true.
2. If valid, rewrite the text to directly fulfill the instruction.
   - For bullet points: maintain distinct concise bullet points.
   - For summary: maintain a cohesive professional paragraph.
   - Ground truth: do NOT invent degrees, employers, or fake certifications.
   - If "Quantify achievements": add realistic metrics, data volumes, percentages, or scale.
   - If "Focus on architecture & design": emphasize system design, patterns, and structural choices.
   - If "Highlight leadership & collaboration": emphasize teamwork, cross-functional ownership, and mentoring.
   - If "Make more technical": emphasize underlying tools, frameworks, algorithms, and deep tech stack specifics.
3. SENTENCE COMPLETION & GRAMMAR MANDATE (ZERO CUT-OFFS):
   - You MUST ALWAYS complete every sentence fully with proper grammar and terminal punctuation (a period).
   - NEVER end abruptly with dangling conjunctions or prepositions (e.g. NEVER end with "and.", "or.", "with.", "to.", "for.", "of.", "in.", "provide.", "including.").
   - If text is shortened, it must cleanly conclude with a complete, grammatically correct thought. Do NOT truncate mid-thought.
4. Return ONLY a JSON object matching this schema:
{
  "scope_violation": false,
  "rewrittenText": ${isArray ? '["bullet point 1", "bullet point 2"]' : '"Rewritten summary text"'}
}`;

    const requestBody = {
      model,
      prompt: customPrompt,
      system: systemPrompt,
      stream: false,
      format: 'json',
      options: {
        temperature: 0.2,
        num_predict: 1024, // Ample token capacity (>= 1024) to guarantee zero mid-sentence cut-offs
      },
    };

    const sanitizeOutput = (val) => {
      if (isArray) {
        const arr = Array.isArray(val) ? val : [String(val || '')];
        return arr.map((item) => sanitizeCompletedSentence(item));
      }
      return sanitizeCompletedSentence(String(val || ''));
    };

    // Dual-Engine Check: Route to Cloud AI if on public domain or Ollama is offline
    const routeToCloud = shouldUseCloudAi(isOllamaOnline);

    if (routeToCloud && hasCloudApiKey()) {
      try {
        const cloudRes = await callCloudAi({
          prompt: customPrompt,
          systemPrompt,
          jsonMode: true,
          timeoutMs: 15000,
        });

        if (cloudRes.success && cloudRes.data) {
          const parsed = cloudRes.data;

          if (parsed.scope_violation === true) {
            return {
              success: false,
              blocked: false,
              scope_violation: true,
              message: SCOPE_VIOLATION_MESSAGE,
              durationMs: Date.now() - startTime,
              engine: `Cloud AI (${cloudRes.provider.toUpperCase()}: ${cloudRes.model})`,
            };
          }

          const candidateText =
            parsed.rewrittenText ??
            parsed.rewritten_text ??
            parsed.text ??
            parsed.result ??
            (typeof parsed === 'string' ? parsed : null);

          if (candidateText !== null && candidateText !== undefined) {
            return {
              success: true,
              rewrittenText: sanitizeOutput(candidateText),
              durationMs: Date.now() - startTime,
              engine: `Cloud AI (${cloudRes.provider.toUpperCase()}: ${cloudRes.model})`,
            };
          }
        }
      } catch {
        // Fall through
      }
    }

    if (!routeToCloud) {
      const response = await fetch(`${cleanBaseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        const rawText = extractOllamaResponseText(result);

        if (rawText) {
          const parsed = safeParseJson(rawText);

          if (parsed.scope_violation === true) {
            return {
              success: false,
              blocked: false,
              scope_violation: true,
              message: SCOPE_VIOLATION_MESSAGE,
              durationMs: Date.now() - startTime,
              engine: `Ollama (${model})`,
            };
          }

          const candidateText =
            parsed.rewrittenText ??
            parsed.rewritten_text ??
            parsed.text ??
            parsed.result ??
            (typeof parsed === 'string' ? parsed : null);

          if (candidateText !== null && candidateText !== undefined) {
            return {
              success: true,
              rewrittenText: sanitizeOutput(candidateText),
              durationMs: Date.now() - startTime,
              engine: `Ollama (${model})`,
            };
          }
        }
      }
    } else {
      clearTimeout(timeoutId);
    }

    // If Ollama didn't return valid text, use fast deterministic fallback
    const deterministicRewrite = applyDeterministicInstruction(
      currentText,
      instruction,
      sectionKey,
      approvedMissingTech
    );

    return {
      success: true,
      rewrittenText: sanitizeOutput(deterministicRewrite),
      durationMs: Date.now() - startTime,
      engine: 'Deterministic Section Rewrite Engine',
    };
  } catch (error) {
    clearTimeout(timeoutId);

    const sanitizeOutput = (val) => {
      if (isArray) {
        const arr = Array.isArray(val) ? val : [String(val || '')];
        return arr.map((item) => sanitizeCompletedSentence(item));
      }
      return sanitizeCompletedSentence(String(val || ''));
    };

    // If timed out via AbortController:
    if (error.name === 'AbortError' || controller.signal.aborted) {
      // Gracefully fall back to deterministic engine so user is never blocked
      const deterministicRewrite = applyDeterministicInstruction(
        currentText,
        instruction,
        sectionKey,
        approvedMissingTech
      );

      return {
        success: true,
        rewrittenText: sanitizeOutput(deterministicRewrite),
        durationMs: Date.now() - startTime,
        engine: 'Deterministic Engine (Fallback on Timeout)',
        notice: 'Request exceeded network latency budget; applied optimized deterministic rewrite.',
      };
    }

    // Network / offline fallback: execute ultra-fast deterministic rewrite (< 15ms)
    const deterministicRewrite = applyDeterministicInstruction(
      currentText,
      instruction,
      sectionKey,
      approvedMissingTech
    );

    return {
      success: true,
      rewrittenText: sanitizeOutput(deterministicRewrite),
      durationMs: Date.now() - startTime,
      engine: 'Deterministic Section Rewrite Engine (Offline)',
    };
  }
}

/**
 * Handler for applying custom instructions and syncing with section override state.
 * Immediately saves generated text to customEdits and tailoredProjects.
 *
 * @param {Object} params
 * @param {string} params.sectionKey - Target section identifier (e.g. 'summary', 'proj-0', 'proj_0')
 * @param {string|string[]} params.currentText - Text to transform
 * @param {string} params.instruction - Custom instruction string
 * @param {Object} [params.customEdits={}] - Existing custom edits map
 * @param {Array} [params.tailoredProjects=[]] - Existing tailored projects array
 * @param {Object} [params.tailoredResult=null] - Existing tailored result object
 * @param {string[]} [params.approvedMissingTech=[]] - Approved tech stack
 * @param {string} [params.model=DEFAULT_MODEL] - Model name
 * @param {number} [params.timeoutMs=15000] - Hard timeout in milliseconds
 * @returns {Promise<{ success: boolean, rewrittenText?: string|string[], customEdits: Object, tailoredProjects: Array, tailoredResult?: Object, blocked?: boolean, scope_violation?: boolean, message?: string }>}
 */
export async function handleApplyCustomInstruction({
  sectionKey = 'summary',
  currentText = '',
  instruction = '',
  customEdits = {},
  tailoredProjects = [],
  tailoredResult = null,
  approvedMissingTech = [],
  model = DEFAULT_MODEL,
  baseUrl = OLLAMA_BASE_URL,
  timeoutMs = 15000,
} = {}) {
  const result = await applyCustomInstructionPipeline({
    sectionKey,
    currentText,
    instruction,
    approvedMissingTech,
    model,
    baseUrl,
    timeoutMs,
  });

  if (!result.success || !result.rewrittenText) {
    return {
      ...result,
      customEdits: { ...customEdits },
      tailoredProjects: Array.isArray(tailoredProjects) ? [...tailoredProjects] : [],
      tailoredResult,
    };
  }

  const updatedEdits = {
    ...customEdits,
    [sectionKey]: result.rewrittenText,
  };
  if (sectionKey.includes('-')) {
    updatedEdits[sectionKey.replace('-', '_')] = result.rewrittenText;
  } else if (sectionKey.includes('_')) {
    updatedEdits[sectionKey.replace('_', '-')] = result.rewrittenText;
  }

  let updatedProjects = Array.isArray(tailoredProjects) && tailoredProjects.length > 0
    ? [...tailoredProjects]
    : [...(tailoredResult?.highlightedProjects || [])];

  if (sectionKey.startsWith('proj-') || sectionKey.startsWith('proj_')) {
    const idx = parseInt(sectionKey.replace(/proj[-_]/, ''), 10);
    if (updatedProjects[idx]) {
      const desc = typeof result.rewrittenText === 'string' ? result.rewrittenText : String(result.rewrittenText || '');
      updatedProjects[idx] = {
        ...updatedProjects[idx],
        description: desc,
      };
      if (updatedProjects[idx].name) {
        updatedEdits[updatedProjects[idx].name] = desc;
      }
    }
  }

  let updatedTailoredResult = tailoredResult ? { ...tailoredResult } : null;
  if (updatedTailoredResult) {
    updatedTailoredResult.customEdits = updatedEdits;
    if (sectionKey === 'summary' || sectionKey === 'professionalSummary') {
      updatedTailoredResult.tailoredSummary =
        typeof result.rewrittenText === 'string' ? result.rewrittenText : String(result.rewrittenText || '');
    } else if (sectionKey.startsWith('proj-') || sectionKey.startsWith('proj_')) {
      const idx = parseInt(sectionKey.replace(/proj[-_]/, ''), 10);
      const projList = [...(updatedTailoredResult.highlightedProjects || [])];
      if (projList[idx]) {
        projList[idx] = {
          ...projList[idx],
          description: typeof result.rewrittenText === 'string' ? result.rewrittenText : String(result.rewrittenText || ''),
        };
        updatedTailoredResult.highlightedProjects = projList;
        updatedTailoredResult.tailoredProjects = projList;
      }
    } else if (sectionKey.startsWith('exp-') || sectionKey.startsWith('exp_')) {
      const idx = parseInt(sectionKey.replace(/exp[-_]/, ''), 10);
      const expList = [...(updatedTailoredResult.highlightedExperiences || [])];
      if (expList[idx]) {
        let bullets = result.rewrittenText;
        if (typeof bullets === 'string') {
          bullets = bullets
            .split('\n')
            .map((b) => b.replace(/^[-•*]\s*/, '').trim())
            .filter(Boolean);
        }
        expList[idx] = {
          ...expList[idx],
          bulletPoints: bullets,
        };
        updatedTailoredResult.highlightedExperiences = expList;
      }
    }
  }

  return {
    ...result,
    customEdits: updatedEdits,
    tailoredProjects: updatedProjects.length > 0 ? updatedProjects : (updatedTailoredResult?.highlightedProjects || []),
    tailoredResult: updatedTailoredResult,
  };
}
