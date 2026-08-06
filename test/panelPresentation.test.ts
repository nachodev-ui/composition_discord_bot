import assert from 'node:assert/strict';
import test from 'node:test';
import { createRolePanel } from '../src/discord/panelPresentation.js';
import type { SignupState } from '../src/domain/signupState.js';
import type { BuildCatalog } from '../src/services/buildCatalog.js';

const catalog = {
  all: [
    {
      number: 22,
      discordRole: { name: 'Canción' },
    },
  ],
} as unknown as BuildCatalog;

const state: SignupState = {
  version: 1,
  panelMessageId: null,
  assignments: {
    '22': {
      buildNumber: 22,
      userId: '123456789012345678',
      roleId: '223456789012345678',
      assignedAt: '2026-08-06T00:00:00.000Z',
    },
  },
};

test('muestra la mención al lado del número y nombre del puesto', () => {
  const embed = createRolePanel(catalog, state, '323456789012345678').toJSON();

  assert.match(embed.description ?? '', /22 — Canción/);
  assert.match(embed.description ?? '', /<@123456789012345678>/);
});
