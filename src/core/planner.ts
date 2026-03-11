import {
  getItemById,
  getRecipeById,
  getRecipeProducers,
  validateCatalog,
} from "./catalog";
import { Rational, lcm } from "./rational";
import { Catalog, ItemId, PlannerRequest, Recipe, RecipeId } from "./types";

export class PlannerError extends Error {}

export class MissingRecipeSelectionError extends PlannerError {
  constructor(
    public readonly itemId: ItemId,
    public readonly producerRecipeIds: RecipeId[],
  ) {
    super(`Multiple recipes can produce ${itemId}. A selection is required.`);
  }
}

export class CycleDetectedError extends PlannerError {
  constructor(public readonly path: RecipeId[]) {
    super(`Cycle detected in recipe graph: ${path.join(" -> ")}`);
  }
}

export interface RecipePlanSummary {
  recipeId: RecipeId;
  recipeName: string;
  machineName: string;
  exactMachineCount: Rational;
  scaledMachineCount: bigint;
  outputPerSecond: Rational;
  inputsPerSecond: Array<{
    itemId: ItemId;
    itemName: string;
    rate: Rational;
  }>;
}

export interface ExternalSourceSummary {
  itemId: ItemId;
  itemName: string;
  exactRate: Rational;
  scaledRate: Rational;
}

export interface DependencyEdge {
  itemId: ItemId;
  itemName: string;
  producerRecipeId?: RecipeId;
}

export interface PlannerResult {
  rootRecipeId: RecipeId;
  scaleFactor: bigint;
  achievedOutputPerSecond: Rational;
  recipeSummaries: RecipePlanSummary[];
  externalSources: ExternalSourceSummary[];
  dependencyGraph: Record<RecipeId, DependencyEdge[]>;
  selections: Record<ItemId, RecipeId>;
}

function getOutputRatePerMachine(recipe: Recipe): Rational {
  return new Rational(recipe.output.amount, recipe.durationSec);
}

function getInputRatePerMachine(recipe: Recipe, itemId: ItemId): Rational {
  const ingredient = recipe.inputs.find((input) => input.itemId === itemId);
  if (!ingredient) {
    return Rational.zero();
  }
  return new Rational(ingredient.amount, recipe.durationSec);
}

function addToRateMap(target: Map<ItemId, Rational>, itemId: ItemId, value: Rational): void {
  const existing = target.get(itemId) ?? Rational.zero();
  target.set(itemId, existing.add(value));
}

function addToMachineMap(target: Map<RecipeId, Rational>, recipeId: RecipeId, value: Rational): void {
  const existing = target.get(recipeId) ?? Rational.zero();
  target.set(recipeId, existing.add(value));
}

function resolveProducer(
  catalog: Catalog,
  itemId: ItemId,
  selections: Record<ItemId, RecipeId>,
): Recipe | undefined {
  const available = getRecipeProducers(catalog, itemId);
  if (available.length === 0) {
    return undefined;
  }

  const selectedRecipeId = selections[itemId];
  if (selectedRecipeId) {
    const recipe = available.find((entry) => entry.id === selectedRecipeId);
    if (!recipe) {
      throw new PlannerError(
        `Selected recipe ${selectedRecipeId} does not produce ${itemId}.`,
      );
    }
    return recipe;
  }

  if (available.length === 1) {
    return available[0];
  }

  throw new MissingRecipeSelectionError(
    itemId,
    available.map((recipe) => recipe.id),
  );
}

function detectCycles(
  catalog: Catalog,
  recipeId: RecipeId,
  selections: Record<ItemId, RecipeId>,
  stack: RecipeId[] = [],
  visiting = new Set<RecipeId>(),
  visited = new Set<RecipeId>(),
): void {
  if (visited.has(recipeId)) {
    return;
  }
  if (visiting.has(recipeId)) {
    const cycleStart = stack.indexOf(recipeId);
    throw new CycleDetectedError([...stack.slice(cycleStart), recipeId]);
  }

  const recipe = getRecipeById(catalog, recipeId);
  if (!recipe) {
    throw new PlannerError(`Unknown recipe id: ${recipeId}`);
  }

  visiting.add(recipeId);
  stack.push(recipeId);

  for (const input of recipe.inputs) {
    const producer = resolveProducer(catalog, input.itemId, selections);
    if (producer) {
      detectCycles(catalog, producer.id, selections, stack, visiting, visited);
    }
  }

  stack.pop();
  visiting.delete(recipeId);
  visited.add(recipeId);
}

export function planFactory(catalog: Catalog, request: PlannerRequest): PlannerResult {
  const catalogErrors = validateCatalog(catalog);
  if (catalogErrors.length > 0) {
    throw new PlannerError(catalogErrors[0]);
  }

  const rootRecipe = getRecipeById(catalog, request.rootRecipeId);
  if (!rootRecipe) {
    throw new PlannerError(`Unknown root recipe: ${request.rootRecipeId}`);
  }

  const targetValue = Rational.parse(request.targetValue);
  if (targetValue.compare(Rational.zero()) <= 0) {
    throw new PlannerError("Target value must be greater than zero.");
  }

  const resolvedSelections = { ...request.recipeSelections };
  detectCycles(catalog, rootRecipe.id, resolvedSelections);

  const recipeMachines = new Map<RecipeId, Rational>();
  const externalSources = new Map<ItemId, Rational>();
  const dependencyGraph = new Map<RecipeId, Map<ItemId, DependencyEdge>>();
  const frontier = new Map<ItemId, Rational>();

  const rootMachineCount =
    request.targetMode === "machineCount"
      ? targetValue
      : targetValue.div(getOutputRatePerMachine(rootRecipe));

  addToMachineMap(recipeMachines, rootRecipe.id, rootMachineCount);
  dependencyGraph.set(rootRecipe.id, new Map<ItemId, DependencyEdge>());

  for (const input of rootRecipe.inputs) {
    const inputDemand = new Rational(input.amount, rootRecipe.durationSec).mul(rootMachineCount);
    addToRateMap(frontier, input.itemId, inputDemand);
    const producer = resolveProducer(catalog, input.itemId, resolvedSelections);
    dependencyGraph.get(rootRecipe.id)?.set(input.itemId, {
      itemId: input.itemId,
      itemName: getItemById(catalog, input.itemId)?.name ?? input.itemId,
      producerRecipeId: producer?.id,
    });
    if (producer) {
      resolvedSelections[input.itemId] = producer.id;
    }
  }

  while (frontier.size > 0) {
    const nextFrontier = new Map<ItemId, Rational>();
    for (const [itemId, demandRate] of frontier.entries()) {
      const producer = resolveProducer(catalog, itemId, resolvedSelections);
      if (!producer) {
        addToRateMap(externalSources, itemId, demandRate);
        continue;
      }

      resolvedSelections[itemId] = producer.id;
      const outputRatePerMachine = getOutputRatePerMachine(producer);
      const machineCount = demandRate.div(outputRatePerMachine);
      addToMachineMap(recipeMachines, producer.id, machineCount);

      if (!dependencyGraph.has(producer.id)) {
        dependencyGraph.set(producer.id, new Map<ItemId, DependencyEdge>());
      }

      for (const input of producer.inputs) {
        const inputRate = getInputRatePerMachine(producer, input.itemId).mul(machineCount);
        addToRateMap(nextFrontier, input.itemId, inputRate);
        const upstreamProducer = resolveProducer(catalog, input.itemId, resolvedSelections);
        dependencyGraph.get(producer.id)?.set(input.itemId, {
          itemId: input.itemId,
          itemName: getItemById(catalog, input.itemId)?.name ?? input.itemId,
          producerRecipeId: upstreamProducer?.id,
        });
        if (upstreamProducer) {
          resolvedSelections[input.itemId] = upstreamProducer.id;
        }
      }
    }

    frontier.clear();
    for (const [itemId, value] of nextFrontier.entries()) {
      frontier.set(itemId, value);
    }
  }

  let scaleFactor = 1n;
  for (const machineCount of recipeMachines.values()) {
    scaleFactor = lcm(scaleFactor, machineCount.denominator);
  }

  const scaledFactor = Rational.fromBigInt(scaleFactor);
  const recipeSummaries = [...recipeMachines.entries()]
    .map(([recipeId, exactMachineCount]) => {
      const recipe = getRecipeById(catalog, recipeId);
      if (!recipe) {
        throw new PlannerError(`Unknown recipe id in result: ${recipeId}`);
      }

      const scaledMachineCount = exactMachineCount.mul(scaledFactor);
      return {
        recipeId,
        recipeName: recipe.name,
        machineName: recipe.machineName,
        exactMachineCount,
        scaledMachineCount: scaledMachineCount.numerator,
        outputPerSecond: getOutputRatePerMachine(recipe).mul(scaledMachineCount),
        inputsPerSecond: recipe.inputs.map((input) => ({
          itemId: input.itemId,
          itemName: getItemById(catalog, input.itemId)?.name ?? input.itemId,
          rate: new Rational(input.amount, recipe.durationSec).mul(scaledMachineCount),
        })),
      };
    })
    .sort((left, right) => left.recipeName.localeCompare(right.recipeName));

  const externalSourceSummaries = [...externalSources.entries()]
    .map(([itemId, exactRate]) => ({
      itemId,
      itemName: getItemById(catalog, itemId)?.name ?? itemId,
      exactRate,
      scaledRate: exactRate.mul(scaledFactor),
    }))
    .sort((left, right) => left.itemName.localeCompare(right.itemName));

  const serializedGraph: Record<RecipeId, DependencyEdge[]> = {};
  for (const [recipeId, edges] of dependencyGraph.entries()) {
    serializedGraph[recipeId] = [...edges.values()].sort((left, right) =>
      left.itemName.localeCompare(right.itemName),
    );
  }

  return {
    rootRecipeId: rootRecipe.id,
    scaleFactor,
    achievedOutputPerSecond: getOutputRatePerMachine(rootRecipe).mul(rootMachineCount).mul(scaledFactor),
    recipeSummaries,
    externalSources: externalSourceSummaries,
    dependencyGraph: serializedGraph,
    selections: resolvedSelections,
  };
}

export function formatRate(rate: Rational): string {
  return `${rate.toDecimalString(4)}/s (${rate.toFractionString()}/s)`;
}
