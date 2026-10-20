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
} from 'docx';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';

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

  const fullName = profile?.personalInfo?.fullName || 'jaya sri palli';
  const phone = profile?.personalInfo?.phone || '+91- 7893414784';
  const email = profile?.personalInfo?.email || 'jayasripalli20@gmail.com';
  const linkedin = profile?.personalInfo?.linkedin || 'linkedin.com/in/jayasripalli';
  const github = profile?.personalInfo?.github || 'github.com/Jayasri7-ux';

  // Helper to create a section heading with bottom border in Word table cell
  const createHeading = (text) =>
    new Paragraph({
      spacing: { before: 140, after: 80 },
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
      spacing: { after: 140 },
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
        spacing: { before: 80, after: 20 },
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
        spacing: { after: 40 },
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

    // Bullet points
    (exp.bulletPoints || []).forEach((bp) => {
      leftColumnChildren.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 40 },
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
        spacing: { before: 80, after: 20 },
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
          spacing: { after: 30 },
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

    // Description
    if (proj.description) {
      leftColumnChildren.push(
        new Paragraph({
          spacing: { after: 100 },
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
        spacing: { before: 40, after: 10 },
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
        spacing: { after: 60 },
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
        spacing: { after: 30 },
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
          spacing: { after: 30 },
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
          spacing: { after: 30 },
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

  // Construct Document with identical margins and ModernResume twin theme
  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,    // 0.5 inch
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children: [
          // Header: Candidate Name (Centered, uppercase, 36pt font matching Master_Resume.docx)
          new Paragraph({
            spacing: { after: 60 },
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

          // Contact Information Row (Centered)
          new Paragraph({
            spacing: { after: 180 },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `${phone}   •   ${email}   •   ${linkedin}   •   ${github}`,
                size: 18,
                color: '2C3B57',
                font: 'Arial',
              }),
            ],
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
                children: [
                  // Left Column: 63%
                  new TableCell({
                    width: {
                      size: 63,
                      type: WidthType.PERCENTAGE,
                    },
                    margins: {
                      top: 100,
                      bottom: 100,
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
                      bottom: 140,
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
  const summary = tailoredResult?.tailoredSummary || profile?.professionalSummary;
  if (summary) {
    const origSummary = 'Aspiring graduate with internship experience in software development. Passionate about building scalable applications and eager to contribute to a collaborative organization.';
    if (docXml.includes(origSummary)) {
      docXml = docXml.replace(origSummary, escapeXml(summary));
    }
  }

  // 2. Internships (L&T and Infosys)
  const experiences = tailoredResult?.highlightedExperiences || profile?.workExperience;
  if (experiences && experiences.length > 0) {
    // L&T
    if (experiences[0]?.bulletPoints?.length > 0) {
      const ltIdx = docXml.indexOf('Developed a web-based audit application');
      if (ltIdx !== -1) {
        const pStart = docXml.lastIndexOf('<w:p ', ltIdx);
        const pEnd = docXml.indexOf('</w:p>', ltIdx) + 6;
        const newPs = experiences[0].bulletPoints
          .map(
            (bp) =>
              `<w:p><w:pPr><w:pStyle w:val="Text"/><w:jc w:val="both"/></w:pPr><w:r><w:t>${escapeXml(bp)}</w:t></w:r></w:p>`
          )
          .join('');
        docXml = docXml.substring(0, pStart) + newPs + docXml.substring(pEnd);
      }
    }
    // Infosys
    if (experiences[1]?.bulletPoints?.length > 0) {
      const infIdx = docXml.indexOf('Designed a YouTube Analytics Dashboard');
      if (infIdx !== -1) {
        const pStart = docXml.lastIndexOf('<w:p ', infIdx);
        const pEnd = docXml.indexOf('</w:p>', infIdx) + 6;
        const newPs = experiences[1].bulletPoints
          .map(
            (bp) =>
              `<w:p><w:pPr><w:pStyle w:val="Text"/><w:jc w:val="both"/></w:pPr><w:r><w:t>${escapeXml(bp)}</w:t></w:r></w:p>`
          )
          .join('');
        docXml = docXml.substring(0, pStart) + newPs + docXml.substring(pEnd);
      }
    }
  }

  // 3. Projects (Fake News Detection & AI Health Chatbot)
  const projects = tailoredResult?.highlightedProjects || profile?.projects;
  if (projects && projects.length > 0) {
    // Project 1
    if (projects[0]?.description) {
      const p1Idx = docXml.indexOf('misinformation detection');
      if (p1Idx !== -1) {
        const pStart = docXml.lastIndexOf('<w:p ', p1Idx);
        const pEnd = docXml.indexOf('</w:p>', p1Idx) + 6;
        const newP = `<w:p><w:pPr><w:pStyle w:val="Text"/></w:pPr><w:r><w:t>${escapeXml(projects[0].description)}</w:t></w:r></w:p>`;
        docXml = docXml.substring(0, pStart) + newP + docXml.substring(pEnd);
      }
    }
    // Project 2
    if (projects[1]?.description) {
      const p2Idx = docXml.indexOf('Created an AI-powered health chatbot');
      if (p2Idx !== -1) {
        const pStart = docXml.lastIndexOf('<w:p ', p2Idx);
        const pEnd = docXml.indexOf('</w:p>', p2Idx) + 6;
        const newP = `<w:p><w:pPr><w:pStyle w:val="Text"/></w:pPr><w:r><w:t>${escapeXml(projects[1].description)}</w:t></w:r></w:p>`;
        docXml = docXml.substring(0, pStart) + newP + docXml.substring(pEnd);
      }
    }
  }

  // 4. Approved Technical Skills
  const approvedTech = tailoredResult?.approvedMissingTech || [];
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
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter', // 612 x 792 pt
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;

  const leftColX = margin;
  const leftColW = 345;
  const rightColX = leftColX + leftColW + 12;
  const rightColW = pageWidth - rightColX - margin;

  // Background shading for right column (#CADEE5)
  doc.setFillColor(202, 222, 229); // #CADEE5 in RGB
  doc.rect(rightColX - 6, margin + 44, rightColW + 12, pageHeight - margin * 2 - 44, 'F');

  // Candidate Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(44, 59, 87); // #2C3B57 in RGB
  doc.text(profile?.personalInfo?.fullName || 'jaya sri palli', margin, margin + 18);

  // Contact Row
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(44, 59, 87);
  const contactText = `+91- 7893414784   •   jayasripalli20@gmail.com   •   linkedin.com/in/jayasripalli   •   github.com/Jayasri7-ux`;
  doc.text(contactText, margin, margin + 34);

  // Section heading helper
  const drawHeading = (title, x, y, width) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(44, 59, 87);
    doc.text(title.toUpperCase(), x, y);
    doc.setDrawColor(44, 59, 87);
    doc.setLineWidth(1);
    doc.line(x, y + 3, x + width, y + 3);
    return y + 15;
  };

  // --- Left Column ---
  let leftY = margin + 58;

  // 1. Objective
  leftY = drawHeading('OBJECTIVE', leftColX, leftY, leftColW);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(34, 34, 34);
  const summary = tailoredResult?.tailoredSummary || profile?.professionalSummary || '';
  const summaryLines = doc.splitTextToSize(summary, leftColW);
  doc.text(summaryLines, leftColX, leftY);
  leftY += summaryLines.length * 11 + 10;

  // 2. Internships
  leftY = drawHeading('INTERNSHIPS', leftColX, leftY, leftColW);
  const experiences = tailoredResult?.highlightedExperiences || profile?.workExperience || [];
  experiences.forEach((exp) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(44, 59, 87);
    doc.text(exp.company || 'Internship Experience', leftColX, leftY);
    leftY += 11;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(17, 17, 17);
    const titlePeriod = `${exp.title || 'Intern'} | ${exp.period || `${exp.startDate || ''} – ${exp.endDate || ''}`}`;
    doc.text(titlePeriod, leftColX, leftY);
    leftY += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(34, 34, 34);
    (exp.bulletPoints || []).forEach((bp) => {
      const bpLines = doc.splitTextToSize(`• ${bp}`, leftColW - 6);
      doc.text(bpLines, leftColX + 4, leftY);
      leftY += bpLines.length * 9.5 + 2;
    });
    leftY += 6;
  });

  // 3. Projects
  leftY = drawHeading('PROJECTS', leftColX, leftY, leftColW);
  const projects = tailoredResult?.highlightedProjects || profile?.projects || [];
  projects.forEach((proj) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(44, 59, 87);
    doc.text(proj.name || 'Project', leftColX, leftY);
    leftY += 11;

    const techStack = Array.isArray(proj.techStack) ? proj.techStack.join(' | ') : proj.techStack || '';
    if (techStack) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(17, 17, 17);
      doc.text(`Tech: ${techStack}`, leftColX, leftY);
      leftY += 10;
    }

    if (proj.description) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(34, 34, 34);
      const descLines = doc.splitTextToSize(proj.description, leftColW);
      doc.text(descLines, leftColX, leftY);
      leftY += descLines.length * 9.5 + 8;
    }
  });

  // --- Right Column (#CADEE5 background) ---
  let rightY = margin + 58;

  // 1. Education
  rightY = drawHeading('Education', rightColX, rightY, rightColW);
  (profile?.education || []).forEach((edu) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(17, 17, 17);
    doc.text(`${edu.degree}${edu.fieldOfStudy ? ` (${edu.fieldOfStudy})` : ''} | ${edu.graduationYear || ''}`, rightColX, rightY);
    rightY += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 51, 51);
    doc.text(`${edu.institution}${edu.honors ? ` | ${edu.honors}` : ''}`, rightColX, rightY);
    rightY += 14;
  });

  // 2. Technical Skills
  rightY = drawHeading('TECHNICAL SKILLS', rightColX, rightY, rightColW);
  const approvedTech = tailoredResult?.approvedMissingTech || [];
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
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(17, 17, 17);
    doc.text(`• ${s.label}:`, rightColX, rightY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(34, 34, 34);
    const skillLines = doc.splitTextToSize(s.text, rightColW - 10);
    doc.text(skillLines, rightColX + 8, rightY + 9.5);
    rightY += skillLines.length * 9.5 + 11;
  });

  // 3. Awards
  if (profile?.awards && profile.awards.length > 0) {
    rightY = drawHeading('AWARDS', rightColX, rightY, rightColW);
    profile.awards.forEach((award) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(34, 34, 34);
      const awardLines = doc.splitTextToSize(`• ${award}`, rightColW);
      doc.text(awardLines, rightColX, rightY);
      rightY += awardLines.length * 9.5 + 4;
    });
    rightY += 6;
  }

  // 4. Certifications
  if (profile?.certifications && profile.certifications.length > 0) {
    rightY = drawHeading('CERTIFICATIONS', rightColX, rightY, rightColW);
    profile.certifications.forEach((cert) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(34, 34, 34);
      const certLines = doc.splitTextToSize(`• ${cert.name} – ${cert.issuer}`, rightColW);
      doc.text(certLines, rightColX, rightY);
      rightY += certLines.length * 9.5 + 4;
    });
  }

  doc.save(filename);
}

export default {
  buildTailoredDocxDocument,
  generateTailoredDocxBuffer,
  exportTailoredDocx,
  exportTailoredPdf,
  categorizeApprovedSkills,
};
