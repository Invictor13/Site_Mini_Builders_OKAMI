// =========================================================================
// CORE: CENA THREE.JS, CÂMERA ORBITAL, CICLO DIA/NOITE & PARTÍCULAS
// =========================================================================
(function(MO) {
    const scene = new THREE.Scene();
    if (typeof THREE.FogExp2 === 'function') {
        scene.fog = new THREE.FogExp2(0x11161f, 0.0042);
    }
    const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 520);

    function getViewportMetrics() {
        const w = window.innerWidth || 1280;
        const h = window.innerHeight || 720;
        const aspect = w / h;
        const isPortrait = aspect < 1.0;

        // Em telas verticais (celulares), abre levemente o FOV e afasta o raio para caber o diorama inteiro na largura
        const fov = isPortrait ? 45 : (aspect < 1.25 ? 41 : 38);
        const halfFovRad = (fov * Math.PI) / 360;
        const tanHalfV = Math.tan(halfFovRad);
        const tanHalfH = tanHalfV * aspect;

        // Raio mínimo para enquadrar o vale amplo da cidade
        const minRadiusH = (MO.DIORAMA_R + 3.0) / Math.max(0.22, tanHalfH);
        const minRadiusV = (MO.DIORAMA_R * 0.90) / Math.max(0.22, tanHalfV);
        const radius = Math.max(32.0, Math.min(68.0, Math.max(minRadiusH, minRadiusV)));

        // Em retrato desloca levemente o target para cima/baixo para centralizar entre HUD superior e dock inferior
        const targetY = isPortrait ? 0.85 : 0.55;
        return { fov, radius, targetY, isPortrait };
    }

    function getIdealRadius() {
        return getViewportMetrics().radius;
    }

    const initialMetrics = getViewportMetrics();
    camera.fov = initialMetrics.fov;
    camera.updateProjectionMatrix();

    const camOrbit = {
        radius: 23.5,
        targetRadius: 23.5,
        theta: 0.36,
        phi: initialMetrics.isPortrait ? 1.02 : 0.96,
        target: new THREE.Vector3(0, initialMetrics.targetY, 0.2),
        targetGoal: new THREE.Vector3(0, initialMetrics.targetY, 0.2),
        isDragging: false,
        prevX: 0,
        prevY: 0
    };

    MO.focusCameraOn = function(x = 0, z = 0.2, radiusOverride = null) {
        camOrbit.targetGoal.set(x, getViewportMetrics().targetY, z);
        camOrbit.targetRadius = radiusOverride !== null ? radiusOverride : getIdealRadius();
    };

    MO.scene = scene;
    MO.camera = camera;
    MO.camOrbit = camOrbit;
    MO.getIdealRadius = getIdealRadius;
    MO.getViewportMetrics = getViewportMetrics;
    MO.renderer = null;

    MO.initRenderer = function(containerEl) {
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.92;
        containerEl.appendChild(renderer.domElement);
        MO.renderer = renderer;

        function handleResize() {
            const w = window.innerWidth;
            const h = window.innerHeight;
            const m = getViewportMetrics();
            camera.aspect = w / h;
            camera.fov = m.fov;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
            camOrbit.radius = m.radius;
            camOrbit.target.y = m.targetY;
        }

        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', () => setTimeout(handleResize, 120));
    };

    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x26211d, 0.46);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffe7c7, 1.38);
    sunLight.position.set(14, 19, 12);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    const sd = 22;
    sunLight.shadow.camera.left = -sd;
    sunLight.shadow.camera.right = sd;
    sunLight.shadow.camera.top = sd;
    sunLight.shadow.camera.bottom = -sd;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.28);
    rimLight.position.set(-14, 8, -11);
    scene.add(rimLight);

    MO.lights = { hemiLight, sunLight, rimLight };

    MO.groups = {
        diorama: new THREE.Group(),
        terrainChunks: new THREE.Group(),
        cityInfra: new THREE.Group(),
        cityNodes: new THREE.Group(),
        nature: new THREE.Group(),
        weeds: new THREE.Group(),
        splat: new THREE.Group(),
        blueprint: new THREE.Group(),
        foundation: new THREE.Group(),
        looseRebars: new THREE.Group(),
        walls: new THREE.Group(),
        muroStair: new THREE.Group(),
        looseBricks: new THREE.Group(),
        floor: new THREE.Group(),
        mep: new THREE.Group(),
        roof: new THREE.Group(),
        bridge: new THREE.Group(),
        building: new THREE.Group(),
        tower: new THREE.Group(),
        archivedConstructions: new THREE.Group(),
        lotMarkers: new THREE.Group(),
        toolbox: new THREE.Group(),
        demarcation: new THREE.Group(),
        workbench: new THREE.Group(),
        camp: new THREE.Group(),
        workers: new THREE.Group(),
        fx: new THREE.Group(),
        physicsSupplies: new THREE.Group()
    };

    Object.values(MO.groups).forEach(g => scene.add(g));

    const selectionPreview = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.08, 1),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45 })
    );
    selectionPreview.visible = false;
    scene.add(selectionPreview);
    MO.selectionPreview = selectionPreview;

    const brickHoverGhost = new THREE.Mesh(
        new THREE.BoxGeometry(0.47, 0.26, 0.19),
        new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.55 })
    );
    brickHoverGhost.visible = false;
    scene.add(brickHoverGhost);
    MO.brickHoverGhost = brickHoverGhost;

    const placementGhostMat = new THREE.MeshBasicMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.42,
        depthWrite: false
    });
    const placementGhost = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.4, 1),
        placementGhostMat
    );
    placementGhost.visible = false;
    scene.add(placementGhost);
    MO.placementGhost = placementGhost;

    const burstGeo = new THREE.BoxGeometry(0.055, 0.055, 0.055);
    const burstMats = new Map();
    if (MO.resources) {
        MO.resources.protect(
            selectionPreview.geometry, selectionPreview.material,
            brickHoverGhost.geometry, brickHoverGhost.material,
            placementGhost.geometry, placementGhost.material,
            burstGeo
        );
    }

    MO.spawnBurst = function(x, y, z, colorHex, count = 10, spread = 0.07) {
        let pMat = burstMats.get(colorHex);
        if (!pMat) {
            pMat = new THREE.MeshBasicMaterial({ color: colorHex });
            burstMats.set(colorHex, pMat);
            if (MO.resources) MO.resources.protect(pMat);
        }
        for (let i = 0; i < count; i++) {
            const m = new THREE.Mesh(burstGeo, pMat);
            m.position.set(x + (Math.random() - 0.5) * 0.25, y, z + (Math.random() - 0.5) * 0.25);
            MO.groups.fx.add(m);
            MO.state.particles.push({
                mesh: m,
                vx: (Math.random() - 0.5) * spread,
                vy: 0.035 + Math.random() * 0.05,
                vz: (Math.random() - 0.5) * spread,
                life: 1.0
            });
        }
    };

    // Ciclo suave Dia -> Entardecer -> Noite para o Protetor de Tela
    const cSunDay = new THREE.Color(0xffe7c7);
    const cSunSunset = new THREE.Color(0xff9b54);
    const cSunNight = new THREE.Color(0x6488ea);
    const cSkyDay = new THREE.Color(0xdbeafe);
    const cSkyNight = new THREE.Color(0x1e293b);

    MO.updateAtmosphere = function(dt, t) {
        const state = MO.state;
        if (state.cycleDayNight) {
            // Se todos os trabalhadores estiverem dormindo nas barracas de noite, acelera suavemente até o amanhecer
            const allSleeping = state.isNight &&
                state.camp && state.camp.nightMode === 'sleep' &&
                state.workers.length > 0 &&
                state.workers.every(w => w.sleepingInside);
            const cycleRate = allSleeping ? 0.048 : 0.0105;
            state.timeOfDay = (state.timeOfDay + dt * cycleRate) % 1;
        }
        const tod = state.timeOfDay;
        const sunAngle = tod * Math.PI * 2;
        const elevation = Math.sin(sunAngle); // >0 dia, <0 noite

        const sd = (MO.state && MO.state.infiniteWorld) ? 24 : 13;
        if (sunLight.shadow && sunLight.shadow.camera) {
            sunLight.shadow.camera.left = -sd;
            sunLight.shadow.camera.right = sd;
            sunLight.shadow.camera.top = sd;
            sunLight.shadow.camera.bottom = -sd;
        }
        const tx = camOrbit && camOrbit.target ? camOrbit.target.x : 0;
        const tz = camOrbit && camOrbit.target ? camOrbit.target.z : 0;
        sunLight.position.set(tx + Math.cos(sunAngle) * 18, Math.max(5, Math.abs(elevation) * 22), tz + 14);
        if (sunLight.target) {
            sunLight.target.position.set(tx, 0, tz);
            if (!sunLight.target.parent) scene.add(sunLight.target);
        }

        const dayFactor = Math.max(0, Math.min(1, (elevation + 0.15) / 0.55));
        const sunsetFactor = Math.max(0, 1 - Math.abs(elevation) / 0.35);

        sunLight.intensity = 0.34 + dayFactor * 1.32;
        sunLight.color.copy(cSunNight).lerp(cSunDay, dayFactor).lerp(cSunSunset, sunsetFactor * 0.65);

        hemiLight.intensity = 0.28 + dayFactor * 0.42;
        hemiLight.color.copy(cSkyNight).lerp(cSkyDay, dayFactor);
        rimLight.intensity = 0.22 + (1 - dayFactor) * 0.28;
        if (scene.fog && scene.fog.color) {
            scene.fog.color.setHex(0x0c111b).lerp(new THREE.Color(0x88c7e8), dayFactor).lerp(new THREE.Color(0xd97757), sunsetFactor * 0.42);
        }
        if (typeof document !== 'undefined' && document.body && state.biome === 'forest') {
            if (dayFactor > 0.55) {
                document.body.style.background = 'linear-gradient(180deg, #38bdf8 0%, #7dd3fc 42%, #bae6fd 72%, #1e3a5f 100%)';
            } else if (sunsetFactor > 0.35) {
                document.body.style.background = 'linear-gradient(180deg, #475569 0%, #c26d4f 48%, #f59e0b 78%, #1e293b 100%)';
            } else {
                document.body.style.background = 'radial-gradient(circle at 50% 42%, #172033 0%, #0d1421 62%, #060910 100%)';
            }
        }

        const nowNight = dayFactor < 0.32;
        if (nowNight !== state.isNight) {
            state.isNight = nowNight;
            const skyBtn = document.getElementById('btn-daynight');
            if (skyBtn) skyBtn.textContent = state.isNight ? '🌙' : '☀️';
        }

        // Atualiza iluminação automática noturna das obras concluídas/em andamento
        const nightGlow = state.isNight ? 1.0 : 0.0;
        if (state.mode === 'house' && state.elecLights.length > 0 && state.elecPowerOn) {
            state.elecLights.forEach(l => {
                l.light.intensity = state.isNight ? 2.4 : 1.5;
                l.bulb.material.emissiveIntensity = state.isNight ? 2.0 : 1.3;
            });
        }
        if (MO.worldManager && MO.worldManager.getNightLights) {
            const archivedLights = MO.worldManager.getNightLights();
            for (let i = 0; i < archivedLights.length; i++) {
                const l = archivedLights[i];
                if (l && l.light && l.bulb && l.bulb.material) {
                    l.light.intensity = state.isNight ? 2.2 : 0.8;
                    l.bulb.material.emissiveIntensity = state.isNight ? 2.0 : 0.8;
                }
            }
        }
        if (MO.constructionManager && MO.constructionManager.updateWarmWindowGlow) {
            MO.constructionManager.updateWarmWindowGlow(state.isNight);
        }
        if (state.mode === 'bridge' && state.bridge.lamps.length > 0) {
            state.bridge.lamps.forEach(lp => {
                lp.light.intensity = nightGlow * 1.8;
                lp.bulb.material.emissiveIntensity = nightGlow * 1.8;
            });
        }
        if (state.mode === 'building' && state.building.floors.length > 0) {
            state.building.floors.forEach(fl => {
                if (fl.light) fl.light.intensity = fl.mepDone ? (0.4 + nightGlow * 1.8) : 0;
            });
        }
        if (state.mode === 'tower' && state.tower.beaconLight) {
            const blink = Math.sin(t * 5.0) > 0 ? 1 : 0.15;
            state.tower.beaconLight.intensity = (0.8 + nightGlow * 2.2) * blink;
            if (state.tower.beaconMesh) {
                state.tower.beaconMesh.material.emissiveIntensity = (0.8 + nightGlow * 1.8) * blink;
            }
        }
    };

    MO.toggleDayNightStep = function() {
        MO.state.timeOfDay = MO.state.isNight ? 0.22 : 0.78;
        MO.updateAtmosphere(0, MO.simClock ? MO.simClock.simTime : performance.now() * 0.001);
        MO.showToast(MO.state.isNight ? '🌙 Anoiteceu no canteiro! Luzes acesas.' : '☀️ Amanheceu no canteiro!', MO.state.isNight ? '🌙' : '☀️');
    };
})(window.MO = window.MO || {});
