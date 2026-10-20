import { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  HelpCircle,
  Layers,
  Cpu,
  Flame,
  Check,
  X,
  Code2,
  Database,
  Cloud,
  Wrench,
  Boxes,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const BUCKET_ICONS = {
  Languages: Code2,
  Frameworks: Layers,
  Databases: Database,
  'Cloud/DevOps': Cloud,
  Tools: Wrench,
  'Core Domains': Boxes,
  'Soft Skills': Users,
};

export default function TechXRayDashboard({
  techXRayData,
  missingTechList = [],
  onToggleApprove,
  onApproveAll,
  onRejectAll,
  defaultCollapsed = false,
}) {
  const [userCollapsed, setUserCollapsed] = useState(null);
  const isCollapsed = userCollapsed !== null ? userCollapsed : defaultCollapsed;
  const [showFluffAudit, setShowFluffAudit] = useState(false);
  const [activeTab, setActiveTab] = useState('checklist'); // 'checklist' | 'taxonomy'

  if (!techXRayData) return null;

  const {
    categorized = {},
    matchedTech = [],
    coveragePercentage = 100,
    discardedFluffCount = 0,
    discardedFluffList = [],
  } = techXRayData;

  const matchedNamesSet = new Set(matchedTech.map((t) => t.name.toLowerCase()));
  const approvedItems = missingTechList.filter((t) => t.approved);
  const rejectedItems = missingTechList.filter((t) => !t.approved);

  // Compact collapsed summary chip
  if (isCollapsed) {
    return (
      <div className="bg-slate-950/80 border border-indigo-500/30 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-md animate-fadeIn">
        <div className="flex items-center gap-2.5 text-xs min-w-0">
          <div className="p-1 rounded-lg bg-indigo-600/20 text-indigo-300 shrink-0">
            <Cpu className="w-4 h-4 text-amber-300" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white">Tech X-Ray &amp; Missing Skills</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              {matchedTech.length} Verified
            </span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
              {approvedItems.length} Approved &bull; {rejectedItems.length} Omitted
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Fit: <strong className="text-indigo-400">{coveragePercentage}%</strong>
            </span>
          </div>
        </div>

        <button
          onClick={() => setUserCollapsed(false)}
          className="px-2.5 py-1 text-xs rounded-lg font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer self-start sm:self-auto shrink-0"
        >
          <span>Review Tech ({missingTechList.length})</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-950/80 border border-indigo-500/30 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-xl">
      {/* 1. Header & Engine Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-600 text-white shadow-sm shrink-0">
            <Cpu className="w-3.5 h-3.5 text-amber-300" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-white tracking-wide">
              Tech X-Ray &amp; Missing Tech Review
            </h3>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              Anti-Fluff
            </span>
          </div>
        </div>

        {/* View Switcher Tabs & Collapse Control */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <div className="flex items-center p-0.5 bg-slate-900 border border-slate-800 rounded-lg text-xs">
            <button
              onClick={() => setActiveTab('checklist')}
              className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-all cursor-pointer ${
                activeTab === 'checklist'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Missing Tech ({missingTechList.length})
            </button>
            <button
              onClick={() => setActiveTab('taxonomy')}
              className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-all cursor-pointer ${
                activeTab === 'taxonomy'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Taxonomy
            </button>
          </div>

          <button
            onClick={() => setUserCollapsed(true)}
            title="Collapse Tech X-Ray to summary chip"
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-800 transition-colors cursor-pointer"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Compact Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Profile Tech Fit</div>
          <div className="text-sm font-bold font-mono text-indigo-400 mt-0.5">
            {coveragePercentage}%
          </div>
          <div className="text-[10px] text-slate-500 truncate">
            {matchedTech.length} of {matchedTech.length + missingTechList.length} verified
          </div>
        </div>

        <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Matched in Profile</div>
          <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>{matchedTech.length} Verified</span>
          </div>
          <div className="text-[10px] text-slate-500 truncate">
            100% Ground Truth
          </div>
        </div>

        <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Missing from Profile</div>
          <div className="text-sm font-bold font-mono text-amber-400 mt-0.5 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>{missingTechList.length} Tools</span>
          </div>
          <div className="text-[10px] text-slate-500 truncate">
            {approvedItems.length} approved &bull; {rejectedItems.length} omitted
          </div>
        </div>

        <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Anti-Fluff Filter</div>
          <div className="text-sm font-bold font-mono text-rose-400 mt-0.5 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            <span>{discardedFluffCount} Blocked</span>
          </div>
          <button
            onClick={() => setShowFluffAudit(!showFluffAudit)}
            className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer block truncate"
          >
            {showFluffAudit ? 'Hide Filtered' : 'View Filtered'}
          </button>
        </div>
      </div>

      {/* 2b. Expandable Anti-Fluff Filter Audit Details */}
      {showFluffAudit && discardedFluffList.length > 0 && (
        <div className="p-2.5 bg-rose-950/20 border border-rose-500/30 rounded-xl text-xs space-y-1.5 animate-fadeIn">
          <div className="flex items-center gap-1.5 text-rose-300 font-semibold text-[11px]">
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            <span>Anti-Fluff Discarded Buzzwords:</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {discardedFluffList.map((buzzword, idx) => (
              <span
                key={idx}
                className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-rose-500/15 text-rose-300 border border-rose-500/30 line-through"
              >
                {buzzword}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 3. TAB 1: Human-in-the-Loop Missing Tech Checklist (Compact 2-Column Grid) */}
      {activeTab === 'checklist' && (
        <div className="space-y-2.5">
          {/* Compact Shield Advisory Bar */}
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-amber-200 text-[11px]">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Only approve tools you can defend in live interview. Rejected tools are safely omitted.</span>
            </div>
            {missingTechList.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                <button
                  onClick={onApproveAll}
                  className="px-2 py-0.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded text-[10px] font-medium transition-colors cursor-pointer"
                >
                  Approve All
                </button>
                <button
                  onClick={onRejectAll}
                  className="px-2 py-0.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded text-[10px] font-medium transition-colors cursor-pointer"
                >
                  Omit All
                </button>
              </div>
            )}
          </div>

          {/* Missing Tech 2-Column Grid */}
          {missingTechList.length === 0 ? (
            <div className="p-4 text-center rounded-xl bg-slate-900/60 border border-emerald-500/30 text-xs text-slate-300 space-y-1">
              <ShieldCheck className="w-5 h-5 text-emerald-400 mx-auto" />
              <div className="font-semibold text-white">100% Technical Match</div>
              <p className="text-slate-400 text-[11px]">
                All target technical skills exist in your Master Profile. Zero missing tech risks detected.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {missingTechList.map((item) => {
                const isApproved = item.approved;
                return (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-xl border transition-all flex flex-col justify-between ${
                      isApproved
                        ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm shadow-emerald-500/5'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-white text-xs truncate">
                            {item.name}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-800 text-indigo-300 border border-slate-700 shrink-0">
                            {item.category}
                          </span>
                        </div>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-mono shrink-0 border ${
                            isApproved
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {isApproved ? '✓ Included' : '✕ Omitted'}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-300 font-mono leading-tight line-clamp-2">
                        {item.definition}
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-1.5 pt-2 mt-2 border-t border-slate-800/80">
                      <button
                        onClick={() => onToggleApprove(item.id, true)}
                        title="Include in tailored resume"
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                          isApproved
                            ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400'
                            : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                        <span>Approve</span>
                      </button>
                      <button
                        onClick={() => onToggleApprove(item.id, false)}
                        title="Omit from resume to avoid interview traps"
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                          !isApproved
                            ? 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                            : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                      >
                        <X className="w-3 h-3" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. TAB 2: Categorized Rigid Tech Taxonomy */}
      {activeTab === 'taxonomy' && (
        <div className="space-y-2.5">
          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <span>Normalized into 7 rigid buckets:</span>
            <span className="text-emerald-400 font-semibold">&bull; Verified</span>
            <span className="text-amber-400 font-semibold">&bull; Missing</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {Object.entries(categorized).map(([bucket, items]) => {
              const IconComponent = BUCKET_ICONS[bucket] || Boxes;
              const hasItems = Array.isArray(items) && items.length > 0;

              return (
                <div
                  key={bucket}
                  className="bg-slate-900/70 border border-slate-800 rounded-xl p-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                    <div className="flex items-center gap-1.5">
                      <IconComponent className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{bucket}</span>
                    </div>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-800 text-slate-400">
                      {hasItems ? items.length : 0}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1 min-h-[24px]">
                    {!hasItems ? (
                      <span className="text-[10px] text-slate-500 italic">None demanded in JD</span>
                    ) : (
                      items.map((tech) => {
                        const isMatched = matchedNamesSet.has(tech.toLowerCase());
                        const isMissingItem = missingTechList.find(
                          (m) => m.name.toLowerCase() === tech.toLowerCase()
                        );
                        const isApproved = isMissingItem?.approved;

                        let badgeStyle = 'bg-slate-800 text-slate-300 border-slate-700';
                        if (isMatched) {
                          badgeStyle = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                        } else if (isApproved) {
                          badgeStyle = 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40 ring-1 ring-indigo-400/40';
                        } else if (bucket !== 'Soft Skills') {
                          badgeStyle = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
                        }

                        return (
                          <span
                            key={tech}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium border flex items-center gap-1 ${badgeStyle}`}
                          >
                            {isMatched && <Check className="w-2.5 h-2.5 text-emerald-400" />}
                            {!isMatched && bucket !== 'Soft Skills' && (
                              <HelpCircle className="w-2.5 h-2.5 text-amber-400" />
                            )}
                            <span>{tech}</span>
                            {isApproved && (
                              <span className="text-[8px] font-mono text-indigo-300 uppercase">
                                [Approved]
                              </span>
                            )}
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
