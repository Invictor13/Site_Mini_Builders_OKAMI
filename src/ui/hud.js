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

        // No modo Cidade, as obras progridem 100% automático pelos trabalhadores;
        // o dock manual de ferramentas só aparece fora do cityMode (ou se manualPhaseDock for ativado).
        const activeConstr = (MO.constructionManager && MO.constructionManager.getActiveConstruction)
            ? MO.constructionManager.getActiveConstruction()
            : null;
        const phaseWrap = document.getElementById('phase-dock-wrap');
        if (phaseWrap) {
            const allowManualDock = Boolean(state.city && state.city.manualPhaseDock);
            const showPhaseDock = !state.cityMode || (allowManualDock && Boolean(activeConstr));
            phaseWrap.classList.toggle('hidden', !showPhaseDock);
        }

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
            if (state.cityMode && !activeConstr) {
                ind.textContent = `CIDADE LIVRE · ${biomeLabel} #${state.seed}`;
            } else {
                ind.textContent = `${modeLabels[mode]} · FASE ${state.phase} · ${pName}${lotTag} · ${biomeLabel} #${state.seed}`;
            }
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
        const optPanel = document.getElementById('options-panel');
        const optBtn = document.getElementById('btn-options-menu');
        const phonePanel = document.getElementById('phone-panel');
        const phoneBtn = document.getElementById('btn-phone-menu');
        if (!panel) return false;
        const isHidden = panel.classList.contains('hidden');
        const nextOpen = (typeof forceVal === 'boolean') ? forceVal : isHidden;
        panel.classList.toggle('hidden', !nextOpen);
        if (btn) btn.classList.toggle('active', nextOpen);
        if (nextOpen && optPanel) {
            optPanel.classList.add('hidden');
            if (optBtn) optBtn.classList.remove('active');
        }
        if (nextOpen && phonePanel) {
            phonePanel.classList.add('hidden');
            if (phoneBtn) phoneBtn.classList.remove('active');
        }
        if (nextOpen && MO.renderNpcRosterUI) MO.renderNpcRosterUI();
        return nextOpen;
    };

    MO.toggleOptionsPanel = function(forceVal) {
        const panel = document.getElementById('options-panel');
        const btn = document.getElementById('btn-options-menu');
        const npcPanel = document.getElementById('npc-panel');
        const npcBtn = document.getElementById('btn-npc-menu');
        const phonePanel = document.getElementById('phone-panel');
        const phoneBtn = document.getElementById('btn-phone-menu');
        if (!panel) return false;
        const isHidden = panel.classList.contains('hidden');
        const nextOpen = (typeof forceVal === 'boolean') ? forceVal : isHidden;
        panel.classList.toggle('hidden', !nextOpen);
        if (btn) btn.classList.toggle('active', nextOpen);
        if (nextOpen && npcPanel) {
            npcPanel.classList.add('hidden');
            if (npcBtn) npcBtn.classList.remove('active');
        }
        if (nextOpen && phonePanel) {
            phonePanel.classList.add('hidden');
            if (phoneBtn) phoneBtn.classList.remove('active');
        }
        return nextOpen;
    };

    MO.togglePhonePanel = function(forceVal) {
        const panel = document.getElementById('phone-panel');
        const btn = document.getElementById('btn-phone-menu');
        const npcPanel = document.getElementById('npc-panel');
        const npcBtn = document.getElementById('btn-npc-menu');
        const optPanel = document.getElementById('options-panel');
        const optBtn = document.getElementById('btn-options-menu');
        if (!panel) return false;
        const isHidden = panel.classList.contains('hidden');
        const nextOpen = (typeof forceVal === 'boolean') ? forceVal : isHidden;
        panel.classList.toggle('hidden', !nextOpen);
        if (btn) btn.classList.toggle('active', nextOpen);
        if (nextOpen && npcPanel) {
            npcPanel.classList.add('hidden');
            if (npcBtn) npcBtn.classList.remove('active');
        }
        if (nextOpen && optPanel) {
            optPanel.classList.add('hidden');
            if (optBtn) optBtn.classList.remove('active');
        }
        const stEl = document.getElementById('phone-truck-status');
        if (stEl && MO.state && MO.state.villageInfra) {
            const hasBay = MO.state.villageInfra.unloadingBuilt;
            const hasRoute = hasBay && MO.computeRoadRouteToUnload && MO.computeRoadRouteToUnload(MO.STATION_UNLOAD) !== null;
            stEl.textContent = !hasBay
                ? 'Coloque uma Baia'
                : (hasRoute ? 'Via + Baia prontas ✓' : 'Conecte estrada na Baia');
        }
        return nextOpen;
    };

    MO.callTruckFromPhone = function(cargoKind = 'mixed') {
        if (MO.requestSupplyTruck) MO.requestSupplyTruck(cargoKind, true);
        const stEl = document.getElementById('phone-truck-status');
        if (stEl && MO.state && MO.state.site) {
            const hasBay = MO.state.villageInfra && MO.state.villageInfra.unloadingBuilt;
            const hasRoute = hasBay && MO.computeRoadRouteToUnload && MO.computeRoadRouteToUnload(MO.STATION_UNLOAD) !== null;
            stEl.textContent = MO.state.site.truckActive
                ? 'Caminhão na estrada 🚚'
                : (!hasBay ? 'Coloque uma Baia' : (hasRoute ? 'Via + Baia prontas ✓' : 'Conecte estrada na Baia'));
        }
    };

    MO.openCitySetupModal = function() {
        MO.toggleOptionsPanel(false);
        MO.showTitleView('home');
        MO.refreshTitleMenuUI();
        const modal = document.getElementById('city-setup-modal');
        if (modal) modal.classList.remove('hidden');
    };

    MO.showTitleView = function(view = 'home') {
        const home = document.getElementById('title-home-view');
        const nw = document.getElementById('title-new-view');
        const cfg = document.getElementById('title-settings-view');
        if (home) home.classList.toggle('hidden', view !== 'home');
        if (nw) nw.classList.toggle('hidden', view !== 'new');
        if (cfg) cfg.classList.toggle('hidden', view !== 'settings');
    };

    MO.selectSetupGameMode = function(modeId = 'real') {
        const isSandbox = (modeId === 'sandbox');
        const sb = document.getElementById('setup-sandbox');
        if (sb) sb.checked = isSandbox;
        if (typeof document !== 'undefined') {
            document.querySelectorAll('[data-mode-card]').forEach(el => {
                const active = el.getAttribute('data-mode-card') === modeId;
                el.classList.toggle('border-2', active);
                el.classList.toggle('border-emerald-400', active);
                el.classList.toggle('bg-emerald-500/15', active);
                el.classList.toggle('border-white/15', !active);
                el.classList.toggle('bg-white/5', !active);
            });
        }
    };

    MO.refreshTitleMenuUI = function() {
        const btn = document.getElementById('btn-continue-city');
        const meta = document.getElementById('continue-city-meta');
        if (!btn || !meta) return;
        const summary = MO.cityManager && MO.cityManager.getSavedCitySummary
            ? MO.cityManager.getSavedCitySummary()
            : null;
        btn.disabled = !summary;
        if (summary) {
            meta.textContent = `${summary.supervisorName} · #${summary.seed} · ${summary.workers} NPCs`;
        } else {
            meta.textContent = 'Nenhuma cidade salva';
        }
    };

    MO.continueCityFromMenu = function() {
        if (MO.cityManager && MO.cityManager.continueCityGame && MO.cityManager.continueCityGame()) {
            const modal = document.getElementById('city-setup-modal');
            if (modal) modal.classList.add('hidden');
            if (MO.clearCitySelection) MO.clearCitySelection();
            if (MO.syncPhaseUI) MO.syncPhaseUI();
            if (MO.renderNpcRosterUI) MO.renderNpcRosterUI();
            return true;
        }
        return false;
    };

    MO.toggleCityCategory = function(cat) {
        const city = MO.state && MO.state.city;
        const pal = document.getElementById('city-build-palette');
        if (!city || !pal) return null;
        const nextCat = (city.activeCategory === cat) ? null : cat;
        city.activeCategory = nextCat;
        pal.classList.toggle('hidden', !nextCat);
        document.querySelectorAll('[data-cat-group]').forEach(g => {
            g.classList.toggle('hidden', g.getAttribute('data-cat-group') !== nextCat);
        });
        document.querySelectorAll('[data-cat-btn]').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-cat-btn') === nextCat);
        });
        return nextCat;
    };

    MO.clearCitySelection = function() {
        const city = MO.state && MO.state.city;
        if (city) {
            city.activeCategory = null;
            if (MO.cityManager) MO.cityManager.setActiveBuildTool(null);
        }
        const pal = document.getElementById('city-build-palette');
        if (pal) pal.classList.add('hidden');
        document.querySelectorAll('[data-cat-btn]').forEach(b => b.classList.remove('active'));
        if (MO.placementGhost) MO.placementGhost.visible = false;
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
            rosterEl.innerHTML = '<div class="text-slate-400 text-[11px] py-1">Nenhum NPC no mapa ainda. Use o 📱 Celular no canto direito para contratar!</div>';
            return;
        }
        const roleIcons = {
            supervisor: '👷‍♂️',
            lumberjack: '🪓',
            miner: '⛏️',
            farmer: '🌾',
            merchant: '🪙',
            builder: '🧱',
            carpenter: '🪚',
            helper: '👷'
        };
        rosterEl.innerHTML = workers.map(w => {
            const ico = roleIcons[w.role] || '👷';
            const status = w.statusText || 'Disponível';
            const en = Math.round(w.energy !== undefined ? w.energy : 100);
            const hy = Math.round(w.hydration !== undefined ? w.hydration : 100);
            const hu = Math.round(w.hunger !== undefined ? w.hunger : 100);
            return `<div class="bg-white/5 rounded-xl px-2.5 py-1.5 text-[11px] space-y-0.5 border border-white/5">
                <div class="flex items-center justify-between gap-2">
                    <span class="font-semibold text-slate-100 shrink-0">${ico} ${w.name}</span>
                    <span class="text-[10px] text-slate-400">⚡${en}% 💧${hy}% 🍲${hu}%</span>
                </div>
                <div class="text-[10px] text-slate-300 truncate">${status}</div>
            </div>`;
        }).join('');
    };

    MO.setCityBuildTool = function(toolId) {
        if (MO.cityManager) return MO.cityManager.setActiveBuildTool(toolId);
        return null;
    };

    MO.toggleSandboxMode = function(forceVal) {
        if (MO.cityManager) return MO.cityManager.toggleSandboxMode(forceVal);
        return false;
    };

    MO.toggleCityPalette = function(forceVal) {
        const pal = document.getElementById('city-build-palette');
        const btn = document.getElementById('btn-city-build-toggle');
        if (!pal) return false;
        const nextOpen = (typeof forceVal === 'boolean') ? forceVal : pal.classList.contains('hidden');
        pal.classList.toggle('hidden', !nextOpen);
        if (btn) btn.classList.toggle('active', nextOpen);
        return nextOpen;
    };

    MO.startCityFromMenu = function() {
        const nameEl = document.getElementById('setup-sup-name');
        const seedEl = document.getElementById('setup-seed');
        const biomeEl = document.getElementById('setup-biome');
        const sbEl = document.getElementById('setup-sandbox');
        const supName = nameEl && nameEl.value ? nameEl.value.trim() : 'Supervisor Beto';
        const seed = seedEl && seedEl.value ? Number(seedEl.value) : MO.state.seed;
        const biome = biomeEl && biomeEl.value ? biomeEl.value : MO.state.biome;
        const sandboxMode = sbEl ? Boolean(sbEl.checked) : false;
        if (MO.cityManager) {
            MO.cityManager.startCityGame({ supervisorName: supName, seed, biome, sandboxMode });
        }
        if (MO.clearCitySelection) MO.clearCitySelection();
        if (MO.syncPhaseUI) MO.syncPhaseUI();
        if (MO.renderNpcRosterUI) MO.renderNpcRosterUI();
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
