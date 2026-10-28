/**
 * Mandatory Verification Test Suite for Gatekeeper AI Engine & Baseline Scoring
 *
 * Verifies:
 * 1. Sanitization & Word Count Validation (> 50 words requirement)
 * 2. Gatekeeper Senior Experience Guardrail (> 1 year blocked)
 * 3. Gatekeeper Unrelated Industry Guardrail (Civil, Mechanical, Nursing blocked)
 * 4. Valid Entry-Level Crossover Tech Test (Approved + Deterministic Baseline Score [40, 85])
 * 5. Full Integration Workflow Handler
 */

import { defaultMasterProfile } from '../src/data/defaultMasterProfile.js';
import {
  validateJdSanity,
  sanitizeJobDescription,
  evaluateGatekeeperRules,
  calculateBaselineScore,
  evaluateJobDescriptionPipeline,
  detectConversationalContamination,
  stripConversationalArtifacts,
  CONVERSATIONAL_ARTIFACT_PATTERNS,
  detectExclusiveInstitutionRequirement,
  candidateMatchesInstitutionTier,
  evaluateExclusiveInstitutionTier,
  EXCLUSIVE_INSTITUTION_PATTERNS,
  getCandidateGraduationYear,
  evaluateBatchYearEligibility,
  RESTRICTIVE_BATCH_PATTERNS,
  isStandardStructuredBulletedJd,
  evaluateExperienceLevel,
  EXACT_EXPERIENCE_MISMATCH_FAILURE_REASON,
} from '../src/services/gatekeeperService.js';
import { extractTechnicalRequirements } from '../src/services/techExtractionService.js';

console.log('================================================================');
console.log('   GATEKEEPER AI ENGINE & BASELINE SCORING TEST SUITE');
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
// TEST CASE A: Minimum Character Count & Sanitization (< 20 characters)
// ======================================================================
console.log('--- TEST CASE A: Minimum Character Count & Sanitization Check (< 20 characters) ---');

const shortText = 'Short JD test';
let shortTextCaught = false;
let shortErrorMessage = '';

try {
  sanitizeJobDescription(shortText);
} catch (err) {
  shortTextCaught = true;
  shortErrorMessage = err.message;
}

assert(
  shortTextCaught && shortErrorMessage.includes('at least 20 characters'),
  'Test Case A1: Sanitizer rejects text under minimum character count (< 20 characters) with informative error',
  `Error caught: "${shortErrorMessage}"`
);

// HTML stripping and UTF-8 normalization test
const htmlRawJd = `<div><h1>Software Developer</h1><p>We are seeking a motivated <b>Junior Full Stack Developer</b> to join our Bangalore engineering team.</p><p>Responsibilities include building web interfaces with React, designing APIs with Python and Django, and writing unit tests.</p><p>Candidates must possess a Bachelor’s degree in Information Technology or Computer Science. Strong knowledge of SQL and MongoDB is required. Excellent opportunity for recent graduates with 0-1 year experience to grow into enterprise architectures. Continuous integration, agile sprints, code reviews, and cross-functional team collaboration are core to our workflow.</p></div>`;

const sanitizedResult = sanitizeJobDescription(htmlRawJd);
const hasNoHtml = !/<[^>]*>/.test(sanitizedResult.cleanedText);
const hasXmlWrapping = sanitizedResult.wrappedXml.startsWith('<user_jd>') && sanitizedResult.wrappedXml.endsWith('</user_jd>');

assert(
  hasNoHtml && hasXmlWrapping && sanitizedResult.wordCount > 50,
  'Test Case A2: HTML stripped, whitespace normalized, and wrapped in strict <user_jd> XML',
  `Cleaned Word Count: ${sanitizedResult.wordCount} words | XML Delimiters verified`
);

// ======================================================================
// TEST CASE B: Senior-Level Experience Block Test (> 1 year)
// ======================================================================
console.log('\n--- TEST CASE B: Senior-Level Experience Block Test (> 1 year) ---');

const seniorJdText = `Job Title: Senior Full Stack Engineer
Company: Global Enterprise Cloud Systems
Location: Bangalore, India

About the Role:
We are looking for a Senior Full Stack Engineer to lead our enterprise core platform team. You will architect high-scale distributed microservices, mentor junior engineers, and drive technical decision-making across our entire software ecosystem.

Requirements & Qualifications:
- Bachelor or Master degree in Computer Science or related field.
- Minimum of 4+ years of professional experience building web applications using React, Node.js, and Python.
- Proven track record leading agile engineering squads and conducting high-level architectural design reviews.
- At least 3 years experience with cloud infrastructure, Kubernetes orchestration, and CI/CD automation pipelines.
- Deep expertise with PostgreSQL database indexing and distributed caching mechanisms.`;

const seniorGatekeeperResult = evaluateGatekeeperRules(seniorJdText, defaultMasterProfile);

assert(
  seniorGatekeeperResult.status === 'ABORT' && seniorGatekeeperResult.reason.includes('limit exceeded'),
  'Test Case B1: Gatekeeper blocks senior role requiring 4+ years experience',
  `Status: ${seniorGatekeeperResult.status} | Reason: ${seniorGatekeeperResult.reason}`
);

const midLevelJdText = `Position: Mid-level Software Developer
Company: Fintech Solutions
Location: Bangalore, India

About the Role:
We are hiring a Mid-level Software Developer with 2-4 years of experience in Python and Django backend APIs. Must have strong understanding of database design, REST services, and version control workflows. Excellent team player with hands-on enterprise project delivery.

Responsibilities & Requirements:
- Build high-performance backend microservices using Python and Django.
- Write unit tests and maintain CI/CD pipelines.
- Bachelor degree in Computer Science or Information Technology required.`;

const midGatekeeperResult = evaluateGatekeeperRules(midLevelJdText, defaultMasterProfile);

assert(
  midGatekeeperResult.status === 'ABORT' &&
    midGatekeeperResult.failureReason ===
      'Blocked: Experience level mismatch. The role requires experience greater than your entry-level threshold (0-1 year maximum).' &&
    midGatekeeperResult.reason.includes('more than 1 year'),
  'Test Case B2: Gatekeeper blocks Mid-level / 2-4 years experience role',
  `Status: ${midGatekeeperResult.status} | Reason: ${midGatekeeperResult.reason}`
);

// Test Case B3: Explicit 3+ years experience requirement blocked
const threeYearsJdText = `Job Title: Python API Developer
Company: CloudScale Systems
Location: Bangalore, India

Position Overview:
We are seeking a Python API Developer to design microservices and high-throughput backend systems. You will optimize database query performance and integrate REST APIs across our distributed cloud architecture.

Requirements & Qualifications:
- Bachelor's degree in Information Technology or Computer Science.
- 3+ years of professional experience developing backend web applications using Python, Django, or Flask.
- In-depth understanding of PostgreSQL, Redis caching, and Docker containers.
- Strong knowledge of object-oriented programming, unit testing, and Git version control.`;

const threeYearsResult = evaluateGatekeeperRules(threeYearsJdText, defaultMasterProfile);

assert(
  threeYearsResult.status === 'ABORT' &&
    threeYearsResult.failureReason ===
      'Blocked: Experience level mismatch. The role requires experience greater than your entry-level threshold (0-1 year maximum).' &&
    threeYearsResult.reason.includes('more than 1 year'),
  'Test Case B3: Gatekeeper blocks role requiring 3+ years experience',
  `Status: ${threeYearsResult.status} | Reason: ${threeYearsResult.reason}`
);

// Test Case B4: Explicit 5+ years experience requirement blocked
const fiveYearsJdText = `Job Title: Backend Software Engineer
Company: Global Data Platform
Location: Bangalore, India

About the Role:
We are hiring a Backend Software Engineer to manage our streaming analytics infrastructure and distributed data pipelines.

Requirements:
- Bachelor or Master degree in Computer Science.
- Minimum of 5+ years of experience in Python or Java backend development.
- Extensive experience designing fault-tolerant systems with Kafka, MongoDB, and Kubernetes.
- Proven track record delivering scalable distributed systems in production environments.`;

const fiveYearsResult = evaluateGatekeeperRules(fiveYearsJdText, defaultMasterProfile);

assert(
  fiveYearsResult.status === 'ABORT' &&
    fiveYearsResult.failureReason ===
      'Blocked: Experience level mismatch. The role requires experience greater than your entry-level threshold (0-1 year maximum).' &&
    fiveYearsResult.reason.includes('more than 1 year'),
  'Test Case B4: Gatekeeper blocks role requiring 5+ years experience',
  `Status: ${fiveYearsResult.status} | Reason: ${fiveYearsResult.reason}`
);

// Test Case B5: "1-2 years" experience requirement strictly blocked
const oneToTwoYearsJd = `- Job Title: Python Developer
- Experience: 1-2 years
- Location: Bangalore
- Key Responsibilities:
  - Develop backend REST APIs with Python and Flask
  - Work with SQL databases and Git repositories`;

const oneToTwoYearsResult = evaluateGatekeeperRules(oneToTwoYearsJd, defaultMasterProfile);
assert(
  oneToTwoYearsResult.status === 'ABORT' &&
    oneToTwoYearsResult.failureReason ===
      'Blocked: Experience level mismatch. The role requires experience greater than your entry-level threshold (0-1 year maximum).',
  'Test Case B5: Gatekeeper strictly blocks JD requiring "1-2 years" experience with exact failureReason',
  `Status: ${oneToTwoYearsResult.status} | failureReason: "${oneToTwoYearsResult.failureReason}"`
);

// Test Case B6: "2+ years" experience requirement strictly blocked
const twoPlusYearsJd = `- Job Title: Full Stack Developer
- Experience: 2+ years
- Location: Hyderabad
- Key Responsibilities:
  - Develop React and Node.js web applications
  - Manage PostgreSQL schemas and CI/CD pipelines`;

const twoPlusYearsResult = evaluateGatekeeperRules(twoPlusYearsJd, defaultMasterProfile);
assert(
  twoPlusYearsResult.status === 'ABORT' &&
    twoPlusYearsResult.failureReason ===
      'Blocked: Experience level mismatch. The role requires experience greater than your entry-level threshold (0-1 year maximum).',
  'Test Case B6: Gatekeeper strictly blocks JD requiring "2+ years" experience with exact failureReason',
  `Status: ${twoPlusYearsResult.status} | failureReason: "${twoPlusYearsResult.failureReason}"`
);

// Test Case B7: "2 to 3 years" experience requirement strictly blocked
const twoToThreeYearsJd = `- Job Title: Backend Engineer
- Experience: 2 to 3 years
- Location: Pune
- Key Responsibilities:
  - Build microservices in Java and Spring Boot
  - Implement caching with Redis and unit tests`;

const twoToThreeYearsResult = evaluateGatekeeperRules(twoToThreeYearsJd, defaultMasterProfile);
assert(
  twoToThreeYearsResult.status === 'ABORT' &&
    twoToThreeYearsResult.failureReason ===
      'Blocked: Experience level mismatch. The role requires experience greater than your entry-level threshold (0-1 year maximum).',
  'Test Case B7: Gatekeeper strictly blocks JD requiring "2 to 3 years" experience with exact failureReason',
  `Status: ${twoToThreeYearsResult.status} | failureReason: "${twoToThreeYearsResult.failureReason}"`
);

// Test Case B8: "minimum 1 year experience where upper bound goes above 1" strictly blocked
const minOneUpperExceededJd = `- Job Title: Software Engineer
- Experience: Minimum 1 year experience required where candidate should have 1 to 2 years hands-on development
- Location: Bangalore
- Key Responsibilities:
  - Write clean Python and JavaScript code
  - Collaborate with cross-functional agile teams`;

const minOneUpperResult = evaluateGatekeeperRules(minOneUpperExceededJd, defaultMasterProfile);
assert(
  minOneUpperResult.status === 'ABORT' &&
    minOneUpperResult.failureReason ===
      'Blocked: Experience level mismatch. The role requires experience greater than your entry-level threshold (0-1 year maximum).',
  'Test Case B8: Gatekeeper strictly blocks JD with minimum 1 year where upper bound exceeds 1 (e.g. 1 to 2 years)',
  `Status: ${minOneUpperResult.status} | failureReason: "${minOneUpperResult.failureReason}"`
);

// Test Case B9: "0-2 years" experience requirement allowed (PROCEED) - Fresher-Inclusive Range
const zeroToTwoYearsJd = `- Job Title: Junior Developer
- Experience: 0-2 years
- Location: Gurgaon
- Key Responsibilities:
  - Develop front-end features using React
  - Troubleshoot and fix software defects`;

const zeroToTwoResult = evaluateGatekeeperRules(zeroToTwoYearsJd, defaultMasterProfile);
assert(
  zeroToTwoResult.status === 'PROCEED' && (zeroToTwoResult.failureReason === null || zeroToTwoResult.failureReason === undefined),
  'Test Case B9: Gatekeeper approves JD with "0-2 years" experience requirement (range starts at 0, fresher-inclusive)',
  `Status: ${zeroToTwoResult.status} | Reason: ${zeroToTwoResult.reason}`
);

// Test Case B9b: "0 to 3 years" experience requirement allowed (PROCEED)
const zeroToThreeYearsJd = `- Job Title: Python Developer
- Experience: 0 to 3 years
- Location: Bangalore
- Key Responsibilities:
  - Develop backend REST APIs with Python and Flask
  - Work with SQL databases and Git repositories`;

const zeroToThreeResult = evaluateGatekeeperRules(zeroToThreeYearsJd, defaultMasterProfile);
assert(
  zeroToThreeResult.status === 'PROCEED' && (zeroToThreeResult.failureReason === null || zeroToThreeResult.failureReason === undefined),
  'Test Case B9b: Gatekeeper approves JD with "0 to 3 years" experience requirement (range starts at 0, fresher-inclusive)',
  `Status: ${zeroToThreeResult.status} | Reason: ${zeroToThreeResult.reason}`
);

// Test Case B9c: "0–5 years" experience requirement allowed (PROCEED)
const zeroToFiveYearsJd = `- Job Title: Full Stack Developer
- Experience: 0–5 years
- Location: Hyderabad
- Key Responsibilities:
  - Build web applications using React and Node.js
  - Maintain database schemas and write unit tests`;

const zeroToFiveResult = evaluateGatekeeperRules(zeroToFiveYearsJd, defaultMasterProfile);
assert(
  zeroToFiveResult.status === 'PROCEED' && (zeroToFiveResult.failureReason === null || zeroToFiveResult.failureReason === undefined),
  'Test Case B9c: Gatekeeper approves JD with "0–5 years" experience requirement (range starts at 0, fresher-inclusive)',
  `Status: ${zeroToFiveResult.status} | Reason: ${zeroToFiveResult.reason}`
);

// Test Case B9d: "0+ years" experience requirement allowed (PROCEED)
const zeroPlusYearsJd = `- Job Title: Junior Software Engineer
- Experience: 0+ years
- Location: Bangalore
- Key Responsibilities:
  - Develop web application components using Python and React
  - Write unit tests and participate in sprint planning`;

const zeroPlusResult = evaluateGatekeeperRules(zeroPlusYearsJd, defaultMasterProfile);
assert(
  zeroPlusResult.status === 'PROCEED' && (zeroPlusResult.failureReason === null || zeroPlusResult.failureReason === undefined),
  'Test Case B9d: Gatekeeper approves JD with "0+ years" experience requirement (minimum is 0, fresher-inclusive)',
  `Status: ${zeroPlusResult.status} | Reason: ${zeroPlusResult.reason}`
);

// Test Case B9e: Higher experience range with explicit fresher inclusion allowed (PROCEED)
const fresherInclusiveHigherRangeJd = `- Job Title: Software Developer
- Experience: 2-4 years (Freshers are welcome to apply)
- Location: Bangalore
- Key Responsibilities:
  - Develop web applications using Python, React, and SQL
  - Write clean, maintainable code and collaborate with team`;

const fresherInclusiveResult = evaluateGatekeeperRules(fresherInclusiveHigherRangeJd, defaultMasterProfile);
assert(
  fresherInclusiveResult.status === 'PROCEED' && (fresherInclusiveResult.failureReason === null || fresherInclusiveResult.failureReason === undefined),
  'Test Case B9e: Gatekeeper approves JD with higher range when freshers are explicitly included ("Freshers are welcome to apply")',
  `Status: ${fresherInclusiveResult.status} | Reason: ${fresherInclusiveResult.reason}`
);

// Test Case B9f: calculateBaselineScore returns valid non-null baseline score for fresher-inclusive JD ("0-2 years")
const baselineScoreZeroToTwo = calculateBaselineScore({
  cleanedJdText: zeroToTwoYearsJd,
  masterProfile: defaultMasterProfile,
});
assert(
  baselineScoreZeroToTwo !== null &&
    baselineScoreZeroToTwo.overallScore >= 40 &&
    baselineScoreZeroToTwo.overallScore <= 85 &&
    baselineScoreZeroToTwo.breakdown.experienceFit.score === 20,
  'Test Case B9f: calculateBaselineScore returns valid non-null baseline score for fresher-inclusive JD ("0-2 years")',
  `Score: ${baselineScoreZeroToTwo?.overallScore}/100 | Experience Fit: ${baselineScoreZeroToTwo?.breakdown?.experienceFit?.score}/20`
);

// Test Case B10: "0 years" experience requirement allowed (PROCEED)
const zeroYearsJd = `- Job Title: Junior Software Engineer
- Experience: 0 years
- Location: Bangalore
- Key Responsibilities:
  - Develop web application components using Python and React
  - Write unit tests and participate in sprint planning`;

const zeroYearsResult = evaluateGatekeeperRules(zeroYearsJd, defaultMasterProfile);
assert(
  zeroYearsResult.status === 'PROCEED' && (zeroYearsResult.failureReason === null || zeroYearsResult.failureReason === undefined),
  'Test Case B10: Gatekeeper approves JD with "0 years" experience requirement',
  `Status: ${zeroYearsResult.status} | Reason: ${zeroYearsResult.reason}`
);

// Test Case B11: "0-1 year" experience requirement allowed (PROCEED)
const zeroToOneYearJd = `- Job Title: Junior Python Developer
- Experience: 0-1 year
- Location: Bangalore
- Key Responsibilities:
  - Build backend services with Python, Flask, and PostgreSQL
  - Collaborate with senior engineers on system design`;

const zeroToOneResult = evaluateGatekeeperRules(zeroToOneYearJd, defaultMasterProfile);
assert(
  zeroToOneResult.status === 'PROCEED' && (zeroToOneResult.failureReason === null || zeroToOneResult.failureReason === undefined),
  'Test Case B11: Gatekeeper approves JD with "0-1 year" experience requirement',
  `Status: ${zeroToOneResult.status} | Reason: ${zeroToOneResult.reason}`
);

// Test Case B12: "fresher" / "fresh graduates" allowed (PROCEED)
const fresherGradJd = `- Job Title: Trainee Software Developer
- Experience: Fresher / Fresh graduates are welcome to apply
- Location: Bangalore
- Key Responsibilities:
  - Learn codebase and build full-stack features using JavaScript and Python
  - Fix bugs and participate in code reviews`;

const fresherGradResult = evaluateGatekeeperRules(fresherGradJd, defaultMasterProfile);
assert(
  fresherGradResult.status === 'PROCEED' && (fresherGradResult.failureReason === null || fresherGradResult.failureReason === undefined),
  'Test Case B12: Gatekeeper approves JD open to "fresher" / "fresh graduates"',
  `Status: ${fresherGradResult.status} | Reason: ${fresherGradResult.reason}`
);

// Test Case B13: "entry-level with no experience" allowed (PROCEED)
const entryNoExpJd = `- Job Title: Junior Web Developer
- Experience: Entry-level with no experience required
- Location: Chennai
- Key Responsibilities:
  - Build responsive user interfaces with HTML, CSS, JavaScript, and React
  - Collaborate with engineering team in an Agile environment`;

const entryNoExpResult = evaluateGatekeeperRules(entryNoExpJd, defaultMasterProfile);
assert(
  entryNoExpResult.status === 'PROCEED' && (entryNoExpResult.failureReason === null || entryNoExpResult.failureReason === undefined),
  'Test Case B13: Gatekeeper approves JD requiring "entry-level with no experience"',
  `Status: ${entryNoExpResult.status} | Reason: ${entryNoExpResult.reason}`
);

// Test Case B14: "junior role with 0-1 year" allowed (PROCEED)
const juniorRoleJd = `- Job Title: Junior Full Stack Developer
- Experience: Junior role with 0-1 year experience
- Location: Bangalore
- Key Responsibilities:
  - Develop frontend components in React and backend services in Node.js
  - Maintain clean code quality and unit tests`;

const juniorRoleResult = evaluateGatekeeperRules(juniorRoleJd, defaultMasterProfile);
assert(
  juniorRoleResult.status === 'PROCEED' && (juniorRoleResult.failureReason === null || juniorRoleResult.failureReason === undefined),
  'Test Case B14: Gatekeeper approves JD for "junior role with 0-1 year"',
  `Status: ${juniorRoleResult.status} | Reason: ${juniorRoleResult.reason}`
);

// Test Case B15: calculateBaselineScore returns null on experience mismatch (> 1 year)
const baselineScoreExceeded = calculateBaselineScore({
  cleanedJdText: oneToTwoYearsJd,
  masterProfile: defaultMasterProfile,
});
assert(
  baselineScoreExceeded === null,
  'Test Case B15: calculateBaselineScore returns null when JD requires experience exceeding 1 year',
  `baselineScore: ${baselineScoreExceeded}`
);

// ======================================================================
// TEST CASE C: Unrelated Industry Block Test (e.g., Civil Engineering)
// ======================================================================
console.log('\n--- TEST CASE C: Unrelated Industry Block Test ---');

const civilJdText = `Job Title: Civil Site Engineer
Company: Metro Infrastructure & Construction Ltd
Location: Bangalore, India

Position Overview:
We are hiring a Civil Site Engineer to manage on-site structural concrete operations and building construction projects. You will supervise field contractors, monitor quality control of building materials, inspect foundation reinforcement, and ensure workplace safety standards.

Responsibilities:
- Supervise construction site operations and coordinate with structural architects.
- Review AutoCAD surveyor plans and architectural structural drawings.
- Perform daily material testing including concrete slump tests and rebar inspections.
- Maintain site logs, safety records, and project schedules.

Qualifications:
- B.E. or B.Tech in Civil Engineering.
- 0-1 year experience in residential or commercial construction site management.`;

const civilGatekeeperResult = evaluateGatekeeperRules(civilJdText, defaultMasterProfile);

assert(
  civilGatekeeperResult.status === 'ABORT' &&
    (civilGatekeeperResult.reason === 'Domain Mismatch: The required tools and skills belong to an unsupported engineering/business domain outside Computer Science & IT.' ||
     civilGatekeeperResult.reason.includes('Domain Mismatch') ||
     civilGatekeeperResult.reason.includes('Civil / Structural Engineering')),
  'Test Case C1: Gatekeeper blocks unrelated Civil Engineering role',
  `Status: ${civilGatekeeperResult.status} | Reason: ${civilGatekeeperResult.reason}`
);

const nursingJdText = `Job Title: Registered Staff Nurse
Company: City Health Hospital
Location: Bangalore, India

Position Overview:
Seeking an entry-level Registered Nurse to provide patient triage, administer medications, monitor clinical vital signs, and collaborate with physicians in our emergency outpatient ward.

Key Duties & Responsibilities:
- Conduct routine patient clinical examinations and bedside care.
- Monitor vital signs and maintain electronic health record documentation.
- Maintain hospital hygiene and medical safety protocols.

Qualifications:
- Bachelor of Science in Nursing (B.Sc Nursing) or equivalent nursing diploma.
- 0-1 year clinical nursing experience.`;

const nursingGatekeeperResult = evaluateGatekeeperRules(nursingJdText, defaultMasterProfile);

assert(
  nursingGatekeeperResult.status === 'ABORT' &&
    (nursingGatekeeperResult.reason === 'Domain Mismatch: The required tools and skills belong to an unsupported engineering/business domain outside Computer Science & IT.' ||
     nursingGatekeeperResult.reason.includes('Healthcare & Nursing') ||
     nursingGatekeeperResult.reason.includes('Domain Mismatch')),
  'Test Case C2: Gatekeeper blocks unrelated Healthcare / Nursing role',
  `Status: ${nursingGatekeeperResult.status} | Reason: ${nursingGatekeeperResult.reason}`
);

// Test Case C3: Mechanical Engineering Tool-Cluster & Domain Block Test
const mechanicalJdText = `Job Title: Junior Mechanical Design Engineer
Company: Precision Dynamics Automotive Ltd
Location: Bangalore, India

Position Overview:
We are seeking an entry-level Junior Mechanical Design Engineer to join our automotive engineering division. The candidate will work on mechanical component design, kinematic simulation, and finite element stress analysis for automotive powertrains.

Responsibilities:
- Create 3D parametric CAD models and assembly designs using SolidWorks and Creo.
- Prepare 2D manufacturing drawings and geometric dimensioning using AutoCAD and GD&T standards.
- Perform structural, vibrational, and thermal FEA simulations using ANSYS and Abaqus.
- Write technical numerical computation and simulation algorithms using MATLAB.
- Coordinate with prototype machining shops and inspect physical component test rigs.

Qualifications:
- Bachelor's degree (B.E. / B.Tech) in Mechanical Engineering or Automobile Engineering.
- 0-1 year experience or fresher with strong coursework in CAD/CAE tools.
- Hands-on experience with SolidWorks, Creo, AutoCAD, ANSYS, Abaqus, and MATLAB.
- Basic knowledge of Python or C is a plus.`;

const mechanicalGatekeeperResult = evaluateGatekeeperRules(mechanicalJdText, defaultMasterProfile);

assert(
  mechanicalGatekeeperResult.status === 'ABORT' &&
    mechanicalGatekeeperResult.reason === 'Domain Mismatch: The required tools and skills belong to an unsupported engineering/business domain outside Computer Science & IT.',
  'Test Case C3: Gatekeeper strictly blocks Mechanical Engineering JD listing SolidWorks, Creo, AutoCAD, ANSYS, Abaqus, and MATLAB',
  `Status: ${mechanicalGatekeeperResult.status} | Reason: "${mechanicalGatekeeperResult.reason}"`
);

// Test Case C4: Dynamic Tool-Cluster Only Block Test (No domain title in job title or description)
const nonItToolsOnlyJdText = `Job Title: Technical Modeling Specialist
Company: Apex Advanced Solutions
Location: Bangalore, India

Position Overview:
We are looking for a Technical Modeling Specialist to assist our engineering design team with 3D solid modeling and finite element simulation.

Key Responsibilities:
- Build detailed parts and subassemblies using SolidWorks and Creo.
- Generate fabrication layouts and shop floor schematics using AutoCAD.
- Set up boundary conditions and run meshing stress analysis using ANSYS and Abaqus.
- Automate matrix calculations and numerical simulations using MATLAB.
- Assist senior engineering staff in design verification and tolerance stackup.

Requirements:
- Degree in Engineering or Applied Sciences.
- 0 to 1 year of experience (entry-level / fresher).
- Proficient with SolidWorks, Creo, AutoCAD, ANSYS, Abaqus, and MATLAB.`;

const nonItToolsResult = evaluateGatekeeperRules(nonItToolsOnlyJdText, defaultMasterProfile);

assert(
  nonItToolsResult.status === 'ABORT' &&
    nonItToolsResult.reason === 'Domain Mismatch: The required tools and skills belong to an unsupported engineering/business domain outside Computer Science & IT.',
  'Test Case C4: Dynamic classifier blocks JD containing only non-IT tools without mentioning any domain title',
  `Status: ${nonItToolsResult.status} | Reason: "${nonItToolsResult.reason}"`
);

// Test Case C5: Dynamic Business / Finance Vector Block Test (No domain title in job title)
const financeToolsOnlyJdText = `Job Title: Associate Operations Specialist
Company: Summit Ledger Enterprises
Location: Bangalore, India

Position Overview:
We are seeking an entry-level Associate Operations Specialist to assist our enterprise operations group with financial tracking and record reconciliation.

Key Responsibilities:
- Manage accounts payable and accounts receivable records using QuickBooks and Tally.
- Prepare monthly balance sheets, general ledger entries, and bank reconciliation statements.
- Ensure documentation aligns with standard GAAP and audit compliance protocols.
- Generate payroll accounting spreadsheets and budget summaries.

Qualifications:
- Bachelor's degree in Commerce, Business, or related discipline.
- 0 to 1 year of experience or recent graduate.
- Hands-on proficiency with QuickBooks, Tally, General Ledger, and GAAP.`;

const financeToolsResult = evaluateGatekeeperRules(financeToolsOnlyJdText, defaultMasterProfile);

assert(
  financeToolsResult.status === 'ABORT' &&
    financeToolsResult.reason === 'Domain Mismatch: The required tools and skills belong to an unsupported engineering/business domain outside Computer Science & IT.',
  'Test Case C5: Dynamic classifier intercepts Finance & Accounting tool cluster (QuickBooks, Tally, General Ledger, GAAP)',
  `Status: ${financeToolsResult.status} | Reason: "${financeToolsResult.reason}"`
);

// ======================================================================
// TEST CASE D: Valid Entry-Level Crossover Tech Test (Passing + Baseline Score)
// ======================================================================
console.log('\n--- TEST CASE D: Valid Entry-Level Crossover Tech Test ---');

const validEntryJdText = `Job Title: Associate Full Stack Developer (Fresher / 0-1 Year)
Company: NextGen Software Solutions
Location: Bangalore, India

About the Role:
We are looking for a passionate Associate Full Stack Developer to join our growing engineering team. This entry-level position is ideal for recent college graduates eager to build scalable web applications using modern technologies.

Key Responsibilities:
- Develop responsive web pages and reusable components using React, JavaScript, HTML5, and CSS.
- Write clean, maintainable backend API endpoints using Python, Django, or Flask.
- Work with relational SQL databases and MongoDB to support operational reporting.
- Participate in daily standups, code reviews, and Git version control workflows.
- Learn modern cloud deployment practices on platforms like Render or AWS.

Qualifications & Requirements:
- B.Tech in Information Technology, Computer Science, or related engineering discipline.
- 0 to 1 year of experience or strong internship / academic project portfolio.
- Foundational understanding of object-oriented programming in Python or Java.
- Enthusiasm for learning full-stack development and solving real-world challenges.`;

const entryGatekeeperResult = evaluateGatekeeperRules(validEntryJdText, defaultMasterProfile);

assert(
  entryGatekeeperResult.status === 'PROCEED',
  'Test Case D1: Gatekeeper approves valid 0-1 year entry-level Full Stack role',
  `Status: ${entryGatekeeperResult.status} | Reason: ${entryGatekeeperResult.reason}`
);

// Deterministic Baseline Scoring Check
const baselineScore = calculateBaselineScore({
  cleanedJdText: validEntryJdText,
  masterProfile: defaultMasterProfile,
});

const isScoreBounded = baselineScore.overallScore >= 40 && baselineScore.overallScore <= 85;
const hasGranularBreakdown =
  baselineScore.breakdown.techStack.score > 0 &&
  baselineScore.breakdown.domainRole.score > 0 &&
  baselineScore.breakdown.experienceFit.score === 20 &&
  baselineScore.breakdown.educationFit.score === 10;

assert(
  isScoreBounded && hasGranularBreakdown,
  'Test Case D2: Deterministic Baseline Score correctly computed within [40, 85] bounds',
  `Overall Score: ${baselineScore.overallScore}/100 | Tech: ${baselineScore.breakdown.techStack.score}/30 | Role: ${baselineScore.breakdown.domainRole.score}/40 | Exp: ${baselineScore.breakdown.experienceFit.score}/20 | Edu: ${baselineScore.breakdown.educationFit.score}/10`
);

// Test Case D3: Junior Python Developer with senior mentorship / tech lead collaboration mentions
const juniorPythonJdText = `Job Title: Junior Python Developer
Company: CloudCraft Technologies
Location: Bangalore, India

About the Role:
We are seeking an enthusiastic Junior Python Developer to join our backend engineering team. In this entry-level role, you will collaborate with senior developers and work under our tech lead to design, build, and test RESTful APIs and database schemas.

Key Responsibilities:
- Build clean backend endpoints using Python, Django, or Flask.
- Write unit tests and maintain documentation for system workflows.
- Participate in code reviews with senior engineers to ensure best practices.
- Assist in developing database models using PostgreSQL and MongoDB.

Qualifications:
- Bachelor's in Information Technology or Computer Science.
- 0-1 years of experience or strong academic project portfolio.
- Foundational understanding of Python, OOP concepts, SQL, and Git.
- Passion for learning and receiving mentorship from senior team members.`;

const juniorPythonResult = evaluateGatekeeperRules(juniorPythonJdText, defaultMasterProfile);

assert(
  juniorPythonResult.status === 'PROCEED',
  'Test Case D3: Gatekeeper approves "Junior Python Developer" role with mentorship/senior mentions',
  `Status: ${juniorPythonResult.status} | Reason: ${juniorPythonResult.reason}`
);

// Test Case D4: Python Developer (Fresher) role
const fresherPythonJdText = `Job Title: Python Developer (Fresher)
Company: DataWave Tech
Location: Bangalore, India

About the Role:
DataWave Tech is hiring a motivated Python Developer (Fresher) to contribute to our analytics products. You will be mentored by senior engineers to develop scalable web services and automated data extraction pipelines.

Core Duties:
- Write modular Python code for backend processing and reporting dashboards.
- Implement database queries in PostgreSQL / MongoDB.
- Work closely with senior software engineers on product releases and Git workflows.

Qualifications:
- B.Tech / B.E. in IT or Computer Science (2025/2026 batch).
- Strong proficiency in Python, HTML, CSS, JavaScript, and Django.
- Eagerness to grow your career in full-stack and backend engineering.`;

const fresherPythonResult = evaluateGatekeeperRules(fresherPythonJdText, defaultMasterProfile);

assert(
  fresherPythonResult.status === 'PROCEED',
  'Test Case D4: Gatekeeper approves "Python Developer (Fresher)" role with recent graduate criteria',
  `Status: ${fresherPythonResult.status} | Reason: ${fresherPythonResult.reason}`
);

// Test Case D5: Proportional Tech Match Scaling (100% Profile Tech Fit with only 2 JD requirements)
// In previous logic, matching only 2 skills awarded 2/5 * 30 = 12/30 pts despite 100% profile tech fit.
const compactTwoSkillJdText = `Job Title: Python Developer (Fresher)
Company: DataApp Solutions
Location: Bangalore, India

Position Overview:
We are seeking an entry-level Python Developer to build and maintain backend web services and database query optimization.

Requirements & Responsibilities:
- Design and develop clean backend RESTful services using Python and Django.
- Participate in agile sprint meetings and software quality reviews.
- Bachelor's degree in Information Technology, Computer Science, or related engineering branch.
- 0-1 years of experience or strong internship projects in Python.`;

const compactTwoSkillScore = calculateBaselineScore({
  cleanedJdText: compactTwoSkillJdText,
  masterProfile: defaultMasterProfile,
});

assert(
  compactTwoSkillScore.breakdown.techStack.score === 30,
  'Test Case D5: 100% Profile Tech Fit scales proportionally to full 30/30 pts (eliminating 12/30 disconnect)',
  `Tech Score: ${compactTwoSkillScore.breakdown.techStack.score}/30 pts | Matched Keywords: ${compactTwoSkillScore.breakdown.techStack.matchedKeywords.join(', ')}`
);

// Test Case D6: Direct techXRayData passing scales accurately
const simulatedXRayScore = calculateBaselineScore({
  cleanedJdText: compactTwoSkillJdText,
  masterProfile: defaultMasterProfile,
  techXRayData: {
    coveragePercentage: 80,
    matchedTech: [{ name: 'Python' }, { name: 'Django' }, { name: 'SQL' }, { name: 'React' }],
    missingTech: [{ name: 'Docker' }],
  },
});

assert(
  simulatedXRayScore.breakdown.techStack.score === 24,
  'Test Case D6: techXRayData with 80% coverage scales proportionally to 24/30 pts (80% * 30)',
  `Tech Score: ${simulatedXRayScore.breakdown.techStack.score}/30 pts (Expected: 24/30)`
);

// ======================================================================
// TEST CASE E: Integration Workflow Pipeline Handler
// ======================================================================
console.log('\n--- TEST CASE E: Integration Workflow Pipeline Handler ---');

async function runIntegrationPipelineTests() {
  // Test pipeline on short text
  const pipelineShortResult = await evaluateJobDescriptionPipeline({
    rawJdText: 'Short JD test',
    masterProfile: defaultMasterProfile,
  });

  assert(
    !pipelineShortResult.success && pipelineShortResult.status === 'ABORT',
    'Test Case E1: Pipeline gracefully aborts on short text (< 20 characters)',
    `Reason: "${pipelineShortResult.reason}"`
  );

  // Test pipeline on senior role
  const pipelineSeniorResult = await evaluateJobDescriptionPipeline({
    rawJdText: seniorJdText,
    masterProfile: defaultMasterProfile,
  });

  assert(
    !pipelineSeniorResult.success && pipelineSeniorResult.status === 'ABORT',
    'Test Case E2: Pipeline gracefully aborts on senior experience role',
    `Reason: "${pipelineSeniorResult.reason}"`
  );

  // Test pipeline on valid entry-level role
  const pipelineValidResult = await evaluateJobDescriptionPipeline({
    rawJdText: validEntryJdText,
    masterProfile: defaultMasterProfile,
  });

  assert(
    pipelineValidResult.success &&
      pipelineValidResult.status === 'PROCEED' &&
      pipelineValidResult.baselineScore.overallScore >= 40,
    'Test Case E3: Pipeline successfully approves entry-level role with complete baseline score',
    `Status: ${pipelineValidResult.status} | Score: ${pipelineValidResult.baselineScore.overallScore}% | Word Count: ${pipelineValidResult.wordCount}`
  );

  // Test Case E4: Pipeline halts execution for Mechanical Engineering role
  const pipelineMechanicalResult = await evaluateJobDescriptionPipeline({
    rawJdText: mechanicalJdText,
    masterProfile: defaultMasterProfile,
  });

  assert(
    !pipelineMechanicalResult.success &&
      pipelineMechanicalResult.status === 'ABORT' &&
      pipelineMechanicalResult.reason === 'Domain Mismatch: The required tools and skills belong to an unsupported engineering/business domain outside Computer Science & IT.' &&
      pipelineMechanicalResult.baselineScore === undefined,
    'Test Case E4: Pipeline halts execution for Mechanical Engineering role without generating baseline score or permitting tailoring',
    `Status: ${pipelineMechanicalResult.status} | Reason: "${pipelineMechanicalResult.reason}"`
  );
  // ======================================================================
  // TEST CASE F: Strict Sanity & Gibberish Interception (Zero-Tolerance)
  // ======================================================================
  console.log('\n--- TEST CASE F: Strict Sanity & Gibberish Interception ---');

  // Test Case F1: Repeating random syllables (e.g. 'ask oed kefweo wkejds')
  const repeatingSyllablesJd = Array(15).fill('ask oed kefweo wkejds').join(' ');
  const repeatingSanityResult = evaluateGatekeeperRules(repeatingSyllablesJd, defaultMasterProfile);

  assert(
    repeatingSanityResult.status === 'ABORT' &&
      repeatingSanityResult.reason === 'Invalid or meaningless Job Description detected. Please enter a valid professional job description.',
    'Test Case F1: Intercepts repeating nonsense syllables ("ask oed kefweo wkejds")',
    `Status: ${repeatingSanityResult.status} | Reason: "${repeatingSanityResult.reason}"`
  );

  // Test Case F2: Random keyboard smashing string
  const keyboardMashJd = 'asdfghjkl zxcvbnm qwertyuiop asdfghjkl zxcvbnm qwertyuiop asdfghjkl zxcvbnm qwertyuiop asdfghjkl zxcvbnm qwertyuiop asdfghjkl zxcvbnm qwertyuiop asdfghjkl zxcvbnm qwertyuiop';
  const keyboardMashResult = evaluateGatekeeperRules(keyboardMashJd, defaultMasterProfile);

  assert(
    keyboardMashResult.status === 'ABORT' &&
      keyboardMashResult.reason === 'Invalid or meaningless Job Description detected. Please enter a valid professional job description.',
    'Test Case F2: Intercepts high-entropy keyboard smashing strings',
    `Status: ${keyboardMashResult.status} | Reason: "${keyboardMashResult.reason}"`
  );

  // Test Case F3: Pipeline integration on gibberish returns { status: 'ABORT', reason: '...' }
  const pipelineGibberishResult = await evaluateJobDescriptionPipeline({
    rawJdText: repeatingSyllablesJd,
    masterProfile: defaultMasterProfile,
  });

  assert(
    !pipelineGibberishResult.success &&
      pipelineGibberishResult.status === 'ABORT' &&
      pipelineGibberishResult.reason === 'Invalid or meaningless Job Description detected. Please enter a valid professional job description.',
    'Test Case F3: Pipeline returns hard-stop ABORT on gibberish input without score or resume modifications',
    `Status: ${pipelineGibberishResult.status} | Reason: "${pipelineGibberishResult.reason}"`
  );

  // Test Case F4: Technical terms with version digits and consonant clusters (MySQL, HTML5, CSS3) are not blocked
  const fullStackTechJd = `Job Summary
We are looking for a skilled Full Stack Developer to join our engineering team and own the end-to-end software development lifecycle. You will translate business requirements into responsive, high-performance web applications and collaborate closely with product managers, designers, and fellow developers.

Key Responsibilities
- End-to-End Development: Design, build, and maintain scalable web applications covering both client-side and server-side architecture.
- Front-End Development: Create clean, responsive, and intuitive user interfaces using modern frameworks.
- Back-End & APIs: Build and integrate secure RESTful APIs, manage server-side logic, and handle application services.
- Database Management: Design, query, and optimize relational or NoSQL databases (e.g., MySQL, PostgreSQL, MongoDB, or SQL/Oracle).
- Testing & Debugging: Write unit tests, run automated tests, troubleshoot production issues, and fix code bugs.
- Deployment & CI/CD: Participate in cloud deployments, version control (Git), and continuous integration/continuous deployment (CI/CD) workflows.
- Collaboration: Work in Agile/Scrum teams to plan sprints, review code, and maintain technical documentation.

Required Technical Skills
- Languages & Frameworks: JavaScript / TypeScript, React, Angular, or Vue.js, Node.js, Java (Spring Boot), Python, or .NET
- Web Fundamentals: HTML5, CSS3, DOM manipulation
- Databases: SQL, MySQL, PostgreSQL, Oracle, or MongoDB
- DevOps & Tools: Git, Docker, Kubernetes, and cloud platforms (AWS, Azure, or GCP)`;

  const fullStackPipelineResult = await evaluateJobDescriptionPipeline({
    rawJdText: fullStackTechJd,
    masterProfile: defaultMasterProfile,
  });

  assert(
    fullStackPipelineResult.success &&
      fullStackPipelineResult.status === 'PROCEED' &&
      fullStackPipelineResult.baselineScore?.overallScore >= 80,
    'Test Case F4: Full Stack Developer JD with MySQL, HTML5, and CSS3 is approved by Gatekeeper without gibberish false positive',
    `Status: ${fullStackPipelineResult.status} | Score: ${fullStackPipelineResult.baselineScore?.overallScore}% | Reason: "${fullStackPipelineResult.reason}"`
  );

  // ======================================================================
  // TEST CASE G: Strict Sequential Checks & Non-IT/BPO Blocklist
  // ======================================================================
  console.log('\n--- TEST CASE G: Strict Sequential Checks & Non-IT/BPO Blocklist ---');

  // G1: Step a - Invalid / Gibberish Text Check returns failureReason & detailed reasoning
  const gibberishCheck = evaluateGatekeeperRules(repeatingSyllablesJd, defaultMasterProfile);
  assert(
    gibberishCheck.status === 'ABORT' &&
      gibberishCheck.failureReason === 'Blocked: Invalid/insufficient technical content' &&
      typeof gibberishCheck.reasoning === 'string' &&
      gibberishCheck.reasoning.includes('Invalid/insufficient technical content'),
    'Test Case G1: Step a (Invalid Text Check) returns failureReason: "Blocked: Invalid/insufficient technical content" and detailed reasoning',
    `failureReason: "${gibberishCheck.failureReason}" | reasoning: "${gibberishCheck.reasoning}"`
  );

  // G2: Step b - Fresher / Experience Level Check recognizes comprehensive entry-level synonyms ("2026 batch", "0–1 years", "fresh graduates")
  const entryLevelSynonymJd = `Job Title: Junior Software Developer
Company: InnovateTech Solutions
Location: Bangalore, India

About the Role:
We are hiring fresh graduates and entry-level candidates for our core web engineering team. This position is open for the 2026 batch as well as recent graduates with 0–1 years of practical experience.

Key Responsibilities:
- Build and maintain frontend web components using React, JavaScript, and HTML/CSS.
- Develop backend REST APIs with Python, Django, and PostgreSQL databases.
- Write unit tests and participate in Git version control and code reviews.
- Collaborate with agile product teams to ship weekly platform increments.

Qualifications:
- Bachelor's degree in Computer Science, Information Technology, or related discipline.
- Foundational skills in Python, React, SQL, and Git.
- Excellent problem-solving mindset and eagerness to grow in a fast-paced development team.`;

  const synonymResult = evaluateGatekeeperRules(entryLevelSynonymJd, defaultMasterProfile);
  assert(
    synonymResult.status === 'PROCEED' && synonymResult.failureReason === null,
    'Test Case G2: Step b (Fresher / Experience Level Check) approves role matching "2026 batch", "0–1 years", and "fresh graduates"',
    `Status: ${synonymResult.status} | Reason: "${synonymResult.reason}"`
  );

  // G3: Step b - Senior role blocked with failureReason: "Blocked: Requires senior experience"
  const seniorFiveYearJd = `Job Title: Senior Software Architect
Company: Enterprise Cloud Tech
Location: Hyderabad, India

About the Position:
We are seeking a seasoned Software Architect to lead our distributed systems strategy. You must have a minimum of 5+ years of hands-on software development experience.

Responsibilities:
- Architect high-throughput distributed microservices in Python and Java.
- Define engineering best practices, CI/CD standards, and cloud architecture on AWS.
- Lead architecture design reviews and mentor multiple engineering squads.
- Drive database indexing, distributed transactions, and disaster recovery.

Qualifications:
- 5+ years professional experience in enterprise software engineering.
- Bachelor or Master degree in Computer Science or Engineering.`;

  const seniorCheck = evaluateGatekeeperRules(seniorFiveYearJd, defaultMasterProfile);
  assert(
    seniorCheck.status === 'ABORT' &&
      seniorCheck.failureReason === 'Blocked: Requires senior experience' &&
      typeof seniorCheck.reasoning === 'string' &&
      seniorCheck.reasoning.includes('Requires senior experience'),
    'Test Case G3: Step b blocks senior experience role with failureReason: "Blocked: Requires senior experience" and clear explanation',
    `failureReason: "${seniorCheck.failureReason}" | reasoning: "${seniorCheck.reasoning}"`
  );

  // G4: Step c - Industry Blocklist explicitly rejects Tele-calling / Telemarketing / Voice Process
  const telecallingJd = `Job Title: Telecaller / Outbound Calling Executive
Company: Apex Voice Solutions
Location: Chennai, India

Job Description:
We are looking for energetic Telecallers to join our outbound voice advisory team. You will be responsible for making outbound calls to potential customers, explaining consumer finance products, and generating qualified sales leads.

Key Responsibilities:
- Dial 100+ outbound telephone calls daily using automated dialer software.
- Provide phone voice-advisory guidance on loan products, interest rates, and eligibility.
- Maintain accurate call center logs in CRM, record customer feedback, and follow up.
- Meet daily and weekly outbound calling targets and lead conversion quotas.
- Handle customer objections professionally and adhere to call quality guidelines.

Requirements:
- High school diploma or Any Bachelor degree. Freshers and candidates with 0-1 years telecalling experience can apply.
- Excellent verbal communication skills in English and regional languages.
- Clear telephone voice etiquette and persuasion skills.`;

  const telecallingResult = evaluateGatekeeperRules(telecallingJd, defaultMasterProfile);
  assert(
    telecallingResult.status === 'ABORT' &&
      telecallingResult.failureReason === 'Blocked: Non-IT / BPO tele-calling role detected' &&
      telecallingResult.reason.includes('non-IT / BPO / sales role'),
    'Test Case G4: Step c (Industry & Role Type Blocklist) blocks Tele-calling and Outbound Calling role with failureReason: "Blocked: Non-IT / BPO tele-calling role detected"',
    `failureReason: "${telecallingResult.failureReason}" | reason: "${telecallingResult.reason}"`
  );

  // G5: Step c - Industry Blocklist rejects Inbound BPO Customer Support / Call Center
  const bpoCustomerSupportJd = `Job Title: Customer Support Executive (Voice Process)
Company: Global BPO Connect
Location: Pune, India

About the Role:
We are hiring Customer Service Representatives for our international voice process. You will handle inbound calls from global clients, answer billing inquiries, troubleshoot basic service issues, and deliver exceptional call center support.

Responsibilities:
- Manage inbound telephonic interactions, answer customer queries, and resolve complaints.
- Follow voice process communication scripts, maintain average handling time (AHT), and achieve high CSAT scores.
- Document call resolutions in support ticketing software and escalate complex tickets to Tier 2 supervisors.
- Work in rotating 24/7 call center shifts including night shifts.

Candidate Profile:
- Any Graduate or Undergraduate. Freshers welcome.
- Neutral accent and active listening skills over headset.
- 0-1 year experience in BPO / contact center preferred but not mandatory.`;

  const bpoResult = evaluateGatekeeperRules(bpoCustomerSupportJd, defaultMasterProfile);
  assert(
    bpoResult.status === 'ABORT' &&
      bpoResult.failureReason === 'Blocked: Non-IT / BPO tele-calling role detected',
    'Test Case G5: Step c blocks BPO Voice Process Customer Support role with failureReason: "Blocked: Non-IT / BPO tele-calling role detected"',
    `failureReason: "${bpoResult.failureReason}" | reason: "${bpoResult.reason}"`
  );

  // G6: Step c - Industry Blocklist rejects Non-Technical Field Sales / Business Development (BDE)
  const salesBdeJd = `Job Title: Business Development Executive (BDE) - Field Sales
Company: Metro Retail Distribution
Location: Mumbai, India

Job Overview:
Seeking proactive Business Development Executives for retail channel expansion and direct merchant onboarding. You will conduct in-person merchant visits across commercial markets, pitch merchant discount rates, and close daily field sales.

Key Responsibilities:
- Travel daily across designated market zones to identify, meet, and pitch to shop owners and merchants.
- Achieve monthly sales targets of 25+ merchant contracts for point-of-sale terminal installations.
- Collect KYC documentation, complete physical onboarding, and provide basic terminal demonstration.
- Submit daily field visit reports and coordinate with regional sales managers.

Candidate Requirements:
- Any Bachelor degree. 0-1 years field sales or direct retail sales experience. Freshers with two-wheeler welcome.
- High energy, field stamina, local language fluency, and target-driven mindset.`;

  const salesResult = evaluateGatekeeperRules(salesBdeJd, defaultMasterProfile);
  assert(
    salesResult.status === 'ABORT' &&
      salesResult.failureReason === 'Blocked: Non-IT / BPO tele-calling role detected',
    'Test Case G6: Step c blocks Non-Technical Field Sales / BDE role with failureReason: "Blocked: Non-IT / BPO tele-calling role detected"',
    `failureReason: "${salesResult.failureReason}" | reason: "${salesResult.reason}"`
  );

  // G7: Step c - Industry Blocklist rejects Non-IT Engineering Domains (Mechanical / Civil / Medical)
  const mechanicalDesignJd = `Job Title: Mechanical Design Trainee
Company: Precision Automotive Components
Location: Pune, India

Job Description:
Looking for entry-level mechanical engineers to assist our CAD engineering squad. You will create 3D CAD models of chassis assemblies using SolidWorks, Creo, and AutoCAD, and perform stress simulations with ANSYS Workbench.

Responsibilities:
- Create parametric solid models, sheet metal layouts, and mechanical assemblies in SolidWorks and Creo.
- Perform finite element analysis (FEA) and thermal calculations using ANSYS Mechanical.
- Apply geometric dimensioning and tolerancing (GD&T) principles according to ASME standards.
- Prepare 2D manufacturing drawings, bill of materials (BOM), and tolerance stack-up analyses.

Requirements:
- Bachelor's degree in Mechanical Engineering or Automobile Engineering (0-1 year experience / Freshers).
- Demonstrated proficiency with SolidWorks, AutoCAD, Creo, and ANSYS.`;

  const mechResult = evaluateGatekeeperRules(mechanicalDesignJd, defaultMasterProfile);
  assert(
    mechResult.status === 'ABORT' &&
      mechResult.failureReason?.includes('Blocked: Non-IT role detected') &&
      mechResult.reason.includes('Domain Mismatch'),
    'Test Case G7: Step c blocks Mechanical CAD engineering role with failureReason: "Blocked: Non-IT role detected: Mechanical & Hardware Engineering"',
    `failureReason: "${mechResult.failureReason}" | reason: "${mechResult.reason}"`
  );

  // G8: Step d - Tech Domain & Language Taxonomy Check blocks role lacking core software technologies
  const nonTechAdminJd = `Job Title: Warehouse Operations Logistics Coordinator
Company: National Supply Chain Hub
Location: Bangalore, India

Job Summary:
We are hiring an entry-level Operations Coordinator to oversee warehouse supply inventory, organize storage bays, and schedule daily dispatch trucks. Open to fresh graduates with 0-1 years experience.

Key Duties:
- Monitor incoming inventory shipments, verify packing slips against purchase orders, and inspect cartons.
- Organize storage pallet placement and maintain physical warehouse safety compliance standards.
- Schedule truck loading docks, assign forklift operators, and prepare shipment dispatch manifests.
- Coordinate with customer logistics teams to resolve delayed delivery inquiries and package returns.

Requirements:
- Bachelor's degree in any discipline. 0-1 years operations experience.
- Strong organizational skills, physical inventory tracking experience, and team coordination.`;

  const nonTechResult = evaluateGatekeeperRules(nonTechAdminJd, defaultMasterProfile);
  assert(
    nonTechResult.status === 'ABORT' &&
      nonTechResult.failureReason === 'Blocked: Invalid/insufficient technical content' &&
      nonTechResult.reason.includes('Role mismatch'),
    'Test Case G8: Step d (Tech Domain & Language Taxonomy Check) blocks non-technical operations role lacking software programming languages / frameworks',
    `failureReason: "${nonTechResult.failureReason}" | reason: "${nonTechResult.reason}"`
  );

  // G9: Pipeline Integration Workflow Handler returns failureReason and reasoning for UI consumption
  const pipelineTelecallingResult = await evaluateJobDescriptionPipeline({
    rawJdText: telecallingJd,
    masterProfile: defaultMasterProfile,
  });

  assert(
    !pipelineTelecallingResult.success &&
      pipelineTelecallingResult.status === 'ABORT' &&
      pipelineTelecallingResult.failureReason === 'Blocked: Non-IT / BPO tele-calling role detected' &&
      typeof pipelineTelecallingResult.reasoning === 'string' &&
      pipelineTelecallingResult.reasoning.includes('tele-calling'),
    'Test Case G9: evaluateJobDescriptionPipeline returns failureReason and detailed reasoning for tele-calling role rejection',
    `Status: ${pipelineTelecallingResult.status} | failureReason: "${pipelineTelecallingResult.failureReason}" | reasoning: "${pipelineTelecallingResult.reasoning}"`
  );

  // ======================================================================
  // TEST CASE H: Malformed Job Descriptions with Conversational Artifacts
  // ======================================================================
  console.log('\n--- TEST CASE H: Conversational Artifacts & Prompt Leakage Interception ---');

  // H1: detectConversationalContamination detects tuning questions and inquiries
  const phrase1 = 'Would you like any more clarity on the candidate responsibilities?';
  const phrase2 = 'To fine-tune this further, should we lean more heavily into backend frameworks?';
  const phrase3 = 'Are there any specific shift timings for this position?';

  const det1 = detectConversationalContamination(phrase1);
  const det2 = detectConversationalContamination(phrase2);
  const det3 = detectConversationalContamination(phrase3);

  assert(
    det1.hasContamination && det2.hasContamination && det3.hasContamination,
    'Test Case H1: detectConversationalContamination detects "Would you like any more clarity", "To fine-tune this further", "Should we lean more heavily", and "Are there any specific shift timings"',
    `Matches: [${det1.matchedPatterns}], [${det2.matchedPatterns}], [${det3.matchedPatterns}]`
  );

  // H2: detectConversationalContamination detects assistant greetings and closing offers
  const assistantIntro = 'Sure! Here is the job description you requested for the Junior Python role:';
  const assistantClosing = 'Hope this helps! Let me know if you would like me to adjust or modify anything.';

  const detIntro = detectConversationalContamination(assistantIntro);
  const detClosing = detectConversationalContamination(assistantClosing);

  assert(
    detIntro.hasContamination && detClosing.hasContamination,
    'Test Case H2: detectConversationalContamination detects assistant greetings and closing modification offers',
    `Intro: [${detIntro.matchedPatterns}] | Closing: [${detClosing.matchedPatterns}]`
  );

  // Full contaminated JD sample (official JD body + trailing assistant prompt questions)
  const contaminatedJd = `Sure! Here is the job description:

Job Title: Junior Python Developer
Company: Apex Cloud Solutions
Location: Bangalore, India

Job Overview:
We are looking for an entry-level Python Developer to join our backend web development team.
You will develop RESTful API services, design relational database schemas, and write clean unit tests.

Responsibilities:
- Build backend APIs using Python, Django, and PostgreSQL.
- Collaborate with frontend engineers using Git and Agile sprints.
- Maintain code quality and write comprehensive unit tests.

Requirements:
- Bachelor's degree in Computer Science or Information Technology (Freshers / 2026 batch welcome).
- 0-1 year of experience with Python and SQL.

Would you like any more clarity on the tech stack? To fine-tune this further, should we lean more heavily into Kubernetes and Golang? Are there any specific shift timings you prefer?`;

  // H3: validateJdSanity flags contaminated JD with exact rejection reason
  const sanityResult = validateJdSanity(contaminatedJd);
  assert(
    !sanityResult.isValid &&
      sanityResult.failureReason === 'Blocked: Malformed job description detected' &&
      sanityResult.reason.includes('Extraneous chat prompts or conversational text found mixed into the input'),
    'Test Case H3: validateJdSanity rejects contaminated text with failureReason: "Blocked: Malformed job description detected"',
    `failureReason: "${sanityResult.failureReason}" | reason: "${sanityResult.reason}"`
  );

  // H4: sanitizeJobDescription throws Error with exact failure message
  let sanitizeErrorThrown = false;
  let sanitizeErrorReason = '';
  try {
    sanitizeJobDescription(contaminatedJd);
  } catch (err) {
    sanitizeErrorThrown = true;
    sanitizeErrorReason = err.message;
  }
  assert(
    sanitizeErrorThrown &&
      sanitizeErrorReason.includes(
        'Blocked: Malformed job description detected. Extraneous chat prompts or conversational text found mixed into the input.'
      ),
    'Test Case H4: sanitizeJobDescription throws clear rejection reason on conversational contamination',
    `Error caught: "${sanitizeErrorReason}"`
  );

  // H5: evaluateGatekeeperRules returns ABORT with exact failureReason
  const gatekeeperContaminatedResult = evaluateGatekeeperRules(contaminatedJd, defaultMasterProfile);
  assert(
    gatekeeperContaminatedResult.status === 'ABORT' &&
      gatekeeperContaminatedResult.failureReason === 'Blocked: Malformed job description detected' &&
      gatekeeperContaminatedResult.reason ===
        'Blocked: Malformed job description detected. Extraneous chat prompts or conversational text found mixed into the input.',
    'Test Case H5: evaluateGatekeeperRules rejects contaminated input with failureReason: "Blocked: Malformed job description detected"',
    `failureReason: "${gatekeeperContaminatedResult.failureReason}" | reason: "${gatekeeperContaminatedResult.reason}"`
  );

  // H6: Prevent False Keyword Matches: Accidental tech keywords in prompt questions are completely ignored
  // "Kubernetes" and "Golang" are mentioned ONLY in the trailing chat question, NOT in the official JD body!
  const extractedTech = extractTechnicalRequirements(contaminatedJd);
  const extractedNames = extractedTech.allExtracted || [];
  const hasKubernetes = extractedNames.includes('Kubernetes');
  const hasGolang = extractedNames.includes('Go') || extractedNames.includes('Golang');
  const hasPython = extractedNames.includes('Python');
  const hasDjango = extractedNames.includes('Django');

  assert(
    !hasKubernetes && !hasGolang && hasPython && hasDjango,
    'Test Case H6: extractTechnicalRequirements strictly ignores accidental tech keywords ("Kubernetes", "Golang") in conversational questions',
    `Extracted Tech: [${extractedNames.join(', ')}] | Kubernetes blocked: ${!hasKubernetes} | Golang blocked: ${!hasGolang}`
  );

  // H7: stripConversationalArtifacts cleanly strips preamble and trailing questions
  const cleanStrippedJd = stripConversationalArtifacts(contaminatedJd);
  const strippedContamination = detectConversationalContamination(cleanStrippedJd);
  assert(
    !strippedContamination.hasContamination &&
      !cleanStrippedJd.includes('Sure! Here is the job description:') &&
      !cleanStrippedJd.includes('Would you like any more clarity') &&
      cleanStrippedJd.includes('Apex Cloud Solutions') &&
      cleanStrippedJd.includes('PostgreSQL'),
    'Test Case H7: stripConversationalArtifacts successfully purges chat preamble and trailing inquiries, yielding clean JD body',
    `Word count: ${cleanStrippedJd.split(/\s+/).length} words | Contamination detected: ${strippedContamination.hasContamination}`
  );

  // H8: evaluateGatekeeperRules approves clean stripped JD
  const strippedGatekeeperResult = evaluateGatekeeperRules(cleanStrippedJd, defaultMasterProfile);
  assert(
    strippedGatekeeperResult.status === 'PROCEED',
    'Test Case H8: evaluateGatekeeperRules approves the clean stripped Job Description',
    `Status: ${strippedGatekeeperResult.status} | Reason: "${strippedGatekeeperResult.reason}"`
  );

  // H9: evaluateJobDescriptionPipeline returns ABORT with failureReason and reasoning for UI
  const pipelineContaminatedResult = await evaluateJobDescriptionPipeline({
    rawJdText: contaminatedJd,
    masterProfile: defaultMasterProfile,
  });
  assert(
    !pipelineContaminatedResult.success &&
      pipelineContaminatedResult.status === 'ABORT' &&
      pipelineContaminatedResult.failureReason === 'Blocked: Malformed job description detected' &&
      pipelineContaminatedResult.reasoning.includes(
        'Extraneous chat prompts or conversational text found mixed into the input'
      ),
    'Test Case H9: evaluateJobDescriptionPipeline rejects contaminated JD with failureReason: "Blocked: Malformed job description detected"',
    `Status: ${pipelineContaminatedResult.status} | failureReason: "${pipelineContaminatedResult.failureReason}"`
  );

  // H10: evaluateJobDescriptionPipeline with stripConversationalArtifacts: true cleanly processes and scores
  const pipelineStrippedResult = await evaluateJobDescriptionPipeline({
    rawJdText: contaminatedJd,
    masterProfile: defaultMasterProfile,
    stripConversationalArtifacts: true,
  });
  assert(
    pipelineStrippedResult.success &&
      pipelineStrippedResult.status === 'PROCEED' &&
      pipelineStrippedResult.baselineScore &&
      pipelineStrippedResult.baselineScore.overallScore >= 40,
    'Test Case H10: evaluateJobDescriptionPipeline with stripConversationalArtifacts: true approves role and generates baseline score',
    `Status: ${pipelineStrippedResult.status} | Score: ${pipelineStrippedResult.baselineScore?.overallScore}/100 | Engine: ${pipelineStrippedResult.engine}`
  );

  // ======================================================================
  // TEST CASE I: Exclusive Institution & College Tier Filter (IIT/NIT/BITS/Tier-1)
  // ======================================================================
  console.log('\n--- TEST CASE I: Exclusive Institution & College Tier Filter ---');

  // I1: detectExclusiveInstitutionRequirement detects exact target phrases from user requirements
  const tierPhrase1 = 'Candidates must be strictly from IIT or NIT with 0-1 year experience.';
  const tierPhrase2 = 'Education Requirement: B.Tech / B.E from Tier-1 colleges only.';
  const tierPhrase3 = 'We are hiring entry-level developers from IIT/BITS/NIT only.';

  const tierDet1 = detectExclusiveInstitutionRequirement(tierPhrase1);
  const tierDet2 = detectExclusiveInstitutionRequirement(tierPhrase2);
  const tierDet3 = detectExclusiveInstitutionRequirement(tierPhrase3);

  assert(
    tierDet1.hasExclusiveRequirement && tierDet2.hasExclusiveRequirement && tierDet3.hasExclusiveRequirement,
    'Test Case I1: detectExclusiveInstitutionRequirement detects "strictly from IIT or NIT", "Tier-1 colleges only", and "IIT/BITS/NIT only"',
    `Matches: [${tierDet1.matchedPatterns}], [${tierDet2.matchedPatterns}], [${tierDet3.matchedPatterns}]`
  );

  // I2: detectExclusiveInstitutionRequirement detects premier institutes and parenthesized tier-1 requirements
  const tierPhrase4 = 'Graduates from IITs, NITs, BITS only.';
  const tierPhrase5 = 'Only graduates from premier institutes (IIT/NIT/BITS) will be considered.';
  const tierPhrase6 = 'Hiring exclusively from IIT/NIT engineering colleges.';

  const tierDet4 = detectExclusiveInstitutionRequirement(tierPhrase4);
  const tierDet5 = detectExclusiveInstitutionRequirement(tierPhrase5);
  const tierDet6 = detectExclusiveInstitutionRequirement(tierPhrase6);

  assert(
    tierDet4.hasExclusiveRequirement && tierDet5.hasExclusiveRequirement && tierDet6.hasExclusiveRequirement,
    'Test Case I2: detectExclusiveInstitutionRequirement detects premier institutes and exclusive college tier variations',
    `Matches: [${tierDet4.matchedPatterns}], [${tierDet5.matchedPatterns}], [${tierDet6.matchedPatterns}]`
  );

  // I3: candidateMatchesInstitutionTier checks profile background accurately
  const nonTier1Profile = defaultMasterProfile; // Education from SVCET & Sri Chaitanya
  const tier1Profile = {
    ...defaultMasterProfile,
    education: [
      {
        institution: 'IIT Madras',
        degree: 'B.Tech',
        fieldOfStudy: 'Computer Science and Engineering',
        graduationYear: '2022-2026',
        honors: 'CGPA: 9.1',
      },
    ],
  };

  const matchesNonTier1 = candidateMatchesInstitutionTier(nonTier1Profile);
  const matchesTier1 = candidateMatchesInstitutionTier(tier1Profile);

  assert(
    !matchesNonTier1 && matchesTier1,
    'Test Case I3: candidateMatchesInstitutionTier accurately distinguishes non-Tier-1 profile (SVCET) vs Tier-1 profile (IIT Madras)',
    `defaultProfile (SVCET): ${matchesNonTier1} | tier1Profile (IIT Madras): ${matchesTier1}`
  );

  // Sample JD 1: strictly from IIT or NIT
  const iitNitOnlyJd = `Job Title: Junior Software Engineer
Company: Alpha Quant Labs
Location: Bangalore, India

About the Role:
We are seeking high-caliber entry-level software engineers to build high-frequency trading backend infrastructure using Python and Django.
Candidates will design distributed message queues, optimize database queries, and implement clean RESTful endpoints.

Candidate Qualifications & Criteria:
- Bachelor's degree in Computer Science or Information Technology strictly from IIT or NIT.
- 0-1 years of experience or 2026 batch fresh graduates.
- Strong knowledge of Python, Django, REST APIs, PostgreSQL, and Git version control.
- Solid foundational understanding of algorithms, data structures, and computer science fundamentals.`;

  // I4: evaluateGatekeeperRules blocks JD requiring "strictly from IIT or NIT" against default candidate
  const iitNitResult = evaluateGatekeeperRules(iitNitOnlyJd, defaultMasterProfile);
  assert(
    iitNitResult.status === 'ABORT' &&
      iitNitResult.failureReason === 'Blocked: Exclusive institution requirement detected' &&
      iitNitResult.reason ===
        'Blocked: Exclusive institution requirement detected (e.g., IIT/NIT only) which does not match profile education.',
    'Test Case I4: Gatekeeper blocks JD requiring "strictly from IIT or NIT" with exact failureReason and reason',
    `Status: ${iitNitResult.status} | failureReason: "${iitNitResult.failureReason}" | reason: "${iitNitResult.reason}"`
  );

  // Sample JD 2: Tier-1 colleges only
  const tier1OnlyJd = `Job Title: Associate Full Stack Developer
Company: Apex Innovations
Location: Hyderabad, India

Job Description:
Looking for an enthusiastic Associate Full Stack Developer to build cloud applications using React, Python, and PostgreSQL.
You will write clean code, participate in agile team sprints, review pull requests, and deploy backend microservices.

Requirements & Eligibility:
- B.Tech / B.E degree from Tier-1 colleges only (IIT/NIT/BITS).
- 0-1 year of professional experience or recent college graduate.
- Hands-on skills in Python, React, PostgreSQL, and Git.
- Excellent analytical, problem-solving, and collaboration capabilities.`;

  // I5: evaluateGatekeeperRules blocks JD requiring "Tier-1 colleges only"
  const tier1Result = evaluateGatekeeperRules(tier1OnlyJd, defaultMasterProfile);
  assert(
    tier1Result.status === 'ABORT' &&
      tier1Result.failureReason === 'Blocked: Exclusive institution requirement detected' &&
      tier1Result.reason.includes('IIT/NIT only') &&
      tier1Result.reasoning.includes('does not match profile education'),
    'Test Case I5: Gatekeeper blocks JD requiring "Tier-1 colleges only" with clear rejection explanation',
    `Status: ${tier1Result.status} | failureReason: "${tier1Result.failureReason}" | reason: "${tier1Result.reason}"`
  );

  // Sample JD 3: IIT/BITS/NIT only
  const bitsOnlyJd = `Job Title: Junior Backend Developer
Company: NextGen Systems
Location: Pune, India

Overview:
We have an urgent opening for a Junior Backend Developer to design scalable REST APIs and data processing workflows using Python and Django.

Qualifications:
- Bachelor's degree in Engineering from IIT/BITS/NIT only.
- 0-1 years of experience (Freshers welcome).
- Proficiency with Python, Django, SQL databases, and Git.
- Good communication and teamwork skills.`;

  // I6: evaluateGatekeeperRules blocks JD requiring "IIT/BITS/NIT only"
  const bitsResult = evaluateGatekeeperRules(bitsOnlyJd, defaultMasterProfile);
  assert(
    bitsResult.status === 'ABORT' &&
      bitsResult.failureReason === 'Blocked: Exclusive institution requirement detected' &&
      bitsResult.reason ===
        'Blocked: Exclusive institution requirement detected (e.g., IIT/NIT only) which does not match profile education.',
    'Test Case I6: Gatekeeper blocks JD requiring "IIT/BITS/NIT only" against non-Tier-1 profile',
    `Status: ${bitsResult.status} | failureReason: "${bitsResult.failureReason}" | reason: "${bitsResult.reason}"`
  );

  // I7: Candidate Profile Exemption - Profile from IIT Madras is approved for IIT/NIT role
  const exemptResult = evaluateGatekeeperRules(iitNitOnlyJd, tier1Profile);
  assert(
    exemptResult.status === 'PROCEED',
    'Test Case I7: Candidate possessing Tier-1 education (IIT Madras) is approved for exclusive institution role',
    `Status: ${exemptResult.status} | Reason: "${exemptResult.reason}"`
  );

  // I8: calculateBaselineScore returns null when JD demands exclusive institution candidate lacks
  const baselineScoreOnTier1Jd = calculateBaselineScore({
    cleanedJdText: iitNitOnlyJd,
    masterProfile: defaultMasterProfile,
  });
  assert(
    baselineScoreOnTier1Jd === null,
    'Test Case I8: calculateBaselineScore returns null when JD demands exclusive institution candidate does not possess',
    `Score: ${baselineScoreOnTier1Jd}`
  );

  // I9: evaluateJobDescriptionPipeline returns hard-stop ABORT on exclusive institution JD
  const pipelineTierResult = await evaluateJobDescriptionPipeline({
    rawJdText: iitNitOnlyJd,
    masterProfile: defaultMasterProfile,
  });
  assert(
    !pipelineTierResult.success &&
      pipelineTierResult.status === 'ABORT' &&
      pipelineTierResult.failureReason === 'Blocked: Exclusive institution requirement detected' &&
      pipelineTierResult.reasoning.includes('does not match profile education'),
    'Test Case I9: evaluateJobDescriptionPipeline returns ABORT with failureReason: "Blocked: Exclusive institution requirement detected"',
    `Status: ${pipelineTierResult.status} | failureReason: "${pipelineTierResult.failureReason}" | reasoning: "${pipelineTierResult.reasoning}"`
  );

  // I10: Standard entry-level role without exclusive institution requirement passes cleanly
  const standardJd = `Job Title: Junior Python Developer
Company: Standard Web Enterprises
Location: Bangalore, India

Job Description:
We are hiring an entry-level Python Developer to build backend services and REST APIs with Python and Django.
Open to fresh graduates from 2026 batch or 0-1 years experience from any recognized university or accredited college.

Requirements:
- Bachelor's degree in Computer Science, Information Technology, or related field.
- 0-1 year experience with Python, Django, SQL, and Git.
- Willingness to learn and grow in a fast-paced agile development team.`;

  const standardPipelineResult = await evaluateJobDescriptionPipeline({
    rawJdText: standardJd,
    masterProfile: defaultMasterProfile,
  });
  assert(
    standardPipelineResult.success &&
      standardPipelineResult.status === 'PROCEED' &&
      standardPipelineResult.baselineScore &&
      standardPipelineResult.baselineScore.overallScore >= 40,
    'Test Case I10: Standard role without exclusive institution requirement passes with non-null baseline score',
    `Status: ${standardPipelineResult.status} | Score: ${standardPipelineResult.baselineScore?.overallScore}/100`
  );

  // ======================================================================
  // TEST CASE J: Restrictive Graduation Batch Year Conflict Filter
  // ======================================================================
  console.log('\n--- TEST CASE J: Restrictive Graduation Batch Year Conflict Filter ---');

  // J1: getCandidateGraduationYear extracts terminal graduation year from Master Profile
  const defaultGradYear = getCandidateGraduationYear(defaultMasterProfile);
  assert(
    defaultGradYear === '2026',
    'Test Case J1: getCandidateGraduationYear extracts terminal graduation year "2026" from candidate profile',
    `Extracted Year: "${defaultGradYear}" (Expected: "2026")`
  );

  // J2: evaluateBatchYearEligibility accurately catches conflicting batch year expressions
  const batch2025Snippet1 = 'Candidate eligibility: Strictly requires 2025 batch graduates for campus onboarding.';
  const batch2025Snippet2 = 'Qualifications: B.Tech in CSE / IT - 2025 Batch only. Freshers from other years not eligible.';
  const batch2025Snippet3 = 'Eligibility: Eligible batches: 2024, 2025. Please apply only if you have completed degree.';

  const evalBatch1 = evaluateBatchYearEligibility(batch2025Snippet1, defaultMasterProfile);
  const evalBatch2 = evaluateBatchYearEligibility(batch2025Snippet2, defaultMasterProfile);
  const evalBatch3 = evaluateBatchYearEligibility(batch2025Snippet3, defaultMasterProfile);

  assert(
    evalBatch1.isBlocked &&
      evalBatch1.failureReason === 'Blocked: Batch year mismatch' &&
      evalBatch1.reason ===
        "Blocked: Batch year mismatch. The role strictly requires 2025 batch graduates, which conflicts with your profile's graduation year." &&
      evalBatch2.isBlocked &&
      evalBatch2.failureReason === 'Blocked: Batch year mismatch' &&
      evalBatch3.isBlocked &&
      evalBatch3.failureReason === 'Blocked: Batch year mismatch',
    'Test Case J2: evaluateBatchYearEligibility accurately catches restrictive batch patterns (strictly 2025 batch, 2025 Batch only)',
    `Batch 1: ${evalBatch1.failureReason} | Batch 2: ${evalBatch2.failureReason} | Batch 3: ${evalBatch3.failureReason}`
  );

  // J3: evaluateBatchYearEligibility does NOT block inclusive batches mentioning candidate batch
  const inclusiveBatchSnippet1 = 'Open to fresh graduates from 2025 and 2026 batch graduates with strong Python skills.';
  const inclusiveBatchSnippet2 = 'Eligibility: Eligible batches: 2025, 2026. Entry level positions.';
  const evalInclusive1 = evaluateBatchYearEligibility(inclusiveBatchSnippet1, defaultMasterProfile);
  const evalInclusive2 = evaluateBatchYearEligibility(inclusiveBatchSnippet2, defaultMasterProfile);

  assert(
    !evalInclusive1.isBlocked && !evalInclusive2.isBlocked,
    'Test Case J3: evaluateBatchYearEligibility approves inclusive batches that include candidate batch (2026)',
    `Inclusive 1 blocked: ${evalInclusive1.isBlocked} | Inclusive 2 blocked: ${evalInclusive2.isBlocked}`
  );

  // Full JD Sample 1: Strictly requires 2025 batch graduates
  const batch2025Jd = `Job Title: Junior Software Engineer
Company: CloudPeak Technologies
Location: Bangalore, India

Job Description:
CloudPeak is seeking a Junior Software Engineer to join our core backend engineering team.
You will assist in developing RESTful microservices using Python and Django, write unit tests, and maintain database schemas.

Candidate Eligibility & Requirements:
- Bachelor's degree in Computer Science, Information Technology, or related discipline.
- The role strictly requires 2025 batch graduates for immediate Q1 full-time deployment.
- Proficient in Python, Django, REST APIs, Git, and SQL databases.
- Good analytical mindset and eagerness to contribute to production software.`;

  // J4: evaluateGatekeeperRules blocks JD requiring strictly 2025 batch with exact reason string
  const gatekeeperBatchResult1 = evaluateGatekeeperRules(batch2025Jd, defaultMasterProfile);
  assert(
    gatekeeperBatchResult1.status === 'ABORT' &&
      gatekeeperBatchResult1.failureReason === 'Blocked: Batch year mismatch' &&
      gatekeeperBatchResult1.reason ===
        "Blocked: Batch year mismatch. The role strictly requires 2025 batch graduates, which conflicts with your profile's graduation year.",
    'Test Case J4: Gatekeeper blocks JD requiring "strictly requires 2025 batch graduates" with exact failureReason and reason',
    `Status: ${gatekeeperBatchResult1.status} | failureReason: "${gatekeeperBatchResult1.failureReason}" | reason: "${gatekeeperBatchResult1.reason}"`
  );

  // Full JD Sample 2: 2025 Batch only
  const batchOnly2025Jd = `Job Title: Associate Python Developer
Company: DataMatrix Systems
Location: Hyderabad, India

Overview:
We are expanding our software engineering group and looking for an Associate Python Developer to work on data pipelines and web APIs.
Responsibilities include writing clean Python code, integrating third-party APIs, and collaborating with senior architects.

Requirements:
- B.E / B.Tech in CSE / IT - 2025 Batch only.
- 0-1 years of experience or 2025 freshers.
- Hands-on skills in Python, Django, PostgreSQL, and Git version control.
- Strong problem-solving abilities and verbal communication skills.`;

  // J5: evaluateGatekeeperRules blocks JD requiring "2025 Batch only"
  const gatekeeperBatchResult2 = evaluateGatekeeperRules(batchOnly2025Jd, defaultMasterProfile);
  assert(
    gatekeeperBatchResult2.status === 'ABORT' &&
      gatekeeperBatchResult2.failureReason === 'Blocked: Batch year mismatch' &&
      gatekeeperBatchResult2.reason ===
        "Blocked: Batch year mismatch. The role strictly requires 2025 batch graduates, which conflicts with your profile's graduation year.",
    'Test Case J5: Gatekeeper blocks JD requiring "2025 Batch only" preventing fallback to generic technical errors',
    `Status: ${gatekeeperBatchResult2.status} | failureReason: "${gatekeeperBatchResult2.failureReason}" | reason: "${gatekeeperBatchResult2.reason}"`
  );

  // Full JD Sample 3: Inclusive 2025 and 2026 batch graduates
  const inclusiveBatchJd = `Job Title: Junior Backend Developer
Company: ScaleFast Software
Location: Pune, India

Job Description:
ScaleFast is hiring Junior Backend Developers to design scalable APIs and backend services using Python and Django.
Open to 2025 and 2026 batch graduates from accredited universities.

Requirements:
- Bachelor's degree in Computer Science or related fields.
- 0-1 years of experience with Python, Django, REST APIs, and SQL.
- Familiarity with Git, Linux environments, and automated testing.`;

  // J6: evaluateGatekeeperRules approves inclusive batch JD
  const gatekeeperInclusiveResult = evaluateGatekeeperRules(inclusiveBatchJd, defaultMasterProfile);
  assert(
    gatekeeperInclusiveResult.status === 'PROCEED',
    'Test Case J6: Gatekeeper approves inclusive JD open to 2025 and 2026 batch graduates',
    `Status: ${gatekeeperInclusiveResult.status} | Reason: "${gatekeeperInclusiveResult.reason}"`
  );

  // J7: Candidate Profile Exemption - Profile graduating in 2025 is approved for 2025 batch role
  const profile2025 = {
    ...defaultMasterProfile,
    education: [
      {
        degree: 'Bachelor of Technology in Computer Science and Engineering',
        institution: 'Sri Venkateswara College of Engineering and Technology (Autonomous), Chittoor',
        graduationYear: '2021-2025',
        score: 'CGPA: 8.7',
      },
    ],
  };

  const exemptBatchResult = evaluateGatekeeperRules(batch2025Jd, profile2025);
  assert(
    exemptBatchResult.status === 'PROCEED',
    'Test Case J7: Candidate possessing matching 2025 graduation year is approved for 2025 batch role',
    `Status: ${exemptBatchResult.status} | Reason: "${exemptBatchResult.reason}"`
  );

  // J8: calculateBaselineScore returns null when JD has conflicting batch year requirement
  const baselineScoreOnBatchMismatch = calculateBaselineScore({
    cleanedJdText: batch2025Jd,
    masterProfile: defaultMasterProfile,
  });
  assert(
    baselineScoreOnBatchMismatch === null,
    'Test Case J8: calculateBaselineScore returns null when JD contains conflicting graduation batch year',
    `Score: ${baselineScoreOnBatchMismatch}`
  );

  // J9: evaluateJobDescriptionPipeline returns ABORT on batch year conflict with exact failureReason and reasoning
  const pipelineBatchResult = await evaluateJobDescriptionPipeline({
    rawJdText: batch2025Jd,
    masterProfile: defaultMasterProfile,
  });
  assert(
    !pipelineBatchResult.success &&
      pipelineBatchResult.status === 'ABORT' &&
      pipelineBatchResult.failureReason === 'Blocked: Batch year mismatch' &&
      pipelineBatchResult.reasoning ===
        "Blocked: Batch year mismatch. The role strictly requires 2025 batch graduates, which conflicts with your profile's graduation year.",
    'Test Case J9: evaluateJobDescriptionPipeline returns ABORT with failureReason: "Blocked: Batch year mismatch"',
    `Status: ${pipelineBatchResult.status} | failureReason: "${pipelineBatchResult.failureReason}" | reasoning: "${pipelineBatchResult.reasoning}"`
  );

  // J10: Standard role without batch restriction passes with valid baseline score >= 40
  const standardBatchResult = await evaluateJobDescriptionPipeline({
    rawJdText: standardJd,
    masterProfile: defaultMasterProfile,
  });
  assert(
    standardBatchResult.success &&
      standardBatchResult.status === 'PROCEED' &&
      standardBatchResult.baselineScore &&
      standardBatchResult.baselineScore.overallScore >= 40,
    'Test Case J10: Standard role without batch restrictions passes with valid baseline score >= 40',
    `Status: ${standardBatchResult.status} | Score: ${standardBatchResult.baselineScore?.overallScore}/100`
  );

  // ======================================================================
  // TEST CASE K: UI Error Banner Rejection Reason Mapping & Anti-Fallback
  // ======================================================================
  console.log('\n--- TEST CASE K: UI Error Banner Rejection Reason Mapping & Anti-Fallback ---');

  // Helper simulating the exact JSX resolution logic in TailoredResumeWorkspace.jsx (lines 990-1012)
  const resolveBannerDisplay = (result) => {
    const bannerHeader =
      result?.failureReason ||
      result?.reasoning ||
      result?.reason ||
      'Gatekeeper Guardrail Block (ABORT)';
    const bannerBody =
      result?.reasoning ||
      result?.reason ||
      result?.failureReason ||
      '';
    return { bannerHeader, bannerBody };
  };

  // K1: Batch Year Mismatch directly populates bannerHeader and bannerBody with zero fallback
  const batchBanner = resolveBannerDisplay(pipelineBatchResult);
  assert(
    batchBanner.bannerHeader === 'Blocked: Batch year mismatch' &&
      !batchBanner.bannerHeader.includes('Invalid/insufficient technical content') &&
      batchBanner.bannerBody ===
        "Blocked: Batch year mismatch. The role strictly requires 2025 batch graduates, which conflicts with your profile's graduation year.",
    'Test Case K1: UI banner directly renders batch mismatch failureReason and reasoning without falling back to generic errors',
    `Header: "${batchBanner.bannerHeader}" | Body: "${batchBanner.bannerBody}"`
  );

  // K2: Exclusive Institution requirement directly populates bannerHeader and bannerBody
  const exclusiveBanner = resolveBannerDisplay(pipelineTierResult);
  assert(
    exclusiveBanner.bannerHeader === 'Blocked: Exclusive institution requirement detected' &&
      !exclusiveBanner.bannerHeader.includes('Invalid/insufficient technical content') &&
      exclusiveBanner.bannerBody.includes('does not match profile education'),
    'Test Case K2: UI banner directly renders exclusive institution rejection without fallback',
    `Header: "${exclusiveBanner.bannerHeader}" | Body: "${exclusiveBanner.bannerBody}"`
  );

  // K3: Senior experience requirement directly populates bannerHeader and bannerBody
  const seniorRoleText = `Job Title: Senior Software Architect
Company: Enterprise Solutions Inc.
Location: Bangalore, India

About the Role:
We are looking for a Senior Software Architect with 6+ years of hands-on experience building large-scale distributed systems in Python and Django.
The ideal candidate must lead engineering teams, conduct code reviews, and drive technical architecture across cloud environments.

Requirements:
- Minimum 6+ years of professional experience in software development.
- Deep expertise in Python, Django, microservices, and system architecture.
- Track record of mentoring junior engineers and leading complex technical initiatives.`;

  const seniorPipelineRes = await evaluateJobDescriptionPipeline({
    rawJdText: seniorRoleText,
    masterProfile: defaultMasterProfile,
  });
  const seniorBanner = resolveBannerDisplay(seniorPipelineRes);
  assert(
    seniorBanner.bannerHeader === 'Blocked: Requires senior experience' &&
      !seniorBanner.bannerHeader.includes('Invalid/insufficient technical content') &&
      seniorBanner.bannerBody.includes('Requires senior experience'),
    'Test Case K3: UI banner directly renders senior experience rejection without fallback',
    `Header: "${seniorBanner.bannerHeader}" | Body: "${seniorBanner.bannerBody}"`
  );

  // K4: Non-IT / BPO Telecalling role directly populates bannerHeader and bannerBody
  const bpoRoleText = `Job Title: Telecalling Customer Support Executive
Company: Global BPO Connect
Location: Hyderabad, India

Job Description:
We are hiring Telecallers, Voice Process executives, and Customer Support Agents for our international outbound operations.
Candidates will make 100+ tele-calling inquiries daily to resolve consumer questions, manage voice logs, and handle telemarketing outreach.

Requirements:
- High school diploma or Bachelor's degree in any field.
- Excellent verbal communication skills for telephone interaction.
- Freshers and experienced telecallers are welcome to apply.`;

  const bpoPipelineRes = await evaluateJobDescriptionPipeline({
    rawJdText: bpoRoleText,
    masterProfile: defaultMasterProfile,
  });
  const bpoBanner = resolveBannerDisplay(bpoPipelineRes);
  assert(
    bpoBanner.bannerHeader === 'Blocked: Non-IT / BPO tele-calling role detected' &&
      !bpoBanner.bannerHeader.includes('Invalid/insufficient technical content') &&
      bpoBanner.bannerBody.includes('Non-IT / BPO tele-calling role detected'),
    'Test Case K4: UI banner directly renders BPO / Tele-calling rejection without fallback',
    `Header: "${bpoBanner.bannerHeader}" | Body: "${bpoBanner.bannerBody}"`
  );

  // K5: Concise batch-year restricted JD (< 50 words) bypasses generic text validation check
  const shortBatchJd = 'Urgent opening: Software Developer - Strictly requires 2025 batch graduates only. Apply now.';
  const shortBatchPipelineRes = await evaluateJobDescriptionPipeline({
    rawJdText: shortBatchJd,
    masterProfile: defaultMasterProfile,
  });
  const shortBatchBanner = resolveBannerDisplay(shortBatchPipelineRes);
  assert(
    shortBatchPipelineRes.status === 'ABORT' &&
      shortBatchPipelineRes.failureReason === 'Blocked: Batch year mismatch' &&
      !shortBatchBanner.bannerHeader.includes('Invalid/insufficient technical content') &&
      shortBatchBanner.bannerHeader === 'Blocked: Batch year mismatch' &&
      shortBatchBanner.bannerBody.includes('conflicts with your profile'),
    'Test Case K5: Batch year mismatch bypasses generic text validation check and delivers exact failureReason to UI banner',
    `Header: "${shortBatchBanner.bannerHeader}" | Body: "${shortBatchBanner.bannerBody}"`
  );

  // K6: Concise exclusive-tier restricted JD (< 50 words) bypasses generic text validation check
  const shortTierJd = 'Hiring Software Engineer: Role open strictly from IIT or NIT only. Python skills required.';
  const shortTierPipelineRes = await evaluateJobDescriptionPipeline({
    rawJdText: shortTierJd,
    masterProfile: defaultMasterProfile,
  });
  const shortTierBanner = resolveBannerDisplay(shortTierPipelineRes);
  assert(
    shortTierPipelineRes.status === 'ABORT' &&
      shortTierPipelineRes.failureReason === 'Blocked: Exclusive institution requirement detected' &&
      !shortTierBanner.bannerHeader.includes('Invalid/insufficient technical content') &&
      shortTierBanner.bannerHeader === 'Blocked: Exclusive institution requirement detected' &&
      shortTierBanner.bannerBody.includes('does not match profile education'),
    'Test Case K6: Exclusive institution mismatch bypasses generic text validation check and delivers exact failureReason to UI banner',
    `Header: "${shortTierBanner.bannerHeader}" | Body: "${shortTierBanner.bannerBody}"`
  );

  // K7: Experience level mismatch directly populates bannerHeader and bannerBody with exact failureReason
  const twoYearsExpJd = `- Job Title: Python Developer
- Experience: 2+ years
- Location: Bangalore
- Responsibilities:
  - Develop backend applications in Python and Django`;

  const twoYearsExpPipelineRes = await evaluateJobDescriptionPipeline({
    rawJdText: twoYearsExpJd,
    masterProfile: defaultMasterProfile,
  });
  const expMismatchBanner = resolveBannerDisplay(twoYearsExpPipelineRes);
  assert(
    twoYearsExpPipelineRes.status === 'ABORT' &&
      twoYearsExpPipelineRes.failureReason ===
        'Blocked: Experience level mismatch. The role requires experience greater than your entry-level threshold (0-1 year maximum).' &&
      expMismatchBanner.bannerHeader ===
        'Blocked: Experience level mismatch. The role requires experience greater than your entry-level threshold (0-1 year maximum).' &&
      !expMismatchBanner.bannerHeader.includes('Invalid/insufficient technical content'),
    'Test Case K7: UI banner directly renders experience mismatch failureReason without fallback',
    `Header: "${expMismatchBanner.bannerHeader}" | Body: "${expMismatchBanner.bannerBody}"`
  );

  // ======================================================================
  // TEST CASE L: Standard Structured Bulleted Job Description Acceptance & Downstream Preservation
  // ======================================================================
  console.log('\n--- TEST CASE L: Standard Structured Bulleted Job Description Acceptance & Downstream Preservation ---');

  // L1: isStandardStructuredBulletedJd detects bulleted JDs and distinguishes them from casual short text or gibberish
  const standardBulletedJd = `- Job Title: Junior Python Developer
- Experience: 0-1 years
- Key Responsibilities:
  - Develop backend REST APIs with Python and Django
  - Write SQL queries and work with PostgreSQL database
  - Collaborate with cross-functional engineering team
- Requirements:
  - Bachelor's degree in Computer Science or IT
  - Good foundational skills in Python, Git, and SQL`;

  assert(
    isStandardStructuredBulletedJd(standardBulletedJd) &&
      !isStandardStructuredBulletedJd('Looking for a developer to help with python coding.') &&
      !isStandardStructuredBulletedJd(repeatingSyllablesJd),
    'Test Case L1: isStandardStructuredBulletedJd detects structured bulleted JDs and distinguishes them from casual short text or gibberish',
    `Structured JD: ${isStandardStructuredBulletedJd(standardBulletedJd)} | Casual short text: ${isStandardStructuredBulletedJd('Looking for a developer to help with python coding.')}`
  );

  // L2: sanitizeJobDescription accepts standard structured bulleted JD without throwing 50-word error
  const sanitizedBulleted = sanitizeJobDescription(standardBulletedJd);
  assert(
    typeof sanitizedBulleted.cleanedText === 'string' &&
      sanitizedBulleted.wordCount > 0 &&
      sanitizedBulleted.wrappedXml.startsWith('<user_jd>') &&
      sanitizedBulleted.wrappedXml.endsWith('</user_jd>'),
    'Test Case L2: sanitizeJobDescription accepts standard structured bulleted JD without false-positive rejection',
    `Word Count: ${sanitizedBulleted.wordCount} | XML Delimiters verified`
  );

  // L3: sanitizeJobDescription normalizes alternative bullets (• and *) to standard format
  const unicodeBulletedJd = `• Job Title: Frontend Developer
• Experience: 0-1 years
• Key Responsibilities:
  • Build responsive user interfaces with React and HTML5
  • Integrate backend REST APIs
  • Write unit tests with Jest
• Requirements:
  • B.Tech or B.E. in CS/IT
  • Proficiency in JavaScript, React, Git`;

  const unicodeSanitized = sanitizeJobDescription(unicodeBulletedJd);
  assert(
    unicodeSanitized.cleanedText.includes('- Job Title:') &&
      unicodeSanitized.cleanedText.includes('- Experience:') &&
      unicodeSanitized.cleanedText.includes('- Key Responsibilities:'),
    'Test Case L3: sanitizeJobDescription normalizes alternative bullet characters (•, *) cleanly to standard bullet points',
    `Contains normalized "- Job Title:": ${unicodeSanitized.cleanedText.includes('- Job Title:')}`
  );

  // L4: Gatekeeper pipeline approves standard structured bulleted JD and generates valid baseline score >= 40
  const pipelineBulletedRes = await evaluateJobDescriptionPipeline({
    rawJdText: standardBulletedJd,
    masterProfile: defaultMasterProfile,
  });

  assert(
    pipelineBulletedRes.success &&
      pipelineBulletedRes.status === 'PROCEED' &&
      pipelineBulletedRes.failureReason === null &&
      pipelineBulletedRes.baselineScore?.overallScore >= 40,
    'Test Case L4: Gatekeeper pipeline approves standard structured bulleted JD with non-null baseline score',
    `Status: ${pipelineBulletedRes.status} | Score: ${pipelineBulletedRes.baselineScore?.overallScore}/100 | Reason: "${pipelineBulletedRes.reason}"`
  );

  // L5: Concise structured bulleted JD (~35 words) with responsibilities is accepted without false positive
  const conciseBulletedJd = `- Job Title: Junior Python Developer
- Experience: 0-1 years
- Key Responsibilities:
  - Develop backend applications using Python and Django
  - Build REST APIs and integrate PostgreSQL databases
  - Write clean code and participate in code reviews`;

  const conciseBulletedPipelineRes = await evaluateJobDescriptionPipeline({
    rawJdText: conciseBulletedJd,
    masterProfile: defaultMasterProfile,
  });

  assert(
    conciseBulletedPipelineRes.success &&
      conciseBulletedPipelineRes.status === 'PROCEED' &&
      conciseBulletedPipelineRes.failureReason === null &&
      conciseBulletedPipelineRes.baselineScore?.overallScore >= 40,
    'Test Case L5: Concise structured bulleted JD (~35 words) with responsibilities is accepted by Gatekeeper without false-positive',
    `Status: ${conciseBulletedPipelineRes.status} | Words: ${conciseBulletedPipelineRes.wordCount} | Score: ${conciseBulletedPipelineRes.baselineScore?.overallScore}/100`
  );

  // L6: Downstream Filter Preservation - Senior experience in bulleted JD is strictly blocked
  const seniorBulletedJd = `- Job Title: Senior Software Engineer
- Experience: 5+ years
- Key Responsibilities:
  - Lead architectural design for cloud microservices
  - Mentor junior engineers`;

  const seniorBulletedRes = await evaluateJobDescriptionPipeline({
    rawJdText: seniorBulletedJd,
    masterProfile: defaultMasterProfile,
  });

  assert(
    !seniorBulletedRes.success &&
      seniorBulletedRes.status === 'ABORT' &&
      seniorBulletedRes.failureReason === 'Blocked: Requires senior experience',
    'Test Case L6: Downstream filter strictly blocks senior experience requirement in bulleted JD',
    `Status: ${seniorBulletedRes.status} | failureReason: "${seniorBulletedRes.failureReason}"`
  );

  // L7: Downstream Filter Preservation - Conflicting graduation batch in bulleted JD is strictly blocked
  const batchBulletedJd = `- Job Title: Junior Python Developer
- Experience: 0-1 years
- Batch: Strictly requires 2025 batch graduates only
- Key Responsibilities:
  - Develop web applications using Python`;

  const batchBulletedRes = await evaluateJobDescriptionPipeline({
    rawJdText: batchBulletedJd,
    masterProfile: defaultMasterProfile,
  });

  assert(
    !batchBulletedRes.success &&
      batchBulletedRes.status === 'ABORT' &&
      batchBulletedRes.failureReason === 'Blocked: Batch year mismatch',
    'Test Case L7: Downstream filter strictly blocks conflicting graduation batch requirement in bulleted JD',
    `Status: ${batchBulletedRes.status} | failureReason: "${batchBulletedRes.failureReason}"`
  );

  // L8: Downstream Filter Preservation - Non-IT Mechanical role in bulleted JD is strictly blocked
  const mechBulletedJd = `- Job Title: Mechanical Design Engineer
- Experience: 0-1 years
- Key Responsibilities:
  - Create 3D CAD models in SolidWorks and Creo
  - Draft engineering blueprints in AutoCAD
  - Run finite element simulations using ANSYS and Abaqus`;

  const mechBulletedRes = await evaluateJobDescriptionPipeline({
    rawJdText: mechBulletedJd,
    masterProfile: defaultMasterProfile,
  });

  assert(
    !mechBulletedRes.success &&
      mechBulletedRes.status === 'ABORT' &&
      mechBulletedRes.failureReason.includes('Blocked: Non-IT role detected'),
    'Test Case L8: Downstream filter strictly blocks non-IT Mechanical Engineering domain in bulleted JD',
    `Status: ${mechBulletedRes.status} | failureReason: "${mechBulletedRes.failureReason}"`
  );

  // L9: Downstream Filter Preservation - Non-IT BPO / Tele-calling in bulleted JD is strictly blocked
  const bpoBulletedJd = `- Job Title: Tele-calling Executive
- Experience: 0-1 years
- Key Responsibilities:
  - Make outbound cold calls to prospective customers
  - Achieve daily sales targets and customer call quotas`;

  const bpoBulletedRes = await evaluateJobDescriptionPipeline({
    rawJdText: bpoBulletedJd,
    masterProfile: defaultMasterProfile,
  });

  assert(
    !bpoBulletedRes.success &&
      bpoBulletedRes.status === 'ABORT' &&
      bpoBulletedRes.failureReason === 'Blocked: Non-IT / BPO tele-calling role detected',
    'Test Case L9: Downstream filter strictly blocks non-IT BPO / tele-calling operations in bulleted JD',
    `Status: ${bpoBulletedRes.status} | failureReason: "${bpoBulletedRes.failureReason}"`
  );

  // L10: Downstream Filter Preservation - Exclusive institution restriction in bulleted JD is strictly blocked
  const tierBulletedJd = `- Job Title: Junior Developer
- Experience: 0-1 years
- Key Responsibilities:
  - Hiring strictly from IIT or NIT only
  - Develop Python web applications`;

  const tierBulletedRes = await evaluateJobDescriptionPipeline({
    rawJdText: tierBulletedJd,
    masterProfile: defaultMasterProfile,
  });

  assert(
    !tierBulletedRes.success &&
      tierBulletedRes.status === 'ABORT' &&
      tierBulletedRes.failureReason === 'Blocked: Exclusive institution requirement detected',
    'Test Case L10: Downstream filter strictly blocks exclusive institution restriction in bulleted JD',
    `Status: ${tierBulletedRes.status} | failureReason: "${tierBulletedRes.failureReason}"`
  );

  // L11: Downstream Filter Preservation - Non-technical operations role in bulleted JD is strictly blocked
  const nonTechBulletedJd = `- Job Title: Operations Assistant
- Experience: 0-1 years
- Key Responsibilities:
  - Manage office paperwork and documentation filing
  - Coordinate inventory tracking and logistics schedules`;

  const nonTechBulletedRes = await evaluateJobDescriptionPipeline({
    rawJdText: nonTechBulletedJd,
    masterProfile: defaultMasterProfile,
  });

  assert(
    !nonTechBulletedRes.success &&
      nonTechBulletedRes.status === 'ABORT' &&
      nonTechBulletedRes.failureReason === 'Blocked: Invalid/insufficient technical content' &&
      nonTechBulletedRes.reason.includes('Role mismatch'),
    'Test Case L11: Downstream filter strictly blocks non-technical operations role in bulleted JD lacking software technologies',
    `Status: ${nonTechBulletedRes.status} | failureReason: "${nonTechBulletedRes.failureReason}" | reason: "${nonTechBulletedRes.reason}"`
  );

  // L12: Strict Noise / Gibberish Interception - Gibberish in bulleted format is strictly blocked
  const gibberishBulletedJd = `- Job Title: asdfghjkl
- Experience: zxcvbnm
- Key Responsibilities:
  - qwertyuiop asdfghjkl zxcvbnm
  - asdfghjkl qwertyuiop`;

  const gibberishBulletedRes = await evaluateJobDescriptionPipeline({
    rawJdText: gibberishBulletedJd,
    masterProfile: defaultMasterProfile,
  });

  assert(
    !gibberishBulletedRes.success &&
      gibberishBulletedRes.status === 'ABORT' &&
      gibberishBulletedRes.failureReason === 'Blocked: Invalid/insufficient technical content' &&
      gibberishBulletedRes.reason === 'Invalid or meaningless Job Description detected. Please enter a valid professional job description.',
    'Test Case L12: Strict gibberish interception blocks random high-entropy text even when formatted with bullet points',
    `Status: ${gibberishBulletedRes.status} | failureReason: "${gibberishBulletedRes.failureReason}"`
  );

  // L13: Concise unbulleted JD (~30 words) matching candidate profile passes cleanly without 50-word penalty
  const conciseUnbulletedJd = 'We are hiring a Full Stack Developer (0-1 years experience) for our Bangalore office. You will work on React frontend and Python/Django backend systems, manage PostgreSQL databases, and collaborate with our engineering team.';
  const conciseUnbulletedRes = await evaluateJobDescriptionPipeline({
    rawJdText: conciseUnbulletedJd,
    masterProfile: defaultMasterProfile,
  });

  assert(
    conciseUnbulletedRes.success &&
      conciseUnbulletedRes.status === 'PROCEED' &&
      conciseUnbulletedRes.failureReason === null &&
      conciseUnbulletedRes.baselineScore?.overallScore >= 40,
    'Test Case L13: Concise unbulleted JD (~33 words) matching candidate profile passes Gatekeeper cleanly without 50-word penalty',
    `Status: ${conciseUnbulletedRes.status} | Score: ${conciseUnbulletedRes.baselineScore?.overallScore}/100 | Words: ${conciseUnbulletedRes.wordCount}`
  );

  // L14: Candidate profile matching JD with 1-year experience requirement passes cleanly
  const oneYearExpJd = `Role: Python Developer
Experience: 1 year
Location: Bangalore
Responsibilities:
- Write Python code and REST APIs using Flask/Django
- Work with SQL and Git repositories`;

  const oneYearExpRes = await evaluateJobDescriptionPipeline({
    rawJdText: oneYearExpJd,
    masterProfile: defaultMasterProfile,
  });

  assert(
    oneYearExpRes.success &&
      oneYearExpRes.status === 'PROCEED' &&
      oneYearExpRes.failureReason === null &&
      oneYearExpRes.baselineScore?.overallScore >= 40,
    'Test Case L14: Candidate profile matching JD with 1-year experience passes Gatekeeper cleanly',
    `Status: ${oneYearExpRes.status} | Score: ${oneYearExpRes.baselineScore?.overallScore}/100`
  );

  // L15: Empty inputs and inputs under 20 characters are strictly blocked by sanitizer
  let emptyBlocked = false;
  try {
    sanitizeJobDescription('   ');
  } catch (err) {
    emptyBlocked = err.message.includes('cannot be empty');
  }

  let underTwentyBlocked = false;
  try {
    sanitizeJobDescription('Too short JD');
  } catch (err) {
    underTwentyBlocked = err.message.includes('at least 20 characters');
  }

  assert(
    emptyBlocked && underTwentyBlocked,
    'Test Case L15: Sanitizer strictly blocks truly empty inputs and text under 20 characters',
    `emptyBlocked: ${emptyBlocked} | underTwentyBlocked: ${underTwentyBlocked}`
  );

  // L16: Baseline Standard SDE-1 Fresher Bulleted Job Description Acceptance
  const standardSdeFresherJd = `Role Overview
- Job Title: Software Engineer / Software Development Engineer (SDE-1) / Trainee
- Experience: 0 to 1 year (Freshers are eligible)
- Location: Bengaluru, Karnataka
- Key Responsibilities: Software Development, Bug Fixing & Testing, Collaboration, Learning & Adaptation.
- Eligibility & Education: B.E. / B.Tech, MCA, M.Sc.
- Required Technical Skills: Java, C++, Python, JavaScript, Spring Boot, React.js, SQL, Git.`;

  const sdeFresherSanitized = sanitizeJobDescription(standardSdeFresherJd);
  assert(
    isStandardStructuredBulletedJd(standardSdeFresherJd) &&
      typeof sdeFresherSanitized.cleanedText === 'string' &&
      sdeFresherSanitized.wordCount > 0,
    'Test Case L16: Sanitizer explicitly recognizes standard SDE-1 fresher bulleted JD as 100% valid text',
    `Word Count: ${sdeFresherSanitized.wordCount} | isStandardStructuredBulletedJd: true`
  );

  // L17: Gatekeeper approves standard SDE-1 fresher JD with PROCEED status and High Match baseline score (>= 80)
  const sdeFresherPipelineRes = await evaluateJobDescriptionPipeline({
    rawJdText: standardSdeFresherJd,
    masterProfile: defaultMasterProfile,
  });

  assert(
    sdeFresherPipelineRes.success &&
      sdeFresherPipelineRes.status === 'PROCEED' &&
      sdeFresherPipelineRes.failureReason === null &&
      sdeFresherPipelineRes.baselineScore?.overallScore >= 80,
    'Test Case L17: Gatekeeper approves standard SDE-1 fresher JD with PROCEED status and High Match baseline score (>= 80)',
    `Status: ${sdeFresherPipelineRes.status} | Overall Score: ${sdeFresherPipelineRes.baselineScore?.overallScore}/100 | Domain: ${sdeFresherPipelineRes.baselineScore?.breakdown?.domainRole?.score}/40`
  );

  // L18: Comprehensive SDE-1 Fresher JD with CS fundamentals (DBMS, DSA, OOPS, 10th/12th marks) passes cleanly
  const fullSdeFresherJd = `Role Overview

 Job Title: Software Engineer / Software Development Engineer (SDE-1) / Trainee
 Experience: 0 to 1 year (Freshers are eligible)
 Location: Bengaluru, Karnataka
 Salary / Package: Typically ranges from ₹3.0 LPA to ₹8.0 LPA depending on the company, tech stack, and off-campus/on-campus drive.

Key Responsibilities

 Software Development: Write clean, maintainable, and efficient code for front-end, back-end, or full-stack features.
 Bug Fixing & Testing: Troubleshoot, debug, and upgrade existing applications; write unit tests to ensure code quality.
 Collaboration: Work closely with senior engineers, product managers, and QA teams in an Agile/Scrum environment.
 Learning & Adaptation: Quickly learn new tech stacks, system designs, and internal company architecture or tools.

Eligibility & Education

 Degree: B.E. / B.Tech, MCA, M.Sc. (Computer Science, IT, Electronics, or related fields).
 Academic Record: Generally requires a consistent academic track record (often 60% or 6.5+ CGPA throughout 10th, 12th, and graduation).

Required Technical Skills (Tech Stack)

Depending on the specific team, a fresher JD usually expects proficiency in at least one or two areas:
 Programming Languages: Java, C++, Python, C, JavaScript, TypeScript, Go, or Rust.
 Core CS Fundamentals: Data Structures and Algorithms (DSA), Object-Oriented Programming (OOPS), Database Management Systems (DBMS), and Computer Networks.
 Web Technologies & Frameworks:
	 Backend: Spring Boot, Node.js, Express.js, FastAPI, or REST APIs.
	 Frontend: React.js, Next.js, HTML5, CSS3, or JavaScript.
 Databases: SQL, MySQL, PostgreSQL, or MongoDB.
 Tools & Version Control: Git, GitHub, and basic familiarity with cloud platforms like AWS or Azure`;

  const fullSdePipelineRes = await evaluateJobDescriptionPipeline({
    rawJdText: fullSdeFresherJd,
    masterProfile: defaultMasterProfile,
  });

  assert(
    fullSdePipelineRes.success &&
      fullSdePipelineRes.status === 'PROCEED' &&
      fullSdePipelineRes.failureReason === null &&
      fullSdePipelineRes.baselineScore?.overallScore >= 70,
    'Test Case L18: Comprehensive SDE-1 Fresher JD with CS fundamentals (DBMS, DSA, 10th/12th) passes Gatekeeper with PROCEED',
    `Status: ${fullSdePipelineRes.status} | Overall Score: ${fullSdePipelineRes.baselineScore?.overallScore}/100 | Domain: ${fullSdePipelineRes.baselineScore?.breakdown?.domainRole?.score}/40`
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

runIntegrationPipelineTests();
