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

    MO.rebuildSiteProps = function() {
        MO.resources.clearGroup(logisticsGroup);
        propsVisualGroup = new THREE.Group();
        unloadingPadGroup = new THREE.Group();

        const mode = MO.state.mode;
        // 1. Placa de Obra & Cones de Segurança
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

        // 2. Baia de Descarga (plataforma compactada/cascalho onde caminhão despeja)
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

        // 3. Caçamba de Entulho / Capina
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

        MO.spawnBeamRack(true);
    };

    function startTruckRun(cargoKind) {
        const s = MO.state.site;
        s.truckActive = true;
        s.truckProgress = 0;
        s.truckDropped = false;
        s.truckCargo = cargoKind;
        if (s.truckCargoMesh) s.truckCargoMesh.visible = true;
        if (s.truckCargoMat) {
            const colors = { bricks: 0xb45309, supplies: 0x94a3b8, rebars: 0x475569, beams: 0xd97706, mixed: 0xb45309 };
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
        }
        if (propsVisualGroup) propsVisualGroup.visible = Boolean(built);
        beamRackGroup.visible = Boolean(built);
    };

    MO.flushQueuedTruckIfReady = function() {
        const state = MO.state;
        const s = state.site;
        const infra = state.villageInfra;
        if (!s || s.truckActive || !s.truckMesh) return;
        if (state.unifiedVillage && infra && !(infra.roadBuilt && infra.unloadingBuilt)) return;
        if (s.truckQueue.length > 0) {
            startTruckRun(s.truckQueue.shift());
        }
    };

    MO.requestSupplyTruck = function(cargoKind = 'mixed') {
        const state = MO.state;
        const s = state.site;
        if (!s.truckMesh) return;
        const infra = state.villageInfra;
        if (state.unifiedVillage && infra && !(infra.roadBuilt && infra.unloadingBuilt)) {
            if (s.truckCargo !== cargoKind && !s.truckQueue.includes(cargoKind)) {
                s.truckQueue.push(cargoKind);
            }
            return;
        }
        if (s.truckActive) {
            if (s.truckCargo !== cargoKind && !s.truckQueue.includes(cargoKind)) {
                s.truckQueue.push(cargoKind);
            }
            return;
        }
        const labels = {
            bricks: 'tijolos',
            supplies: 'areia, cimento e água',
            rebars: 'armaduras de aço',
            beams: 'vigas e tábuas',
            wood: 'madeira bruta para bancada',
            mixed: 'materiais iniciais'
        };
        if (cargoKind !== 'mixed') {
            MO.showToast(`🚚 Caminhão entrando pela estrada com ${labels[cargoKind] || 'suprimentos'}...`, '🚚');
        }
        startTruckRun(cargoKind);
    };

    MO.triggerDeliveryTruck = function() {
        MO.requestSupplyTruck('mixed');
    };

    let tireTrackTimer = 0;

    MO.updateSiteLogistics = function(dt) {
        const s = MO.state.site;
        if (s.skipTrashMesh && MO.state.weeds && MO.state.weeds.some(w => w.cleared)) {
            s.skipTrashMesh.visible = true;
        }
        if (s.truckActive && s.truckMesh) {
            s.truckProgress += dt * 0.34;
            const entry = MO.STATION_ROAD_ENTRY || { x: -13.6, z: 4.5 };
            const unload = MO.STATION_UNLOAD || { x: -9.2, z: 3.4 };
            const tLeg = s.truckProgress < 0.5 ? (s.truckProgress * 2) : ((1 - s.truckProgress) * 2);
            const x = MO.state.unifiedVillage
                ? (entry.x + (unload.x - entry.x) * tLeg)
                : (-8.6 + Math.sin(s.truckProgress * Math.PI) * 5.8);
            const z = MO.state.unifiedVillage
                ? (entry.z + (unload.z - entry.z) * tLeg)
                : 5.8;
            const y = Math.max(MO.WATER_LEVEL + 0.12, MO.getTerrainHeight(x, z));
            s.truckMesh.position.set(x, y, z);
            const dx = unload.x - entry.x;
            const dz = unload.z - entry.z;
            const forwardYaw = MO.state.unifiedVillage ? Math.atan2(dz, dx) : 0;
            const yaw = s.truckProgress < 0.5 ? -forwardYaw : (-forwardYaw + Math.PI);
            s.truckMesh.rotation.y = yaw;

            tireTrackTimer += dt;
            if (tireTrackTimer > 0.16 && MO.spawnGroundTrack) {
                tireTrackTimer = 0;
                MO.spawnGroundTrack(x, z - 0.30, 'tire', yaw + Math.PI / 2);
                MO.spawnGroundTrack(x, z + 0.30, 'tire', yaw + Math.PI / 2);
            }

            // Descarrega fisicamente a carga no ponto médio da entrega
            if (s.truckProgress >= 0.48 && !s.truckDropped) {
                s.truckDropped = true;
                if (s.truckCargoMesh) s.truckCargoMesh.visible = false;
                const cargo = s.truckCargo;
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
