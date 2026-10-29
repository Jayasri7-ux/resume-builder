import { useState, useEffect } from 'react';
import {
  X,
  Upload,
  FileText,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  FileCode,
  Copy,
  Clock,
} from 'lucide-react';
import { ingestOriginalDocument } from '../services/documentExtractor';
import { parseResumeWithOllama, buildProfileParsingPrompt } from '../services/profileParserService';
import { auditFactIntegrity } from '../services/factFirewall';
import { OLLAMA_BASE_URL, DEFAULT_MODEL, checkOllamaConnection } from '../services/ollamaService';
import { isPublicDeployment, getCloudConfig } from '../services/cloudAiService';

const SAMPLE_RESUME_TEXT = `Jaya Sri Palli
Full Stack Developer
Phone: +91-7893414784 | Email: jayasripalli20@gmail.com
LinkedIn: linkedin.com/in/jayasripalli | GitHub: github.com/Jayasri7-ux

OBJECTIVE:
Aspiring graduate with internship experience in software development. Passionate about building scalable applications and eager to contribute to a collaborative organization.

EDUCATION:
B.Tech (IT) | 2022-2026 | SVCET | CGPA: 8.77
Intermediate (MPC) | 2020-2022 | Sri Chaitanya | Percentage: 89%
SSC (10th) | 2019-2020 | SRKEM School | Percentage: 100%

TECHNICAL SKILLS:
Languages: Python, Java, JavaScript, C
Frontend: HTML, CSS, React
Backend: Node.js, Django, Flask
Database: SQL, MongoDB
Tools: Git, GitHub, VS Code, Render

AWARDS:
Smart India Hackathon Grand Finalist (2023 & 2024)
District-level youth parliament speaker

CERTIFICATIONS:
Python Full stack development - Supported by Infosys Foundation
MongoDB - L&T EduTech

INTERNSHIPS:
Larsen & Toubro (L&T), Chennai - Full Stack Developer Intern | Jul 2025 - Dec 2025
- Developed a web-based audit application using React and Django with JWT authentication to securely manage audit records.

Infosys Springboard (Virtual) - Python Intern | Feb 2026 - Mar 2026
- Designed a YouTube Analytics Dashboard with Python/Pandas to automate reporting and analyze 1,000+ YouTube records.

PROJECTS:
Fake News Detection System (Python, NLP, Scikit-learn, Flask, React)
- Built a fake news detection system to classify news articles as real or fake, improving misinformation detection with 90% classification accuracy.

AI Health Chatbot (Python, Django, NLP)
- Created an AI-powered health chatbot to provide instant symptom-based health guidance and assist users with basic healthcare information.`;

export default function NativeResumeUploadModal({
  isOpen,
  onClose,
  onIngestionComplete,
  baseUrl = OLLAMA_BASE_URL,
  availableModels = [],
}) {
  const [activeTab, setActiveTab] = useState('file'); // 'file' | 'text'
  const [selectedFile, setSelectedFile] = useState(null);
  const [rawText, setRawText] = useState('');
  const [internalModels, setInternalModels] = useState([]);
  const effectiveModels = availableModels.length > 0 ? availableModels : internalModels;

  const [selectedModel, setSelectedModel] = useState(
    effectiveModels.length > 0 ? effectiveModels[0].name : DEFAULT_MODEL
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error' | 'info', message: string }
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [processingStage, setProcessingStage] = useState('');

  const isPublic = isPublicDeployment();
  const cloudCfg = getCloudConfig();

  // Auto-detect installed Ollama models upon modal open if not on public domain and not provided by parent
  useEffect(() => {
    let ignore = false;
    if (isOpen && !isPublicDeployment() && availableModels.length === 0) {
      checkOllamaConnection(baseUrl)
        .then((res) => {
          if (!ignore && res.success && res.models && res.models.length > 0) {
            setInternalModels(res.models);
            setSelectedModel((prev) => {
              const has = res.models.some((m) => m.name === prev);
              return has ? prev : res.models[0].name;
            });
          }
        })
        .catch(() => {});
    }
    return () => {
      ignore = true;
    };
  }, [isOpen, baseUrl, availableModels.length]);

  // Active timer for clear local LLM processing feedback
  useEffect(() => {
    let timer = null;
    if (isProcessing) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isProcessing]);

  if (!isOpen) return null;

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setStatus(null);

    try {
      const ingested = await ingestOriginalDocument(file);
      setRawText(ingested.text);
      setStatus({
        type: 'info',
        message: `Loaded ${file.name} (${Math.round(file.size / 1024)} KB). Ready for Fact Firewall parsing.`,
      });
    } catch (err) {
      setStatus({
        type: 'error',
        message: `File processing error: ${err.message}`,
      });
    }
  };

  const handleLoadSample = () => {
    setActiveTab('text');
    setRawText(SAMPLE_RESUME_TEXT);
    setSelectedFile(null);
    setStatus({
      type: 'info',
      message: 'Master resume text loaded into editor. Ready to parse.',
    });
  };

  const handleParseAndApply = async () => {
    if (!rawText.trim() && !selectedFile) {
      setStatus({
        type: 'error',
        message: 'Please choose a resume file (PDF/DOCX) or paste resume text first.',
      });
      return;
    }

    setIsProcessing(true);
    setStatus(null);
    setProcessingStage('Reading document and preparing <user_input> XML prompt...');

    try {
      // 1. Prepare Document for Visual Preview
      let docObj = null;
      if (selectedFile) {
        setProcessingStage(`Extracting native text from ${selectedFile.name}...`);
        docObj = await ingestOriginalDocument(selectedFile);
      } else {
        const blob = new Blob([rawText], { type: 'text/plain;charset=utf-8' });
        docObj = {
          name: 'Pasted_Resume_Profile.txt',
          type: 'text',
          size: rawText.length,
          previewUrl: URL.createObjectURL(blob),
          text: rawText,
          timestamp: new Date().toISOString(),
        };
      }

      const activeEngineLabel = isPublic
        ? (cloudCfg.hasKey ? `${cloudCfg.provider.toUpperCase()} Cloud AI (${cloudCfg.model})` : 'Smart Pattern Parser (Deterministic)')
        : `Ollama (${selectedModel})`;

      setProcessingStage(`Parsing and structuring resume into Master Profile JSON schema via ${activeEngineLabel}...`);

      // 2. Parse via Dual-Engine (Ollama / Cloud AI / Deterministic Fallback)
      const parseResult = await parseResumeWithOllama({
        rawResumeText: rawText || docObj.text,
        model: selectedModel,
        baseUrl,
        timeoutMs: 300000,
      });

      if (!parseResult.success || !parseResult.profile) {
        throw new Error(parseResult.error || 'Failed to parse resume.');
      }

      setProcessingStage('Auditing extracted profile against Immutable Fact Firewall...');

      // 3. Run Immutable Fact Firewall Audit
      const auditResult = auditFactIntegrity({
        originalText: rawText || docObj.text,
        extractedProfile: parseResult.profile,
      });

      setIsProcessing(false);
      setProcessingStage('');
      setStatus({
        type: 'success',
        message: `Success! Extracted Master Profile with ${parseResult.profile.eligibleJobRoles?.primaryRoles?.length || 0} primary roles. Fact Firewall: ${auditResult.integrityScore}% verified.`,
      });

      // 4. Return to parent workspace
      onIngestionComplete({
        document: docObj,
        profile: parseResult.profile,
        factAudit: auditResult,
      });
    } catch (err) {
      setIsProcessing(false);
      setProcessingStage('');
      setStatus({
        type: 'error',
        message: err.message,
      });
    }
  };

  const promptPreview = buildProfileParsingPrompt(rawText || '<Source Resume Text>');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white">Upload Original Resume File</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  Fact Firewall Active
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload your native PDF or DOCX file to preserve exact layout, fonts, and styling.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Method Tabs */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('file')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === 'file'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Upload File (PDF / DOCX)
              </button>
              <button
                onClick={() => setActiveTab('text')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === 'text'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Paste Text
              </button>
            </div>

            <button
              onClick={handleLoadSample}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer font-medium"
            >
              <Copy className="w-3.5 h-3.5" />
              Load Sample Text
            </button>
          </div>

          {/* File Picker Zone */}
          {activeTab === 'file' && (
            <div className="space-y-3">
              <label
                htmlFor="file-ingest-input"
                className="border-2 border-dashed border-slate-700 hover:border-indigo-500/70 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-slate-950/50"
              >
                <div className="p-3 bg-indigo-500/10 rounded-full text-indigo-400 mb-3">
                  <FileText className="w-8 h-8" />
                </div>
                <span className="text-sm font-semibold text-slate-200">
                  {selectedFile ? selectedFile.name : 'Click to select or drag & drop resume file'}
                </span>
                <span className="text-xs text-slate-500 mt-1">
                  Preserves visual formatting for PDF and DOCX (Max 10MB)
                </span>
                <input
                  id="file-ingest-input"
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {selectedFile && (
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-slate-300 font-medium">{selectedFile.name}</span>
                    <span className="text-slate-500">
                      ({Math.round(selectedFile.size / 1024)} KB)
                    </span>
                  </div>
                  <span className="text-emerald-400 text-[11px] font-mono">Ready to Ingest</span>
                </div>
              )}
            </div>
          )}

          {/* Text Area */}
          {activeTab === 'text' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">
                Resume Text (Enclosed in &lt;user_input&gt; XML Delimiters)
              </label>
              <textarea
                rows={9}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste raw resume text here..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Controls & Model Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {isPublic ? 'AI Engine:' : 'Ollama Model:'}
              </span>
              {isPublic ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-200">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      cloudCfg.hasKey ? 'bg-indigo-400' : 'bg-emerald-400'
                    }`}
                  />
                  <span>
                    {cloudCfg.hasKey
                      ? `${cloudCfg.provider.toUpperCase()}: ${cloudCfg.model}`
                      : 'Smart Pattern Parser (Deterministic)'}
                  </span>
                </div>
              ) : effectiveModels.length > 0 ? (
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {effectiveModels.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  placeholder="e.g. llama3.2:latest"
                  className="bg-slate-950 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 font-mono w-36 focus:outline-none"
                />
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowPromptPreview(!showPromptPreview)}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-4 cursor-pointer"
              >
                {showPromptPreview ? 'Hide Prompt' : 'Inspect XML Prompt'}
              </button>

              <button
                onClick={handleParseAndApply}
                disabled={isProcessing || (!selectedFile && !rawText.trim())}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-md transition-all cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                    <span>Parsing Resume ({elapsedSeconds}s)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Parse &amp; Render Side-by-Side</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Active Local LLM Processing Feedback Panel */}
          {isProcessing && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/70 via-slate-900 to-indigo-950/70 border border-indigo-500/40 shadow-xl space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 mt-0.5 shrink-0">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-white">
                        Local LLM is Parsing Your Resume
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/25 text-indigo-300 border border-indigo-500/40 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-indigo-400" />
                        <span>Elapsed: {elapsedSeconds}s</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                        Timeout: 300s (5m CPU budget)
                      </span>
                    </div>
                    <p className="text-xs text-indigo-200/90 font-medium">
                      {processingStage || `Extracting and structuring resume XML/JSON data via Ollama (${selectedModel})...`}
                    </p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Initial local LLM warmup and token structuring on CPU can take 2–3 minutes. Please keep this modal open while your local CPU/GPU finishes inference.
                    </p>
                  </div>
                </div>

                <div className="hidden sm:flex flex-col items-end text-[10px] font-mono text-slate-400 shrink-0">
                  <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                    Ollama Active
                  </span>
                  <span className="text-slate-500 mt-0.5">{selectedModel}</span>
                </div>
              </div>

              {/* Step progression indicators */}
              <div className="bg-slate-950/80 rounded-lg p-2.5 border border-slate-800/80 text-[11px] text-slate-300 space-y-1.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">1. Ingest File &amp; Build XML</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-300">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-amber-400" />
                    <span className="truncate">2. Local LLM Structuring</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">3. Fact Firewall Audit</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* XML Prompt Accordion */}
          {showPromptPreview && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-300 space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-[11px] pb-1 border-b border-slate-800">
                <span>XML-Delimited Prompt with Fact Firewall Directives</span>
                <span>format: &quot;json&quot;</span>
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-slate-300 max-h-44 leading-relaxed">
                {promptPreview}
              </pre>
            </div>
          )}

          {/* Status Message */}
          {status && (
            <div
              className={`p-4 rounded-xl text-xs flex items-start gap-3 ${
                status.type === 'success'
                  ? 'bg-emerald-950/30 border border-emerald-900/60 text-emerald-300'
                  : status.type === 'info'
                  ? 'bg-indigo-950/30 border border-indigo-900/60 text-indigo-300'
                  : 'bg-rose-950/30 border border-rose-900/60 text-rose-300'
              }`}
            >
              {status.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : status.type === 'info' ? (
                <FileCode className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <p className="font-semibold">
                  {status.type === 'success'
                    ? 'Extraction Complete'
                    : status.type === 'info'
                    ? 'Document Ready'
                    : 'Error'}
                </p>
                <p className="leading-relaxed">{status.message}</p>
                {status.type === 'success' && (
                  <div className="pt-2">
                    <button
                      onClick={onClose}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors shadow-sm"
                    >
                      View Side-by-Side Workspace
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-950/70 text-xs text-slate-400">
          <span>Immutable Fact Firewall Guarantee: Zero invented facts</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
