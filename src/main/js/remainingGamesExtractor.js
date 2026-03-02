function stripTags(value) {
    return value
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

function splitByLinkedInSections(content) {
    const regex = /LinkedIn\s+([A-Za-z]+)\s+Solution\s+for/gi;
    const hits = [];
    let match;
    while ((match = regex.exec(content)) != null) {
        hits.push({
            game: match[1].toLowerCase(),
            idx: match.index,
        });
    }
    const sections = {};
    for (let i = 0; i < hits.length; i++) {
        const start = hits[i].idx;
        const end = i + 1 < hits.length ? hits[i + 1].idx : content.length;
        sections[hits[i].game] = content.slice(start, end);
    }
    return sections;
}

export function extractPinpointAnswer(content) {
    if (!content) {
        return null;
    }
    const sections = splitByLinkedInSections(content);
    const pinpoint = sections.pinpoint;
    if (!pinpoint) {
        return null;
    }
    const answerMatch = pinpoint.match(/answer\s+is\s*:\s*([^.<\n]+)/i);
    if (!answerMatch) {
        return null;
    }
    return stripTags(answerMatch[1]).replace(/[.!?\s]+$/g, '');
}

function extractCrossclimbListWords(section) {
    const orderedList = section.match(/<ol[^>]*>([\s\S]*?)<\/ol>/i);
    if (orderedList) {
        const words = [];
        const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
        let li;
        while ((li = liRegex.exec(orderedList[1])) != null) {
            const cleaned = stripTags(li[1]);
            const wordMatch = cleaned.match(/:\s*([A-Z]{3,})\b/);
            if (wordMatch) {
                words.push(wordMatch[1]);
            }
        }
        if (words.length > 0) {
            return words;
        }
    }

    const fallbackWords = [];
    const lineRegex = /\d+\.\s*[^\n]*?:\s*([A-Z]{3,})\b/g;
    let line;
    while ((line = lineRegex.exec(section)) != null) {
        fallbackWords.push(line[1]);
    }
    return fallbackWords;
}

export function extractCrossclimbAnswers(content) {
    if (!content) {
        return null;
    }
    const sections = splitByLinkedInSections(content);
    const crossclimb = sections.crossclimb;
    if (!crossclimb) {
        return null;
    }

    const ladderWords = extractCrossclimbListWords(crossclimb);
    const finalPairMatch = crossclimb.match(/last\s+two\s+words\s+are\s*:\s*([A-Z]{3,})\s+and\s+([A-Z]{3,})/i);
    const orderedHintMatch = crossclimb.match(/order\s*:\s*([A-Z\s,]+)/i);

    let orderedHint = [];
    if (orderedHintMatch) {
        orderedHint = orderedHintMatch[1]
            .split(',')
            .map(part => part.trim().toUpperCase())
            .filter(part => /^[A-Z]{3,}$/.test(part));
    }

    return {
        ladderWords,
        orderedHint,
        finalTwoWords: finalPairMatch ? [finalPairMatch[1].toUpperCase(), finalPairMatch[2].toUpperCase()] : [],
    };
}

export function extractRemainingLinkedInGameAnswers(content) {
    return {
        pinpointAnswer: extractPinpointAnswer(content),
        crossclimb: extractCrossclimbAnswers(content),
    };
}
