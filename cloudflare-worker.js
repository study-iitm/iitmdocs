/**
 * CloudFlare Worker for Semantic Document Search & AI Answer Generation
 * Accepts POST /answer with { "q": "question", "ndocs": 5 }
 * Returns text/event-stream with documents and AI-generated answers
 */

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // Only handle POST /answer
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/answer') {
      return new Response('Not Found', { status: 404 });
    }

    try {
      const { q: question, ndocs = 5 } = await request.json();
      if (!question) {
        return new Response('Missing "q" parameter', { status: 400 });
      }

      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Search Weaviate for relevant documents
            const documents = await searchWeaviate(question, ndocs, env);
            
            // Stream documents first
            for (const doc of documents) {
              const docData = {
                type: "document",
                relevance: doc.relevance,
                text: doc.content.substring(0, 500) + (doc.content.length > 500 ? '...' : ''), // Truncate for preview
                link: `https://github.com/prudhvi1709/iitmdocs/blob/main/src/${doc.filename}`
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(docData)}\n\n`));
            }

            // Generate AI answer using documents as context
            await generateAnswer(question, documents, controller, env);
            
            controller.close();
          } catch (error) {
            console.error('Stream error:', error);
            controller.error(error);
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (error) {
      console.error('Request error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};

async function searchWeaviate(query, limit, env) {
  const response = await fetch(`${env.WEAVIATE_URL}/v1/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.WEAVIATE_API_KEY}`,
      'X-OpenAI-Api-Key': env.OPENAI_API_KEY
    },
    body: JSON.stringify({
      query: `{
        Get {
          Document(nearText: { concepts: ["${query}"] } limit: ${limit}) {
            filename filepath content file_size
            _additional { distance }
          }
        }
      }`
    })
  });

  const data = await response.json();
  
  if (data.errors) {
    throw new Error(`Weaviate error: ${data.errors.map(e => e.message).join(', ')}`);
  }

  const documents = data.data?.Get?.Document || [];
  return documents.map(doc => ({
    filename: doc.filename,
    filepath: doc.filepath,
    content: doc.content,
    relevance: doc._additional?.distance ? (1 - doc._additional.distance) : 0
  }));
}

async function generateAnswer(question, documents, controller, env) {
  // Prepare context in Claude XML format
  const context = documents.map(doc => 
    `<document filename="${doc.filename}" filepath="${doc.filepath}">
${doc.content}
</document>`
  ).join('\n\n');

  const prompt = `You are a helpful assistant answering questions about an academic program. Use the provided documents to answer the user's question accurately and concisely.

<documents>
${context}
</documents>

Question: ${question}

Please provide a clear, helpful answer based on the information in the documents above. Respond in markdown format.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: prompt }],
      stream: true
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            
            if (content) {
              const chunkData = { type: "chunk", text: content };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunkData)}\n\n`));
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
} 