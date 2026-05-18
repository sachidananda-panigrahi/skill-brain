/**
 * Prebuilt Skills Loader
 * Loads curated skills from GitHub best practices and ESCO taxonomy
 * Provides role-based skill sets for Senior UI Architect competencies
 */

const fs = require('fs-extra');
const path = require('path');

const PREBUILT_SKILLS_DIR = path.join(__dirname, '../../skills', 'prebuilt');

/**
 * Load all prebuilt skills from disk
 * @returns {Promise<Array>} Array of all prebuilt skills
 */
async function loadPrebuiltSkills() {
  try {
    const files = await fs.readdir(PREBUILT_SKILLS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    let allSkills = [];
    for (const file of jsonFiles) {
      const filePath = path.join(PREBUILT_SKILLS_DIR, file);
      const content = await fs.readJson(filePath);
      const skillsArr = Array.isArray(content) ? content
        : Array.isArray(content.skills) ? content.skills
        : [content];
      allSkills = allSkills.concat(skillsArr);
    }

    return dedupeById(allSkills);
  } catch (error) {
    console.error('Error loading prebuilt skills:', error.message);
    return [];
  }
}

/**
 * Get skills by domain (Senior UI Architect competency areas)
 * @param {string} domain - Domain name
 * @returns {Promise<Array>} Skills for specified domain
 */
async function getSkillsByDomain(domain) {
  const allSkills = await loadPrebuiltSkills();
  return allSkills.filter(skill => skill.domain === domain);
}

/**
 * Get skills by severity level
 * @param {string} severity - 'critical', 'high', 'medium', 'low'
 * @returns {Promise<Array>} Skills with specified severity
 */
async function getSkillsBySeverity(severity) {
  const allSkills = await loadPrebuiltSkills();
  return allSkills.filter(skill => skill.severity === severity);
}

/**
 * Get skills by category (architecture, pattern, enforcement)
 * @param {string} category - Skill category
 * @returns {Promise<Array>} Skills in specified category
 */
async function getSkillsByCategory(category) {
  const allSkills = await loadPrebuiltSkills();
  return allSkills.filter(skill => skill.category === category);
}

/**
 * Get Senior UI Architect core competency set
 * @returns {Promise<Array>} 12 core competency domains
 */
async function getSeniorUIArchitectCompetencies() {
  const allSkills = await loadPrebuiltSkills();
  const domains = [
    'UI Architecture',
    'Design Systems',
    'AI-Augmented Engineering',
    'Micro-Frontend / Monorepo',
    'React.js / TypeScript',
    'Performance Optimisation',
    'Team Leadership',
    'CI/CD Pipelines',
    'RESTful & GraphQL APIs',
    'SSR / Next.js',
    'Agile / Scrum',
    'UX & Wireframing'
  ];

  const competencies = {};
  for (const domain of domains) {
    competencies[domain] = allSkills.filter(skill => skill.domain === domain);
  }

  return competencies;
}

/**
 * Search prebuilt skills by keyword
 * @param {string} keyword - Search term
 * @returns {Promise<Array>} Matching skills
 */
async function searchPrebuiltSkills(keyword) {
  const allSkills = await loadPrebuiltSkills();
  const lowerKeyword = keyword.toLowerCase();

  return allSkills.filter(skill =>
    skill.name.toLowerCase().includes(lowerKeyword) ||
    skill.description.toLowerCase().includes(lowerKeyword) ||
    skill.template.toLowerCase().includes(lowerKeyword) ||
    (skill.tags && skill.tags.some(tag => tag.toLowerCase().includes(lowerKeyword)))
  );
}

/**
 * Get anti-pattern detection skills
 * @returns {Promise<Array>} Anti-pattern enforcement skills
 */
async function getAntiPatternSkills() {
  const allSkills = await loadPrebuiltSkills();
  return allSkills.filter(skill =>
    skill.category === 'enforcement' &&
    (skill.name.includes('Anti') || skill.description.includes('anti-pattern'))
  );
}

/**
 * Get Lighthouse/performance enforcement skills
 * @returns {Promise<Array>} Performance and Lighthouse skills
 */
async function getLighthouseSkills() {
  const allSkills = await loadPrebuiltSkills();
  return allSkills.filter(skill =>
    skill.domain === 'Performance Optimisation' ||
    skill.name.includes('Lighthouse') ||
    skill.name.includes('Core Web Vitals') ||
    skill.tags?.includes('lighthouse')
  );
}

/**
 * Get security and NFR enforcement skills
 * @returns {Promise<Array>} Security, accessibility, and NFR skills
 */
async function getSecurityNFRSkills() {
  const allSkills = await loadPrebuiltSkills();
  return allSkills.filter(skill =>
    skill.domain === 'Security & Vulnerabilities' ||
    skill.domain === 'Accessibility & NFR' ||
    skill.domain === 'Architecture & NFR' ||
    skill.severity === 'critical'
  );
}

/**
 * Generate skill report for project
 * @param {Array} detectedSkills - Skills detected from code scan
 * @param {Array} prebuiltSkills - Available prebuilt skills
 * @returns {object} Skill coverage report
 */
async function generateSkillCoverageReport(detectedSkills, prebuiltSkills = null) {
  const allSkills = prebuiltSkills || await loadPrebuiltSkills();
  const domains = new Set(allSkills.map(s => s.domain).filter(Boolean));

  const report = {
    timestamp: new Date().toISOString(),
    domains: {},
    coverage: {
      total: allSkills.length,
      detected: detectedSkills.length,
      percentage: Math.round((detectedSkills.length / allSkills.length) * 100)
    },
    gaps: []
  };

  // Map detected skills to domains
  domains.forEach(domain => {
    const domainSkills = allSkills.filter(s => s.domain === domain);
    const detectedInDomain = detectedSkills.filter(s => s.domain === domain).length;

    report.domains[domain] = {
      total: domainSkills.length,
      detected: detectedInDomain,
      percentage: Math.round((detectedInDomain / domainSkills.length) * 100),
      coverage: detectedInDomain === domainSkills.length ? 'COMPLETE' : 'PARTIAL'
    };

    if (detectedInDomain < domainSkills.length) {
      report.gaps.push({
        domain,
        missing: domainSkills.length - detectedInDomain,
        skills: domainSkills
          .filter(s => !detectedSkills.some(d => d.id === s.id))
          .map(s => ({ id: s.id, name: s.name, severity: s.severity }))
      });
    }
  });

  return report;
}

/**
 * Export prebuilt skills as project skills template
 * @param {string} projectName - Target project name
 * @returns {Promise<void>}
 */
async function exportAsProjectTemplate(projectName) {
  const allSkills = await loadPrebuiltSkills();
  const templatePath = path.join(__dirname, 'skills', 'projects', `${projectName}.json`);

  // Enhance with project-specific metadata
  const projectSkills = allSkills.map(skill => ({
    ...skill,
    project: projectName,
    imported: new Date().toISOString(),
    enforced: skill.severity === 'critical'
  }));

  await fs.ensureDir(path.dirname(templatePath));
  await fs.writeJson(templatePath, projectSkills, { spaces: 2 });

  return {
    success: true,
    path: templatePath,
    count: projectSkills.length
  };
}

// Priority-ordered file list — domain-agnostic skills first, specialised last
const DEFAULT_SKILL_FILES = [
  // Core quality (always loaded)
  'workflow-skills.json',
  'code-quality-security.json',
  'testing-verification.json',
  'architecture-design.json',
  'devops-git.json',

  // Web fundamentals
  'html-css-web.json',
  'javascript-modern.json',
  'frontend-guidelines.json',
  'senior-ui-architect-core.json',

  // React ecosystem
  'react-best-practices.json',
  'react-advanced.json',
  'react-19-patterns.json',

  // TypeScript
  'typescript-strict-patterns.json',

  // Next.js
  'nextjs-app-router.json',
  'nextjs-performance.json',

  // UI library + styling
  'shadcn-tailwind-ui.json',

  // State management
  'state-management-modern.json',

  // APIs
  'nodejs-api-patterns.json',

  // Testing
  'web-testing-modern.json',

  // Security + accessibility
  'security-nfr.json',
  'web-accessibility-a11y.json',

  // Build tooling
  'vite-build-tooling.json',
];

/**
 * Deduplicate skills by id — last-write-wins (earlier files take priority here via filter).
 * @param {Array} skills
 * @returns {Array}
 */
function dedupeById(skills) {
  const seen = new Set();
  return skills.filter(s => s.id && !seen.has(s.id) && seen.add(s.id));
}

function loadFile(filename) {
  try {
    const filePath = path.join(PREBUILT_SKILLS_DIR, filename);
    if (!require('fs').existsSync(filePath)) return [];
    const raw = require('fs').readFileSync(filePath, 'utf8');
    const content = JSON.parse(raw);
    const arr = Array.isArray(content) ? content : Array.isArray(content.skills) ? content.skills : [content];
    return arr;
  } catch {
    return [];
  }
}

/**
 * Merge all default skill files in priority order and deduplicate by id.
 * Also loads any fetched remote skills cached in skills/prebuilt/fetched/.
 * @returns {Array} All default skills (deduplicated)
 */
function getAllDefaultSkills() {
  const base = DEFAULT_SKILL_FILES.flatMap(loadFile);

  // Also load on-demand fetched skills if present
  const fetchedDir = path.join(PREBUILT_SKILLS_DIR, 'fetched');
  let fetched = [];
  try {
    if (require('fs').existsSync(fetchedDir)) {
      const files = require('fs').readdirSync(fetchedDir).filter(f => f.endsWith('.json'));
      fetched = files.flatMap(f => {
        try {
          const raw = require('fs').readFileSync(path.join(fetchedDir, f), 'utf8');
          const content = JSON.parse(raw);
          return Array.isArray(content) ? content : Array.isArray(content.skills) ? content.skills : [];
        } catch { return []; }
      });
    }
  } catch { /* fetched dir may not exist */ }

  return dedupeById([...base, ...fetched]);
}

module.exports = {
  loadPrebuiltSkills,
  getAllDefaultSkills,
  getSkillsByDomain,
  getSkillsBySeverity,
  getSkillsByCategory,
  getSeniorUIArchitectCompetencies,
  searchPrebuiltSkills,
  getAntiPatternSkills,
  getLighthouseSkills,
  getSecurityNFRSkills,
  generateSkillCoverageReport,
  exportAsProjectTemplate
};
