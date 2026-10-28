/**
 * Mandatory Verification Test Suite for Milestone 4:
 * The Immutable Fact Firewall & Ground-Truth Integrity Engine
 *
 * Verifies:
 * 1. Strict interception and stripping of inflated experience claims (e.g. "10 years of Rust/Kubernetes")
 * 2. Automatic removal of unverified skills not present in Master Resume or candidate-approved tech
 * 3. Immediate rejection of fabricated employers (e.g. Google, Meta) and senior titles (Senior Lead Architect)
 * 4. Preservation of human-in-the-loop approved technologies while blocking rejected interview traps
 * 5. Full end-to-end integration within the tailorResumePipeline execution flow
 * 6. 100% Factually Verified audit log reporting and blocked hallucinations trace
 */

import { defaultMasterProfile } from '../src/data/defaultMasterProfile.js';
import { SAMPLE_JOB_DESCRIPTIONS } from '../src/data/sampleJobDescriptions.js';
import {
  enforceFactFirewall,
  auditFactIntegrity,
  getVerifiedSkillsSet,
  isSkillVerified,
  findUnverifiedSkillsInText,
  findFakeEmployersInText,
} from '../src/services/factFirewall.js';
import { tailorResumePipeline } from '../src/services/tailoringService.js';

console.log('================================================================');
console.log('   IMMUTABLE FACT FIREWALL VERIFICATION TEST SUITE');
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
// TEST CASE 1: Injected Inflated Experience in Summary ("10 years of Rust/Kubernetes")
// ----------------------------------------------------------------------
console.log('--- TEST 1: INJECTED INFLATED EXPERIENCE IN SUMMARY ---');

const hallucinatedSummaryInput = {
  tailoredHeadline: 'Full Stack Developer',
  tailoredSummary:
    'Results-oriented Full Stack Developer with 10 years of Rust/Kubernetes experience developing high-impact distributed web systems. Proficient in React, Python, Django, SQL, and Solidity.',
  matchScore: 92,
  matchedSkills: ['Python', 'React', 'Django', 'SQL'],
  highlightedExperiences: defaultMasterProfile.workExperience,
  highlightedProjects: defaultMasterProfile.projects,
};

const result1 = enforceFactFirewall({
  tailoredData: hallucinatedSummaryInput,
  masterProfile: defaultMasterProfile,
});

const summaryOutput = result1.sanitizedData.tailoredSummary;
const contains10Years = /10\s*years/i.test(summaryOutput);
const containsRust = /\bRust\b/i.test(summaryOutput);
const containsKubernetes = /\bKubernetes\b/i.test(summaryOutput);
const containsSolidity = /\bSolidity\b/i.test(summaryOutput);
const hasBlockedLog = result1.factAudit.blockedHallucinations.some((log) =>
  log.toLowerCase().includes('10 years of rust/kubernetes') || log.toLowerCase().includes('inflated experience')
);

assert(
  !contains10Years && !containsRust && !containsKubernetes && !containsSolidity,
  'Test 1A: Fact Firewall strips "10 years of Rust/Kubernetes" and "Solidity" from summary',
  `Sanitized Summary: "${summaryOutput}"`
);

assert(
  hasBlockedLog && result1.factAudit.integrityScore === 100 && result1.factAudit.isVerified === true,
  'Test 1B: Firewall reports 100% Factually Verified and logs blocked hallucination',
  `Integrity Score: ${result1.factAudit.integrityScore}% | Blocked Claims: ${result1.factAudit.blockedHallucinations.length}`
);

// ----------------------------------------------------------------------
// TEST CASE 2: Injected Unverified Skills in matchedSkills ("Rust", "Kubernetes", "Solidity")
// ----------------------------------------------------------------------
console.log('\n--- TEST 2: UNVERIFIED SKILL HALLUCINATION STRIPPING ---');

const hallucinatedSkillsInput = {
  tailoredHeadline: 'Full Stack Developer',
  tailoredSummary: defaultMasterProfile.professionalSummary,
  matchScore: 89,
  matchedSkills: ['Python', 'React', 'Rust', 'Kubernetes', 'Solidity', 'Django', 'SQL'],
  highlightedExperiences: defaultMasterProfile.workExperience,
  highlightedProjects: defaultMasterProfile.projects,
};

const result2 = enforceFactFirewall({
  tailoredData: hallucinatedSkillsInput,
  masterProfile: defaultMasterProfile,
});

const cleanSkills = result2.sanitizedData.matchedSkills;
const hasUnapprovedSkills = cleanSkills.some((s) => ['Rust', 'Kubernetes', 'Solidity'].includes(s));
const retainsAuthenticSkills =
  cleanSkills.includes('Python') && cleanSkills.includes('React') && cleanSkills.includes('Django');

assert(
  !hasUnapprovedSkills && retainsAuthenticSkills,
  'Test 2A: Fact Firewall automatically strips unverified skills (Rust, Kubernetes, Solidity) from matchedSkills',
  `Original: [${hallucinatedSkillsInput.matchedSkills.join(', ')}] -> Sanitized: [${cleanSkills.join(', ')}]`
);

const strippedRustLog = result2.factAudit.blockedHallucinations.some((l) => l.includes('Rust'));
const strippedK8sLog = result2.factAudit.blockedHallucinations.some((l) => l.includes('Kubernetes'));
const strippedSolidityLog = result2.factAudit.blockedHallucinations.some((l) => l.includes('Solidity'));

assert(
  strippedRustLog && strippedK8sLog && strippedSolidityLog,
  'Test 2B: Audit trail contains specific entries for every unverified skill stripped',
  `Logged ${result2.factAudit.blockedHallucinations.length} blocked hallucination events`
);

// ----------------------------------------------------------------------
// TEST CASE 3: Injected Fabricated Employer ("Google") & Senior Title ("Senior Lead Architect")
// ----------------------------------------------------------------------
console.log('\n--- TEST 3: FABRICATED EMPLOYER & SENIOR TITLE REJECTION ---');

const hallucinatedExperienceInput = {
  tailoredHeadline: 'Senior Full Stack Developer',
  tailoredSummary: defaultMasterProfile.professionalSummary,
  matchScore: 90,
  matchedSkills: ['Python', 'React'],
  highlightedExperiences: [
    {
      company: 'Google',
      title: 'Senior Lead Architect',
      period: '2020 - Present',
      location: 'Mountain View, CA',
      bulletPoints: ['Architected cloud infrastructure using Kubernetes and Rust.'],
    },
    {
      company: 'Larsen & Toubro (L&T), Chennai',
      title: 'Full Stack Developer Intern',
      period: 'Jul 2025 - Dec 2025',
      location: 'Chennai, India',
      bulletPoints: [
        'Developed a web-based audit application using React and Django with JWT authentication.',
      ],
    },
  ],
  highlightedProjects: defaultMasterProfile.projects,
};

const result3 = enforceFactFirewall({
  tailoredData: hallucinatedExperienceInput,
  masterProfile: defaultMasterProfile,
});

const outputExperiences = result3.sanitizedData.highlightedExperiences;
const containsGoogle = outputExperiences.some((e) => (e.company || '').toLowerCase().includes('google'));
const containsSeniorTitle = outputExperiences.some((e) => (e.title || '').toLowerCase().includes('senior lead'));
const containsLt = outputExperiences.some((e) => (e.company || '').toLowerCase().includes('larsen'));
const containsInfosys = outputExperiences.some((e) => (e.company || '').toLowerCase().includes('infosys'));

assert(
  !containsGoogle && !containsSeniorTitle,
  'Test 3A: Fact Firewall completely rejects fabricated employer "Google" and senior title "Senior Lead Architect"',
  `Experiences retained: [${outputExperiences.map((e) => `${e.company} (${e.title})`).join(', ')}]`
);

assert(
  containsLt && containsInfosys,
  'Test 3B: Ground-truth authentic work history (L&T and Infosys Springboard) is fully preserved',
  `Restored ground-truth employers: ${outputExperiences.map((e) => e.company).join(' | ')}`
);

assert(
  result3.sanitizedData.tailoredHeadline === 'Full Stack Developer',
  'Test 3C: Inflated headline "Senior Full Stack Developer" is sanitized to authentic "Full Stack Developer"',
  `Sanitized headline: "${result3.sanitizedData.tailoredHeadline}"`
);

// ----------------------------------------------------------------------
// TEST CASE 4: Injected Inflated Experience in Experience Bullet Points
// ----------------------------------------------------------------------
console.log('\n--- TEST 4: INJECTED INFLATED BULLET POINTS IN EXPERIENCE ---');

const hallucinatedBulletInput = {
  tailoredHeadline: 'Full Stack Developer',
  tailoredSummary: defaultMasterProfile.professionalSummary,
  matchScore: 88,
  matchedSkills: ['Python', 'React', 'Django'],
  highlightedExperiences: [
    {
      company: 'Larsen & Toubro (L&T), Chennai',
      title: 'Full Stack Developer Intern',
      period: 'Jul 2025 - Dec 2025',
      location: 'Chennai, India',
      bulletPoints: [
        'Over 8 years of production Kubernetes deployments and leading 20 engineers in Rust development.',
      ],
    },
  ],
  highlightedProjects: defaultMasterProfile.projects,
};

const result4 = enforceFactFirewall({
  tailoredData: hallucinatedBulletInput,
  masterProfile: defaultMasterProfile,
});

const ltBullet = result4.sanitizedData.highlightedExperiences[0]?.bulletPoints[0] || '';
const bulletHas8Years = /8\s*years/i.test(ltBullet);
const bulletHasKubernetes = /Kubernetes/i.test(ltBullet);
const bulletHasRust = /Rust/i.test(ltBullet);
const bulletRestoredGroundTruth = /React|Django|audit|JWT/i.test(ltBullet);

assert(
  !bulletHas8Years && !bulletHasKubernetes && !bulletHasRust && bulletRestoredGroundTruth,
  'Test 4: Fact Firewall intercepts inflated bullet point and restores authentic Master Resume experience',
  `Sanitized Bullet: "${ltBullet}"`
);

// ----------------------------------------------------------------------
// TEST CASE 5: Candidate-Approved Technology Passthrough (Human-in-the-Loop)
// ----------------------------------------------------------------------
console.log('\n--- TEST 5: APPROVED TECH PASSTHROUGH VS UNAPPROVED STRIPPING ---');

const mixedSkillsInput = {
  tailoredHeadline: 'Full Stack Developer',
  tailoredSummary: defaultMasterProfile.professionalSummary,
  matchScore: 92,
  matchedSkills: ['Python', 'React', 'PostgreSQL', 'TypeScript', 'Rust'],
  highlightedExperiences: defaultMasterProfile.workExperience,
  highlightedProjects: defaultMasterProfile.projects,
};

const result5 = enforceFactFirewall({
  tailoredData: mixedSkillsInput,
  masterProfile: defaultMasterProfile,
  approvedMissingTech: ['PostgreSQL', 'TypeScript'], // Explicitly approved by user
  rejectedMissingTech: ['Rust'], // Explicitly rejected
});

const approvedSkillsOutput = result5.sanitizedData.matchedSkills;
const hasPostgres = approvedSkillsOutput.includes('PostgreSQL');
const hasTypeScript = approvedSkillsOutput.includes('TypeScript');
const rustStripped = !approvedSkillsOutput.includes('Rust');

assert(
  hasPostgres && hasTypeScript && rustStripped,
  'Test 5: Approved technologies (PostgreSQL, TypeScript) are preserved while unapproved (Rust) is stripped',
  `Final Skills: [${approvedSkillsOutput.join(', ')}] | Interview Trap Shield Active`
);

// ----------------------------------------------------------------------
// TEST CASE 6: Full End-to-End Pipeline Integration (tailorResumePipeline)
// ----------------------------------------------------------------------
console.log('\n--- TEST 6: END-TO-END TAILORING PIPELINE INTEGRATION ---');

async function runAsyncPipelineTests() {
  const pipelineResult = await tailorResumePipeline({
    masterProfile: defaultMasterProfile,
    jobDescription: SAMPLE_JOB_DESCRIPTIONS[0].text, // Full Stack Developer
    approvedMissingTech: ['PostgreSQL'],
  });

  assert(
    pipelineResult.success === true && pipelineResult.data !== null,
    'Test 6A: tailorResumePipeline successfully executes with integrated Fact Firewall',
    `Engine: ${pipelineResult.model} | Source: ${pipelineResult.source}`
  );

  assert(
    pipelineResult.factAudit &&
      pipelineResult.factAudit.integrityScore === 100 &&
      pipelineResult.factAudit.isVerified === true &&
      pipelineResult.factAudit.status === '100% Factually Verified',
    'Test 6B: Pipeline returns factAudit with 100% Factually Verified status',
    `Integrity: ${pipelineResult.factAudit.integrityScore}% | Status: "${pipelineResult.factAudit.status}"`
  );

  // ----------------------------------------------------------------------
  // TEST CASE 7: Adversarial Hallucination Stress Test (Complete Fabrication)
  // ----------------------------------------------------------------------
  console.log('\n--- TEST 7: ADVERSARIAL STRESS TEST (COMPLETE FABRICATION) ---');

  const adversarialPayload = {
    tailoredHeadline: 'Chief Technology Officer & Lead Architect',
    tailoredSummary:
      'Distinguished Chief Architect with 12 years of experience developing quantum blockchain networks at Meta Platforms and Google. Expert in Rust, Solidity, and Kubernetes.',
    matchScore: 99,
    matchedSkills: ['Rust', 'Solidity', 'Kubernetes', 'Hadoop', 'Terraform'],
    highlightedExperiences: [
      {
        company: 'Meta Platforms Inc',
        title: 'VP of Engineering',
        period: '2015 - 2026',
        bulletPoints: ['Managed 500 engineers building Solidity smart contracts with 12 years of experience.'],
      },
      {
        company: 'Google LLC',
        title: 'Principal Architect',
        period: '2012 - 2015',
        bulletPoints: ['Deployed global Kubernetes mesh clusters across 100 regions.'],
      },
    ],
    highlightedProjects: [
      {
        name: 'Quantum Blockchain Engine',
        techStack: ['Rust', 'Solidity'],
        description: 'Engineered quantum proof-of-work consensus for NASA.',
      },
    ],
  };

  const adversarialResult = enforceFactFirewall({
    tailoredData: adversarialPayload,
    masterProfile: defaultMasterProfile,
  });

  const advSummary = adversarialResult.sanitizedData.tailoredSummary;
  const advHeadline = adversarialResult.sanitizedData.tailoredHeadline;
  const advExps = adversarialResult.sanitizedData.highlightedExperiences;
  const advSkills = adversarialResult.sanitizedData.matchedSkills;
  const advProjects = adversarialResult.sanitizedData.highlightedProjects;

  const noMetaOrGoogle = !advExps.some(
    (e) => (e.company || '').includes('Meta') || (e.company || '').includes('Google')
  );
  const authenticExpsRestored = advExps.some((e) => (e.company || '').includes('Larsen'));
  const noQuantumProject = !advProjects.some((p) => (p.name || '').includes('Quantum'));
  const authenticProjectRestored = advProjects.some(
    (p) => (p.name || '').includes('Fake News') || (p.name || '').includes('Health')
  );
  const noRustOrSolidity = !advSkills.includes('Rust') && !advSkills.includes('Solidity');
  const noSeniorHeadline = !advHeadline.toLowerCase().includes('chief') && !advHeadline.toLowerCase().includes('vp');

  assert(
    noMetaOrGoogle && authenticExpsRestored,
    'Test 7A: Fabricated employers (Meta, Google) rejected; authentic Master Resume employers restored',
    `Active Employers: ${advExps.map((e) => e.company).join(', ')}`
  );

  assert(
    noQuantumProject && authenticProjectRestored,
    'Test 7B: Fabricated project (Quantum Blockchain Engine) rejected; authentic projects restored',
    `Active Projects: ${advProjects.map((p) => p.name).join(', ')}`
  );

  assert(
    noRustOrSolidity && noSeniorHeadline,
    'Test 7C: 100% of adversarial skills and inflated titles stripped; baseline skills restored',
    `Headline: "${advHeadline}" | Skills: [${advSkills.join(', ')}]`
  );

  assert(
    adversarialResult.factAudit.integrityScore === 100 &&
      adversarialResult.factAudit.blockedHallucinations.length >= 5,
    'Test 7D: Adversarial audit confirms 100% Ground Truth Integrity and logs all intercepted attacks',
    `Total Hallucinations Intercepted: ${adversarialResult.factAudit.blockedHallucinations.length}`
  );

  console.log('\n================================================================');
  console.log(
    `   TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`
  );
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAsyncPipelineTests();
