const { spawn } = require('child_process');

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;

async function runTests() {
  console.log('Starting E2E tests...\n');

  const server = spawn('node', ['src/entry-points/index.js'], {
    env: { ...process.env, PORT },
    stdio: 'pipe'
  });

  let serverStarted = false;

  const waitForServer = new Promise((resolve, reject) => {
    server.stdout.on('data', data => {
      const out = data.toString();
      if (out.includes('Server running at')) { serverStarted = true; resolve(); }
    });
    server.stderr.on('data', data => process.stderr.write(`[Server Error]: ${data}`));
    setTimeout(() => {
      if (!serverStarted) { server.kill(); reject(new Error('Server failed to start within 10s')); }
    }, 10000);
  });

  try {
    await waitForServer;
    console.log('Server up. Running tests...\n');

    // ── Original 8 tests ──────────────────────────────────────────────────────

    await test('Test 1: Dashboard returns 200', async () => {
      const res = await fetch(`${BASE_URL}/dashboard`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    await test('Test 2: GET /api/skills returns array', async () => {
      const res = await fetch(`${BASE_URL}/api/skills`);
      const data = await res.json();
      assert(Array.isArray(data), 'Expected array');
    });

    let skillId;
    await test('Test 3: POST /api/skills creates skill', async () => {
      const res = await fetch(`${BASE_URL}/api/skills?project=test-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Skill',
          description: 'E2E test description',
          template: 'Testing {{param}}',
          parameters: [{ name: 'param', description: 'test param' }]
        })
      });
      const skill = await res.json();
      assert(res.status === 201, `Expected 201, got ${res.status}`);
      assert(skill.name === 'Test Skill', 'name mismatch');
      skillId = skill.id;
    });

    await test('Test 4: PUT /api/skills/:id updates skill', async () => {
      const res = await fetch(`${BASE_URL}/api/skills/${skillId}?project=test-project`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Test Skill' })
      });
      const skill = await res.json();
      assert(skill.name === 'Updated Test Skill', 'name not updated');
    });

    let scannedProject;
    await test('Test 5: POST /api/scan scans current project', async () => {
      const res = await fetch(`${BASE_URL}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: process.cwd() })
      });
      const data = await res.json();
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(data.message && data.message.includes('Scan complete'), `Unexpected message: ${data.message}`);
      scannedProject = data.projectName;
    });

    await test('Test 6: GET /api/skills?project=X returns project skills', async () => {
      const res = await fetch(`${BASE_URL}/api/skills?project=${scannedProject}`);
      const skills = await res.json();
      assert(Array.isArray(skills), 'Expected array');
      assert(skills.some(s => s.id.startsWith('project-')), 'No project- skill found after scan');
    });

    await test('Test 7: GET /mcp?project=X returns capabilities', async () => {
      const res = await fetch(`${BASE_URL}/mcp?project=${scannedProject}`);
      const data = await res.json();
      assert(data.capabilities && Array.isArray(data.capabilities.skills), 'Missing capabilities.skills');
    });

    await test('Test 8: DELETE /api/skills/:id removes skill', async () => {
      const res = await fetch(`${BASE_URL}/api/skills/${skillId}?project=test-project`, { method: 'DELETE' });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    // ── New tests 9-15 ────────────────────────────────────────────────────────

    await test('Test 9: GET /api/health returns ok', async () => {
      const res = await fetch(`${BASE_URL}/api/health`);
      const data = await res.json();
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(data.status === 'ok', `Expected status ok, got ${data.status}`);
      assert(typeof data.uptime === 'number', 'uptime should be a number');
      assert(typeof data.embeddingsEnabled === 'boolean', 'embeddingsEnabled should be boolean');
      assert(typeof data.mcpServerPath === 'string', 'mcpServerPath should be a string');
    });

    await test('Test 10: GET /api/skills/search returns ranked results', async () => {
      const res = await fetch(`${BASE_URL}/api/skills/search?q=react+performance&k=3`);
      const data = await res.json();
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(data.query === 'react performance', `Wrong query echo: ${data.query}`);
      assert(Array.isArray(data.results), 'results should be array');
      assert(data.results.length <= 3, `Expected ≤3 results, got ${data.results.length}`);
      // Scores should be descending
      for (let i = 1; i < data.results.length; i++) {
        assert(
          data.results[i - 1].score >= data.results[i].score,
          `Scores not descending: ${data.results[i - 1].score} < ${data.results[i].score}`
        );
      }
      // Each result should have skill and score
      if (data.results.length > 0) {
        assert(data.results[0].skill && data.results[0].skill.id, 'Result missing skill.id');
        assert(typeof data.results[0].score === 'number', 'Result missing score');
      }
    });

    await test('Test 11: GET /api/skills/search without q returns 400', async () => {
      const res = await fetch(`${BASE_URL}/api/skills/search`);
      const data = await res.json();
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      assert(data.error, 'Expected error field');
    });

    await test('Test 12: GET /api/skills/:id/similar returns similar skills excluding self', async () => {
      // First get a valid skill id
      const skillsRes = await fetch(`${BASE_URL}/api/skills`);
      const skills = await skillsRes.json();
      assert(skills.length > 0, 'No skills available for similarity test');
      const targetId = skills[0].id;

      const res = await fetch(`${BASE_URL}/api/skills/${encodeURIComponent(targetId)}/similar?k=3`);
      const data = await res.json();
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(Array.isArray(data.results), 'results should be array');
      assert(data.results.length <= 3, `Expected ≤3 results, got ${data.results.length}`);
      // Self should not appear
      assert(
        !data.results.some(r => r.skill && r.skill.id === targetId),
        'Source skill should not appear in similar results'
      );
    });

    await test('Test 13: GET /api/skills/ghost-id/similar returns 404', async () => {
      const res = await fetch(`${BASE_URL}/api/skills/ghost-id-does-not-exist/similar`);
      const data = await res.json();
      assert(res.status === 404, `Expected 404, got ${res.status}`);
      assert(data.error, 'Expected error field');
    });

    await test('Test 14: POST /api/scan with invalid path returns 400', async () => {
      const res = await fetch(`${BASE_URL}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/no/such/directory/does/not/exist' })
      });
      const data = await res.json();
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      assert(data.error, 'Expected error field');
    });

    await test('Test 15: PUT /api/skills/ghost-id returns 404', async () => {
      const res = await fetch(`${BASE_URL}/api/skills/ghost-id-does-not-exist`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nope' })
      });
      const data = await res.json();
      assert(res.status === 404, `Expected 404, got ${res.status}`);
      assert(data.error, 'Expected error field');
    });

    await test('Test 16: POST /api/review returns report with required fields', async () => {
      const res = await fetch(`${BASE_URL}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseBranch: 'HEAD~1' })
      });
      // Accept 200 or 500 (git may not be available in test env, but shape matters)
      const data = await res.json();
      if (res.status === 200) {
        assert(data.meta, 'Expected meta field');
        assert(data.summary, 'Expected summary field');
        assert(Array.isArray(data.files), 'Expected files array');
        assert(Array.isArray(data.recommendations), 'Expected recommendations array');
        assert(typeof data.passed === 'boolean', 'Expected passed boolean');
        assert(typeof data.meta.ciExitCode === 'number', 'Expected numeric ciExitCode');
      } else {
        assert(data.error, 'Expected error field on failure');
      }
    });

    await test('Test 17: Scan with --mode=add does not overwrite existing skill', async () => {
      // Create a skill, then scan with add mode — the existing skill should be unchanged
      const createRes = await fetch(`${BASE_URL}/api/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'test-mode-add-skill',
          name: 'Mode Add Test',
          template: 'Original template content'
        })
      });
      assert(createRes.status === 201, `Create failed: ${createRes.status}`);

      // Verify via mergeSkills logic: mode=add should skip existing IDs
      const { mergeSkills } = require('../engines/scanProject');
      const existing = [{ id: 'test-mode-add-skill', name: 'Mode Add Test', template: 'Original template content', parameters: [] }];
      const incoming = [{ id: 'test-mode-add-skill', name: 'Mode Add Test', template: 'CHANGED template', parameters: [] }];
      const { merged, added, updated } = mergeSkills(existing, incoming, 'add');
      assert(added === 0, `Expected 0 added, got ${added}`);
      assert(updated === 0, `Expected 0 updated in add mode, got ${updated}`);
      assert(merged[0].template === 'Original template content', 'Existing skill should not be overwritten in add mode');

      // Cleanup
      await fetch(`${BASE_URL}/api/skills/test-mode-add-skill`, { method: 'DELETE' });
    });

    await test('Test 18: Scan with --mode=update upserts existing skill', async () => {
      const { mergeSkills } = require('../engines/scanProject');
      const existing = [{ id: 'test-mode-update-skill', name: 'Old Name', template: 'Old template', parameters: [] }];
      const incoming = [{ id: 'test-mode-update-skill', name: 'New Name', template: 'New template', parameters: [] }];
      const { merged, added, updated } = mergeSkills(existing, incoming, 'update');
      assert(added === 0, `Expected 0 added, got ${added}`);
      assert(updated === 1, `Expected 1 updated, got ${updated}`);
      assert(merged[0].template === 'New template', 'Existing skill should be updated in update mode');
      assert(merged[0].name === 'New Name', 'Existing skill name should be updated');
    });

    await test('Test 22: GET /api/docs returns list of MD files', async () => {
      const res = await fetch(`${BASE_URL}/api/docs`);
      const data = await res.json();
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(Array.isArray(data), 'Expected array');
      assert(data.length > 0, 'Expected at least one document');
      assert(data.some(d => d.name === 'README.md'), 'README.md should be in the list');
    });

    await test('Test 23: GET /api/docs/content returns file content', async () => {
      const res = await fetch(`${BASE_URL}/api/docs/content?path=README.md`);
      const data = await res.json();
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(data.content, 'Expected content field');
      assert(data.content.includes('# SkillBrain'), 'Content should contain README header');
    });

    await test('Test 24: GET /api/docs/content with invalid path returns 403', async () => {
      const res = await fetch(`${BASE_URL}/api/docs/content?path=package.json`);
      assert(res.status === 403, `Expected 403 for non-md file, got ${res.status}`);
    });

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
    if (failed > 0) {
      console.error('FAILED');
      process.exitCode = 1;
    } else {
      console.log('All E2E tests passed!');
    }
  } catch (error) {
    console.error(`\nFatal error: ${error.message}`);
    process.exitCode = 1;
  } finally {
    server.kill();
  }
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

runTests();
