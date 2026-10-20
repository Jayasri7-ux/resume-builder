import JSZip from 'jszip';
import fs from 'fs';

async function inspectSections() {
  const masterBuffer = fs.readFileSync('public/Master_Resume.docx');
  const zip = await JSZip.loadAsync(masterBuffer);
  const docXml = await zip.file('word/document.xml').async('text');

  // Find where INTERNSHIPS begins and PROJECTS begins
  const internIdx = docXml.indexOf('INTERNSHIPS');
  const projIdx = docXml.indexOf('PROJECTS');
  const endIdx = docXml.indexOf('Education');

  console.log('INTERNSHIPS index:', internIdx);
  console.log('PROJECTS index:', projIdx);
  console.log('Education index:', endIdx);

  console.log('\n--- INTERNSHIP XML SNIPPET ---');
  console.log(docXml.substring(internIdx, internIdx + 2000));

  console.log('\n--- PROJECTS XML SNIPPET ---');
  console.log(docXml.substring(projIdx, projIdx + 2000));
}

inspectSections();
