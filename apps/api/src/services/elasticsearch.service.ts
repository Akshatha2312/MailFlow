import { Client } from '@elastic/elasticsearch';
import { Logger } from '@mailflow/shared';

const esNode = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';

const client = new Client({
  node: esNode,
  requestTimeout: 3000,
});

export const EMAIL_JOBS_INDEX = 'mailflow_emails';

export interface EmailJobIndexDocument {
  id: string;
  userId: string;
  senderId: string;
  senderEmail?: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt?: string | null;
  failedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchEmailJobsOptions {
  userId: string;
  query?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export class ElasticsearchService {
  /**
   * Ensures the mailflow_emails Elasticsearch index exists with correct mappings
   */
  static async ensureIndex(): Promise<void> {
    try {
      const exists = await client.indices.exists({ index: EMAIL_JOBS_INDEX });
      if (!exists) {
        await client.indices.create({
          index: EMAIL_JOBS_INDEX,
          body: {
            mappings: {
              properties: {
                id: { type: 'keyword' },
                userId: { type: 'keyword' },
                senderId: { type: 'keyword' },
                senderEmail: { type: 'keyword' },
                recipient: { type: 'text', fields: { keyword: { type: 'keyword' } } },
                subject: { type: 'text' },
                body: { type: 'text' },
                status: { type: 'keyword' },
                scheduledAt: { type: 'date' },
                sentAt: { type: 'date' },
                failedAt: { type: 'date' },
                createdAt: { type: 'date' },
                updatedAt: { type: 'date' },
              },
            },
          },
        });
        Logger.info(` Created Elasticsearch index '${EMAIL_JOBS_INDEX}' successfully.`);
      }
    } catch (err) {
      Logger.warn(`ElasticsearchService: Unable to ensure index '${EMAIL_JOBS_INDEX}': ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Asynchronously indexes or updates an email job record in Elasticsearch.
   * Swallows connection errors so email delivery is never impacted by ES outages.
   */
  static async indexEmailJob(doc: EmailJobIndexDocument): Promise<boolean> {
    try {
      await client.index({
        index: EMAIL_JOBS_INDEX,
        id: doc.id,
        document: doc,
        refresh: 'wait_for',
      });
      return true;
    } catch (err) {
      Logger.warn(`ElasticsearchService: Failed to index document ${doc.id}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Full-text multi-match search over recipient, subject, and body, strictly filtered by userId.
   */
  static async searchEmailJobs(options: SearchEmailJobsOptions): Promise<{
    data: EmailJobIndexDocument[];
    total: number;
    page: number;
    limit: number;
    fromElasticsearch: boolean;
  } | null> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const from = (page - 1) * limit;

    try {
      const mustClauses: any[] = [{ term: { userId: options.userId } }];

      if (options.status) {
        mustClauses.push({ term: { status: options.status.toUpperCase() } });
      }

      if (options.query && options.query.trim() !== '') {
        mustClauses.push({
          multi_match: {
            query: options.query,
            fields: ['recipient^3', 'subject^2', 'body'],
            fuzziness: 'AUTO',
          },
        });
      }

      const response = await client.search({
        index: EMAIL_JOBS_INDEX,
        from,
        size: limit,
        body: {
          query: {
            bool: {
              must: mustClauses,
            },
          },
          sort: [{ scheduledAt: { order: 'desc' } }],
        },
      });

      const hits = response.hits.hits || [];
      const total = typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value || 0;

      const data = hits.map((hit) => hit._source as EmailJobIndexDocument);

      return {
        data,
        total,
        page,
        limit,
        fromElasticsearch: true,
      };
    } catch (err) {
      Logger.warn(`ElasticsearchService: Search query failed or node offline. Falling back to PostgreSQL.`);
      return null;
    }
  }
}
