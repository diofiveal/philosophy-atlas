/** Component interaction tests in jsdom. No browser, layout, or screenshots. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const reduced = process.argv.includes('--reduced');
const dom = new JSDOM('<!doctype html><html><body><div id="test-root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const window = dom.window;
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'SVGElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'MutationObserver', 'Event', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle']) global[key] = key === 'window' ? window : typeof window[key] === 'function' && key === 'getComputedStyle' ? window[key].bind(window) : window[key];
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = query => ({ matches: query.includes('prefers-reduced-motion') && reduced, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
global.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
class ResizeObserver { observe() {} unobserve() {} disconnect() {} }
window.ResizeObserver = global.ResizeObserver = ResizeObserver;
window.HTMLElement.prototype.scrollIntoView = function() {};
window.scrollTo = function() {};
const project = path.resolve(__dirname, '..');
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...args) { return resolveFilename.call(this, request.startsWith('@/') ? path.join(project, 'src', request.slice(2)) : request, parent, ...args); };
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename }).outputText, filename);
require.extensions['.css'] = () => {};
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { default: PhilosopherPage, BiographyAccordion, PhilosophyIdeaCard, BooksGallery, IdeaDialogue } = require('../src/components/plato/PlatoPage.tsx');
const Map = require('../src/components/plato/PhilosophyConnectionsMap.tsx').default;
const { immersiveProfiles } = require('../src/data/immersive-profiles.ts');
const profileNames = immersiveProfiles.map(profile => profile.id);
const requested = process.argv.find(arg => arg.startsWith('--profile='))?.split('=')[1];
if (requested && !profileNames.includes(requested)) throw new Error(`Use --profile=<id>; registered profiles: ${profileNames.join(', ')}`);
const profiles = requested ? immersiveProfiles.filter(profile => profile.id === requested) : immersiveProfiles;
const container = document.getElementById('test-root');
let root, checks = 0;
function check(condition, message) { checks++; if (!condition) throw new Error(message); }
const text = element => element?.textContent ?? '';
const findButton = (label, within = container) => [...within.querySelectorAll('button')].find(button => text(button).includes(label));
async function flush(ms = 40) { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); }
async function render(element) { if (root) await act(async () => root.unmount()); container.innerHTML = ''; root = createRoot(container); await act(async () => root.render(element)); await flush(); }
async function click(element) { check(Boolean(element), 'Expected clickable element'); await act(async () => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); }
async function key(element, value) { check(Boolean(element), 'Expected keyboard target'); await act(async () => element.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }))); }
async function chapterTests(profile) {
  function Harness() { const [active, setActive] = React.useState(null); return React.createElement(BiographyAccordion, { profile, activeId: active, onChange: chapter => setActive(chapter?.id ?? null) }); }
  await render(React.createElement(Harness));
  check(container.querySelectorAll('[aria-expanded="true"]').length === 0, 'Biography starts with all chapters closed');
  for (const chapter of profile.chapters) {
    const trigger = container.querySelector(`#chapter-trigger-${chapter.id}`);
    await click(trigger);
    check(trigger.getAttribute('aria-expanded') === 'true', `Chapter ${chapter.id} opens`);
    check(container.querySelectorAll('[aria-expanded="true"]').length === 1, 'Only one chapter is expanded');
    check(text(container.querySelector(`#chapter-panel-${chapter.id}`)).includes(chapter.paragraphs[0]), `Chapter ${chapter.id} story is rendered`);
    check(container.querySelector('.plato-biography-stage [data-theme-id]').dataset.themeId === chapter.themeId, `Chapter ${chapter.id} selects its own backdrop`);
    await click(trigger);
    check(trigger.getAttribute('aria-expanded') === 'false', `Chapter ${chapter.id} closes`);
    check(!trigger.hasAttribute('aria-controls'), 'Closed trigger does not reference absent content');
  }
  for (const index of [0, 4, 1]) await click(container.querySelector(`#chapter-trigger-${profile.chapters[index].id}`));
  check(container.querySelector(`#chapter-trigger-${profile.chapters[1].id}`).getAttribute('aria-expanded') === 'true', 'Rapid chapter sequence ends at intended chapter');
  check(container.querySelectorAll('.plato-scene-layer').length <= 2, 'Rapid switching retains at most two backdrop layers');
  check([...container.querySelectorAll('[aria-hidden="true"].plato-chapter-panel')].every(panel => panel.hasAttribute('inert')), 'Exiting chapter panels are inert');
  const first = container.querySelector(`#chapter-trigger-${profile.chapters[0].id}`);
  first.focus(); await key(first, 'End');
  check(document.activeElement.id === `chapter-trigger-${profile.chapters.at(-1).id}`, 'End focuses final chapter');
  await key(document.activeElement, 'Home');
  check(document.activeElement === first, 'Home focuses first chapter');
  await click(findButton('Дальше'));
  check(container.querySelector(`#chapter-trigger-${profile.chapters[2].id}`).getAttribute('aria-expanded') === 'true', 'Next chapter navigation opens adjacent chapter');
  await click(findButton('Назад'));
  check(container.querySelector(`#chapter-trigger-${profile.chapters[1].id}`).getAttribute('aria-expanded') === 'true', 'Previous chapter navigation works');
}
async function ideaTests(profile) {
  for (const idea of profile.ideas) {
    function Harness() { const [active, setActive] = React.useState(false); return React.createElement(PhilosophyIdeaCard, { idea, profile, active, onToggle: () => setActive(value => !value) }); }
    await render(React.createElement(Harness));
    const trigger = container.querySelector(`#idea-trigger-${idea.id}`);
    await click(trigger);
    check(trigger.getAttribute('aria-expanded') === 'true', `${idea.id}: idea opens`);
    check(container.querySelector('[data-theme-id]').dataset.themeId === idea.themeId, `${idea.id}: own theme is selected`);
    if (reduced) check(container.querySelectorAll('.plato-idea-prose > p').length === idea.paragraphs.length, `${idea.id}: reduced motion reveals full story immediately`);
    else {
      const showAll = findButton('Показать весь рассказ');
      if (showAll && !showAll.disabled) await click(showAll);
      check(container.querySelectorAll('.plato-idea-prose > p').length === idea.paragraphs.length, `${idea.id}: skip shows entire story`);
    }
    check(container.querySelector(`[data-testid="dialogue-${idea.questionId}"]`), `${idea.id}: interactive question is present`);
    await click(container.querySelector('.plato-dialogue-options button'));
    await flush(reduced ? 50 : 240);
    check(text(container.querySelector('.plato-response-name')) === `${profile.name.toLocaleUpperCase('ru-RU')} ОТВЕЧАЕТ`, `${idea.id}: embedded question uses the current philosopher`);
    await click(trigger);
    check(trigger.getAttribute('aria-expanded') === 'false', `${idea.id}: idea closes`);
    const exiting = container.querySelector('.plato-idea-panel');
    check(!exiting || exiting.hasAttribute('inert'), `${idea.id}: exiting content is inert`);
    await flush(reduced ? 50 : 320);
    await click(trigger);
    check(!container.querySelector('.plato-dialogue-options [aria-pressed="true"]'), `${idea.id}: reopening starts a fresh reflection`);
  }
}
async function bookTests(profile) {
  await render(React.createElement(BooksGallery, { profile }));
  if (profile.pageCopy?.books) check(text(container.querySelector('#plato-books-title')) === profile.pageCopy.books.title, 'Books use the current philosopher’s section heading');
  const tabs = [...container.querySelectorAll('[role="tab"]')];
  check(tabs.length === 5, 'Five book tabs rendered');
  for (let i = 0; i < tabs.length; i++) {
    await click(tabs[i]); await flush(reduced ? 50 : 260);
    check(tabs[i].getAttribute('aria-selected') === 'true', `Book ${i + 1} selected`);
    check(text(container.querySelector('[role="tabpanel"]')).includes(profile.works[i].recommendation), `Book ${i + 1} recommendation changes`);
    check(container.querySelector('[role="tabpanel"] a').href === profile.works[i].readingUrl, `Book ${i + 1} primary text link`);
    if (profile.works[i].author) check(text(container.querySelector('.plato-book-author')).includes(profile.works[i].author), `Book ${i + 1} credits its author`);
  }
  await key(tabs.at(-1), 'Home'); await flush(reduced ? 50 : 240);
  check(document.activeElement === tabs[0] && tabs[0].getAttribute('aria-selected') === 'true', 'Book Home selects/focuses first tab');
  await key(tabs[0], 'ArrowRight'); await flush(reduced ? 50 : 240);
  check(document.activeElement === tabs[1] && tabs[1].getAttribute('aria-selected') === 'true', 'Book Right selects/focuses next tab');
  await key(tabs[1], 'End');
  check(document.activeElement === tabs.at(-1), 'Book End focuses last tab');
}
async function dialogueTests(profile) {
  for (const question of profile.questions) {
    await render(React.createElement(IdeaDialogue, { question, speaker: profile.name }));
    const options = [...container.querySelectorAll('.plato-dialogue-options button')];
    for (let i = 0; i < options.length; i++) {
      await click(options[i]); await flush(reduced ? 50 : 240);
      check(text(container.querySelector('.plato-response-name')) === `${profile.name.toLocaleUpperCase('ru-RU')} ОТВЕЧАЕТ`, `${question.id}: response identifies the current philosopher`);
      check(options[i].getAttribute('aria-pressed') === 'true', `${question.id}: selected choice ${i + 1} marked`);
      check(text(container.querySelector('[aria-live="polite"]')).includes(question.options[i].response), `${question.id}: choice ${i + 1} yields its own reaction`);
    }
    await click(findButton('Подумать заново'));
    check(options.every(option => option.getAttribute('aria-pressed') === 'false'), `${question.id}: reset clears choice`);
    check(document.activeElement === options[0], `${question.id}: reset restores keyboard focus`);
  }
}
async function mapTests(profile) {
  const opened = [];
  await render(React.createElement(Map, { profile, onOpenPhilosopher: id => opened.push(id) }));
  const listButtons = () => [...container.querySelectorAll('.connection-accessible-list button')];
  check(listButtons().length === profile.connections.length, 'All profile relationships are listed');
  for (const [index, connection] of profile.connections.entries()) {
    const button = listButtons()[index];
    check(text(button).includes(connection.label), `Graph list exposes relationship ${connection.id}`);
    check(text(button.querySelector('strong')).includes(connection.type === 'association' ? '↔' : '→'), `${connection.id}: graph list distinguishes association from directed influence`);
    await click(button);
    check(text(container.querySelector('.connection-detail')).includes(connection.description), `Graph selection ${connection.id} updates details`);
  }
  const navigable = profile.connections.find(connection => {
    const otherId = connection.source === profile.id ? connection.target : connection.source;
    return profile.people.find(person => person.id === otherId)?.href;
  });
  let targetId;
  if (navigable) {
    await click(listButtons()[profile.connections.indexOf(navigable)]);
    await click(findButton('Открыть страницу', container.querySelector('.connection-detail')));
    targetId = navigable.source === profile.id ? navigable.target : navigable.source;
    check(opened[0] === targetId, 'Existing philosopher link calls actual catalogue target');
  } else {
    check(!findButton('Открыть страницу', container.querySelector('.connection-detail')), 'A graph without catalogue destinations does not offer a dead navigation link');
    check(opened.length === 0, 'A graph without catalogue destinations does not call navigation');
    const connection = profile.connections[0];
    targetId = connection.source === profile.id ? connection.target : connection.source;
  }
  const filters = [...container.querySelectorAll('.connection-filters button')];
  for (const filter of filters) await click(filter);
  check(listButtons().length === 0, 'All filters off hides relationships');
  check(text(container.querySelector('.connection-detail')).includes('Все типы связей скрыты'), 'All filters off shows useful empty state');
  const criticismFilter = filters.find(button => text(button).includes('Философская критика'));
  await click(criticismFilter);
  const criticism = profile.connections.filter(connection => connection.type === 'criticism');
  check(listButtons().length === criticism.length, 'Criticism-only filter shows the actual profile relationships');
  check(listButtons().every(button => criticism.some(connection => text(button).includes(connection.label))), 'Criticism filter does not leak another relationship type');
  for (const filter of filters.filter(button => button !== criticismFilter)) await click(filter);
  const keyboardPerson = profile.people.find(person => person.id === targetId);
  const graphNode = [...container.querySelectorAll('.connection-person')].find(node => node.getAttribute('aria-label')?.startsWith(`${keyboardPerson.name}.`));
  await key(graphNode, 'Enter');
  check(text(container.querySelector('.connection-detail h3')) === keyboardPerson.name, 'Keyboard activation of graph node updates selected relationship');
  if (profile.id === 'plato') {
    const aristotle = container.querySelector('.connection-person[aria-label^="Аристотель"]');
    await key(aristotle, 'Enter');
    check(text(container.querySelector('.connection-detail h3')) === 'Аристотель', 'Plato regression: Aristotle keyboard selection');
  }
  const controls = [...container.querySelectorAll('.react-flow__controls button')];
  check(controls.some(button => button.getAttribute('aria-label') === 'Увеличить карту'), 'Zoom controls have Russian accessible names');
}
/** A single mounted route changes profiles, as Atlas does during catalogue navigation. */
async function profileSwitchTests() {
  const before = checks;
  const scrolled = [];
  const previousScroll = window.HTMLElement.prototype.scrollIntoView;
  window.HTMLElement.prototype.scrollIntoView = function() { scrolled.push(this.id); };
  let backCount = 0, saveCount = 0;
  const page = profile => React.createElement(PhilosopherPage, {
    profile, saved: false, onBack: () => backCount++, onToggleSaved: () => saveCount++, onOpenPhilosopher() {},
  });
  const verifyFresh = profile => {
    check(container.querySelector(`[data-testid="${profile.id}-page"]`), `${profile.id}: correct immersive profile mounted`);
    check(text(container.querySelector('h1')).includes(profile.name), `${profile.id}: heading changes to current philosopher`);
    check(text(container.querySelector('.plato-narrative-notice')).includes(profile.narrativeNotice), `${profile.id}: narration notice follows profile`);
    check(container.querySelectorAll('[aria-expanded="true"]').length === 0, `${profile.id}: biography and idea selection reset`);
    check(container.querySelector('[role="tab"][aria-selected="true"]').id === `book-tab-${profile.works[0].id}`, `${profile.id}: book selection resets to first work`);
    check(!container.querySelector('.plato-response-name'), `${profile.id}: dialogue choices reset`);
    check(container.querySelector('.plato-page').dataset.activeTheme === profile.chapters[0].themeId, `${profile.id}: page atmosphere resets`);
  };
  try {
    await render(page(profiles[0]));
    for (const [index, profile] of profiles.entries()) {
      verifyFresh(profile);
      await click(container.querySelector(`#chapter-trigger-${profile.chapters.at(-1).id}`));
      await click(container.querySelector(`#idea-trigger-${profile.ideas[0].id}`));
      await click(container.querySelectorAll('[role="tab"]')[4]);
      await click(container.querySelector('.plato-dilemmas .plato-dialogue-options button'));
      check(container.querySelector('.plato-dilemmas [aria-pressed="true"]'), `${profile.id}: route has a selected dialogue before switching`);
      await act(async () => root.render(page(profiles[(index + 1) % profiles.length])));
      await flush(reduced ? 50 : 300);
    }
    verifyFresh(profiles[0]);
    const sectionIds = ['plato-biography', 'plato-ideas', 'plato-books', 'plato-connections', 'plato-conversations'];
    const nav = [...container.querySelectorAll('.plato-section-nav button')];
    check(nav.length === sectionIds.length, 'All five section navigation buttons are present');
    for (let index = 0; index < nav.length; index++) {
      await click(nav[index]);
      check(scrolled.at(-1) === sectionIds[index], 'Section navigation scrolls to its mounted target');
    }
    await click(container.querySelector('.plato-save'));
    await click(container.querySelector('.back-link'));
    check(saveCount === 1 && backCount === 1, 'Save and return-to-catalogue delegate to Atlas callbacks');
    for (const [index, profile] of profiles.entries()) {
      await render(React.createElement(Map, { profile, onOpenPhilosopher() {} }));
      for (const filter of container.querySelectorAll('.connection-filters button')) await click(filter);
      const other = profiles[(index + 1) % profiles.length];
      await act(async () => root.render(React.createElement(Map, { profile: other, onOpenPhilosopher() {} })));
      await flush();
      check(container.querySelectorAll('.connection-accessible-list button').length === other.connections.length, `${profile.id} → ${other.id}: graph filters reset`);
      check([...container.querySelectorAll('.connection-filters button')].every(button => button.getAttribute('aria-pressed') === 'true'), 'Graph filter state belongs to the current profile');
      check(container.querySelector(`.connection-canvas[aria-label="Интерактивная карта: ${other.name}"]`), 'Graph accessible name follows current profile');
    }
    console.log(`PASS: ${checks - before} cross-profile route/reset/navigation assertions.`);
  } finally { window.HTMLElement.prototype.scrollIntoView = previousScroll; }
}
(async () => {
  try {
    for (const profile of profiles) {
      const before = checks;
      await chapterTests(profile); await ideaTests(profile); await bookTests(profile); await dialogueTests(profile); await mapTests(profile);
      console.log(`PASS: ${profile.id}: ${checks - before} component interaction assertions (${reduced ? 'reduced' : 'normal'} motion).`);
    }
    if (profiles.length >= 2) await profileSwitchTests();
    await act(async () => root.unmount());
    console.log(`PASS: ${checks} component interaction assertions (${reduced ? 'reduced' : 'normal'} motion). Chapters, capped backdrops, ideas/skip, books/keyboard, all profile dialogue choices/reset, map filters/details/navigation/keyboard.`);
    console.log('Scope: jsdom state/DOM tests only. No claims about browser hydration, visual layout, responsive geometry, pointer pan/zoom, or animation smoothness.');
  } catch (error) {
    console.error(`FAIL after ${checks} assertions:`, error.stack || error);
    process.exitCode = 1;
  } finally { if (root) { try { await act(async () => root.unmount()); } catch {} } window.close(); }
})();
