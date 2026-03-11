import { describe, expect, it } from "vitest";
import {
  CycleDetectedError,
  MissingRecipeSelectionError,
  planFactory,
  PlannerError,
} from "../src/core/planner";
import { Catalog } from "../src/core/types";

const steelCatalog: Catalog = {
  schemaVersion: 1,
  items: [
    { id: "coal", name: "Coal", aliases: [] },
    { id: "iron-ingot", name: "Iron Ingot", aliases: [] },
    { id: "steel", name: "Steel", aliases: [] },
    { id: "liquid-iron", name: "Liquid Iron", aliases: [] },
    { id: "raw-iron", name: "Raw Iron", aliases: [] },
  ],
  recipes: [
    {
      id: "steel",
      name: "Steel",
      machineName: "Blast Furnace",
      durationSec: 5n,
      inputs: [
        { itemId: "coal", amount: 4n },
        { itemId: "iron-ingot", amount: 1n },
      ],
      output: { itemId: "steel", amount: 2n },
    },
    {
      id: "iron-ingot",
      name: "Iron Ingot",
      machineName: "Ingot Molder",
      durationSec: 4n,
      inputs: [{ itemId: "liquid-iron", amount: 4n }],
      output: { itemId: "iron-ingot", amount: 2n },
    },
    {
      id: "liquid-iron",
      name: "Liquid Iron",
      machineName: "Electric Furnace",
      durationSec: 5n,
      inputs: [{ itemId: "raw-iron", amount: 1n }],
      output: { itemId: "liquid-iron", amount: 1n },
    },
    {
      id: "raw-iron",
      name: "Raw Iron",
      machineName: "Iron Drill",
      durationSec: 15n,
      inputs: [],
      output: { itemId: "raw-iron", amount: 1n },
    },
  ],
};

describe("factory planner", () => {
  it("calculates the steel chain and scales to whole machines", () => {
    const result = planFactory(steelCatalog, {
      rootRecipeId: "steel",
      targetMode: "machineCount",
      targetValue: "1",
      recipeSelections: {},
    });

    const counts = Object.fromEntries(
      result.recipeSummaries.map((summary) => [summary.recipeId, summary.scaledMachineCount]),
    );

    expect(result.scaleFactor).toBe(5n);
    expect(counts.steel).toBe(5n);
    expect(counts["iron-ingot"]).toBe(2n);
    expect(counts["liquid-iron"]).toBe(10n);
    expect(counts["raw-iron"]).toBe(30n);

    const coal = result.externalSources.find((source) => source.itemId === "coal");
    expect(coal?.scaledRate.toDecimalString(4)).toBe("4");
  });

  it("supports output-per-second planning", () => {
    const result = planFactory(steelCatalog, {
      rootRecipeId: "steel",
      targetMode: "outputPerSecond",
      targetValue: "2",
      recipeSelections: {},
    });

    const steel = result.recipeSummaries.find((summary) => summary.recipeId === "steel");
    expect(steel?.scaledMachineCount).toBe(5n);
    expect(result.achievedOutputPerSecond.toDecimalString(4)).toBe("2");
  });

  it("requires a selection when multiple recipes can produce an item", () => {
    const catalog: Catalog = {
      ...steelCatalog,
      recipes: [
        ...steelCatalog.recipes,
        {
          id: "alt-iron-ingot",
          name: "Alt Iron Ingot",
          machineName: "Alt Molder",
          durationSec: 2n,
          inputs: [{ itemId: "liquid-iron", amount: 2n }],
          output: { itemId: "iron-ingot", amount: 1n },
        },
      ],
    };

    expect(() =>
      planFactory(catalog, {
        rootRecipeId: "steel",
        targetMode: "machineCount",
        targetValue: "1",
        recipeSelections: {},
      }),
    ).toThrowError(MissingRecipeSelectionError);
  });

  it("detects cycles", () => {
    const cyclicCatalog: Catalog = {
      schemaVersion: 1,
      items: [
        { id: "a", name: "A", aliases: [] },
        { id: "b", name: "B", aliases: [] },
      ],
      recipes: [
        {
          id: "make-a",
          name: "Make A",
          machineName: "Assembler A",
          durationSec: 1n,
          inputs: [{ itemId: "b", amount: 1n }],
          output: { itemId: "a", amount: 1n },
        },
        {
          id: "make-b",
          name: "Make B",
          machineName: "Assembler B",
          durationSec: 1n,
          inputs: [{ itemId: "a", amount: 1n }],
          output: { itemId: "b", amount: 1n },
        },
      ],
    };

    expect(() =>
      planFactory(cyclicCatalog, {
        rootRecipeId: "make-a",
        targetMode: "machineCount",
        targetValue: "1",
        recipeSelections: {},
      }),
    ).toThrowError(CycleDetectedError);
  });

  it("rejects invalid recipe definitions", () => {
    const invalidCatalog: Catalog = {
      schemaVersion: 1,
      items: [{ id: "a", name: "A", aliases: [] }],
      recipes: [
        {
          id: "bad",
          name: "Bad Recipe",
          machineName: "Broken Machine",
          durationSec: 0n,
          inputs: [],
          output: { itemId: "a", amount: 1n },
        },
      ],
    };

    expect(() =>
      planFactory(invalidCatalog, {
        rootRecipeId: "bad",
        targetMode: "machineCount",
        targetValue: "1",
        recipeSelections: {},
      }),
    ).toThrowError(PlannerError);
  });
});
