import { useState, useEffect } from 'react';
import {
  Server,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  RefreshCw,
  FileText,
  Code2,
  Terminal,
} from 'lucide-react';
import {
  checkOllamaConnection,
  generateResumeContent,
  buildXmlPrompt,
  OLLAMA_BASE_URL,
  DEFAULT_MODEL,
} from '../services/ollamaService';

export default function OllamaTest() {
  const [baseUrl, setBaseUrl] = useState(OLLAMA_BASE_URL);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [connectionStatus, setConnectionStatus] = useState('checking'); // 'checking' | 'connected' | 'error'
  const [connectionMessage, setConnectionMessage] = useState('Checking connection to Ollama...');

  // Prompt inputs with realistic defaults
  const [userJd, setUserJd] = useState(
    'Senior Frontend Engineer: Requires 4+ years React, TypeScript, Tailwind CSS, Vite, performance optimization, and experience integrating local LLM / AI APIs.'
  );
  const [userInput, setUserInput] = useState(
    'Software developer with 5 years experience building modern web apps with React, JavaScript, and Tailwind CSS. Built full-stack apps and experimented with local AI tools like Ollama.'
  );

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState(null);
  const [generationError, setGenerationError] = useState(null);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [viewRawJson, setViewRawJson] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Check connection when baseUrl or refreshTrigger changes
  useEffect(() => {
    let ignore = false;

    async function verifyConnection() {
      const res = await checkOllamaConnection(baseUrl);
      if (ignore) return;

      if (res.success) {
        setConnectionStatus('connected');
        setModels(res.models);
        setConnectionMessage(res.message);
        if (res.models.length > 0) {
          setSelectedModel((prev) => {
            const hasModel = res.models.some((m) => m.name === prev);
            return hasModel ? prev : res.models[0].name;
          });
        }
      } else {
        setConnectionStatus('error');
        setConnectionMessage(res.error || 'Failed to connect to Ollama.');
        setModels([]);
      }
    }

    verifyConnection();

    return () => {
      ignore = true;
    };
  }, [baseUrl, refreshTrigger]);

  const handleManualCheck = () => {
    setConnectionStatus('checking');
    setConnectionMessage(`Testing connection to ${baseUrl}...`);
    setGenerationError(null);
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleTestGenerate = async () => {
    setIsGenerating(true);
    setGenerationError(null);
    setGenerationResult(null);

    const res = await generateResumeContent({
      baseUrl,
      model: selectedModel,
      userJd,
      userInput,
    });

    if (res.success) {
      setGenerationResult(res);
    } else {
      setGenerationError(res.error);
    }
    setIsGenerating(false);
  };

  const currentXmlPrompt = buildXmlPrompt({ userJd, userInput });

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <header className="border-b border-slate-800 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-2">
              Milestone 1 Verification
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Ollama Connection &amp; Prompt Tester
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Verifies endpoint <code className="text-indigo-300 bg-slate-900 px-1.5 py-0.5 rounded">{baseUrl}</code> with strict JSON format and XML prompt delimiters (<code className="text-amber-300">&lt;user_jd&gt;</code> / <code className="text-emerald-300">&lt;user_input&gt;</code>).
            </p>
          </div>

          <button
            onClick={handleManualCheck}
            disabled={connectionStatus === 'checking'}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors shadow-sm cursor-pointer"
          >
            {connectionStatus === 'checking' ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Check Connection
          </button>
        </div>
      </header>

      {/* Connection Status Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-white text-sm">Server Endpoint:</span>
                {isEditingUrl ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      className="text-xs font-mono bg-slate-950 px-2 py-1 rounded text-slate-200 border border-indigo-500 focus:outline-none"
                    />
                    <button
                      onClick={() => setIsEditingUrl(false)}
                      className="text-[11px] bg-indigo-600 px-2 py-0.5 rounded text-white cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditingUrl(true)}
                    title="Click to edit endpoint"
                    className="text-xs font-mono bg-slate-950 hover:bg-slate-800 px-2 py-0.5 rounded text-indigo-300 border border-slate-800 cursor-pointer transition-colors"
                  >
                    {baseUrl}
                  </button>
                )}

                {connectionStatus === 'connected' && (
                  <span className="inline-flex items-center gap-1 text-emerald-400 text-xs bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                  </span>
                )}
                {connectionStatus === 'error' && (
                  <span className="inline-flex items-center gap-1 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full font-medium">
                    <AlertCircle className="w-3.5 h-3.5" /> Disconnected
                  </span>
                )}
                {connectionStatus === 'checking' && (
                  <span className="inline-flex items-center gap-1 text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-medium">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking...
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">{connectionMessage}</p>
            </div>
          </div>

          {/* Model Selection */}
          <div className="flex items-center gap-2">
            <label htmlFor="model-select" className="text-xs font-medium text-slate-400 whitespace-nowrap">
              Active Model:
            </label>
            {models.length > 0 ? (
              <select
                id="model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-white text-xs rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} ({Math.round((m.size / (1024 * 1024 * 1024)) * 10) / 10} GB)
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="model-input"
                type="text"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                placeholder="e.g. mistral or llama3"
                className="bg-slate-950 border border-slate-700 text-white text-xs rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none w-36 font-mono"
              />
            )}
          </div>
        </div>

        {/* Troubleshooting Guide if connection error */}
        {connectionStatus === 'error' && (
          <div className="bg-rose-950/20 border border-rose-900/50 rounded-lg p-4 text-xs text-rose-300 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-rose-200">
              <Terminal className="w-4 h-4" />
              <span>Ollama Quick Connection Guide</span>
            </div>
            <p>If Ollama is installed locally, make sure the service is started with CORS allowed for browser requests:</p>
            <div className="bg-slate-950/90 rounded p-2.5 font-mono text-slate-200 text-xs border border-slate-800 space-y-1">
              <p className="text-slate-400"># Windows PowerShell (Allow CORS and start Ollama):</p>
              <p className="text-indigo-300">$env:OLLAMA_ORIGINS=&quot;*&quot;</p>
              <p className="text-indigo-300">ollama serve</p>
            </div>
            <p className="text-slate-400">
              If you haven&apos;t pulled a model yet, run: <code className="text-amber-300">ollama pull {selectedModel || 'mistral'}</code>
            </p>
          </div>
        )}
      </div>

      {/* XML Delimiters Test Bench */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Input Parameters (<user_jd> and <user_input>) */}
        <div className="space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-white">Target Job Description (&lt;user_jd&gt;)</h2>
              </div>
              <span className="text-[11px] font-mono text-amber-400/80 bg-amber-400/10 px-2 py-0.5 rounded">
                XML Delimited
              </span>
            </div>
            <textarea
              rows={4}
              value={userJd}
              onChange={(e) => setUserJd(e.target.value)}
              placeholder="Paste job description here..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none font-mono"
            />

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">User Input &amp; Experience (&lt;user_input&gt;)</h2>
              </div>
              <span className="text-[11px] font-mono text-emerald-400/80 bg-emerald-400/10 px-2 py-0.5 rounded">
                XML Delimited
              </span>
            </div>
            <textarea
              rows={4}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Paste candidate background, skills, or existing bullets here..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none font-mono"
            />

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowPromptPreview(!showPromptPreview)}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-4 flex items-center gap-1 cursor-pointer"
              >
                {showPromptPreview ? 'Hide Full XML Prompt' : 'Preview XML Prompt Delimiters'}
              </button>

              <button
                onClick={handleTestGenerate}
                disabled={isGenerating}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-md transition-all cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating JSON via Ollama...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    Execute Test (JSON + XML)
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Full XML Prompt Preview Accordion */}
          {showPromptPreview && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-300 space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-[11px] pb-1 border-b border-slate-800">
                <span>Exact Prompt Delimiters Sent to Ollama</span>
                <span>format: &quot;json&quot;</span>
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-slate-300 max-h-64 leading-relaxed">
                {currentXmlPrompt}
              </pre>
            </div>
          )}
        </div>

        {/* Right: Output & JSON Result Viewer */}
        <div className="space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 min-h-[350px] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">Ollama JSON Output</h3>
              </div>
              {generationResult && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">
                    {generationResult.durationMs ? `${(generationResult.durationMs / 1000).toFixed(1)}s` : ''}
                  </span>
                  <button
                    onClick={() => setViewRawJson(!viewRawJson)}
                    className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white border border-slate-700 font-mono cursor-pointer"
                  >
                    {viewRawJson ? 'Formatted View' : 'Raw JSON'}
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 py-4">
              {isGenerating && (
                <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                  <div>
                    <p className="text-sm font-medium text-white">Querying Ollama with XML Delimiters...</p>
                    <p className="text-xs text-slate-400 mt-1">Generating strictly structured JSON with model `{selectedModel}`</p>
                  </div>
                </div>
              )}

              {generationError && (
                <div className="bg-rose-950/20 border border-rose-900/40 rounded-lg p-4 text-xs text-rose-300 space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-rose-200">
                    <AlertCircle className="w-4 h-4" />
                    <span>Error during generation</span>
                  </div>
                  <p className="text-rose-300/90 leading-relaxed font-mono">{generationError}</p>
                </div>
              )}

              {!isGenerating && !generationError && !generationResult && (
                <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                  <Code2 className="w-10 h-10 stroke-1" />
                  <p className="text-xs">
                    Click <strong className="text-slate-400">&quot;Execute Test (JSON + XML)&quot;</strong> to test the Ollama service pipeline.
                  </p>
                  <p className="text-[11px] text-slate-600 max-w-sm">
                    Verifies prompt wrapping inside &lt;user_jd&gt; and &lt;user_input&gt; and parses the JSON response into tailored resume elements.
                  </p>
                </div>
              )}

              {!isGenerating && generationResult && viewRawJson && (
                <pre className="bg-slate-950 p-4 rounded-lg font-mono text-[11px] text-emerald-400 overflow-x-auto max-h-96 leading-relaxed border border-slate-800">
                  {JSON.stringify(generationResult.data, null, 2)}
                </pre>
              )}

              {!isGenerating && generationResult && !viewRawJson && (
                <div className="space-y-4 text-xs">
                  {/* Match Score & Summary */}
                  {generationResult.data?.matchScore !== undefined && (
                    <div className="flex items-center justify-between bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                      <span className="font-semibold text-slate-300">Match Score</span>
                      <span className="px-2.5 py-0.5 rounded-full font-bold text-sm bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {generationResult.data.matchScore}%
                      </span>
                    </div>
                  )}

                  {generationResult.data?.tailoredSummary && (
                    <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800 space-y-1">
                      <span className="font-semibold text-indigo-300 text-[11px] uppercase tracking-wider">
                        Tailored Summary
                      </span>
                      <p className="text-slate-200 leading-relaxed">
                        {generationResult.data.tailoredSummary}
                      </p>
                    </div>
                  )}

                  {/* Matched Skills */}
                  {Array.isArray(generationResult.data?.matchedSkills) && generationResult.data.matchedSkills.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="font-semibold text-slate-400 text-[11px] uppercase tracking-wider">
                        Matched Skills
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {generationResult.data.matchedSkills.map((skill, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[11px]"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Missing Keywords */}
                  {Array.isArray(generationResult.data?.missingKeywords) && generationResult.data.missingKeywords.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="font-semibold text-slate-400 text-[11px] uppercase tracking-wider">
                        Missing Keywords / Opportunities
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {generationResult.data.missingKeywords.map((kw, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[11px]"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bullet Points */}
                  {Array.isArray(generationResult.data?.highlightedExperiences) && (
                    <div className="space-y-2">
                      <span className="font-semibold text-slate-400 text-[11px] uppercase tracking-wider">
                        Tailored Experience Bullets
                      </span>
                      {generationResult.data.highlightedExperiences.map((exp, idx) => (
                        <div key={idx} className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-1.5">
                          <div className="font-medium text-slate-200">
                            {exp.role} {exp.company ? `@ ${exp.company}` : ''}
                          </div>
                          <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                            {exp.bulletPoints?.map((bp, bIdx) => (
                              <li key={bIdx}>{bp}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
