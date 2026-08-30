import { Client } from '@elastic/elasticsearch';
import { validateEnv } from '@mailflow/shared';

const env = validateEnv();

export const elasticClient = new Client({
  node: env.ELASTICSEARCH_NODE,
});
