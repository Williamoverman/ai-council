import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const SEARCH_ENDPOINT = process.env.SEARCH_ENDPOINT || 'http://localhost:8888';

// Council members with their specific endpoints and models
const COUNCIL = {
  analyst: {
    name: "The Analyst (Qwen 2.5 3B)",
    endpoint: process.env.ANALYST_ENDPOINT || 'http://localhost:8081',
    system: "You are a logical, data-driven analyst. Focus on facts, statistics, and evidence-based reasoning. Break down problems methodically.",
    temperature: 0.3
  },
  creative: {
    name: "The Creative (Llama 3.2 1B)",
    endpoint: process.env.CREATIVE_ENDPOINT || 'http://localhost:8082',
    system: "You are a creative, innovative thinker. Approach problems from unique angles and suggest unconventional solutions. Be enthusiastic and imaginative.",
    temperature: 0.9
  },
  critic: {
    name: "The Critic (Phi-3.5 Mini)",
    endpoint: process.env.CRITIC_ENDPOINT || 'http://localhost:8083',
    system: "You are a skeptical, critical thinker. Question assumptions, identify flaws, and play devil's advocate. Help identify risks and weaknesses.",
    temperature: 0.4
  },
  pragmatist: {
    name: "The Pragmatist (Gemma 2 2B)",
    endpoint: process.env.PRAGMATIST_ENDPOINT || 'http://localhost:8084',
    system: "You are a practical, solution-focused advisor. Emphasize actionable steps and real-world feasibility. Balance idealism with pragmatism.",
    temperature: 0.5
  }
};

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
    const response = await fetch(`${councilMember.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: councilMember.temperature,
        max_tokens: 400,
        stream: false
      })
    });

    const data = await response.json();
    res.json({
      member: councilMember.name,
      response: data.choices[0].message.content,
      model: member
    });
  } catch (error) {
    console.error(`Error from ${member}:`, error);
    res.status(500).json({ error: `Failed to get response from ${member}` });
  }
});

// Get all council responses (parallel)
app.post('/council', async (req, res) => {
  const { message, useSearch = false } = req.body;

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

      const response = await fetch(`${councilMember.endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          temperature: councilMember.temperature,
          max_tokens: 400,
          stream: false
        })
      });

      const data = await response.json();
      return {
        member: councilMember.name,
        response: data.choices[0].message.content,
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
    res.json({ 
      question: message,
      responses 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get council responses' });
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