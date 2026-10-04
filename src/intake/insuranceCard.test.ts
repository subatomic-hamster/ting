import { describe, expect, it } from 'vitest';
import { GROUP_PLANS, parseInsuranceCard, plansForGroup } from './insuranceCard';

describe('insurance card', () => {
  it('pulls group, member and carrier from OCR text', () => {
    const text = 'LINCOLN Dental\nMember Name: Pat Smith\nMember ID: W123456789\nGroup Number: 00412345\nPlan: DentalConnect';
    expect(parseInsuranceCard(text)).toEqual({ groupNumber: '00412345', memberId: 'W123456789', carrier: 'Lincoln Financial' });
  });

  it('accepts short labels and OCR letter-for-digit slips in the group number', () => {
    expect(parseInsuranceCard('Grp # OO412345\nSubscriber: X9981234')).toMatchObject({ groupNumber: '00412345', memberId: 'X9981234' });
    expect(parseInsuranceCard('GROUP 004I2345')).toMatchObject({ groupNumber: '00412345' });
  });

  it('returns nothing it cannot find', () => {
    expect(parseInsuranceCard('Member Name: Pat')).toEqual({});
  });

  it('maps the demo group to its plans', () => {
    expect(GROUP_PLANS['00412345']).toEqual(['acme-low', 'acme-high']);
    expect(plansForGroup('00412345')).toEqual(['acme-low', 'acme-high']);
    expect(plansForGroup('99999999')).toEqual([]);
    expect(plansForGroup('constructor')).toEqual([]);
  });
});
