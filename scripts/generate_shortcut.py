#!/usr/bin/env python3
"""
Generates a STASHd iOS Shortcut binary plist.

Two modes:

  1. Static (CI / one-time):
       python3 scripts/generate_shortcut.py [APP_URL]
       → writes public/STASHd.shortcut (generic, prompts for token at install time)

  2. Personalised (server-side, per user):
       python3 scripts/generate_shortcut.py APP_URL --token stv1_xxx_xxx --stdout
       → writes binary plist to stdout (token is pre-embedded, zero install prompts)

The shortcut:
  - Coerces share-sheet input to text (handles URL items, text, captions)
  - Extracts the first https URL via regex
  - POSTs directly to /api/public/share/save with X-Save-Token + instant=true
  - Shows a native iOS notification "Saved ✓" — no Safari, no sign-in prompt
"""
import plistlib
import uuid
import os
import sys
import argparse

# ── CLI ───────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("app_url", nargs="?", default=None, help="Base app URL (https://...)")
parser.add_argument("--token", default=None, help="Embed this save token directly (skip import question)")
parser.add_argument("--stdout", action="store_true", help="Write binary plist to stdout instead of a file")
args = parser.parse_args()

# ── App URL resolution ────────────────────────────────────────────────────────
if args.app_url:
    APP_URL = args.app_url.rstrip("/")
else:
    # Default to production URL — never use the ephemeral dev domain for
    # static assets, as it changes on every workspace restart.
    APP_URL = os.environ.get("PUBLIC_URL", "https://stashd.replit.app")

SAVE_ENDPOINT = f"{APP_URL}/api/public/share/save"
PERSONAL = args.token is not None
TOKEN_VALUE = args.token or ""

# ── UUIDs ─────────────────────────────────────────────────────────────────────
COERCE_UUID    = str(uuid.uuid4()).upper()   # new: coerce ExtensionInput → text
MATCH_UUID     = str(uuid.uuid4()).upper()
GET_ITEM_UUID  = str(uuid.uuid4()).upper()
TOKEN_TEXT_UUID = str(uuid.uuid4()).upper()
HTTP_UUID      = str(uuid.uuid4()).upper()
NOTIF_UUID     = str(uuid.uuid4()).upper()

# ── Helpers ───────────────────────────────────────────────────────────────────
# JSON body: \uFFFC = Shortcuts Object Replacement Character (variable placeholder)
JSON_BODY = '{"url":"\uFFFC","instant":true,"share_source":"ios_shortcut"}'
URL_OFFSET = JSON_BODY.index('\uFFFC')

def text_token(string):
    """Plain static text — no variable substitution."""
    return {"Value": {"string": string}, "WFSerializationType": "WFTextTokenString"}

def action_ref(output_name, output_uuid):
    """Reference to the output of a previous action (used as inline variable)."""
    return {
        "Value": {
            "Aggrandizements": [],
            "OutputName": output_name,
            "OutputUUID": output_uuid,
            "Type": "ActionOutput",
        },
        "WFSerializationType": "WFTextTokenAttachment",
    }

def token_string_with_var(template, offset, output_name, output_uuid):
    """Text token string with one variable interpolated at `offset`."""
    return {
        "Value": {
            "attachmentsByRange": {
                f"{{{offset}, 1}}": {
                    "Aggrandizements": [],
                    "OutputName": output_name,
                    "OutputUUID": output_uuid,
                    "Type": "ActionOutput",
                }
            },
            "string": template,
        },
        "WFSerializationType": "WFTextTokenString",
    }

# ── Shortcut actions ──────────────────────────────────────────────────────────
actions = [
    # 0 — Coerce share-sheet input to a plain text string.
    #     Instagram/TikTok/Safari may pass URL items, text blobs, or rich text.
    #     Using a "Text" action with ExtensionInput normalises everything to text
    #     before the regex runs, which is the most compatible approach.
    {
        "WFWorkflowActionIdentifier": "is.workflow.actions.text",
        "WFWorkflowActionParameters": {
            "UUID": COERCE_UUID,
            "WFTextActionText": {
                "Value": {
                    "attachmentsByRange": {
                        "{0, 1}": {
                            "Aggrandizements": [],
                            "Type": "ExtensionInput",
                        }
                    },
                    "string": "\uFFFC",
                },
                "WFSerializationType": "WFTextTokenString",
            },
        },
    },
    # 1 — Extract URLs from the coerced text string.
    {
        "WFWorkflowActionIdentifier": "is.workflow.actions.matchtext",
        "WFWorkflowActionParameters": {
            "UUID": MATCH_UUID,
            "WFMatchTextPattern": "https?://[^\\s<>\"']+",
            "WFMatchTextCaseSensitive": False,
            "WFInput": action_ref("Text", COERCE_UUID),
        },
    },
    # 2 — Get first matched URL.
    {
        "WFWorkflowActionIdentifier": "is.workflow.actions.getitemfromlist",
        "WFWorkflowActionParameters": {
            "UUID": GET_ITEM_UUID,
            "WFItemIndex": 0,
            "WFInput": action_ref("Match Text", MATCH_UUID),
        },
    },
    # 3 — Save token (either pre-embedded or filled by import question).
    {
        "WFWorkflowActionIdentifier": "is.workflow.actions.text",
        "WFWorkflowActionParameters": {
            "UUID": TOKEN_TEXT_UUID,
            "WFTextActionText": {
                "Value": {"string": TOKEN_VALUE},
                "WFSerializationType": "WFTextTokenString",
            },
        },
    },
    # 4 — POST to /api/public/share/save.
    #     WFURL must be a WFTextTokenString dict — a plain string is NOT accepted
    #     by iOS 15+ and causes "The shortcut URL provided was invalid."
    {
        "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
        "WFWorkflowActionParameters": {
            "UUID": HTTP_UUID,
            "WFHTTPMethod": "POST",
            "WFURL": text_token(SAVE_ENDPOINT),
            "WFHTTPHeaders": {
                "Value": {
                    "WFDictionaryFieldValueItems": [
                        {
                            "WFItemType": 0,
                            "WFKey": text_token("X-Save-Token"),
                            "WFValue": token_string_with_var("\uFFFC", 0, "Text", TOKEN_TEXT_UUID),
                        },
                        {
                            "WFItemType": 0,
                            "WFKey": text_token("Content-Type"),
                            "WFValue": text_token("application/json"),
                        },
                    ]
                },
                "WFSerializationType": "WFDictionaryFieldValue",
            },
            "WFHTTPBodyType": "File",
            "WFHTTPBody": token_string_with_var(JSON_BODY, URL_OFFSET, "Get Item from List", GET_ITEM_UUID),
        },
    },
    # 5 — Native notification.
    {
        "WFWorkflowActionIdentifier": "is.workflow.actions.notification",
        "WFWorkflowActionParameters": {
            "UUID": NOTIF_UUID,
            "WFNotificationActionTitle": text_token("STASHd"),
            "WFNotificationActionBody": text_token("Saved ✓  AI is organizing it…"),
            "WFNotificationActionPlaySound": False,
        },
    },
]

# ── Full shortcut dict ────────────────────────────────────────────────────────
shortcut = {
    "WFWorkflowActions": actions,
    "WFWorkflowClientVersion": "1604",
    "WFWorkflowHasOutputFallback": False,
    "WFWorkflowHasShortcutInputVariables": True,
    "WFWorkflowIcon": {
        "WFWorkflowIconGlyphNumber": 59511,
        "WFWorkflowIconStartColor": -1524983041,  # pink
    },
    # Import question only needed for the generic (non-personalised) shortcut.
    **({"WFWorkflowImportQuestions": []} if PERSONAL else {
        "WFWorkflowImportQuestions": [
            {
                "ActionIndex": 3,
                "DefaultValue": "",
                "ParameterKey": "WFTextActionText",
                "Prompt": "Open STASHd → Profile → iOS Shortcut, then copy and paste your save token here.",
                "Text": "STASHd Save Token",
            }
        ]
    }),
    "WFWorkflowInputContentItemClasses": [
        "WFURLContentItem",
        "WFTextContentItem",
        "WFStringContentItem",
        "WFRichTextContentItem",
    ],
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowName": "Save to STASHd",
    "WFWorkflowNoInputBehavior": {
        "Name": "WFTextInputBehavior",
        "Parameters": {"Ask": True, "Prompt": "Enter a URL to save to STASHd"},
    },
    "WFWorkflowOutputContentItemClasses": [],
    "WFWorkflowTypes": ["ShareExtension"],
}

# ── Output ────────────────────────────────────────────────────────────────────
plist_bytes = plistlib.dumps(shortcut, fmt=plistlib.FMT_BINARY)

if args.stdout:
    sys.stdout.buffer.write(plist_bytes)
else:
    out_path = os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "public", "STASHd.shortcut")
    )
    with open(out_path, "wb") as f:
        f.write(plist_bytes)
    print(f"Generated: {out_path}", file=sys.stderr)
    print(f"App URL:   {APP_URL}", file=sys.stderr)
    print(f"Endpoint:  {SAVE_ENDPOINT}", file=sys.stderr)
    print(f"Mode:      {'personalised (token embedded)' if PERSONAL else 'generic (import question)'}", file=sys.stderr)
