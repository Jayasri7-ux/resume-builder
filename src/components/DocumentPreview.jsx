import { useEffect, useRef, useState, useCallback } from 'react';
import { renderAsync } from 'docx-preview';
import {
  FileText,
  Download,
  ZoomIn,
  ZoomOut,
  Sparkles,
  ShieldCheck,
  Maximize,
  Minimize,
  Phone,
  Mail,
  Globe,
  Code2,
} from 'lucide-react';

export default function DocumentPreview({ document, defaultProfile, onOpenUpload }) {
  const viewportRef = useRef(null);
  const docxContainerRef = useRef(null);

  // Scaling state: 'page' (Fit-to-Page) | 'width' (Fit-to-Width) | 'custom'
  const [scaleMode, setScaleMode] = useState('page');
  const [customZoom, setCustomZoom] = useState(100);
  const [computedScale, setComputedScale] = useState(1);
  const [naturalDimensions, setNaturalDimensions] = useState({ width: 816, height: 1056 });

  const [docxRenderError, setDocxRenderError] = useState(null);
  const [docxRendering, setDocxRendering] = useState(false);
  const [defaultDocxBuffer, setDefaultDocxBuffer] = useState(null);

  // Load user's authentic Master_Resume.docx from /Master_Resume.docx on boot
  useEffect(() => {
    let ignore = false;
    if (!document || document.type === 'docx' || document.type === 'default') {
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
    }
    return () => {
      ignore = true;
    };
  }, [document]);

  // Measure and compute optimal scale for Fit-to-Page or Fit-to-Width
  const updateScaling = useCallback(() => {
    if (!viewportRef.current) return;

    const viewportW = viewportRef.current.clientWidth;
    const viewportH = viewportRef.current.clientHeight;

    // Detect natural dimensions of rendered document
    let docW = 816;
    let docH = 1056;

    if (docxContainerRef.current) {
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
  }, [scaleMode, customZoom]);

  // Render DOCX with authentic styling & colors preserved
  useEffect(() => {
    const bufferToRender = document?.arrayBuffer || defaultDocxBuffer;

    if (bufferToRender && docxContainerRef.current) {
      setDocxRendering(true);
      setDocxRenderError(null);
      docxContainerRef.current.innerHTML = '';

      // Preserve native Word document styling, exact colors, fonts, and table geometries
      renderAsync(bufferToRender, docxContainerRef.current, undefined, {
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
          // Wait for DOM layout pass, then calculate fit scale
          requestAnimationFrame(() => {
            updateScaling();
            setTimeout(updateScaling, 60);
          });
        })
        .catch((err) => {
          console.warn('[DOCX Render Warning]:', err);
          setDocxRenderError('Could not render binary Word layout. Native preview fallback active.');
          setDocxRendering(false);
        });
    }
  }, [document, defaultDocxBuffer, updateScaling]);

  // Recalculate scale on viewport resize
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

  const isPdf = document?.type === 'pdf';
  const hasDocxBuffer = Boolean(document?.arrayBuffer || defaultDocxBuffer);
  const activeFileName = document?.name || 'Master_Resume.docx';
  const displayZoomPercent = Math.round(computedScale * 100);

  // Scaled dimensions for the outer layout placeholder
  const scaledWidth = Math.floor(naturalDimensions.width * computedScale);
  const scaledHeight = Math.floor(naturalDimensions.height * computedScale);

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Top Bar with Scale & Action Controls */}
      <div className="px-4 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="truncate">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white truncate">
                {activeFileName}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase">
                Original Layout
              </span>
            </div>
            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Native Colors &amp; Styling Preserved
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

          {/* Download Original DOCX */}
          <a
            href={document?.previewUrl || '/Master_Resume.docx'}
            download={activeFileName}
            title="Download Original Master_Resume.docx"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </a>

          {/* Upload New Button */}
          <button
            onClick={onOpenUpload}
            className="ml-1 inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors shadow-sm cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-amber-300" />
            Upload New
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div
        ref={viewportRef}
        className={`flex-1 relative bg-slate-950 px-2 pt-1 pb-2 flex justify-center items-start ${
          scaleMode === 'page' ? 'overflow-hidden' : 'overflow-auto'
        }`}
      >
        {/* PDF Viewer */}
        {isPdf && document.previewUrl && (
          <div className="w-full h-full bg-slate-900 rounded-lg overflow-hidden border border-slate-800">
            <iframe
              src={`${document.previewUrl}#toolbar=0&navpanes=0`}
              className="w-full h-full border-0"
              title="Original PDF Document"
            />
          </div>
        )}

        {/* Loading Spinner */}
        {docxRendering && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/70 text-slate-300 text-xs gap-2">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span>Rendering authentic Word document styles...</span>
          </div>
        )}

        {/* Native Word Document Canvas with Proportional Scale */}
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

        {/* Fallback View: Rendered only if binary docx buffer cannot be loaded */}
        {!isPdf && !hasDocxBuffer && defaultProfile && (
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
                width: '816px',
                minHeight: '1056px',
                fontFamily: "'Franklin Gothic Medium', Arial, 'Helvetica Neue', sans-serif",
              }}
              className="bg-white text-slate-900 px-8 py-7 shadow-2xl box-border border border-slate-300"
            >
              {/* Header: Candidate Full Name in Native #2C3B57 Navy (Centered & Uppercase) */}
              <div className="mb-2 text-center">
                <h1 className="text-[32px] sm:text-[36px] font-bold tracking-tight text-[#2C3B57] leading-none mb-2 uppercase">
                  {defaultProfile.personalInfo?.fullName || 'jaya sri palli'}
                </h1>

                {/* 4-Item Contact Row with Native Color & Spacing */}
                <div className="flex items-center justify-center gap-4 text-[11px] font-medium text-[#2C3B57] pb-2 border-b border-slate-200 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3 text-[#2C3B57] shrink-0" />
                    <span>{defaultProfile.personalInfo?.phone || '+91- 7893414784'}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-[#2C3B57] shrink-0" />
                    <span>{defaultProfile.personalInfo?.email || 'jayasripalli20@gmail.com'}</span>
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
              <div className="flex gap-4 items-stretch">
                {/* Left Column (~63%): Objective, Internships, Projects */}
                <div className="w-[62.5%] flex-shrink-0 pr-1 space-y-3">
                  {/* 1. OBJECTIVE */}
                  <div>
                    <h2 className="text-[12.5px] font-bold uppercase tracking-wider text-[#2C3B57] border-b-[1.5px] border-[#2C3B57] pb-0.5 mb-1.5">
                      OBJECTIVE
                    </h2>
                    <p className="text-[10px] text-[#222222] leading-relaxed text-justify">
                      {defaultProfile.professionalSummary}
                    </p>
                  </div>

                  {/* 2. INTERNSHIPS */}
                  <div>
                    <h2 className="text-[12.5px] font-bold uppercase tracking-wider text-[#2C3B57] border-b-[1.5px] border-[#2C3B57] pb-0.5 mb-1.5">
                      INTERNSHIPS
                    </h2>
                    <div className="space-y-2">
                      {defaultProfile.workExperience?.map((exp, idx) => (
                        <div key={idx} className="text-[10px]">
                          <div className="font-bold text-[#2C3B57] text-[10.5px]">
                            {exp.company}
                          </div>
                          <div className="font-semibold text-[#111111] text-[9.5px]">
                            {exp.title} | {exp.startDate} – {exp.endDate}
                          </div>
                          <ul className="list-disc list-outside ml-3.5 text-[#222222] space-y-0.5 leading-snug mt-0.5">
                            {exp.bulletPoints?.map((bp, bIdx) => (
                              <li key={bIdx}>{bp}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 3. PROJECTS */}
                  <div>
                    <h2 className="text-[12.5px] font-bold uppercase tracking-wider text-[#2C3B57] border-b-[1.5px] border-[#2C3B57] pb-0.5 mb-1.5">
                      PROJECTS
                    </h2>
                    <div className="space-y-2">
                      {defaultProfile.projects?.map((proj, idx) => (
                        <div key={idx} className="text-[10px]">
                          <div className="font-bold text-[#2C3B57] text-[10.5px]">
                            {proj.name}
                          </div>
                          <div className="font-semibold text-[#111111] text-[9.5px]">
                            Tech: {Array.isArray(proj.techStack) ? proj.techStack.join(' | ') : proj.techStack}
                          </div>
                          <p className="text-[#222222] leading-snug mt-0.5">
                            {proj.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Column (~37%): Shaded #CADEE5 Background - Education, Skills, Awards, Certifications */}
                <div className="w-[37.5%] flex-shrink-0 bg-[#CADEE5] p-3 text-slate-900 space-y-3">
                  {/* 1. Education */}
                  <div>
                    <h2 className="text-[12.5px] font-bold uppercase tracking-wider text-[#2C3B57] border-b-[1.5px] border-[#2C3B57] pb-0.5 mb-1.5">
                      Education
                    </h2>
                    <div className="space-y-1.5 text-[9.5px]">
                      {(defaultProfile.education || []).map((edu, idx) => (
                        <div key={idx}>
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
                  <div>
                    <h2 className="text-[12.5px] font-bold uppercase tracking-wider text-[#2C3B57] border-b-[1.5px] border-[#2C3B57] pb-0.5 mb-1.5">
                      TECHNICAL SKILLS
                    </h2>
                    <div className="text-[9.5px] text-[#222222] space-y-1 leading-snug">
                      <div>
                        <strong>Languages:</strong> {defaultProfile.coreTechnicalSkills?.languages?.join(', ')}
                      </div>
                      <div>
                        <strong>Frontend:</strong> {defaultProfile.coreTechnicalSkills?.frontend?.join(', ')}
                      </div>
                      <div>
                        <strong>Backend:</strong> {defaultProfile.coreTechnicalSkills?.backend?.join(', ')}
                      </div>
                      <div>
                        <strong>Database:</strong> {defaultProfile.coreTechnicalSkills?.databases?.join(', ')}
                      </div>
                      <div>
                        <strong>Tools:</strong> {defaultProfile.coreTechnicalSkills?.cloudAndDevOps?.join(', ')}
                      </div>
                    </div>
                  </div>

                  {/* 3. AWARDS */}
                  {defaultProfile.awards && defaultProfile.awards.length > 0 && (
                    <div>
                      <h2 className="text-[12.5px] font-bold uppercase tracking-wider text-[#2C3B57] border-b-[1.5px] border-[#2C3B57] pb-0.5 mb-1.5">
                        AWARDS
                      </h2>
                      <ul className="list-disc list-outside ml-3.5 text-[9.5px] text-[#222222] space-y-0.5 leading-snug">
                        {defaultProfile.awards.map((award, idx) => (
                          <li key={idx}>{award}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 4. CERTIFICATIONS */}
                  {defaultProfile.certifications && defaultProfile.certifications.length > 0 && (
                    <div>
                      <h2 className="text-[12.5px] font-bold uppercase tracking-wider text-[#2C3B57] border-b-[1.5px] border-[#2C3B57] pb-0.5 mb-1.5">
                        CERTIFICATIONS
                      </h2>
                      <ul className="list-disc list-outside ml-3.5 text-[9.5px] text-[#222222] space-y-0.5 leading-snug">
                        {defaultProfile.certifications.map((c, idx) => (
                          <li key={idx}>
                            {c.name} – {c.issuer}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
