import { Context } from "@/context";
import { ToolResult } from "@/tools/tool";

function unwrapCommandData<T>(result: unknown): T {
  if (
    result &&
    typeof result === "object" &&
    "data" in result &&
    (result as { data?: unknown }).data !== undefined
  ) {
    return (result as { data: T }).data;
  }

  return result as T;
}

export async function captureAriaSnapshot(
  context: Context,
  status: string = "",
): Promise<ToolResult> {
  const urlResult = unwrapCommandData<{
    url?: string;
  }>(await context.sendSocketMessage("getUrl", {}));
  const titleResult = unwrapCommandData<{
    title?: string;
  }>(await context.sendSocketMessage("getTitle", {}));
  const snapshotResult = unwrapCommandData<unknown>(
    await context.sendSocketMessage("snapshot", {}),
  );

  // Extract actual values from result objects
  const url = urlResult?.url ?? "[unknown]";
  const title = titleResult?.title ?? "[unknown]";
  const snapshot =
    snapshotResult &&
      typeof snapshotResult === "object" &&
      !Array.isArray(snapshotResult) &&
      "tree" in snapshotResult
      ? (snapshotResult as { tree?: unknown }).tree ?? {}
      : snapshotResult ?? {};

  // Format snapshot as YAML-like structure
  const snapshotYaml = Array.isArray(snapshot)
    ? snapshot.map((el: any) => `  - ${el.ref} ${el.role || el.tagName}: ${el.name}`).join('\n')
    : JSON.stringify(snapshot, null, 2);

  return {
    content: [
      {
        type: "text",
        text: `${status ? `${status}\n` : ""}
- Page URL: ${url}
- Page Title: ${title}
- Page Snapshot
\`\`\`yaml
${snapshotYaml}
\`\`\`
`,
      },
    ],
  };
}
