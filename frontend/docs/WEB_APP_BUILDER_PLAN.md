# Web App Builder Feature - Implementation Plan

## Overview
Build a professional web app builder (like Bolt/Lovable) that generates high-quality web applications using various frameworks (Next.js, React, Angular, Vue, Svelte).

## Architecture

### Routes
- `/builder` - Landing page with AI orb, input, templates, footer
- `/builder/build/[id]` - Building interface with preview (requires auth)
- `/builder/preview/[id]` - Preview proxy/server for rendering apps
- `/api/builder/projects` - Manage builder projects
- `/api/builder/scaffold` - Framework scaffolding
- `/api/builder/preview` - Preview server API
- `/api/builder/auth-check` - Auth verification webhook for agents

### Key Components

1. **Landing Page (`/builder`)**
   - AI Orb (animated)
   - "OR" separator
   - Text input for app description
   - Framework selector (Next.js default, React, Angular, Vue, Svelte)
   - Template gallery (built apps showcase)
   - Footer
   - Auth gate: Redirects to signup if not authenticated

2. **Building Interface (`/builder/build/[id]`)**
   - Split view: Code editor + Live preview
   - Chat/Voice agent panel (auth-gated)
   - File tree sidebar
   - Real-time preview updates
   - Framework-specific build commands

3. **Preview System**
   - Node.js child process for running dev servers
   - Proxy server for preview iframes
   - Dependency installation (npm/yarn/pnpm)
   - Hot reload support
   - Port management

4. **Framework Scaffolding**
   - `create-next-app@latest` for Next.js
   - `create-react-app` for React
   - `@angular/cli` for Angular
   - `npm create vue@latest` for Vue
   - `npm create svelte@latest` for Svelte
   - Custom templates for professional designs

5. **Agent Tools (Auth-Gated)**
   - `checkAuth` - Verify user is authenticated
   - `scaffoldProject` - Create framework project
   - `installDependencies` - Install npm packages
   - `updateFile` - Modify files in builder project
   - `createFile` - Create new files
   - `deleteFile` - Delete files
   - `runBuild` - Build the app
   - `startPreview` - Start preview server

## Data Model

### Builder Projects (Appwrite Collection)
```
{
  id: string
  userId: string (required - auth gated)
  name: string
  description: string
  framework: 'nextjs' | 'react' | 'angular' | 'vue' | 'svelte'
  status: 'scaffolding' | 'building' | 'ready' | 'error'
  previewUrl: string
  previewPort: number
  projectPath: string (local file system path)
  files: ProjectFile[]
  createdAt: timestamp
  updatedAt: timestamp
}
```

## Implementation Phases

### Phase 1: Foundation
- [x] Remove cleanup API key requirement (optional)
- [ ] Create `/builder` landing page
- [ ] Framework selection component
- [ ] Auth gate middleware
- [ ] Builder project data model

### Phase 2: Scaffolding
- [ ] Framework scaffolding API endpoints
- [ ] File system management for projects
- [ ] Project initialization flow
- [ ] Template system

### Phase 3: Preview System
- [ ] Preview server/proxy
- [ ] Port management
- [ ] Dev server spawning
- [ ] Hot reload integration

### Phase 4: Agent Integration
- [ ] Auth verification webhook
- [ ] Builder-specific tools for agents
- [ ] Real-time file updates
- [ ] Dependency installation via agents

### Phase 5: Polish
- [ ] Professional templates
- [ ] Error handling
- [ ] Loading states
- [ ] Documentation

## Technical Considerations

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
- Store projects in `/tmp` or dedicated directory
- Use UUIDs for project directories
- Cleanup old projects periodically
- Support multiple concurrent builds

### Security
- Auth-gate all builder routes
- Validate file paths (prevent directory traversal)
- Sandbox preview servers
- Rate limit scaffold requests

## Next Steps

1. Start with landing page (`/builder`)
2. Implement auth gate
3. Create scaffolding API
4. Build preview system
5. Integrate with agents

