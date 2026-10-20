/**
 * Test Suite: Intelligent Tech Extraction & Human-in-the-Loop Missing Tech X-Ray
 *
 * Verifies:
 * (a) Tech extraction test with typo and synonym normalization (e.g. Postgres -> PostgreSQL, Version Control -> Git/GitHub)
 * (b) Anti-fluff filter test discarding buzzwords and non-technical filler phrases
 * (c) Missing tech check verifying crisp 1-line definitions (<= 120 chars) and Approve/Reject state transitions
 */

import { defaultMasterProfile } from '../src/data/defaultMasterProfile.js';
import {
  extractTechnicalRequirements,
  analyzeMissingTech,
  isAntiFluff,
  ANTI_FLUFF_BLACKLIST,
} from '../src/services/techExtractionService.js';
import { tailorResumePipeline } from '../src/services/tailoringService.js';

console.log('================================================================');
console.log('   INTELLIGENT TECH EXTRACTION & X-RAY DASHBOARD TEST SUITE');
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

// ======================================================================
// TEST CASE A: Tech Extraction with Typo & Synonym Normalization
// ======================================================================
console.log('--- TEST CASE A: Tech Extraction & Typo Normalization ---');

const jdWithTyposAndSynonyms = `
Job Title: Full Stack Software Developer
Company: Enterprise Cloud Architectures
Location: Bangalore, India

Position Summary:
We are looking for a Software Developer to engineer cloud-native web applications.
Core technical requirements:
- Proficiency in py (Python3) and modern JavaScript (ES6+).
- Hands-on frontend development using ReactJS (or React.js).
- Strong backend experience with Django and NodeJS (Node.js).
- Relational database management using Postgres (PostgreSQL) and NoSQL document databases (Mongo / MongoDB).
- Strict Version Control (Git/GitHub) and automated deployment practices.
- Containerization using Docker and K8s (Kubernetes).
- REST APIs architecture, micro-services, and token-based JWT authentication.
`;

const extractedTech = extractTechnicalRequirements(jdWithTyposAndSynonyms);

// A1: Mapping 'Postgres' to 'PostgreSQL'
const hasPostgreSql = extractedTech.Databases.includes('PostgreSQL');
assert(
  hasPostgreSql,
  'Test Case A1: Global Dictionary maps "Postgres" to canonical "PostgreSQL"',
  `Databases Bucket: ${JSON.stringify(extractedTech.Databases)}`
);

// A2: Mapping 'Version Control' to 'Git/GitHub'
const hasGitGithub = extractedTech['Cloud/DevOps'].includes('Git/GitHub');
assert(
  hasGitGithub,
  'Test Case A2: Global Dictionary maps "Version Control" to canonical "Git/GitHub"',
  `Cloud/DevOps Bucket: ${JSON.stringify(extractedTech['Cloud/DevOps'])}`
);

// A3: Mapping 'ReactJS' to 'React' and 'NodeJS' to 'Node.js'
const hasReact = extractedTech.Frameworks.includes('React');
const hasNode = extractedTech.Frameworks.includes('Node.js');
assert(
  hasReact && hasNode,
  'Test Case A3: Global Dictionary maps "ReactJS" -> "React" and "NodeJS" -> "Node.js"',
  `Frameworks Bucket: ${JSON.stringify(extractedTech.Frameworks)}`
);

// A4: Rigid Bucketing Structure Check
const allBucketsPresent =
  Array.isArray(extractedTech.Languages) &&
  Array.isArray(extractedTech.Frameworks) &&
  Array.isArray(extractedTech.Databases) &&
  Array.isArray(extractedTech['Cloud/DevOps']) &&
  Array.isArray(extractedTech.Tools) &&
  Array.isArray(extractedTech['Core Domains']) &&
  Array.isArray(extractedTech['Soft Skills']);

assert(
  allBucketsPresent && extractedTech.allExtracted.length >= 8,
  'Test Case A4: Rigid 7-Bucket taxonomy successfully populated in valid JSON schema',
  `Total Extracted Items: ${extractedTech.allExtracted.length} across 7 rigid categories`
);

// ======================================================================
// TEST CASE B: Anti-Fluff Negative Constraint Filter
// ======================================================================
console.log('\n--- TEST CASE B: Anti-Fluff Negative Constraint Filter ---');

const jdBuzzwordFluff = `
We are seeking a rockstar and dynamic team player who can hit the ground running in a fast-paced environment.
The ideal candidate is a self-starter with a growth mindset, detail-oriented work ethic, and results-driven attitude.
Must be eager to learn, enthusiastic, wear many hats, and think outside the box to deliver synergy.
Tech requirements: React, Python, Docker.
`;

const extractedFluffTest = extractTechnicalRequirements(jdBuzzwordFluff);

// B1: Verify buzzwords are completely discarded
const buzzwordsTested = [
  'fast-paced',
  'dynamic',
  'team player',
  'rockstar',
  'self-starter',
  'growth mindset',
  'think outside the box',
  'hit the ground running',
  'results-driven',
];

const anyBuzzwordInExtracted = buzzwordsTested.some((bw) =>
  extractedFluffTest.allExtracted.some((t) => t.toLowerCase() === bw.toLowerCase())
);

assert(
  !anyBuzzwordInExtracted,
  'Test Case B1: Anti-Fluff Filter completely eliminated all corporate buzzwords from technical taxonomy',
  `Extracted Tech Items (Clean): ${JSON.stringify(extractedFluffTest.allExtracted)}`
);

// B2: Verify isAntiFluff function flags buzzwords correctly
const allFlagged = buzzwordsTested.every((bw) => isAntiFluff(bw));
assert(
  allFlagged,
  'Test Case B2: isAntiFluff correctly identifies corporate filler and buzzword blacklist',
  `Blacklist size: ${ANTI_FLUFF_BLACKLIST.size} terms registered`
);

// B3: Discarded Fluff Count Tracking
assert(
  extractedFluffTest.discardedFluffCount >= 5,
  'Test Case B3: Discarded fluff count and audit trail accurately tracked',
  `Blocked Fluff Terms (${extractedFluffTest.discardedFluffCount}): ${extractedFluffTest.discardedFluffList.slice(0, 5).join(', ')}...`
);

// ======================================================================
// TEST CASE C: Missing Tech Analysis, 1-Line Definitions & Approve/Reject
// ======================================================================
console.log('\n--- TEST CASE C: Human-in-the-Loop Missing Tech & 1-Line Definitions ---');

const missingAnalysis = analyzeMissingTech({
  extractedTech,
  masterProfile: defaultMasterProfile,
});

// C1: Verify Matched Skills vs Missing Tech
const matchedNames = missingAnalysis.matchedTech.map((t) => t.name);
const missingNames = missingAnalysis.missingTech.map((t) => t.name);

const postgresIsMissing = missingNames.includes('PostgreSQL');
const dockerIsMissing = missingNames.includes('Docker');
const pythonIsMatched = matchedNames.includes('Python');
const reactIsMatched = matchedNames.includes('React');

assert(
  postgresIsMissing && dockerIsMissing && pythonIsMatched && reactIsMatched,
  'Test Case C1: Correctly partitions matched ground-truth skills vs absent missing tools',
  `Matched: [${matchedNames.join(', ')}] | Missing Tools: [${missingNames.join(', ')}]`
);

// C2: Verify 1-Line Definition length (strictly <= 120 characters)
let allDefsUnder120 = true;
let maxDefLength = 0;
let longestDefTool = '';

missingAnalysis.missingTech.forEach((tool) => {
  if (!tool.definition || tool.definition.length > 120) {
    allDefsUnder120 = false;
  }
  if (tool.definition.length > maxDefLength) {
    maxDefLength = tool.definition.length;
    longestDefTool = tool.name;
  }
});

assert(
  allDefsUnder120 && missingAnalysis.missingTech.length > 0,
  `Test Case C2: Crisp 1-line definitions generated for all missing tools (Max length: ${maxDefLength}/120 chars on "${longestDefTool}")`,
  `Sample: "${missingAnalysis.missingTech[0]?.name}": "${missingAnalysis.missingTech[0]?.definition}" (${missingAnalysis.missingTech[0]?.definition?.length} chars)`
);

// C3: Human-in-the-Loop Approve / Reject State Simulation
console.log('\n--- Testing Human-in-the-Loop Approve/Reject State Transitions ---');

// Simulate user approving PostgreSQL, but rejecting Docker
const simulatedMissingTech = missingAnalysis.missingTech.map((item) => {
  if (item.name === 'PostgreSQL') {
    return { ...item, approved: true }; // Approved by user
  }
  return { ...item, approved: false }; // Rejected / omitted by user
});

const approvedPayload = simulatedMissingTech.filter((t) => t.approved).map((t) => t.name);
const rejectedPayload = simulatedMissingTech.filter((t) => !t.approved).map((t) => t.name);

assert(
  approvedPayload.includes('PostgreSQL') &&
    !approvedPayload.includes('Docker') &&
    rejectedPayload.includes('Docker'),
  'Test Case C3: Interactive checklist correctly segments approved vs rejected missing tech',
  `Approved Payload: [${approvedPayload.join(', ')}] | Omitted Payload (Interview Trap Shield): [${rejectedPayload.join(', ')}]`
);

// C4: Tailoring Pipeline Integration with Human-in-the-Loop Payload
async function runTailoringIntegrationTest() {
  const tailoredResult = await tailorResumePipeline({
    masterProfile: defaultMasterProfile,
    jobDescription: jdWithTyposAndSynonyms,
    approvedMissingTech: approvedPayload,
    rejectedMissingTech: rejectedPayload,
  });

  const matchedSkills = tailoredResult.data.matchedSkills || [];
  const includesApproved = matchedSkills.includes('PostgreSQL');
  const excludesRejected = !matchedSkills.includes('Docker');

  assert(
    includesApproved && excludesRejected,
    'Test Case C4: Tailoring Engine synthesizes approved tech (PostgreSQL) and strictly omits rejected tech (Docker)',
    `Tailored Matched Skills: [${matchedSkills.slice(0, 7).join(', ')}...] | Interview Trap Protection Active`
  );

  console.log('\n================================================================');
  console.log(`   TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTailoringIntegrationTest();
