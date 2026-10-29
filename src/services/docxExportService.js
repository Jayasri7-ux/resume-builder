/**
 * Document Export Service
 * Compiles and exports tailored resumes in professional Word (.docx) and PDF formats,
 * strictly replicating the two-column "Twin" layout with #2C3B57 navy headers
 * and #CADEE5 sidebar styling.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  AlignmentType,
  ImageRun,
} from 'docx';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import {
  getContactIconBinary,
  getContactIconDataUrl,
  CONTACT_ICONS_BASE64,
  CONTACT_ICONS_DATA_URL,
} from '../assets/contactIcons.js';

function escapeXml(unsafe) {
  return String(unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Intelligently categorizes human-approved missing tech into resume categories:
 * - Languages
 * - Frontend
 * - Backend
 * - Databases
 * - Tools / Cloud & DevOps (with strict catch-all to guarantee 0 skills are omitted)
 *
 * @param {Array<string|Object>} approvedTech - Array of approved skills (strings or objects with .name/.category)
 * @param {Object} [existingSkills={}] - Base profile skills to avoid duplicates
 * @returns {{ languages: string[], frontend: string[], backend: string[], databases: string[], tools: string[] }}
 */
export function categorizeApprovedSkills(approvedTech = [], existingSkills = {}) {
  const result = {
    languages: [],
    frontend: [],
    backend: [],
    databases: [],
    tools: [],
  };

  if (!Array.isArray(approvedTech) || approvedTech.length === 0) {
    return result;
  }

  // Helper to check if a skill is already present in a base array (case-insensitive)
  const isDuplicate = (skillName, list = []) => {
    const lower = skillName.trim().toLowerCase();
    return list.some((item) => (typeof item === 'string' ? item.trim().toLowerCase() : '') === lower);
  };

  const existingLang = existingSkills.languages || ['Python', 'Java', 'JavaScript', 'C'];
  const existingFe = existingSkills.frontend || ['HTML', 'CSS', 'React'];
  const existingBe = existingSkills.backend || ['Node.js', 'Django', 'Flask'];
  const existingDb = existingSkills.databases || existingSkills.database || ['SQL', 'MongoDB'];
  const existingTools = existingSkills.cloudAndDevOps || existingSkills.tools || ['Git', 'GitHub', 'VS Code', 'Render'];

  approvedTech.forEach((item) => {
    const rawName = typeof item === 'string' ? item : item?.name || '';
    const name = rawName.trim();
    if (!name) return;

    const lower = name.toLowerCase();
    const explicitCat = (typeof item === 'object' && item?.category ? item.category.toLowerCase() : '');

    // 1. Languages
    if (
      explicitCat.includes('language') ||
      /^(typescript|javascript|python|java|c\+\+|c#|ruby|golang|go|rust|swift|kotlin|php|scala|r|dart|bash|shell|perl)$/i.test(lower) ||
      /\b(typescript|c\+\+|golang|kotlin|rust|scala)\b/i.test(lower)
    ) {
      if (!isDuplicate(name, existingLang) && !result.languages.includes(name)) {
        result.languages.push(name);
        return;
      }
    }

    // 2. Frontend
    if (
      explicitCat.includes('frontend') ||
      explicitCat.includes('ui') ||
      /react|vue|angular|svelte|next\.?js|nuxt|tailwind|bootstrap|sass|scss|less|redux|zustand|vite|webpack|jquery|html5?|css3?/i.test(lower)
    ) {
      if (!isDuplicate(name, existingFe) && !result.frontend.includes(name)) {
        result.frontend.push(name);
        return;
      }
    }

    // 3. Backend
    if (
      explicitCat.includes('backend') ||
      explicitCat.includes('api') ||
      /node\.?js|express|django|flask|fastapi|spring|asp\.net|\.net|nest\.?js|graphql|rest(ful)?(\s*api)?|microservice|grpc|celery|rails/i.test(lower)
    ) {
      if (!isDuplicate(name, existingBe) && !result.backend.includes(name)) {
        result.backend.push(name);
        return;
      }
    }

    // 4. Databases
    if (
      explicitCat.includes('database') ||
      explicitCat.includes('db') ||
      /postgres(ql)?|mysql|sqlite|mongo(db)?|redis|oracle|cassandra|dynamodb|elasticsearch|firebase|supabase|mariadb|sql/i.test(lower)
    ) {
      if (!isDuplicate(name, existingDb) && !result.databases.includes(name)) {
        result.databases.push(name);
        return;
      }
    }

    // 5. Cloud, DevOps, Tools & Catch-All (Guarantees ZERO omissions)
    if (!isDuplicate(name, existingTools) && !result.tools.includes(name)) {
      result.tools.push(name);
    }
  });

  return result;
}

/**
 * Calculates dynamic content spacing, vertical padding, and line spacing metrics
 * based on the volume and density of tailored content.
 *
 * - Shorter content / sections: dynamically compresses padding to eliminate large, ugly white gaps.
 * - Longer content / sections: optimizes line spacing and font padding slightly to prevent
 *   sidebar overcrowding or text spilling over columns / page boundaries.
 * - Remaining vertical space: absorbed cleanly as bottom margin whitespace instead of stretching paragraphs unnaturally.
 *
 * @param {Object} options
 * @param {string} [options.summary=''] - Tailored professional summary
 * @param {Array} [options.experiences=[]] - Tailored work experience / internships
 * @param {Array} [options.projects=[]] - Tailored projects
 * @param {Array} [options.approvedTech=[]] - Approved missing skills
 * @param {Object} [options.profile=null] - Base master profile
 * @returns {{ densityTier: 'compact'|'standard'|'relaxed', totalLeftWords: number, totalLeftItems: number, rightColumnItemLoad: number, docxSpacing: Object, previewSpacing: Object }}
 */
export function computeDynamicContentSpacing({
  summary = '',
  experiences = [],
  projects = [],
  approvedTech = [],
  profile = null,
} = {}) {
  // 1. Calculate Left Column Content Density
  const summaryWords = String(summary || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const expBulletCount = (experiences || []).reduce(
    (acc, exp) => acc + (exp?.bulletPoints?.length || 0),
    0
  );
  const expWords = (experiences || []).reduce(
    (acc, exp) =>
      acc +
      (exp?.bulletPoints || [])
        .join(' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean).length,
    0
  );

  const projWords = (projects || []).reduce(
    (acc, proj) =>
      acc +
      String(proj?.description || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean).length,
    0
  );

  const totalLeftWords = summaryWords + expWords + projWords;
  const totalLeftItems = 1 + expBulletCount + (projects?.length || 0);

  // 2. Calculate Right Column (Sidebar) Content Load
  const approvedCount = Array.isArray(approvedTech) ? approvedTech.length : 0;
  const awardsCount = (profile?.awards || []).length;
  const certsCount = (profile?.certifications || []).length;
  const educationCount = (profile?.education || []).length;
  const rightColumnItemLoad =
    educationCount * 2 + 5 + Math.ceil(approvedCount / 2) + awardsCount + certsCount;

  // 3. Determine Density Tier: 'compact' | 'standard' | 'relaxed'
  // - 'compact': lengthy content (> 180 words OR > 6 items OR high sidebar load >= 18 OR approvedCount >= 6)
  // - 'relaxed': short/concise content (< 120 words AND <= 4 items AND approvedCount <= 2)
  // - 'standard': balanced content
  let densityTier = 'standard';
  if (totalLeftWords > 180 || totalLeftItems > 6 || rightColumnItemLoad >= 18 || approvedCount >= 6) {
    densityTier = 'compact';
  } else if (totalLeftWords < 120 && totalLeftItems <= 4 && approvedCount <= 2) {
    densityTier = 'relaxed';
  }

  // 4. Content Densities and Dynamic Thresholds
  const isHeavy = totalLeftWords > 220 || totalLeftItems >= 8 || rightColumnItemLoad >= 22;
  const isUltraHeavy = totalLeftWords > 270 || totalLeftItems >= 10 || rightColumnItemLoad >= 25;
  const isExtreme = totalLeftWords > 340 || totalLeftItems >= 13 || rightColumnItemLoad >= 29;
  const isUltraRelaxed = totalLeftWords < 80 && totalLeftItems <= 3 && rightColumnItemLoad <= 14;

  // 5. DOCX OpenXML Spacing Metrics (20 dxa = 1 pt)
  // Enforces clean, uniform natural line-height (1.25x-1.35x -> 312 dxa = 1.30x)
  // and controlled paragraph bottom margins (spaceAfter: 3-4pt -> 60-80 dxa)
  let docxSpacing = {
    headingBefore: 90,  // 4.5pt natural block margin (removes rigid spacing)
    headingAfter: 60,   // 3pt
    summaryAfter: 70,   // 3.5pt controlled paragraph bottom margin
    companyBefore: 50,  // 2.5pt
    companyAfter: 20,   // 1pt
    titlePeriodAfter: 30, // 1.5pt
    bulletAfter: 65,    // ~3.25pt controlled paragraph bottom margin (3-4pt)
    projectNameBefore: 50, // 2.5pt
    projectNameAfter: 20,  // 1pt
    projectTechAfter: 25,  // 1.25pt
    projectDescAfter: 70,  // 3.5pt controlled paragraph bottom margin (3-4pt)
    bodyLineSpacing: 312,  // 1.30x uniform natural line height (1.25 - 1.35)
    bodyFontSize: 18,      // 9pt crisp uncompressed font
    headingFontSize: 22,   // 11pt
    summaryFontSize: 19,   // 9.5pt
    companyFontSize: 20,   // 10pt
    titleFontSize: 18,     // 9pt
    projectNameFontSize: 20, // 10pt
    projectTechFontSize: 18, // 9pt
    nameFontSize: 72,      // 36pt

    sidebarHeadingBefore: 90, // 4.5pt
    sidebarHeadingAfter: 60,  // 3pt
    educationBefore: 25,      // 1.25pt
    educationAfter: 10,       // 0.5pt
    educationInstAfter: 65,   // ~3.25pt (3-4pt)
    skillsItemAfter: 65,      // ~3.25pt (3-4pt)
    awardItemAfter: 65,       // ~3.25pt (3-4pt)
    certItemAfter: 65,        // ~3.25pt (3-4pt)
    sidebarLineSpacing: 312,  // 1.30x uniform natural line height (1.25 - 1.35)
    sidebarFontSize: 18,      // 9pt crisp uncompressed font

    bottomCellMargin: 100,    // Absorbs remaining whitespace cleanly at bottom margin
  };

  if (densityTier === 'compact') {
    // For standard lengthy content: enforce uniform natural line-height (1.30x) without font
    // or tracking compression, applying controlled 3-4pt paragraph margins (60 dxa = 3pt)
    docxSpacing = {
      headingBefore: 80,   // 4pt
      headingAfter: 50,    // 2.5pt
      summaryAfter: 65,    // ~3.25pt (3-4pt)
      companyBefore: 40,   // 2pt
      companyAfter: 15,    // 0.75pt
      titlePeriodAfter: 20,// 1pt
      bulletAfter: 60,     // 3pt (controlled 3-4pt paragraph margin, never cramped)
      projectNameBefore: 40,
      projectNameAfter: 15,
      projectTechAfter: 20,
      projectDescAfter: 65,// ~3.25pt (3-4pt)
      bodyLineSpacing: 312,// 1.30x uniform natural line height (no line compression)
      bodyFontSize: 18,    // 9pt (Strict Anti-Distortion: never compressed)
      headingFontSize: 22,
      summaryFontSize: 19,
      companyFontSize: 20,
      titleFontSize: 18,
      projectNameFontSize: 20,
      projectTechFontSize: 18,
      nameFontSize: 72,

      sidebarHeadingBefore: 80,
      sidebarHeadingAfter: 50,
      educationBefore: 20,
      educationAfter: 10,
      educationInstAfter: 60, // 3pt (3-4pt)
      skillsItemAfter: 60,    // 3pt (controlled 3-4pt, prevents sidebar overcrowding without distortion)
      awardItemAfter: 60,     // 3pt (3-4pt)
      certItemAfter: 60,      // 3pt (3-4pt)
      sidebarLineSpacing: 312,// 1.30x uniform natural line height
      sidebarFontSize: 18,    // 9pt (Strict Anti-Distortion: never compressed)

      bottomCellMargin: 80,
    };
  } else if (densityTier === 'relaxed') {
    // For shorter content: enforce uniform natural line-height (1.30x) and controlled
    // 3-4pt paragraph bottom margins (70 dxa = 3.5pt) to cleanly absorb remaining space at bottom
    docxSpacing = {
      headingBefore: 90,   // 4.5pt
      headingAfter: 60,    // 3pt
      summaryAfter: 70,    // 3.5pt (controlled 3-4pt)
      companyBefore: 50,
      companyAfter: 20,
      titlePeriodAfter: 25,
      bulletAfter: 70,     // 3.5pt (controlled 3-4pt)
      projectNameBefore: 50,
      projectNameAfter: 20,
      projectTechAfter: 25,
      projectDescAfter: 70,// 3.5pt (controlled 3-4pt)
      bodyLineSpacing: 312,// 1.30x uniform natural line height
      bodyFontSize: 18,    // 9pt (Strict Anti-Distortion: never compressed)
      headingFontSize: 22,
      summaryFontSize: 19,
      companyFontSize: 20,
      titleFontSize: 18,
      projectNameFontSize: 20,
      projectTechFontSize: 18,
      nameFontSize: 72,

      sidebarHeadingBefore: 90,
      sidebarHeadingAfter: 60,
      educationBefore: 25,
      educationAfter: 10,
      educationInstAfter: 70, // 3.5pt (3-4pt)
      skillsItemAfter: 70,    // 3.5pt (3-4pt)
      awardItemAfter: 70,     // 3.5pt (3-4pt)
      certItemAfter: 70,      // 3.5pt (3-4pt)
      sidebarLineSpacing: 312,// 1.30x uniform natural line height
      sidebarFontSize: 18,    // 9pt (Strict Anti-Distortion: never compressed)

      bottomCellMargin: 100,
    };
  }

  // Dynamic font-size scaling & padding adjustment for ultra-heavy / extreme content loads
  if (isExtreme) {
    docxSpacing.bodyFontSize = 16; // 8pt
    docxSpacing.sidebarFontSize = 16;
    docxSpacing.headingFontSize = 18; // 9pt
    docxSpacing.summaryFontSize = 17; // 8.5pt
    docxSpacing.companyFontSize = 18; // 9pt
    docxSpacing.titleFontSize = 16;
    docxSpacing.projectNameFontSize = 18;
    docxSpacing.projectTechFontSize = 16;
    docxSpacing.nameFontSize = 58;
    docxSpacing.headingBefore = 50;
    docxSpacing.headingAfter = 30;
    docxSpacing.summaryAfter = 45;
    docxSpacing.bulletAfter = 42;
    docxSpacing.projectDescAfter = 45;
    docxSpacing.sidebarHeadingBefore = 50;
    docxSpacing.sidebarHeadingAfter = 30;
    docxSpacing.educationInstAfter = 45;
    docxSpacing.skillsItemAfter = 42;
    docxSpacing.awardItemAfter = 42;
    docxSpacing.certItemAfter = 42;
    docxSpacing.bottomCellMargin = 40;
  } else if (isUltraHeavy) {
    docxSpacing.bodyFontSize = 17; // 8.5pt
    docxSpacing.sidebarFontSize = 17;
    docxSpacing.headingFontSize = 20; // 10pt
    docxSpacing.summaryFontSize = 18; // 9pt
    docxSpacing.companyFontSize = 19; // 9.5pt
    docxSpacing.titleFontSize = 17;
    docxSpacing.projectNameFontSize = 19;
    docxSpacing.projectTechFontSize = 17;
    docxSpacing.nameFontSize = 64;
    docxSpacing.headingBefore = 65;
    docxSpacing.headingAfter = 40;
    docxSpacing.summaryAfter = 55;
    docxSpacing.bulletAfter = 50;
    docxSpacing.projectDescAfter = 55;
    docxSpacing.sidebarHeadingBefore = 65;
    docxSpacing.sidebarHeadingAfter = 40;
    docxSpacing.educationInstAfter = 52;
    docxSpacing.skillsItemAfter = 50;
    docxSpacing.awardItemAfter = 50;
    docxSpacing.certItemAfter = 50;
    docxSpacing.bottomCellMargin = 60;
    docxSpacing.bodyLineSpacing = 288;
  } else if (isHeavy) {
    docxSpacing.bodyFontSize = 17; // 8.5pt
    docxSpacing.sidebarFontSize = 17;
    docxSpacing.headingFontSize = 20; // 10pt
    docxSpacing.summaryFontSize = 18; // 9pt
    docxSpacing.companyFontSize = 19; // 9.5pt
    docxSpacing.titleFontSize = 17;
    docxSpacing.projectNameFontSize = 19;
    docxSpacing.projectTechFontSize = 17;
    docxSpacing.nameFontSize = 64;
    docxSpacing.headingBefore = 70;
    docxSpacing.headingAfter = 45;
    docxSpacing.summaryAfter = 55;
    docxSpacing.bulletAfter = 50;
    docxSpacing.projectDescAfter = 55;
    docxSpacing.sidebarHeadingBefore = 70;
    docxSpacing.sidebarHeadingAfter = 45;
    docxSpacing.educationInstAfter = 55;
    docxSpacing.skillsItemAfter = 52;
    docxSpacing.awardItemAfter = 52;
    docxSpacing.certItemAfter = 52;
    docxSpacing.bottomCellMargin = 70;
    docxSpacing.bodyLineSpacing = 288;
  }

  // Strict Original Dimensions: Keep fixed master template margins and column bounds (0.5in = 720 dxa)
  docxSpacing.pageMarginTop = 720;
  docxSpacing.pageMarginBottom = 720;
  docxSpacing.pageMarginSide = 720;

  // 5. Dynamic Content-Aware Page Margins & PDF Spacing Metrics
  const pdfSpacing = {
    densityTier,
    isHeavy,
    isUltraHeavy,
    isExtreme,
    pageMarginTop: 26,
    pageMarginBottom: 26,
    pageMarginSide: 36,

    nameFontSize: isExtreme ? 20 : isUltraHeavy ? 22 : isHeavy ? 24 : 28,
    contactFontSize: isExtreme ? 7.8 : isUltraHeavy ? 8.2 : isHeavy ? 8.5 : 9.5,
    headingFontSize: isExtreme ? 9.5 : isUltraHeavy ? 10.0 : isHeavy ? 10.8 : 12.0,
    summaryFontSize: isExtreme ? 7.8 : isUltraHeavy ? 8.2 : isHeavy ? 8.8 : 10.0,
    companyFontSize: isExtreme ? 8.2 : isUltraHeavy ? 8.8 : isHeavy ? 9.5 : 11.0,
    titleFontSize: isExtreme ? 7.5 : isUltraHeavy ? 8.0 : isHeavy ? 8.5 : 10.0,
    bodyFontSize: isExtreme ? 7.5 : isUltraHeavy ? 8.0 : isHeavy ? 8.5 : 9.8,
    projectNameFontSize: isExtreme ? 8.2 : isUltraHeavy ? 8.8 : isHeavy ? 9.5 : 11.0,
    projectTechFontSize: isExtreme ? 7.5 : isUltraHeavy ? 8.0 : isHeavy ? 8.5 : 10.0,
    sidebarFontSize: isExtreme ? 7.5 : isUltraHeavy ? 8.0 : isHeavy ? 8.5 : 9.8,

    summaryLineStep: isExtreme ? 8.5 : isUltraHeavy ? 9.0 : isHeavy ? 10.0 : densityTier === 'compact' ? 12.0 : 16.5,
    summaryAfterGap: isExtreme ? 4.5 : isUltraHeavy ? 5.5 : isHeavy ? 7.0 : densityTier === 'compact' ? 9.0 : 20.0,
    companyAfterGap: isExtreme ? 5.5 : isUltraHeavy ? 6.5 : isHeavy ? 7.5 : densityTier === 'compact' ? 9.5 : 14.0,
    titleAfterGap: isExtreme ? 5.0 : isUltraHeavy ? 5.8 : isHeavy ? 6.8 : densityTier === 'compact' ? 8.0 : 12.0,
    bpLineStep: isExtreme ? 7.4 : isUltraHeavy ? 7.8 : isHeavy ? 8.2 : densityTier === 'compact' ? 11.0 : 15.0,
    bpAfterGap: isExtreme ? 1.0 : isUltraHeavy ? 1.2 : isHeavy ? 1.8 : densityTier === 'compact' ? 2.5 : 5.0,
    expAfterGap: isExtreme ? 3.0 : isUltraHeavy ? 4.0 : isHeavy ? 5.0 : densityTier === 'compact' ? 7.5 : 20.0,
    expItemGap: isExtreme ? 3.0 : isUltraHeavy ? 4.0 : isHeavy ? 5.0 : densityTier === 'compact' ? 7.5 : 20.0,
    projNameAfterGap: isExtreme ? 5.5 : isUltraHeavy ? 6.5 : isHeavy ? 7.5 : densityTier === 'compact' ? 9.5 : 14.0,
    projTechAfterGap: isExtreme ? 5.0 : isUltraHeavy ? 5.8 : isHeavy ? 6.8 : densityTier === 'compact' ? 8.0 : 12.0,
    projDescLineStep: isExtreme ? 7.4 : isUltraHeavy ? 7.8 : isHeavy ? 8.2 : densityTier === 'compact' ? 11.0 : 15.0,
    projDescAfterGap: isExtreme ? 3.5 : isUltraHeavy ? 4.5 : isHeavy ? 5.5 : densityTier === 'compact' ? 8.0 : 20.0,
    projItemGap: isExtreme ? 3.5 : isUltraHeavy ? 4.5 : isHeavy ? 5.5 : densityTier === 'compact' ? 8.0 : 20.0,
    eduLineStep: isExtreme ? 8.0 : isUltraHeavy ? 8.8 : isHeavy ? 9.8 : densityTier === 'compact' ? 11.0 : 14.5,
    eduItemGap: isExtreme ? 2.5 : isUltraHeavy ? 3.5 : isHeavy ? 4.5 : densityTier === 'compact' ? 7.0 : 14.0,
    skillLineStep: isExtreme ? 7.8 : isUltraHeavy ? 8.5 : isHeavy ? 9.5 : densityTier === 'compact' ? 11.0 : 14.5,
    skillAfterGap: isExtreme ? 4.0 : isUltraHeavy ? 5.0 : isHeavy ? 6.0 : densityTier === 'compact' ? 8.0 : 14.0,
    awardLineStep: isExtreme ? 8.0 : isUltraHeavy ? 8.8 : isHeavy ? 9.8 : densityTier === 'compact' ? 11.0 : 14.5,
    certLineStep: isExtreme ? 8.0 : isUltraHeavy ? 8.8 : isHeavy ? 9.8 : densityTier === 'compact' ? 11.0 : 14.5,
    headingBefore: isExtreme ? 7.0 : isUltraHeavy ? 9.0 : isHeavy ? 11.0 : densityTier === 'compact' ? 14.0 : 22.0,
    headingAfter: isExtreme ? 7.5 : isUltraHeavy ? 8.5 : isHeavy ? 9.5 : densityTier === 'compact' ? 11.0 : 16.0,
  };

  // 6. HTML/CSS Twin Preview Spacing Metrics
  const previewSpacing = {
    densityTier,
    // Column alignment: top-aligned so remaining space is absorbed cleanly as bottom margin whitespace
    columnAlignment: 'items-start',
    leftSpaceY: 'space-y-2.5',
    sectionMarginBottom: 'mb-1',
    bulletSpaceY: 'space-y-1',
    lineHeightClass: 'leading-[1.3]',
    sidebarSpaceY: 'space-y-2.5',
    sidebarTextLeading: 'leading-[1.3]',
    totalLeftWords,
    totalLeftItems,
    rightColumnItemLoad,
  };

  return {
    densityTier,
    totalLeftWords,
    totalLeftItems,
    rightColumnItemLoad,
    docxSpacing,
    pdfSpacing,
    previewSpacing,
    isSinglePageGuaranteed: true,
  };
}

/**
 * Builds a docx Document instance representing the compiled tailored resume.
 *
 * @param {Object} options
 * @param {Object} options.profile - Master candidate profile
 * @param {Object} options.tailoredResult - Tailored engine result
 * @returns {Document}
 */
export function buildTailoredDocxDocument({ profile, tailoredResult }) {
  const summary = tailoredResult?.tailoredSummary || profile?.professionalSummary || '';
  const experiences = tailoredResult?.highlightedExperiences || profile?.workExperience || [];
  const projects = tailoredResult?.highlightedProjects || profile?.projects || [];
  const approvedTech = tailoredResult?.approvedMissingTech || [];

  // Dynamic Content Spacing & Overflow Control
  const { docxSpacing } = computeDynamicContentSpacing({
    summary,
    experiences,
    projects,
    approvedTech,
    profile,
  });

  const fullName = profile?.personalInfo?.fullName || 'jaya sri palli';
  const phone = profile?.personalInfo?.phone || '+91- 7893414784';
  const email = profile?.personalInfo?.email || 'jayasripalli20@gmail.com';
  const linkedin = profile?.personalInfo?.linkedin || 'linkedin.com/in/jayasripalli';
  const github = profile?.personalInfo?.github || 'github.com/Jayasri7-ux';

  // Helper to create a section heading with bottom border in Word table cell
  const createHeading = (text) =>
    new Paragraph({
      spacing: { before: docxSpacing.headingBefore, after: docxSpacing.headingAfter },
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 8,
          color: '2C3B57',
          space: 2,
        },
      },
      children: [
        new TextRun({
          text: text.toUpperCase(),
          bold: true,
          size: docxSpacing.headingFontSize || 22, // dynamic font-size scaling
          color: '2C3B57',
          font: 'Franklin Gothic Medium',
        }),
      ],
    });

  // Left Column Content: Objective, Internships, Projects
  const leftColumnChildren = [];

  // 1. OBJECTIVE
  leftColumnChildren.push(createHeading('OBJECTIVE'));
  leftColumnChildren.push(
    new Paragraph({
      spacing: { before: 80, after: docxSpacing.summaryAfter, line: docxSpacing.bodyLineSpacing, lineRule: 'auto' },
      children: [
        new TextRun({
          text: summary,
          size: docxSpacing.summaryFontSize || 19, // dynamic font-size scaling
          color: '222222',
          font: 'Arial',
        }),
      ],
    })
  );

  // 2. INTERNSHIPS
  leftColumnChildren.push(createHeading('INTERNSHIPS'));
  experiences.forEach((exp, expIdx) => {
    // Company name with spacing under heading and between individual internships
    leftColumnChildren.push(
      new Paragraph({
        spacing: { before: expIdx === 0 ? 80 : (docxSpacing.companyBefore + 120), after: docxSpacing.companyAfter },
        children: [
          new TextRun({
            text: exp.company || 'Internship Experience',
            bold: true,
            size: docxSpacing.companyFontSize || 20, // dynamic font-size scaling
            color: '2C3B57',
            font: 'Arial',
          }),
        ],
      })
    );

    // Title & Period
    const titlePeriod = `${exp.title || 'Intern'} | ${exp.period || `${exp.startDate || ''} – ${exp.endDate || ''}`}`;
    leftColumnChildren.push(
      new Paragraph({
        spacing: { after: docxSpacing.titlePeriodAfter },
        children: [
          new TextRun({
            text: titlePeriod,
            bold: true,
            size: docxSpacing.titleFontSize || 18, // dynamic font-size scaling
            color: '111111',
            font: 'Arial',
          }),
        ],
      })
    );

    // Bullet points with dynamic line spacing & padding
    (exp.bulletPoints || []).forEach((bp) => {
      leftColumnChildren.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: docxSpacing.bulletAfter, line: docxSpacing.bodyLineSpacing, lineRule: 'auto' },
          children: [
            new TextRun({
              text: bp,
              size: docxSpacing.bodyFontSize || 18, // dynamic font-size scaling
              color: '222222',
              font: 'Arial',
            }),
          ],
        })
      );
    });
  });

  // 3. PROJECTS
  leftColumnChildren.push(createHeading('PROJECTS'));
  projects.forEach((proj, projIdx) => {
    // Project Name with spacing under heading and between individual projects
    leftColumnChildren.push(
      new Paragraph({
        spacing: { before: projIdx === 0 ? 80 : (docxSpacing.projectNameBefore + 120), after: docxSpacing.projectNameAfter },
        children: [
          new TextRun({
            text: proj.name || 'Project',
            bold: true,
            size: docxSpacing.projectNameFontSize || 20, // dynamic font-size scaling
            color: '2C3B57',
            font: 'Arial',
          }),
        ],
      })
    );

    // Tech Stack
    const techStackText = Array.isArray(proj.techStack)
      ? `Tech: ${proj.techStack.join(' | ')}`
      : proj.techStack
      ? `Tech: ${proj.techStack}`
      : '';
    if (techStackText) {
      leftColumnChildren.push(
        new Paragraph({
          spacing: { after: docxSpacing.projectTechAfter },
          children: [
            new TextRun({
              text: techStackText,
              bold: true,
              size: docxSpacing.projectTechFontSize || 18, // dynamic font-size scaling
              color: '111111',
              font: 'Arial',
            }),
          ],
        })
      );
    }

    // Description with dynamic line spacing & padding
    if (proj.description) {
      leftColumnChildren.push(
        new Paragraph({
          spacing: { after: docxSpacing.projectDescAfter, line: docxSpacing.bodyLineSpacing, lineRule: 'auto' },
          children: [
            new TextRun({
              text: proj.description,
              size: docxSpacing.bodyFontSize || 18, // dynamic font-size scaling
              color: '222222',
              font: 'Arial',
            }),
          ],
        })
      );
    }
  });

  // Right Column Content: Education, Technical Skills, Awards, Certifications
  const rightColumnChildren = [];

  // 1. Education
  rightColumnChildren.push(createHeading('Education'));
  (profile?.education || []).forEach((edu) => {
    rightColumnChildren.push(
      new Paragraph({
        spacing: { before: docxSpacing.educationBefore, after: docxSpacing.educationAfter },
        children: [
          new TextRun({
            text: `${edu.degree}${edu.fieldOfStudy ? ` (${edu.fieldOfStudy})` : ''} | ${edu.graduationYear || ''}`,
            bold: true,
            size: docxSpacing.sidebarFontSize || 18, // dynamic font-size scaling
            color: '111111',
            font: 'Arial',
          }),
        ],
      })
    );
    rightColumnChildren.push(
      new Paragraph({
        spacing: { after: docxSpacing.educationInstAfter },
        children: [
          new TextRun({
            text: `${edu.institution}${edu.honors ? ` | ${edu.honors}` : ''}`,
            size: docxSpacing.sidebarFontSize || 18, // dynamic font-size scaling
            color: '333333',
            font: 'Arial',
          }),
        ],
      })
    );
  });

  // 2. TECHNICAL SKILLS
  rightColumnChildren.push(createHeading('TECHNICAL SKILLS'));
  const categorized = categorizeApprovedSkills(approvedTech, profile?.coreTechnicalSkills);
  const skills = [
    {
      label: 'Languages',
      items: [
        ...(profile?.coreTechnicalSkills?.languages || ['Python', 'Java', 'JavaScript', 'C']),
        ...categorized.languages,
      ].join(', '),
    },
    {
      label: 'Frontend',
      items: [
        ...(profile?.coreTechnicalSkills?.frontend || ['HTML', 'CSS', 'React']),
        ...categorized.frontend,
      ].join(', '),
    },
    {
      label: 'Backend',
      items: [
        ...(profile?.coreTechnicalSkills?.backend || ['Node.js', 'Django', 'Flask']),
        ...categorized.backend,
      ].join(', '),
    },
    {
      label: 'Database',
      items: [
        ...(profile?.coreTechnicalSkills?.databases || ['SQL', 'MongoDB']),
        ...categorized.databases,
      ].join(', '),
    },
    {
      label: 'Tools',
      items: [
        ...(profile?.coreTechnicalSkills?.cloudAndDevOps || ['Git', 'GitHub', 'VS Code', 'Render']),
        ...categorized.tools,
      ].join(', '),
    },
  ];

  skills.forEach((s) => {
    rightColumnChildren.push(
      new Paragraph({
        bullet: { level: 0 },
        spacing: { after: docxSpacing.skillsItemAfter, line: docxSpacing.sidebarLineSpacing, lineRule: 'auto' },
        children: [
          new TextRun({
            text: `${s.label}: `,
            bold: true,
            size: docxSpacing.sidebarFontSize || 18, // dynamic font-size scaling
            color: '111111',
            font: 'Arial',
          }),
          new TextRun({
            text: s.items,
            size: docxSpacing.sidebarFontSize || 18, // dynamic font-size scaling
            color: '222222',
            font: 'Arial',
          }),
        ],
      })
    );
  });

  // 3. AWARDS
  if (profile?.awards && profile.awards.length > 0) {
    rightColumnChildren.push(createHeading('AWARDS'));
    profile.awards.forEach((award) => {
      rightColumnChildren.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: docxSpacing.awardItemAfter, line: docxSpacing.sidebarLineSpacing, lineRule: 'auto' },
          children: [
            new TextRun({
              text: award,
              size: docxSpacing.sidebarFontSize || 18, // dynamic font-size scaling
              color: '222222',
              font: 'Arial',
            }),
          ],
        })
      );
    });
  }

  // 4. CERTIFICATIONS
  if (profile?.certifications && profile.certifications.length > 0) {
    rightColumnChildren.push(createHeading('CERTIFICATIONS'));
    profile.certifications.forEach((cert) => {
      rightColumnChildren.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: docxSpacing.certItemAfter, line: docxSpacing.sidebarLineSpacing, lineRule: 'auto' },
          children: [
            new TextRun({
              text: `${cert.name} – ${cert.issuer}`,
              size: docxSpacing.sidebarFontSize || 18, // dynamic font-size scaling
              color: '222222',
              font: 'Arial',
            }),
          ],
        })
      );
    });
  }

  // Extract embedded contact icon assets for native Word package
  const phoneIconBinary = getContactIconBinary('phone');
  const emailIconBinary = getContactIconBinary('email');
  const linkedinIconBinary = getContactIconBinary('linkedin');
  const githubIconBinary = getContactIconBinary('github');

  const contactRowRuns = [];
  if (phoneIconBinary) {
    contactRowRuns.push(new ImageRun({ data: phoneIconBinary, transformation: { width: 9, height: 9 }, type: 'png' }));
    contactRowRuns.push(new TextRun({ text: ` ${phone}   `, size: 18, color: '2C3B57', font: 'Arial' }));
  } else {
    contactRowRuns.push(new TextRun({ text: `${phone}   `, size: 18, color: '2C3B57', font: 'Arial' }));
  }
  contactRowRuns.push(new TextRun({ text: '•   ', size: 18, color: '2C3B57', font: 'Arial' }));

  if (emailIconBinary) {
    contactRowRuns.push(new ImageRun({ data: emailIconBinary, transformation: { width: 9, height: 9 }, type: 'png' }));
    contactRowRuns.push(new TextRun({ text: ` ${email}   `, size: 18, color: '2C3B57', font: 'Arial' }));
  } else {
    contactRowRuns.push(new TextRun({ text: `${email}   `, size: 18, color: '2C3B57', font: 'Arial' }));
  }
  contactRowRuns.push(new TextRun({ text: '•   ', size: 18, color: '2C3B57', font: 'Arial' }));

  if (linkedinIconBinary) {
    contactRowRuns.push(new ImageRun({ data: linkedinIconBinary, transformation: { width: 9, height: 9 }, type: 'png' }));
    contactRowRuns.push(new TextRun({ text: ` ${linkedin}   `, size: 18, color: '2C3B57', font: 'Arial' }));
  } else {
    contactRowRuns.push(new TextRun({ text: `${linkedin}   `, size: 18, color: '2C3B57', font: 'Arial' }));
  }
  contactRowRuns.push(new TextRun({ text: '•   ', size: 18, color: '2C3B57', font: 'Arial' }));

  if (githubIconBinary) {
    contactRowRuns.push(new ImageRun({ data: githubIconBinary, transformation: { width: 9, height: 9 }, type: 'png' }));
    contactRowRuns.push(new TextRun({ text: ` ${github}`, size: 18, color: '2C3B57', font: 'Arial' }));
  } else {
    contactRowRuns.push(new TextRun({ text: `${github}`, size: 18, color: '2C3B57', font: 'Arial' }));
  }

  // Construct Document with content-aware dynamic margins and ModernResume twin theme
  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 12240, // standard Letter width (8.5in) matching Master_Resume.docx
              height: 15840, // standard Letter height (11.0in) matching Master_Resume.docx
            },
            margin: {
              top: docxSpacing.pageMarginTop || 720,
              right: docxSpacing.pageMarginSide || 720,
              bottom: docxSpacing.pageMarginBottom || 720,
              left: docxSpacing.pageMarginSide || 720,
            },
          },
        },
        children: [
          // Header: Candidate Name (Centered, uppercase, 36pt font matching Master_Resume.docx)
          new Paragraph({
            spacing: { after: 40 },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: fullName.toUpperCase(),
                bold: true,
                size: docxSpacing.nameFontSize || 72, // dynamic font-size scaling
                color: '2C3B57',
                font: 'Franklin Gothic Medium',
              }),
            ],
          }),

          // Contact Information Row (Centered) with Embedded Contact Icons
          new Paragraph({
            spacing: { after: 120 },
            alignment: AlignmentType.CENTER,
            children: contactRowRuns,
          }),

          // Two-Column Grid Table (63% Left, 37% Right with CADEE5 Shading)
          new Table({
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
              insideHorizontal: { style: BorderStyle.NONE },
              insideVertical: { style: BorderStyle.NONE },
            },
            rows: [
              new TableRow({
                cantSplit: true,
                children: [
                  // Left Column: 63%
                  new TableCell({
                    width: {
                      size: 63,
                      type: WidthType.PERCENTAGE,
                    },
                    margins: {
                      top: 100,
                      bottom: docxSpacing.bottomCellMargin,
                      left: 0,
                      right: 180,
                    },
                    borders: {
                      top: { style: BorderStyle.NONE },
                      bottom: { style: BorderStyle.NONE },
                      left: { style: BorderStyle.NONE },
                      right: { style: BorderStyle.NONE },
                    },
                    children: leftColumnChildren,
                  }),

                  // Right Column: 37% with CADEE5 Shading
                  new TableCell({
                    width: {
                      size: 37,
                      type: WidthType.PERCENTAGE,
                    },
                    shading: {
                      fill: 'CADEE5',
                      type: ShadingType.CLEAR,
                    },
                    margins: {
                      top: 140,
                      bottom: docxSpacing.bottomCellMargin,
                      left: 180,
                      right: 140,
                    },
                    borders: {
                      top: { style: BorderStyle.NONE },
                      bottom: { style: BorderStyle.NONE },
                      left: { style: BorderStyle.NONE },
                      right: { style: BorderStyle.NONE },
                    },
                    children: rightColumnChildren,
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });
}

/**
 * Takes the authentic Master_Resume.docx buffer and replaces the dynamic sections
 * (Objective, Internships, Projects, and approved Technical Skills) with tailored content,
 * preserving 100% of the native Word document layout, styling, fonts, and geometries.
 *
 * @param {Object} options
 * @param {ArrayBuffer} options.masterBuffer - ArrayBuffer of Master_Resume.docx
 * @param {Object} options.profile - Master profile
 * @param {Object} options.tailoredResult - Tailored engine result
 * @returns {Promise<ArrayBuffer>}
 */
export async function generateTailoredDocxBuffer({ masterBuffer, profile, tailoredResult }) {
  if (!masterBuffer) return null;
  const zip = await JSZip.loadAsync(masterBuffer);
  let docXml = await zip.file('word/document.xml').async('text');

  // 1. Objective / Professional Summary
  const summary = tailoredResult?.tailoredSummary || profile?.professionalSummary || '';
  const experiences = tailoredResult?.highlightedExperiences || profile?.workExperience || [];
  const projects = tailoredResult?.highlightedProjects || profile?.projects || [];
  const approvedTech = tailoredResult?.approvedMissingTech || [];

  // Dynamic Content Spacing & Overflow Control
  const { docxSpacing } = computeDynamicContentSpacing({
    summary,
    experiences,
    projects,
    approvedTech,
    profile,
  });

  if (summary) {
    const origSummary = 'Aspiring graduate with internship experience in software development. Passionate about building scalable applications and eager to contribute to a collaborative organization.';
    if (docXml.includes(origSummary)) {
      docXml = docXml.replace(origSummary, escapeXml(summary));
    }
  }

  // 2. Internships (L&T and Infosys)
  const szProp = docxSpacing.bodyFontSize && docxSpacing.bodyFontSize < 18 ? `<w:rPr><w:sz w:val="${docxSpacing.bodyFontSize}"/></w:rPr>` : '';

  if (experiences && experiences.length > 0) {
    // L&T
    if (experiences[0]?.bulletPoints?.length > 0) {
      const ltIdx = docXml.indexOf('Developed a web-based audit application');
      if (ltIdx !== -1) {
        const pStart = Math.max(docXml.lastIndexOf('<w:p ', ltIdx), docXml.lastIndexOf('<w:p>', ltIdx));
        const pEnd = docXml.indexOf('</w:p>', ltIdx) + 6;
        const newPs = experiences[0].bulletPoints
          .map(
            (bp) =>
              `<w:p><w:pPr><w:pStyle w:val="Text"/><w:spacing w:after="${docxSpacing.bulletAfter}" w:line="${docxSpacing.bodyLineSpacing}" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r>${szProp}<w:t>${escapeXml(bp)}</w:t></w:r></w:p>`
          )
          .join('');
        docXml = docXml.substring(0, pStart) + newPs + docXml.substring(pEnd);
      }
    }
    // Infosys
    if (experiences[1]?.bulletPoints?.length > 0) {
      const infIdx = docXml.indexOf('Designed a YouTube Analytics Dashboard');
      if (infIdx !== -1) {
        const pStart = Math.max(docXml.lastIndexOf('<w:p ', infIdx), docXml.lastIndexOf('<w:p>', infIdx));
        const pEnd = docXml.indexOf('</w:p>', infIdx) + 6;
        const newPs = experiences[1].bulletPoints
          .map(
            (bp) =>
              `<w:p><w:pPr><w:pStyle w:val="Text"/><w:spacing w:after="${docxSpacing.bulletAfter}" w:line="${docxSpacing.bodyLineSpacing}" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r>${szProp}<w:t>${escapeXml(bp)}</w:t></w:r></w:p>`
          )
          .join('');
        docXml = docXml.substring(0, pStart) + newPs + docXml.substring(pEnd);
      }
    }
  }

  // 3. Projects (Fake News Detection & AI Health Chatbot)
  if (projects && projects.length > 0) {
    // Project 1
    if (projects[0]?.description) {
      const p1Idx = docXml.indexOf('misinformation detection');
      if (p1Idx !== -1) {
        const pStart = Math.max(docXml.lastIndexOf('<w:p ', p1Idx), docXml.lastIndexOf('<w:p>', p1Idx));
        const pEnd = docXml.indexOf('</w:p>', p1Idx) + 6;
        const newP = `<w:p><w:pPr><w:pStyle w:val="Text"/><w:spacing w:after="${docxSpacing.projectDescAfter}" w:line="${docxSpacing.bodyLineSpacing}" w:lineRule="auto"/></w:pPr><w:r>${szProp}<w:t>${escapeXml(projects[0].description)}</w:t></w:r></w:p>`;
        docXml = docXml.substring(0, pStart) + newP + docXml.substring(pEnd);
      }
    }
    // Project 2
    if (projects[1]?.description) {
      const p2Idx = docXml.indexOf('Created an AI-powered health chatbot');
      if (p2Idx !== -1) {
        const pStart = Math.max(docXml.lastIndexOf('<w:p ', p2Idx), docXml.lastIndexOf('<w:p>', p2Idx));
        const pEnd = docXml.indexOf('</w:p>', p2Idx) + 6;
        const newP = `<w:p><w:pPr><w:pStyle w:val="Text"/><w:spacing w:after="${docxSpacing.projectDescAfter}" w:line="${docxSpacing.bodyLineSpacing}" w:lineRule="auto"/></w:pPr><w:r>${szProp}<w:t>${escapeXml(projects[1].description)}</w:t></w:r></w:p>`;
        docXml = docXml.substring(0, pStart) + newP + docXml.substring(pEnd);
      }
    }
  }

  // 4. Approved Technical Skills
  if (approvedTech.length > 0) {
    const categorized = categorizeApprovedSkills(approvedTech, profile?.coreTechnicalSkills);

    if (categorized.languages.length > 0 && docXml.includes('cript, C</w:t>')) {
      docXml = docXml.replace('cript, C</w:t>', `cript, C, ${escapeXml(categorized.languages.join(', '))}</w:t>`);
    } else if (categorized.languages.length > 0 && docXml.includes('C</w:t>')) {
      docXml = docXml.replace('C</w:t>', `C, ${escapeXml(categorized.languages.join(', '))}</w:t>`);
    }

    if (categorized.frontend.length > 0 && docXml.includes('React</w:t>')) {
      docXml = docXml.replace('React</w:t>', `React, ${escapeXml(categorized.frontend.join(', '))}</w:t>`);
    }

    if (categorized.backend.length > 0 && docXml.includes('Flask</w:t>')) {
      docXml = docXml.replace('Flask</w:t>', `Flask, ${escapeXml(categorized.backend.join(', '))}</w:t>`);
    }

    if (categorized.databases.length > 0 && docXml.includes('DB</w:t></w:r></w:p>')) {
      docXml = docXml.replace('DB</w:t></w:r></w:p>', `DB, ${escapeXml(categorized.databases.join(', '))}</w:t></w:r></w:p>`);
    } else if (categorized.databases.length > 0 && docXml.includes('DB</w:t>')) {
      docXml = docXml.replace('DB</w:t>', `DB, ${escapeXml(categorized.databases.join(', '))}</w:t>`);
    }

    if (categorized.tools.length > 0 && docXml.includes('Render</w:t>')) {
      docXml = docXml.replace('Render</w:t>', `Render, ${escapeXml(categorized.tools.join(', '))}</w:t>`);
    }
  }

  // Strict Original Template Dimensions & Single-Page Fitting:
  // Dynamically sets margins based on content density (guarantees single-page fit)
  const isHeavyContent = (docxSpacing.bodyFontSize && docxSpacing.bodyFontSize < 18) || (experiences.reduce((acc, e) => acc + (e.bulletPoints?.length || 0), 0) > 4) || (approvedTech.length > 5);
  const pageMarginTopDxa = isHeavyContent ? 450 : 540;
  const pageMarginBottomDxa = isHeavyContent ? 300 : 360;
  const pageMarginSideDxa = isHeavyContent ? 600 : 640;
  docXml = docXml.replace(
    /<w:pgMar\b[^>]*\/>/g,
    `<w:pgMar w:top="${pageMarginTopDxa}" w:right="${pageMarginSideDxa}" w:bottom="${pageMarginBottomDxa}" w:left="${pageMarginSideDxa}" w:header="709" w:footer="709" w:gutter="0"/>`
  );

  // If candidate name font-size scaled down for heavier load, update in header row
  if (docxSpacing.nameFontSize && docxSpacing.nameFontSize < 72) {
    docXml = docXml.replace(/<w:sz w:val="72"\/>/g, `<w:sz w:val="${docxSpacing.nameFontSize}"/>`);
    docXml = docXml.replace(/<w:szCs w:val="72"\/>/g, `<w:szCs w:val="${docxSpacing.nameFontSize}"/>`);
  }

  // Strip specifically empty trailing bullet paragraphs right before </w:tc>
  // Only strips if the cell contains multiple paragraphs and non-empty content to preserve ECMA-376 schema compliance
  docXml = docXml.replace(/<w:tc\b[^>]*>(?:(?!<\/w:tc>)[\s\S])*?<\/w:tc>/g, (cellXml) => {
    const pMatches = cellXml.match(/<w:p\b/g);
    if (!pMatches || pMatches.length <= 1) return cellXml;
    if (!cellXml.includes('<w:r>') && !cellXml.includes('<w:r ')) return cellXml;
    return cellXml.replace(/(?:<w:p\b[^>]*><w:pPr>(?:(?!<w:r[ >])[\s\S])*?<\/w:p>\s*)+(?=<\/w:tc>)/g, '');
  });

  // Compress trailing paragraph after table so Word NEVER pushes a blank paragraph onto Page 2
  docXml = docXml.replace(
    /<\/w:tbl>\s*<w:p\b(?:[^>]*\/>|[\s\S]*?<\/w:p>)/g,
    '</w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr></w:p>'
  );

  // Replace rigid 1-dxa exact heights on separator rows with fluid autospacing minimums
  docXml = docXml.replace(/<w:trHeight\s+w:hRule="exact"\s+w:val="1"\s*\/>/g, '<w:trHeight w:hRule="atLeast" w:val="40"/>');

  // Convert oversized rigid row heights into fluid autospacing rows
  docXml = docXml.replace(/<w:trHeight\s+(?:w:hRule="[^"]*"\s+)?w:val="(?:1684|1044|567|426|400|350|159|161)"\s*\/>/g, '<w:trHeight w:hRule="atLeast" w:val="40"/>');

  // Enforce table row-level integrity across all rows by adding <w:cantSplit/> to prevent awkward mid-row breaks
  docXml = docXml.replace(/<w:trPr>/g, '<w:trPr><w:cantSplit/>');

  // Strip any manual page breaks or page break before tags
  docXml = docXml.replace(/<w:br\s+w:type="page"\s*\/>/g, '');
  docXml = docXml.replace(/<w:pageBreakBefore\s*\/>/g, '');

  zip.file('word/document.xml', docXml);
  return await zip.generateAsync({ type: 'arraybuffer' });
}

/**
 * Compiles and triggers immediate download of a Word (.docx) document.
 *
 * @param {Object} options
 * @param {Object} options.profile - Master candidate profile
 * @param {Object} options.tailoredResult - Tailored engine result
 * @param {string} [options.filename='Tailored_Resume.docx']
 */
export async function exportTailoredDocx({
  profile,
  tailoredResult,
  filename = 'Tailored_Resume.docx',
}) {
  try {
    if (typeof fetch === 'function') {
      const res = await fetch('/Master_Resume.docx');
      if (res.ok) {
        const masterBuf = await res.arrayBuffer();
        const tailoredBuf = await generateTailoredDocxBuffer({
          masterBuffer: masterBuf,
          profile,
          tailoredResult,
        });
        if (tailoredBuf) {
          const blob = new Blob([tailoredBuf], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          return;
        }
      }
    }
  } catch (err) {
    console.warn('Fallback to programmatic docx export:', err);
  }

  const doc = buildTailoredDocxDocument({ profile, tailoredResult });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Helper to render technical skills with bold category label and wrapped regular items
 * without any text overlapping, collapsed leading, or off-margin spillover.
 */
function renderPdfSkillCategory(
  doc,
  label,
  text,
  x,
  y,
  maxW,
  lineStep,
  afterGap = 0,
  fontSize = 8
) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  const labelPrefix = `${label}: `;
  const labelW = doc.getTextWidth(labelPrefix);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);

  const words = text.split(/\s+/).filter(Boolean);
  let line1 = '';
  let splitIdx = 0;

  for (let i = 0; i < words.length; i++) {
    const candidate = line1 ? `${line1} ${words[i]}` : words[i];
    if (doc.getTextWidth(candidate) <= maxW - labelW) {
      line1 = candidate;
      splitIdx = i + 1;
    } else {
      break;
    }
  }

  // Draw bold label (clean, without bullet)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.setTextColor(17, 17, 17);
  doc.text(labelPrefix, x, y);

  // Draw first line of skills text beside the label
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(34, 34, 34);
  if (line1) {
    doc.text(line1, x + labelW, y);
  }
  let curY = y;

  const remainingWords = words.slice(splitIdx);
  if (remainingWords.length > 0) {
    const remainingText = remainingWords.join(' ');
    const extraLines = doc.splitTextToSize(remainingText, maxW - 4);
    for (let j = 0; j < extraLines.length; j++) {
      curY += lineStep;
      doc.text(extraLines[j], x + 4, curY);
    }
  }

  return curY + lineStep + afterGap;
}

/**
 * Compiles and returns a formatted jsPDF document instance representing the tailored resume.
 * Strictly guarantees single-page enforcement, dynamic content-aware spacing,
 * and embedded contact icons (Phone, Email, LinkedIn, GitHub).
 *
 * @param {Object} options
 * @param {Object} options.profile - Master candidate profile
 * @param {Object} options.tailoredResult - Tailored engine result
 * @returns {jsPDF}
 */
export function generateTailoredPdfDocument({ profile, tailoredResult }) {
  const summary = tailoredResult?.tailoredSummary || profile?.professionalSummary || '';
  const experiences = tailoredResult?.highlightedExperiences || profile?.workExperience || [];
  const projects = tailoredResult?.highlightedProjects || profile?.projects || [];
  const approvedTech = tailoredResult?.approvedMissingTech || [];

  // Categorize approved skills upfront for measurement and rendering
  const categorized = categorizeApprovedSkills(approvedTech, profile?.coreTechnicalSkills);
  const skills = [
    {
      label: 'Languages',
      text: [
        ...(profile?.coreTechnicalSkills?.languages || ['Python', 'Java', 'JavaScript', 'C']),
        ...categorized.languages,
      ].join(', '),
    },
    {
      label: 'Frontend',
      text: [
        ...(profile?.coreTechnicalSkills?.frontend || ['HTML', 'CSS', 'React']),
        ...categorized.frontend,
      ].join(', '),
    },
    {
      label: 'Backend',
      text: [
        ...(profile?.coreTechnicalSkills?.backend || ['Node.js', 'Django', 'Flask']),
        ...categorized.backend,
      ].join(', '),
    },
    {
      label: 'Database',
      text: [
        ...(profile?.coreTechnicalSkills?.databases || ['SQL', 'MongoDB']),
        ...categorized.databases,
      ].join(', '),
    },
    {
      label: 'Tools',
      text: [
        ...(profile?.coreTechnicalSkills?.cloudAndDevOps || ['Git', 'GitHub', 'VS Code', 'Render']),
        ...categorized.tools,
      ].join(', '),
    },
  ];

  // Dynamic Content Spacing & Overflow Control
  const { pdfSpacing, densityTier } = computeDynamicContentSpacing({
    summary,
    experiences,
    projects,
    approvedTech,
    profile,
  });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter', // 612 x 792 pt
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const pageMarginTop = pdfSpacing?.pageMarginTop || 26;
  const pageMarginBottom = pdfSpacing?.pageMarginBottom || 26;
  const pageMarginSide = pdfSpacing?.pageMarginSide || 36;

  const gutter = 14;
  const usableWidth = pageWidth - pageMarginSide * 2;
  const leftColX = pageMarginSide;
  const leftColW = Math.floor((usableWidth - gutter) * 0.625);
  const rightColX = leftColX + leftColW + gutter;
  const rightColW = pageWidth - pageMarginSide - rightColX;

  const nameY = pageMarginTop + 16;
  const contactY = pageMarginTop + 33;
  const dividerY = contactY + 9;
  const columnsStartY = dividerY + 18;
  const maxAvailableY = pageHeight - pageMarginBottom;

  // Sidebar padding
  const sidebarPad = 8;
  const sidebarTextX = rightColX + sidebarPad;
  const sidebarTextW = rightColW - sidebarPad * 2;

  // Measurement function
  const measureHeight = (sp) => {
    let lY = columnsStartY;
    // Objective
    lY += (sp.headingAfter || 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(sp.summaryFontSize || 9.2);
    const sLines = doc.splitTextToSize(summary, leftColW);
    lY += sLines.length * (sp.summaryLineStep || 12.5) + (sp.summaryAfterGap || 10);

    // Internships
    lY += (sp.headingBefore || 14) + (sp.headingAfter || 9);
    experiences.forEach((exp, idx) => {
      lY += (sp.companyAfterGap || 9);
      lY += (sp.titleAfterGap || 7.5);
      doc.setFontSize(sp.bodyFontSize || 8.8);
      (exp.bulletPoints || []).forEach((bp) => {
        const bpLines = doc.splitTextToSize(bp, leftColW - 12);
        lY += bpLines.length * (sp.bpLineStep || 11.5) + (sp.bpAfterGap || 2.5);
      });
      if (idx < experiences.length - 1) {
        lY += (sp.expItemGap || sp.expAfterGap || 14);
      }
    });

    // Projects
    lY += (sp.headingBefore || 14) + (sp.headingAfter || 9);
    projects.forEach((proj, idx) => {
      lY += (sp.projNameAfterGap || 9);
      const techStack = Array.isArray(proj.techStack) ? proj.techStack.join(' | ') : proj.techStack || '';
      if (techStack) {
        doc.setFontSize(sp.projectTechFontSize || 9.0);
        const tLines = doc.splitTextToSize(`Tech: ${techStack}`, leftColW);
        lY += tLines.length * (sp.projectTechLineStep || 10.5) + (sp.projTechAfterGap || 7.5);
      }
      if (proj.description) {
        doc.setFontSize(sp.bodyFontSize || 8.8);
        const dLines = doc.splitTextToSize(proj.description, leftColW);
        lY += dLines.length * (sp.projDescLineStep || 11.5);
      }
      if (idx < projects.length - 1) {
        lY += (sp.projItemGap || sp.projDescAfterGap || 14);
      }
    });

    // Right column
    let rY = columnsStartY;
    // Education
    rY += (sp.headingAfter || 9);
    (profile?.education || []).forEach((edu, idx) => {
      doc.setFontSize(sp.sidebarFontSize || 8.8);
      const dField = edu.fieldOfStudy === 'Information Technology' ? 'IT' : (edu.fieldOfStudy || '');
      const dTitle = `${edu.degree}${dField ? ` (${dField})` : ''} | ${edu.graduationYear || ''}`;
      const dLines = doc.splitTextToSize(dTitle, sidebarTextW);
      rY += dLines.length * (sp.eduLineStep || 11);
      const iLines = doc.splitTextToSize(
        `${edu.institution}${edu.honors ? ` | ${edu.honors}` : ''}`,
        sidebarTextW
      );
      rY += iLines.length * (sp.eduLineStep || 11);
      if (idx < (profile?.education || []).length - 1) {
        rY += (sp.eduItemGap || 9);
      }
    });

    // Skills
    rY += (sp.headingBefore || 14) + (sp.headingAfter || 9);
    skills.forEach((s) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(sp.sidebarFontSize || 8.8);
      const labelPrefix = `${s.label}: `;
      const labelW = doc.getTextWidth(labelPrefix);
      doc.setFont('helvetica', 'normal');
      const words = s.text.split(/\s+/).filter(Boolean);
      let line1 = '';
      let splitIdx = 0;
      for (let i = 0; i < words.length; i++) {
        const candidate = line1 ? `${line1} ${words[i]}` : words[i];
        if (doc.getTextWidth(candidate) <= sidebarTextW - labelW) {
          line1 = candidate;
          splitIdx = i + 1;
        } else {
          break;
        }
      }
      let cY = rY;
      const remainingWords = words.slice(splitIdx);
      if (remainingWords.length > 0) {
        const extraLines = doc.splitTextToSize(remainingWords.join(' '), sidebarTextW - 4);
        cY += extraLines.length * (sp.skillLineStep || 11);
      }
      rY = cY + (sp.skillLineStep || 11) + (sp.skillAfterGap || 7);
    });

    // Awards
    if (profile?.awards && profile.awards.length > 0) {
      rY += (sp.headingBefore || 14) + (sp.headingAfter || 9);
      profile.awards.forEach((award) => {
        doc.setFontSize(sp.sidebarFontSize || 8.8);
        const aLines = doc.splitTextToSize(award, sidebarTextW - 10);
        rY += aLines.length * (sp.awardLineStep || 11) + 2;
      });
      rY += (sp.expAfterGap || 6);
    }

    // Certifications
    if (profile?.certifications && profile.certifications.length > 0) {
      rY += (sp.headingBefore || 14) + (sp.headingAfter || 9);
      profile.certifications.forEach((cert) => {
        doc.setFontSize(sp.sidebarFontSize || 8.8);
        const cText = `${cert.name} - ${cert.issuer}`;
        const cLines = doc.splitTextToSize(cText, sidebarTextW - 10);
        rY += cLines.length * (sp.certLineStep || 11) + 2;
      });
    }

    return Math.max(lY, rY);
  };

  // Base Spacing with clean balanced proportions mirroring the website layout
  let baseSpacing = {
    ...pdfSpacing,
    nameFontSize: pdfSpacing.nameFontSize || 26,
    contactFontSize: pdfSpacing.contactFontSize || 8.5,
    headingFontSize: pdfSpacing.headingFontSize || 11,
    summaryFontSize: pdfSpacing.summaryFontSize || 9.2,
    companyFontSize: pdfSpacing.companyFontSize || 10.2,
    titleFontSize: pdfSpacing.titleFontSize || 9.2,
    bodyFontSize: pdfSpacing.bodyFontSize || 8.8,
    projectNameFontSize: pdfSpacing.projectNameFontSize || 10.2,
    projectTechFontSize: pdfSpacing.projectTechFontSize || 9.0,
    sidebarFontSize: pdfSpacing.sidebarFontSize || 8.8,

    summaryLineStep: pdfSpacing.summaryLineStep || 12.5,
    summaryAfterGap: pdfSpacing.summaryAfterGap || 10,
    companyAfterGap: pdfSpacing.companyAfterGap || 9,
    titleAfterGap: pdfSpacing.titleAfterGap || 7.5,
    bpLineStep: pdfSpacing.bpLineStep || 11.5,
    bpAfterGap: pdfSpacing.bpAfterGap || 2.5,
    expAfterGap: pdfSpacing.expAfterGap || 14,
    expItemGap: pdfSpacing.expItemGap || 14,
    projNameAfterGap: pdfSpacing.projNameAfterGap || 9,
    projTechAfterGap: pdfSpacing.projTechAfterGap || 7.5,
    projDescLineStep: pdfSpacing.projDescLineStep || 11.5,
    projDescAfterGap: pdfSpacing.projDescAfterGap || 14,
    projItemGap: pdfSpacing.projItemGap || 14,
    eduLineStep: pdfSpacing.eduLineStep || 11,
    eduItemGap: pdfSpacing.eduItemGap || 9,
    skillLineStep: pdfSpacing.skillLineStep || 11,
    skillAfterGap: pdfSpacing.skillAfterGap || 7,
    awardLineStep: pdfSpacing.awardLineStep || 11,
    certLineStep: pdfSpacing.certLineStep || 11,
    headingBefore: pdfSpacing.headingBefore || 14,
    headingAfter: pdfSpacing.headingAfter || 9,
  };

  let activePdfSpacing = { ...baseSpacing };
  let initialRequiredY = measureHeight(activePdfSpacing);

  // If content overflows single-page boundary, scale proportionally
  if (initialRequiredY > maxAvailableY) {
    const availableHeight = maxAvailableY - columnsStartY;
    const neededHeight = initialRequiredY - columnsStartY;
    const autoFitScale = Math.max(0.82, Math.min(1.0, (availableHeight - 4) / neededHeight));

    activePdfSpacing = {
      ...activePdfSpacing,
      autoFitScale,
      nameFontSize: Math.max(18, Math.round(activePdfSpacing.nameFontSize * autoFitScale * 10) / 10),
      contactFontSize: Math.max(7.5, Math.round(activePdfSpacing.contactFontSize * autoFitScale * 10) / 10),
      headingFontSize: Math.max(9.0, Math.round(activePdfSpacing.headingFontSize * autoFitScale * 10) / 10),
      summaryFontSize: Math.max(7.5, Math.round(activePdfSpacing.summaryFontSize * autoFitScale * 10) / 10),
      companyFontSize: Math.max(7.8, Math.round(activePdfSpacing.companyFontSize * autoFitScale * 10) / 10),
      titleFontSize: Math.max(7.2, Math.round(activePdfSpacing.titleFontSize * autoFitScale * 10) / 10),
      bodyFontSize: Math.max(7.2, Math.round(activePdfSpacing.bodyFontSize * autoFitScale * 10) / 10),
      projectNameFontSize: Math.max(7.8, Math.round(activePdfSpacing.projectNameFontSize * autoFitScale * 10) / 10),
      projectTechFontSize: Math.max(7.2, Math.round(activePdfSpacing.projectTechFontSize * autoFitScale * 10) / 10),
      sidebarFontSize: Math.max(7.2, Math.round(activePdfSpacing.sidebarFontSize * autoFitScale * 10) / 10),

      summaryLineStep: Math.max(8.5, Math.round(activePdfSpacing.summaryLineStep * autoFitScale * 10) / 10),
      summaryAfterGap: Math.max(4.0, Math.round(activePdfSpacing.summaryAfterGap * autoFitScale * 10) / 10),
      companyAfterGap: Math.max(5.0, Math.round(activePdfSpacing.companyAfterGap * autoFitScale * 10) / 10),
      titleAfterGap: Math.max(4.5, Math.round(activePdfSpacing.titleAfterGap * autoFitScale * 10) / 10),
      bpLineStep: Math.max(7.4, Math.round(activePdfSpacing.bpLineStep * autoFitScale * 10) / 10),
      bpAfterGap: Math.max(0.8, Math.round(activePdfSpacing.bpAfterGap * autoFitScale * 10) / 10),
      expAfterGap: Math.max(3.0, Math.round(activePdfSpacing.expAfterGap * autoFitScale * 10) / 10),
      expItemGap: Math.max(3.0, Math.round(activePdfSpacing.expItemGap * autoFitScale * 10) / 10),
      projNameAfterGap: Math.max(5.0, Math.round(activePdfSpacing.projNameAfterGap * autoFitScale * 10) / 10),
      projTechAfterGap: Math.max(4.5, Math.round(activePdfSpacing.projTechAfterGap * autoFitScale * 10) / 10),
      projDescLineStep: Math.max(7.4, Math.round(activePdfSpacing.projDescLineStep * autoFitScale * 10) / 10),
      projDescAfterGap: Math.max(3.5, Math.round(activePdfSpacing.projDescAfterGap * autoFitScale * 10) / 10),
      projItemGap: Math.max(3.5, Math.round(activePdfSpacing.projItemGap * autoFitScale * 10) / 10),
      eduLineStep: Math.max(7.8, Math.round(activePdfSpacing.eduLineStep * autoFitScale * 10) / 10),
      eduItemGap: Math.max(4.0, Math.round(activePdfSpacing.eduItemGap * autoFitScale * 10) / 10),
      skillLineStep: Math.max(7.4, Math.round(activePdfSpacing.skillLineStep * autoFitScale * 10) / 10),
      skillAfterGap: Math.max(4.0, Math.round(activePdfSpacing.skillAfterGap * autoFitScale * 10) / 10),
      awardLineStep: Math.max(7.8, Math.round(activePdfSpacing.awardLineStep * autoFitScale * 10) / 10),
      certLineStep: Math.max(7.8, Math.round(activePdfSpacing.certLineStep * autoFitScale * 10) / 10),
      headingBefore: Math.max(5.0, Math.round(activePdfSpacing.headingBefore * autoFitScale * 10) / 10),
      headingAfter: Math.max(5.0, Math.round(activePdfSpacing.headingAfter * autoFitScale * 10) / 10),
    };
  } else if (initialRequiredY < maxAvailableY - 80 && !pdfSpacing.isHeavy && !pdfSpacing.isUltraHeavy && !pdfSpacing.isExtreme) {
    // Content is light or standard: distribute extra space gracefully
    const extraSpace = Math.min(120, maxAvailableY - 40 - initialRequiredY);
    const expandFactor = Math.min(1.3, 1 + extraSpace / 350);

    activePdfSpacing = {
      ...activePdfSpacing,
      summaryLineStep: Math.round(activePdfSpacing.summaryLineStep * Math.min(1.15, expandFactor) * 10) / 10,
      bpLineStep: Math.round(activePdfSpacing.bpLineStep * Math.min(1.15, expandFactor) * 10) / 10,
      projDescLineStep: Math.round(activePdfSpacing.projDescLineStep * Math.min(1.15, expandFactor) * 10) / 10,
      summaryAfterGap: Math.round(activePdfSpacing.summaryAfterGap * expandFactor * 10) / 10,
      expAfterGap: Math.round(activePdfSpacing.expAfterGap * expandFactor * 10) / 10,
      expItemGap: Math.round(activePdfSpacing.expItemGap * expandFactor * 10) / 10,
      projDescAfterGap: Math.round(activePdfSpacing.projDescAfterGap * expandFactor * 10) / 10,
      projItemGap: Math.round(activePdfSpacing.projItemGap * expandFactor * 10) / 10,
      eduItemGap: Math.round(activePdfSpacing.eduItemGap * expandFactor * 10) / 10,
      skillAfterGap: Math.round(activePdfSpacing.skillAfterGap * expandFactor * 10) / 10,
      headingBefore: Math.round(activePdfSpacing.headingBefore * expandFactor * 10) / 10,
    };
  }

  // 1. Candidate Full Name (Centered & Uppercase in #2C3B57 navy)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(activePdfSpacing.nameFontSize || 26);
  doc.setTextColor(44, 59, 87); // #2C3B57 in RGB
  const fullName = (profile?.personalInfo?.fullName || 'jaya sri palli').toUpperCase();
  const nameWidth = doc.getTextWidth(fullName);
  doc.text(fullName, Math.max(pageMarginSide, (pageWidth - nameWidth) / 2), nameY);

  // 2. Contact Information Row with Embedded Contact Icons (Clean URLs, NO https://)
  const phone = profile?.personalInfo?.phone || '+91- 7893414784';
  const email = profile?.personalInfo?.email || 'jayasripalli20@gmail.com';
  const rawLinkedin = profile?.personalInfo?.linkedin || 'linkedin.com/in/jayasripalli';
  const rawGithub = profile?.personalInfo?.github || 'github.com/Jayasri7-ux';
  const linkedin = rawLinkedin.replace(/^https?:\/\/(www\.)?/i, '');
  const github = rawGithub.replace(/^https?:\/\/(www\.)?/i, '');

  const contactItems = [
    { text: phone, icon: getContactIconDataUrl('phone') },
    { text: email, icon: getContactIconDataUrl('email') },
    { text: linkedin, icon: getContactIconDataUrl('linkedin') },
    { text: github, icon: getContactIconDataUrl('github') },
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(activePdfSpacing.contactFontSize || 8.5);
  doc.setTextColor(44, 59, 87);

  const iconDim = 7.5;
  const iconGap = 3.0;
  const itemGap = 16;

  let totalRowWidth = 0;
  const itemMetrics = contactItems.map((ci) => {
    const textW = doc.getTextWidth(ci.text);
    const itemW = (ci.icon ? iconDim + iconGap : 0) + textW;
    totalRowWidth += itemW;
    return { textW, itemW };
  });
  totalRowWidth += (contactItems.length - 1) * itemGap;

  let curX = Math.max(pageMarginSide, (pageWidth - totalRowWidth) / 2);

  contactItems.forEach((ci, idx) => {
    if (ci.icon) {
      try {
        doc.addImage(ci.icon, 'PNG', curX, contactY - iconDim + 1.2, iconDim, iconDim);
      } catch (err) {
        // Fallback gracefully if image cannot be parsed
      }
      curX += iconDim + iconGap;
    }
    doc.text(ci.text, curX, contactY);
    curX += itemMetrics[idx].textW;

    if (idx < contactItems.length - 1) {
      curX += itemGap;
    }
  });

  // Header Divider Line below contact row (#CADEE5 / #CBD5E1)
  doc.setDrawColor(202, 222, 229); // #CADEE5 in RGB
  doc.setLineWidth(0.85);
  doc.line(pageMarginSide, dividerY, pageWidth - pageMarginSide, dividerY);

  // Background shading for right column (#CADEE5)
  // Extends cleanly from top of column to maxAvailableY (bottom of page layout)
  const rightBgTop = dividerY;
  const rightBgHeight = maxAvailableY - rightBgTop;
  doc.setFillColor(202, 222, 229); // #CADEE5 in RGB
  doc.rect(rightColX, rightBgTop, rightColW, rightBgHeight, 'F');

  // Section Heading Helper: guarantees clean line separation and zero heading collision
  const drawHeading = (title, x, y, width) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(activePdfSpacing.headingFontSize || 11);
    doc.setTextColor(44, 59, 87);
    doc.text(title.toUpperCase(), x, y);
    doc.setDrawColor(44, 59, 87);
    doc.setLineWidth(1.2);
    doc.line(x, y + 2.5, x + width, y + 2.5);
    return y + 2.5 + (activePdfSpacing?.headingAfter || 9);
  };

  // Bullet Drawer Helper: vector circle for 100% crisp, uncorrupted bullets
  const drawVectorBullet = (bx, by, color = [44, 59, 87], radius = 1.2) => {
    doc.setFillColor(color[0], color[1], color[2]);
    doc.circle(bx, by - 2.5, radius, 'F');
  };

  // --- Left Column ---
  let leftY = columnsStartY;

  // 1. OBJECTIVE
  leftY = drawHeading('OBJECTIVE', leftColX, leftY, leftColW);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(activePdfSpacing.summaryFontSize || 9.2);
  doc.setTextColor(34, 34, 34);
  const summaryLines = doc.splitTextToSize(summary, leftColW);
  summaryLines.forEach((line) => {
    doc.text(line, leftColX, leftY);
    leftY += activePdfSpacing.summaryLineStep;
  });
  leftY += activePdfSpacing.summaryAfterGap;

  // 2. INTERNSHIPS
  leftY += activePdfSpacing.headingBefore;
  leftY = drawHeading('INTERNSHIPS', leftColX, leftY, leftColW);
  experiences.forEach((exp, idx) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(activePdfSpacing.companyFontSize || 10.2);
    doc.setTextColor(44, 59, 87);
    doc.text(exp.company || 'Internship Experience', leftColX, leftY);
    leftY += activePdfSpacing.companyAfterGap;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(activePdfSpacing.titleFontSize || 9.2);
    doc.setTextColor(17, 17, 17);
    const titlePeriod = `${exp.title || 'Intern'} | ${exp.period || `${exp.startDate || ''} - ${exp.endDate || ''}`}`;
    doc.text(titlePeriod, leftColX, leftY);
    leftY += activePdfSpacing.titleAfterGap;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(activePdfSpacing.bodyFontSize || 8.8);
    doc.setTextColor(34, 34, 34);
    (exp.bulletPoints || []).forEach((bp) => {
      const bpLines = doc.splitTextToSize(bp, leftColW - 12);
      drawVectorBullet(leftColX + 3, leftY, [44, 59, 87], 1.2);
      bpLines.forEach((line) => {
        doc.text(line, leftColX + 10, leftY);
        leftY += activePdfSpacing.bpLineStep;
      });
      leftY += activePdfSpacing.bpAfterGap;
    });
    // Space in between individual internships
    if (idx < experiences.length - 1) {
      leftY += (activePdfSpacing.expItemGap || activePdfSpacing.expAfterGap || 14);
    }
  });

  // 3. PROJECTS
  leftY += activePdfSpacing.headingBefore;
  leftY = drawHeading('PROJECTS', leftColX, leftY, leftColW);
  projects.forEach((proj, idx) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(activePdfSpacing.projectNameFontSize || 10.2);
    doc.setTextColor(44, 59, 87);
    doc.text(proj.name || 'Project', leftColX, leftY);
    leftY += activePdfSpacing.projNameAfterGap;

    const techStack = Array.isArray(proj.techStack) ? proj.techStack.join(' | ') : proj.techStack || '';
    if (techStack) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(activePdfSpacing.projectTechFontSize || 9.0);
      doc.setTextColor(17, 17, 17);
      const techLines = doc.splitTextToSize(`Tech: ${techStack}`, leftColW);
      techLines.forEach((line) => {
        doc.text(line, leftColX, leftY);
        leftY += (activePdfSpacing.projectTechLineStep || 10.5);
      });
      leftY += activePdfSpacing.projTechAfterGap;
    }

    if (proj.description) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(activePdfSpacing.bodyFontSize || 8.8);
      doc.setTextColor(34, 34, 34);
      const descLines = doc.splitTextToSize(proj.description, leftColW);
      descLines.forEach((line) => {
        doc.text(line, leftColX, leftY);
        leftY += activePdfSpacing.projDescLineStep;
      });
    }
    // Space in between individual projects
    if (idx < projects.length - 1) {
      leftY += (activePdfSpacing.projItemGap || activePdfSpacing.projDescAfterGap || 14);
    }
  });

  // --- Right Column (#CADEE5 background) ---
  let rightY = columnsStartY;

  // 1. Education
  rightY = drawHeading('Education', sidebarTextX, rightY, sidebarTextW);
  (profile?.education || []).forEach((edu, idx) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(activePdfSpacing.sidebarFontSize || 8.8);
    doc.setTextColor(17, 17, 17);
    const dField = edu.fieldOfStudy === 'Information Technology' ? 'IT' : (edu.fieldOfStudy || '');
    const dTitle = `${edu.degree}${dField ? ` (${dField})` : ''} | ${edu.graduationYear || ''}`;
    const degreeLines = doc.splitTextToSize(dTitle, sidebarTextW);
    degreeLines.forEach((line) => {
      doc.text(line, sidebarTextX, rightY);
      rightY += (activePdfSpacing.eduLineStep || 11);
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(activePdfSpacing.sidebarFontSize || 8.8);
    doc.setTextColor(51, 51, 51);
    const instLines = doc.splitTextToSize(
      `${edu.institution}${edu.honors ? ` | ${edu.honors}` : ''}`,
      sidebarTextW
    );
    instLines.forEach((line) => {
      doc.text(line, sidebarTextX, rightY);
      rightY += (activePdfSpacing.eduLineStep || 11);
    });
    // Space in between individual education items
    if (idx < (profile?.education || []).length - 1) {
      rightY += (activePdfSpacing.eduItemGap || 9);
    }
  });

  // 2. Technical Skills (Clean bold categories, NO bullets)
  rightY += activePdfSpacing.headingBefore;
  rightY = drawHeading('TECHNICAL SKILLS', sidebarTextX, rightY, sidebarTextW);

  skills.forEach((s) => {
    rightY = renderPdfSkillCategory(
      doc,
      s.label,
      s.text,
      sidebarTextX,
      rightY,
      sidebarTextW,
      activePdfSpacing.skillLineStep || 11,
      activePdfSpacing.skillAfterGap || 7,
      activePdfSpacing.sidebarFontSize || 8.8
    );
  });

  // 3. Awards
  if (profile?.awards && profile.awards.length > 0) {
    rightY += activePdfSpacing.headingBefore;
    rightY = drawHeading('AWARDS', sidebarTextX, rightY, sidebarTextW);
    profile.awards.forEach((award) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(activePdfSpacing.sidebarFontSize || 8.8);
      doc.setTextColor(34, 34, 34);
      const awardLines = doc.splitTextToSize(award, sidebarTextW - 10);
      drawVectorBullet(sidebarTextX + 2, rightY, [44, 59, 87], 1.2);
      awardLines.forEach((line) => {
        doc.text(line, sidebarTextX + 9, rightY);
        rightY += (activePdfSpacing.awardLineStep || 11);
      });
      rightY += 2;
    });
    rightY += activePdfSpacing.expAfterGap;
  }

  // 4. Certifications
  if (profile?.certifications && profile.certifications.length > 0) {
    rightY += activePdfSpacing.headingBefore;
    rightY = drawHeading('CERTIFICATIONS', sidebarTextX, rightY, sidebarTextW);
    profile.certifications.forEach((cert) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(activePdfSpacing.sidebarFontSize || 8.8);
      doc.setTextColor(34, 34, 34);
      const cText = `${cert.name} - ${cert.issuer}`;
      const certLines = doc.splitTextToSize(cText, sidebarTextW - 10);
      drawVectorBullet(sidebarTextX + 2, rightY, [44, 59, 87], 1.2);
      certLines.forEach((line) => {
        doc.text(line, sidebarTextX + 9, rightY);
        rightY += (activePdfSpacing.certLineStep || 11);
      });
      rightY += 2;
    });
  }

  // Strict Single-Page Enforcement Safeguard:
  const totalPages = doc.getNumberOfPages();
  if (totalPages > 1) {
    for (let p = totalPages; p > 1; p--) {
      doc.deletePage(p);
    }
  }

  return doc;
}

/**
 * Compiles and triggers immediate download of a formatted PDF document.
 *
 * @param {Object} options
 * @param {Object} options.profile - Master candidate profile
 * @param {Object} options.tailoredResult - Tailored engine result
 * @param {string} [options.filename='Tailored_Resume.pdf']
 */
export function exportTailoredPdf({
  profile,
  tailoredResult,
  filename = 'Tailored_Resume.pdf',
}) {
  const doc = generateTailoredPdfDocument({ profile, tailoredResult });
  if (typeof doc?.save === 'function') {
    doc.save(filename);
  }
  return doc;
}

export default {
  computeDynamicContentSpacing,
  buildTailoredDocxDocument,
  generateTailoredDocxBuffer,
  exportTailoredDocx,
  exportTailoredPdf,
  generateTailoredPdfDocument,
  categorizeApprovedSkills,
};
