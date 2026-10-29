/**
 * Verification Test Suite for Cloud AI Fallback & Dual-Engine Integration
 *
 * Verifies:
 * 1. Cloud Provider Support (Groq and Google Gemini endpoints, models, and configs).
 * 2. Public Deployment & Environment Routing (localhost vs. *.vercel.app).
 * 3. Seamless UX & Error Handling (No unhandled rejections, missing key safety).
 * 4. High-accuracy Deterministic Parser (Zero-key Vercel fallback passing Fact Firewall).
 * 5. Dual-Engine Tailoring Pipeline (Ollama Local vs. Cloud LLM vs. Deterministic Fallback).
 * 6. Fact Firewall & Gatekeeper preservation (100% integrity score, zero regressions).
 */

import {
  CLOUD_PROVIDERS,
  GROQ_ENDPOINT,
  DEFAULT_GROQ_MODEL,
  GROQ_MODELS,
  GEMINI_ENDPOINT,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODELS,
  getCloudConfig,
  setCloudConfig,
  clearCloudConfig,
  hasCloudApiKey,
  isPublicDeployment,
  shouldUseCloudAi,
  callCloudAi,
  parseResumeDeterministic,
  testCloudConnection,
} from '../src/services/cloudAiService.js';

import { defaultMasterProfile } from '../src/data/defaultMasterProfile.js';
import { SAMPLE_JOB_DESCRIPTIONS } from '../src/data/sampleJobDescriptions.js';
import { tailorResumePipeline } from '../src/services/tailoringService.js';
import { runTechExtractionPipeline } from '../src/services/techExtractionService.js';
import { parseResumeWithOllama } from '../src/services/profileParserService.js';
import { auditFactIntegrity } from '../src/services/factFirewall.js';
import { evaluateGatekeeperRules } from '../src/services/gatekeeperService.js';

console.log('================================================================');
console.log('    CLOUD AI FALLBACK & DUAL-ENGINE VERIFICATION SUITE');
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

async function runCloudVerification() {
  // ------------------------------------------------------------------
  // TEST CATEGORY 1: Provider Configuration & Endpoints
  // ------------------------------------------------------------------
  console.log('--- TEST CATEGORY 1: Provider Configurations & Defaults ---');

  assert(
    GROQ_ENDPOINT === 'https://api.groq.com/openai/v1/chat/completions' &&
      DEFAULT_GROQ_MODEL === 'llama-3.3-70b-versatile' &&
      GROQ_MODELS.length >= 2,
    'Test 1A: Groq provider configured with official endpoint and recommended Llama 3.3 70B model',
    `Endpoint: ${GROQ_ENDPOINT} | Models: [${GROQ_MODELS.map((m) => m.id).join(', ')}]`
  );

  assert(
    GEMINI_ENDPOINT === 'https://generativelanguage.googleapis.com/v1beta/models' &&
      DEFAULT_GEMINI_MODEL === 'gemini-1.5-flash' &&
      GEMINI_MODELS.length >= 2,
    'Test 1B: Google Gemini provider configured with official REST endpoint and Gemini 1.5 Flash',
    `Endpoint: ${GEMINI_ENDPOINT} | Models: [${GEMINI_MODELS.map((m) => m.id).join(', ')}]`
  );

  // ------------------------------------------------------------------
  // TEST CATEGORY 2: Public Domain Auto-Routing Logic
  // ------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 2: Environment Detection & Dual-Engine Routing ---');

  // In Node.js environment without window:
  assert(
    isPublicDeployment() === false,
    'Test 2A: Node.js runtime correctly defaults isPublicDeployment to false (non-browser)'
  );

  assert(
    shouldUseCloudAi(true) === false,
    'Test 2B: Localhost with Ollama online routes to Local Ollama engine (dual-engine local preference)'
  );

  assert(
    shouldUseCloudAi(false) === true,
    'Test 2C: Localhost with Ollama offline automatically routes to Cloud AI / fallback'
  );

  // Simulate browser environment on public Vercel domain
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: {
      hostname: 'resume-builder-prod.vercel.app',
    },
  };

  assert(
    isPublicDeployment() === true,
    'Test 2D: Successfully detects public Vercel production domain (*.vercel.app)',
    `Detected hostname: ${globalThis.window.location.hostname}`
  );

  assert(
    shouldUseCloudAi(true) === true && shouldUseCloudAi(false) === true,
    'Test 2E: Public deployment ALWAYS routes to Cloud API regardless of hypothetical local Ollama state',
    'Prevents browser cross-origin requests to client localhost'
  );

  // Clean up simulated window
  globalThis.window = originalWindow;

  // ------------------------------------------------------------------
  // TEST CATEGORY 3: Missing Key Graceful Handling & Error Boundaries
  // ------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 3: Missing Key & Unhandled Rejection Immunity ---');

  // Ensure no stored key
  clearCloudConfig();

  const missingKeyResult = await callCloudAi({
    prompt: 'Analyze resume',
    apiKey: '',
  });

  assert(
    missingKeyResult.success === false &&
      missingKeyResult.isMissingKey === true &&
      typeof missingKeyResult.error === 'string',
    'Test 3A: callCloudAi returns structured failure object without throwing when API key is missing',
    `Error: "${missingKeyResult.error}"`
  );

  const testConnResult = await testCloudConnection({
    apiKey: '',
  });

  assert(
    testConnResult.success === false && typeof testConnResult.message === 'string',
    'Test 3B: testCloudConnection handles empty API key gracefully',
    `Message: "${testConnResult.message}"`
  );

  // ------------------------------------------------------------------
  // TEST CATEGORY 4: Smart Deterministic Parser (Zero-Key Standby)
  // ------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 4: Smart Deterministic Resume Parser ---');

  const sampleResumeInput = `Jaya Sri Palli
Full Stack Developer
Phone: +91-7893414784 | Email: jayasripalli20@gmail.com
LinkedIn: linkedin.com/in/jayasripalli | GitHub: github.com/Jayasri7-ux

OBJECTIVE:
Aspiring graduate with internship experience in software development. Passionate about building scalable applications and eager to contribute to a collaborative organization.

EDUCATION:
B.Tech (IT) | 2022-2026 | SVCET | CGPA: 8.77

TECHNICAL SKILLS:
Languages: Python, Java, JavaScript, C
Frontend: HTML, CSS, React
Backend: Node.js, Django, Flask
Database: SQL, MongoDB
Tools: Git, GitHub, VS Code, Render

INTERNSHIPS:
Larsen & Toubro (L&T), Chennai - Full Stack Developer Intern | Jul 2025 - Dec 2025
- Developed a web-based audit application using React and Django with JWT authentication to securely manage audit records.

PROJECTS:
Fake News Detection System (Python, NLP, Scikit-learn, Flask, React)
- Built a fake news detection system to classify news articles as real or fake with 90% accuracy.`;

  const deterministicProfile = parseResumeDeterministic(sampleResumeInput);

  assert(
    deterministicProfile.personalInfo.fullName.includes('Jaya Sri Palli') &&
      deterministicProfile.personalInfo.email === 'jayasripalli20@gmail.com' &&
      deterministicProfile.personalInfo.phone.includes('7893414784'),
    'Test 4A: Deterministic parser cleanly extracts candidate identity and contact coordinates',
    `Name: "${deterministicProfile.personalInfo.fullName}" | Email: "${deterministicProfile.personalInfo.email}"`
  );

  assert(
    deterministicProfile.coreTechnicalSkills.languages.includes('Python') &&
      deterministicProfile.coreTechnicalSkills.frontend.includes('React') &&
      deterministicProfile.coreTechnicalSkills.backend.includes('Django'),
    'Test 4B: Deterministic parser categorizes skills into strict schema buckets',
    `Languages: [${deterministicProfile.coreTechnicalSkills.languages.join(', ')}] | Frontend: [${deterministicProfile.coreTechnicalSkills.frontend.join(', ')}]`
  );

  assert(
    deterministicProfile.workExperience.length > 0 &&
      deterministicProfile.workExperience[0].company.includes('Larsen & Toubro'),
    'Test 4C: Deterministic parser captures authentic work experience without fabrication',
    `Company: "${deterministicProfile.workExperience[0].company}"`
  );

  const parsedFactAudit = auditFactIntegrity({
    originalText: sampleResumeInput,
    extractedProfile: deterministicProfile,
  });

  assert(
    parsedFactAudit.isVerified === true && parsedFactAudit.integrityScore === 100,
    'Test 4D: Deterministically parsed profile achieves 100% Fact Firewall verification',
    `Integrity Score: ${parsedFactAudit.integrityScore}% | Violations: ${parsedFactAudit.violations.length}`
  );

  // ------------------------------------------------------------------
  // TEST CATEGORY 5: Dual-Engine Parsing Integration (profileParserService)
  // ------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 5: Dual-Engine Resume Parsing Integration ---');

  // When Ollama is offline or on public domain, parseResumeWithOllama smoothly activates deterministic fallback
  const dualEngineParseResult = await parseResumeWithOllama({
    rawResumeText: sampleResumeInput,
    isOllamaOnline: false, // simulate offline / public Vercel
  });

  assert(
    dualEngineParseResult.success === true &&
      dualEngineParseResult.profile !== null &&
      dualEngineParseResult.engine.includes('Deterministic'),
    'Test 5A: parseResumeWithOllama automatically routes to deterministic fallback when Ollama is offline',
    `Engine: "${dualEngineParseResult.engine}" | Candidate: "${dualEngineParseResult.profile.personalInfo.fullName}"`
  );

  // ------------------------------------------------------------------
  // TEST CATEGORY 6: Dual-Engine AI Tailoring Pipeline & Fact Firewall
  // ------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 6: Dual-Engine Tailoring & Fact Firewall ---');

  const tailoringResult = await tailorResumePipeline({
    masterProfile: defaultMasterProfile,
    jobDescription: SAMPLE_JOB_DESCRIPTIONS[0].text,
    isOllamaOnline: false, // route through cloud/fallback
  });

  assert(
    tailoringResult.success === true &&
      tailoringResult.data &&
      tailoringResult.data.tailoredHeadline &&
      tailoringResult.source === 'smart_engine_fallback',
    'Test 6A: tailorResumePipeline executes cleanly with smart_engine_fallback on public/offline environment',
    `Source: ${tailoringResult.source} | Model: ${tailoringResult.model} | Headline: "${tailoringResult.data.tailoredHeadline}"`
  );

  assert(
    tailoringResult.factAudit.integrityScore === 100 && tailoringResult.factAudit.isVerified === true,
    'Test 6B: Fact Firewall maintains 100% verification score on tailored output in fallback mode',
    `Integrity: ${tailoringResult.factAudit.integrityScore}% | Violations: ${tailoringResult.factAudit.violations?.length || 0}`
  );

  // ------------------------------------------------------------------
  // TEST CATEGORY 7: Tech Extraction Pipeline Dual-Engine Fallback
  // ------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 7: Tech Extraction Dual-Engine Resilience ---');

  const techXRay = await runTechExtractionPipeline({
    sanitizedJd: SAMPLE_JOB_DESCRIPTIONS[0].text,
    masterProfile: defaultMasterProfile,
    isOllamaOnline: false,
  });

  assert(
    Array.isArray(techXRay.allExtracted) &&
      techXRay.allExtracted.length > 0 &&
      Array.isArray(techXRay.missingTech),
    'Test 7A: runTechExtractionPipeline extracts requirements and missing tech in fallback mode',
    `Total Extracted: ${techXRay.allExtracted.length} | Missing Identified: ${techXRay.missingTech.length} | Coverage: ${techXRay.coveragePercentage}%`
  );

  // ------------------------------------------------------------------
  // TEST CATEGORY 8: Cloud AI Direct Invocations with Mocked Fetch
  // ------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 8: Cloud LLM Direct API Invocations (Groq & Gemini) ---');

  const originalFetch = globalThis.fetch;

  // Test Groq API Call
  globalThis.fetch = async (url, options) => {
    if (url === GROQ_ENDPOINT) {
      const authHeader = options.headers?.Authorization || '';
      if (!authHeader.includes('Bearer gsk_test_key_123')) {
        return { ok: false, status: 401, text: async () => 'Unauthorized' };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  status: 'ok',
                  tailoredHeadline: 'Full Stack Engineer (Groq Optimized)',
                  matchScore: 94,
                }),
              },
            },
          ],
        }),
      };
    }
    return { ok: false, status: 404 };
  };

  const groqTest = await callCloudAi({
    prompt: 'Tailor resume',
    provider: CLOUD_PROVIDERS.GROQ,
    apiKey: 'gsk_test_key_123',
    model: 'llama-3.3-70b-versatile',
  });

  assert(
    groqTest.success === true &&
      groqTest.provider === 'groq' &&
      groqTest.data.tailoredHeadline === 'Full Stack Engineer (Groq Optimized)',
    'Test 8A: callCloudAi successfully communicates with Groq endpoint and extracts JSON response',
    `Provider: ${groqTest.provider} | Model: ${groqTest.model} | Headline: "${groqTest.data.tailoredHeadline}"`
  );

  // Test Google Gemini API Call
  globalThis.fetch = async (url) => {
    if (url.includes('generativelanguage.googleapis.com')) {
      if (!url.includes('key=AIza_test_gemini_key')) {
        return { ok: false, status: 403, text: async () => 'Forbidden' };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      status: 'ok',
                      tailoredHeadline: 'Backend AI Architect (Gemini Tailored)',
                      matchScore: 96,
                    }),
                  },
                ],
              },
            },
          ],
        }),
      };
    }
    return { ok: false, status: 404 };
  };

  const geminiTest = await callCloudAi({
    prompt: 'Tailor resume',
    provider: CLOUD_PROVIDERS.GEMINI,
    apiKey: 'AIza_test_gemini_key',
    model: 'gemini-1.5-flash',
  });

  assert(
    geminiTest.success === true &&
      geminiTest.provider === 'gemini' &&
      geminiTest.data.tailoredHeadline === 'Backend AI Architect (Gemini Tailored)',
    'Test 8B: callCloudAi successfully communicates with Gemini endpoint and parses candidates payload',
    `Provider: ${geminiTest.provider} | Model: ${geminiTest.model} | Headline: "${geminiTest.data.tailoredHeadline}"`
  );

  // Restore fetch
  globalThis.fetch = originalFetch;

  // ------------------------------------------------------------------
  // TEST CATEGORY 9: Gatekeeper Strict Rules Verification
  // ------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 9: Gatekeeper Rules Preservation ---');

  const mechanicalJd = 'Mechanical Engineer required with 0-1 years experience using SolidWorks, Creo, and AutoCAD.';
  const gatekeeperAbort = evaluateGatekeeperRules(mechanicalJd, defaultMasterProfile);

  assert(
    gatekeeperAbort.status === 'ABORT' && gatekeeperAbort.reason.includes('Domain Mismatch'),
    'Test 9A: Gatekeeper rule engine strictly blocks non-IT mechanical role across all engines',
    `Status: ${gatekeeperAbort.status} | Reason: "${gatekeeperAbort.reason}"`
  );

  console.log('\n================================================================');
  console.log(`   CLOUD AI TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runCloudVerification();
