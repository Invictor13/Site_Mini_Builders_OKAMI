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
        while (beamRackGroup.children.length > 0) beamRackGroup.remove(beamRackGroup.children[0]);
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

        if (!quiet) {
            MO.SoundFX.playHammerWood();
            MO.showToast('Estoque de tábuas e vigas estruturais descarregado no canteiro!', '🪵');
        }
    };

    MO.rebuildSiteProps = function() {
        while (logisticsGroup.children.length > 0) logisticsGroup.remove(logisticsGroup.children[0]);

        const mode = MO.state.mode;
        // 1. Placa de Obra & Cones de Segurança
        const sx = mode === 'bridge' ? -4.9 : -3.8;
        const sz = 4.2;
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
        logisticsGroup.add(signGroup);

        const coneMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.5 });
        [[-2.8, 4.4], [-2.1, 4.6]].forEach(([cx, cz]) => {
            const cy = MO.getTerrainHeight(cx, cz);
            if (cy > MO.WATER_LEVEL + 0.1) {
                const cone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.30, 8), coneMat);
                cone.position.set(cx, cy + 0.15, cz);
                cone.castShadow = true;
                logisticsGroup.add(cone);
            }
        });

        // 2. Caçamba de Entulho / Capina
        const bx = 5.2, bz = 3.5;
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
        logisticsGroup.add(skip);
        MO.state.site.skipTrashMesh = sTrash;

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

    MO.requestSupplyTruck = function(cargoKind = 'mixed') {
        const s = MO.state.site;
        if (!s.truckMesh) return;
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
            mixed: 'materiais iniciais'
        };
        if (cargoKind !== 'mixed') {
            MO.showToast(`🚚 Material acabou! Caminhão chegando com ${labels[cargoKind] || 'suprimentos'}...`, '🚚');
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
            const z = 4.65;
            const x = -7.6 + Math.sin(s.truckProgress * Math.PI) * 5.2;
            const y = Math.max(MO.WATER_LEVEL + 0.12, MO.getTerrainHeight(x, z));
            s.truckMesh.position.set(x, y, z);
            const yaw = s.truckProgress < 0.5 ? 0 : Math.PI;
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
                } else if (cargo === 'mixed') {
                    if (MO.restockSupplies) MO.restockSupplies(true);
                    MO.spawnBeamRack(true);
                }
                MO.spawnBurst(x, y + 0.5, z, 0xcbd5e1, 10, 0.08);
            }

            if (s.truckProgress >= 1) {
                s.truckActive = false;
                s.truckMesh.visible = false;
                if (s.truckQueue.length > 0) {
                    const nextCargo = s.truckQueue.shift();
                    startTruckRun(nextCargo);
                }
            }
        }
    };

    MO.spawnWeldSparks = function(x, y, z) {
        MO.spawnBurst(x, y, z, 0xfbbf24, 6, 0.13);
        MO.SoundFX.playSparkWeld();
    };
})(window.MO = window.MO || {});
