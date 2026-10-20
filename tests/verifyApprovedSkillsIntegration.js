/**
 * Verification Test Suite for Approved Missing Skills Integration & Compilation Pipeline
 */

import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { defaultMasterProfile } from '../src/data/defaultMasterProfile.js';
import {
  categorizeApprovedSkills,
  generateTailoredDocxBuffer,
  buildTailoredDocxDocument,
} from '../src/services/docxExportService.js';
import { Packer } from 'docx';

console.log('================================================================');
console.log('   APPROVED MISSING SKILLS INTEGRATION VERIFICATION SUITE');
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

async function runSuite() {
  const baseSkills = defaultMasterProfile.coreTechnicalSkills;

  // Test 1: Multi-category categorization
  const testApproved = [
    'TypeScript',
    'Next.js',
    'FastAPI',
    'PostgreSQL',
    'AWS',
    'Docker',
    'GraphQL',
    'Kubernetes',
    'CustomCloudTool',
  ];

  const categorized = categorizeApprovedSkills(testApproved, baseSkills);

  assert(
    categorized.languages.includes('TypeScript'),
    'Test 1: Categorizes programming languages (TypeScript) into Languages'
  );

  assert(
    categorized.frontend.includes('Next.js'),
    'Test 2: Categorizes modern UI frameworks (Next.js) into Frontend'
  );

  assert(
    categorized.backend.includes('FastAPI') && categorized.backend.includes('GraphQL'),
    'Test 3: Categorizes backend APIs & frameworks (FastAPI, GraphQL) into Backend'
  );

  assert(
    categorized.databases.includes('PostgreSQL'),
    'Test 4: Categorizes SQL/NoSQL storage (PostgreSQL) into Databases without regex collision'
  );

  assert(
    categorized.tools.includes('AWS') &&
      categorized.tools.includes('Docker') &&
      categorized.tools.includes('Kubernetes') &&
      categorized.tools.includes('CustomCloudTool'),
    'Test 5: Catch-all routes cloud, containerization, and arbitrary approved tools into Tools (Zero omissions)'
  );

  // Test 6: Zero omissions guarantee (sum of categorized items equals total non-duplicate approved skills)
  const totalCategorized =
    categorized.languages.length +
    categorized.frontend.length +
    categorized.backend.length +
    categorized.databases.length +
    categorized.tools.length;
  assert(
    totalCategorized === testApproved.length,
    'Test 6: Guarantees 100% of approved skills are retained across all categories with zero drop-offs',
    `Approved input: ${testApproved.length} | Categorized total: ${totalCategorized}`
  );

  // Test 7: Duplicate prevention
  const dupCheck = categorizeApprovedSkills(['Python', 'React', 'Node.js', 'SQL', 'Git', 'AWS'], baseSkills);
  assert(
    !dupCheck.languages.includes('Python') &&
      !dupCheck.frontend.includes('React') &&
      !dupCheck.backend.includes('Node.js') &&
      !dupCheck.databases.includes('SQL') &&
      !dupCheck.tools.includes('Git') &&
      dupCheck.tools.includes('AWS'),
    'Test 7: Prevents duplicate skill injection if skill already exists in baseline profile'
  );

  // Test 8: OpenXML document patching in generateTailoredDocxBuffer
  const masterDocxPath = path.resolve('public/Master_Resume.docx');
  const masterBuffer = fs.readFileSync(masterDocxPath);

  const tailoredBuffer = await generateTailoredDocxBuffer({
    masterBuffer,
    profile: defaultMasterProfile,
    tailoredResult: {
      approvedMissingTech: ['TypeScript', 'Next.js', 'FastAPI', 'PostgreSQL', 'Docker', 'AWS'],
      tailoredSummary: 'Engineered high-scale web apps.',
      highlightedExperiences: [],
      highlightedProjects: [],
    },
  });

  const zip = await JSZip.loadAsync(tailoredBuffer);
  const docXml = await zip.file('word/document.xml').async('text');

  const hasAllInDocx =
    docXml.includes('TypeScript') &&
    docXml.includes('Next.js') &&
    docXml.includes('FastAPI') &&
    docXml.includes('PostgreSQL') &&
    docXml.includes('Docker') &&
    docXml.includes('AWS');

  assert(
    hasAllInDocx,
    'Test 8: generateTailoredDocxBuffer injects 100% of approved missing skills into Word OpenXML document.xml',
    'Verified TypeScript, Next.js, FastAPI, PostgreSQL, Docker, and AWS appear in Word XML'
  );

  // Test 9: buildTailoredDocxDocument serialization includes approved skills
  const docxInstance = buildTailoredDocxDocument({
    profile: defaultMasterProfile,
    tailoredResult: {
      approvedMissingTech: ['TypeScript', 'Next.js', 'FastAPI', 'PostgreSQL', 'AWS'],
    },
  });
  const serializedDocx = await Packer.toBuffer(docxInstance);
  const serializedZip = await JSZip.loadAsync(serializedDocx);
  const serializedXml = await serializedZip.file('word/document.xml').async('text');

  assert(
    serializedXml.includes('TypeScript') &&
      serializedXml.includes('Next.js') &&
      serializedXml.includes('FastAPI') &&
      serializedXml.includes('PostgreSQL') &&
      serializedXml.includes('AWS'),
    'Test 9: buildTailoredDocxDocument includes all categorized approved skills in final document'
  );

  // Test 10: State synchronization in TailoredResumeWorkspace
  const workspaceContent = fs.readFileSync(path.resolve('src/components/TailoredResumeWorkspace.jsx'), 'utf-8');
  const hasSyncWithApprovals =
    workspaceContent.includes('syncTailoredWithApprovals') &&
    workspaceContent.includes('approvedMissingTech: approvedNames') &&
    workspaceContent.includes('onTailoredResultChange?.(updated)');

  assert(
    hasSyncWithApprovals,
    'Test 10: TailoredResumeWorkspace binds checklist approvals directly to tailoredResult state and notifies parent'
  );

  // Test 11: handleGenerateFinalTailoredResume compiles live missingTechList state
  const compilesLiveChecklist =
    workspaceContent.includes('const approvedMissingTech = missingTechList.filter((t) => t.approved).map((t) => t.name);') &&
    workspaceContent.includes('approvedMissingTech,\n      rejectedMissingTech,');

  assert(
    compilesLiveChecklist,
    'Test 11: handleGenerateFinalTailoredResume extracts latest approved skills directly from live missingTechList'
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

runSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
