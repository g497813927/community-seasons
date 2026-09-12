// Dependency-free terminal display. It never owns or changes test execution.
const ESC = '\u001b[';
const clean = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
export function clock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const secs = total % 60;
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
export class TerminalDashboard {
  constructor({ enabled, snapshot, stream = process.stdout }) {
    this.enabled = enabled;
    this.snapshot = snapshot;
    this.stream = stream;
    this.active = false;
    this.message = '';
    this.timer = null;
    this.resize = () => this.render();
  }
  start() {
    if (!this.enabled || this.active) return;
    this.active = true;
    this.stream.write(`${ESC}?1049h${ESC}?25l`);
    this.stream.on('resize', this.resize);
    this.render();
    this.timer = setInterval(() => this.render(), 250);
    this.timer.unref();
  }
  log(message, error = false) {
    if (this.active) {
      this.message = clean(message).split(/\r?\n/)[0];
      this.render();
    } else {
      (error ? console.error : console.log)(message);
    }
  }
  render() {
    if (!this.active) return;
    if ((this.stream.columns || 80) < 44 || (this.stream.rows || 24) < 14) {
      this.close();
      console.log('Terminal resized; continuing with plain progress logs.');
      return;
    }
    const state = this.snapshot();
    const counts = state.roundCounts;
    const columns = Math.max(20, this.stream.columns || 80);
    const limit = state.requestedRounds === 'forever' ? '∞' : state.requestedRounds;
    const seed = (value) => value === null || value === undefined ? 'original deterministic matrix' : value;
    const lines = [
      'COMMUNITY SEASONS  /  FUZZ TESTS',
      `${state.mode.toUpperCase()}  ·  ${state.status.toUpperCase()}`,
      `Round ${state.round ?? 0} / ${limit}`,
      `Passed ${counts.passed}    Failed ${counts.failed}`,
      `Interrupted ${counts.interrupted}    Time budget ${counts.timeBudget}`,
      `Inputs changed ${counts.inputsChanged}`,
      `Active suite: ${state.suite ?? 'between rounds'}`,
      `Elapsed ${clock(state.elapsed)}    Suite ${clock(state.suiteElapsed)}`,
      `Master seed: ${seed(state.masterSeed)}`,
      `Round seed:  ${seed(state.roundSeed)}`,
      'Logs: results/  ·  summary.json',
      this.message || 'Tests run locally; results update after each suite.',
      'Ctrl+C  stop and save results',
    ];
    const frame = lines.map((line) => {
      const chars = [...clean(line)];
      return chars.length < columns ? chars.join('') : `${chars.slice(0, columns - 2).join('')}…`;
    }).join('\n');
    this.stream.write(`${ESC}H${ESC}2J${frame}`);
  }
  close() {
    if (!this.active) return;
    this.active = false;
    clearInterval(this.timer);
    this.timer = null;
    this.stream.off('resize', this.resize);
    try { this.stream.write(`${ESC}?25h${ESC}?1049l`); } catch { /* A closed pipe cannot be restored. */ }
  }
}
