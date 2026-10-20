import JSZip from 'jszip';
import fs from 'fs';

const buffer = fs.readFileSync('public/Master_Resume.docx');
const zip = await JSZip.loadAsync(buffer);
const docXml = await zip.file('word/document.xml').async('text');

console.log('=== All paragraphs in Master_Resume.docx ===');
const pRegex = /<w:p [^>]*>([\s\S]*?)<\/w:p>/g;
let m;
let count = 0;
while ((m = pRegex.exec(docXml)) !== null) {
  const pContent = m[1];
  const tMatches = [];
  const tRegex = /<w:t[^>]*>(.*?)<\/w:t>/g;
  let tm;
  while ((tm = tRegex.exec(pContent)) !== null) {
    tMatches.push(tm[1]);
  }
  const text = tMatches.join('');
  if (text.trim()) {
    count++;
    console.log(`[P${count}] ${text}`);
  }
}
