import { describe, expect, it } from 'vitest';
import { decideInbound, forwardingAddress } from './inbox';

const ok = { spf: true, dkim: true, dmarc: true };
const mail = (from: string, auth = ok) => ({ from, subject: 'Your bill', text: 'Amount due $412.00', auth });

describe('forwarding address', () => {
  it('is stable per member, different across members, and rotates with the salt', () => {
    expect(forwardingAddress('M-1')).toBe(forwardingAddress('M-1'));
    expect(forwardingAddress('M-1')).not.toBe(forwardingAddress('M-2'));
    expect(forwardingAddress('M-1', 'v2')).not.toBe(forwardingAddress('M-1'));
    expect(forwardingAddress('M-1')).toMatch(/^u-[a-z0-9]+@in\.ting\.app$/);
  });
});

describe('decideInbound', () => {
  it('rejects mail that fails authentication', () =>
    expect(decideInbound(mail('billing@smile.example', { ...ok, dkim: false }), undefined, ['billing@smile.example']).action).toBe('reject'));
  it('holds an unknown sender and asks the member', () =>
    expect(decideInbound(mail('billing@smile.example'), 'dale@acme.example', [])).toEqual({
      action: 'hold',
      reason: 'We got an email from billing@smile.example. Add it to your account?',
    }));
  it('accepts the member and approved dentists', () => {
    expect(decideInbound(mail('Dale@Acme.example'), 'dale@acme.example', []).action).toBe('accept');
    expect(decideInbound(mail('billing@smile.example'), undefined, ['BILLING@smile.example']).action).toBe('accept');
  });
});
