# TOON Format Specification

**TOON** (Token-Oriented Object Notation) is skill-brain's structured serialization for skills. It enables field-weighted TF-IDF indexing without any changes to the underlying TF-IDF engine.

## Format

```
@SKILL[id:{id} sev:{severity} domain:{domain}]
#NAME: {name}
#DESC: {description}
#TAGS: tag1,tag2,tag3
#RULE:
{rule/template content}
#EXAMPLES:
{code examples extracted from template}
#CHECKLIST:
{- [ ] checklist items}
@END
```

## Example

```
@SKILL[id:fg-css-specificity sev:high domain:frontend-development-guidelines]
#NAME: CSS Specificity — Be Specific Not Over-Specific
#DESC: Use the minimum specificity needed. Avoid ID selectors, avoid chaining 4+ classes.
#TAGS: css,specificity,selectors,performance,maintainability,override,cascade
#RULE:
Rules:
- Prefer class selectors over element or ID
- Never use ID selectors for styling (#id)
- Never chain more than 3 classes
- Never use !important in component CSS
#EXAMPLES:
.nav-link--active { color: var(--color-accent); }
.card__text { font-size: var(--text-sm); }
#CHECKLIST:
- [ ] No ID selectors used for styling
- [ ] Max 3 selectors chained in any rule
- [ ] No !important in component styles
- [ ] New styles can be overridden without fighting specificity
@END
```

## Field Weighting Table

| Field | Weight | Purpose |
|-------|--------|---------|
| `id` tokens | 3× | Exact-match skill ID lookup |
| `name` tokens | 3× | Primary label match |
| `tags` tokens | 2× | Category and keyword match |
| `description` | 2× | Summary match |
| `rule/template` | 1× | Full-text match |

Weighting is implemented by physically repeating tokens in the text fed to TF-IDF (`toWeightedText()` in `toon.js`). The TF-IDF engine (`tfidf.js`) requires no changes.

## API (`toon.js`)

```js
const { encode, decode, sections, toWeightedText } = require('./toon');

// Encode a skill object to TOON string
const toonStr = encode(skill);

// Decode a TOON string back to a skill object
const skill = decode(toonStr);

// Parse into named section fields
const { id, name, desc, tags, rule, examples, checklist, severity, domain } = sections(toonStr);

// Produce field-weighted text for TF-IDF indexing (most important)
const weightedText = toWeightedText(skill);
```

## Integration Point

`ragIndex.js` calls `toWeightedText(skill)` instead of the previous flat join:

```js
// Before:
text: [s.name, s.description || '', s.template || ''].join('\n')

// After (TOON-weighted):
text: toWeightedText(s)
```

This single change improves search result ranking for all skill queries.
