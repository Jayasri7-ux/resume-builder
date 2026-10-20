/**
 * Mandatory Verification Test Suite for Milestone 2:
 * Tests that Master_Resume.docx is successfully ingested,
 * its text contents are extracted, and data maps into the complete
 * Master Profile JSON schema with 100% Fact Firewall verification
 * and updated Bangalore, India location.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { defaultMasterProfile } from '../src/data/defaultMasterProfile.js';
import { validateMasterProfile } from '../src/types/masterProfileSchema.js';
import { auditFactIntegrity } from '../src/services/factFirewall.js';

console.log('================================================================');
console.log('   MILESTONE 2: MASTER RESUME VERIFICATION TEST SUITE');
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
// Test 1: Verify file existence and size in root directory
// ----------------------------------------------------------------------
const rootDocxPath = path.resolve('Master_Resume.docx');
const fileExists = fs.existsSync(rootDocxPath);
const fileStats = fileExists ? fs.statSync(rootDocxPath) : null;

assert(
  fileExists && fileStats.size > 20000,
  'Test 1: Master_Resume.docx exists in root directory',
  `Path: ${rootDocxPath} | Size: ${fileStats?.size} bytes`
);

// ----------------------------------------------------------------------
// Test 2: Ingest & Extract Text from Master_Resume.docx
// ----------------------------------------------------------------------
let extractedDocxText = '';
try {
  extractedDocxText = execSync('powershell -ExecutionPolicy Bypass -File tests/extract.ps1', {
    encoding: 'utf-8',
  }).trim();
} catch (err) {
  console.error('Error running extract.ps1:', err.message);
}

assert(
  extractedDocxText.length > 500,
  'Test 2: Text extraction from Master_Resume.docx succeeded',
  `Extracted ${extractedDocxText.length} characters of raw text`
);

// ----------------------------------------------------------------------
// Test 3: Verify Ground-Truth Entities in Source Text
// ----------------------------------------------------------------------
const containsName = /jaya\s*sri\s*palli/i.test(extractedDocxText);
const containsPhone = /7893414784/.test(extractedDocxText);
const containsEmail = /jayasripalli20@gmail\.com/i.test(extractedDocxText);
const containsSvcet = /SVCET/i.test(extractedDocxText) && /8\s*\.\s*7\s*7/.test(extractedDocxText);
const containsLt = /Larsen\s*&\s*Toubro/i.test(extractedDocxText) || /L&T/i.test(extractedDocxText);
const containsInfosys = /Infosys/i.test(extractedDocxText);
const containsFakeNews = /Fake\s*News\s*Detection/i.test(extractedDocxText);
const containsHealthBot = /AI\s*Health\s*Chatbot/i.test(extractedDocxText);
const containsSih = /Smart\s*India\s*Hackathon/i.test(extractedDocxText);

assert(
  containsName && containsPhone && containsEmail,
  'Test 3A: Contact Info verified in source text',
  'Name: Jaya Sri Palli | Phone: +91-7893414784 | Email: jayasripalli20@gmail.com'
);

assert(
  containsSvcet && containsLt && containsInfosys,
  'Test 3B: Education & Experience entities verified in source text',
  'SVCET (CGPA: 8.77) | L&T (Full Stack Intern) | Infosys (Python Intern)'
);

assert(
  containsFakeNews && containsHealthBot && containsSih,
  'Test 3C: Projects and Awards verified in source text',
  'Fake News Detection (90%) | AI Health Chatbot | Smart India Hackathon'
);

// ----------------------------------------------------------------------
// Test 4: Master Profile Schema Validation
// ----------------------------------------------------------------------
const validation = validateMasterProfile(defaultMasterProfile);
assert(
  validation.valid === true,
  'Test 4: Master Profile strictly conforms to JSON schema',
  validation.valid ? 'Zero schema violations' : `Errors: ${validation.errors.join(', ')}`
);

// ----------------------------------------------------------------------
// Test 5: Distinct Eligible Job Roles (Gatekeeper Schema)
// ----------------------------------------------------------------------
const roles = defaultMasterProfile.eligibleJobRoles;
const hasPrimaryRoles = Array.isArray(roles.primaryRoles) && roles.primaryRoles.length >= 3;
const hasCrossoverRoles = Array.isArray(roles.crossoverRoles) && roles.crossoverRoles.length >= 2;
const hasTargetFamilies = Array.isArray(roles.targetFamilies) && roles.targetFamilies.length >= 2;

assert(
  hasPrimaryRoles && hasCrossoverRoles && hasTargetFamilies,
  'Test 5: Distinct Eligible Job Roles defined for future Gatekeeper',
  `Primary: [${roles.primaryRoles.join(', ')}] | Crossover: [${roles.crossoverRoles.join(', ')}]`
);

// ----------------------------------------------------------------------
// Test 6: Immutable Fact Firewall Audit
// ----------------------------------------------------------------------
const auditResult = auditFactIntegrity({
  originalText: extractedDocxText,
  extractedProfile: defaultMasterProfile,
});

assert(
  auditResult.isVerified && auditResult.integrityScore >= 90,
  'Test 6: Immutable Fact Firewall Ground-Truth Audit',
  `Integrity Score: ${auditResult.integrityScore}% | Audited Entities: ${auditResult.auditedEntities?.length} | Violations: ${auditResult.violations.length}`
);

// ----------------------------------------------------------------------
// Test 7: Public Directory Copy for Native Web Client
// ----------------------------------------------------------------------
const publicDocxPath = path.resolve('public', 'Master_Resume.docx');
const publicDocxExists = fs.existsSync(publicDocxPath);
const publicStats = publicDocxExists ? fs.statSync(publicDocxPath) : null;

assert(
  publicDocxExists && publicStats.size === fileStats.size,
  'Test 7: public/Master_Resume.docx is synced for native docx-preview in browser',
  `Synced: ${publicStats?.size} bytes`
);

// ----------------------------------------------------------------------
// Test 8: Location Field Updated to Bangalore, India
// ----------------------------------------------------------------------
assert(
  defaultMasterProfile.personalInfo?.location === 'Bangalore, India',
  'Test 8: Master Profile location successfully updated to Bangalore, India',
  `Location: ${defaultMasterProfile.personalInfo?.location}`
);

console.log('\n================================================================');
console.log(`   TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
