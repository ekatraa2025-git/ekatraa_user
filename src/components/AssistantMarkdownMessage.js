import React, { useMemo } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import Markdown, { renderRules, hasParents } from 'react-native-markdown-display';
import MarkdownIt from 'markdown-it';
import multimdTable from 'markdown-it-multimd-table';
import { nodePlainText } from '../utils/markdownNodeText';

const textStyleProps = require('react-native-markdown-display/src/lib/data/textStyleProps').default;

const planningMarkdownIt = MarkdownIt({ typographer: true, linkify: true }).use(multimdTable);

function createRules(onSelectChip, theme, colors) {
    const base = renderRules;
    const chipBox = {
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 8,
        marginBottom: 8,
        backgroundColor: theme.card,
        flexDirection: 'row',
        alignItems: 'flex-start',
    };
    const tapHintStyle = {
        fontSize: 9,
        fontWeight: '700',
        color: colors.primary,
        alignSelf: 'center',
        marginLeft: 4,
    };

    const list_item = (node, children, parent, styles, inheritedStyles = {}) => {
        const refStyle = {
            ...inheritedStyles,
            ...StyleSheet.flatten(styles.list_item),
        };
        const modifiedInheritedStylesObj = {};
        for (let b = 0; b < Object.keys(refStyle).length; b++) {
            const k = Object.keys(refStyle)[b];
            if (textStyleProps.includes(k)) {
                modifiedInheritedStylesObj[k] = refStyle[k];
            }
        }

        const chip = nodePlainText(node);

        const wrap = (inner) => (
            <Pressable
                key={node.key}
                onPress={() => chip && onSelectChip(chip)}
                style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={chip ? `Use suggestion: ${chip}` : 'List item'}
            >
                {inner}
            </Pressable>
        );

        if (hasParents(parent, 'bullet_list')) {
            const inner = (
                <View style={[styles._VIEW_SAFE_list_item, chipBox]}>
                    <Text style={[modifiedInheritedStylesObj, styles.bullet_list_icon]} accessible={false}>
                        {Platform.select({
                            android: '\u2022',
                            ios: '\u00B7',
                            default: '\u2022',
                        })}
                    </Text>
                    <View style={[styles._VIEW_SAFE_bullet_list_content, { flex: 1 }]}>{children}</View>
                    <Text style={tapHintStyle}>Tap</Text>
                </View>
            );
            return wrap(inner);
        }

        if (hasParents(parent, 'ordered_list')) {
            const orderedListIndex = parent.findIndex((el) => el.type === 'ordered_list');
            const orderedList = parent[orderedListIndex];
            let listItemNumber;
            if (orderedList.attributes && orderedList.attributes.start) {
                listItemNumber = orderedList.attributes.start + node.index;
            } else {
                listItemNumber = node.index + 1;
            }
            const inner = (
                <View style={[styles._VIEW_SAFE_list_item, chipBox]}>
                    <Text style={[modifiedInheritedStylesObj, styles.ordered_list_icon]}>
                        {listItemNumber}
                        {node.markup}
                    </Text>
                    <View style={[styles._VIEW_SAFE_ordered_list_content, { flex: 1 }]}>{children}</View>
                    <Text style={tapHintStyle}>Tap</Text>
                </View>
            );
            return wrap(inner);
        }

        return base.list_item(node, children, parent, styles, inheritedStyles);
    };

    const tr = (node, children, parent, styles) => {
        const inBody = hasParents(parent, 'tbody');
        const rowText = nodePlainText(node);
        if (!inBody) {
            return (
                <View key={node.key} style={styles._VIEW_SAFE_tr}>
                    {children}
                </View>
            );
        }
        return (
            <Pressable
                key={node.key}
                onPress={() => rowText && onSelectChip(rowText)}
                style={({ pressed }) => [styles._VIEW_SAFE_tr, { backgroundColor: theme.card, opacity: pressed ? 0.88 : 1 }]}
            >
                {children}
            </Pressable>
        );
    };

    return {
        ...base,
        list_item,
        tr,
    };
}

export default function AssistantMarkdownMessage({ content, theme, colors, isDarkMode, onSelectChip }) {
    const rules = useMemo(() => createRules(onSelectChip, theme, colors), [onSelectChip, theme, colors]);

    const mdStyle = useMemo(
        () => ({
            body: { color: theme.text },
            heading1: { color: theme.text, fontSize: 20, fontWeight: '700', marginBottom: 8 },
            heading2: { color: theme.text, fontSize: 17, fontWeight: '700', marginBottom: 6 },
            heading3: { color: theme.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
            heading4: { color: theme.text, fontSize: 14, fontWeight: '600' },
            paragraph: { marginBottom: 10, color: theme.text, fontSize: 15, lineHeight: 22 },
            strong: { fontWeight: '700', color: theme.text },
            em: { fontStyle: 'italic' },
            bullet_list: { marginBottom: 8 },
            ordered_list: { marginBottom: 8 },
            list_item: { alignItems: 'flex-start' },
            blockquote: {
                borderLeftWidth: 4,
                borderLeftColor: colors.primary + '99',
                paddingLeft: 10,
                marginBottom: 10,
                opacity: 0.95,
            },
            code_inline: {
                backgroundColor: theme.inputBackground,
                color: theme.text,
                paddingHorizontal: 4,
                borderRadius: 4,
                fontSize: 14,
            },
            fence: {
                backgroundColor: isDarkMode ? '#1e1e1e' : '#f3f4f6',
                padding: 10,
                borderRadius: 8,
                marginBottom: 10,
                fontSize: 13,
            },
            table: {
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.border,
                borderRadius: 12,
                marginBottom: 12,
                overflow: 'hidden',
            },
            thead: { backgroundColor: theme.inputBackground },
            th: { padding: 8, fontWeight: '700', fontSize: 12 },
            td: { padding: 8, fontSize: 13 },
            link: { color: colors.primary, textDecorationLine: 'underline' },
            text: { color: theme.text, fontSize: 15, lineHeight: 22 },
        }),
        [theme, colors, isDarkMode]
    );

    return (
        <Markdown markdownit={planningMarkdownIt} rules={rules} style={mdStyle} mergeStyle>
            {content}
        </Markdown>
    );
}
