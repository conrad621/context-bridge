const translations = {
  en: {
    "meta.description": "Context Bridge is a local-first coding-agent session bridge for moving, copying, and syncing session context across Claude Code, Codex, and MCP tools.",
    "document.title": "Context Bridge - Coding agent session context bridge",
    "nav.aria": "Primary navigation",
    "brand.aria": "Context Bridge home",
    "nav.linksAria": "Page navigation",
    "language.aria": "Language",
    "nav.pain": "Pain",
    "nav.workflow": "Workflow",
    "nav.cases": "Cases",
    "nav.guide": "Guide",
    "nav.features": "Capabilities",
    "nav.commands": "Commands",
    "hero.eyebrow": "Local-first session bridge",
    "hero.title": "Bridge coding-agent sessions without losing context.",
    "hero.lede": "Translate, copy, and sync Claude Code and Codex session history without losing the operational trail.",
    "hero.start": "Start using it",
    "hero.npm": "View npm",
    "panel.aria": "Session conversion example",
    "proof.aria": "Core traits",
    "proof.local.title": "Local first",
    "proof.local.body": "No hosted service required",
    "proof.twoWay.title": "Bidirectional",
    "proof.twoWay.body": "Claude Code and Codex",
    "proof.mcp.title": "MCP ready",
    "proof.mcp.body": "Structured session tools",
    "workflow.eyebrow": "Why it matters",
    "workflow.title": "A session is not a chat log. It is the worksite.",
    "workflow.body": "Coding-agent sessions include intent, assistant output, tool calls, shell commands, file operations, working directories, timestamps, and titles. Context Bridge normalizes that trace into a shared model, then renders it into a format the next tool can resume.",
    "pain.eyebrow": "Pain points",
    "pain.title": "The hard part of multi-agent work is not launching another CLI.",
    "pain.body": "The cost shows up after the switch: context fragments, traces break, and you start explaining the same work again. Context Bridge targets that hidden handoff cost.",
    "pain.gridAria": "Project pain points",
    "pain.card1.title": "Context is locked inside private formats",
    "pain.card1.body": "Claude Code and Codex both write JSONL, but their event structures differ. Switching tools usually means copying a summary by hand.",
    "pain.card2.title": "Tool calls and file operations are hard to carry over",
    "pain.card2.body": "A real coding session includes shell commands, patches, file reads, working directories, and errors. Plain chat export is not enough.",
    "pain.card3.title": "Manual handoff gets less reliable over time",
    "pain.card3.body": "Long tasks, multi-day work, and reviews can miss critical commands or decisions when the handoff is written from memory.",
    "pain.card4.title": "Automatic sync can create duplicate chains",
    "pain.card4.body": "Without provenance, generated sessions can be translated again and again, polluting local history.",
    "flows.aria": "Three usage paths",
    "flows.translate": "Create a marked migration session that can later be cleaned, deduped, and skipped as a future sync source.",
    "flows.copy": "Create a one-shot native-looking target session without sync tracking metadata.",
    "flows.sync": "Mirror recent native sessions in a deterministic way for long-running two-agent workflows.",
    "features.eyebrow": "Capabilities",
    "features.title": "Infrastructure for cross-agent coding workflows.",
    "features.ir": "Normalize harness-specific events into one shared Session model.",
    "features.adapters": "Claude Code and Codex each own clear ingest and render logic.",
    "features.provenance": "Generated sessions are identifiable, skippable, cleanable, and safe from looped translation.",
    "features.index": "List, inspect, and filter local sessions across harnesses.",
    "features.hooks": "Install Claude Code Stop hooks or Codex notify hooks for lightweight auto-sync.",
    "features.mcp": "Expose session lookup, translation, and resume-command preparation over stdio.",
    "cases.eyebrow": "Case tours",
    "cases.title": "Concrete places where the bridge fits.",
    "cases.case1.title": "Continue a half-finished task in another agent",
    "cases.case1.body": "Move a session after the discovery, implementation, and test history already exist, then let the next agent continue from that trace.",
    "cases.case2.title": "Reuse a strong investigation without sync metadata",
    "cases.case2.body": "Copy architecture notes, risk findings, file context, and command output into a fresh target session without marking it as generated.",
    "cases.case3.title": "Switch between two CLI agents every day",
    "cases.case3.body": "Use sync or watch to mirror recent native sessions while fingerprints and source markers prevent duplicate chains.",
    "cases.case4.title": "Expose session operations to MCP automation",
    "cases.case4.body": "Let MCP hosts list sessions, trigger conversion, and receive executable resume commands without hard-coding local agent paths.",
    "cases.case5.title": "Keep a traceable review chain before release",
    "cases.case5.body": "Let one agent implement and another review while the generated target session keeps source metadata for later audit.",
    "cases.case6.title": "Clean migration artifacts from local history",
    "cases.case6.body": "Use dry-run cleanup and dedupe commands to inspect generated sessions before removing confirmed migration artifacts.",
    "guide.eyebrow": "Usage guide",
    "guide.title": "Start with the conservative path.",
    "guide.body": "List sessions first, then run a smoke check. Once the direction and resume command look right, choose translate, copy, or sync.",
    "guide.step1.title": "Install the CLI",
    "guide.step1.body": "Global installation gives you both <code>context-bridge</code> and the short <code>ctxb</code> alias.",
    "guide.step2.title": "Find the session to move",
    "guide.step2.body": "Start with a short time window, then widen <code>--days</code> if needed.",
    "guide.step3.title": "Run a smoke check first",
    "guide.step3.body": "Smoke verifies conversion and prints the resume command without running a live model.",
    "guide.step4.title": "Choose migration, copy, or sync",
    "guide.step4.body": "Use translate for traceable migration, copy for a clean independent start, and sync or watch for long-term mirroring.",
    "guide.step5.title": "Run the printed resume command",
    "guide.step5.body": "Translate prints the target agent resume command. Replace the prompt with your next task and continue.",
    "guide.notesAria": "Usage recommendations",
    "guide.notes.title": "Choosing well",
    "guide.notes.traceable.term": "Keep source relation",
    "guide.notes.traceable.desc": "Use <code>translate</code>. Generated sessions are marked for cleanup, dedupe, and loop prevention.",
    "guide.notes.copy.term": "Copy once",
    "guide.notes.copy.desc": "Use <code>copy</code>. It skips tracking metadata and works better as a native new starting point.",
    "guide.notes.mirror.term": "Mirror recent work",
    "guide.notes.mirror.desc": "Use <code>sync</code> or <code>watch</code>, and start with a short <code>--days</code> range.",
    "commands.eyebrow": "CLI first",
    "commands.title": "A few commands move context to the next tool.",
    "commands.body": "The primary command is <code>context-bridge</code>, with <code>ctxb</code> as a shorter alias. Core operations are local file reads and writes.",
    "commands.tabsAria": "Command examples",
    "commands.tab.move": "Move",
    "commands.tab.copy": "Copy",
    "commands.tab.sync": "Sync",
    "install.eyebrow": "Install",
    "install.title": "Install from npm."
  },
  "zh-CN": {
    "meta.description": "Context Bridge 是一个本地优先的编码 Agent 会话桥接工具，用于在 Claude Code、Codex 和 MCP 工具之间迁移、复制和同步会话上下文。",
    "document.title": "Context Bridge - 跨 Agent 会话上下文桥接",
    "nav.aria": "主导航",
    "brand.aria": "Context Bridge 首页",
    "nav.linksAria": "页面导航",
    "language.aria": "语言",
    "nav.pain": "痛点",
    "nav.workflow": "工作流",
    "nav.cases": "案例",
    "nav.guide": "引导",
    "nav.features": "能力",
    "nav.commands": "命令",
    "hero.eyebrow": "Local-first session bridge",
    "hero.title": "跨编码 Agent 无缝迁移会话上下文。",
    "hero.lede": "Context Bridge 在 Claude Code、Codex 和 MCP 工具之间转换 JSONL 会话历史，保留足够的操作轨迹，让你换工具时不用丢掉上下文。",
    "hero.start": "开始使用",
    "hero.npm": "查看 npm",
    "panel.aria": "会话转换示意",
    "proof.aria": "核心特性",
    "proof.local.title": "本地优先",
    "proof.local.body": "不依赖托管服务",
    "proof.twoWay.title": "双向转换",
    "proof.twoWay.body": "Claude Code 与 Codex",
    "proof.mcp.title": "MCP 可调用",
    "proof.mcp.body": "结构化 session 工具",
    "workflow.eyebrow": "Why it matters",
    "workflow.title": "会话不是聊天记录，而是工作现场。",
    "workflow.body": "编码 Agent 的 session 里包含用户意图、工具调用、shell 命令、文件操作、工作目录、时间戳和标题。Context Bridge 把这些轨迹规范化成统一模型，再渲染到目标工具可以恢复的格式。",
    "pain.eyebrow": "Pain points",
    "pain.title": "多 Agent 工作流最痛的，不是启动新工具。",
    "pain.body": "真正的损耗发生在切换之后：上下文散了、轨迹断了、重复解释开始了。Context Bridge 处理的是这段隐形成本。",
    "pain.gridAria": "项目痛点",
    "pain.card1.title": "上下文被锁在各自格式里",
    "pain.card1.body": "Claude Code 和 Codex 都记录 JSONL，但结构不同。换工具时，历史通常只能靠复制摘要。",
    "pain.card2.title": "工具调用和文件操作很难带走",
    "pain.card2.body": "一次真实编码会话包含 shell、patch、读写文件、工作目录和错误输出，纯聊天导出不够恢复现场。",
    "pain.card3.title": "交接靠人工整理，越久越不可靠",
    "pain.card3.body": "长任务、跨天任务、多人协作时，手写 handoff 容易漏掉关键命令和决策路径。",
    "pain.card4.title": "自动同步容易生成重复链",
    "pain.card4.body": "如果不知道哪些 session 是生成物，批量同步会把迁移产物再次迁移，污染本地历史。",
    "flows.aria": "三种使用路径",
    "flows.translate": "生成带来源标记的迁移 session，后续可清理、去重，并避免被再次链式同步。",
    "flows.copy": "一次性复制成新的目标 Agent session，不写入同步追踪元数据，表现更接近原生会话。",
    "flows.sync": "扫描最近原生 session，按方向批量生成确定性目标 session，适合长期双工具工作流。",
    "features.eyebrow": "Capabilities",
    "features.title": "为跨 Agent 工作流准备的基础设施。",
    "features.ir": "把不同 harness 的事件规范化成统一 Session 模型，减少格式耦合。",
    "features.adapters": "Claude Code 和 Codex 各自维护 ingest/render 逻辑，转换路径清晰可扩展。",
    "features.provenance": "生成 session 可识别、可跳过、可清理，避免同步循环和重复链路。",
    "features.index": "跨 harness 列出、查看和筛选本地 session，快速找到要迁移的上下文。",
    "features.hooks": "支持 Claude Code Stop hook 与 Codex notify hook，轻量触发自动同步。",
    "features.mcp": "通过 stdio 暴露 session 查询、转换和恢复命令准备能力。",
    "cases.eyebrow": "Case tours",
    "cases.title": "更具体的使用场景，一眼看懂它该放在哪里。",
    "cases.case1.title": "长任务做到一半，换 Agent 继续收尾",
    "cases.case1.body": "已经完成需求理解、文件搜索、局部实现和几轮测试后，可以把当前 session 转给下一个 Agent 继续。",
    "cases.case2.title": "复用一次高质量调研，但不建立同步关系",
    "cases.case2.body": "把架构约束、关键文件、风险点和命令结果复制成新的目标会话，但不标记为生成物。",
    "cases.case3.title": "每天在两个 CLI Agent 之间切换",
    "cases.case3.body": "sync/watch 会扫描最近原生 session，并用 fingerprint 和来源标记避免重复生成与链式迁移。",
    "cases.case4.title": "把 session 能力交给 MCP 自动化工具",
    "cases.case4.body": "MCP host 可以列出会话、触发转换，并拿到可执行的恢复命令，而不用硬编码本地 agent 路径。",
    "cases.case5.title": "发布前保留可追溯的审查链路",
    "cases.case5.body": "一个 Agent 完成实现后，另一个 Agent 负责 code review、风险复核和验收记录，目标 session 会保留来源元数据。",
    "cases.case6.title": "清理迁移产物，保持本地历史干净",
    "cases.case6.body": "先用 dry-run 查看 clean 和 dedupe 会处理哪些生成 session，再删除确认过的迁移产物。",
    "guide.eyebrow": "Usage guide",
    "guide.title": "第一次使用，从保守路径开始。",
    "guide.body": "推荐先列出会话，再 smoke 预检转换结果。确认恢复命令和目标方向都正确后，再执行 translate、copy 或 sync。",
    "guide.step1.title": "安装 CLI",
    "guide.step1.body": "全局安装后同时获得 <code>context-bridge</code> 和短别名 <code>ctxb</code>。",
    "guide.step2.title": "找到要迁移的 session",
    "guide.step2.body": "先用较短时间窗口浏览最近会话，必要时再扩大 <code>--days</code>。",
    "guide.step3.title": "先做 smoke 预检",
    "guide.step3.body": "smoke 会验证转换并打印恢复命令，不执行真实模型，也不需要立即切换工具。",
    "guide.step4.title": "选择迁移、复制或同步",
    "guide.step4.body": "需要可追踪迁移用 translate；需要干净独立起点用 copy；需要长期镜像用 sync/watch。",
    "guide.step5.title": "执行输出的 resume 命令",
    "guide.step5.body": "translate 会输出目标 Agent 的恢复命令。把提示词替换成下一步任务即可继续工作。",
    "guide.notesAria": "使用建议",
    "guide.notes.title": "选择建议",
    "guide.notes.traceable.term": "想保留来源关系",
    "guide.notes.traceable.desc": "用 <code>translate</code>。生成物会被标记，便于清理、去重和避免循环。",
    "guide.notes.copy.term": "只想复制一次",
    "guide.notes.copy.desc": "用 <code>copy</code>。它不写追踪元数据，更适合作为新的原生起点。",
    "guide.notes.mirror.term": "想自动镜像最近会话",
    "guide.notes.mirror.desc": "用 <code>sync</code> 或 <code>watch</code>，并从较短 <code>--days</code> 开始。",
    "commands.eyebrow": "CLI first",
    "commands.title": "几个命令，把上下文带到下一个工具。",
    "commands.body": "主命令是 <code>context-bridge</code>，同时提供更短的 <code>ctxb</code> 别名。所有核心能力都围绕本地文件读写完成。",
    "commands.tabsAria": "命令示例",
    "commands.tab.move": "迁移",
    "commands.tab.copy": "复制",
    "commands.tab.sync": "同步",
    "install.eyebrow": "Install",
    "install.title": "从 npm 安装。"
  }
};

const languageStorageKey = "context-bridge-language";
const supportedLanguages = Object.keys(translations);

function preferredLanguage() {
  const stored = localStorage.getItem(languageStorageKey);
  return supportedLanguages.includes(stored) ? stored : "en";
}

function applyLanguage(language) {
  const dictionary = translations[language] ?? translations.en;

  document.documentElement.lang = language;
  document.title = dictionary["document.title"];

  for (const element of document.querySelectorAll("[data-i18n]")) {
    const key = element.getAttribute("data-i18n");
    if (key && dictionary[key]) {
      element.innerHTML = dictionary[key];
    }
  }

  for (const element of document.querySelectorAll("[data-i18n-content]")) {
    const key = element.getAttribute("data-i18n-content");
    if (key && dictionary[key]) {
      element.setAttribute("content", dictionary[key]);
    }
  }

  for (const element of document.querySelectorAll("[data-i18n-aria-label]")) {
    const key = element.getAttribute("data-i18n-aria-label");
    if (key && dictionary[key]) {
      element.setAttribute("aria-label", dictionary[key]);
    }
  }

  for (const button of document.querySelectorAll("[data-language]")) {
    const selected = button.getAttribute("data-language") === language;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
}

for (const button of document.querySelectorAll("[data-language]")) {
  button.addEventListener("click", () => {
    const language = button.getAttribute("data-language");
    if (!supportedLanguages.includes(language)) {
      return;
    }

    localStorage.setItem(languageStorageKey, language);
    applyLanguage(language);
  });
}

const tabGroups = document.querySelectorAll("[data-tabs]");

for (const group of tabGroups) {
  const tabs = group.querySelectorAll("[data-tab]");
  const panels = group.querySelectorAll("[data-panel]");

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");

      for (const item of tabs) {
        const selected = item === tab;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-selected", String(selected));
      }

      for (const panel of panels) {
        panel.hidden = panel.getAttribute("data-panel") !== target;
      }
    });
  }
}

applyLanguage(preferredLanguage());
