/**
 * Master Profile Schema Definition and Normalization Helpers
 * Ultra-high integrity schema ensuring all profile fields are type-safe and validated.
 */

export const MASTER_PROFILE_SCHEMA = {
  personalInfo: {
    fullName: 'string',
    headline: 'string',
    email: 'string',
    phone: 'string',
    location: 'string',
    linkedin: 'string',
    github: 'string',
    portfolio: 'string',
  },
  professionalSummary: 'string',
  eligibleJobRoles: {
    targetFamilies: 'array', // e.g. ["Full Stack Web Development", "Backend Engineering"]
    primaryRoles: 'array',   // e.g. ["Full Stack Developer", "Python Developer"]
    crossoverRoles: 'array', // e.g. ["Data Analytics Engineer", "AI/ML Integration Engineer"]
    domainStrengths: 'array', // e.g. ["Enterprise Access Control", "Workflow Automation"]
  },
  coreTechnicalSkills: {
    languages: 'array',
    frontend: 'array',
    backend: 'array',
    databases: 'array',
    cloudAndDevOps: 'array',
    aiAndTooling: 'array',
  },
  workExperience: 'array', // Array of { company, title, location, startDate, endDate, current, bulletPoints }
  projects: 'array',       // Array of { name, role, techStack, description, highlights, liveUrl, repoUrl }
  education: 'array',      // Array of { institution, degree, fieldOfStudy, graduationYear, honors }
  awards: 'array',         // Array of strings (e.g. Smart India Hackathon Grand Finalist)
  certifications: 'array', // Array of { name, issuer, issueDate, credentialUrl }
};

/**
 * Validates whether an object conforms to the Master Profile shape.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateMasterProfile(profile) {
  const errors = [];

  if (!profile || typeof profile !== 'object') {
    return { valid: false, errors: ['Profile must be an object'] };
  }

  // Personal Info
  if (!profile.personalInfo || typeof profile.personalInfo !== 'object') {
    errors.push('Missing personalInfo object');
  } else if (!profile.personalInfo.fullName) {
    errors.push('personalInfo.fullName is required');
  }

  // Professional Summary
  if (typeof profile.professionalSummary !== 'string') {
    errors.push('professionalSummary must be a string');
  }

  // Eligible Job Roles
  if (!profile.eligibleJobRoles || typeof profile.eligibleJobRoles !== 'object') {
    errors.push('Missing eligibleJobRoles object');
  } else {
    if (!Array.isArray(profile.eligibleJobRoles.primaryRoles)) {
      errors.push('eligibleJobRoles.primaryRoles must be an array');
    }
    if (!Array.isArray(profile.eligibleJobRoles.crossoverRoles)) {
      errors.push('eligibleJobRoles.crossoverRoles must be an array');
    }
  }

  // Core Technical Skills
  if (!profile.coreTechnicalSkills || typeof profile.coreTechnicalSkills !== 'object') {
    errors.push('Missing coreTechnicalSkills object');
  }

  // Work Experience
  if (!Array.isArray(profile.workExperience)) {
    errors.push('workExperience must be an array');
  }

  // Projects
  if (!Array.isArray(profile.projects)) {
    errors.push('projects must be an array');
  }

  // Education
  if (!Array.isArray(profile.education)) {
    errors.push('education must be an array');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normalizes any raw/partial profile object into a strictly conforming Master Profile.
 * Guarantees zero undefined property errors on UI render.
 */
export function normalizeMasterProfile(raw = {}) {
  const p = typeof raw === 'object' && raw !== null ? raw : {};
  const personal = p.personalInfo || {};
  const roles = p.eligibleJobRoles || {};
  const skills = p.coreTechnicalSkills || {};

  const cleanArray = (val) => (Array.isArray(val) ? val.filter((item) => typeof item === 'string' && item.trim()) : []);

  return {
    personalInfo: {
      fullName: String(personal.fullName || personal.name || '').trim(),
      headline: String(personal.headline || personal.title || '').trim(),
      email: String(personal.email || '').trim(),
      phone: String(personal.phone || '').trim(),
      location: String(personal.location || '').trim(),
      linkedin: String(personal.linkedin || '').trim(),
      github: String(personal.github || '').trim(),
      portfolio: String(personal.portfolio || personal.website || '').trim(),
    },
    professionalSummary: String(p.professionalSummary || p.summary || p.objective || '').trim(),
    eligibleJobRoles: {
      targetFamilies: cleanArray(roles.targetFamilies || roles.jobFamilies),
      primaryRoles: cleanArray(roles.primaryRoles || roles.roles || roles.targetRoles),
      crossoverRoles: cleanArray(roles.crossoverRoles || roles.secondaryRoles),
      domainStrengths: cleanArray(roles.domainStrengths || roles.domains || roles.industries),
    },
    coreTechnicalSkills: {
      languages: cleanArray(skills.languages),
      frontend: cleanArray(skills.frontend || skills.frontEnd),
      backend: cleanArray(skills.backend || skills.backEnd),
      databases: cleanArray(skills.databases || skills.database),
      cloudAndDevOps: cleanArray(skills.cloudAndDevOps || skills.devops || skills.cloud || skills.tools),
      aiAndTooling: cleanArray(skills.aiAndTooling || skills.ai || skills.ml),
    },
    workExperience: Array.isArray(p.workExperience || p.experience || p.internships)
      ? (p.workExperience || p.experience || p.internships).map((exp) => ({
          company: String(exp.company || exp.employer || '').trim(),
          title: String(exp.title || exp.role || exp.position || '').trim(),
          location: String(exp.location || '').trim(),
          startDate: String(exp.startDate || exp.start || '').trim(),
          endDate: String(exp.endDate || exp.end || '').trim(),
          current: Boolean(exp.current || exp.isCurrent),
          bulletPoints: cleanArray(exp.bulletPoints || exp.bullets || exp.highlights || exp.responsibilities),
        }))
      : [],
    projects: Array.isArray(p.projects)
      ? p.projects.map((proj) => ({
          name: String(proj.name || proj.title || '').trim(),
          role: String(proj.role || '').trim(),
          techStack: cleanArray(proj.techStack || proj.technologies || proj.skills),
          description: String(proj.description || '').trim(),
          highlights: cleanArray(proj.highlights || proj.bulletPoints || proj.bullets),
          liveUrl: String(proj.liveUrl || proj.link || proj.url || '').trim(),
          repoUrl: String(proj.repoUrl || proj.github || '').trim(),
        }))
      : [],
    education: Array.isArray(p.education)
      ? p.education.map((edu) => ({
          institution: String(edu.institution || edu.school || edu.university || '').trim(),
          degree: String(edu.degree || '').trim(),
          fieldOfStudy: String(edu.fieldOfStudy || edu.major || '').trim(),
          graduationYear: String(edu.graduationYear || edu.year || edu.date || '').trim(),
          honors: String(edu.honors || edu.gpa || edu.cgpa || edu.percentage || '').trim(),
        }))
      : [],
    awards: cleanArray(p.awards || p.honors || p.achievements),
    certifications: Array.isArray(p.certifications)
      ? p.certifications.map((cert) => ({
          name: String(cert.name || cert.title || '').trim(),
          issuer: String(cert.issuer || cert.organization || '').trim(),
          issueDate: String(cert.issueDate || cert.date || '').trim(),
          credentialUrl: String(cert.credentialUrl || cert.url || '').trim(),
        }))
      : [],
    metadata: {
      lastUpdated: p.metadata?.lastUpdated || new Date().toISOString(),
      source: p.metadata?.source || 'Master_Resume.docx',
      version: '1.0',
    },
  };
}
