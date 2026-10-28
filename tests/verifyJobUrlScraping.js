/**
 * Verification Test Suite: Job URL Scraping, Blog Layouts, Content Keyword Validation & Bot Protection
 *
 * Verifies:
 * 1. URL syntax validation and recognition (isJobUrl).
 * 2. Unrelated link pre-flight detection (isKnownNonJobUrl).
 * 3. Scraped content validation looking for core keywords ("Role", "Experience", "Skills", "Intern") (isJobDescriptionContent).
 * 4. Error handling & exact user-facing error message (INVALID_JOB_URL_ERROR).
 * 5. HTML decoding, boilerplate stripping, and DOM container isolation (cleanJobHtml).
 * 6. Job blog layouts & aggregator table container isolation (extractJobContainerHtml, <article>, .post-content, table.job-details).
 * 7. Bot-protection challenge & redirect detection (isBotProtectionResponse).
 * 8. End-to-end integration with Gatekeeper and Baseline Scoring pipelines for valid URLs.
 * 9. Frontend & server integration (vite.config.js middleware & TailoredResumeWorkspace.jsx).
 */

import {
  isJobUrl,
  decodeHtmlEntities,
  extractJobMetadata,
  cleanJobHtml,
  scrapeJobUrl,
  isKnownNonJobUrl,
  isJobDescriptionContent,
  isBotProtectionResponse,
  extractJobContainerHtml,
  INVALID_JOB_URL_ERROR,
} from '../src/services/jobUrlScraperService.js';
import {
  evaluateJobDescriptionPipeline,
  evaluateExperienceLevel,
  calculateBaselineScore,
} from '../src/services/gatekeeperService.js';
import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log('\n--- 1. Testing URL Syntax & Recognition (isJobUrl) ---');

assert(isJobUrl('https://boards.greenhouse.io/stripe/jobs/12345'), 'Valid HTTPS URL recognized');
assert(isJobUrl('http://jobs.lever.co/company/abc-123'), 'Valid HTTP URL recognized');
assert(isJobUrl('https://www.linkedin.com/jobs/view/987654321/?refId=foo&trackingId=bar'), 'URL with query params recognized');
assert(isJobUrl('https://careers.google.com/jobs/results/12345#overview'), 'URL with hash fragment recognized');

assert(!isJobUrl(''), 'Empty string is not a URL');
assert(!isJobUrl(null), 'Null is not a URL');
assert(!isJobUrl('Software Engineer at Acme Corp'), 'Plain text JD title is not a URL');
assert(!isJobUrl('We are looking for a React developer with 1 year experience...'), 'JD paragraph is not a URL');
assert(!isJobUrl('ftp://files.example.com/job.pdf'), 'FTP protocol is rejected');
assert(!isJobUrl('javascript:alert(1)'), 'Javascript protocol is rejected');
assert(!isJobUrl('https://example.com/job\nsecond line'), 'Multiline string is rejected');

console.log('\n--- 2. Testing Unrelated Link Detection (isKnownNonJobUrl) ---');

// Social media links
assert(isKnownNonJobUrl('https://twitter.com/OpenAI'), 'Twitter profile is flagged as non-job URL');
assert(isKnownNonJobUrl('https://x.com/explore'), 'X.com explore is flagged as non-job URL');
assert(isKnownNonJobUrl('https://www.facebook.com'), 'Facebook homepage is flagged as non-job URL');
assert(isKnownNonJobUrl('https://www.instagram.com/explore'), 'Instagram explore is flagged as non-job URL');
assert(isKnownNonJobUrl('https://www.tiktok.com/@developer'), 'TikTok profile is flagged as non-job URL');
assert(isKnownNonJobUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'YouTube video is flagged as non-job URL');
assert(isKnownNonJobUrl('https://www.reddit.com/r/technology'), 'Reddit subreddit is flagged as non-job URL');

// LinkedIn non-job sections (feeds, profiles)
assert(isKnownNonJobUrl('https://www.linkedin.com/feed'), 'LinkedIn feed is flagged as non-job URL');
assert(isKnownNonJobUrl('https://www.linkedin.com/in/alex-smith'), 'LinkedIn user profile is flagged as non-job URL');
assert(isKnownNonJobUrl('https://www.linkedin.com/messaging'), 'LinkedIn messaging is flagged as non-job URL');

// News outlets & Reference wikis
assert(isKnownNonJobUrl('https://www.cnn.com/2026/10/25/world/article.html'), 'CNN news article is flagged as non-job URL');
assert(isKnownNonJobUrl('https://www.bbc.com/news/world-us-canada'), 'BBC news is flagged as non-job URL');
assert(isKnownNonJobUrl('https://www.nytimes.com/section/technology'), 'NYTimes technology section is flagged as non-job URL');
assert(isKnownNonJobUrl('https://en.wikipedia.org/wiki/React_(software)'), 'Wikipedia article is flagged as non-job URL');

// Generic non-career root homepages
assert(isKnownNonJobUrl('https://google.com/'), 'Google search homepage is flagged as non-job URL');
assert(isKnownNonJobUrl('https://example.com/'), 'Generic example.com homepage is flagged as non-job URL');

// Valid job URLs must NOT be flagged as non-job
assert(!isKnownNonJobUrl('https://boards.greenhouse.io/stripe/jobs/12345'), 'Greenhouse job post is recognized as valid');
assert(!isKnownNonJobUrl('https://jobs.lever.co/company/frontend-developer'), 'Lever job post is recognized as valid');
assert(!isKnownNonJobUrl('https://www.linkedin.com/jobs/view/1234567890'), 'LinkedIn job post is recognized as valid');
assert(!isKnownNonJobUrl('https://careers.google.com/jobs/results/123456789'), 'Company careers subdomain is recognized as valid');
assert(!isKnownNonJobUrl('https://indeed.com/viewjob?jk=abcdef123456'), 'Indeed job post is recognized as valid');
assert(!isKnownNonJobUrl('https://techcorp.com/careers/software-engineer'), 'Careers path on company domain is recognized as valid');

console.log('\n--- 3. Testing Scraped Content Keyword Validation (Role, Experience, Skills, Intern) ---');

// Unrelated content samples
const recipeText = `
Chocolate Chip Cookie Recipe
Prep time: 15 mins. Cook time: 10 mins. Servings: 24 cookies.
Ingredients: 2 cups all-purpose flour, 1 cup chocolate chips, 1 cup unsalted butter, 1 cup sugar, 2 eggs.
Preheat oven to 375 degrees F. Mix ingredients thoroughly in a large bowl. Bake until golden brown.
`;
assert(!isJobDescriptionContent(recipeText), 'Recipe content correctly rejected as non-job');

const newsArticleText = `
Breaking News: City Council Approves New Downtown Transit Hub
Associated Press reported from City Hall.
The city council voted 8-1 on Tuesday to fund a new multi-million dollar light rail transit center.
Mayor Jane Smith commended the bipartisan effort, stating the expansion will ease traffic congestion.
Several local business owners attended the public hearing to voice support.
`;
assert(!isJobDescriptionContent(newsArticleText), 'General news article correctly rejected as non-job');

const encyclopedicText = `
React (software) - Wikipedia, the free encyclopedia
React is a free and open-source front-end JavaScript library for building user interfaces based on components.
It is maintained by Meta and a community of individual developers and companies.
React can be used to develop single-page, mobile, or server-rendered applications with frameworks like Next.js.
References and sources: [1] Meta Open Source [2] JavaScript Weekly.
`;
assert(!isJobDescriptionContent(encyclopedicText), 'Encyclopedic wiki article correctly rejected as non-job');

// Valid job description sample with core keywords: Role, Experience, Skills, Intern
const validJdContent = `
- Job Title: Junior Frontend Developer
- Company: WebFlow Inc.
- Location: San Francisco, CA

About the Role:
We are looking for a Junior Frontend Developer to join our core product engineering team.

Responsibilities:
- Build responsive web applications using React, TypeScript, and Tailwind CSS.
- Collaborate with backend engineers to integrate RESTful API endpoints.
- Write maintainable code with Jest unit tests.

Requirements & Qualifications:
- 0 to 2 years of experience with modern JavaScript / TypeScript.
- Familiarity with Git version control and component-based design.
- Bachelor's degree in Computer Science or equivalent practical experience.
- Full-time position with competitive salary and benefits.
`;
assert(isJobDescriptionContent(validJdContent), 'Authentic job description content correctly validated');

// Job blog format with Role, Experience, Skills, Intern keywords
const blogJdContent = `
Infosys is hiring for Software Engineer Intern!
Role: Software Engineer Intern
Experience: 0 - 1 Years / Freshers can apply
Skills: Python, Django, REST APIs, SQL, Git
Location: Bangalore / Hybrid
Eligibility: B.Tech / B.E graduates batch 2024 / 2025
Selection process includes online assessment and technical interview.
`;
assert(isJobDescriptionContent(blogJdContent), 'Job blog layout with Role, Experience, Skills, Intern keywords validated');

console.log('\n--- 4. Testing End-to-End Extraction Error Handling (scrapeJobUrl) ---');

assert(
  INVALID_JOB_URL_ERROR === 'Invalid link: The provided URL does not contain a valid job description.',
  'INVALID_JOB_URL_ERROR matches exact user-specified message'
);

// Test immediate rejection of unrelated URLs via scrapeJobUrl
const twitterResult = await scrapeJobUrl('https://twitter.com/OpenAI');
assert(!twitterResult.success, 'Twitter URL extraction rejected');
assert(twitterResult.error === INVALID_JOB_URL_ERROR, `Twitter URL triggers exact error: "${twitterResult.error}"`);

const cnnResult = await scrapeJobUrl('https://www.cnn.com/2026/10/25/world/article.html');
assert(!cnnResult.success, 'News URL extraction rejected');
assert(cnnResult.error === INVALID_JOB_URL_ERROR, `News URL triggers exact error: "${cnnResult.error}"`);

const wikiResult = await scrapeJobUrl('https://en.wikipedia.org/wiki/React_(software)');
assert(!wikiResult.success, 'Wikipedia URL extraction rejected');
assert(wikiResult.error === INVALID_JOB_URL_ERROR, `Wikipedia URL triggers exact error: "${wikiResult.error}"`);

const linkedinFeedResult = await scrapeJobUrl('https://www.linkedin.com/feed');
assert(!linkedinFeedResult.success, 'LinkedIn feed URL extraction rejected');
assert(linkedinFeedResult.error === INVALID_JOB_URL_ERROR, `LinkedIn feed URL triggers exact error: "${linkedinFeedResult.error}"`);

console.log('\n--- 5. Testing Job Blog Containers & Table Elements (<article>, .post-content, table.job-details) ---');

const jobBlogHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Accenture Hiring Freshers 2026 | TechCareers Blog</title>
</head>
<body>
  <div class="site-header">
    <nav><a href="/">Home</a><a href="/category/it-jobs">IT Jobs</a></nav>
  </div>
  <div class="social-share-buttons">
    <button>Share on Facebook</button>
    <button>Share on LinkedIn</button>
  </div>

  <article class="single-post">
    <div class="post-content">
      <h2>Accenture Recruitment 2026: Associate Software Engineer</h2>
      <p>Accenture is conducting an off-campus recruitment drive for entry-level developers.</p>
      
      <table class="job-details">
        <tr><th>Job Role</th><td>Associate Software Engineer</td></tr>
        <tr><th>Experience</th><td>0 - 2 Years (Freshers Eligible)</td></tr>
        <tr><th>Key Skills</th><td>Java, Python, Cloud Fundamentals, SQL</td></tr>
        <tr><th>Job Type</th><td>Full-time / Permanent</td></tr>
        <tr><th>Location</th><td>Bangalore, Hyderabad, Pune, Chennai</td></tr>
      </table>

      <h3>Key Responsibilities:</h3>
      <ul>
        <li>Design, build, and test scalable software applications and web modules.</li>
        <li>Participate in peer code reviews and agile sprint planning sessions.</li>
        <li>Troubleshoot production defects and implement robust unit test suites.</li>
      </ul>

      <h3>Eligibility & Qualifications:</h3>
      <ul>
        <li>B.E / B.Tech / MCA with no active backlogs.</li>
        <li>Strong fundamentals in Object-Oriented Programming (OOP) and algorithms.</li>
      </ul>

      <div class="share-links">
        <p>Share this job opening with your friends</p>
      </div>
    </div>
  </article>

  <aside class="sidebar-widgets">
    <h4>Recent Posts</h4>
    <ul>
      <li><a href="/tips">10 Resume Mistakes to Avoid</a></li>
      <li><a href="/interviews">Top 50 Java Interview Questions</a></li>
    </ul>
  </aside>

  <footer class="site-footer">
    <p>&copy; 2026 TechCareers. All Rights Reserved. Privacy Policy</p>
  </footer>
</body>
</html>
`;

// Test container extractor directly
const extractedContainer = extractJobContainerHtml(jobBlogHtml);
assert(extractedContainer !== null, 'extractJobContainerHtml successfully isolates container');
assert(extractedContainer.includes('Associate Software Engineer'), 'Container contains job title and role');
assert(extractedContainer.includes('job-details'), 'Container contains job table');
assert(!extractedContainer.includes('Recent Posts'), 'Container excludes outer sidebar');
assert(!extractedContainer.includes('All Rights Reserved'), 'Container excludes outer footer');

// Test cleanJobHtml on job blog layout
const cleanedBlogJd = cleanJobHtml(jobBlogHtml);
assert(cleanedBlogJd.includes('Associate Software Engineer'), 'Job title preserved in cleaned blog text');
assert(cleanedBlogJd.includes('**Job Role:** Associate Software Engineer'), 'Table rows transformed with key-value formatting');
assert(cleanedBlogJd.includes('0 - 2 Years (Freshers Eligible)'), 'Table experience row preserved');
assert(cleanedBlogJd.includes('Java, Python, Cloud Fundamentals, SQL'), 'Table skills row preserved');
assert(cleanedBlogJd.includes('Design, build, and test scalable software applications'), 'Responsibilities list preserved as bullets');
assert(!cleanedBlogJd.includes('Share on Facebook'), 'Floating social buttons stripped');
assert(!cleanedBlogJd.includes('10 Resume Mistakes to Avoid'), 'Sidebar articles stripped');
assert(!cleanedBlogJd.includes('All Rights Reserved'), 'Footer boilerplate stripped');

// Test that cleaned blog text passes keyword validation
assert(isJobDescriptionContent(cleanedBlogJd), 'Cleaned job blog text passes isJobDescriptionContent check');

// Test Indian job blog layout (freshersdunia / freshersworld style with table, "Also Checkout", and WhatsApp invites)
const freshersduniaStyleHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Akamai Off Campus 2026 – Software Engineer | Freshers Eligible | India Remote</title>
  <meta property="og:site_name" content="freshersdunia.in" />
</head>
<body>
  <article class="page-content-single">
    <div class="entry-content">
      <p><strong>Akamai Off Campus 2026</strong> is inviting applications for the role of <strong>Software Engineer</strong> at Akamai in India (Remote).</p>
      <p>📲 Join Our Official WhatsApp Channel</p>
      <p>✈️ Join Our Official Telegram Channel</p>
      <table>
        <tbody>
          <tr><td><strong>Company Name</strong></td><td>Akamai Technologies</td></tr>
          <tr><td><strong>Job Role</strong></td><td>Software Engineer</td></tr>
          <tr><td><strong>Experience Required</strong></td><td>0 to 2 Years (Freshers Eligible)</td></tr>
          <tr><td><strong>Core Technical Skills</strong></td><td>Java, JavaScript, HTML5, CSS3, Data Structures</td></tr>
          <tr><td><strong>Job Location</strong></td><td>India (Remote)</td></tr>
        </tbody>
      </table>
      <h3>Eligibility Criteria & Required Tech Skills</h3>
      <p>Candidates must have strong problem solving skills and proficiency in modern software development.</p>
      <p>📌 Also Checkout: Top Tech & Software Engineering Jobs</p>
    </div>
  </article>
</body>
</html>
`;
const freshersduniaCleaned = cleanJobHtml(freshersduniaStyleHtml);
assert(freshersduniaCleaned.includes('Akamai Technologies'), 'Company name Akamai Technologies extracted from table');
assert(freshersduniaCleaned.includes('Software Engineer'), 'Software Engineer role preserved');
assert(!freshersduniaCleaned.includes('Join Our Official WhatsApp Channel'), 'WhatsApp invite banner stripped');
assert(isJobDescriptionContent(freshersduniaCleaned), 'freshersdunia layout with "Also Checkout" passes isJobDescriptionContent check without false block');

// Test that non-job content inside an <article> is rejected
const nonJobBlogHtml = `
<article>
  <div class="post-content">
    <h2>10 Best Places to Visit in Switzerland</h2>
    <p>Switzerland offers breathtaking alpine scenery, charming mountain villages, and pristine lakes.</p>
    <p>Zermatt is famous for the Matterhorn, while Lucerne features a preserved medieval town.</p>
  </div>
</article>
`;
const cleanedNonJob = cleanJobHtml(nonJobBlogHtml);
assert(!isJobDescriptionContent(cleanedNonJob), 'Travel article inside post-content container correctly rejected');

console.log('\n--- 6. Testing Bot-Protection & Security Challenge Handling ---');

// Test status-based bot protection
assert(isBotProtectionResponse('', 403), 'HTTP 403 flagged as bot protection / forbidden');
assert(isBotProtectionResponse('', 429), 'HTTP 429 flagged as rate-limited / bot challenge');
assert(!isBotProtectionResponse('<html><body><h1>Welcome</h1></body></html>', 200), 'Standard HTTP 200 is not bot challenge');

// Test Cloudflare / Captcha HTML challenges
const cloudflareChallengeHtml = `
<!DOCTYPE html>
<html>
<head><title>Just a moment...</title></head>
<body>
  <div class="cf-chl-bypass">Checking your browser before accessing the website.</div>
  <p>Please enable JavaScript and cookies to continue.</p>
</body>
</html>
`;
assert(isBotProtectionResponse(cloudflareChallengeHtml, 200), 'Cloudflare challenge HTML detected and flagged');

const securityCheckHtml = `
<html>
<head><title>Security Check | Cloudflare</title></head>
<body>
  <p>Verify you are human to proceed.</p>
</body>
</html>
`;
assert(isBotProtectionResponse(securityCheckHtml, 200), 'Security check verification HTML detected and flagged');

console.log('\n--- 7. Testing Gatekeeper Pipeline Preservation on Blog-Scraped JD ---');

const mockMasterProfile = {
  fullName: 'Alex Morgan',
  headline: 'Full Stack Software Engineer',
  education: [
    { degree: 'B.Tech in Computer Science', institution: 'State University', graduationYear: '2025' }
  ],
  skills: {
    languages: ['JavaScript', 'TypeScript', 'Python', 'Java', 'SQL'],
    frameworks: ['React', 'Node.js', 'Express', 'Tailwind CSS'],
    tools: ['Git', 'Docker', 'Jest'],
  },
  experience: [
    {
      title: 'Software Engineer Intern',
      company: 'Tech Innovators',
      bulletPoints: [
        'Built full-stack React and Node.js web applications with RESTful APIs.',
        'Wrote automated Jest unit tests improving code coverage to 92%.'
      ]
    }
  ]
};

// 1. Evaluate Experience Level on cleaned blog JD (0-2 years range)
const blogExpCheck = evaluateExperienceLevel(cleanedBlogJd);
assert(!blogExpCheck.isBlocked, '0-2 years blog JD passes experience level check without block');

// 2. Full Gatekeeper pipeline on cleaned blog JD
const blogGatekeeperResult = await evaluateJobDescriptionPipeline({
  rawJdText: cleanedBlogJd,
  masterProfile: mockMasterProfile,
  model: 'qwen2.5-coder:7b',
});

assert(blogGatekeeperResult.status === 'PROCEED', `Blog Gatekeeper status is PROCEED (actual: ${blogGatekeeperResult.status})`);
assert(blogGatekeeperResult.wordCount >= 20, `Cleaned blog JD word count is sufficient (${blogGatekeeperResult.wordCount} words)`);

// 3. Baseline Score calculation on cleaned blog JD
const blogBaselineScore = calculateBaselineScore({
  cleanedJdText: blogGatekeeperResult.cleanedText || cleanedBlogJd,
  masterProfile: mockMasterProfile,
});

assert(blogBaselineScore && blogBaselineScore.overallScore > 0, `Baseline score computed successfully: ${blogBaselineScore?.overallScore}%`);
assert(blogBaselineScore && blogBaselineScore.breakdown, 'Baseline score contains detailed breakdown');

console.log('\n--- 8. Testing Frontend & Vite Middleware Wiring ---');

// Check vite.config.js for scraper plugin, container handling & bot protection
const viteConfigContent = fs.readFileSync(path.resolve('./vite.config.js'), 'utf-8');
assert(viteConfigContent.includes('/api/scrape-job-url'), 'vite.config.js defines /api/scrape-job-url endpoint');
assert(viteConfigContent.includes('isKnownNonJobUrl'), 'vite.config.js uses isKnownNonJobUrl pre-check');
assert(viteConfigContent.includes('isJobDescriptionContent'), 'vite.config.js uses isJobDescriptionContent post-check');
assert(viteConfigContent.includes('isBotProtectionResponse'), 'vite.config.js uses isBotProtectionResponse check');
assert(viteConfigContent.includes('INVALID_JOB_URL_ERROR'), 'vite.config.js returns INVALID_JOB_URL_ERROR');

// Check TailoredResumeWorkspace.jsx for URL extraction integration & error banner
const workspaceContent = fs.readFileSync(path.resolve('./src/components/TailoredResumeWorkspace.jsx'), 'utf-8');
assert(workspaceContent.includes('handleExtractFromUrl'), 'TailoredResumeWorkspace defines handleExtractFromUrl');
assert(workspaceContent.includes('isKnownNonJobUrl'), 'TailoredResumeWorkspace imports and uses isKnownNonJobUrl');
assert(workspaceContent.includes('INVALID_JOB_URL_ERROR'), 'TailoredResumeWorkspace imports INVALID_JOB_URL_ERROR');
assert(workspaceContent.includes('urlExtractError'), 'TailoredResumeWorkspace tracks urlExtractError state');
assert(workspaceContent.includes('Extract from URL'), 'TailoredResumeWorkspace has "Extract from URL" UI button');
assert(workspaceContent.includes('ShieldAlert'), 'TailoredResumeWorkspace renders prominent ShieldAlert error banner');

console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
