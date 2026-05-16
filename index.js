const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// --- Serve dashboard static files ---
app.use(express.static(path.join(__dirname, 'public')));

// Redirect /dashboard to dashboard.html
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// --- Skills REST API ---
const apiSkillsRouter = require('./apiSkills');
app.use('/api/skills', apiSkillsRouter);

// --- Scan endpoint (triggers scanner) ---
app.post('/api/scan', async (req, res) => {
  const { path: projectPath } = req.body;
  if (!projectPath || !fs.existsSync(projectPath)) {
    return res.status(400).json({ error: 'Invalid project path' });
  }

  // Run the scan logic (reuse scanProject functions)
  const { scanProject, generateSkillsFromScan } = require('./scanProject');
  const { loadCommonSkills, saveCommonSkills, loadProjectSkills, saveProjectSkills } = require('./skillEngine');

  try {
    const scan = scanProject(projectPath);
    const { commonSkills, projectSkills } = generateSkillsFromScan(scan);
    
    // Save common skills
    const existingCommon = loadCommonSkills();
    let commonAdded = 0;
    commonSkills.forEach(skill => {
      if (!existingCommon.find(s => s.id === skill.id)) {
        existingCommon.push(skill);
        commonAdded++;
      }
    });
    saveCommonSkills(existingCommon);

    // Save project skills
    const projectName = scan.name;
    const existingProject = loadProjectSkills(projectName);
    let projectAdded = 0;
    let projectUpdated = 0;
    projectSkills.forEach(skill => {
      const existingIdx = existingProject.findIndex(s => s.id === skill.id);
      if (existingIdx === -1) {
        existingProject.push(skill);
        projectAdded++;
      } else {
        existingProject[existingIdx] = { ...existingProject[existingIdx], ...skill };
        projectUpdated++;
      }
    });
    saveProjectSkills(projectName, existingProject);

    res.json({ 
      message: `Scan complete for ${projectName}. Added ${projectAdded} project skills, ${commonAdded} common skills.`, 
      projectName,
      totalProject: existingProject.length,
      totalCommon: existingCommon.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mock MCP endpoint for discovery
app.get('/mcp', (req, res) => {
    const { loadSkills } = require('./skillEngine');
    const { project } = req.query;
    res.json({
        capabilities: {
            skills: loadSkills(project)
        }
    });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Dashboard available at http://localhost:${port}/dashboard`);
});
