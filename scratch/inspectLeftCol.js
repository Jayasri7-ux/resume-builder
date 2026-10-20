import JSZip from 'jszip';
import fs from 'fs';

async function inspectLeftCol() {
  const masterBuffer = fs.readFileSync('public/Master_Resume.docx');
  const zip = await JSZip.loadAsync(masterBuffer);
  const docXml = await zip.file('word/document.xml').async('text');

  // Let's find all <w:tc> (table cells)
  const cells = docXml.split('<w:tc>');
  console.log('Total cells:', cells.length);

  // Let's check cell 1 and cell 2
  const leftColMatches = docXml.match(/<w:tcW w:w="6200"[\s\S]*?<\/w:tc>/g);
  console.log('Matches for w:w="6200":', leftColMatches?.length);
  if (leftColMatches) {
    leftColMatches.forEach((m, idx) => {
      console.log(`\n--- Cell 6200 [${idx}] (length: ${m.length}) ---`);
      const texts = [];
      const tRegex = /<w:t[^>]*>(.*?)<\/w:t>/g;
      let tm;
      while ((tm = tRegex.exec(m)) !== null) {
        texts.push(tm[1]);
      }
      console.log('Texts:', texts.join(' '));
    });
  }
}

inspectLeftCol();
