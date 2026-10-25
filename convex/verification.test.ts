/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');
const alice = { subject: 'alice', tokenIdentifier: 'test:alice', email: 'alice@university.edu', emailVerified: true };
const args = { firstName: 'Alex', lastName: 'Example', dateOfBirth: '2000-01-01', acknowledged: true };

beforeEach(() => {
  vi.stubEnv('ENABLE_DEMO_VERIFICATION', 'true');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('temporary demo declaration', () => {
  test('saves only the signed-in owner, with a distinct method and no DOB', async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(alice);
    await owner.mutation(api.verification.recordDemo, args);
    const account = await owner.query(api.accounts.getMine);
    expect(account?.ageCheckPassed).toBe(true);
    expect(account?.verificationMethod).toBe('demo_self_attested');
    expect(account?.nextStep).toBe('profile');
    await owner.mutation(api.accounts.saveProfile, { firstName: 'Alex', lastName: 'Example', preferredFirstName: '', localArea: 'Santa Cruz' });
    await owner.mutation(api.accounts.savePreferences, { diet: 'No preference', allergies: [], allergiesAnswered: true, religiousDetails: '' });
    await owner.mutation(api.accounts.acceptAgreements, { community: true, terms: true, privacy: true, marketing: false });
    expect((await owner.query(api.accounts.getMine))?.questionnaireComplete).toBe(true);
    const rows = await t.run(ctx => ctx.db.query('ageChecks').take(2));
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenIdentifier).toBe(alice.tokenIdentifier);
    expect(rows[0].nameCheckVersion).toBe('demo-self-attested-v1');
    expect(JSON.stringify(rows)).not.toContain(args.dateOfBirth);
    const other = t.withIdentity({ ...alice, subject: 'bob', tokenIdentifier: 'test:bob', email: 'bob@university.edu' });
    expect((await other.query(api.accounts.getMine))?.ageCheckPassed).toBe(false);
  });

  test('requires a verified university identity', async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.verification.recordDemo, args)).rejects.toThrow('sign in');
    for (const identity of [{ ...alice, emailVerified: false }, { ...alice, email: 'alice@example.com' }]) {
      await expect(t.withIdentity(identity).mutation(api.verification.recordDemo, args)).rejects.toThrow('verified university');
    }
  });

  test('rejects invalid, future and underage dates, and missing consent or names', async () => {
    const owner = convexTest(schema, modules).withIdentity(alice);
    for (const dateOfBirth of ['2020-01-01', '2030-01-01', '2000-02-30', 'not-a-date', '2008-10-25']) {
      await expect(owner.mutation(api.verification.recordDemo, { ...args, dateOfBirth })).rejects.toThrow();
    }
    await expect(owner.mutation(api.verification.recordDemo, { ...args, firstName: ' ' })).rejects.toThrow('Legal names');
    await expect(owner.mutation(api.verification.recordDemo, { ...args, acknowledged: false })).rejects.toThrow('Acknowledge');
    await owner.mutation(api.verification.recordDemo, { ...args, dateOfBirth: '2008-10-24' });
  });

  test('off switch rejects new declarations and stops accepting saved demo results', async () => {
    const owner = convexTest(schema, modules).withIdentity(alice);
    await owner.mutation(api.verification.recordDemo, args);
    vi.stubEnv('ENABLE_DEMO_VERIFICATION', 'false');
    expect((await owner.query(api.verification.getOptions)).demoEnabled).toBe(false);
    await expect(owner.mutation(api.verification.recordDemo, args)).rejects.toThrow('disabled');
    expect((await owner.query(api.accounts.getMine))?.ageCheckPassed).toBe(false);
    await expect(owner.mutation(api.accounts.saveProfile, { firstName: 'Alex', lastName: 'Example', preferredFirstName: '', localArea: 'Santa Cruz' })).rejects.toThrow('before continuing');
  });

  test('cannot replace an existing profile name', async () => {
    const t = convexTest(schema, modules);
    await t.run(ctx => ctx.db.insert('profiles', { tokenIdentifier: alice.tokenIdentifier, displayName: 'Original', firstName: 'Original', lastName: 'Person', createdAt: 1, updatedAt: 1 }));
    await expect(t.withIdentity(alice).mutation(api.verification.recordDemo, args)).rejects.toThrow('saved account name');
  });

  test('the protected Gemini result still works with demo disabled and is never downgraded', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.verification.recordPassed, { tokenIdentifier: alice.tokenIdentifier, email: alice.email, legalFirstName: 'Alex', legalLastName: 'Example' });
    const owner = t.withIdentity(alice);
    await owner.mutation(api.verification.recordDemo, args);
    expect((await owner.query(api.accounts.getMine))?.verificationMethod).toBe('prototype_dob');
    vi.stubEnv('ENABLE_DEMO_VERIFICATION', 'false');
    expect((await owner.query(api.accounts.getMine))?.ageCheckPassed).toBe(true);
  });
});
