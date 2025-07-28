/**
 * Weaviate Search Client
 * Frontend JavaScript library for searching embedded documents
 */

class WeaviateSearch {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || 'https://zlpipialqvivotmfurmzpw.c0.asia-southeast1.gcp.weaviate.cloud';
        this.apiKey = config.apiKey; // Will be set from environment or user input
        this.collection = config.collection || 'Document';
        this.defaultLimit = config.defaultLimit || 5;
    }

    /**
     * Set API credentials
     */
    setCredentials(apiKey) {
        this.apiKey = apiKey;
    }

    /**
     * Set OpenAI API key
     */
    setOpenAIKey(openaiKey) {
        this.openai_api_key = openaiKey;
    }

    /**
     * Search documents using GraphQL near_text query
     */
    async searchDocuments(query, options = {}) {
        const limit = options.limit || this.defaultLimit;
        const includeVector = options.includeVector || false;
        
        if (!this.apiKey) {
            throw new Error('Weaviate API key not set. Use setCredentials() first.');
        }
        if (!this.openai_api_key) {
            throw new Error('OpenAI API key not set. Use setOpenAIKey() first.');
        }

        const graphqlQuery = {
            query: `
                {
                    Get {
                        Document(
                            nearText: { concepts: ["${query}"] }
                            limit: ${limit}
                        ) {
                            filename
                            filepath
                            content
                            file_size
                            file_extension
                            content_hash
                            _additional {
                                distance
                                ${includeVector ? 'vector' : ''}
                            }
                        }
                    }
                }
            `
        };

        try {
            const response = await fetch(`${this.baseUrl}/v1/graphql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'X-OpenAI-Api-Key': this.openai_api_key
                },
                body: JSON.stringify(graphqlQuery)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            
            if (data.errors) {
                throw new Error(`GraphQL Error: ${data.errors.map(e => e.message).join(', ')}`);
            }

            return this.formatSearchResults(data.data.Get.Document, query);

        } catch (error) {
            console.error('Search error:', error);
            throw error;
        }
    }

    /**
     * Search using REST API (alternative method)
     */
    async searchDocumentsREST(query, options = {}) {
        const limit = options.limit || this.defaultLimit;
        
        if (!this.apiKey) {
            throw new Error('Weaviate API key not set. Use setCredentials() first.');
        }
        if (!this.openai_api_key) {
            throw new Error('OpenAI API key not set. Use setOpenAIKey() first.');
        }

        const searchParams = new URLSearchParams({
            'class': this.collection,
            'limit': limit.toString(),
            'nearText': JSON.stringify({
                concepts: [query]
            })
        });

        try {
            const response = await fetch(`${this.baseUrl}/v1/objects?${searchParams}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'X-OpenAI-Api-Key': this.openai_api_key
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            return this.formatRESTResults(data.objects, query);

        } catch (error) {
            console.error('REST search error:', error);
            throw error;
        }
    }

    /**
     * Get document count
     */
    async getDocumentCount() {
        if (!this.apiKey) {
            throw new Error('Weaviate API key not set. Use setCredentials() first.');
        }
        if (!this.openai_api_key) {
            throw new Error('OpenAI API key not set. Use setOpenAIKey() first.');
        }

        const graphqlQuery = {
            query: `
                {
                    Aggregate {
                        Document {
                            meta {
                                count
                            }
                        }
                    }
                }
            `
        };

        try {
            const response = await fetch(`${this.baseUrl}/v1/graphql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'X-OpenAI-Api-Key': this.openai_api_key
                },
                body: JSON.stringify(graphqlQuery)
            });

            const data = await response.json();
            return data.data.Aggregate.Document[0].meta.count;

        } catch (error) {
            console.error('Count error:', error);
            return 0;
        }
    }

    /**
     * Format GraphQL search results
     */
    formatSearchResults(documents, originalQuery) {
        if (!documents || documents.length === 0) {
            return {
                query: originalQuery,
                totalResults: 0,
                documents: [],
                searchTime: Date.now()
            };
        }

        const formattedDocs = documents.map((doc, index) => ({
            id: doc.content_hash,
            filename: doc.filename,
            filepath: doc.filepath,
            content: doc.content,
            fileSize: doc.file_size,
            fileExtension: doc.file_extension,
            contentHash: doc.content_hash,
            relevanceScore: doc._additional?.distance ? (1 - doc._additional.distance) : 0,
            preview: this.generatePreview(doc.content, originalQuery),
            rank: index + 1
        }));

        return {
            query: originalQuery,
            totalResults: formattedDocs.length,
            documents: formattedDocs,
            searchTime: Date.now()
        };
    }

    /**
     * Format REST API results
     */
    formatRESTResults(objects, originalQuery) {
        if (!objects || objects.length === 0) {
            return {
                query: originalQuery,
                totalResults: 0,
                documents: [],
                searchTime: Date.now()
            };
        }

        const formattedDocs = objects.map((obj, index) => ({
            id: obj.properties.content_hash,
            filename: obj.properties.filename,
            filepath: obj.properties.filepath,
            content: obj.properties.content,
            fileSize: obj.properties.file_size,
            fileExtension: obj.properties.file_extension,
            contentHash: obj.properties.content_hash,
            relevanceScore: 0.8, // Default score for REST API
            preview: this.generatePreview(obj.properties.content, originalQuery),
            rank: index + 1
        }));

        return {
            query: originalQuery,
            totalResults: formattedDocs.length,
            documents: formattedDocs,
            searchTime: Date.now()
        };
    }

    /**
     * Generate content preview with query highlighting
     */
    generatePreview(content, query, maxLength = 300) {
        if (!content) return '';
        
        const queryTerms = query.toLowerCase().split(' ').filter(term => term.length > 2);
        const contentLower = content.toLowerCase();
        
        // Find the best position to start the preview
        let bestIndex = 0;
        let maxMatches = 0;
        
        // Look for sections with the most query term matches
        for (let i = 0; i <= content.length - maxLength; i += 50) {
            const section = content.substring(i, i + maxLength).toLowerCase();
            const matches = queryTerms.reduce((count, term) => {
                return count + (section.includes(term) ? 1 : 0);
            }, 0);
            
            if (matches > maxMatches) {
                maxMatches = matches;
                bestIndex = i;
            }
        }
        
        let preview = content.substring(bestIndex, bestIndex + maxLength);
        
        // Clean up the preview
        if (bestIndex > 0) preview = '...' + preview;
        if (bestIndex + maxLength < content.length) preview = preview + '...';
        
        // Highlight query terms
        queryTerms.forEach(term => {
            const regex = new RegExp(`(${term})`, 'gi');
            preview = preview.replace(regex, '<mark>$1</mark>');
        });
        
        return preview;
    }

    /**
     * Validate connection to Weaviate
     */
    async testConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/v1/meta`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'X-OpenAI-Api-Key': this.openai_api_key || ''
                }
            });
            
            if (response.ok) {
                const meta = await response.json();
                return {
                    connected: true,
                    version: meta.version,
                    hostname: meta.hostname
                };
            } else {
                return {
                    connected: false,
                    error: `HTTP ${response.status}`
                };
            }
        } catch (error) {
            return {
                connected: false,
                error: error.message
            };
        }
    }
}

// Export for both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WeaviateSearch;
} else if (typeof window !== 'undefined') {
    window.WeaviateSearch = WeaviateSearch;
}