# Reviewable Markdown

在浏览器中预览 Markdown 文件，在任意选中文字上留**行内评审意见**，然后把意见**一键复制给 AI**，让它在下一轮迭代中修改文档。

评论保存在浏览器 IndexedDB 中。通过本地服务器路径（`?path=/absolute/file.md`）打开文档后，刷新页面会重新读取磁盘上的最新内容，同时保留已有评论。

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

## Agent Skill 安装

### 公司内网（Shopee）

```bash
npx --registry=https://npm.shopee.io/ @foody/reviewable-md install-skill
```

安装后，AI Agent 可以通过以下命令打开最新生成或修改的 Markdown 文件：

```bash
npx --registry=https://npm.shopee.io/ @foody/reviewable-md@latest open "/absolute/path/to/file.md"
```

### 外网

```bash
npx reviewable-md install-skill
```

安装后，AI Agent 可以通过以下命令打开最新生成或修改的 Markdown 文件：

```bash
npx reviewable-md@latest open "/absolute/path/to/file.md"
```

skill 文件会写入：

```text
~/.claude/skills/reviewable-md
~/.codex/skills/reviewable-md
```

`open` 命令会在需要时启动一个本地后台 daemon，后续文件复用同一个 daemon，并在浏览器中打开对应的 `?path=...` URL。

## 工作原理

- **前端** — Vite + React，使用 `react-markdown` + GFM 渲染 markdown。选区通过*文本引用锚点*（quote + 上下文）定位，高亮在重新渲染后仍然有效。
- **本地服务器** — `server/cli.js` 提供静态服务，并暴露 `GET /api/document?path=<绝对路径>` 接口，刷新时从磁盘加载最新内容。
- **存储** — 评论保存在 IndexedDB，以文件绝对路径为 key。

## 构建

```bash
npm run build                  # 输出到 dist/
npm run preview                # 通过 server/cli.js 预览构建产物
```

## 发布

```bash
npm run publish:npm            # 发布到 https://registry.npmjs.org/
npm run publish:shopee         # 发布到 https://npm.shopee.io/
npm run publish:all            # 同时发布到两个 registry
```

英文文档见 [README.en.md](./README.en.md)。
