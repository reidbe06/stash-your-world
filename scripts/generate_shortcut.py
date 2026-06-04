#!/usr/bin/env python3
"""
Generates public/STASHd.shortcut — a binary plist iOS Shortcut that:
  1. URL-encodes the shared URL from the Share Sheet
  2. Opens https://APP_URL/share?url=ENCODED in Safari

Run: python3 scripts/generate_shortcut.py
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

base_url = f"{APP_URL}/share?url="
placeholder_offset = len(base_url)

ENCODE_UUID = str(uuid.uuid4()).upper()

shortcut = {
    "WFWorkflowActions": [
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.urlencode",
            "WFWorkflowActionParameters": {
                "UUID": ENCODE_UUID,
                "WFEncodeMode": "Encode",
                "WFInput": {
                    "Value": {
                        "Aggrandizements": [],
                        "Type": "ExtensionInput",
                    },
                    "WFSerializationType": "WFTextTokenAttachment",
                },
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.openurl",
            "WFWorkflowActionParameters": {
                "WFURLActionURL": {
                    "Value": {
                        "attachmentsByRange": {
                            f"{{{placeholder_offset}, 1}}": {
                                "Aggrandizements": [],
                                "OutputName": "URL Encode",
                                "OutputUUID": ENCODE_UUID,
                                "Type": "ActionOutput",
                            }
                        },
                        "string": f"{base_url}\uFFFC",
                    },
                    "WFSerializationType": "WFTextTokenString",
                },
            },
        },
    ],
    "WFWorkflowClientVersion": "1105",
    "WFWorkflowHasOutputFallback": False,
    "WFWorkflowHasShortcutInputVariables": True,
    "WFWorkflowIcon": {
        "WFWorkflowIconGlyphNumber": 59511,
        "WFWorkflowIconStartColor": -1524983041,
    },
    "WFWorkflowImportQuestions": [],
    "WFWorkflowInputContentItemClasses": ["WFURLContentItem"],
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowName": "STASHd",
    "WFWorkflowNoInputBehavior": {
        "Name": "WFTextInputBehavior",
        "Parameters": {
            "Ask": False,
            "Prompt": "",
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
print(f"Shortcut:  STASHd  (Share Sheet enabled, URL input)")
print(f"Offset:    {placeholder_offset}")
