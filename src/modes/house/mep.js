// =========================================================================
// MODO CASA (FASE 4): INSTALAÇÕES MEP (ELÉTRICA & HIDRÁULICA COM RAIO-X)
// =========================================================================
(function(MO) {
    MO.toggleXRayMode = function(forceVal) {
        const state = MO.state;
        state.xray = (typeof forceVal === 'boolean') ? forceVal : !state.xray;
        const btn = document.getElementById('btn-xray');
        if (btn) btn.classList.toggle('xray-on', state.xray);

        const op = state.xray ? 0.22 : 1.0;
        [
            MO.mats.brickCeramic, MO.mats.brickBlock, MO.mats.concrete,
            MO.mats.concreteDark, MO.mats.mortarLayer
        ].forEach(m => {
            m.transparent = state.xray;
            m.opacity = op;
            m.depthWrite = !state.xray;
            m.needsUpdate = true;
        });
        state.walls.forEach(w => {
            if (w.plasterMat) {
                w.plasterMat.transparent = state.xray;
                w.plasterMat.opacity = op;
                w.plasterMat.depthWrite = !state.xray;
            }
        });
    };

    MO.advanceToPhase4 = function() {
        const state = MO.state;
        state.phase = 4;
        if (state.selectedBrickInHand) {
            state.selectedBrickInHand.mesh.scale.set(1, 1, 1);
            state.selectedBrickInHand = null;
        }
        MO.brickHoverGhost.visible = false;
        MO.syncPhaseUI();
        MO.toggleXRayMode(true);
        MO.selectTool('elec');
        MO.showToast('Fase 4 (Raio-X Ativo): Clique nas paredes para instalar QDC, tomadas e hidráulica!', '⚡');
    };

    MO.placeElectricalNode = function(wall, pt) {
        const state = MO.state;
        const mepGroup = MO.groups.mep;
        const hasQDC = state.elecNodes.some(n => n.type === 'qdc');
        const type = hasQDC ? 'outlet' : 'qdc';
        const y = Math.max(state.houseBaseY + 0.55, Math.min(state.houseBaseY + 1.45, pt.y));

        const baseY = state.houseBaseY + 0.14;
        const ceilingY = baseY + MO.WALL_HEIGHT + 0.02;
        const chaseH = Math.max(0.25, ceilingY - y);
        const chaseGeo = wall.ori === 'H'
            ? new THREE.BoxGeometry(0.08, chaseH, 0.23)
            : new THREE.BoxGeometry(0.23, chaseH, 0.08);
        const chaseMesh = new THREE.Mesh(chaseGeo, MO.mats.hole);
        chaseMesh.position.set(pt.x, y + chaseH / 2, pt.z);
        mepGroup.add(chaseMesh);

        const mesh = type === 'qdc'
            ? new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.25), MO.mats.qdc)
            : new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.19, 0.24), MO.mats.outlet);
        mesh.position.set(pt.x, y, pt.z);
        if (wall.ori === 'V') mesh.rotation.y = Math.PI / 2;

        const node = { id: state.elecNodes.length, type, x: pt.x, y, z: pt.z, wallRef: wall, mesh, chaseMesh, connected: type === 'qdc' };
        mesh.userData = { mepNode: node, mepKind: 'elec' };
        mepGroup.add(mesh);

        if (state.elecNodes.length > 0) {
            const prev = state.elecNodes[state.elecNodes.length - 1];
            const curve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(prev.x, prev.y, prev.z),
                new THREE.Vector3(prev.x, ceilingY, prev.z),
                new THREE.Vector3((prev.x + node.x) / 2, ceilingY + 0.05, (prev.z + node.z) / 2),
                new THREE.Vector3(node.x, ceilingY, node.z),
                new THREE.Vector3(node.x, node.y, node.z)
            ]);
            const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.032, 8, false), MO.mats.conduit);
            mepGroup.add(tube);
            state.elecConduits.push(tube);
            node.connected = true;

            const lx = (prev.x + node.x) / 2, lz = (prev.z + node.z) / 2;
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0x000000 }));
            bulb.position.set(lx, ceilingY - 0.06, lz);
            const pLight = new THREE.PointLight(0xffd28a, 0, 6.5);
            pLight.position.set(lx, ceilingY - 0.25, lz);
            mepGroup.add(bulb, pLight);
            state.elecLights.push({ bulb, light: pLight });
        }

        MO.spawnBurst(pt.x, y, pt.z, 0xf59e0b, 8, 0.06);
        state.elecNodes.push(node);
        MO.SoundFX.playElectricSwitch();
        MO.showToast(type === 'qdc' ? 'Alvenaria rasgada e Quadro de Luz (QDC) instalado! Clique nas paredes para tomadas 4x2.' : 'Rasgo na alvenaria, caixinha 4x2 e conduíte amarelo instalados!', '⚡');
    };

    MO.testElectricalSystem = function() {
        const state = MO.state;
        const hasQDC = state.elecNodes.some(n => n.type === 'qdc');
        if (!hasQDC || state.elecNodes.length < 2) {
            MO.showToast('Instale o QDC e pelo menos 1 ponto elétrico conectado antes de testar!', '⚠️');
            return;
        }
        state.elecPowerOn = !state.elecPowerOn;
        MO.SoundFX.playElectricSwitch();
        state.elecLights.forEach(l => {
            l.light.intensity = state.elecPowerOn ? 1.8 : 0;
            l.bulb.material.emissive.setHex(state.elecPowerOn ? 0xfbbf24 : 0x000000);
            l.bulb.material.emissiveIntensity = state.elecPowerOn ? 1.5 : 0;
        });
        MO.showToast(state.elecPowerOn ? '⚡ Energia ligada! Circuito validado e luminárias acesas!' : 'Disjuntor geral desligado.', '⚡');
    };

    MO.placePlumbingNode = function(kind, pt) {
        const state = MO.state;
        const mepGroup = MO.groups.mep;
        let mesh;
        const node = { id: state.plumbNodes.length, type: kind, x: pt.x, y: pt.y, z: pt.z, connected: false };

        if (kind === 'tank') {
            mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.56, 16), MO.mats.waterTank);
            node.y = state.houseBaseY + MO.WALL_HEIGHT + 0.45;
            mesh.position.set(node.x, node.y, node.z);
            node.connected = true;
        } else if (kind === 'fixture') {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.24), new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3 }));
            node.y = state.houseBaseY + 0.85;
            mesh.position.set(node.x, node.y, node.z);
            const chaseH = MO.WALL_HEIGHT * 0.75;
            const ch = new THREE.Mesh(new THREE.BoxGeometry(0.09, chaseH, 0.23), MO.mats.hole);
            ch.position.set(node.x, state.houseBaseY + 0.14 + chaseH / 2, node.z);
            mepGroup.add(ch);
        } else {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.55), MO.mats.concreteDark);
            node.y = MO.getTerrainHeight(node.x, node.z) + 0.12;
            mesh.position.set(node.x, node.y, node.z);
            node.connected = true;
        }

        mesh.castShadow = true;
        mesh.userData = { mepNode: node, mepKind: 'plumb' };
        node.mesh = mesh;
        mepGroup.add(mesh);
        state.plumbNodes.push(node);

        const tank = state.plumbNodes.find(n => n.type === 'tank');
        const sewage = state.plumbNodes.find(n => n.type === 'sewage');

        if (kind === 'fixture' && tank) {
            const curve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(tank.x, tank.y - 0.2, tank.z),
                new THREE.Vector3(node.x, tank.y - 0.35, node.z),
                new THREE.Vector3(node.x, node.y, node.z)
            ]);
            const pipe = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.03, 7, false), MO.mats.pipeCold);
            mepGroup.add(pipe);
            state.plumbPipes.push(pipe);
            node.connected = true;
        }
        if ((kind === 'sewage' || kind === 'fixture') && sewage) {
            state.plumbNodes.filter(n => n.type === 'fixture' && !n.sewageLinked).forEach(fx => {
                fx.sewageLinked = true;
                const floorY = state.houseBaseY + 0.06;
                const curve = new THREE.CatmullRomCurve3([
                    new THREE.Vector3(fx.x, fx.y - 0.1, fx.z),
                    new THREE.Vector3(fx.x, floorY, fx.z),
                    new THREE.Vector3(sewage.x, floorY - 0.1, sewage.z),
                    new THREE.Vector3(sewage.x, sewage.y, sewage.z)
                ]);
                const pipe = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.045, 8, false), MO.mats.pipeSewage);
                mepGroup.add(pipe);
                state.plumbPipes.push(pipe);
            });
        }

        MO.SoundFX.playMortarSquish();
        const msg = kind === 'tank'
            ? "Caixa d'Água instalada! Clique nas paredes para pontos de água e no terreno fora para a Fossa."
            : (kind === 'fixture' ? 'Ponto hidráulico (PVC marrom) instalado!' : 'Caixa de Gordura / Fossa (PVC branco) conectada!');
        MO.showToast(msg, '💧');
    };

    MO.testPlumbingSystem = function() {
        const state = MO.state;
        const tank = state.plumbNodes.find(n => n.type === 'tank');
        const fixtures = state.plumbNodes.filter(n => n.type === 'fixture');
        if (!tank) {
            MO.showToast("Instale primeiro a Caixa d'Água clicando sobre a casa!", '⚠️');
            return;
        }
        MO.SoundFX.playWaterRush();
        state.leakPoints = [];
        const unconnected = fixtures.filter(f => !f.sewageLinked);
        if (fixtures.length === 0) {
            state.leakPoints.push({ x: tank.x, y: tank.y - 0.25, z: tank.z });
            MO.showToast("💦 Vazamento detectado na saída da Caixa d'Água! Conecte pontos de consumo.", '💧');
        } else if (unconnected.length > 0) {
            unconnected.forEach(u => state.leakPoints.push({ x: u.x, y: u.y - 0.1, z: u.z }));
            MO.showToast('💦 Vazamento no esgoto! Clique no terreno externo para instalar a Fossa.', '💧');
        } else {
            state.waterFlowActive = true;
            fixtures.forEach(f => MO.spawnBurst(f.x, f.y, f.z, 0x38bdf8, 12, 0.04));
            MO.showToast('✅ Pressão hidráulica e drenagem validadas sem vazamentos!', '💧');
        }
    };
})(window.MO = window.MO || {});
