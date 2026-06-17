/**
 * Generates an iOS Shortcuts `.shortcut` file (XML plist) in pure TypeScript.
 * No Python, no subprocess — runs directly in Bun/Node.
 *
 * The generated shortcut:
 *   1. Coerces share-sheet input → plain text  (handles URL items, text blobs, captions)
 *   2. Regex-extracts the first https:// URL
 *   3. POSTs to /api/public/share/save with X-Save-Token header
 *   4. Shows a native iOS notification "Saved ✓"
 */
import { randomUUID } from "node:crypto";

// ── Types ─────────────────────────────────────────────────────────────────────
type PlistVal =
  | string
  | number
  | boolean
  | PlistVal[]
  | { [k: string]: PlistVal };

// ── XML helpers ───────────────────────────────────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ser(v: PlistVal, depth = 0): string {
  const pad = "  ".repeat(depth);
  if (typeof v === "string")  return `${pad}<string>${esc(v)}</string>`;
  if (typeof v === "boolean") return `${pad}<${v ? "true" : "false"}/>`;
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? `${pad}<integer>${v}</integer>`
      : `${pad}<real>${v}</real>`;
  }
  if (Array.isArray(v)) {
    if (!v.length) return `${pad}<array/>`;
    return `${pad}<array>\n${v.map(i => ser(i, depth + 1)).join("\n")}\n${pad}</array>`;
  }
  const entries = Object.entries(v as Record<string, PlistVal>);
  if (!entries.length) return `${pad}<dict/>`;
  const body = entries
    .map(([k, val]) => `${"  ".repeat(depth + 1)}<key>${esc(k)}</key>\n${ser(val, depth + 1)}`)
    .join("\n");
  return `${pad}<dict>\n${body}\n${pad}</dict>`;
}

// ── Shortcut plist helpers ────────────────────────────────────────────────────
// Plain static text token (no variable substitution).
const tok = (s: string): PlistVal => ({
  Value: { string: s },
  WFSerializationType: "WFTextTokenString",
});

// Reference to a previous action's output.
const ref = (name: string, uuid: string): PlistVal => ({
  Value: { Aggrandizements: [], OutputName: name, OutputUUID: uuid, Type: "ActionOutput" },
  WFSerializationType: "WFTextTokenAttachment",
});

// Text string with one variable substituted at Unicode char `offset`.
// \uFFFC (U+FFFC Object Replacement Character) is the placeholder iOS uses.
const tokVar = (template: string, offset: number, name: string, uuid: string): PlistVal => ({
  Value: {
    attachmentsByRange: {
      [`{${offset}, 1}`]: { Aggrandizements: [], OutputName: name, OutputUUID: uuid, Type: "ActionOutput" },
    },
    string: template,
  },
  WFSerializationType: "WFTextTokenString",
});

// JSON body with placeholder at position 8 ( {"url":"<HERE>","instant":true,...} )
const JSON_BODY = '{"url":"\uFFFC","instant":true,"share_source":"ios_shortcut"}';
const URL_OFFSET = [...JSON_BODY].indexOf("\uFFFC"); // = 8

// ── Public API ────────────────────────────────────────────────────────────────
export interface ShortcutOpts {
  saveEndpoint: string;   // Full URL of the POST endpoint
  tokenValue:   string;   // Empty = generic (import question), non-empty = personal
  personal:     boolean;
  version?:     string;   // Shown in the shortcut name so users can verify
}

export function buildShortcut(opts: ShortcutOpts): Buffer {
  const {
    saveEndpoint,
    tokenValue,
    personal,
    version = "v2",
  } = opts;

  const U = () => randomUUID().toUpperCase();
  const COERCE  = U();
  const MATCH   = U();
  const GETITEM = U();
  const TOKEN   = U();
  const HTTP    = U();
  const NOTIF   = U();

  const actions: PlistVal[] = [
    // ── 0: Coerce ExtensionInput → plain text string ──────────────────────────
    // Instagram/TikTok/Safari may pass URL items, rich text, or caption blobs.
    // A "Text" action with ExtensionInput as its body normalises everything.
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.text",
      WFWorkflowActionParameters: {
        UUID: COERCE,
        WFTextActionText: {
          Value: {
            attachmentsByRange: {
              "{0, 1}": { Aggrandizements: [], Type: "ExtensionInput" },
            },
            string: "\uFFFC",
          },
          WFSerializationType: "WFTextTokenString",
        },
      },
    },

    // ── 1: Regex-extract https:// URL from the coerced text ───────────────────
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.matchtext",
      WFWorkflowActionParameters: {
        UUID: MATCH,
        WFMatchTextPattern: "https?://[^\\s<>\"']+",
        WFMatchTextCaseSensitive: false,
        WFInput: ref("Text", COERCE),
      },
    },

    // ── 2: Take first match ───────────────────────────────────────────────────
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.getitemfromlist",
      WFWorkflowActionParameters: {
        UUID: GETITEM,
        WFItemIndex: 0,
        WFInput: ref("Match Text", MATCH),
      },
    },

    // ── 3: Save token (pre-embedded for personal, blank for generic) ──────────
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.text",
      WFWorkflowActionParameters: {
        UUID: TOKEN,
        WFTextActionText: { Value: { string: tokenValue }, WFSerializationType: "WFTextTokenString" },
      },
    },

    // ── 4: POST to STASHd API ─────────────────────────────────────────────────
    // CRITICAL: WFURL must be a WFTextTokenString dict, not a plain string.
    // iOS 15+ rejects plain-string WFURL with "The shortcut URL provided was invalid."
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.downloadurl",
      WFWorkflowActionParameters: {
        UUID: HTTP,
        WFHTTPMethod: "POST",
        WFURL: tok(saveEndpoint),
        WFHTTPHeaders: {
          Value: {
            WFDictionaryFieldValueItems: [
              { WFItemType: 0, WFKey: tok("X-Save-Token"), WFValue: tokVar("\uFFFC", 0, "Text", TOKEN) },
              { WFItemType: 0, WFKey: tok("Content-Type"), WFValue: tok("application/json") },
            ],
          },
          WFSerializationType: "WFDictionaryFieldValue",
        },
        WFHTTPBodyType: "File",
        WFHTTPBody: tokVar(JSON_BODY, URL_OFFSET, "Get Item from List", GETITEM),
      },
    },

    // ── 5: Native notification ────────────────────────────────────────────────
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.notification",
      WFWorkflowActionParameters: {
        UUID: NOTIF,
        WFNotificationActionTitle: tok("STASHd"),
        WFNotificationActionBody: tok("Saved ✓  AI is organizing it…"),
        WFNotificationActionPlaySound: false,
      },
    },
  ];

  const importQuestions: PlistVal[] = personal
    ? []
    : [
        {
          ActionIndex: 3,
          DefaultValue: "",
          ParameterKey: "WFTextActionText",
          Prompt:
            "Open STASHd → Profile → iOS Shortcut, then copy and paste your save token here.",
          Text: "STASHd Save Token",
        },
      ];

  const shortcut: Record<string, PlistVal> = {
    WFWorkflowActions:              actions,
    WFWorkflowClientVersion:        "1604",
    WFWorkflowHasOutputFallback:    false,
    WFWorkflowHasShortcutInputVariables: true,
    WFWorkflowIcon: {
      WFWorkflowIconGlyphNumber: 59511,
      WFWorkflowIconStartColor:  -1524983041, // pink
    },
    WFWorkflowImportQuestions:      importQuestions,
    WFWorkflowInputContentItemClasses: [
      "WFURLContentItem",
      "WFTextContentItem",
      "WFStringContentItem",
      "WFRichTextContentItem",
    ],
    WFWorkflowMinimumClientVersion:       900,
    WFWorkflowMinimumClientVersionString: "900",
    WFWorkflowName:                 `Save to STASHd ${version}`,
    WFWorkflowNoInputBehavior: {
      Name:       "WFTextInputBehavior",
      Parameters: { Ask: true, Prompt: "Enter a URL to save to STASHd" },
    },
    WFWorkflowOutputContentItemClasses: [],
    WFWorkflowTypes:                ["ShareExtension"],
  };

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<plist version="1.0">`,
    ser(shortcut),
    `</plist>`,
  ].join("\n");

  return Buffer.from(xml, "utf-8");
}
