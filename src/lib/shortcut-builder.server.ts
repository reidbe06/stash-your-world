/**
 * Builds an iOS Shortcuts .shortcut file as BINARY plist (bplist00).
 *
 * iOS Shortcuts requires binary plist format — XML plist causes
 * "Import Failed" at import time.  This encoder is a self-contained
 * implementation of the Apple binary property list format with no
 * external dependencies.
 *
 * The generated shortcut:
 *   Action 0  — coerce ExtensionInput → plain text
 *   Action 1  — regex-extract first https:// URL
 *   Action 2  — get first match
 *   Action 3  — save token (pre-embedded or blank for generic)
 *   Action 4  — POST to /api/public/share/save with X-Save-Token header
 *   Action 5  — native notification "Saved ✓"
 */
import { randomUUID } from "node:crypto";

// ── Plist value type ──────────────────────────────────────────────────────────
type PlistVal =
  | string
  | number
  | boolean
  | PlistVal[]
  | { [k: string]: PlistVal };

// ── Binary plist encoder ──────────────────────────────────────────────────────

type ObjDesc =
  | { t: "bool"; v: boolean }
  | { t: "int";  v: number }
  | { t: "str";  v: string }
  | { t: "arr";  refs: number[] }
  | { t: "dict"; keyRefs: number[]; valRefs: number[] };

/**
 * Flatten a PlistVal tree into a flat array of ObjDesc and return the
 * ref index of the root object.
 */
function collect(val: PlistVal, out: ObjDesc[]): number {
  const ref = out.length;

  if (typeof val === "boolean") {
    out.push({ t: "bool", v: val });
    return ref;
  }
  if (typeof val === "number") {
    out.push({ t: "int", v: val });
    return ref;
  }
  if (typeof val === "string") {
    out.push({ t: "str", v: val });
    return ref;
  }
  if (Array.isArray(val)) {
    // Reserve slot — children fill in after
    out.push({ t: "arr", refs: [] });
    const refs: number[] = val.map(item => collect(item, out));
    (out[ref] as { t: "arr"; refs: number[] }).refs = refs;
    return ref;
  }
  // Dict
  const entries = Object.entries(val as Record<string, PlistVal>);
  out.push({ t: "dict", keyRefs: [], valRefs: [] });
  const keyRefs: number[] = [];
  const valRefs: number[] = [];
  for (const [k, v] of entries) {
    keyRefs.push(collect(k, out));
    valRefs.push(collect(v, out));
  }
  const d = out[ref] as { t: "dict"; keyRefs: number[]; valRefs: number[] };
  d.keyRefs = keyRefs;
  d.valRefs = valRefs;
  return ref;
}

/** Encode a non-negative integer as the smallest bplist int object. */
function encodeIntObject(n: number): Buffer {
  if (n < 0) {
    // Negative → always 8 bytes (signed 64-bit big-endian)
    const b = Buffer.alloc(9);
    b[0] = 0x13;
    b.writeBigInt64BE(BigInt(n), 1);
    return b;
  }
  if (n <= 0xff) return Buffer.from([0x10, n]);
  if (n <= 0xffff) {
    const b = Buffer.alloc(3); b[0] = 0x11; b.writeUInt16BE(n, 1); return b;
  }
  if (n <= 0xffffffff) {
    const b = Buffer.alloc(5); b[0] = 0x12; b.writeUInt32BE(n, 1); return b;
  }
  const b = Buffer.alloc(9); b[0] = 0x13; b.writeBigUInt64BE(BigInt(n), 1); return b;
}

/** Write a ref index using refSize bytes (big-endian). */
function writeRef(ref: number, refSize: number): Buffer {
  const b = Buffer.alloc(refSize);
  if (refSize === 1) b.writeUInt8(ref, 0);
  else if (refSize === 2) b.writeUInt16BE(ref, 0);
  else b.writeUInt32BE(ref, 0);
  return b;
}

/**
 * Encode a single object descriptor into its binary plist representation.
 * Dicts and arrays use ref IDs; the integer count+marker comes from the descriptor.
 */
function encodeObj(obj: ObjDesc, refSize: number): Buffer {
  if (obj.t === "bool") return Buffer.from([obj.v ? 0x09 : 0x08]);

  if (obj.t === "int") return encodeIntObject(obj.v);

  if (obj.t === "str") {
    const s = obj.v;
    // Detect whether the string is pure ASCII (U+0000–U+007F)
    let isAscii = true;
    for (let i = 0; i < s.length; i++) {
      if (s.charCodeAt(i) > 0x7f) { isAscii = false; break; }
    }
    const len = s.length; // code-unit count (same as char count for BMP strings)

    if (isAscii) {
      const bytes = Buffer.from(s, "ascii");
      if (len < 15) return Buffer.concat([Buffer.from([0x50 | len]), bytes]);
      return Buffer.concat([Buffer.from([0x5f]), encodeIntObject(len), bytes]);
    }

    // UTF-16 BE (covers all BMP characters including U+FFFC)
    const raw = Buffer.from(s, "utf16le"); // Node gives UTF-16 LE
    // Swap bytes to get big-endian
    for (let i = 0; i < raw.length - 1; i += 2) {
      const tmp = raw[i]; raw[i] = raw[i + 1]; raw[i + 1] = tmp;
    }
    if (len < 15) return Buffer.concat([Buffer.from([0x60 | len]), raw]);
    return Buffer.concat([Buffer.from([0x6f]), encodeIntObject(len), raw]);
  }

  if (obj.t === "arr") {
    const count = obj.refs.length;
    const refBufs = Buffer.concat(obj.refs.map(r => writeRef(r, refSize)));
    if (count < 15) return Buffer.concat([Buffer.from([0xa0 | count]), refBufs]);
    return Buffer.concat([Buffer.from([0xaf]), encodeIntObject(count), refBufs]);
  }

  // dict
  const count = obj.keyRefs.length;
  const kBufs = Buffer.concat(obj.keyRefs.map(r => writeRef(r, refSize)));
  const vBufs = Buffer.concat(obj.valRefs.map(r => writeRef(r, refSize)));
  if (count < 15) return Buffer.concat([Buffer.from([0xd0 | count]), kBufs, vBufs]);
  return Buffer.concat([Buffer.from([0xdf]), encodeIntObject(count), kBufs, vBufs]);
}

/** Convert a PlistVal tree to a bplist00 binary Buffer. */
function encodeBplist(root: PlistVal): Buffer {
  const objects: ObjDesc[] = [];
  const topRef = collect(root, objects);
  const numObjects = objects.length;

  // Choose the smallest ref size that can address all objects
  const refSize = numObjects <= 0xff ? 1 : numObjects <= 0xffff ? 2 : 4;

  // Encode objects and track byte offsets
  let byteOffset = 8; // after "bplist00"
  const offsets: number[] = [];
  const encoded: Buffer[] = [];
  for (const obj of objects) {
    offsets.push(byteOffset);
    const buf = encodeObj(obj, refSize);
    encoded.push(buf);
    byteOffset += buf.length;
  }
  const offsetTableStart = byteOffset;

  // Choose the smallest offset size that can address all byte positions
  const offsetSize =
    offsetTableStart <= 0xff ? 1 :
    offsetTableStart <= 0xffff ? 2 :
    offsetTableStart <= 0xffffffff ? 4 : 8;

  // Offset table
  const offsetTable = Buffer.alloc(numObjects * offsetSize);
  for (let i = 0; i < numObjects; i++) {
    const o = offsets[i];
    if (offsetSize === 1)      offsetTable.writeUInt8(o, i);
    else if (offsetSize === 2) offsetTable.writeUInt16BE(o, i * 2);
    else if (offsetSize === 4) offsetTable.writeUInt32BE(o, i * 4);
    else                       offsetTable.writeBigUInt64BE(BigInt(o), i * 8);
  }

  // Trailer (32 bytes)
  const trailer = Buffer.alloc(32); // bytes 0-5: unused
  trailer[6] = offsetSize;
  trailer[7] = refSize;
  trailer.writeBigUInt64BE(BigInt(numObjects), 8);
  trailer.writeBigUInt64BE(BigInt(topRef), 16);
  trailer.writeBigUInt64BE(BigInt(offsetTableStart), 24);

  return Buffer.concat([Buffer.from("bplist00", "ascii"), ...encoded, offsetTable, trailer]);
}

// ── Shortcut plist helpers ────────────────────────────────────────────────────

/** Plain static text token — no variable substitution. */
const tok = (s: string): PlistVal => ({
  Value: { string: s },
  WFSerializationType: "WFTextTokenString",
});

/** Reference to a previous action's output variable. */
const ref = (name: string, uuid: string): PlistVal => ({
  Value: {
    Aggrandizements: [],
    OutputName: name,
    OutputUUID: uuid,
    Type: "ActionOutput",
  },
  WFSerializationType: "WFTextTokenAttachment",
});

/**
 * Text string with one action-output variable substituted at Unicode char
 * `offset`.  U+FFFC (Object Replacement Character) is the placeholder iOS
 * Shortcuts uses to mark variable insertion points in WFTextTokenString values.
 */
const tokVar = (
  template: string,
  offset: number,
  name: string,
  uuid: string
): PlistVal => ({
  Value: {
    attachmentsByRange: {
      [`{${offset}, 1}`]: {
        Aggrandizements: [],
        OutputName: name,
        OutputUUID: uuid,
        Type: "ActionOutput",
      },
    },
    string: template,
  },
  WFSerializationType: "WFTextTokenString",
});

// JSON body posted to /api/public/share/save.
// U+FFFC at position 8 is replaced at runtime by the extracted URL.
const JSON_BODY = '{"url":"\uFFFC","instant":true,"share_source":"ios_shortcut"}';
const URL_OFFSET = [...JSON_BODY].indexOf("\uFFFC"); // 8

// ── Public API ────────────────────────────────────────────────────────────────
export interface ShortcutOpts {
  saveEndpoint: string;
  tokenValue:   string;
  personal:     boolean;
  version?:     string;
}

/** Build a personalised (or generic) iOS Shortcuts .shortcut file as binary plist. */
export function buildShortcut(opts: ShortcutOpts): Buffer {
  const { saveEndpoint, tokenValue, personal, version = "v2" } = opts;

  const U = () => randomUUID().toUpperCase();
  const COERCE  = U();
  const MATCH   = U();
  const GETITEM = U();
  const TOKEN   = U();
  const HTTP    = U();
  const NOTIF   = U();

  const actions: PlistVal[] = [
    // ── 0: Coerce share-sheet input → plain text ──────────────────────────────
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

    // ── 1: Regex-match https:// URL ───────────────────────────────────────────
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.matchtext",
      WFWorkflowActionParameters: {
        UUID: MATCH,
        WFMatchTextPattern: "https?://[^\\s<>\"']+",
        WFMatchTextCaseSensitive: false,
        WFInput: ref("Text", COERCE),
      },
    },

    // ── 2: Get first match ────────────────────────────────────────────────────
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.getitemfromlist",
      WFWorkflowActionParameters: {
        UUID: GETITEM,
        WFItemIndex: 0,
        WFInput: ref("Match Text", MATCH),
      },
    },

    // ── 3: Save token ─────────────────────────────────────────────────────────
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.text",
      WFWorkflowActionParameters: {
        UUID: TOKEN,
        WFTextActionText: {
          Value: { string: tokenValue },
          WFSerializationType: "WFTextTokenString",
        },
      },
    },

    // ── 4: POST to STASHd ─────────────────────────────────────────────────────
    // CRITICAL: WFURL must be a WFTextTokenString dict — plain string causes
    // "The shortcut URL provided was invalid" on iOS 15+.
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.downloadurl",
      WFWorkflowActionParameters: {
        UUID: HTTP,
        WFHTTPMethod: "POST",
        WFURL: tok(saveEndpoint),
        WFHTTPHeaders: {
          Value: {
            WFDictionaryFieldValueItems: [
              {
                WFItemType: 0,
                WFKey: tok("X-Save-Token"),
                WFValue: tokVar("\uFFFC", 0, "Text", TOKEN),
              },
              {
                WFItemType: 0,
                WFKey: tok("Content-Type"),
                WFValue: tok("application/json"),
              },
            ],
          },
          WFSerializationType: "WFDictionaryFieldValue",
        },
        WFHTTPBodyType: "File",
        WFHTTPBody: tokVar(JSON_BODY, URL_OFFSET, "Get Item from List", GETITEM),
      },
    },

    // ── 5: Notification ───────────────────────────────────────────────────────
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
    WFWorkflowActions:                   actions,
    WFWorkflowClientVersion:             "1604",
    WFWorkflowHasOutputFallback:         false,
    WFWorkflowHasShortcutInputVariables: true,
    WFWorkflowIcon: {
      WFWorkflowIconGlyphNumber: 59511,
      WFWorkflowIconStartColor:  -1524983041,
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
    WFWorkflowTypes:                    ["ShareExtension"],
  };

  return encodeBplist(shortcut);
}
