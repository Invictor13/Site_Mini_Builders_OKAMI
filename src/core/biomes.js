// =========================================================================
// CORE: BIOMAS, CLIMA (CHUVA / VENTO), SOL/LUA/ESTRELAS & PÁSSAROS
// =========================================================================
(function(MO) {
    MO.BIOMES = {
        forest: {
            id: 'forest', label: 'Floresta',
            grassDark: '#3b6e2c', grassLight: '#65a33e', earthPad: '#a17c52',
            pondBed: '#164e63', rockSlope: '#78716c', sandShore: '#d6c391', snowPeak: '#f1f5f9',
            waterColor: 0x1ea3c4,
            bgGradient: 'linear-gradient(180deg, #38bdf8 0%, #7dd3fc 42%, #bae6fd 72%, #1e3a5f 100%)'
        },
        coast: {
            id: 'coast', label: 'Litoral',
            grassDark: '#8b7e54', grassLight: '#c9b783', earthPad: '#d6c39a',
            pondBed: '#0c4a6e', rockSlope: '#78716c', waterColor: 0x0ea5e9,
            bgGradient: 'radial-gradient(circle at 50% 42%, #163042 0%, #0d1d2b 62%, #071018 100%)'
        },
        cerrado: {
            id: 'cerrado', label: 'Cerrado',
            grassDark: '#6b6e2e', grassLight: '#918738', earthPad: '#9a4f30',
            pondBed: '#3b2c20', rockSlope: '#7c4a35', waterColor: 0x26545c,
            bgGradient: 'radial-gradient(circle at 50% 42%, #2e241f 0%, #1b1412 62%, #0e0a09 100%)'
        },
        mountain: {
            id: 'mountain', label: 'Montanha',
            grassDark: '#263829', grassLight: '#384c3d', earthPad: '#5c5955',
            pondBed: '#111827', rockSlope: '#64748b', waterColor: 0x1e3a5f,
            bgGradient: 'radial-gradient(circle at 50% 42%, #1f2937 0%, #111827 62%, #070b12 100%)'
        }
    };

    const skyGroup = new THREE.Group();
    const weatherGroup = new THREE.Group();
    let starsMesh = null;
    let sunDisc = null;
    let moonDisc = null;
    let cloudMat = null;
    const clouds = [];

    MO.initSkyAndWeather = function() {
        MO.scene.add(skyGroup, weatherGroup);

        // Nuvens low-poly estilizadas no céu alto
        const cloudGeo = new THREE.IcosahedronGeometry(1.0, 0);
        cloudMat = new THREE.MeshStandardMaterial({
            color: 0xf8fafc,
            roughness: 0.95,
            flatShading: true,
            transparent: true,
            opacity: 0.92,
            fog: false
        });
        if (MO.resources) MO.resources.protect(cloudGeo, cloudMat);
        for (let i = 0; i < 9; i++) {
            const cGrp = new THREE.Group();
            const puffs = [
                [0, 0, 0, 2.2, 1.05, 1.5],
                [-1.6, -0.2, 0.2, 1.5, 0.85, 1.2],
                [1.6, -0.25, -0.1, 1.65, 0.9, 1.25],
                [0.4, 0.5, 0.15, 1.3, 0.8, 1.1]
            ];
            puffs.forEach(([px, py, pz, sx, sy, sz]) => {
                const m = new THREE.Mesh(cloudGeo, cloudMat);
                m.position.set(px, py, pz);
                m.scale.set(sx, sy, sz);
                cGrp.add(m);
            });
            const scale = 1.25 + (i % 3) * 0.45;
            cGrp.scale.setScalar(scale);
            skyGroup.add(cGrp);
            clouds.push({
                mesh: cGrp,
                ox: ((i % 3) - 1) * 44 + (i * 11 % 19) - 9,
                oz: -38 - Math.floor(i / 3) * 28,
                y: 26 + (i % 4) * 3.2,
                speed: 0.55 + (i % 3) * 0.25
            });
        }

        // Cúpula celeste distante de estrelas (nunca intercepta o terreno)
        const sCount = 220;
        const sPos = new Float32Array(sCount * 3);
        for (let i = 0; i < sCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 0.42;
            const r = 185;
            sPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            sPos[i * 3 + 1] = 18 + r * Math.cos(phi);
            sPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        const sGeo = new THREE.BufferGeometry();
        sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
        starsMesh = new THREE.Points(
            sGeo,
            new THREE.PointsMaterial({ color: 0xe2e8f0, size: 1.15, transparent: true, opacity: 0.0, fog: false })
        );
        skyGroup.add(starsMesh);

        // Disco Solar e Lua bem distantes no horizonte celeste (fora do alcance dos chunks)
        sunDisc = new THREE.Mesh(
            new THREE.SphereGeometry(4.6, 16, 12),
            new THREE.MeshBasicMaterial({ color: 0xfde68a, fog: false })
        );
        moonDisc = new THREE.Mesh(
            new THREE.SphereGeometry(3.2, 16, 12),
            new THREE.MeshBasicMaterial({ color: 0xdbeafe, fog: false })
        );
        skyGroup.add(sunDisc, moonDisc);

        // 6 Pássaros em bando voando sobre os bosques e vales
        const birdMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0, side: THREE.DoubleSide });
        const birdWingGeo = new THREE.BoxGeometry(0.22, 0.02, 0.07);
        if (MO.resources) MO.resources.protect(birdMat, birdWingGeo);
        for (let i = 0; i < 6; i++) {
            const b = new THREE.Group();
            const wL = new THREE.Mesh(birdWingGeo, birdMat);
            wL.position.x = -0.10; wL.rotation.z = 0.25;
            const wR = new THREE.Mesh(birdWingGeo, birdMat);
            wR.position.x = 0.10; wR.rotation.z = -0.25;
            b.add(wL, wR);
            skyGroup.add(b);
            MO.state.site.birds.push({
                mesh: b, wL, wR,
                angle: i * 1.05,
                radius: 7.5 + (i % 3) * 2.6,
                height: 6.2 + (i % 3) * 1.1,
                speed: 0.20 + (i % 4) * 0.035
            });
        }

        // 6 Borboletas coloridas low-poly sobrevoando clareiras floridas de dia
        const bfGeo = new THREE.BoxGeometry(0.11, 0.015, 0.09);
        const bfColors = [0xfacc15, 0xf472b6, 0x38bdf8, 0xfb923c];
        const bfMats = bfColors.map(c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
        if (MO.resources) MO.resources.protect(bfGeo, ...bfMats);
        MO.state.site.butterflies = [];
        for (let i = 0; i < 6; i++) {
            const bf = new THREE.Group();
            const mat = bfMats[i % bfMats.length];
            const wL = new THREE.Mesh(bfGeo, mat);
            wL.position.x = -0.055;
            const wR = new THREE.Mesh(bfGeo, mat);
            wR.position.x = 0.055;
            bf.add(wL, wR);
            weatherGroup.add(bf);
            MO.state.site.butterflies.push({
                mesh: bf, wL, wR,
                ox: ((i % 3) - 1) * 7.5 + (i * 1.7 % 3.5),
                oz: (i < 3 ? -6.5 : 6.0) + (i % 2) * 2.2,
                phase: i * 1.3,
                speed: 0.65 + (i % 3) * 0.22
            });
        }

        // Pool de gotas de chuva 3D
        const rMat = new THREE.MeshBasicMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.45 });
        const rGeo = new THREE.BoxGeometry(0.022, 0.36, 0.022);
        for (let i = 0; i < 110; i++) {
            const drop = new THREE.Mesh(rGeo, rMat);
            drop.position.set(
                (Math.random() - 0.5) * 16,
                Math.random() * 11,
                (Math.random() - 0.5) * 16
            );
            drop.visible = false;
            weatherGroup.add(drop);
            MO.state.site.rainDrops.push(drop);
        }

        // Vagalumes sutis à noite acompanhando a área dos bosques ao redor da câmera
        const ffMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.85 });
        const ffGeo = new THREE.SphereGeometry(0.036, 6, 4);
        if (MO.resources) MO.resources.protect(ffMat, ffGeo);
        for (let i = 0; i < 18; i++) {
            const ff = new THREE.Mesh(ffGeo, ffMat);
            ff.visible = false;
            weatherGroup.add(ff);
            MO.state.site.fireflies.push({
                mesh: ff,
                bx: (i % 2 === 0 ? 7.2 : -7.2) + ((i * 3.1) % 7.0) - 3.5,
                bz: -4.5 + ((i * 2.7) % 10.0),
                phase: i * 0.9,
                speed: 0.75 + (i % 4) * 0.22
            });
        }
    };

    MO.updateSkyAndWeather = function(dt, t) {
        const state = MO.state;
        const tx = MO.camOrbit && MO.camOrbit.target ? MO.camOrbit.target.x : 0;
        const tz = MO.camOrbit && MO.camOrbit.target ? MO.camOrbit.target.z : 0;
        const sunAngle = state.timeOfDay * Math.PI * 2;
        if (sunDisc) {
            const sy = Math.sin(sunAngle) * 120 + 18;
            sunDisc.position.set(tx + Math.cos(sunAngle) * 165, sy, tz - 115);
            sunDisc.visible = sy > 8;
        }
        if (moonDisc) {
            const my = -Math.sin(sunAngle) * 115 + 18;
            moonDisc.position.set(tx - Math.cos(sunAngle) * 165, my, tz - 115);
            moonDisc.visible = my > 8;
        }
        if (starsMesh) {
            starsMesh.position.set(tx, 0, tz);
            const targetOp = state.isNight ? 0.78 : 0.0;
            starsMesh.material.opacity += (targetOp - starsMesh.material.opacity) * Math.min(1, dt * 1.8);
        }
        if (clouds.length > 0) {
            if (cloudMat && cloudMat.color) {
                cloudMat.color.setHex(state.isNight ? 0x64748b : 0xf8fafc);
                cloudMat.opacity = state.isNight ? 0.45 : 0.92;
            }
            clouds.forEach(cl => {
                cl.ox += cl.speed * dt;
                if (cl.ox > 85) cl.ox = -85;
                cl.mesh.position.set(tx + cl.ox, cl.y, tz + cl.oz);
            });
        }

        // Voo suave dos pássaros acompanhando a área da câmera
        state.site.birds.forEach((b, idx) => {
            b.mesh.visible = !state.isNight && state.weather !== 'rain';
            if (!b.mesh.visible) return;
            b.angle += b.speed * dt;
            const x = tx + Math.cos(b.angle) * (b.radius * 1.6);
            const z = tz + Math.sin(b.angle) * (b.radius * 1.6);
            b.mesh.position.set(x, b.height + 1.4 + Math.sin(t * 2 + idx) * 0.25, z);
            b.mesh.rotation.y = -b.angle;
            const flap = Math.sin(t * 9 + idx * 1.7) * 0.42;
            b.wL.rotation.z = flap;
            b.wR.rotation.z = -flap;
        });

        // Chuva 3D sempre cobrindo o campo visível da câmera
        const raining = state.weather === 'rain';
        state.site.rainDrops.forEach(drop => {
            drop.visible = raining;
            if (!raining) return;
            drop.position.y -= dt * 16.5;
            drop.position.x -= dt * 1.4;
            if (drop.position.y < -0.2 || Math.abs(drop.position.x - tx) > 22 || Math.abs(drop.position.z - tz) > 22) {
                drop.position.y = 12.5 + Math.random() * 4;
                drop.position.x = tx + (Math.random() - 0.5) * 32;
                drop.position.z = tz + (Math.random() - 0.5) * 32;
            }
        });

        // Balanço das árvores com vento/chuva
        const swayAmp = state.weather === 'wind' ? 0.065 : (raining ? 0.04 : 0.012);
        state.site.swayingTrees.forEach((tr, i) => {
            tr.rotation.z = Math.sin(t * (state.weather === 'wind' ? 3.8 : 1.5) + i) * swayAmp;
        });

        // Fumaça suave das chaminés das casas habitadas (P2.2 + P3.0)
        if (state.village && Array.isArray(state.village.chimneys) && state.village.chimneys.length > 0 && MO.spawnBurst) {
            state.village.smokeTimer = (state.village.smokeTimer || 0) + dt;
            if (state.village.smokeTimer >= 0.45) {
                state.village.smokeTimer = 0;
                state.village.chimneys.forEach(ch => {
                    MO.spawnBurst(ch.x, ch.y, ch.z, 0xe2e8f0, 1, 0.014);
                });
            }
        }

        // Borboletas nas clareiras floridas (dia sem chuva)
        if (Array.isArray(state.site.butterflies)) {
            const showBf = !state.isNight && !raining;
            state.site.butterflies.forEach((bf, i) => {
                bf.mesh.visible = showBf;
                if (!showBf) return;
                const ang = t * bf.speed + bf.phase;
                const x = (state.infiniteWorld ? tx : 0) + bf.ox + Math.sin(ang) * 2.2;
                const z = (state.infiniteWorld ? tz : 0) + bf.oz + Math.cos(ang * 1.3) * 1.9;
                const y = Math.max(0.35, MO.getTerrainHeight(x, z) + 0.65 + Math.sin(t * 3.6 + i) * 0.28);
                bf.mesh.position.set(x, y, z);
                bf.mesh.rotation.y = Math.atan2(Math.cos(ang) * 2.2, -Math.sin(ang * 1.3) * 1.9);
                const flap = Math.sin(t * 18 + i * 1.7) * 0.72;
                bf.wL.rotation.z = flap;
                bf.wR.rotation.z = -flap;
            });
        }

        // Vagalumes à noite acompanhando os bosques ao redor da câmera (sem chuva)
        const showFireflies = state.isNight && !raining;
        state.site.fireflies.forEach((ff, i) => {
            ff.mesh.visible = showFireflies;
            if (!showFireflies) return;
            const ang = t * ff.speed + ff.phase;
            const cx = state.infiniteWorld ? tx : 0;
            const cz = state.infiniteWorld ? tz : 0;
            const x = cx + ff.bx + Math.sin(ang) * 0.95;
            const z = cz + ff.bz + Math.cos(ang * 0.85) * 0.95;
            const y = Math.max(0.4, MO.getTerrainHeight(x, z) + 0.62 + Math.sin(t * 2.4 + i) * 0.28);
            ff.mesh.position.set(x, y, z);
            const pulse = 0.45 + 0.55 * Math.sin(t * 5.0 + i * 2.1);
            ff.mesh.scale.setScalar(pulse);
        });
    };

    MO.applyBiomeStyle = function(biomeId) {
        const b = MO.BIOMES[biomeId] || MO.BIOMES.forest;
        MO.state.biome = b.id;
        if (document && document.body) {
            document.body.style.background = b.bgGradient;
        }
        if (MO.waterSurfaceMesh && MO.waterSurfaceMesh.material) {
            MO.waterSurfaceMesh.material.color.setHex(b.waterColor);
        }
    };

    MO.setWeather = function(wType) {
        MO.state.weather = wType;
        if (MO.mixer && MO.mixer.tarpMesh) {
            // Lona protetora na masseira durante chuva
            MO.mixer.tarpMesh.visible = (wType === 'rain');
        }
        const btn = document.getElementById('btn-weather');
        if (btn) {
            btn.textContent = wType === 'rain' ? '🌧️' : (wType === 'wind' ? '💨' : '🌤️');
        }
    };

    MO.cycleWeatherManual = function() {
        const order = ['clear', 'rain', 'wind'];
        const next = order[(order.indexOf(MO.state.weather) + 1) % order.length];
        MO.setWeather(next);
        const names = { clear: 'Céu Limpo', rain: 'Chuva no Canteiro (Lona na Masseira)', wind: 'Ventania Forte' };
        MO.showToast(`Clima: ${names[next]}`, next === 'rain' ? '🌧️' : (next === 'wind' ? '💨' : '🌤️'));
    };
})(window.MO = window.MO || {});
