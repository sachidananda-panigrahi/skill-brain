const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

const PORT = 3001; // Use a different port for testing to avoid conflicts
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log('🚀 Starting E2E tests...');

  // 1. Start the server
  const server = spawn('node', ['index.js'], {
    env: { ...process.env, PORT: PORT },
    stdio: 'pipe'
  });

  let serverStarted = false;
  
  const waitForServer = new Promise((resolve, reject) => {
    server.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Server]: ${output.trim()}`);
      if (output.includes(`Server running at http://localhost`)) {
        serverStarted = true;
        resolve();
      }
    });
    server.stderr.on('data', (data) => {
      console.error(`[Server Error]: ${data.toString()}`);
    });
    setTimeout(() => {
      if (!serverStarted) {
        server.kill();
        reject(new Error('Server failed to start within 10 seconds'));
      }
    }, 10000);
  });

  try {
    await waitForServer;
    console.log('✅ Server is up. Running tests...');

    // Test 1: Dashboard Accessibility
    console.log('Test 1: Dashboard Accessibility...');
    const dashRes = await fetch(`${BASE_URL}/dashboard`);
    if (dashRes.status !== 200) throw new Error(`Dashboard returned ${dashRes.status}`);
    console.log('  - Dashboard OK');

    // Test 2: GET Skills API
    console.log('Test 2: GET /api/skills...');
    const skillsRes = await fetch(`${BASE_URL}/api/skills`);
    const skills = await skillsRes.json();
    if (!Array.isArray(skills)) throw new Error('GET /api/skills did not return an array');
    console.log(`  - Found ${skills.length} skills`);

    // Test 3: POST Skill API
    console.log('Test 3: POST /api/skills...');
    const newSkill = {
      name: 'Test Skill',
      description: 'E2E Test Description',
      template: 'Testing {{param}}',
      parameters: [{ name: 'param', description: 'test param' }]
    };
    // Add to a dummy project to test project-specific addition
    const postRes = await fetch(`${BASE_URL}/api/skills?project=test-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSkill)
    });
    const createdSkill = await postRes.json();
    if (postRes.status !== 201 || createdSkill.name !== 'Test Skill') {
      throw new Error(`POST /api/skills failed: ${JSON.stringify(createdSkill)}`);
    }
    const skillId = createdSkill.id;
    console.log(`  - Created skill with ID: ${skillId}`);

    // Test 4: PUT Skill API
    console.log('Test 4: PUT /api/skills/:id...');
    const update = { name: 'Updated Test Skill' };
    const putRes = await fetch(`${BASE_URL}/api/skills/${skillId}?project=test-project`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    const updatedSkill = await putRes.json();
    if (updatedSkill.name !== 'Updated Test Skill') {
      throw new Error(`PUT /api/skills failed: ${JSON.stringify(updatedSkill)}`);
    }
    console.log('  - Updated skill OK');

    // Test 5: Scan Project API
    console.log('Test 5: POST /api/scan...');
    const scanRes = await fetch(`${BASE_URL}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: process.cwd() })
    });
    const scanResult = await scanRes.json();
    if (scanRes.status !== 200 || !scanResult.message.includes('Scan complete')) {
      throw new Error(`POST /api/scan failed: ${JSON.stringify(scanResult)}`);
    }
    const scannedProject = scanResult.projectName;
    console.log(`  - ${scanResult.message}`);

    // Test 6: GET Project Skills
    console.log(`Test 6: GET /api/skills?project=${scannedProject}...`);
    const projectSkillsRes = await fetch(`${BASE_URL}/api/skills?project=${scannedProject}`);
    const projectSkills = await projectSkillsRes.json();
    if (!projectSkills.some(s => s.id.startsWith('project-'))) {
      throw new Error('Project skills not found after scan');
    }
    console.log(`  - Found ${projectSkills.length} total skills for project ${scannedProject}`);

    // Test 7: MCP Discovery with Project
    console.log(`Test 7: GET /mcp?project=${scannedProject}...`);
    const mcpRes = await fetch(`${BASE_URL}/mcp?project=${scannedProject}`);
    const mcpData = await mcpRes.json();
    if (!mcpData.capabilities || !mcpData.capabilities.skills || mcpData.capabilities.skills.length < projectSkills.length) {
      throw new Error('MCP response missing project skills');
    }
    console.log('  - MCP project discovery OK');

    // Test 8: DELETE Skill API (from project)
    console.log('Test 8: DELETE /api/skills/:id...');
    const delRes = await fetch(`${BASE_URL}/api/skills/${skillId}?project=test-project`, { method: 'DELETE' });
    if (delRes.status !== 200) throw new Error(`DELETE failed: ${delRes.status}`);
    console.log('  - Delete skill OK');

    console.log('\n🎉 All E2E tests passed successfully!');
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    console.log('Stopping server...');
    server.kill();
  }
}

runTests();
