import { marked } from 'https://cdn.jsdelivr.net/npm/marked@15.0.7/+esm';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/+esm';

marked.setOptions({ breaks: true, gfm: true });

function renderAssistantMarkdown(bubble) {
    if (!bubble || bubble.dataset.markdownRendered === 'true') return;
    const source = bubble.textContent || '';
    if (!source.trim()) {
        bubble.dataset.markdownRendered = 'true';
        return;
    }

    bubble.innerHTML = DOMPurify.sanitize(marked.parse(source), {
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
    const observer = new MutationObserver(() => renderAllAssistantMessages(root));
    observer.observe(root, { childList: true, subtree: true });
    return true;
}

function installMarkdownStyles() {
    if (document.getElementById('kairos-ai-markdown-styles')) return;
    const style = document.createElement('style');
    style.id = 'kairos-ai-markdown-styles';
    style.textContent = `
        .ai-chat-bubble { overflow-wrap: anywhere; }

        /* Balanced Markdown typography for readable AI responses. */
        .ai-chat-bubble-row.assistant .ai-chat-bubble {
            white-space: normal;
            line-height: 1.46;
        }
        .ai-chat-bubble-row.assistant .ai-chat-bubble p {
            margin: 0 0 0.28em;
        }
        .ai-chat-bubble-row.assistant .ai-chat-bubble p:last-child { margin-bottom: 0; }

        .ai-chat-bubble-row.assistant .ai-chat-bubble h1,
        .ai-chat-bubble-row.assistant .ai-chat-bubble h2,
        .ai-chat-bubble-row.assistant .ai-chat-bubble h3,
        .ai-chat-bubble-row.assistant .ai-chat-bubble h4,
        .ai-chat-bubble-row.assistant .ai-chat-bubble h5,
        .ai-chat-bubble-row.assistant .ai-chat-bubble h6 {
            margin: 0.45em 0 0.15em;
            line-height: 1.25;
        }
        .ai-chat-bubble-row.assistant .ai-chat-bubble h1:first-child,
        .ai-chat-bubble-row.assistant .ai-chat-bubble h2:first-child,
        .ai-chat-bubble-row.assistant .ai-chat-bubble h3:first-child { margin-top: 0; }

        .ai-chat-bubble-row.assistant .ai-chat-bubble ul,
        .ai-chat-bubble-row.assistant .ai-chat-bubble ol {
            margin: 0.2em 0 0.3em;
            padding-left: 1.5em;
        }
        .ai-chat-bubble-row.assistant .ai-chat-bubble li { margin: 0.05em 0; }

        .ai-chat-bubble-row.assistant .ai-chat-bubble blockquote {
            margin: 0.3em 0;
            padding: 0.25em 0.65em;
            border-left: 3px solid var(--accent-glow);
            color: var(--text-muted);
            background: var(--accent-glow-soft);
            border-radius: 0 6px 6px 0;
        }

        .ai-chat-bubble-row.assistant .ai-chat-bubble code {
            padding: 0.06em 0.28em;
            border-radius: 4px;
            background: var(--bg-main);
            border: 1px solid var(--border-subtle);
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.88em;
        }
        .ai-chat-bubble-row.assistant .ai-chat-bubble pre {
            margin: 0.3em 0;
            padding: 8px;
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
        .ai-chat-bubble-row.assistant .ai-chat-bubble hr {
            border: 0;
            border-top: 1px solid var(--border-subtle);
            margin: 0.35em 0;
        }
        .ai-chat-bubble-row.assistant .ai-chat-bubble table {
            width: 100%;
            border-collapse: collapse;
            margin: 0.3em 0;
            font-size: 0.92em;
        }
        .ai-chat-bubble-row.assistant .ai-chat-bubble th,
        .ai-chat-bubble-row.assistant .ai-chat-bubble td {
            padding: 4px 7px;
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
