// Transcript -> profile. The voice agent's call transcript becomes a structured profile
// that sets the hard loss cap. v0 uses rules; next is an LLM with this as a fallback check.
// Owner: Person 4

export interface Profile {
  lossCapCents: number | null;
  hoursPerWeek: number | null;
  interests: string[];
  followers: number | null;
  riskTolerance: 'low' | 'medium' | 'high';
  persona: 'student' | '9-to-5er' | 'creator' | 'parent' | 'unknown';
  missing: string[]; // fields the voice agent must ask a follow-up about
}

const INTEREST_WORDS: Record<string, string[]> = {
  hiking: ['hike', 'hiking', 'trail'], outdoors: ['outdoors', 'camping', 'mountains', 'nature'],
  climbing: ['climb', 'climbing', 'bouldering'], art: ['art', 'draw', 'drawing', 'illustrat', 'paint'],
  plants: ['plant'], pets: ['cat', 'dog', 'pet'], fitness: ['gym', 'lift', 'fitness', 'workout'],
  music: ['music', 'vinyl', 'records'], students: ['student', 'college', 'class'],
  humor: ['funny', 'humor', 'memes', 'jokes'], healthcare: ['nurse', 'hospital'],
};

const num = (s: string) => {
  const m = s.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(k)?/i);
  return m ? Math.round(parseFloat(m[1]) * (m[2] ? 1000 : 1)) : null;
};

/** Only the user's lines matter for facts about the user. */
function userText(transcript: string): string {
  return transcript.split('\n')
    .filter(l => !/^\s*(agent|hive|assistant)\s*:/i.test(l))
    .map(l => l.replace(/^\s*(user|me)\s*:/i, ''))
    .join(' ').toLowerCase();
}

export function parseTranscript(transcript: string): Profile {
  const t = userText(transcript);

  const capMatch = t.match(/(?:lose|cap|risk|okay losing|ok losing|comfortable losing)[^$\d]{0,40}\$?\s?(\d[\d,]*)/)
    ?? t.match(/\$\s?(\d[\d,]*)[^.]{0,30}(?:lose|cap|max)/);
  const lossCapCents = capMatch ? parseInt(capMatch[1].replace(/,/g, ''), 10) * 100 : null;

  const hoursMatch = t.match(/(\d+(?:\s*(?:-|to)\s*\d+)?)\s*(?:hours|hrs|hour)/);
  const hoursPerWeek = hoursMatch ? Math.max(...hoursMatch[1].split(/-|to/).map(x => parseInt(x, 10))) : null;

  const folMatch = t.match(/(\d[\d,.]*\s*k?)\s*followers/);
  const followers = folMatch ? num(folMatch[1]) : null;

  const interests = Object.entries(INTEREST_WORDS)
    .filter(([, ws]) => ws.some(w => t.includes(w))).map(([k]) => k);

  const riskTolerance = /nervous|careful|can't afford|cant afford|safe|scared/.test(t) ? 'low'
    : /aggressive|go big|all in|don't mind risk/.test(t) ? 'high' : 'medium';

  const persona = /student|college|campus/.test(t) ? 'student'
    : followers && followers >= 2000 ? 'creator'
    : /kids|parent|stay at home|stay-at-home/.test(t) ? 'parent'
    : /9 to 5|9-to-5|full[- ]time job|day job/.test(t) ? '9-to-5er' : 'unknown';

  const missing = [
    lossCapCents === null && 'loss cap',
    hoursPerWeek === null && 'hours per week',
    interests.length === 0 && 'interests',
  ].filter(Boolean) as string[];

  return { lossCapCents, hoursPerWeek, interests, followers, riskTolerance, persona, missing };
}

export const SAMPLE_TRANSCRIPT = `Hive: Hey! Tell me a bit about yourself. What do you do day to day?
User: I'm a college student at Berkeley, so I don't have a lot of money.
Hive: What do you like doing outside of class?
User: Mostly hiking and drawing. I post my art on Instagram.
Hive: Nice, how many followers do you have there?
User: About 2.4k followers.
Hive: How much time could you give this each week?
User: Maybe 2 to 3 hours a week.
Hive: Last one. What's the most you'd be okay losing while we test, if nothing sells?
User: I'd be okay losing $150 max, I'm a little nervous about money.`;
