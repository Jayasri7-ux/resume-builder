import JSZip from 'jszip';
import fs from 'fs';

async function testReplace() {
  const masterBuffer = fs.readFileSync('public/Master_Resume.docx');
  const zip = await JSZip.loadAsync(masterBuffer);
  let docXml = await zip.file('word/document.xml').async('text');

  console.log('Original XML size:', docXml.length);

  // Check if we can find and replace the summary
  const originalSummary = 'Aspiring graduate with internship experience in software development. Passionate about building scalable applications and eager to contribute to a collaborative organization.';
  const newSummary = 'Results-driven Full Stack Engineer with proven production experience developing scalable web applications using React, Django, and AWS.';

  if (docXml.includes(originalSummary)) {
    console.log('Found exact summary in XML!');
    docXml = docXml.replace(originalSummary, newSummary);
  } else {
    console.log('Summary not found as a contiguous string. Let us find how it is split:');
    const regex = /Aspiring[\s\S]*?collaborative organization\./;
    const match = docXml.match(regex);
    if (match) {
      console.log('Matched summary span:', match[0]);
    }
  }

  // Check internships
  console.log('Has Larsen & Toubro:', docXml.includes('Larsen &amp; Toubro'));
  console.log('Has Fake News Detection System:', docXml.includes('Fake News Detection System'));
}

testReplace();
