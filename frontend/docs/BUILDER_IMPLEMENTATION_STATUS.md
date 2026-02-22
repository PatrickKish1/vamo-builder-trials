# Web App Builder - Implementation Status

## ✅ Completed

### 1. Cleanup API Key
- ✅ Made cleanup API key optional (commented out requirement)

### 2. Landing Page (`/builder`)
- ✅ Created landing page with:
  - AI Orb component
  - "OR" separator
  - Text input for app description
  - Framework selector (Next.js, React, Angular, Vue, Svelte)
  - Template gallery (6 templates)
  - Footer with links
  - Auth gate (redirects to login if not authenticated)
  - Prompt persistence after login

### 3. API Endpoints
- ✅ `/api/builder/projects` - Create and list builder projects
- ✅ `/api/builder/auth-check` - Webhook for agents to verify auth state

### 4. UI Components
- ✅ Created Select component (`src/components/ui/select.tsx`)

## 🚧 In Progress / Pending

### 1. Building Interface (`/builder/build/[id]`)
- ⏳ Split view: Code editor + Live preview
- ⏳ Chat/Voice agent panel (auth-gated)
- ⏳ File tree sidebar
- ⏳ Real-time preview updates
- ⏳ Framework-specific build commands

### 2. Framework Scaffolding
- ⏳ Scaffolding API (`/api/builder/scaffold`)
- ⏳ Support for:
  - Next.js (`create-next-app@latest`)
  - React (`create-react-app`)
  - Angular (`@angular/cli`)
  - Vue (`npm create vue@latest`)
  - Svelte (`npm create svelte@latest`)
- ⏳ File system management for projects
- ⏳ Template system

### 3. Preview System
- ⏳ Preview server/proxy (`/api/builder/preview`)
- ⏳ Port management (dynamic port allocation)
- ⏳ Dev server spawning (Node.js child_process)
- ⏳ Hot reload integration
- ⏳ Dependency installation (npm/yarn/pnpm)

### 4. Agent Integration
- ⏳ Builder-specific tools for agents:
  - `checkAuth` - Verify user authentication
  - `scaffoldProject` - Create framework project
  - `installDependencies` - Install npm packages
  - `updateFile` - Modify files in builder project
  - `createFile` - Create new files
  - `deleteFile` - Delete files
  - `runBuild` - Build the app
  - `startPreview` - Start preview server
- ⏳ Auth verification before tool execution
- ⏳ Real-time file updates
- ⏳ Integration with existing CallPanel and ChatPanel

### 5. Data Model
- ⏳ Add `type` field to projects collection (to distinguish builder from editor projects)
- ⏳ Add fields:
  - `framework`
  - `status` (scaffolding, building, ready, error)
  - `previewUrl`
  - `previewPort`
  - `projectPath`

## 📋 Next Steps

1. **Install Missing Dependencies**
   ```bash
   pnpm add @radix-ui/react-select
   ```

2. **Create Building Interface** (`src/app/builder/build/[id]/page.tsx`)
   - Split view layout
   - Code editor integration
   - Preview iframe
   - File tree
   - Agent panels

3. **Implement Scaffolding API** (`src/app/api/builder/scaffold/route.ts`)
   - Framework detection
   - Command execution (child_process)
   - File system operations
   - Error handling

4. **Implement Preview System** (`src/app/api/builder/preview/route.ts`)
   - Port management
   - Server spawning
   - Proxy setup
   - Hot reload

5. **Add Agent Tools**
   - Update CallPanel with builder tools
   - Update ChatPanel with builder tools
   - Auth verification middleware

6. **Update Appwrite Schema**
   - Add `type` field to projects collection
   - Add builder-specific fields

## 🔧 Technical Considerations

### Server Rendering
- Use Node.js `child_process` to spawn dev servers
- Proxy requests through Next.js API routes
- Manage ports dynamically (3000, 3001, etc.)
- Cleanup processes on disconnect

### Dependency Management
- Detect package manager (npm/yarn/pnpm)
- Install dependencies in project directory
- Track installed packages
- Handle version conflicts

### File System
- Store projects in `/tmp/builder-projects` or dedicated directory
- Use UUIDs for project directories
- Cleanup old projects periodically
- Support multiple concurrent builds

### Security
- Auth-gate all builder routes
- Validate file paths (prevent directory traversal)
- Sandbox preview servers
- Rate limit scaffold requests

## 📝 Notes

- The cleanup API key is now optional - it's safe to expose the cleanup endpoint
- Landing page is fully functional with auth gating
- Builder projects are stored in the same Appwrite collection with a `type: "builder"` field
- Framework scaffolding will need proper server-side execution capabilities
- Preview system requires careful port and process management

