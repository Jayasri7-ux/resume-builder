import JSZip from 'jszip';
import fs from 'fs';

const masterBuffer = fs.readFileSync('public/Master_Resume.docx');
const zip = await JSZip.loadAsync(masterBuffer);
const docXml = await zip.file('word/document.xml').async('text');

console.log('Includes React</w:t>:', docXml.includes('React</w:t>'));
console.log('Includes Flask</w:t>:', docXml.includes('Flask</w:t>'));
console.log('Includes MongoDB</w:t>:', docXml.includes('MongoDB</w:t>'));
console.log('Includes Render</w:t>:', docXml.includes('Render</w:t>'));
