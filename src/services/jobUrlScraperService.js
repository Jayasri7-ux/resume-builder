/**
 * Job URL Scraping and HTML Extraction Service
 *
 * Provides:
 * 1. URL validation and detection (isJobUrl).
 * 2. High-performance HTML cleaning and boilerplate stripping (cleanJobHtml).
 * 3. Structured job metadata extraction (extractJobMetadata).
 * 4. End-to-end URL fetching and extraction with resilient fallbacks (scrapeJobUrl).
 */

/**
 * Checks if a string is a valid HTTP/HTTPS URL.
 *
 * @param {string} text - Input text
 * @returns {boolean} True if string is a single HTTP/HTTPS URL
 */
export function isJobUrl(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  // If text contains multiple lines or is exceedingly long, it's a pasted JD, not a bare URL
  if (trimmed.includes('\n') || trimmed.length > 2000) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Decodes common HTML entities into UTF-8 characters.
 *
 * @param {string} str - Raw HTML string
 * @returns {string} Decoded plain text string
 */
export function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&(?:apos|#39|#039);/gi, "'")
    .replace(/&(?:bull|#8226);/gi, '•')
    .replace(/&(?:ndash|#8211);/gi, '–')
    .replace(/&(?:mdash|#8212);/gi, '—')
    .replace(/&(?:copy|#169);/gi, '©')
    .replace(/&(?:trade|#8482);/gi, '™')
    .replace(/&(?:reg|#174);/gi, '®')
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return '';
      }
    });
}

/**
 * Extracts job title, company name, and location from HTML metadata or semantic headers.
 *
 * @param {string} html - Raw HTML page
 * @returns {{ title: string | null, company: string | null, location: string | null }}
 */
export function extractJobMetadata(html) {
  if (!html || typeof html !== 'string') {
    return { title: null, company: null, location: null };
  }

  let title = null;
  let company = null;
  let location = null;
  let suffixCandidate = null;

  // 1. Meta OpenGraph Title or Twitter Title
  const ogTitleMatch = html.match(/<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                       html.match(/<meta\s+[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i);
  if (ogTitleMatch && ogTitleMatch[1]) {
    title = ogTitleMatch[1].trim();
  }

  // 2. <title> Tag Fallback
  if (!title) {
    const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleTagMatch && titleTagMatch[1]) {
      title = decodeHtmlEntities(titleTagMatch[1].trim());
    }
  }

  // Clean title suffix noise (e.g. "Software Engineer - TechCorp Careers", "Frontend Developer | LinkedIn")
  if (title) {
    const splitMatch = title.match(/^(.*?)\s*[-–—|•]\s*([^-–—|•]+)$/);
    if (splitMatch) {
      const mainPart = splitMatch[1].trim();
      const rawSuffix = splitMatch[2].trim();
      const cleanedSuffix = rawSuffix
        .replace(/\s*(?:careers?|jobs?|lever|greenhouse|workday|linkedin|indeed|glassdoor|ashby|smartrecruiters|jobvite).*$/i, '')
        .trim();
      if (cleanedSuffix) {
        suffixCandidate = cleanedSuffix;
      }
      if (mainPart.length >= 5) {
        title = mainPart;
      }
    }

    title = title
      .replace(/\s*[-–—|•]\s*(?:.*?\s+)?(?:careers?|jobs?|lever|greenhouse|workday|linkedin|indeed|glassdoor|ashby|smartrecruiters|jobvite).*$/i, '')
      .replace(/\s*[-–—|•]\s*[A-Z0-9\s&,.-]+(?:\s+inc\.?|\s+ltd\.?|\s+llc\.?|\s+corp\.?)$/i, '')
      .trim();
  }

  // 3. Meta Company / Site Name
  const ogSiteMatch = html.match(/<meta\s+[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta\s+[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i);
  if (ogSiteMatch && ogSiteMatch[1]) {
    company = ogSiteMatch[1].trim();
  }

  // Check if company is just a blog hosting domain (e.g. freshersdunia.in, careersblog.com)
  const isGenericBlogHost = company && /(?:\.(?:in|com|org|net|io|co)|blog|portal|alerts?|updates?|dunia|world|careers?|naukri)/i.test(company);

  // 4. Extract explicit Company Name from Job Specification Table/Block if company is missing or a generic blog domain
  if (!company || isGenericBlogHost) {
    const tableCompMatch = html.match(/<(?:td|th)[^>]*>\s*(?:<strong[^>]*>)?\s*Company(?:\s+Name)?\s*(?:<\/strong>)?\s*<\/(?:td|th)>\s*<(?:td|th)[^>]*>\s*([^<]+?)\s*<\/(?:td|th)>/i);
    if (tableCompMatch && tableCompMatch[1]) {
      const cleanComp = decodeHtmlEntities(tableCompMatch[1].trim());
      if (cleanComp && cleanComp.length > 1 && cleanComp.length < 80) {
        company = cleanComp;
      }
    }
  }

  // 5. Fallback company from title suffix
  if (!company && suffixCandidate && suffixCandidate.length > 1 && suffixCandidate.length < 80) {
    company = suffixCandidate;
  }

  // 6. Semantic Company Element
  if (!company) {
    const compTagMatch = html.match(/<(?:span|div|a|p)[^>]*class=["'][^"']*\b(?:company|employer|hiring-company|company-name|sub-title)\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|a|p)>/i);
    if (compTagMatch && compTagMatch[1]) {
      const cleanComp = decodeHtmlEntities(compTagMatch[1].replace(/<[^>]+>/g, '').trim());
      if (cleanComp && cleanComp.length < 80) {
        company = cleanComp;
      }
    }
  }

  // Refine Title from Job Role table cell if title was a generic blog SEO title with trailing noise
  const isGenericBlogTitle = title && /(?:–|-|\|)\s*(?:freshers\s+eligible|apply\s+online|registration\s+link|india\s+remote)/i.test(title);
  if (isGenericBlogTitle) {
    const tableRoleMatch = html.match(/<(?:td|th)[^>]*>\s*(?:<strong[^>]*>)?\s*Job\s+Role\s*(?:<\/strong>)?\s*<\/(?:td|th)>\s*<(?:td|th)[^>]*>\s*([^<]+?)\s*<\/(?:td|th)>/i);
    if (tableRoleMatch && tableRoleMatch[1]) {
      const cleanRole = decodeHtmlEntities(tableRoleMatch[1].trim());
      if (cleanRole && cleanRole.length > 2 && cleanRole.length < 80) {
        title = cleanRole;
      }
    }
  }

  // 7. Semantic Location Element
  const locTagMatch = html.match(/<(?:span|div|p)[^>]*class=["'][^"']*\b(?:location|workplace|job-location|city-state)\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|p)>/i);
  if (locTagMatch && locTagMatch[1]) {
    const cleanLoc = decodeHtmlEntities(locTagMatch[1].replace(/<[^>]+>/g, '').trim());
    if (cleanLoc && cleanLoc.length < 80) {
      location = cleanLoc;
    }
  }

  return { title, company, location };
}

/**
 * Boilerplate noise lines commonly found on job listing web pages.
 */
const BOILERPLATE_NOISE_PATTERNS = [
  /^(?:apply\s+(?:now|here|for\s+this\s+job|on\s+company\s+site)|easy\s+apply|quick\s+apply)$/i,
  /^(?:save\s+(?:job|this\s+job)|share\s+(?:job|this\s+job)|report\s+(?:this\s+)?job)$/i,
  /^(?:back\s+to\s+(?:jobs?|search|all\s+jobs?)|view\s+all\s+jobs?|browse\s+more\s+jobs?)$/i,
  /^(?:cookie\s+(?:settings|policy|notice|preferences)|privacy\s+(?:policy|notice)|terms\s+of\s+use)$/i,
  /^(?:all\s+rights\s+reserved|copyright\s+©?|©\s*\d{4})$/i,
  /^(?:sign\s+in|log\s+in|create\s+account|register|join\s+now)$/i,
  /^(?:follow\s+us|connect\s+with\s+us|share\s+on\s+(?:linkedin|facebook|twitter|x))$/i,
  /^(?:similar\s+jobs?|recommended\s+jobs?|other\s+openings?)$/i,
  // Social community channel promo lines (common in Indian job notification blogs)
  /^(?:📲|✈️|👉|📌)?\s*(?:join\s+(?:our\s+)?(?:official\s+)?(?:whatsapp|telegram|discord)\s+(?:channel|group)|animated\s+whatsapp)/i,
  /^(?:toggle|job\s+summery)$/i,
];

/**
 * Targeted container selectors commonly used by ATS platforms, job blogs, and aggregators.
 */
export const JOB_CONTAINER_PATTERNS = [
  // 1. Dedicated Job ATS/Board containers
  /<div\s+[^>]*id=["']jobDescriptionText["'][^>]*>/i, // Indeed
  /<div\s+[^>]*data-automation-id=["']jobPostingDescription["'][^>]*>/i, // Workday
  /<div\s+[^>]*class=["'][^"']*\bshow-more-less-html__markup\b[^"']*["'][^>]*>/i, // LinkedIn
  /<div\s+[^>]*class=["'][^"']*\bsection-page\b[^"']*["'][^>]*>/i, // Lever
  /<div\s+[^>]*id=["']content["'][^>]*class=["'][^"']*\bjob\b[^"']*["'][^>]*>/i, // Greenhouse

  // 2. Job Blog & Aggregator Article/Post Containers (WordPress, Blogger, News themes)
  /<(?:div|section)\s+[^>]*class=["'][^"']*\b(?:post-content|entry-content|article-content|post_content|entry_content|single-post-content|blog-post-content|post-body|entry-body)\b[^"']*["'][^>]*>/i,
  /<(?:div|section)\s+[^>]*id=["'](?:post-content|entry-content|article-content)\b[^"']*["'][^>]*>/i,

  // 3. Job-specific Aggregator Class/ID Containers
  /<(?:div|section)\s+[^>]*class=["'][^"']*\b(?:job-details|job-description|job-overview|job-content|job-posting|posting-description|vacancy-details|job-data|job_description|job_details|details-section|job-info)\b[^"']*["'][^>]*>/i,
  /<(?:div|section)\s+[^>]*id=["'](?:job-description|job-details|job-overview|jobDescription|job-content|jobdetails)\b[^"']*["'][^>]*>/i,

  // 4. Job Overview / Specification Tables
  /<table\b[^>]*class=["'][^"']*\b(?:job-details|job-table|table-job|vacancy-table|job-info|details-table|job-overview)\b[^"']*["'][^>]*>/i,
  /<table\b[^>]*id=["'](?:job-details|job-table|vacancy-table|job-info)\b[^"']*["'][^>]*>/i,

  // 5. Semantic Document Containers
  /<article\b[^>]*>/i,
  /<main\b[^>]*>/i,
];

/**
 * Extracts inner HTML of the first matching targeted container using tag-depth balancing.
 * Prevents premature truncation when nested child divs or sections exist.
 *
 * @param {string} html - HTML string
 * @param {RegExp[]} [patterns=JOB_CONTAINER_PATTERNS] - Container regex patterns
 * @returns {string | null} Isolated container inner HTML or null if not found
 */
export function extractJobContainerHtml(html, patterns = JOB_CONTAINER_PATTERNS) {
  if (!html || typeof html !== 'string') return null;

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (!match) continue;

    const openingTag = match[0];
    const tagNameMatch = openingTag.match(/^<([a-zA-Z0-9]+)/);
    if (!tagNameMatch) continue;

    const tagName = tagNameMatch[1].toLowerCase();
    const startIndex = match.index + openingTag.length;

    // Track tag nesting depth
    let depth = 1;
    const tagRegex = new RegExp(`<(/?)${tagName}\\b[^>]*>`, 'gi');
    tagRegex.lastIndex = startIndex;

    let tagMatch;
    while ((tagMatch = tagRegex.exec(html)) !== null) {
      if (tagMatch[1] === '/') {
        depth--;
        if (depth === 0) {
          const innerHtml = html.slice(startIndex, tagMatch.index).trim();
          // Verify candidate has substantial readable text (minimum 80 chars)
          const textOnly = innerHtml.replace(/<[^>]+>/g, '').trim();
          if (textOnly.length >= 80) {
            return innerHtml;
          }
          break;
        }
      } else if (!tagMatch[0].endsWith('/>')) {
        depth++;
      }
    }
  }

  return null;
}

/**
 * Cleans scraped HTML content to strip away webpage boilerplate, headers, footers,
 * sidebars, navigation links, and isolation tags, returning clean job description text.
 *
 * @param {string} rawHtml - Scraped HTML string
 * @param {Object} [options={}] - Cleaning options
 * @param {boolean} [options.includeMetadata=true] - Prepend extracted Job Title & Company
 * @returns {string} Clean isolated job description text
 */
export function cleanJobHtml(rawHtml, options = {}) {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  const { includeMetadata = true } = options;

  // 1. Extract metadata (Title, Company, Location) before stripping tags
  const { title, company, location } = extractJobMetadata(rawHtml);

  let html = rawHtml;

  // 2. Strip non-content and media tags completely (tag + contents)
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  html = html.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ');
  html = html.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ');
  html = html.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ');
  html = html.replace(/<canvas\b[^<]*(?:(?!<\/canvas>)<[^<]*)*<\/canvas>/gi, ' ');
  html = html.replace(/<!--[\s\S]*?-->/g, ' ');

  // 3. Strip website layout boilerplate containers (nav, header, footer, aside, form, buttons)
  html = html.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ');
  html = html.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ');
  html = html.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ');
  html = html.replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ');
  html = html.replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, ' ');
  html = html.replace(/<button\b[^<]*(?:(?!<\/button>)<[^<]*)*<\/button>/gi, ' ');
  html = html.replace(/<dialog\b[^<]*(?:(?!<\/dialog>)<[^<]*)*<\/dialog>/gi, ' ');

  // 4. Strip specific boilerplate elements by class / id pattern (cookies, banners, shares, ads)
  const boilerplateClassRegex = /<(?:div|section|aside|p|ul|li)\s+[^>]*(?:class|id)=["'][^"']*\b(cookie|consent|gdpr|privacy-banner|share-widget|social-share|similar-job|recommended-job|related-job|ad-container|advertisement|search-bar|site-footer|site-header|nav-menu)\b[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|aside|p|ul|li)>/gi;
  html = html.replace(boilerplateClassRegex, ' ');

  // 5. Target Core Job Containers (ATS, Job Blogs, Aggregators, Article & Table elements)
  const isolatedContainer = extractJobContainerHtml(html);
  if (isolatedContainer) {
    html = isolatedContainer;
    // Strip any internal floating share widgets or promo elements inside the extracted container
    html = html.replace(/<(?:div|section|p|ul|li)\s+[^>]*(?:class|id)=["'][^"']*\b(share|social|tags|author-bio|related|promo)\b[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|p|ul|li)>/gi, ' ');
  }

  // 6. Convert structural tags to markdown-like readable text
  // Headings
  html = html.replace(/<h[1-2][^>]*>([\s\S]*?)<\/h[1-2]>/gi, (_, inner) => `\n\n## ${inner.trim()}\n`);
  html = html.replace(/<h[3-6][^>]*>([\s\S]*?)<\/h[3-6]>/gi, (_, inner) => `\n\n### ${inner.trim()}\n`);

  // Bullet list items
  html = html.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => `\n- ${inner.trim()}`);

  // Paragraphs and block divisions
  html = html.replace(/<p[^>]*>/gi, '\n\n');
  html = html.replace(/<\/p>/gi, '');
  html = html.replace(/<br\s*\/?>/gi, '\n');
  html = html.replace(/<div[^>]*>/gi, '\n');
  html = html.replace(/<\/div>/gi, '');
  html = html.replace(/<(?:section|article|blockquote)[^>]*>/gi, '\n\n');
  html = html.replace(/<\/(?:section|article|blockquote)>/gi, '');

  // Table rows, headers, and data cells (commonly used in job aggregators and blog layouts)
  html = html.replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, (_, inner) => ` **${inner.trim()}:**`);
  html = html.replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, (_, inner) => ` ${inner.trim()} |`);
  html = html.replace(/<\/tr>/gi, '\n');
  html = html.replace(/<tr[^>]*>/gi, '');
  html = html.replace(/<\/?(?:table|tbody|thead|tfoot)[^>]*>/gi, '\n');

  // Strip all remaining HTML tags
  html = html.replace(/<[^>]+>/g, ' ');

  // 7. Decode HTML entities into clean text
  html = decodeHtmlEntities(html);

  // 8. Line-by-line cleanup and boilerplate noise removal
  const lines = html.split('\n');
  const cleanedLines = [];

  for (let rawLine of lines) {
    let line = rawLine.trim().replace(/[ \t]{2,}/g, ' ');
    if (!line) continue;

    // Check if line matches boilerplate noise
    const isNoise = BOILERPLATE_NOISE_PATTERNS.some((p) => p.test(line));
    if (isNoise) continue;

    // Remove standalone non-alphanumeric noise or bullet symbols without words
    if (/^[•\-*|–—\s]+$/.test(line)) continue;

    cleanedLines.push(line);
  }

  let cleanText = cleanedLines.join('\n');

  // Collapse 3+ consecutive newlines to 2
  cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim();

  // 9. Prepend standard job header if title/company were detected and not already at the top
  if (includeMetadata && (title || company)) {
    const hasJobTitleHeader = /^(?:-?\s*job\s+title|role\s+title|position)\s*:/i.test(cleanText);
    if (!hasJobTitleHeader) {
      const headerLines = [];
      if (title) headerLines.push(`- Job Title: ${title}`);
      if (company) headerLines.push(`- Company: ${company}`);
      if (location) headerLines.push(`- Location: ${location}`);
      cleanText = `${headerLines.join('\n')}\n\n${cleanText}`;
    }
  }

  return cleanText;
}

/**
 * Standard error message when a URL is unrelated to a job description.
 */
export const INVALID_JOB_URL_ERROR = 'Invalid link: The provided URL does not contain a valid job description.';

/**
 * Known domains and URL patterns that are clearly NOT job postings
 * (social media feeds, search engines, general news outlets, wikis, video streaming).
 */
const NON_JOB_DOMAINS = [
  // Social media networks
  /(?:^|\.)(?:twitter\.com|x\.com)$/i,
  /(?:^|\.)(?:facebook\.com|fb\.com|instagram\.com|tiktok\.com)$/i,
  /(?:^|\.)(?:youtube\.com|youtu\.be|twitch\.tv|vimeo\.com)$/i,
  /(?:^|\.)(?:reddit\.com|pinterest\.com|tumblr\.com|snapchat\.com)$/i,
  /(?:^|\.)(?:quora\.com)$/i,
  // Reference / Wikis / Search
  /(?:^|\.)(?:wikipedia\.org|wikimedia\.org)$/i,
  /(?:^|\.)(?:google\.com|bing\.com|yahoo\.com|duckduckgo\.com|baidu\.com)$/i,
  // Major News Outlets (unless explicitly career subdomains)
  /(?:^|\.)(?:cnn\.com|bbc\.com|bbc\.co\.uk|nytimes\.com|washingtonpost\.com|theguardian\.com|reuters\.com|bloomberg\.com|forbes\.com|techcrunch\.com|theverge\.com|wired\.com|wsj\.com|usatoday\.com|huffpost\.com|foxnews\.com|cnbc\.com|apnews\.com)$/i,
];

/**
 * Validates whether a URL points to a known non-job domain or non-career section.
 *
 * @param {string} url - Target URL
 * @returns {boolean} True if the URL is definitively not a job posting
 */
export function isKnownNonJobUrl(url) {
  if (!url || typeof url !== 'string') return true;
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    // Check non-job domain patterns
    const isNonJob = NON_JOB_DOMAINS.some((pattern) => pattern.test(host));
    if (isNonJob) {
      // If it's explicitly a career subdomain or path (e.g. careers.google.com or bbc.com/careers), permit it
      if (host.startsWith('careers.') || host.startsWith('jobs.') || /^\/(?:careers?|jobs?)(?:\/|$)/i.test(pathname)) {
        return false;
      }
      return true;
    }

    // LinkedIn: only /jobs/ or /talent/ are job postings; reject feed, profiles, etc.
    if (host.includes('linkedin.com')) {
      if (!/^\/(?:jobs|talent)(?:\/|$)/i.test(pathname)) {
        return true;
      }
    }

    // Generic homepages with empty or "/" path
    if (pathname === '' || pathname === '/') {
      const isJobBoardHost = /(?:greenhouse\.io|lever\.co|indeed\.com|workday\.com|smartrecruiters\.com|ashbyhq\.com|ziprecruiter\.com|dice\.com|monster\.com|handshake\.com|wellfound\.com)$/i.test(host);
      if (!isJobBoardHost) {
        return true;
      }
    }

    return false;
  } catch {
    return true;
  }
}

/**
 * Core Job Description keyword categories evaluated within the primary article/content area.
 * Targets standard job posts, tech blogs, notification portals, and aggregator layouts.
 * Specifically looks for essential keywords ("Role", "Experience", "Skills", "Intern") inside the core article content.
 */
export const CORE_JOB_KEYWORDS = {
  // 1. Role & Title Anchors
  role: /\b(?:role|job\s+role|position|job\s+title|job\s+profile|designation|job\s+description|about\s+the\s+role|role\s+overview|job\s+summary|position\s+summary)\b/i,

  // 2. Experience & Eligibility Anchors
  experience: /\b(?:experience|exp|eligibility|years?(?:\s+of)?\s+experience|\d+\s*[-–to]\s*\d+\s+years?|0\+\s*years?|fresher|freshers|entry-?level|graduates?|batch)\b/i,

  // 3. Skills & Requirements Anchors
  skills: /\b(?:skills?|key\s+skills|technical\s+skills|tech\s+stack|requirements|qualifications|technologies|tools|what\s+you(?:'ll|\s+will)\s+need)\b/i,

  // 4. Candidate / Job Type Anchors (Intern, Developer, Engineer, Full-time, etc.)
  jobType: /\b(?:intern|internship|trainee|fresher|developer|engineer|analyst|associate|programmer|full-?time|part-?time|stipend|salary|compensation|apply\s+(?:now|here|online)?)\b/i,

  // 5. Responsibilities & Duties Anchors
  responsibilities: /\b(?:responsibilities|key\s+responsibilities|core\s+responsibilities|duties|what\s+you(?:'ll|\s+will)\s+do|work\s+on|collaborate)\b/i,
};

/**
 * Non-job content indicators (news, blogs, recipes, wiki encyclopedic articles).
 */
const NON_JOB_CONTENT_SIGNALS = [
  /\b(?:ingredients|prep\s+time|cook\s+time|preheat\s+oven|servings?:\s*\d+)\b/i,
  /\b(?:breaking\s+news|associated\s+press|reuters\s+news|opinion\s+columnist|editorial\s+board)\b/i,
  /\b(?:wikipedia,\s+the\s+free\s+encyclopedia|from\s+wikipedia|references\s+and\s+sources|external\s+links)\b/i,
  /\b(?:add\s+to\s+cart|proceed\s+to\s+checkout|express\s+checkout|in\s+stock|out\s+of\s+stock|free\s+shipping\s+on\s+orders)\b/i,
];

/**
 * Validates whether cleaned text or extracted metadata contains a valid job description.
 * Ensures the check for a valid JD looks for core keywords (Role, Experience, Skills, Intern)
 * inside the extracted core article content area rather than failing on page boilerplate.
 *
 * @param {string} text - Cleaned text from webpage or isolated article container
 * @param {Object} [metadata={}] - Extracted metadata (title, company)
 * @param {string} [url=''] - Source URL
 * @returns {boolean} True if content is a valid job description
 */
export function isJobDescriptionContent(text, metadata = {}, url = '') {
  if (!text || typeof text !== 'string') return false;

  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);

  // Require minimum viable word length
  if (words.length < 20) return false;

  // Check how many core job keyword categories are present in the core content
  const hasRole = CORE_JOB_KEYWORDS.role.test(trimmed);
  const hasExperience = CORE_JOB_KEYWORDS.experience.test(trimmed);
  const hasSkills = CORE_JOB_KEYWORDS.skills.test(trimmed);
  const hasJobType = CORE_JOB_KEYWORDS.jobType.test(trimmed);
  const hasResponsibilities = CORE_JOB_KEYWORDS.responsibilities.test(trimmed);

  const matchedCategories = [hasRole, hasExperience, hasSkills, hasJobType, hasResponsibilities].filter(Boolean).length;

  // Filter out overt non-job content (recipes, encyclopedias, shopping),
  // unless strong job signals exist (>= 3 categories matched in the article)
  const nonJobMatches = NON_JOB_CONTENT_SIGNALS.filter((p) => p.test(trimmed)).length;
  if (nonJobMatches >= 1 && matchedCategories < 3) {
    return false;
  }

  const hasJobTitleInMeta = Boolean(
    metadata?.title &&
    /\b(?:engineer|developer|architect|designer|manager|analyst|intern|specialist|consultant|programmer|scientist|administrator|technician|officer|lead)\b/i.test(metadata.title)
  );

  const isLikelyJobUrl = Boolean(
    url &&
    /(?:greenhouse\.io|lever\.co|workday\.com|smartrecruiters\.com|indeed\.com|ashbyhq\.com|wellfound\.com|\/jobs\/|\/careers\/|\/positions\/)/i.test(url)
  );

  // 1. Matches 2 or more core job categories (e.g. Role + Experience, Skills + Experience, Role + Skills, Intern + Skills)
  if (matchedCategories >= 2) return true;

  // 2. On a known job board / career URL with at least 1 core category
  if (isLikelyJobUrl && matchedCategories >= 1) return true;

  // 3. Recognized job title in metadata AND at least 1 core category (e.g. Skills or Experience)
  if (hasJobTitleInMeta && matchedCategories >= 1) return true;

  return false;
}

/**
 * Detects whether an HTML string or status code represents an anti-bot challenge.
 *
 * @param {string} html - Raw HTML response
 * @param {number} [status=200] - HTTP status code
 * @returns {boolean} True if response is a bot protection challenge
 */
export function isBotProtectionResponse(html, status = 200) {
  if (status === 403 || status === 429) return true;
  if (!html || typeof html !== 'string') return false;
  return (
    html.includes('cf-chl-bypass') ||
    html.includes('challenge-platform') ||
    html.includes('cf_chl_prog') ||
    html.includes('hCaptcha') ||
    /<title[^>]*>\s*(?:just\s+a\s+moment\.\.\.|attention\s+required!|security\s+check)\s*<\/title>/i.test(html) ||
    /\b(?:enable\s+javascript\s+and\s+cookies\s+to\s+continue|verify\s+you\s+are\s+human|checking\s+your\s+browser\s+before\s+accessing)\b/i.test(html)
  );
}

/**
 * Scrapes and extracts a clean Job Description from a given direct URL.
 * Works across server-side Node.js (via Vite proxy/middleware) and client environments.
 *
 * @param {string} url - Target job URL
 * @param {Object} [options={}] - Extraction options
 * @param {number} [options.timeoutMs=15000] - Network timeout
 * @param {string} [options.apiEndpoint='/api/scrape-job-url'] - Local backend scraping endpoint
 * @returns {Promise<{
 *   success: boolean,
 *   text?: string,
 *   title?: string | null,
 *   company?: string | null,
 *   location?: string | null,
 *   url: string,
 *   wordCount?: number,
 *   charCount?: number,
 *   error?: string
 * }>}
 */
export async function scrapeJobUrl(url, options = {}) {
  const {
    timeoutMs = 15000,
    apiEndpoint = '/api/scrape-job-url',
  } = options;

  if (!isJobUrl(url)) {
    return {
      success: false,
      url,
      error: 'Please provide a valid web link starting with http:// or https://',
    };
  }

  // Immediate abort for known non-job URLs (social media, news, blogs, wikis)
  if (isKnownNonJobUrl(url)) {
    return {
      success: false,
      url,
      error: INVALID_JOB_URL_ERROR,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Step 1: Try local backend scraping endpoint (Node.js server with zero CORS restrictions)
  try {
    const apiResponse = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    if (apiResponse.ok) {
      clearTimeout(timeoutId);
      const data = await apiResponse.json();
      if (data.success && data.text) {
        // Validate that extracted content is a genuine Job Description
        const meta = { title: data.title, company: data.company };
        if (!isJobDescriptionContent(data.text, meta, url)) {
          return {
            success: false,
            url,
            error: INVALID_JOB_URL_ERROR,
          };
        }

        const wordCount = data.text.split(/\s+/).filter(Boolean).length;
        return {
          success: true,
          text: data.text,
          title: data.title || null,
          company: data.company || null,
          location: data.location || null,
          url,
          wordCount,
          charCount: data.text.length,
          source: 'backend_api',
        };
      } else if (data.error) {
        return {
          success: false,
          url,
          error: data.error,
        };
      }
    }
  } catch (err) {
    // If backend endpoint is not reached (e.g. static preview or direct test), fall through to direct fetch
    if (err.name === 'AbortError') {
      clearTimeout(timeoutId);
      return {
        success: false,
        url,
        error: 'Job URL extraction timed out after 15 seconds. Please paste the job description text directly.',
      };
    }
  }

  // Step 2: Fallback to direct fetch with custom User-Agent
  try {
    const fetchController = new AbortController();
    const fetchTimeout = setTimeout(() => fetchController.abort(), 10000);

    let rawHtml = '';
    try {
      const directResponse = await fetch(url, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: fetchController.signal,
        redirect: 'follow',
      });

      if (directResponse.status === 403 || directResponse.status === 401) {
        clearTimeout(fetchTimeout);
        clearTimeout(timeoutId);
        return {
          success: false,
          url,
          error: `Access to this job link was blocked by anti-bot verification or login authentication (HTTP ${directResponse.status}). Please copy and paste the job description text directly.`,
        };
      }

      if (directResponse.status === 429) {
        clearTimeout(fetchTimeout);
        clearTimeout(timeoutId);
        return {
          success: false,
          url,
          error: 'Rate limit reached for this site (HTTP 429). Please wait a moment or paste the job description text directly.',
        };
      }

      if (directResponse.url && (
        directResponse.url.includes('/login') ||
        directResponse.url.includes('/signin') ||
        directResponse.url.includes('/auth') ||
        directResponse.url.includes('accounts.google.com')
      )) {
        clearTimeout(fetchTimeout);
        clearTimeout(timeoutId);
        return {
          success: false,
          url,
          error: 'This job link redirected to an authentication login screen. Please copy and paste the job description text directly.',
        };
      }

      if (directResponse.ok) {
        rawHtml = await directResponse.text();
      }
    } catch {
      // Direct fetch may fail due to browser CORS restriction. Try CORS proxy fallback.
      const corsProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const proxyResponse = await fetch(corsProxyUrl, {
        signal: fetchController.signal,
      });
      if (proxyResponse.ok) {
        rawHtml = await proxyResponse.text();
      }
    }

    clearTimeout(fetchTimeout);
    clearTimeout(timeoutId);

    // Bot challenge detection in raw HTML
    if (rawHtml && isBotProtectionResponse(rawHtml)) {
      return {
        success: false,
        url,
        error: 'Access blocked by automated bot security verification (Cloudflare/CAPTCHA). Please copy and paste the job description text directly.',
      };
    }

    if (rawHtml) {
      const cleanText = cleanJobHtml(rawHtml);
      const meta = extractJobMetadata(rawHtml);

      // Validate that content is a genuine Job Description
      if (!isJobDescriptionContent(cleanText, meta, url)) {
        return {
          success: false,
          url,
          error: INVALID_JOB_URL_ERROR,
        };
      }

      const wordCount = cleanText.split(/\s+/).filter(Boolean).length;
      return {
        success: true,
        text: cleanText,
        title: meta.title,
        company: meta.company,
        location: meta.location,
        url,
        wordCount,
        charCount: cleanText.length,
        source: 'client_fetch',
      };
    }
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      success: false,
      url,
      error: `Failed to fetch URL: ${err.message || 'Network error'}. Please paste the job description text directly.`,
    };
  }

  return {
    success: false,
    url,
    error: INVALID_JOB_URL_ERROR,
  };
}
