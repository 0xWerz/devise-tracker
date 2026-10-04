import { describe, expect, test } from "bun:test";
import { estimate, validateBook, PAYMENT_METHOD, type Ad, type SideSnapshot } from "../src/scrape";

const ad = (price: number, merchant = String(price), extra: Partial<Ad> = {}): Ad => ({
  price, merchant, merchantId: merchant, amount: 1000, min: 10000,
  max: 200000, methods: ["Baridimob"], methodIds: [PAYMENT_METHOD], ...extra,
});

describe("comparable executable quotes", () => {
  const book = [251, 251.1, 251.2, 251.3, 251.4].map((p) => ad(p));

  test("a million-DZD bank-only bid cannot move the Baridimob sell rate", () => {
    const giant = ad(270, "large bank merchant", {
      amount: 40000, min: 200000, max: 1000000,
      methods: ["Bank Transfer"], methodIds: ["BankTransfer"],
    });
    expect(estimate("sell", [...book, giant])).toEqual(estimate("sell", book));
  });

  test("a qualifying giant quote gets one vote, regardless of its balance", () => {
    const big = ad(270, "large merchant", { amount: 40000, max: 1000000 });
    const result = estimate("sell", [...book, big]);
    expect(result.median).toBe(251.3);
    expect(estimate("sell", [...book, {...big, amount: 40000000, max: 1000000000}])).toEqual(result);
  });

  test("min, max and available balance must all allow the same 50,000 DZD ticket", () => {
    const invalid = [
      ad(290, "high minimum", { min: 60000 }),
      ad(290, "low maximum", { max: 49999 }),
      ad(290, "low balance", { amount: 10 }),
      ad(290, "unknown maximum", { max: 0 }),
      ad(290, "other method", { methodIds: ["SocieteGenerale"] }),
      ad(290, "invalid number", { amount: NaN }),
    ];
    expect(estimate("sell", [...book, ...invalid])).toEqual(estimate("sell", book));
  });

  test("multiple ads from one merchant do not count as independent liquidity", () => {
    const copies = Array.from({length: 20}, (_, i) => ad(270 + i / 100, "same merchant"));
    expect(estimate("sell", [...book, ...copies]).median).toBe(251.3);
    expect(estimate("sell", [...book, ...copies]).sampleSize).toBe(5);
  });

  test("expensive ask-side tails do not set the buy headline", () => {
    const asks = [254, 254.1, 254.2, 254.3, 254.4].map((p) => ad(p));
    const tail = Array.from({length: 20}, (_, i) => ad(280 + i, `tail ${i}`, {max: 1000000}));
    expect(estimate("buy", [...asks, ...tail])).toEqual(estimate("buy", asks));
  });

  test("one extreme cheap quote cannot set the buy headline", () => {
    expect(estimate("buy", [...book, ad(200)]).median).toBe(251.1);
  });

  test("three independent offers suffice, but one or two must fail", () => {
    expect(estimate("buy", book.slice(0, 3)).median).toBe(251.1);
    expect(estimate("buy", book.slice(0, 4)).median).toBeCloseTo(251.15);
    expect(() => estimate("buy", book.slice(0, 2))).toThrow("need 3");
    expect(() => estimate("sell", [])).toThrow("need 3");
  });

  test("incomplete, mismatched or crossed sides cannot be stored as a new book", () => {
    const buy: SideSnapshot = {side: "buy", ts: 100, best: 254, median: 255,
      avg: 255, adsTotal: 20, sampleSize: 5, top: [], methodologyVersion: 2};
    const sell: SideSnapshot = {...buy, side: "sell", best: 252, median: 251};
    expect(() => validateBook([buy, sell])).not.toThrow();
    expect(() => validateBook([buy])).toThrow("incomplete");
    expect(() => validateBook([buy, {...sell, ts: 101}])).toThrow("incomplete");
    expect(() => validateBook([buy, {...sell, median: 270}])).toThrow("crossed");
  });
});
