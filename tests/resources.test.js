const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeDisposable(label) {
    return {
        label,
        disposeCalls: 0,
        dispose() {
            this.disposeCalls++;
        }
    };
}

function makeTexture(label) {
    return {
        ...makeDisposable(label),
        isTexture: true
    };
}

function makeMaterial(label, extras = {}) {
    return {
        ...makeDisposable(label),
        isMaterial: true,
        ...extras
    };
}

function makeGeometry(label) {
    return {
        ...makeDisposable(label),
        isBufferGeometry: true
    };
}

function makeGroup() {
    const group = {
        children: [],
        add(...items) {
            for (const item of items) {
                if (!this.children.includes(item)) this.children.push(item);
            }
        },
        remove(item) {
            const idx = this.children.indexOf(item);
            if (idx !== -1) this.children.splice(idx, 1);
        },
        traverse(fn) {
            fn(this);
            for (const child of this.children) {
                if (typeof child.traverse === 'function') child.traverse(fn);
                else fn(child);
            }
        }
    };
    return group;
}

function loadResourcesModule(initialMO = {}) {
    const sandbox = {
        window: { MO: initialMO }
    };
    sandbox.window.window = sandbox.window;
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'core', 'resources.js'),
        'utf8'
    );
    vm.runInNewContext(code, sandbox);
    return sandbox.window.MO;
}

test('protege MO.mats e suas texturas contra descarte em clearGroup', () => {
    const sharedTex = makeTexture('brick-color');
    const sharedBump = makeTexture('brick-bump');
    const sharedMat = makeMaterial('brickCeramic', { map: sharedTex, bumpMap: sharedBump });

    const MO = loadResourcesModule({
        mats: { brickCeramic: sharedMat }
    });

    const uniqueGeo = makeGeometry('wall-brick');
    const uniqueTex = makeTexture('sand-noise');
    const uniqueMat = makeMaterial('sand-mat', { map: uniqueTex });

    const group = makeGroup();
    const meshA = { geometry: uniqueGeo, material: sharedMat, children: [] };
    const meshB = { geometry: uniqueGeo, material: uniqueMat, children: [] };
    group.add(meshA, meshB);

    const stats = MO.resources.clearGroup(group);

    assert.equal(group.children.length, 0);
    assert.equal(sharedMat.disposeCalls, 0);
    assert.equal(sharedTex.disposeCalls, 0);
    assert.equal(sharedBump.disposeCalls, 0);

    // Geometria compartilhada entre meshA e meshB dentro do mesmo grupo deve ser descartada apenas 1 vez
    assert.equal(uniqueGeo.disposeCalls, 1);
    assert.equal(uniqueMat.disposeCalls, 1);
    assert.equal(uniqueTex.disposeCalls, 1);
    assert.deepEqual({ ...stats }, { geometries: 1, materials: 1, textures: 1 });
});

test('não descarta geometria interna compartilhada de THREE.Sprite, mas descarta SpriteMaterial e CanvasTexture', () => {
    const MO = loadResourcesModule();

    const spriteInternalGeo = makeGeometry('sprite-shared-internal');
    const badgeTex = makeTexture('badge-canvas');
    const badgeMat = makeMaterial('badge-sprite-mat', { map: badgeTex });

    const sprite = {
        isSprite: true,
        geometry: spriteInternalGeo,
        material: badgeMat,
        children: []
    };

    const stats = MO.resources.disposeObject3D(sprite);

    assert.equal(spriteInternalGeo.disposeCalls, 0);
    assert.equal(badgeMat.disposeCalls, 1);
    assert.equal(badgeTex.disposeCalls, 1);
    assert.deepEqual({ ...stats }, { geometries: 0, materials: 1, textures: 1 });
});

test('protect() preserva geometrias e materiais globais compartilhados em removeAndDispose', () => {
    const MO = loadResourcesModule();

    const trackGeo = makeGeometry('track-geo');
    const burstMat = makeMaterial('burst-mat');
    MO.resources.protect(trackGeo, burstMat);

    const trackMat = makeMaterial('track-instance-mat');
    const parent = makeGroup();
    const trackMesh = { geometry: trackGeo, material: trackMat };
    const burstMesh = { geometry: trackGeo, material: burstMat };
    parent.add(trackMesh, burstMesh);

    const s1 = MO.resources.removeAndDispose(parent, trackMesh);
    assert.equal(parent.children.length, 1);
    assert.equal(trackGeo.disposeCalls, 0);
    assert.equal(trackMat.disposeCalls, 1);
    assert.deepEqual({ ...s1 }, { geometries: 0, materials: 1, textures: 0 });

    const s2 = MO.resources.removeAndDispose(parent, burstMesh);
    assert.equal(parent.children.length, 0);
    assert.equal(trackGeo.disposeCalls, 0);
    assert.equal(burstMat.disposeCalls, 0);
    assert.deepEqual({ ...s2 }, { geometries: 0, materials: 0, textures: 0 });
});

test('suporta array de materiais em um único Mesh', () => {
    const MO = loadResourcesModule();

    const protectedMat = makeMaterial('protected-slot');
    MO.resources.protect(protectedMat);

    const tex1 = makeTexture('slot-1-tex');
    const freeMat = makeMaterial('free-slot', { map: tex1 });
    const geo = makeGeometry('multi-mat-box');

    const mesh = { geometry: geo, material: [protectedMat, freeMat] };
    const stats = MO.resources.disposeObject3D(mesh);

    assert.equal(geo.disposeCalls, 1);
    assert.equal(protectedMat.disposeCalls, 0);
    assert.equal(freeMat.disposeCalls, 1);
    assert.equal(tex1.disposeCalls, 1);
    assert.deepEqual({ ...stats }, { geometries: 1, materials: 1, textures: 1 });
});
