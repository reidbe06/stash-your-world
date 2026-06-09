#!/usr/bin/env python3
"""
Generates public/STASHd.shortcut — an iOS Shortcut that:
  1. Extracts a URL from the Share Sheet input (handles URLs, text blobs, captions
     from Instagram, TikTok, Pinterest, YouTube, and Safari)
  2. POSTs directly to /api/public/share/save with the user's permanent save token
     (no Safari, no sign-in prompt — one-time token setup via import question)
  3. Shows a native iOS notification "Saved to STASHd ✓"

On first install, iOS prompts the user to paste their STASHd save token
(visible in Profile → iOS Shortcut section). After that, the shortcut works
instantly from any app's share sheet with zero taps beyond "Save to STASHd".

Run: python3 scripts/generate_shortcut.py [APP_URL]
Regenerate whenever the app URL changes.
"""
import plistlib
import uuid
import os
import sys

dev_domain = os.environ.get("REPLIT_DEV_DOMAIN", "")
if dev_domain:
    APP_URL = f"https://{dev_domain}"
else:
    APP_URL = "https://4fba965c-de88-4489-aab4-b71526ddcfe1-00-z6dfy1539wj5.kirk.replit.dev"

if len(sys.argv) > 1:
    APP_URL = sys.argv[1].rstrip("/")

SAVE_ENDPOINT = f"{APP_URL}/api/public/share/save"

# Stable action UUIDs (regenerated per-run is fine for Shortcuts)
MATCH_UUID      = str(uuid.uuid4()).upper()
GET_ITEM_UUID   = str(uuid.uuid4()).upper()
TOKEN_TEXT_UUID = str(uuid.uuid4()).upper()
HTTP_UUID       = str(uuid.uuid4()).upper()
NOTIF_UUID      = str(uuid.uuid4()).upper()

# JSON body template — \uFFFC is the Shortcuts Object Replacement Character
# used as a placeholder where a variable value is injected.
JSON_BODY = '{"url":"\uFFFC","instant":true,"share_source":"ios_shortcut"}'
URL_PLACEHOLDER_OFFSET = JSON_BODY.index('\uFFFC')  # offset of the URL variable in the string

def text_token(string: str) -> dict:
    """Plain literal text value (no variable attachments)."""
    return {
        "Value": {"string": string},
        "WFSerializationType": "WFTextTokenString",
    }

def action_output_ref(output_name: str, output_uuid: str) -> dict:
    """Reference to a previous action's output (variable attachment)."""
    return {
        "Value": {
            "Aggrandizements": [],
            "OutputName": output_name,
            "OutputUUID": output_uuid,
            "Type": "ActionOutput",
        },
        "WFSerializationType": "WFTextTokenAttachment",
    }

def token_string_with_var(template: str, offset: int, output_name: str, output_uuid: str) -> dict:
    """A text token string that embeds one variable at `offset`."""
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

shortcut = {
    "WFWorkflowActions": [
        # ── Action 0: Extract URL(s) from share sheet input ────────────────────
        # Works on URL content items (Safari, most apps) AND on text blobs
        # that contain an embedded URL (Instagram, TikTok caption shares).
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.matchtext",
            "WFWorkflowActionParameters": {
                "UUID": MATCH_UUID,
                "WFMatchTextPattern": "https?://[^\\s<>\"'\\u0000-\\u001f]+",
                "WFMatchTextCaseSensitive": False,
                "WFInput": {
                    "Value": {
                        "Aggrandizements": [],
                        "Type": "ExtensionInput",
                    },
                    "WFSerializationType": "WFTextTokenAttachment",
                },
            },
        },

        # ── Action 1: Get first matched URL ─────────────────────────────────────
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getitemfromlist",
            "WFWorkflowActionParameters": {
                "UUID": GET_ITEM_UUID,
                "WFItemIndex": 0,
                "WFInput": action_output_ref("Match Text", MATCH_UUID),
            },
        },

        # ── Action 2: Save token (populated by import question at install time) ──
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.text",
            "WFWorkflowActionParameters": {
                "UUID": TOKEN_TEXT_UUID,
                "WFTextActionText": {
                    "Value": {"string": ""},
                    "WFSerializationType": "WFTextTokenString",
                },
            },
        },

        # ── Action 3: POST to /api/public/share/save ─────────────────────────────
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
            "WFWorkflowActionParameters": {
                "UUID": HTTP_UUID,
                "WFHTTPMethod": "POST",
                "WFURL": SAVE_ENDPOINT,
                # Headers: X-Save-Token (from token text action) + Content-Type
                "WFHTTPHeaders": {
                    "Value": {
                        "WFDictionaryFieldValueItems": [
                            {
                                "WFItemType": 0,
                                "WFKey": text_token("X-Save-Token"),
                                "WFValue": token_string_with_var(
                                    "\uFFFC", 0, "Text", TOKEN_TEXT_UUID
                                ),
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
                # Body: JSON with URL variable embedded at URL_PLACEHOLDER_OFFSET
                "WFHTTPBodyType": "File",
                "WFHTTPBody": token_string_with_var(
                    JSON_BODY, URL_PLACEHOLDER_OFFSET, "Get Item from List", GET_ITEM_UUID
                ),
            },
        },

        # ── Action 4: Show native notification ──────────────────────────────────
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.notification",
            "WFWorkflowActionParameters": {
                "UUID": NOTIF_UUID,
                "WFNotificationActionTitle": "STASHd",
                "WFNotificationActionBody": "Saved ✓  AI is organizing it…",
                "WFNotificationActionPlaySound": False,
            },
        },
    ],

    "WFWorkflowClientVersion": "1105",
    "WFWorkflowHasOutputFallback": False,
    "WFWorkflowHasShortcutInputVariables": True,
    "WFWorkflowIcon": {
        "WFWorkflowIconGlyphNumber": 59511,
        "WFWorkflowIconStartColor": -1524983041,  # pink
    },

    # ── Import question: ask for save token once at install time ──────────────
    "WFWorkflowImportQuestions": [
        {
            "ActionIndex": 2,          # The "Text" (token) action at index 2
            "DefaultValue": "",
            "ParameterKey": "WFTextActionText",
            "Prompt": "Open STASHd → Profile → iOS Shortcut, then copy and paste your save token here.",
            "Text": "STASHd Save Token",
        }
    ],

    # Accept URLs, plain text (Instagram captions), and rich text
    "WFWorkflowInputContentItemClasses": [
        "WFURLContentItem",
        "WFTextContentItem",
        "WFStringContentItem",
        "WFRichTextContentItem",
    ],

    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowName": "Save to STASHd",

    # When run without input (e.g. from home screen): ask for a URL
    "WFWorkflowNoInputBehavior": {
        "Name": "WFTextInputBehavior",
        "Parameters": {
            "Ask": True,
            "Prompt": "Enter a URL to save to STASHd",
        },
    },

    "WFWorkflowOutputContentItemClasses": [],
    "WFWorkflowTypes": ["ShareExtension"],
}

out_path = os.path.join(os.path.dirname(__file__), "..", "public", "STASHd.shortcut")
out_path = os.path.normpath(out_path)

with open(out_path, "wb") as f:
    plistlib.dump(shortcut, f, fmt=plistlib.FMT_BINARY)

print(f"Generated: {out_path}")
print(f"App URL:   {APP_URL}")
print(f"Endpoint:  {SAVE_ENDPOINT}")
print(f"Shortcut:  Save to STASHd")
print(f"  - Accepts: URL, text (Instagram captions), rich text")
print(f"  - Auth:    X-Save-Token header (permanent, from Profile)")
print(f"  - Mode:    instant=true (background AI)")
print(f"  - UX:      native notification, no Safari")
