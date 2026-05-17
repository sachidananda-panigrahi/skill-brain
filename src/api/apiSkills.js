const express = require('express');
const router = express.Router();
const { loadSkills, addSkill, updateSkill, deleteSkill, loadAllProjectNames } = require('../engines/skillEngine');
const ragIndex = require('../engines/ragIndex');
const {
  loadPrebuiltSkills,
  getSkillsByDomain,
  getSkillsBySeverity,
  getSeniorUIArchitectCompetencies,
  searchPrebuiltSkills,
  getLighthouseSkills,
  getSecurityNFRSkills,
  generateSkillCoverageReport
} = require('../rules/prebuiltSkillsLoader');
const { detectAntiPatterns } = require('../rules/antiPatternDetector');
const { validateLighthouseReport, generateImprovementPlan } = require('../rules/lighthouseValidator');

// POST /review — git diff-based code review (delegates to reviewMode)
router.post('/review', async (req, res) => {
  const { baseBranch, format } = req.body;
  const { getGitDiffFiles, analyzeFilesForReview, generateReviewReport } = require('../workflows/reviewMode');
  try {
    const base = baseBranch || 'HEAD~1';
    const files = await getGitDiffFiles(base);
    const analysis = analyzeFilesForReview(files);
    const report = await generateReviewReport(analysis, base);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /projects — list all project names
router.get('/projects', (req, res) => {
  res.json(loadAllProjectNames());
});

// GET /search?q=&k=5&project= — semantic skill search
router.get('/search', async (req, res) => {
  const { q, project } = req.query;
  const k = Math.min(Math.max(parseInt(req.query.k, 10) || 5, 1), 50);

  if (!q || !q.trim()) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    const results = await ragIndex.search(q.trim(), k, project || null);
    res.json({ query: q.trim(), k, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET / — list skills (optionally filtered by project)
router.get('/', (req, res) => {
  const { project } = req.query;
  res.json(loadSkills(project));
});

// POST / — create skill
router.post('/', (req, res) => {
  const { project } = req.query;
  const skill = req.body;
  if (!skill.name || !skill.template) {
    return res.status(400).json({ error: 'name and template are required' });
  }
  const created = addSkill(skill, project);
  res.status(201).json(created);
});

// GET /:id/similar?k=5&project= — find similar skills
router.get('/:id/similar', async (req, res) => {
  const { project } = req.query;
  const k = Math.min(Math.max(parseInt(req.query.k, 10) || 5, 1), 50);
  const { id } = req.params;

  try {
    const results = await ragIndex.similar(id, k, project || null);
    if (results === null) {
      return res.status(404).json({ error: `Skill "${id}" not found` });
    }
    res.json({ id, k, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update skill
router.put('/:id', (req, res) => {
  const { project } = req.query;
  const updated = updateSkill(req.params.id, req.body, project);
  if (!updated) {
    return res.status(404).json({ error: 'Skill not found' });
  }
  res.json(updated);
});

// DELETE /:id — delete skill
router.delete('/:id', (req, res) => {
  const { project } = req.query;
  const success = deleteSkill(req.params.id, project);
  if (!success) {
    return res.status(404).json({ error: 'Skill not found' });
  }
  res.json({ message: 'Deleted' });
});

// ===== PREBUILT SKILLS ENDPOINTS =====

// GET /prebuilt/all — list all prebuilt skills
router.get('/prebuilt/all', async (req, res) => {
  try {
    const skills = await loadPrebuiltSkills();
    res.json({ count: skills.length, skills });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /prebuilt/competencies — Senior UI Architect competency set (12 domains)
router.get('/prebuilt/competencies', async (req, res) => {
  try {
    const competencies = await getSeniorUIArchitectCompetencies();
    res.json(competencies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /prebuilt/domain/:domain — get skills by domain
router.get('/prebuilt/domain/:domain', async (req, res) => {
  try {
    const skills = await getSkillsByDomain(req.params.domain);
    res.json({ domain: req.params.domain, count: skills.length, skills });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /prebuilt/severity/:severity — get skills by severity
router.get('/prebuilt/severity/:severity', async (req, res) => {
  try {
    const skills = await getSkillsBySeverity(req.params.severity);
    res.json({ severity: req.params.severity, count: skills.length, skills });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /prebuilt/search?q= — search prebuilt skills
router.get('/prebuilt/search', async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    const results = await searchPrebuiltSkills(q.trim());
    res.json({ query: q.trim(), count: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /prebuilt/lighthouse — get Lighthouse & performance skills
router.get('/prebuilt/lighthouse', async (req, res) => {
  try {
    const skills = await getLighthouseSkills();
    res.json({ count: skills.length, skills });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /prebuilt/security-nfr — get security and NFR enforcement skills
router.get('/prebuilt/security-nfr', async (req, res) => {
  try {
    const skills = await getSecurityNFRSkills();
    res.json({ count: skills.length, skills });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ANTI-PATTERN DETECTION ENDPOINTS =====

// POST /anti-patterns/detect — detect anti-patterns in code
router.post('/anti-patterns/detect', (req, res) => {
  const { code, fileType, domain } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'code is required' });
  }

  try {
    const violations = detectAntiPatterns(code, fileType || 'js', domain);
    const summary = {
      total: violations.length,
      critical: violations.filter(v => v.severity === 'critical').length,
      high: violations.filter(v => v.severity === 'high').length,
      medium: violations.filter(v => v.severity === 'medium').length,
      low: violations.filter(v => v.severity === 'low').length
    };

    res.json({ summary, violations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== LIGHTHOUSE VALIDATION ENDPOINTS =====

// POST /lighthouse/validate — validate Lighthouse report
router.post('/lighthouse/validate', (req, res) => {
  const { report } = req.body;
  if (!report) {
    return res.status(400).json({ error: 'Lighthouse report JSON is required' });
  }

  try {
    const validation = validateLighthouseReport(report);
    res.json(validation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /lighthouse/improvement-plan — generate improvement plan from violations
router.post('/lighthouse/improvement-plan', (req, res) => {
  const { report } = req.body;
  if (!report) {
    return res.status(400).json({ error: 'Lighthouse report JSON is required' });
  }

  try {
    const validation = validateLighthouseReport(report);
    const plan = generateImprovementPlan(validation);
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== SKILL COVERAGE ENDPOINTS =====

// POST /coverage/report — generate skill coverage report
router.post('/coverage/report', async (req, res) => {
  const { detectedSkills } = req.body;
  if (!Array.isArray(detectedSkills)) {
    return res.status(400).json({ error: 'detectedSkills array is required' });
  }

  try {
    const prebuilt = await loadPrebuiltSkills();
    const report = await generateSkillCoverageReport(detectedSkills, prebuilt);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
