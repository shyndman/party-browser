import { Context } from "@/context";
import { ToolResult } from "@/tools/tool";

export async function captureAriaSnapshot(
  context: Context,
  status: string = "",
): Promise<ToolResult> {
  const urlResult = await context.sendSocketMessage("getUrl", undefined);
  const titleResult = await context.sendSocketMessage("getTitle", undefined);
  const snapshotResult = await context.sendSocketMessage("snapshot", {});

  // Extract actual values from result objects
  const url = urlResult?.url ?? "[unknown]";
  const title = titleResult?.title ?? "[unknown]";
  const snapshot = snapshotResult?.tree ?? snapshotResult ?? {};

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
