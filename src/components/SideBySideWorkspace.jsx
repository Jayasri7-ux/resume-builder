import { useState, useMemo } from 'react';
import { SlidersHorizontal, Columns2, ArrowRight, Sparkles, ClipboardList } from 'lucide-react';
import TailoredResumeWorkspace from './TailoredResumeWorkspace';
import SideBySideComparisonStage from './SideBySideComparisonStage';
import NativeResumeUploadModal from './NativeResumeUploadModal';
import OptimizationLogView from './OptimizationLogView';
import { loadMasterProfile, saveMasterProfile, resetMasterProfile } from '../utils/storage';
import { auditFactIntegrity } from '../services/factFirewall';

const MASTER_RESUME_SOURCE_TEXT = `jaya sri palli
+91-7893414784 jayasripalli20@gmail.com linkedin.com/in/jayasripalli github.com/Jayasri7-ux
OBJECTIVE: Aspiring graduate with internship experience in software development. Passionate about building scalable applications and eager to contribute to a collaborative organization.
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
Developed a web-based audit application using React and Django with JWT authentication to securely manage audit records.
Infosys Springboard (Virtual) - Python Intern | Feb 2026 - Mar 2026
Designed a YouTube Analytics Dashboard with Python/Pandas to automate reporting and analyze 1,000+ YouTube records.
PROJECTS:
Fake News Detection System (Python, NLP, Scikit-learn, Flask, React) - 90% classification accuracy.
AI Health Chatbot (Python, Django, NLP) - Instant symptom-based health guidance.`;

export default function SideBySideWorkspace() {
  const [profile, setProfile] = useState(() => loadMasterProfile());
  const [activeDocument, setActiveDocument] = useState({
    name: 'Master_Resume.docx',
    type: 'docx',
    previewUrl: '/Master_Resume.docx',
    text: MASTER_RESUME_SOURCE_TEXT,
  });

  const factAudit = useMemo(() => {
    return auditFactIntegrity({
      originalText: activeDocument?.text || MASTER_RESUME_SOURCE_TEXT,
      extractedProfile: profile,
    });
  }, [profile, activeDocument]);

  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Workflow Stages: 'control' (Control Workspace) | 'preview' (Side-by-Side Comparison) | 'log' (Optimization Log & Approved Changes)
  const [activeStage, setActiveStage] = useState('control');
  const [tailoredResult, setTailoredResult] = useState(null);
  const [baselineScore, setBaselineScore] = useState(null);
  const [approvedChangesLog, setApprovedChangesLog] = useState([]);

  const handlePreviewTailoredResume = ({ tailoredResult: newTailored, baselineScore: newScore }) => {
    if (newTailored) setTailoredResult(newTailored);
    if (newScore) setBaselineScore(newScore);
    setActiveStage('preview');
  };

  const handleBackToControls = () => {
    setActiveStage('control');
  };

  const handleIngestionComplete = ({ document, profile: newProfile }) => {
    if (newProfile) {
      setProfile(newProfile);
      saveMasterProfile(newProfile);
    }
    if (document) {
      setActiveDocument(document);
    }
    setIsUploadOpen(false);
  };

  const handleReset = () => {
    if (window.confirm('Reset to the authentic Master_Resume.docx baseline profile?')) {
      const defaultProf = resetMasterProfile();
      setProfile(defaultProf);
      setActiveDocument({
        name: 'Master_Resume.docx',
        type: 'docx',
        previewUrl: '/Master_Resume.docx',
        text: MASTER_RESUME_SOURCE_TEXT,
      });
      setTailoredResult(null);
      setBaselineScore(null);
      setApprovedChangesLog([]);
      setActiveStage('control');
    }
  };

  return (
    <div className="max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8">
      {/* Workflow Stage Navigation Bar */}
      <div className="mb-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
          {/* Tab 1: Control Workspace */}
          <button
            onClick={() => setActiveStage('control')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeStage === 'control'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Control Workspace</span>
            <span className="text-[10px] font-normal opacity-80 hidden sm:inline">(Steps 1-3: JD &amp; Edits)</span>
          </button>

          {/* Tab 2: Side-by-Side Comparison (Step 4: Twin Preview & Export) */}
          <button
            onClick={() => {
              if (tailoredResult) setActiveStage('preview');
            }}
            disabled={!tailoredResult}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeStage === 'preview'
                ? 'bg-indigo-600 text-white shadow-sm cursor-pointer'
                : tailoredResult
                ? 'text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer'
                : 'text-slate-600 cursor-not-allowed opacity-60'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>Side-by-Side Comparison</span>
            <span className="text-[10px] font-normal opacity-80 hidden sm:inline">(Step 4: Twin Preview &amp; Export)</span>
          </button>

          {/* Tab 3: Optimization Log & Approved Changes */}
          <button
            onClick={() => setActiveStage('log')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeStage === 'log'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Optimization Log &amp; Approved Changes</span>
            {approvedChangesLog.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {approvedChangesLog.length}
              </span>
            )}
          </button>
        </div>

        {tailoredResult && activeStage === 'control' && (
          <button
            onClick={() => setActiveStage('preview')}
            className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Generate Final Tailored Resume</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Stage 1: Interactive Control Workspace (Kept mounted to preserve all active states) */}
      <div className={activeStage === 'control' ? 'block' : 'hidden'}>
        <div className="max-w-5xl mx-auto h-[calc(100vh-172px)] min-h-[660px]">
          <TailoredResumeWorkspace
            profile={profile}
            factAudit={factAudit}
            onReset={handleReset}
            onOpenUpload={() => setIsUploadOpen(true)}
            onPreviewTailoredResume={handlePreviewTailoredResume}
            onTailoredResultChange={setTailoredResult}
            onBaselineScoreChange={setBaselineScore}
            approvedChangesLog={approvedChangesLog}
            onApprovedChangesChange={setApprovedChangesLog}
            onNavigateToStage={setActiveStage}
          />
        </div>
      </div>

      {/* Stage 2: Dedicated Zero-Scroll Side-by-Side Comparison View */}
      <div className={activeStage === 'preview' ? 'block' : 'hidden'}>
        {activeStage === 'preview' && (
          <SideBySideComparisonStage
            activeDocument={activeDocument}
            profile={profile}
            tailoredResult={tailoredResult}
            baselineScore={baselineScore}
            onBackToControls={handleBackToControls}
            onOpenUpload={() => setIsUploadOpen(true)}
          />
        )}
      </div>

      {/* Stage 3: Dedicated Optimization Log & Approved Changes View */}
      <div className={activeStage === 'log' ? 'block' : 'hidden'}>
        {activeStage === 'log' && (
          <OptimizationLogView
            log={approvedChangesLog}
            tailoredResult={tailoredResult}
            onBackToControls={handleBackToControls}
            onProceedToPreview={() => {
              if (tailoredResult) setActiveStage('preview');
            }}
          />
        )}
      </div>

      {/* Ingestion & Fact Firewall Upload Modal */}
      <NativeResumeUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onIngestionComplete={handleIngestionComplete}
      />
    </div>
  );
}
