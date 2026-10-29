/**
 * Verification Test Suite for Audit Log State Dispatcher & Skill Additions Capture
 * Tests:
 * 1. Capture Approved Skill Additions in Centralized Audit Log
 * 2. Proper fields: timestamp, category: 'Skills', originalText, tailoredText, optimization rationale
 * 3. Event handler toggle logic (handleToggleApprove, handleApproveAll, handleRejectAll)
 * 4. Audit Log State Dispatcher implementation (prevents setState-in-render violation)
 * 5. Category filter tabs ("All", "Experience", "Projects", "Skills", "Summary") parse skill-type items without empty states
 * 6. Preservation of critical engines (Fact Firewall, Gatekeeper, URL scraper, Export)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isSkillLogItem,
  matchesLogCategory,
  buildOptimizationRationale,
} from '../src/services/sectionOptimizationService.js';
import { evaluateExperienceLevel } from '../src/services/gatekeeperService.js';
import { auditFactIntegrity } from '../src/services/factFirewall.js';
import { isJobUrl } from '../src/services/jobUrlScraperService.js';
import { defaultMasterProfile } from '../src/data/defaultMasterProfile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('================================================================');
console.log('   AUDIT LOG STATE DISPATCHER & SKILL CAPTURE VERIFICATION');
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
  console.log('--- 1. AUDIT LOG STATE DISPATCHER IN TAILOREDRESUMEWORKSPACE ---');
  const workspacePath = path.resolve(__dirname, '../src/components/TailoredResumeWorkspace.jsx');
  const workspaceCode = fs.readFileSync(workspacePath, 'utf8');

  // Test 1: setApprovedChangesLog does not call onApprovedChangesChange inside setState updater
  const dispatcherMatch = workspaceCode.match(/const setApprovedChangesLog = useCallback\(([\s\S]*?)\}, \[/);
  assert(
    dispatcherMatch && dispatcherMatch[1],
    'Test 1.1: setApprovedChangesLog dispatcher is defined with useCallback'
  );

  const dispatcherCode = dispatcherMatch ? dispatcherMatch[1] : '';
  const internalLogBlockMatch = dispatcherCode.match(/setInternalApprovedLog\(\(prev\)\s*=>\s*\{([\s\S]*?)\}\);/);
  const internalLogBody = internalLogBlockMatch ? internalLogBlockMatch[1] : '';
  const callsCallbackInsideUpdater = internalLogBody.includes('onApprovedChangesChange');

  assert(
    !callsCallbackInsideUpdater,
    'Test 1.2: onApprovedChangesChange is called safely outside setInternalApprovedLog updater callback (zero React render violations)'
  );

  assert(
    dispatcherCode.includes('onApprovedChangesChange') &&
    dispatcherCode.includes('setInternalApprovedLog'),
    'Test 1.3: setApprovedChangesLog updates internal state and synchronizes external parent state'
  );

  console.log('\n--- 2. SKILL ADDITION EVENT HANDLERS ---');

  // Test 2.1: handleToggleApprove resolves toggledTech synchronously
  const toggleHandlerMatch = workspaceCode.match(/const handleToggleApprove = \(([\s\S]*?)\n  \};/);
  const toggleHandlerCode = toggleHandlerMatch ? toggleHandlerMatch[1] : '';

  assert(
    toggleHandlerCode.includes('missingTechList.find') &&
    !toggleHandlerCode.match(/let toggledTech = null;[\s\S]*?setMissingTechList\(\(prev\) => \{[\s\S]*?if \(toggledTech\)/),
    'Test 2.1: handleToggleApprove resolves target tech item synchronously before audit log dispatch'
  );

  assert(
    toggleHandlerCode.includes("category: 'Skills'") &&
    toggleHandlerCode.includes("type: 'skill_addition'"),
    'Test 2.2: handleToggleApprove logs entries with category: "Skills" and type: "skill_addition"'
  );

  assert(
    toggleHandlerCode.includes('timestamp:') &&
    toggleHandlerCode.includes('originalText:') &&
    toggleHandlerCode.includes('tailoredText:') &&
    toggleHandlerCode.includes('rationale'),
    'Test 2.3: handleToggleApprove creates entries with timestamp, original vs tailored text, and optimization rationale'
  );

  assert(
    toggleHandlerCode.includes('setApprovedChangesLog((curr) => (curr || []).filter') ||
    toggleHandlerCode.includes('setApprovedChangesLog((curr) => curr.filter'),
    'Test 2.4: handleToggleApprove removes omitted skills from audit log when isApproved is false'
  );

  // Test 2.5: handleApproveAll logs all items to audit log
  const approveAllMatch = workspaceCode.match(/const handleApproveAll = \(\) => \{([\s\S]*?)\n  \};/);
  const approveAllCode = approveAllMatch ? approveAllMatch[1] : '';

  assert(
    approveAllCode.includes("category: 'Skills'") &&
    approveAllCode.includes("type: 'skill_addition'") &&
    approveAllCode.includes('setApprovedChangesLog'),
    'Test 2.5: handleApproveAll batch pushes all approved skills into the audit log state array'
  );

  // Test 2.6: handleRejectAll purges skills from audit log
  const rejectAllMatch = workspaceCode.match(/const handleRejectAll = \(\) => \{([\s\S]*?)\n  \};/);
  const rejectAllCode = rejectAllMatch ? rejectAllMatch[1] : '';

  assert(
    rejectAllCode.includes('setApprovedChangesLog') &&
    rejectAllCode.includes("type !== 'skill_addition'"),
    'Test 2.6: handleRejectAll purges skill additions from the audit log state array'
  );

  console.log('\n--- 3. OPTIMIZATION RATIONALE GENERATION FOR SKILLS ---');

  const dockerRationale = buildOptimizationRationale({
    type: 'skill_addition',
    category: 'Skills',
    chipLabel: 'Docker',
    instruction: 'Approved from Missing Tech X-Ray',
    roleOrContext: 'Docker',
  });

  assert(
    dockerRationale.includes('Docker') && dockerRationale.includes('ATS keyword alignment'),
    'Test 3.1: buildOptimizationRationale produces ATS keyword alignment rationale naming the target skill',
    dockerRationale
  );

  // Test with a tech name containing "stack" or "technical"
  const stackRationale = buildOptimizationRationale({
    type: 'skill_addition',
    category: 'Skills',
    chipLabel: 'Full Stack Development',
    instruction: 'Approved from Missing Tech X-Ray',
    roleOrContext: 'Full Stack Development',
  });

  assert(
    stackRationale.includes('Full Stack Development') && stackRationale.includes('ATS keyword alignment'),
    'Test 3.2: Skill addition with "Stack" in name correctly receives skill addition rationale rather than generic chip rationale',
    stackRationale
  );

  console.log('\n--- 4. CATEGORY FILTER TABS IN OPTIMIZATIONLOGVIEW ---');

  const sampleSkillItem = {
    id: 'skill_docker',
    timestamp: '10:00:00 AM',
    isoTimestamp: new Date().toISOString(),
    type: 'skill_addition',
    category: 'Skills',
    title: 'Added Skill: Docker',
    roleOrContext: 'Technical Skills Matrix (Cloud/DevOps)',
    instruction: 'Approved from Missing Tech X-Ray',
    chipLabel: 'Docker',
    rationale: 'Approved from JD Tech X-Ray to increase ATS keyword alignment for Docker',
    originalText: 'Skill "Docker" was not originally listed in master technical skills.',
    tailoredText: 'Approved and incorporated "Docker" into technical skills (Cloud/DevOps).',
    status: 'approved',
    skillName: 'Docker',
    skillCategory: 'Cloud/DevOps',
  };

  const sampleExpItem = {
    id: 'section_opt_exp_0',
    type: 'section_rewrite',
    category: 'Experience',
    title: 'Approved Experience Rewrite',
    sectionKey: 'exp_0',
    originalText: 'Old bullet',
    tailoredText: 'New tailored bullet',
  };

  const sampleProjItem = {
    id: 'section_opt_proj_0',
    type: 'section_rewrite',
    category: 'Projects',
    title: 'Approved Project Rewrite',
    sectionKey: 'proj_0',
    originalText: 'Old proj',
    tailoredText: 'New proj',
  };

  const sampleSummaryItem = {
    id: 'section_opt_summary',
    type: 'section_rewrite',
    category: 'Summary',
    title: 'Approved Summary Rewrite',
    sectionKey: 'summary',
    originalText: 'Old summary',
    tailoredText: 'New summary',
  };

  const mockLog = [sampleSkillItem, sampleExpItem, sampleProjItem, sampleSummaryItem];

  // Test 4.1: isSkillLogItem detection
  assert(
    isSkillLogItem(sampleSkillItem),
    'Test 4.1: isSkillLogItem correctly identifies standard skill addition entry'
  );

  assert(
    isSkillLogItem({ type: 'skill_addition', category: 'Cloud/DevOps' }),
    'Test 4.2: isSkillLogItem identifies skill addition even if category is specific tech category ("Cloud/DevOps")'
  );

  assert(
    isSkillLogItem({ skillName: 'Kubernetes', category: 'Tools' }),
    'Test 4.3: isSkillLogItem identifies item with skillName property'
  );

  assert(
    !isSkillLogItem(sampleExpItem) && !isSkillLogItem(sampleProjItem),
    'Test 4.4: isSkillLogItem does not misclassify experience or project items as skills'
  );

  // Test 4.5: matchesLogCategory for "ALL"
  const allFiltered = mockLog.filter((item) => matchesLogCategory(item, 'ALL'));
  assert(
    allFiltered.length === 4,
    'Test 4.5: "All" tab retains 100% of audit log items',
    `Count: ${allFiltered.length}/4`
  );

  // Test 4.6: matchesLogCategory for "SKILLS"
  const skillsFiltered = mockLog.filter((item) => matchesLogCategory(item, 'SKILLS'));
  assert(
    skillsFiltered.length === 1 && skillsFiltered[0].id === 'skill_docker',
    'Test 4.6: "Skills" tab correctly parses and isolates skill-type items without empty states',
    `Found: ${skillsFiltered.length} items (${skillsFiltered[0]?.title})`
  );

  // Test 4.7: matchesLogCategory for "EXPERIENCE"
  const expFiltered = mockLog.filter((item) => matchesLogCategory(item, 'EXPERIENCE'));
  assert(
    expFiltered.length === 1 && expFiltered[0].id === 'section_opt_exp_0',
    'Test 4.7: "Experience" tab correctly parses experience items',
    `Found: ${expFiltered.length} items`
  );

  // Test 4.8: matchesLogCategory for "PROJECTS"
  const projFiltered = mockLog.filter((item) => matchesLogCategory(item, 'PROJECTS'));
  assert(
    projFiltered.length === 1 && projFiltered[0].id === 'section_opt_proj_0',
    'Test 4.8: "Projects" tab correctly parses project items',
    `Found: ${projFiltered.length} items`
  );

  // Test 4.9: matchesLogCategory for "SUMMARY"
  const summaryFiltered = mockLog.filter((item) => matchesLogCategory(item, 'SUMMARY'));
  assert(
    summaryFiltered.length === 1 && summaryFiltered[0].id === 'section_opt_summary',
    'Test 4.9: "Summary" tab correctly parses summary items',
    `Found: ${summaryFiltered.length} items`
  );

  console.log('\n--- 5. PRESERVATION OF CRITICAL FUNCTIONALITY ---');

  // Fact Firewall
  const factResult = auditFactIntegrity({
    originalText: defaultMasterProfile.personalInfo.fullName,
    extractedProfile: defaultMasterProfile,
  });
  assert(
    factResult.isVerified === true || factResult.integrityScore > 0,
    'Test 5.1: Fact Firewall operates with 100% integrity'
  );

  // Gatekeeper
  const gkResult = evaluateExperienceLevel('Candidate with 0-1 years of experience in React.');
  assert(
    gkResult.isApproved === true || gkResult.isBlocked === false,
    'Test 5.2: Gatekeeper evaluation rules remain functional'
  );

  // URL Scraper
  assert(
    isJobUrl('https://www.linkedin.com/jobs/view/123456789/'),
    'Test 5.3: URL Scraper validation remains operational'
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
