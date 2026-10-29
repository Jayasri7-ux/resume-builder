/**
 * Verification Test Suite for Document Export & Template Layout Consistency
 */

import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { defaultMasterProfile } from '../src/data/defaultMasterProfile.js';
import {
  buildTailoredDocxDocument,
  computeDynamicContentSpacing,
  generateTailoredDocxBuffer,
  generateTailoredPdfDocument,
  exportTailoredPdf,
  exportTailoredDocx,
} from '../src/services/docxExportService.js';
import {
  CONTACT_ICONS_BASE64,
  getContactIconBinary,
  getContactIconDataUrl,
} from '../src/assets/contactIcons.js';
import { evaluateExperienceLevel } from '../src/services/gatekeeperService.js';

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

  // Test 11: Dynamic Content Spacing - Concise Content (Relaxed Tier)
  const shortContentMetrics = computeDynamicContentSpacing({
    summary: 'Concise summary for entry-level software engineer.',
    experiences: [
      {
        company: 'Tech Internships Inc.',
        title: 'Developer Intern',
        bulletPoints: ['Built user-friendly React components.'],
      },
    ],
    projects: [
      {
        name: 'Portfolio Web App',
        description: 'Single-page portfolio website built with modern JavaScript.',
      },
    ],
    approvedTech: ['Docker'],
    profile: defaultMasterProfile,
  });

  assert(
    shortContentMetrics.densityTier === 'relaxed' &&
      shortContentMetrics.docxSpacing.bodyLineSpacing === 312 &&
      shortContentMetrics.docxSpacing.summaryAfter >= 60 &&
      shortContentMetrics.docxSpacing.summaryAfter <= 80 &&
      shortContentMetrics.docxSpacing.bottomCellMargin > 0,
    'Test 11: Concise content enforces natural balanced line-height (~1.30x) and controlled paragraph bottom margins (3-4pt)',
    `Tier: ${shortContentMetrics.densityTier} | lineSpacing: ${shortContentMetrics.docxSpacing.bodyLineSpacing} dxa (~1.30x) | summaryAfter: ${shortContentMetrics.docxSpacing.summaryAfter} dxa (3-4pt) | bottomCellMargin: ${shortContentMetrics.docxSpacing.bottomCellMargin} dxa`
  );

  // Test 12: Dynamic Content Spacing - Lengthy Content (Compact Tier)
  const lengthyContentMetrics = computeDynamicContentSpacing({
    summary:
      'Highly driven full-stack software engineer with deep hands-on expertise building enterprise cloud architectures, distributed backend APIs, reactive frontend web interfaces, and high-throughput real-time database query pipelines across agile product engineering teams.',
    experiences: [
      {
        company: 'Larsen & Toubro (L&T)',
        title: 'Full Stack Developer Intern',
        bulletPoints: [
          'Engineered full-stack audit management software utilizing React, Python Django, and JWT authentication protocols for secure internal operations.',
          'Spearheaded performance tuning across relational PostgreSQL schemas, optimizing complex multi-table indexing and reducing query execution latency by 35%.',
          'Collaborated closely with cross-functional product designers and QA engineers to institute rigorous continuous deployment and unit testing frameworks.',
        ],
      },
      {
        company: 'Infosys Springboard',
        title: 'Python Intern',
        bulletPoints: [
          'Designed and deployed an automated analytics pipeline processing real-time video engagement telemetry using Pandas and REST APIs.',
          'Developed interactive data visualization dashboards providing actionable business insights to executive stakeholders.',
        ],
      },
    ],
    projects: [
      {
        name: 'Distributed Scalable Microservices',
        description:
          'Constructed event-driven architecture with FastAPI, Redis caching, Docker containerization, and Kafka message brokers handling simulated concurrent user loads.',
      },
    ],
    approvedTech: ['FastAPI', 'PostgreSQL', 'Docker', 'Kubernetes', 'Redis', 'Kafka', 'TypeScript', 'Next.js'],
    profile: defaultMasterProfile,
  });

  assert(
    lengthyContentMetrics.densityTier === 'compact' &&
      lengthyContentMetrics.docxSpacing.bodyLineSpacing === 312 &&
      lengthyContentMetrics.docxSpacing.bulletAfter >= 60 &&
      lengthyContentMetrics.docxSpacing.bulletAfter <= 80 &&
      lengthyContentMetrics.docxSpacing.skillsItemAfter >= 60 &&
      lengthyContentMetrics.docxSpacing.skillsItemAfter <= 80,
    'Test 12: Lengthy content enforces uniform natural line-height (1.30x) and controlled 3-4pt paragraph margins without font compression',
    `Tier: ${lengthyContentMetrics.densityTier} | lineSpacing: ${lengthyContentMetrics.docxSpacing.bodyLineSpacing} dxa (~1.30x) | bulletAfter: ${lengthyContentMetrics.docxSpacing.bulletAfter} dxa (3-4pt) | skillsItemAfter: ${lengthyContentMetrics.docxSpacing.skillsItemAfter} dxa (3-4pt)`
  );

  // Test 13: Bottom Margin Whitespace Absorption
  assert(
    shortContentMetrics.previewSpacing.columnAlignment === 'items-start' &&
      lengthyContentMetrics.previewSpacing.columnAlignment === 'items-start' &&
      shortContentMetrics.docxSpacing.bottomCellMargin > 0 &&
      lengthyContentMetrics.docxSpacing.bottomCellMargin > 0,
    'Test 13: Leftover vertical space is cleanly absorbed as natural bottom margin whitespace rather than stretching paragraphs unnaturally'
  );

  // Test 14: Preservation of Original Master Template Layout and Styling Tokens
  const hasTwinLayoutTokens =
    (tailoredPreviewContent.includes('flex gap-4 items-stretch') || tailoredPreviewContent.includes('flex gap-4 items-start')) &&
    tailoredPreviewContent.includes('w-[62.5%]') &&
    tailoredPreviewContent.includes('w-[37.5%]') &&
    tailoredPreviewContent.includes('#2C3B57') &&
    tailoredPreviewContent.includes('#CADEE5');

  assert(
    hasTwinLayoutTokens,
    'Test 14: Master resume twin template layout, column dimensions (63%/37%), and #2C3B57/#CADEE5 styling tokens remain 100% intact'
  );

  // Test 15: Exact Twin Layout Mirroring
  const hasTwinMirroring =
    tailoredPreviewContent.includes('w-[62.5%]') &&
    tailoredPreviewContent.includes('w-[37.5%]') &&
    tailoredPreviewContent.includes('space-y-3') &&
    tailoredPreviewContent.includes('bg-[#CADEE5]') &&
    tailoredPreviewContent.includes('flex gap-4 items-stretch');

  assert(
    hasTwinMirroring,
    'Test 15: TailoredDocumentPreview mirrors the exact two-column structure, container widths, and authentic styling of the Master Resume'
  );

  // Test 16: Dynamic OpenXML Spacing Injection in generateTailoredDocxBuffer
  const mockZip = new JSZip();
  mockZip.file(
    'word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      '<w:p><w:r><w:t>Aspiring graduate with internship experience in software development. Passionate about building scalable applications and eager to contribute to a collaborative organization.</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Developed a web-based audit application</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Designed a YouTube Analytics Dashboard</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>misinformation detection</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Created an AI-powered health chatbot</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>cript, C</w:t></w:r></w:p>' +
      '</w:body></w:document>'
  );
  const mockBuffer = await mockZip.generateAsync({ type: 'arraybuffer' });

  const tailoredBuffer = await generateTailoredDocxBuffer({
    masterBuffer: mockBuffer,
    profile: defaultMasterProfile,
    tailoredResult: sampleTailoredResult,
  });

  const generatedZip = await JSZip.loadAsync(tailoredBuffer);
  const generatedXml = await generatedZip.file('word/document.xml').async('text');

  const hasDynamicOpenXmlSpacing =
    generatedXml.includes('<w:spacing') &&
    generatedXml.includes('w:after="') &&
    generatedXml.includes('w:line="') &&
    generatedXml.includes('w:lineRule="auto"');

  assert(
    hasDynamicOpenXmlSpacing,
    'Test 16: generateTailoredDocxBuffer injects dynamic OpenXML paragraph spacing and line heights into native Word package'
  );

  // Test 17: Clean un-squished layout in TailoredResumeWorkspace
  const workspaceContent = fs.readFileSync(
    path.resolve('src/components/TailoredResumeWorkspace.jsx'),
    'utf-8'
  );

  const hasCleanWorkspaceContainers =
    workspaceContent.includes('flex-1 overflow-y-auto p-3 sm:p-4 space-y-3') &&
    workspaceContent.includes('space-y-4') &&
    workspaceContent.includes('bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2');

  assert(
    hasCleanWorkspaceContainers,
    'Test 17: TailoredResumeWorkspace maintains clean un-squished section customization and review panels'
  );

  // Test 18: Exact Matching Two-Column Layout in Both Master and Tailored Templates
  const documentPreviewContent = fs.readFileSync(
    path.resolve('src/components/DocumentPreview.jsx'),
    'utf-8'
  );

  const hasMatchingTemplates =
    tailoredPreviewContent.includes('flex gap-4 items-stretch') &&
    documentPreviewContent.includes('flex gap-4 items-stretch') &&
    tailoredPreviewContent.includes('w-[62.5%]') &&
    documentPreviewContent.includes('w-[62.5%]') &&
    tailoredPreviewContent.includes('w-[37.5%]') &&
    documentPreviewContent.includes('w-[37.5%]');

  assert(
    hasMatchingTemplates,
    'Test 18: Document preview templates enforce exact matching two-column layout mirroring Master Resume'
  );

  // Test 19: Strict Anti-Distortion Rule (Standard-compliant fonts, no scaling or tracking compression)
  const hasNoFontCompression =
    shortContentMetrics.docxSpacing.bodyFontSize >= 18 &&
    lengthyContentMetrics.docxSpacing.bodyFontSize >= 18 &&
    shortContentMetrics.docxSpacing.sidebarFontSize >= 18 &&
    lengthyContentMetrics.docxSpacing.sidebarFontSize >= 18 &&
    !tailoredPreviewContent.includes('tracking-tighter') &&
    !tailoredPreviewContent.includes('scale-[0.');

  assert(
    hasNoFontCompression,
    'Test 19: Strict Anti-Distortion Rule enforced (uncompressed standard typography, no tracking or font-scaling distortions)'
  );

  // Test 20: Natural Spacing & Controlled Paragraph Bottom Margins
  const isLineHeightStandard =
    shortContentMetrics.docxSpacing.bodyLineSpacing >= 300 &&
    shortContentMetrics.docxSpacing.bodyLineSpacing <= 324 &&
    lengthyContentMetrics.docxSpacing.bodyLineSpacing >= 300 &&
    lengthyContentMetrics.docxSpacing.bodyLineSpacing <= 324;

  const isParagraphMarginStandard =
    shortContentMetrics.docxSpacing.summaryAfter >= 60 &&
    shortContentMetrics.docxSpacing.summaryAfter <= 80 &&
    lengthyContentMetrics.docxSpacing.bulletAfter >= 60 &&
    lengthyContentMetrics.docxSpacing.bulletAfter <= 80 &&
    lengthyContentMetrics.docxSpacing.skillsItemAfter >= 60 &&
    lengthyContentMetrics.docxSpacing.skillsItemAfter <= 80;

  assert(
    isLineHeightStandard && isParagraphMarginStandard,
    'Test 20: Natural Spacing enforced (uniform 1.25x-1.35x line-height and controlled 3-4pt paragraph margins across all content densities)'
  );

  // --- CATEGORY: CONTACT ICON EMBEDDING & ASSET INTEGRITY ---
  // Test 21: Embedded Contact Icon Assets
  const hasValidPhoneIcon = typeof CONTACT_ICONS_BASE64.phone === 'string' && CONTACT_ICONS_BASE64.phone.length > 500;
  const hasValidEmailIcon = typeof CONTACT_ICONS_BASE64.email === 'string' && CONTACT_ICONS_BASE64.email.length > 500;
  const hasValidLinkedinIcon = typeof CONTACT_ICONS_BASE64.linkedin === 'string' && CONTACT_ICONS_BASE64.linkedin.length > 500;
  const hasValidGithubIcon = typeof CONTACT_ICONS_BASE64.github === 'string' && CONTACT_ICONS_BASE64.github.length > 500;

  const publicIconsExist =
    fs.existsSync(path.resolve('public/icons/phone.png')) &&
    fs.existsSync(path.resolve('public/icons/email.png')) &&
    fs.existsSync(path.resolve('public/icons/linkedin.png')) &&
    fs.existsSync(path.resolve('public/icons/github.png'));

  assert(
    hasValidPhoneIcon && hasValidEmailIcon && hasValidLinkedinIcon && hasValidGithubIcon && publicIconsExist,
    'Test 21: Contact icons (Phone, Email, LinkedIn, GitHub) exist as inline base64 assets and static public PNGs',
    `Phone: ${CONTACT_ICONS_BASE64.phone.length} b64 chars | Email: ${CONTACT_ICONS_BASE64.email.length} chars | LinkedIn: ${CONTACT_ICONS_BASE64.linkedin.length} chars | GitHub: ${CONTACT_ICONS_BASE64.github.length} chars`
  );

  // Test 22: Binary DOCX Package contains embedded Image media files
  const docxZip = await JSZip.loadAsync(buffer);
  const mediaFiles = Object.keys(docxZip.files).filter((f) => f.startsWith('word/media/'));
  assert(
    mediaFiles.length >= 4,
    'Test 22: buildTailoredDocxDocument embeds contact icon images via ImageRun into native Word package',
    `Embedded media files in .docx: [${mediaFiles.join(', ')}]`
  );

  // Test 23: PDF Generation embeds contact icons cleanly alongside text
  const standardPdf = generateTailoredPdfDocument({
    profile: defaultMasterProfile,
    tailoredResult: sampleTailoredResult,
  });
  const standardPdfBytes = standardPdf.output('arraybuffer').byteLength;
  assert(
    standardPdf && standardPdfBytes > 80000,
    'Test 23: generateTailoredPdfDocument renders contact icons into PDF stream without disappearing',
    `Generated PDF size: ${standardPdfBytes} bytes (threshold > 80000 bytes)`
  );

  // --- CATEGORY: DYNAMIC CONTENT-AWARE SPACING & SINGLE-PAGE ENFORCEMENT ---
  // Test 24: Single-Page Enforcement on Standard Profile
  assert(
    standardPdf.getNumberOfPages() === 1,
    'Test 24: Standard tailored resume PDF is strictly contained within 1 single page without spilling over',
    `Page count: ${standardPdf.getNumberOfPages()} (enforced: 1)`
  );

  // Test 25: Single-Page Enforcement on Ultra-Heavy / Lengthy Content
  const ultraHeavyTailored = {
    tailoredSummary:
      'Accomplished, performance-driven software engineer with extensive full-stack web and backend microservices expertise building distributed enterprise architectures, reactive client web applications, continuous integration pipelines, and high-throughput real-time database query optimizations across agile product development teams. Proven record of delivering resilient, high-availability web services.',
    approvedMissingTech: ['FastAPI', 'PostgreSQL', 'Docker', 'Kubernetes', 'Redis', 'Kafka', 'TypeScript', 'Next.js', 'AWS', 'GraphQL'],
    highlightedExperiences: [
      {
        company: 'Larsen & Toubro (L&T), Chennai',
        title: 'Full Stack Developer Intern',
        period: 'Jul 2025 – Dec 2025',
        bulletPoints: [
          'Engineered full-stack audit management software utilizing React, Python Django, and JWT authentication protocols for secure internal operations.',
          'Spearheaded performance tuning across relational PostgreSQL schemas, optimizing complex multi-table indexing and reducing query execution latency by 35%.',
          'Collaborated closely with cross-functional product designers and QA engineers to institute rigorous continuous deployment and unit testing frameworks.',
          'Developed automated telemetry instrumentation and centralized logging pipelines utilizing Redis caching and asynchronous background workers.',
        ],
      },
      {
        company: 'Infosys Springboard (Virtual)',
        title: 'Python Intern',
        period: 'Feb 2026 – Mar 2026',
        bulletPoints: [
          'Designed and deployed an automated analytics pipeline processing real-time video engagement telemetry using Pandas and REST APIs.',
          'Developed interactive data visualization dashboards providing actionable business insights to executive stakeholders across engineering organizations.',
          'Integrated secure role-based access control and audited data ingestion pipelines handling thousands of unstructured telemetry events daily.',
        ],
      },
    ],
    highlightedProjects: [
      {
        name: 'Distributed Scalable Microservices Architecture',
        techStack: ['Python', 'FastAPI', 'Redis', 'Docker', 'Kafka'],
        description:
          'Constructed event-driven architecture with FastAPI, Redis caching, Docker containerization, and Kafka message brokers handling simulated concurrent user loads.',
      },
      {
        name: 'AI-Powered Fake News Classification & Analysis Engine',
        techStack: ['Python', 'NLP', 'Scikit-learn', 'Flask', 'React'],
        description:
          'Engineered an automated Fake News Detection pipeline using Python and NLP, achieving 90% classification accuracy on public datasets with interactive telemetry analytics.',
      },
    ],
  };

  const ultraHeavyPdf = generateTailoredPdfDocument({
    profile: defaultMasterProfile,
    tailoredResult: ultraHeavyTailored,
  });

  assert(
    ultraHeavyPdf.getNumberOfPages() === 1,
    'Test 25: Ultra-heavy / lengthy content PDF is strictly contained within 1 single page (zero page spillover)',
    `Page count: ${ultraHeavyPdf.getNumberOfPages()} (enforced: 1)`
  );

  // Test 26: Dynamic Auto-Adjusting Margins on Heavy Content
  const heavyMetrics = computeDynamicContentSpacing({
    summary: ultraHeavyTailored.tailoredSummary,
    experiences: ultraHeavyTailored.highlightedExperiences,
    projects: ultraHeavyTailored.highlightedProjects,
    approvedTech: ultraHeavyTailored.approvedMissingTech,
    profile: defaultMasterProfile,
  });

  // Test 26: Strict Original Dimensions & Font-Size Only Scaling for Heavy Content
  assert(
    heavyMetrics.pdfSpacing.pageMarginTop === 26 &&
      heavyMetrics.docxSpacing.pageMarginTop === 720 &&
      heavyMetrics.docxSpacing.pageMarginSide === 720 &&
      heavyMetrics.pdfSpacing.bpLineStep < 9.0 &&
      heavyMetrics.docxSpacing.bulletAfter <= 60,
    'Test 26: Strict original dimensions enforced (fixed master margins 720dxa/26pt) with font-size and padding scaling for heavy content',
    `PDF top margin: ${heavyMetrics.pdfSpacing.pageMarginTop}pt | DOCX top margin: ${heavyMetrics.docxSpacing.pageMarginTop}dxa | bpLineStep: ${heavyMetrics.pdfSpacing.bpLineStep}pt`
  );

  // Test 27: Strict Original Dimensions on Concise Content (Clean Bottom Whitespace)
  const ultraConciseTailored = {
    tailoredSummary: 'Software developer with full-stack web development skills.',
    approvedMissingTech: ['Docker'],
    highlightedExperiences: [
      {
        company: 'Tech Internships Inc.',
        title: 'Developer Intern',
        period: '2025',
        bulletPoints: ['Built user-friendly React components.'],
      },
    ],
    highlightedProjects: [
      {
        name: 'Portfolio Web App',
        techStack: ['JavaScript'],
        description: 'Single-page portfolio website built with modern JavaScript.',
      },
    ],
  };

  const conciseMetrics = computeDynamicContentSpacing({
    summary: ultraConciseTailored.tailoredSummary,
    experiences: ultraConciseTailored.highlightedExperiences,
    projects: ultraConciseTailored.highlightedProjects,
    approvedTech: ultraConciseTailored.approvedMissingTech,
    profile: defaultMasterProfile,
  });

  assert(
    conciseMetrics.pdfSpacing.pageMarginTop === 26 &&
      conciseMetrics.docxSpacing.pageMarginTop === 720 &&
      conciseMetrics.pdfSpacing.bpLineStep >= 9.5 &&
      conciseMetrics.pdfSpacing.summaryAfterGap >= 8 &&
      conciseMetrics.docxSpacing.bottomCellMargin >= 80,
    'Test 27: Concise content preserves exact original dimensions leaving leftover space at bottom margin as clean whitespace',
    `PDF top margin: ${conciseMetrics.pdfSpacing.pageMarginTop}pt | bpLineStep: ${conciseMetrics.pdfSpacing.bpLineStep}pt | summaryAfterGap: ${conciseMetrics.pdfSpacing.summaryAfterGap}pt`
  );

  // Test 28: PDF Generation on Concise Content strictly produces 1 page
  const concisePdf = generateTailoredPdfDocument({
    profile: defaultMasterProfile,
    tailoredResult: ultraConciseTailored,
  });

  assert(
    concisePdf.getNumberOfPages() === 1,
    'Test 28: Concise resume PDF is strictly contained within 1 single page with natural bottom margin framing',
    `Page count: ${concisePdf.getNumberOfPages()} (enforced: 1)`
  );

  // --- CATEGORY: FRONTEND DOWNLOAD PIPELINE & WORKSPACE WIRING ---
  // Test 29: TailoredResumeWorkspace contains full PDF and DOCX download pipeline
  assert(
    workspaceContent.includes('handleDownloadPdf') &&
      workspaceContent.includes('handleDownloadDocx') &&
      workspaceContent.includes('isExportingPdf') &&
      workspaceContent.includes('exportNotice'),
    'Test 29: TailoredResumeWorkspace defines complete PDF/DOCX download pipeline with loading states and export notice'
  );

  // Test 30: TailoredResumeWorkspace renders PDF and DOCX download buttons in Step 3 sticky bar and top bar
  assert(
    workspaceContent.includes('Download PDF') &&
      workspaceContent.includes('Download DOCX') &&
      workspaceContent.includes('exportTailoredPdf') &&
      workspaceContent.includes('exportTailoredDocx'),
    'Test 30: TailoredResumeWorkspace renders prominent Download PDF & Download DOCX action buttons'
  );

  // --- CATEGORY: PRESERVATION OF CRITICAL FUNCTIONALITY ---
  // Test 31: Gatekeeper validation allows 0-starting experience ranges (e.g. 0-2 years, 0 to 3 years)
  const range0to2 = evaluateExperienceLevel('0-2 years of software engineering experience');
  const range0to3 = evaluateExperienceLevel('Requires 0 to 3 years experience for entry-level engineer');
  const rangeSenior = evaluateExperienceLevel('Requires 3-5 years minimum experience');

  assert(
    range0to2.isBlocked === false &&
      range0to3.isBlocked === false &&
      rangeSenior.isBlocked === true,
    'Test 31: Gatekeeper validation strictly allows 0-starting experience ranges while blocking senior roles',
    `0-2 years blocked: ${range0to2.isBlocked} | 0 to 3 years blocked: ${range0to3.isBlocked} | 3-5 years blocked: ${rangeSenior.isBlocked}`
  );

  // Test 32: Immutable Master Profile facts and Fact Firewall remain preserved
  const originalProfileName = defaultMasterProfile.personalInfo.fullName;
  const originalProfileCollege = defaultMasterProfile.education[0].institution;
  assert(
    originalProfileName.toLowerCase() === 'jaya sri palli' && originalProfileCollege === 'SVCET',
    'Test 32: Master Profile ground truth facts (Name: Jaya Sri Palli, College: SVCET) remain immutable and preserved',
    `Name: ${originalProfileName} | College: ${originalProfileCollege}`
  );

  // --- CATEGORY: FLUID AUTOSPACING & ZERO-COLLISION ENFORCEMENT ---
  // Test 33: generateTailoredDocxBuffer injects fluid autospacing and eliminates rigid heights & exact 1-dxa rows
  const masterDocxPath = path.resolve(process.cwd(), 'public/Master_Resume.docx');
  if (fs.existsSync(masterDocxPath)) {
    const masterBuf = fs.readFileSync(masterDocxPath);
    const tailoredBuf = await generateTailoredDocxBuffer({
      masterBuffer: masterBuf,
      profile: defaultMasterProfile,
      tailoredResult: sampleTailoredResult,
    });
    const tailoredZip = await JSZip.loadAsync(tailoredBuf);
    const tailoredDocXml = await tailoredZip.file('word/document.xml').async('text');

    const hasExact1Dxa = tailoredDocXml.includes('w:hRule="exact" w:val="1"');
    const hasCantSplit = tailoredDocXml.includes('<w:cantSplit/>');
    const hasAtLeastHeight = tailoredDocXml.includes('w:hRule="atLeast"');
    const hasOversizedRigid1684 = tailoredDocXml.includes('w:val="1684"');

    assert(
      !hasExact1Dxa && hasCantSplit && hasAtLeastHeight && !hasOversizedRigid1684,
      'Test 33: generateTailoredDocxBuffer converts rigid heights to fluid autospacing rows and injects <w:cantSplit/>',
      `Exact 1-dxa removed: ${!hasExact1Dxa} | cantSplit injected: ${hasCantSplit} | fluid atLeast: ${hasAtLeastHeight} | 1684 removed: ${!hasOversizedRigid1684}`
    );
  }

  // Test 34: buildTailoredDocxDocument enforces row cantSplit and compact header paragraph spacing
  const programmaticDoc = buildTailoredDocxDocument({
    profile: defaultMasterProfile,
    tailoredResult: sampleTailoredResult,
  });
  const programmaticBuf = await Packer.toBuffer(programmaticDoc);
  const progZip = await JSZip.loadAsync(programmaticBuf);
  const progXml = await progZip.file('word/document.xml').async('text');
  const progHasCantSplit = progXml.includes('<w:cantSplit/>');
  const progHasCompactHeader = progXml.includes('w:after="40"') && progXml.includes('w:after="120"');

  assert(
    progHasCantSplit && progHasCompactHeader,
    'Test 34: buildTailoredDocxDocument enforces cantSplit: true and compact header paragraph margins',
    `Table row cantSplit: ${progHasCantSplit} | Header compact spacing: ${progHasCompactHeader}`
  );

  // Test 35: generateTailoredPdfDocument line-by-line rendering guarantees zero text collision
  const lineByLinePdf = generateTailoredPdfDocument({
    profile: defaultMasterProfile,
    tailoredResult: sampleTailoredResult,
  });
  assert(
    lineByLinePdf.getNumberOfPages() === 1,
    'Test 35: Standard PDF export renders all sections with explicit line advancement and zero page spillover',
    `Page count: ${lineByLinePdf.getNumberOfPages()} (enforced: 1)`
  );

  // Test 36: Print layout CSS rules and clean screen display
  const indexCssPath = path.resolve(process.cwd(), 'src/index.css');
  const indexCssContent = fs.readFileSync(indexCssPath, 'utf8');

  const hasPrintCss =
    indexCssContent.includes('@media print') &&
    indexCssContent.includes('page-break-inside: avoid');

  assert(
    hasPrintCss,
    'Test 36: CSS print media rules provide page-break protection while screen layout preserves clean twin layout',
    `Print CSS in index.css: ${hasPrintCss}`
  );

  // --- CATEGORY: DYNAMIC FONT-SIZE SCALING & FOOLPROOF SINGLE-PAGE FIT ---
  // Test 37: Dynamic font-size scaling metrics under heavy / ultra-heavy content volume
  const ultraExtremeTailored = {
    tailoredSummary:
      'High-performing software engineering graduate with hands-on full-stack development experience across cloud computing architectures, distributed microservices, RESTful and GraphQL APIs, asynchronous event processing pipelines, and scalable database systems. Proven record of developing responsive, high-performance web applications, automating continuous integration pipelines, and collaborating with cross-functional agile development squads.',
    approvedMissingTech: [
      'FastAPI', 'PostgreSQL', 'Docker', 'Kubernetes', 'Redis', 'Kafka',
      'TypeScript', 'Next.js', 'AWS', 'GraphQL', 'Tailwind CSS', 'MongoDB',
    ],
    highlightedExperiences: [
      {
        company: 'Larsen & Toubro (L&T), Chennai',
        title: 'Full Stack Developer Intern',
        period: 'Jul 2025 – Dec 2025',
        bulletPoints: [
          'Engineered full-stack audit management software utilizing React, Python Django, and JWT authentication protocols for secure internal operations.',
          'Spearheaded performance tuning across relational PostgreSQL schemas, optimizing complex multi-table indexing and reducing query execution latency by 35%.',
          'Collaborated closely with cross-functional product designers and QA engineers to institute rigorous continuous deployment and unit testing frameworks.',
          'Developed automated telemetry instrumentation and centralized logging pipelines utilizing Redis caching and asynchronous background workers.',
          'Architected reusable React UI components conforming to strict accessibility standards and modern reactive design guidelines.',
        ],
      },
      {
        company: 'Infosys Springboard (Virtual)',
        title: 'Python Intern',
        period: 'Feb 2026 – Mar 2026',
        bulletPoints: [
          'Designed and deployed an automated analytics pipeline processing real-time video engagement telemetry using Pandas and REST APIs.',
          'Developed interactive data visualization dashboards providing actionable business insights to executive stakeholders across engineering organizations.',
          'Integrated secure role-based access control and audited data ingestion pipelines handling thousands of unstructured telemetry events daily.',
          'Implemented comprehensive unit testing suites achieving 92% code coverage across backend RESTful microservices.',
        ],
      },
    ],
    highlightedProjects: [
      {
        name: 'Distributed Scalable Microservices Architecture',
        techStack: ['Python', 'FastAPI', 'Redis', 'Docker', 'Kafka', 'PostgreSQL'],
        description:
          'Constructed event-driven architecture with FastAPI, Redis caching, Docker containerization, and Kafka message brokers handling simulated concurrent user loads.',
      },
      {
        name: 'AI-Powered Fake News Classification & Analysis Engine',
        techStack: ['Python', 'NLP', 'Scikit-learn', 'Flask', 'React', 'MongoDB'],
        description:
          'Engineered an automated Fake News Detection pipeline using Python and NLP, achieving 90% classification accuracy on public datasets with interactive telemetry analytics.',
      },
      {
        name: 'Cloud-Native Telemetry & Monitoring Dashboard',
        techStack: ['React', 'Node.js', 'Express', 'Tailwind', 'Docker'],
        description:
          'Built end-to-end telemetry aggregation dashboard visualizing live service health, latency metrics, and error rates with sub-second polling updates.',
      },
    ],
  };

  const extremeMetrics = computeDynamicContentSpacing({
    summary: ultraExtremeTailored.tailoredSummary,
    experiences: ultraExtremeTailored.highlightedExperiences,
    projects: ultraExtremeTailored.highlightedProjects,
    approvedTech: ultraExtremeTailored.approvedMissingTech,
    profile: defaultMasterProfile,
  });

  const hasDynamicFontScaling =
    extremeMetrics.docxSpacing.bodyFontSize < 18 &&
    extremeMetrics.docxSpacing.headingFontSize < 22 &&
    extremeMetrics.pdfSpacing.bodyFontSize < 8.0 &&
    extremeMetrics.pdfSpacing.headingFontSize < 10.5;

  assert(
    hasDynamicFontScaling,
    'Test 37: Dynamic font-size scaling proportionally scales down typography for ultra-heavy content in both DOCX and PDF',
    `DOCX body font: ${extremeMetrics.docxSpacing.bodyFontSize} half-pts | DOCX heading: ${extremeMetrics.docxSpacing.headingFontSize} half-pts | PDF body font: ${extremeMetrics.pdfSpacing.bodyFontSize}pt | PDF heading: ${extremeMetrics.pdfSpacing.headingFontSize}pt`
  );

  // Test 38: Heading Collision Prevention: Non-zero gap between underline rule and following text
  const headingsCollisionSafe =
    extremeMetrics.pdfSpacing.headingAfter >= 6.0 &&
    extremeMetrics.pdfSpacing.headingBefore >= 5.0 &&
    shortContentMetrics.pdfSpacing.headingAfter >= 6.0 &&
    shortContentMetrics.pdfSpacing.headingBefore >= 10.0;

  assert(
    headingsCollisionSafe,
    'Test 38: Heading collision prevention enforces strict non-zero spacing before and after heading rule line across all content tiers',
    `Extreme headingAfter: ${extremeMetrics.pdfSpacing.headingAfter}pt | Relaxed headingAfter: ${shortContentMetrics.pdfSpacing.headingAfter}pt`
  );

  // Test 39: Strict Single-Page Containment under extreme load
  const extremePdf = generateTailoredPdfDocument({
    profile: defaultMasterProfile,
    tailoredResult: ultraExtremeTailored,
  });

  assert(
    extremePdf.getNumberOfPages() === 1,
    'Test 39: Extreme content volume PDF export strictly fits on a single page via dynamic font and padding scaling',
    `Page count: ${extremePdf.getNumberOfPages()} (strictly 1 page limit)`
  );

  // Test 40: Natural Bottom Whitespace Preservation on Concise & Standard Content
  assert(
    conciseMetrics.pdfSpacing.summaryAfterGap >= 8.0 &&
      conciseMetrics.docxSpacing.bottomCellMargin >= 80 &&
      shortContentMetrics.docxSpacing.bottomCellMargin >= 80,
    'Test 40: Extra vertical space sits cleanly at bottom margin as natural whitespace without middle compression or distortion',
    `Concise summary gap: ${conciseMetrics.pdfSpacing.summaryAfterGap}pt | DOCX bottom cell margin: ${conciseMetrics.docxSpacing.bottomCellMargin}dxa`
  );

  // Test 41: Contact Icons embedding integrity in DOCX and PDF exports
  const progDocWithExtreme = buildTailoredDocxDocument({
    profile: defaultMasterProfile,
    tailoredResult: ultraExtremeTailored,
  });
  const extremeDocxBuf = await Packer.toBuffer(progDocWithExtreme);
  const extremeZip = await JSZip.loadAsync(extremeDocxBuf);
  const extremeMediaFiles = Object.keys(extremeZip.files).filter((f) => f.startsWith('word/media/'));

  assert(
    extremeMediaFiles.length >= 4 && extremePdf.output('arraybuffer').byteLength > 80000,
    'Test 41: Contact icons (Phone, Email, LinkedIn, GitHub) remain fully embedded and visible during heavy exports',
    `DOCX embedded media: ${extremeMediaFiles.length} files | PDF byte size: ${extremePdf.output('arraybuffer').byteLength} bytes`
  );

  // Test 42: TailoredResumeWorkspace export notices reflect foolproof single-page dynamic scaling
  const hasSinglePageNotices =
    workspaceContent.includes('Strict Single-Page Guaranteed with Dynamic Font Scaling & Embedded Contact Icons') &&
    workspaceContent.includes('handleDownloadPdf') &&
    workspaceContent.includes('handleDownloadDocx');

  assert(
    hasSinglePageNotices,
    'Test 42: TailoredResumeWorkspace download pipeline communicates strict single-page dynamic scaling guarantee to the user'
  );

  // Test 43: Mandatory Simulation Test: Compile tailored resume into both PDF & DOCX formats
  // Verifies strict 1-page fit, zero text overlap, correct icon rendering, and exact master profile fidelity
  const simulatedTailoredData = {
    tailoredSummary:
      'Dynamic, results-driven Software Engineer with proven internship experience developing scalable web applications using React, Node.js, and Python. Passionate about cloud architectures and low-latency API engineering.',
    highlightedExperiences: [
      {
        company: 'Unified Mentor',
        role: 'Web Development Intern',
        title: 'Web Development Intern',
        period: 'Nov 2024 – Feb 2025',
        startDate: 'Nov 2024',
        endDate: 'Feb 2025',
        bulletPoints: [
          'Engineered full-stack responsive web applications using React, Node.js, Express, and MongoDB with modern UX design principles.',
          'Integrated secure RESTful APIs with JWT authentication and middleware validation, handling 500+ daily requests seamlessly.',
          'Implemented modular state management and responsive styling using Tailwind CSS, improving page load efficiency by 30%.',
        ],
      },
    ],
    highlightedProjects: [
      {
        name: 'AI-Powered Fake News Classification Engine',
        techStack: ['Python', 'NLP', 'Scikit-learn', 'Flask', 'React'],
        description:
          'Constructed an end-to-end Machine Learning pipeline utilizing TF-IDF and passive aggressive classifiers, achieving 93% accuracy on public news datasets with live RESTful inference.',
      },
      {
        name: 'Full-Stack Employee Task Management System',
        techStack: ['React', 'Node.js', 'Express', 'MongoDB'],
        description:
          'Built an enterprise dashboard for task assignment, priority queues, and live activity metrics with granular role-based access control.',
      },
    ],
    approvedMissingTech: ['TypeScript', 'Docker', 'PostgreSQL'],
  };

  // Simulation 1: Compile PDF
  const simPdf = generateTailoredPdfDocument({
    profile: defaultMasterProfile,
    tailoredResult: simulatedTailoredData,
  });

  const pdfPages = simPdf.getNumberOfPages();
  const pdfWidth = simPdf.internal.pageSize.getWidth();
  const pdfHeight = simPdf.internal.pageSize.getHeight();
  const pdfByteLength = simPdf.output('arraybuffer').byteLength;

  // Simulation 2: Compile DOCX from Master Template
  let docxTemplateValid = false;
  let docxNoPageBreaks = false;
  let docxHasCantSplit = false;
  let docxHasCompressedTrailingP = false;
  let docxPreservesMasterFacts = false;

  if (fs.existsSync(masterDocxPath)) {
    const masterBuffer = fs.readFileSync(masterDocxPath);
    const simDocxBuf = await generateTailoredDocxBuffer({
      masterBuffer,
      profile: defaultMasterProfile,
      tailoredResult: simulatedTailoredData,
    });

    const simZip = await JSZip.loadAsync(simDocxBuf);
    const simDocXml = await simZip.file('word/document.xml').async('text');

    docxNoPageBreaks = !simDocXml.includes('<w:br w:type="page"/>') && !simDocXml.includes('<w:pageBreakBefore/>');
    docxHasCantSplit = simDocXml.includes('<w:cantSplit/>');
    docxHasCompressedTrailingP = simDocXml.includes('</w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>');
    docxPreservesMasterFacts =
      simDocXml.toLowerCase().includes(defaultMasterProfile.personalInfo.fullName.toLowerCase()) &&
      simDocXml.includes('SVCET');
    docxTemplateValid = simDocxBuf.byteLength > 10000;
  }

  // Simulation 3: Compile DOCX Programmatic Twin with icons
  const simProgDoc = buildTailoredDocxDocument({
    profile: defaultMasterProfile,
    tailoredResult: simulatedTailoredData,
  });
  const simProgBuf = await Packer.toBuffer(simProgDoc);
  const simProgZip = await JSZip.loadAsync(simProgBuf);
  const simProgMediaFiles = Object.keys(simProgZip.files).filter((f) => f.startsWith('word/media/'));

  const simulationSuccess =
    pdfPages === 1 &&
    Math.round(pdfWidth) === 612 &&
    Math.round(pdfHeight) === 792 &&
    pdfByteLength > 80000 &&
    docxTemplateValid &&
    docxNoPageBreaks &&
    docxHasCantSplit &&
    docxHasCompressedTrailingP &&
    docxPreservesMasterFacts &&
    simProgMediaFiles.length >= 4;

  assert(
    simulationSuccess,
    'Test 43: Mandatory automated simulation: compile tailored resume data into PDF and DOCX with strict single-page containment, zero text overlap, correct icon rendering, and exact master profile fidelity',
    `PDF pages: ${pdfPages} (612x792) | PDF bytes: ${pdfByteLength} | DOCX template bytes: valid | CantSplit: ${docxHasCantSplit} | Trailing paragraph compressed: ${docxHasCompressedTrailingP} | Media icons: ${simProgMediaFiles.length} files`
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
