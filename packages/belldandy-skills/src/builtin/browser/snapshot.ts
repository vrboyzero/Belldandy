
/**
 * 注入到页面的快照生成脚本
 * 注意：由于这是要注入到浏览器环境中执行的代码，不能引用外部依赖（除非打包进去），这里尽量保持纯 JS
 */
export const SNAPSHOT_SCRIPT = `
(function() {
    const ID_ATTR = 'data-agent-id';
    let idCounter = 1;
    const elementMap = new Map(); // id -> element (client side only)
    
    // 配置：哪些标签被认为是"容器"，哪些是"内容"
    const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'LABEL']);
    const CONTENT_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'LI', 'SPAN', 'DIV', 'TD', 'TH']);
    const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'svg', 'NOSCRIPT', 'IFRAME', 'LINK', 'META', 'HEAD']);

    function isVisible(el) {
        if (!el.getBoundingClientRect) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }

    function isInteractive(el) {
        if (INTERACTIVE_TAGS.has(el.tagName)) return true;
        if (el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link') return true;
        if (el.getAttribute('onclick') || el.onclick) return true; // Simple heuristic
        // Check for inputs
        if (el.tagName === 'INPUT' && el.type !== 'hidden') return true;
        return false;
    }

    function cleanupText(text) {
        return text ? text.replace(/\\s+/g, ' ').trim() : '';
    }

    function traverse(node, depth = 0) {
        if (!node) return '';
        if (node.nodeType === Node.TEXT_NODE) {
            const text = cleanupText(node.textContent);
            return text.length > 0 ? text : '';
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return '';
        const el = node;

        if (SKIPPED_TAGS.has(el.tagName) || !isVisible(el)) return '';

        const interactive = isInteractive(el);
        let output = '';

        // 分配 ID (只给交互元素或重要节点)
        let idStr = '';
        if (interactive) {
            const id = idCounter++;
            el.setAttribute(ID_ATTR, id);
            idStr = \`[\${id}] \`;
        }

        // 处理子节点
        let childrenOutput = '';
        for (const child of el.childNodes) {
            const childResult = traverse(child, depth + 1);
            if (childResult) {
                childrenOutput += (childrenOutput ? ' ' : '') + childResult;
            }
        }
        
        // 只有当本身是交互元素，或者包含有意义的文本/子元素时，才产生输出
        // 否则如果只是个纯容器且内容为空，就忽略
        const hasContent = childrenOutput.length > 0;
        
        if (interactive) {
            // 交互元素：[ID] <Tag Attributes>Content</Tag>
            // 简化属性
            let attrs = '';
            if (el.tagName === 'INPUT') {
                attrs += \` type="\${el.type}"\`;
                if (el.placeholder) attrs += \` placeholder="\${el.placeholder}"\`;
                if (el.value) attrs += \` value="\${el.value}"\`;
            }
            if (el.tagName === 'A' && el.href) {
                // 仅为了提示，不一定要完整 URL
                // attrs += \` href="\${el.href}"\`; 
                attrs += ' (link)';
            }
            
            output = \`\${idStr}<\${el.tagName.toLowerCase()}\${attrs}>\${childrenOutput}</\${el.tagName.toLowerCase()}>\`;
        } else if (CONTENT_TAGS.has(el.tagName) && hasContent) {
            // 内容元素：保留标签结构以便理解层级，或者对于 div/span 只保留内容
            const isStructural = ['H1','H2','H3','H4','H5','H6','P','LI'].includes(el.tagName);
            if (isStructural) {
                output = \`<\${el.tagName.toLowerCase()}>\${childrenOutput}</\${el.tagName.toLowerCase()}>\`;
            } else {
                // div / span / td -> 只输出内容，除非有特殊 role
                output = childrenOutput; 
            }
        } else {
            // 其他容器 -> 只透传内容
            output = childrenOutput;
        }

        return output;
    }

    // 清理之前的 ID
    document.querySelectorAll(\`[\${ID_ATTR}]\`).forEach(el => el.removeAttribute(ID_ATTR));
    
    // 生成快照
    const snapshot = traverse(document.body);
    
    // 格式化输出：尝试简单的缩进或分行优化（这里先返回平铺文本，或者按 block 元素分行）
    // 为了更适合 LLM，我们再做一次后处理，把 block 标签换行
    return snapshot
        .replace(/<\\/(h[1-6]|p|li|div)>/gi, '$&\\n') // block 标签后换行
        .replace(/>\\s+</g, '> <') // 标签间保留一个空格
        .split('\\n').map(line => line.trim()).filter(line => line.length > 0).join('\\n');

})();
`;
