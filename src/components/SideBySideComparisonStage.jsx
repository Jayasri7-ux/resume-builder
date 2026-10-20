import { useState } from 'react';
import {
  ArrowLeft,
  TrendingUp,
  Copy,
  Check,
  Columns2,
  FileCheck2,
  Download,
} from 'lucide-react';
import DocumentPreview from './DocumentPreview';
import TailoredDocumentPreview from './TailoredDocumentPreview';
import { exportTailoredDocx, exportTailoredPdf, categorizeApprovedSkills } from '../services/docxExportService';

export default function SideBySideComparisonStage({
  activeDocument,
  profile,
  tailoredResult,
  baselineScore,
  onBackToControls,
  onOpenUpload,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyTailoredText = () => {
    if (!tailoredResult && !profile) return;
    const summary = tailoredResult?.tailoredSummary || profile?.professionalSummary || '';
    const experiences = tailoredResult?.highlightedExperiences || profile?.workExperience || [];
    const projects = tailoredResult?.highlightedProjects || profile?.projects || [];
    const approvedTech = tailoredResult?.approvedMissingTech || [];
    const categorized = categorizeApprovedSkills(approvedTech, profile?.coreTechnicalSkills);

    const langText = [...(profile?.coreTechnicalSkills?.languages || ['Python', 'Java', 'JavaScript', 'C']), ...categorized.languages].join(', ');
    const feText = [...(profile?.coreTechnicalSkills?.frontend || ['HTML', 'CSS', 'React']), ...categorized.frontend].join(', ');
    const beText = [...(profile?.coreTechnicalSkills?.backend || ['Node.js', 'Django', 'Flask']), ...categorized.backend].join(', ');
    const dbText = [...(profile?.coreTechnicalSkills?.databases || ['SQL', 'MongoDB']), ...categorized.databases].join(', ');
    const toolsText = [...(profile?.coreTechnicalSkills?.cloudAndDevOps || ['Git', 'GitHub', 'VS Code', 'Render']), ...categorized.tools].join(', ');

    const markdownText = `# ${profile?.personalInfo?.fullName || 'Jaya Sri Palli'}
${tailoredResult?.tailoredHeadline || profile?.personalInfo?.headline || 'Full Stack Developer'}
Location: ${profile?.personalInfo?.location || 'Bangalore, India'} | Phone: ${profile?.personalInfo?.phone || '+91-7893414784'} | Email: ${profile?.personalInfo?.email || 'jayasripalli20@gmail.com'}
LinkedIn: linkedin.com/in/jayasripalli | GitHub: github.com/Jayasri7-ux

## PROFESSIONAL SUMMARY
${summary}

## TECHNICAL SKILLS
- Languages: ${langText}
- Frontend: ${feText}
- Backend: ${beText}
- Databases: ${dbText}
- Tools & Cloud: ${toolsText}
${approvedTech.length > 0 ? `- Approved Target Tech: ${approvedTech.join(', ')}` : ''}

## INTERNSHIPS
${experiences
  .map(
    (exp) => `### ${exp.company} - ${exp.title} (${exp.period || `${exp.startDate} - ${exp.endDate}`})
${exp.bulletPoints?.map((bp) => `- ${bp}`).join('\n')}`
  )
  .join('\n\n')}

## PROJECTS
${projects
  .map(
    (p) => `### ${p.name} [${p.techStack?.join(', ')}]
${p.description}`
  )
  .join('\n\n')}

## EDUCATION
${(profile?.education || [])
  .map(
    (edu) => `- ${edu.degree} (${edu.fieldOfStudy || ''}) | ${edu.institution} | Year: ${edu.graduationYear} | CGPA/Percentage: ${edu.honors || '8.77'}`
  )
  .join('\n')}

## AWARDS
${(profile?.awards || []).map((a) => `- ${a}`).join('\n')}

## CERTIFICATIONS
${(profile?.certifications || []).map((c) => `- ${c.name} (${c.issuer})`).join('\n')}
`;

    navigator.clipboard.writeText(markdownText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex flex-col h-full space-y-2.5">
      {/* Comparison Stage Navigation & Score Bar */}
      <div className="px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between gap-3 flex-wrap shadow-lg">
        {/* Left: Return to Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToControls}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 hover:text-white rounded-xl border border-slate-700 flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer shadow-sm hover:shadow-indigo-500/10"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-indigo-400" />
            <span>Back to Edit Controls</span>
          </button>

          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Columns2 className="w-4 h-4 text-indigo-400" />
              Side-by-Side Comparison
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hidden md:inline-flex items-center gap-1">
              <FileCheck2 className="w-3 h-3 text-indigo-400" />
              Step 4: Twin Preview &amp; Export
            </span>
          </div>
        </div>

        {/* Center: Before vs. After Score Alignment */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {baselineScore && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-xs font-bold font-mono text-slate-400">
                {baselineScore.overallScore}%
              </span>
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                Before (Baseline)
              </span>
            </div>
          )}

          {baselineScore && (
            <span className="text-slate-600 font-mono text-xs hidden sm:inline">→</span>
          )}

          {tailoredResult && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/30 shadow-sm">
              <div className="text-sm font-bold font-mono text-indigo-400 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>{tailoredResult.matchScore}%</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
                After (Tailored Fit)
              </span>
            </div>
          )}
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportTailoredDocx({ profile, tailoredResult })}
            title="Download Tailored Word Document (.docx)"
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download DOCX</span>
          </button>

          <button
            onClick={() => exportTailoredPdf({ profile, tailoredResult })}
            title="Download Tailored PDF Document (.pdf)"
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-rose-400" />
            <span>Download PDF</span>
          </button>

          <button
            onClick={handleCopyTailoredText}
            title="Copy Tailored Resume to Clipboard"
            className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Tailored'}</span>
          </button>
        </div>
      </div>

      {/* Zero-Scroll Side-by-Side Dual Frame Display */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 h-[calc(100vh-172px)] min-h-[660px]">
        {/* Left Side: Original Native Word Resume Layout */}
        <div className="h-full">
          <DocumentPreview
            document={activeDocument}
            defaultProfile={profile}
            onOpenUpload={onOpenUpload}
          />
        </div>

        {/* Right Side: Fully Compiled Tailored Resume Sheet */}
        <div className="h-full">
          <TailoredDocumentPreview
            profile={profile}
            tailoredResult={tailoredResult}
            onCopy={() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          />
        </div>
      </div>
    </div>
  );
}
