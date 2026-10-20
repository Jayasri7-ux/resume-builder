import JSZip from 'jszip';
import fs from 'fs';

const masterBuffer = fs.readFileSync('public/Master_Resume.docx');
const zip = await JSZip.loadAsync(masterBuffer);
const docXml = await zip.file('word/document.xml').async('text');

const idx = docXml.indexOf('basic healthcare information');
console.log('Index of healthcare:', idx);

const pStart = docXml.lastIndexOf('<w:p ', idx);
const pEnd = docXml.indexOf('</w:p>', idx) + 6;

console.log('Project 2 description paragraph in full:');
console.log(docXml.substring(pStart, pEnd));
