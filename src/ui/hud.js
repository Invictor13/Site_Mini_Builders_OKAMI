// =========================================================================
// UI: NOTIFICAÇÕES, MODO ZEN, SELETOR DE CONTRATOS & DOCKS POR MODO
// =========================================================================
(function(MO) {
    let toastTimer = null;

    MO.showToast = function(msg, icon = '🏗️') {
        if (MO.state.zenMode) return;
        const box = document.getElementById('toast-box');
        const msgEl = document.getElementById('toast-message');
        const iconEl = document.getElementById('toast-icon');
        if (!box || !msgEl || !iconEl) return;

        msgEl.textContent = msg;
        iconEl.textContent = icon;
        box.classList.remove('opacity-0', '-translate-y-2');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => box.classList.add('opacity-0', '-translate-y-2'), 3400);
    };

    MO.syncPhaseUI = function() {
        const state = MO.state;
        const mode = state.mode;

        // Oculta todos os docks e exibe apenas o dock correspondente ao modo e fase atual
        document.querySelectorAll('[data-mode-dock]').forEach(el => {
            const m = el.getAttribute('data-mode-dock');
            const p = Number(el.getAttribute('data-phase-dock'));
            el.classList.toggle('hidden', !(m === mode && p === state.phase));
        });

        // Atualiza botões de contrato ativo no topo
        document.querySelectorAll('[data-mode-btn]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-mode-btn') === mode);
        });

        // Botão de Raio-X faz sentido em Casa e Prédio
        const xrayBtn = document.getElementById('btn-xray');
        if (xrayBtn) {
            xrayBtn.classList.toggle('hidden', mode !== 'house' && mode !== 'building');
        }

        const modeLabels = {
            house: 'CASA',
            bridge: 'PONTE',
            building: 'PRÉDIO',
            tower: 'TORRE'
        };

        const phaseNames = {
            house: {
                0: 'CAPINA & TERRAPLANAGEM',
                1: 'PLANTA & MARCAÇÃO',
                2: 'FUNDAÇÃO & COLUNAS',
                3: 'ALVENARIA & PISO',
                4: 'INSTALAÇÕES MEP (RAIO-X)',
                5: 'CINTA, TELHADO & ACABAMENTO'
            },
            bridge: {
                0: 'LIMPEZA DAS MARGENS & CABECEIRAS',
                1: 'FUNDAÇÃO SUBMERSA (ESTACAS & PILARES)',
                2: 'VIGAS LONGARINAS & TABULEIRO',
                3: 'GUARDA-CORPO, LUZES & TESTE DE CARGA'
            },
            building: {
                0: 'LIMPEZA URBANA & PLATÔ',
                1: 'PILARES, LAJES & GRUA (3 ANDARES)',
                2: 'ALVENARIA & PRUMADAS MEP',
                3: 'FACHADA, VIDROS & COBERTURA'
            },
            tower: {
                0: 'PLATÔ ROCHOSO & ANCORAGEM',
                1: 'SAPATAS PROFUNDAS EM CRUZ',
                2: 'MÓDULOS TRELIÇADOS & ANDAIMES',
                3: 'ANTENA, FAROL & TESTE DE VENTO'
            }
        };

        const pName = (phaseNames[mode] && phaseNames[mode][state.phase]) || `FASE ${state.phase}`;
        const biomeLabel = (MO.BIOMES && MO.BIOMES[state.biome]) ? MO.BIOMES[state.biome].label.toUpperCase() : state.biome.toUpperCase();
        const ind = document.getElementById('phase-indicator');
        if (ind) {
            ind.textContent = `${modeLabels[mode]} · FASE ${state.phase} · ${pName} · ${biomeLabel} #${state.seed}`;
        }
    };

    MO.selectTool = function(tool) {
        const state = MO.state;
        state.tool = tool;
        document.querySelectorAll('.tool-btn').forEach(b => {
            if (!b.hasAttribute('data-keep-active') && b.id !== 'btn-screensaver' && b.id !== 'btn-playlist') {
                b.classList.remove('active', 'erase-on');
            }
        });
        document.querySelectorAll(`[data-tool-id="${tool}"]`).forEach(btn => {
            btn.classList.add(tool === 'erase' ? 'erase-on' : 'active');
        });
        const btn = document.getElementById(`tool-${tool}`);
        if (btn) btn.classList.add(tool === 'erase' ? 'erase-on' : 'active');

        if (tool === 'level' && state.phase === 1) {
            const l1 = document.getElementById('tool-level-1');
            if (l1) l1.classList.add('active');
        }
        if (tool === 'mixer' && state.phase === 3) {
            const m3 = document.getElementById('tool-mixer-3');
            if (m3) m3.classList.add('active');
        }
        const subR = document.getElementById('sub-rebar');
        const subM = document.getElementById('sub-mixer');
        if (subR) subR.classList.toggle('hidden', tool !== 'rebar');
        if (subM) subM.classList.toggle('hidden', tool !== 'mixer');
    };

    MO.toggleZenMode = function(forceVal) {
        const state = MO.state;
        state.zenMode = (typeof forceVal === 'boolean') ? forceVal : !state.zenMode;
        document.querySelectorAll('.hud-hideable').forEach(el => {
            el.classList.toggle('hidden', state.zenMode);
        });
        const exitPill = document.getElementById('zen-exit-pill');
        if (exitPill) exitPill.classList.toggle('hidden', !state.zenMode);
        if (!state.zenMode) MO.syncPhaseUI();
    };

    MO.togglePlaylistMode = function(forceVal) {
        const state = MO.state;
        state.playlist = (typeof forceVal === 'boolean') ? forceVal : !state.playlist;
        const btn = document.getElementById('btn-playlist');
        if (btn) btn.classList.toggle('active', state.playlist);
        MO.showToast(
            state.playlist ? '🔁 Playlist Contínua ON (alternará entre Casa, Ponte, Prédio e Torre).' : '🔁 Playlist pausada (repetirá apenas a obra atual).',
            '🔁'
        );
    };
})(window.MO = window.MO || {});
