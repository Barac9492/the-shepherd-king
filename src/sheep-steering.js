import { ArriveBehavior, SeparationBehavior, Vector3, Vehicle } from '../vendor/gameplay/yuka.module.js';

const MAX_SUBSTEP = 0.05;
const ARRIVAL_TOLERANCE = 0.12;
const NEIGHBOR_RADIUS_SQ = 3.5 * 3.5;
const POSITION_EPSILON_SQ = 0.35 * 0.35;

const finite2 = value => Number.isFinite(value?.x) && Number.isFinite(value?.z);
// Preserve ordinary/assisted simulation deltas, but bound catch-up work after a stall.
const finiteDt = value => Number.isFinite(value) && value > 0 ? Math.min(value, 1) : 0;
const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

function stateIsOrdinary(state) {
  return Boolean(state?.a) && !state.lamb && !state.noFollow;
}

function stateIsEligible(record) {
  const { state, actor } = record;
  return state.st === 'follow'
    && state.st !== 'carried'
    && !state.lamb
    && !state.noFollow
    && actor.ground !== false
    && actor.onArrive == null
    && finite2(actor.pos)
    && finite2(actor.dest)
    && Number.isFinite(actor.walkSpeed)
    && actor.walkSpeed > 0;
}

function resetVehicle(record, synchronizePosition = true) {
  const { actor, vehicle } = record;
  if (synchronizePosition && finite2(actor.pos)) vehicle.position.set(actor.pos.x, 0, actor.pos.z);
  vehicle.velocity.set(0, 0, 0);
  vehicle.neighbors.length = 0;
}

function restoreActorUpdate(record) {
  const { actor, wrappedUpdate, originalUpdate, hadOwnUpdate } = record;
  if (actor.update !== wrappedUpdate) return;
  if (hadOwnUpdate) actor.update = originalUpdate;
  else delete actor.update;
}

/**
 * Adds local Arrive + Separation steering to ordinary Chapter 1 follower sheep.
 * Chapter logic still owns state changes, destinations, fold counting, and speed requests.
 */
export function createChapterOneSheepSteering(game, sheepStates = game.ch?.s?.sheep || []) {
  const records = [];
  const diagnostics = {
    engine: 'yuka-arrive-separation',
    eligibleFrames: 0,
    nativeFrames: 0,
    resets: 0,
    invalidFrames: 0,
    disposed: false,
  };

  for (const state of sheepStates) {
    if (!stateIsOrdinary(state)) continue;
    const actor = state.a;
    const vehicle = new Vehicle();
    vehicle.position.set(actor.pos.x, 0, actor.pos.z);
    vehicle.velocity.set(0, 0, 0);
    vehicle.maxSpeed = 0;
    vehicle.maxForce = 4;
    vehicle.updateOrientation = false;

    const target = new Vector3(actor.pos.x, 0, actor.pos.z);
    const arrive = new ArriveBehavior(target, 0.32, ARRIVAL_TOLERANCE);
    const separation = new SeparationBehavior();
    separation.weight = 0.72;
    vehicle.steering.add(arrive).add(separation);

    records.push({
      state,
      actor,
      vehicle,
      target,
      arrive,
      separation,
      hadOwnUpdate: Object.prototype.hasOwnProperty.call(actor, 'update'),
      originalUpdate: actor.update,
      wrappedUpdate: null,
    });
  }

  function useNative(record, dt) {
    diagnostics.nativeFrames++;
    resetVehicle(record);
    diagnostics.resets++;
    if (!finite2(record.actor.pos)) {
      diagnostics.invalidFrames++;
      return;
    }
    record.originalUpdate.call(record.actor, dt);
    resetVehicle(record);
  }

  function collectNeighbors(record) {
    const neighbors = record.vehicle.neighbors;
    neighbors.length = 0;
    for (const other of records) {
      if (other === record) continue;
      if (!stateIsEligible(other)) {
        resetVehicle(other);
        continue;
      }
      if (!finite2(other.vehicle.position)
        || (other.vehicle.position.x - other.actor.pos.x) ** 2 + (other.vehicle.position.z - other.actor.pos.z) ** 2 > POSITION_EPSILON_SQ) {
        resetVehicle(other);
      }
      const dx = other.vehicle.position.x - record.vehicle.position.x;
      const dz = other.vehicle.position.z - record.vehicle.position.z;
      if (dx * dx + dz * dz < NEIGHBOR_RADIUS_SQ) neighbors.push(other.vehicle);
    }
  }

  for (const record of records) {
    const { actor, vehicle, target } = record;
    const wrappedUpdate = function chapterOneSheepUpdate(dt) {
      const elapsed = finiteDt(dt);
      if (!stateIsEligible(record)) {
        useNative(record, elapsed);
        return;
      }

      diagnostics.eligibleFrames++;
      if (!finite2(vehicle.position)
        || !finite2(vehicle.velocity)
        || (vehicle.position.x - actor.pos.x) ** 2 + (vehicle.position.z - actor.pos.z) ** 2 > POSITION_EPSILON_SQ) {
        resetVehicle(record);
        diagnostics.resets++;
      }

      const requestedSpeed = actor.walkSpeed;
      const startX = actor.pos.x;
      const startZ = actor.pos.z;
      target.set(actor.dest.x, 0, actor.dest.z);
      vehicle.maxSpeed = requestedSpeed;
      vehicle.maxForce = Math.max(4, requestedSpeed * 9);
      collectNeighbors(record);

      if (elapsed > 0) {
        const steps = Math.max(1, Math.ceil(elapsed / MAX_SUBSTEP));
        const step = elapsed / steps;
        for (let i = 0; i < steps; i++) vehicle.update(step);
      }

      if (!finite2(vehicle.position) || !finite2(vehicle.velocity)) {
        diagnostics.invalidFrames++;
        vehicle.position.set(startX, 0, startZ);
        resetVehicle(record, false);
      }

      let dx = vehicle.position.x - startX;
      let dz = vehicle.position.z - startZ;
      let distance = Math.hypot(dx, dz);
      const maxDistance = requestedSpeed * elapsed;
      if (distance > maxDistance && distance > 0) {
        const scale = maxDistance / distance;
        dx *= scale;
        dz *= scale;
        distance = maxDistance;
        vehicle.position.set(startX + dx, 0, startZ + dz);
        if (elapsed > 0) vehicle.velocity.set(dx / elapsed, 0, dz / elapsed);
        else vehicle.velocity.set(0, 0, 0);
      }

      actor.pos.x = startX + dx;
      actor.pos.z = startZ + dz;
      actor.pos.y = game.groundAt(actor.pos.x, actor.pos.z);
      actor.speed = elapsed > 0 ? Math.min(requestedSpeed, distance / elapsed) : 0;
      if (!Number.isFinite(actor.speed)) actor.speed = 0;

      if (vehicle.velocity.x * vehicle.velocity.x + vehicle.velocity.z * vehicle.velocity.z > 1e-8) {
        const desiredYaw = Math.atan2(vehicle.velocity.x, vehicle.velocity.z);
        actor.yaw += wrapAngle(desiredYaw - actor.yaw) * (1 - Math.exp(-8 * elapsed));
      }

      if (actor.dest && Math.hypot(actor.dest.x - actor.pos.x, actor.dest.z - actor.pos.z) < ARRIVAL_TOLERANCE) {
        actor.dest = null;
        resetVehicle(record);
        diagnostics.resets++;
      }

      actor.sync();
      actor.m.update(elapsed, actor.speed * actor.animScale);
    };
    record.wrappedUpdate = wrappedUpdate;
    actor.update = wrappedUpdate;
  }

  return {
    engine: diagnostics.engine,
    records,
    vehicles: records.map(record => record.vehicle),
    diagnostics,
    limitations: 'Local Arrive and Separation only; native Chapter 1 state, destinations, fold logic, and scripted movement remain authoritative.',
    reset() {
      for (const record of records) resetVehicle(record);
      diagnostics.resets += records.length;
    },
    finite() {
      return records.every(({ actor, vehicle }) => finite2(actor.pos) && finite2(vehicle.position) && finite2(vehicle.velocity));
    },
    dispose() {
      if (diagnostics.disposed) return;
      diagnostics.disposed = true;
      for (const record of records) {
        restoreActorUpdate(record);
        resetVehicle(record, false);
        record.vehicle.steering.clear();
      }
    },
  };
}

export const createSheepSteering = createChapterOneSheepSteering;
