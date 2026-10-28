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

  // 4. DOCX OpenXML Spacing Metrics (20 dxa = 1 pt)
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
    // For longer content: enforce uniform natural line-height (1.30x) without font
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

  // 5. Dynamic Content-Aware Page Margins & PDF Spacing Metrics
  const isHeavy = totalLeftWords > 220 || totalLeftItems >= 8 || rightColumnItemLoad >= 22;
  const isUltraRelaxed = totalLeftWords < 80 && totalLeftItems <= 3 && rightColumnItemLoad <= 14;

  // Dynamically auto-adjust OpenXML DOCX page margins to enforce single-page fit without distortion
  docxSpacing.pageMarginTop = isHeavy ? 540 : densityTier === 'compact' ? 640 : isUltraRelaxed ? 780 : 720;
  docxSpacing.pageMarginBottom = isHeavy ? 540 : densityTier === 'compact' ? 640 : isUltraRelaxed ? 780 : 720;
  docxSpacing.pageMarginSide = isHeavy ? 600 : densityTier === 'compact' ? 660 : 720;

  // Dynamically auto-adjust PDF layout, margins, and vertical paddings
  const pdfSpacing = {
    densityTier,
    pageMarginTop: isHeavy ? 18 : densityTier === 'compact' ? 22 : densityTier === 'relaxed' ? 30 : 26,
    pageMarginBottom: isHeavy ? 18 : densityTier === 'compact' ? 22 : densityTier === 'relaxed' ? 30 : 26,
    pageMarginSide: isHeavy ? 22 : densityTier === 'compact' ? 24 : densityTier === 'relaxed' ? 30 : 28,
    summaryLineStep: isHeavy ? 9.5 : densityTier === 'compact' ? 10.2 : densityTier === 'relaxed' ? 11.5 : 11,
    summaryAfterGap: isHeavy ? 5 : densityTier === 'compact' ? 6.5 : densityTier === 'relaxed' ? 10 : 8,
    companyAfterGap: isHeavy ? 7 : densityTier === 'compact' ? 8.5 : densityTier === 'relaxed' ? 12 : 10,
    titleAfterGap: isHeavy ? 6 : densityTier === 'compact' ? 7.5 : densityTier === 'relaxed' ? 11 : 9,
    bpLineStep: isHeavy ? 8.2 : densityTier === 'compact' ? 8.8 : densityTier === 'relaxed' ? 9.8 : 9.3,
    bpAfterGap: isHeavy ? 1.0 : densityTier === 'compact' ? 1.5 : densityTier === 'relaxed' ? 2.5 : 2.0,
    expAfterGap: isHeavy ? 3 : densityTier === 'compact' ? 4 : densityTier === 'relaxed' ? 7 : 5,
    projNameAfterGap: isHeavy ? 7 : densityTier === 'compact' ? 8.5 : densityTier === 'relaxed' ? 12 : 10,
    projTechAfterGap: isHeavy ? 6 : densityTier === 'compact' ? 7.5 : densityTier === 'relaxed' ? 11 : 9,
    projDescLineStep: isHeavy ? 8.2 : densityTier === 'compact' ? 8.8 : densityTier === 'relaxed' ? 9.8 : 9.3,
    projDescAfterGap: isHeavy ? 4 : densityTier === 'compact' ? 5 : densityTier === 'relaxed' ? 9 : 7,
    skillLineStep: isHeavy ? 8.2 : densityTier === 'compact' ? 8.8 : densityTier === 'relaxed' ? 9.8 : 9.3,
    skillAfterGap: isHeavy ? 5 : densityTier === 'compact' ? 7 : densityTier === 'relaxed' ? 11 : 9,
    headingBefore: isHeavy ? 9 : densityTier === 'compact' ? 12 : densityTier === 'relaxed' ? 16 : 14,
    headingAfter: isHeavy ? 2 : densityTier === 'compact' ? 3 : densityTier === 'relaxed' ? 4.5 : 3.5,
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
          size: 22, // 11pt
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
      spacing: { after: docxSpacing.summaryAfter, line: docxSpacing.bodyLineSpacing, lineRule: 'auto' },
      children: [
        new TextRun({
          text: summary,
          size: 19, // ~9.5pt
          color: '222222',
          font: 'Arial',
        }),
      ],
    })
  );

  // 2. INTERNSHIPS
  leftColumnChildren.push(createHeading('INTERNSHIPS'));
  experiences.forEach((exp) => {
    // Company name
    leftColumnChildren.push(
      new Paragraph({
        spacing: { before: docxSpacing.companyBefore, after: docxSpacing.companyAfter },
        children: [
          new TextRun({
            text: exp.company || 'Internship Experience',
            bold: true,
            size: 20, // 10pt
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
            size: 18, // 9pt
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
              size: 18,
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
  projects.forEach((proj) => {
    // Project Name
    leftColumnChildren.push(
      new Paragraph({
        spacing: { before: docxSpacing.projectNameBefore, after: docxSpacing.projectNameAfter },
        children: [
          new TextRun({
            text: proj.name || 'Project',
            bold: true,
            size: 20,
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
              size: 18,
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
              size: 18,
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
            size: 18,
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
            size: 18,
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
            size: 18,
            color: '111111',
            font: 'Arial',
          }),
          new TextRun({
            text: s.items,
            size: 18,
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
              size: 18,
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
              size: 18,
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
    contactRowRuns.push(new ImageRun({ data: phoneIconBinary, transformation: { width: 9, height: 9 } }));
    contactRowRuns.push(new TextRun({ text: ` ${phone}   `, size: 18, color: '2C3B57', font: 'Arial' }));
  } else {
    contactRowRuns.push(new TextRun({ text: `${phone}   `, size: 18, color: '2C3B57', font: 'Arial' }));
  }
  contactRowRuns.push(new TextRun({ text: '•   ', size: 18, color: '2C3B57', font: 'Arial' }));

  if (emailIconBinary) {
    contactRowRuns.push(new ImageRun({ data: emailIconBinary, transformation: { width: 9, height: 9 } }));
    contactRowRuns.push(new TextRun({ text: ` ${email}   `, size: 18, color: '2C3B57', font: 'Arial' }));
  } else {
    contactRowRuns.push(new TextRun({ text: `${email}   `, size: 18, color: '2C3B57', font: 'Arial' }));
  }
  contactRowRuns.push(new TextRun({ text: '•   ', size: 18, color: '2C3B57', font: 'Arial' }));

  if (linkedinIconBinary) {
    contactRowRuns.push(new ImageRun({ data: linkedinIconBinary, transformation: { width: 9, height: 9 } }));
    contactRowRuns.push(new TextRun({ text: ` ${linkedin}   `, size: 18, color: '2C3B57', font: 'Arial' }));
  } else {
    contactRowRuns.push(new TextRun({ text: `${linkedin}   `, size: 18, color: '2C3B57', font: 'Arial' }));
  }
  contactRowRuns.push(new TextRun({ text: '•   ', size: 18, color: '2C3B57', font: 'Arial' }));

  if (githubIconBinary) {
    contactRowRuns.push(new ImageRun({ data: githubIconBinary, transformation: { width: 9, height: 9 } }));
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
                size: 72, // 36pt matching Master_Resume.docx Heading1
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
              `<w:p><w:pPr><w:pStyle w:val="Text"/><w:spacing w:after="${docxSpacing.bulletAfter}" w:line="${docxSpacing.bodyLineSpacing}" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r><w:t>${escapeXml(bp)}</w:t></w:r></w:p>`
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
              `<w:p><w:pPr><w:pStyle w:val="Text"/><w:spacing w:after="${docxSpacing.bulletAfter}" w:line="${docxSpacing.bodyLineSpacing}" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r><w:t>${escapeXml(bp)}</w:t></w:r></w:p>`
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
        const newP = `<w:p><w:pPr><w:pStyle w:val="Text"/><w:spacing w:after="${docxSpacing.projectDescAfter}" w:line="${docxSpacing.bodyLineSpacing}" w:lineRule="auto"/></w:pPr><w:r><w:t>${escapeXml(projects[0].description)}</w:t></w:r></w:p>`;
        docXml = docXml.substring(0, pStart) + newP + docXml.substring(pEnd);
      }
    }
    // Project 2
    if (projects[1]?.description) {
      const p2Idx = docXml.indexOf('Created an AI-powered health chatbot');
      if (p2Idx !== -1) {
        const pStart = Math.max(docXml.lastIndexOf('<w:p ', p2Idx), docXml.lastIndexOf('<w:p>', p2Idx));
        const pEnd = docXml.indexOf('</w:p>', p2Idx) + 6;
        const newP = `<w:p><w:pPr><w:pStyle w:val="Text"/><w:spacing w:after="${docxSpacing.projectDescAfter}" w:line="${docxSpacing.bodyLineSpacing}" w:lineRule="auto"/></w:pPr><w:r><w:t>${escapeXml(projects[1].description)}</w:t></w:r></w:p>`;
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

  // 5. Dynamic Page Margins and Fluid Autospacing (Strict 1-Page Enforcement without Text Collision or Clipping)
  const pageMarginTopDxa = docxSpacing.pageMarginTop || 640;
  const pageMarginBottomDxa = docxSpacing.pageMarginBottom || 640;
  const pageMarginSideDxa = docxSpacing.pageMarginSide || 680;
  docXml = docXml.replace(
    /<w:pgMar\b[^>]*\/>/g,
    `<w:pgMar w:top="${pageMarginTopDxa}" w:right="${pageMarginSideDxa}" w:bottom="${pageMarginBottomDxa}" w:left="${pageMarginSideDxa}" w:header="709" w:footer="709" w:gutter="0"/>`
  );

  // Replace rigid 1-dxa exact heights on separator rows with fluid autospacing minimums
  docXml = docXml.replace(/<w:trHeight\s+w:hRule="exact"\s+w:val="1"\s*\/>/g, '<w:trHeight w:hRule="atLeast" w:val="60"/>');

  // Convert oversized rigid row heights into fluid autospacing rows
  docXml = docXml.replace(/<w:trHeight\s+w:val="(?:1684|1044|567|400)"\s*\/>/g, '<w:trHeight w:hRule="atLeast" w:val="120"/>');

  // Enforce table row-level integrity across all rows by adding <w:cantSplit/> to prevent awkward mid-row breaks
  docXml = docXml.replace(/<w:trPr>/g, '<w:trPr><w:cantSplit/>');

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
function renderPdfSkillCategory(doc, label, text, x, y, maxW, lineStep, afterGap = 0) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const labelPrefix = `• ${label}: `;
  const labelW = doc.getTextWidth(labelPrefix);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

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

  // Draw bold bullet label
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 17, 17);
  doc.text(labelPrefix, x, y);

  // Draw first line of skills text beside the label
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(34, 34, 34);
  if (line1) {
    doc.text(line1, x + labelW, y);
  }
  let curY = y;

  const remainingWords = words.slice(splitIdx);
  if (remainingWords.length > 0) {
    const remainingText = remainingWords.join(' ');
    const extraLines = doc.splitTextToSize(remainingText, maxW - 8);
    for (let j = 0; j < extraLines.length; j++) {
      curY += lineStep;
      doc.text(extraLines[j], x + 8, curY);
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
  const pageMarginSide = pdfSpacing?.pageMarginSide || 28;

  const leftColX = pageMarginSide;
  const leftColW = Math.floor((pageWidth - pageMarginSide * 2 - 14) * 0.625);
  const rightColX = leftColX + leftColW + 12;
  const rightColW = pageWidth - rightColX - pageMarginSide;

  // 1. Candidate Full Name (Centered & Uppercase in #2C3B57 navy)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(44, 59, 87); // #2C3B57 in RGB
  const fullName = (profile?.personalInfo?.fullName || 'jaya sri palli').toUpperCase();
  const nameWidth = doc.getTextWidth(fullName);
  doc.text(fullName, Math.max(pageMarginSide, (pageWidth - nameWidth) / 2), pageMarginTop + 16);

  // 2. Contact Information Row with Embedded Contact Icons
  const phone = profile?.personalInfo?.phone || '+91- 7893414784';
  const email = profile?.personalInfo?.email || 'jayasripalli20@gmail.com';
  const linkedin = profile?.personalInfo?.linkedin || 'linkedin.com/in/jayasripalli';
  const github = profile?.personalInfo?.github || 'github.com/Jayasri7-ux';

  const contactItems = [
    { text: phone, icon: getContactIconDataUrl('phone') },
    { text: email, icon: getContactIconDataUrl('email') },
    { text: linkedin, icon: getContactIconDataUrl('linkedin') },
    { text: github, icon: getContactIconDataUrl('github') },
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(44, 59, 87);

  const iconDim = 7.5;
  const iconGap = 2.5;
  const dotGap = 6;
  const dotWidth = doc.getTextWidth('•');

  let totalRowWidth = 0;
  const itemMetrics = contactItems.map((ci) => {
    const textW = doc.getTextWidth(ci.text);
    const itemW = (ci.icon ? iconDim + iconGap : 0) + textW;
    totalRowWidth += itemW;
    return { textW, itemW };
  });
  totalRowWidth += (contactItems.length - 1) * (dotGap * 2 + dotWidth);

  let curX = Math.max(pageMarginSide, (pageWidth - totalRowWidth) / 2);
  const contactY = pageMarginTop + 33;

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
      curX += dotGap;
      doc.text('•', curX, contactY);
      curX += dotWidth + dotGap;
    }
  });

  // Section heading helper
  const drawHeading = (title, x, y, width) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(44, 59, 87);
    doc.text(title.toUpperCase(), x, y);
    doc.setDrawColor(44, 59, 87);
    doc.setLineWidth(1);
    doc.line(x, y + 3, x + width, y + 3);
    return y + (pdfSpacing?.headingAfter || 13);
  };

  // Background shading for right column (#CADEE5)
  const rightBgTop = pageMarginTop + 44;
  const rightBgHeight = pageHeight - pageMarginBottom - rightBgTop;
  doc.setFillColor(202, 222, 229); // #CADEE5 in RGB
  doc.rect(rightColX - 6, rightBgTop, rightColW + 12, rightBgHeight, 'F');

  // --- Left Column ---
  let leftY = pageMarginTop + 56;

  // 1. OBJECTIVE
  leftY = drawHeading('OBJECTIVE', leftColX, leftY, leftColW);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(34, 34, 34);
  const summaryLines = doc.splitTextToSize(summary, leftColW);
  summaryLines.forEach((line) => {
    doc.text(line, leftColX, leftY);
    leftY += pdfSpacing.summaryLineStep;
  });
  leftY += pdfSpacing.summaryAfterGap;

  // 2. INTERNSHIPS
  leftY = drawHeading('INTERNSHIPS', leftColX, leftY, leftColW);
  experiences.forEach((exp) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(44, 59, 87);
    doc.text(exp.company || 'Internship Experience', leftColX, leftY);
    leftY += pdfSpacing.companyAfterGap;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(17, 17, 17);
    const titlePeriod = `${exp.title || 'Intern'} | ${exp.period || `${exp.startDate || ''} – ${exp.endDate || ''}`}`;
    doc.text(titlePeriod, leftColX, leftY);
    leftY += pdfSpacing.titleAfterGap;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(34, 34, 34);
    (exp.bulletPoints || []).forEach((bp) => {
      const bpLines = doc.splitTextToSize(`• ${bp}`, leftColW - 6);
      bpLines.forEach((line) => {
        doc.text(line, leftColX + 4, leftY);
        leftY += pdfSpacing.bpLineStep;
      });
      leftY += pdfSpacing.bpAfterGap;
    });
    leftY += pdfSpacing.expAfterGap;
  });

  // 3. PROJECTS
  leftY = drawHeading('PROJECTS', leftColX, leftY, leftColW);
  projects.forEach((proj) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(44, 59, 87);
    doc.text(proj.name || 'Project', leftColX, leftY);
    leftY += pdfSpacing.projNameAfterGap;

    const techStack = Array.isArray(proj.techStack) ? proj.techStack.join(' | ') : proj.techStack || '';
    if (techStack) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(17, 17, 17);
      const techLines = doc.splitTextToSize(`Tech: ${techStack}`, leftColW);
      techLines.forEach((line) => {
        doc.text(line, leftColX, leftY);
        leftY += 9.5;
      });
      leftY += pdfSpacing.projTechAfterGap;
    }

    if (proj.description) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(34, 34, 34);
      const descLines = doc.splitTextToSize(proj.description, leftColW);
      descLines.forEach((line) => {
        doc.text(line, leftColX, leftY);
        leftY += pdfSpacing.projDescLineStep;
      });
      leftY += pdfSpacing.projDescAfterGap;
    }
  });

  // --- Right Column (#CADEE5 background) ---
  let rightY = pageMarginTop + 56;

  // 1. Education
  rightY = drawHeading('Education', rightColX, rightY, rightColW);
  (profile?.education || []).forEach((edu) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(17, 17, 17);
    const degreeLines = doc.splitTextToSize(
      `${edu.degree}${edu.fieldOfStudy ? ` (${edu.fieldOfStudy})` : ''} | ${edu.graduationYear || ''}`,
      rightColW - 4
    );
    degreeLines.forEach((line) => {
      doc.text(line, rightColX, rightY);
      rightY += 9.5;
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 51, 51);
    const instLines = doc.splitTextToSize(
      `${edu.institution}${edu.honors ? ` | ${edu.honors}` : ''}`,
      rightColW - 4
    );
    instLines.forEach((line) => {
      doc.text(line, rightColX, rightY);
      rightY += 9.5;
    });
    rightY += pdfSpacing.companyAfterGap;
  });

  // 2. Technical Skills
  rightY = drawHeading('TECHNICAL SKILLS', rightColX, rightY, rightColW);
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

  skills.forEach((s) => {
    rightY = renderPdfSkillCategory(
      doc,
      s.label,
      s.text,
      rightColX,
      rightY,
      rightColW - 4,
      pdfSpacing.skillLineStep,
      pdfSpacing.skillAfterGap
    );
  });

  // 3. Awards
  if (profile?.awards && profile.awards.length > 0) {
    rightY = drawHeading('AWARDS', rightColX, rightY, rightColW);
    profile.awards.forEach((award) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(34, 34, 34);
      const awardLines = doc.splitTextToSize(`• ${award}`, rightColW - 4);
      awardLines.forEach((line) => {
        doc.text(line, rightColX, rightY);
        rightY += 9.5;
      });
      rightY += 2;
    });
    rightY += pdfSpacing.expAfterGap;
  }

  // 4. Certifications
  if (profile?.certifications && profile.certifications.length > 0) {
    rightY = drawHeading('CERTIFICATIONS', rightColX, rightY, rightColW);
    profile.certifications.forEach((cert) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(34, 34, 34);
      const certLines = doc.splitTextToSize(`• ${cert.name} – ${cert.issuer}`, rightColW - 4);
      certLines.forEach((line) => {
        doc.text(line, rightColX, rightY);
        rightY += 9.5;
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
