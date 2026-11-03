// Fixed-timestep game loop: update() always gets the same dt, render() runs once per frame.

export function createLoop({ update, render, step = 1 / 60, maxFrame = 0.25 }) {
  let raf = 0;
  let last = 0;
  let acc = 0;
  let running = false;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    // Clamp long gaps (tab switch, breakpoint) so the game doesn't fast-forward.
    const dt = Math.min(Math.max((now - last) / 1000, 0), maxFrame);
    last = now;
    acc += dt;
    while (acc >= step) {
      update(step);
      acc -= step;
    }
    render(acc / step);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    get running() {
      return running;
    },
  };
}
