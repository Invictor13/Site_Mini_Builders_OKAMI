// =========================================================================
// CORE: TEXTURAS PROCEDURAIS E MATERIAIS PBR COMPARTILHADOS
// =========================================================================
(function(MO) {
    function createNoiseTexture(hex, variation, repeat = 1) {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const ctx = c.getContext('2d');
        const base = new THREE.Color(hex);
        const img = ctx.createImageData(256, 256);
        for (let i = 0; i < img.data.length; i += 4) {
            const n = (Math.random() - 0.5) * variation;
            img.data[i] = Math.min(255, Math.max(0, base.r * 255 + n));
            img.data[i + 1] = Math.min(255, Math.max(0, base.g * 255 + n));
            img.data[i + 2] = Math.min(255, Math.max(0, base.b * 255 + n));
            img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeat, repeat);
        return tex;
    }

    function createWoodGrainTexture(baseHex, darkHex) {
        const c = document.createElement('canvas');
        c.width = 512; c.height = 256;
        const ctx = c.getContext('2d');
        ctx.fillStyle = baseHex;
        ctx.fillRect(0, 0, 512, 256);
        ctx.strokeStyle = darkHex;
        ctx.globalAlpha = 0.34;
        for (let y = 0; y < 256; y += 5) {
            ctx.beginPath();
            ctx.lineWidth = 1.5 + Math.random() * 2;
            ctx.moveTo(0, y);
            for (let x = 0; x <= 512; x += 32) {
                ctx.lineTo(x, y + Math.sin(x * 0.02 + y * 0.1) * 4);
            }
            ctx.stroke();
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    function createBrickTextures(baseHex, grooveHex) {
        const c = document.createElement('canvas');
        c.width = 256; c.height = 128;
        const ctx = c.getContext('2d');
        ctx.fillStyle = baseHex;
        ctx.fillRect(0, 0, 256, 128);
        const img = ctx.getImageData(0, 0, 256, 128);
        for (let i = 0; i < img.data.length; i += 4) {
            const n = (Math.random() - 0.5) * 20;
            img.data[i] = Math.min(255, Math.max(0, img.data[i] + n));
            img.data[i + 1] = Math.min(255, Math.max(0, img.data[i + 1] + n));
            img.data[i + 2] = Math.min(255, Math.max(0, img.data[i + 2] + n));
        }
        ctx.putImageData(img, 0, 0);
        ctx.fillStyle = grooveHex;
        ctx.globalAlpha = 0.25;
        for (let y = 18; y < 115; y += 22) ctx.fillRect(8, y, 240, 6);
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = '#2b1208';
        ctx.lineWidth = 8;
        ctx.strokeRect(0, 0, 256, 128);
        return { colorTex: new THREE.CanvasTexture(c), bumpTex: new THREE.CanvasTexture(c) };
    }

    function createRoofTileTextures() {
        const c = document.createElement('canvas');
        c.width = 256; c.height = 256;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#8f4024';
        ctx.fillRect(0, 0, 256, 256);
        for (let x = 0; x < 256; x += 24) {
            const grad = ctx.createLinearGradient(x, 0, x + 24, 0);
            grad.addColorStop(0, '#5e2714');
            grad.addColorStop(0.45, '#a84f2f');
            grad.addColorStop(1, '#5e2714');
            ctx.fillStyle = grad;
            ctx.fillRect(x, 0, 24, 256);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        for (let y = 0; y < 256; y += 32) ctx.fillRect(0, y, 256, 3);
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(3, 2);
        return tex;
    }

    MO.createNoiseTexture = createNoiseTexture;
    MO.createWoodGrainTexture = createWoodGrainTexture;
    MO.createBrickTextures = createBrickTextures;
    MO.createRoofTileTextures = createRoofTileTextures;

    const ceramicTex = createBrickTextures('#9d4627', '#4e1d0d');
    const blockTex = createBrickTextures('#82817c', '#454542');
    const roofTileTex = createRoofTileTextures();

    MO.mats = {
        baseWood: new THREE.MeshStandardMaterial({ map: createWoodGrainTexture('#3a2517', '#1d1108'), roughness: 0.5, metalness: 0.06 }),
        baseSlate: new THREE.MeshStandardMaterial({ map: createNoiseTexture('#232830', 14, 4), roughness: 0.86, metalness: 0.12 }),
        stone: new THREE.MeshStandardMaterial({ map: createNoiseTexture('#4b525a', 26, 2), roughness: 0.92, flatShading: true }),
        trunkWood: new THREE.MeshStandardMaterial({ map: createWoodGrainTexture('#473628', '#241911'), roughness: 0.94 }),
        concrete: new THREE.MeshStandardMaterial({ map: createNoiseTexture('#7e858c', 18), roughness: 0.88 }),
        concreteDark: new THREE.MeshStandardMaterial({ map: createNoiseTexture('#5c636b', 18), roughness: 0.90 }),
        brickCeramic: new THREE.MeshStandardMaterial({ map: ceramicTex.colorTex, bumpMap: ceramicTex.bumpTex, bumpScale: 0.025, roughness: 0.82 }),
        brickBlock: new THREE.MeshStandardMaterial({ map: blockTex.colorTex, bumpMap: blockTex.bumpTex, bumpScale: 0.022, roughness: 0.88 }),
        steel: new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.35 }),
        hole: new THREE.MeshStandardMaterial({ color: 0x1b130d, roughness: 1.0 }),
        wood: new THREE.MeshStandardMaterial({ map: createNoiseTexture('#7c5939', 22), roughness: 0.84 }),
        formwork: new THREE.MeshStandardMaterial({ map: createNoiseTexture('#9e744a', 22), roughness: 0.80 }),
        mortarLayer: new THREE.MeshStandardMaterial({ color: 0x5c636b, roughness: 0.95 }),
        roofTile: new THREE.MeshStandardMaterial({ map: roofTileTex, bumpMap: roofTileTex, bumpScale: 0.04, roughness: 0.78 }),
        doorWood: new THREE.MeshStandardMaterial({ map: createWoodGrainTexture('#694225', '#3d2412'), roughness: 0.65 }),
        windowFrame: new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.65, roughness: 0.35 }),
        glass: new THREE.MeshStandardMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.42, roughness: 0.1, metalness: 0.3 }),
        conduit: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45, emissive: 0x451a03, emissiveIntensity: 0.25 }),
        qdc: new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.4, roughness: 0.4 }),
        outlet: new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.4 }),
        pipeCold: new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.45 }),
        pipeSewage: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 }),
        waterTank: new THREE.MeshStandardMaterial({ color: 0x0369a1, roughness: 0.35 })
    };
})(window.MO = window.MO || {});
