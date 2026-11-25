// =========================================================================
// CORE: ÁUDIO PROCEDURAL DA OBRA + CAMADA AMBIENTE ASMR SEPARADA
// =========================================================================
(function(MO) {
    let sharedCtx = null;

    function getAudioCtx() {
        if (!sharedCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) sharedCtx = new AC();
        }
        if (sharedCtx && sharedCtx.state === 'suspended') {
            sharedCtx.resume().catch(() => {});
        }
        return sharedCtx;
    }

    MO.SoundFX = {
        canPlay() {
            if (MO.state && MO.state.muted) return false;
            return !!getAudioCtx();
        },
        playBrickClack() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(145, now + 0.08);
            g.gain.setValueAtTime(0.14, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
            osc.connect(g); g.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.09);
        },
        playMortarSquish() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const len = Math.floor(ctx.sampleRate * 0.08);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.35));
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass'; f.frequency.value = 360;
            const g = ctx.createGain(); g.gain.value = 0.12;
            src.connect(f); f.connect(g); g.connect(ctx.destination);
            src.start();
        },
        playMixerScrape() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const len = Math.floor(ctx.sampleRate * 0.06);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass'; f.frequency.value = 600 + Math.random() * 260; f.Q.value = 1.8;
            const g = ctx.createGain(); g.gain.value = 0.07;
            src.connect(f); f.connect(g); g.connect(ctx.destination);
            src.start();
        },
        playHammerWood() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(195, now);
            osc.frequency.exponentialRampToValueAtTime(62, now + 0.11);
            g.gain.setValueAtTime(0.18, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.connect(g); g.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.12);
        },
        playWoodSaw() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const len = Math.floor(ctx.sampleRate * 0.14);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) {
                d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
            }
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass';
            f.frequency.value = 1650;
            f.Q.value = 2.2;
            const g = ctx.createGain();
            g.gain.value = 0.09;
            src.connect(f); f.connect(g); g.connect(ctx.destination);
            src.start();
        },
        playAxeChop() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(210 + Math.random() * 45, now);
            osc.frequency.exponentialRampToValueAtTime(55, now + 0.09);
            g.gain.setValueAtTime(0.22, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
            osc.connect(g); g.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.10);

            const len = Math.floor(ctx.sampleRate * 0.05);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.25));
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass'; f.frequency.value = 1100;
            const ng = ctx.createGain(); ng.gain.value = 0.14;
            src.connect(f); f.connect(ng); ng.connect(ctx.destination);
            src.start(now);
        },
        playTreeCreak() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(95, now);
            osc.frequency.linearRampToValueAtTime(62, now + 0.45);
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass'; f.frequency.value = 340;
            g.gain.setValueAtTime(0.07, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
            osc.connect(f); f.connect(g); g.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.48);
        },
        playTreeCrash() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(90, now);
            osc.frequency.exponentialRampToValueAtTime(28, now + 0.32);
            g.gain.setValueAtTime(0.28, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.connect(g); g.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.35);

            const len = Math.floor(ctx.sampleRate * 0.26);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.35));
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass'; f.frequency.value = 650;
            const ng = ctx.createGain(); ng.gain.value = 0.18;
            src.connect(f); f.connect(ng); ng.connect(ctx.destination);
            src.start(now);
        },
        playPlantDig() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const len = Math.floor(ctx.sampleRate * 0.12);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.4));
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass'; f.frequency.value = 480;
            const g = ctx.createGain(); g.gain.value = 0.15;
            src.connect(f); f.connect(g); g.connect(ctx.destination);
            src.start(now);
        },
        playCashRegister() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            [880, 1320].forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.08);
                g.gain.setValueAtTime(0.12, now + idx * 0.08);
                g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.22);
                osc.connect(g); g.connect(ctx.destination);
                osc.start(now + idx * 0.08); osc.stop(now + idx * 0.08 + 0.22);
            });
        },
        playPickaxeClink() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(1150 + Math.random() * 280, now);
            osc.frequency.exponentialRampToValueAtTime(380, now + 0.09);
            g.gain.setValueAtTime(0.15, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
            osc.connect(g); g.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.11);

            const len = Math.floor(ctx.sampleRate * 0.06);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.25));
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'highpass'; f.frequency.value = 1400;
            const ng = ctx.createGain(); ng.gain.value = 0.12;
            src.connect(f); f.connect(ng); ng.connect(ctx.destination);
            src.start(now);
        },
        playRockShatter() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(110, now);
            osc.frequency.exponentialRampToValueAtTime(30, now + 0.32);
            g.gain.setValueAtTime(0.30, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
            osc.connect(g); g.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.34);

            const len = Math.floor(ctx.sampleRate * 0.26);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.38));
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass'; f.frequency.value = 620;
            const ng = ctx.createGain(); ng.gain.value = 0.18;
            src.connect(f); f.connect(ng); ng.connect(ctx.destination);
            src.start(now);
        },
        playStoneGrind() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const len = Math.floor(ctx.sampleRate * 0.15);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass'; f.frequency.value = 1850; f.Q.value = 3.0;
            const g = ctx.createGain(); g.gain.value = 0.10;
            src.connect(f); f.connect(g); g.connect(ctx.destination);
            src.start(now);
        },
        playStonePlace() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(240, now);
            osc.frequency.exponentialRampToValueAtTime(75, now + 0.10);
            g.gain.setValueAtTime(0.18, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.connect(g); g.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.12);
        },
        playShovelScrape() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const len = Math.floor(ctx.sampleRate * 0.12);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.45));
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass'; f.frequency.value = 720;
            const g = ctx.createGain(); g.gain.value = 0.14;
            src.connect(f); f.connect(g); g.connect(ctx.destination);
            src.start(now);
        },
        playHoeTill() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(160, now);
            osc.frequency.exponentialRampToValueAtTime(48, now + 0.11);
            g.gain.setValueAtTime(0.18, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.connect(g); g.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.12);

            const len = Math.floor(ctx.sampleRate * 0.08);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.35));
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass'; f.frequency.value = 540;
            const ng = ctx.createGain(); ng.gain.value = 0.14;
            src.connect(f); f.connect(ng); ng.connect(ctx.destination);
            src.start(now);
        },
        playWaterPour() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const len = Math.floor(ctx.sampleRate * 0.28);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass'; f.frequency.value = 920; f.Q.value = 1.4;
            const g = ctx.createGain(); g.gain.value = 0.12;
            src.connect(f); f.connect(g); g.connect(ctx.destination);
            src.start(now);
        },
        playSickleCut() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const len = Math.floor(ctx.sampleRate * 0.12);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.28));
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'highpass'; f.frequency.value = 1800;
            const g = ctx.createGain(); g.gain.value = 0.13;
            src.connect(f); f.connect(g); g.connect(ctx.destination);
            src.start(now);
        },
        playPackCrate() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(280, now);
            osc.frequency.exponentialRampToValueAtTime(110, now + 0.08);
            g.gain.setValueAtTime(0.15, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
            osc.connect(g); g.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.09);
        },
        playMetalClang() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(720, now);
            osc.frequency.exponentialRampToValueAtTime(280, now + 0.16);
            g.gain.setValueAtTime(0.09, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
            osc.connect(g); g.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.17);
        },
        playSparkWeld() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const len = Math.floor(ctx.sampleRate * 0.09);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() > 0.7 ? (Math.random() * 2 - 1) : 0);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'highpass'; f.frequency.value = 2400;
            const g = ctx.createGain(); g.gain.value = 0.08;
            src.connect(f); f.connect(g); g.connect(ctx.destination);
            src.start();
        },
        playDirtShovel() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const len = Math.floor(ctx.sampleRate * 0.11);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass'; f.frequency.value = 520;
            const g = ctx.createGain(); g.gain.value = 0.14;
            src.connect(f); f.connect(g); g.connect(ctx.destination);
            src.start();
        },
        playElectricSwitch() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(1100, now);
            osc.frequency.setValueAtTime(1550, now + 0.03);
            g.gain.setValueAtTime(0.08, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
            osc.connect(g); g.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.07);
        },
        playWaterRush() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const len = Math.floor(ctx.sampleRate * 0.35);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass'; f.frequency.value = 950; f.Q.value = 0.9;
            const g = ctx.createGain(); g.gain.value = 0.12;
            src.connect(f); f.connect(g); g.connect(ctx.destination);
            src.start();
        },
        playWaterRipple() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            const f0 = 380 + Math.random() * 140;
            osc.frequency.setValueAtTime(f0, now);
            osc.frequency.exponentialRampToValueAtTime(f0 * 1.65, now + 0.08);
            g.gain.setValueAtTime(0.038, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
            osc.connect(g); g.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.10);
        },
        playTruckHorn() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            [210, 265].forEach(freq => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, now);
                g.gain.setValueAtTime(0.06, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
                osc.connect(g); g.connect(ctx.destination);
                osc.start(now); osc.stop(now + 0.32);
            });
        },
        playWindGust() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const len = Math.floor(ctx.sampleRate * 0.55);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 1.6;
            const g = ctx.createGain(); g.gain.value = 0.10;
            src.connect(f); f.connect(g); g.connect(ctx.destination);
            src.start();
        },
        playCollapse() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const len = Math.floor(ctx.sampleRate * 0.65);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.42));
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass'; f.frequency.setValueAtTime(290, now); f.frequency.exponentialRampToValueAtTime(75, now + 0.6);
            const g = ctx.createGain(); g.gain.value = 0.25;
            src.connect(f); f.connect(g); g.connect(ctx.destination);
            src.start();
        },
        playSuccessStamp() {
            if (!this.canPlay()) return;
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            [523.25, 659.25, 783.99].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + i * 0.06);
                g.gain.setValueAtTime(0.09, now + i * 0.06);
                g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.24);
                osc.connect(g); g.connect(ctx.destination);
                osc.start(now + i * 0.06); osc.stop(now + i * 0.06 + 0.25);
            });
        }
    };

    // Camada de Áudio Ambiente Relaxante (Vento, Chuva, Água do Rio, Grilos/Pássaros)
    let ambGain = null;
    let ambFilter = null;
    let ambSource = null;
    let ambTimer = 0;

    function ensureAmbientLoop() {
        const ctx = getAudioCtx();
        if (!ctx || ambSource) return;

        const len = ctx.sampleRate * 3;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
            const white = Math.random() * 2 - 1;
            last = (last + 0.025 * white) / 1.025; // Brown noise suave
            d[i] = last * 3.2;
        }
        ambSource = ctx.createBufferSource();
        ambSource.buffer = buf;
        ambSource.loop = true;

        ambFilter = ctx.createBiquadFilter();
        ambFilter.type = 'lowpass';
        ambFilter.frequency.value = 420;

        ambGain = ctx.createGain();
        ambGain.gain.value = 0.0;

        ambSource.connect(ambFilter);
        ambFilter.connect(ambGain);
        ambGain.connect(ctx.destination);
        ambSource.start();
    }

    MO.updateAmbientSoundscape = function(dt) {
        const state = MO.state;
        if (state.ambientMuted) {
            if (ambGain) ambGain.gain.value = 0;
            return;
        }
        const ctx = getAudioCtx();
        if (!ctx) return;
        ensureAmbientLoop();
        if (!ambGain || !ambFilter) return;

        const isRain = state.weather === 'rain';
        const isWind = state.weather === 'wind';
        const isRiver = state.mode === 'bridge';

        const targetGain = isRain ? 0.14 : (isWind ? 0.09 : (isRiver ? 0.07 : 0.035));
        const targetFreq = isRain ? 1350 : (isWind ? 650 : (isRiver ? 720 : 340));
        ambGain.gain.value += (targetGain - ambGain.gain.value) * Math.min(1, dt * 2.0);
        ambFilter.frequency.value += (targetFreq - ambFilter.frequency.value) * Math.min(1, dt * 2.0);

        // Canto suave de pássaros (dia) ou grilos (noite)
        ambTimer += dt;
        if (ambTimer > (state.isNight ? 1.8 : 3.2)) {
            ambTimer = 0;
            if (Math.random() < 0.65 && !isRain) {
                const now = ctx.currentTime;
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                if (state.isNight) {
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(3800, now);
                    g.gain.setValueAtTime(0.012, now);
                    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.12);
                    osc.connect(g); g.connect(ctx.destination);
                    osc.start(now); osc.stop(now + 0.13);

                    // Estalido sutil de fogareiro/fogueira no acampamento à noite
                    if (state.camp && state.camp.messHall && state.camp.messHall.built && Math.random() < 0.55) {
                        const cOsc = ctx.createOscillator();
                        const cGain = ctx.createGain();
                        cOsc.type = 'triangle';
                        cOsc.frequency.setValueAtTime(280 + Math.random() * 420, now + 0.05);
                        cGain.gain.setValueAtTime(0.009, now + 0.05);
                        cGain.gain.exponentialRampToValueAtTime(0.0004, now + 0.10);
                        cOsc.connect(cGain); cGain.connect(ctx.destination);
                        cOsc.start(now + 0.05); cOsc.stop(now + 0.11);
                    }
                } else {
                    osc.type = 'sine';
                    const base = 1800 + Math.random() * 900;
                    osc.frequency.setValueAtTime(base, now);
                    osc.frequency.exponentialRampToValueAtTime(base * 1.35, now + 0.09);
                    g.gain.setValueAtTime(0.014, now);
                    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.14);
                    osc.connect(g); g.connect(ctx.destination);
                    osc.start(now); osc.stop(now + 0.15);
                }
            }
        }
    };

    MO.toggleAudioMute = function() {
        MO.state.muted = !MO.state.muted;
        const btn = document.getElementById('btn-mute');
        if (btn) {
            btn.textContent = MO.state.muted ? '🔇' : '🔊';
            btn.title = MO.state.muted ? 'Ativar Sons da Obra' : 'Silenciar Sons da Obra';
        }
        MO.showToast(MO.state.muted ? 'Sons da obra silenciados.' : 'Sons da obra ativados!', MO.state.muted ? '🔇' : '🔊');
    };

    MO.toggleAmbientMute = function() {
        MO.state.ambientMuted = !MO.state.ambientMuted;
        const btn = document.getElementById('btn-ambient');
        if (btn) {
            btn.classList.toggle('active', !MO.state.ambientMuted);
        }
        if (!MO.state.ambientMuted) ensureAmbientLoop();
        MO.showToast(
            MO.state.ambientMuted ? 'Som ambiente ASMR desligado.' : '🌿 Som ambiente ASMR ligado (vento, rio, noite)!',
            '🌿'
        );
    };
})(window.MO = window.MO || {});
