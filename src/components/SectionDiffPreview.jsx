import { useState, useMemo } from 'react';
import {
  Check,
  X,
  CheckCheck,
  RotateCcw,
  Sparkles,
  FileCheck,
  FileText,
  Briefcase,
  FolderGit2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

/**
 * Interactive Side-by-Side Diff Preview Component
 * Allows users to individually inspect, approve, or reject AI section rewrites.
 * Enforces non-empty fallback (proposedContent || originalContent).
 */
export default function SectionDiffPreview({
  optimizedSections,
  onApplyDecisions,
  masterProfile: _masterProfile,
}) {
  // Track approval decisions: { [id]: 'approved' | 'rejected' }
  const [decisions, setDecisions] = useState(() => {
    if (!optimizedSections || !optimizedSections.summary) return {};
    const initial = {};
    // Summary
    initial['summary'] = optimizedSections.summary.needs_rewrite ? 'approved' : 'bypassed';

    // Internships
    (optimizedSections.internships || []).forEach((item) => {
      initial[item.id] = item.needs_rewrite ? 'approved' : 'bypassed';
    });

    // Projects
    (optimizedSections.projects || []).forEach((item) => {
      initial[item.id] = item.needs_rewrite ? 'approved' : 'bypassed';
    });

    return initial;
  });

  const [expandedSections, setExpandedSections] = useState({
    summary: true,
    internships: true,
    projects: true,
    fixed: false,
  });

  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleSection = (sec) => {
    setExpandedSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  const setDecision = (id, status) => {
    setDecisions((prev) => ({ ...prev, [id]: status }));
  };

  const handleApproveAll = () => {
    const updated = {};
    updated['summary'] = optimizedSections.summary.needs_rewrite ? 'approved' : 'bypassed';
    (optimizedSections.internships || []).forEach((i) => {
      updated[i.id] = i.needs_rewrite ? 'approved' : 'bypassed';
    });
    (optimizedSections.projects || []).forEach((p) => {
      updated[p.id] = p.needs_rewrite ? 'approved' : 'bypassed';
    });
    setDecisions(updated);
  };

  const handleRejectAll = () => {
    const updated = {};
    updated['summary'] = 'rejected';
    (optimizedSections.internships || []).forEach((i) => {
      updated[i.id] = 'rejected';
    });
    (optimizedSections.projects || []).forEach((p) => {
      updated[p.id] = 'rejected';
    });
    setDecisions(updated);
  };

  // Compile final accepted state for downstream document generator
  const finalizedPayload = useMemo(() => {
    if (!optimizedSections || !optimizedSections.summary) return null;

    // 1. Summary
    const summaryDecision = decisions['summary'];
    const summaryText =
      summaryDecision === 'approved'
        ? (optimizedSections.summary.proposedText || optimizedSections.summary.originalText)
        : optimizedSections.summary.originalText;

    // 2. Internships
    const finalizedInternships = (optimizedSections.internships || []).map((item) => {
      const decision = decisions[item.id];
      const bullets =
        decision === 'approved'
          ? (item.proposedBullets && item.proposedBullets.length > 0
              ? item.proposedBullets
              : item.originalBullets)
          : item.originalBullets;

      return {
        ...item,
        finalBullets: bullets,
        isApproved: decision === 'approved',
      };
    });

    // 3. Projects
    const finalizedProjects = (optimizedSections.projects || []).map((item) => {
      const decision = decisions[item.id];
      const desc =
        decision === 'approved'
          ? (item.proposedDescription || item.originalDescription)
          : item.originalDescription;

      return {
        ...item,
        finalDescription: desc,
        isApproved: decision === 'approved',
      };
    });

    return {
      summary: summaryText,
      internships: finalizedInternships,
      projects: finalizedProjects,
      fixedSections: optimizedSections.fixedSections,
    };
  }, [decisions, optimizedSections]);

  if (!optimizedSections || !optimizedSections.summary) return null;

  const totalActionable = 1 + (optimizedSections.internships?.length || 0) + (optimizedSections.projects?.length || 0);
  const approvedCount = Object.values(decisions).filter((v) => v === 'approved' || v === 'bypassed').length;

  if (isCollapsed) {
    return (
      <div className="bg-slate-950/90 border border-indigo-500/30 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-md animate-fadeIn">
        <div className="flex items-center gap-2.5 text-xs">
          <div className="p-1 rounded-lg bg-indigo-600/30 text-indigo-300 shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white">Section Optimization &amp; Layout Diffs</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              {approvedCount}/{totalActionable} Approved
            </span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              &plusmn;10 Words Lock
            </span>
          </div>
        </div>

        <button
          onClick={() => setIsCollapsed(false)}
          className="px-2.5 py-1 text-xs rounded-lg font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer self-start sm:self-auto shrink-0"
        >
          <span>Expand Diffs</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-950/90 border border-indigo-500/30 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-xl">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-600 text-white shadow-sm shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white tracking-wide">
                Section Optimization &amp; Layout Diff Review
              </h3>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                &plusmn;10 Words Lock
              </span>
            </div>
          </div>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap">
          <button
            onClick={handleApproveAll}
            className="px-2 py-1 text-[11px] rounded-lg font-medium bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <CheckCheck className="w-3 h-3" />
            <span>Approve All</span>
          </button>
          <button
            onClick={handleRejectAll}
            className="px-2 py-1 text-[11px] rounded-lg font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Keep Original</span>
          </button>
          {onApplyDecisions && (
            <button
              onClick={() => {
                onApplyDecisions(finalizedPayload);
                setIsCollapsed(true);
              }}
              className="px-2.5 py-1 text-[11px] rounded-lg font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm flex items-center gap-1 cursor-pointer"
            >
              <FileCheck className="w-3 h-3 text-amber-300" />
              <span>Apply ({approvedCount}/{totalActionable})</span>
            </button>
          )}
          <button
            onClick={() => setIsCollapsed(true)}
            title="Collapse Diff Review"
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-800 transition-colors cursor-pointer"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Professional Summary Diff */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden">
        <div
          onClick={() => toggleSection('summary')}
          className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between cursor-pointer hover:bg-slate-900/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-semibold text-white">Dynamic Section 1: Professional Summary</span>
            {optimizedSections.summary.needs_rewrite ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                Rewritten with target keywords
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Smart Bypassed (Already Aligned)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
              decisions['summary'] === 'approved' || decisions['summary'] === 'bypassed'
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-rose-500/20 text-rose-300'
            }`}>
              {decisions['summary'] === 'approved' ? 'Approved' : decisions['summary'] === 'bypassed' ? 'Preserved' : 'Rejected'}
            </span>
            {expandedSections.summary ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </div>

        {expandedSections.summary && (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* Left: Original */}
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold uppercase">
                  <span>Original Baseline</span>
                  <span className="font-mono">{optimizedSections.summary.lengthAudit?.originalWords || 0} words</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  {optimizedSections.summary.originalText}
                </p>
              </div>

              {/* Right: Proposed Rewrite */}
              <div className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-500/30 space-y-1.5">
                <div className="flex items-center justify-between text-indigo-300 text-[11px] font-semibold uppercase">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    Target-Optimized Suggestion
                  </span>
                  <span className="font-mono text-emerald-400">
                    {optimizedSections.summary.lengthAudit?.finalWords || 0} words ({optimizedSections.summary.lengthAudit?.delta >= 0 ? `+${optimizedSections.summary.lengthAudit?.delta}` : optimizedSections.summary.lengthAudit?.delta} &bull; &le; 10 budget)
                  </span>
                </div>
                <p className="text-slate-100 leading-relaxed font-medium">
                  {optimizedSections.summary.proposedText || optimizedSections.summary.originalText}
                </p>
                {optimizedSections.summary.integratedKeywords?.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    <span className="text-[10px] text-slate-400">Integrated:</span>
                    {optimizedSections.summary.integratedKeywords.map((kw, idx) => (
                      <span key={idx} className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
                {optimizedSections.summary.bypassReason && (
                  <p className="text-[11px] text-emerald-400 italic">
                    &bull; {optimizedSections.summary.bypassReason}
                  </p>
                )}
              </div>
            </div>

            {/* Decision Controls */}
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/80">
              <button
                onClick={() => setDecision('summary', 'approved')}
                className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                  decisions['summary'] === 'approved'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>Approve Rewrite</span>
              </button>
              <button
                onClick={() => setDecision('summary', 'rejected')}
                className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                  decisions['summary'] === 'rejected'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                <X className="w-3.5 h-3.5" />
                <span>Keep Original</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Internships Diff (Work Experience) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden">
        <div
          onClick={() => toggleSection('internships')}
          className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between cursor-pointer hover:bg-slate-900/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-semibold text-white">Dynamic Section 2: Internships ({optimizedSections.internships?.length || 0})</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              Real Companies Grounded
            </span>
          </div>
          <div className="flex items-center gap-2">
            {expandedSections.internships ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </div>

        {expandedSections.internships && (
          <div className="p-4 space-y-4">
            {(optimizedSections.internships || []).map((exp) => {
              const audit = exp.lengthAudits && exp.lengthAudits[0];
              const isApproved = decisions[exp.id] === 'approved';
              const isBypassed = decisions[exp.id] === 'bypassed';

              return (
                <div key={exp.id} className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
                    <div>
                      <strong className="text-white font-semibold">{exp.title}</strong>
                      <span className="text-slate-400 ml-1.5">&bull; {exp.company}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-indigo-300">{exp.period}</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        isApproved || isBypassed
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}>
                        {isApproved ? 'Approved' : isBypassed ? 'Preserved' : 'Rejected'}
                      </span>
                    </div>
                  </div>

                  {/* Side by side diff */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Left: Original */}
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold">
                        <span>Original Bullet</span>
                        <span className="font-mono">{audit?.originalWords || 0} words</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed">
                        {exp.originalBullets?.[0] || 'No original bullet'}
                      </p>
                    </div>

                    {/* Right: Proposed Rewrite */}
                    <div className="p-2.5 rounded-lg bg-indigo-950/20 border border-indigo-500/30 space-y-1">
                      <div className="flex items-center justify-between text-indigo-300 text-[10px] uppercase font-semibold">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-300" />
                          Proposed Rewrite
                        </span>
                        <span className="font-mono text-emerald-400">
                          {audit?.finalWords || 0} words ({audit?.delta >= 0 ? `+${audit?.delta}` : audit?.delta} &bull; &le; 10 budget)
                        </span>
                      </div>
                      <p className="text-slate-100 leading-relaxed font-medium">
                        {exp.proposedBullets?.[0] || exp.originalBullets?.[0]}
                      </p>
                      {exp.bypassReason && (
                        <p className="text-[10px] text-emerald-400 italic">
                          &bull; {exp.bypassReason}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Individual Controls */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => setDecision(exp.id, 'approved')}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                        isApproved
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => setDecision(exp.id, 'rejected')}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                        decisions[exp.id] === 'rejected'
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Keep Original</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Projects Diff */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden">
        <div
          onClick={() => toggleSection('projects')}
          className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between cursor-pointer hover:bg-slate-900/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-semibold text-white">Dynamic Section 3: Projects ({optimizedSections.projects?.length || 0})</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              Metric Grounding Protected
            </span>
          </div>
          <div className="flex items-center gap-2">
            {expandedSections.projects ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </div>

        {expandedSections.projects && (
          <div className="p-4 space-y-4">
            {(optimizedSections.projects || []).map((proj) => {
              const audit = proj.lengthAudit;
              const isApproved = decisions[proj.id] === 'approved';
              const isBypassed = decisions[proj.id] === 'bypassed';

              return (
                <div key={proj.id} className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
                    <div className="flex items-center gap-2">
                      <strong className="text-white font-semibold">{proj.name}</strong>
                      <div className="flex flex-wrap gap-1">
                        {proj.techStack?.map((t, idx) => (
                          <span key={idx} className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                      isApproved || isBypassed
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}>
                      {isApproved ? 'Approved' : isBypassed ? 'Preserved' : 'Rejected'}
                    </span>
                  </div>

                  {/* Side by Side Diff */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Left: Original */}
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold">
                        <span>Original Description</span>
                        <span className="font-mono">{audit?.originalWords || 0} words</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed text-[11px]">
                        {proj.originalDescription}
                      </p>
                    </div>

                    {/* Right: Proposed Rewrite */}
                    <div className="p-2.5 rounded-lg bg-indigo-950/20 border border-indigo-500/30 space-y-1">
                      <div className="flex items-center justify-between text-indigo-300 text-[10px] uppercase font-semibold">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-300" />
                          Proposed Rewrite
                        </span>
                        <span className="font-mono text-emerald-400">
                          {audit?.finalWords || 0} words ({audit?.delta >= 0 ? `+${audit?.delta}` : audit?.delta} &bull; &le; 10 budget)
                        </span>
                      </div>
                      <p className="text-slate-100 leading-relaxed font-medium text-[11px]">
                        {proj.proposedDescription || proj.originalDescription}
                      </p>
                      {proj.bypassReason && (
                        <p className="text-[10px] text-emerald-400 italic">
                          &bull; {proj.bypassReason}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => setDecision(proj.id, 'approved')}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                        isApproved
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => setDecision(proj.id, 'rejected')}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                        decisions[proj.id] === 'rejected'
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Keep Original</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
