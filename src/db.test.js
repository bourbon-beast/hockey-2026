import test from 'node:test';
import assert from 'node:assert';
import { getNextConfirmedState } from './utils.js';

// Define the logic that we want to test for toggleSelectionConfirmed
// without depending on the actual Firebase imports
export async function testableToggleSelectionConfirmed(
  roundId, teamId, playerId,
  { getDocs, collection, updateDoc, db }
) {
  const selsSnap = await getDocs(collection(db, 'rounds', String(roundId), 'selections'))
  const target = selsSnap.docs.find(d => {
    const data = d.data()
    return data.teamId === teamId && String(data.playerId) === String(playerId)
  })
  if (target) {
    const current = target.data().confirmed || 0
    const next = getNextConfirmedState(current)
    await updateDoc(target.ref, { confirmed: next })
    return next
  }
  return 0
}

test('getNextConfirmedState cycles correctly', () => {
  assert.strictEqual(getNextConfirmedState(0), 1, '0 should cycle to 1');
  assert.strictEqual(getNextConfirmedState(1), 2, '1 should cycle to 2');
  assert.strictEqual(getNextConfirmedState(2), 3, '2 should cycle to 3');
  assert.strictEqual(getNextConfirmedState(3), 0, '3 should cycle to 0');
});

test('testableToggleSelectionConfirmed should cycle state for a found player', async () => {
  // Mocks
  const mockDb = {};
  const mockRef = {};
  const mockDocs = [
    {
      ref: mockRef,
      data: () => ({ teamId: 'team1', playerId: 'player1', confirmed: 1 })
    },
    {
      ref: {},
      data: () => ({ teamId: 'team1', playerId: 'player2', confirmed: 0 })
    }
  ];

  const getDocs = async () => ({ docs: mockDocs });
  const collection = () => ({});
  let updatedData = null;
  const updateDoc = async (ref, data) => {
    if (ref === mockRef) updatedData = data;
  };

  const result = await testableToggleSelectionConfirmed('round1', 'team1', 'player1', {
    getDocs, collection, updateDoc, db: mockDb
  });

  assert.strictEqual(result, 2, 'Result should be 2 (cycled from 1)');
  assert.deepStrictEqual(updatedData, { confirmed: 2 }, 'updateDoc should be called with next state');
});

test('testableToggleSelectionConfirmed should handle not found player', async () => {
  const mockDb = {};
  const mockDocs = [
    {
      ref: {},
      data: () => ({ teamId: 'team1', playerId: 'player2', confirmed: 0 })
    }
  ];

  const getDocs = async () => ({ docs: mockDocs });
  const collection = () => ({});
  let updateCalled = false;
  const updateDoc = async () => { updateCalled = true; };

  const result = await testableToggleSelectionConfirmed('round1', 'team1', 'player1', {
    getDocs, collection, updateDoc, db: mockDb
  });

  assert.strictEqual(result, 0, 'Result should be 0 when player not found');
  assert.strictEqual(updateCalled, false, 'updateDoc should not be called when player not found');
});
