const express = require('express');
const router = express.Router();
const { loadSkills, addSkill, updateSkill, deleteSkill, loadAllProjectNames } = require('./skillEngine');

// GET projects list
router.get('/projects', (req, res) => {
  res.json(loadAllProjectNames());
});

// GET all skills (optionally filtered by project)
router.get('/', (req, res) => {
  const { project } = req.query;
  res.json(loadSkills(project));
});

// POST new skill
router.post('/', (req, res) => {
  const { project } = req.query;
  const skill = req.body;
  if (!skill.name || !skill.template) {
    return res.status(400).json({ error: 'name and template are required' });
  }
  const created = addSkill(skill, project);
  res.status(201).json(created);
});

// PUT update skill
router.put('/:id', (req, res) => {
  const { project } = req.query;
  const updated = updateSkill(req.params.id, req.body, project);
  if (!updated) {
    return res.status(404).json({ error: 'Skill not found' });
  }
  res.json(updated);
});

// DELETE skill
router.delete('/:id', (req, res) => {
  const { project } = req.query;
  const success = deleteSkill(req.params.id, project);
  if (!success) {
    return res.status(404).json({ error: 'Skill not found' });
  }
  res.json({ message: 'Deleted' });
});

module.exports = router;
