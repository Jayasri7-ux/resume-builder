import { useState } from 'react';
import { Sparkles, RotateCcw, AlertCircle, ShieldAlert } from 'lucide-react';
import { applyCustomInstructionPipeline } from '../services/customInstructionService';

export const DEFAULT_QUICK_CHIPS = [
  { label: 'Make punchier', prompt: 'Make this punchier' },
  { label: 'Shorten', prompt: 'Shorten this' },
  { label: 'Quantify achievements', prompt: 'Quantify achievements' },
  { label: 'Focus on architecture & design', prompt: 'Focus on architecture & design' },
  { label: 'Highlight leadership & collaboration', prompt: 'Highlight leadership & collaboration' },
  { label: 'Make more technical', prompt: 'Make more technical' },
];

export const BULLET_QUICK_CHIPS = DEFAULT_QUICK_CHIPS;

/**
 * Targeted Card-Level Custom Instruction Component
 * Scoped locally to individual resume section cards.
 * Enforces:
 * - Immutable Fact Firewall blocking alterations to core facts
 * - Scope Guardrail flagging off-topic or conversational inputs
 * - Undo History Revert button
 * - Fast API processing with resilient 15s AbortController timeout
 */
export default function SectionCustomInstruction({
  sectionKey,
  currentText,
  onApply,
  canRevert = false,
  onRevert,
  approvedMissingTech = [],
  model,
  placeholder = "Custom instruction (e.g., 'Make this punchier', 'Shorten this')...",
  quickChips = DEFAULT_QUICK_CHIPS,
}) {
  const [instruction, setInstruction] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isBlocked, setIsBlocked] = useState(false);

  const handleApply = async (customPrompt) => {
    const trimmed = (typeof customPrompt === 'string' ? customPrompt : instruction).trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);
    setIsBlocked(false);
    setInstruction(trimmed);

    try {
      const response = await applyCustomInstructionPipeline({
        sectionKey,
        currentText,
        instruction: trimmed,
        approvedMissingTech,
        model,
        timeoutMs: 90000,
      });

      if (response.blocked) {
        setIsBlocked(true);
        setErrorMessage(response.message);
        return;
      }

      if (response.scope_violation) {
        setIsBlocked(false);
        setErrorMessage(response.message);
        return;
      }

      if (response.success && response.rewrittenText) {
        onApply(sectionKey, response.rewrittenText, {
          instruction: trimmed,
          previousText: currentText,
        });
        setInstruction('');
        setErrorMessage(null);
      }
    } catch (err) {
      setErrorMessage(err.message || 'An error occurred while applying instruction.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleApply();
    }
  };

  const handleQuickPrompt = (promptText) => {
    handleApply(promptText);
  };

  return (
    <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1.5">
      {/* Input + Action Buttons */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <input
            type="text"
            value={instruction}
            onChange={(e) => {
              setInstruction(e.target.value);
              if (errorMessage) setErrorMessage(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            className="w-full bg-slate-900/90 text-slate-100 placeholder:text-slate-500 text-xs rounded-lg px-2.5 py-1.5 border border-slate-700/60 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none font-sans transition-all disabled:opacity-50"
          />
        </div>

        {/* Apply Button */}
        <button
          type="button"
          onClick={handleApply}
          disabled={isLoading || !instruction.trim()}
          title="Apply custom instruction to this section"
          className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg flex items-center gap-1 transition-all cursor-pointer shrink-0 shadow-sm shadow-indigo-600/20"
        >
          {isLoading ? (
            <>
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Applying...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>Apply</span>
            </>
          )}
        </button>

        {/* Revert Button (visible when history stack has >= 1 version) */}
        {canRevert && (
          <button
            type="button"
            onClick={() => {
              if (onRevert) onRevert(sectionKey);
              setErrorMessage(null);
            }}
            disabled={isLoading}
            title="Revert to previous text version"
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg flex items-center gap-1 transition-colors cursor-pointer shrink-0 border border-slate-700"
          >
            <RotateCcw className="w-3 h-3 text-indigo-400" />
            <span>Revert</span>
          </button>
        )}
      </div>

      {/* Quick Prompt Chips */}
      <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
        <span className="text-slate-500 font-medium">Quick:</span>
        {quickChips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => handleQuickPrompt(chip.prompt)}
            disabled={isLoading}
            className="px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-slate-700 disabled:opacity-50 text-slate-400 hover:text-slate-200 border border-slate-700/50 transition-colors cursor-pointer"
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Security & Scope Firewall Alert Message */}
      {errorMessage && (
        <div
          className={`p-2.5 rounded-lg text-xs flex items-start gap-2 animate-fadeIn ${
            isBlocked
              ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
              : 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
          }`}
        >
          {isBlocked ? (
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          )}
          <span className="flex-1 leading-relaxed font-medium">{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-slate-400 hover:text-white p-0.5 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
