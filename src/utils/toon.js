'use strict';

/**
 * TOON (Token-Oriented Object Notation)
 * Structured serialization for skills enabling field-weighted RAG indexing.
 *
 * Format:
 *   @SKILL[id:{id} sev:{severity} domain:{domain}]
 *   #NAME: {name}
 *   #DESC: {description}
 *   #TAGS: tag1,tag2,tag3
 *   #RULE:
 *   {rule content}
 *   #EXAMPLES:
 *   {code examples}
 *   #CHECKLIST:
 *   {checklist items}
 *   @END
 */

function encode(skill) {
  const id = skill.id || '';
  const sev = skill.severity || 'medium';
  const domain = (skill.domain || '').replace(/\s+/g, '-').toLowerCase();
  const name = skill.name || '';
  const desc = skill.description || '';
  const tags = Array.isArray(skill.tags) ? skill.tags.join(',') : (skill.tags || '');
  const template = skill.template || '';

  // Extract examples and checklist sections from template
  const examples = _extractSection(template, 'example', '```');
  const checklist = _extractChecklist(template);
  const rule = _extractRule(template);

  let out = `@SKILL[id:${id} sev:${sev} domain:${domain}]\n`;
  out += `#NAME: ${name}\n`;
  out += `#DESC: ${desc}\n`;
  out += `#TAGS: ${tags}\n`;
  if (rule) out += `#RULE:\n${rule}\n`;
  if (examples) out += `#EXAMPLES:\n${examples}\n`;
  if (checklist) out += `#CHECKLIST:\n${checklist}\n`;
  out += `@END`;
  return out;
}

function decode(toonStr) {
  const skill = {};

  const header = toonStr.match(/@SKILL\[([^\]]+)\]/);
  if (header) {
    const attrs = header[1];
    const idMatch = attrs.match(/id:(\S+)/);
    const sevMatch = attrs.match(/sev:(\S+)/);
    const domainMatch = attrs.match(/domain:(\S+)/);
    if (idMatch) skill.id = idMatch[1];
    if (sevMatch) skill.severity = sevMatch[1];
    if (domainMatch) skill.domain = domainMatch[1].replace(/-/g, ' ');
  }

  skill.name = _field(toonStr, 'NAME') || '';
  skill.description = _field(toonStr, 'DESC') || '';
  const tagsStr = _field(toonStr, 'TAGS') || '';
  skill.tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

  const sectionTexts = {};
  for (const sec of ['RULE', 'EXAMPLES', 'CHECKLIST']) {
    sectionTexts[sec] = _section(toonStr, sec) || '';
  }
  skill.template = [sectionTexts.RULE, sectionTexts.EXAMPLES, sectionTexts.CHECKLIST]
    .filter(Boolean).join('\n\n');

  return skill;
}

function sections(toonStr) {
  const s = decode(toonStr);
  return {
    id: s.id || '',
    name: s.name || '',
    desc: s.description || '',
    tags: s.tags || [],
    rule: _section(toonStr, 'RULE') || '',
    examples: _section(toonStr, 'EXAMPLES') || '',
    checklist: _section(toonStr, 'CHECKLIST') || '',
    severity: s.severity || 'medium',
    domain: s.domain || '',
  };
}

/**
 * Produce field-weighted text for TF-IDF indexing.
 * Weights: name×3, tags×2, description×2, template×1
 * No changes to tfidf.js needed — weighting done by token repetition.
 */
function toWeightedText(skill) {
  const name = skill.name || '';
  const tags = Array.isArray(skill.tags) ? skill.tags.join(' ') : (skill.tags || '');
  const desc = skill.description || '';
  const template = skill.template || '';
  const id = skill.id || '';

  const parts = [
    id, id, id,
    name, name, name,
    tags, tags,
    desc, desc,
    template,
  ];
  return parts.filter(Boolean).join('\n');
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _field(str, name) {
  const re = new RegExp(`#${name}:\\s*([^\\n]+)`);
  const m = str.match(re);
  return m ? m[1].trim() : null;
}

function _section(str, name) {
  const re = new RegExp(`#${name}:\\s*\\n([\\s\\S]*?)(?=#[A-Z]|@END)`, 'i');
  const m = str.match(re);
  return m ? m[1].trim() : null;
}

function _extractRule(template) {
  // Grab content before the first ### code block or checklist
  const checklistIdx = template.indexOf('### Checklist');
  const exampleIdx = template.search(/```/);
  let end = template.length;
  if (checklistIdx > -1) end = Math.min(end, checklistIdx);
  if (exampleIdx > -1) end = Math.min(end, exampleIdx);
  return template.slice(0, end).trim().slice(0, 800);
}

function _extractSection(template, keyword, marker) {
  const lines = template.split('\n');
  const out = [];
  let inBlock = false;
  for (const line of lines) {
    if (line.startsWith(marker)) inBlock = !inBlock;
    if (inBlock || (line.toLowerCase().includes(keyword) && !line.startsWith('#'))) {
      out.push(line);
    }
    if (out.length > 40) break;
  }
  return out.join('\n').trim();
}

function _extractChecklist(template) {
  const lines = template.split('\n');
  return lines.filter(l => l.trim().startsWith('- [ ]') || l.trim().startsWith('- [x]'))
    .join('\n').trim();
}

module.exports = { encode, decode, sections, toWeightedText };
