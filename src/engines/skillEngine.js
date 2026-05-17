const fs = require('fs-extra');
const path = require('path');

// SKILL_BRAIN_DATA allows global npm install to write to a writable directory
// instead of the read-only node_modules/__dirname location.
const SKILLS_DIR = process.env.SKILL_BRAIN_DATA
  ? path.join(process.env.SKILL_BRAIN_DATA, 'skills')
  : path.join(__dirname, '../../..', 'skills');
const COMMON_SKILLS_DB = path.join(SKILLS_DIR, 'common.json');
const PROJECTS_DIR = path.join(SKILLS_DIR, 'projects');

// Ensure directories exist
fs.ensureDirSync(SKILLS_DIR);
fs.ensureDirSync(PROJECTS_DIR);

if (!fs.existsSync(COMMON_SKILLS_DB)) {
  // Migration: if skills.json exists, rename it to common.json
  const oldDb = path.join(SKILLS_DIR, 'skills.json');
  if (fs.existsSync(oldDb)) {
    fs.moveSync(oldDb, COMMON_SKILLS_DB);
  } else {
    fs.writeJsonSync(COMMON_SKILLS_DB, []);
  }
}

function loadCommonSkills() {
  try {
    const data = fs.readJsonSync(COMMON_SKILLS_DB);
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') return Object.values(data);
    return [];
  } catch (e) {
    return [];
  }
}

function saveCommonSkills(skills) {
  fs.writeJsonSync(COMMON_SKILLS_DB, skills, { spaces: 2 });
  try { require('./ragIndex').markDirty(null); } catch {}
}

function projectSkillsFile(projectName) {
  return path.join(PROJECTS_DIR, projectName, 'skills.json');
}

function loadProjectSkills(projectName) {
  if (!projectName) return [];
  const projectFile = projectSkillsFile(projectName);
  try {
    if (fs.existsSync(projectFile)) {
      const data = fs.readJsonSync(projectFile);
      if (Array.isArray(data)) return data;
      if (data && typeof data === 'object') return Object.values(data);
      return [];
    }
  } catch (e) {
    console.error(`Error loading skills for project ${projectName}:`, e.message);
  }
  return [];
}

function saveProjectSkills(projectName, skills) {
  if (!projectName) return;
  const projectDir = path.join(PROJECTS_DIR, projectName);
  fs.ensureDirSync(projectDir);
  fs.writeJsonSync(projectSkillsFile(projectName), skills, { spaces: 2 });
  try { require('./ragIndex').markDirty(projectName); } catch {}
}

function loadAllProjectNames() {
  try {
    return fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch (e) {
    return [];
  }
}

function loadSkills(projectName = null) {
  const common = loadCommonSkills();
  if (projectName) {
    const project = loadProjectSkills(projectName);
    return [...common, ...project];
  }
  return common;
}

function saveSkills(skills, projectName = null) {
  if (projectName) {
    saveProjectSkills(projectName, skills);
  } else {
    saveCommonSkills(skills);
  }
}

function addSkill(skill, projectName = null) {
  if (!skill.id) {
    skill.id = skill.name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
  }
  // Auto-populate TOON optional fields
  if (!skill.tags) skill.tags = [];
  if (!skill.severity) skill.severity = 'medium';
  skill.updatedAt = new Date().toISOString();

  if (projectName) {
    const projectSkills = loadProjectSkills(projectName);
    projectSkills.push(skill);
    saveProjectSkills(projectName, projectSkills);
  } else {
    const commonSkills = loadCommonSkills();
    commonSkills.push(skill);
    saveCommonSkills(commonSkills);
  }
  return skill;
}

function updateSkill(id, updates, projectName = null) {
  if (projectName) {
    const skills = loadProjectSkills(projectName);
    const idx = skills.findIndex(s => s.id === id);
    if (idx !== -1) {
      skills[idx] = { ...skills[idx], ...updates, id };
      saveProjectSkills(projectName, skills);
      return skills[idx];
    }
  }

  // Fallback to common if not found in project or no project specified
  const common = loadCommonSkills();
  const commonIdx = common.findIndex(s => s.id === id);
  if (commonIdx !== -1) {
    common[commonIdx] = { ...common[commonIdx], ...updates, id };
    saveCommonSkills(common);
    return common[commonIdx];
  }

  return null;
}

function deleteSkill(id, projectName = null) {
  let deleted = false;
  if (projectName) {
    let skills = loadProjectSkills(projectName);
    const initialLength = skills.length;
    skills = skills.filter(s => s.id !== id);
    if (skills.length !== initialLength) {
      saveProjectSkills(projectName, skills);
      deleted = true;
    }
  }

  if (!deleted) {
    let common = loadCommonSkills();
    const initialLength = common.length;
    common = common.filter(s => s.id !== id);
    if (common.length !== initialLength) {
      saveCommonSkills(common);
      deleted = true;
    }
  }

  return deleted;
}

module.exports = {
  loadSkills,
  saveSkills,
  loadCommonSkills,
  saveCommonSkills,
  loadProjectSkills,
  saveProjectSkills,
  loadAllProjectNames,
  addSkill,
  updateSkill,
  deleteSkill
};
