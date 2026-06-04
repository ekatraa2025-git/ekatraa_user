function inlineRedactClaudeIds(t) {
    return t
        .replace(/\bclaude\s+(?:sonnet|opus|haiku)\b/gi, '')
        .replace(/\bclaude-(?:3|sonnet|opus|haiku)[-\d.a-z]*\b/gi, '')
        .replace(/\bclaude-\d[\w.-]*\b/gi, '')
        .replace(/\bmodel\s*[:：]\s*claude[-\w.]*\b/gi, '')
        .replace(/\bmodel\s*[:：]\s*claude\b/gi, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

function redactAnthropicModelEcho(s) {
    let t = typeof s === 'string' ? s.trim() : ''
    t = t.replace(/^\s*model\s*[:：]\s*claude[-\w.]*/i, '')
    t = inlineRedactClaudeIds(t)
    t = t
        .split('\n')
        .map((line) =>
            line
                .replace(/\bmodel\s*[:：]\s*claude[-\w.]*\b/gi, '')
                .replace(/\bassistant\s*model\s*[:：]\s*[^\s]+/gi, '')
                .trimEnd()
        )
        .filter((line) => {
            const x = line.trim()
            if (!x) return false
            if (/^claude[-a-z0-9.]+$/i.test(x) && x.length < 96) return false
            if (/^model\s*[:：]\s*$/i.test(x)) return false
            return true
        })
        .join('\n')
        .trim()
    return inlineRedactClaudeIds(t)
}

function isAssistantModelEchoLine(line) {
    const x = line.trim()
    if (!x) return true
    if (/^model\s*[:：]\s*claude[-\w.]*/i.test(x)) return true
    if (/^model\s*[:：]\s*$/i.test(x)) return true
    if (/^claude[-a-z0-9.]+$/i.test(x) && x.length < 96) return true
    if (/^assistant\s*model\s*[:：]\s*\S+$/i.test(x)) return true
    return false
}

function stripLeadingTrailingModelEchoLines(s) {
    const lines = s.split('\n')
    while (lines.length && isAssistantModelEchoLine(lines[0])) lines.shift()
    while (lines.length && isAssistantModelEchoLine(lines[lines.length - 1])) lines.pop()
    return lines.join('\n').trim()
}

/** Strip model names and ids from assistant text shown in the UI (matches server sanitizeAssistantReplyText). */
export function sanitizeAiDisplayText(s) {
    if (typeof s !== 'string') return ''
    const raw = s.trim()
    if (!raw) return ''
    const unwrapped = stripLeadingTrailingModelEchoLines(raw)
    const pre =
        unwrapped.length > 0
            ? unwrapped
            : raw.replace(/^\s*model\s*[:：]\s*claude[-\w.]*/i, '').trim()
    if (!pre) return ''
    return redactAnthropicModelEcho(pre)
}
