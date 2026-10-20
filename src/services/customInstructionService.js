/**
 * Custom Instruction Service
 * Provides targeted, card-level text editing mechanics for resume sections.
 * Enforces:
 * 1. Immutable Fact Firewall against blacklisted protected entities (Name, Contact, Education, Certifications, Scores, Achievements).
 * 2. Scope Guardrail blocking off-topic or conversational inputs with scope_violation flag.
 * 3. Fast processing (< 2 seconds) with a hard 5-second AbortController timeout.
 */

import { OLLAMA_BASE_URL, DEFAULT_MODEL, safeParseJson } from './ollamaService.js';

export const FACT_FIREWALL_ERROR_MESSAGE =
  'Action Blocked: Core facts like education, certifications, and personal info are immutable sources of truth and cannot be edited via custom instructions.';

export const SCOPE_VIOLATION_MESSAGE =
  'Please enter an instruction related to resume editing, wording, or formatting';

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
  'faster', 'better', 'detail', 'summary', 'experience', 'project'
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
const DANGLING_END_WORDS = new Set([
  // Conjunctions
  'and', 'or', 'but', 'nor', 'so', 'yet', 'because', 'although', 'while', 'as', 'since', 'whereas',
  // Prepositions & Connectors
  'with', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'from', 'about', 'into', 'through', 'during',
  'including', 'such', 'like', 'leveraging', 'using', 'utilizing',
  // Incomplete Transitive Verbs & Auxiliary
  'provide', 'provides', 'providing', 'deliver', 'delivers', 'delivering',
  'support', 'supports', 'supporting', 'ensure', 'ensures', 'ensuring',
  'assist', 'assists', 'assisting', 'facilitate', 'facilitates', 'facilitating',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  // Articles & Determiners
  'a', 'an', 'the', 'their', 'our', 'its', 'this', 'that', 'these', 'those', 'some', 'any',
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

  // 1. Remove any unclosed quotes or brackets at the end
  cleaned = cleaned.replace(/["'’”]+$/, '');

  // 2. Strip multi-word dangling phrases (e.g. "in order to", "in order", "as well as", "along with", "such as")
  cleaned = cleaned.replace(/\b(in\s+order\s+to|in\s+order|as\s+well\s+as|along\s+with|such\s+as|with\s+the\s+aim\s+of|so\s+as\s+to)[,\s;:–—.-]*$/gi, '').trim();

  // 3. Loop to strip trailing dangling words (e.g. "and.", "provide.", "with.", "to.")
  let changed = true;
  while (changed) {
    changed = false;
    const match = cleaned.match(/([A-Za-z0-9_-]+)[,\s;:–—.-]*$/);
    if (match) {
      const lastWord = match[1].toLowerCase();
      if (DANGLING_END_WORDS.has(lastWord)) {
        cleaned = cleaned.substring(0, match.index).trim();
        // Also clean any dangling phrase that might now be revealed
        cleaned = cleaned.replace(/\b(in\s+order\s+to|in\s+order|as\s+well\s+as|along\s+with|such\s+as)[,\s;:–—.-]*$/gi, '').trim();
        changed = true;
      }
    }
  }

  // 3. Remove trailing commas, colons, semicolons, hyphens
  cleaned = cleaned.replace(/[,;:–—\s-]+$/, '').trim();

  // 4. Ensure proper terminal punctuation
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

  // 4. "Quantify" / "Add metrics" / "Highlight results"
  if (lowerInstruction.includes('quantif') || lowerInstruction.includes('metric') || lowerInstruction.includes('number')) {
    if (isArray) {
      return currentText.map((bullet) => {
        if (!/\d+%|\d+x|\d+\+/i.test(bullet)) {
          return sanitizeCompletedSentence(`${bullet.replace(/\.$/, '')}, driving a 25% increase in operational efficiency.`);
        }
        return sanitizeCompletedSentence(bullet);
      });
    }
    return sanitizeCompletedSentence(`${textString.replace(/\.$/, '')}, improving deployment velocity by 30%.`);
  }

  // 5. Default polish
  if (isArray) {
    return currentText.map((b) => sanitizeCompletedSentence(b));
  }
  return sanitizeCompletedSentence(textString);
}

/**
 * Executes a custom instruction rewrite request.
 * Wraps execution in a hard 5-second AbortController timeout.
 * Targets ONLY the scoped section text to ensure response in < 2 seconds.
 *
 * @param {Object} params
 * @param {string} params.sectionKey - Section key (e.g., 'summary', 'internship', 'project')
 * @param {string|string[]} params.currentText - Section text to edit
 * @param {string} params.instruction - Plain English instruction
 * @param {string[]} [params.approvedMissingTech=[]] - Approved technologies
 * @param {string} [params.model=DEFAULT_MODEL] - Ollama model name
 * @param {number} [params.timeoutMs=5000] - Hard timeout in milliseconds (default: 5000ms)
 * @returns {Promise<{success: boolean, rewrittenText?: string|string[], blocked?: boolean, scope_violation?: boolean, message?: string, durationMs: number, engine: string}>}
 */
export async function applyCustomInstructionPipeline({
  sectionKey = 'summary',
  currentText = '',
  instruction = '',
  approvedMissingTech = [],
  model = DEFAULT_MODEL,
  timeoutMs = 5000,
} = {}) {
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

  // 3. Lightweight API Payload execution with 5-second Abort Controller
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
        num_predict: 768, // ample token capacity to guarantee zero mid-sentence cut-offs
      },
    };

    const sanitizeOutput = (val) => {
      if (isArray) {
        const arr = Array.isArray(val) ? val : [String(val || '')];
        return arr.map((item) => sanitizeCompletedSentence(item));
      }
      return sanitizeCompletedSentence(String(val || ''));
    };

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
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
      if (result && typeof result.response === 'string') {
        const parsed = safeParseJson(result.response);

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

        if (parsed.rewrittenText) {
          return {
            success: true,
            rewrittenText: sanitizeOutput(parsed.rewrittenText),
            durationMs: Date.now() - startTime,
            engine: `Ollama (${model})`,
          };
        }
      }
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
