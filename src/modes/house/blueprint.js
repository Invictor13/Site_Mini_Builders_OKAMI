// =========================================================================
// MODO CASA (FASE 1): PLANTA BAIXA, MUROS DE DIVISA/ARRIMO E ESCADAS
// =========================================================================
(function(MO) {
    MO.worldToGrid = function(pt) {
        const half = MO.GRID_SIZE / 2;
        return {
            gx: Math.max(0, Math.min(MO.GRID_SIZE - 1, Math.floor(pt.x + half))),
            gz: Math.max(0, Math.min(MO.GRID_SIZE - 1, Math.floor((pt.z - MO.GRID_OFFSET_Z) + half)))
        };
    };

    MO.gridToWorldCenter = function(gx, gz) {
        const half = MO.GRID_SIZE / 2;
        return { x: gx - half + 0.5, z: gz - half + 0.5 + MO.GRID_OFFSET_Z };
    };

    MO.updateSelectionPreview = function(c1, c2) {
        const minX = Math.min(c1.gx, c2.gx), maxX = Math.max(c1.gx, c2.gx);
        const minZ = Math.min(c1.gz, c2.gz), maxZ = Math.max(c1.gz, c2.gz);
        const w = maxX - minX + 1, d = maxZ - minZ + 1;
        const half = MO.GRID_SIZE / 2;
        const px = minX - half + w / 2;
        const pz = minZ - half + d / 2 + MO.GRID_OFFSET_Z;
        MO.selectionPreview.scale.set(w, 1, d);
        MO.selectionPreview.position.set(px, MO.getTerrainHeight(px, pz) + 0.12, pz);
        MO.selectionPreview.visible = true;
    };

    MO.rebuildBlueprintFromCells = function() {
        const state = MO.state;
        const blueprintGroup = MO.groups.blueprint;
        MO.resources.clearGroup(blueprintGroup);
        state.columns = [];
        state.walls = [];
        state.floorTiles = [];

        if (state.occupiedCells.size > 0) {
            let sumH = 0;
            state.occupiedCells.forEach(k => {
                const [gx, gz] = k.split(',').map(Number);
                const c = MO.gridToWorldCenter(gx, gz);
                sumH += MO.getTerrainHeight(c.x, c.z);
            });
            state.houseBaseY = Math.max(MO.WATER_LEVEL + 0.28, sumH / state.occupiedCells.size);
        }

        const half = MO.GRID_SIZE / 2;
        const wallMap = new Map();
        const vConn = new Map();

        function regVertex(vx, vz, ori) {
            const k = `${vx.toFixed(2)},${vz.toFixed(2)}`;
            if (!vConn.has(k)) vConn.set(k, { vx, vz, hasH: false, hasV: false, count: 0 });
            const info = vConn.get(k);
            if (ori === 'H') info.hasH = true;
            if (ori === 'V') info.hasV = true;
            info.count++;
        }

        state.occupiedCells.forEach(key => {
            const [gx, gz] = key.split(',').map(Number);
            const c = MO.gridToWorldCenter(gx, gz);
            const ty = Math.max(state.houseBaseY, MO.getTerrainHeight(c.x, c.z)) + 0.04;

            const tile = new THREE.Mesh(
                new THREE.PlaneGeometry(0.95, 0.95),
                new THREE.MeshBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.30 })
            );
            tile.rotation.x = -Math.PI / 2;
            tile.position.set(c.x, ty, c.z);
            blueprintGroup.add(tile);

            state.floorTiles.push({ gx, gz, x: c.x, z: c.z, concreted: false });

            const nb = [
                { dx: 0, dz: -1, x1: gx, z1: gz, x2: gx + 1, z2: gz, ori: 'H' },
                { dx: 0, dz: 1,  x1: gx, z1: gz + 1, x2: gx + 1, z2: gz + 1, ori: 'H' },
                { dx: -1, dz: 0, x1: gx, z1: gz, x2: gx, z2: gz + 1, ori: 'V' },
                { dx: 1, dz: 0,  x1: gx + 1, z1: gz, x2: gx + 1, z2: gz + 1, ori: 'V' }
            ];
            nb.forEach(n => {
                if (!state.occupiedCells.has(`${gx + n.dx},${gz + n.dz}`)) {
                    const id = `${n.x1},${n.z1}-${n.x2},${n.z2}`;
                    if (!wallMap.has(id)) {
                        const wx1 = n.x1 - half, wz1 = n.z1 - half + MO.GRID_OFFSET_Z;
                        const wx2 = n.x2 - half, wz2 = n.z2 - half + MO.GRID_OFFSET_Z;
                        wallMap.set(id, { id, x1: wx1, z1: wz1, x2: wx2, z2: wz2, ori: n.ori, opening: null, slots: [] });
                        regVertex(wx1, wz1, n.ori);
                        regVertex(wx2, wz2, n.ori);
                    }
                }
            });
        });

        vConn.forEach(v => {
            if ((v.hasH && v.hasV) || v.count === 1) {
                const ty = MO.getTerrainHeight(v.vx, v.vz);
                const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.28), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
                m.position.set(v.vx, Math.max(state.houseBaseY, ty) + 0.09, v.vz);
                blueprintGroup.add(m);
                state.columns.push({ x: v.vx, z: v.vz, terrainY: ty, dug: false, hasRebar: false, hasFormwork: false, concreted: false });
            }
        });

        wallMap.forEach(seg => {
            const mx = (seg.x1 + seg.x2) / 2, mz = (seg.z1 + seg.z2) / 2;
            const geo = seg.ori === 'H' ? new THREE.BoxGeometry(0.94, 0.16, 0.16) : new THREE.BoxGeometry(0.16, 0.16, 0.94);
            const wp = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.85 }));
            wp.position.set(mx, state.houseBaseY + 0.1, mz);
            wp.userData = { wallSegment: seg };
            blueprintGroup.add(wp);
            seg.meshPreview = wp;
            state.walls.push(seg);
        });

        MO.renderMurosAndStairsBlueprint();
    };

    MO.renderMurosAndStairsBlueprint = function() {
        const state = MO.state;
        const muroStairGroup = MO.groups.muroStair;
        MO.resources.clearGroup(muroStairGroup);

        state.muros.forEach(mu => {
            const ty = MO.getTerrainHeight(mu.x, mu.z);
            if (mu.built) {
                const geo = mu.ori === 'H' ? new THREE.BoxGeometry(1.0, 1.05, 0.22) : new THREE.BoxGeometry(0.22, 1.05, 1.0);
                const wallM = new THREE.Mesh(geo, MO.mats.concreteDark);
                wallM.position.set(mu.x, ty + 0.45, mu.z);
                wallM.castShadow = true; wallM.receiveShadow = true;
                wallM.userData = { muroRef: mu };
                muroStairGroup.add(wallM);

                const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.15, 0.28), MO.mats.concrete);
                post.position.set(mu.x + (mu.ori === 'H' ? 0.48 : 0), ty + 0.5, mu.z + (mu.ori === 'V' ? 0.48 : 0));
                post.castShadow = true;
                muroStairGroup.add(post);
                mu.mesh = wallM;
            } else {
                const geo = mu.ori === 'H' ? new THREE.BoxGeometry(0.96, 0.42, 0.2) : new THREE.BoxGeometry(0.2, 0.42, 0.96);
                const prev = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.45 }));
                prev.position.set(mu.x, ty + 0.21, mu.z);
                prev.userData = { muroRef: mu };
                muroStairGroup.add(prev);
                mu.mesh = prev;
            }
        });

        state.stairs.forEach(st => {
            const ty = MO.getTerrainHeight(st.x, st.z);
            const group = new THREE.Group();
            group.position.set(st.x, ty, st.z);
            const steps = 4;
            const totalH = Math.max(0.32, Math.abs(state.houseBaseY - ty) + 0.14);
            for (let i = 0; i < steps; i++) {
                const sh = (totalH / steps) * (i + 1);
                const mat = st.built ? MO.mats.concrete : new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.42 });
                const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(0.92, sh, 0.24), mat);
                stepMesh.position.set(0, sh / 2 - 0.05, 0.36 - i * 0.24);
                stepMesh.castShadow = st.built;
                stepMesh.receiveShadow = true;
                stepMesh.userData = { stairRef: st };
                group.add(stepMesh);
            }
            muroStairGroup.add(group);
            st.meshGroup = group;
        });
    };

    MO.toggleWallOpening = function(seg, type) {
        if (seg.opening === type) {
            seg.opening = null;
            seg.meshPreview.material.color.setHex(0xe2e8f0);
            seg.meshPreview.scale.y = 1;
        } else {
            seg.opening = type;
            seg.meshPreview.material.color.setHex(type === 'door' ? 0x10b981 : 0x38bdf8);
            seg.meshPreview.scale.y = type === 'door' ? 2.5 : 1.7;
        }
    };

    MO.loadPresetHouse = function(forcedVariant) {
        const state = MO.state;
        const activeLot = (MO.regionManager && MO.worldManager && MO.worldManager.meta.persistentGrowth)
            ? MO.regionManager.getActiveLot()
            : null;
        const completedCount = MO.constructionManager
            ? MO.constructionManager.getCompletedConstructions().length
            : 0;
        const variants = ['L-shape', 'chalet', 'modern', 'compact'];
        const chosen = forcedVariant || variants[(state.seed + completedCount) % variants.length];
        state.variant = chosen;

        if (activeLot) {
            for (let x = activeLot.originX - activeLot.halfW; x <= activeLot.originX + activeLot.halfW; x += 0.85) {
                for (let z = activeLot.originZ - activeLot.halfD; z <= activeLot.originZ + activeLot.halfD; z += 0.85) {
                    MO.paintLevelWeight(x, z, 1.75, 1.0);
                }
            }
        } else {
            for (let x = -3.2; x <= 3.2; x += 0.9) {
                for (let z = -3.4; z <= 1.8; z += 0.9) {
                    MO.paintLevelWeight(x, z, 1.9, 1.0);
                }
            }
        }
        MO.updateTerrainGeometry();

        state.occupiedCells.clear();
        state.muros = [];
        state.stairs = [];

        if (activeLot) {
            const half = MO.GRID_SIZE / 2;
            const gx0 = Math.max(0, Math.min(MO.GRID_SIZE - 4, Math.round((activeLot.originX - activeLot.halfW) + half)));
            const gz0 = Math.max(0, Math.min(MO.GRID_SIZE - 4, Math.round(((activeLot.originZ - activeLot.halfD) - MO.GRID_OFFSET_Z) + half)));

            if (chosen === 'L-shape') {
                for (let x = gx0; x <= gx0 + 2; x++) {
                    for (let z = gz0; z <= gz0 + 1; z++) state.occupiedCells.add(`${x},${z}`);
                }
                for (let x = gx0; x <= gx0 + 1; x++) {
                    state.occupiedCells.add(`${x},${gz0 + 2}`);
                }
            } else if (chosen === 'chalet') {
                for (let x = gx0; x <= gx0 + 2; x++) {
                    for (let z = gz0; z <= gz0 + 2; z++) state.occupiedCells.add(`${x},${z}`);
                }
            } else if (chosen === 'modern') {
                for (let x = gx0; x <= gx0 + 3; x++) {
                    for (let z = gz0; z <= gz0 + 1; z++) state.occupiedCells.add(`${x},${z}`);
                }
            } else {
                for (let x = gx0 + 1; x <= gx0 + 2; x++) {
                    for (let z = gz0; z <= gz0 + 2; z++) state.occupiedCells.add(`${x},${z}`);
                }
            }

            for (let gx = gx0; gx <= gx0 + 2; gx++) {
                const c = MO.gridToWorldCenter(gx, gz0);
                state.muros.push({ x: c.x, z: c.z - 0.55, ori: 'H', built: false });
            }
            const stairPos = MO.gridToWorldCenter(gx0 + 1, gz0 + 3);
            state.stairs.push({ x: stairPos.x, z: stairPos.z, built: false });

            MO.rebuildBlueprintFromCells();

            const frontZ = Math.max(...state.walls.map(w => w.z1));
            const frontWall = state.walls.find(w => w.ori === 'H' && Math.abs(w.z1 - frontZ) < 0.15 && Math.abs((w.x1 + w.x2) / 2 - stairPos.x) < 0.6)
                || state.walls.find(w => w.ori === 'H' && Math.abs(w.z1 - frontZ) < 0.15);
            if (frontWall) MO.toggleWallOpening(frontWall, 'door');
            const win1 = state.walls.find(w => w.ori === 'H' && w !== frontWall);
            if (win1) MO.toggleWallOpening(win1, 'window');
            const win2 = state.walls.find(w => w.ori === 'V' && w.x1 > activeLot.originX);
            if (win2) MO.toggleWallOpening(win2, 'window');
            const win3 = state.walls.find(w => w.ori === 'V' && w.x1 < activeLot.originX);
            if (win3) MO.toggleWallOpening(win3, 'window');
        } else {
            if (chosen === 'L-shape') {
                for (let x = 2; x <= 5; x++) {
                    for (let z = 3; z <= 5; z++) state.occupiedCells.add(`${x},${z}`);
                }
                for (let x = 6; x <= 7; x++) {
                    for (let z = 3; z <= 4; z++) state.occupiedCells.add(`${x},${z}`);
                }
            } else if (chosen === 'chalet') {
                for (let x = 3; x <= 6; x++) {
                    for (let z = 2; z <= 5; z++) state.occupiedCells.add(`${x},${z}`);
                }
            } else if (chosen === 'modern') {
                for (let x = 2; x <= 6; x++) {
                    for (let z = 3; z <= 5; z++) state.occupiedCells.add(`${x},${z}`);
                }
            } else {
                for (let x = 3; x <= 6; x++) {
                    for (let z = 3; z <= 5; z++) state.occupiedCells.add(`${x},${z}`);
                }
            }

            for (let gx = 1; gx <= 7; gx++) {
                const c = MO.gridToWorldCenter(gx, 1);
                state.muros.push({ x: c.x, z: c.z - 0.45, ori: 'H', built: false });
            }

            const stairPos = MO.gridToWorldCenter(3, 6);
            state.stairs.push({ x: stairPos.x, z: stairPos.z, built: false });

            MO.rebuildBlueprintFromCells();

            const frontWall = state.walls.find(w => w.ori === 'H' && w.z1 > 0.1 && Math.abs((w.x1 + w.x2) / 2 - stairPos.x) < 0.3);
            if (frontWall) MO.toggleWallOpening(frontWall, 'door');
            const win1 = state.walls.find(w => w.ori === 'H' && w.z1 > 0.1 && w !== frontWall);
            if (win1) MO.toggleWallOpening(win1, 'window');
            const win2 = state.walls.find(w => w.ori === 'V' && w.x1 > 1.2);
            if (win2) MO.toggleWallOpening(win2, 'window');
            const win3 = state.walls.find(w => w.ori === 'V' && w.x1 < -1.2);
            if (win3) MO.toggleWallOpening(win3, 'window');
        }

        MO.SoundFX.playDirtShovel();
        const vLabels = { 'L-shape': 'Casa em L', chalet: 'Chalé Alpino', modern: 'Casa Moderna Platibanda', compact: 'Casa Compacta' };
        const lotPrefix = activeLot ? `${activeLot.label}: ` : '';
        MO.showToast(`${lotPrefix}${vLabels[chosen]}!`, '✨');
    };
})(window.MO = window.MO || {});
