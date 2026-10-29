import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Briefcase,
  Layers,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
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
  Link,
  Globe,
  ClipboardList,
  Download,
  Columns2,
} from 'lucide-react';
import { SAMPLE_JOB_DESCRIPTIONS } from '../data/sampleJobDescriptions';
import { tailorResumePipeline, compileFinalTailoredResume } from '../services/tailoringService';
import {
  evaluateJobDescriptionPipeline,
  calculateBaselineScore,
  evaluateBatchYearEligibility,
  evaluateExclusiveInstitutionTier,
  evaluateExperienceLevel,
} from '../services/gatekeeperService';
import { runTechExtractionPipeline } from '../services/techExtractionService';
import { checkOllamaConnection, DEFAULT_MODEL } from '../services/ollamaService';
import {
  batchOptimizeDynamicSectionsPipeline,
  extractTextString,
  buildOptimizationRationale,
} from '../services/sectionOptimizationService';
import { isJobUrl, scrapeJobUrl, isKnownNonJobUrl, INVALID_JOB_URL_ERROR } from '../services/jobUrlScraperService';
import { exportTailoredDocx, exportTailoredPdf } from '../services/docxExportService';
import MasterProfileView from './MasterProfileView';
import TechXRayDashboard from './TechXRayDashboard';
import SectionDiffPreview from './SectionDiffPreview';
import SectionCustomInstruction, { BULLET_QUICK_CHIPS } from './SectionCustomInstruction';
import OptimizationLogView from './OptimizationLogView';
import CloudAiSettingsModal from './CloudAiSettingsModal';
import { getCloudConfig, isPublicDeployment } from '../services/cloudAiService';

export { extractTextString, buildOptimizationRationale, exportTailoredPdf, exportTailoredDocx };

export default function TailoredResumeWorkspace({
  profile,
  factAudit,
  onOpenUpload,
  onReset,
  onPreviewTailoredResume,
  onTailoredResultChange,
  onBaselineScoreChange,
  approvedChangesLog: externalApprovedLog,
  onApprovedChangesChange,
  onNavigateToStage,
}) {
  const [workspaceTab, setWorkspaceTab] = useState('steps'); // 'steps' | 'log'
  const [internalApprovedLog, setInternalApprovedLog] = useState([]);
  const approvedChangesLog = externalApprovedLog !== undefined ? externalApprovedLog : internalApprovedLog;

  const setApprovedChangesLog = useCallback((updater) => {
    // 1. Update internal state
    setInternalApprovedLog((prev) => {
      const base = externalApprovedLog !== undefined ? externalApprovedLog : prev;
      return typeof updater === 'function' ? updater(base) : updater;
    });

    // 2. Safely synchronize external state handler without invoking side-effects inside state updater
    if (onApprovedChangesChange) {
      if (typeof updater === 'function') {
        onApprovedChangesChange((prevParent) => {
          const base = Array.isArray(prevParent) ? prevParent : (externalApprovedLog || []);
          return updater(base);
        });
      } else {
        onApprovedChangesChange(updater);
      }
    }
  }, [externalApprovedLog, onApprovedChangesChange]);
  // Job Description Input State (starts completely empty on load)
  const [jobDescription, setJobDescription] = useState('');
  const [isJdCollapsed, setIsJdCollapsed] = useState(false);

  // Job URL Scraping & Extraction State
  const [isExtractingUrl, setIsExtractingUrl] = useState(false);
  const [urlExtractError, setUrlExtractError] = useState(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputText, setUrlInputText] = useState('');

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

  // Cloud AI & Fallback Settings State
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [cloudConfig, setCloudConfigState] = useState(() => getCloudConfig());
  const isPublic = isPublicDeployment();

  // Tailoring Execution State
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailorProgressStep, setTailorProgressStep] = useState(0);
  const [tailoredResult, setTailoredResult] = useState(null);
  const [executionNotice, setExecutionNotice] = useState(null);
  const [copied, setCopied] = useState(false);
  const [optimizedSections, setOptimizedSections] = useState(null);
  // User approval / rejection review decisions: { [id]: 'approved' | 'rejected' | 'bypassed' }
  const [sectionReviewDecisions, setSectionReviewDecisions] = useState({});
  // Undo history stack for card-level custom instructions
  const [sectionHistory, setSectionHistory] = useState({});
  // Active custom edits override state for section custom instructions
  const [customEdits, setCustomEdits] = useState({});
  // Active tailored projects override state
  const [tailoredProjects, setTailoredProjects] = useState([]);

  // Document Export Pipeline State (Single-Page PDF & DOCX)
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [exportNotice, setExportNotice] = useState(null);

  // Modal to inspect original Master Profile
  const [isMasterProfileModalOpen, setIsMasterProfileModalOpen] = useState(false);

  // Check Ollama connection on mount, focus, and polling interval
  const verifyOllamaStatus = useCallback(async () => {
    // If running on a public domain (e.g. Vercel), localhost:11434 is unreachable
    if (isPublicDeployment()) {
      setOllamaOnline(false);
      return false;
    }

    try {
      const res = await checkOllamaConnection();
      setOllamaOnline(res.success);
      if (res.success && res.models && res.models.length > 0) {
        setAvailableModels(res.models);
        setSelectedModel((prev) => {
          const exists = res.models.some((m) => m.name === prev);
          return exists ? prev : (res.models[0].name || DEFAULT_MODEL);
        });
      }
      return res.success;
    } catch {
      setOllamaOnline(false);
      return false;
    }
  }, []);

  useEffect(() => {
    verifyOllamaStatus();

    // Re-check when window regains focus if in local development
    if (!isPublicDeployment()) {
      window.addEventListener('focus', verifyOllamaStatus);
      const interval = setInterval(verifyOllamaStatus, 12000);
      return () => {
        window.removeEventListener('focus', verifyOllamaStatus);
        clearInterval(interval);
      };
    }
  }, [verifyOllamaStatus]);

  // URL Scraping & Extraction Handler
  const handleExtractFromUrl = async (targetUrl = null) => {
    const rawUrl = (typeof targetUrl === 'string' && targetUrl.trim()) ? targetUrl.trim() : urlInputText.trim();
    if (!rawUrl) return;

    if (!isJobUrl(rawUrl)) {
      setUrlExtractError('Please enter a valid web URL starting with http:// or https://');
      return;
    }

    // Immediate abort for known non-job URLs (social media, general news, wikis, etc.)
    if (isKnownNonJobUrl(rawUrl)) {
      setIsExtractingUrl(false);
      setUrlExtractError(INVALID_JOB_URL_ERROR);
      setExecutionNotice({
        type: 'warning',
        message: INVALID_JOB_URL_ERROR,
      });
      return;
    }

    setIsExtractingUrl(true);
    setUrlExtractError(null);
    setExecutionNotice({
      type: 'info',
      message: 'Extracting clean job description and role details from URL...',
    });

    try {
      const result = await scrapeJobUrl(rawUrl);
      if (result.success && result.text) {
        setJobDescription(result.text);
        setUrlInputText('');
        setShowUrlInput(false);
        setIsExtractingUrl(false);
        setUrlExtractError(null);
        setExecutionNotice({
          type: 'success',
          message: `Successfully extracted ${result.wordCount || ''} words from ${result.company || result.title || 'job listing'}. Running Gatekeeper analysis...`,
        });
        // Immediately trigger the existing Gatekeeper validation, experience check, and Tech Match pipeline on extracted text
        await handleAnalyzeJd(result.text);
      } else {
        setIsExtractingUrl(false);
        const errorMsg = result?.error || INVALID_JOB_URL_ERROR;
        setUrlExtractError(errorMsg);
        setExecutionNotice({
          type: 'warning',
          message: errorMsg,
        });
      }
    } catch (err) {
      setIsExtractingUrl(false);
      const errorMsg = INVALID_JOB_URL_ERROR;
      setUrlExtractError(errorMsg);
      setExecutionNotice({
        type: 'warning',
        message: errorMsg,
      });
    }
  };

  // Step 1: Analyze JD (Strict Sanity & Gibberish Interception + Gatekeeper Guardrails + Baseline Scoring + Tech X-Ray Extraction)
  const handleAnalyzeJd = async (overrideJdText = null) => {
    const textToAnalyze = (typeof overrideJdText === 'string' && overrideJdText.trim())
      ? overrideJdText.trim()
      : jobDescription.trim();

    if (!textToAnalyze) return;

    // Auto-detect if user entered a bare URL into the main JD box
    if (!overrideJdText && isJobUrl(textToAnalyze)) {
      await handleExtractFromUrl(textToAnalyze);
      return;
    }

    setIsAnalyzing(true);
    setExecutionNotice(null);
    setGatekeeperResult(null);
    setBaselineScore(null);
    setTailoredResult(null);
    setTechXRayData(null);
    setMissingTechList([]);
    setOptimizedSections(null);
    setSectionReviewDecisions({});
    setCustomEdits({});
    setTailoredProjects([]);
    setSectionHistory({});
    setApprovedChangesLog([]);
    onBaselineScoreChange?.(null);
    onTailoredResultChange?.(null);

    // Frontend/Backend Bridge Early Guardrails:
    // Check specific qualification restrictions (Batch Year, Exclusive Institution) FIRST,
    // ensuring specific failure reasons bypass generic word count or text validation checks
    // and pass directly to the UI banner without ever being overwritten.
    const earlyBatchCheck = evaluateBatchYearEligibility(textToAnalyze, profile);
    if (earlyBatchCheck.isBlocked) {
      setIsAnalyzing(false);
      setGatekeeperResult({
        success: false,
        status: 'ABORT',
        failureReason: earlyBatchCheck.failureReason,
        reason: earlyBatchCheck.reason,
        reasoning: earlyBatchCheck.reasoning,
        engine: 'Deterministic Rule Engine',
      });
      return;
    }

    const earlyTierCheck = evaluateExclusiveInstitutionTier(textToAnalyze, profile);
    if (earlyTierCheck.isBlocked) {
      setIsAnalyzing(false);
      setGatekeeperResult({
        success: false,
        status: 'ABORT',
        failureReason: earlyTierCheck.failureReason,
        reason: earlyTierCheck.reason,
        reasoning: earlyTierCheck.reasoning,
        engine: 'Deterministic Rule Engine',
      });
      return;
    }

    const earlyExpCheck = evaluateExperienceLevel(textToAnalyze);
    if (earlyExpCheck.isBlocked) {
      setIsAnalyzing(false);
      setGatekeeperResult({
        success: false,
        status: 'ABORT',
        failureReason: earlyExpCheck.failureReason,
        reason: earlyExpCheck.reason,
        reasoning: earlyExpCheck.reasoning,
        engine: 'Deterministic Rule Engine',
      });
      return;
    }

    const gatekeeperEval = await evaluateJobDescriptionPipeline({
      rawJdText: textToAnalyze,
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
      sanitizedJd: gatekeeperEval.cleanedText || textToAnalyze,
      masterProfile: profile,
      model: selectedModel,
      isOllamaOnline: ollamaOnline,
    });

    setIsAnalyzing(false);

    // Gatekeeper Approved! Synchronize baseline score with techXRay data for 100% consistency
    const synchronizedBaselineScore = calculateBaselineScore({
      cleanedJdText: gatekeeperEval.cleanedText || textToAnalyze,
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

  // Centralized helper to synchronize AI section review decisions with the approved changes log
  const syncSectionDecisionsWithLog = (decisionsToSync, optSections = optimizedSections) => {
    if (!optSections) return;
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    setApprovedChangesLog((curr) => {
      let updated = [...curr];

      Object.entries(decisionsToSync).forEach(([secId, decision]) => {
        const logId = `section_opt_${secId}`;
        if (decision === 'approved' || decision === 'accept_rewrite') {
          let entry = null;

          // 1. Summary
          if (secId === 'summary' && optSections.summary) {
            const tailoredText = extractTextString(
              customEdits?.['summary'],
              customEdits?.['professionalSummary'],
              optSections.summary.proposedText,
              optSections.summary.proposed_text,
              optSections.summary.rewritten_summary,
              optSections.summary.rewrittenSummary,
              optSections.summary.text,
              tailoredResult?.tailoredSummary,
              optSections.summary.originalText,
              profile?.professionalSummary,
              profile?.objective
            );

            const originalText = extractTextString(
              optSections.summary.originalText,
              optSections.summary.original_summary,
              profile?.professionalSummary,
              profile?.objective
            );

            const kws = Array.isArray(optSections.summary.integratedKeywords)
              ? optSections.summary.integratedKeywords
              : [];

            const rationale = buildOptimizationRationale({
              type: 'section_rewrite',
              category: 'Summary',
              chipLabel: 'AI Summary Rewrite',
              instruction: optSections.summary.changes_summary,
              integratedKeywords: kws,
              changesSummary: optSections.summary.changes_summary,
            });

            entry = {
              id: logId,
              timestamp: ts,
              isoTimestamp: new Date().toISOString(),
              type: 'section_rewrite',
              category: 'Summary',
              title: 'Approved Section Rewrite: Professional Summary',
              roleOrContext: 'Professional Summary / Objective',
              instruction: optSections.summary.changes_summary || 'Targeted Summary Optimization',
              chipLabel: 'AI Summary Rewrite',
              rationale,
              originalText,
              tailoredText,
              status: 'approved',
              sectionKey: 'summary',
            };
          }

          // 2. Experience / Internships
          else if (secId.startsWith('exp') && optSections.internships) {
            const item = optSections.internships.find((i) => i.id === secId);
            const idx = parseInt(secId.replace(/exp[-_]/, ''), 10);
            const fallbackExp = tailoredResult?.highlightedExperiences?.[idx] || profile?.workExperience?.[idx];

            if (item || fallbackExp) {
              const comp = item?.company || fallbackExp?.company || 'Experience';
              const role = item?.title || item?.role || fallbackExp?.title || fallbackExp?.role || 'Intern';

              const tailoredText = extractTextString(
                customEdits?.[comp],
                customEdits?.[secId],
                item?.proposedBullets,
                item?.proposed_bullets,
                item?.rewritten_bullets,
                item?.bulletPoints,
                fallbackExp?.bulletPoints,
                item?.originalBullets,
                profile?.workExperience?.[idx]?.bulletPoints
              );

              const originalText = extractTextString(
                item?.originalBullets,
                item?.original_bullets,
                profile?.workExperience?.[idx]?.bulletPoints,
                fallbackExp?.bulletPoints
              );

              const kws = Array.isArray(item?.integratedKeywords) ? item.integratedKeywords : [];

              const rationale = buildOptimizationRationale({
                type: 'section_rewrite',
                category: 'Experience',
                chipLabel: 'AI Experience Rewrite',
                instruction: item?.changes_summary,
                integratedKeywords: kws,
                roleOrContext: `${comp} — ${role}`,
                changesSummary: item?.changes_summary,
              });

              entry = {
                id: logId,
                timestamp: ts,
                isoTimestamp: new Date().toISOString(),
                type: 'section_rewrite',
                category: 'Experience',
                title: `Approved Experience Rewrite: ${comp}`,
                roleOrContext: `${comp} — ${role}`,
                instruction: item?.changes_summary || 'Targeted Experience Bullet Optimization',
                chipLabel: 'AI Experience Rewrite',
                rationale,
                originalText,
                tailoredText,
                status: 'approved',
                sectionKey: secId,
              };
            }
          }

          // 3. Projects
          else if (secId.startsWith('proj') && optSections.projects) {
            const item = optSections.projects.find((p) => p.id === secId);
            const idx = parseInt(secId.replace(/proj[-_]/, ''), 10);
            const fallbackProj = (tailoredProjects && tailoredProjects[idx]) || tailoredResult?.highlightedProjects?.[idx] || profile?.projects?.[idx];

            if (item || fallbackProj) {
              const projName = item?.name || fallbackProj?.name || 'Project';

              const tailoredText = extractTextString(
                customEdits?.[projName],
                customEdits?.[secId],
                item?.proposedDescription,
                item?.proposed_description,
                item?.rewritten_description,
                item?.description,
                tailoredProjects?.[idx]?.description,
                fallbackProj?.description,
                item?.originalDescription,
                profile?.projects?.[idx]?.description
              );

              const originalText = extractTextString(
                item?.originalDescription,
                item?.original_description,
                profile?.projects?.[idx]?.description,
                fallbackProj?.description
              );

              const kws = Array.isArray(item?.integratedKeywords) ? item.integratedKeywords : [];

              const rationale = buildOptimizationRationale({
                type: 'section_rewrite',
                category: 'Projects',
                chipLabel: 'AI Project Rewrite',
                instruction: item?.changes_summary,
                integratedKeywords: kws,
                roleOrContext: projName,
                changesSummary: item?.changes_summary,
              });

              entry = {
                id: logId,
                timestamp: ts,
                isoTimestamp: new Date().toISOString(),
                type: 'section_rewrite',
                category: 'Projects',
                title: `Approved Project Rewrite: ${projName}`,
                roleOrContext: projName,
                instruction: item?.changes_summary || 'Targeted Project Description Optimization',
                chipLabel: 'AI Project Rewrite',
                rationale,
                originalText,
                tailoredText,
                status: 'approved',
                sectionKey: secId,
              };
            }
          }

          if (entry) {
            updated = [entry, ...updated.filter((i) => i.id !== logId)];
          }
        } else {
          updated = updated.filter((i) => i.id !== logId);
        }
      });

      return updated;
    });
  };

  // Human-in-the-Loop Toggle Handlers
  const handleToggleApprove = (techId, isApproved) => {
    // Synchronously resolve target technology item from current missingTechList or techXRayData
    let toggledTech = missingTechList.find(
      (item) => item.id === techId || item.name.toLowerCase() === String(techId).toLowerCase()
    );
    if (!toggledTech && techXRayData?.missingTech) {
      toggledTech = techXRayData.missingTech.find(
        (item) => item.id === techId || item.name.toLowerCase() === String(techId).toLowerCase()
      );
    }
    if (!toggledTech) {
      toggledTech = {
        id: String(techId).toLowerCase().replace(/[^a-z0-9]/g, '-'),
        name: String(techId),
        category: 'Skills',
        definition: '',
        approved: isApproved,
      };
    } else {
      toggledTech = { ...toggledTech, approved: isApproved };
    }

    const updated = missingTechList.some(
      (item) => item.id === techId || item.name.toLowerCase() === String(techId).toLowerCase()
    )
      ? missingTechList.map((item) => {
          if (item.id === techId || item.name.toLowerCase() === String(techId).toLowerCase()) {
            return { ...item, approved: isApproved };
          }
          return item;
        })
      : [...missingTechList, toggledTech];

    setMissingTechList(updated);

    const approvedNames = updated.filter((t) => t.approved).map((t) => t.name);
    const rejectedNames = updated.filter((t) => !t.approved).map((t) => t.name);
    syncTailoredWithApprovals(approvedNames, rejectedNames);

    const skillId = `skill_${toggledTech.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    if (isApproved) {
      const rationale = buildOptimizationRationale({
        type: 'skill_addition',
        category: 'Skills',
        chipLabel: toggledTech.name,
        instruction: 'Approved from Missing Tech X-Ray',
        roleOrContext: toggledTech.name,
      });

      const entry = {
        id: skillId,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        isoTimestamp: new Date().toISOString(),
        type: 'skill_addition',
        category: 'Skills',
        title: `Added Skill: ${toggledTech.name}`,
        roleOrContext: `Technical Skills Matrix (${toggledTech.category || 'Missing Tech'})`,
        instruction: 'Approved from Missing Tech X-Ray',
        chipLabel: toggledTech.name,
        rationale,
        originalText: `Skill "${toggledTech.name}" was not originally listed in master technical skills.`,
        tailoredText: `Approved and incorporated "${toggledTech.name}" into technical skills (${toggledTech.category || 'Skills'}).`,
        status: 'approved',
        skillName: toggledTech.name,
        skillCategory: toggledTech.category || 'Skills',
      };
      setApprovedChangesLog((curr) => [entry, ...(curr || []).filter((item) => item.id !== skillId && item.skillName !== toggledTech.name)]);
    } else {
      setApprovedChangesLog((curr) => (curr || []).filter((item) => item.id !== skillId && item.skillName !== toggledTech.name));
    }
  };

  const handleApproveAll = () => {
    const updated = missingTechList.map((item) => ({ ...item, approved: true }));
    setMissingTechList(updated);

    const approvedNames = updated.map((t) => t.name);
    syncTailoredWithApprovals(approvedNames, []);

    // Batch log all approved skills
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newEntries = updated.map((t) => ({
      id: `skill_${t.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      timestamp: ts,
      isoTimestamp: new Date().toISOString(),
      type: 'skill_addition',
      category: 'Skills',
      title: `Added Skill: ${t.name}`,
      roleOrContext: `Technical Skills Matrix (${t.category || 'Missing Tech'})`,
      instruction: 'Approved from Missing Tech X-Ray',
      chipLabel: t.name,
      rationale: buildOptimizationRationale({
        type: 'skill_addition',
        category: 'Skills',
        chipLabel: t.name,
        instruction: 'Approved from Missing Tech X-Ray',
        roleOrContext: t.name,
      }),
      originalText: `Skill "${t.name}" was not originally listed in master technical skills.`,
      tailoredText: `Approved and incorporated "${t.name}" into technical skills (${t.category || 'Skills'}).`,
      status: 'approved',
      skillName: t.name,
      skillCategory: t.category || 'Skills',
    }));

    setApprovedChangesLog((curr) => {
      const nonSkills = (curr || []).filter((i) => i.type !== 'skill_addition' && i.category !== 'Skills');
      return [...newEntries, ...nonSkills];
    });
  };

  const handleRejectAll = () => {
    const updated = missingTechList.map((item) => ({ ...item, approved: false }));
    setMissingTechList(updated);

    const rejectedNames = updated.map((t) => t.name);
    syncTailoredWithApprovals([], rejectedNames);

    setApprovedChangesLog((curr) => (curr || []).filter((i) => i.type !== 'skill_addition' && i.category !== 'Skills'));
  };

  // Handle live section review decision changes (Approve vs Keep Original)
  const handleSectionDecisionChange = (id, status, updatedDecisions) => {
    const nextDecisions = updatedDecisions || { ...sectionReviewDecisions, [id]: status };
    setSectionReviewDecisions(nextDecisions);

    const approvedMissingTech = missingTechList.filter((t) => t.approved).map((t) => t.name);
    const rejectedMissingTech = missingTechList.filter((t) => !t.approved).map((t) => t.name);

    // Live data-binding: Immediately compile updated state respecting user approval / rejection choices
    const compiled = compileFinalTailoredResume({
      masterProfile: profile,
      tailoredResult,
      optimizedSections,
      sectionDecisions: nextDecisions,
      approvedMissingTech,
      rejectedMissingTech,
      customEdits,
      tailoredProjects,
    });

    setTailoredResult(compiled);
    onTailoredResultChange?.(compiled);

    // Synchronize section decision with centralized optimization log
    syncSectionDecisionsWithLog({ [id]: status });
  };

  // Apply individual or bulk section decisions from SectionDiffPreview
  const handleApplyOptimizedSections = (finalizedPayload) => {
    if (!finalizedPayload) return;

    const nextDecisions = finalizedPayload.decisions || sectionReviewDecisions;
    setSectionReviewDecisions(nextDecisions);

    const approvedMissingTech = missingTechList.filter((t) => t.approved).map((t) => t.name);
    const rejectedMissingTech = missingTechList.filter((t) => !t.approved).map((t) => t.name);

    const compiled = compileFinalTailoredResume({
      masterProfile: profile,
      tailoredResult,
      optimizedSections,
      sectionDecisions: nextDecisions,
      approvedMissingTech,
      rejectedMissingTech,
      customEdits,
      tailoredProjects,
    });

    setTailoredResult(compiled);
    onTailoredResultChange?.(compiled);
    syncSectionDecisionsWithLog(nextDecisions, finalizedPayload.optimizedSections || optimizedSections);
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

    // Resolve active model from available models if possible
    const effectiveModel =
      availableModels.length > 0
        ? (availableModels.some((m) => m.name === selectedModel) ? selectedModel : availableModels[0].name)
        : selectedModel || DEFAULT_MODEL;

    try {
      // 1. Single batched optimization targeting ONLY the 3 dynamic sections (Summary, Internships, Projects)
      const sectionOptimization = await batchOptimizeDynamicSectionsPipeline({
        masterProfile: profile,
        jobDescription: gatekeeperResult.cleanedText || jobDescription,
        targetKeywords: techXRayData?.matchedTech?.map((t) => t.name) || [],
        approvedMissingTech,
        rejectedMissingTech,
        model: effectiveModel,
        isOllamaOnline: ollamaOnline,
      });

      setOptimizedSections(sectionOptimization.data);

      // Initialize approval decisions: rewrites marked approved, bypassed kept original
      const initialDecisions = {
        summary: sectionOptimization.data?.summary?.needs_rewrite ? 'approved' : 'bypassed',
      };
      (sectionOptimization.data?.internships || []).forEach((item) => {
        initialDecisions[item.id] = item.needs_rewrite ? 'approved' : 'bypassed';
      });
      (sectionOptimization.data?.projects || []).forEach((item) => {
        initialDecisions[item.id] = item.needs_rewrite ? 'approved' : 'bypassed';
      });
      setSectionReviewDecisions(initialDecisions);
      syncSectionDecisionsWithLog(initialDecisions, sectionOptimization.data);

      // 2. Full tailoring pipeline execution
      const response = await tailorResumePipeline({
        masterProfile: profile,
        jobDescription: gatekeeperResult.cleanedText || jobDescription,
        approvedMissingTech,
        rejectedMissingTech,
        model: effectiveModel,
        isOllamaOnline: ollamaOnline,
      });

      // Synchronize tailored output with compiled dynamic sections & review decisions
      const initialCompiled = compileFinalTailoredResume({
        masterProfile: profile,
        tailoredResult: response.data,
        optimizedSections: sectionOptimization.data,
        sectionDecisions: initialDecisions,
        approvedMissingTech,
        rejectedMissingTech,
      });

      clearInterval(stepInterval);
      setTailoredResult(initialCompiled);
      onTailoredResultChange?.(initialCompiled);
      setIsJdCollapsed(true);
      setIsScoreExpanded(false);
      if (response.offlineNotice) {
        setExecutionNotice(response.offlineNotice);
      }
      if (autoTransitionToPreview && onPreviewTailoredResume) {
        onPreviewTailoredResume({
          tailoredResult: initialCompiled,
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

  // Step 3: Clear Final Action Handler -> Compiles all state, approved tech, & custom edits, strictly respecting user approval / rejection choices
  const handleGenerateFinalTailoredResume = () => {
    if (!tailoredResult) return;

    // Filter approved vs rejected missing technologies directly from live checklist state
    const approvedMissingTech = missingTechList.filter((t) => t.approved).map((t) => t.name);
    const rejectedMissingTech = missingTechList.filter((t) => !t.approved).map((t) => t.name);

    // Compile latest state strictly respecting user approval / rejection choices AND custom user edits
    const compiledResult = compileFinalTailoredResume({
      masterProfile: profile,
      tailoredResult,
      optimizedSections,
      sectionDecisions: sectionReviewDecisions,
      approvedMissingTech,
      rejectedMissingTech,
      customEdits,
      tailoredProjects,
    });

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

  // Dynamic Document Export Pipeline: Single-Page PDF & DOCX with embedded contact icons
  const handleDownloadPdf = () => {
    if (!tailoredResult) return;
    try {
      setIsExportingPdf(true);
      const approvedMissingTech = missingTechList.filter((t) => t.approved).map((t) => t.name);
      const rejectedMissingTech = missingTechList.filter((t) => !t.approved).map((t) => t.name);

      const compiledResult = compileFinalTailoredResume({
        masterProfile: profile,
        tailoredResult,
        optimizedSections,
        sectionDecisions: sectionReviewDecisions,
        approvedMissingTech,
        rejectedMissingTech,
        customEdits,
        tailoredProjects,
      });

      exportTailoredPdf({
        profile,
        tailoredResult: compiledResult,
        filename: 'Tailored_Resume.pdf',
      });

      setExportNotice({
        type: 'success',
        message: 'Tailored PDF downloaded successfully (Strict Single-Page Guaranteed with Dynamic Font Scaling & Embedded Contact Icons).',
      });
      setTimeout(() => setExportNotice(null), 4000);
    } catch (err) {
      console.error('PDF Export Error:', err);
      setExportNotice({
        type: 'error',
        message: 'Failed to generate tailored PDF. Please try again.',
      });
      setTimeout(() => setExportNotice(null), 4000);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadDocx = async () => {
    if (!tailoredResult) return;
    try {
      setIsExportingDocx(true);
      const approvedMissingTech = missingTechList.filter((t) => t.approved).map((t) => t.name);
      const rejectedMissingTech = missingTechList.filter((t) => !t.approved).map((t) => t.name);

      const compiledResult = compileFinalTailoredResume({
        masterProfile: profile,
        tailoredResult,
        optimizedSections,
        sectionDecisions: sectionReviewDecisions,
        approvedMissingTech,
        rejectedMissingTech,
        customEdits,
        tailoredProjects,
      });

      await exportTailoredDocx({
        profile,
        tailoredResult: compiledResult,
        filename: 'Tailored_Resume.docx',
      });

      setExportNotice({
        type: 'success',
        message: 'Tailored Word (.docx) document downloaded with dynamic scaling, native styling & embedded contact icons.',
      });
      setTimeout(() => setExportNotice(null), 4000);
    } catch (err) {
      console.error('DOCX Export Error:', err);
      setExportNotice({
        type: 'error',
        message: 'Failed to generate tailored DOCX. Please try again.',
      });
      setTimeout(() => setExportNotice(null), 4000);
    } finally {
      setIsExportingDocx(false);
    }
  };


  // Apply targeted custom instruction to a specific section card with Undo History stack
  const handleApplySectionInstruction = (sectionKey, newText, meta = {}) => {
    if (!tailoredResult) return;

    // 1. Capture current text to push onto undo history stack
    let previousContent = null;
    if (sectionKey === 'summary' || sectionKey === 'professionalSummary') {
      previousContent = tailoredResult.tailoredSummary;
    } else if (sectionKey.startsWith('exp-') || sectionKey.startsWith('exp_')) {
      const idx = parseInt(sectionKey.replace(/exp[-_]/, ''), 10);
      previousContent = [...(tailoredResult.highlightedExperiences?.[idx]?.bulletPoints || [])];
    } else if (sectionKey.startsWith('proj-') || sectionKey.startsWith('proj_')) {
      const idx = parseInt(sectionKey.replace(/proj[-_]/, ''), 10);
      previousContent = tailoredResult.highlightedProjects?.[idx]?.description || '';
    }

    if (previousContent !== null) {
      setSectionHistory((prev) => ({
        ...prev,
        [sectionKey]: [...(prev[sectionKey] || []), previousContent],
      }));
    }

    // 2. Immediately save newly generated text to active section override state (customEdits & tailoredProjects)
    const nextCustomEdits = {
      ...customEdits,
      [sectionKey]: newText,
    };
    if (sectionKey.includes('-')) {
      nextCustomEdits[sectionKey.replace('-', '_')] = newText;
    } else if (sectionKey.includes('_')) {
      nextCustomEdits[sectionKey.replace('_', '-')] = newText;
    }

    let updatedProjects = (tailoredProjects && tailoredProjects.length > 0)
      ? [...tailoredProjects]
      : [...(tailoredResult.highlightedProjects || [])];

    let updatedExperiences = [...(tailoredResult.highlightedExperiences || [])];

    if (sectionKey === 'summary' || sectionKey === 'professionalSummary') {
      nextCustomEdits['summary'] = newText;
      nextCustomEdits['professionalSummary'] = newText;
    } else if (sectionKey.startsWith('proj-') || sectionKey.startsWith('proj_')) {
      const idx = parseInt(sectionKey.replace(/proj[-_]/, ''), 10);
      if (updatedProjects[idx]) {
        const desc = typeof newText === 'string' ? newText : String(newText || '');
        updatedProjects[idx] = {
          ...updatedProjects[idx],
          description: desc,
        };
        const projName = updatedProjects[idx].name;
        if (projName) {
          nextCustomEdits[projName] = desc;
        }
      }
      setTailoredProjects(updatedProjects);
    } else if (sectionKey.startsWith('exp-') || sectionKey.startsWith('exp_')) {
      const idx = parseInt(sectionKey.replace(/exp[-_]/, ''), 10);
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
        const compName = updatedExperiences[idx].company;
        if (compName) {
          nextCustomEdits[compName] = updatedBullets;
        }
      }
    }

    setCustomEdits(nextCustomEdits);

    // 3. Update review decisions so the newly edited section is marked approved
    const expId = (sectionKey.startsWith('exp-') || sectionKey.startsWith('exp_'))
      ? `exp_${parseInt(sectionKey.replace(/exp[-_]/, ''), 10)}`
      : null;
    const projId = (sectionKey.startsWith('proj-') || sectionKey.startsWith('proj_'))
      ? `proj_${parseInt(sectionKey.replace(/proj[-_]/, ''), 10)}`
      : null;
    const decisionKey = expId || projId || sectionKey;

    const nextDecisions = {
      ...sectionReviewDecisions,
      [decisionKey]: 'approved',
      [sectionKey]: 'approved',
    };
    setSectionReviewDecisions(nextDecisions);

    // 4. Immediately bind into compiled state
    const approvedMissingTech = missingTechList.filter((t) => t.approved).map((t) => t.name);
    const rejectedMissingTech = missingTechList.filter((t) => !t.approved).map((t) => t.name);

    const baseTailored = {
      ...tailoredResult,
      tailoredSummary: (sectionKey === 'summary' || sectionKey === 'professionalSummary')
        ? (typeof newText === 'string' ? newText : String(newText || ''))
        : tailoredResult.tailoredSummary,
      highlightedExperiences: updatedExperiences,
      highlightedProjects: updatedProjects,
      tailoredProjects: updatedProjects,
      customEdits: nextCustomEdits,
    };

    const compiled = compileFinalTailoredResume({
      masterProfile: profile,
      tailoredResult: baseTailored,
      optimizedSections,
      sectionDecisions: nextDecisions,
      approvedMissingTech,
      rejectedMissingTech,
      customEdits: nextCustomEdits,
      tailoredProjects: updatedProjects,
    });

    setTailoredResult(compiled);
    onTailoredResultChange?.(compiled);

    // 5. Centralized Audit Logging for User-Approved Custom Instructions & Bullet Rewrites
    let category = 'General';
    let roleOrContext = '';
    let itemTitle = 'Custom Instruction Applied';

    if (sectionKey === 'summary' || sectionKey === 'professionalSummary') {
      category = 'Summary';
      roleOrContext = 'Professional Summary / Objective';
      itemTitle = meta?.instruction ? `Summary: "${meta.instruction}"` : 'Tailored Professional Summary';
    } else if (sectionKey.startsWith('exp-') || sectionKey.startsWith('exp_')) {
      const idx = parseInt(sectionKey.replace(/exp[-_]/, ''), 10);
      const expItem = tailoredResult.highlightedExperiences?.[idx] || profile?.workExperience?.[idx] || profile?.internships?.[idx];
      category = 'Experience';
      const comp = expItem?.company || 'Experience';
      const role = expItem?.role || expItem?.title || 'Intern';
      roleOrContext = `${comp} — ${role}`;
      itemTitle = meta?.instruction ? `Experience: "${meta.instruction}"` : `Tailored Bullet: ${comp}`;
    } else if (sectionKey.startsWith('proj-') || sectionKey.startsWith('proj_')) {
      const idx = parseInt(sectionKey.replace(/proj[-_]/, ''), 10);
      const projItem = (tailoredProjects && tailoredProjects[idx]) || tailoredResult.highlightedProjects?.[idx] || profile?.projects?.[idx];
      category = 'Projects';
      const projName = projItem?.name || 'Project';
      roleOrContext = projName;
      itemTitle = meta?.instruction ? `Project: "${meta.instruction}"` : `Tailored Project: ${projName}`;
    }

    const appliedInstruction = meta?.instruction || 'Custom instruction';

    const tailoredText = extractTextString(
      newText,
      nextCustomEdits[sectionKey],
      (sectionKey === 'summary' || sectionKey === 'professionalSummary') ? baseTailored.tailoredSummary : null,
      (sectionKey.startsWith('exp') ? updatedExperiences[parseInt(sectionKey.replace(/exp[-_]/, ''), 10)]?.bulletPoints : null),
      (sectionKey.startsWith('proj') ? updatedProjects[parseInt(sectionKey.replace(/proj[-_]/, ''), 10)]?.description : null)
    );

    const originalText = extractTextString(
      previousContent,
      meta?.previousText,
      (sectionKey === 'summary' || sectionKey === 'professionalSummary') ? (profile?.professionalSummary || profile?.objective) : null,
      (sectionKey.startsWith('exp') ? profile?.workExperience?.[parseInt(sectionKey.replace(/exp[-_]/, ''), 10)]?.bulletPoints : null),
      (sectionKey.startsWith('proj') ? profile?.projects?.[parseInt(sectionKey.replace(/proj[-_]/, ''), 10)]?.description : null)
    );

    const rationale = buildOptimizationRationale({
      type: 'custom_instruction',
      category,
      instruction: appliedInstruction,
      chipLabel: appliedInstruction,
      roleOrContext,
    });

    const logEntry = {
      id: `instruction_${sectionKey}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      isoTimestamp: new Date().toISOString(),
      type: 'custom_instruction',
      category,
      title: itemTitle,
      roleOrContext,
      instruction: appliedInstruction,
      chipLabel: appliedInstruction,
      rationale,
      originalText,
      tailoredText,
      status: 'approved',
      sectionKey,
    };

    setApprovedChangesLog((curr) => [logEntry, ...curr]);
  };

  // Alias for custom instruction handler
  const handleApplyCustomInstruction = handleApplySectionInstruction;

  // Revert targeted section card to previous version from undo history stack
  const handleRevertSectionInstruction = (sectionKey) => {
    const stack = sectionHistory[sectionKey] || [];
    if (stack.length === 0) return;

    const previousContent = stack[stack.length - 1];
    const remainingStack = stack.slice(0, -1);
    setSectionHistory((prev) => ({
      ...prev,
      [sectionKey]: remainingStack,
    }));

    // Update customEdits on revert
    const nextCustomEdits = { ...customEdits };
    const altKey = sectionKey.includes('-')
      ? sectionKey.replace('-', '_')
      : (sectionKey.includes('_') ? sectionKey.replace('_', '-') : sectionKey);

    if (remainingStack.length > 0) {
      nextCustomEdits[sectionKey] = previousContent;
      nextCustomEdits[altKey] = previousContent;
    } else {
      delete nextCustomEdits[sectionKey];
      delete nextCustomEdits[altKey];
      if (sectionKey === 'summary' || sectionKey === 'professionalSummary') {
        delete nextCustomEdits.summary;
        delete nextCustomEdits.professionalSummary;
      }
    }

    let updatedProjects = [...(tailoredProjects && tailoredProjects.length > 0 ? tailoredProjects : (tailoredResult?.highlightedProjects || []))];
    let updatedExperiences = [...(tailoredResult?.highlightedExperiences || [])];

    if (sectionKey.startsWith('proj-') || sectionKey.startsWith('proj_')) {
      const idx = parseInt(sectionKey.replace(/proj[-_]/, ''), 10);
      if (updatedProjects[idx]) {
        updatedProjects[idx] = {
          ...updatedProjects[idx],
          description: previousContent,
        };
        const projName = updatedProjects[idx].name;
        if (remainingStack.length === 0 && projName) {
          delete nextCustomEdits[projName];
        } else if (projName) {
          nextCustomEdits[projName] = previousContent;
        }
      }
      setTailoredProjects(updatedProjects);
    } else if (sectionKey.startsWith('exp-') || sectionKey.startsWith('exp_')) {
      const idx = parseInt(sectionKey.replace(/exp[-_]/, ''), 10);
      if (updatedExperiences[idx]) {
        updatedExperiences[idx] = {
          ...updatedExperiences[idx],
          bulletPoints: previousContent,
        };
        const compName = updatedExperiences[idx].company;
        if (remainingStack.length === 0 && compName) {
          delete nextCustomEdits[compName];
        } else if (compName) {
          nextCustomEdits[compName] = previousContent;
        }
      }
    }

    setCustomEdits(nextCustomEdits);

    const approvedMissingTech = missingTechList.filter((t) => t.approved).map((t) => t.name);
    const rejectedMissingTech = missingTechList.filter((t) => !t.approved).map((t) => t.name);

    const baseTailored = {
      ...tailoredResult,
      tailoredSummary: (sectionKey === 'summary' || sectionKey === 'professionalSummary')
        ? previousContent
        : tailoredResult?.tailoredSummary,
      highlightedExperiences: updatedExperiences,
      highlightedProjects: updatedProjects,
      tailoredProjects: updatedProjects,
      customEdits: nextCustomEdits,
    };

    const compiled = compileFinalTailoredResume({
      masterProfile: profile,
      tailoredResult: baseTailored,
      optimizedSections,
      sectionDecisions: sectionReviewDecisions,
      approvedMissingTech,
      rejectedMissingTech,
      customEdits: nextCustomEdits,
      tailoredProjects: updatedProjects,
    });

    // Remove the most recent custom instruction for this sectionKey from approvedChangesLog
    setApprovedChangesLog((curr) => {
      const idx = curr.findIndex((item) => item.type === 'custom_instruction' && item.sectionKey === sectionKey);
      if (idx !== -1) {
        return [...curr.slice(0, idx), ...curr.slice(idx + 1)];
      }
      return curr;
    });

    setTailoredResult(compiled);
    onTailoredResultChange?.(compiled);
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
          {/* AI Engine Status Pill (Dual-Engine: Local Ollama / Cloud LLM) */}
          <button
            type="button"
            onClick={() => setIsCloudModalOpen(true)}
            title="Configure AI Engine (Local Ollama / Groq / Google Gemini Cloud Fallback)"
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono border transition-all cursor-pointer ${
              ollamaOnline
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                : cloudConfig.hasKey
                ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/25'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                ollamaOnline
                  ? 'bg-emerald-400 animate-pulse'
                  : cloudConfig.hasKey
                  ? 'bg-indigo-400 animate-pulse'
                  : 'bg-amber-400'
              }`}
            />
            <span>
              {ollamaOnline
                ? 'Ollama: Online'
                : cloudConfig.hasKey
                ? `Cloud AI: Active (${cloudConfig.provider.toUpperCase()})`
                : isPublic
                ? 'Cloud: Deterministic Mode'
                : 'Local Ollama: Offline (Click for Cloud)'}
            </span>
          </button>

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

          {/* Side-by-Side Comparison Tab Switcher */}
          <button
            type="button"
            onClick={() => {
              if (tailoredResult && onNavigateToStage) {
                onNavigateToStage('preview');
              }
            }}
            disabled={!tailoredResult}
            title={tailoredResult ? 'View Side-by-Side Comparison (Step 4: Twin Preview & Export)' : 'Generate tailored resume to view preview'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              tailoredResult
                ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700/70 hover:text-white cursor-pointer'
                : 'text-slate-600 bg-slate-950/40 border-slate-800/40 cursor-not-allowed opacity-60'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Side-by-Side Comparison</span>
          </button>

          {/* Optimization Log Tab Switcher */}
          <button
            type="button"
            onClick={() => {
              if (onNavigateToStage) {
                onNavigateToStage('log');
              } else {
                setWorkspaceTab(workspaceTab === 'log' ? 'steps' : 'log');
              }
            }}
            title="View Optimization Log & Approved Changes"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
              workspaceTab === 'log'
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700/70 hover:text-white'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Optimization Log</span>
            {approvedChangesLog.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {approvedChangesLog.length}
              </span>
            )}
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
            <button
              type="button"
              onClick={() => {
                if (tailoredResult && onNavigateToStage) {
                  onNavigateToStage('preview');
                }
              }}
              disabled={!tailoredResult}
              title={tailoredResult ? 'View Side-by-Side Twin Preview & Export' : 'Generate tailored resume to view preview'}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                tailoredResult
                  ? 'bg-slate-900 text-indigo-300 border border-indigo-500/30 hover:bg-slate-800 cursor-pointer'
                  : 'text-slate-500 bg-slate-900/40 border border-slate-800/40 cursor-not-allowed opacity-60'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  tailoredResult ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500'
                }`}
              >
                4
              </span>
              <span>Step 4: Twin Preview &amp; Export</span>
            </button>

            <span className="text-slate-600 text-xs hidden sm:inline">&bull;</span>

            {/* Optimization Log Pill */}
            <button
              type="button"
              onClick={() => {
                if (onNavigateToStage) {
                  onNavigateToStage('log');
                } else {
                  setWorkspaceTab(workspaceTab === 'log' ? 'steps' : 'log');
                }
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                workspaceTab === 'log'
                  ? 'bg-indigo-600 text-white border border-indigo-500 shadow-sm'
                  : approvedChangesLog.length > 0
                  ? 'bg-slate-900 text-emerald-300 border border-emerald-500/30 hover:bg-slate-800'
                  : 'text-slate-500 bg-slate-900/40 border border-slate-800/40 hover:text-slate-300'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5 text-indigo-400" />
              <span>Optimization Log</span>
              {approvedChangesLog.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {approvedChangesLog.length}
                </span>
              )}
            </button>

            {/* Quick Export Actions */}
            {tailoredResult && (
              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isExportingPdf}
                  title="Download PDF Document (Single-Page Guaranteed with Embedded Icons)"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-900 hover:bg-slate-800 text-rose-300 border border-rose-500/30 hover:text-white transition-all cursor-pointer shadow-sm"
                >
                  <Download className="w-3 h-3 text-rose-400" />
                  <span>{isExportingPdf ? 'Exporting...' : 'PDF'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadDocx}
                  disabled={isExportingDocx}
                  title="Download DOCX Document (.docx)"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-indigo-500/30 hover:text-white transition-all cursor-pointer shadow-sm"
                >
                  <Download className="w-3 h-3 text-indigo-400" />
                  <span>{isExportingDocx ? 'Exporting...' : 'DOCX'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {workspaceTab === 'log' ? (
          <div className="py-1">
            <OptimizationLogView
              log={approvedChangesLog}
              tailoredResult={tailoredResult}
              onBackToControls={() => setWorkspaceTab('steps')}
              onProceedToPreview={handleGenerateFinalTailoredResume}
            />
          </div>
        ) : (
          <>
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

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowUrlInput(!showUrlInput);
                  setUrlExtractError(null);
                }}
                className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 border transition-colors cursor-pointer ${
                  showUrlInput
                    ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/50'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700/70 hover:text-white'
                }`}
                title="Extract job description from a direct job link"
              >
                <Globe className="w-3 h-3 text-indigo-400" />
                <span>{showUrlInput ? 'Close URL Bar' : 'Extract from URL'}</span>
              </button>

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
          </div>

          {/* Optional URL Scraper Input Bar */}
          {showUrlInput && (
            <div className="mb-2.5 p-2.5 rounded-lg bg-slate-900/90 border border-indigo-500/30 space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-slate-200 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-indigo-400" />
                  Scrape &amp; Extract Job from URL
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowUrlInput(false);
                    setUrlExtractError(null);
                  }}
                  className="text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Link className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    value={urlInputText}
                    onChange={(e) => {
                      setUrlInputText(e.target.value);
                      if (urlExtractError) setUrlExtractError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isExtractingUrl) {
                        e.preventDefault();
                        handleExtractFromUrl();
                      }
                    }}
                    placeholder="Paste job link (LinkedIn, Indeed, Greenhouse, Lever, Workday, Company careers)..."
                    className="w-full bg-slate-950 text-slate-100 text-xs rounded-lg pl-8 pr-3 py-1.5 border border-slate-800 focus:border-indigo-500 outline-none font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleExtractFromUrl()}
                  disabled={isExtractingUrl || !urlInputText.trim()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  {isExtractingUrl ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Extracting...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 text-amber-300" />
                      <span>Extract &amp; Analyze</span>
                    </>
                  )}
                </button>
              </div>
              {urlExtractError && (
                <div className="text-[11px] text-rose-400 flex items-start gap-1.5 bg-rose-500/10 p-2 rounded border border-rose-500/20">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{urlExtractError}</span>
                </div>
              )}
            </div>
          )}

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
                  if (urlExtractError) setUrlExtractError(null);
                  if (gatekeeperResult) setGatekeeperResult(null);
                  if (baselineScore) setBaselineScore(null);
                  if (tailoredResult) setTailoredResult(null);
                  if (executionNotice) setExecutionNotice(null);
                  if (techXRayData) setTechXRayData(null);
                  if (missingTechList.length > 0) setMissingTechList([]);
                }}
                rows={4}
                placeholder="Paste target job description or link here... (Key requirements, required tech stack, responsibilities)"
                className="w-full bg-slate-900 text-slate-100 text-xs rounded-lg border border-slate-800 focus:border-indigo-500 p-2.5 outline-none font-mono resize-none leading-relaxed"
              />

              {/* Detected URL Quick-Extraction Banner */}
              {isJobUrl(jobDescription) && (
                <div className="mt-1.5 mb-1 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-between text-xs text-indigo-300 animate-fadeIn">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate text-[11px]">Job link detected. Extract clean JD text directly?</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExtractFromUrl(jobDescription)}
                    disabled={isExtractingUrl}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded text-[11px] shrink-0 transition-colors cursor-pointer flex items-center gap-1"
                  >
                    {isExtractingUrl ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Extracting...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-amber-300" />
                        <span>Extract &amp; Analyze</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Prominent URL Extraction Error Banner */}
              {urlExtractError && (
                <div className="mt-2 mb-1 p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300 flex items-start gap-2 shadow-sm animate-fadeIn">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1 font-medium">
                    {urlExtractError}
                  </div>
                  <button
                    type="button"
                    onClick={() => setUrlExtractError(null)}
                    className="text-rose-400 hover:text-rose-200 cursor-pointer text-xs ml-2"
                    title="Dismiss alert"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500">
                <span>{jobDescription.length} characters</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUrlInput(true);
                      setUrlExtractError(null);
                    }}
                    className="hover:text-indigo-400 transition-colors cursor-pointer flex items-center gap-1"
                    title="Extract job description from URL"
                  >
                    <Link className="w-2.5 h-2.5" />
                    <span>From URL</span>
                  </button>
                  <span>&bull;</span>
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
              ) : gatekeeperResult?.status === 'ABORT' ? (
                <span className="text-rose-400 font-mono text-[10px]">
                  ✕ {gatekeeperResult.failureReason || 'Gatekeeper Blocked'}
                </span>
              ) : (
                <span className="text-slate-500 text-[10px]">Ready for Gatekeeper analysis</span>
              )}
            </div>

            {gatekeeperResult?.status === 'PROCEED' ? (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => handleAnalyzeJd()}
                  disabled={isAnalyzing || isTailoring || isExtractingUrl}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Re-run Gatekeeper Analysis"
                >
                  <Search className="w-3.5 h-3.5 text-slate-400" />
                  <span>Re-Analyze</span>
                </button>

                <button
                  onClick={tailoredResult ? handleGenerateFinalTailoredResume : () => handleExecuteTailoring({ autoTransitionToPreview: false })}
                  disabled={isTailoring || isExtractingUrl}
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
                onClick={() => handleAnalyzeJd()}
                disabled={isAnalyzing || isExtractingUrl || !jobDescription.trim()}
                className="w-full sm:w-auto px-4 py-1.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white font-medium text-xs rounded-xl shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                {isExtractingUrl ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Extracting URL...</span>
                  </>
                ) : isAnalyzing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Analyzing JD...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5 text-indigo-200" />
                    <span>{isJobUrl(jobDescription) ? 'Extract & Analyze' : 'Analyze JD'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Gatekeeper Guardrail Block Alert (ABORT) - Clean & Compact */}
        {!isTailoring && gatekeeperResult?.status === 'ABORT' && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 space-y-2 animate-fadeIn shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="font-bold text-rose-100">
                  {gatekeeperResult.failureReason || gatekeeperResult.reasoning || gatekeeperResult.reason || 'Gatekeeper Guardrail Block (ABORT)'}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-500/20 text-rose-200 border border-rose-500/40 uppercase font-semibold">
                Guardrail Block
              </span>
            </div>
            <p className="text-xs text-rose-200 leading-relaxed font-medium">
              {gatekeeperResult.reasoning || gatekeeperResult.reason || gatekeeperResult.failureReason}
            </p>
            <div className="pt-1.5 border-t border-rose-500/20 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Candidate Profile: Entry-level (0-1 year)</span>
              <span className="font-mono text-slate-500">{gatekeeperResult.engine || 'Deterministic Rule Engine'}</span>
            </div>
          </div>
        )}

        {/* Deterministic Baseline Score Card (Compact Collapsible Accordion) */}
        {!isTailoring && gatekeeperResult?.status === 'PROCEED' && baselineScore && (
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

        {/* Offline / Fallback Notice - Hidden to preserve clean workspace UI */}
        {/*
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
        */}

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
            decisions={sectionReviewDecisions}
            onDecisionChange={handleSectionDecisionChange}
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
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
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
                onApply={handleApplyCustomInstruction}
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
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
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

                    <ul className="space-y-1 text-xs text-slate-300 list-disc list-inside">
                      {exp.bulletPoints?.map((bullet, bIdx) => (
                        <li key={bIdx} className="leading-relaxed">
                          {bullet}
                        </li>
                      ))}
                    </ul>

                    <SectionCustomInstruction
                      sectionKey={`exp-${idx}`}
                      currentText={exp.bulletPoints}
                      onApply={handleApplyCustomInstruction}
                      canRevert={(sectionHistory[`exp-${idx}`]?.length || 0) > 0}
                      onRevert={handleRevertSectionInstruction}
                      approvedMissingTech={tailoredResult.approvedMissingTech}
                      model={selectedModel}
                      placeholder="Custom instruction for bullets (e.g., 'Make punchier', 'Quantify achievements')..."
                      quickChips={BULLET_QUICK_CHIPS}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Tailored Projects */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
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
                      onApply={handleApplyCustomInstruction}
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

            {/* Document Export Notification */}
            {exportNotice && (
              <div
                className={`mb-3 p-3 rounded-xl border text-xs flex items-center gap-2 shadow-lg transition-all ${
                  exportNotice.type === 'success'
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{exportNotice.message}</span>
              </div>
            )}

            {/* Step 3: Clear Final Action Button at Bottom of Control Flow */}
            <div className="sticky bottom-0 z-20 pt-3 pb-2 -mx-3 sm:-mx-4 px-4 bg-slate-900/95 backdrop-blur border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xl rounded-b-xl">
              <div className="text-xs text-slate-300">
                <span className="font-semibold text-white">Step 3: Finalize &amp; Compile Tailored Resume</span>
                <span className="text-slate-400 ml-1.5 hidden md:inline">
                  Compile all approved tech, suggestions, and custom instructions into the tailored twin.
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleGenerateFinalTailoredResume}
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 via-teal-500 to-indigo-600 hover:from-emerald-500 hover:to-teal-400 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Generate Final Tailored Resume</span>
                  <ArrowRight className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

          </div>
        )}
          </>
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

      {/* Modal to Configure AI Engine & Cloud API Fallback */}
      <CloudAiSettingsModal
        isOpen={isCloudModalOpen}
        onClose={() => setIsCloudModalOpen(false)}
        ollamaOnline={ollamaOnline}
        onConfigChange={(newCfg) => setCloudConfigState(newCfg)}
      />
    </div>
  );
}
