import { Context } from "@/context";
import { ToolResult } from "@/tools/tool";

export type PageState = {
  url?: string;
  title?: string;
  tree?: unknown;
};

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

export function extractPageState(result: unknown): PageState {
  const payload = unwrapCommandData<Record<string, unknown>>(result);
  const pageStateValue = payload?.pageState;

  if (pageStateValue && typeof pageStateValue === "object" && !Array.isArray(pageStateValue)) {
    const pageState = pageStateValue as PageState;
    return {
      url: pageState.url,
      title: pageState.title,
      tree: pageState.tree,
    };
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload) && "tree" in payload) {
    const legacy = payload as PageState;
    return {
      url: legacy.url,
      title: legacy.title,
      tree: legacy.tree,
    };
  }

  return {};
}

export function formatAriaSnapshot(pageState: PageState, status: string = ""): ToolResult {
  const url = pageState.url ?? "[unknown]";
  const title = pageState.title ?? "[unknown]";
  const snapshot = pageState.tree ?? {};

  const snapshotYaml = Array.isArray(snapshot)
    ? snapshot.map((el: any) => `  - ${el.ref} ${el.role || el.tagName}: ${el.name}`).join("\n")
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

export async function readPageState(context: Context): Promise<PageState> {
  const urlResult = unwrapCommandData<{
    url?: string;
  }>(await context.sendSocketMessage("getUrl", {}));
  const titleResult = unwrapCommandData<{
    title?: string;
  }>(await context.sendSocketMessage("getTitle", {}));
  const snapshotResult = unwrapCommandData<unknown>(
    await context.sendSocketMessage("snapshot", {}),
  );

  const snapshot =
    snapshotResult &&
    typeof snapshotResult === "object" &&
    !Array.isArray(snapshotResult) &&
    "tree" in snapshotResult
      ? (snapshotResult as { tree?: unknown }).tree ?? {}
      : snapshotResult ?? {};

  return {
    url: urlResult?.url,
    title: titleResult?.title,
    tree: snapshot,
  };
}

export async function captureAriaSnapshot(
  context: Context,
  status: string = "",
): Promise<ToolResult> {
  return formatAriaSnapshot(await readPageState(context), status);
}
