// =========================================================================
// CORE: BIOMAS, CLIMA (CHUVA / VENTO), SOL/LUA/ESTRELAS & PÁSSAROS
// =========================================================================
(function(MO) {
    MO.BIOMES = {
        forest: {
            id: 'forest', label: 'Floresta',
            grassDark: '#344528', grassLight: '#465934', earthPad: '#7a654d',
            pondBed: '#1d2a2d', rockSlope: '#52544f', waterColor: 0x164252,
            bgGradient: 'radial-gradient(circle at 50% 42%, #1e2631 0%, #11161f 62%, #090c12 100%)'
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

    MO.initSkyAndWeather = function() {
        MO.scene.add(skyGroup, weatherGroup);

        // Estrelas sutis que aparecem à noite
        const sCount = 180;
        const sPos = new Float32Array(sCount * 3);
        for (let i = 0; i < sCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 0.42;
            const r = 46;
            sPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            sPos[i * 3 + 1] = 8 + r * Math.cos(phi);
            sPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        const sGeo = new THREE.BufferGeometry();
        sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
        starsMesh = new THREE.Points(
            sGeo,
            new THREE.PointsMaterial({ color: 0xe2e8f0, size: 0.28, transparent: true, opacity: 0.0 })
        );
        skyGroup.add(starsMesh);

        // Disco Solar e Lua
        sunDisc = new THREE.Mesh(
            new THREE.SphereGeometry(0.95, 12, 10),
            new THREE.MeshBasicMaterial({ color: 0xfde68a })
        );
        moonDisc = new THREE.Mesh(
            new THREE.SphereGeometry(0.65, 12, 10),
            new THREE.MeshBasicMaterial({ color: 0xdbeafe })
        );
        skyGroup.add(sunDisc, moonDisc);

        // 4 Pássaros simples em V voando devagar ao redor do diorama
        const birdMat = new THREE.MeshBasicMaterial({ color: 0xcbd5e1, side: THREE.DoubleSide });
        for (let i = 0; i < 4; i++) {
            const b = new THREE.Group();
            const wL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.07), birdMat);
            wL.position.x = -0.10; wL.rotation.z = 0.25;
            const wR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.07), birdMat);
            wR.position.x = 0.10; wR.rotation.z = -0.25;
            b.add(wL, wR);
            skyGroup.add(b);
            MO.state.site.birds.push({
                mesh: b, wL, wR,
                angle: i * 1.5,
                radius: 7.5 + (i % 2) * 2.2,
                height: 6.4 + (i % 3) * 0.9,
                speed: 0.22 + i * 0.03
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

        // Vagalumes sutis à noite perto do acampamento e das árvores
        const ffMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.85 });
        const ffGeo = new THREE.SphereGeometry(0.032, 6, 4);
        for (let i = 0; i < 14; i++) {
            const ff = new THREE.Mesh(ffGeo, ffMat);
            ff.visible = false;
            weatherGroup.add(ff);
            MO.state.site.fireflies.push({
                mesh: ff,
                bx: (i % 2 === 0 ? 5.8 : -5.8) + (Math.random() - 0.5) * 3.5,
                bz: -2.2 + (Math.random() - 0.5) * 4.2,
                phase: Math.random() * Math.PI * 2,
                speed: 0.8 + Math.random() * 0.7
            });
        }
    };

    MO.updateSkyAndWeather = function(dt, t) {
        const state = MO.state;
        const sunAngle = state.timeOfDay * Math.PI * 2;
        if (sunDisc) {
            sunDisc.position.set(Math.cos(sunAngle) * 28, Math.sin(sunAngle) * 22 + 2, -16);
            sunDisc.visible = Math.sin(sunAngle) > -0.1;
        }
        if (moonDisc) {
            moonDisc.position.set(-Math.cos(sunAngle) * 28, -Math.sin(sunAngle) * 20 + 2, -16);
            moonDisc.visible = Math.sin(sunAngle) < 0.15;
        }
        if (starsMesh) {
            const targetOp = state.isNight ? 0.72 : 0.0;
            starsMesh.material.opacity += (targetOp - starsMesh.material.opacity) * Math.min(1, dt * 1.8);
        }

        // Voo suave dos pássaros durante o dia
        state.site.birds.forEach((b, idx) => {
            b.mesh.visible = !state.isNight && state.weather !== 'rain';
            if (!b.mesh.visible) return;
            b.angle += b.speed * dt;
            const x = Math.cos(b.angle) * b.radius;
            const z = Math.sin(b.angle) * b.radius;
            b.mesh.position.set(x, b.height + Math.sin(t * 2 + idx) * 0.25, z);
            b.mesh.rotation.y = -b.angle;
            const flap = Math.sin(t * 9 + idx * 1.7) * 0.42;
            b.wL.rotation.z = flap;
            b.wR.rotation.z = -flap;
        });

        // Chuva 3D
        const raining = state.weather === 'rain';
        state.site.rainDrops.forEach(drop => {
            drop.visible = raining;
            if (!raining) return;
            drop.position.y -= dt * 16.5;
            drop.position.x -= dt * 1.4;
            if (drop.position.y < -0.2) {
                drop.position.y = 10.5;
                drop.position.x = (Math.random() - 0.5) * 16;
                drop.position.z = (Math.random() - 0.5) * 16;
            }
        });

        // Balanço das árvores com vento/chuva
        const swayAmp = state.weather === 'wind' ? 0.065 : (raining ? 0.04 : 0.012);
        state.site.swayingTrees.forEach((tr, i) => {
            tr.rotation.z = Math.sin(t * (state.weather === 'wind' ? 3.8 : 1.5) + i) * swayAmp;
        });

        // Vagalumes à noite (sem chuva)
        const showFireflies = state.isNight && !raining;
        state.site.fireflies.forEach((ff, i) => {
            ff.mesh.visible = showFireflies;
            if (!showFireflies) return;
            const ang = t * ff.speed + ff.phase;
            const x = ff.bx + Math.sin(ang) * 0.65;
            const z = ff.bz + Math.cos(ang * 0.85) * 0.65;
            const y = Math.max(0.4, MO.getTerrainHeight(x, z) + 0.55 + Math.sin(t * 2.4 + i) * 0.25);
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
