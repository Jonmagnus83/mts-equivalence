import { describe, expect, it } from 'vitest';
import { parseParticipantCode, participantLink, PUBLIC_SITE } from '../src/codes';

describe('participant links', () => {
  it('builds the public hash link and reads the code back', () => {
    const link = participantLink('abcd2345');
    expect(link.startsWith(`${PUBLIC_SITE}#/delta?k=`)).toBe(true);
    const hash = link.slice(link.indexOf('#'));
    expect(parseParticipantCode(hash)).toBe('ABCD2345');
  });

  it('accepts the hash query, a search query, and the older code path', () => {
    expect(parseParticipantCode('#/delta?k=ab-cd2345')).toBe('ABCD2345');
    expect(parseParticipantCode('#/delta', '?k=ZXCV2345')).toBe('ZXCV2345');
    expect(parseParticipantCode('#/kode/QWER5678')).toBe('QWER5678');
    expect(parseParticipantCode('#/oppsett')).toBe('');
  });
});
