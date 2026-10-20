import JSZip from 'jszip';
import fs from 'fs';

const masterBuffer = fs.readFileSync('public/Master_Resume.docx');
const zip = await JSZip.loadAsync(masterBuffer);
const docXml = await zip.file('word/document.xml').async('text');

const bulletText = 'Developed a web-based audit application';
const idx = docXml.indexOf(bulletText);

// Find enclosing <w:p>
const pStart = docXml.lastIndexOf('<w:p ', idx);
const pEnd = docXml.indexOf('</w:p>', idx) + 6;

console.log('Enclosing <w:p> for bullet 1:');
console.log(docXml.substring(pStart, pEnd));
