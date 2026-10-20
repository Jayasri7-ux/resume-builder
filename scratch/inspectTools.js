import JSZip from 'jszip';
import fs from 'fs';

const masterBuffer = fs.readFileSync('public/Master_Resume.docx');
const zip = await JSZip.loadAsync(masterBuffer);
const docXml = await zip.file('word/document.xml').async('text');

const tIdx = docXml.indexOf('Render');
console.log('Index of Render:', tIdx);
const pStart = docXml.lastIndexOf('<w:p ', tIdx);
const pEnd = docXml.indexOf('</w:p>', tIdx) + 6;
console.log('Tools paragraph XML:');
console.log(docXml.substring(pStart, pEnd));
