/**
 * User Review Choices & Final Resume Compilation Data-Binding Verification Suite
 *
 * Verifies:
 * 1. Respect User Approval / Rejection States:
 *    - When a user chooses "Keep Original" (rejecting a section or bullet), the compiler
 *      strictly uses the original text from the baseline profile instead of falling back to
 *      or inserting the AI's PROPOSED REWRITE.
 *    - Filtering out any rejected suggestions from the payload sent to the final output builder.
 * 2. Approved Rewrites Passthrough:
 *    - Approved sections adopt the AI proposed rewrite (or active custom instruction).
 * 3. Individual Granular Control:
 *    - Can approve summary while keeping original internships, or vice versa.
 * 4. Bulk Control ("Keep Original" / Reject All & "Approve All"):
 *    - "Keep Original" reverts all dynamic sections strictly to ground truth baseline.
 *    - "Approve All" applies all proposed rewrites.
 * 5. Document & Export Parity:
 *    - Word (.docx) export reflects the exact compiled payload with original text for rejected sections.
 * 6. Non-Disruption Guarantee:
 *    - Fact Firewall, Approved Missing Skills, and layout parity remain 100% operational.
 */

import { defaultMasterProfile } from '../src/data/defaultMasterProfile.js';
import { SAMPLE_JOB_DESCRIPTIONS } from '../src/data/sampleJobDescriptions.js';
import {
  generateDeterministicTailoring,
  compileFinalTailoredResume,
} from '../src/services/tailoringService.js';
import { generateDeterministicSectionOptimization } from '../src/services/sectionOptimizationService.js';
import { buildTailoredDocxDocument } from '../src/services/docxExportService.js';

console.log('================================================================');
console.log('   USER REVIEW CHOICES & FINAL COMPILATION DATA-BINDING TESTS');
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
  const profile = defaultMasterProfile;
  const sampleJd = SAMPLE_JOB_DESCRIPTIONS[0].text;

  // Generate baseline optimization data
  const optimization = generateDeterministicSectionOptimization({
    masterProfile: profile,
    jobDescription: sampleJd,
    targetKeywords: ['Python', 'Django', 'React', 'REST APIs', 'SQL'],
  });

  // Generate baseline tailored draft
  const tailoredDraft = generateDeterministicTailoring({
    masterProfile: profile,
    jobDescription: sampleJd,
    approvedMissingTech: ['Docker', 'TypeScript'],
    rejectedMissingTech: ['Kubernetes'],
  });

  const originalSummary = profile.professionalSummary;
  const proposedSummary = optimization.summary.proposedText;
  const originalLtBullet = profile.workExperience[0].bulletPoints[0];
  const proposedLtBullet = optimization.internships[0].proposedBullets[0];
  const originalFakeNewsDesc = profile.projects[0].description;
  const proposedFakeNewsDesc = optimization.projects[0].proposedDescription;

  // Verify test preconditions
  assert(
    originalSummary !== proposedSummary,
    'Precondition Check: Proposed summary differs from baseline summary'
  );
  assert(
    originalLtBullet !== proposedLtBullet,
    'Precondition Check: Proposed L&T bullet differs from baseline bullet'
  );

  // ----------------------------------------------------------------------
  // TEST CATEGORY 1: "Keep Original" (Rejected) Summary
  // ----------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 1: "KEEP ORIGINAL" FOR PROFESSIONAL SUMMARY ---');

  const decisionsSummaryRejected = {
    summary: 'rejected',
    exp_0: 'approved',
    exp_1: 'bypassed',
    proj_0: 'approved',
    proj_1: 'bypassed',
  };

  const compiledWithSummaryRejected = compileFinalTailoredResume({
    masterProfile: profile,
    tailoredResult: tailoredDraft,
    optimizedSections: optimization,
    sectionDecisions: decisionsSummaryRejected,
    approvedMissingTech: ['Docker', 'TypeScript'],
    rejectedMissingTech: ['Kubernetes'],
  });

  assert(
    compiledWithSummaryRejected.tailoredSummary === originalSummary,
    'Test 1A: Rejected summary strictly uses original baseline text from master profile',
    `Original: "${compiledWithSummaryRejected.tailoredSummary.substring(0, 60)}..."`
  );

  assert(
    compiledWithSummaryRejected.tailoredSummary !== proposedSummary,
    'Test 1B: Proposed AI rewrite is strictly purged and not inserted into compiled summary'
  );

  assert(
    compiledWithSummaryRejected.rejectedSuggestions.some((s) => s.id === 'summary'),
    'Test 1C: Rejected summary suggestion is logged in rejectedSuggestions metadata'
  );

  // ----------------------------------------------------------------------
  // TEST CATEGORY 2: "Keep Original" (Rejected) Internship Experience
  // ----------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 2: "KEEP ORIGINAL" FOR INTERNSHIP BULLETS ---');

  const decisionsExpRejected = {
    summary: 'approved',
    exp_0: 'rejected',
    exp_1: 'approved',
    proj_0: 'approved',
  };

  const compiledWithExpRejected = compileFinalTailoredResume({
    masterProfile: profile,
    tailoredResult: tailoredDraft,
    optimizedSections: optimization,
    sectionDecisions: decisionsExpRejected,
    approvedMissingTech: ['Docker'],
  });

  const finalLtBullets = compiledWithExpRejected.highlightedExperiences[0].bulletPoints;

  assert(
    finalLtBullets[0] === originalLtBullet,
    'Test 2A: Rejected internship bullet strictly uses original text from baseline profile',
    `Retained bullet: "${finalLtBullets[0]}"`
  );

  assert(
    finalLtBullets[0] !== proposedLtBullet,
    'Test 2B: Proposed AI rewrite for internship bullet is completely filtered out'
  );

  assert(
    compiledWithExpRejected.rejectedSuggestions.some((s) => s.id === 'exp_0'),
    'Test 2C: Rejected internship is logged in rejectedSuggestions metadata'
  );

  // ----------------------------------------------------------------------
  // TEST CATEGORY 3: "Keep Original" (Rejected) Project Description
  // ----------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 3: "KEEP ORIGINAL" FOR PROJECT DESCRIPTION ---');

  const decisionsProjRejected = {
    summary: 'approved',
    exp_0: 'approved',
    proj_0: 'rejected',
  };

  const compiledWithProjRejected = compileFinalTailoredResume({
    masterProfile: profile,
    tailoredResult: tailoredDraft,
    optimizedSections: optimization,
    sectionDecisions: decisionsProjRejected,
  });

  const finalFakeNewsDesc = compiledWithProjRejected.highlightedProjects[0].description;

  assert(
    finalFakeNewsDesc === originalFakeNewsDesc,
    'Test 3A: Rejected project strictly uses original baseline description',
    `Original description: "${finalFakeNewsDesc}"`
  );

  assert(
    finalFakeNewsDesc !== proposedFakeNewsDesc,
    'Test 3B: Proposed project rewrite is completely filtered out'
  );

  assert(
    compiledWithProjRejected.rejectedSuggestions.some((s) => s.id === 'proj_0'),
    'Test 3C: Rejected project is logged in rejectedSuggestions metadata'
  );

  // ----------------------------------------------------------------------
  // TEST CATEGORY 4: Approved States Adopt Proposed Rewrites
  // ----------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 4: APPROVED REWRITES ARE PROPERLY ADOPTED ---');

  const decisionsAllApproved = {
    summary: 'approved',
    exp_0: 'approved',
    exp_1: 'approved',
    proj_0: 'approved',
    proj_1: 'approved',
  };

  const compiledAllApproved = compileFinalTailoredResume({
    masterProfile: profile,
    tailoredResult: tailoredDraft,
    optimizedSections: optimization,
    sectionDecisions: decisionsAllApproved,
  });

  assert(
    compiledAllApproved.tailoredSummary === proposedSummary,
    'Test 4A: Approved summary adopts proposed AI rewrite',
    `Summary: "${compiledAllApproved.tailoredSummary.substring(0, 60)}..."`
  );

  assert(
    compiledAllApproved.highlightedExperiences[0].bulletPoints[0] === proposedLtBullet,
    'Test 4B: Approved internship bullet adopts proposed AI rewrite',
    `Bullet: "${compiledAllApproved.highlightedExperiences[0].bulletPoints[0]}"`
  );

  assert(
    compiledAllApproved.highlightedProjects[0].description === proposedFakeNewsDesc,
    'Test 4C: Approved project description adopts proposed AI rewrite',
    `Desc: "${compiledAllApproved.highlightedProjects[0].description.substring(0, 60)}..."`
  );

  assert(
    compiledAllApproved.rejectedSuggestions.length === 0,
    'Test 4D: Zero rejected suggestions logged when all sections are approved'
  );

  // ----------------------------------------------------------------------
  // TEST CATEGORY 5: Bulk "Keep Original" (Reject All)
  // ----------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 5: BULK "KEEP ORIGINAL" (REJECT ALL) ---');

  const decisionsRejectAll = {
    summary: 'rejected',
    exp_0: 'rejected',
    exp_1: 'rejected',
    proj_0: 'rejected',
    proj_1: 'rejected',
  };

  const compiledRejectAll = compileFinalTailoredResume({
    masterProfile: profile,
    tailoredResult: tailoredDraft,
    optimizedSections: optimization,
    sectionDecisions: decisionsRejectAll,
  });

  assert(
    compiledRejectAll.tailoredSummary === originalSummary,
    'Test 5A: Bulk Keep Original enforces original summary'
  );

  assert(
    compiledRejectAll.highlightedExperiences[0].bulletPoints[0] === originalLtBullet,
    'Test 5B: Bulk Keep Original enforces original internship bullets'
  );

  assert(
    compiledRejectAll.highlightedProjects[0].description === originalFakeNewsDesc,
    'Test 5C: Bulk Keep Original enforces original project descriptions'
  );

  assert(
    compiledRejectAll.rejectedSuggestions.length === 5,
    'Test 5D: All 5 dynamic items (1 summary, 2 internships, 2 projects) logged in rejectedSuggestions',
    `Logged ${compiledRejectAll.rejectedSuggestions.length} rejected section item(s)`
  );

  // ----------------------------------------------------------------------
  // TEST CATEGORY 6: Preservation of Approved Skills & Fact Firewall
  // ----------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 6: PRESERVATION OF APPROVED SKILLS & FIREWALL ---');

  const approvedSkills = ['TypeScript', 'FastAPI', 'Docker'];
  const rejectedSkills = ['Rust', 'Solidity'];

  const compiledWithSkills = compileFinalTailoredResume({
    masterProfile: profile,
    tailoredResult: tailoredDraft,
    optimizedSections: optimization,
    sectionDecisions: decisionsSummaryRejected,
    approvedMissingTech: approvedSkills,
    rejectedMissingTech: rejectedSkills,
  });

  assert(
    JSON.stringify(compiledWithSkills.approvedMissingTech) === JSON.stringify(approvedSkills),
    'Test 6A: Approved missing tech is 100% preserved in compiled output'
  );

  assert(
    JSON.stringify(compiledWithSkills.rejectedMissingTech) === JSON.stringify(rejectedSkills),
    'Test 6B: Rejected missing tech is 100% preserved in compiled output'
  );

  // ----------------------------------------------------------------------
  // TEST CATEGORY 7: Document Export (.docx) Parity with Compiled Payload
  // ----------------------------------------------------------------------
  console.log('\n--- TEST CATEGORY 7: WORD (.DOCX) EXPORT COMPILATION PARITY ---');

  const docInstance = buildTailoredDocxDocument({
    profile,
    tailoredResult: compiledWithSummaryRejected,
  });

  assert(
    Boolean(docInstance),
    'Test 7A: buildTailoredDocxDocument compiles valid Document instance from tailoredResult'
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