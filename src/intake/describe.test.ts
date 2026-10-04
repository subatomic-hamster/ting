import { describe, expect, it } from 'vitest';
import { parseDescription } from './describe';

const top = (text: string) => parseDescription(text).map((i) => i.candidates[0].cdt);

describe('parseDescription', () => {
  it('spec example: crown on a lower back molar and a deep cleaning', () => {
    const [crown, deep] = parseDescription('Crown on a lower back molar and a deep cleaning');
    expect(crown.candidates[0]).toMatchObject({ cdt: 'D2740' });
    expect(crown.teeth).toEqual([{ tooth: 19, p: 0.5 }, { tooth: 30, p: 0.5 }]);
    expect(deep.candidates.map((c) => c.cdt)).toEqual(['D4341', 'D4342']);
    expect(deep.teeth).toEqual([]);
    expect(deep.confidence).toBe(deep.candidates[0].p); // no tooth needed
    expect(crown.confidence).toBe(0.4); // 0.8 x 0.5
  });

  it('spec example: "replacing the old one" sets a replacement probability of about 0.65', () => {
    const items = parseDescription("crown on a back tooth, I think it's replacing the old one", 'voice');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source: 'voice', replacement: 0.65 });
    expect(items[0].candidates[0].cdt).toBe('D2740');
    expect(items[0].teeth.map((t) => t.tooth).sort((a, b) => a - b)).toEqual([3, 14, 19, 30]);
    expect(parseDescription('replace my crown on #30')[0].replacement).toBe(0.65);
    expect(parseDescription('a crown on #30')[0].replacement).toBeUndefined();
  });

  it('sides and arches pick the tooth', () => {
    expect(parseDescription('crown on my lower left back molar')[0].teeth).toEqual([{ tooth: 19, p: 0.9 }]);
    expect(parseDescription('crown on lower right molar')[0].teeth[0].tooth).toBe(30);
    expect(parseDescription('filling on an upper left molar')[0].teeth[0].tooth).toBe(14);
    expect(parseDescription('filling on an upper right molar')[0].teeth[0].tooth).toBe(3);
    expect(parseDescription('crown on a front tooth')[0].teeth.map((t) => t.tooth).sort((a, b) => a - b)).toEqual([8, 9, 24, 25]);
  });

  it('explicit teeth are certain, and each named tooth is its own item', () => {
    expect(parseDescription('crown on tooth 19')[0].teeth).toEqual([{ tooth: 19, p: 0.98 }]);
    const two = parseDescription('crowns on #19 and #30');
    expect(two.map((i) => i.teeth[0].tooth)).toEqual([19, 30]);
    expect(new Set(two.map((i) => i.id)).size).toBe(2);
  });

  it('crown materials', () => {
    expect(top('porcelain fused to metal crown')).toEqual(['D2750']);
    expect(top('PFM crown')).toEqual(['D2750']);
    expect(top('gold crown')).toEqual(['D2790']);
    expect(top('a crown')).toEqual(['D2740']);
  });

  it('root canal code follows the tooth type', () => {
    expect(top('root canal on #19')).toEqual(['D3330']);
    expect(top('root canal on #12')).toEqual(['D3320']);
    expect(top('root canal on #8')).toEqual(['D3310']);
    expect(top('root canal on a lower back molar')).toEqual(['D3330']);
  });

  it('one-off procedures', () => {
    expect(top('buildup')).toEqual(['D2950']);
    expect(top('a regular cleaning')).toEqual(['D1110']);
    expect(top('scaling and root planing')).toEqual(['D4341']);
    expect(top('wisdom tooth removal')).toEqual(['D7240']);
    expect(top('extraction of #3')).toEqual(['D7140']);
    expect(top('surgical extraction of #3')).toEqual(['D7210']);
    expect(top('an implant')).toEqual(['D6010']);
    expect(top('an implant with a crown')).toEqual(['D6010', 'D6065']);
    expect(top('implant crown')).toEqual(['D6065']);
    expect(top('a bridge')).toEqual(['D6750']);
    expect(top('night guard')).toEqual(['D9944']);
    expect(top('bitewing x-rays')).toEqual(['D0274']);
    expect(top('full mouth x-rays')).toEqual(['D0210']);
    expect(top('checkup exam')).toEqual(['D0120']);
    expect(top('sealant on #3')).toEqual(['D1351']);
    expect(top('fluoride treatment')).toEqual(['D1206']);
    expect(top('a denture')).toEqual(['D5110']);
  });

  it('fillings by surface count, material and tooth', () => {
    expect(top('filling on #30')).toEqual(['D2392']); // default 2 surfaces
    expect(top('three surface filling on #30')).toEqual(['D2393']);
    expect(top('1 surface filling on #30')).toEqual(['D2391']);
    expect(top('silver filling on #30')).toEqual(['D2150']);
    expect(top('amalgam two surface on #30')).toEqual(['D2150']);
    expect(top('filling on #8')).toEqual(['D2330']);
  });

  it('candidates are sorted and never sum past 1', () => {
    for (const text of ['crown', 'root canal', 'filling', 'x-rays', 'extraction', 'exam', 'wisdom tooth', 'three surface silver filling']) {
      const [item] = parseDescription(text);
      const ps = item.candidates.map((c) => c.p);
      expect(ps).toEqual([...ps].sort((a, b) => b - a));
      expect(ps.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1);
    }
  });

  it('a tooth named once carries over to the other procedure; unknown text gives nothing', () => {
    const items = parseDescription('root canal and a crown on #19');
    expect(items.map((i) => [i.candidates[0].cdt, i.teeth[0].tooth])).toEqual([['D3330', 19], ['D2740', 19]]);
    expect(parseDescription('hello there')).toEqual([]);
  });

  describe('counts: several of the same procedure are one visit, not separate events', () => {
    const visitOf = (text: string) => parseDescription(text).map((i) => i.visit);

    it('"2 fillings" is two fillings in one visit', () => {
      const items = parseDescription('I need 2 fillings');
      expect(items.map((i) => i.candidates[0].cdt)).toEqual(['D2392', 'D2392']);
      expect(new Set(items.map((i) => i.visit)).size).toBe(1);
      expect(items[0].visit).toBeDefined();
    });

    it('"3 wisdom teeth removed" is three different teeth in one visit', () => {
      const items = parseDescription('3 wisdom teeth removed');
      expect(items).toHaveLength(3);
      expect(new Set(items.map((i) => i.teeth[0].tooth)).size).toBe(3);
      expect(new Set(items.map((i) => i.visit)).size).toBe(1);
    });

    it('number words, "a couple of", and named teeth in one phrase', () => {
      expect(parseDescription('two crowns on my lower back molars').map((i) => i.teeth[0].tooth)).toEqual([19, 30]);
      expect(parseDescription('a couple of cavities')).toHaveLength(2);
      expect(new Set(visitOf('fillings on #3 and #14')).size).toBe(1);
      expect(visitOf('fillings on #3 and #14')[0]).toBeDefined();
    });

    it('the same clause repeated (as a translator may write it) counts like a number', () => {
      const items = parseDescription('wisdom tooth removal; wisdom tooth removal; wisdom tooth removal');
      expect(items).toHaveLength(3);
      expect(new Set(items.map((i) => i.visit)).size).toBe(1);
    });

    it('sizes, tooth numbers and different procedures are not counts', () => {
      expect(top('a 3 surface filling')).toEqual(['D2393']);
      expect(visitOf('crown on #2')).toEqual([undefined]);
      expect(visitOf('root canal and a crown on #19')).toEqual([undefined, undefined]);
      expect(visitOf('cleaning and x-rays')).toEqual([undefined, undefined]);
      expect(visitOf('implant with a crown')).toEqual([undefined, undefined]);
    });
  });

  it('needing a tooth and having none gives zero confidence', () => {
    expect(parseDescription('a crown')[0].confidence).toBe(0);
  });
});
