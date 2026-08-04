/**
 * isGameProduct applied to Carturesti — the filter that decides what a store row keeps.
 *
 * scrapeCarturesti used to carry its own filter, inside page.evaluate():
 *
 *     if (!title.toLowerCase().includes('pokemon tcg')) continue;
 *
 * Carturesti has four store rows — pokemon, digimon, dragon_ball_super and
 * riftbound (migrations 012 and 028) — and three of them could not return a
 * single product at any URL, because that literal does not appear in their
 * titles. Migration 034 declined to add a Carturesti Magic row for exactly this
 * reason: the page loads fine and the scraper still returned nothing.
 *
 * Every title below is REAL, captured from carturesti.ro on 2026-08-04 by running
 * the actual scrapeCarturesti against the live search pages — not written by hand
 * to suit the assertions. Carturesti sells mugs, figurines, posters and cookbooks
 * under the same search terms as the cards, which is what makes this shop a
 * genuine test of the filter rather than a formality.
 */
import { describe, it, expect } from 'vitest';
import { isGameProduct } from './scraper.js';

/** The literal that used to live inside page.evaluate(), kept to prove the regression. */
const oldHardcodedFilter = (title) => title.toLowerCase().includes('pokemon tcg');

const keep = (game, titles) => titles.filter((t) => isGameProduct(game, t));

// carturesti.ro/product/search/magic%20the%20gathering — 30 cards, verbatim.
const MAGIC_SEARCH = [
  'Magic: The Gathering',
  'Halba - Magic the Gathering',
  'Cana - Magic the Gathering - Planeswalker',
  'Figurina - Magic The Gathering - Fblthp',
  'Halba - Magic the Gathering - Planeswalker',
  'Pahar - Magic: The Gathering',
  'Figurina - Magic The Gathering - Ashiok',
  'Set cadou - Magic The Gathering',
  'Magic: The Gathering: The Official Cookbook',
  'Cana - Magic the Gathering - Retro Packs',
  'Carnet A5 - Magic the Gathering - Planeswalker',
  'Poster - Magic the gathering - Nicol Bolas',
  'Magic The Gathering The Visual Guide',
  'The Official Magic: The Gathering Coloring Book',
  'Figurina - Magic The Gathering - Oko The Trickster',
  "Figurina - Magic the Gathering - Avacyn's Moonsilver Spear",
  'Figurina - Pop! Games - Magic the Gathering: Urza',
  'Figurina - Pop! Games - Magic the Gathering: Yawgmoth',
  'Set 2 suporturi de birou - Magic the gathering',
  'Poster - Magic the Gathering - March of the Machine',
  'Obiect decorativ - Magic the Gathering - Pristine Talisman',
  'Magic: The Gathering - War of the Spark: Forsaken 2',
  'Figurina de colectie - Magic the Gathering - Cruelty of Gix',
  'Magic the Gathering TCG - Outlaws of Thunder Junction Play Booster - 14 carti',
  'Magic the Gathering TCG - The Brothers War Jumpstart Booster - 20 de carti',
  'Magic the Gathering TCG - March of the Machine Jumpstart Booster - 20 de carti',
  'Magic the Gathering TCG - Murders at Karlov Manor Play Booster - 14 carti',
  "Magic the Gathering TCG - March of the Machine: The Aftermath Collector's - 6 carti",
  "Destroy All Humans - They Can't Be Regenerated - Volume 2",
  "Destroy All Humans. They Can't Be Regenerated. A Magic - Volume 7",
];

// carturesti.ro/product/search/digimon — 16 cards, verbatim.
const DIGIMON_SEARCH = [
  'Cana - Digimon - Departure',
  'Figurina - Digimon - Gomamon',
  'Figurina - Digimon - Patamon',
  'Set 6 insigne - Digimon - Tai & Matt',
  "Set Playmat & Sleeves - Digimon TCG - Tamer's Set 3",
  "Set Playmat & Sleeves - Digimon TCG - Tamer's Set 2",
  'Digimon Adventure Tri: The Movie - Chapter 5: Coexistence',
  'Digimon Adventure Tri: The Movie - Part 1: Reunion',
  'Digimon Adventure Tri: The Movie - Chapter 4: Loss',
  'Digimon Adventure Tri: The Movie - Chapter 2: Determination',
  'Digimon Adventure Tri: The Movie - Chapter 3: Confession',
  'Joc de carti - Digimon Card Game: Hackers’ Slumber Booster (BT-23)',
  'Anime Hits  - Coloured Vinyl',
  'World Piece, Vol. 3',
  'World Piece, Vol. 4',
  'Anime Hits - Blue Vinyl',
];

// carturesti.ro/product/search/tcg — the live Pokemon row's own URL. A sample of
// the 30 it returns; not one of them is a Pokemon product.
const TCG_SEARCH = [
  'Final Fantasy XIV TCG - Starter Set',
  "Set Playmat & Sleeves - Digimon TCG - Tamer's Set 3",
  'Star Wars Unlimited TCG - Legends of the Force',
  'Yu-Gi-Oh TCG: Phantom Nightmare Booster Pack',
  'Binder TCG - 9-Pocket Exo-Tec - Vault X (Black)',
  'Carti de joc - Genshin Impact TCG Series 1',
  'Magic the Gathering TCG - Outlaws of Thunder Junction Play Booster - 14 carti',
  'Magic the Gathering TCG - March of the Machine Jumpstart Booster - 20 de carti',
];

describe('isGameProduct — the case that regressed', () => {
  it('keeps the 5 real Magic TCG products on the Magic search', () => {
    expect(keep('magic', MAGIC_SEARCH)).toEqual([
      'Magic the Gathering TCG - Outlaws of Thunder Junction Play Booster - 14 carti',
      'Magic the Gathering TCG - The Brothers War Jumpstart Booster - 20 de carti',
      'Magic the Gathering TCG - March of the Machine Jumpstart Booster - 20 de carti',
      'Magic the Gathering TCG - Murders at Karlov Manor Play Booster - 14 carti',
      "Magic the Gathering TCG - March of the Machine: The Aftermath Collector's - 6 carti",
    ]);
  });

  it('yields 0 for a game the page does not sell — magic page under game=pokemon', () => {
    expect(keep('pokemon', MAGIC_SEARCH)).toEqual([]);
  });

  it('is what the removed hardcoded literal could never do', () => {
    // The old filter ran first, inside the browser, so this was the whole input
    // to everything downstream: nothing, for every game but Pokemon.
    expect(MAGIC_SEARCH.filter(oldHardcodedFilter)).toEqual([]);
    expect(DIGIMON_SEARCH.filter(oldHardcodedFilter)).toEqual([]);
    expect(keep('magic', MAGIC_SEARCH).length).toBeGreaterThan(0);
    expect(keep('digimon', DIGIMON_SEARCH).length).toBeGreaterThan(0);
  });

  it('keeps the single real card product on the Digimon search', () => {
    expect(keep('digimon', DIGIMON_SEARCH)).toEqual([
      'Joc de carti - Digimon Card Game: Hackers’ Slumber Booster (BT-23)',
    ]);
  });
});

describe('isGameProduct — the inverse failure, a filter too loose', () => {
  it('drops merch that names the game: mugs, figurines, posters, cookbooks', () => {
    for (const title of [
      'Cana - Magic the Gathering - Planeswalker',
      'Figurina - Magic The Gathering - Fblthp',
      'Poster - Magic the gathering - Nicol Bolas',
      'Magic: The Gathering: The Official Cookbook',
      'Halba - Magic the Gathering',
    ]) {
      expect(isGameProduct('magic', title)).toBe(false);
    }
  });

  it('drops playmats and sleeves, which name both the game and "TCG"', () => {
    expect(isGameProduct('digimon', "Set Playmat & Sleeves - Digimon TCG - Tamer's Set 3")).toBe(false);
  });

  it('does not let other games through on a shared "tcg" search', () => {
    // This is what pollutes a per-store count if the filter is loosened: the
    // Pokemon row's URL is a bare "tcg" search returning seven other franchises.
    expect(keep('magic', TCG_SEARCH)).toEqual([
      'Magic the Gathering TCG - Outlaws of Thunder Junction Play Booster - 14 carti',
      'Magic the Gathering TCG - March of the Machine Jumpstart Booster - 20 de carti',
    ]);
    expect(keep('yugioh', TCG_SEARCH)).toEqual(['Yu-Gi-Oh TCG: Phantom Nightmare Booster Pack']);
  });

  it('returns nothing for the Pokemon row, because that search returns no Pokemon', () => {
    // Not an assertion about the filter so much as a record of live state on
    // 2026-08-04: /product/search/tcg surfaces binders and other franchises, and
    // the row has been yielding 0 products under the old code and the new alike.
    expect(keep('pokemon', TCG_SEARCH)).toEqual([]);
  });
});
