import { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Cloud,
  Server,
  Key,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  Cpu,
  Eye,
  EyeOff,
  Trash2,
  Check,
} from 'lucide-react';
import {
  CLOUD_PROVIDERS,
  GROQ_MODELS,
  GEMINI_MODELS,
  getCloudConfig,
  setCloudConfig,
  clearCloudConfig,
  testCloudConnection,
  isPublicDeployment,
} from '../services/cloudAiService';
import { checkOllamaConnection, OLLAMA_BASE_URL } from '../services/ollamaService';

export default function CloudAiSettingsModal({
  isOpen,
  onClose,
  ollamaOnline = false,
  onConfigChange = null,
}) {
  const [config, setConfig] = useState(() => getCloudConfig());
  const [selectedProvider, setSelectedProvider] = useState(config.provider || CLOUD_PROVIDERS.GROQ);
  const [apiKeyInput, setApiKeyInput] = useState(config.apiKey || '');
  const [selectedModel, setSelectedModel] = useState(config.model);
  const [showKey, setShowKey] = useState(false);

  // Testing & Status
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success: boolean, message: string }
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isPublic = isPublicDeployment();

  // Sync state whenever modal opens
  useEffect(() => {
    if (isOpen) {
      const current = getCloudConfig();
      setConfig(current);
      setSelectedProvider(current.provider || CLOUD_PROVIDERS.GROQ);
      setApiKeyInput(current.apiKey || '');
      setSelectedModel(current.model);
      setTestResult(null);
      setSaveSuccess(false);
    }
  }, [isOpen]);

  // Update default model when provider switches if model doesn't belong to new provider
  const handleProviderChange = (newProvider) => {
    setSelectedProvider(newProvider);
    setTestResult(null);
    if (newProvider === CLOUD_PROVIDERS.GEMINI) {
      const valid = GEMINI_MODELS.some((m) => m.id === selectedModel);
      if (!valid) setSelectedModel(GEMINI_MODELS[0].id);
    } else {
      const valid = GROQ_MODELS.some((m) => m.id === selectedModel);
      if (!valid) setSelectedModel(GROQ_MODELS[0].id);
    }
  };

  const handleTestConnection = async () => {
    if (!apiKeyInput.trim()) {
      setTestResult({
        success: false,
        message: 'Please enter an API key to test.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await testCloudConnection({
        provider: selectedProvider,
        apiKey: apiKeyInput.trim(),
        model: selectedModel,
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({
        success: false,
        message: err.message || 'Connection test failed.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    setCloudConfig({
      provider: selectedProvider,
      apiKey: apiKeyInput.trim(),
      model: selectedModel,
    });

    const updated = getCloudConfig();
    setConfig(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);

    if (typeof onConfigChange === 'function') {
      onConfigChange(updated);
    }
  };

  const handleClear = () => {
    clearCloudConfig();
    setApiKeyInput('');
    const updated = getCloudConfig();
    setConfig(updated);
    setTestResult({
      success: true,
      message: 'Cloud API credentials cleared. Engine operating in deterministic fallback mode.',
    });
    if (typeof onConfigChange === 'function') {
      onConfigChange(updated);
    }
  };

  if (!isOpen) return null;

  const currentModels =
    selectedProvider === CLOUD_PROVIDERS.GEMINI ? GEMINI_MODELS : GROQ_MODELS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 text-white shadow-sm">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">
                  AI Engine &amp; Cloud Fallback Settings
                </h3>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    isPublic
                      ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  {isPublic ? 'Public Cloud (Vercel)' : 'Localhost Development'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Dual-Engine AI: Local Ollama with seamless Groq / Google Gemini cloud fallback
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Dual-Engine Status Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Engine 1: Local Ollama */}
            <div
              className={`p-3 rounded-xl border transition-all ${
                ollamaOnline
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <Server className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Local Ollama</span>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    ollamaOnline
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {ollamaOnline ? 'Online' : 'Standby / Offline'}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-300">
                {isPublic
                  ? 'Unavailable on public web domains. Protected for local developer machines.'
                  : ollamaOnline
                  ? `Active on ${OLLAMA_BASE_URL}. Inference runs 100% locally on your machine.`
                  : 'Start Ollama locally (`ollama serve`) or use Cloud Fallback below.'}
              </p>
            </div>

            {/* Engine 2: Cloud Fallback */}
            <div
              className={`p-3 rounded-xl border transition-all ${
                config.hasKey
                  ? 'bg-indigo-950/20 border-indigo-500/30 text-indigo-200'
                  : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <Cloud className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Cloud Fallback</span>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    config.hasKey
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {config.hasKey ? 'Configured & Active' : 'Deterministic Mode'}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-300">
                {config.hasKey
                  ? `Active (${config.provider.toUpperCase()}: ${config.model}). Supports public Vercel deployment.`
                  : 'Zero crashes guarantee. Smart Rule Engine active until an API key is entered.'}
              </p>
            </div>
          </div>

          {/* Cloud Provider Tabs */}
          <div className="space-y-2">
            <label className="block text-slate-300 font-medium">Select Cloud LLM Provider</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleProviderChange(CLOUD_PROVIDERS.GROQ)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedProvider === CLOUD_PROVIDERS.GROQ
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm ring-1 ring-indigo-500/50'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-xs text-white">Groq (Recommended)</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                    Ultra-Fast Free
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Llama 3.3 70B &amp; 3.1 8B with near-instant sub-second inference.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleProviderChange(CLOUD_PROVIDERS.GEMINI)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedProvider === CLOUD_PROVIDERS.GEMINI
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm ring-1 ring-indigo-500/50'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-xs text-white">Google Gemini</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-mono">
                    Free Tier
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Gemini 1.5 &amp; 2.0 Flash with native JSON mode and high reasoning.
                </p>
              </button>
            </div>
          </div>

          {/* Model Selector */}
          <div className="space-y-1.5">
            <label className="block text-slate-300 font-medium">Model Selection</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 outline-none focus:border-indigo-500 font-mono text-xs cursor-pointer"
            >
              {currentModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* API Key Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-slate-300 font-medium flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-indigo-400" />
                <span>{selectedProvider === CLOUD_PROVIDERS.GEMINI ? 'Google Gemini' : 'Groq'} API Key</span>
              </label>
              {selectedProvider === CLOUD_PROVIDERS.GROQ ? (
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 underline underline-offset-2"
                >
                  <span>Get Free Groq Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 underline underline-offset-2"
                >
                  <span>Get Free Gemini Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={
                  selectedProvider === CLOUD_PROVIDERS.GEMINI
                    ? 'AIzaSy...'
                    : 'gsk_...'
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 pr-20 text-slate-100 placeholder-slate-600 outline-none focus:border-indigo-500 font-mono text-xs"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  title={showKey ? 'Hide key' : 'Show key'}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                {apiKeyInput && (
                  <button
                    type="button"
                    onClick={() => setApiKeyInput('')}
                    title="Clear input"
                    className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Your API key is saved exclusively in your browser&apos;s <code className="font-mono text-slate-300">localStorage</code>.
              It is sent directly to the official provider endpoint and never logged or stored on any intermediate server.
            </p>
          </div>

          {/* Test Connection & Results */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/25 border-rose-500/40 text-rose-200'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-[11px]">
                <p className="font-semibold">{testResult.success ? 'Connection Verified' : 'Connection Error'}</p>
                <p className="opacity-90">{testResult.message}</p>
              </div>
            </div>
          )}

          {/* Deterministic Fallback Mode Assurance */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-slate-200">Graceful Zero-Key Guarantee</span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                If no API key is provided, the application runs uninterrupted in deterministic fallback mode.
                All Fact Firewalls, Gatekeeper rules, and PDF/DOCX export features remain 100% operational with zero build errors.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || !apiKeyInput.trim()}
              className="px-3 py-1.5 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-800 hover:bg-slate-700 text-white font-medium flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs"
            >
              {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cpu className="w-3.5 h-3.5" />}
              <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
            </button>

            {config.hasKey && (
              <button
                type="button"
                onClick={handleClear}
                className="px-2.5 py-1.5 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 font-medium transition-all cursor-pointer text-xs"
              >
                Clear Key
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 font-medium transition-all cursor-pointer text-xs"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all cursor-pointer shadow-md flex items-center gap-1.5 text-xs"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Save Configuration</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
