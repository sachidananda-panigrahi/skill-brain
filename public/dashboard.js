let allSkills = [];
let currentProject = '';
let deleteTargetId = null;
let activeSection = '';
let currentDocPath = '';
const partialCache = new Map();
const validSections = new Set(['overview', 'search', 'scan', 'review', 'add', 'docs']);

window.addEventListener('DOMContentLoaded', async () => {
	if (typeof marked !== 'undefined') {
		marked.setOptions({ gfm: true, breaks: true });
	}
	const initialSection = sectionFromLocation();
	await navigateToSection(initialSection, { replace: true, skipHistory: false });
	// Load data after section is rendered
	await loadHealth();
	await loadProjects();
	await loadSkills();
	window.addEventListener('popstate', async () => {
		const section = sectionFromLocation();
		await navigateToSection(section, { skipHistory: true });
		if (section === 'overview') {
			await loadHealth();
			await loadProjects();
			await loadSkills();
		}
	});
});

function normalizeSection(name) {
	return name && validSections.has(name) ? name : 'overview';
}

function sectionFromLocation() {
	const parts = window.location.pathname.split('/').filter(Boolean);
	if (parts[0] === 'dashboard' && parts[1]) return normalizeSection(parts[1]);
	return 'overview';
}

function sectionPath(name) {
	return `/dashboard/${encodeURIComponent(name)}`;
}

async function navigateToSection(name, opts = {}) {
	const section = normalizeSection(name);
	if (!opts.skipHistory) {
		const nextPath = sectionPath(section);
		if (window.location.pathname !== nextPath) {
			if (opts.replace) history.replaceState({ section }, '', nextPath);
			else history.pushState({ section }, '', nextPath);
		}
	}
	await showSection(section, opts);
}

function setActiveNav(name) {
	document.querySelectorAll('.nav-btn').forEach(btn => {
		const active = btn.dataset.nav === name;
		btn.classList.toggle('bg-brand-500', active);
		btn.classList.toggle('text-white', active);
		btn.classList.toggle('text-slate-300', !active);
	});
}

async function getSectionPartial(name) {
	if (partialCache.has(name)) return partialCache.get(name);
	const res = await fetch(`/partials/${encodeURIComponent(name)}.html`);
	if (!res.ok) throw new Error(`Failed to load section ${name}`);
	const html = await res.text();
	partialCache.set(name, html);
	return html;
}

async function showSection(name) {
	activeSection = name;
	setActiveNav(name);
	const mount = document.getElementById('sectionMount');
	if (!mount) return;
	mount.innerHTML = '<div class="p-8 text-sm text-slate-400">Loading section…</div>';
	try {
		const html = await getSectionPartial(name);
		if (activeSection !== name) return;
		mount.innerHTML = html;
			// Reload all data when navigating to overview
		if (name === 'overview') {
							await loadHealth();
							await loadProjects();
			await loadSkills();
		} else if (name === 'docs') {
			loadDocs();
		}
	} catch (e) {
		mount.innerHTML = `<div class="p-8"><div class="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">${esc(e.message)}</div></div>`;
	}
}

async function loadHealth() {
	try {
		const d = await (await fetch('/api/health')).json();
		const dot = document.getElementById('healthDot');
		if (dot) {
			dot.classList.remove('bg-slate-500');
			dot.classList.add(d.status === 'ok' ? 'bg-emerald-400' : 'bg-rose-400');
		}
		const healthTextEl = document.getElementById('healthText');
		if (healthTextEl) healthTextEl.textContent = `Online · ${d.embeddingsEnabled ? 'Embeddings' : 'TF-IDF'}`;
		const engineEl = document.getElementById('statEngine');
		if (engineEl) engineEl.textContent = d.embeddingsEnabled ? 'Embeddings' : 'TF-IDF';
	} catch {
		const healthTextEl = document.getElementById('healthText');
		if (healthTextEl) healthTextEl.textContent = 'Offline';
	}
}

async function loadProjects() {
	try {
		const names = await (await fetch('/api/skills/projects')).json();
		const sel = document.getElementById('projectSelect');
		if (sel) {
			const selected = sel.value;
			sel.innerHTML = '<option value="">— Global —</option>';
			names.forEach(n => {
				const o = document.createElement('option');
				o.value = n;
				o.textContent = n;
				sel.appendChild(o);
			});
			sel.value = selected;
		}
		const projectsEl = document.getElementById('statProjects');
		if (projectsEl) projectsEl.textContent = names.length;
	} catch {}
}

function switchProject() {
	const sel = document.getElementById('projectSelect');
	currentProject = sel ? sel.value : '';
	loadSkills();
}

async function loadSkills() {
	const url = currentProject ? `/api/skills?project=${encodeURIComponent(currentProject)}` : '/api/skills';
	try {
		allSkills = await (await fetch(url)).json();
		const totalEl = document.getElementById('statTotal');
		if (totalEl) totalEl.textContent = allSkills.length;
		const enforceEl = document.getElementById('statEnforce');
		if (enforceEl) enforceEl.textContent = allSkills.filter(s => s.id.startsWith('enforce-')).length;
		if (document.getElementById('skillsGrid')) renderSkills(allSkills);
	} catch (e) {
		const grid = document.getElementById('skillsGrid');
		if (grid) grid.innerHTML = `<div class="col-span-full text-rose-500 text-sm">Error: ${esc(e.message)}</div>`;
	}
}

function filterSkills() {
	const filterInput = document.getElementById('filterInput');
	const typeFilter = document.getElementById('typeFilter');
	if (!filterInput || !typeFilter) return;
	const q = filterInput.value.toLowerCase();
	const type = typeFilter.value;
	renderSkills(allSkills.filter(s => {
		const mq = !q || (s.name + (s.description || '') + (s.template || '')).toLowerCase().includes(q);
		const mt = !type || s.id.startsWith(type);
		return mq && mt;
	}));
}

function skillType(id) {
	if (id.startsWith('enforce-')) return { l: 'Enforce', c: 'bg-rose-100 text-rose-700' };
	if (id.startsWith('project-')) return { l: 'Project', c: 'bg-indigo-100 text-indigo-700' };
	if (id.startsWith('lib-')) return { l: 'Library', c: 'bg-emerald-100 text-emerald-700' };
	if (id.startsWith('pattern-')) return { l: 'Pattern', c: 'bg-amber-100 text-amber-700' };
	if (id.startsWith('architect-')) return { l: 'Architect', c: 'bg-cyan-100 text-cyan-700' };
	return { l: 'Custom', c: 'bg-violet-100 text-violet-700' };
}

function renderSkills(skills) {
	const g = document.getElementById('skillsGrid');
	if (!g) return;
	if (!skills.length) {
		g.innerHTML = '<div class="col-span-full text-center text-slate-400 py-16">No skills found.</div>';
		return;
	}
	g.innerHTML = skills.map(s => {
		const t = skillType(s.id);
		return `<div class="skill-card bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col fade-in">
			<div class="p-4 pb-3">
				<div class="flex items-start justify-between gap-2 mb-2">
					<span class="inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${t.c}">${t.l}</span>
					<div class="flex gap-1">
						<button onclick="loadSimilar('${s.id}')" class="w-7 h-7 rounded-lg hover:bg-indigo-50 flex items-center justify-center text-slate-400 hover:text-brand-500 transition-colors">↯</button>
						<button onclick="editSkill('${s.id}')" class="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">✎</button>
						<button onclick="openDel('${s.id}',\`${(s.name || '').replace(/`/g, '\\`')}\`)" class="w-7 h-7 rounded-lg hover:bg-rose-50 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors">🗑</button>
					</div>
				</div>
				<h3 class="font-semibold text-slate-900 text-sm leading-snug mb-1">${esc(s.name)}</h3>
				${s.description ? `<p class="text-xs text-slate-500 mb-2">${esc(s.description)}</p>` : ''}
				<div class="template-box rounded-lg bg-slate-50 border border-slate-100 p-2.5 text-xs font-mono text-slate-600 whitespace-pre-wrap">${esc(s.template || '')}</div>
			</div>
			<div id="sim-${s.id}" class="hidden border-t border-slate-100 p-4 bg-indigo-50/50 rounded-b-2xl"></div>
		</div>`;
	}).join('');
}

async function loadSimilar(id) {
	const p = document.getElementById(`sim-${id}`);
	if (!p) return;
	if (!p.classList.contains('hidden')) { p.classList.add('hidden'); return; }
	p.innerHTML = '<p class="text-xs text-slate-400">Finding similar…</p>';
	p.classList.remove('hidden');
	const proj = currentProject ? `&project=${encodeURIComponent(currentProject)}` : '';
	try {
		const d = await (await fetch(`/api/skills/${encodeURIComponent(id)}/similar?k=3${proj}`)).json();
		if (!d.results?.length) {
			p.innerHTML = '<p class="text-xs text-slate-400">None found.</p>';
			return;
		}
		p.innerHTML = d.results.map(r => `<div class="text-xs mb-1"><span class="font-semibold">${esc(r.skill.name)}</span> (${(r.score * 100).toFixed(0)}%)</div>`).join('');
	} catch (e) {
		p.innerHTML = `<p class="text-xs text-rose-500">${esc(e.message)}</p>`;
	}
}

async function runSearch() {
	const input = document.getElementById('searchInput');
	const kEl = document.getElementById('searchK');
	const c = document.getElementById('searchResults');
	if (!input || !kEl || !c) return;
	const q = input.value.trim();
	const k = kEl.value;
	if (!q) {
		c.innerHTML = '<p class="text-slate-400 text-sm">Enter a query above.</p>';
		return;
	}
	c.innerHTML = '<p class="text-slate-400 text-sm animate-pulse">Searching…</p>';
	const proj = currentProject ? `&project=${encodeURIComponent(currentProject)}` : '';
	try {
		const d = await (await fetch(`/api/skills/search?q=${encodeURIComponent(q)}&k=${k}${proj}`)).json();
		if (!d.results?.length) {
			c.innerHTML = '<p class="text-slate-400 text-sm">No results.</p>';
			return;
		}
		c.innerHTML = d.results.map((r, i) => `<div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-3"><p class="text-xs text-slate-400 mb-1">#${i + 1} · ${(r.score * 100).toFixed(1)}%</p><p class="font-semibold text-sm text-slate-900">${esc(r.skill.name)}</p><p class="text-xs text-slate-500 mt-1">${esc(r.skill.description || '')}</p></div>`).join('');
	} catch (e) {
		c.innerHTML = `<p class="text-rose-500 text-sm">${esc(e.message)}</p>`;
	}
}

async function runScan() {
	const scanPath = document.getElementById('scanPath')?.value.trim();
	const mode = document.getElementById('scanMode')?.value || 'update';
	const rd = document.getElementById('scanResult');
	const prog = document.getElementById('scanProgress');
	if (!rd || !prog) return;
	if (!scanPath) {
		rd.innerHTML = '<p class="text-rose-500 text-sm">Enter a project path.</p>';
		return;
	}
	rd.innerHTML = '';
	prog.classList.remove('hidden');
	try {
		const res = await fetch('/api/scan', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path: scanPath, mode })
		});
		const d = await res.json();
		prog.classList.add('hidden');
		if (!res.ok) {
			rd.innerHTML = `<div class="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">${esc(d.error)}</div>`;
			return;
		}
		rd.innerHTML = `<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-800 text-sm"><p class="font-semibold mb-1">Scan complete</p><p>${esc(d.message)}</p><p class="mt-1 text-xs text-emerald-600">Project: ${d.totalProject} · Common: ${d.totalCommon}</p></div>`;
		loadSkills();
		loadProjects();
	} catch (e) {
		prog.classList.add('hidden');
		rd.innerHTML = `<div class="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">${esc(e.message)}</div>`;
	}
}

async function runCodeReview() {
	const base = document.getElementById('reviewBase')?.value.trim() || 'HEAD~1';
	const c = document.getElementById('reviewResult');
	if (!c) return;
	c.innerHTML = '<p class="text-slate-400 text-sm animate-pulse">Running review…</p>';
	try {
		const res = await fetch('/api/review', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ baseBranch: base })
		});
		const d = await res.json();
		if (!res.ok) {
			c.innerHTML = `<div class="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">${esc(d.error)}</div>`;
			return;
		}
		window._reviewData = d;
		c.innerHTML = `<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm"><p class="font-semibold mb-1">Review complete</p><p>Total issues: ${d.summary.totalIssues}</p><p>Critical: ${d.summary.critical} · High: ${d.summary.high}</p></div>`;
	} catch (e) {
		c.innerHTML = `<div class="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">${esc(e.message)}</div>`;
	}
}

function exportReview() {
	if (!window._reviewData) return;
	const a = Object.assign(document.createElement('a'), {
		href: URL.createObjectURL(new Blob([JSON.stringify(window._reviewData, null, 2)], { type: 'application/json' })),
		download: `skill-review-${Date.now()}.json`
	});
	a.click();
}

async function editSkill(id) {
	const s = allSkills.find(x => x.id === id);
	if (!s) return;
	await navigateToSection('add');
	document.getElementById('editId').value = id;
	document.getElementById('skillName').value = s.name || '';
	document.getElementById('skillDesc').value = s.description || '';
	document.getElementById('skillTemplate').value = s.template || '';
	document.getElementById('tmplCount').textContent = (s.template || '').length + ' chars';
	document.getElementById('skillParams').value = (s.parameters || []).map(p => p.name).join(', ');
	document.getElementById('formTitle').textContent = 'Edit Skill';
}

function resetForm() {
	['editId', 'skillName', 'skillDesc', 'skillTemplate', 'skillParams'].forEach(id => {
		const el = document.getElementById(id);
		if (el) el.value = '';
	});
	const count = document.getElementById('tmplCount');
	if (count) count.textContent = '0 chars';
	const title = document.getElementById('formTitle');
	if (title) title.textContent = 'New Skill';
	const msg = document.getElementById('formMsg');
	if (msg) msg.textContent = '';
}

async function saveSkill() {
	const id = document.getElementById('editId')?.value;
	const name = document.getElementById('skillName')?.value.trim();
	const template = document.getElementById('skillTemplate')?.value.trim();
	const description = document.getElementById('skillDesc')?.value.trim() || '';
	const paramsRaw = document.getElementById('skillParams')?.value.trim() || '';
	const msg = document.getElementById('formMsg');
	if (!msg) return;
	if (!name || !template) {
		msg.textContent = 'Name and template are required.';
		msg.className = 'mt-4 text-sm text-rose-600';
		return;
	}
	const parameters = paramsRaw ? paramsRaw.split(',').map(p => ({ name: p.trim(), description: p.trim() })) : [];
	const body = { name, template, description, parameters };
	const proj = currentProject ? `?project=${encodeURIComponent(currentProject)}` : '';
	try {
		const res = id
			? await fetch(`/api/skills/${encodeURIComponent(id)}${proj}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
			: await fetch(`/api/skills${proj}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		const d = await res.json();
		if (!res.ok) {
			msg.textContent = d.error || 'Failed to save';
			msg.className = 'mt-4 text-sm text-rose-600';
			return;
		}
		msg.textContent = id ? 'Skill updated.' : 'Skill created.';
		msg.className = 'mt-4 text-sm text-emerald-600';
		resetForm();
		loadSkills();
	} catch (e) {
		msg.textContent = e.message;
		msg.className = 'mt-4 text-sm text-rose-600';
	}
}

function openDel(id, name) {
	deleteTargetId = id;
	const nameEl = document.getElementById('deleteSkillName');
	if (nameEl) nameEl.textContent = name;
	document.getElementById('deleteModal')?.classList.remove('hidden');
}

function closeDeleteModal() {
	deleteTargetId = null;
	document.getElementById('deleteModal')?.classList.add('hidden');
}

async function confirmDelete() {
	if (!deleteTargetId) return;
	const proj = currentProject ? `?project=${encodeURIComponent(currentProject)}` : '';
	try {
		await fetch(`/api/skills/${encodeURIComponent(deleteTargetId)}${proj}`, { method: 'DELETE' });
		closeDeleteModal();
		loadSkills();
	} catch (e) {
		alert(e.message);
	}
}

async function loadDocs() {
	const listEl = document.getElementById('docsList');
	if (!listEl) return;
	try {
		const docs = await (await fetch('/api/docs')).json();
		if (!docs?.length) {
			listEl.innerHTML = '<div class="p-8 text-center text-slate-400 text-sm">No documents found.</div>';
			return;
		}
		listEl.innerHTML = docs.map(doc => `
			<button onclick="viewDoc('${doc.path.replace(/\\/g, '/')}')" class="doc-item w-full text-left p-4 hover:bg-slate-50 transition-colors group">
				<div class="text-sm font-medium text-slate-700 group-hover:text-slate-900">${esc(doc.name)}</div>
				<div class="text-xs text-slate-400 mt-1 font-mono">${esc(doc.path)}</div>
			</button>
		`).join('');
		if (!currentDocPath && docs[0]?.path) viewDoc(docs[0].path);
	} catch (e) {
		listEl.innerHTML = `<div class="p-8 text-center text-rose-500 text-sm">${esc(e.message)}</div>`;
	}
}

async function viewDoc(docPath) {
	currentDocPath = docPath;
	const viewer = document.getElementById('docViewer');
	const title = document.getElementById('docTitle');
	const pathEl = document.getElementById('docPath');
	if (!viewer || !title || !pathEl) return;
	viewer.innerHTML = '<div class="text-slate-400 text-sm">Loading document…</div>';
	try {
		const res = await fetch(`/api/docs/content?path=${encodeURIComponent(docPath)}`);
		const d = await res.json();
		if (!res.ok) throw new Error(d.error || 'Failed to load document');
		title.textContent = d.name || docPath.split('/').pop();
		pathEl.textContent = docPath;
		viewer.innerHTML = marked.parse(d.content || '');
		viewer.querySelectorAll('pre code').forEach(block => {
			if (typeof hljs !== 'undefined') hljs.highlightElement(block);
		});
	} catch (e) {
		viewer.innerHTML = `<div class="text-rose-500 text-sm">${esc(e.message)}</div>`;
	}
}

function copyDocCode(btn) {
	const code = btn?.parentElement?.querySelector('code');
	if (!code) return;
	navigator.clipboard.writeText(code.textContent || '').then(() => {
		const original = btn.textContent;
		btn.textContent = 'Copied';
		setTimeout(() => { btn.textContent = original; }, 1200);
	});
}

function esc(s) {
	return String(s || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
