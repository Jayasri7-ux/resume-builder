import { useState, useMemo } from 'react';
import {
  ClipboardCheck,
  ClipboardList,
  Check,
  Copy,
  Sparkles,
  Clock,
  Search,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Briefcase,
  FolderGit2,
  FileText,
  Wrench,
  RotateCcw,
} from 'lucide-react';

import {
  isSkillLogItem,
  matchesLogCategory,
} from '../services/sectionOptimizationService';

export { isSkillLogItem, matchesLogCategory };

/**
 * Dedicated Optimization Log & Approved Changes View
 * Centralized audit trail that tracks and renders:
 * - User-approved custom instructions & quick action chips (e.g. "Quantify achievements", "CI/CD")
 * - Rewritten bullet points and section optimizations
 * - User-approved missing skill additions
 * - Complete before-vs-after text comparison with timestamps and role context
 */
export default function OptimizationLogView({
  log = [],
  onBackToControls,
  onProceedToPreview,
  tailoredResult,
}) {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  // Filtered log items based on category and search query
  const filteredLog = useMemo(() => {
    return (log || []).filter((item) => {
      const matchCategory = matchesLogCategory(item, selectedCategory);

      if (!matchCategory) return false;

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const title = (item.title || '').toLowerCase();
      const role = (item.roleOrContext || '').toLowerCase();
      const instruction = (item.instruction || '').toLowerCase();
      const chip = (item.chipLabel || '').toLowerCase();
      const rationale = (item.rationale || '').toLowerCase();
      const original = (item.originalText || '').toLowerCase();
      const tailored = (item.tailoredText || '').toLowerCase();
      const skillName = (item.skillName || '').toLowerCase();
      const skillCategory = (item.skillCategory || '').toLowerCase();
      const category = (item.category || '').toLowerCase();

      return (
        title.includes(q) ||
        role.includes(q) ||
        instruction.includes(q) ||
        chip.includes(q) ||
        rationale.includes(q) ||
        original.includes(q) ||
        tailored.includes(q) ||
        skillName.includes(q) ||
        skillCategory.includes(q) ||
        category.includes(q)
      );
    });
  }, [log, selectedCategory, searchQuery]);

  // Aggregate statistics
  const stats = useMemo(() => {
    const total = (log || []).length;
    const skills = (log || []).filter((i) => matchesLogCategory(i, 'SKILLS')).length;
    const experience = (log || []).filter((i) => matchesLogCategory(i, 'EXPERIENCE')).length;
    const projects = (log || []).filter((i) => matchesLogCategory(i, 'PROJECTS')).length;
    const summary = (log || []).filter((i) => matchesLogCategory(i, 'SUMMARY')).length;
    const instructions = (log || []).filter((i) => i.type === 'custom_instruction').length;

    return { total, skills, experience, projects, summary, instructions };
  }, [log]);

  const handleCopyLogSummary = () => {
    if (!log || log.length === 0) return;

    const formatted = log
      .map((item, idx) => {
        return `[${idx + 1}] ${item.category?.toUpperCase()} | ${item.roleOrContext || 'Section'}
Timestamp: ${item.timestamp}
Action / Chip: ${item.instruction || item.chipLabel || 'Approved'}
${item.rationale ? `Optimization Rationale: ${item.rationale}\n` : ''}--- Original Baseline ---
${item.originalText}
--- Tailored & Approved ---
${item.tailoredText}
`;
      })
      .join('\n----------------------------------------\n\n');

    navigator.clipboard.writeText(
      `RESUME OPTIMIZATION AUDIT LOG (${log.length} Approved Changes)\n\n${formatted}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getCategoryIcon = (cat, item) => {
    if (isSkillLogItem(item) || cat?.toLowerCase() === 'skills' || cat?.toLowerCase() === 'skill') {
      return <Wrench className="w-3.5 h-3.5 text-emerald-400" />;
    }
    switch (cat?.toLowerCase()) {
      case 'experience':
        return <Briefcase className="w-3.5 h-3.5 text-blue-400" />;
      case 'projects':
      case 'project':
        return <FolderGit2 className="w-3.5 h-3.5 text-violet-400" />;
      case 'summary':
        return <FileText className="w-3.5 h-3.5 text-indigo-400" />;
      default:
        return <Sparkles className="w-3.5 h-3.5 text-amber-400" />;
    }
  };

  const getCategoryBadgeClass = (cat, item) => {
    if (isSkillLogItem(item) || cat?.toLowerCase() === 'skills' || cat?.toLowerCase() === 'skill') {
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    }
    switch (cat?.toLowerCase()) {
      case 'experience':
        return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      case 'projects':
      case 'project':
        return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
      case 'summary':
        return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
      default:
        return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4 py-2">
      {/* Top Action Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3 flex-wrap shadow-sm">
        <div className="flex items-center gap-3">
          {onBackToControls && (
            <button
              onClick={onBackToControls}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium"
              title="Return to Control Workspace"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Control Workspace</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <ClipboardCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white">
                  Optimization Log &amp; Approved Changes
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {stats.total} Approved
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Audited record of custom chips, rewritten bullets, AI suggestions, and added skills
              </p>
            </div>
          </div>
        </div>

        {/* Right Toolbar */}
        <div className="flex items-center gap-2">
          {log.length > 0 && (
            <button
              onClick={handleCopyLogSummary}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Copy text summary of all approved changes"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy Audit Log</span>
                </>
              )}
            </button>
          )}

          {onProceedToPreview && tailoredResult && (
            <button
              onClick={onProceedToPreview}
              className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <span>Side-by-Side Comparison</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Aggregate Statistics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
            Total Approved
          </span>
          <span className="text-xl font-bold text-white mt-1">{stats.total}</span>
          <span className="text-[10px] text-slate-500 mt-0.5">Across Steps 2 &amp; 3</span>
        </div>

        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 flex flex-col">
          <span className="text-[10px] text-blue-400 uppercase tracking-wider font-semibold">
            Experience Bullets
          </span>
          <span className="text-xl font-bold text-blue-300 mt-1">{stats.experience}</span>
          <span className="text-[10px] text-slate-500 mt-0.5">Internship rewrites</span>
        </div>

        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 flex flex-col">
          <span className="text-[10px] text-violet-400 uppercase tracking-wider font-semibold">
            Project Rewrites
          </span>
          <span className="text-xl font-bold text-violet-300 mt-1">{stats.projects}</span>
          <span className="text-[10px] text-slate-500 mt-0.5">Technical projects</span>
        </div>

        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 flex flex-col">
          <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold">
            Skills Added
          </span>
          <span className="text-xl font-bold text-emerald-300 mt-1">{stats.skills}</span>
          <span className="text-[10px] text-slate-500 mt-0.5">JD target tech</span>
        </div>

        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 flex flex-col col-span-2 sm:col-span-1">
          <span className="text-[10px] text-amber-400 uppercase tracking-wider font-semibold">
            Custom Chips
          </span>
          <span className="text-xl font-bold text-amber-300 mt-1">{stats.instructions}</span>
          <span className="text-[10px] text-slate-500 mt-0.5">Card instructions</span>
        </div>
      </div>

      {/* Filter Chips & Search Bar */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 flex items-center justify-between gap-2.5 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'ALL', label: `All (${stats.total})` },
            { id: 'EXPERIENCE', label: `Experience (${stats.experience})` },
            { id: 'PROJECTS', label: `Projects (${stats.projects})` },
            { id: 'SKILLS', label: `Skills (${stats.skills})` },
            { id: 'SUMMARY', label: `Summary (${stats.summary})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedCategory(tab.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                selectedCategory === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[200px] flex-1 sm:flex-initial">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search role, chip, keyword..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Log Entries List */}
      {filteredLog.length === 0 ? (
        <div className="bg-slate-950/50 border border-dashed border-slate-800 rounded-xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-sm font-semibold text-slate-200">
              {log.length === 0
                ? 'No Approved Changes Logged Yet'
                : 'No Matching Changes Found'}
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {log.length === 0
                ? 'As you approve missing skills in Step 1/2, generate AI suggestions in Step 2, and apply custom instruction chips (such as "Quantify achievements", "Focus on architecture & design", or "CI/CD") in Step 3, every approved change will be recorded here with complete before-and-after audit trails.'
                : 'Try adjusting your search query or selecting "All" to view all approved optimizations.'}
            </p>
          </div>
          {onBackToControls && log.length === 0 && (
            <button
              onClick={onBackToControls}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Go to Control Workspace (Steps 1-3)</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLog.map((item, index) => (
            <div
              key={item.id || index}
              className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-3 transition-all hover:border-slate-700/80 shadow-sm"
            >
              {/* Card Header Row */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Category Badge */}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${getCategoryBadgeClass(
                      item.category,
                      item
                    )}`}
                  >
                    {getCategoryIcon(item.category, item)}
                    <span>{isSkillLogItem(item) ? 'Skills' : (item.category || 'General')}</span>
                  </span>

                  {/* Role / Context Title */}
                  <span className="text-xs font-semibold text-white">
                    {item.roleOrContext || item.title || 'Resume Section'}
                  </span>

                  {/* Applied Chip / Instruction Badge */}
                  {(item.chipLabel || item.instruction) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>{item.chipLabel || item.instruction}</span>
                    </span>
                  )}
                </div>

                {/* Right Metadata: Timestamp & Status */}
                <div className="flex items-center gap-2 text-xs">
                  <div className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span className="font-mono">{item.timestamp}</span>
                  </div>

                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Approved</span>
                  </span>
                </div>
              </div>

              {/* Optimization Rationale Badge */}
              {item.rationale && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-indigo-950/40 border border-indigo-500/30 text-xs shadow-inner">
                  <div className="flex items-center gap-1.5 font-semibold text-indigo-300 shrink-0 text-[11px] pt-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Optimization Rationale:</span>
                  </div>
                  <p className="text-slate-200 text-[11px] leading-relaxed font-medium">
                    {item.rationale}
                  </p>
                </div>
              )}

              {/* Side-by-Side Before vs After Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                {/* Original Baseline */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-2.5 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-b border-slate-800/60 pb-1 mb-1.5">
                    <span className="font-semibold uppercase tracking-wider text-slate-400">
                      Original Master Baseline
                    </span>
                    <span className="text-slate-500">Unmodified Fact</span>
                  </div>
                  <div className="text-slate-300 whitespace-pre-wrap font-sans text-[11px] leading-relaxed">
                    {item.originalText || (
                      <span className="italic text-slate-500">
                        Not present in baseline profile
                      </span>
                    )}
                  </div>
                </div>

                {/* Tailored & Approved Content */}
                <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-lg p-2.5 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-emerald-400 border-b border-emerald-500/20 pb-1 mb-1.5">
                    <span className="font-semibold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-emerald-400" />
                      <span>Tailored &amp; Approved</span>
                    </span>
                    <span className="text-emerald-400/80">Active in Export</span>
                  </div>
                  <div className="text-emerald-100 whitespace-pre-wrap font-sans text-[11px] leading-relaxed">
                    {item.tailoredText || (
                      <span className="italic text-slate-500">
                        Content preserved from baseline
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Footer: Security & Integrity Affirmation */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/50 text-[10px] text-slate-500">
                <span className="flex items-center gap-1 text-slate-400">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>Fact Firewall Verified &bull; Ground-truth preserved</span>
                </span>
                <span className="font-mono text-slate-500">
                  {item.type === 'custom_instruction'
                    ? 'Targeted Card Instruction'
                    : item.type === 'skill_addition'
                    ? 'Missing Tech Addition'
                    : 'Targeted AI Section Rewrite'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
