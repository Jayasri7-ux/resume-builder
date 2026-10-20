import { buildTailoredDocxDocument } from '../src/services/docxExportService.js';
import { Packer } from 'docx';

const profile = {
  personalInfo: {
    fullName: 'jaya sri palli',
    email: 'jayasripalli20@gmail.com',
    phone: '+91- 7893414784',
    location: 'Bangalore, India',
    linkedin: 'linkedin.com/in/jayasripalli',
    github: 'github.com/Jayasri7-ux',
  },
  professionalSummary: 'Aspiring graduate with internship experience in software development.',
  education: [
    { degree: 'B.Tech', fieldOfStudy: 'IT', graduationYear: '2022-2026', institution: 'SVCET', honors: '8.77' }
  ],
  coreTechnicalSkills: {
    languages: ['Python', 'Java', 'JavaScript', 'C'],
    frontend: ['HTML', 'CSS', 'React'],
    backend: ['Node.js', 'Django', 'Flask'],
    databases: ['SQL', 'MongoDB'],
    cloudAndDevOps: ['Git', 'GitHub', 'VS Code', 'Render']
  },
  workExperience: [
    {
      company: 'Larsen & Toubro (L&T), Chennai',
      title: 'Full Stack Developer Intern',
      period: 'Jul 2025 - Dec 2025',
      bulletPoints: ['Developed a web-based audit application using React and Django with JWT authentication to securely manage audit records.']
    }
  ],
  projects: [
    {
      name: 'Fake News Detection System',
      techStack: ['Python', 'NLP', 'Scikit-learn', 'Flask', 'React'],
      description: '90% classification accuracy.'
    }
  ]
};

const tailoredResult = {
  tailoredSummary: 'Aspiring graduate with tailored experience.',
  highlightedExperiences: profile.workExperience,
  highlightedProjects: profile.projects,
  approvedMissingTech: ['AWS']
};

const doc = buildTailoredDocxDocument({ profile, tailoredResult });
const buffer = await Packer.toBuffer(doc);
console.log('Generated tailored buffer size:', buffer.length);
