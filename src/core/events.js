// =========================================================================
// CORE: EVENTOS ALEATÓRIOS, INTEGRIDADE ESTRUTURAL & COLAPSO CONTROLADO
// =========================================================================
(function(MO) {
    const collapseGroup = new THREE.Group();

    MO.initEventsAndCollapse = function() {
        MO.scene.add(collapseGroup);
    };

    MO.resetStructuralState = function() {
        const st = MO.state.structural;
        st.integrity = 100;
        st.issues = [];
        st.collapsed = false;
        st.collapseTimer = 0;
        st.repairedOnce = false;
        st.mixerTarpCovered = false;
        st.waterTablePumped = true;
        st.laudoStatus = null;
        MO.state.events.timer = 9 + Math.random() * 6;
        MO.state.events.active = null;
        MO.state.site.debris = [];
        MO.resources.clearGroup(collapseGroup);
        MO.updateLaudoBadge(null);
    };

    MO.updateLaudoBadge = function(status, text) {
        const el = document.getElementById('laudo-badge');
        if (!el) return;
        if (!status) {
            el.classList.add('hidden');
            return;
        }
        el.classList.remove('hidden');
        if (status === 'approved') {
            el.className = 'hud-hideable fixed top-28 lg:top-16 right-4 z-30 px-3 py-1.5 rounded-xl border border-emerald-400/60 bg-emerald-950/85 text-emerald-200 text-xs font-bold tracking-wide shadow-lg';
            el.textContent = text || '✅ LAUDO APROVADO · OBRA SEGURA';
        } else {
            el.className = 'hud-hideable fixed top-28 lg:top-16 right-4 z-30 px-3 py-1.5 rounded-xl border border-rose-500/70 bg-rose-950/90 text-rose-200 text-xs font-bold tracking-wide shadow-lg animate-pulse';
            el.textContent = text || '⚠️ FALHA ESTRUTURAL · INTERDITADA';
        }
    };

    MO.toggleRiskProfile = function() {
        const state = MO.state;
        state.riskProfile = state.riskProfile === 'realistic' ? 'calm' : 'realistic';
        const btn = document.getElementById('btn-risk-profile');
        if (btn) {
            btn.textContent = state.riskProfile === 'realistic' ? '⚡ Realista' : '🛡️ Calmo';
            btn.classList.toggle('active', state.riskProfile === 'realistic');
        }
        MO.showToast(
            state.riskProfile === 'realistic'
                ? '⚡ Modo Realista: imprevistos de solo/clima e risco real de colapso ativos!'
                : '🛡️ Modo Calmo: construção 100% livre de falhas ou imprevistos.',
            state.riskProfile === 'realistic' ? '⚡' : '🛡️'
        );
    };

    // Dispara imprevistos aleatórios ao longo da obra (apenas no perfil Realista)
    MO.updateRandomEvents = function(dt) {
        const state = MO.state;
        if (state.riskProfile !== 'realistic' || state.structural.collapsed || state.phase === 0) return;

        state.events.timer -= dt;
        if (state.events.timer > 0) return;
        state.events.timer = 15 + Math.random() * 14;

        const roll = Math.random();
        if (roll < 0.28) {
            // Chuva súbita no canteiro
            MO.setWeather('rain');
            MO.showToast('🌧️ Chuva repentina! Lona protetora acionada na masseira.', '🌧️');
        } else if (roll < 0.52) {
            // Rajada de vento
            MO.setWeather('wind');
            MO.SoundFX.playWindGust();
            MO.showToast('💨 Rajada de vento forte no canteiro!', '💨');
        } else if (roll < 0.72) {
            // Céu abre de volta
            MO.setWeather('clear');
        } else if (roll < 0.88 && state.phase === 1) {
            // Rocha dura / Lençol freático na fundação
            MO.SoundFX.playMetalClang();
            MO.spawnBurst(0, MO.PLATEAU_Y + 0.2, 0, 0x38bdf8, 14, 0.12);
            MO.showToast('💧 Lençol freático encontrado na escavação — drenagem reforçada!', '💧');
        } else {
            // Lote de material com defeito (reduz integridade inicial se não houver reparo)
            state.structural.integrity = Math.max(55, state.structural.integrity - 15);
            MO.showToast('⚠️ Inspeção detectou lote de massa fraco — equipe reforçando traço!', '⚠️');
        }
    };

    // Gera escombros físicos caindo na cena durante um colapso estrutural
    MO.triggerStructuralCollapse = function(reason, centerPos) {
        const st = MO.state.structural;
        if (st.collapsed) return;
        st.collapsed = true;
        st.collapseTimer = 0;
        st.laudoStatus = 'failed';
        MO.SoundFX.playCollapse();
        MO.updateLaudoBadge('failed', `⚠️ COLAPSO: ${reason}`);
        MO.showToast(`💥 FALHA ESTRUTURAL! ${reason}`, '⚠️');

        const cx = centerPos ? centerPos.x : 0;
        const cy = centerPos ? centerPos.y : 1.5;
        const cz = centerPos ? centerPos.z : 0;

        for (let i = 0; i < 24; i++) {
            const mat = i % 3 === 0 ? MO.mats.concreteDark : (i % 3 === 1 ? MO.mats.brickCeramic : MO.mats.steel);
            const size = 0.18 + Math.random() * 0.25;
            const piece = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.7, size), mat);
            piece.position.set(
                cx + (Math.random() - 0.5) * 2.2,
                cy + Math.random() * 1.4,
                cz + (Math.random() - 0.5) * 1.8
            );
            piece.castShadow = true;
            collapseGroup.add(piece);
            MO.state.site.debris.push({
                mesh: piece,
                vx: (Math.random() - 0.5) * 3.2,
                vy: 1.0 + Math.random() * 2.5,
                vz: (Math.random() - 0.5) * 3.2,
                rx: (Math.random() - 0.5) * 6,
                rz: (Math.random() - 0.5) * 6,
                grounded: false
            });
        }
        MO.spawnBurst(cx, cy, cz, 0x94a3b8, 25, 0.18);
    };

    MO.updateCollapseDebris = function(dt) {
        const debris = MO.state.site.debris;
        if (!debris || debris.length === 0) return;

        for (let d of debris) {
            if (d.grounded) continue;
            d.vy -= 9.5 * dt;
            d.mesh.position.x += d.vx * dt;
            d.mesh.position.y += d.vy * dt;
            d.mesh.position.z += d.vz * dt;
            d.mesh.rotation.x += d.rx * dt;
            d.mesh.rotation.z += d.rz * dt;

            const groundY = Math.max(MO.WATER_LEVEL + 0.05, MO.getTerrainHeight(d.mesh.position.x, d.mesh.position.z) + 0.08);
            if (d.mesh.position.y <= groundY) {
                d.mesh.position.y = groundY;
                if (Math.abs(d.vy) > 1.2) {
                    d.vy = -d.vy * 0.25;
                    d.vx *= 0.5; d.vz *= 0.5;
                } else {
                    d.grounded = true;
                }
            }
        }
    };

    MO.approveStructure = function(msg) {
        MO.state.structural.laudoStatus = 'approved';
        MO.SoundFX.playSuccessStamp();
        MO.updateLaudoBadge('approved', msg || '✅ LAUDO APROVADO · OBRA SEGURA');
    };
})(window.MO = window.MO || {});
