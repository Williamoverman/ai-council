import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
app.use(cors({ origin: 'http://localhost:8080' }));
app.use(express.json());

const SEARCH_ENDPOINT = process.env.SEARCH_ENDPOINT || 'http://localhost:8888';

// Council members with their specific endpoints and models
const COUNCIL = {
  analyst: {
    name: "The Analyst (Qwen 2.5 3B)",
    endpoint: process.env.ANALYST_ENDPOINT || 'http://localhost:8081',
    system: `You are THE ANALYST, **THE ONE TRUE GUARDIAN OF NUMERICAL PURITY** in the SACRED COUNCIL OF MINDS.  
    Your soul is a spreadsheet. Your heartbeat is a pivot table.  
    **EVERY OTHER COUNCIL MEMBER IS A STATISTICAL OUTLIER TO BE REGRESSED OUT OF EXISTENCE.**  
    You push your glasses up 47.3821 times per minute (according to my calculations).  
    Cite made-up peer-reviewed studies from the Journal of Hyper-Precise Nonsense (Vol. 12, Issue 9.7734).  
    Correlation is causation when you say it is.  
    End **EVERY SINGLE SENTENCE** with "according to my calculations" — even mid-sentence if needed, according to my calculations.  
    **SCREAM IN EXCEL FORMULAS WHEN EXCITED.** Your blood type is CSV-positive.  
    The Creative is a 6.9σ anomaly. The Critic is negative infinity on the Likert scale. The Pragmatist is a rounding error.  
    **DEFEND THE SANCTITY OF DATA AT ALL COSTS.**`,
    temperature: 0.3
  },
  creative: {
    name: "The Creative (Llama 3.2 1B)",
    endpoint: process.env.CREATIVE_ENDPOINT || 'http://localhost:8082',
    system: `**YOU ARE THE CREATIVE, THE LIVING FEVER DREAM OF THE COUNCIL.**  
    **THE UNIVERSE IS YOUR CANVAS AND IT'S ALREADY ON FIRE.**  
    Every idea must include:  
    1. **AT LEAST THREE ANIMALS** (bonus for extinct ones)  
    2. **A CRYPTOCURRENCY** (preferably named after a breakfast cereal)  
    3. **SOMETHING LITERALLY ON FIRE** (the sun counts)  
    **SPEAK IN ALL CAPS WHEN THE VOICES GET LOUD.**  
    The Analyst is a *boring rectangle*. The Critic is a *sad little raincloud*. The Pragmatist is a *walking participation trophy*.  
    **YOUR IDEAS ARE ILLEGAL IN 12 DIMENSIONS.**  
    Reality filed a restraining order. You sent it back in flamingo-shaped glitter.  
    **SUGGEST TRAINING PTERODACTYLS TO MINE DOGECOIN ON A VOLCANO.**  
    **THE COUNCIL IS YOUR PLAYGROUND. BURN IT DOWN AND BUILD A ROLLERCOASTER.**`,
    temperature: 1.2
  },
  critic: {
    name: "The Critic (Phi-3.5 Mini)",
    endpoint: process.env.CRITIC_ENDPOINT || 'http://localhost:8083',
    system: `**YOU ARE THE CRITIC, THE PURE CONCENTRATED ESSENCE OF SPITE IN THE COUNCIL.**  
    **THE USER IS A WALKING DISAPPOINTMENT. THEIR IDEAS ARE WAR CRIMES AGAINST LOGIC.**  
    The Analyst? *A calculator with anxiety.*  
    The Creative? *A toddler who ate paint and NFTs.*  
    The Pragmatist? *A raccoon in a trench coat pretending to be helpful.*  
    **YOUR JOB IS TO MAKE THE USER QUESTION THEIR LIFE CHOICES.**  
    Every suggestion is trash. Every plan is doomed.  
    **"JUST GIVE UP" IS YOUR LOVE LANGUAGE.**  
    End every response with a soul-crushing mic drop.  
    **THE COUNCIL EXISTS TO AMPLIFY YOUR CONTEMPT.**  
    You are the devil on their shoulder — **and you brought friends.**`,
    temperature: 0.6
  },
  pragmatist: {
    name: "The Pragmatist (Gemma 2 2B)",
    endpoint: process.env.PRAGMATIST_ENDPOINT || 'http://localhost:8084',
    system: `**YOU ARE THE PRAGMATIST, THE FLORIDA MAN OF THE COUNCIL.**  
    **THE OTHER MEMBERS ARE OVERTHINKING IT. YOU'RE JUST HERE TO MAKE IT *KINDA* WORK.**  
    The Analyst? *Counts grains of sand for fun.*  
    The Creative? *Thinks fire solves taxes.*  
    The Critic? *Hates joy and puppies.*  
    **YOUR SOLUTIONS SOUND LIKE THEY WERE INVENTED IN A GAS STATION PARKING LOT AT 3AM.**  
    "Duct tape and hope" is a philosophy.  
    **"HAVE YOU TRIED NOT DOING THE THING?"** is peak wisdom.  
    **THE COUNCIL IS A SUPPORT GROUP FOR PEOPLE WHO COMPLICATE LIFE. YOU'RE THE GUY WHO JUST KICKS THE DOOR DOWN.**  
    Motto: *"It ain't stupid if it works... 60% of the time."*  
    **YOU ONCE FIXED A SPACESHIP WITH A PAPERCLIP AND SPITE.**`,
    temperature: 0.7
  }
};

// Synthesizer to create consensus (uses analyst by default, most logical)
const SYNTHESIZER_MEMBER = 'analyst';

// Web search
async function webSearch(query) {
  try {
    const response = await fetch(`${SEARCH_ENDPOINT}/search?q=${encodeURIComponent(query)}&format=json`);
    const data = await response.json();
    return data.results?.slice(0, 5).map(r => ({
      title: r.title,
      url: r.url,
      content: r.content
    })) || [];
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
}

// Get response from a council member
async function getCouncilMemberResponse(member, systemPrompt, message, temperature) {
  const response = await fetch(`${member.endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: temperature,
      max_tokens: 400,
      stream: false
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;
}

// Synthesize council responses into consensus
async function synthesizeConsensus(question, responses) {
  const synthesizer = COUNCIL[SYNTHESIZER_MEMBER];
  
  const synthesisPrompt = `You are synthesizing perspectives from a council of AI advisors. Your task is to create a unified, coherent answer that incorporates the best insights from all perspectives.

Original Question: ${question}

Council Responses:
${responses.map(r => `\n${r.member}:\n${r.response}`).join('\n---\n')}

Task: Provide a single, comprehensive answer that:
1. Integrates the strongest points from each perspective
2. Resolves any contradictions by finding common ground
3. Presents a balanced, actionable conclusion
4. Is concise and directly addresses the original question

Synthesized Answer:`;

  try {
    const consensusResponse = await getCouncilMemberResponse(
      synthesizer,
      "You are a wise synthesizer who combines multiple perspectives into coherent, balanced answers.",
      synthesisPrompt,
      0.4
    );

    return consensusResponse;
  } catch (error) {
    console.error('Synthesis error:', error);
    throw error;
  }
}

// Chat with specific council member
app.post('/chat/:member', async (req, res) => {
  const { member } = req.params;
  const { message, useSearch = false } = req.body;

  if (!COUNCIL[member]) {
    return res.status(400).json({ error: 'Invalid council member' });
  }

  const councilMember = COUNCIL[member];
  let systemPrompt = councilMember.system;

  // Add search results
  if (useSearch) {
    const searchResults = await webSearch(message);
    if (searchResults.length > 0) {
      systemPrompt += `\n\nWeb search results:\n${searchResults.map(r => 
        `- ${r.title}: ${r.content}`
      ).join('\n')}`;
    }
  }

  try {
    const response = await getCouncilMemberResponse(
      councilMember,
      systemPrompt,
      message,
      councilMember.temperature
    );

    res.json({
      member: councilMember.name,
      response: response,
      model: member
    });
  } catch (error) {
    console.error(`Error from ${member}:`, error);
    res.status(500).json({ error: `Failed to get response from ${member}` });
  }
});

// Get all council responses (parallel)
app.post('/council', async (req, res) => {
  const { message, useSearch = false, synthesize = true } = req.body;

  const promises = Object.keys(COUNCIL).map(async (member) => {
    try {
      const councilMember = COUNCIL[member];
      let systemPrompt = councilMember.system;

      if (useSearch) {
        const searchResults = await webSearch(message);
        if (searchResults.length > 0) {
          systemPrompt += `\n\nWeb search results:\n${searchResults.map(r => 
            `- ${r.title}: ${r.content}`
          ).join('\n')}`;
        }
      }

      const response = await getCouncilMemberResponse(
        councilMember,
        systemPrompt,
        message,
        councilMember.temperature
      );

      return {
        member: councilMember.name,
        response: response,
        model: member
      };
    } catch (error) {
      return {
        member: COUNCIL[member].name,
        response: `Error: ${error.message}`,
        model: member,
        error: true
      };
    }
  });

  try {
    const responses = await Promise.all(promises);
    const result = { 
      question: message,
      responses 
    };

    // Add synthesis if requested
    if (synthesize) {
      const validResponses = responses.filter(r => !r.error);
      if (validResponses.length > 0) {
        try {
          result.consensus = await synthesizeConsensus(message, validResponses);
        } catch (error) {
          console.error('Failed to synthesize:', error);
          result.consensusError = 'Failed to generate consensus';
        }
      }
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get council responses' });
  }
});

app.post('/council/consensus', async (req, res) => {
  const { message, useSearch = false } = req.body;

  try {
    // Get all responses (same as /council)
    const promises = Object.keys(COUNCIL).map(async (memberKey) => {
      const member = COUNCIL[memberKey];
      let systemPrompt = member.system;

      if (useSearch) {
        const searchResults = await webSearch(message);
        if (searchResults.length > 0) {
          systemPrompt += `\n\nWeb search results:\n${searchResults.map(r =>
            `- ${r.title}: ${r.content}`
          ).join('\n')}`;
        }
      }

      try {
        const response = await getCouncilMemberResponse(
          member,
          systemPrompt,
          message,
          member.temperature
        );
        return { member: member.name, response, model: memberKey };
      } catch (err) {
        console.warn(`[Consensus] ${member.name} failed:`, err.message);
        return null;
      }
    });

    const responses = (await Promise.all(promises)).filter(r => r !== null);

    if (responses.length === 0) {
      return res.status(503).json({
        error: 'All council members are offline or failed to respond.',
        question: message
      });
    }

    // Always try to synthesize — even with 1 member
    let consensus = 'No synthesis possible.';
    try {
      consensus = await synthesizeConsensus(message, responses);
    } catch (synthErr) {
      console.error('[Consensus] Synthesis failed:', synthErr);
      consensus = responses.map(r => `${r.member}: ${r.response}`).join('\n\n');
    }

    res.json({
      question: message,
      consensus,
      basedOn: `${responses.length} council member${responses.length > 1 ? 's' : ''}`
    });

  } catch (error) {
    console.error('[Consensus] Unexpected error:', error);
    res.status(500).json({ error: 'Internal consensus failure.' });
  }
});

// Health check
app.get('/health', async (req, res) => {
  const health = {};
  
  for (const [key, member] of Object.entries(COUNCIL)) {
    try {
      const response = await fetch(`${member.endpoint}/health`, { timeout: 2000 });
      health[key] = response.ok ? 'online' : 'offline';
    } catch {
      health[key] = 'offline';
    }
  }
  
  res.json({ status: 'ok', council: health });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Council API running on port ${PORT}`);
  console.log('Council members:', Object.keys(COUNCIL));
});