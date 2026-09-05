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
    "success" in result &&
    (result as { success?: unknown }).success === false
  ) {
    const failed = result as { error?: unknown };
    const message = typeof failed.error === "string" ? failed.error : "Command failed without an error message.";
    throw new Error(message);
  }

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

function formatSnapshotElement(element: Record<string, unknown>): string {
  const ref = typeof element.ref === "string" ? `${element.ref} ` : "";
  const role = typeof element.role === "string" && element.role
    ? element.role
    : typeof element.tagName === "string" && element.tagName ? element.tagName : "element";
  const name = typeof element.name === "string" ? element.name : "";
  const details: string[] = [];

  if (typeof element.type === "string" && element.type) details.push(`type=${element.type}`);
  if (typeof element.value === "string" && element.value) details.push(`value=${JSON.stringify(element.value)}`);
  if (typeof element.placeholder === "string" && element.placeholder) details.push(`placeholder=${JSON.stringify(element.placeholder)}`);
  if (element.disabled === true) details.push("disabled");
  if (element.checked === true) details.push("checked");
  if (element.selected === true) details.push("selected");

  return `  - ${ref}${role}: ${name}${details.length ? ` [${details.join(", ")}]` : ""}`;
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
    ? snapshot.map((element) => (
      element && typeof element === "object"
        ? formatSnapshotElement(element as Record<string, unknown>)
        : `  - ${String(element)}`
    )).join("\n")
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

export async function readPageState(context: Context, requestId?: string): Promise<PageState> {
  const snapshotResult = unwrapCommandData<unknown>(
    await context.sendSocketMessage("snapshot", {}, { requestId }),
  );
  const payload = snapshotResult && typeof snapshotResult === "object" && !Array.isArray(snapshotResult)
    ? snapshotResult as Record<string, unknown>
    : null;
  const tree = payload && "tree" in payload ? payload.tree : snapshotResult;
  const url = payload && typeof payload.url === "string" ? payload.url : undefined;
  const title = payload && typeof payload.title === "string" ? payload.title : undefined;

  if (!url) throw new Error("Page URL readback failed: snapshot response did not contain a URL.");
  if (title === undefined) throw new Error("Page title readback failed: snapshot response did not contain a title.");

  return { url, title, tree: tree ?? {} };
}

export async function captureAriaSnapshot(
  context: Context,
  status: string = "",
  requestId?: string,
): Promise<ToolResult> {
  return formatAriaSnapshot(await readPageState(context, requestId), status);
}
