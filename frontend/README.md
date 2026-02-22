# VibeCoder - AI-Powered IDE

A modern, AI-powered integrated development environment built with Next.js, featuring real-time voice conversations, intelligent code generation, and a Cursor-like experience.

## Features

### 🎯 Core IDE Features
- **Multi-file Editor**: Monaco editor with syntax highlighting and IntelliSense
- **File Management**: Create, rename, delete files and folders
- **Project Management**: Multiple projects with UUID-based identification
- **Dirty State Tracking**: Visual indicators for unsaved changes
- **Tab System**: Multi-file tabs with close functionality
- **Theme Support**: Light/dark mode with real-time switching

### 🤖 AI Coding Assistant
- **Text Chat**: Conversational AI for code generation and debugging
- **Live Voice**: Voice conversation with visual orb feedback
- **Code Actions**: Generate, update, and delete code files
- **Context Awareness**: Understands current file and project structure
- **Conversation Memory**: Thread-based chat history
- **Multiple AI Providers**: Groq (free) and OpenAI support

### 🎨 Visual Experience
- **Reactive Orb**: Audio-responsive visualizer for voice calls
- **Video Orbs**: Multiple animated orb options
- **Modern UI**: Clean, professional interface with shadcn/ui
- **Responsive Design**: Works on different screen sizes

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript
- **UI**: shadcn/ui, Tailwind CSS, Radix UI
- **Editor**: Monaco Editor
- **AI**: LangChain, Groq, OpenAI
- **Graphics**: OGL for WebGL orb effects
- **Storage**: LocalStorage for project persistence

## Getting Started

### Prerequisites
- Node.js 18+ 
- pnpm (recommended) or npm

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd vibecoder
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here
   ```

4. **Get a free Groq API key**
   - Go to [console.groq.com](https://console.groq.com/)
   - Sign up for a free account
   - Generate an API key
   - Add it to your `.env.local` file

5. **Run the development server**
   ```bash
   pnpm dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

### Basic IDE Operations
- **Create Project**: Click "New Project" in the top bar
- **Open Project**: Click "Open..." to see all projects
- **Create Files**: Use the "New File" input in the sidebar
- **Create Folders**: Use the "New Folder" input in the sidebar
- **Edit Code**: Click on files to open them in the editor
- **Save Changes**: Press `Ctrl+S` (or `Cmd+S` on Mac)

### AI Assistant
- **Text Chat**: Switch to "Text Chat" tab in the AI panel
- **Ask Questions**: Type your coding questions or requests
- **Generate Code**: Ask the AI to create new files or functions
- **Fix Bugs**: Describe issues and get solutions
- **Voice Call**: Switch to "Live Call" tab for voice conversations

### Code Actions
When the AI suggests code changes, you'll see action buttons:
- **Apply**: Execute the suggested code change
- **Create**: Generate new files
- **Update**: Modify existing files
- **Delete**: Remove files

## API Endpoints

### Chat API
- `POST /api/chat` - Send messages to AI
- `GET /api/chat?threadId=<id>` - Get conversation history

### Thread API
- `POST /api/thread` - Create new conversation thread
- `GET /api/thread?threadId=<id>` - Get thread details

## Project Structure

```
src/
├── app/
│   ├── api/           # API routes
│   ├── [id]/          # Dynamic project pages
│   └── page.tsx       # Home page
├── components/
│   ├── ide/           # IDE components
│   ├── ui/            # shadcn/ui components
│   ├── CallPanel.tsx  # AI assistant panel
│   ├── Orb.tsx        # WebGL orb visualizer
│   └── VideoOrb.tsx   # Video orb component
├── lib/
│   ├── ai-service.ts  # AI service with LangChain
│   ├── projects.ts    # Project management
│   └── utils.ts       # Utility functions
└── hooks/             # React hooks
```

## AI Service Configuration

The AI service supports both Groq and OpenAI:

```typescript
// Switch between providers
aiService.switchToGroq();    // Free tier
aiService.switchToOpenAI();  // Requires credits
```

### Supported Models
- **Groq**: `llama-3.1-70b-versatile` (free)
- **OpenAI**: `gpt-4o` (paid)

## Development

### Adding New Features
1. Create components in `src/components/`
2. Add API routes in `src/app/api/`
3. Update project management in `src/lib/projects.ts`
4. Extend AI service in `src/lib/ai-service.ts`

### Code Generation
The AI can generate code in any language and automatically:
- Create new files
- Update existing files
- Delete files
- Provide explanations

### Voice Integration
The voice system uses:
- WebRTC for microphone access
- Audio analysis for orb animation
- Real-time audio level detection

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Check the GitHub issues
- Review the documentation
- Contact the development team

---

Built with ❤️ using Next.js, LangChain, and modern web technologies.