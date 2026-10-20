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
  sanitizeJobDescription,
  evaluateGatekeeperRules,
  calculateBaselineScore,
  evaluateJobDescriptionPipeline,
} from '../src/services/gatekeeperService.js';

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
// TEST CASE A: Short / Invalid Text Check (Word Count <= 50 words)
// ======================================================================
console.log('--- TEST CASE A: Short / Invalid Word Count Check ---');

const shortText = 'We need a React developer. Apply now with your resume. Urgent opening for full stack work.';
let shortTextCaught = false;
let shortErrorMessage = '';

try {
  sanitizeJobDescription(shortText);
} catch (err) {
  shortTextCaught = true;
  shortErrorMessage = err.message;
}

assert(
  shortTextCaught && shortErrorMessage.includes('greater than 50 words'),
  'Test Case A1: Sanitizer rejects short text (< 50 words) with informative error',
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
  midGatekeeperResult.status === 'ABORT' && midGatekeeperResult.reason.includes('more than 1 year'),
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
  threeYearsResult.status === 'ABORT' && threeYearsResult.reason.includes('more than 1 year'),
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
  fiveYearsResult.status === 'ABORT' && fiveYearsResult.reason.includes('more than 1 year'),
  'Test Case B4: Gatekeeper blocks role requiring 5+ years experience',
  `Status: ${fiveYearsResult.status} | Reason: ${fiveYearsResult.reason}`
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
  civilGatekeeperResult.status === 'ABORT' && civilGatekeeperResult.reason.includes('Civil / Structural Engineering'),
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
  nursingGatekeeperResult.status === 'ABORT' && nursingGatekeeperResult.reason.includes('Healthcare & Nursing'),
  'Test Case C2: Gatekeeper blocks unrelated Healthcare / Nursing role',
  `Status: ${nursingGatekeeperResult.status} | Reason: ${nursingGatekeeperResult.reason}`
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
    'Test Case E1: Pipeline gracefully aborts on short text (< 50 words)',
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
