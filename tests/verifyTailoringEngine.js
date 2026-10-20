/**
 * Mandatory Verification Test Suite for Milestone 3:
 * The Job Description Ingestion & AI Tailoring Engine
 *
 * Verifies:
 * 1. Strict XML prompt construction (<user_jd> and <user_input>)
 * 2. Secure JSON schema output compliance
 * 3. Accurate JD keyword extraction and skills alignment
 * 4. Immutable Fact Firewall verification on tailored experience
 * 5. Robust pipeline error boundaries and fallback resilience
 */

import { defaultMasterProfile } from '../src/data/defaultMasterProfile.js';
import { SAMPLE_JOB_DESCRIPTIONS } from '../src/data/sampleJobDescriptions.js';
import {
  buildTailoringPrompt,
  generateDeterministicTailoring,
  tailorResumePipeline,
} from '../src/services/tailoringService.js';
import { auditFactIntegrity } from '../src/services/factFirewall.js';

console.log('================================================================');
console.log('   MILESTONE 3: AI TAILORING ENGINE VERIFICATION TEST SUITE');
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

// ----------------------------------------------------------------------
// Test 1: Verify XML Prompt Construction & Strict Delimiters
// ----------------------------------------------------------------------
const sampleJd = SAMPLE_JOB_DESCRIPTIONS[0].text;
const generatedPrompt = buildTailoringPrompt({
  masterProfile: defaultMasterProfile,
  jobDescription: sampleJd,
});

const hasOpenJd = generatedPrompt.includes('<user_jd>');
const hasCloseJd = generatedPrompt.includes('</user_jd>');
const hasOpenInput = generatedPrompt.includes('<user_input>');
const hasCloseInput = generatedPrompt.includes('</user_input>');
const containsCandidateName = generatedPrompt.includes(defaultMasterProfile.personalInfo.fullName);
const containsImmutableRule = generatedPrompt.includes('IMMUTABLE FACT FIREWALL');

assert(
  hasOpenJd && hasCloseJd && hasOpenInput && hasCloseInput,
  'Test 1A: Prompt strictly enforces <user_jd> and <user_input> XML delimiters',
  'Found matching opening & closing tags for both JD and User Input'
);

assert(
  containsCandidateName && containsImmutableRule,
  'Test 1B: Prompt embeds serialized profile data and Fact Firewall constraints',
  `Candidate: ${defaultMasterProfile.personalInfo.fullName} | Anti-hallucination guard active`
);

// ----------------------------------------------------------------------
// Test 2: Verify Sample Job Descriptions Presets
// ----------------------------------------------------------------------
assert(
  Array.isArray(SAMPLE_JOB_DESCRIPTIONS) && SAMPLE_JOB_DESCRIPTIONS.length >= 4,
  'Test 2: Sample Job Description presets defined for target job families',
  `Configured ${SAMPLE_JOB_DESCRIPTIONS.length} presets: [${SAMPLE_JOB_DESCRIPTIONS.map((s) => s.title).join(', ')}]`
);

// ----------------------------------------------------------------------
// Test 3: Test Tailoring Engine Output Schema & Logic
// ----------------------------------------------------------------------
const tailored = generateDeterministicTailoring({
  masterProfile: defaultMasterProfile,
  jobDescription: sampleJd,
});

assert(
  typeof tailored.tailoredHeadline === 'string' && tailored.tailoredHeadline.length > 5,
  'Test 3A: Tailored headline generated matching target JD',
  `Headline: "${tailored.tailoredHeadline}"`
);

assert(
  typeof tailored.tailoredSummary === 'string' && tailored.tailoredSummary.length > 50,
  'Test 3B: Tailored executive summary generated',
  `Summary Length: ${tailored.tailoredSummary.length} chars`
);

assert(
  Array.isArray(tailored.matchedSkills) && tailored.matchedSkills.length > 0,
  'Test 3C: Matched skills extracted from profile against JD keywords',
  `Matched: [${tailored.matchedSkills.join(', ')}]`
);

assert(
  typeof tailored.matchScore === 'number' && tailored.matchScore >= 60 && tailored.matchScore <= 100,
  'Test 3D: ATS JD Match Score computed within valid 60-100% range',
  `Match Score: ${tailored.matchScore}%`
);

// ----------------------------------------------------------------------
// Test 4: Fact Firewall Audit on Tailored Experiences
// ----------------------------------------------------------------------
const originalSourceText = `jaya sri palli
7893414784 jayasripalli20@gmail.com
Larsen & Toubro L&T Chennai Full Stack Developer Intern
Infosys Springboard Python Intern
SVCET 8.77
Fake News Detection System AI Health Chatbot Smart India Hackathon`;

const audit = auditFactIntegrity({
  originalText: originalSourceText,
  extractedProfile: {
    personalInfo: defaultMasterProfile.personalInfo,
    workExperience: tailored.highlightedExperiences,
  },
});

assert(
  audit.isVerified && audit.integrityScore === 100 && audit.violations.length === 0,
  'Test 4: Immutable Fact Firewall verifies 100% ground-truth integrity on tailored experience',
  `Integrity Score: ${audit.integrityScore}% | Violations: ${audit.violations.length}`
);

// ----------------------------------------------------------------------
// Test 5: Verify End-to-End Pipeline Handler
// ----------------------------------------------------------------------
async function runAsyncTests() {
  try {
    const pipelineResult = await tailorResumePipeline({
      masterProfile: defaultMasterProfile,
      jobDescription: SAMPLE_JOB_DESCRIPTIONS[1].text, // Python Backend Engineer
    });

    assert(
      pipelineResult.success && pipelineResult.data && pipelineResult.data.tailoredHeadline,
      'Test 5A: tailorResumePipeline executes cleanly and returns structured tailored data',
      `Target: ${pipelineResult.data.tailoredHeadline} | Engine: ${pipelineResult.model}`
    );

    assert(
      pipelineResult.factAudit.integrityScore === 100,
      'Test 5B: Pipeline audit maintains 100% Fact Firewall integrity',
      `Source: ${pipelineResult.source} | Model: ${pipelineResult.model}`
    );
  } catch (err) {
    assert(false, 'Test 5: tailorResumePipeline threw an unexpected error', err.message);
  }

  console.log('\n================================================================');
  console.log(`   TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAsyncTests();
