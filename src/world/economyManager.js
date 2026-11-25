// =========================================================================
// WORLD: ECONOMY MANAGER 2.0 (CADEIAS PRODUTIVAS, CONTRATOS, FLUXO DE CAIXA)
// =========================================================================
(function(MO) {
    const CYCLE_DURATION = 35.0; // segundos de simulação por ciclo econômico

    const CONTRACT_CATALOG = [
        {
            id: 'road-access',
            client: 'Prefeitura',
            title: 'Acesso Pioneiro (6m de Via)',
            desc: 'Construa pelo menos 6 metros de estrada ou rua pavimentada.',
            advance: 12,
            reward: 25,
            bonus: null,
            checkProgress: (state) => {
                let built = 0;
                if (state.city && state.city.roadTiles) {
                    state.city.roadTiles.forEach(t => { if (t.built) built++; });
                }
                return { current: built, target: 6, done: built >= 6 };
            }
        },
        {
            id: 'first-farm',
            client: 'Cooperativa Agrícola',
            title: 'Produção de Alimentos',
            desc: 'Construa 1 Fazenda para abastecer moradores e trabalhadores.',
            advance: 10,
            reward: 28,
            bonus: { food: 6 },
            checkProgress: (state) => {
                const count = (state.city && state.city.structures || []).filter(s => s.kind === 'farm' && s.built).length;
                return { current: count, target: 1, done: count >= 1 };
            }
        },
        {
            id: 'first-sawmill',
            client: 'Carpintaria do Vale',
            title: 'Serraria Beneficiadora',
            desc: 'Construa 1 Serraria para transformar toras em tábuas e receita.',
            advance: 10,
            reward: 30,
            bonus: { wood: 6 },
            checkProgress: (state) => {
                const count = (state.city && state.city.structures || []).filter(s => s.kind === 'lumberyard' && s.built).length;
                return { current: count, target: 1, done: count >= 1 };
            }
        },
        {
            id: 'first-market',
            client: 'Associação Comercial',
            title: 'Mercado da Comunidade',
            desc: 'Construa 1 Mercado para comercializar excedentes de madeira, pedra e alimentos.',
            advance: 15,
            reward: 40,
            bonus: null,
            checkProgress: (state) => {
                const count = (state.city && state.city.structures || []).filter(s => s.kind === 'market' && s.built).length;
                return { current: count, target: 1, done: count >= 1 };
            }
        },
        {
            id: 'family-house',
            client: 'Família Silva',
            title: 'Primeira Residência',
            desc: 'Construa 1 Casa para atrair moradores e gerar arrecadação.',
            advance: 18,
            reward: 55,
            bonus: null,
            checkProgress: (state) => {
                const doneHouses = (MO.constructionManager ? MO.constructionManager.getCompletedConstructions() : [])
                    .filter(c => c.mode === 'house').length;
                const activeHouse = (MO.constructionManager && MO.constructionManager.getActiveConstruction() && MO.constructionManager.getActiveConstruction().mode === 'house') ? 1 : 0;
                return { current: doneHouses, target: 1, done: doneHouses >= 1, inProgress: activeHouse > 0 };
            }
        },
        {
            id: 'river-bridge',
            client: 'Engenharia Municipal',
            title: 'Ponte sobre o Rio',
            desc: 'Construa 1 Ponte ligando as margens da cidade.',
            advance: 25,
            reward: 80,
            bonus: null,
            checkProgress: () => {
                const done = (MO.constructionManager ? MO.constructionManager.getCompletedConstructions() : [])
                    .filter(c => c.mode === 'bridge').length;
                return { current: done, target: 1, done: done >= 1 };
            }
        },
        {
            id: 'city-building',
            client: 'Consórcio Urbano',
            title: 'Edifício Residencial',
            desc: 'Construa 1 Prédio Multi-Andar para expandir a população.',
            advance: 35,
            reward: 110,
            bonus: null,
            checkProgress: () => {
                const done = (MO.constructionManager ? MO.constructionManager.getCompletedConstructions() : [])
                    .filter(c => c.mode === 'building').length;
                return { current: done, target: 1, done: done >= 1 };
            }
        },
        {
            id: 'lookout-tower',
            client: 'Defesa Civil',
            title: 'Torre Mirante & Farol',
            desc: 'Construa 1 Torre para orientar e proteger a região.',
            advance: 30,
            reward: 95,
            bonus: null,
            checkProgress: () => {
                const done = (MO.constructionManager ? MO.constructionManager.getCompletedConstructions() : [])
                    .filter(c => c.mode === 'tower').length;
                return { current: done, target: 1, done: done >= 1 };
            }
        },
        {
            id: 'reforest-valley',
            client: 'Secretaria Ambiental',
            title: 'Reflorestamento do Vale',
            desc: 'Replante 2 novas mudas de árvores onde houve corte na floresta.',
            advance: 12,
            reward: 35,
            bonus: { wood: 4 },
            checkProgress: () => {
                const count = (MO.chunkManager && MO.chunkManager.getReplantedCount) ? MO.chunkManager.getReplantedCount() : 0;
                return { current: count, target: 2, done: count >= 2 };
            }
        }
    ];

    function ensureEconomyState() {
        const state = MO.state;
        if (!state) return null;
        if (!state.economy) {
            state.economy = { sandboxMode: false, wood: 24, stone: 20, iron: 8, food: 24, coins: 60 };
        }
        const eco = state.economy;
        if (typeof eco.residents !== 'number') eco.residents = 0;
        if (typeof eco.reputation !== 'number') eco.reputation = 10;
        if (typeof eco.cycleTimer !== 'number') eco.cycleTimer = 0;
        if (typeof eco.cycleCount !== 'number') eco.cycleCount = 0;
        if (!Array.isArray(eco.activeContracts)) eco.activeContracts = [];
        if (!Array.isArray(eco.completedContracts)) eco.completedContracts = [];
        if (!Array.isArray(eco.journal)) eco.journal = [];
        if (!eco.flowWindow) {
            eco.flowWindow = { woodIn: 0, woodOut: 0, stoneIn: 0, stoneOut: 0, ironIn: 0, ironOut: 0, foodIn: 0, foodOut: 0, coinsIn: 0, coinsOut: 0 };
        }
        if (!eco.lastCycle) {
            eco.lastCycle = { income: 0, expenses: 0, net: 0, foodConsumed: 0, wages: 0, upkeep: 0, rent: 0, unpaidWages: false };
        }
        return eco;
    }

    function getStorageCaps() {
        const state = MO.state;
        const caps = { wood: 45, stone: 45, iron: 28, food: 50 };
        if (!state) return caps;
        const infra = state.villageInfra;
        if (infra && (infra.stockYardsBuilt || infra.yardsBuilt)) {
            caps.wood += 25;
            caps.stone += 25;
            caps.iron += 15;
            caps.food += 15;
        }
        const structs = (state.city && Array.isArray(state.city.structures)) ? state.city.structures : [];
        for (let i = 0; i < structs.length; i++) {
            const st = structs[i];
            if (!st || !st.built) continue;
            if (st.kind === 'lumberyard') caps.wood += 20;
            else if (st.kind === 'farm') caps.food += 20;
            else if (st.kind === 'mine') { caps.stone += 15; caps.iron += 10; }
            else if (st.kind === 'market') { caps.wood += 10; caps.stone += 10; caps.food += 10; }
        }
        return caps;
    }

    function getHousingCapacity() {
        const completed = MO.constructionManager ? MO.constructionManager.getCompletedConstructions() : [];
        let cap = 0;
        for (let i = 0; i < completed.length; i++) {
            const c = completed[i];
            if (c.mode === 'house') cap += 3;
            else if (c.mode === 'building') cap += 8;
        }
        return cap;
    }

    function formatClockLabel() {
        const tod = MO.state && typeof MO.state.timeOfDay === 'number' ? MO.state.timeOfDay : 0.25;
        const hrs = Math.floor(((tod + 0.25) % 1) * 24);
        const mins = Math.floor(((((tod + 0.25) % 1) * 24) - hrs) * 60);
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }

    function logJournal(icon, title, detail = '') {
        const eco = ensureEconomyState();
        if (!eco) return null;
        const entry = {
            id: `j-${Date.now()}-${eco.journal.length}`,
            icon: icon || '📖',
            time: formatClockLabel(),
            title: String(title || ''),
            detail: String(detail || '')
        };
        eco.journal.unshift(entry);
        if (eco.journal.length > 28) eco.journal.length = 28;
        if (typeof document !== 'undefined') {
            const jBadge = document.getElementById('journal-btn-label');
            if (jBadge) jBadge.textContent = String(eco.journal.length);
        }
        if (MO.renderEconomyPanelUI) MO.renderEconomyPanelUI();
        return entry;
    }

    function getJournal(limit = 10) {
        const eco = ensureEconomyState();
        return eco ? eco.journal.slice(0, limit) : [];
    }

    function recordFlow(delta) {
        const eco = ensureEconomyState();
        if (!eco || !delta) return;
        const fw = eco.flowWindow;
        ['wood', 'stone', 'iron', 'food', 'coins'].forEach(k => {
            const v = delta[k];
            if (!v) return;
            if (v > 0) fw[`${k}In`] = (fw[`${k}In`] || 0) + v;
            else fw[`${k}Out`] = (fw[`${k}Out`] || 0) + Math.abs(v);
        });
    }

    function addResourcesWithCaps(delta) {
        const eco = ensureEconomyState();
        if (!eco || !delta) return { added: {} };
        const caps = getStorageCaps();
        const added = {};
        ['wood', 'stone', 'iron', 'food', 'coins'].forEach(k => {
            const val = delta[k];
            if (!val) return;
            if (k === 'coins' || eco.sandboxMode) {
                eco[k] = Math.max(0, eco[k] + val);
                added[k] = val;
            } else {
                const maxCap = caps[k] || 999;
                const before = eco[k];
                eco[k] = Math.max(0, Math.min(maxCap, before + val));
                added[k] = eco[k] - before;
            }
        });
        recordFlow(added);
        return { added, caps };
    }

    // Serraria: transforma 2 toras em tábuas/vigas beneficiadas + margem de venda local
    function processSawmillBatch() {
        const eco = ensureEconomyState();
        if (!eco) return { woodDelta: 0, coinsDelta: 0, processed: false };
        if (eco.sandboxMode || eco.wood >= 2) {
            if (!eco.sandboxMode) {
                eco.wood = Math.max(0, eco.wood - 2);
                recordFlow({ wood: -2 });
            }
            const res = addResourcesWithCaps({ wood: 3, coins: 4 });
            if (MO.state.workbench) {
                MO.state.workbench.cutWood = Math.min(24, (MO.state.workbench.cutWood || 0) + 2);
                if (MO.updateWorkbenchVisuals) MO.updateWorkbenchVisuals();
            }
            if (MO.cityManager && MO.cityManager.syncEconomyUI) MO.cityManager.syncEconomyUI();
            return { woodDelta: (res.added.wood || 0) - 2, coinsDelta: 4, processed: true };
        }
        // Sem toras suficientes: beneficia sobras de madeira local (valor reduzido, sem travar)
        addResourcesWithCaps({ wood: 1, coins: 1 });
        if (MO.cityManager && MO.cityManager.syncEconomyUI) MO.cityManager.syncEconomyUI();
        return { woodDelta: 1, coinsDelta: 1, processed: false };
    }

    // Mercado: comercializa excedentes reais de recursos em vez de criar dinheiro mágico infinito
    function processMarketTrade(hasMarket = false) {
        const eco = ensureEconomyState();
        if (!eco) return { coinsEarned: 0, soldKind: null };

        // Prioriza vender 1 unidade do maior excedente acima da reserva de segurança
        const candidates = [
            { kind: 'iron', reserve: 2, price: hasMarket ? 9 : 6 },
            { kind: 'wood', reserve: 5, price: hasMarket ? 6 : 4 },
            { kind: 'stone', reserve: 5, price: hasMarket ? 6 : 4 },
            { kind: 'food', reserve: 7, price: hasMarket ? 5 : 3 }
        ];

        let chosen = null;
        for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i];
            if (eco[c.kind] > c.reserve) {
                if (!chosen || (eco[c.kind] - c.reserve) > (eco[chosen.kind] - chosen.reserve)) {
                    chosen = c;
                }
            }
        }

        let coinsEarned = 0;
        let soldKind = null;
        if (chosen) {
            if (!eco.sandboxMode) {
                eco[chosen.kind] = Math.max(0, eco[chosen.kind] - 1);
                recordFlow({ [chosen.kind]: -1 });
            }
            coinsEarned = chosen.price;
            soldKind = chosen.kind;
        } else {
            // Sem excedente físico: taxa modesta de intermediação proporcional à atividade da vila
            const builtCount = (MO.state.city && MO.state.city.structures || []).filter(s => s.built).length;
            coinsEarned = hasMarket ? Math.min(4, 2 + Math.floor(builtCount / 2)) : 1;
        }

        addResourcesWithCaps({ coins: coinsEarned });
        if (MO.cityManager && MO.cityManager.syncEconomyUI) MO.cityManager.syncEconomyUI();
        return { coinsEarned, soldKind };
    }

    function getCatalogContract(id) {
        return CONTRACT_CATALOG.find(c => c.id === id) || null;
    }

    function getContractsSnapshot() {
        const eco = ensureEconomyState();
        const state = MO.state;
        const available = [];
        const active = [];
        const completed = [];

        for (let i = 0; i < CONTRACT_CATALOG.length; i++) {
            const c = CONTRACT_CATALOG[i];
            const progress = c.checkProgress(state);
            const entry = {
                id: c.id,
                client: c.client,
                title: c.title,
                desc: c.desc,
                advance: c.advance,
                reward: c.reward,
                bonus: c.bonus,
                progress
            };
            if (eco.completedContracts.includes(c.id)) {
                completed.push(entry);
            } else if (eco.activeContracts.includes(c.id)) {
                active.push(entry);
            } else if (!progress.done) {
                available.push(entry);
            }
        }
        return { available, active, completed };
    }

    function acceptContract(contractId) {
        const eco = ensureEconomyState();
        const spec = getCatalogContract(contractId);
        if (!eco || !spec) return false;
        if (eco.activeContracts.includes(contractId) || eco.completedContracts.includes(contractId)) {
            return false;
        }
        if (eco.activeContracts.length >= 3) {
            if (MO.showToast) MO.showToast('Limite de 3 contratos ativos simultâneos! Conclua um primeiro.', '📋');
            return false;
        }
        eco.activeContracts.push(contractId);
        addResourcesWithCaps({ coins: spec.advance });
        if (MO.cityManager && MO.cityManager.syncEconomyUI) MO.cityManager.syncEconomyUI();
        if (MO.SoundFX && MO.SoundFX.playSuccessStamp) MO.SoundFX.playSuccessStamp();
        if (MO.showToast) {
            MO.showToast(`📜 Contrato aceito: ${spec.title} (+${spec.advance}🪙 adiantamento)!`, '📜');
        }
        if (MO.renderEconomyPanelUI) MO.renderEconomyPanelUI();
        if (MO.cityManager && MO.cityManager.saveCityState) MO.cityManager.saveCityState();
        return true;
    }

    function evaluateContracts() {
        const eco = ensureEconomyState();
        const state = MO.state;
        if (!eco || !state || eco.activeContracts.length === 0) return [];
        const finishedNow = [];

        for (let i = eco.activeContracts.length - 1; i >= 0; i--) {
            const id = eco.activeContracts[i];
            const spec = getCatalogContract(id);
            if (!spec) {
                eco.activeContracts.splice(i, 1);
                continue;
            }
            const prog = spec.checkProgress(state);
            if (prog.done) {
                eco.activeContracts.splice(i, 1);
                eco.completedContracts.push(id);
                eco.reputation = Math.min(100, (eco.reputation || 10) + 8);
                const payout = { coins: spec.reward, ...(spec.bonus || {}) };
                addResourcesWithCaps(payout);
                finishedNow.push(spec);
                logJournal('🏆', `Contrato concluído: ${spec.title}`, `${spec.client} pagou +${spec.reward}🪙`);
                if (MO.SoundFX && MO.SoundFX.playSuccessStamp) MO.SoundFX.playSuccessStamp();
                if (MO.showToast) {
                    MO.showToast(`🏆 Contrato concluído: ${spec.title}! Recebido +${spec.reward}🪙`, '🏆');
                }
                // Equipe comemora e ganha moral!
                if (Array.isArray(state.workers)) {
                    state.workers.forEach(w => {
                        w.morale = Math.min(100, (w.morale ?? 80) + 10);
                        w.celebrateTimer = 2.4;
                    });
                }
            }
        }

        if (finishedNow.length > 0) {
            if (MO.cityManager && MO.cityManager.syncEconomyUI) MO.cityManager.syncEconomyUI();
            if (MO.renderEconomyPanelUI) MO.renderEconomyPanelUI();
            if (MO.cityManager && MO.cityManager.saveCityState) MO.cityManager.saveCityState();
        }
        return finishedNow;
    }

    function runEconomicCycle() {
        const eco = ensureEconomyState();
        const state = MO.state;
        if (!eco || !state) return null;

        const housingCap = getHousingCapacity();
        const prevResidents = eco.residents || 0;
        // Atrai novos moradores gradualmente quando há moradia disponível e alimentos
        if (housingCap > eco.residents && (eco.sandboxMode || eco.food >= 2)) {
            eco.residents = Math.min(housingCap, eco.residents + Math.min(2, housingCap - eco.residents));
            if (eco.residents > prevResidents) {
                logJournal('🏘️', `+${eco.residents - prevResidents} novo(s) morador(es)`, `População da comunidade: ${eco.residents}/${housingCap}`);
            }
        } else if (housingCap < eco.residents) {
            eco.residents = housingCap;
        }
        // Ciclo ecológico: mudas replantadas crescem a cada ciclo
        if (MO.chunkManager && MO.chunkManager.growSaplings) {
            const grown = MO.chunkManager.growSaplings();
            if (grown > 0) logJournal('🌱', `${grown} muda(s) cresceram`, 'A floresta está se regenerando');
        }

        const workers = Array.isArray(state.workers) ? state.workers : [];
        const builtStructs = (state.city && Array.isArray(state.city.structures))
            ? state.city.structures.filter(s => s.built)
            : [];

        let wages = 0;
        for (let i = 0; i < workers.length; i++) {
            wages += workers[i].role === 'supervisor' ? 2 : 1;
        }
        const upkeep = builtStructs.length;
        const foodNeeded = Math.max(0, Math.ceil(eco.residents * 0.5 + workers.length * 0.35));

        let foodConsumed = 0;
        let rentIncome = 0;
        let unpaidWages = false;

        if (!eco.sandboxMode) {
            foodConsumed = Math.min(eco.food, foodNeeded);
            eco.food = Math.max(0, eco.food - foodConsumed);
            const fedRatio = foodNeeded > 0 ? (foodConsumed / foodNeeded) : 1;

            // Moradores alimentados pagam aluguel/impostos da cidade
            rentIncome = Math.round(eco.residents * 3 * (0.4 + 0.6 * fedRatio));
            const totalExpenses = wages + upkeep;
            const availableCoins = eco.coins + rentIncome;
            if (availableCoins >= totalExpenses) {
                eco.coins = availableCoins - totalExpenses;
            } else {
                eco.coins = 0;
                unpaidWages = true;
            }

            // Ajusta moral conforme alimentação e salários
            workers.forEach(w => {
                const deltaMorale = (unpaidWages ? -6 : 2) + (fedRatio < 0.6 ? -5 : 2);
                w.morale = Math.max(25, Math.min(100, (w.morale ?? 82) + deltaMorale));
            });
        } else {
            rentIncome = eco.residents * 3;
        }

        const totalIncome = rentIncome + (eco.flowWindow.coinsIn || 0);
        const totalExpenses = wages + upkeep + (eco.flowWindow.coinsOut || 0);
        eco.lastCycle = {
            income: totalIncome,
            expenses: totalExpenses,
            net: totalIncome - totalExpenses,
            foodConsumed,
            wages,
            upkeep,
            rent: rentIncome,
            residents: eco.residents,
            housingCapacity: housingCap,
            unpaidWages
        };
        eco.cycleCount = (eco.cycleCount || 0) + 1;
        eco.flowWindow = { woodIn: 0, woodOut: 0, stoneIn: 0, stoneOut: 0, ironIn: 0, ironOut: 0, foodIn: 0, foodOut: 0, coinsIn: 0, coinsOut: 0 };

        if (unpaidWages && MO.showToast) {
            MO.showToast('⚠️ Caixa zerado! Aceite um Contrato em 📊 Gestão ou exporte excedentes no 📱 Celular.', '🪙');
        }
        if (MO.cityManager && MO.cityManager.syncEconomyUI) MO.cityManager.syncEconomyUI();
        if (MO.renderEconomyPanelUI) MO.renderEconomyPanelUI();
        return eco.lastCycle;
    }

    function update(dt) {
        const state = MO.state;
        if (!state || !state.cityMode) return;
        const eco = ensureEconomyState();
        if (!eco) return;

        evaluateContracts();

        eco.cycleTimer = (eco.cycleTimer || 0) + dt;
        if (eco.cycleTimer >= CYCLE_DURATION) {
            eco.cycleTimer -= CYCLE_DURATION;
            runEconomicCycle();
        }
    }

    function reset() {
        const eco = ensureEconomyState();
        if (!eco) return;
        eco.residents = 0;
        eco.reputation = 10;
        eco.cycleTimer = 0;
        eco.cycleCount = 0;
        eco.activeContracts = [];
        eco.completedContracts = [];
        eco.journal = [];
        eco.flowWindow = { woodIn: 0, woodOut: 0, stoneIn: 0, stoneOut: 0, ironIn: 0, ironOut: 0, foodIn: 0, foodOut: 0, coinsIn: 0, coinsOut: 0 };
        eco.lastCycle = { income: 0, expenses: 0, net: 0, foodConsumed: 0, wages: 0, upkeep: 0, rent: 0, residents: 0, housingCapacity: 0, unpaidWages: false };
    }

    function getDashboardSummary() {
        const eco = ensureEconomyState();
        const state = MO.state;
        const caps = getStorageCaps();
        const housingCapacity = getHousingCapacity();
        const workers = (state && Array.isArray(state.workers)) ? state.workers : [];
        const avgMorale = workers.length > 0
            ? Math.round(workers.reduce((acc, w) => acc + (w.morale ?? 82), 0) / workers.length)
            : 100;
        const activeSites = (MO.constructionManager && MO.constructionManager.getActiveConstruction() ? 1 : 0) +
            ((state && state.city && state.city.structures) ? state.city.structures.filter(s => !s.built).length : 0);
        return {
            sandboxMode: Boolean(eco.sandboxMode),
            coins: Math.floor(eco.coins || 0),
            netPerCycle: eco.lastCycle ? eco.lastCycle.net : 0,
            residents: eco.residents || 0,
            housingCapacity,
            workersCount: workers.length,
            activeSites,
            avgMorale,
            reputation: eco.reputation || 10,
            resources: {
                wood: { current: Math.floor(eco.wood || 0), cap: caps.wood, inFlow: eco.flowWindow.woodIn || 0, outFlow: eco.flowWindow.woodOut || 0 },
                stone: { current: Math.floor(eco.stone || 0), cap: caps.stone, inFlow: eco.flowWindow.stoneIn || 0, outFlow: eco.flowWindow.stoneOut || 0 },
                iron: { current: Math.floor(eco.iron || 0), cap: caps.iron, inFlow: eco.flowWindow.ironIn || 0, outFlow: eco.flowWindow.ironOut || 0 },
                food: { current: Math.floor(eco.food || 0), cap: caps.food, inFlow: eco.flowWindow.foodIn || 0, outFlow: eco.flowWindow.foodOut || 0 }
            },
            lastCycle: { ...eco.lastCycle },
            contracts: getContractsSnapshot(),
            journal: getJournal(8)
        };
    }

    function serialize() {
        const eco = ensureEconomyState();
        return {
            residents: eco.residents || 0,
            reputation: eco.reputation || 10,
            cycleCount: eco.cycleCount || 0,
            activeContracts: [...(eco.activeContracts || [])],
            completedContracts: [...(eco.completedContracts || [])],
            journal: (eco.journal || []).slice(0, 20),
            lastCycle: { ...(eco.lastCycle || {}) }
        };
    }

    function restore(snap) {
        reset();
        if (!snap || typeof snap !== 'object') return;
        const eco = ensureEconomyState();
        if (typeof snap.residents === 'number') eco.residents = snap.residents;
        if (typeof snap.reputation === 'number') eco.reputation = snap.reputation;
        if (typeof snap.cycleCount === 'number') eco.cycleCount = snap.cycleCount;
        if (Array.isArray(snap.activeContracts)) eco.activeContracts = snap.activeContracts.slice();
        if (Array.isArray(snap.completedContracts)) eco.completedContracts = snap.completedContracts.slice();
        if (Array.isArray(snap.journal)) eco.journal = snap.journal.slice(0, 28);
        if (snap.lastCycle && typeof snap.lastCycle === 'object') Object.assign(eco.lastCycle, snap.lastCycle);
    }

    MO.economyManager = {
        CYCLE_DURATION,
        CONTRACT_CATALOG,
        ensureEconomyState,
        getStorageCaps,
        getHousingCapacity,
        logJournal,
        getJournal,
        recordFlow,
        addResourcesWithCaps,
        processSawmillBatch,
        processMarketTrade,
        getContractsSnapshot,
        acceptContract,
        evaluateContracts,
        runEconomicCycle,
        update,
        reset,
        getDashboardSummary,
        serialize,
        restore
    };
})(window.MO = window.MO || {});
