/**
 * Master Profile Ground-Truth Baseline
 * Extracted directly from user's authentic Master_Resume.docx (Updated 15-10-2026)
 * Candidate: Jaya Sri Palli
 */

import { normalizeMasterProfile } from '../types/masterProfileSchema.js';

export const rawMasterResumeProfile = {
  personalInfo: {
    fullName: 'Jaya Sri Palli',
    headline: 'Full Stack Developer',
    email: 'jayasripalli20@gmail.com',
    phone: '+91-7893414784',
    location: 'Bangalore, India',
    linkedin: 'https://linkedin.com/in/jayasripalli',
    github: 'https://github.com/Jayasri7-ux',
    portfolio: 'https://github.com/Jayasri7-ux',
  },
  professionalSummary:
    'Aspiring graduate with internship experience in software development. Passionate about building scalable applications and eager to contribute to a collaborative organization.',
  eligibleJobRoles: {
    targetFamilies: [
      'Full Stack Web Development',
      'Python Software Engineering',
      'Frontend Engineering',
      'Backend API & Database Systems',
    ],
    primaryRoles: [
      'Full Stack Developer',
      'Python Developer',
      'React / Frontend Developer',
      'Django / Backend Developer',
    ],
    crossoverRoles: [
      'Data Analyst / Analytics Engineer',
      'AI/ML Application Engineer (NLP)',
      'Junior Software Engineer',
    ],
    domainStrengths: [
      'Enterprise Audit Applications & Access Control (JWT)',
      'Data Analytics Dashboards (Python/Pandas)',
      'Machine Learning Classification & NLP',
    ],
  },
  coreTechnicalSkills: {
    languages: ['Python', 'Java', 'JavaScript', 'C'],
    frontend: ['HTML', 'CSS', 'React'],
    backend: ['Node.js', 'Django', 'Flask'],
    databases: ['SQL', 'MongoDB'],
    cloudAndDevOps: ['Git', 'GitHub', 'VS Code', 'Render'],
    aiAndTooling: ['Pandas', 'Scikit-learn', 'NLP'],
  },
  workExperience: [
    {
      company: 'Larsen & Toubro (L&T), Chennai',
      title: 'Full Stack Developer Intern',
      location: 'Chennai, India',
      startDate: 'Jul 2025',
      endDate: 'Dec 2025',
      current: false,
      bulletPoints: [
        'Developed a web-based audit application using React and Django with JWT authentication to securely manage audit records.',
      ],
    },
    {
      company: 'Infosys Springboard (Virtual)',
      title: 'Python Intern',
      location: 'Virtual / Remote',
      startDate: 'Feb 2026',
      endDate: 'Mar 2026',
      current: false,
      bulletPoints: [
        'Designed a YouTube Analytics Dashboard with Python/Pandas to automate reporting and analyze 1,000+ YouTube records.',
      ],
    },
  ],
  projects: [
    {
      name: 'Fake News Detection System',
      role: 'Lead Developer',
      techStack: ['Python', 'NLP', 'Scikit-learn', 'Flask', 'React'],
      description:
        'Built a fake news detection system to classify news articles as real or fake, improving misinformation detection with 90% classification accuracy.',
      highlights: [
        'Improved misinformation detection with 90% classification accuracy.',
        'Engineered full-stack pipeline linking React frontend with Flask/Scikit-learn NLP backend.',
      ],
      liveUrl: 'https://github.com/Jayasri7-ux',
      repoUrl: 'https://github.com/Jayasri7-ux',
    },
    {
      name: 'AI Health Chatbot',
      role: 'Lead Developer',
      techStack: ['Python', 'Django', 'NLP'],
      description:
        'Created an AI-powered health chatbot to provide instant symptom-based health guidance and assist users with basic healthcare information.',
      highlights: [
        'Designed natural language symptom-based healthcare query engine.',
        'Engineered Django backend for rapid medical advisory responses.',
      ],
      liveUrl: 'https://github.com/Jayasri7-ux',
      repoUrl: 'https://github.com/Jayasri7-ux',
    },
  ],
  education: [
    {
      institution: 'SVCET',
      degree: 'B.Tech',
      fieldOfStudy: 'Information Technology',
      graduationYear: '2022-2026',
      honors: 'CGPA: 8.77',
    },
    {
      institution: 'Sri Chaitanya',
      degree: 'Intermediate',
      fieldOfStudy: 'MPC',
      graduationYear: '2020-2022',
      honors: 'Percentage: 89%',
    },
    {
      institution: 'SRKEM School',
      degree: 'SSC (10th)',
      fieldOfStudy: 'General Studies',
      graduationYear: '2019-2020',
      honors: 'Percentage: 100%',
    },
  ],
  awards: [
    'Smart India Hackathon Grand Finalist (2023 & 2024)',
    'District-level youth parliament speaker',
  ],
  certifications: [
    {
      name: 'Python Full stack development',
      issuer: 'Supported by Infosys Foundation',
      issueDate: '2025',
      credentialUrl: '',
    },
    {
      name: 'MongoDB',
      issuer: 'L&T EduTech',
      issueDate: '2025',
      credentialUrl: '',
    },
  ],
  metadata: {
    lastUpdated: '2026-10-17T20:30:00Z',
    source: 'Master_Resume.docx',
    version: '2.0',
    verified: true,
  },
};

export const defaultMasterProfile = normalizeMasterProfile(rawMasterResumeProfile);

export default defaultMasterProfile;
