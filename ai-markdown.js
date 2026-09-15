import { marked } from 'https://cdn.jsdelivr.net/npm/marked@15.0.7/+esm';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/+esm';

// Render assistant messages as Markdown while keeping user messages as plain text.
// This runs independently of the chat renderer so existing chat history is upgraded
// automatically without changing the stored message format.

marked.setOptions({
    breaks: true,
    gfm: true
});

function renderAssistantMarkdown(bubble) {
    if (!bubble || bubble.dataset.markdownRendered === 'true') return;

    const source = bubble.textContent || '';
    if (!source.trim()) {
        bubble.dataset.markdownRendered = 'true';
        return;
    }

    const rendered = marked.parse(source);
    bubble.innerHTML = DOMPurify.sanitize(rendered, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ['target', 'rel']
    });

    bubble.querySelectorAll('a').forEach(link => {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    });

    bubble.dataset.markdownRendered = 'true';
}

function renderAllAssistantMessages(root) {
    if (!root) return;
    root.querySelectorAll('.ai-chat-bubble-row.assistant .ai-chat-bubble').forEach(renderAssistantMarkdown);
}

function installMarkdownViewer() {
    const root = document.getElementById('ai-chat-messages');
    if (!root) return false;

    renderAllAssistantMessages(root);

    const observer = new MutationObserver(() => {
        renderAllAssistantMessages(root);
    });

    observer.observe(root, { childList: true, subtree: true });
    return true;
}

function installMarkdownStyles() {
    if (document.getElementById('kairos-ai-markdown-styles')) return;

    const style = document.createElement('style');
    style.id = 'kairos-ai-markdown-styles';
    style.textContent = `
        .ai-chat-bubble.ai-markdown,
        .ai-chat-bubble {
            overflow-wrap: anywhere;
        }

        .ai-chat-bubble-row.assistant .ai-chat-bubble p {
            margin: 0 0 0.8em;
        }

        .ai-chat-bubble-row.assistant .ai-chat-bubble p:last-child {
            margin-bottom: 0;
        }

        .ai-chat-bubble-row.assistant .ai-chat-bubble h1,
        .ai-chat-bubble-row.assistant .ai-chat-bubble h2,
        .ai-chat-bubble-row.assistant .ai-chat-bubble h3,
        .ai-chat-bubble-row.assistant .ai-chat-bubble h4,
        .ai-chat-bubble-row.assistant .ai-chat-bubble h5,
        .ai-chat-bubble-row.assistant .ai-chat-bubble h6 {
            margin: 1em 0 0.45em;
            line-height: 1.3;
        }

        .ai-chat-bubble-row.assistant .ai-chat-bubble h1:first-child,
        .ai-chat-bubble-row.assistant .ai-chat-bubble h2:first-child,
        .ai-chat-bubble-row.assistant .ai-chat-bubble h3:first-child {
            margin-top: 0;
        }

        .ai-chat-bubble-row.assistant .ai-chat-bubble ul,
        .ai-chat-bubble-row.assistant .ai-chat-bubble ol {
            margin: 0.5em 0 0.8em;
            padding-left: 1.5em;
        }

        .ai-chat-bubble-row.assistant .ai-chat-bubble li {
            margin: 0.25em 0;
        }

        .ai-chat-bubble-row.assistant .ai-chat-bubble blockquote {
            margin: 0.8em 0;
            padding: 0.5em 0.9em;
            border-left: 3px solid var(--accent-glow);
            color: var(--text-muted);
            background: var(--accent-glow-soft);
            border-radius: 0 6px 6px 0;
        }

        .ai-chat-bubble-row.assistant .ai-chat-bubble code {
            padding: 0.15em 0.35em;
            border-radius: 4px;
            background: var(--bg-main);
            border: 1px solid var(--border-subtle);
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.88em;
        }

        .ai-chat-bubble-row.assistant .ai-chat-bubble pre {
            margin: 0.8em 0;
            padding: 12px;
            overflow-x: auto;
            border-radius: 8px;
            background: var(--bg-main);
            border: 1px solid var(--border-subtle);
        }

        .ai-chat-bubble-row.assistant .ai-chat-bubble pre code {
            padding: 0;
            border: 0;
            background: transparent;
            white-space: pre;
        }

        .ai-chat-bubble-row.assistant .ai-chat-bubble a {
            color: var(--accent-glow);
            text-decoration: underline;
            text-underline-offset: 2px;
        }

        .ai-chat-bubble-row.assistant .ai-chat-bubble strong {
            font-weight: 700;
        }

        .ai-chat-bubble-row.assistant .ai-chat-bubble hr {
            border: 0;
            border-top: 1px solid var(--border-subtle);
            margin: 1em 0;
        }

        .ai-chat-bubble-row.assistant .ai-chat-bubble table {
            width: 100%;
            border-collapse: collapse;
            margin: 0.8em 0;
            font-size: 0.92em;
        }

        .ai-chat-bubble-row.assistant .ai-chat-bubble th,
        .ai-chat-bubble-row.assistant .ai-chat-bubble td {
            padding: 7px 9px;
            border: 1px solid var(--border-subtle);
            text-align: left;
        }

        .ai-chat-bubble-row.assistant .ai-chat-bubble th {
            background: var(--bg-main);
            font-weight: 700;
        }
    `;
    document.head.appendChild(style);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        installMarkdownStyles();
        installMarkdownViewer();
    }, { once: true });
} else {
    installMarkdownStyles();
    installMarkdownViewer();
}
