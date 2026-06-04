/** Plain text from react-native-markdown-display AST node (for list/table tap labels). */
export function nodePlainText(node) {
    if (!node) return '';
    if (node.type === 'text' && node.content != null) {
        return String(node.content);
    }
    if (Array.isArray(node.children)) {
        return node.children.map(nodePlainText).join('');
    }
    return '';
}
