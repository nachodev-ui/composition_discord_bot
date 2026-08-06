import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SignupSlotOccupiedError } from '../src/domain/errors.js';
import { SignupStateStore } from '../src/services/signupStateStore.js';

test('persiste un puesto y libera el puesto anterior del mismo usuario', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'composition-bot-'));
  context.after(async () => rm(directory, { recursive: true, force: true }));
  const statePath = join(directory, 'signup-state.json');
  const store = new SignupStateStore(statePath);
  await store.load();

  await store.claimSlot({
    buildNumber: 5,
    userId: '123456789012345678',
    roleId: '223456789012345678',
    assignedAt: '2026-08-06T00:00:00.000Z',
  });
  const secondClaim = await store.claimSlot({
    buildNumber: 8,
    userId: '123456789012345678',
    roleId: '323456789012345678',
    assignedAt: '2026-08-06T00:01:00.000Z',
  });

  assert.equal(secondClaim.previousBuildNumber, 5);
  assert.equal(store.getAssignmentByBuild(5), undefined);
  assert.equal(store.getAssignmentByBuild(8)?.userId, '123456789012345678');

  const persisted = JSON.parse(await readFile(statePath, 'utf8')) as {
    assignments: Record<string, { userId: string }>;
  };
  assert.equal(persisted.assignments['8']?.userId, '123456789012345678');
});

test('impide que dos usuarios ocupen el mismo número', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'composition-bot-'));
  context.after(async () => rm(directory, { recursive: true, force: true }));
  const store = new SignupStateStore(join(directory, 'signup-state.json'));
  await store.load();

  await store.claimSlot({
    buildNumber: 22,
    userId: '123456789012345678',
    roleId: '223456789012345678',
  });

  await assert.rejects(
    store.claimSlot({
      buildNumber: 22,
      userId: '323456789012345678',
      roleId: '223456789012345678',
    }),
    SignupSlotOccupiedError,
  );
});
