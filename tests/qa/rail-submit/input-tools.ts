import { registerGameTools as registerProductionTools } from '../../../src/lib/game/tools';
import { beginRailQuestion, createRailRide, currentRailQuestion, RAIL_QUESTIONS } from '../../../src/lib/game/railway';

// This fixture observes the live game ref. Inputs, answer submission, and game
// updates remain the production functions; only fixed test prerequisites vary.
export function registerGameTools(...args: Parameters<typeof registerProductionTools>) {
  const [read] = args;
  const snapshot = () => {
    const run = read();
    const ride = run.rail;
    const question = currentRailQuestion(run);
    return {
      mode: run.mode, lane: run.lane, x: run.x,
      phase: ride?.phase, index: ride?.index, question: question?.id,
      remaining: ride?.remaining, duration: ride?.duration,
      answerLane: ride?.answerLane, correct: ride?.correct,
      correctCount: ride?.correctCount, distance: run.distance,
      correctLane: question && ride ? ride.optionOrder.indexOf(question.correctIndex) - 1 : null,
      skillCharge: run.skillCharge,
    };
  };
  const prepare = (longest = false) => {
      const run = read();
      if (run.mode !== 'running' || run.review || args[4].isOpen() || args[4].setupOpen()) {
        throw Error('Rail QA preparation requires an active run with closed dialogs.');
      }
      const locale = document.documentElement.lang === 'zh-CN' ? 'zh' : 'en';
      const textLength = (question: typeof RAIL_QUESTIONS[number]) => [question.prompt, ...question.options.map(option => option.label)]
        .reduce((sum, copy) => sum + Array.from(copy[locale]).length, 0);
      const question = longest ? [...RAIL_QUESTIONS].sort((a, b) => textLength(b) - textLength(a))[0] : RAIL_QUESTIONS[0];
      const ride = createRailRide(() => 0.5);
      ride.questions = [question.id, ...RAIL_QUESTIONS.filter(candidate => candidate.id !== question.id).slice(0, 2).map(candidate => candidate.id)];
      ride.questionDeck = undefined;
      beginRailQuestion(ride, () => 0.5);
      const incorrect = [0, 1, 2].filter(index => index !== question.correctIndex);
      ride.optionOrder = [incorrect[0], question.correctIndex, incorrect[1]];
      run.rail = ride;
      run.lane = 0;
      run.x = 0;
      run.jump = 0;
      run.slide = 0;
      run.fork = null;
      run.sceneTransition = 0;
      run.turnRemaining = 0;
      run.railReturnRemaining = 0;
      return snapshot();
  };
  const fixture = Object.freeze({
    id: 'rail-submit-v1', storagePrefix: 'qa-rail-submit-v1:', cloud: 'disabled',
    snapshot,
    prepare: () => prepare(),
    prepareLongestQuestion: () => prepare(true),
    shortenCurrentPhase() {
      const run = read();
      if (run.mode !== 'running' || !run.rail || !['question', 'feedback'].includes(run.rail.phase)) {
        throw Error('Rail QA phase shortening requires an active question or feedback.');
      }
      run.rail.remaining = 0.035;
      return snapshot();
    },
  });
  Object.defineProperty(window, '__railSubmitQA', { configurable: true, value: fixture });
  const unregister = registerProductionTools(...args);
  return () => {
    if ((window as unknown as { __railSubmitQA?: unknown }).__railSubmitQA === fixture) {
      delete (window as unknown as { __railSubmitQA?: unknown }).__railSubmitQA;
    }
    unregister();
  };
}
