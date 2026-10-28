import { useRef, useState, useEffect, useCallback } from 'react';
import { renderAsync } from 'docx-preview';
import {
  Copy,
  Check,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  ShieldCheck,
  Sparkles,
  Phone,
  Mail,
  Globe,
  Code2,
  FileText,
  ChevronDown,
} from 'lucide-react';
import {
  exportTailoredDocx,
  exportTailoredPdf,
  generateTailoredDocxBuffer,
  categorizeApprovedSkills,
  computeDynamicContentSpacing,
} from '../services/docxExportService';

export default function TailoredDocumentPreview({
  profile,
  tailoredResult,
  onCopy,
}) {
  const viewportRef = useRef(null);
  const docxContainerRef = useRef(null);
  const contentRef = useRef(null);

  // Scaling state: 'page' (Fit-to-Page) | 'width' (Fit-to-Width) | 'custom'
  const [scaleMode, setScaleMode] = useState('page');
  const [customZoom, setCustomZoom] = useState(100);
  const [computedScale, setComputedScale] = useState(1);
  const [naturalDimensions, setNaturalDimensions] = useState({ width: 816, height: 1056 });
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const [docxRenderError, setDocxRenderError] = useState(null);
  const [docxRendering, setDocxRendering] = useState(false);
  const [defaultDocxBuffer, setDefaultDocxBuffer] = useState(null);
  const [tailoredDocxBuffer, setTailoredDocxBuffer] = useState(null);

  // Load authentic Master_Resume.docx template on boot
  useEffect(() => {
    let ignore = false;
    fetch('/Master_Resume.docx')
      .then((res) => {
        if (res.ok) return res.arrayBuffer();
        throw new Error('Local docx not found in public/');
      })
      .then((buffer) => {
        if (!ignore) {
          setDefaultDocxBuffer(buffer);
        }
      })
      .catch(() => {
        // Fallback view will render if fetch fails
      });
    return () => {
      ignore = true;
    };
  }, []);

  // Generate tailored docx buffer whenever masterBuffer or tailoredResult changes
  useEffect(() => {
    let ignore = false;
    if (defaultDocxBuffer) {
      generateTailoredDocxBuffer({
        masterBuffer: defaultDocxBuffer,
        profile,
        tailoredResult,
      })
        .then((buf) => {
          if (!ignore && buf) {
            setTailoredDocxBuffer(buf);
          }
        })
        .catch((err) => {
          console.warn('Could not compile tailored buffer:', err);
        });
    }
    return () => {
      ignore = true;
    };
  }, [defaultDocxBuffer, tailoredResult, profile]);

  // Measure and compute optimal scale for Fit-to-Page or Fit-to-Width
  const updateScaling = useCallback(() => {
    if (!viewportRef.current) return;

    const viewportW = viewportRef.current.clientWidth;
    const viewportH = viewportRef.current.clientHeight;

    let docW = 816;
    let docH = 1056;

    if (docxContainerRef.current && tailoredDocxBuffer) {
      const wrapper = docxContainerRef.current.querySelector('.docx-wrapper');
      const section =
        docxContainerRef.current.querySelector('section.docx') ||
        docxContainerRef.current.querySelector('article.docx');

      if (section && section.offsetWidth > 0) {
        docW = section.offsetWidth;
      } else if (wrapper && wrapper.offsetWidth > 0) {
        docW = wrapper.offsetWidth;
      }

      if (wrapper && wrapper.scrollHeight > 0) {
        docH = wrapper.scrollHeight;
      } else if (section && section.offsetHeight > 0) {
        docH = section.offsetHeight;
      }
    } else if (contentRef.current && contentRef.current.offsetHeight > 0) {
      docH = Math.max(1056, contentRef.current.offsetHeight);
    }

    setNaturalDimensions({ width: docW, height: docH });

    // Available space accounting for container padding (px-2 pt-1 pb-2)
    const availW = Math.max(100, viewportW - 16);
    const availH = Math.max(100, viewportH - 12);

    const fitPage = Math.min(availW / docW, availH / docH);
    const fitWidth = availW / docW;

    if (scaleMode === 'page') {
      setComputedScale(fitPage);
    } else if (scaleMode === 'width') {
      setComputedScale(fitWidth);
    } else {
      setComputedScale(customZoom / 100);
    }
  }, [scaleMode, customZoom, tailoredDocxBuffer]);

  // Render DOCX with authentic styling, exact fonts, centered title & colors preserved via docx-preview
  useEffect(() => {
    if (tailoredDocxBuffer && docxContainerRef.current) {
      setDocxRendering(true);
      setDocxRenderError(null);
      docxContainerRef.current.innerHTML = '';

      renderAsync(tailoredDocxBuffer, docxContainerRef.current, undefined, {
        className: 'docx',
        inWrapper: true,
        ignoreWidth: false,   // Preserves authentic Word page width
        ignoreHeight: false,  // Preserves authentic Word page height
        ignoreFonts: false,   // Preserves authentic Word fonts
        breakPages: true,     // Preserves Word pagination & boundaries
        useBase64URL: true,   // Renders embedded images/icons
        experimental: false,
        trimXml: true,
      })
        .then(() => {
          setDocxRendering(false);
          requestAnimationFrame(() => {
            updateScaling();
            setTimeout(updateScaling, 60);
          });
        })
        .catch((err) => {
          console.warn('[Tailored DOCX Render Warning]:', err);
          setDocxRenderError('Could not render binary Word layout. Native preview fallback active.');
          setDocxRendering(false);
        });
    }
  }, [tailoredDocxBuffer, updateScaling]);

  // Recalculate on mount, tailoredResult changes, and window resize
  useEffect(() => {
    updateScaling();
    const timer = setTimeout(updateScaling, 50);
    return () => clearTimeout(timer);
  }, [updateScaling, tailoredResult]);

  useEffect(() => {
    if (!viewportRef.current) return;
    const observer = new ResizeObserver(() => {
      updateScaling();
    });
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [updateScaling]);

  // Zoom controls
  const handleFitPage = () => {
    setScaleMode('page');
  };

  const handleFitWidth = () => {
    setScaleMode('width');
  };

  const handleZoomIn = () => {
    setScaleMode('custom');
    setCustomZoom(Math.min(Math.round(computedScale * 100) + 10, 200));
  };

  const handleZoomOut = () => {
    setScaleMode('custom');
    setCustomZoom(Math.max(Math.round(computedScale * 100) - 10, 40));
  };

  // Compile full plain text for clipboard copy
  const generateCompiledText = () => {
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

    return `${(profile?.personalInfo?.fullName || 'jaya sri palli').toUpperCase()}
+91- 7893414784   jayasripalli20@gmail.com   linkedin.com/in/jayasripalli   github.com/Jayasri7-ux

OBJECTIVE
${summary}

INTERNSHIPS
${experiences
  .map(
    (exp) => `${exp.company}
${exp.title} | ${exp.period || `${exp.startDate} – ${exp.endDate}`}
${exp.bulletPoints?.map((bp) => `• ${bp}`).join('\n')}`
  )
  .join('\n\n')}

PROJECTS
${projects
  .map(
    (p) => `${p.name}
Tech: ${Array.isArray(p.techStack) ? p.techStack.join(' | ') : p.techStack}
${p.description}`
  )
  .join('\n\n')}

Education
${(profile?.education || [])
  .map(
    (edu) => `${edu.degree}${edu.fieldOfStudy ? ` (${edu.fieldOfStudy})` : ''} | ${edu.graduationYear}
${edu.institution} | CGPA/Percentage: ${edu.honors || '8.77'}`
  )
  .join('\n')}

TECHNICAL SKILLS
- Languages: ${langText}
- Frontend: ${feText}
- Backend: ${beText}
- Database: ${dbText}
- Tools: ${toolsText}
${approvedTech.length > 0 ? `- Approved Target Stack: ${approvedTech.join(', ')}` : ''}

AWARDS
${(profile?.awards || []).map((a) => `• ${a}`).join('\n')}

CERTIFICATIONS
${(profile?.certifications || []).map((c) => `• ${c.name} – ${c.issuer}`).join('\n')}
`;
  };

  const handleCopy = () => {
    const text = generateCompiledText();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (onCopy) onCopy();
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Export as Word Document (.docx)
  const handleDownloadDocx = async () => {
    try {
      setIsExporting(true);
      setExportMenuOpen(false);
      await exportTailoredDocx({
        profile,
        tailoredResult,
        filename: 'Tailored_Resume.docx',
      });
    } catch (err) {
      console.error('Failed to export DOCX:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Export as PDF Document (.pdf)
  const handleDownloadPdf = () => {
    try {
      setIsExporting(true);
      setExportMenuOpen(false);
      exportTailoredPdf({
        profile,
        tailoredResult,
        filename: 'Tailored_Resume.pdf',
      });
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const displayZoomPercent = Math.round(computedScale * 100);
  const scaledWidth = Math.floor(naturalDimensions.width * computedScale);
  const scaledHeight = Math.floor(naturalDimensions.height * computedScale);

  const approvedTech = tailoredResult?.approvedMissingTech || [];
  const categorizedSkills = categorizeApprovedSkills(approvedTech, profile?.coreTechnicalSkills);
  const experiences = tailoredResult?.highlightedExperiences || profile?.workExperience || [];
  const projects = tailoredResult?.highlightedProjects || profile?.projects || [];
  const hasDocxBuffer = Boolean(tailoredDocxBuffer);

  // Dynamic Content Spacing & Overflow Control
  const { previewSpacing } = computeDynamicContentSpacing({
    summary: tailoredResult?.tailoredSummary || profile?.professionalSummary || '',
    experiences,
    projects,
    approvedTech,
    profile,
  });

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Top Bar with Scale & Action Controls */}
      <div className="px-4 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
            <Sparkles className="w-4 h-4 text-amber-300" />
          </div>
          <div className="truncate">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white truncate">
                Tailored_Resume.docx
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase">
                Twin Template
              </span>
            </div>
            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Two-Column Native Layout &amp; Tokens Preserved
            </span>
          </div>
        </div>

        {/* Scaling Mode & Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Fit Page Button */}
          <button
            onClick={handleFitPage}
            title="Fit to Page (Entire document visible at a glance without scrolling)"
            className={`px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 font-medium ${
              scaleMode === 'page'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            <Maximize className="w-3 h-3" />
            <span className="hidden sm:inline">Fit Page</span>
          </button>

          {/* Fit Width Button */}
          <button
            onClick={handleFitWidth}
            title="Fit to Width (Scales page to container width)"
            className={`px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 font-medium ${
              scaleMode === 'width'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            <Minimize className="w-3 h-3" />
            <span className="hidden sm:inline">Fit Width</span>
          </button>

          {/* Zoom Out */}
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          {/* Percentage Indicator */}
          <span className="text-[11px] font-mono text-slate-300 min-w-[42px] text-center">
            {displayZoomPercent}%
          </span>

          {/* Zoom In */}
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            title="Copy Tailored Resume to Clipboard"
            className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-xs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {/* Document Export Controls (Word .docx & PDF) */}
          <div className="relative">
            <div className="inline-flex rounded-lg shadow-sm">
              <button
                onClick={handleDownloadDocx}
                disabled={isExporting}
                title="Download Tailored Word Document (.docx)"
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-l-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isExporting ? 'Generating...' : 'Download DOCX'}</span>
              </button>
              <button
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                className="px-1.5 py-1 bg-indigo-700 hover:bg-indigo-600 text-white rounded-r-lg border-l border-indigo-500/40 text-xs transition-colors cursor-pointer"
                title="More export formats (PDF)"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {/* Export Format Dropdown */}
            {exportMenuOpen && (
              <div className="absolute right-0 mt-1 w-44 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 z-30 animate-fadeIn">
                <button
                  onClick={handleDownloadDocx}
                  className="w-full px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 hover:text-white flex items-center gap-2 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Word Document (.docx)</span>
                </button>
                <button
                  onClick={handleDownloadPdf}
                  className="w-full px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 hover:text-white flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>PDF Document (.pdf)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div
        ref={viewportRef}
        className={`flex-1 relative bg-slate-950 px-2 pt-1 pb-2 flex justify-center items-start ${
          scaleMode === 'page' ? 'overflow-hidden' : 'overflow-auto'
        }`}
      >
        {/* Loading Spinner */}
        {docxRendering && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/70 text-slate-300 text-xs gap-2">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span>Rendering authentic Word document styles...</span>
          </div>
        )}

        {/* Native Word Document Canvas with Proportional Scale (docx-preview Twin) */}
        {hasDocxBuffer && (
          <div
            style={{
              width: `${scaledWidth}px`,
              height: `${scaledHeight}px`,
              position: 'relative',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                transform: `scale(${computedScale})`,
                transformOrigin: 'top left',
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${naturalDimensions.width}px`,
              }}
            >
              {docxRenderError && (
                <div className="p-2 mb-2 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                  {docxRenderError}
                </div>
              )}
              {/* Native docx-preview render target: zero CSS overrides on document internals */}
              <div ref={docxContainerRef} />
            </div>
          </div>
        )}

        {/* Scaled Twin Picture Frame Fallback View (Rendered only if binary docx buffer cannot be loaded) */}
        {!hasDocxBuffer && (
          <div
            style={{
              width: `${scaledWidth}px`,
              height: `${scaledHeight}px`,
              position: 'relative',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <div
              ref={contentRef}
              style={{
                transform: `scale(${computedScale})`,
                transformOrigin: 'top left',
                position: 'absolute',
                top: 0,
                left: 0,
                width: '816px',
                minHeight: '1056px',
                fontFamily: "'Franklin Gothic Medium', Arial, 'Helvetica Neue', sans-serif",
              }}
              className="bg-white text-slate-900 px-8 py-7 shadow-2xl box-border border border-slate-300 flex flex-col justify-start"
            >
              {/* Header: Candidate Full Name in Native #2C3B57 Navy (Centered & Uppercase) */}
              <div className="mb-2 text-center">
                <h1 className="text-[32px] sm:text-[36px] font-bold tracking-tight text-[#2C3B57] leading-none mb-2 uppercase">
                  {profile?.personalInfo?.fullName || 'jaya sri palli'}
                </h1>

                {/* 4-Item Contact Row with Native Color & Spacing */}
                <div className="flex items-center justify-center gap-4 text-[11px] font-medium text-[#2C3B57] pb-2 border-b border-slate-200 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3 text-[#2C3B57] shrink-0" />
                    <span>{profile?.personalInfo?.phone || '+91- 7893414784'}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-[#2C3B57] shrink-0" />
                    <span>{profile?.personalInfo?.email || 'jayasripalli20@gmail.com'}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-[#2C3B57] shrink-0" />
                    <span>linkedin.com/in/jayasripalli</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Code2 className="w-3 h-3 text-[#2C3B57] shrink-0" />
                    <span>github.com/Jayasri7-ux</span>
                  </span>
                </div>
              </div>

              {/* Two-Column Grid: Exact Twin of Master_Resume.docx (63% Left, 37% Right #CADEE5) */}
              <div className="flex gap-4 items-start resume-print-container">
                {/* Left Column (~63%): Objective, Internships, Projects */}
                <div className={`w-[62.5%] flex-shrink-0 pr-1 flex flex-col justify-start resume-print-left ${previewSpacing.leftSpaceY}`}>
                  {/* 1. OBJECTIVE */}
                  <div className="flex flex-col justify-start">
                    <h2 className="text-[12.5px] font-bold uppercase tracking-wider text-[#2C3B57] border-b-[1.5px] border-[#2C3B57] pb-0.5 mb-1.5">
                      OBJECTIVE
                    </h2>
                    <p className={`text-[10px] text-[#222222] ${previewSpacing.lineHeightClass} text-justify`}>
                      {tailoredResult?.tailoredSummary || profile?.professionalSummary}
                    </p>
                  </div>

                  {/* 2. INTERNSHIPS */}
                  <div className="flex flex-col justify-start">
                    <h2 className="text-[12.5px] font-bold uppercase tracking-wider text-[#2C3B57] border-b-[1.5px] border-[#2C3B57] pb-0.5 mb-1.5">
                      INTERNSHIPS
                    </h2>
                    <div className="flex flex-col justify-start space-y-1.5">
                      {experiences.map((exp, idx) => (
                        <div key={idx} className="flex flex-col justify-start text-[10px]">
                          <div className="font-bold text-[#2C3B57] text-[10.5px]">
                            {exp.company}
                          </div>
                          <div className="font-semibold text-[#111111] text-[9.5px]">
                            {exp.title} | {exp.period || `${exp.startDate} – ${exp.endDate}`}
                          </div>
                          <ul className={`list-disc list-outside ml-3.5 text-[#222222] ${previewSpacing.bulletSpaceY} ${previewSpacing.lineHeightClass} mt-0.5`}>
                            {exp.bulletPoints?.map((bp, bIdx) => (
                              <li key={bIdx}>{bp}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 3. PROJECTS */}
                  <div className="flex flex-col justify-start">
                    <h2 className="text-[12.5px] font-bold uppercase tracking-wider text-[#2C3B57] border-b-[1.5px] border-[#2C3B57] pb-0.5 mb-1.5">
                      PROJECTS
                    </h2>
                    <div className="flex flex-col justify-start space-y-1.5">
                      {projects.map((proj, idx) => (
                        <div key={idx} className="flex flex-col justify-start text-[10px]">
                          <div className="font-bold text-[#2C3B57] text-[10.5px]">
                            {proj.name}
                          </div>
                          <div className="font-semibold text-[#111111] text-[9.5px]">
                            Tech: {Array.isArray(proj.techStack) ? proj.techStack.join(' | ') : proj.techStack}
                          </div>
                          <p className={`text-[#222222] ${previewSpacing.lineHeightClass} mt-0.5`}>
                            {proj.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Column (~37%): Shaded #CADEE5 Background - Education, Skills, Awards, Certifications */}
                <div className={`w-[37.5%] flex-shrink-0 bg-[#CADEE5] p-3 text-slate-900 flex flex-col justify-start resume-print-right ${previewSpacing.sidebarSpaceY}`}>
                  {/* 1. Education */}
                  <div className="flex flex-col justify-start">
                    <h2 className="text-[12.5px] font-bold uppercase tracking-wider text-[#2C3B57] border-b-[1.5px] border-[#2C3B57] pb-0.5 mb-1.5">
                      Education
                    </h2>
                    <div className="flex flex-col justify-start space-y-1 text-[9.5px]">
                      {(profile?.education || []).map((edu, idx) => (
                        <div key={idx} className="flex flex-col justify-start">
                          <div className="font-bold text-[#111111]">
                            {edu.degree}{edu.fieldOfStudy ? ` (${edu.fieldOfStudy})` : ''} | {edu.graduationYear}
                          </div>
                          <div className="text-[#333333]">
                            {edu.institution} | CGPA : {edu.honors || '8.77'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 2. TECHNICAL SKILLS */}
                  <div className="flex flex-col justify-start">
                    <h2 className="text-[12.5px] font-bold uppercase tracking-wider text-[#2C3B57] border-b-[1.5px] border-[#2C3B57] pb-0.5 mb-1.5">
                      TECHNICAL SKILLS
                    </h2>
                    <div className={`flex flex-col justify-start text-[9.5px] text-[#222222] space-y-1 ${previewSpacing.sidebarTextLeading}`}>
                      <div>
                        <strong>Languages:</strong> {profile?.coreTechnicalSkills?.languages?.join(', ') || 'Python, Java, JavaScript, C'}
                        {categorizedSkills.languages.length > 0 && (
                          <span className="font-bold text-[#2C3B57]">
                            , {categorizedSkills.languages.join(', ')}
                          </span>
                        )}
                      </div>
                      <div>
                        <strong>Frontend:</strong> {profile?.coreTechnicalSkills?.frontend?.join(', ') || 'HTML, CSS, React'}
                        {categorizedSkills.frontend.length > 0 && (
                          <span className="font-bold text-[#2C3B57]">
                            , {categorizedSkills.frontend.join(', ')}
                          </span>
                        )}
                      </div>
                      <div>
                        <strong>Backend:</strong> {profile?.coreTechnicalSkills?.backend?.join(', ') || 'Node.js, Django, Flask'}
                        {categorizedSkills.backend.length > 0 && (
                          <span className="font-bold text-[#2C3B57]">
                            , {categorizedSkills.backend.join(', ')}
                          </span>
                        )}
                      </div>
                      <div>
                        <strong>Database:</strong> {profile?.coreTechnicalSkills?.databases?.join(', ') || 'SQL, MongoDB'}
                        {categorizedSkills.databases.length > 0 && (
                          <span className="font-bold text-[#2C3B57]">
                            , {categorizedSkills.databases.join(', ')}
                          </span>
                        )}
                      </div>
                      <div>
                        <strong>Tools:</strong> {profile?.coreTechnicalSkills?.cloudAndDevOps?.join(', ') || 'Git, GitHub, VS Code, Render'}
                        {categorizedSkills.tools.length > 0 && (
                          <span className="font-bold text-[#2C3B57]">
                            , {categorizedSkills.tools.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 3. AWARDS */}
                  <div className="flex flex-col justify-start">
                    <h2 className="text-[12.5px] font-bold uppercase tracking-wider text-[#2C3B57] border-b-[1.5px] border-[#2C3B57] pb-0.5 mb-1.5">
                      AWARDS
                    </h2>
                    <ul className="text-[9.5px] text-[#222222] space-y-1 list-disc list-outside ml-3.5">
                      {(profile?.awards || []).map((award, idx) => (
                        <li key={idx}>{award}</li>
                      ))}
                    </ul>
                  </div>

                  {/* 4. CERTIFICATIONS */}
                  <div className="flex flex-col justify-start">
                    <h2 className="text-[12.5px] font-bold uppercase tracking-wider text-[#2C3B57] border-b-[1.5px] border-[#2C3B57] pb-0.5 mb-1.5">
                      CERTIFICATIONS
                    </h2>
                    <ul className="text-[9.5px] text-[#222222] space-y-1 list-disc list-outside ml-3.5">
                      {(profile?.certifications || []).map((cert, idx) => (
                        <li key={idx}>
                          {cert.name} &ndash; {cert.issuer}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
