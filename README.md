# Reviewable Markdown

在浏览器中预览 Markdown 文件，在任意选中文字上留**行内评审意见**，然后把意见**一键复制给 AI**，让它在下一轮迭代中修改文档。

评论保存在浏览器本地，刷新页面不会丢失。打开文档后，刷新会重新读取磁盘上的最新内容，同时保留已有评论。

## Agent Skill 安装

### 公司内网（Shopee）

```bash
npx --registry=https://npm.shopee.io/ @foody/reviewable-md install-skill
```

### 外网

```bash
npx reviewable-md install-skill
```

skill 文件会写入：

```text
~/.claude/skills/reviewable-md
~/.codex/skills/reviewable-md
```

## Skill 使用方法

安装完成后，每当 AI Agent（如 Claude Code）生成或修改了 `.md` 文件，它会自动调用 skill 在浏览器中打开该文件。你可以直接在页面上留评论，然后点击 **Copy Prompt** 将评论复制给 AI，让它继续修改。

也可以手动触发，在对话中告诉 Agent：

> 用 reviewable-md 打开这个文件

## 快速开始

### 公司内网（Shopee）

```bash
npm install --registry=https://npm.shopee.io/ @foody/reviewable-md
npm run dev                    # 在 http://localhost:27175 打开默认页面
npm run dev -- sample.md       # 打开 sample.md 并将路径持久化到 URL
```

### 外网

```bash
npm install reviewable-md
npm run dev                    # 在 http://localhost:27175 打开默认页面
npm run dev -- sample.md       # 打开 sample.md 并将路径持久化到 URL
```

在浏览器中：

1. 输入本地 `.md` 文件的绝对路径，点击 **Open path**。
2. 在渲染后的文档中**选中文字**，弹出评论框，写下备注后按 **⌘+Enter** 保存。
3. 评论会在文档中高亮显示，并列在侧边栏。
4. 点击 **Copy Prompt** 将所有未解决的评论复制为结构化 prompt，粘贴给 AI 修改文档，刷新后继续评审。

### Copy Source

**Copy Source** 支持将文档导出为不同格式：

- **Markdown** — 去除 front matter 的原始 markdown，可粘贴到任何支持 markdown 的地方。
- **Confluence** — 在 Confluence 编辑页面，点击右上角 **···** → **Open in Source Editor**，然后粘贴。
- **Share Link** — 复制 `http://<局域网IP>:<端口>/?path=...`，局域网内的同事可以直接打开相同的文档。

英文文档见 [README.en.md](./README.en.md)。
