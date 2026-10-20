import { useState, useEffect } from 'react';
import {
  Sparkles,
  Briefcase,
  Layers,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  TrendingUp,
  FileCode2,
  X,
  Eye,
  Scale,
  Search,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from 'lucide-react';
import { SAMPLE_JOB_DESCRIPTIONS } from '../data/sampleJobDescriptions';
import { tailorResumePipeline } from '../services/tailoringService';
import { evaluateJobDescriptionPipeline, calculateBaselineScore } from '../services/gatekeeperService';
import { runTechExtractionPipeline } from '../services/techExtractionService';
import { checkOllamaConnection, DEFAULT_MODEL } from '../services/ollamaService';
import { batchOptimizeDynamicSectionsPipeline } from '../services/sectionOptimizationService';
import MasterProfileView from './MasterProfileView';
import TechXRayDashboard from './TechXRayDashboard';
import SectionDiffPreview from './SectionDiffPreview';
import SectionCustomInstruction from './SectionCustomInstruction';

export default function TailoredResumeWorkspace({
  profile,
  factAudit,
  onOpenUpload,
  onReset,
  onPreviewTailoredResume,
  onTailoredResultChange,
  onBaselineScoreChange,
}) {
  // Job Description Input State (starts completely empty on load)
  const [jobDescription, setJobDescription] = useState('');
  const [isJdCollapsed, setIsJdCollapsed] = useState(false);

  // Gatekeeper Evaluation & Baseline Scoring State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [gatekeeperResult, setGatekeeperResult] = useState(null);
  const [baselineScore, setBaselineScore] = useState(null);
  const [isScoreExpanded, setIsScoreExpanded] = useState(true);

  // Intelligent Tech Extraction & Missing Tech X-Ray State
  const [techXRayData, setTechXRayData] = useState(null);
  const [missingTechList, setMissingTechList] = useState([]);

  // Ollama Connection & Model Selection
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);

  // Tailoring Execution State
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailorProgressStep, setTailorProgressStep] = useState(0);
  const [tailoredResult, setTailoredResult] = useState(null);
  const [executionNotice, setExecutionNotice] = useState(null);
  const [copied, setCopied] = useState(false);
  const [optimizedSections, setOptimizedSections] = useState(null);
  // Undo history stack for card-level custom instructions
  const [sectionHistory, setSectionHistory] = useState({});

  // Modal to inspect original Master Profile
  const [isMasterProfileModalOpen, setIsMasterProfileModalOpen] = useState(false);

  // Check Ollama connection on mount
  useEffect(() => {
    let ignore = false;
    checkOllamaConnection()
      .then((res) => {
        if (!ignore) {
          setOllamaOnline(res.success);
          if (res.models && res.models.length > 0) {
            setAvailableModels(res.models);
            setSelectedModel(res.models[0].name || DEFAULT_MODEL);
          }
        }
      })
      .catch(() => {
        if (!ignore) setOllamaOnline(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  // Step 1: Analyze JD (Strict Sanity & Gibberish Interception + Gatekeeper Guardrails + Baseline Scoring + Tech X-Ray Extraction)
  const handleAnalyzeJd = async () => {
    if (!jobDescription.trim()) return;

    setIsAnalyzing(true);
    setExecutionNotice(null);
    setGatekeeperResult(null);
    setBaselineScore(null);
    setTailoredResult(null);
    setTechXRayData(null);
    setMissingTechList([]);
    setOptimizedSections(null);
    onBaselineScoreChange?.(null);
    onTailoredResultChange?.(null);

    const gatekeeperEval = await evaluateJobDescriptionPipeline({
      rawJdText: jobDescription,
      masterProfile: profile,
      model: selectedModel,
    });

    if (!gatekeeperEval.success || gatekeeperEval.status === 'ABORT') {
      // Hard stop on ABORT: prevent any score rendering or downstream resume modifications
      setIsAnalyzing(false);
      setGatekeeperResult(gatekeeperEval);
      setBaselineScore(null);
      setTailoredResult(null);
      setTechXRayData(null);
      setMissingTechList([]);
      onBaselineScoreChange?.(null);
      onTailoredResultChange?.(null);
      return;
    }

    // Step 1b: Run Intelligent Tech Extraction Pipeline with Global Dictionary & Anti-Fluff
    const techXRay = await runTechExtractionPipeline({
      sanitizedJd: gatekeeperEval.cleanedText || jobDescription,
      masterProfile: profile,
      model: selectedModel,
    });

    setIsAnalyzing(false);

    // Gatekeeper Approved! Synchronize baseline score with techXRay data for 100% consistency
    const synchronizedBaselineScore = calculateBaselineScore({
      cleanedJdText: gatekeeperEval.cleanedText || jobDescription,
      masterProfile: profile,
      techXRayData: techXRay,
    });

    const finalBaselineScore = synchronizedBaselineScore || gatekeeperEval.baselineScore;
    setGatekeeperResult(gatekeeperEval);
    setBaselineScore(finalBaselineScore);
    onBaselineScoreChange?.(finalBaselineScore);
    setTechXRayData(techXRay);
    setMissingTechList(techXRay.missingTech || []);
  };

  // Helper to synchronize tailoredResult with approved & rejected missing tech
  const syncTailoredWithApprovals = (approvedNames, rejectedNames) => {
    setTailoredResult((curr) => {
      if (!curr) return curr;
      const updated = {
        ...curr,
        approvedMissingTech: approvedNames,
        rejectedMissingTech: rejectedNames,
      };
      onTailoredResultChange?.(updated);
      return updated;
    });
  };

  // Human-in-the-Loop Toggle Handlers
  const handleToggleApprove = (techId, isApproved) => {
    setMissingTechList((prev) => {
      const updated = prev.map((item) => (item.id === techId ? { ...item, approved: isApproved } : item));
      const approvedNames = updated.filter((t) => t.approved).map((t) => t.name);
      const rejectedNames = updated.filter((t) => !t.approved).map((t) => t.name);
      syncTailoredWithApprovals(approvedNames, rejectedNames);
      return updated;
    });
  };

  const handleApproveAll = () => {
    setMissingTechList((prev) => {
      const updated = prev.map((item) => ({ ...item, approved: true }));
      const approvedNames = updated.map((t) => t.name);
      syncTailoredWithApprovals(approvedNames, []);
      return updated;
    });
  };

  const handleRejectAll = () => {
    setMissingTechList((prev) => {
      const updated = prev.map((item) => ({ ...item, approved: false }));
      const rejectedNames = updated.map((t) => t.name);
      syncTailoredWithApprovals([], rejectedNames);
      return updated;
    });
  };

  // Apply individual or bulk section decisions from SectionDiffPreview
  const handleApplyOptimizedSections = (finalizedPayload) => {
    if (!finalizedPayload) return;

    setTailoredResult((prev) => {
      const current = prev || {};
      const updated = {
        ...current,
        tailoredSummary: finalizedPayload.summary || current.tailoredSummary,
        highlightedExperiences: (finalizedPayload.internships || []).map((item) => ({
          company: item.company,
          title: item.title,
          period: item.period,
          location: item.location,
          bulletPoints: item.finalBullets || item.originalBullets || [],
        })),
        highlightedProjects: (finalizedPayload.projects || []).map((item) => ({
          name: item.name,
          techStack: item.techStack,
          description: item.finalDescription || item.originalDescription,
        })),
      };
      onTailoredResultChange?.(updated);
      return updated;
    });

    setExecutionNotice('Section optimization review choices successfully applied to tailored resume draft.');
  };

  // Step 2: Full AI Tailoring Execution with Targeted Batch Section Optimization (< 3-4s budget)
  const handleExecuteTailoring = async (options = {}) => {
    const { autoTransitionToPreview = false } = options;
    if (!jobDescription.trim() || gatekeeperResult?.status !== 'PROCEED') return;

    setIsTailoring(true);
    setExecutionNotice(null);
    setTailorProgressStep(1);

    const stepInterval = setInterval(() => {
      setTailorProgressStep((prev) => (prev < 4 ? prev + 1 : prev));
    }, 450);

    // Filter approved vs rejected missing technologies
    const approvedMissingTech = missingTechList.filter((t) => t.approved).map((t) => t.name);
    const rejectedMissingTech = missingTechList.filter((t) => !t.approved).map((t) => t.name);

    try {
      // 1. Single batched optimization targeting ONLY the 3 dynamic sections (Summary, Internships, Projects)
      const sectionOptimization = await batchOptimizeDynamicSectionsPipeline({
        masterProfile: profile,
        jobDescription: gatekeeperResult.cleanedText || jobDescription,
        targetKeywords: techXRayData?.matchedTech?.map((t) => t.name) || [],
        approvedMissingTech,
        rejectedMissingTech,
        model: selectedModel,
      });

      setOptimizedSections(sectionOptimization.data);

      // 2. Full tailoring pipeline execution
      const response = await tailorResumePipeline({
        masterProfile: profile,
        jobDescription: gatekeeperResult.cleanedText || jobDescription,
        approvedMissingTech,
        rejectedMissingTech,
        model: selectedModel,
      });

      // Synchronize tailored output with optimized dynamic sections
      if (sectionOptimization.data && response.data) {
        if (sectionOptimization.data.summary?.proposedText) {
          response.data.tailoredSummary = sectionOptimization.data.summary.proposedText;
        }
        if (Array.isArray(sectionOptimization.data.internships)) {
          response.data.highlightedExperiences = sectionOptimization.data.internships.map((item) => ({
            company: item.company,
            title: item.title,
            period: item.period,
            location: item.location,
            bulletPoints: item.proposedBullets || item.originalBullets || [],
          }));
        }
        if (Array.isArray(sectionOptimization.data.projects)) {
          response.data.highlightedProjects = sectionOptimization.data.projects.map((proj) => ({
            name: proj.name,
            techStack: proj.techStack,
            description: proj.proposedDescription || proj.originalDescription,
          }));
        }
      }

      clearInterval(stepInterval);
      setTailoredResult(response.data);
      onTailoredResultChange?.(response.data);
      setIsJdCollapsed(true);
      setIsScoreExpanded(false);
      if (response.offlineNotice) {
        setExecutionNotice(response.offlineNotice);
      }
      if (autoTransitionToPreview && onPreviewTailoredResume) {
        onPreviewTailoredResume({
          tailoredResult: response.data,
          baselineScore,
        });
      }
    } catch (err) {
      clearInterval(stepInterval);
      setExecutionNotice(`Error during tailoring: ${err.message}`);
    } finally {
      setIsTailoring(false);
      setTailorProgressStep(0);
    }
  };

  // Step 3: Clear Final Action Handler -> Compiles all state, approved tech, & custom edits, then transitions to Step 4
  const handleGenerateFinalTailoredResume = () => {
    if (!tailoredResult) return;

    // Filter approved vs rejected missing technologies directly from live checklist state
    const approvedMissingTech = missingTechList.filter((t) => t.approved).map((t) => t.name);
    const rejectedMissingTech = missingTechList.filter((t) => !t.approved).map((t) => t.name);

    // Compile latest state, verified approved missing tech, and custom instruction rewrites
    const compiledResult = {
      ...tailoredResult,
      approvedMissingTech,
      rejectedMissingTech,
      compiledAt: new Date().toISOString(),
    };

    setTailoredResult(compiledResult);
    onTailoredResultChange?.(compiledResult);

    // Step 4: Transition to Side-by-Side Zero-Scroll Comparison View
    if (onPreviewTailoredResume) {
      onPreviewTailoredResume({
        tailoredResult: compiledResult,
        baselineScore,
      });
    }
  };


  // Apply targeted custom instruction to a specific section card with Undo History stack
  const handleApplySectionInstruction = (sectionKey, newText) => {
    if (!tailoredResult) return;

    // 1. Capture current text to push onto undo history stack
    let previousContent = null;
    if (sectionKey === 'summary') {
      previousContent = tailoredResult.tailoredSummary;
    } else if (sectionKey.startsWith('exp-')) {
      const idx = parseInt(sectionKey.replace('exp-', ''), 10);
      previousContent = [...(tailoredResult.highlightedExperiences?.[idx]?.bulletPoints || [])];
    } else if (sectionKey.startsWith('proj-')) {
      const idx = parseInt(sectionKey.replace('proj-', ''), 10);
      previousContent = tailoredResult.highlightedProjects?.[idx]?.description || '';
    }

    if (previousContent !== null) {
      setSectionHistory((prev) => ({
        ...prev,
        [sectionKey]: [...(prev[sectionKey] || []), previousContent],
      }));
    }

    // 2. Direct State Binding: updates tailoredResult directly to ensure exact variable sync
    setTailoredResult((prev) => {
      if (!prev) return prev;
      let nextResult = prev;
      if (sectionKey === 'summary') {
        nextResult = {
          ...prev,
          tailoredSummary: typeof newText === 'string' ? newText : String(newText || ''),
        };
      } else if (sectionKey.startsWith('exp-')) {
        const idx = parseInt(sectionKey.replace('exp-', ''), 10);
        const updatedExperiences = [...(prev.highlightedExperiences || [])];
        if (updatedExperiences[idx]) {
          let updatedBullets;
          if (Array.isArray(newText)) {
            updatedBullets = newText;
          } else if (typeof newText === 'string') {
            updatedBullets = newText
              .split('\n')
              .map((b) => b.replace(/^[-•*]\s*/, '').trim())
              .filter(Boolean);
          } else {
            updatedBullets = updatedExperiences[idx].bulletPoints;
          }
          updatedExperiences[idx] = {
            ...updatedExperiences[idx],
            bulletPoints: updatedBullets,
          };
        }
        nextResult = { ...prev, highlightedExperiences: updatedExperiences };
      } else if (sectionKey.startsWith('proj-')) {
        const idx = parseInt(sectionKey.replace('proj-', ''), 10);
        const updatedProjects = [...(prev.highlightedProjects || [])];
        if (updatedProjects[idx]) {
          updatedProjects[idx] = {
            ...updatedProjects[idx],
            description: typeof newText === 'string' ? newText : String(newText || ''),
          };
        }
        nextResult = { ...prev, highlightedProjects: updatedProjects };
      }
      onTailoredResultChange?.(nextResult);
      return nextResult;
    });
  };

  // Revert targeted section card to previous version from undo history stack
  const handleRevertSectionInstruction = (sectionKey) => {
    const stack = sectionHistory[sectionKey] || [];
    if (stack.length === 0) return;

    const previousContent = stack[stack.length - 1];
    setSectionHistory((prev) => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || []).slice(0, -1),
    }));

    // Direct State Binding: restores previous version directly into tailoredResult
    setTailoredResult((prev) => {
      if (!prev) return prev;
      let nextResult = prev;
      if (sectionKey === 'summary') {
        nextResult = { ...prev, tailoredSummary: previousContent };
      } else if (sectionKey.startsWith('exp-')) {
        const idx = parseInt(sectionKey.replace('exp-', ''), 10);
        const updatedExperiences = [...(prev.highlightedExperiences || [])];
        if (updatedExperiences[idx]) {
          updatedExperiences[idx] = {
            ...updatedExperiences[idx],
            bulletPoints: previousContent,
          };
        }
        nextResult = { ...prev, highlightedExperiences: updatedExperiences };
      } else if (sectionKey.startsWith('proj-')) {
        const idx = parseInt(sectionKey.replace('proj-', ''), 10);
        const updatedProjects = [...(prev.highlightedProjects || [])];
        if (updatedProjects[idx]) {
          updatedProjects[idx] = {
            ...updatedProjects[idx],
            description: previousContent,
          };
        }
        nextResult = { ...prev, highlightedProjects: updatedProjects };
      }
      onTailoredResultChange?.(nextResult);
      return nextResult;
    });
  };

  // Copy Tailored Resume to Clipboard
  const handleCopyTailoredText = () => {
    if (!tailoredResult) return;

    const markdownText = `# ${profile.personalInfo?.fullName || 'Candidate'}
${tailoredResult.tailoredHeadline}
Location: ${profile.personalInfo?.location || 'Bangalore, India'} | Email: ${profile.personalInfo?.email} | Phone: ${profile.personalInfo?.phone}

## PROFESSIONAL SUMMARY
${tailoredResult.tailoredSummary}

## MATCHED CORE SKILLS
${tailoredResult.matchedSkills?.join(', ')}

## WORK EXPERIENCE
${tailoredResult.highlightedExperiences
  ?.map(
    (exp) => `### ${exp.title} - ${exp.company} (${exp.period})
${exp.bulletPoints?.map((b) => `- ${b}`).join('\n')}`
  )
  .join('\n\n')}

## PROJECTS
${tailoredResult.highlightedProjects
  ?.map((p) => `### ${p.name} [${p.techStack?.join(', ')}]\n${p.description}`)
  .join('\n\n')}
`;

    navigator.clipboard.writeText(markdownText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Download Tailored JSON helper (preserved)
  const _handleDownloadJson = () => {
    if (!tailoredResult) return;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(tailoredResult, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', 'Tailored_Resume.json');
    dlAnchor.click();
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Top Header / Mode Bar */}
      <div className="px-4 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-600 text-white shrink-0 shadow-sm">
            <Sparkles className="w-4 h-4 text-amber-300" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white">
              Tailored Resume Workspace
            </span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Fact Firewall
            </span>
          </div>
        </div>

        {/* Right Toolbar Actions */}
        <div className="flex items-center gap-2">
          {/* Ollama Status Pill */}
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono border ${
              ollamaOnline
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                ollamaOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>{ollamaOnline ? 'Ollama: Online' : 'Ollama: Standby'}</span>
          </div>

          {/* Model Selector if models available */}
          {availableModels.length > 0 && (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-slate-950 text-slate-200 border border-slate-800 text-[11px] rounded px-2 py-1 outline-none font-mono cursor-pointer"
            >
              {availableModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          )}

          {/* View Master Profile Ground Truth */}
          <button
            onClick={() => setIsMasterProfileModalOpen(true)}
            title="Inspect Ground-Truth Master Profile"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-xs"
          >
            <Eye className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden md:inline text-[11px]">Base Profile</span>
          </button>
        </div>
      </div>

      {/* Main Scrollable Workspace */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
        {/* Logical Workflow Progression Bar */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl px-3 py-2 flex items-center justify-between text-xs gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap">
            {/* Step 1 Pill */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                !tailoredResult
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                  : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  !tailoredResult ? 'bg-indigo-500 text-white' : 'bg-emerald-500 text-slate-950'
                }`}
              >
                {!tailoredResult ? '1' : '✓'}
              </span>
              <span>Step 1: JD &amp; Tech Review</span>
            </div>

            <span className="text-slate-600 text-xs hidden sm:inline">&rarr;</span>

            {/* Step 2 Pill */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                tailoredResult
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                  : 'text-slate-500 bg-slate-900/40 border border-slate-800/40'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  tailoredResult ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'
                }`}
              >
                2
              </span>
              <span>Step 2: AI Suggestions &amp; Custom Edits</span>
            </div>

            <span className="text-slate-600 text-xs hidden sm:inline">&rarr;</span>

            {/* Step 3 Pill */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                tailoredResult
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'text-slate-500 bg-slate-900/40 border border-slate-800/40'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  tailoredResult ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500'
                }`}
              >
                3
              </span>
              <span>Step 3: Finalize &amp; Compile</span>
            </div>

            <span className="text-slate-600 text-xs hidden sm:inline">&rarr;</span>

            {/* Step 4 Pill */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-500 bg-slate-900/40 border border-slate-800/40">
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold bg-slate-800 text-slate-500">
                4
              </span>
              <span>Step 4: Twin Preview &amp; Export</span>
            </div>
          </div>
        </div>

        {/* 1. Job Description Ingestion Box */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 relative">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <Briefcase className="w-3.5 h-3.5 text-indigo-400" />
              <label className="text-xs font-semibold text-slate-200">
                Target Job Description (JD)
              </label>
              {gatekeeperResult?.status === 'PROCEED' && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Analyzed &bull; {jobDescription.length} chars
                </span>
              )}
            </div>

            {gatekeeperResult?.status === 'PROCEED' && (
              <button
                onClick={() => setIsJdCollapsed(!isJdCollapsed)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
              >
                <span>{isJdCollapsed ? 'Edit JD' : 'Collapse JD'}</span>
                {isJdCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
              </button>
            )}
          </div>

          {/* Collapsed JD Summary Bar */}
          {gatekeeperResult?.status === 'PROCEED' && isJdCollapsed ? (
            <div className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="truncate text-slate-300 text-[11px]">
                <strong className="text-white">Active JD:</strong> {jobDescription.substring(0, 65).trim()}...
              </span>
              <button
                onClick={() => setIsJdCollapsed(false)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 shrink-0 ml-2 underline cursor-pointer"
              >
                Expand Text
              </button>
            </div>
          ) : (
            <div className="relative">
              <textarea
                value={jobDescription}
                onChange={(e) => {
                  setJobDescription(e.target.value);
                  setIsJdCollapsed(false);
                  if (gatekeeperResult) setGatekeeperResult(null);
                  if (baselineScore) setBaselineScore(null);
                  if (tailoredResult) setTailoredResult(null);
                  if (executionNotice) setExecutionNotice(null);
                  if (techXRayData) setTechXRayData(null);
                  if (missingTechList.length > 0) setMissingTechList([]);
                }}
                rows={4}
                placeholder="Paste target job description here... (Key requirements, required tech stack, responsibilities)"
                className="w-full bg-slate-900 text-slate-100 text-xs rounded-lg border border-slate-800 focus:border-indigo-500 p-2.5 outline-none font-mono resize-none leading-relaxed"
              />
              <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500">
                <span>{jobDescription.length} characters</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setJobDescription(SAMPLE_JOB_DESCRIPTIONS[0].text);
                      setIsJdCollapsed(false);
                      if (gatekeeperResult) setGatekeeperResult(null);
                      if (baselineScore) setBaselineScore(null);
                      if (tailoredResult) setTailoredResult(null);
                      if (executionNotice) setExecutionNotice(null);
                      if (techXRayData) setTechXRayData(null);
                      if (missingTechList.length > 0) setMissingTechList([]);
                    }}
                    className="hover:text-amber-300 transition-colors cursor-pointer"
                    title="Load sample Full Stack Developer job description"
                  >
                    Load Sample
                  </button>
                  <span>&bull;</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.readText?.().then((text) => {
                        if (text) {
                          setJobDescription(text);
                          setIsJdCollapsed(false);
                          if (gatekeeperResult) setGatekeeperResult(null);
                          if (baselineScore) setBaselineScore(null);
                          if (tailoredResult) setTailoredResult(null);
                          if (executionNotice) setExecutionNotice(null);
                          if (techXRayData) setTechXRayData(null);
                          if (missingTechList.length > 0) setMissingTechList([]);
                        }
                      });
                    }}
                    className="hover:text-indigo-400 transition-colors cursor-pointer"
                  >
                    Paste Clipboard
                  </button>
                  <span>&bull;</span>
                  <button
                    onClick={() => {
                      setJobDescription('');
                      setIsJdCollapsed(false);
                      if (gatekeeperResult) setGatekeeperResult(null);
                      if (baselineScore) setBaselineScore(null);
                      if (tailoredResult) setTailoredResult(null);
                      if (executionNotice) setExecutionNotice(null);
                      if (techXRayData) setTechXRayData(null);
                      if (missingTechList.length > 0) setMissingTechList([]);
                    }}
                    className="hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Action Bar & Gatekeeper / Tailoring Trigger */}
          <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-800/80">
            <div className="text-[11px] text-slate-400">
              {gatekeeperResult?.status === 'PROCEED' ? (
                <span className="text-emerald-400 font-mono text-[10px]">✓ Entry-Level Role Verified</span>
              ) : (
                <span className="text-slate-500 text-[10px]">Ready for Gatekeeper analysis</span>
              )}
            </div>

            {gatekeeperResult?.status === 'PROCEED' ? (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={handleAnalyzeJd}
                  disabled={isAnalyzing || isTailoring}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Re-run Gatekeeper Analysis"
                >
                  <Search className="w-3.5 h-3.5 text-slate-400" />
                  <span>Re-Analyze</span>
                </button>

                <button
                  onClick={tailoredResult ? handleGenerateFinalTailoredResume : () => handleExecuteTailoring({ autoTransitionToPreview: false })}
                  disabled={isTailoring}
                  className="flex-1 sm:flex-initial px-4 py-1.5 bg-gradient-to-r from-emerald-600 via-teal-500 to-indigo-600 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-50 text-white font-medium text-xs rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  {isTailoring ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Tailoring Resume...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>{tailoredResult ? 'Generate Final Tailored Resume' : 'Tailor Resume'}</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <button
                onClick={handleAnalyzeJd}
                disabled={isAnalyzing || !jobDescription.trim()}
                className="w-full sm:w-auto px-4 py-1.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white font-medium text-xs rounded-xl shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Analyzing JD...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5 text-indigo-200" />
                    <span>Analyze JD</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Gatekeeper Guardrail Block Alert (ABORT) - Clean & Compact */}
        {!isTailoring && gatekeeperResult?.status === 'ABORT' && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 space-y-1.5 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="font-semibold text-white">
                  Gatekeeper Guardrail Block (ABORT)
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-500/20 text-rose-200 border border-rose-500/40 uppercase">
                Guardrail Block
              </span>
            </div>
            <p className="text-xs text-rose-200 leading-relaxed font-medium">
              {gatekeeperResult.reason}
            </p>
            <div className="pt-1 border-t border-rose-500/20 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Candidate Profile: Entry-level (0-1 year)</span>
              <span className="font-mono text-slate-500">{gatekeeperResult.engine || 'Deterministic Rule Engine'}</span>
            </div>
          </div>
        )}

        {/* Deterministic Baseline Score Card (Compact Collapsible Accordion) */}
        {!isTailoring && baselineScore && (
          <div className="bg-slate-950/80 border border-indigo-500/30 rounded-xl p-3 space-y-2">
            <div
              className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => setIsScoreExpanded(!isScoreExpanded)}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Scale className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs font-semibold text-white uppercase tracking-wider">
                  Baseline Fit Score:
                </span>
                <span className="text-sm font-bold font-mono text-indigo-400">
                  {baselineScore.overallScore}%
                </span>
                {tailoredResult && (
                  <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
                    <span className="text-xs text-slate-500 font-mono">→</span>
                    <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                      After Tailoring:
                    </span>
                    <span className="text-sm font-bold font-mono text-emerald-400">
                      {tailoredResult.matchScore}%
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isScoreExpanded && (
                  <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                    Tech: {baselineScore.breakdown.techStack.score}/30 &bull; Role: {baselineScore.breakdown.domainRole.score}/40 &bull; Exp: {baselineScore.breakdown.experienceFit.score}/20 &bull; Edu: {baselineScore.breakdown.educationFit.score}/10
                  </span>
                )}
                <button
                  type="button"
                  className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
                >
                  {isScoreExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* 4-Pillar Weighted Score Grid */}
            {isScoreExpanded && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1 border-t border-slate-800">
                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Tech Match (30%)</div>
                  <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                    {baselineScore.breakdown.techStack.score} <span className="text-[10px] text-slate-500">/ 30 pts</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {baselineScore.breakdown.techStack.matchedKeywords.slice(0, 3).join(', ') || 'General tech'}
                  </div>
                </div>

                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Role Fit (40%)</div>
                  <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                    {baselineScore.breakdown.domainRole.score} <span className="text-[10px] text-slate-500">/ 40 pts</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {baselineScore.breakdown.domainRole.matchedRoles[0] || 'Eligible Family'}
                  </div>
                </div>

                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Experience (20%)</div>
                  <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                    {baselineScore.breakdown.experienceFit.score} <span className="text-[10px] text-slate-500">/ 20 pts</span>
                  </div>
                  <div className="text-[10px] text-emerald-400 truncate mt-0.5 font-mono">
                    &le; 1 Year Verified
                  </div>
                </div>

                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Education (10%)</div>
                  <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                    {baselineScore.breakdown.educationFit.score} <span className="text-[10px] text-slate-500">/ 10 pts</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    B.Tech (IT) Qualified
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. Intelligent Tech X-Ray & Human-in-the-Loop Missing Tech Dashboard */}
        {!isTailoring && gatekeeperResult?.status === 'PROCEED' && techXRayData && (
          <TechXRayDashboard
            techXRayData={techXRayData}
            missingTechList={missingTechList}
            onToggleApprove={handleToggleApprove}
            onApproveAll={handleApproveAll}
            onRejectAll={handleRejectAll}
            defaultCollapsed={Boolean(tailoredResult)}
          />
        )}

        {/* Step 1 Completion Action: Tailor Resume to produce Step 2 Suggestions */}
        {!isTailoring && !tailoredResult && gatekeeperResult?.status === 'PROCEED' && (
          <div className="p-3.5 bg-slate-950/80 border border-indigo-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
            <div className="text-xs text-slate-300">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Step 1 Complete: JD Analyzed &amp; Missing Tech Reviewed</span>
              </div>
              <p className="text-slate-400 text-[11px] mt-0.5">
                Generate AI suggestions (Summary, Projects, Internships) to review and apply custom edits in Step 2.
              </p>
            </div>
            <button
              onClick={() => handleExecuteTailoring({ autoTransitionToPreview: false })}
              disabled={isTailoring}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-500 to-indigo-600 hover:from-emerald-500 hover:to-teal-400 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Tailor Resume</span>
              <ArrowRight className="w-4 h-4 text-white" />
            </button>
          </div>
        )}

        {/* Offline / Fallback Notice - Compact & Dismissible */}
        {executionNotice && (
          <div className="py-1.5 px-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center justify-between gap-2 animate-fadeIn">
            <div className="flex items-center gap-1.5 text-[11px]">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>{executionNotice}</span>
            </div>
            <button
              onClick={() => setExecutionNotice(null)}
              className="text-amber-400 hover:text-white p-0.5 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* 2. Loading State Animation */}
        {isTailoring && (
          <div className="bg-slate-950/70 border border-indigo-500/30 rounded-xl p-6 text-center space-y-4 animate-pulse">
            <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Sparkles className="w-6 h-6 animate-spin text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Executing AI Resume Tailoring Pipeline
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Wrapping Master Profile &amp; JD inside XML delimiters (&lt;user_jd&gt; &amp; &lt;user_input&gt;), synthesizing ATS keywords, and verifying zero hallucinations via Fact Firewall...
              </p>
            </div>

            {/* Stepper Progress */}
            <div className="max-w-md mx-auto space-y-1.5 text-left text-xs text-slate-300 pt-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`w-3.5 h-3.5 ${tailorProgressStep >= 1 ? 'text-emerald-400' : 'text-slate-600'}`} />
                <span>1. Parsing Job Description requirements &amp; target skills</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`w-3.5 h-3.5 ${tailorProgressStep >= 2 ? 'text-emerald-400' : 'text-slate-600'}`} />
                <span>2. Aligning candidate credentials from Master_Resume.docx</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`w-3.5 h-3.5 ${tailorProgressStep >= 3 ? 'text-emerald-400' : 'text-slate-600'}`} />
                <span>3. Rewriting experience bullets with quantifiable action verbs</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`w-3.5 h-3.5 ${tailorProgressStep >= 4 ? 'text-emerald-400' : 'text-slate-600'}`} />
                <span>4. Passing Fact Firewall ground-truth audit (100% verified)</span>
              </div>
            </div>
          </div>
        )}


        {/* 3b. Targeted Section Optimization & Layout Diff Review */}
        {!isTailoring && optimizedSections && (
          <SectionDiffPreview
            optimizedSections={optimizedSections}
            onApplyDecisions={handleApplyOptimizedSections}
            masterProfile={profile}
          />
        )}

        {/* Step 2: AI Suggested Content & Active Custom Instructions */}
        {!isTailoring && tailoredResult && (
          <div className="space-y-4">
            {/* Step 2 Banner: Guidance for Reviewing Suggestions & Custom Edits */}
            <div className="p-3 bg-gradient-to-r from-indigo-950/70 via-slate-900 to-slate-950 border border-indigo-500/30 rounded-xl flex items-center justify-between gap-3 flex-wrap">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                    Step 2
                  </span>
                  <span>AI Suggested Content &amp; Custom Instructions</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Review suggestions below (Summary, Projects, Internships) and use the custom instruction boxes to apply edits before finalizing.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExecuteTailoring({ autoTransitionToPreview: false })}
                  disabled={isTailoring}
                  className="px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 transition-colors cursor-pointer"
                  title="Re-run AI tailoring with current approved tech"
                >
                  Re-Tailor Suggestions
                </button>
              </div>
            </div>

            {/* Header: Side-by-Side Before/After Scores & Action Controls */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                {/* Before: Baseline Match Score */}
                {baselineScore && (
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-base font-bold font-mono text-slate-400">
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

                {/* After: Tailored JD Match Score */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
                  <div className="text-lg font-bold font-mono text-indigo-400 flex items-center gap-1">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span>{tailoredResult.matchScore}%</span>
                  </div>
                  <span className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wider">
                    {baselineScore ? 'After (Tailored)' : 'JD Match Score'}
                  </span>
                </div>
              </div>

              {/* Action Controls: Generate Final Resume & Copy */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleGenerateFinalTailoredResume}
                  title="Compile and transition to Zero-Scroll Side-by-Side Comparison"
                  className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Generate Final Tailored Resume</span>
                </button>

                <button
                  onClick={handleCopyTailoredText}
                  title="Copy Tailored Resume"
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Tailored Professional Summary */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  Tailored Professional Summary
                </h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                {tailoredResult.tailoredSummary}
              </p>
              <SectionCustomInstruction
                sectionKey="summary"
                currentText={tailoredResult.tailoredSummary}
                onApply={handleApplySectionInstruction}
                canRevert={(sectionHistory['summary']?.length || 0) > 0}
                onRevert={handleRevertSectionInstruction}
                approvedMissingTech={tailoredResult.approvedMissingTech}
                model={selectedModel}
                placeholder="Custom instruction for summary (e.g., 'Make this punchier', 'Shorten this')..."
              />
            </div>

            {/* Skills Alignment Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Matched Skills */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Matched Core Skills ({tailoredResult.matchedSkills?.length || 0})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tailoredResult.matchedSkills?.map((skill, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-[11px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Recommended / Missing Keywords */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                    Recommended Keywords for Interview ({tailoredResult.missingKeywords?.length || 0})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tailoredResult.missingKeywords?.map((kw, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-[11px] bg-amber-500/10 text-amber-300 border border-amber-500/30 font-medium"
                    >
                      + {kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Human-in-the-Loop Approved & Protected Badges */}
            {tailoredResult.approvedMissingTech?.length > 0 && (
              <div className="p-3 rounded-xl bg-emerald-950/25 border border-emerald-500/30 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-emerald-300 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  Human-Approved Additions Included in Resume:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {tailoredResult.approvedMissingTech.map((tech, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
                    >
                      +{tech}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {tailoredResult.rejectedMissingTech?.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-slate-400 font-medium flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                  Interview Trap Shield (Strictly Omitted):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {tailoredResult.rejectedMissingTech.map((tech, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-400 border border-slate-700"
                    >
                      ✕ {tech}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tailored Experience Bullet Points */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-indigo-400" />
                  Tailored Work Experience History
                </h3>
              </div>

              <div className="space-y-3">
                {tailoredResult.highlightedExperiences?.map((exp, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
                      <div>
                        <strong className="text-white font-semibold">{exp.title}</strong>
                        <span className="text-slate-400 ml-1.5">&bull; {exp.company}</span>
                      </div>
                      <span className="text-[11px] font-mono text-indigo-300">
                        {exp.period} | {exp.location}
                      </span>
                    </div>

                    <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                      {exp.bulletPoints?.map((bullet, bIdx) => (
                        <li key={bIdx} className="leading-relaxed">
                          {bullet}
                        </li>
                      ))}
                    </ul>

                    <SectionCustomInstruction
                      sectionKey={`exp-${idx}`}
                      currentText={exp.bulletPoints}
                      onApply={handleApplySectionInstruction}
                      canRevert={(sectionHistory[`exp-${idx}`]?.length || 0) > 0}
                      onRevert={handleRevertSectionInstruction}
                      approvedMissingTech={tailoredResult.approvedMissingTech}
                      model={selectedModel}
                      placeholder="Custom instruction for bullets (e.g., 'Make punchier', 'Quantify achievements')..."
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Tailored Projects */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <FileCode2 className="w-3.5 h-3.5 text-indigo-400" />
                Tailored Projects &amp; Portfolio Highlights
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {tailoredResult.highlightedProjects?.map((proj, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5 text-xs"
                  >
                    <div className="font-semibold text-white">{proj.name}</div>
                    <div className="flex flex-wrap gap-1">
                      {proj.techStack?.map((t, tIdx) => (
                        <span
                          key={tIdx}
                          className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-300 font-mono"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      {proj.description}
                    </p>

                    <SectionCustomInstruction
                      sectionKey={`proj-${idx}`}
                      currentText={proj.description}
                      onApply={handleApplySectionInstruction}
                      canRevert={(sectionHistory[`proj-${idx}`]?.length || 0) > 0}
                      onRevert={handleRevertSectionInstruction}
                      approvedMissingTech={tailoredResult.approvedMissingTech}
                      model={selectedModel}
                      placeholder="Custom instruction for project (e.g., 'Make punchier', 'Highlight architecture')..."
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Step 3: Clear Final Action Button at Bottom of Control Flow */}
            <div className="sticky bottom-0 z-20 pt-3 pb-2 -mx-3 sm:-mx-4 px-4 bg-slate-900/95 backdrop-blur border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xl rounded-b-xl">
              <div className="text-xs text-slate-300">
                <span className="font-semibold text-white">Step 3: Finalize &amp; Compile Tailored Resume</span>
                <span className="text-slate-400 ml-1.5 hidden md:inline">
                  Compile all approved tech, suggestions, and custom instructions into the tailored twin.
                </span>
              </div>
              <button
                onClick={handleGenerateFinalTailoredResume}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-500 to-indigo-600 hover:from-emerald-500 hover:to-teal-400 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Generate Final Tailored Resume</span>
                <ArrowRight className="w-4 h-4 text-white" />
              </button>
            </div>

          </div>
        )}
      </div>

      {/* Modal to Inspect Ground-Truth Master Profile */}
      {isMasterProfileModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-white">
                  Ground-Truth Master Profile (Immutable Baseline)
                </span>
              </div>
              <button
                onClick={() => setIsMasterProfileModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <MasterProfileView
                profile={profile}
                factAudit={factAudit}
                onReset={onReset}
                onOpenUpload={onOpenUpload}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
