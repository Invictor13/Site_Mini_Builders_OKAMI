// =========================================================================
// ENTITIES: LOGÍSTICA DE CANTEIRO (PLACA, CAÇAMBA, RACK DE VIGAS & CAMINHÃO REAL)
// =========================================================================
(function(MO) {
    const logisticsGroup = new THREE.Group();
    const beamRackGroup = new THREE.Group();

    MO.initSiteLogistics = function() {
        MO.scene.add(logisticsGroup, beamRackGroup);
    };

    MO.spawnBeamRack = function(quiet) {
        const state = MO.state;
        MO.resources.clearGroup(beamRackGroup);
        state.looseBeams = [];

        const tx = MO.STATION_TIMBER.x;
        const tz = MO.STATION_TIMBER.z;
        const ty = Math.max(MO.WATER_LEVEL + 0.14, MO.getTerrainHeight(tx, tz));

        // Cavaletes de madeira de apoio do estoque de vigas e tábuas
        [-0.45, 0.45].forEach(ox => {
            const stand = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.24, 0.92), MO.mats.wood);
            stand.position.set(tx + ox, ty + 0.12, tz);
            stand.castShadow = true;
            beamRackGroup.add(stand);
        });

        // 10 Tábuas de caixaria + 6 Vigas estruturais metálicas/concreto empilhadas
        for (let i = 0; i < 16; i++) {
            const isGirder = i >= 10;
            const layer = isGirder ? (i - 10) % 3 : Math.floor(i / 5);
            const col = isGirder ? Math.floor((i - 10) / 3) : (i % 5);
            const geo = isGirder ? new THREE.BoxGeometry(1.18, 0.10, 0.14) : new THREE.BoxGeometry(1.15, 0.045, 0.15);
            const mat = isGirder ? MO.mats.steel : MO.mats.formwork;
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(
                tx,
                ty + (isGirder ? 0.36 + layer * 0.11 : 0.26 + layer * 0.055),
                tz - 0.36 + col * 0.18 + (isGirder ? 0.28 : 0)
            );
            mesh.castShadow = true;
            beamRackGroup.add(mesh);

            state.looseBeams.push({
                id: i,
                kind: isGirder ? 'beam' : 'plank',
                x: mesh.position.x,
                y: mesh.position.y,
                z: mesh.position.z,
                mesh,
                used: false,
                res: false
            });
        }

        if (MO.state && MO.state.unifiedVillage && MO.state.villageInfra) {
            beamRackGroup.visible = Boolean(MO.state.villageInfra.stockYardsBuilt);
        } else {
            beamRackGroup.visible = true;
        }
        if (!quiet) {
            MO.SoundFX.playHammerWood();
            MO.showToast('Estoque de tábuas e vigas estruturais descarregado no canteiro!', '🪵');
        }
    };

    let propsVisualGroup = null;
    let unloadingPadGroup = null;
    let stockYardPadGroup = null;

    MO.rebuildSiteProps = function(emptyMode = false) {
        MO.resources.clearGroup(logisticsGroup);
        MO.resources.clearGroup(beamRackGroup);
        propsVisualGroup = new THREE.Group();
        unloadingPadGroup = new THREE.Group();
        stockYardPadGroup = new THREE.Group();
        MO.state.site.skipTrashMesh = null;
        MO.state.site.beamRackGroup = null;
        MO.state.looseBeams = [];
        MO.STATION_STOCKYARD = null;

        if (!emptyMode) {
            const mode = MO.state.mode;
            const sx = MO.state.unifiedVillage ? -11.4 : (mode === 'bridge' ? -4.9 : -5.4);
            const sz = MO.state.unifiedVillage ? 2.4 : 5.4;
            const sy = Math.max(MO.WATER_LEVEL + 0.15, MO.getTerrainHeight(sx, sz));

            const signGroup = new THREE.Group();
            signGroup.position.set(sx, sy, sz);
            const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6), MO.mats.wood);
            postL.position.set(-0.32, 0.42, 0);
            const postR = postL.clone(); postR.position.x = 0.32;
            const board = new THREE.Mesh(
                new THREE.BoxGeometry(0.82, 0.42, 0.04),
                new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.55 })
            );
            board.position.set(0, 0.65, 0);
            board.castShadow = true;
            const stripe = new THREE.Mesh(
                new THREE.BoxGeometry(0.76, 0.10, 0.05),
                new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 })
            );
            stripe.position.set(0, 0.75, 0);
            signGroup.add(postL, postR, board, stripe);
            propsVisualGroup.add(signGroup);

            let coneMat = null;
            const coneCoords = MO.state.unifiedVillage ? [[-9.8, 4.4], [-8.4, 4.4]] : [[-4.4, 5.6], [-3.7, 5.8]];
            coneCoords.forEach(([cx, cz]) => {
                const cy = MO.getTerrainHeight(cx, cz);
                if (cy > MO.WATER_LEVEL + 0.1) {
                    if (!coneMat) coneMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.5 });
                    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.30, 8), coneMat);
                    cone.position.set(cx, cy + 0.15, cz);
                    cone.castShadow = true;
                    propsVisualGroup.add(cone);
                }
            });

            const ux = MO.STATION_UNLOAD ? MO.STATION_UNLOAD.x : -9.2;
            const uz = MO.STATION_UNLOAD ? MO.STATION_UNLOAD.z : 3.4;
            const uy = Math.max(MO.WATER_LEVEL + 0.12, MO.getTerrainHeight(ux, uz));
            const pad = new THREE.Mesh(
                new THREE.BoxGeometry(2.4, 0.08, 1.8),
                MO.mats.concreteDark
            );
            pad.position.set(ux, uy + 0.03, uz);
            pad.receiveShadow = true;
            unloadingPadGroup.add(pad);
            logisticsGroup.add(unloadingPadGroup);

            const bx = MO.state.unifiedVillage ? -7.2 : 6.2;
            const bz = MO.state.unifiedVillage ? 5.2 : 4.6;
            const by = Math.max(MO.WATER_LEVEL + 0.12, MO.getTerrainHeight(bx, bz));
            const skip = new THREE.Group();
            skip.position.set(bx, by, bz);
            skip.rotation.y = -0.45;
            const skipMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.65, metalness: 0.3 });
            const sBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.46, 0.72), skipMat);
            sBase.position.y = 0.23;
            sBase.castShadow = true;
            const sTrash = new THREE.Mesh(
                new THREE.DodecahedronGeometry(0.32, 0),
                new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.9 })
            );
            sTrash.position.set(0, 0.45, 0);
            sTrash.scale.set(1.5, 0.4, 0.9);
            sTrash.visible = false;
            skip.add(sBase, sTrash);
            propsVisualGroup.add(skip);
            MO.state.site.skipTrashMesh = sTrash;

            const infra = MO.state.villageInfra;
            if (MO.state.unifiedVillage && infra) {
                unloadingPadGroup.visible = Boolean(infra.unloadingBuilt);
                propsVisualGroup.visible = Boolean(infra.stockYardsBuilt);
            }
        } else {
            unloadingPadGroup.visible = false;
            stockYardPadGroup.visible = false;
            propsVisualGroup.visible = false;
            logisticsGroup.add(unloadingPadGroup, stockYardPadGroup);
        }
        logisticsGroup.add(propsVisualGroup);

        // 3. Caminhão de Entregas Animado com Carga Visível na Caçamba
        const truck = new THREE.Group();
        const ch = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.16, 0.66), MO.mats.steel);
        ch.position.y = 0.22;
        const cab = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.48, 0.64), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45 }));
        cab.position.set(0.44, 0.50, 0);
        cab.castShadow = true;
        const bed = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.26, 0.62), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 }));
        bed.position.set(-0.24, 0.41, 0);
        bed.castShadow = true;
        const cargoMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.8 });
        const cargoLoad = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.28, 0.52), cargoMat);
        cargoLoad.position.set(-0.24, 0.62, 0);
        const wMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
        [[-0.42, -0.34], [-0.42, 0.34], [0.42, -0.34], [0.42, 0.34]].forEach(([wx, wz]) => {
            const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.10, 10), wMat);
            wh.rotation.x = Math.PI / 2;
            wh.position.set(wx, 0.14, wz);
            truck.add(wh);
        });
        truck.add(ch, cab, bed, cargoLoad);
        truck.visible = false;
        logisticsGroup.add(truck);

        MO.state.site.truckMesh = truck;
        MO.state.site.truckCargoMesh = cargoLoad;
        MO.state.site.truckCargoMat = cargoMat;
        MO.state.site.truckActive = false;
        MO.state.site.truckProgress = 0;
        MO.state.site.truckQueue = [];
        MO.state.site.truckCargo = null;
        MO.state.site.truckDropped = false;

        if (!emptyMode) {
            MO.spawnBeamRack(true);
        }
    };

    function computeTruckEntryForUnload(ux, uz) {
        const city = MO.state && MO.state.city;
        if (city && city.roadTiles && city.roadTiles.size > 0) {
            let bestTile = null;
            let bestScore = -1;
            city.roadTiles.forEach(t => {
                if (!t.built) return;
                const d = Math.hypot(t.x - ux, t.z - uz);
                if (d >= 3.5 && d <= 26 && d > bestScore) {
                    bestScore = d;
                    bestTile = t;
                }
            });
            if (bestTile) return { x: bestTile.x, z: bestTile.z };
        }
        return { x: ux - 11.0, z: uz };
    }

    MO.placeUnloadingBay = function(x, z, instantBuilt = false) {
        MO.STATION_UNLOAD = { x, z };
        MO.STATION_ROAD_ENTRY = computeTruckEntryForUnload(x, z);
        if (!unloadingPadGroup) {
            unloadingPadGroup = new THREE.Group();
            logisticsGroup.add(unloadingPadGroup);
        }
        MO.resources.clearGroup(unloadingPadGroup);
        const uy = Math.max(MO.WATER_LEVEL + 0.12, MO.getTerrainHeight(x, z));
        const pad = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.8), MO.mats.concreteDark);
        pad.position.set(x, uy + 0.03, z);
        pad.receiveShadow = true;
        unloadingPadGroup.add(pad);

        const coneMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.5 });
        [[-1.0, -0.7], [1.0, -0.7], [-1.0, 0.7], [1.0, 0.7]].forEach(([ox, oz]) => {
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.28, 8), coneMat);
            cone.position.set(x + ox, uy + 0.14, z + oz);
            cone.castShadow = true;
            unloadingPadGroup.add(cone);
        });
        unloadingPadGroup.visible = true;
        if (MO.state && MO.state.villageInfra) {
            MO.state.villageInfra.unloadingPlaced = true;
            MO.state.villageInfra.unloadingBuilt = Boolean(instantBuilt);
        }
        MO.flushQueuedTruckIfReady();
        return { x, z, built: Boolean(instantBuilt) };
    };

    MO.placeStockYard = function(x, z, instantBuilt = false) {
        MO.STATION_STOCKYARD = { x, z };
        MO.STATION_BRICK = { x: x - 0.85, z: z + 0.55 };
        MO.STATION_REBAR = { x: x + 0.85, z: z + 0.55 };
        MO.STATION_TIMBER = { x: x + 0.15, z: z - 0.65 };

        if (!stockYardPadGroup) {
            stockYardPadGroup = new THREE.Group();
            logisticsGroup.add(stockYardPadGroup);
        }
        MO.resources.clearGroup(stockYardPadGroup);
        const sy = Math.max(MO.WATER_LEVEL + 0.12, MO.getTerrainHeight(x, z));
        const deck = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.08, 2.6), MO.mats.concreteDark);
        deck.position.set(x, sy + 0.03, z);
        deck.receiveShadow = true;
        stockYardPadGroup.add(deck);

        // Cobertura leve de madeira e estantes laterais do Depósito bem no local clicado
        const shelterMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.7 });
        [[-1.35, -1.05], [1.35, -1.05], [-1.35, 1.05], [1.35, 1.05]].forEach(([px, pz]) => {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.15, 0.08), MO.mats.wood);
            post.position.set(x + px, sy + 0.58, z + pz);
            post.castShadow = true;
            stockYardPadGroup.add(post);
        });
        const roof = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.06, 1.25), shelterMat);
        roof.position.set(x, sy + 1.16, z - 0.52);
        roof.castShadow = true;
        stockYardPadGroup.add(roof);
        stockYardPadGroup.visible = Boolean(instantBuilt);

        if (MO.state && MO.state.villageInfra) {
            MO.state.villageInfra.yardsPlaced = true;
            MO.state.villageInfra.stockYardsBuilt = Boolean(instantBuilt);
            MO.state.villageInfra.yardsBuilt = Boolean(instantBuilt);
        }
        MO.spawnBeamRack(true);
        if (MO.restockSupplies) MO.restockSupplies(true, { x: x - 0.15, z: z + 0.15 });
        return { x, z, built: Boolean(instantBuilt) };
    };

    const TRUCK_COSTS = {
        bricks: 12,
        supplies: 10,
        rebars: 16,
        wood: 10,
        beams: 14,
        mixed: 28,
        export: 0
    };
    const TRUCK_ECO_GRANTS = {
        bricks: { stone: 12 },
        supplies: { stone: 8 },
        rebars: { iron: 8 },
        wood: { wood: 14 },
        beams: { wood: 10, iron: 4 },
        mixed: { wood: 10, stone: 10, iron: 4, food: 6 }
    };
    MO.TRUCK_COSTS = TRUCK_COSTS;

    function computeRoadRouteToUnload(unloadPos) {
        const state = MO.state;
        const city = state && state.city;
        if (!unloadPos || !city || !city.roadTiles || city.roadTiles.size === 0) return null;

        let nearest = null;
        let nearestDist = Infinity;
        const builtMap = new Map();
        city.roadTiles.forEach((tile, key) => {
            if (!tile.built) return;
            builtMap.set(key, tile);
            const d = Math.hypot(tile.x - unloadPos.x, tile.z - unloadPos.z);
            if (d <= 4.0 && d < nearestDist) {
                nearestDist = d;
                nearest = tile;
            }
        });
        if (!nearest) return null;

        // BFS pelas vias construídas conectadas procurando entroncamento na Rodovia Regional
        const startKey = `${nearest.gx},${nearest.gz}`;
        const parent = new Map([[startKey, null]]);
        const queue = [nearest];
        let highwayEntry = null;
        const cm = MO.chunkManager;
        const requireHighway = Boolean(state.infiniteWorld && state.cityMode && cm && cm.getHighwayCenterX);

        while (queue.length > 0) {
            const cur = queue.shift();
            const curKey = `${cur.gx},${cur.gz}`;
            if (requireHighway && !highwayEntry && cm.isNearHighway && cm.isNearHighway(cur.x, cur.z, 2.6, state.seed)) {
                highwayEntry = cur;
                break;
            }
            for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dz === 0) continue;
                    const nKey = `${cur.gx + dx},${cur.gz + dz}`;
                    if (!parent.has(nKey) && builtMap.has(nKey)) {
                        parent.set(nKey, curKey);
                        queue.push(builtMap.get(nKey));
                    }
                }
            }
        }

        // Em Modo Cidade com Rodovia Regional: caminhão EXIGE pista construída conectando a Rodovia à Baia!
        if (requireHighway && !highwayEntry) {
            return null;
        }

        const entryNode = highwayEntry || nearest;
        // Reconstrói de entryNode -> nearest -> unloadPos
        const roadWaypoints = [];
        let traceKey = `${entryNode.gx},${entryNode.gz}`;
        while (traceKey) {
            const t = builtMap.get(traceKey);
            if (t) roadWaypoints.push({ x: t.x, z: t.z, kind: t.kind || 'dirt' });
            traceKey = parent.get(traceKey);
        }

        // Prefixa trecho vindo pela própria Rodovia Regional até o entroncamento construído pelo jogador!
        if (requireHighway && highwayEntry && cm.getHighwayCenterX) {
            const hwApproach = [];
            for (let dz = -28; dz <= 0; dz += 7) {
                const wz = highwayEntry.z + dz;
                hwApproach.push({
                    x: cm.getHighwayCenterX(wz, state.seed) + 1.05,
                    z: wz,
                    kind: 'paved'
                });
            }
            roadWaypoints.unshift(...hwApproach);
        } else if (roadWaypoints.length === 1) {
            const dxOut = roadWaypoints[0].x - unloadPos.x;
            const dzOut = roadWaypoints[0].z - unloadPos.z;
            const len = Math.hypot(dxOut, dzOut) || 1;
            roadWaypoints.unshift({
                x: roadWaypoints[0].x + (dxOut / len) * 2.2,
                z: roadWaypoints[0].z + (dzOut / len) * 2.2,
                kind: roadWaypoints[0].kind
            });
        }
        roadWaypoints.push({ x: unloadPos.x, z: unloadPos.z, kind: nearest.kind || 'dirt' });
        return roadWaypoints;
    }
    MO.computeRoadRouteToUnload = computeRoadRouteToUnload;

    function startTruckRun(cargoKind) {
        const s = MO.state.site;
        const unload = MO.STATION_UNLOAD || { x: -9.2, z: 3.4 };
        const roadRoute = computeRoadRouteToUnload(unload);
        s.truckRoute = roadRoute;
        if (roadRoute && roadRoute.length >= 2) {
            MO.STATION_ROAD_ENTRY = { x: roadRoute[0].x, z: roadRoute[0].z };
        }
        s.truckActive = true;
        s.truckProgress = 0;
        s.truckDropped = false;
        s.truckCargo = cargoKind;
        if (s.truckCargoMesh) s.truckCargoMesh.visible = true;
        if (s.truckCargoMat) {
            const colors = { bricks: 0xb45309, supplies: 0x94a3b8, rebars: 0x475569, beams: 0xd97706, wood: 0x92400e, mixed: 0xb45309, export: 0x10b981 };
            s.truckCargoMat.color.setHex(colors[cargoKind] || 0xb45309);
        }
        if (s.truckMesh) s.truckMesh.visible = true;
        MO.SoundFX.playTruckHorn();
    }

    MO.setUnloadingBuilt = function(built) {
        if (MO.state && MO.state.villageInfra) {
            MO.state.villageInfra.unloadingBuilt = Boolean(built);
        }
        if (unloadingPadGroup) unloadingPadGroup.visible = Boolean(built);
        MO.flushQueuedTruckIfReady();
    };

    MO.setStockYardsBuilt = function(built) {
        if (MO.state && MO.state.villageInfra) {
            MO.state.villageInfra.stockYardsBuilt = Boolean(built);
            MO.state.villageInfra.yardsBuilt = Boolean(built);
        }
        if (propsVisualGroup) propsVisualGroup.visible = Boolean(built);
        if (stockYardPadGroup) stockYardPadGroup.visible = Boolean(built);
        beamRackGroup.visible = Boolean(built);
    };

    function isTruckDeliveryAllowed() {
        const state = MO.state;
        const infra = state.villageInfra;
        if (!state.unifiedVillage || !infra) return true;
        const playerDriven = Boolean(state.cityMode && state.city && state.city.playerDriven);
        if (playerDriven) {
            if (!infra.unloadingBuilt) return false;
            return computeRoadRouteToUnload(MO.STATION_UNLOAD) !== null;
        }
        return Boolean(infra.roadBuilt && infra.unloadingBuilt);
    }

    MO.flushQueuedTruckIfReady = function() {
        const state = MO.state;
        const s = state.site;
        if (!s || s.truckActive || !s.truckMesh) return;
        if (!isTruckDeliveryAllowed()) return;
        if (s.truckQueue.length > 0) {
            startTruckRun(s.truckQueue.shift());
        }
    };

    MO.requestSupplyTruck = function(cargoKind = 'mixed', fromUserPhone = false) {
        const state = MO.state;
        const s = state.site;
        if (!s.truckMesh) return false;
        const infra = state.villageInfra;
        const playerDriven = Boolean(state.cityMode && state.city && state.city.playerDriven);
        if (!isTruckDeliveryAllowed()) {
            if (!fromUserPhone && s.truckCargo !== cargoKind && !s.truckQueue.includes(cargoKind)) {
                s.truckQueue.push(cargoKind);
            }
            if (fromUserPhone && MO.showToast) {
                if (!infra || !infra.unloadingBuilt) {
                    MO.showToast('📱 Posicione e construa a Baia de Descarga (Apoio) primeiro!', '🚚');
                } else if (playerDriven && computeRoadRouteToUnload(MO.STATION_UNLOAD) === null) {
                    MO.showToast('🛣️ Construa uma estrada conectando a Rodovia Regional (Oeste) até a Baia de Descarga!', '🛣️');
                } else {
                    MO.showToast('📱 Pedido agendado! Caminhão chegará assim que a estrada ficar pronta.', '🚚');
                }
            }
            return false;
        }
        const coinCost = TRUCK_COSTS[cargoKind] || 0;
        if (fromUserPhone && playerDriven && coinCost > 0 && MO.cityManager) {
            if (!MO.cityManager.spendResources({ coins: coinCost })) {
                if (MO.showToast) MO.showToast(`🪙 Moedas insuficientes (${coinCost}🪙)! Colha da natureza ou venda excedentes.`, '⚠️');
                return false;
            }
        }
        if (s.truckActive) {
            if (s.truckCargo !== cargoKind && !s.truckQueue.includes(cargoKind)) {
                s.truckQueue.push(cargoKind);
            }
            if (fromUserPhone && MO.showToast) {
                MO.showToast('🚚 Caminhão em rota — novo pedido adicionado à fila!', '📱');
            }
            return true;
        }
        const labels = {
            bricks: 'tijolos e pedra',
            supplies: 'areia, cimento e água',
            rebars: 'aço e ferragens',
            beams: 'vigas e tábuas',
            wood: 'madeira bruta',
            mixed: 'carga geral completa',
            export: 'coleta de exportação (+15🪙)'
        };
        if (cargoKind !== 'mixed' || fromUserPhone) {
            MO.showToast(`🚚 Caminhão seguindo sua estrada com ${labels[cargoKind] || 'suprimentos'}!`, '🚚');
        }
        startTruckRun(cargoKind);
        return true;
    };

    MO.sellSurplusViaPhone = function() {
        const eco = MO.state && MO.state.economy;
        if (!eco) return false;
        if (!isTruckDeliveryAllowed()) {
            MO.requestSupplyTruck('export', true);
            return false;
        }
        if (eco.wood >= 8) {
            if (MO.cityManager) MO.cityManager.spendResources({ wood: 8 });
            MO.showToast('🚚 Exportando 8 Madeiras (+15🪙 ao chegar na Baia)!', '🪙');
            return MO.requestSupplyTruck('export', false);
        }
        if (eco.stone >= 8) {
            if (MO.cityManager) MO.cityManager.spendResources({ stone: 8 });
            MO.showToast('🚚 Exportando 8 Pedras (+15🪙 ao chegar na Baia)!', '🪙');
            return MO.requestSupplyTruck('export', false);
        }
        if (MO.showToast) MO.showToast('Precisa de pelo menos 8 🪵 Madeira ou 8 🪨 Pedra no estoque para exportar!', '⚠️');
        return false;
    };

    MO.triggerDeliveryTruck = function() {
        MO.requestSupplyTruck('mixed');
    };

    let tireTrackTimer = 0;

    function sampleRoutePoint(route, tNorm) {
        const totalSegs = route.length - 1;
        const scaled = Math.max(0, Math.min(totalSegs - 1e-6, tNorm * totalSegs));
        const idx = Math.floor(scaled);
        const frac = scaled - idx;
        const a = route[idx];
        const b = route[Math.min(route.length - 1, idx + 1)];
        return {
            x: a.x + (b.x - a.x) * frac,
            z: a.z + (b.z - a.z) * frac,
            dx: b.x - a.x,
            dz: b.z - a.z,
            kind: a.kind || 'dirt'
        };
    }

    MO.updateSiteLogistics = function(dt) {
        const s = MO.state.site;
        if (s.skipTrashMesh && MO.state.weeds && MO.state.weeds.some(w => w.cleared)) {
            s.skipTrashMesh.visible = true;
        }
        if (s.truckActive && s.truckMesh) {
            const route = (s.truckRoute && s.truckRoute.length >= 2) ? s.truckRoute : null;
            const goingIn = s.truckProgress < 0.5;
            const tLeg = goingIn ? Math.min(1, s.truckProgress / 0.48) : Math.max(0, 1 - (s.truckProgress - 0.52) / 0.48);

            let x, z, dx, dz, roadKind = 'dirt';
            if (route) {
                const pt = sampleRoutePoint(route, tLeg);
                x = pt.x; z = pt.z; dx = pt.dx; dz = pt.dz; roadKind = pt.kind;
            } else {
                const entry = MO.STATION_ROAD_ENTRY || { x: -13.6, z: 4.5 };
                const unload = MO.STATION_UNLOAD || { x: -9.2, z: 3.4 };
                x = MO.state.unifiedVillage ? (entry.x + (unload.x - entry.x) * tLeg) : (-8.6 + Math.sin(s.truckProgress * Math.PI) * 5.8);
                z = MO.state.unifiedVillage ? (entry.z + (unload.z - entry.z) * tLeg) : 5.8;
                dx = unload.x - entry.x;
                dz = unload.z - entry.z;
            }

            const speedMult = roadKind === 'paved' ? 1.8 : 1.0;
            s.truckProgress += dt * 0.28 * speedMult;

            const y = Math.max(MO.WATER_LEVEL + 0.12, MO.getTerrainHeight(x, z));
            s.truckMesh.position.set(x, y, z);
            const forwardYaw = (MO.state.unifiedVillage || route) ? Math.atan2(dz, dx) : 0;
            const yaw = goingIn ? -forwardYaw : (-forwardYaw + Math.PI);
            s.truckMesh.rotation.y = yaw;

            tireTrackTimer += dt;
            if (tireTrackTimer > 0.16 && MO.spawnGroundTrack && roadKind !== 'paved') {
                tireTrackTimer = 0;
                MO.spawnGroundTrack(x, z - 0.30, 'tire', yaw + Math.PI / 2);
                MO.spawnGroundTrack(x, z + 0.30, 'tire', yaw + Math.PI / 2);
            }

            // Descarrega fisicamente a carga na Baia e credita recursos comprados
            if (s.truckProgress >= 0.48 && !s.truckDropped) {
                s.truckDropped = true;
                if (s.truckCargoMesh) s.truckCargoMesh.visible = false;
                const cargo = s.truckCargo;
                if (cargo === 'export') {
                    if (MO.cityManager) MO.cityManager.addResources({ coins: 15 });
                } else {
                    const grant = TRUCK_ECO_GRANTS[cargo];
                    if (grant && MO.cityManager && MO.state.cityMode) {
                        MO.cityManager.addResources(grant);
                    }
                    if (cargo === 'bricks' && MO.spawnBrickPallet) {
                        MO.spawnBrickPallet();
                    } else if (cargo === 'supplies' && MO.restockSupplies) {
                        MO.restockSupplies(true);
                    } else if (cargo === 'rebars' && MO.spawnFallingRebars) {
                        MO.spawnFallingRebars();
                    } else if (cargo === 'beams') {
                        MO.spawnBeamRack(false);
                    } else if (cargo === 'wood' && MO.deliverRawWood) {
                        MO.deliverRawWood(8);
                    } else if (cargo === 'mixed') {
                        if (MO.restockSupplies) MO.restockSupplies(true);
                        MO.spawnBeamRack(true);
                        if (MO.deliverRawWood) MO.deliverRawWood(8);
                    }
                }
                MO.spawnBurst(x, y + 0.5, z, 0xcbd5e1, 10, 0.08);
            }

            if (s.truckProgress >= 1) {
                s.truckActive = false;
                s.truckMesh.visible = false;
                MO.flushQueuedTruckIfReady();
            }
        }
    };

    MO.spawnWeldSparks = function(x, y, z) {
        MO.spawnBurst(x, y, z, 0xfbbf24, 6, 0.13);
        MO.SoundFX.playSparkWeld();
    };
})(window.MO = window.MO || {});
