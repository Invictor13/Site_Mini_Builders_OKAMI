// =========================================================================
// MODO CASA (FASE 2): FUNDAÇÃO, ARMADURAS COM GRAVIDADE, CAIXARIA & CONCRETO
// =========================================================================
(function(MO) {
    MO.advanceToPhase2 = function() {
        const state = MO.state;
        const minCells = state.cityMode ? 2 : 4;
        if (state.occupiedCells.size < minCells) {
            MO.showToast('Desenhe pelo menos 2x2m na planta ou clique em ✨ Modelo!', '⚠️');
            return;
        }
        state.phase = 2;
        MO.hideTerrainGridLines();
        MO.syncPhaseUI();
        MO.buildFoundation3D();
        MO.selectTool('dig');
        MO.showToast(`Fase 2: Cave as ${state.columns.length} sapatas nos cantos!`, '⛏️');
    };

    MO.buildFoundation3D = function() {
        const foundationGroup = MO.groups.foundation;
        MO.resources.clearGroup(foundationGroup);
        MO.state.columns.forEach(col => {
            col.terrainY = MO.getTerrainHeight(col.x, col.z);
            const g = new THREE.Group();
            g.position.set(col.x, col.terrainY, col.z);

            const ring = new THREE.Mesh(
                new THREE.RingGeometry(0.18, 0.31, 4),
                new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.rotation.z = Math.PI / 4;
            ring.position.y = 0.04;
            g.add(ring);

            const hit = new THREE.Mesh(new THREE.BoxGeometry(0.68, 2.5, 0.68), new THREE.MeshBasicMaterial({ visible: false }));
            hit.position.y = 1.1;
            hit.userData = { column: col };
            g.add(hit);

            col.meshGroup = g;
            col.ringMesh = ring;
            col.hitbox = hit;
            foundationGroup.add(g);
        });
    };

    MO.createRebarCageMesh = function(height = 2.05) {
        const cage = new THREE.Group();
        const offsets = [[-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06], [0.06, 0.06]];
        offsets.forEach(([ox, oz]) => {
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, height, 7), MO.mats.steel);
            bar.position.set(ox, height / 2, oz);
            bar.castShadow = true;
            cage.add(bar);
        });
        for (let y = 0.25; y < height - 0.15; y += 0.42) {
            const st = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.15), MO.mats.steel);
            st.position.y = y;
            cage.add(st);
        }
        const grab = new THREE.Mesh(new THREE.BoxGeometry(0.45, height, 0.45), new THREE.MeshBasicMaterial({ visible: false }));
        grab.position.y = height / 2;
        cage.add(grab);
        return cage;
    };

    MO.spawnFallingRebars = function(forcedCount) {
        const state = MO.state;
        const colNeeded = state.columns ? state.columns.filter(c => !c.hasRebar).length : 0;
        const needed = forcedCount || Math.max(colNeeded - state.looseRebars.filter(r => !r.installed).length, state.mode === 'tower' ? 4 : 0);
        if (needed <= 0) {
            MO.showToast('Todas as armaduras necessárias já estão no canteiro!', '⛓️');
            return;
        }
        for (let i = 0; i < needed; i++) {
            const cage = MO.createRebarCageMesh();
            const dx = MO.STATION_REBAR.x - 0.6 + (i % 3) * 0.58;
            const dz = MO.STATION_REBAR.z - 0.3 + Math.floor(i / 3) * 0.58;
            const ty = MO.getTerrainHeight(dx, dz);
            cage.position.set(dx, ty + 3.0 + i * 0.45, dz);
            cage.rotation.z = Math.PI / 2 - 0.22;
            cage.rotation.y = (Math.random() - 0.5) * 0.6;
            const rObj = { mesh: cage, vy: 0, grounded: false, installed: false };
            cage.traverse(c => c.userData.rebarObj = rObj);
            MO.groups.looseRebars.add(cage);
            state.looseRebars.push(rObj);
        }
        MO.SoundFX.playMetalClang();
        MO.showToast(`${needed} armaduras entregues! Arraste cada uma para dentro das sapatas.`, '⛓️');
    };

    MO.attachWoodFormworkToColumn = function(col) {
        if (col.hasFormwork) return;
        col.hasFormwork = true;
        const topY = MO.state.houseBaseY + MO.WALL_HEIGHT + 0.14;
        const h = Math.max(1.85, topY - col.terrainY);
        const fw = new THREE.Group();
        const w = 0.28, t = 0.03;
        const p1 = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), MO.mats.formwork); p1.position.set(0, h / 2, w / 2);
        const p2 = p1.clone(); p2.position.set(0, h / 2, -w / 2);
        const p3 = new THREE.Mesh(new THREE.BoxGeometry(t, h, w), MO.mats.formwork); p3.position.set(w / 2, h / 2, 0);
        const p4 = p3.clone(); p4.position.set(-w / 2, h / 2, 0);
        [p1, p2, p3, p4].forEach(p => { p.castShadow = true; p.receiveShadow = true; fw.add(p); });
        col.formworkMesh = fw;
        col.meshGroup.add(fw);
    };

    MO.concreteColumn = function(col) {
        if (col.concreted) return;
        col.concreted = true;
        if (col.formworkMesh) col.formworkMesh.visible = false;
        const topY = MO.state.houseBaseY + MO.WALL_HEIGHT + 0.14;
        const h = Math.max(1.85, topY - col.terrainY + 0.15);
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.24, h, 0.24), MO.mats.concrete);
        pillar.position.y = h / 2 - 0.15;
        pillar.castShadow = true; pillar.receiveShadow = true;
        col.pillarMesh = pillar;
        col.meshGroup.add(pillar);
        col.ringMesh.visible = false;
        MO.spawnBurst(col.x, col.terrainY + 1.1, col.z, 0x94a3b8, 10);
        MO.SoundFX.playMortarSquish();
    };

    MO.eraseColumn = function(col) {
        if (col.concreted && col.pillarMesh) {
            col.concreted = false; MO.resources.removeAndDispose(col.meshGroup, col.pillarMesh); col.pillarMesh = null;
            if (col.formworkMesh) col.formworkMesh.visible = true; col.ringMesh.visible = true;
        } else if (col.hasFormwork && col.formworkMesh) {
            col.hasFormwork = false; MO.resources.removeAndDispose(col.meshGroup, col.formworkMesh); col.formworkMesh = null;
        } else if (col.dug && col.holeMesh) {
            col.dug = false; MO.resources.removeAndDispose(col.meshGroup, col.holeMesh); col.holeMesh = null;
            col.ringMesh.material.color.setHex(0xf59e0b);
        }
    };
})(window.MO = window.MO || {});
