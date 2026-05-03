import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parse, View } from "vega";
import { compile } from "vega-lite";
import sharp from "sharp";

type RenderArgs = {
  spec: string;
  output: string;
};

function parseArgs(args: string[]): RenderArgs {
  const parsed: RenderArgs = {
    spec: "visuals.json",
    output: "artifacts/visual.png",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--spec" && value) {
      parsed.spec = value;
      index += 1;
      continue;
    }

    if (arg === "--output" && value) {
      parsed.output = value;
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  return parsed;
}

function toVegaSpec(input: unknown): unknown {
  const maybeSpec = input as { spec?: unknown };
  const spec = maybeSpec.spec ?? input;
  const maybeDeclarativeSpec = spec as { mark?: unknown; $schema?: string };

  if (maybeDeclarativeSpec.mark || maybeDeclarativeSpec.$schema?.includes("vega-lite")) {
    return compile(spec as never).spec;
  }

  return spec;
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const rawSpec = JSON.parse(await Bun.file(args.spec).text());
  const runtime = parse(toVegaSpec(rawSpec) as never);
  const view = new View(runtime, { renderer: "none" });
  const svg = await view.toSVG();
  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  await mkdir(dirname(args.output), { recursive: true });
  await Bun.write(args.output, png);

  console.log(
    JSON.stringify({
      artifacts: [
        {
          path: args.output,
          contentType: "image/png",
        },
      ],
    }),
  );
}

await main();
