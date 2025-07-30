/**
 * CloudFlare Worker for Semantic Document Search & AI Answer Generation
 * Returns OpenAI-style streaming responses compatible with asyncLLM
 */

export default {
  async fetch(request, env, ctx) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    // Log incoming request
    console.log({
      event: "request_start",
      request_id: requestId,
      timestamp: new Date().toISOString(),
      method: request.method,
      url: request.url,
      user_agent: request.headers.get('User-Agent'),
      cf_country: request.cf?.country,
      cf_colo: request.cf?.colo
    });

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      console.log({
        event: "cors_preflight",
        request_id: requestId,
        timestamp: new Date().toISOString()
      });
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
      console.log({
        event: "invalid_request",
        request_id: requestId,
        timestamp: new Date().toISOString(),
        method: request.method,
        pathname: url.pathname,
        status: 404
      });
      return new Response('Not Found', { status: 404 });
    }

    try {
      const { q: question, ndocs = 5 } = await request.json();
      if (!question) {
        console.log({
          event: "missing_question",
          request_id: requestId,
          timestamp: new Date().toISOString(),
          status: 400
        });
        return new Response('Missing "q" parameter', { status: 400 });
      }

      console.log({
        event: "search_start",
        request_id: requestId,
        timestamp: new Date().toISOString(),
        question: question.substring(0, 200),
        ndocs: ndocs
      });

      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Search Weaviate for relevant documents
            const searchStartTime = Date.now();
            const documents = await searchWeaviate(question, ndocs, env, requestId);
            const searchDuration = Date.now() - searchStartTime;

            console.log({
              event: "search_complete",
              request_id: requestId,
              timestamp: new Date().toISOString(),
              documents_found: documents.length,
              search_duration_ms: searchDuration,
              documents: documents.map(doc => ({
                filename: doc.filename,
                relevance: doc.relevance,
                content_preview: doc.content.substring(0, 300) + (doc.content.length > 300 ? '...' : '')
              }))
            });

            // Stream documents first as OpenAI-style chunks
            for (const doc of documents) {
              const docData = {
                id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: "document-search",
                choices: [{
                  index: 0,
                  delta: {
                    role: "assistant",
                    content: JSON.stringify({
                      type: "document",
                      relevance: doc.relevance,
                      text: doc.content.substring(0, 500) + (doc.content.length > 500 ? '...' : ''),
                      link: `https://github.com/prudhvi1709/iitmdocs/blob/main/src/${doc.filename}`
                    })
                  },
                  finish_reason: null
                }]
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(docData)}\n\n`));
            }

            // Generate AI answer using documents as context
            const answerStartTime = Date.now();
            await generateAnswer(question, documents, controller, env, requestId);
            const answerDuration = Date.now() - answerStartTime;

            console.log({
              event: "answer_complete",
              request_id: requestId,
              timestamp: new Date().toISOString(),
              answer_duration_ms: answerDuration
            });

            // Send final chunk
            const finalChunk = {
              id: `final-${Date.now()}`,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: "gpt-4.1-mini",
              choices: [{
                index: 0,
                delta: {},
                finish_reason: "stop"
              }]
            };
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
            controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));

            const totalDuration = Date.now() - startTime;
            console.log({
              event: "request_complete",
              request_id: requestId,
              timestamp: new Date().toISOString(),
              total_duration_ms: totalDuration,
              status: "success"
            });

            controller.close();
          } catch (error) {
            console.log({
              event: "stream_error",
              request_id: requestId,
              timestamp: new Date().toISOString(),
              error: error.message,
              stack: error.stack
            });
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
      const totalDuration = Date.now() - startTime;
      console.log({
        event: "request_error",
        request_id: requestId,
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack,
        total_duration_ms: totalDuration,
        status: 500
      });
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};

async function searchWeaviate(query, limit, env, requestId) {
  console.log({
    event: "weaviate_search_start",
    request_id: requestId,
    timestamp: new Date().toISOString(),
    query: query.substring(0, 100),
    limit: limit
  });

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
    console.log({
      event: "weaviate_error",
      request_id: requestId,
      timestamp: new Date().toISOString(),
      errors: data.errors.map(e => e.message)
    });
    throw new Error(`Weaviate error: ${data.errors.map(e => e.message).join(', ')}`);
  }

  const documents = data.data?.Get?.Document || [];
  console.log({
    event: "weaviate_search_complete",
    request_id: requestId,
    timestamp: new Date().toISOString(),
    documents_returned: documents.length
  });

  return documents.map(doc => ({
    filename: doc.filename,
    filepath: doc.filepath,
    content: doc.content,
    relevance: doc._additional?.distance ? (1 - doc._additional.distance) : 0
  }));
}

async function generateAnswer(question, documents, controller, env, requestId) {
  console.log({
    event: "ai_generation_start",
    request_id: requestId,
    timestamp: new Date().toISOString(),
    context_docs: documents.length,
    context_size: documents.reduce((sum, doc) => sum + doc.content.length, 0)
  });

  // Prepare context in XML format
  const context = documents.map(doc =>
    `<document filename="${doc.filename}" filepath="${doc.filepath}">
${doc.content}
</document>`
  ).join('\n\n');

  const currentDate = new Date().toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format
  
  const systemPrompt = `You are a helpful assistant answering questions about an academic program. Today's date is ${currentDate}. Use the provided documents to answer the user's question accurately and concisely.

<documents>
${context}
</documents>

Please provide a clear, helpful answer based on the information in the documents above. Respond in markdown format.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      stream: true
    })
  });

  if (!response.ok) {
    console.log({
      event: "openai_error",
      request_id: requestId,
      timestamp: new Date().toISOString(),
      status: response.status,
      status_text: response.statusText
    });
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = ''; // Buffer for incomplete lines
  let tokensGenerated = 0;
  let fullResponse = ''; // Collect complete response

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Add new chunk to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      // Keep the last line in buffer (might be incomplete)
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;

            if (content) {
              tokensGenerated++;
              fullResponse += content; // Collect response
              // Create OpenAI-style chunk with our custom content marked as answer chunk
              const answerChunk = {
                id: parsed.id,
                object: "chat.completion.chunk",
                created: parsed.created,
                model: parsed.model,
                choices: [{
                  index: 0,
                  delta: {
                    content: JSON.stringify({ type: "chunk", text: content })
                  },
                  finish_reason: null
                }]
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(answerChunk)}\n\n`));
            }
          } catch (e) {
            // Skip invalid JSON lines
            console.log({
              event: "json_parse_error",
              request_id: requestId,
              timestamp: new Date().toISOString(),
              error: e.message,
              data: data.substring(0, 100)
            });
          }
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim()) {
      const line = buffer.trim();
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;

            if (content) {
              tokensGenerated++;
              fullResponse += content; // Collect response
              const answerChunk = {
                id: parsed.id,
                object: "chat.completion.chunk",
                created: parsed.created,
                model: parsed.model,
                choices: [{
                  index: 0,
                  delta: {
                    content: JSON.stringify({ type: "chunk", text: content })
                  },
                  finish_reason: null
                }]
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(answerChunk)}\n\n`));
            }
          } catch (e) {
            console.log({
              event: "final_buffer_parse_error",
              request_id: requestId,
              timestamp: new Date().toISOString(),
              error: e.message
            });
          }
        }
      }
    }

    console.log({
      event: "ai_generation_complete",
      request_id: requestId,
      timestamp: new Date().toISOString(),
      tokens_generated: tokensGenerated,
      response_preview: fullResponse.substring(0, 1000) + (fullResponse.length > 1000 ? '...' : ''),
      response_length: fullResponse.length
    });

    // Log the complete conversation for analysis
    console.log({
      event: "conversation_complete",
      request_id: requestId,
      timestamp: new Date().toISOString(),
      question: question,
      response_preview: fullResponse.substring(0, 1000) + (fullResponse.length > 1000 ? '...' : ''),
      response_length: fullResponse.length,
      full_response: fullResponse,
      sources_used: documents.map(doc => doc.filename)
    });

    return fullResponse; // Return the collected response

  } finally {
    reader.releaseLock();
  }
}