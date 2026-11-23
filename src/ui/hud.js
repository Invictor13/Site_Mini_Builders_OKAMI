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
        const activeLot = (MO.regionManager && MO.worldManager && MO.worldManager.meta.persistentGrowth)
            ? MO.regionManager.getActiveLot()
            : null;
        const lotTag = activeLot ? ` · ${activeLot.label.toUpperCase()}` : '';
        const ind = document.getElementById('phase-indicator');
        if (ind) {
            ind.textContent = `${modeLabels[mode]} · FASE ${state.phase} · ${pName}${lotTag} · ${biomeLabel} #${state.seed}`;
        }
        if (MO.updateVillageUI) MO.updateVillageUI();
        if (MO.renderNpcRosterUI) MO.renderNpcRosterUI();
    };

    MO.updateVillageUI = function() {
        const isUnifiedOrHouse = Boolean(MO.state && (MO.state.unifiedVillage || MO.state.mode === 'house'));
        const persistent = Boolean(MO.worldManager && MO.worldManager.meta.persistentGrowth);
        const lots = MO.regionManager ? MO.regionManager.getLotsForRegion('main-valley') : [];
        const total = lots.length || 5;
        const done = lots.filter(l => l.status === 'completed').length;

        const btn = document.getElementById('btn-village-mode');
        const lbl = document.getElementById('village-btn-label');
        const nextBtn = document.getElementById('btn-next-lot');
        if (btn) {
            btn.classList.toggle('active', persistent);
            btn.classList.toggle('hidden', !isUnifiedOrHouse);
        }
        if (lbl) {
            lbl.textContent = persistent ? `Vila: ${done}/${total}` : 'Diorama Único';
        }
        if (nextBtn) {
            const hasMore = lots.some(l => l.status === 'available');
            nextBtn.classList.toggle('hidden', !(isUnifiedOrHouse && persistent && hasMore));
        }
    };

    MO.toggleNpcPanel = function(forceVal) {
        const panel = document.getElementById('npc-panel');
        const btn = document.getElementById('btn-npc-menu');
        if (!panel) return false;
        const isHidden = panel.classList.contains('hidden');
        const nextOpen = (typeof forceVal === 'boolean') ? forceVal : isHidden;
        panel.classList.toggle('hidden', !nextOpen);
        if (btn) btn.classList.toggle('active', nextOpen);
        if (nextOpen && MO.renderNpcRosterUI) MO.renderNpcRosterUI();
        return nextOpen;
    };

    MO.renderNpcRosterUI = function() {
        const rosterEl = document.getElementById('npc-roster');
        const wbEl = document.getElementById('npc-workbench-status');
        const state = MO.state;
        if (wbEl && state && state.workbench && state.villageInfra) {
            const infra = state.villageInfra;
            const stage = !infra.demarcated
                ? 'Aguardando demarcação do Supervisor'
                : (!infra.roadBuilt
                    ? 'Abertura da estrada de terra'
                    : (!infra.workbenchBuilt ? 'Montagem da bancada & pátios' : `Madeira: ${state.workbench.rawWood} tora(s) · ${state.workbench.cutWood} pronta(s)`));
            wbEl.textContent = stage;
        }
        if (!rosterEl || !state) return;
        const workers = state.workers || [];
        if (workers.length === 0) {
            rosterEl.innerHTML = '<div class="text-slate-400 text-[11px] py-1">Nenhum NPC no mapa ainda. Contrate um Supervisor primeiro!</div>';
            return;
        }
        rosterEl.innerHTML = workers.map(w => {
            const badge = w.role === 'supervisor' ? '👷‍♂️ Supervisor' : `👷 ${w.name}`;
            const status = w.statusText || 'Disponível';
            return `<div class="flex items-center justify-between gap-2 bg-white/5 rounded-lg px-2 py-1 text-[11px]">
                <span class="font-medium text-slate-100 shrink-0">${badge}</span>
                <span class="text-slate-300 truncate">${status}</span>
            </div>`;
        }).join('');
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
