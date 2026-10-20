/**
 * Intelligent Technical Requirement Extraction & Normalization Engine
 *
 * Features:
 * 1. Global Dictionary Normalization: Maps typos, abbreviations, and synonyms to canonical names.
 * 2. Anti-Fluff Negative Constraint Filter: Eliminates corporate buzzwords and filler phrases.
 * 3. Rigid Bucketing: Categorizes tech into 7 strict buckets:
 *    - Languages, Frameworks, Databases, Cloud/DevOps, Tools, Core Domains, Soft Skills.
 * 4. Human-in-the-Loop Missing Tech Analyzer:
 *    - Compares extracted JD tech against candidate Master Profile (profile.md).
 *    - Identifies missing tools and generates crisp 1-line definitions (<= 120 characters).
 * 5. Deterministic Engine + Ollama AI Enrichment.
 */

import { OLLAMA_BASE_URL, DEFAULT_MODEL, safeParseJson } from './ollamaService.js';

// ======================================================================
// 1. GLOBAL DICTIONARY & SYNONYM / TYPO NORMALIZATION MAP
// ======================================================================

export const GLOBAL_TECH_DICTIONARY = {
  // Databases
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  pgsql: 'PostgreSQL',
  'postgre sql': 'PostgreSQL',
  postgre: 'PostgreSQL',
  mongo: 'MongoDB',
  mongodb: 'MongoDB',
  mysql: 'MySQL',
  'my-sql': 'MySQL',
  sqlite: 'SQLite',
  sqlite3: 'SQLite',
  redis: 'Redis',
  'key-value store': 'Redis',
  dynamodb: 'DynamoDB',
  'dynamo db': 'DynamoDB',
  cassandra: 'Cassandra',
  oracle: 'Oracle Database',
  'oracle db': 'Oracle Database',
  sql: 'SQL',
  rdbms: 'SQL',
  'relational database': 'SQL',
  nosql: 'NoSQL',
  'document database': 'NoSQL',
  mariadb: 'MariaDB',
  elasticsearch: 'Elasticsearch',

  // Languages
  python: 'Python',
  python3: 'Python',
  py: 'Python',
  javascript: 'JavaScript',
  js: 'JavaScript',
  ecmascript: 'JavaScript',
  es6: 'JavaScript',
  'es6+': 'JavaScript',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  java: 'Java',
  c: 'C',
  'c language': 'C',
  'c++': 'C++',
  cpp: 'C++',
  'c#': 'C#',
  csharp: 'C#',
  golang: 'Go',
  go: 'Go',
  rust: 'Rust',
  ruby: 'Ruby',
  php: 'PHP',
  kotlin: 'Kotlin',
  swift: 'Swift',
  html: 'HTML5',
  html5: 'HTML5',
  css: 'CSS3',
  css3: 'CSS3',

  // Frameworks & Libraries
  react: 'React',
  reactjs: 'React',
  'react.js': 'React',
  node: 'Node.js',
  nodejs: 'Node.js',
  'node.js': 'Node.js',
  django: 'Django',
  drf: 'Django REST Framework',
  'django rest framework': 'Django REST Framework',
  flask: 'Flask',
  fastapi: 'FastAPI',
  'fast api': 'FastAPI',
  express: 'Express.js',
  expressjs: 'Express.js',
  'express.js': 'Express.js',
  next: 'Next.js',
  nextjs: 'Next.js',
  'next.js': 'Next.js',
  vue: 'Vue.js',
  vuejs: 'Vue.js',
  'vue.js': 'Vue.js',
  angular: 'Angular',
  angularjs: 'Angular',
  spring: 'Spring Boot',
  'spring boot': 'Spring Boot',
  springboot: 'Spring Boot',
  tailwind: 'Tailwind CSS',
  tailwindcss: 'Tailwind CSS',
  'tailwind css': 'Tailwind CSS',
  bootstrap: 'Bootstrap',
  pandas: 'Pandas',
  numpy: 'NumPy',
  'scikit-learn': 'Scikit-learn',
  sklearn: 'Scikit-learn',
  scikit: 'Scikit-learn',
  pytorch: 'PyTorch',
  torch: 'PyTorch',
  tensorflow: 'TensorFlow',
  tf: 'TensorFlow',

  // Cloud & DevOps
  git: 'Git/GitHub',
  github: 'Git/GitHub',
  gitlab: 'Git/GitHub',
  'version control': 'Git/GitHub',
  vcs: 'Git/GitHub',
  'git/github': 'Git/GitHub',
  docker: 'Docker',
  containerization: 'Docker',
  containers: 'Docker',
  kubernetes: 'Kubernetes',
  k8s: 'Kubernetes',
  aws: 'AWS',
  'amazon web services': 'AWS',
  gcp: 'GCP',
  'google cloud': 'GCP',
  'google cloud platform': 'GCP',
  azure: 'Azure',
  'microsoft azure': 'Azure',
  'ci/cd': 'CI/CD',
  cicd: 'CI/CD',
  'continuous integration': 'CI/CD',
  'continuous deployment': 'CI/CD',
  linux: 'Linux',
  unix: 'Linux',
  ubuntu: 'Linux',
  render: 'Render',
  vercel: 'Vercel',
  terraform: 'Terraform',
  ansible: 'Ansible',
  jenkins: 'Jenkins',
  nginx: 'NGINX',

  // Tools
  vscode: 'VS Code',
  'vs code': 'VS Code',
  'visual studio code': 'VS Code',
  postman: 'Postman',
  'api client': 'Postman',
  jira: 'Jira',
  confluence: 'Confluence',
  figma: 'Figma',
  swagger: 'Swagger/OpenAPI',
  openapi: 'Swagger/OpenAPI',

  // Core Domains
  'full stack': 'Full Stack Development',
  'full-stack': 'Full Stack Development',
  fullstack: 'Full Stack Development',
  'frontend engineering': 'Frontend Engineering',
  'backend engineering': 'Backend Engineering',
  rest: 'REST APIs',
  restful: 'REST APIs',
  'rest api': 'REST APIs',
  'rest apis': 'REST APIs',
  'restful apis': 'REST APIs',
  microservices: 'Microservices',
  'micro-services': 'Microservices',
  jwt: 'JWT Authentication',
  'json web token': 'JWT Authentication',
  'jwt authentication': 'JWT Authentication',
  'data analytics': 'Data Analytics',
  analytics: 'Data Analytics',
  nlp: 'NLP',
  'natural language processing': 'NLP',
  'machine learning': 'Machine Learning',
  ml: 'Machine Learning',
  oop: 'Object-Oriented Programming (OOP)',
  'object-oriented': 'Object-Oriented Programming (OOP)',
  'data structures': 'Data Structures & Algorithms',
  dsa: 'Data Structures & Algorithms',

  // Soft Skills (Curated and Concrete)
  agile: 'Agile/Scrum',
  scrum: 'Agile/Scrum',
  'agile/scrum': 'Agile/Scrum',
  'code review': 'Code Reviews',
  'code reviews': 'Code Reviews',
  'cross-functional collaboration': 'Cross-Functional Collaboration',
  'cross functional': 'Cross-Functional Collaboration',
  'technical documentation': 'Technical Documentation',
  'unit testing': 'Unit Testing',
  'automated testing': 'Automated Testing',
};

// ======================================================================
// 2. ANTI-FLUFF NEGATIVE CONSTRAINT FILTER
// Corporate buzzwords, filler phrases, and recruiter boilerplate to eliminate.
// ======================================================================

export const ANTI_FLUFF_BLACKLIST = new Set([
  'fast-paced',
  'fast paced',
  'fast-paced environment',
  'dynamic',
  'dynamic environment',
  'dynamic team',
  'team player',
  'strong team player',
  'collaborative team player',
  'self-starter',
  'self starter',
  'go-getter',
  'proactive',
  'rockstar',
  'ninja',
  'guru',
  'wizard',
  'think outside the box',
  'outside the box',
  'detail-oriented',
  'detail oriented',
  'results-driven',
  'results-oriented',
  'results oriented',
  'passionate',
  'highly motivated',
  'motivated',
  'eager to learn',
  'hard worker',
  'quick learner',
  'fast learner',
  'synergy',
  'hit the ground running',
  'wear many hats',
  'deep dive',
  'bandwidth',
  'circle back',
  'touch base',
  'competitive salary',
  'equal opportunity employer',
  'growth mindset',
  'proven track record',
  'years of experience',
  'good communication',
  'excellent communication',
  'strong communication',
  'people skills',
  'positive attitude',
  'can-do attitude',
  'enthusiastic',
  'great perks',
  'fast-growing',
  'cutting-edge',
  'bleeding-edge',
  'world-class',
  'best-in-class',
  'mission-driven',
  'work ethic',
  'multitasker',
  'multitasking',
  'team spirit',
  'high energy',
  'game changer',
]);

// ======================================================================
// 3. RIGID BUCKET CATEGORIES
// ======================================================================

export const TECH_BUCKETS = {
  Languages: [
    'Python', 'Java', 'JavaScript', 'TypeScript', 'C', 'C++', 'C#',
    'Go', 'Rust', 'Ruby', 'PHP', 'Kotlin', 'Swift', 'HTML5', 'CSS3', 'SQL'
  ],
  Frameworks: [
    'React', 'Node.js', 'Django', 'Django REST Framework', 'Flask', 'FastAPI',
    'Express.js', 'Next.js', 'Vue.js', 'Angular', 'Spring Boot', 'Tailwind CSS',
    'Bootstrap', 'Pandas', 'NumPy', 'Scikit-learn', 'PyTorch', 'TensorFlow'
  ],
  Databases: [
    'PostgreSQL', 'MongoDB', 'MySQL', 'SQLite', 'Redis', 'DynamoDB',
    'Cassandra', 'Oracle Database', 'MariaDB', 'Elasticsearch', 'NoSQL'
  ],
  'Cloud/DevOps': [
    'Git/GitHub', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure',
    'CI/CD', 'Linux', 'Render', 'Vercel', 'Terraform', 'Ansible', 'Jenkins', 'NGINX'
  ],
  Tools: [
    'VS Code', 'Postman', 'Jira', 'Confluence', 'Figma', 'Swagger/OpenAPI'
  ],
  'Core Domains': [
    'Full Stack Development', 'Frontend Engineering', 'Backend Engineering',
    'REST APIs', 'Microservices', 'JWT Authentication', 'Data Analytics',
    'NLP', 'Machine Learning', 'Object-Oriented Programming (OOP)',
    'Data Structures & Algorithms'
  ],
  'Soft Skills': [
    'Agile/Scrum', 'Code Reviews', 'Cross-Functional Collaboration',
    'Technical Documentation', 'Unit Testing', 'Automated Testing'
  ],
};

// ======================================================================
// 4. PRECISE 1-LINE DEFINITIONS (MAXIMUM 120 CHARACTERS)
// ======================================================================

export const CRISP_1LINE_DEFINITIONS = {
  PostgreSQL: 'Powerful open-source object-relational database known for reliability, robust data integrity, and SQL compliance.',
  Docker: 'Container platform to build, package, and run lightweight software applications in isolated environments.',
  Kubernetes: 'Container orchestration engine that automates deployment, scaling, and containerized workload management.',
  AWS: 'Comprehensive cloud platform providing scalable on-demand compute, storage, networking, and API services.',
  Redis: 'In-memory key-value data structure store utilized for high-throughput caching and message brokering.',
  TypeScript: 'Strongly-typed superset of JavaScript that compiles to clean JS, enabling robust static type checking.',
  'Tailwind CSS': 'Utility-first CSS framework for rapidly building modern, responsive interfaces directly in markup.',
  'CI/CD': 'Automated pipeline practices for continuous code integration, automated testing, and rapid deployment.',
  'Apache Kafka': 'Distributed event-streaming platform designed for high-throughput, fault-tolerant real-time data pipelines.',
  FastAPI: 'High-performance Python framework for building and serving asynchronous, production-ready RESTful APIs.',
  'Next.js': 'React framework delivering server-side rendering, static site generation, and optimized web performance.',
  'Express.js': 'Minimalist Node.js web application framework providing essential HTTP routing utilities and middleware.',
  'Vue.js': 'Progressive JavaScript framework for engineering responsive user interfaces and single-page applications.',
  Angular: 'TypeScript-based framework designed for engineering enterprise-grade, scalable single-page web applications.',
  'Spring Boot': 'Java framework designed to accelerate production-ready, stand-alone microservices and enterprise backends.',
  MySQL: 'Widely adopted relational database management system delivering rapid read queries and ACID transactions.',
  SQLite: 'Self-contained, serverless zero-configuration SQL database engine embedded directly into local applications.',
  Postman: 'Collaborative API platform used for constructing, testing, documenting, and debugging RESTful web endpoints.',
  Jira: 'Agile issue and project tracking software used by engineering squads to plan sprints and monitor delivery.',
  Linux: 'Open-source Unix-like operating system powering servers, developer workstations, and cloud infrastructure.',
  Terraform: 'Infrastructure as Code (IaC) tool for provisioning and managing multi-cloud resources with code templates.',
  Ansible: 'Agentless IT automation tool used for server configuration management and multi-node software deployment.',
  Jenkins: 'Open-source automation server enabling developers to reliably build, test, and deploy software via pipelines.',
  GCP: 'Google Cloud Platform providing modular cloud services, scalable compute engines, and data analytics.',
  Azure: 'Microsoft cloud computing platform offering scalable compute, virtual machines, and enterprise services.',
  'Swagger/OpenAPI': 'Standardized specification framework for describing, producing, and testing RESTful web APIs.',
  Figma: 'Cloud-based collaborative vector interface design tool used to prototype and inspect web UI layouts.',
  PyTorch: 'Open-source deep learning framework providing tensor computation with GPU acceleration and neural networks.',
  TensorFlow: 'Google open-source machine learning platform for training and deploying numerical computation models.',
  Elasticsearch: 'Distributed JSON-based search engine designed for real-time full-text search and operational log analytics.',
  GraphQL: 'Declarative API query language enabling client applications to fetch exactly the structured data required.',
  MongoDB: 'Popular document-oriented NoSQL database utilizing JSON-like documents with dynamic, flexible schemas.',
  Bootstrap: 'Front-end toolkit featuring responsive CSS grid components for rapid cross-device web development.',
  Microservices: 'Architectural pattern arranging applications as loosely coupled, independently deployable services.',
  'REST APIs': 'Architectural style using standard HTTP verbs to create scalable, stateless distributed web services.',
  'JWT Authentication': 'Compact URL-safe standard for securely transmitting verified claims between parties as JSON objects.',
  'Agile/Scrum': 'Iterative project management methodology focusing on sprint deliverables and continuous feedback.',
  'Unit Testing': 'Automated testing practice verifying that individual source code components function as expected.',
};

/**
 * Returns a crisp, precise 1-line definition strictly <= 120 characters.
 *
 * @param {string} techName
 * @returns {string} Definition guaranteed <= 120 characters
 */
export function getCrispDefinition(techName) {
  if (CRISP_1LINE_DEFINITIONS[techName]) {
    const def = CRISP_1LINE_DEFINITIONS[techName];
    return def.length <= 120 ? def : def.slice(0, 117) + '...';
  }

  // Dynamic fallback bounded to 120 chars
  const fallback = `Modern ${techName} technology utilized in enterprise software development and engineering workflows.`;
  return fallback.length <= 120 ? fallback : fallback.slice(0, 117) + '...';
}

// ======================================================================
// 5. DETERMINISTIC EXTRACTION & FILTERING FUNCTION
// ======================================================================

/**
 * Checks if a candidate term is in the anti-fluff blacklist.
 * @param {string} term
 * @returns {boolean}
 */
export function isAntiFluff(term) {
  if (!term || typeof term !== 'string') return true;
  const normalized = term.toLowerCase().trim();
  return ANTI_FLUFF_BLACKLIST.has(normalized);
}

/**
 * Normalizes a raw skill string using the Global Dictionary.
 * Returns null if it matches the Anti-Fluff blacklist.
 *
 * @param {string} rawTerm
 * @returns {string | null} Standardized tech name, or null if fluff
 */
export function normalizeTechTerm(rawTerm) {
  if (!rawTerm || typeof rawTerm !== 'string') return null;

  const trimmed = rawTerm.trim();
  const lower = trimmed.toLowerCase();

  // 1. Anti-Fluff Filter
  if (isAntiFluff(lower)) {
    return null;
  }

  // 2. Global Dictionary exact/alias lookup
  if (GLOBAL_TECH_DICTIONARY[lower]) {
    return GLOBAL_TECH_DICTIONARY[lower];
  }

  // 3. Remove punctuation and re-check
  const stripped = lower.replace(/[^a-z0-9+#/.-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (GLOBAL_TECH_DICTIONARY[stripped]) {
    return GLOBAL_TECH_DICTIONARY[stripped];
  }

  return null;
}

/**
 * Maps a standardized tech name into one of the 7 rigid buckets.
 *
 * @param {string} techName
 * @returns {string} Bucket name
 */
export function assignTechBucket(techName) {
  for (const [bucket, members] of Object.entries(TECH_BUCKETS)) {
    if (members.includes(techName)) {
      return bucket;
    }
  }
  return 'Tools'; // Default fallback bucket
}

/**
 * Deterministically extracts, normalizes, and filters technical requirements from JD text.
 * Enforces Global Dictionary normalization and Anti-Fluff elimination.
 *
 * @param {string} jdText - Sanitized job description text
 * @returns {Object} Categorized extracted tech items
 */
export function extractTechnicalRequirements(jdText) {
  if (!jdText || typeof jdText !== 'string') {
    return {
      Languages: [],
      Frameworks: [],
      Databases: [],
      'Cloud/DevOps': [],
      Tools: [],
      'Core Domains': [],
      'Soft Skills': [],
      allExtracted: [],
    };
  }

  const textLower = jdText.toLowerCase();
  const detectedTech = new Set();
  const discardedFluff = new Set();

  // 1. Scan for dictionary entries
  // Sort dictionary keys by descending length so multi-word keys match first
  const sortedDictKeys = Object.keys(GLOBAL_TECH_DICTIONARY).sort((a, b) => b.length - a.length);

  for (const key of sortedDictKeys) {
    // Regex boundary matching: word boundaries or specific technical symbols (+, #, /)
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?:^|[\\s,;:.()/\\[\\]-])${escapedKey}(?:[\\s,;:.()/\\[\\]-]|$|s\\b)`, 'i');

    if (pattern.test(textLower)) {
      const canonical = GLOBAL_TECH_DICTIONARY[key];
      detectedTech.add(canonical);
    }
  }

  // 2. Scan for anti-fluff occurrences to track what was blocked
  for (const fluff of ANTI_FLUFF_BLACKLIST) {
    if (textLower.includes(fluff)) {
      discardedFluff.add(fluff);
    }
  }

  // 3. Populate Rigid Buckets
  const categorized = {
    Languages: [],
    Frameworks: [],
    Databases: [],
    'Cloud/DevOps': [],
    Tools: [],
    'Core Domains': [],
    'Soft Skills': [],
  };

  const allExtracted = Array.from(detectedTech).sort();

  for (const tech of allExtracted) {
    const bucket = assignTechBucket(tech);
    if (categorized[bucket]) {
      categorized[bucket].push(tech);
    }
  }

  return {
    ...categorized,
    allExtracted,
    discardedFluffCount: discardedFluff.size,
    discardedFluffList: Array.from(discardedFluff),
  };
}

// ======================================================================
// 6. HUMAN-IN-THE-LOOP MISSING TECH ANALYZER
// ======================================================================

/**
 * Extracts a flat Set of canonical skills from the candidate's Master Profile.
 *
 * @param {Object} masterProfile - Ground-truth profile
 * @returns {Set<string>} Set of normalized candidate skills
 */
export function extractMasterProfileSkills(masterProfile) {
  const profileSkills = new Set();

  if (!masterProfile) return profileSkills;

  const rawSkills = masterProfile.coreTechnicalSkills || {};

  // Loop through skill categories
  Object.values(rawSkills).forEach((categoryList) => {
    if (Array.isArray(categoryList)) {
      categoryList.forEach((skill) => {
        const canonical = normalizeTechTerm(skill) || skill;
        profileSkills.add(canonical.toLowerCase());
      });
    }
  });

  // Also include skills mentioned in projects techStack
  const projects = masterProfile.projects || [];
  projects.forEach((proj) => {
    if (Array.isArray(proj.techStack)) {
      proj.techStack.forEach((skill) => {
        const canonical = normalizeTechTerm(skill) || skill;
        profileSkills.add(canonical.toLowerCase());
      });
    }
  });

  // Include skills from experiences
  const experiences = masterProfile.workExperience || [];
  experiences.forEach((exp) => {
    const bullets = (exp.bulletPoints || []).join(' ').toLowerCase();
    if (bullets.includes('jwt')) profileSkills.add('jwt authentication');
    if (bullets.includes('react')) profileSkills.add('react');
    if (bullets.includes('django')) profileSkills.add('django');
    if (bullets.includes('pandas')) profileSkills.add('pandas');
    if (bullets.includes('api') || bullets.includes('apis')) profileSkills.add('rest apis');
  });

  // Include domains and roles from eligibleJobRoles & headline
  const targetFamilies = masterProfile.eligibleJobRoles?.targetFamilies || [];
  targetFamilies.forEach((f) => {
    const fLower = f.toLowerCase();
    profileSkills.add(fLower);
    if (fLower.includes('full stack')) profileSkills.add('full stack development');
    if (fLower.includes('frontend')) profileSkills.add('frontend engineering');
    if (fLower.includes('backend')) {
      profileSkills.add('backend engineering');
      profileSkills.add('rest apis');
    }
  });

  const primaryRoles = masterProfile.eligibleJobRoles?.primaryRoles || [];
  primaryRoles.forEach((r) => {
    const rLower = r.toLowerCase();
    profileSkills.add(rLower);
    if (rLower.includes('full stack')) profileSkills.add('full stack development');
    if (rLower.includes('frontend')) profileSkills.add('frontend engineering');
    if (rLower.includes('backend')) {
      profileSkills.add('backend engineering');
      profileSkills.add('rest apis');
    }
  });

  if (masterProfile.personalInfo?.headline?.toLowerCase().includes('full stack')) {
    profileSkills.add('full stack development');
  }

  return profileSkills;
}

/**
 * Analyzes extracted JD requirements against candidate Master Profile:
 * - Identifies matched skills
 * - Flags missing tech tools/frameworks
 * - Generates crisp 1-line definitions (<= 120 characters)
 *
 * @param {Object} params
 * @param {Object} params.extractedTech - Output from extractTechnicalRequirements
 * @param {Object} params.masterProfile - Candidate Master Profile
 * @returns {{
 *   matchedTech: Array<{ name: string, category: string }>,
 *   missingTech: Array<{ id: string, name: string, category: string, definition: string, approved: boolean }>,
 *   coveragePercentage: number,
 *   totalExtractedCount: number
 * }}
 */
export function analyzeMissingTech({ extractedTech, masterProfile }) {
  const candidateSkills = extractMasterProfileSkills(masterProfile);
  const matchedTech = [];
  const missingTech = [];

  const allItems = extractedTech?.allExtracted || [];

  for (const techName of allItems) {
    const lower = techName.toLowerCase();
    const category = assignTechBucket(techName);

    // Skip soft skills from the technical "missing tools" checklist
    if (category === 'Soft Skills') {
      continue;
    }

    // Check direct or synonym match
    let isMatched = false;

    if (candidateSkills.has(lower)) {
      isMatched = true;
    } else {
      // Precise synonym dictionary lookup (avoiding naive single-character substring matches)
      const synonymMap = {
        'git/github': ['git', 'github'],
        'html5': ['html'],
        'css3': ['css'],
        'react': ['reactjs', 'react.js'],
        'node.js': ['node', 'nodejs'],
        'django rest framework': ['django'],
        'rest apis': ['rest', 'restful'],
        'object-oriented programming (oop)': ['oop', 'object oriented programming'],
        'jwt authentication': ['jwt', 'json web token'],
      };

      const validSynonyms = synonymMap[lower] || [];
      for (const syn of validSynonyms) {
        if (candidateSkills.has(syn)) {
          isMatched = true;
          break;
        }
      }
    }

    if (isMatched) {
      matchedTech.push({
        name: techName,
        category,
      });
    } else {
      const definition = getCrispDefinition(techName);
      missingTech.push({
        id: techName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        name: techName,
        category,
        definition,
        approved: false, // Default false: human-in-the-loop approval required
      });
    }
  }

  const techItemsCount = matchedTech.length + missingTech.length;
  const coveragePercentage = techItemsCount > 0
    ? Math.round((matchedTech.length / techItemsCount) * 100)
    : 100;

  return {
    matchedTech,
    missingTech,
    coveragePercentage,
    totalExtractedCount: allItems.length,
  };
}

// ======================================================================
// 7. OLLAMA AI EXTRACTION PROMPT BUILDER
// ======================================================================

/**
 * Builds the XML-delimited prompt for local Ollama LLM tech extraction.
 *
 * @param {string} sanitizedJd - Sanitized JD text
 * @returns {string} Prompt string
 */
export function buildTechExtractionPrompt(sanitizedJd) {
  return `You are a specialized technical taxonomy AI.
Analyze the target job description enclosed within <user_jd> below.
Extract and categorize all genuine technical skills, tools, frameworks, databases, and architectural concepts.

<user_jd>
${sanitizedJd}
</user_jd>

CRITICAL FILTERING & NORMALIZATION RULES:
1. GLOBAL DICTIONARY: Standardize typos and synonyms into canonical names (e.g. 'Postgres' -> 'PostgreSQL', 'Version Control' -> 'Git/GitHub', 'ReactJS' -> 'React', 'Node' -> 'Node.js').
2. ANTI-FLUFF NEGATIVE CONSTRAINT: Completely DISCARD corporate buzzwords, non-technical filler phrases, and generic adjectives (e.g., discard 'fast-paced', 'dynamic', 'team player', 'motivated', 'passionate', 'rockstar', 'competitive salary').
3. RIGID BUCKETING: Output items strictly partitioned into these 7 categories:
   - Languages
   - Frameworks
   - Databases
   - Cloud/DevOps
   - Tools
   - Core Domains
   - Soft Skills (Only concrete agile/code review/documentation competencies)

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema. Do NOT use markdown code fences (\`\`\`json). Do NOT add extra conversational commentary.

{
  "Languages": ["Python", "JavaScript"],
  "Frameworks": ["React", "Django"],
  "Databases": ["PostgreSQL", "MongoDB"],
  "Cloud/DevOps": ["Docker", "Git/GitHub", "AWS"],
  "Tools": ["VS Code", "Postman", "Jira"],
  "Core Domains": ["REST APIs", "Full Stack Development"],
  "Soft Skills": ["Agile/Scrum", "Code Reviews"]
}`;
}

/**
 * Complete Tech Extraction Pipeline:
 * 1. Executes deterministic extraction with Global Dictionary & Anti-Fluff filters.
 * 2. Compares against Master Profile to identify missing tech with <= 120 char definitions.
 * 3. Enriches with Ollama AI if online, with seamless deterministic fallback.
 *
 * @param {Object} params
 * @param {string} params.sanitizedJd - Cleaned Job Description text
 * @param {Object} params.masterProfile - Candidate Master Profile
 * @param {string} [params.model=DEFAULT_MODEL] - Ollama model name
 * @param {string} [params.baseUrl=OLLAMA_BASE_URL] - Ollama server endpoint
 * @returns {Promise<Object>} Complete Tech X-Ray data object
 */
export async function runTechExtractionPipeline({
  sanitizedJd,
  masterProfile,
  model = DEFAULT_MODEL,
  baseUrl = OLLAMA_BASE_URL,
}) {
  // 1. High-accuracy deterministic extraction
  const deterministicExtraction = extractTechnicalRequirements(sanitizedJd);

  let finalCategorized = deterministicExtraction;
  let engine = 'Deterministic Global Dictionary';

  // 2. Attempt Ollama AI extraction if reachable
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

    const prompt = buildTechExtractionPrompt(sanitizedJd);
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.1 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const parsed = safeParseJson(data.response);

      if (parsed && typeof parsed === 'object') {
        // Normalize any raw LLM items through our Global Dictionary & Anti-Fluff
        const enrichedBuckets = {
          Languages: new Set(deterministicExtraction.Languages),
          Frameworks: new Set(deterministicExtraction.Frameworks),
          Databases: new Set(deterministicExtraction.Databases),
          'Cloud/DevOps': new Set(deterministicExtraction['Cloud/DevOps']),
          Tools: new Set(deterministicExtraction.Tools),
          'Core Domains': new Set(deterministicExtraction['Core Domains']),
          'Soft Skills': new Set(deterministicExtraction['Soft Skills']),
        };

        Object.entries(parsed).forEach(([, items]) => {
          if (Array.isArray(items)) {
            items.forEach((item) => {
              const normalized = normalizeTechTerm(item);
              if (normalized) {
                const targetBucket = assignTechBucket(normalized);
                if (enrichedBuckets[targetBucket]) {
                  enrichedBuckets[targetBucket].add(normalized);
                }
              }
            });
          }
        });

        // Convert sets back to arrays
        const allEnriched = new Set();
        const mergedCategorized = {};
        Object.entries(enrichedBuckets).forEach(([bucket, set]) => {
          const list = Array.from(set).sort();
          mergedCategorized[bucket] = list;
          list.forEach((item) => allEnriched.add(item));
        });

        finalCategorized = {
          ...mergedCategorized,
          allExtracted: Array.from(allEnriched).sort(),
          discardedFluffCount: deterministicExtraction.discardedFluffCount,
          discardedFluffList: deterministicExtraction.discardedFluffList,
        };
        engine = `Ollama (${model}) + Global Dictionary`;
      }
    }
  } catch {
    // Graceful fallback to deterministic results
    engine = 'Deterministic Global Dictionary Engine';
  }

  // 3. Human-in-the-Loop Missing Tech Analysis
  const missingTechAnalysis = analyzeMissingTech({
    extractedTech: finalCategorized,
    masterProfile,
  });

  return {
    success: true,
    engine,
    categorized: {
      Languages: finalCategorized.Languages || [],
      Frameworks: finalCategorized.Frameworks || [],
      Databases: finalCategorized.Databases || [],
      'Cloud/DevOps': finalCategorized['Cloud/DevOps'] || [],
      Tools: finalCategorized.Tools || [],
      'Core Domains': finalCategorized['Core Domains'] || [],
      'Soft Skills': finalCategorized['Soft Skills'] || [],
    },
    allExtracted: finalCategorized.allExtracted || [],
    matchedTech: missingTechAnalysis.matchedTech,
    missingTech: missingTechAnalysis.missingTech,
    coveragePercentage: missingTechAnalysis.coveragePercentage,
    discardedFluffCount: finalCategorized.discardedFluffCount,
    discardedFluffList: finalCategorized.discardedFluffList,
  };
}

export default {
  GLOBAL_TECH_DICTIONARY,
  ANTI_FLUFF_BLACKLIST,
  TECH_BUCKETS,
  CRISP_1LINE_DEFINITIONS,
  getCrispDefinition,
  isAntiFluff,
  normalizeTechTerm,
  assignTechBucket,
  extractTechnicalRequirements,
  extractMasterProfileSkills,
  analyzeMissingTech,
  buildTechExtractionPrompt,
  runTechExtractionPipeline,
};
