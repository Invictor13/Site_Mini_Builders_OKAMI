// =========================================================================
// CORE: RELÓGIO DE SIMULAÇÃO COM FIXED TIMESTEP & PROTEÇÃO ANTI-SALTO
// =========================================================================
(function(MO) {
    const EPSILON = 1e-9;

    function createSimulationClock(options = {}) {
        const fixedDt = options.fixedDt || (1 / 60);
        const maxFrameDt = options.maxFrameDt || 0.1;
        const maxStepsPerFrame = options.maxStepsPerFrame || 5;

        const clock = {
            fixedDt,
            maxFrameDt,
            maxStepsPerFrame,
            accumulator: 0,
            simTime: 0,
            visualTime: 0,
            alpha: 0,
            stepCount: 0,
            paused: false,
            timeScale: 1,
            lastClampedDt: 0,
            lastSteps: 0,

            reset() {
                this.accumulator = 0;
                this.simTime = 0;
                this.visualTime = 0;
                this.alpha = 0;
                this.stepCount = 0;
                this.lastClampedDt = 0;
                this.lastSteps = 0;
            },

            advance(rawFrameDt, onFixedStep) {
                const validDt = (typeof rawFrameDt === 'number' && Number.isFinite(rawFrameDt) && rawFrameDt > 0)
                    ? rawFrameDt
                    : 0;

                if (this.paused || this.timeScale <= 0) {
                    this.lastClampedDt = 0;
                    this.lastSteps = 0;
                    this.alpha = this.accumulator / this.fixedDt;
                    this.visualTime = this.simTime + this.accumulator;
                    return 0;
                }

                const clampedFrameDt = Math.min(this.maxFrameDt, validDt);
                const clampedDt = clampedFrameDt * this.timeScale;
                this.lastClampedDt = clampedDt;
                this.accumulator += clampedDt;

                const effectiveMaxSteps = Math.max(
                    this.maxStepsPerFrame,
                    Math.ceil(this.maxStepsPerFrame * Math.max(1, this.timeScale))
                );
                let steps = 0;
                while (this.accumulator + EPSILON >= this.fixedDt && steps < effectiveMaxSteps) {
                    this.accumulator = Math.max(0, this.accumulator - this.fixedDt);
                    this.stepCount += 1;
                    this.simTime = this.stepCount * this.fixedDt;
                    steps += 1;
                    if (typeof onFixedStep === 'function') {
                        onFixedStep(this.fixedDt, this.simTime, this.stepCount);
                    }
                }

                // Se atingiu o teto de passos por frame (ex.: aba retornou de pausa longa),
                // descarta o excesso do acumulador para impedir saltos acumulados.
                if (steps >= effectiveMaxSteps && this.accumulator >= this.fixedDt) {
                    this.accumulator = this.fixedDt * 0.999;
                }

                this.lastSteps = steps;
                this.alpha = Math.max(0, Math.min(1, this.accumulator / this.fixedDt));
                this.visualTime = this.simTime + this.accumulator;
                return steps;
            }
        };

        return clock;
    }

    MO.createSimulationClock = createSimulationClock;
    MO.simClock = createSimulationClock();
})(window.MO = window.MO || {});
