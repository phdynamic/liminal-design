import test from 'node:test';
import assert from 'node:assert/strict';
import { createGate } from '../js/ui.js';

test('the gate allows one action, then blocks rapid repeats until the window passes', () => {
  let t = 1000;
  const gate = createGate(350, () => t);
  assert.equal(gate.allow(), true);
  t += 100;
  assert.equal(gate.allow(), false);
  t += 100;
  assert.equal(gate.allow(), false);
  t += 200;
  assert.equal(gate.allow(), true);
});

test('choosing a different message resets the gate so the next action is allowed', () => {
  let t = 0;
  const gate = createGate(350, () => t);
  assert.equal(gate.allow(), true);
  t += 50;
  gate.reset();
  assert.equal(gate.allow(), true);
});

test('a blocked attempt does not extend the window', () => {
  let t = 0;
  const gate = createGate(350, () => t);
  gate.allow();
  t += 300;
  assert.equal(gate.allow(), false);
  t += 60;
  assert.equal(gate.allow(), true);
});
