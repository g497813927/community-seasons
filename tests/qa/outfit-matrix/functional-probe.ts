import { createRun, type RunState } from '../../../src/lib/game/engine';
import { currentRailQuestion } from '../../../src/lib/game/railway';
import { nextScene } from '../../../src/lib/game/scenes';
import { SKINS } from '../../../src/lib/game/skins';
import { ACCESSORIES } from '../../../src/lib/game/cosmetics';
import type { registerGameTools } from '../../../src/lib/game/tools';
import { readEmbeddedBuildInfo } from '../preview/provenance.mjs';
import { caseById, type MatrixCase } from './cases';
import { createRailCompletionObserver } from './rail-completion.mjs';

export const FUNCTIONAL_PREFIX = 'qa-community-seasons-outfit-functional-v1:';
type Binding = Parameters<typeof registerGameTools>;
type Scenario = 'season' | 'correct' | 'wrong' | 'timeout';
let binding: Binding | undefined;
let selected: MatrixCase | undefined;
let scenario: Scenario | undefined;
let startedAt = 0;
let initialCoins = 0;
let active = false;
let recentQuestionsBefore: string[] = [];
const displayedQuestions: string[] = [];
const phaseHistory: Array<{phase: string; mode: string; elapsedMs: number; scene: string; question: number | null}> = [];
const violations: string[] = [];
const errors: string[] = [];
const railCompletion = createRailCompletionObserver();
let raf = 0;

function phase(run: RunState) {
  if (run.rail) return `rail:${run.rail.phase}`;
  if (run.railReturnRemaining > 0) return 'rail:return';
  if (run.sceneTransition > 0) return 'season:travel';
  return `run:${run.mode}`;
}

function observe() {
  if (!binding || !selected || !active) return;
  const run = binding[0]();
  railCompletion.observe(run);
  const current = phase(run);
  const previous = phaseHistory.at(-1);
  if (previous?.phase !== current || previous?.mode !== run.mode || previous?.scene !== run.scene || previous?.question !== (run.rail?.index ?? null)) {
    phaseHistory.push({phase: current, mode: run.mode, elapsedMs: performance.now() - startedAt, scene: run.scene, question: run.rail?.index ?? null});
  }
  const report = (message: string) => { if (!violations.includes(message)) violations.push(message); };
  if (run.skin !== selected.skin || JSON.stringify(run.outfit) !== JSON.stringify(selected.outfit)) report('Outfit changed during production flow.');
  if (![run.distance, run.x, run.speed, run.time, run.sceneTransition, run.railReturnRemaining].every(Number.isFinite)) report('Non-finite production run state.');
  if (run.rail && ![run.rail.remaining, run.rail.duration, run.rail.correctCount].every(Number.isFinite)) report('Non-finite train state.');
  if (run.rail?.phase === 'question') {
    const id = currentRailQuestion(run)?.id;
    if (id && !displayedQuestions.includes(id)) {
      displayedQuestions.push(id);
      if (recentQuestionsBefore.includes(id)) report('A recently shown train question repeated after retry.');
      if (!run.railQuestionDeck.recent.includes(id)) report('Displayed question was not recorded in the recent-question deck.');
    }
  }
  if (phaseHistory.length > 100) { report('Unexpected repeated transition loop.'); active = false; }
  if (performance.now() - startedAt > 90000) { report('Functional scenario exceeded its 90-second bound.'); active = false; }
}

function snapshot() {
  observe();
  const run = binding?.[0]();
  if (!run) return {ready: false};
  const question = currentRailQuestion(run);
  const ride = run.rail;
  return {
    ready: true, active, caseId: selected?.id ?? null, scenario, elapsedMs: startedAt ? performance.now() - startedAt : 0,
    mode: run.mode, scene: run.scene, expectedDestination: selected ? nextScene(selected.scene) : null,
    skin: run.skin, outfit: {...run.outfit}, lane: run.lane, x: run.x, distance: run.distance,
    coins: run.coins, initialCoins, railCompletion: railCompletion.snapshot(),
    sceneTransition: run.sceneTransition, railReturnRemaining: run.railReturnRemaining,
    rail: ride ? {
      phase: ride.phase, index: ride.index, count: ride.questions.length,
      remaining: ride.remaining, duration: ride.duration, correctCount: ride.correctCount,
      answerLane: ride.answerLane, correct: ride.correct, reward: ride.reward,
      questionId: question?.id ?? null, questionIds: [...ride.questions],
      correctLane: question ? ride.optionOrder.indexOf(question.correctIndex) - 1 : null,
      failure: ride.failure ? {...ride.failure} : null,
    } : null,
    recentQuestions: [...run.railQuestionDeck.recent], recentQuestionsBefore: [...recentQuestionsBefore], displayedQuestions: [...displayedQuestions],
    phases: phaseHistory.map(entry => ({...entry})), violations: [...violations], errors: [...errors],
    ui: {
      railQuiz: !!document.querySelector('.rail-quiz'),
      answers: document.querySelectorAll('.rail-answer-choice').length,
      submit: !!document.querySelector('.rail-submit'),
      failure: !!document.querySelector('.rail-failure-explanation'),
      canvas: !!document.querySelector('canvas'),
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
      storeOpen: binding?.[4].isOpen() ?? false, setupOpen: binding?.[4].setupOpen() ?? false,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].filter(element => element.getClientRects().length).map(element => element.getAttribute('aria-label')),
    },
    environment: {visible: document.visibilityState, focused: document.hasFocus(), webdriver: navigator.webdriver ?? null, width: innerWidth, height: innerHeight},
  };
}

function prepare(caseId: string, requested: Scenario) {
  if (!binding) throw Error('Production game is not ready.');
  const entry = caseById(caseId);
  if (!entry || !['season', 'correct', 'wrong', 'timeout'].includes(requested)) throw Error('Select a finite outfit case and functional scenario.');
  if (document.visibilityState !== 'visible') throw Error('Functional preview must be visible.');
  selected = entry;
  scenario = requested;
  const store = binding[4];
  if (store.isOpen()) store.open(false);
  const progress = store.read();
  progress.ownedSkins = SKINS.map(skin => skin.id);
  progress.equippedSkin = entry.skin;
  progress.ownedAccessories = ACCESSORIES.map(item => item.id);
  progress.outfit = {...entry.outfit};
  // Use the real begin flow to close setup/overlays and refresh HUD state.
  const priorRun = binding[0]();
  store.begin(null);
  const run = binding[0]();
  if (run === priorRun || run.mode !== 'running') throw Error('Production begin flow did not start a fresh run.');
  const deck = run.railQuestionDeck;
  recentQuestionsBefore = [...deck.recent];
  displayedQuestions.length = 0;
  Object.assign(run, createRun(4182, entry.scene, deck), {
    mode: 'running', skin: entry.skin, outfit: {...entry.outfit},
    time: 61, distance: 950, nextRow: 1e9, nextRelicAt: 1e9,
    nextForkAt: 1e9, nextRailAt: requested === 'season' ? 1e9 : 950.5,
    nextPortalAt: requested === 'season' ? 950.5 : 1e9,
    portalLane: 0, lane: 0, x: 0,
  });
  // Only place the start of a deterministic approach. The production animation
  // loop enters and advances travel, boarding, questions, feedback and return.
  // This API deliberately has no answer submission or phase-advance operation.
  initialCoins = run.coins;
  railCompletion.reset();
  phaseHistory.length = 0;
  violations.length = 0;
  startedAt = performance.now();
  active = true;
  observe();
  return snapshot();
}

export function bindFunctionalGame(args: Binding) {
  binding = args;
  return () => { if (binding === args) binding = undefined; };
}

export function installFunctionalProbe() {
  const build = readEmbeddedBuildInfo(document);
  if (!build) throw Error('Functional QA requires a built preview with source provenance.');
  window.addEventListener('error', event => { if (errors.length < 20) errors.push(event.message); });
  window.addEventListener('unhandledrejection', event => { if (errors.length < 20) errors.push(String(event.reason)); });
  const tick = () => { observe(); raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
  window.addEventListener('pagehide', () => cancelAnimationFrame(raf), {once: true});
  Object.defineProperty(window, '__communitySeasonsOutfitFunctional', {value: Object.freeze({
    id: 'community-seasons-outfit-functional-v1', cloud: 'disabled', storagePrefix: FUNCTIONAL_PREFIX,
    build, ready: () => !!binding, prepare, snapshot,
    stop: () => { active = false; return snapshot(); },
  }), configurable: false, writable: false});
}
