import { describe, expect, it } from 'vitest';
import { memberFor } from './identity';

describe('memberFor', () => {
  it('maps an Acme employee to their Lincoln member record', () =>
    expect(memberFor('ACME', 'E1001', 'member')).toMatchObject({ group: 'member', personaId: 'dale', groupPolicy: '00412345' }));
  it('gives admins and analysts no member record', () => {
    expect(memberFor('ACME', 'E1001', 'employer_admin')).toEqual({ group: 'employer_admin', groupPolicy: '00412345' });
    expect(memberFor('ACME', undefined, 'lincoln_analyst')).toEqual({ group: 'lincoln_analyst', groupPolicy: '00412345' });
  });
  it('does not invent a member for an unknown employer or employee', () => {
    expect(memberFor('OTHER', 'E1001', 'member').personaId).toBeUndefined();
    expect(memberFor('ACME', 'E9999', 'member').personaId).toBeUndefined();
  });
});
