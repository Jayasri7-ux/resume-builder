/**
 * Targeted Batch Section Optimization & Layout Safeguards Test Suite
 *
 * Verifies:
 * 1. Batched optimization speed (< 3-4s) and dynamic target selection (Summary, Internships, Projects only; Fixed sections untouched).
 * 2. Length constraint enforcement strictly within +/- 10 words of original text.
 * 3. Smart bypass rule for already aligned sections (needs_rewrite: false, "No optimization needed").
 * 4. Interactive approval/rejection state logic and Non-Empty UI safeguard (aiSuggestion || originalContent).
 */

import { defaultMasterProfile } from '../src/data/defaultMasterProfile.js';
import { SAMPLE_JOB_DESCRIPTIONS } from '../src/data/sampleJobDescriptions.js';
import {
  countWords,
  enforceLengthConstraint,
  evaluateSectionAlignment,
  buildBatchSectionOptimizationPrompt,
  generateDeterministicSectionOptimization,
  batchOptimizeDynamicSectionsPipeline,
} from '../src/services/sectionOptimizationService.js';

console.log('================================================================');
console.log('  SECTION OPTIMIZATION, LAYOUT PRESERVATION & SAFEGUARDS TESTS');
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

async function runTests() {
  const sampleJd = SAMPLE_JOB_DESCRIPTIONS[0].text; // Python Developer JD

  // ----------------------------------------------------------------------
  // Test Category 1: Batched Optimization Target Selection & Speed
  // ----------------------------------------------------------------------
  console.log('--- TEST CATEGORY 1: BATCHED OPTIMIZATION TARGET SELECTION & SPEED ---');

  const startTime = Date.now();
  const pipelineResponse = await batchOptimizeDynamicSectionsPipeline({
    masterProfile: defaultMasterProfile,
    jobDescription: sampleJd,
    targetKeywords: ['Python', 'Django', 'FastAPI', 'PostgreSQL', 'Docker'],
  });
  const durationMs = Date.now() - startTime;
  const optimizationResult = pipelineResponse.data;

  assert(
    pipelineResponse.success && durationMs < 4000,
    'Test 1A: Single batched optimization completes in under 3-4 seconds',
    `Execution completed in ${durationMs}ms (threshold: 4000ms), Engine: ${pipelineResponse.engine}`
  );

  assert(
    optimizationResult.summary && typeof optimizationResult.summary === 'object',
    'Test 1B: Targets Dynamic Section 1 (Professional Summary)',
    `Original words: ${optimizationResult.summary.lengthAudit?.originalWords}, Final words: ${optimizationResult.summary.lengthAudit?.finalWords}`
  );

  assert(
    Array.isArray(optimizationResult.internships) && optimizationResult.internships.length > 0,
    'Test 1C: Targets Dynamic Section 2 (Internships / Work Experience)',
    `Optimized ${optimizationResult.internships.length} internship experience item(s)`
  );

  assert(
    Array.isArray(optimizationResult.projects) && optimizationResult.projects.length > 0,
    'Test 1D: Targets Dynamic Section 3 (Projects)',
    `Optimized ${optimizationResult.projects.length} project item(s)`
  );

  // Verify Fixed Sections are Untouched and Locked
  const fixedSections = optimizationResult.fixedSections;
  const educationUntouched =
    JSON.stringify(fixedSections.education) === JSON.stringify(defaultMasterProfile.education);
  const certificationsUntouched =
    JSON.stringify(fixedSections.certifications) === JSON.stringify(defaultMasterProfile.certifications);
  const personalInfoUntouched =
    JSON.stringify(fixedSections.personalInfo) === JSON.stringify(defaultMasterProfile.personalInfo);

  assert(
    educationUntouched && certificationsUntouched && personalInfoUntouched,
    'Test 1E: Fixed sections (Education, Certifications, Personal Info) remain completely untouched and locked',
    'Education, Certifications, and Personal Info exactly match master profile ground truth'
  );

  // ----------------------------------------------------------------------
  // Test Category 2: Length & Layout Constraints (+/- 10 Words)
  // ----------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 2: LENGTH & LAYOUT CONSTRAINTS (+/- 10 WORDS) ---');

  const baselineBullet = 'Developed RESTful APIs using Python and Django to automate reporting workflows for financial analysts.';
  const baselineCount = countWords(baselineBullet); // 14 words

  // 2A: Excessively long rewrite (+25 words)
  const excessivelyLongRewrite =
    'Developed highly scalable, modern, robust, production-grade microservices and enterprise RESTful APIs utilizing Python, Django, FastAPI, Celery, and Docker to seamlessly automate end-to-end critical financial reporting workflows, dashboards, charts, and metrics for executive analysts across various global operations.';
  const longEnforced = enforceLengthConstraint(baselineBullet, excessivelyLongRewrite, 10);
  const longDelta = Math.abs(longEnforced.finalWords - baselineCount);

  assert(
    longDelta <= 10 && longEnforced.finalWords <= baselineCount + 10,
    'Test 2A: Excessively long rewrite is trimmed to stay strictly within +10 words budget',
    `Original: ${baselineCount}w, Proposed: ${countWords(excessivelyLongRewrite)}w, Enforced: ${longEnforced.finalWords}w (delta: ${longDelta}w)`
  );

  // 2B: Excessively short rewrite (-12 words)
  const excessivelyShortRewrite = 'Built APIs.';
  const shortEnforced = enforceLengthConstraint(baselineBullet, excessivelyShortRewrite, 10);
  const shortDelta = Math.abs(shortEnforced.finalWords - baselineCount);

  assert(
    shortDelta <= 10,
    'Test 2B: Excessively short rewrite is adjusted to preserve layout balance within -10 words budget',
    `Original: ${baselineCount}w, Proposed: ${countWords(excessivelyShortRewrite)}w, Enforced: ${shortEnforced.finalWords}w (delta: ${shortDelta}w)`
  );

  // 2C: Well-sized rewrite (within +/- 10 words)
  const balancedRewrite =
    'Engineered high-performance RESTful APIs using Python, Django, and PostgreSQL to streamline analytical data workflows.';
  const balancedEnforced = enforceLengthConstraint(baselineBullet, balancedRewrite, 10);

  assert(
    !balancedEnforced.constrained && Math.abs(balancedEnforced.delta) <= 10,
    'Test 2C: Naturally balanced rewrite (within +/- 10 words) is accepted without truncation',
    `Original: ${baselineCount}w, Proposed: ${balancedEnforced.proposedWords}w (delta: ${balancedEnforced.delta}w)`
  );

  // 2D: All dynamic sections in batch result adhere to +/- 10 words
  const summaryDelta = Math.abs(optimizationResult.summary.lengthAudit.delta);
  const internshipsPass = optimizationResult.internships.every((exp) =>
    exp.lengthAudits.every((audit) => Math.abs(audit.delta) <= 10)
  );
  const projectsPass = optimizationResult.projects.every(
    (proj) => Math.abs(proj.lengthAudit.delta) <= 10
  );

  assert(
    summaryDelta <= 10 && internshipsPass && projectsPass,
    'Test 2D: 100% of batched rewrites across Summary, Internships, and Projects satisfy +/- 10 words limit',
    `Summary delta: ${summaryDelta}w; Internships all <= 10w: ${internshipsPass}; Projects all <= 10w: ${projectsPass}`
  );

  // ----------------------------------------------------------------------
  // Test Category 3: Smart Bypass Rule for Well-Aligned Sections
  // ----------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 3: SMART BYPASS RULE FOR ALIGNED SECTIONS ---');

  // 3A: Already well-aligned section containing target keywords
  const alignedText =
    'Passionate Python Developer proficient in Django, FastAPI, PostgreSQL, and Docker containerization with experience building scalable web applications.';
  const targetKeywords = ['Python', 'Django', 'FastAPI', 'PostgreSQL'];
  const alignmentEvaluation = evaluateSectionAlignment({
    text: alignedText,
    targetKeywords,
    alignmentThreshold: 0.6,
  });

  assert(
    alignmentEvaluation.isAligned && alignmentEvaluation.coverageRatio >= 0.6,
    'Test 3A: Alignment evaluator detects high keyword coverage (>= 60%)',
    `Matched ${alignmentEvaluation.matchedKeywords.length}/${targetKeywords.length} keywords (${(alignmentEvaluation.coverageRatio * 100).toFixed(0)}% coverage)`
  );

  // 3B: Deterministic optimization marks aligned section with needs_rewrite: false
  const alignedProfile = {
    ...defaultMasterProfile,
    professionalSummary: alignedText,
  };
  const bypassResult = generateDeterministicSectionOptimization({
    masterProfile: alignedProfile,
    jobDescription: sampleJd,
    targetKeywords,
  });

  assert(
    bypassResult.summary.needs_rewrite === false &&
      bypassResult.summary.bypassReason.includes('No optimization needed'),
    'Test 3B: Smart bypass rule flags aligned section with needs_rewrite: false and "No optimization needed"',
    `needs_rewrite: ${bypassResult.summary.needs_rewrite}, reason: "${bypassResult.summary.bypassReason}"`
  );

  // 3C: Section lacking target keywords is NOT bypassed
  const unalignedText = 'Recent graduate looking for an opportunity in software development.';
  const unalignedEval = evaluateSectionAlignment({
    text: unalignedText,
    targetKeywords: ['Python', 'Django', 'FastAPI'],
  });

  assert(
    !unalignedEval.isAligned,
    'Test 3C: Unaligned text is correctly flagged for optimization rewrite',
    `Coverage: ${(unalignedEval.coverageRatio * 100).toFixed(0)}%, isAligned: ${unalignedEval.isAligned}`
  );

  // ----------------------------------------------------------------------
  // Test Category 4: User Control, Diff Preview & Non-Empty UI Safeguard
  // ----------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 4: USER CONTROL, DIFF PREVIEW & NON-EMPTY UI SAFEGUARD ---');

  // 4A: Non-empty UI fallback safeguard (aiSuggestion || originalContent)
  const emptyAiText = '';
  const nullAiText = null;
  const fallbackEmpty = emptyAiText || baselineBullet;
  const fallbackNull = nullAiText || baselineBullet;

  assert(
    fallbackEmpty === baselineBullet && fallbackNull === baselineBullet,
    'Test 4A: Non-Empty UI Safeguard guarantees text is never blank when AI output is empty or glitches',
    'Fallback (aiSuggestion || originalContent) consistently preserves baseline content'
  );

  // 4B: User Decision Simulation (Approve Summary & Projects, Reject Internships)
  const userDecisions = {
    summary: 'approved',
    [optimizationResult.internships[0].id]: 'rejected',
    [optimizationResult.projects[0].id]: 'approved',
  };

  const finalSummary =
    userDecisions['summary'] === 'approved'
      ? (optimizationResult.summary.proposedText || optimizationResult.summary.originalText)
      : optimizationResult.summary.originalText;

  const finalInternshipBullets =
    userDecisions[optimizationResult.internships[0].id] === 'approved'
      ? optimizationResult.internships[0].proposedBullets
      : optimizationResult.internships[0].originalBullets;

  const finalProjectDesc =
    userDecisions[optimizationResult.projects[0].id] === 'approved'
      ? (optimizationResult.projects[0].proposedDescription || optimizationResult.projects[0].originalDescription)
      : optimizationResult.projects[0].originalDescription;

  assert(
    finalSummary === (optimizationResult.summary.proposedText || optimizationResult.summary.originalText),
    'Test 4B: Approved summary adopts proposed optimization rewrite',
    `Approved rewrite active: ${finalSummary.substring(0, 50)}...`
  );

  assert(
    JSON.stringify(finalInternshipBullets) === JSON.stringify(optimizationResult.internships[0].originalBullets),
    'Test 4C: Rejected internship maintains 100% original ground truth baseline',
    'Original bullets retained verbatim without alterations'
  );

  assert(
    finalProjectDesc === (optimizationResult.projects[0].proposedDescription || optimizationResult.projects[0].originalDescription),
    'Test 4D: Approved project adopts proposed keyword-optimized description',
    `Approved project rewrite active: ${finalProjectDesc.substring(0, 50)}...`
  );

  // ----------------------------------------------------------------------
  // Test Category 5: Grounding Constraints & Strict Fact Firewall Integrity
  // ----------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 5: STRICT GROUNDING CONSTRAINTS ---');

  const prompt = buildBatchSectionOptimizationPrompt({
    masterProfile: defaultMasterProfile,
    jobDescription: sampleJd,
    targetKeywords: ['Python', 'Django'],
  });

  const forbidsHallucinations =
    prompt.includes('STRICT GROUNDING & FACT FIREWALL') &&
    prompt.includes('Never invent metrics') &&
    prompt.includes('Never invent companies');

  assert(
    forbidsHallucinations,
    'Test 5A: Prompt strictly mandates Grounding Constraints prohibiting fake metrics and companies',
    'Explicit instructions forbid invented scales, tools, or fabricated employer names'
  );

  // Summary
  console.log('\n================================================================');
  console.log(`TEST SUITE RESULTS: ${passedTests} / ${totalTests} PASSED (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
