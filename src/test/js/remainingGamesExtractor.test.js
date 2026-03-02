import {
    extractPinpointAnswer,
    extractCrossclimbAnswers,
    extractRemainingLinkedInGameAnswers,
} from 'remainingGamesExtractor.js';

test('extractPinpointAnswer() parses the final answer phrase', () => {
    const content = `
## LinkedIn Pinpoint Solution for March 1, 2026 (#670)
<p>The third hint is Drink can, and the answer is pretty clear here, but also confusing. The fourth hint is Spreadsheet, and this is as clear as the answer will get. The last hint is Web browser (too many open?), and the answer is: Things with tabs.</p>

## LinkedIn Crossclimb Solution for March 1, 2026 (#670)
`;

    expect(extractPinpointAnswer(content)).toBe('Things with tabs');
});

test('extractCrossclimbAnswers() parses list and final two words', () => {
    const content = `
## LinkedIn Crossclimb Solution for March 1, 2026 (#670)
<ol class="wp-block-list">
<li>A single, uninterrupted recording of a scene in a movie: TAKE </li>
<li>Record sound or video: TAPE</li>
<li>Step into some shallow water: WADE</li>
<li>Turbulence in the water left behind a moving boat: WAKE</li>
<li>Gradually decrease in intensity before disappearing: FADE</li>
</ol>
<p>Before finding the last two words, you’ll need to arrange the first five in this order: TAPE, TAKE, WAKE, WADE, FADE.</p>
<p>And the last two words are: TYPE and FACE.</p>
`;

    const extracted = extractCrossclimbAnswers(content);
    expect(extracted).toEqual({
        ladderWords: ['TAKE', 'TAPE', 'WADE', 'WAKE', 'FADE'],
        orderedHint: ['TAPE', 'TAKE', 'WAKE', 'WADE', 'FADE'],
        finalTwoWords: ['TYPE', 'FACE'],
    });
});

test('extractRemainingLinkedInGameAnswers() combines both extractors', () => {
    const content = `
## LinkedIn Pinpoint Solution for March 1, 2026 (#670)
<p>... and the answer is: Things with tabs.</p>
## LinkedIn Crossclimb Solution for March 1, 2026 (#670)
<ol>
<li>A single, uninterrupted recording of a scene in a movie: TAKE</li>
</ol>
<p>And the last two words are: TYPE and FACE.</p>
`;

    expect(extractRemainingLinkedInGameAnswers(content)).toEqual({
        pinpointAnswer: 'Things with tabs',
        crossclimb: {
            ladderWords: ['TAKE'],
            orderedHint: [],
            finalTwoWords: ['TYPE', 'FACE'],
        },
    });
});
