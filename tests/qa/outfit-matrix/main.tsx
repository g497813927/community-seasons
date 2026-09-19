import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RailTravel } from '../../../src/components/rail-travel';
import { SeasonTravel } from '../../../src/components/season-travel';
import { SCENE_TRANSITION_DURATION } from '../../../src/lib/game/engine';
import { railTravelFrame } from '../../../src/lib/game/rail-transition';
import { MATRIX_CASES } from './cases';
import { createMatrixController } from './controller';
import '../../../src/app/globals.css';
import './style.css';

type Controller = ReturnType<typeof createMatrixController>;
declare global { interface Window { __communitySeasonsOutfitMatrix: Controller['api'] } }

function Matrix() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<Controller | null>(null);
  const [revision, refresh] = useState(0);
  const [caseId, setCaseId] = useState(MATRIX_CASES[0].id);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const next = createMatrixController(canvas.current!, () => refresh(value => value + 1));
    controller.current = next;
    Object.defineProperty(window, '__communitySeasonsOutfitMatrix', { value: next.api, writable: false, configurable: false });
    refresh(value => value + 1);
  }, []);
  const current = controller.current;
  const snapshot = current?.api.snapshot();
  const state = current?.read();
  const running = snapshot?.status === 'running';
  const begin = () => {
    try { current?.api.start(caseId); setNotice(''); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  };
  return (
    <main className="matrix-shell" data-revision={revision}>
      <aside className="matrix-controls">
        <p className="matrix-eyebrow">ISOLATED QA FIXTURE · CLOUD DISABLED · SAVES UNUSED</p>
        <h1>Outfit matrix</h1>
        <p>1,280 outfit and season cases. Each case draws for at least 60 real seconds using the production engine and renderer.</p>
        <label htmlFor="matrix-case">Case</label>
        <select id="matrix-case" value={caseId} onChange={event => setCaseId(event.target.value)} disabled={running}>
          {MATRIX_CASES.map(item => <option key={item.id}>{item.id}</option>)}
        </select>
        <div className="matrix-actions">
          <button type="button" onClick={begin} disabled={!current || running}>Run 60 seconds</button>
          <button type="button" onClick={() => current?.api.stop('Stopped from fixture controls')} disabled={!running}>Stop</button>
        </div>
        <p role="status">{notice || `${snapshot?.status ?? 'loading'} · ${((snapshot?.elapsedMs ?? 0) / 1000).toFixed(1)}s · ${snapshot?.frames ?? 0} frames`}</p>
        <p>Current stage: <strong>{snapshot?.stage ?? 'run'}</strong></p>
        <p>The renderer stages are authored fixtures. The <a href="./functional.html">functional companion</a> exercises production transition screens and question answer controls.</p>
        <p>Keep this page visible during measurement. Desktop browser results do not establish native phone performance.</p>
        <details>
          <summary>Live evidence</summary>
          <pre>{JSON.stringify(snapshot && { ...snapshot, build: snapshot.build ? `${Object.keys(snapshot.build.sourceHashes).length} source hashes` : null }, null, 2)}</pre>
        </details>
      </aside>
      <section className="matrix-stage" aria-label="Source game rendering">
        <canvas ref={canvas} aria-label="TV character outfit and scene rendering" />
        {state && current && <RailTravel frame={railTravelFrame(state)} locale="en" scene={state.scene}
          renderer={current.renderer} paused={state.mode === 'paused'} skin={state.skin} outfit={state.outfit} onResume={() => undefined} />}
        {state && state.sceneTransition > 0 && <SeasonTravel source={state.sceneTransitionFrom ?? state.scene}
          destination={state.pendingScene ?? state.scene} progress={1 - state.sceneTransition / SCENE_TRANSITION_DURATION}
          locale="en" paused={state.mode === 'paused'} skin={state.skin} outfit={state.outfit} />}
        {!running && snapshot?.status === 'idle' && <p className="matrix-idle">Choose a case and start the real time render check.</p>}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Matrix />);
