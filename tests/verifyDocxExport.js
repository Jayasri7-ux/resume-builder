/**
 * Verification Test Suite for Document Export & Template Layout Consistency
 */

import fs from 'fs';
import path from 'path';
import { Packer } from 'docx';
import { defaultMasterProfile } from '../src/data/defaultMasterProfile.js';
import { buildTailoredDocxDocument } from '../src/services/docxExportService.js';

console.log('================================================================');
console.log('   DOCUMENT EXPORT & TWIN TEMPLATE VERIFICATION TEST SUITE');
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
  const sampleTailoredResult = {
    tailoredSummary: 'Dynamic software developer with internship experience in scalable web applications.',
    tailoredHeadline: 'Full Stack Developer',
    matchScore: 92,
    approvedMissingTech: ['FastAPI', 'PostgreSQL', 'Docker'],
    highlightedExperiences: [
      {
        company: 'Larsen & Toubro (L&T), Chennai',
        title: 'Full Stack Developer Intern',
        period: 'Jul 2025 – Dec 2025',
        bulletPoints: [
          'Engineered web-based audit application using React and Django with JWT authentication.',
        ],
      },
    ],
    highlightedProjects: [
      {
        name: 'Fake News Detection System',
        techStack: ['Python', 'NLP', 'Scikit-learn', 'Flask', 'React'],
        description: 'Engineered automated pipeline classifying news articles with 90% accuracy.',
      },
    ],
  };

  // Test 1: Build docx document
  const doc = buildTailoredDocxDocument({
    profile: defaultMasterProfile,
    tailoredResult: sampleTailoredResult,
  });

  assert(Boolean(doc), 'Test 1: buildTailoredDocxDocument returns a valid Document instance');

  // Test 2: Pack document to Buffer
  const buffer = await Packer.toBuffer(doc);
  assert(
    buffer && buffer.length > 5000,
    'Test 2: Packer successfully serializes Word (.docx) binary package',
    `Generated .docx size: ${buffer.length} bytes (threshold > 5000 bytes)`
  );

  // Test 3: Verify binary Word package contains document.xml
  const bufferString = buffer.toString('binary');
  const hasWordXml = bufferString.includes('word/document.xml');
  assert(
    hasWordXml,
    'Test 3: Word binary package contains valid OpenXML word/document.xml structure'
  );

  // Test 4: Verify Twin Template Structure in code
  const tailoredPreviewContent = fs.readFileSync(
    path.resolve('src/components/TailoredDocumentPreview.jsx'),
    'utf-8'
  );

  const hasTwoColumnLayout = tailoredPreviewContent.includes('w-[62.5%]') && tailoredPreviewContent.includes('w-[37.5%]');
  assert(
    hasTwoColumnLayout,
    'Test 4: TailoredDocumentPreview implements exact two-column grid layout (~63% Left, ~37% Right)'
  );

  // Test 5: Verify Navy Blue (#2C3B57) heading token
  const hasNavyHeadings = tailoredPreviewContent.includes('#2C3B57');
  assert(
    hasNavyHeadings,
    'Test 5: TailoredDocumentPreview uses authentic #2C3B57 navy styling tokens for headings and borders'
  );

  // Test 6: Verify Powder Blue (#CADEE5) sidebar background token
  const hasPowderBlueSidebar = tailoredPreviewContent.includes('#CADEE5');
  assert(
    hasPowderBlueSidebar,
    'Test 6: TailoredDocumentPreview applies exact #CADEE5 shading token to right sidebar'
  );

  // Test 7: Verify Markdown export is completely removed
  const hasMarkdownExport = tailoredPreviewContent.includes('.download = \'Tailored_Resume.md\'') || tailoredPreviewContent.includes('text/markdown');
  assert(
    !hasMarkdownExport,
    'Test 7: Raw Markdown (.md) download is completely removed from export pipeline'
  );

  // Test 8: Verify Word (.docx) export is wired to download button
  const hasDocxDownload = tailoredPreviewContent.includes('exportTailoredDocx') && tailoredPreviewContent.includes('Tailored_Resume.docx');
  assert(
    hasDocxDownload,
    'Test 8: Professional Word (.docx) compiler is wired to primary download action'
  );

  // Test 9: Verify hardcoded Highlight tech chip is removed from SectionCustomInstruction
  const sectionCustomInstructionContent = fs.readFileSync(
    path.resolve('src/components/SectionCustomInstruction.jsx'),
    'utf-8'
  );
  const hasHighlightChip = sectionCustomInstructionContent.includes('+ Highlight');
  assert(
    !hasHighlightChip,
    'Test 9: Hardcoded "+ Highlight [tech]" quick chip is completely removed from SectionCustomInstruction'
  );

  // Test 10: Verify generic reusable chips "Make punchier" and "Shorten" are preserved
  const hasPunchierChip = sectionCustomInstructionContent.includes('Make punchier');
  const hasShortenChip = sectionCustomInstructionContent.includes('Shorten');
  assert(
    hasPunchierChip && hasShortenChip,
    'Test 10: Generic reusable quick chips ("Make punchier", "Shorten") remain intact'
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

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
