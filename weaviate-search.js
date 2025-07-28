/**
 * Weaviate Search Client - Concise semantic document search
 */
class WeaviateSearch {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || 'https://zlpipialqvivotmfurmzpw.c0.asia-southeast1.gcp.weaviate.cloud';
        this.collection = config.collection || 'Document';
        this.defaultLimit = config.defaultLimit || 5;
    }

    setCredentials(apiKey) { this.apiKey = apiKey; }
    setOpenAIKey(openaiKey) { this.openai_api_key = openaiKey; }

    validateKeys() {
        if (!this.apiKey) throw new Error('Weaviate API key not set');
        if (!this.openai_api_key) throw new Error('OpenAI API key not set');
    }

    async request(endpoint, options = {}) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
                'X-OpenAI-Api-Key': this.openai_api_key
            },
            ...options
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        return response.json();
    }

    async searchDocuments(query, options = {}) {
        this.validateKeys();
        const limit = options.limit || this.defaultLimit;
        
        const data = await this.request('/v1/graphql', {
            body: JSON.stringify({
                query: `{
                    Get {
                        Document(nearText: { concepts: ["${query}"] } limit: ${limit}) {
                            filename filepath content file_size content_hash
                            _additional { distance }
                        }
                    }
                }`
            })
        });

        if (data.errors) throw new Error(`GraphQL: ${data.errors.map(e => e.message).join(', ')}`);
        return this.formatResults(data.data.Get.Document, query);
    }

    async getDocumentCount() {
        this.validateKeys();
        const data = await this.request('/v1/graphql', {
            body: JSON.stringify({
                query: '{ Aggregate { Document { meta { count } } } }'
            })
        });
        return data.data?.Aggregate?.Document?.[0]?.meta?.count || 0;
    }

    formatResults(documents, query) {
        if (!documents?.length) return { query, totalResults: 0, documents: [] };
        
        return {
            query,
            totalResults: documents.length,
            documents: documents.map((doc, i) => ({
                id: doc.content_hash,
                filename: doc.filename,
                filepath: doc.filepath,
                content: doc.content,
                fileSize: doc.file_size,
                relevanceScore: doc._additional?.distance ? (1 - doc._additional.distance) : 0,
                preview: this.generatePreview(doc.content, query),
                rank: i + 1
            }))
        };
    }

    generatePreview(content, query, maxLength = 300) {
        if (!content) return '';
        
        const terms = query.toLowerCase().split(' ').filter(t => t.length > 2);
        const bestStart = this.findBestPreviewStart(content, terms, maxLength);
        
        let preview = content.substring(bestStart, bestStart + maxLength);
        if (bestStart > 0) preview = '...' + preview;
        if (bestStart + maxLength < content.length) preview += '...';
        
        return terms.reduce((p, term) => 
            p.replace(new RegExp(`(${term})`, 'gi'), '<mark>$1</mark>'), preview);
    }

    findBestPreviewStart(content, terms, maxLength) {
        let bestStart = 0, maxMatches = 0;
        
        for (let i = 0; i <= content.length - maxLength; i += 50) {
            const section = content.substring(i, i + maxLength).toLowerCase();
            const matches = terms.reduce((count, term) => count + (section.includes(term) ? 1 : 0), 0);
            if (matches > maxMatches) {
                maxMatches = matches;
                bestStart = i;
            }
        }
        return bestStart;
    }
}

// Make available globally
window.WeaviateSearch = WeaviateSearch;