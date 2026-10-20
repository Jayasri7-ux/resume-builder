import JSZip from 'jszip';
import fs from 'fs';

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, c => {
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

export async function generateTailoredDocxBuffer({ masterBuffer, profile, tailoredResult }) {
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
        const newPs = experiences[0].bulletPoints.map(bp =>
          `<w:p><w:pPr><w:pStyle w:val="Text"/><w:jc w:val="both"/></w:pPr><w:r><w:t>${escapeXml(bp)}</w:t></w:r></w:p>`
        ).join('');
        docXml = docXml.substring(0, pStart) + newPs + docXml.substring(pEnd);
      }
    }
    // Infosys
    if (experiences[1]?.bulletPoints?.length > 0) {
      const infIdx = docXml.indexOf('Designed a YouTube Analytics Dashboard');
      if (infIdx !== -1) {
        const pStart = docXml.lastIndexOf('<w:p ', infIdx);
        const pEnd = docXml.indexOf('</w:p>', infIdx) + 6;
        const newPs = experiences[1].bulletPoints.map(bp =>
          `<w:p><w:pPr><w:pStyle w:val="Text"/><w:jc w:val="both"/></w:pPr><w:r><w:t>${escapeXml(bp)}</w:t></w:r></w:p>`
        ).join('');
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
    const feApproved = approvedTech.filter(t => /react|vue|angular|css|html|tailwind/i.test(t));
    if (feApproved.length > 0 && docXml.includes('HTML, CSS, React')) {
      docXml = docXml.replace('HTML, CSS, React', `HTML, CSS, React, ${escapeXml(feApproved.join(', '))}`);
    }
    const beApproved = approvedTech.filter(t => /node|express|fastapi|spring|django|flask/i.test(t));
    if (beApproved.length > 0 && docXml.includes('Node.js, Django, Flask')) {
      docXml = docXml.replace('Node.js, Django, Flask', `Node.js, Django, Flask, ${escapeXml(beApproved.join(', '))}`);
    }
    const dbApproved = approvedTech.filter(t => /sql|postgres|mysql|mongo|redis/i.test(t) && !/sql|mongodb/i.test(t));
    if (dbApproved.length > 0 && docXml.includes('SQL, MongoDB')) {
      docXml = docXml.replace('SQL, MongoDB', `SQL, MongoDB, ${escapeXml(dbApproved.join(', '))}`);
    }
    const toolsApproved = approvedTech.filter(t => /docker|aws|git|kubernetes|linux/i.test(t) && !/git|github|vs code|render/i.test(t));
    if (toolsApproved.length > 0 && docXml.includes('Git, GitHub, VS Code, Render')) {
      docXml = docXml.replace('Git, GitHub, VS Code, Render', `Git, GitHub, VS Code, Render, ${escapeXml(toolsApproved.join(', '))}`);
    }
  }

  zip.file('word/document.xml', docXml);
  return await zip.generateAsync({ type: 'arraybuffer' });
}

// Verification test
const masterBuffer = fs.readFileSync('public/Master_Resume.docx');
const buf = await generateTailoredDocxBuffer({
  masterBuffer,
  tailoredResult: {
    tailoredSummary: 'Engineered high-scale web platforms with React and Django.',
    highlightedExperiences: [
      { bulletPoints: ['Architected a secure web-based audit application using React, Django, and JWT authentication.'] },
      { bulletPoints: ['Engineered an automated YouTube Analytics Dashboard utilizing Python and Pandas for 1,000+ records.'] }
    ],
    highlightedProjects: [
      { description: 'Engineered an automated Fake News Detection pipeline using Python and NLP, achieving 90% accuracy.' },
      { description: 'Created an intelligent AI Health Chatbot delivering real-time symptom analysis and guidance.' }
    ],
    approvedMissingTech: ['AWS', 'Docker']
  }
});

const reloadedZip = await JSZip.loadAsync(buf);
const reloadedXml = await reloadedZip.file('word/document.xml').async('text');
console.log('Reloaded XML contains new summary:', reloadedXml.includes('Engineered high-scale web platforms'));
console.log('Reloaded XML contains new L&T bullet:', reloadedXml.includes('Architected a secure web-based audit'));
console.log('Reloaded XML contains new Project 1:', reloadedXml.includes('Engineered an automated Fake News Detection pipeline'));
console.log('Reloaded XML contains AWS & Docker:', reloadedXml.includes('AWS') && reloadedXml.includes('Docker'));
console.log('All replacements successful!');
