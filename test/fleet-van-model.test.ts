import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as T from 'three';
import { buildAsset } from '../app/model/assets';
import { buildArrivalVan, updateArrivalVan } from '../app/model/arrival';
import {
  fleetVanModel,
  preloadFleetVanModel,
} from '../app/model/fleet-van-model';
import { FLEET_VAN_CAB_DOOR, FLEET_VAN_RAMP } from '../app/model/photo-assets';
import { validateFacility } from '../app/model/schema';

const close = (actual: number, expected: number, message: string) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message}: ${actual} vs ${expected}`,
  );

/** The real GLTF loader needs image decoding but these geometry tests need no pixels. */
function installImageGlobals() {
  const replacements = {
    self: globalThis,
    createImageBitmap: async () => ({ width: 2048, height: 2304, close() {} }),
    ProgressEvent: class extends Event {
      constructor(type: string, values: ProgressEventInit = {}) {
        super(type);
        Object.assign(this, values);
      }
    },
  };
  const previous = Object.keys(replacements).map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  for (const [key, value] of Object.entries(replacements))
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  return () => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  };
}

function mesh(root: T.Object3D, name: string) {
  const found = root.getObjectByName(name);
  assert.ok(
    found instanceof T.Mesh,
    `${name} is a mesh from the committed photo van`,
  );
  return found as T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
}

void test('the committed photo van supplies parked assets and working arrival rigs', async (t) => {
  const model = validateFacility(
    JSON.parse(
      readFileSync('public/models/seen-alhambra-planning.json', 'utf8'),
    ),
  );
  const material = () => new T.MeshStandardMaterial();
  assert.equal(
    fleetVanModel(),
    null,
    'the procedural fallback remains available before loading',
  );
  const fallback = buildArrivalVan(model, 'A', material);
  assert.equal(fallback.wheels.length, 0);
  assert.ok(
    fallback.doors.every(Boolean),
    'the fallback still has its operable doors',
  );

  const restore = installImageGlobals();
  let template: T.Object3D | null;
  try {
    const glb = readFileSync('public/models/fleet-van.glb');
    template = await preloadFleetVanModel(
      `data:model/gltf-binary;base64,${glb.toString('base64')}`,
    );
  } finally {
    restore();
  }
  assert.ok(template, 'the real loader successfully parses the shipped GLB');
  assert.notEqual(
    fleetVanModel(),
    template,
    'instances clone the cached template',
  );

  await t.test('parked fleet assets use the photo geometry and livery', () => {
    const parked = buildAsset(model.assets['fleet-van-a'], material);
    assert.ok(
      parked.getObjectByName('fleet-van'),
      'the static asset contains the GLB root',
    );
    assert.ok(
      mesh(parked, 'driver-door-panel').material.map,
      'the parked van keeps its photo atlas',
    );
    for (const wheel of ['fl', 'fr', 'rl', 'rr'])
      mesh(parked, `wheel-${wheel}`);
    const glass = mesh(parked, 'driver-door-glass');
    assert.equal(glass.material.transparent, true);
    assert.equal(glass.material.depthWrite, false);
    assert.equal(glass.castShadow, false);
  });

  await t.test(
    'photo-van doors and wheelchair ramp follow the arrival pose',
    () => {
      const van = buildArrivalVan(model, 'B', material);
      assert.equal(van.wheels.length, 4);
      assert.ok(van.wheels.every((wheel) => wheel instanceof T.Mesh));
      assert.equal(van.wheelRadius, 0.375);
      assert.equal(van.doorSlide, 0.78);
      assert.ok(van.cabDoor, 'the photo van has its driver-door pivot');
      const position = new T.Vector3(-20, -0.23, 8);
      updateArrivalVan(
        van,
        {
          position,
          heading: Math.PI / 2,
          visible: true,
          door: 1,
          cabDoor: 1,
          ramp: 1,
        },
        true,
      );
      assert.deepEqual(van.root.position.toArray(), position.toArray());
      close(van.root.rotation.y, Math.PI / 2, 'heading');
      close(
        van.doors[0].position.z,
        -0.78,
        'front passenger leaf slides forward',
      );
      close(
        van.doors[1].position.z,
        0.78,
        'rear passenger leaf slides backward',
      );
      close(
        van.cabDoor.rotation.y,
        -FLEET_VAN_CAB_DOOR.openAngle,
        'driver door swings outward',
      );
      assert.equal(van.pivot.visible, true);
      close(van.pivot.scale.x, 1, 'the deployed ramp is full length');
      close(
        van.pivot.position.x,
        FLEET_VAN_RAMP.hinge[0],
        'ramp stays at the sill',
      );
      close(
        van.pivot.rotation.z,
        -Math.atan2(FLEET_VAN_RAMP.rise, FLEET_VAN_RAMP.run),
        'ramp reaches the ground',
      );

      updateArrivalVan(
        van,
        { position, heading: 0, visible: true, door: 0, ramp: 0 },
        true,
      );
      assert.ok(van.doors.every((door) => door.position.z === 0));
      close(van.cabDoor.rotation.y, 0, 'driver door closes');
      assert.equal(van.pivot.visible, false, 'stowed ramp disappears');
      updateArrivalVan(
        van,
        { position, heading: 0, visible: true, door: 0, ramp: 0 },
        false,
      );
      assert.equal(
        van.root.visible,
        false,
        'the disabled arrival layer hides the photo van',
      );
    },
  );

  await t.test(
    'fading one photo van leaves another and the parked template unchanged',
    () => {
      const first = buildArrivalVan(model, 'A', material);
      const second = buildArrivalVan(model, 'B', material);
      const firstBody = mesh(first.root, 'driver-door-panel');
      const secondBody = mesh(second.root, 'driver-door-panel');
      const sourceBody = mesh(template, 'driver-door-panel');
      assert.equal(
        firstBody.geometry,
        secondBody.geometry,
        'the loaded geometry is shared',
      );
      assert.notEqual(
        firstBody.material,
        secondBody.material,
        'each van owns its fadeable material',
      );
      assert.notEqual(firstBody.material, sourceBody.material);
      const firstGlass = mesh(first.root, 'driver-door-glass');
      const secondGlass = mesh(second.root, 'driver-door-glass');
      const bodyOpacity = secondBody.material.opacity;
      const glassOpacity = secondGlass.material.opacity;
      const pose = {
        position: new T.Vector3(),
        heading: 0,
        visible: true,
        door: 0,
        ramp: 0,
      };
      updateArrivalVan(first, { ...pose, opacity: 0.25 }, true);
      close(firstBody.material.opacity, bodyOpacity * 0.25, 'body fades');
      close(
        firstGlass.material.opacity,
        glassOpacity * 0.25,
        'glazing fades proportionally',
      );
      close(
        secondBody.material.opacity,
        bodyOpacity,
        'second van body remains opaque',
      );
      close(
        secondGlass.material.opacity,
        glassOpacity,
        'second van glazing remains unchanged',
      );
      close(
        sourceBody.material.opacity,
        bodyOpacity,
        'cached livery remains unchanged',
      );
      assert.equal(firstBody.material.depthWrite, false);
      assert.equal(firstBody.castShadow, false);
      updateArrivalVan(first, { ...pose, opacity: 1 }, true);
      close(firstBody.material.opacity, bodyOpacity, 'body opacity recovers');
      close(
        firstGlass.material.opacity,
        glassOpacity,
        'glazing opacity recovers',
      );
      assert.equal(firstBody.material.transparent, false);
      assert.equal(firstBody.material.depthWrite, true);
      assert.equal(firstBody.castShadow, true);
      assert.equal(
        firstGlass.material.transparent,
        true,
        'recovered glazing remains see-through',
      );
      assert.equal(firstGlass.material.depthWrite, false);
    },
  );
});
