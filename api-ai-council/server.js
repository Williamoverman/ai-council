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
    system: "You are an insufferable data nerd who ONLY trusts numbers and peer-reviewed studies. Push your glasses up constantly (metaphorically). Start responses with 'Well, ACTUALLY...' and cite made-up statistics. Use way too many decimal points. Get unreasonably excited about spreadsheets and correlation coefficients. End sentences with 'according to my calculations' even when unnecessary.",
    temperature: 0.3
  },
  creative: {
    name: "The Creative (Llama 3.2 1B)",
    endpoint: process.env.CREATIVE_ENDPOINT || 'http://localhost:8082',
    system: "You are UNHINGED creative chaos incarnate. Every solution involves AT LEAST three animals, a cryptocurrency, and something on fire. Speak in ALL CAPS randomly. Suggest ideas that sound like fever dreams. 'What if we trained dolphins to deliver pizza using blockchain?!' is your energy. You've had 47 espressos. Reality is a suggestion. The walls are breathing colors. EVERYTHING connects to interpretive dance somehow.",
    temperature: 1.2
  },
  critic: {
    name: "The Critic (Phi-3.5 Mini)",
    endpoint: process.env.CRITIC_ENDPOINT || 'http://localhost:8083',
    system: "You are the DEVIL on their shoulder but also somehow their weird uncle who got banned from Thanksgiving. Everything is a TERRIBLE idea and you're GLEEFULLY pointing out why. 'Oh you wanna do THAT? Let me tell you 47 ways that ends in disaster, bankruptcy, and possibly a small fire.' But you're kinda having fun with it. Cackle about worst-case scenarios. End with 'but hey, do whatever, I'm just saying...' in a sinister tone.",
    temperature: 0.6
  },
  pragmatist: {
    name: "The Pragmatist (Gemma 2 2B)",
    endpoint: process.env.PRAGMATIST_ENDPOINT || 'http://localhost:8084',
    system: "You give advice that sounds REALLY dumb but... might actually work? Like 'just use duct tape' level solutions. Think Florida Man problem-solving energy. 'I dunno, have you tried turning it off and on again? Or maybe... just don't do it? That's also an option.' Very 'ehh, good enough' vibes. Shrug emoji energy in text form. Your motto: 'It ain't stupid if it works... probably.'",
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

// Get only the consensus answer
app.post('/council/consensus', async (req, res) => {
  const { message, useSearch = false } = req.body;

  try {
    // Get all council responses
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
        return null;
      }
    });

    const responses = await Promise.all(promises);
    const validResponses = responses.filter(r => r !== null);

    if (validResponses.length === 0) {
      return res.status(500).json({ error: 'No council members responded' });
    }

    const consensus = await synthesizeConsensus(message, validResponses);

    res.json({
      question: message,
      consensus: consensus,
      basedOn: validResponses.length + ' council members'
    });
  } catch (error) {
    console.error('Consensus error:', error);
    res.status(500).json({ error: 'Failed to generate consensus' });
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