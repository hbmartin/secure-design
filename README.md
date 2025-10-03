# 🎨 SecureDesign — AI Design Agent for Your IDE

## 🧐 How is SecureDesign different?

- 🔒 **Security First**: Does not publicly leak your prompts and mocks
- 🙈 **100% Private**: No email registration or data collection
- 🖥️ **Local / Offline Models**: First class support for LM Studio, Ollama, etc.
- ⛓️‍💥 **Fully OSS, no enterprise license**: SecureDesign will never use non-OSS code
- ↗️ **Up-to-date dependencies**: Always uses the latest AI and other libraries
- 🧑‍🧑‍🧒‍🧒 **Community Driven**: No business pressures, quickly merged PRs

## 🚀 Links

- 🪟 [VS Code Marketplace install](https://marketplace.visualstudio.com/items?itemName=HaroldMartin.securedesign)
- 💞 [Open VSX Registry install](https://open-vsx.org/extension/HaroldMartin/securedesign)
- ⚙️ [DeepWiki architecture description / diagrams](https://deepwiki.com/hbmartin/secure-design)

![Cover](media/cover.png)

SuperDesign is the first **open-source design agent** that lives right inside your IDE.  
Generate UI mockups, components, and wireframes directly from natural language prompts.  
Works seamlessly with Cursor, Windsurf, Claude Code, and plain VS Code.

> ✨ "Why design one option when you can explore ten?" — SuperDesign

---

## 🎬 Demo Video (Click to play)

[![Demo](https://img.youtube.com/vi/INv6oZDhhUM/maxresdefault.jpg)](https://youtu.be/INv6oZDhhUM)

---

## 🚀 Features

- 🖼️ **Product Mock**: Instantly generate full UI screens from a single prompt
- 🧩 **UI Components**: Create reusable components you can drop into your code
- 📝 **Wireframes**: Explore low-fidelity layouts for fast iteration
- 🔁 **Fork & Iterate**: Duplicate and evolve designs easily
- 📥 **Prompt-to-IDE**: Copy prompts into your favorite AI IDE (Cursor, Windsurf, Claude Code)

---

## 🛠️ Getting Started

1. **Install the Extension** from the Cursor/VS Code Marketplace
2. Open the `SecureDesign` sidebar panel
3. Type a prompt (e.g., _"Design a modern login screen"_)
4. View generated mockups, components, and wireframes
5. Fork, tweak, and paste into your project

---

## Using LMStudio

1. In the LMStudio `Developer` pane ensure that `Enable CORS` is turned ON in `⚙️ Settings`
2. If the server is not running turn on the toggle next to `Status: Stopped`. Alternately launch the server from the command line with `lms server start --cors`
3. LLMs served by LMStudio will appear under `Available Models`

Make sure to select a model that supports tool calling. If you are not running LMStudio at the default URL you must configure the URL in `+ Add Model Provider` > `LMStudio`.

## Using Ollama

1. Ensure the ollama server is running with `ollama serve`
2. Ensure that the model you wanted is loaded with `ollama run <model name>`
3. LLMs served by ollama will appear under `Available Models`

Make sure to select a model that supports tool calling. If you are not running ollama at the default URL you must configure the URL in `+ Add Model Provider` > `Ollama`.

## Can I use my own Claude Code or Cursor subscription?

Yes, after you initialise securedesign extension, some cursor/claude code rules will be added, so you can prompt the agent to do design and preview in securedesign canva (cmd + shift + p -> securedesign: open canva)

If using Cursor - I will highly suggest copy the prompt in 'design.mdc' and create a custom mode in cursor with that same system prompt; This should give you much better performance

## 📂 Where Are My Designs Stored?

Your generated designs are saved locally inside `.superdesign/`.

## ❓ FAQ

**Is it free and open source?**  
Yes! We are open source — fork it, extend it, remix it.

**Can I customize the design agent?**  
Yes — use your own prompt templates, modify behaviors, or add commands.

**Can SuperDesign update existing UI?**  
Absolutely — select a component, describe the change, and let the agent do the rest.

## Architecture

SecureDesign follows a modular architecture with clear separation of concerns between the VS Code extension host, AI providers, and webview interfaces.

### Key Architectural Features

- **Modular Design**: Clear separation between extension host logic, AI providers, and UI components
- **Dependency Injection**: ServiceContainer manages service lifecycles and dependencies
- **Multi-Provider Support**: Pluggable AI provider system with unified interface
- **Tool System**: Secure file operation tools with workspace context
- **Streaming Communication**: Real-time AI responses via WebView message passing
- **Workspace Isolation**: Chat history and designs scoped per workspace
- **State Management**: Persistent state across VS Code sessions
- **Canvas Integration**: Automatic design preview and iteration workflow

## 👯 Contributors

[![Profile images of all the contributors](https://contrib.rocks/image?repo=hbmartin/secure-design)](https://github.com/hbmartin/secure-design/graphs/contributors)
