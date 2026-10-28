/**
 * Verification Test Suite for Ollama Generation API Call & Payload Handling
 *
 * Verifies:
 * 1. extractOllamaResponseText handles /api/generate ({ response: "..." }).
 * 2. extractOllamaResponseText handles /api/chat ({ message: { content: "..." } }).
 * 3. extractOllamaResponseText handles Axios/wrapped responses ({ data: { response: "..." } }).
 * 4. safeParseJson handles code fences, conversational preambles, and pre-parsed objects.
 * 5. tailorResumePipeline successfully uses Ollama AI without false-positive Smart Rule Engine fallback.
 * 6. applyCustomInstructionPipeline successfully parses both /api/generate and /api/chat payloads.
 */

import { extractOllamaResponseText, safeParseJson, generateResumeContent } from '../src/services/ollamaService.js';
import { tailorResumePipeline } from '../src/services/tailoringService.js';
import { applyCustomInstructionPipeline, sanitizeCompletedSentence } from '../src/services/customInstructionService.js';
import { batchOptimizeDynamicSectionsPipeline } from '../src/services/sectionOptimizationService.js';
import { defaultMasterProfile } from '../src/data/defaultMasterProfile.js';

console.log('================================================================');
console.log('    OLLAMA GENERATION API CALL & PAYLOAD EXTRACTION SUITE');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${testName}`);
    if (details) console.log(`       -> ${details}`);
  } else {
    console.error(`[FAIL] ${testName}`);
    if (details) console.error(`       -> ${details}`);
  }
}

async function runGenerationTests() {
  // ------------------------------------------------------------------
  // TEST CATEGORY 1: extractOllamaResponseText Multi-Format Extraction
  // ------------------------------------------------------------------
  console.log('--- TEST CATEGORY 1: Response Text Extraction ---');

  // Test 1A: /api/generate format
  const generatePayload = {
    model: 'llama3.2:latest',
    created_at: '2026-10-22T20:00:00Z',
    response: '{"tailoredSummary": "Full Stack Developer with React experience"}',
    done: true,
  };
  const textFromGenerate = extractOllamaResponseText(generatePayload);
  assert(
    textFromGenerate === '{"tailoredSummary": "Full Stack Developer with React experience"}',
    'Test 1A: Correctly extracts from /api/generate format ({ response: "..." })'
  );

  // Test 1B: /api/chat format
  const chatPayload = {
    model: 'llama3.2:latest',
    message: {
      role: 'assistant',
      content: '{"tailoredSummary": "Chat-generated summary"}',
    },
    done: true,
  };
  const textFromChat = extractOllamaResponseText(chatPayload);
  assert(
    textFromChat === '{"tailoredSummary": "Chat-generated summary"}',
    'Test 1B: Correctly extracts from /api/chat format ({ message: { content: "..." } })'
  );

  // Test 1C: Axios / wrapped response format
  const wrappedPayload = {
    data: {
      response: '{"tailoredSummary": "Axios wrapped response"}',
    },
  };
  const textFromWrapped = extractOllamaResponseText(wrappedPayload);
  assert(
    textFromWrapped === '{"tailoredSummary": "Axios wrapped response"}',
    'Test 1C: Correctly extracts from wrapped format ({ data: { response: "..." } })'
  );

  // Test 1D: OpenAI / proxy format
  const openaiPayload = {
    choices: [
      {
        message: {
          content: '{"tailoredSummary": "OpenAI proxy format"}',
        },
      },
    ],
  };
  const textFromOpenAI = extractOllamaResponseText(openaiPayload);
  assert(
    textFromOpenAI === '{"tailoredSummary": "OpenAI proxy format"}',
    'Test 1D: Correctly extracts from proxy choices format ({ choices: [{ message: { content: "..." } }] })'
  );

  // ------------------------------------------------------------------
  // TEST CATEGORY 2: safeParseJson Robustness
  // ------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 2: Robust JSON Parsing ---');

  // Test 2A: Markdown code-fenced JSON
  const fenced = '```json\n{"key": "value"}\n```';
  const parsedFenced = safeParseJson(fenced);
  assert(
    parsedFenced.key === 'value',
    'Test 2A: Strips markdown ```json code fences and parses JSON'
  );

  // Test 2B: Conversational commentary prefix
  const conversational = 'Sure! Here is the JSON you requested:\n{"summary": "test"}';
  const parsedConv = safeParseJson(conversational);
  assert(
    parsedConv.summary === 'test',
    'Test 2B: Extracts outer JSON object when preceded by conversational commentary'
  );

  // Test 2C: Pre-parsed object pass-through
  const preParsed = { already: 'parsed' };
  const parsedObj = safeParseJson(preParsed);
  assert(
    parsedObj.already === 'parsed',
    'Test 2C: Pass-through pre-parsed objects without throwing'
  );

  // ------------------------------------------------------------------
  // TEST CATEGORY 3: Pipeline Integration with Mocked Ollama
  // ------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 3: Pipeline Execution & Source Verification ---');

  const originalFetch = globalThis.fetch;
  const sampleJd = `We are looking for a Full Stack Developer to build web applications using React, Python, Node.js, and SQL databases. Minimum 0-1 year experience.`;

  try {
    // Mock Ollama /api/generate returning valid tailoring JSON
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body || '{}');
      const urlStr = String(url);

      if (urlStr.endsWith('/api/generate')) {
        // Assert proper payload shape
        if (body.stream !== false) {
          throw new Error('stream must be false');
        }

        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            model: body.model || 'llama3.2:latest',
            response: JSON.stringify({
              tailoredSummary: 'Dynamic Full Stack Developer experienced with React, Python, and SQL.',
              matchedSkills: ['React', 'Python', 'Node.js', 'SQL'],
              missingKeywords: ['Docker'],
              highlightedExperiences: [
                {
                  company: 'Larsen & Toubro (L&T), Chennai',
                  role: 'Full Stack Developer Intern',
                  bulletPoints: ['Developed web application using React and Django.'],
                },
              ],
              recommendations: ['Highlight SQL indexing skills.'],
              matchScore: 88,
            }),
            done: true,
          }),
        };
      }
      return { ok: false, status: 404 };
    };

    const tailorResult = await tailorResumePipeline({
      masterProfile: defaultMasterProfile,
      jobDescription: sampleJd,
      model: 'llama3.2:latest',
    });

    assert(
      tailorResult.source === 'ollama_ai' &&
        tailorResult.model === 'llama3.2:latest' &&
        tailorResult.offlineNotice === null,
      'Test 3A: tailorResumePipeline executes with source="ollama_ai" without triggering Smart Rule Engine fallback',
      `Source: ${tailorResult.source} | Model: ${tailorResult.model} | Notice: ${tailorResult.offlineNotice}`
    );

    // Mock Ollama /api/chat payload format
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body || '{}');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          model: body.model || 'llama3.2:latest',
          message: {
            role: 'assistant',
            content: JSON.stringify({
              tailoredSummary: 'Chat format tailored summary for Full Stack role.',
              matchedSkills: ['React', 'Python', 'SQL'],
              missingKeywords: [],
              highlightedExperiences: [
                {
                  company: 'Larsen & Toubro (L&T), Chennai',
                  role: 'Full Stack Developer Intern',
                  bulletPoints: ['Developed web application using React.'],
                },
              ],
              matchScore: 85,
            }),
          },
          done: true,
        }),
      };
    };

    const chatTailorResult = await tailorResumePipeline({
      masterProfile: defaultMasterProfile,
      jobDescription: sampleJd,
      model: 'llama3.2:latest',
    });

    assert(
      chatTailorResult.source === 'ollama_ai' && chatTailorResult.offlineNotice === null,
      'Test 3B: tailorResumePipeline parses /api/chat payload successfully with source="ollama_ai"',
      `Source: ${chatTailorResult.source} | Summary: "${chatTailorResult.data.tailoredSummary.slice(0, 45)}..."`
    );

    // Test Custom Instruction with Ollama /api/chat payload
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        message: {
          role: 'assistant',
          content: JSON.stringify({
            scope_violation: false,
            rewrittenText: 'Spearheaded full stack development using React and Python.',
          }),
        },
      }),
    });

    const instructionResult = await applyCustomInstructionPipeline({
      sectionKey: 'summary',
      currentText: 'Worked on web apps with React.',
      instruction: 'Make this punchier',
      model: 'llama3.2:latest',
    });

    assert(
      instructionResult.success === true &&
        instructionResult.engine.includes('Ollama') &&
        instructionResult.rewrittenText.includes('Spearheaded'),
      'Test 3C: applyCustomInstructionPipeline parses /api/chat payload without falling back to deterministic rewrite',
      `Engine: ${instructionResult.engine} | Result: "${instructionResult.rewrittenText}"`
    );

    // ------------------------------------------------------------------
    // TEST CATEGORY 4: Response Token Limit (num_predict >= 512 / 1024)
    // ------------------------------------------------------------------
    console.log('\n--- TEST CATEGORY 4: Response Token Limit (num_predict) ---');

    const capturedOptions = [];
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      capturedOptions.push(body.options || {});
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          response: JSON.stringify({
            status: 'PROCEED',
            tailoredSummary: 'Full stack engineer with Python experience.',
            summary: { proposedText: 'Results-driven software developer.' },
            rewrittenText: 'Dynamic and results-driven software developer.',
          }),
        }),
      };
    };

    // Test 4A: generateResumeContent configures num_predict >= 512 (default: 1024)
    capturedOptions.length = 0;
    await generateResumeContent({
      userJd: 'Software Engineer',
      userInput: 'Python developer',
    });
    assert(
      capturedOptions[0] && capturedOptions[0].num_predict >= 512,
      'Test 4A: generateResumeContent enforces num_predict >= 512 (actual: ' + capturedOptions[0]?.num_predict + ')',
      `Tokens configured: ${capturedOptions[0]?.num_predict}`
    );

    // Test 4B: batchOptimizeDynamicSectionsPipeline enforces num_predict >= 1024
    capturedOptions.length = 0;
    await batchOptimizeDynamicSectionsPipeline({
      masterProfile: defaultMasterProfile,
      jobDescription: sampleJd,
      targetKeywords: ['Python', 'Django'],
    });
    assert(
      capturedOptions[0] && capturedOptions[0].num_predict >= 1024,
      'Test 4B: batchOptimizeDynamicSectionsPipeline enforces num_predict >= 1024 to prevent dangling words (actual: ' + capturedOptions[0]?.num_predict + ')',
      `Tokens configured: ${capturedOptions[0]?.num_predict}`
    );

    // Test 4C: applyCustomInstructionPipeline enforces num_predict >= 1024
    capturedOptions.length = 0;
    await applyCustomInstructionPipeline({
      sectionKey: 'summary',
      currentText: 'Developer with experience in Python.',
      instruction: 'Make punchier',
    });
    assert(
      capturedOptions[0] && capturedOptions[0].num_predict >= 1024,
      'Test 4C: applyCustomInstructionPipeline enforces num_predict >= 1024 for complete sentence generation',
      `Tokens configured: ${capturedOptions[0]?.num_predict}`
    );

    // Test 4D: tailorResumePipeline enforces num_predict >= 1024
    capturedOptions.length = 0;
    await tailorResumePipeline({
      masterProfile: defaultMasterProfile,
      jobDescription: sampleJd,
    });
    assert(
      capturedOptions[0] && capturedOptions[0].num_predict >= 1024,
      'Test 4D: tailorResumePipeline enforces num_predict >= 1024 for full tailored payload generation',
      `Tokens configured: ${capturedOptions[0]?.num_predict}`
    );

    // ------------------------------------------------------------------
    // TEST CATEGORY 5: Dangling Preposition & Incomplete Sentence Post-Processing
    // ------------------------------------------------------------------
    console.log('\n--- TEST CATEGORY 5: Dangling Preposition & Truncation Post-Processing ---');

    // 5A: sanitizeCompletedSentence gracefully handles dangling prepositions
    const rawCutoffSentence = 'Engineered scalable microservices and backend data pipelines at.';
    const cleanedSentence = sanitizeCompletedSentence(rawCutoffSentence);
    assert(
      !cleanedSentence.endsWith('at.') && cleanedSentence.endsWith('pipelines.'),
      'Test 5A: sanitizeCompletedSentence strips trailing dangling preposition "at." and restores clean period',
      `Cleaned: "${cleanedSentence}"`
    );

    // 5B: sanitizeCompletedSentence handles multi-word dangling phrases and unclosed quotes
    const phraseCutoff = '"Spearheaded development of responsive frontend components in order to.';
    const cleanedPhrase = sanitizeCompletedSentence(phraseCutoff);
    assert(
      !cleanedPhrase.includes('in order to') && cleanedPhrase.endsWith('components.') && !cleanedPhrase.startsWith('"'),
      'Test 5B: sanitizeCompletedSentence strips unclosed quotes and multi-word phrase "in order to."',
      `Cleaned: "${cleanedPhrase}"`
    );

    // 5C: sanitizeCompletedSentence preserves legitimate entity names with punctuation
    const legitSentence = 'Developed full stack audit platform at Larsen & Toubro (L&T).';
    const preservedSentence = sanitizeCompletedSentence(legitSentence);
    assert(
      preservedSentence === legitSentence,
      'Test 5C: sanitizeCompletedSentence preserves valid entity names and punctuation intact',
      `Preserved: "${preservedSentence}"`
    );

    // 5D: tailorResumePipeline post-processes LLM output with dangling words
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        response: JSON.stringify({
          tailoredSummary: 'Results-driven software developer with internship experience building scalable web architectures and secure data pipelines in Python and React at.',
          matchedSkills: ['Python', 'React'],
          missingKeywords: [],
          highlightedExperiences: [
            {
              company: 'Larsen & Toubro (L&T)',
              title: 'Full Stack Developer Intern',
              period: 'Jul 2025 - Dec 2025',
              bulletPoints: [
                'Architected web-based audit application using React and Django with.',
              ],
            },
          ],
          highlightedProjects: [
            {
              name: 'Fake News Detection System',
              description: 'Engineered automated classification pipeline using Python and NLP for the.',
            },
          ],
          matchScore: 88,
        }),
        done: true,
      }),
    });

    const pipelineSanitized = await tailorResumePipeline({
      masterProfile: defaultMasterProfile,
      jobDescription: sampleJd,
      model: 'llama3.2:latest',
    });

    assert(
      pipelineSanitized.success &&
        !pipelineSanitized.data.tailoredSummary.endsWith('at.') &&
        pipelineSanitized.data.tailoredSummary.endsWith('React.'),
      'Test 5D: tailorResumePipeline sanitizes dangling "at." from Ollama professional summary',
      `Summary: "${pipelineSanitized.data.tailoredSummary}"`
    );

    assert(
      pipelineSanitized.data.highlightedExperiences[0]?.bulletPoints[0]?.endsWith('Django.') &&
        !pipelineSanitized.data.highlightedExperiences[0]?.bulletPoints[0]?.endsWith('with.'),
      'Test 5E: tailorResumePipeline sanitizes dangling "with." from Ollama experience bullet points',
      `Bullet: "${pipelineSanitized.data.highlightedExperiences[0]?.bulletPoints[0]}"`
    );

    assert(
      pipelineSanitized.data.highlightedProjects[0]?.description?.endsWith('NLP.') &&
        !pipelineSanitized.data.highlightedProjects[0]?.description?.endsWith('the.'),
      'Test 5F: tailorResumePipeline sanitizes dangling "for the." from Ollama project description',
      `Project desc: "${pipelineSanitized.data.highlightedProjects[0]?.description}"`
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('\n================================================================');
  console.log(`   GENERATION TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runGenerationTests();
