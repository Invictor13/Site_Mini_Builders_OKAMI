// =========================================================================
// WORLD: CITY MANAGER (GESTÃO DA CIDADE INFINITA, ECONOMIA & POSICIONAMENTO LIVRE)
// =========================================================================
(function(MO) {
    const BUILD_COSTS = {
        'dirt-road': { wood: 0, stone: 0, iron: 0, coins: 0 },
        'paved-street': { wood: 0, stone: 1, iron: 0, coins: 1 },
        unloading: { wood: 1, stone: 1, iron: 0, coins: 0 },
        mixer: { wood: 1, stone: 2, iron: 0, coins: 0 },
        workbench: { wood: 2, stone: 0, iron: 0, coins: 0 },
        'mess-hall': { wood: 3, stone: 0, iron: 0, coins: 2 },
        tent: { wood: 2, stone: 0, iron: 0, coins: 1 },
        floodlight: { wood: 1, stone: 0, iron: 1, coins: 2 },
        stockyard: { wood: 2, stone: 1, iron: 0, coins: 0 },
        'house-auto': { wood: 4, stone: 2, iron: 0, coins: 4 },
        'house-custom-cell': { wood: 1, stone: 1, iron: 0, coins: 1 },
        building: { wood: 6, stone: 6, iron: 4, coins: 12 },
        bridge: { wood: 5, stone: 5, iron: 3, coins: 8 },
        tower: { wood: 4, stone: 4, iron: 5, coins: 10 },
        farm: { wood: 3, stone: 0, iron: 0, coins: 4 },
        lumberyard: { wood: 2, stone: 0, iron: 0, coins: 3 },
        mine: { wood: 3, stone: 2, iron: 0, coins: 5 },
        market: { wood: 4, stone: 2, iron: 0, coins: 6 }
    };

    const TOOL_FOOTPRINTS = {
        'dirt-road': { w: 1.0, h: 0.08, d: 1.0 },
        'paved-street': { w: 1.0, h: 0.09, d: 1.0 },
        unloading: { w: 2.4, h: 0.35, d: 1.8 },
        mixer: { w: 1.8, h: 0.9, d: 1.5 },
        workbench: { w: 2.0, h: 0.95, d: 1.2 },
        'mess-hall': { w: 2.2, h: 1.4, d: 1.8 },
        tent: { w: 1.6, h: 1.25, d: 1.6 },
        floodlight: { w: 0.8, h: 2.2, d: 0.8 },
        stockyard: { w: 3.0, h: 0.8, d: 2.6 },
        'house-auto': { w: 4.0, h: 2.0, d: 4.0 },
        'house-custom': { w: 1.0, h: 0.35, d: 1.0 },
        building: { w: 4.4, h: 3.8, d: 4.0 },
        bridge: { w: 6.2, h: 1.2, d: 2.6 },
        tower: { w: 2.8, h: 4.2, d: 2.8 },
        farm: { w: 2.8, h: 0.45, d: 2.6 },
        lumberyard: { w: 2.6, h: 1.25, d: 2.4 },
        mine: { w: 2.6, h: 1.25, d: 2.4 },
        market: { w: 2.6, h: 1.4, d: 2.2 }
    };

    const PROF_HIRE_COST = {
        builder: { coins: 6, food: 2 },
        lumberjack: { coins: 5, food: 2 },
        miner: { coins: 6, food: 2 },
        farmer: { coins: 5, food: 1 },
        merchant: { coins: 8, food: 2 }
    };

    let dragState = { active: false, startCell: null, endCell: null, tool: null };
    let seqCounter = 1;
    const roadMeshMap = new Map();

    function getEconomy() {
        return MO.state && MO.state.economy ? MO.state.economy : null;
    }

    function canAfford(cost) {
        const eco = getEconomy();
        if (!eco || eco.sandboxMode || !cost) return true;
        return ['wood', 'stone', 'iron', 'food', 'coins'].every(k => !cost[k] || eco[k] >= cost[k]);
    }

    function spendResources(cost) {
        const eco = getEconomy();
        if (!eco || eco.sandboxMode || !cost) return true;
        if (!canAfford(cost)) return false;
        ['wood', 'stone', 'iron', 'food', 'coins'].forEach(k => {
            if (cost[k]) eco[k] = Math.max(0, eco[k] - cost[k]);
        });
        syncEconomyUI();
        return true;
    }

    function addResources(delta) {
        const eco = getEconomy();
        if (!eco || !delta) return;
        ['wood', 'stone', 'iron', 'food', 'coins'].forEach(k => {
            if (delta[k]) eco[k] = Math.max(0, eco[k] + delta[k]);
        });
        syncEconomyUI();
    }

    function toggleSandboxMode(forceVal) {
        const eco = getEconomy();
        if (!eco) return false;
        eco.sandboxMode = (typeof forceVal === 'boolean') ? forceVal : !eco.sandboxMode;
        syncEconomyUI();
        if (MO.showToast) {
            MO.showToast(
                eco.sandboxMode
                    ? '🎨 Modo Sandbox Livre ATIVO: construa tudo sem custos!'
                    : '💼 Modo Gestão Real ATIVO: construções consomem recursos da cidade!',
                eco.sandboxMode ? '🎨' : '💼'
            );
        }
        return eco.sandboxMode;
    }

    function syncEconomyUI() {
        const eco = getEconomy();
        if (!eco || typeof document === 'undefined') return;
        const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
        setEl('eco-wood', eco.sandboxMode ? '∞' : Math.floor(eco.wood));
        setEl('eco-stone', eco.sandboxMode ? '∞' : Math.floor(eco.stone));
        setEl('eco-iron', eco.sandboxMode ? '∞' : Math.floor(eco.iron));
        setEl('eco-food', eco.sandboxMode ? '∞' : Math.floor(eco.food));
        setEl('eco-coins', eco.sandboxMode ? '∞' : Math.floor(eco.coins));
        const sbBtn = document.getElementById('btn-sandbox-mode');
        const sbLbl = document.getElementById('sandbox-btn-label');
        if (sbBtn) sbBtn.classList.toggle('active', eco.sandboxMode);
        if (sbLbl) sbLbl.textContent = eco.sandboxMode ? 'Sandbox' : 'Gestão';
        const dot = document.getElementById('phone-alert-dot');
        if (dot) {
            const lowRes = !eco.sandboxMode && (eco.wood <= 1 || eco.stone <= 1);
            dot.classList.toggle('hidden', !lowRes);
        }
    }

    function updateSizeBadge(text = '') {
        if (typeof document === 'undefined') return;
        const badge = document.getElementById('city-size-badge');
        if (!badge) return;
        badge.textContent = text;
        badge.classList.toggle('hidden', !text);
    }

    function isPlacementValidAt(pt, toolId) {
        if (!pt || !toolId) return false;
        const y = MO.getTerrainHeight ? MO.getTerrainHeight(pt.x, pt.z) : 0.28;
        if (toolId === 'bridge') return true;
        return y >= (MO.WATER_LEVEL + 0.14);
    }

    function updatePlacementPreview(pt) {
        const ghost = MO.placementGhost;
        const city = MO.state && MO.state.city;
        if (!ghost || !city || !city.activeBuildTool || !pt) {
            if (ghost) ghost.visible = false;
            return;
        }
        const tool = city.activeBuildTool;
        const fp = TOOL_FOOTPRINTS[tool] || { w: 2.0, h: 0.6, d: 2.0 };
        const y = MO.getTerrainHeight ? MO.getTerrainHeight(pt.x, pt.z) : 0.28;
        const valid = isPlacementValidAt(pt, tool);
        ghost.scale.set(fp.w, fp.h, fp.d);
        const snapX = (tool === 'dirt-road' || tool === 'paved-street' || tool === 'house-custom') ? (Math.floor(pt.x) + 0.5) : pt.x;
        const snapZ = (tool === 'dirt-road' || tool === 'paved-street' || tool === 'house-custom') ? (Math.floor(pt.z) + 0.5) : pt.z;
        ghost.position.set(snapX, Math.max(MO.WATER_LEVEL + 0.05, y) + fp.h * 0.5, snapZ);
        if (ghost.material && ghost.material.color) {
            ghost.material.color.setHex(valid ? (tool === 'bridge' ? 0x38bdf8 : 0x22c55e) : 0xef4444);
        }
        ghost.visible = true;
    }

    function setActiveBuildTool(toolId) {
        const city = MO.state && MO.state.city;
        if (!city) return null;
        city.activeBuildTool = (city.activeBuildTool === toolId || !toolId) ? null : toolId;
        dragState.active = false;
        if (MO.selectionPreview) MO.selectionPreview.visible = false;
        if (MO.placementGhost && !city.activeBuildTool) MO.placementGhost.visible = false;
        updateSizeBadge('');
        if (typeof document !== 'undefined') {
            document.querySelectorAll('[data-city-tool]').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-city-tool') === city.activeBuildTool);
            });
        }
        const toolLabels = {
            'dirt-road': '🛣️ Estrada de Terra (arraste linha reta A→B)',
            'paved-street': '🏙️ Rua Pavimentada (arraste linha reta A→B)',
            unloading: '🚚 Baia de Descarga (clique onde posicionar)',
            mixer: '🧱 Masseira (clique onde montar)',
            workbench: '🪚 Bancada de Madeira (clique onde montar)',
            'mess-hall': '🍲 Lanchonete / Refeitório (clique onde montar)',
            tent: '⛺ Barraca de Descanso (clique onde armar)',
            floodlight: '💡 Torre de Refletor (clique onde instalar)',
            stockyard: '📦 Depósito / Pátio de Materiais (clique onde montar)',
            'house-auto': '🏠 Casa Automática (clique no lote)',
            'house-custom': '📐 Casa Personalizada (arraste L×C no terreno)',
            building: '🏢 Prédio Comercial (clique no terreno)',
            bridge: '🌉 Ponte sobre Rio (clique próximo à água)',
            tower: '🗼 Torre / Farol (clique onde construir)',
            farm: '🌾 Fazenda (produz Comida · clique no mapa)',
            lumberyard: '🪵 Serraria (produz Madeira · clique no mapa)',
            mine: '⛏️ Mina / Pedreira (produz Pedra/Ferro)',
            market: '🏪 Mercado (Comerciante gera Moedas)'
        };
        if (city.activeBuildTool && MO.showToast) {
            MO.showToast(toolLabels[city.activeBuildTool] || city.activeBuildTool, '🏗️');
        }
        return city.activeBuildTool;
    }

    function renderCityRoadTile(tile) {
        if (!tile || !MO.groups || !MO.groups.cityInfra) return null;
        const key = `${tile.gx},${tile.gz}`;
        const prev = roadMeshMap.get(key);
        if (prev && MO.resources) {
            MO.resources.removeAndDispose(MO.groups.cityInfra, prev);
            roadMeshMap.delete(key);
        }
        const g = new THREE.Group();
        const ty = MO.getTerrainHeight ? MO.getTerrainHeight(tile.x, tile.z) : (MO.PLATEAU_Y || 0.28);
        const y = Math.max(MO.WATER_LEVEL + 0.14, ty);
        g.position.set(tile.x, y, tile.z);

        const city = MO.state && MO.state.city;
        const hasN = city && city.roadTiles.has(`${tile.gx},${tile.gz - 1}`);
        const hasS = city && city.roadTiles.has(`${tile.gx},${tile.gz + 1}`);
        const hasW = city && city.roadTiles.has(`${tile.gx - 1},${tile.gz}`);
        const hasE = city && city.roadTiles.has(`${tile.gx + 1},${tile.gz}`);
        const verticalFlow = (hasN || hasS) && !(hasW || hasE);

        if (!tile.built) {
            const mark = new THREE.Mesh(
                new THREE.BoxGeometry(1.18, 0.03, 1.18),
                new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.38 })
            );
            mark.position.y = 0.02;
            g.add(mark);
        } else if (tile.kind === 'paved') {
            const curb = new THREE.Mesh(
                new THREE.BoxGeometry(1.56, 0.06, 1.56),
                MO.mats.concrete || MO.mats.stone
            );
            curb.position.y = 0.03;
            curb.receiveShadow = true;
            const asphalt = new THREE.Mesh(
                new THREE.BoxGeometry(1.26, 0.075, 1.26),
                new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.78 })
            );
            asphalt.position.y = 0.04;
            asphalt.receiveShadow = true;
            const dash = new THREE.Mesh(
                new THREE.BoxGeometry(verticalFlow ? 0.08 : 0.44, 0.082, verticalFlow ? 0.44 : 0.08),
                new THREE.MeshBasicMaterial({ color: 0xf8fafc })
            );
            dash.position.y = 0.042;
            g.add(curb, asphalt, dash);
        } else {
            const dirtBed = new THREE.Mesh(
                new THREE.BoxGeometry(1.52, 0.055, 1.52),
                new THREE.MeshStandardMaterial({ color: 0x8c6844, roughness: 0.96 })
            );
            dirtBed.position.y = 0.025;
            dirtBed.receiveShadow = true;
            const trackMat = new THREE.MeshStandardMaterial({ color: 0x6b4d32, roughness: 0.98 });
            const t1 = new THREE.Mesh(new THREE.BoxGeometry(verticalFlow ? 0.16 : 1.46, 0.06, verticalFlow ? 1.46 : 0.16), trackMat);
            t1.position.set(verticalFlow ? -0.26 : 0, 0.028, verticalFlow ? 0 : -0.26);
            const t2 = new THREE.Mesh(new THREE.BoxGeometry(verticalFlow ? 0.16 : 1.46, 0.06, verticalFlow ? 1.46 : 0.16), trackMat);
            t2.position.set(verticalFlow ? 0.26 : 0, 0.028, verticalFlow ? 0 : 0.26);
            g.add(dirtBed, t1, t2);
        }
        MO.groups.cityInfra.add(g);
        roadMeshMap.set(key, g);
        return g;
    }

    function paintRoadOrStreet(pt, kind = 'dirt') {
        const key = `${Math.floor(pt.x)},${Math.floor(pt.z)}`;
        const city = MO.state.city;
        if (city.roadTiles.has(key) && city.roadTiles.get(key).kind === kind) return false;
        const cost = BUILD_COSTS[kind === 'paved' ? 'paved-street' : 'dirt-road'];
        if (!spendResources(cost)) {
            if (MO.showToast) MO.showToast('Recursos insuficientes para pavimentar rua!', '⚠️');
            return false;
        }
        const instantOrQueued = MO.state.economy.sandboxMode || (MO.state.workers && MO.state.workers.length === 0);
        const tile = { gx: Math.floor(pt.x), gz: Math.floor(pt.z), x: Math.floor(pt.x) + 0.5, z: Math.floor(pt.z) + 0.5, kind, built: instantOrQueued, res: false };
        city.roadTiles.set(key, tile);
        if (MO.chunkManager) {
            MO.chunkManager.paintLevelArea(tile.x, tile.z, 1.5, 0.9, MO.PLATEAU_Y);
            MO.chunkManager.paintRoadCell(tile.x, tile.z, kind, instantOrQueued, 1);
        }
        renderCityRoadTile(tile);
        if (MO.state.villageInfra && MO.state.villageInfra.roadSegments) {
            if (!instantOrQueued) {
                MO.state.villageInfra.roadSegments.push({ x: tile.x, z: tile.z, kind, built: false, res: false, bank: 'city', cityKey: key });
                MO.state.villageInfra.demarcated = true;
            } else {
                MO.state.villageInfra.roadBuilt = true;
                if (MO.flushQueuedTruckIfReady) MO.flushQueuedTruckIfReady();
            }
        }
        if (MO.SoundFX && MO.SoundFX.playDirtShovel) MO.SoundFX.playDirtShovel();
        return true;
    }

    function createStructureMesh(kind, x, z, built = false) {
        const g = new THREE.Group();
        const y = MO.getTerrainHeight ? MO.getTerrainHeight(x, z) : 0.28;
        g.position.set(x, y, z);

        const markerMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.45 });
        const pad = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 2.6), MO.mats.concreteDark);
        pad.position.y = 0.04;
        const guide = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 2.4), markerMat);
        guide.position.y = 0.09;
        guide.visible = !built;
        g.add(pad, guide);

        const builtGroup = new THREE.Group();
        builtGroup.visible = built;

        if (kind === 'farm') {
            for (let r = -1; r <= 1; r++) {
                const row = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.10, 0.36), MO.mats.wood);
                row.position.set(0, 0.10, r * 0.65);
                const crops = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.22, 0.24), new THREE.MeshStandardMaterial({ color: 0x65a30d, roughness: 0.9 }));
                crops.position.set(0, 0.24, r * 0.65);
                builtGroup.add(row, crops);
            }
        } else if (kind === 'lumberyard') {
            const shed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 1.4), MO.mats.doorWood);
            shed.position.set(0, 0.55, 0);
            const roof = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 1.7), MO.mats.roofTile);
            roof.position.set(0, 1.12, 0);
            builtGroup.add(shed, roof);
        } else if (kind === 'mine') {
            const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.2), MO.mats.stone);
            frame.position.set(0, 0.58, -0.2);
            const cart = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.40, 0.55), MO.mats.steel);
            cart.position.set(0.35, 0.28, 0.65);
            builtGroup.add(frame, cart);
        } else if (kind === 'market') {
            const stall = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.72, 1.2), MO.mats.doorWood);
            stall.position.set(0, 0.40, 0);
            const awning = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.14, 1.5), new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 }));
            awning.position.set(0, 1.25, 0.1);
            awning.rotation.x = 0.18;
            builtGroup.add(stall, awning);
        }

        g.add(builtGroup);
        if (MO.groups && MO.groups.cityInfra) MO.groups.cityInfra.add(g);
        return { root: g, guide, builtGroup };
    }

    function getStraightLineCells(sCell, eCell) {
        const cells = [];
        let x0 = sCell.gx, z0 = sCell.gz;
        const x1 = eCell.gx, z1 = eCell.gz;
        const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
        const sx = x0 < x1 ? 1 : -1;
        const sz = z0 < z1 ? 1 : -1;
        let err = dx - dz;
        while (true) {
            cells.push({ gx: x0, gz: z0 });
            if (x0 === x1 && z0 === z1) break;
            const e2 = 2 * err;
            if (e2 > -dz) { err -= dz; x0 += sx; }
            if (e2 < dx) { err += dx; z0 += sz; }
        }
        return cells;
    }

    function placeProductiveStructure(kind, pt) {
        if (!isPlacementValidAt(pt, kind)) {
            if (MO.showToast) MO.showToast('Local inválido (muito baixo ou na água)! Escolha terreno seco.', '⚠️');
            return null;
        }
        const cost = BUILD_COSTS[kind];
        if (!spendResources(cost)) {
            if (MO.showToast) MO.showToast(`Sem recursos suficientes para ${kind}!`, '⚠️');
            return null;
        }
        const instant = Boolean(MO.state.economy.sandboxMode || (MO.state.workers && MO.state.workers.length === 0));
        if (kind === 'unloading') {
            if (MO.placeUnloadingBay) MO.placeUnloadingBay(pt.x, pt.z, instant);
            MO.paintLevelWeight(pt.x, pt.z, 1.5, 0.88);
            MO.updateTerrainGeometry();
            if (MO.worldManager && MO.worldManager.renderDemarcationLines) MO.worldManager.renderDemarcationLines();
            saveCityState();
            if (MO.showToast) MO.showToast('🚚 Baia de Descarga demarcada!', '🚚');
            return { kind: 'unloading', x: pt.x, z: pt.z };
        }
        if (kind === 'mixer') {
            MO.STATION_MIXER.x = pt.x; MO.STATION_MIXER.z = pt.z;
            if (MO.state.villageInfra) MO.state.villageInfra.mixerPlaced = true;
            if (MO.placeMixerStationOnTerrain) MO.placeMixerStationOnTerrain();
            if (MO.setMixerBuilt) MO.setMixerBuilt(instant);
            if (MO.worldManager && MO.worldManager.renderDemarcationLines) MO.worldManager.renderDemarcationLines();
            saveCityState();
            if (MO.showToast) MO.showToast(instant ? '🧱 Masseira montada!' : '🧱 Masseira demarcada! Operário irá montar.', '🧱');
            return { kind: 'mixer', x: pt.x, z: pt.z };
        }
        if (kind === 'workbench') {
            MO.STATION_WORKBENCH.x = pt.x; MO.STATION_WORKBENCH.z = pt.z;
            if (MO.state.villageInfra) MO.state.villageInfra.workbenchPlaced = true;
            if (MO.initWorkbench) MO.initWorkbench();
            if (MO.setWorkbenchBuilt) MO.setWorkbenchBuilt(instant);
            if (MO.worldManager && MO.worldManager.renderDemarcationLines) MO.worldManager.renderDemarcationLines();
            saveCityState();
            if (MO.showToast) MO.showToast(instant ? '🪚 Bancada de madeira pronta!' : '🪚 Bancada demarcada! Operário irá montar.', '🪵');
            return { kind: 'workbench', x: pt.x, z: pt.z };
        }
        if (kind === 'stockyard') {
            if (MO.placeStockYard) MO.placeStockYard(pt.x, pt.z, instant);
            MO.paintLevelWeight(pt.x, pt.z, 1.8, 0.9);
            MO.updateTerrainGeometry();
            if (MO.worldManager && MO.worldManager.renderDemarcationLines) MO.worldManager.renderDemarcationLines();
            saveCityState();
            if (MO.showToast) MO.showToast('📦 Depósito de materiais posicionado!', '📦');
            return { kind: 'stockyard', x: pt.x, z: pt.z };
        }
        if (kind === 'mess-hall') {
            if (MO.placeMessHall) MO.placeMessHall(pt.x, pt.z, instant);
            saveCityState();
            if (MO.showToast) MO.showToast(instant ? '🍲 Lanchonete montada!' : '🍲 Lanchonete demarcada! Operário irá montar.', '🍲');
            return { kind: 'mess-hall', x: pt.x, z: pt.z };
        }
        if (kind === 'tent') {
            if (MO.placeCampTent) MO.placeCampTent(pt.x, pt.z, instant);
            saveCityState();
            if (MO.showToast) MO.showToast(instant ? '⛺ Barraca armada!' : '⛺ Barraca demarcada! Operário irá armar.', '⛺');
            return { kind: 'tent', x: pt.x, z: pt.z };
        }
        if (kind === 'floodlight') {
            if (MO.placeFloodlight) MO.placeFloodlight(pt.x, pt.z, instant);
            saveCityState();
            if (MO.showToast) MO.showToast(instant ? '💡 Refletor instalado!' : '💡 Refletor demarcado!', '💡');
            return { kind: 'floodlight', x: pt.x, z: pt.z };
        }

        const builtNow = Boolean(MO.state.economy.sandboxMode);
        const visuals = createStructureMesh(kind, pt.x, pt.z, builtNow);
        const rec = {
            id: `city-st-${seqCounter++}`,
            kind,
            x: pt.x,
            z: pt.z,
            built: builtNow,
            res: false,
            prodTimer: 0,
            mesh: visuals.root,
            guide: visuals.guide,
            builtGroup: visuals.builtGroup
        };
        MO.state.city.structures.push(rec);
        MO.paintLevelWeight(pt.x, pt.z, 1.6, 0.9);
        MO.updateTerrainGeometry();
        if (MO.SoundFX && MO.SoundFX.playHammerWood) MO.SoundFX.playHammerWood();
        saveCityState();
        if (MO.showToast) MO.showToast(`${kind.toUpperCase()} demarcado na cidade! Trabalhadores irão construir.`, '🏗️');
        return rec;
    }

    function placeDynamicConstruction(kind, pt, customCells = null) {
        const state = MO.state;
        const cost = (kind === 'house-custom' && customCells && customCells.size > 0)
            ? {
                wood: customCells.size * BUILD_COSTS['house-custom-cell'].wood,
                stone: customCells.size * BUILD_COSTS['house-custom-cell'].stone,
                coins: customCells.size * BUILD_COSTS['house-custom-cell'].coins
            }
            : BUILD_COSTS[kind === 'house-auto' ? 'house-auto' : kind];

        if (!spendResources(cost)) {
            if (MO.showToast) MO.showToast(`Sem recursos para construir ${kind}! Colha mais materiais ou use Sandbox.`, '⚠️');
            return null;
        }

        // Arquiva construção anterior se concluída antes de abrir o novo canteiro livre
        const modeMap = { 'house-auto': 'house', 'house-custom': 'house', bridge: 'bridge', building: 'building', tower: 'tower' };
        const targetMode = modeMap[kind] || 'house';
        if (MO.constructionManager && MO.constructionManager.getActiveConstruction()) {
            MO.worldManager.archiveAndAdvanceToNextLot(targetMode);
        }

        let ox = Math.round(pt.x);
        let oz = Math.round(pt.z);
        let halfW = 2.0, halfD = 2.0;

        if (customCells && customCells.size > 0) {
            const xs = [], zs = [];
            customCells.forEach(k => { const [gx, gz] = k.split(',').map(Number); xs.push(gx); zs.push(gz); });
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minZ = Math.min(...zs), maxZ = Math.max(...zs);
            ox = (minX + maxX + 1) * 0.5;
            oz = (minZ + maxZ + 1) * 0.5;
            halfW = Math.max(1.5, (maxX - minX + 1) * 0.5);
            halfD = Math.max(1.5, (maxZ - minZ + 1) * 0.5);
        }

        const lotId = `city-lot-${seqCounter++}`;
        const labels = { house: 'Casa da Cidade', bridge: 'Ponte da Cidade', building: 'Prédio Urbano', tower: 'Torre da Cidade' };
        const lot = MO.regionManager.registerLot({
            id: lotId,
            regionId: 'main-valley',
            label: `${labels[targetMode]} #${seqCounter - 1}`,
            originX: ox,
            originZ: oz,
            halfW,
            halfD,
            allowedModes: [targetMode],
            bank: 'city',
            status: 'active'
        });
        MO.regionManager.setActiveLot(lot.id);

        state.mode = targetMode;
        if (MO.constructionManager) {
            const c = MO.constructionManager.startConstruction({ lotId: lot.id, regionId: 'main-valley', mode: targetMode, seed: state.seed, phase: 1 });
            lot.constructionId = c.id;
        }

        MO.paintLevelWeight(ox, oz, Math.max(halfW, halfD) + 0.8, 0.95);
        MO.updateTerrainGeometry();

        if (targetMode === 'house') {
            if (MO.modes.house && MO.modes.house.onInit) MO.modes.house.onInit();
            if (customCells && customCells.size > 0) {
                state.occupiedCells = new Set(customCells);
                state.muros = [];
                state.stairs = [];
                MO.rebuildBlueprintFromCells();
                if (state.walls.length > 0) MO.toggleWallOpening(state.walls[0], 'door');
                MO.advanceToPhase2();
            } else {
                MO.loadPresetHouse();
                MO.advanceToPhase2();
            }
        } else {
            if (MO.modes[targetMode] && MO.modes[targetMode].onInit) MO.modes[targetMode].onInit();
            if (MO.modes[targetMode] && MO.modes[targetMode].onStartPhase1) MO.modes[targetMode].onStartPhase1();
        }

        if (MO.worldManager && MO.worldManager.renderLotMarkers) MO.worldManager.renderLotMarkers();
        if (MO.invalidateNavigationCache) MO.invalidateNavigationCache();
        if (MO.syncPhaseUI) MO.syncPhaseUI();
        saveCityState();
        if (MO.showToast) MO.showToast(`${lot.label} posicionada em (${Math.round(ox)}, ${Math.round(oz)})!`, '🏗️');
        return lot;
    }

    const SUPPORT_AND_PROD_TOOLS = new Set([
        'farm', 'lumberyard', 'mine', 'market',
        'unloading', 'mixer', 'workbench', 'mess-hall', 'tent', 'floodlight', 'stockyard'
    ]);

    function handlePlacementPointerDown(pt) {
        const tool = MO.state.city.activeBuildTool;
        if (!tool || !pt) return false;

        if (tool === 'dirt-road' || tool === 'paved-street') {
            const c = MO.worldToGrid(pt);
            dragState = { active: true, startCell: c, endCell: c, tool };
            if (MO.selectionPreview && MO.selectionPreview.material) {
                MO.selectionPreview.material.color.setHex(tool === 'paved-street' ? 0x94a3b8 : 0xd97706);
                if (MO.updateSelectionPreview) MO.updateSelectionPreview(c, c);
            }
            updateSizeBadge('1 m');
            return true;
        }
        if (tool === 'house-custom') {
            const c = MO.worldToGrid(pt);
            dragState = { active: true, startCell: c, endCell: c, tool };
            if (MO.selectionPreview && MO.selectionPreview.material) {
                MO.selectionPreview.material.color.setHex(0x38bdf8);
                if (MO.updateSelectionPreview) MO.updateSelectionPreview(c, c);
            }
            updateSizeBadge('Casa: 1×1 m');
            return true;
        }
        if (tool === 'house-auto' || tool === 'building' || tool === 'bridge' || tool === 'tower') {
            if (!isPlacementValidAt(pt, tool)) {
                if (MO.showToast) MO.showToast('Local inválido (sobre água)! Escolha terreno firme.', '⚠️');
                return true;
            }
            placeDynamicConstruction(tool, pt);
            return true;
        }
        if (SUPPORT_AND_PROD_TOOLS.has(tool)) {
            placeProductiveStructure(tool, pt);
            return true;
        }
        return false;
    }

    function handlePlacementPointerMove(pt) {
        if (!pt) return false;
        if (!dragState.active) {
            updatePlacementPreview(pt);
            return false;
        }
        if (dragState.tool === 'dirt-road' || dragState.tool === 'paved-street') {
            const c = MO.worldToGrid(pt);
            dragState.endCell = c;
            const line = getStraightLineCells(dragState.startCell, c);
            if (MO.updateSelectionPreview) MO.updateSelectionPreview(dragState.startCell, c);
            updateSizeBadge(`${dragState.tool === 'paved-street' ? 'Rua' : 'Estrada'}: ${line.length} m`);
            return true;
        }
        if (dragState.tool === 'house-custom') {
            const c = MO.worldToGrid(pt);
            dragState.endCell = c;
            if (MO.updateSelectionPreview) MO.updateSelectionPreview(dragState.startCell, c);
            const w = Math.abs(c.gx - dragState.startCell.gx) + 1;
            const d = Math.abs(c.gz - dragState.startCell.gz) + 1;
            updateSizeBadge(`Casa: ${w}×${d} m (${w * d} cél.)`);
            return true;
        }
        return false;
    }

    function handlePlacementPointerUp(pt) {
        if (!dragState.active) return false;
        const tool = dragState.tool;
        const sCell = dragState.startCell;
        const eCell = pt ? MO.worldToGrid(pt) : dragState.endCell;
        dragState.active = false;
        if (MO.selectionPreview) MO.selectionPreview.visible = false;
        updateSizeBadge('');

        if ((tool === 'dirt-road' || tool === 'paved-street') && sCell && eCell) {
            const kind = tool === 'paved-street' ? 'paved' : 'dirt';
            const cells = getStraightLineCells(sCell, eCell);
            let painted = 0;
            for (const c of cells) {
                if (paintRoadOrStreet({ x: c.gx + 0.5, z: c.gz + 0.5 }, kind)) painted++;
            }
            if (painted > 0 && MO.showToast) {
                MO.showToast(`${kind === 'paved' ? '🏙️ Rua' : '🛣️ Estrada'} A→B demarcada (${painted} m)!`, '🛣️');
            }
            if (painted > 0) saveCityState();
            return true;
        }

        if (tool === 'house-custom' && sCell && eCell) {
            const minX = Math.min(sCell.gx, eCell.gx), maxX = Math.max(sCell.gx, eCell.gx);
            const minZ = Math.min(sCell.gz, eCell.gz), maxZ = Math.max(sCell.gz, eCell.gz);
            const cells = new Set();
            for (let gx = minX; gx <= maxX; gx++) {
                for (let gz = minZ; gz <= maxZ; gz++) {
                    cells.add(`${gx},${gz}`);
                }
            }
            if (cells.size >= 2) {
                placeDynamicConstruction('house-custom', { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }, cells);
            } else if (MO.showToast) {
                MO.showToast('Arraste uma área mínima de 2 células (ex.: 2×2) para casa personalizada!', '📐');
            }
            return true;
        }
        return true;
    }

    function startCityGame(opts = {}) {
        const state = MO.state;
        const supName = (opts.supervisorName && String(opts.supervisorName).trim())
            ? String(opts.supervisorName).trim()
            : (state.supervisorName || 'Supervisor Beto');
        state.supervisorName = supName;
        state.infiniteWorld = true;
        state.cityMode = true;
        state.city.playerDriven = true;
        state.city.setupConfirmed = true;
        state.city.activeBuildTool = null;
        state.city.activeCategory = null;
        state.city.roadTiles.clear();
        roadMeshMap.clear();
        state.city.structures = [];

        if (typeof opts.seed === 'number' && Number.isFinite(opts.seed)) {
            state.seed = Math.floor(opts.seed);
        }
        if (opts.biome && MO.BIOMES && MO.BIOMES[opts.biome]) {
            MO.applyBiomeStyle(opts.biome);
        }
        if (opts.sandboxMode !== undefined) {
            state.economy.sandboxMode = Boolean(opts.sandboxMode);
        }
        state.economy.wood = 6;
        state.economy.stone = 4;
        state.economy.iron = 0;
        state.economy.food = 18;
        state.economy.coins = 90;

        MO.STATION_TOOLBOX = { x: -2.2, z: 2.0 };
        if (state.villageInfra) {
            state.villageInfra.demarcated = false;
            state.villageInfra.roadSegments = [];
            state.villageInfra.roadBuilt = false;
            state.villageInfra.eastRoadDemarcated = false;
            state.villageInfra.eastRoadBuilt = false;
            state.villageInfra.unloadingPlaced = false;
            state.villageInfra.unloadingBuilt = false;
            state.villageInfra.mixerPlaced = false;
            state.villageInfra.mixerBuilt = false;
            state.villageInfra.workbenchPlaced = false;
            state.villageInfra.workbenchBuilt = false;
            state.villageInfra.yardsPlaced = false;
            state.villageInfra.stockYardsBuilt = false;
            state.villageInfra.yardsBuilt = false;
        }

        if (MO.groups && MO.groups.cityInfra && MO.resources) {
            MO.resources.clearGroup(MO.groups.cityInfra);
        }
        if (MO.groups && MO.groups.workbench && MO.resources) {
            MO.resources.clearGroup(MO.groups.workbench);
        }
        if (MO.groups && MO.groups.demarcation && MO.resources) {
            MO.resources.clearGroup(MO.groups.demarcation);
        }
        if (MO.regionManager) MO.regionManager.reset();
        if (MO.constructionManager) MO.constructionManager.clearAll();
        if (MO.worldManager && MO.worldManager.initDefaultWorld && opts.keepStarterLots) {
            MO.worldManager.initDefaultWorld();
        }
        if (MO.chunkManager) MO.chunkManager.init();
        if (MO.initToolbox) MO.initToolbox();
        if (MO.rebuildSiteProps) MO.rebuildSiteProps(true);
        if (MO.rebuildCamp) MO.rebuildCamp(true);
        if (MO.setMixerBuilt) MO.setMixerBuilt(false);
        if (MO.setWorkbenchBuilt) MO.setWorkbenchBuilt(false);
        if (MO.setUnloadingBuilt) MO.setUnloadingBuilt(false);
        if (MO.setStockYardsBuilt) MO.setStockYardsBuilt(false);
        if (MO.placementGhost) MO.placementGhost.visible = false;

        state.workers = [];
        if (MO.groups && MO.groups.workers && MO.resources) MO.resources.clearGroup(MO.groups.workers);
        if (MO.workerFactory) {
            MO.workerFactory.hireSupervisor({
                silent: true,
                profile: { name: supName, role: 'supervisor', specialty: 'supervisor', helmet: 0xf8fafc, vest: 0xf59e0b, speed: 3.35 }
            });
            MO.workerFactory.hireWorker({
                kind: 'helper',
                silent: true,
                maxHelpers: 50
            });
            MO.workerFactory.syncNpcUI();
        }

        if (MO.focusCameraOn) MO.focusCameraOn(0, 0, 23.5);
        syncEconomyUI();
        const modal = document.getElementById('city-setup-modal');
        if (modal) modal.classList.add('hidden');
        if (!opts.skipSave) saveCityState();
        if (MO.showToast) MO.showToast(`Cidade iniciada com ${supName} e 1 Operário! Use Apoio/Vias abaixo para começar.`, '🏙️');
        return { supervisorName: supName, workers: state.workers.length, seed: state.seed };
    }

    const CITY_STORAGE_KEY = 'mo3d_city_v1';

    function serializeCityState() {
        const state = MO.state;
        const infra = state.villageInfra || {};
        const camp = state.camp || {};
        const roads = [];
        if (state.city && state.city.roadTiles) {
            state.city.roadTiles.forEach(t => {
                roads.push({ gx: t.gx, gz: t.gz, x: t.x, z: t.z, kind: t.kind || 'dirt', built: Boolean(t.built) });
            });
        }
        return {
            version: 1,
            savedAt: Date.now(),
            supervisorName: state.supervisorName || 'Supervisor Beto',
            seed: state.seed,
            biome: state.biome || 'forest',
            timeOfDay: state.timeOfDay || 0.22,
            economy: { ...state.economy },
            roadTiles: roads,
            structures: (state.city && state.city.structures ? state.city.structures : []).map(st => ({
                kind: st.kind, x: st.x, z: st.z, built: Boolean(st.built)
            })),
            infra: {
                unloadingPlaced: Boolean(infra.unloadingPlaced),
                unloadingBuilt: Boolean(infra.unloadingBuilt),
                unloadingPos: infra.unloadingPlaced && MO.STATION_UNLOAD ? { x: MO.STATION_UNLOAD.x, z: MO.STATION_UNLOAD.z } : null,
                mixerPlaced: Boolean(infra.mixerPlaced),
                mixerBuilt: Boolean(infra.mixerBuilt),
                mixerPos: infra.mixerPlaced && MO.STATION_MIXER ? { x: MO.STATION_MIXER.x, z: MO.STATION_MIXER.z } : null,
                workbenchPlaced: Boolean(infra.workbenchPlaced),
                workbenchBuilt: Boolean(infra.workbenchBuilt),
                workbenchPos: infra.workbenchPlaced && MO.STATION_WORKBENCH ? { x: MO.STATION_WORKBENCH.x, z: MO.STATION_WORKBENCH.z } : null,
                yardsPlaced: Boolean(infra.yardsPlaced),
                stockYardsBuilt: Boolean(infra.stockYardsBuilt),
                stockyardPos: infra.yardsPlaced && MO.STATION_STOCKYARD ? { x: MO.STATION_STOCKYARD.x, z: MO.STATION_STOCKYARD.z } : null
            },
            camp: {
                nightMode: camp.nightMode || 'rotate',
                messHall: camp.messHall ? { x: camp.messHall.x, z: camp.messHall.z, built: Boolean(camp.messHall.built) } : null,
                tents: (camp.tents || []).map(t => ({ x: t.x, z: t.z, built: Boolean(t.built) })),
                floodlights: (camp.floodlights || []).map(f => ({ x: f.x, z: f.z, built: Boolean(f.built) }))
            },
            workers: (state.workers || []).map(w => ({
                kind: w.role === 'supervisor' ? 'supervisor' : 'helper',
                role: w.role,
                name: w.name,
                specialty: w.specialty,
                speed: w.speed,
                x: w.rig && w.rig.group ? Math.round(w.rig.group.position.x * 100) / 100 : MO.STATION_TOOLBOX.x,
                z: w.rig && w.rig.group ? Math.round(w.rig.group.position.z * 100) / 100 : MO.STATION_TOOLBOX.z,
                energy: Math.round((w.energy !== undefined ? w.energy : 100) * 10) / 10,
                hydration: Math.round((w.hydration !== undefined ? w.hydration : 100) * 10) / 10,
                hunger: Math.round((w.hunger !== undefined ? w.hunger : 100) * 10) / 10
            })),
            regions: MO.regionManager ? MO.regionManager.serialize() : null,
            constructions: MO.constructionManager ? MO.constructionManager.serialize() : null
        };
    }

    function saveCityState(key = CITY_STORAGE_KEY) {
        try {
            if (!MO.state || !MO.state.city || !MO.state.city.setupConfirmed) return false;
            if (typeof window === 'undefined' || !window.localStorage) return false;
            window.localStorage.setItem(key, JSON.stringify(serializeCityState()));
            if (MO.refreshTitleMenuUI) MO.refreshTitleMenuUI();
            return true;
        } catch (_) {
            return false;
        }
    }

    function getSavedCitySummary(key = CITY_STORAGE_KEY) {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return null;
            const raw = window.localStorage.getItem(key);
            if (!raw) return null;
            const d = JSON.parse(raw);
            if (!d || typeof d !== 'object') return null;
            return {
                supervisorName: d.supervisorName || 'Supervisor Beto',
                seed: d.seed,
                biome: d.biome || 'forest',
                sandboxMode: Boolean(d.economy && d.economy.sandboxMode),
                workers: Array.isArray(d.workers) ? d.workers.length : 0,
                roads: Array.isArray(d.roadTiles) ? d.roadTiles.length : 0,
                structures: Array.isArray(d.structures) ? d.structures.length : 0,
                completedBuildings: (d.constructions && Array.isArray(d.constructions.completed)) ? d.constructions.completed.length : 0
            };
        } catch (_) {
            return null;
        }
    }

    function continueCityGame(key = CITY_STORAGE_KEY) {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return false;
            const raw = window.localStorage.getItem(key);
            if (!raw) return false;
            const snap = JSON.parse(raw);
            if (!snap || typeof snap !== 'object') return false;

            startCityGame({
                supervisorName: snap.supervisorName,
                seed: snap.seed,
                biome: snap.biome || 'forest',
                sandboxMode: Boolean(snap.economy && snap.economy.sandboxMode),
                skipSave: true
            });

            const state = MO.state;
            if (snap.economy) Object.assign(state.economy, snap.economy);
            if (typeof snap.timeOfDay === 'number') state.timeOfDay = snap.timeOfDay;

            // Restaurar vias construídas e planejadas
            if (Array.isArray(snap.roadTiles)) {
                snap.roadTiles.forEach(t => {
                    const k = `${t.gx},${t.gz}`;
                    const tile = { gx: t.gx, gz: t.gz, x: t.x, z: t.z, kind: t.kind || 'dirt', built: Boolean(t.built), res: false };
                    state.city.roadTiles.set(k, tile);
                    if (MO.chunkManager) {
                        MO.chunkManager.paintLevelArea(tile.x, tile.z, 1.5, 0.9, MO.PLATEAU_Y);
                        MO.chunkManager.paintRoadCell(tile.x, tile.z, tile.kind, tile.built, 1);
                    }
                    renderCityRoadTile(tile);
                    if (!tile.built && state.villageInfra && state.villageInfra.roadSegments) {
                        state.villageInfra.roadSegments.push({ x: tile.x, z: tile.z, kind: tile.kind, built: false, res: false, bank: 'city', cityKey: k });
                        state.villageInfra.demarcated = true;
                    } else if (tile.built && state.villageInfra) {
                        state.villageInfra.roadBuilt = true;
                    }
                });
            }

            // Restaurar infraestrutura de apoio escolhida pelo jogador
            const inf = snap.infra || {};
            if (inf.unloadingPlaced && inf.unloadingPos && MO.placeUnloadingBay) {
                MO.placeUnloadingBay(inf.unloadingPos.x, inf.unloadingPos.z, Boolean(inf.unloadingBuilt));
            }
            if (inf.mixerPlaced && inf.mixerPos) {
                MO.STATION_MIXER.x = inf.mixerPos.x; MO.STATION_MIXER.z = inf.mixerPos.z;
                state.villageInfra.mixerPlaced = true;
                if (MO.placeMixerStationOnTerrain) MO.placeMixerStationOnTerrain();
                if (MO.setMixerBuilt) MO.setMixerBuilt(Boolean(inf.mixerBuilt));
            }
            if (inf.workbenchPlaced && inf.workbenchPos) {
                MO.STATION_WORKBENCH.x = inf.workbenchPos.x; MO.STATION_WORKBENCH.z = inf.workbenchPos.z;
                state.villageInfra.workbenchPlaced = true;
                if (MO.initWorkbench) MO.initWorkbench();
                if (MO.setWorkbenchBuilt) MO.setWorkbenchBuilt(Boolean(inf.workbenchBuilt));
            }
            if (inf.yardsPlaced && inf.stockyardPos && MO.placeStockYard) {
                MO.placeStockYard(inf.stockyardPos.x, inf.stockyardPos.z, Boolean(inf.stockYardsBuilt));
            }

            // Restaurar acampamento
            if (snap.camp) {
                if (snap.camp.nightMode) state.camp.nightMode = snap.camp.nightMode;
                if (snap.camp.messHall && MO.placeMessHall) {
                    MO.placeMessHall(snap.camp.messHall.x, snap.camp.messHall.z, Boolean(snap.camp.messHall.built));
                }
                if (Array.isArray(snap.camp.tents) && MO.placeCampTent) {
                    snap.camp.tents.forEach(t => MO.placeCampTent(t.x, t.z, Boolean(t.built)));
                }
                if (Array.isArray(snap.camp.floodlights) && MO.placeFloodlight) {
                    snap.camp.floodlights.forEach(f => MO.placeFloodlight(f.x, f.z, Boolean(f.built)));
                }
            }

            // Restaurar estruturas produtivas (Fazenda, Serraria, Mercado)
            if (Array.isArray(snap.structures)) {
                snap.structures.forEach(st => {
                    const visuals = createStructureMesh(st.kind, st.x, st.z, Boolean(st.built));
                    state.city.structures.push({
                        id: `city-st-${seqCounter++}`,
                        kind: st.kind, x: st.x, z: st.z, built: Boolean(st.built), res: false, prodTimer: 0,
                        mesh: visuals.root, guide: visuals.guide, builtGroup: visuals.builtGroup
                    });
                });
            }

            // Restaurar construções arquivadas (Casas, Prédios, Pontes, Torres)
            if (snap.regions && MO.regionManager) MO.regionManager.restore(snap.regions);
            if (snap.constructions && MO.constructionManager) {
                MO.constructionManager.restore(snap.constructions);
                MO.constructionManager.getCompletedConstructions().forEach(c => {
                    if (MO.constructionManager.rebuildArchivedFromSnapshot) {
                        MO.constructionManager.rebuildArchivedFromSnapshot(c, MO.regionManager);
                    }
                });
            }

            // Restaurar equipe exata de trabalhadores
            if (Array.isArray(snap.workers) && snap.workers.length > 0 && MO.workerFactory) {
                state.workers = [];
                if (MO.groups && MO.groups.workers && MO.resources) MO.resources.clearGroup(MO.groups.workers);
                snap.workers.forEach(ws => {
                    const w = MO.workerFactory.hireWorker({
                        kind: ws.kind,
                        silent: true,
                        maxHelpers: 50,
                        profile: { name: ws.name, role: ws.role, specialty: ws.specialty, speed: ws.speed || 2.9 }
                    });
                    if (w && w.rig && w.rig.group) {
                        const ty = MO.getTerrainHeight ? MO.getTerrainHeight(ws.x, ws.z) : 0.28;
                        w.rig.group.position.set(ws.x, ty, ws.z);
                        w.energy = ws.energy ?? 90;
                        w.hydration = ws.hydration ?? 90;
                        w.hunger = ws.hunger ?? 90;
                    }
                });
                MO.workerFactory.syncNpcUI();
            }

            syncEconomyUI();
            if (MO.invalidateNavigationCache) MO.invalidateNavigationCache();
            if (MO.syncPhaseUI) MO.syncPhaseUI();
            saveCityState(key);
            if (MO.showToast) MO.showToast(`🏡 Cidade "${snap.supervisorName}" carregada (${state.workers.length} NPCs)!`, '🏙️');
            return true;
        } catch (_) {
            return false;
        }
    }

    MO.cityManager = {
        BUILD_COSTS,
        PROF_HIRE_COST,
        CITY_STORAGE_KEY,
        canAfford,
        spendResources,
        addResources,
        toggleSandboxMode,
        syncEconomyUI,
        setActiveBuildTool,
        updatePlacementPreview,
        isPlacementValidAt,
        renderCityRoadTile,
        paintRoadOrStreet,
        placeProductiveStructure,
        placeDynamicConstruction,
        handlePlacementPointerDown,
        handlePlacementPointerMove,
        handlePlacementPointerUp,
        isDraggingPlacement: () => dragState.active,
        startCityGame,
        serializeCityState,
        saveCityState,
        getSavedCitySummary,
        continueCityGame
    };
})(window.MO = window.MO || {});
