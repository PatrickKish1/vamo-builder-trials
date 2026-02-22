# ElevenLabs Tools Configuration

This directory contains corrected JSON configurations for all four ElevenLabs agent tools.

## Issues Fixed in Your Original JSON

1.  **Wrong URL**: `/webhooks/elevenlabs` → Fixed to `/api/webhooks/elevenlabs`
2.  **Incorrect schema structure**: `request_body_schema` had wrong format → Fixed to proper object structure
3.  **Properties as array**: Should be object with `additionalProperties` → Fixed
4.  **Tab characters**: Had `\t` in field names → Removed
5.  **Wrong field types**: `force_pre_tool_speech` was string "auto" → Fixed to boolean `false`
6.  **Empty arrays**: `path_params_schema` and `query_params_schema` were arrays → Fixed to objects or null

## Files

- `tool1_create_update_file.json` - Create or update files
- `tool2_delete_file.json` - Delete files/folders
- `tool3_rename_file.json` - Rename files/folders
- `tool4_get_project_files.json` - Read existing files

## Before Using

**IMPORTANT**: Replace `https://code-easy-gamma.vercel.app` with your actual deployed domain in ALL four JSON files!

You can do a find-and-replace:
- Find: `https://code-easy-gamma.vercel.app`
- Replace: `https://your-actual-domain.com`

## How to Create Tools

### Method 1: Via ElevenLabs API

```bash
# Create Tool 1
curl -X POST https://api.elevenlabs.io/v1/convai/tools \
  -H "xi-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @tool1_create_update_file.json

# Create Tool 2
curl -X POST https://api.elevenlabs.io/v1/convai/tools \
  -H "xi-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @tool2_delete_file.json

# Create Tool 3
curl -X POST https://api.elevenlabs.io/v1/convai/tools \
  -H "xi-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @tool3_rename_file.json

# Create Tool 4
curl -X POST https://api.elevenlabs.io/v1/convai/tools \
  -H "xi-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @tool4_get_project_files.json
```

### Method 2: Via Dashboard (Manual)

1. Go to ElevenLabs Dashboard → Your Agent → Tools section
2. Click "Add Tool"
3. Choose "Webhook"
4. Copy the `tool_config` object from each JSON file (excluding the outer `{"tool_config": ...}` wrapper)
5. Paste or configure manually based on the JSON structure

## After Creating Tools

1. **Add tools to your agent**: In the agent settings, add these tools to the agent's tool list
2. **Update system prompt**: Add instructions about when to use each tool (see ELEVENLABS_SETUP.md)
3. **Test**: Start a voice conversation and say "Create a file called test.js"

## Notes

- All tools use constant `project_id` value: `68c9f40a002d5afe6b43`
- If you need dynamic project IDs, see ELEVENLABS_TOOLS_JSON.md for using dynamic variables
- The `get_project_files` tool uses `projectId` (camelCase) in query params to match your API
- All webhook tools use `project_id` (snake_case) in request body to match your webhook endpoint

