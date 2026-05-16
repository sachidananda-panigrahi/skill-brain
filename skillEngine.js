const fs = require('fs-extra');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, 'skills');
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
    return fs.readJsonSync(COMMON_SKILLS_DB);
  } catch (e) {
    return [];
  }
}

function saveCommonSkills(skills) {
  fs.writeJsonSync(COMMON_SKILLS_DB, skills, { spaces: 2 });
}

function loadProjectSkills(projectName) {
  if (!projectName) return [];
  const projectFile = path.join(PROJECTS_DIR, `${projectName}.json`);
  try {
    if (fs.existsSync(projectFile)) {
      return fs.readJsonSync(projectFile);
    }
  } catch (e) {
    console.error(`Error loading skills for project ${projectName}:`, e.message);
  }
  return [];
}

function saveProjectSkills(projectName, skills) {
  if (!projectName) return;
  const projectFile = path.join(PROJECTS_DIR, `${projectName}.json`);
  fs.writeJsonSync(projectFile, skills, { spaces: 2 });
}

function loadAllProjectNames() {
  try {
    return fs.readdirSync(PROJECTS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
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
  const skills = loadSkills(projectName);
  // Assign a unique id if not provided
  if (!skill.id) {
    skill.id = skill.name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
  }
  
  // If we are adding to a project, we only save the project-specific skills
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

function runSkillInference() {
  // Placeholder for existing functionality
  console.log("Running skill inference...");
}

module.exports = { 
  runSkillInference, 
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
