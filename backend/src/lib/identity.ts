// Employer identity → Lincoln member. In production this is the carrier's eligibility table; the demo maps
// Acme Corp's employee IDs to the demo personas.
import { isPersonaId, PERSONAS, type PersonaId } from '../../../src/data/personas';

export type Group = 'member' | 'employer_admin' | 'lincoln_analyst';

/** Employer ID → Lincoln group policy number (so the right plan loads with no typing). */
export const GROUP_POLICIES: Record<string, string> = { ACME: '00412345' };

/** Acme employee ID → demo member. */
export const EMPLOYEES: Record<string, PersonaId> = { E1001: 'dale', E1002: 'jordan', E1003: 'priya' };

export function memberFor(employerId?: string, employeeId?: string, role?: string): {
  group: Group;
  personaId?: PersonaId;
  memberId?: string;
  groupPolicy?: string;
} {
  const groupPolicy = employerId ? GROUP_POLICIES[employerId] : undefined;
  const group: Group = role === 'employer_admin' || role === 'lincoln_analyst' ? role : 'member';
  // Admins and analysts get no member record: they see aggregates and rules, never anyone's dental data.
  if (group !== 'member' || !groupPolicy) return { group, groupPolicy };
  const personaId = employeeId ? EMPLOYEES[employeeId] : undefined;
  return { group, groupPolicy, personaId, memberId: personaId && isPersonaId(personaId) ? PERSONAS[personaId].memberId : undefined };
}
