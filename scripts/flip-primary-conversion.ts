import { customerId, mutate, search } from "../packages/core/src/ads/client";

const PRIMARY = "demo_booked";
const DEMOTE = ["demo_request"];

interface ConversionRow {
  conversionAction: {
    resourceName: string;
    name: string;
    primaryForGoal?: boolean;
    status?: string;
  };
}

async function main(): Promise<void> {
  const rows = (await search(`
    SELECT
      conversion_action.resource_name,
      conversion_action.name,
      conversion_action.primary_for_goal,
      conversion_action.status
    FROM conversion_action
    WHERE conversion_action.status != 'REMOVED'
  `)) as ConversionRow[];

  console.log("Before:");
  for (const row of rows) {
    const { name, primaryForGoal, status } = row.conversionAction;
    if (
      name === PRIMARY ||
      DEMOTE.includes(name) ||
      name.includes("demo") ||
      name.includes("book")
    ) {
      console.log(`  ${name}: primary=${primaryForGoal} status=${status}`);
    }
  }

  const ops: unknown[] = [];
  for (const row of rows) {
    const { resourceName, name } = row.conversionAction;
    if (name === PRIMARY) {
      ops.push({
        conversionActionOperation: {
          update: {
            resourceName,
            primaryForGoal: true,
          },
          updateMask: "primary_for_goal",
        },
      });
    } else if (DEMOTE.includes(name)) {
      ops.push({
        conversionActionOperation: {
          update: {
            resourceName,
            primaryForGoal: false,
          },
          updateMask: "primary_for_goal",
        },
      });
    }
  }

  if (ops.length === 0) {
    console.log("No matching conversion actions found — nothing to flip.");
    return;
  }

  console.log(`\nApplying ${ops.length} update(s) for customer ${customerId()}...`);
  const result = await mutate(ops, false);
  console.log("Done:", JSON.stringify(result).slice(0, 800));

  const after = (await search(`
    SELECT conversion_action.name, conversion_action.primary_for_goal
    FROM conversion_action
    WHERE conversion_action.name IN ('demo_booked', 'demo_request')
  `)) as ConversionRow[];

  console.log("\nAfter:");
  for (const row of after) {
    const { name, primaryForGoal } = row.conversionAction;
    console.log(`  ${name}: primary=${primaryForGoal}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
