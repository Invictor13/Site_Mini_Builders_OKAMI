// =========================================================================
// MODO CASA (FASE 3): ALVENARIA ERGONÔMICA, CAIXARIA DA CINTA, REBOCO E PISO
// =========================================================================
(function(MO) {
    MO.advanceToPhase3 = function() {
        const state = MO.state;
        const pending = state.columns.filter(c => !c.concreted).length;
        if (pending > 0) {
            MO.showToast(`Conclua as ${pending} colunas restantes antes de subir as paredes!`, '⚠️');
            return;
        }
        state.phase = 3;
        MO.groups.blueprint.visible = false;
        MO.syncPhaseUI();
        MO.buildInteractiveWalls3D();
        MO.buildFloorGrid3D();
        MO.spawnBrickPallet();
        MO.selectTool('wall');
        MO.showToast('Fase 3: Passe argamassa com o balde e clique no Tijolo → Parede!', '🧱');
    };

    MO.animateBrickDrop = function(slot) {
        slot.placed = true;
        slot.guideMesh.visible = false;
        slot.mesh.visible = true;
        const targetY = slot.y + 0.015;
        slot.mesh.position.y = targetY + 0.5;
        MO.state.animatedBricks.push({ mesh: slot.mesh, targetY, progress: 0 });
        MO.spawnBurst(slot.x, slot.y - 0.05, slot.z, 0x94a3b8, 7);
        MO.SoundFX.playBrickClack();
    };

    MO.spawnBrickPallet = function() {
        const state = MO.state;
        const isStd = state.brickType === 'standard';
        const mat = isStd ? MO.mats.brickCeramic : MO.mats.brickBlock;
        const geo = isStd ? new THREE.BoxGeometry(0.42, 0.22, 0.17) : new THREE.BoxGeometry(0.42, 0.34, 0.17);
        const px = MO.STATION_BRICK.x, pz = MO.STATION_BRICK.z;
        const py = MO.getTerrainHeight(px, pz);

        const palletWood = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.08, 1.38), MO.mats.wood);
        palletWood.position.set(px, py + 0.04, pz);
        palletWood.receiveShadow = true;
        MO.groups.looseBricks.add(palletWood);

        let count = 0;
        for (let layer = 0; layer < 4; layer++) {
            for (let r = 0; r < 2; r++) {
                for (let c = 0; c < 3; c++) {
                    const bx = px - 0.42 + c * 0.42;
                    const bz = pz - 0.2 + r * 0.4;
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.position.set(bx, py + 0.5 + layer * 0.32 + count * 0.02, bz);
                    mesh.castShadow = true; mesh.receiveShadow = true;
                    const bObj = { mesh, vy: 0, grounded: false, placed: false };
                    mesh.userData.looseBrick = bObj;
                    MO.groups.looseBricks.add(mesh);
                    state.looseBricks.push(bObj);
                    count++;
                }
            }
        }
        MO.SoundFX.playBrickClack();
        MO.showToast('Palete com 24 tijolos entregue! Clique em um tijolo e depois na parede.', '🧱');
    };

    function createCutoutPlasterGroup(wall) {
        const grp = new THREE.Group();
        const midX = (wall.x1 + wall.x2) / 2;
        const midZ = (wall.z1 + wall.z2) / 2;
        const baseY = MO.state.houseBaseY + 0.14;
        const pMat = new THREE.MeshStandardMaterial({
            map: MO.createNoiseTexture('#d6d3d1', 10),
            color: 0xd6d3d1,
            roughness: 0.90
        });
        wall.plasterMat = pMat;

        const thick = 0.22;
        const totalW = 1.01;
        const H = MO.WALL_HEIGHT;

        function addPanel(localAlong, localY, panelW, panelH) {
            const geo = wall.ori === 'H'
                ? new THREE.BoxGeometry(panelW, panelH, thick)
                : new THREE.BoxGeometry(thick, panelH, panelW);
            const m = new THREE.Mesh(geo, pMat);
            m.position.set(
                wall.ori === 'H' ? midX + localAlong : midX,
                baseY + localY,
                wall.ori === 'V' ? midZ + localAlong : midZ
            );
            m.castShadow = true;
            m.receiveShadow = true;
            m.userData = { finishWall: wall };
            grp.add(m);
        }

        if (wall.opening === 'door') {
            addPanel(-0.4025, H / 2, 0.205, H);
            addPanel(0.4025, H / 2, 0.205, H);
            addPanel(0, 1.45 + (H - 1.45) / 2, 0.62, H - 1.45);
        } else if (wall.opening === 'window') {
            addPanel(-0.4075, H / 2, 0.195, H);
            addPanel(0.4075, H / 2, 0.195, H);
            addPanel(0, 0.31, 0.64, 0.62);
            addPanel(0, 1.45 + (H - 1.45) / 2, 0.64, H - 1.45);
        } else {
            addPanel(0, H / 2, totalW, H);
        }

        grp.visible = false;
        return grp;
    }

    function createOpeningFixture(wall) {
        const grp = new THREE.Group();
        const midX = (wall.x1 + wall.x2) / 2;
        const midZ = (wall.z1 + wall.z2) / 2;
        const baseY = MO.state.houseBaseY + 0.14;
        grp.position.set(midX, baseY, midZ);
        if (wall.ori === 'V') grp.rotation.y = Math.PI / 2;

        if (wall.opening === 'door') {
            const frameTop = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.05, 0.23), MO.mats.trunkWood);
            frameTop.position.set(0, 1.425, 0);
            const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.45, 0.23), MO.mats.trunkWood);
            frameL.position.set(-0.295, 0.725, 0);
            const frameR = frameL.clone(); frameR.position.x = 0.295;
            const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.54, 1.40, 0.055), MO.mats.doorWood);
            leaf.position.set(0, 0.70, 0);
            leaf.castShadow = true;
            const handle1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.09), MO.mats.steel);
            handle1.position.set(0.19, 0.68, 0);
            grp.add(frameTop, frameL, frameR, leaf, handle1);
        } else if (wall.opening === 'window') {
            const winY = 0.62 + 0.415;
            const top = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.045, 0.22), MO.mats.windowFrame);
            top.position.set(0, 1.43, 0);
            const bot = top.clone(); bot.position.y = 0.64;
            const left = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.83, 0.22), MO.mats.windowFrame);
            left.position.set(-0.298, winY, 0);
            const right = left.clone(); right.position.x = 0.298;
            const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.79, 0.06), MO.mats.windowFrame);
            mullion.position.set(0, winY, 0);
            const pane = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.77, 0.025), MO.mats.glass);
            pane.position.set(0, winY, 0);
            grp.add(top, bot, left, right, mullion, pane);
        }
        grp.visible = false;
        return grp;
    }

    MO.buildInteractiveWalls3D = function() {
        const wallsGroup = MO.groups.walls;
        const state = MO.state;
        while (wallsGroup.children.length > 0) wallsGroup.remove(wallsGroup.children[0]);

        const isStd = state.brickType === 'standard';
        const numRows = isStd ? 6 : 4;
        const rowH = MO.WALL_HEIGHT / numRows;
        const baseY = state.houseBaseY + 0.14;

        state.walls.forEach(wall => {
            const midX = (wall.x1 + wall.x2) / 2;
            const midZ = (wall.z1 + wall.z2) / 2;
            const ty = MO.getTerrainHeight(midX, midZ);
            const baldrameH = Math.max(0.16, (state.houseBaseY + 0.14) - ty + 0.08);

            const baldGeo = wall.ori === 'H' ? new THREE.BoxGeometry(1.0, baldrameH, 0.22) : new THREE.BoxGeometry(0.22, baldrameH, 1.0);
            const baldrame = new THREE.Mesh(baldGeo, MO.mats.concrete);
            baldrame.position.set(midX, baseY - baldrameH / 2, midZ);
            baldrame.castShadow = true; baldrame.receiveShadow = true;
            wallsGroup.add(baldrame);

            wall.slots = [];
            wall.hasProp = false;
            wall.hasBeamFormwork = false;
            wall.hasTopBeam = false;
            wall.isPlastered = false;
            wall.hasFixture = false;
            wall.isPainted = false;

            if (wall.opening === 'door' || wall.opening === 'window') {
                const propG = new THREE.Group();
                const propH = MO.WALL_HEIGHT - rowH;
                const pOff = 0.27;
                const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, propH, 7), MO.mats.wood);
                const p2 = p1.clone();
                if (wall.ori === 'H') {
                    p1.position.set(midX - pOff, baseY + propH / 2, midZ);
                    p2.position.set(midX + pOff, baseY + propH / 2, midZ);
                } else {
                    p1.position.set(midX, baseY + propH / 2, midZ - pOff);
                    p2.position.set(midX, baseY + propH / 2, midZ + pOff);
                }
                const bar = new THREE.Mesh(wall.ori === 'H' ? new THREE.BoxGeometry(0.75, 0.05, 0.14) : new THREE.BoxGeometry(0.14, 0.05, 0.75), MO.mats.wood);
                bar.position.set(midX, baseY + propH, midZ);
                propG.add(p1, p2, bar);
                propG.visible = false;
                wallsGroup.add(propG);
                wall.propGroup = propG;

                const vHit = new THREE.Mesh(
                    wall.ori === 'H' ? new THREE.BoxGeometry(0.76, propH, 0.25) : new THREE.BoxGeometry(0.25, propH, 0.76),
                    new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.09, depthWrite: false })
                );
                vHit.position.set(midX, baseY + propH / 2, midZ);
                vHit.userData = { voidWall: wall };
                wallsGroup.add(vHit);
                wall.voidHitbox = vHit;
            }

            for (let r = 0; r < numRows; r++) {
                const isDoorVoid = wall.opening === 'door' && r < numRows - 1;
                const isWindowVoid = wall.opening === 'window' && r >= Math.floor(numRows * 0.34) && r < numRows - 1;
                if (isDoorVoid || isWindowVoid) continue;

                const stagger = (r % 2 === 1) ? 0.045 : -0.045;
                for (let c = 0; c < 2; c++) {
                    const offset = (c === 0 ? -0.24 : 0.24) + stagger;
                    const bx = wall.ori === 'H' ? midX + offset : midX;
                    const bz = wall.ori === 'V' ? midZ + offset : midZ;
                    const by = baseY + r * rowH + rowH / 2;

                    const mGeo = wall.ori === 'H' ? new THREE.BoxGeometry(0.46, 0.032, 0.19) : new THREE.BoxGeometry(0.19, 0.032, 0.46);
                    const mortarBed = new THREE.Mesh(mGeo, MO.mats.mortarLayer);
                    mortarBed.position.set(bx, baseY + r * rowH + 0.015, bz);
                    mortarBed.visible = false;
                    wallsGroup.add(mortarBed);

                    const bGeo = wall.ori === 'H' ? new THREE.BoxGeometry(0.46, rowH * 0.88, 0.18) : new THREE.BoxGeometry(0.18, rowH * 0.88, 0.46);
                    const isLintel = (wall.opening === 'door' || wall.opening === 'window') && r === numRows - 1;
                    const bMat = isLintel ? MO.mats.concrete : (isStd ? MO.mats.brickCeramic : MO.mats.brickBlock);
                    const bMesh = new THREE.Mesh(bGeo, bMat);
                    bMesh.position.set(bx, by + 0.015, bz);
                    bMesh.castShadow = true; bMesh.receiveShadow = true; bMesh.visible = false;
                    wallsGroup.add(bMesh);

                    const gMat = new THREE.MeshBasicMaterial({
                        color: wall.opening === 'door' ? 0x10b981 : (wall.opening === 'window' ? 0x38bdf8 : 0xf59e0b),
                        transparent: true, opacity: 0.14, depthWrite: false
                    });
                    const gMesh = new THREE.Mesh(bGeo, gMat);
                    gMesh.position.set(bx, by, bz);
                    wallsGroup.add(gMesh);

                    const slot = {
                        wallRef: wall, row: r, isLintel, x: bx, y: by, z: bz, ori: wall.ori,
                        hasMortar: false, placed: false, mortarMesh: mortarBed, mesh: bMesh, guideMesh: gMesh
                    };
                    mortarBed.userData.wallSlot = slot;
                    bMesh.userData.wallSlot = slot;
                    gMesh.userData.wallSlot = slot;
                    wall.slots.push(slot);
                }
            }

            // Caixaria da Cinta Superior + Cavalete/Andaime de madeira (Fase 5)
            const bfwGroup = new THREE.Group();
            const beamY = baseY + MO.WALL_HEIGHT + 0.08;
            const sideBoardGeo = wall.ori === 'H'
                ? new THREE.BoxGeometry(1.02, 0.20, 0.03)
                : new THREE.BoxGeometry(0.03, 0.20, 1.02);
            const sb1 = new THREE.Mesh(sideBoardGeo, MO.mats.formwork);
            const sb2 = sb1.clone();
            if (wall.ori === 'H') {
                sb1.position.set(midX, beamY, midZ + 0.125);
                sb2.position.set(midX, beamY, midZ - 0.125);
            } else {
                sb1.position.set(midX + 0.125, beamY, midZ);
                sb2.position.set(midX - 0.125, beamY, midZ);
            }
            [-0.32, 0.32].forEach(off => {
                const clampGeo = wall.ori === 'H'
                    ? new THREE.BoxGeometry(0.05, 0.04, 0.30)
                    : new THREE.BoxGeometry(0.30, 0.04, 0.05);
                const cl = new THREE.Mesh(clampGeo, MO.mats.wood);
                cl.position.set(
                    wall.ori === 'H' ? midX + off : midX,
                    beamY + 0.11,
                    wall.ori === 'V' ? midZ + off : midZ
                );
                bfwGroup.add(cl);
            });
            const trestleH = MO.WALL_HEIGHT * 0.55;
            const tLeg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, trestleH, 6), MO.mats.wood);
            const tLeg2 = tLeg1.clone();
            if (wall.ori === 'H') {
                tLeg1.position.set(midX - 0.34, baseY + trestleH / 2, midZ + 0.22);
                tLeg2.position.set(midX + 0.34, baseY + trestleH / 2, midZ + 0.22);
            } else {
                tLeg1.position.set(midX + 0.22, baseY + trestleH / 2, midZ - 0.34);
                tLeg2.position.set(midX + 0.22, baseY + trestleH / 2, midZ + 0.34);
            }
            const tPlankGeo = wall.ori === 'H'
                ? new THREE.BoxGeometry(0.86, 0.04, 0.18)
                : new THREE.BoxGeometry(0.18, 0.04, 0.86);
            const tPlank = new THREE.Mesh(tPlankGeo, MO.mats.formwork);
            tPlank.position.set(
                wall.ori === 'H' ? midX : midX + 0.22,
                baseY + trestleH,
                wall.ori === 'V' ? midZ : midZ + 0.22
            );
            bfwGroup.add(sb1, sb2, tLeg1, tLeg2, tPlank);
            bfwGroup.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
            bfwGroup.visible = false;
            wallsGroup.add(bfwGroup);
            wall.beamFormworkGroup = bfwGroup;

            const tbGeo = wall.ori === 'H' ? new THREE.BoxGeometry(1.0, 0.16, 0.22) : new THREE.BoxGeometry(0.22, 0.16, 1.0);
            const tbMesh = new THREE.Mesh(tbGeo, MO.mats.concrete);
            tbMesh.position.set(midX, beamY, midZ);
            tbMesh.castShadow = true; tbMesh.visible = false;
            wallsGroup.add(tbMesh);
            wall.topBeamMesh = tbMesh;

            wall.plasterGroup = createCutoutPlasterGroup(wall);
            wallsGroup.add(wall.plasterGroup);

            if (wall.opening) {
                wall.fixtureGroup = createOpeningFixture(wall);
                wallsGroup.add(wall.fixtureGroup);
            }

            const fGeo = wall.ori === 'H' ? new THREE.BoxGeometry(1.0, MO.WALL_HEIGHT + 0.16, 0.24) : new THREE.BoxGeometry(0.24, MO.WALL_HEIGHT + 0.16, 1.0);
            const fHit = new THREE.Mesh(fGeo, new THREE.MeshBasicMaterial({ visible: false }));
            fHit.position.set(midX, baseY + MO.WALL_HEIGHT / 2, midZ);
            fHit.userData = { finishWall: wall };
            wallsGroup.add(fHit);
            wall.finishHitbox = fHit;
        });
    };

    MO.buildFloorGrid3D = function() {
        const floorGroup = MO.groups.floor;
        while (floorGroup.children.length > 0) floorGroup.remove(floorGroup.children[0]);
        MO.state.floorTiles.forEach(ft => {
            const hit = new THREE.Mesh(
                new THREE.BoxGeometry(0.96, 0.12, 0.96),
                new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.22, depthWrite: false })
            );
            hit.position.set(ft.x, MO.state.houseBaseY + 0.06, ft.z);
            hit.userData = { floorTile: ft };
            floorGroup.add(hit);
            ft.hitbox = hit;
        });
    };

    MO.pourFloorTile = function(ft) {
        const state = MO.state;
        if (ft.concreted) return;
        if (state.bucketCharges <= 0) {
            MO.showToast('Balde vazio! Abasteça na Masseira.', '🪣');
            return;
        }
        ft.concreted = true;
        state.bucketCharges = Math.max(0, state.bucketCharges - 0.5);
        ft.hitbox.visible = false;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.14, 0.98), MO.mats.concrete);
        slab.position.set(ft.x, state.houseBaseY + 0.07, ft.z);
        slab.receiveShadow = true;
        slab.userData = { floorTile: ft };
        ft.slabMesh = slab;
        MO.groups.floor.add(slab);
        MO.SoundFX.playMortarSquish();
        MO.updateBucketUI();
    };

    MO.setBrickType = function(type) {
        if (MO.state.walls.some(w => w.slots.some(s => s.placed))) {
            MO.showToast('Não é possível trocar o bloco após iniciar a alvenaria.', '⚠️');
            return;
        }
        MO.state.brickType = type;
        document.getElementById('brick-standard').classList.toggle('active', type === 'standard');
        document.getElementById('brick-block').classList.toggle('active', type === 'block');
        MO.buildInteractiveWalls3D();
    };
})(window.MO = window.MO || {});
