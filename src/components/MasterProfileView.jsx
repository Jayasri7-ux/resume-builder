import {
  ShieldCheck,
  ShieldAlert,
  Briefcase,
  GraduationCap,
  Award,
  Layers,
  Code2,
  ExternalLink,
  Download,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Trophy,
} from 'lucide-react';
import { downloadProfileAsJson } from '../utils/storage';

export default function MasterProfileView({
  profile,
  factAudit,
  onReset,
  onOpenUpload,
}) {
  if (!profile) return null;

  const isVerified = factAudit?.isVerified ?? true;
  const integrityScore = factAudit?.integrityScore ?? 100;

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Right Side Header */}
      <div className="px-4 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white">
                Master Profile
              </span>
              {/* Fact Firewall Badge */}
              <div
                title={factAudit?.message || 'Ground-truth verified against Master_Resume.docx'}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                  isVerified
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                }`}
              >
                {isVerified ? (
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                ) : (
                  <ShieldAlert className="w-3 h-3 text-amber-400" />
                )}
                <span>Fact Firewall: {integrityScore}% Verified</span>
              </div>
            </div>
            <span className="text-[11px] text-slate-400">
              Source: {profile.metadata?.source || 'Master_Resume.docx'} &bull; Schema v2.0
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => downloadProfileAsJson(profile)}
            title="Export Profile as JSON"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onReset}
            title="Reset to Master_Resume.docx Ground Truth"
            className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Profile Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* 1. Candidate Personal Header Card */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 sm:p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                {profile.personalInfo?.fullName || 'Candidate Name'}
              </h1>
              <p className="text-xs font-medium text-indigo-400 mt-0.5">
                {profile.personalInfo?.headline || 'Full Stack Developer'}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-2">
                {profile.personalInfo?.email && <span>{profile.personalInfo.email}</span>}
                {profile.personalInfo?.phone && <span>{profile.personalInfo.phone}</span>}
                {profile.personalInfo?.location && (
                  <span className="text-emerald-400 font-medium">{profile.personalInfo.location}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onOpenUpload}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                AI Ingest Resume
              </button>
            </div>
          </div>

          {profile.personalInfo?.github && (
            <div className="pt-3 mt-3 border-t border-slate-800/80 flex flex-wrap gap-3 text-xs text-indigo-400 font-mono">
              {profile.personalInfo.github && (
                <a
                  href={profile.personalInfo.github}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline flex items-center gap-1"
                >
                  GitHub <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {profile.personalInfo.linkedin && (
                <a
                  href={profile.personalInfo.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline flex items-center gap-1"
                >
                  LinkedIn <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
        </div>

        {/* 2. Eligible Job Roles (Gatekeeper Foundation) */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-indigo-500/20 text-indigo-400">
                <Briefcase className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Eligible Job Roles &amp; Gatekeeper Scope
              </h2>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              Gatekeeper Ready
            </span>
          </div>

          {/* Target Families */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Target Job Families
            </span>
            <div className="flex flex-wrap gap-1.5">
              {profile.eligibleJobRoles?.targetFamilies?.map((fam, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-xs font-medium"
                >
                  {fam}
                </span>
              ))}
            </div>
          </div>

          {/* Primary Roles */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Primary Qualified Roles
            </span>
            <div className="flex flex-wrap gap-1.5">
              {profile.eligibleJobRoles?.primaryRoles?.map((role, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-medium flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  {role}
                </span>
              ))}
            </div>
          </div>

          {/* Crossover Roles */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span>Crossover &amp; Pivot Roles</span>
              <span className="text-[10px] text-indigo-400 font-normal">
                (Adjacent target roles verified by skills overlap)
              </span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {profile.eligibleJobRoles?.crossoverRoles?.map((crole, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-lg bg-violet-500/15 text-violet-300 border border-violet-500/30 text-xs font-medium"
                >
                  {crole}
                </span>
              ))}
            </div>
          </div>

          {/* Domain Strengths */}
          {profile.eligibleJobRoles?.domainStrengths?.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Domain &amp; Industry Strengths
              </span>
              <div className="flex flex-wrap gap-1.5">
                {profile.eligibleJobRoles.domainStrengths.map((dom, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-xs"
                  >
                    {dom}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 3. Professional Summary / Objective */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-2">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">
            Objective / Professional Summary
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            {profile.professionalSummary}
          </p>
        </div>

        {/* 4. Categorized Technical Skills */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-3.5 h-3.5 text-indigo-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Technical Skills (Categorized)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* Languages */}
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 space-y-1.5">
              <span className="text-[11px] font-semibold text-indigo-300 uppercase tracking-wider">
                Languages
              </span>
              <div className="flex flex-wrap gap-1">
                {profile.coreTechnicalSkills?.languages?.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px]">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Frontend */}
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 space-y-1.5">
              <span className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
                Frontend
              </span>
              <div className="flex flex-wrap gap-1">
                {profile.coreTechnicalSkills?.frontend?.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px]">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Backend */}
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 space-y-1.5">
              <span className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
                Backend
              </span>
              <div className="flex flex-wrap gap-1">
                {profile.coreTechnicalSkills?.backend?.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px]">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Databases */}
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 space-y-1.5">
              <span className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider">
                Databases
              </span>
              <div className="flex flex-wrap gap-1">
                {profile.coreTechnicalSkills?.databases?.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px]">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Tools & DevOps */}
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 space-y-1.5">
              <span className="text-[11px] font-semibold text-sky-300 uppercase tracking-wider">
                Tools &amp; Platforms
              </span>
              <div className="flex flex-wrap gap-1">
                {profile.coreTechnicalSkills?.cloudAndDevOps?.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px]">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* AI / ML / Analytics */}
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 space-y-1.5">
              <span className="text-[11px] font-semibold text-purple-300 uppercase tracking-wider">
                AI, ML &amp; Analytics
              </span>
              <div className="flex flex-wrap gap-1">
                {profile.coreTechnicalSkills?.aiAndTooling?.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px]">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 5. Work Experience / Internships */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Briefcase className="w-3.5 h-3.5 text-indigo-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Internships &amp; Work Experience
            </h2>
          </div>

          <div className="space-y-4">
            {profile.workExperience?.map((exp, idx) => (
              <div
                key={idx}
                className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2 relative"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{exp.company}</h3>
                    <p className="text-xs text-indigo-300 font-medium">
                      {exp.title} &bull; <span className="text-slate-400">{exp.location}</span>
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 self-start sm:self-auto">
                    {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                  </span>
                </div>

                <ul className="list-disc list-inside space-y-1 text-xs text-slate-300 pt-1">
                  {exp.bulletPoints?.map((bp, bIdx) => (
                    <li key={bIdx} className="leading-relaxed">
                      {bp}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* 6. Projects */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-3">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">
            Projects
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {profile.projects?.map((proj, idx) => (
              <div key={idx} className="bg-slate-900/60 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">{proj.name}</span>
                  {proj.liveUrl && (
                    <a
                      href={proj.liveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-indigo-400 hover:underline flex items-center gap-0.5"
                    >
                      Repo <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{proj.description}</p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {proj.techStack?.map((t, ti) => (
                    <span key={ti} className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-indigo-300 border border-slate-700/60">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 7. Education, Awards & Certifications */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Education */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Education
              </h2>
            </div>
            <div className="space-y-2.5">
              {profile.education?.map((edu, idx) => (
                <div key={idx} className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 text-xs">
                  <div className="font-semibold text-white">
                    {edu.degree} {edu.fieldOfStudy ? `(${edu.fieldOfStudy})` : ''}
                  </div>
                  <div className="text-slate-400 mt-0.5">
                    {edu.institution} ({edu.graduationYear})
                  </div>
                  {edu.honors && <div className="text-[11px] text-emerald-400 font-medium mt-0.5">{edu.honors}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Awards */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Awards
              </h2>
            </div>
            <div className="space-y-2">
              {profile.awards?.map((award, idx) => (
                <div key={idx} className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 text-xs text-slate-200 flex items-start gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{award}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Certifications */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-cyan-400" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Certifications
              </h2>
            </div>
            <div className="space-y-2">
              {profile.certifications?.map((c, idx) => (
                <div key={idx} className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 text-xs">
                  <span className="font-medium text-slate-200">{c.name}</span>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {c.issuer} &bull; {c.issueDate}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
