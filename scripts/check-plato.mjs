/** Editorial integrity checks for immersive profiles. Run after npm install. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const nativeRequire = createRequire(import.meta.url);
const cache = new Map();
function loadTs(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    fileName: filename,
  });
  const module = { exports: {} };
  cache.set(filename, module);
  const localRequire = specifier => specifier.startsWith('.')
    ? loadTs(path.resolve(path.dirname(filename), `${specifier.replace(/\.ts$/, '')}.ts`))
    : nativeRequire(specifier);
  vm.runInThisContext(`(function(exports, require, module) {\n${compiled.outputText}\n})`, { filename })(module.exports, localRequire, module);
  return module.exports;
}
const { immersiveProfiles } = loadTs(path.join(root, 'src/data/immersive-profiles.ts'));
assert(Array.isArray(immersiveProfiles) && immersiveProfiles.length > 0, 'Immersive profile registry must not be empty');
const profileNames = immersiveProfiles.map(profile => profile.id);
assert(new Set(profileNames).size === profileNames.length, 'Immersive profile registry IDs must be unique');
const requested = process.argv.find(arg => arg.startsWith('--profile='))?.split('=')[1];
assert(!requested || profileNames.includes(requested), `Use --profile=<id>; registered profiles: ${profileNames.join(', ')}`);
const profiles = requested ? immersiveProfiles.filter(profile => profile.id === requested) : immersiveProfiles;
const { philosophers } = loadTs(path.join(root, 'src/data/philosophers.ts'));
const catalogueIds = new Set(philosophers.map(p => p.id));
const errors = [];
let checks = 0, currentProfile = 'catalogue';
function check(condition, message) { checks++; if (!condition) errors.push(`${currentProfile}: ${message}`); }
const filled = value => typeof value === 'string' && value.trim().length > 0;
function idsOf(items, kind) {
  const ids = new Set(items.map(item => item.id));
  check(ids.size === items.length, `${kind}: IDs must be unique`);
  check(items.every(item => /^[a-z][a-z0-9-]*$/.test(item.id)), `${kind}: IDs must be URL-safe slugs`);
  return ids;
}
function https(url, context) {
  let valid = false;
  try { valid = new URL(url).protocol === 'https:'; } catch {}
  check(valid, `${context}: expected valid HTTPS URL (${url})`);
}
function asset(file, context) {
  check(filled(file) && file.startsWith('/') && !file.includes('..'), `${context}: invalid local image path`);
  if (!filled(file)) return;
  const filename = path.join(root, 'public', file);
  const exists = fs.existsSync(filename);
  check(exists, `${context}: local image missing (${file})`);
  if (!exists) return;
  const bytes = fs.readFileSync(filename);
  check(bytes.length > 0, `${context}: local image must not be empty (${file})`);
  if (path.extname(file).toLowerCase() === '.webp') {
    const validHeader = bytes.length >= 20
      && bytes.toString('ascii', 0, 4) === 'RIFF'
      && bytes.toString('ascii', 8, 12) === 'WEBP'
      && bytes.readUInt32LE(4) + 8 === bytes.length;
    check(validHeader, `${context}: invalid RIFF/WEBP container header or size (${file})`);
  }
}
const summaries = [];
for (const profile of profiles) {
currentProfile = profile.id;
const startingChecks = checks;
check(/^[a-z][a-z0-9-]*$/.test(profile.id), 'Profile identity must be a URL-safe slug');
for (const field of ['name', 'latinName', 'dates', 'subtitle', 'introduction']) check(filled(profile[field]), `Profile requires ${field}`);
check(filled(profile.narrativeNotice), 'Fictional first-person narration requires a visible editorial notice');
check(catalogueIds.has(profile.id), 'Immersive profile must exist in the original catalogue');
check(fs.existsSync(path.join(root, `src/app/philosophers/${profile.id}/page.tsx`)), 'Direct App Router page must exist');
check(profile.sources.some(source => source.kind === 'primary') && profile.sources.some(source => source.kind === 'academic'), 'Sources must include primary texts and academic context');
check(profile.chapters.length === 5, 'Expected five biography chapters');
check(profile.ideas.length === 5, 'Expected five ideas');
check(profile.works.length === 5, 'Expected five works');
check(profile.questions.length === 8, 'Expected eight interactive questions');
check(profile.dilemmaIds.length === 3 && new Set(profile.dilemmaIds).size === 3, 'Expected three distinct dilemmas');
asset(profile.portrait, 'Profile portrait');
const sourceIds = idsOf(profile.sources, 'Sources');
const themeIds = idsOf(profile.themes, 'Themes');
const workIds = idsOf(profile.works, 'Works');
const questionIds = idsOf(profile.questions, 'Questions');
const personIds = idsOf(profile.people, 'Graph people');
idsOf(profile.chapters, 'Chapters'); idsOf(profile.ideas, 'Ideas'); idsOf(profile.connections, 'Connections');
check(personIds.has(profile.id), `Graph must contain ${profile.id}`);
check(profile.people[0]?.id === profile.id, 'Graph must place the featured philosopher first for the central map position');
if (profile.id !== 'plato') {
  for (const section of ['biography', 'ideas', 'books', 'connections', 'conversations']) {
    for (const field of ['eyebrow', 'title', 'description']) check(filled(profile.pageCopy?.[section]?.[field]), `${section}: profile-specific ${field} required to avoid Plato fallback text`);
    check(filled(profile.pageCopy?.nav?.[section]), `${section}: profile-specific navigation required`);
  }
  for (const field of ['sourceDescription', 'workLabel', 'recommendationLabel', 'narrativeLabel']) check(filled(profile.pageCopy?.[field]), `Profile-specific ${field} required`);
}
function references(item, context) {
  check(Array.isArray(item.sourceIds) && item.sourceIds.length > 0, `${context}: source references required`);
  for (const id of item.sourceIds ?? []) check(sourceIds.has(id), `${context}: unknown source ${id}`);
}
for (const source of profile.sources) {
  https(source.url, source.id);
  check(filled(source.title), `${source.id}: missing source title`);
  check(['primary', 'academic', 'reference'].includes(source.kind), `${source.id}: unsupported source kind`);
}
for (const theme of profile.themes) {
  if (theme.image) asset(theme.image, theme.id);
  for (const field of ['gradient', 'text', 'accent']) check(filled(theme[field]), `${theme.id}: missing ${field}`);
  check(Number.isFinite(theme.overlay) && theme.overlay >= 0 && theme.overlay <= 1, `${theme.id}: overlay must be between zero and one`);
}
for (const chapter of profile.chapters) {
  for (const field of ['number', 'title', 'teaser', 'period']) check(filled(chapter[field]), `${chapter.id}: missing ${field}`);
  references(chapter, chapter.id);
  check(themeIds.has(chapter.themeId), `${chapter.id}: unknown theme`);
  check(chapter.paragraphs.length >= 3 && chapter.paragraphs.every(filled), `${chapter.id}: biography requires a substantive multi-paragraph story`);
  check(['established', 'qualified', 'disputed'].includes(chapter.confidence), `${chapter.id}: invalid historical confidence`);
  if (chapter.confidence !== 'established') check(filled(chapter.note), `${chapter.id}: qualified chronology needs an editorial note`);
}
for (const idea of profile.ideas) {
  for (const field of ['number', 'title', 'teaser', 'symbol']) check(filled(idea[field]), `${idea.id}: missing ${field}`);
  references(idea, idea.id);
  check(themeIds.has(idea.themeId), `${idea.id}: unknown visual theme`);
  check(idea.paragraphs.length >= 3 && idea.paragraphs.every(filled), `${idea.id}: missing developed explanation`);
  check(questionIds.has(idea.questionId), `${idea.id}: missing interactive question`);
  check(idea.workIds.length > 0 && idea.workIds.every(id => workIds.has(id)), `${idea.id}: missing or unknown referenced work`);
}
check(new Set(profile.ideas.map(i => i.themeId)).size === 5, 'Each idea must have its own visual atmosphere');
for (const work of profile.works) {
  references(work, work.id); https(work.readingUrl, work.id);
  for (const field of ['title', 'subtitle', 'recommendation', 'description', 'whyRead']) check(filled(work[field]), `${work.id}: missing ${field}`);
  check(work.questions.length > 0 && work.questions.every(filled) && work.keyIdeas.length > 0 && work.keyIdeas.every(filled), `${work.id}: missing questions or key ideas`);
  if (work.author !== undefined) check(filled(work.author), `${work.id}: author label must not be empty`);
}
for (const question of profile.questions) {
  references(question, question.id); idsOf(question.options, `${question.id} options`);
  check(filled(question.title) && filled(question.prompt), `${question.id}: missing question title or dilemma`);
  check(question.options.length >= 2, `${question.id}: needs at least two choices`);
  check(new Set(question.options.map(o => o.response)).size === question.options.length, `${question.id}: choices need distinct responses`);
  for (const option of question.options) {
    check(filled(option.label) && filled(option.response), `${question.id}/${option.id}: empty choice or reaction`);
    check(!['correct', 'isCorrect', 'score'].some(field => field in option), `${question.id}/${option.id}: conversations must not grade choices`);
  }
}
for (const id of profile.dilemmaIds) check(questionIds.has(id), `Dilemma ${id} missing`);
for (const person of profile.people) {
  for (const field of ['name', 'dates', 'summary']) check(filled(person[field]), `${person.id}: missing ${field}`);
  check(['person', 'school'].includes(person.kind), `${person.id}: invalid graph node kind`);
  if (person.portrait) asset(person.portrait, person.id);
  if (person.href) {
    const match = person.href.match(/(?:#philosopher\/|\/philosophers\/)([a-z0-9-]+)\/?$/);
    check(Boolean(match && catalogueIds.has(match[1])), `${person.id}: linked philosopher page does not exist (${person.href})`);
    if (match) check(match[1] === person.id, `${person.id}: link destination must match the actual graph person`);
  }
}
for (const connection of profile.connections) {
  references(connection, connection.id);
  check(personIds.has(connection.source) && personIds.has(connection.target), `${connection.id}: unknown endpoint`);
  check(connection.source !== connection.target, `${connection.id}: graph self-link`);
  check(['teaching', 'influence', 'criticism', 'development', 'association'].includes(connection.type), `${connection.id}: invalid relationship type`);
  check(['established', 'qualified', 'disputed'].includes(connection.confidence), `${connection.id}: invalid confidence`);
  check(filled(connection.description), `${connection.id}: missing explanation`);
}
if (profile.id === 'plato') {
check(new Set(profile.connections.map(c => c.type)).size === 4, 'Graph must distinguish all four relationship types');
check(profile.connections.some(c => c.source === 'socrates' && c.target === 'plato' && c.type === 'teaching'), 'Teacher direction: Socrates → Plato');
check(profile.connections.some(c => c.source === 'plato' && c.target === 'aristotle' && c.type === 'teaching'), 'Teacher direction: Plato → Aristotle');
check(profile.connections.some(c => c.source === 'aristotle' && c.target === 'plato' && c.type === 'criticism'), 'Criticism direction: Aristotle → Plato');
check(profile.connections.some(c => c.source === 'plato' && c.target === 'plotinus' && c.type === 'development'), 'Reception direction: Plato → Plotinus');
check(!profile.connections.some(c => c.type === 'teaching' && ['plotinus', 'pythagorean', 'pythagoreans', 'parmenides'].some(id => [c.source, c.target].includes(id))), 'Do not assert undocumented personal teaching relationships');
}
if (profile.id === 'socrates') {
  check(Boolean(profile.pageCopy), 'Socrates requires profile-specific section copy');
  check(profile.works.every(work => filled(work.author) && !/^Сократ$/i.test(work.author.trim())), 'Every Socrates recommendation must identify the actual author');
  check(!/^Мои книги[.!]?$/i.test(profile.pageCopy?.books?.title ?? ''), 'Socrates books heading must not claim authorship');
  check(!/^Мои книги[.!]?$/i.test(profile.pageCopy?.nav?.books ?? ''), 'Socrates books navigation must not claim authorship');
  check(profile.connections.some(c => c.source === 'socrates' && c.target === 'plato'), 'Socratic reception direction: Socrates → Plato');
  check(!profile.connections.some(c => c.type === 'teaching' && c.source === 'plato' && c.target === 'socrates'), 'Do not reverse Socrates and Plato teaching direction');
}
for (const school of profile.schools) references(school, school.id);
if (process.argv.includes('--build')) {
  const route = path.join(root, `out/philosophers/${profile.id}/index.html`);
  check(fs.existsSync(route), `Static export must contain /philosophers/${profile.id}/`);
  if (fs.existsSync(route)) {
    const html = fs.readFileSync(route, 'utf8');
    check(html.includes(profile.name), `Exported page must contain ${profile.name} in its HTML`);
    const visibleMarkup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    check(new RegExp(`<h1[^>]*id=\"plato-title\"[^>]*>[\\s\\S]*?${profile.name}[\\s\\S]*?<\\/h1>`).test(visibleMarkup), `Exported page must render the ${profile.name} heading, not a fallback 404`);
  }
}
summaries.push(`${profile.id}: ${checks - startingChecks} checks, ${profile.chapters.length} chapters, ${profile.ideas.length} ideas, ${profile.works.length} books, ${profile.questions.length} conversations, ${profile.connections.length} relationships`);
}
if (errors.length) {
  console.error(`FAIL: ${errors.length}/${checks} checks failed:\n${errors.map(e => `- ${e}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`PASS: ${checks} integrity checks.\n${summaries.join('\n')}.`);
}
