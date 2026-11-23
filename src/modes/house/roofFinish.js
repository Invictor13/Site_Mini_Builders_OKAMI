// =========================================================================
// MODO CASA (FASE 5): CAIXARIA DA CINTA, TELHADO (VARIANTES), MOBÍLIA & PINTURA
// =========================================================================
(function(MO) {
    MO.advanceToPhase5 = function() {
        MO.state.phase = 5;
        MO.state.leakPoints = [];
        MO.toggleXRayMode(false);
        MO.syncPhaseUI();
        MO.selectTool('beam-fw');
        if (MO.triggerDeliveryTruck) MO.triggerDeliveryTruck();
        MO.showToast('Fase 5: Monte a Caixaria das Cintas, concrete e cubra a casa!', '🪵');
    };

    MO.buildHouseInteriorFurniture = function() {
        const state = MO.state;
        if (state.furnitureBuilt || state.floorTiles.length === 0) return;
        state.furnitureBuilt = true;

        const floorY = state.houseBaseY + 0.14;
        const grp = new THREE.Group();

        // Calcula centro aproximado da planta
        let sx = 0, sz = 0;
        state.floorTiles.forEach(ft => { sx += ft.x; sz += ft.z; });
        const cx = sx / state.floorTiles.length;
        const cz = sz / state.floorTiles.length;

        // Sofá acolchoado + Mesa de centro + Tapete
        const rug = new THREE.Mesh(
            new THREE.BoxGeometry(1.15, 0.02, 0.85),
            new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.95 })
        );
        rug.position.set(cx - 0.35, floorY + 0.01, cz + 0.15);

        const sofaMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
        const sofaBase = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.24, 0.42), sofaMat);
        sofaBase.position.set(cx - 0.35, floorY + 0.14, cz - 0.25);
        const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.30, 0.10), sofaMat);
        sofaBack.position.set(cx - 0.35, floorY + 0.34, cz - 0.41);

        const table = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.22, 0.34), MO.mats.doorWood);
        table.position.set(cx - 0.35, floorY + 0.12, cz + 0.22);

        // Bancada da cozinha + Cama no canto oposto
        const counter = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.46, 0.38), MO.mats.concreteDark);
        counter.position.set(cx + 0.75, floorY + 0.23, cz - 0.35);

        const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.20, 0.95), MO.mats.wood);
        bedFrame.position.set(cx + 0.75, floorY + 0.10, cz + 0.45);
        const mattress = new THREE.Mesh(
            new THREE.BoxGeometry(0.66, 0.12, 0.86),
            new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 })
        );
        mattress.position.set(cx + 0.75, floorY + 0.24, cz + 0.45);

        grp.add(rug, sofaBase, sofaBack, table, counter, bedFrame, mattress);
        grp.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        MO.groups.floor.add(grp);
    };

    MO.buildRealGableRoofStage = function() {
        const state = MO.state;
        const roofGroup = MO.groups.roof;
        if (state.occupiedCells.size === 0) return;

        // Verifica risco de falha estrutural ao colocar o telhado pesado sem cinta completa ou em evento realista
        const missingBeam = state.walls.some(w => !w.hasTopBeam);
        const missingProp = state.walls.some(w => w.opening && !w.hasProp);
        if (state.roofStage === 0 && (missingBeam || missingProp || (state.riskProfile === 'realistic' && state.structural.integrity < 72 && !state.structural.repairedOnce))) {
            const reason = missingBeam ? 'TELHADO ASSENTADO SEM CINTA SUPERIOR'
                : (missingProp ? 'VERGA CEDEU SEM ESCORAMENTO' : 'TRAÇO DE CONCRETO FRACO NA CINTA');
            MO.triggerStructuralCollapse(reason, { x: 0, y: state.houseBaseY + MO.WALL_HEIGHT + 0.2, z: 0 });
            if (!state.screensaver) return;
        }

        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        state.floorTiles.forEach(ft => {
            minX = Math.min(minX, ft.x - 0.5);
            maxX = Math.max(maxX, ft.x + 0.5);
            minZ = Math.min(minZ, ft.z - 0.5);
            maxZ = Math.max(maxZ, ft.z + 0.5);
        });

        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        const width = maxX - minX;
        const depth = maxZ - minZ;
        const eaveY = state.houseBaseY + 0.14 + MO.WALL_HEIGHT + 0.16;

        // Variante Moderna: Laje Plana + Platibanda Arquitetônica
        if (state.variant === 'modern') {
            if (state.roofStage === 0) {
                const parapet = new THREE.Group();
                const slab = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.14, depth + 0.4), MO.mats.concrete);
                slab.position.set(cx, eaveY + 0.07, cz);
                slab.castShadow = true; slab.receiveShadow = true;
                parapet.add(slab);
                roofGroup.add(parapet);
                state.roofStage = 1;
                MO.SoundFX.playMortarSquish();
                MO.showToast('Laje de cobertura concretada! Clique em Telhado novamente para fechar a platibanda.', '🏗️');
            } else if (state.roofStage === 1) {
                const plat = new THREE.Group();
                const pMat = MO.mats.concreteDark;
                const pN = new THREE.Mesh(new THREE.BoxGeometry(width + 0.44, 0.36, 0.14), pMat); pN.position.set(cx, eaveY + 0.26, minZ - 0.15);
                const pS = pN.clone(); pS.position.z = maxZ + 0.15;
                const pW = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.36, depth + 0.44), pMat); pW.position.set(minX - 0.15, eaveY + 0.26, cz);
                const pE = pW.clone(); pE.position.x = maxX + 0.15;
                [pN, pS, pW, pE].forEach(p => { p.castShadow = true; plat.add(p); });
                roofGroup.add(plat);
                state.roofStage = 2;
                MO.SoundFX.playBrickClack();
                MO.showToast('Platibanda moderna finalizada! Agora passe o Reboco nas paredes.', '🏠');
                MO.selectTool('plaster');
            }
            return;
        }

        const ridgeAlongX = width >= depth;
        const span = ridgeAlongX ? depth : width;
        const length = ridgeAlongX ? width : depth;
        const overhang = state.variant === 'chalet' ? 0.46 : 0.34;
        const ridgeMul = state.variant === 'chalet' ? 0.52 : 0.34;
        const ridgeH = Math.min(1.85, Math.max(0.85, span * ridgeMul));
        const halfSpan = span / 2;
        const slopeLen = Math.hypot(halfSpan + overhang, ridgeH);
        const slopeAngle = Math.atan2(ridgeH, halfSpan);

        if (state.roofStage === 0) {
            const roofFrame = new THREE.Group();
            roofFrame.position.set(cx, eaveY, cz);
            if (!ridgeAlongX) roofFrame.rotation.y = Math.PI / 2;

            const triShape = new THREE.Shape();
            triShape.moveTo(-halfSpan, 0);
            triShape.lineTo(halfSpan, 0);
            triShape.lineTo(0, ridgeH);
            triShape.closePath();
            const gableGeo = new THREE.ExtrudeGeometry(triShape, { depth: 0.18, bevelEnabled: false });
            gableGeo.rotateY(Math.PI / 2);

            const g1 = new THREE.Mesh(gableGeo, MO.mats.concrete);
            g1.position.set(-length / 2, 0, 0);
            g1.castShadow = true;
            const g2 = new THREE.Mesh(gableGeo, MO.mats.concrete);
            g2.position.set(length / 2 - 0.18, 0, 0);
            g2.castShadow = true;
            roofFrame.add(g1, g2);

            const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(length + overhang * 2, 0.12, 0.10), MO.mats.wood);
            ridgeBeam.position.set(0, ridgeH, 0);
            ridgeBeam.castShadow = true;
            roofFrame.add(ridgeBeam);

            const numRafters = Math.max(4, Math.ceil(length) + 1);
            for (let i = 0; i < numRafters; i++) {
                const rx = -length / 2 - overhang * 0.6 + (i / (numRafters - 1)) * (length + overhang * 1.2);
                [-1, 1].forEach(side => {
                    const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, slopeLen), MO.mats.wood);
                    rafter.position.set(rx, ridgeH / 2 - 0.04, side * (halfSpan + overhang * 0.4) / 2);
                    rafter.rotation.x = side * slopeAngle;
                    rafter.castShadow = true;
                    roofFrame.add(rafter);
                });
            }

            roofGroup.add(roofFrame);
            state.roofStage = 1;
            MO.SoundFX.playHammerWood();
            MO.showToast('Madeiramento e oitões prontos! Clique novamente para assentar as telhas cerâmicas.', '🪵');
        } else if (state.roofStage === 1) {
            const tilesGrp = new THREE.Group();
            tilesGrp.position.set(cx, eaveY, cz);
            if (!ridgeAlongX) tilesGrp.rotation.y = Math.PI / 2;

            const roofLen = length + overhang * 2;
            [-1, 1].forEach(side => {
                const plane = new THREE.Mesh(new THREE.BoxGeometry(roofLen, 0.075, slopeLen + 0.08), MO.mats.roofTile);
                plane.position.set(0, ridgeH / 2 + 0.03, side * (halfSpan + overhang * 0.42) / 2);
                plane.rotation.x = side * slopeAngle;
                plane.castShadow = true;
                plane.receiveShadow = true;
                tilesGrp.add(plane);
            });

            const cap = new THREE.Mesh(
                new THREE.CylinderGeometry(0.11, 0.11, roofLen + 0.04, 10, 1, false, 0, Math.PI),
                MO.mats.roofTile
            );
            cap.rotation.z = Math.PI / 2;
            cap.rotation.x = -Math.PI / 2;
            cap.position.set(0, ridgeH + 0.07, 0);
            cap.castShadow = true;
            tilesGrp.add(cap);

            roofGroup.add(tilesGrp);
            state.roofStage = 2;
            MO.SoundFX.playBrickClack();
            MO.showToast('Telhado concluído! Agora passe o Reboco nas paredes.', '🏠');
            MO.selectTool('plaster');
        }
    };

    MO.setPaintColor = function(hex, btnEl) {
        MO.state.paintColorHex = hex;
        document.querySelectorAll('.swatch-btn').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');
        MO.selectTool('paint');
        MO.showToast('Cor selecionada! Clique nas paredes rebocadas para pintar.', '🎨');
    };
})(window.MO = window.MO || {});
