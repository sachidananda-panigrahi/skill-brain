const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');

/**
 * Recursively find all markdown files in a directory
 */
function findMarkdownFiles(dir, baseDir = dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && !file.startsWith('.')) {
        results = results.concat(findMarkdownFiles(filePath, baseDir));
      }
    } else if (file.endsWith('.md')) {
      const relativePath = path.relative(process.cwd(), filePath);
      results.push({
        name: file,
        path: relativePath,
        category: dir === process.cwd() ? 'Root' : path.basename(dir)
      });
    }
  });
  
  return results;
}

// GET /api/docs - list all documentation files
router.get('/', (req, res) => {
  try {
    const rootDocs = findMarkdownFiles(process.cwd()).filter(f => f.path.split(path.sep).length === 1);
    const docsDir = path.join(process.cwd(), 'docs');
    let subdirDocs = [];
    if (fs.existsSync(docsDir)) {
      subdirDocs = findMarkdownFiles(docsDir);
    }
    
    // Combine and sort
    const allDocs = [...rootDocs, ...subdirDocs].sort((a, b) => a.path.localeCompare(b.path));
    res.json(allDocs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/docs/content?path= - get content of a specific doc
router.get('/content', async (req, res) => {
  const docPath = req.query.path;
  if (!docPath) {
    return res.status(400).json({ error: 'Path parameter is required' });
  }
  
  const absolutePath = path.resolve(process.cwd(), docPath);
  
  // Security check: ensure the path is within the project root and is a markdown file
  if (!absolutePath.startsWith(process.cwd()) || !absolutePath.endsWith('.md')) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  try {
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const content = await fs.readFile(absolutePath, 'utf8');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
